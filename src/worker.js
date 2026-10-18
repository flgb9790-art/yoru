import {purgeChatImages} from './chat-images.js';
import {purgeClosedAppeals} from './legal.js';
import {isImportSkip} from './import-policy.js';
import {workerPulse} from './task-status.js';
import {getConfig,queueImport,scheduleAuto,runAutoTask,importTracked} from './autoparse.js';
import {syncKodikUpdates} from './kodik-feed.js';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {database,migrate} from './db.js';
import {fetchAnime,shikiRequest} from './shikimori.js';
import {syncEpisodeFeed} from './episode-feed.js';
export async function runJob(db,importer=fetchAnime,{episodeSync=syncEpisodeFeed}={}){
 const config=await getConfig(db);const paused=config.enabled?'':" AND kind NOT LIKE 'auto_%' AND (payload->>'auto' IS NULL OR payload->>'auto'<>'true')";
 const job=(await db.query("SELECT * FROM jobs WHERE status='pending' AND run_at<=NOW()"+paused+" ORDER BY CASE WHEN kind='episodes' THEN 0 WHEN kind='auto_refresh' THEN 1 WHEN kind='auto_kodik' THEN 1 WHEN kind='auto_posters' THEN 2 WHEN kind='import' THEN 3 ELSE 4 END,created_at LIMIT 1")).rows[0];if(!job)return false;
 const claimed=await db.query("UPDATE jobs SET status='running',attempts=attempts+1,locked_at=NOW() WHERE id=$1 AND status='pending' RETURNING *",[job.id]);if(!claimed.rowCount)return false;
 const taskName=job.kind==='episodes'?'episodes':job.kind.startsWith('auto_')?job.kind.slice(5):null;
 if(taskName)await db.query('UPDATE auto_tasks SET started_at=NOW(),finished_at=NULL,heartbeat_at=NOW() WHERE name=$1',[taskName]);
 await workerPulse(db,job.kind);const pulse=setInterval(()=>{Promise.all([workerPulse(db,job.kind),...(taskName?[db.query('UPDATE auto_tasks SET heartbeat_at=NOW() WHERE name=$1',[taskName])]:[])]).catch(()=>{});},10000);pulse.unref();
 try{if(job.kind.startsWith('auto_')){const result=await runAutoTask(db,job.kind.slice(5),{importer,kodikSync:syncKodikUpdates});await db.query('UPDATE jobs SET result=$1 WHERE id=$2',[JSON.stringify(result),job.id]);}else if(job.kind==='episodes'){
   const result=await episodeSync(db,{limit:job.payload.limit||40,importer});
   await db.query('UPDATE jobs SET result=$1 WHERE id=$2',[JSON.stringify(result),job.id]);
   if(result.errors?.length)throw new Error('Не обновлено релизов: '+result.errors.length+'. Успешные результаты сохранены; повтор не создаст дубли.');
  }else if(job.kind==='discover'){
   const status=['ongoing','released'].includes(job.payload.status)?'&status='+job.payload.status:'';
   const list=await shikiRequest('/api/animes?limit=20&order='+(['ranked','aired_on'].includes(job.payload.order)?job.payload.order:'ranked')+status+'&page='+Math.max(1,Number(job.payload.page)||1));
   for(const item of list){if(!Number.isSafeInteger(item.id))continue;const existing=(await db.query('SELECT id FROM anime WHERE shikimori_id=$1',[item.id])).rowCount;if(!existing)await queueImport(db,item.id,{auto:true});}
  }else{const config=await getConfig(db);await importTracked(db,job.payload.id,importer,{track:config.shikimori,selection:job.payload.auto?config:null});}
  await db.query("UPDATE jobs SET status='done',error='' WHERE id=$1",[job.id]);await db.query('DELETE FROM auto_job_keys WHERE job_id=$1',[job.id]);await db.query('UPDATE jobs SET finished_at=NOW() WHERE id=$1',[job.id]);}
 catch(error){if(isImportSkip(error)){await db.query("UPDATE jobs SET status='done',result=$1,finished_at=NOW(),error='' WHERE id=$2",[JSON.stringify({skipped:true,reason:error.message}),job.id]);await db.query('DELETE FROM auto_job_keys WHERE job_id=$1',[job.id]);}else{const attempt=claimed.rows[0].attempts;await db.query('UPDATE jobs SET status=$1,error=$2,run_at=$3 WHERE id=$4',[attempt<3?'pending':'failed',error.message.slice(0,500),new Date(Date.now()+attempt*60000),job.id]);if(attempt>=3)await db.query('DELETE FROM auto_job_keys WHERE job_id=$1',[job.id]);}}finally{clearInterval(pulse);if(taskName)await db.query('UPDATE auto_tasks SET finished_at=NOW(),heartbeat_at=NOW() WHERE name=$1',[taskName]);await workerPulse(db);}
 return true;
}
export async function enqueueImport(db,id){return queueImport(db,id);}
export async function scheduleSync(db){
 for(const status of ['ongoing','released']){
  const recent=await db.query("SELECT id FROM jobs WHERE kind='discover' AND created_at > NOW() - INTERVAL '24 hours' AND payload->>'status'=$1",[status]);
  if(!recent.rowCount)await db.query('INSERT INTO jobs(id,kind,payload) VALUES($1,$2,$3)',[randomUUID(),'discover',JSON.stringify({page:1,order:'aired_on',status})]);
 }
 const rows=(await db.query("SELECT shikimori_id FROM anime WHERE shikimori_id IS NOT NULL AND (synced_at IS NULL OR synced_at < NOW() - INTERVAL '6 hours') ORDER BY synced_at NULLS FIRST LIMIT 20")).rows;
 for(const row of rows)await enqueueImport(db,row.shikimori_id);
}
export async function cleanupExpired(db){for(const table of ['sessions','oauth_flows','email_tokens'])await db.query('DELETE FROM '+table+' WHERE expires_at<NOW()');await purgeClosedAppeals(db);await purgeChatImages(db);}
export async function recoverStaleJobs(db){await db.query("UPDATE jobs SET status='pending',error='Повтор после прерванного обхода',run_at=NOW() WHERE status='running' AND locked_at<NOW()-INTERVAL '30 minutes'");await db.query("DELETE FROM auto_job_keys WHERE job_id IN (SELECT id FROM jobs WHERE status IN('done','failed','cancelled'))");await db.query('DELETE FROM auto_job_keys WHERE job_id NOT IN (SELECT id FROM jobs)');}
export function startWorker(db){let stopped=false,busy=false,lastSchedule=0,lastCleanup=0,recovered=false;const tick=async()=>{if(stopped||busy)return;busy=true;try{if(!recovered){await recoverStaleJobs(db);recovered=true;}if(Date.now()-lastCleanup>3600000){await cleanupExpired(db);lastCleanup=Date.now();}if(process.env.AUTO_SYNC==='true'&&Date.now()-lastSchedule>60000){await scheduleAuto(db);lastSchedule=Date.now();}await workerPulse(db);await runJob(db);}catch(error){console.error(JSON.stringify({event:'worker_error',message:error.message}));}finally{busy=false;}};const timer=setInterval(tick,5000);timer.unref();tick();return ()=>{stopped=true;clearInterval(timer);};}
if(process.argv[1]===fileURLToPath(import.meta.url)){const db=database();await migrate(db);startWorker(db);setInterval(()=>{},3600000);}
