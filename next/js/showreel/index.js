// SHOWREEL: the hero as a live, calm showreel with CHARGER at its centre.
//
// REST is the hero as it always was: the rocket swaying, the names drifting.
// If the visitor stays on the hero (no scroll, no input) for a few seconds the
// rocket flies off nose first, a guest project plays its sequence, and the
// rocket glides back in from behind. Any scroll or input returns to REST
// smoothly from wherever the reel is. Rendering stops whenever the hero is off
// screen or the tab is hidden; REST costs exactly what the rocket always did.
//
// Projects plug in through registerProject({ key, word, actor, sequence }):
//   key      stable id                       'therma-shift'
//   word     the drift word that represents it (must match a .drift <i>)
//   actor    async factory (ctx) -> scene actor (see createThermaShift)
//   sequence [[STATE_NAME, seconds], ...]    the actor's part of the reel
// The actor the factory resolves to:
//   group                 added to the shared scene (engine.adopt() gives its
//                         materials the studio environment)
//   sequence              [[STATE, seconds], ...] its part of the reel, after
//                         ROCKET_EXIT (first guest of a session) or a short
//                         HANDOVER lead-in (every later guest); state windows
//                         reach sample() as states[STATE] = { t0, t1 }
//   layout(frame)         size/place itself: { halfW, halfH, camera, w, h,
//                         free: {l,t,r,b}, avoid: [rects] } (canvas px)
//   sample(T, states)     pose everything as a pure function of reel time
//   beginAbort()/sampleAbort(u)  leave gracefully from wherever it is, u 0..1
//   reset(), update(dt, time), prewarm(renderer, camera, scene), visible
//   dispose()             optional; called when a project is unloaded
// The cycle: REST shows the rocket. After the idle delay the rocket exits once
// and the guests then play back to back in registration order, round and
// round: each guest's exit flows into the next guest's entry (a short overlap,
// the next guest's HANDOVER lead-in), with no rocket in between. Any scroll or
// input: the guest on stage leaves gracefully and the rocket returns to REST;
// the next session resumes with the following guest. Each guest is built and
// prewarmed the first time it is due, during the previous guest's calm middle
// (never during a handover), and then kept for reuse (up to three guests;
// beyond that, the one that just played is disposed), so a long idle session
// stays flat and, after the first round, builds and compiles nothing. To add
// one: write its actor, then registerProject() here before mountShowreel runs
// (its word must exist in the .drift markup); `python3 tools/new.py actor
// <key> --register` does both. HOTBOX and the bend fixture are never animated.
//
// Debug: #reel-<key> (or ?reel=<key>) starts a session now with that project
// (the rotation continues after it), e.g. #reel-therma-shift, alias
// #reel-coaster; the `c` key starts a session; #reel-fast at 3x
// (#reel-<key>-fast both). window.__reel: project (playing), next, use(key),
// seek(t, key) (that guest's first-of-session timeline), advance(dt) (the live
// machine, handovers included), pause/resume, hitRocket(clientX, clientY) (is the
// REST rocket under that point; the CHARGER explorer opens from it). Fires
// `reel:ready` (detail: window.__reel) once mounted.
import { THREE, createEngine, createTimeline, ease, win, clamp01, lerp, placeInFrame, screenExtents } from './engine.js';
import { createRocket, applyCamera } from '../hero3d.js';

// ---------------------------------------------------------------- registry
const projects = [];
export function registerProject(p) { projects.push(p); return p; }

const HOME = { key: 'charger', word: 'CHARGER' };
const EXIT = 'ROCKET_EXIT', HANDOVER = 'HANDOVER';
const LEAD = .7, OVERLAP = .55, HAND_AT = .5;   // next guest's lead-in; it starts at the latest OVERLAP s before the
// end of the last guest's exit, or HAND_AT of the way into that exit, whichever is sooner
const SPIN = 1.7; // extra roll (rad) the rocket picks up as it accelerates away

// ======================================================= Therma-Shift actor
// Loads the specialists' modules; anything missing or broken falls back to
// the PLACEHOLDER factories at the bottom of this file, which share the API.
async function loadModules() {
  const [c, p, f, k] = await Promise.allSettled([import('./coaster.js'), import('./props.js'), import('./fx.js'), import('./cable.js')]);
  const pick = (r, name) => { if (r.status === 'fulfilled') return r.value; console.info(`[reel] ${name}.js not available, using placeholder`, r.reason && r.reason.message); return null; };
  return { coaster: pick(c, 'coaster'), props: pick(p, 'props'), fx: pick(f, 'fx'), cable: pick(k, 'cable') };
}
function safe(label, real, fallback) {
  if (real) { try { const v = real(); if (v) return v; } catch (e) { console.warn(`[reel] ${label} failed, using placeholder`, e); } }
  return fallback();
}

// Clip-free choreography for the coaster parts. Parts leave top-down, each
// only once its own disassembly has finished, along paths that fan upward and
// out to the side the part sits on: lower parts start later and climb more
// slowly than the ones above them, so gaps only ever open. The shell, last
// and lowest, drops away. Arrival is the mirror image, bottom-up.
const OUT_U = .45;                  // share of EXPLODE spent un-building (p 1 -> 0)
const FLY = .38;                    // share of EXPLODE one part's flight takes
const LAG = .045;                   // minimum gap between consecutive departures

async function createThermaShift(ctx) {
  const { engine, quality } = ctx;
  const mods = await loadModules();
  const base = { THREE, renderer: engine.renderer, quality };
  const coaster = safe('coaster', mods.coaster && (() => mods.coaster.default(base)), () => placeholderCoaster(base));
  const mug = safe('mug', mods.props && mods.props.createMug && (() => mods.props.createMug(base)), () => placeholderMug(base));
  const can = safe('can', mods.props && mods.props.createCan && (() => mods.props.createCan(base)), () => placeholderCan(base));
  const fx = mods.fx || {};
  const steam = safe('steam', fx.createSteam && (() => fx.createSteam({ ...base, radius: mug.rimRadius || .034, height: .12 })), () => placeholderSteam(base));
  const canBody = can.bodyMesh || can.body || firstMesh(can.group);
  const cond = safe('condensation', fx.applyCondensation && (() => fx.applyCondensation(canBody, { THREE, renderer: engine.renderer, quality })), () => placeholderCondensation(canBody));
  const ring = safe('water ring', fx.createWaterRing && (() => fx.createWaterRing({ ...base, radius: can.radius || .033 })), () => null);

  // stage (framed per layout) > view (viewing angle) > coaster, props, shadow
  const stage = new THREE.Group(), view = new THREE.Group();
  stage.add(view);
  view.rotation.set(.4, -.62, 0);
  view.add(coaster.group, mug.group, can.group);
  // the USB-C cable that plugs in after assembly (only with the CAD coaster, which knows where its port is);
  // its rope is simulated once, here, and baked
  const cable = coaster.port && mods.cable ? safe('cable', () => mods.cable.createCable({ THREE, quality, port: coaster.port, ground: -coaster.height, box: coaster.caseBounds }), () => null) : null;
  if (cable) view.add(cable.group);
  mug.group.add(steam.group);
  steam.group.position.y = mug.coffeeY || .074;
  mug.group.rotation.y = .9; can.group.rotation.y = -.4;
  // contact shadow: the coaster's own baked decal if it has one
  const shadow = coaster.setShadowOpacity ? null : contactShadow(.2);
  if (shadow) { shadow.position.y = -(coaster.height || .045) - .0015; view.add(shadow); }
  const setShadow = a => (shadow ? (shadow.material.opacity = .42 * a) : coaster.setShadowOpacity(a));
  // the wet ring the can leaves rides on the top plate
  const plate = (coaster.parts && coaster.parts.topPlate) || (coaster.getParts && (coaster.getParts().find(p => p.name === 'topPlate') || {}).mesh);
  if (ring && plate) {
    coaster.setProgress(1);
    plate.add(ring.group);
    ring.group.position.set(-plate.position.x, .0004 - plate.position.y, -plate.position.z);
  }
  stage.visible = false;
  stage.updateMatrixWorld(true);

  // Parts: wrap each in a pivot group so the reel can fly it in and out
  // without touching the coaster's own setProgress transforms.
  const inv = new THREE.Quaternion().copy(view.quaternion).invert();
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(inv);   // screen-right in view space (prop arcs)
  const raw = coaster.getParts ? coaster.getParts() : [];
  const n = raw.length || 1;
  coaster.setProgress(0);
  const parts = raw.map((p, i) => {
    const mesh = p.mesh, parent = mesh.parent, wrap = new THREE.Group();
    parent.add(wrap); wrap.add(mesh);
    const center = new THREE.Vector3();
    if (mesh.geometry) { mesh.geometry.computeBoundingSphere(); center.copy(mesh.geometry.boundingSphere.center); }
    else { const b = new THREE.Box3().setFromObject(mesh); mesh.updateWorldMatrix(true, false); b.getCenter(center); mesh.worldToLocal(center); }
    // screen-x of the part in the exploded stack decides which side it leaves by
    const sx = center.clone().add(mesh.position).applyQuaternion(view.quaternion).x;
    const a = p.win ? p.win[0] : 1 - (i + .5) / n;   // p at which it is fully un-built
    const axis = new THREE.Vector3(Math.sin(i * 2.1 + 1), Math.cos(i * 1.7), Math.sin(i * 3.3 + 2)).normalize();
    return { name: p.name, mesh, wrap, center, axis, sx, a, build: i, explode: p.explode, ex0: p.explode ? p.explode.clone() : null, dir: new THREE.Vector3(), spin: 0, fs: 0, f: 1, f0: 1, us: 0 };
  });
  // A part whose exploded offset leaves it inside the shell (heatsink, blower) is
  // only free once the shell itself has dropped away, i.e. at p = 0.
  {
    const ref = new THREE.Matrix4(), mm = new THREE.Matrix4(), tb = new THREE.Box3();
    const localBox = (obj, bb) => {
      bb.makeEmpty(); coaster.group.updateWorldMatrix(true, true); ref.copy(coaster.group.matrixWorld).invert();
      obj.traverse(m => { if (!m.isMesh || (m.material && m.material.transparent)) return; if (!m.geometry.boundingBox) m.geometry.computeBoundingBox(); mm.multiplyMatrices(ref, m.matrixWorld); bb.union(tb.copy(m.geometry.boundingBox).applyMatrix4(mm)); });
      return bb;
    };
    const shellP = parts.find(P => P.name === 'shell'), sb = new THREE.Box3(), pb = new THREE.Box3();
    if (shellP) for (const P of parts) {
      if (P === shellP || P.a <= 0) continue;
      coaster.setProgress(P.a);
      localBox(shellP.mesh, sb).expandByScalar(-.001);
      if (sb.intersectsBox(localBox(P.mesh, pb))) P.a = 0;
    }
  }
  coaster.setProgress(1);
  // rank from the top (first to leave) and the paths
  // first to leave: highest un-build point, then (for parts freed together) the higher build index
  const byTop = parts.slice().sort((x, y) => (y.a - x.a) || (y.build - x.build));
  byTop.forEach((P, r) => {
    let deg;
    if (r === byTop.length - 1) deg = -98;                          // the shell, last and lowest, drops away
    else {
      // centred parts leave to the left, clear of the parts that slide out to the right (board, thermistor)
      const side = Math.abs(P.sx) < .006 ? -1 : Math.sign(P.sx);
      deg = 90 - side * (14 + 52 * r / Math.max(1, byTop.length - 2));
    }
    P.dir.set(Math.cos(deg * Math.PI / 180), Math.sin(deg * Math.PI / 180), .12).normalize().applyQuaternion(inv);
    P.spin = (r % 2 ? -1 : 1) * (/topPlate|shell|heatsink/.test(P.name) ? .16 : .34);
    // EXPLODE time (share) at which p falls to P.a, i.e. its disassembly is done
    const k = 1 - P.a;                                            // inOutSine(e / OUT_U) = k
    P.fs = OUT_U * Math.acos(1 - 2 * k) / Math.PI;
    P.top = r;
  });
  // a minimum lag between consecutive departures keeps the order strict
  for (let r = 1; r < byTop.length; r++) byTop[r].fs = Math.max(byTop[r].fs, byTop[r - 1].fs + LAG);

  const ST = {
    sequence: cable
      ? [['COASTER_ENTER', 3.0], ['ASSEMBLE', 5.0], ['PLUG', 2.4], ['MUG_DROP', 1.9], ['WARM', 6.2], ['SWAP', 3.2], ['CHILL', 6.6], ['CAN_EXIT', 1.7], ['UNPLUG', 1.6], ['BEAT', 1.0], ['EXPLODE', 3.4]]
      : [['COASTER_ENTER', 3.0], ['ASSEMBLE', 5.0], ['MUG_DROP', 1.9], ['WARM', 6.5], ['SWAP', 3.2], ['CHILL', 7.0], ['CAN_EXIT', 1.7], ['BEAT', 1.3], ['EXPLODE', 3.4]],
  };
  const v = { p: 0, mugY: 1, canY: 1, mugArc: 0, canArc: 0, temp: 22, steam: 0, cond: 0, wet: 0, fan: 0, shadow: 0 }; // live values
  const a0 = { ...v };                                                        // captured at abort
  let dist = 2, drop = .5, lift = 0, lastTemp = -99, lastFan = -1;
  const ARC = .17;                  // sideways travel (view units) of the props' entry/exit arcs
  const q = new THREE.Quaternion(), tmp = new THREE.Vector3(), piv = new THREE.Vector3();

  // Framing: measure the assembled coaster + can on screen, size it to the
  // free area of the hero, and place it clear of the focused drift word.
  function layout(F) {
    const { halfW, halfH, camera, w, h, free, avoid } = F;
    const narrow = w < h;
    let S = 2 * Math.min(halfW, halfH) * (narrow ? .44 : .3) / .11;
    stage.scale.setScalar(S); stage.position.set(0, 0, 0);
    const keep = parts.map(P => P.f), kp = v.p, kc = v.canY, km = v.mugY, ka = v.canArc;
    for (const P of parts) P.f = 0;
    v.p = 1; v.canY = 0; v.mugY = 1; v.canArc = 0; apply();
    const ext = screenExtents([coaster.group, can.group], stage, camera, w, h);
    // where the cable leaves the port, relative to the origin on screen (px at this scale): the spot must leave the
    // cable a clear run from the port to the left edge, above the marquee and clear of the word
    let portOff = null;
    if (cable) {
      stage.updateMatrixWorld(true);
      const o = new THREE.Vector3().setFromMatrixPosition(stage.matrixWorld).project(camera);
      const q = coaster.port.position.clone().addScaledVector(coaster.port.normal, 0.03).applyMatrix4(view.matrixWorld).project(camera);
      portOff = { x: (q.x - o.x) / 2 * w, y: -(q.y - o.y) / 2 * h };
    }
    parts.forEach((P, i) => { P.f = keep[i]; }); v.p = kp; v.canY = kc; v.mugY = km; v.canArc = ka;
    const fw = free.r - free.l, fh = free.b - free.t;
    const k0 = Math.min(fh * (narrow ? .56 : .84) / (ext.u + ext.d), fw * (narrow ? .8 : .4) / (ext.l + ext.r));
    const prefer = { x: free.l + fw * (narrow ? .5 : .54), y: free.t + fh * .5 };
    // with the cable, weigh each size's best spot against shrinking (a centred, slightly smaller product beats one
    // pushed to the edge); without it, the largest size that fits wins as before
    let spot = null, k = k0, bestCost = Infinity, bestK = k0;
    for (let i = 0; i < 5 && (portOff || !spot); i++, k *= .9) {
      const e = { l: ext.l * k, r: ext.r * k, u: ext.u * k, d: ext.d * k };
      const kk = k, left = (F.vp ? F.vp.l : 0) - 10;
      const test = portOff && (avoid.length || F.vp) ? (x, y) => {
        const px = x + portOff.x * kk, py = y + portOff.y * kk;
        if (py > free.b - 14) return false;
        for (const r of avoid) if (py > r.t - 30 && py < r.b + 30 && r.r + 30 > left && r.l - 30 < px) return false;
        return true;
      } : null;
      const s1 = placeInFrame({ ext: e, free, avoid, test, wy: test ? .5 : 1.4, prefer: { x: prefer.x - (e.r - e.l) / 2, y: prefer.y - (e.d - e.u) / 2 } });
      if (!portOff) { spot = s1; continue; }
      const cost = s1 ? s1.d + (1 - k / k0) ** 2 * 6e5 : Infinity;
      if (cost < bestCost) { bestCost = cost; spot = s1; bestK = k; }
    }
    if (portOff) k = bestK; else k /= spot ? .9 : 1;
    S *= k;
    stage.scale.setScalar(S);
    const ox = spot ? spot.x : w / 2, oy = spot ? spot.y : h / 2;
    stage.position.set((ox / w * 2 - 1) * halfW, (1 - oy / h * 2) * halfH, 0);
    dist = Math.hypot(halfW, halfH) * 1.3 / S;              // local units to be well off screen
    drop = ((oy / h) * 2 * halfH + .12) / (S * .9) + .02;   // lifts props clear of the top edge
    // The exploded stack is taller than the assembled coaster: compress the
    // explode offsets to fit the free height and centre the stack while open.
    for (const P of parts) if (P.explode) P.explode.copy(P.ex0);
    lift = 0;
    for (const P of parts) P.f = 0;
    v.p = 0; apply();
    const e0 = screenExtents([coaster.group], stage, camera, w, h);
    let bottom = free.b;  // stop above the caption word if it sits under the stack
    for (const a of avoid) if (a.l < ox + e0.r && a.r > ox - e0.l && a.t > oy) bottom = Math.min(bottom, a.t);
    const span = e0.u + e0.d, room = (bottom - free.t) * .96;
    if (span > room) { const c = room / span; for (const P of parts) if (P.explode) P.explode.multiplyScalar(c); e0.u *= c; e0.d *= c; }
    const centre = oy + (e0.d - e0.u) / 2, want = (free.t + bottom) / 2;
    lift = -((want - centre) / h * 2 * halfH) / S;
    parts.forEach((P, i) => { P.f = keep[i]; }); v.p = kp;
    apply();
    if (cable) anchorCable(F);
  }

  // The cable's far end: just beyond the nearest edge of the viewport, along the shortest run from the port that
  // stays clear of the drift word and above the marquee (leftward: away from the coaster's faces). Resize-time only.
  function anchorCable(F) {
    const { camera, w, h, free, avoid, vp } = F;
    stage.updateMatrixWorld(true);
    const M = view.matrixWorld, inv = new THREE.Matrix4().copy(M).invert();
    const p = coaster.port.position.clone().addScaledVector(coaster.port.normal, 0.03).applyMatrix4(M).project(camera);
    const sx = (p.x + 1) / 2 * w, sy = (1 - p.y) / 2 * h;
    const edge = vp || { l: 0, t: 0, r: w, b: h };
    const hits = (x0, y0, x1, y1, r) => {          // segment against rect (Liang-Barsky)
      let t0 = 0, t1 = 1; const dx = x1 - x0, dy = y1 - y0;
      for (const [pp, q] of [[-dx, x0 - r.l], [dx, r.r - x0], [-dy, y0 - r.t], [dy, r.b - y0]]) {
        if (pp === 0) { if (q < 0) return false; continue; }
        const t = q / pp; if (pp < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
      }
      return true;
    };
    // a pixel to a point on the ground plane (coaster space)
    const gy = -coaster.height, ndc = new THREE.Vector3();
    const ground = (x, y) => {
      ndc.set(x / w * 2 - 1, 1 - y / h * 2, -1);
      const a0 = ndc.clone().unproject(camera).applyMatrix4(inv), a1 = ndc.clone().setZ(1).unproject(camera).applyMatrix4(inv);
      return a0.lerp(a1, (gy - a0.y) / (a1.y - a0.y));
    };
    const from = coaster.port.position.clone().setY(gy);
    // level or slightly up the page first (away from the text and the marquee); down the page only if nothing else fits
    let best = null;
    for (const a of [180, 174, 168, 162, 156, 150, 144, 186, 192, 198, 204, 212, 220]) {
      if (best && a > 180) break;
      const dx = Math.cos(a * Math.PI / 180), dy = -Math.sin(a * Math.PI / 180);
      let t = Infinity;
      if (dx < 0) t = Math.min(t, (edge.l - sx) / dx); if (dx > 0) t = Math.min(t, (edge.r - sx) / dx);
      if (dy < 0) t = Math.min(t, (edge.t - sy) / dy); if (dy > 0) t = Math.min(t, (edge.b - sy) / dy);
      const ex = sx + dx * t, ey = sy + dy * t;
      if (ey > free.b - 8) continue;                                   // would cross the marquee
      if (avoid.some(r => hits(sx, sy, ex, ey, { l: r.l - 30, r: r.r + 30, t: r.t - 30, b: r.b + 30 }))) continue;
      // score by the real run on the ground (a short screen run up the page is a long one into the distance)
      const pt = ground(sx + dx * (t + 70), sy + dy * (t + 70)), len = pt.distanceTo(from);
      if (!best || len < best.len) best = { len, pt };
    }
    cable.bake(best ? best.pt : ground(edge.l - 70, sy));
  }

  function apply() {
    coaster.setProgress(v.p);
    view.position.y = lift * (1 - v.p);
    let any = false;
    for (let i = 0; i < parts.length; i++) {
      const P = parts[i], f = P.f;
      if (f < .999) any = true;
      q.setFromAxisAngle(P.axis, P.spin * f);
      piv.copy(P.mesh.position).add(P.center);
      tmp.copy(piv).applyQuaternion(q);
      P.wrap.quaternion.copy(q);
      P.wrap.position.copy(P.dir).multiplyScalar(dist * f).add(piv).sub(tmp);
    }
    // the mug arcs in and out on the left, the can on the right: they never share a path
    mug.group.position.copy(right).multiplyScalar(-ARC * v.mugArc); mug.group.position.y += drop * v.mugY;
    can.group.position.copy(right).multiplyScalar(ARC * v.canArc); can.group.position.y += drop * v.canY;
    mug.group.visible = v.mugY < .999; can.group.visible = v.canY < .999;
    if (Math.abs(v.temp - lastTemp) > .05) { lastTemp = v.temp; coaster.setPlateTemperature && coaster.setPlateTemperature(v.temp); }
    steam.setIntensity(mug.group.visible ? v.steam : 0);
    steam.group.visible = mug.group.visible && v.steam > .002;
    cond.setAmount(v.cond);
    if (ring) ring.setAmount(v.wet);
    if (coaster.setFanSpeed && v.fan !== lastFan) { lastFan = v.fan; coaster.setFanSpeed(v.fan * 9); }
    setShadow(v.shadow);
    stage.visible = any || mug.group.visible || can.group.visible;
  }

  // The reel as a pure function of T (seconds) and the timeline's states.
  function sample(T, S) {
    const E = S.COASTER_ENTER, A = S.ASSEMBLE, M = S.MUG_DROP, W = S.WARM, X = S.SWAP, C = S.CHILL, CE = S.CAN_EXIT, BT = S.BEAT, B = S.EXPLODE;
    // parts: arrive bottom-up during COASTER_ENTER, leave top-down during EXPLODE
    const uIn = win(T, E.t0 - .6, E.t1), eX = win(T, B.t0, B.t1);
    let fin = 0, fout = 0;
    for (let i = 0; i < parts.length; i++) {
      const P = parts[i], d = (P.build / Math.max(1, n - 1)) * .48;
      const inn = ease.outQuart(win(uIn, d, d + .52));
      const out = ease.inCubic(win(eX, P.fs + .02, P.fs + .02 + FLY));
      P.f = (1 - inn) + out;
      fin += inn; fout += out;
    }
    v.p = T < B.t0 ? ease.inOutSine(win(T, A.t0 - .2, A.t1 - .2)) : 1 - ease.inOutSine(win(eX, 0, OUT_U));
    // mug: in from the upper left, out the same way; can: in from the upper right, then leaves first at the end
    const mugIn = ease.land(win(T, M.t0 - .45, M.t1)), mugOut = ease.inOutCubic(win(T, X.t0, X.t0 + 1.4));
    v.mugY = (1 - mugIn) + mugOut; v.mugArc = (1 - mugIn) ** 2 + mugOut * mugOut;
    const canIn = ease.land(win(T, X.t0 + 1.05, X.t1)), canOut = ease.inOutCubic(win(T, CE.t0, CE.t1));
    v.canY = (1 - canIn) + canOut; v.canArc = (1 - canIn) ** 2 + canOut * canOut;
    // plate temperature: neutral, hot through WARM, cold through CHILL, back to neutral in the beat
    if (T < X.t0) v.temp = lerp(22, 55, ease.inOutSine(win(T, W.t0 + .3, W.t1 - 1.4)));
    else if (T < C.t0) v.temp = lerp(55, 34, ease.inOutSine(win(T, X.t0 + .9, X.t1)));   // mug away: the plate switches over
    else if (T < CE.t0) v.temp = lerp(34, 11, ease.outCubic(win(T, C.t0, C.t1 - 2)));
    else v.temp = lerp(11, 22, ease.inOutSine(win(T, CE.t0 + .5, BT.t1)));
    v.steam = (.24 * mugIn + .76 * ease.inOutSine(win(T, W.t0 + .5, W.t1 - 1))) * (1 - ease.outQuad(win(T, X.t0, X.t0 + .9)));
    v.cond = ease.inOutSine(win(T, C.t0 + 1.1, C.t1 - .5));
    v.wet = ease.inOutSine(win(T, C.t0 + 2.8, C.t1)) * (1 - ease.inOutSine(win(T, CE.t0 + .8, B.t0)));
    v.fan = Math.round(20 * win(T, W.t0, W.t0 + 1) * (1 - win(T, CE.t0, CE.t1))) / 20;
    v.shadow = Math.min(fin / n, 1 - fout / n) * (.35 + .65 * v.p);
    apply();
    // the cable: plugged in after ASSEMBLE (its bake runs on into MUG_DROP while it settles), resting until the can
    // has gone, pulled out and away in UNPLUG, gone before EXPLODE
    if (cable) {
      const PL = S.PLUG, UP = S.UNPLUG;
      if (T < PL.t0 || T >= UP.t1) cable.hide();
      else if (T < UP.t0) cable.showIn(T - PL.t0);
      else cable.showOut(T - UP.t0);
    }
  }

  // Abort: props lift away first, then the coaster un-builds and its parts
  // leave in the same top-down order and on the same paths as EXPLODE.
  const ABORT_S = 2.4;
  let lag = 0;     // with the cable plugged in, it leaves first and the coaster waits a beat
  function beginAbort() {
    Object.assign(a0, v);
    lag = cable && cable.visible ? .12 : 0;
    if (lag) cable.capture();
    for (const P of parts) {
      P.f0 = P.f;
      if (a0.p <= .001) P.us = (P.top / Math.max(1, n - 1)) * .34;  // still arriving: leave top-down now
      else {
        if (P.a >= a0.p) P.us = 0;                                    // already free (or flying): keep going
        else P.us = .14 + lag + .4 * Math.acos(1 - 2 * (1 - P.a / a0.p)) / Math.PI;  // free once un-built
      }
    }
    for (let r = 1; r < byTop.length; r++) byTop[r].us = Math.max(byTop[r].us, byTop[r - 1].us + .045);
  }
  // u: 0..1 over ABORT_S seconds.
  function sampleAbort(u) {
    let fin = 0;
    for (let i = 0; i < parts.length; i++) {
      const P = parts[i];
      P.f = lerp(P.f0, Math.max(P.f0, 1.05), ease.inQuad(win(u, P.us, Math.min(1, P.us + .38))));
      fin += clamp01(1 - P.f);
    }
    v.p = a0.p * (1 - ease.inOutSine(win(u, .14 + lag, .54 + lag)));
    if (lag) cable.showAway(win(u, 0, .4));
    const k = ease.inOutCubic(win(u, 0, .5));
    v.mugY = lerp(a0.mugY, Math.max(a0.mugY, 1), k); v.mugArc = a0.mugArc + k * k;
    v.canY = lerp(a0.canY, Math.max(a0.canY, 1), k); v.canArc = a0.canArc + k * k;
    v.steam = a0.steam * (1 - ease.outQuad(win(u, 0, .35)));
    v.cond = a0.cond; v.temp = lerp(a0.temp, 22, ease.inOutSine(win(u, 0, .6))); v.wet = a0.wet * (1 - win(u, 0, .4)); v.fan = 0;
    v.shadow = Math.min(a0.shadow, fin / n);
    apply();
  }
  // Compile every shader variant the reel will need (props, steam, beads,
  // wet ring all on) before the first run, so nothing compiles mid-reel.
  async function prewarm(renderer, camera, scene) {
    const hidden = [];
    for (const P of parts) P.f = 0;
    Object.assign(v, { p: 1, mugY: 0, canY: 0, temp: 55, steam: 1, cond: 1, wet: 1, fan: 0, shadow: 1 });
    if (cable) cable.showIn(cable.plugIn.duration);
    apply();
    stage.traverse(o => { if (!o.visible) { hidden.push(o); o.visible = true; } });
    try { await renderer.compileAsync(stage, camera, scene); } catch (e) { /* compiles on first draw instead */ }
    // upload textures too (maps and shader uniforms), or the first frame stalls
    const seen = new Set();
    const up = t => { if (t && t.isTexture && !seen.has(t)) { seen.add(t); renderer.initTexture(t); } };
    stage.traverse(o => {
      const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of mats) {
        for (const k in m) up(m[k]);
        if (m.uniforms) for (const k in m.uniforms) up(m.uniforms[k].value);
        if (m.userData) for (const k in m.userData) { const u = m.userData[k]; up(u); if (u && u.value) up(u.value); }
      }
    });
    for (const o of hidden) o.visible = false;
    v.temp = 11; apply();
    reset();
  }
  function reset() { if (cable) cable.hide(); for (const P of parts) P.f = 1; Object.assign(v, { p: 0, mugY: 1, canY: 1, mugArc: 0, canArc: 0, temp: 22, steam: 0, cond: 0, wet: 0, fan: 0, shadow: 0 }); apply(); }
  function update(dt, time) {
    if (!stage.visible) return;
    if (steam.group.visible && steam.update) steam.update(dt, time);
    if (coaster.update) coaster.update(dt, time);
    if (cond.update && can.group.visible) cond.update(dt, time);
    if (ring && ring.update) ring.update(dt, time);
    if (mug.update && mug.group.visible) mug.update(dt, time);
    if (can.update && can.group.visible) can.update(dt, time);
  }
  reset();
  engine.adopt(stage);
  return {
    group: stage, sequence: ST.sequence, layout, sample, prewarm, abortSeconds: ABORT_S, values: v, coaster, cable, debugParts: parts, beginAbort, sampleAbort, reset, update,
    get visible() { return stage.visible; },
    modules: { coaster: !!mods.coaster, props: !!mods.props, fx: !!mods.fx },
    dispose() { for (const m of [coaster, mug, can, steam, ring, cond, cable]) m && m.dispose && m.dispose(); if (shadow) { shadow.geometry.dispose(); shadow.material.map.dispose(); shadow.material.dispose(); } },
  };
}

registerProject({ key: 'therma-shift', word: 'Therma-Shift', actor: createThermaShift });
registerProject({ key: 'robo-catcher', word: 'Robo-Catcher', actor: ctx => import('./robo-catcher.js').then(m => m.createActor(ctx)) });
registerProject({ key: 'rudder-pedals', word: 'Rudder pedals', actor: ctx => import('./rudder-pedals.js').then(m => m.createActor(ctx)) });
// More guests: `python3 tools/new.py actor <key> --register` adds one
// registerProject(...) line just above this comment (docs/recipes/showreel-actor.md).

// ================================================================== mount
const ALIASES = { coaster: 'therma-shift' };
function parseFlags() {
  const tokens = [];
  for (const m of location.hash.matchAll(/reel-([a-z0-9-]+)/g)) tokens.push(m[1]);
  const q = new URLSearchParams(location.search).get('reel');
  if (q) tokens.push(...q.split(','));
  let fast = false, key = null;
  for (let t of tokens) {
    if (t === 'fast') { fast = true; continue; }
    if (t.endsWith('-fast')) { fast = true; t = t.slice(0, -5); }
    key = ALIASES[t] || t;
  }
  return { now: fast || !!key, fast, key };
}

export async function mountShowreel({ box, drift = null, words = null, idleSeconds = 8 }) {
  const canvas = box.querySelector('canvas'), shadowEl = box.querySelector('.hero__shadow');
  const reducedQ = matchMedia('(prefers-reduced-motion: reduce)');
  const layoutName = () => (box.clientWidth / box.clientHeight < 1 ? 'port' : 'land');
  let current = layoutName();
  const quality = (innerWidth < 760 || (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4) ? 'low' : 'high';
  const engine = createEngine({ canvas });
  const rocket = await createRocket({ layout: current });
  engine.scene.add(rocket.group);
  applyCamera(engine.camera, rocket.layout);

  let flags = parseFlags(), speed = flags.fast ? 3 : 1;
  let mode = 'rest', T = 0, A = 0, idle = 0, loops = 0, timeline = null, guest = null, guestP = null, stateName = 'REST';
  // Guests: key -> { p, actor, timeline, promise, failed, laidOut }. `turn` is
  // the index (in `projects`) of the project that plays next.
  const cache = new Map();
  let turn = 0, pending = 0, layoutVersion = 0;
  let cur = null, out = null, holding = false;   // cache entry on stage; the outgoing one during a handover
  const warmingGroups = new Set();
  let exitDist = 3, abortFrom = { fly: 0, spin: 0, wrap: false, delay: 0, guestS: 1.5 }, scrollP = 0, scrollSeen = false, ABORT = 2.2;
  let visible = true, raf = 0, slow = false, nSamples = 0, last = 0, paused = false;
  const samples = new Float32Array(60);
  const t0 = performance.now();
  const stats = { frames: 0, tick: 0, render: 0, max: 0, reset() { this.frames = this.tick = this.render = this.max = 0; } };
  const idleCb = window.requestIdleCallback || (f => setTimeout(f, 1500));

  function resize() {
    engine.size(box.clientWidth, box.clientHeight);
    const vw = engine.viewAt(0);
    // distance along the airframe axis that puts the whole rocket off screen
    const ax = Math.abs(rocket.axis.x) || 1e-3, ay = Math.abs(rocket.axis.y) || 1e-3;
    exitDist = .75 + Math.min((vw.halfW + .2) / ax, (vw.halfH + .2) / ay);
    layoutVersion++;
    if (cur) layoutActor(cur);
    if (out) layoutActor(out.c);
  }
  // The hero's free area (between the top bar and the marquee, inside the
  // viewport) and the focused word, in canvas-box pixels.
  const topBar = document.querySelector('.top'), marquee = document.querySelector('[data-marquee]');
  function frameInfo(vw, key) {
    const b = box.getBoundingClientRect(), g = 16;
    const free = {
      l: Math.max(0, -b.left) + g, r: Math.min(b.width, innerWidth - b.left) - g,
      t: Math.max(0, (topBar ? topBar.getBoundingClientRect().bottom : 70) - b.top) + 8,
      b: Math.min(b.height, (marquee ? marquee.getBoundingClientRect().top : innerHeight) - b.top) - 6,
    };
    const avoid = [];
    const w = key && wordFor.get(key);
    if (w) { const r = w.slot.getBoundingClientRect(), m = 22; avoid.push({ l: r.left - b.left - m, r: r.right - b.left + m * 1.6, t: r.top - b.top - m, b: r.bottom - b.top + m }); }
    const vp = { l: Math.max(0, -b.left), r: Math.min(b.width, innerWidth - b.left), t: Math.max(0, -b.top), b: Math.min(b.height, innerHeight - b.top) };
    return { halfW: vw.halfW, halfH: vw.halfH, camera: engine.camera, w: b.width, h: b.height, free, avoid, vp };
  }
  rocket.pose(0); // sets the axis
  resize();
  rocket.settle(0);
  engine.render();
  box.classList.add('is-live');

  // ---- drift words: the active project's word comes forward
  const findWord = word => {
    if (!drift) return null;
    for (const slot of drift.querySelectorAll('.slot')) {
      const items = [...slot.children];
      const i = items.findIndex(el => el.firstChild && el.firstChild.textContent.trim() === word);
      if (i >= 0) return { slot, el: items[i], set: i };
    }
    return null;
  };
  const wordFor = new Map([[HOME.key, findWord(HOME.word)]]);
  for (const p of projects) wordFor.set(p.key, findWord(p.word));
  let focused = null;
  function focus(key) {
    const w = key ? wordFor.get(key) : null;
    if (w === focused) return;
    focused = w;
    if (words) { if (w) { words.hold(w.slot, w.set); words.focus(w.slot); } else { words.release(); words.focus(null); } }
  }
  const projectOf = name => (name === EXIT ? HOME.key : guestP ? guestP.key : null);

  // ---- guests: the next project is built on idle so its reel starts without a hitch
  const indexOf = key => projects.findIndex(p => p.key === key);
  function projectAt(i) {
    for (let k = 0; k < projects.length; k++) {
      const p = projects[(i + k) % projects.length], c = cache.get(p.key);
      if (!c || !c.failed) return p;
    }
    return null;
  }
  const upNext = () => projectAt(turn);
  function layoutActor(c) {
    if (!c || !c.actor || c.laidOut === layoutVersion) return;
    c.laidOut = layoutVersion;
    c.actor.layout(frameInfo(engine.viewAt(0), c.p.key));
  }
  function prepare(p = upNext()) {
    if (!p) return Promise.reject(new Error('no project to play'));
    let c = cache.get(p.key);
    if (c && c.promise) return c.promise;
    c = { p, actor: null, timeline: null, promise: null, failed: false, laidOut: -1 };
    cache.set(p.key, c);
    pending++; nSamples = 0;
    c.promise = Promise.resolve().then(() => p.actor({ engine, quality })).then(async actor => {
      engine.scene.add(actor.group);
      c.actor = actor;
      c.tFirst = createTimeline([[EXIT, 2.1], ...actor.sequence]);   // first guest of a session
      c.tNext = createTimeline([[HANDOVER, LEAD], ...actor.sequence]);  // every later guest
      layoutActor(c);
      // the actor poses for the shader compiler; it is hidden from the frames drawn meanwhile
      warmingGroups.add(actor.group);
      try { await actor.prewarm(engine.renderer, engine.camera, engine.scene); warmDraw(actor); } finally { warmingGroups.delete(actor.group); }
      actor.reset();
      pending--; nSamples = 0;
      return c;
    }).catch(err => {
      console.warn(`[reel] ${p.key} unavailable`, err);
      pending--; c.failed = true; c.promise = null;
      if (c.actor) { engine.scene.remove(c.actor.group); c.actor = null; }
      throw err;
    });
    return c.promise;
  }
  // One real draw of every part of the actor, through a 1x1 scissor on the
  // canvas itself (same shader variants as the reel; a render target would
  // compile linear-output variants instead), culling off, so drivers that
  // finish shader work on first use (SwiftShader, some mobile GPUs) do it now
  // and not on the reel's first frame. The next frame redraws that pixel.
  const scissor = new THREE.Vector4();
  function warmDraw(actor) {
    const r = engine.renderer, changed = [], had = r.getScissorTest();
    actor.group.traverse(o => { changed.push(o, o.visible, o.frustumCulled); o.visible = true; o.frustumCulled = false; });
    r.getScissor(scissor);
    r.setScissorTest(true); r.setScissor(0, 0, 1, 1);
    r.render(engine.scene, engine.camera);
    r.setScissor(scissor); r.setScissorTest(had);
    for (let i = 0; i < changed.length; i += 3) { changed[i].visible = changed[i + 1]; changed[i].frustumCulled = changed[i + 2]; }
  }
  const upAfter = c => projectAt(indexOf(c.p.key) + 1);
  // build a project in the background when the main thread is free
  function prepareSoon(p) {
    if (!p || cache.has(p.key)) return;
    idleCb(() => { if (!reducedQ.matches && !paused && !cache.has(p.key)) prepare(p).catch(() => {}); }, { timeout: 2000 });
  }
  function use(c) {
    cur = c; guest = c.actor; guestP = c.p;
    layoutActor(c);
  }
  function unload(c) {
    if (!c || !c.actor) return;
    engine.scene.remove(c.actor.group);
    if (c.actor.dispose) c.actor.dispose();
    cache.delete(c.p.key);
  }
  // Keep built guests for reuse (no rebuild, no shader work once the rotation has been round once) up to
  // MAX_BUILT; beyond that, keep only what is on stage and what plays next. Either way memory is bounded.
  const MAX_BUILT = 3;
  function trim() {
    if ([...cache.values()].filter(c => c.actor).length <= MAX_BUILT) return;
    const keep = new Set();
    if (cur) keep.add(cur.p.key);
    if (out) keep.add(out.c.p.key);
    const nx = mode === 'rest' ? upNext() : cur && upAfter(cur);
    if (nx) keep.add(nx.key);
    for (const [k, c] of cache) if (!keep.has(k) && c.actor) unload(c);
  }

  // ---- states
  function setState(name) {
    if (name === stateName) return;
    stateName = name;
    box.dataset.reel = name;
    focus(name === 'REST' ? null : projectOf(name));
  }
  function startReel() {
    if (mode !== 'rest' || reducedQ.matches || paused) return;
    const p = upNext();
    if (!p) return;
    const c = cache.get(p.key);
    if (!c || !c.actor) { prepare(p).then(() => { if (mode === 'rest') startReel(); }).catch(() => { if (upNext()) startReel(); }); return; }
    use(c); timeline = c.tFirst; out = null; holding = false;
    mode = 'reel'; T = 0; idle = 0;
    kick();
  }
  // the current guest is finishing: hand over to the next one (it is prewarmed by now; if it is not, the stage
  // holds empty until it is, rather than compiling mid-transition)
  function handover() {
    const p = upAfter(cur), c = p && cache.get(p.key);
    if (!c || !c.actor) {
      if (p && !cache.has(p.key)) prepare(p).catch(() => {});
      holding = true; return;
    }
    holding = false; loops++;
    if (c === cur) { cur.actor.reset(); T = 0; timeline = c.tNext; return; }   // a single project: replay it
    out = { c: cur, tl: timeline, T };
    use(c); timeline = c.tNext; T = 0;
  }
  function rocketAt(T) {
    const e = timeline.states[EXIT];
    if (e) {
      const u = win(T, e.t0, e.t1);
      rocket.state.fly = exitDist * u * u * (1.6 * u - .6); // a breath back, then away nose first
      rocket.state.spin = SPIN * u * u;
    } else { rocket.state.fly = exitDist; rocket.state.spin = SPIN; }
  }
  function onStage() {                                       // has the current guest come on stage?
    const lead = timeline.list[0];
    return T > lead.t1 - (lead.name === HANDOVER ? .2 : 0);
  }
  function beginAbort() {
    if (mode !== 'reel') return;
    mode = 'abort'; A = 0;
    cur.wasOnStage = onStage();
    const f = rocket.state.fly;
    abortFrom.wrap = f > exitDist * .55;                    // gone far enough: come back from behind
    abortFrom.fly = abortFrom.wrap ? -exitDist : f;
    abortFrom.spin = abortFrom.wrap ? -SPIN : rocket.state.spin;
    // the rocket comes back only once the guest's parts have cleared the frame
    abortFrom.guestS = guest.abortSeconds || 1.5;
    abortFrom.delay = abortFrom.wrap ? (guest.visible || out ? abortFrom.guestS * .8 : .3) : 0;
    ABORT = Math.max(abortFrom.guestS, abortFrom.delay + 1.7, abortFrom.wrap ? 0 : 1.3);
    guest.beginAbort();
    focus(null);
    setState('RETURNING');
  }
  function sampleAbort(A) {
    guest.sampleAbort(clamp01(A / abortFrom.guestS));
    const k = abortFrom.wrap ? ease.outQuint(win(A, abortFrom.delay, abortFrom.delay + 1.7)) : ease.inOutCubic(win(A, 0, 1.3));
    rocket.state.fly = abortFrom.fly * (1 - k);
    rocket.state.spin = abortFrom.spin * (1 - k);
  }
  function finishOut() { if (out) { out.c.actor.reset(); out = null; trim(); } }
  function toRest() {
    const was = mode;
    finishOut();
    mode = 'rest'; T = 0; A = 0; idle = 0; holding = false;
    rocket.state.fly = 0; rocket.state.spin = 0;
    if (guest) guest.reset();
    setState('REST');
    // resume with the guest after the one that was on stage (or the same one, if it had not come on yet)
    if (cur) {
      turn = cur.wasOnStage === false ? indexOf(cur.p.key) : (indexOf(cur.p.key) + 1) % projects.length;
      cur.wasOnStage = undefined;
    }
    if (was !== 'rest') { cur = null; guest = null; guestP = null; timeline = null; trim(); prepareSoon(upNext()); }
  }
  let shadowO = 1;
  function syncDom() {
    const o = Math.round((1 - clamp01(Math.abs(rocket.state.fly) / (exitDist * .6))) * 50) / 50;
    rocket.group.visible = Math.abs(rocket.state.fly) < exitDist;
    if (shadowEl && o !== shadowO) { shadowO = o; shadowEl.style.opacity = o === 1 ? '' : o; }
  }

  // ---- per-frame
  function tick(dt, time) {
    if (mode === 'rest') {
      const eligible = !reducedQ.matches && scrollP < .03 && (!slow || flags.now);
      if (eligible) {
        idle += dt;
        const wait = (flags.now && loops === 0 ? .6 : loops ? idleSeconds * 1.5 : idleSeconds) / speed;
        const p = upNext(), c = p && cache.get(p.key);
        if (idle > wait * .5 && p && !c) prepare(p).catch(() => {});
        if (idle > wait && c && c.actor) startReel();
      }
    }
    if (mode !== 'rest' && out) {                            // the last guest's exit plays out under the handover
      out.T += dt * speed;
      if (out.T >= out.tl.total) finishOut(); else out.c.actor.sample(out.T, out.tl.states);
    }
    if (mode === 'reel') {
      if (!holding) T += dt * speed;
      // hand over part-way into the guest's exit: the next guest's parts fly in from off screen while the last
      // guest's leave, so the stage is never empty (or as soon as the stage has cleared, if that comes first)
      const lastSt = timeline.list[timeline.list.length - 1];
      if (!holding && (T >= Math.min(timeline.total - OVERLAP, lastSt.t0 + lastSt.dur * HAND_AT) || (T > lastSt.t0 + .2 && !guest.visible))) handover();
      else if (holding) handover();
      if (!holding || T < timeline.total) {
        const tt = Math.min(T, timeline.total - 1e-4);
        setState(timeline.at(tt).name); rocketAt(tt); guest.sample(tt, timeline.states);
      }
      // build the guest after this one during this one's calm middle
      if (!out && T > timeline.total * .3) { const nx = upAfter(cur); if (nx && !cache.has(nx.key) && !pending) prepare(nx).catch(() => {}); }
    } else if (mode === 'abort') {
      A += dt * Math.max(1, speed * .75);
      if (A >= ABORT) toRest(); else sampleAbort(A);
    }
    if (mode !== 'rest' || rocket.state.fly) syncDom();
    rocket.pose(time);
    if (guest && guest.visible) guest.update(dt, time);
    if (out && out.c.actor.visible) out.c.actor.update(dt, time);
  }
  function frame(now) {
    raf = 0;
    if (!visible || document.hidden || paused) { last = 0; return; }
    const dt = last ? Math.min(.064, (now - last) / 1000) : 1 / 60;
    // slow devices: in REST give up the loop and draw single frames on scroll.
    // Judged on the median of 60 frames after load has settled.
    if (last && mode === 'rest' && !flags.now && !slow && !pending && now - t0 > 2500 && !window.__reelNoSlowGuard) {
      samples[nSamples++] = now - last;
      if (nSamples === samples.length) { samples.sort(); if (samples[30] > 38) slow = true; nSamples = 0; }
    }
    last = now;
    const a = performance.now();
    tick(dt, now - t0);
    const b = performance.now();
    render();
    const c = performance.now();
    if (mode !== 'rest') { stats.frames++; stats.tick += b - a; stats.render += c - b; if (c - a > stats.max) { stats.max = c - a; stats.maxAt = stateName + '@' + T.toFixed(2); } }
    if (!slow || mode !== 'rest') raf = requestAnimationFrame(frame);
  }
  // draw, keeping any actor that is posing for the shader compiler out of the frame
  function render() {
    if (warmingGroups.size) {
      const vis = [];
      for (const g of warmingGroups) { vis.push(g.visible); g.visible = false; }
      engine.render();
      let i = 0; for (const g of warmingGroups) g.visible = vis[i++];
    } else engine.render();
  }
  function kick() { if (!raf && !paused && !reducedQ.matches) { last = 0; raf = requestAnimationFrame(frame); } }
  function still() { rocket.settle(performance.now() - t0); engine.render(); }

  // ---- input: any scroll or interaction returns to REST
  function interact() { idle = 0; if (mode === 'reel') beginAbort(); }
  addEventListener('studio:scroll', e => {
    const p = e.detail;
    if (scrollSeen && Math.abs(p - scrollP) > .001) interact();
    scrollSeen = true; scrollP = p; rocket.state.scroll = p;
    if (slow || reducedQ.matches) requestAnimationFrame(still);
  }, { passive: true });
  for (const ev of ['wheel', 'touchstart', 'pointerdown']) addEventListener(ev, interact, { passive: true });
  addEventListener('keydown', e => {
    if (e.key === 'c' && !e.metaKey && !e.ctrlKey && !e.altKey && !/input|textarea|select/i.test(e.target.tagName || '') && !e.target.isContentEditable) {
      if (mode === 'rest' && visible && !paused) { flags.now = true; startReel(); }
      return;
    }
    interact();
  });
  addEventListener('pointermove', e => { rocket.state.px = e.clientX / innerWidth * 2 - 1; rocket.state.py = e.clientY / innerHeight * 2 - 1; }, { passive: true });
  const pick = key => { const i = indexOf(key); if (i >= 0) turn = i; else if (key) console.warn(`[reel] no project "${key}"`, projects.map(p => p.key)); };
  if (flags.key) pick(flags.key);
  addEventListener('hashchange', () => { flags = parseFlags(); speed = flags.fast ? 3 : 1; if (flags.key && mode === 'rest') pick(flags.key); if (flags.now && mode === 'rest') { idle = 0; loops = 0; kick(); } });

  // ---- visibility, reduced motion, resize
  new IntersectionObserver(e => { visible = e[0].isIntersecting; if (visible) kick(); }, { threshold: 0 }).observe(box);
  document.addEventListener('visibilitychange', kick);
  reducedQ.addEventListener('change', () => {
    if (reducedQ.matches) { toRest(); syncDom(); if (raf) { cancelAnimationFrame(raf); raf = 0; } requestAnimationFrame(still); }
    else kick();
  });
  new ResizeObserver(() => {
    if (layoutName() !== current) { current = layoutName(); rocket.setLayout(current); applyCamera(engine.camera, rocket.layout); rocket.pose(0); }
    resize();
    if (slow || reducedQ.matches) still();
  }).observe(box);

  // warm the guest up once the page has settled, so the first reel is smooth
  if (!reducedQ.matches) prepareSoon(upNext());
  if (reducedQ.matches) still(); else kick();

  // debug and capture hooks
  const hitRay = new THREE.Raycaster(), hitNdc = new THREE.Vector2();
  const api = window.__reel = {
    engine, rocket, stats, projects,
    get mode() { return mode; }, get state() { return stateName; }, get T() { return T; },
    get total() { return timeline ? timeline.total : 0; }, get guest() { return guest; }, get slow() { return slow; }, get quality() { return quality; },
    get speed() { return speed; }, set speed(s) { speed = s; },
    get project() { return guestP ? guestP.key : null; }, get next() { const p = upNext(); return p ? p.key : null; },
    get built() { return [...cache.keys()].filter(k => cache.get(k).actor); },
    use(key) { pick(key); return api.next; },
    prepare: key => prepare(key ? projects[indexOf(key)] : upNext()),
    start() { flags.now = true; startReel(); }, abort: beginAbort,
    pause() { paused = true; if (raf) { cancelAnimationFrame(raf); raf = 0; } },
    resume() { paused = false; idle = 0; kick(); },
    // is the resting rocket under this viewport point (the explorer opens from a click on it)
    hitRocket(x, y) {
      if (mode !== 'rest' || paused || !rocket.group.visible) return false;
      const b = canvas.getBoundingClientRect();
      if (x < b.left || x > b.right || y < b.top || y > b.bottom) return false;
      hitNdc.set((x - b.left) / b.width * 2 - 1, (b.top - y) / b.height * 2 + 1);
      hitRay.setFromCamera(hitNdc, engine.camera);
      return hitRay.intersectObject(rocket.group, true).length > 0;
    },
    // advance the live state machine by dt seconds and draw (capture, tests)
    advance(dt, time = performance.now() - t0) { tick(dt, time); render(); return mode + ':' + stateName; },
    get outgoing() { return out ? out.c.p.key : null; }, get holding() { return holding; },
    // jump to reel time t (seconds) and draw one frame synchronously
    // (key: play that project's reel; default: the one playing, else the next)
    async seek(t, key, time = performance.now() - t0) {
      const p = key ? projects[indexOf(key)] : (guestP && mode !== 'rest' ? guestP : upNext());
      const c = await prepare(p);
      if (out) finishOut();
      if (guest && guest !== c.actor) guest.reset();
      use(c); timeline = c.tFirst; holding = false;
      mode = 'reel'; T = Math.min(t, timeline.total - 1e-3);
      setState(timeline.at(T).name); rocketAt(T); guest.sample(T, timeline.states); syncDom();
      rocket.pose(time); guest.update(1 / 60, time); engine.render();
      return stateName;
    },
  };
  dispatchEvent(new CustomEvent('reel:ready', { detail: api }));
  return api;
}

// ============================================================ placeholders
// PLACEHOLDER geometry with the module API, used only while (or if) the real
// coaster.js / props.js / fx.js are missing. Deliberately plain.
function clampDur(d, a, b) { return Math.min(b, Math.max(a, +d || a)); }
function firstMesh(root) { let m = null; root.traverse(o => { if (!m && o.isMesh) m = o; }); return m; }
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
function placeholderCoaster({ THREE }) {
  const group = new THREE.Group();
  const mat = (color, roughness = .6, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const box = (name, w, h, d, y, m, explode) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); mesh.name = name;
    mesh.userData.rest = new THREE.Vector3(0, y, 0); group.add(mesh); return { name, mesh, explode };
  };
  const plateMat = mat(0xb9bcc0, .38, .85), base = plateMat.color.clone();
  const parts = [
    box('topPlate', .1, .004, .1, -.002, plateMat, new THREE.Vector3(0, .09, 0)),
    box('peltier', .04, .0036, .04, -.0058, mat(0xeeeeea, .7), new THREE.Vector3(0, .05, 0)),
    box('heatsink', .07, .022, .07, -.0186, mat(0x1d1e21, .55, .3), new THREE.Vector3(0, -.02, 0)),
    box('blower', .04, .012, .04, -.036, mat(0x2a2c30, .6), new THREE.Vector3(.07, -.06, .02)),
    box('shell', .11, .041, .11, -.0245, new THREE.MeshStandardMaterial({ color: 0x7f8b99, roughness: .7, transparent: true, opacity: .5 }), new THREE.Vector3(-.08, -.07, 0)),
    box('thermistor', .004, .002, .006, -.001, mat(0x222222), new THREE.Vector3(.03, .11, 0)),
  ];
  const warm = new THREE.Color(0xd99a5c), cool = new THREE.Color(0xc8dcf0);
  return {
    group, duration: 2.6, height: .045,
    getParts: () => parts,
    setProgress(p) { for (const P of parts) P.mesh.position.copy(P.mesh.userData.rest).addScaledVector(P.explode, 1 - p); },
    setPlateTemperature(c) {
      plateMat.color.copy(base);
      if (c > 22) plateMat.color.lerp(warm, Math.min(1, (c - 22) / 40) * .6); else plateMat.color.lerp(cool, Math.min(1, (22 - c) / 11) * .6);
    },
    dispose() { for (const P of parts) { P.mesh.geometry.dispose(); P.mesh.material.dispose(); } },
  };
}
function placeholderMug({ THREE }) {
  const group = new THREE.Group();
  const pts = [[0, 0], [.036, 0], [.04, .004], [.04, .085], [.036, .085], [.036, .006], [0, .006]].map(([x, y]) => new THREE.Vector2(x, y));
  const body = new THREE.Mesh(new THREE.LatheGeometry(pts, 48), new THREE.MeshStandardMaterial({ color: 0xece8e1, roughness: .7 }));
  const coffee = new THREE.Mesh(new THREE.CircleGeometry(.036, 40), new THREE.MeshStandardMaterial({ color: 0x2b1a10, roughness: .25 }));
  coffee.rotation.x = -Math.PI / 2; coffee.position.y = .075;
  const handle = new THREE.Mesh(new THREE.TorusGeometry(.022, .006, 10, 24, Math.PI), body.material);
  handle.rotation.z = -Math.PI / 2; handle.position.set(.04, .045, 0);
  group.add(body, coffee, handle);
  return { group, height: .085, innerRadius: .034, steamY: .077, setProgress() {}, dispose() { body.geometry.dispose(); body.material.dispose(); coffee.geometry.dispose(); coffee.material.dispose(); handle.geometry.dispose(); } };
}
function placeholderCan({ THREE }) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(.033, .033, .108, 48), new THREE.MeshStandardMaterial({ color: 0xb3141c, roughness: .45, metalness: .3 }));
  body.position.y = .061; body.name = 'body';
  const alu = new THREE.MeshStandardMaterial({ color: 0xc4c7cb, roughness: .35, metalness: .8 });
  const top = new THREE.Mesh(new THREE.CylinderGeometry(.027, .033, .007, 48), alu); top.position.y = .1185;
  const bot = new THREE.Mesh(new THREE.CylinderGeometry(.033, .028, .007, 48), alu); bot.position.y = .0035;
  group.add(body, top, bot);
  return { group, body, height: .122, radius: .033, setProgress() {}, dispose() { [body, top, bot].forEach(m => m.geometry.dispose()); body.material.dispose(); alu.dispose(); } };
}
function placeholderSteam({ THREE }) {
  const group = new THREE.Group();
  return { group, setIntensity() {}, setProgress() {}, update() {}, dispose() {} };
}
function placeholderCondensation(mesh) {
  const m = mesh && mesh.material, r0 = m ? m.roughness : 0;
  return { setAmount(a) { if (m) m.roughness = lerp(r0, Math.min(1, r0 + .35), a); }, dispose() {} };
}
