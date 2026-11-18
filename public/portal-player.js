window.yoruPages.register(page=>{
 document.querySelectorAll('[data-description-toggle]').forEach(button=>page.listen(button,'click',()=>{const expanded=button.getAttribute('aria-expanded')!=='true';button.setAttribute('aria-expanded',String(expanded));button.closest('[data-description]').classList.toggle('is-expanded',expanded);button.textContent=expanded?'Свернуть':'Читать полностью';}));
 const button=document.querySelector('[data-theater-toggle]'),host=document.querySelector('[data-kodik-player]');if(!button||!host)return;
 let active=false;
 const setMode=value=>{active=value;document.body.classList.toggle('portal-theater',active);button.setAttribute('aria-pressed',String(active));button.textContent=active?'Обычный вид':'Режим кинотеатра';};
 page.listen(button,'click',()=>{setMode(!active);button.focus({preventScroll:true});document.querySelector('#player').scrollIntoView({block:'start',behavior:'instant'});});
 page.listen(document,'keydown',event=>{if(event.key==='Escape'&&active&&!document.querySelector('dialog[open]')&&!document.fullscreenElement){setMode(false);button.focus({preventScroll:true});}});
 return()=>document.body.classList.remove('portal-theater');
});
