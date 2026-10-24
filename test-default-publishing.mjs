import assert from 'node:assert/strict';
import test from 'node:test';
import { Readable } from 'node:stream';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apply } from './lib/index.js';

test('an unconfigured relay cannot disclose a conversation to fallback providers', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-share-default-'));
  const previousHome = process.env.DSH_HOME;
  const originalFetch = globalThis.fetch;
  process.env.DSH_HOME = root;
  let networkCalls = 0;
  globalThis.fetch = async () => { networkCalls++; throw new Error('Unexpected network request'); };
  try {
    for (const config of [{}, { githubToken: 'synthetic-unused-token', neocitiesUser: 'synthetic-unused-user' }, { publishProvider: 'relay' }]) {
      const routes = [];
      apply({ get: name => name === 'connection' ? { requestRejection() {} } : undefined, webServer: { register: route => routes.push(route) } }, config);
      async function call(path, method, body) {
        const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
        req.method = method;
        let status, data;
        await routes.find(route => route.path === path).handler(req, { writeHead(code) { status = code; }, end(value) { data = JSON.parse(value); } });
        return { status, data };
      }
      const state = await call('/share/tunnel/status', 'GET');
      assert.equal(state.data.publish.allowed, false, 'unconfigured relay action stays hidden');
      assert.equal(state.data.publish.relay, false);
      assert.equal(state.data.publish.brewpage, true, 'explicit BrewPage sharing remains available');
      assert.equal(state.data.publish.htmlhoster, true);
      const rejected = await call('/share/publish', 'POST', { id: 'abcdef123456abcdef123456' });
      assert.equal(rejected.status, 503);
      assert.equal(rejected.data.code, 'relay-not-configured');
      for (const provider of ['brewpage', 'htmlhoster']) {
        assert.equal((await call('/share/publish', 'POST', { provider })).data.code, 'bad-id', 'explicit provider is not blocked by the absent relay');
      }
    }
    assert.equal(networkCalls, 0, 'no default relay or implicit third-party upload');
  } finally {
    globalThis.fetch = originalFetch;
    if (previousHome === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previousHome;
    await rm(root, { recursive: true, force: true });
  }
});
