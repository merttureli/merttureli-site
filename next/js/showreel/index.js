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
// The cycle: each page load shuffles CHARGER (HOME) and the guests (chooseOrder;
// the first one opens the page, never the one that opened the last load). If
// CHARGER opens, the rocket flies in and rests; if a guest opens, there is no
// fly-in: the stage stays empty until that guest is built, then it enters with
// a later guest's HANDOVER lead-in, the rocket parked off screen. Guests that
// are neighbors in the cycle hand over directly: each guest's exit flows into
// the next guest's entry (a short overlap, the next guest's HANDOVER lead-in).
// CHARGER's turn is REST: the guest before it plays out its exit, the rocket
// returns on the abort's path from behind, rests for the idle delay, exits, and
// the next guest plays. Any scroll or input: the guest on stage leaves
// gracefully and the rocket returns to REST (that REST is CHARGER's turn); the
// next session resumes with the following guest. Under automation, with a
// #reel- / ?reel= flag or on a 3D viewer's address the order is fixed as it
// always was (the rocket opens, the guests in registration order round and
// round, no REST between them); window.__reelOrder ('fixed', 'random' or an
// array of keys) overrides, and __reel.order says which is in use. Each guest is built and
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
import { THREE, createEngine, createGovernor, createTimeline, ease, win, clamp01, lerp, placeInFrame, screenExtents } from './engine.js';
import { createRocket, applyCamera, createIntro, wobble, INTRO } from '../hero3d.js';
import { PRODUCTS } from '../viewer/products/index.js';

// ---------------------------------------------------------------- registry
const projects = [];
export function registerProject(p) { projects.push(p); return p; }

const HOME = { key: 'charger', word: 'CHARGER' };
const EXIT = 'ROCKET_EXIT', HANDOVER = 'HANDOVER';
const LEAD = .7, OVERLAP = .55, HAND_AT = .5;   // next guest's lead-in; it starts at the latest OVERLAP s before the
// end of the last guest's exit, or HAND_AT of the way into that exit, whichever is sooner
const SPIN = 1.7; // extra roll (rad) the rocket picks up as it accelerates away
const RETURN_S = 1.7, INTRO_WOB = INTRO.wobble;   // the return from behind (s); the settle wobble's size (rad)

// ======================================================= Therma-Shift actor
// Loads the specialists' modules; anything missing or broken falls back to
// the PLACEHOLDER factories at the bottom of this file, which share the API.
async function loadModules() {
  const [c, p, f, k, l] = await Promise.allSettled([import('./coaster.js'), import('./props.js'), import('./fx.js'), import('./cable.js'), import('./look.js')]);
  const pick = (r, name) => { if (r.status === 'fulfilled') return r.value; console.info(`[reel] ${name}.js not available, using placeholder`, r.reason && r.reason.message); return null; };
  return { coaster: pick(c, 'coaster'), props: pick(p, 'props'), fx: pick(f, 'fx'), cable: pick(k, 'cable'), look: pick(l, 'look') };
}
// a fresh task (a frame may be drawn before it runs): long start-up work is split at these points
const nextTask = () => new Promise(r => { const c = new MessageChannel(); c.port1.onmessage = () => r(); c.port2.postMessage(0); });
function safe(label, real, fallback) {
  if (real) { try { const v = real(); if (v) return v; } catch (e) { console.warn(`[reel] ${label} failed, using placeholder`, e); } }
  return fallback();
}

// Clip-free choreography for the coaster parts. Parts leave top-down, each
// only once its own disassembly has finished, along paths that fan upward and
// out to the side the part sits on: lower parts start later and climb more
// slowly than the ones above them, so gaps only ever open. The shell, last
// and lowest, drops away. Arrival is the mirror image, bottom-up.
const OUT_U = .42;                  // share of EXPLODE spent un-building (p 1 -> 0)
const FLY = .5;                     // share of EXPLODE one part's departure takes (a slow start: it floats off)
const LAG = .05;                    // minimum gap between consecutive departures

// MOTION. Product-film timing as closed-form functions of time, so sample(T) stays pure (seek, stills, reverse play
// and the case stage get exactly the same pose for the same T). Numbers from the motion reference (REFERENCE.md 4).
const TAU = Math.PI * 2, DEG = Math.PI / 180;
// Remaining distance of an arrival: D at t0, 0 at t1, reached at speed vc (units/s). Fast start, long soft landing
// ((1 - s)^p), plus a term that keeps some speed into the touch. After t1: with w > 0 a damped spring carries it a
// little past and settles (overshoot about vc / w, omega w rad/s, damping z); with w = 0 it stops (set down on a
// surface: never through it).
function landing(t, t0, t1, D, vc = 0, p = 3, w = 0, z = .55) {
  if (t <= t0) return D;
  const L = t1 - t0;
  if (t < t1) { const s = (t - t0) / L; return D * (1 - s) ** p + vc * L * s ** 6 * (1 - s); }
  if (!vc || !w) return 0;
  const tau = t - t1, wd = w * Math.sqrt(1 - z * z);
  return -(vc / wd) * Math.exp(-z * w * tau) * Math.sin(wd * tau);
}
// I(t) = integral of smoothstep(a, b, t) dt (for the impeller angle, from its speed)
const intSmooth = (t, a, b) => (t <= a ? 0 : t >= b ? (b - a) / 2 + (t - b) : (b - a) * (((t - a) / (b - a)) ** 3 - ((t - a) / (b - a)) ** 4 / 2));
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
// The slow turn of the whole device about its plate centre (radians, added to the view's yaw). It eases in while the
// parts arrive and assemble, holds still for the plug, sways out and back over the story (zero speed at both ends, so
// the case page's loop from the mug drop to the beat has no seam) and drifts on while the stack floats apart.
const YAW_IN = -20 * DEG, YAW_SWAY = 20 * DEG, YAW_OUT = 9 * DEG;
function yawAt(T, S) {
  const E = S.COASTER_ENTER, A = S.ASSEMBLE, M = S.MUG_DROP, BT = S.BEAT, B = S.EXPLODE;
  const l0 = M.t0 - .45, l1 = BT.t1;
  if (T < l0) return YAW_IN * (1 - ease.inOutSine(win(T, E.t0 - .6, A.t1 - .9)));
  if (T < l1) return YAW_SWAY * (1 - Math.cos(TAU * (T - l0) / (l1 - l0))) / 2;
  return YAW_OUT * win(T, B.t0, B.t1) ** 2;
}
const LEAN = .06;                   // rad per m/s^2: a carried prop leans with its horizontal acceleration
const M_SEAT = .6;                  // a part reaches its seat still moving (share of its mean speed), then stops
const FILM = .35;                   // the fx frost film over the plate's own frost (coaster.setFrost), as a share of it

async function createThermaShift(ctx) {
  const { engine, quality } = ctx;
  const mods = await loadModules();
  const base = { THREE, renderer: engine.renderer, quality };
  const coaster = safe('coaster', mods.coaster && (() => mods.coaster.default(base)), () => placeholderCoaster(base));
  const mug = safe('mug', mods.props && mods.props.createMug && (() => mods.props.createMug(base)), () => placeholderMug(base));
  const can = safe('can', mods.props && mods.props.createCan && (() => mods.props.createCan(base)), () => placeholderCan(base));
  const fx = mods.fx || {};
  const sloshAt = (mods.props && mods.props.sloshAt) || (() => [0, 0, 0, 0]);
  if (fx.ready) try { await fx.ready(); } catch (e) { /* neutral noise until filled */ }
  const steam = safe('steam', fx.createSteam && (() => fx.createSteam({ ...base, radius: mug.rimRadius || .034, height: .12 })), () => placeholderSteam(base));
  const canBody = can.bodyMesh || can.body || firstMesh(can.group);
  const cond = safe('condensation', fx.applyCondensation && (() => fx.applyCondensation(canBody, { THREE, renderer: engine.renderer, quality, fillLine: can.fillLine })), () => placeholderCondensation(canBody));
  const ring = safe('water ring', fx.createWaterRing && (() => fx.createWaterRing({ ...base, radius: can.radius || .033, standRadius: can.footRadius || null })), () => null);
  // cold air falling off the plate, a frost film, heat shimmer over the plate (high tier only draws it)
  const fog = coaster.caseBounds && fx.createColdFog ? safe('fog', () => fx.createColdFog({ quality, box: coaster.caseBounds }), () => null) : null;
  const film = fx.createFrost ? safe('frost', () => fx.createFrost({ quality, size: .0802 }), () => null) : null;
  const shimmer = fx.createHeatShimmer ? safe('shimmer', () => fx.createHeatShimmer({ quality, width: .1, height: .075, pixels: .9 }), () => null) : null;

  // stage (framed per layout) > view (viewing angle) > turn (the slow turn) > coaster, cable; the props ride in
  // view and take the same turn about the plate centre while they sit on it
  const stage = new THREE.Group(), view = new THREE.Group(), turn = new THREE.Group();
  stage.add(view); view.add(turn);
  view.rotation.set(.4, -.62, 0);
  turn.add(coaster.group); view.add(mug.group, can.group);
  // the USB-C cable that plugs in after assembly (only with the CAD coaster, which knows where its port is). It rides
  // in the turn with the device; its far end is re-set every pose so it stays put on the page while the device turns.
  const cable = coaster.port && mods.cable ? safe('cable', () => mods.cable.createCable({ THREE, quality, port: coaster.port, ground: -coaster.height, box: coaster.caseBounds, renderer: engine.renderer, timing: { fly: 1.05, align: .22, insert: .12, click: .14 } }), () => null) : null;
  if (cable) turn.add(cable.group);
  mug.group.add(steam.group);
  steam.group.position.y = mug.coffeeY || .074;
  // contact shadow: the coaster's own baked decal if it has one
  const shadow = coaster.setShadowOpacity ? null : contactShadow(.2);
  if (shadow) { shadow.position.y = -(coaster.height || .045) - .0015; view.add(shadow); }
  let dress = null;                 // the studio look (look.js); with it, its contact shadows replace the baked decal
  const setShadow = a => (shadow ? (shadow.material.opacity = .42 * a) : coaster.setShadowOpacity(dress ? 0 : a));
  // the wet ring, the frost film and the shimmer ride on the top plate
  const plate = (coaster.parts && coaster.parts.topPlate) || (coaster.getParts && (coaster.getParts().find(p => p.name === 'topPlate') || {}).mesh);
  coaster.setProgress(1); stage.updateMatrixWorld(true);
  if (ring && plate) {
    plate.add(ring.group);
    ring.group.position.set(-plate.position.x, .0004 - plate.position.y, -plate.position.z);
  }
  if (fog) coaster.group.add(fog.group);
  if (film) { coaster.group.add(film.group); if (plate) plate.attach(film.group); }
  if (shimmer) { coaster.group.add(shimmer.group); shimmer.group.position.y = .002; if (plate) plate.attach(shimmer.group); }
  const rotor = coaster.group.getObjectByName('rotor');
  stage.visible = false;
  stage.updateMatrixWorld(true);

  // Parts: wrap each in a pivot group so the reel can fly it in and out
  // without touching the coaster's own setProgress transforms.
  const inv = new THREE.Quaternion().copy(view.quaternion).invert();
  const UP = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(inv);   // screen-right in view space (prop arcs)
  const hRight = right.clone().setY(0).normalize();                  // the same, level: props come down vertically
  const tiltAxis = new THREE.Vector3().crossVectors(UP, hRight);      // + tips a prop's top toward screen-right
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
    return { name: p.name, mesh, wrap, center, axis, sx, a, win: p.win || null, build: i, explode: p.explode, ex0: p.explode ? p.explode.clone() : null, dir: new THREE.Vector3(), spin: 0, fs: 0, f: 1, f0: 1, us: 0, seat: 0 };
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
    P.spin = (r % 2 ? -1 : 1) * (/topPlate|shell|heatsink/.test(P.name) ? .1 : .2);
    // EXPLODE time (share) at which p falls to P.a, i.e. its disassembly is done
    const k = 1 - P.a;                                            // inOutSine(e / OUT_U) = k
    P.fs = OUT_U * Math.acos(1 - 2 * k) / Math.PI;
    P.top = r;
  });
  // a minimum lag between consecutive departures keeps the order strict; the last one must be gone by the end
  for (let r = 1; r < byTop.length; r++) byTop[r].fs = Math.max(byTop[r].fs, byTop[r - 1].fs + LAG);
  { const last = Math.max(0, ...parts.map(P => P.fs)), lim = .98 - .02 - FLY; if (last > lim) for (const P of parts) P.fs *= lim / last; }

  const ST = {
    sequence: cable
      ? [['COASTER_ENTER', 3.2], ['ASSEMBLE', 4.6], ['PLUG', 2.6], ['MUG_DROP', 2.2], ['WARM', 5.8], ['SWAP', 3.6], ['CHILL', 7.4], ['CAN_EXIT', 1.8], ['UNPLUG', 1.6], ['BEAT', 1.2], ['EXPLODE', 3.8]]
      : [['COASTER_ENTER', 3.2], ['ASSEMBLE', 4.6], ['MUG_DROP', 2.2], ['WARM', 6.2], ['SWAP', 3.6], ['CHILL', 7.4], ['CAN_EXIT', 1.8], ['BEAT', 1.4], ['EXPLODE', 3.8]],
  };
  // a prop's pose: lat (m along screen-right, level), h (m above its seat), tilt (rad about tiltAxis) about the pivot
  // (px along screen-right, py up), tw (extra yaw), ax (horizontal acceleration, m/s^2)
  const pose0 = () => ({ lat: 0, h: 1, tilt: 0, px: 0, py: 0, tw: 0, ax: 0 });
  const v = { p: 0, yaw: 0, mug: pose0(), can: pose0(), temp: 22, steam: 0, dist: 0, push: [0, 0, 0], slosh: [0, 0, 0, 0], cond: 0, wet: 0, fan: 0, fanA: 0, fog: 0, frost: 0, film: 0, shimmer: 0, time: 0, shadow: 0 }; // live values
  const a0 = { ...v, mug: pose0(), can: pose0() };                             // captured at abort
  let dist = 2, drop = .5, lift = 0, lastTemp = -99, lastFan = -1, lastFrost = -1, anchorV = null, bakedYaw = NaN;
  const propShadows = [];          // the look's shadow records of the mug and the can (strength follows their height)
  const ARC = .17;                  // sideways travel (view units) of the props' entry/exit arcs
  const CLEAR = 14;                 // px the cable's real drape keeps above the focused word's avoid box (the box already
  // stands 22 px off the glyphs). Below the word, and for the straight-run tests that cannot see the drape, 30 px stays.
  const q = new THREE.Quaternion(), qy = new THREE.Quaternion(), qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
  const tmp = new THREE.Vector3(), piv = new THREE.Vector3(), dT = new THREE.Vector3(), pv = new THREE.Vector3(), anc = new THREE.Vector3();

  // Framing: measure the assembled coaster + can on screen, size it to the
  // free area of the hero, and place it clear of the focused drift word.
  // The device turns during the reel, so every measure is the union over the yaws it takes.
  const union = (a, b) => (a ? { l: Math.max(a.l, b.l), r: Math.max(a.r, b.r), u: Math.max(a.u, b.u), d: Math.max(a.d, b.d) } : b);
  function extentsOver(objs, yaws, camera, w, h) {
    let e = null;
    for (const y of yaws) { v.yaw = y; apply(); e = union(e, screenExtents(objs, stage, camera, w, h)); }
    return e;
  }
  function layout(F) {
    const { halfW, halfH, camera, w, h, free, avoid } = F;
    const narrow = w < h;
    let S = 2 * Math.min(halfW, halfH) * (narrow ? .44 : .3) / .11;
    stage.scale.setScalar(S); stage.position.set(0, 0, 0);
    const keep = parts.map(P => P.f), kp = v.p, ky = v.yaw, kc = { ...v.can }, km = { ...v.mug };
    for (const P of parts) { P.f = 0; P.seat = 0; }
    v.p = 1; Object.assign(v.can, pose0(), { h: 0 }); Object.assign(v.mug, pose0(), { h: 1e3 });
    const ext = extentsOver([coaster.group, can.group], [0, YAW_SWAY * .5, YAW_SWAY], camera, w, h);
    v.yaw = 0; apply();
    // where the cable leaves the port, relative to the origin on screen (px at this scale): the spot must leave the
    // cable a clear run from the port to the left edge, above the marquee and clear of the word
    let portOff = null;
    if (cable) {
      stage.updateMatrixWorld(true);
      const o = new THREE.Vector3().setFromMatrixPosition(stage.matrixWorld).project(camera);
      const q = coaster.port.position.clone().addScaledVector(coaster.port.normal, 0.03).applyMatrix4(view.matrixWorld).project(camera);
      portOff = { x: (q.x - o.x) / 2 * w, y: -(q.y - o.y) / 2 * h };
      // the cable lies on the page and leaves the port toward the viewer, so its drape runs lower on screen than the
      // port (and a little higher where it lifts off): measure that reach once for a level run, px at this scale
      const ps = { x: (q.x + 1) / 2 * w, y: (1 - q.y) / 2 * h }, P = cablePath(F, ps.x - w * .7, ps.y);
      portOff.dn = 0; portOff.up = 0;
      for (const p of P) if (p.x < ps.x) { portOff.dn = Math.max(portOff.dn, p.y - ps.y); portOff.up = Math.min(portOff.up, p.y - ps.y); }
    }
    const fw = free.r - free.l, fh = free.b - free.t;
    // the hero on a narrow frame (phones): sized so the exploded entry, not only the assembled coaster, stays inside
    // the frame; the case stage and the stills keep the larger fit (they never show the entry)
    const tight = narrow && F.hero;
    const k0 = Math.min(fh * (tight ? .44 : narrow ? .56 : .84) / (ext.u + ext.d), fw * (tight ? .62 : narrow ? .8 : .4) / (ext.l + ext.r));
    const prefer = { x: free.l + fw * (narrow ? .5 : .54), y: free.t + fh * .5 };
    // with the cable, weigh each size's best spot against shrinking (a centred, slightly smaller product beats one
    // pushed to the edge); without it, the largest size that fits wins as before
    // (with the cable the sizes go down in 5 percent steps: the drape test is exact, so a 10 percent step gave away
    // size that fits; the range is the same, .95^8 against .9^4)
    let spot = null, k = k0, bestCost = Infinity, bestK = k0;
    for (let i = 0; i < (portOff ? 9 : 5) && (portOff || !spot); i++, k *= (portOff ? .95 : .9)) {
      const e = { l: ext.l * k, r: ext.r * k, u: ext.u * k, d: ext.d * k };
      const kk = k, left = (F.vp ? F.vp.l : 0) - 10;
      const test = portOff && (avoid.length || F.vp) ? (x, y) => {
        const px = x + portOff.x * kk, py = y + portOff.y * kk, lo = py + portOff.dn * kk, hi = py + portOff.up * kk;
        if (py > free.b - 14) return false;
        for (const r of avoid) if (lo > r.t - CLEAR && hi < r.b + 30 && r.r + 30 > left && r.l - 30 < px) return false;
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
    v.p = 0;
    const e0 = extentsOver([coaster.group], [YAW_IN * .6, 0, YAW_OUT], camera, w, h);
    let bottom = free.b;  // stop above the caption word if it sits under the stack
    for (const a of avoid) if (a.l < ox + e0.r && a.r > ox - e0.l && a.t > oy) bottom = Math.min(bottom, a.t);
    const span = e0.u + e0.d, room = (bottom - free.t) * .96;
    if (span > room) { const c = room / span; for (const P of parts) if (P.explode) P.explode.multiplyScalar(c); e0.u *= c; e0.d *= c; }
    const centre = oy + (e0.d - e0.u) / 2, want = (free.t + bottom) / 2;
    lift = -((want - centre) / h * 2 * halfH) / S;
    v.yaw = 0; v.p = 1; apply();
    if (cable) anchorCable(F);
    parts.forEach((P, i) => { P.f = keep[i]; }); v.p = kp; v.yaw = ky; Object.assign(v.can, kc); Object.assign(v.mug, km);
    apply();
  }

  // The cable's centerline in canvas px for a far end `pt` (view space, on the ground), at the moments it is still or
  // nearly still in front of the word: the end of the arrival arc, seated, and after the settle. Bakes `pt`.
  const _sp = new THREE.Vector3();
  function drapePx(F, pt) {
    const { camera, w, h } = F, M = view.matrixWorld, out = [];
    cable.bake(pt);
    for (const t of [cable.timing.fly * .85, cable.timing.fly, cable.plugIn.seated, cable.plugIn.duration])
      for (const p of cable.pathAt(t)) { _sp.copy(p).applyMatrix4(M).project(camera); out.push({ x: (_sp.x + 1) / 2 * w, y: (1 - _sp.y) / 2 * h }); }
    return out;
  }
  function drapeHits(F, pt, avoid) {
    const P = drapePx(F, pt);
    return avoid.some(r => P.some(p => p.x > r.l - 30 && p.x < r.r + 30 && p.y > r.t - CLEAR && p.y < r.b + 30));
  }
  // a pixel to a point on the ground plane (view space), with the device at yaw 0
  function groundAt(F, x, y) {
    const { camera, w, h } = F, inv = new THREE.Matrix4().copy(view.matrixWorld).invert(), gy = -coaster.height, ndc = new THREE.Vector3();
    ndc.set(x / w * 2 - 1, 1 - y / h * 2, -1);
    const a0 = ndc.clone().unproject(camera).applyMatrix4(inv), a1 = ndc.clone().setZ(1).unproject(camera).applyMatrix4(inv);
    return a0.lerp(a1, (gy - a0.y) / (a1.y - a0.y));
  }
  function cablePath(F, x, y) { stage.updateMatrixWorld(true); return drapePx(F, groundAt(F, x, y)); }

  // The cable's far end: just beyond the nearest edge of the viewport, along the shortest run from the port that
  // stays clear of the drift word and above the marquee (leftward: away from the coaster's faces). Resize-time only.
  // Measured with the device at yaw 0 (where it is when the plug goes in); kept in view space (anchorV).
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
      if (best && len >= best.len) continue;
      // the real drape (it sags toward the viewer), not only the straight run, stays 30 px clear of the word
      if (drapeHits(F, pt, avoid)) continue;
      best = { len, pt };
    }
    anchorV = (best ? best.pt : ground(edge.l - 70, sy)).clone();
    bakedYaw = NaN;
    bakeCable(0);
  }
  // the far end stays where it is on the page while the device (and the cable's group with it) turns
  function bakeCable(yaw) {
    if (!cable || !anchorV || yaw === bakedYaw) return;
    bakedYaw = yaw;
    cable.bake(anc.copy(anchorV).applyAxisAngle(UP, -yaw));
  }

  function placeProp(g, o, baseYaw) {
    qa.setFromAxisAngle(tiltAxis, o.tilt); qb.setFromAxisAngle(UP, baseYaw + v.yaw + o.tw);
    g.quaternion.multiplyQuaternions(qa, qb);
    g.position.copy(hRight).multiplyScalar(o.lat); g.position.y += o.h;
    // tilt about the pivot (the rim it rocks on, or its middle while it is carried)
    pv.copy(hRight).multiplyScalar(o.px); pv.y = o.py;
    g.position.add(tmp.copy(pv).negate().applyQuaternion(qa).add(pv));
  }
  const MUG_YAW = .9, CAN_YAW = -.4;
  function apply() {
    coaster.setProgress(v.p);
    turn.rotation.y = v.yaw;
    bakeCable(v.yaw);
    view.position.y = lift * (1 - v.p);
    qy.setFromAxisAngle(UP, -v.yaw);       // part paths are screen-designed: undo the turn on them
    let any = false;
    for (let i = 0; i < parts.length; i++) {
      const P = parts[i], f = P.f;
      if (f < .999) any = true;
      q.setFromAxisAngle(P.axis, P.spin * f);
      piv.copy(P.mesh.position).add(P.center);
      tmp.copy(piv).applyQuaternion(q);
      P.wrap.quaternion.copy(q);
      P.wrap.position.copy(dT.copy(P.dir).applyQuaternion(qy)).multiplyScalar(dist * f).add(piv).sub(tmp);
      if (P.seat && P.explode) P.wrap.position.addScaledVector(P.explode, P.seat);
    }
    // the mug comes and goes on the left, the can on the right: they never share a path
    placeProp(mug.group, v.mug, MUG_YAW); placeProp(can.group, v.can, CAN_YAW);
    mug.group.visible = v.mug.h < drop - 1e-4; can.group.visible = v.can.h < drop - 1e-4;
    if (Math.abs(v.temp - lastTemp) > .05) { lastTemp = v.temp; coaster.setPlateTemperature && coaster.setPlateTemperature(v.temp); }
    if (coaster.setFrost && Math.abs(v.frost - lastFrost) > 1e-4) { lastFrost = v.frost; coaster.setFrost(v.frost); }
    steam.setIntensity(mug.group.visible ? v.steam : 0);
    steam.group.visible = mug.group.visible && v.steam > .002;
    if (steam.setTime) steam.setTime(v.time);
    if (steam.setDisturbance) steam.setDisturbance(v.dist, v.push[0], v.push[1], v.push[2]);
    if (mug.setSlosh) mug.setSlosh(v.slosh[0], v.slosh[1], v.slosh[2], v.slosh[3]);
    cond.setAmount(v.cond);
    if (ring) ring.setAmount(v.wet);
    if (fog) { fog.setAmount(v.fog); fog.setTime(v.time); }
    if (film) film.setAmount(v.film);
    if (shimmer) { shimmer.setIntensity(v.shimmer); shimmer.setTime(v.time); }
    if (coaster.setFanSpeed && v.fan !== lastFan) { lastFan = v.fan; coaster.setFanSpeed(v.fan); }
    if (rotor) rotor.rotation.y = v.fanA;
    setShadow(v.shadow);
    // a prop carried high above casts a broad faint shadow that reads as a ring on the page: let it fade in as it comes down
    for (const r of propShadows) r.rec.strength = 1 - sstep(r.from, r.to, (r.key === 'mug' ? v.mug : v.can).h);
    stage.visible = any || mug.group.visible || can.group.visible;
  }

  // One prop at T: lowered in from `side` and set down at tTouch (rocking once on its foot), lifted away from tOut0
  // over outD. A pure function of T.
  function propAt(T, o, side, tIn0, tTouch, tOut0, outD, rock, footR, comY) {
    let lat = 0, h = 0, tilt = 0, px = 0, py = comY, tw = 0, ax = 0;
    if (T < tTouch) {
      const L = tTouch - tIn0, Ll = L - .6, K = 2.6;              // the last .6 s is straight down
      h = landing(T, tIn0, tTouch, drop, .035, 3.2);
      const s = win(T, tIn0, tIn0 + Ll);
      lat = side * ARC * (1 - s) ** K;
      ax = s > 0 && s < 1 ? side * ARC * K * (K - 1) * (1 - s) ** (K - 2) / (Ll * Ll) : 0;
      tw = .35 * (1 - win(T, tIn0, tTouch)) ** 2;                 // the hand turns it into place
      tilt = LEAN * ax;
    } else if (T < tOut0) {
      const tau = T - tTouch, w = TAU * 5.5, z = .3, wd = w * Math.sqrt(1 - z * z);
      tilt = rock * Math.exp(-z * w * tau) * Math.sin(wd * tau); px = Math.sign(tilt) * footR; py = 0;
    } else {
      const Lo = outD - .3, K = 2.4, u = win(T, tOut0, tOut0 + outD), ul = win(T, tOut0 + .3, tOut0 + outD);
      h = drop * u ** 2.2;                                        // straight up first, then away
      lat = side * ARC * ul ** K;
      ax = ul > 0 && ul < 1 ? side * ARC * K * (K - 1) * ul ** (K - 2) / (Lo * Lo) : 0;
      tilt = LEAN * ax; tw = -.25 * u * u;
    }
    o.lat = lat; o.h = h; o.tilt = tilt; o.px = px; o.py = py; o.tw = tw; o.ax = ax;
    return o;
  }
  const mp = pose0(), mq = pose0();
  // the prop times on this timeline
  function times(S) {
    const M = S.MUG_DROP, X = S.SWAP, CE = S.CAN_EXIT;
    return {
      mIn: M.t0 - .3, mTouch: M.t0 + 1.35, mOut: X.t0 + .15, mOutD: 1.4,
      cIn: X.t0 + 1.0, cTouch: X.t1 - .55, cOut: CE.t0 + .1, cOutD: 1.4,
    };
  }

  // The reel as a pure function of T (seconds) and the timeline's states.
  function sample(T, S) {
    const E = S.COASTER_ENTER, A = S.ASSEMBLE, M = S.MUG_DROP, W = S.WARM, X = S.SWAP, C = S.CHILL, CE = S.CAN_EXIT, BT = S.BEAT, B = S.EXPLODE;
    v.time = T; v.yaw = yawAt(T, S);
    // parts: arrive bottom-up during COASTER_ENTER (a long soft landing, a few mm past and back), leave top-down
    // during EXPLODE (the stack opens, hangs and drifts, then each part floats off)
    const uIn0 = E.t0 - .6, eX = win(T, B.t0, B.t1), vc = .05 / dist;
    const drift = .012 * ease.inOutSine(win(eX, .3, .95));
    let fin = 0, fout = 0;
    for (let i = 0; i < parts.length; i++) {
      const P = parts[i], tA = uIn0 + (P.build / Math.max(1, n - 1)) * 1.45;
      const inn = landing(T, tA, tA + 1.4, 1, vc, 3.4, 15, .55);
      const out = win(eX, P.fs + .02, P.fs + .02 + FLY) ** 2.4;
      P.f = inn + out + (eX > 0 ? drift : 0);
      fin += clamp01(1 - inn); fout += out;
    }
    // assembly: the build order is the coaster's own (setProgress), but each part is set on its seat on our curve:
    // gathering pace, arriving with some speed, a stop and a tiny rebound (instead of fading to rest)
    const Ta = A.t0 - .2, Tb = A.t1 - .9;
    v.p = T < B.t0 ? ease.inOutSine(win(T, Ta, Tb)) : 1 - ease.inOutSine(win(eX, 0, OUT_U));
    for (const P of parts) {
      P.seat = 0;
      if (!P.win || !P.explode || T >= B.t0 || T <= Ta) continue;
      const ta = Ta + (Tb - Ta) * Math.acos(1 - 2 * P.win[0]) / Math.PI, tb = Ta + (Tb - Ta) * Math.acos(1 - 2 * P.win[1]) / Math.PI;
      if (T <= ta) continue;
      const len = P.explode.length() || 1e-6, wp = (v.p - P.win[0]) / (P.win[1] - P.win[0]);
      const liftOf = 1 - (c => c * c * c * (c * (c * 6 - 15) + 10))(clamp01(wp));
      let mine;
      if (T < tb) { const s = (T - ta) / (tb - ta); mine = 1 - (s * s * (3 - 2 * s) + M_SEAT * s * s * (s - 1)); }
      else {
        const vt = M_SEAT * len / Math.max(.05, tb - ta), wn = 30, z = .5, wd = wn * Math.sqrt(1 - z * z), tau = T - tb;
        mine = Math.min(.0004, .3 * vt / wd) * Math.exp(-z * wn * tau) * Math.abs(Math.sin(wd * tau)) / len;
      }
      P.seat = mine - liftOf;
    }
    // props
    const t = times(S);
    propAt(T, v.mug, -1, t.mIn, t.mTouch, t.mOut, t.mOutD, .6 * DEG, mug.footRadius || .035, .045);
    propAt(T, v.can, 1, t.cIn, t.cTouch, t.cOut, t.cOutD, .35 * DEG, can.footRadius || .024, .061);
    // plate temperature: neutral, hot through WARM, switching over in SWAP, cold through CHILL, neutral by the beat
    if (T < X.t0 + .9) v.temp = lerp(22, 55, ease.inOutSine(win(T, M.t0 + 1.2, W.t1 - 1)));
    else if (T < C.t0) v.temp = lerp(55, 34, ease.inOutSine(win(T, X.t0 + .9, X.t1)));
    else if (T < CE.t0) v.temp = lerp(34, 11, ease.outCubic(win(T, C.t0, C.t1 - 2.6)));
    else v.temp = lerp(11, 22, ease.inOutSine(win(T, CE.t0 + .5, BT.t1)));
    // steam: the coffee arrives hot (a plume trailing the carry), puffs when the mug lands, builds while the plate
    // keeps it hot, and is carried off with the mug. It bends away from the motion and breaks up when stirred.
    {
      const since = T - t.mTouch, carried = T < t.mTouch || T > t.mOut;
      const baseS = .5 + .5 * ease.inOutSine(win(T, t.mTouch, W.t0 + 2.5));
      v.steam = (baseS + (since > 0 ? .55 * Math.exp(-since / .4) : 0)) * (1 - ease.outQuad(win(T, t.mOut + .2, t.mOut + 1.2)));
      propAt(T - .3, mq, -1, t.mIn, t.mTouch, t.mOut, t.mOutD, .6 * DEG, mug.footRadius || .035, .045);
      // the plume lags the mug by about .3 s: lean it back along the way it came (in the mug's own frame)
      tmp.copy(hRight).multiplyScalar(mq.lat - v.mug.lat); tmp.y = mq.h - v.mug.h;
      const lagLen = tmp.length();
      if (lagLen > .06) tmp.multiplyScalar(.06 / lagLen);
      qb.setFromAxisAngle(UP, MUG_YAW + v.yaw + v.mug.tw).invert(); tmp.applyQuaternion(qb);
      v.push[0] = tmp.x; v.push[1] = Math.max(0, tmp.y) * .3; v.push[2] = tmp.z;
      v.dist = clamp01(Math.max(carried ? lagLen * 6 : 0, since > 0 ? .8 * Math.exp(-since / .35) : 0));
      // coffee: leans with the carry, swings when the sideways move stops, rings when it touches, settles
      tmp.copy(hRight).applyQuaternion(qb);
      const dir = Math.atan2(tmp.z, tmp.x), lean = -v.mug.ax * .033 / 9.8;
      const latEnd = t.mTouch - .6;
      const s1 = sloshAt(T - latEnd, { amp: .0012, freq: 3.6, zeta: .3, dir, ripple: 0 });
      const s2 = sloshAt(T - t.mTouch, { amp: .0006, freq: 3.6, zeta: .3, dir: dir + .6, ripple: .0005 });
      const s3 = sloshAt(T - t.mOut, { amp: .0004, freq: 3.6, zeta: .3, dir, ripple: .0003 });
      v.slosh[0] = lean * Math.cos(dir) + s1[0] + s2[0] + s3[0];
      v.slosh[1] = lean * Math.sin(dir) + s1[1] + s2[1] + s3[1];
      v.slosh[2] = s2[2] + s3[2]; v.slosh[3] = T > t.mOut ? s3[3] : s2[3];
    }
    // cold: condensation through its four stages over most of CHILL (haze, nucleation, growth, runs), a water ring
    // once drops reach the plate, frost creeping in from the plate edge, cold air falling off the plate
    v.cond = ease.inOutSine(win(T, C.t0 + .4, C.t1 - .2));
    v.wet = ease.inOutSine(win(T, C.t1 - 2.2, C.t1 + .4)) * (1 - ease.inOutSine(win(T, CE.t0 + .9, BT.t1 - .1)));
    const onPlate = v.p > .999 ? 1 : 0;
    v.frost = ease.inOutSine(win(T, C.t0 + 1.2, C.t1 - .4)) * (1 - ease.inOutSine(win(T, CE.t0 + .3, BT.t1 - .2))) * onPlate;
    v.film = v.frost * FILM;
    v.fog = .7 * sstep(21, 12, v.temp) * onPlate;
    v.shimmer = .9 * sstep(32, 50, v.temp) * onPlate;
    // the blower runs while the plate works (hidden in the closed case; its angle is the integral of its speed)
    const f0 = W.t0, f1 = W.t0 + 1.2, g0 = CE.t0, g1 = CE.t1;
    v.fan = 9 * (sstep(f0, f1, T) - sstep(g0, g1, T));
    v.fanA = -(TAU * 9 * (intSmooth(T, f0, f1) - intSmooth(T, g0, g1))) % TAU;
    v.shadow = Math.min(fin / n, 1 - fout / n) * (.35 + .65 * v.p);
    apply();
    // the cable: plugged in after ASSEMBLE, resting until the can has gone, pulled out and away in UNPLUG, gone
    // before EXPLODE. The approach, the alignment, the push to a stop and the drape that lags it are cable.js's.
    if (cable) {
      const PL = S.PLUG, UP_ = S.UNPLUG;
      if (T < PL.t0 || T >= UP_.t1) cable.hide();
      else if (T < UP_.t0) cable.showIn(T - PL.t0);
      else cable.showOut(T - UP_.t0);
    }
  }

  // Abort: props lift away first, then the coaster un-builds and its parts
  // leave in the same top-down order and on the same paths as EXPLODE.
  const ABORT_S = 2.4;
  let lag = 0;     // with the cable plugged in, it leaves first and the coaster waits a beat
  function beginAbort() {
    Object.assign(a0, v, { mug: { ...v.mug }, can: { ...v.can }, push: v.push.slice(), slosh: v.slosh.slice() });
    lag = cable && cable.visible ? .12 : 0;
    if (lag) cable.capture();
    for (const P of parts) {
      P.f0 = P.f; P.seat = 0;
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
    // the props go straight up and out the way they came, level
    const k = ease.inOutCubic(win(u, 0, .5));
    for (const [key, side] of [['mug', -1], ['can', 1]]) {
      const s = a0[key], o = v[key];
      o.h = lerp(s.h, Math.max(s.h, drop), k); o.lat = s.lat + side * ARC * k * k; o.tilt = s.tilt * (1 - k); o.px = s.px; o.py = s.py; o.tw = s.tw; o.ax = 0;
    }
    v.time = a0.time + u * ABORT_S;
    v.steam = a0.steam * (1 - ease.outQuad(win(u, 0, .35))); v.dist = Math.max(a0.dist, k);
    for (let i = 0; i < 4; i++) v.slosh[i] = a0.slosh[i] * (1 - k);
    v.cond = a0.cond; v.temp = lerp(a0.temp, 22, ease.inOutSine(win(u, 0, .6))); v.wet = a0.wet * (1 - win(u, 0, .4)); v.fan = 0; v.fanA = a0.fanA;
    const g = 1 - ease.inOutSine(win(u, 0, .4));
    v.fog = a0.fog * g; v.frost = a0.frost * g; v.film = a0.film * g; v.shimmer = a0.shimmer * g;
    v.shadow = Math.min(a0.shadow, fin / n);
    apply();
  }
  // Compile every shader variant the reel will need (props, steam, beads,
  // wet ring, fog, frost, shimmer all on) before the first run, so nothing compiles mid-reel.
  async function prewarm(renderer, camera, scene) {
    const hidden = [];
    for (const P of parts) { P.f = 0; P.seat = 0; }
    Object.assign(v, { p: 1, yaw: 0, temp: 55, steam: 1, dist: .5, cond: 1, wet: 1, fan: 9, fog: 1, frost: 1, film: 1, shimmer: 1, shadow: 1 });
    Object.assign(v.mug, pose0(), { h: 0 }); Object.assign(v.can, pose0(), { h: 0 });
    if (cable) cable.showIn(cable.plugIn.duration);
    apply();
    stage.traverse(o => { if (!o.visible) { hidden.push(o); o.visible = true; } });
    if (coaster.ready) try { await coaster.ready; } catch (e) { /* neutral textures until filled */ }
    // one mesh at a time with a task break between, so without KHR_parallel_shader_compile the links are many short
    // tasks instead of one long one (same programs, same cache keys: compile reads the target scene's lights)
    // Then one draw of that mesh alone through a 1x1 scissor on the canvas (as the hero's warmDraw does for the
    // whole actor): drivers that link on first use (SwiftShader, some mobile GPUs) do it here, one mesh per task,
    // and the case stage, which has no warmDraw, gets it too. The next frame redraws that pixel.
    const meshes = [], others = scene ? scene.children.filter(o => o !== stage && !o.isLight) : [];
    stage.traverse(o => { if (o.isMesh || o.isPoints || o.isLine) meshes.push(o); });
    const box = new THREE.Vector4();
    const drawOnly = m => {
      if (!scene || renderer.getRenderTarget()) return;
      const keep = meshes.map(o => [o.visible, o.frustumCulled]), keepO = others.map(o => o.visible), had = renderer.getScissorTest();
      for (const o of meshes) { o.visible = o === m; o.frustumCulled = false; }
      for (const o of others) o.visible = false;
      renderer.getScissor(box); renderer.setScissorTest(true); renderer.setScissor(0, 0, 1, 1);
      try { renderer.render(scene, camera); } finally {
        renderer.setScissor(box); renderer.setScissorTest(had);
        meshes.forEach((o, i) => { o.visible = keep[i][0]; o.frustumCulled = keep[i][1]; });
        others.forEach((o, i) => { o.visible = keepO[i]; });
      }
    };
    for (const m of meshes) {
      try { await renderer.compileAsync(m, camera, scene); drawOnly(m); } catch (e) { /* compiles on first draw instead */ }
      await new Promise(r => setTimeout(r, 0));
    }
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
  function reset() {
    if (cable) cable.hide();
    for (const P of parts) { P.f = 1; P.seat = 0; }
    Object.assign(v, { p: 0, yaw: 0, temp: 22, steam: 0, dist: 0, cond: 0, wet: 0, fan: 0, fanA: 0, fog: 0, frost: 0, film: 0, shimmer: 0, time: 0, shadow: 0 });
    v.push = [0, 0, 0]; v.slosh = [0, 0, 0, 0];
    Object.assign(v.mug, pose0(), { h: drop }); Object.assign(v.can, pose0(), { h: drop });
    apply();
  }
  // purely decorative per-frame time only: everything that shows is set in sample (steam, fog and shimmer run on
  // reel time; the impeller angle is the integral of its speed), so nothing accumulates here
  function update(dt, time) {
    if (!stage.visible) return;
    if (cond.update && can.group.visible) cond.update(dt, time);
    if (ring && ring.update) ring.update(dt, time);
    if (mug.update && mug.group.visible) mug.update(dt, time);
    if (can.update && can.group.visible) can.update(dt, time);
  }
  // the case page turns the stack itself (it holds one reel time): set the yaw after sample
  function turnTo(yaw) { v.yaw = yaw; apply(); }
  // LOOK (look.js): environment, tone, materials and contact shadows for this actor only; nothing shared changes
  if (mods.look) try { dress = await mods.look.dressThermaShift({ engine, quality, stage, view, coaster, mug, can, plate, parts }); } catch (e) { console.warn('[reel] look failed, using the shared rig', e); }
  if (dress) for (const [gr, from, to] of [[dress.ground, .03, .14], [dress.plateGround, .05, .2]]) {
    for (const rec of (gr && gr.occluders) || []) {
      if (rec.object === mug.group) propShadows.push({ rec, key: 'mug', from, to });
      if (rec.object === can.group) propShadows.push({ rec, key: 'can', from, to });
    }
  }
  reset();
  engine.adopt(stage);
  return {
    group: stage, sequence: ST.sequence, layout, sample, prewarm, abortSeconds: ABORT_S, values: v, coaster, cable, debugParts: parts, beginAbort, sampleAbort, reset, update, turnTo,
    get visible() { return stage.visible; },
    get dress() { return dress; },
    modules: { coaster: !!mods.coaster, props: !!mods.props, fx: !!mods.fx },
    dispose() { for (const m of [coaster, mug, can, steam, ring, cond, cable, fog, film, shimmer, dress]) m && m.dispose && m.dispose(); if (shadow) { shadow.geometry.dispose(); shadow.material.map.dispose(); shadow.material.dispose(); } },
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
  let fast = false, key = null, smoke = false;
  for (let t of tokens) {
    if (t === 'fast') { fast = true; continue; }
    if (t === 'smoke') { smoke = true; continue; }   // #reel-smoke: still accepted; the intro always leaves its smoke trail now (flame.js)
    if (t.endsWith('-fast')) { fast = true; t = t.slice(0, -5); }
    key = ALIASES[t] || t;
  }
  return { now: fast || !!key, fast, key, smoke };
}

// The order of a page load. Random (a visitor): CHARGER and the guests shuffled, the first one opens the page and
// is never the one that opened the last load (localStorage). Fixed (today's order: the rocket opens, the guests in
// registration order): under automation (navigator.webdriver), with a #reel-... / ?reel= flag, or when the page
// opens on a 3D viewer's address. window.__reelOrder set before mount overrides: 'fixed', 'random' or an array of
// keys (the cycle, its first key opens). Fixed: the cycle is the guests only, as before; otherwise CHARGER's
// turn in the cycle is the rocket's REST.
const OPENER_KEY = 'reel:opener';
function viewerHash() {
  const h = location.hash;
  return !!h && (h === '#explore' || Object.entries(PRODUCTS).some(([k, p]) => (p.hash || '#3d-' + k) === h));
}
function chooseOrder(flags) {
  const all = [HOME, ...projects], byKey = k => all.find(p => p.key === (ALIASES[k] || k));
  const want = window.__reelOrder;
  if (Array.isArray(want)) {
    const cycle = [...new Set(want.map(byKey).filter(Boolean))];
    if (cycle.length) return { mode: 'list', cycle, opener: cycle[0] };
  }
  const fixed = want === 'fixed' || (want !== 'random' && (navigator.webdriver || flags.now || /[?&]reel=|#reel-/.test(location.href) || viewerHash()));
  if (fixed) return { mode: 'fixed', cycle: projects.slice(), opener: HOME };
  const cycle = all.slice();
  for (let i = cycle.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [cycle[i], cycle[j]] = [cycle[j], cycle[i]]; }
  let last = null;
  try { last = localStorage.getItem(OPENER_KEY); } catch (e) { /* no storage: any opener */ }
  if (cycle.length > 1 && cycle[0].key === last) { const j = 1 + Math.floor(Math.random() * (cycle.length - 1)); [cycle[0], cycle[j]] = [cycle[j], cycle[0]]; }
  return { mode: 'random', cycle, opener: cycle[0] };
}
function rememberOpener(order, key) {
  if (order.mode !== 'random') return;
  try { localStorage.setItem(OPENER_KEY, key); } catch (e) { /* not remembered */ }
}

export async function mountShowreel({ box, drift = null, words = null, idleSeconds = 8 }) {
  const canvas = box.querySelector('canvas'), shadowEl = box.querySelector('.hero__shadow');
  const reducedQ = matchMedia('(prefers-reduced-motion: reduce)');
  const layoutName = () => (box.clientWidth / box.clientHeight < 1 ? 'port' : 'land');
  let current = layoutName();
  const quality = (innerWidth < 760 || (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4) ? 'low' : 'high';
  const engine = createEngine({ canvas });
  // The order of this load. A guest opens the page only where the rocket would have flown in (motion on, the hero
  // on screen); its build starts now, beside the rocket's, and the rocket waits off screen, dressed.
  const tMount = performance.now(), OPEN_WAIT = 6000;
  const order = chooseOrder(parseFlags()), cycle = order.cycle;
  const hb0 = box.getBoundingClientRect();
  const canFly = !reducedQ.matches && document.documentElement.classList.contains('hero-fly') && hb0.bottom > 0 && hb0.top < innerHeight;
  let opener = order.opener !== HOME && canFly ? order.opener : null;
  const early = new Map();   // key -> the actor factory's promise, started before the rocket is ready
  if (opener) { const ep = Promise.resolve().then(() => opener.actor({ engine, quality })); ep.catch(() => {}); early.set(opener.key, ep); }
  let opened = opener ? opener.key : HOME.key;
  rememberOpener(order, opened);
  // The rocket's studio look (look.js dressRocket) loads and builds beside the model, and the rocket is first shown
  // dressed. If the look does not come, the rocket keeps its plain materials and the page keeps its CSS shadow.
  const rocketP = createRocket({ layout: current });
  const dressP = import('./look.js').then(m => m.dressRocket({ engine, quality, rocket: rocketP, ownStudio: true })).catch(e => { console.warn('[reel] rocket look failed, using the plain materials', e); return null; });
  const mark = n => { try { performance.mark('reel:' + n); } catch (e) { /* no marks */ } };   // start-up timing (reports)
  mark('start');
  const rocket = await rocketP;
  mark('rocket');
  engine.scene.add(rocket.group);
  applyCamera(engine.camera, rocket.layout);
  const rocketLook = await dressP;
  mark('look');
  if (rocketLook && shadowEl) shadowEl.style.display = 'none';   // the rocket now casts its own (the blob stays for the poster)

  let flags = parseFlags(), speed = flags.fast ? 3 : 1;
  let mode = 'rest', T = 0, A = 0, idle = 0, loops = 0, timeline = null, guest = null, guestP = null, stateName = 'REST';
  // Guests: key -> { p, actor, timeline, promise, failed, laidOut }. `turn` is
  // the index (in `projects`) of the project that plays next.
  const cache = new Map();
  let turn = 0, pending = 0, layoutVersion = 0;
  let cur = null, out = null, holding = false;   // cache entry on stage; the outgoing one during a handover
  const warmingGroups = new Set();
  let settleAt = -1, settleAmp = 1, clock = 0;    // settle: the wobble after a return (ms on the loop's clock)
  let exitDist = 3, abortFrom = { fly: 0, spin: 0, wob: 0, wrap: false, delay: 0, guestS: 1.5 }, scrollP = 0, scrollSeen = false, ABORT = 2.2;
  let visible = true, raf = 0, slow = false, nSamples = 0, last = 0, paused = false;
  const samples = new Float32Array(60);
  const t0 = performance.now();
  const stats = { frames: 0, tick: 0, render: 0, max: 0, reset() { this.frames = this.tick = this.render = this.max = 0; } };
  const idleCb = window.requestIdleCallback || (f => setTimeout(f, 1500));
  const gov = createGovernor(engine.renderer, { onStep: (pr, ms) => console.info(`[reel] median frame ${ms.toFixed(1)} ms: pixel ratio ${pr}`) });

  function resize() {
    engine.size(box.clientWidth, box.clientHeight);
    const vw = engine.viewAt(engine.camera.position.z - rocket.layout.dist);   // the rest framing (the intro may have the camera pulled back)
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
    return { halfW: vw.halfW, halfH: vw.halfH, camera: engine.camera, w: b.width, h: b.height, free, avoid, vp, hero: true };
  }
  rocket.pose(0); // sets the axis
  resize();
  // INTRO: with motion on (html.hero-fly, set in the page head; the poster waits for it), the rocket starts off
  // screen, already placed for REST, and flies in on a lit motor (hero3d.js createIntro). Not when the hero is
  // off screen at load.
  // A guest opener: no fly-in; the rocket is parked off screen (as during any guest) until its turn or an input.
  function arrive() {
    const hb = box.getBoundingClientRect();
    const fly = !reducedQ.matches && document.documentElement.classList.contains('hero-fly') && hb.bottom > 0 && hb.top < innerHeight;
    const it = fly ? createIntro(rocket, { scene: engine.scene, camera: engine.camera, smoke: { scene: engine.scene, quality } }) : null;
    if (it) {
      it.prewarm(engine.renderer, engine.camera, engine.scene);
      // what a visitor sees of the canvas (the hero can be taller than the window): the flight is shaped to it
      const vp = { l: Math.max(0, -hb.left), r: Math.min(hb.width, innerWidth - hb.left), t: Math.max(0, -hb.top), b: Math.min(hb.height, innerHeight - hb.top) };
      if (marquee) vp.b = Math.min(vp.b, marquee.getBoundingClientRect().bottom - hb.top);
      it.start(exitDist, { camera: engine.camera, w: hb.width, h: hb.height, vis: vp });
      if (shadowEl) shadowEl.style.opacity = 0;
    }
    return it;
  }
  let intro = opener ? null : arrive();
  // the dressed rocket's programs (and the flame's) link off the main thread before the first frame may draw them
  if (rocketLook) {
    try { await engine.renderer.compileAsync(engine.scene, engine.camera); } catch (e) { /* the first draw compiles */ }
    mark('linked');
    // and one draw of the resting rocket into a single pixel (the canvas is not shown yet): uniforms, buffers and
    // maps are bound here, not in the first frame of the flight
    const r = engine.renderer, fly = rocket.state.fly;
    rocket.state.fly = 0; rocket.pose(0);
    r.setScissor(0, 0, 1, 1); r.setScissorTest(true);
    try { engine.render(); } catch (e) { /* the first frame does it */ }
    r.setScissorTest(false);
    rocket.state.fly = fly;
  }
  mark('compiled');
  rocket.settle(0);
  if (opener) { rocket.state.fly = exitDist; rocket.state.spin = SPIN; if (shadowEl) shadowEl.style.opacity = 0; }
  if (intro || opener) rocket.group.visible = false;
  engine.render();
  box.classList.add('is-live');
  mark('live');

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
  // `cycle` is this load's order (chooseOrder): guests and, unless fixed, HOME, whose turn is the rocket's REST.
  const indexOf = key => cycle.findIndex(p => p.key === key);
  const byKey = key => projects.find(p => p.key === key);
  // the first playable entry from index i on: a guest that has not failed, or HOME if `home` (else HOME is passed)
  function projectAt(i, home = false) {
    for (let k = 0; k < cycle.length; k++) {
      const p = cycle[(i + k) % cycle.length];
      if (p === HOME) { if (home) return p; continue; }
      const c = cache.get(p.key);
      if (!c || !c.failed) return p;
    }
    return null;
  }
  const upNext = () => projectAt(turn);   // a session starts with a guest: a REST is always CHARGER's turn
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
    const made = early.get(p.key); early.delete(p.key);
    c.promise = (made || Promise.resolve().then(() => p.actor({ engine, quality }))).then(async actor => {
      engine.scene.add(actor.group);
      c.actor = actor;
      c.tFirst = createTimeline([[EXIT, 2.1], ...actor.sequence]);   // first guest of a session
      c.tNext = createTimeline([[HANDOVER, LEAD], ...actor.sequence]);  // every later guest
      mark('built:' + p.key);
      // the actor poses for the shader compiler; it is hidden from the frames drawn meanwhile. Each step is its own
      // task (a frame can be drawn between them): layout, the programs, the warm draw (textures upload there)
      warmingGroups.add(actor.group);
      try {
        await nextTask(); layoutActor(c);
        await nextTask(); await actor.prewarm(engine.renderer, engine.camera, engine.scene); mark('prewarmed:' + p.key);
        await nextTask(); warmDraw(actor); mark('warmed:' + p.key);
      } finally { warmingGroups.delete(actor.group); }
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
  const upAfter = c => projectAt(indexOf(c.p.key) + 1, true);   // HOME: the rocket's turn comes next
  const guestAfter = c => projectAt(indexOf(c.p.key) + 1);      // the next guest to build
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
    const nx = mode === 'rest' ? upNext() : cur && guestAfter(cur);
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
    if (mode !== 'rest' || reducedQ.matches || (paused && !driving)) return;
    const p = upNext();
    if (!p) return;
    const c = cache.get(p.key);
    if (!c || !c.actor) { prepare(p).then(() => { if (mode === 'rest') startReel(); }).catch(() => { if (upNext()) startReel(); }); return; }
    use(c); timeline = c.tFirst; out = null; holding = false; homeTurn = false;
    mode = 'reel'; T = 0; idle = 0;
    kick();
  }
  // the current guest is finishing: hand over to the next one (it is prewarmed by now; if it is not, the stage
  // holds empty until it is, rather than compiling mid-transition)
  function handover() {
    const p = upAfter(cur);
    if (p === HOME) { returnHome(); return; }
    const c = p && cache.get(p.key);
    if (!c || !c.actor) {
      if (p && !cache.has(p.key)) prepare(p).catch(() => {});
      holding = true; return;
    }
    holding = false; loops++;
    if (c === cur) { cur.actor.reset(); T = 0; timeline = c.tNext; return; }   // a single project: replay it
    out = { c: cur, tl: timeline, T };
    use(c); timeline = c.tNext; T = 0;
  }
  // CHARGER's turn in the cycle: the guest plays out the rest of its exit and the rocket comes back on the abort's
  // return from behind (it starts as the guest's parts clear, as an abort's would), then REST for the idle delay.
  // An empty stage (a guest opener still building) brings the rocket back the same way.
  let natural = false, homeTurn = false, driving = false;
  function returnHome(empty = false) {
    const left = empty ? 0 : Math.max(0, timeline.total - T);
    if (!empty) { if (out) finishOut(); out = { c: cur, tl: timeline, T }; }
    guest = null; guestP = null; natural = true; homeTurn = !empty;
    mode = 'abort'; A = 0; holding = false;
    abortFrom.wrap = true; abortFrom.fly = -exitDist; abortFrom.spin = -SPIN; abortFrom.wob = 0; settleAt = -1;
    abortFrom.guestS = left;
    abortFrom.delay = Math.max(.3, left * .8);
    ABORT = Math.max(left, abortFrom.delay + RETURN_S);
    focus(null);
    setState('RETURNING');
  }
  // a guest opens the page: it enters as a later guest does (the HANDOVER lead-in, no rocket exit in front)
  function enterOpener(c) {
    if (mode !== 'open') return;
    clearTimeout(openTimer);
    use(c); timeline = c.tNext; out = null; holding = false;
    mode = 'reel'; T = 0; idle = 0;
    kick();
  }
  // the opener did not come (failed, or not ready in time): today's arrival, the rocket flies in
  function openFailed() {
    if (mode !== 'open') return;
    clearTimeout(openTimer);
    mode = 'rest'; cur = null; opened = HOME.key;
    rocket.state.fly = 0; rocket.state.spin = 0;
    intro = arrive();
    if (!intro) { rocket.group.visible = true; if (shadowEl) shadowEl.style.opacity = ''; shadowO = 1; }
    turn = Math.max(0, indexOf(opener.key) + 1) % cycle.length;
    kick();
  }
  let openTimer = 0;
  // The exit: a breath back with the nose dipping a touch (the weight shifts), then away nose first, the nose
  // coming up as it gathers speed; the speed grows as u^2 (steady push), never linear. No flame.
  function rocketAt(T) {
    const e = timeline.states[EXIT];
    settleAt = -1;
    if (e) {
      const u = win(T, e.t0, e.t1);
      rocket.state.fly = exitDist * u * u * (1.6 * u - .6); // a breath back, then away nose first
      rocket.state.spin = SPIN * u * u;
      rocket.state.wob = u < .5 ? -.016 * Math.sin(Math.PI * u / .5) ** 2 : 0;
    } else { rocket.state.fly = exitDist; rocket.state.spin = SPIN; rocket.state.wob = 0; }
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
    abortFrom.wob = rocket.state.wob; settleAt = -1;
    // the rocket comes back only once the guest's parts have cleared the frame
    abortFrom.guestS = guest.abortSeconds || 1.5;
    abortFrom.delay = abortFrom.wrap ? (guest.visible || out ? abortFrom.guestS * .8 : .3) : 0;
    ABORT = Math.max(abortFrom.guestS, abortFrom.delay + RETURN_S, abortFrom.wrap ? 0 : 1.3);
    guest.beginAbort();
    focus(null);
    setState('RETURNING');
  }
  // The return: from behind it coasts in like the arrival (constant deceleration: the speed falls in a straight
  // line to zero at the rest pose), from part way out it eases back; either way it settles with the damped wobble.
  function sampleAbort(A) {
    if (!natural) guest.sampleAbort(clamp01(A / abortFrom.guestS));
    const u = abortFrom.wrap ? win(A, abortFrom.delay, abortFrom.delay + RETURN_S) : win(A, 0, 1.3);
    const k = abortFrom.wrap ? 1 - (1 - u) ** 2 : ease.inOutCubic(u);
    rocket.state.fly = abortFrom.fly * (1 - k);
    rocket.state.spin = abortFrom.spin * (1 - k);
    rocket.state.wob = abortFrom.wob * (1 - clamp01(u * 4));
    if (u >= 1 && settleAt < 0) startSettle(abortFrom.wrap ? 1 : .5);
  }
  function startSettle(amp) { settleAt = clock; settleAmp = amp; }
  function finishOut() { if (out) { out.c.actor.reset(); out = null; trim(); } }
  function toRest() {
    const was = mode;
    finishOut();
    mode = 'rest'; T = 0; A = 0; idle = 0; holding = false; natural = false;
    if (was === 'abort' && settleAt < 0 && rocket.state.fly) startSettle(.5);
    rocket.state.fly = 0; rocket.state.spin = 0;
    if (guest) guest.reset();
    setState('REST');
    // resume with the guest after the one that was on stage (or the same one, if it had not come on yet)
    if (cur) {
      turn = cur.wasOnStage === false ? indexOf(cur.p.key) : (indexOf(cur.p.key) + 1) % cycle.length;
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
    clock = time;
    if (intro && mode !== 'rest') intro.hurry();         // no smoke left once a guest is on its way
    if (intro && !intro.step(dt, time, exitDist)) { intro.dispose(); intro = null; syncDom(); }
    if (settleAt >= 0) {                                  // the damped wobble after a return (REST or still in abort)
      const s = (time - settleAt) / 1000;
      rocket.state.wob = s > 1.4 ? 0 : wobble(s, INTRO_WOB * settleAmp);
      if (s > 1.4) settleAt = -1;
    }
    if (mode === 'rest') {
      const eligible = !reducedQ.matches && scrollP < .03 && (!slow || flags.now) && !(intro && intro.busy);
      if (eligible) {
        idle += dt;
        const wait = (flags.now && loops === 0 ? .6 : loops && !homeTurn ? idleSeconds * 1.5 : idleSeconds) / speed;
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
      if (mode !== 'reel') { /* CHARGER's turn: the return has begun (returnHome) */ }
      else if (!holding || T < timeline.total) {
        const tt = Math.min(T, timeline.total - 1e-4);
        setState(timeline.at(tt).name); rocketAt(tt); guest.sample(tt, timeline.states);
      }
      // build the guest after this one during this one's calm middle
      if (mode === 'reel' && !out && T > timeline.total * .3) { const nx = guestAfter(cur); if (nx && !cache.has(nx.key) && !pending) prepare(nx).catch(() => {}); }
    } else if (mode === 'abort') {
      A += dt * Math.max(1, speed * .75);
      if (A >= ABORT) toRest(); else sampleAbort(A);
    }
    if (mode !== 'rest' || rocket.state.fly || intro) syncDom();
    rocket.pose(time);
    if (guest && guest.visible) guest.update(dt, time);
    if (out && out.c.actor.visible) out.c.actor.update(dt, time);
  }
  function frame(now) {
    raf = 0;
    if (!visible || document.hidden || paused || mode === 'open') { last = 0; return; }
    const dt = last ? Math.min(.064, (now - last) / 1000) : 1 / 60;
    // slow devices: in REST give up the loop and draw single frames on scroll.
    // Judged on the median of 60 frames after load has settled.
    if (last && mode === 'rest' && !flags.now && !slow && !pending && !intro && now - t0 > 2500 && !window.__reelNoSlowGuard) {
      samples[nSamples++] = now - last;
      if (nSamples === samples.length) { samples.sort(); if (samples[30] > 38) slow = true; nSamples = 0; }
    }
    // the governor steps the pixel ratio down before the slow guard would give up (not while a guest builds)
    if (last && !pending && gov.sample(now - last)) nSamples = 0;
    last = now;
    const a = performance.now();
    tick(dt, now - t0);
    const b = performance.now();
    render();
    const c = performance.now();
    if (mode !== 'rest') { stats.frames++; stats.tick += b - a; stats.render += c - b; if (c - a > stats.max) { stats.max = c - a; stats.maxAt = stateName + '@' + T.toFixed(2); } }
    if (!slow || mode !== 'rest' || settleAt >= 0) raf = requestAnimationFrame(frame);
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
  function interact() {
    idle = 0; if (intro) intro.abort();
    if (mode === 'reel') beginAbort();
    else if (mode === 'open') { cur = cache.get(opener.key) || { p: opener }; cur.wasOnStage = false; clearTimeout(openTimer); returnHome(true); }
  }
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
    if (reducedQ.matches) { if (intro) { intro.dispose(); intro = null; } toRest(); settleAt = -1; rocket.state.wob = 0; syncDom(); if (raf) { cancelAnimationFrame(raf); raf = 0; } requestAnimationFrame(still); }
    else kick();
  });
  // re-place in the same frame: setSize clears the canvas, so draw now rather than paint one empty frame, and
  // pose at the current time (pose(0) would snap the sway for a frame)
  new ResizeObserver(() => {
    if (layoutName() !== current) { current = layoutName(); rocket.setLayout(current); applyCamera(engine.camera, rocket.layout); }
    resize();
    if (slow || reducedQ.matches) still();
    else { rocket.pose(performance.now() - t0); render(); }
  }).observe(box);

  // a guest opener: the stage stays empty (no frames drawn) until it is built and prewarmed, then it enters; if it
  // fails, or is not ready OPEN_WAIT ms after the mount began, the rocket flies in as it always did
  if (opener && !reducedQ.matches) {
    mode = 'open';
    prepare(opener).then(enterOpener, openFailed);
    if (!window.__reelNoSlowGuard) openTimer = setTimeout(openFailed, Math.max(0, OPEN_WAIT - (performance.now() - tMount)));
  } else if (opener) { opener = null; opened = HOME.key; }
  // warm the guest up once the page has settled, so the first reel is smooth. Not after an arrival: a build is long
  // main-thread work and would stall the flight or the visitor's first scroll; REST builds the next guest once the
  // hero has been left alone for half the idle delay (tick).
  if (!reducedQ.matches && !intro) prepareSoon(upNext());
  if (reducedQ.matches) still(); else kick();

  // debug and capture hooks
  const hitRay = new THREE.Raycaster(), hitNdc = new THREE.Vector2();
  const api = window.__reel = {
    engine, rocket, rocketLook, stats, projects,
    get mode() { return mode; }, get state() { return stateName; }, get T() { return T; },
    get total() { return timeline ? timeline.total : 0; }, get guest() { return guest; }, get slow() { return slow; }, get quality() { return quality; },
    get speed() { return speed; }, set speed(s) { speed = s; },
    get project() { return guestP ? guestP.key : null; }, get next() { const p = upNext(); return p ? p.key : null; },
    get built() { return [...cache.keys()].filter(k => cache.get(k).actor); },
    // this load's order (read only): 'fixed' | 'random' | 'list', the cycle's keys, and the project that opened
    get order() { return Object.freeze({ mode: order.mode, cycle: Object.freeze(cycle.map(p => p.key)), opener: opened }); },
    use(key) { pick(key); return api.next; },
    prepare: key => prepare(key ? byKey(key) : upNext()),
    start() { flags.now = true; startReel(); }, abort: beginAbort,
    pause() { paused = true; if (raf) { cancelAnimationFrame(raf); raf = 0; } },
    resume() { paused = false; idle = 0; kick(); },
    // is the resting rocket under this viewport point (the explorer opens from a click on it)
    hitRocket(x, y) {
      if (mode !== 'rest' || paused || intro || !rocket.group.visible) return false;
      const b = canvas.getBoundingClientRect();
      if (x < b.left || x > b.right || y < b.top || y > b.bottom) return false;
      hitNdc.set((x - b.left) / b.width * 2 - 1, (b.top - y) / b.height * 2 + 1);
      hitRay.setFromCamera(hitNdc, engine.camera);
      return hitRay.intersectObject(rocket.group, true).length > 0;
    },
    // advance the live state machine by dt seconds and draw (capture, tests)
    get introRoom() { return intro ? intro.room : null; },
    // (a paused reel driven this way still starts its sessions when the idle delay has passed)
    advance(dt, time = performance.now() - t0) { driving = true; try { tick(dt, time); } finally { driving = false; } render(); return mode + ':' + stateName; },
    get outgoing() { return out ? out.c.p.key : null; }, get holding() { return holding; },
    // jump to reel time t (seconds) and draw one frame synchronously
    // (key: play that project's reel; default: the one playing, else the next)
    async seek(t, key, time = performance.now() - t0) {
      const p = key ? byKey(key) : (guestP && mode !== 'rest' ? guestP : upNext());
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

// Export only, for the Studio case pages (next/js/case-stage.js), which mount this actor on their own canvas.
export { createThermaShift };
