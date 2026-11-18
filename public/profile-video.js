window.yoruPages.register(page=>{
 const video=document.querySelector('[data-profile-video]'),button=document.querySelector('[data-profile-video-toggle]');if(!video||!button)return;
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');let enabled=!reduced.matches&&!navigator.connection?.saveData,visible=true;
 const sync=()=>{if(!enabled||!visible||document.hidden){video.pause();}else{if(!video.getAttribute('src'))video.src=video.dataset.src;video.muted=true;video.play()?.catch(()=>{});}button.setAttribute('aria-pressed',String(enabled));button.textContent=enabled?'Пауза обложки':'Включить обложку';};
 page.listen(button,'click',()=>{enabled=!enabled;sync();});page.listen(video,'playing',()=>video.classList.add('is-playing'));page.listen(video,'error',()=>{video.hidden=true;button.hidden=true;});page.listen(video,'loadedmetadata',()=>{if(Number.isFinite(video.duration)&&video.duration>10)video.currentTime=5;});page.listen(document,'visibilitychange',sync);page.listen(reduced,'change',()=>{if(reduced.matches)enabled=false;sync();});
 const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;sync();},{threshold:.1});observer.observe(video);sync();
 return()=>{observer.disconnect();video.pause();video.removeAttribute('src');video.load();};
});
