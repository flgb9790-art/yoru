import {uiIcon} from './icons.js';
export function portalNavigation(req){
 const path=req.path||'/',groups=[['Смотреть',[['/','Главная','house'],['/catalog','Каталог','search'],['/schedule','Расписание','calendar-days'],['/top','Топ аниме','star']]],['Моё пространство',[['/continue','Продолжить','play'],['/library','Библиотека','bookmark'],['/following','Отслеживаемое','bell'],['/history','История','clock'],['/collections','Подборки','layout-grid']]]];
 if(req.user?.role==='admin')groups.push(['Управление',[['/admin','Админка','settings']]]);else if(req.user?.role==='moderator')groups.push(['Управление',[['/moderation','Модерация','settings']]]);
 return `<aside class="portal-sidebar"><a class="portal-brand" href="/" aria-label="YORU — главная">YORU<span>.</span></a><nav aria-label="Разделы YORU">${groups.map(([name,links])=>`<div class="portal-nav-group"><p>${name}</p>${links.map(([href,label,icon])=>`<a href="${href}"${path===href||href!=='/'&&path.startsWith(href+'/')?' aria-current="page"':''}>${uiIcon(icon)}<span>${label}</span></a>`).join('')}</div>`).join('')}</nav><div class="portal-sidebar-foot"><span class="portal-private-dot"></span> Личная библиотека</div></aside>`;
}
