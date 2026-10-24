import {moderationView} from './comment-moderation.js';
import {animeSearch} from './anime-search.js';
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
  const values=[req.user.id],clauses=[];if(status){values.push(status);clauses.push('library.status=$'+values.length);}if(q)clauses.push(animeSearch(q,values,['anime.name','anime.original_name']));const where=clauses.length?' AND '+clauses.join(' AND '):'';
  const total=+(await db.query('SELECT COUNT(*) AS count FROM library JOIN anime ON anime.id=library.anime_id WHERE user_id=$1'+where,values)).rows[0].count;
  const rows=(await db.query(`SELECT anime.*,library.status AS saved_status,library.score AS saved_score FROM library JOIN anime ON anime.id=anime_id WHERE user_id=$1${where} ORDER BY name,anime.id LIMIT $${values.length+1} OFFSET $${values.length+2}`,[...values,24,(page-1)*24])).rows;
  send(req,res,'Моя библиотека',`<section class="panel page-controls"><div class="catalog-heading"><div class="eyebrow">Твоя коллекция</div><h1>Моя библиотека</h1><p class="muted">Списки, впечатления и истории, к которым хочется вернуться.</p></div><form class="filters library-search" method="get" action="/library"><input type="hidden" name="status" value="${esc(status)}"><input name="q" value="${esc(q)}" placeholder="Поиск в моём списке" aria-label="Поиск в моём списке" maxlength="200"><button>Найти</button><a class="button secondary" href="/library">Сбросить</a></form><nav class="library-tabs" aria-label="Списки аниме"><a href="/library?q=${encodeURIComponent(q)}" ${!status?'aria-current="page"':''}>Все</a>${Object.entries(statuses).map(([key,label])=>`<a href="/library?status=${key}&amp;q=${encodeURIComponent(q)}" ${status===key?'aria-current="page"':''}>${label}</a>`).join('')}</nav><div class="catalog-results"><span>В списке <strong>${total}</strong></span></div></section><div class="grid library-grid">${rows.map(a=>`<div class="library-item">${card(a)}<div class="library-item-tools"><form class="library-controls" data-library-status method="post" action="/library/${a.id}">${csrf(req)}<select name="status" aria-label="Статус ${esc(a.name)}">${Object.entries(statuses).map(([key,label])=>`<option value="${key}" ${a.saved_status===key?'selected':''}>${label}</option>`).join('')}</select><button class="secondary" data-library-save aria-label="Сохранить статус">✓</button></form><div class="library-item-links"><a href="/anime/${a.id}/progress">Мои серии${a.saved_score?' · ★ '+a.saved_score:''}</a><form method="post" action="/library/${a.id}/remove">${csrf(req)}<button type="submit" class="library-remove" aria-label="Убрать ${esc(a.name)} из библиотеки" title="Убрать из библиотеки"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/></svg></button></form></div></div></div>`).join('')||'<div class="panel empty-catalog"><h2>Здесь пока пусто</h2><p class="muted">Попробуй другой список или добавь аниме из каталога.</p><a class="button secondary" href="/catalog">Открыть каталог</a></div>'}</div>${pagination(page,total,24,n=>`/library?status=${status}&q=${encodeURIComponent(q)}&page=${n}`)}`);
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
  send(req,res,'Пользователи',`<h1>Пользователи</h1><p class="muted">Права доступа и поиск по имени.</p><form class="filters"><input name="q" value="${esc(q)}" placeholder="Поиск по имени"><button>Найти</button></form><div class="panel">${rows.map(u=>`<div class="admin-row"><strong>${esc(u.name)}</strong><form method="post" action="/admin/users/${u.id}/role">${csrf(req)}<select name="role" aria-label="Права ${esc(u.name)}">${['user','moderator','admin'].map(role=>`<option value="${role}" ${u.role===role?'selected':''}>${({user:'Зритель',moderator:'Модератор',admin:'Администратор'})[role]}</option>`).join('')}</select><button class="secondary">Сохранить</button></form></div>`).join('')}</div>${pagination(page,total,20,n=>'/admin/users?q='+encodeURIComponent(q)+'&page='+n)}`);
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
  const rows=(await db.query('SELECT comments.*,users.name AS username,users.avatar,users.xp,anime.name AS title FROM comments JOIN users ON users.id=comments.user_id JOIN anime ON anime.id=comments.anime_id ORDER BY comments.created_at DESC LIMIT 20 OFFSET $1',[(page-1)*20])).rows;
  send(req,res,'Модерация',moderationView(req,rows,page,total));
 });
 app.post('/moderation/:id',moderator,async(req,res)=>{const hidden=z.enum(['true','false']).parse(req.body.hidden)==='true';const updated=await db.query('UPDATE comments SET hidden=$1 WHERE id=$2',[hidden,req.params.id]);if(!updated.rowCount)return res.sendStatus(404);await db.query('INSERT INTO audit(id,user_id,action,entity_id) VALUES($1,$2,$3,$4)',[randomUUID(),req.user.id,'comment:hidden:'+req.body.hidden,req.params.id]);res.redirect('/moderation'+(pageOf(req.body.page)>1?'?page='+pageOf(req.body.page):''));});
}
