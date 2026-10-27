export const SHELL_CACHE='yoru-offline-shell-v4';
export const VIDEO_PREFIX='yoru-offline-video-v1-';
export const MAX_BYTES=1536*1024*1024;
export function providerUrl(value,base){
 const u=new URL(value,base);
 if(u.protocol!=='https:'||u.username||u.password||u.port||!(u.hostname==='libria.fun'||u.hostname.endsWith('.libria.fun')))throw Error('Источник содержит неподдерживаемую ссылку.');
 return u.href;
}
export function compilePlaylist(text,source,id){
 providerUrl(source);if(!/^[a-f0-9-]{36}$/.test(id))throw Error('Неверный идентификатор загрузки.');
 if(text.length>1000000||!text.trimStart().startsWith('#EXTM3U')||!text.includes('#EXT-X-ENDLIST'))throw Error('Нужен полный плейлист готовой серии.');
 if(/#EXT-X-(?:STREAM-INF|MEDIA:|BYTERANGE|I-FRAME|PART:|PRELOAD|SESSION-)/.test(text))throw Error('Этот формат потока пока не поддерживается для загрузки.');
 const files=[],known=new Map(),root='/offline/media/'+id+'/';
 const resource=(value,kind)=>{const url=providerUrl(value,source);if(known.has(url))return known.get(url);if(files.length>=3000)throw Error('В серии слишком много фрагментов для загрузки.');const path=root+files.length;files.push({url,path,kind});known.set(url,path);return path;};
 const lines=text.trim().split(/\r?\n/).map(line=>{
  if(!line||line.startsWith('#')&&!line.includes('URI='))return line;
  if(!line.startsWith('#'))return resource(line.trim(),'segment');
  if(line.startsWith('#EXT-X-KEY:')){if(/METHOD=NONE(?:,|$)/.test(line))return line;if(!/METHOD=AES-128(?:,|$)/.test(line)||/KEYFORMAT=/.test(line))throw Error('Защищённый формат потока не поддерживается.');}
  else if(!line.startsWith('#EXT-X-MAP:'))throw Error('Неподдерживаемая ссылка в плейлисте.');
  if(!/URI="[^"]+"/.test(line))throw Error('Некорректная ссылка в плейлисте.');
  return line.replace(/URI="([^"]+)"/,(_,url)=>'URI="'+resource(url,line.startsWith('#EXT-X-KEY:')?'key':'init')+'"');
 });
 if(!files.some(f=>f.kind==='segment'))throw Error('В плейлисте нет видео.');
 return {files,manifest:lines.join('\n')+'\n',root};
}
export async function rangedResponse(response,range,method='GET'){
 const headers=new Headers(response.headers);headers.set('Accept-Ranges','bytes');
 if(!range)return new Response(method==='HEAD'?null:response.body,{status:200,headers});
 const blob=await response.blob(),size=blob.size,m=/^bytes=(\d*)-(\d*)$/.exec(range);
 let start=m?.[1]?Number(m[1]):0,end=m?.[2]?Number(m[2]):size-1;
 if(m&&!m[1]&&m[2]){start=Math.max(0,size-Number(m[2]));end=size-1;}
 if(!m||!m[1]&&!m[2]||!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>=size||end<start||size===0){headers.set('Content-Range','bytes */'+size);headers.delete('Content-Length');return new Response(null,{status:416,headers});}
 end=Math.min(end,size-1);headers.set('Content-Range','bytes '+start+'-'+end+'/'+size);headers.set('Content-Length',String(end-start+1));
 return new Response(method==='HEAD'?null:blob.slice(start,end+1),{status:206,headers});
}
