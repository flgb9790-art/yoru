window.yoruPages.register(page=>{
 const root=document.querySelector('.apps-page');if(!root)return;
 const tabs=[...root.querySelectorAll('[data-app-tab]')],panels=[...root.querySelectorAll('[data-app-panel]')];
 const select=(name,focus=false)=>{for(const tab of tabs){const current=tab.dataset.appTab===name;tab.setAttribute('aria-selected',String(current));tab.tabIndex=current?0:-1;if(current&&focus)tab.focus();}for(const panel of panels)panel.hidden=panel.dataset.appPanel!==name;};
 root.classList.add('is-enhanced');root.querySelector('.app-guide-tabs').hidden=false;
 const initial=location.hash==='#android-steps'?'android':location.hash==='#ios-steps'?'ios':/Android/i.test(navigator.userAgent)?'android':'ios';select(initial);
 tabs.forEach((tab,index)=>{page.listen(tab,'click',()=>select(tab.dataset.appTab));page.listen(tab,'keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();select(tabs[event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length].dataset.appTab,true);});});
 for(const link of root.querySelectorAll('[data-app-guide]'))page.listen(link,'click',event=>{if(event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;event.preventDefault();select(link.dataset.appGuide);root.querySelector('#'+link.dataset.appGuide+'-steps').scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});});
});
