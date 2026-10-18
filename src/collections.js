import {layout,esc,card,pagination} from './views.js';
export const collections=[
 {slug:'adventures',title:'Навстречу приключениям',description:'Путешествия, открытия и большие истории.',genres:['Приключения']},
 {slug:'fantasy',title:'По ту сторону реальности',description:'Магия и миры, в которых всё возможно.',genres:['Фэнтези','Исекай']},
 {slug:'mystery',title:'Разгадать тайну',description:'Детективы, загадки и напряжённые расследования.',genres:['Детектив','Триллер']},
 {slug:'quiet-days',title:'Неспешные вечера',description:'Повседневность и спокойные истории для отдыха.',genres:['Повседневность','Иясикэй']},
 {slug:'romance',title:'Истории о чувствах',description:'Встречи и отношения, которые меняют героев.',genres:['Романтика']},
 {slug:'science-fiction',title:'За пределами возможного',description:'Будущее, технологии и другие грани фантастики.',genres:['Фантастика','Меха']},
 {slug:'movies',title:'На один вечер',description:'Полнометражные аниме для вечернего просмотра.',kind:'movie'},
 {slug:'classics',title:'Возвращаясь к классике',description:'Уже вышедшие истории с 1998 по 2010 год.',maxYear:2010},
 {slug:'ongoing',title:'Смотрим вместе',description:'Истории, новые серии которых ещё выходят.',status:'ongoing'},
 {slug:'china',title:'Мир дунхуа',description:'Китайская анимация из каталога YORU.',country:'Китай'}
];
export async function collectionEntries(db,collection,size=24,offset=0){const clauses=["blocked=FALSE","status<>'anons'"],values=[];const add=(sql,value)=>{values.push(value);clauses.push(sql.replace('?',`$${values.length}`));};
 if(collection.genres?.length){const parts=collection.genres.map(genre=>{values.push(genre);return '$'+values.length+' = ANY(genres)';});clauses.push('('+parts.join(' OR ')+')');}
 if(collection.kind)add('kind=?',collection.kind);if(collection.country)add('country=?',collection.country);if(collection.status)add('status=?',collection.status);if(collection.maxYear){add('year>=?',1998);add('year<=?',collection.maxYear);}
 const where=' WHERE '+clauses.join(' AND '),total=+(await db.query('SELECT COUNT(*) AS count FROM anime'+where,values)).rows[0].count;
 const rows=(await db.query('SELECT * FROM anime'+where+' ORDER BY rating DESC,id LIMIT $'+(values.length+1)+' OFFSET $'+(values.length+2),[...values,size,offset])).rows;return {total,rows};
}
export function mountCollections(app,db){
 app.get('/collections',async(req,res)=>{const cards=await Promise.all(collections.map(async c=>({c,...await collectionEntries(db,c,3)})));res.send(layout('Подборки аниме',`<section class="panel page-controls"><div class="eyebrow">Выбирай настроение</div><h1>Подборки аниме</h1><p class="muted">Тематические коллекции из доступного каталога. Они пополняются вместе с сайтом.</p></section><div class="collection-grid">${cards.map(({c,total,rows},index)=>`<a class="panel collection-card" href="/collections/${c.slug}"><div class="collection-art collection-art-${index%5}">${rows.map(a=>a.poster?`<img src="${esc(a.poster)}" alt="" loading="lazy">`:'<span>YORU.</span>').join('')||'<span>YORU.</span>'}<span class="collection-count">${total} аниме</span></div><h2>${esc(c.title)}</h2><p>${esc(c.description)}</p></a>`).join('')}</div>`,req));});
 app.get('/collections/:slug',async(req,res)=>{const c=collections.find(c=>c.slug===req.params.slug);if(!c)return res.sendStatus(404);const page=Math.max(1,Math.min(100000,parseInt(req.query.page,10)||1)),{rows,total}=await collectionEntries(db,c,24,(page-1)*24);res.send(layout(c.title,`<section class="panel page-controls"><a href="/collections" class="collection-back">← Все подборки</a><h1>${esc(c.title)}</h1><p class="muted">${esc(c.description)}</p><div class="catalog-results">${total} аниме</div></section><div class="grid">${rows.map(a=>card(a)).join('')||'<div class="panel empty-catalog"><h2>Подборка пополняется</h2><p class="muted">Тайтлы появятся после загрузки соответствующих жанров и сведений.</p><a href="/catalog">Открыть каталог →</a></div>'}</div>${pagination(page,total,24,n=>'/collections/'+c.slug+'?page='+n)}`,req));});
}
