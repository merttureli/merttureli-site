// Home, websites section: pick one of four redesigns of this site and it loads live in the frame. Same rules as
// js/website-studies.js: one iframe at a time, created only after the page has loaded and once the section is
// within about a screen of the viewport, removed again when it is far away. Nothing runs while idle.
// The live page ignores the pointer until "Try it" is pressed, so scrolling the home page never gets caught in it.
(()=>{
  const root=document.getElementById('websites');
  if(!root||!root.classList.contains('websell'))return;
  const $=s=>root.querySelector(s),$$=s=>Array.from(root.querySelectorAll(s));
  const options=$$('.websell-option'),frame=$('.websell-frame'),screen=$('.websell-screen'),open=$('.websell-open'),
    status=$('[data-websell-status]'),tryBtn=$('.websell-try'),tryAlt=$('.websell-try-alt');
  const phone=matchMedia('(max-width: 700px)'),reduce=matchMedia('(prefers-reduced-motion: reduce)');
  const SETTLE=450,FADE=240; // ms: let the page paint its first screen; fade the old page out before it is removed
  let current=options.find(o=>o.getAttribute('aria-pressed')==='true').dataset.study;
  let iframe=null,state='idle',near=false,timer=0,token=0;

  const nameOf=key=>options.find(o=>o.dataset.study===key).dataset.name;
  const fill=(sel,text)=>$$(sel).forEach(n=>{n.textContent=text;});
  const setState=s=>{state=s;frame.dataset.state=s;fill('[data-websell-state]',s==='live'?'Live':'Loading');};

  function size(){
    if(!iframe)return;
    const w=screen.clientWidth,h=screen.clientHeight;if(!w||!h)return;
    const vw=phone.matches?390:Math.max(w,1200),scale=w/vw;
    iframe.style.width=vw+'px';iframe.style.height=Math.round(h/scale)+'px';
    iframe.style.transform=scale===1?'':`scale(${scale})`;
  }

  // Using the page: the frame takes the pointer until the pointer leaves it or a tap lands outside it.
  const outside=e=>{if(!frame.contains(e.target)&&!tryAlt.contains(e.target))release();};
  function engage(){
    if(!iframe||state!=='live')return;
    frame.classList.add('is-active');tryAlt.setAttribute('aria-pressed','true');
    iframe.tabIndex=0;iframe.focus({preventScroll:true});
    status.textContent=`The ${nameOf(current)} page is ready to scroll and click.`;
    document.addEventListener('pointerdown',outside,true);
  }
  function release(){
    if(!frame.classList.contains('is-active'))return;
    frame.classList.remove('is-active');tryAlt.setAttribute('aria-pressed','false');
    if(iframe)iframe.tabIndex=-1;
    document.removeEventListener('pointerdown',outside,true);
  }

  function unload(){
    clearTimeout(timer);token++;release();
    if(iframe){iframe.remove();iframe=null;}
    setState('idle');
  }

  function load(){
    unload();
    const name=nameOf(current),mine=token;
    setState('loading');status.textContent=`Loading the ${name} page`;
    const f=document.createElement('iframe');
    f.title=`${name}, a redesign of this site, live`;
    f.tabIndex=-1;
    f.addEventListener('load',()=>{
      if(token!==mine)return;
      // The frame already shows this page's own background; fade in once the first screen has painted.
      timer=setTimeout(()=>{
        if(token!==mine)return;
        setState('live');status.textContent=`The ${name} page is live in the frame.`;
      },reduce.matches?0:SETTLE);
    });
    f.src=`studies/${current}/`;
    iframe=f;screen.append(f);size();
  }

  function select(key){
    if(key===current)return;
    current=key;
    const name=nameOf(key);
    options.forEach(o=>o.setAttribute('aria-pressed',String(o.dataset.study===key)));
    frame.setAttribute('aria-label',`${name} redesign`);
    frame.dataset.study=key;
    fill('[data-websell-key]',key);fill('[data-websell-name]',name);
    tryBtn.setAttribute('aria-label',`Try the ${name} page in the frame`);
    open.href=`studies/${key}/`;
    if(!near){unload();return;} // nothing loads off screen; the section loads the new pick when it nears
    status.textContent=`${name} selected`;
    release();clearTimeout(timer);const mine=++token;
    if(state==='live'&&!reduce.matches){
      // Fade the old page out over the frame's background, which is already easing to the new page's color.
      frame.dataset.state='swapping';
      timer=setTimeout(()=>{if(token===mine)load();},FADE);
    }else load();
  }

  options.forEach(o=>o.addEventListener('click',()=>select(o.dataset.study)));
  tryBtn.addEventListener('click',engage);
  tryAlt.addEventListener('click',()=>frame.classList.contains('is-active')?release():engage());
  // On phones the button under the frame is the control; the overlay only catches taps, so it leaves the tab order.
  const place=()=>{tryBtn.tabIndex=phone.matches?-1:0;tryBtn.toggleAttribute('aria-hidden',phone.matches);};
  place();phone.addEventListener('change',place);
  frame.addEventListener('pointerleave',e=>{if(e.pointerType==='mouse')release();});
  root.addEventListener('click',e=>{
    const t=e.target.closest('[data-track]');
    if(t&&typeof window.mtTrack==='function')window.mtTrack(t.dataset.track);
  });

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
