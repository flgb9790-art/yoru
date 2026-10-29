/* Kodik's documented postMessage API, adapted to room media events. */
(()=>{
window.yoruKodikRoom={create({host,signal}){
 const frame=document.createElement('iframe');frame.title='Совместный просмотр — Kodik';frame.allow='autoplay; fullscreen; picture-in-picture; encrypted-media';frame.allowFullscreen=true;frame.referrerPolicy='strict-origin-when-cross-origin';host.prepend(frame);
 let position=0,volume=1,muted=false,paused=true,ready=0,duration=NaN,episode=0,season=1,base='';const origin='https://kodikplayer.com';
 const command=(method,fields={})=>{if(!signal.aborted)frame.contentWindow?.postMessage({key:'kodik_player_api',value:{method,...fields}},origin);};
 class Media extends EventTarget{
  get currentTime(){return position;}set currentTime(value){if(Number.isFinite(value)){position=Math.max(0,value);command('seek',{seconds:position});}}
  get volume(){return volume;}set volume(value){volume=Math.max(0,Math.min(1,value));command('volume',{volume});}
  get muted(){return muted;}set muted(value){muted=Boolean(value);command(muted?'mute':'unmute');}
  get paused(){return paused;}get duration(){return duration;}get readyState(){return ready;}get seeking(){return false;}
  get parentElement(){return host;}set playbackRate(value){command('speed',{speed:value});}set controls(value){}
  play(){command('play');return Promise.resolve();}pause(){command('pause');}load(){}removeAttribute(){}canPlayType(){return '';}
  setSource(url,number,seasonNumber=1,skipRule=''){const u=new URL(url);if(u.origin!==origin)throw Error('Неверный плеер Kodik.');if(!/\/video\//.test(u.pathname))u.searchParams.set('only_season','true');u.searchParams.set('hide_selectors','true');u.searchParams.set('hide_resume_button','true');u.searchParams.set('auto_translation','false');if(skipRule)u.searchParams.set('skip_button',skipRule);position=0;duration=NaN;ready=0;paused=true;if(base===u.href){episode=number;season=seasonNumber;command('change_episode',{episode,season,without_reload:true});return false;}else{base=u.href;episode=number;season=seasonNumber;u.searchParams.set('episode',episode);u.searchParams.set('season',season);frame.src=u.href;return true;}}
 }
 const media=new Media();frame.addEventListener?.('load',()=>media.onFrameReady?.(),{signal});const emit=name=>media.dispatchEvent(new Event(name));
 const markReady=()=>{if(!ready){ready=1;media.onloadedmetadata?.();}};
 window.addEventListener('message',event=>{if(event.source!==frame.contentWindow||event.origin!==origin)return;let data=event.data;if(typeof data==='string'){if(data.length>4096)return;try{data=JSON.parse(data);}catch{return;}}if(!data||typeof data!=='object')return;const value=data.value;
 switch(data.key){case 'kodik_player_play':case 'kodik_player_video_started':paused=false;markReady();emit('play');emit('playing');break;
 case 'kodik_player_pause':paused=true;emit('pause');break;
 case 'kodik_player_time_update':case 'kodik_player_time':if(Number.isFinite(Number(value))&&Number(value)>=0&&Number(value)<=86400){position=Number(value);markReady();emit('timeupdate');}break;
 case 'kodik_player_duration_update':if(Number.isFinite(Number(value))&&Number(value)>0&&Number(value)<=86400){duration=Number(value);markReady();}break;
 case 'kodik_player_seek':if(Number.isFinite(Number(value?.time))&&Number(value.time)>=0&&Number(value.time)<=86400){position=Number(value.time);emit('seeking');emit('seeked');}break;
 case 'kodik_player_video_ended':paused=true;emit('ended');break;
 case 'kodik_player_volume_change':if(typeof value?.muted==='boolean'&&Number.isFinite(value.volume)&&value.volume>=0&&value.volume<=1){volume=value.volume;muted=value.muted;emit('volumechange');}break;
 case 'kodik_player_current_episode':if(Number.isInteger(value?.episode)&&value.episode>0&&Number.isInteger(value?.season)&&value.season===season&&value.episode!==episode){episode=value.episode;media.onEpisode?.(episode);}break;
 }
 },{signal});signal.addEventListener('abort',()=>frame.remove(),{once:true});return media;
}};
})();
