import {staffOnlyGenre} from './anime-access.js';
import {forbiddenGenre} from './import-policy.js';
const cache=new WeakMap();
export async function catalogueGenres(db,{refresh=false,staff=false}={}){
 const saved=cache.get(db);if(!refresh&&saved&&saved.until>Date.now())return staff?[...saved.genres,'Хентай','Эротика'].sort((a,b)=>a.localeCompare(b,'ru')):saved.genres;
 const rows=(await db.query("SELECT genres FROM anime WHERE blocked=FALSE AND status<>'anons'")).rows;
 const genres=[...new Set(rows.flatMap(a=>a.genres||[]).filter(g=>typeof g==='string'&&g.trim()&&!staffOnlyGenre(g)&&!forbiddenGenre({genres:[g]})))].sort((a,b)=>a.localeCompare(b,'ru'));
 cache.set(db,{genres,until:Date.now()+30000});return staff?[...genres,'Хентай','Эротика'].sort((a,b)=>a.localeCompare(b,'ru')):genres;
}
export function mountGenreMenu(app,db){app.use(async(req,res,next)=>{
 if(req.method==='GET'&&!/^\/(api|auth|media)(\/|$)/.test(req.path))req.menuGenres=await catalogueGenres(db,{staff:['admin','moderator'].includes(req.user?.role)});
 next();
});}
