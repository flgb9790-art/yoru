import {validatePlayerUrl} from './kodik.js';

export function kodikHasPlayer(row){
 if(!Number.isSafeInteger(Number(row.shikimori_id))||Number(row.shikimori_id)<1||row.blocked_seasons==='all')return false;
 try{validatePlayerUrl(row.link);}catch{return false;}
 return row.type==='anime'||Number(row.episodes_count)>0||Number(row.last_episode)>0;
}

// Call inside the source scanner's transaction, after its last page was validated.
export async function publishPlayerCatalogue(db,provider,ids){
 await db.query('DELETE FROM player_catalogue WHERE provider=$1',[provider]);
 const values=[...new Set(ids)];
 for(let offset=0;offset<values.length;offset+=500){const batch=values.slice(offset,offset+500),params=[provider,...batch];await db.query('INSERT INTO player_catalogue(provider,shikimori_id) VALUES '+batch.map((_,i)=>'($1,$'+(i+2)+')').join(','),params);}
 await db.query('UPDATE player_catalogue_state SET checked_at=NOW() WHERE provider=$1',[provider]);
}

// Before BOTH first full scans finish, keep the existing catalogue visible. API failures
// keep the previous published snapshot. New confirmed streams can appear between scans.
export const playerCatalogueVisibility=`(
 NOT EXISTS(SELECT 1 FROM player_catalogue_state WHERE provider='kodik' AND checked_at IS NOT NULL)
 OR NOT EXISTS(SELECT 1 FROM player_catalogue_state WHERE provider='aniliberty' AND checked_at IS NOT NULL)
 OR shikimori_id IN (SELECT shikimori_id FROM player_catalogue)
 OR id IN (SELECT anime_id FROM player_sources WHERE available=TRUE AND checked_at>(SELECT checked_at FROM player_catalogue_state WHERE provider='kodik'))
 OR id IN (SELECT anime_id FROM aniliberty_availability WHERE available=TRUE AND checked_at>(SELECT checked_at FROM player_catalogue_state WHERE provider='aniliberty'))
 OR id IN (SELECT anime_id FROM episode_releases WHERE available=TRUE AND provider='kodik' AND last_seen_at>(SELECT checked_at FROM player_catalogue_state WHERE provider='kodik'))
 OR id IN (SELECT anime_id FROM episode_releases WHERE available=TRUE AND provider='aniliberty' AND last_seen_at>(SELECT checked_at FROM player_catalogue_state WHERE provider='aniliberty'))
)`;
