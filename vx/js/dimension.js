/* dimension.js — live dimension lines measured from the DOM.

   A fixed, full-viewport <svg> overlay (supplied by the page, pointer-events none)
   gets one <g> per visible element that carries data-dim. Each group draws the
   element's width above it and its height to its right the way a drawing would:
   extension lines 8 px off the feature and 6 px past the dimension line, filled
   9 × 3 px arrowheads, lettering above the line in 11 px IBM Plex Mono caps at
   0.06 em reading "827 PX / 218.8 MM". Millimetres are CSS px × 25.4 / 96 (the
   CSS reference pixel), and the overlay says so once in a corner.

   Attributes on a target:
     data-dim="DISPLAY HEADING"   label (required; it marks the element)
     data-dim-side="width"        or "height": draw only that side (default both)
     data-dim-basic="88px"        nominal; draws a boxed basic dimension with the
                                  measured value and the deviation beneath. It
                                  applies to the width, or to the height when
                                  side="height". Accepts px or mm; the readout
                                  follows the unit of the nominal.

   Frame discipline: one read phase (getBoundingClientRect for every target,
   those fully outside the viewport skipped, at most `max` live, the rest counted
   as skipped) then one write phase (attributes on existing groups; groups are
   attached or detached as targets enter and leave). It recomputes on
   scroll:frame (inside the scroll sampler's own rAF, so the lines never lag the
   content), on a ResizeObserver covering the document element and every target,
   on window resize and on refresh(). At tier 1 a full recompute happens at most
   every 100 ms while scrolling and at tier 0 only when the scroll comes to rest;
   in between the overlay is translated by the scroll delta (one attribute write,
   no layout read). There is no free-running loop: the only rAF this file ever
   requests is the one that coalesces resize and refresh into the next frame.

   Colour: lines 0.5 px at 60 % ink on paper, 60 % paper where the nearest
   .on-dark (or data-theme="dark") ancestor says the section is dark. Lettering
   is full ink or paper with a halo so it stays legible over photographs.

   Placement: the width goes above the element unless the element sits at the
   very top of the document, then below. The height goes to the right when the
   viewport has room, else to the left, else inside the element along its right
   edge with the extension lines omitted (the drawing-room rule for tight spaces).
   Features narrower than 24 px get their arrowheads outside the extension lines.

   Touch: a 500 ms long-press on any data-dim element dimensions that one element
   for 3 s even while the overlay is disabled. solo(el, ms) does the same from
   code. Decorative motion: a 240 ms extension-line draw when a group appears,
   turned off by prefers-reduced-motion and at tiers 0 and 1 (CSS, no JS branch).

   mountDimensions(svg, options) returns
     { enable, disable, toggle, refresh, solo, setLimit, state, destroy }
   and emits dim:state { enabled, count, skipped, targets, solo }. */
import { bus } from './core/bus.js';
import { governor } from './core/governor.js';
import './core/scroll.js';   // the scroll sampler that emits scroll:frame and scroll:idle

const NS = 'http://www.w3.org/2000/svg';
const GAP = 8;            // px, the extension line starts this far off the feature (the visible gap of a drawing)
const PAST = 6;           // px, the extension line runs this far past the dimension line
const OFFSET = 28;        // px, distance from the feature edge to the dimension line
const ARROW_L = 9;        // px, arrowhead length
const ARROW_W = 3;        // px, arrowhead width at its base
const TEXT_GAP = 4;       // px, from the dimension line to the lettering baseline above it
const FONT_PX = 11;       // px, lettering size
const CHAR_W = FONT_PX * (0.6 + 0.06);   // px per glyph: IBM Plex Mono advance 600/1000 em plus 0.06 em tracking
const CAP_H = FONT_PX * 0.7;             // px, cap height of Plex Mono, seats lettering below a line and inside the box
const BOX_PAD_X = 5;      // px, padding inside the basic-dimension box
const BOX_PAD_Y = 3;
const WORD_GAP = 8;       // px, between the label, the box and the word BASIC
const EDGE = 8;           // px, lettering keeps this far inside the viewport edge
const OUTSIDE_MIN = 2 * ARROW_L + 6;     // px, under this length the arrowheads go outside the extension lines
const OUTSIDE_RUN = ARROW_L + 8;         // px, the dimension line then runs this far past each extension line
const ROOM = OFFSET + 28;                // px, room a side needs outside the feature: the line plus one row of lettering
const CULL = OFFSET + 48;                // px, targets farther than this outside the viewport are not drawn
const MAX_LIVE = 40;                     // live dimensions at most; the rest are counted, not drawn
const LONG_PRESS_MS = 500;
const SOLO_MS = 3000;
const SLOP_PX = 8;                       // px, finger travel that cancels a long-press
const NOTE_INSET = 16;                   // px, the corner note's distance from the bottom-left corner
const MM_PER_PX = 25.4 / 96;             // the CSS reference pixel: 96 per inch
const MIN_GAP_MS = { 3: 0, 2: 0, 1: 100, 0: Infinity };   // per tier: minimum ms between full recomputes while scrolling

/* ---- formatting ---- */
const f = (n) => String(Math.round(n * 100) / 100);                     // short attribute numbers
const snap = (v) => Math.round((v - 0.25) * 2) / 2 + 0.25;              // centres a 0.5 px stroke on one device pixel at DPR 1 and 2
const pad2 = (n) => String(n).padStart(2, '0');
const groupInt = (n) => Math.trunc(Math.abs(n)).toLocaleString('en-US');
function fmt1(v) {                       // "1,120.4", one decimal always
  const s = Math.abs(v).toFixed(1);
  const dot = s.indexOf('.');
  return (v < 0 && s !== '0.0' ? '−' : '') + Number(s.slice(0, dot)).toLocaleString('en-US') + s.slice(dot);
}
function fmtPx(v) {                      // "827" or "827.4": the decimal only when the box is not whole
  const r = Math.round(v * 10) / 10;
  const frac = Math.round((Math.abs(r) % 1) * 10);
  return groupInt(r) + (frac ? '.' + frac : '');
}
const fmtMm = (px) => fmt1(px * MM_PER_PX);
function fmtDev(v) {                     // signed deviation, "+0.4", "−16.0", "0.0"
  const r = Math.round(v * 10) / 10;
  if (r === 0) return '0.0';
  return (r > 0 ? '+' : '−') + fmt1(Math.abs(r));
}
function parseNominal(str) {             // "88px" | "23.3mm" | "88" → { value, unit, text }
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*(px|mm)?\s*$/i.exec(str || '');
  if (!m) return null;
  const unit = (m[2] || 'px').toLowerCase();
  const value = parseFloat(m[1]);
  return { value, unit, text: `${fmtPx(value)} ${unit.toUpperCase()}` };
}
function isDark(el) {                    // the nearest themed ancestor decides the line colour
  const scope = el && el.closest ? el.closest('.on-dark, .on-paper, [data-theme]') : null;
  if (!scope) return false;
  if (scope.classList.contains('on-dark')) return true;
  if (scope.dataset.theme) return scope.dataset.theme === 'dark';
  return false;
}

/* ---- SVG helpers ---- */
function make(tag, cls) { const e = document.createElementNS(NS, tag); if (cls) e.setAttribute('class', cls); return e; }
function setLine(el, x1, y1, x2, y2) { el.setAttribute('x1', f(x1)); el.setAttribute('y1', f(y1)); el.setAttribute('x2', f(x2)); el.setAttribute('y2', f(y2)); }
function setPos(el, x, y) { el.setAttribute('x', f(x)); el.setAttribute('y', f(y)); }
function setText(el, str) { if (el.__t !== str) { el.__t = str; el.textContent = str; } }
/* Filled arrowhead in the side's local frame: tip at (tu, tv), pointing along +u when du is 1, along −u when −1. */
function arrow(tu, tv, du) {
  const bu = tu - du * ARROW_L, h = ARROW_W / 2;
  return `M${f(tu)} ${f(tv)}L${f(bu)} ${f(tv - h)}L${f(bu)} ${f(tv + h)}Z`;
}

export function mountDimensions(svg, { root = document, max = MAX_LIVE, noteInset = NOTE_INSET } = {}) {
  if (!svg || svg.namespaceURI !== NS) throw new Error('mountDimensions: an <svg> overlay is required');
  svg.classList.add('dim-overlay');
  svg.setAttribute('aria-hidden', 'true');
  const layer = make('g', 'dim-root');
  const note = make('text', 'dim-note');
  svg.append(layer, note);

  let enabled = false, limit = Math.max(1, Math.min(MAX_LIVE, max | 0));
  let targets = [];                       // every [data-dim] element in document order, from the last scan
  const records = new Map();              // element → { el, g, w, h, attached, last }
  let attached = new Set();               // records whose <g> is in the overlay right now
  let raf = 0, computedY = 0, lastComputeAt = 0, translated = false;
  let soloEl = null, soloTimer = 0, soloAt = -Infinity, press = null;
  const stats = { count: 0, skipped: 0, reads: 0, passes: 0, lastMs: 0 };
  const active = () => enabled || !!soloEl;

  /* ---- groups ---- */
  function makeSide(rec, key) {
    const g = make('g', `dim-side dim-${key}`);
    const extA = make('line', 'dim-ext'), extB = make('line', 'dim-ext'), line = make('line', 'dim-line');
    for (const l of [extA, extB, line]) l.setAttribute('pathLength', '1');   // lets the CSS draw-in use a normalised dash
    const arrA = make('path', 'dim-arrow'), arrB = make('path', 'dim-arrow');
    const text = make('text', 'dim-text');
    const label = make('tspan', 'dim-label'), value = make('tspan', 'dim-value');
    text.append(label, value);
    g.append(extA, extB, line, arrA, arrB, text);
    const side = { g, extA, extB, line, arrA, arrB, text, label, value, inside: false, basic: null };
    if (rec.basic && rec.basicSide === key) {
      const box = make('rect', 'dim-box');
      const nominal = make('text', 'dim-text dim-nominal');
      const word = make('text', 'dim-text dim-word');
      const meas = make('text', 'dim-text dim-meas');
      text.setAttribute('text-anchor', 'start');
      nominal.setAttribute('text-anchor', 'middle');
      meas.setAttribute('text-anchor', 'middle');
      setText(nominal, rec.basic.text);
      setText(word, 'BASIC');
      g.append(box, nominal, word, meas);
      side.basic = { box, nominal, word, meas };
    } else {
      text.setAttribute('text-anchor', 'middle');
    }
    rec.g.append(g);
    return side;
  }
  function makeRecord(el) {
    const sideAttr = (el.dataset.dimSide || 'both').toLowerCase();
    const basic = parseNominal(el.dataset.dimBasic);
    const rec = {
      el, g: make('g', 'dim-g'), attached: false, last: null,
      label: String(el.dataset.dim || el.tagName).toUpperCase(),
      basic, basicSide: sideAttr === 'height' ? 'h' : 'w',
      labelSide: sideAttr === 'height' ? 'h' : 'w',
      w: null, h: null,
    };
    rec.g.setAttribute('data-for', rec.label);   // not data-dim: the overlay must never measure itself
    if (sideAttr !== 'height') rec.w = makeSide(rec, 'w');
    if (sideAttr !== 'width') rec.h = makeSide(rec, 'h');
    return rec;
  }

  /* Writes one side in its local frame: u runs along the feature from 0 to len,
     v is perpendicular, s says which way (−1 or +1) the dimension sits off the
     feature edge. su / sv snap a local coordinate so the stroke lands on a device
     pixel; uA..uB is the part of the feature currently inside the viewport, which
     is where the lettering is centred. The group transform maps local to screen:
     a translation for the width, a translation plus rotate(−90) for the height,
     so the height reads bottom to top with its lettering on the left of the line
     (above the line, read from the right, as on a drawing). */
  function writeSide(side, p) {
    const { len, s, su, sv, uMin, uMax, inside } = p;
    const uA = Math.max(0, uMin), uB = Math.min(len, uMax);          // the part of the feature inside the viewport
    const lineV = sv(s * OFFSET);
    const outside = len < OUTSIDE_MIN;
    const u0 = su(0), u1 = su(len);
    /* Lettering sits on the visible middle of the feature. When the whole feature is in
       view and the lettering is wider than it, the lettering slides along the line so it
       stays inside the viewport (a narrow margin strip at the screen edge); a feature
       that is only partly in view keeps its lettering on its visible part and lets it
       run off the edge, so adjacent dimensions do not pile up at the viewport edge. */
    const mid = (uA + uB) / 2;
    const whole = uMin <= 0 && uMax >= len;
    const place = (tw) => {
      if (!whole) return mid;
      const lo = uMin + EDGE + tw / 2, hi = uMax - EDGE - tw / 2;
      return lo <= hi ? Math.min(hi, Math.max(lo, mid)) : mid;
    };
    side.g.setAttribute('transform', p.transform);
    if (side.inside !== inside) {
      side.inside = inside;
      side.extA.setAttribute('visibility', inside ? 'hidden' : 'visible');
      side.extB.setAttribute('visibility', inside ? 'hidden' : 'visible');
    }
    if (!inside) {
      setLine(side.extA, u0, s * GAP, u0, lineV + s * PAST);
      setLine(side.extB, u1, s * GAP, u1, lineV + s * PAST);
    }
    const run = outside ? OUTSIDE_RUN : 0;
    setLine(side.line, -run, lineV, len + run, lineV);
    side.arrA.setAttribute('d', arrow(0, lineV, outside ? 1 : -1));
    side.arrB.setAttribute('d', arrow(len, lineV, outside ? -1 : 1));
    if (!side.basic) {
      const cu = place(((p.label ? p.label.length + 2 : 0) + p.value.length) * CHAR_W);
      setPos(side.text, cu, lineV - TEXT_GAP);
      setText(side.label, p.label ? p.label + '  ' : '');
      setText(side.value, p.value);
      return;
    }
    /* basic dimension: LABEL  [NOMINAL]  BASIC above the line, measured and deviation beneath */
    const b = side.basic;
    const labelW = p.label ? p.label.length * CHAR_W : 0;
    const boxW = p.nominalText.length * CHAR_W + 2 * BOX_PAD_X;
    const boxH = FONT_PX + 2 * BOX_PAD_Y;
    const wordW = 5 * CHAR_W;
    const total = (labelW ? labelW + WORD_GAP : 0) + boxW + WORD_GAP + wordW;
    const cu = place(Math.max(total, p.measText.length * CHAR_W));
    const bottom = lineV - TEXT_GAP;
    const base = bottom - (boxH - CAP_H) / 2;      // caps centred in the box
    let x = cu - total / 2;
    setPos(side.text, x, base);
    setText(side.label, p.label);
    setText(side.value, '');
    if (labelW) x += labelW + WORD_GAP;
    const bx = su(x), by = sv(bottom - boxH);
    b.box.setAttribute('x', f(bx)); b.box.setAttribute('y', f(by));
    b.box.setAttribute('width', f(boxW)); b.box.setAttribute('height', f(boxH));
    setPos(b.nominal, x + boxW / 2, base);
    setPos(b.word, x + boxW + WORD_GAP, base);
    setPos(b.meas, cu, lineV + TEXT_GAP + CAP_H);
    setText(b.meas, p.measText);
  }
  function layoutRecord(rec, r, vw, vh, sy, dark) {
    const above = r.top + sy >= ROOM;                       // document space: is there room above the element
    let hPlace = 0;                                          // 1 right, −1 left, 2 inside along the right edge
    if (r.right + ROOM <= vw) hPlace = 1;
    else if (r.left - ROOM >= 0) hPlace = -1;
    else hPlace = 2;
    const L = rec.last;
    if (L && L.l === r.left && L.t === r.top && L.w === r.width && L.h === r.height && L.vw === vw && L.vh === vh && L.above === above && L.hPlace === hPlace && L.dark === dark) return;
    rec.last = { l: r.left, t: r.top, w: r.width, h: r.height, vw, vh, above, hPlace, dark };
    rec.g.toggleAttribute('data-dark', dark);
    if (rec.w) {
      const edgeY = above ? r.top : r.bottom, s = above ? -1 : 1;
      writeSide(rec.w, {
        transform: `translate(${f(r.left)} ${f(edgeY)})`, len: r.width, s, inside: false,
        su: (u) => snap(r.left + u) - r.left, sv: (v) => snap(edgeY + v) - edgeY,
        uMin: -r.left, uMax: vw - r.left,                              // the viewport in local u
        label: rec.labelSide === 'w' ? rec.label : '', ...valuesFor(rec, 'w', r.width),
      });
    }
    if (rec.h) {
      const tx = hPlace === -1 ? r.left : r.right, s = hPlace === 1 ? 1 : -1, ty = r.bottom;
      writeSide(rec.h, {
        transform: `translate(${f(tx)} ${f(ty)}) rotate(-90)`, len: r.height, s, inside: hPlace === 2,
        su: (u) => ty - snap(ty - u), sv: (v) => snap(tx + v) - tx,
        uMin: ty - vh, uMax: ty,                                       // the viewport in local u (u runs up the screen)
        label: rec.labelSide === 'h' ? rec.label : '', ...valuesFor(rec, 'h', r.height),
      });
    }
  }
  function valuesFor(rec, key, px) {
    const out = { value: `${fmtPx(px)} PX / ${fmtMm(px)} MM` };
    if (rec.basic && rec.basicSide === key) {
      const mm = rec.basic.unit === 'mm';
      const measured = mm ? px * MM_PER_PX : px;
      const unit = mm ? 'MM' : 'PX';
      out.nominalText = rec.basic.text;
      out.measText = `${fmt1(measured)} ${unit} MEASURED / ${fmtDev(measured - rec.basic.value)} ${unit} DEV`;
    }
    return out;
  }

  /* ---- the frame: read everything, then write everything ---- */
  function compute(now = performance.now()) {
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    const t0 = performance.now();
    const vw = innerWidth, vh = innerHeight, sy = scrollY;
    const list = soloEl ? [soloEl] : targets;
    const live = [];
    let skipped = 0;
    for (const el of list) {
      const r = el.getBoundingClientRect();
      stats.reads++;
      if (r.width === 0 && r.height === 0) continue;                                            // display: none or detached
      if (r.bottom < -CULL || r.top > vh + CULL || r.right < -CULL || r.left > vw + CULL) continue;   // fully off screen
      if (live.length >= limit) { skipped++; continue; }
      live.push({ el, r, dark: isDark(el) });
    }
    const noteDark = isDark(document.elementFromPoint(noteInset + 4, vh - noteInset - 4));
    // write phase
    if (translated) { layer.removeAttribute('transform'); translated = false; }
    const seen = new Set();
    for (const { el, r, dark } of live) {
      let rec = records.get(el);
      if (!rec) { rec = makeRecord(el); records.set(el, rec); }
      seen.add(rec);
      if (!rec.attached) { layer.append(rec.g); rec.attached = true; }
      layoutRecord(rec, r, vw, vh, sy, dark);
    }
    for (const rec of attached) if (!seen.has(rec)) { rec.g.remove(); rec.attached = false; rec.last = null; }
    attached = seen;
    setPos(note, noteInset, vh - noteInset);
    note.toggleAttribute('data-dark', noteDark);
    setText(note, `DIM / ${pad2(live.length)} LIVE${skipped ? ` / ${pad2(skipped)} SKIPPED` : ''}${soloEl ? ' / HELD' : ''} / CSS PX @ 96 DPI`);
    computedY = sy; lastComputeAt = now;
    stats.passes++; stats.lastMs = performance.now() - t0;
    if (stats.count !== live.length || stats.skipped !== skipped) { stats.count = live.length; stats.skipped = skipped; emitState(); }
  }
  function schedule() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; if (active()) compute(); }); }
  function clearAll() {
    for (const rec of attached) { rec.g.remove(); rec.attached = false; rec.last = null; }
    attached = new Set();
    if (stats.count || stats.skipped) { stats.count = 0; stats.skipped = 0; }
  }
  function scan() {
    targets = [...root.querySelectorAll('[data-dim]')].filter((el) => !svg.contains(el));
    const keep = new Set(targets);
    for (const [el, rec] of records) if (!keep.has(el) && el !== soloEl) { if (rec.attached) { rec.g.remove(); attached.delete(rec); } records.delete(el); }
    if (ro) { ro.disconnect(); ro.observe(document.documentElement); for (const el of targets) ro.observe(el); }
  }
  function emitState() { bus.emit('dim:state', { enabled, count: stats.count, skipped: stats.skipped, targets: targets.length, solo: !!soloEl }); }
  const show = () => { svg.dataset.on = ''; };
  const hide = () => { delete svg.dataset.on; };

  /* ---- scroll: inside the sampler's rAF, so the read and the write land in the same frame ---- */
  function onScrollFrame() {
    if (!active()) return;
    const now = performance.now();
    const gap = MIN_GAP_MS[governor.tier] ?? 0;
    if (now - lastComputeAt >= gap) { compute(now); return; }
    layer.setAttribute('transform', `translate(0 ${f(computedY - scrollY)})`);   // tier 0 / 1 between recomputes: carry the overlay, read nothing
    translated = true;
  }
  function onScrollIdle() { if (active()) compute(); }
  const offFrame = bus.on('scroll:frame', onScrollFrame);
  const offIdle = bus.on('scroll:idle', onScrollIdle);
  const onResize = () => schedule();
  addEventListener('resize', onResize);
  const ro = 'ResizeObserver' in window ? new ResizeObserver(() => schedule()) : null;

  /* ---- touch: long-press dimensions one element for 3 s, enabled or not ---- */
  function solo(el, ms = SOLO_MS) {
    if (!(el instanceof Element)) return;
    clearTimeout(soloTimer);
    soloEl = el; soloAt = performance.now();
    show();
    compute();
    emitState();
    soloTimer = setTimeout(endSolo, ms);
  }
  function endSolo() {
    soloTimer = 0; soloEl = null;
    if (enabled) compute(); else { clearAll(); hide(); }
    emitState();
  }
  function cancelPress() { if (press) { clearTimeout(press.timer); press = null; } }
  function onPointerDown(e) {
    if (e.pointerType === 'mouse' || !e.isPrimary) return;
    const el = e.target instanceof Element ? e.target.closest('[data-dim]') : null;
    if (!el) return;
    cancelPress();
    press = { id: e.pointerId, x: e.clientX, y: e.clientY, timer: setTimeout(() => { press = null; solo(el); }, LONG_PRESS_MS) };
  }
  function onPointerMove(e) { if (press && e.pointerId === press.id && Math.hypot(e.clientX - press.x, e.clientY - press.y) > SLOP_PX) cancelPress(); }
  function onPointerEnd(e) { if (press && e.pointerId === press.id) cancelPress(); }
  function onContextMenu(e) {   // a long-press that just fired should not also open the browser's menu
    if (performance.now() - soloAt < LONG_PRESS_MS + 300 && e.target instanceof Element && e.target.closest('[data-dim]')) e.preventDefault();
  }
  document.addEventListener('pointerdown', onPointerDown, { passive: true });
  document.addEventListener('pointermove', onPointerMove, { passive: true });
  document.addEventListener('pointerup', onPointerEnd, { passive: true });
  document.addEventListener('pointercancel', onPointerEnd, { passive: true });
  document.addEventListener('contextmenu', onContextMenu);

  /* ---- API ---- */
  function enable() { if (enabled) return; enabled = true; scan(); show(); compute(); emitState(); }
  function disable() { if (!enabled) return; enabled = false; if (!soloEl) { clearAll(); hide(); } emitState(); }
  function toggle(force) { const next = force === undefined ? !enabled : !!force; if (next) enable(); else disable(); return enabled; }
  function refresh() { scan(); if (active()) compute(); else emitState(); }
  function setLimit(n) { limit = Math.max(1, Math.min(MAX_LIVE, n | 0)); if (active()) compute(); return limit; }
  function destroy() {
    cancelAnimationFrame(raf); raf = 0;
    clearTimeout(soloTimer); cancelPress();
    offFrame(); offIdle();
    removeEventListener('resize', onResize);
    ro?.disconnect();
    document.removeEventListener('pointerdown', onPointerDown);
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerEnd);
    document.removeEventListener('pointercancel', onPointerEnd);
    document.removeEventListener('contextmenu', onContextMenu);
    clearAll(); records.clear(); targets = []; soloEl = null; enabled = false;
    layer.remove(); note.remove();
    hide(); svg.classList.remove('dim-overlay');
  }
  scan();
  return {
    enable, disable, toggle, refresh, solo, setLimit, destroy,
    get state() {
      return { enabled, count: stats.count, skipped: stats.skipped, targets: targets.length, solo: !!soloEl, limit, reads: stats.reads, passes: stats.passes, lastMs: stats.lastMs, tier: governor.tier, carried: translated };
    },
  };
}
export default mountDimensions;
