/* callouts.js — leader-line callouts from the stage's 3D anchors to DOM labels.

   The stage projects every part of CHARGER to canvas pixels after each render
   (stage.project(id) -> {x, y, visible, depth}). This module turns the current
   station's projections into drawing-plate callouts: an anchor dot on the part,
   a leader that leaves the dot at up to 45 degrees and runs horizontally to a
   label rail, and a label in the DOM that stays focusable and readable.

   Layout solver (per rail, every stage:render):
     1. side      anchors at or right of the overlay centre go to the right rail,
                  the rest to the left; a 12 px band of hysteresis around the
                  centre keeps a part from flipping rails while it drifts
     2. sort      by anchor y, then part id
     3. sweep     one pass downwards: each label sits at its anchor's y unless the
                  label above forces it lower (minimum clear gap `spacing`)
     4. relax     one pass upwards: every run of touching labels is shifted up by
                  its mean displacement so the cluster centres on its anchors,
                  never past the label above or the top margin; then the bottom
                  margin is enforced upwards
     5. quantise  applied coordinates are multiples of `quantum` (0.5 px) and a
                  label keeps its previous place while the new solution is less
                  than `hysteresis` (2 px) away, so nothing jitters
   The solver never runs on its own clock: it runs on stage:render, on lock and
   unlock (the open description changes a label's height), on resize, and on
   refresh().

   Leader geometry (right rail shown; the left rail mirrors it):
     dot (ax, ay) -> knee (ax + reach, ly) -> label edge (Rx - labelGap, ly)
     reach = max(elbow, |ly - ay|): a 45 degree diagonal when the label is
     displaced by more than the elbow reach (24 px), flatter inside it, clamped
     so the knee never passes the label.
   An anchor that projects at or beyond its rail's label edge (a fin under the
   right column on a narrow stage) gets no horizontal run: the label is asked to
   sit one elbow above the part and the leader drops from the dot to the label's
   nearer horizontal edge, so the note hugs the part instead of being crossed by
   its own leader.

   Modes: rails on fine pointers at 860 px and wider; on coarse pointers or
   narrower viewports the labels move into the host's sheet root, one station
   at a time, with an eight-dot strip and PREV / NEXT. `mode: 'rail' | 'sheet'`
   forces either (the lab page toggles it).

   Events consumed: stage:render {progress, station}, stage:station {index,
   station}, stage:ready, governor:tier. Events emitted (additions to the shared
   table): callouts:lock {partId, station}, callouts:unlock {partId},
   callouts:station {index, station, source: 'sheet'} when the sheet's own
   controls change the displayed station.

   Returns {lock, unlock, refresh, destroy} plus setMode, setStation and a
   read-only `state` for instruments and the lab readout. */
import { bus } from './core/bus.js';
import { governor } from './core/governor.js';

export const DEFAULTS = {
  spacing: 28,          // px, minimum clear gap between neighbouring labels on one rail
  minGap: 4,            // px, the gap the solver shrinks to when a rail is overfull
  hysteresis: 2,        // px, a label keeps its place until the new solution is further away than this
  quantum: 0.5,         // px, every applied coordinate is a multiple of this
  elbow: 24,            // px, horizontal reach of the leader's elbow from the anchor dot
  dot: 3,               // px, anchor dot radius
  margin: 16,           // px, labels keep this far from the top and bottom of the overlay
  railInset: 24,        // px, distance of the label rails from the overlay's left and right edges
  sideHysteresis: 12,   // px, an anchor must cross the centre line by this much to change rail
  labelGap: 6,          // px, the horizontal run stops this short of the label's edge
  mode: 'auto',         // 'auto' | 'rail' | 'sheet'
  sheetQuery: '(pointer: coarse), (max-width: 859px)',
};

const SVG_NS = 'http://www.w3.org/2000/svg';
const pad2 = (n) => String(n).padStart(2, '0');
const quant = (v, q) => (q > 0 && Number.isFinite(q)) ? Math.round(v / q) * q : v;   // a zero or broken quantum never yields NaN

/* Pure rail solver. `items` carry {want (anchor y), h (label height)} and get
   `y` (label centre) written back. Returns {gap, clusters, maxShift}.
   Exported so the lab and tests can drive it without a DOM. */
export function solveRail(items, { top, bottom, gap, minGap = 4 }) {
  const n = items.length;
  if (!n) return { gap, clusters: 0, maxShift: 0 };
  items.sort((a, b) => a.want - b.want || a.id - b.id);
  // An overfull rail shrinks the gap down to minGap so labels still fit between
  // the margins; past that (more label than rail) the gap goes negative and the
  // labels overlap evenly rather than leave the overlay.
  let sumH = 0;
  for (const it of items) sumH += it.h;
  const fit = n > 1 ? (bottom - top - sumH) / (n - 1) : gap;
  const g = fit >= minGap ? Math.min(gap, fit) : fit;

  // Pass 1: downward sweep. Nothing is ever placed above its anchor here.
  let prevBottom = top - g;
  for (const it of items) {
    it.y = Math.max(it.want, prevBottom + g + it.h / 2);
    prevBottom = it.y + it.h / 2;
  }

  // Pass 2: upward relaxation of each cluster of touching labels.
  let clusters = 0, maxShift = 0;
  const EPS = 0.01;
  for (let a = 0; a < n;) {
    let b = a;
    while (b + 1 < n && items[b + 1].y - items[b + 1].h / 2 - (items[b].y + items[b].h / 2) <= g + EPS) b++;
    let d = 0;
    for (let i = a; i <= b; i++) d += items[i].y - items[i].want;
    d /= b - a + 1;                                                     // mean displacement, >= 0 after the sweep
    const limit = a === 0 ? top : items[a - 1].y + items[a - 1].h / 2 + g;  // the cluster's top may not pass this
    const shift = Math.min(d, items[a].y - items[a].h / 2 - limit);
    if (shift > EPS) {
      for (let i = a; i <= b; i++) items[i].y -= shift;
      clusters++;
      if (shift > maxShift) maxShift = shift;
    }
    a = b + 1;
  }
  // Bottom margin, enforced upwards through whatever it touches.
  let nextTop = bottom + g;
  for (let i = n - 1; i >= 0; i--) {
    const it = items[i];
    const maxY = nextTop - g - it.h / 2;
    if (it.y > maxY) it.y = maxY;
    nextTop = it.y - it.h / 2;
  }
  return { gap: g, clusters, maxShift };
}

export function mountCallouts({ stage, svg, labels, sheet = null, ...overrides }) {
  if (!stage || !svg || !labels) throw new Error('mountCallouts: stage, svg and labels are required');
  const opt = { ...DEFAULTS, ...overrides };
  const items = new Map();          // part id -> item record
  const offs = [];                  // bus unsubscribes
  let station = -1;                 // index of the displayed station, -1 for none
  let stageStation = -1;            // the stage's own current station, mirrored only when it changes
  let lockedId = null;
  let mode = 'rail';                // effective mode
  let W = 0, H = 0, labelW = 220;
  let tier = governor.tier;
  let enterPending = false;         // the next solve adds the draw-on classes
  let reorderPending = false;       // the next solve puts the labels in visual DOM order
  let pending = 0;                  // rAF handle of a coalesced refresh
  let destroyed = false;
  const state = { mode: 'rail', station: -1, stationLabel: '', progress: 0, left: 0, right: 0, shown: 0, held: 0, gap: opt.spacing, clusters: 0, maxShift: 0, solveMs: 0, solves: 0, locked: null, tier };

  svg.classList.add('co-leaders');
  labels.classList.add('co-labels');
  // attributes the module adds are remembered so destroy() can take them away again
  const added = [];
  const ensure = (node, name, value) => { if (!node.hasAttribute(name)) { node.setAttribute(name, value); added.push([node, name]); } };
  ensure(svg, 'aria-hidden', 'true');        // the leaders are decorative; the labels carry every word
  ensure(labels, 'role', 'group');           // a role, or the aria-label below is never announced
  ensure(labels, 'aria-label', 'Part callouts');
  const mq = matchMedia(opt.sheetQuery);

  /* ---------- sheet scaffolding (built once, filled per station) ---------- */
  let sheetUI = null;
  if (sheet) {
    sheet.classList.add('co-sheet');
    ensure(sheet, 'role', 'group');
    ensure(sheet, 'aria-label', 'Part callouts, one station at a time');
    sheet.innerHTML = '';
    const head = el('div', 'co-sheet-head');
    const index = el('span', 'co-sheet-index');
    const name = el('span', 'co-sheet-station');
    const count = el('span', 'co-sheet-count');
    head.append(index, name, count);
    const list = el('div', 'co-sheet-list');
    const nav = el('div', 'co-sheet-nav');
    const prev = el('button', 'co-sheet-btn', { type: 'button', 'data-dir': '-1' });
    prev.textContent = '← Prev';
    const next = el('button', 'co-sheet-btn', { type: 'button', 'data-dir': '1' });
    next.textContent = 'Next →';
    const strip = el('ol', 'co-strip');
    nav.append(prev, strip, next);
    sheet.append(head, list, nav);
    sheetUI = { head, index, name, count, list, nav, prev, next, strip, dots: [] };
    sheet.addEventListener('click', onSheetClick);
    sheet.addEventListener('keydown', onKey);
    sheet.addEventListener('focusin', onFocusIn);
  }

  function el(tag, cls, attrs) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (attrs) for (const k in attrs) node.setAttribute(k, attrs[k]);
    return node;
  }
  function stationAt(i) { return (stage.stations || [])[i] || null; }
  function stationOfPart(id) { return (stage.stations || []).find(s => s.partIds.includes(id)) || null; }
  function stationIndexFrom(detail) {
    if (detail == null) return -1;
    if (typeof detail === 'number') return detail;
    if (typeof detail.index === 'number') return detail.index;
    return -1;
  }

  /* ---------- items: one label, one leader group per drawn part ---------- */
  function build() {
    for (const it of items.values()) { it.el.remove(); it.g.remove(); }
    items.clear();
    for (const part of stage.parts || []) {
      if (part.referenceOnly) continue;
      const st = stationOfPart(part.id);
      const id = part.id;
      const item = { id, part, station: st ? st.index : -1, on: false, shown: false, side: null, inColumn: false, h: 0, bh: 0, cur: NaN, want: 0, y: 0, ax: 0, ay: 0, depth: 0, tf: '', d: '', i: -1 };

      // is-off until a solve places it: an unplaced label must never sit at the overlay's origin
      const wrap = el('div', 'co-item is-off', { 'data-part': id, hidden: '' });
      const btn = el('button', 'co-label', { type: 'button', id: `co-label-${id}`, 'aria-expanded': 'false', 'aria-controls': `co-desc-${id}` });
      const eyebrow = el('span', 'co-eyebrow');
      eyebrow.textContent = `${pad2(id)} / ${part.category || 'Part'}`;
      const name = el('span', 'co-name');
      name.textContent = part.label || `Part ${pad2(id)}`;
      const sub = el('span', 'co-sub');
      sub.textContent = part.subtitle || '';
      btn.append(eyebrow, name, sub);
      const desc = el('div', 'co-desc', { id: `co-desc-${id}`, 'aria-hidden': 'true' });   // exposed to AT only while locked open
      const inner = el('div', 'co-desc-inner');
      const p = el('p', 'co-desc-text');
      p.textContent = part.description || '';
      inner.append(p);
      if (part.role) { const r = el('p', 'co-spec'); r.textContent = `Role / ${part.role}`; inner.append(r); }
      if (part.material) { const m = el('p', 'co-spec'); m.textContent = `Material / ${part.material}`; inner.append(m); }
      desc.append(inner);
      wrap.append(btn, desc);

      const g = document.createElementNS(SVG_NS, 'g');
      g.setAttribute('class', 'co-leader-group');
      g.setAttribute('data-part', id);
      g.style.display = 'none';
      // two strokes on the same geometry: a 3 px ink under-stroke keeps the 1 px paper
      // leader readable where it crosses a white part; pathLength=1 normalises both so
      // the draw-on is one keyframe for every leader
      const under = document.createElementNS(SVG_NS, 'path');
      under.setAttribute('class', 'co-leader-under');
      under.setAttribute('pathLength', '1');
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('class', 'co-leader');
      path.setAttribute('pathLength', '1');
      const dot = document.createElementNS(SVG_NS, 'circle');
      dot.setAttribute('class', 'co-dot');
      dot.setAttribute('r', String(opt.dot));
      g.append(under, path, dot);
      svg.append(g);

      Object.assign(item, { el: wrap, btn, desc, inner, g, under, path, dot });
      items.set(id, item);
    }
    applyMode(true);
  }

  /* ---------- station ---------- */
  function setStation(idx, { animate = true, source = 'stage' } = {}) {
    if (idx === station) return;
    station = idx;
    const st = stationAt(idx);
    const ids = st ? st.partIds : [];
    if (lockedId !== null && !ids.includes(lockedId)) unlock();
    for (const it of items.values()) {
      it.on = ids.includes(it.id);
      it.el.hidden = !it.on;
      markOff(it); it.side = null;        // every item waits for the solve to place it (rails) or sits in flow (sheet)
    }
    if (mode === 'sheet' && sheetUI) {
      // keep the sheet's list in station order, scrolled back to its top
      for (const id of ids) { const it = items.get(id); if (it) { sheetUI.list.append(it.el); it.el.classList.remove('is-off'); } }
      sheetUI.list.scrollTop = 0;
    }
    state.station = idx; state.stationLabel = st ? st.label : '';
    enterPending = animate && tier > 0;
    reorderPending = true;
    measureHeights();
    renderSheet();
    solve();
    if (source !== 'stage') bus.emit('callouts:station', { index: idx, station: st, source });
  }
  function measureHeights() {
    if (mode !== 'rail') return;
    // h is the whole item (the open description included) for the solver; bh is the
    // button alone, so the leader meets the name line even when the item is expanded.
    for (const it of items.values()) if (it.on) { it.bh = it.btn.offsetHeight; it.h = it.bh + (it.id === lockedId ? it.inner.scrollHeight : 0); }
  }
  function measureBox() {
    const r = svg.getBoundingClientRect();
    W = Math.round(r.width); H = Math.round(r.height);
    if (W && H) svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    labelW = parseFloat(getComputedStyle(labels).getPropertyValue('--co-label-w')) || 220;
  }

  /* ---------- the solve: project, split, solve both rails, apply ---------- */
  function solve() {
    if (destroyed) return;
    state.solves++;
    if (mode !== 'rail') { state.left = state.right = state.shown = state.held = state.clusters = state.maxShift = state.solveMs = 0; state.gap = opt.spacing; return; }
    const t0 = performance.now();
    if (!W || !H) measureBox();
    const cx = W / 2;
    const left = [], right = [];
    for (const it of items.values()) {
      if (!it.on) continue;
      const p = stage.project(it.id);
      const vis = !!(p && p.visible && Number.isFinite(p.x) && Number.isFinite(p.y));
      if (!vis) { hide(it); continue; }
      const dx = p.x - cx;
      if (it.side === null) it.side = dx >= 0 ? 'right' : 'left';
      else if (it.side === 'right' ? dx < -opt.sideHysteresis : dx > opt.sideHysteresis) it.side = dx >= 0 ? 'right' : 'left';
      it.ax = p.x; it.ay = p.y; it.depth = p.depth || 0;
      // an anchor at or beyond its rail's label edge gets no horizontal run (see apply): the label is
      // asked to sit one elbow above the part; a 12 px band of hysteresis keeps the choice from flapping
      const room = it.side === 'right' ? (W - opt.railInset - labelW - opt.labelGap) - p.x : p.x - (opt.railInset + labelW + opt.labelGap);
      it.inColumn = room < opt.labelGap + (it.inColumn ? opt.sideHysteresis : 0);
      it.want = it.inColumn ? p.y - opt.elbow - it.bh + it.h / 2 : p.y;
      (it.side === 'left' ? left : right).push(it);
    }
    const bounds = { top: opt.margin, bottom: H - opt.margin, gap: opt.spacing, minGap: opt.minGap };
    const sL = solveRail(left, bounds), sR = solveRail(right, bounds);
    const Lx = opt.railInset + labelW;            // right edge of the left rail's labels
    const Rx = W - opt.railInset - labelW;        // left edge of the right rail's labels
    let held = 0, i = 0;
    for (const rail of [left, right]) for (const it of rail) held += apply(it, Lx, Rx, i++);
    // Once per station the DOM follows the visual order (left rail top to bottom,
    // then the right rail) so Tab walks the callouts the way the eye does.
    if (enterPending || reorderPending) { for (const rail of [left, right]) for (const it of rail) labels.append(it.el); reorderPending = false; }
    enterPending = false;
    state.left = left.length; state.right = right.length; state.shown = i; state.held = held;
    state.gap = Math.min(sL.gap, sR.gap); state.clusters = sL.clusters + sR.clusters; state.maxShift = Math.max(sL.maxShift, sR.maxShift);
    state.solveMs = performance.now() - t0;
  }
  /* Off: not placed. The class keeps an unplaced label invisible (visibility, so it is also out of
     the tab order) and the leader group out of the paint. Idempotent, so it is safe on fresh items. */
  function markOff(it) { it.shown = false; it.cur = NaN; it.el.classList.add('is-off'); it.g.style.display = 'none'; }
  function hide(it) { if (it.shown) markOff(it); }
  function apply(it, Lx, Rx, i) {
    const q = opt.quantum;
    let y = quant(it.y, q), held = 0;
    if (Number.isFinite(it.cur) && Math.abs(y - it.cur) < opt.hysteresis) { y = it.cur; held = 1; } else it.cur = y;
    const ax = quant(it.ax, q), ay = quant(it.ay, q);
    const right = it.side === 'right';
    const x = right ? Rx : Lx - labelW;
    // Every write below is skipped when nothing changed, so a held label costs no style work.
    if (it.el.dataset.side !== it.side) it.el.dataset.side = it.side;
    const tf = `translate3d(${x}px, ${quant(y - it.h / 2, q)}px, 0)`;
    if (it.tf !== tf) { it.tf = tf; it.el.style.transform = tf; }
    if (it.i !== i) { it.i = i; it.el.style.setProperty('--i', i); it.g.style.setProperty('--i', i); }
    // leader: dot -> knee -> label edge, meeting the label at the centre of its name block
    const ly = quant(y - it.h / 2 + (it.bh || it.h) / 2, q);
    const edgeX = right ? Rx - opt.labelGap : Lx + opt.labelGap;
    let d;
    if (it.inColumn) {
      // the part projects under the label column: the leader meets the label's nearer horizontal edge
      // (its bottom when the label sits above the part, its top when below) at the anchor's x kept inside
      // the column; a label the solver had to leave across the anchor's y gets a plain stub to its edge
      const bTop = quant(y - it.h / 2, q), bBot = quant(bTop + (it.bh || it.h), q);
      const lx = quant(Math.min(Math.max(ax, x + 4), x + labelW - 4), q);
      if (bBot + opt.labelGap <= ay) d = `M${ax} ${ay}L${lx} ${quant(bBot + opt.labelGap, q)}`;
      else if (bTop - opt.labelGap >= ay) d = `M${ax} ${ay}L${lx} ${quant(bTop - opt.labelGap, q)}`;
      else d = `M${ax} ${ay}L${edgeX} ${ly}`;
    } else {
      const room = right ? edgeX - ax : ax - edgeX;
      let reach = Math.max(opt.elbow, Math.abs(ly - ay));
      reach = Math.max(4, Math.min(reach, room - 4));
      const kx = quant(right ? ax + reach : ax - reach, q);
      d = `M${ax} ${ay}L${kx} ${ly}L${edgeX} ${ly}`;
    }
    if (it.d !== d) { it.d = d; it.path.setAttribute('d', d); it.under.setAttribute('d', d); it.dot.setAttribute('cx', ax); it.dot.setAttribute('cy', ay); }
    if (!it.shown) {
      it.shown = true;
      it.el.classList.remove('is-off');
      it.g.style.display = '';
      if (enterPending) { it.el.classList.add('is-enter'); it.g.classList.add('is-enter'); }
    }
    return held;
  }

  /* ---------- sheet ---------- */
  function renderSheet() {
    if (!sheetUI) return;
    const list = stage.stations || [];
    const st = stationAt(station);
    sheetUI.index.textContent = st ? `${pad2(st.index + 1)} / ${pad2(list.length)}` : `— / ${pad2(list.length)}`;
    sheetUI.name.textContent = st ? st.label : 'No station';
    const n = st ? st.partIds.filter(id => items.has(id)).length : 0;
    sheetUI.count.textContent = `${n} ${n === 1 ? 'part' : 'parts'}`;
    if (sheetUI.dots.length !== list.length) {
      sheetUI.strip.innerHTML = ''; sheetUI.dots = [];
      list.forEach((s, i) => {
        const li = document.createElement('li');
        const b = el('button', 'co-strip-dot', { type: 'button', 'data-station': i, 'aria-label': `Station ${pad2(i + 1)}, ${s.label}` });
        li.append(b); sheetUI.strip.append(li); sheetUI.dots.push(b);
      });
    }
    sheetUI.dots.forEach((b, i) => { if (i === station) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current'); });
    sheetUI.prev.disabled = station <= 0;
    sheetUI.next.disabled = station < 0 || station >= list.length - 1;
  }
  function onSheetClick(e) {
    const dot = e.target.closest('.co-strip-dot');
    if (dot) { setStation(+dot.dataset.station, { source: 'sheet' }); return; }
    const btn = e.target.closest('.co-sheet-btn');
    if (btn && !btn.disabled) {
      const next = station + (+btn.dataset.dir);
      const list = stage.stations || [];
      if (next >= 0 && next < list.length) setStation(next, { source: 'sheet' });
      return;
    }
    onClick(e);
  }

  /* ---------- modes ---------- */
  function applyMode(force = false) {
    const want = opt.mode === 'auto' ? (mq.matches ? 'sheet' : 'rail') : opt.mode;
    const next = want === 'sheet' && sheetUI ? 'sheet' : 'rail';
    if (next === mode && !force) return;
    mode = next; state.mode = mode;
    const st = stationAt(station);
    const ids = st ? st.partIds : [];
    if (mode === 'sheet') {
      for (const id of ids) { const it = items.get(id); if (it) sheetUI.list.append(it.el); }
      for (const it of items.values()) {
        if (!it.el.isConnected || it.el.parentNode !== sheetUI.list) sheetUI.list.append(it.el);
        it.el.style.transform = ''; it.el.classList.remove('is-off', 'is-enter'); it.el.removeAttribute('data-side');
        it.g.style.display = 'none'; it.shown = false; it.cur = NaN; it.side = null;
        it.tf = ''; it.d = ''; it.i = -1;   // the write caches mirror the DOM; the inline transform was just cleared
      }
      svg.classList.add('co-hidden'); labels.classList.add('co-hidden');
      sheet.hidden = false;
    } else {
      for (const it of items.values()) { labels.append(it.el); it.el.classList.remove('is-enter'); markOff(it); }
      svg.classList.remove('co-hidden'); labels.classList.remove('co-hidden');
      if (sheet) sheet.hidden = true;
      measureBox(); measureHeights();
    }
    renderSheet();
    solve();
  }

  /* ---------- lock ---------- */
  function lock(partId, { focus = false } = {}) {
    const it = items.get(+partId);
    if (!it) return false;
    if (it.station !== station && it.station >= 0) setStation(it.station, { animate: false, source: 'lock' });
    if (!it.on) return false;               // a part no station lists cannot be shown, so it cannot be locked
    if (lockedId !== it.id) {
      if (lockedId !== null) clearLock();
      lockedId = it.id; state.locked = it.id;
      it.el.classList.add('is-locked'); it.g.classList.add('is-locked');
      it.btn.setAttribute('aria-expanded', 'true'); it.desc.removeAttribute('aria-hidden');
      labels.dataset.locked = it.id; svg.dataset.locked = it.id; if (sheet) sheet.dataset.locked = it.id;
      measureHeights(); solve();
      if (mode === 'sheet') revealInSheet(it);
      bus.emit('callouts:lock', { partId: it.id, station: it.station });
    }
    if (focus) { it.btn.focus({ preventScroll: true }); if (mode === 'sheet') revealInSheet(it); }
    return true;
  }
  /* Scroll the sheet's own list (never the page) so the item, with its description open, is in view. */
  function revealInSheet(it) {
    if (!sheetUI) return;
    const list = sheetUI.list, lr = list.getBoundingClientRect(), r = it.el.getBoundingClientRect();
    const bottom = r.top + it.btn.offsetHeight + (it.id === lockedId ? it.inner.scrollHeight : 0);
    if (r.top < lr.top) list.scrollTop += r.top - lr.top;
    else if (bottom > lr.bottom) list.scrollTop += Math.min(bottom - lr.bottom, r.top - lr.top);
  }
  function clearLock() {
    const it = items.get(lockedId);
    if (it) { it.el.classList.remove('is-locked'); it.g.classList.remove('is-locked'); it.btn.setAttribute('aria-expanded', 'false'); it.desc.setAttribute('aria-hidden', 'true'); }
    lockedId = null; state.locked = null;
    delete labels.dataset.locked; delete svg.dataset.locked; if (sheet) delete sheet.dataset.locked;
  }
  function unlock() {
    if (lockedId === null) return false;
    const id = lockedId;
    clearLock();
    measureHeights(); solve();
    bus.emit('callouts:unlock', { partId: id });
    return true;
  }

  /* ---------- pointer and keyboard ---------- */
  function itemOf(target) {
    const wrap = target && target.closest ? target.closest('.co-item') : null;
    return wrap ? items.get(+wrap.dataset.part) : null;
  }
  function onClick(e) {
    const btn = e.target.closest('.co-label');
    if (!btn) return;
    const it = itemOf(btn);
    if (!it) return;
    if (lockedId === it.id) unlock(); else lock(it.id);
  }
  function onFocusIn(e) {
    const btn = e.target.closest && e.target.closest('.co-label');
    if (!btn) return;
    // Keyboard focus locks; a pointer press leaves the decision to the click that follows.
    let keyboard = false;
    try { keyboard = btn.matches(':focus-visible'); } catch { keyboard = true; }
    if (keyboard) { const it = itemOf(btn); if (it && lockedId !== it.id) lock(it.id); }
  }
  function onHover(e) {
    const it = itemOf(e.target.closest && e.target.closest('.co-label'));
    if (it) it.g.classList.toggle('is-hover', e.type === 'pointerover');
  }
  function visibleOrder() {
    const list = [...items.values()].filter(it => it.on && (mode === 'sheet' || it.shown));
    if (mode === 'sheet') return list.sort((a, b) => a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
    return list.sort((a, b) => (a.side === b.side ? a.cur - b.cur : a.side === 'left' ? -1 : 1));
  }
  function onKey(e) {
    const btn = e.target.closest && e.target.closest('.co-label');
    if (!btn) return;
    const it = itemOf(btn);
    if (!it) return;
    const order = visibleOrder();
    const i = order.indexOf(it);
    let target = null;
    switch (e.key) {
      case 'Escape': if (lockedId !== null) { unlock(); e.preventDefault(); } return;
      case 'ArrowDown': target = order[(i + 1) % order.length]; break;
      case 'ArrowUp': target = order[(i - 1 + order.length) % order.length]; break;
      case 'Home': target = order[0]; break;
      case 'End': target = order[order.length - 1]; break;
      case 'ArrowRight':
      case 'ArrowLeft': {
        if (mode === 'sheet') { target = order[(i + (e.key === 'ArrowRight' ? 1 : -1) + order.length) % order.length]; break; }
        // jump to the nearest label on the other rail, measured along y
        const other = order.filter(o => o.side !== it.side);
        if (!other.length) return;
        target = other.reduce((best, o) => Math.abs(o.cur - it.cur) < Math.abs(best.cur - it.cur) ? o : best, other[0]);
        break;
      }
      default: return;
    }
    if (target && target !== it) { e.preventDefault(); target.btn.focus({ preventScroll: true }); lock(target.id); }
  }
  function onAnimationEnd(e) {
    const t = e.target;
    if (!t || !t.closest) return;
    if (t.classList.contains('co-item')) t.classList.remove('is-enter');
    // the leader's draw is the longest animation in the group; the dot's pop ends earlier and must not cut it short
    else if (t.classList.contains('co-leader')) t.closest('.co-leader-group')?.classList.remove('is-enter');
  }
  labels.addEventListener('click', onClick);
  labels.addEventListener('keydown', onKey);
  labels.addEventListener('focusin', onFocusIn);
  labels.addEventListener('pointerover', onHover);
  labels.addEventListener('pointerout', onHover);
  labels.addEventListener('animationend', onAnimationEnd);
  svg.addEventListener('animationend', onAnimationEnd);

  /* ---------- bus and environment ---------- */
  function onRender(d) {
    if (destroyed || !d) return;
    state.progress = d.progress ?? state.progress;
    const idx = stationIndexFrom(d.station);
    if (idx !== stageStation) { stageStation = idx; setStation(idx); return; }   // setStation solves
    solve();
  }
  function onStation(d) {
    const idx = stationIndexFrom(d);
    if (idx === stageStation) return;
    stageStation = idx;
    setStation(idx);
  }
  function onModeChange() { applyMode(); }
  function schedule() {
    if (pending || destroyed) return;
    pending = requestAnimationFrame(() => { pending = 0; refresh(); });
  }
  function refresh(o) {
    if (destroyed) return;
    if (o && o.mode) opt.mode = o.mode;
    measureBox();
    applyMode();
    measureHeights();
    solve();
  }
  offs.push(bus.on('stage:render', onRender));
  offs.push(bus.on('stage:station', onStation));
  offs.push(bus.on('stage:ready', () => {
    // Rebuild the items (parts may have arrived; another stage instance may have announced itself), then
    // put the displayed station and the lock back: a rebuild must never leave a station selected with
    // nothing shown.
    const s = station, l = lockedId;
    build();
    clearLock(); station = -1;
    if (s >= 0) setStation(s, { animate: false });
    if (l !== null) lock(l);
    if (bus.state['stage:render']) onRender(bus.state['stage:render']);
  }));
  offs.push(governor.subscribe(({ tier: t }) => { tier = t; state.tier = t; }));
  mq.addEventListener('change', onModeChange);
  const ro = 'ResizeObserver' in window ? new ResizeObserver(schedule) : null;
  ro?.observe(svg);
  if (!ro) addEventListener('resize', schedule);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (!destroyed) schedule(); });

  build();
  measureBox();
  if (bus.state['stage:station']) onStation(bus.state['stage:station']);
  if (bus.state['stage:render']) onRender(bus.state['stage:render']);

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    cancelAnimationFrame(pending); pending = 0;
    for (const off of offs) off();
    mq.removeEventListener('change', onModeChange);
    ro?.disconnect();
    if (!ro) removeEventListener('resize', schedule);
    labels.removeEventListener('click', onClick);
    labels.removeEventListener('keydown', onKey);
    labels.removeEventListener('focusin', onFocusIn);
    labels.removeEventListener('pointerover', onHover);
    labels.removeEventListener('pointerout', onHover);
    labels.removeEventListener('animationend', onAnimationEnd);
    svg.removeEventListener('animationend', onAnimationEnd);
    if (sheet) {
      sheet.removeEventListener('click', onSheetClick);
      sheet.removeEventListener('keydown', onKey);
      sheet.removeEventListener('focusin', onFocusIn);
      sheet.innerHTML = ''; sheet.hidden = true; delete sheet.dataset.locked;
    }
    for (const it of items.values()) { it.el.remove(); it.g.remove(); }
    items.clear();
    delete labels.dataset.locked; delete svg.dataset.locked;
    svg.classList.remove('co-hidden', 'co-leaders'); labels.classList.remove('co-hidden', 'co-labels');
    if (sheet) sheet.classList.remove('co-sheet');
    svg.removeAttribute('viewBox');
    for (const [node, name] of added) node.removeAttribute(name);
  }

  return {
    lock, unlock, refresh, destroy,
    setMode(m) { refresh({ mode: m === 'rail' || m === 'sheet' ? m : 'auto' }); },
    setStation(i) { setStation(i, { source: 'api' }); },
    get state() { return state; },
    get options() { return opt; },
  };
}
export default mountCallouts;
