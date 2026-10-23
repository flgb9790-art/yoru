import test from 'node:test';
import assert from 'node:assert/strict';
import {newDb} from 'pg-mem';
import request from 'supertest';
import {migrate} from '../src/db.js';
import {createApp} from '../src/app.js';
import {hashToken} from '../src/security.js';

test('account entry menu belongs to the signed-in viewer, retains profile navigation and escapes user artwork and names',async t=>{
 const {Pool}=newDb().adapters.createPg(),db=new Pool();t.after(()=>db.end());await migrate(db);
 await db.query('INSERT INTO users(id,name,avatar,cover,xp) VALUES($1,$2,$3,$4,10)',['u','Имя <script>','/avatar-u.webp','/cover-u.webp']);
 await db.query("INSERT INTO users(id,name,avatar,cover,role) VALUES('v','Друг','/avatar-v.webp','/cover-v.webp','admin')");
 const csrf='a'.repeat(64);await db.query('INSERT INTO sessions(token_hash,user_id,csrf,expires_at) VALUES($1,$2,$3,$4)',[hashToken('u'),'u',csrf,new Date(Date.now()+3600000)]);
 const app=createApp(db),cookie='yoru_session=u; yoru_csrf='+csrf;
 const response=await request(app).get('/users/v').set('Cookie',cookie);assert.equal(response.status,200);
 const menu=response.text.match(/<dialog id="account-dialog"[\s\S]*?<\/dialog>/)?.[0];assert.ok(menu);assert.match(menu,/Имя &lt;script&gt;/);assert.match(menu,/src="\/avatar-u.webp"/);assert.match(menu,/src="\/cover-u.webp"/);assert.doesNotMatch(menu,/avatar-v|cover-v|<script>|href="\/admin"/);
 assert.match(menu,/href="\/profile"/);assert.match(menu,/href="\/profile#profile-settings"/);assert.match(menu,/xp-fill-10/);assert.match(menu,/action="\/logout"/);assert.match(menu,/name="_csrf"/);assert.match(response.text,/data-account-open aria-haspopup="dialog"/);
 const profile=await request(app).get('/profile').set('Cookie',cookie);assert.equal(profile.status,200);assert.match(profile.text,/profile-dashboard/);assert.match(profile.text,/class="streak-flame"/);
 const guest=await request(app).get('/catalog');assert.equal(guest.status,200);assert.match(guest.text,/<dialog id="auth-dialog"/);assert.match(guest.text,/href="\/auth\/telegram"/);assert.doesNotMatch(guest.text,/<dialog id="account-dialog"|account-profile-link|action="\/logout"/);
});
