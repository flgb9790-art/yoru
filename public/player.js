window.yoruPages.register((page)=>{
const listen=page.listen,setInterval=page.interval;
const playerHost=document.querySelector('[data-kodik-player]');
if(playerHost){
 let libertyProbe,libertyData=null;
 const previewImage=playerHost.querySelector('.player-preview-image');if(previewImage){listen(previewImage,'error',()=>{previewImage.hidden=true;});if(previewImage.complete&&!previewImage.naturalWidth)previewImage.hidden=true;}

 const section=playerHost.closest('section'),sourceSelect=section.querySelector('[data-player-provider]'),episodeSelect=section.querySelector('[data-player-episode]'),qualitySelect=section.querySelector('[data-player-resolution]'),status=section.querySelector('[data-watch-status]'),qualityLabel=section.querySelector('[data-player-quality]');
 sourceSelect.value='kodik';
 const navigation=new URLSearchParams(location.search);if(['kodik','aniliberty'].includes(navigation.get('source')))sourceSelect.value=navigation.get('source');
 const providerButtons=[...section.querySelectorAll('[data-provider]')];
 function syncProviderButtons(){for(const button of providerButtons){button.setAttribute('aria-pressed',String(button.dataset.provider===sourceSelect.value));button.disabled=sourceSelect.disabled;}}
 for(const button of providerButtons)button.addEventListener('click',()=>{if(sourceSelect.disabled||sourceSelect.value===button.dataset.provider)return;sourceSelect.value=button.dataset.provider;sourceSelect.dispatchEvent(new Event('change'));});
 syncProviderButtons();
 let requestedEpisode=/^[1-9][0-9]{0,5}$/.test(navigation.get('episode')||'')?Number(navigation.get('episode')):null;const requestedRelease=/^[1-9][0-9]{0,9}$/.test(navigation.get('release')||'')?Number(navigation.get('release')):null;
 qualityLabel.textContent=sourceSelect.value==='aniliberty'?'AniLiberty':'Kodik';
 let iframe,video,hls,loading=false,generation=0,origin='',provider='kodik',episodes=[],episode=null,season=1,translation=null,position=0,duration=0,watched=0,started=false,ended=false,lastSaved=0,lastSent=-1,blocked=false,activeRelease=null,lookupAbort,mediaEvents,retryState=null,skipCleanup;
 const restart=document.createElement('button');restart.type='button';restart.className='secondary player-restart';restart.textContent='Перезапустить плеер';restart.hidden=true;restart.dataset.playerRestart='';section.querySelector('.player-toolbar').append(restart);listen(restart,'click',()=>reloadStream());
 const pip=document.createElement('button');pip.type='button';pip.className='secondary player-pip';pip.textContent='В отдельное окно';pip.hidden=true;pip.title='Картинка в картинке · вкладку с серией оставь открытой';section.querySelector('.player-toolbar').append(pip);
 const desktop=window.matchMedia?.('(min-width: 901px) and (hover: hover) and (pointer: fine)');
 const inPip=media=>document.pictureInPictureElement===media||media?.webkitPresentationMode==='picture-in-picture';
 function syncPip(){const supported=video&&(typeof video.requestPictureInPicture==='function'&&document.pictureInPictureEnabled===true||typeof video.webkitSetPresentationMode==='function'&&video.webkitSupportsPresentationMode?.('picture-in-picture'));pip.hidden=!(desktop?.matches&&supported);pip.disabled=!video||video.readyState<1;pip.textContent=video&&inPip(video)?'Вернуть в плеер':'В отдельное окно';pip.setAttribute('aria-pressed',String(Boolean(video&&inPip(video))));}
 if(desktop)listen(desktop,'change',syncPip);
 listen(pip,'click',async()=>{const media=video;if(!media||pip.disabled||pip.hidden)return;pip.disabled=true;try{if(inPip(media)){if(document.pictureInPictureElement===media)await document.exitPictureInPicture();else media.webkitSetPresentationMode('inline');}else{if(document.fullscreenElement)await document.exitFullscreen();if(media!==video)return;if(typeof media.requestPictureInPicture==='function'&&document.pictureInPictureEnabled)await media.requestPictureInPicture();else media.webkitSetPresentationMode('picture-in-picture');}}catch{if(media===video)status.textContent='Не удалось открыть отдельное окно. Попробуй ещё раз после начала воспроизведения.';}finally{syncPip();}});
 const integer=(value,min,max)=>Number.isInteger(Number(value))&&Number(value)>=min&&Number(value)<=max?Number(value):null;
 function resetProgress(){position=0;duration=0;watched=0;started=false;ended=false;lastSaved=0;lastSent=-1;translation=null;}
 function destroy(){const oldVideo=video;if(oldVideo&&document.pictureInPictureElement===oldVideo)document.exitPictureInPicture().catch(()=>{});else if(oldVideo?.webkitPresentationMode==='picture-in-picture')oldVideo.webkitSetPresentationMode('inline');video=null;syncPip();skipCleanup?.();skipCleanup=null;mediaEvents?.abort();mediaEvents=null;const oldHls=hls;hls=null;oldHls?.destroy();if(oldVideo){oldVideo.pause();oldVideo.removeAttribute('src');oldVideo.load();}iframe?.remove();iframe=null;origin='';}
 function reloadStream(){if(loading||blocked)return;const time=Number(video?.currentTime);const resume=retryState|| (video&&episode?{number:episode,position:Number.isFinite(time)?time:position,autoplay:started&&!video.paused,watched,release:activeRelease}:null);load({refresh:true,resume});}
 function note(text,retry=false){playerHost.classList.remove('is-loaded');const box=document.createElement('div'),p=document.createElement('p');p.textContent=text;box.append(p);if(retry){const button=document.createElement('button');button.type='button';button.textContent='Попробовать ещё раз';button.addEventListener('click',()=>reloadStream());box.append(button);}playerHost.replaceChildren(box);}
 async function save(force=false){
  if(playerHost.dataset.auth!=='true'||!episode||!started||position<1||blocked)return;
  if(!force&&(Date.now()-lastSaved<15000||lastSent===position))return;
  lastSaved=Date.now();lastSent=position;const current=generation;
  const completed=ended||(duration>0&&position/duration>=.9&&watched>=Math.min(60,duration*.5));
  const body={episode,season,position,completed:String(completed),provider,...(provider==='aniliberty'&&activeRelease?{release:activeRelease}:{}),...(translation?{translation}:{})};
  try{const response=await fetch('/watch/'+playerHost.dataset.anime,{method:'POST',headers:{'Content-Type':'application/json','x-csrf-token':playerHost.dataset.csrf},body:JSON.stringify(body),keepalive:force});if(!response.ok)throw Error();const result=await response.json();if(current===generation)status.textContent=completed?'Серия отмечена просмотренной.'+(result.xpGained?' +'+result.xpGained+' XP':''):'Прогресс сохранён · '+episode+' серия, '+Math.floor(position/60)+' мин.';
  }catch{if(current===generation)status.textContent='Не удалось сохранить прогресс. Повторим при продолжении просмотра.';}
 }
 async function checkPermission(){
  if(!iframe&&!video)return;
  try{const response=await fetch('/api/player/'+playerHost.dataset.anime+'/status');if(response.status!==403&&response.status!==404)return;const data=await response.json();blocked=true;generation++;destroy();started=false;sourceSelect.disabled=true;syncProviderButtons();episodeSelect.disabled=true;qualitySelect.disabled=true;note(data.error||'Просмотр ограничен.');status.textContent='';}catch{}
 }
 let permissionTimer=setInterval(checkPermission,60000);
 const libertyButton=providerButtons.find(b=>b.dataset.provider==='aniliberty'),providerPicker=section.querySelector('.provider-picker');
 function libertyAvailable(data,wanted=requestedEpisode||(provider==='kodik'?episode:null)){return Boolean(data&&data.available!==false&&!data.restricted&&Array.isArray(data.episodes)&&data.episodes.some(item=>(!wanted||Number(item.number)===Number(wanted))&&item.streams&&Object.keys(item.streams).length));}
 function syncProviderVisibility(){const available=libertyAvailable(libertyData);const offline=section.querySelector('[data-offline-picker]');if(offline){offline.hidden=!libertyAvailable(libertyData,null)||blocked;offline.dataset.release=libertyData?.release_id||'';}if(libertyButton)libertyButton.hidden=!available;if(providerPicker)providerPicker.hidden=!available;}
 syncProviderVisibility();
 function libertyLookup(params){return fetch('/api/player/'+playerHost.dataset.anime+'/aniliberty'+(params.size?'?'+params:''),{signal:AbortSignal.any([page.signal,AbortSignal.timeout(20000)])}).then(async response=>({ok:response.ok,status:response.status,data:await response.json()}));}
 const probeParams=new URLSearchParams();if(requestedRelease)probeParams.set('release',requestedRelease);
 libertyProbe=libertyLookup(probeParams);libertyProbe.then(result=>{if(page.signal.aborted)return;libertyData=result.ok?result.data:null;syncProviderVisibility();if(!libertyAvailable(libertyData)&&!loading&&!iframe&&!video){sourceSelect.value='kodik';syncProviderButtons();}}).catch(()=>{if(!page.signal.aborted){libertyData=null;syncProviderVisibility();}});
 function streamUrl(value){const url=new URL(value);if(url.protocol!=='https:'||!(url.hostname==='libria.fun'||url.hostname.endsWith('.libria.fun'))||!url.pathname.endsWith('.m3u8'))throw Error('Поток временно недоступен.');return url.href;}
 function playEpisode(item,offset=0,autoplay=false,keepWatched=false){
  retryState=null;save(true);generation++;const current=generation,previousWatched=keepWatched?watched:0;destroy();resetProgress();watched=previousWatched;episode=item.number;season=item.season;provider='aniliberty';episodeSelect.value=String(episode);
  const qualities=Object.keys(item.streams);qualitySelect.replaceChildren(...qualities.map(value=>new Option(value+'p',value)));const selected=qualities.includes(qualitySelect.dataset.preferred)?qualitySelect.dataset.preferred:qualities.includes('720')?'720':qualities[0];qualitySelect.value=selected;
  video=document.createElement('video');const media=video;media.controls=true;media.tabIndex=0;media.playsInline=true;media.preload='metadata';media.crossOrigin='anonymous';media.setAttribute('aria-label','Смотреть аниме — AniLiberty');playerHost.classList.add('is-loaded');playerHost.replaceChildren(media);
  qualityLabel.textContent='AniLiberty · '+selected+'p';status.textContent=playerHost.dataset.auth==='true'?'Прогресс сохраняется при просмотре.':'Войди, чтобы сохранять историю просмотра.';
  const active=()=>current===generation&&media===video;
  let seeking=false,networkRetries=0,mediaRetries=0,nativeRetries=0,recoveryPending=false,terminal=false;
  restart.hidden=false;restart.disabled=false;
  const failed=()=>{if(!active()||terminal)return;terminal=true;recoveryPending=false;retryState={number:episode,position:Number.isFinite(media.currentTime)?media.currentTime:position,autoplay:started&&!media.paused,watched,release:activeRelease};const engine=hls;hls=null;engine?.destroy();status.textContent='Поток прервался. Нажми «Перезапустить плеер» — продолжим с этой позиции, или выбери другое качество.';};
  const mediaAbort=new AbortController();mediaEvents=mediaAbort;const mediaListen=(target,type,fn,capture=false)=>target.addEventListener(type,fn,{capture,signal:mediaAbort.signal});
  for(const event of ['loadedmetadata','emptied','enterpictureinpicture','leavepictureinpicture','webkitpresentationmodechanged'])mediaListen(media,event,syncPip);
  syncPip();
  skipCleanup=window.yoruPlayerSkips?.mount({video:media,host:playerHost,skips:item.skips,signal:mediaAbort.signal,onSeek:()=>{seeking=true;position=Math.round(media.currentTime);save(true);}});
  const fullscreen=()=>document.fullscreenElement===playerHost||document.webkitFullscreenElement===playerHost||document.fullscreenElement===media||document.webkitFullscreenElement===media||media.webkitDisplayingFullscreen===true;
  // UA controls live in a closed shadow tree. Capture fullscreen shortcuts before
  // its last focused button handles arrows; blur clears that button's focus ring.
  const clearControlFocus=()=>{if(active()&&fullscreen()){media.blur();playerHost.tabIndex=-1;playerHost.focus({preventScroll:true});}};
  mediaListen(document,'fullscreenchange',clearControlFocus);mediaListen(document,'webkitfullscreenchange',clearControlFocus);mediaListen(media,'webkitbeginfullscreen',clearControlFocus);
  const seekKey=event=>{if(!active()||terminal||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey||!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();event.stopImmediatePropagation();if(fullscreen()){media.dataset.seekKeyboard="true";clearControlFocus();}if(!Number.isFinite(media.duration)||media.duration<=0)return;seeking=true;media.currentTime=Math.max(0,Math.min(media.duration-.05,media.currentTime+(event.key==='ArrowRight'?5:-5)));position=Math.round(media.currentTime);};
  mediaListen(media,'keydown',seekKey,true);
  mediaListen(window,'keydown',event=>{if(event.key==='Tab')delete media.dataset.seekKeyboard;if(fullscreen())seekKey(event);},true);
  media.addEventListener('seeking',()=>{if(active())seeking=true;});media.addEventListener('seeked',()=>{if(active()){position=Math.round(media.currentTime);seeking=false;save(true);}});
  const recover=data=>{if(!active()||terminal||!data.fatal||recoveryPending)return;
   if(data.type===Hls.ErrorTypes.MEDIA_ERROR&&mediaRetries++<1){recoveryPending=true;status.textContent='Восстанавливаем воспроизведение…';page.timeout(()=>{if(!active()||terminal)return;recoveryPending=false;hls?.recoverMediaError();},500);}
   else if(data.type===Hls.ErrorTypes.NETWORK_ERROR&&networkRetries<2){const delay=1500*++networkRetries;recoveryPending=true;status.textContent='Соединение прервалось. Повторяем загрузку…';page.timeout(()=>{if(!active()||terminal)return;recoveryPending=false;hls?.startLoad(media.currentTime);},delay);}
   else failed();
  };
  media.addEventListener('playing',()=>{if(active()&&!terminal){retryState=null;status.textContent='← / → — перемотка на 5 секунд.';}});
  const updateTime=()=>{if(!active())return;const value=Math.round(media.currentTime);if(!Number.isFinite(value)||value<0||value>86400)return;const delta=value-position;if(started&&!seeking&&!media.seeking&&delta>0&&delta<=6)watched+=delta;position=value;save();};
  media.addEventListener('loadedmetadata',()=>{if(!active())return;if(Number.isFinite(media.duration))duration=media.duration;if(offset>0)media.currentTime=Math.min(offset,Math.max(0,(media.duration||offset+1)-1));if(autoplay)media.play().catch(()=>{});},{once:true});
  media.addEventListener('durationchange',()=>{if(active()&&Number.isFinite(media.duration))duration=media.duration;});
  media.addEventListener('play',()=>{if(active()){started=true;ended=false;}});media.addEventListener('timeupdate',updateTime);
  media.addEventListener('pause',()=>{if(active()){updateTime();save(true);}});
  media.addEventListener('ended',()=>{if(active()&&started){position=Math.round(media.currentTime);ended=true;save(true);}});
  media.addEventListener('error',()=>{if(!active()||hls||terminal||recoveryPending)return;if(media.canPlayType('application/vnd.apple.mpegurl')&&nativeRetries++<1){const time=Math.max(position,Number.isFinite(media.currentTime)?media.currentTime:0),playing=started&&!media.paused;recoveryPending=true;status.textContent='Восстанавливаем воспроизведение…';page.timeout(()=>{if(!active()||terminal)return;recoveryPending=false;media.addEventListener('loadedmetadata',()=>{if(!active())return;media.currentTime=Math.min(time,Math.max(0,media.duration-1));if(playing)media.play().catch(()=>{});},{once:true});media.load();},1000);}else failed();});
  const url=streamUrl(item.streams[selected]);
  if(media.canPlayType('application/vnd.apple.mpegurl'))media.src=url;
  else if(window.Hls?.isSupported()){hls=new Hls({maxBufferLength:30,maxMaxBufferLength:60,backBufferLength:30});hls.on(Hls.Events.ERROR,(_event,data)=>recover(data));hls.loadSource(url);hls.attachMedia(media);}
  else{failed();status.textContent='Браузер не поддерживает этот формат. Выбери Kodik или другой браузер.';}
 }
 async function load({refresh=false,resume=null,fallbackNotice=''}={}){
  if(blocked)return;
  lookupAbort?.abort();lookupAbort=new AbortController();const lookup=lookupAbort;page.timeout(()=>lookup.abort(),20000);if(resume)retryState=resume;
  save(true);const current=++generation;destroy();resetProgress();loading=true;restart.hidden=sourceSelect.value!=='aniliberty';restart.disabled=true;provider=sourceSelect.value;episode=playerHost.dataset.movie==='true'?1:null;season=1;episodes=[];activeRelease=null;
  section.querySelector('[data-episode-control]').hidden=true;section.querySelector('[data-quality-control]').hidden=true;note('Загружаем плеер…');status.textContent='';qualityLabel.textContent=provider==='kodik'?'Kodik':'AniLiberty';
  try{
   const params=new URLSearchParams();if(resume?.release||requestedRelease)params.set('release',resume?.release||requestedRelease);if(refresh)params.set('refresh','1');const result=provider==='aniliberty'&&!refresh&&(!resume?.release||resume.release===requestedRelease)?await libertyProbe.catch(()=>null):null;const response=result||await fetch('/api/player/'+playerHost.dataset.anime+(provider==='aniliberty'?'/aniliberty'+(params.size?'?'+params:''):''),{signal:lookup.signal}),data=result?result.data:await response.json();if(current!==generation)return;if(provider==='aniliberty'){libertyData=response.ok?data:null;syncProviderVisibility();if(!response.ok||!libertyAvailable(data)){sourceSelect.value='kodik';syncProviderButtons();restart.hidden=true;return load({fallbackNotice:!response.ok&&![403,404].includes(response.status)?'AniLiberty временно недоступен. Открыт Kodik.':requestedEpisode?'У AniLiberty пока нет '+requestedEpisode+' серии. Открыт Kodik.':'AniLiberty недоступен для этого аниме. Открыт Kodik.'});}}if(!response.ok)throw Error(data.error||'Плеер временно недоступен.');
   if(provider==='aniliberty'){
    activeRelease=data.release_id;episodes=data.episodes;if(!Array.isArray(episodes)||!episodes.length)throw Error('У источника пока нет доступных серий.');
    episodeSelect.replaceChildren(...episodes.map(item=>new Option(item.number+' серия'+(item.name?' · '+item.name:''),item.number)));
    const recovery=resume&&resume.release===activeRelease?episodes.find(item=>item.number===resume.number):null;const target=requestedEpisode?episodes.find(item=>item.number===requestedEpisode):null;if(requestedEpisode&&!target)throw Error('Эта серия больше не доступна у источника. Выбери другую серию на странице аниме.');const resumed=data.resume?.season===1&&(!requestedRelease||data.resume.source_release_id===activeRelease)?episodes.find(item=>item.number===data.resume.episode):null,item=recovery||target||resumed||episodes[0];section.querySelector('[data-episode-control]').hidden=false;section.querySelector('[data-quality-control]').hidden=false;loading=false;playEpisode(item,recovery?resume.position:resumed&&resumed.number===item.number?Math.max(0,data.resume.position_seconds-5):0,recovery&&resume.autoplay);if(recovery)watched=resume.watched||0;
   }else{
    const url=new URL(data.url);if(url.origin!=='https://kodikplayer.com')throw Error('Плеер временно недоступен.');origin=url.origin;
    if(requestedEpisode){episode=requestedEpisode;url.searchParams.set('episode',episode);url.searchParams.set('season',(/^[0-9]{1,3}$/.test(navigation.get('season')||'')?Number(navigation.get('season')):1));if(navigation.get('resume')==='1'&&data.resume?.episode===episode&&data.resume?.season===((/^[0-9]{1,3}$/.test(navigation.get('season')||'')?Number(navigation.get('season')):1)))url.searchParams.set('start_from',Math.max(0,data.resume.position_seconds-5));}else if(data.resume){episode=data.resume.episode;season=data.resume.season;url.searchParams.set('episode',episode);url.searchParams.set('season',season);url.searchParams.set('start_from',Math.max(0,data.resume.position_seconds-5));}
    iframe=document.createElement('iframe');iframe.src=url.href;iframe.title='Смотреть аниме — Kodik';iframe.allow='autoplay; fullscreen; picture-in-picture; encrypted-media';iframe.allowFullscreen=true;iframe.referrerPolicy='strict-origin-when-cross-origin';playerHost.classList.add('is-loaded');playerHost.replaceChildren(iframe);qualityLabel.textContent=['Kodik',data.quality].filter(Boolean).join(' · ');syncProviderVisibility();if(fallbackNotice)status.textContent=fallbackNotice;else if(playerHost.dataset.auth==='true')status.textContent=data.resume?'Продолжаем с сохранённой позиции.':'Прогресс начнёт сохраняться при просмотре.';
   }
  }catch(error){if(current===generation&&provider==='aniliberty'&&!page.signal.aborted){libertyData=null;sourceSelect.value='kodik';syncProviderButtons();syncProviderVisibility();restart.hidden=true;return load({fallbackNotice:'Не удалось загрузить AniLiberty. Открыт Kodik.'});}if(current===generation)note(error.name==='AbortError'?'Загрузка заняла слишком много времени. Попробуй ещё раз.':error.message,true);}finally{if(current===generation){loading=false;restart.disabled=false;}}
 }
 playerHost.querySelector('[data-load-player]')?.addEventListener('click',()=>load());
 sourceSelect.addEventListener('change',()=>{if(episode)requestedEpisode=episode;retryState=null;syncProviderButtons();try{localStorage.setItem('yoru_player_source',sourceSelect.value);}catch{}load();});
 episodeSelect.addEventListener('change',()=>{requestedEpisode=null;const item=episodes.find(item=>item.number===Number(episodeSelect.value));if(item)playEpisode(item);});
 qualitySelect.addEventListener('change',()=>{qualitySelect.dataset.preferred=qualitySelect.value;const item=episodes.find(item=>item.number===episode);if(item)playEpisode(item,position,Boolean(video&&!video.paused),true);});
 document.querySelectorAll('a[href="#player"]').forEach(link=>link.addEventListener('click',()=>{if(!loading&&!iframe&&!video)load();}));
 if(location.hash==='#player')load();
 listen(window,'message',event=>{
  if(provider!=='kodik'||!iframe||event.source!==iframe.contentWindow||event.origin!==origin)return;
  let data=event.data;if(typeof data==='string'){if(data.length>4096)return;try{data=JSON.parse(data);}catch{return;}}if(!data||typeof data!=='object')return;
  if(data.key==='kodik_player_current_episode'){
   const value=data.value;if(!value||typeof value!=='object')return;const nextEpisode=integer(value.episode,1,100000)||(playerHost.dataset.movie==='true'?1:null),nextSeason=integer(value.season??1,0,10000);if(!nextEpisode||nextSeason===null)return;
   if(nextEpisode!==episode||nextSeason!==season){save(true);resetProgress();}episode=nextEpisode;season=nextSeason;requestedEpisode=nextEpisode;syncProviderVisibility();translation=integer(value.translation?.id,1,10000000);
  }else if(data.key==='kodik_player_duration_update'){const value=Number(data.value);if(Number.isFinite(value)&&value>0&&value<=86400)duration=value;
  }else if(data.key==='kodik_player_video_started'||data.key==='kodik_player_play'){started=true;ended=false;
  }else if(data.key==='kodik_player_time_update'){const value=Math.round(Number(data.value));if(!Number.isFinite(value)||value<0||value>86400)return;const delta=value-position;if(started&&delta>0&&delta<=6)watched+=delta;position=value;save();
  }else if(data.key==='kodik_player_pause')save(true);
  else if(data.key==='kodik_player_video_ended'&&started&&position>0){ended=true;save(true);}
 });
 listen(document,'visibilitychange',()=>{if(document.visibilityState==='hidden')save(true);else checkPermission();});
 listen(window,'pagehide',()=>{save(true);clearInterval(permissionTimer);});
 listen(window,'pageshow',event=>{if(event.persisted){clearInterval(permissionTimer);permissionTimer=setInterval(checkPermission,60000);checkPermission();}});
return ()=>{save(true);generation++;lookupAbort?.abort();destroy();};
}
});
