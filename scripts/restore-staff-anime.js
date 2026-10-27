import {randomUUID} from 'node:crypto';
import {database} from '../src/db.js';
import {staffOnlyGenre} from '../src/anime-access.js';
const value=process.argv.find(a=>a.startsWith('--shikimori-id='))?.split('=')[1],shiki=Number(value),apply=process.argv.includes('--apply');
if(!Number.isSafeInteger(shiki)||shiki<1)throw Error('Use --shikimori-id=<id> [--apply]');
const db=database();let client;
try{
 client=await db.connect();await client.query('BEGIN');
 await client.query('INSERT INTO anime_import_locks(shikimori_id) VALUES($1) ON CONFLICT(shikimori_id) DO NOTHING',[shiki]);await client.query('SELECT shikimori_id FROM anime_import_locks WHERE shikimori_id=$1 FOR UPDATE',[shiki]);
 const existing=(await client.query('SELECT id,name,metadata FROM anime WHERE shikimori_id=$1',[shiki])).rows[0];if(existing)throw Error('Title already exists; refusing to overwrite.');
 const archive=(await client.query("SELECT id,snapshot,reason FROM deleted_anime WHERE shikimori_id=$1 OR snapshot->'anime'->>'shikimori_id'=$2 ORDER BY created_at DESC LIMIT 1",[shiki,String(shiki)])).rows[0];
 if(!archive?.snapshot?.anime)throw Error('No archived title found.');
 const anime=archive.snapshot.anime;if(!anime.genres?.some(staffOnlyGenre))throw Error('This script only restores staff-only genres.');
 anime.metadata={...anime.metadata,manual_staff_anime:true,age_rating:['r_plus','rx'].includes(anime.metadata?.age_rating)?anime.metadata.age_rating:'r_plus'};anime.protected_fields=[...new Set([...(anime.protected_fields||[]),'genres','metadata.manual_staff_anime','metadata.age_rating'])];anime.updated_at=new Date().toISOString();
 const report={apply,id:anime.id,shikimoriId:shiki,title:anime.name,genres:anime.genres,previousReason:archive.reason,staffOnly:true};
 if(apply){await client.query('INSERT INTO anime SELECT (jsonb_populate_record(NULL::anime,$1::jsonb)).*',[JSON.stringify(anime)]);await client.query('UPDATE deleted_anime SET shikimori_id=NULL WHERE shikimori_id=$1',[shiki]);await client.query('INSERT INTO audit(id,user_id,action,entity_id) VALUES($1,NULL,$2,$3)',[randomUUID(),'anime:restore:manual-staff',anime.id]);await client.query('COMMIT');}else await client.query('ROLLBACK');
 console.log(JSON.stringify(report));
}catch(error){if(client)await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client?.release();await db.end();}
