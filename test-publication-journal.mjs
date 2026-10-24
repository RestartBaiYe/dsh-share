import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createShareStore } from './lib/store.js';

test('restart recovers publication credentials after interrupted index commit', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-share-journal-'));
  const id = 'journal12345';
  try {
    const store = createShareStore({ root });
    await store.create({ id, sessionId: 'session', title: 'test', messages: [] });
    await store.create({ id: 'damaged12345', sessionId: 'other', title: 'other', messages: [] });
    await store.stagePublication(id, { publishedProvider: 'htmlhoster', publishedUrl: 'https://htmlhoster.com/p/x/index.html', htmlhosterDeleteToken: 'private-journal-key' });
    await writeFile(join(root, 'pending-publications', 'damaged12345.json'), '{invalid');
    // Simulate a crash before store.update(): the index contains no keys.
    assert.ok(!(await readFile(join(root, 'index.json'), 'utf8')).includes('private-journal-key'));
    const restarted = createShareStore({ root });
    const row = (await restarted.readIndex()).shares[id];
    assert.equal(row.htmlhosterDeleteToken, 'private-journal-key');
    await restarted.update(id, { publishRevocable: true });
    assert.equal((await restarted.readIndex()).shares[id].htmlhosterDeleteToken, 'private-journal-key');
    await assert.rejects(readFile(join(root, 'pending-publications', id + '.json')), { code: 'ENOENT' });
    await restarted.remove(id);
    assert.equal((await restarted.readIndex()).shares[id], undefined);
  } finally { await rm(root, { recursive: true, force: true }); }
});
