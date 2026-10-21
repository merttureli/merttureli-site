/* telemetry.js — the telemetry wall: ten cells of live page instrumentation,
   two strip charts on one canvas, a one-line ticker layout, and a plain-text
   snapshot for the console's `status` command.

   Every value is measured from this page in this tab. Nothing here is flight
   data, and the footer says so: LIVE / THIS PAGE / NO ROCKET DATA.

   Cells (label / value / unit):
     FRAME       p50 / p95 ms from governor.stats with a 16.7 ms budget bar
     LONG TASKS  count and last duration, PerformanceObserver('longtask')
     SCROLL V    signed px/s from scroll.state.vy
     VIEWPORT    innerWidth × innerHeight, devicePixelRatio, visualViewport.scale
     NET         bytes transferred and request count, PerformanceObserver('resource')
     T+          mm:ss.t since performance.timeOrigin
     GL          draw calls / triangles from bus.state['stage:render'].info, or a dash
     GOV         governor tier and the reason it was set
     INPUT       coarse or fine pointer, last pointer position from bus.state['pointer:move']
     MEM         JS heap MB from performance.memory (Chrome only), else a dash

   Update policy:
     text cells   a setInterval at textHz (4 Hz); each cell does at most one
                  textContent write per tick and only when the string changed.
                  Paused while the document is hidden or the wall is off screen.
                  At tier 0 the interval drops to 1 Hz.
     strips       a rAF loop that runs only while the canvas is on screen, the
                  document is visible and the tier is 1 or more. It records one
                  frame interval per frame and draws at the tier's rate:
                  tier 3 every frame, tier 2 every 33 ms, tier 1 every 100 ms.
                  At tier 0 there is no loop: samples come from governor:stats
                  (4 Hz, the governor's own loop) and the canvas repaints on
                  scroll:idle, resize, tier change and mount only.
     sr summary   one visually hidden sentence refreshed at most once per second.

   mountTelemetry(root, { layout: 'wall' | 'ticker' | 'auto', budgetMs, textHz, samples })
   returns { snapshot, setLayout, set, refresh, state, destroy }. */
import { bus } from './core/bus.js';
import { governor } from './core/governor.js';
import { scroll } from './core/scroll.js';

const BUDGET_MS = 1000 / 60;                      // 16.7 ms: one frame at 60 Hz
const DRAW_GAP_MS = { 3: 0, 2: 33, 1: 100, 0: Infinity };   // minimum ms between strip draws per tier
const A11Y_MS = 1000;                             // the sr-only summary refreshes at most this often
const FRAME_SCALE_MS = 40;                        // the frame strip's full height, 0 to 40 ms (30 fps sits at 33 ms)
const VY_FLOOR = 500;                             // the velocity strip never zooms closer than ±500 px/s
const NICE_VY = [500, 1000, 1500, 2000, 3000, 5000, 8000];   // velocity strip scales, px/s
const BREAKPOINT = '(max-width: 859.98px)';       // 'auto' layout uses the ticker under 860 px
const DASH = '—';                            // em dash for "no reading"
const MINUS = '−';                           // real minus sign for signed values
const TIMES = '×';
const LONGTASK_OK = typeof PerformanceObserver !== 'undefined' && Array.isArray(PerformanceObserver.supportedEntryTypes) && PerformanceObserver.supportedEntryTypes.includes('longtask');
const RESOURCE_OK = typeof PerformanceObserver !== 'undefined' && Array.isArray(PerformanceObserver.supportedEntryTypes) && PerformanceObserver.supportedEntryTypes.includes('resource');

/* ---------- formatting ---------- */
const fmtInt = (n) => Math.round(n).toLocaleString('en-US');
const fmtSigned = (n) => (n < 0 ? MINUS : n > 0 ? '+' : '') + fmtInt(Math.abs(n));
function fmtBytes(b) {
  if (b >= 1048576) return `${(b / 1048576).toFixed(2)} MB`;
  if (b >= 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${Math.round(b)} B`;
}
/* 412,880 triangles reads as 412.9K in a 22 px cell. */
function fmtCompact(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e4) return `${(n / 1e3).toFixed(1)}K`;
  return fmtInt(n);
}
/* mm:ss.t from milliseconds; minutes keep counting past 59. */
function fmtClock(ms) {
  const t = Math.max(0, ms) / 1000;
  const m = Math.floor(t / 60), s = Math.floor(t % 60), tenth = Math.floor((t * 10) % 10);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${tenth}`;
}
function fmtClockWords(ms) {
  const t = Math.max(0, ms) / 1000;
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return m ? `${m} minute${m === 1 ? '' : 's'} ${s} second${s === 1 ? '' : 's'}` : `${s} second${s === 1 ? '' : 's'}`;
}
const ms1 = (v) => (v > 0 ? v.toFixed(1) : DASH);

/* ---------- a fixed-length ring of Float32 samples ---------- */
class Ring {
  constructor(n) { this.buf = new Float32Array(n); this.n = n; this.head = 0; this.filled = 0; }
  push(v) { this.buf[this.head] = v; this.head = (this.head + 1) % this.n; this.filled = Math.min(this.n, this.filled + 1); }
  /* i = 0 is the oldest kept sample */
  at(i) { return this.buf[(this.head - this.filled + i + this.n) % this.n]; }
  resize(n) {
    const keep = Math.min(n, this.filled), old = [];
    for (let i = this.filled - keep; i < this.filled; i++) old.push(this.at(i));
    this.buf = new Float32Array(n); this.n = n; this.head = 0; this.filled = 0;
    for (const v of old) this.push(v);
  }
  sum() { let s = 0; for (let i = 0; i < this.filled; i++) s += this.at(i); return s; }
  maxAbs() { let m = 0; for (let i = 0; i < this.filled; i++) { const a = Math.abs(this.at(i)); if (a > m) m = a; } return m; }
}

/* ---------- DOM helpers ---------- */
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}
/* One cell: label / value / unit. The FRAME cell also carries the budget bar. */
function makeCell(key, label, withBar) {
  const cell = el('div', 'tel-cell');
  cell.dataset.cell = key;
  const l = el('div', 'tel-label', label);
  const v = el('div', 'tel-value', DASH);
  const u = el('div', 'tel-unit', '');
  cell.append(l, v);
  let bar = null;
  if (withBar) {
    bar = el('div', 'tel-bar');
    bar.append(el('span', 'tel-bar-fill'), el('span', 'tel-bar-over'), el('span', 'tel-bar-p95'), el('span', 'tel-bar-mark'));
    cell.append(bar);
  }
  cell.append(u);
  return { key, cell, v, u, bar, lastV: DASH, lastU: '' };
}
/* textContent is written only when the string changed, so an idle wall costs no DOM work. */
function writeCell(c, value, unit) {
  if (value !== c.lastV) { c.v.textContent = value; c.lastV = value; }
  if (unit !== c.lastU) { c.u.textContent = unit; c.lastU = unit; }
}

export function mountTelemetry(root, { layout = 'wall', budgetMs = BUDGET_MS, textHz = 4, samples = 120 } = {}) {
  if (!root) throw new Error('mountTelemetry: root element required');
  root.classList.add('tel');
  root.replaceChildren();
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'Page telemetry');

  /* ---- options ---- */
  const opt = { budgetMs: clampNum(budgetMs, 4, 100, BUDGET_MS), textHz: clampNum(textHz, 1, 10, 4), samples: Math.round(clampNum(samples, 30, 600, 120)), strips: true };
  function clampNum(v, lo, hi, d) { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; }

  /* ---- the wall ---- */
  const wall = el('div', 'tel-wall');
  wall.setAttribute('aria-hidden', 'true');
  const head = el('div', 'tel-head');
  const headSrc = el('span', 'tel-head-src', `10 ch / ${opt.textHz} Hz / src: this page`);
  head.append(el('span', 'tel-head-title', 'Telemetry'), headSrc);
  const grid = el('div', 'tel-grid');
  const cells = {
    frame: makeCell('frame', 'Frame', true),
    longtasks: makeCell('longtasks', 'Long tasks'),
    scroll: makeCell('scroll', 'Scroll v'),
    viewport: makeCell('viewport', 'Viewport'),
    net: makeCell('net', 'Net'),
    tplus: makeCell('tplus', 'T+'),
    gl: makeCell('gl', 'GL'),
    gov: makeCell('gov', 'Gov'),
    input: makeCell('input', 'Input'),
    mem: makeCell('mem', 'Mem'),
  };
  for (const k in cells) grid.append(cells[k].cell);
  const strips = el('figure', 'tel-strips');
  const canvas = el('canvas', 'tel-canvas');
  canvas.setAttribute('aria-hidden', 'true');
  const stripsLegend = el('figcaption', 'tel-strips-legend', 'Frame ms / scroll px/s');
  strips.append(canvas, stripsLegend);
  const foot = el('div', 'tel-foot');
  foot.append(el('span', 'tel-foot-line', 'Live / this page / no rocket data'), el('span', 'tel-foot-note', 'Measured in your browser / nothing is sent anywhere'));
  wall.append(head, grid, strips, foot);

  /* ---- the ticker and its sheet ---- */
  const ticker = el('div', 'tel-ticker');
  const line = el('span', 'tel-line');
  line.setAttribute('aria-hidden', 'true');
  /* each segment is a label word plus a value; the CSS drops the label words on narrow containers so the line never clips mid-number */
  const seg = {};
  const segOrder = ['frame', 'scroll', 'tplus', 'gov'];
  const segLabel = { frame: 'frame ', scroll: 'scroll ', tplus: '', gov: 'gov ' };
  segOrder.forEach((k, i) => {
    if (i) { const sep = el('span', 'tel-sep', ' / '); sep.dataset.sep = k; line.append(sep); }
    const s = el('span', 'tel-seg');
    s.dataset.seg = k;
    const key = el('span', 'tel-seg-k', segLabel[k]);
    const val = el('span', 'tel-seg-v', DASH);
    s.append(key, val);
    seg[k] = { el: s, val, last: DASH };
    line.append(s);
  });
  const expand = el('button', 'tel-expand');
  expand.append(el('span', 'tel-expand-text', 'Wall'));   // narrow containers keep only the "+" mark; the aria-label carries the name
  expand.type = 'button';
  expand.setAttribute('aria-label', 'Open the telemetry wall');
  expand.setAttribute('aria-expanded', 'false');
  ticker.append(line, expand);
  const sheet = document.createElement('dialog');
  sheet.className = 'tel-sheet on-dark';
  sheet.setAttribute('aria-label', 'Page telemetry');
  const sheetHead = el('div', 'tel-sheet-head');
  const close = el('button', 'tel-close', 'Close');
  close.type = 'button';
  sheetHead.append(el('span', 'tel-sheet-title', 'Telemetry / live / this page'), close);
  sheet.append(sheetHead);

  /* ---- sr-only summary ---- */
  const sr = el('p', 'sr-only tel-sr', 'Page telemetry: measuring.');

  /* ---- state ---- */
  const frameRing = new Ring(opt.samples);        // ms per frame (tiers 1–3) or governor p50 at 4 Hz (tier 0)
  const vyRing = new Ring(opt.samples);           // px/s
  let tier = governor.tier, reason = bus.state['governor:tier']?.reason || 'initial heuristic';
  let mode = layout, currentLayout = 'wall';
  let ctx = null;
  try { ctx = canvas.getContext('2d', { alpha: true }); } catch { ctx = null; }
  if (!ctx) strips.dataset.fallback = 'no-2d';
  let w = 0, h = 0, dpr = 1, theme = null;
  let raf = 0, lastTick = 0, lastDraw = 0, draws = 0, lastDrawMs = 0, frames = 0;
  let canvasVisible = false, rootVisible = true, hidden = document.hidden;
  let textTimer = 0, textRate = 0, lastA11y = 0, ticks = 0;
  let longCount = 0, longLast = 0, longObs = null;
  let netBytes = 0, netCount = 0, netZero = 0, resObs = null;
  let vw = innerWidth, vh = innerHeight, vScale = 1;
  let pointerKind = 'fine';
  let destroyed = false;

  /* ---- observers: long tasks and resource timing ---- */
  if (LONGTASK_OK) {
    try {
      longObs = new PerformanceObserver((list) => { for (const e of list.getEntries()) { longCount++; longLast = e.duration; } });
      longObs.observe({ type: 'longtask', buffered: true });
    } catch { longObs = null; }
  }
  if (RESOURCE_OK) {
    try {
      resObs = new PerformanceObserver((list) => { for (const e of list.getEntries()) addResource(e); });
      resObs.observe({ type: 'resource', buffered: true });
      /* the document itself counts as one request */
      for (const nav of performance.getEntriesByType('navigation')) addResource(nav);
    } catch { resObs = null; }
  }
  function addResource(e) {
    const t = e.transferSize || 0;
    netBytes += t; netCount++; if (!t) netZero++;
  }

  /* ---- pointer kind ---- */
  const coarseMq = matchMedia('(pointer: coarse)'), noneMq = matchMedia('(pointer: none)');
  function readPointer() { pointerKind = noneMq.matches ? 'none' : coarseMq.matches ? 'coarse' : 'fine'; }
  readPointer();
  coarseMq.addEventListener('change', readPointer);
  noneMq.addEventListener('change', readPointer);

  /* ---- viewport cache: read on resize events, never inside the tick ---- */
  const vv = window.visualViewport || null;
  function readViewport() { vw = innerWidth; vh = innerHeight; vScale = vv ? vv.scale : 1; }
  function onResize() { readViewport(); resize(); }
  addEventListener('resize', onResize);
  vv?.addEventListener('resize', readViewport);
  vv?.addEventListener('scroll', readViewport);

  /* ---- theme from the tokens, so the canvas matches the surface it sits on ---- */
  function readTheme() {
    const cs = getComputedStyle(wall);
    const v = (name, fb) => (cs.getPropertyValue(name) || '').trim() || fb;
    return {
      ink: v('--text-display', '#FFFFFF'), dim: v('--text-meta', 'rgba(255,255,255,.45)'), line: v('--line-hairline', 'rgba(255,255,255,.18)'),
      livery: v('--livery', '#D63B08'), mono: v('--font-mono', '"IBM Plex Mono", ui-monospace, monospace'),
    };
  }

  /* ---- sizing ---- */
  function resize() {
    if (destroyed) return;
    const cw = strips.clientWidth, ch = strips.clientHeight;
    const d = governor.dpr();
    theme = readTheme();
    if (cw !== w || ch !== h || d !== dpr) {
      w = cw; h = ch; dpr = d;
      if (ctx && w > 0 && h > 0) {
        canvas.width = Math.max(1, Math.round(w * dpr));
        canvas.height = Math.max(1, Math.round(h * dpr));
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
    }
    draw(performance.now(), true);
  }
  const ro = 'ResizeObserver' in window ? new ResizeObserver(() => resize()) : null;
  ro?.observe(strips);

  /* ---- visibility: the loop only runs while the canvas is on screen ---- */
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.target === canvas) canvasVisible = e.isIntersecting;
      else if (e.target === root) rootVisible = e.isIntersecting;
    }
    syncLoop(); syncText();
  }, { threshold: 0 }) : null;
  if (io) { io.observe(canvas); io.observe(root); } else { canvasVisible = true; }
  function onVisibility() { hidden = document.hidden; syncLoop(); syncText(); }
  document.addEventListener('visibilitychange', onVisibility);

  /* ---- the strip loop ---- */
  function loopWanted() { return !destroyed && opt.strips && !!ctx && tier >= 1 && canvasVisible && !hidden; }
  function syncLoop() {
    if (loopWanted()) { if (!raf) { lastTick = 0; raf = requestAnimationFrame(tick); } }
    else if (raf) { cancelAnimationFrame(raf); raf = 0; lastTick = 0; }
  }
  function tick(now) {
    raf = requestAnimationFrame(tick);
    if (lastTick) {
      const dt = now - lastTick;
      if (dt < 1000) { frameRing.push(dt); frames++; }   // a gap over a second is a throttled tab, not a frame
    }
    lastTick = now;
    vyRing.push(scroll.state.vy);
    if (now - lastDraw >= DRAW_GAP_MS[tier]) draw(now);
  }

  /* ---- drawing ---- */
  function draw(now, force = false) {
    if (!ctx || w <= 0 || h <= 0 || !theme) return;
    if (!force && tier === 0) return;
    const t0 = performance.now();
    const c = ctx;
    c.clearRect(0, 0, w, h);
    c.font = `9px ${theme.mono}`;
    c.textBaseline = 'alphabetic';
    const padX = 6, paneH = h / 2, n = frameRing.n;
    const x0 = padX, x1 = w - padX, step = n > 1 ? (x1 - x0) / (n - 1) : 0;

    /* divider between the panes */
    c.strokeStyle = theme.line; c.lineWidth = 1;
    c.beginPath(); c.moveTo(0, Math.round(paneH) + 0.5); c.lineTo(w, Math.round(paneH) + 0.5); c.stroke();

    /* frame pane: 0 at the bottom, FRAME_SCALE_MS at the top, budget line at opt.budgetMs */
    const fTop = 12, fBot = paneH - 4, fH = fBot - fTop;
    const yMs = (v) => fBot - Math.min(1, v / FRAME_SCALE_MS) * fH;
    const yBudget = Math.round(yMs(opt.budgetMs)) + 0.5;
    const budgetLabel = opt.budgetMs.toFixed(1);
    const budgetLabelW = c.measureText(budgetLabel).width + 4;   // the dashed line stops short of its own label
    c.strokeStyle = theme.dim; c.setLineDash([2, 3]);
    c.beginPath(); c.moveTo(x0, yBudget); c.lineTo(x1 - budgetLabelW, yBudget); c.stroke();
    c.setLineDash([]);
    c.fillStyle = theme.dim; c.textAlign = 'left';
    c.fillText('FRAME MS', x0, 9);
    c.textAlign = 'right';
    c.fillText(`${FRAME_SCALE_MS}`, x1, 9);
    c.fillText(budgetLabel, x1, yBudget - 3);
    if (frameRing.filled > 1) {
      const start = n - frameRing.filled;             // right-align the trace so new samples enter from the right
      c.strokeStyle = theme.ink; c.lineWidth = 1; c.lineJoin = 'round';
      c.beginPath();
      for (let i = 0; i < frameRing.filled; i++) {
        const x = x0 + (start + i) * step, y = yMs(frameRing.at(i));
        if (i) c.lineTo(x, y); else c.moveTo(x, y);
      }
      c.stroke();
      /* over-budget samples: an orange stem from the budget line up to the sample */
      c.strokeStyle = theme.livery; c.lineWidth = Math.max(1, Math.min(2, step));
      c.beginPath();
      for (let i = 0; i < frameRing.filled; i++) {
        const v = frameRing.at(i);
        if (v <= opt.budgetMs) continue;
        const x = x0 + (start + i) * step;
        c.moveTo(x, yBudget); c.lineTo(x, yMs(v));
      }
      c.stroke();
    }

    /* velocity pane: zero line in the middle, scale picked from the window, positive (down the page) below the line */
    const vTop = paneH + 12, vBot = h - 4, vMid = (vTop + vBot) / 2, vHalf = (vBot - vTop) / 2;
    const peak = vyRing.maxAbs();
    const scale = NICE_VY.find((s) => s >= Math.max(VY_FLOOR, peak)) || NICE_VY[NICE_VY.length - 1];
    const yVy = (v) => vMid + Math.max(-1, Math.min(1, v / scale)) * vHalf;
    const yZero = Math.round(vMid) + 0.5;
    c.strokeStyle = theme.dim; c.setLineDash([2, 3]);
    c.beginPath(); c.moveTo(x0, yZero); c.lineTo(x1, yZero); c.stroke();
    c.setLineDash([]);
    c.fillStyle = theme.dim; c.textAlign = 'left';
    c.fillText('SCROLL PX/S', x0, paneH + 9);
    c.textAlign = 'right';
    c.fillText(`±${fmtInt(scale)}`, x1, paneH + 9);
    c.fillText('DN', x1, vBot);
    if (vyRing.filled > 1) {
      const start = n - vyRing.filled;
      c.strokeStyle = theme.ink; c.lineWidth = 1;
      c.beginPath();
      for (let i = 0; i < vyRing.filled; i++) {
        const x = x0 + (start + i) * step, y = yVy(vyRing.at(i));
        if (i) c.lineTo(x, y); else c.moveTo(x, y);
      }
      c.stroke();
    }
    lastDraw = now; draws++; lastDrawMs = performance.now() - t0;
  }

  /* ---- tier ---- */
  const offTier = governor.subscribe(({ tier: t, reason: r }) => {
    tier = t; reason = r || reason;
    root.dataset.tier = String(tier);
    syncLoop(); syncText();
    draw(performance.now(), true);
  });
  /* tier 0: the governor's 4 Hz stats feed the rings; the canvas repaints when the scroll stops */
  const offStats = bus.on('governor:stats', (s) => {
    if (tier !== 0) return;
    if (s.p50Ms > 0) frameRing.push(s.p50Ms);
    vyRing.push(scroll.state.vy);
  });
  const offIdle = bus.on('scroll:idle', () => { if (tier === 0) draw(performance.now(), true); });

  /* ---- text cells ---- */
  function textRateMs() { return tier === 0 ? 1000 : Math.round(1000 / opt.textHz); }
  function syncText() {
    const wanted = !destroyed && !hidden && (rootVisible || sheet.open);
    const rate = textRateMs();
    if (!wanted) { if (textTimer) { clearInterval(textTimer); textTimer = 0; } return; }
    if (textTimer && textRate === rate) return;
    if (textTimer) clearInterval(textTimer);
    textRate = rate; textTimer = setInterval(textTick, rate);
    headSrc.textContent = `10 ch / ${Math.round(1000 / rate)} Hz / src: this page`;   // the head states the rate the cells really update at
    textTick();
  }
  function readings() {
    const g = governor.stats;
    const render = bus.state['stage:render'];
    const ptr = bus.state['pointer:move'];
    const mem = performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null;
    const now = performance.now();
    return {
      p50: g.p50Ms, p95: g.p95Ms, budget: opt.budgetMs,
      longCount, longLast, longOk: !!longObs,
      vy: scroll.state.vy, vyPeak: scroll.state.vyPeak,
      vw, vh, dpr: devicePixelRatio || 1, vScale,
      netBytes, netCount, netZero, netOk: !!resObs,
      tplus: now,
      gl: render && render.info ? { calls: render.info.calls, triangles: render.info.triangles, ms: render.info.ms } : null,
      tier, reason, ceiling: governor.ceiling, pinned: !!g.pinned,
      pointerKind, pointer: ptr && Number.isFinite(ptr.x) ? { x: Math.round(ptr.x), y: Math.round(ptr.y) } : null,
      mem,
    };
  }
  /* Each cell as [value, unit] strings. Units are sentence-cased here; the CSS sets them in caps. */
  function rows(r) {
    return {
      frame: [`${ms1(r.p50)} / ${ms1(r.p95)}`, `ms p50 / p95 / budget ${r.budget.toFixed(1)}`],
      longtasks: r.longOk ? [`${r.longCount} / ${r.longLast ? Math.round(r.longLast) : DASH}`, 'count / last ms / src: longtask'] : [DASH, 'longtask not supported here'],
      scroll: [fmtSigned(r.vy), `px/s / peak ${fmtSigned(r.vyPeak)} / src: scroll`],
      viewport: [`${r.vw}${TIMES}${r.vh}`, `px / dpr ${+r.dpr.toFixed(2)} / scale ${r.vScale.toFixed(2)}`],
      net: r.netOk ? [fmtBytes(r.netBytes), `${r.netCount} req${r.netZero ? ` / ${r.netZero} cached or opaque` : ''} / src: resource timing`] : [DASH, 'resource timing not supported here'],
      tplus: [fmtClock(r.tplus), 'mm:ss.t / since time origin'],
      gl: r.gl ? [`${fmtInt(r.gl.calls)} / ${fmtCompact(r.gl.triangles)}`, `calls / triangles / ${r.gl.ms.toFixed(1)} ms / src: renderer.info`] : [DASH, 'calls / triangles / no stage yet'],
      gov: [`T${r.tier}`, `${r.reason}${r.pinned && !/pinned/i.test(r.reason) ? ' / pinned' : ''} / ceiling T${r.ceiling}`],
      input: [r.pointerKind.toUpperCase(), r.pointer ? `pointer ${r.pointer.x}, ${r.pointer.y} / src: pointermove` : 'pointer / no event yet'],
      mem: [r.mem === null ? DASH : r.mem.toFixed(1), 'MB JS heap / Chrome only'],
    };
  }
  function textTick() {
    if (destroyed) return;
    ticks++;
    const r = readings(), rw = rows(r);
    for (const k in cells) writeCell(cells[k], rw[k][0], rw[k][1]);
    /* budget bar: 0 at the left, budget at the middle, 2 × budget at the right */
    const full = r.budget * 2;
    const fill = Math.min(1, r.p50 / full), over = Math.max(0, Math.min(0.5, r.p50 / full - 0.5)), p95 = Math.min(1, r.p95 / full);
    const bar = cells.frame.bar;
    bar.style.setProperty('--fill', fill.toFixed(3));
    bar.style.setProperty('--over', over.toFixed(3));
    bar.style.setProperty('--p95', p95.toFixed(3));
    cells.frame.cell.classList.toggle('is-over', r.p50 > r.budget);
    /* ticker segments */
    const segText = {
      frame: `${ms1(r.p50)} ms`,
      scroll: `${fmtSigned(r.vy)} px/s`,
      tplus: `T+ ${fmtClock(r.tplus)}`,
      gov: `T${r.tier}`,
    };
    for (const k of segOrder) if (segText[k] !== seg[k].last) { seg[k].val.textContent = segText[k]; seg[k].last = segText[k]; }
    /* sr summary at most once per second */
    if (r.tplus - lastA11y >= A11Y_MS) {
      lastA11y = r.tplus;
      sr.textContent = `Page telemetry: frame time ${r.p50 > 0 ? r.p50.toFixed(1) : 'not yet measured'} ms median, ${r.p95 > 0 ? r.p95.toFixed(1) : 'not yet measured'} ms at the 95th percentile. `
        + `${r.longCount} long task${r.longCount === 1 ? '' : 's'}. Scroll ${fmtInt(Math.abs(r.vy))} px per second. Viewport ${r.vw} by ${r.vh} px. `
        + `${fmtBytes(r.netBytes)} over ${r.netCount} request${r.netCount === 1 ? '' : 's'}. Elapsed ${fmtClockWords(r.tplus)}. Quality tier ${r.tier}. Measured from this page, no rocket data.`;
    }
  }

  /* ---- snapshot: the wall as aligned plain text ---- */
  function snapshot() {
    const r = readings(), rw = rows(r);
    const labels = { frame: 'FRAME', longtasks: 'LONG TASKS', scroll: 'SCROLL V', viewport: 'VIEWPORT', net: 'NET', tplus: 'T+', gl: 'GL', gov: 'GOV', input: 'INPUT', mem: 'MEM' };
    const out = ['TELEMETRY / LIVE / THIS PAGE / NO ROCKET DATA'];
    for (const k in cells) out.push(`${labels[k].padEnd(12)}${rw[k][0].padEnd(15)}${rw[k][1].toUpperCase()}`);
    const span = frameRing.sum();
    out.push(`${'STRIPS'.padEnd(12)}${`${frameRing.filled} SAMPLES`.padEnd(15)}${tier === 0 ? 'P50 AT 4 HZ / REPAINT ON SCROLL IDLE' : `${(span / 1000).toFixed(1)} S / DRAW ${tier === 3 ? 'EVERY FRAME' : tier === 2 ? '30 HZ' : '10 HZ'}`}`);
    out.push(`${'SNAPSHOT'.padEnd(12)}${`T+ ${fmtClock(r.tplus)}`.padEnd(15)}${new Date().toISOString()}`);
    return out.join('\n');
  }

  /* ---- layouts ---- */
  const mq = matchMedia(BREAKPOINT);
  function resolveLayout() { return mode === 'auto' ? (mq.matches ? 'ticker' : 'wall') : mode === 'ticker' ? 'ticker' : 'wall'; }
  function applyLayout() {
    const next = resolveLayout();
    currentLayout = next;
    root.dataset.layout = next;
    if (sheet.open) sheet.close();
    if (next === 'ticker') {
      sheet.append(wall);
      root.replaceChildren(ticker, sheet, sr);
    } else {
      root.replaceChildren(wall, sr);
    }
    resize();
    syncLoop(); syncText();
  }
  function onMq() { if (mode === 'auto') applyLayout(); }
  mq.addEventListener('change', onMq);

  function openSheet() {
    if (sheet.open) return;
    try { sheet.showModal(); } catch { sheet.setAttribute('open', ''); }
    expand.setAttribute('aria-expanded', 'true');
    resize(); syncText();
    close.focus();
  }
  function closeSheet() { if (sheet.open) sheet.close(); }
  function onSheetClose() {
    expand.setAttribute('aria-expanded', 'false');
    syncLoop(); syncText();
    if (document.contains(expand)) expand.focus();
  }
  function onSheetClick(e) { if (e.target === sheet) closeSheet(); }   // the backdrop is the dialog's own box outside its children
  expand.addEventListener('click', openSheet);
  close.addEventListener('click', closeSheet);
  sheet.addEventListener('close', onSheetClose);
  sheet.addEventListener('click', onSheetClick);

  /* ---- public ---- */
  const api = {
    snapshot,
    setLayout(l) { mode = l === 'ticker' || l === 'auto' ? l : 'wall'; applyLayout(); },
    /* live options: budgetMs, textHz, samples, strips */
    set(o = {}) {
      if (o.budgetMs !== undefined) opt.budgetMs = clampNum(o.budgetMs, 4, 100, BUDGET_MS);
      if (o.textHz !== undefined) opt.textHz = clampNum(o.textHz, 1, 10, 4);
      if (o.samples !== undefined) { const n = Math.round(clampNum(o.samples, 30, 600, 120)); if (n !== opt.samples) { opt.samples = n; frameRing.resize(n); vyRing.resize(n); } }
      if (o.strips !== undefined) { opt.strips = !!o.strips; strips.hidden = !opt.strips; }
      syncLoop(); syncText();
      draw(performance.now(), true);
      return api;
    },
    refresh() { readViewport(); resize(); if (textTimer) textTick(); },
    open: openSheet,
    close: closeSheet,
    get state() {
      return {
        layout: currentLayout, mode, tier, loop: !!raf, drawGapMs: DRAW_GAP_MS[tier], draws, lastDrawMs, frames,
        samples: frameRing.filled, capacity: frameRing.n, spanMs: frameRing.sum(), canvasVisible, rootVisible, hidden, sheetOpen: sheet.open,
        textHz: tier === 0 ? 1 : opt.textHz, ticks, longCount, longLast, longOk: !!longObs, netBytes, netCount, netZero, netOk: !!resObs,
        canvasSize: `${canvas.width}${TIMES}${canvas.height}`, dpr, ctx: !!ctx,
      };
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelAnimationFrame(raf); raf = 0;
      clearInterval(textTimer); textTimer = 0;
      offTier(); offStats(); offIdle();
      io?.disconnect(); ro?.disconnect();
      longObs?.disconnect(); resObs?.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      removeEventListener('resize', onResize);
      vv?.removeEventListener('resize', readViewport);
      vv?.removeEventListener('scroll', readViewport);
      coarseMq.removeEventListener('change', readPointer);
      noneMq.removeEventListener('change', readPointer);
      mq.removeEventListener('change', onMq);
      expand.removeEventListener('click', openSheet);
      close.removeEventListener('click', closeSheet);
      sheet.removeEventListener('close', onSheetClose);
      sheet.removeEventListener('click', onSheetClick);
      if (sheet.open) sheet.close();
      if (ctx) { canvas.width = canvas.height = 1; }
      root.replaceChildren();
      root.classList.remove('tel');
      delete root.dataset.layout; delete root.dataset.tier;
      root.removeAttribute('role'); root.removeAttribute('aria-label');
    },
  };

  root.dataset.tier = String(tier);
  applyLayout();
  return api;
}
export default mountTelemetry;
