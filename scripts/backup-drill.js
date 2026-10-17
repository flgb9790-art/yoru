import {randomBytes,createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import pg from 'pg';
import {fileURLToPath} from 'node:url';
const quote=v=>'"'+String(v).replaceAll('"','""')+'"';
const literal=v=>"'"+String(v).replaceAll("'","''")+"'";
const shell=v=>"'"+String(v).replaceAll("'","'\\''")+"'";
const fingerprint=async client=>{
 await client.query("SET TIME ZONE 'UTC'");
 const tables=(await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;
 const result={};for(const {tablename}of tables){const row=(await client.query(`SELECT COUNT(*)::text AS count,md5(COALESCE(string_agg(hash,'' ORDER BY hash),'')) AS digest FROM (SELECT md5(row_to_json(t)::text) AS hash FROM public.${quote(tablename)} t) rows`)).rows[0];result[tablename]=row;}
 const columns=(await client.query("SELECT table_name,column_name,ordinal_position,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position")).rows;
 const indexes=(await client.query("SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename,indexname")).rows;
 const constraints=(await client.query("SELECT c.relname,p.conname,pg_get_constraintdef(p.oid) AS definition FROM pg_constraint p JOIN pg_class c ON c.oid=p.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' ORDER BY c.relname,p.conname")).rows;
 return {tables:result,schemaSha256:createHash('sha256').update(JSON.stringify({columns,indexes,constraints})).digest('hex')};
};
export function assertScratchName(name,source){if(!/^yoru_restore_[a-f0-9]{24}$/.test(name)||name===source)throw Error('Unsafe recovery database name');return name;}
export async function snapshot(file,{connectionString=process.env.DATABASE_URL}={}){
 const client=new pg.Client({connectionString}),nonce=randomBytes(12).toString('hex'),remote='/tmp/yoru_backup_'+nonce+'.dump';await client.connect();
 try{
  const info=(await client.query("SELECT current_database() AS database,current_user AS username,(SELECT rolsuper FROM pg_roles WHERE rolname=current_user) AS admin")).rows[0];if(!info.admin)throw Error('This Railway drill requires a PostgreSQL admin connection');
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const exported=(await client.query('SELECT pg_export_snapshot() AS snapshot')).rows[0].snapshot;
  const manifest={version:1,createdAt:new Date().toISOString(),...await fingerprint(client)};
  const command=`pg_dump -U ${shell(info.username)} -d ${shell(info.database)} --format=custom --no-owner --no-acl --lock-wait-timeout=30s --snapshot=${shell(exported)} --file=${shell(remote)}`;
  await client.query(`COPY (SELECT '') TO PROGRAM ${literal(command)}`);
  const bytes=(await client.query('SELECT pg_read_binary_file($1) AS bytes',[remote])).rows[0].bytes;
  if(!bytes.subarray(0,5).equals(Buffer.from('PGDMP')))throw Error('Invalid dump signature');
  manifest.bytes=bytes.length;manifest.sha256=createHash('sha256').update(bytes).digest('hex');
  await mkdir(dirname(resolve(file)),{recursive:true});await writeFile(file,bytes,{flag:'wx'});await writeFile(file+'.manifest.json',JSON.stringify(manifest,null,2),{flag:'wx'});
  await client.query('COMMIT');console.log(JSON.stringify({event:'snapshot_saved',tables:Object.keys(manifest.tables).length,bytes:bytes.length}));
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{await client.query(`COPY (SELECT '') TO PROGRAM ${literal('rm -f '+shell(remote))}`).catch(()=>{});await client.end();}
}
export async function verify(file,{connectionString=process.env.DATABASE_URL}={}){
 const bytes=await readFile(file),manifest=JSON.parse(await readFile(file+'.manifest.json','utf8'));
 if(!bytes.subarray(0,5).equals(Buffer.from('PGDMP'))||bytes.length!==manifest.bytes||createHash('sha256').update(bytes).digest('hex')!==manifest.sha256)throw Error('Backup checksum mismatch');
 const client=new pg.Client({connectionString}),scratch='yoru_restore_'+randomBytes(12).toString('hex'),remote='/tmp/'+scratch+'.dump';let created=false,target;await client.connect();
 try{
  const info=(await client.query('SELECT current_database() AS database,current_user AS username')).rows[0];assertScratchName(scratch,info.database);
  await client.query('CREATE DATABASE '+quote(scratch)+' TEMPLATE template0');created=true;
  // Stream chunks through COPY into a newly generated temp file, never a production path.
  for(let offset=0;offset<bytes.length;offset+=750000){const chunk=bytes.subarray(offset,offset+750000).toString('base64');await client.query(`COPY (SELECT ${literal(chunk)}) TO PROGRAM ${literal('base64 -d '+(offset?'>> ':'> ')+shell(remote))}`);}
  await client.query(`COPY (SELECT '') TO PROGRAM ${literal(`pg_restore -U ${shell(info.username)} --dbname=${shell(scratch)} --no-owner --no-acl --exit-on-error --single-transaction ${shell(remote)}`)}`);
  const url=new URL(connectionString);url.pathname='/'+scratch;target=new pg.Client({connectionString:url.href});await target.connect();
  const restored=await fingerprint(target);
  if(JSON.stringify(restored.tables)!==JSON.stringify(manifest.tables)||restored.schemaSha256!==manifest.schemaSha256)throw Error('Restored tables or schema differ from the exported snapshot');
  // Run real route rendering on the recovered copy; no worker/importer is started.
  const {createApp}=await import('../src/app.js'),{episodeFeed}=await import('../src/episode-feed.js');
  const feed=await episodeFeed(target,20);const server=createApp(target).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  try{for(const path of ['/health','/','/catalog','/new-episodes']){const response=await fetch('http://127.0.0.1:'+server.address().port+path);await response.text();if(response.status!==200)throw Error('Recovered route failed: '+path);}}finally{await new Promise(r=>server.close(r));}
  const report={event:'restore_verified',createdAt:new Date().toISOString(),sha256:manifest.sha256,tableCount:Object.keys(restored.tables).length,counts:Object.fromEntries(Object.entries(restored.tables).map(([k,v])=>[k,+v.count])),feedTitles:feed.total,schemaMatched:true,allTableHashesMatched:true};
  await writeFile(file+'.verified.json',JSON.stringify(report,null,2));console.log(JSON.stringify({event:report.event,tables:report.tableCount,feedTitles:report.feedTitles,schemaMatched:true,allTableHashesMatched:true}));
 }finally{if(target)await target.end();if(created){assertScratchName(scratch,(await client.query('SELECT current_database() AS name')).rows[0].name);await client.query('DROP DATABASE '+quote(scratch));}await client.query(`COPY (SELECT '') TO PROGRAM ${literal('rm -f '+shell(remote))}`).catch(()=>{});await client.end();}
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(fileURLToPath(import.meta.url))){const [mode,file]=process.argv.slice(2);try{if(!file||!['snapshot','verify'].includes(mode))throw Error('Usage: node --env-file=.env scripts/backup-drill.js snapshot|verify backups/name.dump');await (mode==='snapshot'?snapshot:verify)(file);}catch(error){console.error('Backup operation failed ('+(error.code||error.name)+'). Inspect locally without exposing credentials.');process.exitCode=1;}}
