export async function repairGenres(db,request){
 const rows=(await db.query('SELECT * FROM anime WHERE shikimori_id IS NOT NULL ORDER BY synced_at NULLS FIRST,id')).rows.filter(a=>!a.genres?.length&&!a.protected_fields.includes('genres')&&(!a.metadata?.genres_checked_at||Date.parse(a.metadata.genres_checked_at)<Date.now()-86400000)).slice(0,50);
 if(!rows.length)return 0;
 const ids=rows.map(a=>a.shikimori_id).filter(Number.isSafeInteger);
 const data=await request('/api/graphql',fetch,{query:'{ animes(ids: "'+ids.join(',')+'", limit: 50) { id genres { name russian } } }'});
 if(data.errors?.length)throw Error('Shikimori genres unavailable');
 let updated=0;
 for(const item of data.data?.animes||[]){if(!ids.includes(Number(item.id))||!Array.isArray(item.genres))continue;const client=await db.connect();try{await client.query('BEGIN');const a=(await client.query('SELECT * FROM anime WHERE shikimori_id=$1 FOR UPDATE',[Number(item.id)])).rows[0];if(a&&!a.genres?.length&&!a.protected_fields.includes('genres')){const genres=[...new Set(item.genres.map(g=>g.russian||g.name).filter(Boolean))];await client.query('UPDATE anime SET genres=$1,metadata=$2 WHERE id=$3',[genres,JSON.stringify({...a.metadata,genres_checked_at:new Date().toISOString()}),a.id]);if(genres.length)updated++;}await client.query('COMMIT');}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}}
 return updated;
}
