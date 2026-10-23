/* vx/js/geom/geom.js
   CHARGER field study: section geometry from the CAD assembly (FIELD.md section 5).

   What it produces, all lengths in metres (internal units are SI, FIELD 1):
     profile      outer radius every 2 mm from the nose tip to the aft face of the screw
                  cap, the maximum over every non-fin part (rail buttons and reference
                  envelopes left out: one-sided / not physical). The two rail buttons
                  enter the 'through' section as one-sided polygons instead.         CAD
     fin          part 6 (Fin 1) projected on its own plane, convex hull, then root
                  chord, tip chord, span, leading-edge sweep, thickness and the root
                  leading edge's distance from the nose tip.                          CAD
     refs         length, diameter, noseLength (the nose cone part, shoulder included,
                  0.232 m as FIELD 3 names it), noseExposedLength (tip to the forward
                  edge of the upper body tube, 0.200 m, where the radius first reaches
                  the body radius), finCount 4.                                       CAD
     finDefaults  {n, root, tip, span, sweep, thickness, rootLeadingEdgeFromNose} for
                  the flight config (FIELD 3).                                         CAD
     sectionPolygons({finScale, view})  the pitch-plane section as closed polygons.
     buildSection({cols, rows, finScale, view, cgM, buttons})  the lattice solid mask
                  (FIELD 4). The result goes straight into lattice.setSection(): cgCell
                  is a value {x, y} for cgM (default the PAGE CG, 22 in).

   Section frame (FIELD 2): x runs nose to tail (s, metres aft of the nose tip), y is the
   body's +x side (CAD +x, the side Fin 1 sits on). In the grid, column 0 is upstream of
   the nose, row index grows along +y, mask[row * cols + col], cell (c, r) has its
   centre at (c + 0.5, r + 0.5) in cell units.

   Sources. The measurement code is geom-measure.js; it runs live on the published
   assembly when loadFieldGeometry() is called, and the same code baked the copy in
   geom-cad.js (node geom-bake.mjs) that backs the synchronous exports, so finDefaults,
   sectionPolygons and buildSection work before (or without) a 2.5 MB fetch and in node.
   vx/js/stage/loader.js is imported lazily inside loadFieldGeometry(): it pulls in
   three.js, which needs the page's import map, so importing this file never touches
   three and never throws.

   Nothing here animates, listens or touches WebGL. geometry.destroy() drops the
   section cache and stops caching; on the shared baked geometry (getBakedGeometry(),
   behind the synchronous exports) it only clears the cache, so one caller cannot slow
   every other. The module honours reduced motion trivially. */
import { CAD } from './geom-cad.js';
import { measureAssembly } from './geom-measure.js';

export const IN_M = 0.0254;                 // STD: international inch, exact
export const SPAN_FRACTION = 0.66;          // FIELD 5: rocket length / grid width
export const NOSE_COL_FRACTION = 0.12;      // FIELD 5: nose tip at column 0.12 cols
export const DEFAULT_COLS = 1024;           // FIELD 4: tier 3 grid
export const DEFAULT_ROWS = 320;            // FIELD 4: tier 3 grid
export const GRID_ASPECT = DEFAULT_ROWS / DEFAULT_COLS; // rows per column at every tier (320/1024, 240/768, 160/512)
export const SDF_BAND = 4;                  // cells: signed distance exact within this band, clamped to +-4 beyond
export const SLAB_HALF_CELLS = 1;           // FIELD 5: edge-on fins as 2-cell slabs, 1 cell each side of the axis
export const FIN_SCALE_MAX = 1.5;           // EST: upper limit accepted for finScale (0 removes the fins)
export const OUTLINE_TOL_M = 5e-6;          // 5 um Douglas-Peucker tolerance on the body outline; the finest cell is 1.75 mm
export const VIEWS = Object.freeze(['through', 'between']);
const ON_EDGE = 1e-9;                       // cells: a centre this close to an edge lies on it and counts as solid (closed polygons)
const SOLID_SDF_MIN = 1e-6;                 // cells: smallest |sdf| written for a solid cell, so sdf < 0 always marks it (never -0)
const CACHE_MAX = 6;                        // sections kept per geometry

/* PAGE figures (projects/charger.html design review, FIELD 1). The fins there are the
   three-fin design; the CAD is the final four-fin configuration (owner's decision). */
export const PAGE_FIGURES = Object.freeze({
  lengthIn: 37, diameterIn: 2.63, finRootIn: 2.76, finHeightIn: 2.36, finSweepIn: 2.17, finCount: 3, cgFromNoseIn: 22,
});
export const DEFAULT_CG_M = PAGE_FIGURES.cgFromNoseIn * IN_M; // PAGE: CG 22 in from the nose = 0.5588 m

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/* ---------- geometry object ---------- */

/* Measured data from the baked CAD copy, in the shape measureAssembly() returns. */
function bakedMeasured() {
  const n = CAD.radiusUm.length;
  const s = new Float64Array(n), r = new Float64Array(n);
  for (let i = 0; i < n; i++) { s[i] = Math.min(i * CAD.step, CAD.length); r[i] = CAD.radiusUm[i] * 1e-6; }
  s[n - 1] = CAD.length;
  return {
    profile: { step: CAD.step, s, r, length: CAD.length, noseTipY: CAD.noseTipY, tailY: CAD.tailY, binScale: CAD.binScale, parts: CAD.profileParts.slice() },
    fin: { ...CAD.fin, hull: CAD.fin.hull.map(p => p.slice()) },
    features: { ...CAD.features, railButtons: CAD.features.railButtons.slice(), railButtonBounds: (CAD.features.railButtonBounds || []).map(b => ({ ...b, across: b.across.slice() })) },
  };
}

/* Douglas-Peucker on an open polyline [[x, y], ...]; keeps both ends. */
function simplify(points, tol) {
  const keep = new Uint8Array(points.length); keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = points[a], [bx, by] = points[b];
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
    let worst = -1, at = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((points[i][0] - ax) * dy - (points[i][1] - ay) * dx) / len;
      if (d > worst) { worst = d; at = i; }
    }
    if (worst > tol) { keep[at] = 1; stack.push([a, at], [at, b]); }
  }
  return points.filter((_, i) => keep[i]);
}

function makeGeometry(m, meta = {}) {
  const { profile: p, fin: f, features } = m;
  let radius = 0;
  for (const r of p.r) if (r > radius) radius = r;
  const profile = Object.freeze({
    step: p.step, s: p.s, r: p.r, length: p.length, samples: p.s.length, tag: 'CAD',
    /* radius at s (m aft of the nose tip), linear between samples, 0 outside */
    radiusAt(s) {
      if (!(s >= 0 && s <= p.length)) return 0;
      const i = Math.min(p.s.length - 2, Math.floor(s / p.step));
      const t = (s - p.s[i]) / ((p.s[i + 1] - p.s[i]) || 1);
      return p.r[i] + (p.r[i + 1] - p.r[i]) * clamp(t, 0, 1);
    },
  });
  const refs = Object.freeze({
    length: p.length,                  // nose tip to the aft face of the screw cap
    diameter: 2 * radius,              // largest outer diameter (body tubes)
    radius,
    noseLength: features.noseConeAft,         // the nose cone part, shoulder included: FIELD 3's noseLength 0.232 (CAD, ogive)
    noseExposedLength: features.noseShoulder, // exposed nose: tip to the forward edge of the upper tube, where r first reaches the body radius
    finCount: 4,
    tag: 'CAD',
  });
  const fin = Object.freeze({ ...f, hull: Object.freeze(f.hull.map(q => Object.freeze(q.slice()))), tag: 'CAD' });
  const finDefaults = Object.freeze({
    n: 4, root: f.root, tip: f.tip, span: f.span, sweep: f.sweep, thickness: f.thickness, rootLeadingEdgeFromNose: f.rootLeadingEdgeFromNose,
  });
  // upper half of the body outline, nose tip to aft face, collinear samples dropped
  const half = [];
  for (let i = 0; i < p.s.length; i++) half.push([p.s[i], p.r[i]]);
  const outline = simplify(half, OUTLINE_TOL_M);
  const ctx = { profile, refs, fin, features, outline };
  /* masks: rasterised sections keyed without the CG; sections: the same objects
     with cgM / cgCell attached, so a CG change reuses the mask instead of
     re-rasterising. */
  const masks = new Map(), sections = new Map();
  const shared = !!meta.shared;
  let destroyed = false;
  const remember = (map, key, value) => {
    if (destroyed) return value;
    map.set(key, value);
    if (map.size > CACHE_MAX) map.delete(map.keys().next().value);
    return value;
  };
  const geometry = {
    source: meta.source || 'cad-baked',
    error: meta.error || null,
    timing: { fetchMs: meta.fetchMs ?? 0, measureMs: meta.measureMs ?? 0 },
    profile, fin, finDefaults, refs,
    features: Object.freeze({ ...features }),
    outline,
    page: compareWithPage(refs, fin),
    check: null,
    sectionPolygons: (opts) => polygonsFor(ctx, opts),
    buildSection(opts) {
      const o = normOpts(opts);
      const mk = maskKey(o), sk = `${mk}|${o.cgM.toFixed(7)}`;
      const hit = destroyed ? undefined : sections.get(sk);
      if (hit) return hit;
      const base = (destroyed ? undefined : masks.get(mk)) || remember(masks, mk, rasterise(ctx, o));
      return remember(sections, sk, withCg(base, o.cgM));
    },
    /* Drops the cache. A geometry the caller made (loadFieldGeometry) also stops
       caching; the shared baked geometry keeps working as before. */
    destroy() { if (!shared) destroyed = true; masks.clear(); sections.clear(); },
  };
  return geometry;
}

/* null, undefined, '' and whitespace mean "not given" (a raw URLSearchParams.get()
   is null when the parameter is absent); NaN falls back too; +-Infinity clamp. */
const blank = (v) => v == null || (typeof v === 'string' && v.trim() === '');
function normOpts(opts) {
  opts = opts || {};
  const cols = Math.max(32, Math.round(Number(opts.cols) || DEFAULT_COLS));
  const rows = Math.max(16, Math.round(Number(opts.rows) || Math.round(cols * GRID_ASPECT)));
  const kRaw = blank(opts.finScale) ? 1 : Number(opts.finScale);
  const k = Number.isNaN(kRaw) ? 1 : clamp(kRaw, 0, FIN_SCALE_MAX);
  const view = opts.view === 'between' ? 'between' : 'through';
  const cgRaw = blank(opts.cgM) ? DEFAULT_CG_M : Number(opts.cgM);
  const cgM = Number.isFinite(cgRaw) ? cgRaw : DEFAULT_CG_M;
  return { cols, rows, finScale: k, view, mirror: opts.mirror !== false, buttons: opts.buttons !== false, cgM };
}
/* cache key of the mask: everything that changes the cells (not the CG) */
function maskKey(o) {
  return `${o.cols}x${o.rows}|${o.finScale.toFixed(5)}|${o.view}|${o.mirror ? 'm' : 'f'}|${o.buttons ? 'b' : 'n'}`;
}
/* A section for one CG position: the rasterised section plus cgM, xCg and cgCell as
   plain values (FIELD 4: lattice.setSection({mask, cols, rows, dCells, cgCell})). */
function withCg(base, cgM) {
  const x = base.xNoseCol + cgM / base.cellM;
  return { ...base, cgM, xCg: x, cgCell: Object.freeze({ x, y: base.axisRow }) };
}

/* ---------- polygons ---------- */

/* The pitch-plane section as closed polygons in metres: [{id, kind, points: [[x, y]]}]
   with x aft of the nose tip and y toward the body's +x side.
     body  the measured outline, upper half then mirrored lower half
     fin   'through' only: Fin 1 (y > 0) and Fin 3 (y < 0) planforms, scaled by
           finScale about the root leading edge: s' = sLE + k (s - sLE), h' = k h,
           with h the height above the root line (r = rootRadius)
     edge  'through' only: Fin 2 and Fin 4, which stand normal to the plane, as seen
           edge-on: slabs on the axis, as long as the scaled fin's axial extent, half
           width slabHalfWidth (default half the measured thickness; buildSection uses
           1 cell). Both project onto the same band about the axis.
     seat  only when finScale > 1 pushes the root trailing edge past the aft edge of the
           body tube, where the airframe is narrower than the root line: a block from
           the axis to the root line under the overhanging root, clipped at the aft
           face, so the scaled fin stays attached. EST; absent for finScale <= 1.
     button  'through' only (and unless buttons: false): rail buttons 1 and 2 (parts
           10, 11) stand on CAD -x, the Fin 3 side, and straddle CAD z = 0, so they
           cross this plane at y < 0. Each is the rectangle of its part bounds, from
           the tube surface out to its top: bounds CAD, rectangular shape EST. They
           do not cross the 'between' plane (45 degrees off, |z| <= 4.85 mm there).
           Marked oneSided: true; they are not mirrored and are not scaled by finScale.
   Every other polygon is mirror-symmetric about the axis by construction. */
function polygonsFor(ctx, opts) {
  opts = opts || {};
  const { finScale: k, view, buttons } = normOpts(opts);
  const { outline, fin, features, refs } = ctx;
  const polys = [];
  const body = outline.map(([s, r]) => [s, r]);
  for (let i = outline.length - 1; i >= 0; i--) {
    const [s, r] = outline[i];
    if (r === 0 && (i === 0 || i === outline.length - 1)) continue; // the tip (or a pointed tail) is shared by both halves
    body.push([s, -r]);
  }
  polys.push({ id: 'body', kind: 'body', points: body });
  if (view === 'through' && k > 0) {
    const sLE = fin.rootLeadingEdgeFromNose, R0 = fin.rootRadius;
    const scaled = fin.hull.map(([s, h]) => [sLE + k * (s - sLE), k * h]);
    polys.push({ id: 'fin-1', kind: 'fin', points: scaled.map(([s, h]) => [s, R0 + h]) });
    polys.push({ id: 'fin-3', kind: 'fin', points: scaled.map(([s, h]) => [s, -(R0 + h)]).reverse() });
    let sMin = Infinity, sMax = -Infinity;
    for (const [s] of scaled) { if (s < sMin) sMin = s; if (s > sMax) sMax = s; }
    const hw = Number.isFinite(opts.slabHalfWidth) && opts.slabHalfWidth > 0 ? opts.slabHalfWidth : fin.thickness / 2;
    const slab = (id) => ({ id, kind: 'edge', points: [[sMin, -hw], [sMax, -hw], [sMax, hw], [sMin, hw]] });
    polys.push(slab('fin-2'), slab('fin-4'));
    const rootTE = sLE + k * fin.root;
    const seatFrom = Math.max(sLE, features.bodyTubeEnd), seatTo = Math.min(rootTE, refs.length);
    if (seatTo - seatFrom > 1e-6) polys.push({ id: 'fin-seat', kind: 'seat', points: [[seatFrom, -R0], [seatTo, -R0], [seatTo, R0], [seatFrom, R0]] });
  }
  if (view === 'through' && buttons) {
    for (const b of features.railButtonBounds || []) {
      // the 'through' plane is CAD z = 0 with section y = CAD x
      if (b.axis !== 'x' || !(b.across[0] <= 0 && b.across[1] >= 0)) continue;
      const y0 = b.side * b.rIn, y1 = b.side * b.rOut;
      polys.push({ id: `button-${b.id}`, kind: 'button', oneSided: true, points: [[b.sFwd, y0], [b.sAft, y0], [b.sAft, y1], [b.sFwd, y1]] });
    }
  }
  return polys;
}

/* ---------- mask ---------- */

/* buildSection: the lattice solid mask by signed distance to the polygon set, sampled
   at cell centres, in a single pass over the cells. With mirroring, columns that no
   one-sided polygon (rail button) reaches are evaluated on the upper half and
   copied; columns a button reaches are evaluated in full.
     cellM    = length / (0.66 cols)        metres per cell
     xNoseCol = 0.12 cols                   nose tip, continuous column coordinate
     axisRow  = rows / 2                    the axis, continuous row coordinate
     X = xNoseCol + s / cellM,  Y = axisRow + y / cellM
   Inside test: crossing parity of a ray along +y through the cell centre, per polygon,
   union over polygons; a centre on an edge (within ON_EDGE) counts as solid, which
   keeps the result symmetric when an edge passes through centres (odd rows put the
   edge-on slab edges there). Distance: exact point-to-segment distance to every edge
   within SDF_BAND cells (column buckets), clamped beyond. Solid cells get
   sdf <= -SOLID_SDF_MIN, so sdf < 0 is solid and a solid cell is never -0. The sdf is exact
   on the fluid side; inside the solid it is a lower bound in magnitude (polygon seams
   inside the union count as edges).
   Guards after the pass, each counted in stats.cleaned (all 0 for the CAD at every
   tier): specks (solid cells without a solid 4-neighbour), pinholes (fluid cells
   without a fluid 4-neighbour), pockets (fluid not 4-connected to the domain edge).
   Boundary cells: solid cells with a fluid D2Q9 neighbour. Outward normal: the D2Q9
   weighted mean (1/9 axis, 1/36 diagonal) of the sdf gradient at those fluid
   neighbours, where the gradient (cell centre minus nearest surface point) is exact. */
function rasterise(ctx, opts) {
  const t0 = now();
  const o = normOpts(opts);
  const { cols, rows, finScale, view, mirror, buttons } = o;
  const cellM = ctx.refs.length / (SPAN_FRACTION * cols);
  const xNoseCol = NOSE_COL_FRACTION * cols;
  const axisRow = rows / 2;
  const polys = polygonsFor(ctx, { finScale, view, buttons, slabHalfWidth: SLAB_HALF_CELLS * cellM });
  const toX = (s) => xNoseCol + s / cellM, toY = (y) => axisRow + y / cellM;

  // flatten edges into cell coordinates
  let nE = 0;
  for (const p of polys) nE += p.points.length;
  const ax = new Float64Array(nE), ay = new Float64Array(nE), bx = new Float64Array(nE), by = new Float64Array(nE);
  const enx = new Float64Array(nE), eny = new Float64Array(nE), pid = new Int32Array(nE);
  let e = 0;
  polys.forEach((p, pi) => {
    const pts = p.points.map(([s, y]) => [toX(s), toY(y)]);
    let area = 0;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) area += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
    const orient = area >= 0 ? 1 : -1; // +1 counter-clockwise (x right, y up)
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
      if (len < 1e-12) continue;
      ax[e] = a[0]; ay[e] = a[1]; bx[e] = b[0]; by[e] = b[1];
      enx[e] = orient * dy / len; eny[e] = -orient * dx / len; // outward edge normal
      pid[e] = pi; e++;
    }
  });
  nE = e;
  const nP = polys.length;

  // column buckets (counting sort): edge e matters to column c when c + 0.5 lies
  // within SDF_BAND of its x extent
  const band = SDF_BAND;
  const lo = new Int32Array(nE), hi = new Int32Array(nE);
  const count = new Int32Array(cols + 1);
  for (let i = 0; i < nE; i++) {
    const minX = Math.min(ax[i], bx[i]), maxX = Math.max(ax[i], bx[i]);
    lo[i] = Math.max(0, Math.ceil(minX - band - 0.5));
    hi[i] = Math.min(cols - 1, Math.floor(maxX + band - 0.5));
    for (let c = lo[i]; c <= hi[i]; c++) count[c + 1]++;
  }
  for (let c = 0; c < cols; c++) count[c + 1] += count[c];
  const bucket = new Int32Array(count[cols]);
  const fill = count.slice(0, cols);
  const fullCol = new Uint8Array(cols); // 1 where a one-sided polygon reaches the column: no mirroring there
  for (let i = 0; i < nE; i++) {
    const one = polys[pid[i]].oneSided === true;
    for (let c = lo[i]; c <= hi[i]; c++) { bucket[fill[c]++] = i; if (one) fullCol[c] = 1; }
  }

  const N = cols * rows;
  const sdf = new Float32Array(N), gx = new Float32Array(N), gy = new Float32Array(N);
  const crossY = new Float64Array(nE), crossP = new Int32Array(nE);
  if (nP > 30) throw new Error('buildSection: more than 30 polygons');
  const half = Math.floor(rows / 2);
  let fullColumns = 0;
  for (let c = 0; c < cols; c++) {
    const x = c + 0.5, b0 = count[c], b1 = count[c + 1];
    const copy = mirror && !fullCol[c], rStart = copy ? half : 0;
    if (!copy) fullColumns++;
    let nC = 0, minY = Infinity, maxY = -Infinity;
    for (let k = b0; k < b1; k++) {
      const i = bucket[k];
      const y0 = Math.min(ay[i], by[i]), y1 = Math.max(ay[i], by[i]);
      if (y0 < minY) minY = y0; if (y1 > maxY) maxY = y1;
      if ((ax[i] <= x) !== (bx[i] <= x)) { // half-open rule: a vertex on the ray counts once
        crossY[nC] = ay[i] + (x - ax[i]) * (by[i] - ay[i]) / (bx[i] - ax[i]);
        crossP[nC++] = 1 << pid[i];
      }
    }
    for (let r = rStart; r < rows; r++) {
      const y = r + 0.5;
      // inside: odd number of crossings above the centre in any polygon (one parity bit per polygon)
      let bits = 0;
      for (let k = 0; k < nC; k++) if (crossY[k] > y) bits ^= crossP[k];
      const inside = bits !== 0;
      // distance to the nearest edge within the band
      let best = band, qx = 0, qy = 0, near = -1;
      if (y >= minY - band && y <= maxY + band) {
        let best2 = band * band;
        for (let k = b0; k < b1; k++) {
          const i = bucket[k];
          const dx = bx[i] - ax[i], dy = by[i] - ay[i];
          let t = ((x - ax[i]) * dx + (y - ay[i]) * dy) / (dx * dx + dy * dy);
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const px = ax[i] + t * dx - x, py = ay[i] + t * dy - y, d2 = px * px + py * py;
          if (d2 < best2) { best2 = d2; qx = px; qy = py; near = i; }
        }
        best = Math.sqrt(best2);
      }
      const idx = r * cols + c;
      // solid from the parity bit, or a centre lying on an edge (closed polygons)
      const solid = inside || (near >= 0 && best <= ON_EDGE);
      sdf[idx] = solid ? -Math.max(best, SOLID_SDF_MIN) : best;
      if (near >= 0) {
        // outward gradient: from the surface toward the centre outside, toward the surface inside
        let g0, g1;
        if (best > ON_EDGE) { g0 = solid ? qx / best : -qx / best; g1 = solid ? qy / best : -qy / best; }
        else { g0 = enx[near]; g1 = eny[near]; }
        gx[idx] = g0; gy[idx] = g1;
      }
      if (copy) {
        const m = (rows - 1 - r) * cols + c;
        if (m !== idx) { sdf[m] = sdf[idx]; gx[m] = gx[idx]; gy[m] = -gy[idx]; }
      }
    }
  }

  const mask = new Uint8Array(N);
  for (let i = 0; i < N; i++) mask[i] = sdf[i] < 0 ? 1 : 0;

  // guards, confined to the solid's bounding box grown by one cell: fluid outside it
  // is one ring that touches the domain edge whenever the box does not
  const cleaned = { specks: 0, pinholes: 0, pockets: 0 };
  let c0 = cols, c1 = -1, r0 = rows, r1 = -1;
  for (let r = 0; r < rows; r++) for (let c = 0, i = r * cols; c < cols; c++, i++) if (mask[i]) {
    if (c < c0) c0 = c; if (c > c1) c1 = c; if (r < r0) r0 = r; if (r > r1) r1 = r;
  }
  if (c1 >= 0) {
    c0 = Math.max(0, c0 - 1); c1 = Math.min(cols - 1, c1 + 1); r0 = Math.max(0, r0 - 1); r1 = Math.min(rows - 1, r1 + 1);
    const at = (cc, rr) => (cc < 0 || rr < 0 || cc >= cols || rr >= rows ? 0 : mask[rr * cols + cc]);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const i = r * cols + c;
      if (mask[i] && at(c + 1, r) + at(c - 1, r) + at(c, r + 1) + at(c, r - 1) === 0) { mask[i] = 0; sdf[i] = Math.max(0.5, sdf[i]); cleaned.specks++; }
    }
    for (let r = Math.max(1, r0); r <= Math.min(rows - 2, r1); r++) for (let c = Math.max(1, c0); c <= Math.min(cols - 2, c1); c++) {
      const i = r * cols + c;
      if (!mask[i] && mask[i + 1] + mask[i - 1] + mask[i + cols] + mask[i - cols] === 4) { mask[i] = 1; sdf[i] = Math.min(-0.5, sdf[i]); cleaned.pinholes++; }
    }
    const seen = new Uint8Array(N), stack = new Int32Array((c1 - c0 + 1) * (r1 - r0 + 1));
    let sp = 0;
    const seed = (i) => { if (!mask[i] && !seen[i]) { seen[i] = 1; stack[sp++] = i; } };
    for (let c = c0; c <= c1; c++) { seed(r0 * cols + c); seed(r1 * cols + c); }
    for (let r = r0; r <= r1; r++) { seed(r * cols + c0); seed(r * cols + c1); }
    while (sp) {
      const i = stack[--sp], c = i % cols, r = (i - c) / cols;
      if (c > c0) seed(i - 1); if (c < c1) seed(i + 1);
      if (r > r0) seed(i - cols); if (r < r1) seed(i + cols);
    }
    for (let r = r0; r <= r1; r++) for (let c = c0, i = r * cols + c0; c <= c1; c++, i++) {
      if (!mask[i] && !seen[i]) { mask[i] = 1; sdf[i] = Math.min(-0.5, sdf[i]); cleaned.pockets++; }
    }
  }

  // boundary cells and normals
  const E8 = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [-1, -1], [1, -1]]; // D2Q9 e1..e8
  const W8 = [1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 36, 1 / 36, 1 / 36, 1 / 36];          // D2Q9 weights (STD, Chen and Doolen 1998)
  const boundary = [];
  let solid = 0, links = 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const i = r * cols + c;
    if (!mask[i]) continue;
    solid++;
    let nx = 0, ny = 0, lx = 0, ly = 0, fluid = 0;
    for (let q = 0; q < 8; q++) {
      const cc = c + E8[q][0], rr = r + E8[q][1];
      if (cc < 0 || rr < 0 || cc >= cols || rr >= rows) continue;
      const j = rr * cols + cc;
      if (mask[j]) continue;
      fluid++;
      nx += W8[q] * gx[j]; ny += W8[q] * gy[j];
      lx += W8[q] * E8[q][0]; ly += W8[q] * E8[q][1];
    }
    if (!fluid) continue;
    links += fluid;
    let len = Math.hypot(nx, ny);
    if (len < 1e-9) { nx = lx; ny = ly; len = Math.hypot(nx, ny) || 1; }
    boundary.push({ col: c, row: r, nx: nx / len, ny: ny / len });
  }

  // mirror check over the final mask: nonzero only where one-sided polygons (rail buttons) are
  let asymmetric = 0;
  for (let r = 0; r < Math.floor(rows / 2); r++) {
    const a = r * cols, b = (rows - 1 - r) * cols;
    for (let c = 0; c < cols; c++) if (mask[a + c] !== mask[b + c]) asymmetric++;
  }

  const dCells = ctx.refs.diameter / cellM;
  return {
    mask, cols, rows, cellM, xNoseCol, axisRow, dCells, finScale, view, buttons,
    /* continuous column of a point cg_m aft of the nose tip */
    xCgCol: (cgM) => xNoseCol + cgM / cellM,
    /* the CG in cell units {x, y} for another cg_m; buildSection() also attaches
       cgM, xCg and cgCell (values) for the cgM it was given */
    cgCellAt: (cgM) => ({ x: xNoseCol + cgM / cellM, y: axisRow }),
    toCell: (s, y = 0) => ({ x: toX(s), y: toY(y) }),
    toMetres: (x, y = axisRow) => ({ s: (x - xNoseCol) * cellM, y: (y - axisRow) * cellM }),
    boundary,
    sdf,
    polygons: polys,
    domain: { widthM: cols * cellM, heightM: rows * cellM, noseOffsetM: xNoseCol * cellM, axisOffsetM: axisRow * cellM },
    stats: { solid, boundary: boundary.length, links, cleaned, asymmetric, mirrored: mirror, fullColumns, edges: nE, ms: now() - t0 },
  };
}

/* ---------- page comparison ---------- */

/* Rows for the CAD versus PAGE table, inches. delta = CAD - PAGE. */
export function compareWithPage(refs, fin) {
  const inch = (m) => m / IN_M;
  const row = (key, label, cadM, pageIn) => {
    const cad = inch(cadM);
    return { key, label, cadIn: cad, cadMm: cadM * 1000, pageIn, deltaIn: pageIn == null ? null : cad - pageIn, deltaPct: pageIn == null ? null : (cad - pageIn) / pageIn * 100 };
  };
  return [
    row('finRoot', 'Fin root chord', fin.root, PAGE_FIGURES.finRootIn),
    row('finHeight', 'Fin height (span)', fin.span, PAGE_FIGURES.finHeightIn),
    row('finSweep', 'Fin leading-edge sweep', fin.sweep, PAGE_FIGURES.finSweepIn),
    row('length', 'Length, nose tip to screw cap', refs.length, PAGE_FIGURES.lengthIn),
    row('diameter', 'Body diameter', refs.diameter, PAGE_FIGURES.diameterIn),
    row('finTip', 'Fin tip chord', fin.tip, null),
    row('finThickness', 'Fin thickness', fin.thickness, null),
    row('finRootLE', 'Fin root leading edge from nose', fin.rootLeadingEdgeFromNose, null),
    row('noseLength', 'Nose cone, shoulder included', refs.noseLength, null),
    row('noseExposed', 'Nose length, exposed', refs.noseExposedLength, null),
  ];
}

/* ---------- live versus baked ---------- */

function compareBaked(live, baked) {
  let maxDr = 0;
  const n = Math.min(live.profile.r.length, baked.profile.r.length);
  for (let i = 0; i < n; i++) maxDr = Math.max(maxDr, Math.abs(live.profile.r[i] - baked.profile.r[i]));
  const finKeys = ['root', 'tip', 'span', 'sweep', 'thickness', 'rootLeadingEdgeFromNose'];
  let maxDf = 0;
  for (const k of finKeys) maxDf = Math.max(maxDf, Math.abs(live.fin[k] - baked.fin[k]));
  return {
    samples: live.profile.r.length === baked.profile.r.length,
    maxRadiusDiffM: maxDr,
    maxFinDiffM: maxDf,
    lengthDiffM: Math.abs(live.profile.length - baked.profile.length),
    stale: live.profile.r.length !== baked.profile.r.length || maxDr > 2e-6 || maxDf > 2e-6,
  };
}

/* ---------- public entry points ---------- */

let bakedGeometry = null;
/* The geometry built from the baked CAD copy (synchronous, no fetch). */
export function getBakedGeometry() {
  if (!bakedGeometry) bakedGeometry = makeGeometry(bakedMeasured(), { source: 'cad-baked', shared: true });
  return bakedGeometry;
}

function abortError() {
  return typeof DOMException === 'function' ? new DOMException('Aborted', 'AbortError') : Object.assign(new Error('Aborted'), { name: 'AbortError' });
}

/* FIELD 5. Resolves with the geometry measured live from the published assembly.
   Pass {geometry: {json, buffer}} to reuse what the scene already fetched (the
   loader's loadGeometry() result); otherwise it calls loadGeometry() itself. Never
   rejects for a missing or broken asset: it resolves with the baked copy and sets
   geometry.error (source 'cad-baked'). An AbortSignal that fires rejects with the
   AbortError. */
export async function loadFieldGeometry({ geometry: src = null, signal } = {}) {
  const t0 = now();
  try {
    if (!src) {
      const loader = await import('../stage/loader.js');
      src = await loader.loadGeometry({ signal });
    }
    if (signal && signal.aborted) throw abortError();
    const t1 = now();
    const measured = measureAssembly(src.json, src.buffer);
    const geometry = makeGeometry(measured, { source: 'cad-live', fetchMs: t1 - t0, measureMs: now() - t1 });
    geometry.check = compareBaked(measured, bakedMeasured());
    return geometry;
  } catch (err) {
    if (signal && signal.aborted) throw (signal.reason instanceof Error ? signal.reason : abortError());
    const geometry = makeGeometry(bakedMeasured(), { source: 'cad-baked', error: String(err && err.message || err) });
    return geometry;
  }
}

/* The measured planform for the flight config (FIELD 3), metres, CAD. */
export const finDefaults = getBakedGeometry().finDefaults;
/* The CAD reference lengths, metres. */
export const refs = getBakedGeometry().refs;

/* Synchronous forms on the baked geometry, for callers without a loaded geometry
   (the panel's 2D fallback, node tests). Same options as the geometry methods. */
export function sectionPolygons(opts) { return getBakedGeometry().sectionPolygons(opts); }
export function buildSection(opts) { return getBakedGeometry().buildSection(opts); }

export const toInches = (m) => m / IN_M;
