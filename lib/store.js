/**
 * File-backed share snapshots under the DSH home directory.
 *
 * One immutable JSON document per share plus a small index that maps a Session
 * to its shares, so a page request costs one file read and never re-reads the
 * session log. Writes go through a temporary file and a rename, and every
 * index mutation is serialized, so a crash mid-write leaves the previous
 * index readable.
 * @module dsh-share/store
 */

import { randomBytes } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const INDEX_VERSION = 1;
const SHARE_ID = /^[A-Za-z0-9_-]{8,64}$/;
const queues = new Map();

export class ShareStoreError extends Error {
  constructor() { super('分享记录暂时无法读取；原文件与删除凭据已保留，请修复存储后重试。'); this.code = 'store-unavailable'; }
}

/** A 128-bit unguessable id. Existing shorter ids remain readable. */
export function newShareId() {
  return randomBytes(16).toString("base64url");
}

/** Reject ids that could escape the share directory before they reach a path. */
export function isShareId(value) {
  return typeof value === "string" && SHARE_ID.test(value);
}

/** Atomic-ish write: a same-directory rename keeps readers from seeing a torn file. */
async function writeAtomic(path, text) {
  const temporary = `${path}.${randomBytes(4).toString("hex")}.tmp`;
  try {
    await writeFile(temporary, text, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    await rename(temporary, path);
  } finally { await rm(temporary, { force: true }).catch(() => {}); }
}

/**
 * Open the share store rooted at `root`.
 * @param options - `root` directory (created on demand).
 */
export function createShareStore(options) {
  const root = resolve(options.root);
  const indexFile = join(root, "index.json");
  const pendingDir = join(root, 'pending-publications');

  /** Serialize index read-modify-write cycles. */
  function exclusive(task) {
    const run = (queues.get(root) ?? Promise.resolve()).then(task, task);
    const settled = run.then(() => undefined, () => undefined);
    queues.set(root, settled);
    void settled.then(() => { if (queues.get(root) === settled) queues.delete(root); });
    return run;
  }

  async function readIndex() {
    try {
      const raw = await readFile(indexFile, "utf8");
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== INDEX_VERSION || !parsed.shares || typeof parsed.shares !== 'object' || Array.isArray(parsed.shares)) throw new ShareStoreError();
      const shares = parsed.shares;
      for (const [id, row] of Object.entries(shares)) {
        if (!isShareId(id) || !row || row.id !== id || typeof row.sessionId !== 'string') throw new ShareStoreError();
      }
      // A publication response may have arrived just before the process died
      // while committing the index. Recover its deletion keys from the journal.
      try {
        for (const filename of await readdir(pendingDir)) {
          if (!filename.endsWith('.json')) continue;
          const id = filename.slice(0, -5);
          if (!isShareId(id) || !Object.hasOwn(shares, id)) continue;
          const patch = JSON.parse(await readFile(join(pendingDir, filename), 'utf8'));
          if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new ShareStoreError();
          shares[id] = { ...shares[id], ...patch, id, sessionId: shares[id].sessionId };
        }
      } catch (error) { if (error.code !== 'ENOENT') throw new ShareStoreError(); }
      return { version: INDEX_VERSION, shares };
    } catch (error) {
      if (error?.code === "ENOENT") {
        const pending = await readdir(pendingDir).catch(error => { if (error.code === 'ENOENT') return []; throw new ShareStoreError(); });
        if (pending.some(name => name.endsWith('.json'))) throw new ShareStoreError();
        return { version: INDEX_VERSION, shares: {} };
      }
      throw new ShareStoreError();
    }
  }

  async function writeIndex(index) {
    await mkdir(root, { recursive: true, mode: 0o700 });
    await writeAtomic(indexFile, JSON.stringify(index, null, 2));
  }

  return {
    root,
    readIndex,
    /** Persist remote management keys before committing the main index. */
    async stagePublication(id, patch) {
      if (!isShareId(id)) throw new Error('Invalid share id');
      await mkdir(pendingDir, { recursive: true, mode: 0o700 });
      await writeAtomic(join(pendingDir, id + '.json'), JSON.stringify(patch));
    },

    /** The newest share of one session, if any. */
    async newestForSession(sessionId) {
      const index = await readIndex();
      const rows = Object.values(index.shares).filter((row) => row.sessionId === sessionId && !row.customized);
      rows.sort((left, right) => right.sharedAt - left.sharedAt);
      return rows[0];
    },

    /** Every share of one session, newest first. */
    async listForSession(sessionId) {
      const index = await readIndex();
      return Object.values(index.shares)
        .filter((row) => row.sessionId === sessionId)
        .sort((left, right) => right.sharedAt - left.sharedAt);
    },

    /** One stored snapshot including its messages, or undefined when unknown or expired. */
    async read(id) {
      if (isShareId(id) === false) return undefined;
      let parsed;
      try {
        const raw = await readFile(join(root, `${id}.json`), "utf8");
        parsed = JSON.parse(raw);
      } catch {
        return undefined;
      }
      if (parsed === null || typeof parsed !== "object") return undefined;
      // An expired share is indistinguishable from a revoked one.
      if (typeof parsed.expiresAt === "number" && parsed.expiresAt > 0 && Date.now() > parsed.expiresAt) return undefined;
      return parsed;
    },

    /** Store one snapshot and index it; the session id lives only in the index. */
    async create(snapshot) {
      if (!isShareId(snapshot.id) || typeof snapshot.sessionId !== 'string') throw new Error('Invalid share record');
      const { sessionId, ...persisted } = snapshot;
      const record = { ...persisted, sharedAt: snapshot.sharedAt ?? Date.now() };
      await exclusive(async () => {
        const index = await readIndex();
        if (Object.hasOwn(index.shares, record.id)) throw new Error('Share already exists');
        await mkdir(root, { recursive: true, mode: 0o700 });
        await writeAtomic(join(root, `${record.id}.json`), JSON.stringify(record));
        index.shares[record.id] = {
          id: record.id,
          sessionId,
          title: record.title,
          sharedAt: record.sharedAt,
          createdAt: record.createdAt,
          messageCount: record.messageCount,
          lastSeq: record.lastSeq,
          contentHash: record.contentHash,
          expiresAt: record.expiresAt ?? 0,
          customized: record.customized === true,
        };
        await writeIndex(index);
      });
      return record;
    },

    /** Merge facts into one index row (used for the published page). */
    async update(id, patch) {
      if (isShareId(id) === false) return undefined;
      return exclusive(async () => {
        const index = await readIndex();
        const row = index.shares[id];
        if (row === undefined) throw new ShareStoreError();
        index.shares[id] = { ...row, ...patch };
        await writeIndex(index);
        await rm(join(pendingDir, id + '.json'), { force: true });
        return index.shares[id];
      });
    },

    /** Remove one snapshot; returns whether it existed. */
    async remove(id) {
      if (isShareId(id) === false) return false;
      let existed = false;
      await exclusive(async () => {
        const index = await readIndex();
        if (Object.hasOwn(index.shares, id)) {
          await rm(join(root, `${id}.json`), { force: true });
          existed = true;
          delete index.shares[id];
          await writeIndex(index);
          await rm(join(pendingDir, id + '.json'), { force: true });
        }
      });
      return existed;
    },

    /** Drop index rows whose snapshot file vanished (e.g. deleted by hand). */
    async prune() {
      const index = await readIndex();
      const present = new Set();
      try {
        for (const name of await readdir(root)) if (name.endsWith(".json") && name !== "index.json") present.add(name.slice(0, -5));
      } catch {
        return 0;
      }
      const missing = Object.keys(index.shares).filter((id) => !present.has(id) && !index.shares[id].publishedUrl);
      if (missing.length === 0) return 0;
      await exclusive(async () => {
        const fresh = await readIndex();
        for (const id of missing) if (!fresh.shares[id]?.publishedUrl) delete fresh.shares[id];
        await writeIndex(fresh);
      });
      return missing.length;
    },
  };
}
