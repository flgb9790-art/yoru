/* Account-scoped outbox: retry interrupted progress saves from any online page. */
(()=>{
 const service=window.yoruPlaybackSync={ready:Promise.resolve()};
 window.yoruPages.register(page=>{
  const account=document.body.dataset.user,csrf=document.querySelector('[data-reward-bootstrap]')?.dataset.csrf;
  if(!account||!csrf)return;
  const prefix='yoru:playback:'+account+':';let running=null;
  const read=key=>{try{return JSON.parse(localStorage.getItem(key)||'null');}catch{return null;}};
  function entries(){const rows=[];try{for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(!key?.startsWith(prefix))continue;const split=key.lastIndexOf(':'),anime=key.slice(prefix.length,split),source=key.slice(split+1),p=read(key);if(!anime||anime.length>200||!['kodik','aniliberty'].includes(source)||p?.provider!==source||p.pendingSync!==true||!Number.isSafeInteger(p.episode)||p.episode<1||p.episode>100000||!Number.isSafeInteger(p.season)||p.season<0||p.season>10000||!Number.isFinite(p.position_seconds)||p.position_seconds<1||p.position_seconds>86400||!Number.isFinite(p.updatedAt)||p.updatedAt<=0||p.updatedAt>Date.now()+60000)continue;rows.push({key,anime,p});}}catch{}return rows.sort((a,b)=>a.p.updatedAt-b.p.updatedAt);}
  async function send(){if(navigator.onLine===false)return;let synced=0;
   for(const {key,anime,p} of entries()){
    if(page.signal.aborted||document.body.dataset.user!==account)break;
    const body={account,recordedAt:new Date(p.updatedAt).toISOString(),provider:p.provider,episode:p.episode,season:p.season,position:Math.round(p.position_seconds),duration:Math.max(0,Math.min(86400,Math.round(Number(p.duration_seconds)||0))),completed:String(p.completed===true)};
    if(Number.isSafeInteger(p.translation_id)&&p.translation_id>0&&p.translation_id<=10000000)body.translation=p.translation_id;
    if(p.provider==='aniliberty'&&Number.isSafeInteger(p.source_release_id)&&p.source_release_id>0)body.release=p.source_release_id;
    try{const response=await fetch('/watch/'+encodeURIComponent(anime),{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','x-csrf-token':csrf},body:JSON.stringify(body),signal:AbortSignal.timeout(8000)});if([403,404].includes(response.status))continue;if(!response.ok)break;const result=await response.json();if(!result.ok)break;const current=read(key);if(current?.updatedAt===p.updatedAt&&current.pendingSync===true){current.pendingSync=false;current.serverUpdatedAt=result.savedAt;localStorage.setItem(key,JSON.stringify(current));}synced++;}catch{break;}
   }
   if(synced&&!page.signal.aborted&&['/','/continue'].includes(location.pathname)&&document.visibilityState!=='hidden')window.yoruNavigate?.(location.href,{replace:true,scroll:false,preserveRail:true});
  }
  const flush=()=>running||(running=send().finally(()=>{running=null;}));service.ready=flush();
  page.listen(window,'online',flush);page.listen(document,'visibilitychange',()=>{if(document.visibilityState==='visible')flush();});page.interval(flush,10000);
 });
})();
