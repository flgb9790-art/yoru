import media from './hero-media.json' with {type:'json'};
const videoNames={48316:'Восхождение в тени!',44511:'Человек-бензопила',52991:'Фрирен',37450:'Этот глупый свин…'};
export const profileAssets={
 avatar:[['naruto','Наруто'],['luffy','Луффи'],['jinwoo','Сон Джин Ву'],['gojo','Годжо'],['nezuko','Незуко'],['frieren','Фрирен'],['mikasa','Микаса'],['anya','Аня']],
 cover:[['sky','После дождя у моря'],['sakura','Дверь в закат'],['forest','Летний экспресс'],['city','Сумерки у реки'],...media.map(item=>['video-'+item.shikimori_id,videoNames[item.shikimori_id]+' · видео'])]
};
// Older SVG files remain available at their stored URLs for existing profiles.
export const assetUrl=(kind,id)=>kind==='cover'&&media.some(item=>'video-'+item.shikimori_id===id)?'/assets/hero/'+id.slice(6)+'-cover.webp':'/assets/profile/'+kind+'-'+id+'.webp';
export const profileCoverVideo=cover=>media.find(item=>assetUrl('cover','video-'+item.shikimori_id)===cover)?.video||'';
