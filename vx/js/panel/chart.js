/* chart.js: the two canvas-2D instruments of the panel.

   createStripChart(canvas, opts): angle of attack and pitch in degrees over a
   scrolling window (8 s by default), event ticks with labels (rail exit, burnout,
   apogee), 2 px lines, the ink ramp for pitch and the livery orange for angle of
   attack (the panel's one accent). The canvas is aria-hidden; summary() returns a
   sentence the panel writes to a visually hidden paragraph at most once per second.

   createCpCgBar(canvas, opts): a horizontal rocket outline (polygons in metres, see
   format.js) with the CG symbol, the Barrowman CP dot, the lattice CP ring and a
   dimension line labelled with the static margin in calibres.

   Both painters are pure with respect to the flight: the panel hands them data and
   calls draw(). Neither starts a loop. Both tolerate NaN and empty data. */
import { DEG, M_PER_IN, fixed, fitCanvas, readTheme } from './format.js';

const PAD = { l: 40, r: 58, t: 22, b: 18 };   // CSS px plot margins (y labels, end values, legend row, time row)
const SCALES_DEG = [2, 5, 10, 20, 45, 90];      // symmetric y ranges; the smallest that holds the window wins
const SHRINK_HOLD_MS = 1200;                    // a smaller range must hold this long before the axis shrinks
const EVENT_LABELS = { railExit: 'RAIL EXIT', burnout: 'BURNOUT', apogee: 'APOGEE' };

export function createStripChart(canvas, { windowS = 8, theme = null, events = Object.keys(EVENT_LABELS) } = {}) {
  const ctx = canvas.getContext('2d');
  let th = theme || readTheme(canvas);
  let size = { w: 1, h: 1 }, dpr = 1;
  let data = [], evts = [], tNow = 0;
  let scale = SCALES_DEG[1], shrinkSince = 0;
  let lastPeak = { v: 0, t: NaN };

  function resize(nextDpr = dpr) { dpr = nextDpr; size = fitCanvas(canvas, dpr); }
  function setTheme(t) { th = t; }
  function setData(samples) { data = Array.isArray(samples) ? samples : []; }
  function setEvents(list) { evts = Array.isArray(list) ? list.filter((e) => events.includes(e.name) && Number.isFinite(e.t)) : []; }
  function setNow(t) { tNow = Number.isFinite(t) ? t : 0; }

  /* first index with t >= t0 (samples are time-ordered) */
  function lowerBound(t0) {
    let lo = 0, hi = data.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (data[m].t < t0) lo = m + 1; else hi = m; }
    return lo;
  }

  function draw() {
    if (!ctx) return;
    const { w, h } = size;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const x0 = PAD.l, x1 = Math.max(x0 + 10, w - PAD.r), y0 = PAD.t, y1 = Math.max(y0 + 10, h - PAD.b);
    const tEnd = Math.max(windowS, tNow), tStart = tEnd - windowS;
    const X = (t) => x0 + ((t - tStart) / windowS) * (x1 - x0);
    const i0 = Math.max(0, lowerBound(tStart) - 1);
    const i1 = Math.min(data.length, lowerBound(tNow + 1e-6));

    // y range from the visible window, with a hold before shrinking
    let maxAbs = 0, peak = 0, peakT = NaN;
    for (let i = i0; i < i1; i++) {
      const s = data[i]; const a = Math.abs(s.alpha * DEG), p = Math.abs(s.theta * DEG);
      if (Number.isFinite(a)) { if (a > maxAbs) maxAbs = a; if (a > peak) { peak = a; peakT = s.t; } }
      if (Number.isFinite(p) && p > maxAbs) maxAbs = p;
    }
    lastPeak = { v: peak, t: peakT };
    const want = SCALES_DEG.find((s) => s >= maxAbs * 1.12) || SCALES_DEG[SCALES_DEG.length - 1];
    const now = performance.now();
    if (want > scale) { scale = want; shrinkSince = 0; }
    else if (want < scale) { shrinkSince ||= now; if (now - shrinkSince > SHRINK_HOLD_MS) { scale = want; shrinkSince = 0; } }
    else shrinkSince = 0;
    const Y = (deg) => y0 + (1 - (deg / scale + 1) / 2) * (y1 - y0);

    ctx.font = `10px ${th.mono}`;
    ctx.textBaseline = 'middle';
    // grid: zero line, half and full range lines
    ctx.lineWidth = 1;
    for (const f of [-1, -0.5, 0, 0.5, 1]) {
      const y = Math.round(Y(f * scale)) + 0.5;
      ctx.strokeStyle = f === 0 ? th.a18 : th.a08;
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
      if (f !== 0.5 && f !== -0.5) {
        ctx.fillStyle = th.a70; ctx.textAlign = 'right';
        ctx.fillText(f === 0 ? '0' : fixed(f * scale, 0, true).trim(), x0 - 6, y);
      }
    }
    // time ticks every second
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    for (let s = Math.ceil(tStart); s <= tEnd + 1e-6; s++) {
      const x = Math.round(X(s)) + 0.5;
      ctx.strokeStyle = th.a08; ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke();
      ctx.strokeStyle = th.a45; ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x, y1 + 3); ctx.stroke();
      if (x > x0 + 8 && x < x1 - 8) { ctx.fillStyle = th.a70; ctx.fillText('T+' + s, x, h - 4); }
    }
    // event ticks with labels, staggered onto two rows when they would collide
    let lastRight = -Infinity, row = 0;
    ctx.textAlign = 'left';
    for (const e of evts.slice().sort((a, b) => a.t - b.t)) {
      if (e.t < tStart || e.t > tEnd) continue;
      const x = Math.round(X(e.t)) + 0.5;
      const label = `${EVENT_LABELS[e.name] || e.name.toUpperCase()} ${e.t.toFixed(2)}`;
      const tw = ctx.measureText(label).width;
      row = x < lastRight + 6 ? (row + 1) % 2 : 0;
      ctx.strokeStyle = th.a45; ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(x, y0 - 2 + row * 0); ctx.lineTo(x, y1); ctx.stroke();
      ctx.setLineDash([]);
      const ty = row === 0 ? 10 : y0 + 10;
      const tx = Math.min(x + 4, w - tw - 2);
      ctx.fillStyle = th.ink900; ctx.fillRect(tx - 2, ty - 8, tw + 4, 11);
      ctx.fillStyle = th.a70; ctx.fillText(label, tx, ty);
      lastRight = Math.max(lastRight, tx + tw);
    }
    // the two traces: pitch first (ink), angle of attack on top (accent)
    const traces = [['theta', th.ink200], ['alpha', th.accent]];
    const ends = [];
    ctx.save();
    ctx.beginPath(); ctx.rect(x0, y0 - 1, x1 - x0, y1 - y0 + 2); ctx.clip();
    ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (const [key, color] of traces) {
      ctx.strokeStyle = color; ctx.beginPath();
      let started = false, lx = NaN, ly = NaN;
      for (let i = i0; i < i1; i++) {
        const s = data[i]; const v = s[key] * DEG;
        if (!Number.isFinite(v)) { started = false; continue; }
        const x = X(s.t), y = Y(Math.max(-scale, Math.min(scale, v)));
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
        lx = x; ly = y;
      }
      ctx.stroke();
      if (Number.isFinite(lx)) ends.push({ key, color, x: lx, y: ly, v: data[i1 - 1] ? data[i1 - 1][key] * DEG : NaN });
    }
    ctx.restore();
    // end dots and current values beside the plot, nudged apart when close
    ends.sort((a, b) => a.y - b.y);
    if (ends.length === 2 && ends[1].y - ends[0].y < 12) { const m = (ends[0].y + ends[1].y) / 2; ends[0].ly = m - 6; ends[1].ly = m + 6; }
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    for (const e of ends) {
      ctx.fillStyle = e.color; ctx.beginPath(); ctx.arc(e.x, e.y, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = e.key === 'alpha' ? th.paper : th.a70;
      ctx.fillText(fixed(e.v, 2, true), x1 + 8, Math.max(y0, Math.min(y1, e.ly ?? e.y)));
    }
    // legend row
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    let lx = x0;
    for (const [key, color, name] of [['alpha', th.accent, 'AOA'], ['theta', th.ink200, 'PITCH']]) {
      ctx.fillStyle = color; ctx.fillRect(lx, 9, 12, 2);
      ctx.fillStyle = th.a70; ctx.fillText(name, lx + 16, 10);
      lx += 16 + ctx.measureText(name).width + 14;
      void key;
    }
    ctx.fillStyle = th.a70;
    const meta = `DEG / ${windowS} S / SIM`;
    if (evts.length === 0 || lx + ctx.measureText(meta).width < X(evts[0]?.t ?? Infinity) - 8) ctx.fillText(meta, lx, 10);
  }

  function summary(units = 'degrees') {
    const last = data.length ? data[data.length - 1] : null;
    if (!last || !Number.isFinite(last.t)) return 'Strip chart: no flight data yet.';
    const a = fixed(last.alpha * DEG, 1, true).trim().replace('−', 'minus '), p = fixed(last.theta * DEG, 1, true).trim().replace('−', 'minus ');
    let s = `Strip chart, last ${windowS} seconds to T plus ${last.t.toFixed(1)} s: angle of attack ${a} ${units}, pitch ${p} ${units}.`;
    if (lastPeak.v > 0.05 && Number.isFinite(lastPeak.t)) s += ` Largest angle of attack in the window ${lastPeak.v.toFixed(1)} ${units} at T plus ${lastPeak.t.toFixed(1)} s.`;
    const seen = evts.filter((e) => e.t <= last.t).map((e) => `${(EVENT_LABELS[e.name] || e.name).toLowerCase()} at ${e.t.toFixed(2)} s`);
    if (seen.length) s += ` Events: ${seen.join(', ')}.`;
    return s;
  }

  return {
    resize, setTheme, setData, setEvents, setNow, draw, summary,
    get scale() { return scale; },
    get points() { return data.length; },
    destroy() { data = []; evts = []; },
  };
}

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
    ctx.clearRect(0, 0, w, h);
    const o = model.outline;
    if (!o || !o.polys || !(o.length > 0)) return;
    const L = o.length;
    const sx = (w - 2 * BAR_PAD_X) / L;                 // px per metre
    const cy = Math.round(h * 0.47);
    const A = (a) => BAR_PAD_X + a * sx;
    // outline: body and fins share the same 1 px drawing line
    ctx.lineWidth = 1; ctx.lineJoin = 'round';
    for (const p of o.polys) {
      ctx.beginPath();
      p.pts.forEach(([a, l], i) => { const x = A(a), y = cy - l * sx; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      ctx.closePath();
      ctx.fillStyle = th.ink800; ctx.fill();
      ctx.strokeStyle = th.a70; ctx.stroke();
    }
    // centre line (drawing convention: long dash, short dash)
    ctx.strokeStyle = th.a18; ctx.setLineDash([8, 2, 2, 2]);
    ctx.beginPath(); ctx.moveTo(A(0) - 4, cy + 0.5); ctx.lineTo(A(L) + 4, cy + 0.5); ctx.stroke(); ctx.setLineDash([]);
    // inch scale under the outline
    const yS = h - 14;
    ctx.font = `10px ${th.mono}`; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'center';
    const Lin = L / M_PER_IN;
    for (let i = 0; i <= Lin + 1e-6; i += BAR_TICK_IN) {
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
      const label = `${fixed(model.margin, 2, true).trim()} CAL`;
      ctx.font = `10px ${th.mono}`; ctx.textBaseline = 'middle';
      const tw = ctx.measureText(label).width;
      const mid = (gx + px) / 2;
      let tx = mid - tw / 2;
      if (Math.abs(px - gx) < tw + 10) tx = Math.max(gx, px) + 6;           // too tight between the marks: put it beside
      tx = Math.max(2, Math.min(w - tw - 2, tx));
      ctx.fillStyle = th.ink900; ctx.fillRect(tx - 3, yD - 6, tw + 6, 12);
      ctx.fillStyle = th.paper; ctx.textAlign = 'left'; ctx.fillText(label, tx, yD + 1);
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
