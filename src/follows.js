import {randomUUID} from 'node:crypto';
import {requireUser} from './security.js';
import {layout,esc,csrf,card,pagination} from './views.js';
export async function notifyEpisodes(client,anime,releaseId,items,{newEdition=false}={}){
 if(anime.blocked||!items.length)return;
 const current=(await client.query('SELECT release_id FROM episode_feed_titles WHERE anime_id=$1',[anime.id])).rows[0];
 if(current?.release_id!==releaseId)return;
 const maximum=Math.max(...items.map(e=>e.number));
 const follows=(await client.query('SELECT * FROM anime_follows WHERE anime_id=$1',[anime.id])).rows;
 for(const follow of follows){
  if(follow.last_episode!==null&&!newEdition){for(const episode of items.filter(e=>e.number>follow.last_episode)){
   await client.query('INSERT INTO notifications(id,user_id,anime_id,episode,release_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id,anime_id,season,episode) DO NOTHING',[randomUUID(),follow.user_id,anime.id,episode.number,releaseId]);
  }}
  await client.query('UPDATE anime_follows SET last_episode=$1 WHERE user_id=$2 AND anime_id=$3',[Math.max(maximum,follow.last_episode||0),follow.user_id,anime.id]);
 }
}
export async function continueWatching(db,userId){
 const rows=(await db.query(`SELECT a.*,w.episode AS resume_episode,w.season AS resume_season,w.position_seconds AS resume_position,w.provider AS resume_provider,w.source_release_id AS resume_release,w.completed FROM anime a JOIN watch_history w ON w.anime_id=a.id JOIN (SELECT anime_id,MAX(updated_at) AS last_watch FROM watch_history WHERE user_id=$1 GROUP BY anime_id) recent ON recent.anime_id=w.anime_id AND recent.last_watch=w.updated_at WHERE w.user_id=$1 AND a.blocked=FALSE ORDER BY w.updated_at DESC`,[userId])).rows;
 const seen=new Set();return rows.filter(a=>{if(seen.has(a.id))return false;seen.add(a.id);return !a.completed&&a.resume_position>0;}).slice(0,14);
}
export function resumeLink(a){const params=new URLSearchParams({source:a.resume_provider||'kodik',episode:a.resume_episode,season:a.resume_season,resume:'1'});if(a.resume_provider==='aniliberty'&&a.resume_release)params.set('release',a.resume_release);return '/anime/'+a.id+'?'+params+'#player';}
export function resumeCard(a){return `<div class="resume-card">${card(a)}<p class="meta">${a.resume_season>1?a.resume_season+' сезон · ':''}${a.resume_episode} серия · ${Math.floor(a.resume_position/60)}:${String(a.resume_position%60).padStart(2,'0')}</p><a class="button secondary" href="${esc(resumeLink(a))}">Продолжить →</a></div>`;}
export function mountFollows(app,db){
 app.use(async(req,res,next)=>{if(req.user)req.unreadNotifications=+(await db.query('SELECT COUNT(*) AS count FROM notifications WHERE user_id=$1 AND read_at IS NULL',[req.user.id])).rows[0].count;next();});
 app.post('/follow/:id',requireUser,async(req,res)=>{
  const client=await db.connect();try{await client.query('BEGIN');const a=(await client.query('SELECT id FROM anime WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];if(!a){await client.query('ROLLBACK');return res.sendStatus(404);}
   if(req.body.follow==='false')await client.query('DELETE FROM anime_follows WHERE user_id=$1 AND anime_id=$2',[req.user.id,a.id]);
   else {const baseline=(await client.query('SELECT MAX(episode) AS maximum FROM episode_releases WHERE anime_id=$1',[a.id])).rows[0].maximum;await client.query('INSERT INTO anime_follows(user_id,anime_id,last_episode) VALUES($1,$2,$3) ON CONFLICT(user_id,anime_id) DO NOTHING',[req.user.id,a.id,baseline]);}
   await client.query('COMMIT');res.redirect('/anime/'+a.id);
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 });
 app.get('/following',requireUser,async(req,res)=>{const page=Math.max(1,Math.min(100000,parseInt(req.query.page,10)||1));const total=+(await db.query('SELECT COUNT(*) AS count FROM anime_follows WHERE user_id=$1',[req.user.id])).rows[0].count;const rows=(await db.query('SELECT a.* FROM anime a JOIN anime_follows f ON f.anime_id=a.id WHERE f.user_id=$1 ORDER BY f.created_at DESC,a.id LIMIT 24 OFFSET $2',[req.user.id,(page-1)*24])).rows;res.send(layout('Отслеживаемое',`<h1>Отслеживаемое</h1><p class="muted">Уведомления о новых доступных сериях AniLiberty появятся на сайте.</p><div class="grid">${rows.map(a=>card(a)).join('')||'<p>Нажми «Отслеживать» на странице аниме.</p>'}</div>${pagination(page,total,24,n=>'/following?page='+n)}`,req));});
 app.get('/notifications',requireUser,async(req,res)=>{const page=Math.max(1,Math.min(100000,parseInt(req.query.page,10)||1));const total=+(await db.query('SELECT COUNT(*) AS count FROM notifications WHERE user_id=$1',[req.user.id])).rows[0].count;const rows=(await db.query('SELECT n.*,a.name,a.poster,a.blocked FROM notifications n JOIN anime a ON a.id=n.anime_id WHERE n.user_id=$1 ORDER BY n.created_at DESC,n.id LIMIT 20 OFFSET $2',[req.user.id,(page-1)*20])).rows;res.send(layout('Уведомления',`<div class="section-heading"><h1>Уведомления</h1><form method="post" action="/notifications/read">${csrf(req)}<button class="secondary">Прочитать все</button></form></div><div class="notification-list">${rows.map(n=>`<article class="panel notification ${n.read_at?'':'unread'}">${n.poster?`<img src="${esc(n.poster)}" alt="" loading="lazy">`:''}<div><span class="meta">${new Date(n.created_at).toLocaleString('ru-RU',{timeZone:'Europe/Minsk'})} (МСК)${!n.read_at?' · Новое':''}</span><h3>${esc(n.name)}</h3><p>${n.episode} серия · AniLiberty${n.blocked?' · Просмотр ограничен':''}</p><form method="post" action="/notifications/${n.id}/open">${csrf(req)}<button class="secondary">${n.blocked?'Открыть страницу':'Смотреть серию →'}</button></form></div></article>`).join('')||'<div class="panel">Новых уведомлений пока нет.</div>'}</div>${pagination(page,total,20,n=>'/notifications?page='+n)}`,req));});
 app.post('/notifications/read',requireUser,async(req,res)=>{await db.query('UPDATE notifications SET read_at=NOW() WHERE user_id=$1 AND read_at IS NULL',[req.user.id]);res.redirect('/notifications');});
 app.post('/notifications/:id/open',requireUser,async(req,res)=>{const n=(await db.query('UPDATE notifications SET read_at=NOW() WHERE id=$1 AND user_id=$2 RETURNING *',[req.params.id,req.user.id])).rows[0];if(!n)return res.sendStatus(404);res.redirect('/anime/'+n.anime_id+'?source=aniliberty&release='+n.release_id+'&episode='+n.episode+'#player');});
}
