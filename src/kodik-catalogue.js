import {validatePlayerUrl} from './kodik.js';

export function normalizeKodikTranslations(data,shikimoriId){
 const found=new Map();for(const row of Array.isArray(data?.results)?data.results:[]){
  const id=Number(row.translation?.id),name=String(row.translation?.title||'').trim();
  if(Number(row.shikimori_id)!==Number(shikimoriId)||!Number.isSafeInteger(id)||id<1||!name||!['voice','subtitles'].includes(row.translation?.type))continue;
  try{const url=validatePlayerUrl(row.link);let episodes=[];if(row.blocked_seasons!=='all'){for(const [season,details]of Object.entries(row.seasons||{}).sort(([a],[b])=>Number(a)-Number(b))){if(!/^[1-9][0-9]{0,3}$/.test(season)||row.blocked_seasons?.[season]==='all')continue;for(const [number,value]of Object.entries(details.episodes||{})){if(!/^[1-9][0-9]{0,5}$/.test(number)||row.blocked_seasons?.[season]?.includes?.(number))continue;try{validatePlayerUrl(typeof value==='string'?value:value.link);episodes.push({number:Number(number),season:Number(season)});}catch{}}if(episodes.length)break;}if(!episodes.length&&row.type==='anime')episodes=[{number:1,season:1}];}episodes.sort((a,b)=>a.number-b.number);if(!found.has(id))found.set(id,{id,name:name.slice(0,150),type:row.translation.type,url,episodes,blockedCountries:Array.isArray(row.blocked_countries)?row.blocked_countries.filter(c=>typeof c==='string'&&/^[A-Z]{2}$/.test(c)):[]});}catch{}
 }return [...found.values()].sort((a,b)=>(a.type==='subtitles')-(b.type==='subtitles')||a.name.localeCompare(b.name,'ru'));
}
export function createKodikCatalogue(fetcher=fetch){
 const cache=new Map(),pending=new Map();let activeToken;
 return async anime=>{const token=process.env.KODIK_API_TOKEN;if(!token||!anime.shikimori_id)return [];if(activeToken!==token){cache.clear();activeToken=token;}const key=String(anime.shikimori_id),old=cache.get(key);if(old&&old.until>Date.now())return old.rows;
  if(!pending.has(key))pending.set(key,(async()=>{const response=await fetcher('https://kodik-api.com/search',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token,shikimori_id:key,limit:'100',with_episodes:'true'}),redirect:'error',signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('Kodik catalogue unavailable');const data=await response.json();if(!Array.isArray(data.results)||data.error)throw Error('Invalid Kodik catalogue response');const rows=normalizeKodikTranslations(data,key);if(cache.size>=200)cache.delete(cache.keys().next().value);cache.set(key,{rows,until:Date.now()+300000});return rows;})().finally(()=>pending.delete(key)));
  return pending.get(key);
 };
}
export const kodikTranslations=createKodikCatalogue();
