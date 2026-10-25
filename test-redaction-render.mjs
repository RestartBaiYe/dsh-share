import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRedactor, redactSecrets, redactMessages } from './lib/redact.js';
import { renderMarkdown } from './lib/markdown.js';
import { renderSharePage } from './lib/render.js';
import { publishBrewPage } from './lib/brewpage.js';
import { publishAuto } from './lib/publish.js';

test('local identities are scrubbed across path separators, escaped forms and mixed case without corrupting ordinary words',()=>{
  const redact=makeRedactor({home:'C:\\Users\\Alice',cwd:'C:\\Work\\[Project]',userName:'Alice',hostName:'WORK-PC'});
  for(const raw of ['c:/users/aLiCe/private.txt','C:\\USERS\\Alice\\private.txt','C:\\\\Users\\Alice\\\\private.txt','C%3A%5CUsers%5CAlice','C:/Work/[Project]/a.txt','file:///C:/private.txt','\\\\MACHINE\\secret\\x','2001:db8::1','::1','192.0.2.1']){
    const clean=redact(raw);assert.notEqual(clean,raw);assert.ok(!/alice|MACHINE|192\.0\.2\.1/i.test(clean));
  }
  assert.equal(redact('malice Alice WORK-PC'),'malice <user> <host>');
  assert.equal(redact('version 999.999.999.999'),'version 999.999.999.999');
});

test('recognisable credentials are scrubbed in titles, text, tool names and arguments',()=>{
  const token='gh'+'p_'+'a'.repeat(36);
  const raw=`token=${token} password="private phrase" Authorization: Bearer abcdefghijklmnop https://demo:pass@example.com/`;
  const clean=redactSecrets(raw);assert.ok(!clean.includes(token));assert.ok(!clean.includes('private phrase'));assert.ok(!clean.includes('abcdefghijklmnop'));assert.ok(!clean.includes('demo:pass'));
  const key=['-----BEGIN PRIVATE KEY-----','synthetic','-----END PRIVATE KEY-----'].join('\n');assert.equal(redactSecrets(key),'<private-key>');
  const messages=[{name:token,blocks:[{type:'tool',name:token,detail:raw}]}];redactMessages(messages,redactSecrets);assert.ok(!JSON.stringify(messages).includes(token));
});

test('markdown never reparses generated links and handles deeply nested quotes and long fences safely',()=>{
  const html=renderMarkdown('[hello https://example.com](https://target.example/**path**) `<script>`\n\n<script>alert(1)</script>');
  assert.equal((html.match(/<a /g)||[]).length,1);assert.ok(html.includes('href="https://target.example/**path**"'));assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;script&gt;'));
  assert.doesNotThrow(()=>renderMarkdown('> '.repeat(5000)+'nested'));
  const fenced=renderMarkdown('````js\n```\nlet x=1;\n````');assert.ok(fenced.includes('data-lang="js"'));assert.ok(fenced.includes('```\nlet x=1;'));
  const page=renderSharePage({title:'<img src=x onerror=alert(1)>',sharedAt:1,messages:[],truncated:true});assert.ok(!page.includes('<img'));assert.ok(page.includes('UTC'));assert.ok(page.includes('最近的部分消息'));
});

test('oversized uploads fail before contacting a host and unbounded responses are rejected',async()=>{
  let calls=0;
  await assert.rejects(publishBrewPage({html:'x'.repeat(5*1024*1024+1),fetchImpl:async()=>{calls++;}}),/5 MiB/);assert.equal(calls,0);
  await assert.rejects(publishBrewPage({html:'safe',fetchImpl:async()=>{calls++;return new Response('x'.repeat(65537));}}),/数据异常/);assert.equal(calls,1);
  await assert.rejects(publishAuto({html:'safe',fetchImpl:async()=>{calls++;}}),/exactly one/);assert.equal(calls,1);
});
