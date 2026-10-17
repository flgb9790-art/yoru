import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {database,migrate} from './db.js';
import {fetchAnime,saveImported} from './shikimori.js';
export async function runJob(db,importer=fetchAnime){
 const job=(await db.query("SELECT * FROM jobs WHERE status='pending' AND run_at<=NOW() ORDER BY created_at LIMIT 1")).rows[0];if(!job)return false;
 const claimed=await db.query("UPDATE jobs SET status='running',attempts=attempts+1,locked_at=NOW() WHERE id=$1 AND status='pending' RETURNING *",[job.id]);if(!claimed.rowCount)return false;
 try{const item=await importer(job.payload.id);await saveImported(db,item);await db.query("UPDATE jobs SET status='done',error='' WHERE id=$1",[job.id]);}
 catch(error){const attempt=claimed.rows[0].attempts;await db.query('UPDATE jobs SET status=$1,error=$2,run_at=$3 WHERE id=$4',[attempt<3?'pending':'failed',error.message.slice(0,500),new Date(Date.now()+attempt*60000),job.id]);}
 return true;
}
export function startWorker(db){let stopped=false,busy=false;const tick=async()=>{if(stopped||busy)return;busy=true;try{await runJob(db);}catch(error){console.error(JSON.stringify({event:'worker_error',message:error.message}));}finally{busy=false;}};const timer=setInterval(tick,5000);timer.unref();tick();return ()=>{stopped=true;clearInterval(timer);};}
if(process.argv[1]===fileURLToPath(import.meta.url)){const db=database();await migrate(db);startWorker(db);setInterval(()=>{},3600000);}
