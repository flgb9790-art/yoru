import test from 'node:test';
import assert from 'node:assert/strict';
import {newDb} from 'pg-mem';
import request from 'supertest';
import {migrate} from '../src/db.js';
import {createApp} from '../src/app.js';
import {animeSearch} from '../src/anime-search.js';
test('word search handles Cyrillic, punctuation, order and original titles with parameterized filters',async t=>{
 const {Pool}=newDb().adapters.createPg(),db=new Pool();t.after(()=>db.end());await migrate(db);
 for(const [id,name,original,year,blocked] of [['hyphen','Ван-Пис','One Piece',1999,false],['space','Ван Пис: приключения','Adventure',2000,false],['other','Ван: другая история','Other',1999,false],['hidden','Ван—Пис','Hidden',1999,true]])await db.query('INSERT INTO anime(id,name,original_name,year,blocked,genres) VALUES($1,$2,$3,$4,$5,$6)',[id,name,original,year,blocked,[]]);
 const app=createApp(db);
 for(const q of ['ван пис','ПИС ВАН','Ван—Пис','  ван...  пис! ']){const res=await request(app).get('/api/search').query({q});assert.equal(res.status,200);assert.deepEqual(res.body.items.map(a=>a.id).sort(),['hyphen','space']);}
 const original=await request(app).get('/api/search').query({q:'piece one'});assert.deepEqual(original.body.items.map(a=>a.id),['hyphen']);
 for(const q of ['%_--','ван отсутствует',"' OR 1=1 --"]){const res=await request(app).get('/api/search').query({q,scope:'admin'});assert.deepEqual(res.body.items,[]);}
 const catalog=await request(app).get('/catalog').query({q:'пис ван',year:2000});assert.equal(catalog.status,200);assert.match(catalog.text,/href="\/anime\/space"/);assert.doesNotMatch(catalog.text,/href="\/anime\/(hyphen|hidden|other)"/);
 const values=['owner'];const clause=animeSearch('ван пис',values,['anime.name','anime.original_name']);assert.deepEqual(values,['owner','%ван%','%пис%']);assert.match(clause,/anime.name ILIKE \$2 AND anime.name ILIKE \$3/);assert.equal(animeSearch('---',[]),'FALSE');
});
