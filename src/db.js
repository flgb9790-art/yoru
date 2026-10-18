import {removeUnreleased} from './catalog-policy.js';
import pg from 'pg';
import { readFile } from 'node:fs/promises';
export function database(url=process.env.DATABASE_URL){
 if(!url)throw new Error('DATABASE_URL is required');
 return new pg.Pool({connectionString:url,max:8,connectionTimeoutMillis:15000});
}
export async function migrate(db){for(const file of ['001_initial.sql','002_telegram.sql','003_playback.sql','004_aniliberty.sql','005_episode_feed.sql','006_follows.sql','007_manual_progress.sql','008_autoparse.sql','009_parser_visibility.sql','010_design_editor.sql','011_disable_design_editor.sql'])await db.query(await readFile(new URL('../migrations/'+file,import.meta.url),'utf8'));await removeUnreleased(db);}
