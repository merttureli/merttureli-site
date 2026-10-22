/* instruments.js — the instrument rail: an altimeter tape with a drum counter
   (scroll depth), a non-linear vertical speed indicator (scroll velocity) and an
   engine-style gauge of frame time with the governor's tier annunciators.

   Every number drawn here is page instrumentation: scroll.state for the first two
   (SRC: SCROLL), governor.stats for the third (SRC: RAF). Nothing is flight data.

   Drawing policy (architecture section 2 and 4):
     tier 3  redraw on every scroll:frame and every governor:stats
     tier 2  at most every 33 ms (30 Hz)
     tier 1  at most every 100 ms (10 Hz)
     tier 0  on scroll:idle, governor:tier, resize and layout change only
   The module runs no free loop: scroll:frame arrives inside the scroll sampler's
   rAF, governor:stats at about 4 Hz, and the only rAF this file requests is the
   240 ms annunciator flash on a real tier change (never at tier 0, never on mount).

   Layouts: 'rail' (fixed right edge, 64 px wide, three stacked instruments; the
   CSS hides it under 860 px), 'strip' (fixed bottom, 56 px tall plus the safe-area
   inset, three side by side) or 'auto' (strip under 860 px, rail above).

   Screen readers: each canvas is role="img" with an aria-label refreshed at most
   once per second; the sr-only figcaption carries the same sentence and is kept
   out of the accessibility tree while the canvas is painted (no double reading),
   then exposed when the canvas is not: no 2D context, or forced colours, where
   instruments.css hides the canvases and shows the text.

   mountInstruments(rail, options) returns { setLayout, setTapeScale, setOverride, refresh, layout, state, destroy }. */
import { bus } from './core/bus.js';
import { governor } from './core/governor.js';
import { scroll } from './core/scroll.js';
import { drawAltimeter, drawVsi, drawEngine, parseRgb, FLASH_MS } from './instruments-draw.js';

const BREAKPOINT = '(max-width: 859.98px)';   // the rail hides under 860 px; auto layout switches to the strip there
const FORCED = '(forced-colors: active)';     // the CSS swaps canvases for the text readouts here
const PEAK_HOLD_MS = 1500;                     // the VSI keeps its peak mark this long after the peak was set
const A11Y_MS = 1000;                          // aria-label and sr-only readout refresh at most once per second
const MIN_GAP_MS = { 3: 0, 2: 33, 1: 100, 0: Infinity };   // minimum ms between draws per tier
const DEFAULT_SCALE = 0.12;                    // tape px per scroll px: 100 px of page = 12 px of tape
const LABEL_MAX = 14;                          // station label characters kept; the painter then fits them to the tape width
const mounted = new WeakMap();                 // rail element -> live api, so mounting twice never leaks the first instance

const labelCache = new WeakMap();
/* Short label for a registered section: data-station, data-label, or its id. */
function stationLabel(el) {
  if (labelCache.has(el)) return labelCache.get(el);
  const raw = (el.dataset.station || el.dataset.label || el.id || '').replace(/^\d+[-/\s]*/, '').replace(/[-_]+/g, ' ').trim().toUpperCase();
  const label = raw.length > LABEL_MAX ? raw.slice(0, LABEL_MAX) : raw;
  labelCache.set(el, label);
  return label;
}
function stationIndex(el, i) {
  const n = el.dataset.index !== undefined ? parseInt(el.dataset.index, 10) : i + 1;
  return String(Number.isFinite(n) ? n : i + 1).padStart(2, '0');
}
const fmt = (n) => Math.round(Number.isFinite(n) ? n : 0).toLocaleString('en-US');

export function mountInstruments(rail, { layout = 'auto', tapeScale = DEFAULT_SCALE } = {}) {
  if (!rail) throw new Error('mountInstruments: rail element required');
  mounted.get(rail)?.destroy();
  rail.classList.add('in-rail');
  rail.replaceChildren();

  /* ---- DOM: one <figure> per instrument, a canvas with role=img, an sr-only readout ---- */
  const defs = [
    { key: 'alt', cls: 'in-alt', name: 'Altimeter', draw: drawAltimeter },
    { key: 'vsi', cls: 'in-vsi', name: 'Vertical speed indicator', draw: drawVsi },
    { key: 'eng', cls: 'in-eng', name: 'Frame time gauge', draw: drawEngine },
  ];
  const inst = {};
  for (const def of defs) {
    const fig = document.createElement('figure');
    fig.className = `in-instrument ${def.cls}`;
    const canvas = document.createElement('canvas');
    canvas.className = 'in-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', def.name);
    const sr = document.createElement('figcaption');
    sr.className = 'sr-only in-sr';
    sr.textContent = def.name;
    fig.append(canvas, sr);
    rail.append(fig);
    let ctx = null;
    try { ctx = canvas.getContext('2d', { alpha: true }); } catch { ctx = null; }
    if (!ctx) fig.dataset.fallback = 'no-2d';   // the CSS shows the readout as text instead of the canvas
    inst[def.key] = { def, fig, canvas, ctx, sr, w: 0, h: 0, dpr: 1, dirty: true };
  }

  /* ---- state ---- */
  let currentLayout = 'rail', mode = layout;
  let scale = clampScale(tapeScale);
  let theme = readTheme();
  let visible = true, hidden = document.hidden;
  let lastDraw = 0, trailing = 0, a11yTimer = 0, lastA11y = -A11Y_MS, peakTimer = 0;   // the first draw writes the readout at once
  let lastPeak = 0, peakAt = 0;
  let flashStart = -1, flashRaf = 0, lastTier = -1;
  let override = null;                           // { vy, vyPeak } from the lab's fake-velocity slider
  let draws = 0, lastDrawMs = 0;
  let dprMq = null, dprWatched = 0;
  let destroyed = false;

  function clampScale(s) { return Math.max(0.03, Math.min(0.5, Number(s) || DEFAULT_SCALE)); }
  function readTheme() {
    const cs = getComputedStyle(rail);
    const v = (name, fallback) => (cs.getPropertyValue(name) || '').trim() || fallback;
    const paper = v('--paper', '#FFFFFF'), livery = v('--livery', '#D63B08');
    return {
      ink: v('--ink-900', '#0A0A0A'), sym: v('--paper-a90', 'rgba(255,255,255,.9)'), mid: v('--paper-a70', 'rgba(255,255,255,.7)'),
      dim: v('--paper-a45', 'rgba(255,255,255,.45)'), faint: v('--paper-a18', 'rgba(255,255,255,.18)'), livery, warn: v('--livery-deep', '#890919'),
      mono: v('--font-mono', '"IBM Plex Mono", ui-monospace, monospace'),
      paperRgb: parseRgb(paper), liveryRgb: parseRgb(livery),
    };
  }

  /* ---- accessibility surface: canvas label while painted, figcaption text otherwise ---- */
  const forced = matchMedia(FORCED);
  function applyA11yMode() {
    for (const k in inst) {
      const it = inst[k];
      if (forced.matches || !it.ctx) { it.sr.removeAttribute('aria-hidden'); it.canvas.setAttribute('aria-hidden', 'true'); }
      else { it.sr.setAttribute('aria-hidden', 'true'); it.canvas.removeAttribute('aria-hidden'); }
    }
  }

  /* ---- sizing ---- */
  function resize() {
    if (destroyed) return;
    const dpr = governor.dpr();
    theme = readTheme();
    const boxes = [];
    for (const k in inst) boxes.push([inst[k], inst[k].fig.clientWidth, inst[k].fig.clientHeight]);   // all layout reads first
    let any = false;
    for (const [it, w, h] of boxes) {                                                                    // then the bitmap writes
      if (w > 0 && h > 0) any = true;
      if (w !== it.w || h !== it.h || dpr !== it.dpr) {
        it.w = w; it.h = h; it.dpr = dpr;
        if (it.ctx) {
          it.canvas.width = Math.max(1, Math.round(w * dpr));
          it.canvas.height = Math.max(1, Math.round(h * dpr));
          it.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
      }
      it.dirty = true;
    }
    visible = any;
    watchDpr();
    draw(performance.now(), true);
  }
  /* A DPR change without a size change (window moved to another screen, browser zoom)
     fires no ResizeObserver, so a media query on the current resolution re-sizes the bitmaps. */
  const onDpr = () => { if (!destroyed) resize(); };
  function watchDpr() {
    const dpr = devicePixelRatio || 1;
    if (dprMq && dprWatched === dpr) return;
    dprMq?.removeEventListener('change', onDpr);
    dprMq = null; dprWatched = dpr;
    try { dprMq = matchMedia(`(resolution: ${dpr}dppx)`); dprMq.addEventListener('change', onDpr); } catch { dprMq = null; }
  }

  /* ---- data assembly ---- */
  function altData(it) {
    const st = scroll.state;
    const cur = scroll.current, nxt = scroll.next();
    const sections = scroll.sections.map((s, i) => ({
      index: stationIndex(s.el, i), label: stationLabel(s.el), top: s.top,
      state: nxt && s.el === nxt.el ? 'next' : cur && s.el === cur.el ? 'current' : s.top < st.y ? 'past' : 'ahead',
    }));
    return { y: st.y, max: st.max, scale, sections, nextTop: nxt ? nxt.top : null, wide: it.w > it.h * 1.3 };
  }
  function vsiData(it, now) {
    const st = scroll.state;
    const vy = override ? override.vy : st.vy;
    const peak = override ? override.vyPeak : lastPeak;
    return { vy, peak, showPeak: override ? true : now - peakAt < PEAK_HOLD_MS, wide: it.w > it.h * 1.3 };
  }
  function engData(it, now) {
    const s = governor.stats;
    const flash = flashStart >= 0 && now - flashStart < FLASH_MS ? (now - flashStart) / FLASH_MS : null;
    return { p50: s.p50Ms || 0, p95: s.p95Ms || 0, tier: governor.tier, ceiling: governor.ceiling, flash, wide: it.w > it.h * 1.3 };
  }

  /* ---- drawing ---- */
  function draw(now, force = false) {
    if (destroyed || hidden || !visible) return;
    const t0 = performance.now();
    for (const k in inst) {
      const it = inst[k];
      if (!it.dirty && !force) continue;
      it.dirty = false;
      if (!it.ctx || it.w === 0 || it.h === 0) continue;
      const data = k === 'alt' ? altData(it) : k === 'vsi' ? vsiData(it, now) : engData(it, now);
      it.def.draw(it.ctx, theme, it.w, it.h, data);
    }
    lastDraw = now; draws++; lastDrawMs = performance.now() - t0;
    scheduleA11y(now);
  }
  /* Throttled draw: tier 0 never draws here (only forced draws), tiers 1 and 2 wait out the gap and trail. */
  function requestDraw(now) {
    const gap = MIN_GAP_MS[governor.tier] ?? 0;
    if (gap === Infinity) return;
    const since = now - lastDraw;
    if (since >= gap) { if (trailing) { clearTimeout(trailing); trailing = 0; } draw(now); return; }
    if (!trailing) trailing = setTimeout(() => { trailing = 0; draw(performance.now()); }, gap - since + 1);
  }

  /* ---- accessibility: aria-label and sr-only text, at most once per second ---- */
  function scheduleA11y(now) {
    const due = lastA11y + A11Y_MS - now;
    if (due <= 0) { if (a11yTimer) { clearTimeout(a11yTimer); a11yTimer = 0; } updateA11y(now); return; }   // a late timer must not double up
    if (!a11yTimer) a11yTimer = setTimeout(() => { a11yTimer = 0; scheduleA11y(performance.now()); }, due);
  }
  function updateA11y(now) {
    if (destroyed) return;
    lastA11y = now;
    const st = scroll.state, nxt = scroll.next(), s = governor.stats;
    const vy = override ? override.vy : st.vy;
    const peak = override ? override.vyPeak : now - peakAt < PEAK_HOLD_MS ? lastPeak : 0;
    const next = nxt ? `, next section ${stationIndex(nxt.el, scroll.sections.findIndex(x => x.el === nxt.el))} ${stationLabel(nxt.el).toLowerCase()} in ${fmt(Math.max(0, nxt.top - st.y))} px` : ', last section';
    setText(inst.alt, `Altimeter: scroll depth ${fmt(st.y)} of ${fmt(st.max)} px${next}. Source: scroll position.`);
    setText(inst.vsi, `Vertical speed: ${fmt(Math.abs(vy))} px per second ${vy > 0 ? 'down the page' : vy < 0 ? 'up the page' : 'at rest'}${Math.abs(peak) >= 1 ? `, peak ${fmt(Math.abs(peak))} in the last 1.5 s` : ''}. Source: scroll velocity.`);
    setText(inst.eng, `Frame time: median ${(s.p50Ms || 0).toFixed(1)} ms, 95th percentile ${(s.p95Ms || 0).toFixed(1)} ms, quality tier ${governor.tier} of ${governor.ceiling}. Source: requestAnimationFrame in this tab.`);
  }
  function setText(it, str) {
    if (it.sr.textContent !== str) { it.sr.textContent = str; it.canvas.setAttribute('aria-label', str); }
  }

  /* ---- bus wiring ---- */
  const onFrame = (st) => {
    const now = performance.now();
    if (Math.abs(st.vyPeak) >= 1 && st.vyPeak !== lastPeak) { lastPeak = st.vyPeak; peakAt = now; }
    inst.alt.dirty = true; inst.vsi.dirty = true;
    requestDraw(now);
  };
  const onIdle = () => {
    const now = performance.now();
    inst.alt.dirty = inst.vsi.dirty = inst.eng.dirty = true;
    if (trailing) { clearTimeout(trailing); trailing = 0; }
    draw(now, true);
    // clear the peak-hold mark when its 1.5 s run out after the scroll stopped
    clearTimeout(peakTimer);
    const left = peakAt + PEAK_HOLD_MS - now;
    if (left > 0 && !override) peakTimer = setTimeout(() => { peakTimer = 0; inst.vsi.dirty = true; if (governor.tier > 0) draw(performance.now()); }, left + 16);
  };
  const onStats = () => { inst.eng.dirty = true; requestDraw(performance.now()); };
  /* governor:tier arrives on every publish (pin, unpin, replay at mount), so the flash is
     keyed to a real change of the effective tier; at tier 0 the annunciator just lights. */
  const onTier = () => {
    if (destroyed) return;
    const tier = governor.tier;
    const changed = lastTier >= 0 && tier !== lastTier;
    lastTier = tier;
    if (changed && tier > 0) { flashStart = performance.now(); if (!flashRaf) flashRaf = requestAnimationFrame(flashTick); }
    else if (tier === 0 || !changed) { flashStart = -1; if (flashRaf) { cancelAnimationFrame(flashRaf); flashRaf = 0; } }
    resize();                                   // the DPR cap follows the tier; resize redraws everything
  };
  function flashTick(now) {
    flashRaf = 0;
    if (destroyed) return;
    inst.eng.dirty = true;
    draw(now, true);
    if (now - flashStart < FLASH_MS) flashRaf = requestAnimationFrame(flashTick);
    else { flashStart = -1; inst.eng.dirty = true; draw(performance.now(), true); }
  }
  const onVisibility = () => { hidden = document.hidden; if (!hidden) { for (const k in inst) inst[k].dirty = true; draw(performance.now(), true); } };
  const mq = matchMedia(BREAKPOINT);
  const onMq = () => { if (mode === 'auto') applyLayout(); };
  const onForced = () => { if (!destroyed) applyA11yMode(); };

  function applyLayout() {
    currentLayout = mode === 'auto' ? (mq.matches ? 'strip' : 'rail') : mode;
    rail.dataset.layout = currentLayout;
    resize();
  }

  const offFrame = bus.on('scroll:frame', onFrame);
  const offIdle = bus.on('scroll:idle', onIdle);
  const offStats = bus.on('governor:stats', onStats);
  const offTier = governor.subscribe(onTier);   // replays the current tier: sizes the canvases and draws once
  document.addEventListener('visibilitychange', onVisibility);
  mq.addEventListener('change', onMq);
  forced.addEventListener('change', onForced);
  const ro = 'ResizeObserver' in window ? new ResizeObserver(() => resize()) : null;
  ro?.observe(rail);
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
    const on = entries.some(e => e.isIntersecting);
    if (on && !visible) { visible = true; for (const k in inst) inst[k].dirty = true; draw(performance.now(), true); }
    else if (!on) visible = false;
  }) : null;
  io?.observe(rail);
  if (document.fonts?.load) {
    document.fonts.load('400 10px "IBM Plex Mono"').then(() => { if (!destroyed) { for (const k in inst) inst[k].dirty = true; draw(performance.now(), true); } }).catch(() => {});
  }

  applyA11yMode();
  scroll.refresh();                             // measures freshly registered sections and emits one scroll:frame, so the first readout is measured
  applyLayout();                                // sizes the canvases and draws once

  const api = {
    setLayout(next) {
      if (!['rail', 'strip', 'auto'].includes(next)) throw new Error(`setLayout: unknown layout "${next}"`);
      mode = next; applyLayout();
    },
    setTapeScale(s) { scale = clampScale(s); inst.alt.dirty = true; draw(performance.now(), true); },
    /* Lab hook: drive the VSI from a slider instead of scroll.state; null returns to the live source.
       The readout follows through the usual once-per-second schedule. */
    setOverride(o) {
      override = o && Number.isFinite(o.vy) ? { vy: o.vy, vyPeak: Number.isFinite(o.vyPeak) ? o.vyPeak : o.vy } : null;
      inst.vsi.dirty = true; draw(performance.now(), true);
    },
    refresh() { scroll.refresh(); resize(); },
    get layout() { return currentLayout; },
    get state() {
      const st = scroll.state, s = governor.stats, nxt = scroll.next();
      return {
        layout: currentLayout, mode, tapeScale: scale, dpr: inst.alt.dpr, visible, hidden, a11y: forced.matches ? 'text' : 'canvas',
        y: st.y, max: st.max, vy: override ? override.vy : st.vy, vyPeak: lastPeak, peakHeld: performance.now() - peakAt < PEAK_HOLD_MS,
        override: !!override, next: nxt ? { id: nxt.id, top: nxt.top, dist: nxt.top - st.y } : null,
        sections: scroll.sections.length, p50Ms: s.p50Ms, p95Ms: s.p95Ms, tier: governor.tier, ceiling: governor.ceiling, pinned: s.pinned,
        draws, lastDrawMs, flashing: flashStart >= 0,
        sizes: Object.fromEntries(Object.entries(inst).map(([k, it]) => [k, `${it.w}x${it.h}`])),
      };
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      offFrame(); offIdle(); offStats(); offTier();
      document.removeEventListener('visibilitychange', onVisibility);
      mq.removeEventListener('change', onMq);
      forced.removeEventListener('change', onForced);
      dprMq?.removeEventListener('change', onDpr); dprMq = null;
      ro?.disconnect(); io?.disconnect();
      cancelAnimationFrame(flashRaf); flashRaf = 0;
      clearTimeout(trailing); clearTimeout(a11yTimer); clearTimeout(peakTimer); trailing = a11yTimer = peakTimer = 0;
      for (const k in inst) { inst[k].canvas.width = inst[k].canvas.height = 1; }   // release the bitmaps
      rail.replaceChildren();
      rail.classList.remove('in-rail');
      delete rail.dataset.layout;
      if (mounted.get(rail) === api) mounted.delete(rail);
    },
  };
  mounted.set(rail, api);
  return api;
}
export default mountInstruments;
