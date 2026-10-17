import {database,migrate} from './db.js';
import {createApp} from './app.js';
import {startWorker} from './worker.js';
const db=database();await migrate(db);
// Reclaim jobs after a crash; a long lock cannot permanently block an import.
await db.query("UPDATE jobs SET status='pending',locked_at=NULL WHERE status='running' AND locked_at < NOW() - INTERVAL '10 minutes'");
const stopWorker=startWorker(db);
const server=createApp(db).listen(Number(process.env.PORT)||3000,'0.0.0.0',()=>console.log('YORU is listening'));
async function shutdown(){stopWorker();server.close(async()=>{await db.end();process.exit(0);});setTimeout(()=>process.exit(1),15000).unref();}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
