/**
 * Turn one persisted Session into the flat, display-oriented transcript a share
 * snapshot stores.
 *
 * The Host already exposes the folded surface through `ctx.sessionQuery`, so this
 * module never decodes the log itself: it projects surface events into text
 * blocks, drops replay payloads and context re-injections, and keeps user and
 * assistant text only (reasoning and tool traffic are opt-in).
 * @module dsh-share/transcript
 */

/** User-message sources that represent something the human actually typed. */
const HUMAN_SOURCES = new Set(["user", "user-rpc"]);

/** Nothing to share in a session with no human turn. */
export class EmptyConversationError extends Error {
  constructor(sessionId) {
    super(`session ${sessionId} has no digestible message`);
    this.name = "EmptyConversationError";
    this.sessionId = sessionId;
  }
}

/** Read the session service (absent in compositions without one). */
function service(ctx, name) {
  if (typeof ctx?.get !== "function") return undefined;
  const value = ctx.get(name);
  return value === undefined ? undefined : value;
}

/**
 * Flush a live Session so its newest turn reaches the log before it is read.
 * @param ctx - host context.
 * @param sessionId - session being shared.
 */
async function flushLive(ctx, sessionId) {
  const sessions = service(ctx, "sessions");
  try {
    const live = sessions?.get?.(sessionId);
    if (live !== undefined && live !== null && typeof sessions.flush === "function") await sessions.flush(live);
  } catch {
    /* a missing flush only means the newest turn may lag; reading still works */
  }
}

/**
 * Fold a raw log into the current surface without `sessionQuery`.
 *
 * Surface events carry `surfaceOp`: `append` adds a node, and
 * `{ op: 'replace', startSeq, endSeq }` retires the covered range first. The
 * result mirrors what the client renders, so an edited or compacted-away turn
 * never reappears in a share.
 * @param events - raw session events in log order.
 * @returns the surface events in sequence order.
 */
export function foldSurface(events) {
  let surface = new Map();
  for (const event of events) {
    const op = event?.surfaceOp;
    if (op === undefined) continue;
    if (typeof op === "object" && op.op === "replace") {
      for (const seq of [...surface.keys()]) if (seq >= op.startSeq && seq <= op.endSeq) surface.delete(seq);
    }
    surface.set(event.seq, event);
  }
  return [...surface.values()].sort((a, b) => a.seq - b.seq);
}

/** Text blocks of one content array, ignoring non-text parts. */
function textBlocks(content) {
  const blocks = [];
  for (const part of Array.isArray(content) ? content : []) {
    if (part === null || typeof part !== "object") continue;
    if (part.type === "text" && typeof part.text === "string" && part.text.trim() !== "") {
      blocks.push({ type: "text", text: part.text });
    }
  }
  return blocks;
}

/**
 * Project one assistant content array into display blocks.
 * @param content - `Message.content`.
 * @param options - `includeReasoning` and `includeTools`.
 */
function assistantBlocks(content, options) {
  const blocks = [];
  for (const part of Array.isArray(content) ? content : []) {
    if (part === null || typeof part !== "object") continue;
    if (part.type === "text" && typeof part.text === "string" && part.text.trim() !== "") {
      blocks.push({ type: "text", text: part.text });
    } else if (part.type === "reasoning" && options.includeReasoning && typeof part.text === "string" && part.text.trim() !== "") {
      blocks.push({ type: "reasoning", text: part.text });
    } else if (part.type === "tool-call" && options.includeTools) {
      const args = typeof part.arguments === "string" ? part.arguments : JSON.stringify(part.arguments ?? "");
      blocks.push({ type: "tool", name: String(part.name ?? "tool"), detail: args.slice(0, 2000) });
    }
  }
  return blocks;
}

/**
 * Load one session's transcript for a share snapshot.
 * @param ctx - host context carrying `sessionQuery` (preferred) or `sessionPersistence`.
 * @param sessionId - opaque session id.
 * @param options - `includeReasoning`, `includeTools`, `maxMessages`.
 * @returns `{ sessionId, title, createdAt, lastSeq, messages }`.
 * @throws when the session is unknown or holds no human turn.
 */
export async function buildShareTranscript(ctx, sessionId, options) {
  const config = { includeReasoning: false, includeTools: false, maxMessages: 1000, ...options };
  await flushLive(ctx, sessionId);
  let header;
  let surfaceEvents;
  let title;
  const query = service(ctx, "sessionQuery");
  if (typeof query?.readSurface === "function") {
    const surface = await query.readSurface(sessionId);
    header = surface.session;
    surfaceEvents = surface.events;
    try {
      title = await query.readTitle(sessionId);
    } catch {
      title = undefined;
    }
  } else {
    const persistence = service(ctx, "sessionPersistence");
    if (typeof persistence?.open !== "function") throw new Error("no session reader is available in this composition");
    const handle = await persistence.open(sessionId, "read");
    try {
      const { events } = await handle.read(0, undefined);
      header = handle.header;
      surfaceEvents = foldSurface(events);
    } finally {
      await handle.close?.();
    }
  }

  const calls = new Map();
  const messages = [];
  for (const event of surfaceEvents) {
    const data = event?.data;
    if (data === null || typeof data !== "object") continue;
    if (event.type === "user/message") {
      const kind = data.source?.kind;
      if (kind !== undefined && HUMAN_SOURCES.has(kind) === false) continue;
      const blocks = textBlocks(data.content);
      if (blocks.length === 0) continue;
      messages.push({ role: "user", time: event.time, blocks });
      continue;
    }
    if (event.type === "assistant/message") {
      const content = data.message?.content;
      for (const part of Array.isArray(content) ? content : []) {
        if (part?.type === "tool-call" && typeof part.id === "string") calls.set(part.id, part);
      }
      const blocks = assistantBlocks(content, config);
      if (blocks.length === 0) continue;
      messages.push({ role: "assistant", time: event.time, blocks });
      continue;
    }
    if (event.type === "tool/result" && config.includeTools) {
      const callId = data.toolCallId;
      const call = calls.get(callId);
      const text = textBlocks(data.message?.content)
        .map((block) => block.text)
        .join("\n");
      if (text === "") continue;
      messages.push({
        role: "tool",
        time: event.time,
        name: typeof call?.name === "string" ? call.name : undefined,
        isError: data.isError === true,
        blocks: [{ type: "text", text }],
      });
    }
  }

  if (messages.length === 0) throw new EmptyConversationError(sessionId);
  const truncated = messages.length > config.maxMessages;
  const bounded = truncated ? messages.slice(-config.maxMessages) : messages;
  const lastSeq = surfaceEvents.at(-1)?.seq ?? 0;
  const fallbackTitle = bounded.find((message) => message.role === "user")?.blocks[0]?.text ?? "";
  const resolvedTitle = (typeof title === "string" && title.trim() !== "" ? title : fallbackTitle)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return {
    sessionId,
    title: resolvedTitle === "" ? sessionId : resolvedTitle,
    createdAt: typeof header?.createdAt === "number" ? header.createdAt : Date.now(),
    cwd: typeof header?.cwd === "string" ? header.cwd : undefined,
    lastSeq,
    truncated,
    messageCount: messages.length,
    messages: bounded,
  };
}
