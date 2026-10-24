/** Explicitly selected, account-free HTML hosting. Never an automatic fallback. */
export const HTMLHOSTER_API = 'https://api.htmlhoster.com';

export class HostingError extends Error {
  constructor(message, status) { super(message); this.name = 'HostingError'; this.status = status; }
}
function publicUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || !(url.hostname === 'htmlhoster.com' || url.hostname.endsWith('.htmlhoster.com'))) throw new HostingError('HTML Hoster returned an invalid public URL');
  return url.href;
}
async function request(call, url, options, timeout = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await call(url, { ...options, redirect: 'error', signal: controller.signal });
    // Consume the body within the deadline too, not just the response headers.
    const text = options.method === 'HEAD' ? '' : await response.text();
    return { status: response.status, ok: response.ok, text };
  } catch (error) {
    const code = error?.cause?.code || error?.code;
    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') throw new HostingError('HTML Hoster 域名解析失败，请检查网络后重试。');
    if (controller.signal.aborted) throw new HostingError('HTML Hoster 请求超时，未确认发布结果；请稍后重试。');
    throw new HostingError('HTML Hoster 网络连接失败，请稍后重试。');
  } finally { clearTimeout(timer); }
}
export async function publishHtmlHoster(options) {
  if (Number(options.ttlSeconds) > 0) throw new HostingError('HTML Hoster 无法保证自动到期，请使用 DSH Share。');
  const form = new FormData();
  form.append('files', new Blob([options.html], { type: 'text/html' }), 'index.html');
  const response = await request(options.fetchImpl ?? fetch, HTMLHOSTER_API + '/agent/upload', {
    method: 'POST', headers: { 'user-agent': 'dsh-share/0.3.0' }, body: form,
  });
  if (!response.ok) throw new HostingError(response.status === 429 ? 'HTML Hoster 今日上传额度已用完，请等待额度重置。' : `HTML Hoster HTTP ${response.status}`, response.status);
  let body;
  try { body = JSON.parse(response.text); } catch { throw new HostingError('HTML Hoster 返回了非 JSON 响应。'); }
  if (typeof body.uploadId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(body.uploadId) || typeof body.deleteToken !== 'string' || body.deleteToken.length < 8) throw new HostingError('HTML Hoster 返回的删除凭据不完整。');
  return { provider: 'htmlhoster', url: publicUrl(body.entryUrl), id: body.uploadId, deleteToken: body.deleteToken, revocable: true, expiresAt: 0 };
}
/** Do not assume a repeated 401 means deleted: verify the public page first. */
export async function unpublishHtmlHoster(options) {
  if (typeof options.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(options.id) || typeof options.deleteToken !== 'string') return false;
  const call = options.fetchImpl ?? fetch;
  try {
    const response = await request(call, HTMLHOSTER_API + '/api/uploads/' + encodeURIComponent(options.id), {
      method: 'DELETE', headers: { 'x-delete-token': options.deleteToken, 'user-agent': 'dsh-share/0.3.0' },
    });
    if (response.ok || response.status === 401 || response.status === 404) {
      const check = await request(call, publicUrl(options.url), { method: 'HEAD' }, 8000);
      return check.status === 404 || check.status === 410;
    }
    return false;
  } catch { return false; }
}
