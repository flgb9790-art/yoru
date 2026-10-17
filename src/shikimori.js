import {assertAired} from './catalog-policy.js';
import {randomUUID} from 'node:crypto';
let nextRequest=0;
let queue=Promise.resolve();
export function shikiRequest(path,fetcher=fetch,body){
 const run=async()=>{
  const delay=Math.max(0,nextRequest-Date.now());if(delay)await new Promise(r=>setTimeout(r,delay));
  nextRequest=Date.now()+1200;
  const base=process.env.SHIKIMORI_BASE_URL||'https://shikimori.one';
  const response=await fetcher(new URL(path,base),{...(body?{method:'POST',body:JSON.stringify(body)}:{}),headers:{...(body?{'Content-Type':'application/json'}:{}),'User-Agent':process.env.SHIKIMORI_USER_AGENT||'Yoru/0.1',Accept:'application/json',...(process.env.SHIKIMORI_TOKEN?{Authorization:`Bearer ${process.env.SHIKIMORI_TOKEN}`}:{})},signal:AbortSignal.timeout(20000)});
  if(!response.ok){const error=new Error(`Shikimori returned ${response.status}`);error.status=502;error.upstreamStatus=response.status;throw error;}
  return response.json();
 };const result=queue.then(run);queue=result.catch(()=>{});return result;
}
export function plainDescription(value=''){return String(value).replace(/\[.*?\]/g,'').replace(/<[^>]*>/g,'').trim();}
export function normalizeAnime(raw,roles=[],screenshots=[],related=[]){
 const names=role=>roles.filter(r=>r.roles?.includes(role)||r.roles_russian?.includes(role)).map(r=>r.person?.russian||r.person?.name).filter(Boolean);
 const base=process.env.SHIKIMORI_BASE_URL||'https://shikimori.one';
 const absolute=v=>v?new URL(v,base).href:'';
 return {shikimori_id:raw.id,name:raw.russian||raw.name,original_name:raw.name||'',year:raw.aired_on?Number(raw.aired_on.slice(0,4)):null,
 country:'Япония',kind:raw.kind||'tv',status:raw.status||'anons',rating:Number(raw.score)||0,
 episodes:Number(raw.episodes)||0,aired:raw.status==='released'?(Number(raw.episodes)||Number(raw.episodes_aired)||0):(Number(raw.episodes_aired)||0),genres:(raw.genres||[]).map(g=>g.russian||g.name),description:plainDescription(raw.description||''),poster:absolute(raw.image?.original),
 metadata:{duration:raw.duration||0,studios:(raw.studios||[]).map(s=>s.name),authors:names('Original Creator'),directors:names('Director'),
 screenshots:screenshots.map(s=>absolute(s.original)),related:related.filter(r=>r.anime).map(r=>({id:r.anime.id,name:r.anime.russian||r.anime.name,relation:r.relation_russian||r.relation})),airDate:raw.aired_on,endDate:raw.released_on,nextEpisode:raw.next_episode_at||null,source:base}};
}
export async function fetchAnime(id){
 if(!Number.isSafeInteger(+id)||+id<1)throw Object.assign(new Error('Некорректный Shikimori ID'),{status:400});
 const anime=await shikiRequest(`/api/animes/${id}`);
 const roles=await shikiRequest(`/api/animes/${id}/roles`);
 const screenshots=await shikiRequest(`/api/animes/${id}/screenshots`);
 const related=await shikiRequest(`/api/animes/${id}/related`);
 const result=normalizeAnime(anime,roles,screenshots,related);
 const extra=await shikiRequest('/api/graphql',fetch,{query:'{ animes(ids: "'+id+'", limit: 1) { id genres { name russian } nextEpisodeAt poster { originalUrl } chronology { id name russian kind airedOn { date } } } }'});
 if(extra.errors?.length)throw new Error('Shikimori GraphQL: '+extra.errors[0].message);
 const enriched=extra.data?.animes?.[0];if(enriched){if(Array.isArray(enriched.genres)&&enriched.genres.length)result.genres=[...new Set(enriched.genres.map(g=>g.russian||g.name).filter(Boolean))];result.metadata.nextEpisode=enriched.nextEpisodeAt||null;result.metadata.chronology=(enriched.chronology||[]).filter(a=>!['music','pv','cm'].includes(a.kind)).map(a=>({id:Number(a.id),name:a.russian||a.name,date:a.airedOn?.date||null})).sort((a,b)=>(a.date||'9999').localeCompare(b.date||'9999'));if(enriched.poster?.originalUrl)result.poster=enriched.poster.originalUrl;}
 return result;
}
export async function saveImported(db,item){
 assertAired(item);
 const existing=(await db.query('SELECT * FROM anime WHERE shikimori_id=$1',[item.shikimori_id])).rows[0];
 if(existing){const protectedSet=new Set(existing.protected_fields||[]);const merged={...existing,...Object.fromEntries(Object.entries(item).filter(([k])=>!protectedSet.has(k)))};if(!protectedSet.has('metadata')){merged.metadata={...existing.metadata,...item.metadata};for(const key of protectedSet)if(key.startsWith('metadata.'))merged.metadata[key.slice(9)]=existing.metadata[key.slice(9)];}
  if(!item.genres?.length&&existing.genres?.length)merged.genres=existing.genres;
  if(!protectedSet.has('poster')&&existing.metadata?.poster_source==='myanimelist-via-jikan'&&existing.poster)merged.poster=existing.poster;
  await db.query('UPDATE anime SET name=$1,original_name=$2,year=$3,country=$4,kind=$5,status=$6,rating=$7,episodes=$8,aired=$9,genres=$10,description=$11,poster=$12,metadata=$13,updated_at=CASE WHEN aired<>$9 OR status<>$6 THEN NOW() ELSE updated_at END,synced_at=NOW() WHERE id=$14',[merged.name,merged.original_name,merged.year,merged.country,merged.kind,merged.status,merged.rating,merged.episodes,merged.aired,merged.genres,merged.description,merged.poster,JSON.stringify(merged.metadata),existing.id]);return existing.id;
 }
 const id=randomUUID();await db.query('INSERT INTO anime(id,shikimori_id,name,original_name,year,country,kind,status,rating,episodes,aired,genres,description,poster,metadata,synced_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW()) ON CONFLICT(shikimori_id) DO NOTHING',[id,item.shikimori_id,item.name,item.original_name,item.year,item.country,item.kind,item.status,item.rating,item.episodes,item.aired,item.genres,item.description,item.poster,JSON.stringify(item.metadata)]);return (await db.query('SELECT id FROM anime WHERE shikimori_id=$1',[item.shikimori_id])).rows[0].id;
}
