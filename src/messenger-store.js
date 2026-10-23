export async function setContact(db,userId,peerId,add){
 if(userId===peerId)throw Object.assign(Error('Нельзя добавить себя в контакты'),{status:400});
 if(!(await db.query('SELECT id FROM users WHERE id=$1',[peerId])).rowCount)throw Object.assign(Error('Пользователь не найден'),{status:404});
 if(add)await db.query('INSERT INTO user_contacts(user_id,contact_id) VALUES($1,$2) ON CONFLICT(user_id,contact_id) DO NOTHING',[userId,peerId]);
 else await db.query('DELETE FROM user_contacts WHERE user_id=$1 AND contact_id=$2',[userId,peerId]);
}
export async function messengerList(db,userId,{q='',tab='dialogs',page=1}={}){
 if(!q&&(tab==='people'||tab==='contacts'))return {rows:[],total:0,page,q,tab};
 const contacts=(await db.query('SELECT contact_id FROM user_contacts WHERE user_id=$1',[userId])).rows.map(r=>r.contact_id);
 if(q||tab==='contacts'||tab==='people'){
  const params=[userId],conditions=['u.id<>$1'];
  if(q){const numeric=Number(/^@?(?:YR)?0*(\d+)$/i.exec(q)?.[1]||0);params.push('%'+q+'%',Number.isSafeInteger(numeric)&&numeric<=2147483647?numeric:0);conditions.push('(u.name ILIKE $2 OR u.public_id=$3)');}
  if(tab==='contacts')conditions.push('c.user_id=$1');
  const from=' FROM users u LEFT JOIN user_contacts c ON c.contact_id=u.id AND c.user_id=$1 WHERE '+conditions.join(' AND '),total=+(await db.query('SELECT COUNT(*) AS count'+from,params)).rows[0].count;
  const rows=(await db.query('SELECT u.id AS peer_id,u.name,u.avatar,u.public_id,u.chat_active_at'+from+' ORDER BY u.name,u.id LIMIT 20 OFFSET $'+(params.length+1),[...params,(page-1)*20])).rows;
  return {rows:rows.map(r=>({...r,contact:contacts.includes(r.peer_id)})),total,page,q,tab};
 }
 const rows=(await db.query('SELECT d.*,u.name,u.avatar FROM (SELECT DISTINCT ON(peer_id) * FROM (SELECT m.*,CASE WHEN m.sender_id=$1 THEN m.recipient_id ELSE m.sender_id END AS peer_id FROM direct_messages m WHERE m.deleted_at IS NULL AND ((m.sender_id=$1 AND m.sender_hidden=FALSE) OR (m.recipient_id=$1 AND m.recipient_hidden=FALSE))) scoped ORDER BY peer_id,created_at DESC,id DESC) d JOIN users u ON u.id=d.peer_id',[userId])).rows;
 const counts=(await db.query('SELECT sender_id,COUNT(*) AS count FROM direct_messages WHERE recipient_id=$1 AND recipient_hidden=FALSE AND deleted_at IS NULL AND read_at IS NULL GROUP BY sender_id',[userId])).rows;
 rows.sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at)||b.id.localeCompare(a.id));
 return {rows:rows.slice((page-1)*20,page*20).map(m=>({...m,own:m.sender_id===userId,unread:Number(counts.find(c=>c.sender_id===m.peer_id)?.count)||0,contact:contacts.includes(m.peer_id)})),total:rows.length,page,q,tab};
}
export async function chatPresence(db,userId,peerId,{typing}={}){
 await db.query('UPDATE users SET chat_active_at=NOW() WHERE id=$1',[userId]);
 if(typing===true)await db.query('INSERT INTO chat_typing(user_id,peer_id,updated_at) VALUES($1,$2,NOW()) ON CONFLICT(user_id,peer_id) DO UPDATE SET updated_at=NOW()',[userId,peerId]);
 if(typing===false)await db.query('DELETE FROM chat_typing WHERE user_id=$1 AND peer_id=$2',[userId,peerId]);
 const peer=(await db.query('SELECT chat_active_at FROM users WHERE id=$1',[peerId])).rows[0];
 const active=(await db.query('SELECT updated_at FROM chat_typing WHERE user_id=$1 AND peer_id=$2',[peerId,userId])).rows[0];
 return {online:!!peer?.chat_active_at&&Date.now()-Date.parse(peer.chat_active_at)<15000,typing:!!active&&Date.now()-Date.parse(active.updated_at)<6000};
}
