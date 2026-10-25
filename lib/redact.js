/** Local identity and recognisable credential scrubbing, before persistence. */
import { isIP } from 'node:net';

const escapeRE = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Deliberately conservative: recognised token shapes and credential fields only. */
export function redactSecrets(text) {
  return String(text ?? '')
    .replace(/-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z0-9]+ )*PRIVATE KEY-----/g, '<private-key>')
    .replace(/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-(?:proj-|ant-api\d+-)?[A-Za-z0-9_-]{20,}|AKIA[A-Z0-9]{16}|xox[baprs]-[A-Za-z0-9-]{12,})\b/g, '<secret>')
    .replace(/(\b(?:Bearer|Basic)\s+)[A-Za-z0-9+/_=.-]{8,}/gi, '$1<secret>')
    .replace(/((?:["']?)(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|passwd|ownerToken|deleteToken|token)(?:["']?)\s*[:=]\s*)(["'])([^\r\n]*?)\2/gi, '$1$2<secret>$2')
    .replace(/(\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|passwd|ownerToken|deleteToken|token)\s*[:=]\s*)(?!["'<])[A-Za-z0-9+/_=.~-]{8,}/gi, '$1<secret>')
    .replace(/(https?:\/\/)[^\s/@:]+:[^\s/@]+@/gi, '$1<credentials>@');
}

export function makeRedactor(facts = {}) {
  const paths = [[facts.cwd, '<workspace>'], [facts.profileDir, '<profile>'], [facts.dshHome, '<dsh-home>'], [facts.home, '<home>']]
    .filter(([value]) => typeof value === 'string' && value.length > 2)
    .sort((a,b) => b[0].length - a[0].length);
  const rules = [];
  for (const [value, replacement] of paths) {
    const slash = value.replaceAll('\\', '/');
    for (const variant of new Set([value, slash, slash.replaceAll('/', '\\'), value.replaceAll('\\', '\\\\'), encodeURI(slash), encodeURIComponent(value)])) {
      rules.push([new RegExp(escapeRE(variant), 'gi'), () => replacement]);
    }
  }
  for (const [value, replacement] of [[facts.userName, '<user>'], [facts.hostName, '<host>']]) {
    if (typeof value === 'string' && value.length) rules.push([new RegExp('(?<![\\p{L}\\p{N}_])' + escapeRE(value) + '(?![\\p{L}\\p{N}_])', 'giu'), () => replacement]);
  }
  return text => {
    let out = String(text ?? '');
    for (const [pattern, replacement] of rules) out = out.replace(pattern, replacement);
    return out
      .replace(/file:\/\/[^\s"'<>)]+/gi, 'file:///<local>')
      .replace(/\b[A-Z]:[\\/][^\s"'<>\r\n)]+/gi, '<local-path>')
      .replace(/(?:\\\\)+[A-Za-z0-9._-]+(?:\\[^\s"'<>]+)?/g, '<network-path>')
      .replace(/\/(?:Users|home)\/[^\s/"'<>]+(?:\/[^\s"'<>)]*)?/gi, '<home>')
      .replace(/(?<![\w.])(?:\d{1,3}\.){3}\d{1,3}(?![\w.])/g, ip => isIP(ip) ? '<ip>' : ip)
      .replace(/(?<![\w:])(?:[0-9a-f]*:){2,}[0-9a-f:.]*(?:%[\w.-]+)?/gi, ip => isIP(ip) ? '<ip>' : ip);
  };
}

export function redactMessages(messages, redact) {
  for (const message of messages) {
    if (typeof message.name === 'string') message.name = redact(message.name);
    for (const block of message.blocks ?? []) {
      for (const key of ['text', 'detail', 'name']) if (typeof block[key] === 'string') block[key] = redact(block[key]);
    }
  }
  return messages;
}
