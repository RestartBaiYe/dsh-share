/**
 * The public share hub: a separate, minimal HTTP listener that serves only
 * snapshot pages.
 *
 * The tunnel points here, never at the Web GUI, so the public hostname answers
 * `/share/<id>` and 404 for everything else: no shell, no `/api`, no plugin
 * assets, no hint of the machine behind it.
 * @module dsh-share/hub
 */

import { createServer } from "node:http";

/** Paths the hub is willing to answer. */
const PREFIX = "/share";

/**
 * Start the hub.
 * @param options - `port`, `host`, `store`, `siteName`, and an optional `log`.
 * @returns `{ port, origin, close }` once the listener is bound.
 */
export async function startHub(options) {
  const host = options.host ?? "127.0.0.1";
  const store = options.store;
  const siteName = options.siteName ?? "DeepSeek Harness";

  const server = createServer((req, res) => {
    // The hub speaks one shape only; every other verb and path is opaque.
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { allow: "GET, HEAD", "content-type": "text/plain; charset=utf-8" });
      res.end("method not allowed");
      return;
    }
    let pathname;
    try {
      pathname = new URL(String(req.url ?? "/"), "http://hub.invalid").pathname;
    } catch {
      res.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
      res.end("bad request");
      return;
    }
    if (pathname !== PREFIX && pathname.startsWith(`${PREFIX}/`) === false) {
      // Deliberately indistinguishable from any other unknown path.
      notFound(res, req.method === "HEAD");
      return;
    }
    const id = pathname.slice(PREFIX.length).replace(/^\/+/, "").replace(/\/+$/, "");
    if (id === "" || id.includes("/")) {
      notFound(res, req.method === "HEAD");
      return;
    }
    store.read(id).then(
      (snapshot) => {
        if (snapshot === undefined) {
          notFound(res, req.method === "HEAD");
          return;
        }
        renderPage().then(
          (renderSharePage) => {
            const html = renderSharePage(snapshot, { siteName });
            res.writeHead(200, {
              "content-type": "text/html; charset=utf-8",
              "cache-control": "no-store",
              "content-security-policy":
                "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'",
              "referrer-policy": "no-referrer",
              "x-content-type-options": "nosniff",
              "content-length": Buffer.byteLength(html),
            });
            res.end(req.method === "HEAD" ? undefined : html);
          },
          () => notFound(res, req.method === "HEAD"),
        );
      },
      () => notFound(res, req.method === "HEAD"),
    );
  });

  /** The renderer is loaded once and cached; a failure here is a plain 404. */
  let rendererPromise;
  const renderPage = () => (rendererPromise ??= import("./render.js").then((module) => module.renderSharePage));

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 0, host, () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : options.port;
  return {
    port,
    origin: `http://${host}:${port}`,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}

/** The one page unknown or revoked links receive. */
function notFound(res, head) {
  const html =
    '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Not Found</title></head><body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font:16px/1.7 -apple-system,system-ui,sans-serif;color:#6b7280"><div style="text-align:center;padding:32px"><div style="font-size:19px;font-weight:600;color:#111827;margin-bottom:6px">页面不存在</div><div style="font-size:14px">链接可能已失效，或本来就是错的。</div></div></body></html>';
  res.writeHead(404, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "content-length": Buffer.byteLength(html),
  });
  res.end(head ? undefined : html);
}
