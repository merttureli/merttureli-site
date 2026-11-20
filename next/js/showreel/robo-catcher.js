// Robo-Catcher: a showreel project actor (the real machine from the owner's CAD).
// Scaffolded by `python3 tools/new.py actor robo-catcher`. Recipe: docs/recipes/showreel-actor.md
//
// The story (about 15 s between the rocket leaving and coming back), two balls at real speeds:
//   ROBO_ENTER     the machine's parts fly in from off screen to an exploded view
//   ROBO_ASSEMBLE  they come together, ground up: bed, ramps, backstop, feeder, thrower
//   ROBO_PITCH     ball 1 is tossed in from the front left (8.6 m/s), slams into the net, which takes it 26 cm deep
//                  and pushes it back out; it drops onto the bed and bounces low and dead on the rubber
//   ROBO_FEED      it rolls down the 5.8 degree bed, speeding up, into the feeder's lower chamber; the flywheels spin up
//   ROBO_INDEX     the dual chamber turns half a turn with weight and lifts it to the exit side. Meanwhile ball 2, a
//                  ground ball (6.5 m/s) from the front right, hits a ground ball ramp, is kicked up off its top edge
//                  and slams into the net lower down
//   ROBO_THROW     ball 1 rolls out through the transfer elbow; the flywheels grip it (they dip) and throw it straight
//                  out at 11 m/s. Ball 2 drops to the bed and rolls down into the chamber that has come round for it
//   ROBO_INDEX2    the chamber turns again and lifts ball 2
//   ROBO_THROW2    ball 2 runs through the elbow and is thrown too
//   ROBO_EXIT      the flywheels spin down, the machine opens up and its parts fly away
// Every ball position is solved from physics in real units (see PHYSICS below); sample() is a pure function of T.
//
// Geometry: next/assets/3d/robo-catcher.json/.bin, converted from the owner's render mesh
// (catcher_mesh.npz, 84 parts) by tools/cad/npz_to_cadmesh.py with tools/cad/maps/robo-catcher.npz.json
// (part map, decimation, the owner's material groups from catcher_scene.py). The backstop net and the
// feeder's wire panels are line sets (meta.lines), drawn as 1 px lines as in his render; with the studio look
// (look.js, dressRoboCatcher) they become a rope net and steel wire, and every part gets its real material. CAD
// coordinates (mm) reach model space through meta.source.shift_mm; the ball path below is written
// in CAD mm so it can be checked against the part list.
//
// createModel() -> { group, height, footprint, triangles, getParts(), setProgress(p), setSpin(top, bottom),
//                    setIndex(a), setNet(a), setNetImpact(x, y, depth, phase), netZ(x, y), hints, parts, dispose() }
// createAccent() -> a softball (call it once per ball): { group, mesh, ghost, radius, ready, setSpin(q | axis, angle),
//                   dispose() }; `ready` resolves when its maps are drawn (createActor waits for it)
// createActor(ctx) -> the reel actor (interface at the top of next/js/showreel/index.js).
//
// Units meters, +Y up, origin at the footprint center on the ground, +Z the front (where the pitcher
// stands). Lights and environment come from engine.js: no lights, fog or environment here.
// Register (only with the owner's go):
//   registerProject({ key: 'robo-catcher', word: 'Robo-Catcher', actor: ctx => import('./robo-catcher.js').then(m => m.createActor(ctx)) });
// Preview without registering: next/lab/robo-catcher.html
import { THREE, ease, win, clamp01, lerp, placeInFrame, screenExtents } from './engine.js';
import { fetchCadMesh, buildCadMesh } from '../cad/cadmesh.js';

export const KEY = 'robo-catcher';
export const WORD = 'Robo-Catcher';

// Fetched once when the module loads (import() waits for it); built per createModel().
const CAD = await fetchCadMesh(new URL('../../assets/3d/robo-catcher.json', import.meta.url));
const SHIFT = CAD.meta.source.shift_mm;
const mm = (x, y, z, out = new THREE.Vector3()) => out.set((x + SHIFT[0]) / 1000, (y + SHIFT[1]) / 1000, (z + SHIFT[2]) / 1000);

// ================================================================ reel
export const SEQUENCE = [
  ['ROBO_ENTER', 2.3],
  ['ROBO_ASSEMBLE', 2.3],
  ['ROBO_PITCH', 1.75],
  ['ROBO_FEED', 1.5],
  ['ROBO_INDEX', 1.1],
  ['ROBO_THROW', 1.55],
  ['ROBO_INDEX2', 1.1],
  ['ROBO_THROW2', 1.8],
  ['ROBO_EXIT', 2.6],
];
const [ENTER, ASSEMBLE, PITCH, FEED, INDEX, THROW, INDEX2, THROW2, EXIT] = SEQUENCE.map(s => s[0]);

// Viewing angle (radians): three-quarter view from the front right, a little above, the owner's
// turntable angle with the feeder and thrower nearest the camera.
// [landscape, portrait]. From the front left, so the thrower stands beside the feeder cage, not in
// front of it, and high enough to see the ball roll on the bed behind the ground ramps.
const VIEWS = [{ x: .3, y: .26 }, { x: .3, y: .3 }];
// How much of the hero's free area the assembled machine may take: [landscape, portrait].
const FRAME = { fillW: [.62, .92], fillH: [.9, .62], prefer: [.46, .5] };
// Show the work: while the balls are indexed and thrown the machine turns this far (radians, about the vertical) to
// bring the feeder and thrower forward and open the thrower's plates and gears to view; layout() takes less if the
// turned machine would leave the free area or touch the word.
const TURN = -.6;

// Screen direction (degrees, 0 = right, 90 = up) each part flies in from and leaves by.
// The drift word sits to the machine's upper right and the marquee below it, so parts come from
// the left, from the upper left and level from the right, never across either.
const DIRS = { bed: 182, groundRamps: 172, backstop: 108, cage: 150, indexer: 142, tube: 158, throwerBase: 3, throwerPlates: 8, flywheelBottom: 5, flywheelTop: 12, idlers: 16 };

// ---- mechanism, CAD mm (catcher_mesh.npz part list)
const AX = {
  indexer: [816.408, 1141.89],          // shaft DM6 (y, z), turns about x
  flyTop: [1034.669, 1397.01],          // flywheel shafts
  flyBottom: [799.719, 1397.01],
};
const BALL_R = 47.6;                    // the CAD softball, 95.2 mm
// Spin speeds for the eye (rad/s), not the real 3000 rpm: fast enough to read, slow enough not to strobe.
const SPIN = 15;

// ---- ball path, CAD mm. Bed surface, sloping down to the feeder: OtherRamp_frame top y = 835.2 at
// x = -1334.6 to 759.1 at x = -572.6, then Ramp_frame 761.2 at x = -574.3 to 683.0 at x = 187.5.
const rampY = x => (x < -573.5 ? 835.2 + (x + 1334.6) * (759.1 - 835.2) / (1334.6 - 572.6) : 761.2 + (x + 574.3) * (683.0 - 761.2) / (187.5 + 574.3));
const HIT = [-780, 1500, 989 + BALL_R + 4];       // net plane z = 989 (net_sheets)
const ENTRY = [190, 661 + BALL_R, 1141.5];        // entrance side ramp trough, x 185..216
const LOWER = [273.9, 707.3, 1138.4];             // lower sloped tunnel (rotates to the upper one)
const EXIT_RAMP = [347, 913, 1142];               // exit side ramp trough
const TUBE_IN = [372, 922, 1143.8];               // transfer elbow (Tube), center line y 922
const TUBE_BEND = [396, 922, 1320 - 176];         // straight to here, then a 176 mm bend to +z
const TUBE_OUT = [572, 922, 1320];
const GRIP = [571, 920, 1404];                    // between the flywheels (Softball in the CAD)

// ---- PHYSICS, real units. Model space is CAD mm / 1000 (meta.scale is only the mesh's quantization range), so one
// model meter is one real meter: the net is 1.52 m wide, the CAD ball 95.2 mm (a real 12 inch softball is 97 mm).
// Gravity is the real 9.81 m/s^2 and reel seconds are real seconds.
const G = 9.81;
const ROLL = 5 / 7;                       // a solid ball rolling without slipping: a = 5/7 g sin(slope)
const BED_A = ROLL * G * .101;            // the catch bed falls 5.8 degrees toward the feeder (rampY): 0.71 m/s^2
const BED_E = .3;                         // restitution on the rubber-topped plywood: low and dead
const BED_X1 = (187.5 + SHIFT[0]) / 1000; // the bed's last sheet ends here (model x); then the trough and the chamber
// Ball 1: a firm toss from the front left (arrives over the free area's left edge, clear of the word and the marquee)
const PITCH_V = [3.6, -3.0, -7.2];        // velocity at the net (m/s): 8.6 m/s, still falling 3 m/s
const PITCH_AT = .85;                     // contact, seconds into ROBO_PITCH
const PITCH_SPIN = 15;                    // backspin in flight (rad/s)
// Ball 2: a ground ball from the front right, rolling without slipping into the right ground ball ramp. The ramp's top
// face is the plane n.p = d (31.4 degrees, GBRamp_frame); a ball's centre meets it at z = .515 and leaves it over the
// top edge at (y .3056, z .0928), .495 m up the slope. Meeting the ramp keeps (2 + 5 cos 31.4) / 7 = .894 of the speed
// across the edge (angular momentum about the edge); up the slope it slows at 5/7 g sin 31.4 = 3.66 m/s^2.
const GROUND_V = 6.5, GROUND_DIR = 60 * Math.PI / 180, GROUND_X = .40;   // speed (m/s), angle to the ramp's edge, x where it meets the ramp
const GROUND_AT = .45;                    // ball 2 meets the net, seconds into ROBO_INDEX (ball 1 is being lifted)
const RAMP_N = [0, .8535, .5211], RAMP_C0 = [.0476, .515], RAMP_S = .4947;
const RAMP_K = (2 + 5 * RAMP_N[1]) / 7, RAMP_A = ROLL * G * RAMP_N[2];
// The net with a ball in it: critically damped, so a 7.2 m/s ball stops in 0.1 s, 26 cm deep, and is pushed back out
// at 0.135 of its speed (it leaves when the net stops pushing, at 2 / omega); the light net then creeps back
// (continuous speed) while setNetImpact's ripple runs out over NET_RING_S.
const NET_OMEGA = 10.2, NET_TAN = 1.5, NET_RING_S = 1.3;
// Chamber and thrower
const IDX_START = .05, IDX_TURN = .85;    // the half turn: starts this long into ROBO_INDEX / _INDEX2, lasts this long
const EXIT_A = 4, EXIT_V = 1.1;           // out of the upper chamber, down the exit ramp and through the elbow (m/s^2, m/s)
const V_OUT = 11, BOTTOM_K = 1.08;        // the throw (m/s); the lower wheel runs 8% faster: backspin
const DIP = .12, DIP_IN = .012, DIP_OUT = .3;   // the wheels lose 12% as they grip a ball and recover in about 0.3 s

// ==================================================================== model
// The net as a sheet that can be hit. NET_* shape the pocket setNetImpact() makes (see netField below).
const NET_W = .2;              // half width of the pocket at the moment of the hit (m): half its depth is left this far out
const NET_SPREAD = 1.3;        // how much wider the pocket gets while the hit spreads (phase 0 -> 1)
const NET_PULL = .4;           // how far cords are drawn in toward the pocket, as a share of its depth
const NET_RING = .28, NET_REACH = 1.25, NET_RING_W = .17, NET_RING_K = 2 * Math.PI / .34;   // the ripple: height (share of depth), reach (m), width (m), wave number
// Plywood sheets inside the merged meshes, measured on the CAD mesh (model space, m): unit normal, the offset of the
// underside and of the top face. look.js cuts them out (rubber on top, plies on the edges, grain underneath).
const PLYWOOD = {
  bed: [[.1021, .9948, 0, .1030, .1091], [-.0680, .9977, 0, .2268, .2331]],   // OtherRamp_frame and Ramp_frame, ShortRamp_frame
  groundRamps: [[0, .8535, .5211, .2550, .2613]],                             // GBRamp_frame x 2
};
const TREAD_R = .0655;         // Flywheel: the rubber tread starts at this radius from the shaft (m), the rim is inside it

export function createModel({ THREE: T = THREE, quality = 'high' } = {}) {
  const m = buildCadMesh(T, CAD.meta, CAD.buf);
  m.group.name = KEY;
  const P = m.parts;
  const lineGeos = [], lineMats = [];

  // Line sets (net, feeder wire panels): children of their part, so they fly and explode with it. They are the
  // plain drawing (the 3D viewer, or when look.js is not there); the look replaces them with a rope net and wire.
  const lines = {};
  for (const [name, L] of Object.entries(CAD.meta.lines || {})) {
    const part = P[L.part];
    const src = L.positions, piv = part.position;
    // The net is cut into short pieces so it can give where the ball hits.
    const pieces = name === 'net' ? (quality === 'low' ? 10 : 18) : 1;
    const pos = new Float32Array(src.length / 6 * pieces * 6);
    let o = 0;
    for (let i = 0; i < src.length; i += 6) {
      for (let k = 0; k < pieces; k++) {
        for (const s of [k / pieces, (k + 1) / pieces]) {
          pos[o++] = lerp(src[i], src[i + 3], s) - piv.x;
          pos[o++] = lerp(src[i + 1], src[i + 4], s) - piv.y;
          pos[o++] = lerp(src[i + 2], src[i + 5], s) - piv.z;
        }
      }
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    g.computeBoundingSphere();
    const mat = new T.LineBasicMaterial({ color: L.color });
    const seg = new T.LineSegments(g, mat);
    seg.name = `${L.part}:${name}`;
    part.add(seg);
    lineGeos.push(g); lineMats.push(mat);
    lines[name] = { seg, base: pos.slice(), pos, attr: g.attributes.position, src, piv: piv.clone() };
  }

  // Axles: pivots on the real shafts so the parts turn about them.
  const ax = (name, [y, z]) => m.setPivot(name, [P[name].position.x, mm(0, y, z).y, mm(0, y, z).z]);
  ax('indexer', AX.indexer);
  ax('flywheelTop', AX.flyTop);
  ax('flywheelBottom', AX.flyBottom);
  const idlerA = P.idlers.getObjectByName('idlerA'), idlerB = P.idlers.getObjectByName('idlerB');

  // Staggered arrivals in build order (cadmesh's own setProgress has no stagger).
  const list = m.getParts();
  m.setProgress(1);
  const base = list.map(r => r.mesh.position.clone());
  function setProgress(p) {
    const n = list.length;
    for (let i = 0; i < n; i++) {
      const a = i / (n - 1) * .46, k = ease.inOutSine(win(p, a, a + .54));
      list[i].mesh.position.copy(base[i]).addScaledVector(list[i].explode, 1 - k);
    }
  }
  // Flywheels: the upper one turns back (-x) and the lower one forward, so their faces meet the ball
  // moving +z. The gear train (upper gear, idler B, idler A, lower gear, all 5172T45, same size)
  // alternates direction.
  function setSpin(aTop, aBottom) {
    P.flywheelTop.rotation.x = -aTop;
    P.flywheelBottom.rotation.x = aBottom;
    idlerB.rotation.x = aTop;
    idlerA.rotation.x = -aTop;
  }
  function setIndex(a) { P.indexer.rotation.x = -a; }

  // ---- the net. One displacement field moves the plain line set and the look's rope net. Coordinates here are
  // the backstop part's own (model space minus its assembled position `bs0`); the net is the plane z = N.z between
  // x0..x1 and y0..y1, tied along both poles (x = xl, xr) and looser along its top and bottom edges.
  const net = lines.net, bs0 = P.backstop.position.clone();
  const hit = mm(HIT[0], HIT[1], 989);
  const hx = hit.x - bs0.x, hy = hit.y - bs0.y;
  const poleBox = new T.Box3();
  P.backstop.traverse(o => { if (o.isMesh) { o.geometry.computeBoundingBox(); poleBox.union(o.geometry.boundingBox.clone().translate(o.position)); } });
  const poleR = (poleBox.max.z - poleBox.min.z) / 2;
  const poles = { part: P.backstop, r: poleR, z: (poleBox.max.z + poleBox.min.z) / 2, xs: [poleBox.min.x + poleR, poleBox.max.x - poleR], ys: [poleBox.min.y, (poleBox.min.y + poleBox.max.y) / 2, poleBox.max.y] };
  let N = null;
  if (net) {
    const b = net.base, src = net.src;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, up = 0, across = 0;
    for (let i = 0; i < b.length; i += 3) { x0 = Math.min(x0, b[i]); x1 = Math.max(x1, b[i]); y0 = Math.min(y0, b[i + 1]); y1 = Math.max(y1, b[i + 1]); }
    for (let i = 0; i < src.length; i += 6) if (Math.abs(src[i + 4] - src[i + 1]) > Math.abs(src[i + 3] - src[i])) up++; else across++;
    // the CAD net has 31 cords up and down and 27 across: 30 by 26 cells of about 51 by 53 mm
    N = { part: P.backstop, lines: net.seg, x0, x1, y0, y1, z: b[2], lift: 0, xl: poles.xs[0], xr: poles.xs[1], cols: up - 1, rows: across - 1, rest: netRest, field: netField, sync: null, hung: false };
  }
  const S = { a: 0, x: 0, y: 0, depth: 0, phase: 0, free: 1 };
  const smooth = t => { t = clamp01(t); return t * t * (3 - 2 * t); };
  // how free the net is to move at a point: 0 on the poles, less along the top and bottom edges than in the middle
  const netFree = (x, y) => smooth(Math.min(x - N.xl, N.xr - x) / .24) * (.55 + .45 * smooth(Math.min(y - N.y0, N.y1 - y) / .3));
  // The hanging net: cords sag a little between the poles and the sheet bellies back, more at the free top edge.
  function netRest(x, y, o) {
    const t = clamp01((x - N.xl) / (N.xr - N.xl)), u = clamp01((y - N.y0) / (N.y1 - N.y0)), b = 4 * t * (1 - t);
    o[0] = 0;
    o[1] = -.026 * b * (.3 + .7 * u);
    o[2] = -.022 * Math.sin(Math.PI * t) * Math.sin(Math.PI * (.08 + .84 * u)) + .006 * b * Math.sin(9.1 * t + 1.3) * Math.sin(7.3 * u + .5);
    return o;
  }
  // What a hit adds at the net point (x, y): [dx, dy, dz]. setNet's dent (the 3D viewer) plus setNetImpact's pocket:
  // a rounded tent of depth S.depth that is exactly that deep at its center, widens as the hit spreads (phase), draws
  // the cords around it inward, and sends one ring outward that dies before it reaches the poles.
  function netField(x, y, o) {
    let dx = 0, dy = 0, dz = 0;
    if (S.a) { const ex = x - hx, ey = y - hy; dz -= S.a * Math.exp(-(ex * ex + ey * ey) / (2 * .2 * .2)); }
    if (S.depth) {
      const ex = x - S.x, ey = y - S.y, r2 = ex * ex + ey * ey, r = Math.sqrt(r2), ph = S.phase;
      const w = NET_W * (1 + NET_SPREAD * ph), t2 = r2 / (w * w);
      const front = NET_REACH * ph, g = (r - front) / NET_RING_W;
      const ring = NET_RING * (1 - ph) * (1 - ph) * smooth(ph / .06) * Math.exp(-g * g) * Math.cos((r - front) * NET_RING_K) * r / (r + .06);
      const s = S.depth * netFree(x, y) / S.free;
      dz -= s * (1 / (1 + t2) + ring);
      const pull = NET_PULL * Math.abs(s) * Math.sqrt(t2) / Math.pow(1 + t2, 1.5) / (r || 1);
      dx -= ex * pull; dy -= ey * pull;
    }
    o[0] = dx; o[1] = dy; o[2] = dz;
    return o;
  }
  const o3 = [0, 0, 0];
  function netChanged() {
    if (N.sync) { N.sync(); return; }           // the look's rope net is showing: it reads netField itself
    const { base: b, pos } = net;
    for (let i = 0; i < pos.length; i += 3) {
      netField(b[i], b[i + 1], o3);
      pos[i] = b[i] + o3[0]; pos[i + 1] = b[i + 1] + o3[1]; pos[i + 2] = b[i + 2] + o3[2];
    }
    net.attr.needsUpdate = true;
  }
  // The 3D viewer's dent: `a` meters deep at the reel's hit point, as before.
  function setNet(a) {
    if (!N || Math.abs(a - S.a) < 1e-5) return;
    S.a = a;
    netChanged();
  }
  // A ball in the net: a pocket `depth` meters deep (toward -z, away from the pitcher; negative swings it forward)
  // centered at (x, y) on the net plane in model space. `phase` 0..1 spreads the pocket and runs the ripple outward;
  // the reel drives depth as the damped swing and phase as the time since the hit. Depth 0 is the hanging net.
  function setNetImpact(x, y, depth, phase = 0) {
    if (!N) return;
    const lx = x - bs0.x, ly = y - bs0.y, ph = clamp01(phase);
    if (lx === S.x && ly === S.y && Math.abs(depth - S.depth) < 1e-6 && Math.abs(ph - S.phase) < 1e-5) return;
    const was = S.depth;
    S.x = lx; S.y = ly; S.depth = Math.abs(depth) < 1e-6 ? 0 : depth; S.phase = ph;
    S.free = Math.max(.3, netFree(lx, ly));
    if (S.depth || was) netChanged();
  }
  // Where the net's surface is at (x, y) right now: model space z (the hanging net plus the hit).
  function netZ(x, y) {
    if (!N) return 0;
    const lx = x - bs0.x, ly = y - bs0.y;
    let z = bs0.z + N.z;
    if (N.hung) z += N.lift + netRest(lx, ly, o3)[2];
    return z + netField(lx, ly, o3)[2];
  }

  setProgress(1);
  const size = new T.Box3().setFromObject(m.group).getSize(new T.Vector3());
  // What look.js needs to know about the machine (part-local coordinates): see dressRoboCatcher.
  const hints = {
    net: N, poles,
    wires: lines.feed && { part: P.cage, lines: lines.feed.seg, segments: lines.feed.base },
    plywood: Object.entries(PLYWOOD).map(([name, slabs]) => {
      const c = base[list.findIndex(r => r.name === name)];
      return { part: P[name], slabs: slabs.map(([nx, ny, nz, d0, d1]) => { const d = nx * c.x + ny * c.y + nz * c.z; return [nx, ny, nz, d0 - d, d1 - d]; }) };
    }),
    wheels: [P.flywheelTop, P.flywheelBottom], treadR: TREAD_R, printed: P.indexer,
  };
  return {
    group: m.group, parts: P, height: size.y, footprint: Math.max(size.x, size.z), size,
    triangles: m.triangles, materials: m.materials, hints,
    getParts: () => list.map(r => ({ name: r.name, mesh: r.mesh, explode: r.explode, dir: DIRS[r.name] })),
    setProgress, setSpin, setIndex, setNet, setNetImpact, netZ,
    update() {},
    dispose() { m.dispose(); for (const g of lineGeos) g.dispose(); for (const x of lineMats) x.dispose(); },
  };
}

// =================================================================== accent
// A 12 inch softball: optic yellow leather with a fine grain and raised red stitching along the two-piece seam.
// The cover is drawn once per quality into an equirectangular color map and a height map (canvas 2D, no pixel
// loops, a few milliseconds at a time); every ball shares the geometry and the maps, so a second ball costs one
// draw call and nothing to build.
const SEAM_B = .32;            // seam shape: the necks between the lobes are about 40 degrees wide, as on a real ball
const STITCHES = 88;
// The seam on the unit sphere (on it exactly), turned so the texture's poles sit in the middle of the two lobes:
// the seam stays within 50 degrees of the map's equator and is never pinched.
function seamPoint(t, out) {
  const x = (1 - SEAM_B) * Math.cos(t) + SEAM_B * Math.cos(3 * t), y = (1 - SEAM_B) * Math.sin(t) - SEAM_B * Math.sin(3 * t);
  return out.set((x - y) * Math.SQRT1_2, (x + y) * Math.SQRT1_2, 2 * Math.sqrt(SEAM_B * (1 - SEAM_B)) * Math.sin(2 * t));
}
function* softballSteps(T, W, cc, bc) {
  const H = W / 2, K = W / (2 * Math.PI);               // texels per radian at the equator
  const g = cc.getContext('2d'), b = bc.getContext('2d');
  // leather: optic yellow with a faint mottle; the height map is level with a fine pebble grain
  const nc = document.createElement('canvas'); nc.width = nc.height = 64;
  const ng = nc.getContext('2d'), id = ng.createImageData(64, 64);
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < id.data.length; i += 4) { const v = 255 * rnd(); id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
  ng.putImageData(id, 0, 0);
  g.globalAlpha = .05; g.drawImage(nc, 0, 0, W, H); g.globalAlpha = 1;
  yield;
  b.globalAlpha = .16; b.fillStyle = b.createPattern(nc, 'repeat'); b.save(); b.scale(W / 512, W / 512); b.fillRect(0, 0, 512, 256); b.restore(); b.globalAlpha = 1;
  yield;
  // sphere -> texel (three's SphereGeometry: u around +Y from -X, v down from +Y)
  const px = (p, near) => {
    let x = Math.atan2(p.z, -p.x) / (2 * Math.PI); if (x < 0) x += 1;
    x *= W;
    if (near !== undefined) x += W * Math.round((near - x) / W);   // stay on the same turn as the point before
    return [x, Math.acos(Math.max(-1, Math.min(1, p.y))) / Math.PI * H];
  };
  const n = 720, pts = [], len = [0];
  for (let i = 0; i <= n; i++) { pts.push(seamPoint(i / n * Math.PI * 2, new T.Vector3())); if (i) len.push(len[i - 1] + pts[i].distanceTo(pts[i - 1])); }
  const L = len[n], tmp = new T.Vector3(), tan = new T.Vector3(), side = new T.Vector3();
  let at_i = 1;
  const at = (s, p, t) => {               // point and tangent at arc length s (called with rising s)
    s = ((s % L) + L) % L;
    if (len[at_i - 1] > s) at_i = 1;
    while (len[at_i] < s) at_i++;
    const f = (s - len[at_i - 1]) / (len[at_i] - len[at_i - 1]);
    p.lerpVectors(pts[at_i - 1], pts[at_i], f).normalize();
    if (t) t.subVectors(pts[at_i], pts[at_i - 1]).normalize();
    return p;
  };
  // the seam goes once round the map: one path, drawn on this turn and the one before, so nothing breaks at the edge
  const seam = new Path2D();
  for (let i = 0, last; i <= n; i += 2) { const q = px(pts[i], last); last = q[0]; if (i) seam.lineTo(q[0], q[1]); else seam.moveTo(q[0], q[1]); }
  const stroke = (ctx, style, w) => { ctx.strokeStyle = style; ctx.lineWidth = w; for (const o of [0, -W]) { ctx.save(); ctx.translate(o, 0); ctx.stroke(seam); ctx.restore(); } };
  // the two covers pucker up toward the seam and meet in a thin slit
  b.lineCap = b.lineJoin = 'round';
  for (const [w, a] of [[.19, .13], [.12, .16], [.065, .18]]) { stroke(b, `rgba(255,255,255,${a})`, w * K); yield; }
  stroke(b, 'rgba(0,0,0,.75)', Math.max(1, .018 * K));
  stroke(g, 'rgba(96,104,20,.5)', Math.max(1, .016 * K));
  yield;
  // stitches: two red threads per stitch, from a hole on each side forward to the seam (a row of chevrons)
  const pitch = L / STITCHES, A = .088, hw = .016;
  const corners = (p0, p1, half) => {
    tan.subVectors(p1, p0).normalize(); side.crossVectors(p0, tan).normalize().multiplyScalar(half);
    const c0 = px(tmp.copy(p0).add(side).normalize());
    return [c0, px(tmp.copy(p1).add(side).normalize(), c0[0]), px(tmp.copy(p1).sub(side).normalize(), c0[0]), px(tmp.copy(p0).sub(side).normalize(), c0[0])];
  };
  const fill = (ctx, c, style) => {
    ctx.fillStyle = style;
    const lo = Math.min(c[0][0], c[1][0], c[2][0], c[3][0]), hi = Math.max(c[0][0], c[1][0], c[2][0], c[3][0]);
    for (const o of lo < 0 ? [0, W] : hi > W ? [0, -W] : [0]) { ctx.beginPath(); ctx.moveTo(c[0][0] + o, c[0][1]); for (let k = 1; k < 4; k++) ctx.lineTo(c[k][0] + o, c[k][1]); ctx.closePath(); ctx.fill(); }
  };
  const p0 = new T.Vector3(), p1 = new T.Vector3(), t0 = new T.Vector3(), t1 = new T.Vector3(), h = new T.Vector3(), e = new T.Vector3(), lat = new T.Vector3();
  for (let i = 0; i < STITCHES; i++) {
    at(i * pitch, p0, t0); at((i + .62) * pitch, p1, t1);
    for (const sg of [1, -1]) {
      lat.crossVectors(p0, t0).normalize();
      h.copy(p0).addScaledVector(lat, sg * A).normalize();                       // the hole
      lat.crossVectors(p1, t1).normalize();
      e.copy(p1).addScaledVector(lat, sg * .012).normalize();                    // where the thread dives into the seam
      const wide = corners(h, e, hw * 1.35), thin = corners(h, e, hw * .7);
      fill(g, wide, '#7d0f14'); fill(g, thin, '#c8202b');
      fill(b, wide, 'rgba(255,255,255,.5)'); fill(b, thin, 'rgba(255,255,255,.75)');
      const q = px(h);
      b.fillStyle = 'rgba(0,0,0,.6)'; b.beginPath(); b.arc(q[0], q[1], Math.max(.8, .012 * K), 0, 7); b.fill();
    }
    if (i % 8 === 7) yield;
  }
}
// run a generator a few milliseconds at a time, so building never holds a frame
const tick = () => new Promise(r => { if (typeof MessageChannel !== 'undefined') { const c = new MessageChannel(); c.port1.onmessage = () => r(); c.port2.postMessage(0); } else setTimeout(r, 0); });
async function sliced(it, ms = 3) {
  let t0 = performance.now();
  while (!it.next().done) if (performance.now() - t0 > ms) { await tick(); t0 = performance.now(); }
}
const BALLS = new Map();       // quality -> { geo, map, bump, ready, refs }
export function createAccent({ THREE: T = THREE, quality = 'high' } = {}) {
  const low = quality === 'low', r = BALL_R / 1000;
  let S = BALLS.get(quality);
  if (!S || S.T !== T) {
    const W = low ? 512 : 1024;
    const mk = fill => { const c = document.createElement('canvas'); c.width = W; c.height = W / 2; const x = c.getContext('2d'); x.fillStyle = fill; x.fillRect(0, 0, W, W / 2); const t = new T.CanvasTexture(c); t.wrapS = T.RepeatWrapping; t.anisotropy = 4; return t; };
    const map = mk('#d3e52f'), bump = mk('#808080');
    map.colorSpace = T.SRGBColorSpace;
    const geo = new T.SphereGeometry(r, low ? 20 : 32, low ? 12 : 20);
    S = { T, geo, map, bump, refs: 0 };
    // the cover is drawn a few milliseconds at a time; `ready` resolves when both maps are complete
    S.ready = tick().then(() => sliced(softballSteps(T, W, map.image, bump.image))).then(() => { map.needsUpdate = true; bump.needsUpdate = true; });
    BALLS.set(quality, S);
  }
  S.refs++;
  const group = new T.Group();
  group.name = KEY + ':ball';
  // leather: a soft, broad highlight; the stitches and the seam stand up out of the cover. One material per ball
  // (the look adopts it per renderer); geometry and maps are shared.
  const material = new T.MeshStandardMaterial({ color: 0xffffff, map: S.map, bumpMap: S.bump, bumpScale: 2.2, roughness: .56, metalness: 0 });
  const mesh = new T.Mesh(S.geo, material);
  mesh.name = 'ball';
  group.add(mesh);
  // X-ray ghost: while the ball is inside the feeder and the elbow it shows through them faintly,
  // the way the owner's CHARGER clip reveals its internals.
  const ghostMat = new T.MeshBasicMaterial({ color: 0xd8ec3e, transparent: true, opacity: 0, depthTest: false, depthWrite: false });
  const ghost = new T.Mesh(S.geo, ghostMat);
  ghost.name = 'ballXray'; ghost.renderOrder = 10; ghost.visible = false;
  group.add(ghost);
  let gone = false;
  return {
    group, mesh, ghost, radius: r, ready: S.ready,
    // turn the ball: a quaternion, or an axis (unit Vector3) and an angle (radians)
    setSpin(q, angle) { if (q.isQuaternion) mesh.quaternion.copy(q); else mesh.quaternion.setFromAxisAngle(q, angle); ghost.quaternion.copy(mesh.quaternion); },
    dispose() {
      if (gone) return;
      gone = true; ghostMat.dispose(); material.dispose(); group.removeFromParent();
      if (--S.refs <= 0) { S.geo.dispose(); S.map.dispose(); S.bump.dispose(); if (BALLS.get(quality) === S) BALLS.delete(quality); }
    },
  };
}

// ==================================================================== actor
export async function createActor(ctx) {
  const { engine, quality = 'high' } = ctx;
  const base = { THREE, renderer: engine.renderer, quality };
  const model = createModel(base);
  // Two balls in the reel. The 3D viewer (no renderer) shows only the first one's cycle, as before.
  const two = !!engine.renderer;
  const ball = createAccent(base), second = two ? createAccent(base) : null;
  const accents = two ? [ball, second] : [ball];
  let dress = null, shadow = null;   // the studio look (look.js) and its ground shadows; without it, the baked decal

  // stage (placed and scaled by layout) > view (viewing angle) > model, balls, shadow
  const stage = new THREE.Group(), view = new THREE.Group();
  stage.name = KEY + ':stage';
  stage.add(view);
  view.rotation.set(VIEWS[0].x, VIEWS[0].y, 0);
  view.add(model.group);
  for (const b of accents) view.add(b.group);
  stage.visible = false;
  stage.updateMatrixWorld(true);

  // Screen direction (degrees) -> a direction in view space, slightly toward the camera.
  const inv = new THREE.Quaternion().copy(view.quaternion).invert();
  const screenDir = (deg, z = .18) => new THREE.Vector3(Math.cos(deg * Math.PI / 180), Math.sin(deg * Math.PI / 180), z).normalize().applyQuaternion(inv);

  // Wrap each part so the reel flies it in and out without touching the model's own transforms.
  const raw = model.getParts(), n = raw.length;
  const parts = raw.map((p, i) => {
    const mesh = p.mesh, wrap = new THREE.Group();
    mesh.parent.add(wrap); wrap.add(mesh);
    const axis = new THREE.Vector3(Math.sin(i * 2.1 + 1), Math.cos(i * 1.7), Math.sin(i * 3.3 + 2)).normalize();
    const big = /bed|backstop|groundRamps/.test(p.name);
    return { name: p.name, mesh, wrap, axis, i, explode: p.explode, ex0: p.explode.clone(), dir: screenDir(p.dir ?? (i * 137.5 + 30)), spin: (i % 2 ? -1 : 1) * (big ? .22 : .5), f: 1, f0: 1, us: 0 };
  });

  // Fixed points of the ball's way through the feeder, model space.
  const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const V = (a) => mm(a[0], a[1], a[2]);
  const pLower = V(LOWER), pExitRamp = V(EXIT_RAMP), pTubeIn = V(TUBE_IN), pBend = V(TUBE_BEND), pTubeOut = V(TUBE_OUT), pGrip = V(GRIP);
  const idxAxis = mm(0, AX.indexer[0], AX.indexer[1]);
  const bendC = mm(TUBE_BEND[0], 922, 1320), bendR = (TUBE_OUT[0] - TUBE_BEND[0]) / 1000;
  const pUpper = pLower.clone().sub(idxAxis).applyAxisAngle(X_AXIS, -Math.PI).add(idxAxis);
  // abort: a ball out in the open leaves up and to the left, as before
  const dirOut = V3(-.5, .9, .9).normalize();
  const R = ball.radius;
  const UP = V3(0, 1, 0), GRAV = V3(0, -G, 0);
  const bedY = x => (rampY(x * 1000 - SHIFT[0]) + SHIFT[1]) / 1000;   // top of the bed's rubber at model x
  const trough = { y: (661 + BALL_R + SHIFT[1]) / 1000, z: (ENTRY[2] + SHIFT[2]) / 1000 };

  // ---------------------------------------------------------------- the plan: every event solved once, in seconds
  // relative to its state's start (state lengths are SEQUENCE's). Built after the look has hung the net.
  let plan = null;
  function restZ(x, y) { model.setNetImpact(x, y, 0, 0); const z = model.netZ(x, y); return z || -.3987; }
  // A ball leaving the net: (p, v) at separation -> its fall to the bed, its hops and its roll into the lower chamber.
  function bedChain(p, v, t) {
    // ballistic fall to the rubber (bisection on y - bed(x))
    let lo = 0, hi = 2;
    for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2, x = p.x + v.x * m, y = p.y + v.y * m - G / 2 * m * m; if (y > bedY(x) + R) lo = m; else hi = m; }
    const fall = hi, land = p.clone().addScaledVector(v, fall).addScaledVector(GRAV, fall * fall / 2);
    const vy = -(v.y - G * fall);
    // low, dead hops; friction on the rubber turns the slide into a roll (5/7 of the speed)
    const hops = [];
    let at = 0;
    for (let u = BED_E * vy; u > .15; u *= BED_E) { hops.push([at, u]); at += 2 * u / G; }
    const vx0 = ROLL * v.x, vz0 = ROLL * v.z;
    // roll down the bed: x = x0 + vx0 t + a t^2 / 2 until the sheet ends
    const dx = BED_X1 - land.x, tEnd = (-vx0 + Math.sqrt(vx0 * vx0 + 2 * BED_A * dx)) / BED_A, vEnd = vx0 + BED_A * tEnd;
    const tIn = tEnd + (pLower.x - BED_X1) / vEnd;
    return { t0: t + fall, land, fall, hops, hopEnd: at, vx0, vz0, tEnd, vEnd, tIn: t + fall + tIn, sep: { p: p.clone(), v: v.clone(), t } };
  }
  // ball contact with the net: depth now, and the in-net path (critically damped)
  const TS = 2 / NET_OMEGA;
  function netDepth(vn, t) {
    if (t <= 0) return 0;
    if (t < TS) return vn * t * Math.exp(-NET_OMEGA * t);
    return vn * TS * Math.exp(-2) * Math.exp(-(t - TS) / TS);
  }
  const tanAt = t => t * Math.exp(-NET_OMEGA * NET_TAN * t);
  function buildPlan() {
    const P = {};
    // ball 1: a toss, from where it meets the net back along its parabola
    {
      const v = V3(...PITCH_V), hit = mm(HIT[0], HIT[1], 0), x = hit.x, y = hit.y;
      const c = V3(x, y, restZ(x, y) + R);
      const ts = TS, s = V3(x + v.x * tanAt(ts), y + v.y * tanAt(ts), 0);
      const ds = netDepth(-v.z, ts);
      s.z = restZ(s.x, s.y) - ds + R;
      const vs = V3(0, 0, -v.z * Math.exp(-2));            // pushed straight back out at 0.135 of its speed
      P.b1 = { c, v, vn: -v.z, spinAxis: V3().crossVectors(v, UP).normalize(), bed: bedChain(s, vs, ts) };
    }
    // ball 2: a ground ball meeting the ramp, up the slope, off the top edge and into the net
    {
      const n = V3(...RAMP_N), u = V3(0, RAMP_N[2], -RAMP_N[1]);             // up the slope
      const dir = V3(-Math.cos(GROUND_DIR), 0, -Math.sin(GROUND_DIR));
      const foot = V3(GROUND_X, RAMP_C0[0], RAMP_C0[1]);
      const vPerp = GROUND_V * Math.sin(GROUND_DIR) * RAMP_K, vPar = dir.x * GROUND_V;   // across the edge (kept .894), along it
      const vTop = Math.sqrt(vPerp * vPerp - 2 * RAMP_A * RAMP_S), tRamp = (vPerp - vTop) / RAMP_A;
      const top = foot.clone().addScaledVector(u, RAMP_S); top.x += vPar * tRamp;
      const v0 = u.clone().multiplyScalar(vTop); v0.x = vPar;
      // flight to the net: solve for the time the ball's centre reaches the hanging net (z depends on where it hits)
      let tf = .1;
      for (let i = 0; i < 6; i++) { const x = top.x + v0.x * tf, y = top.y + v0.y * tf - G / 2 * tf * tf; tf = (restZ(x, y) + R - top.z) / v0.z; }
      const c = top.clone().addScaledVector(v0, tf).addScaledVector(GRAV, tf * tf / 2);
      const v = v0.clone().addScaledVector(GRAV, tf);
      const s = V3(c.x + v.x * tanAt(TS), c.y + v.y * tanAt(TS), 0);
      s.z = restZ(s.x, s.y) - netDepth(-v.z, TS) + R;
      const vs = V3(0, 0, -v.z * Math.exp(-2));
      const rollAxis = V3().crossVectors(UP, dir).normalize();                    // rolling: spin axis = up x velocity
      const rampDir = u.clone().multiplyScalar(vPerp); rampDir.x = vPar; rampDir.normalize();
      P.b2 = {
        c, v, vn: -v.z, dir, foot, top, v0, vPerp, vPar, vTop, tRamp, tFlight: tf, rollAxis,
        rampAxis: V3().crossVectors(n, rampDir).normalize(), spin: vTop / R, bed: bedChain(s, vs, TS),
      };
    }
    // out of the upper chamber: polyline + bend lengths, and the time to the wheels
    const L = [pUpper.distanceTo(pExitRamp), pExitRamp.distanceTo(pTubeIn), pTubeIn.distanceTo(pBend), Math.PI / 2 * bendR, pTubeOut.distanceTo(pGrip)];
    const len = L.reduce((a, b) => a + b, 0), tAcc = EXIT_V / EXIT_A, sAcc = EXIT_V * tAcc / 2;
    P.exit = { L, len, tGrip: tAcc + (len - sAcc) / EXIT_V, tAcc, sAcc };
    P.spinOut = V_OUT * (BOTTOM_K - 1) / (BOTTOM_K + 1) / R;                      // backspin from the wheels' speed difference
    return P;
  }
  // what layout() finds on screen: how long before contact ball 1 is in the free area, how far before the ramp
  // ball 2 is, and how long a thrown ball stays in it (clear of the word and the marquee)
  const lay = { in1: .7, in2: 1.2, out: .3 };

  // ---------------------------------------------------------------- state written by sample(), drawn by apply()
  const mkBall = acc => ({ acc, on: 0, p: V3(), q: new THREE.Quaternion(), squash: 1, xray: 0, fade: 1, a0: null });
  const B = accents.map(mkBall);
  const REST = { p: 0, top: 0, bottom: 0, idx: 0, netX: 0, netY: 0, net: 0, netPhase: 0, shadow: 0, ballOn: 0, xray: 0, turn: 0 };
  const v = { ...REST }, a0 = { ...REST };
  let dist = 6, baseYaw = VIEWS[0].y, turnK = 0;
  const q = new THREE.Quaternion(), qa = new THREE.Quaternion(), tmp = V3(), tmp2 = V3(), piv = V3();
  const turn = (b, axis, angle) => { qa.setFromAxisAngle(axis, angle); b.q.premultiply(qa); };

  function apply() {
    view.rotation.y = baseYaw + TURN * turnK * v.turn;
    model.setProgress(v.p);
    model.setSpin(v.top, v.bottom);
    model.setIndex(v.idx);
    model.setNetImpact(v.netX, v.netY, v.net, v.netPhase);
    let any = false;
    for (const P of parts) {
      if (P.f < .999) any = true;
      q.setFromAxisAngle(P.axis, P.spin * P.f);
      piv.copy(P.mesh.position);
      tmp.copy(piv).applyQuaternion(q);
      P.wrap.quaternion.copy(q);
      P.wrap.position.copy(P.dir).multiplyScalar(dist * P.f).add(piv).sub(tmp);
    }
    let shown = false;
    for (const b of B) {
      const A = b.acc, on = v.ballOn > 0 && b.on > 0;
      A.group.visible = on;
      if (on) {
        shown = true;
        A.group.position.copy(b.p);
        A.setSpin(b.q);
        A.mesh.scale.set(1 / Math.sqrt(b.squash), b.squash, 1 / Math.sqrt(b.squash));
        A.ghost.scale.copy(A.mesh.scale);
      }
      // a ball fading in or out at the edge of the free area is drawn as its flat ghost (no program change)
      const fading = on && b.fade < .999;
      A.mesh.visible = !fading;
      A.ghost.visible = on && (fading || b.xray > .01);
      A.ghost.material.opacity = fading ? b.fade : .55 * b.xray;
    }
    if (dress) { dress.setShadow(clamp01(v.shadow * 1.5)); dress.frame(); } else if (shadow) shadow.material.opacity = .34 * v.shadow;
    stage.visible = any || shown;
  }

  // Framing (resize only): size the assembled machine to the hero's free area, clear of the drift
  // word, then shrink the explode offsets until the open machine fits the same box too. Portrait
  // turns the machine more side-on, so its long bed takes less width and the feeder comes closer.
  // Then measure where each ball's path is inside the free area (lay).
  function layout(F) {
    const { halfW, halfH, camera, w, h, free, avoid } = F;
    const k0 = w < h ? 1 : 0, VW = VIEWS[k0];
    baseYaw = VW.y;
    view.rotation.set(VW.x, VW.y, 0);
    view.updateMatrixWorld(true);
    inv.copy(view.quaternion).invert();
    for (const P of parts) P.dir.copy(screenDir(DIRS[P.name] ?? (P.i * 137.5 + 30)));
    const keep = parts.map(P => P.f), kv = { ...v };
    for (const P of parts) { P.f = 0; P.explode.copy(P.ex0); }
    let S = 2 * Math.min(halfW, halfH) * .5 / Math.max(model.size.x, model.height);
    stage.scale.setScalar(S); stage.position.set(0, 0, 0);
    Object.assign(v, { p: 1, ballOn: 0, net: 0, turn: 0 }); apply();
    const ext = screenExtents([model.group], stage, camera, w, h);
    const fw = free.r - free.l, fh = free.b - free.t;
    let k = Math.min(fh * FRAME.fillH[k0] / (ext.u + ext.d), fw * FRAME.fillW[k0] / (ext.l + ext.r));
    const prefer = { x: free.l + fw * FRAME.prefer[0], y: free.t + fh * FRAME.prefer[1] };
    let spot = null;
    for (let i = 0; i < 8 && !spot; i++, k *= .92) {
      const e = { l: ext.l * k, r: ext.r * k, u: ext.u * k, d: ext.d * k };
      spot = placeInFrame({ ext: e, free, avoid, prefer: { x: prefer.x - (e.r - e.l) / 2, y: prefer.y - (e.d - e.u) / 2 } });
    }
    if (spot) k /= .92;
    S *= k;
    stage.scale.setScalar(S);
    const ox = spot ? spot.x : w / 2, oy = spot ? spot.y : h / 2;
    stage.position.set((ox / w * 2 - 1) * halfW, (1 - oy / h * 2) * halfH, 0);
    // the open machine: same origin, offsets shrunk until it fits and keeps off the word
    v.p = 0;
    for (let c = 1, i = 0; i < 10; i++, c *= .86) {
      for (const P of parts) P.explode.copy(P.ex0).multiplyScalar(c);
      apply();
      const e = screenExtents([model.group], stage, camera, w, h);
      const L = ox - e.l, R2 = ox + e.r, Tp = oy - e.u, B2 = oy + e.d;
      const inside = L >= free.l && R2 <= free.r && Tp >= free.t && B2 <= free.b;
      const clear = avoid.every(a => !(L < a.r && R2 > a.l && Tp < a.b && B2 > a.t));
      if (inside && clear) break;
    }
    dist = Math.hypot(halfW, halfH) * 1.35 / S;
    // the framing turn: as much of TURN as keeps the assembled machine inside the free area, 12 px clear of the word
    v.p = 1; v.turn = 1;
    let fit = 0;
    for (const kk of [1, .85, .7, .55, .4, .25]) {
      turnK = kk; apply(); stage.updateMatrixWorld(true);
      const e = screenExtents([model.group], stage, camera, w, h);
      const L = ox - e.l, R2 = ox + e.r, Tp = oy - e.u, B2 = oy + e.d, m = 12;
      if (L >= free.l && R2 <= free.r && Tp >= free.t && B2 <= free.b - m && avoid.every(a => !(L < a.r + m && R2 > a.l - m && Tp < a.b + m && B2 > a.t - m))) { fit = kk; break; }
    }
    turnK = fit; v.turn = 0; apply();
    // the balls' paths against the free area and the word (the throws happen with the machine turned)
    stage.updateMatrixWorld(true);
    if (!plan) plan = buildPlan();
    const px = p => { tmp2.copy(p).applyMatrix4(view.matrixWorld).project(camera); return [(tmp2.x + 1) / 2 * w, (1 - tmp2.y) / 2 * h]; };
    const ok = p => {
      const [x, y] = px(p), m = Math.abs(px(tmp.copy(p).setY(p.y + R))[1] - y) + 3;
      if (x < free.l + m || x > free.r - m || y < free.t + m || y > free.b - m) return false;
      return avoid.every(a => !(x + m > a.l && x - m < a.r && y + m > a.t && y - m < a.b));
    };
    const p = V3();
    const b1 = plan.b1;
    lay.in1 = 0; for (let t = 0; t < .9 && ok(p.copy(b1.c).addScaledVector(b1.v, -t).addScaledVector(GRAV, t * t / 2)); t += 1 / 240) lay.in1 = t;
    const b2 = plan.b2;
    lay.in2 = 0; for (let d = 0; d < 4 && ok(p.copy(b2.foot).addScaledVector(b2.dir, -d)); d += .01) lay.in2 = d;
    v.turn = 1; apply(); stage.updateMatrixWorld(true);
    lay.out = 0; for (let t = 0; t < .6 && ok(p.set(pGrip.x, pGrip.y - G / 2 * t * t, pGrip.z + V_OUT * t)); t += 1 / 480) lay.out = t;
    lay.turn = turnK;
    parts.forEach((P, i) => { P.f = keep[i]; });
    Object.assign(v, kv);
    apply();
  }

  // ---------------------------------------------------------------- the balls as pure functions of reel time
  // spin angle of a wheel whose speed ramps 0 -> w over [t0, t1], holds, ramps w -> 0 over [t2, t3]
  function spinAngle(T, w, t0, t1, t2, t3) {
    if (T <= t0) return 0;
    const up = (t1 - t0) / 2 * w;
    if (T < t1) return w * (T - t0) ** 2 / (2 * (t1 - t0));
    if (T < t2) return up + w * (T - t1);
    const hold = up + w * (t2 - t1);
    if (T < t3) { const s = T - t2; return hold + w * s - w * s * s / (2 * (t3 - t2)); }
    return hold + w * (t3 - t2) / 2;
  }
  // the angle a gripping ball takes out of a wheel: speed loss DIP * (e^-t/out - e^-t/c), integrated
  const DIP_C = 1 / (1 / DIP_IN + 1 / DIP_OUT);
  const dipAngle = t => (t <= 0 ? 0 : DIP * (DIP_OUT * (1 - Math.exp(-t / DIP_OUT)) - DIP_C * (1 - Math.exp(-t / DIP_C))));
  // Flywheels (top, bottom). Display speed SPIN, not the real ~140 rad/s, so the spokes do not strobe; the lower wheel
  // runs BOTTOM_K faster. Up while ball 1 rolls to the feeder, full before it arrives, a dip at each grip, down after.
  function wheels(T, S, out = [0, 0]) {
    const Fd = S[FEED], Ix = S[INDEX], Th2 = S[THROW2], O = S[EXIT];
    const a = spinAngle(T, SPIN, Fd.t0 + .2, Ix.t0, Th2.t1 - .1, O.t0 + 1.2) - SPIN * (dipAngle(T - grip(S, 0)) + dipAngle(T - grip(S, 1)));
    out[0] = a; out[1] = a * BOTTOM_K;
    return out;
  }
  const grip = (S, i) => S[i ? THROW2 : THROW].t0 + (plan ? plan.exit.tGrip : .58);
  // The dual chamber: a half turn with weight (slow start, firm stop), then a hair of settle against its stop.
  function halfTurn(t) {
    if (t <= 0) return 0;
    if (t < IDX_TURN) return Math.PI * (1 - Math.cos(Math.PI * (t / IDX_TURN) ** 1.5)) / 2;
    const s = t - IDX_TURN;
    return Math.PI + .02 * Math.exp(-s / .05) * Math.sin(2 * Math.PI * s / .09);
  }
  const idxAt = (T, S) => halfTurn(T - S[INDEX].t0 - IDX_START) + halfTurn(T - S[INDEX2].t0 - IDX_START);

  // a ball on the bed, from leaving the net to resting in the lower chamber; b.q holds its turn up to separation
  const X_NEG = V3(0, 0, -1);
  function onBed(b, C, t) {
    const L = C.land, s = t - C.t0;
    if (s < 0) {   // falling (spin dies in the net, so none here)
      const f = t - C.sep.t;
      b.p.copy(C.sep.p).addScaledVector(C.sep.v, f).addScaledVector(GRAV, f * f / 2);
      return false;
    }
    const tb = Math.min(s, C.tEnd);
    const x = L.x + C.vx0 * tb + BED_A * tb * tb / 2;
    let hop = 0;
    for (const [h0, u] of C.hops) if (s >= h0 && s < h0 + 2 * u / G) { const k = s - h0; hop = u * k - G / 2 * k * k; }
    const zA = L.z + C.vz0 * .12 * (1 - Math.exp(-tb / .12));
    const w = clamp01((x - L.x) / (BED_X1 - L.x));
    b.p.set(x, bedY(x) + R + hop, lerp(zA, trough.z, w * w * (3 - 2 * w)));
    b.xray = clamp01((x * 1000 - SHIFT[0] + 240) / 90);   // under the bed's cover from x = -204 (CAD)
    let d = x - L.x;
    if (s > C.tEnd) {   // off the sheet: a 22 mm drop into the trough, level into the lower chamber
      const k = s - C.tEnd, xx = Math.min(pLower.x, BED_X1 + C.vEnd * k);
      const y0 = bedY(BED_X1) + R;
      b.p.set(xx, Math.max(trough.y, y0 - G / 2 * k * k), lerp(trough.z, pLower.z, clamp01((xx - BED_X1) / (pLower.x - BED_X1))));
      if (xx >= pLower.x) b.p.copy(pLower);
      d += xx - BED_X1;
      b.xray = 1;
    }
    turn(b, X_NEG, d / R);
    return true;
  }
  // through the feeder and out: the chamber's turn, the exit ramp and elbow, the grip and the throw
  const AX_BEND = V3(1, 0, -1).normalize();
  function feederAndOut(b, T, S, i) {
    const I0 = S[i ? INDEX2 : INDEX].t0 + IDX_START, Th = S[i ? THROW2 : THROW].t0;
    const a = halfTurn(T - I0), E = plan.exit;
    if (T < Th) {   // riding the chamber round the indexer shaft
      b.p.copy(pLower).sub(idxAxis).applyAxisAngle(X_AXIS, -a).add(idxAxis);
      turn(b, X_AXIS, -a);
      b.xray = 1;
      return;
    }
    turn(b, X_AXIS, -Math.PI);
    const u = T - Th;
    if (u < E.tGrip) {   // eases out of the upper chamber, then rolls on at EXIT_V through the elbow
      const s = u < E.tAcc ? EXIT_A * u * u / 2 : E.sAcc + EXIT_V * (u - E.tAcc);
      let r = s;
      const seg = [[pUpper, pExitRamp], [pExitRamp, pTubeIn], [pTubeIn, pBend]];
      let done = false;
      for (let k = 0; k < 3 && !done; k++) { if (r < E.L[k]) { b.p.lerpVectors(seg[k][0], seg[k][1], r / E.L[k]); done = true; } else r -= E.L[k]; }
      if (!done && r < E.L[3]) { const th = r / bendR; b.p.set(bendC.x + Math.sin(th) * bendR, pTubeIn.y, bendC.z - Math.cos(th) * bendR); done = true; }
      else if (!done) { r -= E.L[3]; b.p.lerpVectors(pTubeOut, pGrip, Math.min(1, r / E.L[4])); }
      const straight = E.L[0] + E.L[1] + E.L[2];
      turn(b, X_NEG, Math.min(s, straight) / R);
      if (s > straight) turn(b, AX_BEND, (s - straight) / R);
      b.xray = 1;
      return;
    }
    // gripped and thrown: straight out along the wheels' line (+z) at V_OUT, falling under gravity, with backspin
    turn(b, X_NEG, (E.L[0] + E.L[1] + E.L[2]) / R); turn(b, AX_BEND, (E.L[3] + E.L[4]) / R);
    const k = u - E.tGrip;
    b.p.set(pGrip.x, pGrip.y - G / 2 * k * k, pGrip.z + V_OUT * k);
    b.squash = 1 - .1 * Math.sin(Math.PI * clamp01(k / .05));
    b.xray = 1 - clamp01(k / .04);
    turn(b, X_AXIS, -plan.spinOut * k);
    b.fade = clamp01((lay.out - k) / .04);
    if (k >= lay.out) b.on = 0;
  }
  function ballOne(b, T, S) {
    const P1 = plan.b1, tc = S[PITCH].t0 + PITCH_AT, t = T - tc;
    b.q.identity();
    if (t < -lay.in1) return;
    b.on = 1;
    if (t < 0) {   // flight, ballistic: p = c + v t + g t^2 / 2 (t < 0), backspin
      b.p.copy(P1.c).addScaledVector(P1.v, t).addScaledVector(GRAV, t * t / 2);
      turn(b, P1.spinAxis, PITCH_SPIN * t);
      b.fade = clamp01((t + lay.in1) / .05);
      return;
    }
    turn(b, P1.spinAxis, PITCH_SPIN * .05 * (1 - Math.exp(-Math.min(t, TS) / .05)));   // the net takes the spin
    if (t < TS) { inNet(b, P1, t); return; }
    const C = P1.bed;
    if (t < C.tIn) { onBed(b, C, t); return; }
    turn(b, X_NEG, (pLower.x - C.land.x) / R);
    feederAndOut(b, T, S, 0);
  }
  function ballTwo(b, T, S) {
    const P2 = plan.b2, tc = S[INDEX].t0 + GROUND_AT, t = T - tc;
    b.q.identity();
    const tTop = -P2.tFlight, tFoot = tTop - P2.tRamp;
    if (t < tFoot) {   // rolling in along the ground without slipping
      const d = (tFoot - t) * GROUND_V;
      if (d > lay.in2) return;
      b.on = 1;
      b.p.copy(P2.foot).addScaledVector(P2.dir, -d);
      turn(b, P2.rollAxis, -d / R);
      b.fade = clamp01((lay.in2 - d) / (GROUND_V * .05));
      return;
    }
    b.on = 1;
    const r = Math.min(t, tTop) - tFoot;   // up the ramp: slows at 5/7 g sin(31.4), keeps its speed along the edge
    const s = P2.vPerp * r - RAMP_A * r * r / 2;
    turn(b, P2.rampAxis, Math.hypot(s, P2.vPar * r) / R);
    if (t < tTop) {
      b.p.set(P2.foot.x + P2.vPar * r, P2.foot.y + s * RAMP_N[2], P2.foot.z - s * RAMP_N[1]);
      return;
    }
    const f = Math.min(t, 0) - tTop;       // off the top edge: ballistic, carrying its rolling spin
    turn(b, P2.rampAxis, P2.spin * f);
    if (t < 0) { b.p.copy(P2.top).addScaledVector(P2.v0, f).addScaledVector(GRAV, f * f / 2); return; }
    turn(b, P2.rampAxis, P2.spin * .05 * (1 - Math.exp(-Math.min(t, TS) / .05)));
    if (t < TS) { inNet(b, P2, t); return; }
    const C = P2.bed;
    if (t < C.tIn) { onBed(b, C, t); return; }
    turn(b, X_NEG, (pLower.x - C.land.x) / R);
    feederAndOut(b, T, S, 1);
  }
  // in the net: the pocket follows the ball, the ball sits in the pocket
  function inNet(b, P, t) {
    const k = tanAt(t);
    b.p.set(P.c.x + P.v.x * k, P.c.y + P.v.y * k, 0);
    v.netX = b.p.x; v.netY = b.p.y; v.net = netDepth(P.vn, t); v.netPhase = clamp01(t / NET_RING_S);
    model.setNetImpact(v.netX, v.netY, v.net, v.netPhase);
    b.p.z = model.netZ(b.p.x, b.p.y) + R;
  }
  // the net, from the latest hit (ball 1's ripple has died long before ball 2 arrives; it is blended out anyway)
  function netAt(T, S) {
    const t1 = T - S[PITCH].t0 - PITCH_AT, t2 = two ? T - S[INDEX].t0 - GROUND_AT : -1;
    const P = t2 >= 0 ? plan.b2 : plan.b1, t = t2 >= 0 ? t2 : t1;
    v.net = 0; v.netPhase = 0;
    if (t < 0) return;
    const k = tanAt(Math.min(t, TS));
    v.netX = P.c.x + P.v.x * k; v.netY = P.c.y + P.v.y * k;
    v.net = netDepth(P.vn, t); v.netPhase = clamp01(t / NET_RING_S);
    if (t2 < 0 && two) { const fadeOut = clamp01((T - S[INDEX].t0 - GROUND_AT + .4) / .3); v.net *= 1 - fadeOut; }
    if (v.netPhase >= 1 && v.net < 1e-4) v.net = 0;
  }

  function sample(T, S) {
    if (!plan) plan = buildPlan();
    const E = S[ENTER], A = S[ASSEMBLE], O = S[EXIT];
    // parts arrive bottom-up during ENTER, leave top-down (last built first) after the machine opens in EXIT
    const uIn = win(T, E.t0 - .4, E.t1);
    const pop = ease.inOutSine(win(T, O.t0 + .2, O.t0 + 1.0));
    let fin = 0, fout = 0;
    for (const P of parts) {
      const d = P.i / Math.max(1, n - 1) * .42;
      const inn = ease.outQuart(win(uIn, d, d + .58));
      const r = (n - 1 - P.i) / Math.max(1, n - 1) * .5;
      const out = ease.inCubic(win(T, O.t0 + .75 + r, O.t0 + 1.55 + r));
      P.f = (1 - inn) + out;
      fin += inn; fout += out;
    }
    v.p = ease.inOutSine(win(T, A.t0 - .2, A.t1)) * (1 - pop);
    // the framing turn: eases in once ball 2 is in the net, holds through both throws, eases back before the exit
    v.turn = ease.inOutSine(win(T, S[INDEX].t0 + .6, S[THROW].t0 + .35)) * (1 - ease.inOutSine(win(T, S[THROW2].t0 + .75, S[THROW2].t1)));
    const wh = wheels(T, S, [0, 0]);
    v.top = wh[0]; v.bottom = wh[1];
    v.idx = idxAt(T, S);
    v.shadow = Math.min(fin / n, 1 - fout / n) * (.3 + .7 * v.p);
    v.ballOn = 1;
    netAt(T, S);
    model.setNetImpact(v.netX, v.netY, v.net, v.netPhase);
    for (let i = 0; i < B.length; i++) {
      const b = B[i];
      b.on = 0; b.squash = 1; b.xray = 0; b.fade = 1;
      (i ? ballTwo : ballOne)(b, T, S);
    }
    apply();
  }

  // Leave gracefully from wherever the reel is (scroll or input): a ball out in the open flies off up and out, one
  // inside the feeder or elbow fades with its x-ray; the net lets go, the machine opens and its parts leave
  // last-built first. u 0..1 over ABORT_S.
  const ABORT_S = 2.2;
  function beginAbort() {
    Object.assign(a0, v);
    for (const b of B) b.a0 = { on: b.on, p: b.p.clone(), q: b.q.clone(), xray: b.xray, squash: b.squash, fade: b.fade };
    for (const P of parts) {
      P.f0 = P.f;
      P.us = (n - 1 - P.i) / Math.max(1, n - 1) * .36 + (a0.p > .01 ? .18 : 0);
    }
  }
  function sampleAbort(u) {
    let fin = 0;
    for (const P of parts) {
      P.f = lerp(P.f0, Math.max(P.f0, 1.05), ease.inCubic(win(u, P.us, Math.min(1, P.us + .42))));
      fin += clamp01(1 - P.f);
    }
    v.p = a0.p * (1 - ease.inOutSine(win(u, 0, .4)));
    const k = 1 - win(u, 0, .7);
    v.top = a0.top + SPIN * ABORT_S * .7 * (1 - k * k) / 2; v.bottom = a0.bottom + (v.top - a0.top) * BOTTOM_K;
    v.idx = a0.idx; v.turn = a0.turn * (1 - ease.inOutSine(win(u, 0, .6))); v.net = a0.net * (1 - win(u, 0, .2)); v.netPhase = a0.netPhase; v.netX = a0.netX; v.netY = a0.netY;
    v.ballOn = 1;
    for (const b of B) {
      const s = b.a0;
      if (!s) { b.on = 0; continue; }
      const inside = s.xray > .5;
      b.on = s.on && u < (inside ? .25 : .7) ? 1 : 0;
      b.xray = s.xray * (1 - win(u, 0, .25));
      b.fade = s.fade; b.squash = 1; b.q.copy(s.q);
      b.p.copy(s.p);
      if (!inside) b.p.addScaledVector(dirOut, dist * 1.3 * ease.inCubic(win(u, 0, .7)));
    }
    v.shadow = Math.min(a0.shadow, fin / n);
    apply();
  }

  // Compile every shader and upload every texture before the first run (both balls, their x-ray and fade ghosts).
  async function prewarm(renderer, camera, scene) {
    const hidden = [];
    for (const P of parts) P.f = 0;
    Object.assign(v, { p: 1, ballOn: 1, shadow: 1, xray: 1 });
    B.forEach((b, i) => { b.on = 1; b.xray = 1; b.fade = 1; b.p.copy(pGrip).x += i * .2; });
    apply();
    stage.traverse(o => { if (!o.visible) { hidden.push(o); o.visible = true; } });
    try { await renderer.compileAsync(stage, camera, scene); } catch (e) { /* compiles on first draw instead */ }
    const seen = new Set();
    const upload = t => { if (t && t.isTexture && !seen.has(t)) { seen.add(t); renderer.initTexture(t); } };
    stage.traverse(o => { for (const mt of [].concat(o.material || [])) { for (const k in mt) upload(mt[k]); upload(mt.userData && mt.userData.lookMicroMap); } });
    for (const o of hidden) o.visible = false;
    reset();
  }
  function reset() {
    for (const P of parts) P.f = 1;
    Object.assign(v, REST);
    for (const b of B) { b.on = 0; b.a0 = null; b.xray = 0; b.fade = 1; }
    apply();
  }
  function update() {}

  // LOOK (look.js): the studio, tone, real materials, the rope net and ground shadows, for this actor only. It
  // measures the shadow proxies now, so the parts stand assembled and upright while it runs. If the module does not
  // load or fails, the actor keeps the plain materials and line sets above and the baked decal.
  await Promise.all(accents.map(b => b.ready));
  await tick();
  for (const P of parts) P.f = 0;
  Object.assign(v, REST, { p: 1 }); apply();
  // (the 3D viewer builds the actor without a renderer and draws it plain)
  if (engine.renderer) {
    try { dress = await (await import('./look.js')).dressRoboCatcher({ engine, quality, view, model, balls: accents, parts }); }
    catch (e) { console.warn('[reel] robo-catcher: look failed, using the shared rig', e); }
  }
  if (!dress) {
    shadow = contactShadow();
    shadow.scale.set(model.size.x * 1.25, model.size.z * 1.9, 1);
    shadow.position.set(0, .001, -.02);
    view.add(shadow);
  }
  plan = buildPlan();   // after the look has hung the net: contact points sit on the hanging net
  reset();
  engine.adopt(stage);
  return {
    group: stage, sequence: SEQUENCE, layout, sample, beginAbort, sampleAbort, reset, update, prewarm, abortSeconds: ABORT_S,
    get visible() { return stage.visible; },
    get dress() { return dress; },
    model, accent: ball, accents, parts, values: v,
    // flywheel angles [top, bottom] at reel time T (the case stage carries them on from pass to pass)
    wheels: (T, S) => wheels(T, S, [0, 0]),
    get plan() { return plan; }, lay,
    dispose() { if (dress) dress.dispose(); model.dispose(); for (const b of accents) b.dispose(); if (shadow) { shadow.geometry.dispose(); shadow.material.map.dispose(); shadow.material.dispose(); } },
  };
}
const X_AXIS = new THREE.Vector3(1, 0, 0);

// Soft contact shadow: a unit plane with a radial falloff, scaled to the footprint. Only when the studio look
// (look.js) is not available.
function contactShadow() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), grd = g.createRadialGradient(64, 64, 6, 64, 64, 62);
  grd.addColorStop(0, 'rgba(0,0,0,1)'); grd.addColorStop(.5, 'rgba(0,0,0,.5)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, color: 0x1a1c20, transparent: true, opacity: 0, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.renderOrder = -1;
  return m;
}
