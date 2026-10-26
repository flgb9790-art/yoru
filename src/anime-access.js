import {AsyncLocalStorage} from 'node:async_hooks';
export const staffOnlyGenre=g=>['хентай','hentai','эротика','erotica','яой','yaoi'].includes(String(g||'').normalize('NFKC').trim().toLowerCase());
export const manualStaffAnime=a=>a.metadata?.manual_staff_anime===true;
// Scope catalogue reads to each HTTP request, including joined lists, counts and transaction clients.
// Background imports keep the original pool and their independent import policy.
export function requestAnimeAccess(pool){
 const context=new AsyncLocalStorage();
 const wrap=target=>new Proxy(target,{get(object,key){if(key==='query')return (sql,...args)=>{
  const req=context.getStore();
  if(req&&!['admin','moderator'].includes(req.user?.role)&&typeof sql==='string'&&/^\s*(SELECT|WITH)\b/i.test(sql))sql=sql.replace(/\b(FROM|JOIN)\s+anime\b/gi,(match,keyword,offset,text)=>{
   const next=text.slice(offset+match.length).trimStart().match(/^([a-z_][a-z_0-9]*)/i)?.[1];
   const hasAlias=next&&!/^(where|join|left|right|inner|outer|full|cross|on|order|group|limit|offset|for|union|having|as)$/i.test(next)||next?.toLowerCase()==='as';
   const alias=hasAlias?'':' AS anime';
   return keyword+" (SELECT * FROM anime WHERE COALESCE(metadata->>'manual_staff_anime','false')<>'true' AND NOT ('Хентай'=ANY(genres) OR 'Эротика'=ANY(genres) OR 'Hentai'=ANY(genres) OR 'Erotica'=ANY(genres) OR 'хентай'=ANY(genres) OR 'эротика'=ANY(genres) OR 'hentai'=ANY(genres) OR 'erotica'=ANY(genres) OR 'Яой'=ANY(genres) OR 'яой'=ANY(genres) OR 'Yaoi'=ANY(genres) OR 'yaoi'=ANY(genres)))"+alias;
  });
  return object.query(sql,...args);
 };if(key==='connect')return async()=>wrap(await object.connect());const value=object[key];return typeof value==='function'?value.bind(object):value;}});
 return {db:wrap(pool),middleware:(req,res,next)=>context.run(req,next)};
}
