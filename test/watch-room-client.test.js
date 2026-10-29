import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const script=await readFile(new URL('../public/watch-room.js',import.meta.url),'utf8');

function client({playing=false,rejection,owner=false}={}){
 const listeners=new Map(),nodes=new Map(),requests=[];let tick;
 const node=selector=>{if(!nodes.has(selector))nodes.set(selector,{hidden:false,dataset:{},value:'',textContent:'',setAttribute(){},children:[],replaceChildren(){},append(){},querySelector:node});return nodes.get(selector);};
 const video=node('video');Object.assign(video,{readyState:0,duration:120,paused:true,currentTime:0,load(){},removeAttribute(){},canPlayType(){return 'probably';},pause(){this.paused=true;},playCalls:0,play(){this.playCalls++;if(rejection)return Promise.reject(Object.assign(Error('denied'),{name:rejection}));this.readyState=1;this.paused=false;return Promise.resolve();}});
 const root={dataset:{room:'r',owner:String(owner),user:owner?'host':'guest',joined:'false',csrf:'x'},querySelector:node};
 const room={episode:1,position:20,playing,version:0,ownerId:'host',hostOnline:true};
 const page={signal:new AbortController().signal,listen(el,type,fn){listeners.set(el===video?'video:'+type:[...nodes].find(([,n])=>n===el)?.[0]+':'+type,fn);},interval(fn){tick=fn;}};
 const context={window:{yoruIcons:{svg:name=>name},yoruPages:{register(fn){fn(page);}}},document:{querySelector(s){return s==='[data-watch-room]'?root:null;},createDocumentFragment(){return {append(){}};},createElement(){return {append(){},setAttribute(){}};}},fetch:async (path,options)=>{requests.push({path,options});return {ok:true,json:async()=>path.endsWith('/media')?{episodes:[{number:1,streams:{480:'https://cache.libria.fun/test.m3u8'}}]}:path.includes('/state')?{room,members:[],messages:[]}:path.startsWith('/watch/')?{xpGained:25}:{} };},Option:function(){},URL,Date,performance,console};
 vm.runInNewContext(script,context);
 return {video,nodes,listeners,room,requests,async tick(){tick();await new Promise(setImmediate);},async boot(){await listeners.get('[data-room-join]:click')();},async connect(){listeners.get('[data-room-connect]:click')();await new Promise(setImmediate);}};
}

test('guest starts loading native media inside connect gesture before metadata exists',async()=>{
 const c=client({playing:true});await c.boot();assert.equal(c.video.readyState,0);await c.connect();assert.ok(c.video.playCalls>=1);assert.equal(c.video.paused,false);assert.ok(c.video.currentTime>=20);
});
test('guest can initialize media while host is paused and remains paused afterwards',async()=>{
 const c=client();await c.boot();await c.connect();assert.ok(c.video.playCalls>=1);assert.equal(c.video.readyState,1);assert.equal(c.video.paused,true);
});
test('autoplay denial restores connect button, interrupted loading does not request permission again',async()=>{
 for(const rejection of ['NotAllowedError','AbortError']){const c=client({rejection});await c.boot();await c.connect();assert.equal(c.nodes.get('[data-room-connect]').hidden,rejection==='AbortError');}
});

test('host connection starts playback even when the room initially reports paused',async()=>{
 const c=client({owner:true});await c.boot();await c.connect();assert.ok(c.video.playCalls>=1);assert.equal(c.video.paused,false);
});


test('spectator volume and mute stay local without publishing playback',async()=>{const c=client();await c.boot();const volume=c.nodes.get('[data-room-volume]');volume.value='0.3';c.listeners.get('[data-room-volume]:input')();assert.equal(c.video.volume,.3);assert.equal(c.video.muted,false);c.listeners.get('[data-room-mute]:click')();assert.equal(c.video.muted,true);assert.equal(c.requests.some(r=>r.path.endsWith('/playback')),false);});
test('a completed shared episode saves completion and shows the XP receipt',async()=>{const c=client({playing:true});await c.boot();await c.connect();for(let second=21;second<=110;second++){c.video.currentTime=second;c.listeners.get('video:timeupdate')();await new Promise(setImmediate);}const saves=c.requests.filter(r=>r.path.startsWith('/watch/')).map(r=>JSON.parse(r.options.body));assert.ok(saves.some(s=>s.completed==='true'));assert.match(c.nodes.get('[data-room-xp]').textContent,/25 XP/);});
