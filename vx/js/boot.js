/* boot.js — the T-minus boot sequencer.

   Every line in the log is a real awaited step with its measured duration
   (performance.mark / measure), the geometry bar advances in real bytes from a
   streamed fetch of assembly.bin, and while the bytes arrive a pen plotter draws
   CHARGER's front view from the exterior parts' wire data (plotter.js).

   Clock: T-minus counts down from minMs toward the unmask. If the steps are not
   done when it reaches zero the count HOLDS at T-00:00:00.000 (a built-in hold)
   until they are. maxMs is a hard cap: one timer armed at run() prints RANGE IS
   GREEN and unmasks whatever is still pending; the steps and the geometry keep
   running behind the page. Any key, click, tap, wheel or the first scroll skips
   the visual; loads continue. Repeat visits (localStorage vx-boot-v1) and tier 0
   print one line and unmask after 400 ms. ?card, #card and ?noboot bypass the
   overlay entirely.

   The overlay's static children survive mounting: the integrator's fact strip
   (.bt-facts) and SKIP button (.bt-skip) stay first in DOM order; the sequencer
   appends its own nodes after them and adds a SKIP button when none exists.
   While the overlay is up its siblings are inert, it is role="dialog", and one
   visually hidden status line (.bt-status) is the only live region.

   Geometry: 'stream' fetches assembly.bin at once; 'defer' prints
   02 GEOMETRY deferred and waits for boot.loadGeometry(); 'auto' (default) defers
   under navigator.connection.saveData or an effectiveType of slow-2g / 2g / 3g.

   Events: boot:line {index, label, result, ms}, boot:progress {received, total},
   boot:done {timings, skipped, bypassed}, assets:geometry {json, buffer}.
   runBoot() resolves with {geometry: {json, buffer} | null, timings, skipped,
   deferred, bypassed, loadGeometry}. */
import { bus } from './core/bus.js';
import { governor } from './core/governor.js';
import { createPlotter, EXTERIOR_IDS } from './plotter.js';

const JSON_URL = new URL('../../assets/charger-explorer/assembly.json', import.meta.url);
const BIN_URL = new URL('../../assets/charger-explorer/assembly.bin', import.meta.url);
const FONT_FACES = ['500 32px "Space Grotesk"', '400 12px "IBM Plex Mono"'];
const STORAGE_KEY = 'vx-boot-v1';   // versioned repeat-visit flag, stored locally (spec 7.1 / 7.8)
const DEFAULT_MIN_MS = 900;
const MAX_MS_FINE = 2200;
const MAX_MS_COARSE = 1200;
const FAST_HOLD_MS = 400;        // repeat visit and tier 0: one line, then unmask
const GOVERNOR_FRAMES = 20;      // frames the governor step waits for
const GOVERNOR_WAIT_MS = 600;    // or this long, whichever comes first
const LINE_REVEAL_MS = 240;      // the site's --dur-2 for a log line
const READOUT_HZ = 10;           // plotter readout text writes per second
const STATUS_GAP_MS = 600;       // the live status line is rewritten at most this often (closing lines at once)
const SCROLL_GUARD_MS = 250;     // a scroll this soon after run() is restoration, not the visitor
const SCROLL_SKIP_PX = 8;
const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';

const STEPS = ['FONTS', 'MANIFEST', 'GEOMETRY', 'RENDERER', 'GOVERNOR', 'INSTRUMENTS'];
const GREEN = 'RANGE IS GREEN', READY = 'READY', SKIPPED = 'SKIPPED';
const FINAL_INDEX = 99;          // sort key that keeps the closing line last in timings
const MODIFIER_KEYS = /^(Shift|Control|Alt|Meta|CapsLock|Tab|NumLock|ScrollLock|Dead|Fn|OS|Unidentified)$/;
const ACTIVATE_KEYS = /^(Enter| |Spacebar)$/;   // the keys a focused link or button acts on itself

const fmtInt = (n) => Math.round(n).toLocaleString('en-US');
const fmtMs = (ms) => `${ms < 10 ? ms.toFixed(1) : Math.round(ms)} ms`;
const sentence = (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
/* T-00:00:01.200 */
export function formatClock(ms) {
  const sign = ms < 0 ? '+' : '-';
  const a = Math.abs(ms);
  const h = Math.floor(a / 3600000), m = Math.floor(a / 60000) % 60, s = Math.floor(a / 1000) % 60, f = Math.floor(a % 1000);
  const p = (v, w = 2) => String(v).padStart(w, '0');
  return `T${sign}${p(h)}:${p(m)}:${p(s)}.${p(f, 3)}`;
}
/* maxMs per spec 7.1: 2200 on fine pointers, 1200 on coarse. */
export function defaultMaxMs() { try { return matchMedia('(pointer: coarse)').matches ? MAX_MS_COARSE : MAX_MS_FINE; } catch { return MAX_MS_FINE; } }
/* ?card, #card and ?noboot show the hero at once (spec 7.1). */
export function bootBypassed(loc = typeof location === 'object' ? location : null) {
  if (!loc) return false;
  try { const q = new URLSearchParams(loc.search || ''); return q.has('card') || q.has('noboot') || loc.hash === '#card'; } catch { return false; }
}
/* Why the bin should wait for a tap: 'save-data', 'slow-2g', '2g', '3g', or null. */
export function deferReason(nav = typeof navigator === 'object' ? navigator : null) {
  try {
    const c = nav && (nav.connection || nav.mozConnection || nav.webkitConnection);
    if (!c) return null;
    if (c.saveData) return 'save-data';
    const t = String(c.effectiveType || '');
    if (/^(slow-2g|2g|3g)$/.test(t)) return t;
  } catch {}
  return null;
}
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
function readVar(el, name, fallback) { try { const v = getComputedStyle(el).getPropertyValue(name).trim(); return v || fallback; } catch { return fallback; } }
function parseMs(v, fallback) { const m = /^([\d.]+)(ms|s)?$/.exec(v || ''); if (!m) return fallback; return Number(m[1]) * (m[2] === 's' ? 1000 : 1); }
function storage(get, value) { try { if (get) return localStorage.getItem(STORAGE_KEY); localStorage.setItem(STORAGE_KEY, value); } catch {} return null; }

/* createBoot gives the lab a handle; runBoot is the page's one-call form. */
export function createBoot({
  overlay, minMs = DEFAULT_MIN_MS, maxMs = defaultMaxMs(), autoUnmask = true, arm = null, penSpeed = 80, throttle = null, order = EXTERIOR_IDS, repeat = null,
  geometry = 'auto', bypass = bootBypassed(), skipOnScroll = true, inert = true, remember = true,
} = {}) {
  if (!overlay) throw new Error('runBoot needs the #boot overlay element');
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const timings = [];
  const whyDefer = geometry === 'defer' ? 'on request' : geometry === 'auto' ? deferReason() : null;
  const state = {
    startedAt: 0, phase: 'idle', skipped: false, unmasked: false, bypassed: false, green: false, stepsDone: false,
    deferred: whyDefer !== null, deferReason: whyDefer, geometryDone: whyDefer !== null, received: 0, total: 0, buffer: null, clock: 0,
  };
  let dom = null, plotter = null, raf = 0, offTier = null, destroyed = false, fast = false, reducedMotion = false, json = null, published = null;
  let resolveRun = null, runPromise = null, resolved = false, resolveGreen = null, greenPromise = null, unmaskPromise = null;
  let maxTimer = 0, statusTimer = 0, statusAt = -Infinity, scrollY0 = 0, skipButton = null, ownSkip = false;
  const timers = new Set();
  const inerted = [];
  const abort = typeof AbortController === 'function' ? new AbortController() : null;
  const elapsed = () => performance.now() - state.startedAt;
  /* A cancellable sleep: destroy() clears every pending timer, so a destroyed sequence never resumes. */
  function after(ms) { return new Promise((r) => { const t = setTimeout(() => { timers.delete(t); r(); }, ms); timers.add(t); }); }

  function mountDom() {
    overlay.dataset.state = 'counting';
    if (!overlay.hasAttribute('role')) overlay.setAttribute('role', 'dialog');
    if (!overlay.hasAttribute('aria-label')) overlay.setAttribute('aria-label', 'Loading');
    overlay.removeAttribute('aria-live');                 // only .bt-status is live (spec 7.1)
    // the visitor's SKIP: the integrator's static <button class="bt-skip"> when present, else ours, first in DOM order
    skipButton = overlay.querySelector('button.bt-skip');
    if (!skipButton) { skipButton = el('button', 'bt-skip', 'Skip'); skipButton.type = 'button'; overlay.prepend(skipButton); ownSkip = true; }
    skipButton.addEventListener('click', onSkipClick);
    const clock = el('div', 'bt-clock'); clock.setAttribute('aria-hidden', 'true');
    const clockKey = el('span', 'bt-clock-key', 'T minus');
    const clockValue = el('span', 'bt-clock-value', formatClock(minMs));
    const clockState = el('span', 'bt-clock-state', 'counting');
    clock.append(clockKey, clockValue, clockState);
    const log = el('ol', 'bt-log'); log.setAttribute('aria-hidden', 'true');
    const bar = el('div', 'bt-bar'); bar.setAttribute('aria-hidden', 'true');
    const barHead = el('div', 'bt-bar-head');
    barHead.append(el('span', null, 'assembly.bin'), el('span', 'bt-bar-pct', '0 %'));
    const track = el('div', 'bt-bar-track'); const fill = el('i', 'bt-bar-fill'); track.append(fill);
    const bytes = el('div', 'bt-bar-bytes', '0 / 0 B');
    bar.append(barHead, track, bytes);
    const plot = el('div', 'bt-plot'); plot.setAttribute('aria-hidden', 'true');
    const plotHead = el('div', 'bt-plot-head');
    const hint = el('span', 'bt-hint', 'skip: any key, tap or scroll');
    plotHead.append(el('span', null, 'CHARGER / front view / wire data'), hint);
    const stage = el('div', 'bt-plot-stage');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'bt-svg');
    stage.append(svg);
    const readout = el('dl', 'bt-plot-readout');
    const cell = (k) => { const dt = el('dt', null, k); const dd = el('dd', null, '0'); readout.append(dt, dd); return dd; };
    const rSeg = cell('segments'), rTravel = cell('pen travel'), rUp = cell('pen up'), rPen = cell('pen xy');
    plot.append(plotHead, stage, readout);
    const status = el('p', 'bt-status', 'Loading'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    overlay.append(clock, log, bar, plot, status);
    dom = { clock, clockValue, clockState, log, bar, fill, bytes, pct: barHead.lastChild, plot, svg, readout, rSeg, rTravel, rUp, rPen, hint, status };
  }

  /* One <li> per step; created when the step starts, filled when it resolves. Nothing is added after the unmask. */
  function row(index, label) {
    if (!dom || state.unmasked || destroyed) return null;
    const li = el('li', 'bt-line'); li.dataset.pending = 'true';
    const idx = el('span', 'bt-line-idx', index == null ? '' : String(index).padStart(2, '0'));
    const lab = el('span', 'bt-line-label', label);
    const res = el('span', 'bt-line-result', '');
    const ms = el('span', 'bt-line-ms', '');
    li.append(idx, lab, res, ms);
    const closing = index == null ? null : dom.log.querySelector('.bt-line-final');   // a step that lands after the cap prints above the closing line
    if (closing) dom.log.insertBefore(li, closing); else dom.log.appendChild(li);
    if (!reducedMotion) { try { li.animate([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: LINE_REVEAL_MS, easing: EASE_OUT }); } catch {} }
    return { li, res, ms };
  }
  function fill(r, result, ms, { warn = false, final = false } = {}) {
    if (!r) return;
    r.li.dataset.pending = 'false';
    if (warn) r.li.classList.add('bt-line-warn');
    if (final) r.li.classList.add('bt-line-final');
    r.res.textContent = result;
    r.ms.textContent = ms == null ? '' : fmtMs(ms);
  }
  /* timings stay in step order whatever order the steps resolve in (GEOMETRY may land after the closing line). */
  function record(index, label, ms) {
    let i = timings.length;
    while (i > 0 && timings[i - 1].index > index) i--;
    timings.splice(i, 0, { index, label, ms });
  }
  /* The one live region: the newest line, throttled; a closing line is written at once. */
  function announce(text, final) {
    if (!dom || destroyed) return;
    if (statusTimer) { clearTimeout(statusTimer); statusTimer = 0; }
    const write = () => { statusTimer = 0; statusAt = performance.now(); if (dom && !destroyed) dom.status.textContent = text; };
    const wait = STATUS_GAP_MS - (performance.now() - statusAt);
    if (final || wait <= 0) write(); else statusTimer = setTimeout(write, wait);
  }
  /* Run one named step: marks, measures, prints and emits. A destroyed boot prints and emits nothing. */
  async function step(index, label, fn, pre) {
    if (destroyed) return null;
    const name = `boot:${String(index).padStart(2, '0')}-${label}`;
    performance.mark(`${name}:start`);
    const t0 = performance.now();
    const r = row(index, label);
    if (pre) pre(r);
    let result, warn = false;
    try { result = await fn(r); }
    catch (err) { result = `FAILED / ${String(err && err.message || err).toUpperCase()}`; warn = true; }
    if (destroyed) return null;
    const ms = performance.now() - t0;
    performance.mark(`${name}:end`);
    try { performance.measure(name, `${name}:start`, `${name}:end`); } catch {}
    fill(r, result, ms, { warn });
    record(index, label, ms);
    announce(`${sentence(label)}: ${result}`, false);
    bus.emit('boot:line', { index, label, result, ms });
    return result;
  }
  function line(label, result, ms, { warn = false, final = false, keep = true, say = null } = {}) {
    if (destroyed) return;
    startClock();
    const r = row(null, label);
    fill(r, result, ms, { warn, final });
    if (keep) record(FINAL_INDEX, label, ms || 0);
    announce(say || (result ? `${sentence(label)}: ${result}` : sentence(label)), final);
    bus.emit('boot:line', { index: null, label, result, ms: ms || 0 });
  }

  /* ---- loads: manifest then the streamed bin; these run regardless of the visual ---- */
  let manifestPromise = null, geometryPromise = null;
  function ensureManifest() {
    if (!manifestPromise) {
      manifestPromise = fetch(JSON_URL, { signal: abort?.signal }).then((res) => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); }).then((j) => { json = j; state.total = j.bytes | 0; return j; });
      // the plotter exists as soon as the manifest does, even while 00 FONTS is still pending
      manifestPromise.then((j) => ensurePlotter(j)).catch(() => {});
    }
    return manifestPromise;
  }
  function startGeometry() {
    if (!geometryPromise) { geometryPromise = ensureManifest().then((j) => streamGeometry(j)); geometryPromise.catch(() => {}); }
    return geometryPromise;
  }
  function startLoads() { ensureManifest(); if (!state.deferred) startGeometry(); }
  function ensurePlotter(j) {
    if (plotter || !dom || fast || state.unmasked || destroyed) return;
    plotter = createPlotter(dom.svg, { json: j, order, speed: penSpeed, tier: governor.tier });
    if (state.buffer && state.received) plotter.feed(state.buffer, state.received);   // bytes that landed before the plotter existed
    startClock();
  }
  async function streamGeometry(j) {
    const total = j.bytes | 0;
    state.total = total;
    const res = await fetch(BIN_URL, { signal: abort?.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const headerLen = Number(res.headers.get('content-length')) || 0;
    let buffer = new ArrayBuffer(Math.max(total, headerLen, 1));
    let bytes = new Uint8Array(buffer);
    let received = 0;
    const take = (chunk) => {
      if (received + chunk.length > bytes.length) {       // longer than announced: grow
        const grown = new Uint8Array(Math.max(bytes.length * 2, received + chunk.length));
        grown.set(bytes.subarray(0, received)); bytes = grown; buffer = grown.buffer;
      }
      bytes.set(chunk, received); received += chunk.length;
      state.received = received; state.buffer = buffer;
      plotter?.feed(buffer, received);
      bus.emit('boot:progress', { received, total });
    };
    if (res.body && typeof res.body.getReader === 'function') {
      const reader = res.body.getReader();
      const chunkBytes = throttle?.chunkBytes > 0 ? throttle.chunkBytes : Infinity;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        for (let i = 0; i < value.length; i += chunkBytes) {
          take(value.subarray(i, Math.min(value.length, i + chunkBytes)));
          if (throttle?.delayMs > 0) await after(throttle.delayMs);
        }
      }
    } else {
      take(new Uint8Array(await res.arrayBuffer()));
    }
    if (received !== buffer.byteLength) buffer = buffer.slice(0, received);
    state.buffer = buffer;
    state.geometryDone = true;
    return { json: j, buffer, received, total };
  }
  function publish(g) {
    if (!published) { published = { json: g.json, buffer: g.buffer }; bus.emit('assets:geometry', published); }
    return published;
  }
  /* Deferred geometry: start the stream now (a tap on the stage, LOAD 3D / 2.5 MB). Resolves {json, buffer} or null. */
  function loadGeometry() {
    if (destroyed) return Promise.resolve(null);
    if (state.deferred) { state.deferred = false; state.geometryDone = false; lastReceived = -1; startClock(); }
    return startGeometry().then(publish, () => null);
  }

  /* ---- the clock, the bar and the plotter readout: one rAF while the overlay is up ---- */
  let readoutAt = 0, lastReceived = -1, lastTotal = -1;
  function tick(now) {
    raf = 0;
    if (!dom || state.unmasked || destroyed) return;
    const remaining = minMs - (now - state.startedAt);
    if (remaining > 0) { state.clock = remaining; dom.clockValue.textContent = formatClock(remaining); }
    else {
      state.clock = 0;
      dom.clockValue.textContent = formatClock(0);
      // a built-in hold: the count sits at zero until the steps and the geometry are in, or maxMs releases it
      if ((!state.stepsDone || !state.geometryDone) && overlay.dataset.state === 'counting') { overlay.dataset.state = 'hold'; dom.clockState.textContent = state.stepsDone ? 'hold / geometry' : 'hold'; }
    }
    if (state.received !== lastReceived || state.total !== lastTotal) {
      lastReceived = state.received; lastTotal = state.total;
      const frac = state.total ? Math.min(1, state.received / state.total) : 0;
      dom.fill.style.transform = `scaleX(${frac.toFixed(4)})`;
      dom.pct.textContent = state.deferred ? 'deferred' : `${Math.floor(frac * 100)} %`;
      dom.bytes.textContent = state.deferred ? `0 / ${fmtInt(state.total)} B / ${state.deferReason}` : `${fmtInt(state.received)} / ${fmtInt(state.total)} B`;
    }
    // once the range is green and the pen has parked there is nothing left to animate
    const settled = state.stepsDone && state.geometryDone && (!plotter || plotter.stats.done) && overlay.dataset.state !== 'hold';
    if (plotter && (settled || now - readoutAt > 1000 / READOUT_HZ)) {
      readoutAt = now;
      const s = plotter.stats;
      dom.rSeg.textContent = fmtInt(s.segments);
      dom.rUp.textContent = `${s.travelUp.toFixed(2)} m`;
      dom.rPen.textContent = s.busy ? `${(s.pen[0] / 1000).toFixed(3)} / ${(-s.pen[1] / 1000).toFixed(3)} m` : s.done ? `parked / ${s.arrived} parts` : `up / ${s.arrived} of ${s.parts} parts`;
      dom.rTravel.textContent = s.busy ? `${s.drawn.toFixed(2)} of ${s.travel.toFixed(2)} m` : `${s.travel.toFixed(2)} m`;
    }
    if (settled && remaining <= 0) return;
    raf = requestAnimationFrame(tick);
  }
  function startClock() { if (!raf && dom && !state.unmasked && !destroyed) raf = requestAnimationFrame(tick); }
  function stopClock() { if (raf) cancelAnimationFrame(raf); raf = 0; }

  /* ---- skip: the SKIP button, any key, click, tap, wheel, or the first scroll ---- */
  const isControl = (t) => t && t.nodeType === 1 && /^(input|select|textarea|button|a)$/i.test(t.tagName);
  const isField = (t) => t && t.nodeType === 1 && (/^(input|select|textarea)$/i.test(t.tagName) || t.isContentEditable);
  /* Escape and any key on the overlay's own SKIP always skip; a text field keeps its keys; a link or another button keeps
     only Enter / Space (the fact strip's links still navigate), every other key skips from there too. */
  function onKey(e) {
    if (e.metaKey || e.ctrlKey || e.altKey || MODIFIER_KEYS.test(e.key)) return;
    const t = e.target;
    if (e.key !== 'Escape' && t !== skipButton && (isField(t) || (isControl(t) && ACTIVATE_KEYS.test(e.key)))) return;
    skip();
  }
  function onPointer(e) { if (isControl(e.target)) return; skip(); }
  function onWheel() { skip(); }
  function onScroll() { if (elapsed() < SCROLL_GUARD_MS) { scrollY0 = window.scrollY; return; } if (Math.abs(window.scrollY - scrollY0) >= SCROLL_SKIP_PX) skip(); }
  function onSkipClick(e) { e.preventDefault(); skip(); }
  function listen() {
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('pointerdown', onPointer);
    overlay.addEventListener('wheel', onWheel, { passive: true });
    overlay.addEventListener('touchmove', onWheel, { passive: true });
    if (skipOnScroll) { scrollY0 = window.scrollY; window.addEventListener('scroll', onScroll, { passive: true }); }
  }
  function unlisten() {
    document.removeEventListener('keydown', onKey);
    overlay.removeEventListener('pointerdown', onPointer);
    overlay.removeEventListener('wheel', onWheel);
    overlay.removeEventListener('touchmove', onWheel);
    window.removeEventListener('scroll', onScroll);
    skipButton?.removeEventListener('click', onSkipClick);
  }
  function skip() {
    if (state.unmasked || destroyed) return;
    if (!state.green) {                                   // after RANGE IS GREEN a key only releases a held overlay
      state.skipped = true;
      line(SKIPPED, `at ${formatClock(state.clock)}`, null, { keep: false, say: 'Skipped' });
    }
    unmask();
  }

  /* ---- the rest of the document is inert while the overlay is open ---- */
  function setInert(on) {
    if (!inert) return;
    if (on) {
      const parent = overlay.parentNode;
      if (!parent || !('inert' in HTMLElement.prototype)) return;
      for (const n of parent.children) { if (n !== overlay && !n.inert && !/^(script|style|link|template|noscript)$/i.test(n.tagName)) { n.inert = true; inerted.push(n); } }
    } else {
      for (const n of inerted.splice(0)) n.inert = false;
    }
  }

  /* ---- green: the closing line, from the step chain or from the maxMs cap, whichever comes first ---- */
  function green() {
    if (state.green || state.unmasked || destroyed) return;
    state.green = true;
    if (maxTimer) { clearTimeout(maxTimer); maxTimer = 0; }
    const total = elapsed();
    performance.mark('boot:green');
    try { performance.measure('boot:total', 'boot:start', 'boot:green'); } catch {}
    overlay.dataset.state = 'green';
    const pending = !state.stepsDone ? 'steps in flight' : !state.geometryDone ? `geometry in flight / ${fmtInt(state.received)} B` : '';
    if (dom) dom.clockState.textContent = pending ? `range green / ${pending.split(' / ')[0]}` : 'range green';
    line(GREEN, pending || formatClock(-total), total, { final: true, say: 'Range is green' });
    resolveGreen?.();
    if (autoUnmask) unmask();
  }

  /* ---- unmask: finish the drawing, wipe with clip-path, remove ---- */
  function unmask() {
    if (destroyed) return Promise.resolve();
    if (unmaskPromise) return unmaskPromise;
    state.unmasked = true;
    if (maxTimer) { clearTimeout(maxTimer); maxTimer = 0; }
    overlay.dataset.state = 'go';
    if (dom) { dom.clockState.textContent = 'go'; dom.clockValue.textContent = formatClock(0); }
    unlisten(); stopClock(); offTier?.(); offTier = null;
    plotter?.finish();
    if (remember) storage(false, '1');                    // a real unmask only, never a destroyed boot
    setInert(false);
    resolveGreen?.();
    bus.emit('boot:done', { timings: timings.slice(), skipped: state.skipped, bypassed: false });
    const dur = reducedMotion ? 1 : parseMs(readVar(overlay, '--dur-3', '480ms'), 480);
    const ease = readVar(overlay, '--ease-out', EASE_OUT);
    unmaskPromise = (async () => {
      try {
        const anim = overlay.animate([{ clipPath: 'inset(0 0 0 0)' }, { clipPath: 'inset(0 0 100% 0)' }], { duration: dur, easing: ease, fill: 'forwards' });
        await anim.finished;
      } catch {}
      if (destroyed) return;
      plotter?.destroy(); plotter = null;
      overlay.remove();
    })();
    return unmaskPromise;
  }

  /* ---- the sequence ---- */
  function finishRun(geometry) {
    state.phase = 'done';
    if (resolved || !resolveRun) return;
    resolved = true;
    resolveRun({ geometry, timings: timings.slice(), skipped: state.skipped, deferred: state.deferred, bypassed: state.bypassed, loadGeometry });
  }
  function run() {
    if (!runPromise) {
      runPromise = new Promise((r) => (resolveRun = r));
      if (destroyed) finishRun(null); else sequence().catch(() => finishRun(null));
    }
    return runPromise;
  }
  async function sequence() {
    state.startedAt = performance.now(); state.phase = 'running';
    performance.mark('boot:start');
    greenPromise = new Promise((r) => (resolveGreen = r));
    if (bypass) {
      state.bypassed = true; state.skipped = true; state.unmasked = true; state.green = true; state.stepsDone = true;
      overlay.remove();
      startLoads();
      bus.emit('boot:done', { timings: [], skipped: true, bypassed: true });
      return settle();
    }
    reducedMotion = governor.tier === 0;
    const again = repeat ?? storage(true) === '1';
    fast = reducedMotion || again;
    mountDom();
    listen();
    setInert(true);
    offTier = governor.subscribe(({ tier }) => plotter?.setTier(tier));   // registered before anything can unmask
    startLoads();
    if (fast) {
      overlay.classList.add('bt-fast');
      state.stepsDone = true; state.green = true;
      let why = 'repeat visit / stored locally';
      if (reducedMotion) {
        const reason = String(bus.state['governor:tier']?.reason || '');
        why = governor.stats.pinned ? 'tier 0 pinned' : (governor.ceiling === 0 || /reduced/.test(reason)) ? 'reduced motion' : `tier 0 / ${reason || 'governor'}`;
      }
      line(reducedMotion ? READY : GREEN, why, null, { final: true, say: reducedMotion ? 'Ready' : 'Range is green' });
      resolveGreen?.();
      await after(FAST_HOLD_MS);
      if (destroyed) return;
      if (autoUnmask) unmask();
    } else {
      startClock();
      maxTimer = setTimeout(() => { maxTimer = 0; green(); }, Math.max(0, maxMs));   // the hard cap, whatever step is pending
      await step(0, STEPS[0], async () => {
        if (!document.fonts || !document.fonts.load) return 'skipped';
        const sets = await Promise.all(FONT_FACES.map((f) => document.fonts.load(f).catch(() => [])));
        const n = sets.filter((s) => s && s.length).length;
        return `${n} / ${FONT_FACES.length} faces`;
      });
      await step(1, STEPS[1], async () => {
        const j = await ensureManifest();
        ensurePlotter(j);
        const visible = j.parts.filter((p) => !p.referenceOnly).length;
        return `${j.parts.length} parts / ${visible} visible`;
      });
      // 02 streams while 03..05 run; its row fills when the last byte lands. Deferred: the row says so and the bin waits for loadGeometry().
      const geometryStep = state.deferred
        ? step(2, STEPS[2], async () => `deferred / ${state.deferReason}`)
        : step(2, STEPS[2], async (r) => {
          const g = await geometryPromise;
          const ok = g.received === g.total;
          if (!ok && r) fill(r, '', null, { warn: true });
          return ok ? `${fmtInt(g.received)} B` : `length mismatch ${fmtInt(g.received)} / ${fmtInt(g.total)} B`;
        }, (r) => { if (r) r.res.textContent = 'streaming'; });
      geometryStep.catch(() => {});
      await step(3, STEPS[3], async () => {
        await new Promise((r) => setTimeout(r, 0));           // a macrotask boundary: a GEOMETRY row that has already landed closes before the context creation blocks the thread
        const c = document.createElement('canvas'); c.width = c.height = 1;
        let gl = null, kind = '';
        try { gl = c.getContext('webgl2'); kind = gl ? 'WebGL2' : ''; if (!gl) { gl = c.getContext('webgl'); kind = gl ? 'WebGL1' : ''; } } catch { gl = null; }
        if (!gl) return 'unavailable';
        let name = '';
        try { const ext = gl.getExtension('WEBGL_debug_renderer_info'); name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); } catch {}
        try { gl.getExtension('WEBGL_lose_context')?.loseContext(); } catch {}
        return name ? `${kind} / ${name}` : kind;
      });
      await step(4, STEPS[4], () => new Promise((res) => {
        // not in `timers`: this timeout must always run so the listener comes off, destroyed or not
        const t = setTimeout(done, GOVERNOR_WAIT_MS);
        const off = bus.on('governor:stats', (s) => { if (destroyed || s.frames >= GOVERNOR_FRAMES) done(); });
        function done() { clearTimeout(t); off(); const s = governor.stats; res(s.frames ? `${s.frames} frames / p50 ${s.p50Ms.toFixed(1)} ms / T${governor.tier}` : `T${governor.tier} / no sample`); }
      }));
      await step(5, STEPS[5], async () => { if (typeof arm === 'function') await arm(); else await nextFrame(); return 'armed'; });
      if (destroyed) return;
      state.stepsDone = true;
      if (!state.green) {
        // the range goes green when the geometry lands, but no later than maxMs and no sooner than minMs
        const deadline = Math.max(0, maxMs - elapsed());
        await Promise.race([geometryPromise ? geometryPromise.catch(() => {}) : Promise.resolve(), after(deadline), greenPromise]);
        const hold = Math.max(0, minMs - elapsed());
        if (hold) await Promise.race([after(hold), greenPromise]);
        if (destroyed) return;
        green();
      }
    }
    return settle();
  }
  /* Resolve with the geometry when it lands, which may be after the unmask (or never, when deferred). */
  async function settle() {
    let geometry = null;
    if (geometryPromise) {
      try { geometry = publish(await geometryPromise); }
      catch (err) { if (fast && !state.unmasked && !destroyed) line(STEPS[2], `failed / ${String(err && err.message || err).toUpperCase()}`, null, { warn: true, keep: false }); }   // the 02 row already printed it otherwise
    }
    if (destroyed) return;
    finishRun(geometry);
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    if (maxTimer) clearTimeout(maxTimer); maxTimer = 0;
    if (statusTimer) clearTimeout(statusTimer); statusTimer = 0;
    for (const t of timers) clearTimeout(t); timers.clear();
    unlisten(); stopClock(); offTier?.(); offTier = null; setInert(false);
    try { abort?.abort(); } catch {}
    plotter?.destroy(); plotter = null;
    if (ownSkip) skipButton?.remove();
    overlay.remove();
    resolveGreen?.();
    finishRun(null);
  }

  return { run, skip, unmask, destroy, loadGeometry, state, timings, get plotter() { return plotter; } };
}

export function runBoot(options) { return createBoot(options).run(); }
export default runBoot;
