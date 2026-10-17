import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createKodikClient,validatePlayerUrl} from '../src/kodik.js';
test('Kodik uses the public embed configuration and honours provider permission',async()=>{
 let keyFetches=0,lookups=0,allowed=1;
 const client=createKodikClient(async address=>{const url=new URL(address);if(url.hostname==='kodik-add.com'){keyFetches++;return new Response('r.token="public123456789012345678901234";');}assert.equal(url.hostname,'kodik-api.com');assert.equal(url.pathname,'/get-player');assert.equal(url.searchParams.get('shikimoriID'),'52991');assert.equal(url.searchParams.get('url'),'https://example.org/anime/one');lookups++;return Response.json({allowed,link:'//kodikplayer.com/serial/53973/abcdef123456/720p',quality:'720p'});});
 assert.equal((await client({shikimori_id:52991,name:'Anime'},'https://example.org/anime/one')).available,true);allowed=0;
 assert.equal((await client({shikimori_id:52991,name:'Anime'},'https://example.org/anime/one')).available,false);assert.equal(keyFetches,1);assert.equal(lookups,2);
});
test('player addresses cannot point to an unrelated site or unsupported endpoint',()=>{
 for(const url of ['https://evil.example/serial/1/abcdef/720p','https://kodikplayer.com.evil.example/serial/1/abcdef/720p','http://kodikplayer.com/serial/1/abcdef/720p','https://kodikplayer.com/admin','https://user:pass@kodikplayer.com/serial/1/abcdef/720p'])assert.throws(()=>validatePlayerUrl(url));
 assert.equal(validatePlayerUrl('//kodikplayer.com/video/1/abcdef/720p'),'https://kodikplayer.com/video/1/abcdef/720p');
});
