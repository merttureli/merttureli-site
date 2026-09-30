(() => {
 const key='mert-portfolio-palette-v1',names=['original','green','slate','warm'],labels={original:'Original',green:'Card green',slate:'Slate',warm:'Warm',daily:'Daily'};
 let preference='original';try{const saved=localStorage.getItem(key);if(Object.hasOwn(labels,saved))preference=saved;}catch{}
 const day=new Date();const dayIndex=Math.floor(Date.UTC(day.getFullYear(),day.getMonth(),day.getDate())/86400000);
 function apply(){document.documentElement.dataset.cardTheme=preference==='daily'?names[((dayIndex%names.length)+names.length)%names.length]:preference;}
 apply();
 function mount(){if(document.querySelector('.site-palette'))return;const panel=document.createElement('details');panel.className='site-palette';panel.innerHTML='<summary aria-label="Choose website colors">Colors</summary><div class="palette-options" role="group" aria-label="Website colors">'+Object.entries(labels).map(([id,label])=>'<button type="button" data-palette="'+id+'" aria-pressed="false"><i aria-hidden="true" style="--swatch:'+({original:'#0a0a0a',green:'#1c2520',slate:'#202a34',warm:'#302820',daily:'linear-gradient(120deg,#1c2520,#584736)'}[id])+'"></i>'+label+'</button>').join('')+'<p>Daily picks one palette per day. Your choice stays saved on this device.</p></div>';document.body.append(panel);
 function update(){panel.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.palette===preference)));}
 update();panel.addEventListener('click',e=>{const b=e.target.closest('button[data-palette]');if(!b)return;preference=b.dataset.palette;apply();update();try{localStorage.setItem(key,preference);}catch{panel.querySelector('p').textContent='This browser cannot save your choice. It applies to this page only.';}});
 panel.addEventListener('keydown',e=>{if(e.key==='Escape'){panel.open=false;panel.querySelector('summary').focus();}});
 document.addEventListener('click',e=>{if(!panel.contains(e.target))panel.open=false;});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();