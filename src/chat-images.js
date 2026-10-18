import {createHash} from 'node:crypto';
export const imageLimit=3*1024*1024;
const fail=(message,status=400)=>Object.assign(Error(message),{status});
export function inspectChatImage(bytes){
 if(!Buffer.isBuffer(bytes)||!bytes.length)throw fail('Выбери изображение');if(bytes.length>imageLimit)throw fail('Картинка должна быть не больше 3 МБ',413);
 let mime,width,height;
 if(bytes.length>=33&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&bytes.toString('ascii',12,16)==='IHDR'){mime='image/png';width=bytes.readUInt32BE(16);height=bytes.readUInt32BE(20);}
 else if(bytes.length>=12&&bytes[0]===255&&bytes[1]===216){mime='image/jpeg';let at=2;while(at+4<=bytes.length){if(bytes[at++]!==255)break;let marker=bytes[at++];while(marker===255&&at<bytes.length)marker=bytes[at++];if(marker===217||marker===218)break;const length=bytes.readUInt16BE(at);if(length<2||at+length>bytes.length)break;if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)&&length>=7){height=bytes.readUInt16BE(at+3);width=bytes.readUInt16BE(at+5);break;}at+=length;}}
 else if(bytes.length>=30&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'){mime='image/webp';const type=bytes.toString('ascii',12,16);if(type==='VP8X'&&!(bytes[20]&2)){width=1+bytes.readUIntLE(24,3);height=1+bytes.readUIntLE(27,3);}else if(type==='VP8 '&&bytes[23]===157&&bytes[24]===1&&bytes[25]===42){width=bytes.readUInt16LE(26)&16383;height=bytes.readUInt16LE(28)&16383;}else if(type==='VP8L'&&bytes[20]===47){width=1+(((bytes[22]&63)<<8)|bytes[21]);height=1+(((bytes[24]&15)<<10)|(bytes[23]<<2)|(bytes[22]>>6));}}
 if(!mime||!width||!height||width>10000||height>10000||width*height>25000000)throw fail('Нужна статичная PNG, JPEG или WebP до 25 мегапикселей');return {bytes,mime,size:bytes.length,hash:createHash('sha256').update(bytes).digest('hex')};
}
export async function purgeChatImages(db){return db.query('DELETE FROM message_images WHERE expires_at<=NOW()');}
export async function reserveImage(db,userId,image){await db.query('SELECT id FROM message_image_lock WHERE id=1 FOR UPDATE');await purgeChatImages(db);const all=+(await db.query('SELECT COALESCE(SUM(size),0) AS size FROM message_images')).rows[0].size,own=+(await db.query('SELECT COALESCE(SUM(size),0) AS size FROM message_images WHERE sender_id=$1',[userId])).rows[0].size;if(all+image.size>80*1024*1024)throw fail('Хранилище изображений заполнено. Попробуй позже',507);if(own+image.size>20*1024*1024)throw fail('Лимит твоих картинок — 20 МБ за период хранения',429);}
