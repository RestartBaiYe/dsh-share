import { randomBytes } from 'node:crypto';

const ORIGIN = 'https://brewpage.app';
export const BREWPAGE_TTL_CHOICES = [1, 3, 7, 30];
const ID = /^[A-Za-z0-9_-]{6,128}$/;
const NAMESPACE = /^[a-z0-9-]{1,32}$/;

function shareUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.port || url.username || url.password || !(url.hostname === 'brewpage.app' || url.hostname.endsWith('.brewpage.app'))) throw new Error('BrewPage 返回了无效的分享地址。');
  return url.href;
}

async function request(call, url, options, timeout = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await call(url, { ...options, redirect: 'error', signal: controller.signal });
    const text = options.method === 'HEAD' ? '' : await response.text();
    return { status: response.status, ok: response.ok, text };
  } catch (error) {
    const code = error?.cause?.code || error?.code;
    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') throw new Error('BrewPage 域名解析失败，请检查网络后重试。');
    if (controller.signal.aborted) throw new Error('BrewPage 请求超时，尚未确认操作结果。');
    throw new Error('BrewPage 网络连接失败，请稍后重试。');
  } finally { clearTimeout(timer); }
}

export async function publishBrewPage(options) {
  const ttlDays = options.ttlDays ?? 7;
  if (!Number.isInteger(ttlDays) || ttlDays < 1 || ttlDays > 30) throw new Error('BrewPage 有效期必须为 1～30 天的整数。');
  // A fresh unlisted namespace prevents gallery/sitemap discovery. Never use
  // the default public namespace, and never derive it from the user/session.
  const namespace = 'dsh-share-' + randomBytes(8).toString('hex');
  const endpoint = new URL('/api/html', ORIGIN);
  endpoint.searchParams.set('ns', namespace);
  endpoint.searchParams.set('ttl', String(ttlDays));
  const response = await request(options.fetchImpl ?? fetch, endpoint.href, {
    method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json', 'user-agent': 'dsh-share/0.4.0' },
    body: JSON.stringify({ content: options.html, filename: 'conversation.html' }),
  });
  if (!response.ok) throw new Error(response.status === 429 ? 'BrewPage 上传频率达到限制，请稍后重试。' : `BrewPage HTTP ${response.status}`);
  let body;
  try { body = JSON.parse(response.text); } catch { throw new Error('BrewPage 返回了非 JSON 响应。'); }
  if (!ID.test(body.id ?? '') || body.namespace !== namespace || typeof body.ownerToken !== 'string' || body.ownerToken.length < 8) throw new Error('BrewPage 返回的管理凭据不完整。');
  const expiresAt = typeof body.expiresAt === 'number' ? body.expiresAt : Date.parse(body.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) throw new Error('BrewPage 未返回有效的到期时间。');
  return { provider: 'brewpage', id: body.id, namespace, ownerToken: body.ownerToken, url: shareUrl(body.link), expiresAt, ttlDays, revocable: true };
}

export async function unpublishBrewPage(options) {
  if (!ID.test(options.id ?? '') || !NAMESPACE.test(options.namespace ?? '') || typeof options.ownerToken !== 'string') return false;
  const call = options.fetchImpl ?? fetch;
  try {
    const endpoint = `${ORIGIN}/api/html/${encodeURIComponent(options.namespace)}/${encodeURIComponent(options.id)}`;
    const removed = await request(call, endpoint, { method: 'DELETE', headers: { 'x-owner-token': options.ownerToken, 'user-agent': 'dsh-share/0.4.0' } });
    if (!removed.ok && removed.status !== 404) return false;
    const check = await request(call, shareUrl(options.url), { method: 'HEAD' }, 8000);
    return check.status === 404 || check.status === 410;
  } catch { return false; }
}
