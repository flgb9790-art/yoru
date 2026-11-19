window.yoruPages.register(page=>{
 const root=document.querySelector('.profile-v3');if(!root)return;
 const percent=value=>Math.max(0,Math.min(100,Number(value)||0));
 root.querySelectorAll('[data-level-progress]').forEach(el=>el.style.setProperty('--level-progress',percent(el.dataset.levelProgress)+'%'));
 root.querySelectorAll('[data-list-share]').forEach(el=>el.style.flexGrow=String(Math.max(0,Number(el.dataset.listShare)||0)));
 root.querySelectorAll('[data-genre-percent]').forEach(el=>el.style.width=percent(el.dataset.genrePercent)+'%');
 root.querySelectorAll('.profile-nav a[href^="#"]').forEach(link=>page.listen(link,'click',()=>{root.querySelectorAll('.profile-nav [aria-current]').forEach(el=>el.removeAttribute('aria-current'));link.setAttribute('aria-current','page');}));
});
