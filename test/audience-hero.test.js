import {test} from 'node:test';import assert from 'node:assert/strict';
import {audienceHero} from '../src/audience-card.js';
test('hero renders a bounded single visible story with backdrop, watch link and accessible progress controls',()=>{
 const rows=Array.from({length:14},(_,i)=>({id:'anime'+i,name:'История '+i,year:2020,rating:8.1,genres:['Фэнтези'],poster:'https://example.com/poster.jpg',description:'Краткое описание истории.',metadata:{screenshots:['https://example.com/frame.jpg']}}));
 const html=audienceHero(rows);assert.equal((html.match(/data-hero-slide role=/g)||[]).length,8);assert.equal((html.match(/aria-label="\d из 8" hidden/g)||[]).length,7);assert.match(html,/class="audience-backdrop" src="https:\/\/example.com\/frame.jpg"/);assert.match(html,/href="\/anime\/anime0#player"/);assert.equal((html.match(/data-hero-index=/g)||[]).length,8);assert.doesNotMatch(html,/class="anime-card"|audience-copy/);assert.match(html,/width="16" height="16"/);
});
test('empty catalogue omits hero, poster is the fallback backdrop and source text cannot inject HTML',()=>{
 assert.equal(audienceHero([]),'');const html=audienceHero([{id:'x',name:'<script>alert(1)</script>',genres:[],poster:'/poster.jpg',description:'[b]История[/b] <img src=x onerror=bad()>',metadata:{}}]);assert.match(html,/class="audience-backdrop" src="\/poster.jpg"/);assert.ok(html.includes('&lt;script&gt;'));assert.doesNotMatch(html,/<script>|onerror=bad/);assert.match(html,/data-hero-controls hidden/);
});
