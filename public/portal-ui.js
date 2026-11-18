window.yoruPages.register(page=>{
 const rail=document.querySelector('.portal-sidebar'),toggle=rail?.querySelector('[data-rail-toggle]');
 const apply=collapsed=>{document.documentElement.classList.toggle('portal-rail-collapsed',collapsed);if(toggle){toggle.setAttribute('aria-expanded',String(!collapsed));toggle.setAttribute('aria-label',collapsed?'Развернуть меню':'Свернуть меню');}};
 let saved=false;try{saved=localStorage.getItem('yoru:rail-collapsed')==='true';}catch{}apply(saved);
 if(toggle)page.listen(toggle,'click',()=>{document.documentElement.classList.add('rail-resizing');page.timeout(()=>document.documentElement.classList.remove('rail-resizing'),400);const collapsed=!document.documentElement.classList.contains('portal-rail-collapsed');apply(collapsed);try{localStorage.setItem('yoru:rail-collapsed',String(collapsed));}catch{}});
 const header=document.querySelector('body>header');if(header){const fade=()=>{const opacity=Math.max(0,1-scrollY/140);header.style.setProperty('--search-opacity',String(opacity));header.classList.toggle('portal-search-away',opacity===0);if(opacity===0){document.body.classList.remove('portal-search-open');const list=header.querySelector('.search-results'),input=header.querySelector('.search input');if(list)list.hidden=true;if(input){input.setAttribute('aria-expanded','false');if(document.activeElement===input)input.blur();}}};fade();page.listen(window,'scroll',fade,{passive:true});}
 const menus=[...document.querySelectorAll('.portal-profile-menu')];page.listen(document,'click',event=>menus.forEach(menu=>{if(!menu.contains(event.target))menu.open=false;}));page.listen(document,'keydown',event=>{if(event.key==='Escape')menus.forEach(menu=>menu.open=false);});
 return()=>{document.body.classList.remove('portal-search-open');};
});
