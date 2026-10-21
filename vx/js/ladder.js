/* ladder.js — the flight-event ladder.

   One SVG altitude scale, 0 to 1,300 ft, ticks every 100 ft and labels every
   500 ft, drawn from data/mission.js. Event marks are horizontal hairlines at
   their altitude; the two spans (descent, camera) are thin vertical brackets
   beside the scale. Every mark and span owns a three-line mono label block
   (value / name / detail) in a column to the right. Blocks are stacked top to
   bottom so none overlap, and a block pushed off its altitude gets an elbow
   leader back to its mark, the drawing-plate way. Published values are solid;
   a derived value (the nose cone release at 75 % of the simulated apogee, the
   camera span that starts there) is dashed and tagged DERIVED. No altitude-time
   curve is drawn, because none is published.

   Beside the scale: the points ladder as mono rows with a proportional bar,
   and the notes, one sentence per figure with its source file. Both are static
   HTML, so at tier 0 (and under prefers-reduced-motion) the section is complete
   without any script-driven motion.

   A hairline indicator rises with sectionProgress(root): 0 at the bottom of the
   scale, 1 at the top. Marks below the indicator read at full ink, a span it is
   inside reads in the livery. The reading beside it is a position on the drawn
   scale, labelled SRC: SCROLL; it is not an altitude the rocket reached.

   mountLadder(root, { pxPerFt = 0.42, progress = null })
     → { setProgress, setPxPerFt, refresh, state, destroy } */
import { LADDER } from './data/mission.js';
import { svg, html, textWidth, watchProgress, frameCoalescer, fmtInt } from './timeline-util.js';

export const PX_PER_FT = 0.42;     // default scale, CSS px per foot (1,300 ft = 546 px)
const FONT = 10;                   // mono label size, px
const TRACK = 0.18;                // mono tracking, em
const LINE = 12;                   // line pitch inside a three-line label block, px
const PAD_Y = 22;                  // room above the top tick and below the bottom tick
const X_LABEL = 32;                // right edge of the altitude tick labels
const X_AXIS = 52;                 // the scale line
const X_WINDOW = 58;               // the window band (floor to ceiling)
const WINDOW_W = 6;
const X_SPAN0 = 74;                // first bracket (descent); the next sits SPAN_GAP further right
const SPAN_GAP = 12;
const X_MARK_END = 108;            // event hairlines run from the axis to here
const X_TEXT = 118;                // label blocks start here
const BLOCK_H = LINE * 3;          // value / name / detail
const BLOCK_GAP = 8;               // minimum clearance between stacked label blocks
const MIN_W = 300, MAX_W = 440;    // the SVG's natural width range; a narrower column scales it with the viewBox

function clampPpf(v) { return Math.max(0.25, Math.min(0.8, +v || PX_PER_FT)); }
function sourceFile(src) { const m = /^([\w./-]+\.html)/.exec(src || ''); return m ? m[1] : 'projects/charger.html'; }
/* Keep a detail line inside the text column: drop trailing clauses after " / " until it fits, then clip. */
function fitLine(text, maxPx) {
  let t = text;
  while (textWidth(t, FONT, TRACK) > maxPx && t.includes(' / ')) t = t.slice(0, t.lastIndexOf(' / '));
  if (textWidth(t, FONT, TRACK) > maxPx) t = t.slice(0, Math.max(3, Math.floor(maxPx / (FONT * (0.6 + TRACK))) - 1)) + '…';
  return t;
}

export function mountLadder(root, { pxPerFt = PX_PER_FT, progress = null } = {}) {
  if (!root) throw new Error('mountLadder: root element required');
  root.classList.add('ld-root');
  root.replaceChildren();
  let ppf = clampPpf(pxPerFt);
  let destroyed = false;
  let watcher = null;
  const { minFt, maxFt, tickFt, labelFt } = LADDER.scale;

  /* ---- static DOM: header, scale column, points ladder, notes ----------- */
  const cursorOut = html('span', { class: 'ld-cursor-out' }, '—');
  const head = html('div', { class: 'ld-head meta-sm' },
    html('span', {}, html('b', {}, 'Flight events'), ' / as published in the case study / simulated, not flight data'),
    html('span', {}, 'Indicator / ', cursorOut, ' / ', html('span', { class: 'ld-src' }, 'SRC: SCROLL')));
  const scaleWrap = html('div', { class: 'ld-scale' });
  const pointsWrap = html('section', { class: 'ld-points', 'aria-label': 'Points ladder' });
  const notesWrap = html('section', { class: 'ld-notes', 'aria-label': 'Flight event notes' });
  const foot = html('p', { class: 'ld-foot meta-sm' }, LADDER.honesty);
  root.append(head, html('div', { class: 'ld-body' }, scaleWrap, pointsWrap, notesWrap), foot);
  renderPoints();
  renderNotes();

  /* ---- scale, marks, spans --------------------------------------------- */
  const groups = new Map();   // id → SVG group, for the passed / live state
  let geometry = null;        // { Y(ft), W, H, ind }

  function renderScale() {
    scaleWrap.replaceChildren();
    groups.clear();
    const colW = Math.round(scaleWrap.getBoundingClientRect().width) || MAX_W;
    const W = Math.max(MIN_W, Math.min(MAX_W, colW));
    const H = Math.round((maxFt - minFt) * ppf + PAD_Y * 2);
    const Y = (ft) => PAD_Y + (maxFt - ft) * ppf;    // altitude → y, up is up
    const s = svg('svg', { class: 'ld-svg', width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `Altitude scale ${minFt} to ${fmtInt(maxFt)} feet with ${LADDER.marks.length} event marks and ${LADDER.spans.length} spans` });
    if (colW < W) { s.setAttribute('width', colW); s.setAttribute('height', Math.round(H * colW / W)); }

    /* the window: floor to ceiling as a faint band so the target reads at a glance */
    const { floor, ceiling } = LADDER.windowFt;
    s.append(svg('rect', { class: 'ld-window', x: X_WINDOW, y: Y(ceiling), width: WINDOW_W, height: Y(floor) - Y(ceiling) }));
    /* scale line, ticks every 100 ft, labels every 500 ft */
    s.append(svg('line', { class: 'ld-axis', x1: X_AXIS, y1: Y(maxFt), x2: X_AXIS, y2: Y(minFt) }));
    for (let ft = minFt; ft <= maxFt; ft += tickFt) {
      const major = ft % labelFt === 0;
      s.append(svg('line', { class: 'ld-tick', x1: X_AXIS - (major ? 10 : 5), y1: Y(ft), x2: X_AXIS, y2: Y(ft) }));
      if (major) s.append(svg('text', { class: 'ld-t', x: X_LABEL, y: Y(ft) + 3.5, 'text-anchor': 'end' }, fmtInt(ft)));
    }
    s.append(svg('text', { class: 'ld-t', x: X_LABEL, y: Y(maxFt) - 8, 'text-anchor': 'end' }, 'FT'));

    /* label blocks: marks at their altitude, spans at their midpoint; stacked top to bottom */
    const items = [
      ...LADDER.marks.map(m => ({ kind: 'mark', m, ft: m.ft, anchorFt: m.ft, value: `${fmtInt(m.ft)} FT`, name: m.label, detail: m.detail, derived: !!m.derived })),
      ...LADDER.spans.map((sp, i) => ({ kind: 'span', m: sp, i, ft: (sp.fromFt + sp.toFt) / 2, anchorFt: (sp.fromFt + sp.toFt) / 2, value: `${fmtInt(sp.fromFt)} → ${fmtInt(sp.toFt)} FT`, name: sp.label, detail: sp.detail, derived: !!sp.derived })),
    ].sort((a, b) => b.ft - a.ft);   // top of the scale first
    let prevBottom = -Infinity;
    for (const it of items) {
      let top = Y(it.anchorFt) - BLOCK_H / 2;
      if (top < prevBottom + BLOCK_GAP) top = prevBottom + BLOCK_GAP;   // push below the block above
      top = Math.max(2, Math.min(H - BLOCK_H - 2, top));
      it.top = top; prevBottom = top + BLOCK_H;
    }
    const maxText = W - X_TEXT - 6;

    /* spans: thin vertical brackets beside the window */
    for (const it of items.filter(i => i.kind === 'span')) {
      const sp = it.m, x = X_SPAN0 + it.i * SPAN_GAP, y1 = Y(sp.fromFt), y2 = Y(sp.toFt);
      const g = svg('g', { class: 'ld-span', 'data-id': sp.id, 'data-derived': sp.derived ? '' : null });
      g.append(svg('line', { class: 'ld-span-line', x1: x, y1, x2: x, y2, 'stroke-dasharray': sp.derived ? '3 3' : null }));
      g.append(svg('line', { class: 'ld-span-cap', x1: x - 3, y1, x2: x + 3, y2: y1 }));
      g.append(svg('line', { class: 'ld-span-cap', x1: x - 3, y1: y2, x2: x + 3, y2: y2 }));
      const ym = (y1 + y2) / 2, ty = it.top + BLOCK_H / 2;
      g.append(svg('path', { class: 'ld-lead', d: `M${x + 3} ${ym} H${X_MARK_END}${Math.abs(ty - ym) > 0.5 ? ` H${X_TEXT - 4} V${ty}` : ''}` }));
      appendBlock(g, it, maxText);
      s.append(g);
      groups.set(sp.id, g);
    }
    /* marks: hairline from the axis, dot on the scale, elbow leader when displaced */
    for (const it of items.filter(i => i.kind === 'mark')) {
      const m = it.m, y = Y(m.ft), ty = it.top + BLOCK_H / 2;
      const g = svg('g', { class: 'ld-mark', 'data-id': m.id, 'data-derived': m.derived ? '' : null });
      g.append(svg('line', { class: 'ld-mark-line', x1: X_AXIS, y1: y, x2: X_MARK_END, y2: y, 'stroke-dasharray': m.derived ? '3 3' : null }));
      g.append(svg('circle', { class: 'ld-mark-dot', cx: X_AXIS, cy: y, r: 2.5 }));
      if (Math.abs(ty - y) > 0.5) g.append(svg('path', { class: 'ld-lead', d: `M${X_MARK_END} ${y} H${X_TEXT - 4} V${ty}` }));
      appendBlock(g, it, maxText);
      s.append(g);
      groups.set(m.id, g);
    }

    /* the scroll indicator: a livery hairline across the scale and the brackets, short of the text column */
    const ind = svg('g', { class: 'ld-indicator', transform: `translate(0 ${Y(minFt)})` },
      svg('line', { x1: X_AXIS - 14, y1: 0, x2: X_MARK_END + 4, y2: 0 }),
      svg('path', { d: `M${X_AXIS - 14} -4 l6 4 l-6 4 z` }));
    s.append(ind);
    scaleWrap.append(s);
    geometry = { Y, W, H, ind };
  }
  /* value / name / detail, with the DERIVED tag after the value */
  function appendBlock(g, it, maxText) {
    const value = it.value, name = fitLine(it.name.toUpperCase(), maxText), detail = fitLine(it.detail.toUpperCase(), maxText);
    g.append(svg('text', { class: 'ld-t ld-t-value', x: X_TEXT, y: it.top + FONT }, value));
    if (it.derived) g.append(svg('text', { class: 'ld-t ld-t-derived', x: X_TEXT + textWidth(value, FONT, TRACK) + 8, y: it.top + FONT }, 'DERIVED'));
    g.append(svg('text', { class: 'ld-t ld-t-name', x: X_TEXT, y: it.top + FONT + LINE }, name));
    g.append(svg('text', { class: 'ld-t', x: X_TEXT, y: it.top + FONT + LINE * 2 }, detail));
  }

  /* ---- points ladder ----------------------------------------------------- */
  function renderPoints() {
    const P = LADDER.points;
    const maxValue = Math.max(...P.rows.map(r => r.value * (r.each || 1)));
    const list = html('ol', { class: 'ld-points-list' });
    for (const r of P.rows) {
      const total = r.value * (r.each || 1);
      list.append(html('li', { class: 'ld-prow' },
        html('span', { class: 'ld-pidx meta-sm' }, r.index),
        html('span', { class: 'ld-pval', 'aria-label': `${total} points` }, r.each ? `${r.value} × ${r.each}` : String(r.value)),
        html('span', { class: 'ld-plabel' }, r.label, r.extra ? html('span', { class: 'ld-pextra' }, `, ${r.extra}`) : null),
        html('span', { class: 'ld-pbar', 'aria-hidden': 'true', style: `--w:${(total / maxValue * 100).toFixed(1)}%` })));
    }
    const totalRow = html('div', { class: 'ld-prow ld-ptotal' },
      html('span', { class: 'ld-pidx meta-sm' }, '='),
      html('span', { class: 'ld-pval' }, String(P.total.value)),
      html('span', { class: 'ld-plabel' }, 'Total', html('span', { class: 'ld-pextra' }, `, ${P.total.extra}`)));
    const bonusRow = html('div', { class: 'ld-prow ld-pbonus', 'data-derived': '' },
      html('span', { class: 'ld-pidx meta-sm' }, '+'),
      html('span', { class: 'ld-pval' }, `+${P.bonus.value}`),
      html('span', { class: 'ld-plabel' }, P.bonus.label, html('span', { class: 'ld-derived' }, 'Derived'), html('span', { class: 'ld-pextra' }, ` ${P.bonus.derivation}`)));
    pointsWrap.append(html('h3', { class: 'ld-sub meta-sm' }, html('b', {}, 'Points ladder'), ' / where the points are'), list, totalRow, bonusRow);
  }

  /* ---- notes ------------------------------------------------------------- */
  function renderNotes() {
    const items = [...LADDER.marks].sort((a, b) => b.ft - a.ft).map(m => ({ ...m, value: `${fmtInt(m.ft)} ft` }))
      .concat(LADDER.spans.map(sp => ({ ...sp, value: `${fmtInt(sp.fromFt)} → ${fmtInt(sp.toFt)} ft` })));
    const list = html('ol', { class: 'ld-notes-list' });
    items.forEach((it, i) => {
      const meta = html('p', { class: 'ld-nmeta meta-sm' }, html('span', {}, `Source / ${sourceFile(it.source)}`));
      if (it.derived) meta.append(html('span', { class: 'ld-derived' }, 'Derived'), html('span', { class: 'ld-derivation' }, it.derivation || ''));
      list.append(html('li', { class: 'ld-nrow', 'data-id': it.id, 'data-derived': it.derived ? '' : null },
        html('p', { class: 'ld-nhead meta-sm' }, html('span', { class: 'ld-nidx' }, String(i + 1).padStart(2, '0')), html('b', {}, it.value), html('span', {}, `/ ${it.label}`)),
        html('p', { class: 'ld-nsentence' }, it.sentence),
        meta));
    });
    notesWrap.append(html('h3', { class: 'ld-sub meta-sm' }, html('b', {}, 'Notes'), ' / every figure with the sentence it came from'), list);
  }

  /* ---- indicator --------------------------------------------------------- */
  let cursorFt = minFt;
  function drawIndicator(p) {
    if (!geometry) return;
    const ft = minFt + p * (maxFt - minFt);
    cursorFt = ft;
    geometry.ind.setAttribute('transform', `translate(0 ${geometry.Y(ft).toFixed(1)})`);
    cursorOut.textContent = `${fmtInt(ft)} FT ON THE SCALE`;
    for (const m of LADDER.marks) { const g = groups.get(m.id); if (!g) continue; if (ft >= m.ft) g.dataset.passed = ''; else delete g.dataset.passed; }
    for (const sp of LADDER.spans) {
      const g = groups.get(sp.id); if (!g) continue;
      if (ft >= sp.fromFt) g.dataset.passed = ''; else delete g.dataset.passed;
      if (ft >= sp.toFt && ft < sp.fromFt) g.dataset.live = ''; else delete g.dataset.live;
    }
  }

  /* ---- layout + lifecycle ------------------------------------------------ */
  let lastColW = 0;
  function relayout() {
    if (destroyed) return;
    renderScale();
    lastColW = Math.round(scaleWrap.getBoundingClientRect().width);
    watcher?.refresh();
  }
  const coalesce = frameCoalescer(relayout);
  const ro = 'ResizeObserver' in window ? new ResizeObserver(() => { const w = Math.round(scaleWrap.getBoundingClientRect().width); if (w && w !== lastColW) coalesce.request(); }) : null;
  ro?.observe(scaleWrap);
  const onResize = () => coalesce.request();
  if (!ro) addEventListener('resize', onResize);

  watcher = watchProgress(root, (p) => drawIndicator(p), { onTier: (t) => { root.dataset.tier = String(t); } });
  if (progress !== null && progress !== undefined) watcher.setOverride(progress);
  relayout();

  return {
    root,
    get state() {
      return {
        progress: watcher.progress, source: watcher.override !== null ? 'override' : 'scroll', visible: watcher.visible, tier: watcher.tier,
        cursorFt: Math.round(cursorFt), pxPerFt: ppf, width: geometry?.W ?? 0, height: geometry?.H ?? 0,
        passed: [...groups.entries()].filter(([, g]) => 'passed' in g.dataset).map(([id]) => id),
        live: [...groups.entries()].filter(([, g]) => 'live' in g.dataset).map(([id]) => id),
        marks: LADDER.marks.length, spans: LADDER.spans.length, points: LADDER.points.rows.length,
      };
    },
    setProgress(p) { watcher.setOverride(p); },
    setPxPerFt(v) { ppf = clampPpf(v); relayout(); },
    refresh() { relayout(); },
    destroy() {
      if (destroyed) return; destroyed = true;
      coalesce.cancel(); ro?.disconnect(); if (!ro) removeEventListener('resize', onResize);
      watcher.destroy();
      root.replaceChildren(); root.classList.remove('ld-root'); delete root.dataset.tier;
    },
  };
}
