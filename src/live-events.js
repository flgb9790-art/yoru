const types=['message','episode','reply'];
export async function liveEvents(db,userId,value){
 let cursors;try{cursors=JSON.parse(String(value||''));}catch{}const valid=cursors&&types.every(k=>Number.isSafeInteger(cursors[k])&&cursors[k]>=0);
 if(!valid){const cursor={};for(const [key,table,column]of [['message','direct_messages','recipient_id'],['episode','notifications','user_id'],['reply','social_notifications','user_id']])cursor[key]=Number((await db.query('SELECT COALESCE(MAX(live_seq),0) AS seq FROM '+table+' WHERE '+column+'=$1',[userId])).rows[0].seq);return {events:[],cursor:JSON.stringify(cursor)};}
 const events=[],next={};for(const type of types){const c=cursors[type];let rows;
 if(type==='message')rows=(await db.query('SELECT m.live_seq,m.id,m.created_at,m.sender_id,m.body,m.anime_title,m.image_expires_at,u.name,u.avatar FROM direct_messages m JOIN users u ON u.id=m.sender_id WHERE m.recipient_id=$1 AND m.live_seq>$2 ORDER BY m.live_seq LIMIT 20',[userId,c])).rows;
 if(type==='episode')rows=(await db.query('SELECT n.live_seq,n.id,n.created_at,n.anime_id,n.episode,n.provider,a.name,a.poster FROM notifications n JOIN anime a ON a.id=n.anime_id WHERE n.user_id=$1 AND a.blocked=FALSE AND n.read_at IS NULL AND n.live_seq>$2 ORDER BY n.live_seq LIMIT 20',[userId,c])).rows;
 if(type==='reply')rows=(await db.query("SELECT n.live_seq,n.id,n.created_at,n.anime_id,n.entity_id,u.name,u.avatar FROM social_notifications n JOIN users u ON u.id=n.sender_id WHERE n.user_id=$1 AND n.kind='reply' AND n.read_at IS NULL AND n.live_seq>$2 ORDER BY n.live_seq LIMIT 20",[userId,c])).rows;
 next[type]=rows.length?Number(rows.at(-1).live_seq):c;
 for(const r of rows){const text=type==='message'?(r.body|| (r.image_expires_at?'Изображение':r.anime_title?'Аниме: '+r.anime_title:'Новое сообщение')):type==='episode'?`${r.episode} серия${r.provider==='shikimori'?' · оригинальный эфир':' · обновление'}`:'Ответил на ваш комментарий';events.push({key:type+':'+r.id,type,peer:type==='message'?r.sender_id:null,title:r.name,text:String(text).slice(0,180),image:type==='episode'?r.poster:r.avatar,href:type==='message'?'/messages/'+encodeURIComponent(r.sender_id):'/anime/'+encodeURIComponent(r.anime_id)+(type==='reply'?'#comment-'+encodeURIComponent(r.entity_id):'')});}
 }return {events,cursor:JSON.stringify(next)};
}
