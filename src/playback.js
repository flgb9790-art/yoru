import {normalizeSkipRules} from './kodik-skips.js';
import {kodikTranslations} from './kodik-catalogue.js';
import {recordAniAvailability} from './aniliberty-availability.js';
import {checkAchievements} from './achievements.js';
import {awardExperience,EPISODE_XP} from './levels.js';
import {syncLibraryProgress} from './progress.js';
import {randomUUID} from 'node:crypto';
import rateLimit from 'express-rate-limit';
import {z} from 'zod';
import {resolveKodik,validatePlayerUrl} from './kodik.js';
import {resolveAniLiberty,validateStream} from './aniliberty.js';
export function mountPlayback(app,db,resolver=resolveKodik,libertyResolver=resolveAniLiberty,catalogueResolver=kodikTranslations){
 const pending=new Map();
 const lookupLimit=rateLimit({windowMs:3600000,limit:180,standardHeaders:'draft-8',legacyHeaders:false});
 app.get('/api/player/:id/aniliberty',lookupLimit,async(req,res)=>{
  res.set('Cache-Control','no-store');
  const requestedRelease=z.coerce.number().int().positive().optional().parse(req.query.release||undefined);
  const anime=(await db.query('SELECT id,name,original_name,shikimori_id,blocked,block_reason FROM anime WHERE id=$1',[req.params.id])).rows[0];
  if(!anime)return res.status(404).json({error:'Аниме не найдено.'});
  if(anime.blocked)return res.status(403).json({error:'Просмотр ограничен: '+(anime.block_reason||'по решению администратора')});
  if(!anime.shikimori_id)return res.status(404).json({error:'Для этого аниме ещё не указан Shikimori ID.'});
  try{
   const pageOrigin=new URL(process.env.BASE_URL||'http://localhost:3000').origin;
   let cached=(await db.query('SELECT * FROM aniliberty_sources WHERE anime_id=$1',[anime.id])).rows[0],source=cached?.payload;
   const ttl=source?.available?10*60000:3*60000,key='aniliberty:'+anime.id+':'+(requestedRelease||'default');
   if(!cached||source?.skip_version!==1||(req.query.refresh==='1'&&Date.now()-new Date(cached.checked_at).valueOf()>30000)||cached.page_origin!==pageOrigin||(requestedRelease&&Number(source?.release_id)!==requestedRelease)||Date.now()-new Date(cached.checked_at).valueOf()>ttl){
    if(!pending.has(key))pending.set(key,(async()=>{
     const result=await libertyResolver(anime,requestedRelease);
     if(requestedRelease&&Number(result.release_id)!==requestedRelease)throw new Error('Release edition mismatch');
     result.skip_version=1;if(result.restricted){result.available=false;result.episodes=[];}
     for(const item of result.episodes||[])for(const value of Object.values(item.streams||{}))validateStream(value);
     await db.query('INSERT INTO aniliberty_sources(anime_id,payload,page_origin) VALUES($1,$2,$3) ON CONFLICT(anime_id) DO UPDATE SET payload=$2,page_origin=$3,checked_at=NOW()',[anime.id,JSON.stringify(result),pageOrigin]);await recordAniAvailability(db,anime.id,result).catch(()=>{});return result;
    })().finally(()=>pending.delete(key)));
    source=await pending.get(key);
   }
   const current=(await db.query('SELECT blocked FROM anime WHERE id=$1',[anime.id])).rows[0];if(!current||current.blocked)return res.status(403).json({error:'Просмотр ограничен администратором.'});
   if(source.restricted)return res.status(403).json({error:'AniLiberty ограничивает просмотр этого аниме. Можно выбрать другой доступный источник.'});
   if(!source.available)return res.status(404).json({error:'В AniLiberty пока нет доступных серий этого аниме. Попробуй Kodik.'});
   // Validate cached links too; media is fetched directly from the provider, never proxied.
   for(const item of source.episodes)for(const value of Object.values(item.streams))validateStream(value);
   const resume=req.user?(await db.query('SELECT episode,season,position_seconds,source_release_id,completed FROM watch_history WHERE user_id=$1 AND anime_id=$2 AND (position_seconds>0 OR manual_mark=FALSE) AND (source_release_id IS NULL OR source_release_id=$3) ORDER BY updated_at DESC LIMIT 1',[req.user.id,anime.id,source.release_id||null])).rows[0]:null;
   res.json({...source,resume:resume&&!resume.completed?resume:null});
  }catch(error){console.error(JSON.stringify({event:'aniliberty_lookup_error',anime_id:anime.id,message:'Release lookup failed'}));res.status(503).json({error:'AniLiberty временно недоступен. Попробуй позже или выбери Kodik.'});}
 });
 app.get('/api/player/:id/translations',lookupLimit,async(req,res)=>{res.set('Cache-Control','no-store');const anime=(await db.query('SELECT id,name,shikimori_id,blocked FROM anime WHERE id=$1',[req.params.id])).rows[0];if(!anime)return res.status(404).json({error:'Аниме не найдено.'});if(anime.blocked)return res.status(403).json({error:'Просмотр ограничен.'});try{const translations=await catalogueResolver(anime);const current=(await db.query('SELECT blocked FROM anime WHERE id=$1',[anime.id])).rows[0];if(!current||current.blocked)return res.status(403).json({error:'Просмотр ограничен.'});res.json({translations});}catch{res.status(503).json({error:'Список озвучек временно недоступен.'});}});
 app.get('/api/player/:id/status',async(req,res)=>{
  res.set('Cache-Control','no-store');
  const anime=(await db.query('SELECT blocked,block_reason FROM anime WHERE id=$1',[req.params.id])).rows[0];
  if(!anime)return res.status(404).json({error:'Аниме не найдено.'});
  if(anime.blocked)return res.status(403).json({error:'Просмотр ограничен: '+(anime.block_reason||'по решению администратора')});
  res.json({allowed:true});
 });
 app.get('/api/player/:id',lookupLimit,async(req,res)=>{
  res.set('Cache-Control','no-store');
  const anime=(await db.query('SELECT id,name,shikimori_id,metadata,blocked,block_reason FROM anime WHERE id=$1',[req.params.id])).rows[0];
  if(!anime)return res.status(404).json({error:'Аниме не найдено.'});
  if(anime.blocked)return res.status(403).json({error:'Просмотр ограничен: '+(anime.block_reason||'по решению администратора')});
  if(!anime.shikimori_id)return res.status(404).json({error:'Для этого аниме ещё не указан Shikimori ID.'});
  try{
   const base=process.env.BASE_URL||'http://localhost:3000',pageUrl=new URL('/anime/'+anime.id,base),pageOrigin=pageUrl.origin;
   let source=(await db.query('SELECT * FROM player_sources WHERE anime_id=$1',[anime.id])).rows[0];
   const ttl=source?.available?30*60000:5*60000;
   if(!source||source.page_origin!==pageOrigin||Date.now()-new Date(source.checked_at).valueOf()>ttl){
    if(!pending.has(anime.id))pending.set(anime.id,(async()=>{
     const result=await resolver(anime,pageUrl.href);
     if(result.available)result.link=validatePlayerUrl(result.link);
     await db.query('INSERT INTO player_sources(anime_id,available,link,quality,translation,page_origin) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(anime_id) DO UPDATE SET available=$2,link=$3,quality=$4,translation=$5,page_origin=$6,checked_at=NOW()',[anime.id,result.available,result.link||'',result.quality||'',result.translation||'',pageOrigin]);return result;
    })().finally(()=>pending.delete(anime.id)));
    source=await pending.get(anime.id);
   }
   // A title can be blocked while the remote request is in flight.
   const current=(await db.query('SELECT blocked FROM anime WHERE id=$1',[anime.id])).rows[0];if(!current||current.blocked)return res.status(403).json({error:'Просмотр ограничен администратором.'});
   if(!source.available)return res.status(404).json({error:'Kodik пока не предоставил плеер для этого аниме.'});
   if(req.viewerCountry&&!['admin','moderator'].includes(req.user?.role)&&process.env.KODIK_API_TOKEN){const tracks=await catalogueResolver(anime);if(!tracks.length)return res.status(403).json({error:'Kodik недоступен в твоей стране.'});const selected=tracks.find(t=>new URL(t.url).pathname===new URL(source.link).pathname)||tracks[0];source={...source,link:selected.url,translation:selected.name};}
   const resume=req.user?(await db.query('SELECT episode,season,position_seconds,translation_id,completed FROM watch_history WHERE user_id=$1 AND anime_id=$2 AND (position_seconds>0 OR manual_mark=FALSE) ORDER BY updated_at DESC LIMIT 1',[req.user.id,anime.id])).rows[0]:null;
   res.json({skipRules:normalizeSkipRules(anime.metadata?.kodik_skip_rules),url:validatePlayerUrl(source.link),quality:source.quality,translation:source.translation,resume:resume&&!resume.completed?resume:null});
  }catch(error){console.error(JSON.stringify({event:'kodik_lookup_error',anime_id:anime.id,message:'Public player lookup failed'}));res.status(503).json({error:'Не удалось связаться с Kodik. Попробуй открыть плеер чуть позже.'});}
 });
 const watchLimit=rateLimit({windowMs:15*60000,limit:240,standardHeaders:'draft-8',legacyHeaders:false});
 const authenticate=(req,res,next)=>req.user?next():req.is('application/json')?res.status(401).json({error:'Войди, чтобы сохранить историю.'}):res.redirect('/login');
 app.post('/watch/:id',authenticate,watchLimit,async(req,res)=>{
  const input=z.object({episode:z.coerce.number().int().min(1).max(100000),season:z.coerce.number().int().min(0).max(10000).default(1),position:z.coerce.number().int().min(0).max(86400).default(0),completed:z.enum(['true','false']).default('false'),translation:z.coerce.number().int().min(1).max(10000000).optional(),provider:z.enum(['kodik','aniliberty']).default('kodik'),release:z.coerce.number().int().positive().optional()}).parse(req.body);
  let xpGained=0;const client=await db.connect();try{await client.query('BEGIN');
   await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[req.user.id]);
   const anime=(await client.query('SELECT * FROM anime WHERE id=$1',[req.params.id])).rows[0];
   if(!anime||anime.blocked){await client.query('ROLLBACK');return res.sendStatus(403);}
  const prior=(await client.query('SELECT completed FROM watch_history WHERE user_id=$1 AND anime_id=$2 AND season=$3 AND episode=$4',[req.user.id,anime.id,input.season,input.episode])).rows[0];
  await client.query('INSERT INTO watch_history(id,user_id,anime_id,episode,position_seconds,completed,translation_id,season,provider,source_release_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(user_id,anime_id,season,episode) DO UPDATE SET position_seconds=$5,completed=watch_history.completed OR $6,translation_id=$7,provider=$9,source_release_id=$10,manual_mark=CASE WHEN $6 THEN FALSE ELSE watch_history.manual_mark END,updated_at=NOW()',[randomUUID(),req.user.id,anime.id,input.episode,input.position,input.completed==='true',input.translation||null,input.season,input.provider,input.provider==='aniliberty'?(input.release||null):null]);
   if(input.completed==='true'){await syncLibraryProgress(client,req.user.id,anime);if(!prior?.completed){xpGained=await awardExperience(client,req.user.id,'episode:'+anime.id+':'+input.season+':'+input.episode,EPISODE_XP);await checkAchievements(client,req.user.id);}}
   await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  if(req.is('application/json'))return res.json({ok:true,xpGained});res.redirect('/history');
 });
}
