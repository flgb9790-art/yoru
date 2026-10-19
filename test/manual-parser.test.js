import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {newDb} from 'pg-mem';
import {migrate} from '../src/db.js';
import {normalizeAnime,saveImported} from '../src/shikimori.js';
import {defaults} from '../src/parser-config.js';
import {catalogueGenres} from '../src/genre-menu.js';
import {sourceGenres,manualConfig,createManualRun,runManualStep,controlManualRun,manualStatus} from '../src/manual-parser.js';
import {mountManualParser,manualPanel} from '../src/manual-parser-admin.js';
import request from 'supertest';
import {createApp} from '../src/app.js';
import {hashToken} from '../src/security.js';

const dictionary=[{id:130,name:'Исэкай',english:'Isekai'},{id:106,name:'Реинкарнация',english:'Reincarnation'}];
const body=()=>({genreIds:['130'],minYear:'2000',maxYear:'2026',minRating:'6',limit:'2'});
const raw=(id,extra={})=>({id,russian:'Тайтл '+id,name:'Title '+id,aired_on:'2020-01-01',kind:'tv',status:'released',score:8,episodes:12,image:{original:'/system/animes/original/'+id+'.jpg'},genres:[{id:130,name:'Isekai',russian:'Исэкай'}],...extra});
const importer=async id=>normalizeAnime(raw(id));
async function setup(t){const {Pool}=newDb().adapters.createPg(),db=new Pool();await migrate(db);await db.query('UPDATE parser_genres SET genres=$1,fetched_at=NOW() WHERE id=1',[JSON.stringify(dictionary)]);await db.query('UPDATE auto_settings SET config=$1 WHERE id=1',[JSON.stringify({...defaults(),enabled:false,genres:['Экшен'],excludedGenres:['Исэкай']})]);t.after(()=>db.end());return db;}
function requestFor(list,paths=[]){return async(path,fetcher,body)=>{paths.push(path);if(path==='/api/graphql'){const ids=(body.query.match(/ids: "([^"]*)"/)?.[1]||'').split(',').map(Number);return {data:{animes:list.filter(a=>ids.includes(a.id)).map(a=>({...a,id:String(a.id),poster:{originalUrl:'https://shikimori.one'+a.image.original}}))}};}return list;};}
async function state(db){return (await manualStatus(db))[0];}

test('source dictionary uses current GraphQL anime themes, rejects banned genres and keeps an explicit stale fallback',async t=>{
 const db=await setup(t);let calls=0;
 const r=await sourceGenres(db,{refresh:true,request:async(path,f,b)=>{calls++;assert.equal(path,'/api/graphql');assert.match(b.query,/genres\(entryType: Anime\)/);return {data:{genres:[{id:'130',russian:'Исэкай',name:'Isekai',kind:'theme'},{id:'1',russian:'Хентай',name:'Hentai'}]}};}});
 assert.equal(calls,1);assert.deepEqual(r.genres.map(g=>g.id),[130]);assert.equal((await sourceGenres(db,{request:()=>{throw Error('cached');}})).stale,false);
 assert.equal((await sourceGenres(db,{refresh:true,request:()=>{throw Error('offline');}})).stale,true);
});
test('manual config validates all limits, snapshots its own rules and requires known allowed genres',()=>{
 const c=manualConfig(body(),dictionary);assert.deepEqual(c.genres,['Исэкай']);assert.equal(c.requireEpisodes,true);assert.equal(c.requirePoster,true);assert.equal(c.limit,2);
 for(const changes of [{genreIds:[]},{genreIds:[999]},{minYear:2026,maxYear:2020},{limit:0},{limit:1001},{minRating:11},{country:'США'},{format:'music'}])assert.throws(()=>manualConfig({...body(),...changes},dictionary));
 assert.throws(()=>manualConfig({...body(),genreIds:[9]},[{id:9,name:'Хентай'}]));
});
test('manual run bypasses disabled automatic schedule, persists its queue, imports complete titles and publishes only actual genres',async t=>{
 const db=await setup(t),paths=[],list=[raw(1),raw(2),raw(3)],request=requestFor(list,paths),key=randomUUID(),id=await createManualRun(db,body(),key);
 assert.equal(await createManualRun(db,body(),key),id);assert.deepEqual(await catalogueGenres(db),[]);assert.equal((await db.query('SELECT * FROM jobs')).rowCount,0);
 await runManualStep(db,{request,countryLookup:async()=>new Map()});assert.equal((await state(db)).counts.pending,3);assert.match(paths[0],/genre_v2=130/);assert.match(paths[0],/score=6/);assert.match(paths[0],/season=2000_2026/);
 await runManualStep(db,{importer});assert.deepEqual(await catalogueGenres(db),['Исэкай']);await runManualStep(db,{importer});
 const run=await state(db);assert.equal(run.status,'done');assert.equal(run.counts.added,2);assert.equal(run.counts.cancelled,1);assert.equal((await db.query('SELECT * FROM anime')).rowCount,2);
 assert.deepEqual((await db.query('SELECT config FROM auto_settings')).rows[0].config.genres,['Экшен']);
});
test('full imports recheck quality, deleted titles, country and all genres; existing titles do not consume the new-title limit',async t=>{
 const db=await setup(t);await saveImported(db,normalizeAnime(raw(1)));await db.query("INSERT INTO deleted_anime(id,shikimori_id,reason,snapshot) VALUES('deleted2',2,'Удалён','{}')");
 const list=[raw(1),raw(2),raw(3),raw(4),raw(5),raw(6)],id=await createManualRun(db,{...body(),limit:1},randomUUID());await runManualStep(db,{request:requestFor(list),countryLookup:async()=>new Map()});
 const imp=async id=>normalizeAnime(raw(id,id===3?{russian:''}:id===4?{image:{original:'/missing.png'}}:id===5?{episodes:0}:{}));
 for(let i=0;i<6;i++)await runManualStep(db,{importer:imp});const run=await state(db);assert.equal(run.status,'done');assert.equal(run.counts.existing,1);assert.equal(run.counts.skipped,4);assert.equal(run.counts.added,1);assert.equal((await db.query('SELECT * FROM anime')).rowCount,2);
});
test('pause during a fetch prevents insertion, resume retries it, stop cancels pending work',async t=>{
 const db=await setup(t),id=await createManualRun(db,body(),randomUUID());await runManualStep(db,{request:requestFor([raw(1),raw(2)]),countryLookup:async()=>new Map()});
 await runManualStep(db,{importer:async n=>{await controlManualRun(db,id,'pause');return importer(n);}});assert.equal((await state(db)).status,'paused');assert.equal((await state(db)).counts.pending,2);assert.equal((await db.query('SELECT * FROM anime')).rowCount,0);assert.equal(await runManualStep(db),false);
 await controlManualRun(db,id,'resume');await runManualStep(db,{importer});assert.equal((await state(db)).counts.added,1);await controlManualRun(db,id,'stop');assert.equal((await state(db)).counts.cancelled,1);assert.equal(await runManualStep(db),false);
});
test('a second worker cannot claim a leased run, interrupted saves recover idempotently',async t=>{
 const db=await setup(t),id=await createManualRun(db,body(),randomUUID());await runManualStep(db,{request:requestFor([raw(1)]),countryLookup:async()=>new Map()});
 await runManualStep(db,{importer:async n=>{assert.equal(await runManualStep(db,{importer}),false);return importer(n);}});
 await db.query("UPDATE manual_parse_items SET status='running' WHERE run_id=$1",[id]);await db.query("UPDATE manual_parse_runs SET lease_until=$1,lease_token='interrupted' WHERE id=$2",[new Date(Date.now()-1000),id]);
 await runManualStep(db,{importer:()=>{throw Error('saved title must not be fetched again');}});assert.equal((await state(db)).counts.added,1);await runManualStep(db,{importer});assert.equal((await state(db)).status,'done');assert.equal((await db.query('SELECT * FROM anime')).rowCount,1);
});
test('failed pages retain their cursor and back off; three failures can be resumed without losing progress',async t=>{
 const db=await setup(t),id=await createManualRun(db,body(),randomUUID());for(let i=0;i<3;i++){await runManualStep(db,{request:()=>{throw Error('offline');}});assert.equal((await state(db)).page,1);await db.query('UPDATE manual_parse_runs SET available_at=$1 WHERE id=$2',[new Date(Date.now()-1000),id]);}
 assert.equal((await state(db)).status,'failed');await controlManualRun(db,id,'resume');await runManualStep(db,{request:requestFor([])});await runManualStep(db);assert.equal((await state(db)).status,'done');
});
test('OR discovers each genre; AND verifies both and country before queueing, without changing menu settings',async t=>{
 const db=await setup(t),paths=[];await createManualRun(db,{...body(),genreIds:['130','106'],genreMatch:'all',country:'Япония'},randomUUID());const list=[raw(1),raw(2,{genres:[...raw(2).genres,{id:106,name:'Reincarnation',russian:'Реинкарнация'}]})];await runManualStep(db,{request:requestFor(list,paths),countryLookup:async items=>new Map(items.map(a=>[a.shikimori_id,'JP']))});const run=await state(db);assert.equal(run.counts.pending,1);assert.equal(run.counts.skipped,1);assert.equal(paths.filter(p=>p.startsWith('/api/animes')).length,1);await controlManualRun(db,run.id,'stop');
 await createManualRun(db,{...body(),genreIds:['130','106']},randomUUID());const second=[];await runManualStep(db,{request:requestFor(list,second),countryLookup:async()=>new Map()});assert.equal(second.filter(p=>p.startsWith('/api/animes')).length,2);
});
test('manual routes require admin and status escapes source titles',async t=>{
 const db=await setup(t),routes={};mountManualParser({get:(p,...h)=>routes['GET '+p]=h,post:(p,...h)=>routes['POST '+p]=h},db);for(const handlers of Object.values(routes)){let called=false;const res={status(n){assert.equal(n,403);return this;},send(){}};handlers[0]({user:{role:'user'}},res,()=>called=true);assert.equal(called,false);}
 const id=await createManualRun(db,body(),randomUUID());await db.query("UPDATE manual_parse_runs SET current_title='<script>bad()</script>' WHERE id=$1",[id]);const html=manualPanel({session:{csrf:'x'}},await manualStatus(db));assert.ok(html.includes('&lt;script&gt;bad()&lt;/script&gt;'));assert.doesNotMatch(html,/<script>bad/);assert.match(html,/data-manual-create/);
});

test('HTTP manual routes enforce authentication and CSRF, accept checkbox arrays and retain request idempotency',async t=>{
 const db=await setup(t),app=createApp(db),agent=request.agent(app),rawToken='manual-parser-test-session';
 await db.query("INSERT INTO users(id,name,role,verified) VALUES('admin','Администратор','admin',TRUE)");
 await db.query('INSERT INTO sessions(token_hash,user_id,csrf,expires_at) VALUES($1,$2,$3,$4)',[hashToken(rawToken),'admin','old',new Date(Date.now()+60000)]);
 for(const path of ['/admin/autoparse/manual/genres','/admin/autoparse/manual/status'])assert.equal((await request(app).get(path)).status,403);
 const page=await agent.get('/admin/autoparse').set('Cookie','yoru_session='+rawToken);assert.equal(page.status,200);const csrf=page.text.match(/name="_csrf" value="([^"]+)/)[1];agent.set('Cookie','yoru_session='+rawToken+'; yoru_csrf='+csrf);
 assert.equal((await agent.post('/admin/autoparse/manual').send(body())).status,403);
 const key=randomUUID(),payload={...body(),genreIds:['130','106'],requestKey:key,_csrf:csrf};
 const created=await agent.post('/admin/autoparse/manual').set('Accept','application/json').type('form').send(payload);assert.equal(created.status,202);assert.ok(created.body.requestKey);
 const again=await agent.post('/admin/autoparse/manual').set('Accept','application/json').type('form').send(payload);assert.equal(again.body.id,created.body.id);assert.equal((await db.query('SELECT * FROM manual_parse_runs')).rowCount,1);
 assert.deepEqual((await state(db)).config.genreIds,[130,106]);
 assert.equal((await agent.post('/admin/autoparse/manual/'+created.body.id+'/pause').send({})).status,403);
 assert.equal((await agent.post('/admin/autoparse/manual/'+created.body.id+'/pause').send({_csrf:csrf})).status,302);assert.equal((await state(db)).status,'paused');
 assert.equal((await agent.get('/admin/autoparse/manual/status')).status,200);
 await db.query("UPDATE users SET role='user' WHERE id='admin'");assert.equal((await agent.get('/admin/autoparse/manual/status')).status,403);
});
