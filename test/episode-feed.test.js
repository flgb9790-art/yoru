import {test} from 'node:test';import assert from 'node:assert/strict';import {newDb} from 'pg-mem';import request from 'supertest';
import {migrate} from '../src/db.js';import {normalizeAnime,saveImported} from '../src/shikimori.js';import {saveEpisodeRelease,episodeFeed,syncEpisodeFeed,enqueueEpisodeSync} from '../src/episode-feed.js';import {runJob} from '../src/worker.js';import {createApp} from '../src/app.js';
async function setup(t){const {Pool}=newDb().adapters.createPg(),db=new Pool();await migrate(db);t.after(()=>db.end());return db;}
async function anime(db,id){const key=await saveImported(db,normalizeAnime({id,russian:'Anime '+id,name:'Anime '+id,genres:[]}));return (await db.query('SELECT * FROM anime WHERE id=$1',[key])).rows[0];}
function release(shiki,id,numbers=[1,2],fresh='2026-10-10T12:00:00Z'){return {id,shikimori:{id:shiki},fresh_at:fresh,is_blocked_by_geo:false,is_blocked_by_copyrights:false,episodes:numbers.map(n=>({id:`release-${id}-episode-${n}`,ordinal:n,name:'Episode '+n,updated_at:new Date(Date.UTC(2026,9,n,12)).toISOString(),hls_720:'https://cache.libria.fun/test.m3u8'}))};}

test('episode imports are idempotent and metadata changes do not bump an old release',async t=>{
 const db=await setup(t),a=await anime(db,1),raw=release(1,101);
 assert.equal((await saveEpisodeRelease(db,a,raw)).inserted,2);let feed=await episodeFeed(db);assert.equal(feed.total,1);assert.equal(feed.rows[0].release_episode,2);const date=feed.rows[0].release_date;
 raw.episodes[1].updated_at='2026-10-16T12:00:00Z';raw.episodes[1].name='Updated metadata';assert.equal((await saveEpisodeRelease(db,a,raw)).inserted,0);feed=await episodeFeed(db);assert.equal(new Date(feed.rows[0].release_date).valueOf(),new Date(date).valueOf());assert.equal(feed.rows[0].episode_name,'Updated metadata');
 assert.equal((await db.query('SELECT * FROM episode_releases')).rowCount,2);
 const next=release(1,101,[1,2,3]);assert.equal((await saveEpisodeRelease(db,a,next)).inserted,1);assert.equal((await episodeFeed(db)).rows[0].release_episode,3);
});

test('removed episodes, source restrictions and administrative blocks leave the feed',async t=>{
 const db=await setup(t),a=await anime(db,2);await saveEpisodeRelease(db,a,release(2,201,[1,2,3]));await saveEpisodeRelease(db,a,release(2,201,[1,2]));assert.equal((await episodeFeed(db)).rows[0].release_episode,2);
 await saveEpisodeRelease(db,a,{...release(2,201),is_blocked_by_geo:true});assert.equal((await episodeFeed(db)).total,0);
 assert.equal((await saveEpisodeRelease(db,a,release(2,201))).inserted,0);assert.equal((await episodeFeed(db)).total,1);
 await db.query('UPDATE anime SET blocked=TRUE WHERE id=$1',[a.id]);assert.equal((await episodeFeed(db)).total,0);
});

test('different editions keep their own episodes and older editions cannot replace the current one',async t=>{
 const db=await setup(t),a=await anime(db,3);await saveEpisodeRelease(db,a,release(3,301,[1,2],'2026-10-10T12:00:00Z'));await saveEpisodeRelease(db,a,release(3,302,[1],'2026-10-12T12:00:00Z'));await saveEpisodeRelease(db,a,release(3,301,[1,2]));const feed=await episodeFeed(db);assert.equal(feed.total,1);assert.equal(feed.rows[0].source_release_id,302);assert.equal(feed.rows[0].release_episode,1);assert.equal((await db.query('SELECT * FROM episode_releases')).rowCount,3);
});

test('latest sync imports missing Shikimori titles once and preserves existing manual names',async t=>{
 const db=await setup(t),a=await anime(db,4);await db.query('UPDATE anime SET name=$1,protected_fields=$2 WHERE id=$3',['Manual name',['name'],a.id]);let imported=0;
 const request=async path=>path.startsWith('anime/releases/latest')?[{id:401,shikimori:{id:4}},{id:501,shikimori:{id:5}},{id:502,shikimori:{id:5}}]:path.endsWith('/401')?release(4,401):release(5,501);
 const importer=async id=>{imported++;return normalizeAnime({id,russian:'New title',genres:[]});};
 const first=await syncEpisodeFeed(db,{request,importer});assert.equal(first.imported,1);assert.equal(first.inserted,4);assert.equal(first.skipped,1);assert.deepEqual(first.errors,[]);
 const second=await syncEpisodeFeed(db,{request,importer});assert.equal(second.inserted,0);assert.equal(imported,1);assert.equal((await db.query('SELECT name FROM anime WHERE id=$1',[a.id])).rows[0].name,'Manual name');
});

test('home and release archive paginate distinct titles at 20 and 24 cards',async t=>{
 const db=await setup(t);for(let i=1;i<=25;i++){const a=await anime(db,i+100);await saveEpisodeRelease(db,a,release(i+100,i+1000));}
 const first=await episodeFeed(db,20,0),second=await episodeFeed(db,20,20);assert.equal(first.total,25);assert.equal(first.rows.length,20);assert.equal(second.rows.length,5);assert.equal(new Set([...first.rows,...second.rows].map(a=>a.id)).size,25);
 const app=createApp(db);for(const [path,count] of [['/',20],['/?page=2',5],['/new-episodes',24],['/new-episodes?page=2',1]]){const response=await request(app).get(path);assert.equal(response.status,200);assert.equal((response.text.match(/class="episode-release-meta"/g)||[]).length,count);assert.match(response.text,/source=aniliberty&amp;release=/);assert.match(response.text,/Обновлено/);assert.doesNotMatch(response.text,/Пока показаны обновления каталога/);}
});

test('episode scheduling deduplicates jobs; partial failures preserve counters and are retried',async t=>{
 const db=await setup(t),id=await enqueueEpisodeSync(db);assert.equal(await enqueueEpisodeSync(db,{force:true}),id);
 await runJob(db,undefined,{episodeSync:async()=>({releases:2,inserted:3,restricted:0,errors:[{release:1,message:'Unavailable'}]})});
 const job=(await db.query('SELECT * FROM jobs WHERE id=$1',[id])).rows[0];assert.equal(job.status,'pending');assert.equal(job.attempts,1);assert.equal(job.result.inserted,3);assert.match(job.error,/Успешные результаты сохранены/);
 await db.query("UPDATE jobs SET status='done' WHERE id=$1",[id]);assert.equal(await enqueueEpisodeSync(db),null);assert.notEqual(await enqueueEpisodeSync(db,{force:true}),id);
});

test('synchronization invalidates cached playlists so a new episode is immediately selectable',async t=>{
 const db=await setup(t),a=await anime(db,8);await db.query('INSERT INTO aniliberty_sources(anime_id,payload) VALUES($1,$2)',[a.id,JSON.stringify({available:true,episodes:[{number:1}]})]);await saveEpisodeRelease(db,a,release(8,801,[1,2]));assert.equal((await db.query('SELECT * FROM aniliberty_sources WHERE anime_id=$1',[a.id])).rowCount,0);
});
