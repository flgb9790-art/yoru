import {forbiddenGenre} from './import-policy.js';
const cache=new WeakMap();
export async function catalogueGenres(db,{refresh=false,respectSettings=true}={}){
 const config=respectSettings?(await db.query('SELECT config FROM auto_settings WHERE id=1')).rows[0]?.config||{}:{};
 const normalize=s=>String(s).normalize('NFKC').trim().toLowerCase().replace(/ё/g,'е');
 const included=(config.genres||[]).map(normalize),excluded=(config.excludedGenres||[]).map(normalize),selection=JSON.stringify([included,excluded,respectSettings]);
 const saved=cache.get(db);if(!refresh&&saved&&saved.selection===selection&&saved.until>Date.now())return saved.genres;
 const rows=(await db.query("SELECT genres FROM anime WHERE blocked=FALSE AND status<>'anons'")).rows;
 const genres=[...new Set(rows.flatMap(a=>a.genres||[]).filter(g=>typeof g==='string'&&g.trim()&&!forbiddenGenre({genres:[g]})&&!excluded.includes(normalize(g))&&(!included.length||included.includes(normalize(g)))))].sort((a,b)=>a.localeCompare(b,'ru'));
 cache.set(db,{genres,selection,until:Date.now()+30000});return genres;
}
export function mountGenreMenu(app,db){app.use(async(req,res,next)=>{
 if(req.method==='GET'&&!/^\/(api|auth|media)(\/|$)/.test(req.path))req.menuGenres=await catalogueGenres(db);
 next();
});}
