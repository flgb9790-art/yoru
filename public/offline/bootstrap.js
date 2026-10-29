/* Upgrade cached UI before importing the library or the episode picker. */
export async function prepareOffline(){
 if(!isSecureContext||!navigator.serviceWorker||!window.caches)throw Error('Офлайн-загрузки требуют HTTPS и современный браузер.');
 let registration=await navigator.serviceWorker.getRegistration('/');
 if(registration?.active&&!registration.active.scriptURL.endsWith('/offline-sw.js'))throw Error('На сайте уже установлен другой офлайн-модуль.');
 if(!registration)registration=await navigator.serviceWorker.register('/offline-sw.js',{type:'module',scope:'/'});
 else if(navigator.onLine)await registration.update();
 const candidate=registration.installing||registration.waiting;
 if(candidate&&candidate.state!=='activated')await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Не удалось обновить загрузки. Обнови страницу.')),20000),check=()=>{if(candidate.state==='activated'){clearTimeout(timer);resolve();}else if(candidate.state==='redundant'){clearTimeout(timer);reject(Error('Не удалось обновить офлайн-модуль.'));}};candidate.addEventListener('statechange',check);check();});
 await navigator.serviceWorker.ready;
 if(!navigator.serviceWorker.controller)await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Обнови страницу, чтобы включить загрузки.')),10000);navigator.serviceWorker.addEventListener('controllerchange',()=>{clearTimeout(timer);resolve();},{once:true});});
 window.yoruOfflinePrepared=true;
}
if(document.body.hasAttribute('data-offline-library')){try{await prepareOffline();await import('./library.js?v=10');}catch(e){const status=document.getElementById('status');if(status)status.textContent=e.message;}}
