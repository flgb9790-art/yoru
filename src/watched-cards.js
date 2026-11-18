import {promoteCompletedLibrary} from './library-completion.js';
import {AsyncLocalStorage} from 'node:async_hooks';
const viewers=new AsyncLocalStorage();
export function cardProgress(anime){return viewers.getStore()?.progress?.get(anime.id)||null;}
export function isCardWatched(anime,state=viewers.getStore()){
 if(!state)return false;
 const status=state.library.get(anime.id);
 // An explicit list choice is authoritative, even for an ongoing title.
 if(status==='completed')return true;
 const total=Number(anime.episodes)||Number(anime.aired)||0;
 const finished=anime.status==='released'||anime.status!=='anons'&&Number(anime.episodes)>0&&Number(anime.aired)>=Number(anime.episodes);
 if(!finished)return false;
 return status==='favorite'||total>0&&Boolean(state.episodes.get(anime.id)?.has(total));
}
export function watchedCards(db){return async(req,res,next)=>{
 const state={library:new Map(),episodes:new Map(),progress:new Map()};
 if(req.user&&req.method==='GET'&&!req.path.startsWith('/api/')){
  await promoteCompletedLibrary(db,req.user.id);
  const [lists,history]=await Promise.all([db.query('SELECT anime_id,status FROM library WHERE user_id=$1',[req.user.id]),db.query('SELECT DISTINCT anime_id,episode FROM watch_history WHERE user_id=$1 AND completed=TRUE AND season>0',[req.user.id])]);
  for(const row of lists.rows)state.library.set(row.anime_id,row.status);
  for(const row of history.rows){if(!state.episodes.has(row.anime_id))state.episodes.set(row.anime_id,new Set());state.episodes.get(row.anime_id).add(Number(row.episode));}
  const positions=await db.query('SELECT anime_id,episode,season,position_seconds,provider,source_release_id,completed,updated_at FROM watch_history WHERE user_id=$1 AND position_seconds>0 ORDER BY updated_at DESC',[req.user.id]);
  for(const row of positions.rows)if(!state.progress.has(row.anime_id))state.progress.set(row.anime_id,row);
 }
 return viewers.run(state,next);
};}
