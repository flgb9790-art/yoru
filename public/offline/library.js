import {compilePlaylist,providerUrl,VIDEO_PREFIX,MAX_BYTES,SHELL_CACHE} from './library-core.js';
import {readRecords,titleInfo,sourceInfo,groupKey,episodeKey,icon,escapeHtml as esc} from './storage.js';
import {openSelection} from './selection.js';
const $=id=>document.getElementById(id),video=$('video'),QUEUE='yoru_offline_queue_v2',POSITIONS='yoru_offline_positions_v2';
$('cancel').innerHTML=icon('x');$('close-video').innerHTML=icon('x');document.querySelector('.intro-symbol').innerHTML=icon('download');document.querySelector('.empty>div').innerHTML=icon('download');
const sourceCache=new Map();
let records=[],queue=[],positions={},selected=null,current=null,hls=null,busy=false,starting=false,abort=null,stopReason='',wake=null,lastPosition=0;
const size=n=>n>=1024**3?(n/1024**3).toFixed(2)+' ГБ':(n/1024**2).toFixed(1)+' МБ',say=text=>{$('status').textContent=text;$('status').hidden=!text;};
try{queue=JSON.parse(localStorage.getItem(QUEUE)||'[]').filter(j=>j&&/^[a-f0-9-]{36}$/.test(j.id)&&j.animeId&&Number.isInteger(j.episode)&&['480','720','1080'].includes(j.quality)).slice(0,500).map(j=>({...j,status:j.status==='downloading'?'paused':j.status}));positions=JSON.parse(localStorage.getItem(POSITIONS)||'{}');}catch{queue=[];positions={};}
function persist(){try{localStorage.setItem(QUEUE,JSON.stringify(queue));}catch{}}
const channel='BroadcastChannel'in window?new BroadcastChannel('yoru-offline-library'):null;
channel?.addEventListener('message',async()=>{if(!busy){records=await readRecords();renderLibrary();}});
async function worker(){
 if(!isSecureContext||!navigator.serviceWorker||!window.caches)throw Error('Офлайн-загрузки требуют современный браузер и HTTPS.');
 const existing=await navigator.serviceWorker.getRegistration('/');if(existing?.active&&!existing.active.scriptURL.endsWith('/offline-sw.js'))throw Error('На сайте уже установлен другой офлайн-модуль.');
 if(!existing?.active)await navigator.serviceWorker.register('/offline-sw.js',{type:'module',scope:'/'});
 else if(navigator.onLine){try{await existing.update();const pending=existing.installing||existing.waiting;if(pending&&pending.state!=='activated')await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('Обновление загрузок заняло слишком много времени. Обнови страницу.')),20000);pending.addEventListener('statechange',()=>{if(pending.state==='activated'){clearTimeout(t);resolve();}else if(pending.state==='redundant'){clearTimeout(t);reject(Error('Не удалось обновить офлайн-модуль.'));}});});}catch(error){if(!existing.active)throw error;}}
 await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(Error('Не удалось подготовить загрузки. Проверь соединение и обнови страницу.')),15000))]);
 if(!navigator.serviceWorker.controller)await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('Обнови страницу, чтобы включить загрузки.')),10000);navigator.serviceWorker.addEventListener('controllerchange',()=>{clearTimeout(t);resolve();},{once:true});});
}
async function remote(url,signal,text=false){
 providerUrl(url);for(let attempt=0;attempt<3;attempt++){
  if(signal.aborted)throw new DOMException('Остановлено','AbortError');const controller=new AbortController(),stop=()=>controller.abort();signal.addEventListener('abort',stop,{once:true});const timer=setTimeout(stop,30000);
  try{const r=await fetch(url,{mode:'cors',credentials:'omit',redirect:'follow',cache:'no-store',signal:controller.signal});providerUrl(r.url);if(!r.ok)throw Error('Источник ответил '+r.status);if(Number(r.headers.get('content-length'))>25*1024**2)throw Error('Слишком большой фрагмент.');const body=await r.arrayBuffer();if(!body.byteLength||body.byteLength>25*1024**2)throw Error('Неверный размер фрагмента.');return {body:text?new TextDecoder().decode(body):body,type:r.headers.get('content-type')};}
  catch(error){if(signal.aborted)throw new DOMException('Остановлено','AbortError');if(attempt===2)throw Error('Не удалось получить видео. '+(error.message||'Проверь интернет.'));}
  finally{clearTimeout(timer);signal.removeEventListener('abort',stop);}
  await new Promise(resolve=>setTimeout(resolve,500*(attempt+1)));
 }
}
function renderQueue(){
 $('queue-section').hidden=!queue.length;$('pause').hidden=!busy;$('resume').hidden=busy||!queue.some(j=>['queued','paused','error'].includes(j.status));
 const done=queue.filter(j=>j.status==='done').length,active=queue.find(j=>j.status==='downloading');$('queue-title').textContent=busy?'Загружаем · '+(done+1)+' из '+queue.filter(j=>j.status!=='cancelled').length:done===queue.length?'Всё готово к просмотру':'Очередь загрузок';
 $('queue-list').innerHTML=queue.map(j=>'<article class="queue-row '+esc(j.status)+'" data-job="'+j.id+'"><div class="queue-icon">'+icon(j.status==='done'?'check':j.status==='error'?'info':j.status==='paused'?'pause':'download')+'</div><div class="queue-copy"><strong>'+esc(j.title)+'</strong><div class="row-meta"><span>'+j.episode+' серия · '+j.quality+'p</span><span data-job-state>'+esc(j.status==='done'?'Скачано':j.status==='paused'?'На паузе':j.status==='error'?(j.error||'Ошибка'):j.status==='cancelled'?'Отменено':j.status==='downloading'?Math.round(j.progress||0)+'% · '+size(j.bytes||0):'Ожидает')+'</span></div><progress max="100" value="'+(j.status==='done'?100:j.progress||0)+'" aria-label="Прогресс загрузки '+j.episode+' серии"></progress></div>'+(j.status!=='done'?'<button class="icon-button queue-remove" data-drop-job="'+j.id+'" aria-label="Убрать '+j.episode+' серию из очереди" '+(busy?'disabled':'')+'>'+icon('x')+'</button>':'')+'</article>').join('');
}
function tick(job){const row=document.querySelector('[data-job="'+job.id+'"]');if(row){row.querySelector('progress').value=job.progress;row.querySelector('[data-job-state]').textContent=Math.round(job.progress)+'% · '+size(job.bytes||0);}}
async function updateStorage(){try{const estimate=await navigator.storage?.estimate?.();$('storage-info').textContent=estimate?.quota?'Хранилище браузера: '+size(estimate.usage||0)+' из '+size(estimate.quota)+'.':'Размер свободного хранилища определяет браузер.';}catch{}}
function renderLibrary(){
 updateStorage();
 const groups=new Map();for(const r of records){const key=groupKey(r);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);}
 $('titles-count').textContent='Тайтлов: '+groups.size;$('episodes-count').textContent='Серий: '+records.length;$('total-size').textContent=size(records.reduce((sum,r)=>sum+r.bytes,0));$('empty').hidden=records.length>0;
 if(!groups.has(selected))selected=groups.keys().next().value||null;
 $('titles').innerHTML=[...groups].map(([key,rows])=>{const first=rows.find(r=>r.poster)||rows[0],bytes=rows.reduce((sum,r)=>sum+r.bytes,0);return '<button class="title-card '+(selected===key?'selected':'')+'" data-title-key="'+esc(key)+'" aria-pressed="'+(selected===key)+'"><span class="poster">'+(first.poster?'<img src="/offline/media/'+first.id+'/poster" alt="" loading="lazy">':'<span class="poster-fallback">'+esc(first.title.charAt(0))+'</span>')+'</span><span class="title-copy"><small>ANILIBERTY · НА УСТРОЙСТВЕ</small><strong>'+esc(first.title)+'</strong><span>Серий: '+rows.length+' · '+size(bytes)+'</span><em>'+icon('play')+' Выбрать серию</em></span></button>';}).join('');
 for(const img of $('titles').querySelectorAll('img'))img.onerror=()=>{const fallback=document.createElement('span');fallback.className='poster-fallback';fallback.textContent='Y';img.replaceWith(fallback);};
 $('episodes-section').hidden=!selected;const rows=(groups.get(selected)||[]).sort((a,b)=>a.season-b.season||a.episode-b.episode||Number(a.quality)-Number(b.quality));
 if(!rows.length)return;$('selected-title').textContent=rows[0].title;$('more').hidden=!rows.some(r=>r.animeId)||!navigator.onLine;
 $('episodes-list').innerHTML=rows.map(r=>{const saved=positions[r.id],percent=saved?.duration?Math.min(100,Math.round(saved.time/saved.duration*100)):0;return '<article class="episode-row '+(current?.id===r.id?'playing':'')+'"><button class="episode-play" data-play="'+r.id+'" aria-label="Смотреть '+r.episode+' серию">'+icon('play')+'</button><div class="episode-copy"><strong>'+(r.season>1?r.season+' сезон · ':'')+r.episode+' серия'+(r.name?' · '+esc(r.name):'')+'</strong><span>'+r.quality+'p · '+size(r.bytes)+(percent>=95?' · Просмотрено':percent>0?' · Продолжить с '+Math.floor(saved.time/60)+':'+String(Math.floor(saved.time%60)).padStart(2,'0'):' · Готово к просмотру')+'</span>'+(percent?'<progress value="'+percent+'" max="100" aria-label="Прогресс просмотра"></progress>':'')+'</div><button class="icon-button" data-delete="'+r.id+'" aria-label="Удалить '+r.episode+' серию">'+icon('trash-2')+'</button></article>';}).join('');
}
async function snapshot(job,cache){await cache.put('/offline/media/'+job.id+'/job.json',new Response(JSON.stringify(job),{headers:{'Content-Type':'application/json'}}));persist();}
async function batchSource(id,release,signal){const key=id+':'+(release||0),cached=sourceCache.get(key);if(cached&&cached.until>Date.now())return cached.data;const data=await sourceInfo(id,release,signal);sourceCache.set(key,{data,until:Date.now()+300000});return data;}
async function saveEpisode(job){
 abort=new AbortController();const signal=abort.signal;job.status='downloading';job.error='';renderQueue();persist();
 const info=await titleInfo(job.animeId,signal),source=await batchSource(job.animeId,job.release,signal),ep=source.episodes.find(e=>e.number===job.episode&&(e.season||1)===(job.season||1)),url=ep?.streams?.[job.quality];
 if(!url)throw Error('Эта серия недоступна в выбранном качестве.');Object.assign(job,{title:info.title,shikimoriId:info.shikimoriId,release:source.release_id,name:ep.name||'',season:ep.season||1});
 const original=await remote(url,signal,true),compiled=compilePlaylist(original.body,url,job.id),digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(original.body)),fingerprint=[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('');
 if(job.fingerprint&&job.fingerprint!==fingerprint)await caches.delete(VIDEO_PREFIX+job.id);job.fingerprint=fingerprint;const cache=await caches.open(VIDEO_PREFIX+job.id);job.bytes=0;await snapshot(job,cache);
 for(let i=0;i<compiled.files.length;i++){
  if(signal.aborted)throw new DOMException('Остановлено','AbortError');const file=compiled.files[i];let cached=await cache.match(file.path),length;
  if(cached)length=Number(cached.headers.get('content-length'))||(await cached.arrayBuffer()).byteLength;
  else{const result=await remote(file.url,signal);length=result.body.byteLength;if(job.bytes+length>MAX_BYTES)throw Error('Серия превышает лимит 1,5 ГБ. Выбери качество ниже.');if(signal.aborted)throw new DOMException('Остановлено','AbortError');await cache.put(file.path,new Response(result.body,{headers:{'Content-Type':file.kind==='key'?'application/octet-stream':file.kind==='init'?'video/mp4':result.type||'video/mp2t','Content-Length':String(length)}}));}
  job.bytes+=length;job.progress=Math.round((i+1)/compiled.files.length*100);tick(job);await snapshot(job,cache);
 }
 if(signal.aborted)throw new DOMException('Остановлено','AbortError');
 let poster=false;try{if(info.poster&&new URL(info.poster).protocol==='https:'){const r=await fetch(info.poster,{mode:'no-cors',credentials:'omit',signal:AbortSignal.timeout(5000)});if(r.ok||r.type==='opaque'){await cache.put(compiled.root+'poster',r);poster=true;}}}catch{}
 await cache.put(compiled.root+'playlist.m3u8',new Response(compiled.manifest,{headers:{'Content-Type':'application/vnd.apple.mpegurl'}}));
 if(signal.aborted)throw new DOMException('Остановлено','AbortError');
 const record={id:job.id,animeId:job.animeId,title:job.title,shikimoriId:job.shikimoriId,episode:job.episode,season:job.season,release:job.release,quality:job.quality,name:job.name,bytes:job.bytes,poster,savedAt:Date.now(),paths:compiled.files.map(f=>f.path)};
 await cache.put(compiled.root+'ready.json',new Response(JSON.stringify(record),{headers:{'Content-Type':'application/json'}}));await cache.delete(compiled.root+'job.json');job.status='done';job.progress=100;records=await readRecords();selected=selected||groupKey(record);renderLibrary();channel?.postMessage('changed');
}
async function runQueue(){
 if(busy||starting)return;starting=true;
 const run=async()=>{busy=true;stopReason='';const attempted=new Set();try{if(navigator.storage?.persist)await navigator.storage.persist().catch(()=>false);try{wake=await navigator.wakeLock?.request('screen');}catch{}
  while(!stopReason){const job=queue.find(j=>['queued','paused','error'].includes(j.status)&&!attempted.has(j.id));if(!job)break;attempted.add(job.id);records=await readRecords();if(records.some(r=>episodeKey(r)===episodeKey(job))){job.status='done';continue;}
   try{await saveEpisode(job);say('Сохранено: '+job.title+' · '+job.episode+' серия.');}
   catch(error){job.status=error.name==='AbortError'?'paused':'error';job.error=error.name==='QuotaExceededError'?'Недостаточно места. Удали ненужные серии.':error.message;try{const cache=await caches.open(VIDEO_PREFIX+job.id);await snapshot(job,cache);}catch{}say(error.name==='AbortError'?'Загрузка приостановлена. Сохранённые фрагменты останутся для продолжения.':job.error);sourceCache.delete(job.animeId+':'+(job.release||0));if(error.name==='AbortError')break;}
   finally{persist();renderQueue();}
  }
 }finally{busy=false;abort=null;await wake?.release().catch(()=>{});wake=null;if(stopReason==='cancel')await clearPending();persist();renderQueue();}};
 try{if(navigator.locks)await navigator.locks.request('yoru-offline-download',{ifAvailable:true},async lock=>{if(lock)await run();else say('Загрузка уже идёт в другой вкладке. Вернись туда или дождись завершения.');});else await run();}finally{starting=false;}
}
async function enqueue({info,release,episodes,quality}){
 records=await readRecords();queue=queue.filter(j=>!['done','cancelled'].includes(j.status));let added=0;for(const number of [...new Set(episodes)].slice(0,200)){const candidate={animeId:info.id,title:info.title,shikimoriId:info.shikimoriId,release,episode:number,season:1,quality};if(queue.length>=500){say('В очереди уже 500 серий. Дождись завершения текущих загрузок.');break;}if(records.some(r=>episodeKey(r)===episodeKey(candidate))||queue.some(j=>j.status!=='cancelled'&&episodeKey(j)===episodeKey(candidate)))continue;queue.push({...candidate,id:crypto.randomUUID(),status:'queued',bytes:0,progress:0});added++;}
 persist();renderQueue();if(added){say('Добавлено в очередь: '+added+' серий. Не закрывай приложение во время загрузки.');await runQueue();}else say('Выбранные серии уже сохранены или находятся в очереди.');
}
async function clearPending(){for(const j of queue)if(j.status!=='done')await caches.delete(VIDEO_PREFIX+j.id);queue=queue.filter(j=>j.status==='done');persist();renderQueue();}
async function mutation(fn){if(busy){say('Сначала приостанови загрузку.');return;}if(navigator.locks)await navigator.locks.request('yoru-offline-download',{ifAvailable:true},async lock=>{if(lock)await fn();else say('В другой вкладке идёт загрузка. Дождись её завершения.');});else await fn();}
function remember(){if(!current||!Number.isFinite(video.currentTime)||video.readyState<1)return;positions[current.id]={time:video.currentTime,duration:video.duration};try{localStorage.setItem(POSITIONS,JSON.stringify(positions));}catch{}}
function closeVideo(){remember();hls?.destroy();hls=null;video.pause();video.removeAttribute('src');video.load();current=null;$('watch-section').hidden=true;}
async function playRecord(id){
 const record=records.find(r=>r.id===id);if(!record)return;const cache=await caches.open(VIDEO_PREFIX+id);if(!(await Promise.all(record.paths.map(path=>cache.match(path)))).every(Boolean)){say('Некоторые фрагменты удалены браузером. Удали эту серию и загрузи её заново.');return;}
 closeVideo();current=record;selected=groupKey(record);$('watch-section').hidden=false;$('watch-title').textContent=record.title;$('watch-caption').textContent=record.episode+' серия · '+record.quality+'p';$('play-status').textContent='Открываем сохранённую серию…';video.disableRemotePlayback=true;
 const src='/offline/media/'+record.id+'/playlist.m3u8';if(window.Hls?.isSupported()){hls=new Hls({enableWorker:true,preferManagedMediaSource:true,backBufferLength:20,maxBufferLength:20});hls.loadSource(src);hls.attachMedia(video);hls.on(Hls.Events.MANIFEST_PARSED,()=>video.play().catch(()=>{$('play-status').textContent='Нажми ▶ на видео.';}));hls.on(Hls.Events.ERROR,(_,d)=>{if(d.fatal)$('play-status').textContent='Не удалось открыть серию. Попробуй удалить и загрузить её заново.';});}else if(video.canPlayType('application/vnd.apple.mpegurl')){video.src=src;video.play().catch(()=>{});}else $('play-status').textContent='Браузер не поддерживает этот поток.';
 $('next').hidden=!records.some(r=>groupKey(r)===groupKey(record)&&r.release===record.release&&r.episode===record.episode+1);renderLibrary();$('watch-section').scrollIntoView({block:'start',behavior:'smooth'});
}
video.addEventListener('loadedmetadata',()=>{const p=positions[current?.id];if(p?.time>0&&p.time/video.duration<.95)video.currentTime=p.time;});video.addEventListener('playing',()=>{$('play-status').textContent='С устройства · интернет не используется';});video.addEventListener('error',()=>{$('play-status').textContent='Не удалось открыть сохранённый поток.';});video.addEventListener('timeupdate',()=>{if(Date.now()-lastPosition>5000){remember();lastPosition=Date.now();}});video.addEventListener('pause',remember);video.addEventListener('ended',()=>{remember();renderLibrary();});
$('queue-list').onclick=e=>{const button=e.target.closest('[data-drop-job]');if(button)mutation(async()=>{const id=button.dataset.dropJob;await caches.delete(VIDEO_PREFIX+id);queue=queue.filter(j=>j.id!==id);persist();renderQueue();});};
$('titles').onclick=e=>{const b=e.target.closest('[data-title-key]');if(b){selected=b.dataset.titleKey;renderLibrary();$('episodes-section').scrollIntoView({block:'nearest',behavior:'smooth'});}};
$('episodes-list').onclick=async e=>{const play=e.target.closest('[data-play]'),remove=e.target.closest('[data-delete]');if(play)await playRecord(play.dataset.play);if(remove)await mutation(async()=>{const id=remove.dataset.delete;if(current?.id===id)closeVideo();await caches.delete(VIDEO_PREFIX+id);delete positions[id];try{localStorage.setItem(POSITIONS,JSON.stringify(positions));}catch{}queue=queue.filter(j=>j.id!==id);persist();records=await readRecords();renderLibrary();renderQueue();channel?.postMessage('changed');});};
$('close-video').onclick=()=>{closeVideo();renderLibrary();};$('next').onclick=()=>{const r=records.find(r=>current&&groupKey(r)===groupKey(current)&&r.release===current.release&&r.episode===current.episode+1);if(r)playRecord(r.id);};
$('more').onclick=()=>{const r=records.find(r=>groupKey(r)===selected&&r.animeId);if(r)openSelection({animeId:r.animeId,release:r.release,onConfirm:enqueue});};
$('pause').onclick=()=>{stopReason='pause';abort?.abort();};$('resume').onclick=()=>runQueue();$('cancel').onclick=()=>{if(busy){stopReason='cancel';abort?.abort();}else mutation(async()=>{await clearPending();queue=[];persist();renderQueue();});};
$('disable').onclick=()=>mutation(async()=>{if(!confirm('Удалить все сохранённые серии и отключить офлайн-режим на этом устройстве?'))return;closeVideo();for(const name of await caches.keys())if(name.startsWith('yoru-offline-shell-')||name.startsWith(VIDEO_PREFIX))await caches.delete(name);const registration=await navigator.serviceWorker.getRegistration('/');if(registration?.active?.scriptURL.endsWith('/offline-sw.js'))await registration.unregister();queue=[];records=[];positions={};try{localStorage.removeItem(POSITIONS);}catch{}persist();renderQueue();renderLibrary();say('Офлайн-режим отключён. Загрузки удалены.');});
window.addEventListener('beforeunload',e=>{remember();if(busy){e.preventDefault();e.returnValue='';}});document.addEventListener('visibilitychange',()=>{if(document.hidden)remember();});
function connection(){$('connection').textContent=navigator.onLine?'На этом устройстве':'Без интернета';$('connection').classList.toggle('offline',!navigator.onLine);}window.addEventListener('online',connection);window.addEventListener('offline',connection);connection();
try{
 await worker();records=await readRecords();for(const name of (await caches.keys()).filter(n=>n.startsWith(VIDEO_PREFIX))){const id=name.slice(VIDEO_PREFIX.length);if(records.some(r=>r.id===id)||queue.some(j=>j.id===id))continue;try{const data=await (await caches.open(name)).match('/offline/media/'+id+'/job.json');if(data){const j=await data.json();if(j.id===id&&j.animeId)queue.push({...j,status:'paused'});}}catch{}}
 for(const j of queue)if(records.some(r=>r.id===j.id))j.status='done';persist();renderLibrary();renderQueue();say('');
 const estimate=await navigator.storage?.estimate?.();$('storage-info').textContent=estimate?.quota?'Хранилище браузера: '+size(estimate.usage||0)+' из '+size(estimate.quota)+'.':'Размер свободного хранилища определяет браузер.';
 const params=new URLSearchParams(location.search),anime=params.get('anime'),numbers=(params.get('episodes')||'').split(',').map(Number).filter(n=>Number.isInteger(n)&&n>0&&n<=100000),quality=params.get('quality')||'480',release=/^\d+$/.test(params.get('release')||'')?Number(params.get('release')):null;
 if(anime){history.replaceState(null,'','/offline/');if(numbers.length&&['480','720','1080'].includes(quality)){const info=await titleInfo(anime);await enqueue({info,release,episodes:numbers,quality});}else await openSelection({animeId:anime,release,onConfirm:enqueue});}
}catch(error){say(error.message);}
