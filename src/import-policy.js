export const bannedGenres=['Детское','Авангард','Антропоморфизм','Хентай','Яой'];
const key=s=>String(s||'').normalize('NFKC').trim().toLowerCase().replace(/[ё]/g,'е').replace(/[-_–—]/g,' ').replace(/\s+/g,' ');
const aliases=[['детское','детский','для детей','kids'],['авангард','avant garde','avantgarde'],['антропоморфизм','anthropomorphic','anthropomorphism'],['хентай','hentai'],['яой','yaoi']];
export function forbiddenGenre(a){const values=[...(a.genres||[]),...(a.metadata?.source_genres||[]).flatMap(g=>[g.name,g.russian])];for(let i=0;i<aliases.length;i++)if(values.some(g=>aliases[i].includes(key(g))))return bannedGenres[i];return '';}
export const policyError=(code,message)=>Object.assign(Error(message),{code,status:409});
export const isImportSkip=e=>['ANIME_NOT_AIRED','ANIME_REMOVED','ANIME_NO_RUSSIAN','ANIME_FORBIDDEN_GENRE','ANIME_FILTERED'].includes(e.code);
export function assertAllowedGenres(a){const genre=forbiddenGenre(a);if(genre)throw policyError('ANIME_FORBIDDEN_GENRE','Исключённый жанр: '+genre);}
export function assertRussianTitle(a){if(!String(a.name||'').trim()||a.metadata?.russian_title===false||a.metadata?.russian_title!==true&&!/[а-яё]/i.test(String(a.name||'')))throw policyError('ANIME_NO_RUSSIAN','Нет русского названия в Shikimori');}
export function sourceCountry(value){const code=String(value||'').toUpperCase();if(!/^[A-Z]{2}$/.test(code))return 'Не определена';return ({JP:'Япония',CN:'Китай',KR:'Южная Корея'})[code]||'Другие страны';}
export function selectionReason(a,c){
 if(Number(a.metadata?.shikimori_score??a.rating)<=0)return 'Нулевой рейтинг Shikimori';
 if(c.requirePoster&&!hasRealPoster(a.poster))return 'Нет постера или заглушка';
 if(c.requireEpisodes&&!hasEpisodes(a))return 'Нет серий';
 if(c.countries?.length&&!c.countries.includes(a.country))return a.country==='Не определена'?'Страна не подтверждена':'Страна';
 const genres=(a.genres||[]).map(key),wanted=(c.genres||[]).map(key);
 if(wanted.length&&!(c.genreMatch==='all'?wanted.every(g=>genres.includes(g)):wanted.some(g=>genres.includes(g))))return 'Выбранные жанры';
 if((c.excludedGenres||[]).some(g=>genres.includes(key(g))))return 'Исключённые жанры';
 if(c.minRating&&Number(a.rating||0)<c.minRating)return 'Рейтинг';
 if(c.minEpisodes&&Number(a.episodes||0)<c.minEpisodes||c.maxEpisodes&&(!a.episodes||a.episodes>c.maxEpisodes))return 'Количество серий';
 const duration=Number(a.metadata?.duration||0);if(c.minDuration&&duration<c.minDuration||c.maxDuration&&(!duration||duration>c.maxDuration))return 'Длительность';
 if(c.ageRatings?.length&&!c.ageRatings.includes(a.metadata?.age_rating))return 'Возрастной рейтинг';
 if(c.search&&!key(a.name).includes(key(c.search))&&!key(a.original_name).includes(key(c.search)))return 'Поиск по названию';
 if(c.studios?.length&&!c.studios.some(s=>(a.metadata?.studios||[]).some(v=>key(v)===key(s))))return 'Студия';
 return '';
}

export function hasRealPoster(value){try{const u=new URL(String(value||''));return ['https:','http:'].includes(u.protocol)&&!/(?:missing|no[_-]?(?:image|poster)|placeholder|questionmark|default[_-]?(?:image|poster)|\/404(?:[._/-]|$))/i.test(u.pathname);}catch{return false;}}
export function hasEpisodes(a){return Number(a.episodes)>0||Number(a.aired)>0;}
export function catalogueQualityReason(a,{requirePoster=true,requireEpisodes=true}={}){const content=nonAnimeReason(a);if(content)return content;try{assertRussianTitle(a);}catch{return 'Нет русского названия';}if(requirePoster&&!hasRealPoster(a.poster))return 'Нет постера или заглушка';if(Number(a.metadata?.shikimori_score??a.rating)<=0)return 'Нулевой рейтинг Shikimori';if(requireEpisodes&&!hasEpisodes(a))return 'Нет серий';return '';}

// TV anime and story specials are valid. Only explicitly non-story/promotional releases are excluded.
export function nonAnimeReason(a){
 const kind=key(a.kind||'tv');if(['music','pv','cm','tv show','tvshow','live action','drama'].includes(kind))return 'Клип, реклама или неанимешное ТВ-шоу';
 const titles=[a.name,a.original_name,...(a.metadata?.source_genres||[]).flatMap(g=>[g.name,g.russian])].filter(Boolean).map(key);
 if(titles.some(t=>/(?:^|[^\p{L}])(?:recap|recaps|summary|summaries|digest|soushuuhen|soushuu hen|compilation|рекап|рекапы|пересказ|пересказы|рекапитуляция)(?:$|[^\p{L}])|総集編|краткое содержание|итоги сезона/iu.test(t)))return 'Рекап или краткий пересказ';
 const description=String(a.description||'').replace(/<[^>]*>|\[[^\]]*\]/g,'').trim();
 if(/^(?:(?:это|данный (?:эпизод|спецвыпуск)|спецвыпуск|фильм)\s*[-—:]?\s*)?(?:рекап|краткий пересказ|краткое содержание|пересказ|компиляция|recap|summary|compilation)(?:\s|[.,:])/iu.test(description))return 'Рекап или краткий пересказ';
 return '';
}
export function assertAnimeContent(a){const reason=nonAnimeReason(a);if(reason)throw policyError('ANIME_FILTERED',reason);}
