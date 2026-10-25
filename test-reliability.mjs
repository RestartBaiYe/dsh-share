import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { mkdtemp, rm, readFile, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apply } from './lib/index.js';
import { createShareStore, newShareId } from './lib/store.js';

async function harness(run) {
  const root=await mkdtemp(join(tmpdir(),'dsh-share-review-'));
  const oldHome=process.env.DSH_HOME, oldFetch=globalThis.fetch;
  process.env.DSH_HOME=root;
  const routes=[];
  const events=['first question','first answer','second question','second answer'].map((text,i)=>({seq:i+1,type:i%2?'assistant/message':'user/message',data:i%2?{message:{content:[{type:'text',text}]}}:{source:{kind:'user'},content:[{type:'text',text}]}}));
  apply({get(name){if(name==='connection')return {requestRejection(){}};if(name==='sessionQuery')return {readTitle:async()=> 'Review fixture',readSurface:async()=>({session:{},events})};},webServer:{register:r=>routes.push(r)}},{});
  async function call(path,body) {
    const req=Readable.from(body===undefined?[]:[Buffer.from(JSON.stringify(body))]);
    req.method=body===undefined?'GET':'POST';req.url='/share/'+path;req.headers={host:'localhost:3000'};
    let status,raw,headers;
    const pathname=new URL(req.url,'http://localhost').pathname;
    const route=routes.find(r=>r.kind==='exact'&&r.path===pathname)||routes.find(r=>r.kind==='prefix'&&pathname.startsWith(r.path));
    await route.handler(req,{writeHead(code,h){status=code;headers=h;},end(value){raw=String(value??'');}});
    let data;try{data=JSON.parse(raw);}catch{}
    return {status,data,raw,headers};
  }
  try {await run({call,root,store:createShareStore({root:join(root,'shares')}),events});}
  finally {globalThis.fetch=oldFetch;if(oldHome===undefined)delete process.env.DSH_HOME;else process.env.DSH_HOME=oldHome;await rm(root,{recursive:true,force:true});}
}

test('selected snapshots and Markdown export contain only the reviewed messages; original links are immutable',()=>harness(async({call,events})=>{
  let uploads=0;globalThis.fetch=async()=>{uploads++;throw new Error('must stay local');};
  const base=(await call('create',{sessionId:'private-session'})).data;
  const inspected=await call('inspect?id='+base.id);
  assert.equal(inspected.data.snapshot.messages.length,4);
  assert.ok(!inspected.raw.includes('private-session'));
  for(const messageIndices of [[],[0,0],[-1],[4],[1.5],['1']])assert.equal((await call('customize',{id:base.id,title:'new',messageIndices})).status,400);
  const selected=(await call('customize',{id:base.id,title:'Selected answer',messageIndices:[3,2]})).data;
  assert.notEqual(selected.id,base.id);
  const preview=(await call('inspect?id='+selected.id)).data.snapshot;
  assert.deepEqual(preview.messages.map(m=>m.blocks[0].text),['second question','second answer']);
  const markdown=await call(selected.id+'/markdown');assert.match(markdown.headers['content-type'],/text\/markdown/);
  assert.ok(markdown.raw.includes('second answer'));assert.ok(!markdown.raw.includes('first question'));
  assert.equal((await call('inspect?id='+base.id)).data.snapshot.messages.length,4);
  assert.equal((await call('create',{sessionId:'private-session'})).data.id,base.id,'customized snapshot does not replace full conversation deduplication');
  events.push({seq:5,type:'user/message',data:{content:[{type:'text',text:'new turn'}]}});
  const latest=(await call('create',{sessionId:'private-session'})).data;
  const history=(await call('list?sessionId=private-session')).data.shares;
  assert.deepEqual(new Set(history.map(row=>row.id)),new Set([base.id,selected.id,latest.id]));
  assert.equal(uploads,0);
}));

test('revocation waits for an upload and rejects overlapping new uploads without losing keys',()=>harness(async({call,store})=>{
  let releaseUpload,started;const pending=new Promise(r=>releaseUpload=r),uploadStarted=new Promise(r=>started=r);
  let uploads=0,deletes=0;
  globalThis.fetch=async(url,init)=>{
    if(init.method==='POST'){uploads++;started();await pending;const ns=new URL(url).searchParams.get('ns');return Response.json({id:'testid12345',namespace:ns,ownerToken:'synthetic-delete-key',link:'https://fixture.brewpage.app/',expiresAt:Date.now()+86400000});}
    if(init.method==='DELETE'){deletes++;assert.equal(init.headers['x-owner-token'],'synthetic-delete-key');return new Response(null,{status:204});}
    return new Response(null,{status:404});
  };
  const {id}=(await call('create',{sessionId:'session'})).data;
  const publishing=call('publish',{id,provider:'brewpage',ttlDays:1});await uploadStarted;
  const revoking=call('revoke',{id});await new Promise(r=>setImmediate(r));
  assert.equal((await call('publish',{id,provider:'brewpage',ttlDays:1})).status,409);
  releaseUpload();assert.equal((await publishing).status,200);assert.equal((await revoking).status,200);
  assert.equal(uploads,1);assert.equal(deletes,1);assert.equal((await store.readIndex()).shares[id],undefined);
  assert.equal((await call('publish',{id,provider:'brewpage',ttlDays:1})).status,404);
  assert.equal(uploads,1);
}));

test('failed legacy deletions and missing snapshot files retain remote credentials',()=>harness(async({call,store,root})=>{
  const {id}=(await call('create',{sessionId:'session'})).data;
  globalThis.fetch=async()=>new Response(null,{status:503});
  await store.update(id,{publishedProvider:'gist',publishedUrl:'https://gist.example/view',gistId:'synthetic'});
  assert.equal((await call('revoke',{id})).status,502);
  await rm(join(root,'shares',id+'.json'));
  assert.equal(await store.prune(),0);
  assert.equal((await store.readIndex()).shares[id].gistId,'synthetic');
}));

test('corrupted indexes are never overwritten and stores sharing one root serialize index writes',async()=>{
  const root=await mkdtemp(join(tmpdir(),'dsh-share-store-'));
  try {
    const a=createShareStore({root}),b=createShareStore({root});
    const rows=Array.from({length:24},(_,i)=>({id:newShareId(),sessionId:'s',title:String(i),messages:[]}));
    await Promise.all(rows.map((row,i)=>(i%2?a:b).create(row)));
    assert.equal(Object.keys((await a.readIndex()).shares).length,24);
    for(const corrupt of ['{invalid',JSON.stringify({version:1,shares:[]})]){
      await writeFile(join(root,'index.json'),corrupt);
      await assert.rejects(a.create({id:newShareId(),sessionId:'s',messages:[]}),{code:'store-unavailable'});
      assert.equal(await readFile(join(root,'index.json'),'utf8'),corrupt);
    }
    await assert.rejects(a.create({id:'../escape',sessionId:'s'}),/Invalid/);
    if(process.platform!=='win32')assert.equal((await stat(join(root,rows[0].id+'.json'))).mode & 0o777,0o600);
  }finally{await rm(root,{recursive:true,force:true});}
});
