import {database,migrate} from '../src/db.js';
const db=database();try{await migrate(db);console.log('Database schema ready');}finally{await db.end();}
