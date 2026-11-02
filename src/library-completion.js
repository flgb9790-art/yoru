// Episode numbers belong to this title; season zero contains provider specials.
export function completedTitle(anime,numbers){
 const total=Number(anime.episodes)||Number(anime.aired)||0;
 const finished=anime.status==='released'||anime.status!=='anons'&&Number(anime.episodes)>0&&Number(anime.aired)>=Number(anime.episodes);
 if(!finished||!Number.isInteger(total)||total<1)return false;
 for(let n=1;n<=total;n++)if(!numbers.has(n))return false;
 return true;
}
export async function promoteCompletedLibrary(db,userId){
 const rows=(await db.query('SELECT h.anime_id,h.episode,a.status,a.episodes,a.aired FROM watch_history h JOIN anime a ON a.id=h.anime_id WHERE h.user_id=$1 AND h.completed=TRUE AND h.season>0',[userId])).rows;
 const titles=new Map();for(const row of rows){if(!titles.has(row.anime_id))titles.set(row.anime_id,{anime:row,numbers:new Set()});titles.get(row.anime_id).numbers.add(Number(row.episode));}
 const ids=[...titles].filter(([,value])=>completedTitle(value.anime,value.numbers)).map(([id])=>id);
 for(let offset=0;offset<ids.length;offset+=100){const values=[userId],tuples=ids.slice(offset,offset+100).map(id=>{values.push(id);return `($1,$${values.length},'completed')`;});await db.query(`INSERT INTO library(user_id,anime_id,status) VALUES ${tuples.join(',')} ON CONFLICT(user_id,anime_id) DO UPDATE SET status='completed' WHERE library.status<>'completed'`,values);}
 return ids.length;
}
