import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function fixture() {
  let definition, Component, cursor=0, activeSession='A';
  const states=[],effects=[],cleanups=[];
  const React={Fragment:Symbol('Fragment'),createElement(type,props,...children){return typeof type==='function'?type({...props,children}):{type,props:props||{},children};},useState(value){const i=cursor++;if(!(i in states))states[i]=typeof value==='function'?value():value;return[states[i],next=>{states[i]=typeof next==='function'?next(states[i]):next;}];},useRef(value){const i=cursor++;return states[i]||=( {current:value} );},useEffect(fn,deps){const i=cursor++;if(!states[i]||deps.some((v,j)=>v!==states[i][j])){states[i]=deps;effects.push(()=>{cleanups[i]?.();cleanups[i]=fn();});}}};
  const bodies=[],copied=[],rows=[],snapshots=new Map();let id=0,gate;
  const texts=['question one','answer one','question two','answer two'];
  const window={__ModuleLoader__:{load(d){definition=d;}},open(){}};
  const navigator={language:'zh-CN',clipboard:{async writeText(value){copied.push(value);}}};
  const fetch=async(url,init={})=>{
    const path=new URL(url,'http://localhost'),body=init.body?JSON.parse(init.body):undefined;
    let payload;
    if(path.pathname.endsWith('/tunnel/status'))payload={ok:true,allowed:false,publish:{allowed:false,brewpage:true,htmlhoster:true}};
    else if(path.pathname.endsWith('/create')){
      const row={id:'snapshot'+(++id),title:'Conversation '+body.sessionId,sessionId:body.sessionId,sharedAt:id,messageCount:4};rows.push(row);snapshots.set(row.id,{...row,messages:texts.map((text,i)=>({role:i%2?'assistant':'user',blocks:[{type:'text',text}]}))});payload={ok:true,...row};
    }else if(path.pathname.endsWith('/inspect'))payload={ok:true,snapshot:snapshots.get(path.searchParams.get('id'))};
    else if(path.pathname.endsWith('/list'))payload={ok:true,shares:rows.filter(r=>r.sessionId===path.searchParams.get('sessionId'))};
    else if(path.pathname.endsWith('/customize')){
      const original=snapshots.get(body.id),row={id:'snapshot'+(++id),title:body.title,sessionId:original.sessionId,sharedAt:id,messageCount:body.messageIndices.length};rows.push(row);snapshots.set(row.id,{...row,messages:body.messageIndices.map(i=>original.messages[i])});payload={ok:true,...row};
    }else if(path.pathname.endsWith('/publish')){
      bodies.push(body);if(gate)await gate;
      payload={ok:true,url:'https://fixture.example/'+body.id,provider:body.provider,expiresAt:Date.now()+(body.ttlDays||0)*86400000,ttlDays:body.ttlDays};Object.assign(rows.find(r=>r.id===body.id),{publishedUrl:payload.url,publishedProvider:body.provider,expiresAt:payload.expiresAt,ttlDays:body.ttlDays});
    }else if(path.pathname.endsWith('/revoke')){rows.splice(rows.findIndex(r=>r.id===body.id),1);payload={ok:true};}
    else throw new Error('Unexpected request '+url);
    return{ok:true,status:200,json:async()=>payload};
  };
  new Function('window','navigator','fetch',readFileSync(new URL('lib/client.js',import.meta.url),'utf8'))(window,navigator,fetch);
  definition.factory(()=>React).apply({slots:{inject(_,fn){fn();},register(_,C){Component=C;}}});
  function render(session=activeSession){activeSession=session;let tree;for(let n=0;n<2;n++){cursor=0;tree=Component({sessionId:session});for(const effect of effects.splice(0))effect();}return tree;}
  const all=node=>Array.isArray(node)?node.flatMap(all):!node||typeof node!=='object'?[]:[node,...(node.children||[]).flatMap(all)];
  const text=node=>typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(text).join(''):(node?.children||[]).map(text).join('');
  const findButton=label=>{const button=all(render()).find(n=>n.type==='button'&&text(n)===label);assert.ok(button,label);return button;};
  const click=async label=>{const button=findButton(label);assert.ok(!button.props.disabled,label+' disabled');await button.props.onClick();render();};
  const field=label=>{const el=all(render()).find(n=>n.props['aria-label']===label&&['input','select'].includes(n.type));assert.ok(el,label);return el;};
  render();return{render,all,text,click,field,findButton,bodies,copied,rows,snapshots,setGate(value){gate=value;}};
}

test('dialog previews and selects an immutable subset, then publishes only to the explicit chosen host',async()=>{
  const ui=fixture();await ui.click('分享');
  assert.equal(ui.all(ui.render()).filter(n=>n.type==='input'&&n.props.type==='checkbox').length,4);
  assert.deepEqual(ui.field('BrewPage 分享有效期').children.flat().map(n=>n.props.value),[1,3,7,30]);
  await ui.click('仅最后一轮');ui.field('分享标题').props.onChange({target:{value:'Selected title'}});
  assert.equal(ui.findButton('使用 BrewPage 限时分享').props.disabled,true);assert.equal(ui.bodies.length,0);
  await ui.click('保存选择并预览');
  assert.equal(ui.all(ui.render()).filter(n=>n.type==='input'&&n.props.type==='checkbox').length,2);
  ui.field('BrewPage 分享有效期').props.onChange({target:{value:'3'}});
  const button=ui.findButton('使用 BrewPage 限时分享');await Promise.all([button.props.onClick(),button.props.onClick()]);
  assert.equal(ui.bodies.length,1);assert.equal(ui.bodies[0].provider,'brewpage');assert.equal(ui.bodies[0].ttlDays,3);
  assert.deepEqual(ui.snapshots.get(ui.bodies[0].id).messages.map(m=>m.blocks[0].text),['question two','answer two']);
  assert.ok(ui.text(ui.render()).includes('到期时间'));assert.equal(ui.copied.length,1);
  await ui.click('撤销分享');assert.ok(ui.text(ui.render()).includes('已确认撤销'));
  await ui.click('从当前对话生成快照');await ui.click('使用 HTML Hoster 分享');assert.equal(ui.bodies[1].provider,'htmlhoster');
});

test('switching sessions during publication cannot overwrite the new dialog or copy a stale link',async()=>{
  const ui=fixture();await ui.click('分享');let release;ui.setGate(new Promise(r=>release=r));
  const publishing=ui.findButton('使用 BrewPage 限时分享').props.onClick();
  ui.render('B');await ui.click('分享');assert.equal(ui.field('分享标题').props.value,'Conversation B');
  release();await publishing;
  assert.equal(ui.field('分享标题').props.value,'Conversation B');assert.equal(ui.copied.length,0);
  assert.ok(!ui.all(ui.render()).some(n=>n.props['aria-label']==='分享链接'));
});
