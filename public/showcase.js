window.yoruPages.register(page=>{
 // Keep a failed external poster from stretching a card or exposing broken-image text.
 const posterSelector='.profile-showcase img,.showcase-all .poster img,.top-anime img,.showcase-editor-row img';
 function failedPoster(img){if(!img.isConnected)return;const fallback=document.createElement('span');fallback.textContent='YORU.';fallback.setAttribute('aria-hidden','true');fallback.className=img.closest('.showcase-card')?'showcase-placeholder':img.closest('.top-anime')?'top-poster':img.closest('.showcase-editor-row')?'showcase-editor-placeholder':'showcase-poster-fallback';img.replaceWith(fallback);}
 function checkPoster(img){if(img.complete&&!img.naturalWidth)failedPoster(img);}
 // Delegate errors: virtual cards must not accumulate per-image lifecycle listeners.
 page.listen(document,'error',event=>{if(event.target instanceof HTMLImageElement&&event.target.matches(posterSelector))failedPoster(event.target);},{capture:true});
 document.querySelectorAll(posterSelector).forEach(checkPoster);
 const root=document.querySelector('[data-showcase]');if(!root)return;
 const total=Number(root.dataset.total);if(!total)return;
 const track=root.querySelector('.showcase-track'),viewport=root.querySelector('.showcase-window'),controls=root.querySelector('.showcase-controls'),pause=root.querySelector('[data-showcase-pause]'),status=root.querySelector('.showcase-status'),reduced=matchMedia('(prefers-reduced-motion: reduce)');
 const cache=new Map([[0,JSON.parse(root.dataset.items)]]),pending=new Map();
 let index=0,busy=false,paused=reduced.matches,hovered=false,focused=false,inView=true,last=performance.now(),renderVersion=0,suppressClickUntil=0;
 const visible=()=>innerWidth<=650?3:innerWidth<=1000?5:8;
 const normalize=n=>(n%total+total)%total;
 function pauseState(){pause.setAttribute('aria-pressed',String(paused));pause.setAttribute('aria-label',paused?'Продолжить прокрутку':'Приостановить витрину');pause.querySelector('path').setAttribute('d',paused?'m8 5 11 7-11 7Z':'M7 5h3v14H7zM14 5h3v14h-3z');}
 function card(a,i){
  const link=document.createElement('a');link.className='showcase-card';link.href='/anime/'+encodeURIComponent(a.id);link.title=a.name;
  if(i>=visible()){link.tabIndex=-1;link.setAttribute('aria-hidden','true');}
  if(a.poster){const img=document.createElement('img');img.src=a.poster;img.alt='';img.loading='lazy';img.width=160;img.height=230;link.append(img);}else{const span=document.createElement('span');span.className='showcase-placeholder';span.textContent='YORU.';link.append(span);}
  const caption=document.createElement('span'),name=document.createElement('strong'),meta=document.createElement('small');caption.className='showcase-caption';name.textContent=a.name;meta.textContent='★ '+Number(a.rating).toFixed(1)+(a.year?' · '+a.year:'');caption.append(name,meta);link.append(caption);return link;
 }
 async function item(n){
  n=normalize(n);const batch=Math.floor(n/24);
  if(!cache.has(batch)){
   if(!pending.has(batch))pending.set(batch,(async()=>{const response=await fetch('/api/users/'+encodeURIComponent(root.dataset.user)+'/showcase?page='+(batch+1),{signal:page.signal});if(!response.ok)throw Error('Не удалось загрузить витрину. Нажми стрелку, чтобы повторить.');const data=await response.json();if(data.total!==total)throw Error('Витрина обновилась. Открой профиль заново.');cache.set(batch,data.rows);if(cache.size>3)cache.delete(cache.keys().next().value);})().finally(()=>pending.delete(batch)));
   await pending.get(batch);
  }
  const a=cache.get(batch)?.[n%24];if(!a)throw Error('Витрина обновилась. Открой профиль заново.');return a;
 }
 async function render(start=index){
  const version=++renderVersion,count=Math.min(total,visible()+1),rows=[];for(let i=0;i<count;i++)rows.push(await item(start+i));
  if(page.signal.aborted||version!==renderVersion)return;track.style.transition='none';track.style.transform='';track.replaceChildren(...rows.map(card));track.querySelectorAll('img').forEach(checkPoster);controls.hidden=total<=visible();pauseState();
 }
 async function step(direction){
  if(busy||total<=visible())return;busy=true;status.textContent='';
  const focusOffset=[...track.children].indexOf(document.activeElement);
  try{
   const next=normalize(index+direction);await item(next+visible());if(page.signal.aborted)return;
   if(!reduced.matches){
    if(direction<0)await render(next);
    const width=track.firstElementChild.getBoundingClientRect().width+12;
    track.style.transition='none';track.style.transform=direction<0?'translateX(-'+width+'px)':'';track.getBoundingClientRect();
    track.style.transition='transform 350ms ease';track.style.transform=direction<0?'translateX(0)':'translateX(-'+width+'px)';
    await new Promise(resolve=>page.timeout(resolve,360));
   }
   index=next;await render();if(focusOffset>=0&&!page.signal.aborted)track.children[Math.min(focusOffset,visible()-1)]?.focus({preventScroll:true});
  }catch(error){if(!page.signal.aborted){status.textContent=error.message;paused=true;pauseState();}}
  finally{busy=false;last=performance.now();}
 }
 page.listen(root.querySelector('[data-showcase-next]'),'click',()=>step(1));page.listen(root.querySelector('[data-showcase-prev]'),'click',()=>step(-1));
 page.listen(pause,'click',()=>{paused=!paused;last=performance.now();pauseState();});
 page.listen(root,'pointerenter',event=>{if(event.pointerType==='mouse')hovered=true;});page.listen(root,'pointerleave',()=>{hovered=false;last=performance.now();});
 page.listen(root,'focusin',()=>focused=true);page.listen(root,'focusout',event=>{focused=!!event.relatedTarget&&root.contains(event.relatedTarget);last=performance.now();});page.listen(document,'visibilitychange',()=>last=performance.now());
 page.listen(viewport,'keydown',event=>{if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();step(event.key==='ArrowRight'?1:-1);}});
 let touch=null;
 page.listen(viewport,'touchstart',event=>{const t=event.touches[0];touch=t?{x:t.clientX,y:t.clientY}:null;},{passive:true});
 page.listen(viewport,'touchend',event=>{const t=event.changedTouches[0];if(t&&touch){const dx=t.clientX-touch.x,dy=t.clientY-touch.y;if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.2){suppressClickUntil=Date.now()+600;step(dx<0?1:-1);}}touch=null;},{passive:true});
 page.listen(viewport,'touchcancel',()=>touch=null,{passive:true});page.listen(viewport,'click',event=>{if(Date.now()<suppressClickUntil){event.preventDefault();event.stopPropagation();}},{capture:true});
 page.listen(window,'resize',()=>{if(!busy)render().catch(error=>{if(!page.signal.aborted)status.textContent=error.message;});});
 const observer=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{inView=entries[0].isIntersecting;last=performance.now();}):null;observer?.observe(root);
 page.interval(()=>{if(!paused&&!hovered&&!focused&&inView&&!document.hidden&&performance.now()-last>=4500)step(1);},500);
 render().catch(error=>{if(!page.signal.aborted)status.textContent=error.message;});
 return()=>observer?.disconnect();
});
