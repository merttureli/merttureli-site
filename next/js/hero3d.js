// CHARGER hero object: the real flight-model exterior, rendered live.
// Loaded only after the page is idle. The poster <img> is the identical still
// (object-fit: cover); with motion on it waits while the live rocket flies in
// (createIntro), and studio.js shows it if WebGL is missing or slow.
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
// With `detail` it paints the companion map of the studio look instead (showreel/look.js dressRocket): red is the
// vinyl lettering, green the seam lines where the nose cone, the two tubes and the motor mount meet, blue the
// spiral winding seam of each cardboard tube (85 mm pitch assumed, soft edged).
const TUBE_JOINT = -.0786;
function livery(detail = false, scale = 1) {
  const c = document.createElement('canvas'); c.width = 512 * scale; c.height = 2048 * scale;
  const ctx = c.getContext('2d');
  const py = y => (BODY_TOP - y) / (BODY_TOP - BODY_BOTTOM) * c.height;
  if (detail) {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.globalCompositeOperation = 'lighter';           // each channel keeps its own drawing
    const pitch = .085 / (BODY_TOP - BODY_BOTTOM) * c.height;
    for (const [top, bottom, phase] of [[BODY_TOP, TUBE_JOINT, .3], [TUBE_JOINT, BODY_BOTTOM, .75]]) {
      ctx.save(); ctx.beginPath(); ctx.rect(0, py(top), c.width, py(bottom) - py(top)); ctx.clip();
      for (const [lw, col] of [[7 * scale, '#000030'], [4.6 * scale, '#000040'], [2.2 * scale, '#00008f']]) {
        ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath();
        for (let y = py(top) - (1 + phase) * pitch; y < py(bottom) + pitch; y += pitch) { ctx.moveTo(0, y); ctx.lineTo(c.width, y + pitch); }
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.fillStyle = '#0f0';
    const w = Math.max(1, .0007 / (BODY_TOP - BODY_BOTTOM) * c.height);   // a 0.7 mm line
    for (const y of [BODY_TOP, TUBE_JOINT, BODY_BOTTOM]) ctx.fillRect(0, py(y) - w, c.width, 2 * w);
    ctx.fillStyle = '#f00';
  } else {
    ctx.fillStyle = '#d63b08'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#890919';
    for (const [t, b] of [[BODY_TOP, .352], [-.067, -.085]]) ctx.fillRect(0, py(t), c.width, py(b) - py(t));
    ctx.fillStyle = '#fff';
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const letters = (text, y0, step, h) => {
    ctx.font = `800 ${h / (BODY_TOP - BODY_BOTTOM) * c.height}px Archivo, sans-serif`;
    [...text].forEach((l, i) => ctx.fillText(l, c.width / 2, py(y0 - i * step), 80 * scale));
  };
  letters('CHARGER', .318, .056, .040); letters('UCRC', -.121, .044, .037); letters('2026', -.355, .043, .036);
  const bolt = [[9, -.281], [-15, -.315], [-3, -.315], [-10, -.341], [16, -.305], [3, -.305]];
  ctx.beginPath();
  bolt.forEach(([x, y], i) => { const px = c.width / 2 + x * c.width / (2 * Math.PI * 34); i ? ctx.lineTo(px, py(y)) : ctx.moveTo(px, py(y)); });
  ctx.closePath(); ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  if (!detail) tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping; tex.anisotropy = 8;
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
    const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, ...mat }));
    mesh.name = p.label; mesh.userData.part = p.id;
    group.add(mesh);
  }
  // centre on the body so roll spins about the airframe axis
  group.position.y = -(BODY_TOP + BODY_BOTTOM) / 2 + .02;
  return group;
}

// The rocket actor: framing, sway, pointer parallax and the scroll roll/lift,
// plus `fly` (offset along the airframe axis, + is nose first) and `spin`
// (extra roll) for the showreel to fly it out and back.
// For the studio look (showreel/look.js dressRocket; the 404 page and the viewer stay plain): `model` holds the
// eleven meshes (userData.part = the CAD part id), `detailMap(scale)` paints the livery's vinyl and seam map, and
// `glow.value` is the motor's light on the aft end (0 = out; the intro sets it from the flame).
export async function createRocket({ layout = 'land', base = MODEL_BASE } = {}) {
  await document.fonts.load('800 40px Archivo').catch(() => {});
  const L = { ...LAYOUTS[layout] };
  const outer = new THREE.Group(), tilt = new THREE.Group(), roll = new THREE.Group();
  outer.add(tilt); tilt.add(roll);
  const model = await loadModel(base);
  roll.add(model);
  tilt.rotation.z = L.tiltZ; tilt.rotation.x = L.tiltX;
  const state = { scroll: 0, px: 0, py: 0, sx: 0, sy: 0, fly: 0, spin: 0, wob: 0 };
  const axis = { x: 0, y: 1 };
  function pose(time) {
    state.sx += (state.px - state.sx) * .06; state.sy += (state.py - state.sy) * .06;
    const sway = Math.sin(time * .00032) * .32;
    roll.rotation.y = -FRONT_ANGLE + L.roll + sway + state.scroll * 1.6 + state.spin;
    outer.rotation.y = state.sx * .16; outer.rotation.x = -state.sy * .1; outer.rotation.z = state.wob;   // wob: pitch on screen (settle)
    // lift along the airframe axis as the page scrolls
    const a = L.tiltZ + Math.PI / 2, lift = state.scroll * .55 + state.fly;
    axis.x = Math.cos(a); axis.y = Math.sin(a);
    outer.position.set(axis.x * lift + L.shiftX, axis.y * lift + L.shiftY + Math.sin(time * .0007) * .012, 0);
  }
  function setLayout(name) { Object.assign(L, LAYOUTS[name]); tilt.rotation.z = L.tiltZ; tilt.rotation.x = L.tiltX; }
  function settle(time = 0) { state.sx = state.px; state.sy = state.py; pose(time); }
  pose(0);
  return { group: outer, roll, model, state, layout: L, axis, pose, setLayout, settle, glow: { value: 0 }, detailMap: (scale = 1) => livery(true, scale) };
}

// ------------------------------------------------------------------ intro
// The hero's arrival: the rocket starts off screen, already sized and placed for its REST pose, and flies in along
// its own axis from below and behind on a burning motor. At rest the nozzle sits at the frame's edge, so the camera
// starts pulled back (`pull` x the layout's distance, per layout; 0 = the fixed rest framing) and holds wide through
// the burn, then eases in to exactly the rest framing from `pullHold` to `pullEnd` s (quintic: zero speed at both
// ends), over the coast and the settle. The flight, in shares of the way (FLY s in all):
//   brake  0 to BRAKE s: it enters fast and air drag brakes it to its cruise speed; `late` of the way is left when it
//          ends: `lead` times the nozzle's room in the wide frame (start() measures how far the nozzle at rest is
//          from the visible edge, along the path), at least `minLate` m
//   burn   BRAKE to BURN s: the motor (lit off screen at motor time `lit`, the G77R curve time-scaled to BURN) holds
//          the speed; as its thrust falls off, the speed falls with it (`fall` of the cruise speed is lost by burnout)
//   coast  BURN to FLY s: no thrust; an even deceleration to a stop at the rest pose (the speed falls in a straight
//          line to zero, no creep); the flame collapses to an ember and a thin wisp leaves the nozzle
//   settle a damped pitch wobble (wobble()) that eases in as it stops and dies within about half a second
// At 1440 x 900: cruise 0.64 m/s, the lit nozzle on screen 0.12 to 0.97 s, the whole flame in frame for 0.7 s; at
// 390 x 844 cruise 0.5 m/s, nozzle 0.85 s, whole flame 0.5 s. Camera in by 2.2 s.
// The smoke trail (`smoke`: { scene, quality }) is laid every frame along the path, stays where it was made and thins.
// Driven by the hero loop: start(exitDist, view) once, then step(dt, time, exitDist) every frame until !active.
// abort(): the user scrolled or touched the page during the arrival: the motor is cut, the flight and the camera
// finish in abortS from their current value and speed, the smoke and the wisp age out fast and nothing is left.
// hurry(): only the smoke and wisp age out fast.
export const INTRO = { pull: { land: .8, port: 1.2 }, pullHold: .95, pullEnd: 2.2, lead: .6, minLate: .25, brake: .25, burn: 1.05, fly: 1.45, lit: .12, late: .14, fall: .22, spin: -.9, ember: .5, abortS: .45, wobble: .022 };
const NOZZLE_Y = -.6102 + (.02 - (BODY_TOP + BODY_BOTTOM) / 2);   // motor retainer's aft face, in roll space

// Settle: a damped pitch (rad) t s after the rocket stops; it eases in over the last 0.12 s of the approach (t < 0).
export function wobble(t, amp = INTRO.wobble) {
  if (t < -.12 || t > 1.4) return 0;
  const on = t < 0 ? (1 + t / .12) ** 2 : 1, x = Math.max(0, t + .12);
  return amp * on * Math.exp(-x / .2) * Math.sin(x * 2 * Math.PI / .62);
}

// The flight as a table: share of the way (0..1) and speed (share of the way per s) at N + 1 even steps over FLY s.
function flightTable(late = INTRO.late, N = 290) {
  const { brake: A, burn: B, fly: F, lit, fall } = INTRO, rate = (G77R.burn - lit) / B, dt = F / N;
  const thr = t => (t < B ? thrustAt(lit + t * rate) : 0);
  // burn: acceleration = lam (thrust - the thrust at the start of this stretch), scaled to lose `fall` by burnout
  const ref = thr(A);
  let lost = 0;
  for (let i = 0; i < 400; i++) lost += (ref - thr(A + (i + .5) * (B - A) / 400)) * (B - A) / 400;
  const lam = fall / Math.max(1e-6, lost);
  const vB = [], n = 200; let v = 1, dBC = 0;
  for (let i = 0; i < n; i++) { const t = A + (i + .5) * (B - A) / n, v1 = v + lam * (thr(t) - ref) * (B - A) / n; dBC += (v + v1) / 2 * (B - A) / n; v = v1; }
  const vb = v; dBC += vb * (F - B) / 2;
  // brake: v = 1 + R (1 - t / A)^2, R chosen so that `late` of the way is left when it ends
  const R = 3 * (dBC / late - dBC - A) / A;
  const vel = t => {
    if (t < A) return 1 + R * (1 - t / A) ** 2;
    if (t >= F) return 0;
    if (t >= B) return vb * (F - t) / (F - B);
    let w = 1; const m = Math.ceil((t - A) / (B - A) * n), h = (t - A) / Math.max(1, m);
    for (let i = 0; i < m; i++) w += lam * (thr(A + (i + .5) * h) - ref) * h;
    return w;
  };
  const s = new Float32Array(N + 1), vv = new Float32Array(N + 1);
  for (let i = 0; i <= N; i++) vv[i] = vel(i * dt);
  for (let i = 0; i < N; i++) s[i + 1] = s[i] + (vv[i] + 4 * vel((i + .5) * dt) + vv[i + 1]) / 6 * dt;
  const L = s[N];
  for (let i = 0; i <= N; i++) { s[i] /= L; vv[i] /= L; }
  s[N] = 1; vv[N] = 0;
  return { s, v: vv, dt, N, rate };
}

export function createIntro(rocket, { scene, smoke = null, camera = null } = {}) {
  const flame = createFlame();
  flame.group.position.y = NOZZLE_Y;
  rocket.roll.add(flame.group);
  if (scene) scene.add(flame.world);
  const trail = smoke ? createSmoke(smoke) : null;
  const I = INTRO;
  let F = flightTable();
  const nozzle = new THREE.Vector3(), exhaust = new THREE.Vector3(), q = new THREE.Quaternion();
  let t = 0, flying = false, wisped = false, done = false, hurried = false;
  let cut = -1, cutEmber = 0, ab = null, room = null;   // abort: motor cut at t = cut; ab = { t0, s0, v0 } the flight's last stretch
  const where = () => {
    flame.group.getWorldPosition(nozzle);
    rocket.roll.getWorldQuaternion(q);
    exhaust.set(0, -1, 0).applyQuaternion(q);
  };
  const lerpT = (arr, x) => { const f = Math.min(F.N, Math.max(0, x / F.dt)), i = Math.min(F.N - 1, f | 0), u = f - i; return arr[i] + (arr[i + 1] - arr[i]) * u; };
  // share of the way at t (and its speed), on the flight table or, after an abort, on a cubic to the rest pose
  function way(t) {
    if (!ab) return [lerpT(F.s, t), lerpT(F.v, t)];
    const u = Math.min(1, (t - ab.t0) / I.abortS), D = I.abortS;
    const h00 = 2 * u ** 3 - 3 * u * u + 1, h10 = u ** 3 - 2 * u * u + u, h01 = -2 * u ** 3 + 3 * u * u;
    return [h00 * ab.s0 + h10 * D * ab.v0 + h01, u >= 1 ? 0 : 1];
  }
  const endT = () => (ab ? ab.t0 + I.abortS : I.fly);
  // the camera's pull-back: p = 1 (wide) through the burn, eased to exactly 0 (the rest framing) from pullHold to
  // pullEnd, zero speed at both ends; after an abort, a cubic from its value and speed to 0 within abortS
  const L = rocket.layout, pullK = () => (camera ? (L.aspect < 1 ? I.pull.port : I.pull.land) || 0 : 0);
  let pab = null;
  function pullAt(t) {
    if (pab) {
      const u = Math.min(1, Math.max(0, (t - pab.t0) / I.abortS)), D = I.abortS;
      return u >= 1 ? 0 : (2 * u ** 3 - 3 * u * u + 1) * pab.p0 + (u ** 3 - 2 * u * u + u) * D * pab.v0;
    }
    const u = Math.min(1, Math.max(0, (t - I.pullHold) / (I.pullEnd - I.pullHold)));
    return 1 - u * u * u * (u * (6 * u - 15) + 10);
  }
  const pullEndT = () => (pab ? pab.t0 + I.abortS : I.pullEnd);
  function setPull(p) { if (camera) { camera.position.z = L.dist * (1 + pullK() * p); camera.updateMatrixWorld(); } }
  // the way in starts off screen in the wide frame: exitDist (the rest frame's) grown by the pull
  const wayFor = exitDist => .75 + (exitDist - .75) * (1 + pullK());
  // How far (m, along the path) the nozzle at rest is from the edge of what a visitor sees (view: { camera, w, h,
  // vis: { l, r, t, b } in canvas px }): the visible burn is that last stretch, so the cruise starts just before it.
  const pA = new THREE.Vector3(), pB = new THREE.Vector3();
  function nozzleRoom(view) {
    const st = rocket.state, f0 = st.fly, s0 = st.spin;
    view.camera.updateMatrixWorld();
    const at = (fly, out) => { st.fly = fly; st.spin = 0; rocket.pose(0); rocket.group.updateMatrixWorld(true); flame.group.getWorldPosition(out).project(view.camera); out.set((out.x + 1) / 2 * view.w, (1 - out.y) / 2 * view.h, 0); return out; };
    at(0, pA); at(-1, pB);
    st.fly = f0; st.spin = s0; rocket.pose(0);
    const dx = pB.x - pA.x, dy = pB.y - pA.y, V = view.vis;   // px per m flown back along the path
    let k = Infinity;
    if (dx > 1e-6) k = Math.min(k, (V.r - pA.x) / dx); else if (dx < -1e-6) k = Math.min(k, (V.l - pA.x) / dx);
    if (dy > 1e-6) k = Math.min(k, (V.b - pA.y) / dy); else if (dy < -1e-6) k = Math.min(k, (V.t - pA.y) / dy);
    return Math.max(0, k);
  }
  function start(exitDist, view = null) {
    setPull(1);
    const D = wayFor(exitDist);
    room = view ? nozzleRoom(view) : null;
    F = flightTable(room === null ? I.late : Math.min(.65, Math.max(.06, Math.max(I.minLate, room * I.lead) / D)));
    t = 0; flying = true; done = false;
    rocket.state.fly = -D; rocket.state.spin = I.spin; rocket.state.wob = 0;
    flame.set({ thrust: 0, time: 0 });
  }
  function finish() {
    if (flying) { rocket.state.fly = 0; rocket.state.spin = 0; }
    rocket.state.wob = 0;
    flying = false; t = I.fly + 9;
    setPull(0);
    flame.set({ thrust: 0, ember: 0 }); rocket.glow.value = 0;
    if (trail) { trail.dispose(); }
    flame.world.visible = false;
    done = true;
  }
  function abort() {
    if (done) return;
    hurried = true;
    if (cut < 0 && t < I.burn) { cut = t; cutEmber = .8; }
    if (flying && !ab) { const [s0, v0] = way(t); ab = { t0: t, s0, v0 }; }
    if (!pab && t < I.pullEnd) { const p0 = pullAt(t); pab = { t0: t, p0, v0: (pullAt(t + .001) - p0) / .001 }; }
  }
  let lastTime = -1;
  function step(dt, time, exitDist) {
    if (done) return false;
    // the flight keeps to the wall clock on slow frames (the loop caps dt at 64 ms), up to 120 ms a frame
    if (lastTime >= 0 && time > lastTime) dt = Math.min(.12, (time - lastTime) / 1000);
    lastTime = time;
    t += dt;
    const tEnd = endT();
    if (flying) {
      const s = Math.min(1, way(t)[0]);
      rocket.state.fly = -wayFor(exitDist) * (1 - s);
      rocket.state.spin = I.spin * (1 - s) * (1 - s);
      if (t >= tEnd) { flying = false; rocket.state.fly = 0; rocket.state.spin = 0; }
    }
    rocket.state.wob = wobble(t - tEnd, ab ? I.wobble * .6 : I.wobble);
    setPull(pullAt(t));
    const burning = cut < 0 && t < I.burn;
    const thrust = burning ? thrustAt(I.lit + t * F.rate) / 80 : 0;
    const ember = cut >= 0 ? cutEmber * Math.max(0, 1 - (t - cut) / .3) ** 2 : t < I.burn ? 0 : Math.max(0, 1 - (t - I.burn) / I.ember) ** 2;
    flame.set({ thrust, ember, time }); rocket.glow.value = flame.light;
    where();
    if (!wisped && cut < 0 && t >= I.burn) { wisped = true; flame.puff(nozzle, exhaust, .022); }
    // every frame: emit lays puffs along the path since the last call, closer than their size, so the trail is
    // unbroken from the nozzle on at any speed
    if (trail && thrust > .05) trail.emit(nozzle, Math.min(1, thrust), exhaust, 1);
    // the wisp leaves from the nozzle as it coasts on; once hurried (abort, or the reel starts), smoke and wisp
    // age five times faster, so none is left by the time a guest's name comes forward
    const k = hurried ? 5 : 1;
    const wisping = flame.update(dt * k, nozzle);
    const smoking = trail ? trail.update(dt * k) : false;
    if (!flying && t > Math.max(tEnd + .9, pullEndT(), cut >= 0 ? cut + .3 : I.burn + I.ember) && !wisping && !smoking) finish();
    return !done;
  }
  return {
    start, step, finish, abort, flame,
    hurry() { hurried = true; },
    get active() { return !done; },
    get flying() { return flying; },
    get room() { return room; },
    get busy() { return !done && t < Math.max(endT() + .35, pullEndT()); },   // the reel waits while the rocket arrives, settles and the camera comes in
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
