import * as THREE from 'three';
import {OrbitControls} from './vendor/OrbitControls.js';
import {storyFor} from './part-stories.js';
import {easeInOut,fitDistance,opacityFor} from './focus-motion.js';
import {createLivery} from './livery.js';
import {smoothNoseNormals} from './nose-normals.js';
import {VIEW as HERO_VIEW,HERO_RIG} from '../rocket/rig.js';

const $=id=>document.getElementById(id),stage=$('stage'),explorer=$('explorer');
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const embedded=new URLSearchParams(location.search).get('embed')==='1';
const modal=new URLSearchParams(location.search).get('modal')==='1';
if(embedded)document.body.classList.add('embed');
if(modal)document.body.classList.add('modal');
// Inline: the home page shows the explorer in the CHARGER entry, drawn exactly like its hero rocket
// until the visitor expands it (see the handoff API at the end of this file).
let inline=new URLSearchParams(location.search).get('inline')==='1';
if(inline)document.documentElement.classList.add('inline');
if(embedded&&!modal&&window.parent!==window){
  let height=0;
  new ResizeObserver(()=>{const next=Math.ceil(explorer.getBoundingClientRect().height);if(next!==height){height=next;window.parent.postMessage({type:'charger:resize',height:next},location.origin);}}).observe(explorer);
}
let renderer,data,selected=null,mode='solid',inside=false,frame=0,motion=null,visible=true,hostActive=true,hand=null,heldView=null,interacted=false,readyResolve;
const ready=new Promise(resolve=>{readyResolve=resolve;});
window.addEventListener('message',event=>{
  if(!modal||event.origin!==location.origin||event.source!==window.parent||event.data?.type!=='charger:active')return;
  hostActive=event.data.active===true;
  if(hostActive)resize();else{cancelAnimationFrame(frame);frame=0;}
});
const groups=[],hotspots=[],raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
const root=new THREE.Group(),scene=new THREE.Scene();scene.add(root);root.rotation.z=-.42;
const FOV=36,camera=new THREE.PerspectiveCamera(FOV,1,.00005,20);
const clip=new THREE.Plane(new THREE.Vector3(0,0,-1),0);
try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'low-power'});}
catch(error){$('loading').textContent='3D graphics are unavailable in this browser.';throw error;}
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setClearColor(0x0a0a0a,0);
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.localClippingEnabled=true;stage.prepend(renderer.domElement);
const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=false;controls.minDistance=.006;controls.maxDistance=6;
controls.listenToKeyEvents(stage);
controls.addEventListener('change',invalidate);
controls.addEventListener('start',()=>{if(motion)motion.interrupted=true;if(inline&&!interacted){interacted=true;notifyHost('charger:interact');}});
// Inline orbiting moves the camera: keep the held view in step so a resize does not undo it.
controls.addEventListener('change',()=>{if(heldView&&!hand){heldView.dir=camera.position.clone().sub(controls.target).normalize();heldView.dist=camera.position.distanceTo(controls.target);}});
// Two light rigs: the explorer's own, and the hero rocket's (assets/rocket/rig.js) for the seated rocket.
// setRigMix crossfades them (1 = hero rig only); light adds linearly, so the picture blends smoothly.
const exploreRig=new THREE.Group(),heroRig=new THREE.Group();scene.add(exploreRig,heroRig);
exploreRig.add(new THREE.HemisphereLight(0xffffff,0x777777,2.6));
for(const [position,power] of [[[3,4,5],3.5],[[-3,0,-2],2]]){const light=new THREE.DirectionalLight(0xffffff,power);light.position.set(...position);exploreRig.add(light);}
for(const l of HERO_RIG){const light=l.type==='hemi'?new THREE.HemisphereLight(l.sky,l.ground,l.intensity):new THREE.DirectionalLight(l.color,l.intensity);if(l.position)light.position.set(...l.position);heroRig.add(light);}
for(const light of [...exploreRig.children,...heroRig.children])light.userData.base=light.intensity;
let rigMix=0;
function setRigMix(m){rigMix=m;for(const l of exploreRig.children)l.intensity=l.userData.base*(1-m);for(const l of heroRig.children)l.intensity=l.userData.base*m;exploreRig.visible=m<1;heroRig.visible=m>0;}
setRigMix(0);

function options(){return {shell:$('shell').checked,inside,mode};}
function invalidate(){if(!frame&&(visible||hand)&&hostActive&&!document.hidden)frame=requestAnimationFrame(draw);}
function draw(now){
  frame=0;
  if(hand)stepHand(now);
  else if(motion){
    const t=motion.duration?Math.min(1,(now-motion.start)/motion.duration):1,k=easeInOut(t);
    if(!motion.interrupted){camera.position.lerpVectors(motion.fromCamera,motion.toCamera,k);controls.target.lerpVectors(motion.fromTarget,motion.toTarget,k);root.rotation.z=THREE.MathUtils.lerp(motion.fromRotation,motion.toRotation,k);}
    groups.forEach((g,i)=>{g.userData.opacity=THREE.MathUtils.lerp(motion.fromOpacity[i],motion.toOpacity[i],k);});
    applyAppearance();controls.update();
    if(t===1){const done=motion.done;motion=null;done?.();}
  }
  // Keep depth precision at assembly scale without clipping close component views.
  const near=Math.max(.00005,Math.min(.02,camera.position.distanceTo(controls.target)*.01));
  if(camera.near!==near){camera.near=near;camera.updateProjectionMatrix();}
  root.updateMatrixWorld(true);placeHotspots();renderer.render(scene,camera);
  if(motion)invalidate();
}
const canvasSize=new THREE.Vector2();
function resize(){
  const w=Math.max(1,stage.clientWidth),h=Math.max(1,stage.clientHeight),size=renderer.getSize(canvasSize),changed=size.x!==w||size.y!==h;
  // Resizing clears the canvas, so only resize on a real change, and then draw before the next paint.
  if(changed){renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();}
  // While the home page holds the view (inline, or growing into or out of the dialog) keep the rocket where it is.
  if(heldView){if(!hand)applyView(heldView);renderNow();return;}
  if(data)transitionTo(selected,{duration:motion?.duration?motion.duration:0,refit:true});else invalidate();
  if(changed&&data&&motion&&!motion.duration&&hostActive){cancelAnimationFrame(frame);draw(performance.now());}
}
new ResizeObserver(resize).observe(stage);
new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible)invalidate();else if(frame){cancelAnimationFrame(frame);frame=0;}},{threshold:0}).observe(stage);
document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0;}else invalidate();});

function applyAppearance(){
  const cutting=$('cutaway').checked;
  for(const g of groups){
    const p=g.userData.part,opacity=g.userData.opacity,active=p.id===selected;
    g.visible=opacity>.0005;
    for(const obj of g.children){
      const wire=obj.isLineSegments;
      obj.visible=wire?(mode!=='solid'||!p.mesh):mode!=='wire';
      const wireStrength=mode==='wire'?.75:(active?.38:.17);
      obj.material.opacity=opacity*(wire?wireStrength:1);
      const transparent=wire||opacity<.999;
      if(obj.material.transparent!==transparent){obj.material.transparent=transparent;obj.material.needsUpdate=true;}
      obj.material.depthWrite=!wire&&!transparent;
      obj.material.color.setHex(wire?(active?0xffffff:0x999999):(obj.userData.liveryColor??(active?0xf1f1ee:(p.exterior?0xc8c8c5:0x9c9c99))));
      obj.material.clippingPlanes=cutting&&p.exterior?[clip]:[];
      obj.renderOrder=active?3:0;
    }
  }
}
function updatePositions(){
  const amount=Number($('explode').value)/100;
  for(const g of groups){const b=g.userData.part.bounds,c=new THREE.Vector3(...b[0].map((v,j)=>(v+b[1][j])*.0005)),angle=g.userData.part.id*2.39996;g.position.set((Math.abs(c.x)>.005?c.x*2:Math.cos(angle)*.12)*amount,c.y*.75*amount,(Math.abs(c.z)>.005?c.z*2:Math.sin(angle)*.12)*amount);}
  $('explodeValue').value=`${Math.round(amount*100)}%`;
}
function framing(id,aspect=camera.aspect){
  const target=new THREE.Vector3(),size=new THREE.Vector3(),box=new THREE.Box3();
  const rotation=id===null?-.42:0;
  const rot=new THREE.Matrix4().makeRotationZ(rotation);
  if(id!==null){
    const g=groups.find(g=>g.userData.part.id===id);box.copy(g.userData.bounds);box.translate(g.position);box.applyMatrix4(rot);
  }else{
    for(const g of groups){if(g.userData.part.referenceOnly)continue;box.union(g.userData.bounds.clone().translate(g.position).applyMatrix4(rot));}
  }
  box.getCenter(target);box.getSize(size);
  // Fit a diagonal viewing direction conservatively; tiny parts remain inspectable.
  const maxXZ=Math.hypot(size.x,size.z),fitSize=[maxXZ,size.y+size.z*.2,maxXZ*.35];
  const distance=fitDistance(fitSize,aspect,FOV,id===null?1.22:1.42);
  const direction=id===0?new THREE.Vector3(1,-.65,2.8):new THREE.Vector3(1,.22,2.8);
  return {position:target.clone().add(direction.normalize().multiplyScalar(distance)),target,rotation};
}
function transitionTo(id,{duration=reduced.matches?0:1150,refit=false,preserveView=false}={}){
  if(!data)return;
  const view=preserveView?{position:camera.position.clone(),target:controls.target.clone(),rotation:root.rotation.z}:framing(id),settings=options();
  motion={start:performance.now(),duration,fromCamera:camera.position.clone(),toCamera:view.position,fromTarget:controls.target.clone(),toTarget:view.target,fromRotation:root.rotation.z,toRotation:view.rotation,
    fromOpacity:groups.map(g=>g.userData.opacity),toOpacity:groups.map(g=>opacityFor(g.userData.part,id,settings)),done:()=>{if(!refit)$('announce').textContent=id===null?'Full rocket assembly.':`${storyFor(data.parts.find(p=>p.id===id)).label} in focus.`;}};
  invalidate();
}
function select(id,{keyboard=false}={}){
  if(!data)return;const p=data.parts.find(p=>p.id===Number(id));if(!p)return;
  selected=p.id;
  $('partsDialog').close();$('optionsDialog').close();
  explorer.classList.add('focused');$('overview').hidden=true;$('partStory').hidden=false;$('reset').hidden=false;
  const s=storyFor(p);
  $('partNumber').textContent=String(data.parts.filter(p=>!p.referenceOnly).findIndex(item=>item.id===p.id)+1).padStart(2,'0');$('partCategory').textContent=s.category;
  $('selectedName').textContent=s.label;$('partSubtitle').textContent=s.subtitle;$('partDescription').textContent=s.description;$('partRole').textContent=s.role;
  $('partMaterial').hidden=!s.material;$('material').textContent=s.material||'';
  $('sceneMode').textContent='Component focus';
  for(const animation of $('partStory').getAnimations())animation.cancel();
  if(!reduced.matches)$('partStory').animate([{opacity:0,transform:'translateY(14px)'},{opacity:1,transform:'translateY(0)'}],{duration:600,easing:'cubic-bezier(.22,1,.36,1)'});
  renderList();syncDock();transitionTo(selected);
  if(keyboard)$('selectedName').focus({preventScroll:true});
}
function reset(){
  const restoreFocus=$('partStory').contains(document.activeElement)||document.activeElement===$('reset');
  selected=null;explorer.classList.remove('focused');$('overview').hidden=false;$('partStory').hidden=true;$('reset').hidden=true;
  $('explode').value=0;$('shell').checked=true;$('cutaway').checked=false;inside=false;syncInside();updatePositions();renderList();syncDock();$('sceneMode').textContent='Assembly';transitionTo(null);
  if(restoreFocus)$('exploreMount').focus({preventScroll:true});
}
function syncDock(){for(const b of document.querySelectorAll('[data-part]'))b.setAttribute('aria-pressed',String(Number(b.dataset.part)===selected));}
function syncInside(){$('inside').setAttribute('aria-pressed',String(inside));$('inside').textContent=inside?'Show exterior +':'See inside +';}
function renderList(){
  const container=$('partList');container.replaceChildren();
  for(const p of data.parts){if(p.referenceOnly)continue;const b=document.createElement('button'),name=document.createElement('span');b.className='part'+(p.id===selected?' selected':'');b.setAttribute('aria-pressed',String(p.id===selected));name.className='name';name.textContent=storyFor(p).label;b.append(name);b.onclick=()=>select(p.id,{keyboard:true});container.append(b);}
}
function placeHotspots(){
  for(const h of hotspots){
    const g=groups.find(g=>g.userData.part.id===h.id),p=g.userData.bounds.getCenter(new THREE.Vector3()).add(g.position);p.applyMatrix4(root.matrixWorld).project(camera);
    h.button.hidden=selected!==null||p.z<-1||p.z>1||g.userData.opacity<.005;
    h.button.style.transform=`translate(${Math.max(12,Math.min(stage.clientWidth-145,(p.x*.5+.5)*stage.clientWidth+12))}px,${Math.max(55,Math.min(stage.clientHeight-65,(-p.y*.5+.5)*stage.clientHeight-20))}px)`;
  }
}

for(const b of document.querySelectorAll('[data-mode]'))b.onclick=()=>{mode=b.dataset.mode;for(const other of document.querySelectorAll('[data-mode]'))other.setAttribute('aria-pressed',String(other===b));applyAppearance();transitionTo(selected,{duration:reduced.matches?0:450,preserveView:true});};
for(const b of document.querySelectorAll('[data-part]'))b.onclick=()=>select(Number(b.dataset.part),{keyboard:true});
$('exploreMount').onclick=()=>select(18,{keyboard:true});$('reset').onclick=reset;
$('inside').onclick=()=>{inside=!inside;syncInside();$('shell').checked=true;if(selected!==null)resetFocusOnly();else{$('sceneMode').textContent=inside?'Interior':'Assembly';transitionTo(null,{duration:reduced.matches?0:650,preserveView:true});}};
function resetFocusOnly(){selected=null;explorer.classList.remove('focused');$('overview').hidden=false;$('partStory').hidden=true;$('reset').hidden=true;renderList();syncDock();$('sceneMode').textContent=inside?'Interior':'Assembly';transitionTo(null);}
$('previous').onclick=()=>stepPart(-1);$('next').onclick=()=>stepPart(1);
function stepPart(direction){const parts=data.parts.filter(p=>!p.referenceOnly),i=parts.findIndex(p=>p.id===selected);select(parts[(i+direction+parts.length)%parts.length].id,{keyboard:true});}
$('openParts').onclick=()=>$('partsDialog').showModal();$('openOptions').onclick=()=>$('optionsDialog').showModal();
for(const b of document.querySelectorAll('[data-close]'))b.onclick=()=>$(b.dataset.close).close();
document.addEventListener('keydown',e=>{
  if(e.key!=='Escape'||$('partsDialog').open||$('optionsDialog').open)return;
  if(selected!==null){e.preventDefault();reset();}
  else if(modal&&window.parent!==window){e.preventDefault();window.parent.postMessage({type:'charger:close'},location.origin);}
});
for(const id of ['shell','cutaway','explode'])$(id).addEventListener('input',()=>{updatePositions();transitionTo(selected,{duration:0,preserveView:id!=='explode'});});
let down=null;
renderer.domElement.addEventListener('pointerdown',e=>{down=[e.clientX,e.clientY];});
renderer.domElement.addEventListener('pointercancel',()=>{down=null;});
renderer.domElement.addEventListener('pointerup',e=>{
  if(!down||Math.hypot(e.clientX-down[0],e.clientY-down[1])>5){down=null;return;}down=null;
  if(inline||hand){if(inline&&!hand)notifyHost('charger:tap');return;}
  const r=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);raycaster.setFromCamera(pointer,camera);raycaster.params.Line.threshold=.001;
  const objects=groups.filter(g=>g.visible&&g.userData.opacity>.12).flatMap(g=>g.children.filter(o=>o.visible));
  const hits=raycaster.intersectObjects(objects).filter(hit=>{const p=hit.object.userData.part;return !($('cutaway').checked&&p.exterior&&clip.distanceToPoint(hit.point)<0);});
  if(hits.length)select(hits[0].object.userData.part.id);
});
renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();$('announce').textContent='3D graphics paused. Reload to restore the model.';});

/* Home page handoff (assets/charger-explorer/integration.js). The home page shows this page inline in
   the CHARGER entry, where it has to look exactly like the hero rocket that just landed there, and grows
   it into the full-screen dialog and back. A view says where the rocket is on screen: root and light
   rotation, camera direction, target and distance, k (CSS px per metre at the target) and cx, cy (where
   the target sits, in this page's viewport px). A view converts to a camera for whatever size the canvas
   has, so the canvas can change size mid-move without the rocket moving. */
const DEFAULT_DIR=new THREE.Vector3(1,.22,2.8).normalize(),ORIGIN=new THREE.Vector3(),UNIT_X=new THREE.Vector3(1,0,0),UNIT_Y=new THREE.Vector3(0,1,0),UNIT_Z=new THREE.Vector3(0,0,1);
const DEFAULT_ROOT=new THREE.Quaternion().setFromEuler(new THREE.Euler(0,0,-.42));
const easeInOutCubic=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
function notifyHost(type){if(window.parent!==window)window.parent.postMessage({type},location.origin);}
function cameraBasis(dir){return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(dir,ORIGIN,UNIT_Y));}
function renderNow(){
  if(!data)return;
  const near=Math.max(.00005,Math.min(.02,camera.position.distanceTo(controls.target)*.01));
  if(camera.near!==near){camera.near=near;camera.updateProjectionMatrix();}
  root.updateMatrixWorld(true);renderer.render(scene,camera);
}
// The hero rocket's pose (assets/rocket/rig.js VIEW; the home page tilts its canvas by theta) as a view.
function heroView({theta,roll,k,cx,cy}){
  const basis=cameraBasis(DEFAULT_DIR),tilt=new THREE.Quaternion().setFromAxisAngle(UNIT_Z,-theta);
  const pose=new THREE.Quaternion().setFromAxisAngle(UNIT_X,HERO_VIEW.pitch).multiply(new THREE.Quaternion().setFromAxisAngle(UNIT_Y,-HERO_VIEW.front+roll*Math.PI/180));
  const rootQ=basis.clone().multiply(tilt).multiply(pose);
  return {rootQ,rigQ:basis.multiply(tilt),dir:DEFAULT_DIR.clone(),target:new THREE.Vector3(0,HERO_VIEW.cy,0).applyQuaternion(rootQ),dist:HERO_VIEW.dist,k,cx,cy,mix:1};
}
function viewNow(){
  const r=stage.getBoundingClientRect(),h=Math.max(1,r.height),off=camera.view?.enabled?camera.view:null,dist=camera.position.distanceTo(controls.target);
  return {rootQ:root.quaternion.clone(),rigQ:heroRig.quaternion.clone(),dir:camera.position.clone().sub(controls.target).normalize(),target:controls.target.clone(),dist,
    k:h/(2*dist*Math.tan(camera.fov*Math.PI/360)),cx:r.left+r.width/2-(off?off.offsetX:0),cy:r.top+h/2-(off?off.offsetY:0),mix:rigMix};
}
// The explorer's own opening view, for the scene column (also while the canvas covers the whole page).
function defaultView(){
  const r=stage.parentElement.getBoundingClientRect(),w=Math.max(1,r.width),h=Math.max(1,r.height),f=framing(null,w/h),dist=f.position.distanceTo(f.target);
  return {rootQ:DEFAULT_ROOT.clone(),rigQ:heroRig.quaternion.clone(),dir:f.position.clone().sub(f.target).normalize(),target:f.target,dist,k:h/(2*dist*Math.tan(FOV*Math.PI/360)),cx:r.left+w/2,cy:r.top+h/2,mix:0};
}
function applyView(v){
  root.quaternion.copy(v.rootQ);heroRig.quaternion.copy(v.rigQ);setRigMix(v.mix);
  controls.target.copy(v.target);camera.position.copy(v.dir).multiplyScalar(v.dist).add(v.target);camera.lookAt(v.target);
  const r=stage.getBoundingClientRect(),w=Math.max(1,r.width),h=Math.max(1,r.height),ox=v.cx-(r.left+w/2),oy=v.cy-(r.top+h/2);
  camera.fov=2*Math.atan(h/(2*v.k*v.dist))*180/Math.PI;
  if(Math.abs(ox)>.01||Math.abs(oy)>.01)camera.setViewOffset(w,h,-ox,-oy,w,h);else camera.clearViewOffset();
  camera.updateProjectionMatrix();
}
function lerpView(a,b,t){
  const L=THREE.MathUtils.lerp;
  return {rootQ:a.rootQ.clone().slerp(b.rootQ,t),rigQ:a.rigQ.clone().slerp(b.rigQ,t),dir:a.dir.clone().lerp(b.dir,t).normalize(),target:a.target.clone().lerp(b.target,t),
    dist:Math.exp(L(Math.log(a.dist),Math.log(b.dist),t)),k:Math.exp(L(Math.log(a.k),Math.log(b.k),t)),cx:L(a.cx,b.cx,t),cy:L(a.cy,b.cy,t),mix:L(a.mix,b.mix,t)};
}
function stepHand(now){
  if(hand.start===null)hand.start=now;
  const t=hand.duration?Math.min(1,(now-hand.start)/hand.duration):1,e=easeInOutCubic(t);
  heldView=lerpView(hand.from,hand.to(),e);hand.step?.(e,t);applyView(heldView);
  if(t===1){const done=hand.done;hand=null;done();}else invalidate();
}
function runHand(spec){
  if(hand)hand.done();
  return new Promise(resolve=>{const done=spec.done;hand={start:null,...spec,done:()=>{done?.();resolve();}};cancelAnimationFrame(frame);frame=0;invalidate();});
}
function setInline(on){
  inline=on;document.documentElement.classList.toggle('inline',on);
  controls.enableZoom=controls.enablePan=!on;if(on)controls.maxDistance=50;
  renderer.domElement.style.touchAction=on?'pan-y':'none';stage.tabIndex=on?-1:0;
  if(on){hostActive=true;motion=null;}
}
// Put the explorer back to its opening state (the home page shows the plain rocket), fading what is faded.
function plainState(){
  $('partsDialog').close();$('optionsDialog').close();motion=null;
  const fromOpacity=groups.map(g=>g.userData.opacity),explodeFrom=Number($('explode').value);
  selected=null;mode='solid';inside=false;$('shell').checked=true;$('cutaway').checked=false;
  for(const b of document.querySelectorAll('[data-mode]'))b.setAttribute('aria-pressed',String(b.dataset.mode==='solid'));
  explorer.classList.remove('focused');$('overview').hidden=false;$('partStory').hidden=true;$('reset').hidden=true;$('sceneMode').textContent='Assembly';
  syncInside();syncDock();renderList();
  const toOpacity=groups.map(g=>opacityFor(g.userData.part,null,options()));
  return e=>{groups.forEach((g,i)=>{g.userData.opacity=THREE.MathUtils.lerp(fromOpacity[i],toOpacity[i],e);});$('explode').value=explodeFrom*(1-e);updatePositions();applyAppearance();};
}
function settleDefault(){
  document.documentElement.classList.remove('ui-hidden','stage-full');
  heldView=null;camera.clearViewOffset();camera.fov=FOV;root.rotation.set(0,0,-.42);setRigMix(0);
  const f=defaultView();controls.target.copy(f.target);camera.position.copy(f.dir).multiplyScalar(f.dist).add(f.target);
  controls.maxDistance=6;controls.update();resize();renderNow();
}
window.chargerExplorer={
  ready,
  get interacted(){return interacted;},
  setInline,
  // Inline: show the hero rocket's pose right now (pose in this page's px).
  seat(pose){if(!data)return;if(hand)hand.done();setInline(true);heldView=heroView(pose);resize();},
  // Grow into the dialog: from the inline view (moved by shift, the page px the frame moved) or a hero
  // pose, to the explorer's opening view.
  expand(pose,{duration=700,keepView=false,shift=[0,0]}={}){
    if(!data)return Promise.resolve();
    const from=keepView&&heldView&&inline?{...heldView,cx:heldView.cx+shift[0],cy:heldView.cy+shift[1]}:pose?heroView(pose):viewNow();
    setInline(false);document.documentElement.classList.add('stage-full','ui-hidden');
    heldView=from;resize();
    let shown=false;
    return runHand({from,to:defaultView,duration,step:(e,t)=>{if(!shown&&t>.5){shown=true;document.documentElement.classList.remove('ui-hidden');}},done:settleDefault});
  },
  // Open on the explorer's own view with no move (not loaded in time, or reduced motion).
  openPlain(){if(!data)return;if(hand)hand.done();setInline(false);const fade=plainState();fade(1);settleDefault();},
  // Shrink back to a hero pose; pose() is read every frame so the target can move.
  collapse(pose,{duration=600}={}){
    if(!data)return Promise.resolve();
    const from=viewNow(),fade=plainState();
    document.documentElement.classList.add('stage-full','ui-hidden');controls.maxDistance=50;
    heldView=from;resize();
    return runHand({from,to:()=>heroView(pose()),duration,step:fade});
  }
};
if(inline)setInline(true);

try{
  const [metaResponse,binResponse]=await (window.__chargerGeometry||Promise.all([fetch('assembly.json',{cache:'no-cache'}),fetch('assembly.bin',{cache:'no-cache'})]));
  if(!metaResponse.ok)throw Error('Metadata unavailable');if(!binResponse.ok)throw Error('Geometry unavailable');
  const [meta,buffer]=await Promise.all([metaResponse.json(),binResponse.arrayBuffer()]);
  data=meta;if(buffer.byteLength!==data.bytes)throw Error('Geometry is updating. Reload the page.');
  await document.fonts.load('700 32px "Archivo"').catch(()=>{});
  const paintPart=createLivery();
  for(const p of data.parts){
    const g=new THREE.Group();g.userData={part:p,opacity:opacityFor(p,null,options()),bounds:new THREE.Box3()};
    const wireGeometry=new THREE.BufferGeometry();wireGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(buffer,p.wire.offset,p.wire.count),3));wireGeometry.computeBoundingBox();
    const wire=new THREE.LineSegments(wireGeometry,new THREE.LineBasicMaterial({transparent:true,depthWrite:false}));wire.userData.part=p;g.add(wire);g.userData.bounds.copy(wireGeometry.boundingBox);
    if(p.mesh){const m=p.mesh,geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(buffer,m.vertexOffset,m.vertexCount),3));geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(buffer,m.indexOffset,m.indexCount),1));geometry.computeVertexNormals();if(p.id===0)smoothNoseNormals(geometry);geometry.computeBoundingBox();g.userData.bounds.union(geometry.boundingBox);const paint=paintPart(p,geometry),{geometry:paintedGeometry,...finish}=paint||{};const mesh=new THREE.Mesh(paintedGeometry||geometry,new THREE.MeshStandardMaterial({metalness:.22,roughness:.4,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1,...finish}));mesh.userData.part=p;if(paint)mesh.userData.liveryColor=paint.color;g.add(mesh);}
    root.add(g);groups.push(g);
  }
  for(const id of [0,14,18]){const label=storyFor(data.parts.find(p=>p.id===id)).label,button=document.createElement('button');button.className='hotspot';button.textContent=label;button.setAttribute('aria-label',`Explore ${label}`);button.onclick=()=>select(id,{keyboard:true});$('hotspots').append(button);hotspots.push({id,button});}
  $('count').textContent=data.parts.filter(p=>!p.referenceOnly).length;$('loading').remove();renderList();syncDock();applyAppearance();resize();
  const initial=new URLSearchParams(location.search).get('part');if(initial!==null&&data.parts.some(p=>p.id===Number(initial)))select(Number(initial));
  if(renderer.extensions.has('KHR_parallel_shader_compile'))await renderer.compileAsync(scene,camera);else renderer.compile(scene,camera);
  readyResolve();
}catch(error){const loading=$('loading');if(loading)loading.textContent='The model could not load. Refresh the page to try again.';console.error(error);}
