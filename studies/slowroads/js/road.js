/* The road: one pen line per host ([data-road-host]), drawn through every [data-road] anchor inside it, in
   document order. The anchors are placed by the stylesheet, so the line follows the layout at any width.

   The line is not a clean curve. It is sampled every few pixels and pushed sideways by smooth noise (a slow
   drift and a fast tremble), and its dashes are all different lengths, the way a hand makes them.
   It draws with the scroll: the pen tip stays a little below the middle of the window. When it reaches a
   [data-road="stop"] anchor, that stop gets .is-reached and its stamp lands. */

const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
function noise(seed) {
  const r = rng(seed), v = Array.from({ length: 256 }, () => r() * 2 - 1);
  return t => { const i = Math.floor(t), f = t - i, u = f * f * (3 - 2 * f), a = v[i & 255], b = v[(i + 1) & 255]; return a + (b - a) * u; };
}

/* Catmull-Rom through the anchors, sampled about every `step` px. */
function spline(p, step) {
  const out = [], P = i => p[Math.max(0, Math.min(p.length - 1, i))];
  for (let i = 0; i < p.length - 1; i++) {
    const a = P(i - 1), b = P(i), c = P(i + 1), d = P(i + 2), n = Math.max(2, Math.ceil(Math.hypot(c.x - b.x, c.y - b.y) / step));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      out.push({
        x: 0.5 * (2 * b.x + (c.x - a.x) * t + (2 * a.x - 5 * b.x + 4 * c.x - d.x) * t2 + (3 * b.x - a.x - 3 * c.x + d.x) * t3),
        y: 0.5 * (2 * b.y + (c.y - a.y) * t + (2 * a.y - 5 * b.y + 4 * c.y - d.y) * t2 + (3 * b.y - a.y - 3 * c.y + d.y) * t3),
        knot: k === 0 ? i : -1,
      });
    }
  }
  const z = p[p.length - 1]; out.push({ x: z.x, y: z.y, knot: p.length - 1 });
  return out;
}

function build(road) {
  const { host, svg, line } = road, hb = host.getBoundingClientRect();
  if (!hb.width || !hb.height) return false;
  const anchors = [...host.querySelectorAll('[data-road]')].filter(el => el.offsetParent !== null || el.getClientRects().length).map(el => {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2 - hb.left, y: r.top + r.height / 2 - hb.top, el };
  });
  if (anchors.length < 2) return false;
  svg.setAttribute('viewBox', `0 0 ${hb.width.toFixed(1)} ${hb.height.toFixed(1)}`);

  /* wobble: the hand drifts slowly and trembles quickly. Pinned at the anchors so the line still meets its dots. */
  const pts = spline(anchors, 7), drift = noise(road.seed), tremble = noise(road.seed + 9), wide = Math.min(1, hb.width / 900);
  let s = 0; const knots = [];
  for (let i = 0; i < pts.length; i++) { if (i) s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); pts[i].s = s; if (pts[i].knot >= 0) knots[pts[i].knot] = s; }
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1], b = pts[i + 1], len = Math.hypot(b.x - a.x, b.y - a.y) || 1, nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len;
    let near = Infinity; for (const k of knots) near = Math.min(near, Math.abs(pts[i].s - k));
    const pin = Math.min(1, near / 46), off = (drift(pts[i].s / 150) * (5 + 6 * wide) + tremble(pts[i].s / 38) * 2.1) * pin;
    pts[i].wx = pts[i].x + nx * off; pts[i].wy = pts[i].y + ny * off;
  }
  pts[0].wx = pts[0].x; pts[0].wy = pts[0].y; const z = pts[pts.length - 1]; z.wx = z.x; z.wy = z.y;
  const f = n => n.toFixed(1);
  let d = `M${f(pts[0].wx)} ${f(pts[0].wy)}`;
  for (let i = 1; i < pts.length - 1; i++) d += `Q${f(pts[i].wx)} ${f(pts[i].wy)} ${f((pts[i].wx + pts[i + 1].wx) / 2)} ${f((pts[i].wy + pts[i + 1].wy) / 2)}`;
  d += `L${f(z.wx)} ${f(z.wy)}`;
  line.setAttribute('d', d);
  road.total = line.getTotalLength();
  const scale = road.total / (s || 1);

  /* where each stop sits along the line, and how far the pen has to be for a given height on the page */
  road.stops = anchors.map((a, i) => ({ el: a.el.closest('.stop'), at: knots[i] * scale, on: a.el.dataset.road === 'stop' })).filter(a => a.on && a.el);
  road.table = []; let far = -Infinity;
  for (const p of pts) { if (p.wy === undefined) continue; far = Math.max(far, p.wy); road.table.push([far, p.s * scale]); }

  /* dashes, each a different length */
  const r = rng(road.seed + 3); road.dash = []; let run = 0, n = 0;
  while (run < road.total + 40) { const on = (n++ % 7 === 4 ? 21 : 10) + r() * 8, gap = 7.5 + r() * 4.5; road.dash.push(on, gap); run += on + gap; }
  return true;
}

function draw(road, L) {
  const { line, head, dash, total } = road, out = [];
  let run = 0;
  for (let i = 0; i < dash.length; i += 2) {
    const on = dash[i], gap = dash[i + 1];
    if (run + on >= L) { out.push(Math.max(0, L - run).toFixed(1)); break; }
    out.push(on.toFixed(1));
    if (run + on + gap >= L) break;
    out.push(gap.toFixed(1)); run += on + gap;
  }
  if (out.length % 2 === 0) out.push('0');
  out.push((total + 60).toFixed(0));
  line.style.strokeDasharray = out.join(' ');
  if (L > 14) {
    const a = line.getPointAtLength(Math.max(0, L - 9)), b = line.getPointAtLength(L);
    head.setAttribute('transform', `translate(${b.x.toFixed(1)} ${b.y.toFixed(1)}) rotate(${(Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI).toFixed(1)})`);
    road.svg.classList.add('is-drawn');
  } else road.svg.classList.remove('is-drawn');
  for (const st of road.stops) if (!st.done && L >= st.at - 3) { st.done = true; st.el.classList.add('is-reached'); }
}

/* How much of the line should be drawn for the current scroll position. */
function wanted(road) {
  const r = road.host.getBoundingClientRect(), vh = window.innerHeight;
  if (road.mode === 'map') return road.total * Math.min(1, Math.max(0, (vh * 0.84 - r.top) / (r.height + vh * 0.26)));
  const y = vh * 0.6 - r.top, t = road.table;
  if (!t.length || y <= t[0][0]) return 0;
  if (y >= t[t.length - 1][0]) return road.total;
  let lo = 0, hi = t.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (t[mid][0] <= y) lo = mid; else hi = mid; }
  const span = t[hi][0] - t[lo][0];
  return t[lo][1] + (span > 0 ? (y - t[lo][0]) / span : 0) * (t[hi][1] - t[lo][1]);
}

export function initRoads({ still }) {
  const roads = [...document.querySelectorAll('[data-road-host]')].map((host, i) => ({
    host, mode: host.dataset.roadHost, svg: host.querySelector('.road'), line: host.querySelector('.road__line'), head: host.querySelector('.road__head'),
    seed: 41 + i * 17, total: 0, at: 0, ok: false, stops: [], table: [], dash: [],
  })).filter(r => r.svg && r.line);
  if (!roads.length) return;

  let raf = 0;
  const frame = () => {
    raf = 0; let busy = false;
    for (const road of roads) {
      if (!road.ok) continue;
      const want = still ? road.total : wanted(road), gap = want - road.at;
      if (Math.abs(gap) < 0.6 && road.painted) continue;
      road.at = still || Math.abs(gap) < 0.6 ? want : road.at + gap * 0.2;
      draw(road, road.at); road.painted = true;
      if (road.at !== want) busy = true;
    }
    if (busy) raf = requestAnimationFrame(frame);
  };
  const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };
  const rebuild = () => {
    for (const road of roads) { const done = road.stops.filter(s => s.done).map(s => s.el); road.ok = build(road); road.painted = false; for (const s of road.stops) if (done.includes(s.el)) s.done = true; if (road.at > road.total) road.at = road.total; }
    kick();
  };

  rebuild();
  let timer = 0;
  const later = () => { clearTimeout(timer); timer = setTimeout(rebuild, 140); };
  if ('ResizeObserver' in window) { const ro = new ResizeObserver(later); roads.forEach(r => ro.observe(r.host)); }
  window.addEventListener('resize', later);
  window.addEventListener('load', later);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(later);
  if (!still) window.addEventListener('scroll', kick, { passive: true });
}
