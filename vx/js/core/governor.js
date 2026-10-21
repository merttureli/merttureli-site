/* Adaptive quality governor.
   Measures real frame intervals and assigns a quality tier that every heavy
   module reads before doing work. Tiers:
     3  full      all effects, DPR up to 2
     2  reduced   simulations at half resolution, DPR up to 1.5, fewer particles
     1  minimal   static canvases refreshed on demand only, DPR 1
     0  static    no decorative motion at all (also forced by prefers-reduced-motion)
   The initial tier comes from device heuristics; the governor then only ever
   steps DOWN when the measured p95 frame time overruns the budget for a sustained
   window, and steps back UP (never above the initial tier) after a long quiet
   stretch. Both directions use hysteresis so the page never flickers between tiers.
   Everything it measures is exposed through governor.stats for the telemetry UI. */
import { bus } from './bus.js';

const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const WINDOW = 90;              // frames in the rolling window (about 1.5 s at 60 Hz)
const BUDGET_MS = 1000 / 60;    // one frame at 60 Hz
const DOWN_P95_MS = 34;         // sustained p95 above this (under 30 fps) steps a tier down
const DOWN_HOLD_MS = 2200;      // for at least this long
const UP_P50_MS = 17.5;         // p50 under this
const UP_HOLD_MS = 12000;       // for this long steps a tier back up
const COOLDOWN_MS = 4000;       // minimum time between tier changes

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
let longFrames = 0, totalFrames = 0, startedAt = performance.now();
const stats = { fps: 0, meanMs: 0, p50Ms: 0, p95Ms: 0, maxMs: 0, budget: 0, longFrames: 0, frames: 0, tier, ceiling, pinned: false, uptimeMs: 0, memoryMB: null, dpr: 1 };

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
  tier = next; lastChange = performance.now(); overSince = quietSince = 0;
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
  const dt = now - last; last = now;
  if (dt > 1000) return;                         // tab was hidden or throttled; ignore the gap
  samples[head] = dt; head = (head + 1) % WINDOW; filled = Math.min(WINDOW, filled + 1);
  totalFrames++; if (dt > 50) longFrames++;
  if (totalFrames % 15 === 0) {
    let sum = 0, max = 0; for (let i = 0; i < filled; i++) { sum += samples[i]; if (samples[i] > max) max = samples[i]; }
    stats.meanMs = sum / filled; stats.fps = 1000 / stats.meanMs; stats.p50Ms = percentile(.5); stats.p95Ms = percentile(.95); stats.maxMs = max;
    stats.budget = stats.p50Ms / BUDGET_MS; stats.longFrames = longFrames; stats.frames = totalFrames; stats.uptimeMs = now - startedAt;
    stats.memoryMB = performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null;
    bus.emit('governor:stats', stats);
    if (pinned === null && filled >= WINDOW && now - lastChange > COOLDOWN_MS) {
      if (stats.p95Ms > DOWN_P95_MS) { overSince ||= now; quietSince = 0; if (now - overSince > DOWN_HOLD_MS && tier > 0) setTier(tier - 1, `p95 ${stats.p95Ms.toFixed(1)} ms over ${DOWN_P95_MS} ms for ${(DOWN_HOLD_MS / 1000).toFixed(1)} s`); }
      else if (stats.p50Ms < UP_P50_MS) { quietSince ||= now; overSince = 0; if (now - quietSince > UP_HOLD_MS && tier < ceiling) setTier(tier + 1, `p50 ${stats.p50Ms.toFixed(1)} ms quiet for ${(UP_HOLD_MS / 1000).toFixed(0)} s`); }
      else overSince = quietSince = 0;
    }
  }
}
function start() { if (running) return; running = true; last = 0; raf = requestAnimationFrame(frame); }
function stop() { running = false; cancelAnimationFrame(raf); raf = 0; last = 0; }

export const governor = {
  get tier() { return effectiveTier(); },
  get ceiling() { return ceiling; },
  stats,
  dpr: dprFor,
  /* Modules call governor.allows(minTier) before animating. */
  allows(minTier) { return effectiveTier() >= minTier; },
  pin(t) { pinned = t === null || t === undefined ? null : Math.max(0, Math.min(3, t | 0)); publish(pinned === null ? 'unpinned' : 'pinned by visitor'); },
  subscribe(fn) { return bus.on('governor:tier', fn, { replay: true }); },
  start, stop,
};
document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else start(); });
reduced.addEventListener('change', () => { if (reduced.matches) { pinned = null; setTier(0, 'prefers-reduced-motion'); } });
publish('initial heuristic');
if (!document.hidden) start();
export default governor;
