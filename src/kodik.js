// Public integration contract is published in Kodik's own add-players script.
// This key belongs to that public embed method, not to the authenticated catalogue API.
export const KODIK_ORIGIN='https://kodikplayer.com';
const SCRIPT_URL='https://kodik-add.com/add-players.min.js';
const LOOKUP_URL='https://kodik-api.com/get-player';
export function validatePlayerUrl(value){
 const url=new URL(value,KODIK_ORIGIN);
 if(url.origin!==KODIK_ORIGIN||url.username||url.password||!/^\/(serial|video)\/\d+\/[a-z0-9]+\/720p\/?$/.test(url.pathname))throw new Error('Unexpected Kodik player address');
 url.search='';url.hash='';return url.href;
}
export function createKodikClient(fetcher=fetch){
 let publicKey='',keyExpires=0,keyRequest;
 async function getKey(){
  if(publicKey&&keyExpires>Date.now())return publicKey;
  if(!keyRequest)keyRequest=(async()=>{
   const response=await fetcher(SCRIPT_URL,{signal:AbortSignal.timeout(15000)});
   if(!response.ok)throw new Error('Kodik embed configuration unavailable');
   const script=await response.text(),match=script.match(/\br\.token\s*=\s*["']([a-zA-Z0-9]{20,100})["']/);
   if(!match)throw new Error('Kodik embed configuration changed');
   publicKey=match[1];keyExpires=Date.now()+6*3600000;return publicKey;
  })().finally(()=>{keyRequest=null;});
  return keyRequest;
 }
 return async function resolve(anime,pageUrl){
  const url=new URL(LOOKUP_URL);url.search=new URLSearchParams({token:await getKey(),shikimoriID:String(anime.shikimori_id),url:pageUrl,title:anime.name,hasPlayer:'false'});
  const origin=new URL(pageUrl).origin;
  const response=await fetcher(url,{headers:{Referer:pageUrl,Origin:origin,Accept:'application/json'},signal:AbortSignal.timeout(15000)});
  if(response.status===401||response.status===403){keyExpires=0;throw new Error('Kodik public embedding unavailable');}
  if(!response.ok)throw new Error('Kodik lookup unavailable');
  const data=await response.json();
  if(data.allowed!==1||!data.link)return {available:false,link:'',quality:'',translation:''};
  return {available:true,link:validatePlayerUrl(data.link),quality:String(data.quality||'').slice(0,100),translation:String(data.translation||'').slice(0,200)};
 };
}
export const resolveKodik=createKodikClient();
