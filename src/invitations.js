import {randomUUID} from 'node:crypto';
import rateLimit from 'express-rate-limit';
import {z} from 'zod';
import {token,hashToken,hashPassword,requireAdmin} from './security.js';
import {layout,esc,csrf} from './views.js';
import {requestSiteOrigin} from './site-origin.js';
const validToken=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
export async function activeInvite(db,raw){
 if(!validToken(raw))return null;
 return (await db.query('SELECT id,expires_at FROM registration_invites WHERE token_hash=$1 AND used_at IS NULL AND revoked_at IS NULL AND expires_at>NOW()',[hashToken(raw)])).rows[0]||null;
}
// Claim and account creation share one transaction. Expiry/revocation are rechecked
// under the UPDATE row lock, including after a Telegram round trip.
export async function redeemInvite(db,id,create){
 const client=await db.connect();try{
  await client.query('BEGIN');
  const claimed=await client.query('UPDATE registration_invites SET used_at=NOW() WHERE id=$1 AND used_at IS NULL AND revoked_at IS NULL AND expires_at>NOW() RETURNING id',[id]);
  if(!claimed.rowCount){await client.query('ROLLBACK');return null;}
  const user=await create(client);
  await client.query('UPDATE registration_invites SET used_by=$1 WHERE id=$2',[user.id,id]);
  await client.query('INSERT INTO audit(id,user_id,action,entity_id) VALUES($1,$2,$3,$4)',[randomUUID(),user.id,'invite:redeem',id]);
  await client.query('COMMIT');return user;
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
export function mountInvitations(app,db,signIn){
 const writes=rateLimit({windowMs:3600000,limit:30,standardHeaders:'draft-8',legacyHeaders:false});
 const attempts=rateLimit({windowMs:15*60000,limit:30,standardHeaders:'draft-8',legacyHeaders:false});
 const invalid=(req,res)=>res.status(410).send(layout('Приглашение недоступно','<section class="panel auth"><h1>Приглашение недоступно</h1><p>Ссылка использована, отозвана или срок её действия истёк. Попроси администратора создать новую.</p><a href="/">Ко входу</a></section>',req));
 const secure=(req,res,next)=>{res.set({'Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow, noarchive','Cache-Control':'private, no-store'});next();};
 app.get('/admin/invitations',requireAdmin,async(req,res)=>{
  const rows=(await db.query('SELECT id,note,expires_at,used_at,revoked_at,created_at FROM registration_invites ORDER BY created_at DESC LIMIT 50')).rows;
  const state=row=>row.used_at?'Использовано':row.revoked_at?'Отозвано':new Date(row.expires_at)<=new Date()?'Истекло':'Активно';
  res.send(layout('Приглашения',`<section class="panel invitations"><h1>Приглашения</h1><p class="muted">Одна ссылка — один новый аккаунт. Доступ к управлению есть только у администраторов.</p><form method="post" action="/admin/invitations">${csrf(req)}<label>Для кого<input name="note" maxlength="100" placeholder="Например, новый аккаунт друга"></label><label>Срок действия<select name="days"><option value="1">1 день</option><option value="7" selected>7 дней</option><option value="30">30 дней</option></select></label><button>Создать приглашение</button></form><p class="muted">Ссылка показывается только после создания. Отправь её другу самостоятельно. Если потеряешь — отзови и создай новую.</p><div class="invitation-list">${rows.map(row=>`<article><div><strong>${esc(row.note||'Без подписи')}</strong><p>${state(row)} · до ${esc(new Date(row.expires_at).toLocaleString('ru-RU',{timeZone:'Europe/Minsk'}))} МСК</p></div>${state(row)==='Активно'?`<form method="post" action="/admin/invitations/${esc(row.id)}/revoke">${csrf(req)}<button class="secondary">Отозвать</button></form>`:''}</article>`).join('')||'<p class="muted">Приглашений пока нет.</p>'}</div></section>`,req));
 });
 app.post('/admin/invitations',requireAdmin,writes,async(req,res)=>{
  const input=z.object({note:z.string().trim().max(100).default(''),days:z.coerce.number().refine(n=>[1,7,30].includes(n)).default(7)}).parse(req.body),raw=token(),id=randomUUID(),expires=new Date(Date.now()+input.days*86400000);
  await db.query('INSERT INTO registration_invites(id,token_hash,created_by,note,expires_at) VALUES($1,$2,$3,$4,$5)',[id,hashToken(raw),req.user.id,input.note,expires]);
  await db.query('INSERT INTO audit(id,user_id,action,entity_id) VALUES($1,$2,$3,$4)',[randomUUID(),req.user.id,'invite:create',id]);
  const url=new URL('/invite/'+raw,requestSiteOrigin(req)).href;res.set('Referrer-Policy','no-referrer');
  res.status(201).send(layout('Приглашение создано',`<section class="panel invitations"><h1>Приглашение создано</h1><p>Скопируй ссылку и передай другу. Она действует до ${esc(expires.toLocaleString('ru-RU',{timeZone:'Europe/Minsk'}))} МСК и разрешает одну регистрацию.</p><label>Ссылка<input class="invitation-url" data-invitation-url readonly value="${esc(url)}" aria-label="Ссылка приглашения"></label><button type="button" class="secondary" data-copy-invite>Скопировать ссылку</button><p class="muted" role="status" data-invite-copy-status></p><p class="muted">Ссылка больше не будет показана. Новый аккаунт получает обычные права пользователя, без переноса данных старого аккаунта.</p><a class="button secondary" href="/admin/invitations">К приглашениям</a></section>`,req));
 });
 app.post('/admin/invitations/:id/revoke',requireAdmin,writes,async(req,res)=>{const result=await db.query('UPDATE registration_invites SET revoked_at=NOW() WHERE id=$1 AND used_at IS NULL AND revoked_at IS NULL RETURNING id',[req.params.id]);if(result.rowCount)await db.query('INSERT INTO audit(id,user_id,action,entity_id) VALUES($1,$2,$3,$4)',[randomUUID(),req.user.id,'invite:revoke',req.params.id]);res.redirect('/admin/invitations');});
 app.get('/invite/:token',secure,attempts,async(req,res)=>{
  if(!await activeInvite(db,req.params.token))return invalid(req,res);
  if(req.user)return res.send(layout('Ты уже вошёл','<section class="panel auth"><h1>Ты уже вошёл</h1><p>Чтобы создать новый аккаунт по приглашению, сначала выйди из текущего. Приглашение пока не использовано.</p><a href="/profile">В профиль</a></section>',req));
  res.send(layout('Приглашение в YORU',`<section class="panel auth invitation-entry"><div class="eyebrow">Личная библиотека</div><h1>Тебя пригласили в YORU</h1><p>Создай аккаунт через Telegram или почту. Ссылка используется один раз.</p><a class="button" href="/auth/telegram?invite=${esc(req.params.token)}" data-no-ajax>Продолжить через Telegram</a><details><summary>Зарегистрироваться по почте</summary><form method="post" action="/invite/${esc(req.params.token)}/email">${csrf(req)}<label>Имя<input name="name" required maxlength="60" autocomplete="nickname"></label><label>Почта<input name="email" type="email" required autocomplete="email"></label><label>Пароль<input name="password" type="password" required minlength="10" maxlength="200" autocomplete="new-password"></label><button>Создать аккаунт</button></form></details><p class="muted">Новый аккаунт не переносит историю или права другого аккаунта.</p></section>`,req));
 });
 app.post('/invite/:token/email',secure,attempts,async(req,res)=>{
  if(req.user)return res.sendStatus(409);
  const invite=await activeInvite(db,req.params.token);if(!invite)return invalid(req,res);
  const input=z.object({name:z.string().trim().min(1).max(60),email:z.email().transform(v=>v.toLowerCase()),password:z.string().min(10).max(200)}).parse(req.body);
  if((await db.query('SELECT id FROM users WHERE email=$1',[input.email])).rowCount)return res.status(400).send(layout('Не удалось создать аккаунт','<section class="panel auth"><h1>Не удалось создать аккаунт</h1><p>Попробуй войти в существующий аккаунт. Приглашение не использовано.</p><a href="/login">Войти</a></section>',req));
  const password=await hashPassword(input.password);let user;
  try{user=await redeemInvite(db,invite.id,async client=>{const id=randomUUID();return (await client.query('INSERT INTO users(id,email,name,password_hash) VALUES($1,$2,$3,$4) RETURNING *',[id,input.email,input.name,password])).rows[0];});}catch(error){if(error.code==='23505')return res.status(400).send(layout('Не удалось создать аккаунт','<section class="panel auth"><h1>Не удалось создать аккаунт</h1><p>Попробуй войти в существующий аккаунт. Приглашение не использовано.</p><a href="/login">Войти</a></section>',req));throw error;}
  if(!user)return invalid(req,res);await signIn(req,res,user);
 });
}
