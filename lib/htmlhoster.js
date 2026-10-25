import { hostingRequest, USER_AGENT, validateHtml } from './hosting-http.js';
/** Explicitly selected, account-free HTML hosting. Never an automatic fallback. */
export const HTMLHOSTER_API = 'https://api.htmlhoster.com';

export class HostingError extends Error {
  constructor(message, status) { super(message); this.name = 'HostingError'; this.status = status; }
}
function publicUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.port || url.username || url.password || !(url.hostname === 'htmlhoster.com' || url.hostname.endsWith('.htmlhoster.com'))) throw new HostingError('HTML Hoster returned an invalid public URL');
  return url.href;
}
const request = (call, url, options, timeout) => hostingRequest(call, url, options, timeout, 'HTML Hoster');

export async function publishHtmlHoster(options) {
  validateHtml(options.html);
  if (Number(options.ttlSeconds) > 0) throw new HostingError('HTML Hoster 无法保证自动到期，请使用 DSH Share。');
  const form = new FormData();
  form.append('files', new Blob([options.html], { type: 'text/html' }), 'index.html');
  const response = await request(options.fetchImpl ?? fetch, HTMLHOSTER_API + '/agent/upload', {
    method: 'POST', headers: { 'user-agent': USER_AGENT }, body: form,
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
      method: 'DELETE', headers: { 'x-delete-token': options.deleteToken, 'user-agent': USER_AGENT },
    });
    if (response.ok || response.status === 401 || response.status === 404) {
      const check = await request(call, publicUrl(options.url), { method: 'HEAD' }, 8000);
      return check.status === 404 || check.status === 410;
    }
    return false;
  } catch { return false; }
}
