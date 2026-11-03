import {posix} from 'node:path';
import {privateSite} from './site-mode.js';
import {privateDocument} from './private-entry.js';
const entryPaths=new Set(['/login','/logout','/auth/telegram','/auth/telegram/callback','/forgot','/reset','/verify','/verify/resend','/terms','/privacy','/copyright','/contact']);
export function privateAsset(req){let path;try{path=posix.normalize(decodeURIComponent(req.path));}catch{return false;}return path==='/kodik.txt'||/^\/(?:[^/]+\.(?:css|js|ico|png|svg|webmanifest)|assets\/|vendor\/|\.well-known\/|offline\/(?:[^/]+\.(?:js|css|svg)))/i.test(path);}
export function privateGate(req,res,next){
 if(!privateSite())return next();
 res.set({'X-Robots-Tag':'noindex, nofollow, noarchive','Cache-Control':'private, no-store'});
 const path=req.path.toLowerCase().replace(/\/+$/,'')||'/';
 if(path==='/register')return res.status(403).send(privateDocument(req,{title:'Регистрация закрыта',body:'<section class="panel auth"><h1>Регистрация закрыта</h1><p>Вход доступен только существующим участникам.</p><a href="/">Вернуться ко входу</a></section>'}));
 if(req.user||entryPaths.has(path)||/^\/invite\/[a-f0-9]{64}(?:\/email)?$/.test(path))return next();
 if(path.startsWith('/api/')||path.startsWith('/media/')||path.startsWith('/downloads/')||!['GET','HEAD'].includes(req.method))return res.status(401).json({error:'Войди в существующий аккаунт. Доступ к библиотеке закрыт.'});
 return res.status(path==='/'?200:401).send(privateDocument(req,{entry:true}));
}
