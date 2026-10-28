import sharp from 'sharp';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {colors as c,outline,ear,eye,iris,moon,nose,letters} from './brand-geometry.js';
const root=new URL('../',import.meta.url),save=async(p,v)=>{const u=new URL(p,root);await mkdir(new URL('.',u),{recursive:true});await writeFile(u,v);};
const path=(d,fill,extra='')=>`<path fill="${fill}" d="${d}"${extra}/>`;
const pair=(d,color)=>path(d,color)+path(d,color,' transform="translate(100 0) scale(-1 1)"');
const fox=({mono=false,tiny=false,dark=false}={})=>{const fg=dark?c.background:c.foreground,accent=mono?fg:c.accent;return pair(ear,accent)+path(outline+(mono?' '+moon:''),fg,mono?' fill-rule="evenodd"':'')+pair(eye,fg)+(tiny?'':pair(iris,accent))+(mono?'':path(moon,accent))+path(nose,fg);};
const mark=o=>`<g transform="translate(18 16) scale(.92)">${fox(o)}</g>`;
const svg=(inside,view='0 0 128 128',label='YORU — кицунэ')=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${view}" role="img" aria-label="${label}"><title>${label}</title>${inside}</svg>\n`;
const square=(o={})=>svg(`<rect width="128" height="128" rx="${o.square?0:31}" fill="${c.background}"/><g${o.safe?' transform="translate(12.8 12.8) scale(.8)"':''}>${mark(o)}</g>`);
const source=square();await save('public/favicon.svg',source);await save('public/assets/brand/mark.svg',svg(mark()));await save('public/assets/brand/icon.svg',source);await save('public/assets/brand/icon-mono.svg',square({mono:true}));
await save('public/assets/brand/wordmark.svg',svg(path(letters,c.wordmark,' fill-rule="evenodd"'),'0 0 131 29','YORU'));
await save('public/assets/brand/logo.svg',svg(`<g transform="scale(.375)">${mark()}</g>${path(letters,c.wordmark,' fill-rule="evenodd" transform="translate(61 8) scale(1.1)"')}`,'0 0 208 48','YORU'));
const png=async(input,size,p)=>save(p,await sharp(Buffer.from(input)).resize(size,size).png().toBuffer());
for(const size of [16,32,48])await png(square({tiny:size===16}),size,'public/favicon-'+size+'.png');
for(const size of [192,512]){await png(source,size,'public/app-icon-'+size+'.png');await png(square({safe:true,square:true}),size,'public/app-icon-maskable-'+size+'.png');}
// iOS applies the corner shape; keep its background opaque.
await png(square({square:true}),180,'public/apple-touch-icon.png');
const images=await Promise.all([16,32,48].map(n=>sharp(Buffer.from(square({tiny:n===16}))).resize(n,n).png().toBuffer()));
const header=Buffer.alloc(6+16*images.length);header.writeUInt16LE(1,2);header.writeUInt16LE(images.length,4);let offset=header.length;for(let i=0;i<images.length;i++){const pos=6+i*16,n=[16,32,48][i];header[pos]=n;header[pos+1]=n;header.writeUInt16LE(1,pos+4);header.writeUInt16LE(32,pos+6);header.writeUInt32LE(images[i].length,pos+8);header.writeUInt32LE(offset,pos+12);offset+=images[i].length;}await save('public/favicon.ico',Buffer.concat([header,...images]));
// Shared paths become native VectorDrawable paths, including mirrored features.
const native=o=>fox(o).replaceAll('fill-rule="evenodd"','android:fillType="evenOdd"').replace(/<path fill="([^"]+)" d="([^"]+)"([^>]*)\/>/g,(_,fill,d,extra)=>`<path android:fillColor="${fill}" android:pathData="${d}"${extra}/>`).replace(/<path([^>]+) transform="translate\(100 0\) scale\(-1 1\)"\/>/g,'<group android:translateX="100" android:scaleX="-1"><path$1/></group>');
const vector=(inside,v=128,n=64)=>`<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="${n}dp" android:height="${n}dp" android:viewportWidth="${v}" android:viewportHeight="${v}">${inside}</vector>\n`;
const group=(inside,x=18,y=16,s=.92)=>`<group android:translateX="${x}" android:translateY="${y}" android:scaleX="${s}" android:scaleY="${s}">${inside}</group>`;
const tile=`<path android:fillColor="${c.background}" android:pathData="M31 0 H97 A31 31 0 0 1 128 31 V97 A31 31 0 0 1 97 128 H31 A31 31 0 0 1 0 97 V31 A31 31 0 0 1 31 0 Z"/>`;
await save('android/app/src/main/res/drawable/brand_mark.xml',vector(tile+group(native({}))));
await save('android/app/src/main/res/drawable/launcher_foreground.xml',vector(group(native({}),25.5,24.5,.57),108,108));
await save('android/app/src/main/res/drawable/launcher_monochrome.xml',vector(group(native({mono:true}),25.5,24.5,.57),108,108));
await save('android/app/src/main/res/drawable/ic_notification.xml',vector(group(native({mono:true,tiny:true})),128,24));
const oldIcon=/<rect width="64" height="64" rx="16" fill="#292137"\/><path d="M40 12\.404[^<]+\/><path d="M32 24L46 32L32 40Z"[^<]+\/>/;
for(const name of ['ios-share','ios-home','ios-confirm','android-install']){const u=new URL('public/assets/install/'+name+'.svg',root),raw=await readFile(u,'utf8');if(oldIcon.test(raw))await writeFile(u,raw.replace(oldIcon,`<g transform="scale(.5)"><rect width="128" height="128" rx="31" fill="${c.background}"/>${mark()}</g>`));}
const preview=svg(`<rect width="1080" height="510" fill="#F7F0FF"/><g transform="translate(40 45) scale(3.25)"><rect width="128" height="128" rx="31" fill="${c.background}"/>${mark()}</g><g transform="translate(550 55) scale(1.45)">${mark({dark:true})}</g><g transform="translate(800 55) scale(1.45)"><rect width="128" height="128" rx="31" fill="#B499D7"/>${mark()}</g>${[[560,340,.75],[720,372,.5],[850,388,.375],[955,412,.1875]].map(([x,y,s])=>`<g transform="translate(${x} ${y}) scale(${s})"><rect width="128" height="128" rx="31" fill="${c.background}"/>${mark()}</g>`).join('')}`,'0 0 1080 510');
await save('public/assets/brand/preview.svg',preview);await save('public/assets/brand/preview.png',await sharp(Buffer.from(preview)).png().toBuffer());console.log('Built approved YORU kitsune: SVG, ICO, Apple/PWA and Android vectors.');
