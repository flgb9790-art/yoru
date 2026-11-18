window.yoruPages.register(page=>{
 const hero=document.querySelector('[data-audience-hero]');if(!hero)return;
 const slides=[...hero.querySelectorAll('[data-hero-slide]')],buttons=[...hero.querySelectorAll('[data-hero-index]')],bars=buttons.map(b=>b.querySelector('progress')),announcement=hero.querySelector('[data-hero-announcement]');
 if(!slides.length)return;
 const reduced=matchMedia('(prefers-reduced-motion: reduce)'),duration=8000;
 let index=0,elapsed=0,last=performance.now(),enabled=!reduced.matches,focused=false,visible=true,start=null,suppressClick=false;
 const paint=()=>{const video=slides[index].querySelector('video:not([hidden])'),progress=video&&Number.isFinite(video.duration)&&video.duration>0?video.currentTime/video.duration:elapsed/duration;bars.forEach((bar,i)=>bar.value=i<index?1:i===index?progress:0);};
 const videos=[...hero.querySelectorAll('[data-hero-video]')];
 const syncVideo=()=>videos.forEach(video=>{const allowed=video.closest('[data-hero-slide]')===slides[index]&&enabled&&visible&&!document.hidden&&!reduced.matches&&!navigator.connection?.saveData;if(!allowed){video.pause();return;}if(video.hidden)return;if(!video.getAttribute('src')){video.src=video.dataset.src;page.timeout(()=>{if(video.readyState<2){video.hidden=true;video.pause();elapsed=0;}},20000);}video.muted=true;video.play()?.catch(error=>{if(error.name!=='AbortError'){video.hidden=true;elapsed=0;}});});
 videos.forEach(video=>{page.listen(video,'playing',()=>video.classList.add('is-playing'));page.listen(video,'ended',()=>{if(video.closest('[data-hero-slide]')===slides[index]&&enabled&&!focused&&visible&&!document.hidden)show(index+1);});page.listen(video,'error',()=>{video.hidden=true;video.pause();elapsed=0;});});
 let transition=0;const show=(next,manual=false)=>{const previous=index;index=(next+slides.length)%slides.length;if(index===previous&&slides.length>1)return;const token=++transition;elapsed=0;last=performance.now();const video=slides[index].querySelector('video');if(video?.getAttribute('src'))video.currentTime=0;slides.forEach((slide,i)=>{slide.classList.remove('is-entering','is-leaving');slide.hidden=i!==index;slide.inert=i!==index;slide.setAttribute('aria-hidden',String(i!==index));});if(previous!==index&&!reduced.matches){const old=slides[previous];old.hidden=false;old.classList.add('is-leaving');slides[index].classList.add('is-entering');page.timeout(()=>{if(token!==transition)return;old.hidden=true;old.classList.remove('is-leaving');slides[index].classList.remove('is-entering');},550);}buttons.forEach((button,i)=>{if(i===index)button.setAttribute('aria-current','true');else button.removeAttribute('aria-current');});if(manual)announcement.textContent=slides[index].querySelector('h3').textContent;paint();syncVideo();};
 const unavailable=img=>{if(img.matches('[data-hero-backdrop]')&&img.dataset.poster&&img.src!==new URL(img.dataset.poster,location.href).href){img.src=img.dataset.poster;}else{img.hidden=true;if(img.parentElement.matches('.audience-cover'))img.parentElement.hidden=true;}};
 const failedImage=img=>{if(img.hasAttribute('data-hero-logo'))img.hidden=true;else unavailable(img);};
 for(const img of hero.querySelectorAll('img')){page.listen(img,'error',()=>failedImage(img));if(img.complete&&!img.naturalWidth)failedImage(img);}
 hero.querySelectorAll('[data-hero-controls]').forEach(n=>n.hidden=slides.length<2);
 hero.querySelector('[data-hero-prev]').hidden=hero.querySelector('[data-hero-next]').hidden=slides.length<2;
 page.listen(hero.querySelector('[data-hero-prev]'),'click',()=>show(index-1,true));page.listen(hero.querySelector('[data-hero-next]'),'click',()=>show(index+1,true));
 buttons.forEach((button,i)=>page.listen(button,'click',()=>show(i,true)));

 // Pointer clicks leave focus on a control; only keyboard focus should pause rotation.
 page.listen(hero,'focusin',event=>focused=event.target.matches(':focus-visible'));
 page.listen(hero,'focusout',event=>{focused=!!event.relatedTarget&&hero.contains(event.relatedTarget)&&event.relatedTarget.matches(':focus-visible');last=performance.now();});
 page.listen(hero,'keydown',()=>focused=true);
 page.listen(document,'visibilitychange',()=>{last=performance.now();syncVideo();});
 page.listen(reduced,'change',()=>{if(reduced.matches)enabled=false;last=performance.now();paint();syncVideo();});
 page.listen(hero,'pointerdown',event=>{focused=false;if(event.isPrimary&&event.pointerType!=='mouse')start={x:event.clientX,y:event.clientY};},{passive:true});
 page.listen(hero,'pointercancel',()=>start=null);
 page.listen(hero,'pointerup',event=>{if(!start)return;const dx=event.clientX-start.x,dy=event.clientY-start.y;start=null;if(Math.abs(dx)>40&&Math.abs(dx)>Math.abs(dy)*1.5){suppressClick=true;show(index+(dx<0?1:-1),true);page.timeout(()=>suppressClick=false,350);}});
 page.listen(hero,'click',event=>{if(suppressClick){event.preventDefault();event.stopPropagation();suppressClick=false;}},{capture:true});
 const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;last=performance.now();syncVideo();},{threshold:.15});observer.observe(hero);
 page.interval(()=>{const now=performance.now(),delta=Math.min(now-last,250);last=now;if(!enabled||focused||!visible||document.hidden||start)return;const video=slides[index].querySelector('video:not([hidden])');if(video&&!reduced.matches&&!navigator.connection?.saveData){if(Number.isFinite(video.duration)&&video.duration>0)bars[index].value=video.currentTime/video.duration;if(video.ended)show(index+1);return;}elapsed+=delta;if(elapsed>=duration)show(index+1);else bars[index].value=elapsed/duration;},100);
 paint();syncVideo();return()=>{observer.disconnect();videos.forEach(video=>{video.pause();video.removeAttribute('src');video.load();});};
});
