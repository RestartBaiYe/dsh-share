/**
 * Render one share snapshot as a standalone, script-free HTML document.
 *
 * The page carries no JavaScript and no remote asset, so the response can ship
 * a locked-down Content-Security-Policy and a shared snapshot can never reach
 * back into the Host that produced it. Everything the reader sees is server
 * rendered: layout, typography, dark mode, print styles.
 * @module dsh-share/render
 */

import { escapeHtml, renderMarkdown } from "./markdown.js";

const STYLES = `
*,*::before,*::after{box-sizing:border-box}
:root{
  color-scheme:light dark;
  --bg:#ffffff;--bg-soft:#f7f8fa;--bg-code:#f4f5f7;--bg-quote:#fafbfc;
  --fg:#1a1d21;--fg-soft:#5f6772;--fg-faint:#8b939e;
  --line:#e6e8ec;--line-soft:#eff1f4;--accent:#4d6bfe;--user-bg:#eef2ff;
  --chip:#f1f3f7;--radius:14px;
}
@media (prefers-color-scheme:dark){
  :root{--bg:#14161a;--bg-soft:#1a1d22;--bg-code:#1e2228;--bg-quote:#1b1f25;
  --fg:#e7e9ec;--fg-soft:#a3abb5;--fg-faint:#78808a;
  --line:#2a2f37;--line-soft:#23272e;--accent:#8aa0ff;--user-bg:#222a44;--chip:#232830}
}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--fg);
  font:16px/1.75 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",Roboto,Helvetica,Arial,sans-serif;
  -webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
a{color:var(--accent);text-decoration:none}
a:hover{text-decoration:underline}
.top{position:sticky;top:0;z-index:10;background:color-mix(in srgb,var(--bg) 86%,transparent);
  backdrop-filter:saturate(180%) blur(14px);border-bottom:1px solid var(--line-soft)}
.top .inner{max-width:860px;margin:0 auto;padding:12px 20px;display:flex;align-items:center;gap:10px}
.brand{display:flex;align-items:center;gap:9px;font-weight:650;letter-spacing:.2px;font-size:14.5px}
.dot{width:22px;height:22px;border-radius:7px;background:linear-gradient(140deg,var(--accent),#7f5cff);
  box-shadow:0 2px 8px color-mix(in srgb,var(--accent) 34%,transparent)}
.chip{margin-left:auto;font-size:11.5px;color:var(--fg-soft);background:var(--chip);
  border-radius:999px;padding:3px 11px;white-space:nowrap}
.wrap{max-width:860px;margin:0 auto;padding:26px 20px 84px}
.intro{margin:6px 0 30px}
h1.title{font-size:27px;line-height:1.32;margin:0 0 10px;font-weight:680;letter-spacing:-.2px;overflow-wrap:anywhere}
.meta{display:flex;flex-wrap:wrap;gap:8px 18px;color:var(--fg-soft);font-size:13px}
.meta span{display:inline-flex;align-items:center;gap:5px}
.sep{height:1px;background:var(--line-soft);margin:0 0 30px}
.turn{display:flex;gap:14px;margin:0 0 30px}
.turn.user{justify-content:flex-end}
.avatar{flex:none;width:26px;height:26px;border-radius:8px;margin-top:2px;
  display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#fff;
  background:linear-gradient(140deg,#5b6cff,#8f5bff)}
.turn.assistant .avatar{background:var(--chip);color:var(--fg-soft)}
.col{min-width:0;flex:1}
.turn.user .col{flex:0 1 auto;max-width:86%}
.who{font-size:12px;color:var(--fg-faint);margin:0 0 5px;letter-spacing:.2px}
.bubble{background:var(--user-bg);border-radius:var(--radius);padding:13px 17px;overflow-wrap:anywhere}
.bubble p:first-child{margin-top:0}
.bubble p:last-child{margin-bottom:0}
.body{overflow-wrap:anywhere}
.body>*:first-child{margin-top:0}
.body>*:last-child{margin-bottom:0}
.body p{margin:0 0 13px}
.body h1,.body h2,.body h3,.body h4,.body h5,.body h6{margin:26px 0 11px;line-height:1.35;font-weight:660;letter-spacing:-.1px}
.body h1{font-size:22px}.body h2{font-size:19.5px}.body h3{font-size:17.5px}
.body h4,.body h5,.body h6{font-size:15.5px}
.body ul,.body ol{margin:0 0 13px;padding-left:24px}
.body li{margin:3px 0}
.body li::marker{color:var(--fg-faint)}
.body .task{color:var(--fg-soft);margin-right:2px}
.body blockquote{margin:0 0 13px;padding:10px 16px;background:var(--bg-quote);
  border-left:3px solid color-mix(in srgb,var(--accent) 55%,var(--line));border-radius:0 8px 8px 0;color:var(--fg-soft)}
.body blockquote p:last-child{margin-bottom:0}
.body hr{border:0;border-top:1px solid var(--line);margin:24px 0}
.body strong{font-weight:660}
.body code{background:var(--bg-code);border:1px solid var(--line-soft);border-radius:6px;
  padding:1.5px 5px;font-size:.89em;
  font-family:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,"Liberation Mono",monospace}
.md-pre{position:relative;background:var(--bg-code);border:1px solid var(--line-soft);border-radius:12px;
  padding:14px 16px;overflow:auto;margin:0 0 15px}
.md-pre::before{content:attr(data-lang);position:absolute;top:8px;right:12px;
  font-size:10.5px;letter-spacing:.4px;color:var(--fg-faint);text-transform:uppercase}
.md-pre code{background:none;border:0;padding:0;font-size:12.8px;line-height:1.62;white-space:pre}
.md-table{overflow:auto;margin:0 0 15px;border:1px solid var(--line-soft);border-radius:10px}
.md-table table{border-collapse:collapse;font-size:14px;min-width:100%}
.md-table th,.md-table td{border-bottom:1px solid var(--line-soft);padding:8px 13px;text-align:left}
.md-table th{background:var(--bg-soft);font-weight:640}
.md-table tr:last-child td{border-bottom:0}
details.extra{margin:0 0 14px;border:1px solid var(--line-soft);border-radius:10px;background:var(--bg-soft)}
details.extra>summary{cursor:pointer;padding:9px 13px;font-size:12.5px;color:var(--fg-soft);
  list-style:none;display:flex;align-items:center;gap:7px}
details.extra>summary::-webkit-details-marker{display:none}
details.extra>summary::before{content:"▸";font-size:10px;color:var(--fg-faint);transition:transform .15s}
details.extra[open]>summary::before{transform:rotate(90deg)}
details.extra .inner{padding:0 13px 12px;font-size:13.5px;color:var(--fg-soft)}
details.extra pre{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;color:var(--fg-soft)}
.msg-tool{margin:0 0 16px}
.foot{margin-top:44px;padding-top:20px;border-top:1px solid var(--line-soft);
  color:var(--fg-faint);font-size:12.5px;text-align:center;line-height:1.9}
.empty{padding:72px 0;text-align:center;color:var(--fg-soft)}
@media (max-width:620px){
  body{font-size:15.5px}
  .wrap{padding:20px 15px 64px}
  h1.title{font-size:22px}
  .turn.user .col{max-width:100%}
  .md-pre{padding:12px}
}
@media print{
  .top{position:static;background:none}
  .chip,.foot{display:none}
  .body a{color:inherit;text-decoration:underline}
  details.extra{break-inside:avoid}
}
`;

/** Explicit UTC: share readers may be in a different time zone. */
function stamp(milliseconds) {
  const date = new Date(milliseconds);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0,16).replace('T',' ') + ' UTC';
}

/**
 * Render the display blocks of one message.
 * @param blocks - `{ type, text, name, detail }` blocks from the snapshot.
 * @returns HTML for the message body.
 */
function renderBlocks(blocks) {
  return blocks
    .map((block) => {
      if (block.type === "text") return renderMarkdown(block.text);
      if (block.type === "reasoning") {
        return `<details class="extra"><summary>思考过程</summary><div class="inner">${renderMarkdown(block.text)}</div></details>`;
      }
      if (block.type === "tool") {
        const name = escapeHtml(block.name ?? "tool");
        return `<details class="extra"><summary>工具调用 · ${name}</summary><div class="inner"><pre>${escapeHtml(block.detail ?? "")}</pre></div></details>`;
      }
      return "";
    })
    .join("\n");
}

/** Wrap one snapshot message in its row. */
function renderMessage(message) {
  if (message.role === "user") {
    return `<div class="turn user"><div class="col"><div class="who">你</div><div class="bubble">${renderBlocks(message.blocks ?? [])}</div></div></div>`;
  }
  if (message.role === "tool") {
    const name = escapeHtml(message.name ?? "工具结果");
    const text = (message.blocks ?? []).map((block) => block.text ?? "").join("\n");
    return `<div class="msg-tool"><details class="extra"><summary>${message.isError === true ? "工具失败" : "工具结果"} · ${name}</summary><div class="inner"><pre>${escapeHtml(text)}</pre></div></details></div>`;
  }
  return `<div class="turn assistant"><div class="avatar">D</div><div class="col"><div class="who">DeepSeek</div><div class="body">${renderBlocks(message.blocks ?? [])}</div></div></div>`;
}

/**
 * Render the whole share document.
 * @param snapshot - stored share record.
 * @param options - `siteName` for the header brand.
 * @returns a complete HTML document.
 */
export function renderSharePage(snapshot, options) {
  const siteName = options?.siteName ?? "DeepSeek Harness";
  const title = typeof snapshot.title === "string" && snapshot.title !== "" ? snapshot.title : "对话分享";
  const messages = Array.isArray(snapshot.messages) ? snapshot.messages : [];
  const userTurns = messages.filter((message) => message.role === "user").length;
  const expires = typeof snapshot.expiresAt === "number" && snapshot.expiresAt > 0 ? stamp(snapshot.expiresAt) : "";
  const body =
    messages.length === 0
      ? '<div class="empty">这次对话没有可展示的内容。</div>'
      : messages.map(renderMessage).join("\n");
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
<header class="top"><div class="inner"><span class="brand"><span class="dot"></span>${escapeHtml(siteName)}</span><span class="chip">只读分享</span></div></header>
<main class="wrap">
<div class="intro">
<h1 class="title">${escapeHtml(title)}</h1>
<div class="meta">
<span>分享于 ${escapeHtml(stamp(snapshot.sharedAt ?? Date.now()))}</span>
<span>${userTurns} 轮对话 · ${messages.length} 条消息</span>
${expires === "" ? "" : `<span>链接有效期至 ${escapeHtml(expires)}</span>`}
</div>
</div>
<div class="sep"></div>
${snapshot.truncated ? '<p class="meta">根据分享者的设置，此快照仅包含最近的部分消息。</p>' : ''}
${body}
<footer class="foot">由 ${escapeHtml(siteName)} 生成的对话快照 · 页面只读，不随会话继续更新<br>云端链接的撤销与到期不影响已保存的副本</footer>
</main>
</body>
</html>`;
}
