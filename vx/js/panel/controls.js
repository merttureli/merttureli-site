/* controls.js: the panel's controls as plain DOM, with no knowledge of the flight.
   buildControls() returns the pieces panel.js places: the top level (playback, the
   RUNS row, the FINS presets) and the bodies of the folded groups (CONFIGURE, VIEW,
   KEYS), plus a compact play button for the phone sheet's collapsed row. Every
   change goes out through on(fn) as {name, value, source} with source 'ui', 'key'
   or 'api'; panel.js turns those into flight, scene, lattice, playback and page
   calls.

   Names and values:
     launch, pause, reset          buttons (value undefined)
     run                           a RUNS button: value is the run key (full, half,
                                   none, wind, gust); panel.js hands it to the page
     disarmGust                    DISARM: drop the gust armed for rail exit (page)
     rate                          playback rate, one of RATES (fraction of real time)
     step                          seconds of flight time per press (reduced motion)
     fins                          fin scale k, 0..1 (CAD planform at 1)
     cg                            CG from the nose, inches
     rail                          rail length, inches
     angle                         launch angle, degrees from vertical, + downrange
     wind                          steady wind, mph
     gust                          gust peak, mph (the slider); fireGust fires it
     view                          smoke | pressure | vorticity | speed (the view shown)
     viewAuto                      AUTO (boolean): the page picks the view (panel.js
                                   setAutoView); a pressed view ends it
     section                       through | between
     camera                        side | quarter | chase | pad
     markers, latticeFlies         booleans
     flick                         pitch-rate impulse, rad/s (+ toward +x), from the FLICK buttons
   set(name, value) returns false and changes nothing when the control cannot hold
   the value (a view that is not one of VIEWS, a rate that is not positive, NaN).
   showNone(name, on) presses no button of a segment while its value is kept (the
   camera group while the visitor orbits freely); setInfo(name, text) shows a note
   under a control while it is enabled (setEnabled's text shows while it is not).
   setArmed(mph | 0 | null) paints the ARMED AT RAIL EXIT row and enables DISARM
   only while a gust is armed (null: the page gives no armed state).
   offerAuto(on) shows the AUTO button at the head of the view group; while AUTO is
   on, no view is pressed and the one shown is marked data-live (panel.css).
   showRate(rate, {auto}) paints the true playback rate: the RATE head reads it (HOLD
   at 0, AUTO while the page sets it) and the segment presses an entry only when the
   rate is exactly one of RATES (a ramped 1/20 presses none instead of a wrong 1/32).
   peekFins: the phone sheet's FINS toggle beside play (WITH, WITHOUT, or HALF and
   any other scale as mixed); a press sets the fins to 0 or 1 through 'fins'.
   Source tags: tagEl() boxes every tag except SIM, which stays plain text (one quiet
   style for the live numbers); the full tag word stays in the text either way.
   Keyboard (bindKeys): L launch, R reset, space pause, 1 to 4 views, G gust; the
   SHORTCUTS switch in the keys legend ('keys', boolean, kept in localStorage) turns
   all of them off. */

export const RATES = [1 / 32, 1 / 8, 1 / 2, 1];
export const VIEWS = ['smoke', 'pressure', 'vorticity', 'speed'];
export const SECTIONS = ['through', 'between'];
export const CAMERAS = ['side', 'quarter', 'chase', 'pad'];
export const FLICK_RADPS = 1;      // rad/s per FLICK button press (EST: a firm nudge, about a third of a hard drag on the view)
export const KEYMAP = { l: 'launch', r: 'reset', ' ': 'pause', g: 'fireGust', 1: 'view:smoke', 2: 'view:pressure', 3: 'view:vorticity', 4: 'view:speed' };
const KEYS_STORE = 'charger-field-keys';   // localStorage: 'off' when the visitor switched the single-key shortcuts off
/* The RUNS row: the five runs of the page's Runs section, in its order. The key is what
   the page's startRun(key) and its [data-run-go] buttons take. The names carry no
   numbers, so they need no source tags; the run cards below the stage give the
   conditions with theirs. */
export const RUNS = [
  { key: 'full', n: '01', label: 'FULL', name: 'full fins in a crosswind' },
  { key: 'half', n: '02', label: 'HALF', name: 'half fins in a crosswind' },
  { key: 'none', n: '03', label: 'NONE', name: 'no fins in a crosswind' },
  { key: 'wind', n: '04', label: 'WIND', name: 'full fins in a stronger crosswind' },
  { key: 'gust', n: '05', label: 'GUST', name: 'full fins, still air, a gust at rail exit' },
];
const GUST_EST_MPH = 5 / 0.44704;
const finsWord = (k) => (Math.abs(k - 1) < 0.005 ? 'WITH' : k < 0.005 ? 'WITHOUT' : Math.abs(k - 0.5) < 0.005 ? 'HALF' : `×${(+k).toFixed(2)}`);          // EST: the 5 m/s of the FIELD 3 test (11.2 mph); an armed gust of this size carries the EST tag

/* Ranges. Units: inches for CG and rail, degrees, mph. Bounds:
   rail 36 to 94 in is FIELD 3's 0.9 to 2.4 m slider; wind 0 to 20 mph is its 0 to
   9 m/s (20.1 mph); gust 0 to 30 mph (EST, about 13 m/s, a strong gust for a
   1 kg rocket); CG 12 to 40 in spans the CAD airframe's forward and aft thirds so
   the CG can be moved behind the CP to show an unstable rocket. */
const RANGE_SPEC = {
  fins:  { label: 'FIN SCALE', min: 0, max: 1.5, step: 0.01, dec: 2, unit: '×', words: 'times the CAD fin' },   // 1.5 is the flight and geometry limit (EST)
  cg:    { label: 'CG FROM NOSE', min: 12, max: 40, step: 0.1, dec: 1, unit: 'IN', words: 'inches' },
  rail:  { label: 'RAIL LENGTH', min: 36, max: 94, step: 1, dec: 0, unit: 'IN', words: 'inches' },
  angle: { label: 'LAUNCH ANGLE', min: -10, max: 10, step: 0.5, dec: 1, unit: 'DEG', words: 'degrees', signed: true },
  wind:  { label: 'WIND', min: 0, max: 20, step: 0.5, dec: 1, unit: 'MPH', words: 'miles per hour' },
  gust:  { label: 'GUST PEAK', min: 0, max: 30, step: 0.5, dec: 1, unit: 'MPH', words: 'miles per hour' },
};

let uid = 0;
const MINUS = '−';

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const k of kids.flat()) if (k !== null && k !== undefined && k !== false) el.append(k);
  return el;
}
const fmt = (v, dec, signed) => { const s = Math.abs(v).toFixed(dec); const z = Number(s) === 0; return v < 0 && !z ? MINUS + s : (signed && !z ? '+' + s : s); };
const rateText = (r) => (r >= 1 ? '1' : '1/' + Math.round(1 / r));
/* A source tag. text is the tag word, optionally followed by a value ('PAGE 22.0'):
   the word goes in .pn-src[data-src], boxed by panel.css unless it is SIM. */
export function tagEl(text, attrs = {}) {
  const t = String(text || '').trim();
  const sp = t.indexOf(' ');
  const word = sp < 0 ? t : t.slice(0, sp), rest = sp < 0 ? '' : t.slice(sp);
  return h('span', Object.assign({ class: 'pn-tag' }, attrs), word ? h('span', { class: 'pn-src', dataset: { src: word }, text: word }) : null, rest || null);
}
/* the playback rate a value stands for: the nearest entry of RATES on a log scale,
   or undefined for anything that is not a finite positive number */
function nearestRate(v) {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n) || !(n > 0)) return undefined;
  return RATES.reduce((best, r) => (Math.abs(Math.log(r / n)) < Math.abs(Math.log(best / n)) ? r : best), RATES[0]);
}
const rateWords = (r) => (r >= 1 ? 'real time' : `one ${({ 2: 'half', 8: 'eighth', 32: 'thirty-second' })[Math.round(1 / r)] || 'n-th'} of real time`);

/* defaults: {fins, cg, rail, angle, wind, gust, rate, view, section, camera, markers}
   refs: tagged reference values shown beside a control, e.g. {cg: 'PAGE 22.0'}. */
export function buildControls({ lab = false, defaults = {}, refs = {}, ranges = {}, level = 3, runs = RUNS } = {}) {
  const id = `pn${++uid}`;
  const listeners = new Set();
  const reg = new Map();            // name -> {get, set, enable, els}
  const values = Object.assign({ fins: 1, cg: 22, rail: 72, angle: 0, wind: 0, gust: 11, rate: 1 / 8, view: 'smoke', section: 'through', camera: 'side', markers: true, latticeFlies: false }, defaults);
  const emit = (name, value, source = 'ui') => { for (const fn of [...listeners]) { try { fn({ name, value, source }); } catch (err) { console.error('[panel] control listener failed', err); } } };

  /* ---- builders */
  function button(name, text, { key, keyLabel, value, cls = '', label } = {}) {
    const b = h('button', { type: 'button', class: `pn-btn ${cls}`.trim(), 'aria-keyshortcuts': key, 'aria-label': label, dataset: { act: name } },
      h('span', { class: 'pn-btn-t', text }), keyLabel ? h('kbd', { class: 'pn-kbd', 'aria-hidden': 'true', text: keyLabel }) : null);
    b.addEventListener('click', () => emit(name, value !== undefined ? value : values[name]));
    return b;
  }

  function range(name) {
    const s = Object.assign({}, RANGE_SPEC[name], ranges[name] || {});
    const inputId = `${id}-${name}`;
    // The value is plain text hidden from assistive technology: the input's
    // aria-valuetext already speaks it, and an <output> is a polite live region
    // that would repeat every value on every input event (FIELD.md section 2: no
    // live region faster than 1 Hz). The name is the visible label alone; the
    // tagged reference value describes the slider.
    const out = h('span', { class: 'pn-v', 'aria-hidden': 'true' });
    const tag = refs[name] ? tagEl(refs[name], { id: `${inputId}-ref` }) : null;
    const input = h('input', { type: 'range', id: inputId, class: 'pn-range', min: s.min, max: s.max, step: s.step, name, 'aria-labelledby': `${inputId}-k`, 'aria-describedby': tag ? `${inputId}-ref` : null });
    const row = h('div', { class: 'pn-ctl', dataset: { ctl: name } },
      h('label', { class: 'pn-ctl-head', for: inputId }, h('span', { class: 'pn-k', id: `${inputId}-k`, text: s.label }), out, h('span', { class: 'pn-u', text: s.unit }), tag || h('span', { class: 'pn-tag' })),
      input);
    const paint = (v) => {
      out.textContent = fmt(v, s.dec, s.signed);
      input.setAttribute('aria-valuetext', `${fmt(v, s.dec, s.signed).replace(MINUS, 'minus ')} ${s.words}`);
      input.style.setProperty('--pn-fill', `${(100 * (v - s.min)) / (s.max - s.min)}%`);
    };
    const set = (v) => { if (v === null || v === undefined || v === '') return false; v = Math.max(s.min, Math.min(s.max, Number(v))); if (!Number.isFinite(v)) return false; values[name] = v; input.value = String(v); paint(v); return true; };
    input.addEventListener('input', () => { values[name] = input.valueAsNumber; paint(values[name]); emit(name, values[name]); });
    set(values[name]);
    reg.set(name, { get: () => values[name], set, enable: (on) => { input.disabled = !on; }, els: [row] });
    return row;
  }

  /* set(v) accepts only one of the options (after coerce, when given) and returns
     false otherwise; a free segment (the fin presets, which mirror the slider) takes
     any value and simply presses none when it matches no option. */
  function segment(name, label, options, { cls = '', keyFor, coerce = null, free = false } = {}) {
    const btns = options.map(([value, text, aria]) => {
      const key = keyFor ? keyFor(value) : null;
      const b = h('button', { type: 'button', class: 'pn-seg-b', 'aria-pressed': 'false', 'aria-label': aria, 'aria-keyshortcuts': key, dataset: { value: String(value) } },
        h('span', { text }), key ? h('kbd', { class: 'pn-kbd', 'aria-hidden': 'true', text: key }) : null);
      b.addEventListener('click', () => { set(value); emit(name, value); });
      return b;
    });
    const group = h('div', { class: `pn-seg ${cls}`.trim(), role: 'group', 'aria-label': label, dataset: { ctl: name } }, btns);
    let none = false;                 // showNone: nothing pressed, the value kept
    const paint = () => btns.forEach((b, i) => b.setAttribute('aria-pressed', String(!none && options[i][0] === values[name])));
    function set(v) {
      if (coerce) v = coerce(v);
      if (!free && !options.some((o) => o[0] === v)) return false;
      values[name] = v; none = false; paint();
      return true;
    }
    set(values[name]);
    reg.set(name, { get: () => values[name], set, enable: (on) => { btns.forEach((b) => { b.disabled = !on; }); }, els: [group], showNone: (on) => { none = !!on; paint(); } });
    return group;
  }

  function toggle(name, text, label) {
    const b = h('button', { type: 'button', class: 'pn-btn pn-toggle', 'aria-pressed': 'false', 'aria-label': label, dataset: { act: name } }, h('span', { class: 'pn-btn-t', text }), h('span', { class: 'pn-state', 'aria-hidden': 'true' }));
    const set = (v) => { values[name] = !!v; b.setAttribute('aria-pressed', String(!!v)); b.querySelector('.pn-state').textContent = v ? 'ON' : 'OFF'; return true; };
    b.addEventListener('click', () => { set(!values[name]); emit(name, values[name]); });
    set(values[name]);
    reg.set(name, { get: () => values[name], set, enable: (on) => { b.disabled = !on; }, els: [b] });
    return b;
  }

  const heading = (text) => h(`h${level}`, { class: 'pn-h', text });
  const note = (name) => { const p = h('p', { class: 'pn-note', hidden: true, dataset: { note: name } }); return p; };
  const notes = new Map();          // name -> {enabled, why (shown while disabled), info (shown while enabled)}

  /* ---- playback */
  const launchB = button('launch', 'LAUNCH', { key: 'L', keyLabel: 'L', cls: 'pn-btn-primary' });
  const pauseB = button('pause', 'PAUSE', { key: 'Space', keyLabel: 'SPC' });
  pauseB.setAttribute('aria-pressed', 'false');
  const resetB = button('reset', 'RESET', { key: 'R', keyLabel: 'R' });
  // accessible names start with the visible text (WCAG 2.5.3), then say what it means
  const rateSeg = segment('rate', 'Playback rate', RATES.map((r) => [r, rateText(r), `${rateText(r)}, playback at ${rateWords(r)}`]), { cls: 'pn-seg-4', coerce: nearestRate });
  const stepRow = h('div', { class: 'pn-steps', hidden: true },
    button('step', 'STEP 0.1 S', { value: 0.1, label: 'Step 0.1 s, the flight forward 0.1 seconds' }),
    button('step', 'STEP 1 S', { value: 1, label: 'Step 1 s, the flight forward 1 second' }));
  const playback = h('section', { class: 'pn-sec pn-sec-play', 'aria-labelledby': `${id}-h-play` },
    Object.assign(heading('PLAYBACK'), { id: `${id}-h-play` }),
    h('div', { class: 'pn-btns' }, launchB, pauseB, resetB),
    h('div', { class: 'pn-ctl-head pn-ctl-head-seg' }, h('span', { class: 'pn-k', dataset: { rateK: '' }, text: 'RATE' }), h('span', { class: 'pn-v', dataset: { rate: '' } }), h('span', { class: 'pn-u', dataset: { rateU: '' }, text: 'OF REAL TIME' })),
    rateSeg, stepRow);
  const rateOut = playback.querySelector('[data-rate]'), rateK = playback.querySelector('[data-rate-k]'), rateU = playback.querySelector('[data-rate-u]');
  /* the rate shown: the true one when the playback says (showRate), else the pressed one */
  let shownRate = null, rateAuto = false;
  const paintRate = () => {
    const r = shownRate === null ? values.rate : shownRate;
    const moving = r > 0 && Number.isFinite(r);
    rateOut.textContent = moving ? rateText(r) : r === 0 ? 'HOLD' : '—';
    rateU.hidden = !moving;                 // "OF REAL TIME" belongs to a rate, not to HOLD or the dash
    rateK.textContent = rateAuto ? 'RATE / AUTO' : 'RATE';
  };
  paintRate();
  const rateReg = reg.get('rate'); const rateSet = rateReg.set; rateReg.set = (v) => { const ok = rateSet(v); if (ok) { shownRate = null; rateReg.showNone(false); } paintRate(); return ok; };
  listeners.add(({ name }) => { if (name === 'rate') { shownRate = null; rateAuto = false; rateReg.showNone(false); paintRate(); } });
  /* showRate(r, {auto}): the playback's own rate. An exact entry of RATES is pressed (and
     kept as the value); any other rate (a ramp's 1/20, a HOLD at 0) presses none. */
  function showRate(r, { auto = false } = {}) {
    rateAuto = !!auto;
    const n = Number(r);
    const exact = Number.isFinite(n) && n > 0 ? RATES.find((x) => Math.abs(x - n) < 1e-9) : undefined;
    if (exact !== undefined) { rateSet(exact); rateReg.showNone(false); }
    else rateReg.showNone(true);
    shownRate = Number.isFinite(n) && n >= 0 ? n : null;
    paintRate();
    return exact !== undefined;
  }

  /* ---- configuration */
  const finPresets = segment('finPreset', 'Fins', [[0, 'NONE', 'None, no fins'], [0.5, 'HALF', 'Half, half-size fins'], [1, 'FULL', 'Full, the CAD fins']], { cls: 'pn-seg-3', free: true });
  values.finPreset = values.fins;
  const fireB = button('fireGust', 'FIRE GUST', { key: 'G', keyLabel: 'G' });
  // FLICK from the keyboard: the same pitch-rate impulse a drag on the view gives, in fixed steps
  const flickDeg = (FLICK_RADPS * 180 / Math.PI).toFixed(1);
  const flickBs = [-1, 1].map((sg) => {
    const b = button('flick', `FLICK ${sg < 0 ? MINUS : '+'}`, { value: sg * FLICK_RADPS, label: `Flick ${sg < 0 ? MINUS : '+'}, pitch rate ${sg < 0 ? 'minus' : 'plus'} ${flickDeg} degrees per second, nose toward ${sg < 0 ? 'minus' : 'plus'} x` });
    b.dataset.value = String(sg);
    return b;
  });
  // DISARM: the page arms a gust for rail exit (run 05, ?gust=); the row shows it and
  // DISARM drops it. FIRE GUST fires the slider's gust now, armed or not.
  const disarmB = button('disarmGust', 'DISARM', { label: 'Disarm, the gust armed for rail exit' });
  const armedV = h('span', { class: 'pn-v', text: '—' }), armedU = h('span', { class: 'pn-u' }), armedT = h('span', { class: 'pn-tag' });
  const armedRow = h('div', { class: 'pn-ctl-head pn-ctl-head-seg pn-armed', dataset: { ctl: 'armed' } }, h('span', { class: 'pn-k', text: 'ARMED AT RAIL EXIT' }), armedV, armedU, armedT);
  // the body of the CONFIGURE fold (panel.js wraps it; the summary names it)
  const config = h('div', { class: 'pn-fold-c pn-sec-config' },
    range('fins'), range('cg'), range('rail'), range('angle'), range('wind'), range('gust'),
    armedRow, h('div', { class: 'pn-btns pn-btns-gust' }, fireB, disarmB), note('disarmGust'),
    h('p', { class: 'pn-hint' }, h('span', { class: 'pn-hint-k', text: 'FLICK' }), ' Drag the rocket sideways and let go: the release sets a pitch rate. The buttons give a fixed one.'),
    h('div', { class: 'pn-ctl-head pn-ctl-head-seg' }, h('span', { class: 'pn-k', text: 'FLICK STEP' }), h('span', { class: 'pn-v', text: `±${flickDeg}` }), h('span', { class: 'pn-u', text: 'DEG/S' }), tagEl('EST')),
    h('div', { class: 'pn-btns pn-btns-flick' }, flickBs),
    note('flick'));
  // top level: the fin presets under their own heading
  const fins = h('section', { class: 'pn-sec pn-sec-fins', 'aria-labelledby': `${id}-h-fins` },
    Object.assign(heading('FINS'), { id: `${id}-h-fins` }), finPresets);
  // top level: the RUNS row (each press configures, resets and launches through the page)
  const runBs = runs.map((r) => {
    const b = h('button', { type: 'button', class: 'pn-run', 'aria-label': `${r.n} ${r.label}, launch run ${r.n}: ${r.name}`, dataset: { runKey: r.key } },
      h('span', { class: 'pn-run-n', text: r.n }), h('span', { class: 'pn-run-t', text: r.label }));
    b.addEventListener('click', () => emit('run', r.key));
    return b;
  });
  const runsSec = h('section', { class: 'pn-sec pn-sec-runs', 'aria-labelledby': `${id}-h-runs` },
    Object.assign(heading('RUNS'), { id: `${id}-h-runs` }),
    h('div', { class: 'pn-runs', role: 'group', 'aria-labelledby': `${id}-h-runs`, dataset: { ctl: 'run' } }, runBs),
    note('run'));
  // presets mirror the fin slider; a preset press sets the slider
  listeners.add(({ name, value, source }) => {
    if (name === 'finPreset' && source !== 'mirror') { reg.get('fins').set(value); emit('fins', value, source); }
    if (name === 'fins') reg.get('finPreset').set(value);
  });
  const finsReg = reg.get('fins'); const finsSet = finsReg.set; finsReg.set = (v) => { const ok = finsSet(v); reg.get('finPreset').set(values.fins); return ok; };
  reg.get('finPreset').set(values.fins);    // first render: press the preset that matches the starting fin scale
  const gustReg = reg.get('gust');
  reg.set('fireGust', { get: () => values.gust, set() { return false; }, enable: (on) => { fireB.disabled = !on; }, els: [fireB] });
  reg.set('flick', { get: () => FLICK_RADPS, set() { return false; }, enable: (on) => { flickBs.forEach((b) => { b.disabled = !on; }); }, els: flickBs });
  reg.set('run', { get: () => undefined, set() { return false; }, enable: (on) => { runBs.forEach((b) => { b.disabled = !on; }); }, els: runBs });
  reg.set('disarmGust', { get: () => undefined, set() { return false; }, enable: (on) => { disarmB.disabled = !on; }, els: [disarmB] });
  void gustReg;
  /* the armed gust: mph > 0 armed, 0 none, null when the page says nothing */
  let armed = null;
  function setArmed(mph) {
    armed = mph === null || mph === undefined || !Number.isFinite(Number(mph)) ? null : Math.max(0, Number(mph));
    const on = armed > 0;
    armedV.textContent = armed === null ? '—' : on ? fmt(armed, 1) : 'NONE';
    armedU.textContent = on ? 'MPH' : '';
    armedT.replaceChildren(...(on && Math.abs(armed - GUST_EST_MPH) < 0.05 ? [tagEl('EST').firstChild] : []));
    return armed;
  }
  setArmed(null);

  /* ---- view */
  const viewSeg = segment('view', 'Lattice view', VIEWS.map((v, i) => [v, v.toUpperCase(), `${v} view, key ${i + 1}`]), { cls: 'pn-seg-4 pn-seg-tight', keyFor: (v) => String(VIEWS.indexOf(v) + 1) });
  /* AUTO heads the view group once the page offers it (offerAuto): the page then picks
     the view by the flight's phase. While it is on, no view is pressed and the one on
     screen is marked data-live; a pressed view (click, keys 1 to 4, panel.set) ends it. */
  values.viewAuto = false;
  const autoB = h('button', { type: 'button', class: 'pn-seg-b pn-seg-auto', 'aria-pressed': 'false', 'aria-label': 'Auto, the page picks the view by the phase of the flight', hidden: true, dataset: { value: 'auto' } }, h('span', { text: 'AUTO' }));
  viewSeg.prepend(autoB);
  const viewReg = reg.get('view');
  const paintAuto = () => {
    const on = !!values.viewAuto;
    autoB.setAttribute('aria-pressed', String(on));
    viewReg.showNone(on);
    for (const b of viewSeg.querySelectorAll('.pn-seg-b:not(.pn-seg-auto)')) { if (on && b.dataset.value === values.view) b.dataset.live = '1'; else delete b.dataset.live; }
  };
  const viewSet = viewReg.set; viewReg.set = (v) => { const ok = viewSet(v); paintAuto(); return ok; };
  autoB.addEventListener('click', () => { values.viewAuto = true; paintAuto(); emit('viewAuto', true); });
  reg.set('viewAuto', { get: () => values.viewAuto, set(v) { values.viewAuto = !!v && !autoB.hidden; paintAuto(); return true; }, enable: (on) => { autoB.disabled = !on; }, els: [autoB] });
  const viewEnable = viewReg.enable; viewReg.enable = (on) => { viewEnable(on); autoB.disabled = !on; };
  function offerAuto(on) { autoB.hidden = !on; if (!on) values.viewAuto = false; paintAuto(); }
  const sectionSeg = segment('section', 'Section plane', [['through', 'THROUGH FINS', 'Through fins, the section through the fins'], ['between', 'BETWEEN FINS', 'Between fins, the section between the fins']], { cls: 'pn-seg-2' });
  const camSeg = segment('camera', 'Camera preset', CAMERAS.map((c) => [c, c.toUpperCase(), `${c} camera`]), { cls: 'pn-seg-4 pn-seg-tight' });
  const markersT = toggle('markers', 'MARKERS', 'Markers: CG, CP, wind and force arrows');
  const latticeT = toggle('latticeFlies', 'LATTICE FLIES IT', "Lattice flies it (lab, not quantitative): the 2D section's moment replaces Barrowman's");
  latticeT.hidden = !lab;
  // the body of the VIEW fold
  const view = h('div', { class: 'pn-fold-c pn-sec-view' },
    h('p', { class: 'pn-sub', text: 'FLOW FIELD' }), viewSeg, note('view'),
    h('p', { class: 'pn-sub', text: 'SECTION' }), sectionSeg, note('section'),
    h('p', { class: 'pn-sub', text: 'CAMERA' }), camSeg, note('camera'),
    h('div', { class: 'pn-btns pn-btns-2' }, markersT, latticeT), lab ? note('latticeFlies') : null);

  /* The SHORTCUTS switch (WCAG 2.1.4): off, no single-key shortcut fires (bindKeys).
     The choice is kept per visitor in localStorage where the browser allows it; a
     private window or blocked storage simply starts with the shortcuts on. */
  try { values.keys = localStorage.getItem(KEYS_STORE) !== 'off'; } catch { values.keys = true; }
  const keysT = toggle('keys', 'SHORTCUTS', 'Shortcuts: the single-key shortcuts L, Space, R, 1 to 4 and G');
  keysT.classList.add('pn-keys-t');
  listeners.add(({ name, value }) => { if (name === 'keys') { try { localStorage.setItem(KEYS_STORE, value ? 'on' : 'off'); } catch { /* storage blocked: the switch still holds for this visit */ } } });
  // the body of the KEYS fold (its summary is the KEYS label)
  const legend = h('div', { class: 'pn-fold-c pn-keys' },
    h('div', { class: 'pn-keys-head' }, keysT),
    ...[['L', 'LAUNCH'], ['SPC', 'PAUSE'], ['R', 'RESET'], ['1 to 4', 'VIEW'], ['G', 'GUST']].map(([k, t]) => h('span', { class: 'pn-keys-i' }, h('kbd', { class: 'pn-kbd', text: k }), ` ${t}`)));

  /* compact play button for the phone sheet's collapsed row. At the end card (paused at
     apogee) it launches again, as LAUNCH and L do there; PAUSE and the card resume. */
  const peekPlay = h('button', { type: 'button', class: 'pn-peek-play', 'aria-label': 'Launch' }, h('span', { class: 'pn-peek-icon', 'aria-hidden': 'true' }));
  let playState = { running: false, paused: false, phase: 'pad', done: false, end: false };
  peekPlay.addEventListener('click', () => { const m = peekPlay.dataset.mode; emit(m === 'launch' ? 'launch' : 'pause'); });
  /* the phone sheet's FINS toggle beside play: WITH (fin scale 1) or WITHOUT (0); any
     other scale (HALF from run 02, the slider) shows as mixed and a press gives WITH */
  const peekFinsV = h('span', { class: 'pn-peek-fins-v', 'aria-hidden': 'true' });
  const peekFins = h('button', { type: 'button', class: 'pn-peek-fins', 'aria-pressed': 'true', 'aria-label': 'Fins' },
    h('span', { class: 'pn-peek-fins-k', text: 'FINS' }), peekFinsV);
  const paintPeekFins = () => {
    const k = Number(values.fins);
    const full = Math.abs(k - 1) < 0.005, none = k < 0.005;
    peekFins.setAttribute('aria-pressed', full ? 'true' : none ? 'false' : 'mixed');
    peekFinsV.textContent = finsWord(k);
    peekFins.dataset.fins = full ? 'with' : none ? 'without' : 'mixed';
  };
  peekFins.addEventListener('click', () => {
    const k = Number(values.fins);
    const next = Math.abs(k - 1) < 0.005 ? 0 : 1;
    reg.get('fins').set(next);
    emit('fins', next);
  });
  paintPeekFins();
  listeners.add(({ name }) => { if (name === 'fins') paintPeekFins(); });
  { const fr = reg.get('fins'); const fs = fr.set; fr.set = (v) => { const ok = fs(v); paintPeekFins(); return ok; }; const fe = fr.enable; fr.enable = (on) => { fe(on); peekFins.disabled = !on; }; }

  function setPlayState(st) {
    playState = Object.assign(playState, st);
    const { running, paused, end } = playState;
    pauseB.querySelector('.pn-btn-t').textContent = paused ? 'RESUME' : 'PAUSE';
    pauseB.setAttribute('aria-pressed', String(!!paused));
    const mode = end ? 'launch' : running && !paused ? 'pause' : paused ? 'resume' : 'launch';
    if (peekPlay.dataset.mode !== mode) {
      peekPlay.dataset.mode = mode;
      peekPlay.setAttribute('aria-label', mode === 'pause' ? 'Pause' : mode === 'resume' ? 'Resume' : 'Launch');
    }
  }
  setPlayState({});

  function setReduced(on) { stepRow.hidden = !on; }

  function paintNote(name) {
    const n = view.querySelector(`[data-note="${name}"]`) || config.querySelector(`[data-note="${name}"]`) || runsSec.querySelector(`[data-note="${name}"]`);
    if (!n) return;
    const st = notes.get(name) || {};
    const text = (st.enabled === false && st.why) || st.info || '';   // the reason it is off wins; otherwise the info note
    if (n.textContent !== text) n.textContent = text;
    if (n.hidden !== !text) n.hidden = !text;
  }
  function setEnabled(name, on, text = '') {
    const r = reg.get(name); if (r) r.enable(on);
    notes.set(name, Object.assign(notes.get(name) || {}, { enabled: !!on, why: text }));
    paintNote(name);
  }
  function setInfo(name, text = '') {
    notes.set(name, Object.assign(notes.get(name) || {}, { info: text || '' }));
    paintNote(name);
  }
  function showNone(name, on) { const r = reg.get(name); if (r && r.showNone) r.showNone(on); }

  /* keyboard: document-level, ignored while typing or with modifiers; space is left
     to a focused button, checkbox or link so native activation still works. active()
     says whether the shortcuts apply at all (the panel turns them off while the stage
     is scrolled away, so Space scrolls the page again); when it returns false the key
     is left alone, default action included. Held keys never repeat an action. */
  function bindKeys(target = document, { active = null } = {}) {
    const onKey = (e) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target instanceof Element ? e.target : null;
      const tag = t ? t.tagName : '';
      if (t && (t.isContentEditable || tag === 'TEXTAREA' || tag === 'SELECT' || (tag === 'INPUT' && !['range', 'checkbox', 'radio', 'button'].includes(t.type)))) return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const action = KEYMAP[k];
      if (!action) return;
      if (values.keys === false) return;          // the SHORTCUTS switch is off: the key keeps its default action
      if (typeof active === 'function' && !active()) return;
      if (k === ' ' && t && (tag === 'BUTTON' || tag === 'A' || tag === 'INPUT' || tag === 'SUMMARY' || t.getAttribute('role') === 'button')) return;
      if (e.repeat) { if (action === 'pause') e.preventDefault(); return; }   // a held Space neither scrolls nor toggles
      if (action.startsWith('view:')) {
        const v = action.slice(5);
        const b = viewSeg.querySelector(`[data-value="${v}"]`);
        if (b && b.disabled) return;
        e.preventDefault(); reg.get('view').set(v); emit('view', v, 'key'); return;
      }
      if (action === 'fireGust' && fireB.disabled) return;
      e.preventDefault();
      emit(action, action === 'fireGust' ? values.gust : undefined, 'key');
    };
    target.addEventListener('keydown', onKey);
    return () => target.removeEventListener('keydown', onKey);
  }

  return {
    playback, runs: runsSec, fins, config, view, legend, peekPlay, peekFins,
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    emit,
    get(name) { return values[name]; },
    set(name, value) { const r = reg.get(name); if (!r) return false; return r.set(value) !== false; },
    values,
    setEnabled, setInfo, showNone, setReduced, setPlayState, setArmed, bindKeys, offerAuto, showRate,
    get armed() { return armed; },
    names() { return [...reg.keys()]; },
    destroy() { listeners.clear(); reg.clear(); },
  };
}
