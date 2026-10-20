import {plainDescription} from './shikimori.js';
import {forbiddenGenre} from './import-policy.js';

const normalize=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/ё/g,'е').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
// Current Shikimori themes and legacy spellings describe the same catalogue topics.
const groups=[
 ['Приключения','Adventure'],['Фэнтези','Fantasy','Городское фэнтези','Urban Fantasy'],
 ['Исэкай','Исекай','Исекаи','Попаданцы','Попаданец','Isekai'],['Реинкарнация','Перерождение','Reincarnation'],
 ['Тайна','Детектив','Mystery','Detective'],['Триллер','Suspense','Thriller'],
 ['Повседневность','Slice of Life'],['Иясикэй','Иясикей','Ияшикей','Iyashikei'],
 ['Романтика','Romance','Романтический подтекст','Love Status Quo'],
 ['Фантастика','Научная фантастика','Sci-Fi','Science Fiction'],['Меха','Mecha'],['Космос','Space'],
 ['Вампиры','Вампир','Vampire','Vampires'],['Школа','Школьная жизнь','School'],
 ['Музыка','Music','Идолы (Жен.)','Идолы (Муж.)','Idols (Female)','Idols (Male)'],
 ['Выживание','Survival'],['Демоны','Демон','Demons','Demon'],
 ['Спорт','Спортивное','Sports','Командный спорт','Team Sports','Спортивные единоборства','Combat Sports','Гонки','Racing'],
 ['Комедия','Comedy','Пародия','Parody','Гэг-юмор','Gag Humor'],
 ['Исторический','Историческое','История','Historical','Самураи','Samurai'],
 ['Психологическое','Психологический','Psychological'],['Военное','Военный','Military'],
 ['Магия','Magic','Махо-сёдзё','Mahou Shoujo','Magical Girl'],
];
const aliases=new Map(groups.flatMap(group=>group.map(name=>[normalize(name),normalize(group[0])])));
const topic=value=>aliases.get(normalize(value))||normalize(value);
const stories={
 adventures:/приключен|кругосветн|отправля.{0,45}(?:путешеств|экспедиц)|journey|adventure/i,
 fantasy:/магическ|волшебн|заклинан|фантастическ.{0,25}мир|fantasy|wizard/i,
 isekai:/ис[еэ]ка[йи]|реинкарнац|перерожд|перерод|(?:попа(?:л|ла|ли|дает|дают)|перен[еёо]с|перемест|призва|призыва|оказ(?:ал|ыва)).{0,80}(?:друг(?:ом|ой|ого|ую)|ином|иной|параллельн).{0,20}мир|isekai|reincarnat/i,
 mystery:/детектив|расследова|сыщик|раскры(?:ть|вает|вают).{0,30}преступлен|серийн.{0,20}убийц|detective|investigat/i,
 'quiet-days':/неспешн.{0,30}(?:жизн|истор|будн)|тих.{0,25}повседнев|спокойн.{0,25}будн|iyashikei|slice of life/i,
 romance:/романтическ|влюбл[её]н|любовн.{0,25}(?:истор|отношен|треугольник)|romance|fall in love/i,
 'science-fiction':/космическ.{0,25}(?:кораб|станц|путешеств)|искусственн.{0,15}интеллект|киберпанк|межзв[её]зд|колонизац.{0,25}планет|science fiction|android|cyberpunk/i,
 vampires:/вампир|кровосос|vampire/i,
 school:/школьн|старшекласс|однокласс|ученик.{0,20}школ|school life|high school/i,
 music:/музыкальн|музыкант|рок групп|рок-групп|певиц|певец|певц|пианист|гитарист|идол.{0,30}сцен|musician|pianist/i,
 survival:/выжива|выжить|борьб.{0,15}за жизнь|бороться за жизнь|смертельн.{0,20}(?:игр|испытан)|survival|death game/i,
 demons:/демон(?:ы|ов|ами|ам|ах|а|ом|у|е)?(?:\s|[,.!?;:]|$)|демоническ|demon(?:s|ic)?(?:\s|[,.!?;:]|$)/i,
 sports:/футбол|баскетбол|волейбол|спортсмен|спортивн|теннис|пловец|плавани|бокс[её]р|football|basketball|volleyball/i,
 comedy:/комеди[яй]|комедийн|юмористическ|гэг.{0,15}юмор|comedy|comedic/i,
 history:/самура|с[её]гун|эпох.{0,15}(?:эдо|мэйдзи|сэнгоку)|историческ.{0,30}(?:эпох|япони|кита|событ)|феодальн.{0,20}(?:япони|кита)|samurai|shogun/i,
 psychological:/психологическ|манипуляци|игр.{0,10}разум|mind games|psychological/i,
 military:/военн.{0,25}(?:конфликт|операц|отряд|академи)|фронт|солдат|армия|армии|войн.{0,30}(?:государств|импер|стран)|military|soldier/i,
 magic:/магическ|волшебн|заклинан|чароде|колдун|маг(?:ия|ии|ию|ией)(?:\s|[,.!?;:]|$)|wizard|sorcer|spellcast/i,
};

export function prepareCollectionEntry(a){
 const source=(a.metadata?.source_genres||[]).flatMap(g=>typeof g==='string'?[g]:[g?.russian,g?.name]);
 return {a,topics:new Set([...(a.genres||[]),...source].filter(Boolean).map(topic)),title:plainDescription(a.name+' '+(a.original_name||'')).slice(0,1000),story:plainDescription(a.description||'').replace(/\s+/g,' ').slice(0,12000)};
}
export function collectionScore(entry,c){
 const {a,topics,title,story}=entry;
 if(a.blocked||a.status==='anons'||forbiddenGenre(a))return 0;
 if(c.kind&&a.kind!==c.kind||c.status&&a.status!==c.status)return 0;
 if(c.country&&normalize(a.country)!==normalize(c.country)&&!(c.country==='Китай'&&(!a.country||a.country==='Не определена')&&a.metadata?.country_code==='CN'))return 0;
 if(c.maxYear&&(!a.year||a.year<1998||a.year>c.maxYear))return 0;
 if(!c.genres?.length)return 1;
 const tagged=c.genres.some(g=>topics.has(topic(g))),pattern=stories[c.slug];
 // A broad fantasy/supernatural tag alone is not proof of magic, vampires or demons.
 const titleMatch=pattern?.test(title),storyMatch=pattern?.test(story);
 return tagged?100:titleMatch?30:storyMatch?20:0;
}
