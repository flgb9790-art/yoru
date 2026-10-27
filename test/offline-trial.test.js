import {normalizeRecord,episodeKey} from '../public/offline/storage.js';
import test from 'node:test';import assert from 'node:assert/strict';import {compilePlaylist,rangedResponse,providerUrl} from '../public/offline/library-core.js';import request from 'supertest';import {newDb} from 'pg-mem';import {migrate} from '../src/db.js';import {createApp} from '../src/app.js';import {hashToken} from '../src/security.js';
const id='11111111-1111-4111-8111-111111111111',base='https://cache.libria.fun/videos/trial/480/index.m3u8?token=kept';
test('offline playlist rewrites every media/key/map reference locally and fails closed on unsupported streams',()=>{
 const p=compilePlaylist('#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin?token=abc"\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:10,\nseg.ts?token=abc\n#EXT-X-ENDLIST\n',base,id);
 assert.equal(p.files.length,3);assert.equal(p.files[2].url,'https://cache.libria.fun/videos/trial/480/seg.ts?token=abc');assert.doesNotMatch(p.manifest,/https:|token=/);assert.match(p.manifest,new RegExp('/offline/media/'+id+'/2'));assert.match(p.manifest,/#EXT-X-KEY:METHOD=AES-128,URI="\/offline\/media\//);
 for(const text of ['#EXTM3U\nseg.ts','#EXTM3U\n#EXT-X-BYTERANGE:12\nseg.ts\n#EXT-X-ENDLIST','#EXTM3U\nhttps://evil.test/seg.ts\n#EXT-X-ENDLIST','#EXTM3U\n#EXT-X-KEY:METHOD=SAMPLE-AES,URI="key"\nseg.ts\n#EXT-X-ENDLIST'])assert.throws(()=>compilePlaylist(text,base,id));
 for(const url of ['http://cache.libria.fun/a','https://evil.test/a','https://user:pass@cache.libria.fun/a'])assert.throws(()=>providerUrl(url));
});
test('cached media serves bounded, suffix and open ranges, including Safari HEAD probes',async()=>{
 const data='0123456789',response=()=>new Response(data,{headers:{'Content-Type':'video/mp2t'}});
 for(const [range,expected]of [['bytes=2-4','234'],['bytes=8-','89'],['bytes=-3','789'],['bytes=8-99','89']]){const r=await rangedResponse(response(),range);assert.equal(r.status,206);assert.equal(await r.text(),expected);assert.equal(r.headers.get('content-length'),String(expected.length));}
 for(const range of ['bytes=10-','bytes=4-2','bytes=','bytes=1-2,4-5','invalid'])assert.equal((await rangedResponse(response(),range)).status,416);
 assert.equal(await (await rangedResponse(response(),'bytes=0-1','HEAD')).text(),'');assert.equal(await (await rangedResponse(response(),null)).text(),data);
});
test('offline trial is staff-only, pinned to one public title, respects blocks, and shell contains no personalized data',async t=>{
 const {Pool}=newDb().adapters.createPg(),db=new Pool();t.after(()=>db.end());await migrate(db);const csrf='a'.repeat(64),cookie=who=>'yoru_session='+who+'; yoru_csrf='+csrf;
 for(const [who,role]of [['u','user'],['m','moderator'],['a','admin']]){await db.query('INSERT INTO users(id,name,role) VALUES($1,$1,$2)',[who,role]);await db.query('INSERT INTO sessions(token_hash,user_id,csrf,expires_at) VALUES($1,$2,$3,$4)',[hashToken(who),who,csrf,new Date(Date.now()+3600000)]);}
 await db.query("INSERT INTO anime(id,name,shikimori_id,status,episodes,aired) VALUES('trial','Тестовый тайтл',52991,'released',28,28)");const app=createApp(db);
 for(const who of ['',cookie('u')])assert.equal((await request(app).get('/api/offline/trial').set('Cookie',who)).status,403);
 for(const who of ['m','a']){const r=await request(app).get('/api/offline/trial').set('Cookie',cookie(who));assert.equal(r.status,200);assert.deepEqual(r.body,{id:'trial',title:'Тестовый тайтл',episode:1,quality:'480'});}
 await db.query("UPDATE anime SET blocked=TRUE WHERE id='trial'");assert.equal((await request(app).get('/api/offline/trial').set('Cookie',cookie('a'))).status,404);
 await db.query("UPDATE anime SET blocked=FALSE,genres=$1 WHERE id='trial'",[[]]);assert.equal((await request(app).get('/api/offline/anime/trial')).status,200);await db.query("UPDATE anime SET metadata=$1 WHERE id='trial'",[{manual_staff_anime:true}]);assert.equal((await request(app).get('/api/offline/anime/trial').set('Cookie',cookie('a'))).status,404);
 const shell=await request(app).get('/offline/');assert.equal(shell.status,200);assert.doesNotMatch(shell.text,/yoru_session|csrf|Тестовый тайтл/);assert.match(shell.text,/Моя офлайн-библиотека/);
 assert.equal((await request(app).get('/offline-sw.js')).status,200);
});

test('legacy trial downloads retain identity and new episodes distinguish titles, editions and quality',()=>{const data={id,title:'Фрирен',bytes:100,savedAt:1,paths:['/offline/media/'+id+'/0']},legacy=normalizeRecord(data,id);assert.equal(legacy.shikimoriId,52991);assert.equal(legacy.episode,1);assert.equal(legacy.release,9542);assert.equal(legacy.quality,'480');assert.equal(episodeKey(legacy),episodeKey({...legacy,animeId:'new-site-id'}));assert.notEqual(episodeKey(legacy),episodeKey({...legacy,episode:2}));assert.notEqual(episodeKey(legacy),episodeKey({...legacy,shikimoriId:21}));assert.notEqual(episodeKey(legacy),episodeKey({...legacy,release:7}));assert.notEqual(episodeKey(legacy),episodeKey({...legacy,quality:'720'}));assert.equal(normalizeRecord({...data,paths:['https://evil.test']},id),null);});
