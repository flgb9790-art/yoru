import {prepareCollectionEntry,collectionScore} from './collection-matching.js';
import {layout} from './views.js';
import {collectionsView,collectionView} from './collection-view.js';
export const collections=[
 {slug:'adventures',title:'Навстречу приключениям',description:'Путешествия, открытия и большие истории.',genres:['Приключения']},
 {slug:'fantasy',title:'По ту сторону реальности',description:'Магия и миры, в которых всё возможно.',genres:['Фэнтези','Исэкай','Реинкарнация']},
 {slug:'mystery',title:'Разгадать тайну',description:'Детективы, загадки и напряжённые расследования.',genres:['Детектив','Триллер']},
 {slug:'quiet-days',title:'Неспешные вечера',description:'Повседневность и спокойные истории для отдыха.',genres:['Повседневность','Иясикэй']},
 {slug:'romance',title:'Истории о чувствах',description:'Встречи и отношения, которые меняют героев.',genres:['Романтика']},
 {slug:'science-fiction',title:'За пределами возможного',description:'Будущее, технологии и другие грани фантастики.',genres:['Фантастика','Меха','Космос']},
 {slug:'movies',title:'На один вечер',description:'Полнометражные аниме для вечернего просмотра.',kind:'movie'},
 {slug:'classics',title:'Возвращаясь к классике',description:'Уже вышедшие истории с 1998 по 2010 год.',maxYear:2010},
 {slug:'ongoing',title:'Смотрим вместе',description:'Истории, новые серии которых ещё выходят.',status:'ongoing'},
 {slug: 'isekai', title: 'Жизнь в другом мире', description: 'Попаданцы, перерождение и приключения за пределами привычного.', genres: ['Исэкай', 'Попаданцы', 'Реинкарнация']},
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
async function collectionCatalogue(db){return (await db.query("SELECT * FROM anime WHERE blocked=FALSE AND status<>'anons' ORDER BY rating DESC,id")).rows.map(prepareCollectionEntry);}
export async function collectionEntries(db,collection,size=24,offset=0,catalogue=null){
 const entries=catalogue||await collectionCatalogue(db),matches=entries.map(entry=>({a:entry.a,score:collectionScore(entry,collection)})).filter(row=>row.score>0);
 matches.sort((a,b)=>b.score-a.score||Number(b.a.rating)-Number(a.a.rating)||a.a.id.localeCompare(b.a.id));
 return {total:matches.length,rows:matches.slice(offset,offset+size).map(row=>row.a)};
}
export function mountCollections(app,db){
 app.get('/collections',async(req,res)=>{const page=Math.max(1,Math.min(100000,parseInt(req.query.page,10)||1)),catalogue=await collectionCatalogue(db),cards=await Promise.all(collections.slice((page-1)*12,page*12).map(async c=>({c,...await collectionEntries(db,c,3,0,catalogue)})));if(page>Math.max(1,Math.ceil(collections.length/12)))return res.sendStatus(404);res.send(layout('Подборки аниме',collectionsView(cards,page,collections.length),req));});
 app.get('/collections/:slug',async(req,res)=>{const c=collections.find(c=>c.slug===req.params.slug);if(!c)return res.sendStatus(404);const page=Math.max(1,Math.min(100000,parseInt(req.query.page,10)||1)),{rows,total}=await collectionEntries(db,c,24,(page-1)*24);if(page>Math.max(1,Math.ceil(total/24)))return res.sendStatus(404);req.seo={title:c.title+' — подборка аниме',description:c.description,noindex:!total};res.send(layout(c.title,collectionView(c,rows,total,page),req));});
}
