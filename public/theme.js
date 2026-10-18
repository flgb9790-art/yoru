(()=>{let theme;try{theme=localStorage.getItem('yoru_theme');}catch{}if(!['light','dark'].includes(theme))theme='light';
 function sync(){document.documentElement.dataset.theme=theme;document.documentElement.style.colorScheme=theme;for(const button of document.querySelectorAll('[data-theme-toggle]')){button.setAttribute('aria-label',theme==='dark'?'Включить светлую тему':'Включить тёмную тему');button.setAttribute('aria-pressed',String(theme==='dark'));button.title=button.getAttribute('aria-label');}}
 window.yoruTheme={toggle(){theme=theme==='dark'?'light':'dark';try{localStorage.setItem('yoru_theme',theme);}catch{}sync();},sync};sync();document.addEventListener('DOMContentLoaded',sync);document.addEventListener('yoru:navigated',sync);
})();
