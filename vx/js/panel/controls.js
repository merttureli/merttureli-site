/* controls.js: the panel's controls as plain DOM, with no knowledge of the flight.
   buildControls() returns the sections (playback, configuration, view, keyboard
   legend) for panel.js to place, plus a compact play button for the phone sheet's
   collapsed row. Every change goes out through on(fn) as {name, value, source}
   with source 'ui', 'key' or 'api'; panel.js turns those into flight, scene,
   lattice and playback calls.

   Names and values:
     launch, pause, reset          buttons (value undefined)
     rate                          playback rate, one of RATES (fraction of real time)
     step                          seconds of flight time per press (reduced motion)
     fins                          fin scale k, 0..1 (CAD planform at 1)
     cg                            CG from the nose, inches
     rail                          rail length, inches
     angle                         launch angle, degrees from vertical, + downrange
     wind                          steady wind, mph
     gust                          gust peak, mph (the slider); fireGust fires it
     view                          smoke | pressure | vorticity | speed
     section                       through | between
     camera                        side | quarter | chase | pad
     markers, latticeFlies         booleans
     flick                         pitch-rate impulse, rad/s (+ toward +x), from the FLICK buttons
   set(name, value) returns false and changes nothing when the control cannot hold
   the value (a view that is not one of VIEWS, a rate that is not positive, NaN).
   Keyboard (bindKeys): L launch, R reset, space pause, 1 to 4 views, G gust. */

export const RATES = [1 / 32, 1 / 8, 1 / 2, 1];
export const VIEWS = ['smoke', 'pressure', 'vorticity', 'speed'];
export const SECTIONS = ['through', 'between'];
export const CAMERAS = ['side', 'quarter', 'chase', 'pad'];
export const FLICK_RADPS = 1;      // rad/s per FLICK button press (EST: a firm nudge, about a third of a hard drag on the view)
export const KEYMAP = { l: 'launch', r: 'reset', ' ': 'pause', g: 'fireGust', 1: 'view:smoke', 2: 'view:pressure', 3: 'view:vorticity', 4: 'view:speed' };

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
export function buildControls({ lab = false, defaults = {}, refs = {}, ranges = {}, level = 3 } = {}) {
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
    const out = h('output', { class: 'pn-v', for: inputId });
    const tag = refs[name] ? h('span', { class: 'pn-tag', text: refs[name] }) : null;
    const input = h('input', { type: 'range', id: inputId, class: 'pn-range', min: s.min, max: s.max, step: s.step, name });
    const row = h('div', { class: 'pn-ctl', dataset: { ctl: name } },
      h('label', { class: 'pn-ctl-head', for: inputId }, h('span', { class: 'pn-k', text: s.label }), out, h('span', { class: 'pn-u', text: s.unit }), tag || h('span', { class: 'pn-tag' })),
      input);
    const paint = (v) => {
      out.value = fmt(v, s.dec, s.signed);
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
    function set(v) {
      if (coerce) v = coerce(v);
      if (!free && !options.some((o) => o[0] === v)) return false;
      values[name] = v; btns.forEach((b, i) => b.setAttribute('aria-pressed', String(options[i][0] === v)));
      return true;
    }
    set(values[name]);
    reg.set(name, { get: () => values[name], set, enable: (on) => { btns.forEach((b) => { b.disabled = !on; }); }, els: [group] });
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

  /* ---- playback */
  const launchB = button('launch', 'LAUNCH', { key: 'L', keyLabel: 'L', cls: 'pn-btn-primary' });
  const pauseB = button('pause', 'PAUSE', { key: 'Space', keyLabel: 'SPC' });
  pauseB.setAttribute('aria-pressed', 'false');
  const resetB = button('reset', 'RESET', { key: 'R', keyLabel: 'R' });
  const rateSeg = segment('rate', 'Playback rate', RATES.map((r) => [r, rateText(r), `Playback at ${rateWords(r)}`]), { cls: 'pn-seg-4', coerce: nearestRate });
  const stepRow = h('div', { class: 'pn-steps', hidden: true },
    button('step', 'STEP 0.1 S', { value: 0.1, label: 'Step the flight forward 0.1 seconds' }),
    button('step', 'STEP 1 S', { value: 1, label: 'Step the flight forward 1 second' }));
  const playback = h('section', { class: 'pn-sec pn-sec-play', 'aria-labelledby': `${id}-h-play` },
    Object.assign(heading('PLAYBACK'), { id: `${id}-h-play` }),
    h('div', { class: 'pn-btns' }, launchB, pauseB, resetB),
    h('div', { class: 'pn-ctl-head pn-ctl-head-seg' }, h('span', { class: 'pn-k', text: 'RATE' }), h('span', { class: 'pn-v', dataset: { rate: '' } }), h('span', { class: 'pn-u', text: 'OF REAL TIME' })),
    rateSeg, stepRow);
  const rateOut = playback.querySelector('[data-rate]');
  const paintRate = () => { rateOut.textContent = rateText(values.rate); };
  paintRate();
  const rateReg = reg.get('rate'); const rateSet = rateReg.set; rateReg.set = (v) => { const ok = rateSet(v); paintRate(); return ok; };
  listeners.add(({ name }) => { if (name === 'rate') paintRate(); });

  /* ---- configuration */
  const finPresets = segment('finPreset', 'Fin presets', [[0, 'NONE', 'No fins'], [0.5, 'HALF', 'Half-size fins'], [1, 'FULL', 'Full CAD fins']], { cls: 'pn-seg-3', free: true });
  values.finPreset = values.fins;
  const fireB = button('fireGust', 'FIRE GUST', { key: 'G', keyLabel: 'G', cls: 'pn-btn-wide' });
  // FLICK from the keyboard: the same pitch-rate impulse a drag on the view gives, in fixed steps
  const flickDeg = (FLICK_RADPS * 180 / Math.PI).toFixed(1);
  const flickBs = [-1, 1].map((sg) => {
    const b = button('flick', `FLICK ${sg < 0 ? MINUS : '+'}`, { value: sg * FLICK_RADPS, label: `Flick: pitch rate ${sg < 0 ? 'minus' : 'plus'} ${flickDeg} degrees per second, nose toward ${sg < 0 ? 'minus' : 'plus'} x` });
    b.dataset.value = String(sg);
    return b;
  });
  const config = h('section', { class: 'pn-sec pn-sec-config', 'aria-labelledby': `${id}-h-config` },
    Object.assign(heading('CONFIGURATION'), { id: `${id}-h-config` }),
    range('fins'), finPresets, range('cg'), range('rail'), range('angle'), range('wind'), range('gust'), fireB,
    h('p', { class: 'pn-hint' }, h('span', { class: 'pn-hint-k', text: 'FLICK' }), ' Drag the rocket sideways and let go: the release sets a pitch rate. The buttons give a fixed one.'),
    h('div', { class: 'pn-ctl-head pn-ctl-head-seg' }, h('span', { class: 'pn-k', text: 'FLICK STEP' }), h('span', { class: 'pn-v', text: `±${flickDeg}` }), h('span', { class: 'pn-u', text: 'DEG/S' }), h('span', { class: 'pn-tag', text: 'EST' })),
    h('div', { class: 'pn-btns pn-btns-flick' }, flickBs),
    note('flick'));
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
  void gustReg;

  /* ---- view */
  const viewSeg = segment('view', 'Lattice view', VIEWS.map((v, i) => [v, v.toUpperCase(), `${v} view, key ${i + 1}`]), { cls: 'pn-seg-4 pn-seg-tight', keyFor: (v) => String(VIEWS.indexOf(v) + 1) });
  const sectionSeg = segment('section', 'Section plane', [['through', 'THROUGH FINS', 'Section through the fins'], ['between', 'BETWEEN FINS', 'Section between the fins']], { cls: 'pn-seg-2' });
  const camSeg = segment('camera', 'Camera preset', CAMERAS.map((c) => [c, c.toUpperCase(), `${c} camera`]), { cls: 'pn-seg-4 pn-seg-tight' });
  const markersT = toggle('markers', 'MARKERS', 'Markers: CG, CP, wind and force arrows');
  const latticeT = toggle('latticeFlies', 'LATTICE FLIES IT', 'Lattice moment flies the rocket instead of Barrowman (lab)');
  latticeT.hidden = !lab;
  const view = h('section', { class: 'pn-sec pn-sec-view', 'aria-labelledby': `${id}-h-view` },
    Object.assign(heading('VIEW'), { id: `${id}-h-view` }),
    h('p', { class: 'pn-sub', text: 'FLOW FIELD' }), viewSeg, note('view'),
    h('p', { class: 'pn-sub', text: 'SECTION' }), sectionSeg, note('section'),
    h('p', { class: 'pn-sub', text: 'CAMERA' }), camSeg, note('camera'),
    h('div', { class: 'pn-btns pn-btns-2' }, markersT, latticeT));

  const legend = h('p', { class: 'pn-keys' },
    h('span', { class: 'pn-keys-k', text: 'KEYS' }),
    ...[['L', 'LAUNCH'], ['SPC', 'PAUSE'], ['R', 'RESET'], ['1–4', 'VIEW'], ['G', 'GUST']].map(([k, t]) => h('span', { class: 'pn-keys-i' }, h('kbd', { class: 'pn-kbd', text: k }), ` ${t}`)));

  /* compact play button for the phone sheet's collapsed row */
  const peekPlay = h('button', { type: 'button', class: 'pn-peek-play', 'aria-label': 'Launch' }, h('span', { class: 'pn-peek-icon', 'aria-hidden': 'true' }));
  let playState = { running: false, paused: false, phase: 'pad', done: false };
  peekPlay.addEventListener('click', () => { if (playState.running && !playState.paused) emit('pause'); else if (playState.paused) emit('pause'); else emit('launch'); });

  function setPlayState(st) {
    playState = Object.assign(playState, st);
    const { running, paused } = playState;
    pauseB.querySelector('.pn-btn-t').textContent = paused ? 'RESUME' : 'PAUSE';
    pauseB.setAttribute('aria-pressed', String(!!paused));
    const mode = running && !paused ? 'pause' : paused ? 'resume' : 'launch';
    if (peekPlay.dataset.mode !== mode) {
      peekPlay.dataset.mode = mode;
      peekPlay.setAttribute('aria-label', mode === 'pause' ? 'Pause' : mode === 'resume' ? 'Resume' : 'Launch');
    }
  }
  setPlayState({});

  function setReduced(on) { stepRow.hidden = !on; }

  function setEnabled(name, on, text = '') {
    const r = reg.get(name); if (r) r.enable(on);
    const n = view.querySelector(`[data-note="${name}"]`) || config.querySelector(`[data-note="${name}"]`);
    if (n) { n.hidden = on || !text; n.textContent = on ? '' : text; }
  }

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
    playback, config, view, legend, peekPlay,
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    emit,
    get(name) { return values[name]; },
    set(name, value) { const r = reg.get(name); if (!r) return false; return r.set(value) !== false; },
    values,
    setEnabled, setReduced, setPlayState, bindKeys,
    destroy() { listeners.clear(); reg.clear(); },
  };
}
