import {z} from 'zod';import {randomUUID} from 'node:crypto';
import {requireAdmin} from './security.js';import {layout,esc,csrf} from './views.js';
import media from './hero-media.json' with {type:'json'};
import {catalogMediaFor} from './catalog-media.js';
export function heroAsset(value,{video=false}={}){
 if(!value)return '';
 if(/^\/(?:assets|media)\/[a-zA-Z0-9/_.%-]+$/.test(value)&&!value.includes('..')&&!/%(?:2e|2f|5c)/i.test(value))return value;
 try{const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password)return null;if(video&&!url.hostname.endsWith('.libria.fun')&&url.hostname!=='v.animethemes.moe')return null;return url.href;}catch{return null;}
}
export async function portalHeroItems(db,fallback){
 const rows=(await db.query('SELECT a.*,h.logo_url AS hero_logo,h.video_url AS hero_video FROM portal_hero h JOIN anime a ON a.id=h.anime_id WHERE h.enabled=TRUE AND a.blocked=FALSE ORDER BY h.slot')).rows;
 const enrich=rows=>rows.map(row=>{const found=catalogMediaFor(row);return found.logo||found.video?{...row,hero_logo:row.hero_logo||found.logo,hero_video:row.hero_video||found.video}:row;});

 const presets=(await db.query('SELECT * FROM anime WHERE blocked=FALSE AND shikimori_id IN ('+media.map((_,i)=>'$'+(i+1)).join(',')+')',media.map(item=>item.shikimori_id))).rows;
 const featured=media.flatMap(item=>{const anime=presets.find(a=>Number(a.shikimori_id)===item.shikimori_id&&Number(a.year)===item.year);return anime?[{...anime,hero_logo:item.logo,hero_video:item.video}]:[];});
 const disabled=new Set((await db.query('SELECT anime_id FROM portal_hero WHERE enabled=FALSE')).rows.map(r=>r.anime_id)),seen=new Set();return [...enrich(rows),...featured,...enrich(fallback)].filter(a=>{if(seen.has(a.id)||disabled.has(a.id))return false;seen.add(a.id);return true;}).slice(0,8);
}
export function mountPortalHero(app,db){
 app.get('/admin/slider',requireAdmin,async(req,res)=>{const rows=(await db.query('SELECT h.*,a.name,a.shikimori_id FROM portal_hero h JOIN anime a ON a.id=h.anime_id ORDER BY h.slot')).rows;
 res.send(layout('Слайдер главной',`<section class="panel portal-slider-admin"><h1>Слайдер главной</h1><p class="muted">До восьми тайтлов в заданном порядке. Если активных слайдов нет, показывается готовая подборка с видео, затем популярное. Пустое поле ID удаляет слайд.</p><p class="muted">Логотип: HTTPS-ссылка или /assets/… /media/… . Видео: локальный MP4/WebM либо HTTPS-файл на v.animethemes.moe или *.libria.fun. YouTube-ссылка не является прямым видео. Без ролика используется постер или кадр.</p>${Array.from({length:8},(_,i)=>{const n=i+1,row=rows.find(r=>r.slot===n);return `<form method="post" action="/admin/slider/${n}">${csrf(req)}<h2>Слайд ${n}${row?' · '+esc(row.name):''}</h2><label>Shikimori ID или локальный ID тайтла<input name="anime" value="${esc(row?.shikimori_id||row?.anime_id||'')}" maxlength="100"></label><label>Логотип названия<input name="logo" value="${esc(row?.logo_url||'')}" maxlength="2000" placeholder="https://…/logo.png"></label><label>Фоновое видео<input name="video" value="${esc(row?.video_url||'')}" maxlength="2000" placeholder="/media/…/trailer.mp4"></label><label class="check"><input type="checkbox" name="enabled" ${!row||row.enabled?'checked':''}> Показывать слайд</label><button>Сохранить слайд ${n}</button></form>`;}).join('')}</section>`,req));
 });
 app.post('/admin/slider/:slot',requireAdmin,async(req,res)=>{const slot=z.coerce.number().int().min(1).max(8).parse(req.params.slot),input=z.object({anime:z.string().trim().max(100),logo:z.string().trim().max(2000).default(''),video:z.string().trim().max(2000).default(''),enabled:z.string().optional()}).parse(req.body);
 const logo=heroAsset(input.logo),video=heroAsset(input.video,{video:true});if(logo===null||video===null)return res.status(400).send('Неподдерживаемый адрес логотипа или видео. Вернись назад и исправь ссылку.');
 if(!input.anime)await db.query('DELETE FROM portal_hero WHERE slot=$1',[slot]);else{const anime=(await db.query(/^\d+$/.test(input.anime)?'SELECT id FROM anime WHERE shikimori_id=$1':'SELECT id FROM anime WHERE id=$1',[/^\d+$/.test(input.anime)?Number(input.anime):input.anime])).rows[0];if(!anime)return res.status(400).send('Тайтл не найден в каталоге.');await db.query('INSERT INTO portal_hero(slot,anime_id,logo_url,video_url,enabled) VALUES($1,$2,$3,$4,$5) ON CONFLICT(slot) DO UPDATE SET anime_id=EXCLUDED.anime_id,logo_url=EXCLUDED.logo_url,video_url=EXCLUDED.video_url,enabled=EXCLUDED.enabled',[slot,anime.id,logo,video,input.enabled==='on']);}
 await db.query('INSERT INTO audit(id,user_id,action,entity_id) VALUES($1,$2,$3,$4)',[randomUUID(),req.user.id,'slider:save',String(slot)]);res.redirect('/admin/slider');
 });
}
