import fs from 'node:fs/promises';import {setTimeout as delay} from 'node:timers/promises';
export async function openingFragment(url){
 const step=1024*1024,parts=[];
 async function piece(index){const start=index*step,end=start+step-1,path='backups/hero-originals/'+new URL(url).pathname.split('/').pop()+'.'+index+'.part',cached=await fs.readFile(path).catch(()=>null);if(cached)return cached;for(let n=0;n<4;n++)try{const r=await fetch(url,{headers:{Range:`bytes=${start}-${end}`},signal:AbortSignal.timeout(20000)});if(r.status!==206||!r.headers.get('content-range')?.startsWith(`bytes ${start}-`)){await r.body?.cancel();throw Error('Video range unavailable '+r.status);}const b=Buffer.from(await r.arrayBuffer());if(b.length>step)throw Error('Invalid range size');await fs.writeFile(path,b);return b;}catch(e){if(n===3)throw e;await delay(1500*(n+1));}}
 for(let i=0;i<16;i++){parts.push(await piece(i));if(i%4===3)console.log('Video fragment',i+1,'MiB');await delay(100);}
 return Buffer.concat(parts);
}
