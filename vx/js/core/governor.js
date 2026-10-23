/* Adaptive quality governor.
   Measures real frame intervals and assigns a quality tier that every heavy
   module reads before doing work. Tiers as the field study uses them:
     3  lattice 1024 x 320 with 24 steps per frame, DPR up to 2
     2  lattice 768 x 240 with 16 steps per frame, DPR up to 1.5
     1  lattice 512 x 160 with 8 steps per frame, DPR 1
     0  no lattice, static scene (also forced by prefers-reduced-motion)
   The initial tier comes from device heuristics; the governor then only ever
   steps DOWN when the measured p95 frame time overruns the budget for a sustained
   window, and steps back UP (never above the initial tier) after a long quiet
   stretch. Both directions use hysteresis so the page never flickers between tiers:
   no decision in the first STARTUP_GRACE_MS (module start-up, shader compilation and
   asset parsing are not the steady cost), and after a step down from tier t the step
   back up to t waits UP_BACKOFF_MS, doubling each time t fails again (up to
   UP_BACKOFF_MAX_MS). Without the backoff a heavy tier that the quiet tier below it
   cannot measure (the field study's lattice is off at tier 0) is retried every 12 s
   and the page flips between the two (seen under software GL, integrate:b pass).
   Frame intervals: a hidden tab stops the loop and the first frame after it only
   restarts the clock, so that gap is never a sample; any other interval counts,
   clamped to MAX_SAMPLE_MS, so frames slower than a second (software GL) still
   step the tier down.
   Work: a tier is measured by the frames that ran the work it sizes. A module whose
   cost the tier sets (the field study's lattice) calls governor.work(t) on each frame
   it does that work at tier t. Once any module has, a step UP from a tier t >= 1 is
   decided only on frames in which the work ran at t or above: the quiet stretch and
   the window it is judged on (a full one) must consist of such frames, and any frame
   without the work (stage off screen, flow paused, lattice capped below t) restarts
   both. Without this an idle page, drawing 16.7 ms frames with nothing heavy running,
   brought the tier back up as soon as its backoff ran out, so the visitor's return to
   the stage paid a grid swap, a flow reset and a second shed (seen unpinned under
   software GL: 2 -> 1, stage off screen, back to 2 after 30 s, shed again 2.4 s after
   the return). Tier 0 has no work to measure (the lattice is off there), so the step
   from 0 to 1 is the explicit exception: every frame counts, behind the backoff above.
   The step DOWN counts every frame, whatever ran in it. A page that never calls
   work() (the labs without the lattice) adapts on every frame as before.
   The loop runs only while its result can matter: not with a pinned tier, not when
   the ceiling is 0 and not under reduced motion (it stops in pin() and restarts
   when the pin is cleared).
   Everything it measures is exposed through governor.stats for the page's header
   and the lab readouts. */
import { bus } from './bus.js';

const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const WINDOW = 90;              // frames in the rolling window (about 1.5 s at 60 Hz)
const BUDGET_MS = 1000 / 60;    // one frame at 60 Hz
const DOWN_P95_MS = 34;         // sustained p95 above this (under 30 fps) steps a tier down
const DOWN_HOLD_MS = 2200;      // for at least this long
const UP_P50_MS = 17.5;         // p50 under this
const UP_HOLD_MS = 12000;       // for this long steps a tier back up
const COOLDOWN_MS = 4000;       // minimum time between tier changes
const STARTUP_GRACE_MS = 6000;  // no tier change before this much uptime
const UP_BACKOFF_MS = 30000;    // after a step down from tier t, no step back up to t for this long,
const UP_BACKOFF_MAX_MS = 240000; // doubling per repeat failure of t, up to this
const MAX_SAMPLE_MS = 1000;     // a longer interval (a stall, or software GL) counts as this much

function heuristicTier() {
  if (reduced.matches) return 0;
  const nav = navigator;
  let tier = 3;
  if (!webglAvailable()) tier = Math.min(tier, 1);
  if ((nav.hardwareConcurrency || 8) <= 4) tier = Math.min(tier, 2);
  if (nav.deviceMemory && nav.deviceMemory <= 4) tier = Math.min(tier, 2);
  if (nav.connection && (nav.connection.saveData || /2g/.test(nav.connection.effectiveType || ''))) tier = Math.min(tier, 1);
  if (matchMedia('(pointer: coarse)').matches && Math.min(innerWidth, innerHeight) < 500) tier = Math.min(tier, 2);
  return tier;
}
let glProbe = null;
export function webglAvailable() {
  if (glProbe !== null) return glProbe;
  try {
    const c = document.createElement('canvas');
    glProbe = !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { glProbe = false; }
  return glProbe;
}

const samples = new Float32Array(WINDOW);
let head = 0, filled = 0, last = 0, raf = 0, running = false;
let tier = heuristicTier();
const ceiling = tier;             // never adapt above the device heuristic
let pinned = null;                // user override from the UI
let lastChange = 0, overSince = 0, quietSince = 0;
let workSeen = false;             // a module has reported tier-sized work (governor.work)
let workTier = -1;                // highest tier the work ran at since the last frame, -1 for none
let workRun = 0;                  // consecutive frames, up to WINDOW, that ran the work at the current tier
const upBlock = new Map();        // tier -> { until, backoff }: when a step back up to it is allowed again
let longFrames = 0, totalFrames = 0, startedAt = performance.now();
const stats = { fps: 0, meanMs: 0, p50Ms: 0, p95Ms: 0, maxMs: 0, budget: 0, longFrames: 0, frames: 0, tier, ceiling, pinned: false, uptimeMs: 0, memoryMB: null, dpr: 1, working: null };

function percentile(q) {
  const n = filled;
  if (!n) return 0;
  const arr = Array.from(samples.subarray(0, n)).sort((a, b) => a - b);
  return arr[Math.min(n - 1, Math.floor(q * n))];
}
export function dprFor(t = effectiveTier()) {
  const d = devicePixelRatio || 1;
  return t >= 3 ? Math.min(d, 2) : t === 2 ? Math.min(d, 1.5) : 1;
}
export function effectiveTier() { return pinned ?? tier; }

function setTier(next, reason) {
  next = Math.max(0, Math.min(ceiling, next));
  if (next === tier) return;
  tier = next; lastChange = performance.now(); overSince = quietSince = 0; workRun = 0;
  publish(reason);
}
function publish(reason) {
  stats.tier = effectiveTier(); stats.ceiling = ceiling; stats.pinned = pinned !== null; stats.dpr = dprFor();
  document.documentElement.dataset.tier = String(stats.tier);
  bus.emit('governor:tier', { tier: stats.tier, reason, stats });
}

function frame(now) {
  raf = requestAnimationFrame(frame);
  if (!last) { last = now; return; }
  const dt = Math.min(MAX_SAMPLE_MS, now - last); last = now;   // a hidden tab never gets here: stop() and start() reset the clock
  samples[head] = dt; head = (head + 1) % WINDOW; filled = Math.min(WINDOW, filled + 1);
  totalFrames++; if (dt > 50) longFrames++;
  // the work reported since the last frame ran inside this interval (this loop normally runs first
  // in a frame; in the other order only the first and last frames of a working stretch shift by one)
  const worked = workTier >= tier; workTier = -1;
  workRun = worked ? Math.min(WINDOW, workRun + 1) : 0;
  if (workSeen) stats.working = worked;
  if (totalFrames % 15 === 0) {
    let sum = 0, max = 0; for (let i = 0; i < filled; i++) { sum += samples[i]; if (samples[i] > max) max = samples[i]; }
    stats.meanMs = sum / filled; stats.fps = 1000 / stats.meanMs; stats.p50Ms = percentile(.5); stats.p95Ms = percentile(.95); stats.maxMs = max;
    stats.budget = stats.p50Ms / BUDGET_MS; stats.longFrames = longFrames; stats.frames = totalFrames; stats.uptimeMs = now - startedAt;
    stats.memoryMB = performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null;
    bus.emit('governor:stats', stats);
    if (pinned === null && filled >= WINDOW && now - lastChange > COOLDOWN_MS && now - startedAt > STARTUP_GRACE_MS) {
      if (stats.p95Ms > DOWN_P95_MS) {
        overSince ||= now; quietSince = 0;
        if (now - overSince > DOWN_HOLD_MS && tier > 0) {
          const b = upBlock.get(tier), backoff = b ? Math.min(UP_BACKOFF_MAX_MS, b.backoff * 2) : UP_BACKOFF_MS;
          upBlock.set(tier, { until: now + backoff, backoff });
          setTier(tier - 1, `p95 ${stats.p95Ms.toFixed(1)} ms over ${DOWN_P95_MS} ms for ${(DOWN_HOLD_MS / 1000).toFixed(1)} s`);
        }
      }
      // up: judged on frames that ran the work at this tier; tier 0 (no work) and pages without work() on every frame
      else if (stats.p50Ms < UP_P50_MS && (tier === 0 || !workSeen || workRun >= WINDOW)) {
        quietSince ||= now; overSince = 0;
        const b = upBlock.get(tier + 1);
        if (now - quietSince > UP_HOLD_MS && tier < ceiling && !(b && now < b.until)) setTier(tier + 1, `p50 ${stats.p50Ms.toFixed(1)} ms quiet for ${(UP_HOLD_MS / 1000).toFixed(0)} s`);
      }
      else overSince = quietSince = 0;
    }
  }
}
/* the loop runs only while a tier change can still happen */
const canAdapt = () => pinned === null && ceiling > 0 && !reduced.matches;
function start() {
  if (running || !canAdapt() || document.hidden) return;
  running = true; last = 0; head = filled = 0; overSince = quietSince = 0; workRun = 0; workTier = -1;   // samples from before a stop are stale
  raf = requestAnimationFrame(frame);
}
function stop() { running = false; cancelAnimationFrame(raf); raf = 0; last = 0; }

export const governor = {
  get tier() { return effectiveTier(); },
  get ceiling() { return ceiling; },
  stats,
  dpr: dprFor,
  /* Modules call governor.allows(minTier) before animating. */
  allows(minTier) { return effectiveTier() >= minTier; },
  pin(t) {
    pinned = t === null || t === undefined ? null : Math.max(0, Math.min(3, t | 0));
    if (pinned === null) start(); else stop();
    publish(pinned === null ? 'unpinned' : 'pinned by visitor');
  },
  subscribe(fn) { return bus.on('governor:tier', fn, { replay: true }); },
  /* A module whose cost the tier sets calls governor.work(t) on each frame it ran that
     work, with the tier it ran at (see Work in the header). */
  work(t = effectiveTier()) {
    workSeen = true;
    const n = Number(t);
    if (Number.isFinite(n) && n > workTier) workTier = n;
  },
  start, stop,
};
document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else start(); });
reduced.addEventListener('change', () => { if (reduced.matches) { pinned = null; stop(); setTier(0, 'prefers-reduced-motion'); } else start(); });
publish('initial heuristic');
start();
export default governor;
