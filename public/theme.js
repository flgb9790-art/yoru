(()=>{
 function sync(){document.documentElement.dataset.theme='dark';document.documentElement.style.colorScheme='dark';try{localStorage.setItem('yoru_theme','dark');}catch{}document.querySelectorAll('[data-theme-toggle]').forEach(button=>button.remove());}
 window.yoruTheme={toggle:sync,sync};sync();document.addEventListener('DOMContentLoaded',sync);document.addEventListener('yoru:navigated',sync);
})();
