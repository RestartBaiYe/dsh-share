import assert from 'node:assert/strict';
import test from 'node:test';
import { publishBrewPage, unpublishBrewPage } from './lib/brewpage.js';

test('selected lifetime is sent to BrewPage with a fresh unlisted namespace', async () => {
  const namespaces = new Set();
  for (const days of [1, 3, 7, 30]) {
    const expected = Date.now() + days * 86400000;
    const result = await publishBrewPage({ html: '<h1>你好</h1>', ttlDays: days, fetchImpl: async (url, init) => {
      const endpoint = new URL(url); const ns = endpoint.searchParams.get('ns');
      assert.equal(endpoint.origin, 'https://brewpage.app'); assert.equal(endpoint.pathname, '/api/html');
      assert.match(ns, /^dsh-share-[0-9a-f]{16}$/); assert.ok(!namespaces.has(ns)); namespaces.add(ns);
      assert.equal(endpoint.searchParams.get('ttl'), String(days)); assert.equal(init.redirect, 'error');
      assert.deepEqual(JSON.parse(init.body), { content: '<h1>你好</h1>', filename: 'conversation.html' });
      return Response.json({ id: 'aB3xK9mP2q', namespace: ns, link: 'https://c7k2v9m4t8.brewpage.app/', ownerToken: 'private-owner-key', expiresAt: new Date(expected).toISOString() });
    } });
    assert.equal(result.ttlDays, days); assert.equal(result.expiresAt, expected); assert.equal(result.url, 'https://c7k2v9m4t8.brewpage.app/');
    assert.equal(result.ownerToken, 'private-owner-key');
  }
});

test('invalid lifetimes never upload; quota failures do not retry or leak response data', async () => {
  let calls = 0;
  const call = async () => { calls++; return new Response('private-response-data', { status: 429 }); };
  for (const ttlDays of [0, -1, 31, 1.5, '7', Infinity]) await assert.rejects(publishBrewPage({ html: 'x', ttlDays, fetchImpl: call }), /1～30/);
  assert.equal(calls, 0);
  await assert.rejects(publishBrewPage({ html: 'x', ttlDays: 7, fetchImpl: call }), error => !error.message.includes('private-response-data') && /频率/.test(error.message));
  assert.equal(calls, 1);
});

test('management credentials are only sent to the fixed apex DELETE endpoint', async () => {
  const options = { id: 'aB3xK9mP2q', namespace: 'dsh-share-0123456789abcdef', ownerToken: 'private-owner-key', url: 'https://c7k2v9m4t8.brewpage.app/' };
  const fetchImpl = (readStatus, deleteStatus = 204) => async (url, init) => {
    if (init.method === 'DELETE') {
      assert.equal(url, 'https://brewpage.app/api/html/dsh-share-0123456789abcdef/aB3xK9mP2q');
      assert.equal(init.headers['x-owner-token'], options.ownerToken);
      return new Response(null, { status: deleteStatus });
    }
    assert.equal(url, options.url); assert.equal(init.headers?.['x-owner-token'], undefined);
    return new Response(null, { status: readStatus });
  };
  assert.equal(await unpublishBrewPage({ ...options, fetchImpl: fetchImpl(404) }), true);
  assert.equal(await unpublishBrewPage({ ...options, fetchImpl: fetchImpl(410, 404) }), true);
  assert.equal(await unpublishBrewPage({ ...options, fetchImpl: fetchImpl(200) }), false);
  assert.equal(await unpublishBrewPage({ ...options, fetchImpl: fetchImpl(404, 403) }), false);
  assert.equal(await unpublishBrewPage({ ...options, namespace: '../public', fetchImpl: async () => { throw new Error('must not call'); } }), false);
});
