import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apply } from './lib/index.js';

test('management fallback rejects cross-origin, forged hosts and broken trust services', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-share-trust-'));
  const previous = process.env.DSH_HOME; process.env.DSH_HOME = root;
  try {
    for (const connection of [undefined, { requestRejection() { throw new Error('trust service failed'); } }]) {
      const routes = [];
      apply({ get: name => name === 'connection' ? connection : undefined, webServer: { register: route => routes.push(route) } }, {});
      const route = routes.find(route => route.path === '/share/create');
      async function status(headers, address = '127.0.0.1') {
        let result;
        await route.handler({ method: 'GET', headers, socket: { remoteAddress: address } }, { writeHead(code) { result = code; }, end() {} });
        return result;
      }
      assert.equal(await status({ host: '127.0.0.1:3080', origin: 'https://evil.example' }), 403);
      assert.equal(await status({ host: 'evil.example:3080' }), 403);
      assert.equal(await status({ host: '127.0.0.1:3080', 'sec-fetch-site': 'cross-site' }), 403);
      assert.equal(await status({ host: '127.0.0.1:3080' }, '192.0.2.1'), 403);
      assert.equal(await status({ host: '127.0.0.1:3080', origin: 'http://127.0.0.1:3080' }), connection ? 403 : 405);
    }
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previous;
    await rm(root, { recursive: true, force: true });
  }
});
