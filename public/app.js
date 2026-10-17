document.querySelectorAll('[data-countdown]').forEach(element=>{
 const date=new Date(element.dataset.countdown);if(Number.isNaN(date.valueOf()))return;
 function update(){const total=Math.floor((date-Date.now())/1000);if(total<=0){element.textContent='Время эфира наступило. Появление перевода проверяется отдельно.';return;}const days=Math.floor(total/86400),hours=Math.floor(total/3600)%24,minutes=Math.floor(total/60)%60;element.textContent=`До следующей серии: ${days} дн. ${hours} ч. ${minutes} мин.`;}
 update();setInterval(update,1000);
});
document.querySelectorAll('[data-cover]').forEach(element=>{element.style.backgroundImage=`linear-gradient(0deg,#e7e0f0dd,#d9cbea44),url("${element.dataset.cover}")`;});
document.querySelectorAll('[data-upload]').forEach(input=>input.addEventListener('change',async()=>{const file=input.files[0];if(!file)return;const message=document.getElementById('upload-message');if(file.size>3*1024*1024){message.textContent='Выбери изображение до 3 МБ.';return;}const form=new FormData();form.append('image',file);message.textContent='Сохраняем изображение…';try{const response=await fetch('/profile/image/'+input.dataset.upload,{method:'POST',headers:{'x-csrf-token':input.dataset.csrf},body:form});if(!response.ok)throw Error('Не удалось загрузить изображение. Разрешены PNG, JPEG и WebP до 3 МБ.');location.reload();}catch(error){message.textContent=error.message;}}));

const authDialog=document.getElementById('auth-dialog');
document.querySelectorAll('[data-auth]').forEach(link=>link.addEventListener('click',event=>{if(!authDialog)return;event.preventDefault();authDialog.showModal();}));
document.querySelector('[data-close-auth]')?.addEventListener('click',()=>authDialog.close());
authDialog?.addEventListener('click',event=>{if(event.target!==authDialog)return;const rect=authDialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)authDialog.close();});
document.querySelectorAll('[data-backdrop]').forEach(el=>{const url=el.dataset.backdrop;if(/^https:\/\//.test(url))el.style.backgroundImage=`linear-gradient(100deg,#f5f1f8ef,#f3f5fae6),url("${url.replace(/["\\\n\r]/g,'')}")`;});
document.querySelectorAll('[data-slide]').forEach(button=>button.addEventListener('click',()=>{const carousel=button.closest('section').querySelector('.carousel');carousel.scrollBy({left:Number(button.dataset.slide)*carousel.clientWidth*.8,behavior:'smooth'});}));
document.querySelectorAll('.card-info').forEach(button=>button.addEventListener('click',event=>event.preventDefault()));
document.querySelector('[data-random]')?.addEventListener('click',()=>location.reload());
document.querySelector('[data-shiki-fill]')?.addEventListener('click',async event=>{
 const id=document.querySelector('[data-shiki-id]').value,status=document.querySelector('[data-import-status]'),button=event.currentTarget;
 if(!/^\d+$/.test(id)||Number(id)<1){status.textContent='Введи числовой Shikimori ID.';return;}
 button.disabled=true;status.textContent='Получаем данные Shikimori…';
 try{const response=await fetch('/admin/shikimori/'+id);if(!response.ok)throw Error('Не удалось получить данные. Проверь ID и попробуй снова.');const anime=await response.json(),form=document.querySelector('form[action="/admin/manual"]');
 form.elements.metadata_import.value=JSON.stringify({related:anime.metadata.related,airDate:anime.metadata.airDate,endDate:anime.metadata.endDate});
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
if(menuToggle&&primaryNav){menuToggle.closest('header').dataset.navReady='true';menuToggle.addEventListener('click',()=>{const open=menuToggle.getAttribute('aria-expanded')!=='true';menuToggle.setAttribute('aria-expanded',String(open));menuToggle.setAttribute('aria-label',open?'Закрыть меню':'Открыть меню');primaryNav.classList.toggle('is-open',open);});document.addEventListener('keydown',event=>{if(event.key==='Escape'&&menuToggle.getAttribute('aria-expanded')==='true'){menuToggle.setAttribute('aria-expanded','false');menuToggle.setAttribute('aria-label','Открыть меню');primaryNav.classList.remove('is-open');menuToggle.focus();}});}
const genreCount=document.querySelector('[data-genre-count]');
if(genreCount){const form=genreCount.closest('form');form.addEventListener('change',()=>{genreCount.textContent=form.querySelectorAll('[name=genre]:checked').length||'Все';});}
const filterShell=document.querySelector('.catalog-filter-shell');
if(filterShell){const narrow=matchMedia('(max-width:650px)');const setFilterLayout=()=>{filterShell.open=!narrow.matches||new URLSearchParams(location.search).size>0;};setFilterLayout();narrow.addEventListener('change',setFilterLayout);}
const carouselSections=new Set(Array.from(document.querySelectorAll('[data-slide]'),button=>button.closest('section')));
for(const section of carouselSections){const carousel=section.querySelector('.carousel');if(!carousel)continue;const updateArrows=()=>{const end=carousel.scrollWidth-carousel.clientWidth;for(const button of section.querySelectorAll('[data-slide]'))button.disabled=Number(button.dataset.slide)<0?carousel.scrollLeft<=2:carousel.scrollLeft>=end-2;};carousel.addEventListener('scroll',updateArrows,{passive:true});window.addEventListener('resize',updateArrows);requestAnimationFrame(updateArrows);}
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
document.addEventListener('keydown',event=>{if(event.key==='Escape')closeAnimeInfo();});window.addEventListener('resize',closeAnimeInfo);document.addEventListener('scroll',closeAnimeInfo,{capture:true,passive:true});desktopInfo.addEventListener('change',closeAnimeInfo);
