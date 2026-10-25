import manifest from '../public/assets/icons/manifest.json' with {type:'json'};
const iconNames=new Set(manifest.icons);
const attribute=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export const iconUrl=name=>'/assets/icons/lucide.svg?v=1#'+(iconNames.has(name)?name:'circle-help');
export function uiIcon(name,{className='',size=18}={}){const safeName=iconNames.has(name)?name:'circle-help',pixels=Number.isFinite(Number(size))?Math.max(10,Math.min(80,Number(size))):18;return `<svg class="icon icon-${safeName}${className?' '+attribute(className):''}" width="${pixels}" height="${pixels}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><use href="${iconUrl(safeName)}"></use></svg>`;}
