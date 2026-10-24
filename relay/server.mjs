/**
 * dsh-share relay — a tiny, dependency-free share host.
 *
 * Deploy this once (any VPS, a container, a NAS, even a Raspberry Pi) and every
 * DSH user pointing at it can publish a conversation page and hand out a plain
 * link: `https://<relay>/s/<id>`. Readers need nothing; the author's machine can
 * be switched off; nobody signs up.
 *
 *   node server.mjs            # listens on 0.0.0.0:8787 by default
 *
 * Environment:
 *   RELAY_PORT       listen port (default 8787)
 *   RELAY_HOST       bind address (default 0.0.0.0)
 *   RELAY_DATA_DIR   where pages are stored (default ./data)
 *   RELAY_BASE_URL   public origin used in returned links (default http://localhost:<port>)
 *   RELAY_MAX_MB     largest accepted page (default 4)
 *   RELAY_TTL_HOURS  default retention for pages that do not ask for one (default 720 = 30d)
 *   RELAY_MAX_TOTAL_MB  refuse uploads once the data dir exceeds this (default 2048)
 *
 * Protocol (all JSON):
 *   POST   /v1/share            { html, title?, ttlSeconds? } -> { id, url, deleteToken, expiresAt }
 *   DELETE /v1/share/<id>       Authorization: Bearer <deleteToken> -> 204
 *   GET    /v1/share/<id>/meta  -> { title, createdAt, expiresAt }
 *   GET    /s/<id>              -> the page (text/html, noindex, CSP locked)
 *   GET    /healthz             -> { ok: true, pages, bytes }
 */
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

const PORT = Number(process.env.RELAY_PORT ?? 8787);
const HOST = process.env.RELAY_HOST ?? "0.0.0.0";
const DATA_DIR = process.env.RELAY_DATA_DIR ?? join(process.cwd(), "data");
const BASE_URL = (process.env.RELAY_BASE_URL ?? `http://localhost:${PORT}`).replace(/\/+$/, "");
const MAX_BYTES = Number(process.env.RELAY_MAX_MB ?? 4) * 1024 * 1024;
const DEFAULT_TTL_SECONDS = Number(process.env.RELAY_TTL_HOURS ?? 720) * 3600;
const MAX_TOTAL_BYTES = Number(process.env.RELAY_MAX_TOTAL_MB ?? 2048) * 1024 * 1024;

const CSP =
  "default-src 'none'; style-src 'unsafe-inline'; img-src data:; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'";
const ID_PATTERN = /^[A-Za-z0-9_-]{10,40}$/;

/** New page id: URL-safe, 96 bits, unguessable. */
function newId() {
  return randomBytes(12).toString("base64url");
}

/** Hash a delete token so the stored copy is not a usable credential. */
function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

async function ensureDir() {
  await mkdir(DATA_DIR, { recursive: true });
}

/** Total size of the data dir, used for the global cap. */
async function usage() {
  let bytes = 0;
  let pages = 0;
  try {
    for (const name of await readdir(DATA_DIR)) {
      if (name.endsWith(".json") === false) continue;
      pages += 1;
      bytes += (await stat(join(DATA_DIR, name))).size;
    }
  } catch {
    /* empty dir */
  }
  return { pages, bytes };
}

/** Drop expired pages on each request; cheap for the small counts involved. */
async function sweep() {
  try {
    const now = Date.now();
    for (const name of await readdir(DATA_DIR)) {
      if (name.endsWith(".json") === false) continue;
      const path = join(DATA_DIR, name);
      try {
        const record = JSON.parse(await readFile(path, "utf8"));
        if (typeof record.expiresAt === "number" && record.expiresAt > 0 && now > record.expiresAt) await rm(path, { force: true });
      } catch {
        await rm(path, { force: true });
      }
    }
  } catch {
    /* nothing to sweep */
  }
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req, limit) {
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        resolve(undefined);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", () => resolve(undefined));
  });
}

function notFound(res) {
  const body = '<!doctype html><meta charset="utf-8"><title>Not Found</title><body style="font:16px system-ui;padding:48px;text-align:center;color:#666">页面不存在或已过期。</body>';
  res.writeHead(404, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

const server = createServer(async (req, res) => {
  const url = new URL(String(req.url ?? "/"), "http://relay.invalid");
  const path = url.pathname;

  if (path === "/healthz") {
    const { pages, bytes } = await usage();
    return sendJson(res, 200, { ok: true, pages, bytes, maxBytes: MAX_TOTAL_BYTES });
  }

  if (path === "/v1/share" && req.method === "POST") {
    const { pages: pageCount, bytes } = await usage();
    if (bytes > MAX_TOTAL_BYTES) return sendJson(res, 507, { ok: false, code: "relay-full", pages: pageCount });
    const text = await readBody(req, MAX_BYTES);
    if (text === undefined) return sendJson(res, 413, { ok: false, code: "too-large" });
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      return sendJson(res, 400, { ok: false, code: "bad-json" });
    }
    const html = typeof body?.html === "string" ? body.html : "";
    if (html.length < 32) return sendJson(res, 400, { ok: false, code: "empty" });
    if (Buffer.byteLength(html) > MAX_BYTES) return sendJson(res, 413, { ok: false, code: "too-large" });
    const ttlSeconds = Number(body?.ttlSeconds) > 0 ? Number(body.ttlSeconds) : DEFAULT_TTL_SECONDS;
    const id = newId();
    const deleteToken = randomBytes(18).toString("base64url");
    const record = {
      id,
      title: typeof body?.title === "string" ? body.title.slice(0, 200) : "",
      createdAt: Date.now(),
      expiresAt: ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : 0,
      deleteTokenHash: hashToken(deleteToken),
      bytes: Buffer.byteLength(html),
      html,
    };
    await ensureDir();
    await writeFile(join(DATA_DIR, `${id}.json`), JSON.stringify(record), "utf8");
    void sweep();
    return sendJson(res, 200, {
      ok: true,
      id,
      url: `${BASE_URL}/s/${id}`,
      deleteToken,
      expiresAt: record.expiresAt,
    });
  }

  if (path.startsWith("/v1/share/") && req.method === "DELETE") {
    const rest = path.slice("/v1/share/".length);
    const id = rest.split("/")[0];
    if (ID_PATTERN.test(id) === false) return sendJson(res, 400, { ok: false, code: "bad-id" });
    const file = join(DATA_DIR, `${id}.json`);
    let record;
    try {
      record = JSON.parse(await readFile(file, "utf8"));
    } catch {
      return sendJson(res, 404, { ok: false, code: "not-found" });
    }
    const header = String(req.headers.authorization ?? "");
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (token === "" || hashToken(token) !== record.deleteTokenHash) return sendJson(res, 403, { ok: false, code: "forbidden" });
    await rm(file, { force: true });
    res.writeHead(204, { "cache-control": "no-store" });
    res.end();
    return;
  }

  if (path.startsWith("/v1/share/") && path.endsWith("/meta")) {
    const id = path.slice("/v1/share/".length, -"/meta".length);
    if (ID_PATTERN.test(id) === false) return sendJson(res, 400, { ok: false, code: "bad-id" });
    try {
      const record = JSON.parse(await readFile(join(DATA_DIR, `${id}.json`), "utf8"));
      return sendJson(res, 200, { ok: true, title: record.title, createdAt: record.createdAt, expiresAt: record.expiresAt });
    } catch {
      return sendJson(res, 404, { ok: false, code: "not-found" });
    }
  }

  if (path.startsWith("/s/")) {
    const id = path.slice("/s/".length).replace(/\/+$/, "");
    if (ID_PATTERN.test(id) === false) return notFound(res);
    let record;
    try {
      record = JSON.parse(await readFile(join(DATA_DIR, `${id}.json`), "utf8"));
    } catch {
      return notFound(res);
    }
    if (typeof record.expiresAt === "number" && record.expiresAt > 0 && Date.now() > record.expiresAt) {
      await rm(join(DATA_DIR, `${id}.json`), { force: true });
      return notFound(res);
    }
    res.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": CSP,
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      "x-robots-tag": "noindex, nofollow, noarchive",
      "cache-control": "no-cache",
      "content-length": Buffer.byteLength(record.html),
    });
    res.end(record.html);
    return;
  }

  return sendJson(res, 404, { ok: false, code: "not-found" });
});

await ensureDir();
server.listen(PORT, HOST, () => {
  console.log(`[relay] listening on ${HOST}:${PORT} · base ${BASE_URL} · data ${DATA_DIR}`);
});
