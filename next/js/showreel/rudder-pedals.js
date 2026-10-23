// Rudder pedals: a showreel project actor (the owner's pedal assembly from CAD
// and a small light aircraft that answers it). Recipe: docs/recipes/showreel-actor.md
//
// The story (about 18 s): the eight CAD part groups fly in from off screen into
// an exploded view and assemble (middle supports, side walls, sensor lever,
// link rods, then each lever arm with its pedal); the springs hook on and the
// sensor wires run to the controller board. The pedals then work right, left,
// right, left through their real travel: each lever arm swings on its top
// pivot bolt, its rear end drives the link rod, the rods rock the sensor lever
// about its center bolt, so one pedal goes forward as the other comes back and
// the centering springs stretch and relax. Then each toe brake is pressed: the
// pedal tips back on its hinge, the brake spring stretches and the pedal's disc
// magnet moves off its Hall sensor. The linkage is solved from the CAD joint
// positions every frame, not keyframed. Behind, a small generic high-wing light
// aircraft (procedural, matte, no markings) flies a real 3D path that comes
// nearer and recedes: it yaws and banks with the pedals a beat later, never
// crosses the focused drift word, the marquee or the pedals. Then the pedals
// center, the assembly opens and the parts leave.
//
//   createModel({ THREE, quality })  -> the CAD assembly (next/assets/3d/rudder-pedals.*,
//     imported by `python3 tools/cad.py import` with tools/cad/maps/rudder-pedals.json)
//     plus the parts the STEP does not carry (createDetails: springs, anchor screws,
//     magnets, Hall sensors, wiring, controller board)
//     group, height, footprint, triangles, getParts(), parts, details, setProgress(p),
//     setDrive(x), setToe(l, r), setGrow(g), refresh()
//   createAccent({ THREE, quality }) -> the light aircraft: group, setProp(angle), setHaze(k), dispose()
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
  ['RUDDER_PEDALS_ACTION', 10.6],   // pedals work right/left, then each toe brake; the aircraft flies behind
  ['RUDDER_PEDALS_EXIT', 2.4],      // pedals centered, the assembly opens, parts leave
];
const [ENTER, ASSEMBLE, ACTION, EXIT] = SEQUENCE.map(s => s[0]);

// Pedal program in ACTION seconds: [time, drive], drive -1 = left pedal fully
// forward (left rudder), +1 = right. Eased between keys (feet push, hold, ease off).
const PROGRAM = [[0, 0], [.55, 0], [1.25, .85], [2.15, .85], [2.95, -1], [4.15, -1], [4.95, .9], [5.9, .9], [6.6, -.45], [7.35, -.45], [8.05, 0]];
// Toe brakes in ACTION seconds: [time, amount] (0 released, 1 full), the left
// pedal first, then the right, each pressed, held and let go.
const TOE_L = [[8.15, 0], [8.6, 1], [9.0, 1], [9.35, 0]];
const TOE_R = [[9.25, 0], [9.7, 1], [10.05, 1], [10.4, 0]];
// Aircraft: in ACTION seconds it enters (off screen) and leaves (off screen),
// how far it lags the pedals, yaw rate per unit drive, bank and rudder yaw. It
// flies between `near` and `far` (world z, behind the pedals at z = 0); its span
// on screen at the nearest point is `spanNear` x the short side (clamped, px).
const FLIGHT = { t0: .15, t1: 9.9, lag: .28, turn: 1.15, bank: .62, yaw: .14, near: -.45, far: -3.1, spanNear: [.13, 52, 100], haze: .42 };
const PAPER = 0xe7e8ea;   // the Studio paper ground (tokens.css --paper): distant aircraft fade toward it

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
const TOE = 16 * Math.PI / 180;   // toe brake travel (the pedal tips back on its hinge bolt)
let PEDAL_REST = .38;               // pedal rest tilt from its CAD pose (solved in createModel: magnet flush with the lever)

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
  // the parts the STEP does not carry (springs, screws, magnets, sensors, wiring, board)
  const baseOf = obj => { const r = list.find(r => r.mesh === obj); if (r) return r.base; return list.find(r => r.mesh === obj.parent).base.clone().add(obj.position); };
  // Right side = mirror of the left (owner): a left-side STEP point attached to a lever
  // or pedal goes to the left lever's neutral pose, mirrors across the center plane
  // about the pivots, and back to the right lever's CAD pose; frame points just mirror.
  const s0 = solve(0), dR0 = s0.d[0], dL0 = s0.d[1];
  const rot = (p, piv, a) => { const x = p[0] - piv[0], y = p[1] - piv[1], c = Math.cos(a), n = Math.sin(a); return [piv[0] + x * c - y * n, piv[1] + x * n + y * c, p[2]]; };
  function mirror(p, kind) {
    if (kind === 'wall') return [p[0], p[1], 2 * DET.zc - p[2]];
    const n = rot(p, CADP.pivL, dL0);
    return rot([n[0] - CADP.pivL[0] + CADP.pivR[0], n[1] - CADP.pivL[1] + CADP.pivR[1], 2 * DET.zc - p[2]], CADP.pivR, -dR0);
  }
  const rzR = dL0 - dR0;                                            // right parts turn this much in their lever's frame
  { // the right pedal turns about the mirror of the left hinge (1.6 mm from its own bore), so its magnet meets its sensor exactly
    const hm = mirror([CADP.hingeL[0], CADP.hingeL[1], CADP.rearL[2]], 'lever'), w = toM(hm[0], hm[1], CADP.rearR[2]), lb = byName.leverR.base;
    m.setPivot(pedalR, [w[0] - lb.x, w[1] - lb.y, w[2] - lb.z]);
  }
  const mirrorDir = d => { const c = Math.cos(rzR), n = Math.sin(rzR); return [d[0] * c - d[1] * n, d[0] * n + d[1] * c, -(d[2] || 0)]; };
  // Pedal rest pose: the pedal tips forward on its hinge until its boss lies on the
  // lever, the magnet's face flush with the lever's inner face (left geometry).
  {
    const g = DET.magnetL, f0 = g.floor.map((v, i) => v + (g.n[i] || 0) * DET.magnet.t), h = CADP.hingeL, e = DET.edgeL;
    const off = a => { const q = rot(f0, h, -a); return q[0] - e.k * q[1] - e.c; };
    let lo = 0, hi = .8;
    for (let k = 0; k < 30; k++) { const mid = (lo + hi) / 2; if (off(mid) < 0) lo = mid; else hi = mid; }
    PEDAL_REST = (lo + hi) / 2;
  }
  const details = createDetails(T, { P, toM, base: baseOf, m, mirror, mirrorDir, rzR });
  let toeL = 0, toeR = 0, drive = 0, gS = 1, gW = 1, lastKey = '';
  function refresh() {
    const key = `${drive.toFixed(5)},${toeL.toFixed(5)},${toeR.toFixed(5)},${prog.toFixed(5)},${gS.toFixed(4)},${gW.toFixed(4)}`;
    if (key === lastKey) return;
    lastKey = key;
    details.setGrow(gS, gW);
    details.update();
  }
  function setDrive(x) {
    drive = Math.max(-1, Math.min(1, x));
    const s = solve(-drive * PHI);
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
  // toe brakes: from rest (boss on the lever, magnet flush) each pedal tips back about its hinge bolt (0..1)
  const toeTravel = Math.min(TOE, PEDAL_REST);
  function setToe(l, r) { toeL = clamp01(l); toeR = clamp01(r); pedalL.rotation.z = -PEDAL_REST + toeTravel * toeL; pedalR.rotation.z = -PEDAL_REST + toeTravel * toeR; }
  // springs hook on and wires run to the board: 0 none, 1 all (springs, wires may differ)
  function setGrow(s, w = s) { gS = s; gW = w; }
  setDrive(0); setToe(0, 0); setProgress(1); refresh();
  const size = new T.Vector3(); new T.Box3().setFromObject(m.group).getSize(size);
  return {
    group: m.group, height: size.y, footprint: Math.max(size.x, size.z), triangles: m.triangles + details.triangles,
    cadTriangles: m.triangles, parts: P, materials: m.materials, details, toM, mirror,
    // a STEP point (mm, CAD pose) in the local space of a part or pedal (labels, review page)
    localOf(obj, cad) { const w = toM(...cad), b = baseOf(obj); return new T.Vector3(w[0] - b.x, w[1] - b.y, w[2] - b.z); },
    getParts: () => list.map(({ name, mesh, explode }) => ({ name, mesh, explode, delay: PARTS[name].delay })),
    setProgress, setDrive, setToe, setGrow, refresh, solve,
    update() {},
    dispose() { details.dispose(); m.dispose(); },
  };
}

// ================================================================= details
// Parts the STEP does not carry, placed from its geometry (STEP mm, CAD pose of
// each lever). The left side is the reference (owner, round 1): every added
// part on the right is the mirror of the left across the assembly's center
// plane (mirror() in createModel), except the two brake spring hooks, which
// stay on the right side's own CAD screw and clevis pin. Assumptions are
// listed on the review page (next/lab/rudder-pedals-review.html).
//   centering springs  each lever's rear (the 6 mm hole under its top bar, right
//                      above the adjustment holes) to a screw in the wall's column
//                      of nine M3 holes (x 571.6, y 105.8 to 153.8, 6 mm apart)
//   anchor screws      M3 x 20 socket heads in the middle hole of each column
//   brake springs      the existing screw at the top of each lever's vertical side
//                      to the pin through the pedal's clevis
//   pedal magnets      10 x 3 mm discs in the round pockets of the pedal bosses;
//                      at rest the boss lies on the lever, magnet face flush with
//                      the lever's inner face where the sensor slit is
//   Hall sensors       A1301 (TO-92) at the bottom of the left lever's slit
//   center sensor      two discs in the round slots under the flaps of the
//                      sensor lever's magnet holder, a third A1301 between them
//                      on the fixed frame (legs in the back support's pocket)
//   wiring             three wires per sensor (red, black, signal): up the slit,
//                      out through the notch, down the lever, a slack loop into
//                      the wall's inner slot, then inside the frame to the board
//   controller board   an ESP board on a 50 x 34 perfboard, inside the frame on
//                      the back face of the front middle support
const DET = {
  zc: 1264.55,                                                      // the assembly's center plane (between the walls)
  hole: { x: 571.6, y0: 105.8, step: 6, n: 9, k: 4 },
  screwL: { head: 1337.5, tip: 1314.5, hook: 1331.0 },
  springTopL: [562.3, 231.0, 1334.5],
  brake: { L: { hook: [644.5, 211.4, 1345.3], pin: [607.7, 171.7, 1343.5] }, R: { hook: [647.2, 209.6, 1183.7], pin: [613.6, 166.6, 1185.6] } },
  magnetL: { floor: [633.1, 131.7, 1333.5], n: [.95, .32, 0] }, magnet: { d: 10, t: 3 },
  edgeL: { k: .0445, c: 638.11 },                                   // left lever's inner face (slit side): x - k y = c
  sensorL: [645.8, 138.3, 1334.5],
  center: { magnets: [{ floor: [586.1, 91.3, 1252.9], n: [0, -.65, .76] }, { floor: [586.1, 93.2, 1277.9], n: [0, -.76, -.65] }], sensor: [586.1, 80.6, 1264.5] },
  board: { x: 664.2, standoff: 4, t: 1.6, z0: 1239.5, z1: 1289.5, y0: 112, y1: 146, connY: 116.5, conn: [1252.1, 1264.5, 1277.0] },
  wires: {
    L: { lever: [[645.8, 153.6, 1334.5], [646.4, 166, 1334.5], [647.2, 173.5, 1337.5], [647.6, 173.5, 1345.4], [648.2, 160, 1345.7], [647.6, 125, 1345.7], [645.6, 103.5, 1345.9]],
         fixed: [[634.6, 86, 1325.4], [634.6, 86, 1310], [634.6, 86.4, 1293.6], [640.5, 95, 1287.5], [645.5, 107, 1281.5], [646.2, 116.5, 1277.6], [650.4, 116.5, 1277.0]], slack: 1.3, out: 1, color: 0xd8a21b },
    C: { fixed: [[569.8, 80.6, 1264.5], [563.2, 81.0, 1264.0], [563.2, 81.2, 1249], [569.5, 82, 1244.2], [584, 77, 1243.5], [612, 74, 1248], [638, 92, 1257], [645.8, 110, 1263.2], [646.2, 116.5, 1264.4], [650.4, 116.5, 1264.5]], color: 0x2c6fb7 },
    R: { color: 0x2f8a4a },                                         // the mirror of L
  },
};
const DLOOK = {
  spring: { color: 0x8f959d, roughness: .36, metalness: .85 },
  magnet: { color: 0xc6c9ce, roughness: .34, metalness: .8 },
  parts: { color: 0xffffff, roughness: .5, metalness: .25, vertexColors: true },
  wire: { color: 0xffffff, roughness: .55, metalness: 0, vertexColors: true },
  board: { color: 0xffffff, roughness: .62, metalness: 0 },
};
const C = { black: 0x18191c, tin: 0xb9bdc3, darkMetal: 0x2c2e33, espBlack: 0x202226, chip: 0x141518, silver: 0xc9ccd1, gold: 0xb8954a, green: 0x2f5a46, red: 0xb3261e, wireBlack: 0x1f2023 };

function createDetails(T, { P, toM, base, m, mirror, mirrorDir, rzR }) {
  const mm = v => v / 1000;
  const V = (a) => new T.Vector3(...a);
  const local = (obj, cad) => { const w = toM(...cad); const b = base(obj); return new T.Vector3(w[0] - b.x, w[1] - b.y, w[2] - b.z); };
  const groups = {}, geos = [], mats = {}, labels = [];
  const mat = (k) => mats[k] || (mats[k] = new T.MeshStandardMaterial({ ...DLOOK[k], side: T.DoubleSide }));
  const group = name => (groups[name] = groups[name] || Object.assign(new T.Group(), { name: 'detail:' + name }));
  let tris = 0;
  // ---- small merged parts with vertex colors, one mesh per parent
  function bake(list) {
    const flat = list.map(({ g, color }) => { const n = g.index ? g.toNonIndexed() : g; if (n.attributes.uv) n.deleteAttribute('uv'); n.userData.color = color; return n; });
    const count = flat.reduce((s, g) => s + g.attributes.position.count, 0);
    const pos = new Float32Array(count * 3), nrm = new Float32Array(count * 3), col = new Float32Array(count * 3), c = new T.Color();
    let o = 0;
    for (const g of flat) {
      pos.set(g.attributes.position.array, o * 3); nrm.set(g.attributes.normal.array, o * 3);
      c.setHex(g.userData.color, T.SRGBColorSpace);
      for (let i = 0; i < g.attributes.position.count; i++) col.set([c.r, c.g, c.b], (o + i) * 3);
      o += g.attributes.position.count;
    }
    for (const { g } of list) g.dispose();
    const out = new T.BufferGeometry();
    out.setAttribute('position', new T.BufferAttribute(pos, 3));
    out.setAttribute('normal', new T.BufferAttribute(nrm, 3));
    out.setAttribute('color', new T.BufferAttribute(col, 3));
    out.computeBoundingSphere();
    geos.push(out); tris += count / 3;
    return out;
  }
  const o3 = new T.Object3D(), Y = new T.Vector3(0, 1, 0);
  // geometry placed at `at` (meters, parent space) with its +Y along `dir`
  const Zax = new T.Vector3(0, 0, 1);
  function put(g, at, dir = null, spin = 0, rz = 0) {
    o3.position.copy(at); o3.quaternion.identity();
    if (dir) o3.quaternion.setFromUnitVectors(Y, dir.clone().normalize());
    if (spin) o3.quaternion.multiply(new T.Quaternion().setFromAxisAngle(Y, spin));
    if (rz) o3.quaternion.premultiply(new T.Quaternion().setFromAxisAngle(Zax, rz));
    o3.scale.set(1, 1, 1); o3.updateMatrix();
    return g.applyMatrix4(o3.matrix);
  }
  const box = (w, h, d) => new T.BoxGeometry(mm(w), mm(h), mm(d));
  const cyl = (r, h, s = 12) => new T.CylinderGeometry(mm(r), mm(r), mm(h), s, 1);
  function addMesh(parent, list, key, groupName, name) {
    const mesh = new T.Mesh(bake(list), mat(key));
    mesh.name = name; mesh.userData.detail = groupName;
    const g = group(groupName); if (!g.parent) m.group.add(g);
    parent.add(mesh); (g.userData.meshes = g.userData.meshes || []).push(mesh);
    return mesh;
  }

  const side = S => (S === 'L' ? 'left' : 'right');
  const pedal = { R: P.leverR.getObjectByName('pedalR'), L: P.leverL.getObjectByName('pedalL') };
  // a left-side STEP point, and its mirror for the right side
  const pick = (S, cadL, kind) => (S === 'L' ? cadL : mirror(cadL, kind));

  // ---- anchor screws in the adjustment holes (parent: the side walls)
  const holeY = DET.hole.y0 + DET.hole.step * DET.hole.k;
  for (const S of ['R', 'L']) {
    const wall = P['wall' + S], d = DET.screwL;
    const headTop = local(wall, pick(S, [DET.hole.x, holeY, d.head], 'wall')), tip = local(wall, pick(S, [DET.hole.x, holeY, d.tip], 'wall'));
    const axis = headTop.clone().sub(tip).normalize();
    const L = headTop.distanceTo(tip);
    const list = [
      { g: put(cyl(1.5, (L - mm(3)) * 1000, 10), tip.clone().addScaledVector(axis, (L - mm(3)) / 2), axis), color: C.darkMetal },
      { g: put(cyl(2.75, 3, 14), headTop.clone().addScaledVector(axis, -mm(1.5)), axis), color: C.darkMetal },
    ];
    addMesh(wall, list, 'parts', 'screws', 'anchorScrew' + S);
    labels.push({ group: 'screws', name: `Anchor screw (${side(S)})`, note: `M3 x 20 in adjustment hole ${DET.hole.k + 1} of ${DET.hole.n}${S === 'R' ? ', mirrored from the left' : ''}`, obj: wall, at: headTop.clone() });
  }

  // ---- pedal magnets in the round pockets (parent: the pedal subs)
  const magFace = (S) => { const g = DET.magnetL, c = g.floor.map((v, i) => v + (g.n[i] || 0) * DET.magnet.t / 2); return pick(S, c, 'lever'); };
  for (const S of ['R', 'L']) {
    const ped = pedal[S], at = local(ped, magFace(S)), n = S === 'L' ? V(DET.magnetL.n) : V(mirrorDir(DET.magnetL.n));
    const mesh = new T.Mesh(put(cyl(DET.magnet.d / 2, DET.magnet.t, 20), at, n), mat('magnet'));
    geos.push(mesh.geometry); tris += 80;
    mesh.name = 'magnet' + S; mesh.userData.detail = 'magnets';
    ped.add(mesh); (group('magnets').userData.meshes = group('magnets').userData.meshes || []).push(mesh);
    labels.push({ group: 'magnets', name: `Disc magnet (${side(S)} pedal)`, note: `10 x 3 mm, nickel plated; at rest its face is flush with the lever${S === 'R' ? ' (mirrored from the left)' : ''}`, obj: ped, at });
  }
  if (!groups.magnets.parent) m.group.add(groups.magnets);

  // ---- Hall sensors (TO-92 UA: 4.0 x 3.0 x 1.52, legs 15 mm), face toward the magnet, legs up the slit (parent: the levers)
  const hall = (c, rz, face, legs, list) => {
    // face: unit vector the flat face points along; legs: unit vector the legs run along (both in parent space)
    const q = new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(face, legs, new T.Vector3().crossVectors(face, legs)));
    const add = (g, off) => { g.applyQuaternion(q); g.translate(...off.clone().applyQuaternion(q).add(c).toArray()); if (rz) { g.translate(-c.x, -c.y, -c.z); g.applyMatrix4(new T.Matrix4().makeRotationZ(rz)); g.translate(c.x, c.y, c.z); } return g; };
    list.push({ g: add(box(1.52, 3.0, 4.0), new T.Vector3()), color: C.black });
    for (const dz of [-1.27, 0, 1.27]) list.push({ g: add(box(.42, 15, .42), new T.Vector3(-mm(.2), mm(1.5 + 7.5), mm(dz))), color: C.tin });
  };
  for (const S of ['R', 'L']) {
    const lever = P['lever' + S], c = local(lever, pick(S, DET.sensorL, 'lever')), list = [];
    hall(c, S === 'R' ? rzR : 0, new T.Vector3(-1, 0, 0), new T.Vector3(0, 1, 0), list);
    addMesh(lever, list, 'parts', 'sensors', 'sensor' + S);
    labels.push({ group: 'sensors', name: `Hall sensor (${side(S)} lever)`, note: S === 'L' ? 'A1301 at the bottom of the slit, facing the magnet' : 'A1301, mirrored from the left (this lever version has no slit)', obj: lever, at: c.clone() });
  }

  // ---- center (rudder) sensor: two discs in the holder's round slots (parent: the sensor lever) and a third A1301 between them (parent: the frame)
  {
    const list = [];
    for (const g of DET.center.magnets) {
      const c = g.floor.map((v, i) => v + g.n[i] * DET.magnet.t / 2);
      const mesh = new T.Mesh(put(cyl(DET.magnet.d / 2, DET.magnet.t, 20), local(P.rocker, c), V(g.n)), mat('magnet'));
      geos.push(mesh.geometry); tris += 80;
      mesh.name = 'centerMagnet'; mesh.userData.detail = 'magnets';
      P.rocker.add(mesh); groups.magnets.userData.meshes.push(mesh);
    }
    labels.push({ group: 'magnets', name: 'Center magnets', note: 'two 10 x 3 mm discs in the round slots under the holder\'s flaps; they turn with the sensor lever', obj: P.rocker, at: local(P.rocker, [586.1, 88.0, 1264.5]) });
    const c = local(P.core, DET.center.sensor);
    hall(c, 0, new T.Vector3(0, 1, 0), new T.Vector3(-1, 0, 0), list);   // face up toward the hub, legs back into the support's pocket
    addMesh(P.core, list, 'parts', 'sensors', 'sensorCenter');
    labels.push({ group: 'sensors', name: 'Center Hall sensor', note: 'A1301 between the two center magnets, on the frame; reads the rudder axis', obj: P.core, at: c.clone() });
  }

  // ---- controller board inside the frame, on the back face of the front middle support (parent: the frame)
  {
    const b = DET.board, xBack = b.x - b.standoff, xFace = xBack - b.t;     // the board faces -x (toward the back)
    const cy = (b.y0 + b.y1) / 2, cz = (b.z0 + b.z1) / 2;
    const at = (x, y, z) => local(P.core, [x, y, z]);
    const list = [{ g: put(box(b.t, b.y1 - b.y0, b.z1 - b.z0), at(xFace + b.t / 2, cy, cz)), color: C.green }];
    for (const [y, z] of [[b.y0 + 3, b.z0 + 3], [b.y1 - 3, b.z0 + 3], [b.y0 + 3, b.z1 - 3], [b.y1 - 3, b.z1 - 3]]) {
      list.push({ g: put(cyl(2.2, b.standoff, 6), at(xBack + b.standoff / 2, y, z), new T.Vector3(1, 0, 0)), color: C.tin });
      list.push({ g: put(cyl(2.4, 1.6, 10), at(xFace - .8, y, z), new T.Vector3(1, 0, 0)), color: C.darkMetal });
    }
    // ESP board on two header strips: dark board, shielded module, antenna end, USB-C
    const ex = xFace - 2.5, ey = cy + 4, ez = cz - 1;
    list.push({ g: put(box(2.5, 2.5, 25), at(xFace - 1.25, ey - 7.62, ez)), color: C.black });
    list.push({ g: put(box(2.5, 2.5, 25), at(xFace - 1.25, ey + 7.62, ez)), color: C.black });
    list.push({ g: put(box(1.2, 20, 34), at(ex - .6, ey, ez)), color: C.espBlack });
    list.push({ g: put(box(2.2, 13, 15), at(ex - 2.3, ey, ez + 6)), color: C.silver });
    list.push({ g: put(box(.3, 13, 6), at(ex - 1.35, ey, ez + 16)), color: 0x3a3d43 });
    list.push({ g: put(box(3.2, 8.9, 7.3), at(ex - 2.8, ey, ez - 15.5)), color: C.silver });
    list.push({ g: put(box(1, 4, 4), at(ex - 1.7, ey - 4, ez - 6)), color: C.chip });
    for (let i = 0; i < 10; i++) for (const sy of [-7.62, 7.62]) list.push({ g: put(box(.9, .9, .9), at(ex - 1.65, ey + sy, ez - 11.4 + i * 2.54)), color: C.gold });
    // three sensor connectors (left, center, right) on the lower edge
    for (const z of b.conn) {
      list.push({ g: put(box(8, 2.54, 7.62), at(xFace - 4, b.connY, z)), color: C.black });
      for (const dz of [-2.54, 0, 2.54]) list.push({ g: put(box(2.6, .64, .64), at(xFace - 1.3, b.connY, z + dz)), color: C.gold });
    }
    addMesh(P.core, list, 'parts', 'board', 'boardBody');
    // perfboard face: tinned pads on a 2.54 mm grid
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 176;
    const g2 = cv.getContext('2d'); g2.fillStyle = '#2f5a46'; g2.fillRect(0, 0, 256, 176);
    const sx = 256 / (b.z1 - b.z0), sy = 176 / (b.y1 - b.y0);
    g2.fillStyle = '#b9b49d';
    for (let x = 2.5; x < b.z1 - b.z0; x += 2.54) for (let y = 2.5; y < b.y1 - b.y0; y += 2.54) { g2.beginPath(); g2.arc(x * sx, y * sy, 3.1, 0, 7); g2.fill(); }
    g2.fillStyle = '#1d2a24';
    for (let x = 2.5; x < b.z1 - b.z0; x += 2.54) for (let y = 2.5; y < b.y1 - b.y0; y += 2.54) { g2.beginPath(); g2.arc(x * sx, y * sy, 1.2, 0, 7); g2.fill(); }
    const tex = new T.CanvasTexture(cv); tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 4;
    const topMat = new T.MeshStandardMaterial({ ...DLOOK.board, map: tex });
    mats.boardTop = topMat;
    const top = new T.Mesh(new T.PlaneGeometry(mm(b.z1 - b.z0), mm(b.y1 - b.y0)), topMat);
    top.rotation.y = -Math.PI / 2;                                    // faces -x
    top.position.copy(at(xFace - .02, cy, cz)); top.name = 'boardTop'; top.userData.detail = 'board';
    geos.push(top.geometry); tris += 2;
    P.core.add(top); groups.board.userData.meshes.push(top);
    labels.push({ group: 'board', name: 'ESP controller board', note: 'on a 50 x 34 perfboard, inside the frame on the back of the front support', obj: P.core, at: at(ex - 3.5, ey, ez + 6) });
    labels.push({ group: 'board', name: 'Sensor connectors', note: 'one 3-pin connector each: left pedal, center, right pedal', obj: P.core, at: at(xFace - 8, b.connY, cz) });
  }

  // ---- springs: one dynamic tube geometry for all four
  const SPRINGS = [
    { key: 'centerR', a: { obj: P.leverR, p: local(P.leverR, mirror(DET.springTopL, 'lever')) }, b: { obj: P.wallR, p: local(P.wallR, mirror([DET.hole.x, holeY, DET.screwL.hook], 'wall')) }, coils: 24, R: 3.6, r: .55, name: 'Centering spring (right)' },
    { key: 'centerL', a: { obj: P.leverL, p: local(P.leverL, DET.springTopL) }, b: { obj: P.wallL, p: local(P.wallL, [DET.hole.x, holeY, DET.screwL.hook]) }, coils: 24, R: 3.6, r: .55, name: 'Centering spring (left)' },
    { key: 'brakeR', a: { obj: P.leverR, p: local(P.leverR, DET.brake.R.hook) }, b: { obj: pedal.R, p: local(pedal.R, DET.brake.R.pin) }, coils: 13, R: 2.5, r: .45, name: 'Brake spring (right)' },
    { key: 'brakeL', a: { obj: P.leverL, p: local(P.leverL, DET.brake.L.hook) }, b: { obj: pedal.L, p: local(pedal.L, DET.brake.L.pin) }, coils: 13, R: 2.5, r: .45, name: 'Brake spring (left)' },
  ];
  const PER = 8, RAD = 4;
  let nv = 0, ni = 0;
  for (const s of SPRINGS) { s.M = s.coils * PER + 1; s.v0 = nv; nv += s.M * RAD; ni += (s.M - 1) * RAD * 6; }
  const sg = new T.BufferGeometry();
  const sPos = new T.BufferAttribute(new Float32Array(nv * 3), 3).setUsage(T.DynamicDrawUsage);
  const sNrm = new T.BufferAttribute(new Float32Array(nv * 3), 3).setUsage(T.DynamicDrawUsage);
  const sIdx = new Uint32Array(ni);
  { let k = 0; for (const s of SPRINGS) for (let i = 0; i < s.M - 1; i++) for (let j = 0; j < RAD; j++) {
    const a = s.v0 + i * RAD + j, b = s.v0 + i * RAD + (j + 1) % RAD, c = a + RAD, d = b + RAD;
    sIdx.set([a, c, b, b, c, d], k); k += 6;
  } }
  sg.setAttribute('position', sPos); sg.setAttribute('normal', sNrm); sg.setIndex(new T.BufferAttribute(sIdx, 1));
  const springMesh = new T.Mesh(sg, mat('spring')); springMesh.name = 'springs'; springMesh.frustumCulled = false;
  group('springs').add(springMesh); m.group.add(groups.springs);
  geos.push(sg); tris += ni / 3;
  for (const s of SPRINGS) labels.push({ group: 'springs', name: s.name, note: s.key.startsWith('center') ? '24 coils, 8.3 mm outside, hooked on the anchor screw' : '13 coils, 5.9 mm outside, from the lever's top screw to the pedal clevis pin', spring: s });

  // ---- wires: one dynamic tube geometry, vertex colors, three per sensor
  const WR = [];
  for (const S of ['L', 'R', 'C']) {
    const w = DET.wires[S], src = S === 'R' ? DET.wires.L : w, lever = S === 'C' ? null : P['lever' + S];
    const lp = S === 'C' ? [] : src.lever.map(c => local(lever, pick(S, c, 'lever')));
    const fixed = src.fixed.map(c => V(toM(...(S === 'R' ? mirror(c, 'wall') : c))));
    const loop = S === 'C' ? 0 : 5;
    const ctrl = lp.length + loop + fixed.length;                    // control points: lever, slack loop, fixed
    const SEG = 5, M = (ctrl - 1) * SEG + 1;
    const pts = Array.from({ length: ctrl }, () => new T.Vector3());
    WR.push({ S, lever, lp, loop, fixed, ctrl, SEG, M, pts, slack: src.slack, out: S === 'R' ? -1 : src.out, colors: [C.red, C.wireBlack, w.color], len: 0 });
  }
  const WRAD = 3;
  let wv = 0, wi = 0;
  for (const r of WR) { r.v0 = wv; wv += r.M * WRAD * 3; wi += (r.M - 1) * WRAD * 6 * 3; }
  const wg = new T.BufferGeometry();
  const wPos = new T.BufferAttribute(new Float32Array(wv * 3), 3).setUsage(T.DynamicDrawUsage);
  const wNrm = new T.BufferAttribute(new Float32Array(wv * 3), 3).setUsage(T.DynamicDrawUsage);
  const wCol = new Float32Array(wv * 3), wIdx = new Uint32Array(wi);
  { let k = 0; const c = new T.Color();
    for (const r of WR) for (let wj = 0; wj < 3; wj++) {
      const v0 = r.v0 + wj * r.M * WRAD;
      c.setHex(r.colors[wj], T.SRGBColorSpace);
      for (let i = 0; i < r.M * WRAD; i++) wCol.set([c.r, c.g, c.b], (v0 + i) * 3);
      for (let i = 0; i < r.M - 1; i++) for (let j = 0; j < WRAD; j++) {
        const a = v0 + i * WRAD + j, b = v0 + i * WRAD + (j + 1) % WRAD;
        wIdx.set([a, a + WRAD, b, b, a + WRAD, b + WRAD], k); k += 6;
      }
    } }
  wg.setAttribute('position', wPos); wg.setAttribute('normal', wNrm); wg.setAttribute('color', new T.BufferAttribute(wCol, 3)); wg.setIndex(new T.BufferAttribute(wIdx, 1));
  const wireMesh = new T.Mesh(wg, mat('wire')); wireMesh.name = 'wires'; wireMesh.frustumCulled = false;
  group('wiring').add(wireMesh); m.group.add(groups.wiring);
  geos.push(wg); tris += wi / 3;
  labels.push({ group: 'wiring', name: 'Left sensor wires', note: 'red, black, yellow signal; slack loop into the wall slot, then inside to the board', wire: WR[0], frac: .55 });
  labels.push({ group: 'wiring', name: 'Right sensor wires', note: 'red, black, green signal; the mirror of the left run', wire: WR[1], frac: .55 });
  labels.push({ group: 'wiring', name: 'Center sensor wires', note: 'red, black, blue signal; along the back support pocket and under the holder to the board', wire: WR[2], frac: .5 });

  // ---- updates (model space): springs and wires follow their anchors
  const inv = new T.Matrix4(), A = new T.Vector3(), B = new T.Vector3(), ax = new T.Vector3(), u = new T.Vector3(), wv3 = new T.Vector3(), p = new T.Vector3(), t = new T.Vector3(), n1 = new T.Vector3(), n2 = new T.Vector3(), q = new T.Vector3(), tmp = new T.Vector3();
  const toModel = (obj, lp, out) => out.copy(lp).applyMatrix4(obj.matrixWorld).applyMatrix4(inv);
  const center = [];   // scratch centerline
  function tube(attrPos, attrNrm, v0, line, M, rad, radial, frame) {
    // frame: 'axis' (springs, normals square to the spring axis) or 'transport' (wires)
    for (let i = 0; i < M; i++) {
      const a = line[Math.max(0, i - 1)], b = line[Math.min(M - 1, i + 1)];
      t.subVectors(b, a); if (t.lengthSq() < 1e-14) t.copy(ax); t.normalize();
      if (frame === 'axis') { n1.crossVectors(t, ax); if (n1.lengthSq() < 1e-6) n1.copy(u); n1.normalize(); }
      else { if (i === 0) { n1.crossVectors(t, tmp.set(0, 0, 1)); if (n1.lengthSq() < 1e-4) n1.crossVectors(t, tmp.set(0, 1, 0)); } n1.addScaledVector(t, -n1.dot(t)).normalize(); }
      n2.crossVectors(t, n1).normalize();
      const c = line[i];
      for (let j = 0; j < radial; j++) {
        const ang = j / radial * Math.PI * 2, cs = Math.cos(ang), sn = Math.sin(ang);
        q.copy(n1).multiplyScalar(cs).addScaledVector(n2, sn);
        const k = v0 + i * radial + j;
        attrNrm.setXYZ(k, q.x, q.y, q.z);
        attrPos.setXYZ(k, c.x + q.x * rad, c.y + q.y * rad, c.z + q.z * rad);
      }
    }
  }
  const sLine = [];
  function updateSprings(grow) {
    for (const s of SPRINGS) {
      toModel(s.a.obj, s.a.p, A); toModel(s.b.obj, s.b.p, B);
      ax.subVectors(B, A); const L = ax.length(); ax.normalize();
      u.crossVectors(ax, Math.abs(ax.z) < .9 ? tmp.set(0, 0, 1) : tmp.set(1, 0, 0)).normalize(); wv3.crossVectors(ax, u);
      const R = mm(s.R), taper = .5 / s.coils, gl = Math.max(1e-4, grow);
      for (let i = 0; i < s.M; i++) {
        const sp = Math.min(i / (s.M - 1), gl), th = sp * s.coils * Math.PI * 2;
        const rr = R * ease.inOutSine(clamp01(Math.min(sp, 1 - sp) / taper));
        (sLine[i] = sLine[i] || new T.Vector3()).copy(A).addScaledVector(ax, L * sp).addScaledVector(u, rr * Math.cos(th)).addScaledVector(wv3, rr * Math.sin(th));
      }
      s.length = L;
      tube(sPos, sNrm, s.v0, sLine, s.M, mm(s.r), RAD, 'axis');
    }
    sPos.needsUpdate = sNrm.needsUpdate = true;
  }
  const wLine = [], off = [];
  function catmull(P0, P1, P2, P3, tt, out) {
    const t2 = tt * tt, t3 = t2 * tt;
    return out.set(
      .5 * (2 * P1.x + (-P0.x + P2.x) * tt + (2 * P0.x - 5 * P1.x + 4 * P2.x - P3.x) * t2 + (-P0.x + 3 * P1.x - 3 * P2.x + P3.x) * t3),
      .5 * (2 * P1.y + (-P0.y + P2.y) * tt + (2 * P0.y - 5 * P1.y + 4 * P2.y - P3.y) * t2 + (-P0.y + 3 * P1.y - 3 * P2.y + P3.y) * t3),
      .5 * (2 * P1.z + (-P0.z + P2.z) * tt + (2 * P0.z - 5 * P1.z + 4 * P2.z - P3.z) * t2 + (-P0.z + 3 * P1.z - 3 * P2.z + P3.z) * t3));
  }
  const g = new T.Vector3(0, -1, 0), chord = new T.Vector3(), bulge = new T.Vector3();
  function updateWires(grow) {
    for (const r of WR) {
      let k = 0;
      for (const lp of r.lp) toModel(r.lever, lp, r.pts[k++]);
      if (r.loop) {   // the slack loop between the moving lever and the frame keeps its length
        const E = r.pts[k - 1], F = r.fixed[0];
        chord.subVectors(F, E); const Lc = chord.length(); chord.normalize();
        if (!r.len) r.len = Lc * r.slack;
        const sag = Math.sqrt(Math.max(0, 3 * Lc * (r.len - Lc) / 8));
        bulge.copy(g).addScaledVector(chord, -g.dot(chord)).addScaledVector(tmp.set(0, 0, r.out), .8);
        bulge.addScaledVector(chord, -bulge.dot(chord)).normalize();
        for (let j = 1; j <= r.loop; j++) { const tt = j / (r.loop + 1); r.pts[k++].copy(E).addScaledVector(chord, Lc * tt).addScaledVector(bulge, 4 * sag * tt * (1 - tt)); }
      }
      for (const f of r.fixed) r.pts[k++].copy(f);
      // smooth through the control points
      let i = 0;
      for (let c = 0; c < r.ctrl - 1; c++) for (let s2 = 0; s2 < r.SEG; s2++) catmull(r.pts[Math.max(0, c - 1)], r.pts[c], r.pts[c + 1], r.pts[Math.min(r.ctrl - 1, c + 2)], s2 / r.SEG, (wLine[i] = wLine[i] || new T.Vector3())), i++;
      (wLine[i] = wLine[i] || new T.Vector3()).copy(r.pts[r.ctrl - 1]);
      // grow from the sensor toward the board: points past `grow` collapse onto the last grown one
      const last = Math.max(0, Math.floor(grow * (r.M - 1)));
      for (let j = last + 1; j < r.M; j++) wLine[j].copy(wLine[last]);
      // three wires side by side, offset along a transported frame
      for (let wj = 0; wj < 3; wj++) {
        const d = (wj - 1) * mm(1.15);
        n1.set(0, 0, 0);
        for (let j = 0; j < r.M; j++) {
          const a = wLine[Math.max(0, j - 1)], b = wLine[Math.min(r.M - 1, j + 1)];
          t.subVectors(b, a); if (t.lengthSq() < 1e-14) t.set(0, 1, 0); t.normalize();
          if (j === 0) { n1.crossVectors(t, tmp.set(0, 0, 1)); if (n1.lengthSq() < 1e-4) n1.crossVectors(t, tmp.set(1, 0, 0)); }
          n1.addScaledVector(t, -n1.dot(t)); if (n1.lengthSq() < 1e-10) n1.set(1, 0, 0); n1.normalize();
          (off[j] = off[j] || new T.Vector3()).copy(wLine[j]).addScaledVector(n1, d);
        }
        tube(wPos, wNrm, r.v0 + wj * r.M * WRAD, off, r.M, mm(.45), WRAD, 'transport');
      }
    }
    wPos.needsUpdate = wNrm.needsUpdate = true;
  }
  let growS = 1, growW = 1;
  const shown = { springs: true, wiring: true, screws: true, magnets: true, sensors: true, board: true };
  function update() {
    m.group.updateMatrixWorld(true);
    inv.copy(m.group.matrixWorld).invert();
    groups.springs.visible = shown.springs && growS > .001; groups.wiring.visible = shown.wiring && growW > .001;
    if (groups.springs.visible) updateSprings(growS);
    if (groups.wiring.visible) updateWires(growW);
  }
  // a label's anchor in model space
  function labelPoint(L, out) {
    m.group.updateMatrixWorld(true); inv.copy(m.group.matrixWorld).invert();
    if (L.spring) { toModel(L.spring.a.obj, L.spring.a.p, A); toModel(L.spring.b.obj, L.spring.b.p, B); return out.copy(A).lerp(B, .5); }
    if (L.wire) { const r = L.wire; return out.copy(r.pts[Math.floor(r.ctrl * L.frac)] || r.pts[0]); }
    return toModel(L.obj, L.at, out);
  }
  return {
    groups, labels, labelPoint, update, springs: SPRINGS, wires: WR,
    setGrow(s, w = s) { growS = clamp01(s); growW = clamp01(w); },
    get triangles() { return Math.round(tris); },
    show(name, on) { const g = groups[name]; if (!g) return; shown[name] = on; g.visible = on; for (const mesh of g.userData.meshes || []) mesh.visible = on; },
    dispose() { for (const x of geos) x.dispose(); for (const k in mats) { if (mats[k].map) mats[k].map.dispose(); mats[k].dispose(); } },
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
  // distance haze: the colors fade toward the paper ground (no fog, no transparency)
  const baseCol = mats.slice(0, 3).map(m => m.color.clone()), paper = new T.Color(PAPER);
  let lastHaze = -1;
  return {
    group, span: 1.08,
    setProp(a) { blade.rotation.z = a; },
    setHaze(k) {
      if (Math.abs(k - lastHaze) < .004) return;
      lastHaze = k;
      mats.slice(0, 3).forEach((m, i) => m.color.copy(baseCol[i]).lerp(paper, k));
      discMat.opacity = .14 * (1 - k);
    },
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

// eased key interpolation at time u: keys [[t, v], ...] (pure)
function keyed(K, u) {
  if (u <= K[0][0]) return K[0][1];
  for (let i = 1; i < K.length; i++) {
    const [t1, v1] = K[i], [t0, v0] = K[i - 1];
    if (u < t1) return lerp(v0, v1, ease.inOutSine((u - t0) / (t1 - t0)));
  }
  return K[K.length - 1][1];
}
const driveAt = u => keyed(PROGRAM, u);   // pedal drive at ACTION time u
// the mechanism's pose at ACTION time u (review page "play motion")
export const ACTION_SECONDS = SEQUENCE[2][1];
export function actionPose(u) { return { drive: driveAt(u), toeL: keyed(TOE_L, u), toeR: keyed(TOE_R, u) }; }

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

  const REST = { p: 0, drive: 0, toeL: 0, toeR: 0, growS: 0, growW: 0, shadow: 0, yaw: 0, fly: -1, flyExtra: 0, flyOut: 0, flyFade: 0 };
  const v = { ...REST }, a0 = { ...REST };
  let dist = 2;
  const q = new THREE.Quaternion(), tmp = new THREE.Vector3(), piv = new THREE.Vector3();

  // ---- the flight path: a real 3D path behind the pedals, fitted per layout.
  // Its shape is the pedal program integrated once (heading rate = -turn x
  // drive, a beat later) in the horizontal plane; a candidate places it in the
  // scene: travel direction (a rotation keeps every turn's sense), speed, the
  // depth and height where it enters off one side. It must enter and leave off
  // screen, stay between `near` and `far`, between the top bar and the marquee,
  // and never touch the focused word. It is always deeper than the pedals, so
  // it can only pass behind them (kept short). Then: long on screen, a real
  // change of depth (it comes nearer and recedes), close to the word.
  const DT = 1 / 30, NS = Math.ceil((FLIGHT.t1 - FLIGHT.t0) / DT) + 1;
  const unit = { x: new Float32Array(NS), y: new Float32Array(NS), psi: new Float32Array(NS) };
  {
    let x = 0, y = 0, psi = 0;
    for (let i = 0; i < NS; i++) {
      unit.x[i] = x; unit.y[i] = y; unit.psi[i] = psi;
      psi += -FLIGHT.turn * driveAt(FLIGHT.t0 + i * DT - FLIGHT.lag) * DT;
      x += Math.cos(psi) * DT; y += Math.sin(psi) * DT;
    }
  }
  const path = { x: new Float32Array(NS), y: new Float32Array(NS), z: new Float32Array(NS), scale: .05, speed: 0, ok: false, camZ: 2.2, dNear: 2.6, dFar: 5.3 };
  const mvp = new THREE.Matrix4();

  function fitFlight(F, objBox) {
    const { camera, w, h, free, avoid } = F;
    camera.updateMatrixWorld();
    mvp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const e = mvp.elements, pr = { x: 0, y: 0, d: 0 };
    const proj = (x, y, z) => { const W = e[3] * x + e[7] * y + e[11] * z + e[15]; pr.x = ((e[0] * x + e[4] * y + e[8] * z + e[12]) / W + 1) / 2 * w; pr.y = (1 - (e[1] * x + e[5] * y + e[9] * z + e[13]) / W) / 2 * h; pr.d = W; return pr; };
    const camZ = camera.position.z, tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), k1 = h / 2 / tanH;   // px per world unit at distance 1
    const halfW = d => d * tanH * camera.aspect;
    const dNear = camZ - FLIGHT.near, dFar = camZ - FLIGHT.far;
    const [fr, lo, hi] = FLIGHT.spanNear, spanNearPx = Math.max(lo, Math.min(hi, fr * Math.min(w, h)));
    const span = spanNearPx * dNear / k1;                          // aircraft span, world units
    path.scale = span / plane.span; path.camZ = camZ; path.dNear = dNear; path.dFar = dFar;
    const margin = d => span * k1 / d * .7;                         // keep-out radius, px
    const wr = avoid[0] || null;
    let best = null;
    const fh = free.b - free.t, STEP = 3, zMid = (FLIGHT.near + FLIGHT.far) / 2;
    for (let r = 0; r < 24; r++) {
      const rho = r * Math.PI / 12, c = Math.cos(rho), n = Math.sin(rho);
      if (Math.abs(c) < .25) continue;                                // must enter across a side
      for (const sp of [.8, 1, 1.3, 1.7, 2.2]) {
        const s = sp * 2 * halfW(camZ - zMid) / 8.5;               // world units per second
        // the path's own depth span decides where it can sit
        let zr0 = Infinity, zr1 = -Infinity;
        for (let i = 0; i < NS; i += STEP) { const dz = -s * (n * unit.x[i] + c * unit.y[i]); zr0 = Math.min(zr0, dz); zr1 = Math.max(zr1, dz); }
        const zA = FLIGHT.far - zr0, zB = FLIGHT.near - zr1;
        if (zA > zB) continue;
        for (let iz = 0; iz < 4; iz++) {
          const z0 = zA + (zB - zA) * (iz + .5) / 4, d0 = camZ - z0;
          const x0 = (c > 0 ? -1 : 1) * (halfW(d0) + span * 1.2);
          for (const fy of [.12, .3, .5, .7, .88]) for (const climb of [-1, 0, 1]) {
            const y0 = (h / 2 - (free.t + fh * fy)) / k1 * d0;
            const vy = climb * .55 * fh / k1 * d0 / (FLIGHT.t1 - FLIGHT.t0);   // a gentle climb or descent across the flight
            let seen = 0, hidden = 0, dMin = Infinity, dMax = 0, yMin = Infinity, yMax = -Infinity, nearWord = Infinity, bad = false, endOut = false;
            for (let i = 0; i < NS; i += STEP) {
              const P = proj(x0 + s * (c * unit.x[i] - n * unit.y[i]), y0 + vy * i * DT, z0 - s * (n * unit.x[i] + c * unit.y[i]));
              const m = margin(P.d);
              if (P.x < -m || P.x > w + m || P.y < -m || P.y > h + m) { if (i + STEP >= NS) endOut = true; continue; }
              seen++;
              if (P.y < free.t + m * .45 || P.y > free.b - m * .45) { bad = true; break; }
              if (wr) { const dd = rectDist(wr, P.x, P.y); if (dd < m) { bad = true; break; } nearWord = Math.min(nearWord, dd - m); }
              if (objBox && rectDist(objBox, P.x, P.y) < m * .35) hidden++;   // passes behind the pedals (it is always deeper than they are)
              dMin = Math.min(dMin, P.d); dMax = Math.max(dMax, P.d); yMin = Math.min(yMin, P.y); yMax = Math.max(yMax, P.y);
            }
            if (!bad && !endOut) {   // the last sample must be off screen too
              const P = proj(x0 + s * (c * unit.x[NS - 1] - n * unit.y[NS - 1]), y0 + vy * (NS - 1) * DT, z0 - s * (n * unit.x[NS - 1] + c * unit.y[NS - 1])), m = margin(P.d);
              endOut = P.x < -m || P.x > w + m || P.y < -m || P.y > h + m;
            }
            if (bad || !endOut || seen < 10) continue;
            const vis = seen / Math.ceil(NS / STEP), depth = clamp01((dMax / dMin - 1) / .7), close = clamp01((dNear * 1.5 - dMin) / (dNear * .5));
            const rise = clamp01((yMax - yMin) / (.3 * fh));             // seen from above or below, the turns read as curves
            const score = 150 * vis + 110 * depth + 50 * close + 90 * rise - 260 * hidden / seen - .25 * Math.abs(Math.min(nearWord, 600) - 60) + (c > 0 ? 6 : 0) - 5 * Math.abs(sp - 1) / .25;
            if (!best || score > best.score) best = { score, x0, y0, vy, z0, c, n, s, vis, dMin, dMax, nearWord, hidden: hidden / seen, rise };
          }
        }
      }
    }
    path.ok = !!best;
    if (!best) return;
    for (let i = 0; i < NS; i++) {
      path.x[i] = best.x0 + best.s * (best.c * unit.x[i] - best.n * unit.y[i]);
      path.y[i] = best.y0 + best.vy * i * DT;
      path.z[i] = best.z0 - best.s * (best.n * unit.x[i] + best.c * unit.y[i]);
    }
    path.speed = best.s; path.climb = best.vy;
    Object.assign(path, { vis: best.vis, near: best.dMin, far: best.dMax, clear: best.nearWord, hidden: best.hidden, rise: best.rise });
  }

  // aircraft pose at flight time s (seconds since FLIGHT.t0); past the end it keeps going straight
  const fwd = new THREE.Vector3(), up = new THREE.Vector3(), side = new THREE.Vector3(), mtx = new THREE.Matrix4();
  function posePlane(s, extra = 0, fade = 0) {
    const fi = s / DT, i = Math.max(0, Math.min(NS - 2, Math.floor(fi))), k = clamp01(fi - i);
    let x = lerp(path.x[i], path.x[i + 1], k), y = lerp(path.y[i], path.y[i + 1], k), z = lerp(path.z[i], path.z[i + 1], k);
    const pitch = Math.atan2(path.climb || 0, path.speed || 1);
    const dx = path.x[i + 1] - path.x[i], dz = path.z[i + 1] - path.z[i], L = Math.hypot(dx, dz) || 1;
    const over = Math.max(0, s - (NS - 1) * DT) + extra;
    x += dx / L * path.speed * over; z += dz / L * path.speed * over; y += (path.climb || 0) * over;
    const heading = Math.atan2(-dz, dx) - FLIGHT.yaw * driveAt(FLIGHT.t0 + s - FLIGHT.lag * .6);   // rudder yaws the nose into the turn
    fwd.set(Math.cos(heading) * Math.cos(pitch), Math.sin(pitch), -Math.sin(heading) * Math.cos(pitch));
    side.set(Math.sin(heading), 0, Math.cos(heading));                // right wing (level)
    const bank = FLIGHT.bank * driveAt(FLIGHT.t0 + s - FLIGHT.lag);
    up.crossVectors(side, fwd).normalize().multiplyScalar(Math.cos(bank)).addScaledVector(side, Math.sin(bank));
    side.crossVectors(up, fwd);                                   // local +X (left wing)
    mtx.makeBasis(side, up, fwd);
    plane.group.quaternion.setFromRotationMatrix(mtx);
    plane.group.position.set(x, y, z);
    plane.group.scale.setScalar(path.scale * (1 - .9 * fade));
    plane.setProp((s + extra) * 47);
    plane.setHaze(FLIGHT.haze * clamp01((path.camZ - z - path.dNear) / (path.dFar - path.dNear)));
  }

  function apply() {
    model.setProgress(v.p);
    model.setDrive(v.drive);
    model.setToe(v.toeL, v.toeR);
    model.setGrow(v.growS, v.growW);
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
    model.refresh();   // springs and wires follow their anchors (only when something moved)
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
    v.toeL = T >= X.t0 && T <= X.t1 ? keyed(TOE_L, u) : 0;
    v.toeR = T >= X.t0 && T <= X.t1 ? keyed(TOE_R, u) : 0;
    // springs hook on as the last parts land, then the wires run to the board; both let go before the assembly opens
    const off = 1 - ease.inOutSine(win(T, O.t0, O.t0 + .3));
    v.growS = ease.inOutSine(win(T, A.t1 - .35, A.t1 + .35)) * off;
    v.growW = ease.inOutSine(win(T, A.t1 - .1, A.t1 + 1.0)) * off;
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
    v.p = a0.p * (1 - ease.outCubic(win(u, .1, .5)));
    v.drive = a0.drive * (1 - ease.outCubic(win(u, 0, .35)));
    v.toeL = a0.toeL * (1 - ease.outCubic(win(u, 0, .3))); v.toeR = a0.toeR * (1 - ease.outCubic(win(u, 0, .3)));
    v.growS = a0.growS * (1 - ease.inOutSine(win(u, 0, .16))); v.growW = a0.growW * (1 - ease.inOutSine(win(u, 0, .16)));
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
    Object.assign(v, { p: 1, drive: 0, shadow: 1, fly: 1, growS: 1, growW: 1 });
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
