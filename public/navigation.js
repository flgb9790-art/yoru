/* Page lifecycle keeps timers, global handlers and media scoped to one AJAX visit. */
(()=>{
 document.documentElement.dataset.inputModality='pointer';
 document.addEventListener('pointerdown',()=>{document.documentElement.dataset.inputModality='pointer';},{capture:true});
 document.addEventListener('keydown',event=>{if(['Tab','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End','Enter',' '].includes(event.key))document.documentElement.dataset.inputModality='keyboard';},{capture:true});

 const mounts=[],cleanups=[];
 window.yoruPages={register(mount){mounts.push(mount);start(mount);}};
 function start(mount){const controller=new AbortController(),timers=[];
  const page={signal:controller.signal,listen(target,type,fn,options={}){target.addEventListener(type,fn,{...(typeof options==='boolean'?{capture:options}:options),signal:controller.signal});},interval(fn,ms){const id=window.setInterval(fn,ms);timers.push(id);return id;},timeout(fn,ms){const id=window.setTimeout(fn,ms);timers.push(id);return id;}};
  const dispose=mount(page);cleanups.push(()=>{dispose?.();controller.abort();timers.forEach(id=>{clearInterval(id);clearTimeout(id);});});
 }
 const assetStamp=doc=>JSON.stringify([...doc.querySelectorAll('head script[src],head link[rel="stylesheet"]')].map(node=>node.getAttribute('src')||node.getAttribute('href')));
 const loadedAssets=assetStamp(document);
 let request,visit=0;
 const eligible=url=>url.origin===location.origin&&/^https?:$/.test(url.protocol)&&!/^\/(auth|logout|api|media|vendor)(\/|$)/.test(url.pathname)&&! /\.(?:js|css|png|jpe?g|webp|svg|zip|json|mp4|m3u8)$/i.test(url.pathname);
 function position(url,scroll){if(scroll===false)return;const target=url.hash&&document.getElementById(decodeURIComponent(url.hash.slice(1)));if(target)target.scrollIntoView({block:'start'});else window.scrollTo({top:0,left:0,behavior:'instant'});}
 function message(text){let box=document.querySelector('[data-navigation-error]');if(!box){box=document.createElement('p');box.dataset.navigationError='';box.setAttribute('role','alert');document.querySelector('main').prepend(box);}box.textContent=text;}
 async function navigate(input,{replace=false,scroll=true,method='GET',body,fromHistory=false,fragment}={}){
  const url=new URL(input,location.href);if(!eligible(url)){location.assign(url.href);return;}
  const id=++visit;request?.abort();request=new AbortController();document.documentElement.classList.add('is-navigating');
  try{const response=await fetch(url.href,{method,body,credentials:'same-origin',signal:request.signal,headers:{Accept:'text/html','X-Requested-With':'YoruNavigation'}});
   if(id!==visit)return;const final=new URL(response.url||url.href);if(!eligible(final)){location.assign(final.href);return;}
   const text=await response.text();if(id!==visit)return;
   if(!response.headers.get('content-type')?.includes('text/html')){message(text.slice(0,600)||'Не удалось выполнить действие.');return;}
   const doc=new DOMParser().parseFromString(text,'text/html');if(!doc.querySelector('main')||!doc.querySelector('header')){message(doc.body.textContent.slice(0,600)||'Не удалось открыть страницу.');return;}
   // A deployment may change globally loaded players/styles. Never combine a new
   // body with old page mounts that remain in memory after an AJAX navigation.
   if(assetStamp(doc)!==loadedAssets){if(final.pathname===url.pathname&&final.search===url.search)final.hash=url.hash;if(replace||fromHistory)location.replace(final.href);else location.assign(final.href);return;}
   if(fragment){const current=document.querySelector(fragment),next=doc.querySelector(fragment);if(current&&next&&final.pathname===location.pathname){const x=scrollX,y=scrollY,tools=current.querySelector('.progress-tools')?.open;current.replaceWith(document.importNode(next,true));const updated=document.querySelector(fragment);if(tools&&updated.querySelector('.progress-tools'))updated.querySelector('.progress-tools').open=true;history.replaceState({},'',final.href);window.scrollTo({left:x,top:y,behavior:'instant'});document.dispatchEvent(new CustomEvent('yoru:fragment',{detail:{selector:fragment,requestUrl:url.href,url:final.href,method}}));return;}}
   cleanups.splice(0).forEach(dispose=>dispose());document.querySelectorAll('dialog[open]').forEach(d=>d.close());
   doc.querySelectorAll('script').forEach(s=>s.remove());document.body.replaceWith(document.importNode(doc.body,true));document.title=doc.title;
   if(final.pathname===url.pathname&&final.search===url.search)final.hash=url.hash;
   if(!fromHistory)history[replace?'replaceState':'pushState']({},'',final.href);else if(final.href!==location.href)history.replaceState({},'',final.href);
   mounts.forEach(start);position(final,scroll);document.dispatchEvent(new CustomEvent('yoru:navigated'));
  }catch(error){if(error.name!=='AbortError'&&id===visit)message('Не удалось загрузить страницу. Проверь соединение и повтори действие.');}
  finally{if(id===visit)document.documentElement.classList.remove('is-navigating');}
 }
 window.yoruNavigate=navigate;history.scrollRestoration='manual';
 document.addEventListener('click',event=>{const a=event.target.closest('a[href]');if(event.defaultPrevented||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||!a||a.hasAttribute('download')||a.target&&a.target!=='_self'||a.matches('[data-auth],[data-no-ajax]'))return;const url=new URL(a.href,location.href);if(!eligible(url))return;if(url.pathname===location.pathname&&url.search===location.search&&url.hash){event.preventDefault();history.pushState({},'',url.href);position(url,true);return;}event.preventDefault();navigate(url.href);});
 document.addEventListener('submit',event=>{const form=event.target;if(event.defaultPrevented||!(form instanceof HTMLFormElement)||form.matches('[data-no-ajax]')||form.target&&form.target!=='_self')return;const url=new URL(form.action||location.href,location.href),method=form.method.toUpperCase();if(!eligible(url)||!['GET','POST'].includes(method))return;const data=new FormData(form);if(event.submitter?.name)data.append(event.submitter.name,event.submitter.value);if([...data.values()].some(v=>v instanceof File&&v.size))return;event.preventDefault();let body;if(method==='GET'){url.search='';for(const [key,value]of data)url.searchParams.append(key,String(value));}else body=new URLSearchParams([...data].map(([k,v])=>[k,String(v)]));if(form.dataset.confirm&&!window.confirm(form.dataset.confirm)){event.preventDefault();return;}const discussion=method==='POST'&&(form.closest('[data-discussion]')||form.closest('[data-comment-moderation]'));if(discussion){if(discussion.getAttribute('aria-busy')==='true')return;discussion.setAttribute('aria-busy','true');const buttons=[...discussion.querySelectorAll('button')].filter(b=>!b.disabled);buttons.forEach(b=>b.disabled=true);navigate(url.href,{method,body,fragment:discussion.matches('[data-comment-moderation]')?'[data-comment-moderation]':'[data-discussion]',scroll:false,replace:true}).finally(()=>{discussion.removeAttribute('aria-busy');buttons.forEach(b=>b.disabled=false);});return;}const progress=method==='POST'&&form.closest('[data-progress-view]');if(progress){progress.setAttribute('aria-busy','true');const buttons=[...progress.querySelectorAll('button')].filter(b=>!b.disabled);buttons.forEach(b=>b.disabled=true);navigate(url.href,{method,body,fragment:'[data-progress-view]',scroll:false,replace:true}).finally(()=>{progress.removeAttribute('aria-busy');buttons.forEach(b=>b.disabled=false);});}else navigate(url.href,{method,body});});
 window.addEventListener('popstate',()=>navigate(location.href,{fromHistory:true}));
})();
