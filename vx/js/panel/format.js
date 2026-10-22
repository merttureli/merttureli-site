/* format.js: units, fixed-decimal formatters, the rocket outline in metres and a
   small idle-aware animation loop, shared by the panel files (panel.js, chart.js,
   fallback.js). Pure functions except createIdleLoop, which owns one rAF.

   Unit factors are exact by definition (STD: the 1959 international yard and pound
   agreement fixes 1 ft = 0.3048 m and 1 in = 0.0254 m; 1 lbf = 1 lbm x g_n with
   g_n = 9.80665 m/s2 per the 3rd CGPM, 1901; 1 mph = 0.44704 m/s follows). */

export const M_PER_FT = 0.3048;                       // STD, exact
export const M_PER_IN = 0.0254;                       // STD, exact
export const N_PER_LBF = 4.4482216152605;             // STD, exact (0.45359237 kg x 9.80665 m/s2)
export const PA_PER_PSF = N_PER_LBF / (M_PER_FT * M_PER_FT);  // 47.880 Pa per lbf/ft2
export const NM_PER_LBFIN = N_PER_LBF * M_PER_IN;     // 0.11298 N m per lbf in
export const MPS_PER_MPH = 0.44704;                   // STD, exact
export const DEG = 180 / Math.PI;

const MINUS = '−';   // a real minus sign, the same width as "+" in IBM Plex Mono
export const DASH = '—';

/* Fixed decimals, U+2212 for negatives, "+" when signed, an em dash when unknown.
   No thousands separator: every value on this page stays below 10,000 (FIELD 1). */
export function fixed(v, decimals = 1, signed = false) {
  if (v === null || v === undefined || !Number.isFinite(v)) return DASH;
  let s = Math.abs(v).toFixed(decimals);
  const zero = Number(s) === 0;
  if (v < 0 && !zero) return MINUS + s;
  return signed ? (zero ? ' ' : '+') + s : s;   // U+2007 figure space keeps the column when 0
}

/* T+00.000 time code (seconds, three decimals, at least two integer digits). */
export function timeCode(t) {
  if (!Number.isFinite(t)) return 'T+' + DASH;
  const neg = t < 0; const a = Math.abs(t);
  const s = a.toFixed(3).padStart(6, '0');
  return (neg ? 'T' + MINUS : 'T+') + s;
}

export const PHASES = { pad: 'PAD', rail: 'RAIL', boost: 'BOOST', coast: 'COAST', descent: 'DESCENT', done: 'DONE', hold: 'HOLD' };
export const phaseLabel = (p) => PHASES[p] || (p ? String(p).toUpperCase() : DASH);

/* Read a value that the flight module may expose as a number or as a function of
   one argument (derived.xcg(t), derived.naturalFrequency(V)). */
export function readDerived(d, key, arg) {
  if (!d) return NaN;
  const v = d[key];
  if (typeof v === 'function') { try { const r = v.call(d, arg); return typeof r === 'number' ? r : NaN; } catch { return NaN; } }
  return typeof v === 'number' ? v : NaN;
}

/* Read flight.history, whatever ring-buffer shape it has, into an ordered array of
   samples {t, theta, alpha, ...}. Returns null when nothing usable is there. */
export function readHistory(h) {
  if (!h) return null;
  try {
    if (Array.isArray(h)) return h;
    if (typeof h.toArray === 'function') return h.toArray();
    if (typeof h.samples === 'function') return h.samples();
    if (typeof h[Symbol.iterator] === 'function') return Array.from(h);
    if (typeof h.forEach === 'function') { const out = []; h.forEach((s) => out.push(s)); return out; }
    if (typeof h.length === 'number' && typeof h.get === 'function') { const out = []; for (let i = 0; i < h.length; i++) out.push(h.get(i)); return out; }
  } catch { /* a foreign ring buffer that throws is treated as absent */ }
  return null;
}

/* Read flight.events (array, iterable or ring) into [{name, t, state}]. */
export function readEvents(e) {
  const list = readHistory(e);
  return Array.isArray(list) ? list.filter((x) => x && typeof x.name === 'string') : null;
}

/* ---------------------------------------------------------------- outline in metres
   The panel draws the rocket from polygons in metres in a canonical frame:
   a = axial distance from the nose tip, positive aft; l = lateral offset from the
   body axis, positive toward the body's +x side (FIELD 2). */

/* CAD-derived defaults, used only when neither geometry nor flight.config supply a
   shape. length, diameter, nose length, fin span, fin root position and thickness
   are CAD (assembly bounds, 0.001 m per unit, FIELD 1); the fin tip chord and the
   leading-edge sweep are EST (chosen so the planform fills the 85 mm axial bound of
   parts 6 to 9 with a trailing edge square to the body). */
export const OUTLINE_DEFAULTS = {
  length: 1.1809,                 // m, CAD: nose tip y +570.7 mm to screw cap y -610.2 mm
  diameter: 0.068,                // m, CAD: body radius 34 mm
  noseLength: 0.232,              // m, CAD
  fins: { n: 4, root: 0.085, tip: 0.030, span: 0.055, sweep: 0.055, thickness: 0.00317, rootLeadingEdgeFromNose: 1.0714 },
};

/* Tangent ogive radius at axial station a (STD: r(a) = sqrt(rho^2 - (Ln - a)^2) + R - rho,
   rho = (R^2 + Ln^2) / (2R)), the profile the flight model assumes for the nose. */
export function ogiveRadius(a, R, Ln) {
  if (a <= 0) return 0;
  if (a >= Ln) return R;
  const rho = (R * R + Ln * Ln) / (2 * R);
  const d = Ln - a;
  return Math.sqrt(Math.max(0, rho * rho - d * d)) + R - rho;
}

/* Polygons from a config object: a body silhouette and the two in-plane fins,
   fins scaled by k about the root leading edge (the same rule as setFinScale). */
export function outlineFromConfig(config = {}, { finScale = 1, view = 'through' } = {}) {
  const L = num(config.length, OUTLINE_DEFAULTS.length);
  const D = num(config.diameter, OUTLINE_DEFAULTS.diameter);
  const Ln = num(config.noseLength, OUTLINE_DEFAULTS.noseLength);
  const f = Object.assign({}, OUTLINE_DEFAULTS.fins, config.fins || {});
  const R = D / 2;
  const top = [];
  const N = 20;   // ogive samples per side
  for (let i = 0; i <= N; i++) { const a = Ln * (i / N) ** 1.6; top.push([a, ogiveRadius(a, R, Ln)]); }
  top.push([L, R]);
  const body = top.concat(top.slice().reverse().map(([a, l]) => [a, -l]));
  const polys = [{ kind: 'body', pts: body }];
  const k = Math.max(0, num(finScale, 1));
  if (view !== 'between' && k > 0) {
    const le = num(f.rootLeadingEdgeFromNose, L - f.root);
    for (const s of [1, -1]) {
      polys.push({ kind: 'fin', pts: [
        [le, s * R], [le + f.sweep * k, s * (R + f.span * k)],
        [le + (f.sweep + f.tip) * k, s * (R + f.span * k)], [le + f.root * k, s * R],
      ] });
    }
  }
  return { polys, length: L, radius: R, nose: 0 };
}

/* Normalise whatever geometry.sectionPolygons returns into the canonical frame.
   Accepts an array (or {polygons}) of polygons; a polygon is an array of [x, y],
   an array of {x, y}, a flat number array, or {points|pts|polygon, kind|id|name}.
   The axial axis is the longer extent; the nose is the end whose last 6 percent of
   vertices sit closest to the axis (an ogive tip, never a fin). */
export function normalisePolygons(input) {
  let list = input && !Array.isArray(input) ? (input.polygons || input.polys || [input.body, ...(input.fins || [])].filter(Boolean)) : input;
  if (!Array.isArray(list) || !list.length) return null;
  const raw = [];
  for (const item of list) {
    const pts = toPoints(item && !Array.isArray(item) && !ArrayBuffer.isView(item) ? (item.points || item.pts || item.polygon || item.vertices) : item);
    if (pts.length >= 3) raw.push({ kind: String(item.kind || item.id || item.name || '').toLowerCase().includes('fin') ? 'fin' : 'part', pts });
  }
  if (!raw.length) return null;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of raw) for (const [x, y] of p.pts) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  const axialIsY = (maxY - minY) > (maxX - minX);
  const aMin = axialIsY ? minY : minX, aMax = axialIsY ? maxY : maxX;
  const lMid = axialIsY ? (minX + maxX) / 2 : (minY + maxY) / 2;
  const span = aMax - aMin;
  if (!(span > 0)) return null;
  // which end is the nose: compare the widest vertex within 6 % of each end
  let wLo = 0, wHi = 0;
  for (const p of raw) for (const [x, y] of p.pts) {
    const a = axialIsY ? y : x, l = Math.abs((axialIsY ? x : y) - lMid);
    if (a - aMin < 0.06 * span) wLo = Math.max(wLo, l);
    if (aMax - a < 0.06 * span) wHi = Math.max(wHi, l);
  }
  const noseAtLo = wLo <= wHi;
  // lateral sign: for a rocket along y with the nose at +y (CAD), body +x stays +x
  const polys = raw.map((p) => ({ kind: p.kind, pts: p.pts.map(([x, y]) => {
    const a0 = axialIsY ? y : x, l0 = (axialIsY ? x : y) - lMid;
    return [noseAtLo ? a0 - aMin : aMax - a0, l0];
  }) }));
  // the part with the largest area is the body
  let best = 0, bi = 0;
  polys.forEach((p, i) => { const A = Math.abs(area(p.pts)); if (A > best) { best = A; bi = i; } });
  polys.forEach((p, i) => { if (p.kind !== 'fin') p.kind = i === bi ? 'body' : 'part'; });
  let R = 0;
  for (const p of polys) if (p.kind !== 'fin') for (const [a, l] of p.pts) if (a > 0.4 * span && a < 0.8 * span) R = Math.max(R, Math.abs(l));
  return { polys, length: span, radius: R || OUTLINE_DEFAULTS.diameter / 2, nose: 0 };
}

function toPoints(src) {
  if (!src) return [];
  if (ArrayBuffer.isView(src) || (Array.isArray(src) && typeof src[0] === 'number')) {
    const out = []; for (let i = 0; i + 1 < src.length; i += 2) out.push([+src[i], +src[i + 1]]); return out.filter(okPt);
  }
  if (!Array.isArray(src)) return [];
  return src.map((p) => Array.isArray(p) || ArrayBuffer.isView(p) ? [+p[0], +p[1]] : p && typeof p === 'object' ? [+(p.x ?? p.a), +(p.y ?? p.l)] : null).filter(okPt);
}
const okPt = (p) => p && Number.isFinite(p[0]) && Number.isFinite(p[1]);
function area(pts) { let s = 0; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) s += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]); return s / 2; }
function num(v, d) { return typeof v === 'number' && Number.isFinite(v) ? v : d; }

/* Resolve the outline for a given fin scale and section view: geometry first, then
   the flight config, then the CAD defaults. Returns {polys, length, radius, source}. */
export function resolveOutline(geometry, config, opts = {}) {
  if (geometry && typeof geometry.sectionPolygons === 'function') {
    try {
      const n = normalisePolygons(geometry.sectionPolygons({ finScale: opts.finScale ?? 1, view: opts.view || 'through' }));
      if (n) return Object.assign(n, { source: 'CAD' });
    } catch { /* fall through to the config outline */ }
  }
  const o = outlineFromConfig(config || {}, opts);
  o.source = config && config.length ? 'CAD' : 'CAD';
  return o;
}

/* ---------------------------------------------------------------- idle-aware loop
   Runs fn(now, dt) on requestAnimationFrame only while there is something to
   animate. fn returns true to keep going; after `idleFrames` consecutive false
   returns the loop stops. wake() restarts it. Stops while the document is hidden. */
export function createIdleLoop(fn, { idleFrames = 20 } = {}) {
  let raf = 0, last = 0, idle = 0, destroyed = false;
  const tick = (now) => {
    raf = 0;
    if (destroyed || document.hidden) return;
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    let busy = false;
    try { busy = fn(now, dt) === true; } catch (err) { console.error('[panel] frame failed', err); busy = false; }
    idle = busy ? 0 : idle + 1;
    if (idle < idleFrames) raf = requestAnimationFrame(tick);
    else last = 0;
  };
  const wake = () => { if (destroyed || document.hidden) return; idle = 0; if (!raf) raf = requestAnimationFrame(tick); };
  const onVis = () => { if (document.hidden) { if (raf) cancelAnimationFrame(raf); raf = 0; last = 0; } else wake(); };
  document.addEventListener('visibilitychange', onVis);
  return {
    wake,
    get running() { return raf !== 0; },
    destroy() { destroyed = true; if (raf) cancelAnimationFrame(raf); raf = 0; document.removeEventListener('visibilitychange', onVis); },
  };
}

/* Size a canvas backing store to its CSS box at the given DPR. Returns the CSS size. */
export function fitCanvas(canvas, dpr) {
  const w = Math.max(1, Math.round(canvas.clientWidth));
  const h = Math.max(1, Math.round(canvas.clientHeight));
  const bw = Math.round(w * dpr), bh = Math.round(h * dpr);
  if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; }
  return { w, h };
}

/* Colours read once from the tokens so the canvases match the CSS (fallbacks are the
   token values, so a missing stylesheet still draws in the system's ink ramp). */
export function readTheme(el) {
  const cs = el ? getComputedStyle(el) : null;
  const v = (name, d) => (cs && cs.getPropertyValue(name).trim()) || d;
  return {
    ink900: v('--ink-900', '#0A0A0A'), ink800: v('--ink-800', '#141414'), ink700: v('--ink-700', '#2B2B2B'),
    ink200: v('--ink-200', '#C9C9C9'), paper: v('--paper', '#FFFFFF'),
    a90: v('--paper-a90', 'rgba(255,255,255,.90)'), a70: v('--paper-a70', 'rgba(255,255,255,.70)'),
    a45: v('--paper-a45', 'rgba(255,255,255,.45)'), a18: v('--paper-a18', 'rgba(255,255,255,.18)'),
    a08: v('--paper-a08', 'rgba(255,255,255,.08)'), accent: v('--livery', '#D63B08'),
    mono: '"IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace',
  };
}
