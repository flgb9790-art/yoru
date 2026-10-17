import {test} from 'node:test';import assert from 'node:assert/strict';
import {createAniLibertyClient,normalizeRelease,validateStream} from '../src/aniliberty.js';
const stream='https://cache.libria.fun/videos/test.m3u8?countryIso=NL&isWithVideoAds=1';
const release={id:10301,shikimori:{id:57612},is_blocked_by_geo:false,is_blocked_by_copyrights:false,episodes:[{ordinal:1,name:'First',duration:1400,hls_480:stream},{ordinal:2,name:'Second',hls_720:stream}]};
test('AniLiberty resolves by exact Shikimori ID, not a similar title',async()=>{
 let details=0;const client=createAniLibertyClient(async address=>{const url=new URL(address);assert.equal(url.hostname,'api.anilibria.app');if(url.pathname.endsWith('/catalog/releases'))return Response.json({data:[{id:9,shikimori:{id:123}},{id:10301,shikimori:{id:57612}}]});details++;return Response.json(release);});
 const result=await client({shikimori_id:57612,original_name:'Anime',name:'Anime'});assert.equal(result.available,true);assert.equal(details,1);assert.equal(result.episodes.length,2);assert.equal(result.episodes[0].streams['480'],stream);
 const missing=createAniLibertyClient(async()=>Response.json({data:[{id:9,shikimori:{id:123}}]}));assert.equal((await missing({shikimori_id:57612,name:'Anime'})).available,false);
});
test('AniLiberty restrictions discard playable sources; missing permissions fail closed',()=>{
 for(const update of [{is_blocked_by_geo:true},{is_blocked_by_copyrights:true},{is_blocked_by_geo:undefined}]){const result=normalizeRelease({...release,...update},57612);assert.equal(result.available,false);assert.equal(result.restricted,true);assert.deepEqual(result.episodes,[]);}
 assert.throws(()=>normalizeRelease(release,999));
});
test('AniLiberty stream validation preserves provider parameters and rejects foreign origins',()=>{
 assert.equal(validateStream(stream),stream);for(const value of ['http://cache.libria.fun/test.m3u8','https://libria.fun.evil.example/test.m3u8','https://evil.example/test.m3u8','https://user:pass@cache.libria.fun/test.m3u8'])assert.throws(()=>validateStream(value));
});
