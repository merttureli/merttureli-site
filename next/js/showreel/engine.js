// SHOWREEL engine: one renderer, one scene, one camera over the hero.
//
// Everything that appears in the hero (the CHARGER rocket, the Therma-Shift
// coaster and whatever joins later) is an actor in this one scene and is lit
// by the same studio rig, so a module never adds lights or environments of its
// own. The rig is the rocket's original one (soft hemisphere, warm key, cool
// fill, white rim) plus a small procedural environment that only module
// materials receive (see adopt()), so brushed aluminium reads as metal while
// the rocket keeps exactly the look it had.
//
// Specialist lab pages can import addStudioLights / createStudioEnvironment
// from here to preview a module under the real lighting.
import * as THREE from '../three.module.min.js';

export { THREE };

// ------------------------------------------------------------------ easing
export const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const win = (t, a, b) => clamp01((t - a) / (b - a));
export const ease = {
  linear: t => t,
  inQuad: t => t * t,
  outQuad: t => 1 - (1 - t) * (1 - t),
  inCubic: t => t * t * t,
  outCubic: t => 1 - (1 - t) ** 3,
  inOutCubic: t => (t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  outQuart: t => 1 - (1 - t) ** 4,
  outQuint: t => 1 - (1 - t) ** 5,
  inOutSine: t => -(Math.cos(Math.PI * t) - 1) / 2,
  inOutQuint: t => (t < .5 ? 16 * t ** 5 : 1 - (-2 * t + 2) ** 5 / 2),
  // smooth start, long soft landing: for things that are set down
  land: t => 1 - (1 - t) ** 3.4,
};

// ---------------------------------------------------------------- lighting
// Same values the CHARGER hero has always used: matte, soft key, subtle rim.
export function addStudioLights(scene) {
  const hemi = new THREE.HemisphereLight(0xffffff, 0x7d828c, 1.35);
  const key = new THREE.DirectionalLight(0xfff8f0, 3.8); key.position.set(-2.5, 4, 5);
  const fill = new THREE.DirectionalLight(0xdfe6ff, 1.1); fill.position.set(4, -1, 3);
  const rim = new THREE.DirectionalLight(0xffffff, 2.4); rim.position.set(3, 3, -4);
  scene.add(hemi, key, fill, rim);
  return { hemi, key, fill, rim };
}

// A tiny studio environment rendered once into a PMREM: a warm-grey sweep
// (the page's own ground) with one broad softbox above-left and a thin strip
// behind-right, matching the key and rim. Costs one PMREM pass at start.
export function createStudioEnvironment(renderer) {
  const env = new THREE.Scene();
  const geo = new THREE.SphereGeometry(10, 32, 16);
  const col = new Float32Array(geo.attributes.position.count * 3);
  const top = new THREE.Color(0xf4f2ee), mid = new THREE.Color(0xd9dadd), low = new THREE.Color(0x6f737a), c = new THREE.Color();
  for (let i = 0; i < geo.attributes.position.count; i++) {
    const y = geo.attributes.position.getY(i) / 10;
    if (y > 0) c.copy(mid).lerp(top, Math.pow(y, .7)); else c.copy(mid).lerp(low, Math.pow(-y, .6));
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  env.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const panel = (w, h, x, y, z, k) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(k, k * .98, k * .95), side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.lookAt(0, 0, 0); env.add(m); return m;
  };
  panel(6, 4, -4, 6, 5, 3.2);   // key softbox
  panel(1.4, 7, 6, 3, -5, 2.2); // rim strip
  panel(5, 2, 5, -1, 4, .9);    // faint fill card
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(env, .035);
  pmrem.dispose();
  env.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  return rt.texture;
}

// ------------------------------------------------------------------ engine
export function createEngine({ canvas, pixelRatio, preserve = false, envGain = .55 }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: preserve, powerPreference: 'low-power' });
  renderer.setPixelRatio(pixelRatio || Math.min(devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  // shader status checks force the driver to finish compiling synchronously (a stall when a guest is built
  // mid-reel); keep them for debugging only (?debug or #debug)
  renderer.debug.checkShaderErrors = /[?&#]debug\b/.test(location.href);
  const scene = new THREE.Scene();
  const lights = addStudioLights(scene);
  const camera = new THREE.PerspectiveCamera(24, 16 / 9, .05, 30);
  camera.position.set(0, 0, 2.2);
  let envMap = null;

  // Give module materials the shared environment (once per material). The
  // rocket is never adopted, so its look is untouched.
  function adopt(root) {
    if (!envMap) envMap = createStudioEnvironment(renderer);
    // A material drawn by both an InstancedMesh and a plain Mesh makes three.js
    // switch programs (and rebuild their parameters) on every frame; give the
    // instanced user its own copy.
    const plain = new Set();
    root.traverse(o => { if (o.isMesh && !o.isInstancedMesh) for (const m of [].concat(o.material)) plain.add(m); });
    root.traverse(o => { if (o.isInstancedMesh && !Array.isArray(o.material) && plain.has(o.material)) o.material = o.material.clone(); });
    root.traverse(o => {
      const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of mats) {
        if (!m.isMeshStandardMaterial || m.userData.reelAdopted) continue;
        m.userData.reelAdopted = true;
        if (!m.envMap) { m.envMap = envMap; m.envMapIntensity *= envGain; m.needsUpdate = true; }
      }
    });
  }
  // World-space half extents of the view at depth z (camera looks down -Z).
  const view = { halfW: 1, halfH: 1 };
  function viewAt(z = 0) {
    const d = camera.position.z - z;
    view.halfH = d * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    view.halfW = view.halfH * camera.aspect;
    return view;
  }
  function size(w, h) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  function render() { renderer.render(scene, camera); }
  function dispose() { if (envMap) envMap.dispose(); renderer.dispose(); }
  return { THREE, renderer, scene, camera, lights, adopt, viewAt, size, render, dispose, get envMap() { return envMap; } };
}

// --------------------------------------------------------------- sequencer
// A timeline of named states with fixed durations. The scene is a pure
// function of the timeline position, which makes it seekable (debug, frame
// capture) and lets the reel run at any speed.
export function createTimeline(steps) {
  const states = {}, list = [];
  let t = 0;
  for (const [name, dur] of steps) { const s = { name, t0: t, t1: t + dur, dur }; states[name] = s; list.push(s); t += dur; }
  return {
    states, list, total: t,
    at(time) { for (let i = 0; i < list.length; i++) if (time < list[i].t1) return list[i]; return list[list.length - 1]; },
  };
}

// ------------------------------------------------------------- framing
// Find where to put an actor's origin (px, in the canvas box) so its screen
// extents `ext` ({l, r, u, d} px around the origin) sit inside `free`
// ({l, t, r, b}) without touching any `avoid` rect, as close to `prefer` as
// possible; `test(x, y)`, if given, can veto a spot. Runs on resize only.
export function placeInFrame({ ext, free, avoid = [], prefer, step = 8, test = null, wy = 1.4 }) {
  let best = null, bd = Infinity;
  for (let y = free.t + ext.u; y <= free.b - ext.d; y += step) {
    for (let x = free.l + ext.l; x <= free.r - ext.r; x += step) {
      const L = x - ext.l, R = x + ext.r, T = y - ext.u, B = y + ext.d;
      let hit = false;
      for (const a of avoid) if (L < a.r && R > a.l && T < a.b && B > a.t) { hit = true; break; }
      if (hit || (test && !test(x, y))) continue;
      const d = (x - prefer.x) ** 2 + (y - prefer.y) ** 2 * wy;
      if (d < bd) { bd = d; best = { x, y, d }; }
    }
  }
  return best;
}

// Screen extents (px around the projected origin of `origin`) of the given
// objects' bounding boxes, for a canvas box of w x h.
export function screenExtents(objects, origin, camera, w, h) {
  const box = new THREE.Box3(), b = new THREE.Box3(), v = new THREE.Vector3(), o = new THREE.Vector3();
  camera.updateMatrixWorld();
  origin.updateWorldMatrix(true, true);
  // opaque meshes only: decals, steam and other transparent layers don't count
  for (const obj of objects) {
    obj.updateWorldMatrix(true, true);
    obj.traverse(m => {
      if (!m.isMesh || !m.geometry || (m.material && m.material.transparent)) return;
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      box.union(b.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld));
    });
  }
  origin.getWorldPosition(o).project(camera);
  const ox = (o.x + 1) / 2 * w, oy = (1 - o.y) / 2 * h;
  const ext = { l: 0, r: 0, u: 0, d: 0 };
  for (let i = 0; i < 8; i++) {
    v.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(camera);
    const x = (v.x + 1) / 2 * w - ox, y = (1 - v.y) / 2 * h - oy;
    ext.l = Math.max(ext.l, -x); ext.r = Math.max(ext.r, x); ext.u = Math.max(ext.u, -y); ext.d = Math.max(ext.d, y);
  }
  return ext;
}
