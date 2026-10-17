import {database,migrate} from '../src/db.js';
import {fetchAnime,saveImported} from '../src/shikimori.js';
const ids=process.argv.slice(2).map(Number);if(!ids.length||ids.some(id=>!Number.isSafeInteger(id)||id<1))throw Error('Usage: npm run import -- 52991 49214');
const db=database();try{await migrate(db);for(const id of ids){const anime=await fetchAnime(id);await saveImported(db,anime);console.log(`Imported ${id}: ${anime.name}`);}}finally{await db.end();}
