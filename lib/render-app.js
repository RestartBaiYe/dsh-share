/**
 * Turn a snapshot into one self-contained HTML document that behaves like a web
 * chat rather than a printed page.
 *
 * Nothing is uploaded and nothing is fetched: the styles, the interactions and
 * the whole transcript live inside the file, so the recipient opens it offline
 * and the sender spends no storage anywhere. Forwarding the file is the share.
 * @module dsh-share/render-app
 */

import { escapeHtml, renderMarkdown } from "./markdown.js";

/** Shared look with the served page; the app adds a toolbar and search. */
const STYLES = `
*,*::before,*::after{box-sizing:border-box}
:root{color-scheme:light dark;--bg:#fff;--bg-soft:#f7f8fa;--bg-code:#f4f5f7;--fg:#1a1d21;--fg-soft:#5f6772;
  --fg-faint:#8b939e;--line:#e6e8ec;--line-soft:#eff1f4;--accent:#4d6bfe;--user-bg:#eef2ff;--chip:#f1f3f7;--mark:#ffe58a}
[data-theme=dark]{--bg:#14161a;--bg-soft:#1a1d22;--bg-code:#1e2228;--fg:#e7e9ec;--fg-soft:#a3abb5;--fg-faint:#78808a;
  --line:#2a2f37;--line-soft:#23272e;--accent:#8aa0ff;--user-bg:#222a44;--chip:#232830;--mark:#6b5b1f}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.75 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}
button{font-family:inherit}
.bar{position:sticky;top:0;z-index:20;background:color-mix(in srgb,var(--bg) 88%,transparent);backdrop-filter:saturate(180%) blur(14px);border-bottom:1px solid var(--line-soft)}
.bar .in{max-width:900px;margin:0 auto;padding:10px 16px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.brand{display:flex;align-items:center;gap:9px;font-weight:650;font-size:14.5px;white-space:nowrap}
.dot{width:20px;height:20px;border-radius:6px;background:linear-gradient(140deg,var(--accent),#7f5cff)}
.spacer{flex:1}
.tool{border:.5px solid var(--line);background:var(--bg-soft);color:var(--fg-soft);border-radius:8px;
  height:30px;padding:0 10px;font-size:12px;cursor:pointer;white-space:nowrap}
.tool:hover{background:var(--chip);color:var(--fg)}
.search{flex:1 1 200px;min-width:140px;height:30px;border-radius:8px;border:.5px solid var(--line);
  background:var(--bg-soft);color:inherit;padding:0 10px;font-size:13px}
.wrap{max-width:900px;margin:0 auto;padding:22px 16px 96px}
.intro h1{font-size:26px;line-height:1.3;margin:4px 0 8px;font-weight:680;letter-spacing:-.2px;overflow-wrap:anywhere}
.meta{color:var(--fg-soft);font-size:13px;display:flex;gap:14px;flex-wrap:wrap}
.turn{display:flex;gap:12px;margin:0 0 26px;scroll-margin-top:76px}
.turn.user{justify-content:flex-end}
.av{flex:none;width:26px;height:26px;border-radius:8px;display:flex;align-items:center;justify-content:center;
  font-size:12px;font-weight:700;color:#fff;background:linear-gradient(140deg,#5b6cff,#8f5bff)}
.turn.assistant .av{background:var(--chip);color:var(--fg-soft)}
.col{min-width:0;flex:1}
.turn.user .col{flex:0 1 auto;max-width:86%}
.who{font-size:12px;color:var(--fg-faint);margin:0 0 4px}
.bubble{background:var(--user-bg);border-radius:14px;padding:13px 17px;overflow-wrap:anywhere}
.body{overflow-wrap:anywhere}
.body>*:first-child{margin-top:0}.body>*:last-child{margin-bottom:0}
.body p{margin:0 0 13px}
.body h1,.body h2,.body h3,.body h4{margin:24px 0 10px;line-height:1.35;font-weight:660}
.body ul,.body ol{margin:0 0 13px;padding-left:24px}
.body blockquote{margin:0 0 13px;padding:10px 16px;background:var(--bg-soft);border-left:3px solid var(--accent);border-radius:0 8px 8px 0;color:var(--fg-soft)}
.body hr{border:0;border-top:1px solid var(--line);margin:22px 0}
.body code{background:var(--bg-code);border:1px solid var(--line-soft);border-radius:6px;padding:1.5px 5px;font-size:.89em;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.block{position:relative}
.block pre{background:var(--bg-code);border:1px solid var(--line-soft);border-radius:12px;padding:13px 15px;overflow:auto;margin:0 0 14px}
.block pre code{background:none;border:0;padding:0;font-size:12.8px;line-height:1.62;white-space:pre}
.copy{position:absolute;top:8px;right:8px;opacity:0;transition:opacity .12s;border:.5px solid var(--line);
  background:var(--bg);color:var(--fg-soft);border-radius:7px;font-size:11px;height:24px;padding:0 8px;cursor:pointer}
.block:hover .copy,.copy:focus{opacity:1}
.copy.done{color:#1a7f37;border-color:#1a7f37}
table{border-collapse:collapse;font-size:14px;margin:0 0 14px}
th,td{border:1px solid var(--line-soft);padding:7px 11px;text-align:left}
th{background:var(--bg-soft)}
details.extra{margin:0 0 12px;border:1px solid var(--line-soft);border-radius:10px;background:var(--bg-soft)}
details.extra>summary{cursor:pointer;padding:8px 12px;font-size:12.5px;color:var(--fg-soft)}
details.extra .inner{padding:0 12px 10px;font-size:13.5px}
details.extra pre{white-space:pre-wrap;margin:0;font-size:12px}
.clip{max-height:0;overflow:hidden}
.turn.clipped .body,.turn.clipped .bubble{max-height:560px;overflow:hidden;
  mask-image:linear-gradient(180deg,#000 78%,transparent)}
.more{display:none;margin:-14px 0 22px;border:0;background:none;color:var(--accent);font-size:13px;cursor:pointer;padding:0}
.turn.clipped+.more{display:inline-block}
mark{background:var(--mark);color:inherit;border-radius:3px;padding:0 1px}
.hidden{display:none!important}
.toc{position:fixed;inset:0 auto 0 0;width:280px;max-width:86vw;background:var(--bg);border-right:1px solid var(--line);
  transform:translateX(-102%);transition:transform .18s;z-index:40;overflow:auto;padding:14px}
.toc.open{transform:none}
.toc h2{font-size:12px;color:var(--fg-faint);margin:6px 0 10px;text-transform:uppercase;letter-spacing:.08em}
.toc a{display:block;font-size:13px;color:var(--fg-soft);text-decoration:none;padding:6px 8px;border-radius:7px;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.toc a:hover{background:var(--chip);color:var(--fg)}
.scrim{position:fixed;inset:0;background:rgba(0,0,0,.3);z-index:39;display:none}
.scrim.open{display:block}
.count{font-size:12px;color:var(--fg-faint)}
@media (max-width:620px){.wrap{padding:18px 12px 72px}.turn.user .col{max-width:100%}.intro h1{font-size:21px}}
@media print{.bar,.toc,.scrim,.copy,.more{display:none!important}.turn{break-inside:avoid}.turn.clipped .body,.turn.clipped .bubble{max-height:none;mask-image:none}}
`;

/** Small vanilla runtime: theme, search, TOC, copy, collapse, print. */
const RUNTIME = String.raw`
(function () {
  var root = document.documentElement;
  var stored = null;
  try { stored = localStorage.getItem("dsh-share-theme"); } catch (error) {}
  if (stored === "dark" || stored === "light") root.dataset.theme = stored;
  var themeButton = document.getElementById("theme");
  if (themeButton) themeButton.addEventListener("click", function () {
    var dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    root.dataset.theme = dark ? "light" : "dark";
    try { localStorage.setItem("dsh-share-theme", root.dataset.theme); } catch (error) {}
  });
  var printButton = document.getElementById("print");
  if (printButton) printButton.addEventListener("click", function () { window.print(); });

  var toc = document.getElementById("toc");
  var scrim = document.getElementById("scrim");
  var openToc = document.getElementById("open-toc");
  if (openToc) openToc.addEventListener("click", function () { toc.classList.add("open"); scrim.classList.add("open"); });
  if (scrim) scrim.addEventListener("click", function () { toc.classList.remove("open"); scrim.classList.remove("open"); });
  if (toc) toc.addEventListener("click", function (event) {
    if (event.target.tagName !== "A") return;
    toc.classList.remove("open"); scrim.classList.remove("open");
  });

  document.querySelectorAll(".block").forEach(function (block) {
    var pre = block.querySelector("pre");
    if (!pre) return;
    var button = document.createElement("button");
    button.className = "copy";
    button.type = "button";
    button.textContent = "复制";
    button.addEventListener("click", function () {
      var text = pre.innerText;
      var done = function () { button.textContent = "已复制"; button.classList.add("done"); setTimeout(function () { button.textContent = "复制"; button.classList.remove("done"); }, 1400); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () {});
      else { var area = document.createElement("textarea"); area.value = text; document.body.appendChild(area); area.select(); document.execCommand("copy"); area.remove(); done(); }
    });
    block.appendChild(button);
  });

  document.querySelectorAll(".turn").forEach(function (turn) {
    var target = turn.querySelector(".body") || turn.querySelector(".bubble");
    if (!target) return;
    if (target.scrollHeight > 900) {
      turn.classList.add("clipped");
      var button = document.createElement("button");
      button.className = "more";
      button.type = "button";
      button.textContent = "展开全部（剩余约 " + Math.round((target.scrollHeight - 560) / 26) + " 行）";
      button.addEventListener("click", function () { turn.classList.remove("clipped"); button.remove(); });
      turn.parentNode.insertBefore(button, turn.nextSibling);
    }
  });

  var search = document.getElementById("search");
  var count = document.getElementById("count");
  var turns = Array.prototype.slice.call(document.querySelectorAll(".turn"));
  var originals = turns.map(function (turn) { return turn.dataset.plain || ""; });
  if (search) search.addEventListener("input", function () {
    var needle = search.value.trim().toLowerCase();
    var hits = 0;
    turns.forEach(function (turn, index) {
      var hit = needle === "" || originals[index].indexOf(needle) !== -1;
      turn.classList.toggle("hidden", !hit);
      if (hit && needle !== "") hits += 1;
    });
    if (count) count.textContent = needle === "" ? "" : hits + " / " + turns.length;
  });
})();
`;

/** The message body HTML for one block list. */
function bodyHtml(blocks) {
  return blocks
    .map((block) => {
      if (block.type === "text") return `<div class="block">${renderMarkdown(block.text)}</div>`;
      if (block.type === "reasoning") {
        return `<details class="extra"><summary>思考过程</summary><div class="inner">${renderMarkdown(block.text)}</div></details>`;
      }
      if (block.type === "tool") {
        return `<details class="extra"><summary>工具调用 · ${escapeHtml(block.name ?? "tool")}</summary><div class="inner"><pre>${escapeHtml(block.detail ?? "")}</pre></div></details>`;
      }
      return "";
    })
    .join("\n");
}

/** Plain text of one message, used by the client-side search. */
function plainText(blocks) {
  return blocks
    .map((block) => (typeof block.text === "string" ? block.text : block.type === "tool" ? block.name ?? "" : ""))
    .join(" ")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/**
 * Render the single-file conversation app.
 * @param snapshot - stored share record.
 * @param options - `siteName`.
 * @returns a complete standalone HTML document.
 */
export function renderShareApp(snapshot, options) {
  const siteName = options?.siteName ?? "DeepSeek Harness";
  const title = typeof snapshot.title === "string" && snapshot.title !== "" ? snapshot.title : "对话分享";
  const messages = Array.isArray(snapshot.messages) ? snapshot.messages : [];
  const stamp = (value) => {
    const date = new Date(value ?? Date.now());
    if (Number.isNaN(date.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };
  const userTurns = messages.filter((message) => message.role === "user");

  const toc = userTurns
    .map((message, index) => {
      const label = (message.blocks?.[0]?.text ?? "").replace(/\s+/g, " ").slice(0, 40) || `第 ${index + 1} 问`;
      return `<a href="#t${index}">${escapeHtml(label)}</a>`;
    })
    .join("");

  let userIndex = -1;
  const body = messages
    .map((message) => {
      if (message.role === "user") {
        userIndex += 1;
        return `<div class="turn user" id="t${userIndex}" data-plain="${escapeHtml(plainText(message.blocks ?? []))}"><div class="col"><div class="who">你</div><div class="bubble">${bodyHtml(message.blocks ?? [])}</div></div></div>`;
      }
      if (message.role === "tool") {
        const text = (message.blocks ?? []).map((block) => block.text ?? "").join("\n");
        return `<div class="turn assistant" data-plain="${escapeHtml(text.slice(0, 400).toLowerCase())}"><details class="extra"><summary>${message.isError === true ? "工具失败" : "工具结果"} · ${escapeHtml(message.name ?? "tool")}</summary><div class="inner"><pre>${escapeHtml(text)}</pre></div></details></div>`;
      }
      return `<div class="turn assistant" data-plain="${escapeHtml(plainText(message.blocks ?? []))}"><div class="av">D</div><div class="col"><div class="who">DeepSeek</div><div class="body">${bodyHtml(message.blocks ?? [])}</div></div></div>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow,noarchive">
<meta name="referrer" content="no-referrer">
<meta name="color-scheme" content="light dark">
<title>${escapeHtml(title)} · ${escapeHtml(siteName)}</title>
<style>${STYLES}</style>
</head>
<body>
<div class="bar"><div class="in">
  <button class="tool" id="open-toc" type="button">目录</button>
  <span class="brand"><span class="dot"></span>${escapeHtml(siteName)}</span>
  <input class="search" id="search" type="search" placeholder="在对话中搜索…" aria-label="搜索">
  <span class="count" id="count"></span>
  <button class="tool" id="theme" type="button">深浅色</button>
  <button class="tool" id="print" type="button">打印 / PDF</button>
</div></div>
<nav class="toc" id="toc"><h2>对话目录</h2>${toc}</nav>
<div class="scrim" id="scrim"></div>
<main class="wrap">
<div class="intro">
<h1>${escapeHtml(title)}</h1>
<div class="meta"><span>分享于 ${escapeHtml(stamp(snapshot.sharedAt))}</span><span>${userTurns.length} 轮 · ${messages.length} 条</span><span>离线单文件</span></div>
</div>
<div style="height:22px"></div>
${body}
</main>
<script>${RUNTIME}</script>
</body>
</html>`;
}
