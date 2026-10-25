/**
 * A small, allocation-safe markdown subset renderer.
 *
 * Every input string is escaped before any tag is produced, so model output can
 * never inject markup: the only tags in the result are the ones written here.
 * Links are limited to http(s) and rendered with rel="noopener noreferrer nofollow".
 * @module dsh-share/markdown
 */

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/**
 * Escape text for HTML text and attribute positions.
 * @param text - raw text.
 * @returns the escaped text.
 */
export function escapeHtml(text) {
  return String(text ?? "").replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
}

/** Inline emphasis, links and code spans over already-escaped text. */
function renderInline(escaped) {
  // Tokenize once: generated anchors must never be parsed as markdown again.
  const tokens = /(`[^`\n]{1,2000}`)|\[([^\]\n]{1,200})\]\((https?:\/\/[^\s)]{1,2000})\)|(https?:\/\/[^\s<>)]{1,2000})/g;
  let out = '', offset = 0;
  for (const match of escaped.matchAll(tokens)) {
    out += emphasis(escaped.slice(offset, match.index));
    if (match[1]) out += `<code>${match[1].slice(1,-1)}</code>`;
    else {
      const href = match[3] ?? match[4];
      const label = match[2] ? emphasis(match[2]) : href;
      out += `<a href="${href}" target="_blank" rel="noopener noreferrer nofollow">${label}</a>`;
    }
    offset = match.index + match[0].length;
  }
  return out + emphasis(escaped.slice(offset));
}

/** Emphasis, strike and links for one non-code segment. */
function emphasis(segment) {
  return segment
    .replace(/\*\*([^*\n]{1,2000})\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]{1,2000})\*/g, "$1<em>$2</em>")
    .replace(/~~([^~\n]{1,2000})~~/g, "<del>$1</del>");
}

const FENCE = /^\s{0,3}(`{3,}|~{3,})\s*([A-Za-z0-9+#._-]{0,32})\s*$/;
const HEADING = /^\s{0,3}(#{1,6})\s+(.*)$/;
const BULLET = /^\s{0,3}[-*+]\s+(.*)$/;
const ORDERED = /^\s{0,3}(\d{1,9})[.)]\s+(.*)$/;
const QUOTE = /^\s{0,3}>\s?(.*)$/;
const RULE = /^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/;
const TABLE_SEP = /^\s{0,3}\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

/** Split a table row into trimmed cells. */
function cells(row) {
  return row.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((cell) => cell.trim());
}

/**
 * Render markdown to a safe HTML fragment.
 * @param text - markdown source.
 * @returns HTML for insertion into a message body.
 */
export function renderMarkdown(text, depth = 0) {
  if (depth > 24) return `<pre>${escapeHtml(text)}</pre>`;
  const lines = String(text ?? "").replace(/\r\n?/g, "\n").split("\n");
  const html = [];
  let paragraph = [];
  const flush = () => {
    if (paragraph.length === 0) return;
    const body = renderInline(escapeHtml(paragraph.join("\n"))).replace(/\n/g, "<br>");
    html.push(`<p>${body}</p>`);
    paragraph = [];
  };
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    const fence = line.match(FENCE);
    if (fence !== null) {
      flush();
      const marker = fence[1][0];
      const language = fence[2];
      const close = new RegExp(`^\\s{0,3}${marker}{${fence[1].length},}\\s*$`);
      const body = [];
      index += 1;
      while (index < lines.length && !close.test(lines[index])) {
        body.push(lines[index]);
        index += 1;
      }
      index += 1;
      const attribute = language === "" ? "" : ` data-lang="${escapeHtml(language)}"`;
      html.push(`<pre class="md-pre"${attribute}><code>${escapeHtml(body.join("\n"))}</code></pre>`);
      continue;
    }
    if (line.trim() === "") {
      flush();
      index += 1;
      continue;
    }
    const heading = line.match(HEADING);
    if (heading !== null) {
      flush();
      const level = heading[1].length;
      html.push(`<h${level}>${renderInline(escapeHtml(heading[2]))}</h${level}>`);
      index += 1;
      continue;
    }
    if (RULE.test(line)) {
      flush();
      html.push("<hr>");
      index += 1;
      continue;
    }
    if (QUOTE.test(line)) {
      flush();
      const body = [];
      while (index < lines.length && QUOTE.test(lines[index])) {
        body.push(lines[index].replace(QUOTE, "$1"));
        index += 1;
      }
      html.push(`<blockquote>${renderMarkdown(body.join("\n"), depth + 1)}</blockquote>`);
      continue;
    }
    if (index + 1 < lines.length && line.includes("|") && TABLE_SEP.test(lines[index + 1])) {
      flush();
      const head = cells(line);
      index += 2;
      const rows = [];
      while (index < lines.length && lines[index].includes("|") && lines[index].trim() !== "") {
        rows.push(cells(lines[index]));
        index += 1;
      }
      const headHtml = head.map((cell) => `<th>${renderInline(escapeHtml(cell))}</th>`).join("");
      const bodyHtml = rows
        .map((row) => `<tr>${row.map((cell) => `<td>${renderInline(escapeHtml(cell))}</td>`).join("")}</tr>`)
        .join("");
      html.push(`<div class="md-table"><table><thead><tr>${headHtml}</tr></thead><tbody>${bodyHtml}</tbody></table></div>`);
      continue;
    }
    if (BULLET.test(line) || ORDERED.test(line)) {
      flush();
      const ordered = BULLET.test(line) === false;
      const items = [];
      while (index < lines.length) {
        const candidate = ordered ? lines[index].match(ORDERED) : lines[index].match(BULLET);
        if (candidate === null) break;
        const raw = ordered ? candidate[2] : candidate[1];
        // GFM task items: `- [ ] todo` / `- [x] done` become a checkbox glyph.
        const task = ordered ? null : raw.match(/^\[( |x|X)\]\s+(.*)$/);
        if (task !== null) {
          const checked = task[1].toLowerCase() === "x";
          items.push(`<span class="task">${checked ? "☑" : "☐"}</span> ${renderInline(escapeHtml(task[2]))}`);
        } else {
          items.push(renderInline(escapeHtml(raw)));
        }
        index += 1;
      }
      const tag = ordered ? "ol" : "ul";
      const looksLikeTasks = ordered === false && items.some((item) => /^\[&nbsp;|<input|<span class="task"/.test(item) || item.startsWith("☐") || item.startsWith("☑"));
      html.push(
        `<${tag}${looksLikeTasks ? ' class="md-tasks"' : ""}>${items.map((item) => `<li>${item}</li>`).join("")}</${tag}>`,
      );
      continue;
    }
    paragraph.push(line);
    index += 1;
  }
  flush();
  return html.join("\n");
}
