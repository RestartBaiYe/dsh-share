import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
test('dialog renders hosted link and clears it after revoke', async () => {
  let definition, Component, cursor = 0, revoked = false;
  const publishedBodies = [];
  const states = [], effects = [];
  const react = {
    Fragment: Symbol('Fragment'),
    createElement(type, props, ...children) {
      if (typeof type === 'function') return type({ ...props, children });
      for (const c of children.flat(Infinity)) if (c && typeof c === 'object') assert.ok('type' in c, 'invalid object used as React child');
      return { type, props: props || {}, children };
    },
    useState(value) { const index = cursor++; if (!(index in states)) states[index] = value; return [states[index], next => { states[index] = next; }]; },
    useRef(value) { const index = cursor++; return states[index] ||= { current: value }; },
    useCallback(fn) { return fn; }, useEffect(fn, deps) { const i = cursor++; const old = states[i]; if (!old || deps.some((v, j) => v !== old[j])) { states[i] = deps; effects.push(fn); } },
  };
  const window = { addEventListener() {}, removeEventListener() {}, __ModuleLoader__: { load(d) { definition = d; } } };
  const navigator = { language: 'zh-CN', clipboard: { async writeText() {} } };
  const fetch = async (url, init) => {
    if (url.endsWith('/publish')) publishedBodies.push(JSON.parse(init.body));
    const payload = url.endsWith('/create') ? { ok: true, id: 'abcdefgh1234', url: 'http://localhost/share/abcdefgh1234' }
      : url.endsWith('/publish') ? { ok: true, provider: publishedBodies.at(-1).provider || 'relay', url: 'https://cloud.example/s/abc', ...(publishedBodies.at(-1).provider === 'brewpage' ? { expiresAt: Date.now() + publishedBodies.at(-1).ttlDays * 86400000 } : {}) }
      : url.endsWith('/revoke') ? (revoked = true, { ok: true }) : url.endsWith('/tunnel/status') ? { ok: true, allowed: false, publish: { allowed: true, htmlhoster: true, brewpage: true } } : { ok: true, shares: [] };
    return { status: 200, ok: true, json: async () => payload };
  };
  new Function('window', 'navigator', 'fetch', readFileSync(new URL('lib/client.js', import.meta.url), 'utf8'))(window, navigator, fetch);
  definition.factory(name => { assert.equal(name, 'react'); return react; }).apply({ slots: { inject(_, fn) { fn(); }, register(_, C) { Component = C; } } });
  const render = () => { cursor = 0; const tree = Component({ sessionId: 's1' }); for (const effect of effects.splice(0)) effect(); return tree; };
  const all = node => Array.isArray(node) ? node.flatMap(all) : !node || typeof node !== 'object' ? [] : [node, ...(node.children || []).flatMap(all)];
  const text = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(text).join('') : (node?.children || []).map(text).join('');
  const click = async (tree, label) => {
    const found = all(tree).find(n => n.type === 'button' && text(n) === label); assert.ok(found, label); await found.props.onClick();
  };
  await click(render(), '分享');
  render(); await new Promise(resolve => setTimeout(resolve, 0));
  await click(render(), '生成分享链接');
  assert.equal(publishedBodies[0].provider, undefined, 'default action never selects HTML Hoster');
  assert.ok(all(render()).some(n => n.props.value === 'https://cloud.example/s/abc'));
  await click(render(), '撤销分享'); assert.ok(revoked);
  assert.ok(!all(render()).some(n => n.props.value === 'https://cloud.example/s/abc'));
  await click(render(), '分享'); render(); await new Promise(resolve => setTimeout(resolve, 0));
  await click(render(), '使用 HTML Hoster 分享');
  assert.equal(publishedBodies[1].provider, 'htmlhoster', 'manual button names the destination');
  await click(render(), '撤销分享');
  await click(render(), '分享'); render(); await new Promise(resolve => setTimeout(resolve, 0));
  const select = all(render()).find(node => node.type === 'select');
  assert.deepEqual(all(select).filter(node => node.type === 'option').map(node => node.props.value), [1,3,7,30]);
  assert.equal(select.props.value, 7);
  select.props.onChange({ target: { value: '3' } });
  await click(render(), '使用 BrewPage 限时分享');
  assert.equal(publishedBodies[2].provider, 'brewpage'); assert.equal(publishedBodies[2].ttlDays, 3);
  assert.ok(text(render()).includes('到期时间'));
  assert.ok(!all(render()).some(node => node.type === 'select'), 'published expiry cannot be edited');
});
