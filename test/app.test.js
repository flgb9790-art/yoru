import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {newDb} from 'pg-mem';
import request from 'supertest';
import {createApp} from '../src/app.js';
import {migrate} from '../src/db.js';
import {hashPassword} from '../src/security.js';
import {normalizeAnime,saveImported} from '../src/shikimori.js';
import {runJob} from '../src/worker.js';
let db,app;
before(async()=>{const memory=newDb();const {Pool}=memory.adapters.createPg();db=new Pool();await migrate(db);app=createApp(db);await db.query('INSERT INTO users(id,email,name,password_hash,role,verified) VALUES($1,$2,$3,$4,$5,$6)',['admin','owner@example.com','Owner',await hashPassword('test-password-123'),'admin',true]);});
after(async()=>db.end());
async function login(){const agent=request.agent(app);let page=await agent.get('/login');const csrf=page.text.match(/name="_csrf" value="([^"]+)/)[1];const response=await agent.post('/login').type('form').send({_csrf:csrf,email:'owner@example.com',password:'test-password-123'});assert.equal(response.status,302);return {agent,csrf};}
test('health and static assets',async()=>{assert.equal((await request(app).get('/health')).status,200);assert.equal((await request(app).get('/style.css')).status,200);});
test('unauthorized admin is denied and CSRF is enforced',async()=>{assert.equal((await request(app).get('/admin')).status,403);assert.equal((await request(app).post('/admin/manual').send({name:'x'})).status,403);});
test('import preserves manual fields and block; duplicate imports are idempotent',async()=>{const item=normalizeAnime({id:52991,russian:'Фрирен',name:'Frieren',score:'9.1',episodes:28,episodes_aired:28,aired_on:'2023-09-29',genres:[{russian:'Фэнтези'}],image:{original:'/test.jpg'}});const id=await saveImported(db,item);await db.query('UPDATE anime SET blocked=TRUE,name=$1,protected_fields=$2 WHERE id=$3',['Ручное название',['name'],id]);await saveImported(db,{...item,name:'Новое имя',rating:9.2});const result=(await db.query('SELECT * FROM anime WHERE id=$1',[id])).rows[0];assert.equal(result.name,'Ручное название');assert.equal(result.blocked,true);assert.equal(result.rating,9.2);assert.equal(+(await db.query('SELECT COUNT(*) AS count FROM anime')).rows[0].count,1);});
test('login uses a persistent session; manual creation and block enforce server permissions',async()=>{const {agent,csrf}=await login();const response=await agent.post('/admin/manual').type('form').send({_csrf:csrf,name:'Тест аниме',kind:'tv',status:'ongoing',country:'Китай',year:'2026',episodes:'12',aired:'2',genres:'Фэнтези, Экшен',protect:'on'});assert.equal(response.status,302);const id=response.headers.location.split('/').at(-1);assert.equal((await agent.get('/profile')).status,200);assert.equal((await agent.post(`/admin/anime/${id}/block`).type('form').send({_csrf:csrf,blocked:'true'})).status,302);assert.match((await agent.get('/anime/'+id)).text,/Просмотр ограничен/);});
test('catalog genre intersection, country and pagination',async()=>{const result=await request(app).get('/catalog').query({country:'Китай',genre:['Фэнтези','Экшен']});assert.equal(result.status,200);assert.match(result.text,/Тест аниме/);assert.doesNotMatch(result.text,/Ручное название/);});
test('background import job persists result and status',async()=>{await db.query('INSERT INTO jobs(id,kind,payload) VALUES($1,$2,$3)',['job1','import',JSON.stringify({id:123})]);await runJob(db,async()=>normalizeAnime({id:123,russian:'Импорт из очереди',name:'Queue',genres:[]}));assert.equal((await db.query('SELECT status FROM jobs WHERE id=$1',['job1'])).rows[0].status,'done');});
