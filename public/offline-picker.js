window.yoruPages.register(page=>{
 for(const button of document.querySelectorAll('[data-offline-picker]'))page.listen(button,'click',async()=>{
  if(button.disabled)return;button.disabled=true;
  try{const {openSelection}=await import('/offline/selection.js');if(!page.signal.aborted)await openSelection({animeId:button.dataset.anime,release:button.dataset.release,signal:page.signal});}
  catch(error){if(error.name!=='AbortError'){let text=button.parentElement.querySelector('[data-offline-error]');if(!text){text=document.createElement('span');text.dataset.offlineError='';text.setAttribute('role','alert');button.after(text);}text.textContent='Не удалось открыть загрузки. Попробуй ещё раз.';}}
  finally{button.disabled=false;}
 });
});
