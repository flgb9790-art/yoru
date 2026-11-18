window.yoruPages.register(page=>{
 for(const img of document.querySelectorAll('[data-anime-logo]')){const fail=()=>{img.hidden=true;img.parentElement.querySelector('[data-anime-title]').hidden=false;};page.listen(img,'error',fail);if(img.complete&&!img.naturalWidth)fail();}
 const videos=[...document.querySelectorAll('[data-theme-preview]')];for(const video of videos){const details=video.closest('details');page.listen(details,'toggle',()=>{if(details.open){if(!video.getAttribute('src'))video.src=video.dataset.src;}else video.pause();});page.listen(video,'error',()=>{video.hidden=true;details.querySelector('[data-theme-error]').hidden=false;});}
 return()=>videos.forEach(video=>{video.pause();video.removeAttribute('src');video.load();});
});
