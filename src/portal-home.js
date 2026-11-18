import {card,esc} from './views.js';
import {resumeLink} from './follows.js';
import {uiIcon} from './icons.js';
function resumeCard(a){const image=a.metadata?.screenshots?.[0]||a.poster;return `<a class="portal-resume" href="${esc(resumeLink(a))}">${image?`<img src="${esc(image)}" alt="" loading="lazy">`:''}<span class="portal-resume-play">${uiIcon('play',{size:22})}</span><span class="portal-resume-copy"><strong>${esc(a.name)}</strong><small>${a.resume_episode} серия · ${Math.floor(a.resume_position/60)}:${String(a.resume_position%60).padStart(2,'0')}</small></span></a>`;}
export function portalDiscovery(popular,continuing){
 const section=(title,note,href,items)=>`<section class="portal-shelf"><div class="portal-shelf-heading"><div><h2>${title}</h2><p>${note}</p></div><a href="${href}">Смотреть всё →</a></div><div class="grid home-grid${href==='/continue'?' portal-resume-grid':''}">${items}</div></section>`;
 return `${continuing.length?section('Продолжить просмотр','Твои истории ждут тебя','/continue',continuing.slice(0,6).map(resumeCard).join('')):''}${popular.length?section('Стоит посмотреть','Истории с высокой популярностью в каталоге','/catalog?sort=popular',popular.slice(0,12).map(a=>card(a)).join('')):''}`;
}
