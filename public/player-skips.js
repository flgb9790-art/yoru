/* Episode-specific provider timings; never guess a fixed intro/outro duration. */
(()=>{
 function rangeAt(skips,time,duration){if(!Number.isFinite(time)||!Number.isFinite(duration)||duration<=0)return null;for(const kind of ['opening','ending']){const range=skips?.[kind];if(range&&typeof range.start==='number'&&typeof range.end==='number'&&Number.isFinite(range.start)&&Number.isFinite(range.end)&&range.start>=0&&range.end>range.start&&range.end<=duration+.5&&time>=range.start&&time<range.end-.1)return {kind,start:range.start,end:range.end};}return null;}
 function mount({video,host,skips,signal,enabled=()=>true,onSeek=()=>{}}){
  if(!skips||!host)return()=>{};const controller=new AbortController(),listen=(target,type,fn)=>target.addEventListener(type,fn,{signal:controller.signal});let disposed=false;
  const bar=document.createElement('div'),button=document.createElement('button');bar.className='player-skip-overlay';bar.hidden=true;button.type='button';button.className='player-skip-button';bar.append(button);host.append(bar);
  let expand;
  if(host.requestFullscreen&&Object.values(skips).some(r=>r&&r.end>r.start)){expand=document.createElement('button');expand.type='button';expand.className='player-expand';expand.setAttribute('aria-label','На весь экран');expand.innerHTML=''+window.yoruIcons.svg("maximize")+'';host.append(expand);video.dataset.yoruFullscreen='true';listen(expand,'click',()=>{if(document.fullscreenElement===host)document.exitFullscreen().catch(()=>{});else host.requestFullscreen().catch(()=>{});});}
  const update=()=>{if(disposed)return;const range=enabled()?rangeAt(skips,video.currentTime,video.duration):null;bar.hidden=!range;if(expand)expand.setAttribute('aria-label',document.fullscreenElement===host?'Выйти из полноэкранного режима':'На весь экран');if(!range)return;const label=range.kind==='opening'?'Пропустить опенинг':'Пропустить эндинг';if(button.getAttribute('aria-label')!==label){button.innerHTML='<span>'+label+'</span>'+window.yoruIcons.svg('skip-forward',{size:15});button.setAttribute('aria-label',label);}};
  listen(button,'click',()=>{const range=enabled()?rangeAt(skips,video.currentTime,video.duration):null;if(!range)return;video.currentTime=Math.min(range.end,Math.max(0,video.duration-.05));onSeek(range.kind);update();});
  for(const event of ['timeupdate','seeked','loadedmetadata','durationchange','play','pause'])listen(video,event,update);for(const event of ['fullscreenchange','webkitfullscreenchange'])listen(document,event,update);
  function dispose(){if(disposed)return;disposed=true;controller.abort();bar.remove();expand?.remove();delete video.dataset.yoruFullscreen;}
  signal?.addEventListener('abort',dispose,{once:true});if(signal?.aborted)dispose();else update();return dispose;
 }
 window.yoruPlayerSkips={mount,rangeAt};
})();
