import {database,migrate} from './db.js';
import {restoreDesign,disableTemplateOverrides} from './design-store.js';
const db=database();await migrate(db);
const conflicts=await restoreDesign(db);if(conflicts.length)console.warn(JSON.stringify({event:'design_conflicts',files:conflicts}));
let createApp,startWorker;try{({createApp}=await import('./app.js'));({startWorker}=await import('./worker.js'));}catch(error){await disableTemplateOverrides(db);console.error(JSON.stringify({event:'design_startup_error',message:error.message}));await db.end();process.exit(1);}
// Reclaim jobs after a crash; a long lock cannot permanently block an import.
await db.query("UPDATE jobs SET status='pending',locked_at=NULL WHERE status='running' AND locked_at < NOW() - INTERVAL '10 minutes'");
const stopWorker=process.env.WORKER_ENABLED==='false'?()=>{}:startWorker(db);
const server=createApp(db).listen(Number(process.env.PORT)||3000,'0.0.0.0',()=>console.log('YORU is listening'));
async function shutdown(){stopWorker();server.close(async()=>{await db.end();process.exit(0);});setTimeout(()=>process.exit(1),15000).unref();}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
