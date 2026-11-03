import {activeInvite,redeemInvite} from './invitations.js';
import {privateSite} from './site-mode.js';
import {requestSiteOrigin} from './site-origin.js';
import rateLimit from 'express-rate-limit';
import {createHash,randomUUID} from 'node:crypto';
import {createRemoteJWKSet,jwtVerify} from 'jose';
import {token,hashToken,cookie} from './security.js';
import {layout} from './views.js';
const issuer='https://oauth.telegram.org';
const keys=createRemoteJWKSet(new URL(issuer+'/.well-known/jwks.json'));
export function mountTelegram(app,db,signIn){
 const ready=()=>Boolean(process.env.TELEGRAM_CLIENT_ID&&process.env.TELEGRAM_CLIENT_SECRET&&process.env.BASE_URL);
 const callback=req=>new URL('/auth/telegram/callback',requestSiteOrigin(req)).href;
 const loginLimit=rateLimit({windowMs:15*60000,limit:20,standardHeaders:'draft-8',legacyHeaders:false});
 app.get('/auth/telegram',loginLimit,async(req,res)=>{if(!ready())return res.status(503).send(layout('Telegram-вход','<section class="panel auth"><h1>Вход через Telegram</h1><p>Владелец сайта подключает Telegram. Кнопка заработает после настройки бота.</p><a href="/">На главную</a></section>',req));let inviteId=null;if(req.query.invite){const invite=await activeInvite(db,String(req.query.invite));if(!invite)return res.status(410).send(layout('Приглашение недоступно','<section class="panel auth"><h1>Приглашение недоступно</h1><p>Попроси администратора создать новую ссылку.</p><a href="/">Ко входу</a></section>',req));inviteId=invite.id;res.set('Referrer-Policy','no-referrer');}const state=token(),verifier=token(),nonce=token();await db.query('INSERT INTO oauth_flows(state_hash,verifier,nonce,expires_at,invite_id) VALUES($1,$2,$3,$4,$5)',[hashToken(state),verifier,nonce,new Date(Date.now()+600000),inviteId]);res.cookie('yoru_oauth',state,{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge:600000,path:'/auth/telegram'});const url=new URL(issuer+'/auth');url.search=new URLSearchParams({client_id:process.env.TELEGRAM_CLIENT_ID,redirect_uri:callback(req),response_type:'code',scope:'openid profile',state,nonce,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'}).toString();res.redirect(url.href);});
 app.get('/auth/telegram/callback',async(req,res)=>{res.clearCookie('yoru_oauth',{path:'/auth/telegram'});const state=String(req.query.state||''),code=String(req.query.code||'');if(!ready()||!/^[a-f0-9]{64}$/.test(state)||state!==cookie(req,'yoru_oauth')||!code||code.length>4096)return res.status(400).send('Не удалось подтвердить вход. Начни заново.');const flow=(await db.query('DELETE FROM oauth_flows WHERE state_hash=$1 AND expires_at>NOW() RETURNING *',[hashToken(state)])).rows[0];if(!flow)return res.status(400).send('Ссылка входа устарела.');const response=await fetch(issuer+'/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Authorization:'Basic '+Buffer.from(process.env.TELEGRAM_CLIENT_ID+':'+process.env.TELEGRAM_CLIENT_SECRET).toString('base64')},body:new URLSearchParams({grant_type:'authorization_code',code,redirect_uri:callback(req),client_id:process.env.TELEGRAM_CLIENT_ID,code_verifier:flow.verifier}),signal:AbortSignal.timeout(15000)});if(!response.ok)return res.status(502).send('Telegram не подтвердил вход. Попробуй снова.');const result=await response.json();const {payload}=await jwtVerify(result.id_token,keys,{issuer,audience:process.env.TELEGRAM_CLIENT_ID,algorithms:['RS256','ES256'],requiredClaims:['exp','iat','sub'],maxTokenAge:'10m'});if(payload.nonce!==flow.nonce||!payload.sub)return res.status(400).send('Неверное подтверждение входа.');const user=await telegramAccount(db,payload,{inviteId:flow.invite_id});if(!user)return res.status(403).send(layout('Доступ закрыт','<section class="panel auth"><h1>Доступ закрыт</h1><p>Вход разрешён только ранее зарегистрированным участникам. Новый аккаунт не создан.</p><a href="/">Вернуться ко входу</a></section>',req));await signIn(req,res,user);});
}

export async function telegramAccount(db,payload,{inviteId=null}={}){
 const telegramId=String(payload.sub),existing=(await db.query('SELECT * FROM users WHERE telegram_id=$1',[telegramId])).rows[0];
 if(existing)return existing;
 if(inviteId)return redeemInvite(db,inviteId,async client=>(await client.query('INSERT INTO users(id,telegram_id,name,verified) VALUES($1,$2,$3,TRUE) RETURNING *',[randomUUID(),telegramId,String(payload.name||payload.preferred_username||'Пользователь Telegram').slice(0,60)])).rows[0]);
 if(privateSite())return null;
 const id=randomUUID(),name=String(payload.name||payload.preferred_username||'Пользователь Telegram').slice(0,60);
 await db.query('INSERT INTO users(id,telegram_id,name,verified) VALUES($1,$2,$3,TRUE) ON CONFLICT(telegram_id) DO NOTHING',[id,telegramId,name]);
 return (await db.query('SELECT * FROM users WHERE telegram_id=$1',[telegramId])).rows[0];
}
