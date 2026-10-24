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
import { join } from "node:path";

const INDEX_VERSION = 1;
const SHARE_ID = /^[A-Za-z0-9_-]{8,64}$/;

/** A share id that cannot be guessed: 12 base64url characters, 72 bits. */
export function newShareId() {
  return randomBytes(9).toString("base64url");
}

/** Reject ids that could escape the share directory before they reach a path. */
export function isShareId(value) {
  return typeof value === "string" && SHARE_ID.test(value);
}

/** Atomic-ish write: a same-directory rename keeps readers from seeing a torn file. */
async function writeAtomic(path, text) {
  const temporary = `${path}.${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(temporary, text, "utf8");
  await rename(temporary, path);
}

/**
 * Open the share store rooted at `root`.
 * @param options - `root` directory (created on demand).
 */
export function createShareStore(options) {
  const root = options.root;
  const indexFile = join(root, "index.json");
  const pendingDir = join(root, 'pending-publications');
  let queue = Promise.resolve();

  /** Serialize index read-modify-write cycles. */
  function exclusive(task) {
    const run = queue.then(task, task);
    queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async function readIndex() {
    try {
      const raw = await readFile(indexFile, "utf8");
      const parsed = JSON.parse(raw);
      const shares = parsed !== null && typeof parsed === "object" && typeof parsed.shares === "object" && parsed.shares !== null ? parsed.shares : {};
      // A publication response may have arrived just before the process died
      // while committing the index. Recover its deletion keys from the journal.
      try {
        for (const filename of await readdir(pendingDir)) {
          if (!filename.endsWith('.json')) continue;
          const id = filename.slice(0, -5);
          if (!isShareId(id) || !Object.hasOwn(shares, id)) continue;
          try {
            const patch = JSON.parse(await readFile(join(pendingDir, filename), 'utf8'));
            if (patch && typeof patch === 'object' && !Array.isArray(patch)) shares[id] = { ...shares[id], ...patch };
          } catch { /* One damaged journal must not hide all other shares. */ }
        }
      } catch { /* The committed index remains usable if the journal is absent. */ }
      return { version: INDEX_VERSION, shares };
    } catch (error) {
      if (error?.code === "ENOENT") return { version: INDEX_VERSION, shares: {} };
      return { version: INDEX_VERSION, shares: {} };
    }
  }

  async function writeIndex(index) {
    await mkdir(root, { recursive: true });
    await writeAtomic(indexFile, JSON.stringify(index, null, 2));
  }

  return {
    root,
    readIndex,
    /** Persist remote management keys before committing the main index. */
    async stagePublication(id, patch) {
      if (!isShareId(id)) throw new Error('Invalid share id');
      await mkdir(pendingDir, { recursive: true });
      await writeAtomic(join(pendingDir, id + '.json'), JSON.stringify(patch));
    },

    /** The newest share of one session, if any. */
    async newestForSession(sessionId) {
      const index = await readIndex();
      const rows = Object.values(index.shares).filter((row) => row.sessionId === sessionId);
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
      const { sessionId, ...persisted } = snapshot;
      const record = { ...persisted, sharedAt: snapshot.sharedAt ?? Date.now() };
      await mkdir(root, { recursive: true });
      await writeAtomic(join(root, `${record.id}.json`), JSON.stringify(record));
      await exclusive(async () => {
        const index = await readIndex();
        index.shares[record.id] = {
          id: record.id,
          sessionId,
          title: record.title,
          sharedAt: record.sharedAt,
          createdAt: record.createdAt,
          messageCount: record.messageCount,
          lastSeq: record.lastSeq,
          contentHash: record.contentHash,
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
        if (row === undefined) return undefined;
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
      await rm(join(root, `${id}.json`), { force: true }).catch(() => undefined);
      await exclusive(async () => {
        const index = await readIndex();
        if (Object.hasOwn(index.shares, id)) {
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
      const missing = Object.keys(index.shares).filter((id) => present.has(id) === false);
      if (missing.length === 0) return 0;
      await exclusive(async () => {
        const fresh = await readIndex();
        for (const id of missing) delete fresh.shares[id];
        await writeIndex(fresh);
      });
      return missing.length;
    },
  };
}
