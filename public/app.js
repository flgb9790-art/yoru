window.yoruPages.register((page)=>{
const listen=page.listen,setInterval=page.interval,setTimeout=page.timeout;
const fetch=(input,options={})=>window.fetch(input,{...options,signal:options.signal||page.signal});
document.querySelectorAll('[data-countdown]').forEach(element=>{
 const date=new Date(element.dataset.countdown);if(Number.isNaN(date.valueOf()))return;
 function update(){const total=Math.floor((date-Date.now())/1000);if(total<=0){element.textContent='Время эфира наступило. Появление перевода проверяется отдельно.';return;}const days=Math.floor(total/86400),hours=Math.floor(total/3600)%24,minutes=Math.floor(total/60)%60;element.textContent=`До следующей серии: ${days} дн. ${hours} ч. ${minutes} мин.`;}
 update();setInterval(update,1000);
});
document.querySelectorAll('[data-cover]').forEach(element=>{element.style.backgroundImage=`linear-gradient(0deg,#e7e0f0dd,#d9cbea44),url("${element.dataset.cover}")`;});
document.querySelectorAll('[data-upload]').forEach(input=>input.addEventListener('change',async()=>{const file=input.files[0];if(!file)return;const message=document.getElementById('upload-message');if(file.size>3*1024*1024){message.textContent='Выбери изображение до 3 МБ.';return;}const form=new FormData();form.append('image',file);message.textContent='Сохраняем изображение…';try{const response=await fetch('/profile/image/'+input.dataset.upload,{method:'POST',headers:{'x-csrf-token':input.dataset.csrf},body:form});if(!response.ok)throw Error('Не удалось загрузить изображение. Разрешены PNG, JPEG и WebP до 3 МБ.');window.yoruNavigate(location.href,{replace:true,scroll:false});}catch(error){message.textContent=error.message;}}));

const authDialog=document.getElementById('auth-dialog');
document.querySelectorAll('[data-auth]').forEach(link=>link.addEventListener('click',event=>{if(!authDialog)return;event.preventDefault();authDialog.showModal();}));
document.querySelector('[data-close-auth]')?.addEventListener('click',()=>authDialog.close());
authDialog?.addEventListener('click',event=>{if(event.target!==authDialog)return;const rect=authDialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)authDialog.close();});
document.querySelectorAll('[data-backdrop]').forEach(el=>{const url=el.dataset.backdrop;if(/^https:\/\//.test(url))el.style.backgroundImage=`linear-gradient(100deg,#f5f1f8ef,#f3f5fae6),url("${url.replace(/["\\\n\r]/g,'')}")`;});
document.querySelectorAll('[data-slide]').forEach(button=>button.addEventListener('click',()=>{const carousel=button.closest('section').querySelector('.carousel'),end=carousel.scrollWidth-carousel.clientWidth,dir=Number(button.dataset.slide);carousel.scrollTo({left:dir>0?(carousel.scrollLeft>=end-2?0:Math.min(end,carousel.scrollLeft+carousel.clientWidth*.8)):(carousel.scrollLeft<=2?end:Math.max(0,carousel.scrollLeft-carousel.clientWidth*.8)),behavior:'smooth'});}));
document.querySelectorAll('.card-info').forEach(button=>button.addEventListener('click',event=>event.preventDefault()));
document.querySelector('[data-random]')?.addEventListener('click',()=>window.yoruNavigate(location.href,{replace:true,scroll:false}));
document.querySelector('[data-shiki-fill]')?.addEventListener('click',async event=>{
 const id=document.querySelector('[data-shiki-id]').value,status=document.querySelector('[data-import-status]'),button=event.currentTarget;
 if(!/^\d+$/.test(id)||Number(id)<1){status.textContent='Введи числовой Shikimori ID.';return;}
 button.disabled=true;status.textContent='Получаем данные Shikimori…';
 try{const response=await fetch('/admin/shikimori/'+id);const anime=await response.json();if(!response.ok)throw Error(anime.error||'Не удалось получить данные Shikimori.');const form=document.querySelector('.anime-editor');
 form.elements.metadata_import.value=JSON.stringify({related:anime.metadata.related,chronology:anime.metadata.chronology,airDate:anime.metadata.airDate,endDate:anime.metadata.endDate});
 const fields={...anime,...anime.metadata,genres:anime.genres.join(', ')};
 for(const [key,value]of Object.entries(fields)){const input=form.elements.namedItem(key);if(input)input.value=Array.isArray(value)?value.join(', '):value??'';}
 status.textContent='Данные загружены. Проверь поля и сохрани аниме.';form.scrollIntoView({block:'start',behavior:'smooth'});
 }catch(error){status.textContent=error.message;}finally{button.disabled=false;}
});
const frameDialog=document.querySelector('[data-frame-dialog]');
document.querySelectorAll('[data-frame]').forEach(button=>button.addEventListener('click',()=>{const source=button.querySelector('img'),image=frameDialog.querySelector('img');image.src=source.src;image.alt=source.alt;frameDialog.showModal();}));
document.querySelector('[data-close-frame]')?.addEventListener('click',()=>frameDialog.close());
frameDialog?.addEventListener('click',event=>{if(event.target!==frameDialog)return;const r=frameDialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)frameDialog.close();});
const menuToggle=document.querySelector('[data-menu-toggle]'),primaryNav=document.getElementById('primary-nav');
if(menuToggle&&primaryNav){menuToggle.closest('header').dataset.navReady='true';menuToggle.addEventListener('click',()=>{const open=menuToggle.getAttribute('aria-expanded')!=='true';menuToggle.setAttribute('aria-expanded',String(open));menuToggle.setAttribute('aria-label',open?'Закрыть меню':'Открыть меню');primaryNav.classList.toggle('is-open',open);});listen(document,'keydown',event=>{if(event.key==='Escape'&&menuToggle.getAttribute('aria-expanded')==='true'){menuToggle.setAttribute('aria-expanded','false');menuToggle.setAttribute('aria-label','Открыть меню');primaryNav.classList.remove('is-open');menuToggle.focus();}});}
const genreCount=document.querySelector('[data-genre-count]');
if(genreCount){const form=genreCount.closest('form');form.addEventListener('change',()=>{genreCount.textContent=form.querySelectorAll('[name=genre]:checked').length||'Все';});}
const filterShell=document.querySelector('.catalog-filter-shell');
if(filterShell){const narrow=matchMedia('(max-width:650px)');const setFilterLayout=()=>{filterShell.open=!narrow.matches||new URLSearchParams(location.search).size>0;};setFilterLayout();narrow.addEventListener('change',setFilterLayout);}
const carouselSections=new Set(Array.from(document.querySelectorAll('[data-slide]'),button=>button.closest('section')));
for(const section of carouselSections){const carousel=section.querySelector('.carousel');if(!carousel)continue;const updateArrows=()=>{const end=carousel.scrollWidth-carousel.clientWidth;for(const button of section.querySelectorAll('[data-slide]'))button.disabled=end<=2;};carousel.addEventListener('scroll',updateArrows,{passive:true});listen(window,'resize',updateArrows);requestAnimationFrame(updateArrows);}
// One detached information window avoids carousel clipping and never resizes cards.
const infoWindow=document.createElement('div');infoWindow.className='anime-info-window';infoWindow.id='anime-info-window';infoWindow.setAttribute('role','tooltip');infoWindow.hidden=true;document.body.append(infoWindow);
let infoTrigger=null,infoTimer;
const desktopInfo=matchMedia('(min-width:651px) and (hover:hover)');
function closeAnimeInfo(){clearTimeout(infoTimer);if(infoTrigger)infoTrigger.removeAttribute('aria-describedby');infoTrigger=null;infoWindow.hidden=true;}
function placeAnimeInfo(){if(!infoTrigger||!desktopInfo.matches)return closeAnimeInfo();const card=infoTrigger.closest('.anime-card').getBoundingClientRect(),gap=12,edge=16;infoWindow.style.width=Math.min(340,innerWidth-edge*2)+'px';infoWindow.style.left='0px';infoWindow.style.top='0px';const size=infoWindow.getBoundingClientRect(),right=innerWidth-card.right-edge,left=card.left-edge;const openRight=right>=size.width+gap||(right>=left&&left<size.width+gap);let x=openRight?card.right+gap:card.left-size.width-gap;x=Math.max(edge,Math.min(x,innerWidth-size.width-edge));infoWindow.style.left=x+'px';infoWindow.style.top=Math.max(edge,Math.min(card.top,innerHeight-size.height-edge))+'px';infoWindow.dataset.side=openRight?'right':'left';}
function openAnimeInfo(button){if(!desktopInfo.matches)return;clearTimeout(infoTimer);if(infoTrigger&&infoTrigger!==button)infoTrigger.removeAttribute('aria-describedby');infoTrigger=button;infoWindow.replaceChildren(...Array.from(button.nextElementSibling.childNodes,n=>n.cloneNode(true)));button.setAttribute('aria-describedby',infoWindow.id);infoWindow.hidden=false;placeAnimeInfo();}
function deferAnimeInfo(){clearTimeout(infoTimer);infoTimer=setTimeout(closeAnimeInfo,130);}
for(const button of document.querySelectorAll('.card-info')){button.addEventListener('mouseenter',()=>openAnimeInfo(button));button.addEventListener('mouseleave',deferAnimeInfo);button.addEventListener('focus',()=>openAnimeInfo(button));button.addEventListener('blur',deferAnimeInfo);}
infoWindow.addEventListener('mouseenter',()=>clearTimeout(infoTimer));infoWindow.addEventListener('mouseleave',deferAnimeInfo);
listen(document,'keydown',event=>{if(event.key==='Escape')closeAnimeInfo();});listen(window,'resize',closeAnimeInfo);listen(document,'scroll',closeAnimeInfo,{capture:true,passive:true});listen(desktopInfo,'change',closeAnimeInfo);
const notificationDrawer=document.querySelector('[data-notification-drawer]');
document.querySelector('[data-notifications]')?.addEventListener('click',()=>notificationDrawer.showModal());
document.querySelector('[data-close-notifications]')?.addEventListener('click',()=>notificationDrawer.close());
notificationDrawer?.addEventListener('click',event=>{if(event.target!==notificationDrawer)return;const r=notificationDrawer.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)notificationDrawer.close();});
for(const carousel of document.querySelectorAll('.carousel')){let dragging=false,startX=0,startScroll=0,moved=false,suppressUntil=0;
 carousel.addEventListener('pointerdown',event=>{if(event.pointerType!=='mouse'||event.button!==0||(event.target.closest('input,select')||(event.target.closest('button')&&!event.target.closest('[data-frame]'))))return;dragging=true;moved=false;startX=event.clientX;startScroll=carousel.scrollLeft;});
 listen(window,'pointermove',event=>{if(!dragging)return;const delta=event.clientX-startX;if(!moved&&Math.abs(delta)<6)return;moved=true;carousel.classList.add('is-dragging');carousel.scrollLeft=startScroll-delta;event.preventDefault();});
 const finish=()=>{if(moved)suppressUntil=Date.now()+250;dragging=false;carousel.classList.remove('is-dragging');};listen(window,'pointerup',finish);listen(window,'pointercancel',finish);listen(window,'blur',finish);
 carousel.addEventListener('dragstart',event=>event.preventDefault());carousel.addEventListener('click',event=>{if(Date.now()<suppressUntil){event.preventDefault();event.stopImmediatePropagation();}},true);
}
// Broken image responses are replaced without changing card geometry.
for(const image of document.querySelectorAll('.poster img')){const missing=()=>{if(!image.isConnected)return;const label=document.createElement('span');label.className='poster-fallback';label.textContent='Постер ожидается';image.replaceWith(label);};image.addEventListener('error',missing,{once:true});if(image.complete&&image.naturalWidth===0||/\/missing[_/.]|\/404[_.]/i.test(image.src))missing();}
const autoStatus=document.querySelector('[data-auto-status]');
if(autoStatus){let updating=false;const elapsed=()=>{for(const node of autoStatus.querySelectorAll('[data-elapsed-since]')){const seconds=Math.max(0,Math.floor((Date.now()-Date.parse(node.dataset.elapsedSince))/1000));node.textContent=Number.isFinite(seconds)?`${Math.floor(seconds/3600)}:${String(Math.floor(seconds/60)%60).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`:'—';}};const refresh=async()=>{if(updating||document.hidden)return;updating=true;try{const response=await fetch('/admin/autoparse/status',{headers:{Accept:'application/json'}});if(!response.ok)throw Error();const data=await response.json();autoStatus.innerHTML=data.html;elapsed();autoStatus.removeAttribute('data-disconnected');}catch{autoStatus.setAttribute('data-disconnected','true');}finally{updating=false;}};elapsed();setInterval(elapsed,1000);setInterval(refresh,5000);listen(document,'visibilitychange',()=>{if(!document.hidden)refresh();});}

return ()=>{closeAnimeInfo();infoWindow.remove();};
});
