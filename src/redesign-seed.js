import fs from 'node:fs/promises';
export async function seedRedesign(db){
 if(process.env.REDESIGN_SEED!=='true')return;
 const data=JSON.parse(await fs.readFile('/app/redesign-seed-data.json','utf8')),client=await db.connect();
 try{await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(781836)');{for(const table of ['users','anime','source_updates','episode_releases','episode_feed_titles','player_catalogue','player_sources','aniliberty_availability'])for(const row of data[table]||[]){const cols=Object.keys(row);await client.query(`INSERT INTO ${table} (${cols.map(c=>'"'+c+'"').join(',')}) VALUES (${cols.map((_,i)=>'$'+(i+1)).join(',')}) ON CONFLICT DO NOTHING`,cols.map(c=>row[c]&&typeof row[c]==='object'&&!Array.isArray(row[c])?JSON.stringify(row[c]):row[c]));}}await client.query('COMMIT');console.log('Redesign snapshot initialized');}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}
