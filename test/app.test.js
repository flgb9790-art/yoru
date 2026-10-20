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
async function login(target=app){const agent=request.agent(target);let page=await agent.get('/login');const csrf=page.text.match(/name="_csrf" value="([^"]+)/)[1];const response=await agent.post('/login').type('form').send({_csrf:csrf,email:'owner@example.com',password:'test-password-123'});assert.equal(response.status,302);return {agent,csrf};}
test('health and static assets',async()=>{assert.equal((await request(app).get('/health')).status,200);assert.equal((await request(app).get('/style.css')).status,200);});
test('unauthorized admin is denied and CSRF is enforced',async()=>{assert.equal((await request(app).get('/admin')).status,403);assert.equal((await request(app).post('/admin/manual').send({name:'x'})).status,403);});
test('import preserves manual fields and block; duplicate imports are idempotent',async()=>{const item=normalizeAnime({status:'released',id:52991,russian:'Фрирен',name:'Frieren',score:'9.1',episodes:28,episodes_aired:28,aired_on:'2023-09-29',genres:[{russian:'Фэнтези'}],image:{original:'/test.jpg'}});const id=await saveImported(db,item);await db.query('UPDATE anime SET blocked=TRUE,name=$1,protected_fields=$2 WHERE id=$3',['Ручное название',['name'],id]);await saveImported(db,{...item,name:'Новое имя',rating:9.2});const result=(await db.query('SELECT * FROM anime WHERE id=$1',[id])).rows[0];assert.equal(result.name,'Ручное название');assert.equal(result.blocked,true);assert.equal(result.rating,9.2);assert.equal(+(await db.query('SELECT COUNT(*) AS count FROM anime')).rows[0].count,1);});
test('login uses a persistent session; manual creation and block enforce server permissions',async()=>{const {agent,csrf}=await login();const response=await agent.post('/admin/manual').type('form').send({_csrf:csrf,name:'Тест аниме',kind:'tv',status:'ongoing',country:'Китай',year:'2026',episodes:'12',aired:'2',genres:'Фэнтези, Экшен',protect:'on'});assert.equal(response.status,302);const id=response.headers.location.split('/').at(-1);assert.equal((await agent.get('/profile')).status,200);assert.equal((await agent.post(`/admin/anime/${id}/block`).type('form').send({_csrf:csrf,blocked:'true'})).status,302);assert.match((await agent.get('/anime/'+id)).text,/Просмотр ограничен/);});
test('catalog genre intersection, country and pagination',async()=>{const result=await request(app).get('/catalog').query({country:'Китай',genre:['Фэнтези','Экшен']});assert.equal(result.status,200);assert.match(result.text,/Тест аниме/);assert.doesNotMatch(result.text,/Ручное название/);});
test('background import job persists result and status',async()=>{await db.query('INSERT INTO jobs(id,kind,payload) VALUES($1,$2,$3)',['job1','import',JSON.stringify({id:123})]);await runJob(db,async()=>normalizeAnime({status:'released',id:123,russian:'Импорт из очереди',name:'Queue',genres:[]}));assert.equal((await db.query('SELECT status FROM jobs WHERE id=$1',['job1'])).rows[0].status,'done');});
test('profile uploads validate bytes and persist media in database',async()=>{const {agent,csrf}=await login();const invalid=await agent.post('/profile/image/avatar').set('x-csrf-token',csrf).attach('image',Buffer.from('<svg/>'),'bad.png');assert.equal(invalid.status,400);const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1cAAAAASUVORK5CYII=','base64');const response=await agent.post('/profile/image/avatar').set('x-csrf-token',csrf).attach('image',png,'avatar.png');assert.equal(response.status,200);const user=(await db.query('SELECT avatar FROM users WHERE id=$1',['admin'])).rows[0];assert.match(user.avatar,/^\/media\//);const media=await agent.get(user.avatar);assert.equal(media.status,200);assert.equal(media.headers['content-type'],'image/png');});
test('watch history belongs to the authenticated user and rejects blocked anime',async()=>{const {agent,csrf}=await login();const open=(await db.query('SELECT id FROM anime WHERE shikimori_id=123')).rows[0];assert.equal((await agent.post('/watch/'+open.id).type('form').send({_csrf:csrf,episode:1,completed:'true'})).status,302);assert.match((await agent.get('/history')).text,/Импорт из очереди/);const blocked=(await db.query('SELECT id FROM anime WHERE shikimori_id=52991')).rows[0];assert.equal((await agent.post('/watch/'+blocked.id).type('form').send({_csrf:csrf,episode:1})).status,403);});

test('library supports personal ratings, status filtering and removal',async()=>{
 const {agent,csrf}=await login();const a=(await db.query('SELECT id FROM anime WHERE shikimori_id=123')).rows[0];
 assert.equal((await agent.post('/anime/'+a.id+'/score').type('form').send({_csrf:csrf,score:8})).status,302);
 assert.equal((await agent.post('/library/'+a.id).type('form').send({_csrf:csrf,status:'favorite'})).status,302);
 assert.match((await agent.get('/library?status=favorite')).text,/Импорт из очереди/);
 assert.doesNotMatch((await agent.get('/library?status=dropped')).text,/Импорт из очереди/);
 assert.equal((await db.query('SELECT score FROM library WHERE user_id=$1 AND anime_id=$2',['admin',a.id])).rows[0].score,8);
 await agent.post('/library/'+a.id+'/remove').type('form').send({_csrf:csrf});
 assert.equal((await db.query('SELECT * FROM library WHERE user_id=$1 AND anime_id=$2',['admin',a.id])).rowCount,0);
});

test('moderation roles cannot grant administrator rights; owner cannot remove own rights',async()=>{
 const {agent,csrf}=await login();assert.equal((await agent.post('/admin/users/admin/role').type('form').send({_csrf:csrf,role:'user'})).status,400);
 await db.query('INSERT INTO users(id,email,name,password_hash,role,verified) VALUES($1,$2,$3,$4,$5,TRUE)',['mod','mod@example.com','Moderator',await hashPassword('test-password-123'),'moderator']);
 const mod=request.agent(app),page=await mod.get('/login'),key=page.text.match(/name="_csrf" value="([^"]+)/)[1];
 await mod.post('/login').type('form').send({_csrf:key,email:'mod@example.com',password:'test-password-123'});
 assert.equal((await mod.get('/moderation')).status,200);assert.equal((await mod.get('/admin/users')).status,403);
 assert.equal((await mod.post('/admin/users/admin/role').type('form').send({_csrf:key,role:'user'})).status,403);
});

test('metadata edits preserve unrelated imported fields and do not freeze episode updates',async()=>{
 const {agent,csrf}=await login();const item=normalizeAnime({status:'released',id:90001,russian:'Тест метаданных',name:'Metadata',genres:[]});Object.assign(item.metadata,{authors:['Original'],directors:['Director'],studios:['Studio'],duration:24,screenshots:[],nextEpisode:null,related:[{id:1,name:'Part',relation:'Sequel'}],airDate:'2026-01-01'});
 const id=await saveImported(db,item);
 const response=await agent.post('/admin/anime/'+id).type('form').send({_csrf:csrf,name:item.name,kind:'tv',status:'released',country:'Япония',authors:'Manual',directors:'Director',studios:'Studio',duration:24,protect:'on'});assert.equal(response.status,302);
 await saveImported(db,{...item,aired:3,metadata:{...item.metadata,authors:['Changed'],directors:['New director']}});
 const row=(await db.query('SELECT * FROM anime WHERE id=$1',[id])).rows[0];assert.deepEqual(row.metadata.authors,['Manual']);assert.deepEqual(row.metadata.directors,['New director']);assert.equal(row.metadata.related.length,1);assert.equal(row.aired,3);
});

test('home information controls are present on every full card',async()=>{
 const response=await request(app).get('/');assert.equal(response.status,200);
 const cards=(response.text.match(/class="anime-card"/g)||[]).length,buttons=(response.text.match(/class="card-info"/g)||[]).length;assert.ok(cards>0);assert.equal(buttons,cards);
});

test('public player lookup is cached, does not create views, and respects later blocking',async()=>{
 const anime=(await db.query('SELECT id FROM anime WHERE shikimori_id=90001')).rows[0];let calls=0;
 const target=createApp(db,{playerResolver:async()=>{calls++;return {available:true,link:'https://kodikplayer.com/serial/123/abcdef123456/720p',quality:'720p',translation:'Test'};}});
 const response=await request(target).get('/api/player/'+anime.id);assert.equal(response.status,200);assert.match(response.body.url,/^https:\/\/kodikplayer.com\/serial\//);assert.equal(response.body.resume,null);
 await request(target).get('/api/player/'+anime.id);assert.equal(calls,1);assert.equal((await db.query('SELECT * FROM watch_history WHERE anime_id=$1',[anime.id])).rowCount,0);
 await db.query('UPDATE anime SET blocked=TRUE WHERE id=$1',[anime.id]);const denied=await request(target).get('/api/player/'+anime.id);assert.equal(denied.status,403);assert.equal(denied.body.url,undefined);assert.equal(calls,1);
 assert.equal((await request(target).get('/api/player/'+anime.id+'/status')).status,403);await db.query('UPDATE anime SET blocked=FALSE WHERE id=$1',[anime.id]);
});

test('playback history separates seasons and keeps completion after a rewatch begins',async()=>{
 const {agent,csrf}=await login(),anime=(await db.query('SELECT id FROM anime WHERE shikimori_id=123')).rows[0];
 for(const season of [1,2]){const response=await agent.post('/watch/'+anime.id).set('x-csrf-token',csrf).send({episode:2,season,position:120,translation:910,completed:'false'});assert.equal(response.status,200);}
 assert.equal((await db.query('SELECT * FROM watch_history WHERE user_id=$1 AND anime_id=$2 AND episode=2',['admin',anime.id])).rowCount,2);
 await agent.post('/watch/'+anime.id).set('x-csrf-token',csrf).send({episode:2,season:2,position:1400,completed:'true'});
 await agent.post('/watch/'+anime.id).set('x-csrf-token',csrf).send({episode:2,season:2,position:20,completed:'false'});
 const row=(await db.query('SELECT * FROM watch_history WHERE user_id=$1 AND anime_id=$2 AND episode=2 AND season=2',['admin',anime.id])).rows[0];assert.equal(row.completed,true);assert.equal(row.position_seconds,20);
 assert.equal((await agent.post('/watch/'+anime.id).set('x-csrf-token',csrf).send({episode:0})).status,400);
 const home=await agent.get('/');assert.equal(home.status,200);assert.match(home.text,/class="continue-shortcut continue-mini" href="\/continue\?all=1"/);
});

test('expired playback authentication returns JSON 401 rather than a successful login page',async()=>{
 const agent=request.agent(app),loginPage=await agent.get('/login'),csrf=loginPage.text.match(/name="_csrf" value="([^"]+)/)[1];
 const response=await agent.post('/watch/unknown').set('x-csrf-token',csrf).send({episode:1,position:10,completed:'false'});assert.equal(response.status,401);assert.match(response.headers['content-type'],/application\/json/);
});

test('AniLiberty endpoint caches separately, respects block changes and supplies resumable media',async()=>{
 const anime=(await db.query('SELECT id FROM anime WHERE shikimori_id=90001')).rows[0];let calls=0;
 const target=createApp(db,{anilibertyResolver:async()=>{calls++;return {available:true,restricted:false,episodes:[{number:1,season:1,name:'One',duration:1400,streams:{'720':'https://cache.libria.fun/test.m3u8?isWithVideoAds=1'}}]};}});
 let response=await request(target).get('/api/player/'+anime.id+'/aniliberty');assert.equal(response.status,200);assert.equal(response.body.episodes.length,1);assert.equal(response.body.resume,null);assert.match(response.body.episodes[0].streams['720'],/isWithVideoAds=1/);
 await request(target).get('/api/player/'+anime.id+'/aniliberty');assert.equal(calls,1);
 await db.query('UPDATE anime SET blocked=TRUE WHERE id=$1',[anime.id]);response=await request(target).get('/api/player/'+anime.id+'/aniliberty');assert.equal(response.status,403);assert.equal(response.body.episodes,undefined);assert.equal(calls,1);await db.query('UPDATE anime SET blocked=FALSE WHERE id=$1',[anime.id]);
 const {agent,csrf}=await login(target);await agent.post('/watch/'+anime.id).set('x-csrf-token',csrf).send({episode:1,position:90,completed:'false',provider:'aniliberty'});
 response=await agent.get('/api/player/'+anime.id+'/aniliberty');assert.equal(response.body.resume.position_seconds,90);assert.equal((await db.query('SELECT provider FROM watch_history WHERE user_id=$1 AND anime_id=$2',['admin',anime.id])).rows[0].provider,'aniliberty');
});

test('AniLiberty provider restrictions never expose media URLs',async()=>{
 const id=await saveImported(db,normalizeAnime({status:'released',id:987654,russian:'Restricted release',genres:[]}));const target=createApp(db,{anilibertyResolver:async()=>({available:true,restricted:true,episodes:[{streams:{'720':'https://cache.libria.fun/test.m3u8'}}]})});
 const response=await request(target).get('/api/player/'+id+'/aniliberty');assert.equal(response.status,403);assert.equal(response.body.episodes,undefined);
 const cached=(await db.query('SELECT payload FROM aniliberty_sources WHERE anime_id=$1',[id])).rows[0];assert.deepEqual(cached.payload.episodes,[]);
});

test('episode synchronization controls require admin and retain CSRF protection',async()=>{
 assert.equal((await request(app).get('/new-episodes')).status,200);
 assert.equal((await request(app).post('/admin/episodes/sync').send({})).status,403);
 const {agent,csrf}=await login();const first=await agent.post('/admin/episodes/sync').type('form').send({_csrf:csrf}),second=await agent.post('/admin/episodes/sync').type('form').send({_csrf:csrf});assert.equal(first.status,302);assert.equal(second.status,302);assert.equal((await db.query("SELECT * FROM jobs WHERE kind='episodes'")).rowCount,1);
 assert.match((await agent.get('/admin/jobs')).text,/Обновить серии AniLiberty/);
});
test('Shikimori field preview returns useful JSON errors without exposing HTML or internal errors',async()=>{let missing=true;const target=createApp(db,{importer:async()=>{throw Object.assign(new Error(missing?'Shikimori returned 404':'private upstream diagnostic'),{upstreamStatus:missing?404:500});}}),{agent}=await login(target);let response=await agent.get('/admin/shikimori/121496');assert.equal(response.status,404);assert.match(response.headers['content-type'],/json/);assert.match(response.body.error,/не найдено/);missing=false;response=await agent.get('/admin/shikimori/52991');assert.equal(response.status,502);assert.match(response.body.error,/временно/);assert.doesNotMatch(response.text,/private upstream/);});
