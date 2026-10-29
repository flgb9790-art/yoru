import {normalizeSkipRules} from './kodik-skips.js';
import {kodikTranslations} from './kodik-catalogue.js';
import {resolveKodik,validatePlayerUrl} from './kodik.js';
import {staffOnlyGenre} from './anime-access.js';
import {sendMessage} from './social-store.js';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import rateLimit from 'express-rate-limit';
import {resolveAniLiberty,validateStream} from './aniliberty.js';
import {layout,esc,csrf} from './views.js';
import {roomView} from './watch-room-view.js';

const fail=(message,status=400)=>Object.assign(Error(message),{status});
export const roomLimit=()=>Math.max(0,Math.min(10,Number.parseInt(process.env.WATCH_ROOMS_MAX??'3',10)||0));
export async function roomAccess(db,id,userId,{member=true}={}){
 if(!roomLimit())throw fail('Совместный просмотр временно выключен.',410);
 const r=(await db.query('SELECT r.*,a.name,a.blocked FROM watch_rooms r JOIN anime a ON a.id=r.anime_id WHERE r.id=$1',[id])).rows[0];
 if(!r||r.closed_at||new Date(r.expires_at)<=new Date())throw fail('Комната закрыта или срок приглашения истёк.',410);
 if(r.blocked)throw fail('Просмотр этого аниме ограничен.',403);
 if(member){const m=(await db.query('SELECT * FROM watch_room_members WHERE room_id=$1 AND user_id=$2',[id,userId])).rows[0];if(!m?.active||m.kicked||userId!==r.owner_id&&Date.now()-Date.parse(m.last_seen)>=90000)throw fail('Сначала вступи в комнату. Доступ мог быть закрыт ведущим.',403);}
 return r;
}
export async function joinRoom(db,id,userId){
 const client=await db.connect();try{await client.query('BEGIN');await client.query('SELECT id FROM watch_rooms WHERE id=$1 FOR UPDATE',[id]);const r=await roomAccess(client,id,userId,{member:false});
 const old=(await client.query('SELECT * FROM watch_room_members WHERE room_id=$1 AND user_id=$2',[id,userId])).rows[0];if(old?.kicked)throw fail('Ведущий закрыл тебе доступ в эту комнату.',403);
 const members=(await client.query('SELECT * FROM watch_room_members WHERE room_id=$1',[id])).rows;
 const present=m=>m.user_id===r.owner_id||m.active&&Date.now()-Date.parse(m.last_seen)<90000;
 if(!old||!present(old)){if(members.filter(present).length>=8)throw fail('В комнате уже 8 участников.',409);if(!old&&members.length>=32)throw fail('Лимит приглашений этой комнаты исчерпан.',409);}
 await client.query('INSERT INTO watch_room_members(room_id,user_id) VALUES($1,$2) ON CONFLICT(room_id,user_id) DO UPDATE SET active=TRUE,last_seen=NOW()',[id,userId]);await client.query('COMMIT');
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
export async function createRoom(db,userId,animeId,episode,source,provider='aniliberty'){
 if(!['aniliberty','kodik'].includes(provider))throw fail('Неизвестный плеер.');
 if(!source.available||source.restricted||!source.release_id||!source.episodes.some(e=>e.number===episode))throw fail('Эта серия недоступна для совместного просмотра.');
 const client=await db.connect();try{await client.query('BEGIN');await client.query('SELECT id FROM watch_room_limits WHERE id=1 FOR UPDATE');
 const now=new Date(),rooms=(await client.query('SELECT * FROM watch_rooms WHERE expires_at>$1',[new Date(Date.now()-3600000)])).rows,active=rooms.filter(r=>!r.closed_at&&new Date(r.expires_at)>now);
 if(!roomLimit()||active.length>=roomLimit())throw fail('Все комнаты сейчас заняты. Попробуй позже.',409);
 if(active.some(r=>r.owner_id===userId))throw fail('У тебя уже есть активная комната. Сначала закрой её.',409);
 const recent=rooms.filter(r=>Date.parse(r.created_at)>Date.now()-3600000);if(recent.length>=12||recent.filter(r=>r.owner_id===userId).length>=3)throw fail('Лимит новых комнат на час исчерпан.',429);
 const anime=(await client.query('SELECT id,blocked FROM anime WHERE id=$1',[animeId])).rows[0];if(!anime||anime.blocked)throw fail('Аниме недоступно.',404);
 const id=randomUUID();await client.query('INSERT INTO watch_rooms(id,owner_id,anime_id,release_id,episode,expires_at,provider,season) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,userId,animeId,source.release_id,episode,new Date(Date.now()+6*3600000),provider,source.episodes.find(e=>e.number===episode)?.season||1]);await client.query('INSERT INTO watch_room_members(room_id,user_id) VALUES($1,$2)',[id,userId]);await client.query('COMMIT');return id;
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
export async function roomSnapshot(db,id,userId,after=0){
 const r=await roomAccess(db,id,userId);
 // Expired seats must rejoin under the room lock, never silently overbook.
 const self=(await db.query('SELECT last_seen FROM watch_room_members WHERE room_id=$1 AND user_id=$2',[id,userId])).rows[0];
 if(userId!==r.owner_id&&Date.now()-Date.parse(self.last_seen)>=90000)throw fail('Подключение истекло. Вступи в комнату снова.',403);
 await db.query('UPDATE watch_room_members SET last_seen=NOW() WHERE room_id=$1 AND user_id=$2 AND last_seen<$3',[id,userId,new Date(Date.now()-25000)]);
 const members=(await db.query('SELECT m.user_id,m.last_seen,u.name,u.avatar FROM watch_room_members m JOIN users u ON u.id=m.user_id WHERE m.room_id=$1 AND m.active=TRUE AND m.kicked=FALSE',[id])).rows.filter(m=>m.user_id===r.owner_id||Date.now()-Date.parse(m.last_seen)<90000);
 const messages=after?(await db.query('SELECT m.seq,m.body,m.created_at,m.user_id,u.name FROM watch_room_messages m JOIN users u ON u.id=m.user_id WHERE m.room_id=$1 AND m.seq>$2 ORDER BY m.seq LIMIT 40',[id,after])).rows:(await db.query('SELECT m.seq,m.body,m.created_at,m.user_id,u.name FROM watch_room_messages m JOIN users u ON u.id=m.user_id WHERE m.room_id=$1 ORDER BY m.seq DESC LIMIT 40',[id])).rows.reverse();
 const delta=Math.max(0,(Date.now()-Date.parse(r.updated_at))/1000),playing=r.playing&&delta<30;
 return {room:{id:r.id,animeId:r.anime_id,name:r.name,ownerId:r.owner_id,provider:r.provider,season:r.season,releaseId:r.release_id,episode:r.episode,position:Math.min(86400,r.position+(r.playing?Math.min(delta,30):0)),playing,version:r.version,expiresAt:r.expires_at,hostOnline:delta<30},members,messages,serverTime:Date.now(),pollMs:4000};
}
export async function updateRoomPlayback(db,id,userId,body,source){
 const input=z.object({episode:z.number().int().min(1).max(100000),position:z.number().min(0).max(86400),playing:z.boolean(),version:z.number().int().nonnegative()}).parse(body),r=await roomAccess(db,id,userId);
 if(r.owner_id!==userId)throw fail('Плеером управляет ведущий.',403);
 if(!source.available||source.restricted||Number(source.release_id)!==r.release_id||!source.episodes.some(e=>e.number===input.episode))throw fail('Серия больше не доступна.',409);
 const result=await db.query('UPDATE watch_rooms SET episode=$1,position=$2,playing=$3,version=version+1,updated_at=NOW() WHERE id=$4 AND owner_id=$5 AND version=$6 AND closed_at IS NULL RETURNING version',[input.episode,input.position,input.playing,id,userId,input.version]);if(!result.rowCount)throw fail('Состояние изменилось. Синхронизируемся с комнатой.',409);return result.rows[0];
}
export async function roomMessage(db,id,userId,body,requestId){
 const text=z.string().trim().min(1).max(1000).parse(body);z.string().uuid().parse(requestId);await roomAccess(db,id,userId);
 const client=await db.connect();try{await client.query('BEGIN');await client.query('SELECT id FROM watch_rooms WHERE id=$1 FOR UPDATE',[id]);await roomAccess(client,id,userId);
 const old=(await client.query('SELECT room_id,user_id,body FROM watch_room_messages WHERE request_id=$1',[requestId])).rows[0];if(old&&(old.room_id!==id||old.user_id!==userId||old.body!==text))throw fail('Повторный идентификатор сообщения.',409);
 await client.query('INSERT INTO watch_room_messages(request_id,room_id,user_id,body) VALUES($1,$2,$3,$4) ON CONFLICT(request_id) DO NOTHING',[requestId,id,userId,text]);
 const cutoff=(await client.query('SELECT seq FROM watch_room_messages WHERE room_id=$1 ORDER BY seq DESC LIMIT 1 OFFSET 99',[id])).rows[0];if(cutoff)await client.query('DELETE FROM watch_room_messages WHERE room_id=$1 AND seq<$2',[id,cutoff.seq]);await client.query('COMMIT');
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
export async function transferRoom(db,id,userId,targetId){
 const c=await db.connect();try{await c.query('BEGIN');await c.query('SELECT id FROM watch_room_limits WHERE id=1 FOR UPDATE');await c.query('SELECT id FROM watch_rooms WHERE id=$1 FOR UPDATE',[id]);const r=await roomAccess(c,id,userId);if(r.owner_id!==userId)throw fail('Только ведущий может передать управление.',403);if(targetId===userId)throw fail('Ты уже ведущий.');await roomAccess(c,id,targetId);const other=await c.query('SELECT id FROM watch_rooms WHERE owner_id=$1 AND closed_at IS NULL AND expires_at>NOW()',[targetId]);if(other.rowCount)throw fail('У участника уже есть своя комната.',409);
 const delta=Math.max(0,(Date.now()-Date.parse(r.updated_at))/1000),position=Math.min(86400,r.position+(r.playing?Math.min(delta,30):0));await c.query('UPDATE watch_rooms SET owner_id=$1,position=$2,playing=FALSE,version=version+1,updated_at=NOW() WHERE id=$3',[targetId,position,id]);await c.query('COMMIT');
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
export async function activeRooms(db){if(!roomLimit())return [];const rows=(await db.query('SELECT r.id,r.owner_id,r.episode,a.name,a.poster,u.name AS host_name FROM watch_rooms r JOIN anime a ON a.id=r.anime_id JOIN users u ON u.id=r.owner_id WHERE r.closed_at IS NULL AND r.expires_at>NOW() AND a.blocked=FALSE ORDER BY r.created_at DESC LIMIT 10')).rows;const result=[];for(const r of rows){const members=(await db.query('SELECT user_id,last_seen FROM watch_room_members WHERE room_id=$1 AND active=TRUE AND kicked=FALSE',[r.id])).rows.filter(m=>Date.now()-Date.parse(m.last_seen)<90000);if(members.some(m=>m.user_id===r.owner_id))result.push({...r,count:members.length});}return result;}
export async function inviteRoomFriend(db,id,user,friendId,requestId){const r=await roomAccess(db,id,user.id);if(!(await db.query('SELECT contact_id FROM user_contacts WHERE user_id=$1 AND contact_id=$2',[user.id,friendId])).rowCount)throw fail('Выбери пользователя из контактов.',403);const a=(await db.query('SELECT genres FROM anime WHERE id=$1',[r.anime_id])).rows[0];const friend=(await db.query('SELECT role FROM users WHERE id=$1',[friendId])).rows[0];if(!friend)throw fail('Пользователь не найден.',404);if(a?.genres?.some(staffOnlyGenre)&&!['admin','moderator'].includes(friend.role))throw fail('Это аниме недоступно другу.',403);await sendMessage(db,user,friendId,{body:'Смотрим вместе: '+r.name+'\n'+new URL('/rooms/'+id,process.env.BASE_URL||'http://localhost:3000').href,requestId});}
export async function purgeRooms(db){await db.query('DELETE FROM watch_rooms WHERE expires_at<NOW()');await db.query('DELETE FROM watch_rooms WHERE closed_at<$1',[new Date(Date.now()-3600000)]);}

export function mountWatchRooms(app,db,resolver=resolveAniLiberty,catalogueResolver=kodikTranslations,kodikResolver=resolveKodik){
 const pending=new Map(),auth=(req,res,next)=>req.user?next():res.status(401).json({error:'Для комнаты нужно войти в аккаунт.'});
 const limit=n=>rateLimit({windowMs:60000,limit:n,standardHeaders:'draft-8',legacyHeaders:false,keyGenerator:req=>req.user.id,message:{error:'Слишком часто. Подожди немного.'}}),reads=limit(35),writes=limit(45);
 const handle=fn=>async(req,res)=>{try{await fn(req,res);}catch(error){res.status(error.name==='ZodError'?400:error.status||503).json({error:error.name==='ZodError'?'Проверь введённые данные.':error.status?error.message:'Источник временно недоступен. Попробуй позже.'});}};
 const source=async(animeId,releaseId)=>{
  const a=(await db.query('SELECT * FROM anime WHERE id=$1',[animeId])).rows[0];if(!a||a.blocked||!a.shikimori_id)throw fail('Аниме недоступно.',404);
  const pageOrigin=new URL(process.env.BASE_URL||'http://localhost:3000').origin,cached=(await db.query('SELECT * FROM aniliberty_sources WHERE anime_id=$1',[animeId])).rows[0];let value=cached?.payload;
  if(!value||value.skip_version!==1||cached.page_origin!==pageOrigin||Date.now()-Date.parse(cached.checked_at)>600000||releaseId&&Number(value.release_id)!==releaseId){const key=animeId+':'+(releaseId||'default');if(!pending.has(key))pending.set(key,(async()=>{const data=await resolver(a,releaseId);if(releaseId&&Number(data.release_id)!==releaseId)throw fail('Издание недоступно.',409);data.skip_version=1;if(data.restricted){data.available=false;data.episodes=[];}for(const ep of data.episodes||[])for(const url of Object.values(ep.streams||{}))validateStream(url);await db.query('INSERT INTO aniliberty_sources(anime_id,payload,page_origin) VALUES($1,$2,$3) ON CONFLICT(anime_id) DO UPDATE SET payload=$2,page_origin=$3,checked_at=NOW()',[animeId,JSON.stringify(data),new URL(process.env.BASE_URL||'http://localhost:3000').origin]);return data;})().finally(()=>pending.delete(key)));value=await pending.get(key);}
  if(!value.available||value.restricted){if(releaseId)await db.query('UPDATE watch_rooms SET closed_at=NOW(),playing=FALSE WHERE anime_id=$1 AND release_id=$2 AND closed_at IS NULL',[animeId,releaseId]);throw fail('В AniLiberty нет доступных серий для комнаты.',value.restricted?403:404);}for(const ep of value.episodes)for(const url of Object.values(ep.streams))validateStream(url);return value;
 };
 const roomSource=async r=>{if(r.provider!=='kodik')return source(r.anime_id,r.release_id);const anime=(await db.query('SELECT * FROM anime WHERE id=$1',[r.anime_id])).rows[0];if(!anime||anime.blocked)throw fail('Аниме недоступно.',403);const allowed=await kodikResolver(anime,new URL('/anime/'+anime.id,process.env.BASE_URL||'http://localhost:3000').href);if(!allowed.available){if(r.id)await db.query('UPDATE watch_rooms SET closed_at=NOW(),playing=FALSE WHERE id=$1',[r.id]);throw fail('Kodik ограничил просмотр.',403);}const choices=await catalogueResolver(anime),choice=choices.find(c=>c.id===r.release_id),episodes=(choice?.episodes||[]).filter(e=>!r.season||e.season===r.season);if(!episodes.length){if(!choice&&r.id)return Promise.reject(fail('Озвучка недоступна для просмотра.',403));if(r.id)await db.query('UPDATE watch_rooms SET closed_at=NOW(),playing=FALSE WHERE id=$1',[r.id]);throw fail('У этой озвучки нет доступных серий.',404);}return {skipRules:normalizeSkipRules(anime.metadata?.kodik_skip_rules),provider:'kodik',available:true,release_id:choice.id,url:validatePlayerUrl(choice.url),translation:choice.name,episodes};};
 app.get('/rooms/new',async(req,res)=>{if(!req.user)return res.redirect('/login');const anime=(await db.query('SELECT id,name FROM anime WHERE id=$1 AND blocked=FALSE',[String(req.query.anime||'')])).rows[0];if(!anime)return res.status(404).send('Аниме не найдено.');const own=(await db.query('SELECT id FROM watch_rooms WHERE owner_id=$1 AND closed_at IS NULL AND expires_at>NOW()',[req.user.id])).rows[0];res.send(layout('Совместный просмотр',`<section class="panel room-create"><div class="eyebrow">Вечер вместе</div><h1>Смотреть с друзьями</h1><p>${esc(anime.name)}</p><p class="muted">До 8 участников · 6 часов · AniLiberty или Kodik. Управляет ведущий. Видео загружается напрямую у источника.</p>${own?`<a class="button secondary" href="/rooms/${own.id}">Вернуться в мою комнату →</a>`:`<form data-room-create data-anime="${anime.id}">${csrf(req)}<label>Плеер<select name="provider" aria-label="Плеер комнаты"><option value="aniliberty">AniLiberty</option><option value="kodik">Kodik</option></select></label><label data-room-create-tracks hidden>Озвучка<select name="translation" aria-label="Озвучка комнаты"></select></label><button type="submit">Создать комнату</button><p class="muted" data-room-create-status role="status"></p></form>`}<p class="muted">Одновременно на сайте доступно ${roomLimit()} комнаты. Чат хранит последние 100 сообщений и удаляется вместе с комнатой.</p><a href="/anime/${anime.id}">← К аниме</a></section>`,req));});
 app.post('/api/rooms',auth,rateLimit({windowMs:3600000,limit:4,keyGenerator:req=>req.user.id,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'Не больше 4 попыток создания комнаты в час.'}}),writes,handle(async(req,res)=>{if(!roomLimit())throw fail('Совместный просмотр временно выключен.',410);await purgeRooms(db);const input=z.object({animeId:z.string().min(1).max(100),provider:z.enum(['aniliberty','kodik']).default('aniliberty'),translation:z.number().int().positive().optional()}).parse(req.body),data=input.provider==='kodik'?await roomSource({anime_id:input.animeId,provider:'kodik',release_id:input.translation}):await source(input.animeId);const id=await createRoom(db,req.user.id,input.animeId,data.episodes[0].number,data,input.provider);res.status(201).json({url:'/rooms/'+id});}));
 app.get('/rooms/:id',async(req,res)=>{if(!req.user)return res.redirect('/login');try{const r=await roomAccess(db,req.params.id,req.user.id,{member:false}),m=(await db.query('SELECT * FROM watch_room_members WHERE room_id=$1 AND user_id=$2',[r.id,req.user.id])).rows[0];if(m?.kicked)return res.status(403).send('Доступ в комнату закрыт.');res.send(layout('Совместный просмотр',roomView(req,r,!!m?.active),req));}catch(error){res.status(error.status||503).send('Комната недоступна или уже закрыта.');}});
 app.post('/api/rooms/:id/join',auth,writes,handle(async(req,res)=>{await joinRoom(db,req.params.id,req.user.id);res.json({ok:true});}));
 app.get('/api/rooms/:id/state',auth,reads,handle(async(req,res)=>{res.json(await roomSnapshot(db,req.params.id,req.user.id,Math.max(0,Math.min(2147483647,Number(req.query.after)||0))));}));
 app.get('/api/rooms/:id/media',auth,reads,handle(async(req,res)=>{const r=await roomAccess(db,req.params.id,req.user.id),data=await roomSource(r);await roomAccess(db,r.id,req.user.id);res.json(data);}));
 app.post('/api/rooms/:id/playback',auth,writes,handle(async(req,res)=>{const r=await roomAccess(db,req.params.id,req.user.id);if(r.owner_id!==req.user.id)throw fail('Только ведущий управляет просмотром.',403);res.json(await updateRoomPlayback(db,r.id,req.user.id,req.body,await roomSource(r)));}));
 app.post('/api/rooms/:id/transfer',auth,writes,handle(async(req,res)=>{await transferRoom(db,req.params.id,req.user.id,z.string().min(1).max(100).parse(req.body.userId));res.json({ok:true});}));
 app.get('/api/rooms/:id/friends',auth,reads,handle(async(req,res)=>{await roomAccess(db,req.params.id,req.user.id);res.json({friends:(await db.query('SELECT u.id,u.name,u.avatar FROM user_contacts c JOIN users u ON u.id=c.contact_id WHERE c.user_id=$1 ORDER BY u.name LIMIT 100',[req.user.id])).rows});}));
 app.post('/api/rooms/:id/invite',auth,limit(8),writes,handle(async(req,res)=>{const input=z.object({userId:z.string().min(1).max(100),requestId:z.string().uuid()}).parse(req.body);await inviteRoomFriend(db,req.params.id,req.user,input.userId,input.requestId);res.json({ok:true});}));
 app.post('/api/rooms/:id/messages',auth,limit(12),writes,handle(async(req,res)=>{await roomMessage(db,req.params.id,req.user.id,req.body.body,req.body.requestId);res.json({ok:true});}));
 app.post('/api/rooms/:id/leave',auth,writes,handle(async(req,res)=>{const r=await roomAccess(db,req.params.id,req.user.id);if(r.owner_id===req.user.id)await db.query('UPDATE watch_rooms SET closed_at=NOW(),playing=FALSE WHERE id=$1',[r.id]);else await db.query('UPDATE watch_room_members SET active=FALSE WHERE room_id=$1 AND user_id=$2',[r.id,req.user.id]);res.json({url:'/anime/'+r.anime_id});}));
 app.post('/api/rooms/:id/kick',auth,writes,handle(async(req,res)=>{const r=await roomAccess(db,req.params.id,req.user.id);if(r.owner_id!==req.user.id)throw fail('Только ведущий может исключать участников.',403);const userId=z.string().min(1).max(100).parse(req.body.userId);if(userId===r.owner_id)throw fail('Нельзя исключить ведущего.');await db.query('UPDATE watch_room_members SET kicked=TRUE,active=FALSE WHERE room_id=$1 AND user_id=$2',[r.id,userId]);res.json({ok:true});}));
}
