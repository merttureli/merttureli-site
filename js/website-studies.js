// Studies on websites.html: pick one of four working redesigns, see its first screen, then load the real page
// into the frame on request. At most one live frame exists at a time, and only after a click. On phones the
// Explore action opens the full page instead.
(()=>{
  const root=document.getElementById('studies');
  if(!root)return;
  const $=s=>root.querySelector(s),$$=s=>Array.from(root.querySelectorAll(s));
  const options=$$('.study-option'),frame=$('.study-frame'),screen=$('.study-screen'),picture=$('.study-poster');
  const img=picture.querySelector('img'),sources=Array.from(picture.querySelectorAll('source'));
  const loading=$('.study-loading'),explore=$('.study-explore'),open=$('.study-open'),status=$('[data-study-status]');
  const phone=matchMedia('(max-width: 700px)');
  const VIRTUAL_MIN=1200; // the live page renders at least this wide, then scales to fit the frame
  let current=options.find(o=>o.getAttribute('aria-pressed')==='true').dataset.study;
  let iframe=null,state='poster',readyTimer=0;

  const info=key=>{const o=options.find(x=>x.dataset.study===key);return{key,name:o.dataset.name,letter:o.dataset.letter,line:o.querySelector('.study-option-line').textContent};};
  const fill=(sel,text)=>$$(sel).forEach(n=>{n.textContent=text;});
  const swapKey=(url,from,to)=>url.split(`/${from}-`).join(`/${to}-`);
  const setState=s=>{state=s;frame.dataset.state=s;fill('[data-study-state]',s==='live'?'Live':s==='loading'?'Loading':'Preview');};

  function setExplore(live){
    explore.setAttribute('aria-pressed',String(live));
    explore.firstChild.textContent=live?'Close live view ':'Explore it here ';
    explore.lastElementChild.textContent=live?'×':'→';
  }

  function size(){
    if(!iframe)return;
    const w=screen.clientWidth,h=screen.clientHeight;if(!w||!h)return;
    const vw=Math.max(w,VIRTUAL_MIN),scale=w/vw;
    iframe.style.width=vw+'px';iframe.style.height=Math.round(h/scale)+'px';
    iframe.style.transform=scale===1?'':`scale(${scale})`;
  }

  function closeLive(returnFocus){
    clearTimeout(readyTimer);
    const hadFocus=iframe&&document.activeElement===iframe;
    if(iframe){iframe.remove();iframe=null;}
    loading.hidden=true;setState('poster');setExplore(false);
    if(returnFocus||hadFocus)explore.focus();
  }

  function openLive(){
    const s=info(current);
    if(iframe)iframe.remove();
    clearTimeout(readyTimer);
    setState('loading');setExplore(true);
    loading.hidden=false;status.textContent=`Loading the ${s.name} page`;
    const f=document.createElement('iframe');
    f.title=`${s.name} direction, live page`;
    f.src=`studies/${s.key}/`;
    f.addEventListener('load',()=>{
      if(iframe!==f)return;
      // Give the page a moment to paint its first screen before the poster gives way.
      readyTimer=setTimeout(()=>{
        if(iframe!==f)return;
        loading.hidden=true;setState('live');
        status.textContent=`The ${s.name} page is live in the frame. Scroll and click inside it.`;
        if(document.activeElement===explore||document.activeElement===document.body)f.focus();
      },350);
    });
    iframe=f;screen.append(f);size();
  }

  function select(key){
    if(key===current)return;
    const prev=current;current=key;
    const s=info(key);
    options.forEach(o=>o.setAttribute('aria-pressed',String(o.dataset.study===key)));
    frame.setAttribute('aria-label',`${s.name} direction`);
    fill('[data-study-key]',key);fill('[data-study-name]',s.name);fill('[data-study-letter]',s.letter);fill('[data-study-line]',s.line);
    open.href=`studies/${key}/`;
    img.alt=`First screen of the ${s.name} direction`;
    picture.classList.add('is-swapping');
    const done=()=>picture.classList.remove('is-swapping');
    img.addEventListener('load',done,{once:true});setTimeout(done,700);
    sources.forEach(src=>{src.srcset=swapKey(src.srcset,prev,key);});
    img.srcset=swapKey(img.srcset,prev,key);img.src=swapKey(img.src,prev,key);
    if(state!=='poster')openLive();else status.textContent=`${s.name} selected`;
  }

  // Warm the poster a visitor is about to pick, in the size this screen is already using.
  const warmed=new Set([current]);
  const warm=key=>{if(warmed.has(key)||!img.currentSrc)return;warmed.add(key);new Image().src=swapKey(img.currentSrc,current,key);};

  options.forEach(o=>{
    o.addEventListener('click',()=>select(o.dataset.study));
    o.addEventListener('pointerenter',()=>warm(o.dataset.study));
    o.addEventListener('focus',()=>warm(o.dataset.study));
  });
  explore.hidden=false;
  explore.addEventListener('click',()=>{
    if(phone.matches){location.href=open.href;return;}
    if(state==='poster')openLive();else closeLive(true);
  });
  const onPhone=()=>{if(phone.matches&&iframe)closeLive(false);};
  if(phone.addEventListener)phone.addEventListener('change',onPhone);else if(phone.addListener)phone.addListener(onPhone);
  if('ResizeObserver' in window)new ResizeObserver(size).observe(screen);else addEventListener('resize',size);
})();
