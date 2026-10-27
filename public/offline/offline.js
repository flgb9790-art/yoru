import {compilePlaylist,providerUrl,VIDEO_PREFIX,MAX_BYTES,SHELL_CACHE} from './core.js';
const $=id=>document.getElementById(id),status=$('status'),download=$('download'),cancel=$('cancel'),play=$('play'),remove=$('remove'),video=$('video'),progress=$('progress');
let ready=null,busy=false,launching=false,controller=null,hls=null,wake=null;
const say=text=>{status.textContent=text;},mb=n=>(n/1024/1024).toFixed(1)+' МБ';
function stopped(){hls?.destroy();hls=null;video.pause();video.removeAttribute('src');video.load();video.hidden=true;$('play-status').textContent='';}
function buttons(){download.hidden=!!ready;download.disabled=busy||launching;cancel.hidden=!busy;play.hidden=!ready;remove.hidden=!ready;play.disabled=busy;remove.disabled=busy;}
async function findReady(){
 ready=null;for(const name of (await caches.keys()).filter(n=>n.startsWith(VIDEO_PREFIX))){
  const id=name.slice(VIDEO_PREFIX.length),cache=await caches.open(name),response=await cache.match('/offline/media/'+id+'/ready.json');if(!response)continue;
  try{const data=await response.json();if(data.id!==id||!Array.isArray(data.paths)||!data.paths.length||data.paths.length>600)continue;
   const complete=(await Promise.all([...data.paths,'/offline/media/'+id+'/playlist.m3u8'].map(path=>cache.match(path)))).every(Boolean);if(complete){ready=data;break;}
  }catch{}
 }
 if(ready){$('title').textContent=ready.title;say('Серия сохранена. Можно отключать интернет.');$('size').textContent=mb(ready.bytes)+' · сохранено '+new Date(ready.savedAt).toLocaleDateString('ru-RU');}
 buttons();
}
async function localWorker(){
 if(!isSecureContext||!('serviceWorker'in navigator)||!('caches'in window))throw Error('Этот браузер не поддерживает пробный офлайн-режим. Открой YORU в Safari через HTTPS.');
 const existing=await navigator.serviceWorker.getRegistration('/');if(existing?.active&&!existing.active.scriptURL.endsWith('/offline-sw.js'))throw Error('На сайте уже установлен другой офлайн-модуль.');
 if(!existing?.active)await navigator.serviceWorker.register('/offline-sw.js',{type:'module',scope:'/'});
 await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(Error('Не удалось подготовить офлайн-режим. Проверь интернет и обнови страницу.')),15000))]);
 if(!navigator.serviceWorker.controller)await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Обнови страницу, чтобы включить офлайн-режим.')),10000);navigator.serviceWorker.addEventListener('controllerchange',()=>{clearTimeout(timer);resolve();},{once:true});});
}
async function remote(url,signal,text=false){
 providerUrl(url);let last;
 for(let attempt=0;attempt<3;attempt++){
  if(signal.aborted)throw new DOMException('Cancelled','AbortError');
  const abort=new AbortController(),stop=()=>abort.abort();signal.addEventListener('abort',stop,{once:true});const timer=setTimeout(stop,30000);
  try{const response=await fetch(url,{mode:'cors',credentials:'omit',redirect:'follow',cache:'no-store',signal:abort.signal});providerUrl(response.url);if(!response.ok)throw Error('Источник ответил '+response.status);if(Number(response.headers.get('content-length'))>25*1024*1024)throw Error('Фрагмент слишком большой.');const bytes=await response.arrayBuffer();if(bytes.byteLength>25*1024*1024||bytes.byteLength===0)throw Error('Неверный размер фрагмента.');return {body:text?new TextDecoder().decode(bytes):bytes,type:response.headers.get('content-type')};}
  catch(error){last=error;if(signal.aborted)throw new DOMException('Cancelled','AbortError');}
  finally{clearTimeout(timer);signal.removeEventListener('abort',stop);}
  await new Promise(resolve=>setTimeout(resolve,500*(attempt+1)));
 }
 throw Error('Не удалось получить видео. Проверь соединение; источник должен разрешать загрузку в браузере. '+(last?.message||''));
}
async function save(){
 busy=true;controller=new AbortController();buttons();progress.hidden=false;progress.value=0;$('size').textContent='';stopped();let cacheName;
 try{
  if(navigator.storage?.persist)await navigator.storage.persist().catch(()=>false);
  try{wake=await navigator.wakeLock?.request('screen');}catch{}
  say('Проверяем доступность первой серии…');
  let response=await fetch('/api/offline/trial',{cache:'no-store',signal:controller.signal});if(!response.ok)throw Error(response.status===403?'Пробник доступен администраторам и модераторам. Войди в аккаунт на сайте.':'Тестовый тайтл пока недоступен.');const trial=await response.json();$('title').textContent=trial.title;
  response=await fetch('/api/player/'+encodeURIComponent(trial.id)+'/aniliberty',{cache:'no-store',signal:controller.signal});if(!response.ok)throw Error('AniLiberty не отдаёт эту серию. Попробуй позже.');const source=await response.json(),episode=source.episodes?.find(e=>e.number===1),url=episode?.streams?.['480'];if(source.restricted||!source.available||!url)throw Error('Первая серия в 480p сейчас недоступна.');
  const id=crypto.randomUUID(),playlist=await remote(url,controller.signal,true),compiled=compilePlaylist(playlist.body,url,id);cacheName=VIDEO_PREFIX+id;const cache=await caches.open(cacheName);let bytes=0;
  const estimate=await navigator.storage?.estimate?.();if(estimate?.quota&&estimate.quota-estimate.usage<40*1024*1024)throw Error('Недостаточно свободного места в хранилище браузера.');
  for(let i=0;i<compiled.files.length;i++){
   const file=compiled.files[i];say('Сохраняем серию · '+(i+1)+' из '+compiled.files.length+' фрагментов');
   const result=await remote(file.url,controller.signal);bytes+=result.body.byteLength;if(bytes>MAX_BYTES)throw Error('Серия превышает лимит пробника — 450 МБ.');
   if(controller.signal.aborted)throw new DOMException('Cancelled','AbortError');
   const type=file.kind==='key'?'application/octet-stream':file.kind==='init'?'video/mp4':result.type||'video/mp2t';await cache.put(file.path,new Response(result.body,{headers:{'Content-Type':type,'Content-Length':String(result.body.byteLength)}}));progress.value=Math.round((i+1)/compiled.files.length*100);$('size').textContent=mb(bytes);
  }
  await cache.put(compiled.root+'playlist.m3u8',new Response(compiled.manifest,{headers:{'Content-Type':'application/vnd.apple.mpegurl'}}));
  const record={id,title:trial.title,bytes,savedAt:Date.now(),paths:compiled.files.map(f=>f.path)};
  if(controller.signal.aborted)throw new DOMException('Cancelled','AbortError');
  await cache.put(compiled.root+'ready.json',new Response(JSON.stringify(record),{headers:{'Content-Type':'application/json'}}));
  // A single completed trial episode; remove abandoned staging caches only after successful commit.
  for(const name of await caches.keys())if(name.startsWith(VIDEO_PREFIX)&&name!==cacheName)await caches.delete(name);
  await findReady();
 }catch(error){if(cacheName)await caches.delete(cacheName);say(error.name==='AbortError'?'Загрузка отменена. Неполная серия удалена.':error.name==='QuotaExceededError'?'Не хватило места. Неполная серия удалена.':error.message);}
 finally{await wake?.release().catch(()=>{});wake=null;controller=null;busy=false;progress.hidden=true;buttons();}
}
download.addEventListener('click',async()=>{
 if(busy||launching)return;launching=true;
 const run=async()=>{await findReady();if(ready)return;for(const name of await caches.keys())if(name.startsWith(VIDEO_PREFIX))await caches.delete(name);await save();};
 try{if(navigator.locks)await navigator.locks.request('yoru-offline-download',{ifAvailable:true},async lock=>{if(lock)await run();else say('Загрузка уже идёт в другой вкладке YORU.');});else await save();}finally{launching=false;buttons();}
});
cancel.addEventListener('click',()=>controller?.abort());
play.addEventListener('click',()=>{
 if(!ready)return;stopped();video.hidden=false;const src='/offline/media/'+ready.id+'/playlist.m3u8';
 $('play-status').textContent='Открываем сохранённую серию…';
 video.disableRemotePlayback=true;
 if(window.Hls?.isSupported()){hls=new window.Hls({enableWorker:true,preferManagedMediaSource:true,backBufferLength:20,maxBufferLength:20});hls.loadSource(src);hls.attachMedia(video);hls.on(window.Hls.Events.MANIFEST_PARSED,()=>video.play().catch(()=>{}));hls.on(window.Hls.Events.ERROR,(_,data)=>{if(data.fatal)$('play-status').textContent='Не удалось воспроизвести сохранённую серию. Попробуй удалить и загрузить её заново.';});}
 else if(video.canPlayType('application/vnd.apple.mpegurl')){video.src=src;video.play().catch(()=>{$('play-status').textContent='Нажми ▶ на видео, чтобы начать просмотр.';});}
 else $('play-status').textContent='Этот браузер не поддерживает воспроизведение потока.';
 video.scrollIntoView({block:'nearest',behavior:'smooth'});
});
video.addEventListener('playing',()=>{$('play-status').textContent='Воспроизводится с этого устройства.';});
video.addEventListener('error',()=>{$('play-status').textContent='Браузер не смог открыть локальный поток. Для пробника это важный результат проверки на iPhone.';});
remove.addEventListener('click',async()=>{if(busy)return;stopped();for(const name of await caches.keys())if(name.startsWith(VIDEO_PREFIX))await caches.delete(name);ready=null;$('size').textContent='';say('Загрузка удалена с этого устройства.');buttons();});
$('disable').addEventListener('click',async()=>{controller?.abort();if(busy){say('Сначала дождись отмены загрузки и нажми ещё раз.');return;}stopped();for(const name of await caches.keys())if(name===SHELL_CACHE||name.startsWith(VIDEO_PREFIX))await caches.delete(name);const registration=await navigator.serviceWorker.getRegistration('/');if(registration?.active?.scriptURL.endsWith('/offline-sw.js'))await registration.unregister();download.disabled=true;play.hidden=true;remove.hidden=true;say('Пробник отключён. Загрузки удалены. Можно вернуться на сайт.');});
window.addEventListener('beforeunload',event=>{if(busy){event.preventDefault();event.returnValue='';}});
const connection=()=>{$('connection').textContent=navigator.onLine?'Загрузки на устройстве':'Нет интернета · офлайн';};window.addEventListener('online',connection);window.addEventListener('offline',connection);connection();
try{await localWorker();await findReady();if(!ready)say('Для пробника доступна первая серия «Фрирен» в 480p. Во время загрузки оставь приложение открытым.');}catch(error){say(error.message);download.disabled=true;}
