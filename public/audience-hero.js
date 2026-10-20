window.yoruPages.register(page=>{
 const hero=document.querySelector('[data-audience-hero]');if(!hero)return;
 const slides=[...hero.querySelectorAll('[data-hero-slide]')],buttons=[...hero.querySelectorAll('[data-hero-index]')],bars=buttons.map(b=>b.querySelector('progress')),toggle=hero.querySelector('[data-hero-toggle]'),icon=hero.querySelector('[data-hero-toggle-icon]'),announcement=hero.querySelector('[data-hero-announcement]');
 if(!slides.length)return;
 const reduced=matchMedia('(prefers-reduced-motion: reduce)'),duration=8000;
 let index=0,elapsed=0,last=performance.now(),enabled=!reduced.matches,hovered=false,focused=false,visible=true,start=null,suppressClick=false;
 const paint=()=>{bars.forEach((bar,i)=>bar.value=i<index?1:i===index?elapsed/duration:0);toggle.setAttribute('aria-label',enabled?'Приостановить смену слайдов':'Включить смену слайдов');icon.setAttribute('d',enabled?'M7 5h4v14H7zM14 5h4v14h-4z':'m8 5 11 7-11 7z');};
 const show=(next,manual=false)=>{index=(next+slides.length)%slides.length;elapsed=0;last=performance.now();slides.forEach((slide,i)=>slide.hidden=i!==index);buttons.forEach((button,i)=>{if(i===index)button.setAttribute('aria-current','true');else button.removeAttribute('aria-current');});if(manual)announcement.textContent=slides[index].querySelector('h3').textContent;paint();};
 const unavailable=img=>{if(img.matches('[data-hero-backdrop]')&&img.dataset.poster&&img.src!==new URL(img.dataset.poster,location.href).href){img.src=img.dataset.poster;}else{img.hidden=true;if(img.parentElement.matches('.audience-cover'))img.parentElement.hidden=true;}};
 for(const img of hero.querySelectorAll('img')){page.listen(img,'error',()=>unavailable(img));if(img.complete&&!img.naturalWidth)unavailable(img);}
 if(slides.length<2)return;
 hero.querySelectorAll('[data-hero-controls]').forEach(n=>n.hidden=false);
 page.listen(hero.querySelector('[data-hero-prev]'),'click',()=>show(index-1,true));page.listen(hero.querySelector('[data-hero-next]'),'click',()=>show(index+1,true));
 buttons.forEach((button,i)=>page.listen(button,'click',()=>show(i,true)));
 page.listen(toggle,'click',()=>{enabled=!enabled;last=performance.now();paint();});
 page.listen(hero,'pointerenter',event=>{if(event.pointerType==='mouse')hovered=true;});page.listen(hero,'pointerleave',()=>{hovered=false;last=performance.now();});
 page.listen(hero,'focusin',()=>focused=true);page.listen(hero,'focusout',event=>{focused=hero.contains(event.relatedTarget);last=performance.now();});
 page.listen(document,'visibilitychange',()=>last=performance.now());
 page.listen(reduced,'change',()=>{if(reduced.matches)enabled=false;last=performance.now();paint();});
 page.listen(hero,'pointerdown',event=>{if(event.isPrimary&&event.pointerType!=='mouse')start={x:event.clientX,y:event.clientY};},{passive:true});
 page.listen(hero,'pointercancel',()=>start=null);
 page.listen(hero,'pointerup',event=>{if(!start)return;const dx=event.clientX-start.x,dy=event.clientY-start.y;start=null;if(Math.abs(dx)>40&&Math.abs(dx)>Math.abs(dy)*1.5){suppressClick=true;show(index+(dx<0?1:-1),true);page.timeout(()=>suppressClick=false,350);}});
 page.listen(hero,'click',event=>{if(suppressClick){event.preventDefault();event.stopPropagation();suppressClick=false;}},{capture:true});
 const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;last=performance.now();},{threshold:.15});observer.observe(hero);
 page.interval(()=>{const now=performance.now(),delta=Math.min(now-last,250);last=now;if(!enabled||hovered||focused||!visible||document.hidden||start)return;elapsed+=delta;if(elapsed>=duration)show(index+1);else bars[index].value=elapsed/duration;},100);
 paint();return()=>observer.disconnect();
});
