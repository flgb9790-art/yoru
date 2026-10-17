import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {requireUser,requireAdmin} from './security.js';
import {layout,esc,csrf,card,pagination} from './views.js';
export const statuses={planned:'Запланировано',watching:'Смотрю',completed:'Просмотрено',favorite:'Любимое',paused:'Отложено',dropped:'Брошено'};
const pageOf=value=>Math.max(1,Math.min(100000,parseInt(value)||1));
export function mountCommunity(app,db){
 const send=(req,res,title,body)=>res.send(layout(title,body,req));
 app.get('/library',requireUser,async(req,res)=>{
  const page=pageOf(req.query.page),status=Object.hasOwn(statuses,req.query.status)?req.query.status:'',q=String(req.query.q||'').trim().slice(0,200);
  const values=[req.user.id],clauses=[];if(status){values.push(status);clauses.push('library.status=$'+values.length);}if(q){values.push('%'+q+'%');clauses.push('(anime.name ILIKE $'+values.length+' OR anime.original_name ILIKE $'+values.length+')');}const where=clauses.length?' AND '+clauses.join(' AND '):'';
  const total=+(await db.query('SELECT COUNT(*) AS count FROM library JOIN anime ON anime.id=library.anime_id WHERE user_id=$1'+where,values)).rows[0].count;
  const rows=(await db.query(`SELECT anime.*,library.status AS saved_status,library.score AS saved_score FROM library JOIN anime ON anime.id=anime_id WHERE user_id=$1${where} ORDER BY name,anime.id LIMIT $${values.length+1} OFFSET $${values.length+2}`,[...values,24,(page-1)*24])).rows;
  send(req,res,'Моя библиотека',`<div class="catalog-heading"><div class="eyebrow">Твоя коллекция</div><h1>Моя библиотека</h1><p class="muted">Списки, впечатления и истории, к которым хочется вернуться.</p></div><form class="filters library-search" method="get" action="/library"><input type="hidden" name="status" value="${esc(status)}"><input name="q" value="${esc(q)}" placeholder="Поиск в моём списке" aria-label="Поиск в моём списке" maxlength="200"><button>Найти</button><a class="button secondary" href="/library">Сбросить</a></form><nav class="library-tabs" aria-label="Списки аниме"><a href="/library?q=${encodeURIComponent(q)}" ${!status?'aria-current="page"':''}>Все</a>${Object.entries(statuses).map(([key,label])=>`<a href="/library?status=${key}&amp;q=${encodeURIComponent(q)}" ${status===key?'aria-current="page"':''}>${label}</a>`).join('')}</nav><div class="catalog-results"><span>В списке <strong>${total}</strong></span></div><div class="grid library-grid">${rows.map(a=>`<div class="library-item">${card(a)}<p class="library-progress"><a href="/anime/${a.id}/progress">Мои серии →</a>${a.saved_score?`<span class="personal-score" aria-label="Моя оценка">★ ${a.saved_score}</span>`:''}</p><form class="library-controls" method="post" action="/library/${a.id}">${csrf(req)}<select name="status" aria-label="Статус ${esc(a.name)}">${Object.entries(statuses).map(([key,label])=>`<option value="${key}" ${a.saved_status===key?'selected':''}>${label}</option>`).join('')}</select><button class="secondary">Сохранить</button></form><form method="post" action="/library/${a.id}/remove">${csrf(req)}<button class="text-button">Убрать из списка</button></form></div>`).join('')||'<div class="panel empty-catalog"><h2>Здесь пока пусто</h2><p class="muted">Попробуй другой список или добавь аниме из каталога.</p><a class="button secondary" href="/catalog">Открыть каталог</a></div>'}</div>${pagination(page,total,24,n=>`/library?status=${status}&q=${encodeURIComponent(q)}&page=${n}`)}`);
 });
 app.post('/library/:id/remove',requireUser,async(req,res)=>{await db.query('DELETE FROM library WHERE user_id=$1 AND anime_id=$2',[req.user.id,req.params.id]);res.redirect('/library');});
 app.post('/anime/:id/score',requireUser,async(req,res)=>{
  const score=z.coerce.number().int().min(1).max(10).parse(req.body.score);
  if(!(await db.query('SELECT id FROM anime WHERE id=$1',[req.params.id])).rowCount)return res.sendStatus(404);
  await db.query("INSERT INTO library(user_id,anime_id,status,score) VALUES($1,$2,'planned',$3) ON CONFLICT(user_id,anime_id) DO UPDATE SET score=$3",[req.user.id,req.params.id,score]);res.redirect('/anime/'+req.params.id);
 });
 app.get('/admin/users',requireAdmin,async(req,res)=>{
  const page=pageOf(req.query.page),q=String(req.query.q||'').slice(0,100),values=q?['%'+q+'%']:[],where=q?' WHERE name ILIKE $1':'';
  const total=+(await db.query('SELECT COUNT(*) AS count FROM users'+where,values)).rows[0].count;
  const rows=(await db.query(`SELECT id,name,role,created_at FROM users${where} ORDER BY created_at DESC LIMIT $${values.length+1} OFFSET $${values.length+2}`,[...values,20,(page-1)*20])).rows;
  send(req,res,'Пользователи',`<h1>Пользователи</h1><a href="/admin">← Управление сайтом</a><form class="filters"><input name="q" value="${esc(q)}" placeholder="Поиск по имени"><button>Найти</button></form><div class="panel">${rows.map(u=>`<div class="admin-row"><strong>${esc(u.name)}</strong><form method="post" action="/admin/users/${u.id}/role">${csrf(req)}<select name="role" aria-label="Права ${esc(u.name)}">${['user','moderator','admin'].map(role=>`<option ${u.role===role?'selected':''}>${role}</option>`).join('')}</select><button class="secondary">Сохранить</button></form></div>`).join('')}</div>${pagination(page,total,20,n=>'/admin/users?q='+encodeURIComponent(q)+'&page='+n)}`);
 });
 app.post('/admin/users/:id/role',requireAdmin,async(req,res)=>{
  const role=z.enum(['user','moderator','admin']).parse(req.body.role);
  if(req.params.id===req.user.id&&role!=='admin')return res.status(400).send('Нельзя снять собственные права администратора.');
  const updated=await db.query('UPDATE users SET role=$1 WHERE id=$2',[role,req.params.id]);if(!updated.rowCount)return res.sendStatus(404);
  await db.query('INSERT INTO audit(id,user_id,action,entity_id) VALUES($1,$2,$3,$4)',[randomUUID(),req.user.id,'role:'+role,req.params.id]);res.redirect('/admin/users');
 });
 const moderator=(req,res,next)=>['admin','moderator'].includes(req.user?.role)?next():res.sendStatus(403);
 app.get('/moderation',moderator,async(req,res)=>{
  const page=pageOf(req.query.page),total=+(await db.query('SELECT COUNT(*) AS count FROM comments')).rows[0].count;
  const rows=(await db.query('SELECT comments.*,users.name AS username,anime.name AS title FROM comments JOIN users ON users.id=comments.user_id JOIN anime ON anime.id=comments.anime_id ORDER BY comments.created_at DESC LIMIT 20 OFFSET $1',[(page-1)*20])).rows;
  send(req,res,'Модерация',`<h1>Комментарии</h1><div class="panel">${rows.map(c=>`<article class="comment"><a href="/anime/${c.anime_id}">${esc(c.title)}</a><p><strong>${esc(c.username)}</strong> · ${c.hidden?'Скрыт':'Опубликован'}</p><p>${esc(c.body)}</p><form method="post" action="/moderation/${c.id}">${csrf(req)}<input type="hidden" name="hidden" value="${!c.hidden}"><button class="secondary">${c.hidden?'Восстановить':'Скрыть'}</button></form></article>`).join('')||'<p>Комментариев пока нет.</p>'}</div>${pagination(page,total,20,n=>'/moderation?page='+n)}`);
 });
 app.post('/moderation/:id',moderator,async(req,res)=>{const hidden=z.enum(['true','false']).parse(req.body.hidden)==='true';const updated=await db.query('UPDATE comments SET hidden=$1 WHERE id=$2',[hidden,req.params.id]);if(!updated.rowCount)return res.sendStatus(404);await db.query('INSERT INTO audit(id,user_id,action,entity_id) VALUES($1,$2,$3,$4)',[randomUUID(),req.user.id,'comment:hidden:'+req.body.hidden,req.params.id]);res.redirect('/moderation');});
}
