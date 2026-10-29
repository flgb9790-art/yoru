import geoip from 'geoip-country';
export const countryCode=value=>typeof value==='string'&&/^[A-Z]{2}$/.test(value)?value:null;
export function visitorCountry(ip){try{return countryCode(geoip.lookup(ip)?.country);}catch{return null;}}
// Never trust user-controlled country headers. req.ip uses the configured reverse-proxy boundary.
export const countryMiddleware=(lookup=visitorCountry)=>(req,res,next)=>{req.viewerCountry=countryCode(lookup(req.ip));next();};
export function blockedCountries(value){if(!Array.isArray(value)||value.some(v=>!countryCode(v)))throw Error('Invalid Kodik country restrictions');return [...new Set(value)];}
export function aggregateCountries(items){const result=new Map();for(const row of items){const id=Number(row.shikimori_id);if(!Number.isSafeInteger(id)||id<1)continue;const countries=blockedCountries(row.blocked_countries),previous=result.get(id);result.set(id,previous?previous.filter(c=>countries.includes(c)):countries);}return result;}
// A complete catalogue scan is published atomically. A failed/partial scan never removes old bans.
export async function syncKodikGeo(db,{fetcher=fetch,token=process.env.KODIK_API_TOKEN}={}){
 if(!token)return {unavailable:true};
 const claimed=await db.query("UPDATE kodik_geo_state SET lease_until=NOW()+INTERVAL '15 minutes' WHERE id=1 AND next_run<=NOW() AND lease_until<NOW() RETURNING id");if(!claimed.rowCount)return {busy:true};
 try{
  const countries=new Map(),seen=new Set();let cursor='',pages=0,rows=0;const deadline=Date.now()+10*60000;
  do{
   if(++pages>2000||Date.now()>deadline)throw Error('Catalogue scan limit');
   const body=new URLSearchParams({token,types:'anime,anime-serial',limit:'100',sort:'created_at',order:'asc'});if(cursor)body.set('next',cursor);
   const response=await fetcher('https://kodik-api.com/list',{method:'POST',body,redirect:'error',signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error('Catalogue unavailable');const data=await response.json();if(!Array.isArray(data.results)||data.error||!Object.hasOwn(data,'next_page')||(data.next_page!==null&&typeof data.next_page!=='string')||!data.results.length)throw Error('Invalid catalogue');
   for(const [id,blocked]of aggregateCountries(data.results)){const previous=countries.get(id);countries.set(id,previous?previous.filter(c=>blocked.includes(c)):blocked);}rows+=data.results.length;
   cursor='';if(data.next_page){const next=new URL(data.next_page);if(next.origin!=='https://kodik-api.com'||next.pathname!=='/list'||!next.searchParams.get('next'))throw Error('Invalid catalogue cursor');cursor=next.searchParams.get('next');if(seen.has(cursor))throw Error('Repeated catalogue cursor');seen.add(cursor);}
   await db.query("UPDATE kodik_geo_state SET lease_until=NOW()+INTERVAL '15 minutes' WHERE id=1");
  }while(cursor);
  if(!countries.size)throw Error('Empty catalogue');
  const client=await db.connect();try{await client.query('BEGIN');await client.query('DELETE FROM kodik_geo');for(const [id,blocked]of countries)if(blocked.length)await client.query('INSERT INTO kodik_geo(shikimori_id,blocked_countries) VALUES($1,$2)',[id,blocked]);await client.query("UPDATE kodik_geo_state SET checked_at=NOW(),next_run=NOW()+INTERVAL '24 hours',lease_until='1970-01-01',last_error='' WHERE id=1");await client.query('COMMIT');}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  return {pages,rows,restricted:[...countries.values()].filter(v=>v.length).length};
 }catch{await db.query("UPDATE kodik_geo_state SET lease_until='1970-01-01',next_run=NOW()+INTERVAL '15 minutes',last_error='Не удалось полностью обновить ограничения Kodik' WHERE id=1");throw Error('Kodik geographic restrictions sync failed');}
}
export function startKodikGeo(db){let busy=false,stopped=false;const tick=async()=>{if(busy||stopped)return;busy=true;try{await syncKodikGeo(db);}catch{console.error(JSON.stringify({event:'kodik_geo_sync_failed'}));}finally{busy=false;}};const timer=setInterval(tick,60000);timer.unref();tick();return ()=>{stopped=true;clearInterval(timer);};}
