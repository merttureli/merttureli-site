// Robo-Catcher: a showreel project actor (the real machine from the owner's CAD).
// Scaffolded by `python3 tools/new.py actor robo-catcher`. Recipe: docs/recipes/showreel-actor.md
//
// The story (about 15 s between the rocket leaving and coming back):
//   ROBO_ENTER     the machine's parts fly in from off screen to an exploded view
//   ROBO_ASSEMBLE  they come together, ground up: bed, ramps, backstop, feeder, thrower
//   ROBO_PITCH     an optic-yellow softball arcs in and hits the net, which gives, then drops onto the bed
//   ROBO_FEED      the ball rolls down the sloped bed into the feeder's lower chamber; the flywheels spin up
//   ROBO_INDEX     the rotating dual chamber turns 180 degrees and lifts the ball to the exit side
//   ROBO_THROW     the ball runs through the transfer elbow, the flywheels grip it and send it back out
//   ROBO_EXIT      the flywheels spin down, the machine opens up and its parts fly away
//
// Geometry: next/assets/3d/robo-catcher.json/.bin, converted from the owner's render mesh
// (catcher_mesh.npz, 84 parts) by tools/cad/npz_to_cadmesh.py with tools/cad/maps/robo-catcher.npz.json
// (part map, decimation, the owner's material groups from catcher_scene.py). The backstop net and the
// feeder's wire panels are line sets (meta.lines), drawn as 1 px lines as in his render. CAD
// coordinates (mm) reach model space through meta.source.shift_mm; the ball path below is written
// in CAD mm so it can be checked against the part list.
//
// createModel() -> { group, height, footprint, triangles, getParts(), setProgress(p), setSpin(top, bottom),
//                    setIndex(a), setNet(a), parts, dispose() }
// createAccent() -> the ball: { group, radius, dispose() }
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
  ['ROBO_PITCH', 2.2],
  ['ROBO_FEED', 2.3],
  ['ROBO_INDEX', 1.5],
  ['ROBO_THROW', 1.9],
  ['ROBO_EXIT', 2.6],
];
const [ENTER, ASSEMBLE, PITCH, FEED, INDEX, THROW, EXIT] = SEQUENCE.map(s => s[0]);

// Viewing angle (radians): three-quarter view from the front right, a little above, the owner's
// turntable angle with the feeder and thrower nearest the camera.
// [landscape, portrait]. From the front left, so the thrower stands beside the feeder cage, not in
// front of it, and high enough to see the ball roll on the bed behind the ground ramps.
const VIEWS = [{ x: .3, y: .26 }, { x: .3, y: .3 }];
// How much of the hero's free area the assembled machine may take: [landscape, portrait].
const FRAME = { fillW: [.62, .92], fillH: [.9, .62], prefer: [.46, .5] };

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
const LAND = [-735, 0, 1190];                     // y from the bed
const ENTRY = [190, 661 + BALL_R, 1141.5];        // entrance side ramp trough, x 185..216
const LOWER = [273.9, 707.3, 1138.4];             // lower sloped tunnel (rotates to the upper one)
const EXIT_RAMP = [347, 913, 1142];               // exit side ramp trough
const TUBE_IN = [372, 922, 1143.8];               // transfer elbow (Tube), center line y 922
const TUBE_BEND = [396, 922, 1320 - 176];         // straight to here, then a 176 mm bend to +z
const TUBE_OUT = [572, 922, 1320];
const GRIP = [571, 920, 1404];                    // between the flywheels (Softball in the CAD)

// ==================================================================== model
export function createModel({ THREE: T = THREE, quality = 'high' } = {}) {
  const m = buildCadMesh(T, CAD.meta, CAD.buf);
  m.group.name = KEY;
  const P = m.parts;
  const lineGeos = [], lineMats = [];

  // Line sets (net, feeder wire panels): children of their part, so they fly and explode with it.
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
    lines[name] = { seg, base: pos.slice(), pos, attr: g.attributes.position };
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

  // The net gives where the ball hits: a soft dent along -z around the impact point.
  const net = lines.net;
  const hit = mm(HIT[0], HIT[1], 989);
  const hx = hit.x - P.backstop.position.x, hy = hit.y - P.backstop.position.y;
  let netA = 0;
  function setNet(a) {
    if (!net || Math.abs(a - netA) < 1e-5) return;
    netA = a;
    const { base: b, pos } = net;
    for (let i = 0; i < pos.length; i += 3) {
      const dx = b[i] - hx, dy = b[i + 1] - hy;
      pos[i + 2] = b[i + 2] - a * Math.exp(-(dx * dx + dy * dy) / (2 * .2 * .2));
    }
    net.attr.needsUpdate = true;
  }

  setProgress(1);
  const size = new T.Box3().setFromObject(m.group).getSize(new T.Vector3());
  return {
    group: m.group, parts: P, height: size.y, footprint: Math.max(size.x, size.z), size,
    triangles: m.triangles, materials: m.materials,
    getParts: () => list.map(r => ({ name: r.name, mesh: r.mesh, explode: r.explode, dir: DIRS[r.name] })),
    setProgress, setSpin, setIndex, setNet,
    update() {},
    dispose() { m.dispose(); for (const g of lineGeos) g.dispose(); for (const x of lineMats) x.dispose(); },
  };
}

// =================================================================== accent
// Optic-yellow softball, matte, with a pale seam so its roll reads.
export function createAccent({ THREE: T = THREE, quality = 'high' } = {}) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 128);
  g.fillStyle = '#f3f6e6';
  // the classic two-lobe seam: a closed curve on the sphere, plotted into the equirect map
  for (let i = 0; i < 2400; i++) {
    const t = i / 2400 * Math.PI * 2;
    const x = .78 * Math.cos(t) + .22 * Math.cos(3 * t), y = .78 * Math.sin(t) - .22 * Math.sin(3 * t), z = .62 * Math.sin(2 * t);
    const l = Math.hypot(x, y, z), u = (Math.atan2(x / l, z / l) / (Math.PI * 2) + .5) * 256, v = Math.acos(y / l) / Math.PI * 128;
    g.fillRect(u - 1.4, v - 1.4, 2.8, 2.8);
  }
  const tex = new T.CanvasTexture(c);
  tex.colorSpace = T.SRGBColorSpace;
  const r = BALL_R / 1000;
  const geo = new T.SphereGeometry(r, quality === 'low' ? 18 : 28, quality === 'low' ? 12 : 18);
  const material = new T.MeshStandardMaterial({ color: 0xcfe23c, map: tex, roughness: .82, metalness: 0 });
  const group = new T.Group();
  group.name = KEY + ':ball';
  const mesh = new T.Mesh(geo, material);
  mesh.name = 'ball';
  group.add(mesh);
  // X-ray ghost: while the ball is inside the feeder and the elbow it shows through them faintly,
  // the way the owner's CHARGER clip reveals its internals.
  const ghostMat = new T.MeshBasicMaterial({ color: 0xd8ec3e, transparent: true, opacity: 0, depthTest: false, depthWrite: false });
  const ghost = new T.Mesh(geo, ghostMat);
  ghost.name = 'ballXray'; ghost.renderOrder = 10; ghost.visible = false;
  group.add(ghost);
  return { group, mesh, ghost, radius: r, dispose() { geo.dispose(); material.dispose(); ghostMat.dispose(); tex.dispose(); } };
}

// ==================================================================== actor
export async function createActor(ctx) {
  const { engine, quality = 'high' } = ctx;
  const base = { THREE, renderer: engine.renderer, quality };
  const model = createModel(base);
  const ball = createAccent(base);

  // stage (placed and scaled by layout) > view (viewing angle) > model, ball, shadow
  const stage = new THREE.Group(), view = new THREE.Group();
  stage.name = KEY + ':stage';
  stage.add(view);
  view.rotation.set(VIEWS[0].x, VIEWS[0].y, 0);
  view.add(model.group, ball.group);
  const shadow = contactShadow();
  shadow.scale.set(model.size.x * 1.25, model.size.z * 1.9, 1);
  shadow.position.set(0, .001, -.02);
  view.add(shadow);
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

  // Ball path pieces in model space.
  const V = (a) => mm(a[0], a[1], a[2]);
  const pHit = V(HIT), pLand = mm(LAND[0], rampY(LAND[0]) + BALL_R, LAND[2]);
  const pEntry = V(ENTRY), pLower = V(LOWER), pExitRamp = V(EXIT_RAMP);
  const pTubeIn = V(TUBE_IN), pBend = V(TUBE_BEND), pTubeOut = V(TUBE_OUT), pGrip = V(GRIP);
  const idxAxis = mm(0, AX.indexer[0], AX.indexer[1]);
  const bendC = mm(TUBE_BEND[0], 922, 1320), bendR = (TUBE_OUT[0] - TUBE_BEND[0]) / 1000;
  // flight in (from the pitcher: front left, high) and back out (to the pitcher: front, a little left, rising)
  const dirIn = new THREE.Vector3(-.85, .55, .75).normalize(), dirOut = new THREE.Vector3(-.5, .9, .9).normalize();
  const R = ball.radius;

  const REST = { p: 0, top: 0, bottom: 0, idx: 0, net: 0, shadow: 0, ballOn: 0, xray: 0 };
  const v = { ...REST }, a0 = { ...REST };
  const bp = new THREE.Vector3(), a0ball = new THREE.Vector3();   // ball position, captured at abort
  const roll = new THREE.Euler();
  let dist = 6, ballSquash = 1;
  const q = new THREE.Quaternion(), tmp = new THREE.Vector3(), piv = new THREE.Vector3();

  function apply() {
    model.setProgress(v.p);
    model.setSpin(v.top, v.bottom);
    model.setIndex(v.idx);
    model.setNet(v.net);
    let any = false;
    for (const P of parts) {
      if (P.f < .999) any = true;
      q.setFromAxisAngle(P.axis, P.spin * P.f);
      piv.copy(P.mesh.position);
      tmp.copy(piv).applyQuaternion(q);
      P.wrap.quaternion.copy(q);
      P.wrap.position.copy(P.dir).multiplyScalar(dist * P.f).add(piv).sub(tmp);
    }
    ball.group.visible = v.ballOn > 0;
    if (ball.group.visible) {
      ball.group.position.copy(bp);
      ball.mesh.rotation.copy(roll);
      ball.mesh.scale.set(1 / Math.sqrt(ballSquash), ballSquash, 1 / Math.sqrt(ballSquash));
      ball.ghost.scale.copy(ball.mesh.scale);
    }
    ball.ghost.visible = ball.group.visible && v.xray > .01;
    ball.ghost.material.opacity = .55 * v.xray;
    shadow.material.opacity = .34 * v.shadow;
    stage.visible = any || ball.group.visible;
  }

  // Framing (resize only): size the assembled machine to the hero's free area, clear of the drift
  // word, then shrink the explode offsets until the open machine fits the same box too. Portrait
  // turns the machine more side-on, so its long bed takes less width and the feeder comes closer.
  function layout(F) {
    const { halfW, halfH, camera, w, h, free, avoid } = F;
    const k0 = w < h ? 1 : 0, VW = VIEWS[k0];
    view.rotation.set(VW.x, VW.y, 0);
    view.updateMatrixWorld(true);
    inv.copy(view.quaternion).invert();
    for (const P of parts) P.dir.copy(screenDir(DIRS[P.name] ?? (P.i * 137.5 + 30)));
    const keep = parts.map(P => P.f), kv = { ...v };
    for (const P of parts) { P.f = 0; P.explode.copy(P.ex0); }
    let S = 2 * Math.min(halfW, halfH) * .5 / Math.max(model.size.x, model.height);
    stage.scale.setScalar(S); stage.position.set(0, 0, 0);
    Object.assign(v, { p: 1, ballOn: 0 }); apply();
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
      const L = ox - e.l, R2 = ox + e.r, Tp = oy - e.u, B = oy + e.d;
      const inside = L >= free.l && R2 <= free.r && Tp >= free.t && B <= free.b;
      const clear = avoid.every(a => !(L < a.r && R2 > a.l && Tp < a.b && B > a.t));
      if (inside && clear) break;
    }
    dist = Math.hypot(halfW, halfH) * 1.35 / S;
    parts.forEach((P, i) => { P.f = keep[i]; });
    Object.assign(v, kv);
    apply();
  }

  // ---- the ball as a pure function of reel time
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
  const rollTo = (d, ax) => { roll.set(0, 0, 0); roll[ax] = d / R; };
  function ballAt(T, S) {
    const Pt = S[PITCH], Fd = S[FEED], Ix = S[INDEX], Th = S[THROW];
    ballSquash = 1;
    v.ballOn = 1;
    v.xray = 0;
    const t = T - Pt.t0;
    if (T < Pt.t0 + .1) { v.ballOn = 0; return; }
    if (t < 1.0) {                          // flight in, ballistic: straight line plus a parabola
      const s = (t - .1) / .9;
      bp.copy(pHit).addScaledVector(dirIn, dist * 1.25 * (1 - s));
      bp.y += .9 * 4 * s * (1 - s) * (dist / 6);
      rollTo(-s * 14, 'x');
      return;
    }
    if (t < 1.16) {                         // into the net and out again
      const s = (t - 1.0) / .16;
      bp.copy(pHit); bp.z -= Math.sin(Math.PI * s) * .09;
      rollTo(-14 - s * .5, 'x');
      return;
    }
    if (t < 1.56) {                         // drops onto the bed (g = 9.8 m/s^2, a little forward drift)
      const s = (t - 1.16) / .4;
      bp.lerpVectors(pHit, pLand, s); bp.y = lerp(pHit.y, pLand.y, s * s);
      rollTo(-14.5 - s, 'x');
      return;
    }
    if (T < Fd.t0) {                        // two small bounces, settling
      const s = (t - 1.56) / (Fd.t0 - Pt.t0 - 1.56);
      bp.copy(pLand);
      bp.y += s < .62 ? .05 * Math.sin(Math.PI * s / .62) : .012 * Math.sin(Math.PI * (s - .62) / .38);
      rollTo(-15.5, 'x');
      return;
    }
    if (T < Fd.t1) {                        // rolls down the bed, speeding up, into the feeder trough and the lower chamber
      const u = win(T, Fd.t0, Fd.t1);
      const a = u < .78 ? ease.inQuad(u / .78) * .92 : .92 + (u - .78) / .22 * .08;
      if (a < .86) {
        const s = a / .86, x = lerp(LAND[0], ENTRY[0] - 4, s);
        v.xray = clamp01((x + 240) / 90);   // under the bed's cover from x = -204
        mm(x, rampY(x) + BALL_R, lerp(LAND[2], ENTRY[2], ease.inOutSine(s)), bp);
        rollTo(-(x - LAND[0]) / 1000, 'z');
      } else {
        const s = (a - .86) / .14, x = lerp(ENTRY[0] - 4, LOWER[0], s);
        v.xray = 1;
        const yDrop = lerp(rampY(ENTRY[0] - 4) + BALL_R, LOWER[1], Math.min(1, s * 2.2));
        mm(x, yDrop, lerp(ENTRY[2], LOWER[2], s), bp);
        rollTo(-(x - LAND[0]) / 1000, 'z');
      }
      return;
    }
    const rolled = -(LOWER[0] - LAND[0]) / 1000;
    if (T < Ix.t1) {                        // rides the chamber round, 180 degrees about the indexer shaft
      const a = v.idx;
      tmp.copy(pLower).sub(idxAxis);
      tmp.applyAxisAngle(X_AXIS, -a);
      bp.copy(idxAxis).add(tmp);
      roll.set(-a, 0, rolled / R);
      v.xray = 1;
      return;
    }
    const u = T - Th.t0;
    if (u < .34) {                          // out of the upper chamber onto the exit ramp, into the elbow
      const s = ease.inQuad(u / .34);
      tmp.copy(pLower).sub(idxAxis).applyAxisAngle(X_AXIS, -Math.PI);
      const from = tmp.add(idxAxis);
      if (s < .6) bp.lerpVectors(from, pExitRamp, s / .6); else bp.lerpVectors(pExitRamp, pTubeIn, (s - .6) / .4);
      roll.set(-Math.PI, 0, (rolled - s * .1) / R);
      v.xray = 1;
      return;
    }
    if (u < .62) {                          // through the transfer elbow (hidden inside it)
      const s = (u - .34) / .28, L1 = pBend.x - pTubeIn.x, L2 = Math.PI / 2 * bendR, a = s * (L1 + L2);
      if (a < L1) bp.set(pTubeIn.x + a, pTubeIn.y, pTubeIn.z);
      else { const th = (a - L1) / bendR; bp.set(bendC.x + Math.sin(th) * bendR, pTubeIn.y, bendC.z - Math.cos(th) * bendR); }
      v.xray = 1;
      return;
    }
    if (u < .74) {                          // gripped between the flywheels: a quick squeeze
      const s = (u - .62) / .12;
      bp.lerpVectors(pTubeOut, pGrip, s);
      ballSquash = 1 - .14 * Math.sin(Math.PI * s);
      v.xray = 1 - s;
      roll.set(-Math.PI - s * 3, 0, 0);
      return;
    }
    // launched back to the pitcher: fast and straight out, then the arc
    const s = (u - .74) / .7;
    if (s > 1) { v.ballOn = 0; return; }
    bp.copy(pGrip).addScaledVector(dirOut, dist * 1.4 * s);
    bp.y -= .25 * s * s * (dist / 6);
    roll.set(-Math.PI - 3 - s * 24, 0, 0);
  }

  function sample(T, S) {
    const E = S[ENTER], A = S[ASSEMBLE], Fd = S[FEED], Ix = S[INDEX], Th = S[THROW], O = S[EXIT];
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
    // flywheels: spin up while the ball is fed, full speed for the throw, spin down as the machine opens
    const sp = spinAngle(T, SPIN, Fd.t0 + .4, Ix.t0 + .6, Th.t1 - .1, O.t0 + 1.2);
    v.top = sp; v.bottom = sp;
    v.idx = Math.PI * ease.inOutCubic(win(T, Ix.t0 + .12, Ix.t1 - .12));
    const tn = T - S[PITCH].t0 - 1.0;   // net: dent with the ball, then a damped swing
    v.net = tn < 0 ? 0 : tn < .08 ? .13 * Math.sin(Math.PI / 2 * tn / .08) : .13 * Math.exp(-(tn - .08) * 5.5) * Math.cos((tn - .08) * 15);
    v.shadow = Math.min(fin / n, 1 - fout / n) * (.3 + .7 * v.p);
    ballAt(T, S);
    apply();
  }

  // Leave gracefully from wherever the reel is (scroll or input): the ball flies off up and out,
  // the machine opens and its parts leave last-built first. u 0..1 over ABORT_S.
  const ABORT_S = 2.2;
  function beginAbort() {
    Object.assign(a0, v);
    a0ball.copy(bp);
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
    v.top = a0.top + SPIN * ABORT_S * .7 * (1 - k * k) / 2; v.bottom = v.top;
    v.idx = a0.idx; v.net = a0.net * (1 - win(u, 0, .2));
    // a ball in the open flies off; one inside the feeder or elbow fades with its x-ray and stays put
    const inside = a0.xray > .5;
    v.ballOn = a0.ballOn && u < (inside ? .25 : .7) ? 1 : 0;
    v.xray = a0.xray * (1 - win(u, 0, .25));
    bp.copy(a0ball);
    if (!inside) bp.addScaledVector(dirOut, dist * 1.3 * ease.inCubic(win(u, 0, .7)));
    v.shadow = Math.min(a0.shadow, fin / n);
    apply();
  }

  // Compile every shader and upload every texture before the first run.
  async function prewarm(renderer, camera, scene) {
    const hidden = [];
    for (const P of parts) P.f = 0;
    Object.assign(v, { p: 1, ballOn: 1, shadow: 1, xray: 1 });
    bp.copy(pGrip);
    apply();
    stage.traverse(o => { if (!o.visible) { hidden.push(o); o.visible = true; } });
    try { await renderer.compileAsync(stage, camera, scene); } catch (e) { /* compiles on first draw instead */ }
    const seen = new Set();
    const upload = t => { if (t && t.isTexture && !seen.has(t)) { seen.add(t); renderer.initTexture(t); } };
    stage.traverse(o => { for (const mt of [].concat(o.material || [])) for (const k in mt) upload(mt[k]); });
    for (const o of hidden) o.visible = false;
    reset();
  }
  function reset() { for (const P of parts) P.f = 1; Object.assign(v, REST); apply(); }
  function update() {}

  reset();
  engine.adopt(stage);
  return {
    group: stage, sequence: SEQUENCE, layout, sample, beginAbort, sampleAbort, reset, update, prewarm, abortSeconds: ABORT_S,
    get visible() { return stage.visible; },
    model, accent: ball, parts, values: v,
    dispose() { model.dispose(); ball.dispose(); shadow.geometry.dispose(); shadow.material.map.dispose(); shadow.material.dispose(); },
  };
}
const X_AXIS = new THREE.Vector3(1, 0, 0);

// Soft contact shadow: a unit plane with a radial falloff, scaled to the footprint.
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
