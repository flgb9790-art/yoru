const playerHost=document.querySelector('[data-kodik-player]');
if(playerHost){
 const button=playerHost.querySelector('[data-load-player]'),message=playerHost.querySelector('[data-player-message]'),status=playerHost.parentElement.querySelector('[data-watch-status]');
 let iframe,loading=false,origin='',episode=playerHost.dataset.movie==='true'?1:null,season=1,translation=null,position=0,duration=0,watched=0,started=false,ended=false,lastSaved=0,lastSent=-1;
 async function checkPermission(){
  if(!iframe)return;
  try{const response=await fetch('/api/player/'+playerHost.dataset.anime+'/status');if(response.status!==403&&response.status!==404)return;
   const data=await response.json();started=false;iframe.remove();iframe=null;const note=document.createElement('p');note.textContent=data.error||'Просмотр ограничен.';playerHost.classList.remove('is-loaded');playerHost.replaceChildren(note);status.textContent='';
  }catch{/* Keep the current player during a temporary network interruption. */}
 }
 const permissionTimer=setInterval(checkPermission,60000);
 const integer=(value,min,max)=>Number.isInteger(Number(value))&&Number(value)>=min&&Number(value)<=max?Number(value):null;
 async function save(force=false){
  if(playerHost.dataset.auth!=='true'||!episode||!started||position<1)return;
  if(!force&&(Date.now()-lastSaved<15000||lastSent===position))return;
  lastSaved=Date.now();lastSent=position;
  const completed=ended||(duration>0&&position/duration>=.9&&watched>=Math.min(60,duration*.5));
  try{
   const response=await fetch('/watch/'+playerHost.dataset.anime,{method:'POST',headers:{'Content-Type':'application/json','x-csrf-token':playerHost.dataset.csrf},body:JSON.stringify({episode,season,position,completed:String(completed),...(translation?{translation}:{})}),keepalive:force});
   if(!response.ok)throw Error();status.textContent=completed?'Серия отмечена просмотренной.':'Прогресс сохранён · '+episode+' серия, '+Math.floor(position/60)+' мин.';
  }catch{status.textContent='Не удалось сохранить прогресс. Повторим при продолжении просмотра.';}
 }
 async function load(){
  if(loading||iframe)return;loading=true;button.disabled=true;message.textContent='Загружаем плеер…';
  try{
   const response=await fetch('/api/player/'+playerHost.dataset.anime),data=await response.json();if(!response.ok)throw Error(data.error||'Плеер временно недоступен.');
   const url=new URL(data.url);if(url.origin!=='https://kodikplayer.com')throw Error('Плеер временно недоступен.');origin=url.origin;
   if(data.resume){episode=data.resume.episode;season=data.resume.season;url.searchParams.set('episode',episode);url.searchParams.set('season',season);url.searchParams.set('start_from',Math.max(0,data.resume.position_seconds-5));}
   iframe=document.createElement('iframe');iframe.src=url.href;iframe.title='Смотреть аниме — Kodik';iframe.allow='autoplay; fullscreen; picture-in-picture; encrypted-media';iframe.allowFullscreen=true;iframe.referrerPolicy='strict-origin-when-cross-origin';
   playerHost.classList.add('is-loaded');playerHost.replaceChildren(iframe);
   const quality=playerHost.parentElement.querySelector('[data-player-quality]');quality.textContent=['Kodik',data.quality].filter(Boolean).join(' · ');
   if(playerHost.dataset.auth==='true')status.textContent=data.resume?'Продолжаем с сохранённой позиции.':'Прогресс начнёт сохраняться при просмотре.';
  }catch(error){message.textContent=error.message;button.textContent='Попробовать ещё раз';button.disabled=false;}finally{loading=false;}
 }
 button.addEventListener('click',load);
 document.querySelectorAll('a[href="#player"]').forEach(link=>link.addEventListener('click',load));
 if(location.hash==='#player')load();
 window.addEventListener('message',event=>{
  if(!iframe||event.source!==iframe.contentWindow||event.origin!==origin)return;
  let data=event.data;if(typeof data==='string'){if(data.length>4096)return;try{data=JSON.parse(data);}catch{return;}}
  if(!data||typeof data!=='object')return;
  if(data.key==='kodik_player_current_episode'){
   const value=data.value;if(!value||typeof value!=='object')return;
   const nextEpisode=integer(value.episode,1,100000)||(playerHost.dataset.movie==='true'?1:null),nextSeason=integer(value.season??1,0,10000);if(!nextEpisode||nextSeason===null)return;
   if(nextEpisode!==episode||nextSeason!==season){save(true);position=0;duration=0;watched=0;started=false;ended=false;lastSaved=0;lastSent=-1;}
   episode=nextEpisode;season=nextSeason;translation=integer(value.translation?.id,1,10000000);
  }else if(data.key==='kodik_player_duration_update'){
   const value=Number(data.value);if(Number.isFinite(value)&&value>0&&value<=86400)duration=value;
  }else if(data.key==='kodik_player_video_started'||data.key==='kodik_player_play'){started=true;ended=false;
  }else if(data.key==='kodik_player_time_update'){
   const value=Math.round(Number(data.value));if(!Number.isFinite(value)||value<0||value>86400)return;
   const delta=value-position;if(started&&delta>0&&delta<=6)watched+=delta;position=value;save();
  }else if(data.key==='kodik_player_pause'){save(true);
  }else if(data.key==='kodik_player_video_ended'){if(started&&position>0){ended=true;save(true);}}
 });
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')save(true);else checkPermission();});
 window.addEventListener('pagehide',()=>{save(true);clearInterval(permissionTimer);});
}
