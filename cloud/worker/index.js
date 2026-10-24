// Bundled with the script-free plugin renderer by build.mjs.
const MAX_BYTES = 512 * 1024;
const MAX_TOTAL_BYTES = 128 * 1024 * 1024;
const ID = /^[A-Za-z0-9_-]{24}$/;
const CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; sandbox";
const commonHeaders = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'x-robots-tag': 'noindex, nofollow, noarchive' };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...commonHeaders, 'content-type': 'application/json; charset=utf-8' } });
const page = (html, status = 200, head = false) => new Response(head ? null : html, { status, headers: { ...commonHeaders, 'content-type': 'text/html; charset=utf-8', 'content-security-policy': CSP } });
const missing = () => page('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>分享已失效</title><body style="font:16px/1.8 system-ui;padding:12vh 24px;text-align:center"><h1>分享不存在或已撤销</h1><p>请向分享者索取新的链接。</p></body></html>', 404);
const randomToken = bytes => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(bytes)))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
const digest = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2, '0')).join('');

async function boundedJSON(request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('bad-json');
  let size = 0;
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) { await reader.cancel(); throw new Error('too-large'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

// Never host client-supplied HTML: accept just conversation display fields.
function cleanSnapshot(value, now) {
  if (!value || !Array.isArray(value.messages) || value.messages.length === 0 || value.messages.length > 1000) throw new Error('bad-snapshot');
  const messages = value.messages.map(m => {
    if (!['user', 'assistant', 'tool'].includes(m?.role) || !Array.isArray(m.blocks)) throw new Error('bad-snapshot');
    const blocks = m.blocks.map(b => {
      if (!['text', 'reasoning', 'tool'].includes(b?.type) || (b.type !== 'tool' && typeof b.text !== 'string')) throw new Error('bad-snapshot');
      return { type: b.type, text: typeof b.text === 'string' ? b.text : '', ...(typeof b.detail === 'string' ? { detail: b.detail } : {}), ...(typeof b.name === 'string' ? { name: b.name.slice(0, 200) } : {}) };
    });
    return { role: m.role, blocks, name: typeof m.name === 'string' ? m.name.slice(0, 200) : undefined, isError: m.isError === true };
  });
  return { title: typeof value.title === 'string' ? value.title.slice(0, 200) : 'DSH 对话', sharedAt: now, messages, messageCount: messages.length, turnCount: messages.filter(m => m.role === 'user').length };
}

async function handle(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (path === '/' && ['GET', 'HEAD'].includes(request.method)) return page('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>DSH Share</title><body style="margin:0;background:#f6f7fb;color:#20263a;font:16px/1.8 system-ui"><main style="max-width:680px;margin:12vh auto;padding:32px"><p style="color:#4d6bfe">DSH SHARE · 对话快照</p><h1 style="font-size:40px;line-height:1.3">好对话，随时打开。</h1><p>从 DSH 的「分享」按钮生成只读链接。无需注册新账号，关闭 DSH 后仍可查看。</p><p>拿到完整分享链接即可阅读；对话不会列在首页。发布者可在 DSH 中撤销。</p><p style="color:#657084;font-size:14px">只保存主动分享的快照。服务默认不设到期日，受服务可用性与存储额度限制；请保留重要对话的导出文件。</p></main></body></html>', 200, request.method === 'HEAD');
  if (path === '/healthz' && ['GET', 'HEAD'].includes(request.method)) {
    if (!env.DB) return json({ ok: false, code: 'storage-unavailable' }, 503);
    await env.DB.prepare('SELECT 1 FROM shares LIMIT 1').all();
    return json({ ok: true, service: 'dsh-share', protocol: 2, maxSnapshotBytes: MAX_BYTES, defaultTtlSeconds: 0 });
  }
  if (!env.DB) return json({ ok: false, code: 'storage-unavailable' }, 503);
  const now = Date.now();
  if (path === '/v1/share' && request.method === 'POST') {
    let body, snapshot;
    try { body = await boundedJSON(request); snapshot = cleanSnapshot(body.snapshot, now); }
    catch (e) { return json({ ok: false, code: e.message === 'too-large' ? 'too-large' : 'bad-snapshot' }, e.message === 'too-large' ? 413 : 400); }
    const html = renderSharePage(snapshot, { siteName: 'DeepSeek Harness' });
    const size = new TextEncoder().encode(html).byteLength;
    if (size > MAX_BYTES) return json({ ok: false, code: 'too-large' }, 413);
    const ttl = Number(body.ttlSeconds);
    if (body.ttlSeconds !== undefined && (!Number.isFinite(ttl) || ttl < 0)) return json({ ok: false, code: 'bad-ttl' }, 400);
    const expiresAt = ttl > 0 ? now + Math.min(ttl, 315360000) * 1000 : 0;
    const id = randomToken(18), deleteToken = randomToken(32);
    const hash = await digest(deleteToken);
    // Bucket addresses by hour, keep only their hash, discard them after 2 hours.
    const bucket = await digest((request.headers.get('cf-connecting-ip') || 'unknown') + ':' + Math.floor(now / 3600000));
    const results = await env.DB.batch([
      env.DB.prepare('DELETE FROM shares WHERE expires_at > 0 AND expires_at <= ?').bind(now),
      env.DB.prepare('DELETE FROM upload_rates WHERE expires_at <= ?').bind(now),
      env.DB.prepare('INSERT INTO upload_rates(bucket,hits,expires_at) VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET hits=hits+1').bind(bucket, now + 7200000),
      env.DB.prepare('INSERT INTO shares(id,html,title,created_at,expires_at,bytes,delete_hash) SELECT ?,?,?,?,?,?,? WHERE (SELECT hits FROM upload_rates WHERE bucket=?) <= 30 AND (SELECT COUNT(*) FROM shares) < 10000 AND (SELECT COALESCE(SUM(bytes),0) FROM shares) + ? <= ?').bind(id, html, snapshot.title, now, expiresAt, size, hash, bucket, size, MAX_TOTAL_BYTES),
    ]);
    if (results[3].meta.changes !== 1) {
      const rate = await env.DB.prepare('SELECT hits FROM upload_rates WHERE bucket=?').bind(bucket).first();
      return json({ ok: false, code: rate?.hits > 30 ? 'rate-limited' : 'relay-full' }, rate?.hits > 30 ? 429 : 507);
    }
    return json({ ok: true, id, url: url.origin + '/s/' + id, deleteToken, expiresAt });
  }
  const match = path.match(/^\/(s|v1\/share)\/([A-Za-z0-9_-]+)(\/meta)?$/);
  if (!match || !ID.test(match[2])) return missing();
  const [, surface, id, meta] = match;
  if (surface === 's' && (meta || !['GET', 'HEAD'].includes(request.method))) return missing();
  if (surface === 'v1/share' && !(meta && request.method === 'GET') && !(!meta && request.method === 'DELETE')) return json({ ok: false, code: 'method-not-allowed' }, 405);
  const row = await env.DB.prepare('SELECT * FROM shares WHERE id=?').bind(id).first();
  if (!row || (row.expires_at > 0 && row.expires_at <= now)) return missing();
  if (surface === 's') return page(row.html, 200, request.method === 'HEAD');
  if (meta) return json({ ok: true, title: row.title, createdAt: row.created_at, expiresAt: row.expires_at });
  const token = request.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
  if (!token || await digest(token) !== row.delete_hash) return json({ ok: false, code: 'forbidden' }, 403);
  await env.DB.prepare('DELETE FROM shares WHERE id=?').bind(id).run();
  return new Response(null, { status: 204, headers: commonHeaders });
}

export default { async fetch(request, env) {
  try { return await handle(request, env); }
  catch { return json({ ok: false, code: 'service-unavailable' }, 503); }
} };
