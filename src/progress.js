import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import rateLimit from 'express-rate-limit';
import {requireUser} from './security.js';
import {layout,esc,csrf,pagination} from './views.js';
const seasonOf=value=>z.coerce.number().int().min(0).max(10000).default(1).parse(value);
export async function knownEpisodes(db,a,season){
 const rows=(await db.query('SELECT episode FROM episode_releases WHERE anime_id=$1 AND season=$2 AND available=TRUE',[a.id,season])).rows;
 // Shikimori describes a title/part. Its episode count belongs to season 1 only.
 const count=season===1?Math.max(0,Number(a.aired)||0,a.status==='released'?Number(a.episodes)||0:0):0;
 const numbers=new Set(rows.map(r=>r.episode));for(let n=1;n<=Math.min(count,100000);n++)numbers.add(n);
 return [...numbers].sort((x,y)=>x-y);
}
export async function syncLibraryProgress(db,userId,a){
 const expected=a.status==='released'?Number(a.episodes)||Number(a.aired)||0:0;
 const watched=expected?+(await db.query('SELECT COUNT(*) AS count FROM watch_history WHERE user_id=$1 AND anime_id=$2 AND season=1 AND completed=TRUE AND episode<=$3',[userId,a.id,expected])).rows[0].count:0;
 const status=expected&&watched>=expected?'completed':'watching';
 const saved=(await db.query('SELECT status FROM library WHERE user_id=$1 AND anime_id=$2',[userId,a.id])).rows[0];
 if(!saved&&!(await db.query('SELECT id FROM watch_history WHERE user_id=$1 AND anime_id=$2 LIMIT 1',[userId,a.id])).rowCount)return;
 if(saved&&!['planned','watching','completed'].includes(saved.status))return;
 await db.query('INSERT INTO library(user_id,anime_id,status) VALUES($1,$2,$3) ON CONFLICT(user_id,anime_id) DO UPDATE SET status=$3',[userId,a.id,status]);
}
export function mountProgress(app,db){
 app.get('/anime/:id/progress',requireUser,async(req,res)=>{
  const a=(await db.query('SELECT * FROM anime WHERE id=$1',[req.params.id])).rows[0];if(!a)return res.sendStatus(404);
  const season=seasonOf(req.query.season),page=Math.max(1,Math.min(100000,parseInt(req.query.page,10)||1));
  const history=(await db.query('SELECT * FROM watch_history WHERE user_id=$1 AND anime_id=$2 AND season=$3',[req.user.id,a.id,season])).rows;
  const known=await knownEpisodes(db,a,season),numbers=[...new Set([...known,...history.map(h=>h.episode)])].sort((x,y)=>x-y),byNumber=new Map(history.map(h=>[h.episode,h])),count=history.filter(h=>h.completed).length;
  const url='/anime/'+a.id+'/progress',hidden=`${csrf(req)}<input type="hidden" name="season" value="${season}"><input type="hidden" name="page" value="${page}">`;
  res.send(layout('Мои серии',`<section class="panel progress-view" data-progress-view><div class="progress-heading"><div><a class="progress-back" href="/anime/${a.id}">← ${esc(a.name)}</a><h1>Мои серии</h1><p class="muted" role="status" aria-live="polite">Просмотрено: ${count}${known.length?' · Вышло: '+known.length:''}</p></div><form class="progress-season" method="get"><label>Сезон<input name="season" type="number" value="${season}" min="0" max="10000" required></label><button class="secondary">Показать</button></form></div><p class="progress-hint muted">Нажми на серию, чтобы отметить или снять отметку.</p><section class="episode-check-grid">${numbers.slice((page-1)*48,page*48).map(n=>{const h=byNumber.get(n);return `<form class="episode-check ${h?.completed?'is-watched':''}" method="post" action="${url}">${hidden}<input type="hidden" name="episode" value="${n}"><input type="hidden" name="completed" value="${h?.completed?'false':'true'}"><button class="episode-toggle" aria-pressed="${Boolean(h?.completed)}" aria-label="${h?.completed?'Снять отметку':'Отметить просмотренной'}: ${n} серия"><strong>${h?.completed?'✓ ':''}${n} серия</strong><span>${h?.completed?'Просмотрена':h?.position_seconds?'В процессе · '+Math.floor(h.position_seconds/60)+' мин.':'Не просмотрена'}</span></button></form>`;}).join('')||'<p class="muted">Пока нет сведений о сериях. Можно указать номер вручную.</p>'}</section>${pagination(page,numbers.length,48,n=>url+'?season='+season+'&page='+n)}<details class="progress-tools"><summary>Другие действия</summary><form class="manual-episode-form" method="post" action="${url}">${hidden}<label>Номер серии<input type="number" name="episode" min="1" max="100000" required></label><label>Отметка<select name="completed"><option value="true">Просмотрена</option><option value="false">Не просмотрена</option></select></label><button>Применить</button></form>${known.length&&known.length<=5000?`<div class="progress-bulk"><form method="post" action="${url}">${hidden}<input type="hidden" name="scope" value="season"><input type="hidden" name="completed" value="true"><button class="secondary">${a.status==='ongoing'?'Все вышедшие серии просмотрены':'Сезон просмотрен'}</button></form><form method="post" action="${url}">${hidden}<input type="hidden" name="scope" value="season"><input type="hidden" name="completed" value="false"><button class="secondary">Снять все отметки сезона</button></form></div>`:''}<p class="muted">Обычно сезон 1 — серии этого тайтла, сезон 0 — спецвыпуски плеера. Другие части отмечаются на своих страницах. Снятие отметки удаляет сохранённую позицию серии.</p></details></section>`,req));
 });
 const limit=rateLimit({windowMs:15*60000,limit:120,standardHeaders:'draft-8',legacyHeaders:false});
 app.post('/anime/:id/progress',requireUser,limit,async(req,res)=>{
  const input=z.object({season:z.coerce.number().int().min(0).max(10000).default(1),episode:z.coerce.number().int().min(1).max(100000).optional(),scope:z.enum(['episode','season']).default('episode'),completed:z.enum(['true','false']),page:z.coerce.number().int().min(1).max(100000).default(1)}).parse(req.body);
  if(input.scope==='episode'&&!input.episode)return res.status(400).send('Укажи номер серии.');
  const client=await db.connect();try{await client.query('BEGIN');
   // Serialize edits to this user's progress and automatic player writes.
   await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[req.user.id]);
   const a=(await client.query('SELECT * FROM anime WHERE id=$1',[req.params.id])).rows[0];if(!a){await client.query('ROLLBACK');return res.sendStatus(404);}
   const known=await knownEpisodes(client,a,input.season);
   if(input.scope==='season'&&(!known.length||known.length>5000)){await client.query('ROLLBACK');return res.status(400).send('Нет подходящего списка вышедших серий для общей отметки.');}
   if(input.completed==='true'&&input.scope==='episode'&&known.length&&!known.includes(input.episode)){await client.query('ROLLBACK');return res.status(400).send('Эта серия пока не числится вышедшей.');}
   const numbers=input.scope==='season'?known:[input.episode];
   if(input.completed==='false'){
    if(input.scope==='season')await client.query('DELETE FROM watch_history WHERE user_id=$1 AND anime_id=$2 AND season=$3',[req.user.id,a.id,input.season]);
    else await client.query('DELETE FROM watch_history WHERE user_id=$1 AND anime_id=$2 AND season=$3 AND episode=$4',[req.user.id,a.id,input.season,input.episode]);
   }else for(let offset=0;offset<numbers.length;offset+=100){
    const values=[],tuples=numbers.slice(offset,offset+100).map(n=>'('+[randomUUID(),req.user.id,a.id,input.season,n,true,true].map(v=>{values.push(v);return '$'+values.length;}).join(',')+')');
    await client.query(`INSERT INTO watch_history(id,user_id,anime_id,season,episode,completed,manual_mark) VALUES ${tuples.join(',')} ON CONFLICT(user_id,anime_id,season,episode) DO UPDATE SET completed=TRUE,manual_mark=TRUE,updated_at=watch_history.updated_at`,values);
   }
   await syncLibraryProgress(client,req.user.id,a);await client.query('COMMIT');res.redirect('/anime/'+a.id+'/progress?season='+input.season+'&page='+input.page);
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 });
}
