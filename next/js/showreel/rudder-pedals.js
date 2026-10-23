// Rudder pedals: a showreel project actor (the owner's pedal assembly from CAD
// and a small light aircraft that answers it). Recipe: docs/recipes/showreel-actor.md
//
// The story (about 16 s): the eight CAD part groups fly in from off screen into
// an exploded view and assemble (middle supports, side walls, sensor lever,
// link rods, then each lever arm with its pedal). The pedals then work right,
// left, right, left through their real travel: each lever arm swings on its
// top pivot bolt, its rear end drives the link rod, the rods rock the sensor
// lever about its center bolt, so one pedal goes forward as the other comes
// back. The linkage is solved from the CAD joint positions every frame, not
// keyframed. Far behind, a small generic high-wing light aircraft (procedural,
// matte, no markings) crosses the hero: it yaws and banks with the pedals a
// beat later and weaves clear of the focused drift word and the pedals. Then
// the pedals center, the assembly opens and the parts leave.
//
//   createModel({ THREE, quality })  -> the CAD assembly (next/assets/3d/rudder-pedals.*,
//     imported by `python3 tools/cad.py import` with tools/cad/maps/rudder-pedals.json)
//     group, height, footprint, triangles, getParts(), parts, setProgress(p), setDrive(x), setToe(l, r)
//   createAccent({ THREE, quality }) -> the light aircraft: group, setProp(angle), dispose()
//   createActor(ctx)                 -> the reel actor (interface at the top of showreel/index.js)
//
// Units meters, +Y up, model origin at the center of its footprint on the
// ground. Lights and environment come from engine.js (engine.adopt): never add
// lights, fog or an environment here. Everything in sample() is a pure
// function of reel time.
import { THREE, ease, win, clamp01, lerp, placeInFrame, screenExtents } from './engine.js';
import { fetchCadMesh, buildCadMesh } from '../cad/cadmesh.js';

export const KEY = 'rudder-pedals';
export const WORD = 'Rudder pedals';

// Loaded once when the module is imported (the hero imports it on idle, at REST).
const CAD = await fetchCadMesh(new URL('../../assets/3d/rudder-pedals.json', import.meta.url));

// ===================================================================== reel
export const SEQUENCE = [
  ['RUDDER_PEDALS_ENTER', 2.4],     // parts fly in from off screen into the exploded view
  ['RUDDER_PEDALS_ASSEMBLE', 2.5],  // exploded -> assembled, in build order
  ['RUDDER_PEDALS_ACTION', 9.0],    // pedals work right/left; the aircraft crosses behind
  ['RUDDER_PEDALS_EXIT', 2.4],      // pedals centered, the assembly opens, parts leave
];
const [ENTER, ASSEMBLE, ACTION, EXIT] = SEQUENCE.map(s => s[0]);

// Pedal program in ACTION seconds: [time, drive], drive -1 = left pedal fully
// forward (left rudder), +1 = right. Eased between keys (feet push, hold, ease off).
const PROGRAM = [[0, 0], [.55, 0], [1.25, .85], [2.15, .85], [2.95, -1], [4.15, -1], [4.95, .9], [5.9, .9], [6.6, -.45], [7.35, -.45], [8.05, 0]];
// Aircraft: in ACTION seconds it enters (off screen) and leaves (off screen),
// how far it lags the pedals, yaw rate per unit drive, bank and rudder yaw.
const FLIGHT = { t0: .15, t1: 10.1, lag: .28, turn: 1.0, bank: .62, yaw: .14, tilt: 1.15, depth: -1.4 };

// ================================================================= the look
// Colors follow the owner's mechanism render (assets/motion/rudder-pedals-mechanism.mp4):
// charcoal side walls, light grey printed levers and supports, orange pedals. The map
// writes colors; roughness and metalness are set here (matte to satin).
const LOOK = {
  '#393b41': { color: 0x393b41, roughness: .68, metalness: 0 },    // side walls
  '#c4c8ce': { color: 0xa9abb0, roughness: .6, metalness: 0 },    // levers, supports, sensor lever
  '#e59f5c': { color: 0xbe825a, roughness: .64, metalness: 0 },    // pedals
  steel: { color: 0xbfc3c8, roughness: .4, metalness: .85 },       // link rods, bearings
  darkMetal: { color: 0x2c2e33, roughness: .5, metalness: .6 },    // bolts and nuts
};
const VIEW = { x: .42, y: -.8, drift: .14 };   // three-quarter view from the pilot's side, slow drift
const FRAME = { share: [.3, .44], fillW: [.36, .74], fillH: [.66, .46], prefer: [.56, .46] };

// CAD reference points (mm, STEP axes, Y up: x fore-aft with the pilot at +x,
// z across with the pilot's left at +z). From `tools/cad.py inspect --json`.
const CADP = {
  wallR: [615.63, 125.0, 1209.55],                                  // bounds center, used to place the rest
  pivR: [666.31, 240.44], pivL: [667.87, 240.44],                   // lever top pivot bolts (axis z)
  rearR: [544.04, 232.47, 1194.76], rearL: [543.82, 243.40, 1334.33], // rod top joints (rod axis x, y, rod z)
  tipR: [97.71, 1194.76], tipL: [108.64, 1334.33],                  // rod bottom joints on the rocker (y, z)
  rock: [557.89, 103.18, 1264.55],                                  // sensor lever center bolt (axis x)
  hingeR: [671.98, 113.57], hingeL: [660.64, 113.57],               // pedal hinge bolts (axis z)
};
const PHI = 20 * Math.PI / 180;   // sensor lever travel each way (the levers swing about 11 degrees)
const TOE = 14 * Math.PI / 180;   // toe brake travel

// Build order, exploded offsets (model meters) and how far each part's fly-in
// lags. Walls slide in sideways onto the supports, the sensor lever from behind,
// the rods drop in behind the walls, the lever arms (with their pedals) last.
// Two exploded layouts: `up` (levers and rods lifted) and `low` (levers lowered
// outboard of the walls, rods pulled back); layout() takes whichever opens
// wider in the free area without touching the word.
const PARTS = {
  core:   { explode: [0, -.03, 0], low: [0, -.04, 0], delay: 0 },
  wallR:  { explode: [0, .005, -.07], low: [0, 0, -.07], delay: .08 },
  wallL:  { explode: [0, .005, .07], low: [0, 0, .07], delay: .12 },
  rocker: { explode: [-.085, -.03, 0], low: [-.08, -.035, 0], delay: .18 },
  rodR:   { explode: [-.05, .1, -.035], low: [-.075, .01, -.03], delay: .24 },
  rodL:   { explode: [-.05, .1, .035], low: [-.075, .01, .03], delay: .27 },
  leverR: { explode: [.025, .12, -.1], low: [.035, -.075, -.085], delay: .3 },
  leverL: { explode: [.025, .12, .1], low: [.035, -.075, .085], delay: .34 },
};

// ==================================================================== model
export function createModel({ THREE: T = THREE } = {}) {
  const m = buildCadMesh(T, CAD.meta, CAD.buf);
  m.group.name = KEY;
  for (const [k, mat] of Object.entries(m.materials)) {
    const look = LOOK[k];
    if (!look) continue;
    mat.color.setHex(look.color); mat.roughness = look.roughness; mat.metalness = look.metalness;
  }
  // STEP mm -> model meters: the side wall's bounds center fixes the importer's origin shift
  const wall = m.parts.wallR.position;
  const off = [wall.x - CADP.wallR[0] / 1000, wall.y - CADP.wallR[1] / 1000, wall.z - CADP.wallR[2] / 1000];
  const toM = (x, y, z) => [x / 1000 + off[0], y / 1000 + off[1], z / 1000 + off[2]];
  const P = m.parts;
  m.setPivot('leverR', toM(CADP.pivR[0], CADP.pivR[1], CADP.rearR[2]));
  m.setPivot('leverL', toM(CADP.pivL[0], CADP.pivL[1], CADP.rearL[2]));
  const hinge = (lever, sub, h, z) => { const w = toM(h[0], h[1], z); m.setPivot(lever.getObjectByName(sub), [w[0] - lever.position.x, w[1] - lever.position.y, w[2] - lever.position.z]); };
  hinge(P.leverR, 'pedalR', CADP.hingeR, CADP.rearR[2]);
  hinge(P.leverL, 'pedalL', CADP.hingeL, CADP.rearL[2]);
  m.setPivot('rocker', toM(...CADP.rock));
  m.setPivot('rodR', toM(...CADP.rearR));
  m.setPivot('rodL', toM(...CADP.rearL));
  const pedalR = P.leverR.getObjectByName('pedalR'), pedalL = P.leverL.getObjectByName('pedalL');

  // --- linkage, solved in STEP mm from the CAD joints
  const rockPhi0 = Math.atan2(CADP.tipL[0] - CADP.rock[1], CADP.tipL[1] - CADP.rock[2]);  // CAD pose of the sensor lever
  const tipVec = t => [t[0] - CADP.rock[1], t[1] - CADP.rock[2]];
  const vR = tipVec(CADP.tipR), vL = tipVec(CADP.tipL);
  const sides = [
    { piv: CADP.pivR, rear: CADP.rearR, v: vR, len: CADP.rearR[1] - CADP.tipR[0], part: P.rodR, lever: P.leverR },
    { piv: CADP.pivL, rear: CADP.rearL, v: vL, len: CADP.rearL[1] - CADP.tipL[0], part: P.rodL, lever: P.leverL },
  ];
  const restDir = new T.Vector3(0, -1, 0), dir = new T.Vector3();
  const st = { a: 0, d: [0, 0], top: [[0, 0, 0], [0, 0, 0]], tip: [[0, 0, 0], [0, 0, 0]] };
  function rearAt(s, d, out) {
    const rx = s.rear[0] - s.piv[0], ry = s.rear[1] - s.piv[1], c = Math.cos(d), n = Math.sin(d);
    out[0] = s.piv[0] + rx * c - ry * n; out[1] = s.piv[1] + rx * n + ry * c; out[2] = s.rear[2];
    return out;
  }
  // phi: sensor lever angle from level (+ = the left tip up, i.e. left pedal forward)
  function solve(phi) {
    const a = -(phi - rockPhi0), c = Math.cos(a), n = Math.sin(a);   // three.js rotation.x of the rocker
    st.a = a;
    sides.forEach((s, i) => {
      const tip = st.tip[i];
      tip[0] = s.rear[0]; tip[1] = CADP.rock[1] + s.v[0] * c - s.v[1] * n; tip[2] = CADP.rock[2] + s.v[0] * n + s.v[1] * c;
      // the lever angle (from its CAD pose) that puts the rod's top joint one rod length from the tip
      let lo = -.6, hi = .6;
      const f = d => { const r = rearAt(s, d, st.top[i]); return Math.hypot(r[0] - tip[0], r[1] - tip[1], r[2] - tip[2]) - s.len; };
      for (let k = 0; k < 28; k++) { const mid = (lo + hi) / 2; if (f(mid) > 0) lo = mid; else hi = mid; }
      st.d[i] = (lo + hi) / 2;
      rearAt(s, st.d[i], st.top[i]);
    });
    return st;
  }

  // --- assembly: base positions (after the pivots moved) and the build stagger
  const order = ['core', 'wallR', 'wallL', 'rocker', 'rodR', 'rodL', 'leverR', 'leverL'];
  const list = order.map(name => ({ name, mesh: P[name], base: P[name].position.clone(), explode: new T.Vector3(...PARTS[name].explode), mech: new T.Vector3() }));
  const byName = Object.fromEntries(list.map(r => [r.name, r]));
  let prog = 1;
  function place() {
    const n = list.length;
    list.forEach((r, i) => {
      const a = i / (n - 1) * .5, k = ease.inOutSine(win(prog, a, a + .5));
      r.mesh.position.copy(r.base).add(r.mech).addScaledVector(r.explode, 1 - k);
    });
  }
  function setProgress(p) { prog = p; place(); }
  function setDrive(x) {
    const s = solve(-Math.max(-1, Math.min(1, x)) * PHI);
    P.rocker.rotation.x = s.a;
    sides.forEach((side, i) => {
      side.lever.rotation.z = s.d[i];
      const top = s.top[i], tip = s.tip[i], r = byName[side.part.name];
      const w = toM(top[0], top[1], top[2]);
      r.mech.set(w[0] - r.base.x, w[1] - r.base.y, w[2] - r.base.z);
      dir.set(tip[0] - top[0], tip[1] - top[1], tip[2] - top[2]).normalize();
      side.part.quaternion.setFromUnitVectors(restDir, dir);
    });
    place();
  }
  // toe brakes: each pedal tips back about its hinge bolt (0..1)
  function setToe(l, r) { pedalL.rotation.z = -TOE * clamp01(l); pedalR.rotation.z = -TOE * clamp01(r); }
  setDrive(0); setProgress(1);
  const size = new T.Vector3(); new T.Box3().setFromObject(m.group).getSize(size);
  return {
    group: m.group, height: size.y, footprint: Math.max(size.x, size.z), triangles: m.triangles,
    parts: P, materials: m.materials,
    getParts: () => list.map(({ name, mesh, explode }) => ({ name, mesh, explode, delay: PARTS[name].delay })),
    setProgress, setDrive, setToe, solve,
    update() {},
    dispose: m.dispose,
  };
}

// ======================================================= accent: the aircraft
// A generic high-wing light aircraft, about 1 unit of span, nose +Z, up +Y.
// Merged per material: 3 draw calls plus the faint propeller disc.
export function createAccent({ THREE: T = THREE, quality = 'high' } = {}) {
  const seg = quality === 'low' ? 6 : 8;
  const parts = { white: [], dark: [], accent: [] };
  const add = (key, geo, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) => {
    const o = new T.Object3D(); o.position.set(...pos); o.rotation.set(...rot); o.scale.set(...scale); o.updateMatrix();
    parts[key].push(geo.applyMatrix4(o.matrix));
  };
  const box = (w, h, d) => new T.BoxGeometry(w, h, d);
  const cyl = (r0, r1, len, s = seg) => new T.CylinderGeometry(r1, r0, len, s, 1);   // from r0 (-y) to r1 (+y)
  const X = Math.PI / 2;
  // fuselage: cowling and cabin, tapering tail cone
  add('white', cyl(.062, .05, .2), [0, 0, .22], [X, 0, 0], [1, 1.12, 1]);
  add('white', cyl(.07, .062, .22), [0, .004, .01], [X, 0, 0], [1, 1.25, 1]);
  add('white', cyl(.016, .07, .5), [0, .03, -.35], [X, 0, 0], [1, 1.1, 1]);
  add('dark', box(.142, .05, .16), [0, .045, .04]);                                  // cabin glass band
  add('dark', cyl(.03, .012, .05, 6), [0, 0, .345], [X, 0, 0]);                     // spinner
  // high wing with a little dihedral, struts, tail
  add('white', box(.5, .016, .15), [.25, .1, .03], [0, 0, .045]);
  add('white', box(.5, .016, .15), [-.25, .1, .03], [0, 0, -.045]);
  add('accent', box(.05, .017, .15), [.49, .111, .03], [0, 0, .045]);
  add('accent', box(.05, .017, .15), [-.49, .111, .03], [0, 0, -.045]);
  add('white', box(.24, .008, .022), [.12, .035, .04], [0, 0, .5]);
  add('white', box(.24, .008, .022), [-.12, .035, .04], [0, 0, -.5]);
  add('white', box(.34, .012, .085), [0, .04, -.56]);
  add('white', box(.012, .13, .1), [0, .1, -.57], [-.28, 0, 0]);
  add('accent', box(.013, .03, .07), [0, .17, -.6], [-.28, 0, 0]);
  // fixed gear
  add('dark', box(.012, .07, .012), [.06, -.075, .1], [0, 0, -.45]);
  add('dark', box(.012, .07, .012), [-.06, -.075, .1], [0, 0, .45]);
  add('dark', cyl(.022, .022, .014, 8), [.085, -.105, .1], [0, 0, X]);
  add('dark', cyl(.022, .022, .014, 8), [-.085, -.105, .1], [0, 0, X]);
  const MATS = {
    white: { color: 0xe9e7e2, roughness: .62, metalness: 0 },
    dark: { color: 0x2a2d33, roughness: .5, metalness: 0 },
    accent: { color: 0xbe825a, roughness: .64, metalness: 0 },
  };
  const group = new T.Group(), geos = [], mats = [];
  group.name = KEY + ':aircraft';
  for (const [k, list] of Object.entries(parts)) {
    const geo = mergeGeometries(T, list);
    const mat = new T.MeshStandardMaterial(MATS[k]);
    geos.push(geo); mats.push(mat);
    group.add(new T.Mesh(geo, mat));
  }
  // the propeller: a faint disc and one blade, turned from reel time
  const discGeo = new T.CircleGeometry(.105, 20), discMat = new T.MeshBasicMaterial({ color: 0x2a2d33, transparent: true, opacity: .14, depthWrite: false, side: T.DoubleSide });
  const disc = new T.Mesh(discGeo, discMat); disc.position.z = .372; group.add(disc);
  const bladeGeo = box(.21, .016, .006), blade = new T.Mesh(bladeGeo, mats[1]); blade.position.z = .37; group.add(blade);
  geos.push(discGeo, bladeGeo); mats.push(discMat);
  return {
    group, span: 1.08,
    setProp(a) { blade.rotation.z = a; },
    dispose() { for (const g of geos) g.dispose(); for (const m of mats) m.dispose(); },
  };
}

// Concatenate non-indexed copies of geometries (position + normal only).
function mergeGeometries(T, list) {
  const flat = list.map(g => { const n = g.index ? g.toNonIndexed() : g; n.deleteAttribute('uv'); return n; });
  const count = flat.reduce((s, g) => s + g.attributes.position.count, 0);
  const pos = new Float32Array(count * 3), nrm = new Float32Array(count * 3);
  let o = 0;
  for (const g of flat) { pos.set(g.attributes.position.array, o * 3); nrm.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; }
  for (const g of list) g.dispose();
  const out = new T.BufferGeometry();
  out.setAttribute('position', new T.BufferAttribute(pos, 3));
  out.setAttribute('normal', new T.BufferAttribute(nrm, 3));
  out.computeBoundingSphere();
  return out;
}

// pedal drive at ACTION time u (pure)
function driveAt(u) {
  if (u <= PROGRAM[0][0]) return PROGRAM[0][1];
  for (let i = 1; i < PROGRAM.length; i++) {
    const [t1, v1] = PROGRAM[i], [t0, v0] = PROGRAM[i - 1];
    if (u < t1) return lerp(v0, v1, ease.inOutSine((u - t0) / (t1 - t0)));
  }
  return PROGRAM[PROGRAM.length - 1][1];
}

// ==================================================================== actor
export async function createActor(ctx) {
  const { engine, quality = 'high' } = ctx;
  const base = { THREE, renderer: engine.renderer, quality };
  const model = createModel(base);
  const plane = createAccent(base);

  // root > stage (placed and scaled by layout) > view (viewing angle) > model, shadow
  //      > flight (the aircraft, in world units far behind the stage)
  const root = new THREE.Group(), stage = new THREE.Group(), view = new THREE.Group(), flight = new THREE.Group();
  root.name = KEY + ':root'; stage.name = KEY + ':stage';
  root.add(stage, flight);
  stage.add(view);
  view.rotation.set(VIEW.x, VIEW.y, 0);
  view.add(model.group);
  flight.add(plane.group);
  const shadow = contactShadow(model.footprint * 1.45);
  shadow.rotation.z = Math.PI / 2; shadow.scale.y = .62;   // narrower fore-aft than across the walls
  shadow.position.y = .0005;
  view.add(shadow);
  root.visible = true; stage.visible = false; flight.visible = false;
  root.updateMatrixWorld(true);

  // A screen-space direction -> the same direction in view space.
  const inv = new THREE.Quaternion();
  const toView = (x, y, z) => new THREE.Vector3(x, y, z).normalize().applyQuaternion(inv.copy(view.quaternion).invert());
  // Each part flies in (and out) along its own explode direction as seen on screen.
  // `clear(x, y)` (optional) says whether a screen direction keeps the part off the word.
  function flyDir(name, explode, clear) {
    const e = explode.clone().applyQuaternion(view.quaternion);
    if (e.lengthSq() < 1e-6 || name === 'core') e.set(-1, -.08, 0);  // the supports come in from the left
    let a0 = Math.atan2(e.y, e.x), best = null;
    for (const da of [0, .25, -.25, .5, -.5, .8, -.8, 1.1, -1.1, 1.5, -1.5]) {
      const a = a0 + da, x = Math.cos(a), y = Math.sin(a);
      if (y < -.36) continue;                                          // never up through (or down into) the marquee
      if (!clear || clear(x, y)) { best = [x, y]; break; }
    }
    if (!best) { const y = Math.max(-.35, Math.sin(a0)); best = [(Math.cos(a0) < 0 ? -1 : 1) * Math.sqrt(1 - y * y), y]; }
    return toView(best[0], best[1], .2);
  }
  const parts = model.getParts().map((p, i) => {
    const mesh = p.mesh, wrap = new THREE.Group();
    mesh.parent.add(wrap); wrap.add(mesh);
    const d = flyDir(p.name, p.explode);
    const axis = new THREE.Vector3(Math.sin(i * 2.1 + 1), Math.cos(i * 1.7), Math.sin(i * 3.3 + 2)).normalize();
    return { name: p.name, mesh, wrap, axis, dir: d, explode: p.explode, ex0: p.explode.clone(), exLow: new THREE.Vector3(...PARTS[p.name].low), spin: (i % 2 ? -1 : 1) * (.5 + (i * .37) % .4), delay: p.delay, f: 1, f0: 1 };
  });
  const N = parts.length;

  const REST = { p: 0, drive: 0, toeL: 0, toeR: 0, shadow: 0, yaw: 0, fly: -1, flyExtra: 0, flyOut: 0, flyFade: 0 };
  const v = { ...REST }, a0 = { ...REST };
  let dist = 2;
  const q = new THREE.Quaternion(), tmp = new THREE.Vector3(), piv = new THREE.Vector3();

  // ---- the flight path, built per layout in screen px, stored in world units
  // Heading follows the pedals a beat later: psi' = -turn * drive(t - lag).
  const DT = 1 / 30, NS = Math.ceil((FLIGHT.t1 - FLIGHT.t0) / DT) + 1;
  const unit = { x: new Float32Array(NS), y: new Float32Array(NS), psi: new Float32Array(NS) };
  function integrate() {
    let x = 0, y = 0, psi = 0;
    for (let i = 0; i < NS; i++) {
      unit.x[i] = x; unit.y[i] = y; unit.psi[i] = psi;
      const u = FLIGHT.t0 + i * DT;
      psi += -FLIGHT.turn * driveAt(u - FLIGHT.lag) * DT;
      x += Math.cos(psi) * DT; y += Math.sin(psi) * DT;
    }
    return { x: unit.x.slice(), y: unit.y.slice(), psi: unit.psi.slice() };
  }
  const path = { wx: new Float32Array(NS), wy: new Float32Array(NS), wz: 0, scale: .05, speed: 0, ok: false };
  const ndc = new THREE.Vector3(), ray = new THREE.Vector3();

  function fitFlight(F, objBox) {
    const { camera, w, h, free, avoid } = F;
    camera.updateMatrixWorld();
    // world size of one px at the flight depth
    const depth = FLIGHT.depth;
    const unproject = (px, py, out) => {
      ndc.set(px / w * 2 - 1, 1 - py / h * 2, .5).unproject(camera);
      ray.copy(ndc).sub(camera.position).normalize();
      const t = (depth - camera.position.z) / ray.z;
      out.copy(camera.position).addScaledVector(ray, t);
      return out;
    };
    const a = unproject(0, h / 2, new THREE.Vector3()), b = unproject(w, h / 2, new THREE.Vector3());
    const wpp = (b.x - a.x) / w;                             // world units per px at the flight depth
    const spanPx = Math.max(42, Math.min(72, Math.min(w, h) * .07));
    path.scale = spanPx * wpp / plane.span;
    const m = spanPx * .75;                                  // keep-out radius around the aircraft, px
    let best = null;
    // The path's shape comes from the pedal program (integrated once); a
    // candidate places it on screen: travel direction (a rotation keeps every
    // turn's sense), speed and the off-screen point where it enters. It must
    // enter and leave off screen (through the sides: it stays between the top
    // bar and the marquee) and never touch the word. Then: as little
    // time as possible behind the pedals or outside the free band, close to
    // the word and around it (on more than one side), long on screen.
    const U = integrate(), fh = free.b - free.t;
    const wr = avoid[0] || null, wc = wr ? { x: (wr.l + wr.r) / 2, y: (wr.t + wr.b) / 2 } : null;
    const big = Math.max(w, h), STEP = 3, edge = Math.max(14, (w + h) / 60);
    const starts = [];
    for (let y = 0; y <= h; y += edge) starts.push([-m, y], [w + m, y]);
    for (let x = 0; x <= w; x += edge) starts.push([x, -m], [x, h + m]);
    const out = (x, y, k) => x < -k || x > w + k || y < -k || y > h + k;
    for (let r = 0; r < 24; r++) {
      const rho = r * Math.PI / 12, c = Math.cos(rho), n = Math.sin(rho);
      for (const sp of [.09, .12, .15, .18]) {
        const sx = sp * big;
        const ex = sx * (c * U.x[NS - 1] - n * U.y[NS - 1]), ey = -sx * (n * U.x[NS - 1] + c * U.y[NS - 1]);
        const dx0 = c * Math.cos(U.psi[0]) - n * Math.sin(U.psi[0]), dy0 = -(n * Math.cos(U.psi[0]) + c * Math.sin(U.psi[0]));
        for (const [X0, Y0] of starts) {
          if (!out(X0 + ex, Y0 + ey, m * .8)) continue;                     // must leave the screen
          if ((X0 < 0 && dx0 <= 0) || (X0 > w && dx0 >= 0) || (Y0 < 0 && dy0 <= 0) || (Y0 > h && dy0 >= 0)) continue;  // and head in
          let clear = Infinity, nearWord = Infinity, hidden = 0, band = 0, seen = 0, amin = Infinity, amax = -Infinity, bad = false;
          for (let i = 0; i < NS; i += STEP) {
            const px = X0 + sx * (c * U.x[i] - n * U.y[i]), py = Y0 - sx * (n * U.x[i] + c * U.y[i]);
            if (out(px, py, 0)) continue;
            seen++;
            if (py < free.t + m * .4 || py > free.b - m * .4) { bad = true; break; }   // never over the top bar or the marquee
            if (py < free.t + m || py > free.b - m) band++;
            if (wr) {
              const d = rectDist(wr, px, py);
              if (d < m) { bad = true; break; }
              nearWord = Math.min(nearWord, d);
              if (d < 4 * m) { const a = Math.atan2(py - wc.y, (px - wc.x) * .5); amin = Math.min(amin, a); amax = Math.max(amax, a); }
            }
            if (objBox && rectDist(objBox, px, py) < m * .5) hidden++;
          }
          if (bad || seen < 8) continue;
          const vis = seen / Math.ceil(NS / STEP), around = amax > amin ? Math.min(Math.PI, amax - amin) : 0;
          const score = -350 * hidden / seen - 700 * band / seen + 150 * vis + 30 * around - .4 * Math.abs(Math.min(nearWord, 1e3) - 2.2 * m) - 10 * Math.abs(sp - .12) / .03;
          if (!best || score > best.score) best = { score, X0, Y0, c, n, sx, clear: nearWord - m, around, hidden: hidden / seen, band: band / seen, vis };
        }
      }
    }
    path.ok = !!best;
    if (!best) return;
    const p = new THREE.Vector3();
    for (let i = 0; i < NS; i++) {
      const px = best.X0 + best.sx * (best.c * U.x[i] - best.n * U.y[i]), py = best.Y0 - best.sx * (best.n * U.x[i] + best.c * U.y[i]);
      unproject(px, py, p);
      path.wx[i] = p.x; path.wy[i] = p.y;
    }
    path.wz = depth;
    path.speed = best.sx * wpp;                              // world units per second along the path (for the exit run)
    path.clear = best.clear; path.around = best.around; path.hidden = best.hidden; path.band = best.band; path.vis = best.vis;
  }

  // aircraft pose at flight time s (seconds since FLIGHT.t0); past the end it keeps going straight
  const e1 = new THREE.Vector3(1, 0, 0), e2 = new THREE.Vector3(), nrm = new THREE.Vector3(), fwd = new THREE.Vector3(), up = new THREE.Vector3(), side = new THREE.Vector3(), mtx = new THREE.Matrix4();
  e2.set(0, Math.cos(FLIGHT.tilt), -Math.sin(FLIGHT.tilt)); nrm.crossVectors(e1, e2);
  function posePlane(s, extra = 0, fade = 0) {
    const fi = s / DT, i = Math.max(0, Math.min(NS - 2, Math.floor(fi))), k = clamp01(fi - i);
    let x = lerp(path.wx[i], path.wx[i + 1], k), y = lerp(path.wy[i], path.wy[i + 1], k);
    // screen-space heading from the stored path (perspective-correct), extended straight past the end
    const dx = path.wx[i + 1] - path.wx[i], dy = path.wy[i + 1] - path.wy[i], L = Math.hypot(dx, dy) || 1;
    const over = Math.max(0, s - (NS - 1) * DT) + extra;
    x += dx / L * path.speed * over; y += dy / L * path.speed * over;
    const d = driveAt(FLIGHT.t0 + s - FLIGHT.lag * .6);
    const heading = Math.atan2(dy, dx) - FLIGHT.yaw * d;        // rudder yaws the nose into the turn
    fwd.copy(e1).multiplyScalar(Math.cos(heading)).addScaledVector(e2, Math.sin(heading));
    side.crossVectors(fwd, nrm);                                  // right wing
    const bank = FLIGHT.bank * driveAt(FLIGHT.t0 + s - FLIGHT.lag);
    up.copy(nrm).multiplyScalar(Math.cos(bank)).addScaledVector(side, Math.sin(bank));
    side.crossVectors(up, fwd);                                   // local +X (left wing)
    mtx.makeBasis(side, up, fwd);
    plane.group.quaternion.setFromRotationMatrix(mtx);
    plane.group.position.set(x, y, path.wz);
    plane.group.scale.setScalar(path.scale * (1 - .9 * fade));
    plane.setProp((s + extra) * 47);
  }

  function apply() {
    model.setProgress(v.p);
    model.setDrive(v.drive);
    model.setToe(v.toeL, v.toeR);
    view.rotation.y = VIEW.y + v.yaw;
    let any = false;
    for (const P of parts) {
      if (P.f < .999) any = true;
      q.setFromAxisAngle(P.axis, P.spin * P.f);
      piv.copy(P.mesh.position);
      tmp.copy(piv).applyQuaternion(q);
      P.wrap.quaternion.copy(q);
      P.wrap.position.copy(P.dir).multiplyScalar(dist * P.f * (1 + P.delay)).add(piv).sub(tmp);
    }
    shadow.material.opacity = .32 * v.shadow;
    stage.visible = any;
    const fl = path.ok && v.fly >= 0 && v.flyOut < 1;
    flight.visible = fl;
    if (fl) posePlane(v.fly, v.flyExtra, v.flyFade);
  }

  // Framing: size the assembly to a share of the hero's free area, clear of
  // the focused drift word (assembled AND exploded measured), then fit the
  // aircraft's path around both. Runs on resize only.
  function layout(F) {
    const { halfW, halfH, camera, w, h, free, avoid } = F;
    const n = w < h ? 1 : 0;
    const keep = parts.map(P => P.f), kv = { ...v };
    for (const P of parts) P.f = 0;
    v.fly = -1; v.yaw = 0;
    let S = 2 * Math.min(halfW, halfH) * FRAME.share[n] / Math.max(model.footprint, model.height, .01);
    stage.scale.setScalar(S); stage.position.set(0, 0, 0);
    let ext = { l: 0, r: 0, u: 0, d: 0 };
    for (const P of parts) P.explode.copy(P.ex0);
    const measure = p => {
      let x = { l: 0, r: 0, u: 0, d: 0 };
      for (const y of [VIEW.drift, -VIEW.drift]) {
        v.p = p; v.yaw = y; apply();
        const e = screenExtents([model.group], stage, camera, w, h);
        x = { l: Math.max(x.l, e.l), r: Math.max(x.r, e.r), u: Math.max(x.u, e.u), d: Math.max(x.d, e.d) };
      }
      return x;
    };
    ext = measure(1);
    const fw = free.r - free.l, fh = free.b - free.t;
    let k = Math.min(fh * FRAME.fillH[n] / (ext.u + ext.d), fw * FRAME.fillW[n] / (ext.l + ext.r));
    const prefer = { x: free.l + fw * FRAME.prefer[0], y: free.t + fh * FRAME.prefer[1] };
    let spot = null;
    for (let i = 0; i < 6 && !spot; i++, k *= .9) {
      const e = { l: ext.l * k, r: ext.r * k, u: ext.u * k, d: ext.d * k };
      spot = placeInFrame({ ext: e, free, avoid, prefer: { x: prefer.x - (e.r - e.l) / 2, y: prefer.y - (e.d - e.u) / 2 } });
    }
    if (spot) k /= .9;
    S *= k;
    stage.scale.setScalar(S);
    const ox = spot ? spot.x : w / 2, oy = spot ? spot.y : h / 2;
    stage.position.set((ox / w * 2 - 1) * halfW, (1 - oy / h * 2) * halfH, 0);
    dist = Math.hypot(halfW, halfH) * 1.3 / S;
    // the exploded view: shrink the offsets until every part stays inside the
    // free area and clear of the focused word
    {
      // a part that already touches an edge or the word when assembled (placement
      // rounding) is judged against where it sits assembled
      const base = new Map();
      const rectOf = P => { const e = screenExtents([P.mesh], stage, camera, w, h); return { l: ox - e.l, r: ox + e.r, t: oy - e.u, b: oy + e.d }; };
      const over = (r, P) => {
        const b = base.get(P) || 0;
        let o = Math.max(0, free.l - r.l, r.r - free.r, free.t - r.t, r.b - free.b);
        for (const a of avoid) o = Math.max(o, Math.min(a.r - r.l, r.r - a.l, a.b - r.t, r.b - a.t));
        return o - b;
      };
      for (const P of parts) P.explode.set(0, 0, 0);
      for (const y of [VIEW.drift, -VIEW.drift]) { v.p = 0; v.yaw = y; apply(); for (const P of parts) base.set(P, Math.max(base.get(P) || 0, over(rectOf(P), P))); }
      // each part opens as far as it can on its own (its own scale), in both layouts
      const partHits = P => {
        for (const y of [VIEW.drift, -VIEW.drift]) { v.p = 0; v.yaw = y; apply(); if (over(rectOf(P), P) > 2) return true; }
        return false;
      };
      const fit = key => {
        const sc = new Map();
        for (const P of parts) {
          let c = 1;
          for (; c > .25; c *= .88) { P.explode.copy(P[key]).multiplyScalar(c); if (!partHits(P)) break; }
          c = Math.max(c, .25); sc.set(P, c); P.explode.set(0, 0, 0);
        }
        return sc;
      };
      const mean = m => [...m.values()].reduce((a, b) => a + b, 0) / m.size;
      const up = fit('ex0'), low = mean(up) > .99 ? null : fit('exLow');
      const pick = low && mean(low) > mean(up) + .05 ? low : up;
      explodeKey = pick === up ? 'ex0' : 'exLow';
      explodeScale = mean(pick);
      for (const P of parts) P.explode.copy(P[explodeKey]).multiplyScalar(pick.get(P));
      // flight paths (in and out) that do not sweep across the word: from the exploded spot to off screen
      v.p = 0; v.yaw = 0; apply();
      for (const P of parts) {
        const r = rectOf(P), cx = (r.l + r.r) / 2, cy = (r.t + r.b) / 2, hw = (r.r - r.l) / 2, hh = (r.b - r.t) / 2;
        const clear = (x, y) => {
          for (let t = 0; t < 2 * Math.hypot(w, h); t += 12) {
            const px = cx + x * t, py = cy - y * t;
            if (px < -hw || px > w + hw || py < -hh || py > h + hh) return true;
            for (const a of avoid) if (px - hw < a.r && px + hw > a.l && py - hh < a.b && py + hh > a.t) return false;
          }
          return true;
        };
        P.dir.copy(flyDir(P.name, P[explodeKey], clear));
      }
    }
    // the assembled pedals' screen box (the aircraft passes clear of it)
    v.p = 1; v.yaw = 0; apply();
    const e = screenExtents([model.group], stage, camera, w, h);
    const objBox = { l: ox - e.l * 1.05, r: ox + e.r * 1.05, t: oy - e.u * 1.05, b: oy + e.d * 1.05 };
    fitFlight(F, objBox);
    lastLayout = { objBox, free, avoid, w, h };
    parts.forEach((P, i) => { P.f = keep[i]; });
    Object.assign(v, kv);
    apply();
  }
  let lastLayout = null, explodeScale = 1, explodeKey = 'ex0';

  // ============================================================ the motion
  function sample(T, S) {
    const E = S[ENTER], A = S[ASSEMBLE], X = S[ACTION], O = S[EXIT];
    const uIn = win(T, E.t0 - .3, E.t1);
    let fin = 0, fout = 0;
    for (const P of parts) {
      const inn = ease.outQuart(win(uIn, P.delay * 1.3, P.delay * 1.3 + .55));
      // leave in reverse build order: lever arms first, the supports last
      const r = (.34 - P.delay) * 1.4;
      const out = ease.inCubic(win(T, O.t0 + .75 + r, O.t0 + .75 + r + 1.05));
      P.f = (1 - inn) + out;
      fin += inn; fout += out;
    }
    const open = ease.inOutSine(win(T, O.t0 + .2, O.t0 + 1.25));        // opens before the parts leave
    v.p = ease.inOutSine(win(T, A.t0 - .15, A.t1 - .1)) * (1 - open);
    const u = T - X.t0;
    v.drive = T >= X.t0 && T <= X.t1 ? driveAt(u) : 0;
    v.toeL = v.toeR = 0;
    v.yaw = VIEW.drift * (2 * win(T, E.t0, O.t1) - 1);                 // a slow turn across the whole act
    v.fly = u >= FLIGHT.t0 && u <= FLIGHT.t1 ? u - FLIGHT.t0 : -1;
    v.flyOut = 0; v.flyExtra = 0; v.flyFade = 0;
    v.shadow = Math.min(fin / N, 1 - fout / N) * (.35 + .65 * v.p);
    apply();
  }

  // Abort: the pedals center, the parts leave (lever arms first) and the
  // aircraft runs on along its heading, three times faster, off screen.
  const ABORT_S = 1.6;
  function beginAbort() {
    Object.assign(a0, v);
    for (const P of parts) P.f0 = P.f;
  }
  function sampleAbort(u) {
    let fin = 0;
    for (const P of parts) {
      const r = (.34 - P.delay) * .6;
      P.f = lerp(P.f0, Math.max(P.f0, 1.05), ease.inCubic(win(u, r, Math.min(1, r + .7))));
      fin += clamp01(1 - P.f);
    }
    v.p = a0.p * (1 - ease.outCubic(win(u, 0, .45)));
    v.drive = a0.drive * (1 - ease.outCubic(win(u, 0, .35)));
    v.toeL = v.toeR = 0;
    v.yaw = a0.yaw;
    v.fly = a0.fly;
    v.flyExtra = a0.fly >= 0 ? ease.inQuad(u) * ABORT_S * 3 : 0;
    v.flyOut = u >= .999 ? 1 : 0;
    v.flyFade = ease.inCubic(win(u, .45, .999));                       // and climbs away into the distance
    v.shadow = Math.min(a0.shadow, fin / N);
    apply();
  }

  async function prewarm(renderer, camera, scene) {
    const hidden = [];
    for (const P of parts) P.f = 0;
    Object.assign(v, { p: 1, drive: 0, shadow: 1, fly: 1 });
    apply();
    root.traverse(o => { if (!o.visible) { hidden.push(o); o.visible = true; } });
    try { await renderer.compileAsync(root, camera, scene); } catch (e) { /* compiles on first draw instead */ }
    const seen = new Set();
    const upload = t => { if (t && t.isTexture && !seen.has(t)) { seen.add(t); renderer.initTexture(t); } };
    root.traverse(o => { for (const m of [].concat(o.material || [])) for (const k in m) upload(m[k]); });
    for (const o of hidden) o.visible = false;
    reset();
  }
  function reset() { for (const P of parts) P.f = 1; Object.assign(v, REST); apply(); }
  function update() {}

  reset();
  engine.adopt(root);
  return {
    group: root, sequence: SEQUENCE, layout, sample, beginAbort, sampleAbort, abortSeconds: ABORT_S, reset, update, prewarm,
    get visible() { return stage.visible || flight.visible; },
    model, accent: plane, parts, values: v, path, get frame() { return lastLayout; }, get explodeScale() { return explodeScale; }, get explodeKey() { return explodeKey; },
    dispose() { model.dispose(); plane.dispose(); shadow.geometry.dispose(); shadow.material.map.dispose(); shadow.material.dispose(); root.removeFromParent(); },
  };
}

// distance from a point to a rect (0 inside)
function rectDist(r, x, y) {
  const dx = Math.max(r.l - x, 0, x - r.r), dy = Math.max(r.t - y, 0, y - r.b);
  return Math.hypot(dx, dy);
}

// Soft round contact shadow (the same decal index.js uses for Therma-Shift).
function contactShadow(size) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), grd = g.createRadialGradient(64, 64, 8, 64, 64, 62);
  grd.addColorStop(0, 'rgba(0,0,0,1)'); grd.addColorStop(.45, 'rgba(0,0,0,.55)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: tex, color: 0x1a1c20, transparent: true, opacity: 0, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.renderOrder = -1;
  return m;
}
