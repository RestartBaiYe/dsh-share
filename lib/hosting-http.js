/** Bounded hosting responses. Uploads are never automatically retried. */
export const USER_AGENT = 'dsh-share/0.5.0';
export const MAX_HTML_BYTES = 5 * 1024 * 1024;

export function validateHtml(html) {
  if (typeof html !== 'string' || !html.trim()) throw new Error('没有可上传的网页内容。');
  if (Buffer.byteLength(html) > MAX_HTML_BYTES) throw new Error('网页超过 5 MiB，请减少分享的消息数量。');
}

export async function hostingRequest(call, url, options, timeout = 20000, service = '托管服务') {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await call(url, { ...options, redirect: 'error', signal: controller.signal });
    let text = '';
    if (options.method === 'HEAD') await response.body?.cancel();
    else if (response.body?.getReader) {
      const reader = response.body.getReader();
      const chunks = []; let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > 64 * 1024) { await reader.cancel(); throw new Error('oversized-response'); }
          chunks.push(Buffer.from(value));
        }
      } finally { reader.releaseLock(); }
      text = Buffer.concat(chunks).toString('utf8');
    } else {
      text = await response.text();
      if (Buffer.byteLength(text) > 64 * 1024) throw new Error('oversized-response');
    }
    return { status: response.status, ok: response.ok, text };
  } catch (error) {
    const code = error?.cause?.code || error?.code;
    if (error.message === 'oversized-response') throw new Error(`${service} 返回的数据异常；尚未确认操作结果。`);
    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') throw new Error(`${service} 域名解析失败，请检查网络后重试。`);
    if (controller.signal.aborted) throw new Error(`${service} 请求超时，尚未确认操作结果；未自动重试上传。`);
    throw new Error(`${service} 网络连接失败，请稍后重试。`);
  } finally { clearTimeout(timer); }
}
