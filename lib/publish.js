/**
 * Publish a snapshot to a host that outlives this Host.
 *
 * A tunnel makes the operator's machine the origin, so its link only lives
 * while the tunnel runs. These providers hand the page to somebody else so the
 * machine can be switched off. All of them but the gist need **no account**, so
 * any DSH user can share without setting anything up first:
 *
 * - `telegraph` — anonymous, permanent page with clean typography;
 * - `rentry` — anonymous markdown paste, editable/deletable with its edit code;
 * - `gist` — only when a GitHub token is configured; deletable by API.
 *
 * The chain picks the first provider that answers on this network.
 * @module dsh-share/publish
 */
import { markdownToTelegraphNodes, toMarkdown } from "./share-md.js";
import { validateHtml } from './hosting-http.js';

const GITHUB_API = "https://api.github.com";
const TELEGRAPH_API = "https://api.telegra.ph";
const RENTRY = "https://rentry.co";

/** Per-attempt ceiling: a blocked host must not stall the whole publish. */
const ATTEMPT_TIMEOUT_MS = 20000;

/** A blocked host is usually blocked at TCP level, so failing fast matters. */
const PREFLIGHT_TIMEOUT_MS = 4000;

/** First URL each provider must reach before an upload is worth attempting. */
const PREFLIGHT = {
  gist: "https://api.github.com",
  neocities: "https://neocities.org/api/list?path=",
  rentry: "https://rentry.co/",
  telegraph: "https://api.telegra.ph/",
};

/**
 * Check that a provider's own host answers at all.
 * A network that blocks the host would otherwise burn the full attempt timeout.
 * @returns true when the host answered (any HTTP status counts).
 */
export async function reachable(provider, fetchImpl, override) {
  const target = override ?? PREFLIGHT[provider];
  if (target === undefined) return true;
  const call = fetchImpl ?? fetch;
  try {
    await withTimeout(async (signal) => {
      const response = await call(target, { method: "HEAD", redirect: "manual", signal });
      await response.text().catch(() => "");
    }, PREFLIGHT_TIMEOUT_MS);
    return true;
  } catch {
    return false;
  }
}

/** Run one attempt with its own abort timer. */
async function withTimeout(task, milliseconds) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), milliseconds);
  try {
    return await task(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

/** GitHub requires a user agent; every request carries the plugin's own. */
function githubHeaders(token) {
  return {
    authorization: `Bearer ${token}`,
    accept: "application/vnd.github+json",
    "user-agent": "dsh-share",
    "x-github-api-version": "2022-11-28",
  };
}

/**
 * Upload one page as a secret gist (needs a token).
 * @returns `{ provider, url, gistId, revocable }`.
 */
export async function publishGist(options) {
  const call = options.fetchImpl ?? fetch;
  const filename = options.filename ?? "snapshot.html";
  return withTimeout(async (signal) => {
    const response = await call(`${GITHUB_API}/gists`, {
      method: "POST",
      headers: { ...githubHeaders(options.token), "content-type": "application/json" },
      signal,
      body: JSON.stringify({
        description: options.title ?? "DeepSeek Harness conversation snapshot",
        public: false,
        files: { [filename]: { content: options.html } },
      }),
    });
    if (response.ok === false) {
      const detail = await response.text().catch(() => "");
      throw new Error(`gist HTTP ${response.status} ${detail.slice(0, 120)}`);
    }
    const gist = await response.json();
    const owner = gist?.owner?.login;
    const gistId = gist?.id;
    if (typeof owner !== "string" || typeof gistId !== "string") throw new Error("gist returned no id/owner");
    return {
      provider: "gist",
      gistId,
      revocable: true,
      url: `https://gist.githack.com/${owner}/${gistId}/raw/${filename}`,
      fallbackUrl: gist?.files?.[filename]?.raw_url,
    };
  }, ATTEMPT_TIMEOUT_MS);
}

/**
 * Publish anonymously on Telegraph. Returns a permanent page URL.
 * @returns `{ provider, url, revocable, editUrl }`.
 */
export async function publishTelegraph(options) {
  const call = options.fetchImpl ?? fetch;
  return withTimeout(async (signal) => {
    const account = await call(`${TELEGRAPH_API}/createAccount?short_name=dsh-share&author_name=DeepSeek`, { signal });
    const accountBody = await account.json();
    const token = accountBody?.result?.access_token;
    if (accountBody?.ok !== true || typeof token !== "string") throw new Error("telegraph account refused");
    const page = await call(`${TELEGRAPH_API}/createPage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal,
      body: JSON.stringify({
        access_token: token,
        title: options.title ?? "DeepSeek Harness 对话分享",
        author_name: "DeepSeek Harness",
        content: markdownToTelegraphNodes(options.markdown),
        return_content: false,
      }),
    });
    const pageBody = await page.json();
    const url = pageBody?.result?.url;
    if (pageBody?.ok !== true || typeof url !== "string") throw new Error("telegraph page refused");
    return { provider: "telegraph", url, revocable: false, editUrl: `https://edit.telegra.ph/${pageBody.result.path}` };
  }, ATTEMPT_TIMEOUT_MS);
}

/** Extract the CSRF token and cookies rentry hands to an anonymous visitor. */
function rentrySession(response, html) {
  const csrf = html.match(/name="csrfmiddlewaretoken" value="([^"]+)"/)?.[1];
  const cookies = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  return { csrf, cookie: cookies.map((entry) => entry.split(";")[0]).join("; ") };
}

/**
 * Publish anonymously on rentry (markdown). The edit code is the only way to
 * change or delete it later, so it is returned with the URL.
 * @returns `{ provider, url, revocable, editCode }`.
 */
export async function publishRentry(options) {
  const call = options.fetchImpl ?? fetch;
  const editCode = options.editCode;
  return withTimeout(async (signal) => {
    const landing = await call(`${RENTRY}/`, { signal });
    const html = await landing.text();
    const session = rentrySession(landing, html);
    if (typeof session.csrf !== "string") throw new Error("rentry csrf missing");
    const form = new URLSearchParams({
      csrfmiddlewaretoken: session.csrf,
      text: options.markdown,
      edit_code: editCode,
    });
    const created = await call(`${RENTRY}/api/new`, {
      method: "POST",
      signal,
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        referer: `${RENTRY}/`,
        cookie: session.cookie,
      },
      body: form,
    });
    const text = (await created.text()).trim();
    let url;
    try {
      url = JSON.parse(text)?.content;
    } catch {
      url = text.match(/https?:\/\/rentry\.co\/[^\s"'<>]+/)?.[0];
    }
    if (typeof url !== "string" || url.includes("rentry.co") === false) throw new Error(`rentry refused: ${text.slice(0, 120)}`);
    return { provider: "rentry", url, revocable: true, editCode, editUrl: `${url}/edit` };
  }, ATTEMPT_TIMEOUT_MS);
}

/**
 * Delete one published gist. Telegraph pages cannot be deleted; rentry needs
 * its edit code on the site itself.
 * @returns whether the remote copy is gone.
 */
export async function unpublishGist(options) {
  const call = options.fetchImpl ?? fetch;
  return withTimeout(async (signal) => {
    const response = await call(`${GITHUB_API}/gists/${encodeURIComponent(options.gistId)}`, {
      method: "DELETE",
      headers: githubHeaders(options.token),
      signal,
    });
    return response.ok === true || response.status === 404;
  }, ATTEMPT_TIMEOUT_MS);
}

/**
 * Publish to a dsh-share relay: the only mode where a plain link works for
 * anybody, needs no account, and survives this machine being switched off.
 *
 * Deploy `relay/server.mjs` once and point every DSH at it; every user then
 * shares through that one service instead of their own storage.
 * @returns `{ provider: "relay", url, id, deleteToken, revocable } `.
 */
export async function publishRelay(options) {
  validateHtml(options.html);
  const call = options.fetchImpl ?? fetch;
  const base = String(options.relayUrl ?? "").replace(/\/+$/, "");
  if (base === "") throw new Error("no relay configured");
  const endpoint = new URL(base);
  if (!['http:','https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error('Invalid relay URL');
  return withTimeout(async (signal) => {
    const response = await call(`${base}/v1/share`, {
      method: "POST",
      redirect: 'error',
      headers: { "content-type": "application/json" },
      signal,
      body: JSON.stringify({ html: options.html, snapshot: options.snapshot, title: options.title ?? "", ttlSeconds: options.ttlSeconds }),
    });
    const body = await response.json().catch(() => ({}));
    if (response.ok === false || body?.ok !== true) throw new Error(response.status === 403 ? '分享服务被网络防护拦截（HTTP 403），请更换可达的 relayUrl 或网络后重试。' : `relay HTTP ${response.status} ${String(body?.code ?? "").slice(0, 40)}`);
    if (typeof body.id !== 'string' || typeof body.deleteToken !== 'string') throw new Error('relay returned no management credentials');
    const publicUrl = new URL(body.url);
    if (!['http:', 'https:'].includes(publicUrl.protocol) || publicUrl.origin !== new URL(base).origin || !publicUrl.pathname.startsWith('/s/')) throw new Error('relay returned an invalid public URL');
    return { provider: "relay", url: publicUrl.href, id: body.id, deleteToken: body.deleteToken, expiresAt: body.expiresAt ?? 0, revocable: true };
  }, ATTEMPT_TIMEOUT_MS);
}

/**
 * Delete one relay page with the token handed out at publish time.
 * @returns whether the page is gone.
 */
export async function unpublishRelay(options) {
  const call = options.fetchImpl ?? fetch;
  const base = String(options.relayUrl ?? "").replace(/\/+$/, "");
  if (base === "" || typeof options.id !== "string" || typeof options.deleteToken !== "string") return false;
  return withTimeout(async (signal) => {
    const response = await call(`${base}/v1/share/${encodeURIComponent(options.id)}`, {
      method: "DELETE",
      redirect: 'error',
      headers: { authorization: `Bearer ${options.deleteToken}` },
      signal,
    });
    return response.ok === true || response.status === 404;
  }, ATTEMPT_TIMEOUT_MS);
}


/** Free static hosting that answers on mainland networks (1 GB, no card). */
const NEOCITIES_API = "https://neocities.org/api";

/**
 * Publish a page to a Neocities site.
 *
 * Neocities is the lightest host that still renders HTML *and* answers from
 * mainland networks: a free account (e-mail + password, no card) owns a
 * `https://<site>.neocities.org` space. The upload is a single authenticated
 * multipart request, and the same account can delete the file again.
 * @param options - `username`, `password`, `site` (defaults to username), `html`, `filename`.
 * @returns `{ provider, url, filename, revocable }`.
 */
export async function publishNeocities(options) {
  const call = options.fetchImpl ?? fetch;
  const filename = options.filename ?? "share.html";
  if (typeof options.username !== "string" || typeof options.password !== "string" || options.username === "") {
    throw new Error("no neocities account configured");
  }
  return withTimeout(async (signal) => {
    const form = new FormData();
    form.append("filedata", new Blob([options.html], { type: "text/html" }), filename);
    const auth = Buffer.from(`${options.username}:${options.password}`).toString("base64");
    const response = await call(`${NEOCITIES_API}/upload`, {
      method: "POST",
      headers: { authorization: `Basic ${auth}` },
      signal,
      body: form,
    });
    const body = await response.json().catch(() => ({}));
    if (response.ok === false || body?.result !== "success") {
      throw new Error(`neocities HTTP ${response.status} ${String(body?.message ?? body?.error_type ?? "").slice(0, 80)}`);
    }
    const site = typeof options.site === "string" && options.site !== "" ? options.site : options.username;
    return { provider: "neocities", url: `https://${site}.neocities.org/${filename}`, filename, site, revocable: true };
  }, ATTEMPT_TIMEOUT_MS);
}

/**
 * Delete one uploaded file from a Neocities site.
 * @returns whether the remote file is gone.
 */
export async function unpublishNeocities(options) {
  const call = options.fetchImpl ?? fetch;
  if (typeof options.username !== "string" || typeof options.password !== "string" || typeof options.filename !== "string") return false;
  return withTimeout(async (signal) => {
    const form = new FormData();
    form.append("filenames[]", options.filename);
    const auth = Buffer.from(`${options.username}:${options.password}`).toString("base64");
    const response = await call(`${NEOCITIES_API}/delete`, {
      method: "POST",
      headers: { authorization: `Basic ${auth}` },
      signal,
      body: form,
    });
    if (response.status === 404) return true;
    const body = await response.json().catch(() => ({}));
    return response.ok === true && body?.result === "success";
  }, ATTEMPT_TIMEOUT_MS);
}
/**
 * Publish through the first provider that works here.
 * @param options - `html`, `markdown`, `title`, optional `token`, `providers`, `fetchImpl`.
 * @returns `{ ok: true, ...result }` from the winning provider.
 * @throws when every provider failed, with one line per attempt.
 */
export async function publishAuto(options) {
  // Configuration must select one destination. Never fall through to a host
  // the user did not choose, even when this module is called directly.
  if (!Array.isArray(options.providers)) options = { ...options, providers: options.relayUrl ? ['relay'] : [] };
  if (options.providers.length !== 1) throw new Error('Choose exactly one publishing provider');
  if (Number(options.ttlSeconds) > 0 && options.providers[0] !== 'relay') throw new Error('This provider cannot enforce automatic expiry');
  const preferred = Array.isArray(options.providers) && options.providers.length > 0 ? options.providers : "auto";
  const chain =
    preferred === "auto"
      ? [
          // A configured relay serves every reader and outlives this machine, so
          // it wins over anything that needs that machine or a per-user account.
          ...(typeof options.relayUrl === "string" && options.relayUrl !== "" ? ["relay"] : []),
          // Neocities is free, renders HTML, and answers from mainland networks.
          ...(typeof options.neocitiesUser === "string" && options.neocitiesUser !== "" ? ["neocities"] : []),
          ...(typeof options.token === "string" && options.token !== "" ? ["gist"] : []),
          // rentry before Telegraph: rentry is deletable with its edit code,
          // while a Telegraph page cannot be taken down afterwards.
          "rentry",
          "telegraph",
        ]
      : preferred;
  const failures = [];
  for (const provider of chain) {
    const preflight = provider === "relay" ? `${String(options.relayUrl ?? "").replace(/\/+$/, "")}/healthz` : undefined;
    if ((await reachable(provider, options.fetchImpl, preflight)) === false) {
      failures.push(`${provider}: host unreachable`);
      continue;
    }
    try {
      if (provider === "relay") return { ok: true, ...(await publishRelay(options)) };
      if (provider === "neocities") {
        return {
          ok: true,
          ...(await publishNeocities({
            ...options,
            username: options.neocitiesUser,
            password: options.neocitiesPassword,
            site: options.neocitiesSite,
          })),
        };
      }
      if (provider === "gist") {
        if (typeof options.token !== "string" || options.token === "") throw new Error("no token configured");
        return { ok: true, ...(await publishGist({ ...options, token: options.token })) };
      }
      if (provider === "telegraph") return { ok: true, ...(await publishTelegraph(options)) };
      if (provider === "rentry") return { ok: true, ...(await publishRentry(options)) };
      throw new Error(`unknown provider ${provider}`);
    } catch (error) {
      failures.push(`${provider}: ${String(error?.message ?? error).slice(0, 90)}`);
    }
  }
  throw new Error(failures.join(" | "));
}

/** Snapshot → markdown, re-exported so callers need one import. */
export { toMarkdown };
