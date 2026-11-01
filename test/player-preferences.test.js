import test from 'node:test';
import assert from 'node:assert/strict';
import {newDb} from 'pg-mem';
import request from 'supertest';
import {migrate} from '../src/db.js';
import {createApp} from '../src/app.js';
import {hashToken} from '../src/security.js';
import {normalizeAnime,saveImported} from '../src/shikimori.js';

test('last Kodik voice survives a completed episode, ignores manual/AniLiberty entries and stays private',async t=>{
 const {Pool}=newDb().adapters.createPg(),db=new Pool();t.after(()=>db.end());await migrate(db);
 await db.query("INSERT INTO users(id,name,verified) VALUES('viewer','Viewer',TRUE),('other','Other',TRUE)");
 await db.query('INSERT INTO sessions(token_hash,user_id,csrf,expires_at) VALUES($1,$2,$3,$4)',[hashToken('viewer'),'viewer','a'.repeat(64),new Date(Date.now()+3600000)]);
 const id=await saveImported(db,normalizeAnime({status:'released',id:52991,russian:'Тест',episodes:12,genres:[]}));
 for(const [key,user,episode,translation,provider,manual,time,position]of [
  ['watched','viewer',1,910,'kodik',false,'2026-01-01',100],
  ['completed','viewer',2,923,'kodik',false,'2026-01-02',1200],
  ['manual','viewer',3,999,'kodik',true,'2026-01-03',0],
  ['liberty','viewer',4,null,'aniliberty',false,'2026-01-04',100],
  ['foreign','other',1,777,'kodik',false,'2026-01-05',100]
 ])await db.query('INSERT INTO watch_history(id,user_id,anime_id,episode,translation_id,provider,manual_mark,updated_at,position_seconds,completed) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,TRUE)',[key,user,id,episode,translation,provider,manual,new Date(time),position]);
 const app=createApp(db,{playerResolver:async()=>({available:true,link:'https://kodikplayer.com/serial/123/abcdef/720p'})});
 const viewer=await request(app).get('/api/player/'+id).set('Cookie','yoru_session=viewer');assert.equal(viewer.status,200);assert.equal(viewer.body.preferredTranslationId,923);assert.equal(viewer.body.resume,null);
 const guest=await request(app).get('/api/player/'+id);assert.equal(guest.body.preferredTranslationId,null);assert.equal(guest.body.resume,null);
 const html=await request(app).get('/anime/'+id);const csp=html.headers['content-security-policy'];assert.match(csp,/style-src 'self'/);assert.doesNotMatch(csp,/unsafe-inline/);
});

test('Kodik and AniLiberty restore only their own positions, with timestamps for local conflict resolution',async t=>{const {Pool}=newDb().adapters.createPg(),db=new Pool();t.after(()=>db.end());await migrate(db);await db.query("INSERT INTO users(id,name,verified) VALUES('v','Viewer',TRUE)");await db.query('INSERT INTO sessions(token_hash,user_id,csrf,expires_at) VALUES($1,$2,$3,$4)',[hashToken('v'),'v','a'.repeat(64),new Date(Date.now()+3600000)]);const id=await saveImported(db,normalizeAnime({status:'released',id:52991,russian:'Тест',episodes:12,genres:[]}));for(const [key,ep,source,time,translation,release]of [['k',2,'kodik','2026-01-01',923,null],['a',4,'aniliberty','2026-01-02',null,42]])await db.query('INSERT INTO watch_history(id,user_id,anime_id,episode,position_seconds,provider,translation_id,source_release_id,updated_at) VALUES($1,$2,$3,$4,321,$5,$6,$7,$8)',[key,'v',id,ep,source,translation,release,new Date(time)]);const app=createApp(db,{playerResolver:async()=>({available:true,link:'https://kodikplayer.com/serial/123/abcdef/720p'}),anilibertyResolver:async()=>({available:true,release_id:42,episodes:[{number:4,season:1,streams:{720:'https://cache.libria.fun/4.m3u8'}}]})});const kodik=await request(app).get('/api/player/'+id).set('Cookie','yoru_session=v');assert.equal(kodik.status,200);assert.equal(kodik.body.resume.episode,2);assert.equal(kodik.body.resume.translation_id,923);assert(kodik.body.resume.updated_at);assert(kodik.body.progressUpdatedAt);const ani=await request(app).get('/api/player/'+id+'/aniliberty').set('Cookie','yoru_session=v');assert.equal(ani.status,200);assert.equal(ani.body.resume.episode,4);assert.equal(ani.body.resume.source_release_id,42);assert(ani.body.resume.updated_at);});
