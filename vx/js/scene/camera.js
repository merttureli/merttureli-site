/* Camera rig for the CHARGER field scene (FIELD.md section 6).
   Presets side, quarter, chase and pad, smooth transitions on the site easing
   cubic-bezier(0.22, 1, 0.36, 1), orbit by dragging empty space with the vendored
   OrbitControls, zoom limits, and a ground clamp.

   World frame (FIELD.md section 2): x downrange, y up, z toward the default camera.
   Offsets are spherical about the target: azimuth from +z toward +x, elevation
   from the horizontal plane, distance in metres.

   Modes
     side     target on the rocket's frame point, camera on +z (the pitch plane is
              seen face on, so the slice reads as a flat section), rigid follow.
     quarter  same target, camera 38 deg round toward +x and 15 deg up, rigid follow.
     chase    target follows the rocket through a critically damped tracking
              filter with velocity feed-forward (lags only while the rocket
              accelerates), camera trails behind the air-relative flight path.
     pad      camera fixed on the ground near the pad, looking at the rocket, with
              a tracking zoom (field of view narrows as the range grows).
     free     entered when the visitor orbits or zooms; rigid follow with the
              offset the visitor left.
   The rig never runs its own animation frame: the scene calls update(dt, ctx)
   once per drawn frame and keeps drawing while update() returns true. */
import * as THREE from 'three';
import { OrbitControls } from '../../../assets/charger-explorer/vendor/OrbitControls.js';

const DEG = Math.PI / 180;
export const FOV_DEG = 32;                 // vertical field of view of the presets (deg), narrow so the side view reads flat
export const NEAR_M = 0.05, FAR_M = 3000;  // clip planes (m); the flight tops out near 315 m (PAGE 1,033 ft)
export const TRANSITION_MS = 1200;         // preset change, the site's --dur-5
export const PRESETS = ['side', 'quarter', 'chase', 'pad'];
const MIN_DISTANCE_M = 0.45, MAX_DISTANCE_M = 80;   // orbit zoom limits (m)
const GROUND_CLEAR_M = 0.12;               // the camera never goes below this height (m)
/* Frame box the side and quarter presets fit (m, half extents about the frame
   point, which sits near mid-length): the lattice domain is L / 0.66 = 1.79 m long
   (FIELD.md section 5) and 0.56 m across; 1.12 m along the axis keeps the domain,
   the relative wind arrow ahead of the nose and most of the thrust arrow in. */
const FIT_HALF_AXIAL_M = 1.12, FIT_HALF_LATERAL_M = 0.5;
const SIDE = { az: 0, el: 3 * DEG, k: 1.0 };
const QUARTER = { az: 38 * DEG, el: 15 * DEG, k: 1.12 };
/* Chase: 1.7 m behind along the air-relative flight path, 2.9 m to the +z side,
   0.4 m to the in-plane side, aimed 0.15 m behind the frame point so the tail and
   the plume stay in: about 30 deg up from behind in flight, and still 3 m off when
   the ground clamp lifts it on the pad. */
const CHASE_BACK_M = 1.7, CHASE_SIDE_M = 2.9, CHASE_LATERAL_M = 0.4, CHASE_LEAD_M = -0.15;
/* Tracking filter natural frequency (rad/s). Steady-state lag under a constant
   acceleration a is a / omega^2; at the boost's roughly 8 g (PAGE thrust to weight
   8.17) that is 78 / 144 = 0.54 m, inside the 0.95 m half frame. EST. */
const CHASE_OMEGA = 12;
const CHASE_DIR_TAU_S = 0.4;               // one-pole smoothing of the chase direction (s)
const CHASE_SUBSTEP_S = 1 / 240;           // filter sub-step; omega * dt = 0.05 keeps it stable
const SNAP_M = 25;                         // a jump larger than this per frame is a reset: snap, do not chase
/* Pad camera: 1.4 m up, 9 m downrange and 16 m out (18 m from the rail, past the
   NAR safety code's 30 ft minimum for a G motor). The tracking zoom keeps 1.6 m of
   the scene in the vertical frame, between 0.8 and 32 deg. EST (a launch
   photographer's position, not a site figure). */
export const PAD_CAMERA = new THREE.Vector3(9, 1.4, 16);
const PAD_FRAME_M = 1.6, PAD_FOV_MIN = 0.8;

/* cubic-bezier(x1, y1, x2, y2) as a function of x in [0, 1]: Newton on x(t) with
   a bisection fallback, then y(t). The site easing is (0.22, 1, 0.36, 1). */
export function cubicBezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (t) => ((ax * t + bx) * t + cx) * t;
  const sy = (t) => ((ay * t + by) * t + cy) * t;
  const dx = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (!(x > 0)) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const e = sx(t) - x, d = dx(t);
      if (Math.abs(e) < 1e-6) return sy(t);
      if (Math.abs(d) < 1e-6) break;
      t -= e / d;
    }
    let lo = 0, hi = 1; t = x;
    for (let i = 0; i < 30; i++) { const v = sx(t); if (Math.abs(v - x) < 1e-6) break; if (v < x) lo = t; else hi = t; t = (lo + hi) / 2; }
    return sy(t);
  };
}
export const easeSite = cubicBezier(0.22, 1, 0.36, 1);

const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));
function toSph(v, out) {
  const r = Math.max(1e-6, v.length());
  out.r = r; out.az = Math.atan2(v.x, v.z); out.el = Math.asin(Math.max(-1, Math.min(1, v.y / r)));
  return out;
}
function fromSph(s, out) {
  const c = Math.cos(s.el);
  return out.set(s.r * c * Math.sin(s.az), s.r * Math.sin(s.el), s.r * c * Math.cos(s.az));
}

/* Distance that fits the frame box at this aspect with the preset fov. */
export function fitDistance(aspect, k = 1) {
  const t = Math.tan(FOV_DEG * DEG / 2);
  const a = Math.max(0.2, aspect || 1.6);
  return k * Math.max(FIT_HALF_AXIAL_M / t, FIT_HALF_LATERAL_M / (t * a));
}

export function createCameraRig({ camera, canvas, reducedMotion = false, zoom = true, onUserStart = null, onChange = null }) {
  const controls = new OrbitControls(camera, canvas);
  controls.enablePan = false;               // the target always follows the rocket
  controls.enableZoom = !!zoom;
  controls.enableDamping = !reducedMotion;
  controls.dampingFactor = 0.12;
  controls.rotateSpeed = 0.8;
  controls.zoomSpeed = 0.9;
  controls.minDistance = MIN_DISTANCE_M;
  controls.maxDistance = MAX_DISTANCE_M;
  controls.minPolarAngle = 0.02;            // rad; allows looking up from under the rocket (pad, chase)
  controls.maxPolarAngle = Math.PI - 0.02;

  let mode = 'side', preset = 'side', reduced = !!reducedMotion;
  let transition = null;                    // { t0, dur, fromRel: V3, fromSph, fromFov }
  let userActive = false, damping = false;
  const freeOffset = new THREE.Vector3(0, 0.2, 3.3);
  const target = new THREE.Vector3();
  const desiredTarget = new THREE.Vector3(), desiredOffset = new THREE.Vector3();
  const chasePos = new THREE.Vector3(), chaseVel = new THREE.Vector3(), chaseDir = new THREE.Vector3(0, 1, 0);
  const lastFrame = new THREE.Vector3(), frameVel = new THREE.Vector3();
  let chaseReady = false, haveLast = false;
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), lateral = new THREE.Vector3();
  const sA = { r: 1, az: 0, el: 0 }, sB = { r: 1, az: 0, el: 0 };
  let fov = FOV_DEG;

  const onStart = () => {
    userActive = true; transition = null;
    if (mode !== 'free') { mode = 'free'; freeOffset.subVectors(camera.position, controls.target); }
    controls.minDistance = MIN_DISTANCE_M; controls.maxDistance = MAX_DISTANCE_M;
    if (onUserStart) onUserStart();
  };
  const onEnd = () => { userActive = false; damping = controls.enableDamping; };
  const onCtrlChange = () => { if (onChange) onChange(); };
  controls.addEventListener('start', onStart);
  controls.addEventListener('end', onEnd);
  controls.addEventListener('change', onCtrlChange);

  /* Desired pose of a preset now. ctx: { frame: V3 (frame point on the axis),
     flightDir: V3 (unit, air-relative flight direction, world), aspect, dt }. */
  function presetPose(name, ctx, outTarget, outOffset) {
    if (name === 'side' || name === 'quarter') {
      const p = name === 'side' ? SIDE : QUARTER;
      outTarget.copy(ctx.frame);
      fromSph({ r: fitDistance(ctx.aspect, p.k), az: p.az, el: p.el }, outOffset);
      return FOV_DEG;
    }
    if (name === 'chase') {
      outTarget.copy(chasePos).addScaledVector(chaseDir, CHASE_LEAD_M);
      lateral.set(chaseDir.y, -chaseDir.x, 0);           // in-plane perpendicular (+x side when flying up)
      outOffset.copy(chaseDir).multiplyScalar(-CHASE_BACK_M).addScaledVector(lateral, CHASE_LATERAL_M);
      outOffset.z += CHASE_SIDE_M;
      return FOV_DEG;
    }
    if (name === 'pad') {
      outTarget.copy(ctx.frame);
      outOffset.subVectors(PAD_CAMERA, outTarget);
      const d = outOffset.length();
      return Math.max(PAD_FOV_MIN, Math.min(FOV_DEG, 2 * Math.atan(PAD_FRAME_M / 2 / Math.max(d, 0.1)) / DEG));
    }
    outTarget.copy(ctx.frame);
    outOffset.copy(freeOffset);
    return FOV_DEG;
  }

  /* Tracking filter for the chase target: x'' = w^2 (c - x) + 2 w (c' - x'),
     zero lag at constant velocity, a / w^2 under constant acceleration. */
  function stepChase(ctx, dt) {
    const c = ctx.frame;
    if (!haveLast) { lastFrame.copy(c); haveLast = true; }
    const jump = tmp.subVectors(c, lastFrame).length();
    if (dt > 0) frameVel.copy(tmp).divideScalar(dt);
    if (!chaseReady || jump > SNAP_M) { chasePos.copy(c); chaseVel.set(0, 0, 0); chaseDir.copy(ctx.flightDir); chaseReady = true; frameVel.set(0, 0, 0); }
    lastFrame.copy(c);
    let left = Math.min(dt, 0.1);
    while (left > 1e-9) {
      const h = Math.min(CHASE_SUBSTEP_S, left); left -= h;
      tmp2.subVectors(c, chasePos).multiplyScalar(CHASE_OMEGA * CHASE_OMEGA);
      tmp2.addScaledVector(tmp.subVectors(frameVel, chaseVel), 2 * CHASE_OMEGA);
      chaseVel.addScaledVector(tmp2, h);
      chasePos.addScaledVector(chaseVel, h);
    }
    const k = 1 - Math.exp(-Math.min(dt, 0.1) / CHASE_DIR_TAU_S);
    chaseDir.lerp(ctx.flightDir, reduced ? 1 : k).normalize();
    if (!(chaseDir.lengthSq() > 0.5)) chaseDir.copy(ctx.flightDir);
    const err = tmp.subVectors(c, chasePos).length() + tmp2.subVectors(frameVel, chaseVel).length() * 0.05;
    return err > 0.002;
  }

  function applyFov(f) {
    if (Math.abs(f - fov) > 1e-4) { fov = f; camera.fov = f; camera.updateProjectionMatrix(); }
  }

  /* Advance the rig by dt seconds. Returns true while the camera still moves on
     its own (transition, chase settling, orbit damping). */
  function update(dt, ctx) {
    let moving = false;
    if (mode === 'chase' || preset === 'chase') moving = stepChase(ctx, dt) || moving;
    else { chaseReady = false; haveLast = false; }

    if (mode === 'free') {
      tmp.subVectors(ctx.frame, controls.target);
      camera.position.add(tmp);
      controls.target.copy(ctx.frame);
      const changed = controls.update(dt);
      if (changed && !userActive) moving = true;
      if (!changed) damping = false;
      freeOffset.subVectors(camera.position, controls.target);
      applyFov(FOV_DEG);
      target.copy(controls.target);
    } else {
      let f = presetPose(mode, ctx, desiredTarget, desiredOffset);
      if (transition) {
        const k = easeSite((performance.now() - transition.t0) / transition.dur);
        tmp.subVectors(desiredTarget, ctx.frame);                 // preset target relative to the frame point
        tmp.lerpVectors(transition.fromRel, tmp, k);
        desiredTarget.copy(ctx.frame).add(tmp);
        toSph(desiredOffset, sB);
        sA.r = Math.exp(Math.log(transition.fromSph.r) + (Math.log(sB.r) - Math.log(transition.fromSph.r)) * k);
        sA.az = transition.fromSph.az + wrapPi(sB.az - transition.fromSph.az) * k;
        sA.el = transition.fromSph.el + (sB.el - transition.fromSph.el) * k;
        fromSph(sA, desiredOffset);
        f = transition.fromFov + (f - transition.fromFov) * k;
        if (k >= 1) transition = null; else moving = true;
      }
      target.copy(desiredTarget);
      camera.position.copy(target).add(desiredOffset);
      applyFov(f);
      controls.target.copy(target);
      // The pad camera can sit hundreds of metres away; widen the limit so a later
      // orbit does not snap it before the visitor's own zoom applies the limits.
      controls.maxDistance = Math.max(MAX_DISTANCE_M, desiredOffset.length() + 1);
    }
    if (camera.position.y < GROUND_CLEAR_M) camera.position.y = GROUND_CLEAR_M;
    camera.lookAt(target);
    camera.updateMatrixWorld();
    return moving || userActive;
  }

  function setPreset(name, ctx) {
    if (!PRESETS.includes(name)) return false;
    const from = mode;
    preset = name; mode = name;
    if (name === 'chase') { chaseReady = false; haveLast = false; }
    if (reduced || !ctx || from === name && !transition) { transition = null; return true; }
    transition = {
      t0: performance.now(), dur: TRANSITION_MS,
      fromRel: new THREE.Vector3().subVectors(target, ctx.frame),
      fromSph: toSph(new THREE.Vector3().subVectors(camera.position, target), { r: 1, az: 0, el: 0 }),
      fromFov: fov,
    };
    return true;
  }

  return {
    controls,
    update,
    setPreset,
    get mode() { return mode; },
    get preset() { return preset; },
    get transitioning() { return !!transition; },
    get target() { return target; },
    get fov() { return fov; },
    get distance() { return camera.position.distanceTo(target); },
    setReducedMotion(r) { reduced = !!r; controls.enableDamping = !reduced; if (reduced) transition = null; },
    setZoom(z) { controls.enableZoom = !!z; },
    dispose() {
      controls.removeEventListener('start', onStart);
      controls.removeEventListener('end', onEnd);
      controls.removeEventListener('change', onCtrlChange);
      controls.dispose();
    },
  };
}
