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
 {slug: 'isekai', title: 'Жизнь в другом мире', description: 'Попаданцы, перерождение и приключения за пределами привычного.', genres: ['Исекай', 'Попаданцы']},
 {slug: 'vampires', title: 'После заката', description: 'Вампиры и их тайны.', genres: ['Вампиры']},
 {slug: 'school', title: 'Школьные истории', description: 'Дружба, взросление и события после звонка.', genres: ['Школа', 'Школьная жизнь']},
 {slug: 'music', title: 'В своём ритме', description: 'Музыка, сцена и мечта быть услышанным.', genres: ['Музыка']},
 {slug: 'survival', title: 'Выжить любой ценой', description: 'Испытания, опасность и борьба за жизнь.', genres: ['Выживание']},
 {slug: 'demons', title: 'По следам демонов', description: 'Истории о демонах и противостоянии им.', genres: ['Демоны']},
 {slug: 'sports', title: 'До последнего свистка', description: 'Соперничество, команды и путь к победе.', genres: ['Спорт']},
 {slug: 'comedy', title: 'Повод улыбнуться', description: 'Комедии для хорошего настроения.', genres: ['Комедия']},
 {slug: 'history', title: 'Сквозь эпохи', description: 'Исторические миры и герои прошлого.', genres: ['Исторический', 'История']},
 {slug: 'psychological', title: 'Игры разума', description: 'Психологические истории и сложные решения.', genres: ['Психологическое']},
 {slug: 'military', title: 'На линии огня', description: 'Военные конфликты и судьбы героев.', genres: ['Военное']},
 {slug: 'magic', title: 'Когда оживает магия', description: 'Заклинания, волшебники и необычные способности.', genres: ['Магия']},
 {slug:'china',title:'Мир дунхуа',description:'Китайская анимация из каталога YORU.',country:'Китай'}
];
export async function collectionEntries(db,collection,size=24,offset=0){const clauses=["blocked=FALSE","status<>'anons'"],values=[];const add=(sql,value)=>{values.push(value);clauses.push(sql.replace('?',`$${values.length}`));};
 if(collection.genres?.length){const parts=collection.genres.map(genre=>{values.push(genre);return '$'+values.length+' = ANY(genres)';});clauses.push('('+parts.join(' OR ')+')');}
 if(collection.kind)add('kind=?',collection.kind);if(collection.country)add('country=?',collection.country);if(collection.status)add('status=?',collection.status);if(collection.maxYear){add('year>=?',1998);add('year<=?',collection.maxYear);}
 const where=' WHERE '+clauses.join(' AND '),total=+(await db.query('SELECT COUNT(*) AS count FROM anime'+where,values)).rows[0].count;
 const rows=(await db.query('SELECT * FROM anime'+where+' ORDER BY rating DESC,id LIMIT $'+(values.length+1)+' OFFSET $'+(values.length+2),[...values,size,offset])).rows;return {total,rows};
}
export function mountCollections(app,db){
 app.get('/collections',async(req,res)=>{const page=Math.max(1,Math.min(100000,parseInt(req.query.page,10)||1)),cards=await Promise.all(collections.slice((page-1)*12,page*12).map(async c=>({c,...await collectionEntries(db,c,3)})));res.send(layout('Подборки аниме',collectionsView(cards,page,collections.length),req));});
 app.get('/collections/:slug',async(req,res)=>{const c=collections.find(c=>c.slug===req.params.slug);if(!c)return res.sendStatus(404);const page=Math.max(1,Math.min(100000,parseInt(req.query.page,10)||1)),{rows,total}=await collectionEntries(db,c,24,(page-1)*24);res.send(layout(c.title,collectionView(c,rows,total,page),req));});
}
