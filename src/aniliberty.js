const API='https://api.anilibria.app/api/v1/';
export function validateStream(value){
 const url=new URL(value);
 if(url.protocol!=='https:'||url.username||url.password||!(url.hostname==='libria.fun'||url.hostname.endsWith('.libria.fun'))||!url.pathname.endsWith('.m3u8'))throw new Error('Unexpected AniLiberty stream address');
 // Preserve the provider's complete URL, including regional and advertising parameters.
 return url.href;
}
export function normalizeRelease(raw,shikimoriId){
 if(Number(raw.shikimori?.id)!==Number(shikimoriId))throw new Error('AniLiberty release does not match Shikimori');
 if(raw.is_blocked_by_geo!==false||raw.is_blocked_by_copyrights!==false)return {available:false,restricted:true,episodes:[]};
 const episodes=(raw.episodes||[]).flatMap(item=>{
  const number=Number(item.ordinal);if(!Number.isInteger(number)||number<1||number>100000)return [];
  const streams={};for(const quality of ['480','720','1080'])if(item['hls_'+quality])streams[quality]=validateStream(item['hls_'+quality]);
  if(!Object.keys(streams).length)return [];
  return [{number,season:1,name:String(item.name||'').slice(0,250),duration:Number(item.duration)||0,streams}];
 }).sort((a,b)=>a.number-b.number);
 return {available:episodes.length>0,restricted:false,release_id:raw.id,episodes};
}
export function createAniLibertyClient(fetcher=fetch){
 async function request(path){
  const response=await fetcher(new URL(path,API),{headers:{Accept:'application/json','User-Agent':'Yoru/0.2'},signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw new Error('AniLiberty API unavailable');return response.json();
 }
 return async function resolve(anime){
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
