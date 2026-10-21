/* Scroll sampler shared by the instruments, the stage and the telemetry wall.
   Native scroll stays the source of truth (scrollbar, keyboard, anchors, find in
   page all keep working). While the page is moving a rAF loop samples scrollY,
   derives velocity in px/s through a one-pole low-pass, tracks which registered
   section is current, and emits:
     scroll:frame    { t, y, vy, vyPeak, max, progress, vh, dh, direction, moving }
     scroll:section  { id, el, index, top, height, progress }
   The loop stops on its own about 200 ms after the last scroll event, so an idle
   page costs nothing. */
import { bus } from './bus.js';

const ALPHA = 0.22;        // low-pass weight per frame for velocity, about 150 ms time constant at 60 Hz
const IDLE_MS = 200;       // stop sampling this long after the last scroll event
const PEAK_HOLD_MS = 1500; // the peak-hold value the VSI shows
const MIN_DT = 1;          // ms; samples closer than this count as the same instant and do not advance the velocity filter

const state = { t: 0, y: 0, vy: 0, vyPeak: 0, max: 0, progress: 0, vh: 0, dh: 0, direction: 0, moving: false };
const sections = [];
let raf = 0, lastY = 0, lastT = 0, lastEvent = 0, peakAt = 0, current = null, measured = false;

function measure() {
  state.vh = innerHeight;
  state.dh = document.documentElement.scrollHeight;
  state.max = Math.max(0, state.dh - state.vh);
  for (const s of sections) {
    const r = s.el.getBoundingClientRect();
    s.top = r.top + scrollY;
    s.height = r.height;
  }
  measured = true;
}
function sectionFor(y) {
  const probe = y + state.vh * 0.35;
  let best = null;
  for (const s of sections) if (probe >= s.top && probe < s.top + s.height) { best = s; break; }
  if (!best && sections.length) best = probe < sections[0].top ? sections[0] : sections[sections.length - 1];
  return best;
}
function sample(now) {
  if (!measured) measure();
  const y = scrollY;
  /* The velocity filter only advances across a real timestep. Two samples can share a stamp (refresh()
     called twice in one task, or a rAF stamp that predates the performance.now() of a refresh() just
     before it); dt = 0 would divide 0 / 0 and the filter would hold NaN for good, which also stops
     scroll:idle (the loop waits for vy === 0). A sample inside MIN_DT of the last one re-reads the
     position and leaves the filter's reference point alone. */
  const dt = lastT ? now - lastT : 0;
  if (!lastT || dt >= MIN_DT) {
    const raw = lastT ? (y - lastY) / Math.min(100, dt) * 1000 : 0;
    state.vy = state.vy + ALPHA * (raw - state.vy);
    state.direction = raw > 0 ? 1 : raw < 0 ? -1 : state.direction;
    lastY = y; lastT = now;
  }
  if (!Number.isFinite(state.vy) || Math.abs(state.vy) < 0.5) state.vy = 0;
  if (!Number.isFinite(state.vyPeak)) state.vyPeak = 0;
  if (Math.abs(state.vy) >= Math.abs(state.vyPeak) || now - peakAt > PEAK_HOLD_MS) { state.vyPeak = state.vy; peakAt = now; }
  state.t = now; state.y = y; state.progress = state.max ? Math.min(1, Math.max(0, y / state.max)) : 0;
  bus.emit('scroll:frame', state);
  const s = sectionFor(y);
  if (s && s !== current) { current = s; bus.emit('scroll:section', { id: s.id, el: s.el, index: sections.indexOf(s), top: s.top, height: s.height, progress: progressOf(s.el) }); }
}
function loop(now) {
  sample(now);
  if (now - lastEvent > IDLE_MS && state.vy === 0) { state.moving = false; raf = 0; lastT = 0; bus.emit('scroll:frame', state); bus.emit('scroll:idle', state); return; }
  raf = requestAnimationFrame(loop);
}
function onScroll() {
  lastEvent = performance.now();
  if (!raf) { state.moving = true; raf = requestAnimationFrame(loop); }
}
/* Progress of a pinned section: 0 when its top reaches the viewport top, 1 when its bottom reaches the viewport bottom. */
export function progressOf(el) {
  const r = el.getBoundingClientRect();
  const span = r.height - state.vh;
  if (span <= 0) return r.top <= 0 ? 1 : 0;
  return Math.min(1, Math.max(0, -r.top / span));
}
export const scroll = {
  state,
  progressOf,
  track(el, id = el.id) { const s = { el, id, top: 0, height: 0 }; sections.push(s); sections.sort((a, b) => a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1); measured = false; return () => { const i = sections.indexOf(s); if (i >= 0) sections.splice(i, 1); }; },
  get sections() { return sections.map(s => ({ id: s.id, el: s.el, top: s.top, height: s.height })); },
  get current() { return current ? { id: current.id, el: current.el, index: sections.indexOf(current) } : null; },
  next() { const i = current ? sections.indexOf(current) : -1; return sections[i + 1] ? { id: sections[i + 1].id, el: sections[i + 1].el, top: sections[i + 1].top } : null; },
  refresh() { measure(); sample(performance.now()); },
  to(target, { offset = 0, behavior } = {}) {
    const el = typeof target === 'string' ? document.getElementById(target) || document.querySelector(target) : target;
    if (!el) return false;
    const top = el.getBoundingClientRect().top + scrollY + offset;
    scrollTo({ top, behavior: behavior || (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth') });
    return true;
  },
  destroy() { cancelAnimationFrame(raf); raf = 0; removeEventListener('scroll', onScroll); removeEventListener('resize', onResize); ro?.disconnect(); },
};
let resizeTimer = 0;
function onResize() { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { measure(); sample(performance.now()); }, 120); }
addEventListener('scroll', onScroll, { passive: true });
addEventListener('resize', onResize);
const ro = 'ResizeObserver' in window ? new ResizeObserver(onResize) : null;
ro?.observe(document.documentElement);
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { measure(); sample(performance.now()); }, { once: true });
else queueMicrotask(() => { measure(); sample(performance.now()); });
export default scroll;
