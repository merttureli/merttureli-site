// Studies on websites.html: pick one of four working redesigns and it loads live in the frame. One iframe at a
// time, created only when the section is within about a screen of the viewport, removed again when it is far away.
(()=>{
  const root=document.getElementById('studies');
  if(!root)return;
  const $=s=>root.querySelector(s),$$=s=>Array.from(root.querySelectorAll(s));
  const options=$$('.study-option'),frame=$('.study-frame'),screen=$('.study-screen'),open=$('.study-open'),status=$('[data-study-status]');
  const phone=matchMedia('(max-width: 700px)'),reduce=matchMedia('(prefers-reduced-motion: reduce)');
  const SETTLE=450,FADE=240; // ms: let the page paint its first screen; fade the old page out before it is removed
  let current=options.find(o=>o.getAttribute('aria-pressed')==='true').dataset.study;
  let iframe=null,state='idle',near=false,timer=0,token=0;

  const info=key=>{const o=options.find(x=>x.dataset.study===key);return{key,name:o.dataset.name,letter:o.dataset.letter,line:o.querySelector('.study-option-line').textContent};};
  const fill=(sel,text)=>$$(sel).forEach(n=>{n.textContent=text;});
  const setState=s=>{state=s;frame.dataset.state=s;fill('[data-study-state]',s==='live'?'Live':'Loading');};

  // The live page renders at 1200 px (390 px on phones) and is scaled to fit the frame.
  function size(){
    if(!iframe)return;
    const w=screen.clientWidth,h=screen.clientHeight;if(!w||!h)return;
    const vw=phone.matches?390:Math.max(w,1200),scale=w/vw;
    iframe.style.width=vw+'px';iframe.style.height=Math.round(h/scale)+'px';
    iframe.style.transform=scale===1?'':`scale(${scale})`;
  }

  function unload(){
    clearTimeout(timer);token++;
    if(iframe){iframe.remove();iframe=null;}
    setState('idle');
  }

  function load(){
    unload();
    const s=info(current),mine=token;
    setState('loading');status.textContent=`Loading the ${s.name} page`;
    const f=document.createElement('iframe');
    f.title=`${s.name} direction, live page`;
    f.loading='lazy';
    f.addEventListener('load',()=>{
      if(token!==mine)return;
      // The frame already shows this page's own background; fade in once the first screen has painted.
      timer=setTimeout(()=>{
        if(token!==mine)return;
        setState('live');status.textContent=`The ${s.name} page is live in the frame.`;
      },reduce.matches?0:SETTLE);
    });
    f.src=`studies/${s.key}/`;
    iframe=f;screen.append(f);size();
  }

  function select(key){
    if(key===current)return;
    current=key;
    const s=info(key);
    options.forEach(o=>o.setAttribute('aria-pressed',String(o.dataset.study===key)));
    frame.setAttribute('aria-label',`${s.name} direction`);
    frame.dataset.study=key;
    fill('[data-study-key]',key);fill('[data-study-name]',s.name);fill('[data-study-letter]',s.letter);fill('[data-study-line]',s.line);
    open.href=`studies/${key}/`;
    if(!near){unload();return;} // nothing is loaded off screen; the section loads the new pick when it nears
    status.textContent=`${s.name} selected`;
    clearTimeout(timer);const mine=++token;
    if(state==='live'&&!reduce.matches){
      // Fade the old page out over the frame's background, which is already easing to the new page's color.
      frame.dataset.state='swapping';
      timer=setTimeout(()=>{if(token===mine)load();},FADE);
    }else load();
  }

  options.forEach(o=>o.addEventListener('click',()=>select(o.dataset.study)));

  if('IntersectionObserver' in window){
    new IntersectionObserver(es=>{
      near=es[es.length-1].isIntersecting;
      if(!near||iframe)return;
      if(document.readyState==='complete')load();
      else addEventListener('load',()=>{if(near&&!iframe)load();},{once:true}); // never compete with the page's own load
    },{rootMargin:'60% 0px'}).observe(root);
    new IntersectionObserver(es=>{
      if(!es[es.length-1].isIntersecting&&iframe){near=false;unload();}
    },{rootMargin:'150% 0px'}).observe(root);
  }else{near=true;addEventListener('load',()=>setTimeout(load,1500),{once:true});}

  if('ResizeObserver' in window)new ResizeObserver(size).observe(screen);else addEventListener('resize',size);
})();
