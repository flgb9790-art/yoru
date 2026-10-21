// Chronology can contain alternate settings, compilations and character crossovers.
// Only explicit prequel/sequel edges establish the season chain, in either direction.
const relations=new Set(['prequel','sequel','предыстория','продолжение']);
export function franchiseParts(current,rows){
 const bySource=new Map(rows.filter(a=>!a.blocked&&Number.isSafeInteger(a.shikimori_id)&&a.shikimori_id>0&&!['music','pv','cm'].includes(a.kind)).map(a=>[a.shikimori_id,a]));
 if(!bySource.has(current.shikimori_id))return [];
 const graph=new Map();const edge=(a,b)=>{if(!graph.has(a))graph.set(a,new Set());graph.get(a).add(b);};
 for(const a of bySource.values())for(const r of a.metadata?.related||[]){if(!relations.has(String(r.relation_key||r.relation||'').trim().toLowerCase()))continue;const id=Number(r.id);if(id===a.shikimori_id||!bySource.has(id))continue;edge(a.shikimori_id,id);edge(id,a.shikimori_id);}
 const seen=new Set([current.shikimori_id]),queue=[current.shikimori_id];for(let i=0;i<queue.length;i++)for(const id of graph.get(queue[i])||[])if(!seen.has(id)){seen.add(id);queue.push(id);}
 return queue.map(id=>{const a=bySource.get(id),raw=a.metadata?.airDate,date=/^\d{4}-\d{2}-\d{2}$/.test(raw||'')&&Number.isFinite(Date.parse(raw))?raw:null;return {id:a.id,name:a.name,date,year:a.year,current:a.id===current.id};}).sort((a,b)=>String(a.date||(a.year?a.year+'-01-01':'9999')).localeCompare(String(b.date||(b.year?b.year+'-01-01':'9999')))||a.id.localeCompare(b.id));
}
export async function loadFranchiseParts(db,current){return franchiseParts(current,(await db.query('SELECT id,name,year,kind,metadata,blocked,shikimori_id FROM anime WHERE blocked=FALSE')).rows);}
