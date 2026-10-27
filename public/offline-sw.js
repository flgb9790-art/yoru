import {SHELL_CACHE,VIDEO_PREFIX,rangedResponse} from './offline/core.js';
const SHELL=['/offline/','/offline/offline.css','/offline/offline.js','/offline/core.js','/offline/hls.min.js'];
self.addEventListener('install',event=>event.waitUntil((async()=>{const cache=await caches.open(SHELL_CACHE);for(const path of SHELL){const response=await fetch(path,{cache:'reload'});if(!response.ok)throw Error('Offline shell unavailable');await cache.put(path,response);}await self.skipWaiting();})()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);if(url.origin!==self.location.origin||!['GET','HEAD'].includes(event.request.method))return;
 if(url.pathname.startsWith('/offline/media/')){event.respondWith((async()=>{
  const match=/^\/offline\/media\/([a-f0-9-]{36})\/(?:playlist\.m3u8|\d+)$/.exec(url.pathname);if(!match)return new Response('Not found',{status:404});
  const name=VIDEO_PREFIX+match[1];if(!(await caches.keys()).includes(name))return new Response('Download missing',{status:404});
  const cache=await caches.open(name);if(!await cache.match('/offline/media/'+match[1]+'/ready.json'))return new Response('Download incomplete',{status:404});
  const response=await cache.match(url.pathname);return response?rangedResponse(response,event.request.headers.get('range'),event.request.method):new Response('Download missing',{status:404});
 })());return;}
 if(SHELL.includes(url.pathname)){event.respondWith((async()=>{const cached=await (await caches.open(SHELL_CACHE)).match(url.pathname);return cached||fetch(event.request);})());return;}
 if(event.request.mode==='navigate'&&url.pathname==='/')event.respondWith(fetch(event.request).catch(()=>Response.redirect(new URL('/offline/',self.location.origin).href,302)));
});
