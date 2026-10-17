import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {database,migrate} from './db.js';
import {fetchAnime,saveImported,shikiRequest} from './shikimori.js';
import {syncEpisodeFeed,enqueueEpisodeSync} from './episode-feed.js';
export async function runJob(db,importer=fetchAnime,{episodeSync=syncEpisodeFeed}={}){
 const job=(await db.query("SELECT * FROM jobs WHERE status='pending' AND run_at<=NOW() ORDER BY CASE WHEN kind='episodes' THEN 0 ELSE 1 END,created_at LIMIT 1")).rows[0];if(!job)return false;
 const claimed=await db.query("UPDATE jobs SET status='running',attempts=attempts+1,locked_at=NOW() WHERE id=$1 AND status='pending' RETURNING *",[job.id]);if(!claimed.rowCount)return false;
 try{if(job.kind==='episodes'){
   const result=await episodeSync(db,{limit:job.payload.limit||40,importer});
   await db.query('UPDATE jobs SET result=$1 WHERE id=$2',[JSON.stringify(result),job.id]);
   if(result.errors?.length)throw new Error('Не обновлено релизов: '+result.errors.length+'. Успешные результаты сохранены; повтор не создаст дубли.');
  }else if(job.kind==='discover'){
   const status=['ongoing','released'].includes(job.payload.status)?'&status='+job.payload.status:'';
   const list=await shikiRequest('/api/animes?limit=20&order='+(['ranked','aired_on'].includes(job.payload.order)?job.payload.order:'ranked')+status+'&page='+Math.max(1,Number(job.payload.page)||1));
   for(const item of list){if(!Number.isSafeInteger(item.id))continue;const existing=(await db.query('SELECT id FROM anime WHERE shikimori_id=$1',[item.id])).rowCount;if(!existing)await enqueueImport(db,item.id);}
  }else{const item=await importer(job.payload.id);await saveImported(db,item);}
  await db.query("UPDATE jobs SET status='done',error='' WHERE id=$1",[job.id]);}
 catch(error){const attempt=claimed.rows[0].attempts;await db.query('UPDATE jobs SET status=$1,error=$2,run_at=$3 WHERE id=$4',[attempt<3?'pending':'failed',error.message.slice(0,500),new Date(Date.now()+attempt*60000),job.id]);}
 return true;
}
export async function enqueueImport(db,id){const exists=await db.query("SELECT id FROM jobs WHERE kind='import' AND status IN ('pending','running') AND payload->>'id'=$1",[String(id)]);if(!exists.rowCount)await db.query('INSERT INTO jobs(id,kind,payload) VALUES($1,$2,$3)',[randomUUID(),'import',JSON.stringify({id})]);}
export async function scheduleSync(db){
 for(const status of ['ongoing','released']){
  const recent=await db.query("SELECT id FROM jobs WHERE kind='discover' AND created_at > NOW() - INTERVAL '24 hours' AND payload->>'status'=$1",[status]);
  if(!recent.rowCount)await db.query('INSERT INTO jobs(id,kind,payload) VALUES($1,$2,$3)',[randomUUID(),'discover',JSON.stringify({page:1,order:'aired_on',status})]);
 }
 const rows=(await db.query("SELECT shikimori_id FROM anime WHERE shikimori_id IS NOT NULL AND (synced_at IS NULL OR synced_at < NOW() - INTERVAL '6 hours') ORDER BY synced_at NULLS FIRST LIMIT 20")).rows;
 for(const row of rows)await enqueueImport(db,row.shikimori_id);
}
export async function cleanupExpired(db){for(const table of ['sessions','oauth_flows','email_tokens'])await db.query('DELETE FROM '+table+' WHERE expires_at<NOW()');}
export function startWorker(db){let stopped=false,busy=false,lastSchedule=0,lastEpisodeSchedule=0,lastCleanup=0;const tick=async()=>{if(stopped||busy)return;busy=true;try{if(Date.now()-lastCleanup>3600000){await cleanupExpired(db);lastCleanup=Date.now();}if(process.env.AUTO_SYNC==='true'){if(Date.now()-lastEpisodeSchedule>60000){await enqueueEpisodeSync(db);lastEpisodeSchedule=Date.now();}if(Date.now()-lastSchedule>3600000){await scheduleSync(db);lastSchedule=Date.now();}}await runJob(db);}catch(error){console.error(JSON.stringify({event:'worker_error',message:error.message}));}finally{busy=false;}};const timer=setInterval(tick,5000);timer.unref();tick();return ()=>{stopped=true;clearInterval(timer);};}
if(process.argv[1]===fileURLToPath(import.meta.url)){const db=database();await migrate(db);startWorker(db);setInterval(()=>{},3600000);}
