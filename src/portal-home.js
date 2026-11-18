import {card} from './views.js';
import {resumeCard} from './follows.js';
export function portalDiscovery(popular,continuing){
 const section=(title,note,href,items)=>`<section class="portal-shelf"><div class="portal-shelf-heading"><div><h2>${title}</h2><p>${note}</p></div><a href="${href}">Смотреть всё →</a></div><div class="grid home-grid">${items}</div></section>`;
 return `${continuing.length?section('Продолжить просмотр','Твои истории ждут тебя','/continue',continuing.slice(0,6).map(resumeCard).join('')):''}${popular.length?section('Стоит посмотреть','Истории с высокой популярностью в каталоге','/catalog?sort=popular',popular.slice(0,12).map(a=>card(a)).join('')):''}`;
}
