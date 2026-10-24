/**
 * dsh-share — public read-only conversation links for the DSH Web GUI.
 *
 * Two surfaces, deliberately separated:
 *
 * - the **GUI origin** (where the browser already is) carries the management
 *   routes: create, revoke, list, and the tunnel switch. They sit behind the
 *   Host's own cookie + Host/Origin fence;
 * - the **public hub** is a second, minimal listener that answers only
 *   `/share/<id>`. A tunnel points at that hub, never at the GUI, so the public
 *   hostname is an opaque `*.trycloudflare.com` that reveals no address, port,
 *   or machine name, and answers nothing but snapshot pages.
 *
 * A snapshot is immutable and pre-scrubbed: no session id, no working
 * directory, no system prompt, no tool traffic, and no local paths.
 * @module dsh-share
 */

import { homedir, hostname } from "node:os";
import { basename, join } from "node:path";
import { readFileSync, rmSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";

import { EmptyConversationError, buildShareTranscript } from "./transcript.js";
import { escapeHtml } from "./markdown.js";
import { makeRedactor, redactMessages } from "./redact.js";
import { renderSharePage } from "./render.js";
import { renderShareApp } from "./render-app.js";
import { createShareStore, isShareId, newShareId } from "./store.js";
import { startHub } from "./hub.js";
import { createTunnelManager, writePinnedBase } from "./tunnel.js";
import { publishAuto, toMarkdown, unpublishGist, unpublishNeocities, unpublishRelay } from "./publish.js";
import { publishHtmlHoster, unpublishHtmlHoster } from './htmlhoster.js';
import { BREWPAGE_TTL_CHOICES, publishBrewPage, unpublishBrewPage } from './brewpage.js';

/** Cordis function-plugin name. */
const name = "share";
/** Only the route carrier is mandatory; the session readers are resolved optionally. */
const inject = ["webServer"];

/** Request bodies are tiny JSON objects; anything larger is hostile. */
const MAX_BODY_BYTES = 64 * 1024;

const DEFAULTS = {
  prefix: "/share",
  baseUrl: "",
  siteName: "DeepSeek Harness",
  includeReasoning: false,
  includeTools: false,
  maxMessages: 1000,
  dedupe: true,
  redactPaths: true,
  /** Loopback port of the public hub the tunnel points at. */
  hubPort: 49702,
  /** Tunnel carrier: "auto" prefers a cached cloudflared, else the download-free ssh carrier. */
  tunnelProvider: "auto",
  /**
   * Whether the 「生成公网链接」 action may put one snapshot behind a tunnel.
   *
   * It stays an explicit per-share click: nothing is published on its own, and
   * the tunnel only ever fronts the share hub — never the Web GUI.
   */
  publicTunnel: false,
  /** Days a snapshot stays readable; 0 keeps it until it is revoked. */
  ttlDays: 0,
  /**
   * Where a permanent (machine-independent) link may be published.
   * "none" keeps that button hidden; "gist" uploads a secret GitHub gist.
   */
  publishProvider: "auto",
  /** GitHub token with the gist scope; only read from config or the environment. */
  githubToken: "",
  /**
   * A deployed dsh-share relay (see relay/server.mjs). When set, every share
   * becomes a plain link served by that relay: any reader can open it, this
   * machine can be switched off, and no per-user account or bucket is involved.
   */
  relayUrl: "",
  /** A separate, explicitly labelled button. Never used by the default action. */
  htmlhosterEnabled: true,
  brewpageEnabled: true,
  /**
   * Free static host that answers from mainland networks: a Neocities account
   * (e-mail + password, no card) gives `https://<site>.neocities.org` space.
   */
  neocitiesUser: "",
  neocitiesPassword: "",
  neocitiesSite: "",
};

/** Normalize the public prefix to `/segment` form. */
function normalizePrefix(value) {
  const raw = typeof value === "string" && value.trim() !== "" ? value.trim() : DEFAULTS.prefix;
  const withSlash = raw.startsWith("/") ? raw : `/${raw}`;
  return withSlash.replace(/\/+$/, "") || DEFAULTS.prefix;
}

/** Resolve the DSH home directory without importing a Home-paths package. */
function resolveHome(ctx) {
  if (typeof process.env.DSH_HOME === "string" && process.env.DSH_HOME !== "") return process.env.DSH_HOME;
  const paths = typeof ctx?.get === "function" ? ctx.get("homePaths") : undefined;
  for (const key of ["dshHome", "home", "root", "base"]) {
    const value = paths?.[key];
    if (typeof value === "string" && value !== "") return value;
  }
  try {
    const value = paths?.dshHomePath?.();
    if (typeof value === "string" && value !== "") return value;
  } catch {
    /* fall through to the conventional location */
  }
  return join(homedir(), ".dsh");
}

/** Read a bounded request body as UTF-8 text; null when it exceeds the ceiling. */
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        chunks.length = 0;
        resolve(null);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/** JSON response helper. */
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

/** HTML response helper with the snapshot page's locked-down policy. */
function sendHtml(res, status, html, head) {
  res.writeHead(status, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "content-security-policy":
      "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'self'",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "content-length": Buffer.byteLength(html),
  });
  if (head === true) res.end();
  else res.end(html);
}

/**
 * Gate the management routes behind the browser trust fence.
 *
 * `ctx.connection.requestRejection` is the composition's own Host/Origin and
 * cookie check; when a composition has no connection service the routes stay
 * usable from this machine only.
 */
function managementRejection(ctx, req) {
  const connection = typeof ctx?.get === "function" ? ctx.get("connection") : undefined;
  if (typeof connection?.requestRejection === "function") {
    try {
      const rejection = connection.requestRejection(req);
      if (typeof rejection === "number") return rejection;
      if (rejection === undefined) return undefined;
    } catch {
      return 403;
    }
  }
  const address = req.socket?.remoteAddress ?? "";
  const loopback = address === "::1" || address.startsWith("127.") || address.startsWith("::ffff:127.");
  if (!loopback) return 403;
  try {
    const host = new URL(`http://${req.headers.host}`);
    const hostname = host.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    if (!(hostname === 'localhost' || hostname === '::1' || /^127\.(?:\d{1,3}\.){2}\d{1,3}$/.test(hostname))) return 403;
    if (req.headers['sec-fetch-site'] === 'cross-site') return 403;
    if (req.headers.origin !== undefined) {
      const origin = new URL(req.headers.origin);
      if (!['http:', 'https:'].includes(origin.protocol) || origin.host.toLowerCase() !== host.host.toLowerCase()) return 403;
    }
    return undefined;
  } catch { return 403; }
}

/** A loopback host means "this machine only", never a shareable address. */
function isLoopbackHost(host) {
  const value = String(host ?? "").replace(/^\[|\]$/g, "").split(":")[0];
  return value === "" || value === "localhost" || value === "::1" || value.startsWith("127.");
}

/** The optional public origin pinned for this host (tunnel or own domain). */
function pinnedBaseUrl(home) {
  try {
    const text = readFileSync(join(home, "shares", "public-base-url.txt"), "utf8");
    const first = text.split(/\r?\n/, 1)[0].trim();
    return first === "" ? undefined : first.replace(/\/+$/, "");
  } catch {
    return undefined;
  }
}

/**
 * Public base URL for links, most specific source first:
 * pinned tunnel/hostname, explicit `config.baseUrl`, a non-loopback request
 * Host, then the bound origin.
 */
function originOf(ctx, config, req, home) {
  const pinned = pinnedBaseUrl(home);
  if (pinned !== undefined) return pinned;
  if (config.baseUrl !== "") return config.baseUrl.replace(/\/+$/, "");
  const host = req.headers.host;
  if (typeof host === "string" && host !== "" && isLoopbackHost(host) === false) {
    const secure = ctx.webServer?.protocol === "https:";
    return `${secure ? "https" : "http"}://${host}`;
  }
  if (typeof host === "string" && host !== "") {
    const secure = ctx.webServer?.protocol === "https:";
    return `${secure ? "https" : "http"}://${host}`;
  }
  try {
    const origin = ctx.webServer?.getOrigin?.();
    if (typeof origin === "string" && origin !== "") return origin.replace(/\/+$/, "");
  } catch {
    /* the port may not be bound yet on an early request */
  }
  return "";
}

/** Parse a JSON body object. */
async function jsonBody(req) {
  const text = await readBody(req);
  if (text === null) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed !== null && typeof parsed === "object" && Array.isArray(parsed) === false ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Host plugin body: store, hub, tunnel, routes.
 * @param ctx - host context carrying `webServer`.
 * @param config - profile row config; every field has a default.
 */
function apply(ctx, config) {
  const settings = { ...DEFAULTS, ...(config ?? {}) };
  const prefix = normalizePrefix(settings.prefix);
  const home = resolveHome(ctx);
  const sharesDir = join(home, "shares");
  const store = createShareStore({ root: sharesDir });
  const log = (line) => {
    try {
      console.log(`[dsh-share] ${line}`);
    } catch {
      /* logging must never fail the plugin */
    }
  };
  /** Token for permanent publishing, resolved from config or the environment only. */
  const publishToken = () => {
    if (settings.publishProvider === "none") return undefined;
    const configured = typeof settings.githubToken === "string" ? settings.githubToken.trim() : "";
    if (configured !== "") return configured;
    const fromEnv = [process.env.GITHUB_TOKEN, process.env.GH_TOKEN].find((value) => typeof value === "string" && value !== "");
    return fromEnv;
  };

  /** Forget the pinned public origin (tunnel gone). */
  const clearPinned = () => {
    try {
      rmSync(join(sharesDir, "public-base-url.txt"), { force: true });
    } catch {
      /* nothing pinned */
    }
  };
  const tunnel = createTunnelManager({
    cacheDir: join(home, "cache", "dsh-share"),
    provider: settings.tunnelProvider,
    log,
  });
  // Pin whatever public origin the tunnel currently serves, so a link minted
  // from a loopback page is still reachable — and drop it when the tunnel goes.
  tunnel.subscribe((state) => {
    try {
      if (state.phase === "running" && typeof state.url === "string") writePinnedBase(sharesDir, state.url);
      else if (state.phase === "stopped" || state.phase === "starting") clearPinned();
    } catch (error) {
      log(`could not update pinned base: ${String(error?.message ?? error).slice(0, 120)}`);
    }
  });
  let hub;
  /** Start the public hub on first use and remember its origin. */
  const ensureHub = async () => {
    if (hub !== undefined) return hub;
    try {
      hub = await startHub({ port: settings.hubPort, store, siteName: settings.siteName, log });
    } catch (error) {
      // A busy port must not cost the feature: fall back to an OS-assigned one.
      log(`hub port ${settings.hubPort} unavailable (${String(error?.message ?? error).slice(0, 80)}); using a free port`);
      hub = await startHub({ port: 0, store, siteName: settings.siteName, log });
    }
    log(`public hub listening on ${hub.origin}`);
    return hub;
  };

  if (typeof ctx.effect === "function") {
    ctx.effect(
      () => () => {
        void tunnel.stop();
        void hub?.close?.();
      },
      "share: hub and tunnel",
    );
  }

  // A quick-tunnel hostname does not survive a restart, so a pinned base that no
  // running tunnel backs would quietly produce dead links. Drop it at load.
  if (pinnedBaseUrl(home) !== undefined) {
    clearPinned();
    log("dropped a pinned public origin with no tunnel behind it");
  }

  const publications = new Map();
  const publicationTargets = new Map();

  /** Register one route under a labeled effect when the context supports effects. */
  const register = (label, route) => {
    const install = () => ctx.webServer.register(route);
    const guard = (error) => {
      if (String(error?.message ?? error).includes("duplicate") === false) throw error;
    };
    if (typeof ctx.effect === "function") {
      try {
        ctx.effect(install, label);
        return;
      } catch (error) {
        guard(error);
        return;
      }
    }
    try {
      install();
    } catch (error) {
      guard(error);
    }
  };

  register(`share: POST ${prefix}/create`, {
    kind: "exact",
    path: `${prefix}/create`,
    handler: async (req, res) => {
      const rejection = managementRejection(ctx, req);
      if (rejection !== undefined) return sendJson(res, rejection, { ok: false, code: "forbidden" });
      if (req.method !== "POST") return sendJson(res, 405, { ok: false, code: "method-not-allowed" });
      const body = await jsonBody(req);
      const sessionId = typeof body?.sessionId === "string" ? body.sessionId.trim() : "";
      if (sessionId === "" || sessionId.length > 200) return sendJson(res, 400, { ok: false, code: "bad-session" });
      let transcript;
      try {
        transcript = await buildShareTranscript(ctx, sessionId, settings);
      } catch (error) {
        if (error instanceof EmptyConversationError) return sendJson(res, 422, { ok: false, code: "empty-conversation" });
        return sendJson(res, 404, {
          ok: false,
          code: "session-unreadable",
          message: String(error?.message ?? error).slice(0, 300),
        });
      }
      if (settings.redactPaths !== false) {
        const redact = makeRedactor({
          cwd: transcript.cwd,
          home: homedir(),
          dshHome: home,
          profileDir: process.env.DSH_PROFILE_DIR,
          userName: basename(homedir()),
          hostName: hostname(),
        });
        redactMessages(transcript.messages, redact);
        transcript.title = redact(transcript.title ?? '');
        transcript.redacted = true;
        // The working directory is a location fact: it scrubs the text and is
        // then dropped, so the stored snapshot carries no path at all.
        delete transcript.cwd;
      }
      const contentHash = createHash('sha256').update(JSON.stringify({ title: transcript.title, messages: transcript.messages })).digest('hex');
      try {
        if (settings.dedupe) {
          const existing = await store.newestForSession(sessionId);
          if (existing !== undefined && await store.read(existing.id) !== undefined && existing.contentHash === contentHash) {
            return sendJson(res, 200, {
              ok: true,
              reused: true,
              id: existing.id,
              url: `${originOf(ctx, settings, req, home)}${prefix}/${existing.id}`,
              title: existing.title,
              sharedAt: existing.sharedAt,
              messageCount: existing.messageCount,
            });
          }
        }
        const id = newShareId();
        const ttlDays = Number(settings.ttlDays) > 0 ? Number(settings.ttlDays) : 0;
        const record = await store.create({
          id,
          ...transcript,
          contentHash,
          expiresAt: ttlDays > 0 ? Date.now() + ttlDays * 86400000 : 0,
        });
        return sendJson(res, 200, {
          ok: true,
          reused: false,
          id,
          url: `${originOf(ctx, settings, req, home)}${prefix}/${id}`,
          title: record.title,
          sharedAt: record.sharedAt,
          messageCount: record.messageCount,
        });
      } catch (error) {
        return sendJson(res, 500, { ok: false, code: "store-failed", message: String(error?.message ?? error).slice(0, 300) });
      }
    },
  });

  register(`share: POST ${prefix}/revoke`, {
    kind: "exact",
    path: `${prefix}/revoke`,
    handler: async (req, res) => {
      const rejection = managementRejection(ctx, req);
      if (rejection !== undefined) return sendJson(res, rejection, { ok: false, code: "forbidden" });
      if (req.method !== "POST") return sendJson(res, 405, { ok: false, code: "method-not-allowed" });
      const body = await jsonBody(req);
      const id = typeof body?.id === "string" ? body.id : "";
      if (isShareId(id) === false) return sendJson(res, 400, { ok: false, code: "bad-id" });
      // Revoking a share also retires the hosted copy, so nothing lingers.
      try { if (publications.has(id)) await publications.get(id); }
      catch { return sendJson(res, 502, { ok: false, code: 'publish-pending', message: '发布尚未完成，请稍后重试撤销。' }); }
      const row = (await store.readIndex()).shares?.[id];
      if (row?.publishedProvider === 'brewpage') {
        const removed = await unpublishBrewPage({ id: row.brewpageId, namespace: row.brewpageNamespace, ownerToken: row.brewpageOwnerToken, url: row.publishedUrl });
        if (!removed) return sendJson(res, 502, { ok: false, code: 'remote-revoke-failed', message: 'BrewPage 尚未确认删除；已保留管理凭据，请稍后重试。' });
      }
      if (row?.publishedProvider === 'htmlhoster') {
        const removed = await unpublishHtmlHoster({ id: row.htmlhosterId, deleteToken: row.htmlhosterDeleteToken, url: row.publishedUrl });
        if (!removed) return sendJson(res, 502, { ok: false, code: 'remote-revoke-failed', message: '托管页面尚未确认删除；已保留删除凭据，请稍后重试。' });
      }
      if (typeof row?.gistId === "string") {
        const token = publishToken();
        if (token !== undefined) await unpublishGist({ token, gistId: row.gistId }).catch(() => undefined);
      }
      if (typeof row?.neocitiesFile === "string") {
        await unpublishNeocities({
          username: settings.neocitiesUser,
          password: settings.neocitiesPassword,
          filename: row.neocitiesFile,
        }).catch(() => undefined);
      }
      if (typeof row?.relayId === "string" && typeof row?.relayDeleteToken === "string") {
        const removed = await unpublishRelay({
          relayUrl: row.relayBaseUrl ?? settings.relayUrl,
          id: row.relayId,
          deleteToken: row.relayDeleteToken,
        }).catch(() => false);
        if (!removed) return sendJson(res, 502, { ok: false, code: 'remote-revoke-failed', message: '云端撤销失败，已保留删除凭据，请重试。' });
      }
      const removed = await store.remove(id);
      return sendJson(res, removed ? 200 : 404, { ok: removed });
    },
  });

  register(`share: GET ${prefix}/list`, {
    kind: "exact",
    path: `${prefix}/list`,
    handler: async (req, res) => {
      const rejection = managementRejection(ctx, req);
      if (rejection !== undefined) return sendJson(res, rejection, { ok: false, code: "forbidden" });
      if (req.method !== "GET") return sendJson(res, 405, { ok: false, code: "method-not-allowed" });
      const url = new URL(String(req.url ?? "/"), "http://localhost");
      const sessionId = url.searchParams.get("sessionId") ?? "";
      if (sessionId === "") return sendJson(res, 400, { ok: false, code: "bad-session" });
      const rows = await store.listForSession(sessionId);
      const origin = originOf(ctx, settings, req, home);
      return sendJson(res, 200, {
        ok: true,
        shares: rows.map((row) => ({ id: row.id, title: row.title, sharedAt: row.sharedAt, messageCount: row.messageCount, url: `${origin}${prefix}/${row.id}`, publishedUrl: row.publishedUrl, publishedProvider: row.publishedProvider, expiresAt: row.publishedExpiresAt, ttlDays: row.publishedTtlDays })),
      });
    },
  });

  register(`share: POST ${prefix}/publish`, {
    kind: "exact",
    path: `${prefix}/publish`,
    handler: async (req, res) => {
      const rejection = managementRejection(ctx, req);
      if (rejection !== undefined) return sendJson(res, rejection, { ok: false, code: "forbidden" });
      if (req.method !== "POST") return sendJson(res, 405, { ok: false, code: "method-not-allowed" });
      if (settings.publishProvider === "none") return sendJson(res, 403, { ok: false, code: "publish-disabled" });
      const body = await jsonBody(req);
      if (body?.provider !== undefined && !['htmlhoster', 'brewpage'].includes(body.provider)) return sendJson(res, 400, { ok: false, code: 'bad-provider' });
      const useHtmlHoster = body?.provider === 'htmlhoster';
      const useBrewPage = body?.provider === 'brewpage';
      const ttlDays = useBrewPage ? (body.ttlDays ?? 7) : undefined;
      if (useBrewPage && settings.brewpageEnabled === false) return sendJson(res, 403, { ok: false, code: 'provider-disabled' });
      if (useBrewPage && !BREWPAGE_TTL_CHOICES.includes(ttlDays)) return sendJson(res, 400, { ok: false, code: 'bad-ttl', message: '请选择 1、3、7 或 30 天。' });
      const target = useBrewPage ? 'brewpage' : useHtmlHoster ? 'htmlhoster' : settings.publishProvider === 'auto' ? 'relay' : settings.publishProvider;
      if (target === 'relay' && !settings.relayUrl) return sendJson(res, 503, { ok: false, code: 'relay-not-configured', message: '请先配置自己的中转地址，或明确选择 BrewPage 限时分享。' });
      const publicationTarget = useBrewPage ? `${target}:${ttlDays}` : target;
      if (useHtmlHoster && (settings.htmlhosterEnabled === false || Number(settings.ttlDays) > 0)) return sendJson(res, 403, { ok: false, code: 'provider-disabled', message: 'HTML Hoster 未启用，或当前配置要求自动到期。' });
      const id = typeof body?.id === "string" ? body.id : "";
      if (isShareId(id) === false) return sendJson(res, 400, { ok: false, code: "bad-id" });
      const snapshot = await store.read(id);
      if (snapshot === undefined) return sendJson(res, 404, { ok: false, code: "not-found" });
      try {
        if (publications.has(id) && publicationTargets.get(id) !== publicationTarget) return sendJson(res, 409, { ok: false, code: 'publish-pending', message: '另一个托管通道或有效期正在发布，请等待完成。' });
        if (!publications.has(id)) publicationTargets.set(id, publicationTarget);
        if (!publications.has(id)) publications.set(id, (async () => {
        const row = (await store.readIndex()).shares[id];
        if (typeof row?.publishedUrl === 'string' && row.publishedProvider !== target) throw new Error('此快照已发布到其他托管；请先撤销原分享，再选择新通道。');
        if (['relay', 'htmlhoster', 'brewpage'].includes(row?.publishedProvider) && typeof row.publishedUrl === 'string') {
          const check = await fetch(row.publishedUrl, { method: 'HEAD', redirect: 'error', signal: AbortSignal.timeout(8000) });
          if (check.ok) {
            if (useBrewPage && row.publishedTtlDays !== ttlDays) throw new Error('已发布链接的有效期不能更改；请先撤销，再选择新的有效期。');
            return { ok: true, url: row.publishedUrl, provider: row.publishedProvider, revocable: true, expiresAt: row.publishedExpiresAt ?? 0, ttlDays: row.publishedTtlDays };
          }
          if (check.status !== 404) throw new Error('云端分享状态检查失败，请稍后重试。');
        }
        const providers = settings.publishProvider === 'auto'
          ? ['relay']
          : [settings.publishProvider];
        const publish = useBrewPage ? publishBrewPage : useHtmlHoster ? publishHtmlHoster : publishAuto;
        const published = await publish({
          snapshot: { title: snapshot.title, messages: snapshot.messages },
          html: renderSharePage(useBrewPage ? { ...snapshot, expiresAt: Date.now() + ttlDays * 86400000 } : snapshot, { siteName: settings.siteName }),
          ttlDays,
          markdown: toMarkdown(snapshot),
          title: `${settings.siteName}: ${snapshot.title ?? id}`,
          filename: `share-${id}.html`,
          token: publishToken(),
          relayUrl: settings.relayUrl,
          neocitiesUser: settings.neocitiesUser,
          neocitiesPassword: settings.neocitiesPassword,
          neocitiesSite: settings.neocitiesSite,
          ttlSeconds: Number(settings.ttlDays) > 0 ? Number(settings.ttlDays) * 86400 : undefined,
          editCode: randomBytes(6).toString("hex"),
          providers,
        });
        const publication = {
          publishedProvider: published.provider,
          publishedUrl: published.url,
          gistId: published.gistId,
          relayId: published.provider === 'relay' ? published.id : undefined,
          relayDeleteToken: published.provider === 'relay' ? published.deleteToken : undefined,
          htmlhosterId: published.provider === 'htmlhoster' ? published.id : undefined,
          htmlhosterDeleteToken: published.provider === 'htmlhoster' ? published.deleteToken : undefined,
          brewpageId: published.provider === 'brewpage' ? published.id : undefined,
          brewpageNamespace: published.provider === 'brewpage' ? published.namespace : undefined,
          brewpageOwnerToken: published.provider === 'brewpage' ? published.ownerToken : undefined,
          relayBaseUrl: settings.relayUrl,
          publishedExpiresAt: published.expiresAt ?? 0,
          publishedTtlDays: published.ttlDays,
          neocitiesFile: published.provider === "neocities" ? published.filename : undefined,
          rentryEditCode: published.editCode,
          publishRevocable: published.revocable === true,
        };
        await store.stagePublication(id, publication);
        await store.update(id, publication);
        return {
          ok: true,
          url: published.url,
          provider: published.provider,
          revocable: published.revocable === true,
          editUrl: published.editUrl ?? null,
          expiresAt: published.expiresAt ?? 0,
          ttlDays: published.ttlDays,
        };
        })().finally(() => { publications.delete(id); publicationTargets.delete(id); }));
        return sendJson(res, 200, await publications.get(id));
      } catch (error) {
        const reason = String(error?.message ?? error).slice(0, 300);
        return sendJson(res, 502, { ok: false, code: "publish-failed", message: reason });
      }
    },
  });

  register(`share: tunnel status`, {
    kind: "exact",
    path: `${prefix}/tunnel/status`,
    handler: async (req, res) => {
      const rejection = managementRejection(ctx, req);
      if (rejection !== undefined) return sendJson(res, rejection, { ok: false, code: "forbidden" });
      const state = tunnel.state();
      return sendJson(res, 200, {
        ok: true,
        allowed: settings.publicTunnel !== false,
        publish: {
          allowed: settings.publishProvider !== "none" && (settings.publishProvider !== 'auto' && settings.publishProvider !== 'relay' || Boolean(settings.relayUrl)),
          provider: settings.publishProvider,
          token: publishToken() !== undefined,
          relay: typeof settings.relayUrl === "string" && settings.relayUrl !== "",
          neocities: typeof settings.neocitiesUser === "string" && settings.neocitiesUser !== "",
          htmlhoster: settings.htmlhosterEnabled !== false && !(Number(settings.ttlDays) > 0) && settings.publishProvider !== 'none',
          brewpage: settings.brewpageEnabled !== false && settings.publishProvider !== 'none',
        },
        phase: state.phase,
        url: state.url,
        provider: state.provider ?? null,
        progress: state.progress ?? null,
        hubPort: settings.hubPort,
        pinned: pinnedBaseUrl(home) ?? null,
        lastError: state.lastError ?? null,
      });
    },
  });

  register(`share: tunnel start`, {
    kind: "exact",
    path: `${prefix}/tunnel/start`,
    handler: async (req, res) => {
      const rejection = managementRejection(ctx, req);
      if (rejection !== undefined) return sendJson(res, rejection, { ok: false, code: "forbidden" });
      if (req.method !== "POST") return sendJson(res, 405, { ok: false, code: "method-not-allowed" });
      if (settings.publicTunnel === false) {
        // Fail closed: no snapshot reaches the internet unless the profile asked.
        return sendJson(res, 403, { ok: false, code: "public-tunnel-disabled" });
      }
      try {
        const publicHub = await ensureHub();
        const { url, provider } = await tunnel.start(publicHub.origin);
        writePinnedBase(sharesDir, url);
        return sendJson(res, 200, { ok: true, url, provider, hubPort: publicHub.port });
      } catch (error) {
        const message = String(error?.message ?? error).slice(0, 400);
        log(`tunnel start failed: ${message}`);
        return sendJson(res, 502, { ok: false, code: "tunnel-failed", message });
      }
    },
  });

  register(`share: tunnel stop`, {
    kind: "exact",
    path: `${prefix}/tunnel/stop`,
    handler: async (req, res) => {
      const rejection = managementRejection(ctx, req);
      if (rejection !== undefined) return sendJson(res, rejection, { ok: false, code: "forbidden" });
      if (req.method !== "POST") return sendJson(res, 405, { ok: false, code: "method-not-allowed" });
      await tunnel.stop();
      clearPinned();
      return sendJson(res, 200, { ok: true, phase: "stopped" });
    },
  });

  register(`share: GET ${prefix}/<id>`, {
    kind: "prefix",
    path: prefix,
    handler: async (req, res) => {
      if (req.method !== "GET" && req.method !== "HEAD") return sendJson(res, 405, { ok: false, code: "method-not-allowed" });
      const url = new URL(String(req.url ?? "/"), "http://localhost");
      const rest = url.pathname.slice(prefix.length).replace(/^\/+/, "").replace(/\/+$/, "");
      if (rest === "" || rest === "create" || rest === "revoke" || rest === "list" || rest.startsWith("tunnel/")) {
        return sendHtml(
          res,
          404,
          '<!doctype html><meta charset="utf-8"><title>链接不完整</title><body style="font:16px system-ui;padding:48px;text-align:center;color:#666">这个分享链接不完整。</body>',
          req.method === "HEAD",
        );
      }
      // `<id>/download` hands the reader a single self-contained file they can
      // keep or forward — no host, no network, no tunnel involved.
      // `<id>/app` streams the whole interactive conversation as one file;
      // `<id>/download` streams the plain page. Neither touches any storage
      // outside this machine: the file is built and sent in one request.
      const app = rest.endsWith("/app");
      const download = app === false && rest.endsWith("/download");
      const id = app ? rest.slice(0, -"/app".length) : download ? rest.slice(0, -"/download".length) : rest;
      if (id === "" || id.includes("/")) return sendHtml(res, 404, shareMissingPage(), req.method === "HEAD");
      const snapshot = await store.read(id);
      if (snapshot === undefined) return sendHtml(res, 404, shareMissingPage(), req.method === "HEAD");
      const html =
        app === true
          ? renderShareApp(snapshot, { siteName: settings.siteName })
          : renderSharePage(snapshot, { siteName: settings.siteName });
      if (app === false && download === false) return sendHtml(res, 200, html, req.method === "HEAD");
      const filename = `share-${id}.html`;
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        "content-length": Buffer.byteLength(html),
      });
      res.end(req.method === "HEAD" ? undefined : html);
    },
  });
}

/** 404 page for an unknown or revoked share. */
function shareMissingPage() {
  return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>链接已失效</title></head><body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font:16px/1.7 -apple-system,\'Segoe UI\',\'Microsoft YaHei\',sans-serif;color:#5c6470"><div style="text-align:center;padding:32px"><div style="font-size:20px;font-weight:600;color:#1f2328;margin-bottom:8px">分享链接不存在或已被撤销</div><div style="font-size:14px">请向分享者索取新的链接。</div></div></body></html>';
}

export { apply, inject, name };
export { escapeHtml };
