import {anilibertyRequest,normalizeRelease,validateStream} from './aniliberty.js';
import {staffOnlyGenre} from './anime-access.js';
export function hasDownloadableEpisodes(source){return source?.available===true&&source.restricted!==true&&Array.isArray(source.episodes)&&source.episodes.some(ep=>Number.isInteger(ep.number)&&ep.number>0&&['480','720','1080'].some(q=>{try{return !!ep.streams?.[q]&&!!validateStream(ep.streams[q]);}catch{return false;}}));}
export async function recordAniAvailability(db,animeId,source,{checkedAt=new Date()}={}){if(!Number.isSafeInteger(source?.release_id)||source.release_id<1)return;await db.query('INSERT INTO aniliberty_availability(anime_id,release_id,available,checked_at) VALUES($1,$2,$3,$4) ON CONFLICT(anime_id,release_id) DO UPDATE SET available=$3,checked_at=$4',[animeId,source.release_id,hasDownloadableEpisodes(source),checkedAt]);}
export async function downloadableAniTitles(db,{now=new Date()}={}){
 const since=new Date(now.valueOf()-36*3600000),[indexed,cached,episodes]=await Promise.all([
  db.query('SELECT anime_id,release_id,available,checked_at FROM aniliberty_availability WHERE checked_at>$1',[since]),
  db.query('SELECT anime_id,payload,checked_at FROM aniliberty_sources WHERE checked_at>$1',[since]),
  db.query("SELECT anime_id,release_id,available,last_seen_at FROM episode_releases WHERE provider='aniliberty' AND last_seen_at>$1",[since])]);
 const state=new Map(),denied=new Map(),update=(id,release,available,time)=>{if(!Number.isSafeInteger(Number(release))||Number(release)<1)return;const key=id+':'+release,prior=state.get(key),stamp=Date.parse(time);if(!prior||stamp>=prior.time)state.set(key,{id,release:Number(release),available,time:stamp});};
 for(const row of episodes.rows)update(row.anime_id,row.release_id,row.available,row.last_seen_at);
 for(const row of indexed.rows)update(row.anime_id,row.release_id,row.available,row.checked_at);
 for(const row of cached.rows){const source=row.payload||{};if(Number.isSafeInteger(source.release_id)&&source.release_id>0)update(row.anime_id,source.release_id,hasDownloadableEpisodes(source),row.checked_at);else if(!hasDownloadableEpisodes(source))denied.set(row.anime_id,Date.parse(row.checked_at));}
 const chosen=new Map();for(const row of [...state.values()].sort((a,b)=>b.time-a.time||b.release-a.release))if(row.available&&row.time>=(denied.get(row.id)||0)&&!chosen.has(row.id))chosen.set(row.id,row.release);
 if(!chosen.size)return chosen;
 const ids=[...chosen.keys()],rows=(await db.query('SELECT id,genres,metadata FROM anime WHERE blocked=FALSE AND status<>\'anons\' AND id IN ('+ids.map((_,i)=>'$'+(i+1)).join(',')+')',ids)).rows,allowed=new Set(rows.filter(a=>!a.metadata?.manual_staff_anime&&!(a.genres||[]).some(staffOnlyGenre)).map(a=>a.id));
 return new Map([...chosen].filter(([id])=>allowed.has(id)));
}
export async function syncAniCatalogPage(db,{request=anilibertyRequest,now=new Date()}={}){
 const claim=(await db.query('UPDATE aniliberty_catalog_state SET lease_until=$1 WHERE id=1 AND lease_until<=$2 AND next_run<=$2 RETURNING page,cycle_started_at',[new Date(now.valueOf()+180000),now])).rows[0];if(!claim)return {skipped:true};
 try{
  const page=claim.page,list=await request('anime/catalog/releases?'+new URLSearchParams({limit:'50',page:String(page)}));if(!Array.isArray(list.data))throw Error('Unexpected AniLiberty catalogue');
  const ids=[...new Set(list.data.map(r=>Number(r.id)))];if(ids.some(id=>!Number.isSafeInteger(id)||id<1))throw Error('Invalid release mapping');
  let releases=[];if(ids.length){const bulk=await request('anime/releases/list?'+new URLSearchParams({ids:ids.join(','),limit:'50'}));if(!Array.isArray(bulk.data))throw Error('Unexpected AniLiberty details');releases=bulk.data;const expected=new Map(list.data.map(r=>[Number(r.id),Number(r.shikimori?.id)]));if(releases.some(r=>!ids.includes(r.id)||(Number.isSafeInteger(expected.get(r.id))&&expected.get(r.id)>0&&expected.get(r.id)!==Number(r.shikimori?.id))))throw Error('AniLiberty mapping mismatch');const received=new Set(releases.map(r=>r.id));if(ids.some(id=>!received.has(id)))throw Error('Incomplete AniLiberty details');}
  const shikis=[...new Set(releases.map(r=>Number(r.shikimori?.id)).filter(n=>Number.isSafeInteger(n)&&n>0))],local=shikis.length?(await db.query('SELECT id,shikimori_id FROM anime WHERE shikimori_id IN ('+shikis.map((_,i)=>'$'+(i+1)).join(',')+')',shikis)).rows:[],mapping=new Map(local.map(a=>[a.shikimori_id,a.id]));
  let updated=0;for(const raw of releases){const animeId=mapping.get(Number(raw.shikimori?.id));if(!animeId)continue;await recordAniAvailability(db,animeId,{...normalizeRelease(raw,Number(raw.shikimori.id)),release_id:Number(raw.id)},{checkedAt:now});updated++;}
  const total=Number(list.meta?.pagination?.total_pages);if(!Number.isSafeInteger(total)||total<1||page>total)throw Error('Invalid catalogue pagination');const finished=page>=total;
  if(finished)await db.query('UPDATE aniliberty_availability SET available=FALSE,checked_at=$2 WHERE checked_at<$1',[claim.cycle_started_at,now]);
  await db.query('UPDATE aniliberty_catalog_state SET page=$1,cycle_started_at=$2,next_run=$3,lease_until=$4,last_error=\'\' WHERE id=1',[finished?1:page+1,finished?new Date(now.valueOf()+24*3600000):claim.cycle_started_at,new Date(now.valueOf()+(finished?24*3600000:3000)),new Date(0)]);
  return {page,updated,finished};
 }catch(error){await db.query('UPDATE aniliberty_catalog_state SET next_run=$1,lease_until=$2,last_error=$3 WHERE id=1',[new Date(now.valueOf()+300000),new Date(0),'AniLiberty catalogue unavailable']);throw error;}
}
export function startAniCatalogIndex(db){let stopped=false,busy=false;const tick=async()=>{if(stopped||busy)return;busy=true;try{await syncAniCatalogPage(db);}catch{console.error(JSON.stringify({event:'aniliberty_catalog_index_error'}));}finally{busy=false;}};const timer=setInterval(tick,5000);timer.unref();tick();return ()=>{stopped=true;clearInterval(timer);};}
