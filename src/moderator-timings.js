import {randomUUID} from 'node:crypto';
import {parseSkipRules,formatSkipRules} from './kodik-skips.js';
import {layout,esc,csrf} from './views.js';

export function mountModeratorTimings(app,db){
 const staff=(req,res,next)=>['admin','moderator'].includes(req.user?.role)?next():res.sendStatus(403);
 const path='/moderation/anime/:id/timings';
 app.get(path,staff,async(req,res)=>{
  const anime=(await db.query('SELECT id,name,metadata FROM anime WHERE id=$1',[req.params.id])).rows[0];if(!anime)return res.sendStatus(404);
  res.send(layout('Тайминги Kodik',`<section class="panel"><div class="section-heading"><div><span class="eyebrow">Настройки пропуска · Kodik</span><h1>${esc(anime.name)}</h1></div><a class="button secondary" href="/anime/${anime.id}">К аниме</a></div>${req.query.saved==='1'?'<p role="status">Тайминги сохранены.</p>':''}<p class="muted">Укажи точные интервалы для каждой серии. Остальные данные аниме здесь не меняются.</p><form class="anime-editor" method="post" action="/moderation/anime/${anime.id}/timings">${csrf(req)}<fieldset><legend>Опенинг и эндинг</legend><div class="timing-help"><h2>Как выставить тайминги</h2><ol><li>Открой нужную серию в Kodik и выбери озвучку. Запиши время начала и конца опенинга и эндинга по шкале плеера.</li><li>Начни строку с <strong>сезон.серия:</strong> — например, <code>1.2:</code> означает второй эпизод первого сезона. Бери номер сезона из Kodik: он может отличаться от номера части в названии аниме.</li><li>После <code>[opening]</code> укажи начало и конец опенинга через дефис. Эндинг добавь через запятую с меткой <code>[ending]</code>. Если нужен только опенинг, вторую часть не пиши.</li><li>Для следующей серии добавь новую строку. Сохрани, заново открой плеер и проверь пропуск внутри указанного интервала.</li></ol><p><strong>Пример:</strong> первая серия первого сезона, опенинг с 12-й секунды до 1:30, эндинг с 22:10 до 23:40.</p><pre><code>1.1: [opening]00:12-01:30,[ending]22:10-23:40
1.2: [opening]00:05-01:35</code></pre><p class="muted">Допустимы секунды (<code>12-90</code>), минуты и секунды (<code>00:12-01:30</code>) или часы, минуты и секунды. Конец должен быть позже начала, интервалы не должны пересекаться. Одну серию указывай только один раз.</p><p class="muted">Кнопка появляется во время заданного интервала. Тайминги общие для всех озвучек этой серии: проверь, что монтаж совпадает. Пустое поле удаляет ручные интервалы; собственные тайминги Kodik могут остаться.</p></div><label>Тайминги<textarea name="kodik_skip_rules" rows="10" maxlength="20000" placeholder="1.1: [opening]00:12-01:30,[ending]22:10-23:40">${esc(formatSkipRules(anime.metadata?.kodik_skip_rules))}</textarea></label></fieldset><div class="editor-actions"><button>Сохранить тайминги</button><a class="button secondary" href="/anime/${anime.id}">Отмена</a></div></form></section>`,req));
 });
 app.post(path,staff,async(req,res)=>{
  if(typeof req.body.kodik_skip_rules!=='string')return res.status(400).send('Укажи тайминги.');
  const rules=parseSkipRules(req.body.kodik_skip_rules),client=await db.connect();
  try{
   await client.query('BEGIN');
   const anime=(await client.query('SELECT metadata,protected_fields FROM anime WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];
   if(!anime){await client.query('ROLLBACK');return res.sendStatus(404);}
   const metadata={...anime.metadata,kodik_skip_rules:rules},protectedFields=[...new Set([...(anime.protected_fields||[]),'metadata.kodik_skip_rules'])];
   await client.query('UPDATE anime SET metadata=$1,protected_fields=$2,updated_at=NOW() WHERE id=$3',[JSON.stringify(metadata),protectedFields,req.params.id]);
   await client.query('INSERT INTO audit(id,user_id,action,entity_id) VALUES($1,$2,$3,$4)',[randomUUID(),req.user.id,'anime:timings',req.params.id]);
   await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  res.redirect('/moderation/anime/'+req.params.id+'/timings?saved=1');
 });
}
