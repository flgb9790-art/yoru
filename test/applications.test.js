import test from 'node:test';import assert from 'node:assert/strict';
import {newDb} from 'pg-mem';import request from 'supertest';
import {migrate} from '../src/db.js';import {createApp} from '../src/app.js';
import {mobileNavigation} from '../src/mobile-nav.js';import {esc} from '../src/views.js';
test('applications page exposes a real APK and standalone iOS metadata; mobile profile card opens the profile directly',async t=>{
 const {Pool}=newDb().adapters.createPg(),db=new Pool();t.after(()=>db.end());await migrate(db);const app=createApp(db);
 const page=await request(app).get('/apps');assert.equal(page.status,200);assert.match(page.text,/Скачать для Android/);assert.match(page.text,/Safari/);assert.match(page.text,/apps-header-link/);assert.match(page.text,/apple-mobile-web-app-capable/);assert.match(page.text,/rel="manifest"/);
 const apk=await request(app).get('/downloads/YORU-0.1.4.apk').buffer(true).parse((res,done)=>{const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>done(null,Buffer.concat(chunks)));res.on('error',done);});assert.equal(apk.status,200);assert.match(apk.headers['content-disposition'],/attachment; filename="?YORU-0\.1\.4\.apk"?/);assert.match(apk.headers['content-type'],/android.package-archive/);assert.ok(apk.body.length>1000000);assert.equal(apk.body.subarray(0,2).toString(),'PK');
 const manifest=JSON.parse((await request(app).get('/manifest.webmanifest')).text);assert.equal(manifest.display,'standalone');for(const icon of manifest.icons)assert.equal((await request(app).get(icon.src)).status,200);
 const menu=mobileNavigation({user:{id:'u',name:'Имя <script>'},path:'/catalog'},esc),card=menu.match(/<a[^>]*class="mobile-menu-account"[\s\S]*?<\/a>/)?.[0];assert.ok(card);assert.match(card,/href="\/profile"/);assert.doesNotMatch(card,/data-account-open|<script>/);assert.match(menu,/<a href="\/profile"[^>]*data-account-open/);assert.match(menu,/href="\/apps"/);
 const guest=await request(app).get('/catalog');assert.match(guest.text,/account-portrait[\s\S]*src="\/assets\/profile\/avatar-[a-z]+\.webp"/);
});
