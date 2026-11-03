window.yoruPages.register(page=>{
 const input=document.querySelector('[data-invitation-url]'),button=document.querySelector('[data-copy-invite]');if(!input||!button)return;
 page.listen(button,'click',async()=>{const status=document.querySelector('[data-invite-copy-status]');try{await navigator.clipboard.writeText(input.value);status.textContent='Ссылка скопирована.';}catch{input.focus();input.select();status.textContent='Ссылка выделена. Скопируй её вручную.';}});
});
