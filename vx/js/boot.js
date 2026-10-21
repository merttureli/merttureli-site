/* boot.js — the T-minus boot sequencer.

   Every line in the log is a real awaited step with its measured duration
   (performance.mark / measure), the geometry bar advances in real bytes from a
   streamed fetch of assembly.bin, and while the bytes arrive a pen plotter draws
   CHARGER's front view from the exterior parts' wire data (plotter.js).

   Clock: T-minus counts down from minMs toward the unmask. If the steps are not
   done when it reaches zero the count HOLDS at T-00:00:00.000 (a built-in hold)
   until they are, or until maxMs, when the range goes green anyway and the
   geometry keeps loading behind the page. Any key, click or tap skips the visual;
   loads continue. Repeat visits in a session (sessionStorage vx-booted) and tier 0
   (reduced motion) print one line and unmask after 400 ms.

   Events: boot:line {index, label, result, ms}, boot:progress {received, total},
   boot:done {timings, skipped}, assets:geometry {json, buffer}.
   runBoot() resolves with {geometry: {json, buffer} | null, timings, skipped}. */
import { bus } from './core/bus.js';
import { governor } from './core/governor.js';
import { createPlotter, EXTERIOR_IDS } from './plotter.js';

const JSON_URL = new URL('../../assets/charger-explorer/assembly.json', import.meta.url);
const BIN_URL = new URL('../../assets/charger-explorer/assembly.bin', import.meta.url);
const FONT_FACES = ['500 32px "Space Grotesk"', '400 12px "IBM Plex Mono"'];
const SESSION_KEY = 'vx-booted';
const FAST_HOLD_MS = 400;        // repeat visit and reduced motion: one line, then unmask
const GOVERNOR_FRAMES = 20;      // frames the governor step waits for
const GOVERNOR_WAIT_MS = 600;    // or this long, whichever comes first
const LINE_REVEAL_MS = 240;      // the site's --dur-2 for a log line
const READOUT_HZ = 10;           // plotter readout text writes per second
const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';

const STEPS = ['FONTS', 'MANIFEST', 'GEOMETRY', 'RENDERER', 'GOVERNOR', 'INSTRUMENTS'];

const fmtInt = (n) => Math.round(n).toLocaleString('en-US');
const fmtMs = (ms) => `${ms < 10 ? ms.toFixed(1) : Math.round(ms)} ms`;
/* T-00:00:01.200 */
export function formatClock(ms) {
  const sign = ms < 0 ? '+' : '-';
  const a = Math.abs(ms);
  const h = Math.floor(a / 3600000), m = Math.floor(a / 60000) % 60, s = Math.floor(a / 1000) % 60, f = Math.floor(a % 1000);
  const p = (v, w = 2) => String(v).padStart(w, '0');
  return `T${sign}${p(h)}:${p(m)}:${p(s)}.${p(f, 3)}`;
}
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function readVar(el, name, fallback) { try { const v = getComputedStyle(el).getPropertyValue(name).trim(); return v || fallback; } catch { return fallback; } }
function parseMs(v, fallback) { const m = /^([\d.]+)(ms|s)?$/.exec(v || ''); if (!m) return fallback; return Number(m[1]) * (m[2] === 's' ? 1000 : 1); }
function session(get, value) { try { if (get) return sessionStorage.getItem(SESSION_KEY); sessionStorage.setItem(SESSION_KEY, value); } catch {} return null; }

/* createBoot gives the lab a handle; runBoot is the page's one-call form. */
export function createBoot({ overlay, minMs = 1200, maxMs = 2600, autoUnmask = true, arm = null, penSpeed = 80, throttle = null, order = EXTERIOR_IDS, repeat = null } = {}) {
  if (!overlay) throw new Error('runBoot needs the #boot overlay element');
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const timings = [];
  const state = { startedAt: 0, phase: 'idle', skipped: false, unmasked: false, received: 0, total: 0, geometryDone: false, stepsDone: false, green: false, clock: 0 };
  let dom = null, plotter = null, raf = 0, offTier = null, destroyed = false, resolveRun = null, runPromise = null;
  const abort = typeof AbortController === 'function' ? new AbortController() : null;

  function mountDom() {
    overlay.replaceChildren();
    overlay.dataset.state = 'counting';
    const clock = el('div', 'bt-clock'); clock.setAttribute('aria-hidden', 'true');
    const clockKey = el('span', 'bt-clock-key', 'T minus');
    const clockValue = el('span', 'bt-clock-value', formatClock(minMs));
    const clockState = el('span', 'bt-clock-state', 'counting');
    clock.append(clockKey, clockValue, clockState);
    const log = el('ol', 'bt-log'); log.setAttribute('aria-label', 'Boot log');
    const bar = el('div', 'bt-bar'); bar.setAttribute('aria-hidden', 'true');
    const barHead = el('div', 'bt-bar-head');
    barHead.append(el('span', null, 'assembly.bin'), el('span', 'bt-bar-pct', '0 %'));
    const track = el('div', 'bt-bar-track'); const fill = el('i', 'bt-bar-fill'); track.append(fill);
    const bytes = el('div', 'bt-bar-bytes', '0 / 0 B');
    bar.append(barHead, track, bytes);
    const plot = el('div', 'bt-plot');
    const plotHead = el('div', 'bt-plot-head');
    const hint = el('span', 'bt-hint', 'skip: any key or tap');
    plotHead.append(el('span', null, 'CHARGER / front view / wire data'), hint);
    const stage = el('div', 'bt-plot-stage');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'bt-svg');
    stage.append(svg);
    const readout = el('dl', 'bt-plot-readout');
    const cell = (k) => { const dt = el('dt', null, k); const dd = el('dd', null, '0'); readout.append(dt, dd); return dd; };
    const rSeg = cell('segments'), rTravel = cell('pen travel'), rUp = cell('pen up'), rPen = cell('pen xy');
    plot.append(plotHead, stage, readout);
    overlay.append(clock, log, bar, plot);
    dom = { clock, clockValue, clockState, log, bar, fill, bytes, pct: barHead.lastChild, plot, svg, readout, rSeg, rTravel, rUp, rPen, hint };
  }

  /* One <li> per step; created when the step starts, filled when it resolves. */
  function row(index, label) {
    if (!dom) return null;
    const li = el('li', 'bt-line'); li.dataset.pending = 'true';
    const idx = el('span', 'bt-line-idx', index == null ? '' : String(index).padStart(2, '0'));
    const lab = el('span', 'bt-line-label', label);
    const res = el('span', 'bt-line-result', '');
    const ms = el('span', 'bt-line-ms', '');
    li.append(idx, lab, res, ms);
    dom.log.appendChild(li);
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
  /* Run one named step: marks, measures, prints and emits. */
  async function step(index, label, fn, pre) {
    const name = `boot:${String(index).padStart(2, '0')}-${label}`;
    performance.mark(`${name}:start`);
    const t0 = performance.now();
    const r = row(index, label);
    if (pre) pre(r);
    let result, warn = false;
    try { result = await fn(r); }
    catch (err) { result = `FAILED / ${String(err && err.message || err).toUpperCase()}`; warn = true; }
    const ms = performance.now() - t0;
    performance.mark(`${name}:end`);
    try { performance.measure(name, `${name}:start`, `${name}:end`); } catch {}
    fill(r, result, ms, { warn });
    timings.push({ label, ms });
    bus.emit('boot:line', { index, label, result, ms });
    return result;
  }
  function line(label, result, ms, opts) {
    startClock();
    const r = row(null, label);
    fill(r, result, ms, opts);
    timings.push({ label, ms: ms || 0 });
    bus.emit('boot:line', { index: null, label, result, ms: ms || 0 });
  }

  /* ---- loads: manifest then the streamed bin; these run regardless of the visual ---- */
  let manifestPromise = null, geometryPromise = null, json = null;
  function startLoads() {
    manifestPromise = fetch(JSON_URL, { signal: abort?.signal }).then((res) => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); }).then((j) => (json = j));
    geometryPromise = manifestPromise.then((j) => streamGeometry(j));
    geometryPromise.catch(() => {});
    return { manifestPromise, geometryPromise };
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
      state.received = received;
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
          if (throttle?.delayMs > 0) await sleep(throttle.delayMs);
        }
      }
    } else {
      take(new Uint8Array(await res.arrayBuffer()));
    }
    if (received !== buffer.byteLength) buffer = buffer.slice(0, received);
    state.geometryDone = true;
    return { json: j, buffer, received, total };
  }

  /* ---- the clock, the bar and the plotter readout: one rAF while the overlay is up ---- */
  let readoutAt = 0, lastReceived = -1;
  function tick(now) {
    raf = 0;
    if (!dom || state.unmasked || destroyed) return;
    const elapsed = now - state.startedAt;
    const remaining = minMs - elapsed;
    if (remaining > 0) { state.clock = remaining; dom.clockValue.textContent = formatClock(remaining); }
    else {
      state.clock = 0;
      dom.clockValue.textContent = formatClock(0);
      // a built-in hold: the count sits at zero until the steps and the geometry are in, or maxMs releases it
      if ((!state.stepsDone || !state.geometryDone) && overlay.dataset.state === 'counting') { overlay.dataset.state = 'hold'; dom.clockState.textContent = state.stepsDone ? 'hold / geometry' : 'hold'; }
    }
    if (state.received !== lastReceived) {
      lastReceived = state.received;
      const frac = state.total ? Math.min(1, state.received / state.total) : 0;
      dom.fill.style.transform = `scaleX(${frac.toFixed(4)})`;
      dom.pct.textContent = `${Math.floor(frac * 100)} %`;
      dom.bytes.textContent = `${fmtInt(state.received)} / ${fmtInt(state.total)} B`;
    }
    // once the range is green and the pen has parked there is nothing left to animate
    const settled = state.stepsDone && state.geometryDone && (!plotter || plotter.stats.done) && overlay.dataset.state !== 'hold';
    if (plotter && (settled || now - readoutAt > 1000 / READOUT_HZ)) {
      readoutAt = now;
      const s = plotter.stats;
      dom.rSeg.textContent = fmtInt(s.segments);
      dom.rTravel.textContent = `${s.travel.toFixed(2)} m`;
      dom.rUp.textContent = `${s.travelUp.toFixed(2)} m`;
      dom.rPen.textContent = s.busy ? `${(s.pen[0] / 1000).toFixed(3)} / ${(-s.pen[1] / 1000).toFixed(3)} m` : s.done ? `parked / ${s.arrived} parts` : `up / ${s.arrived} of ${s.parts} parts`;
      dom.rTravel.textContent = s.busy ? `${s.drawn.toFixed(2)} of ${s.travel.toFixed(2)} m` : `${s.travel.toFixed(2)} m`;
    }
    if (settled && remaining <= 0) return;
    raf = requestAnimationFrame(tick);
  }
  function startClock() { if (!raf) raf = requestAnimationFrame(tick); }
  function stopClock() { if (raf) cancelAnimationFrame(raf); raf = 0; }

  /* ---- skip ---- */
  const isControl = (t) => t && /^(input|select|textarea|button|a)$/i.test(t.tagName);
  function onKey(e) { if (isControl(e.target) || e.metaKey || e.ctrlKey || e.altKey) return; skip(); }
  function onPointer(e) { if (isControl(e.target)) return; skip(); }
  function listen() { document.addEventListener('keydown', onKey); overlay.addEventListener('pointerdown', onPointer); }
  function unlisten() { document.removeEventListener('keydown', onKey); overlay.removeEventListener('pointerdown', onPointer); }
  function skip() {
    if (state.unmasked || destroyed) return;
    if (!state.green) {                                   // after RANGE IS GREEN a key only releases a held overlay
      state.skipped = true;
      if (dom) line('skipped', `at ${formatClock(state.clock)}`, null);
    }
    unmask();
  }

  /* ---- unmask: finish the drawing, wipe with clip-path, remove ---- */
  let unmaskPromise = null;
  function unmask() {
    if (unmaskPromise) return unmaskPromise;
    state.unmasked = true;
    overlay.dataset.state = 'go';
    if (dom) { dom.clockState.textContent = 'go'; dom.clockValue.textContent = formatClock(0); }
    unlisten(); stopClock(); offTier?.(); offTier = null;
    plotter?.finish();
    session(false, '1');
    bus.emit('boot:done', { timings: timings.slice(), skipped: state.skipped });
    const dur = reducedMotion ? 1 : parseMs(readVar(overlay, '--dur-3', '480ms'), 480);
    const ease = readVar(overlay, '--ease-out', EASE_OUT);
    unmaskPromise = (async () => {
      try {
        const anim = overlay.animate([{ clipPath: 'inset(0 0 0 0)' }, { clipPath: 'inset(0 0 100% 0)' }], { duration: dur, easing: ease, fill: 'forwards' });
        await anim.finished;
      } catch {}
      plotter?.destroy(); plotter = null;
      overlay.remove();
    })();
    return unmaskPromise;
  }

  const reducedMotion = governor.tier === 0;

  async function run() {
    if (runPromise) return runPromise;
    runPromise = new Promise((r) => (resolveRun = r));
    state.startedAt = performance.now(); state.phase = 'running';
    performance.mark('boot:start');
    const again = repeat ?? session(true) === '1';
    const fast = reducedMotion || again;
    mountDom();
    listen();
    startLoads();
    if (fast) {
      overlay.classList.add('bt-fast');
      state.stepsDone = true; state.green = true;
      line(reducedMotion ? 'ready' : 'range is green', reducedMotion ? 'reduced motion' : 'repeat visit / session', null, { final: true });
      await sleep(FAST_HOLD_MS);
      if (autoUnmask) unmask();
    } else {
      startClock();
      await step(0, STEPS[0], async () => {
        if (!document.fonts || !document.fonts.load) return 'skipped';
        const sets = await Promise.all(FONT_FACES.map((f) => document.fonts.load(f).catch(() => [])));
        const n = sets.filter((s) => s && s.length).length;
        return `${n} / ${FONT_FACES.length} faces`;
      });
      await step(1, STEPS[1], async () => {
        const j = await manifestPromise;
        const visible = j.parts.filter((p) => !p.referenceOnly).length;
        plotter = createPlotter(dom.svg, { json: j, order, speed: penSpeed, tier: governor.tier });
        offTier = governor.subscribe(({ tier }) => plotter?.setTier(tier));
        return `${j.parts.length} parts / ${visible} visible`;
      });
      // 02 streams while 03..05 run; its row fills when the last byte lands
      const geometryStep = step(2, STEPS[2], async (r) => {
        const g = await geometryPromise;
        const ok = g.received === g.total;
        if (!ok && r) fill(r, '', null, { warn: true });
        return ok ? `${fmtInt(g.received)} B` : `length mismatch ${fmtInt(g.received)} / ${fmtInt(g.total)} B`;
      }, (r) => { if (r) r.res.textContent = 'streaming'; });
      geometryStep.catch(() => {});
      await step(3, STEPS[3], async () => {
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
        const t = setTimeout(done, GOVERNOR_WAIT_MS);
        const off = bus.on('governor:stats', (s) => { if (s.frames >= GOVERNOR_FRAMES) done(); });
        function done() { clearTimeout(t); off(); const s = governor.stats; res(s.frames ? `${s.frames} frames / p50 ${s.p50Ms.toFixed(1)} ms / T${governor.tier}` : `T${governor.tier} / no sample`); }
      }));
      await step(5, STEPS[5], async () => { if (typeof arm === 'function') await arm(); else await nextFrame(); return 'armed'; });
      state.stepsDone = true;
      // the range goes green when the geometry lands, but no later than maxMs and no sooner than minMs
      const deadline = Math.max(0, maxMs - (performance.now() - state.startedAt));
      await Promise.race([geometryPromise.catch(() => {}), sleep(deadline)]);
      const hold = Math.max(0, minMs - (performance.now() - state.startedAt));
      if (hold) await sleep(hold);
      if (!state.unmasked) {
        const total = performance.now() - state.startedAt;
        performance.mark('boot:green');
        try { performance.measure('boot:total', 'boot:start', 'boot:green'); } catch {}
        overlay.dataset.state = 'green'; state.green = true;
        if (dom) dom.clockState.textContent = state.geometryDone ? 'range green' : 'range green / geometry in flight';
        line('range is green', state.geometryDone ? formatClock(-total) : `geometry in flight / ${fmtInt(state.received)} B`, total, { final: true });
        if (autoUnmask) unmask();
      }
    }
    let geometry = null;
    try { const g = await geometryPromise; geometry = { json: g.json, buffer: g.buffer }; bus.emit('assets:geometry', geometry); }
    catch (err) { if (fast && dom && !state.unmasked) line('geometry', `failed / ${String(err && err.message || err).toUpperCase()}`, null, { warn: true }); }   // the 02 row already printed it otherwise
    state.phase = 'done';
    const result = { geometry, timings: timings.slice(), skipped: state.skipped };
    resolveRun(result);
    return result;
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    unlisten(); stopClock(); offTier?.(); offTier = null;
    try { abort?.abort(); } catch {}
    plotter?.destroy(); plotter = null;
    overlay.remove();
    if (resolveRun && state.phase !== 'done') { state.phase = 'done'; resolveRun({ geometry: null, timings: timings.slice(), skipped: state.skipped }); }
  }

  return { run, skip, unmask, destroy, state, timings, get plotter() { return plotter; } };
}

export function runBoot(options) { return createBoot(options).run(); }
export default runBoot;
