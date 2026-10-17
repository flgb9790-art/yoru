import {notifyEpisodes} from './follows.js';
import {randomUUID} from 'node:crypto';
import {anilibertyRequest,normalizeRelease} from './aniliberty.js';
import {fetchAnime,saveImported} from './shikimori.js';
function sourceDate(value,now){const date=new Date(value);return value&&Number.isFinite(date.valueOf())&&date.valueOf()<=now.valueOf()+300000?date:null;}
export async function saveEpisodeRelease(db,anime,raw,{now=new Date()}={}){
 const normalized=normalizeRelease(raw,anime.shikimori_id),releaseId=Number(raw.id);
 if(!Number.isSafeInteger(releaseId)||releaseId<1)throw new Error('Invalid source release ID');
 const fresh=sourceDate(raw.fresh_at,now),rawEpisodes=new Map((raw.episodes||[]).map(e=>[Number(e.ordinal),e]));
 const items=normalized.episodes.flatMap(e=>{
  const original=rawEpisodes.get(e.number);if(!/^[a-zA-Z0-9-]{10,100}$/.test(String(original?.id||'')))return [];
  const date=sourceDate(original.updated_at,now);
  return [{...e,sourceId:String(original.id),sourceDate:date,listed:date||now,dateKind:date?'source_update':'first_seen'}];
 });
 const client=await db.connect();
 try{
  await client.query('BEGIN');
  const lockedAnime=(await client.query('SELECT id,blocked,status FROM anime WHERE id=$1 FOR UPDATE',[anime.id])).rows[0];
  const existing=(await client.query('SELECT episode FROM episode_releases WHERE anime_id=$1 AND release_id=$2',[anime.id,releaseId])).rows,seen=new Set(existing.map(e=>e.episode));
  await client.query("UPDATE episode_releases SET available=FALSE WHERE anime_id=$1 AND provider='aniliberty' AND release_id=$2",[anime.id,releaseId]);
  for(let offset=0;offset<items.length;offset+=100){
   const values=[],tuples=items.slice(offset,offset+100).map(e=>{
    const fields=[randomUUID(),anime.id,'aniliberty',releaseId,e.sourceId,1,e.number,e.name,e.sourceDate,e.listed,e.dateKind,true];
    return '('+fields.map(value=>{values.push(value);return '$'+values.length;}).join(',')+')';
   });
   await client.query(`INSERT INTO episode_releases(id,anime_id,provider,release_id,source_episode_id,season,episode,name,source_updated_at,listed_at,date_kind,available) VALUES ${tuples.join(',')} ON CONFLICT(anime_id,provider,release_id,season,episode) DO UPDATE SET source_episode_id=EXCLUDED.source_episode_id,name=EXCLUDED.name,source_updated_at=EXCLUDED.source_updated_at,available=TRUE,last_seen_at=NOW()`,values);
  }
  const prior=(await client.query('SELECT * FROM episode_feed_titles WHERE anime_id=$1',[anime.id])).rows[0];
  const oldDate=prior?.source_fresh_at?new Date(prior.source_fresh_at).valueOf():0,newDate=fresh?.valueOf()||0;
  if(!prior||newDate>oldDate||(newDate===oldDate&&releaseId>=prior.release_id))await client.query('INSERT INTO episode_feed_titles(anime_id,release_id,source_fresh_at) VALUES($1,$2,$3) ON CONFLICT(anime_id) DO UPDATE SET release_id=$2,source_fresh_at=$3,checked_at=NOW()',[anime.id,releaseId,fresh]);
  // A feed link must not open a stale playlist without the newly discovered episode.
  await client.query('DELETE FROM aniliberty_sources WHERE anime_id=$1',[anime.id]);
  await notifyEpisodes(client,{...anime,blocked:lockedAnime.blocked,status:lockedAnime.status},releaseId,items,{newEdition:!prior||prior.release_id!==releaseId});
  await client.query('COMMIT');
  return {inserted:items.filter(e=>!seen.has(e.number)).length,episodes:items.length,restricted:normalized.restricted};
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
export async function syncEpisodeFeed(db,{limit=40,request=anilibertyRequest,importer=fetchAnime,onProgress=()=>{}}={}){
 const listed=await request('anime/releases/latest?limit='+Math.max(1,Math.min(100,limit)));
 if(!Array.isArray(listed))throw new Error('AniLiberty latest format changed');
 const result={releases:0,inserted:0,imported:0,restricted:0,skipped:0,errors:[]},seen=new Set();let consecutiveErrors=0;
 for(const entry of listed){
  const shiki=Number(entry.shikimori?.id),releaseId=Number(entry.id);
  if(!Number.isSafeInteger(shiki)||shiki<1||!Number.isSafeInteger(releaseId)||releaseId<1||seen.has(shiki)){result.skipped++;continue;}
  seen.add(shiki);
  try{
   const raw=await request('anime/releases/'+releaseId);
   if(Number(raw.shikimori?.id)!==shiki||Number(raw.id)!==releaseId)throw new Error('Source mapping mismatch');
   let anime=(await db.query('SELECT * FROM anime WHERE shikimori_id=$1',[shiki])).rows[0];
   if(!anime){
    if(raw.is_blocked_by_geo!==false||raw.is_blocked_by_copyrights!==false){result.restricted++;continue;}
    const imported=await importer(shiki);if(Number(imported.shikimori_id)!==shiki)throw new Error('Imported mapping mismatch');
    const id=await saveImported(db,imported);anime=(await db.query('SELECT * FROM anime WHERE id=$1',[id])).rows[0];result.imported++;
   }
   const saved=await saveEpisodeRelease(db,anime,raw);result.releases++;result.inserted+=saved.inserted;if(saved.restricted)result.restricted++;
   onProgress({...result});
   consecutiveErrors=0;
  }catch(error){result.errors.push({release:releaseId,message:'Не удалось обновить релиз'});if(++consecutiveErrors>=3)break;}
 }
 return result;
}
const relation=` FROM anime a JOIN episode_feed_titles f ON f.anime_id=a.id JOIN (SELECT anime_id,release_id,MAX(episode) AS last_episode FROM episode_releases WHERE provider='aniliberty' AND available=TRUE AND season=1 GROUP BY anime_id,release_id) latest ON latest.anime_id=a.id AND latest.release_id=f.release_id JOIN episode_releases e ON e.anime_id=a.id AND e.release_id=f.release_id AND e.episode=latest.last_episode AND e.season=1 AND e.provider='aniliberty' WHERE a.blocked=FALSE AND e.available=TRUE`;
export async function episodeFeed(db,size=20,offset=0){
 const total=+(await db.query('SELECT COUNT(*) AS count'+relation)).rows[0].count;
 const rows=(await db.query('SELECT a.*,e.episode AS release_episode,e.release_id AS source_release_id,e.provider AS release_provider,e.listed_at AS release_date,e.date_kind AS release_date_kind,e.name AS episode_name'+relation+' ORDER BY e.listed_at DESC,a.id LIMIT $1 OFFSET $2',[size,offset])).rows;
 return {rows,total};
}
export async function enqueueEpisodeSync(db,{force=false}={}){
 const active=await db.query("SELECT id FROM jobs WHERE kind='episodes' AND status IN ('pending','running') LIMIT 1");if(active.rowCount)return active.rows[0].id;
 if(!force&&(await db.query("SELECT id FROM jobs WHERE kind='episodes' AND created_at>NOW()-INTERVAL '15 minutes' LIMIT 1")).rowCount)return null;
 const id=randomUUID();await db.query('INSERT INTO jobs(id,kind,payload) VALUES($1,$2,$3)',[id,'episodes',JSON.stringify({limit:40})]);return id;
}
