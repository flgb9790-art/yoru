window.yoruPages.register(page=>{
 const dialog=document.querySelector('dialog[data-private-entry]');if(!dialog)return;
 if(dialog.open)dialog.close();dialog.showModal();document.documentElement.classList.add('account-modal-open');
 page.listen(dialog,'cancel',event=>event.preventDefault());
});
