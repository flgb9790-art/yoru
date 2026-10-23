import {randomUUID} from 'node:crypto';
export function levelInfo(xp=0){xp=Math.max(0,Number(xp)||0);const level=Math.floor((Math.sqrt(49+8*xp/25)-7)/2)+1,base=100*(level-1)+25*(level-1)*(level-2)/2,needed=100+25*(level-1);const group=level>=75?'Легенда':level>=50?'Мастер':level>=25?'Знаток':level>=10?'Любитель':'Открыватель';return {level,group,xp,current:xp-base,needed,percent:Math.min(100,(xp-base)/needed*100)};}
export async function rewardNotice(db,userId,key,{kind,title,body,href='/levels',icon='spark'}){await db.query('INSERT INTO reward_notifications(id,user_id,event_key,kind,title,body,href,icon) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(user_id,event_key) DO NOTHING',[randomUUID(),userId,key,kind,title,body,href,icon]);}
// Caller holds the user's row lock in the surrounding transaction.
export async function awardExperience(db,userId,key,amount){if((await db.query('SELECT event_key FROM experience_events WHERE user_id=$1 AND event_key=$2',[userId,key])).rowCount)return 0;
 const before=(await db.query('SELECT xp FROM users WHERE id=$1',[userId])).rows[0];if(!before)return 0;
 const result=await db.query('INSERT INTO experience_events(user_id,event_key,amount) VALUES($1,$2,$3) ON CONFLICT(user_id,event_key) DO NOTHING RETURNING amount',[userId,key,amount]);if(!result.rowCount)return 0;
 await db.query('UPDATE users SET xp=xp+$2 WHERE id=$1',[userId,amount]);
 if(key.startsWith('visit:'))await rewardNotice(db,userId,key,{kind:'daily',title:'Бонус за вход · +'+amount+' XP',body:'Новый день — новая история. Продолжай серию входов!',href:'/profile#visit-streak',icon:'flame'});
 const oldLevel=levelInfo(before.xp).level,next=levelInfo(Number(before.xp)+amount);if(next.level>oldLevel)await rewardNotice(db,userId,'level:'+key,{kind:'level',title:'Новый уровень · '+next.level,body:next.group+' · Твой путь на YORU продолжается.',icon:'crown'});return amount;
}
export async function rewardInbox(db,userId,{pending=false,limit=6}={}){return (await db.query('SELECT * FROM reward_notifications WHERE user_id=$1 AND cleared_at IS NULL'+(pending?' AND shown_at IS NULL AND read_at IS NULL':' AND read_at IS NULL')+' ORDER BY created_at DESC,id DESC LIMIT $2',[userId,limit])).rows;}
