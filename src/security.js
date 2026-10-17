import {randomBytes,scrypt as callbackScrypt,timingSafeEqual,createHash} from 'node:crypto';
import {promisify} from 'node:util';
const scrypt=promisify(callbackScrypt);
export const token=()=>randomBytes(32).toString('hex');
export const hashToken=v=>createHash('sha256').update(v).digest('hex');
export async function hashPassword(password){const salt=randomBytes(16).toString('hex');return salt+':'+(await scrypt(password,salt,64)).toString('hex');}
export async function verifyPassword(password,stored){if(!stored)return false;const [salt,key]=stored.split(':');if(!salt||!key)return false;const candidate=await scrypt(password,salt,64);const actual=Buffer.from(key,'hex');return actual.length===candidate.length&&timingSafeEqual(actual,candidate);}
export function cookie(req,name){const entry=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='));return entry?entry.slice(name.length+1):null;}
export function requireUser(req,res,next){if(!req.user)return res.redirect('/login');next();}
export function requireAdmin(req,res,next){if(req.user?.role!=='admin')return res.status(403).send('Недостаточно прав');next();}
