import assert from 'node:assert/strict';
import test from 'node:test';
import { publishHtmlHoster, unpublishHtmlHoster } from './lib/htmlhoster.js';

test('explicit HTML upload uses documented multipart fields and returns private revocation credentials', async () => {
  const p = await publishHtmlHoster({ html: '<h1>测试</h1>', fetchImpl: async (url, init) => {
    assert.equal(url, 'https://api.htmlhoster.com/agent/upload'); assert.equal(init.method, 'POST');
    assert.equal(init.body.get('files').name, 'index.html'); assert.equal(await init.body.get('files').text(), '<h1>测试</h1>');
    assert.equal(init.redirect, 'error');
    return Response.json({ uploadId: 'upload_123', entryUrl: 'https://htmlhoster.com/p/upload_123/index.html', deleteToken: 'private-delete-secret' });
  } });
  assert.equal(p.provider, 'htmlhoster'); assert.equal(p.revocable, true); assert.equal(p.deleteToken, 'private-delete-secret');
});
test('reject invalid hosts, missing management keys, unsupported expiry and quota errors', async () => {
  const options = { html: 'test', fetchImpl: async () => Response.json({ uploadId: 'upload_123', entryUrl: 'https://evil.example/page', deleteToken: 'private-delete-secret' }) };
  await assert.rejects(publishHtmlHoster(options), /invalid public URL/);
  await assert.rejects(publishHtmlHoster({ ...options, fetchImpl: async () => Response.json({ entryUrl: 'https://htmlhoster.com/p/x' }) }), /删除凭据/);
  await assert.rejects(publishHtmlHoster({ ...options, ttlSeconds: 60 }), /自动到期/);
  let calls = 0;
  await assert.rejects(publishHtmlHoster({ html: 'x', fetchImpl: async () => { calls++; return new Response(null, { status: 429 }); } }), e => e.status === 429);
  assert.equal(calls, 1, 'no quota retries');
});
test('deletion only succeeds after confirming the public page is gone', async () => {
  const opts = { id: 'upload_123', url: 'https://htmlhoster.com/p/upload_123/index.html', deleteToken: 'private-delete-secret' };
  const call = (headStatus, deleteStatus = 200) => async (url, init) => {
    if (init.method === 'DELETE') { assert.equal(init.headers['x-delete-token'], opts.deleteToken); return new Response(null, { status: deleteStatus }); }
    assert.equal(init.method, 'HEAD'); return new Response(null, { status: headStatus });
  };
  assert.equal(await unpublishHtmlHoster({ ...opts, fetchImpl: call(200) }), false);
  assert.equal(await unpublishHtmlHoster({ ...opts, fetchImpl: call(404) }), true);
  assert.equal(await unpublishHtmlHoster({ ...opts, fetchImpl: call(200, 401) }), false);
  assert.equal(await unpublishHtmlHoster({ ...opts, fetchImpl: call(404, 401) }), true);
  assert.equal(await unpublishHtmlHoster({ ...opts, fetchImpl: async () => { throw new Error('offline'); } }), false);
});
