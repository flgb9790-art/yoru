document.querySelectorAll('[data-countdown]').forEach(element=>{
 const date=new Date(element.dataset.countdown);if(Number.isNaN(date.valueOf()))return;
 function update(){const total=Math.floor((date-Date.now())/1000);if(total<=0){element.textContent='Время эфира наступило. Появление перевода проверяется отдельно.';return;}const days=Math.floor(total/86400),hours=Math.floor(total/3600)%24,minutes=Math.floor(total/60)%60;element.textContent=`До следующей серии: ${days} дн. ${hours} ч. ${minutes} мин.`;}
 update();setInterval(update,1000);
});
