import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const script=await readFile(new URL('../public/account-dialog.js',import.meta.url),'utf8');

// Minimal bubbling DOM: selectors are evaluated against actual tags/attributes,
// so binding a listener to [data-auth] containers reproduces the original bug.
class Element{
 constructor(tag,attrs={},parent=null){this.tag=tag;this.attrs=attrs;this.parent=parent;this.listeners={};this.classList={add(){},remove(){}};}
 matches(selector){return selector.split(',').some(part=>{const [,tag,attr]=/^([a-z]+)?(?:\[([^\]]+)\])?$/.exec(part.trim())||[];return (!tag||tag===this.tag)&&(!attr||Object.hasOwn(this.attrs,attr));});}
 closest(selector){return this.matches(selector)?this:this.parent?.closest(selector)||null;}
 click(){const event={target:this,button:0,preventDefault(){this.defaultPrevented=true;},defaultPrevented:false};for(let e=this;e;e=e.parent)for(const listener of e.listeners.click||[])listener(event);return event;}
}
test('player buttons and video clicks never open an account dialog; explicit entry controls still work',()=>{
 for(const auth of ['true','false']){
  const container=new Element('div',{'data-auth':auth}),load=new Element('button',{'data-load-player':''},container),video=new Element('video',{},container);
  const profile=new Element('a',{'data-account-open':'',href:'/profile'}),guest=new Element('a',{'data-auth':'',href:'/login'}),signin=new Element('button',{'data-auth':''}),glyph=new Element('svg',{},profile),close=new Element('button');
  const elements=[container,load,video,profile,guest,signin];let opens=0;
  const dialog=new Element('dialog');Object.assign(dialog,{open:false,querySelector:()=>close,showModal(){this.open=true;opens++;},close(){this.open=false;}});
  const page={listen(el,type,fn){(el.listeners[type]??=[]).push(fn);},timeout(fn){fn();}};
  vm.runInNewContext(script,{window:{yoruPages:{register(fn){fn(page);}}},document:{querySelector:s=>s==='.account-dialog'?dialog:null,querySelectorAll:s=>elements.filter(e=>e.matches(s)),documentElement:{classList:{add(){},remove(){}}}},matchMedia:()=>({matches:true})});
  let playerClicks=0;(load.listeners.click??=[]).push(()=>playerClicks++);
  assert.equal(load.click().defaultPrevented,false);assert.equal(video.click().defaultPrevented,false);assert.equal(playerClicks,1);assert.equal(opens,0);assert.equal(dialog.open,false);
  for(const trigger of [glyph,guest,signin]){assert.equal(trigger.click().defaultPrevented,true);assert.equal(dialog.open,true);close.click();assert.equal(dialog.open,false);}
  assert.equal(opens,3);
 }
});
