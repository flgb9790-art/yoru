window.yoruPages.register(page=>{
 const dialog=document.querySelector('.account-dialog');if(!dialog)return;
 let closing=false;
 const reduced=()=>matchMedia('(prefers-reduced-motion:reduce)').matches;
 const finish=()=>{dialog.close();dialog.classList.remove('is-closing');document.documentElement.classList.remove('account-modal-open');closing=false;};
 const close=()=>{if(closing||!dialog.open)return;closing=true;if(reduced())return finish();dialog.classList.add('is-closing');page.timeout(finish,180);};
 for(const trigger of document.querySelectorAll('[data-account-open],[data-auth]'))page.listen(trigger,'click',event=>{
  if(event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
  event.preventDefault();document.querySelector('#mobile-menu[open]')?.close();if(dialog.open)return;
  closing=false;dialog.classList.remove('is-closing');dialog.showModal();document.documentElement.classList.add('account-modal-open');
 });
 page.listen(dialog.querySelector('[data-close-account]'),'click',close);
 page.listen(dialog,'cancel',event=>{event.preventDefault();close();});
 page.listen(dialog,'close',()=>document.documentElement.classList.remove('account-modal-open'));
 page.listen(dialog,'click',event=>{
  const link=event.target.closest('a[href]');if(link&&event.button===0&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&!event.altKey){finish();return;}
  if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();
 });
 return ()=>{document.documentElement.classList.remove('account-modal-open');};
});
