/**
 * Snapshot → markdown, and markdown → Telegraph nodes.
 *
 * Two zero-account hosts (rentry, Telegraph) want markdown rather than HTML,
 * so a share keeps one portable text form next to the rendered page.
 * @module dsh-share/share-md
 */

/** Fence a block when it contains backticks that would close a plain fence. */
function fence(code, language) {
  const longest = (code.match(/`+/g) ?? []).reduce((size, run) => Math.max(size, run.length), 0);
  const marker = "`".repeat(Math.max(3, longest + 1));
  return `${marker}${language ?? ""}\n${code}\n${marker}`;
}

/**
 * Render a snapshot as markdown a paste host can display.
 * @param snapshot - stored share record.
 * @returns markdown text.
 */
export function toMarkdown(snapshot) {
  const title = typeof snapshot.title === "string" && snapshot.title !== "" ? snapshot.title : "对话分享";
  const parts = [`# ${title}`];
  const shared = new Date(snapshot.sharedAt ?? Date.now());
  parts.push(`> 分享自 DeepSeek Harness · ${shared.toISOString().slice(0, 16).replace("T", " ")}`);
  for (const message of Array.isArray(snapshot.messages) ? snapshot.messages : []) {
    if (message.role === "user") {
      parts.push("---", "**你**", "");
      for (const block of message.blocks ?? []) if (block.type === "text") parts.push(String(block.text).trim(), "");
    } else if (message.role === "assistant") {
      parts.push("**DeepSeek**", "");
      for (const block of message.blocks ?? []) {
        if (block.type === "text") parts.push(String(block.text).trim(), "");
        else if (block.type === "reasoning") parts.push("<details><summary>思考过程</summary>", "", String(block.text).trim(), "", "</details>", "");
      }
    } else if (message.role === "tool") {
      const text = (message.blocks ?? []).map((block) => block.text ?? "").join("\n");
      parts.push(`**工具结果 · ${message.name ?? "tool"}**`, "", fence(text.slice(0, 4000)), "");
    }
  }
  return parts.join("\n").replace(/\n{4,}/g, "\n\n\n");
}

/** Inline markdown → Telegraph children (text, strong, em, a, code). */
function inlineNodes(segment) {
  const nodes = [];
  const pattern = /(\*\*[^*]+\*\*|\`[^\`]+\`|\[[^\]]+\]\(https?:\/\/[^)]+\))/g;
  let cursor = 0;
  for (const match of segment.matchAll(pattern)) {
    if (match.index > cursor) nodes.push(segment.slice(cursor, match.index));
    const token = match[0];
    if (token.startsWith("**")) nodes.push({ tag: "strong", children: [token.slice(2, -2)] });
    else if (token.startsWith("\`")) nodes.push({ tag: "code", children: [token.slice(1, -1)] });
    else {
      const link = token.match(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/);
      nodes.push({ tag: "a", attrs: { href: link[2] }, children: [link[1]] });
    }
    cursor = match.index + token.length;
  }
  if (cursor < segment.length) nodes.push(segment.slice(cursor));
  return nodes.filter((node) => node !== "");
}

/**
 * Convert the shared markdown into the node array the Telegraph API accepts.
 * Telegraph supports a small tag set: p, h3, h4, blockquote, pre, ul/li, hr, a,
 * strong, em, code.
 * @param markdown - output of {@link toMarkdown}.
 * @returns Telegraph content nodes.
 */
export function markdownToTelegraphNodes(markdown) {
  const lines = String(markdown ?? "").split("\n");
  const nodes = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    const fenceMatch = line.match(/^(`{3,})([A-Za-z0-9+#._-]*)$/);
    if (fenceMatch !== null) {
      const body = [];
      index += 1;
      while (index < lines.length && lines[index].startsWith(fenceMatch[1]) === false) {
        body.push(lines[index]);
        index += 1;
      }
      index += 1;
      nodes.push({ tag: "pre", children: [body.join("\n")] });
      continue;
    }
    if (line.trim() === "") {
      index += 1;
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading !== null) {
      const tag = heading[1].length <= 2 ? "h3" : "h4";
      nodes.push({ tag, children: inlineNodes(heading[2]) });
      index += 1;
      continue;
    }
    if (/^\s{0,3}(-{3,}|\*{3,})\s*$/.test(line)) {
      nodes.push({ tag: "hr" });
      index += 1;
      continue;
    }
    if (line.startsWith(">")) {
      const quote = [];
      while (index < lines.length && lines[index].startsWith(">")) {
        quote.push(lines[index].replace(/^>\s?/, ""));
        index += 1;
      }
      nodes.push({ tag: "blockquote", children: inlineNodes(quote.join(" ")) });
      continue;
    }
    if (/^\s{0,3}[-*+]\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^\s{0,3}[-*+]\s+/.test(lines[index])) {
        items.push({ tag: "li", children: inlineNodes(lines[index].replace(/^\s{0,3}[-*+]\s+/, "")) });
        index += 1;
      }
      nodes.push({ tag: "ul", children: items });
      continue;
    }
    const paragraph = [];
    while (index < lines.length && lines[index].trim() !== "" && /^(#{1,6}\s|>|\s{0,3}[-*+]\s)/.test(lines[index]) === false) {
      paragraph.push(lines[index]);
      index += 1;
    }
    nodes.push({ tag: "p", children: inlineNodes(paragraph.join(" ")) });
  }
  return nodes;
}
