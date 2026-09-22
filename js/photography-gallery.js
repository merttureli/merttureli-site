export function mountGallery(root){
// Local study inspired by the two supplied 21st.dev component references.
const photos = [
  {file:'moon-pines', title:'Crescent moon', alt:'Crescent moon behind pine branches at dusk'},
  {file:'lighthouse', title:'Lighthouse', alt:'Lighthouse framed by bare branches'},
  {file:'rosa-rugosa', title:'Rosa rugosa', alt:'Rosa rugosa in bloom above a lake'},
  {file:'lake-framed', title:'Still water', alt:'Still water and low mountains framed by trees'}
].map(p => ({...p, src:`assets/photos/beyond/gallery/${p.file}-view.webp`, thumb:`assets/photos/beyond/gallery/${p.file}-thumb.webp`}));
const $ = s => root.querySelector(s);
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const narrow = matchMedia('(max-width:650px)');
const animations = [];
const corridor = $('.corridor'), viewer = $('#viewer'), still = $('#still');
let paused = false, hovered = false, focused = false, visible = false, drag = null, dragged = false, active = 0, lastTrigger;
let transitionToken = 0, transitionFrame = 0, renderer, loadingTimer, loadingIndicator;
const number = i => String(i + 1).padStart(2,'0');
const cached = new Map();
function load(i) {
  if (!cached.has(i)) cached.set(i, new Promise((resolve,reject) => {
    const image = new Image(); image.onload = () => resolve(image); image.onerror = () => {cached.delete(i); reject(Error('Image unavailable'));}; image.src = photos[i].src;
  }));
  return cached.get(i);
}
function syncMotion() {
  const stop = paused || hovered || focused || drag || !visible || document.hidden || viewer.open || reduced.matches;
  corridor.dataset.motion=stop?'paused':'running';
  animations.forEach(a => stop ? a.pause() : a.play());
  $('#pause').textContent = paused || reduced.matches ? 'Resume motion' : 'Pause motion';
  $('#pause').setAttribute('aria-pressed',String(paused || reduced.matches));
  $('#pause').disabled = reduced.matches;
}
function buildCorridor() {
  animations.forEach(a=>a.cancel()); animations.length=0; $('#rails').replaceChildren();
  const small=narrow.matches, perspective=small?55:38, height=small?43:28;
  for (const dir of [-1,1]) for(let i=0;i<8;i++) {
    const index=(i+(dir===1?1:0))%photos.length, p=photos[index];
    const button=document.createElement('button'); button.className='frame'; button.dataset.number=number(index); button.setAttribute('aria-label',`Open ${p.title}`);
    const img=document.createElement('img'); img.src=p.thumb; img.alt=''; img.decoding='async'; img.draggable=false; button.append(img);
    button.addEventListener('click',()=>{if(!dragged)openViewer(index,button);});
    $('#rails').append(button);
    const frames=Array.from({length:33},(_,s)=>{
      const u=s/32, scale=(3/height)*Math.pow((small?75:65)/3,u), z=perspective*(1-1/scale);
      const rail=43-54*Math.pow(1-u,3.3), turn=5+17*u;
      return {transform:`translate3d(${dir*rail}cqw,0,${z}cqw) rotateY(${-dir*turn}deg)`,opacity:Math.min(1,u*12),offset:u};
    });
    const animation=button.animate(frames,{duration:42000,iterations:Infinity,easing:'linear'}); animation.currentTime=i*42000/8; animations.push(animation);
  }
  syncMotion();
}
photos.forEach((p,i)=>{
  const tile=document.createElement('button'); tile.className='tile'; tile.innerHTML=`<div class="photo"><img src="${p.thumb}" alt="${p.alt}" loading="lazy" decoding="async"></div><span class="tile-caption"><span>${p.title}</span><span class="meta">${number(i)} / ↗</span></span>`;
  tile.onclick=()=>openViewer(i,tile); $('#grid')?.append(tile);
  const thumb=document.createElement('button'); thumb.setAttribute('aria-label',`Show ${p.title}`); thumb.innerHTML=`<img src="${p.thumb}" alt="" loading="lazy">`; thumb.onclick=()=>show(i); $('#thumbs').append(thumb);
});
function caption(i){$('#photo-title').textContent=photos[i].title; $('#count').textContent=`${number(i)} / ${number(photos.length-1)}`; [...$('#thumbs').children].forEach((b,n)=>b.setAttribute('aria-current',String(i===n)));}
let previousOverflow;
async function openViewer(i, trigger){previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';lastTrigger=trigger; viewer.showModal(); syncMotion(); active=i; still.src=photos[i].src; still.alt=photos[i].alt; caption(i); $('#close').focus(); await show(i,true);}
function clearLoading(){clearTimeout(loadingTimer);loadingIndicator?.remove();loadingIndicator=null;}
function stopTransition(){clearLoading();transitionToken++; cancelAnimationFrame(transitionFrame); $('#morph').classList.remove('active');}
async function show(index, immediate=false){
  const next=(index+photos.length)%photos.length, previous=active;
  stopTransition(); const token=transitionToken; active=next; caption(next); $('#load-error').hidden=true;
  loadingTimer=setTimeout(()=>{loadingIndicator=document.createElement('project-loader');loadingIndicator.setAttribute('label','Loading photograph');loadingIndicator.style.cssText='position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:2';$('#image-stage').append(loadingIndicator);},250);
  try {
    const incoming=await load(next); if(token!==transitionToken||!viewer.open)return;
    still.src=incoming.src; still.alt=photos[next].alt;
    if(!immediate&&next!==previous&&!reduced.matches&&$('#dissolve').checked){
      const outgoing=await load(previous); if(token!==transitionToken||!viewer.open)return;
      try {const {createDissolve}=await import('./photography-dissolve.js'); if(token!==transitionToken||!viewer.open)return; renderer??=createDissolve($('#morph'),()=>{stopTransition();renderer=undefined;}); renderer.prepare(outgoing,incoming); $('#morph').classList.add('active'); const start=performance.now();
        const frame=now=>{if(token!==transitionToken||!viewer.open)return; const t=Math.min(1,(now-start)/1050), eased=t*t*(3-2*t); renderer.draw(eased); if(t<1)transitionFrame=requestAnimationFrame(frame); else $('#morph').classList.remove('active');}; frame(start);
      } catch {$('#morph').classList.remove('active');}
    }
  } catch {if(token===transitionToken)$('#load-error').hidden=false;}
  finally {if(token===transitionToken)clearLoading();}
}
$('#close').onclick=()=>viewer.close();
viewer.addEventListener('close',()=>{stopTransition(); renderer?.dispose(); renderer=undefined; document.body.style.overflow=previousOverflow; syncMotion(); lastTrigger?.focus({preventScroll:true});});
$('#next').onclick=()=>show(active+1); $('#previous').onclick=()=>show(active-1);
viewer.addEventListener('keydown',e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();show(active+(e.key==='ArrowRight'?1:-1));}});
let swipe; $('#image-stage').onpointerdown=e=>{swipe=e.clientX;}; $('#image-stage').onpointerup=e=>{if(swipe!==undefined&&Math.abs(e.clientX-swipe)>45)show(active+(e.clientX<swipe?1:-1));swipe=undefined;}; $('#image-stage').onpointercancel=()=>{swipe=undefined;};
$('#enter').onclick=()=>openViewer(0,$('#enter'));
$('#pause').onclick=()=>{paused=!paused;syncMotion();};
corridor.addEventListener('pointerenter',e=>{if(e.pointerType==='mouse'){hovered=true;syncMotion();}});
corridor.addEventListener('pointerleave',()=>{hovered=false;syncMotion();});
corridor.addEventListener('focusin',()=>{focused=true;syncMotion();}); corridor.addEventListener('focusout',e=>{if(!corridor.contains(e.relatedTarget)){focused=false;syncMotion();}});
corridor.addEventListener('pointerdown',e=>{if(e.target.closest('.corridor-controls,.corridor-label'))return; dragged=false;drag={x:e.clientX,times:animations.map(a=>a.currentTime)};syncMotion();});
corridor.addEventListener('pointermove',e=>{if(!drag)return;const dx=e.clientX-drag.x;if(Math.abs(dx)>5)dragged=true; animations.forEach((a,i)=>{a.currentTime=drag.times[i]+dx*45;});});
window.addEventListener('pointerup',()=>{if(!drag)return;drag=null;syncMotion();setTimeout(()=>{dragged=false;},0);}); window.addEventListener('pointercancel',()=>{drag=null;syncMotion();});
new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;syncMotion();}).observe(corridor);
document.addEventListener('visibilitychange',()=>{syncMotion();if(document.hidden)stopTransition();});
reduced.addEventListener('change',()=>{syncMotion();stopTransition();}); narrow.addEventListener('change',buildCorridor);
$('#dissolve').onchange=stopTransition;
window.addEventListener('resize',stopTransition);
buildCorridor();


}
