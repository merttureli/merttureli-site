/* Flight paths for the CHARGER field scene (presentation plan item 10).

   Two of these live in the scene: the flight's own path (from flight.history, with the rocket
   as its live end) and a ghost (the same conditions with the other fin choice, flown silently
   in this tab and handed in whole). Each is a screen-space polyline (polyline.js) plus event
   ticks with mono labels:
     RAIL EXIT, BURNOUT, APOGEE n FT SIM   (the apogee label adds the fin words on a second line)
   Colour follows the fins, so the two paths read apart without a legend: a finned path is
   paper, a finless one livery orange. The labels themselves are paper on the ink plate (11 px
   orange text on ink would fall under 4.5:1); the colored '+' tick and the line beside them
   carry the color, the fin words carry the meaning.

   Styles: 'flight' is 1 px at 45 percent, no ticks (the path behind the rocket while it flies);
   'plate' is 2 px at 95 percent with the ticks (the end plate at apogee). The ghost on the plate
   is 2 px at 75 percent, its apogee tick only.

   Everything is in world meters (the scene converts the flight frame: y + the pad stand).
   Tick labels are laid out on the canvas in CSS px by layoutTicks(): each label tries spots round
   its tick, clamped inside the canvas, and keeps the cheapest against the labels placed before
   it, the obstacles the scene passes (the ladder labels, the axis label, the end card), the ticks
   and the paths themselves. Measured after projection, a label may not overlap a label or
   obstacle placed before it, nor cover a tick, while a clear spot exists: when none of the spots
   beside the tick is clear it moves further out along its leader, or stacks above or below the
   label in its way, and a 1 px leader (paper 45 percent, as the stage's markers draw theirs) runs
   from its tick to the label. */
import * as THREE from 'three';
import { createPolyline, POLYLINE_MAX } from './polyline.js';
import { createLabel, FIT_MARGIN_PX } from './markers.js';

export const TRAIL_MAX = POLYLINE_MAX;     // 4,096 points per path
export const PAPER_RGB = [1, 1, 1];
export const LIVERY_RGB = [0xd6 / 255, 0x3b / 255, 0x08 / 255];   // CHARGER's livery orange #d63b08
export const TRAIL_STYLE = Object.freeze({
  flight: Object.freeze({ width: 1, opacity: 0.45 }),
  plate: Object.freeze({ width: 2, opacity: 0.95 }),
  ghost: Object.freeze({ width: 2, opacity: 0.75 }),
});
export const TICK_WORDS = Object.freeze({ railExit: 'RAIL EXIT', burnout: 'BURNOUT', apogee: 'APOGEE' });
const META = 'rgba(255,255,255,0.72)';     // secondary label text, paper-a70 or stronger (FIELD.md section 2)
const TICK_PX = 11;                        // the '+' tick, CSS px
const GAP_PX = 9;                          // tick to label
const FINLESS_BELOW = 0.005;               // a fin scale under this is "no fins"
const LEAD_MAX = 4;                        // leaders per path (one per tick)

/* The fin words, as the page's slate and end card use them, in caps. */
export function finWords(k) {
  if (!Number.isFinite(k)) return '';
  if (Math.abs(k - 1) < 0.005) return 'FULL FINS';
  if (k < FINLESS_BELOW) return 'NO FINS';
  if (Math.abs(k - 0.5) < 0.005) return 'HALF FINS';
  return `FIN SCALE ${k.toFixed(2)}`;
}
export const finlessScale = (k) => Number.isFinite(k) && k < FINLESS_BELOW;

let plusTex = null, plusUsers = 0;
function plusTexture() {
  if (plusTex) { plusUsers++; return plusTex; }
  const s = 32, c = document.createElement('canvas'); c.width = c.height = s;
  const g = c.getContext('2d');
  if (g) {
    g.strokeStyle = '#0a0a0a'; g.lineWidth = 6; g.lineCap = 'square';
    g.beginPath(); g.moveTo(s / 2, 5); g.lineTo(s / 2, s - 5); g.moveTo(5, s / 2); g.lineTo(s - 5, s / 2); g.stroke();
    g.strokeStyle = '#ffffff'; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(s / 2, 6); g.lineTo(s / 2, s - 6); g.moveTo(6, s / 2); g.lineTo(s - 6, s / 2); g.stroke();
  }
  plusTex = new THREE.CanvasTexture(c);
  plusTex.colorSpace = THREE.SRGBColorSpace; plusTex.minFilter = THREE.LinearFilter; plusTex.generateMipmaps = false;
  plusUsers = 1;
  return plusTex;
}
function releasePlus() { if (--plusUsers <= 0 && plusTex) { plusTex.dispose(); plusTex = null; plusUsers = 0; } }

/* opts: {ghost: false, renderOrder: 3} */
export function createTrail({ ghost = false, renderOrder = 3 } = {}) {
  const group = new THREE.Group();
  group.name = ghost ? 'trail-ghost' : 'trail';
  const line = createPolyline({ color: PAPER_RGB, ...TRAIL_STYLE.flight, renderOrder });
  group.add(line.mesh);
  const tex = plusTexture();
  // leaders from a label that had to move away back to its tick (layoutTicks fills them)
  const leadPos = new Float32Array(LEAD_MAX * 6);
  const leadGeo = new THREE.BufferGeometry();
  leadGeo.setAttribute('position', new THREE.BufferAttribute(leadPos, 3));
  leadGeo.setDrawRange(0, 0);
  const leadMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, depthTest: false, depthWrite: false });
  const leaders = new THREE.LineSegments(leadGeo, leadMat);
  leaders.renderOrder = 40; leaders.frustumCulled = false; leaders.visible = false;
  group.add(leaders);
  let nLead = 0;
  function setLeaders(list) {
    nLead = 0;
    for (const q of list || []) { if (nLead >= LEAD_MAX) break; leadPos.set(q, nLead * 6); nLead++; }
    leadGeo.setDrawRange(0, nLead * 2);
    if (nLead) leadGeo.attributes.position.needsUpdate = true;
    leaders.visible = nLead > 0 && style === 'plate' && line.count > 1;
  }
  let finScale = 1, name = '', style = 'flight';
  let ticks = [];                      // {key, world: V3, ft, sprite, label, rect}
  const tint = () => (finlessScale(finScale) ? LIVERY_RGB : PAPER_RGB);
  const hex = () => new THREE.Color().setRGB(...tint(), THREE.SRGBColorSpace);

  function dropTicks() {
    for (const t of ticks) { t.sprite.material.dispose(); t.sprite.removeFromParent(); t.label.dispose(); t.label.sprite.removeFromParent(); }
    ticks = [];
    setLeaders(null);
  }
  function writeLabel(t) {
    if (t.key === 'apogee') {
      const lines = [[[TICK_WORDS.apogee, META], [`${Number.isFinite(t.ft) ? Math.round(t.ft) : '--'} FT`], [t.tag || 'SIM', META]]];
      if (name) lines.push([[name, META]]);
      t.label.set(lines);
    } else t.label.set([[[TICK_WORDS[t.key] || String(t.key).toUpperCase(), META]]]);
  }
  function applyStyle() {
    const st = style === 'plate' ? (ghost ? TRAIL_STYLE.ghost : TRAIL_STYLE.plate) : TRAIL_STYLE.flight;
    line.setStyle({ color: tint(), width: st.width, opacity: st.opacity });
    const c = hex();
    for (const t of ticks) { t.sprite.material.color.copy(c); }
    const show = style === 'plate' && line.count > 1;
    for (const t of ticks) { t.sprite.visible = show; t.label.sprite.visible = show && !!t.rect; }
    leaders.visible = show && nLead > 0;
  }

  const api = {
    group, line, ghost,
    get count() { return line.count; },
    get style() { return style; },
    get finScale() { return finScale; },
    get name() { return name; },
    get ticks() { return ticks.map((t) => ({ key: t.key, x: t.world.x, y: t.world.y, ft: t.ft, shown: t.sprite.visible, rect: t.rect ? { ...t.rect } : null })); },
    get visible() { return line.mesh.visible; },
    setFins(k) { const v = Number.isFinite(+k) ? Math.max(0, +k) : 1; if (v === finScale) return; finScale = v; applyStyle(); },
    setName(s) { const v = s ? String(s) : ''; if (v === name) return; name = v; for (const t of ticks) writeLabel(t); },
    setStyle(s) { const v = s === 'plate' ? 'plate' : 'flight'; if (v === style) return; style = v; applyStyle(); },
    /* points: world [x, y, z?] or {x, y, z?}; replaces the path */
    set(points) { line.set(points); applyStyle(); },
    push(x, y, z = 0) { const ok = line.push(x, y, z); if (ok && line.count === 2) applyStyle(); return ok; },
    setHead(x, y, z = 0) { line.setHead(x, y, z); },
    clear() { line.clear(); dropTicks(); applyStyle(); },
    /* ticks: [{key: 'railExit' | 'burnout' | 'apogee', x, y, z?, ft?, tag?}] in world m (ft: the apogee's height above the pad) */
    setTicks(list) {
      dropTicks();
      for (const d of Array.isArray(list) ? list : []) {
        if (!d || !Number.isFinite(d.x) || !Number.isFinite(d.y)) continue;
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: hex(), transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false }));
        sprite.renderOrder = 41; sprite.frustumCulled = false;
        sprite.position.set(d.x, d.y, d.z || 0);
        const label = createLabel({ align: 'left' });
        label.sprite.renderOrder = 42;
        label.sprite.position.copy(sprite.position);
        group.add(sprite, label.sprite);
        const t = { key: d.key, world: sprite.position, ft: d.ft, tag: d.tag, sprite, label, rect: null };
        writeLabel(t);
        ticks.push(t);
      }
      applyStyle();
    },
    setResolution(w, h, dpr) { line.setResolution(w, h, dpr); },
    /* the bounds of the committed path in world m, or null */
    bounds() { return line.bounds(); },
    refresh() { for (const t of ticks) { t.label.invalidate(); writeLabel(t); } },
    /* internal to layoutTicks */
    _ticks: () => ticks,
    _apply: applyStyle,
    _leaders: setLeaders,
    get leaders() { return nLead; },
    dispose() { dropTicks(); line.dispose(); leadGeo.dispose(); leadMat.dispose(); releasePlus(); group.removeFromParent(); },
  };
  return api;
}

/* ---------- tick label layout (CSS px on the canvas) ----------------------- */
const CANDIDATES = [            // [dx, dy] in units of (gap + half size), in order of preference
  [1, 0], [-1, 0], [1, -1], [1, 1], [-1, -1], [-1, 1], [0, -1], [0, 1],
];
const COST = { overlap: 4, pathPt: 60, dist: 0.6, order: 8, tick: 400 };
const CLEAR_PX = 2;             // a label keeps this clear of the labels and obstacles placed before it
const MARK_PX = TICK_PX / 2;    // and this clear of every tick's centre (the '+' is 11 px)
const OUT_PX = [16, 26, 40, 58, 80];   // further spots along each of eight directions, px from the tick to the label's edge
const STACK_ROWS = 6;           // stacked rows above and below the tick, each side of it
const STACK_SHIFT_PX = [0, 12, 24, 40];   // and each row a little further out, past a path or a tick beside the tick
const RISE_K = 0.3;             // per px a moved label sits above or below its tick (it reads as another height)
const LEADER_MIN_PX = 14;       // a label whose edge is further than this from its tick gets a leader
const _v = new THREE.Vector3(), _w = new THREE.Vector3();
function screenOf(v, camera, W, H, o) {
  _v.copy(v).project(camera);
  o.x = (_v.x + 1) / 2 * W; o.y = (1 - _v.y) / 2 * H; o.z = _v.z; o.ok = _v.z > -1 && _v.z < 1 && Number.isFinite(o.x);
  return o;
}
const area = (a, b) => { const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0); return w > 0 && h > 0 ? w * h : 0; };
const grow = (q, d) => ({ x0: q.x0 - d, y0: q.y0 - d, x1: q.x1 + d, y1: q.y1 + d });
const inRect = (x, y, r, d) => x > r.x0 - d && x < r.x1 + d && y > r.y0 - d && y < r.y1 + d;
const segPointDist = (ax, ay, bx, by, px, py) => {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  const u = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
  return Math.hypot(ax + dx * u - px, ay + dy * u - py);
};

/* The paths on screen, CSS px: one flat [x0, y0, x1, y1, ...] array per path of at least two
   points, thinned evenly to at most maxPts points (the last point always kept). */
export function screenPaths(trails, view, maxPts = 800) {
  const { camera } = view;
  const W = view.width || 0, H = view.height || 0;
  const out = [], p = { x: 0, y: 0, z: 0, ok: false }, a3 = [0, 0, 0];
  for (const tr of trails) {
    if (!tr || tr.count < 2) continue;
    const n = tr.count, stride = Math.max(1, Math.ceil(n / maxPts)), pts = [];
    const add = (i) => { tr.line.at(i, a3); screenOf(_w.set(a3[0], a3[1], a3[2]), camera, W, H, p); if (p.ok) pts.push(p.x, p.y); };
    for (let i = 0; i < n; i += stride) add(i);
    if ((n - 1) % stride) add(n - 1);
    if (pts.length >= 4) out.push(pts);
  }
  return out;
}
/* Does the segment (x0, y0)-(x1, y1) touch the rectangle r? (Liang-Barsky clip) */
export function segmentHitsRect(x0, y0, x1, y1, r) {
  let t0 = 0, t1 = 1;
  const dx = x1 - x0, dy = y1 - y0;
  const P = [-dx, dx, -dy, dy], Q = [x0 - r.x0, r.x1 - x0, y0 - r.y0, r.y1 - y0];
  for (let i = 0; i < 4; i++) {
    if (P[i] === 0) { if (Q[i] < 0) return false; continue; }
    const t = Q[i] / P[i];
    if (P[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
    else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return true;
}
/* How many path segments run through the rectangle r (screenPaths output). */
export function pathsCrossing(paths, r) {
  let n = 0;
  for (const P of paths) for (let i = 0; i + 3 < P.length; i += 2) if (segmentHitsRect(P[i], P[i + 1], P[i + 2], P[i + 3], r)) n++;
  return n;
}
/* The x extent of the paths inside the band of rows y0..y1, or null where no path enters it. */
export function pathsXRange(paths, y0, y1) {
  let lo = Infinity, hi = -Infinity;
  for (const P of paths) for (let i = 0; i + 3 < P.length; i += 2) {
    const ax = P[i], ay = P[i + 1], bx = P[i + 2], by = P[i + 3];
    if ((ay < y0 && by < y0) || (ay > y1 && by > y1)) continue;
    const dy = by - ay;
    let ta = 0, tb = 1;
    if (Math.abs(dy) > 1e-9) { const u = (y0 - ay) / dy, v = (y1 - ay) / dy; ta = Math.max(0, Math.min(u, v)); tb = Math.min(1, Math.max(u, v)); }
    for (const t of [ta, tb]) { const x = ax + (bx - ax) * t; if (x < lo) lo = x; if (x > hi) hi = x; }
  }
  return lo <= hi ? { lo, hi } : null;
}

/* Lay out every visible tick label of these trails. view: {camera, width, height, labelK,
   pxToScale, obstacles: [{x0, y0, x1, y1}] (CSS px on the canvas)}. Ticks are placed in a fixed
   order (apogees first, then burnout, then rail exit), so the figures that matter most get the
   best spots. Each label keeps the cheapest of eight spots beside its tick while that spot is
   clear (no overlap with a label or obstacle placed before it, no tick under it); otherwise the
   cheapest clear spot further out along the eight directions or stacked above or below the
   label in its way, with a leader back to the tick; only where nothing is clear, the cheapest
   spot at all. Returns the placed rectangles. */
export function layoutTicks(trails, view) {
  const { camera, pxToScale } = view;
  const W = view.width || 0, H = view.height || 0, k = view.labelK || 1, m = FIT_MARGIN_PX;
  const placed = (view.obstacles || []).filter(Boolean).map((r) => ({ ...r }));
  // the paths on screen, thinned to at most 160 samples each
  const samples = [];
  const p = { x: 0, y: 0, z: 0, ok: false }, a3 = [0, 0, 0];
  for (const tr of trails) {
    if (!tr || tr.style !== 'plate' || tr.count < 2) continue;
    const n = tr.count, stride = Math.max(1, Math.floor(n / 160));
    for (let i = 0; i < n; i += stride) { tr.line.at(i, a3); screenOf(_v.set(a3[0], a3[1], a3[2]), camera, W, H, p); if (p.ok) samples.push(p.x, p.y); }
  }
  const order = { apogee: 0, burnout: 1, railExit: 2 };
  const all = [];
  for (const tr of trails) { if (!tr) continue; for (const t of tr._ticks()) all.push({ tr, t }); }
  all.sort((u, v) => (order[u.t.key] ?? 3) - (order[v.t.key] ?? 3) || (u.tr.ghost ? 1 : 0) - (v.tr.ghost ? 1 : 0));
  // every shown tick on screen: no label covers a '+' (its own or another path's)
  const marks = new Map();
  for (const { tr, t } of all) {
    if (tr.style !== 'plate' || tr.count < 2) continue;
    const s = screenOf(t.world, camera, W, H, { x: 0, y: 0, z: 0, ok: false });
    if (s.ok) marks.set(t, s);
  }
  const leads = new Map(trails.filter(Boolean).map((tr) => [tr, []]));
  const out = [];
  for (const { tr, t } of all) {
    t.rect = null;
    if (tr.style !== 'plate' || tr.count < 2) { t.label.sprite.visible = false; t.sprite.visible = false; continue; }
    t.sprite.visible = true;
    t.sprite.scale.setScalar(pxToScale(TICK_PX) / (k || 1));
    const s = marks.get(t) || screenOf(t.world, camera, W, H, { x: 0, y: 0, z: 0, ok: false });
    const w = t.label.width * k, h = t.label.height * k;
    if (!s.ok || !(w > 0) || s.x < -200 || s.x > W + 200 || s.y < -200 || s.y > H + 200) { t.label.sprite.visible = false; continue; }
    // its own tick, or another drawn on the same spot (two apogees at one height)
    const same = (o, q) => o === t || Math.hypot(q.x - s.x, q.y - s.y) < 3;
    /* the leader a label at r would need: none within LEADER_MIN_PX of the tick; else to the label's
       nearest point, or to the middle, top or bottom rows of its near side, the first that keeps clear
       of the other ticks and of every label and obstacle placed before (ok false when none does) */
    const leaderOf = (r) => {
      const nx = Math.max(r.x0, Math.min(r.x1, s.x)), ny = Math.max(r.y0, Math.min(r.y1, s.y));
      const d = Math.hypot(nx - s.x, ny - s.y);
      if (!(d > LEADER_MIN_PX)) return { q: null, ok: true };
      const ends = [[nx, ny]];
      for (const ex of r.x0 >= s.x ? [r.x0] : r.x1 <= s.x ? [r.x1] : []) ends.push([ex, (r.y0 + r.y1) / 2], [ex, r.y0 + 4], [ex, r.y1 - 4]);
      for (const q of ends) {
        let ok = true;
        for (const [o, mk] of marks) if (!same(o, mk) && segPointDist(s.x, s.y, q[0], q[1], mk.x, mk.y) < MARK_PX + 1) { ok = false; break; }
        if (ok) for (const b of placed) if (segmentHitsRect(s.x, s.y, q[0], q[1], b)) { ok = false; break; }
        if (ok) return { q, ok };
      }
      return { q: ends[0], ok: false };
    };
    /* one spot: clamped inside the canvas, scored, and whether it is clear */
    const spot = (cx, cy, base, rise = 0) => {
      cx = Math.max(m + w / 2, Math.min(W - m - w / 2, cx));
      cy = Math.max(m + h / 2, Math.min(H - m - h / 2, cy));
      const r = { x0: cx - w / 2, y0: cy - h / 2, x1: cx + w / 2, y1: cy + h / 2 };
      let c = base + Math.hypot(cx - s.x, cy - s.y) * COST.dist + Math.abs(cy - s.y) * rise, clear = true;
      for (const q of placed) { c += area(r, grow(q, 4)) * COST.overlap; if (clear && area(r, grow(q, CLEAR_PX)) > 0) clear = false; }
      for (let j = 0; j < samples.length; j += 2) {
        const x = samples[j], y = samples[j + 1];
        if (x > r.x0 - 3 && x < r.x1 + 3 && y > r.y0 - 3 && y < r.y1 + 3) c += COST.pathPt;
      }
      // the tick itself stays clear of its label
      if (inRect(s.x, s.y, r, 4)) c += COST.tick;
      for (const [o, q] of marks) {
        const mine = same(o, q);
        if (!inRect(q.x, q.y, r, mine ? CLEAR_PX : MARK_PX)) continue;
        clear = false;
        if (!mine) c += COST.tick;
      }
      const lead = leaderOf(r);
      if (!lead.ok) { clear = false; c += COST.tick; }
      return { c, r, cx, cy, clear, lead: lead.q };
    };
    let best = null, bestClear = null;
    const keep = (o) => { if (!best || o.c < best.c) best = o; if (o.clear && (!bestClear || o.c < bestClear.c)) bestClear = o; };
    CANDIDATES.forEach(([dx, dy], i) => {
      const cx = s.x + dx * (GAP_PX + w / 2);
      let cy = s.y + dy * (GAP_PX * 0.5 + h / 2);
      if (dx && dy) cy = s.y + dy * (h / 2 + 2);
      if (!dx) cy = s.y + dy * (GAP_PX + h / 2);
      keep(spot(cx, cy, i * COST.order));
    });
    let chosen = best;
    if (!best.clear) {
      const near = best;
      // nothing beside the tick is clear: further out along the leader, or stacked
      const base = CANDIDATES.length * COST.order;
      for (let i = 0; i < 8; i++) {
        const ux = Math.cos(i * Math.PI / 4), uy = Math.sin(i * Math.PI / 4), e = Math.abs(ux) * w / 2 + Math.abs(uy) * h / 2;
        for (const d of OUT_PX) keep(spot(s.x + ux * (d + e), s.y + uy * (d + e), base, RISE_K));
      }
      const rows = [];
      for (let j = 1; j <= STACK_ROWS; j++) rows.push(s.y + j * (h + 4), s.y - j * (h + 4));
      // directly above and below each label or obstacle in the way of the spot beside the tick
      for (const q of placed) if (area(near.r, grow(q, CLEAR_PX)) > 0) rows.push(q.y1 + CLEAR_PX + 2 + h / 2, q.y0 - CLEAR_PX - 2 - h / 2);
      for (const cy of rows) for (const dx of STACK_SHIFT_PX) {
        keep(spot(s.x + GAP_PX + 4 + dx + w / 2, cy, base, RISE_K));
        keep(spot(s.x - GAP_PX - 4 - dx - w / 2, cy, base, RISE_K));
      }
      chosen = bestClear || best;
    }
    const r = chosen.r;
    t.rect = r;
    placed.push(r);
    t.label.sprite.visible = true;
    t.label.placeAt(pxToScale, (chosen.cx - s.x) / k, (chosen.cy - s.y) / k);
    // the leader: from the tick's edge to the label (leaderOf)
    let lead = false;
    if (chosen.lead) {
      const [qx, qy] = chosen.lead, d = Math.hypot(qx - s.x, qy - s.y), a = (MARK_PX + 2) / d, seg = [];
      for (const [x, y] of [[s.x + (qx - s.x) * a, s.y + (qy - s.y) * a], [qx, qy]]) {
        _w.set(x / W * 2 - 1, 1 - y / H * 2, s.z).unproject(camera);
        seg.push(_w.x, _w.y, _w.z);
      }
      leads.get(tr).push(seg);
      lead = true;
    }
    out.push({ key: t.key, ghost: tr.ghost, rect: { ...r }, tick: { x: s.x, y: s.y }, lead, clear: chosen.clear });
  }
  for (const [tr, list] of leads) tr._leaders(list);
  return out;
}
