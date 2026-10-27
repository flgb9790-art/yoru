import {staffOnlyGenre} from './anime-access.js';
import rateLimit from 'express-rate-limit';
export function mountOfflineTrial(app,db){
 app.get('/api/offline/anime/:id',async(req,res)=>{
  res.set('Cache-Control','no-store');if(process.env.OFFLINE_ENABLED==='false')return res.sendStatus(404);
  const a=(await db.query('SELECT id,name,poster,shikimori_id,genres,metadata,blocked FROM anime WHERE id=$1',[req.params.id])).rows[0];
  if(!a||a.blocked||!a.shikimori_id||a.metadata?.manual_staff_anime||a.genres.some(staffOnlyGenre))return res.status(404).json({error:'Тайтл недоступен для загрузки.'});
  res.json({id:a.id,title:a.name,poster:a.poster,shikimoriId:a.shikimori_id});
 });
 const limit=rateLimit({windowMs:3600000,limit:30,standardHeaders:'draft-8',legacyHeaders:false});
 app.get('/api/offline/trial',limit,async(req,res)=>{
  res.set('Cache-Control','no-store');
  if(process.env.OFFLINE_TRIAL_ENABLED==='false')return res.sendStatus(404);
  if(!['admin','moderator'].includes(req.user?.role))return res.sendStatus(403);
  const anime=(await db.query('SELECT id,name,genres,metadata FROM anime WHERE shikimori_id=$1 AND blocked=FALSE',[52991])).rows[0];
  if(!anime||anime.metadata?.manual_staff_anime)return res.status(404).json({error:'Тестовый тайтл недоступен.'});
  res.json({id:anime.id,title:anime.name,episode:1,quality:'480'});
 });
}
