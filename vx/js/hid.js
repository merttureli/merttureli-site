/* hid.js — a Gamepad API bench.
   Reads the first connected HID game controller through navigator.getGamepads()
   and shows axes 0..2 on three canvas gauges (RUDDER centred −1..1, L BRAKE and
   R BRAKE 0..1), the measured report rate, and the device id. His rudder pedals
   enumerate as a standard HID gamepad because he wrote the firmware, so plugging
   them in makes this page read his own hardware.

   Discipline:
   - polling runs on requestAnimationFrame only while the root is on screen
     (IntersectionObserver), the tab is visible and a device is connected;
   - getGamepads() is read every frame (it is a snapshot in Chrome), the canvases
     are redrawn at the governor tier's rate (10 / 10 / 30 / 60 Hz for tiers 0..3);
   - the report rate is measured from gamepad.timestamp changes, so it can never
     read higher than the frame rate; when it is pinned to the frame rate the
     readout says so (RAF BOUND) instead of pretending it is the device's rate;
   - no smoothing anywhere: the needle is the value, the value is the device;
   - a non-finite axis value (NaN, Infinity) reads as "axis not reported";
   - every canvas is role=img with an aria-label refreshed at most once per
     second (a trailing refresh guarantees the last state is never missed); the
     numeric readouts are plain text, explicitly not live regions;
   - under forced colours the canvases draw in the forced text colour.
   Simulation (lab only): simulate([r, l, b]) draws the gauges from given values,
   labelled SIMULATED, and stops polling until simulate(null).

   Emits hid:state { connected, id, axes: [r, l, b], pollHz, simulated } at most
   every EMIT_MS while polling, and at once on every connection change. While
   simulating, connected is false and id is 'SIMULATED'. */
import { bus } from './core/bus.js';
import { governor } from './core/governor.js';

const ARC_DEG = 170;                              // sweep of every gauge, degrees
const ARC_HALF = (ARC_DEG / 2) * Math.PI / 180;   // radians either side of straight up
const ID_MAX = 48;                                // device id characters shown
const DRAW_HZ = [10, 10, 30, 60];                 // canvas redraw rate per governor tier 0..3
const EMIT_MS = 100;                              // hid:state at most 10 Hz while polling
const ARIA_MS = 1000;                             // aria-label refresh at most 1 Hz
const STALE_MS = 1000;                            // no new report for this long: POLL reads "--"
const RATE_WINDOW = 32;                           // report intervals averaged for the Hz readout
const RAF_BOUND_RATIO = 1.15;                     // mean report interval within 15 % of the frame interval: rate is frame bound
const FRAME_ALPHA = 0.1;                          // one-pole weight for the frame interval estimate (about 10 frames)
const MINUS = '−';                           // a real minus sign for negative readouts and tick labels

/* Gauge geometry as fractions of the canvas CSS width w (so every size is the
   same drawing). The canvas keeps a 25:16 aspect (h = 0.64 w) from the CSS. */
const R_FRAC = 0.36;         // arc radius
const CY_PAD = 0.20;         // centre y = r + CY_PAD w; leaves room for the outer tick labels above the arc
const TICK_MAJOR = 0.045;    // major tick length (5 majors at 0, 1/4, 1/2, 3/4, 1 of the sweep)
const TICK_MINOR = 0.025;    // minor tick length (every 1/20 of the sweep)
const LABEL_R = 0.115;       // tick label radius beyond the arc
const BAND_PX = 3;           // commanded band width in CSS px
const NEEDLE_PX = 2;         // needle width in CSS px
const NEEDLE_TIP = 0.90;     // needle length as a fraction of r
const NEEDLE_TAIL = 0.12;    // counterweight length behind the hub as a fraction of r
const HUB_PX = 4;            // hub radius in CSS px
const TICK_GAP_PX = 2;       // gap between the band and the ticks in CSS px

const GAUGES = [
  { key: 'rudder', label: 'Rudder', axis: 0, centred: true, ticks: [MINUS + '1', MINUS + '.5', '0', '.5', '1'] },
  { key: 'lbrake', label: 'L brake', axis: 1, centred: false, ticks: ['0', '.25', '.5', '.75', '1'] },
  { key: 'rbrake', label: 'R brake', axis: 2, centred: false, ticks: ['0', '.25', '.5', '.75', '1'] },
];

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
/* Brake axes arrive as −1..1 (−1 at rest on most pedal sets); the gauge wants 0..1. */
const toUnit = (v) => clamp((v + 1) / 2, 0, 1);
/* Position of a value along the sweep, 0 at the start of the arc, 1 at its end. */
const fractionOf = (g, v) => (g.centred ? (clamp(v, -1, 1) + 1) / 2 : clamp(v, 0, 1));
/* Where the commanded band starts: the centre for a centred gauge, the start otherwise. */
const zeroOf = (g) => (g.centred ? 0.5 : 0);
const angleAt = (f) => -Math.PI / 2 - ARC_HALF + f * 2 * ARC_HALF;   // canvas angle (0 = +x, clockwise) for a sweep fraction

function readPads() {
  try { return navigator.getGamepads ? Array.from(navigator.getGamepads()) : []; } catch { return []; }
}
function formatValue(g, v) {
  if (v === null || !Number.isFinite(v)) return '--';
  if (g.centred) return Math.abs(v) < 0.005 ? '0.00' : (v < 0 ? MINUS : '+') + Math.abs(v).toFixed(2);
  return v.toFixed(2);
}
/* A reported axis value, or null when the device sent nothing usable (missing, NaN, Infinity). */
const finiteAt = (arr, i) => (i < arr.length && typeof arr[i] === 'number' && Number.isFinite(arr[i]) ? arr[i] : null);

export function mountHid(root) {
  const apiOk = typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function';
  root.classList.add('hid');
  const addedRole = !root.hasAttribute('role'), addedLabel = !root.hasAttribute('aria-label');
  if (addedRole) root.setAttribute('role', 'group');
  if (addedLabel) root.setAttribute('aria-label', 'HID bench');
  root.innerHTML = `
    <div class="hid-head">
      <span class="hid-eyebrow">HID bench / Gamepad API</span>
      <span class="hid-chip" data-role="chip">No device</span>
    </div>
    <div class="hid-stage">
      <div class="hid-gauges">${GAUGES.map((g) => `
        <figure class="hid-gauge" data-gauge="${g.key}">
          <canvas role="img" aria-label="${g.label} gauge, no device"></canvas>
          <figcaption class="hid-gauge-row"><span class="hid-gauge-label">${g.label}</span><output class="hid-value" aria-live="off">${formatValue(g, 0)}</output></figcaption>
        </figure>`).join('')}
      </div>
      <div class="hid-flag" data-role="flag"><div class="hid-flag-box"><b data-role="flag-title">No HID device</b><span data-role="flag-text">Connect a controller and press a button</span></div></div>
    </div>
    <dl class="hid-meta">
      <div><dt>Device</dt><dd data-role="id">--</dd></div>
      <div><dt>Axes</dt><dd data-role="axes">--</dd></div>
      <div><dt>Buttons</dt><dd data-role="buttons">--</dd></div>
      <div><dt>Poll</dt><dd><span data-role="hz">--</span> <span class="hid-note" data-role="note"></span></dd></div>
    </dl>
    <p class="hid-src">SRC: Gamepad API / your device / brakes read (axis + 1) / 2 / nothing leaves the browser</p>`;

  const el = {
    chip: root.querySelector('[data-role="chip"]'),
    flag: root.querySelector('[data-role="flag"]'),
    flagTitle: root.querySelector('[data-role="flag-title"]'),
    flagText: root.querySelector('[data-role="flag-text"]'),
    id: root.querySelector('[data-role="id"]'),
    axes: root.querySelector('[data-role="axes"]'),
    buttons: root.querySelector('[data-role="buttons"]'),
    hz: root.querySelector('[data-role="hz"]'),
    note: root.querySelector('[data-role="note"]'),
  };
  const gauges = GAUGES.map((g) => {
    const fig = root.querySelector(`[data-gauge="${g.key}"]`);
    const canvas = fig.querySelector('canvas');
    return { ...g, fig, canvas, ctx: canvas.getContext('2d'), out: fig.querySelector('output'), w: 0, h: 0, text: '', value: null, aria: '' };
  });

  /* Live state; the lab readout reads it through bench.state. */
  const state = {
    connected: false, id: '', index: null, axisCount: 0, buttonCount: 0, pressed: 0,
    raw: [],                        // the device's axes array as reported
    axes: [0, 0, 0],                // [rudder −1..1, l brake 0..1, r brake 0..1] (null entries when an axis is missing)
    pollHz: 0, reportMs: 0, rafBound: false, stale: false,
    frameMs: 16.7, visible: true, polling: false, simulated: false, tier: governor.tier, drawHz: 60,
    emits: 0, reports: 0,
  };
  let colors = {};
  let dpr = 1;
  let raf = 0;                      // the poll loop's frame handle
  let simRaf = 0;                   // one pending on-demand draw while simulating
  let simAxes = null;               // [r, l, b] while simulating, else null
  let lastTs = null, lastTsAt = 0, lastSig = '', lastFrame = 0, lastDraw = 0, lastEmit = 0, lastAria = -ARIA_MS;
  let ariaTimer = 0;                // trailing aria-label refresh when a draw lands inside the 1 Hz window
  const intervals = new Float32Array(RATE_WINDOW);
  let intervalHead = 0, intervalCount = 0;
  let destroyed = false;
  const forcedMq = typeof matchMedia === 'function' ? matchMedia('(forced-colors: active)') : null;

  function readColors() {
    const cs = getComputedStyle(root);
    const get = (name, fallback) => cs.getPropertyValue(name).trim() || fallback;
    const font = get('--font-mono', 'monospace');
    if (forcedMq?.matches) {
      /* Forced colours override the tokens on the page but not inside a canvas:
         draw everything in the forced text colour so the gauges stay visible. */
      const text = cs.color || '#000';
      colors = { ink: text, muted: text, meta: text, line: cs.borderTopColor || text, live: text, font };
      return;
    }
    colors = {
      ink: get('--text-display', '#0A0A0A'),
      muted: get('--text-muted', '#6B6B6B'),    // tick labels carry information: 70 % paper on ink, ink-500 on paper
      meta: get('--text-meta', '#8C8C8C'),      // minor ticks and the resting needle
      line: get('--line-hairline', 'rgba(10,10,10,.12)'),
      live: get('--livery', '#D63B08'),
      font,
    };
  }
  function resize() {
    const d = governor.dpr();
    dpr = Number.isFinite(d) && d > 0 ? d : 1;
    for (const g of gauges) {
      const r = g.canvas.getBoundingClientRect();
      g.w = Math.max(1, r.width);      // CSS px, unrounded: the backing store is the exact DPR multiple
      g.h = Math.max(1, r.height);
      const bw = Math.max(1, Math.round(g.w * dpr)), bh = Math.max(1, Math.round(g.h * dpr));
      if (g.canvas.width !== bw || g.canvas.height !== bh) { g.canvas.width = bw; g.canvas.height = bh; }
    }
  }

  /* One gauge. `value` is in gauge units (null when the axis is missing);
     `active` draws the needle and band in the livery colour. */
  function drawGauge(g, value, active) {
    const { ctx, w, h } = g;
    if (!ctx || !w) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const r = w * R_FRAC, cx = w / 2, cy = r + w * CY_PAD;
    const a0 = angleAt(0), a1 = angleAt(1);
    const f = fractionOf(g, value ?? 0);   // a missing axis rests at zero
    const fz = zeroOf(g);

    // baseline arc
    ctx.lineWidth = 1; ctx.strokeStyle = colors.line; ctx.lineCap = 'butt';
    ctx.beginPath(); ctx.arc(cx, cy, r, a0, a1); ctx.stroke();
    // commanded band from the zero point to the value
    if (active && Math.abs(f - fz) > 1e-4) {
      ctx.lineWidth = BAND_PX; ctx.strokeStyle = colors.live;
      ctx.beginPath(); ctx.arc(cx, cy, r, angleAt(Math.min(f, fz)), angleAt(Math.max(f, fz))); ctx.stroke();
    }
    // ticks: 21 positions, every fifth a major with a label
    const major = w * TICK_MAJOR, minor = w * TICK_MINOR, inner = r + TICK_GAP_PX;
    ctx.lineWidth = 1;
    for (let i = 0; i <= 20; i++) {
      const isMajor = i % 5 === 0;
      const a = angleAt(i / 20), ca = Math.cos(a), sa = Math.sin(a);
      const len = isMajor ? major : minor;
      ctx.strokeStyle = isMajor ? colors.ink : colors.meta;
      ctx.beginPath(); ctx.moveTo(cx + ca * inner, cy + sa * inner); ctx.lineTo(cx + ca * (inner + len), cy + sa * (inner + len)); ctx.stroke();
    }
    const px = clamp(Math.round(w * 0.046), 8, 10);   // tick label size: 9 px at a 200 px gauge
    ctx.font = `400 ${px}px ${colors.font}`; ctx.fillStyle = colors.muted; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const lr = r + w * LABEL_R;
    g.ticks.forEach((t, k) => {
      const a = angleAt(k / 4);
      const tw = ctx.measureText(t).width;
      const x = clamp(cx + Math.cos(a) * lr, tw / 2 + 1, w - tw / 2 - 1);   // keep the outermost labels inside the canvas
      ctx.fillText(t, x, cy + Math.sin(a) * lr);
    });
    // needle and hub
    const av = angleAt(f), ca = Math.cos(av), sa = Math.sin(av);
    ctx.lineWidth = NEEDLE_PX; ctx.lineCap = 'round'; ctx.strokeStyle = active ? colors.live : colors.meta;
    ctx.beginPath(); ctx.moveTo(cx - ca * r * NEEDLE_TAIL, cy - sa * r * NEEDLE_TAIL); ctx.lineTo(cx + ca * r * NEEDLE_TIP, cy + sa * r * NEEDLE_TIP); ctx.stroke();
    ctx.fillStyle = active ? colors.ink : colors.meta;
    ctx.beginPath(); ctx.arc(cx, cy, HUB_PX, 0, Math.PI * 2); ctx.fill();
  }
  /* The canvases' aria-labels: at most once per second, and always once more
     after the last draw so a final state (disconnect, simulate) is never missed. */
  function updateAria(now) {
    lastAria = now;
    if (ariaTimer) { clearTimeout(ariaTimer); ariaTimer = 0; }
    const active = state.connected || state.simulated;
    gauges.forEach((g, i) => {
      const label = `${g.label} gauge, ${!active ? 'no device' : state.axes[i] === null ? 'axis not reported' : formatValue(g, state.axes[i])}${state.simulated ? ', simulated' : ''}`;
      if (label !== g.aria) { g.aria = label; g.canvas.setAttribute('aria-label', label); }
    });
  }
  function drawAll(now = performance.now()) {
    const active = state.connected || state.simulated;
    gauges.forEach((g, i) => {
      const v = state.axes[i];
      drawGauge(g, v, active && v !== null);
      const text = formatValue(g, v);
      if (text !== g.text) { g.text = text; g.out.value = text; }
    });
    const wait = ARIA_MS - (now - lastAria);
    if (wait <= 0) updateAria(now);
    else if (!ariaTimer) ariaTimer = setTimeout(() => { ariaTimer = 0; if (!destroyed) updateAria(performance.now()); }, wait);
    lastDraw = now;
  }

  function setMode(mode) {
    root.dataset.hid = mode;        // idle | live | simulated | unavailable
    const live = mode === 'live';
    el.chip.textContent = mode === 'live' ? 'Live' : mode === 'simulated' ? 'Simulated' : mode === 'unavailable' ? 'No API' : 'No device';
    el.flag.hidden = live || mode === 'simulated';
    if (mode === 'unavailable') { el.flagTitle.textContent = 'No Gamepad API'; el.flagText.textContent = 'This browser does not expose HID devices to pages'; }
    else { el.flagTitle.textContent = 'No HID device'; el.flagText.textContent = 'Connect a controller and press a button'; }
  }
  function setMeta() {
    if (state.simulated) {
      el.id.textContent = 'Simulated / lab sliders'; el.id.title = '';
      el.axes.textContent = '3'; el.buttons.textContent = '--';
      el.hz.textContent = '--'; el.note.textContent = 'not polled';
      return;
    }
    if (!state.connected) {
      el.id.textContent = '--'; el.id.title = ''; el.axes.textContent = '--'; el.buttons.textContent = '--';
      el.hz.textContent = '--'; el.note.textContent = '';
      return;
    }
    const shown = state.id.length > ID_MAX ? state.id.slice(0, ID_MAX - 1) + '…' : state.id;
    if (el.id.textContent !== shown) { el.id.textContent = shown; el.id.title = state.id; }
    el.axes.textContent = String(state.axisCount);
    const b = state.pressed ? `${state.buttonCount} / ${state.pressed} down` : String(state.buttonCount);
    if (el.buttons.textContent !== b) el.buttons.textContent = b;
    const hz = state.stale || !state.pollHz ? '--' : `${state.pollHz.toFixed(1)} Hz`;
    if (el.hz.textContent !== hz) el.hz.textContent = hz;
    const note = state.stale ? 'no new reports' : state.rafBound ? 'raf bound' : '';
    if (el.note.textContent !== note) el.note.textContent = note;
  }
  function emit() {
    state.emits++;
    const sim = state.simulated;    // while simulating the bus never claims the real device
    bus.emit('hid:state', { connected: state.connected && !sim, id: sim ? 'SIMULATED' : state.connected ? state.id : '', axes: state.axes.slice(), pollHz: sim || state.stale ? 0 : state.pollHz, simulated: sim });
  }

  /* Report rate from gamepad.timestamp changes. */
  function resetRate() { intervalHead = intervalCount = 0; lastTs = null; lastTsAt = 0; state.pollHz = 0; state.reportMs = 0; state.rafBound = false; state.stale = false; state.reports = 0; }
  function noteTimestamp(ts, now) {
    if (ts === lastTs) return;
    if (lastTs !== null) {
      const d = ts - lastTs;             // ms between the two reports we observed (DOMHighResTimeStamp)
      if (d > 0 && d < STALE_MS) { intervals[intervalHead] = d; intervalHead = (intervalHead + 1) % RATE_WINDOW; intervalCount = Math.min(RATE_WINDOW, intervalCount + 1); }
    }
    lastTs = ts; lastTsAt = now; state.reports++;
    if (intervalCount) {
      let sum = 0; for (let i = 0; i < intervalCount; i++) sum += intervals[i];
      state.reportMs = sum / intervalCount;
      state.pollHz = 1000 / state.reportMs;
      state.rafBound = state.reportMs <= state.frameMs * RAF_BOUND_RATIO;
    }
  }

  /* The device we follow, else the first connected one. Pure: connect() owns state.index. */
  function pickPad() {
    const list = readPads();
    const usable = (p) => p && p.connected !== false;
    if (state.index !== null && usable(list[state.index])) return list[state.index];
    return list.find(usable) || null;
  }
  function connect(pad) {
    state.connected = true; state.index = pad.index; state.id = String(pad.id || 'unknown device');
    state.axisCount = (pad.axes || []).length; state.buttonCount = (pad.buttons || []).length; state.pressed = 0; lastSig = '';
    resetRate();
    if (!state.simulated) { setMode('live'); setMeta(); drawAll(); emit(); }
    schedule();
  }
  function disconnect() {
    state.connected = false; state.index = null; state.id = ''; state.axisCount = state.buttonCount = state.pressed = 0;
    state.raw = []; state.axes = [0, 0, 0];
    resetRate();
    stopLoop();
    if (!state.simulated) { setMode(apiOk ? 'idle' : 'unavailable'); setMeta(); drawAll(); emit(); }
  }

  /* The poll loop. */
  function shouldPoll() { return !destroyed && apiOk && state.connected && state.visible && !state.simulated && !document.hidden; }
  function schedule() { if (!raf && shouldPoll()) { lastFrame = 0; raf = requestAnimationFrame(tick); state.polling = true; } }
  function stopLoop() { if (raf) cancelAnimationFrame(raf); raf = 0; state.polling = false; }
  function tick(now) {
    raf = 0;
    if (!shouldPoll()) { state.polling = false; return; }
    raf = requestAnimationFrame(tick);
    if (lastFrame) { const dt = now - lastFrame; if (dt < 250) state.frameMs += FRAME_ALPHA * (dt - state.frameMs); }
    lastFrame = now;
    const pad = pickPad();
    if (!pad) { disconnect(); return; }
    if (pad.index !== state.index) { connect(pad); return; }   // our device vanished without an event; follow the next one
    const a = pad.axes || [], buttons = pad.buttons || [];
    let pressed = 0; for (const b of buttons) if (b && b.pressed) pressed++;
    const ts = pad.timestamp;
    if (typeof ts === 'number' && Number.isFinite(ts) && ts > 0) noteTimestamp(ts, now);
    else {
      /* No usable timestamp from this browser: a changed report is the only evidence of a report. */
      const sig = a.join(',') + '/' + pressed;
      if (sig !== lastSig) noteTimestamp(now, now);
      lastSig = sig;
    }
    state.stale = lastTsAt > 0 && now - lastTsAt > STALE_MS;
    state.raw = Array.from(a);
    const r = finiteAt(a, 0), l = finiteAt(a, 1), b = finiteAt(a, 2);
    state.axes[0] = r === null ? null : clamp(r, -1, 1);
    state.axes[1] = l === null ? null : toUnit(l);
    state.axes[2] = b === null ? null : toUnit(b);
    state.pressed = pressed; state.axisCount = a.length; state.buttonCount = buttons.length;
    const interval = state.drawHz >= 60 ? 0 : 1000 / state.drawHz;
    if (now - lastDraw >= interval - 1) { drawAll(now); setMeta(); }
    if (now - lastEmit >= EMIT_MS) { lastEmit = now; emit(); }
  }

  /* Simulation entry point for the lab. */
  function simulate(axes) {
    if (destroyed) return;
    if (axes) {
      simAxes = [clamp(+axes[0] || 0, -1, 1), clamp(+axes[1] || 0, 0, 1), clamp(+axes[2] || 0, 0, 1)];
      const first = !state.simulated;
      state.simulated = true;
      state.axes = simAxes.slice(); state.raw = simAxes.slice();
      stopLoop();
      if (first) { setMode('simulated'); setMeta(); }
      if (!simRaf) simRaf = requestAnimationFrame((now) => { simRaf = 0; if (!destroyed && state.simulated) { drawAll(now); emit(); } });
    } else if (state.simulated) {
      state.simulated = false; simAxes = null;
      if (simRaf) { cancelAnimationFrame(simRaf); simRaf = 0; }
      state.axes = [0, 0, 0]; state.raw = [];
      const pad = state.connected ? pickPad() : null;
      if (pad) connect(pad); else disconnect();
    }
  }

  // listeners
  const onConnect = (e) => { if (!state.connected || e.gamepad.index === state.index) connect(e.gamepad); };   // a second device is ignored while the first is live
  const onDisconnect = (e) => {
    if (e.gamepad.index !== state.index) return;
    state.index = null;
    const other = pickPad();
    if (other) connect(other); else disconnect();
  };
  const onVisibility = () => { if (document.hidden) stopLoop(); else schedule(); };
  const onForced = () => { if (!destroyed) { readColors(); drawAll(); } };
  if (apiOk) {
    addEventListener('gamepadconnected', onConnect);
    addEventListener('gamepaddisconnected', onDisconnect);
  }
  document.addEventListener('visibilitychange', onVisibility);
  forcedMq?.addEventListener?.('change', onForced);
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
    state.visible = entries[entries.length - 1].isIntersecting;
    if (state.visible) schedule(); else stopLoop();
  }) : null;
  io?.observe(root);
  const ro = 'ResizeObserver' in window ? new ResizeObserver(() => { readColors(); resize(); drawAll(); }) : null;
  ro?.observe(root);
  readColors(); resize();
  const offTier = governor.subscribe(({ tier }) => {   // replays the current tier at once
    state.tier = tier; state.drawHz = DRAW_HZ[tier] ?? 60;
    resize(); drawAll();
  });

  // first paint
  const already = apiOk ? pickPad() : null;
  if (already) connect(already); else { setMode(apiOk ? 'idle' : 'unavailable'); setMeta(); drawAll(); emit(); }
  if (document.fonts?.load) document.fonts.load(`400 10px ${colors.font}`).then(() => { if (!destroyed) drawAll(); }).catch(() => {});

  return {
    simulate,
    refresh() { readColors(); resize(); drawAll(); },
    get state() { return state; },
    destroy() {
      destroyed = true;
      stopLoop();
      if (simRaf) cancelAnimationFrame(simRaf);
      if (ariaTimer) { clearTimeout(ariaTimer); ariaTimer = 0; }
      io?.disconnect(); ro?.disconnect(); offTier();
      if (apiOk) { removeEventListener('gamepadconnected', onConnect); removeEventListener('gamepaddisconnected', onDisconnect); }
      document.removeEventListener('visibilitychange', onVisibility);
      forcedMq?.removeEventListener?.('change', onForced);
      root.innerHTML = '';
      root.classList.remove('hid');
      delete root.dataset.hid;
      if (addedRole) root.removeAttribute('role');
      if (addedLabel) root.removeAttribute('aria-label');
    },
  };
}
export default mountHid;
