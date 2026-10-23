export const profileAssets={
 avatar:[['naruto','Наруто'],['luffy','Луффи'],['jinwoo','Сон Джин Ву'],['gojo','Годжо'],['nezuko','Незуко'],['frieren','Фрирен'],['mikasa','Микаса'],['anya','Аня']],
 cover:[['sky','После дождя у моря'],['sakura','Дверь в закат'],['forest','Летний экспресс'],['city','Сумерки у реки']]
};
// Older SVG files remain available at their stored URLs for existing profiles.
export const assetUrl=(kind,id)=>'/assets/profile/'+kind+'-'+id+'.webp';
