import catalogue from './catalog-media.json' with {type:'json'};
import featured from './hero-media.json' with {type:'json'};
const records=new Map([...catalogue,...featured].map(item=>[Number(item.shikimori_id),item]));
export function catalogMediaFor(anime){const item=records.get(Number(anime.shikimori_id));if(!item||item.year&&anime.year&&Number(item.year)!==Number(anime.year))return {logo:'',video:''};return {logo:item.logo||'',video:item.video||''};}
