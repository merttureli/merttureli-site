// Vireo rig: one WebGL renderer and one CHARGER for the whole page.
//
// The rocket is the site's own: next/js/viewer/products/charger.js builds it (the hero's eleven exterior meshes
// plus the interior CAD parts, 26 drawn pieces, with a slide along the body axis per part) and charger-finish.js
// dresses them with the studio look (showreel/look.js). Nothing of that is copied here: this file only owns the
// renderer, the camera, the pose and which parts are shown, ghosted or slid apart.
//
// Framing: every pose is designed inside a reference frame (16:10 on a wide screen, 0.62 on a tall one) that is
// contained in the canvas, the way `object-fit: contain` places an image. The page is black around it, so the
// poster stills (rendered with this same file) and the live canvas line up at any window size.
import * as THREE from '../../../next/js/three.module.min.js';
import { addStudioLights } from '../../../next/js/showreel/engine.js';
import { getLook } from '../../../next/js/showreel/look.js';
import charger from '../../../next/js/viewer/products/charger.js';

export { THREE };
export const FOV = 24;
export const FRAME = { land: 16 / 10, port: 0.62, closerLand: 980 / 685, closerPort: 39 / 42 };
const MODEL_Y = 0.12;                    // hero3d.js puts the body's middle on the roll axis: CAD y + 0.12
export const STATION = { tail: -0.61, nose: 0.5707, mid: -0.02 };   // CAD y along the airframe (m)

// The set: look.js draws a studio from a description like its own STUDIO. This one is a black room: one broad
// key softbox, a thin bright strip behind for the rim, a kicker on the other side and a faint low fill, so on the
// black page the far side of the tube falls away and the key reads as one long highlight.
export const STAGE_STUDIO = {
  walls: { top: [0.035, 0.035, 0.04], horizon: [0.02, 0.02, 0.023], floor: [0.03, 0.03, 0.032], under: [0.012, 0.012, 0.012] },
  panels: [
    { name: 'key', dir: [-0.62, 0.58, 0.52], half: [34, 26], radius: 0.12, radiance: 3.6, color: [1.0, 0.985, 0.96], fall: 0.4, grad: [0.2, 0.25] },
    { name: 'top', dir: [-0.2, 0.9, -0.38], half: [36, 10], radius: 0.1, radiance: 1.1, color: [1.0, 1.0, 1.0], fall: 0.3, grad: [-0.6, 0.5] },
    { name: 'rim', dir: [0.8, 0.2, -0.56], half: [5, 34], radius: 0.35, radiance: 9.0, color: [1.0, 1.0, 1.0], fall: 0.1, grad: [0, 0.1] },
    { name: 'kicker', dir: [-0.86, 0.1, -0.5], half: [4, 24], radius: 0.35, radiance: 3.2, color: [1.0, 0.99, 0.97], fall: 0.1, grad: [0, 0] },
    { name: 'fill', dir: [0.7, -0.3, 0.64], half: [26, 16], radius: 0.15, radiance: 0.22, color: [0.86, 0.91, 1.0], fall: 0.4, grad: [0, 0] },
  ],
  key: [-0.62, 0.58, 0.52],
};

// Two grades of the one studio: the dark stage (low key: the ambient is taken down so the far side falls to
// black and the softbox reads as one long highlight) and the gray studio of the "Look closer" view.
export const GRADES = {
  dark: { exposure: 1.05, light: [0.35, 0.4, 0.05], hemi: 1.35, key: 3.8, fill: 0.5, rim: 7, keyFront: 0.3, lift: 0.35 },
  light: { exposure: 0.95, light: [0.45, 0.25, 0.3], hemi: 1.35, key: 3.8, fill: 1.1, rim: 2.4, keyFront: 0.5, lift: 0.15 },
};

const nextTask = () => new Promise(r => { const c = new MessageChannel(); c.port1.onmessage = () => r(); c.port2.postMessage(0); });
const smoother = t => t * t * t * (t * (t * 6 - 15) + 10);
const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);

export function containRect(W, H, aspect, { ax = 0.5, ay = 0.5 } = {}) {
  let w = W, h = W / aspect;
  if (h > H) { h = H; w = H * aspect; }
  return { x: (W - w) * ax, y: (H - h) * ay, w, h };
}

export async function createRig({ canvas, quality = 'high', pixelRatio = Math.min(window.devicePixelRatio || 1, 2), preserve = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: preserve, powerPreference: 'high-performance' });
  renderer.setPixelRatio(pixelRatio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  renderer.debug.checkShaderErrors = /[?&#]debug\b/.test(location.href);
  const scene = new THREE.Scene();
  const lights = addStudioLights(scene);
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.01, 30);
  const pivot = new THREE.Group();
  scene.add(pivot);
  const pre = new Set();

  // A copy of a material that keeps the studio look's shader hook and uniforms (viewer.js does the same).
  function twin(m) {
    if (!m.userData || !m.userData.look) return m.clone();
    const ud = m.userData; m.userData = {};
    let c; try { c = m.clone(); } finally { m.userData = ud; }
    c.userData = { ...ud }; c.defines = { ...m.defines }; c.onBeforeCompile = m.onBeforeCompile; c.customProgramCacheKey = m.customProgramCacheKey;
    return c;
  }
  const ctx = {
    THREE, quality, twin, get renderer() { return renderer; },
    engine: { THREE, get renderer() { return renderer; }, get scene() { return scene; }, get camera() { return camera; }, addPrePass: f => (pre.add(f), () => pre.delete(f)) },
  };

  // ---- the model
  const built = await charger.build({ THREE, quality });
  const model = built.model;
  pivot.add(model);
  await nextTask();
  let dressed = null;
  const look0 = getLook({ renderer, quality });     // the look of this renderer: give it the black room before anything builds its environment
  look0.studio = STAGE_STUDIO;
  if (built.dress) {
    try { dressed = await built.dress(ctx); } catch (e) { console.warn('[vireo] finish unavailable, flat materials', e); }
  }
  const look = dressed ? dressed.look : null;
  const rk = dressed ? dressed.rocket : null;       // look.js dressRocket result: aim(), frame(), materials

  // ---- parts
  const parts = [], byId = new Map(), meshes = [];
  for (const p of built.parts) {
    const P = { id: p.id, label: p.label, kind: p.kind, group: p.group, exterior: p.exterior, obj: p.obj, meshes: [...p.meshes], base: p.obj.position.clone(), slide: p.explode[1], box: p.box, center: p.box.getCenter(new THREE.Vector3()), opacity: 1, goal: 1 };
    parts.push(P); byId.set(P.id, P);
  }
  // one material per mesh, so a part can ghost alone
  const used = new Set();
  for (const P of parts) for (const m of P.meshes) {
    if (used.has(m.material)) m.material = twin(m.material);
    used.add(m.material);
    meshes.push({ m, P });
  }
  // the order the sections leave in: the farthest slide first
  const maxSlide = Math.max(...parts.map(P => Math.abs(P.slide)));

  // ---- state
  const S = {
    frame: { x: 0, y: 0, w: 1, h: 1 }, W: 1, H: 1, aspect: FRAME.land,
    tilt: 0, lean: 0, roll: 0, turn: 0,       // rad: nose right of up on screen; nose toward the camera; about the body; orbit about screen-up
    station: STATION.mid, dist: 2.6, ox: 0, oy: 0, explode: 0, slideIds: null,   // slideIds: only these parts slide (stills)
    lift: 0.35, keyFront: 0.3,                  // the studio key: lift about the airframe (rad), how far in front it stays
  };
  const qT = new THREE.Quaternion(), qL = new THREE.Quaternion(), qR = new THREE.Quaternion(), qO = new THREE.Quaternion();
  const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1), V = new THREE.Vector3();

  function size(W, H, aspect) {
    S.W = W; S.H = H;
    if (aspect) S.aspect = aspect;
    renderer.setSize(Math.max(2, W), Math.max(2, H), false);
  }
  function setFrame(rect) { Object.assign(S.frame, rect); }
  function setGrade(name) {
    const g = GRADES[name];
    if (look) { look.uniforms.lookExposure.value = g.exposure; look.uniforms.lookLight.value.set(...g.light); }
    lights.hemi.intensity = g.hemi; lights.key.intensity = g.key; lights.fill.intensity = g.fill; lights.rim.intensity = g.rim;
    S.keyFront = g.keyFront; S.lift = g.lift;
  }
  // slide the sections apart: k = 0 assembled .. 1 apart. A part that travels farther leaves a little earlier.
  function placeParts(k) {
    for (const P of parts) {
      const lead = 0.22 * (1 - Math.abs(P.slide) / maxSlide);
      const t = S.slideIds && !S.slideIds.includes(P.id) ? 0 : smoother(clamp01((k - lead * 0.6) / (1 - lead)));
      P.obj.position.copy(P.base); P.obj.position.y += P.slide * t;
    }
  }
  function applyOpacity() {
    for (const { m, P } of meshes) {
      const o = P.opacity, t = o < 0.999, mat = m.material;
      if (mat.transparent !== t) { mat.transparent = t; mat.forceSinglePass = true; mat.needsUpdate = true; }
      mat.depthWrite = o > 0.5;                  // a part on its way to solid already hides what is behind it
      mat.opacity = o;
      m.visible = o > 0.004;
    }
  }
  function pose() {
    qT.setFromAxisAngle(Z, -S.tilt); qL.setFromAxisAngle(X, S.lean); qR.setFromAxisAngle(Y, S.roll); qO.setFromAxisAngle(Y, S.turn);
    pivot.quaternion.copy(qO).multiply(qT).multiply(qL).multiply(qR);
    placeParts(S.explode);
    // the focus (a station on the body axis) sits at (ox, oy) of the reference frame, in half widths and half heights
    const halfH = S.dist * Math.tan(THREE.MathUtils.degToRad(FOV / 2)), halfW = halfH * S.aspect;
    V.set(0, S.station + MODEL_Y, 0).applyQuaternion(pivot.quaternion);
    pivot.position.set(S.ox * halfW - V.x, S.oy * halfH - V.y, -V.z);
    pivot.updateMatrixWorld(true);
    aimKey();
    // camera: on +Z, the reference frame spans the lens and sits where the frame rect is in the canvas
    camera.position.set(0, 0, S.dist); camera.rotation.set(0, 0, 0); camera.updateMatrixWorld();
    const near = Math.max(0.01, S.dist * 0.05), far = S.dist + 6, F = S.frame;
    const t = near * Math.tan(THREE.MathUtils.degToRad(FOV / 2)), kk = t / (F.h / 2), cx = F.x + F.w / 2, cy = F.y + F.h / 2;
    camera.near = near; camera.far = far;
    camera.projectionMatrix.makePerspective(-cx * kk, (S.W - cx) * kk, cy * kk, (cy - S.H) * kk, near, far);
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  }
  function render() {
    pose();
    applyOpacity();
    for (const f of pre) f();
    if (look) look.frame();
    renderer.render(scene, camera);
  }
  // where a station on the body axis is on screen (CSS px in the canvas box)
  function project(station, out = { x: 0, y: 0 }) {
    V.set(0, station + MODEL_Y, 0).applyMatrix4(pivot.matrixWorld).project(camera);
    out.x = (V.x + 1) / 2 * S.W; out.y = (1 - V.y) / 2 * S.H;
    return out;
  }

  // The studio's key for this pose. look.js dressRocket aims it once, for the hero page's fixed tilt (its rocket
  // object stays private to charger.js); here the airframe turns on screen, so the same aim is redone per pose:
  // the studio turns about the vertical until the key softbox lies along the airframe (as far as it stays in
  // front), then about the airframe (`lift`), which carries the key up and back on either side: the light rakes
  // across the tube and the side away from it falls off. A turn by hand (S.turn) is left out on purpose: the
  // lights stay where they are while the model is turned under them.
  const lookMats = [];
  model.traverse(o => { for (const m of [].concat(o.material || [])) if (m.userData && m.userData.look && m.envMapRotation && !lookMats.includes(m)) lookMats.push(m); });
  const K = new THREE.Vector3(...(look ? look.studio.key : [-0.62, 0.58, 0.52])).normalize(), hor = Math.hypot(K.x, K.z);
  const q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion(), qA = new THREE.Quaternion(), m4 = new THREE.Matrix4(), eul = new THREE.Euler(), axis = new THREE.Vector3();
  const keyDir = rk ? rk.key : new THREE.Vector3();
  let aimed = '';
  function aimKey() {
    if (!rk) return;
    const sig = S.tilt.toFixed(4) + '|' + S.lean.toFixed(3) + '|' + S.lift.toFixed(4) + '|' + S.keyFront.toFixed(3);
    if (sig === aimed) return;
    aimed = sig;
    axis.set(0, 1, 0).applyQuaternion(qA.copy(qT).multiply(qL)); axis.z = 0;
    if (axis.lengthSq() < 1e-6) axis.set(0, 1, 0);
    axis.normalize();
    const lim = Math.sqrt(Math.max(0, hor * hor - S.keyFront * S.keyFront));
    const side = axis.x >= -1e-3 ? -1 : 1;            // nose to the right, or straight up: the key stands to the left
    const kx = Math.abs(axis.x) > 1e-3 ? Math.max(-lim, Math.min(lim, -K.y * axis.y / axis.x)) : side * lim;
    q1.setFromAxisAngle(Y, Math.atan2(kx, Math.sqrt(hor * hor - kx * kx)) - Math.atan2(K.x, K.z));
    q1.premultiply(q2.setFromAxisAngle(axis, side * S.lift));
    keyDir.copy(K).applyQuaternion(q1);
    lights.key.position.copy(keyDir).multiplyScalar(6);
    eul.setFromRotationMatrix(m4.makeRotationFromQuaternion(q2.copy(q1).invert()), 'XYZ');
    for (const m of lookMats) m.envMapRotation.set(-eul.x, -eul.y, -eul.z, 'XYZ');
  }

  // ---- programs: build what the first frame draws, then (on idle) the ghosted variants
  const compile = async (o = scene) => {
    if (renderer.extensions.has('KHR_parallel_shader_compile')) await renderer.compileAsync(o, camera, scene).catch(() => {});
    else renderer.compile(o, camera, scene);
  };
  size(2, 2);
  pose();
  await compile();
  let keep = null;
  async function warmGhosts() {
    if (keep) return;
    keep = new THREE.Group(); keep.visible = false;
    const seen = new Set();
    for (const { m } of meshes) {
      const key = (m.material.customProgramCacheKey ? m.material.customProgramCacheKey() : '') + m.material.type + (m.material.map ? 'm' : '');
      if (seen.has(key)) continue;
      seen.add(key);
      const k = twin(m.material);
      k.transparent = true; k.depthWrite = false; k.opacity = 0.5; k.forceSinglePass = true;
      const km = new THREE.Mesh(m.geometry, k);
      km.frustumCulled = false; keep.add(km);
    }
    scene.add(keep);
    keep.visible = true;
    await compile(keep);
    keep.visible = false;
  }

  function setGhost(focusIds, { exterior = 0.07, interior = 0.16 } = {}) {
    const on = focusIds && focusIds.length ? new Set(focusIds) : null;
    for (const P of parts) P.goal = !on || on.has(P.id) ? 1 : (P.exterior ? exterior : interior);
  }
  // ease each part's opacity toward its goal; true while something still moves
  function stepOpacity(k) {
    let moving = false;
    for (const P of parts) {
      if (Math.abs(P.opacity - P.goal) > 0.003) { P.opacity += (P.goal - P.opacity) * k; moving = true; } else P.opacity = P.goal;
    }
    return moving;
  }
  function snapOpacity() { for (const P of parts) P.opacity = P.goal; }

  return {
    THREE, renderer, scene, camera, pivot, model, parts, byId, lights, look, dressed, state: S,
    size, setFrame, setGrade, setGhost, stepOpacity, snapOpacity, render, project, warmGhosts,
    dispose() { if (dressed && dressed.dispose) dressed.dispose(); if (built.dispose) built.dispose(); renderer.dispose(); },
  };
}
