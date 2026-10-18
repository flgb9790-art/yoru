import {layout} from './views.js';
import {collectionsView,collectionView} from './collection-view.js';
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
 app.get('/collections',async(req,res)=>{const cards=await Promise.all(collections.map(async c=>({c,...await collectionEntries(db,c,3)})));res.send(layout('Подборки аниме',collectionsView(cards),req));});
 app.get('/collections/:slug',async(req,res)=>{const c=collections.find(c=>c.slug===req.params.slug);if(!c)return res.sendStatus(404);const page=Math.max(1,Math.min(100000,parseInt(req.query.page,10)||1)),{rows,total}=await collectionEntries(db,c,24,(page-1)*24);res.send(layout(c.title,collectionView(c,rows,total,page),req));});
}
