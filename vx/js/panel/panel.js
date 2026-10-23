/* panel.js: the instrument panel of the CHARGER field study (FIELD 7).

   mountPanel(root, { flight, lattice, scene, playback, ... }) -> panel

   DOM only, mono. root is the stage element (the box that holds the scene canvas);
   the panel adds a right rail (desktop, 320 px) or a bottom sheet (phone, under
   860 px) and a chart dock along the bottom of the stage. It reads flight.state,
   flight.derived, flight.events and flight.history every frame it draws, and
   lattice.force and lattice.stats when a lattice is attached. It never steps the
   flight: playback does.

   Every collaborator is duck-typed and optional except flight.state:
     flight   state {t, x, y, v, theta, alpha, q, qdyn, phase, N, M} (SI, rad),
              derived {xcp, xcg | xcg(t), staticMargin, cna, naturalFrequency(V),
              dampingRatio(V)}, events, history, config, and the setters
              setFinScale, setCg, setRail, setLaunchAngle, setWind, gust, flick,
              useLattice (FIELD 3)
     lattice  force {cn, cm, xcpCells, age_ms}, stats {grid, stepsPerSecond,
              precision, re}, fallback, setView
     scene    setView, setSliceView, setCamera, setMarkers, setFinScale, setRail,
              fallback (the 2D fallback view implements the subset it can)
     playback rate, setRate, launch, pause, reset, step, optional paused/resume
   Units: SI inside; display units per FIELD 1 (ft, ft/s, deg, lbf, lbf in,
   lbf/ft2, in, cal). Every readout carries a source tag; all live readouts are SIM.

   Bus: listens to flight:event, flight:reset, flight:config, lattice:stats and
   governor:tier; emits ui:view {view, section} and ui:camera {preset}. */
import { bus } from '../core/bus.js';
import { governor } from '../core/governor.js';
import { buildControls } from './controls.js';
import { createStripChart, createCpCgBar } from './chart.js';
import {
  DEG, M_PER_FT, M_PER_IN, N_PER_LBF, PA_PER_PSF, NM_PER_LBFIN, MPS_PER_MPH, DASH,
  fixed, timeCode, phaseLabel, readDerived, firstFinite, readHistory, readEvents, resolveOutline, createIdleLoop, readTheme,
} from './format.js';

const PHONE_MQ = '(max-width: 859.98px)';
const ANNOUNCE_MS = 1000;            // live region: at most one update per second (FIELD 2)
const ANNOUNCE_KEEP = 3;             // live region: the newest messages kept per update; older ones are dropped, not read late
const KEYS_MIN_VISIBLE = 0.5;        // keyboard shortcuts apply while at least half the stage (or half the viewport) shows the stage
const SUMMARY_MS = 1000;             // chart text summary: at most once per second
const TEXT_HZ = [10, 10, 30, 60];    // readout refresh by tier 0..3
const CHART_HZ = [10, 10, 30, 60];   // strip chart redraw by tier 0..3
const OWN_SAMPLE_S = 0.01;           // own trace sampling when flight.history is absent (matches FIELD 3's 0.01 s)
const OWN_KEEP_S = 12;               // seconds of own samples kept
const PAGE_CG_IN = 22;               // PAGE: CG 22 in from the nose (FIELD 1)
const EST_RAIL_IN = 72;              // EST: 6 ft rail default (FIELD 3)
const MAXAOA_MIN_V = 50 * 0.3048;    // m/s: max AOA counts ascent samples above 50 ft/s (EST); near apogee the airspeed goes to zero and alpha stops meaning a stability excursion
const EVENT_SAY = { railExit: 'Rail exit', burnout: 'Burnout', apogee: 'Apogee', liftoff: 'Liftoff', maxQ: 'Maximum dynamic pressure' };

const READOUTS = [
  ['flight', 'FLIGHT', [
    ['alt', 'ALTITUDE', 'FT'], ['vel', 'AIRSPEED', 'FT/S'], ['aoa', 'ANGLE OF ATTACK', 'DEG'],
    ['pitch', 'PITCH', 'DEG'], ['rate', 'PITCH RATE', 'DEG/S'], ['qdyn', 'DYNAMIC PRESSURE', 'LBF/FT²'],
  ]],
  ['stab', 'STABILITY', [
    ['margin', 'STATIC MARGIN', 'CAL'], ['cp', 'CP / BARROWMAN', 'IN'], ['cpl', 'CP / LATTICE 2D', 'IN'], ['cg', 'CG / LIVE', 'IN'],   // integrate:b pass: the lattice rows are 2D section values (FIELD copy rule)
    ['cna', 'CN ALPHA', '/RAD'], ['fn', 'PITCH FREQUENCY', 'HZ'], ['zeta', 'DAMPING RATIO', ''],
    ['normal', 'NORMAL FORCE', 'LBF'], ['moment', 'MOMENT / BARROWMAN', 'LBF IN'], ['cm', 'CM / LATTICE 2D', ''],   // integrate:b pass: as above
  ]],
  ['events', 'EVENTS', [
    ['railv', 'RAIL EXIT SPEED', 'FT/S'], ['maxaoa', 'MAX AOA / ASCENT', 'DEG'], ['apogee', 'APOGEE', 'FT'],
  ]],
];

let uid = 0;
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v; else if (k === 'text') el.textContent = v; else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const k of kids.flat()) if (k !== null && k !== undefined && k !== false) el.append(k);
  return el;
}
const call = (obj, fn, ...args) => { if (obj && typeof obj[fn] === 'function') { try { return obj[fn](...args); } catch (err) { console.error(`[panel] ${fn} failed`, err); } } return undefined; };
const has = (obj, fn) => !!(obj && typeof obj[fn] === 'function');

export function mountPanel(root, opts = {}) {
  if (!root) throw new Error('mountPanel needs a root element');
  let { flight, lattice = null, scene = null, playback = null, geometry = null, section = null, dock = null } = opts;
  const lab = opts.lab ?? /[?&]lab\b/.test(location.search);
  const level = Math.max(1, Math.min(5, opts.headingLevel || 2));   // the panel title level; sections are one below
  const selfLoop = opts.selfLoop !== false;
  const id = `pnl${++uid}`;
  const phoneMq = matchMedia(PHONE_MQ);
  const reducedMq = matchMedia('(prefers-reduced-motion: reduce)');
  const listeners = new Set();
  let destroyed = false;

  /* ------------------------------------------------------------ initial values */
  const cfg = () => (flight && flight.config) || {};
  const fromConfig = () => {
    const c = cfg();
    const pick = (...keys) => { for (const k of keys) if (typeof c[k] === 'number' && Number.isFinite(c[k])) return c[k]; return undefined; };
    const out = {};
    const fins = pick('finScale'); if (fins !== undefined) out.fins = fins;
    const cg = pick('cgFromNose', 'cg'); if (cg !== undefined) out.cg = cg / M_PER_IN;
    const rail = pick('railLength', 'rail'); if (rail !== undefined) out.rail = rail / M_PER_IN;
    const ang = pick('launchAngle', 'angle'); if (ang !== undefined) out.angle = ang * DEG;
    const wind = pick('wind', 'windSpeed'); if (wind !== undefined) out.wind = wind / MPS_PER_MPH;
    return out;
  };
  const controls = buildControls({
    lab, level: level + 1,
    defaults: Object.assign({ fins: 1, cg: PAGE_CG_IN, rail: EST_RAIL_IN, angle: 0, wind: 0, gust: 5 / MPS_PER_MPH, rate: playback && typeof playback.rate === 'number' ? playback.rate : 1 / 8, view: 'smoke', section: 'through', camera: 'side', markers: true }, fromConfig(), opts.defaults || {}),
    refs: { fins: 'CAD 1.00', cg: `PAGE ${PAGE_CG_IN.toFixed(1)}`, rail: `EST ${EST_RAIL_IN}`, angle: 'EST 0.0', wind: 'EST 0.0', gust: `EST ${(5 / MPS_PER_MPH).toFixed(1)}` },   // the tagged default beside each slider (vertical rail and still air are EST, FIELD 3; gust: the 5 m/s of the FIELD 3 test)
  });

  /* ------------------------------------------------------------ DOM */
  root.classList.add('pn-host');
  const readoutEls = new Map();
  const groups = READOUTS.map(([key, title, rows]) => h('section', { class: `pn-sec pn-sec-${key}`, 'aria-labelledby': `${id}-h-${key}` },
    h(`h${level + 1}`, { class: 'pn-h', id: `${id}-h-${key}` }, h('span', { text: title }), h('span', { class: 'pn-h-src', 'aria-hidden': 'true', text: 'SRC' })),
    h('dl', { class: 'pn-dl' }, rows.map(([k, label, unit]) => {
      const v = h('dd', { class: 'pn-v', text: DASH });
      readoutEls.set(k, v);
      return h('div', { class: 'pn-r', 'data-r': k }, h('dt', { class: 'pn-k', text: label }), v, h('dd', { class: 'pn-u', text: unit }), h('dd', { class: 'pn-tag', text: 'SIM' }));
    })),
    key === 'stab' ? h('canvas', { class: 'pn-bar', 'aria-hidden': 'true' }) : null));
  const barCanvas = groups[1].querySelector('.pn-bar');
  const latLine = h('p', { class: 'pn-line' }, h('span', { class: 'pn-line-v', text: DASH }), h('span', { class: 'pn-tag', text: 'SIM' }));
  const latSec = h('section', { class: 'pn-sec pn-sec-lattice', 'aria-labelledby': `${id}-h-lat` },
    h(`h${level + 1}`, { class: 'pn-h', id: `${id}-h-lat` }, h('span', { text: 'LATTICE' }), h('span', { class: 'pn-h-src', 'aria-hidden': 'true', text: 'SRC' })), latLine);

  const tc = h('p', { class: 'pn-tc', text: timeCode(0) });
  const phaseChip = h('span', { class: 'pn-phase', text: 'PAD' });
  const rateLine = h('span', { class: 'pn-head-rate' });
  const head = h('header', { class: 'pn-head' },
    h('p', { class: 'pn-eyebrow' }, h('span', { text: 'CHARGER / PITCH PLANE' }), phaseChip),
    tc, h('p', { class: 'pn-head-meta' }, h('span', { text: 'FLIGHT TIME / SIM' }), rateLine));
  const tagLegend = h('p', { class: 'pn-legend' },
    ...[['SIM', 'computed live in this tab'], ['PAGE', 'published on merttureli.com'], ['CAD', 'measured from the assembly'], ['EST', 'estimated here'], ['FIT', 'fitted to a published figure'], ['STD', 'textbook constant']]
      .map(([k, t]) => h('span', { class: 'pn-legend-i' }, h('b', { text: k }), ` ${t}`)));

  const bodyId = `${id}-body`;
  const body = h('div', { class: 'pn-body', id: bodyId },
    head, controls.playback, ...groups, latSec, controls.config, controls.view, controls.legend, tagLegend);
  const peekCells = h('div', { class: 'pn-peek-cells' },
    ...[['phase', 'PHASE'], ['tc', 'TIME'], ['aoa', 'AOA DEG'], ['sm', 'SM CAL']].map(([k, label]) =>
      h('p', { class: `pn-peek-c pn-peek-${k}` }, h('span', { class: 'pn-peek-k', text: label }), h('span', { class: 'pn-peek-v', 'data-peek': k, text: DASH }))));
  const peekV = Object.fromEntries([...peekCells.querySelectorAll('[data-peek]')].map((el) => [el.dataset.peek, el]));
  const handle = h('button', { type: 'button', class: 'pn-handle', 'aria-expanded': 'false', 'aria-controls': bodyId, 'aria-label': 'Expand the flight panel' }, h('span', { class: 'pn-grip', 'aria-hidden': 'true' }));
  const peek = h('div', { class: 'pn-peek' }, peekCells, controls.peekPlay);
  const live = h('p', { class: 'sr-only', 'aria-live': 'polite', 'aria-atomic': 'true' });
  const title = h(`h${level}`, { class: 'sr-only', id: `${id}-title`, text: 'Flight panel' });
  const rail = h('aside', { class: 'pn on-dark', 'aria-labelledby': `${id}-title`, 'data-sheet': 'collapsed' }, title, handle, peek, body);

  const ownDock = !dock;
  dock = dock || h('div', { class: 'pn-dock on-dark' });
  dock.classList.add('pn-dock');
  const chartCanvas = h('canvas', { class: 'pn-chart', 'aria-hidden': 'true' });
  const summary = h('p', { class: 'sr-only pn-summary', text: 'Strip chart: no flight data yet.' });
  dock.append(chartCanvas, summary, live);   // the live region sits in the stage, so it still speaks when the phone sheet is tucked away
  root.append(dock, rail);

  const theme = readTheme(rail);
  const chart = createStripChart(chartCanvas, { theme });
  const bar = createCpCgBar(barCanvas, { theme });

  /* ------------------------------------------------------------ state */
  let tier = governor.tier;
  let localPaused = false;
  let lastText = 0, lastChart = 0, lastSummary = 0, lastT = NaN, lastPhase = null, forced = true;
  let busEvents = [];                  // flight:event details seen on the bus (fallback when flight.events is absent)
  let own = [];                        // own trace samples when flight.history is absent
  let histCache = { key: '', data: [] };
  let mirror = [];
  let maxAoa = { v: NaN, t: NaN, scanned: -Infinity };
  let barKey = '';
  let sheet = 'collapsed', away = false, keysOn = true;
  let announceQ = [], announceTimer = 0, lastAnnounce = 0;
  const stats = { updates: 0, textWrites: 0, chartDraws: 0, lastUpdateMs: 0 };

  const write = (el, s) => { if (el.textContent !== s) { el.textContent = s; stats.textWrites++; } };

  function events() {
    const fromFlight = readEvents(flight && flight.events);
    return fromFlight && fromFlight.length ? fromFlight : busEvents;
  }
  const eventOf = (list, name) => list.find((e) => e.name === name) || null;

  /* flight.history in time order. A ring exposed as its raw storage array (oldest
     sample somewhere in the middle) is rotated once per change so the chart's binary
     search holds. Returns null when the flight keeps no usable history. */
  function history() {
    const h = flight && flight.history;
    if (h && typeof h.at === 'function' && typeof h.length === 'number' && !Array.isArray(h)) return mirrorRing(h);
    const raw = readHistory(h);
    if (!raw || !raw.length || !raw[0] || !Number.isFinite(raw[0].t)) return null;
    const last = raw[raw.length - 1];
    const key = `${raw.length}|${last && last.t}|${raw[0].t}`;
    if (key !== histCache.key) {
      let data = raw;
      if (last && raw[0].t > last.t) {
        let k = 1; while (k < raw.length && !(raw[k].t < raw[k - 1].t)) k++;
        data = raw.slice(k).concat(raw.slice(0, k));
      }
      histCache = { key, data };
    }
    return histCache.data;
  }

  /* A ring with at(i) (oldest first) and length, like flight.js's: copy only the new
     samples each frame instead of toArray() copying the whole buffer. */
  function mirrorRing(h) {
    const n = h.length;
    if (!n) { mirror = []; return mirror; }
    const m = mirror.length;
    const full = typeof h.capacity === 'number' && n >= h.capacity;    // a wrapped ring drops its oldest samples
    if (m) {
      // the mirror must still agree with the ring at its own last sample, or the flight was reset and re-run
      const tail = mirror[m - 1];
      const r = full ? null : h.at(m - 1);
      const last = h.at(n - 1);
      if ((!full && (m > n || !r || r.t !== tail.t || r.alpha !== tail.alpha)) || (last && last.t < tail.t)) mirror = [];
    }
    const lastT = mirror.length ? mirror[mirror.length - 1].t : -Infinity;
    let i = n - 1;
    while (i > 0 && h.at(i - 1).t > lastT) i--;
    for (; i < n; i++) { const r = h.at(i); if (r && r.t > lastT) mirror.push({ t: r.t, alpha: r.alpha, theta: r.theta, v: r.v }); }
    if (mirror.length > 6000) mirror.splice(0, mirror.length - 4096);
    return mirror;
  }

  function sampleOwn(st) {
    const t = st.t;
    if (!Number.isFinite(t)) return;
    const last = own[own.length - 1];
    if (last && t < last.t - 1e-9) own = [];                // time went backwards: a reset
    if (!last || t - last.t >= OWN_SAMPLE_S - 1e-9) {
      own.push({ t, alpha: st.alpha, theta: st.theta, v: st.v });
      if (own.length > 4 && own[0].t < t - OWN_KEEP_S) own.splice(0, own.findIndex((s) => s.t >= t - OWN_KEEP_S));
    }
  }

  function latticeCp() {
    const f = lattice && lattice.force;
    if (!f || lattice.fallback) return NaN;
    if (Number.isFinite(f.age_ms) && f.age_ms > 3000) return NaN;            // stale: say nothing rather than an old number
    if (Number.isFinite(f.xcp_m)) return f.xcp_m;
    if (!section || !Number.isFinite(f.xcpCells) || !(section.cellM > 0)) return NaN;
    return (f.xcpCells - (section.xNoseCol || 0)) * section.cellM;          // cells to metres from the nose tip
  }

  function playState(st, evs) {
    const p = playback || {};
    const paused = typeof p.paused === 'boolean' ? p.paused : localPaused;
    const apo = eventOf(evs, 'apogee');
    const done = typeof p.done === 'boolean' ? p.done : !!(apo && st.t >= apo.t + 1.99);
    const running = typeof p.running === 'boolean' ? p.running : (st.phase && st.phase !== 'pad' && !done && !paused);
    return { paused: !!paused && !done, running: !!running, done, phase: st.phase };
  }

  /* ------------------------------------------------------------ one frame */
  function update(now = performance.now(), force = false) {
    if (destroyed || !flight) return false;
    const t0 = performance.now();
    const st = flight.state || {};
    const d = flight.derived || {};
    const t = Number.isFinite(st.t) ? st.t : 0;
    const changed = t !== lastT;
    const hist = history();
    if (!hist) sampleOwn(st);
    const data = hist || own;
    const evs = events();
    if (changed && Number.isFinite(lastT) && t < lastT) { maxAoa = { v: NaN, t: NaN, scanned: -Infinity }; }

    // running max |alpha| after rail exit, scanned from the trace incrementally
    const rx = eventOf(evs, 'railExit');
    const apoT = (eventOf(evs, 'apogee') || { t: Infinity }).t;   // ascent only: rail exit to apogee, above MAXAOA_MIN_V
    if (rx) {
      for (let i = data.length - 1; i >= 0 && data[i].t > maxAoa.scanned; i--) {
        const s = data[i];
        if (s.t >= rx.t && s.t <= apoT && Number.isFinite(s.alpha) && !(s.v < MAXAOA_MIN_V) && !(Math.abs(s.alpha) <= maxAoa.v)) maxAoa = { v: Math.abs(s.alpha), t: s.t, scanned: maxAoa.scanned };
      }
      if (data.length) maxAoa.scanned = data[data.length - 1].t;
      if (t >= rx.t && t <= apoT && Number.isFinite(st.alpha) && !(st.v < MAXAOA_MIN_V) && !(Math.abs(st.alpha) <= maxAoa.v)) maxAoa = { v: Math.abs(st.alpha), t, scanned: maxAoa.scanned };
    }

    const textGap = 1000 / TEXT_HZ[Math.max(0, Math.min(3, tier))];
    if (force || forced || (changed && now - lastText >= textGap - 1)) {
      lastText = now;
      const r = (k, s) => { const el = readoutEls.get(k); if (el) write(el, s); };
      const V = firstFinite(st.airspeed, st.v);                       // airspeed: the relative wind speed when the flight gives it
      r('alt', fixed(firstFinite(st.altitude, st.y) / M_PER_FT, 1));  // altitude above the pad when given, else world y
      r('vel', fixed(V / M_PER_FT, 1));
      r('aoa', fixed(st.alpha * DEG, 2, true));
      r('pitch', fixed(st.theta * DEG, 2, true));
      r('rate', fixed(st.q * DEG, 1, true));
      r('qdyn', fixed(st.qdyn / PA_PER_PSF, 2));
      const margin = firstFinite(st.margin, readDerived(d, 'staticMargin', t));   // live margin as the CG moves with the burn
      const xcp = firstFinite(readDerived(d, 'xcp', t), st.xcp), xcg = firstFinite(st.xcg, readDerived(d, 'xcg', t));
      r('margin', fixed(margin, 2, true));
      r('cp', fixed(xcp / M_PER_IN, 2));
      const xl = latticeCp();
      r('cpl', fixed(xl / M_PER_IN, 2));
      r('cg', fixed(xcg / M_PER_IN, 2));
      r('cna', fixed(readDerived(d, 'cna'), 2));
      // naturalFrequency(V, t) is the linearised pitch natural frequency in rad/s (FIELD 3); shown in Hz = omega / 2 pi
      r('fn', fixed(readDerived(d, 'naturalFrequency', V, t) / (2 * Math.PI), 2));
      r('zeta', fixed(readDerived(d, 'dampingRatio', V, t), 3));
      r('normal', fixed(st.N / N_PER_LBF, 3, true));
      // the Barrowman restoring moment about the CG: the normal force at the Barrowman CP
      // (xcpNow includes the body-lift term at this alpha). state.M is not used: it adds
      // pitch damping, and it carries the lattice moment while the lattice flies the rocket.
      const xcpB = firstFinite(st.xcpNow, xcp);
      const mB = Number.isFinite(st.N) && Number.isFinite(xcpB) && Number.isFinite(xcg) ? -st.N * (xcpB - xcg) : (st.lattice ? NaN : firstFinite(st.Maero));
      r('moment', fixed(mB / NM_PER_LBFIN, 2, true));
      const f = lattice && !lattice.fallback ? lattice.force : null;
      r('cm', fixed(f && !(f.age_ms > 3000) && f.developed !== false ? f.cm : NaN, 3, true));   // integrate:b pass: a dash while the lattice flow is still developing (force.developed)
      const rv = rx && rx.state ? rx.state.v : NaN;
      r('railv', fixed(rv / M_PER_FT, 1));
      r('maxaoa', fixed(maxAoa.v * DEG, 2));
      const apo = eventOf(evs, 'apogee');
      r('apogee', fixed(apo && apo.state ? firstFinite(apo.state.apogee, apo.state.altitude, apo.state.y) / M_PER_FT : NaN, 1));
      write(tc, timeCode(t));
      write(phaseChip, phaseLabel(st.phase));
      write(peekV.phase, phaseLabel(st.phase));
      write(peekV.tc, timeCode(t));
      write(peekV.aoa, fixed(st.alpha * DEG, 2, true));
      write(peekV.sm, fixed(margin, 2, true));
      rail.dataset.phase = st.phase || 'pad';
      rail.classList.toggle('pn-unstable', Number.isFinite(margin) && margin < 0);
      writeLatticeLine();
      // CP / CG bar: redraw only when something it shows changed
      const fins = controls.get('fins'), sec = controls.get('section');
      const key = [fins, sec, xcp, xcg, xl].map((v) => (typeof v === 'number' ? v.toFixed(3) : v)).join('|') + fixed(margin, 2);   // 1 mm is a quarter pixel on the bar
      if (key !== barKey || force || forced) {
        const keyOutline = `${fins}|${sec}`;
        if (!bar.outlineKey || bar.outlineKey !== keyOutline) { bar.set({ outline: resolveOutline(geometry, cfg(), { finScale: fins, view: sec }) }); bar.outlineKey = keyOutline; }
        bar.set({ xcp, xcg, xcpLattice: xl, margin });
        bar.draw();
        barKey = key;
      }
      // lab: which moment flies the rocket while LATTICE FLIES IT is on (the flight falls
      // back to Barrowman until a fresh lattice C_m arrives)
      if (lab) controls.setInfo('latticeFlies', !st.lattice ? '' : st.latticeActive === false ? 'MOMENT IN USE / BARROWMAN, NO FRESH LATTICE FORCE' : Number.isFinite(st.latticeCm) ? `MOMENT IN USE / LATTICE CM ${fixed(st.latticeCm, 2, true)}` : '');
      const ps = playState(st, evs);
      controls.setPlayState(ps);
      rail.dataset.play = ps.done ? 'done' : ps.paused ? 'paused' : ps.running ? 'running' : 'idle';
    }

    // strip chart
    const chartGap = 1000 / CHART_HZ[Math.max(0, Math.min(3, tier))];
    if (force || forced || (changed && now - lastChart >= chartGap - 1)) {
      lastChart = now;
      chart.setData(data);
      chart.setEvents(evs);
      chart.setNow(t);
      chart.setLive({ t, alpha: st.alpha, theta: st.theta, v: st.v });   // the traces end at the state the readouts show
      chart.draw();
      stats.chartDraws++;
    }
    if (now - lastSummary >= SUMMARY_MS && (changed || force || forced)) { lastSummary = now; write(summary, chart.summary()); }

    // phase changes go to the live region (events are announced from the bus)
    if (st.phase !== lastPhase) { if (lastPhase !== null && st.phase) announce(`Phase ${phaseLabel(st.phase).toLowerCase()}.`); lastPhase = st.phase; }

    lastT = t; forced = false;
    stats.updates++; stats.lastUpdateMs = performance.now() - t0;
    return changed;
  }

  function writeLatticeLine() {
    const v = latLine.querySelector('.pn-line-v');
    if (!lattice) { write(v, 'NOT ATTACHED'); return; }
    if (lattice.fallback) { write(v, `OFF / ${String(lattice.fallback).toUpperCase()}`); return; }
    const s = lattice.stats || (bus.state['lattice:stats'] || {});
    const grid = Array.isArray(s.grid) ? s.grid.join('×') : typeof s.grid === 'string' ? s.grid.replace('x', '×') : (s.grid && s.grid.cols ? `${s.grid.cols}×${s.grid.rows}` : DASH);
    const sps = Number.isFinite(s.stepsPerSecond) ? Math.round(s.stepsPerSecond) : DASH;
    const tt = Number.isFinite(s.tier) ? s.tier : tier;
    write(v, `${grid} / ${sps} STEPS/S / T${tt} / ${String(s.precision || DASH).toUpperCase()}`);
  }

  /* ------------------------------------------------------------ live region, 1 Hz */
  function announce(msg) {
    if (announceQ.includes(msg)) return;
    announceQ.push(msg);
    if (announceQ.length > ANNOUNCE_KEEP) announceQ.splice(0, announceQ.length - ANNOUNCE_KEEP);
    if (announceTimer) return;
    const wait = Math.max(0, ANNOUNCE_MS - (performance.now() - lastAnnounce));
    announceTimer = setTimeout(flush, wait);
  }
  function flush() {
    announceTimer = 0;
    if (destroyed || !announceQ.length) return;
    live.textContent = announceQ.join(' ');
    announceQ = []; lastAnnounce = performance.now();
  }

  /* ------------------------------------------------------------ controls -> collaborators */
  function togglePause() {
    const p = playback; if (!p) return;
    const isPaused = typeof p.paused === 'boolean' ? p.paused : localPaused;
    if (isPaused && has(p, 'resume')) p.resume();
    else if (isPaused && has(p, 'play')) p.play();
    else call(p, 'pause');
    localPaused = typeof p.paused === 'boolean' ? p.paused : !isPaused;
  }
  controls.on(({ name, value, source }) => {
    switch (name) {
      case 'launch': localPaused = false; call(playback, 'launch'); break;
      case 'pause': togglePause(); break;
      case 'reset': localPaused = false; call(playback, 'reset'); break;
      case 'rate': call(playback, 'setRate', value); paintRate(); break;
      case 'step': call(playback, 'step', Number.isFinite(value) ? value : 0.1); break;
      case 'fins': call(flight, 'setFinScale', value); call(scene, 'setFinScale', value); break;
      case 'cg': call(flight, 'setCg', value * M_PER_IN); break;
      case 'rail': call(flight, 'setRail', value * M_PER_IN); call(scene, 'setRail', value * M_PER_IN); break;
      case 'angle': call(flight, 'setLaunchAngle', value / DEG); break;
      case 'wind': call(flight, 'setWind', value * MPS_PER_MPH); break;
      // the flight refuses a gust before ignition and a flick until the rail is clear (and
      // both once the flight has ended); say so rather than announce what did not happen
      case 'fireGust': {
        const mph = Number.isFinite(value) ? value : controls.get('gust');
        const ok = call(flight, 'gust', mph * MPS_PER_MPH);
        announce(ok !== false ? `Gust fired, ${fixed(mph, 1)} miles per hour.` : flight && flight.done ? 'No gust: the flight has ended.' : 'No gust: launch first.');
        break;
      }
      case 'flick': {
        if (!Number.isFinite(value) || value === 0) return;
        const ok = call(flight, 'flick', value);
        announce(ok !== false ? `Flick, pitch rate ${value < 0 ? 'minus' : 'plus'} ${Math.abs(value * DEG).toFixed(1)} degrees per second.` : flight && flight.done ? 'No flick: the flight has ended.' : 'No flick: it works after rail exit.');
        break;
      }
      case 'view': call(lattice, 'setView', value); call(scene, 'setView', value); bus.emit('ui:view', { view: value, section: controls.get('section') }); break;
      case 'section': call(scene, 'setSliceView', value); bus.emit('ui:view', { view: controls.get('view'), section: value }); break;
      case 'camera': call(scene, 'setCamera', value); bus.emit('ui:camera', { preset: value }); break;
      case 'markers': call(scene, 'setMarkers', value); break;
      case 'latticeFlies': call(flight, 'useLattice', value); break;
      default: return;
    }
    if (['launch', 'pause', 'reset', 'step', 'fireGust', 'flick', 'fins', 'section'].includes(name)) { call(scene, 'wake'); }
    for (const fn of [...listeners]) { try { fn({ name, value, source }); } catch (err) { console.error('[panel] onControl listener failed', err); } }
    wake();
  });
  function paintRate() {
    const r = playback && typeof playback.rate === 'number' ? playback.rate : controls.get('rate');
    rateLine.textContent = !(r > 0) || !Number.isFinite(r) ? DASH : r >= 1 ? 'REAL TIME' : `SLOW MOTION 1/${Math.round(1 / r)}`;
  }
  paintRate();

  /* availability of the groups that need a lattice or a 3D scene */
  function syncEnabled() {
    const latOk = !!(lattice && !lattice.fallback && has(lattice, 'setView'));
    const latWhy = !lattice ? 'NO LATTICE ATTACHED' : lattice.fallback ? `LATTICE OFF / ${String(lattice.fallback).toUpperCase()}` : '';
    controls.setEnabled('view', latOk, latWhy);
    controls.setEnabled('section', has(scene, 'setSliceView'), 'NEEDS THE SCENE');
    const camOk = has(scene, 'setCamera') && !scene.fallback;
    controls.setEnabled('camera', camOk, scene && scene.fallback ? '2D VIEW / ONE FIXED SIDE CAMERA' : 'NEEDS THE 3D SCENE');
    controls.setEnabled('markers', has(scene, 'setMarkers'));
    controls.setEnabled('latticeFlies', latOk && has(flight, 'useLattice'));
    controls.setEnabled('fireGust', has(flight, 'gust'));
    controls.setEnabled('flick', has(flight, 'flick'), 'NEEDS THE FLIGHT MODEL');
    const showReduced = reducedMq.matches || (tier === 0 && governor.stats.pinned);   // reduced motion, or a visitor pinned T0 (not an adaptive drop mid-flight)
    controls.setReduced(showReduced && has(playback, 'step'));
  }
  syncEnabled();

  /* the camera group follows the scene's camera: after an orbit the rig is in free mode,
     so no preset is shown pressed and a note says how to return (scene.onCameraMode) */
  let offCam = null;
  function showCameraMode(mode) {
    const freeMode = mode === 'free';
    controls.showNone('camera', freeMode);
    controls.setInfo('camera', freeMode ? 'FREE / PRESS A PRESET TO RETURN' : '');
  }
  function bindScene() {
    if (offCam) { try { offCam(); } catch { /* the scene is gone */ } offCam = null; }
    showCameraMode(null);
    if (!has(scene, 'onCameraMode')) return;
    offCam = call(scene, 'onCameraMode', ({ mode } = {}) => showCameraMode(mode)) || null;
    if (scene.cameraPreset === 'free') showCameraMode('free');
  }
  bindScene();

  /* ------------------------------------------------------------ sheet (phone) */
  function setSheet(next) {
    sheet = next === 'expanded' ? 'expanded' : 'collapsed';
    rail.dataset.sheet = sheet;
    handle.setAttribute('aria-expanded', String(sheet === 'expanded'));
    handle.setAttribute('aria-label', sheet === 'expanded' ? 'Collapse the flight panel' : 'Expand the flight panel');
    syncInert();
  }
  function syncInert() {
    const phone = phoneMq.matches;
    rail.dataset.layout = phone ? 'sheet' : 'rail';
    rail.dataset.away = phone && away ? '1' : '0';
    const hideBody = phone && (sheet === 'collapsed' || away);
    if (hideBody) body.setAttribute('inert', ''); else body.removeAttribute('inert');
    if (phone && away) peek.setAttribute('inert', ''); else peek.removeAttribute('inert');
    if (phone && away) handle.setAttribute('tabindex', '-1'); else handle.removeAttribute('tabindex');
  }
  /* The whole collapsed row (handle plus peek, 72 px) drags the sheet; taps keep their
     meaning (the handle and the peek cells toggle it, the peek button plays). Pointer
     capture is taken only once the pointer has travelled, so a tap's click still lands
     on the button it started on; the click that ends a drag is swallowed. */
  let drag = null;
  const inGrip = (t) => t instanceof Node && (handle.contains(t) || peek.contains(t));
  handle.addEventListener('click', () => { if (drag && drag.moved) return; setSheet(sheet === 'expanded' ? 'collapsed' : 'expanded'); });
  peekCells.addEventListener('click', () => { if (drag && drag.moved) return; if (phoneMq.matches) setSheet(sheet === 'expanded' ? 'collapsed' : 'expanded'); });
  const swallowClick = (e) => { if (drag && drag.moved && inGrip(e.target)) { e.stopPropagation(); e.preventDefault(); } };
  rail.addEventListener('click', swallowClick, true);
  const onGripDown = (e) => {
    if (!phoneMq.matches || e.button > 0 || !inGrip(e.target) || rail.dataset.away === '1') return;
    const rect = rail.getBoundingClientRect();
    drag = { id: e.pointerId, y0: e.clientY, dy: 0, moved: false, h: rect.height, peek: peek.offsetHeight + handle.offsetHeight };
  };
  const onGripMove = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag.dy = e.clientY - drag.y0;
    if (!drag.moved && Math.abs(drag.dy) > 6) {
      drag.moved = true;
      try { rail.setPointerCapture(e.pointerId); } catch { /* synthetic or already gone */ }
    }
    if (!drag.moved) return;
    const base = sheet === 'expanded' ? 0 : drag.h - drag.peek;
    const y = Math.max(0, Math.min(drag.h - drag.peek, base + drag.dy));
    rail.style.transform = `translateY(${y}px)`; rail.dataset.dragging = '1';
  };
  const endDrag = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    rail.style.transform = ''; delete rail.dataset.dragging;
    if (drag.moved) { if (drag.dy < -40) setSheet('expanded'); else if (drag.dy > 40) setSheet('collapsed'); }
    try { if (rail.hasPointerCapture(e.pointerId)) rail.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    const d0 = drag; setTimeout(() => { if (drag === d0) drag = null; }, 0);
  };
  rail.addEventListener('pointerdown', onGripDown);
  rail.addEventListener('pointermove', onGripMove);
  rail.addEventListener('pointerup', endDrag);
  rail.addEventListener('pointercancel', endDrag);
  const onKeyEsc = (e) => { if (e.key === 'Escape' && phoneMq.matches && sheet === 'expanded') { setSheet('collapsed'); handle.focus(); } };
  rail.addEventListener('keydown', onKeyEsc);

  /* ------------------------------------------------------------ wiring */
  const loop = createIdleLoop((now) => {
    if (!flight) return false;
    const busy = update(now);
    return busy;
  }, { idleFrames: 20, poll: () => !!(flight && flight.state && flight.state.t !== lastT) });
  if (!selfLoop) loop.destroy();
  const wake = () => { forced = true; if (selfLoop) loop.wake(); else update(performance.now(), true); };

  const offs = [];
  offs.push(bus.on('flight:event', (e) => {
    if (!e || !e.name) return;
    if (!busEvents.some((x) => x.name === e.name && x.t === e.t)) busEvents.push({ name: e.name, t: e.t, state: e.state ? { ...e.state } : null });
    if (EVENT_SAY[e.name]) {
      let msg = `${EVENT_SAY[e.name]} at ${Number(e.t).toFixed(2)} s`;
      if (e.name === 'railExit' && e.state) msg += `, ${fixed(e.state.v / M_PER_FT, 1)} feet per second`;
      if (e.name === 'apogee' && e.state) msg += `, ${fixed(firstFinite(e.state.apogee, e.state.altitude, e.state.y) / M_PER_FT, 0)} feet`;
      announce(msg + '.');
    }
    wake();
  }));
  offs.push(bus.on('flight:reset', () => {
    busEvents = []; own = []; mirror = []; histCache = { key: '', data: [] }; maxAoa = { v: NaN, t: NaN, scanned: -Infinity }; localPaused = false;
    announceQ = []; if (announceTimer) { clearTimeout(announceTimer); announceTimer = 0; }   // a new run: nothing from the old one is read out
    wake();
  }));
  offs.push(bus.on('flight:config', () => { sync(); bar.outlineKey = ''; wake(); }));
  offs.push(bus.on('lattice:stats', () => { forced = true; if (!loop.running) update(performance.now(), true); }));
  offs.push(governor.subscribe(({ tier: t }) => { tier = t; syncEnabled(); resizeCanvases(); wake(); }));
  // shortcuts apply only while the stage is on screen or focus is inside the panel, so
  // Space scrolls the page everywhere else (Method, Configuration, Runs)
  const keysActive = () => controls.get('keys') !== false && (keysOn || root.contains(document.activeElement) || (!!dock && dock.contains(document.activeElement)));
  const offKeys = opts.keyboard === false ? () => {} : controls.bindKeys(document, { active: keysActive });
  const onMq = () => { syncInert(); syncEnabled(); resizeCanvases(); wake(); };
  phoneMq.addEventListener('change', onMq);
  reducedMq.addEventListener('change', onMq);

  function resizeCanvases() {
    const dpr = governor.dpr();
    chart.resize(dpr); bar.resize(dpr);
    forced = true;
  }
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { resizeCanvases(); update(performance.now(), true); }) : null;
  if (ro) { ro.observe(chartCanvas); ro.observe(barCanvas); }
  /* A devicePixelRatio change at the same CSS size (the window moved to another
     screen, the OS scale changed) never reaches the ResizeObserver: a resolution
     query, re-armed at each new ratio, refits the backing stores. */
  let dprMq = null;
  const onDpr = () => { armDpr(); if (!destroyed) { resizeCanvases(); update(performance.now(), true); } };
  function armDpr() {
    if (dprMq) dprMq.removeEventListener('change', onDpr);
    try { dprMq = matchMedia(`(resolution: ${devicePixelRatio || 1}dppx)`); dprMq.addEventListener('change', onDpr); } catch { dprMq = null; }
  }
  armDpr();
  const io = typeof IntersectionObserver === 'function' ? new IntersectionObserver((es) => {
    const e = es[es.length - 1];
    away = !e.isIntersecting || e.intersectionRatio < 0.2;      // the stage is mostly scrolled off: tuck the sheet away
    const vh = e.rootBounds ? e.rootBounds.height : innerHeight;
    keysOn = e.isIntersecting && (e.intersectionRatio >= KEYS_MIN_VISIBLE || e.intersectionRect.height >= KEYS_MIN_VISIBLE * vh);
    syncInert();
  }, { threshold: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1] }) : null;
  io && io.observe(root);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (!destroyed) { forced = true; update(performance.now(), true); } });

  setSheet(opts.sheet === 'expanded' ? 'expanded' : 'collapsed');
  resizeCanvases();
  update(performance.now(), true);

  /* re-read control values from flight.config without calling any setter */
  function sync() {
    const v = fromConfig();
    for (const [k, val] of Object.entries(v)) controls.set(k, val);
    if (playback && typeof playback.rate === 'number') { controls.set('rate', playback.rate); paintRate(); }
  }

  /* programmatic control: updates the UI and makes the same calls a visitor would */
  const NAMES = { fins: 'fins', cg: 'cg', rail: 'rail', angle: 'angle', wind: 'wind', gust: 'gust', speed: 'rate', rate: 'rate', view: 'view', section: 'section', cam: 'camera', camera: 'camera', markers: 'markers', lattice: 'latticeFlies', latticeFlies: 'latticeFlies' };
  const api = {
    get root() { return root; },
    get rail() { return rail; },
    get dock() { return dock; },
    get controls() { return controls; },
    update(now) { return update(now ?? performance.now(), true); },
    wake,
    sync,
    set(name, value) {
      const n = NAMES[name]; if (!n) return false;
      if (!controls.set(n, value)) return false;    // a value no click could produce changes nothing
      fire(n, controls.get(n));
      return true;
    },
    press(name, value) { fire(name, value); },      // launch, pause, reset, step, fireGust, flick (rad/s)
    setSheet,
    get sheet() { return sheet; },
    attach(next = {}) {
      if ('flight' in next) { flight = next.flight; busEvents = []; own = []; mirror = []; histCache = { key: '', data: [] }; maxAoa = { v: NaN, t: NaN, scanned: -Infinity }; lastT = NaN; bar.outlineKey = ''; }
      if ('lattice' in next) lattice = next.lattice;
      if ('scene' in next && next.scene !== scene) { scene = next.scene; bindScene(); }
      if ('playback' in next) playback = next.playback;
      if ('geometry' in next) { geometry = next.geometry; bar.outlineKey = ''; }
      if ('section' in next) section = next.section;
      syncEnabled(); sync(); wake();
    },
    setSection(s) { section = s; wake(); },
    onControl(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    get state() {
      const st = (flight && flight.state) || {};
      return {
        t: st.t, phase: st.phase, sheet, layout: rail.dataset.layout, away, keys: keysActive(), tier, reduced: reducedMq.matches,
        loop: loop.running, paused: playback && typeof playback.paused === 'boolean' ? playback.paused : localPaused,
        values: { ...controls.values }, chartPoints: chart.points, chartScaleDeg: chart.scale,
        maxAoaDeg: maxAoa.v * DEG, events: events().map((e) => `${e.name}@${Number(e.t).toFixed(3)}`),
        stats: { ...stats }, summary: summary.textContent, live: live.textContent,
      };
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      loop.destroy(); offs.forEach((f) => f()); offKeys();
      if (offCam) { try { offCam(); } catch { /* the scene is gone */ } offCam = null; }
      phoneMq.removeEventListener('change', onMq); reducedMq.removeEventListener('change', onMq);
      ro && ro.disconnect(); io && io.disconnect();
      if (dprMq) { dprMq.removeEventListener('change', onDpr); dprMq = null; }
      if (announceTimer) clearTimeout(announceTimer);
      rail.removeEventListener('keydown', onKeyEsc);
      rail.removeEventListener('click', swallowClick, true);
      rail.removeEventListener('pointerdown', onGripDown); rail.removeEventListener('pointermove', onGripMove);
      rail.removeEventListener('pointerup', endDrag); rail.removeEventListener('pointercancel', endDrag);
      chart.destroy(); bar.destroy(); controls.destroy();
      rail.remove();
      if (ownDock) dock.remove(); else { chartCanvas.remove(); summary.remove(); live.remove(); dock.classList.remove('pn-dock'); }
      root.classList.remove('pn-host');
      listeners.clear();
    },
  };
  /* fire(): run a control through the same path as a click (the controls' emitter) */
  function fire(name, value) { controls.emit(name, value, 'api'); }
  return api;
}

export default mountPanel;
