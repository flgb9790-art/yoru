import {matchedCountry} from './countries.js';
import {shikiRequest} from './shikimori.js';
import {airingDate} from './airing-time.js';
// Dated exception verified against the broadcaster; expires after this broadcast.
const official={60636:{date:'2026-10-26T15:00:00.000Z',until:'2026-10-27T00:00:00Z',url:'https://bleach-anime.com/onair/'}};
export async function lookupAiringSchedules(rows,{fetcher=fetch}={}){const found=new Map();for(let offset=0;offset<rows.length;offset+=50){if(offset)await new Promise(r=>setTimeout(r,1200));const batch=rows.slice(offset,offset+50),ids=batch.map(a=>a.shikimori_id);const response=await fetcher('https://graphql.anilist.co',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({query:'query($ids:[Int]){Page(perPage:50){media(idMal_in:$ids,type:ANIME){idMal countryOfOrigin title{romaji english native} synonyms startDate{year} nextAiringEpisode{airingAt episode}}}}',variables:{ids}}),signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error('AniList calendar unavailable');const data=await response.json();if(data.errors?.length||!Array.isArray(data.data?.Page?.media))throw Error('Invalid AniList calendar');for(const media of data.data.Page.media){const row=batch.find(a=>a.shikimori_id===media.idMal);if(!row||!matchedCountry(row,media))continue;const next=media.nextAiringEpisode;found.set(row.shikimori_id,next&&Number.isSafeInteger(next.airingAt)?{date:new Date(next.airingAt*1000).toISOString(),episode:next.episode}:null);}}return found;}
export async function syncAiringCalendar(db,{request=shikiRequest,verify=lookupAiringSchedules,now=new Date(),dryRun=false,protectUntilRefresh=false}={}){
 const entries=await request('/api/calendar');if(!Array.isArray(entries)||!entries.length)throw Error('Некорректный календарь эфиров');
 const byId=new Map();for(const entry of entries){const id=Number(entry.anime?.id),date=airingDate(entry.next_episode_at);if(Number.isSafeInteger(id)&&date&&date>now)byId.set(id,{date:date.toISOString(),episode:Number(entry.next_episode)||null});}
 const rows=(await db.query("SELECT * FROM anime WHERE status='ongoing' AND shikimori_id IS NOT NULL")).rows;let verified=new Map(),verificationUnavailable=false;try{verified=await verify(rows);}catch{verificationUnavailable=true;}
 let changed=0,checked=0,conflicts=0;
 for(const a of rows){const previous=a.metadata||{},protectedFields=Array.isArray(a.protected_fields)?a.protected_fields:[];if(protectedFields.some(k=>k==='metadata'||k==='metadata.nextEpisode'&&!previous.airingTemporaryProtection))continue;const shiki=byId.get(a.shikimori_id),other=verified.get(a.shikimori_id),override=official[a.shikimori_id];let item=shiki,source='shikimori-calendar',conflict=null;
 if(override&&now<new Date(override.until)){item={date:override.date,episode:null};source=override.url;}
 else if(shiki&&verified.has(a.shikimori_id)&&(!other||Math.abs(Date.parse(shiki.date)-Date.parse(other.date))>600000||shiki.episode&&other.episode&&shiki.episode!==other.episode)){item=null;conflict={shikimori:shiki,anilist:other||null};source='conflict';conflicts++;}
 else if(other&&Date.parse(other.date)>now){item=other;source=shiki?'shikimori+anilist':'anilist';}
 else if(verificationUnavailable&&previous.airingConflict){item=null;conflict=previous.airingConflict;source='conflict';}
 if(!item&&!conflict)continue;
 const next=item?.date||null;if(+airingDate(previous.nextEpisode)!==+airingDate(next))changed++;
 const metadata={...previous,nextEpisode:next,nextEpisodeNumber:item?.episode||null,airingSource:source,airingConflict:conflict,airingCheckedAt:now.toISOString(),airingVerificationUnavailable:verificationUnavailable,airingTemporaryProtection:protectUntilRefresh};
 const protection=protectedFields.filter(k=>k!=='metadata.nextEpisode');if(protectUntilRefresh)protection.push('metadata.nextEpisode');
 if(dryRun){checked++;continue;}const updated=await db.query('UPDATE anime SET metadata=$1,protected_fields=$4 WHERE id=$2 AND metadata=$3 RETURNING id',[JSON.stringify(metadata),a.id,JSON.stringify(previous),protection]);checked+=updated.rowCount;
 }
 return {checked,changed,conflicts};
}
export function startAiringSync(db){let busy=false,stopped=false;const tick=async()=>{if(busy||stopped)return;busy=true;try{await syncAiringCalendar(db);}catch{console.error(JSON.stringify({event:'airing_calendar_retry'}));}finally{busy=false;}};const timer=setInterval(tick,3600000);timer.unref();tick();return()=>{stopped=true;clearInterval(timer);};}
