// CHARGER hero object: the real flight-model exterior, rendered live.
// Loaded only after the page is idle. The poster <img> stays underneath, so
// a missing or slow WebGL simply leaves the identical still in place.
// The rocket is one actor in the shared showreel scene (showreel/engine.js
// owns the renderer, camera and lights; showreel/index.js the sequence).
import * as THREE from './three.module.min.js';
import { createEngine } from './showreel/engine.js';
import { createFlame, createSmoke, thrustAt, G77R } from './showreel/flame.js';

const BODY_TOP = .370693, BODY_BOTTOM = -.570693, FRONT_ANGLE = Math.atan2(1, 2.8);

// Framing per layout. The poster files are rendered with these same numbers.
export const LAYOUTS = {
  land: { aspect: 16 / 9, roll: .34, tiltZ: 1.16, tiltX: .16, dist: 2.2, fov: 24, shiftX: 0, shiftY: .0 },
  port: { aspect: 3 / 4, roll: .34, tiltZ: .6, tiltX: .16, dist: 3.0, fov: 24, shiftX: 0, shiftY: 0 }
};

function bodyUV(x, y, z) {
  let u = .5 + (Math.atan2(x, z) - FRONT_ANGLE) / (2 * Math.PI);
  u = ((u % 1) + 1) % 1;
  return [u, (y - BODY_BOTTOM) / (BODY_TOP - BODY_BOTTOM)];
}
function wrap(geometry) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  const pos = g.getAttribute('position'), uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i += 3) {
    const tri = [0, 1, 2].map(j => bodyUV(pos.getX(i + j), pos.getY(i + j), pos.getZ(i + j)));
    if (Math.max(...tri.map(p => p[0])) - Math.min(...tri.map(p => p[0])) > .5) for (const p of tri) if (p[0] < .5) p[0] += 1;
    tri.forEach((p, j) => uv.set(p, (i + j) * 2));
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}
// Same livery as the explorer: orange body, red bands, vertical CHARGER / UCRC / 2026.
function livery() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 2048;
  const ctx = c.getContext('2d');
  const py = y => (BODY_TOP - y) / (BODY_TOP - BODY_BOTTOM) * c.height;
  ctx.fillStyle = '#d63b08'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#890919';
  for (const [t, b] of [[BODY_TOP, .352], [-.067, -.085]]) ctx.fillRect(0, py(t), c.width, py(b) - py(t));
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const letters = (text, y0, step, h) => {
    ctx.font = `800 ${h / (BODY_TOP - BODY_BOTTOM) * c.height}px Archivo, sans-serif`;
    [...text].forEach((l, i) => ctx.fillText(l, c.width / 2, py(y0 - i * step), 80));
  };
  letters('CHARGER', .318, .056, .040); letters('UCRC', -.121, .044, .037); letters('2026', -.355, .043, .036);
  const bolt = [[9, -.281], [-15, -.315], [-3, -.315], [-10, -.341], [16, -.305], [3, -.305]];
  ctx.beginPath();
  bolt.forEach(([x, y], i) => { const px = c.width / 2 + x * c.width / (2 * Math.PI * 34); i ? ctx.lineTo(px, py(y)) : ctx.moveTo(px, py(y)); });
  ctx.closePath(); ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = THREE.RepeatWrapping; tex.anisotropy = 8;
  return tex;
}

// Resolved from this module, not the page, so the live root pages (which load next/js/) find the model too.
const MODEL_BASE = new URL('../assets/3d/', import.meta.url).href;

async function loadModel(base) {
  const [meta, buf] = await Promise.all([
    fetch(base + 'charger-hero.json').then(r => r.json()),
    fetch(base + 'charger-hero.bin').then(r => r.arrayBuffer())
  ]);
  const q = new Int16Array(buf, 0, meta.indexByteOffset / 2), s = meta.scale / 32767, [cx, cy, cz] = meta.center;
  const tex = livery(), group = new THREE.Group();
  for (const p of meta.parts) {
    const src = q.subarray(p.vOff, p.vOff + p.vCount), pos = new Float32Array(p.vCount);
    for (let i = 0; i < p.vCount; i += 3) { pos[i] = src[i] * s + cx; pos[i + 1] = src[i + 1] * s + cy; pos[i + 2] = src[i + 2] * s + cz; }
    let g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(new THREE.BufferAttribute(new Uint16Array(buf, meta.indexByteOffset + p.iOff * 2, p.iCount), 1));
    let mat;
    if (p.id === 1 || p.id === 2) { g = wrap(g); mat = { color: 0xffffff, map: tex, roughness: .5, metalness: 0 }; }
    else {
      g.computeVertexNormals();
      if (p.id === 0 || (p.id >= 6 && p.id <= 9)) mat = { color: 0xf1f1ee, roughness: .45, metalness: 0 };
      else if (p.id === 19) mat = { color: 0x890919, roughness: .38, metalness: .1 };
      else if (p.id === 10 || p.id === 11) mat = { color: 0x1d1e21, roughness: .5, metalness: .1 };
      else mat = { color: 0x8c9096, roughness: .35, metalness: .5 };
    }
    group.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, ...mat })));
  }
  // centre on the body so roll spins about the airframe axis
  group.position.y = -(BODY_TOP + BODY_BOTTOM) / 2 + .02;
  return group;
}

// The rocket actor: framing, sway, pointer parallax and the scroll roll/lift,
// plus `fly` (offset along the airframe axis, + is nose first) and `spin`
// (extra roll) for the showreel to fly it out and back.
export async function createRocket({ layout = 'land', base = MODEL_BASE } = {}) {
  await document.fonts.load('800 40px Archivo').catch(() => {});
  const L = { ...LAYOUTS[layout] };
  const outer = new THREE.Group(), tilt = new THREE.Group(), roll = new THREE.Group();
  outer.add(tilt); tilt.add(roll);
  roll.add(await loadModel(base));
  tilt.rotation.z = L.tiltZ; tilt.rotation.x = L.tiltX;
  const state = { scroll: 0, px: 0, py: 0, sx: 0, sy: 0, fly: 0, spin: 0 };
  const axis = { x: 0, y: 1 };
  function pose(time) {
    state.sx += (state.px - state.sx) * .06; state.sy += (state.py - state.sy) * .06;
    const sway = Math.sin(time * .00032) * .32;
    roll.rotation.y = -FRONT_ANGLE + L.roll + sway + state.scroll * 1.6 + state.spin;
    outer.rotation.y = state.sx * .16; outer.rotation.x = -state.sy * .1;
    // lift along the airframe axis as the page scrolls
    const a = L.tiltZ + Math.PI / 2, lift = state.scroll * .55 + state.fly;
    axis.x = Math.cos(a); axis.y = Math.sin(a);
    outer.position.set(axis.x * lift + L.shiftX, axis.y * lift + L.shiftY + Math.sin(time * .0007) * .012, 0);
  }
  function setLayout(name) { Object.assign(L, LAYOUTS[name]); tilt.rotation.z = L.tiltZ; tilt.rotation.x = L.tiltX; }
  function settle(time = 0) { state.sx = state.px; state.sy = state.py; pose(time); }
  pose(0);
  return { group: outer, roll, state, layout: L, axis, pose, setLayout, settle };
}

// ------------------------------------------------------------------ intro
// The hero's arrival: the rocket starts off screen, already sized and placed for its REST pose, and flies in
// along its own axis from below and behind on a lit motor, easing into the sway. The motor's thrust follows
// the G77R curve, time-scaled to the flight (1.277 s burn over FLY s), so it burns out as the rocket settles;
// then a brief ember at the nozzle and a thin wisp. Optional smoke trail (`smoke`: { host, box, camera }).
// Driven by the hero loop: start(exitDist) once, then step(dt, time, exitDist) every frame until !active.
export const INTRO = { fly: 1.25, spin: -.9, ember: .55 };
const NOZZLE_Y = -.6102 + (.02 - (BODY_TOP + BODY_BOTTOM) / 2);   // motor retainer's aft face, in roll space
const easeIn = u => 1 - (1 - u) ** 4;                               // arrive fast, settle slowly (outQuart)

export function createIntro(rocket, { scene, smoke = null } = {}) {
  const flame = createFlame();
  flame.group.position.y = NOZZLE_Y;
  rocket.roll.add(flame.group);
  if (scene) scene.add(flame.world);
  const trail = smoke ? createSmoke(smoke) : null;
  const D = INTRO.fly, burnScale = G77R.burn / D;
  const nozzle = new THREE.Vector3(), exhaust = new THREE.Vector3(), lastEmit = new THREE.Vector3(), q = new THREE.Quaternion();
  let t = 0, flying = false, wisped = false, done = false, emitT = 0, hasLast = false;
  const where = () => {
    flame.group.getWorldPosition(nozzle);
    rocket.roll.getWorldQuaternion(q);
    exhaust.set(0, -1, 0).applyQuaternion(q);
  };
  function start(exitDist) {
    t = 0; flying = true; done = false;
    rocket.state.fly = -exitDist; rocket.state.spin = INTRO.spin;
    flame.set({ thrust: 0, time: 0 });
  }
  function finish() {
    if (flying) { rocket.state.fly = 0; rocket.state.spin = 0; }
    flying = false; t = D + INTRO.ember + 9;
    flame.set({ thrust: 0, ember: 0 });
    if (trail) { trail.dispose(); }
    flame.world.visible = false;
    done = true;
  }
  function step(dt, time, exitDist) {
    if (done) return false;
    t += dt;
    const u = Math.min(1, t / D);
    if (flying) {
      const e = easeIn(u);
      rocket.state.fly = -exitDist * (1 - e);
      rocket.state.spin = INTRO.spin * (1 - e) * (1 - e);
      if (u >= 1) { flying = false; rocket.state.fly = 0; rocket.state.spin = 0; }
    }
    const thrust = thrustAt(t * burnScale) / 80;
    const ember = t < D ? 0 : Math.max(0, 1 - (t - D) / INTRO.ember) ** 2;
    flame.set({ thrust, ember, time });
    where();
    if (!wisped && t >= D) { wisped = true; flame.puff(nozzle, exhaust, .022); }
    if (trail && thrust > .05) {
      // a puff every 50 ms, or every few px the nozzle travels, whichever comes first
      emitT += dt;
      const moved = hasLast ? nozzle.distanceTo(lastEmit) : 1;
      if (emitT > .05 || moved > .045) {
        emitT = 0; lastEmit.copy(nozzle); hasLast = true;
        trail.emit(nozzle, Math.min(1, thrust), { x: exhaust.x, y: -exhaust.y }, 1);
      }
    }
    const wisping = flame.update(dt);
    const smoking = trail ? trail.update(dt) : false;
    if (!flying && t > D + INTRO.ember && !wisping && !smoking) finish();
    return !done;
  }
  return {
    start, step, finish, flame,
    get active() { return !done; },
    get flying() { return flying; },
    get busy() { return !done && t < D + INTRO.ember; },   // the reel waits while the rocket arrives
    prewarm(renderer, camera, scene) { flame.group.visible = true; flame.prewarm(renderer, camera, scene); flame.group.visible = false; },
    dispose() { finish(); flame.dispose(); },
  };
}

export function applyCamera(camera, L) { camera.fov = L.fov; camera.position.set(0, 0, L.dist); camera.updateProjectionMatrix(); }

// Standalone still/loop of the rocket alone (poster renders, other studies).
export async function createHero({ canvas, layout = 'land', base = MODEL_BASE, preserve = false, pixelRatio }) {
  const engine = createEngine({ canvas, preserve, pixelRatio });
  const rocket = await createRocket({ layout, base });
  engine.scene.add(rocket.group);
  applyCamera(engine.camera, rocket.layout);
  const { renderer, scene, camera } = engine;
  function setLayout(name) { rocket.setLayout(name); applyCamera(camera, rocket.layout); }
  function render(time = 0) { rocket.pose(time); renderer.render(scene, camera); }
  return { renderer, size: engine.size, render, state: rocket.state, setLayout, still(time = 0) { rocket.settle(time); renderer.render(scene, camera); } };
}

// Page integration lives in showreel/index.js; kept as an alias.
export function mountHero(box, opts = {}) { return import('./showreel/index.js').then(m => m.mountShowreel({ box, ...opts })); }
