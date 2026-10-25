/** DSH Share: local review, immutable selections and explicit cloud publishing. */
window.__ModuleLoader__.load({
  id: 'dsh-share',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const SLOT = 'conversation.session.header.utilities';
    const PREFIX = '/share';
    const zh = /^zh/i.test(navigator.language || '');
    const t = (cn, en) => zh ? cn : en;
    const providerName = value => ({brewpage:'BrewPage', htmlhoster:'HTML Hoster', relay:t('自有中转','Your relay'), gist:'GitHub Gist', neocities:'Neocities'}[value] || value || t('本机快照','Local snapshot'));
    const css = `
.dsh-share-root{display:inline-flex;align-self:center;flex:none}
.dsh-share-btn{height:26px;padding:0 9px;border:1px solid var(--dsw-alias-border-l4,#8885);border-radius:7px;background:transparent;color:inherit;font-family:inherit;font-size:12px;cursor:pointer}
.dsh-share-backdrop{position:fixed;inset:0;z-index:2147483000;background:#0006;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(3px)}
.dsh-share-panel{box-sizing:border-box;width:min(700px,100%);max-height:calc(100dvh - 32px);overflow:auto;border-radius:18px;padding:24px;background:var(--dsw-alias-bg-popover,#fff);color:var(--dsw-alias-label-primary,#202530);box-shadow:0 24px 70px #0005;font:14px/1.55 system-ui,'Microsoft YaHei',sans-serif;text-align:left;white-space:normal}
.dsh-share-panel *{box-sizing:border-box}
.dsh-share-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px}
.dsh-share-head h2{margin:0;font-size:21px;font-weight:650;letter-spacing:-.4px}
.dsh-share-note{font-size:12px;line-height:1.65;color:inherit;opacity:.72;margin:6px 0 12px}
.dsh-share-section{padding:14px 0;border-top:1px solid #8883}
.dsh-share-field{display:grid;gap:6px;margin-bottom:12px;font-size:12px;font-weight:600}
.dsh-share-input,.dsh-share-select{width:100%;min-width:0;border:1px solid #8885;border-radius:9px;background:var(--dsw-alias-bg-base,transparent);color:inherit;padding:9px 11px;font-family:inherit;font-size:13px;line-height:1.4}
.dsh-share-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.dsh-share-action{min-height:34px;padding:6px 12px;border:1px solid #8885;border-radius:9px;background:transparent;color:inherit;font-family:inherit;font-size:12px;line-height:1.4;cursor:pointer}
.dsh-share-action:hover:not(:disabled){background:#8882}
.dsh-share-action.primary{background:#4d6bfe;border-color:#4d6bfe;color:white}
.dsh-share-action.danger{color:#c83b36}
.dsh-share-panel :disabled{opacity:.45;cursor:not-allowed}
.dsh-share-panel :focus-visible{outline:3px solid #4d6bfe;outline-offset:2px}
.dsh-share-preview{max-height:300px;overflow:auto;border:1px solid #8884;border-radius:11px;overscroll-behavior:contain;margin:12px 0}
.dsh-share-message{display:flex;gap:10px;padding:12px;border-bottom:1px solid #8883}
.dsh-share-message:last-child{border-bottom:0}
.dsh-share-message input{flex:none;align-self:flex-start;margin:4px 0;accent-color:#4d6bfe;width:16px;height:16px}
.dsh-share-message details{min-width:0;flex:1}
.dsh-share-message summary{cursor:pointer;overflow-wrap:anywhere;font-size:12px}
.dsh-share-message pre{white-space:pre-wrap;overflow-wrap:anywhere;font-family:inherit;font-size:12px;line-height:1.7;margin:10px 0 0;max-width:100%}
.dsh-share-role{font-weight:650;color:#4d6bfe;margin-right:8px}
.dsh-share-link{margin:12px 0;padding:14px;border-radius:12px;border:1px solid #4d6bfe55;background:#4d6bfe0a}
.dsh-share-link input{margin:8px 0;font-family:ui-monospace,Consolas,monospace}
.dsh-share-status{padding:10px 12px;border-radius:9px;margin:10px 0;font-size:12px;background:#4d6bfe0c;border:1px solid #4d6bfe33;overflow-wrap:anywhere}
.dsh-share-error{color:#bd322c;background:#d3453b0b;border-color:#d3453b44}
.dsh-share-count{margin-left:auto;font-size:12px;opacity:.7}
.dsh-share-footer{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-top:14px}
@media(max-width:520px){.dsh-share-backdrop{padding:8px}.dsh-share-panel{padding:16px;border-radius:13px;max-height:calc(100dvh - 16px)}.dsh-share-head h2{font-size:18px}.dsh-share-preview{max-height:260px}.dsh-share-action{min-height:38px}}
@media(prefers-color-scheme:dark){.dsh-share-panel{background:var(--dsw-alias-bg-popover,#191d25);color:var(--dsw-alias-label-primary,#e5e9f1)}.dsh-share-role{color:#9aafff}.dsh-share-action.danger,.dsh-share-error{color:#ff9d98}}
`;
    if (typeof document !== 'undefined' && !document.querySelector('style[data-plugin-css="dsh-share/client.css"]')) {
      const style = document.createElement('style'); style.dataset.pluginCss = 'dsh-share/client.css'; style.textContent = css; document.head.appendChild(style);
    }
    async function request(path, body) {
      const response = await fetch(PREFIX + path, { method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', headers: {'content-type':'application/json',accept:'application/json'}, ...(body === undefined ? {} : {body:JSON.stringify(body)}) });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) throw new Error(payload?.message || (response.status === 401 || response.status === 403 ? t('请从 DSH 页面重新操作。','Retry from the DSH page.') : response.status === 422 ? t('此对话没有可分享的文字。','This conversation has no shareable text.') : `${t('操作失败','Request failed')} (HTTP ${response.status})`));
      return payload;
    }
    async function copy(text) {
      try { await navigator.clipboard.writeText(text); return true; } catch { /* HTTP or denied permission. */ }
      let area;
      try { area = document.createElement('textarea'); area.value=text; area.style.cssText='position:fixed;opacity:0'; document.body.appendChild(area); area.select(); return document.execCommand('copy'); }
      catch { return false; } finally { area?.remove(); }
    }
    const initial = () => ({open:false,busy:false,error:'',notice:'',share:null,snapshot:null,history:[],selected:[],title:'',days:7,copied:false,status:null,temporaryLink:''});
    const messageText = message => (message.blocks || []).map(b => b.text ?? b.detail ?? '').join('\n\n');
    function ShareButton(props) {
      const sessionId = typeof props?.sessionId === 'string' ? props.sessionId : '';
      const [view,setView] = React.useState(initial);
      const control = React.useRef({sessionId,busy:false});
      const panel = React.useRef(null);
      if (control.current.sessionId !== sessionId) control.current = {sessionId,busy:false};
      const patch = change => setView(previous => ({...previous,...change}));
      React.useEffect(() => { setView(initial()); }, [sessionId]);
      React.useEffect(() => {
        if (!view.open || typeof document === 'undefined') return;
        const before = document.activeElement;
        panel.current?.focus();
        const onKey = event => {
          if (event.key === 'Escape') { event.preventDefault(); patch({open:false}); }
          if (event.key !== 'Tab' || !panel.current) return;
          const items = [...panel.current.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),summary,[tabindex="0"]')].filter(el => el.getClientRects().length);
          const first=items[0],last=items.at(-1);
          if (!first) {event.preventDefault();return;}
          if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) {event.preventDefault();last.focus();}
          else if (!event.shiftKey && document.activeElement === last) {event.preventDefault();first.focus();}
        };
        window.addEventListener('keydown',onKey);
        return () => {window.removeEventListener('keydown',onKey);before?.focus?.();};
      }, [view.open]);
      async function run(action) {
        const marker=control.current;
        if (marker.busy || marker.sessionId !== sessionId) return;
        marker.busy=true; patch({busy:true,error:'',notice:'',copied:false});
        const active=() => control.current === marker;
        const update=change => {if(active())patch(change);};
        try {await action(update,active);} catch(error) {update({error:String(error.message || error)});}
        finally {marker.busy=false;update({busy:false});}
      }
      async function history(update) {
        const result=await request('/list?sessionId='+encodeURIComponent(sessionId));
        update({history:result.shares}); return result.shares;
      }
      async function selectShare(row,update) {
        update({share:row,snapshot:null,selected:[],title:row.title || '',temporaryLink:'',days:[1,3,7,30].includes(row.ttlDays)?row.ttlDays:7});
        const result=await request('/inspect?id='+encodeURIComponent(row.id));
        update({snapshot:result.snapshot,selected:result.snapshot.messages.map((_,i)=>i),title:result.snapshot.title});
      }
      const create=() => {
        if(!sessionId || control.current.busy)return;
        patch({open:true});
        return run(async(update) => {
          const status=await request('/tunnel/status'); update({status});
          const minted=await request('/create',{sessionId});
          const rows=await history(update);
          await selectShare(rows.find(r=>r.id===minted.id) || minted,update);
        });
      };
      const dirty=!!view.snapshot && (view.title!==view.snapshot.title || view.selected.length!==view.snapshot.messages.length);
      const expired=!!view.share?.expiresAt && view.share.expiresAt<=Date.now();
      const published=!!view.share?.publishedUrl && !expired;
      const save=() => run(async(update) => {
        const row=await request('/customize',{id:view.share.id,title:view.title,messageIndices:view.selected});
        await history(update); await selectShare(row,update);
        update({notice:t('已保存新的本机快照，请检查内容后分享。原链接不会改变。','Saved a new local snapshot. Review it before sharing. Earlier links are unchanged.')});
      });
      const publish=provider => run(async(update,active) => {
        const result=await request('/publish',{id:view.share.id,...(provider?{provider}:{}),...(provider==='brewpage'?{ttlDays:view.days}:{})});
        if(!active())return;
        const copied=await copy(result.url);
        update({share:{...view.share,publishedUrl:result.url,publishedProvider:result.provider,expiresAt:result.expiresAt || 0,ttlDays:result.ttlDays},copied,notice:copied?t('链接已复制。发布成功后可关闭 DSH。','Link copied. You can close DSH now.'):t('分享成功，请手动复制下方链接。','Published. Copy the link below.')});
        await history(update);
      });
      const revoke=() => run(async(update) => {
        await request('/revoke',{id:view.share.id});
        update({share:null,snapshot:null,selected:[],title:'',notice:t('已确认撤销。','Revocation confirmed.')});
        await history(update);
      });
      const exportFile=kind => window.open(`${PREFIX}/${view.share.id}/${kind}`,'_blank','noopener,noreferrer');
      const button=(label,onClick,extra={})=>h('button',{type:'button',className:'dsh-share-action',disabled:view.busy,onClick,...extra},label);
      const role=message => message.role==='user'?t('你','You'):message.role==='assistant'?'DeepSeek':t('工具','Tool');
      const actions=view.status?.publish || {};
      const disabled=view.busy || dirty || !view.snapshot || !view.selected.length;
      if (!sessionId)return null;
      const dialog = !view.open ? null : h('div',{className:'dsh-share-backdrop',onMouseDown:event=>{if(event.target===event.currentTarget)patch({open:false});}},
        h('section',{className:'dsh-share-panel',role:'dialog','aria-modal':true,'aria-label':t('分享此对话','Share this conversation'),tabIndex:-1,ref:panel},
          h('div',{className:'dsh-share-head'},h('h2',null,t('分享此对话','Share this conversation')),button(t('关闭','Close'),()=>patch({open:false}),{disabled:false})),
          h('p',{className:'dsh-share-note'},t('先检查内容，再选择托管服务。只有点击对应的分享按钮才会上传；拿到链接的人可以阅读。','Review the content, then choose a host. Uploads happen only when you press a service’s share button. Anyone with the link can read it.')),
          view.busy?h('div',{className:'dsh-share-status',role:'status'},t('正在处理，请稍候…','Working…')):null,
          view.error?h('div',{className:'dsh-share-status dsh-share-error',role:'alert'},view.error):null,
          view.notice?h('div',{className:'dsh-share-status',role:'status'},view.notice):null,
          view.history.length?h('label',{className:'dsh-share-field'},t('此对话的分享记录','Share history for this conversation'),h('select',{className:'dsh-share-select','aria-label':t('分享记录','Share history'),value:view.share?.id || '',disabled:view.busy,onChange:event=>{const row=view.history.find(r=>r.id===event.target.value);if(row)void run(update=>selectShare(row,update));}},h('option',{value:'',disabled:true},t('选择快照','Select a snapshot')),...view.history.map(row=>h('option',{key:row.id,value:row.id},`${new Date(row.sharedAt).toLocaleString()} · ${providerName(row.publishedProvider)} · ${row.title || ''}${row.expiresAt>0 && row.expiresAt<=Date.now()?t('（已到期）',' (expired)'):''}`)))):null,
          view.snapshot?h('div',{className:'dsh-share-section'},
            h('label',{className:'dsh-share-field'},t('分享标题','Share title'),h('input',{className:'dsh-share-input','aria-label':t('分享标题','Share title'),maxLength:120,value:view.title,disabled:view.busy,onChange:event=>patch({title:event.target.value})})),
            h('div',{className:'dsh-share-actions'},
              button(t('全选','Select all'),()=>patch({selected:view.snapshot.messages.map((_,i)=>i)})),
              button(t('清空选择','Clear selection'),()=>patch({selected:[]})),
              button(t('仅最后一轮','Last turn only'),()=>{let from=view.snapshot.messages.findLastIndex(m=>m.role==='user');if(from<0)from=view.snapshot.messages.length-1;patch({selected:view.snapshot.messages.map((_,i)=>i).filter(i=>i>=from)});}),
              h('span',{className:'dsh-share-count','aria-live':'polite'},`${view.selected.length} / ${view.snapshot.messages.length} ${t('条消息','messages')}`)),
            h('div',{className:'dsh-share-preview','aria-label':t('消息预览','Message preview')},...view.snapshot.messages.map((message,i)=>h('div',{key:i,className:'dsh-share-message'},
              h('input',{type:'checkbox',checked:view.selected.includes(i),disabled:view.busy,'aria-label':`${t('分享消息','Share message')} ${i+1}`,onChange:event=>patch({selected:event.target.checked?[...view.selected,i].sort((a,b)=>a-b):view.selected.filter(n=>n!==i)})}),
              h('details',null,h('summary',null,h('span',{className:'dsh-share-role'},role(message)),messageText(message).slice(0,100)),h('pre',null,messageText(message)))))),
            h('p',{className:'dsh-share-note'},t('预览显示实际保存的文字。自动脱敏无法识别所有秘密，请逐条检查。','The preview shows the saved text. Automatic redaction cannot recognise every secret; review each message.')),
            view.snapshot.truncated?h('p',{className:'dsh-share-note'},t('此快照按 maxMessages 配置截取了最近的消息。','This snapshot contains the most recent messages allowed by maxMessages.')):null,
            dirty?h('div',{className:'dsh-share-actions'},button(t('保存选择并预览','Save selection & review'),save,{className:'dsh-share-action primary',disabled:view.busy || !view.selected.length || !view.title.trim()}),h('span',{className:'dsh-share-note'},t('保存后才能上传或导出。','Save before uploading or exporting.'))):null
          ):null,
          view.share?.publishedUrl?h('div',{className:'dsh-share-link'},
            h('strong',null,providerName(view.share.publishedProvider),expired?t(' · 已到期',' · Expired'):t(' · 已发布',' · Published')),
            h('input',{className:'dsh-share-input',readOnly:true,'aria-label':t('分享链接','Share link'),value:view.share.publishedUrl,onFocus:event=>event.target.select()}),
            h('div',{className:'dsh-share-actions'},button(view.copied?t('已复制','Copied'):t('复制链接','Copy link'),()=>run(async(update)=>{const copied=await copy(view.share.publishedUrl);update({copied,notice:copied?'':t('请选中链接手动复制。','Select the link and copy it manually.')});})),button(t('打开链接','Open link'),()=>window.open(view.share.publishedUrl,'_blank','noopener,noreferrer'))),
            view.share.expiresAt>0?h('p',{className:'dsh-share-note'},`${t('到期时间','Expires')}: ${new Date(view.share.expiresAt).toLocaleString()}`):null):null,
          view.snapshot && !published?h('div',{className:'dsh-share-section'},
            actions.brewpage?h(React.Fragment,null,
              h('label',{className:'dsh-share-field'},t('BrewPage 分享有效期','BrewPage link lifetime'),h('select',{className:'dsh-share-select','aria-label':t('BrewPage 分享有效期','BrewPage link lifetime'),value:view.days,disabled:view.busy,onChange:event=>patch({days:Number(event.target.value)})},...[1,3,7,30].map(days=>h('option',{key:days,value:days},`${days} ${t('天','days')}`)))),
              button(t('使用 BrewPage 限时分享','Share with BrewPage (expires)'),()=>publish('brewpage'),{className:'dsh-share-action primary',disabled}),
              h('p',{className:'dsh-share-note'},t('无需账号，使用不公开列出的地址。到期由服务端限制访问，也可提前撤销。','No account required. The link is unlisted; the host enforces expiry and you can revoke it early.'))):null,
            h('div',{className:'dsh-share-actions'},actions.htmlhoster?button(t('使用 HTML Hoster 分享','Share with HTML Hoster'),()=>publish('htmlhoster'),{disabled}):null,actions.allowed?button(t('生成分享链接','Create share link')+' · '+providerName(actions.provider==='auto'?'relay':actions.provider),()=>publish(),{disabled}):null),
            actions.htmlhoster?h('p',{className:'dsh-share-note'},t('HTML Hoster 不保证自动到期或永久保存。服务之间不会自动转传。','HTML Hoster does not guarantee automatic expiry or permanent retention. There is no automatic provider fallback.')):null
          ):null,
          view.share?h('div',{className:'dsh-share-actions'},
            button(t('导出网页对话','Export HTML'),()=>exportFile('app'),{disabled}),
            button(t('导出 Markdown','Export Markdown'),()=>exportFile('markdown'),{disabled}),
            button(t('撤销分享','Revoke'),revoke,{className:'dsh-share-action danger'})):null,
          view.share && view.status?.allowed?h('details',{className:'dsh-share-section'},h('summary',null,t('临时公网链接（需要保持 DSH 运行）','Temporary public link (requires DSH to stay open)')),
            h('p',{className:'dsh-share-note'},t('此选项使用本机隧道；关闭 DSH 后失效。','This option uses a local tunnel and stops when DSH closes.')),
            view.temporaryLink?h('input',{className:'dsh-share-input',readOnly:true,value:view.temporaryLink,'aria-label':t('临时公网链接','Temporary public link'),onFocus:event=>event.target.select()}):null,
            button(t('开启临时公网','Start temporary public link'),()=>run(async(update,active)=>{const result=await request('/tunnel/start',{});const url=result.url+PREFIX+'/'+view.share.id;if(active()){const copied=await copy(url);update({temporaryLink:url,notice:copied?t('临时链接已复制；需要保持 DSH 运行。','Temporary link copied; keep DSH running.'):t('请手动复制临时链接。','Copy the temporary link manually.')});}}),{disabled}),
            button(t('关闭临时公网','Stop temporary public link'),()=>run(async(update)=>{await request('/tunnel/stop',{});update({temporaryLink:'',notice:t('临时公网已关闭。','Temporary public access stopped.')});}))):null,
          h('div',{className:'dsh-share-footer'},button(t('从当前对话生成快照','New snapshot from conversation'),create),h('span',{className:'dsh-share-note'},'dsh-share 0.5.0'))
        ));
      return h('span',{className:'dsh-share-root'},h('button',{type:'button',className:'dsh-share-btn','data-dsh-share':'',disabled:view.busy,onClick:create,'aria-label':t('分享','Share')},t('分享','Share')),dialog);
    }
    return {name:'share',inject:['slots'],apply(ctx){ctx.slots.inject(SLOT,()=>ctx.slots.register({name:SLOT,id:'share',order:10},ShareButton));}};
  }
});
