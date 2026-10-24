/** Live smoke test: synthetic text only; the publishing child exits before reading. */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { renderSharePage } from './lib/render.js';
import { publishRelay, unpublishRelay } from './lib/publish.js';
import { publishHtmlHoster, unpublishHtmlHoster } from './lib/htmlhoster.js';
import { publishBrewPage, unpublishBrewPage } from './lib/brewpage.js';

const args = process.argv.slice(2);
const provider = args[args.indexOf('--provider') + 1];
if (!['relay', 'htmlhoster', 'brewpage'].includes(provider)) throw new Error('Use --provider relay, htmlhoster or brewpage');
const ttlDays = args.includes('--ttl-days') ? Number(args[args.indexOf('--ttl-days') + 1]) : 1;
const relayUrl = process.env.DSH_SHARE_RELAY_URL || '';
if (provider === 'relay' && !relayUrl) throw new Error('Set DSH_SHARE_RELAY_URL to your relay URL before testing it');
const marker = 'dsh-share-synthetic-public-test';
const snapshot = { title: 'DSH Share 云端验证', sharedAt: Date.now(), messages: [
  { role: 'user', blocks: [{ type: 'text', text: '这是程序生成的测试对话，不含用户聊天记录。' }] },
  { role: 'assistant', blocks: [{ type: 'text', text: marker }] },
] };
if (args.includes('--publish-only')) {
  const publish = provider === 'brewpage' ? publishBrewPage : provider === 'htmlhoster' ? publishHtmlHoster : publishRelay;
  const result = await publish({ relayUrl, snapshot, html: renderSharePage(snapshot), title: snapshot.title, ttlDays });
  // This output is consumed by the parent pipe, never displayed in tool output.
  process.stdout.write(JSON.stringify(result));
} else {
  let published;
  const revoke = provider === 'brewpage' ? unpublishBrewPage : provider === 'htmlhoster' ? unpublishHtmlHoster : unpublishRelay;
  try {
    const child = await promisify(execFile)(process.execPath, [fileURLToPath(import.meta.url), '--provider', provider, '--ttl-days', String(ttlDays), '--publish-only'], { timeout: 30000, windowsHide: true, maxBuffer: 16384 });
    published = JSON.parse(child.stdout);
    const page = await fetch(published.url, { signal: AbortSignal.timeout(12000), redirect: 'error' });
    assert.equal(page.status, 200); assert.ok((await page.text()).includes(marker));
    if (provider === 'brewpage') assert.ok(Math.abs(published.expiresAt - Date.now() - ttlDays * 86400000) < 120000, 'server expiry must match selected duration');
    console.log(JSON.stringify({ provider, publisherExited: true, readerStatus: page.status, markerMatched: true, ttlDays: published.ttlDays, expiresAt: published.expiresAt }));
  } finally {
    if (published) {
      const removed = await revoke({ relayUrl, id: published.id, deleteToken: published.deleteToken, url: published.url, namespace: published.namespace, ownerToken: published.ownerToken });
      const check = await fetch(published.url, { method: 'HEAD', signal: AbortSignal.timeout(12000) });
      console.log(JSON.stringify({ provider, revoked: removed, afterRevoke: check.status }));
      assert.ok(removed); assert.ok([404, 410].includes(check.status));
    }
  }
}
