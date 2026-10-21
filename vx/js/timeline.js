/* timeline.js — the launch-weekend timeline instrument.

   Two SVG axes rendered from data/mission.js, nothing hand placed:
     1. a month axis, Aug 2023 → Sep 2026 at 14 px per month (532 px). Role
        bands sit in lanes packed first-fit by their label extent; rocket
        milestones are vertical event lines with a + mark and a zero-padded
        index. When the axis does not fit the column it wraps into rows of
        equal month count (two rows on a phone).
     2. an hour track for the two launch days, 08:00–16:00 each. Events sit only
        where the case study gives a time (16:00, the range closing) or a bound
        (before noon); an untimed event is a dashed span across its day.
   Beside the axes, the log: one <button> per event in chronological order; it
   expands the sentence the event came from, with its source file and, where a
   value was computed, the derivation under a DERIVED tag. Marks on the axes are
   pointer-only hit areas that toggle the same rows, so the keyboard path is the
   log and nothing is announced twice.

   Scroll scrubs a hairline cursor along both axes through sectionProgress(root)
   (scroll.progressOf when the section is pinned). SRC: SCROLL, printed in the
   header strip. Tier 0 (also prefers-reduced-motion): every note open, cursor
   moves on scroll:idle only. No rAF loop: the only frame requests coalesce a
   re-layout after a resize and let a note's open transition start.

   mountTimeline(root, { pxPerMonth = 14, progress = null })
     → { setProgress, setPxPerMonth, open, close, toggle, openAll, closeAll, refresh, state, events, destroy }
   Emits timeline:toggle { id, open } when a note opens or closes by a click. */
import { bus } from './core/bus.js';
import { AXIS, ROLES, MILESTONES, WEEKEND, STANDINGS } from './data/mission.js';
import { svg, html, textWidth, stackLabels, watchProgress, frameCoalescer, MONTHS, parseDate, daysIn, fmtDate, fmtHour } from './timeline-util.js';

export const PX_PER_MONTH = 14;    // the axis scale from the brief, CSS px per calendar month
const FONT = 10;                   // mono label size in px (tokens: --fs-meta-sm)
const TRACK = 0.18;                // mono tracking in em (tokens: --ls-caps)
const LINE = 13;                   // label row pitch in px for stacked index labels
const LANE_H = 20;                 // one role lane: 10 px label + 2 px gap + 5 px band + 3 px
const BAND_H = 5;                  // role band thickness in px
const TOP_H = 14;                  // year label row above the axis line
const TICK = { month: 3, quarter: 6, year: 10 };  // tick lengths below the axis line, px
const MARK_R = 4;                  // half size of the + mark, px
const LEFT_PAD = 10;               // room for the index label centred on the first month
const RIGHT_PAD = 24;              // room for a label that overhangs the row end
const ROW_GAP = 12;                // between wrapped rows of the month axis
const HOUR_GUTTER = 64;            // left gutter of the hour track for the DAY ONE / DAY TWO labels
const HOUR_ROW_H = 58;             // one day row of the hour track
const HOUR_PX_MIN = 24, HOUR_PX_MAX = 56;   // px per hour, fitted to the column
const HIT = 32;                    // pointer hit size of an axis mark, px (44 on coarse pointers via CSS)

/* ---- date → axis helpers ------------------------------------------------ */
const A0 = parseDate(AXIS.start), A1 = parseDate(AXIS.end);
const TOTAL_MONTHS = (A1.y - A0.y) * 12 + (A1.m - A0.m) + 1;   // Aug 2023 … Sep 2026 inclusive = 38
/* Month index on the axis, fractional when the date names a day: 0 = Aug 2023. */
function monthIndex(iso) {
  const { y, m, d } = parseDate(iso);
  const base = (y - A0.y) * 12 + (m - A0.m);
  return d ? base + (d - 1) / daysIn(y, m) : base;
}
function monthLabel(index) {
  const i = Math.max(0, Math.min(TOTAL_MONTHS - 1, Math.floor(index)));
  const m = (A0.m - 1 + i) % 12, y = A0.y + Math.floor((A0.m - 1 + i) / 12);
  return `${MONTHS[m]} ${y}`;
}
const upper = (s) => s.toUpperCase();
function sourceFile(src) { const m = /^([\w./-]+\.html)/.exec(src || ''); return m ? m[1] : 'index.html'; }
function clampPpm(v) { return Math.max(6, Math.min(48, Math.round(+v || PX_PER_MONTH))); }

/* ---- the chronological event list (roles, milestones, weekend) ---------- */
function buildEvents() {
  const list = [];
  for (const r of ROLES) list.push({
    kind: 'role', id: r.id, data: r, order: 0, key: monthIndex(r.start) * 1000,
    label: `${r.title}, ${r.org}`, when: `${fmtDate(r.start)} – ${fmtDate(r.end)}`,
    sentence: r.sentence, source: r.source, derived: !!r.derived, derivation: r.derivation,
  });
  for (const m of MILESTONES) list.push({
    kind: 'milestone', id: m.id, data: m, order: 1, key: monthIndex(m.date) * 1000,
    label: m.label, when: fmtDate(m.date),
    sentence: m.sentence, source: m.source, derived: !!m.derived, derivation: m.derivation,
  });
  const wk = monthIndex(WEEKEND.date) * 1000;
  WEEKEND.days.forEach((day, di) => {
    for (const e of day.events) list.push({
      kind: 'weekend', id: e.id, data: e, day: di, order: 2, key: wk + di * 24 + (e.timed === true ? e.at : e.to),
      label: e.label,
      when: `${day.label} / ${e.timed === true ? fmtHour(e.at) : e.timed === 'bound' ? 'before ' + fmtHour(e.to) : 'time not published'}`,
      sentence: e.sentence, source: e.source, derived: !!e.derived, derivation: e.derivation,
    });
  });
  list.sort((a, b) => (a.key - b.key) || (a.order - b.order));
  list.forEach((e, i) => { e.index = String(i + 1).padStart(2, '0'); });
  return list;
}

export function mountTimeline(root, { pxPerMonth = PX_PER_MONTH, progress = null } = {}) {
  if (!root) throw new Error('mountTimeline: root element required');
  root.classList.add('tl-root');
  root.replaceChildren();
  const events = buildEvents();
  const byId = new Map(events.map(e => [e.id, e]));
  let ppm = clampPpm(pxPerMonth);
  let destroyed = false;
  let watcher = null;

  /* ---- static DOM ------------------------------------------------------- */
  const cursorOut = html('span', { class: 'tl-cursor-out' }, '—');
  const scaleOut = html('span', { class: 'tl-scale-out' }, `${ppm} px per month`);
  const head = html('div', { class: 'tl-head meta-sm' },
    html('span', { class: 'tl-head-l' }, html('b', {}, 'Mission timeline'), ` / ${fmtDate(AXIS.start)} – ${fmtDate(AXIS.end)} / `, scaleOut),
    html('span', { class: 'tl-head-r' }, 'Cursor / ', cursorOut, ' / ', html('span', { class: 'tl-src' }, 'SRC: SCROLL')));
  const monthsWrap = html('div', { class: 'tl-axis tl-months' });
  const hourOut = html('span', { class: 'tl-hour-out' }, '—');
  const hoursHead = html('div', { class: 'tl-sub meta-sm' },
    html('span', {}, html('b', {}, 'Launch weekend'), ` / ${WEEKEND.place} / ${fmtDate(WEEKEND.date)} / ${fmtHour(WEEKEND.track.startHour)} – ${fmtHour(WEEKEND.track.endHour)}`),
    hourOut);
  const hoursWrap = html('div', { class: 'tl-axis tl-hours' });
  const hoursNote = html('p', { class: 'tl-note-line meta-sm' }, 'Events sit only where the case study gives a time or a bound. A dashed span carries no time.');
  const axes = html('div', { class: 'tl-axes' }, head, monthsWrap, hoursHead, hoursWrap, hoursNote);
  const log = html('ol', { class: 'tl-log', 'aria-label': 'Mission events in order' });
  root.append(html('div', { class: 'tl-grid' }, axes, log));

  /* ---- the log: one button per event ----------------------------------- */
  const rows = new Map();   // id → { li, button, note, glyph }
  for (const e of events) {
    const noteId = `tl-note-${e.id}`;
    const glyph = html('span', { class: 'tl-glyph', 'aria-hidden': 'true' }, '+');
    const button = html('button', { type: 'button', class: 'tl-row', 'aria-expanded': 'false', 'aria-controls': noteId, 'data-id': e.id, 'data-kind': e.kind },
      html('span', { class: 'tl-idx' }, e.index),
      html('span', { class: 'tl-when' }, e.when),
      html('span', { class: 'tl-label' }, e.label),
      glyph);
    const body = html('div', { class: 'tl-note-body' }, html('p', { class: 'tl-sentence' }, e.sentence));
    if (e.id === 'published') {
      body.append(html('ol', { class: 'tl-standings', 'aria-label': 'Final standings' },
        ...STANDINGS.rows.map(r => html('li', {}, html('span', { class: 'tl-place' }, r.place), html('span', {}, r.team)))));
    }
    const meta = html('p', { class: 'tl-meta meta-sm' }, html('span', {}, `Source / ${sourceFile(e.source)}`));
    if (e.derived) meta.append(html('span', { class: 'tl-derived' }, 'Derived'), html('span', { class: 'tl-derivation' }, e.derivation || ''));
    body.append(meta);
    const note = html('div', { class: 'tl-note', id: noteId, hidden: '' }, body);
    const li = html('li', { class: 'tl-item', 'data-id': e.id }, button, note);
    log.append(li);
    rows.set(e.id, { li, button, note, glyph });
    button.addEventListener('click', () => toggle(e.id));
    button.addEventListener('pointerenter', () => setHot(e.id, true));
    button.addEventListener('pointerleave', () => setHot(e.id, false));
    button.addEventListener('focus', () => setHot(e.id, true));
    button.addEventListener('blur', () => setHot(e.id, false));
  }

  /* ---- state ------------------------------------------------------------- */
  const open = new Set();
  const marks = new Map();   // id → [SVG groups] for hot / live / passed / open styling
  const bands = [];          // { id, start, end } month ranges for the live test
  let layout = null;         // month axis geometry
  let hourLayout = null;     // hour track geometry
  let width = 0;             // the axes column width in px
  let cursorMonth = 0;
  const addMark = (id, g) => { if (!marks.has(id)) marks.set(id, []); marks.get(id).push(g); };

  function setHot(id, on) {
    for (const g of marks.get(id) || []) { if (on) g.dataset.hot = ''; else delete g.dataset.hot; }
    const r = rows.get(id); if (r) { if (on) r.li.dataset.hot = ''; else delete r.li.dataset.hot; }
  }
  function setOpen(id, on, { emit = true } = {}) {
    const r = rows.get(id); if (!r) return;
    if (on) open.add(id); else open.delete(id);
    r.button.setAttribute('aria-expanded', String(on));
    r.glyph.textContent = on ? '−' : '+';
    if (on) { r.note.hidden = false; requestAnimationFrame(() => { if (!destroyed && open.has(id)) r.note.dataset.open = ''; }); }
    else { delete r.note.dataset.open; r.note.hidden = true; }
    for (const g of marks.get(id) || []) { if (on) g.dataset.open = ''; else delete g.dataset.open; }
    if (emit) bus.emit('timeline:toggle', { id, open: on });
  }
  function toggle(id) { setOpen(id, !open.has(id)); }

  /* Pointer-only hit area over an axis mark; the log row is the keyboard path. */
  function hit(id, x, y, w, h, kind) {
    const s = html('span', { class: 'tl-hit', 'data-id': id, 'data-kind': kind, style: `left:${x}px;top:${y}px;width:${w}px;height:${h}px` });
    s.addEventListener('click', () => { toggle(id); rows.get(id)?.button.focus({ preventScroll: true }); });
    s.addEventListener('pointerenter', () => setHot(id, true));
    s.addEventListener('pointerleave', () => setHot(id, false));
    return s;
  }

  /* ---- month axis -------------------------------------------------------- */
  function renderMonths() {
    monthsWrap.replaceChildren();
    marks.clear(); bands.length = 0;
    const avail = Math.max(240, width);
    const axisPx = TOTAL_MONTHS * ppm;
    const nRows = Math.max(1, Math.ceil(axisPx / Math.max(1, avail - LEFT_PAD - RIGHT_PAD)));
    const monthsPerRow = Math.ceil(TOTAL_MONTHS / nRows);
    const rowPx = monthsPerRow * ppm;

    /* lanes: roles packed first-fit by the wider of band and label extent */
    const roleItems = ROLES.map(r => {
      const ev = byId.get(r.id);
      const x1 = monthIndex(r.start) * ppm, x2 = (monthIndex(r.end) + 1) * ppm;   // a month-precision end covers its whole month
      const label = `${ev.index} ${upper(r.org)}`;
      return { r, ev, x1, x2, label, lw: textWidth(label, FONT, TRACK) };
    }).sort((a, b) => a.x1 - b.x1 || b.x2 - a.x2);
    const laneEnds = [];
    for (const it of roleItems) {
      const extent = Math.max(it.x2, it.x1 + it.lw + 6);
      let lane = 0;
      while (lane < laneEnds.length && laneEnds[lane] > it.x1 - 4) lane++;
      laneEnds[lane] = extent; it.lane = lane;
      bands.push({ id: it.r.id, start: monthIndex(it.r.start), end: monthIndex(it.r.end) + 1 });
    }
    const nLanes = Math.max(1, laneEnds.length);

    const ms = MILESTONES.map(m => ({ m, ev: byId.get(m.id), mi: monthIndex(m.date) }));
    const yAxis = TOP_H + 4;                      // the axis line
    const yLanes = yAxis + TICK.year + 8;         // first lane top
    const yMarks = yLanes + nLanes * LANE_H + 8;  // the + marks
    const rowsOut = [];
    let yOff = 0;
    const svgRoot = svg('svg', { class: 'tl-svg', role: 'img', 'aria-label': `Month axis ${fmtDate(AXIS.start)} to ${fmtDate(AXIS.end)} with ${ROLES.length} role bands and ${MILESTONES.length} milestones` });
    const hits = html('div', { class: 'tl-hits', 'aria-hidden': 'true' });

    for (let row = 0; row < nRows; row++) {
      const m0 = row * monthsPerRow, m1 = Math.min(TOTAL_MONTHS, m0 + monthsPerRow);   // months [m0, m1)
      const X = (mi) => (mi - m0) * ppm;
      const g = svg('g', { class: 'tl-rowg', transform: `translate(${LEFT_PAD} ${yOff})` });

      /* row range labels and the year at each January */
      const startLabel = monthLabel(m0), endLabel = monthLabel(m1 - 1);
      g.append(svg('text', { class: 'tl-t tl-t-strong', x: 0, y: TOP_H - 4 }, startLabel));
      g.append(svg('text', { class: 'tl-t tl-t-strong', x: X(m1), y: TOP_H - 4, 'text-anchor': 'end' }, endLabel));
      const startW = textWidth(startLabel, FONT, TRACK), endW = textWidth(endLabel, FONT, TRACK);
      /* axis line and ticks: every month, longer each quarter, longest each January */
      g.append(svg('line', { class: 'tl-axis-line', x1: 0, y1: yAxis, x2: X(m1), y2: yAxis }));
      for (let mi = m0; mi <= m1; mi++) {
        const cal = (A0.m - 1 + mi) % 12;   // 0 = January
        const isYear = cal === 0, isQ = cal % 3 === 0;
        const len = isYear ? TICK.year : isQ ? TICK.quarter : TICK.month;
        g.append(svg('line', { class: 'tl-tick', x1: X(mi), y1: yAxis, x2: X(mi), y2: yAxis + len }));
        if (isYear && mi < m1) {
          const yr = String(A0.y + Math.floor((A0.m - 1 + mi) / 12));
          const x = X(mi) + 3, w = textWidth(yr, FONT, TRACK);
          if (x > startW + 8 && x + w < X(m1) - endW - 8) g.append(svg('text', { class: 'tl-t', x, y: TOP_H - 4 }, yr));
        }
      }
      /* role bands clipped to this row; every segment carries its label */
      for (const it of roleItems) {
        const a = Math.max(it.x1, m0 * ppm), b = Math.min(it.x2, m1 * ppm);
        if (b <= a) continue;
        const x1 = a - m0 * ppm, x2 = b - m0 * ppm;
        const yl = yLanes + it.lane * LANE_H;
        const gb = svg('g', { class: 'tl-band', 'data-id': it.r.id, 'data-derived': it.r.derived ? '' : null });
        gb.append(svg('rect', { class: 'tl-band-rect', x: x1, y: yl + FONT + 2, width: x2 - x1, height: BAND_H, rx: 1 }));
        if (it.r.derived) gb.append(svg('rect', { class: 'tl-band-dash', x: x1 + 0.5, y: yl + FONT + 2.5, width: Math.max(0, x2 - x1 - 1), height: BAND_H - 1, rx: 1 }));
        gb.append(svg('text', { class: 'tl-t', x: x1, y: yl + FONT - 1 }, it.label));
        g.append(gb);
        addMark(it.r.id, gb);
        hits.append(hit(it.r.id, LEFT_PAD + x1, yOff + yl, x2 - x1, LANE_H, 'band'));
      }
      /* milestones in this row: event line through the lanes, + mark, stacked index label */
      const here = ms.filter(e => e.mi >= m0 && e.mi < m1).sort((a, b) => a.mi - b.mi);
      const labels = here.map(e => { const w = textWidth(e.ev.index, FONT, TRACK); return { x: X(e.mi) - w / 2, w }; });
      const lrows = stackLabels(labels, 4);
      here.forEach((e, i) => {
        const x = X(e.mi), ly = yMarks + MARK_R + 6 + lrows[i] * LINE + FONT;
        const gm = svg('g', { class: 'tl-ms', 'data-id': e.m.id, 'data-derived': e.m.derived ? '' : null });
        gm.append(svg('line', { class: 'tl-ms-line', x1: x, y1: yAxis, x2: x, y2: yMarks - MARK_R - 2, 'stroke-dasharray': e.m.derived ? '2 3' : null }));
        gm.append(svg('line', { class: 'tl-ms-mark', x1: x - MARK_R, y1: yMarks, x2: x + MARK_R, y2: yMarks }));
        gm.append(svg('line', { class: 'tl-ms-mark', x1: x, y1: yMarks - MARK_R, x2: x, y2: yMarks + MARK_R }));
        if (lrows[i] > 0) gm.append(svg('line', { class: 'tl-ms-lead', x1: x, y1: yMarks + MARK_R + 1, x2: x, y2: ly - FONT }));
        gm.append(svg('text', { class: 'tl-t tl-t-idx', x, y: ly, 'text-anchor': 'middle' }, e.ev.index));
        g.append(gm);
        addMark(e.m.id, gm);
        hits.append(hit(e.m.id, LEFT_PAD + x - HIT / 2, yOff + yMarks - HIT / 2, HIT, HIT, 'mark'));
      });
      const labelRows = Math.max(1, ...lrows.map(r => r + 1));
      const rowH = yMarks + MARK_R + 6 + labelRows * LINE + 10;
      /* the cursor for this row, hidden until the cursor month falls inside it */
      const cur = svg('g', { class: 'tl-cursor', visibility: 'hidden' },
        svg('line', { x1: 0, y1: TOP_H, x2: 0, y2: rowH - 6 }),
        svg('path', { d: `M-4 ${TOP_H} h8 l-4 5 z` }));
      g.append(cur);
      svgRoot.append(g);
      rowsOut.push({ m0, m1, cur });
      yOff += rowH + (row < nRows - 1 ? ROW_GAP : 0);
    }
    const W = LEFT_PAD + rowPx + RIGHT_PAD;
    svgRoot.setAttribute('width', W);
    svgRoot.setAttribute('height', yOff);
    svgRoot.setAttribute('viewBox', `0 0 ${W} ${yOff}`);
    monthsWrap.style.width = `${W}px`;
    monthsWrap.append(svgRoot, hits);
    layout = { rows: rowsOut, nRows, monthsPerRow, rowPx, axisPx, nLanes };
    scaleOut.textContent = `${ppm} px per month`;
  }

  /* ---- hour track -------------------------------------------------------- */
  function renderHours() {
    hoursWrap.replaceChildren();
    const { startHour: h0, endHour: h1 } = WEEKEND.track;
    const hours = h1 - h0;
    const avail = Math.max(240, width);
    const pph = Math.max(HOUR_PX_MIN, Math.min(HOUR_PX_MAX, Math.floor((avail - HOUR_GUTTER - RIGHT_PAD) / hours)));
    const X = (h) => HOUR_GUTTER + (h - h0) * pph;
    const W = HOUR_GUTTER + hours * pph + RIGHT_PAD;
    const H = WEEKEND.days.length * HOUR_ROW_H + TOP_H;
    const svgRoot = svg('svg', { class: 'tl-svg', width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `Hour track for ${WEEKEND.days.map(d => d.label.toLowerCase()).join(' and ')}, ${fmtHour(h0)} to ${fmtHour(h1)}` });
    const hits = html('div', { class: 'tl-hits', 'aria-hidden': 'true' });
    const everyHour = pph >= 52;   // "10:00" is about 39 px wide; label every hour only when 12 px stay between labels
    const dayRows = [];
    WEEKEND.days.forEach((day, di) => {
      const y0 = TOP_H + di * HOUR_ROW_H, yAxis = y0 + 10;
      const g = svg('g', { class: 'tl-dayg' });
      g.append(svg('text', { class: 'tl-t tl-t-strong', x: 0, y: yAxis + 4 }, upper(day.label)));
      g.append(svg('line', { class: 'tl-axis-line', x1: X(h0), y1: yAxis, x2: X(h1), y2: yAxis }));
      for (let h = h0; h <= h1; h++) {
        const major = (h - h0) % 2 === 0 || h === h1;
        g.append(svg('line', { class: 'tl-tick', x1: X(h), y1: yAxis, x2: X(h), y2: yAxis + (major ? TICK.quarter : TICK.month) }));
        /* labels centred on their tick; the gutter and the right pad hold the overhang of the first and last */
        if (di === 0 && (everyHour || major)) g.append(svg('text', { class: 'tl-t', x: X(h), y: TOP_H - 4, 'text-anchor': 'middle' }, fmtHour(h)));
      }
      /* events: timed → + mark at X(at); bound or untimed → dashed span with a solid end cap on a published bound */
      const yEv = yAxis + 22;
      const items = day.events.map(e => ({ e, ev: byId.get(e.id), x: e.timed === true ? X(e.at) : X(e.to) })).sort((a, b) => a.x - b.x);
      const labels = items.map(it => { const w = textWidth(it.ev.index, FONT, TRACK); const cx = it.e.timed === true ? it.x : (X(it.e.from) + it.x) / 2; return { x: cx - w / 2, w }; }).sort((a, b) => a.x - b.x);
      const lrows = stackLabels(labels, 4);
      items.forEach((it, i) => {
        const { e, ev, x } = it;
        const gm = svg('g', { class: 'tl-ms tl-hour-ev', 'data-id': e.id, 'data-derived': e.derived ? '' : null });
        let cx = x;
        if (e.timed === true) {
          gm.append(svg('line', { class: 'tl-ms-line', x1: x, y1: yAxis, x2: x, y2: yEv - MARK_R - 2 }));
          gm.append(svg('line', { class: 'tl-ms-mark', x1: x - MARK_R, y1: yEv, x2: x + MARK_R, y2: yEv }));
          gm.append(svg('line', { class: 'tl-ms-mark', x1: x, y1: yEv - MARK_R, x2: x, y2: yEv + MARK_R }));
          hits.append(hit(e.id, x - HIT / 2, yEv - HIT / 2, HIT, HIT, 'mark'));
        } else {
          const xa = X(e.from), xb = X(e.to);
          cx = (xa + xb) / 2;
          gm.append(svg('line', { class: 'tl-span', x1: xa, y1: yEv, x2: xb, y2: yEv, 'stroke-dasharray': '2 4' }));
          gm.append(svg('line', { class: `tl-span-cap${e.timed === 'bound' ? ' tl-span-cap-solid' : ''}`, x1: xb, y1: yEv - MARK_R, x2: xb, y2: yEv + MARK_R, 'stroke-dasharray': e.timed === 'bound' ? null : '1 2' }));
          gm.append(svg('line', { class: 'tl-span-cap', x1: xa, y1: yEv - MARK_R, x2: xa, y2: yEv + MARK_R, 'stroke-dasharray': '1 2' }));
          hits.append(hit(e.id, xa, yEv - HIT / 2, xb - xa, HIT, 'band'));
        }
        const ly = yEv + MARK_R + 6 + lrows[i] * LINE + FONT;
        gm.append(svg('text', { class: 'tl-t tl-t-idx', x: cx, y: ly, 'text-anchor': 'middle' }, ev.index));
        g.append(gm);
        addMark(e.id, gm);
      });
      const cur = svg('g', { class: 'tl-cursor', visibility: 'hidden' },
        svg('line', { x1: 0, y1: yAxis - 8, x2: 0, y2: y0 + HOUR_ROW_H - 4 }),
        svg('path', { d: `M-4 ${yAxis - 8} h8 l-4 5 z` }));
      g.append(cur);
      svgRoot.append(g);
      dayRows.push({ cur });
    });
    hoursWrap.style.width = `${W}px`;
    hoursWrap.append(svgRoot, hits);
    hourLayout = { pph, X, h0, h1, hours, dayRows };
  }

  /* ---- cursor ------------------------------------------------------------ */
  function drawCursor(p) {
    if (!layout || !hourLayout) return;
    const mi = p * TOTAL_MONTHS;   // 0 … 38, fractional months
    cursorMonth = mi;
    for (const r of layout.rows) {
      const inRow = mi >= r.m0 && (mi < r.m1 || r.m1 === TOTAL_MONTHS);
      if (inRow) { const x = Math.min(r.m1 - r.m0, mi - r.m0) * ppm; r.cur.setAttribute('transform', `translate(${x.toFixed(1)} 0)`); r.cur.setAttribute('visibility', 'visible'); }
      else r.cur.setAttribute('visibility', 'hidden');
    }
    cursorOut.textContent = monthLabel(mi);
    /* roles live at the cursor and passed after it; milestones passed once the cursor is beyond them */
    for (const b of bands) for (const g of marks.get(b.id) || []) {
      if (mi >= b.start && mi < b.end) g.dataset.live = ''; else delete g.dataset.live;
      if (mi >= b.end) g.dataset.passed = ''; else delete g.dataset.passed;
    }
    for (const m of MILESTONES) for (const g of marks.get(m.id) || []) { if (mi >= monthIndex(m.date)) g.dataset.passed = ''; else delete g.dataset.passed; }
    /* the same progress walks the hour track: day one, then day two */
    const { hours, h0, dayRows, X } = hourLayout;
    const total = hours * dayRows.length, t = p * total;
    const di = Math.min(dayRows.length - 1, Math.floor(t / hours)), h = h0 + Math.min(hours, t - di * hours);
    dayRows.forEach((d, i) => { if (i === di) { d.cur.setAttribute('transform', `translate(${X(h).toFixed(1)} 0)`); d.cur.setAttribute('visibility', 'visible'); } else d.cur.setAttribute('visibility', 'hidden'); });
    hourOut.textContent = `${upper(WEEKEND.days[di].label)} / ${fmtHour(h)} / SRC: SCROLL`;
    WEEKEND.days.forEach((day, dIdx) => {
      for (const e of day.events) {
        const end = e.timed === true ? e.at : e.to, start = e.timed === true ? e.at : e.from;
        for (const g of marks.get(e.id) || []) {
          if (di > dIdx || (di === dIdx && h >= end)) g.dataset.passed = ''; else delete g.dataset.passed;
          if (di === dIdx && h >= start && h < end) g.dataset.live = ''; else delete g.dataset.live;
        }
      }
    });
  }

  /* ---- layout + lifecycle ------------------------------------------------ */
  function measure() { return Math.max(0, Math.round(axes.getBoundingClientRect().width)); }
  function relayout() {
    if (destroyed) return;
    width = measure() || width || 600;
    renderMonths();
    renderHours();
    for (const id of open) for (const g of marks.get(id) || []) g.dataset.open = '';
    watcher?.refresh();
  }
  const coalesce = frameCoalescer(relayout);
  const ro = 'ResizeObserver' in window ? new ResizeObserver(() => { const w = measure(); if (w && w !== width) coalesce.request(); }) : null;
  ro?.observe(axes);
  const onResize = () => coalesce.request();
  if (!ro) addEventListener('resize', onResize);

  watcher = watchProgress(root, (p) => drawCursor(p), {
    onTier: (t) => {
      root.dataset.tier = String(t);
      if (t === 0) for (const e of events) setOpen(e.id, true, { emit: false });   // static: every note open
    },
  });
  if (progress !== null && progress !== undefined) watcher.setOverride(progress);
  relayout();

  return {
    root,
    events,
    get state() {
      return {
        progress: watcher.progress, source: watcher.override !== null ? 'override' : 'scroll', visible: watcher.visible, tier: watcher.tier,
        cursor: monthLabel(cursorMonth), cursorMonth, pxPerMonth: ppm, width,
        rows: layout?.nRows ?? 0, monthsPerRow: layout?.monthsPerRow ?? 0, axisPx: layout?.axisPx ?? 0, lanes: layout?.nLanes ?? 0,
        pxPerHour: hourLayout?.pph ?? 0, open: [...open], events: events.length,
      };
    },
    setProgress(p) { watcher.setOverride(p); },
    setPxPerMonth(v) { ppm = clampPpm(v); relayout(); },
    open(id) { setOpen(id, true); },
    close(id) { setOpen(id, false); },
    toggle,
    openAll() { for (const e of events) setOpen(e.id, true, { emit: false }); },
    closeAll() { for (const e of events) setOpen(e.id, false, { emit: false }); },
    refresh() { relayout(); },
    destroy() {
      if (destroyed) return; destroyed = true;
      coalesce.cancel(); ro?.disconnect(); if (!ro) removeEventListener('resize', onResize);
      watcher.destroy();
      root.replaceChildren(); root.classList.remove('tl-root'); delete root.dataset.tier;
    },
  };
}
