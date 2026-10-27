import {VIDEO_PREFIX} from './library-core.js';
export const groupKey=r=>String(r.shikimoriId||r.animeId||'legacy');
export const episodeKey=r=>[groupKey(r),r.release||0,r.season||1,r.episode||1,r.quality||'480'].join(':');
export function normalizeRecord(data,id){
 if(data.id!==id||!Array.isArray(data.paths)||data.paths.length>3000||!data.paths.length)return null;
 const root='/offline/media/'+id+'/';if(!data.paths.every(path=>typeof path==='string'&&path.startsWith(root)))return null;
 return {...data,shikimoriId:data.shikimoriId||(!data.animeId?52991:null),release:data.release||(!data.animeId?9542:0),episode:data.episode||1,season:data.season||1,quality:String(data.quality||'480')};
}
export async function readRecords(){
 const result=[];for(const name of (await caches.keys()).filter(n=>n.startsWith(VIDEO_PREFIX))){const id=name.slice(VIDEO_PREFIX.length);if(!/^[a-f0-9-]{36}$/.test(id))continue;
  try{const cache=await caches.open(name),response=await cache.match('/offline/media/'+id+'/ready.json');if(!response)continue;const record=normalizeRecord(await response.json(),id);if(record&&await cache.match('/offline/media/'+id+'/playlist.m3u8'))result.push(record);}catch{}
 }return result.sort((a,b)=>b.savedAt-a.savedAt);
}
export async function titleInfo(id,signal){const response=await fetch('/api/offline/anime/'+encodeURIComponent(id),{cache:'no-store',signal});if(!response.ok)throw Error('Этот тайтл сейчас недоступен для загрузки.');return response.json();}
export async function sourceInfo(id,release,signal){const response=await fetch('/api/player/'+encodeURIComponent(id)+'/aniliberty'+(release?'?release='+encodeURIComponent(release):''),{cache:'no-store',signal});if(!response.ok)throw Error('Не удалось получить серии AniLiberty. Попробуй позже.');const source=await response.json();if(!source.available||source.restricted||!source.episodes?.length)throw Error('У AniLiberty пока нет доступных серий.');return source;}
export const icon=name=>'<svg width="18" height="18" aria-hidden="true"><use href="/offline/icons.svg#'+name+'"></use></svg>';
export const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
