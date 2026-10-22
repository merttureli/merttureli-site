/* plotter.js — a pen plotter that draws CHARGER's front view from the explorer's
   own wire data, part by part, as the bytes of assembly.bin arrive.

   Pipeline per part (all pure, testable in Node):
     1. read Float32Array(buffer, wire.offset, wire.count) as line-segment pairs
     2. orthographic front projection: model x -> svg x, model -y -> svg y (nose up)
     3. quantise endpoints to QUANTUM_MM, drop edge-on segments, dedupe both directions
     4. chain segments that share endpoints into polylines
     5. order polylines nearest-neighbour from the pen's last position (either end)
     6. cut the ordered list into <path> chunks of at most maxCommands commands

   Drawing: every chunk is a <path> with stroke-dasharray = its length and
   stroke-dashoffset animated length -> 0 through the Web Animations API at a
   constant pen speed; only one chunk animates at a time, so the browser never
   re-dashes more than one path per frame. A pen head follows getPointAtLength
   once per animation frame while a chunk is plotting.

   Units: the bin stores positions in metres (nose tip y = +0.5707); the json
   bounds are millimetres. The svg user unit is the millimetre, so viewBox comes
   straight from the bounds and path lengths are millimetres. Stats are reported
   in model units (metres): PEN TRAVEL 69.86 M. */

export const EXTERIOR_IDS = [0, 1, 2, 6, 7, 8, 9, 10, 11, 18, 19];

const MM_PER_UNIT = 1000;      // model units (metres) -> svg user units (millimetres)
const QUANTUM_MM = 0.02;       // endpoint grid for dedupe and chaining; 0.02 mm is far below a screen pixel at any size this draws at
const MAX_COMMANDS = 2500;     // commands per <path>; keeps re-dashing one animating path under a millisecond
const KEY_HALF = 1 << 19;      // integer key packing: coordinates live within ±524,288 quantum steps (±10.5 m at 0.02 mm)
const KEY_SPAN = 1 << 20;
const DEFAULT_SPEED = 80;      // model units per second (80 m/s of pen-down travel: about 0.9 s for the whole exterior)
const PEN_RADIUS_PX = 3;       // pen head ring radius in CSS px
const STROKE_PX = 1;           // plotted line weight in CSS px

/* Project, quantise and dedupe one part's wire segments.
   Returns integer endpoint arrays in quantum steps (y already flipped). */
export function projectSegments(f32, quantum = QUANTUM_MM) {
  const q = MM_PER_UNIT / quantum;          // model units -> quantum steps
  const n = (f32.length / 6) | 0;           // two xyz triples per segment
  const seen = new Map();                   // packed first endpoint -> packed second endpoints already kept
  const ax = [], ay = [], bx = [], by = [];
  let dropped = 0;
  for (let i = 0; i < n; i++) {
    const o = i * 6;
    let x0 = Math.round(f32[o] * q), y0 = Math.round(-f32[o + 1] * q);
    let x1 = Math.round(f32[o + 3] * q), y1 = Math.round(-f32[o + 4] * q);
    if (x0 === x1 && y0 === y1) { dropped++; continue; }           // edge-on: its projection is a point
    if (x0 > x1 || (x0 === x1 && y0 > y1)) { [x0, x1] = [x1, x0]; [y0, y1] = [y1, y0]; }   // canonical direction so A->B and B->A collide
    const ka = pack(x0, y0), kb = pack(x1, y1);
    const list = seen.get(ka);
    if (list) { if (list.includes(kb)) { dropped++; continue; } list.push(kb); } else seen.set(ka, [kb]);
    ax.push(x0); ay.push(y0); bx.push(x1); by.push(y1);
  }
  return { ax, ay, bx, by, count: ax.length, dropped, raw: n };
}
function pack(x, y) { return (x + KEY_HALF) * KEY_SPAN + (y + KEY_HALF); }

/* Chain segments sharing an endpoint into polylines. Each polyline is a flat
   array [x0, y0, x1, y1, ...] in quantum steps. */
export function chainSegments(seg) {
  const { ax, ay, bx, by, count } = seg;
  const nodes = new Map();                  // packed endpoint -> segment indices touching it
  const touch = (k, i) => { const l = nodes.get(k); if (l) l.push(i); else nodes.set(k, [i]); };
  for (let i = 0; i < count; i++) { touch(pack(ax[i], ay[i]), i); touch(pack(bx[i], by[i]), i); }
  const used = new Uint8Array(count);
  const polylines = [];
  for (let i = 0; i < count; i++) {
    if (used[i]) continue;
    used[i] = 1;
    const head = [ax[i], ay[i]], tail = [bx[i], by[i]];
    const fwd = [], back = [];
    // grow from the tail forward, then from the head backward
    for (const [end, out] of [[tail, fwd], [head, back]]) {
      let x = end[0], y = end[1];
      for (;;) {
        const list = nodes.get(pack(x, y));
        let next = -1;
        for (const j of list) if (!used[j]) { next = j; break; }
        if (next < 0) break;
        used[next] = 1;
        if (ax[next] === x && ay[next] === y) { x = bx[next]; y = by[next]; } else { x = ax[next]; y = ay[next]; }
        out.push(x, y);
      }
    }
    const pts = [];
    for (let k = back.length - 2; k >= 0; k -= 2) pts.push(back[k], back[k + 1]);
    pts.push(head[0], head[1], tail[0], tail[1]);
    for (let k = 0; k < fwd.length; k++) pts.push(fwd[k]);
    polylines.push(pts);
  }
  return polylines;
}

/* Order polylines nearest-neighbour from a start point, flipping a polyline when
   its far end is closer. Brute force: the biggest part (the motor mount) has about
   1,100 polylines, so the scan stays under a few milliseconds. Returns the ordered
   list plus pen-up travel in quantum steps. */
export function orderPolylines(polylines, start = [0, 0]) {
  const n = polylines.length;
  const sx = new Float64Array(n), sy = new Float64Array(n), ex = new Float64Array(n), ey = new Float64Array(n);
  for (let i = 0; i < n; i++) { const p = polylines[i]; sx[i] = p[0]; sy[i] = p[1]; ex[i] = p[p.length - 2]; ey[i] = p[p.length - 1]; }
  const done = new Uint8Array(n);
  const order = [];
  let x = start[0], y = start[1], up = 0;
  for (let step = 0; step < n; step++) {
    let best = -1, bestD = Infinity, flip = false;
    for (let i = 0; i < n; i++) {
      if (done[i]) continue;
      const d0 = (sx[i] - x) ** 2 + (sy[i] - y) ** 2;
      const d1 = (ex[i] - x) ** 2 + (ey[i] - y) ** 2;
      if (d0 < bestD) { bestD = d0; best = i; flip = false; }
      if (d1 < bestD) { bestD = d1; best = i; flip = true; }
    }
    done[best] = 1;
    up += Math.sqrt(bestD);
    let p = polylines[best];
    if (flip) { const r = []; for (let k = p.length - 2; k >= 0; k -= 2) r.push(p[k], p[k + 1]); p = r; }
    order.push(p);
    x = p[p.length - 2]; y = p[p.length - 1];
  }
  return { order, up, end: [x, y] };
}

/* Build one part: returns svg path chunks (d strings in millimetres) and stats. */
export function buildPart(f32, { quantum = QUANTUM_MM, maxCommands = MAX_COMMANDS, start = [0, 0] } = {}) {
  const seg = projectSegments(f32, quantum);
  const polylines = chainSegments(seg);
  const { order, up, end } = orderPolylines(polylines, [start[0] / quantum, start[1] / quantum]);
  const chunks = [];
  let d = [], commands = 0, length = 0, travel = 0;
  const fmt = (v) => (v * quantum).toFixed(2);
  const close = () => { if (commands) chunks.push({ d: d.join(''), length, commands }); d = []; commands = 0; length = 0; };
  for (const p of order) {
    if (commands + p.length / 2 > maxCommands && commands) close();
    d.push(`M${fmt(p[0])} ${fmt(p[1])}`); commands++;
    for (let k = 2; k < p.length; k += 2) {
      d.push(`L${fmt(p[k])} ${fmt(p[k + 1])}`); commands++;
      const l = Math.hypot(p[k] - p[k - 2], p[k + 1] - p[k - 1]) * quantum;   // millimetres
      length += l; travel += l;
    }
  }
  close();
  return { chunks, segments: seg.count, polylines: polylines.length, travel, travelUp: up * quantum, end: [end[0] * quantum, end[1] * quantum], dropped: seg.dropped, raw: seg.raw };
}

/* Byte range of a part's wire data in assembly.bin. */
export function wireRange(part) { return [part.wire.offset, part.wire.offset + part.wire.count * 4]; }

/* The live plotter. svg: the host <svg>; it must fill its parent box, because the
   plotter adds two absolutely positioned siblings over it: a second <svg> that holds
   only the chunk being plotted (its own compositor layer, so re-dashing one path
   never repaints the finished drawing) and an HTML pen head moved with a transform.
   json: parsed assembly.json. order: part ids in plotting order. tier: governor tier
   (0 draws instantly, 1 drops the pen head, 2 and 3 run everything). */
export function createPlotter(svg, { json, order = EXTERIOR_IDS, speed = DEFAULT_SPEED, tier = 3, quantum = QUANTUM_MM, maxCommands = MAX_COMMANDS, margin = 30 } = {}) {
  const NS = 'http://www.w3.org/2000/svg';
  const parts = order.map((id) => json.parts.find((p) => p.id === id)).filter((p) => p && p.wire);
  // viewBox in millimetres from the json bounds; y flipped so the nose points up
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of parts) {
    const [lo, hi] = p.bounds;
    minX = Math.min(minX, lo[0]); maxX = Math.max(maxX, hi[0]);
    minY = Math.min(minY, -hi[1]); maxY = Math.max(maxY, -lo[1]);
  }
  if (!parts.length) { minX = minY = -1; maxX = maxY = 1; }
  const vb = [minX - margin, minY - margin, maxX - minX + margin * 2, maxY - minY + margin * 2];
  const viewBox = vb.map((v) => v.toFixed(2)).join(' ');
  for (const a of [['viewBox', viewBox], ['preserveAspectRatio', 'xMidYMid meet'], ['aria-hidden', 'true']]) svg.setAttribute(a[0], a[1]);
  svg.classList.add('bt-svg-ink');
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  const parent = svg.parentNode;
  if (parent && parent.nodeType === 1 && getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
  const live = document.createElementNS(NS, 'svg');
  for (const a of [['viewBox', viewBox], ['preserveAspectRatio', 'xMidYMid meet'], ['aria-hidden', 'true'], ['class', 'bt-svg bt-svg-live']]) live.setAttribute(a[0], a[1]);
  const pen = document.createElement('div');
  pen.className = 'bt-pen'; pen.setAttribute('aria-hidden', 'true'); pen.hidden = true;
  svg.after(live, pen);

  const stats = { parts: parts.length, arrived: 0, segments: 0, polylines: 0, chunks: 0, travel: 0, travelUp: 0, drawn: 0, pen: [0, 0], busy: false, done: false, buildMs: 0, raw: 0 };
  const built = new Set();
  const items = [];                 // scheduled chunks in pen order: { path, chunk, part, anim, start, end, settled }
  let cursor = 0;                   // first item that may still be plotting
  let penFreeAt = 0;                // timeline time (ms) when the last scheduled chunk ends
  let settledLength = 0;            // millimetres plotted by settled chunks
  let penEnd = [0, 0];              // where the pen was left, millimetres
  let raf = 0, visible = true, destroyed = false;
  let scale = 1, ox = 0, oy = 0;    // mm -> CSS px mapping of the host svg box
  let speedMm = speed * MM_PER_UNIT;
  let currentTier = tier;
  const instant = () => !Number.isFinite(speedMm) || currentTier <= 0;
  const timeNow = () => document.timeline?.currentTime ?? performance.now();

  function el(name, attrs) { const e = document.createElementNS(NS, name); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; }

  /* Stroke weight in user units so the plotted line stays STROKE_PX wide at any size,
     and the mm -> px mapping for the pen head (xMidYMid meet: centred, uniform scale). */
  function fit() {
    const r = svg.getBoundingClientRect();
    if (!r.width || !r.height) return;
    scale = Math.min(r.width / vb[2], r.height / vb[3]);   // CSS px per millimetre
    ox = (r.width - vb[2] * scale) / 2; oy = (r.height - vb[3] * scale) / 2;
    const sw = (STROKE_PX / scale).toFixed(4);
    svg.style.setProperty('--bt-sw', sw); live.style.setProperty('--bt-sw', sw);
    pen.style.width = pen.style.height = `${PEN_RADIUS_PX * 2}px`;
  }
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null;
  ro?.observe(svg);
  fit();
  const io = typeof IntersectionObserver === 'function' ? new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) schedule(); else stopLoop(); }) : null;
  io?.observe(svg);

  /* Feed the bytes received so far; builds every part whose range is complete. */
  function feed(buffer, received = buffer.byteLength) {
    if (destroyed) return;
    for (const p of parts) {
      if (built.has(p.id)) continue;
      const [a, b] = wireRange(p);
      if (received < b || b > buffer.byteLength) continue;
      built.add(p.id);
      const t0 = performance.now();
      const f32 = new Float32Array(buffer, a, p.wire.count);
      const part = buildPart(f32, { quantum, maxCommands, start: penEnd });
      stats.buildMs += performance.now() - t0;
      penEnd = part.end;
      stats.arrived++; stats.segments += part.segments; stats.polylines += part.polylines; stats.chunks += part.chunks.length;
      stats.travel += part.travel / MM_PER_UNIT; stats.travelUp += part.travelUp / MM_PER_UNIT; stats.raw += part.raw;
      for (const chunk of part.chunks) enqueue(p, chunk);
    }
    stats.done = stats.arrived === parts.length && cursor >= items.length;
  }

  /* Place a chunk on the document timeline right after the previous one. The start
     time is set explicitly so there is no play-pending frame between chunks: the pen
     runs at constant speed across parts, with pen-up moves taking zero time. */
  function enqueue(part, chunk) {
    const path = el('path', { class: 'bt-stroke', d: chunk.d, 'data-part': part.id, 'data-state': 'queued' });
    const item = { path, chunk, part, anim: null, start: 0, end: 0, settled: false };
    items.push(item);
    if (instant()) { svg.appendChild(path); settle(item); advance(); return; }   // advance here: no rAF runs in instant mode
    path.style.strokeDasharray = `${chunk.length}`;
    path.style.strokeDashoffset = `${chunk.length}`;
    path.style.visibility = 'hidden';                     // nothing of a queued chunk is painted
    live.appendChild(path);
    const now = timeNow();
    const start = Math.max(now, penFreeAt);
    const duration = Math.max(1, chunk.length / speedMm * 1000);
    let anim;
    try {
      anim = path.animate([{ strokeDashoffset: chunk.length, visibility: 'visible' }, { strokeDashoffset: 0, visibility: 'visible' }], { duration, easing: 'linear', fill: 'forwards' });
      anim.startTime = start;
    } catch { svg.appendChild(path); settle(item); advance(); return; }
    item.anim = anim; item.start = start; item.end = start + duration;
    penFreeAt = item.end;
    anim.onfinish = () => { if (!item.settled) { settle(item); advance(); } };
    stats.busy = true;
    schedule();
  }
  function settle(item) {
    if (item.settled) return;
    item.settled = true;
    const { path, chunk } = item;
    path.style.strokeDasharray = 'none';
    path.style.strokeDashoffset = '0';
    path.style.visibility = '';
    path.setAttribute('data-state', 'done');
    if (item.anim) { try { item.anim.cancel(); } catch {} item.anim = null; }
    if (path.parentNode !== svg) svg.appendChild(path);
    settledLength += chunk.length;
    stats.drawn = settledLength / MM_PER_UNIT;
  }
  function advance() {
    while (cursor < items.length && items[cursor].settled) cursor++;
    if (cursor >= items.length) { stats.busy = false; stats.done = stats.arrived === parts.length; pen.hidden = true; stopLoop(); }
  }

  /* Pen head: one getPointAtLength per frame on the chunk being plotted. */
  function loop() {
    raf = 0;
    if (!visible || destroyed || currentTier < 2) return;
    advance();
    if (cursor >= items.length) return;
    const it = items[cursor];
    const now = timeNow();
    if (now >= it.start) {
      const progress = Math.min(1, (now - it.start) / (it.end - it.start));
      const dist = progress * it.chunk.length;
      try {
        const pt = it.path.getPointAtLength(dist);
        pen.style.transform = `translate(${(ox + (pt.x - vb[0]) * scale - PEN_RADIUS_PX).toFixed(2)}px, ${(oy + (pt.y - vb[1]) * scale - PEN_RADIUS_PX).toFixed(2)}px)`;
        pen.hidden = false;
        stats.pen[0] = pt.x; stats.pen[1] = pt.y;
      } catch {}
      stats.drawn = (settledLength + dist) / MM_PER_UNIT;
    }
    schedule();
  }
  function schedule() { if (!raf && !destroyed && visible && currentTier >= 2 && cursor < items.length) raf = requestAnimationFrame(loop); }
  function stopLoop() { if (raf) cancelAnimationFrame(raf); raf = 0; }

  /* Re-time every unsettled chunk from the current moment at the new speed: the
     active chunk keeps its progress and the rest are re-packed back to back after
     it (never left on their old schedule, so a speed increase has no idle gap). */
  function retime() {
    const now = timeNow();
    let t = now;
    for (let i = cursor; i < items.length; i++) {
      const it = items[i];
      if (it.settled || !it.anim) continue;
      if (now >= it.end) { settle(it); continue; }         // finished, onfinish not yet delivered
      const duration = Math.max(1, it.chunk.length / speedMm * 1000);
      let start = t;
      if (now > it.start && now < it.end) start = now - (now - it.start) / (it.end - it.start) * duration;   // preserve progress
      try { it.anim.effect.updateTiming({ duration }); it.anim.startTime = start; } catch {}
      it.start = start; it.end = start + duration;
      t = it.end;
    }
    penFreeAt = Math.max(t, now);
    advance();
  }
  function setSpeed(unitsPerSecond) {
    speedMm = unitsPerSecond * MM_PER_UNIT;
    if (instant()) { finish(); return; }
    retime();
  }
  function setTier(t) {
    currentTier = t | 0;
    if (currentTier <= 0) { finish(); return; }
    if (currentTier >= 2) schedule(); else { stopLoop(); pen.hidden = true; }
  }
  /* Draw everything that has arrived immediately. */
  function finish() {
    for (let i = cursor; i < items.length; i++) settle(items[i]);
    penFreeAt = 0;
    advance();
  }
  function destroy() {
    if (destroyed) return;
    destroyed = true;
    for (const it of items) if (it.anim) { try { it.anim.cancel(); } catch {} it.anim = null; }
    items.length = 0;
    stopLoop();
    ro?.disconnect(); io?.disconnect();
    live.remove(); pen.remove();
    while (svg.firstChild) svg.removeChild(svg.firstChild);
  }
  return { feed, setSpeed, setTier, finish, fit, destroy, stats, parts, viewBox: vb, get scale() { return scale; }, get queued() { return items.length - cursor; } };
}
