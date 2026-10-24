import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker from './dist/server/index.js';

export function database() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('./drizzle/0000_shares.sql', import.meta.url), 'utf8'));
  const prepare = (sql, values = []) => ({
    bind(...args) { return prepare(sql, args); },
    async first() { return db.prepare(sql).get(...values) ?? null; },
    async all() { return { results: db.prepare(sql).all(...values) }; },
    async run() { return { meta: { changes: Number(db.prepare(sql).run(...values).changes) } }; },
  });
  return { prepare, async batch(statements) {
    db.exec('BEGIN');
    try { const results = []; for (const stmt of statements) results.push(await stmt.run()); db.exec('COMMIT'); return results; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  }, close() { db.close(); } };
}
const origin = 'https://share.example';
const fixture = { title: '离线分享验证', messages: [
  { role: 'user', blocks: [{ type: 'text', text: '关掉 DSH 还能看吗？' }] },
  { role: 'assistant', blocks: [{ type: 'text', text: '**可以**。\n\n<script>alert(1)</script>\n\n[恶意](javascript:alert(1))' }] },
] };
const call = (db, path, options) => worker.fetch(new Request(origin + path, options), { DB: db });
const publish = (db, body = { snapshot: fixture }) => call(db, '/v1/share', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('anonymous durable publication, script-free reading and authenticated revocation', async () => {
  const db = database();
  try {
    const created = await publish(db); assert.equal(created.status, 200);
    const result = await created.json(); assert.equal(result.expiresAt, 0); assert.match(result.url, /\/s\/[A-Za-z0-9_-]{24}$/);
    const path = new URL(result.url).pathname;
    const response = await call(db, path); assert.equal(response.status, 200);
    const html = await response.text(); assert.ok(html.includes('离线分享验证')); assert.ok(!html.includes('<script>'));
    assert.ok(response.headers.get('content-security-policy').includes('sandbox'));
    const head = await call(db, path, { method: 'HEAD' }); assert.equal(await head.text(), '');
    assert.equal((await call(db, '/v1/share/' + result.id, { method: 'DELETE' })).status, 403);
    const metadata = await (await call(db, '/v1/share/' + result.id + '/meta')).json(); assert.ok(!JSON.stringify(metadata).includes(result.deleteToken));
    assert.equal((await call(db, '/v1/share/' + result.id, { method: 'DELETE', headers: { authorization: 'Bearer ' + result.deleteToken } })).status, 204);
    assert.equal((await call(db, path)).status, 404);
  } finally { db.close(); }
});
test('validation, expiry, body ceiling, request methods and per-network quota', async () => {
  const db = database();
  try {
    assert.equal((await publish(db, { html: '<script>evil</script>' })).status, 400);
    assert.equal((await publish(db, { snapshot: fixture, ttlSeconds: -1 })).status, 400);
    assert.equal((await publish(db, { snapshot: { ...fixture, title: 'x'.repeat(600000) } })).status, 413);
    const expired = await (await publish(db, { snapshot: fixture, ttlSeconds: 0.001 })).json();
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal((await call(db, new URL(expired.url).pathname)).status, 404);
    assert.equal((await call(db, '/s/' + expired.id, { method: 'POST' })).status, 404);
    for (let i = 0; i < 29; i++) assert.equal((await publish(db)).status, 200);
    assert.equal((await publish(db)).status, 429);
  } finally { db.close(); }
});
