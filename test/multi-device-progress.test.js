import test from 'node:test';import assert from 'node:assert/strict';import request from 'supertest';import {newDb} from 'pg-mem';import {migrate} from '../src/db.js';import {createApp} from '../src/app.js';import {hashToken} from '../src/security.js';
test('account progress survives a fresh device, stale retries, provider switches and manual cache deletion',async t=>{
 const {Pool}=newDb().adapters.createPg(),db=new Pool();t.after(()=>db.end());await migrate(db);
 await db.query("INSERT INTO users(id,name,verified) VALUES('u','Viewer',TRUE),('other','Other',TRUE)");await db.query("INSERT INTO anime(id,name,shikimori_id,genres) VALUES('a','Title',52991,ARRAY['Фэнтези'])");
 for(const device of ['desktop','phone'])await db.query('INSERT INTO sessions(token_hash,user_id,csrf,expires_at) VALUES($1,$2,$3,$4)',[hashToken(device),'u','a'.repeat(64),new Date(Date.now()+3600000)]);
 const app=createApp(db,{playerResolver:async()=>({available:true,link:'https://kodikplayer.com/serial/123/abcdef/720p'}),anilibertyResolver:async()=>({available:true,release_id:42,episodes:[{number:2,season:1,streams:{720:'https://cache.libria.fun/2.m3u8'}}]})}),csrf='a'.repeat(64),post=(device,body)=>request(app).post('/watch/a').set('Cookie','yoru_session='+device+'; yoru_csrf='+csrf).set('x-csrf-token',csrf).send(body),get=(device,path)=>request(app).get(path).set('Cookie','yoru_session='+device);
 const now=Date.now(),older=new Date(now-5000).toISOString(),newer=new Date(now-2000).toISOString(),body={account:'u',episode:2,season:1,position:625,duration:1440,provider:'aniliberty',release:42,recordedAt:older};assert.equal((await post('desktop',body)).status,200);
 const fresh=await get('phone','/api/player/a/aniliberty');assert.equal(fresh.body.resume.position_seconds,625);assert.equal(fresh.body.resume.source_release_id,42);assert.match((await get('phone','/continue')).text,/10:25 \/ 24:00/);
 assert.equal((await post('phone',{...body,position:700,recordedAt:newer})).status,200);const stale=await post('desktop',{...body,position:640});assert.equal(stale.body.skipped,true);assert.equal((await get('desktop','/api/player/a/aniliberty')).body.resume.position_seconds,700);
 assert.equal((await post('desktop',{...body,account:'other'})).status,409);
 // A delayed different episode retains its original time, so it cannot steal the latest slot.
 assert.equal((await post('desktop',{...body,episode:1,position:90,recordedAt:new Date(now-10000).toISOString()})).status,200);assert.equal((await get('phone','/api/player/a/aniliberty')).body.resume.episode,2);
 assert.equal((await request(app).get('/api/player/a/aniliberty')).body.resume,null);
});
