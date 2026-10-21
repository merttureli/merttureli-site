/* contact-sheet.js — a 36-exposure contact sheet with an honest loupe.
   mountContactSheet(root, { frames }) builds, on `root`:
     - a board-grey sheet of 36 cells (cell 00 is the leader with the roll legend),
       one <img loading=lazy> per frame on a black film rebate with edge print
       (zero-padded frame number, roll tag, title, native size) and + ticks drawn
       by an SVG overlay at every grid intersection;
     - a 160 px loupe (canvas 2D, imageSmoothingEnabled = false) that samples the
       DECODED FULL FILE at one file pixel per CSS pixel (times an integer zoom) and
       prints what it is doing: "NATIVE 520 × 346 PX / 4.0 ×". Hover on fine
       pointers, press-and-hold on coarse ones, L on a focused frame for keyboards;
     - a native <dialog> viewer with prev / next, arrow keys, swipe and Escape;
     - I / O range marks (grease-pencil circles in the livery) and EXPORT, which
       composes the marked frames into a 2400 px wide PNG on a hidden canvas.
   Decoding goes through createImageBitmap behind an LRU of 12 resident bitmaps.
   No WebGL anywhere. No free-running rAF: the loupe draws once per pointer frame
   and nothing animates while idle. Emits sheet:open / sheet:close on the bus.
   Returns { open, close, destroy, ... } — see the API object at the bottom. */
import { bus } from './core/bus.js';
import { governor } from './core/governor.js';

const CELLS = 36;                 // exposures on the sheet, including the leader
const LRU_LIMIT = 12;             // resident decoded bitmaps
const HOLD_MS = 260;              // press-and-hold before the loupe appears on touch
const HOLD_SLOP_PX = 8;           // finger travel that cancels the hold (it is a scroll)
const SWIPE_PX = 48;              // horizontal travel that turns a drag into prev / next
const LOUPE_OFFSET_PX = 22;       // loupe box offset from a fine pointer
const LOUPE_LIFT_PX = 90;         // loupe bottom edge above the finger on touch
const EXPORT_W = 2400;            // PNG width in px
const NUDGE_FILE_PX = 10;         // arrow-key step for a pinned loupe, in file px

const pad2 = (n) => String(n).padStart(2, '0');
const isEditable = (el) => !!el && (el.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]') !== null);
const mediaType = (t) => (t === 'image/jpeg' ? 'JPEG' : t === 'image/webp' ? 'WEBP' : t === 'image/png' ? 'PNG' : (t || 'FILE').replace('image/', '').toUpperCase());
const kb = (b) => (b / 1024).toFixed(1);

/* ---------- decoded-image cache: an LRU of resident bitmaps ---------- */
function createLoader(limit = LRU_LIMIT) {
  const map = new Map();                       // src -> entry, insertion order = recency
  const stats = { residents: 0, limit, bytes: 0, decodes: 0, evictions: 0, inflight: 0 };
  async function decode(frame) {
    stats.inflight++;
    try {
      const res = await fetch(frame.src);
      if (!res.ok) throw new Error(`${res.status} ${frame.file}`);
      const blob = await res.blob();
      const t0 = performance.now();
      let source;
      if (typeof createImageBitmap === 'function') source = await createImageBitmap(blob);
      else {                                   // very old engines: an <img> works with drawImage too
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.src = url;
        await img.decode();
        source = img; source.close = () => URL.revokeObjectURL(url);
      }
      stats.decodes++;
      return { source, w: source.width || source.naturalWidth, h: source.height || source.naturalHeight, bytes: blob.size, type: blob.type, decodeMs: performance.now() - t0 };
    } finally { stats.inflight--; }
  }
  function refresh() {
    stats.residents = map.size;
    let b = 0; for (const e of map.values()) if (e.value) b += e.value.bytes;
    stats.bytes = b;
  }
  return {
    stats,
    /* Resolve the decoded image for a frame, touching it to most-recent. */
    get(frame) {
      const key = frame.src;
      let e = map.get(key);
      if (e) { map.delete(key); map.set(key, e); return e.promise; }
      e = { value: null, promise: null };
      e.promise = decode(frame).then((v) => { e.value = v; refresh(); return v; }, (err) => { map.delete(key); refresh(); throw err; });
      map.set(key, e);
      while (map.size > limit) {
        const [k, old] = map.entries().next().value;
        map.delete(k); stats.evictions++;
        old.promise.then((v) => v.source.close?.()).catch(() => {});
      }
      refresh();
      return e.promise;
    },
    peek(frame) { const e = map.get(frame.src); return e && e.value ? e.value : null; },
    clear() { for (const e of map.values()) e.promise.then((v) => v.source.close?.()).catch(() => {}); map.clear(); refresh(); },
  };
}

/* ---------- a grease-pencil ellipse: 2 px stroke, 0.6 px jitter, deterministic per frame ---------- */
function pencilPath(cx, cy, rx, ry, seed) {
  let s = (seed * 9301 + 49297) % 233280;
  const rand = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const parts = [];
  const start = -0.35, end = Math.PI * 2 + 0.55;     // the hand overshoots the start by about 50°
  for (let a = start; a <= end; a += Math.PI / 15) {
    const jx = (rand() - 0.5) * 1.2, jy = (rand() - 0.5) * 1.2;   // ±0.6 px
    const drift = 1 + (a - start) / (end - start) * 0.06;         // the second lap sits 6% outside the first
    parts.push(`${parts.length ? 'L' : 'M'}${(cx + Math.cos(a) * rx * drift + jx).toFixed(1)} ${(cy + Math.sin(a) * ry * drift + jy).toFixed(1)}`);
  }
  return parts.join(' ');
}

export function mountContactSheet(root, { frames, columns = 0, loupeSize = 160, zoom = 2 } = {}) {
  if (!root || !frames || !frames.length) throw new Error('mountContactSheet needs a root element and frames');
  const coarse = matchMedia('(pointer: coarse)').matches;
  const loader = createLoader();
  const subscribers = new Set();
  const byIndex = new Map(frames.map((f) => [f.index, f]));
  const rolls = [];
  for (const f of frames) if (!rolls.some((r) => r.id === f.roll)) rolls.push({ id: f.roll, number: f.rollNumber, label: f.rollLabel, count: f.rollCount });

  const state = {
    pointer: coarse ? 'coarse' : 'fine',
    tier: governor.tier,
    hovered: 0, focused: 0, current: 0,
    loupe: { visible: false, mode: 'off', index: 0, u: 0.5, v: 0.5, x: 0, y: 0, native: [0, 0], mag: 0, zoom, size: loupeSize, dpr: 1, pending: false, decodeMs: 0, bytes: 0, type: '' },
    viewer: { open: false, index: 0, scale: 0 },
    marks: { in: null, out: null, count: 0 },
    cache: loader.stats,
    export: { busy: false, frames: 0, width: 0, height: 0, bytes: 0, ms: 0, at: '' },
    events: { open: 0, close: 0 },
  };

  /* ---------- DOM ---------- */
  root.classList.add('cs');
  const rollLegend = rolls.map((r) => `<span class="cs-head-roll">ROLL ${pad2(r.number)} / ${r.label} / ${pad2(r.count)} FRAMES</span>`).join('');
  root.innerHTML = `
    <div class="cs-sheet">
      <header class="cs-head">
        <p class="cs-head-l"><span class="cs-head-title">Contact sheet</span><span class="cs-head-sub">${pad2(frames.length)} frames / ${pad2(rolls.length)} rolls / ${CELLS} cells</span></p>
        <p class="cs-head-r">${rollLegend}</p>
      </header>
      <div class="cs-gridwrap">
        <ol class="cs-grid" start="0" aria-label="Contact sheet, ${frames.length} frames">
          <li class="cs-cell cs-leader" data-index="0">
            <span class="cs-edge"><span class="cs-num">00</span><span class="cs-tag">Leader</span></span>
            <dl class="cs-legend">
              ${rolls.map((r) => `<div><dt>R${pad2(r.number)}</dt><dd>${r.id}</dd><dd>${pad2(r.count)}</dd></div>`).join('')}
              <div class="cs-legend-sum"><dt>${pad2(frames.length)} frames</dt><dd>SRC: FILE</dd></div>
            </dl>
          </li>
          ${frames.map((f) => cellHtml(f)).join('')}
        </ol>
        <svg class="cs-ticks" aria-hidden="true" focusable="false"><path d=""/></svg>
      </div>
    </div>
    <div class="cs-bar">
      <div class="cs-bar-l">
        <p class="cs-marks" aria-live="polite">No marks / I sets in / O sets out</p>
        <p class="cs-hint">Hover for the loupe${coarse ? ' (press and hold on touch)' : ''} / click opens the viewer / L pins the loupe on a focused frame / export writes the marked frames as a PNG</p>
      </div>
      <div class="cs-actions">
        <button class="cs-btn" type="button" data-act="clear">Clear</button>
        <button class="cs-btn cs-btn-primary" type="button" data-act="export">Export PNG</button>
      </div>
    </div>`;
  /* The loupe and the viewer live on <body>. The sheet is a size container (container-type: inline-size
     in the CSS), and the layout containment that brings would make the sheet the containing block of
     a position: fixed loupe. */
  const loupe = document.createElement('div');
  loupe.className = 'cs-loupe'; loupe.hidden = true; loupe.dataset.mode = 'off'; loupe.setAttribute('aria-hidden', 'true');
  loupe.style.setProperty('--cs-loupe', `${loupeSize}px`);
  loupe.innerHTML = `<canvas class="cs-loupe-glass" width="160" height="160"></canvas><p class="cs-loupe-read"><span></span><span></span><span></span></p>`;
  const dialog = document.createElement('dialog');
  dialog.className = 'cs-viewer'; dialog.setAttribute('aria-label', 'Frame viewer');
  dialog.innerHTML = `
      <div class="cs-viewer-stage"><img class="cs-viewer-img" alt="" decoding="async"></div>
      <div class="cs-viewer-bar">
        <p class="cs-viewer-cap"><span class="cs-viewer-roll"></span><span class="cs-viewer-line"></span></p>
        <div class="cs-viewer-nav">
          <button class="cs-btn cs-btn-dark" type="button" data-nav="-1" aria-label="Previous frame">Prev</button>
          <button class="cs-btn cs-btn-dark" type="button" data-nav="1" aria-label="Next frame">Next</button>
          <button class="cs-btn cs-btn-dark" type="button" data-nav="close">Close</button>
        </div>
      </div>`;
  document.body.append(loupe, dialog);

  function cellHtml(f) {
    const first = f.rollIndex === 1;                       // a roll's first frame gets a tab on its left edge
    const tag = `R${pad2(f.rollNumber)}`;
    return `<li class="cs-cell" data-index="${f.index}" data-roll="${f.roll}"${first ? ' data-roll-start' : ''}>
      <button class="cs-frame" type="button" data-index="${f.index}">
        <img class="cs-img" src="${f.thumb}" width="${f.tw}" height="${f.th}" loading="lazy" decoding="async" alt="${escapeAttr(f.alt)}">
        <span class="cs-edge"><span class="cs-numwrap"><span class="cs-num">${pad2(f.index)}</span><span class="cs-io"></span></span><span class="cs-dims" aria-hidden="true">${f.w} × ${f.h}</span></span>
        <span class="cs-foot"><span class="cs-title">${escapeAttr(f.title)}</span><span class="cs-tag">${tag}</span></span>
        <span class="sr-only">Open frame ${pad2(f.index)} in the viewer, ${f.w} by ${f.h} pixels</span>
      </button>
      <button class="cs-mark" type="button" aria-pressed="false" aria-label="Mark frame ${pad2(f.index)}">Mark</button>
      <svg class="cs-pencil" viewBox="0 0 44 28" aria-hidden="true" focusable="false"><path d="${pencilPath(17, 13, 14, 9.5, f.index)}"/></svg>
    </li>`;
  }
  function escapeAttr(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

  const $ = (sel) => root.querySelector(sel);
  const grid = $('.cs-grid'), ticks = $('.cs-ticks path'), ticksSvg = $('.cs-ticks');
  const glass = loupe.querySelector('.cs-loupe-glass'), readSpans = [...loupe.querySelectorAll('.cs-loupe-read span')];
  const viewerImg = dialog.querySelector('.cs-viewer-img'), viewerRoll = dialog.querySelector('.cs-viewer-roll'), viewerLine = dialog.querySelector('.cs-viewer-line'), viewerStage = dialog.querySelector('.cs-viewer-stage');
  const marksOut = $('.cs-marks');
  const ctx = glass.getContext('2d', { alpha: false });
  if (columns) grid.style.setProperty('--cs-cols', String(columns));
  const cells = new Map();
  for (const li of grid.querySelectorAll('.cs-cell[data-roll]')) {
    const index = +li.dataset.index;
    cells.set(index, { li, button: li.querySelector('.cs-frame'), img: li.querySelector('.cs-img'), io: li.querySelector('.cs-io'), mark: li.querySelector('.cs-mark') });
  }

  /* ---------- notifications (coalesced to one per frame) ---------- */
  let notifyRaf = 0;
  function notify() {
    if (notifyRaf || !subscribers.size) return;
    notifyRaf = requestAnimationFrame(() => { notifyRaf = 0; for (const fn of subscribers) { try { fn(state); } catch (err) { console.error('[contact-sheet] subscriber threw', err); } } });
  }

  /* ---------- + ticks at every grid intersection ---------- */
  let ticksRaf = 0;
  function layoutTicks() {
    ticksRaf = 0;
    const g = grid.getBoundingClientRect();
    if (!g.width) return;
    const cs = getComputedStyle(grid);
    const gx = parseFloat(cs.columnGap) || 0, gy = parseFloat(cs.rowGap) || 0;
    const seen = new Set();
    let d = '';
    for (const li of grid.children) {
      const r = li.getBoundingClientRect();
      const xs = [r.left - g.left - gx / 2, r.right - g.left + gx / 2];
      const ys = [r.top - g.top - gy / 2, r.bottom - g.top + gy / 2];
      for (const x of xs) for (const y of ys) {
        const px = Math.round(x) + 0.5, py = Math.round(y) + 0.5;   // crisp 1 px strokes
        const key = `${px},${py}`;
        if (seen.has(key)) continue;
        seen.add(key);
        d += `M${px - 4} ${py}h8M${px} ${py - 4}v8`;                  // a 9 px +
      }
    }
    ticksSvg.setAttribute('width', String(Math.ceil(g.width)));
    ticksSvg.setAttribute('height', String(Math.ceil(g.height)));
    ticksSvg.style.width = `${g.width}px`; ticksSvg.style.height = `${g.height}px`;
    ticks.setAttribute('d', d);
  }
  function scheduleTicks() { if (!ticksRaf) ticksRaf = requestAnimationFrame(layoutTicks); }
  const ro = 'ResizeObserver' in window ? new ResizeObserver(scheduleTicks) : null;
  ro?.observe(grid); ro?.observe(grid.firstElementChild);
  if (!ro) addEventListener('resize', scheduleTicks);
  scheduleTicks();
  document.fonts?.ready?.then(scheduleTicks);

  /* ---------- geometry: where the file's pixels sit on screen ---------- */
  function drawnRect(index) {
    const f = byIndex.get(index), c = cells.get(index);
    const r = c.img.getBoundingClientRect();                   // the <img> box; object-fit: contain inside it
    const s = Math.min(r.width / f.w, r.height / f.h);         // CSS px per file px (thumb and file share an aspect)
    const dw = f.w * s, dh = f.h * s;
    return { left: r.left + (r.width - dw) / 2, top: r.top + (r.height - dh) / 2, width: dw, height: dh, scale: s };
  }

  /* ---------- the loupe ---------- */
  const lp = state.loupe;
  let hover = null;      // { index, x, y } while a pointer or a held finger is over a frame
  let pinned = null;     // { index, u, v } from the L key
  let forced = null;     // { index, u, v } from the API (the lab's screenshot toggle)
  let loupeRaf = 0, pendingDraw = null;

  function activeTarget() { return hover ? { ...hover, mode: hover.hold ? 'hold' : 'pointer' } : pinned ? { ...pinned, mode: 'pinned' } : forced ? { ...forced, mode: 'forced' } : null; }
  function requestLoupe() { if (!loupeRaf) loupeRaf = requestAnimationFrame(paintLoupe); }
  function hideLoupe() {
    loupe.hidden = true; loupe.dataset.mode = 'off';
    lp.visible = false; lp.mode = 'off';
    notify();
  }
  /* One pass per animation frame: resolve the sample point, position the box, draw the glass, print the readout. */
  function paintLoupe() {
    loupeRaf = 0;
    const t = activeTarget();
    if (!t) { hideLoupe(); return; }
    const f = byIndex.get(t.index);
    if (!f) { hideLoupe(); return; }
    const rect = drawnRect(t.index);
    let x, y, u, v;
    if (t.mode === 'pointer' || t.mode === 'hold') {
      x = t.x; y = t.y;
      u = (x - rect.left) / rect.width; v = (y - rect.top) / rect.height;
    } else {
      u = t.u; v = t.v;
      x = rect.left + u * rect.width; y = rect.top + v * rect.height;
    }
    u = Math.min(1, Math.max(0, u)); v = Math.min(1, Math.max(0, v));
    const size = lp.size, zoom = lp.zoom;
    const dpr = devicePixelRatio || 1;
    const W = Math.round(size * dpr);
    if (glass.width !== W || glass.height !== W) { glass.width = W; glass.height = W; }
    glass.style.width = glass.style.height = `${size}px`;

    // The file: resident or decoding
    let entry = loader.peek(f);
    if (!entry) {
      lp.pending = true;
      loader.get(f).then(() => { if (activeTarget()?.index === f.index) requestLoupe(); }).catch(() => {});
    } else lp.pending = false;

    // Glass: 1 file px = `zoom` CSS px = zoom × dpr device px, nearest-neighbour, window = size / zoom file px
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#0A0A0A'; ctx.fillRect(0, 0, W, W);
    const win = size / zoom;
    const fx = u * f.w, fy = v * f.h;
    const sx = Math.round(fx - win / 2), sy = Math.round(fy - win / 2);     // integer file px so every block is the same size
    if (entry) {
      const cx0 = Math.max(0, sx), cy0 = Math.max(0, sy), cx1 = Math.min(f.w, sx + win), cy1 = Math.min(f.h, sy + win);
      if (cx1 > cx0 && cy1 > cy0) {
        const k = W / win;                                                   // device px per file px
        try { ctx.drawImage(entry.source, cx0, cy0, cx1 - cx0, cy1 - cy0, (cx0 - sx) * k, (cy0 - sy) * k, (cx1 - cx0) * k, (cy1 - cy0) * k); }
        catch { entry = null; lp.pending = true; loader.get(f).then(requestLoupe).catch(() => {}); }   // an evicted bitmap: decode again
      }
    }
    // Reticle: four edge ticks and, when a file pixel is at least 4 device px wide, a box around the centre pixel
    ctx.strokeStyle = 'rgba(255,255,255,.72)'; ctx.lineWidth = Math.max(1, Math.round(dpr));
    const tick = 6 * dpr, m = W / 2;
    ctx.beginPath();
    ctx.moveTo(m, 0); ctx.lineTo(m, tick); ctx.moveTo(m, W); ctx.lineTo(m, W - tick);
    ctx.moveTo(0, m); ctx.lineTo(tick, m); ctx.moveTo(W, m); ctx.lineTo(W - tick, m);
    ctx.stroke();
    const px = zoom * dpr;
    if (px >= 4) { const o = Math.round((fx - sx) * (W / win) / px) * px; const q = Math.round((fy - sy) * (W / win) / px) * px; ctx.strokeRect(o + 0.5, q + 0.5, px - 1, px - 1); }

    // Readout: the truth about the file
    const mag = zoom / rect.scale;                                           // loupe CSS px per sheet CSS px
    readSpans[0].textContent = `NATIVE ${f.w} × ${f.h} PX / ${mag.toFixed(1)} ×`;
    readSpans[1].textContent = entry ? `FRAME ${pad2(f.index)} / ${mediaType(entry.type)} / ${kb(entry.bytes)} KB` : `FRAME ${pad2(f.index)} / DECODING`;
    readSpans[2].textContent = `1 FILE PX : ${zoom} CSS PX / WINDOW ${Math.round(win)} PX`;

    // Position: the glass sits offset from a fine pointer and flips away from the viewport edges; on touch it
    // is lifted above the finger. The box is as wide as its plate with the glass centred in it, so the
    // plate's overhang either side of the glass is taken out before the transform is written.
    loupe.hidden = false; loupe.dataset.mode = t.mode;
    const bw = loupe.offsetWidth || size, bh = loupe.offsetHeight || size + 60;
    const over = Math.max(0, (bw - size) / 2);
    let gl, top;                                                             // gl: the glass's left edge
    if (t.mode === 'hold') { gl = x - size / 2; top = y - LOUPE_LIFT_PX - bh; if (top < 8) top = y + LOUPE_OFFSET_PX; }
    else {
      gl = x + LOUPE_OFFSET_PX; top = y + LOUPE_OFFSET_PX;
      if (gl + size + over > innerWidth - 8) gl = x - LOUPE_OFFSET_PX - size;
      if (top + bh > innerHeight - 8) top = y - LOUPE_OFFSET_PX - bh;
    }
    const left = Math.max(8, Math.min(innerWidth - bw - 8, gl - over));
    top = Math.max(8, top);
    loupe.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`;

    Object.assign(lp, { visible: true, mode: t.mode, index: f.index, u, v, x: Math.round(x), y: Math.round(y), native: [f.w, f.h], mag: +mag.toFixed(2), dpr, decodeMs: entry ? +entry.decodeMs.toFixed(1) : 0, bytes: entry ? entry.bytes : 0, type: entry ? mediaType(entry.type) : '' });
    notify();
  }

  /* pointer: fine pointers hover; touch presses and holds */
  let holdTimer = 0, holdStart = null, holding = false, suppressClick = false;
  function cellFromEvent(e) { const li = e.target.closest?.('.cs-cell[data-roll]'); return li ? +li.dataset.index : 0; }
  function onPointerMove(e) {
    if (e.pointerType === 'touch') return;
    const index = cellFromEvent(e);
    if (!index) { if (hover) { hover = null; requestLoupe(); } return; }
    hover = { index, x: e.clientX, y: e.clientY };
    if (state.hovered !== index) { state.hovered = index; state.current = index; if (state.tier >= 1) loader.get(byIndex.get(index)).catch(() => {}); }
    requestLoupe();
  }
  function onPointerLeave() { if (hover && !holding) { hover = null; state.hovered = 0; requestLoupe(); } }
  function onPointerDown(e) {
    suppressClick = false;                           // a new gesture: only the click that follows a hold is swallowed
    if (e.pointerType !== 'touch') return;
    const index = cellFromEvent(e);
    if (!index) return;
    holdStart = { index, x: e.clientX, y: e.clientY };
    clearTimeout(holdTimer);
    holdTimer = setTimeout(() => {
      holding = true; suppressClick = true;
      hover = { index, x: holdStart.x, y: holdStart.y, hold: true };
      state.hovered = state.current = index;
      requestLoupe();
    }, HOLD_MS);
  }
  function endHold() {
    clearTimeout(holdTimer); holdTimer = 0; holdStart = null;
    if (holding) { holding = false; hover = null; state.hovered = 0; requestLoupe(); }
  }
  function onTouchMove(e) {
    if (holding) {                                   // the first touchmove after a hold is cancelable, so the page never starts scrolling
      const t = e.touches[0];
      if (e.cancelable) e.preventDefault();
      hover = { index: hover.index, x: t.clientX, y: t.clientY, hold: true };
      const index = cellFromPoint(t.clientX, t.clientY);
      if (index) { hover.index = index; state.hovered = state.current = index; }
      requestLoupe();
    } else if (holdStart) {
      const t = e.touches[0];
      if (Math.hypot(t.clientX - holdStart.x, t.clientY - holdStart.y) > HOLD_SLOP_PX) { clearTimeout(holdTimer); holdTimer = 0; holdStart = null; }
    }
  }
  function cellFromPoint(x, y) { const el = document.elementFromPoint(x, y); const li = el?.closest?.('.cs-cell[data-roll]'); return li && grid.contains(li) ? +li.dataset.index : 0; }
  function onContextMenu(e) { if (holding || holdStart) e.preventDefault(); }
  function onScroll() { if (hover && !holding) { hover = null; state.hovered = 0; requestLoupe(); } else if (pinned || forced) requestLoupe(); }

  grid.addEventListener('pointermove', onPointerMove);
  grid.addEventListener('pointerleave', onPointerLeave);
  grid.addEventListener('pointerdown', onPointerDown);
  grid.addEventListener('pointerup', endHold);
  grid.addEventListener('pointercancel', endHold);
  grid.addEventListener('touchmove', onTouchMove, { passive: false });
  grid.addEventListener('touchend', endHold);
  grid.addEventListener('contextmenu', onContextMenu);
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', hideLoupe);

  /* ---------- clicks: open the viewer, mark a frame, toolbar ---------- */
  function onClick(e) {
    const mark = e.target.closest('.cs-mark');
    if (mark) { toggleMark(+mark.closest('.cs-cell').dataset.index); return; }
    const btn = e.target.closest('.cs-frame');
    if (btn) { if (suppressClick) { suppressClick = false; return; } open(+btn.dataset.index); return; }
    const act = e.target.closest('[data-act]');
    if (act) { if (act.dataset.act === 'clear') clearMarks(); else if (act.dataset.act === 'export') exportPng(); }
  }
  root.addEventListener('click', onClick);
  function onFocusIn(e) {
    const btn = e.target.closest?.('.cs-frame');
    if (btn) { state.focused = state.current = +btn.dataset.index; notify(); }
  }
  root.addEventListener('focusin', onFocusIn);

  /* ---------- marks: I and O, a MARK button per cell, grease pencil on the sheet ---------- */
  const mk = state.marks;
  function paintMarks() {
    const lo = mk.in === null ? null : Math.min(mk.in, mk.out ?? mk.in);
    const hi = mk.in === null ? null : Math.max(mk.in, mk.out ?? mk.in);
    mk.count = lo === null ? 0 : hi - lo + 1;
    for (const [index, c] of cells) {
      const inRange = lo !== null && index >= lo && index <= hi;
      const label = lo === null ? '' : index === lo && index === hi ? 'IN / OUT' : index === lo ? 'IN' : index === hi ? 'OUT' : '';
      if (inRange) c.li.dataset.marked = label ? label.replace(' / ', '-').toLowerCase() : 'mid'; else delete c.li.dataset.marked;
      c.io.textContent = label;
      c.mark.setAttribute('aria-pressed', String(inRange));
    }
    marksOut.textContent = lo === null ? 'No marks / I sets in / O sets out' : `Marked ${pad2(lo)} – ${pad2(hi)} / ${pad2(mk.count)} frame${mk.count === 1 ? '' : 's'}${mk.out === null ? ' / O sets out' : ''}`;
    notify();
  }
  function setIn(i) { if (!byIndex.has(i)) return; mk.in = i; if (mk.out !== null && mk.out < i) mk.out = null; paintMarks(); }
  function setOut(i) { if (!byIndex.has(i)) return; if (mk.in === null) mk.in = i; mk.out = i; if (mk.out < mk.in) [mk.in, mk.out] = [mk.out, mk.in]; paintMarks(); }
  function mark(a, b) { if (!byIndex.has(a)) return; mk.in = Math.min(a, b ?? a); mk.out = b === undefined || b === null ? null : Math.max(a, b); paintMarks(); }
  function clearMarks() { mk.in = mk.out = null; paintMarks(); }
  /* The MARK button: first press sets IN, the next sets OUT, a third starts over. */
  function toggleMark(i) {
    if (mk.in === null) setIn(i);
    else if (mk.out === null) { if (i === mk.in) clearMarks(); else setOut(i); }
    else { mk.in = i; mk.out = null; paintMarks(); }
    state.current = i;
  }

  /* ---------- keyboard: I / O, L pins the loupe, arrows nudge it, Escape releases ---------- */
  function onKey(e) {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || isEditable(e.target)) return;
    const k = e.key.toLowerCase();
    const focusedFrame = document.activeElement?.closest?.('.cs-frame');
    const withinSheet = root.contains(document.activeElement) || state.hovered || dialog.open;
    if (k === 'i' || k === 'o') {
      const i = dialog.open ? state.viewer.index : state.hovered || (focusedFrame ? +focusedFrame.dataset.index : 0);
      if (!i) return;
      if (k === 'i') setIn(i); else setOut(i);
      e.preventDefault();
    } else if (k === 'l' && focusedFrame && !dialog.open) {
      const i = +focusedFrame.dataset.index;
      pinned = pinned && pinned.index === i ? null : { index: i, u: 0.5, v: 0.5 };
      if (pinned) loader.get(byIndex.get(i)).catch(() => {});
      requestLoupe(); e.preventDefault();
    } else if (pinned && !dialog.open && withinSheet && (k === 'arrowleft' || k === 'arrowright' || k === 'arrowup' || k === 'arrowdown')) {
      const f = byIndex.get(pinned.index);
      const du = NUDGE_FILE_PX / f.w, dv = NUDGE_FILE_PX / f.h;
      if (k === 'arrowleft') pinned.u -= du; else if (k === 'arrowright') pinned.u += du; else if (k === 'arrowup') pinned.v -= dv; else pinned.v += dv;
      pinned.u = Math.min(1, Math.max(0, pinned.u)); pinned.v = Math.min(1, Math.max(0, pinned.v));
      requestLoupe(); e.preventDefault();
    } else if (k === 'escape' && !dialog.open && (pinned || forced)) {
      pinned = null; forced = null; requestLoupe();
    }
  }
  document.addEventListener('keydown', onKey);

  /* ---------- viewer: a native dialog ---------- */
  const vw = state.viewer;
  let opener = null, swipe = null;
  const wrap = (i) => ((i - 1) % frames.length + frames.length) % frames.length + 1;
  let viewerRaf = 0;
  function renderViewer() {
    const f = byIndex.get(vw.index);
    viewerImg.src = f.src; viewerImg.width = f.w; viewerImg.height = f.h; viewerImg.alt = f.alt;
    viewerImg.style.setProperty('--w', String(f.w)); viewerImg.style.setProperty('--h', String(f.h));   // the CSS caps the display at 2 × native
    viewerRoll.textContent = `ROLL ${pad2(f.rollNumber)} / ${f.rollLabel}`;
    viewerLine.textContent = `${pad2(f.rollIndex)} / ${pad2(f.rollCount)} / ${f.title.toUpperCase()} / ${f.w} × ${f.h} PX`;
    viewerLine.setAttribute('aria-label', `${f.rollIndex} of ${f.rollCount}, ${f.title}, ${f.w} by ${f.h} pixels`);
    for (const d of [-1, 1]) { const n = byIndex.get(wrap(vw.index + d)); if (n) { const im = new Image(); im.src = n.src; } }   // warm the neighbours
    if (!viewerRaf) viewerRaf = requestAnimationFrame(viewerScale);
  }
  /* The caption says at what scale the file is on screen: the box is object-fit: contain, so the picture's scale is the smaller ratio. */
  function viewerScale() {
    viewerRaf = 0;
    if (!dialog.open) return;
    const f = byIndex.get(vw.index);
    const r = viewerImg.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const s = Math.min(r.width / f.w, r.height / f.h);
    viewerRoll.textContent = `ROLL ${pad2(f.rollNumber)} / ${f.rollLabel} / SHOWN AT ${s.toFixed(2)} ×`;
    vw.scale = +s.toFixed(3);
    notify();
  }
  const viewerRo = 'ResizeObserver' in window ? new ResizeObserver(() => { if (dialog.open && !viewerRaf) viewerRaf = requestAnimationFrame(viewerScale); }) : null;
  viewerRo?.observe(viewerImg);
  function open(i) {
    i = wrap(+i || 1);
    vw.index = i; state.current = i;
    renderViewer();
    if (!dialog.open) {
      opener = document.activeElement;
      hover = null; requestLoupe();
      try { dialog.showModal(); } catch { dialog.setAttribute('open', ''); }
      vw.open = true;
      dialog.querySelector('[data-nav="1"]').focus();
    }
    state.events.open++;
    bus.emit('sheet:open', { index: i });
    notify();
  }
  function close() { if (dialog.open) dialog.close(); }
  function onDialogClose() {
    vw.open = false; state.events.close++;
    bus.emit('sheet:close', { index: vw.index });
    if (opener && opener.isConnected && typeof opener.focus === 'function') opener.focus();
    opener = null;
    notify();
  }
  function onDialogClick(e) {
    const nav = e.target.closest('[data-nav]');
    if (nav) { if (nav.dataset.nav === 'close') close(); else open(vw.index + +nav.dataset.nav); return; }
    if (e.target === dialog) close();                     // the backdrop
  }
  function onDialogKey(e) {
    if (e.key === 'ArrowRight') { open(vw.index + 1); e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { open(vw.index - 1); e.preventDefault(); }
    else if (e.key === 'Home') { open(1); e.preventDefault(); }
    else if (e.key === 'End') { open(frames.length); e.preventDefault(); }
  }
  function onSwipeStart(e) { if (e.pointerType === 'mouse' && e.button !== 0) return; swipe = { x: e.clientX, y: e.clientY, id: e.pointerId }; }
  function onSwipeEnd(e) {
    if (!swipe || e.pointerId !== swipe.id) return;
    const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y; swipe = null;
    if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.5) open(vw.index + (dx < 0 ? 1 : -1));
  }
  dialog.addEventListener('close', onDialogClose);
  dialog.addEventListener('click', onDialogClick);
  dialog.addEventListener('keydown', onDialogKey);
  viewerStage.addEventListener('pointerdown', onSwipeStart);
  viewerStage.addEventListener('pointerup', onSwipeEnd);
  viewerStage.addEventListener('pointercancel', () => { swipe = null; });

  /* ---------- export: the marked frames (or all of them) as a 2400 px PNG ---------- */
  const ex = state.export;
  async function exportPng() {
    if (ex.busy) return;
    const lo = mk.in === null ? 1 : Math.min(mk.in, mk.out ?? mk.in);
    const hi = mk.in === null ? frames.length : Math.max(mk.in, mk.out ?? mk.in);
    const picked = frames.filter((f) => f.index >= lo && f.index <= hi);
    ex.busy = true; ex.frames = picked.length; ex.bytes = 0; ex.ms = 0;
    const t0 = performance.now();
    marksOut.textContent = `Export / decoding 00 / ${pad2(picked.length)}`;
    notify();
    try {
      await document.fonts?.load?.('400 16px "IBM Plex Mono"').catch(() => {});
      const blob = await composeSheet(picked, lo, hi, (n) => { marksOut.textContent = `Export / decoding ${pad2(n)} / ${pad2(picked.length)}`; });
      ex.bytes = blob.size; ex.ms = Math.round(performance.now() - t0); ex.at = new Date().toISOString();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'contact-sheet.png'; a.rel = 'noopener';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      marksOut.textContent = `Exported ${pad2(picked.length)} frames / ${ex.width} × ${ex.height} px / ${kb(blob.size)} KB / ${ex.ms} ms`;
    } catch (err) {
      console.error('[contact-sheet] export failed', err);
      marksOut.textContent = 'Export failed / see the console';
    } finally { ex.busy = false; notify(); }
  }
  /* Lays the picked frames out roll by roll, six to a row, on a board-grey sheet with the same edge print as the screen. */
  async function composeSheet(picked, lo, hi, progress) {
    const M = 56, COLS = 6, GAP = 16;                             // px: margin, columns, gutter
    const CW = Math.floor((EXPORT_W - 2 * M - (COLS - 1) * GAP) / COLS);   // 368
    const CH = Math.round(CW * 2 / 3);                            // 3:2 film frame
    const HEAD = 128, ROLLH = 52, FOOT = 72;
    const groups = rolls.map((r) => ({ roll: r, frames: picked.filter((f) => f.roll === r.id) })).filter((g) => g.frames.length);
    const blocks = groups.map((g) => ({ ...g, rows: Math.ceil(g.frames.length / COLS) }));
    const H = M + HEAD + blocks.reduce((s, b) => s + ROLLH + b.rows * (CH + GAP) + GAP, 0) + FOOT + M;
    ex.width = EXPORT_W; ex.height = H;
    const off = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(EXPORT_W, H) : Object.assign(document.createElement('canvas'), { width: EXPORT_W, height: H });
    const c = off.getContext('2d');
    const mono = (px) => `400 ${px}px "IBM Plex Mono", ui-monospace, Menlo, monospace`;
    const INK = '#0A0A0A', BOARD = '#D9D9D9', PAPER = '#FFFFFF';
    c.fillStyle = BOARD; c.fillRect(0, 0, EXPORT_W, H);
    if ('letterSpacing' in c) c.letterSpacing = '0.18em';
    c.fillStyle = INK; c.textBaseline = 'top';
    c.font = mono(30); c.fillText('CONTACT SHEET / MERT TURELI', M, M);
    c.font = mono(16); c.fillStyle = 'rgba(10,10,10,.55)';
    c.fillText(`${pad2(picked.length)} OF ${pad2(frames.length)} FRAMES / ${mk.in === null ? 'NO MARKS, WHOLE SHEET' : `MARKED ${pad2(lo)} – ${pad2(hi)}`} / DIMENSIONS READ FROM THE FILES`, M, M + 46);
    c.textAlign = 'right'; c.fillText(`EXPORTED ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC / MERTTURELI.COM/VX`, EXPORT_W - M, M);
    c.textAlign = 'left';
    let y = M + HEAD, done = 0;
    const tickPts = new Set();
    for (const b of blocks) {
      c.fillStyle = INK; c.font = mono(18);
      c.fillText(`ROLL ${pad2(b.roll.number)} / ${b.roll.label} / ${pad2(b.roll.count)} FRAMES${b.frames.length !== b.roll.count ? ` / ${pad2(b.frames.length)} ON THIS SHEET` : ''}`, M, y);
      c.fillStyle = 'rgba(10,10,10,.18)'; c.fillRect(M, y + 32, EXPORT_W - 2 * M, 1);
      y += ROLLH;
      for (let i = 0; i < b.frames.length; i++) {
        const f = b.frames[i];
        const col = i % COLS, row = Math.floor(i / COLS);
        const x0 = M + col * (CW + GAP), y0 = y + row * (CH + GAP);
        for (const tx of [x0 - GAP / 2, x0 + CW + GAP / 2]) for (const ty of [y0 - GAP / 2, y0 + CH + GAP / 2]) tickPts.add(`${tx},${ty}`);
        c.fillStyle = INK; c.fillRect(x0, y0, CW, CH);
        const entry = await loader.get(f);
        const PADY = 26, PADX = 10;                                    // the rebate the edge print sits on
        const s = Math.min((CW - 2 * PADX) / f.w, (CH - 2 * PADY) / f.h);
        const dw = Math.round(f.w * s), dh = Math.round(f.h * s);
        c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
        c.drawImage(entry.source, x0 + Math.round((CW - dw) / 2), y0 + Math.round((CH - dh) / 2), dw, dh);
        if ('letterSpacing' in c) c.letterSpacing = '0.12em';
        c.font = mono(13); c.fillStyle = 'rgba(255,255,255,.78)';
        c.fillText(pad2(f.index), x0 + 10, y0 + 7);
        c.textAlign = 'right'; c.fillText(`R${pad2(f.rollNumber)} · ${pad2(f.rollIndex)}`, x0 + CW - 10, y0 + 7);
        c.fillStyle = 'rgba(255,255,255,.5)'; c.fillText(`${f.w} × ${f.h} PX`, x0 + CW - 10, y0 + CH - 19);
        c.textAlign = 'left'; c.fillText(f.title.toUpperCase(), x0 + 10, y0 + CH - 19);
        if (f.index >= lo && f.index <= hi && mk.in !== null) {       // the grease pencil, as on screen
          c.strokeStyle = '#D63B08'; c.lineWidth = 3; c.lineCap = 'round'; c.lineJoin = 'round';
          c.stroke(new Path2D(pencilPath(x0 + 22, y0 + 15, 20, 13, f.index)));
          c.fillStyle = '#D63B08'; c.fillText(f.index === lo && f.index === hi ? 'IN / OUT' : f.index === lo ? 'IN' : f.index === hi ? 'OUT' : '', x0 + 48, y0 + 7);
          c.fillStyle = PAPER;
        }
        if ('letterSpacing' in c) c.letterSpacing = '0.18em';
        progress(++done);
      }
      y += b.rows * (CH + GAP) + GAP;
    }
    c.strokeStyle = 'rgba(10,10,10,.5)'; c.lineWidth = 1; c.beginPath();
    for (const key of tickPts) { const [tx, ty] = key.split(',').map(Number); c.moveTo(tx - 6, ty + 0.5); c.lineTo(tx + 6, ty + 0.5); c.moveTo(tx + 0.5, ty - 6); c.lineTo(tx + 0.5, ty + 6); }
    c.stroke();
    c.fillStyle = 'rgba(10,10,10,.55)'; c.font = mono(14);
    c.fillText('EVERY DIMENSION ON THIS SHEET WAS READ FROM THE FILE / THE THUMBNAILS ARE THE FILES, RESAMPLED ONCE FOR PRINT', M, H - M - 20);
    return typeof off.convertToBlob === 'function' ? off.convertToBlob({ type: 'image/png' }) : new Promise((res, rej) => off.toBlob((b) => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/png'));
  }

  /* ---------- governor ---------- */
  const offTier = governor.subscribe(({ tier }) => { state.tier = tier; root.dataset.tier = String(tier); notify(); });

  paintMarks();
  root.dataset.csReady = '1';

  /* ---------- API ---------- */
  const api = {
    state,
    open, close,
    mark, clearMarks, setIn, setOut,
    export: exportPng,
    /* Pin the loupe on a frame at normalised file coordinates (the lab's screenshot toggle). */
    showLoupe(index, u = 0.5, v = 0.5) { if (!byIndex.has(+index)) return; forced = { index: +index, u, v }; loader.get(byIndex.get(+index)).catch(() => {}); requestLoupe(); },
    hideLoupe() { forced = null; pinned = null; requestLoupe(); },
    setZoom(z) { lp.zoom = Math.max(1, Math.min(8, Math.round(+z) || 1)); requestLoupe(); },
    setLoupeSize(px) { lp.size = Math.max(80, Math.min(320, Math.round(+px) || 160)); loupe.style.setProperty('--cs-loupe', `${lp.size}px`); requestLoupe(); },
    setColumns(n) { if (n) grid.style.setProperty('--cs-cols', String(n)); else grid.style.removeProperty('--cs-cols'); scheduleTicks(); requestLoupe(); },
    refresh() { scheduleTicks(); requestLoupe(); },
    subscribe(fn) { subscribers.add(fn); return () => subscribers.delete(fn); },
    destroy() {
      offTier();
      document.removeEventListener('keydown', onKey);
      removeEventListener('scroll', onScroll); removeEventListener('resize', hideLoupe); removeEventListener('resize', scheduleTicks);
      ro?.disconnect(); viewerRo?.disconnect();
      cancelAnimationFrame(loupeRaf); cancelAnimationFrame(ticksRaf); cancelAnimationFrame(notifyRaf); cancelAnimationFrame(viewerRaf);
      clearTimeout(holdTimer);
      grid.removeEventListener('pointermove', onPointerMove); grid.removeEventListener('pointerleave', onPointerLeave);
      grid.removeEventListener('pointerdown', onPointerDown); grid.removeEventListener('pointerup', endHold); grid.removeEventListener('pointercancel', endHold);
      grid.removeEventListener('touchmove', onTouchMove); grid.removeEventListener('touchend', endHold); grid.removeEventListener('contextmenu', onContextMenu);
      root.removeEventListener('click', onClick); root.removeEventListener('focusin', onFocusIn);
      dialog.removeEventListener('close', onDialogClose);
      if (dialog.open) dialog.close();
      loader.clear();
      subscribers.clear();
      loupe.remove(); dialog.remove();
      root.replaceChildren();
      root.classList.remove('cs'); delete root.dataset.csReady; delete root.dataset.tier;
    },
  };
  return api;
}
export default mountContactSheet;
