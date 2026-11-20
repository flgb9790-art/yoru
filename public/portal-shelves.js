window.yoruPages.register(page=>{
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');const observers=[];
 for(const track of document.querySelectorAll('[data-drag-shelf],[data-character-track]')){
  const shelf=track.closest('.portal-shelf,.character-section,.player-seasons'),controls=[...(shelf?.querySelectorAll('[data-shelf-step]')||[])];let drag=null,moved=false,suppress=false;
  const update=()=>controls.forEach(button=>{button.disabled=Number(button.dataset.shelfStep)<0?track.scrollLeft<2:track.scrollLeft>=track.scrollWidth-track.clientWidth-2;});
  controls.forEach(button=>page.listen(button,'click',()=>track.scrollBy({left:Number(button.dataset.shelfStep)*track.clientWidth*.85,behavior:reduced.matches?'instant':'smooth'})));
  page.listen(track,'pointerdown',event=>{if(event.button!==0||event.pointerType!=='mouse'||event.target.closest('button'))return;drag={id:event.pointerId,x:event.clientX,scroll:track.scrollLeft};moved=false;});
  page.listen(track,'pointermove',event=>{if(!drag||drag.id!==event.pointerId)return;const delta=event.clientX-drag.x;if(!moved&&Math.abs(delta)<6)return;if(!moved){moved=true;track.setPointerCapture(event.pointerId);track.classList.add('is-dragging');}event.preventDefault();track.scrollLeft=drag.scroll-delta;});
  const finish=()=>{if(moved){suppress=true;page.timeout(()=>suppress=false,350);}drag=null;moved=false;track.classList.remove('is-dragging');};page.listen(track,'pointerup',finish);page.listen(track,'pointercancel',finish);page.listen(track,'lostpointercapture',finish);
  page.listen(track,'dragstart',event=>event.preventDefault());page.listen(track,'click',event=>{if(suppress){event.preventDefault();event.stopPropagation();}},{capture:true});
  page.listen(track,'keydown',event=>{if(!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();track.scrollBy({left:(event.key==='ArrowLeft'?-1:1)*track.clientWidth*.8,behavior:reduced.matches?'instant':'smooth'});});page.listen(track,'scroll',update,{passive:true});const observer=new ResizeObserver(update);observer.observe(track);observers.push(observer);update();
 }
 return()=>observers.forEach(o=>o.disconnect());
});
