// Origins are configured explicitly; forwarded Host never selects a redirect destination.
export function siteOrigin(){try{const u=new URL(process.env.BASE_URL);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)return null;return u.origin;}catch{return null;}}
export function legacyOrigins(){return String(process.env.LEGACY_SITE_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean).flatMap(s=>{try{const u=new URL(s);return u.protocol==='https:'&&!u.username&&!u.password&&u.pathname==='/'&&!u.search&&!u.hash?[u.origin]:[];}catch{return [];}});}
export function requestSiteOrigin(req){const main=siteOrigin();if(!main)return null;const host=req.get('host');return [main,...legacyOrigins()].find(origin=>new URL(origin).host.toLowerCase()===String(host).toLowerCase())||main;}
export function canonicalSite(req,res,next){const main=siteOrigin();if(!main||process.env.SITE_REDIRECT!=='true')return next();const legacy=legacyOrigins().some(origin=>new URL(origin).host.toLowerCase()===String(req.get('host')).toLowerCase());
 // Keep old Android installations, API clients, OAuth callbacks and on-device libraries operational.
 const exempt=/^(?:\/health(?:\/|$)|\/api(?:\/|$)|\/offline(?:\/|$)|\/offline-sw\.js$|\/auth\/telegram\/callback(?:\/|$))/i.test(req.path)||/YORUAndroid\//i.test(req.get('user-agent')||'')||/\.[a-z0-9]{1,8}$/i.test(req.path)&&!/^\/(?:sitemap\.xml|sitemaps\/[^/]+\.xml)$/.test(req.path);
 if(!legacy||exempt||!['GET','HEAD'].includes(req.method))return next();
 const target=main+'/'+String(req.originalUrl||'/').replace(/^\/+/, '');res.set('Cache-Control','no-store');res.vary('User-Agent');return res.redirect(301,target);
}
export function canonicalLink(req){const main=siteOrigin();if(!main)return '';const path=req.originalUrl||req.path||'/';if(!/^\/(?:$|catalog(?:[?\/]|$)|anime\/|schedule(?:[?\/]|$)|terms$|privacy$|copyright$|apps$|levels$|top\/|collections(?:[?\/]|$))/.test(path))return '';return main+'/'+path.replace(/^\/+/, '');}
