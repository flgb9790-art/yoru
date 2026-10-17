import {randomUUID} from 'node:crypto';
import rateLimit from 'express-rate-limit';
import {z} from 'zod';
import {resolveKodik,validatePlayerUrl} from './kodik.js';
export function mountPlayback(app,db,resolver=resolveKodik){
 const pending=new Map();
 const lookupLimit=rateLimit({windowMs:3600000,limit:180,standardHeaders:'draft-8',legacyHeaders:false});
 app.get('/api/player/:id/status',async(req,res)=>{
  res.set('Cache-Control','no-store');
  const anime=(await db.query('SELECT blocked,block_reason FROM anime WHERE id=$1',[req.params.id])).rows[0];
  if(!anime)return res.status(404).json({error:'Аниме не найдено.'});
  if(anime.blocked)return res.status(403).json({error:'Просмотр ограничен: '+(anime.block_reason||'по решению администратора')});
  res.json({allowed:true});
 });
 app.get('/api/player/:id',lookupLimit,async(req,res)=>{
  res.set('Cache-Control','no-store');
  const anime=(await db.query('SELECT id,name,shikimori_id,blocked,block_reason FROM anime WHERE id=$1',[req.params.id])).rows[0];
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
   const resume=req.user?(await db.query('SELECT episode,season,position_seconds,translation_id FROM watch_history WHERE user_id=$1 AND anime_id=$2 AND completed=FALSE ORDER BY updated_at DESC LIMIT 1',[req.user.id,anime.id])).rows[0]:null;
   res.json({url:validatePlayerUrl(source.link),quality:source.quality,translation:source.translation,resume:resume||null});
  }catch(error){console.error(JSON.stringify({event:'kodik_lookup_error',anime_id:anime.id,message:'Public player lookup failed'}));res.status(503).json({error:'Не удалось связаться с Kodik. Попробуй открыть плеер чуть позже.'});}
 });
 const watchLimit=rateLimit({windowMs:15*60000,limit:240,standardHeaders:'draft-8',legacyHeaders:false});
 const authenticate=(req,res,next)=>req.user?next():req.is('application/json')?res.status(401).json({error:'Войди, чтобы сохранить историю.'}):res.redirect('/login');
 app.post('/watch/:id',authenticate,watchLimit,async(req,res)=>{
  const input=z.object({episode:z.coerce.number().int().min(1).max(100000),season:z.coerce.number().int().min(0).max(10000).default(1),position:z.coerce.number().int().min(0).max(86400).default(0),completed:z.enum(['true','false']).default('false'),translation:z.coerce.number().int().min(1).max(10000000).optional()}).parse(req.body);
  const anime=(await db.query('SELECT id,blocked FROM anime WHERE id=$1',[req.params.id])).rows[0];
  if(!anime||anime.blocked)return res.sendStatus(403);
  await db.query('INSERT INTO watch_history(id,user_id,anime_id,episode,position_seconds,completed,translation_id,season) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(user_id,anime_id,season,episode) DO UPDATE SET position_seconds=$5,completed=watch_history.completed OR $6,translation_id=$7,updated_at=NOW()',[randomUUID(),req.user.id,anime.id,input.episode,input.position,input.completed==='true',input.translation||null,input.season]);
  if(req.is('application/json'))return res.json({ok:true});res.redirect('/history');
 });
}
