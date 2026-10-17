import pg from 'pg';
import { readFile } from 'node:fs/promises';
export function database(url=process.env.DATABASE_URL){
 if(!url)throw new Error('DATABASE_URL is required');
 return new pg.Pool({connectionString:url,max:8,connectionTimeoutMillis:15000});
}
export async function migrate(db){await db.query(await readFile(new URL('../migrations/001_initial.sql',import.meta.url),'utf8'));}
