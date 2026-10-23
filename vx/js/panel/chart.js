/* chart.js: the two canvas-2D instruments of the panel.

   createStripChart(canvas, opts): the angle of attack as the flight's summary
   (presentation wave 3, item 11). One trace, colored by its fin choice as the end plate,
   the lede figure and the run sketches color their paths (fix phase): paper for a finned
   flight, livery orange for a finless one (finColor); on a time axis from T+0 that never scrolls: the first SPLIT_S seconds (the rail, the
   gust, the wobble and the burn) take SPLIT_FRAC of the width and the coast to apogee the
   rest, with a break drawn in the axis between them (a single linear axis when the plot is
   too narrow for two). The y range is symmetric and fits the angle of attack from rail
   exit on, where it means something: samples at or above SCALE_MIN_V (the run cards' and
   the panel's 50 ft/s, EST), the samples the run cards count for their peak. Pitch is not plotted
   on the page (it would set the range: about 33 deg of pitch at apogee against a 7 deg
   wobble); opts.pitch draws it as before (the lab and ?lab) and lets it count.
   Three modes, set by the panel (setView):
     pad      the flight a LAUNCH from the pad would fly (the page's pre-flight), dimmed,
              with its word ticks, labeled PREVIEW, FLOWN IN THIS TAB
     live     the flight in progress: the trace before rail exit dim and dashed (ON THE
              RAIL), solid after, dim and dashed again where the airspeed falls under
              SCALE_MIN_V near apogee; the word ticks appear as the flight passes them
     summary  from apogee on: the trace stops at apogee, marked APOGEE / DESCENT NOT
              PLOTTED (FIELD 3: recovery is out of scope), and stays so after CONTINUE
   Word ticks (CHART_WORDS): GUST, PEAK n.nn°, SETTLED n.nn S, BURNOUT, APOGEE, and PITCH
   PAST 60° for a rocket that turns over. PEAK and SETTLED come from the page's beats (the
   run cards' definitions) when it gives them, else from the trace. A ghost (setView
   ghost: the flight kept after the end card's fin toggle) is drawn dim, in its own fin
   color, with its label on it. The dashed climb near apogee is labeled UNDER 50 FT/S EST. Labels are placed by a small solver: each has candidate spots (rows of the
   plot and the band above it, either side of its tick), scored against the traces under
   it, the labels already placed and the other ticks; a label sits on an ink plate, so no
   trace ever runs through its text, and the solver keeps it off the traces where it can.
   The canvas is aria-hidden; summary() returns a sentence the panel writes to a visually
   hidden paragraph at most once per second.

   createCpCgBar(canvas, opts): a horizontal rocket outline (polygons in metres, see
   format.js) with the CG symbol, the Barrowman CP dot, the lattice CP ring and a
   dimension line labeled with the static margin in calibers.

   Both painters are pure with respect to the flight: the panel hands them data and
   calls draw(). Neither starts a loop. Both tolerate NaN and empty data, and both
   paint their own ink ground, so their paper-colored labels stay legible when forced
   colors turn the surrounding panel white. Every loop is bounded by a count, so a
   time or length too large for its step to register cannot hang the tab. */
import { DEG, M_PER_IN, fixed, fitCanvas, readTheme } from './format.js';

const PAD = { l: 34, r: 14, rLive: 58, t: 22, b: 16 };   // CSS px plot margins (y labels; right edge, or the live value; band; time row)
const SCALES_DEG = [2, 5, 10, 20, 45, 90];      // symmetric y ranges; the smallest that holds the counted angle wins
const SHRINK_HOLD_MS = 1200;                    // live: a smaller range must hold this long before the axis shrinks
const SPLIT_S = 2;                              // s: the axis break; [0, SPLIT_S] gets SPLIT_FRAC of the width
const SPLIT_FRAC = 0.6;
const BREAK_GAP = 8;                            // px between the two parts of the axis
const SPLIT_MIN_W = 160;                        // px of plot: narrower than this, one linear axis
const MIN_WINDOW_S = 8;                         // s: the axis runs to at least T+8 (apogee is near 8 s on every run)
const MAX_TICKS = 256;                          // loop bound for the time ticks
const SCALE_MIN_V = 50 * 0.3048;                // m/s: angle below this airspeed does not set the range (EST, the run cards' rule)
const SCALE_RAIL_S = 0;                         // s after rail exit that count whatever the speed: none, as the run cards count (a crosswind's rail exit angle, under 50 ft/s, is dashed)
const META_GUTTER = 16;                         // CSS px: the band's right margin, the page's phone gutter
const ROW_H = 13;                               // px between label rows
const LABEL_H = 12;                             // px: one line of 10 px mono on its plate
const CELL = 2;                                 // px: the occupancy grid the label solver reads
const DROP_COST = 30;                           // a label whose best spot costs more is left out (its tick stays)
const HIDE_MAX = 12;                            // occupancy under a label above which the spot is refused (two cells of the main trace)

/* The chart's words (owner copy, COPY-REVIEW.md "Wave 3, panel"). Mono caps on the canvas. */
export const CHART_WORDS = Object.freeze({
  aoa: 'ANGLE OF ATTACK', aoaShort: 'AOA', pitch: 'PITCH', sim: 'SIM',
  preview: 'PREVIEW, FLOWN IN THIS TAB', previewShort: 'PREVIEW',
  both: 'BOTH FLOWN IN THIS TAB',
  rail: 'ON THE RAIL', gust: 'GUST', burnout: 'BURNOUT', apogee: 'APOGEE', descent: 'DESCENT NOT PLOTTED',
  pitch60: 'PITCH PAST 60°',
  slow: 'UNDER 50 FT/S EST',                     // the dim dashed climb near apogee (the cards' 50 ft/s rule)
  peak: (deg) => `PEAK ${deg}° SIM`,             // every number keeps its own tag (drawn quiet, paper-a70)
  settled: (s) => `SETTLED ${s} S SIM`,
});
/* a label line's trailing tag (SIM, EST) is drawn quieter than its words */
const TAG_RE = / (SIM|EST)$/;
/* the fin words, as the stage's plate ticks (vx/js/scene/trail.js finWords) and the page's slate use them */
const finWords = (k) => (!Number.isFinite(k) ? '' : Math.abs(k - 1) < 0.005 ? 'FULL FINS' : k < 0.005 ? 'NO FINS' : Math.abs(k - 0.5) < 0.005 ? 'HALF FINS' : `FIN SCALE ${k.toFixed(2)}`);
const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/* trace accessors: the live samples ({t, alpha, theta, v} in rad and m/s, plus the live
   state as a tail) and the page's traces ([t, alphaDeg, thetaDeg, airspeed?] tuples) */
function liveTrace(arr, tail) {
  const n = arr.length + (tail ? 1 : 0);
  const at = (i) => (i < arr.length ? arr[i] : tail);
  return { n, t: (i) => at(i).t, a: (i) => at(i).alpha * DEG, th: (i) => at(i).theta * DEG, v: (i) => at(i).v };
}
function tupleTrace(arr) {
  const a = Array.isArray(arr) ? arr : [];
  return { n: a.length, t: (i) => a[i][0], a: (i) => a[i][1], th: (i) => a[i][2], v: (i) => (a[i].length > 3 ? a[i][3] : NaN) };
}
/* first index with t >= t0 */
function lowerBound(tr, t0) {
  let lo = 0, hi = tr.n;
  while (lo < hi) { const m = (lo + hi) >> 1; if (tr.t(m) < t0) lo = m + 1; else hi = m; }
  return lo;
}
function nearest(tr, t0) {
  if (!tr.n) return -1;
  const i = Math.min(tr.n - 1, lowerBound(tr, t0));
  return i > 0 && Math.abs(tr.t(i - 1) - t0) < Math.abs(tr.t(i) - t0) ? i - 1 : i;
}

export function createStripChart(canvas, { windowS = MIN_WINDOW_S, theme = null, events = ['railExit', 'burnout', 'apogee'], pitch = false } = {}) {
  const ctx = canvas.getContext('2d');
  let th = theme || readTheme(canvas);
  let size = { w: 1, h: 1 }, dpr = 1;
  let data = [], evts = [], tNow = 0, live = null;
  let view = { mode: 'live', marks: null, ghost: null, preview: null, fins: NaN };
  let scale = SCALES_DEG[1], shrinkSince = 0, lastMode = '';
  let grid = null;
  let prevSpot = new Map();                     // label key -> the spot it took last frame (layout stays put)
  let lastLayout = { labels: [], dropped: [], scale: scale, mode: 'live', tEnd: windowS, split: false };

  function resize(nextDpr = dpr) { dpr = nextDpr; size = fitCanvas(canvas, dpr); grid = null; }
  function setTheme(t) { th = t; }
  function setData(samples) { data = Array.isArray(samples) ? samples : []; }
  function setEvents(list) { evts = Array.isArray(list) ? list.filter((e) => events.includes(e.name) && Number.isFinite(e.t)) : []; }
  function setNow(t) { tNow = Number.isFinite(t) ? t : 0; }
  function setLive(p) { live = p && Number.isFinite(p.t) ? { t: p.t, alpha: p.alpha, theta: p.theta, v: p.v } : null; }
  /* mode 'pad' | 'live' | 'summary'; marks {railExit, gust: [t], peakT, peakAlpha, settle, settleS,
     pitch60, burnout, apogee, source}; ghost {trace, label, finScale, marks}; preview {trace, marks};
     fins the flight's fin scale (the legend names it beside a ghost) */
  function setView(v = {}) {
    view = { mode: v.mode === 'pad' || v.mode === 'summary' ? v.mode : 'live', marks: v.marks || null, ghost: v.ghost && v.ghost.trace && v.ghost.trace.length ? v.ghost : null, preview: v.preview && v.preview.trace && v.preview.trace.length ? v.preview : null, fins: finite(v.fins) ? v.fins : NaN };
  }
  const evT = (name) => { const e = evts.find((x) => x.name === name); return e ? e.t : NaN; };

  /* ---------------------------------------------------------------- occupancy grid */
  function gridFor(w, h) {
    const gw = Math.ceil(w / CELL) + 1, gh = Math.ceil(h / CELL) + 1;
    if (!grid || grid.gw !== gw || grid.gh !== gh) grid = { gw, gh, g: new Float32Array(gw * gh), s: new Float32Array((gw + 1) * (gh + 1)) };
    grid.g.fill(0);
    return grid;
  }
  function gMark(x, y, wt) {
    const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
    if (cx < 0 || cy < 0 || cx >= grid.gw || cy >= grid.gh) return;
    const k = cy * grid.gw + cx;
    if (grid.g[k] < wt) grid.g[k] = wt;
  }
  function gSeg(xa, ya, xb, yb, wt) {
    const n = Math.min(4000, Math.ceil(Math.max(Math.abs(xb - xa), Math.abs(yb - ya)) / 1.2) + 1);
    for (let k = 0; k <= n; k++) { const u = n ? k / n : 0; gMark(xa + (xb - xa) * u, ya + (yb - ya) * u, wt); }
  }
  function gPrefix() {
    const { gw, gh, g, s } = grid, W = gw + 1;
    for (let y = 0; y < gh; y++) {
      let row = 0;
      for (let x = 0; x < gw; x++) { row += g[y * gw + x]; s[(y + 1) * W + x + 1] = s[y * W + x + 1] + row; }
    }
  }
  function gSum(x, y, w, h) {
    const { gw, gh, s } = grid, W = gw + 1;
    const ax = Math.max(0, Math.floor(x / CELL)), ay = Math.max(0, Math.floor(y / CELL));
    const bx = Math.min(gw, Math.ceil((x + w) / CELL)), by = Math.min(gh, Math.ceil((y + h) / CELL));
    if (bx <= ax || by <= ay) return 0;
    return s[by * W + bx] - s[ay * W + bx] - s[by * W + ax] + s[ay * W + ax];
  }

  function draw() {
    if (!ctx) return;
    const { w, h } = size;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = th.ink900; ctx.fillRect(0, 0, w, h);
    const mode = view.mode;
    const pad = mode === 'pad' && !!view.preview;
    const showLive = mode !== 'pad';
    const x0 = PAD.l, x1 = Math.max(x0 + 40, w - (mode === 'live' ? PAD.rLive : PAD.r)), y0 = PAD.t, y1 = Math.max(y0 + 20, h - PAD.b);

    /* the traces this frame: the main one (the live flight, or the preview on the pad) and the ghost */
    const lastT = data.length ? data[data.length - 1].t : NaN;
    const tail = showLive && live && data.length && live.t > lastT ? live : null;
    const mainTr = pad ? tupleTrace(view.preview.trace) : showLive ? liveTrace(data, tail) : { n: 0 };
    const mk = (pad ? view.preview.marks : view.marks) || {};
    const ghost = showLive ? view.ghost : null;
    const gTr = ghost ? tupleTrace(ghost.trace) : null;
    // the fin choice's color, as the end plate (scene trail.js, fallback.js), the lede figure and the run
    // sketches draw their paths: finned paper, finless livery orange. The flight's (and the pad preview's)
    // fin scale is view.fins; the ghost's is its own finScale.
    const finColor = (k) => (finite(k) && k < 0.005 ? th.accent : th.paper);
    const mainCol = finColor(view.fins), ghostCol = ghost ? finColor(ghost.finScale) : th.paper;
    const gk = (ghost && ghost.marks) || {};
    // rail exit and apogee of the main trace: the events, else the marks; still on the rail when
    // the flight has events but no rail exit yet; no rail at all for a flight without events
    const anyEvents = evts.length > 0;
    let railT = pad ? mk.railExit : firstOf(evT('railExit'), mk.railExit);
    if (!finite(railT)) railT = pad || !anyEvents ? -Infinity : Infinity;
    const apoT = pad ? firstOf(mk.apogee, Infinity) : firstOf(evT('apogee'), mode === 'summary' ? mk.apogee : NaN, Infinity);
    const tMain = pad ? (mainTr.n ? mainTr.t(mainTr.n - 1) : 0) : tNow;
    const gApo = ghost ? firstOf(gk.apogee, gTr.n ? gTr.t(gTr.n - 1) : NaN, 0) : 0;
    const tEnd = Math.max(windowS, finite(apoT) ? apoT : 0, pad ? tMain : (mode === 'summary' ? 0 : tNow), gApo, mode === 'live' && finite(mk.apogee) ? mk.apogee : 0);

    /* x: two linear parts with a break, or one */
    const W = x1 - x0;
    const split = W >= SPLIT_MIN_W && tEnd > SPLIT_S * 1.6;
    const segs = split
      ? [{ t0: 0, t1: SPLIT_S, a: x0, b: x0 + SPLIT_FRAC * W - BREAK_GAP / 2 }, { t0: SPLIT_S, t1: tEnd, a: x0 + SPLIT_FRAC * W + BREAK_GAP / 2, b: x1 }]
      : [{ t0: 0, t1: tEnd, a: x0, b: x1 }];
    const segOf = (t) => (t <= segs[0].t1 || segs.length === 1 ? segs[0] : segs[1]);
    const Xs = (sg, t) => sg.a + ((t - sg.t0) / (sg.t1 - sg.t0)) * (sg.b - sg.a);
    const X = (t) => Xs(segOf(t), t);

    /* y: the counted angle of the traces shown (and pitch with opts.pitch) */
    const counted = (tr, i, peakAbs, rT) => {
      const t = tr.t(i), v = tr.v(i);
      if (!(t >= rT)) return false;
      if (SCALE_RAIL_S > 0 && t <= rT + SCALE_RAIL_S) return true;
      if (finite(v)) return v >= SCALE_MIN_V;
      return Math.abs(tr.a(i)) <= peakAbs + 1e-6;          // a trace without airspeed: past its peak the angle is uncounted
    };
    let maxAbs = 0;
    const scanTr = (tr, rT, aT, peakAbs, upTo) => {
      for (let i = 0; i < tr.n; i++) {
        const t = tr.t(i);
        if (t > aT + 1e-9 || t > upTo + 1e-9) break;
        const a = Math.abs(tr.a(i));
        if (Number.isFinite(a) && counted(tr, i, peakAbs, rT) && a > maxAbs) maxAbs = a;
        if (pitch && !pad && tr === mainTr) { const p = Math.abs(tr.th(i)); if (Number.isFinite(p) && p > maxAbs) maxAbs = p; }
      }
    };
    const mPeak = finite(mk.peakAlpha) ? mk.peakAlpha : Infinity;
    scanTr(mainTr, railT, apoT, mPeak, pad ? Infinity : tNow + 1e-6);
    if (finite(mk.peakAlpha) && (pad || mk.source === 'plan' || mode === 'summary')) maxAbs = Math.max(maxAbs, mk.peakAlpha);   // the pre-flight knows the peak from ignition: the range holds from the start
    if (ghost) { scanTr(gTr, firstOf(gk.railExit, -Infinity), firstOf(gk.apogee, Infinity), finite(gk.peakAlpha) ? gk.peakAlpha : Infinity, Infinity); if (finite(gk.peakAlpha)) maxAbs = Math.max(maxAbs, gk.peakAlpha); }
    const want = SCALES_DEG.find((s) => s >= maxAbs * 1.12) || SCALES_DEG[SCALES_DEG.length - 1];
    const now = performance.now();
    if (mode !== 'live' || mode !== lastMode) { scale = want; shrinkSince = 0; }
    else if (want > scale) { scale = want; shrinkSince = 0; }
    else if (want < scale) { shrinkSince ||= now; if (now - shrinkSince > SHRINK_HOLD_MS) { scale = want; shrinkSince = 0; } }
    else shrinkSince = 0;
    lastMode = mode;
    const Y = (deg) => y0 + (1 - (deg / scale + 1) / 2) * (y1 - y0);

    gridFor(w, h);
    ctx.font = `10px ${th.mono}`;

    /* grid: zero, half and full range lines, broken at the axis break */
    ctx.lineWidth = 1;
    for (const f of [-1, -0.5, 0, 0.5, 1]) {
      const y = Math.round(Y(f * scale)) + 0.5;
      ctx.strokeStyle = f === 0 ? th.a18 : th.a08;
      ctx.beginPath();
      for (const sg of segs) { ctx.moveTo(sg.a, y); ctx.lineTo(sg.b, y); }
      ctx.stroke();
      if (f !== 0.5 && f !== -0.5) {
        ctx.fillStyle = th.a70; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        ctx.fillText(f === 0 ? '0°' : `${fixed(f * scale, 0, true).trim()}°`, x0 - 4, y);   // the unit rides on the axis labels, so the band is free from the left edge
      }
    }
    /* time ticks: half seconds in the first part (labels on the whole seconds), then a step
       that keeps the labels 40 px apart; a break mark in the axis between the parts */
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    const labeled = [];
    for (const sg of segs) {
      const pxPerS = (sg.b - sg.a) / (sg.t1 - sg.t0);
      const minor = sg.t0 === 0 && split ? 0.5 : pxPerS >= 60 ? 0.5 : 1;
      const step = [0.5, 1, 2, 5, 10].find((s) => s * pxPerS >= 36 && (s >= 1 || minor === 0.5)) || 10;
      for (let k = Math.ceil(sg.t0 / minor - 1e-9), n = 0; k * minor <= sg.t1 + 1e-9 && n < MAX_TICKS; k++, n++) {
        const s = Math.round(k * minor * 1000) / 1000;
        if (split && sg !== segs[0] && s <= SPLIT_S + 1e-9) continue;      // the break's own second is labeled once
        const x = Math.round(Xs(sg, s)) + 0.5;
        const major = Math.abs(s / step - Math.round(s / step)) < 1e-6;
        ctx.strokeStyle = th.a08; ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke();
        ctx.strokeStyle = major ? th.a45 : th.a18; ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x, y1 + (major ? 3 : 2)); ctx.stroke();
        if (major && s > 0) {
          const lx = split && sg === segs[0] && Math.abs(s - SPLIT_S) < 1e-9 ? (segs[0].b + segs[1].a) / 2 : x;
          const label = 'T+' + (Math.abs(s - Math.round(s)) < 1e-9 ? String(Math.round(s)) : s.toFixed(1));
          const lw = ctx.measureText(label).width;
          if (lx - lw / 2 > x0 - 4 && lx + lw / 2 < w - 2 && labeled.every((q) => Math.abs(q - lx) > lw + 6)) { ctx.fillStyle = th.a70; ctx.fillText(label, lx, h - 4); labeled.push(lx); }
        }
      }
    }
    if (split) {
      const xa = segs[0].b, xb = segs[1].a;
      ctx.strokeStyle = th.a45; ctx.lineWidth = 1;
      ctx.beginPath();
      for (const xx of [xa, xb]) { ctx.moveTo(xx - 2, y1 + 4); ctx.lineTo(xx + 2, y1 - 4); }
      ctx.stroke();
    }

    /* the band: the y unit on the left; the legend and the source tag on the right (the
       longest set that fits in 60 percent of the band); event labels may use the rest */
    ctx.textBaseline = 'middle';
    const wGhost = ghost ? (ghost.label ? String(ghost.label).toUpperCase() : finWords(ghost.finScale)) : '';
    const legendSets = [];
    const sw = (kind) => ({ kind });
    const W2 = (a, b) => `${a} / ${b}`;
    // the pad names its quantity too (the angle of attack), longest set that fits first
    if (pad) legendSets.push([[sw('preview'), W2(CHART_WORDS.aoa, CHART_WORDS.preview)], [null, CHART_WORDS.sim]], [[sw('preview'), W2(CHART_WORDS.aoaShort, CHART_WORDS.preview)], [null, CHART_WORDS.sim]], [[sw('preview'), W2(CHART_WORDS.aoaShort, CHART_WORDS.previewShort)], [null, CHART_WORDS.sim]]);
    else if (ghost) {
      const wMain = finWords(view.fins) || CHART_WORDS.aoa;
      legendSets.push([[sw('main'), wMain], [sw('ghost'), wGhost], [null, `${CHART_WORDS.both} / ${CHART_WORDS.sim}`]], [[sw('main'), wMain], [sw('ghost'), wGhost], [null, CHART_WORDS.sim]]);
    } else {
      // the swatch's color is the fin choice's (paper finned, orange finless): the long form names it
      const wMain = finWords(view.fins);
      if (wMain) legendSets.push([[sw('main'), W2(CHART_WORDS.aoa, wMain)], [null, CHART_WORDS.sim]]);
      legendSets.push([[sw('main'), CHART_WORDS.aoa], [null, CHART_WORDS.sim]], [[sw('main'), CHART_WORDS.aoaShort], [null, CHART_WORDS.sim]]);
    }
    if (pitch && !pad) for (const set of legendSets) set.splice(set.length - 1, 0, [sw('pitch'), CHART_WORDS.pitch]);
    const setW = (set) => set.reduce((acc, [s, text]) => acc + (s ? 16 : 0) + ctx.measureText(text).width + 14, -14);
    const bandW = w - META_GUTTER - x0;
    const legend = legendSets.find((set) => setW(set) <= bandW * 0.6) || legendSets[legendSets.length - 1];
    const legW = setW(legend);
    const legX = w - META_GUTTER - legW;
    {
      ctx.textAlign = 'left';
      let lx = legX;
      for (const [s, text] of legend) {
        if (s) { swatch(s.kind, lx, 10); lx += 16; }
        ctx.fillStyle = th.a70; ctx.fillText(text, lx, 10);
        lx += ctx.measureText(text).width + 14;
      }
    }
    const bandEnd = legX - 12;
    function swatch(kind, x, y) {
      ctx.save();
      if (kind === 'main') { ctx.fillStyle = mainCol; ctx.fillRect(x, y - 1, 12, 2); }
      else if (kind === 'preview') { ctx.globalAlpha = 0.5; ctx.fillStyle = mainCol; ctx.fillRect(x, y - 1, 12, 2); }
      else if (kind === 'ghost') { ctx.globalAlpha = 0.55; ctx.fillStyle = ghostCol; ctx.fillRect(x, y - 1, 12, 2); }
      else if (kind === 'pitch') { ctx.fillStyle = th.ink200; ctx.fillRect(x, y - 1, 5, 2); ctx.fillRect(x + 7, y - 1, 5, 2); }   // dashed, apart from a paper trace
      ctx.restore();
    }

    /* the traces: the ghost first (dim, its fin color), the main trace on top (its fin color). Each
       point is on the rail (dim, dashed), counted (solid), slow (dim, dashed) or past apogee (not drawn). */
    const STYLE = {
      main: { solid: [mainCol, 1, 2, null], dim: [mainCol, 0.55, 1.5, [3, 3]] },
      preview: { solid: [mainCol, 0.5, 1.5, null], dim: [mainCol, 0.32, 1.25, [3, 3]] },
      ghost: { solid: [ghostCol, 0.5, 1.5, null], dim: [ghostCol, 0.3, 1.25, [3, 3]] },
      pitch: { solid: [th.ink200, 1, 1.5, [5, 3]], dim: [th.ink200, 1, 1.5, [5, 3]] },   // lab only: dashed, apart from a paper trace
    };
    const WEIGHT = { main: 6, preview: 4, ghost: 3, pitch: 3 };
    const ends = [];
    function drawTrace(tr, key, rT, aT, peakAbs, upTo, getV = (i) => tr.a(i)) {
      if (!tr || !tr.n) return null;
      const kindAt = (i) => { const t = tr.t(i); return t < rT ? 'dim' : t > aT + 1e-9 ? 'off' : counted(tr, i, peakAbs, rT) ? 'solid' : 'dim'; };
      let last = null;
      for (const sg of segs) {
        ctx.save();
        ctx.beginPath(); ctx.rect(sg.a, y0 - 1, sg.b - sg.a, y1 - y0 + 2); ctx.clip();
        let i = Math.max(0, lowerBound(tr, sg.t0) - 1);
        let style = null, pv = NaN, open = false;
        const flush = () => { if (open) { ctx.stroke(); open = false; } };
        let px = NaN, py = NaN;
        for (let n = 0; i < tr.n && n < 20000; i++, n++) {
          const t = tr.t(i);
          if (t > upTo + 1e-9) break;
          const k = key === 'pitch' ? (t > aT + 1e-9 ? 'off' : 'solid') : kindAt(i);
          if (k === 'off') break;
          const v = getV(i);
          if (!Number.isFinite(v)) { flush(); px = NaN; continue; }
          const jump = Math.abs(v - pv) > 180;           // an angle wrapping through +-180 deg is a jump, not a line
          pv = v;
          const x = Xs(sg, t), y = Y(v);
          if (k !== style || !open || jump) {
            flush();
            style = k;
            const [col, alpha, lw, dash] = STYLE[key][k];
            ctx.strokeStyle = col; ctx.globalAlpha = alpha; ctx.lineWidth = lw; ctx.setLineDash(dash || []);
            ctx.lineJoin = 'round'; ctx.lineCap = dash ? 'butt' : 'round';
            ctx.beginPath();
            if (Number.isFinite(px) && !jump) { ctx.moveTo(px, py); ctx.lineTo(x, y); } else ctx.moveTo(x, y);
            open = true;
          } else ctx.lineTo(x, y);
          if (Number.isFinite(px) && !jump && x >= sg.a - 2 && x <= sg.b + 2 && !((py < y0 && y < y0) || (py > y1 && y > y1))) gSeg(px, Math.max(y0, Math.min(y1, py)), x, Math.max(y0, Math.min(y1, y)), k === 'solid' ? WEIGHT[key] : WEIGHT[key] / 2);
          px = x; py = y;
          if (t >= sg.t0 - 1e-9 && t <= sg.t1 + 1e-9) last = { x, y, v, t, k };   // the end dot sits in the part of the axis that holds its time
          if (t > sg.t1) break;
        }
        flush();
        ctx.restore();
      }
      return last;
    }
    if (ghost) drawTrace(gTr, 'ghost', firstOf(gk.railExit, -Infinity), firstOf(gk.apogee, Infinity), finite(gk.peakAlpha) ? gk.peakAlpha : Infinity, Infinity);
    if (pitch && showLive) { const e = drawTrace(mainTr, 'pitch', -Infinity, apoT, Infinity, tNow + 1e-6, (i) => mainTr.th(i)); if (e && mode === 'live') ends.push({ key: 'theta', color: th.ink200, ...e }); }
    const mainEnd = drawTrace(mainTr, pad ? 'preview' : 'main', railT, apoT, mPeak, pad ? Infinity : tNow + 1e-6);
    if (mainEnd && mode === 'live') ends.push({ key: 'alpha', color: mainCol, ...mainEnd });

    /* the word ticks of the main trace (and none for the ghost: its label names it) */
    const reveal = (t) => finite(t) && (mode !== 'live' || t <= tNow + 1e-6);
    const boT = pad ? mk.burnout : firstOf(evT('burnout'), mk.burnout);
    // where the climb's tail goes dim and dashed (under SCALE_MIN_V near apogee): the first uncounted
    // sample after rail exit, burnout and the peak, up to apogee (and up to now in flight)
    let slowT = NaN;
    if (mainTr.n && finite(railT)) {
      const from = Math.max(railT, finite(boT) ? boT : -Infinity, finite(mk.peakT) ? mk.peakT : -Infinity);
      const upTo = Math.min(apoT, pad ? Infinity : tNow + 1e-6);
      for (let i = lowerBound(mainTr, from), n = 0; i < mainTr.n && n < 20000; i++, n++) {
        const t = mainTr.t(i);
        if (t > upTo + 1e-9) break;
        if (t > from && !counted(mainTr, i, mPeak, railT)) { slowT = t; break; }
      }
    }
    const ticks = [];                               // {key, t, x}
    const labels = [];                              // {key, lines, prio, anchor}
    const gusts = (Array.isArray(mk.gust) ? mk.gust : finite(mk.gust) ? [mk.gust] : []).filter((t) => finite(t) && t <= apoT + 1e-9);
    const unstable = finite(mk.pitch60);
    gusts.forEach((t, i) => { if (reveal(t)) { ticks.push({ key: `gust${i}`, t }); labels.push({ key: `gust${i}`, lines: [CHART_WORDS.gust], prio: 5, kind: 'tick', t, pref: 'top' }); } });
    // the peak: shown once the trace has passed it (live), at the card's value
    let peak = null;
    if (finite(mk.peakAlpha) && mk.peakAlpha > 0.05 && finite(mk.peakT) && reveal(mk.peakT + (mode === 'live' ? 0.02 : 0))) {
      const i = nearest(mainTr, mk.peakT);
      const sgn = i >= 0 && mainTr.a(i) < 0 ? -1 : 1;
      peak = { t: mk.peakT, deg: sgn * mk.peakAlpha };
      labels.push({ key: 'peak', lines: [CHART_WORDS.peak(mk.peakAlpha.toFixed(2))], prio: 1, kind: 'point', t: peak.t, deg: peak.deg });
    }
    if (!unstable && finite(mk.settle) && finite(mk.settleS) && mk.settleS > 0 && reveal(mk.settle)) {
      ticks.push({ key: 'settle', t: mk.settle });
      labels.push({ key: 'settle', lines: [CHART_WORDS.settled(mk.settleS.toFixed(2))], prio: 2, kind: 'tick', t: mk.settle, pref: 'bottom' });
    }
    if (unstable && reveal(mk.pitch60)) { ticks.push({ key: 'pitch60', t: mk.pitch60 }); labels.push({ key: 'pitch60', lines: [CHART_WORDS.pitch60], prio: 4, kind: 'tick', t: mk.pitch60, pref: 'top' }); }
    if (reveal(boT) && boT < apoT) { ticks.push({ key: 'burnout', t: boT }); labels.push({ key: 'burnout', lines: [CHART_WORDS.burnout], prio: 6, kind: 'tick', t: boT, pref: 'top' }); }
    if (finite(apoT) && (mode !== 'live')) {
      ticks.push({ key: 'apogee', t: apoT });
      labels.push({ key: 'apogee', lines: pad ? [CHART_WORDS.apogee] : [CHART_WORDS.apogee, CHART_WORDS.descent], prio: 0, kind: 'tick', t: apoT, pref: 'bottom', align: 'r' });
    }
    if (railT > 0 && (finite(railT) || (railT === Infinity && mode === 'live' && tNow > 0))) labels.push({ key: 'rail', lines: [CHART_WORDS.rail], prio: 3, kind: 'span', t: 0, t1: Math.min(railT, mode === 'live' ? Math.max(tNow, 0.05) : railT) });
    if (ghost && wGhost) labels.push({ key: 'ghost', lines: [wGhost], prio: 7, kind: 'trace' });
    if (finite(slowT) && slowT < apoT) labels.push({ key: 'slow', lines: [CHART_WORDS.slow], prio: 5.5, kind: 'slow', t: slowT, t1: Math.min(apoT, pad ? apoT : tNow) });

    const tickAlpha = pad ? th.a18 : th.a45;
    ctx.save();
    ctx.lineWidth = 1; ctx.setLineDash([2, 3]); ctx.strokeStyle = tickAlpha;
    for (const tk of ticks) {
      tk.x = Math.round(X(tk.t)) + 0.5;
      ctx.beginPath(); ctx.moveTo(tk.x, y0); ctx.lineTo(tk.x, y1); ctx.stroke();
    }
    ctx.restore();
    if (peak) {
      const px = X(peak.t), py = Y(peak.deg);
      if (py >= y0 - 1 && py <= y1 + 1) {
        ctx.save(); ctx.globalAlpha = pad ? 0.6 : 1; ctx.strokeStyle = mainCol; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(px, py, 3.5, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
        for (let a = 0; a < 8; a++) gMark(px + 4 * Math.cos(a * Math.PI / 4), py + 4 * Math.sin(a * Math.PI / 4), 6);
      }
    }
    gPrefix();

    /* the label solver */
    const rows = [];
    { const n = Math.max(1, Math.floor((y1 - y0 - 2) / ROW_H)); const gap = n > 1 ? (y1 - y0 - 14) / (n - 1) : 0; for (let k = 0; k < n; k++) rows.push(Math.round(y0 + 7 + k * gap)); }
    const zeroY = Y(0);
    const placed = [];                              // {x, y, w, h}
    const out = [], dropped = [];
    const lineW = (lines) => Math.max(...lines.map((l) => ctx.measureText(l).width));
    const overlapsPlaced = (b) => placed.some((p) => b.x < p.x + p.w + 3 && b.x + b.w + 3 > p.x && b.y < p.y + p.h && b.y + b.h > p.y);
    function scoreBox(b, lab, band) {
      if (b.x < 2 || b.x + b.w > w - 2) return Infinity;
      if (band) { if (b.x < 4 || b.x + b.w > bandEnd) return Infinity; }
      else if (b.y < y0 - 2 || b.y + b.h > y1 + 2 || b.x < x0 - 4) return Infinity;
      if (overlapsPlaced(b)) return Infinity;
      const under = band ? 0 : gSum(b.x - 1, b.y - 1, b.w + 2, b.h + 2);
      if (under > HIDE_MAX) return Infinity;           // it would hide the trace: refused
      let c = under;
      for (const tk of ticks) if (tk.key !== lab.key && tk.x > b.x && tk.x < b.x + b.w) c += 4;
      return c;
    }
    for (const lab of labels.sort((a, b) => a.prio - b.prio)) {
      const lw = lineW(lab.lines), lh = lab.lines.length * LABEL_H + (lab.lines.length - 1);
      const cands = [];
      const add = (x, y, band, extra, tag, lead) => cands.push({ x: x - 3, y: y - 1, w: lw + 6, h: lh + 2, tx: x, ty: y, band, extra, tag, lead });
      if (lab.kind === 'tick') {
        const x = X(lab.t);
        const aligns = lab.align === 'r' ? ['r', 'l'] : ['l', 'r'];
        aligns.forEach((al, ai) => {
          const tx = al === 'l' ? x + 4 : x - 4 - lw;
          if (lab.lines.length === 1) add(tx, 10 - 6, true, 1.5 + ai * 2, `b${al}`);
          rows.forEach((ry, ri) => {
            const top = ry - 6;
            if (top + lh > y1 + 1) return;
            const side = ry < zeroY ? 'top' : 'bottom';
            const pref = lab.pref && side !== lab.pref ? 2.5 : 0;
            const edge = lab.pref === 'top' ? ri * 0.4 : (rows.length - 1 - ri) * 0.4;
            add(tx, top, false, ai * 2 + pref + edge, `r${ri}${al}`);
          });
        });
      } else if (lab.kind === 'point') {
        const px = X(lab.t), py = Y(lab.deg);
        const up = lab.deg >= 0;
        // beside the point, then above or below it, then any row with a leader
        add(px + 8, py - lh / 2, false, 0, 'pr');
        add(px - 8 - lw, py - lh / 2, false, 1.5, 'pl');
        add(px - lw / 2, up ? py - 9 - lh : py + 9, false, 0.5, 'pv');
        add(px + 6, up ? py - 8 - lh : py + 8, false, 0.8, 'pvr');
        add(px + 8, 10 - 6, true, 3, 'pb', true);
        rows.forEach((ry, ri) => add(px + 8, ry - 6, false, 2 + Math.abs(ry - py) / ROW_H, `p${ri}`, true));
      } else if (lab.kind === 'span') {
        const xa = X(lab.t), xb = X(lab.t1);
        add(xa + 2, zeroY - 5 - lh, false, -0.5, 'sza');     // just above the segment (on the rail it lies on the zero line)
        add(xa + 2, zeroY + 5, false, -0.3, 'szb');
        rows.forEach((ry, ri) => {
          const top = ry - 6;
          const near = Math.abs(ry - zeroY) / ROW_H;
          add(xa + 2, top, false, near * 0.8, `s${ri}`);
          if (xb - xa > lw + 8) add((xa + xb - lw) / 2, top, false, near * 0.8 + 0.3, `sc${ri}`);
        });
        add(xa + 2, 10 - 6, true, 4, 'sb');
      } else if (lab.kind === 'slow') {
        // beside the dashed climb: ending at its start (over the flat coast before it), starting at it, or
        // ending at apogee; rows away from the zero line first, then the band
        const xa = X(lab.t), xb = X(Math.max(lab.t, lab.t1));
        rows.forEach((ry, ri) => {
          const top = ry - 6;
          if (top + lh > y1 + 1) return;
          const far = Math.abs(ry - zeroY) / ROW_H;
          add(xa - 4 - lw, top, false, 0.6 - far * 0.1, `w${ri}l`);
          add(xa + 4, top, false, 0.4 - far * 0.1, `w${ri}r`);
          add(xb - 4 - lw, top, false, 0.9 - far * 0.1, `w${ri}e`);
        });
        add(xa - 4 - lw, 10 - 6, true, 2.5, 'wbl');
        add(xa + 4, 10 - 6, true, 2.5, 'wbr');
      } else if (lab.kind === 'trace' && gTr && gTr.n) {
        const tA = Math.max(0.3, firstOf(gk.railExit, 0) + 0.3), tB = Math.min(gApo, tEnd) - 0.2;
        for (let k = 0; k < 14; k++) {
          const t = tB - (k / 13) * (tB - tA);
          const i = nearest(gTr, t);
          if (i < 0) continue;
          const tx = X(gTr.t(i)), ty = Y(gTr.a(i));
          if (!(ty > y0 && ty < y1)) continue;
          add(tx, ty - 6 - lh, false, k * 0.15, `g${k}a`);
          add(tx, ty + 6, false, k * 0.15 + 0.4, `g${k}b`);
        }
      }
      let best = null, bestC = Infinity;
      const prev = prevSpot.get(lab.key);
      for (const cd of cands) {
        let c = scoreBox(cd, lab, cd.band);
        if (!Number.isFinite(c)) continue;
        c += cd.extra;
        if (prev && prev === cd.tag) c -= 2.5;
        if (c < bestC) { bestC = c; best = cd; }
      }
      if (!best || (bestC > DROP_COST && lab.prio > 0)) { dropped.push(lab.key); prevSpot.delete(lab.key); continue; }
      placed.push(best);
      prevSpot.set(lab.key, best.tag);
      out.push({ lab, box: best, cost: bestC });
    }
    for (const k of [...prevSpot.keys()]) if (!labels.some((l) => l.key === k)) prevSpot.delete(k);

    /* labels on their ink plates, over the traces; a leader to the peak when it sits apart */
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    for (const { lab, box } of out) {
      if (lab.kind === 'point' && box.lead) {
        const px = X(lab.t), py = Y(lab.deg);
        const lx = box.x, ly = Math.max(box.y, Math.min(box.y + box.h, py));
        ctx.save(); ctx.strokeStyle = pad ? th.a18 : th.a45; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(px + 4, py); ctx.lineTo(lx, ly); ctx.stroke(); ctx.restore();
      }
      ctx.fillStyle = th.ink900; ctx.fillRect(box.x, box.y, box.w, box.h);
      const col = pad || lab.kind === 'trace' || lab.kind === 'slow' ? th.a70 : th.a90;
      lab.lines.forEach((line, i) => {
        const y = box.ty + LABEL_H / 2 + i * (LABEL_H + 1);
        const m = TAG_RE.exec(line);
        const words = m ? line.slice(0, m.index) : line;
        ctx.fillStyle = col; ctx.fillText(words, box.tx, y);
        if (m) { ctx.fillStyle = col === th.a90 ? th.a70 : th.a45; ctx.fillText(line.slice(m.index), box.tx + ctx.measureText(words).width, y); }   // the tag, a step quieter
      });
    }

    /* the live end: the dot on the trace and the value beside the plot */
    const lo = y0 + 6, hi = y1 - 6;
    for (const e of ends) e.ly = Math.max(lo, Math.min(hi, e.y));
    ends.sort((a, b) => a.ly - b.ly);
    if (ends.length === 2 && ends[1].ly - ends[0].ly < 12) {
      const m = Math.max(lo + 6, Math.min(hi - 6, (ends[0].ly + ends[1].ly) / 2));
      ends[0].ly = m - 6; ends[1].ly = m + 6;
    }
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    for (const e of ends) {
      if (e.y >= y0 - 1 && e.y <= y1 + 1) { ctx.fillStyle = e.color; ctx.beginPath(); ctx.arc(e.x, e.y, 2.5, 0, Math.PI * 2); ctx.fill(); }
      // the value steps back where its trace is dim (on the rail, under 50 ft/s near apogee), as the panel's readout does
      ctx.fillStyle = e.key === 'alpha' && e.k === 'solid' ? th.paper : th.a70;
      ctx.fillText(fixed(e.v, 2, true), x1 + 8, e.ly);
    }
    if (ends.length) {
      // its own tag, under the value column (above it when the value sits at the plot's foot)
      const lys = ends.map((e) => e.ly);
      let ty = Math.max(...lys) + 12;
      if (ty > y1 + 2) ty = Math.min(...lys) - 12;
      ctx.fillStyle = th.a70; ctx.fillText(CHART_WORDS.sim, x1 + 8, ty);
    }
    lastLayout = {
      mode, scale, tEnd, split, ghost: !!ghost, preview: pad,
      labels: out.map(({ lab, box, cost }) => ({ key: lab.key, text: lab.lines.join(' / '), x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.w), h: Math.round(box.h), band: !!box.band, cost: Math.round(cost * 10) / 10, under: box.band ? 0 : Math.round(gSum(box.x, box.y, box.w, box.h)) })),
      dropped,
      plot: { x0, x1, y0, y1 },
    };
  }

  function summary(units = 'degrees') {
    const mode = view.mode;
    const say = (v, d = 1) => fixed(v, d, true).trim().replace('−', 'minus ');
    const mk = (mode === 'pad' ? view.preview && view.preview.marks : view.marks) || {};
    const parts = [];
    const peakS = finite(mk.peakAlpha) && finite(mk.peakT) ? `the angle of attack peaks at ${mk.peakAlpha.toFixed(2)} ${units} at T plus ${mk.peakT.toFixed(2)} s` : '';
    const settleS = !finite(mk.pitch60) && finite(mk.settleS) && mk.settleS > 0 ? `it is back under 2 ${units} ${mk.settleS.toFixed(2)} s after the ${Array.isArray(mk.gust) ? (mk.gust.length ? 'gust' : 'rail exit') : finite(mk.gust) ? 'gust' : 'rail exit'}` : '';
    const overS = finite(mk.pitch60) ? `the pitch passes 60 degrees at T plus ${mk.pitch60.toFixed(2)} s` : '';
    const apoT = mode === 'pad' ? mk.apogee : firstOf(evT('apogee'), NaN);
    if (mode === 'pad') {
      if (!view.preview) return 'Strip chart: no flight data yet.';
      parts.push('Strip chart, a preview of the flight LAUNCH flies with these settings, flown in this tab (SIM)');
      for (const s of [peakS, settleS, overS]) if (s) parts.push(s);
      if (finite(apoT)) parts.push(`apogee at T plus ${apoT.toFixed(2)} s`);
      return parts.join('; ') + '.';
    }
    const lastSample = data.length ? data[data.length - 1] : null;
    const last = lastSample && live && live.t > lastSample.t ? live : lastSample;
    if (!last || !Number.isFinite(last.t)) return 'Strip chart: no flight data yet.';
    let s = mode === 'summary'
      ? `Strip chart of the angle of attack from T plus 0 to apogee${finite(apoT) ? ` at T plus ${apoT.toFixed(2)} s` : ''}; the descent is not plotted.`
      : `Strip chart of the angle of attack, T plus ${last.t.toFixed(1)} s: ${say(last.alpha * DEG)} ${units}.`;
    const beats = [peakS, mode === 'summary' || (finite(mk.settle) && mk.settle <= tNow) ? settleS : '', overS && (mode === 'summary' || mk.pitch60 <= tNow) ? overS : ''].filter(Boolean);
    if (beats.length) s += ` ${beats.map((b) => b[0].toUpperCase() + b.slice(1)).join('. ')}.`;
    s += ` Before rail exit, and below 50 feet per second near apogee, the trace is dashed. Computed in this tab (SIM).`;
    if (view.ghost) s += ` The dim trace is the same conditions with ${String(view.ghost.label || finWords(view.ghost.finScale)).toLowerCase()}, flown in this tab.`;
    return s;
  }

  return {
    resize, setTheme, setData, setEvents, setNow, setLive, setView, draw, summary,
    get scale() { return scale; },
    get points() { return data.length; },
    get layout() { return lastLayout; },
    destroy() { data = []; evts = []; live = null; view = { mode: 'live', marks: null, ghost: null, preview: null, fins: NaN }; prevSpot.clear(); grid = null; },
  };
}
function firstOf(...vals) { for (const v of vals) if (typeof v === 'number' && !Number.isNaN(v)) return v; return NaN; }

/* ---------------------------------------------------------------- CP / CG bar */
const BAR_PAD_X = 14;      // CSS px either side of the outline
const BAR_TICK_IN = 6;     // inch ticks under the outline, labelled every 12 in

export function createCpCgBar(canvas, { theme = null } = {}) {
  const ctx = canvas.getContext('2d');
  let th = theme || readTheme(canvas);
  let size = { w: 1, h: 1 }, dpr = 1;
  let model = { outline: null, xcp: NaN, xcg: NaN, xcpLattice: NaN, margin: NaN };

  function resize(nextDpr = dpr) { dpr = nextDpr; size = fitCanvas(canvas, dpr); }
  function set(next) { model = Object.assign({}, model, next); }

  function draw() {
    if (!ctx) return;
    const { w, h } = size;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = th.ink900; ctx.fillRect(0, 0, w, h);
    const o = model.outline;
    if (!o || !o.polys || !(o.length > 0)) return;
    const L = o.length;
    const sx = (w - 2 * BAR_PAD_X) / L;                 // px per metre
    const cy = Math.round(h * 0.47);
    const A = (a) => BAR_PAD_X + a * sx;
    // outline: body and fins share the same 1 px drawing line
    ctx.lineWidth = 1; ctx.lineJoin = 'round';
    for (const pass of ['solid', 'detail']) for (const p of o.polys) {
      if ((p.kind === 'detail') !== (pass === 'detail')) continue;
      ctx.beginPath();
      p.pts.forEach(([a, l], i) => { const x = A(a), y = cy - l * sx; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      ctx.closePath();
      if (pass === 'solid') { ctx.fillStyle = th.ink800; ctx.fill(); ctx.strokeStyle = th.a70; } else ctx.strokeStyle = th.a18;
      ctx.stroke();
    }
    // centre line (drawing convention: long dash, short dash)
    ctx.strokeStyle = th.a18; ctx.setLineDash([8, 2, 2, 2]);
    ctx.beginPath(); ctx.moveTo(A(0) - 4, cy + 0.5); ctx.lineTo(A(L) + 4, cy + 0.5); ctx.stroke(); ctx.setLineDash([]);
    // inch scale under the outline
    const yS = h - 14;
    ctx.font = `10px ${th.mono}`; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'center';
    const Lin = L / M_PER_IN;
    for (let i = 0, n = 0; i <= Lin + 1e-6 && n < MAX_TICKS; i += BAR_TICK_IN, n++) {
      const x = Math.round(A(i * M_PER_IN)) + 0.5;
      const major = i % 12 === 0;
      ctx.strokeStyle = major ? th.a45 : th.a18;
      ctx.beginPath(); ctx.moveTo(x, yS); ctx.lineTo(x, yS + (major ? 4 : 2)); ctx.stroke();
      if (major) { ctx.fillStyle = th.a70; ctx.fillText(String(i), x, h - 1); }
    }
    ctx.strokeStyle = th.a18; ctx.beginPath(); ctx.moveTo(A(0), yS + 0.5); ctx.lineTo(A(L), yS + 0.5); ctx.stroke();
    ctx.textAlign = 'right'; ctx.fillStyle = th.a70; ctx.fillText('IN', w - 1, h - 1);

    const xg = model.xcg, xp = model.xcp, xl = model.xcpLattice;
    // dimension line CG to CP above the outline, labelled with the margin
    if (Number.isFinite(xg) && Number.isFinite(xp)) {
      const gx = A(xg), px = A(xp), yD = 9;
      ctx.strokeStyle = th.a45; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(gx + 0.5, cy - 6); ctx.lineTo(gx + 0.5, yD - 3); ctx.moveTo(px + 0.5, cy - 6); ctx.lineTo(px + 0.5, yD - 3); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(gx, yD + 0.5); ctx.lineTo(px, yD + 0.5); ctx.stroke();
      arrowHead(ctx, px, yD + 0.5, gx < px ? 1 : -1, th.a45); arrowHead(ctx, gx, yD + 0.5, gx < px ? -1 : 1, th.a45);
      const label = `${fixed(model.margin, 2, true).trim()} CAL`, tag = ` ${CHART_WORDS.sim}`;   // its own tag, quiet (paper-a70)
      ctx.font = `10px ${th.mono}`; ctx.textBaseline = 'middle';
      const lw0 = ctx.measureText(label).width, tw = lw0 + ctx.measureText(tag).width;
      const mid = (gx + px) / 2;
      let tx = mid - tw / 2;
      if (Math.abs(px - gx) < tw + 10) tx = Math.max(gx, px) + 6;           // too tight between the marks: put it beside
      tx = Math.max(2, Math.min(w - tw - 2, tx));
      ctx.fillStyle = th.ink900; ctx.fillRect(tx - 3, yD - 6, tw + 6, 12);
      ctx.fillStyle = th.paper; ctx.textAlign = 'left'; ctx.fillText(label, tx, yD + 1);
      ctx.fillStyle = th.a70; ctx.fillText(tag, tx + lw0, yD + 1);
    }
    if (Number.isFinite(xl)) { ctx.strokeStyle = th.a90; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(A(xl), cy, 6, 0, Math.PI * 2); ctx.stroke(); }
    if (Number.isFinite(xp)) { ctx.fillStyle = th.accent; ctx.beginPath(); ctx.arc(A(xp), cy, 4, 0, Math.PI * 2); ctx.fill(); }
    if (Number.isFinite(xg)) cgSymbol(ctx, A(xg), cy, 5, th.paper, th.ink900);
  }

  return { resize, set, draw, setTheme(t) { th = t; }, destroy() { model = {}; } };
}

/* The CG symbol: a circle with alternating filled quadrants. */
export function cgSymbol(ctx, x, y, r, ink, ground) {
  ctx.fillStyle = ground; ctx.beginPath(); ctx.arc(x, y, r + 1, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = ink;
  for (const q of [0, 2]) { ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, r, q * Math.PI / 2 - Math.PI / 2, (q + 1) * Math.PI / 2 - Math.PI / 2); ctx.closePath(); ctx.fill(); }
  ctx.strokeStyle = ink; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
}

function arrowHead(ctx, x, y, dir, color) {
  ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - dir * 4, y - 2.5); ctx.lineTo(x - dir * 4, y + 2.5); ctx.closePath(); ctx.fill();
}
