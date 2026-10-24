/**
 * A public tunnel in front of the share hub, with two interchangeable carriers.
 *
 * The point of this module is what it does *not* expose: the tunnel targets the
 * hub (snapshot pages only), never the Web GUI, and the hostname handed out
 * (`<random>.lhr.life` or `<random>.trycloudflare.com`) carries no address, port
 * or machine name of the operator.
 *
 * - `ssh` (default) needs no download at all: an OpenSSH reverse forward to
 *   localhost.run yields `https://<opaque>.lhr.life` in a couple of seconds;
 * - `cloudflared` runs a Cloudflare quick tunnel when the binary is available,
 *   downloading it once (resumably) when it is not.
 * @module dsh-share/tunnel
 */

import { spawn } from "node:child_process";
import { chmodSync, closeSync, createWriteStream, mkdirSync, openSync, readSync, statSync, writeFileSync } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { join } from "node:path";

/** Hostnames that belong to the provider itself, never to a tunnel. */
const RESERVED = new Set(["admin", "www", "docs", "blog", "api", "status", "help", "support"]);

/**
 * Find the public origin inside a carrier's log text.
 *
 * localhost.run prints its banner (with its own `admin.localhost.run` link)
 * before the tunnel line, so the announcement line wins when present and any
 * reserved provider name is ignored.
 * @param text - one chunk of carrier output.
 * @returns the public origin, or undefined.
 */
function findPublicUrl(text) {
  const announced = text.match(/tunneled with tls termination[^\n]*?(https:\/\/\S+)/i);
  if (announced !== null) return announced[1];
  const pattern = /https:\/\/([a-z0-9][a-z0-9-]{3,40})\.(lhr\.life|localhost\.run|trycloudflare\.com)\b/gi;
  for (const match of text.matchAll(pattern)) {
    if (RESERVED.has(match[1].toLowerCase()) === false) return match[0];
  }
  return undefined;
}

/** Release assets by platform/arch, for the cloudflared carrier. */
function assetName() {
  const arch = process.arch === "arm64" ? "arm64" : "amd64";
  if (process.platform === "win32") return `cloudflared-windows-${arch}.exe`;
  if (process.platform === "darwin") return `cloudflared-darwin-${arch}.tgz`;
  return `cloudflared-linux-${arch}`;
}

/** Mirrors tried in order before the canonical release host. */
function downloadUrls() {
  const asset = assetName();
  const canonical = `https://github.com/cloudflare/cloudflared/releases/latest/download/${asset}`;
  return [`https://ghproxy.net/${canonical}`, `https://gh-proxy.com/${canonical}`, canonical];
}

/** First two bytes of a file, used to recognise a Windows executable. */
function readHead(path) {
  try {
    const buffer = Buffer.alloc(2);
    const descriptor = openSync(path, "r");
    try {
      readSync(descriptor, buffer, 0, 2, 0);
    } finally {
      closeSync(descriptor);
    }
    return buffer.toString("latin1");
  } catch {
    return "";
  }
}

/**
 * Download one file into `target`, resuming from whatever is already on disk.
 * A dropped connection costs nothing already received.
 */
async function downloadFile(target, log, onProgress) {
  const urls = downloadUrls();
  let have = 0;
  try {
    have = statSync(target).size;
  } catch {
    have = 0;
  }
  if (have > 0) log(`resuming cloudflared download at ${Math.round(have / 1048576)} MB`);
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const url = urls[Math.min(attempt, urls.length - 1)];
    let total;
    try {
      const response = await fetch(url, { redirect: "follow", headers: have > 0 ? { range: `bytes=${have}-` } : {} });
      if (response.ok === false || response.body === null) throw new Error(`HTTP ${response.status}`);
      const range = response.headers.get("content-range");
      const length = response.headers.get("content-length");
      if (typeof range === "string" && range.includes("/")) total = Number(range.split("/")[1]) || undefined;
      else if (typeof length === "string") total = have + (Number(length) || 0);
      const source = Readable.fromWeb(response.body);
      let received = have;
      let reported = 0;
      source.on("data", (chunk) => {
        received += chunk.length;
        if (total !== undefined && received - reported > 1048576) {
          reported = received;
          onProgress?.(Math.min(99, Math.round((received / total) * 100)), received);
        }
      });
      await pipeline(source, createWriteStream(target, { flags: have > 0 ? "a" : "w" }));
    } catch (error) {
      log(`download attempt ${attempt + 1} via ${new URL(url).host}: ${String(error?.message ?? error).slice(0, 100)}`);
    }
    try {
      have = statSync(target).size;
    } catch {
      have = 0;
    }
    if (total !== undefined && have >= total) {
      log(`cloudflared downloaded (${Math.round(have / 1048576)} MB)`);
      return have;
    }
    onProgress?.(total === undefined ? undefined : Math.min(99, Math.round((have / total) * 100)), have);
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error(`could not download cloudflared (have ${Math.round(have / 1048576)} MB)`);
}

/** Persist the pinned public origin the Host mints links under. */
export function writePinnedBase(directory, url) {
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "public-base-url.txt"), `${url}\n`, "utf8");
}

/**
 * The tunnel manager: one tunnel at a time, supervised, either carrier.
 *
 * A link is only published once the public hostname actually answers, and a
 * carrier that dies is restarted with backoff so an already-shared link keeps
 * working for the reader instead of failing silently.
 * @param options - `cacheDir`, `provider` ("auto" | "ssh" | "cloudflared"), `log`.
 */
export function createTunnelManager(options) {
  const log = options.log ?? (() => {});
  const cacheDir = options.cacheDir;
  const providerPreference = options.provider ?? "auto";
  const binaryPath = options.binaryPath ?? join(cacheDir, process.platform === "win32" ? "cloudflared.exe" : "cloudflared");
  let child;
  let desired = false;
  let target;
  let restarts = 0;
  let state = { phase: "stopped", url: undefined, provider: undefined, progress: undefined, lastError: undefined };
  const listeners = new Set();

  const publish = (next) => {
    state = { ...state, ...next };
    for (const listener of listeners) {
      try {
        listener(state);
      } catch {
        /* a listener must never break the manager */
      }
    }
  };

  /** Ensure the cloudflared executable exists; download it once, resuming on retry. */
  async function ensureCloudflared() {
    try {
      const stats = statSync(binaryPath);
      if (stats.size > 1024 * 1024 && (process.platform !== "win32" || readHead(binaryPath) === "MZ")) return binaryPath;
    } catch {
      /* fall through to download */
    }
    mkdirSync(cacheDir, { recursive: true });
    publish({ phase: "downloading", progress: 0 });
    await downloadFile(binaryPath, log, (progress) => publish({ phase: "downloading", progress }));
    if (process.platform !== "win32") {
      try {
        chmodSync(binaryPath, 0o755);
      } catch {
        /* best effort */
      }
    }
    return binaryPath;
  }

  /** Resolve the carrier for this start. */
  async function chooseProvider() {
    if (providerPreference === "ssh") return "ssh";
    if (providerPreference === "cloudflared") return "cloudflared";
    try {
      if (statSync(binaryPath).size > 1024 * 1024) return "cloudflared";
    } catch {
      /* no cached binary yet */
    }
    return "ssh";
  }

  /** Wait until the public hostname answers at all (the edge lags the hostname by a few seconds). */
  async function waitReachable(url) {
    const deadline = Date.now() + 30000;
    let attempts = 0;
    while (Date.now() < deadline) {
      attempts += 1;
      try {
        const response = await fetch(`${url}/share/__reachability__`, { headers: { "user-agent": "dsh-share/1" } });
        await response.text();
        if (response.status < 500) return attempts;
      } catch {
        /* the edge is not routing to this tunnel yet */
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    throw new Error("public hostname did not answer within 30s");
  }

  /** Spawn one carrier and resolve with the public origin once it reports a hostname. */
  async function spawnCarrier(provider) {
    const port = Number(new URL(target).port);
    const args =
      provider === "ssh"
        ? [
            "-T",
            "-o", "StrictHostKeyChecking=accept-new",
            "-o", `UserKnownHostsFile=${join(cacheDir, "known_hosts")}`,
            "-o", "ExitOnForwardFailure=yes",
            "-o", "ServerAliveInterval=20",
            "-o", "ServerAliveCountMax=3",
            "-R", `80:127.0.0.1:${port}`,
            "nokey@localhost.run",
          ]
        : [
            "tunnel",
            "--no-autoupdate",
            // QUIC rides UDP, which many networks throttle or drop; HTTP/2 over
            // TCP is the reliable carrier and IPv4 avoids a broken IPv6 path.
            "--protocol", process.env.DSH_SHARE_CLOUDFLARED_PROTOCOL ?? "http2",
            "--edge-ip-version", process.env.DSH_SHARE_CLOUDFLARED_EDGE ?? "4",
            "--url", target,
          ];
    const command = provider === "ssh" ? "ssh" : await ensureCloudflared();
    mkdirSync(cacheDir, { recursive: true });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        try {
          child?.kill();
        } catch {
          /* already gone */
        }
        reject(new Error(`${provider} did not report a hostname within 45s`));
      }, 45000);
      child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
      let settled = false;
      const onData = (chunk) => {
        const chunkText = String(chunk);
        const last = chunkText.trim().split("\n").filter((line) => line.trim() !== "").slice(-1)[0];
        if (last !== undefined && last.length < 200) log(`[${provider}] ${last}`);
        if (settled) return;
        const found = findPublicUrl(chunkText);
        if (found !== undefined) {
          settled = true;
          clearTimeout(timer);
          resolve(found);
        }
      };
      child.stdout?.on("data", onData);
      child.stderr?.on("data", onData);
      child.on("error", (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      });
      child.on("exit", (code) => {
        if (settled === false) {
          settled = true;
          clearTimeout(timer);
          reject(new Error(`${provider} exited with code ${code}`));
          return;
        }
        if (desired === false) return;
        // The link was already handed out: bring the tunnel back rather than
        // leave a shared page dead.
        restarts += 1;
        if (restarts > 5) {
          publish({ phase: "failed", url: undefined, lastError: `${provider} kept exiting (code ${code})` });
          return;
        }
        const delay = Math.min(15000, 1500 * 2 ** restarts);
        publish({ phase: "restarting", lastError: `${provider} exited (code ${code})` });
        log(`tunnel exited, restarting in ${delay}ms (attempt ${restarts})`);
        setTimeout(() => {
          if (desired) void launch().catch((error) => log(`restart failed: ${String(error?.message ?? error)}`));
        }, delay);
      });
    });
  }

  /** One full launch: pick a carrier, spawn it, wait until the hostname answers. */
  async function launch() {
    publish({ phase: "starting", url: undefined, progress: undefined });
    const provider = await chooseProvider();
    publish({ provider });
    const url = await spawnCarrier(provider);
    publish({ phase: "connecting", url });
    const attempts = await waitReachable(url);
    if (desired === false) return { url, provider };
    restarts = 0;
    publish({ phase: "running", url, progress: undefined, lastError: undefined });
    log(`public share origin: ${url} (${provider}, reachable after ${attempts} probe${attempts === 1 ? "" : "s"})`);
    return { url, provider };
  }

  return {
    /** Current state snapshot. */
    state: () => ({ ...state }),
    /** Subscribe to state changes; returns an unsubscribe function. */
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** Whether a tunnel process is alive. */
    isRunning: () => child !== undefined && child.exitCode === null,

    /**
     * Start the tunnel toward the hub and resolve with its public origin once
     * the hostname is actually reachable.
     * @param targetUrl - loopback URL of the share hub.
     * @returns `{ url, provider }`.
     */
    async start(targetUrl) {
      if (desired && this.isRunning() && state.url !== undefined && state.phase === "running") {
        return { url: state.url, provider: state.provider };
      }
      await this.stop();
      desired = true;
      target = targetUrl;
      restarts = 0;
      return launch();
    },

    /** Stop the tunnel and any pending restart. */
    async stop() {
      desired = false;
      const running = child;
      child = undefined;
      if (running !== undefined && running.exitCode === null) {
        try {
          running.kill();
        } catch {
          /* already gone */
        }
        await new Promise((resolve) => {
          const timer = setTimeout(resolve, 4000);
          running.once("exit", () => {
            clearTimeout(timer);
            resolve();
          });
        });
      }
      if (state.phase !== "stopped") publish({ phase: "stopped", url: undefined });
    },
  };
}
