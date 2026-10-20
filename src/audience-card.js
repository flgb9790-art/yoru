import {card,esc} from './views.js';
import {plainDescription} from './shikimori.js';
export function audienceCard(a){
 const description=plainDescription(a.description||'').replace(/\s+/g,' ').trim(),meta=[a.year,...(a.genres||[]).slice(0,2)].filter(Boolean).join(' · ');
 const copy=`<a class="audience-copy" href="/anime/${esc(a.id)}"><strong>${esc(a.name)}</strong><small>${esc(meta)}</small>${description?`<p>${esc(description.slice(0,220))}</p>`:'<p>Открой историю и выбери, что посмотреть сегодня.</p>'}<span>Об истории <span aria-hidden="true">→</span></span></a>`;
 return card(a).replace('</article>',copy+'</article>');
}
