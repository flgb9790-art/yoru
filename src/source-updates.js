import {randomUUID} from 'node:crypto';
export async function observeEpisodes(db,anime,provider,episode,{now=new Date()}={}){
 if(!['shikimori','kodik'].includes(provider)||!Number.isInteger(episode)||episode<0||episode>100000)return false;
 const client=await db.connect();try{await client.query('BEGIN');const current=(await client.query('SELECT id,blocked,status FROM anime WHERE id=$1 FOR UPDATE',[anime.id])).rows[0];if(!current){await client.query('COMMIT');return false;}const previous=(await client.query('SELECT episode FROM episode_observations WHERE anime_id=$1 AND provider=$2',[anime.id,provider])).rows[0];
 if(!previous){await client.query('INSERT INTO episode_observations(anime_id,provider,episode) VALUES($1,$2,$3)',[anime.id,provider,episode]);await client.query('COMMIT');return false;}
 if(episode<=previous.episode){await client.query('COMMIT');return false;}
 await client.query('UPDATE episode_observations SET episode=$1 WHERE anime_id=$2 AND provider=$3',[episode,anime.id,provider]);
 if(!current.blocked){await client.query('INSERT INTO source_updates(anime_id,provider,episode,observed_at) VALUES($1,$2,$3,$4) ON CONFLICT(anime_id,provider) DO UPDATE SET episode=$3,observed_at=$4',[anime.id,provider,episode,now]);if(current.status==='ongoing'){const follows=(await client.query('SELECT user_id FROM anime_follows WHERE anime_id=$1',[anime.id])).rows;for(const f of follows)await client.query('INSERT INTO notifications(id,user_id,anime_id,season,episode,release_id,provider) VALUES($1,$2,$3,1,$4,NULL,$5) ON CONFLICT(user_id,anime_id,season,episode) DO NOTHING',[randomUUID(),f.user_id,anime.id,episode,provider]);}}
 await client.query('COMMIT');return true;
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
