import {test} from 'node:test';import assert from 'node:assert/strict';import {newDb} from 'pg-mem';import {migrate} from '../src/db.js';import {topAnime,topView} from '../src/top.js';import {franchiseParts} from '../src/franchise.js';import {createApp} from '../src/app.js';
async function setup(t){const {Pool}=newDb().adapters.createPg(),db=new Pool();t.after(()=>db.end());await migrate(db);return db;}
test('top 100 ranks independently, caps at 100, paginates and omits blocked, unstarted and zero scores',async t=>{
 const db=await setup(t);for(let i=1;i<=105;i++)await db.query('INSERT INTO anime(id,name,shikimori_id,status,aired,rating,views) VALUES($1,$2,$3,$4,$5,$6,$7)',[String(i).padStart(3,'0'),'Аниме '+i,i,'released',12,i/11,106-i]);
 await db.query("INSERT INTO anime(id,name,status,aired,rating,views,blocked) VALUES('blocked','Hidden','released',12,10,99999,TRUE),('future','Future','anons',0,10,99999,FALSE),('zero','Zero','released',12,0,0,FALSE)");
 const ratings=await topAnime(db);assert.equal(ratings.total,100);assert.equal(ratings.rows[0].id,'105');assert.equal(ratings.rows.length,20);assert.equal((await topAnime(db,'views')).rows[0].id,'001');const last=await topAnime(db,'rating',999);assert.equal(last.page,5);assert.equal(last.rows.at(-1).id,'006');assert.equal((await topAnime(db,'bad',-1)).sort,'rating');
 const html=topView(last);assert.match(html,/<ol start="81">/);assert.doesNotMatch(html,/Hidden|Future/);assert.match(topView(await topAnime(db,'views')),/включая повторные/);
 const app=createApp(db);let result;await app.router.stack.find(l=>l.route?.path==='/top').route.stack.at(-1).handle({path:'/top',query:{},session:{csrf:'x'}},{send(s){result=s;}});assert.match(result,/Топ 100 аниме/);assert.match(result,/href="\/top" aria-current="page"/);
});
test('franchise follows only explicit season edges transitively and backwards, excluding chronology and unrelated links',()=>{
 const row=(id,year,related=[],extra={})=>({id:String(id),shikimori_id:id,name:'Часть '+id,year,kind:'tv',metadata:{related},...extra});
 const rows=[row(1,2020,[{id:2,relation:'Продолжение'},{id:4,relation:'Общие персонажи'},{id:5,relation:'Альтернативная версия'},{id:6,relation:'Другая история'}]),row(2,2022,[{id:3,relation_key:'Sequel'}]),row(3,2024),row(4,2019),row(5,2020),row(6,2018),row(7,2025,[{id:3,relation:'Prequel'}]),row(8,2017,[{id:1,relation:'Sequel'}],{blocked:true})];rows[0].metadata.chronology=[{id:4},{id:5},{id:6}];
 assert.deepEqual(franchiseParts(rows[0],rows).map(a=>a.id),['1','2','3','7']);assert.deepEqual(franchiseParts(rows[2],rows).map(a=>a.id),['1','2','3','7']);assert.equal(franchiseParts(rows[2],rows).filter(a=>a.current).length,1);
});
test('empty ranking and isolated franchise render safely, dates sort before undated parts',async t=>{
 const db=await setup(t);assert.match(topView(await topAnime(db)),/пока нет аниме/);
 const a={id:'a',shikimori_id:1,name:'One',year:null,metadata:{related:[{id:2,relation:'Sequel'}]}},b={id:'b',shikimori_id:2,name:'Two',metadata:{airDate:'2023-05-01'}};assert.deepEqual(franchiseParts(a,[a,b]).map(x=>x.id),['b','a']);assert.equal(franchiseParts(a,[a]).length,1);assert.deepEqual(franchiseParts({...a,shikimori_id:null},[a]),[]);
});
