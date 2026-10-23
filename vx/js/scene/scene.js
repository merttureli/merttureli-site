/* CHARGER field scene (FIELD.md section 6): the 3D stage of the field study.

   Owns the THREE.WebGLRenderer (WebGL2 only, antialias off above DPR 1.5,
   high-performance power preference, pixel ratio from governor.dpr(tier) under a
   backing store cap per tier, MAX_BACKING_PX); the
   integrator passes scene.renderer to createLattice so the lattice's render
   targets live in the same context and the slice samples them directly.

   World (FIELD.md section 2): x downrange (wind blows toward +x), y up, z toward
   the default camera, metres. Positions follow vx/js/flight: (x, y) is the world
   position of a fixed body station, derived.xref metres aft of the nose tip (the
   liftoff CG station, flight.config.cgFromNose), and the flight origin is the rail
   base with the aft end resting on it. The scene stands that origin on a launch
   stand PAD.standM above the ground, so scene y = flight y + PAD.standM. The rocket
   group sits at the reference station, rotated by theta about z (theta from +y,
   positive toward +x, so rotation.z = -theta). Inside it the body group holds the CAD
   frame: the published assembly (positions in assembly.bin are already metres;
   only the bounds in assembly.json are millimetres, 0.001 m per unit), the livery,
   the four fins (parts 6, 7, 8, 9) each on a pivot at its root leading edge so
   setFinScale(k) scales span and chord about that edge, the lattice slice in the
   local pitch plane, the exhaust and the invisible grab capsule.

   Render policy: nothing draws unless something changed. setFlight and every
   setter mark the frame dirty and request one animation frame; the loop keeps
   running only while something moves on its own (camera transition, chase
   settling, orbit damping, plume flicker, slice view rotation, flick vector) and
   stops when the tab is hidden or the canvas is off screen. If the integrator
   drives render(dt) itself, the internal loop yields (no double draws).
   Tier 0: no plume, no camera transitions; one frame per change. Reduced motion:
   no camera transitions, no plume flicker, no orbit damping.

   Flight time (presentation plan item 12): the plume's drift and jitter advance on
   flight time, not wall time, so a slowed replay shows a slowed flame and a paused one
   a still flame. setTimeScale(k) sets it: a number k >= 0 advances the plume by the
   frame's wall seconds times k (the playback rate, 0 while paused); 'flight' (the
   default) follows the flight time handed in through setFlight (state.t): each drawn
   frame advances by the change in t since the last drawn frame (0 while paused or on
   a reset, at most MAX_PLUME_STEP_S). Until a finite t arrives, 'flight' runs on wall
   time, so a bench that never passes t keeps a live plume.

   Slice dissolve (item 12): setDissolve(k) widens the slice's fade at the domain's two
   ends from 2 to 10 percent of its length and fades out its hairline frame (the corner
   ticks stay); k = 0 is the framed section, 1 the dissolved one. The inner 80 percent
   of the slice is the same pixel for pixel at any k.

   Camera framing (item 12): setFraming({k, aimM, elDeg}) scales the side, quarter and
   hero fits, moves their aim point along the body axis and can override their
   elevation, eased; the hero preset is the static low three-quarter view for the
   empty stage (camera.js HERO). Nothing here switches presets or framings on its own:
   a director (director.js) decides when.

   Paths and the end plate (item 10): setTrail and setGhostTrail draw the flight's path
   and the other fin choice's path (trail.js: up to 4,096 points each, finned in paper,
   finless in livery orange, 1 px at 45 percent in flight). setPlate('trails') eases the
   camera back over 2400 ms (a cut under reduced motion) to a face-on view that fits both
   paths from the pad to apogee, clear of the page's end card (opts.avoid); on the plate the
   paths are 2 px with RAIL EXIT, BURNOUT and APOGEE n FT SIM ticks, the altitude ladder
   stands left of them for scale, the 3D plates, the slice and the ALT cursor step aside, and
   a 3 px livery dot marks the rocket (shown whenever the rocket is under 12 px on screen).

   The gust beat (item 12): setGust({mph, tag}) puts GUST n.n MPH EST on the wind arrow's
   plate while a pulse acts; setAoaArc(true) asks for the angle-of-attack arc at the nose.
   The scene draws the arc only face on to the pitch plane (the side preset, not moving,
   not on the plate): an angle never reads from the quarter, chase, pad or hero views, and
   this guard holds whoever asks. setEmphasis(names) dims the plates the beat is not about.
   onFlight(fn) hands every state setFlight receives to a listener (the director's clock).

   Interaction: a pointer down on the rocket (raycast against an invisible
   cylinder around the body, at least 22 px in radius on screen) starts a flick
   drag; the drag shows a vector, the release returns a pitch-rate impulse through
   onFlick(radPerSec). The grab point and the CG are held in body coordinates, so
   a rocket that moves during the drag (the cameras follow it) is not counted as
   drag. Anywhere else the vendored OrbitControls orbit and zoom; while they own a
   pointer, a second finger always goes to them (a pinch), and a second finger
   during a flick cancels the flick. With the canvas focused, the left and right
   arrow keys flick too (no key repeat, no modifier chords). The pointer never
   reaches the lattice. */
import * as THREE from 'three';
import { dprFor } from '../core/governor.js';
import { loadGeometry, describeParts, buildScene, disposeScene } from '../stage/loader.js';
import { createCameraRig, FOV_DEG, NEAR_M, FAR_M, PRESETS, PLATE_MS, easeSite, TRANSITION_MS } from './camera.js';
import { createSlice, defaultDomain, NOSE_Y, LENGTH_M } from './slice.js';
import { createMarkers, createLabel, createArrow, fitLabelSide, fitLabelY, LABEL_PX, signed, FIT_MARGIN_PX } from './markers.js';
import { createExhaust } from './exhaust.js';
import { createTrail, layoutTicks, screenPaths, pathsCrossing, pathsXRange } from './trail.js';

const DEG = Math.PI / 180;
export const TAIL_Y = NOSE_Y - LENGTH_M;     // CAD, aft face of the screw cap (-0.6102 m)
export const BODY_R = 0.034;                 // CAD, body tube radius (m)
export const CG_DEFAULT_M = 0.5588;          // PAGE, CG 22 in from the nose
const FT = 0.3048;                           // STD, metres per foot
const FIN_IDS = [6, 7, 8, 9];                // CAD, the four fins (FIELD.md section 1)
const KEEP_INTERIOR = [18, 19];              // motor mount and screw cap protrude aft of the tube; keep them drawn
/* Pad (EST, not site figures): the flight origin (rail base, aft end resting on it)
   stands 3 in above the ground on the blast deflector; the rail is a 1010 extrusion
   (1.00 in square) whose centre line sits 52.7 mm from the body axis on the
   rail-button side (CAD buttons at body -x, 34.0 to 43.7 mm from the axis, plus
   half the profile less the slot depth); 1.83 m (6 ft) default length as the flight
   model's EST default. */
export const PAD = { standM: 0.0762, railOffsetM: 0.0527, railProfileM: 0.0254, railDefaultM: 1.83 };
/* Altitude ladder beside the rail area: 0.62 m upwind of the rail and 0.5 m behind
   the pitch plane, so the side view keeps it in frame down to a 390 px wide phone
   (the frame is 0.9 m either side there) without crossing the slice (0.28 m wide).
   In flight it keeps that offset from the rocket across the range (an altitude tape: its
   ticks are world heights, its x is not a measurement), so the ALT cursor stays in the
   side view while the rocket weathercocks upwind (the coast beat's subject, item 7); a
   rocket pitched over pushes it further upwind, LADDER_CLEAR_M clear of the airframe and
   the slice. On the plate it stands left of the paths. Its zero is the reference station's
   height on the pad, so it reads altitude above the pad, as the ALT cursor and the panel do. */
const LADDER = { x: -0.62, z: -0.5, topFt: 1100, majorFt: 100, minorFt: 10, majorTickM: 0.2, minorTickM: 0.08 };
const LADDER_CLEAR_M = 0.12;
/* Point on the body axis the presets frame, measured from the nose tip (m): just aft
   of mid-length (0.59 m), toward the lattice domain's centre (0.68 m). */
const FRAME_FROM_NOSE_M = 0.62;
/* Flick (EST, interaction gains, not physics): the drag's angle about the CG
   (lateral drag over lever arm) times FLICK_GAIN is the pitch-rate impulse,
   clamped to FLICK_MAX. A drag that would turn the rocket by 10 deg gives 40 deg/s.
   The squared lever arm in the denominator is floored at FLICK_MIN_ARM_M squared,
   so a sideways push at the CG gives no rotation and the response stays bounded
   and continuous through the CG. */
export const FLICK_GAIN = 4;                 // 1/s
export const FLICK_MAX = 3;                  // rad/s (172 deg/s)
export const FLICK_KEY = 0.6;                // rad/s per arrow key press (34 deg/s), doubled with Shift
const FLICK_MIN_ARM_M = 0.15;                // lever arm floor (m) in the denominator; a grab near the CG does not explode
const FLICK_DEADZONE_PX = 4;
const FLICK_FADE_MS = 480;                   // the vector fades over --dur-3 after release
const GRAB_MIN_PX = 22;                      // grab cylinder radius floor on screen (touch target)
/* After an external render(dt) the internal loop yields for max(100 ms, 2.5 x the
   measured interval between external calls), so a slow external cadence (a software
   renderer, a throttled tab) is not mistaken for the caller having stopped. */
const EXTERNAL_YIELD_MS = 100, EXTERNAL_YIELD_K = 2.5;
const ARIA_MS = 1000;                        // the canvas label changes at most once per second
const MAX_PLUME_STEP_S = 0.25;               // a drawn frame never advances the plume by more flight time than this (a STEP, a seek)
const PAPER_HEX = 0xffffff;                  // the altitude cursor is paper: on the stage orange means push (item 8)
const LABEL_K_MIN = 10 / LABEL_PX;           // sprite labels never below the site's 10 px meta floor (FIELD.md section 2)
/* The end plate (item 10), EST layout choices: headroom over the highest apogee and the ladder's
   gap to the left of the paths, as shares of the box height; px kept round the box for the
   ladder labels (left), the tick labels (right and top) and the ground line (bottom). */
const PLATE_HEADROOM = 0.04, PLATE_LADDER_GAP = 0.05;
const PLATE_PAD_PX = { l: 66, r: 132, t: 44, b: 44 };
const PLATE_HARD_R_PX = 48;                   // a cramped plate keeps this much of the right label room (the ghost's apogee tick)
const ROCKET_DOT_PX = 3, ROCKET_DOT_BELOW_PX = 12;   // the livery dot (3 px) shows while the rocket is under 12 px long on screen
const OVERLAY_MS = 250;                       // the page's overlay rectangles are re-read at most this often (a layout read per read)
const LADDER_LABEL_MIN_PX = 22;              // ladder labels closer than this on screen thin to every 200 ft, then every 500 ft
const AXIS_CLEAR_PX = 2, AXIS_GAP_PX = 6;    // the plate's +X DOWNRANGE label: px kept from a path, and its gap beside the paths when it moves
/* Backing store pixel cap per tier (shipping finding C2-10): the ratio is min(governor.dpr(tier),
   sqrt(cap / CSS px)), so a 2560 x 1440 screen at DPR 2 no longer fills 11 Mpx every frame at tier 3.
   Never below PIXEL_RATIO_MIN (the 10 px mono labels stay legible); tier 0 draws only on a change and
   keeps its 1x. */
export const MAX_BACKING_PX = Object.freeze({ 3: 6e6, 2: 3e6, 1: 1.5e6 });
const PIXEL_RATIO_MIN = 0.5;
export function pixelRatioFor(tier, w, h, dpr = dprFor(tier)) {
  const cap = MAX_BACKING_PX[tier];
  const area = Math.max(1, w) * Math.max(1, h);
  if (!cap || area * dpr * dpr <= cap) return dpr;
  return Math.max(PIXEL_RATIO_MIN, Math.min(dpr, Math.sqrt(cap / area)));
}

/* Flight-frame pose of the reference station xref (m from the nose) on the pad:
   aft end at the rail base (the flight origin), as vx/js/flight places it. */
export function padPose({ xref = CG_DEFAULT_M, launchAngle = 0 } = {}) {
  const arm = LENGTH_M - xref;
  return { x: arm * Math.sin(launchAngle), y: arm * Math.cos(launchAngle), theta: launchAngle };
}

const num = (v, d) => (Number.isFinite(v) ? v : d);

/* ---------- ground: analytic mono grid, faded with distance --------------- */
const GROUND_VERT = /* glsl */`
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const GROUND_FRAG = /* glsl */`
uniform vec3 uCam;
uniform vec4 uGlow;      // xz of the plume's ground point, strength, radius (m)
varying vec3 vWorld;
float grid(vec2 p, float stepM, float widthPx) {
  vec2 q = p / stepM;
  vec2 fw = max(fwidth(q), vec2(1e-6));
  vec2 g = abs(fract(q - 0.5) - 0.5) / fw;
  float l = 1.0 - min(min(g.x, g.y) / widthPx, 1.0);
  return l * (1.0 - smoothstep(0.06, 0.22, max(fw.x, fw.y)));   // drop lines closer than about 5 px (moire)
}
void main() {
  vec2 p = vWorld.xz;
  float d = length(vWorld - uCam);
  float a = max(max(grid(p, 1.0, 1.0) * 0.075, grid(p, 10.0, 1.0) * 0.17), grid(p, 100.0, 1.3) * 0.24);
  float fwz = max(fwidth(p.y), 1e-6);
  float axis = (1.0 - min(abs(p.y) / fwz / 1.4, 1.0)) * step(0.0, p.x) * 0.42;   // the +x downrange axis
  a = max(a, axis);
  float fade = 1.0 - smoothstep(30.0, 900.0, d);
  vec3 base = vec3(0.039) + vec3(0.016) * (1.0 - smoothstep(4.0, 160.0, d));
  vec3 col = base + vec3(1.0) * a * fade;
  float r = length(p - uGlow.xy);
  col += vec3(1.0, 0.52, 0.18) * uGlow.z * exp(-(r * r) / (uGlow.w * uGlow.w));
  gl_FragColor = vec4(col, 1.0);
}`;

export function createScene(canvas, options = {}) {
  if (!canvas) throw new Error('createScene needs a canvas');
  const { geometry = null, tier: tier0, zoom = true, keyboard = true, touchAction = null } = options;
  /* The lattice CP ring (CP 2D SECTION): a 2D section of a long body lifts like a wing,
     so its CP lands ahead of the CG and is no stability figure for the rocket. It is
     drawn where it is asked for: options.latticeCp, else on ?lab and on the lab pages. */
  const labHere = typeof location !== 'undefined' && (/[?&]lab\b/.test(location.search) || /\/lab\//.test(location.pathname));
  let latticeCp = options.latticeCp ?? labHere;
  const reducedMQ = matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = reducedMQ.matches;
  let tier = Math.max(0, Math.min(3, (tier0 ?? (reduced ? 0 : 3)) | 0));
  let destroyed = false, built = false, contextLost = false, onScreen = true;
  let width = 0, height = 0, dpr = 1;
  let raf = 0, lastTick = 0, dirty = true, animating = false, lastExternal = -1e9, extInterval = 0, lastDrawAt = 0;
  let frames = 0, lastMs = 0, lastAria = -1e9, ariaText = '', cursorText = -1e9;
  const flickFns = new Set();
  const flight = { x: 0, y: 0, theta: 0, alpha: 0, v: 0, airspeed: NaN, thrust: 0, N: 0, phase: 'pad', t: 0, altitude: NaN, xcp: NaN, xcpNow: NaN };
  const derived = { xcp: NaN, xcg: CG_DEFAULT_M, xref: CG_DEFAULT_M, xcpLattice: NaN, tags: {} };
  const camModeFns = new Set();
  const flightFns = new Set();                 // onFlight listeners (the director)
  Object.assign(flight, padPose());
  let finScale = 1, railLength = PAD.railDefaultM, launchAngle = 0, markersOn = true, view = 'smoke';
  /* plume clock: 'flight' follows state.t between draws; a number is a fixed factor on wall time */
  let timeScale = 'flight', plumeT = NaN, plumeStep = 0, haveT = false;
  let error = null, cad = null, entries = [];
  /* item 10 and 12 state: the plate, the gust plate line, the arc request, the emphasis */
  let plateUp = false, plateSpec = null, plateAvoid = null, plateBoxNow = null, plateInsets = null, plateLadderX = NaN;
  let ladderMix = 0, ladderMixTween = null;    // 0: the ladder follows the rocket; 1: it stands at the plate's x ({from, to, t0, dur} eases between)
  let plateLadderLast = NaN;                   // the plate's ladder x, kept while the ladder eases back to the rocket
  let ladderGap = Infinity;                    // m between the ladder and the airframe or the slice (the cursor line stops short of it)
  let gustNow = null, arcWanted = false, arcShown = false, arcBlocked = '', trailLive = false;
  let tickRects = [];
  let axisPlate = null;                        // the plate's +X DOWNRANGE spot: {spot, rect, crossed}
  let sliceWanted = false;                     // a texture is set (the slice draws unless the plate is up)
  let overlaysFn = null, overlayRects = [], overlaysAt = -1e9;   // the page's DOM overlays on the canvas (setOverlays), read at most every OVERLAY_MS
  const info = { calls: 0, triangles: 0, ms: 0 };
  const flick = { active: null, count: 0, last: 0, fadeT0: 0, preview: 0, fade: null, gW: new THREE.Vector3(), cW: new THREE.Vector3() };
  const orbitPointers = new Set();             // pointers OrbitControls owns (pointer downs the scene let through)

  /* ---------- renderer (WebGL2 or a clean fallback) ---------- */
  let gl = null, renderer = null, fallback = null;
  try {
    const aa = (devicePixelRatio || 1) <= 1.5;
    gl = canvas.getContext('webgl2', { alpha: false, antialias: aa, depth: true, stencil: false, premultipliedAlpha: true, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
    if (!gl) fallback = 'no-webgl2';
    else {
      renderer = new THREE.WebGLRenderer({ canvas, context: gl, antialias: aa, alpha: false, powerPreference: 'high-performance' });
      renderer.setClearColor(0x0a0a0a, 1);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.info.autoReset = true;
    }
  } catch (e) { fallback = gl ? 'renderer-failed' : 'no-webgl2'; error = e; renderer = null; }
  canvas.dataset.scene = fallback ? 'fallback' : 'loading';

  if (fallback) {
    // Every method is safe and draws nothing; the page shows its 2D fallback
    // (panel/fallback.js). stats and the getters keep the documented shape with
    // neutral values, so callers read them the same way on every browser.
    const noop = () => {};
    let fbFins = 1, fbMarkers = true, fbView = 'smoke', fbSlice = 'through';
    const dom = defaultDomain();
    return {
      ready: Promise.resolve(false), fallback, renderer: null, camera: null, three: null,
      get error() { return error; },
      setFlight: noop, setSliceTexture: noop, setSliceDomain: noop,
      setSliceView(v) { if (v !== 'through' && v !== 'between') return false; fbSlice = v; return true; },
      setView(name) { fbView = String(name); },
      setCamera: () => false,
      setMarkers(on) { fbMarkers = !!on; },
      setLatticeCp(on) { latticeCp = !!on; }, get latticeCp() { return latticeCp; },
      setFinScale(k) { fbFins = Math.max(0, num(+k, 1)); },
      setRail: noop, setTier(t) { tier = Math.max(0, Math.min(3, t | 0)); }, resize: noop, render: noop,
      onFlick: () => noop, onCameraMode: () => noop, checkSign: () => null, destroy: noop,
      setTimeScale(k) { return k === 'flight' || k == null ? 'flight' : (Number.isFinite(+k) && +k >= 0 ? +k : 'flight'); },
      get timeScale() { return 'flight'; },
      setDissolve(k) { return Math.max(0, Math.min(1, k === true ? 1 : +k || 0)); },
      setFraming: () => null, get framing() { return null; },
      setTrail: () => 0, setGhostTrail: () => 0, setTrailLive: noop, setPlate: () => false, get plate() { return null; },
      setGust: () => null, setAoaArc: () => false, setEmphasis: () => null, get emphasis() { return null; },
      setSliceOpacity: noop, onFlight: () => noop, setOverlays: noop,
      get stats() {
        return {
          fallback, built: false, tier, dpr: 1, frames: 0, ms: 0, calls: 0, triangles: 0, loop: 'idle',
          camera: { mode: 'side', preset: 'side', distance: 0, fov: FOV_DEG, transitioning: false },
          flick: { count: 0, last: 0, preview: 0, dragging: false },
          slice: { visible: false, view: fbSlice, domain: { ...dom }, size: { widthM: dom.cols * dom.cellM, heightM: dom.rows * dom.cellM }, dissolve: 0 },
          plume: { mode: 'flight', timeScale: null, step: 0, advance: 0, clock: 0, visible: false, level: 0 },
          trail: { points: 0, ghostPoints: 0, style: 'flight', live: false, ticks: [], ghostTicks: [] },
          plate: { up: false, box: null, insets: null, ladderX: NaN, ticks: [], axis: null },
          ladder: { x: NaN, fromRocketM: NaN, mix: 0, visible: false, cursor: false },
          arc: { wanted: false, shown: false, blocked: 'no-webgl2' }, gust: null, emphasis: null, rocketDot: false,
          labels: { nAt: null, stationsPx: NaN, rects: {} },
          size: { width: 0, height: 0 }, contextLost: false, reduced, mpp: 0,
        };
      },
      get cad() { return null; }, get tier() { return tier; },
      get finScale() { return fbFins; }, get markers() { return fbMarkers; }, get view() { return fbView; },
      get sliceView() { return fbSlice; }, get cameraPreset() { return 'side'; },
    };
  }

  /* ---------- scene graph ---------- */
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a0a);
  const camera = new THREE.PerspectiveCamera(FOV_DEG, 1, NEAR_M, FAR_M);
  camera.position.set(0, 0.8, 3.3);
  // light: sky fill, a key from the front left, a warm rim from behind right (separates the orange from the dark)
  scene.add(new THREE.HemisphereLight(0xe6ebf0, 0x2a2018, 1.7));
  const key = new THREE.DirectionalLight(0xffffff, 2.8); key.position.set(-2.5, 4, 5); scene.add(key);
  const rim = new THREE.DirectionalLight(0xffd8b0, 2.2); rim.position.set(3, 2.5, -4); scene.add(rim);
  const disposables = [];
  const track = (o) => { disposables.push(o); return o; };

  // ground
  const groundMat = track(new THREE.ShaderMaterial({
    vertexShader: GROUND_VERT, fragmentShader: GROUND_FRAG, depthWrite: true,
    uniforms: { uCam: { value: new THREE.Vector3() }, uGlow: { value: new THREE.Vector4(0, 0, 0, 1) } },
  }));
  const groundGeo = track(polarGround());
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.frustumCulled = false; ground.renderOrder = -10;
  scene.add(ground);

  // pad: base plate, blast deflector, 1010 rail (rail group pivots at the pad with the launch angle)
  const steel = track(new THREE.MeshStandardMaterial({ color: 0x3a3a3a, metalness: 0.5, roughness: 0.55 }));
  const alu = track(new THREE.MeshStandardMaterial({ color: 0x8c8c8c, metalness: 0.35, roughness: 0.6 }));   // anodised 1010, kept matte so it never outshines the airframe
  // base plate on the ground, a post up to the deflector disc the aft end rests on
  const plate = new THREE.Mesh(track(new THREE.BoxGeometry(0.36, 0.02, 0.36)), steel);
  plate.position.set(-0.03, 0.01, 0); scene.add(plate);
  const post = new THREE.Mesh(track(new THREE.CylinderGeometry(0.014, 0.014, PAD.standM - 0.026, 16)), steel);
  post.position.set(0, 0.02 + (PAD.standM - 0.026) / 2, 0); scene.add(post);
  const deflector = new THREE.Mesh(track(new THREE.CylinderGeometry(0.09, 0.09, 0.006, 32)), steel);
  deflector.position.set(0, PAD.standM - 0.003, 0); scene.add(deflector);
  // the rail pivots about the flight origin (the rail base) with the launch angle
  const railGroup = new THREE.Group(); railGroup.position.set(0, PAD.standM, 0); scene.add(railGroup);
  const railGeo = track(new THREE.BoxGeometry(PAD.railProfileM, 1, PAD.railProfileM).translate(0, 0.5, 0));
  const rail = new THREE.Mesh(railGeo, alu);
  rail.position.set(-PAD.railOffsetM, 0, 0);
  const railFoot = new THREE.Mesh(track(new THREE.BoxGeometry(0.05, PAD.standM - 0.02, 0.05).translate(0, -(PAD.standM - 0.02) / 2, 0)), steel);
  railFoot.position.set(-PAD.railOffsetM, 0, 0);
  railGroup.add(rail, railFoot);
  function layoutRail() {
    rail.scale.set(1, railLength, 1);
    railGroup.rotation.z = -launchAngle;
  }
  layoutRail();

  // altitude ladder: vertical line, minor ticks every 10 ft, major ticks and mono labels every 100 ft
  const ladder = new THREE.Group(); ladder.position.set(LADDER.x, 0, LADDER.z); scene.add(ladder);
  {
    const major = [], minor = [];
    const lift = 0.004;                     // m; keeps the 0 ft tick off the ground plane (no z-fight)
    for (let f = 0; f <= LADDER.topFt; f += LADDER.minorFt) {
      const y = f * FT + (f === 0 ? lift : 0), isMajor = f % LADDER.majorFt === 0;
      (isMajor ? major : minor).push(0, y, 0, isMajor ? LADDER.majorTickM : LADDER.minorTickM, y, 0);
      // the upright in 10 ft pieces: one 335 m segment whose top lies behind the
      // camera plane is dropped by some rasterisers (SwiftShader among them)
      if (f < LADDER.topFt) major.push(0, y, 0, 0, (f + LADDER.minorFt) * FT, 0);
    }
    for (const [arr, op] of [[major, 0.6], [minor, 0.28]]) {
      const g = track(new THREE.BufferGeometry()); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
      const m = track(new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: op, depthWrite: false }));
      const l = new THREE.LineSegments(g, m); l.frustumCulled = false; ladder.add(l);
    }
  }
  // the ladder's foot: a faint line from its zero (the station's pad height) down to the ground, no ticks
  const ladderFootGeo = track(new THREE.BufferGeometry());
  ladderFootGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, -1, 0], 3));
  const ladderFoot = new THREE.LineSegments(ladderFootGeo, track(new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28, depthWrite: false })));
  ladderFoot.frustumCulled = false; ladder.add(ladderFoot);
  const ladderLabels = [];
  // no 0 ft label: on the pad the ALT cursor's own label sits there (item 4 drops the duplicate)
  for (let f = LADDER.majorFt; f <= LADDER.topFt; f += LADDER.majorFt) {
    // labels on the upwind side of the upright, clear of the rocket and its markers
    const lab = createLabel({ plate: false, align: 'right' });
    lab.sprite.material.depthTest = true;
    lab.sprite.position.set(-0.03, f * FT, 0);
    lab.sprite.renderOrder = 5;
    ladder.add(lab.sprite);
    ladderLabels.push({ lab, f });
  }
  // ladder cursor: a paper tick at the reference station's height with the altitude in ft
  const cursorGeo = track(new THREE.BufferGeometry());
  cursorGeo.setAttribute('position', new THREE.Float32BufferAttribute([-0.08, 0, 0, 0.3, 0, 0], 3));
  const cursorMat = track(new THREE.LineBasicMaterial({ color: PAPER_HEX, transparent: true, opacity: 0.95, depthWrite: false }));
  const cursor = new THREE.LineSegments(cursorGeo, cursorMat); cursor.frustumCulled = false; ladder.add(cursor);
  const cursorLabel = createLabel({ align: 'right' });
  cursorLabel.sprite.material.depthTest = true;
  cursorLabel.sprite.renderOrder = 6;
  ladder.add(cursorLabel.sprite);
  const axisLabel = createLabel({ plate: false });
  axisLabel.sprite.material.depthTest = true;
  axisLabel.sprite.position.set(3.0, 0.02, 0);
  scene.add(axisLabel.sprite);
  function writeStaticLabels() {
    for (const { lab, f } of ladderLabels) { lab.invalidate(); lab.set([[[`${f} FT`, 'rgba(255,255,255,0.78)']]]); }
    axisLabel.invalidate(); axisLabel.set([[['+X DOWNRANGE', 'rgba(255,255,255,0.78)']]]);
  }
  writeStaticLabels();

  // contact shadow under the rocket (soft radial decal, fades with height)
  const shadowTex = track(radialTexture('rgba(0,0,0,0.85)'));
  const shadowMat = track(new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
  const shadow = new THREE.Mesh(track(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)), shadowMat);
  shadow.position.y = 0.002; shadow.renderOrder = -5; scene.add(shadow);

  // rocket: group at the CG, body group in the CAD frame
  const rocket = new THREE.Group(); rocket.name = 'rocket'; scene.add(rocket);
  const body = new THREE.Group(); body.name = 'body-cad-frame'; rocket.add(body);
  const cadRoot = new THREE.Group(); body.add(cadRoot);
  const finPivots = [];
  const slice = createSlice({ noseY: NOSE_Y, reducedMotion: reduced });
  body.add(slice.mesh);
  const exhaust = createExhaust({ tier, reducedMotion: reduced });
  body.add(exhaust.group);
  const grabMat = track(new THREE.MeshBasicMaterial({ visible: false }));
  const grab = new THREE.Mesh(track(new THREE.CylinderGeometry(1, 1, 1, 12)), grabMat);
  grab.visible = false;                       // never drawn; the raycaster still tests it
  grab.position.y = (NOSE_Y + TAIL_Y) / 2;
  body.add(grab);
  const markers = createMarkers();
  scene.add(markers.group);
  // the flight's path and the ghost (item 10), drawn before the slice so the flow reads over them
  const trail = createTrail({ renderOrder: 3 });
  const ghostTrail = createTrail({ ghost: true, renderOrder: 2 });
  scene.add(trail.group, ghostTrail.group);
  // the rocket as a 3 px livery dot when it is too small to see (the plate at a few hundred metres)
  const dotTex = track(radialDot());
  const rocketDot = new THREE.Sprite(track(new THREE.SpriteMaterial({ map: dotTex, transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false })));
  rocketDot.renderOrder = 43; rocketDot.frustumCulled = false; rocketDot.visible = false;
  scene.add(rocketDot);
  const flickArrow = createArrow(0xffffff, 0.95);
  const flickLabel = createLabel();
  flickArrow.group.visible = false; flickLabel.sprite.visible = false;
  scene.add(flickArrow.group, flickLabel.sprite);

  /* ---------- camera rig ---------- */
  const rig = createCameraRig({
    camera, canvas, reducedMotion: reduced, zoom, onChange: () => invalidate(),
    onModeChange: (mode, preset) => { for (const fn of [...camModeFns]) { try { fn({ mode, preset }); } catch (err) { console.error('[scene] onCameraMode listener threw', err); } } },
  });
  if (touchAction) canvas.style.touchAction = touchAction;   // e.g. 'pan-y' on a scrolling page (sideways flicks still reach the scene)
  let preset = 'side';

  /* ---------- per-frame scratch ---------- */
  const v3 = { a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), d: new THREE.Vector3() };
  const sliceCorners = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const ctx = { frame: new THREE.Vector3(), axis: new THREE.Vector3(0, 1, 0), flightDir: new THREE.Vector3(0, 1, 0), aspect: 1.6, theta: 0 };
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const plane = new THREE.Plane();
  let mpp = 0.002;
  const pxToScale = (px) => 2 * px * labelK() / (camera.projectionMatrix.elements[5] * Math.max(1, height));
  const labelK = () => Math.max(LABEL_K_MIN, Math.min(1, width / 900));   // labels shrink a little on phones, never below 10 px

  function applyFlight() {
    rocket.position.set(num(flight.x, 0), num(flight.y, 0) + PAD.standM, 0);
    rocket.rotation.set(0, 0, -num(flight.theta, 0));
    body.position.set(0, -(NOSE_Y - num(derived.xref, CG_DEFAULT_M)), 0);
  }

  /* Plume seconds for this drawn frame: flight time in 'flight' mode (the change in
     state.t since the last draw), else wall seconds times the fixed factor. */
  function plumeDt(dt) {
    let d;
    if (timeScale === 'flight') {
      if (!haveT) d = dt;                          // no flight time yet (a bench): wall time
      else {
        const t = num(flight.t, 0);
        d = Number.isFinite(plumeT) ? t - plumeT : 0;
        plumeT = t;
        if (!(d > 0)) d = 0;                       // paused, or a reset that sent t back
      }
    } else d = dt * timeScale;
    plumeStep = Math.min(MAX_PLUME_STEP_S, Math.max(0, num(d, 0)));
    return plumeStep;
  }

  /* ---------- the end plate (item 10) ---------- */
  /* The plate's world box: the paths (the flight's and the ghost's) and the pad, with headroom
     over the highest apogee and the ladder moved to the left of them (plateLadderX). */
  function resolvePlateBox() {
    let b = null;
    if (plateSpec === 'trails') {
      for (const tr of [trail, ghostTrail]) {
        const q = tr.count > 1 ? tr.bounds() : null;
        if (!q) continue;
        b = b ? { x0: Math.min(b.x0, q.x0), y0: Math.min(b.y0, q.y0), x1: Math.max(b.x1, q.x1), y1: Math.max(b.y1, q.y1) } : { ...q };
      }
      if (!b) return null;
      b.x0 = Math.min(b.x0, 0); b.x1 = Math.max(b.x1, 0); b.y0 = 0;          // the pad and the ground line
    } else if (plateSpec && typeof plateSpec === 'object') {
      b = { x0: +plateSpec.x0, y0: +plateSpec.y0, x1: +plateSpec.x1, y1: +plateSpec.y1 };
      if (![b.x0, b.y0, b.x1, b.y1].every(Number.isFinite)) return null;
    } else return null;
    const h = Math.max(1, b.y1 - b.y0);
    b.y1 += PLATE_HEADROOM * h;
    plateLadderX = Math.min(LADDER.x, b.x0 - PLATE_LADDER_GAP * h);
    b.x0 = plateLadderX;
    plateBoxNow = b;
    return b;
  }
  /* The page's overlays (setOverlays: elements or client rects) as canvas rectangles in CSS px, cached
     for OVERLAY_MS (each read is a layout read). Hidden or empty elements are left out. */
  function clientRects(list) {
    const out = [];
    if (!list || !list.length) return out;
    const cr = canvas.getBoundingClientRect();
    const W = Math.max(1, width), H = Math.max(1, height);
    for (const it of list) {
      const r = it && typeof it.getBoundingClientRect === 'function' ? (it.hidden || it.closest?.('[hidden]') ? null : it.getBoundingClientRect()) : it;
      if (!r || !(r.width > 0) || !(r.height > 0)) continue;
      const x0 = Math.max(0, r.left - cr.left), y0 = Math.max(0, r.top - cr.top), x1 = Math.min(W, r.right - cr.left), y1 = Math.min(H, r.bottom - cr.top);
      if (x1 > x0 && y1 > y0) out.push({ x0, y0, x1, y1 });
    }
    return out;
  }
  function overlays(now) {
    if (!overlaysFn) return [];
    if (now - overlaysAt < OVERLAY_MS) return overlayRects;
    overlaysAt = now;
    let list = [];
    try { list = overlaysFn() || []; } catch { list = []; }
    overlayRects = clientRects(list);
    return overlayRects;
  }

  /* Insets (CSS px) for the plate: fixed room for the labels round the box, plus whatever the page
     asked the plate to keep clear (opts.avoid: elements or client rects, read every frame, since
     the end card appears with the stop). Each rectangle pushes in from the side that costs the
     box the least scale. */
  function computeInsets() {
    const W = Math.max(1, width), H = Math.max(1, height);
    // the ladder's labels stand left of the box: room for the widest one and its gap (on screen)
    const ladRoom = Math.ceil((Math.max(0, ...ladderLabels.map(({ lab }) => lab.width)) + 6) * labelK()) + 6;
    const padL = Math.max(PLATE_PAD_PX.l, ladRoom), padR = Math.min(PLATE_PAD_PX.r, W * 0.14);
    // hard: what a cramped plate may not widen into (plateFit): the canvas edge for the ladder labels, then
    // each avoided rectangle with the ladder labels beside it; the soft label room on the far side gives first
    const ins = { l: padL, r: padR, t: PLATE_PAD_PX.t, b: PLATE_PAD_PX.b, rects: [], hard: { l: ladRoom, r: Math.min(padR, PLATE_HARD_R_PX), t: 0, b: 0 } };
    let list = [];
    try { list = plateAvoid ? plateAvoid() || [] : []; } catch { list = []; }
    const rects = clientRects(list);
    if (!rects.length) return ins;
    const box = plateBoxNow;
    const bw = box ? Math.max(1, box.x1 - box.x0) : 1, bh = box ? Math.max(1, box.y1 - box.y0) : 1;
    const scaleFor = (q) => Math.min((W - q.l - q.r) / bw, (H - q.t - q.b) / bh);
    for (const { x0, y0, x1, y1 } of rects) {
      ins.rects.push({ x0, y0, x1, y1 });
      // the label room is kept beyond the rectangle too (the ladder labels sit left of the box)
      const hd = ins.hard;
      const opts = [
        { l: Math.max(ins.l, x1 + padL), r: ins.r, t: ins.t, b: ins.b, hard: { ...hd, l: Math.max(hd.l, x1 + ladRoom) } },
        { l: ins.l, r: Math.max(ins.r, W - x0 + padR), t: ins.t, b: ins.b, hard: { ...hd, r: Math.max(hd.r, W - x0 + 8) } },
        { l: ins.l, r: ins.r, t: Math.max(ins.t, y1 + PLATE_PAD_PX.t), b: ins.b, hard: { ...hd, t: Math.max(hd.t, y1 + 8) } },
        { l: ins.l, r: ins.r, t: ins.t, b: Math.max(ins.b, H - y0 + 24), hard: { ...hd, b: Math.max(hd.b, H - y0 + 24) } },
      ];
      let best = opts[0], bs = -Infinity;
      for (const o of opts) { const sc = scaleFor(o); if (sc > bs) { bs = sc; best = o; } }
      Object.assign(ins, best);
    }
    return ins;
  }
  /* The ladder's x in flight: LADDER.x from the rocket's own x (the pad's x on the pad, so the pad
     is unchanged), and at least LADDER_CLEAR_M upwind of the airframe and, while it draws, the slice. */
  function ladderFollowX() {
    const rx = num(flight.x, 0) - padPose({ xref: num(derived.xref, CG_DEFAULT_M), launchAngle }).x;
    body.localToWorld(v3.c.set(0, NOSE_Y, 0)); body.localToWorld(v3.d.set(0, TAIL_Y, 0));
    let minX = Math.min(v3.c.x, v3.d.x) - BODY_R;
    if (sliceWanted && !plateUp) { slice.corners(sliceCorners); for (const c of sliceCorners) minX = Math.min(minX, c.x); }
    const x = Math.min(rx + LADDER.x, minX - LADDER_CLEAR_M);
    ladderGap = minX - x;
    return x;
  }
  /* The ladder slides to the left of the paths with the pull-back, and back to the rocket after. */
  function updateLadderX(now) {
    const follow = ladderFollowX();
    const want = plateUp && Number.isFinite(plateLadderX) ? 1 : 0;
    if (want) plateLadderLast = plateLadderX;
    if (!ladderMixTween || ladderMixTween.to !== want) {
      const dur = reduced || tier === 0 || !frames ? 0 : (want ? PLATE_MS : TRANSITION_MS);
      ladderMixTween = { from: ladderMix, to: want, t0: now, dur };
    }
    const tw = ladderMixTween;
    const k = tw.dur > 0 ? easeSite((now - tw.t0) / tw.dur) : 1;
    ladderMix = tw.from + (tw.to - tw.from) * k;
    const px = Number.isFinite(plateLadderLast) ? plateLadderLast : follow;
    ladder.position.x = follow + (px - follow) * ladderMix;
    return k < 1;
  }

  /* ---------- draw ---------- */
  function canDraw() { return !destroyed && !contextLost && !document.hidden && onScreen && width > 0 && height > 0; }
  function draw(dt) {
    const t0 = performance.now();
    applyFlight();
    rocket.updateMatrixWorld(true);
    const theta = num(flight.theta, 0), alpha = num(flight.alpha, 0);
    body.localToWorld(ctx.frame.set(0, NOSE_Y - FRAME_FROM_NOSE_M, 0));
    ctx.axis.set(Math.sin(theta), Math.cos(theta), 0);           // body +y, toward the nose (setFraming aims along it)
    ctx.flightDir.set(Math.sin(theta - alpha), Math.cos(theta - alpha), 0);
    ctx.aspect = width / height;
    ctx.theta = theta;                         // the side and quarter presets fit the frame box turned by the pitch
    ctx.width = width; ctx.height = height;
    ctx.plateInsets = plateUp ? (plateInsets = computeInsets()) : null;
    let moving = rig.update(dt, ctx);
    moving = updateLadderX(t0) || moving;
    moving = slice.update() || moving;
    moving = exhaust.update(plumeDt(dt), num(flight.thrust, 0)) || moving;

    const dist = Math.max(0.05, camera.position.distanceTo(ctx.frame));
    mpp = 2 * dist * Math.tan(camera.fov * DEG / 2) / Math.max(1, height);
    const r = Math.max(0.095, GRAB_MIN_PX * mpp);
    grab.scale.set(r, LENGTH_M + 2 * r, r);

    // ground: the log-polar mesh is centred under the camera (fine cells where the
    // eye is, the grid itself is in world coordinates); uniforms: camera, plume glow
    // (only near the ground) and the contact shadow
    ground.position.set(camera.position.x, 0, camera.position.z);
    groundMat.uniforms.uCam.value.copy(camera.position);
    body.localToWorld(v3.a.set(0, TAIL_Y, 0));
    const h = Math.max(0, v3.a.y);
    groundMat.uniforms.uGlow.value.set(v3.a.x, v3.a.z, exhaust.visible ? 0.22 * Math.min(1.3, exhaust.level) * Math.exp(-h / 2.5) : 0, 0.9 + h * 0.4);
    const sh = Math.exp(-num(flight.y, 0) / 4);
    shadow.visible = sh > 0.02;
    shadow.position.x = num(flight.x, 0);
    shadow.scale.setScalar(0.5 + (1 - sh) * 0.6);
    shadowMat.opacity = 0.75 * sh;

    // the CP pair from the flight state when it has one: the static Barrowman CP for the
    // dot, its label and the margin (what the panel prints), and xcpNow for the N arrow
    const fitView = { camera, width, height, labelK: labelK() };
    const wpos = v3.b;
    // the cursor tick sits at the reference station's height; its label prints the altitude above the
    // pad, the panel's ALTITUDE (flight.state.altitude), and the ladder's scale is that altitude too
    const refY = Math.max(0, num(flight.y, 0) + PAD.standM);
    // the ladder's zero is the reference station's height on the pad (flight.state.altitude is measured
    // from there), so its ticks read the same feet as the ALT cursor and the panel's ALTITUDE (height
    // above the pad) and the plate's APOGEE tick sits on its own height on the ladder
    const padY0 = Number.isFinite(flight.altitude) ? num(flight.y, 0) - flight.altitude : padPose({ xref: num(derived.xref, CG_DEFAULT_M), launchAngle }).y;
    ladder.position.y = padY0 + PAD.standM;
    ladderFoot.scale.y = Math.max(1e-3, ladder.position.y - 0.004);
    // on the plate the 3D plates, the slice and the ALT cursor step aside (the ticks carry the figures)
    slice.mesh.visible = sliceWanted && !plateUp;
    cursor.visible = cursorLabel.sprite.visible = markersOn && !plateUp;
    const fAlt = markers.factor('alt');
    cursorMat.opacity = 0.95 * fAlt; cursorLabel.sprite.material.opacity = fAlt;
    cursor.position.y = refY - ladder.position.y;
    cursor.scale.x = Math.max(0.25, Math.min(1, (ladderGap - 0.02) / 0.3));   // the paper line stops short of the slice
    cursorLabel.sprite.position.set(-0.08, refY - ladder.position.y, 0);
    const altM = Number.isFinite(flight.altitude) ? flight.altitude : num(flight.y, 0) - padPose({ xref: num(derived.xref, CG_DEFAULT_M), launchAngle }).y;
    if (t0 - cursorText > 100) { cursorText = t0; cursorLabel.set([[['ALT', 'rgba(255,255,255,0.72)'], [`${(Math.max(0, altM) / FT).toFixed(0)} FT`], [derived.tags?.altitude || derived.tags?.y || 'SIM', 'rgba(255,255,255,0.72)']]]); }
    cursorLabel.sprite.getWorldPosition(wpos);
    // The ladder's labels stay on the upwind side. Where that side has no room for the
    // cursor's ALT label (a phone), the whole ladder hides: an unlabelled hairline and an
    // orange stub would point at nothing, and the panel's ALTITUDE row carries the number.
    ladder.visible = plateUp || fitLabelSide(cursorLabel, wpos, 'left', 6, fitView) === 'left';
    let cursorRect = null;                     // the ALT plate on screen, which the markers' plates keep clear of
    const ladderRects = [];
    if (ladder.visible) {
      // labels closer than LADDER_LABEL_MIN_PX on screen (the plate on a phone) thin to every 200 ft, then 500 ft
      const pxPer100 = (LADDER.majorFt * FT) / Math.max(1e-6, mpp);
      const every = pxPer100 >= LADDER_LABEL_MIN_PX ? 100 : pxPer100 * 2 >= LADDER_LABEL_MIN_PX ? 200 : 500;
      // single ladder labels that run off screen hide rather than flip into the rocket's markers
      for (const { lab, f } of ladderLabels) {
        lab.sprite.getWorldPosition(wpos); lab.sprite.visible = f % every === 0 && fitLabelSide(lab, wpos, 'left', 6, fitView) === 'left'; lab.place(pxToScale, 'left', 6);
        if (plateUp && lab.sprite.visible) {
          v3.c.copy(wpos).project(camera);
          const k = labelK(), x = (v3.c.x + 1) / 2 * width, y = (1 - v3.c.y) / 2 * height;
          ladderRects.push({ x0: x - (6 + lab.width) * k, y0: y - lab.height * k / 2, x1: x - 6 * k, y1: y + lab.height * k / 2 });
        }
      }
      cursorLabel.sprite.getWorldPosition(wpos);
      const dy = fitLabelY(cursorLabel, wpos, 'left', 6, fitView);
      cursorLabel.place(pxToScale, 'left', 6, dy);
      v3.c.copy(wpos).project(camera);
      if (v3.c.z < 1 && cursorLabel.sprite.visible) {
        const k = labelK(), x = (v3.c.x + 1) / 2 * width, y = (1 - v3.c.y) / 2 * height + dy * k;
        cursorRect = { x0: x - (6 + cursorLabel.width) * k, y0: y - cursorLabel.height * k / 2, x1: x - 6 * k, y1: y + cursorLabel.height * k / 2 };
      }
    }
    // on the plate the +X DOWNRANGE label sits at the right end of the ground line under the paths
    // (above the ground line, which would hide its lower half there while the label is depth tested).
    // Where a path runs through it there (a phone, where the label is wider than the paths), it takes
    // the first spot that no path crosses and nothing covers: slid right along the axis clear of the
    // paths, then below the ground line (not depth tested there), then the opposite end, left of the
    // paths; where every spot is crossed, the one crossed least.
    axisPlate = null;
    axisLabel.sprite.material.depthTest = true;
    let axisBelow = false;
    if (plateUp && plateBoxNow) {
      const k = labelK(), w = axisLabel.width * k, h = axisLabel.height * k, g = 4 * k, m = FIT_MARGIN_PX, c = AXIS_CLEAR_PX;
      v3.c.set(plateBoxNow.x1, 0.02, 0).project(camera);
      const gx = (v3.c.x + 1) / 2 * width, gy = (1 - v3.c.y) / 2 * height;
      // centred over the right end of the ground line, moved left as far as it would run off the canvas
      const cx0 = gx - Math.max(0, gx + w / 2 - (width - m));
      const paths = screenPaths([trail, ghostTrail], { camera, width, height });
      const above = [gy - g - h, gy - g], below = [gy + g, gy + g + h];
      const inA = pathsXRange(paths, above[0] - c, above[1] + c), inB = pathsXRange(paths, below[0] - c, below[1] + c);
      const cands = [['end', cx0, above]];
      if (inA) cands.push(['end, clear of the paths', Math.max(cx0, inA.hi + AXIS_GAP_PX + w / 2), above]);
      cands.push(['below', cx0, below]);
      if (inB) cands.push(['below, clear of the paths', Math.max(cx0, inB.hi + AXIS_GAP_PX + w / 2), below]);
      if (inA) cands.push(['opposite end', inA.lo - AXIS_GAP_PX - w / 2, above]);
      if (inB) cands.push(['opposite end, below', inB.lo - AXIS_GAP_PX - w / 2, below]);
      // what else it keeps off: the ladder's labels and upright, the plate's insets, the page's overlays, the ticks
      v3.c.set(ladder.position.x, ladder.position.y, ladder.position.z).project(camera);
      const lx = (v3.c.x + 1) / 2 * width;
      const covers = [...ladderRects, ...(plateInsets ? plateInsets.rects : []), ...overlays(t0)].filter(Boolean);
      const marks = [];
      for (const tr of [trail, ghostTrail]) if (tr.count > 1) for (const tk of tr.ticks) { v3.c.set(tk.x, tk.y, 0).project(camera); marks.push((v3.c.x + 1) / 2 * width, (1 - v3.c.y) / 2 * height); }
      let pick = null;
      for (const [spot, cx, [y0, y1]] of cands) {
        const r = { x0: cx - w / 2, y0, x1: cx + w / 2, y1 };
        let bad = 4 * pathsCrossing(paths, { x0: r.x0 - c, y0: r.y0 - c, x1: r.x1 + c, y1: r.y1 + c });
        if (r.x0 < m - 0.5 || r.x1 > width - m + 0.5 || r.y0 < 0 || r.y1 > height - 2) bad += 100;
        if (y1 <= gy && lx > r.x0 - c && lx < r.x1 + c) bad += 4;
        for (const q of covers) if (Math.min(r.x1, q.x1) - Math.max(r.x0, q.x0) > -c && Math.min(r.y1, q.y1) - Math.max(r.y0, q.y0) > -c) bad += 4;
        for (let i = 0; i < marks.length; i += 2) if (marks[i] > r.x0 - 6 && marks[i] < r.x1 + 6 && marks[i + 1] > r.y0 - 6 && marks[i + 1] < r.y1 + 6) bad += 2;
        if (!pick || bad < pick.bad) pick = { spot, cx, bad, below: y0 > gy };
        if (!bad) break;
      }
      axisBelow = pick.below;
      axisLabel.sprite.position.set(plateBoxNow.x1 + (pick.cx - gx) * mpp, 0.02, 0); axisLabel.place(pxToScale, axisBelow ? 'below' : 'above', 4);
      axisLabel.sprite.material.depthTest = !axisBelow;   // under the ground line the ground would hide it
      axisPlate = { spot: pick.spot, paths };
    }
    else { axisLabel.sprite.position.set(3.0, 0.02, 0); axisLabel.place(pxToScale, 'right', 6); }
    if (plateUp) {
      axisLabel.sprite.getWorldPosition(wpos); v3.c.copy(wpos).project(camera);
      const k = labelK(), x = (v3.c.x + 1) / 2 * width, y = (1 - v3.c.y) / 2 * height, w = axisLabel.width * k, h = axisLabel.height * k;
      const r = axisBelow ? { x0: x - w / 2, y0: y + 4 * k, x1: x + w / 2, y1: y + 4 * k + h } : { x0: x - w / 2, y0: y - 4 * k - h, x1: x + w / 2, y1: y - 4 * k };
      if (v3.c.z < 1) ladderRects.push(r);
      if (axisPlate) axisPlate = { spot: axisPlate.spot, rect: { ...r }, crossed: pathsCrossing(axisPlate.paths, r) };
    }

    // the paths (item 10): resolution, the live end at the rocket, the plate's ticks
    for (const tr of [trail, ghostTrail]) { tr.setResolution(width, height, dpr); tr.setStyle(plateUp ? 'plate' : 'flight'); }
    if (trailLive && trail.count) trail.setHead(num(flight.x, 0), num(flight.y, 0) + PAD.standM, 0); else trail.setHead(NaN, NaN);
    tickRects = plateUp ? layoutTicks([trail, ghostTrail], { camera, width, height, labelK: labelK(), pxToScale, obstacles: [...ladderRects, ...(plateInsets ? plateInsets.rects : []), ...overlays(t0)] }) : [];
    // the rocket as a dot while it is too small to read
    body.localToWorld(v3.c.set(0, NOSE_Y, 0)).project(camera);
    body.localToWorld(v3.d.set(0, TAIL_Y, 0)).project(camera);
    const lenPx = Math.hypot((v3.c.x - v3.d.x) * width / 2, (v3.c.y - v3.d.y) * height / 2);
    rocketDot.visible = built && lenPx < ROCKET_DOT_BELOW_PX;
    if (rocketDot.visible) { rocketDot.position.copy(rocket.position); rocketDot.scale.setScalar(2 * (ROCKET_DOT_PX + 2) / (camera.projectionMatrix.elements[5] * Math.max(1, height))); }

    const xcpStatic = Number.isFinite(flight.xcp) ? flight.xcp : derived.xcp;
    const xcpForce = Number.isFinite(flight.xcpNow) ? flight.xcpNow : derived.xcp;
    // the angle-of-attack arc only face on: the side preset, settled, not on the plate (item 12)
    arcBlocked = !arcWanted ? 'not asked' : plateUp ? 'plate' : rig.mode !== 'side' ? `camera ${rig.mode}` : rig.transitioning ? 'camera moving' : !markersOn ? 'markers off' : '';
    markers.setVisible(markersOn && !plateUp);
    const mMoving = markers.update({
      body, noseY: NOSE_Y, tailY: TAIL_Y, xcg: num(derived.xcg, CG_DEFAULT_M), xcp: xcpStatic, xcpForce, xcpLattice: latticeCp ? derived.xcpLattice : NaN,
      theta, alpha, v: num(flight.v, 0), airspeed: flight.airspeed, thrust: num(flight.thrust, 0), N: flight.N, finScale, tags: derived.tags,
      gust: gustNow, arc: !arcBlocked,
    }, { camera, pxToScale, mpp, now: t0, width, height, labelK: labelK(), slice: slice.mesh.visible ? slice.corners(sliceCorners) : null, reserved: [cursorRect], overlays: overlays(t0), reduced: reduced || tier === 0, res: { width, height, dpr },
      absent: ladder.visible && cursor.visible ? null : ['alt'] });   // no ALT cursor on screen (a phone): a beat about it dims nothing
    arcShown = !!markers.out.shown.arc;
    moving = !!mMoving || moving;
    moving = updateFlickVisual(t0) || moving;

    renderer.setRenderTarget(null);
    renderer.autoClear = true;
    renderer.render(scene, camera);
    info.calls = renderer.info.render.calls; info.triangles = renderer.info.render.triangles;
    info.ms = lastMs = performance.now() - t0;
    frames++; lastDrawAt = performance.now();
    if (built) canvas.dataset.scene = 'ready';
    updateAria(t0);
    return moving;
  }

  function tick(now) {
    raf = 0;
    if (!canDraw()) { lastTick = 0; return; }
    const dt = lastTick ? Math.min(0.1, (now - lastTick) / 1000) : 1 / 60;
    lastTick = now;
    if (performance.now() - lastExternal < Math.max(EXTERNAL_YIELD_MS, EXTERNAL_YIELD_K * extInterval)) {
      if (animating || dirty) raf = requestAnimationFrame(tick);        // someone else draws; keep watching
      return;
    }
    dirty = false;
    animating = draw(dt);
    if (animating || dirty) raf = requestAnimationFrame(tick); else lastTick = 0;
  }
  function invalidate() { dirty = true; if (!raf && canDraw()) raf = requestAnimationFrame(tick); }
  function cancel() { if (raf) { cancelAnimationFrame(raf); raf = 0; } lastTick = 0; }

  function updateAria(now) {
    if (now - lastAria < ARIA_MS) return;
    lastAria = now;
    const ft = Math.max(0, (num(flight.y, 0) - padPose({ xref: num(derived.xref, CG_DEFAULT_M), launchAngle }).y) / FT);
    const camWords = { hero: 'low three-quarter', plate: 'end plate', free: 'free' }[rig.mode] || rig.mode;
    let t;
    if (plateUp) {
      // the end plate: what the two paths say, from their own apogee ticks
      const a = trail.ticks.find((x) => x.key === 'apogee'), g = ghostTrail.count > 1 ? ghostTrail.ticks.find((x) => x.key === 'apogee') : null;
      const one = (tr, tk) => `${tr.name ? tr.name.toLowerCase() : 'this flight'}, apogee ${Number.isFinite(tk && tk.ft) ? Math.round(tk.ft) : '--'} ft SIM`;
      t = `CHARGER field scene, end plate, side view at equal scale: the path flown in this tab from the pad to apogee, ${one(trail, a)}${g ? `, beside the same conditions with ${one(ghostTrail, g)}` : ''}.`;
    } else {
      // the figures carry their tag, as every number on the page does; a value that rounds to zero prints unsigned (never -0.0)
      const d1 = (v) => { const x = v.toFixed(1); return Number(x) === 0 ? Math.abs(Number(x)).toFixed(1) : x; };
      t = `CHARGER field scene, ${camWords} camera. Phase ${flight.phase || 'pad'}, altitude ${ft.toFixed(0)} ft, pitch ${d1(num(flight.theta, 0) / DEG)} deg, angle of attack ${d1(num(flight.alpha, 0) / DEG)} deg, all SIM. Drag the rocket, or focus here and press the left or right arrow key, to flick it.`;
    }
    if (t !== ariaText) { ariaText = t; canvas.setAttribute('aria-label', t); }
  }

  /* ---------- flick ---------- */
  function eventNdc(e) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / Math.max(1, r.width)) * 2 - 1, -((e.clientY - r.top) / Math.max(1, r.height)) * 2 + 1);
    return ndc;
  }
  function hitRocket(e) {
    if (!built) return null;
    raycaster.setFromCamera(eventNdc(e), camera);
    rocket.updateMatrixWorld(true);
    return raycaster.intersectObject(grab, false)[0] || null;
  }
  /* Pitch-rate impulse for a drag d (world, z dropped) at grab point g, CG c:
     dtheta = -(r x d)_z / max(|r|^2, FLICK_MIN_ARM_M^2) with r = g - c (a rotation
     about +z by a positive angle turns +y toward -x, which is negative theta). */
  function flickRate(g, cur, cgw) {
    const rx = g.x - cgw.x, ry = g.y - cgw.y;
    const dx = cur.x - g.x, dy = cur.y - g.y;
    const dth = -(rx * dy - ry * dx) / Math.max(rx * rx + ry * ry, FLICK_MIN_ARM_M * FLICK_MIN_ARM_M);
    return Math.max(-FLICK_MAX, Math.min(FLICK_MAX, FLICK_GAIN * dth));
  }
  /* The drag as it stands now: the grab point and the CG back from body
     coordinates with the current body matrix, the drag plane through the grab
     point facing the current camera, the pointer's ray (its last NDC) cut with it.
     Fills f.grabW, f.cgW, f.curW (world) and returns the pitch-rate impulse. */
  function flickNow(f) {
    rocket.updateMatrixWorld(true);
    body.localToWorld(f.grabW.copy(f.grabL));
    body.localToWorld(f.cgW.copy(f.cgL));
    camera.getWorldDirection(v3.d);
    plane.setFromNormalAndCoplanarPoint(v3.d, f.grabW);
    raycaster.setFromCamera(f.ndc, camera);
    if (raycaster.ray.intersectPlane(plane, v3.a)) f.curW.copy(v3.a);
    return f.moved >= FLICK_DEADZONE_PX ? flickRate(f.grabW, f.curW, f.cgW) : 0;
  }
  function emitFlick(rate) {
    flick.count++; flick.last = rate;
    for (const fn of [...flickFns]) { try { fn(rate); } catch (err) { console.error('[scene] onFlick listener threw', err); } }
  }
  function onPointerDown(e) {
    if (destroyed || contextLost) return;
    if (e.isPrimary) orbitPointers.clear();        // a new primary pointer: no earlier pointer of the gesture is still down
    const f = flick.active;
    if (f) {
      if (e.pointerId === f.id) return;
      // a second finger mid-flick makes it a pinch or an orbit: drop the flick, let this one through
      endFlick({ pointerId: f.id }, false);
      orbitPointers.add(e.pointerId);
      return;
    }
    // OrbitControls already owns a pointer: this one belongs to its gesture (a pinch), even on the rocket
    if (orbitPointers.size || (e.pointerType === 'mouse' && e.button !== 0)) { orbitPointers.add(e.pointerId); return; }
    const hit = hitRocket(e);
    if (!hit) { orbitPointers.add(e.pointerId); return; }
    e.stopImmediatePropagation(); e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
    const grabL = body.worldToLocal(hit.point.clone());
    const cgL = new THREE.Vector3(0, NOSE_Y - num(derived.xcg, CG_DEFAULT_M), 0);
    flick.active = {
      id: e.pointerId, grabL, cgL, ndc: eventNdc(e).clone(), x0: e.clientX, y0: e.clientY, moved: 0,
      grabW: hit.point.clone(), cgW: new THREE.Vector3(), curW: hit.point.clone(),
    };
    flick.preview = 0; flick.fadeT0 = 0; flick.fade = null;
    canvas.dataset.drag = 'flick';
    invalidate();
  }
  function onPointerMove(e) {
    const f = flick.active;
    if (f && e.pointerId === f.id) {
      f.ndc.copy(eventNdc(e));
      f.moved = Math.max(f.moved, Math.hypot(e.clientX - f.x0, e.clientY - f.y0));
      flick.preview = flickNow(f);
      invalidate();
      return;
    }
    if (!f && e.pointerType === 'mouse' && !e.buttons) {
      const over = !!hitRocket(e);
      if ((canvas.dataset.hover === 'rocket') !== over) { if (over) canvas.dataset.hover = 'rocket'; else delete canvas.dataset.hover; }
    }
  }
  function endFlick(e, commit) {
    const f = flick.active;
    if (!f || e.pointerId !== f.id) return;
    try { canvas.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    flick.active = null;
    delete canvas.dataset.drag;
    if (commit && Number.isFinite(e.clientX)) {
      f.ndc.copy(eventNdc(e));
      f.moved = Math.max(f.moved, Math.hypot(e.clientX - f.x0, e.clientY - f.y0));
    }
    const rate = flickNow(f);
    flick.preview = rate;
    flick.fadeT0 = performance.now();
    // the fading vector rides with the rocket: both ends in body coordinates
    flick.fade = { grabL: f.grabL, curL: body.worldToLocal(f.curW.clone()) };
    if (commit && rate !== 0) emitFlick(rate);
    invalidate();
  }
  const onPointerUp = (e) => endFlick(e, true);
  const onPointerCancel = (e) => endFlick(e, false);
  const onDocPointerEnd = (e) => { orbitPointers.delete(e.pointerId); };
  function onKeyDown(e) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    // one flick per press (flight.flick adds every impulse to the pitch rate), and
    // Alt+Arrow (history), Ctrl/Cmd+Arrow stay with the browser
    if (e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    emitFlick((e.key === 'ArrowRight' ? 1 : -1) * FLICK_KEY * (e.shiftKey ? 2 : 1));
  }
  function updateFlickVisual(now) {
    let op = 0.95, moving = !!flick.active, g, c;
    if (flick.active) {
      // re-cast every frame: the camera and the rocket may have moved under a still pointer
      flick.preview = flickNow(flick.active);
      g = flick.active.grabW; c = flick.active.curW;
    } else if (flick.fadeT0 && flick.fade) {
      const k = reduced ? 1 : (now - flick.fadeT0) / FLICK_FADE_MS;
      if (k >= 1) { flick.fadeT0 = 0; flick.fade = null; flickArrow.group.visible = false; flickLabel.sprite.visible = false; return false; }
      op = 0.95 * (1 - k); moving = true;
      g = body.localToWorld(flick.gW.copy(flick.fade.grabL));
      c = body.localToWorld(flick.cW.copy(flick.fade.curL));
    } else { flickArrow.group.visible = false; flickLabel.sprite.visible = false; return false; }
    const shown = flickArrow.set(g, c, mpp);
    flickArrow.material.opacity = op;
    flickLabel.sprite.visible = shown;
    if (shown) {
      flickLabel.set([[['FLICK', 'rgba(255,255,255,0.72)'], [`${signed(flick.preview / DEG, 0)} DEG/S`]]]);
      flickLabel.sprite.position.copy(c);
      flickLabel.sprite.material.opacity = op / 0.95;
      flickLabel.place(pxToScale, c.x >= g.x ? 'right' : 'left', 12);
    }
    return moving;
  }
  canvas.addEventListener('pointerdown', onPointerDown, { capture: true });   // registered before OrbitControls, capture: runs first
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerCancel);
  canvas.addEventListener('lostpointercapture', onPointerCancel);
  const doc = canvas.ownerDocument || document;
  doc.addEventListener('pointerup', onDocPointerEnd, true);       // OrbitControls' pointers may end anywhere
  doc.addEventListener('pointercancel', onDocPointerEnd, true);
  if (keyboard) { if (!canvas.hasAttribute('tabindex')) canvas.tabIndex = 0; canvas.addEventListener('keydown', onKeyDown); }
  if (!canvas.hasAttribute('role')) canvas.setAttribute('role', 'img');

  /* ---------- size, visibility, context ---------- */
  function resize() {
    if (destroyed) return;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const d = pixelRatioFor(tier, w, h);
    if (w === width && h === height && d === dpr) return;
    width = w; height = h; dpr = d;
    renderer.setPixelRatio(dpr);
    renderer.setSize(Math.max(1, w), Math.max(1, h), false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
    invalidate();
  }
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => resize()) : null;
  ro?.observe(canvas);
  /* A devicePixelRatio change at the same CSS size (the window moved to a HiDPI
     screen, the OS scale changed) never reaches the ResizeObserver: a resolution
     query, re-armed at each new ratio, calls resize(), which compares the ratio. */
  let dprMQ = null;
  const onDpr = () => { armDpr(); resize(); };
  function armDpr() {
    dprMQ?.removeEventListener('change', onDpr);
    try { dprMQ = matchMedia(`(resolution: ${devicePixelRatio || 1}dppx)`); dprMQ.addEventListener('change', onDpr); } catch { dprMQ = null; }
  }
  armDpr();
  const io = typeof IntersectionObserver === 'function' ? new IntersectionObserver((list) => {
    onScreen = list[list.length - 1].isIntersecting;
    if (onScreen) invalidate(); else cancel();
  }) : null;
  io?.observe(canvas);
  const onVisibility = () => { if (document.hidden) cancel(); else invalidate(); };
  document.addEventListener('visibilitychange', onVisibility);
  const onLost = (e) => { e.preventDefault(); contextLost = true; cancel(); canvas.dataset.scene = 'context-lost'; };
  const onRestored = () => { contextLost = false; for (const en of entries) if (en.texture) en.texture.needsUpdate = true; writeStaticLabels(); markers.refresh(); trail.refresh(); ghostTrail.refresh(); cursorLabel.invalidate(); cursorText = -1e9; invalidate(); };
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);
  const onReduced = () => {
    reduced = reducedMQ.matches;
    rig.setReducedMotion(reduced); exhaust.setReducedMotion(reduced); slice.setReducedMotion(reduced);
    invalidate();
  };
  reducedMQ.addEventListener('change', onReduced);
  resize();

  /* ---------- the CAD model ---------- */
  const aborter = new AbortController();
  const ready = (async () => {
    try {
      const fontWait = (spec) => (document.fonts?.load ? Promise.race([document.fonts.load(spec).catch(() => {}), new Promise(r => setTimeout(r, 2500))]) : Promise.resolve());
      fontWait('400 11px "IBM Plex Mono"').then(() => { if (!destroyed) { writeStaticLabels(); markers.refresh(); trail.refresh(); ghostTrail.refresh(); invalidate(); } });
      cad = options.cad || geometry?.cad || (geometry?.json && geometry?.buffer ? { json: geometry.json, buffer: geometry.buffer } : null);
      // options.onProgress({received, total}) follows the download (shipping finding C1-3; the page
      // fetches the CAD itself and hands it in, so this is the fallback path)
      if (!cad) cad = await loadGeometry({ signal: aborter.signal, ...(typeof options.onProgress === 'function' ? { onProgress: options.onProgress } : {}) });
      if (destroyed) return false;
      await fontWait('700 32px "Space Grotesk"');      // the livery lettering is painted in Space Grotesk
      if (destroyed) return false;
      const parts = describeParts(cad.json);
      entries = buildScene({ json: cad.json, buffer: cad.buffer, root: cadRoot, parts });
      for (const en of entries) {
        if (en.wire) en.wire.visible = false;                                   // solid look only
        const id = en.part.id;
        if (!en.part.exterior && !KEEP_INTERIOR.includes(id)) en.group.visible = false;   // hidden inside the opaque tube
        if (FIN_IDS.includes(id)) {
          // pivot at the root leading edge: radial position at the body surface, axial at the fin's forward edge
          const [mn, mx] = en.part.raw.bounds;                              // mm
          const cx = (mn[0] + mx[0]) / 2, cz = (mn[2] + mx[2]) / 2;
          const alongX = Math.abs(cx) >= Math.abs(cz);
          const dirS = Math.sign(alongX ? cx : cz) || 1;
          const rIn = (alongX ? Math.min(Math.abs(mn[0]), Math.abs(mx[0])) : Math.min(Math.abs(mn[2]), Math.abs(mx[2]))) * 0.001;
          const pivot = new THREE.Group();
          pivot.name = `fin-pivot-${id}`;
          pivot.position.set(alongX ? dirS * rIn : 0, mx[1] * 0.001, alongX ? 0 : dirS * rIn);
          pivot.userData.alongX = alongX;
          cadRoot.add(pivot);
          pivot.add(en.group);
          en.group.position.sub(pivot.position);
          finPivots.push(pivot);
        }
      }
      applyFinScale();
      if (renderer.compileAsync) await Promise.race([renderer.compileAsync(scene, camera).catch(() => {}), new Promise(r => setTimeout(r, 3000))]);
      if (destroyed) return false;
      built = true;
      invalidate();
      return true;
    } catch (e) {
      if (e?.name === 'AbortError' || destroyed) return false;
      error = e; canvas.dataset.scene = 'error';
      console.error('[scene] CAD model failed to load', e);
      return false;
    }
  })();

  function applyFinScale() {
    for (const p of finPivots) {
      p.visible = finScale > 0;
      const k = Math.max(1e-4, finScale);
      p.scale.set(p.userData.alongX ? k : 1, k, p.userData.alongX ? 1 : k);     // span and chord; thickness unchanged
    }
  }

  /* setTrail / setGhostTrail: flight-frame points to world (y + the pad stand) */
  function applyTrail(tr, points, opts) {
    if (opts.finScale !== undefined) tr.setFins(opts.finScale);
    if (opts.name !== undefined) tr.setName(opts.name);
    if (tr === trail && opts.live !== undefined) trailLive = !!opts.live;
    if (points === null) { tr.clear(); }
    else if (points) {
      const W = [];
      const n = points.length || 0;
      for (let i = 0; i < n; i++) {
        const p = points[i];
        const x = Array.isArray(p) ? p[0] : p && p.x, y = Array.isArray(p) ? p[1] : p && p.y;
        if (Number.isFinite(x) && Number.isFinite(y)) W.push([x, y + PAD.standM, 0]);
      }
      if (opts.append) for (const q of W) tr.push(q[0], q[1], 0);
      else tr.set(W);                                    // more than 4,096 points are thinned evenly
    }
    if (opts.ticks !== undefined) tr.setTicks((opts.ticks || []).filter((t) => t && Number.isFinite(t.x) && Number.isFinite(t.y)).map((t) => ({ ...t, y: t.y + PAD.standM })));
    // a path that changes while the plate is up refits it (the box only; never while the visitor orbits)
    if (plateUp && plateSpec === 'trails' && rig.plate) { const b = resolvePlateBox(); if (b) rig.setPlate(b, null); }
    invalidate();
    return tr.count;
  }

  /* ---------- public API ---------- */
  const api = {
    ready,
    fallback: null,
    renderer,
    camera,
    three: { scene, rocket, body, slice, markers, rig },
    get error() { return error; },
    get cad() { return cad; },
    get tier() { return tier; },
    get finScale() { return finScale; },
    get markers() { return markersOn; },
    get view() { return view; },
    get sliceView() { return slice.view; },
    get cameraPreset() { return rig.mode; },
    get stats() {
      return {
        fallback: null, built, tier, dpr, frames, ms: lastMs, calls: info.calls, triangles: info.triangles,
        loop: raf ? 'running' : 'idle', camera: { mode: rig.mode, preset: rig.preset, distance: rig.distance, fov: camera.fov, transitioning: rig.transitioning, framing: rig.framing },
        flick: { count: flick.count, last: flick.last, preview: flick.preview, dragging: !!flick.active },
        slice: { visible: slice.mesh.visible, view: slice.view, domain: slice.domain, size: slice.size, dissolve: slice.dissolve, dissolveTarget: slice.dissolveTarget },
        plume: { mode: timeScale === 'flight' ? (haveT ? 'flight' : 'wall') : 'set', timeScale: timeScale === 'flight' ? null : timeScale, step: plumeStep, advance: exhaust.advance, clock: exhaust.clock, visible: exhaust.visible, level: exhaust.level },
        trail: { points: trail.count, ghostPoints: ghostTrail.count, style: trail.style, live: trailLive, finScale: trail.finScale, ghostFinScale: ghostTrail.finScale, width: trail.line.width, opacity: trail.line.opacity, ticks: trail.ticks, ghostTicks: ghostTrail.ticks },
        plate: { up: plateUp, camera: rig.mode === 'plate', box: plateBoxNow ? { ...plateBoxNow } : null, insets: plateInsets ? { l: plateInsets.l, r: plateInsets.r, t: plateInsets.t, b: plateInsets.b, hard: plateInsets.hard ? { ...plateInsets.hard } : null } : null, ladderX: ladder.position.x, ticks: tickRects, axis: axisPlate },
        ladder: { x: ladder.position.x, fromRocketM: ladder.position.x - num(flight.x, 0), mix: ladderMix, visible: ladder.visible, cursor: cursor.visible },
        arc: { wanted: arcWanted, shown: arcShown, blocked: arcBlocked }, gust: gustNow ? { ...gustNow } : null, emphasis: markers.emphasis, factors: { ...markers.out.factors },
        labels: { nAt: markers.out.shown.nAt || null, stationsPx: markers.out.stationsPx, rects: Object.fromEntries(Object.entries(markers.out.plates).map(([k, r]) => [k, r ? { x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1 } : null])) },
        rocketDot: rocketDot.visible,
        size: { width, height }, contextLost, reduced, mpp,
      };
    },
    /* state {x, y, theta, alpha, v, airspeed?, thrust, N, phase, t?, refFromNose?,
       altitude?, xcp?, xcpNow?} SI (m, rad, m/s, N): v is the inertial speed, airspeed
       |v_air| (the relative wind the markers print; v stands in when it is absent),
       refFromNose the body station (x, y) refers to, altitude the height above the pad
       (the ladder cursor's number), xcp the static Barrowman CP (the CP dot, its label
       and the margin) and xcpNow the CP at this alpha (where the N arrow acts); derived.xcp
       stands in for either when the state has none (flight.state carries all of these).
       derived {xcp, xcg (m, or a function of t), xref?, xcpLattice, tags?} in metres
       from the nose tip. flight.state and flight.derived can be passed as they are. */
    setFlight(state, d) {
      if (state) for (const k of ['x', 'y', 'theta', 'alpha', 'v', 'airspeed', 'thrust', 'N', 't']) { const v = state[k]; if (Number.isFinite(v)) flight[k] = v; }
      if (state && Number.isFinite(state.t)) haveT = true;
      // optional: altitude above the pad and the CP pair; NaN when the state has none
      if (state) for (const k of ['altitude', 'xcp', 'xcpNow']) flight[k] = Number.isFinite(state[k]) ? state[k] : NaN;
      if (state && typeof state.phase === 'string') flight.phase = state.phase;
      // the body station (x, y) refers to: the flight's fixed liftoff station, never
      // the moving CG (that would slide the airframe along its axis by the CG travel)
      const refNow = state && Number.isFinite(state.refFromNose);
      if (refNow) derived.xref = state.refFromNose;
      if (d) {
        const xcg = typeof d.xcg === 'function' ? d.xcg(flight.t) : d.xcg;
        if (Number.isFinite(xcg)) derived.xcg = xcg;
        if (!refNow) {
          const x0 = typeof d.xcg === 'function' ? d.xcg(0) : d.xcg;
          if (Number.isFinite(d.xref)) derived.xref = d.xref; else if (Number.isFinite(x0)) derived.xref = x0;
        }
        derived.xcp = Number.isFinite(d.xcp) ? d.xcp : derived.xcp;
        if ('xcpLattice' in d) derived.xcpLattice = Number.isFinite(d.xcpLattice) ? d.xcpLattice : NaN;
        if (d.tags) derived.tags = d.tags;
      }
      invalidate();
      for (const fn of [...flightFns]) { try { fn(state || flight); } catch (err) { console.error('[scene] onFlight listener threw', err); } }
    },
    setSliceTexture(tex, domain) { slice.setTexture(tex, domain); sliceWanted = !!tex; invalidate(); },
    setSliceDomain(domain) { slice.setDomain(domain); invalidate(); },
    setSliceView(v) { const ok = slice.setView(v, { animate: tier > 0 }); invalidate(); return ok; },
    setView(name) { view = String(name); slice.setViewName(view); invalidate(); },
    setCamera(name) {
      if (!PRESETS.includes(name)) return false;
      preset = name;
      plateUp = false; plateSpec = null; plateAvoid = null; plateBoxNow = null; plateInsets = null;   // a preset leaves the plate
      if (built || frames) {
        rocket.updateMatrixWorld(true); body.localToWorld(ctx.frame.set(0, NOSE_Y - FRAME_FROM_NOSE_M, 0));
        const th = num(flight.theta, 0); ctx.axis.set(Math.sin(th), Math.cos(th), 0);
      }
      rig.setPreset(name, tier > 0 && frames > 0 ? ctx : null);
      invalidate();
      return true;
    },
    /* Framing of the side, quarter and hero presets (item 12): {k, aimM, elDeg} with k the
       fit distance factor (1 = the preset's own fit, 0.8 a push-in, 1.6 an ease-out), aimM
       the aim point's shift along the body axis in m (positive toward the tail),
       elDeg an elevation override in degrees (null or NaN: the preset's own). Fields left
       out keep their current target; null resets to {k 1, aimM 0, elDeg null}. opts:
       {ms (default 1200), ease 'site' | 'linear', animate}. Instant at tier 0, under
       reduced motion or before the first frame. Returns the new target. */
    setFraming(f, opts = {}) { const r = rig.setFraming(f, { ...opts, animate: opts.animate !== false && tier > 0 && frames > 0 }); invalidate(); return r; },
    get framing() { return rig.framing; },
    /* The slice dissolve (item 12): k in [0, 1] (true is 1): the fade at the domain's two
       ends widens from 2 to 10 percent and the hairline frame fades out; the corner
       ticks stay. Eased over 480 ms unless opts.animate is false, tier 0 or reduced
       motion. Returns the target. */
    setDissolve(k, opts = {}) { const r = slice.setDissolve(k, { animate: opts.animate !== false && tier > 0 }); invalidate(); return r; },
    get dissolve() { return slice.dissolve; },
    /* The plume's clock (item 12): a number k >= 0 (the playback rate, 0 when paused)
       or 'flight' (default; null also selects it) to follow state.t. Returns the mode. */
    setTimeScale(k) {
      if (k === 'flight' || k == null) { if (timeScale !== 'flight') plumeT = NaN; timeScale = 'flight'; }
      else if (Number.isFinite(+k) && +k >= 0) timeScale = +k;
      invalidate();
      return timeScale;
    },
    get timeScale() { return timeScale; },
    /* The flight's path (item 10). points: [{x, y}] or [[x, y]] in the flight frame (m, the
       reference station as flight.history and flight.state give it); null clears. opts: {append
       (add to the end instead of replacing), finScale (paper when finned, livery orange when 0),
       name (the fin words under the APOGEE tick), ticks: [{key: 'railExit' | 'burnout' |
       'apogee', x, y, ft?, tag?}] (flight frame; ft is the apogee's height above the pad), live
       (draw on to the rocket's current position)}. Fields left out keep their value. Up to 4,096
       points (more are thinned). Returns the point count. */
    setTrail(points, opts = {}) { return applyTrail(trail, points, opts); },
    /* The ghost: the same conditions with the other fin choice (item 10), drawn on the plate,
       2 px at 75 percent, its APOGEE tick only. Same arguments as setTrail (live is ignored). */
    setGhostTrail(points, opts = {}) { return applyTrail(ghostTrail, points, { ...opts, live: false }); },
    /* Draw the flight's path on to the rocket (the live end) or stop at its last point. */
    setTrailLive(on) { trailLive = !!on; invalidate(); },
    /* The end plate (item 10): 'trails' (fit the paths and the pad), a world box {x0, y0, x1, y1}
       in m, or null (leave the plate for the preset it came from). opts: {ms (2400), animate,
       avoid: () => [Element | DOMRect] (kept clear, read every frame)}. Called again while the plate
       is up it refits (a ghost that arrives later). Returns true when the plate is up. */
    setPlate(spec, opts = {}) {
      const c = tier > 0 && frames > 0 ? ctx : null;
      if (spec == null) {
        const was = plateUp;
        plateUp = false; plateSpec = null; plateAvoid = null; plateBoxNow = null; plateInsets = null;
        rig.setPlate(null, c);
        if (was) { lastAria = -1e9; invalidate(); }
        return false;
      }
      plateSpec = spec;
      if ('avoid' in opts) plateAvoid = typeof opts.avoid === 'function' ? opts.avoid : Array.isArray(opts.avoid) ? () => opts.avoid : null;
      const b = resolvePlateBox();
      if (!b) return plateUp;
      if (!plateUp) lastAria = -1e9;                 // the canvas label describes the plate on the next draw
      plateUp = true;
      rig.setPlate(b, c, { ms: Number.isFinite(opts.ms) ? opts.ms : PLATE_MS, animate: opts.animate !== false && tier > 0 });
      invalidate();
      return true;
    },
    get plate() { return plateUp ? { box: plateBoxNow ? { ...plateBoxNow } : null, camera: rig.mode === 'plate', insets: plateInsets ? { l: plateInsets.l, r: plateInsets.r, t: plateInsets.t, b: plateInsets.b } : null } : null; },
    /* The gust beat's plate line (item 12): {mph, tag = 'EST'} while a pulse acts, null after. */
    setGust(g) {
      const v = g && Number.isFinite(+g.mph) && +g.mph > 0 ? { mph: +g.mph, tag: g.tag ? String(g.tag) : 'EST' } : null;
      const same = (!v && !gustNow) || (v && gustNow && v.mph === gustNow.mph && v.tag === gustNow.tag);
      gustNow = v;
      if (!same) invalidate();
      return gustNow ? { ...gustNow } : null;
    },
    /* Ask for the angle-of-attack arc (item 12). It draws only face on: the side preset, settled,
       off the plate, markers on, |alpha| at least 0.5 deg with the air meeting the nose. Returns
       whether it is asked for; stats.arc says whether it shows and why not. */
    setAoaArc(on) { const v = !!on; if (v !== arcWanted) { arcWanted = v; invalidate(); } return arcWanted; },
    /* The plates step back (item 7): null, or the names the beat is about (air, alpha, cp, n, cg,
       thrust, alt); the rest dim to 35 percent over 240 ms (instantly under reduced motion). A
       subject not on screen does not count (alt while the ladder has no room, on a phone), and a
       beat with none on screen dims nothing. */
    setEmphasis(list) { const r = markers.setEmphasis(list); invalidate(); return r; },
    get emphasis() { return markers.emphasis; },
    /* The slice's opacity for the page's view fades (0..1). */
    setSliceOpacity(o) { slice.setOpacity(o); invalidate(); },
    /* The page's own overlays on the canvas (the slate, the badges, the end card): fn() returns
       elements or client rects; the 3D plates and the plate's tick labels keep off them. Read at
       most every 250 ms. null removes it. */
    setOverlays(fn) { overlaysFn = typeof fn === 'function' ? fn : Array.isArray(fn) ? () => fn : null; overlaysAt = -1e9; overlayRects = []; invalidate(); },
    /* fn(state) after every setFlight (the director's clock). Returns an unsubscribe. */
    onFlight(fn) { if (typeof fn !== 'function') return () => {}; flightFns.add(fn); return () => flightFns.delete(fn); },
    setMarkers(on) { markersOn = !!on; markers.setVisible(markersOn); invalidate(); },
    /* Draw the lattice's 2D-section CP ring (CP 2D SECTION) or leave it out. */
    setLatticeCp(on) { latticeCp = !!on; invalidate(); },
    get latticeCp() { return latticeCp; },
    setFinScale(k) { finScale = Math.max(0, num(+k, 1)); applyFinScale(); invalidate(); },
    setRail(m, angle) { if (Number.isFinite(m) && m > 0) railLength = m; if (Number.isFinite(angle)) launchAngle = angle; layoutRail(); invalidate(); },
    onFlick(fn) { if (typeof fn !== 'function') return () => {}; flickFns.add(fn); return () => flickFns.delete(fn); },
    /* fn({mode, preset}) whenever the camera mode changes: a preset, or 'free' after the
       visitor orbits or zooms (preset is then the one a click would return to) */
    onCameraMode(fn) { if (typeof fn !== 'function') return () => {}; camModeFns.add(fn); return () => camModeFns.delete(fn); },
    setTier(t) {
      tier = Math.max(0, Math.min(3, t | 0));
      exhaust.setTier(tier);
      if (tier === 0) slice.setReducedMotion(true); else slice.setReducedMotion(reduced);
      rig.setReducedMotion(reduced || tier === 0);
      width = -1; resize();
    },
    resize() { resize(); },
    /* Draw now (dt in seconds of wall time; measured when omitted). While an
       external caller keeps calling render(), the internal loop does not draw. */
    render(dt) {
      if (!canDraw()) return;
      const now = performance.now();
      const gap = now - lastExternal;
      if (gap < 1000) extInterval = extInterval ? 0.7 * extInterval + 0.3 * gap : gap;
      lastExternal = now;
      const step = Number.isFinite(dt) ? Math.max(0, Math.min(0.1, dt)) : (lastDrawAt ? Math.min(0.1, (now - lastDrawAt) / 1000) : 1 / 60);
      dirty = false;
      animating = draw(step);
      if (animating && !raf) raf = requestAnimationFrame(tick);
    },
    /* Sign check for the lab: the lattice inflow (cos alpha, sin alpha) mapped
       through the slice's world matrix against the wind arrow's world direction. */
    checkSign() {
      applyFlight();
      rocket.updateMatrixWorld(true);
      const a = num(flight.alpha, 0);
      const s = slice.gridDirToWorld(Math.cos(a), Math.sin(a), new THREE.Vector3());
      const th = num(flight.theta, 0);
      const w = new THREE.Vector3(-Math.sin(th - a), -Math.cos(th - a), 0);   // v_air direction
      // 'through': the plane is the pitch plane, the two directions must coincide.
      // 'between': the plane is turned 45 deg out of the pitch plane, so its lateral
      // axis projects at cos 45 and the angles cannot match; the test is that the
      // lateral (body +x) and axial (body +y) components agree in sign.
      const bx = new THREE.Vector3(Math.cos(th), -Math.sin(th), 0), by = new THREE.Vector3(Math.sin(th), Math.cos(th), 0);
      const sameSide = Math.sign(Math.round(s.dot(bx) * 1e6)) === Math.sign(Math.round(w.dot(bx) * 1e6)) && Math.sign(s.dot(by)) === Math.sign(w.dot(by));
      const dot = s.dot(w);
      return { view: slice.view, slice: s.toArray(), arrow: w.toArray(), drawnArrow: markers.out.windDir.toArray(), dot, sameSide, pass: slice.view === 'through' ? dot > 0.9999 : sameSide };
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      aborter.abort();
      cancel();
      ro?.disconnect(); io?.disconnect();
      dprMQ?.removeEventListener('change', onDpr); dprMQ = null;
      document.removeEventListener('visibilitychange', onVisibility);
      reducedMQ.removeEventListener('change', onReduced);
      canvas.removeEventListener('pointerdown', onPointerDown, { capture: true });
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerCancel);
      canvas.removeEventListener('lostpointercapture', onPointerCancel);
      doc.removeEventListener('pointerup', onDocPointerEnd, true);
      doc.removeEventListener('pointercancel', onDocPointerEnd, true);
      orbitPointers.clear();
      canvas.removeEventListener('keydown', onKeyDown);
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      flickFns.clear(); camModeFns.clear();
      rig.dispose();
      disposeScene(entries); entries = [];
      slice.dispose(); markers.dispose(); exhaust.dispose(); trail.dispose(); ghostTrail.dispose(); flightFns.clear();
      flickArrow.dispose(); flickLabel.dispose(); axisLabel.dispose();
      for (const { lab } of ladderLabels) lab.dispose();
      cursorLabel.dispose();
      for (const o of disposables) o.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      delete canvas.dataset.drag; delete canvas.dataset.hover;
      canvas.dataset.scene = 'destroyed';
    },
  };
  return api;
}

/* Ground mesh: a fan and rings at geometrically growing radii (0.25 m times 1.22^k,
   out to about 4 km) with 48 segments, about 4.7k triangles. A single 6 km quad
   is cheaper but its clipped triangles lose depth precision near the camera
   (objects standing on the ground were cut off 2 to 3 cm above it in testing). */
function polarGround() {
  const SEG = 48, R0 = 0.25, Q = 1.22, RMAX = 4000;
  const radii = [];
  for (let r = R0; r < RMAX * Q; r *= Q) radii.push(r);
  const pos = [0, 0, 0], idx = [];
  for (const r of radii) for (let j = 0; j < SEG; j++) { const a = j / SEG * Math.PI * 2; pos.push(Math.cos(a) * r, 0, Math.sin(a) * r); }
  for (let j = 0; j < SEG; j++) idx.push(0, 1 + (j + 1) % SEG, 1 + j);
  for (let k = 0; k < radii.length - 1; k++) {
    const a0 = 1 + k * SEG, b0 = 1 + (k + 1) * SEG;
    for (let j = 0; j < SEG; j++) {
      const j1 = (j + 1) % SEG;
      idx.push(a0 + j, a0 + j1, b0 + j, b0 + j, a0 + j1, b0 + j1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/* The rocket's dot on the plate: a livery disc (ROCKET_DOT_PX across at the sprite's scale) in a
   1 px ink ring, so it reads over the paper path and the ground. */
function radialDot() {
  const s = 40, c = document.createElement('canvas'); c.width = c.height = s;
  const g = c.getContext('2d');
  if (g) {
    const r = s / 2;
    g.fillStyle = 'rgba(10,10,10,0.9)'; g.beginPath(); g.arc(r, r, r, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#d63b08'; g.beginPath(); g.arc(r, r, r * 0.6, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
  return t;
}

function radialTexture(inner) {
  const s = 64, c = document.createElement('canvas'); c.width = c.height = s;
  const g = c.getContext('2d');
  if (g) {
    const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grd.addColorStop(0, inner); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, s, s);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
