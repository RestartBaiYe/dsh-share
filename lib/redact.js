/**
 * Local-identity scrubbing for share snapshots.
 *
 * A shared conversation often quotes what was on the machine it was written
 * on: absolute paths, the account name, the host name, and — in command output
 * — IP addresses. A reader of a public link must learn none of that, so every
 * text block is scrubbed before the snapshot is written.
 *
 * Fact-based replacement is literal (split/join) so a path full of backslashes
 * matches exactly; the IP and UNC rules are the only regular expressions, and
 * they are anchored on their own syntax.
 * @module dsh-share/redact
 */

const PLACEHOLDER_WORKSPACE = "<workspace>";
const PLACEHOLDER_HOME = "<home>";

/** Replace every literal occurrence of `needle`, tolerating case drift. */
function scrub(text, needle, replacement) {
  if (typeof needle !== "string") return text;
  const trimmed = needle.trim();
  if (trimmed.length < 3) return text;
  let value = text.split(trimmed).join(replacement);
  const lower = trimmed.toLowerCase();
  if (lower !== trimmed) value = value.split(lower).join(replacement);
  const upper = trimmed.toUpperCase();
  if (upper !== trimmed && upper !== lower) value = value.split(upper).join(replacement);
  return value;
}

/** IPv4 with a plausible octet range, not part of a longer number or version string. */
const IPV4 = /(?<![\w.])(?:\d{1,3}\.){3}\d{1,3}(?![\w.])/g;
/**
 * Full or compressed IPv6, assembled from the standard alternatives so a bare
 * hex word (a hash, a colour) is never mistaken for an address.
 */
const IPV6 = new RegExp(
  [
    "(?<![\\w:])",
    "(?:",
    "(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}",
    "|(?:[0-9a-fA-F]{1,4}:){1,7}:",
    "|(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}",
    "|(?:[0-9a-fA-F]{1,4}:){1,5}(?::[0-9a-fA-F]{1,4}){1,2}",
    "|(?:[0-9a-fA-F]{1,4}:){1,4}(?::[0-9a-fA-F]{1,4}){1,3}",
    "|(?:[0-9a-fA-F]{1,4}:){1,3}(?::[0-9a-fA-F]{1,4}){1,4}",
    "|(?:[0-9a-fA-F]{1,4}:){1,2}(?::[0-9a-fA-F]{1,4}){1,5}",
    "|[0-9a-fA-F]{1,4}:(?::[0-9a-fA-F]{1,4}){1,6}",
    "|:(?::[0-9a-fA-F]{1,4}){1,7}",
    ")",
    "(?![\\w:])",
  ].join(""),
  "g",
);
/** A Windows file URL keeps its file name but loses the host path. */
const FILE_URL = /file:\/\/\/[^\s"'<>)]+/gi;
/** A UNC share names a machine: `\\HOST\share`. */
const UNC = /(?:\\\\)+[A-Za-z0-9._-]+(?:\\[^\s"'<>]+)?/g;

/** Replace IPv4/IPv6 literals so no address survives in text or code. */
function scrubAddresses(text) {
  return text
    .replace(FILE_URL, "file:///<local>")
    .replace(IPV6, "<ip>")
    .replace(IPV4, "<ip>")
    .replace(UNC, "\\\\<host>\\<share>");
}

/**
 * Build the redactor.
 * @param facts - `{ cwd, home, dshHome, profileDir, userName, hostName }`.
 * @returns a function mapping text to its scrubbed form.
 */
export function makeRedactor(facts) {
  const steps = [
    [facts?.cwd, PLACEHOLDER_WORKSPACE],
    [facts?.home, PLACEHOLDER_HOME],
    [facts?.dshHome, PLACEHOLDER_HOME],
    [facts?.profileDir, "<home>/profiles"],
    [facts?.userName, "<user>"],
    [facts?.hostName, "<host>"],
  ].filter(([needle]) => typeof needle === "string" && needle.trim() !== "");
  return (text) => {
    let value = String(text ?? "");
    for (const [needle, replacement] of steps) value = scrub(value, needle, replacement);
    return scrubAddresses(value);
  };
}

/**
 * Scrub every text block of one transcript.
 * @param messages - transcript messages with `blocks`.
 * @param redact - the function from {@link makeRedactor}.
 * @returns the same message list with scrubbed text.
 */
export function redactMessages(messages, redact) {
  for (const message of messages) {
    for (const block of message.blocks ?? []) {
      if (typeof block.text === "string") block.text = redact(block.text);
      if (typeof block.detail === "string") block.detail = redact(block.detail);
    }
  }
  return messages;
}
