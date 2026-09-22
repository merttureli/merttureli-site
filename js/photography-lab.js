// Local study inspired by the two supplied 21st.dev component references.
const photos = [
  {file:'moon-pines', title:'Crescent moon', alt:'Crescent moon behind pine branches at dusk'},
  {file:'lighthouse', title:'Lighthouse', alt:'Lighthouse framed by bare branches'},
  {file:'rosa-rugosa', title:'Rosa rugosa', alt:'Rosa rugosa in bloom above a lake'},
  {file:'lake-framed', title:'Still water', alt:'Still water and low mountains framed by trees'}
].map(p => ({...p, src:`assets/photos/beyond/${p.file}.jpg`}));
const $ = s => document.querySelector(s);
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const narrow = matchMedia('(max-width:650px)');
const animations = [];
const corridor = $('.corridor'), viewer = $('#viewer'), still = $('#still');
let paused = false, hovered = false, focused = false, visible = true, drag = null, dragged = false, active = 0, lastTrigger;
let transitionToken = 0, transitionFrame = 0, renderer;
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
    const img=document.createElement('img'); img.src=p.src; img.alt=''; img.decoding='async'; img.draggable=false; button.append(img);
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
  const tile=document.createElement('button'); tile.className='tile'; tile.innerHTML=`<div class="photo"><img src="${p.src}" alt="${p.alt}" loading="lazy" decoding="async"></div><span class="tile-caption"><span>${p.title}</span><span class="meta">${number(i)} / ↗</span></span>`;
  tile.onclick=()=>openViewer(i,tile); $('#grid').append(tile);
  const thumb=document.createElement('button'); thumb.setAttribute('aria-label',`Show ${p.title}`); thumb.innerHTML=`<img src="${p.src}" alt="" loading="lazy">`; thumb.onclick=()=>show(i); $('#thumbs').append(thumb);
});
function caption(i){$('#photo-title').textContent=photos[i].title; $('#count').textContent=`${number(i)} / ${number(photos.length-1)}`; [...$('#thumbs').children].forEach((b,n)=>b.setAttribute('aria-current',String(i===n)));}
async function openViewer(i, trigger){lastTrigger=trigger; viewer.showModal(); syncMotion(); active=i; still.src=photos[i].src; still.alt=photos[i].alt; caption(i); $('#close').focus(); await show(i,true);}
function stopTransition(){transitionToken++; cancelAnimationFrame(transitionFrame); $('#morph').classList.remove('active');}
async function show(index, immediate=false){
  const next=(index+photos.length)%photos.length, previous=active;
  stopTransition(); const token=transitionToken; active=next; caption(next); $('#load-error').hidden=true;
  try {
    const incoming=await load(next); if(token!==transitionToken||!viewer.open)return;
    still.src=incoming.src; still.alt=photos[next].alt;
    if(!immediate&&next!==previous&&!reduced.matches&&$('#dissolve').checked){
      const outgoing=await load(previous); if(token!==transitionToken||!viewer.open)return;
      try {renderer??=createDissolve($('#morph')); renderer.prepare(outgoing,incoming); $('#morph').classList.add('active'); const start=performance.now();
        const frame=now=>{if(token!==transitionToken||!viewer.open)return; const t=Math.min(1,(now-start)/1050), eased=t*t*(3-2*t); renderer.draw(eased); if(t<1)transitionFrame=requestAnimationFrame(frame); else $('#morph').classList.remove('active');}; frame(start);
      } catch {$('#morph').classList.remove('active');}
    }
  } catch {if(token===transitionToken)$('#load-error').hidden=false;}
}
$('#close').onclick=()=>viewer.close();
viewer.addEventListener('close',()=>{stopTransition(); syncMotion(); lastTrigger?.focus({preventScroll:true});});
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
window.addEventListener('pointerup',()=>{drag=null;syncMotion();setTimeout(()=>{dragged=false;},0);}); window.addEventListener('pointercancel',()=>{drag=null;syncMotion();});
new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;syncMotion();}).observe(corridor);
document.addEventListener('visibilitychange',()=>{syncMotion();if(document.hidden)stopTransition();});
reduced.addEventListener('change',()=>{syncMotion();stopTransition();}); narrow.addEventListener('change',buildCorridor);
$('#dissolve').onchange=stopTransition;
window.addEventListener('resize',stopTransition);
buildCorridor();

// Render only during a requested transition. Two reusable textures bound memory.
function createDissolve(canvas){
  const gl=canvas.getContext('webgl',{alpha:false,antialias:false}); if(!gl)throw Error('WebGL unavailable');
  const vert=`attribute vec2 p; varying vec2 uv; void main(){uv=p*.5+.5;gl_Position=vec4(p,0.,1.);}`;
  const frag=`precision mediump float; varying vec2 uv; uniform sampler2D a,b; uniform float t,aspect,aa,ba;
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
    float field(vec2 p){return .57*noise(p)+.28*noise(p*2.1)+.15*noise(p*4.3);}
    vec4 photo(sampler2D img,vec2 v,float r){vec2 scale=aspect>r?vec2(aspect/r,1.):vec2(1.,r/aspect);vec2 q=(v-.5)*scale+.5; if(q.x<0.||q.x>1.||q.y<0.||q.y>1.)return vec4(vec3(.0392),1.);return texture2D(img,q);}
    void main(){vec4 target=photo(b,uv,ba);float n=field(uv*5.2+vec2(0,t*.15));float light=dot(target.rgb,vec3(.2126,.7152,.0722));float threshold=clamp(n*.8+(1.-light)*.2,0.,1.);float sweep=t*1.3-.15;float m=1.-smoothstep(sweep-.13,sweep+.13,threshold);float drift=.008*sin(t*3.14159);gl_FragColor=mix(photo(a,uv+vec2(0,drift),aa),photo(b,uv-vec2(0,drift),ba),m);}`;
  function compile(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;}
  const program=gl.createProgram(),vs=compile(gl.VERTEX_SHADER,vert),fs=compile(gl.FRAGMENT_SHADER,frag);gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);gl.deleteShader(vs);gl.deleteShader(fs);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('Shader link failed');gl.useProgram(program);
  const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);const loc=gl.getAttribLocation(program,'p');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
  const uniforms=Object.fromEntries(['a','b','t','aspect','aa','ba'].map(n=>[n,gl.getUniformLocation(program,n)]));
  const textures=[gl.createTexture(),gl.createTexture()];gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();stopTransition();renderer=undefined;});
  return {prepare(from,to){const rect=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio,1.5);canvas.width=Math.min(1920,Math.round(rect.width*dpr));canvas.height=Math.round(canvas.width*rect.height/rect.width);gl.viewport(0,0,canvas.width,canvas.height);gl.useProgram(program);
    [from,to].forEach((img,i)=>{gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,textures[i]);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,img);gl.uniform1i(uniforms[i?'b':'a'],i);gl.uniform1f(uniforms[i?'ba':'aa'],img.naturalWidth/img.naturalHeight);});gl.uniform1f(uniforms.aspect,canvas.width/canvas.height);},draw(t){gl.uniform1f(uniforms.t,t);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);}};
}
