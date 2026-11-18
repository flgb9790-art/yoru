window.yoruPages.register(page=>{
 const hero=document.querySelector('[data-audience-hero]');if(!hero)return;
 const slides=[...hero.querySelectorAll('[data-hero-slide]')],buttons=[...hero.querySelectorAll('[data-hero-index]')],bars=buttons.map(b=>b.querySelector('progress')),toggle=hero.querySelector('[data-hero-toggle]'),icon=hero.querySelector('[data-hero-toggle-icon]'),announcement=hero.querySelector('[data-hero-announcement]');
 if(!slides.length)return;
 const reduced=matchMedia('(prefers-reduced-motion: reduce)'),duration=8000;
 let index=0,elapsed=0,last=performance.now(),enabled=!reduced.matches,focused=false,visible=true,start=null,suppressClick=false;
 const paint=()=>{bars.forEach((bar,i)=>bar.value=i<index?1:i===index?elapsed/duration:0);toggle.setAttribute('aria-label',enabled?'Приостановить смену слайдов':'Включить смену слайдов');const glyph=enabled?'pause':'play';if(icon.dataset.icon!==glyph){icon.innerHTML=window.yoruIcons.svg(glyph,{size:14});icon.dataset.icon=glyph;}};
 const videos=[...hero.querySelectorAll('[data-hero-video]')];
 const syncVideo=()=>videos.forEach(video=>{const allowed=video.closest('[data-hero-slide]')===slides[index]&&enabled&&visible&&!document.hidden&&!reduced.matches&&!navigator.connection?.saveData;if(!allowed){video.pause();return;}if(!video.getAttribute('src'))video.src=video.dataset.src;video.muted=true;video.play()?.catch(()=>{});});
 videos.forEach(video=>{page.listen(video,'loadedmetadata',()=>{if(Number.isFinite(video.duration)&&video.duration>10)video.currentTime=5;});page.listen(video,'playing',()=>video.classList.add('is-playing'));page.listen(video,'error',()=>{video.hidden=true;video.pause();});});
 const show=(next,manual=false)=>{index=(next+slides.length)%slides.length;elapsed=0;last=performance.now();slides.forEach((slide,i)=>slide.hidden=i!==index);buttons.forEach((button,i)=>{if(i===index)button.setAttribute('aria-current','true');else button.removeAttribute('aria-current');});if(manual)announcement.textContent=slides[index].querySelector('h3').textContent;paint();syncVideo();};
 const unavailable=img=>{if(img.matches('[data-hero-backdrop]')&&img.dataset.poster&&img.src!==new URL(img.dataset.poster,location.href).href){img.src=img.dataset.poster;}else{img.hidden=true;if(img.parentElement.matches('.audience-cover'))img.parentElement.hidden=true;}};
 const failedImage=img=>{if(img.hasAttribute('data-hero-logo')){img.hidden=true;img.parentElement.querySelector('[data-hero-title]').hidden=false;}else unavailable(img);};
 for(const img of hero.querySelectorAll('img')){page.listen(img,'error',()=>failedImage(img));if(img.complete&&!img.naturalWidth)failedImage(img);}
 hero.querySelectorAll('[data-hero-controls]').forEach(n=>n.hidden=slides.length<2&&n!==toggle?.parentElement);
 hero.querySelector('[data-hero-prev]').hidden=hero.querySelector('[data-hero-next]').hidden=slides.length<2;
 page.listen(hero.querySelector('[data-hero-prev]'),'click',()=>show(index-1,true));page.listen(hero.querySelector('[data-hero-next]'),'click',()=>show(index+1,true));
 buttons.forEach((button,i)=>page.listen(button,'click',()=>show(i,true)));
 page.listen(toggle,'click',()=>{enabled=!enabled;last=performance.now();paint();syncVideo();});
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
 page.interval(()=>{const now=performance.now(),delta=Math.min(now-last,250);last=now;if(!enabled||focused||!visible||document.hidden||start)return;elapsed+=delta;if(elapsed>=duration)show(index+1);else bars[index].value=elapsed/duration;},100);
 paint();syncVideo();return()=>{observer.disconnect();videos.forEach(video=>{video.pause();video.removeAttribute('src');video.load();});};
});
