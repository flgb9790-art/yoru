const API='https://api.anilibria.app/api/v1/';
let nextRequest=0,queue=Promise.resolve();
export function anilibertyRequest(path,fetcher=fetch){
 const run=async()=>{
  if(fetcher===fetch){const delay=Math.max(0,nextRequest-Date.now());if(delay)await new Promise(r=>setTimeout(r,delay));nextRequest=Date.now()+650;}
  const response=await fetcher(new URL(path,API),{headers:{Accept:'application/json','User-Agent':'Yoru/0.3'},signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error('AniLiberty API unavailable');return response.json();
 };
 const result=queue.then(run);queue=result.catch(()=>{});return result;
}
export function validateStream(value){
 const url=new URL(value);
 if(url.protocol!=='https:'||url.username||url.password||!(url.hostname==='libria.fun'||url.hostname.endsWith('.libria.fun'))||!url.pathname.endsWith('.m3u8'))throw new Error('Unexpected AniLiberty stream address');
 // Preserve the provider's complete URL, including regional and advertising parameters.
 return url.href;
}
export function normalizeSkip(value,duration){
 if(!value||typeof value.start!=='number'||typeof value.stop!=='number'||!Number.isFinite(value.start)||!Number.isFinite(value.stop))return null;
 const start=value.start<0?duration+value.start:value.start,end=value.stop<0?duration+value.stop:value.stop;
 if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||end>86400||(duration>0&&end>duration)||((value.start<0||value.stop<0)&&!(duration>0)))return null;
 return {start,end};
}
export function normalizeRelease(raw,shikimoriId){
 if(Number(raw.shikimori?.id)!==Number(shikimoriId))throw new Error('AniLiberty release does not match Shikimori');
 if(raw.is_blocked_by_geo!==false||raw.is_blocked_by_copyrights!==false)return {available:false,restricted:true,episodes:[]};
 const episodes=(raw.episodes||[]).flatMap(item=>{
  const number=Number(item.ordinal);if(!Number.isInteger(number)||number<1||number>100000)return [];
  const streams={};for(const quality of ['480','720','1080'])if(item['hls_'+quality])streams[quality]=validateStream(item['hls_'+quality]);
  if(!Object.keys(streams).length)return [];
  return [{number,season:1,name:String(item.name||'').slice(0,250),duration:Number(item.duration)||0,streams,skips:{opening:normalizeSkip(item.opening,Number(item.duration)||0),ending:normalizeSkip(item.ending,Number(item.duration)||0)}}];
 }).sort((a,b)=>a.number-b.number);
 return {skip_version:1,available:episodes.length>0,restricted:false,release_id:raw.id,episodes};
}
export function createAniLibertyClient(fetcher=fetch){
 const request=path=>anilibertyRequest(path,fetcher);
 return async function resolve(anime,releaseId){
  if(releaseId){if(!Number.isSafeInteger(+releaseId)||+releaseId<1)throw new Error('Invalid release ID');const raw=await request('anime/releases/'+Number(releaseId));if(Number(raw.id)!==Number(releaseId))throw new Error('Release edition mismatch');return normalizeRelease(raw,anime.shikimori_id);}
  for(const query of [...new Set([anime.original_name,anime.name].filter(Boolean))]){
   const params=new URLSearchParams({'f[search]':query.slice(0,200),limit:'30'});
   const response=await request('anime/catalog/releases?'+params),items=Array.isArray(response)?response:response.data;
   if(!Array.isArray(items))throw new Error('AniLiberty catalogue format changed');
   const found=items.find(item=>Number(item.shikimori?.id)===Number(anime.shikimori_id));
   if(found)return normalizeRelease(await request('anime/releases/'+Number(found.id)),anime.shikimori_id);
  }
  return {available:false,restricted:false,episodes:[]};
 };
}
export const resolveAniLiberty=createAniLibertyClient();
