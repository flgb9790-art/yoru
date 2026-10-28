import {randomBytes} from 'node:crypto';
import {siteOrigin} from './site-origin.js';
import {staffOnlyGenre} from './anime-access.js';

const html=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const seoText=value=>String(value??'').replace(/<[^>]*>/g,' ').replace(/\[(?:\/?[a-z_]+)(?:=[^\]]*)?\]/gi,' ').replace(/&(?:amp|lt|gt|quot|nbsp);/g,' ').replace(/\s+/g,' ').trim();
const short=(value,max=180)=>{const s=seoText(value);return s.length>max?s.slice(0,max-1).replace(/\s+\S*$/,'')+'…':s;};
const integer=v=>/^\d+$/.test(String(v))&&Number.isSafeInteger(+v)&&+v>0?+v:1;
const publicPages=new Set(['/','/catalog','/schedule','/new-episodes','/collections','/top','/apps','/levels','/terms','/privacy','/copyright']);
const tracking=k=>/^(utm_.+|gclid|fbclid|yclid)$/.test(k);
export const publicAnime=a=>!a.blocked&&a.status!=='anons'&&Number(a.aired)>0&&!a.metadata?.manual_staff_anime&&!a.staff_only&&!a.genres?.some(staffOnlyGenre);

// The same rules power headers, SSR metadata and client-side navigation.
export function seoPolicy(req){
 const path=(req.path||'/').replace(/\/+$/,'')||'/',q=req.query||{},params=new URLSearchParams(),anime=/^\/anime\/[^/]+$/.test(path),collection=/^\/collections\/[a-z0-9-]+$/.test(path);
 let index=publicPages.has(path)||anime||collection;
 const entries=Object.entries(q).filter(([k,v])=>!tracking(k)&&String(v).trim()!=='');
 if(anime){/* Playback and discussion parameters share the title's canonical URL. */}
 else if(path==='/catalog'){
  const facets=entries.filter(([k])=>k!=='page');
  const allowed=facets.length===0||facets.length===1&&['genre','country','kind'].includes(facets[0][0])&&!Array.isArray(facets[0][1]);
  index=index&&allowed&&!facets.some(([k,v])=>k==='genre'&&[].concat(v).some(staffOnlyGenre));
  for(const [k,v]of facets.sort(([a],[b])=>a.localeCompare(b)))for(const value of [].concat(v))params.append(k,String(value));
  if(integer(q.page)>1)params.set('page',String(integer(q.page)));
 }else if(path==='/'||path==='/schedule')index=index&&entries.length===0;
 else if(collection||['/collections','/top','/new-episodes'].includes(path)){
  index=index&&entries.every(([k])=>k==='page');
  if(integer(q.page)>1)params.set('page',String(integer(q.page)));
 }else if(entries.length)index=false;
 const origin=siteOrigin(),url=origin?origin+path+(params.size?'?'+params:''):null;
 return {index,url,path,page:integer(q.page)};
}

export function seoMiddleware(req,res,next){
 req.seoNonce=randomBytes(18).toString('base64');req.seoResponseStatus=()=>res.statusCode;
 const lower=(req.path||'/').toLowerCase(),match=/^\/(?:catalog|schedule|new-episodes|collections|top|apps|levels|terms|privacy|copyright)(?:\/|$)/.test(lower)||/^\/anime\/[^/]+\/?$/.test(lower);
 if(['GET','HEAD'].includes(req.method)&&match){let normalized=req.path.replace(/^\/[^/]+/,v=>v.toLowerCase()).replace(/\/+$/,'');if(normalized!==req.path)return res.redirect(301,normalized+String(req.originalUrl||'').slice(req.path.length));}
 const policy=seoPolicy(req),staticAsset=/\.(?:js|css|png|jpe?g|webp|svg|ico|woff2?)$/i.test(req.path)&&!/^\/(?:api|media|offline)(?:\/|$)/.test(req.path);if(!staticAsset)res.set('X-Robots-Tag',policy.index?'index, follow, max-image-preview:large':'noindex, follow');
 const writeHead=res.writeHead;res.writeHead=function(status,...args){if(status>=400||req.seo?.noindex||req.seo?.anime&&!publicAnime(req.seo.anime))this.setHeader('X-Robots-Tag',status>=400?'noindex, nofollow':'noindex, follow');return writeHead.call(this,status,...args);};
 next();
}

const descriptions={
 '/':'Аниме на YORU: каталог по жанрам, новые серии и расписание выхода. Находи любимые истории, выбирай озвучку и продолжай просмотр.',
 '/catalog':'Каталог аниме YORU: выбирай по жанрам, году и формату. Описания, постеры, доступные серии и переход к просмотру.',
 '/schedule':'Расписание выхода аниме и новых серий на YORU. Даты оригинального эфира, время выхода и обратный отсчёт.',
 '/new-episodes':'Новые серии аниме на YORU. Последние обновления озвучки и выходящие тайтлы с переходом к просмотру.',
 '/collections':'Подборки аниме YORU по жанрам, настроению и темам: приключения, романтика, фэнтези и другие истории.',
 '/top':'Топ 100 аниме каталога YORU по рейтингу и просмотрам. Выбирай следующую историю по оценкам зрителей.',
 '/apps':'Установи YORU на Android или добавь на экран «Домой» на iPhone. Инструкции установки, просмотр и офлайн-загрузки доступных серий.',
 '/levels':'Уровни и опыт на YORU: награды за просмотр серий, ежедневные входы и достижения. Узнай, как развивается аккаунт.',
 '/terms':'Пользовательское соглашение YORU: правила аккаунта, общения, просмотра, загрузок и обращения к администрации.',
 '/privacy':'Политика конфиденциальности YORU: данные аккаунта, публичный профиль, cookies, локальные загрузки и обращения о данных.',
 '/copyright':'Обращения правообладателей в YORU: сведения о спорном материале, подтверждение полномочий и закрытая форма обращения.'
};
export function catalogueHeading(query={}){const facet=['genre','country','kind'].find(k=>query[k]&&!Array.isArray(query[k])),value=facet?String(query[facet]):'';return facet==='genre'?'Аниме жанра «'+value+'»':facet==='country'?({'Япония':'Японские аниме','Китай':'Китайская анимация'}[value]||'Аниме · '+value):facet==='kind'?({movie:'Аниме-фильмы',tv:'Аниме-сериалы',ova:'Аниме OVA',ona:'Аниме ONA',special:'Спецвыпуски аниме'}[value]||'Аниме · '+value):'Каталог аниме';}
export function seoHead(title,req){
 const p=seoPolicy(req),custom=req.seo||{},a=custom.anime,origin=siteOrigin(),error=req.seoResponseStatus?.()>=400;
 const index=p.index&&!error&&!custom.noindex&&(!a||publicAnime(a));
 let heading=custom.title||title,description=custom.description||descriptions[p.path]||'YORU — аниме, любимые истории и общение.';
 if(p.path==='/')heading='Аниме онлайн — каталог, новые серии и расписание';
 if(p.path==='/catalog'){
  const facet=['genre','country','kind'].find(k=>req.query?.[k]&&!Array.isArray(req.query[k]));
  const value=facet?String(req.query[facet]):'';
  heading=catalogueHeading(req.query);
  if(value)description=heading+' на YORU. Описания тайтлов, доступные серии и выбор аниме для просмотра.';
 }
 if(a){heading=a.name+(a.year?' ('+a.year+')':'')+' — смотреть аниме онлайн';description=short(a.description,145)||('Описание, серии и просмотр аниме «'+a.name+'» на YORU.');description+=' '+[a.year,a.aired? a.aired+' серий':'',...(a.genres||[]).slice(0,2)].filter(Boolean).join(' · ');}
 if(p.page>1){heading+=' — страница '+p.page;description+=' Страница '+p.page+'.';}
 const fullTitle=short(heading,115)+' · YORU',image=a?.poster||custom.image||(origin?origin+'/app-icon-512.png?v=5':null),safeImage=image&&/^https:\/\//.test(image)?image:null;
 const robots=index?'index, follow, max-image-preview:large':'noindex, '+(error?'nofollow':'follow');
 const meta=(name,value,property=false)=>`<meta ${property?'property':'name'}="${name}" content="${html(value)}" data-seo>`;
 let head=`<title>${html(fullTitle)}</title>${meta('description',short(description,210))}${meta('robots',robots)}`;
 if(p.url&&!error)head+=`<link rel="canonical" href="${html(p.url)}" data-seo>`;
 if(!index)return head;
 head+=meta('og:type',a?'article':'website',true)+meta('og:site_name','YORU',true)+meta('og:locale','ru_RU',true)+meta('og:title',fullTitle,true)+meta('og:description',short(description,210),true)+meta('twitter:card',safeImage?'summary_large_image':'summary');
 if(p.url)head+=meta('og:url',p.url,true);
 if(safeImage)head+=meta('og:image',safeImage,true)+meta('og:image:alt',a?.name||'YORU — аниме',true);
 if(origin&&p.url){
  const graph=[{'@type':'WebSite','@id':origin+'/#website',url:origin+'/',name:'YORU',inLanguage:'ru'}, {'@type':'WebPage','@id':p.url+'#webpage',url:p.url,name:fullTitle,description:short(description,210),isPartOf:{'@id':origin+'/#website'},inLanguage:'ru'}];
  if(a){const type=a.kind==='movie'?'Movie':['tv','ona'].includes(a.kind)?'TVSeries':'CreativeWork',work={'@type':type,'@id':p.url+'#anime',name:a.name,url:p.url,genre:a.genres||[]};
   if(a.original_name)work.alternateName=a.original_name;if(safeImage)work.image=safeImage;if(a.description)work.description=short(a.description,500);if(type==='TVSeries'&&Number(a.episodes)>0)work.numberOfEpisodes=Number(a.episodes);
   if(/^\d{4}-\d{2}-\d{2}$/.test(a.metadata?.airDate||''))work.datePublished=a.metadata.airDate;
   graph.push(work);graph[1].mainEntity={'@id':work['@id']};
   graph.push({'@type':'BreadcrumbList',itemListElement:[['Главная',origin+'/'],['Каталог аниме',origin+'/catalog'],[a.name,p.url]].map(([name,item],i)=>({'@type':'ListItem',position:i+1,name,item}))});
  }
  const json=JSON.stringify({'@context':'https://schema.org','@graph':graph}).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026');
  head+=`<script type="application/ld+json" nonce="${html(req.seoNonce||'')}" data-seo>${json}</script>`;
 }
 if(p.path==='/'&&/^[a-zA-Z0-9_-]{10,200}$/.test(process.env.GOOGLE_SITE_VERIFICATION||''))head+=meta('google-site-verification',process.env.GOOGLE_SITE_VERIFICATION);
 return head;
}

const sitemapPageSize=1000;
export function mountSeo(app,db){
 app.get('/robots.txt',(req,res)=>res.type('text/plain').set('Cache-Control','public, max-age=300').send('User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /admin\nDisallow: /moderation\nDisallow: /auth/\nDisallow: /offline/\nDisallow: /offline-sw.js\nDisallow: /downloads/\n'+(siteOrigin()?'\nSitemap: '+siteOrigin()+'/sitemap.xml\n':'')));
 const entries=async()=>{const rows=(await db.query("SELECT id,genres,country,kind,metadata->>'manual_staff_anime' AS staff_only FROM anime WHERE blocked=FALSE AND status IN ('ongoing','released') AND aired>0 ORDER BY id")).rows;return rows.filter(a=>a.staff_only!=='true'&&!a.genres.some(staffOnlyGenre));};
 const xml=(res,body)=>res.type('application/xml').set({'Cache-Control':'public, max-age=300','X-Robots-Tag':'noindex'}).send('<?xml version="1.0" encoding="UTF-8"?>\n'+body);
 app.get('/sitemap.xml',async(req,res)=>{const origin=siteOrigin();if(!origin)return res.sendStatus(503);const rows=await entries();return xml(res,'<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+['/sitemaps/pages.xml',...Array.from({length:Math.ceil(rows.length/sitemapPageSize)},(_,i)=>'/sitemaps/anime-'+(i+1)+'.xml')].map(path=>'<sitemap><loc>'+html(origin+path)+'</loc></sitemap>').join('')+'</sitemapindex>');});
 app.get('/sitemaps/pages.xml',async(req,res)=>{const origin=siteOrigin();if(!origin)return res.sendStatus(503);return xml(res,'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+[...publicPages,...[...new Set((await entries()).flatMap(a=>[...a.genres.filter(g=>!staffOnlyGenre(g)).map(g=>'/catalog?genre='+encodeURIComponent(g)),...(a.country?['/catalog?country='+encodeURIComponent(a.country)]:[]),...(a.kind?['/catalog?kind='+encodeURIComponent(a.kind)]:[])]))].sort()].map(path=>'<url><loc>'+html(origin+path)+'</loc></url>').join('')+'</urlset>');});
 app.get('/sitemaps/:part',async(req,res)=>{const match=/^anime-([1-9]\d*)\.xml$/.exec(req.params.part);if(!match)return res.sendStatus(404);const page=Number(match[1]);if(!Number.isSafeInteger(page)||page>100000)return res.sendStatus(404);const origin=siteOrigin();if(!origin)return res.sendStatus(503);const rows=await entries(),part=rows.slice((page-1)*sitemapPageSize,page*sitemapPageSize);if(!part.length)return res.sendStatus(404);return xml(res,'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+part.map(a=>'<url><loc>'+html(origin+'/anime/'+encodeURIComponent(a.id))+'</loc></url>').join('')+'</urlset>');});
}
