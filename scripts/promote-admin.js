import {database} from '../src/db.js';
const email=process.argv[2]?.trim().toLowerCase();if(!email||!email.includes('@'))throw Error('Pass the email of an existing account');
const db=database();try{const result=await db.query("UPDATE users SET role='admin' WHERE email=$1 RETURNING id",[email]);if(!result.rowCount)throw Error('Account not found. Register first.');console.log('Existing account promoted to admin.');}finally{await db.end();}
