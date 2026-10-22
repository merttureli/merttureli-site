/* timeline-util.js — helpers shared by timeline.js and ladder.js.
   DOM builders for SVG and HTML, a mono text-width estimate, a first-fit
   label stacker (so labels never overlap and nothing is hand placed), and the
   scroll-progress watcher both instruments scrub from.

   The watcher is the only place the two modules touch the bus:
     tier >= 1  redraw on scroll:frame (inside the scroll sampler's rAF)
     tier 0     redraw on scroll:idle only (architecture section 2)
   and only while the element intersects the viewport. Neither module runs a
   loop of its own: there is nothing to animate between scroll samples. */
import { bus } from './core/bus.js';
import { governor } from './core/governor.js';
import { scroll } from './core/scroll.js';

const NS = 'http://www.w3.org/2000/svg';

/* <svg> element builder: svg('line', {x1: 0, ...}, ...children). Null attributes are skipped. */
export function svg(tag, attrs = {}, ...children) {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) { const v = attrs[k]; if (v !== null && v !== undefined) n.setAttribute(k, String(v)); }
  for (const c of children) if (c !== null && c !== undefined) n.append(typeof c === 'string' ? document.createTextNode(c) : c);
  return n;
}
/* HTML element builder: html('button', {class: 'x', 'aria-expanded': 'false'}, ...children). */
export function html(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const k in attrs) { const v = attrs[k]; if (v !== null && v !== undefined) n.setAttribute(k, String(v)); }
  for (const c of children) if (c !== null && c !== undefined) n.append(typeof c === 'string' ? document.createTextNode(c) : c);
  return n;
}

/* Width of a mono label in px. IBM Plex Mono advances 0.6 em per glyph; the
   meta style adds 0.18 em of tracking after every glyph. Used for layout only;
   the real glyphs come from the font. */
export const MONO_EM = 0.6;
export function textWidth(str, size = 10, tracking = 0.18) {
  return str.length * size * (MONO_EM + tracking);
}

/* First-fit stacking of labels along one axis. items: [{ x, w }] sorted by x
   (x is the label's leading edge). Returns the row index per item such that no
   two labels in a row come within `gap` px of each other. Deterministic, so the
   same data always lands in the same rows. */
export function stackLabels(items, gap = 6) {
  const rowEnds = [];
  return items.map(({ x, w }) => {
    let r = 0;
    while (r < rowEnds.length && rowEnds[r] > x - gap) r++;
    rowEnds[r] = x + w;
    return r;
  });
}

/* Progress of a section for a scrubbing instrument, 0..1.
   A pinned section (taller than the viewport) uses scroll.progressOf: 0 when its
   top reaches the viewport top, 1 when its bottom reaches the viewport bottom.
   A shorter section uses enter-to-exit progress: 0 when its top enters at the
   viewport bottom, 1 when its bottom leaves at the viewport top, so the cursor
   still travels the whole axis while the section crosses the screen. */
export function sectionProgress(el) {
  const r = el.getBoundingClientRect();
  const vh = innerHeight || 1;
  if (r.height > vh + 1) return scroll.progressOf(el);
  const p = (vh - r.top) / (vh + r.height);
  return Math.min(1, Math.max(0, p));
}

/* Watches scroll progress for `el` and calls onProgress(p, source) with
   source 'scroll' or 'override'. setOverride(p) pins the progress (the lab's
   slider); setOverride(null) returns to the scroll. onTier(tier) is called on
   every governor tier change, with the current tier at once. */
export function watchProgress(el, onProgress, { onTier } = {}) {
  let tier = governor.tier;
  let override = null;
  let visible = true;
  let destroyed = false;
  let last = -1;

  const push = (force = false) => {
    if (destroyed) return;
    const p = override !== null ? override : sectionProgress(el);
    if (!force && Math.abs(p - last) < 1e-4) return;   // nothing moved: no DOM write
    last = p;
    onProgress(p, override !== null ? 'override' : 'scroll');
  };
  const onFrame = () => { if (visible && override === null && tier >= 1) push(); };
  const onIdle = () => { if (visible && override === null) push(); };
  const offFrame = bus.on('scroll:frame', onFrame);
  const offIdle = bus.on('scroll:idle', onIdle);
  const offTier = governor.subscribe(({ tier: t }) => { tier = t; onTier?.(t); push(true); });

  const io = 'IntersectionObserver' in window
    ? new IntersectionObserver((entries) => { for (const e of entries) { visible = e.isIntersecting; if (visible) push(); } }, { rootMargin: '0px' })
    : null;
  io?.observe(el);

  return {
    get tier() { return tier; },
    get override() { return override; },
    get visible() { return visible; },
    get progress() { return last < 0 ? 0 : last; },
    setOverride(p) { override = p === null || p === undefined ? null : Math.min(1, Math.max(0, +p || 0)); push(true); },
    refresh() { push(true); },
    destroy() { destroyed = true; offFrame(); offIdle(); offTier(); io?.disconnect(); },
  };
}

/* Schedules one layout per animation frame at most; later calls before the
   frame coalesce. cancel() drops a pending frame (used by destroy). */
export function frameCoalescer(fn) {
  let raf = 0;
  return {
    request() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; fn(); }); },
    cancel() { if (raf) cancelAnimationFrame(raf); raf = 0; },
  };
}

export const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
/* 'YYYY-MM' or 'YYYY-MM-DD' → { y, m (1..12), d (1..31 or null) } */
export function parseDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d: d || null };
}
export function daysIn(y, m) { return new Date(y, m, 0).getDate(); }
/* "23 APR 2026" or "APR 2026" */
export function fmtDate(iso) {
  const { y, m, d } = parseDate(iso);
  return `${d ? d + ' ' : ''}${MONTHS[m - 1]} ${y}`;
}
/* decimal hour → "HH:MM" */
export function fmtHour(h) {
  let hh = Math.floor(h), mm = Math.round((h - hh) * 60);
  if (mm === 60) { hh += 1; mm = 0; }
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
export const fmtInt = (n) => Math.round(n).toLocaleString('en-US');
