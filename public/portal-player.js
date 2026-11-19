window.yoruPages.register(page=>{
 document.querySelectorAll('[data-description-toggle]').forEach(button=>page.listen(button,'click',()=>{const expanded=button.getAttribute('aria-expanded')!=='true';button.setAttribute('aria-expanded',String(expanded));button.closest('[data-description]').classList.toggle('is-expanded',expanded);button.textContent=expanded?'Свернуть':'Читать полностью';}));
 const button=document.querySelector('[data-theater-toggle]'),host=document.querySelector('[data-kodik-player]');if(!button||!host)return;
 const home=button.parentElement,heading=document.querySelector('#player .player-heading-actions');let active=false,savedScroll=0;
 const setMode=value=>{if(value)savedScroll=scrollY;active=value;if(active&&heading)heading.append(button);else home.prepend(button);document.body.classList.toggle('portal-theater',active);button.setAttribute('aria-pressed',String(active));button.textContent=active?'Выйти из кинотеатра':'Режим кинотеатра';if(!active)window.scrollTo({top:savedScroll,behavior:'instant'});};
 page.listen(button,'click',()=>{setMode(!active);button.focus({preventScroll:true});});
 page.listen(document,'keydown',event=>{if(event.key==='Escape'&&active&&!document.querySelector('dialog[open]')&&!document.fullscreenElement){setMode(false);button.focus({preventScroll:true});}});
 return()=>document.body.classList.remove('portal-theater');
});
