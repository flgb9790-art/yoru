import {fetchAnime,saveImported} from './shikimori.js';
import {isImportSkip} from './import-policy.js';

export const ageDescriptions={g:'Для всех возрастов',pg:'Рекомендуется присутствие родителей',pg_13:'13+ · Для подростков от 13 лет',r:'17+ · Для зрителей от 17 лет, сцены насилия',r_plus:'18+ · Для взрослых, возможна нагота',rx:'18+ · Только для взрослых, откровенные сцены'};
export function animeDetails(a){const m=a.metadata||{};return [['Автор',(m.authors||[]).join(', ')],['Режиссёр',(m.directors||[]).join(', ')],['Страна',a.country==='Не определена'?'':a.country],['Возраст',ageDescriptions[m.age_rating]||''],['Год',a.year],['Жанры',(a.genres||[]).join(', ')],['Время',m.duration?m.duration+' мин.':''],['Студия',(m.studios||[]).join(', ')]].filter(([,value])=>String(value||'').trim());}
export function missingMetadata(a){const m=a.metadata||{},protectedFields=new Set(a.protected_fields||[]);return [
 ['country',!a.country||a.country==='Не определена'],['year',!a.year],['genres',!a.genres?.length],
 ['metadata.authors',!m.authors?.length],['metadata.directors',!m.directors?.length],['metadata.studios',!m.studios?.length],['metadata.duration',!m.duration],['metadata.age_rating',!ageDescriptions[m.age_rating]],
 ].filter(([key,missing])=>missing&&!protectedFields.has(key)&&!(key.startsWith('metadata.')&&protectedFields.has('metadata'))).map(([key])=>key);}
export async function repairMetadata(db,{importer=fetchAnime,now=new Date()}={}){
 const rows=(await db.query('SELECT * FROM anime WHERE blocked=FALSE AND shikimori_id IS NOT NULL ORDER BY synced_at NULLS FIRST,id')).rows;
 const a=rows.find(row=>missingMetadata(row).length&&(!row.metadata?.details_retry_at||now-Date.parse(row.metadata.details_retry_at)>=86400000));if(!a)return false;
 // Claim before network I/O. Missing source fields are retried daily, not on every page view.
 const metadata={...a.metadata,details_retry_at:now.toISOString()};
 const claim=await db.query('UPDATE anime SET metadata=$1 WHERE id=$2 AND metadata=$3 RETURNING id',[JSON.stringify(metadata),a.id,JSON.stringify(a.metadata)]);if(!claim.rowCount)return false;
 try{const item=await importer(a.shikimori_id);if(Number(item.shikimori_id)!==a.shikimori_id)throw Error('Источник вернул другой ID');item.metadata={...item.metadata,details_retry_at:now.toISOString()};await saveImported(db,item);}catch(error){if(!isImportSkip(error))console.error(JSON.stringify({event:'metadata_repair_retry',id:a.id}));}
 return true;
}
export function startMetadataRepair(db){let busy=false,stopped=false;const tick=async()=>{if(busy||stopped)return;busy=true;try{await repairMetadata(db);}catch{console.error(JSON.stringify({event:'metadata_repair_error'}));}finally{busy=false;}};const timer=setInterval(tick,60000);timer.unref();tick();return()=>{stopped=true;clearInterval(timer);};}
