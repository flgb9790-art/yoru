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
