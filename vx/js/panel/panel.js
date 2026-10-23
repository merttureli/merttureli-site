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
   governor:tier; emits ui:view {view, section} and ui:camera {preset}.

   Layout (presentation wave 1, item 4: the instruments step back). Top level:
   PLAYBACK (launch, pause, reset, rate), RUNS (01 to 05), FINS (none, half, full),
   four large readouts with plain sub-labels (time, altitude, angle of attack, static
   margin) and the CP/CG bar with its key. Folded below, as native details elements:
   ALL READOUTS (every other row, the events and the lattice lines), CONFIGURE (the
   sliders, the armed gust with FIRE and DISARM, the flick), VIEW (views, section,
   camera, markers) and KEYS (hidden on coarse pointers until a key is pressed).
   Every fold starts closed. A visitor's open and close choices are kept per fold in
   localStorage (FOLD_STORE) where the browser allows it. ?lab and ?hold open ALL
   READOUTS for that load, ?panel=open opens every fold (verification), and
   opts.open ({readouts, configure, view, keys}) wins over both.

   Page hooks (what only the page can do). Pass them to mountPanel or attach():
     startRun(key)   run key full | half | none | wind | gust: configure, reset, launch
     disarmGust()    drop the gust armed for rail exit
     armedGust()     the armed gust in mph, 0 when none
     prepareLaunch() called just before a launch that starts a new flight (LAUNCH, L,
                     peek play, a run), e.g. to hand the lattice the section for the
                     fins now set; optional
   Each is looked up at the moment of use: the option first, then a function of the
   same name on window.__field, then the page's own controls ([data-run-go="<key>"],
   [data-disarm], [data-badge-gust]). With none of them the RUNS row and DISARM are
   disabled with a note.

   Phone (presentation wave 2, item 6): every launch through the panel (LAUNCH, L, peek
   play, the RUNS row, and the page's startRun, plate and end card buttons, which all
   press 'launch') collapses the sheet before the flight starts, and moves keyboard
   focus to peek play when it was on the stage or in the panel (never from elsewhere in
   the page, so ?autolaunch takes no focus). The collapsed row reads PHASE / TIME / AOA
   / MARGIN with the FINS toggle (WITH / WITHOUT) beside play; setPeekCaption(text)
   puts the beat caption in place of the four cells while the page narrates (and in
   the toggle's place too when it needs more than three lines). KEYS and the key
   chips stay hidden on coarse pointers (panel.css).

   View AUTO (wave 2, item 8): setAutoView(view) is the page's pick for the phase of the
   flight. Its first call offers AUTO at the head of the view group (opts.autoView: true
   offers it from the start); AUTO is on unless the visitor or the URL has picked a view.
   While AUTO is on the pick is applied at once through the same calls a click makes
   (onControl sees {name: 'view', source: 'auto'}); a picked view ends AUTO, and the AUTO
   button brings it back with the page's latest pick.

   The result frame (fix phase): at the page's apogee stop (playback.atApogee) the flight is one 5 ms
   step into descent; the phase chip and the peek's PHASE read APOGEE until the visitor continues, and
   no phase line is announced there (the end card's status says it). Under MAXAOA_MIN_V (the run cards'
   and the chart's 50 ft/s) near apogee the ANGLE OF ATTACK value steps back with AOA_SLOW_SUB as its
   sub-label ([data-slow] on the big row and the peek cell). Event lines queued before the page began to
   narrate are dropped at flush and by muteEvents(true). */
import { bus } from '../core/bus.js';
import { governor } from '../core/governor.js';
import { buildControls, tagEl } from './controls.js';
import { createStripChart, createCpCgBar } from './chart.js';
import {
  DEG, M_PER_FT, M_PER_IN, N_PER_LBF, PA_PER_PSF, NM_PER_LBFIN, MPS_PER_MPH, DASH,
  fixed, timeCode, phaseLabel, readDerived, firstFinite, readHistory, readEvents, resolveOutline, createIdleLoop, readTheme,
} from './format.js';

const PHONE_MQ = '(max-width: 859.98px)';
const ANNOUNCE_MS = 1000;            // live region: at most one update per second (FIELD 2)
const ANNOUNCE_KEEP = 3;             // live region: the newest messages kept per update; older ones are dropped, not read late
const EVENT_DEFER_MS = 400;          // live region: a flight-event line waits this long at least, so the page's first caption (which mutes events) can still drop it
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
const FOLD_STORE = 'charger-field-panel-folds';   // localStorage: {readouts, configure, view, keys} as the visitor left them
const FOLDS = [['readouts', 'ALL READOUTS'], ['configure', 'CONFIGURE'], ['view', 'VIEW'], ['keys', 'KEYS']];
const INFLOW_HELD_DEG = 34.95;       // the lattice holds its inflow at 35 deg (EST, FIELD 4); at or past this the angle shown is the held one

/* The four large readouts (key, label, unit, plain sub-label). The time code is the
   first of them and is built apart (it carries the phase and the playback rate). */
const BIG = [
  ['alt', 'ALTITUDE', 'FT', 'Height above the pad'],
  ['aoa', 'ANGLE OF ATTACK', 'DEG', 'Nose off the oncoming air'],
  ['margin', 'STATIC MARGIN', 'CAL', "Balance point to the air's push, in body widths"],
];
/* the angle of attack near apogee, under MAXAOA_MIN_V (the run cards' and the chart's 50 ft/s rule): the
   value steps back (paper-a45 on the big row, paper-a70 on the phone's peek cell) and this note takes the
   sub-label's place, so the slow tail end of the climb never reads as the result (owner copy) */
const AOA_SLOW_SUB = 'Too slow near apogee to mean much';
/* ALL READOUTS: every other row, grouped as before */
const READOUTS = [
  ['flight', 'FLIGHT', [
    ['vel', 'AIRSPEED', 'FT/S'],
    ['pitch', 'PITCH', 'DEG'], ['rate', 'PITCH RATE', 'DEG/S'], ['qdyn', 'DYNAMIC PRESSURE', 'LBF/FT²'],
  ]],
  ['stab', 'STABILITY', [
    ['cp', 'CP / BARROWMAN', 'IN'], ['cpl', 'CP / 2D SECTION ONLY / NOT COMPARABLE', 'IN', 'lab'], ['cg', 'CG / LIVE', 'IN'],   // the lattice rows: 2D section values, ?lab only (validation L3: the section's CP sits 15 to 18 in from the nose against Barrowman's 29 to 33 in, so it is no check on the flight model)
    ['cna', 'CN ALPHA', '/RAD'], ['fn', 'PITCH FREQUENCY', 'HZ'], ['zeta', 'DAMPING RATIO', ''],
    ['normal', 'NORMAL FORCE', 'LBF'], ['moment', 'MOMENT / BARROWMAN', 'LBF IN'], ['cm', 'CM / 2D SECTION ONLY / NOT COMPARABLE', '', 'lab'],   // as above, ?lab only
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
/* the tag word of a readout: SIM stays plain text, any other word is boxed (panel.css) */
const src = (word) => h('span', { class: 'pn-src', 'data-src': word, text: word });
function readFolds() {
  try { const v = JSON.parse(localStorage.getItem(FOLD_STORE) || 'null'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}
function saveFold(key, open) {
  try { const v = readFolds(); v[key] = !!open; localStorage.setItem(FOLD_STORE, JSON.stringify(v)); } catch { /* storage blocked: the fold still holds for this visit */ }
}

export function mountPanel(root, opts = {}) {
  if (!root) throw new Error('mountPanel needs a root element');
  let { flight, lattice = null, scene = null, playback = null, geometry = null, section = null, dock = null } = opts;
  const lab = opts.lab ?? /[?&]lab\b/.test(location.search);
  const level = Math.max(1, Math.min(5, opts.headingLevel || 2));   // the panel title level; sections are one below
  const selfLoop = opts.selfLoop !== false;
  const hooks = { startRun: opts.startRun, disarmGust: opts.disarmGust, armedGust: opts.armedGust, prepareLaunch: opts.prepareLaunch };
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
    refs: Object.assign({ fins: 'CAD 1.00', cg: `PAGE ${PAGE_CG_IN.toFixed(1)}`, rail: `EST ${EST_RAIL_IN}`, angle: 'EST 0.0', wind: 'EST 0.0', gust: `EST ${(5 / MPS_PER_MPH).toFixed(1)}` }, opts.refs || {}),   // the tagged default beside each slider (vertical rail and still air are EST, FIELD 3; gust: the 5 m/s of the FIELD 3 test); the page passes its own CG (the CAD estimate, EST)
  });

  /* ------------------------------------------------------------ DOM */
  root.classList.add('pn-host');
  const readoutEls = new Map();
  const row = ([k, label, unit]) => {
    const v = h('dd', { class: 'pn-v', text: DASH });
    readoutEls.set(k, v);
    return h('div', { class: 'pn-r', 'data-r': k }, h('dt', { class: 'pn-k', text: label }), v, h('dd', { class: 'pn-u', text: unit }), h('dd', { class: 'pn-tag' }, src('SIM')));
  };
  const groups = READOUTS.map(([key, title, rows]) => h('section', { class: `pn-sec pn-sec-${key}`, 'aria-labelledby': `${id}-h-${key}` },
    h(`h${level + 1}`, { class: 'pn-h', id: `${id}-h-${key}` }, h('span', { text: title }), h('span', { class: 'pn-h-src', 'aria-hidden': 'true', text: 'SRC' })),
    h('dl', { class: 'pn-dl' }, rows.filter((r) => lab || r[3] !== 'lab').map(row))));   // the 2D section rows only under ?lab
  // the lattice (wave 2: the header's ENGINE, GRID and TIER live here now): ENGINE, GRID
  // (grid / steps per second / lattice tier / precision, read by the probes as the first
  // .pn-line-v), TIER (the governor's, PINNED when the visitor or ?tier pinned it), and
  // the inflow the flight hands the section, in lattice units and degrees
  const engineV = h('dd', { class: 'pn-line-e', text: DASH });
  const gridV = h('span', { class: 'pn-line-v', text: DASH });
  const gridTag = h('dd', { class: 'pn-tag' }, src('SIM'));
  const tierV = h('dd', { class: 'pn-line-t', text: DASH });
  const ainTag = h('dd', { class: 'pn-tag' }, src('SIM'));
  const uinV = h('dd', { class: 'pn-v', text: DASH }), ainV = h('dd', { class: 'pn-v', text: DASH });
  readoutEls.set('uin', uinV); readoutEls.set('ain', ainV);
  const latNote = h('p', { class: 'pn-note', hidden: true });
  const latSec = h('section', { class: 'pn-sec pn-sec-lattice', 'aria-labelledby': `${id}-h-lat` },
    h(`h${level + 1}`, { class: 'pn-h', id: `${id}-h-lat` }, h('span', { text: 'LATTICE' }), h('span', { class: 'pn-h-src', 'aria-hidden': 'true', text: 'SRC' })),
    h('dl', { class: 'pn-dl pn-lat' },
      h('div', { class: 'pn-lr', 'data-r': 'engine' }, h('dt', { class: 'pn-k', text: 'ENGINE' }), engineV),
      h('div', { class: 'pn-lr', 'data-r': 'grid' }, h('dt', { class: 'pn-k', text: 'GRID' }), h('dd', { class: 'pn-line' }, gridV), gridTag),
      h('div', { class: 'pn-lr', 'data-r': 'tier' }, h('dt', { class: 'pn-k', text: 'TIER' }), tierV)),
    h('dl', { class: 'pn-dl' },
      h('div', { class: 'pn-r', 'data-r': 'uin' }, h('dt', { class: 'pn-k', text: 'INFLOW' }), uinV, h('dd', { class: 'pn-u', text: 'LU' }), h('dd', { class: 'pn-tag' }, src('SIM'))),
      h('div', { class: 'pn-r', 'data-r': 'ain' }, h('dt', { class: 'pn-k', text: 'INFLOW ANGLE' }), ainV, h('dd', { class: 'pn-u', text: 'DEG' }), ainTag)),
    latNote);

  // the four large readouts: the time code first, then altitude, angle of attack, margin
  const tc = h('p', { class: 'pn-tc', text: timeCode(0) });
  const phaseV = h('span', { text: 'PAD' });
  const phaseChip = h('span', { class: 'pn-phase' }, h('span', { class: 'sr-only', text: 'phase ' }), phaseV);
  const rateLine = h('span', { class: 'pn-head-rate' });
  const tcRow = h('div', { class: 'pn-big pn-big-tc' },
    h('p', { class: 'pn-k' }, h('span', { text: 'TIME' }), phaseChip),
    h('p', { class: 'pn-big-s', text: 'Seconds since ignition' }),
    tc,
    h('p', { class: 'pn-big-m' }, rateLine, h('span', { class: 'pn-tag' }, src('SIM'))));
  const bigEls = new Map();            // key -> {row, sub, text}: the big rows, for the slow-AOA note
  const big = ([k, label, unit, sub]) => {
    const v = h('dd', { class: 'pn-v', text: DASH });
    readoutEls.set(k, v);
    const subEl = h('dd', { class: 'pn-big-s', text: sub });
    const rowEl = h('div', { class: 'pn-r pn-big', 'data-r': k },
      h('dt', { class: 'pn-k', text: label }), subEl, v,
      h('dd', { class: 'pn-big-m' }, h('span', { class: 'pn-u', text: unit }), h('span', { class: 'pn-tag' }, src('SIM'))));
    bigEls.set(k, { row: rowEl, sub: subEl, text: sub });
    return rowEl;
  };
  // the CP/CG bar, with a key in words (the same words as the stage's plates)
  const barCanvas = h('canvas', { class: 'pn-bar', 'aria-hidden': 'true' });
  const keyCpl = h('span', { class: 'pn-key pn-key-cpl', hidden: true }, h('i', { 'aria-hidden': 'true' }), 'CP / 2D SECTION ONLY');   // ?lab only (latticeCp)
  const barLegend = h('p', { class: 'pn-barkey' },
    h('span', { class: 'pn-key pn-key-cg' }, h('i', { 'aria-hidden': 'true' }), 'CG / BALANCE POINT'),
    h('span', { class: 'pn-key pn-key-cp' }, h('i', { 'aria-hidden': 'true' }), "CP / AIR'S PUSH"),
    keyCpl);
  const readSec = h('section', { class: 'pn-sec pn-sec-read', 'aria-labelledby': `${id}-h-read` },
    h(`h${level + 1}`, { class: 'sr-only', id: `${id}-h-read`, text: 'Readouts' }),
    tcRow, h('dl', { class: 'pn-dl pn-bigs' }, BIG.map(big)),
    h('div', { class: 'pn-fig' }, barCanvas, barLegend));

  // the folds: native details, closed unless the visitor left them open
  const folds = {};
  const fold = (key, title, ...kids) => {
    folds[key] = h('details', { class: `pn-fold pn-fold-${key}`, 'data-fold': key },
      h('summary', { class: 'pn-fold-s' }, h('span', { class: 'pn-fold-t', text: title }), h('span', { class: 'pn-fold-i', 'aria-hidden': 'true' })),
      h('div', { class: 'pn-fold-b' }, ...kids));
    return folds[key];
  };
  const foldKids = { readouts: [...groups, latSec], configure: [controls.config], view: [controls.view], keys: [controls.legend] };

  const bodyId = `${id}-body`;
  const benchNote = h('p', { class: 'pn-note pn-bench-note', hidden: true });
  const body = h('div', { class: 'pn-body', id: bodyId },
    benchNote, controls.playback, controls.runs, controls.fins, readSec,
    ...FOLDS.map(([key, title]) => fold(key, title, ...foldKids[key])));
  // open state: stored choice, then ?panel=open / ?lab / ?hold, then opts.open
  const foldWant = {};
  {
    const stored = readFolds();
    const qs = location.search;
    const allOpen = /[?&]panel=open(&|$)/.test(qs);
    const readoutsOpen = lab || /[?&]hold(=|&|$)/.test(qs);
    const given = opts.open && typeof opts.open === 'object' ? opts.open : {};
    for (const [key] of FOLDS) {
      let v = stored[key] === true;
      if (allOpen || (key === 'readouts' && readoutsOpen)) v = true;
      if (typeof given[key] === 'boolean') v = given[key];
      foldWant[key] = v;
      folds[key].open = v;
    }
  }
  // the phone sheet's collapsed row: PHASE / TIME / AOA / MARGIN (plain words; the units
  // ride on the values: ° on the angle, CAL on the margin), the FINS toggle and play. The
  // beat caption (setPeekCaption) takes the cells' place while it is set (fitPeekCaption).
  // every number keeps its tag: a screen-reader SIM after TIME, AOA and MARGIN, and one quiet visible SIM
  // beside the AOA label (.pn-peek-src): the value cells have no room for a tag down to 320 px, the AOA
  // label's cell does, and every number in the row is SIM
  const PEEK = [['phase', 'PHASE', '', false], ['tc', 'TIME', '', true], ['aoa', 'AOA', '', true], ['margin', 'MARGIN', 'CAL', true]];
  const peekCells = h('div', { class: 'pn-peek-cells' },
    ...PEEK.map(([k, label, unit, tagged]) =>
      h('p', { class: `pn-peek-c pn-peek-${k}` }, h('span', { class: 'pn-peek-k' }, label, k === 'aoa' ? h('span', { class: 'pn-peek-src', 'aria-hidden': 'true', text: 'SIM' }) : null),
        h('span', { class: 'pn-peek-vv' }, h('span', { class: 'pn-peek-v', 'data-peek': k, text: DASH }), unit ? h('span', { class: 'pn-peek-u', text: unit }) : null,
          tagged ? h('span', { class: 'sr-only', text: ' SIM' }) : null,
          k === 'aoa' ? h('span', { class: 'sr-only pn-peek-why' }) : null))));
  const peekV = Object.fromEntries([...peekCells.querySelectorAll('[data-peek]')].map((el) => [el.dataset.peek, el]));
  const peekAoaCell = peekCells.querySelector('.pn-peek-aoa'), peekWhy = peekCells.querySelector('.pn-peek-why');
  const peekCap = h('p', { class: 'pn-peek-cap', hidden: true });
  peekCells.append(peekCap);
  const handle = h('button', { type: 'button', class: 'pn-handle', 'aria-expanded': 'false', 'aria-controls': bodyId, 'aria-label': 'Expand the flight panel' }, h('span', { class: 'pn-grip', 'aria-hidden': 'true' }));
  const peek = h('div', { class: 'pn-peek' }, peekCells, controls.peekFins, controls.peekPlay);
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
  const chart = createStripChart(chartCanvas, { theme, pitch: lab });   // pitch is drawn under ?lab only (item 11: the chart is the angle of attack)
  const bar = createCpCgBar(barCanvas, { theme });

  /* ------------------------------------------------------------ state */
  let tier = governor.tier;
  let localPaused = false;
  let lastText = 0, lastChart = 0, lastSummary = 0, lastT = NaN, lastPhase = null, forced = true;
  let busEvents = [];                  // flight:event details seen on the bus (fallback when flight.events is absent)
  let gustsFired = [];                 // {t, api} each gust that reached the flight this run (the chart's GUST ticks)
  let own = [];                        // own trace samples when flight.history is absent
  let histCache = { key: '', data: [] };
  let mirror = [];
  let maxAoa = { v: NaN, t: NaN, scanned: -Infinity };
  let barKey = '';
  let sheet = 'collapsed', away = false, keysOn = true;
  let bench = null;                    // {label} while the page's ?bench run drives the flight (C2 section 9.6), else null
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
      const rho = airRho();
      histCache = { key, data: data.map((r) => ({ t: r.t, alpha: r.alpha, theta: r.theta, v: airspeedOf(r, rho) })) };
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
    const rho = airRho();
    for (; i < n; i++) { const r = h.at(i); if (r && r.t > lastT) mirror.push({ t: r.t, alpha: r.alpha, theta: r.theta, v: airspeedOf(r, rho) }); }
    if (mirror.length > 6000) mirror.splice(0, mirror.length - 4096);
    return mirror;
  }

  /* airspeed of a history sample: from its dynamic pressure (the history keeps qdyn, not the
     airspeed), so the 50 ft/s rule reads the relative wind as the run cards do; ground speed
     only when there is no qdyn */
  function airRho() { const r = cfg().airDensity; return typeof r === 'number' && r > 0 ? r : 1.225; }
  function airspeedOf(r, rho = airRho()) {
    if (typeof r.airspeed === 'number' && Number.isFinite(r.airspeed)) return r.airspeed;
    return typeof r.qdyn === 'number' && r.qdyn >= 0 && Number.isFinite(r.qdyn) ? Math.sqrt((2 * r.qdyn) / rho) : r.v;
  }

  function sampleOwn(st) {
    const t = st.t;
    if (!Number.isFinite(t)) return;
    const last = own[own.length - 1];
    if (last && t < last.t - 1e-9) own = [];                // time went backwards: a reset
    if (!last || t - last.t >= OWN_SAMPLE_S - 1e-9) {
      own.push({ t, alpha: st.alpha, theta: st.theta, v: airspeedOf(st) });
      if (own.length > 4 && own[0].t < t - OWN_KEEP_S) own.splice(0, own.findIndex((s) => s.t >= t - OWN_KEEP_S));
    }
  }

  /* the 2D section's center of pressure, ?lab only (it is not comparable with Barrowman's: validation L3),
     from the engine's developed chord-pass mean (force.mean), so a single swinging window is never shown */
  function latticeCp() {
    if (!lab) return NaN;
    const f = lattice && lattice.force;
    if (!f || lattice.fallback || f.developed === false) return NaN;
    if (Number.isFinite(f.age_ms) && f.age_ms > 3000) return NaN;            // stale: say nothing rather than an old number
    const m = f.mean !== undefined ? f.mean : f;                             // the engine's chord-pass mean; a stub's own force
    if (!m) return NaN;
    if (Number.isFinite(m.xcp_m)) return m.xcp_m;
    if (!section || !Number.isFinite(m.xcpCells) || !(section.cellM > 0)) return NaN;
    return (m.xcpCells - (section.xNoseCol || 0)) * section.cellM;          // cells to metres from the nose tip
  }

  function playState(st, evs) {
    const p = playback || {};
    const paused = typeof p.paused === 'boolean' ? p.paused : localPaused;
    const apo = eventOf(evs, 'apogee');
    const done = typeof p.done === 'boolean' ? p.done : !!(apo && st.t >= apo.t + 1.99);
    const running = typeof p.running === 'boolean' ? p.running : (st.phase && st.phase !== 'pad' && !done && !paused);
    const end = !!(p.atApogee === true);          // the page's end card: paused at apogee
    return { paused: !!paused && !done, running: !!running, done, phase: st.phase, end };
  }

  /* ------------------------------------------------------------ the chart's view (item 11) */
  /* What the strip chart shows this frame. Mode: 'pad' before ignition (the page's pre-flight
     of the flight LAUNCH would fly, playback.preview, dimmed), 'live' in flight, 'summary' from
     apogee on (the trace stops there). The word ticks read the page's beats (playback.beats: the
     run cards' definitions, from the pre-flight while the flight repeats it, from the live
     tracker at apogee otherwise); without them (the lab, a flight a visitor disturbed) they come
     from the trace, the settle only once the climb is over. The ghost is the page's
     playback.ghostTrace (the flight kept after the end card's fin toggle). */
  const finiteN = (v) => typeof v === 'number' && Number.isFinite(v);
  function readPlayback(name) { try { return playback ? playback[name] : null; } catch { return null; } }
  function marksOfPlan(pl) {
    const r = (pl && pl.result) || {}, b = (pl && pl.beats) || {};
    const from = finiteN(r.gustT) ? r.gustT : r.railT;
    return { source: 'plan', railExit: r.railT, gust: finiteN(r.gustT) ? [r.gustT] : [], peakT: r.peakT, peakAlpha: r.peakAlpha,
      settle: r.settle > 0 && finiteN(from) ? from + r.settle : NaN, settleS: r.settle, pitch60: b.pitch60, burnout: b.burnout, apogee: finiteN(r.apogeeT) ? r.apogeeT : b.apogee };
  }
  function marksOfBeats(b) {
    if (!b) return null;
    return { source: b.source, railExit: b.railExit, gust: finiteN(b.gust) ? [b.gust] : [], peakT: b.peakT, peakAlpha: b.peakAlpha,
      settle: b.settle, settleS: b.settleS, pitch60: b.pitch60, burnout: b.burnout, apogee: b.apogee };
  }
  /* the beats from the trace itself, with the run cards' rules (ascent, airspeed above 50 ft/s,
     2 deg): an estimate at the trace's 10 ms, used only when the page gives none */
  function marksOfTrace(evs, data, summaryMode) {
    const rx = eventOf(evs, 'railExit'), bo = eventOf(evs, 'burnout'), apo = eventOf(evs, 'apogee');
    const railT = rx ? rx.t : NaN, apoT = apo ? apo.t : Infinity;
    const gust = gustsFired.map((g) => g.t).filter((t) => finiteN(t));
    let peakAlpha = NaN, peakT = NaN, lastBig = NaN, t60 = NaN;
    if (finiteN(railT)) for (const s of data) {
      if (s.t > apoT + 1e-9) break;
      if (!finiteN(t60) && Math.abs(s.theta) > Math.PI / 3) t60 = s.t;
      if (s.t < railT || !(s.v > MAXAOA_MIN_V)) continue;
      const a = Math.abs(s.alpha) * DEG;
      if (!(a <= peakAlpha)) { peakAlpha = a; peakT = s.t; }
      if (a >= 2) lastBig = s.t;
    }
    const from = gust.length ? gust[gust.length - 1] : railT;
    const m0 = readDerived(flight && flight.derived, 'staticMargin');
    const settleS = summaryMode && finiteN(lastBig) && finiteN(from) ? Math.max(0, lastBig - from) : NaN;
    return { source: 'trace', railExit: railT, gust, peakT, peakAlpha, settle: finiteN(settleS) ? from + settleS : NaN, settleS,
      pitch60: m0 < 0 ? t60 : NaN, burnout: bo ? bo.t : NaN, apogee: apo ? apo.t : NaN };
  }
  /* The page plans the pad's flight after its run previews and on a setting change; a change it
     does not plan for (DISARM, a new armed gust) would leave the pad's chart empty, so the panel
     asks the page's planner (window.__field.planner, the same cache playback.preview reads) once
     per configuration, in idle time, a few seconds after mount. */
  const mountedAt = performance.now();
  let previewAsked = '', previewTimer = 0;
  function askPreview() {
    let pl = null; try { pl = window.__field && window.__field.planner; } catch { pl = null; }
    if (!pl || typeof pl.plan !== 'function' || !flight || !flight.config || previewTimer) return;
    const gust = readArmed() || 0;
    let key = '';
    try { key = typeof pl.keyOf === 'function' ? pl.keyOf(flight.config, gust) : ''; } catch { key = ''; }
    if (!key || key === previewAsked) return;
    const wait = Math.max(250, 4000 - (performance.now() - mountedAt));
    previewTimer = setTimeout(() => {
      previewTimer = 0;
      const run = () => {
        if (destroyed || !flight || flight.ignited) return;
        previewAsked = key;
        try { pl.plan(flight.config, { gustMph: readArmed() || 0 }); } catch (err) { console.warn('[panel] the pad preview failed', err); }
        wake();
      };
      if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 2000 }); else run();
    }, wait);
  }
  function chartView(st, evs, t, data) {
    const ignited = !!flight && (flight.ignited === true || (!!st.phase && st.phase !== 'pad'));
    const apo = eventOf(evs, 'apogee');
    const mode = !ignited ? 'pad' : apo && t >= apo.t - 1e-9 ? 'summary' : 'live';
    const fins = cfg().finScale;
    if (mode === 'pad') {
      const pv = readPlayback('preview');
      const preview = pv && Array.isArray(pv.trace) && pv.trace.length ? { trace: pv.trace, marks: marksOfPlan(pv) } : null;
      if (!preview && pv === null) askPreview();
      return { mode, preview, fins };
    }
    let marks = marksOfBeats(readPlayback('beats'));
    if (marks) {
      // the visitor's own gusts (FIRE GUST, G) get their ticks too; the page's armed gust is the beats' one
      for (const g of gustsFired) if (!g.api && finiteN(g.t) && !marks.gust.some((x) => Math.abs(x - g.t) < 1e-3)) marks.gust.push(g.t);
    } else marks = marksOfTrace(evs, data, mode === 'summary');
    const g = readPlayback('ghostTrace');
    const ghost = g && Array.isArray(g.trace) && g.trace.length ? { trace: g.trace, label: g.label, finScale: g.finScale, marks: marksOfBeats(g.beats) || {} } : null;
    return { mode, marks, ghost, fins };
  }

  /* the slow-AOA state: the big row's value at paper-a45 with AOA_SLOW_SUB as its sub-label, the peek
     cell's value at paper-a70 with the note as screen-reader text (panel.css [data-slow]) */
  let aoaSlow = false;
  function setAoaSlow(on) {
    if (on === aoaSlow) return;
    aoaSlow = on;
    const b = bigEls.get('aoa');
    if (b) { b.row.toggleAttribute('data-slow', on); write(b.sub, on ? AOA_SLOW_SUB : b.text); }
    if (peekAoaCell) peekAoaCell.toggleAttribute('data-slow', on);
    if (peekWhy) write(peekWhy, on ? `, ${AOA_SLOW_SUB.toLowerCase()}` : '');
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

    // at the page's apogee stop (the end card) the flight is already one 5 ms step into descent: the
    // panel calls it APOGEE, as the card does, until the visitor continues past it
    const atApo = !!(playback && playback.atApogee === true);
    const phaseShown = atApo ? 'apogee' : st.phase;
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
      const fm = f && f.mean !== undefined ? f.mean : f;                   // the developed chord-pass mean (force.mean); a stub's own force
      r('cm', fixed(lab && f && fm && !(f.age_ms > 3000) && f.developed !== false ? fm.cm : NaN, 3, true));   // ?lab only; a dash until the flow has developed and one chord pass of it is averaged
      const rv = rx && rx.state ? rx.state.v : NaN;
      r('railv', fixed(rv / M_PER_FT, 1));
      r('maxaoa', fixed(maxAoa.v * DEG, 2));
      const apo = eventOf(evs, 'apogee');
      r('apogee', fixed(apo && apo.state ? firstFinite(apo.state.apogee, apo.state.altitude, apo.state.y) / M_PER_FT : NaN, 1));
      write(tc, timeCode(t));
      write(phaseV, phaseLabel(phaseShown));
      write(peekV.phase, phaseLabel(phaseShown));
      write(peekV.tc, timeCode(t));
      // the run cards' and the chart's rule: under 50 ft/s near apogee the angle of attack says little
      // (the airspeed goes to zero there); the value steps back with a word, never hidden
      setAoaSlow(!!rx && t >= rx.t - 1e-9 && (atApo || st.phase === 'coast' || st.phase === 'descent') && Number.isFinite(V) && V < MAXAOA_MIN_V);
      const aoaDeg = st.alpha * DEG;
      const aoaS = fixed(aoaDeg, Math.abs(aoaDeg) >= 99.995 ? 1 : 2, true);   // the descent's ±180° keeps to the cell's seven characters
      write(peekV.aoa, aoaS === DASH ? DASH : `${aoaS}°`);
      write(peekV.margin, fixed(margin, 2, true));
      rail.dataset.phase = st.phase || 'pad';
      rail.classList.toggle('pn-unstable', Number.isFinite(margin) && margin < 0);
      writeLatticeLine(st);
      if (keyCpl.hidden !== !Number.isFinite(xl)) keyCpl.hidden = !Number.isFinite(xl);   // the key names the lattice ring only while the bar draws it
      if (folds.configure.open) refreshArmed();
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
      if (lab) controls.setInfo('latticeFlies', !st.lattice ? "NOT QUANTITATIVE / A 2D SECTION'S MOMENT, NOT CHARGER'S" : st.latticeActive === false ? 'MOMENT IN USE / BARROWMAN, NO FRESH LATTICE FORCE' : Number.isFinite(st.latticeCm) ? `MOMENT IN USE / LATTICE CM ${fixed(st.latticeCm, 2, true)}` : '');
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
      chart.setLive({ t, alpha: st.alpha, theta: st.theta, v: airspeedOf(st) });   // the traces end at the state the readouts show
      chart.setView(chartView(st, evs, t, data));
      chart.draw();
      stats.chartDraws++;
    }
    if (now - lastSummary >= SUMMARY_MS && (changed || force || forced)) { lastSummary = now; write(summary, chart.summary()); }

    // phase changes go to the live region (events are announced from the bus); the apogee stop is the
    // end card's to say (its status names the apogee), and CONTINUE then reads "Phase descent."
    if (phaseShown !== lastPhase) { if (lastPhase !== null && phaseShown && phaseShown !== 'apogee') announce(`Phase ${phaseLabel(phaseShown).toLowerCase()}.`, 'event'); lastPhase = phaseShown; }

    lastT = t; forced = false;
    stats.updates++; stats.lastUpdateMs = performance.now() - t0;
    return changed;
  }

  /* The lattice rows, in the header's words for every state it used to show: live, pending,
     paused for slow frames, off at tier 0, the graphics context lost, the 2D view. */
  function latticeWords() {
    if (!lattice) return { engine: 'LBM NOT ATTACHED', grid: 'NOT ATTACHED' };
    const why = lattice.fallback ? String(lattice.fallback) : '';
    if (!why) return null;
    if (/pending/i.test(why)) return { engine: 'LBM PENDING', grid: 'LATTICE PENDING' };
    if (/paused/i.test(why)) return { engine: 'LBM PAUSED', grid: 'PAUSED, SLOW FRAMES' };
    if (/tier 0/i.test(why)) return { engine: 'LBM OFF', grid: 'OFF AT TIER 0' };
    if (/context/i.test(why)) return { engine: '3D VIEW LOST', grid: 'CONTEXT LOST' };
    if (/no-?webgl2/i.test(why)) return { engine: scene && scene.fallback ? '2D VIEW' : 'LBM OFF', grid: 'OFF / NO WEBGL2' };
    if (/no 3d view/i.test(why)) return { engine: '2D VIEW', grid: 'OFF / NO 3D VIEW' };
    return { engine: 'LBM OFF', grid: `OFF / ${why.toUpperCase()}` };
  }
  function writeLatticeLine(st = (flight && flight.state) || {}) {
    const live = !!(lattice && !lattice.fallback);
    const words = latticeWords();
    // the two engines: the flight model always flies; the lattice runs, waits or is off
    write(engineV, `BARROWMAN 3-DOF / ${live ? 'LBM D2Q9' : words.engine}`);
    write(tierV, `T${Number.isFinite(governor.tier) ? governor.tier : tier}${governor.stats && governor.stats.pinned ? ' PINNED' : ''}`);
    // the inflow the section gets (lattice units and degrees), and whether it is held
    const s = live ? (lattice.stats || {}) : {};
    const a = live ? s.alphaDeg : NaN;
    write(uinV, fixed(live ? s.uIn : NaN, 3));
    write(ainV, fixed(a, 2, true));
    const held = live && Number.isFinite(a) && Math.abs(a) >= INFLOW_HELD_DEG && Number.isFinite(st.alpha) && Math.abs(st.alpha * DEG) > INFLOW_HELD_DEG;
    const tagWord = held ? 'EST' : 'SIM';
    const tagSpan = ainTag.firstChild;
    if (tagSpan.textContent !== tagWord) { tagSpan.textContent = tagWord; tagSpan.dataset.src = tagWord; }
    write(latNote, held ? `INFLOW HELD AT ${fixed(a, 0, true)}° EST / THE FLIGHT IS PAST IT` : '');
    if (latNote.hidden !== !held) latNote.hidden = !held;
    // the grid line carries a measured rate (steps per second): SIM while the lattice runs
    if (gridTag.hidden !== !live) gridTag.hidden = !live;
    if (!live) { write(gridV, `${words.grid}${bench && bench.label ? ` / ${bench.label}` : ''}`); return; }
    const ls = lattice.stats || (bus.state['lattice:stats'] || {});
    const grid = Array.isArray(ls.grid) ? ls.grid.join('×') : typeof ls.grid === 'string' ? ls.grid.replace('x', '×') : (ls.grid && ls.grid.cols ? `${ls.grid.cols}×${ls.grid.rows}` : DASH);
    const sps = Number.isFinite(ls.stepsPerSecond) ? Math.round(ls.stepsPerSecond) : DASH;
    const tt = Number.isFinite(ls.tier) ? ls.tier : tier;
    write(gridV, `${grid} / ${sps} STEPS/S / T${tt} / ${String(ls.precision || DASH).toUpperCase()}${bench && bench.label ? ` / ${bench.label}` : ''}`);
  }

  /* ------------------------------------------------------------ page hooks */
  function hook(name) {
    if (typeof hooks[name] === 'function') return hooks[name];
    try { const f = window.__field; if (f && typeof f[name] === 'function') return f[name].bind(f); } catch { /* no page handles */ }
    return null;
  }
  const pageEl = (sel) => { try { return document.querySelector(sel); } catch { return null; } };
  const runEl = (key) => pageEl(`[data-run-go="${String(key).replace(/["\\]/g, '')}"]`);
  const canRun = () => !!hook('startRun') || !!pageEl('[data-run-go]');
  function startRun(key) {
    const fn = hook('startRun');
    if (fn) { fn(key); return true; }
    const b = runEl(key);
    if (b && !b.disabled) { b.click(); return true; }
    return false;
  }
  /* the armed gust in mph: 0 none, null when the page tells nothing */
  function readArmed() {
    const fn = hook('armedGust');
    if (fn) { let v = NaN; try { v = Number(fn()); } catch { v = NaN; } return Number.isFinite(v) ? Math.max(0, v) : null; }
    const badge = pageEl('[data-badge-gust]');
    if (!badge) return null;
    if (badge.hidden) return 0;
    const m = /(\d+(?:\.\d+)?)\s*MPH/i.exec((pageEl('[data-badge-gust-t]') || badge).textContent || '');
    return m ? Number(m[1]) : null;
  }
  const canDisarm = () => !!hook('disarmGust') || !!pageEl('[data-disarm]');
  function disarmGust() {
    const fn = hook('disarmGust');
    if (fn) { fn(); return true; }
    const b = pageEl('[data-disarm]');
    if (b) { b.click(); return true; }
    return false;
  }
  let armedShown;
  function refreshArmed(force = false) {
    const v = readArmed();
    if (!force && v === armedShown) return;
    armedShown = v;
    controls.setArmed(v);
    if (bench) return;                 // the benchmark holds DISARM off with the rest
    controls.setEnabled('disarmGust', v > 0 && canDisarm(), v === null && !canDisarm() ? 'NEEDS THE PAGE' : '');
  }

  /* ------------------------------------------------------------ live region, 1 Hz */
  /* kind 'event' (flight events, phase changes) is dropped while the page narrates
     (muteEvents, or a live peek caption); answers to the visitor's own actions and the
     narration itself always speak */
  let mutedByPage = false, mutedByCaption = false;
  const eventsMuted = () => mutedByPage || mutedByCaption || readPlayback('narrating') === true;
  function announce(msg, kind = 'action') {
    if (kind === 'event' && eventsMuted()) return;
    if (announceQ.some((m) => m.msg === msg)) return;
    announceQ.push({ msg, kind });
    if (announceQ.length > ANNOUNCE_KEEP) announceQ.splice(0, announceQ.length - ANNOUNCE_KEEP);
    if (announceTimer) return;
    const wait = Math.max(kind === 'event' ? EVENT_DEFER_MS : 0, ANNOUNCE_MS - (performance.now() - lastAnnounce));
    announceTimer = setTimeout(flush, wait);
  }
  /* an event line queued before the page began to narrate (or before a live caption) is dropped here,
     not read a second late under the caption */
  function flush() {
    announceTimer = 0;
    if (destroyed) return;
    const out = eventsMuted() ? announceQ.filter((m) => m.kind !== 'event') : announceQ;
    announceQ = [];
    if (!out.length) return;
    live.textContent = out.map((m) => m.msg).join(' ');
    lastAnnounce = performance.now();
  }
  const dropQueuedEvents = () => { announceQ = announceQ.filter((m) => m.kind !== 'event'); };

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
      case 'launch': {
        // phone: the sheet collapses before the flight starts, so the stage is the screen
        const followFocus = launchFocus(source);
        collapseForLaunch();
        // a launch that starts a new flight (not a resume): let the page hand the lattice
        // the section for the fins now set before the flight starts (item 1b)
        const fst = (flight && flight.state) || {};
        const fresh = (flight && flight.ignited === false) || fst.phase === 'pad' || !!(playback && (playback.atApogee || playback.done));
        if (fresh) { const prep = hook('prepareLaunch'); if (prep) { try { prep(); } catch (err) { console.error('[panel] prepareLaunch failed', err); } } }
        localPaused = false; call(playback, 'launch');
        if (followFocus) focusPeekPlay();
        break;
      }
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
        if (ok !== false && flight && flight.state && Number.isFinite(flight.state.t)) gustsFired.push({ t: flight.state.t, api: source === 'api' });
        // the page's armed gust at rail exit arrives through press() (source 'api'): an event
        // of the flight, quiet while the page narrates; a visitor's FIRE GUST or G always speaks
        announce(ok !== false ? `Gust fired, ${fixed(mph, 1)} miles per hour.` : flight && flight.done ? 'No gust: the flight has ended.' : 'No gust: launch first.', source === 'api' ? 'event' : 'action');
        break;
      }
      case 'flick': {
        if (!Number.isFinite(value) || value === 0) return;
        const ok = call(flight, 'flick', value);
        announce(ok !== false ? `Flick, pitch rate ${value < 0 ? 'minus' : 'plus'} ${Math.abs(value * DEG).toFixed(1)} degrees per second.` : flight && flight.done ? 'No flick: the flight has ended.' : 'No flick: it works after rail exit.');
        break;
      }
      case 'view': {
        // a view picked by the visitor (click, keys 1 to 4, panel.set) ends AUTO
        if (source !== 'auto' && controls.get('viewAuto')) { controls.set('viewAuto', false); paintAutoNote(); }
        if (source !== 'auto') viewPicked = true;
        applyView(value, source === 'auto');
        break;
      }
      case 'viewAuto': {
        // the AUTO button (or panel.set('viewAuto', true)): back to the page's latest pick;
        // panel.set('viewAuto', false) keeps the view on screen as a pick
        viewPicked = !value;
        if (value && autoWant && autoWant !== controls.get('view')) { controls.set('view', autoWant); applyView(autoWant, true); }
        break;
      }
      case 'section': call(scene, 'setSliceView', value); bus.emit('ui:view', { view: controls.get('view'), section: value }); break;
      case 'camera': call(scene, 'setCamera', value); bus.emit('ui:camera', { preset: value }); break;
      case 'markers': call(scene, 'setMarkers', value); break;
      case 'latticeFlies': call(flight, 'useLattice', value); break;
      // RUNS: the page configures, resets and launches (startRun); keyboard focus stays
      // on the run button when the page moved it to the stage
      case 'run': {
        const btn = rail.querySelector(`[data-run-key="${String(value).replace(/["\\]/g, '')}"]`);
        const hadFocus = !!btn && document.activeElement === btn;
        collapseForLaunch();              // the page's startRun presses 'launch' too; collapse first either way
        let ok = false;
        try { ok = startRun(value); } catch (err) { console.error('[panel] startRun failed', err); }
        if (!ok) return;
        if (hadFocus && btn.isConnected && !btn.closest('[inert]') && (document.activeElement === root || document.activeElement === document.body || !document.activeElement)) btn.focus({ preventScroll: true });
        break;
      }
      case 'disarmGust': {
        const btn = rail.querySelector('[data-act="disarmGust"]');
        const hadFocus = !!btn && document.activeElement === btn;
        let ok = false;
        try { ok = disarmGust(); } catch (err) { console.error('[panel] disarmGust failed', err); }
        refreshArmed(true);
        if (ok) announce('Gust disarmed.');
        // DISARM is now disabled: keep keyboard focus beside it, on FIRE GUST
        if (hadFocus) { const fire = rail.querySelector('[data-act="fireGust"]'); if (fire && !fire.disabled) fire.focus({ preventScroll: true }); }
        break;
      }
      default: return;
    }
    if (['launch', 'pause', 'reset', 'step', 'fireGust', 'flick', 'fins', 'section'].includes(name)) { call(scene, 'wake'); }
    if (name === 'view' || name === 'viewAuto') paintAutoNote();
    for (const fn of [...listeners]) { try { fn({ name, value, source }); } catch (err) { console.error('[panel] onControl listener failed', err); } }
    wake();
  });
  /* the true playback rate, as the playback reports it: REAL TIME, SLOW MOTION 1/n (a
     ramp's 1/20 too), HOLD while the page freezes the flight (rate 0 or playback.holding) */
  function paintRate() {
    const r = playback && typeof playback.rate === 'number' ? playback.rate : controls.get('rate');
    const holding = !!(playback && playback.holding === true);
    rateLine.textContent = holding || r === 0 ? 'HOLD' : !(r > 0) || !Number.isFinite(r) ? DASH : r >= 1 ? 'REAL TIME' : `SLOW MOTION 1/${Math.round(1 / r)}`;
  }
  paintRate();
  function showPlaybackRate() {
    if (!playback || typeof playback.rate !== 'number') return;
    const holding = playback.holding === true;
    controls.showRate(holding ? 0 : playback.rate, { auto: playback.auto === true });
    paintRate();
  }

  /* ------------------------------------------------------------ view AUTO */
  let autoOffered = false, autoWant = null, viewPicked = !!(opts.defaults && typeof opts.defaults.view === 'string');
  function applyView(value, auto) {
    call(lattice, 'setView', value); call(scene, 'setView', value);
    bus.emit('ui:view', { view: value, section: controls.get('section'), auto: !!auto });
  }
  const VIEW_SAY = { smoke: 'SMOKE', pressure: 'PRESSURE', vorticity: 'VORTICITY', speed: 'SPEED' };
  function paintAutoNote() {
    controls.setInfo('view', autoOffered && controls.get('viewAuto') ? `AUTO / SHOWING ${VIEW_SAY[controls.get('view')] || String(controls.get('view')).toUpperCase()}` : '');
  }
  function offerAuto() {
    if (autoOffered) return;
    autoOffered = true;
    controls.offerAuto(true);
    controls.set('viewAuto', !viewPicked);
    paintAutoNote();
  }
  function setAutoView(v) {
    if (!['smoke', 'pressure', 'vorticity', 'speed'].includes(v)) return false;
    autoWant = v;
    offerAuto();
    if (!controls.get('viewAuto')) return false;
    if (v !== controls.get('view')) { controls.set('view', v); controls.emit('view', v, 'auto'); }
    return true;
  }
  if (opts.autoView === true) offerAuto();

  /* ------------------------------------------------------------ phone: launch hand-off */
  let peekFocusWanted = 0;          // a launch while the stage was scrolled away: focus peek play once it is back
  function collapseForLaunch() { if (sheet !== 'collapsed') setSheet('collapsed'); }
  /* keyboard focus follows a launch to peek play (phone layout) when it was on the stage,
     inside the panel or the dock, or the launch came from a key; never from elsewhere */
  function launchFocus(source) {
    if (!phoneMq.matches) return false;
    const a = document.activeElement;
    return source === 'key' || a === root || (!!a && a !== document.body && (root.contains(a) || rail.contains(a) || (!!dock && dock.contains(a))));
  }
  function focusPeekPlay() {
    const btn = controls.peekPlay;
    if (!phoneMq.matches || !btn.isConnected) return;
    // a jump back to the stage (startRun from the Runs section) has already moved the page;
    // the observer reports it on a later frame, so read the stage's box now
    if (away) {
      const r = root.getBoundingClientRect(), vh = innerHeight || 1;
      const shown = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
      if (r.height > 0 && shown >= 0.2 * Math.min(r.height, vh)) { away = false; syncInert(); }
    }
    if (away || peek.hasAttribute('inert')) { peekFocusWanted = performance.now(); return; }
    peekFocusWanted = 0;
    try { btn.focus({ preventScroll: true }); } catch { /* not focusable now */ }
  }

  /* ------------------------------------------------------------ phone: the beat caption */
  let peekCapText = '', capLiveAt = 0;
  function setPeekCaption(text, { live = false } = {}) {
    const t = text === null || text === undefined ? '' : String(text).replace(/\s+/g, ' ').trim();
    const was = peekCapText;
    peekCapText = t;
    if (peekCap.textContent !== t) peekCap.textContent = t;
    peekCap.hidden = !t;
    fitPeekCaption();
    mutedByCaption = !!(t && live);
    if (mutedByCaption) dropQueuedEvents();
    if (t && live && t !== was) { announce(t, 'narration'); capLiveAt = performance.now(); }
    return t;
  }
  function muteEvents(on = true) { mutedByPage = !!on; if (mutedByPage) dropQueuedEvents(); return mutedByPage; }
  /* the caption sits beside the FINS toggle in up to three lines; one that needs more room
     takes the toggle's place too (data-peek-cap="wide"), so a number and its tag are never cut */
  function fitPeekCaption() {
    if (!peekCapText) { delete rail.dataset.peekCap; return; }
    rail.dataset.peekCap = '1';
    if (!phoneMq.matches || !peekCap.clientWidth) return;
    if (peekCap.scrollHeight > peekCap.clientHeight + 1) rail.dataset.peekCap = 'wide';
    // the toggle stepped aside: keep keyboard focus beside it, on play
    if (rail.dataset.peekCap === 'wide' && document.activeElement === controls.peekFins) { try { controls.peekPlay.focus({ preventScroll: true }); } catch { /* gone */ } }
  }

  /* the page's benchmark (?bench, C2 section 9.6): every control off with the reason, the
     shortcuts off, the label on the lattice line; attach({bench: null}) gives them back */
  const BENCH_WHY = 'BENCHMARK RUNNING';
  let benchOff = [];
  function setBench(next) {
    if (next) {
      const label = typeof next.label === 'string' && next.label ? next.label : BENCH_WHY;
      if (!bench) {
        // every control the visitor could press, off (the sheet's handle stays, so the sheet still opens)
        benchOff = [...rail.querySelectorAll('button, input, select')].filter((el) => el !== handle && !el.disabled);
        for (const el of benchOff) el.disabled = true;
      }
      bench = { label };
      write(benchNote, BENCH_WHY); benchNote.hidden = false;
      rail.dataset.bench = '1';
    } else if (bench) {
      bench = null;
      for (const el of benchOff) if (el.isConnected) el.disabled = false;
      benchOff = [];
      benchNote.hidden = true;
      delete rail.dataset.bench;
    }
    forced = true;
  }
  /* availability of the groups that need a lattice or a 3D scene */
  function syncEnabled() {
    if (bench) return;                 // the benchmark holds every control off until it ends
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
    controls.setEnabled('run', canRun(), 'NEEDS THE PAGE');
    refreshArmed(true);
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
  }, { idleFrames: 20, poll: () => { if (folds.configure.open) refreshArmed(); return !!(flight && flight.state && flight.state.t !== lastT); },
    // C2-24: every 250 ms only while a flight is under way (the page steps it); on the pad and after the end the
    // bus events, the controls and the page's wake() reach the panel, so a 1 s safety poll is enough
    pollMs: () => (flight && flight.state && flight.state.phase && flight.state.phase !== 'pad' && !flight.done ? 250 : 1000) });
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
      announce(msg + '.', 'event');
    }
    wake();
  }));
  offs.push(bus.on('flight:reset', () => {
    busEvents = []; own = []; mirror = []; histCache = { key: '', data: [] }; maxAoa = { v: NaN, t: NaN, scanned: -Infinity }; localPaused = false; gustsFired = [];
    announceQ = []; if (announceTimer) { clearTimeout(announceTimer); announceTimer = 0; }   // a new run: nothing from the old one is read out
    wake();
  }));
  offs.push(bus.on('flight:config', () => { sync(); bar.outlineKey = ''; wake(); }));
  offs.push(bus.on('lattice:stats', () => { forced = true; if (!loop.running) update(performance.now(), true); }));
  offs.push(governor.subscribe(({ tier: t }) => { tier = t; syncEnabled(); resizeCanvases(); wake(); }));
  // shortcuts apply only while the stage is on screen or focus is inside the panel, so
  // Space scrolls the page everywhere else (Method, Configuration, Runs)
  const keysActive = () => !bench && controls.get('keys') !== false && (keysOn || root.contains(document.activeElement) || (!!dock && dock.contains(document.activeElement)));
  const offKeys = opts.keyboard === false ? () => {} : controls.bindKeys(document, { active: keysActive });
  const onMq = () => { syncInert(); syncEnabled(); resizeCanvases(); fitPeekCaption(); wake(); };
  phoneMq.addEventListener('change', onMq);
  reducedMq.addEventListener('change', onMq);

  function resizeCanvases() {
    const dpr = governor.dpr();
    chart.resize(dpr); bar.resize(dpr);
    forced = true;
  }
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { resizeCanvases(); update(performance.now(), true); }) : null;
  if (ro) { ro.observe(chartCanvas); ro.observe(barCanvas); }
  // the peek row's width (rotation, a narrower window): refit the caption
  const roPeek = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (peekCapText) fitPeekCaption(); }) : null;
  if (roPeek) roPeek.observe(peek);
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
    // a launch from far down the page: once the stage is back, focus peek play (if focus
    // still rests on the stage or nowhere), within 8 s of the launch (a smooth scroll on a
    // busy phone can take that long)
    if (peekFocusWanted && !away) {
      const fresh = performance.now() - peekFocusWanted < 8000;
      const a = document.activeElement;
      peekFocusWanted = 0;
      if (fresh && phoneMq.matches && (a === root || a === document.body || !a)) { try { controls.peekPlay.focus({ preventScroll: true }); } catch { /* not focusable */ } }
    }
  }, { threshold: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1] }) : null;
  io && io.observe(root);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (!destroyed) { forced = true; update(performance.now(), true); fitPeekCaption(); } });

  /* folds: a toggle that differs from the state set here is the visitor's, and is kept */
  const onFold = (e) => {
    const d = e.currentTarget, key = d.dataset.fold;
    if (d.open === foldWant[key]) return;
    foldWant[key] = d.open;
    saveFold(key, d.open);
    if (key === 'configure' && d.open) refreshArmed(true);
    wake();
  };
  for (const [key] of FOLDS) folds[key].addEventListener('toggle', onFold);
  function setOpen(key, open) {
    if (!folds[key]) return false;
    foldWant[key] = !!open;
    folds[key].open = !!open;
    if (key === 'configure' && open) refreshArmed(true);
    return true;
  }
  /* KEYS is hidden on coarse pointers (panel.css) until a key is pressed: a tablet with a
     keyboard still reaches the SHORTCUTS switch */
  const onFirstKey = (e) => {
    if (!e.key || e.ctrlKey || e.metaKey || (e.key.length !== 1 && e.key !== 'Tab')) return;
    rail.dataset.keyboard = '1';
    document.removeEventListener('keydown', onFirstKey, true);
  };
  document.addEventListener('keydown', onFirstKey, true);

  setSheet(opts.sheet === 'expanded' ? 'expanded' : 'collapsed');
  resizeCanvases();
  update(performance.now(), true);

  /* re-read control values from flight.config without calling any setter */
  function sync() {
    const v = fromConfig();
    for (const [k, val] of Object.entries(v)) controls.set(k, val);
    showPlaybackRate();
  }

  /* programmatic control: updates the UI and makes the same calls a visitor would */
  const NAMES = { fins: 'fins', cg: 'cg', rail: 'rail', angle: 'angle', wind: 'wind', gust: 'gust', speed: 'rate', rate: 'rate', view: 'view', viewAuto: 'viewAuto', section: 'section', cam: 'camera', camera: 'camera', markers: 'markers', lattice: 'latticeFlies', latticeFlies: 'latticeFlies' };
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
      if (n === 'viewAuto' && value) offerAuto();   // asking for AUTO offers it
      if (!controls.set(n, value)) return false;    // a value no click could produce changes nothing
      fire(n, controls.get(n));
      return true;
    },
    press(name, value) { fire(name, value); },      // launch, pause, reset, step, fireGust, flick (rad/s)
    setSheet,
    get sheet() { return sheet; },
    setPeekCaption,
    get peekCaption() { return peekCapText; },
    muteEvents,
    setAutoView,
    get viewAuto() { return !!controls.get('viewAuto'); },
    setOpen,
    get open() { return Object.fromEntries(FOLDS.map(([key]) => [key, !!folds[key].open])); },
    attach(next = {}) {
      for (const k of ['startRun', 'disarmGust', 'armedGust', 'prepareLaunch']) if (k in next) hooks[k] = next[k];
      if (next.autoView === true) offerAuto();
      if ('flight' in next) { flight = next.flight; gustsFired = []; busEvents = []; own = []; mirror = []; histCache = { key: '', data: [] }; maxAoa = { v: NaN, t: NaN, scanned: -Infinity }; lastT = NaN; bar.outlineKey = ''; }
      if ('lattice' in next) lattice = next.lattice;
      if ('scene' in next && next.scene !== scene) { scene = next.scene; bindScene(); }
      if ('playback' in next) playback = next.playback;
      if ('geometry' in next) { geometry = next.geometry; bar.outlineKey = ''; }
      if ('section' in next) section = next.section;
      if ('bench' in next) setBench(next.bench);
      syncEnabled(); sync(); wake();
    },
    setSection(s) { section = s; wake(); },
    onControl(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    get state() {
      const st = (flight && flight.state) || {};
      return {
        t: st.t, phase: st.phase, sheet, layout: rail.dataset.layout, away, keys: keysActive(), tier, reduced: reducedMq.matches,
        open: Object.fromEntries(FOLDS.map(([key]) => [key, !!folds[key].open])), armed: controls.armed, runs: canRun(),
        viewAuto: !!controls.get('viewAuto'), autoOffered, autoWant, peekCaption: peekCapText, muted: { page: mutedByPage, caption: mutedByCaption }, aoaSlow, queued: announceQ.map((m) => `${m.kind}:${m.msg}`),
        loop: loop.running, paused: playback && typeof playback.paused === 'boolean' ? playback.paused : localPaused,
        values: { ...controls.values }, chartPoints: chart.points, chartScaleDeg: chart.scale, chart: chart.layout,
        maxAoaDeg: maxAoa.v * DEG, events: events().map((e) => `${e.name}@${Number(e.t).toFixed(3)}`),
        stats: { ...stats }, summary: summary.textContent, live: live.textContent, bench: bench ? { ...bench } : null,
      };
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      loop.destroy(); offs.forEach((f) => f()); offKeys();
      if (offCam) { try { offCam(); } catch { /* the scene is gone */ } offCam = null; }
      phoneMq.removeEventListener('change', onMq); reducedMq.removeEventListener('change', onMq);
      ro && ro.disconnect(); io && io.disconnect(); roPeek && roPeek.disconnect();
      if (dprMq) { dprMq.removeEventListener('change', onDpr); dprMq = null; }
      if (announceTimer) clearTimeout(announceTimer);
      if (previewTimer) clearTimeout(previewTimer);
      rail.removeEventListener('keydown', onKeyEsc);
      document.removeEventListener('keydown', onFirstKey, true);
      for (const [key] of FOLDS) folds[key].removeEventListener('toggle', onFold);
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
