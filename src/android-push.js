import {createHash,createPrivateKey} from 'node:crypto';
import {SignJWT} from 'jose';
import rateLimit from 'express-rate-limit';
const digest=value=>createHash('sha256').update(value).digest('hex');
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function firebaseAccount(value=process.env.FIREBASE_SERVICE_ACCOUNT_JSON){
 if(!value)return null;
 const account=JSON.parse(value);
 if(!/^[a-z0-9-]{4,100}$/.test(account.project_id||'')||!String(account.client_email||'').endsWith('.gserviceaccount.com')||!String(account.private_key||'').includes('PRIVATE KEY'))throw Error('Invalid Firebase service account configuration');
 return account;
}
export function createFcmSender(account,{transport=fetch}={}){
 let accessToken='',expires=0,pending;
 async function authorize(){if(accessToken&&expires>Date.now()+60000)return accessToken;if(pending)return pending;pending=(async()=>{const assertion=await new SignJWT({scope:'https://www.googleapis.com/auth/firebase.messaging'}).setProtectedHeader({alg:'RS256'}).setIssuer(account.client_email).setSubject(account.client_email).setAudience('https://oauth2.googleapis.com/token').setIssuedAt().setExpirationTime('1h').sign(createPrivateKey(account.private_key));const response=await transport('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion}),signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('Firebase authorization failed');const data=await response.json();if(!data.access_token)throw Error('Firebase access token missing');accessToken=data.access_token;expires=Date.now()+Math.min(3600,Number(data.expires_in)||3600)*1000;return accessToken;})();try{return await pending;}finally{pending=null;}}
 return async(device,event)=>{const token=await authorize();const response=await transport('https://fcm.googleapis.com/v1/projects/'+account.project_id+'/messages:send',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({message:{token:device.token,data:{title:event.title,body:event.text,href:event.href,event_id:event.key,kind:event.type,account_id:device.user_id},android:{priority:'high',ttl:'86400s'}}}),signal:AbortSignal.timeout(15000)});if(response.ok)return;const data=await response.json().catch(()=>({}));const invalid=data.error?.details?.some(d=>d.errorCode==='UNREGISTERED');if(invalid){const error=Error('Expired push token');error.unregister=true;throw error;}if(response.status===401){accessToken='';expires=0;}throw Error('Firebase delivery failed ('+response.status+')');};
}
export async function registerPushDevice(db,user,session,input){
 const {id,secret,token}=input;
 if(!uuid.test(String(id||''))||!/^[a-f0-9]{64}$/.test(String(secret||''))||typeof token!=='string'||token.length<20||token.length>4096||/[\s\x00-\x1f]/.test(token)){const error=Error('Неверные данные устройства');error.status=400;throw error;}
 if(!session?.token_hash){const error=Error('Войдите заново');error.status=401;throw error;}
 const client=await db.connect();try{await client.query('BEGIN');const current=(await client.query('SELECT * FROM push_devices WHERE id=$1 FOR UPDATE',[id])).rows[0];if(current&&current.secret_hash!==digest(secret)){const error=Error('Устройство не подтверждено');error.status=403;throw error;}
 const tokenOwner=(await client.query('SELECT id FROM push_devices WHERE token=$1',[token])).rows[0];if(tokenOwner&&tokenOwner.id!==id){const error=Error('Токен уже зарегистрирован');error.status=409;throw error;}
 const reset=!current||current.user_id!==user.id||current.session_hash!==session.token_hash;
 const baseline={};for(const [kind,table,column]of [['message','direct_messages','recipient_id'],['episode','notifications','user_id']])baseline[kind]=reset?Number((await client.query('SELECT COALESCE(MAX(live_seq),0) AS seq FROM '+table+' WHERE '+column+'=$1',[user.id])).rows[0].seq):Number(current[kind+'_seq']);
 if(!current){const count=Number((await client.query('SELECT COUNT(*) AS count FROM push_devices WHERE user_id=$1',[user.id])).rows[0].count);if(count>=10){const error=Error('Достигнут лимит устройств');error.status=429;throw error;}}
 await client.query('INSERT INTO push_devices(id,secret_hash,token,user_id,session_hash,message_seq,episode_seq) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO UPDATE SET token=EXCLUDED.token,user_id=EXCLUDED.user_id,session_hash=EXCLUDED.session_hash,message_seq=EXCLUDED.message_seq,episode_seq=EXCLUDED.episode_seq,updated_at=NOW()',[id,digest(secret),token,user.id,session.token_hash,baseline.message,baseline.episode]);await client.query('COMMIT');return {ok:true};
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
export function mountAndroidPush(app,db){
 const limit=rateLimit({windowMs:60000,limit:120,standardHeaders:'draft-8',legacyHeaders:false});
 app.get('/api/mobile/session',(req,res)=>{let configured=false;try{configured=!!firebaseAccount();}catch{}res.json({authenticated:!!req.user,csrf:req.session.csrf,userId:req.user?.id||'',pushConfigured:configured});});
 app.post('/api/mobile/push/register',limit,async(req,res)=>{if(!req.user)return res.status(401).json({error:'Нужен вход'});try{res.json(await registerPushDevice(db,req.user,req.session,req.body));}catch(error){if(error.status)return res.status(error.status).json({error:error.message});throw error;}});
 app.post('/api/mobile/push/unregister',limit,async(req,res)=>{if(!uuid.test(String(req.body.id||''))||!/^[a-f0-9]{64}$/.test(String(req.body.secret||'')))return res.status(400).json({error:'Неверные данные устройства'});await db.query('DELETE FROM push_devices WHERE id=$1 AND secret_hash=$2',[req.body.id,digest(req.body.secret)]);res.json({ok:true});});
}
export async function deliverDevice(db,device,send,{now=Date.now()}={}){
 const valid=(await db.query('SELECT token_hash FROM sessions WHERE token_hash=$1 AND user_id=$2 AND expires_at>NOW()',[device.session_hash,device.user_id])).rowCount;
 if(!valid){await db.query('DELETE FROM push_devices WHERE id=$1 AND session_hash=$2',[device.id,device.session_hash]);return;}
 for(const type of ['message','episode']){
  const rows=type==='message'?(await db.query('SELECT m.*,u.name FROM direct_messages m JOIN users u ON u.id=m.sender_id WHERE m.recipient_id=$1 AND m.live_seq>$2 ORDER BY m.live_seq LIMIT 30',[device.user_id,device.message_seq])).rows:(await db.query('SELECT n.*,a.name,a.blocked FROM notifications n JOIN anime a ON a.id=n.anime_id WHERE n.user_id=$1 AND n.live_seq>$2 ORDER BY n.live_seq LIMIT 30',[device.user_id,device.episode_seq])).rows;
  for(const row of rows){const skip=!!row.read_at||row.recipient_hidden||row.deleted_at||row.blocked||now-Date.parse(row.created_at)>86400000;
   if(!skip){const event={key:type+':'+row.id,type,title:row.name,text:type==='message'?String(row.body||(row.image_expires_at?'Изображение':row.anime_title?'Аниме: '+row.anime_title:'Новое сообщение')).slice(0,180):row.episode+' серия · '+row.name,href:type==='message'?'/messages/'+encodeURIComponent(row.sender_id):'/anime/'+encodeURIComponent(row.anime_id)+'?source='+(row.provider==='aniliberty'?'aniliberty&release='+row.release_id:'kodik')+'&episode='+row.episode+'#player'};
    // Recheck the live session immediately before sending private content.
    if(!(await db.query('SELECT d.id FROM push_devices d JOIN sessions s ON s.token_hash=d.session_hash WHERE d.id=$1 AND d.session_hash=$2 AND d.token=$3 AND s.user_id=$4 AND s.expires_at>NOW()',[device.id,device.session_hash,device.token,device.user_id])).rowCount)return;await db.query('UPDATE push_devices SET lease_until=$1 WHERE id=$2 AND session_hash=$3',[new Date(Date.now()+600000),device.id,device.session_hash]);
    await send(device,event);
   }
   await db.query('UPDATE push_devices SET '+type+'_seq=$1 WHERE id=$2 AND session_hash=$3',[row.live_seq,device.id,device.session_hash]);device[type+'_seq']=row.live_seq;
  }
 }
}
export async function runPushBatch(db,send){
 const rows=(await db.query('SELECT * FROM push_devices WHERE next_attempt<=NOW() AND (lease_until IS NULL OR lease_until<NOW()) ORDER BY next_attempt LIMIT 20')).rows;
 for(const device of rows){const lease=new Date(Date.now()+600000);const claim=await db.query('UPDATE push_devices SET lease_until=$1 WHERE id=$2 AND (lease_until IS NULL OR lease_until<NOW()) AND session_hash=$3 RETURNING id',[lease,device.id,device.session_hash]);if(!claim.rowCount)continue;
  try{await deliverDevice(db,device,send);await db.query('UPDATE push_devices SET lease_until=NULL,failures=0,next_attempt=$1 WHERE id=$2 AND session_hash=$3',[new Date(Date.now()+5000),device.id,device.session_hash]);}
  catch(error){if(error.unregister)await db.query('DELETE FROM push_devices WHERE id=$1 AND token=$2 AND session_hash=$3',[device.id,device.token,device.session_hash]);else{await db.query('UPDATE push_devices SET lease_until=NULL,failures=failures+1,next_attempt=$1 WHERE id=$2 AND session_hash=$3',[new Date(Date.now()+Math.min(3600000,15000*2**Math.min(device.failures,8))),device.id,device.session_hash]);console.error(JSON.stringify({event:'push_delivery_retry',device:device.id}));}}
 }
}
export function startPushWorker(db){let account;try{account=firebaseAccount();}catch{console.error('Firebase push configuration is invalid');return ()=>{};}if(!account)return ()=>{};const send=createFcmSender(account);let busy=false,stopped=false;async function tick(){if(busy||stopped)return;busy=true;try{await runPushBatch(db,send);}catch{console.error('Push worker failed');}finally{busy=false;}}const timer=setInterval(tick,5000);timer.unref();tick();return ()=>{stopped=true;clearInterval(timer);};}
