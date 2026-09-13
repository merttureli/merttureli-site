import * as THREE from 'three';
import {OrbitControls} from './vendor/OrbitControls.js';
import {storyFor} from './part-stories.js';
import {easeInOut,fitDistance,opacityFor} from './focus-motion.js';

const $=id=>document.getElementById(id),stage=$('stage'),explorer=$('explorer');
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const embedded=new URLSearchParams(location.search).get('embed')==='1';
const modal=new URLSearchParams(location.search).get('modal')==='1';
if(embedded)document.body.classList.add('embed');
if(modal)document.body.classList.add('modal');
if(embedded&&!modal&&window.parent!==window){
  let height=0;
  new ResizeObserver(()=>{const next=Math.ceil(explorer.getBoundingClientRect().height);if(next!==height){height=next;window.parent.postMessage({type:'charger:resize',height:next},location.origin);}}).observe(explorer);
}
let renderer,data,selected=null,mode='solid',inside=false,frame=0,motion=null,visible=true,hostActive=true;
window.addEventListener('message',event=>{
  if(!modal||event.origin!==location.origin||event.source!==window.parent||event.data?.type!=='charger:active')return;
  hostActive=event.data.active===true;
  if(hostActive)resize();else{cancelAnimationFrame(frame);frame=0;}
});
const groups=[],hotspots=[],raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
const root=new THREE.Group(),scene=new THREE.Scene();scene.add(root);root.rotation.z=-.42;
const camera=new THREE.PerspectiveCamera(36,1,.00005,20);
const clip=new THREE.Plane(new THREE.Vector3(0,0,-1),0);
try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'low-power'});}
catch(error){$('loading').textContent='3D graphics are unavailable in this browser.';throw error;}
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setClearColor(0x0a0a0a,0);
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.localClippingEnabled=true;stage.prepend(renderer.domElement);
const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=false;controls.minDistance=.006;controls.maxDistance=6;
controls.addEventListener('change',invalidate);
controls.addEventListener('start',()=>{if(motion)motion.interrupted=true;});
scene.add(new THREE.HemisphereLight(0xffffff,0x777777,2.6));
for(const [position,power] of [[[3,4,5],3.5],[[-3,0,-2],2]]){const light=new THREE.DirectionalLight(0xffffff,power);light.position.set(...position);scene.add(light);}

function options(){return {shell:$('shell').checked,inside,mode};}
function invalidate(){if(!frame&&visible&&hostActive&&!document.hidden)frame=requestAnimationFrame(draw);}
function draw(now){
  frame=0;
  if(motion){
    const t=motion.duration?Math.min(1,(now-motion.start)/motion.duration):1,k=easeInOut(t);
    if(!motion.interrupted){camera.position.lerpVectors(motion.fromCamera,motion.toCamera,k);controls.target.lerpVectors(motion.fromTarget,motion.toTarget,k);root.rotation.z=THREE.MathUtils.lerp(motion.fromRotation,motion.toRotation,k);}
    groups.forEach((g,i)=>{g.userData.opacity=THREE.MathUtils.lerp(motion.fromOpacity[i],motion.toOpacity[i],k);});
    applyAppearance();controls.update();
    if(t===1){const done=motion.done;motion=null;done?.();}
  }
  root.updateMatrixWorld(true);placeHotspots();renderer.render(scene,camera);
  if(motion)invalidate();
}
function resize(){
  const w=Math.max(1,stage.clientWidth),h=Math.max(1,stage.clientHeight);renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();
  if(data)transitionTo(selected,{duration:motion?.duration?motion.duration:0,refit:true});else invalidate();
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
      obj.material.color.setHex(wire?(active?0xffffff:0x999999):(active?0xf1f1ee:(p.exterior?0xc8c8c5:0x9c9c99)));
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
function framing(id){
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
  const distance=fitDistance(fitSize,camera.aspect,camera.fov,id===null?1.22:1.42);
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
  const r=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);raycaster.setFromCamera(pointer,camera);raycaster.params.Line.threshold=.001;
  const objects=groups.filter(g=>g.visible&&g.userData.opacity>.12).flatMap(g=>g.children.filter(o=>o.visible));
  const hits=raycaster.intersectObjects(objects).filter(hit=>{const p=hit.object.userData.part;return !($('cutaway').checked&&p.exterior&&clip.distanceToPoint(hit.point)<0);});
  if(hits.length)select(hits[0].object.userData.part.id);
});
renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();$('announce').textContent='3D graphics paused. Reload to restore the model.';});

try{
  const [meta,buffer]=await Promise.all([fetch('assembly.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('Metadata unavailable');return r.json();}),fetch('assembly.bin',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('Geometry unavailable');return r.arrayBuffer();})]);
  data=meta;if(buffer.byteLength!==data.bytes)throw Error('Geometry is updating. Reload the page.');
  for(const p of data.parts){
    const g=new THREE.Group();g.userData={part:p,opacity:opacityFor(p,null,options()),bounds:new THREE.Box3()};
    const wireGeometry=new THREE.BufferGeometry();wireGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(buffer,p.wire.offset,p.wire.count),3));wireGeometry.computeBoundingBox();
    const wire=new THREE.LineSegments(wireGeometry,new THREE.LineBasicMaterial({transparent:true,depthWrite:false}));wire.userData.part=p;g.add(wire);g.userData.bounds.copy(wireGeometry.boundingBox);
    if(p.mesh){const m=p.mesh,geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(buffer,m.vertexOffset,m.vertexCount),3));geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(buffer,m.indexOffset,m.indexCount),1));geometry.computeVertexNormals();geometry.computeBoundingBox();g.userData.bounds.union(geometry.boundingBox);const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({metalness:.22,roughness:.4,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1}));mesh.userData.part=p;g.add(mesh);}
    root.add(g);groups.push(g);
  }
  for(const id of [0,14,18]){const label=storyFor(data.parts.find(p=>p.id===id)).label,button=document.createElement('button');button.className='hotspot';button.textContent=label;button.setAttribute('aria-label',`Explore ${label}`);button.onclick=()=>select(id,{keyboard:true});$('hotspots').append(button);hotspots.push({id,button});}
  $('count').textContent=data.parts.filter(p=>!p.referenceOnly).length;$('loading').remove();renderList();syncDock();applyAppearance();resize();
  const initial=new URLSearchParams(location.search).get('part');if(initial!==null&&data.parts.some(p=>p.id===Number(initial)))select(Number(initial));
}catch(error){const loading=$('loading');if(loading)loading.textContent='The model could not load. Refresh the page to try again.';console.error(error);}
