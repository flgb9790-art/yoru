import {saveImported} from '../src/shikimori.js';
import {removeDisallowed,removeRejectedImport} from '../src/catalog-cleanup.js';
import {forbiddenGenre} from '../src/import-policy.js';
import {test} from 'node:test';import assert from 'node:assert/strict';import request from 'supertest';import {newDb} from 'pg-mem';import {migrate} from '../src/db.js';import {createApp} from '../src/app.js';import {hashToken} from '../src/security.js';import {refreshAchievements,achievementData,achievementShowcase,achievements} from '../src/achievements.js';import {dailyVisit,levelPanel} from '../src/levels.js';import {rewardNotice,rewardInbox} from '../src/rewards.js';import {addComment,sendMessage} from '../src/social-store.js';import {topView} from '../src/top.js';
const csrf='a'.repeat(64),cookie=id=>'yoru_session='+id+'; yoru_csrf='+csrf;
async function setup(t){const {Pool}=newDb().adapters.createPg(),db=new Pool();t.after(()=>db.end());await migrate(db);await db.query("INSERT INTO users(id,name,verified,avatar) VALUES('u','Viewer',TRUE,'/avatar.svg'),('v','Other',TRUE,'')");await db.query("INSERT INTO anime(id,name,status,episodes,aired,genres) VALUES('a','Anime','released',12,12,$1)",[[]]);for(const id of ['u','v'])await db.query('INSERT INTO sessions(token_hash,user_id,csrf,expires_at) VALUES($1,$2,$3,$4)',[hashToken(id),id,csrf,new Date(Date.now()+3600000)]);return db;}

test('moderator creates manually but cannot edit; restricted titles are staff only everywhere',async t=>{
 const db=await setup(t);await db.query("UPDATE users SET role='moderator' WHERE id='u'");const app=createApp(db);
 assert.equal((await request(app).get('/moderation/anime/new').set('Cookie',cookie('u'))).status,200);
 assert.equal((await request(app).get('/moderation/anime/new').set('Cookie',cookie('v'))).status,403);
 const input={_csrf:csrf,shikimori_id:'123',name:'Закрытый тайтл',kind:'tv',status:'released',episodes:12,aired:12,genres:'Hentai, Эротика',rating:8};
 assert.equal((await request(app).post('/moderation/anime/new').set('Cookie',cookie('u')).send(input)).status,302);
 const a=(await db.query("SELECT * FROM anime WHERE name='Закрытый тайтл'")).rows[0];assert.deepEqual(a.genres,['Хентай','Эротика']);assert.equal(a.metadata.manual_staff_anime,true);
 for(const path of ['/admin','/admin/new','/admin/anime/'+a.id])assert.equal((await request(app).get(path).set('Cookie',cookie('u'))).status,403);
 assert.equal((await request(app).post('/admin/anime/'+a.id).set('Cookie',cookie('u')).send({...input,name:'Изменено'})).status,403);
 for(const who of ['',cookie('v')]){for(const path of ['/anime/'+a.id,'/api/player/'+a.id+'/aniliberty']){const response=await request(app).get(path).set('Cookie',who);assert.equal(response.status,404,path);}
 const cat=await request(app).get('/catalog').set('Cookie',who);assert.doesNotMatch(cat.text,/Закрытый тайтл|value="Хентай"|value="Эротика"/);
 const search=await request(app).get('/api/search?q='+encodeURIComponent('Закрытый')).set('Cookie',who);assert.equal(search.body.items.length,0);}
 assert.equal((await request(app).get('/anime/'+a.id).set('Cookie',cookie('u'))).status,200);
 const staff=await request(app).get('/catalog').set('Cookie',cookie('u'));assert.match(staff.text,/Закрытый тайтл/);assert.match(staff.text,/Хентай/);
 assert.equal((await request(app).post('/moderation/anime/new').set('Cookie',cookie('v')).send(input)).status,403);await db.query("UPDATE users SET role='admin' WHERE id='v'");assert.equal((await request(app).get('/anime/'+a.id).set('Cookie',cookie('v'))).status,200);assert.equal(await removeRejectedImport(db,{shikimori_id:123,genres:['Хентай']}),false);await saveImported(db,{...a,name:'Импорт не должен менять',genres:['Экшен']});assert.equal((await db.query('SELECT name FROM anime WHERE id=$1',[a.id])).rows[0].name,a.name);assert.equal(forbiddenGenre({genres:['Erotica']}),'Эротика');await removeDisallowed(db);assert.equal((await db.query('SELECT id FROM anime WHERE id=$1',[a.id])).rowCount,1);
});
