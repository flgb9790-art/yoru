import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {defaults,validateConfig,currentYear} from './parser-config.js';
import {shikiRequest,fetchAnime,saveImported} from './shikimori.js';
import {enrichCandidates,assertSelected} from './parser-candidates.js';
import {forbiddenGenre,isImportSkip} from './import-policy.js';
import {lookupCountries} from './countries.js';
import {catalogueGenres} from './genre-menu.js';

// This dictionary is separate from the public catalogue and automatic selection.
export async function sourceGenres(db,{request=shikiRequest,refresh=false}={}){
 const saved=(await db.query('SELECT * FROM parser_genres WHERE id=1')).rows[0];
 if(!refresh&&saved?.genres.length&&Date.now()-Date.parse(saved.fetched_at)<86400000)return {genres:saved.genres,stale:false};
 try{
  const response=await request('/api/graphql',fetch,{query:'{ genres(entryType: Anime) { id name russian kind } }'}),data=response.data?.genres;
  if(response.errors?.length||!Array.isArray(data))throw Error('Не удалось прочитать справочник Shikimori');
  const genres=data.filter(g=>Number.isSafeInteger(Number(g.id))&&Number(g.id)>0&&g.russian&&!forbiddenGenre({genres:[g.name,g.russian]})).map(g=>({id:Number(g.id),name:g.russian,english:g.name||'',kind:g.kind})).sort((a,b)=>a.name.localeCompare(b.name,'ru'));
  if(!genres.length)throw Error('Shikimori вернул пустой справочник жанров');
  await db.query('UPDATE parser_genres SET genres=$1,fetched_at=NOW() WHERE id=1',[JSON.stringify(genres)]);
  return {genres,stale:false};
 }catch(error){if(saved?.genres.length)return {genres:saved.genres,stale:true};throw error;}
}

const inputSchema=z.object({
 genreIds:z.array(z.coerce.number().int().positive()).min(1).max(30),
 genreMatch:z.enum(['any','all']).default('any'),
 country:z.enum(['','Япония','Китай','Южная Корея','Другие страны']).default(''),
 minYear:z.coerce.number().int().min(1900).max(2100),maxYear:z.coerce.number().int().min(1900).max(2100),
 minRating:z.coerce.number().min(0).max(10),limit:z.coerce.number().int().min(1).max(1000),
 order:z.enum(['ranked','popularity','aired_on','id']).default('ranked'),
 format:z.enum(['','tv','movie','ova','ona','special','tv_special']).default(''),
 status:z.enum(['','ongoing','released']).default(''),search:z.string().trim().max(120).default(''),
}).refine(c=>c.minYear<=c.maxYear,'Проверь диапазон лет');
export function manualConfig(body,dictionary){
 const value=inputSchema.parse({...body,genreIds:[].concat(body.genreIds||[])}),ids=[...new Set(value.genreIds)],selected=ids.map(id=>dictionary.find(g=>g.id===id));
 if(selected.some(g=>!g))throw Error('Обнови список жанров и выбери их заново');
 const config=validateConfig({...defaults(),minYear:value.minYear,maxYear:value.maxYear,minRating:value.minRating,genres:selected.map(g=>g.name),genreMatch:value.genreMatch,countries:value.country?[value.country]:[],kinds:value.format?[value.format]:defaults().kinds,statuses:value.status?[value.status]:['ongoing','released'],search:value.search,order:value.order,requirePoster:true,requireEpisodes:true});
 return {...config,genreIds:ids,limit:value.limit};
}
export const manualDefaults=()=>({minYear:1900,maxYear:currentYear(),minRating:6,limit:50});
export async function createManualRun(db,body,requestKey,{request=shikiRequest}={}){
 if(!z.string().uuid().safeParse(requestKey).success)throw Error('Обнови форму запуска');
 const duplicate=(await db.query('SELECT id FROM manual_parse_runs WHERE request_key=$1',[requestKey])).rows[0];if(duplicate)return duplicate.id;
 if(+(await db.query("SELECT COUNT(*) AS count FROM manual_parse_runs WHERE status IN('queued','running','paused','failed')")).rows[0].count>=5)throw Error('Можно сохранить до 5 незавершённых запусков. Останови ненужный.');
 const {genres}=await sourceGenres(db,{request}),config=manualConfig(body,genres),id=randomUUID();
 await db.query('INSERT INTO manual_parse_runs(id,request_key,config) VALUES($1,$2,$3) ON CONFLICT(request_key) DO NOTHING',[id,requestKey,JSON.stringify(config)]);
 return (await db.query('SELECT id FROM manual_parse_runs WHERE request_key=$1',[requestKey])).rows[0].id;
}
export async function controlManualRun(db,id,action){
 const transitions={pause:{from:['queued','running'],to:'paused'},resume:{from:['paused','failed'],to:'queued'},stop:{from:['queued','running','paused','failed'],to:'stopped'}};
 const change=transitions[action];if(!change)throw Error('Неизвестное действие');
 const run=(await db.query('SELECT * FROM manual_parse_runs WHERE id=$1',[id])).rows[0];if(!run)throw Error('Запуск не найден');
 if(!change.from.includes(run.status))return;
 await db.query('UPDATE manual_parse_runs SET status=$1,failures=0,available_at=NOW(),error=$2,stage=$3,current_title=$4 WHERE id=$5 AND status=$6',[change.to,'',({pause:'Приостановлен',resume:'Возобновление',stop:'Остановлен'})[action],'',id,run.status]);
 // A request already sent may finish. The next item waits for resume.
 if(action==='stop')await db.query("UPDATE manual_parse_items SET status='cancelled',reason='Запуск остановлен' WHERE run_id=$1 AND status='pending'",[id]);
}
export async function manualStatus(db){
 const runs=(await db.query("SELECT * FROM manual_parse_runs ORDER BY CASE WHEN status IN('queued','running','paused','failed') THEN 0 ELSE 1 END,created_at DESC,id DESC LIMIT 20")).rows;
 for(const run of runs){
  const groups=(await db.query('SELECT status,reason,COUNT(*) AS count FROM manual_parse_items WHERE run_id=$1 GROUP BY status,reason',[run.id])).rows;
  run.counts={};run.reasons={};for(const group of groups){run.counts[group.status]=(run.counts[group.status]||0)+Number(group.count);if(group.reason)run.reasons[group.reason]=(run.reasons[group.reason]||0)+Number(group.count);}
  run.items=[...(await db.query("SELECT * FROM manual_parse_items WHERE run_id=$1 AND status='running' LIMIT 1",[run.id])).rows,...(await db.query("SELECT * FROM manual_parse_items WHERE run_id=$1 AND status='pending' ORDER BY created_at,shikimori_id LIMIT 10",[run.id])).rows,...(await db.query("SELECT * FROM manual_parse_items WHERE run_id=$1 AND status NOT IN('pending','running') ORDER BY created_at DESC,shikimori_id DESC LIMIT 15",[run.id])).rows];
 }
 return runs;
}

// A short durable step runs independently of the scheduled worker. The lease is
// renewed during network calls and also prevents two server replicas claiming it.
export async function runManualStep(db,{request=shikiRequest,importer=fetchAnime,countryLookup=lookupCountries}={}){
 const first=(await db.query("SELECT * FROM manual_parse_runs WHERE status IN('queued','running') ORDER BY created_at,id LIMIT 1")).rows[0];
 if(!first||new Date(first.available_at)>new Date()||first.lease_until&&new Date(first.lease_until)>new Date())return false;
 const token=randomUUID(),lease=()=>new Date(Date.now()+120000);
 const claimed=await db.query("UPDATE manual_parse_runs SET lease_token=$1,lease_until=$2,heartbeat_at=NOW(),status='running' WHERE id=$3 AND status IN('queued','running') AND (lease_until IS NULL OR lease_until<NOW()) RETURNING *",[token,lease(),first.id]);
 if(!claimed.rowCount)return false;
 const run=claimed.rows[0],c=run.config;
 const pulse=setInterval(()=>db.query('UPDATE manual_parse_runs SET lease_until=$1,heartbeat_at=NOW() WHERE id=$2 AND lease_token=$3',[lease(),run.id,token]).catch(()=>{}),15000);pulse.unref();
 const update=async(stage,title='')=>db.query('UPDATE manual_parse_runs SET stage=$1,current_title=$2,heartbeat_at=NOW() WHERE id=$3 AND lease_token=$4',[stage,title,run.id,token]);
 const active=async()=>['queued','running'].includes((await db.query('SELECT status FROM manual_parse_runs WHERE id=$1',[run.id])).rows[0]?.status);
 const finish=async stage=>{await update(stage);await db.query("UPDATE manual_parse_runs SET status='done',finished_at=NOW() WHERE id=$1 AND status='running' AND lease_token=$2",[run.id,token]);await db.query("UPDATE manual_parse_items SET status='cancelled',reason='Лимит новых тайтлов достигнут' WHERE run_id=$1 AND status='pending'",[run.id]);};
 try{
  const added=+(await db.query("SELECT COUNT(*) AS count FROM manual_parse_items WHERE run_id=$1 AND status='added'",[run.id])).rows[0].count;
  if(added>=c.limit){await finish('Лимит новых тайтлов достигнут');return true;}
  // A previous process may have died during the import; retry idempotently.
  const item=(await db.query("SELECT * FROM manual_parse_items WHERE run_id=$1 AND status IN('pending','running') ORDER BY created_at,shikimori_id LIMIT 1",[run.id])).rows[0];
  if(item){
   await update('Загрузка полного тайтла',item.name);
   await db.query("UPDATE manual_parse_items SET status='running',attempts=attempts+1 WHERE run_id=$1 AND shikimori_id=$2",[run.id,item.shikimori_id]);
   let state='added',reason='';
   try{
    const existing=(await db.query('SELECT id,metadata FROM anime WHERE shikimori_id=$1',[item.shikimori_id])).rows[0];
    if(existing)state=existing.metadata?.manual_parse_run===run.id?'added':'existing';
    else if((await db.query('SELECT id FROM deleted_anime WHERE shikimori_id=$1',[item.shikimori_id])).rowCount){state='skipped';reason='Ранее удалённый тайтл';}
    else{
     const anime=await importer(item.shikimori_id);
     if(Number(anime.shikimori_id)!==item.shikimori_id)throw Error('Источник вернул другой ID');
     assertSelected(anime,c);
     if(!await active()){await db.query("UPDATE manual_parse_items SET status=$1 WHERE run_id=$2 AND shikimori_id=$3",[(await db.query('SELECT status FROM manual_parse_runs WHERE id=$1',[run.id])).rows[0].status==='stopped'?'cancelled':'pending',run.id,item.shikimori_id]);return true;}
     anime.metadata={...anime.metadata,catalogue_seed:false,manual_parse_run:run.id};await saveImported(db,anime);
     await catalogueGenres(db,{refresh:true});
    }
   }catch(error){if(isImportSkip(error)){state='skipped';reason=error.message;}else if(item.attempts+1<3){await db.query("UPDATE manual_parse_items SET status='pending',reason='Повтор после ошибки источника' WHERE run_id=$1 AND shikimori_id=$2",[run.id,item.shikimori_id]);throw error;}else{state='error';reason='Источник не ответил после 3 попыток';}}
   await db.query('UPDATE manual_parse_items SET status=$1,reason=$2 WHERE run_id=$3 AND shikimori_id=$4',[state,reason,run.id,item.shikimori_id]);
   if(state==='added'&&added+1>=c.limit)await finish('Лимит новых тайтлов достигнут');
  }else if(run.exhausted){await finish('Все подходящие результаты проверены');}
  else{
   await update('Поиск тайтлов · страница '+run.page);
   // Query each selected genre separately for OR; intersection is checked locally.
   // GraphQL enrichment remains authoritative for country and genre names.
   const queries=c.genreMatch==='any'?c.genreIds:[c.genreIds[0]],all=[];let more=false;
   for(const genre of queries){if(!await active())return true;const query=new URLSearchParams({limit:'50',page:String(run.page),season:c.minYear+'_'+c.maxYear,order:c.order,kind:c.kinds.join(','),status:c.statuses.join(','),genre_v2:String(genre),score:String(c.minRating)});if(c.search)query.set('search',c.search);const list=await request('/api/animes?'+query);if(!Array.isArray(list))throw Error('Некорректный список Shikimori');more ||= list.length===50;all.push(...list);}
   const unique=[...new Map(all.map(a=>[Number(a.id),a])).values()];
   // At most 50 IDs per GraphQL request.
   for(let offset=0;offset<unique.length;offset+=50){if(!await active())return true;const candidates=await enrichCandidates(unique.slice(offset,offset+50),request,{countryLookup,countriesRequired:!!c.countries.length});if(!await active())return true;for(const candidate of candidates){let state='pending',reason='';try{assertSelected(candidate,c);}catch(error){if(!isImportSkip(error))throw error;state='skipped';reason=error.message;}await db.query('INSERT INTO manual_parse_items(run_id,shikimori_id,name,status,reason) VALUES($1,$2,$3,$4,$5) ON CONFLICT(run_id,shikimori_id) DO NOTHING',[run.id,candidate.shikimori_id,candidate.name||candidate.original_name,state,reason]);}}
   if(!await active())return true;
   await db.query('UPDATE manual_parse_runs SET page=page+1,exhausted=$1 WHERE id=$2 AND lease_token=$3',[!more||run.page>=1000,run.id,token]);
  }
  await db.query("UPDATE manual_parse_runs SET failures=0,error='',available_at=NOW() WHERE id=$1 AND lease_token=$2",[run.id,token]);
 }catch(error){const failures=run.failures+1;await db.query('UPDATE manual_parse_runs SET failures=$1,error=$2,available_at=$3 WHERE id=$4 AND lease_token=$5',[failures,'Источник временно недоступен. '+String(error.message).slice(0,180),new Date(Date.now()+Math.min(failures,5)*30000),run.id,token]);if(failures>=3)await db.query("UPDATE manual_parse_runs SET status='failed' WHERE id=$1 AND status='running' AND lease_token=$2",[run.id,token]);}
 finally{clearInterval(pulse);await db.query('UPDATE manual_parse_runs SET lease_token=NULL,lease_until=NULL,heartbeat_at=NOW() WHERE id=$1 AND lease_token=$2',[run.id,token]);}
 return true;
}
export function startManualWorker(db){let busy=false,stopped=false;const tick=async()=>{if(busy||stopped)return;busy=true;try{await runManualStep(db);}catch(error){console.error(JSON.stringify({event:'manual_parser_error',message:error.message}));}finally{busy=false;}};const timer=setInterval(tick,1000);timer.unref();tick();return()=>{stopped=true;clearInterval(timer);};}
