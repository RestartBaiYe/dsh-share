import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { apply } from './lib/index.js';

test('plugin publishes durable links, reuses publication and preserves credentials on revoke failure', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-share-flow-'));
  const oldHome = process.env.DSH_HOME; process.env.DSH_HOME = root;
  const originalFetch = globalThis.fetch;
  const routes = [], disposers = [];
  let uploads = 0, revokeFails = false, offline = false, removed = false;
  let htmlUploads = 0, htmlGone = false;
  let brewUploads = 0, brewGone = false, brewRevokeFails = false;
  let brewExpiry = 0;
  globalThis.fetch = async (url, init = {}) => {
    if (String(url).startsWith('https://brewpage.app/api/html')) {
      if (init.method === 'POST') {
        brewUploads++;
        const endpoint = new URL(url); const ns = endpoint.searchParams.get('ns');
        brewExpiry = Date.now() + Number(endpoint.searchParams.get('ttl')) * 86400000; brewGone = false;
        return Response.json({ id: 'aB3xK9mP2q', namespace: ns, link: 'https://canary1.brewpage.app/', ownerToken: 'brew-private-token', expiresAt: new Date(brewExpiry).toISOString() });
      }
      if (brewRevokeFails) return new Response(null, { status: 503 });
      brewGone = true; return new Response(null, { status: 204 });
    }
    if (String(url).startsWith('https://canary1.brewpage.app')) return new Response(null, { status: brewGone ? 404 : 200 });
    if (String(url).startsWith('https://api.htmlhoster.com')) {
      if (init.method === 'POST') { htmlUploads++; return Response.json({ uploadId: 'upload123', entryUrl: 'https://htmlhoster.com/p/upload123/index.html', deleteToken: 'html-secret-delete' }); }
      return new Response(null, { status: htmlGone ? 401 : 200 });
    }
    if (String(url).startsWith('https://htmlhoster.com')) return new Response(null, { status: htmlGone ? 404 : 200 });
    if (!String(url).startsWith('https://cloud.example')) return originalFetch(url, init);
    if (offline) throw new Error('offline');
    if (init.method === 'HEAD') return new Response(null, { status: removed ? 404 : 200 });
    if (init.method === 'DELETE') { if (revokeFails) return new Response(null, { status: 503 }); removed = true; return new Response(null, { status: 204 }); }
    if (init.method === 'POST') {
      uploads++;
      const body = JSON.parse(init.body);
      assert.ok(body.snapshot.messages.length === 2);
      assert.ok(!JSON.stringify(body.snapshot).includes('internal-session'));
      assert.ok(!JSON.stringify(body.snapshot).includes('cwd'));
      assert.equal(body.ttlSeconds, undefined);
      removed = false;
      return Response.json({ ok: true, id: 'abcdef123456abcdef123456', url: 'https://cloud.example/s/abcdef123456abcdef123456', deleteToken: 'secret-delete-token', expiresAt: 0 });
    }
    return new Response(null, { status: 200 });
  };
  apply({
    get(name) {
      if (name === 'connection') return { requestRejection: () => undefined };
      if (name === 'sessionQuery') return {
        readTitle: async () => '分享流程测试',
        readSurface: async () => ({ session: { id: 'internal-session', cwd: root }, capturedThroughSeq: 2, events: [
          { seq: 1, type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text: '问题' }] } },
          { seq: 2, type: 'assistant/message', data: { message: { content: [{ type: 'text', text: '回答' }] } } },
        ] }),
      };
    },
    effect(fn) { const dispose = fn(); if (dispose) disposers.push(dispose); },
    webServer: { register(route) { routes.push(route); }, getOrigin: () => '' },
  }, { relayUrl: 'https://cloud.example', publicTunnel: true });
  const server = createServer((req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname;
    const route = routes.find(r => r.kind === 'exact' && r.path === path) || routes.find(r => r.kind === 'prefix' && path.startsWith(r.path));
    Promise.resolve(route?.handler(req, res)).catch(e => { res.statusCode = 500; res.end(e.message); });
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port;
  const post = (path, body) => originalFetch(base + '/share/' + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  try {
    const created = await (await post('create', { sessionId: 'internal-session' })).json(); assert.ok(created.ok);
    const published = await (await post('publish', { id: created.id })).json(); assert.equal(published.provider, 'relay');
    const repeated = await (await post('publish', { id: created.id })).json(); assert.equal(repeated.url, published.url); assert.equal(uploads, 1);
    assert.equal((await post('publish', { id: created.id, provider: 'htmlhoster' })).status, 502, 'switching a published snapshot requires revocation first');
    assert.equal(htmlUploads, 0);
    const listed = await (await originalFetch(base + '/share/list?sessionId=internal-session')).text();
    assert.ok(!listed.includes('secret-delete-token')); assert.ok(!listed.includes('internal-session'));
    revokeFails = true; assert.equal((await post('revoke', { id: created.id })).status, 502);
    assert.equal((await originalFetch(base + '/share/' + created.id)).status, 200);
    revokeFails = false; assert.equal((await post('revoke', { id: created.id })).status, 200);
    assert.equal((await originalFetch(base + '/share/' + created.id)).status, 404);
    const next = await (await post('create', { sessionId: 'internal-session' })).json();
    offline = true; assert.equal((await post('publish', { id: next.id })).status, 502);
    assert.equal(htmlUploads, 0, 'relay failure never discloses data to HTML Hoster');
    assert.equal(brewUploads, 0, 'relay failure never discloses data to BrewPage');
    assert.equal((await post('publish', { id: next.id, provider: 'unknown' })).status, 400);
    const hosted = await (await post('publish', { id: next.id, provider: 'htmlhoster' })).json();
    assert.equal(hosted.provider, 'htmlhoster'); assert.equal(htmlUploads, 1);
    assert.equal((await (await post('publish', { id: next.id, provider: 'htmlhoster' })).json()).url, hosted.url); assert.equal(htmlUploads, 1);
    const htmlListing = await (await originalFetch(base + '/share/list?sessionId=internal-session')).text(); assert.ok(!htmlListing.includes('html-secret-delete'));
    assert.equal((await post('revoke', { id: next.id })).status, 502, 'pending CDN purge retains management credentials');
    htmlGone = true; assert.equal((await post('revoke', { id: next.id })).status, 200);
    const timed = await (await post('create', { sessionId: 'internal-session' })).json();
    for (const ttlDays of [0, 2, 31, '7']) assert.equal((await post('publish', { id: timed.id, provider: 'brewpage', ttlDays })).status, 400);
    assert.equal(brewUploads, 0);
    const timedLink = await (await post('publish', { id: timed.id, provider: 'brewpage', ttlDays: 3 })).json();
    assert.equal(timedLink.provider, 'brewpage'); assert.equal(timedLink.ttlDays, 3); assert.equal(timedLink.expiresAt, brewExpiry);
    assert.equal((await post('publish', { id: timed.id, provider: 'brewpage', ttlDays: 7 })).status, 502, 'do not silently extend a live share');
    const reused = await (await post('publish', { id: timed.id, provider: 'brewpage', ttlDays: 3 })).json();
    assert.equal(reused.url, timedLink.url); assert.equal(reused.expiresAt, timedLink.expiresAt); assert.equal(brewUploads, 1);
    const timedList = await (await originalFetch(base + '/share/list?sessionId=internal-session')).text();
    assert.ok(!timedList.includes('brew-private-token')); assert.equal(JSON.parse(timedList).shares[0].ttlDays, 3);
    brewRevokeFails = true; assert.equal((await post('revoke', { id: timed.id })).status, 502);
    brewRevokeFails = false; assert.equal((await post('revoke', { id: timed.id })).status, 200);
    const state = await (await originalFetch(base + '/share/tunnel/status')).json();
    assert.equal(state.phase, 'stopped', 'publishing failure must never start a tunnel');
  } finally {
    globalThis.fetch = originalFetch; if (oldHome === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = oldHome;
    for (const dispose of disposers) dispose();
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});
