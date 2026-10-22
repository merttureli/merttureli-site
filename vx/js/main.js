/* main.js — the page integrator for vx/index.html.
   Boots the page, mounts every module behind a guard (one failure never blanks
   the page; it is logged and listed in the build manifest as MODULE FAILED),
   wires the bus between the stage, the tunnel, the callouts and the
   instruments, registers the console's command table, routes hashes and keys,
   and keeps the three locally stored switches (vx-boot-v1, vx-tier, vx-reader).
   Everything it measures stays in the browser. */
import { bus } from './core/bus.js';
import { governor, webglAvailable } from './core/governor.js';
import { scroll } from './core/scroll.js';
import { media } from './core/media.js';
import { createBoot } from './boot.js';

const $ = (id) => document.getElementById(id);
const root = document.documentElement;
const query = new URLSearchParams(location.search);
const coarse = matchMedia('(pointer: coarse)');
const narrow = matchMedia('(max-width: 859.98px)');
const shortPhone = matchMedia('(max-width: 859.98px) and (max-height: 820px)');   // no room for the heading's dimension line above the copy
const pad2 = (n) => String(n).padStart(2, '0');
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};

/* ---------- failures: logged, never fatal ---------------------------------- */
const failures = [];
const mods = {};
function fail(name, err) {
  failures.push({ name, message: String((err && err.message) || err) });
  console.error(`[vx] MODULE FAILED ${name}`, err);
  scheduleManifest();
}
function guard(name, fn) { try { return fn(); } catch (err) { fail(name, err); return null; } }
async function guardAsync(name, fn) { try { return await fn(); } catch (err) { fail(name, err); return null; } }

/* ---------- mutable page state (declared first: handlers below reach it at module top) ---------- */
let progress = 0, rangeOnScreen = true, readerOn = false;
let telUser = null;   // null follows the page (open on the pad, a drawer after it); true / false is the visitor's choice
let telUserAt = 'pad';   // where the visitor opened it: a wall opened on the pad folds away while a station's callouts are up
let calloutLocked = false;
let explodeOverride = null;
let instrumentsReady = Promise.resolve();
let tunnelFields = ['smoke', 'velocity', 'pressure', 'vorticity'];
let tunnelFrozen = false, tunnelStarted = false, lastFade = -1, tunnelOffset = { x: 0, y: 0 }, tunnelModule = null;
let sheetStation = -1, dimsManual = false, dimsAuto = null;
let pendingRoute = null;   // an unknown hash seen before the console mounted

/* ---------- the live region ------------------------------------------------- */
const announceEl = $('announce');
let announceTimer = 0;
function announce(text) {
  if (!announceEl || !text) return;
  clearTimeout(announceTimer);
  announceTimer = setTimeout(() => { announceEl.textContent = ''; announceEl.textContent = String(text).slice(0, 240); }, 80);
}

/* ---------- sections and routes --------------------------------------------- */
const range = $('range'), sticky = $('range-sticky'), scene = $('scene');
const dock = $('telemetry-dock'), telToggle = $('tel-toggle'), sheetRoot = $('sheet');
const stageCanvas = $('stage'), poster = $('poster'), stageFlag = $('stage-flag'), stageState = $('stage-state');
const SECTION_IDS = ['pad', '03-charger', 'ladder', 'decisions', 'weekend', '01-hotbox', '02-robo-catcher', '04-bend-fixture', '05-rudder-pedals', '06-therma-shift', 'experience', 'skills', 'beyond', 'recognition', 'websites', 'contact'];
for (const el of document.querySelectorAll('main > section[data-station]')) scroll.track(el, el.id);

const STATION_KEYS = ['nose', 'camera', 'pcb', 'battery', 'coupler', 'altimeter', 'motor', 'cap'];
const STATION_LABELS = ['Nose cone', 'Camera', 'PCB stack', 'Battery', 'Coupler', 'Altimeter', 'Motor', 'Screw cap'];
const headerEl = document.querySelector('.vx-header');
function headerH() { return (headerEl && headerEl.getBoundingClientRect().height) || parseFloat(getComputedStyle(root).getPropertyValue('--header-h')) || 88; }
function stationProgress(k) {
  const stops = mods.stage && mods.stage.path && mods.stage.path.stops;
  if (stops && stops[k] !== undefined) return stops[k];
  return 0.10 + (k / 7) * 0.78;
}
function scrollToProgress(p, behavior = 'instant') {
  const top = range.getBoundingClientRect().top + scrollY;
  const span = Math.max(1, range.offsetHeight - innerHeight);
  scrollTo({ top: top + clamp(p, 0, 1) * span, behavior });
}
function scrollToSection(id) {
  if (id === 'pad') { scrollTo({ top: 0, behavior: 'smooth' }); return true; }
  if (id === '03-charger') { scrollToProgress(0.10, 'smooth'); return true; }
  return scroll.to(id, { offset: -headerH() });
}
function routeHash() {
  const id = decodeURIComponent(location.hash.slice(1));
  if (!id || id === 'card') return;
  if (SECTION_IDS.includes(id)) { scrollToSection(id); return; }
  if (document.getElementById(id)) return;   /* a real fragment (#main from the skip link): the browser's own navigation stands */
  /* no element carries the id: the console's goto prints NO SECTION AT #id in its log, scrolls to the top, and console:run relays the line to #announce */
  if (mods.console) { pendingRoute = null; mods.console.run(`goto #${id}`, { echo: false }); return; }
  pendingRoute = id;   /* the console is not mounted yet: the same notice now, and the log line once it is */
  console.info(`[vx] NO SECTION AT #${id}`);
  announce(`No section at #${id}`);
  scrollTo({ top: 0, behavior: 'instant' });
}
addEventListener('hashchange', routeHash);

/* the header's current mark follows scroll:section */
const navLinks = [...document.querySelectorAll('.vx-nav a')];
const NAV_FOR = { range: '03-charger', ladder: 'ladder', decisions: 'ladder', weekend: 'ladder', '01-hotbox': '01-hotbox', '02-robo-catcher': '01-hotbox', '04-bend-fixture': '01-hotbox', '05-rudder-pedals': '01-hotbox', '06-therma-shift': '01-hotbox', experience: 'experience', skills: 'experience', beyond: 'beyond', recognition: 'beyond', websites: 'contact', contact: 'contact' };
bus.on('scroll:section', ({ id }) => {
  const target = `#${NAV_FOR[id] || id}`;
  for (const a of navLinks) { if (a.getAttribute('href') === target) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); }
});

/* ---------- pins: query, reading mode, the stored tier ---------------------- */
const queryTier = query.has('tier') ? clamp(parseInt(query.get('tier'), 10) || 0, 0, 3) : null;
const storedTierRaw = parseInt(store.get('vx-tier'), 10);
/* vx-tier only ever holds a tier the governor measured (a p95 or p50 step, see the subscriber below); a stored 0 is never a measurement and is not a starting tier, and a static ceiling (reduced motion) takes no pin from it */
let storedPin = Number.isFinite(storedTierRaw) && storedTierRaw > 0 && queryTier === null && governor.ceiling > 0 && storedTierRaw < governor.ceiling ? storedTierRaw : null;
let quietPin = false;   // pins the page makes for itself (the stored tier, ?tier, reading mode) are not announced as the visitor's
function applyPins() {
  quietPin = true;
  try {
    if (readerOn) governor.pin(0);
    else if (queryTier !== null) governor.pin(queryTier);
    else if (storedPin !== null) governor.pin(storedPin);
    else if (governor.stats.pinned) governor.pin(null);
  } finally { quietPin = false; }
}
if (storedPin !== null) {
  /* the stored tier is the starting tier for the first 20 s; then the governor measures for itself (it only ever steps up after a 12 s quiet stretch) */
  setTimeout(() => { storedPin = null; applyPins(); }, 20000);
}
let firstTier = true;
governor.subscribe(({ tier, reason, stats }) => {
  if (!stats.pinned && /^p(50|95) /.test(reason)) store.set('vx-tier', String(tier));   /* only a measured step is worth remembering */
  if (firstTier) { firstTier = false; return; }
  if (quietPin) return;
  announce(`Quality tier ${tier}: ${reason}`);
  $('ticks').dataset.blink = '1'; setTimeout(() => { $('ticks').dataset.blink = '0'; }, 240);
});

/* ---------- reading mode --------------------------------------------------- */
const readerToggle = $('reader-toggle');
function setReader(on, { persist = true, say = true } = {}) {
  readerOn = !!on;
  root.classList.toggle('reader', readerOn);
  readerToggle.setAttribute('aria-pressed', String(readerOn));
  if (persist) store.set('vx-reader', readerOn ? '1' : '0');
  applyPins();
  if (readerOn) { poster.hidden = false; }          /* the painted poster stands in for the live stage (vx.css shows it) */
  else if (mods.stage && !mods.stage.fallback && mods.stage.renders > 0) { poster.hidden = true; }
  syncStageVisibility();
  scroll.refresh();
  mods.instruments?.refresh(); mods.telemetry?.refresh(); mods.callouts?.refresh();
  syncDims(); mods.dims?.refresh();
  if (say) announce(readerOn ? 'Reading mode on. The stage is unpinned and the eight stations are listed as text.' : 'Reading mode off.');
}
readerToggle.addEventListener('click', () => setReader(!readerOn));
setReader(store.get('vx-reader') === '1', { persist: false, say: false });
applyPins();

/* ---------- the boot ------------------------------------------------------- */
const overlay = $('boot');
let boot = null;
const bootResult = (async () => {
  if (!overlay) return null;
  boot = createBoot({
    overlay,
    arm: async () => { await instrumentsReady; mods.instruments?.refresh(); mods.telemetry?.refresh(); await new Promise((r) => requestAnimationFrame(r)); },
  });
  try { return await boot.run(); } catch (err) { fail('boot', err); try { overlay.remove(); } catch {} return null; }
})();
bus.on('boot:done', ({ skipped, bypassed }) => {
  /* boot:done fires before the overlay is removed: if focus is still inside it (SKIP from the keyboard), it goes to the skip link rather than
     falling into the body when the overlay leaves the document */
  if (overlay && overlay.isConnected && overlay.contains(document.activeElement)) document.querySelector('.skip-link')?.focus({ preventScroll: true });
  announce(bypassed ? 'Boot bypassed. Range is green.' : skipped ? 'Boot skipped. Range is green.' : 'Boot complete. Range is green.');
  setTimeout(routeHash, 60);
  startTunnel();
}, { replay: true });   // the ?noboot bypass emits boot:done synchronously inside run(), before this line
/* the tunnel module is fetched with boot step 01 (as three.js is); the solver itself starts at boot:done, because its pre-roll would otherwise compete with the boot's own measured steps on a slow GPU */
bus.on('boot:line', ({ index }) => { if (index !== null && index >= 1 && !tunnelModule && webglAvailable() && governor.ceiling > 0) tunnelModule = import('./tunnel/tunnel.js'); }, { replay: true });
const geometryReady = new Promise((resolve) => {
  if (bus.state['assets:geometry']) resolve(bus.state['assets:geometry']);
  else bus.once('assets:geometry', resolve);
});
bootResult.then((r) => {
  if (!r || !r.deferred) return;
  const btn = $('load3d');
  btn.hidden = false;
  btn.addEventListener('click', () => { btn.disabled = true; btn.textContent = 'Loading geometry'; (r.loadGeometry || boot.loadGeometry)().then((g) => { if (!g) { btn.disabled = false; btn.textContent = 'Load 3D / 2.5 MB / failed, try again'; } }); }, { once: false });
  bus.once('assets:geometry', () => { btn.hidden = true; });
});

/* ---------- instruments and telemetry (mounted at once; the boot's 05 step refreshes them) ---- */
instrumentsReady = (async () => {
  await guardAsync('instruments', async () => {
    const { mountInstruments } = await import('./instruments.js');
    mods.instruments = mountInstruments($('rail'), { layout: 'auto' });
  });
  await guardAsync('telemetry', async () => {
    const { mountTelemetry } = await import('./telemetry.js');
    mods.telemetry = mountTelemetry($('telemetry'), { layout: 'auto' });
  });
})();
/* on phones the sheet waits for the descent flag (0.12): before it, the fading hero copy still sits where the sheet would */
function stationUp() { return sheetStation >= 0 && progress > (narrow.matches ? 0.12 : 0.065) && progress < 0.94 && rangeOnScreen && !readerOn; }
function syncDock() {
  let open;
  if (telUser === null) open = progress < 0.12 && rangeOnScreen && !readerOn;
  else if (!telUser) open = false;
  /* opened by the visitor: it stays, except over a station's callouts when it was opened on the pad, or while a callout is locked (the wall would cover the focused label) */
  else open = !(stationUp() && (telUserAt === 'pad' || calloutLocked));
  if (dock.classList.contains('is-collapsed') === !open) return;
  dock.classList.toggle('is-collapsed', !open);
  telToggle.setAttribute('aria-expanded', String(open));
}
function setTelUser(v) { telUser = v; telUserAt = progress < 0.12 ? 'pad' : 'walk'; syncDock(); }
telToggle.addEventListener('click', () => { setTelUser(dock.classList.contains('is-collapsed')); });
syncDock();

/* ---------- the stage and the callouts ---------------------------------------- */
const progressInput = $('progress-range'), progressOut = $('progress-out'), explodeInput = $('explode-range'), explodeOut = $('explode-out'), explodeAuto = $('explode-auto');
function showPoster(text) {
  poster.hidden = false; poster.classList.remove('is-hidden');
  stageCanvas.hidden = true;
  if (text) { stageFlag.hidden = false; stageFlag.textContent = text; }
  stageState.textContent = text ? 'poster' : 'pad view';
}
function stateText(index, station) {
  if (station) return `station ${pad2(index + 1)} / ${station.label}`;
  return progress < 0.10 ? 'pad view' : progress > 0.94 ? 'pull-out' : 'descent';
}
const stageModule = webglAvailable() ? import('./stage/stage.js') : null;   // pulls three.js in off the critical path
async function startStage() {
  if (!stageModule) { showPoster('No WebGL / poster'); return;}
  const r = await bootResult;
  let geometry = r && r.geometry;
  if (!geometry && r && r.deferred) geometry = await geometryReady;
  const mod = await guardAsync('three.js', () => stageModule);
  if (!mod) { showPoster('No WebGL / poster'); return; }
  const stage = await guardAsync('stage', () => mod.createStage({ canvas: stageCanvas, geometry: geometry || undefined, tier: governor.tier }));
  if (!stage) { showPoster('Stage failed / poster'); return; }
  mods.stage = stage;
  if (stage.fallback) { showPoster('No WebGL / poster'); return; }
  governor.subscribe(({ tier }) => stage.setTier(tier));
  bus.once('stage:render', () => { poster.classList.add('is-hidden'); setTimeout(() => { poster.hidden = true; }, 900); });
  bus.on('stage:station', ({ index, station }) => { stageState.textContent = stateText(index, station); syncValuetext(); });
  bus.on('stage:render', (d) => {
    if (!d.station) { const t = stateText(-1, null); if (stageState.textContent !== t) { stageState.textContent = t; syncValuetext(); } }
    const e = d.explode;
    const txt = e.toFixed(2);
    if (explodeOut.value !== txt) { explodeOut.value = txt; if (explodeOverride === null) explodeInput.value = txt; }
    pushObstacle(d.progress);
  });
  syncStageVisibility();
  stage.setProgress(progress);
  const ok = await stage.ready;
  if (!ok) { fail('stage geometry', stage.error || 'geometry failed'); showPoster('Geometry failed / poster'); return; }
  if (explodeOverride !== null) stage.setExplode(explodeOverride);
  mountCalloutsNow(stage);
}
function syncStageVisibility() {
  const on = rangeOnScreen && !readerOn && !document.hidden;
  mods.stage?.setVisible(on);
  syncTunnelVisibility();
  syncDock();
  syncSheet();
  syncDims();
}
/* the callout sheet (phones) only exists while a station is current and the range is on screen; the page's own progress gates it too,
   because stage:station {index: -1} only arrives with a render and the stage does not render once its canvas has left the viewport */
function syncSheet() {
  const up = stationUp();
  sheetRoot.classList.toggle('is-idle', !up);
  /* the pull-out with no station current: the phone's scene grows into the space the sheet used (mobile.css) */
  sticky.classList.toggle('is-pullout', !up && progress >= 0.88 && !readerOn);
  syncDock();
}
bus.on('stage:station', ({ index }) => { sheetStation = index; syncSheet(); });
/* the dimension overlay is on by default in the pad view only (the heading and the page margin); `dim` makes it manual */
function syncDims(p = progress) {
  const d = mods.dims; if (!d || dimsManual) return;
  const want = p < 0.06 && rangeOnScreen && !readerOn && !shortPhone.matches;
  if (want === dimsAuto) return;
  dimsAuto = want;
  if (want) d.enable(); else d.disable();
}
async function mountCalloutsNow(stage) {
  await guardAsync('callouts', async () => {
    const { mountCallouts } = await import('./callouts.js');
    const api = mountCallouts({ stage, svg: $('leaders'), labels: $('callouts'), sheet: $('sheet') });
    mods.callouts = api;
    bus.on('callouts:lock', ({ partId, station }) => {
      const k = typeof station === 'number' ? station : station && station.index;
      if (k >= 0 && stage.station !== k) scrollToProgress(stationProgress(k), 'instant');
      calloutLocked = true; syncDock();
      requestAnimationFrame(() => { if (api.state.locked === partId) stage.goto(partId).catch(() => {}); });
    });
    bus.on('callouts:unlock', () => { calloutLocked = false; syncDock(); stage.release(); });
    bus.on('callouts:station', ({ index, source }) => { if (source === 'sheet' && index >= 0) scrollToProgress(stationProgress(index), 'instant'); });
  });
}
/* focus a locked part's label as soon as a render has placed it (cross-station locks: the label is hidden until the new station is solved) */
let focusWatch = null;
function focusCalloutWhenPlaced(id) {
  focusWatch?.();
  let renders = 0;
  /* only once the stage stands at the part's station: a station change re-appends the labels, which would drop a focus given earlier */
  const st = mods.stage && mods.stage.stations ? mods.stage.stations.findIndex((s) => s.partIds && s.partIds.includes(id)) : -1;
  const tryFocus = () => {
    if (st >= 0 && mods.stage.station !== st) return false;
    const btn = document.getElementById(`co-label-${id}`);
    const item = btn && btn.closest('.co-item');
    if (btn && item && !item.classList.contains('is-off') && !item.hidden && btn.offsetParent !== null) { btn.focus({ preventScroll: true }); return true; }
    return false;
  };
  if (tryFocus()) return;
  const off = bus.on('stage:render', () => { if (tryFocus() || ++renders > 90) { off(); focusWatch = null; } });
  focusWatch = off;
}
if (stageModule) startStage(); else showPoster('No WebGL / poster');

/* the stage's bottom bar: progress and explode as keyboard-settable ranges */
function syncValuetext() { progressInput.setAttribute('aria-valuetext', `${progress.toFixed(3)}, ${stageState.textContent}`); }
function syncProgressInput(p) {
  const v = p.toFixed(3);
  if (progressInput.value !== v && document.activeElement !== progressInput) progressInput.value = v;
  progressOut.value = v;
  syncValuetext();
}
progressInput.addEventListener('input', () => scrollToProgress(progressInput.valueAsNumber, 'instant'));
function setExplodeOverride(v) {
  explodeOverride = v;
  explodeAuto.setAttribute('aria-pressed', String(v === null));
  mods.stage?.setExplode(v);
  if (v !== null) { explodeOut.value = v.toFixed(2); explodeInput.value = v.toFixed(2); }
}
explodeInput.addEventListener('input', () => setExplodeOverride(explodeInput.valueAsNumber));
explodeAuto.addEventListener('click', () => setExplodeOverride(null));

/* ---------- the tunnel (hero only) ------------------------------------------- */
const tunnelCanvas = $('tunnel'), tunnelReadout = $('tunnel-readout');
function measureTunnelOffset() {
  const a = stageCanvas.getBoundingClientRect(), b = tunnelCanvas.getBoundingClientRect();
  tunnelOffset = { x: a.left - b.left, y: a.top - b.top };
}
async function startTunnel() {
  if (tunnelStarted) return; tunnelStarted = true;
  if (!webglAvailable() || governor.ceiling === 0) { tunnelReadout.textContent = governor.ceiling === 0 ? 'off / tier 0' : 'off / no WebGL'; return; }
  await guardAsync('tunnel', async () => {
    const { createTunnel, FIELDS } = await (tunnelModule || import('./tunnel/tunnel.js'));
    tunnelFields = FIELDS;
    const tunnel = createTunnel(tunnelCanvas, { tier: governor.tier, preroll: 240 });   /* 240 settled steps before the first composite: smoke is around the rocket at first paint, not four seconds later */
    mods.tunnel = tunnel;
    if (tunnel.fallback) { tunnelReadout.textContent = 'off / no WebGL2'; return; }
    governor.subscribe(({ tier }) => { tunnel.setTier(tier); });
    const f = query.get('field'); if (f && FIELDS.includes(f)) tunnel.setField(f);
    bus.on('tunnel:stats', (d) => {
      const txt = d.tier === 0 || tunnel.fallback ? 'off' : `T${d.tier} ${d.grid[0]} × ${d.grid[1]} ${d.field}`;
      if (tunnelReadout.textContent !== txt) tunnelReadout.textContent = txt;
    });
    measureTunnelOffset();
    syncTunnelVisibility();
  });
}
function syncTunnelVisibility() {
  const t = mods.tunnel; if (!t) return;
  const want = rangeOnScreen && !readerOn && !document.hidden && progress < 0.12;
  t.setVisible(want);
  const fade = clamp((0.12 - progress) / 0.02, 0, 1);
  if (fade !== lastFade) { lastFade = fade; t.setFade(fade); }
}
function pushObstacle(p) {
  const t = mods.tunnel, s = mods.stage; if (!t || !s || p >= 0.12) return;
  const shapes = s.silhouette(); if (!shapes.length) return;
  const { x: ox, y: oy } = tunnelOffset;
  t.setObstacle(shapes.map((sh) => sh.kind === 'capsule'
    ? { kind: 'capsule', x1: sh.x1 + ox, y1: sh.y1 + oy, x2: sh.x2 + ox, y2: sh.y2 + oy, r: sh.r }
    : { kind: 'box', cx: sh.x + ox, cy: sh.y + oy, w: sh.w, h: sh.h, angle: sh.deg }));
}
if ('ResizeObserver' in window) new ResizeObserver(() => { measureTunnelOffset(); }).observe(scene);
/* phones: the scene takes the height the copy leaves (mobile.css reads --pad-copy-h) */
const padCopy = $('pad');
if ('ResizeObserver' in window && padCopy) new ResizeObserver((entries) => { const h = Math.round(entries[entries.length - 1].contentRect.height); sticky.style.setProperty('--pad-copy-h', `${h}px`); }).observe(padCopy);
document.addEventListener('visibilitychange', syncStageVisibility);
if ('IntersectionObserver' in window) {
  new IntersectionObserver((entries) => { rangeOnScreen = entries[entries.length - 1].isIntersecting; syncStageVisibility(); }, { threshold: 0 }).observe(range);
}

/* ---------- scroll drives everything ------------------------------------------ */
let stagePending = false;
function onFrame(idle = false) {
  if (readerOn) return;
  const p = scroll.progressOf(range);
  syncDims(p);   /* before the early return: a jump back to the top from beyond the range changes nothing else */
  if (p === progress && !(idle && stagePending)) return;
  progress = p;
  sticky.style.setProperty('--p', p.toFixed(4));
  sticky.classList.toggle('is-descent', p >= 0.12);
  syncSheet();
  /* tier 0: the stage draws once the scroll has stopped and stays (no redraw per frame) */
  if (mods.stage && (governor.tier > 0 || idle)) { mods.stage.setProgress(p); stagePending = false; } else stagePending = true;
  syncTunnelVisibility();
  syncProgressInput(p);
  if (!mods.stage) stageState.textContent = stateText(-1, null);
  const pad = p < 0.12 ? '1' : '0';
  if (dock.dataset.pad !== pad) { dock.dataset.pad = pad; syncDock(); }
}
bus.on('scroll:frame', () => onFrame(false));
bus.on('scroll:idle', () => onFrame(true));

/* ---------- pointer:move, coalesced to one emit per frame ---------------------- */
let pending = null, pRaf = 0, lastP = null;
function flushPointer(t) {
  pRaf = 0;
  const e = pending; pending = null;
  if (!e) return;
  const dt = lastP ? Math.max(1, t - lastP.t) : 16.7;
  const vx = lastP ? (e.clientX - lastP.x) / dt * 1000 : 0, vy = lastP ? (e.clientY - lastP.y) / dt * 1000 : 0;
  lastP = { x: e.clientX, y: e.clientY, t };
  const d = { x: e.clientX, y: e.clientY, nx: (e.clientX / innerWidth) * 2 - 1, ny: (e.clientY / innerHeight) * 2 - 1, vx, vy, t };
  bus.emit('pointer:move', d);
  if (readerOn) return;
  mods.stage?.setPointer(d.nx, d.ny);
  const tn = mods.tunnel;
  if (tn && rangeOnScreen && progress < 0.12) {
    const r = tunnelCanvas.getBoundingClientRect();
    const x = d.x - r.left, y = d.y - r.top;
    if (x >= 0 && y >= 0 && x <= r.width && y <= r.height) tn.setPointer(x, y, vx, vy);
  }
}
addEventListener('pointermove', (e) => { pending = e; if (!pRaf) pRaf = requestAnimationFrame(flushPointer); }, { passive: true });
/* pointerleave does not bubble and is dispatched to the root element when the pointer leaves the window, so the listener goes there, with blur as the second exit */
const pointerGone = () => { lastP = null; pending = null; mods.stage?.setPointer(0, 0); };
document.documentElement.addEventListener('pointerleave', pointerGone);
addEventListener('blur', pointerGone);

/* ---------- media: near-viewport streaming, PLAY when autoplay is refused ---------- */
function setupVideos() {
  for (const v of document.querySelectorAll('video[data-stream]')) {
    const cell = v.parentElement; if (!cell) continue;
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'play'; btn.textContent = 'Play'; btn.hidden = true;
    btn.setAttribute('aria-label', `Play: ${v.getAttribute('aria-label') || 'video'}`);
    cell.append(btn);
    const attach = () => { for (const s of v.querySelectorAll('source[data-src]')) { s.src = s.dataset.src; s.removeAttribute('data-src'); } v.load(); };
    if (coarse.matches && v.hasAttribute('data-coarse-poster')) {
      /* the 10.9 MB turntable waits for a tap on phones: the poster stands in. The tap hands it to media.js, which attaches it while near,
         plays it while visible under the tier cap and detaches it beyond three viewports like every other video */
      v.removeAttribute('data-stream');
      btn.hidden = false;
      let handed = false, watched = false;
      v.addEventListener('playing', () => { btn.hidden = true; });
      btn.addEventListener('click', () => {
        if (governor.tier > 0) {
          if (!handed) { handed = true; v.setAttribute('data-stream', ''); media.register(v); }
          btn.hidden = true; media.refresh();
          return;
        }
        /* tier 0 shows posters only (media.js would pause it): the tap plays it by hand, and an observer pauses it off screen and releases it
           beyond three viewports */
        attach(); v.play().then(() => { btn.hidden = true; }).catch(() => {});
        if (watched || !('IntersectionObserver' in window)) return;
        watched = true;
        new IntersectionObserver((es) => { if (!es[es.length - 1].isIntersecting && !v.paused) { v.pause(); btn.hidden = false; } }, { threshold: 0.05 }).observe(v);
        new IntersectionObserver((es) => {
          if (es[es.length - 1].isIntersecting || !v.querySelector('source[src]')) return;
          v.pause();
          for (const s of v.querySelectorAll('source[src]')) { s.dataset.src = s.src; s.removeAttribute('src'); }
          v.removeAttribute('src'); v.load(); btn.hidden = false;
        }, { rootMargin: '300% 0px' }).observe(v);
      });
      continue;
    }
    /* PLAY is for a real autoplay refusal: play() is wrapped so a NotAllowedError from media.js's own call is seen here. A video media.js
       paused on purpose (the per-tier playing cap) gets no button; the heuristic path only shows one when the cap has room. */
    let timer = 0, refused = false, inView = false;
    const nativePlay = v.play.bind(v);
    v.play = () => { const r = nativePlay(); r.catch((e) => { if (e && e.name === 'NotAllowedError') { refused = true; check(); } }); return r; };
    const cap = () => [0, 1, 2, 4][governor.tier] ?? 4;
    const check = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (governor.tier === 0 || !v.paused || !v.querySelector('source[src]') || !inView) { btn.hidden = true; return; }
        btn.hidden = !(refused || media.state.playing < cap());
      }, 1200);
    };
    if ('IntersectionObserver' in window) new IntersectionObserver((entries) => { inView = entries[entries.length - 1].isIntersecting; check(); }, { threshold: 0.05 }).observe(v);
    else inView = true;
    v.addEventListener('loadeddata', check);
    v.addEventListener('pause', check);
    v.addEventListener('playing', () => { clearTimeout(timer); refused = false; btn.hidden = true; });
    bus.on('media:state', check);
    btn.addEventListener('click', () => { if (!v.querySelector('source[src]')) attach(); nativePlay().then(() => { btn.hidden = true; refused = false; media.refresh(); }).catch(() => {}); });
  }
}

/* ---------- the rest of the modules ------------------------------------------ */
const SHORTCUTS = `/ console, ? keys, J K sections, 1 to 4 tunnel views, F freeze`;
async function mountRest() {
  guard('media', () => { setupVideos(); media.scan(); });
  await guardAsync('console', async () => {
    const { mountConsole } = await import('./console.js');
    mods.console = mountConsole({ commands: pageCommands(), live: false });
    bus.on('console:run', ({ output }) => { const line = (output || '').split('\n').find((l) => l.trim()); if (line) announce(line); });
    if (pendingRoute && decodeURIComponent(location.hash.slice(1)) === pendingRoute) routeHash();   /* an unknown hash seen before the mount: now into the log */
    pendingRoute = null;
  });
  await guardAsync('dimension', async () => {
    const { mountDimensions } = await import('./dimension.js');
    /* the corner note sits at (inset, viewport height - inset): on phones it goes in the gap between the copy and the stage bar, which is 48 px over the 56 px strip on touch */
    const barTop = $('stage-bar').getBoundingClientRect().top, below = innerHeight - barTop;
    const noteInset = narrow.matches ? (below > 40 && below < 200 ? Math.round(below) + 8 : 120) : 96;
    mods.dims = mountDimensions($('dimensions'), { noteInset });
    $('dimensions').style.setProperty('--dim-note-inset', `${noteInset}px`);   /* vx.css / mobile.css shift the note's x onto the page margin */
    syncDims();
  });
  await guardAsync('timeline', async () => {
    const { mountTimeline } = await import('./timeline.js');
    mods.timeline = mountTimeline($('timeline-root'));
  });
  await guardAsync('ladder', async () => {
    const { mountLadder } = await import('./ladder.js');
    mods.ladder = mountLadder($('ladder-root'));
    /* the notes log runs full width under the two columns (vx.css lays it out); the section is static once rendered */
    const notes = $('ladder-root').querySelector('.ld-notes'), log = $('ladder-log');
    if (notes && log) log.append(notes);
  });
  await guardAsync('hid', async () => {
    const { mountHid } = await import('./hid.js');
    mods.hid = mountHid($('hid-root'));
  });
  await guardAsync('contact-sheet', async () => {
    const [{ mountContactSheet }, { frames }] = await Promise.all([import('./contact-sheet.js'), import('./data/frames.js')]);
    mods.sheet = mountContactSheet($('contact-sheet'), { frames });
  });
  scroll.refresh();
  mods.instruments?.refresh();
  mods.dims?.refresh();
  placePins();
  scheduleManifest();
}
mountRest();

/* ---------- pinned columns (desktop): the short column of a two-column section rides along -------- */
/* a column that fits under the header pins 32 px below it; a taller one pins with its bottom 32 px above the viewport's, so it scrolls
   through once and then holds its last lines beside the long column (vx.css: .js .pin { position: sticky; top: var(--pin-top) }) */
const pinEls = [...document.querySelectorAll('.pin')];
const wideQuery = matchMedia('(min-width: 860px)');
let pinRaf = 0;
function placePins() {
  pinRaf = 0;
  if (!wideQuery.matches) return;
  const top = Math.round(headerH() + 32), floor = innerHeight - 32;
  for (const el of pinEls) {
    const t = `${Math.min(top, Math.round(floor - el.offsetHeight))}px`;
    if (el.style.getPropertyValue('--pin-top') !== t) el.style.setProperty('--pin-top', t);
  }
}
const schedulePins = () => { if (!pinRaf) pinRaf = requestAnimationFrame(placePins); };
if ('ResizeObserver' in window) { const ro = new ResizeObserver(schedulePins); for (const el of pinEls) ro.observe(el); }
addEventListener('resize', schedulePins);
wideQuery.addEventListener?.('change', schedulePins);
placePins();

/* ---------- the console's command table --------------------------------------- */
function go(href, io, { newTab = false } = {}) {
  io.link(newTab ? 'Opens in a new tab' : 'Opening', href);
  if (newTab) { const a = document.createElement('a'); a.href = href; a.target = '_blank'; a.rel = 'noopener'; document.body.append(a); a.click(); a.remove(); }
  else setTimeout(() => { location.assign(href); }, 120);
}
function dimPromote() {
  for (const el of document.querySelectorAll('[data-dim-more]')) { el.setAttribute('data-dim', el.getAttribute('data-dim-more')); el.removeAttribute('data-dim-more'); }
}
function pageCommands() {
  const stationList = () => STATION_KEYS.map((k, i) => ({ label: k, help: `${pad2(i + 1)} ${STATION_LABELS[i]}`, insert: k }));
  return [
    { name: 'goto', args: '<station | part id | #section>', help: 'Fly to a station (1 to 8, or nose, camera, pcb, battery, coupler, altimeter, motor, cap), a part id (0 to 29) or a section (#ladder, #contact and so on)',
      complete: (a) => [...stationList(), ...SECTION_IDS.map((s) => ({ label: `#${s}`, help: 'section', insert: `#${s}` }))].filter((c) => !a || c.label.toLowerCase().includes(a.toLowerCase())).slice(0, 8),
      run([t], io) {
        if (!t) return io.error('Usage: goto <station | part id | #section>');
        const raw = String(t), key = raw.replace(/^#/, '').toLowerCase();
        if (SECTION_IDS.includes(key)) { scrollToSection(key); return io.print(`Scrolled to #${key}`); }
        if (raw.startsWith('#')) { scrollTo({ top: 0, behavior: 'instant' }); return io.error(`NO SECTION AT #${key}`); }   /* a # is always a section: #3 is not station 3 */
        const si = STATION_KEYS.indexOf(key) >= 0 ? STATION_KEYS.indexOf(key) : (/^[1-8]$/.test(key) ? Number(key) - 1 : -1);
        if (si >= 0) { scrollToProgress(stationProgress(si), 'instant'); return io.print(`Station ${pad2(si + 1)} / ${STATION_LABELS[si]} / progress ${stationProgress(si).toFixed(3)}`, { className: 'con-line--ok' }); }
        const id = /^\d+$/.test(key) ? Number(key) : NaN;
        if (Number.isFinite(id) && mods.stage && !mods.stage.fallback) {
          const part = mods.stage.parts.find((p) => p.id === id);
          if (!part || part.referenceOnly) return io.error(`No drawable part ${pad2(id)}`);
          io.print(`Part ${pad2(id)} / ${part.label}`, { className: 'con-line--ok' });
          if (mods.callouts) {
            /* the modal console would swallow the focus (the page behind it is inert), and the new station's label is still unplaced (is-off) until
               the next render: close first, lock, and focus the label once a render has placed it */
            mods.console?.close();
            mods.callouts.lock(id);
            focusCalloutWhenPlaced(id);
          } else mods.stage.goto(id).catch(() => {});
          return;
        }
        return io.error(`Nothing named ${raw}. Stations: ${STATION_KEYS.join(', ')}. Sections start with #.`);
      } },
    { name: 'explode', args: '<0..1 | auto>', help: 'Override the explode schedule, or return to it',
      run([v], io) {
        if (v === undefined) return io.print(`Explode ${explodeOut.value}`);
        if (v === 'auto' || v === 'off') { setExplodeOverride(null); return io.print('Explode follows the scroll schedule.', { className: 'con-line--ok' }); }
        const n = parseFloat(v); if (!Number.isFinite(n)) return io.error('Usage: explode <0..1 | auto>');
        setExplodeOverride(clamp(n, 0, 1)); io.print(`Explode ${clamp(n, 0, 1).toFixed(2)}`, { className: 'con-line--ok' });
      } },
    { name: 'mode', args: '<solid | edges | wire>', help: 'Draw mode of the stage', complete: (a) => ['solid', 'edges', 'wire'].filter((m) => m.startsWith(a || '')),
      run([m], io) {
        if (!['solid', 'edges', 'wire'].includes(m)) return io.error('Usage: mode <solid | edges | wire>');
        if (!mods.stage || mods.stage.fallback) return io.error('No stage: the poster is shown.');
        mods.stage.setMode(m); io.print(`Mode ${m}`, { className: 'con-line--ok' });
      } },
    { name: 'gov', args: '[0-3 | auto]', help: 'Read or pin the quality governor', complete: (a) => ['0', '1', '2', '3', 'auto'].filter((t) => t.startsWith(a || '')),
      run([t], io) {
        const s = governor.stats;
        if (t === undefined) return io.print(`Tier ${governor.tier} / ceiling ${governor.ceiling} / ${s.pinned ? 'pinned' : 'measured'} / p50 ${s.p50Ms.toFixed(1)} ms / p95 ${s.p95Ms.toFixed(1)} ms / ${s.frames} frames`);
        if (t === 'auto') { storedPin = null; governor.pin(null); applyPins(); return io.print('Governor measuring.', { className: 'con-line--ok' }); }
        const n = parseInt(t, 10); if (!(n >= 0 && n <= 3)) return io.error('Usage: gov <0-3 | auto>');
        storedPin = null; governor.pin(n); io.print(`Governor pinned at tier ${n}.`, { className: 'con-line--ok' });
      } },
    { name: 'telemetry', args: '[open | close]', help: 'Show or hide the telemetry wall',
      run([v], io) {
        if (narrow.matches && mods.telemetry) { v === 'close' ? mods.telemetry.close() : mods.telemetry.open(); return io.print('Telemetry sheet.'); }
        setTelUser(v === 'close' ? false : v === 'open' ? true : dock.classList.contains('is-collapsed'));
        io.print(`Telemetry ${telUser ? 'open' : 'closed'}.`);
      } },
    { name: 'status', args: '', help: 'Print the telemetry wall as text', run(_, io) { io.print(mods.telemetry ? mods.telemetry.snapshot() : 'Telemetry is not mounted.'); } },
    { name: 'manifest', args: '', help: 'Every script and stylesheet this page loaded, with transfer size and duration, from Resource Timing',
      run(_, io) {
        const { rows, total } = manifestRows();
        io.table(rows.map((r) => [r.name, r.size, r.ms]), { head: ['File', 'Transfer', 'Duration'], align: ['l', 'r', 'r'] });
        io.print(total, { className: 'con-line--dim' });
        const foot = $('manifest-foot'); if (foot) io.print(foot.textContent.trim(), { className: 'con-line--dim' });   /* what the page stores, as the manifest's footer says it */
        for (const f of failures) io.error(`MODULE FAILED ${f.name}: ${f.message}`);
      } },
    { name: 'export', args: '', help: 'Compose the marked contact-sheet frames into a PNG and download it',
      run(_, io) { if (!mods.sheet) return io.error('The contact sheet is not mounted.'); io.print('Composing contact-sheet.png'); mods.sheet.export().then(() => io.print('Exported.', { className: 'con-line--ok' })).catch((e) => io.error(`Export failed: ${e && e.message}`)); } },
    { name: 'reader', args: '[on | off]', help: 'Reading mode: the stage unpins, the stations list as text, tier 0', complete: (a) => ['on', 'off'].filter((t) => t.startsWith(a || '')),
      run([v], io) { setReader(v === undefined ? !readerOn : v !== 'off', { say: false }); io.print(`Reading mode ${readerOn ? 'on' : 'off'} (stored locally as vx-reader).`, { className: 'con-line--ok' }); } },
    { name: 'dim', args: '[on | off]', help: 'Live dimension lines on the layout, in CSS px and mm', complete: (a) => ['on', 'off'].filter((t) => t.startsWith(a || '')),
      run([v], io) {
        if (!mods.dims) return io.error('Dimensions are not mounted.');
        dimsManual = true;
        if (v === 'off') { mods.dims.disable(); return io.print('Dimensions off.'); }
        dimPromote(); mods.dims.enable(); mods.dims.refresh();
        const s = mods.dims.state; io.print(`Dimensions on / ${pad2(s.count)} live / ${pad2(s.targets)} targets / CSS px @ 96 dpi.`, { className: 'con-line--ok' });
      } },
    { name: 'boot', args: '', help: 'Replay the T-minus sequence',
      run(_, io) {
        if (document.getElementById('boot')) return io.error('The boot is already up.');
        mods.console?.close();
        const opener = document.querySelector('[data-console-open]');
        const el = document.createElement('div'); el.id = 'boot'; el.className = 'bt'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Loading');
        const skip = document.createElement('button'); skip.className = 'bt-skip'; skip.type = 'button'; skip.textContent = 'Skip';
        const facts = document.querySelector('.vx-footer .facts'); const strip = facts ? facts.cloneNode(true) : document.createElement('p'); strip.className = 'bt-facts';
        el.append(skip, strip); document.body.prepend(el);
        skip.focus();   /* the page behind is inert: focus goes to the overlay's first control, and back to the opener when the replay is over */
        createBoot({ overlay: el, repeat: false, bypass: false, remember: false, geometry: 'stream' }).run().then(() => { announce('Boot replay complete.'); if (opener && opener.isConnected) opener.focus(); });
        io.print('Replaying the boot.', { className: 'con-line--ok' });
      } },
    { name: 'field', args: '<smoke | velocity | pressure | vorticity>', help: 'The tunnel\'s composite view', complete: (a) => tunnelFields.filter((f) => f.startsWith(a || '')),
      run([f], io) {
        if (!mods.tunnel || mods.tunnel.fallback) return io.error('The tunnel is off on this device.');
        if (!tunnelFields.includes(f)) return io.error('Usage: field <smoke | velocity | pressure | vorticity>');
        mods.tunnel.setField(f); io.print(`Field ${f} / page simulation, not flight data.`, { className: 'con-line--ok' });
      } },
    { name: 'websites', args: '', help: 'The website service page', run(_, io) { go('../websites.html', io); } },
    { name: 'inquire', args: '', help: 'Start a website inquiry', run(_, io) { go('../websites.html#inquiry', io); } },
    { name: 'resume', args: '', help: 'Mert Tureli, PDF', run(_, io) { go('../assets/Mert-Tureli-Resume.pdf', io, { newTab: true }); } },
    { name: 'linkedin', args: '', help: 'linkedin.com/in/merttureli', run(_, io) { go('https://linkedin.com/in/merttureli', io, { newTab: true }); } },
    { name: 'mail', args: '', help: 'merttureli0@gmail.com', run(_, io) { go('mailto:merttureli0@gmail.com', io); } },
    { name: 'lab', args: '', help: 'Every engine alone with its parameters exposed', run(_, io) { go('lab/', io); } },
    { name: 'keys', args: '', help: 'The shortcut sheet', run(_, io) { io.print(SHORTCUTS); openKeys(); } },
  ];
}

/* ---------- the build manifest (Resource Timing) ----------------------------------- */
const fmtBytes = (b) => (b >= 1e6 ? `${(b / 1e6).toFixed(2)} MB` : b >= 1e3 ? `${Math.round(b / 1e3)} KB` : `${b} B`);
function manifestRows() {
  const seen = new Set();
  const entries = performance.getEntriesByType('resource').filter((e) => {
    if (!/\.(m?js|css|ttf)(\?|$)/.test(e.name)) return false;
    if (!/\/vx\/(js|css)\/|\/charger-explorer\/(vendor\/|livery\.js|part-stories\.js|fonts\/)/.test(e.name)) return false;
    if (seen.has(e.name)) return false; seen.add(e.name); return true;
  });
  let bytes = 0;
  const rows = entries.map((e) => {
    const name = e.name.replace(/^.*?\/(vx\/|assets\/)/, '$1');
    const script = /\.m?js(\?|$)/.test(e.name);
    bytes += e.transferSize || 0;
    return { name, size: e.transferSize ? fmtBytes(e.transferSize) : '0 B', ms: script ? `${e.duration.toFixed(1)} ms` : '', script };
  });
  const zero = entries.filter((e) => !e.transferSize).length;
  const total = `${rows.length} files / ${fmtBytes(bytes)} transferred${zero ? ` / ${zero} at 0 B (cached or not reported)` : ''} / measured now in this browser`;
  return { rows, total };
}
let manifestTimer = 0;
function scheduleManifest() { clearTimeout(manifestTimer); manifestTimer = setTimeout(renderManifest, 600); }
function renderManifest() {
  const body = $('manifest-body'); if (!body) return;
  const { rows, total } = manifestRows();
  const frag = document.createDocumentFragment();
  const td = (text, cls) => { const c = document.createElement('td'); c.textContent = text; if (cls) c.className = cls; return c; };
  for (const r of rows) { const tr = document.createElement('tr'); tr.append(td(r.name), td(r.size), td(r.ms)); frag.append(tr); }
  for (const f of failures) { const tr = document.createElement('tr'); tr.className = 'failed'; tr.append(td(`MODULE FAILED / ${f.name}`), td('—'), td(f.message.slice(0, 60))); frag.append(tr); }
  const tr = document.createElement('tr'); const c = td(total, 'muted'); c.colSpan = 3; tr.append(c); frag.append(tr);
  body.replaceChildren(frag);
}
try { new PerformanceObserver(() => scheduleManifest()).observe({ type: 'resource', buffered: true }); } catch { scheduleManifest(); }
addEventListener('load', scheduleManifest);

/* ---------- keys ------------------------------------------------------------------ */
const keys = $('keys');
function openKeys() { if (keys && !keys.open) { try { keys.showModal(); } catch { keys.setAttribute('open', ''); } } }
keys?.querySelector('[data-keys-close]')?.addEventListener('click', () => keys.close());
keys?.addEventListener('click', (e) => { if (e.target === keys) keys.close(); });
const inEditable = (t) => !!(t instanceof Element && t.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]'));
function stepSection(dir) {
  const secs = scroll.sections; if (!secs.length) return;
  const cur = scroll.current; const i = clamp((cur ? cur.index : -1) + dir, 0, secs.length - 1);
  if (secs[i].id === 'range') scrollTo({ top: 0, behavior: 'smooth' }); else scroll.to(secs[i].el, { offset: -headerH() });
}
addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey || inEditable(e.target)) return;
  const dialogOpen = !!document.querySelector('dialog[open]');
  if (e.key === '?') { if (dialogOpen && !keys.open) return; e.preventDefault(); keys.open ? keys.close() : openKeys(); return; }
  if (dialogOpen) return;
  switch (e.key) {
    case 'j': case 'J': e.preventDefault(); stepSection(1); break;
    case 'k': case 'K': e.preventDefault(); stepSection(-1); break;
    case '1': case '2': case '3': case '4': if (mods.tunnel && !mods.tunnel.fallback) { const f = tunnelFields[Number(e.key) - 1]; mods.tunnel.setField(f); announce(`Tunnel view ${f}`); } break;
    case 'f': case 'F': if (mods.tunnel && !mods.tunnel.fallback) { tunnelFrozen = !tunnelFrozen; mods.tunnel.freeze(tunnelFrozen); announce(tunnelFrozen ? 'Tunnel frozen' : 'Tunnel running'); } break;
    default: break;
  }
});

/* ---------- first frame ---------------------------------------------------------- */
onFrame();
if (!mods.stage) stageState.textContent = stateText(-1, null);
window.vx = { bus, governor, scroll, media, mods, failures, get progress() { return progress; } };
