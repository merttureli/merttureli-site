// Sideslip: the page's one loop. Three axes (rudder -1..1, left brake 0..1, right brake 0..1) take input from
// held keys, touch pads, range inputs, a drag on the model, an optional phone tilt and the sweep; the pose
// follows the input on a short spring (as the centering springs do), and the readouts show what a simulator
// reads, 0 to 1023 per axis. The WebGL view (stage3d.js, with three.js) loads after the first paint.
import { makeSeg, makeBar } from './seg.js';
import { createHall } from './hall.js';
import { createReserve } from './reserve.js';

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const AXES = ['x', 'y', 'z'];
const NAMES = { x: 'rudder', y: 'left brake', z: 'right brake' };

// ---------------------------------------------------------------- readouts
const segs = { x: [], y: [], z: [] }, bars = { x: [], y: [], z: [] };
for (const svg of $$('svg.seg[data-of]')) { const k = svg.dataset.of; if (segs[k]) segs[k].push(makeSeg(svg)); }
for (const el of $$('.bar-m[data-of]')) { const k = el.dataset.of; if (bars[k]) bars[k].push(makeBar(el)); }
const lamps = { diff: $$('[data-lamp="diff"]'), sweep: $$('[data-lamp="sweep"]') };
const keycaps = $$('kbd[data-key]');
const ranges = Object.fromEntries(AXES.map(k => [k, $(`input[data-range="${k}"]`)]));

// raw counts the way the firmware reports them
const count = { x: v => Math.round((v + 1) / 2 * 1023), y: v => Math.round(v * 1023), z: v => Math.round(v * 1023) };
const shown = { x: null, y: null, z: null };
function showAxis(k, v) {
  const c = Math.max(0, Math.min(1023, count[k](v)));
  if (c === shown[k]) return false;
  shown[k] = c;
  for (const s of segs[k]) s(c);
  for (const b of bars[k]) b(v);
  return true;
}
const setLamp = (name, on) => { for (const l of lamps[name]) l.classList.toggle('on', on); };

// ---------------------------------------------------------------- input
const input = { x: 0, y: 0, z: 0 };        // what the feet ask for
const pose = { x: 0, y: 0, z: 0 }, vel = { x: 0, y: 0, z: 0 };  // where the mechanism is
const manual = { x: null, y: null, z: null };  // a value set on a range input (or by tilt) holds until a key or pad takes over
const held = new Set();                     // 'a','d','w','e' from keys and pads
let drag = null;                            // rudder from a drag on the model
let touched = false;                        // any user input yet (stops the idle sweep)

const KEYS = { a: 'a', d: 'd', w: 'w', e: 'e' };
const keyAxis = { a: 'x', d: 'x', w: 'y', e: 'z' };
const isField = el => el && (el.matches('input, textarea, select, [contenteditable=""], [contenteditable="true"]'));
function userInput(axis) {
  touched = true;
  if (sweep.on) stopSweep();
  if (axis) manual[axis] = null;
  announceSoon();
}
addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey || isField(e.target)) return;
  const k = KEYS[e.key && e.key.toLowerCase()];
  if (!k) return;
  e.preventDefault();
  if (e.repeat || held.has(k)) return;
  held.add(k); userInput(keyAxis[k]);
});
addEventListener('keyup', e => { const k = KEYS[e.key && e.key.toLowerCase()]; if (k && held.delete(k)) announceSoon(); });
addEventListener('blur', () => { held.clear(); drag = null; });
document.addEventListener('visibilitychange', () => { if (document.hidden) held.clear(); });

// touch pads: hold to press, let go and the springs return it
const PAD_KEY = { 'x-': 'a', 'x+': 'd', y: 'w', z: 'e' };
const padEls = $$('.pad[data-pad]');
for (const pad of padEls) {
  const k = PAD_KEY[pad.dataset.pad];
  const down = () => { held.add(k); userInput(keyAxis[k]); };
  const up = () => { if (held.delete(k)) announceSoon(); };
  pad.addEventListener('pointerdown', e => { e.preventDefault(); pad.setPointerCapture(e.pointerId); down(); });
  pad.addEventListener('pointerup', up);
  pad.addEventListener('pointercancel', up);
  pad.addEventListener('lostpointercapture', up);
  pad.addEventListener('contextmenu', e => e.preventDefault());
  pad.addEventListener('keydown', e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); down(); } });
  pad.addEventListener('keyup', e => { if (e.key === ' ' || e.key === 'Enter') up(); });
  pad.addEventListener('blur', up);
}

// range inputs: a real labeled control per axis
for (const k of AXES) {
  const r = ranges[k];
  if (!r) continue;
  r.addEventListener('input', () => { userInput(); manual[k] = +r.value / 100; });
}

// center: everything back to rest
$('#center').addEventListener('click', () => { userInput(); for (const k of AXES) manual[k] = null; held.clear(); });

// ---------------------------------------------------------------- sweep
// The sequence the project describes: yaw both ways, each toe brake, then differential braking.
// Keys: [time s, rudder, left brake, right brake]; between keys the pedals ease in and out.
const SWEEP = [
  [0, 0, 0, 0], [.5, 0, 0, 0], [1.3, 1, 0, 0], [1.9, 1, 0, 0], [2.9, -1, 0, 0], [3.5, -1, 0, 0], [4.1, 0, 0, 0],
  [4.5, 0, 0, 0], [5, 0, 1, 0], [5.5, 0, 1, 0], [5.9, 0, 0, 0], [6.1, 0, 0, 0], [6.6, 0, 0, 1], [7.1, 0, 0, 1], [7.5, 0, 0, 0],
  [7.8, 0, 0, 0], [8.4, -.25, 1, .3], [9.1, -.25, 1, .3], [9.7, .25, .3, 1], [10.4, .25, .3, 1], [11, 0, 0, 0], [11.8, 0, 0, 0],
];
const SWEEP_T = SWEEP[SWEEP.length - 1][0];
const inOut = t => (t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
function sweepAt(t, out) {
  t %= SWEEP_T;
  let i = 1; while (i < SWEEP.length - 1 && SWEEP[i][0] < t) i++;
  const a = SWEEP[i - 1], b = SWEEP[i], u = inOut(Math.min(1, Math.max(0, (t - a[0]) / (b[0] - a[0] || 1))));
  out.x = a[1] + (b[1] - a[1]) * u; out.y = a[2] + (b[2] - a[2]) * u; out.z = a[3] + (b[3] - a[3]) * u;
  return out;
}
const sweep = { on: false, t: 0, idle: false };
const sweepBtn = $('#sweep');
function startSweep(idle = false) {
  sweep.on = true; sweep.t = 0; sweep.idle = idle;
  for (const k of AXES) manual[k] = null;
  held.clear();
  sweepBtn.setAttribute('aria-pressed', 'true'); setLamp('sweep', true);
}
function stopSweep() { sweep.on = false; sweepBtn.setAttribute('aria-pressed', 'false'); setLamp('sweep', false); }
sweepBtn.addEventListener('click', () => { touched = true; if (sweep.on) stopSweep(); else startSweep(); });

// ---------------------------------------------------------------- tilt (optional, only after a tap)
const tiltBtn = $('#tilt');
if ('DeviceOrientationEvent' in window && matchMedia('(pointer: coarse)').matches) {
  tiltBtn.hidden = false;
  let on = false;
  const onTilt = e => { if (e.gamma == null) return; manual.x = Math.max(-1, Math.min(1, e.gamma / 30)); };
  tiltBtn.addEventListener('click', async () => {
    if (on) { on = false; removeEventListener('deviceorientation', onTilt); manual.x = null; tiltBtn.setAttribute('aria-pressed', 'false'); return; }
    try { if (typeof DeviceOrientationEvent.requestPermission === 'function' && await DeviceOrientationEvent.requestPermission() !== 'granted') return; } catch (e) { return; }
    on = true; userInput(); addEventListener('deviceorientation', onTilt); tiltBtn.setAttribute('aria-pressed', 'true');
  });
}

// ---------------------------------------------------------------- polite text for screen readers
const live = $('#axes-status');
let announceT = 0;
function announceSoon() { clearTimeout(announceT); announceT = setTimeout(announce, 900); }
function announce() {
  if (sweep.on) return;
  const parts = AXES.map(k => `${NAMES[k]} ${count[k](input[k])}`);
  live.textContent = `${parts.join(', ')}${diffOn(input) ? ', differential braking on' : ''}.`;
}
const diffOn = p => Math.max(p.y, p.z) > .5 && Math.abs(p.y - p.z) > .4;

// ---------------------------------------------------------------- lamp test
let lampTest = REDUCED ? null : { t: 0 };
function runLampTest(dt) {
  lampTest.t += dt;
  const t = lampTest.t;
  if (t < .7) {                       // all segments and bars on
    for (const k of AXES) { for (const s of segs[k]) s('8888'); for (const b of bars[k]) b(k === 'x' ? (t < .35 ? -1 : 1) : 1); shown[k] = null; }
    setLamp('diff', true); setLamp('sweep', true);
    return true;
  }
  setLamp('diff', false); setLamp('sweep', false);
  if (t < 1.25) {                     // count up to rest
    const u = (t - .7) / .55;
    for (const k of AXES) { const rest = count[k](0), c = Math.round(rest * u); for (const s of segs[k]) s(c); for (const b of bars[k]) b(0); shown[k] = null; }
    return true;
  }
  lampTest = null;
  if (!touched) startSweep(true);
  return false;
}

// ---------------------------------------------------------------- the loop
const RAMP = 2.6, RETURN = 6;  // per second
const SPRING = { x: [22, .5], y: [28, .8], z: [28, .8] };  // angular frequency, damping ratio
const tmp = { x: 0, y: 0, z: 0 };
let stage = null, slot = null, needDraw = true, last = performance.now();
const stagePose = { x: NaN, y: NaN, z: NaN };

function step(dt) {
  if (sweep.on) {
    sweep.t += dt;
    if (sweep.idle && REDUCED) stopSweep();
    sweepAt(sweep.t, tmp);
    Object.assign(input, tmp);
  } else {
    const dir = { x: (held.has('d') ? 1 : 0) - (held.has('a') ? 1 : 0), y: held.has('w') ? 1 : 0, z: held.has('e') ? 1 : 0 };
    if (drag) { dir.x = 0; }
    for (const k of AXES) {
      if (k === 'x' && drag) { input.x = drag.v; continue; }
      if (dir[k] !== 0) { input[k] = approach(input[k], dir[k], RAMP * dt); continue; }
      if (manual[k] != null) { input[k] = manual[k]; continue; }
      input[k] = approach(input[k], 0, RETURN * dt);
    }
  }
  for (const k of AXES) {
    if (REDUCED) { pose[k] = input[k]; vel[k] = 0; continue; }
    const [w, z] = SPRING[k];
    vel[k] += (w * w * (input[k] - pose[k]) - 2 * z * w * vel[k]) * dt;
    pose[k] += vel[k] * dt;
  }
  pose.x = Math.max(-1, Math.min(1, pose.x)); pose.y = Math.max(0, Math.min(1, pose.y)); pose.z = Math.max(0, Math.min(1, pose.z));
}
const approach = (v, to, d) => (v < to ? Math.min(to, v + d) : Math.max(to, v - d));

function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  step(dt);
  const testing = lampTest && runLampTest(dt);
  if (!testing) {
    for (const k of AXES) showAxis(k, pose[k]);
    setLamp('diff', diffOn(pose));
  }
  // keycaps light while their key or pad is held
  for (const kc of keycaps) kc.classList.toggle('on', held.has(kc.dataset.key));
  for (const pad of padEls) pad.classList.toggle('on', held.has(PAD_KEY[pad.dataset.pad]));
  // ranges mirror the axis unless one is being set by hand
  for (const k of AXES) {
    const r = ranges[k];
    if (r && manual[k] == null && document.activeElement !== r) { const v = String(Math.round(input[k] * 100)); if (r.value !== v) r.value = v; }
  }
  hall.step(dt);
  if (stage && slot) {
    let moved = false;
    for (const k of AXES) if (Math.abs(stagePose[k] - pose[k]) > 1e-4 || Number.isNaN(stagePose[k])) moved = true;
    if (moved) { stage.pose(pose.x, pose.y, pose.z); Object.assign(stagePose, pose); needDraw = true; }
    if (stage.step(dt)) needDraw = true;
    if (needDraw) { stage.render(); needDraw = false; }
  }
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- instruments and reserve
const hall = createHall({ reduced: REDUCED });
createReserve();

// ---------------------------------------------------------------- the WebGL view (one, shared by hero and test panel)
const slots = $$('.stage[data-slot]');
const ratio = new Map(slots.map(s => [s, 0]));
let view = 'hero';
for (const b of $$('[data-view]')) b.addEventListener('click', () => {
  view = b.dataset.view;
  for (const o of $$('[data-view]')) o.setAttribute('aria-pressed', String(o === b));
  if (stage && slot && slot.dataset.slot === 'try') { stage.setShot(view, REDUCED); needDraw = true; }
});
const shotFor = s => (s.dataset.slot === 'try' ? view : 'hero');

function placeCanvas(canvas) {
  let best = null, r = 0;
  for (const [s, v] of ratio) if (v > r) { r = v; best = s; }
  if (best === slot) return;
  slot = best;
  for (const s of slots) s.classList.toggle('live', s === slot);
  if (!slot) return;
  slot.appendChild(canvas);
  fit();
  stage.setShot(shotFor(slot), true);
  needDraw = true;
}
function fit() {
  if (!stage || !slot) return;
  const r = slot.getBoundingClientRect();
  stage.size(r.width, r.height);
  needDraw = true;
}

async function loadStage() {
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  let mod;
  try {
    mod = await import('./stage3d.js');
    stage = await mod.createStage({ canvas, quality: matchMedia('(max-width: 760px)').matches ? 'low' : 'high' });
  } catch (e) { console.warn('[sideslip] 3D view not available, the still stays', e); stage = null; return; }
  const io = new IntersectionObserver(es => { for (const e of es) ratio.set(e.target, e.isIntersecting ? e.intersectionRatio : 0); placeCanvas(canvas); },
    { threshold: [0, .05, .1, .2, .3, .4, .5, .6, .7, .8, .9, 1] });
  for (const s of slots) io.observe(s);
  new ResizeObserver(() => fit()).observe(document.documentElement);
  for (const s of slots) new ResizeObserver(() => { if (s === slot) fit(); }).observe(s);
  // drag on the model for rudder (sideways only, so the page still scrolls)
  canvas.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    canvas.setPointerCapture(e.pointerId);
    drag = { x0: e.clientX, v: input.x, v0: input.x };
    userInput('x');
  });
  canvas.addEventListener('pointermove', e => { if (drag) drag.v = Math.max(-1, Math.min(1, drag.v0 + (e.clientX - drag.x0) / 140)); });
  const end = () => { if (drag) { drag = null; announceSoon(); } };
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end); canvas.addEventListener('lostpointercapture', end);
  document.documentElement.dataset.stage = 'ready';
}
const later = f => ('requestIdleCallback' in window ? requestIdleCallback(f, { timeout: 1200 }) : setTimeout(f, 300));
if (document.readyState === 'complete') later(loadStage); else addEventListener('load', () => later(loadStage), { once: true });

// test hooks for the review scripts (no effect on the page)
window.__sideslip = { input, pose, held, get sweep() { return sweep.on; }, startSweep, stopSweep, get stage() { return stage; }, get slot() { return slot && slot.dataset.slot; } };

if (REDUCED) for (const k of AXES) showAxis(k, 0);
requestAnimationFrame(t => { last = t; frame(t); });
