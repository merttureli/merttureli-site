/* main.js: the integrator of the CHARGER field study (FIELD.md section 8).

   It owns no physics and no drawing. It builds the collaborators, wires them and
   drives one animation loop:
     flight   vx/js/flight/flight.js   createFlight, stepped here (frame seconds x rate)
     geometry vx/js/geom/geom.js       the baked CAD measurement (synchronous, no fetch)
     panel    vx/js/panel/panel.js     readouts, controls, strip chart, phone sheet
     scene    vx/js/scene/scene.js     the 3D stage, imported only when WebGL is there
     fallback vx/js/panel/fallback.js  the 2D side view when there is no WebGL2
     lattice  vx/js/lattice/lattice.js through attachLattice() below (the LATTICE SLOT)

   Init order: governor pin (?tier) -> geometry -> flight (URL config applied) ->
   playback -> panel (lattice stub 'lattice pending') -> scene (dynamic import) or the
   2D fallback -> scene.ready -> attachLattice -> ?hold or ?autolaunch. The runs and the
   configuration table are computed with silent preview flights in idle time.

   Playback (handed to the panel): {rate, setRate, launch, pause, resume, step, reset,
   paused, running, done}. The rate is automatic until the visitor or ?speed picks one:
   1/8 of real time until 3 s after burnout, then real time. The flight is stepped with
   min(frame seconds, 0.25) x rate; the flight itself takes at most 0.25 s per call.

   URL state (read once at load; the panel's settings are written back with
   history.replaceState): ?fins=0..1.5|none|half|full ?cg=<in> ?rail=<in> ?angle=<deg>
   ?wind=<mph> ?gust=<mph, fired at rail exit> ?speed=1/32|1/8|1/2|1 ?view=smoke|
   pressure|vorticity|speed ?section=through|between ?cam=side|quarter|chase|pad
   ?seed=<n> ?autolaunch=1 ?hold=<alpha deg> ?tier=0..3 ?lab (the panel reads it).

   ?hold=<deg>: the flight's public API cannot pin alpha, so the hold flies a scripted
   crosswind (the ?wind given, else 10 mph) and freezes flight time at the first
   instant after liftoff where |alpha| has fallen to the asked value; the lattice keeps
   running on that state. The stage shows HOLD with the alpha actually held.

   Reduced motion: no autolaunch, no smooth scrolling; the panel shows STEP buttons and
   the scene drops camera transitions on its own (tier 0). */
import { bus } from './core/bus.js';
import { governor, webglAvailable } from './core/governor.js';
import { createFlight } from './flight/flight.js';
import { getBakedGeometry, loadFieldGeometry } from './geom/geom.js';
import { mountPanel } from './panel/panel.js';
import { createFallbackView } from './panel/fallback.js';

/* ------------------------------------------------------------------ constants */
const DEG = 180 / Math.PI;
const RAD = Math.PI / 180;
const M_PER_IN = 0.0254;               // STD, exact
const M_PER_FT = 0.3048;               // STD, exact
const MPS_PER_MPH = 0.44704;           // STD, exact
const RATES = [1 / 32, 1 / 8, 1 / 2, 1];
const AUTO_SLOW = 1 / 8;               // EST: replay rate until AUTO_AFTER_BURNOUT_S after burnout
const AUTO_FAST = 1;
const AUTO_AFTER_BURNOUT_S = 3;
const MAX_FRAME_S = 0.25;              // a long frame never advances more than this of screen time (the flight's own per-call clamp)
const STEP_CHUNK_S = 0.25;             // the flight's own per-call clamp
const PAGE_CG_IN = 22;                 // PAGE
const EST_RAIL_IN = 72;                // EST, a 6 ft rail
const GUST_DEFAULT_MPH = 5 / MPS_PER_MPH;   // EST: the 5 m/s of the FIELD 3 test, 11.2 mph
const HOLD_WIND_MPH = 10;              // EST: the crosswind run's wind, used when ?hold has no ?wind
const AUTOLAUNCH_WAIT_MS = 8000;       // launch anyway if the 3D scene is not ready by then
const reducedMq = matchMedia('(prefers-reduced-motion: reduce)');
const phoneMq = matchMedia('(max-width: 859.98px)');   // the panel's phone breakpoint (panel.css, field.css)
const params = new URLSearchParams(location.search);

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const MINUS = '−';
const fx = (v, d = 2, signed = false) => {
  if (!finite(v)) return '—';
  const s = Math.abs(v).toFixed(d);
  const zero = Number(s) === 0;
  return v < 0 && !zero ? MINUS + s : (signed && !zero ? '+' + s : s);
};
const timeCode = (t) => {
  // round to whole milliseconds first: the flight sums 1 ms steps, so 2 s is stored as 1.99999...
  const all = Math.round((finite(t) ? Math.max(0, t) : 0) * 1000);
  const s = Math.floor(all / 1000), ms = all % 1000;
  return `T+${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
};
const rateText = (r) => (!(r > 0) ? '—' : r >= 1 ? '1' : `1/${Math.round(1 / r)}`);
const idle = (fn, timeout = 1500) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout }) : setTimeout(fn, 60));

/* ------------------------------------------------------------------ DOM */
const $ = (sel, root = document) => root.querySelector(sel);
const stage = $('#stage');
const viewport = $('.fd-viewport', stage);
const sceneCanvas = $('#scene');
const statusEl = $('[data-status]');
const hintEl = $('[data-hint]');
const capFlow = $('[data-cap-flow]');
const capNote = $('[data-cap-note]');
const badges = $('[data-badges]');
const badgeHold = $('[data-badge-hold]');
const badgeGust = $('[data-badge-gust]');
const badgeGustT = $('[data-badge-gust-t]');
const badgeFlow = $('[data-badge-flow]');
const head = Object.fromEntries([...document.querySelectorAll('[data-h]')].map((el) => [el.dataset.h, el]));
let lastHead = 0, lastCap = 0;         // header strip and caption throttles
const write = (el, s) => { if (el && el.textContent !== s) el.textContent = s; };
const put = (key, s) => { for (const el of document.querySelectorAll(`[data-k="${key}"]`)) write(el, s); };

/* ------------------------------------------------------------------ URL state */
function urlNumber(name, lo, hi) {
  if (!params.has(name)) return undefined;
  const raw = params.get(name).trim();
  if (raw === '') return undefined;
  const v = Number(raw);
  return finite(v) ? clamp(v, lo, hi) : undefined;
}
function urlFins() {
  if (!params.has('fins')) return undefined;
  const raw = params.get('fins').trim().toLowerCase();
  const named = { none: 0, half: 0.5, full: 1 };
  if (raw in named) return named[raw];
  const v = Number(raw);
  return raw !== '' && finite(v) ? clamp(v, 0, 1.5) : undefined;
}
function snapRate(v) {
  if (!finite(v) || !(v > 0)) return undefined;
  return RATES.reduce((best, r) => (Math.abs(Math.log(r / v)) < Math.abs(Math.log(best / v)) ? r : best), RATES[0]);
}
function urlRate() {
  if (!params.has('speed')) return undefined;
  const raw = params.get('speed').trim();
  const m = /^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/.exec(raw);
  return snapRate(m ? Number(m[1]) / Number(m[2]) : Number(raw));
}
const urlChoice = (name, options) => { const v = (params.get(name) || '').trim().toLowerCase(); return options.includes(v) ? v : undefined; };
const URL0 = {
  fins: urlFins(),
  cg: urlNumber('cg', 12, 40),
  rail: urlNumber('rail', 36, 94),
  angle: urlNumber('angle', -10, 10),
  wind: urlNumber('wind', 0, 20),
  gust: urlNumber('gust', 0, 30),
  speed: urlRate(),
  view: urlChoice('view', ['smoke', 'pressure', 'vorticity', 'speed']),
  section: urlChoice('section', ['through', 'between']),
  cam: urlChoice('cam', ['side', 'quarter', 'chase', 'pad']),
  seed: urlNumber('seed', 0, 2 ** 31),
  hold: urlNumber('hold', -35, 35),
  autolaunch: params.get('autolaunch') === '1',
  tier: urlNumber('tier', 0, 3),
};

/* ------------------------------------------------------------------ governor */
if (URL0.tier !== undefined) governor.pin(Math.round(URL0.tier));
governor.start();

/* ------------------------------------------------------------------ geometry and flight */
const geometry = getBakedGeometry();              // CAD, measured by geom-measure.js and baked; no fetch
const flightConfig = { fins: geometry.finDefaults };
if (URL0.fins !== undefined) flightConfig.finScale = URL0.fins;
if (URL0.cg !== undefined) flightConfig.cgFromNose = URL0.cg * M_PER_IN;
if (URL0.rail !== undefined) flightConfig.railLength = URL0.rail * M_PER_IN;
if (URL0.angle !== undefined) flightConfig.launchAngle = URL0.angle * RAD;
if (URL0.wind !== undefined) flightConfig.wind = URL0.wind * MPS_PER_MPH;
if (URL0.seed !== undefined) flightConfig.seed = Math.round(URL0.seed);
const flight = createFlight(flightConfig);

/* ------------------------------------------------------------------ playback */
let rateOverride = URL0.speed;                    // undefined = automatic
let paused = false;
let hold = null;                                  // {alphaDeg, t} while a ?hold is shown
let armedGust = URL0.gust > 0 ? URL0.gust : 0;    // mph, fired at rail exit on every launch until disarmed
let shownRate = NaN;
let urlTimer = 0;

function burnoutT() { const e = flight.events.find((x) => x.name === 'burnout'); return e ? e.t : NaN; }
function advance(seconds) {
  for (let left = seconds; left > 1e-9 && !flight.done; left -= STEP_CHUNK_S) flight.step(Math.min(STEP_CHUNK_S, left));
}
const playback = {
  get rate() {
    if (rateOverride) return rateOverride;
    const bo = burnoutT();
    return finite(bo) && flight.state.t >= bo + AUTO_AFTER_BURNOUT_S ? AUTO_FAST : AUTO_SLOW;
  },
  get auto() { return !rateOverride; },
  setRate(r) { const s = snapRate(Number(r)); if (s) { rateOverride = s; kick(); } },
  get paused() { return paused && flight.ignited && !flight.done; },
  get running() { return flight.ignited && !flight.done && !paused; },
  get done() { return flight.done; },
  launch() {
    clearHold();
    if (flight.done) flight.reset();
    if (!flight.ignited) flight.ignite();
    paused = false;
    kick();
  },
  pause() { if (flight.ignited && !flight.done) paused = true; kick(); },
  resume() { clearHold(); paused = false; kick(); },
  play() { this.resume(); },
  step(seconds = 0.1) {
    const s = finite(seconds) && seconds > 0 ? Math.min(seconds, 10) : 0.1;
    if (flight.done) return;
    clearHold();
    if (!flight.ignited) flight.ignite();
    paused = true;
    advance(s);
    syncScene(); kick();
  },
  reset() { clearHold(); paused = false; flight.reset(); kick(); },
};

/* armed gust: fired through the panel (it announces it) when the forward button leaves the rail */
flight.onEvent((e) => {
  if (e.name === 'railExit' && armedGust > 0 && panel) panel.press('fireGust', armedGust);
});

/* ------------------------------------------------------------------ panel */
const LATTICE_STUB = (reason) => ({ fallback: reason, force: null, stats: { grid: null, fallback: reason }, setView() {} });
let panel = null;
panel = mountPanel(stage, {
  flight, playback, geometry, scene: null, lattice: LATTICE_STUB('lattice pending'), headingLevel: 2,
  defaults: Object.assign({}, URL0.view ? { view: URL0.view } : {}, URL0.section ? { section: URL0.section } : {}, URL0.cam ? { camera: URL0.cam } : {}),
});
if (URL0.gust !== undefined) panel.set('gust', URL0.gust);
const panelValue = (name, dflt) => { const v = panel.state.values[name]; return v === undefined ? dflt : v; };
/* forced colours: panel.css lets the chart dock grow upward to show the chart's text
   summary, so the view box follows the dock's real height (field.css) and the captions
   and the hint line stay clear of it. Elsewhere the dock keeps its fixed height. */
const dockEl = stage.querySelector('.pn-dock');
if (dockEl && typeof ResizeObserver === 'function') {
  new ResizeObserver(() => { stage.style.setProperty('--fd-dock-real', `${Math.ceil(dockEl.getBoundingClientRect().height)}px`); }).observe(dockEl);
}

/* ------------------------------------------------------------------ scene or 2D view */
let scene3d = null;        // the 3D scene (createScene) once it exists
let fbView = null;         // the 2D fallback view
let viewKind = 'loading';  // loading | 3d | 2d
let fallbackWhy = '';

function sceneDerived() {
  const st = flight.state, d = flight.derived;
  return {
    // the scene takes both CPs from flight.state (scene.js): the static Barrowman xcp for
    // the CP dot, its label and MARGIN (the panel's CP / BARROWMAN), xcpNow for the
    // normal-force arrow. This xcp is only its fallback for a state without them.
    xcp: d.xcp,
    xcg: st.xcg,
    xref: st.refFromNose,
    xcpLattice: latticeXcpM(),
    tags: { xcp: 'SIM', margin: 'SIM', xcpLattice: 'SIM' },
  };
}
function syncScene() { if (scene3d) scene3d.setFlight(flight.state, sceneDerived()); }
function applyPanelToScene(s) {
  const v = panel.state.values;
  const cfg = flight.config;
  s.setFinScale(cfg.finScale);
  s.setRail(cfg.railLength, cfg.launchAngle);
  if (v.view) s.setView(v.view);
  if (v.section) s.setSliceView(v.section);
  if (v.camera && typeof s.setCamera === 'function') s.setCamera(v.camera);
  s.setMarkers(v.markers !== false);
}

async function initView() {
  if (!webglAvailable()) return useFallback('no-webgl2');
  let mod;
  try { mod = await import('./scene/scene.js'); }
  catch (err) { console.warn('[field] the 3D scene did not load; using the 2D view', err); return useFallback('scene-module'); }
  let s;
  try { s = mod.createScene(sceneCanvas, { tier: governor.tier, zoom: false, touchAction: 'pan-y pinch-zoom' }); }
  catch (err) { console.warn('[field] the 3D scene failed; using the 2D view', err); return useFallback('scene-failed'); }
  if (s.fallback) { try { s.destroy(); } catch { /* the no-op fallback */ } return useFallback(s.fallback); }
  scene3d = s; viewKind = '3d';
  applyPanelToScene(s);
  // drags and arrow keys on the view go through the panel, as its FLICK buttons do, so a
  // flick is announced and a refused one (on the pad, or before the rail is clear) says so
  s.onFlick((r) => { panel.press('flick', r); syncScene(); kick(); });
  sceneCanvas.addEventListener('webglcontextlost', onContextLost);
  sceneCanvas.addEventListener('webglcontextrestored', onContextRestored);
  panel.attach({ scene: s });
  syncScene();
  const ok = await s.ready;
  if (!ok) {
    if (s.error) {
      console.warn('[field] the CAD model did not build; using the 2D view', s.error);
      try { s.destroy(); } catch { /* already gone */ }
      scene3d = null;
      return useFallback('cad-failed');
    }
    return false;
  }
  if (!ctxLost) { write(statusEl, ''); statusEl.hidden = true; }
  if (governor.tier === 0 && (governor.ceiling === 0 || governor.stats.pinned)) {
    // reduced motion, a device that never leaves tier 0 or a ?tier=0 pin: no flow to
    // show, so the engine is not even fetched until a tier above 0 appears
    lat.deferred = true; lat.reason = 'off at tier 0';
    panel.attach({ lattice: LATTICE_STUB('off at tier 0') });
    updateHeader(true); updateCaption(true);
  } else attachLattice(s, geometry, flight);
  return true;
}

function useFallback(reason) {
  fallbackWhy = reason; viewKind = '2d';
  sceneCanvas.classList.add('fd-off');
  viewport.classList.add('fd-2d');
  sceneCanvas.removeAttribute('aria-label');
  sceneCanvas.setAttribute('aria-hidden', 'true');
  const c = document.createElement('canvas');
  viewport.insertBefore(c, sceneCanvas.nextSibling);
  const v = panel.state.values;
  // the second line is the source tag of every number the 2D view draws (its CG, CP,
  // wind and angle readouts are the flight model's; the rail length is the 72 in estimate)
  const why = reason === 'no-webgl2' ? 'NO WEBGL2 IN THIS BROWSER' : reason === 'context-lost' ? 'THE 3D VIEW LOST ITS CONTEXT' : 'THE 3D VIEW DID NOT LOAD';
  fbView = createFallbackView(c, geometry, flight, {
    finScale: flight.config.finScale, view: v.section || 'through', markers: v.markers !== false,
    caption: [`2D VIEW / ${why}`, 'TRUE ANGLES / SIM / RAIL EST'],
  });
  panel.attach({ scene: fbView, lattice: LATTICE_STUB(reason === 'no-webgl2' ? 'no-webgl2' : 'no 3d view') });
  write(hintEl, 'DRAG THE ROCKET SIDEWAYS TO FLICK IT / L LAUNCH');
  write(statusEl, ''); statusEl.hidden = true;
  write(head.grid, reason === 'no-webgl2' ? 'OFF / NO WEBGL2' : 'OFF / NO 3D VIEW');
  write(head.engine, 'BARROWMAN 3-DOF / 2D VIEW');
  updateCaption(true);
  updateLatticeRow();
  return true;
}

/* A lost WebGL context (a GPU reset, or the browser reclaiming the context) leaves the
   canvas black and stops the lattice: the scene and the engine both stop drawing and wait
   for a restore. The stage says so meanwhile. If the context is not back within
   CONTEXT_WAIT_MS the 3D view and the lattice are dropped for the 2D view, so the flight
   and the panel carry on; a restore inside that time picks up where it was (the engine
   restarts its flow, so the cost guard's warm-up starts again too). */
const CONTEXT_WAIT_MS = 5000;
const HINT_3D = hintEl ? hintEl.textContent : '';
let ctxLost = false, ctxTimer = 0, ctxLabel = null;
function onContextLost() {
  if (ctxLost || viewKind !== '3d') return;
  ctxLost = true;
  ctxLabel = sceneCanvas.getAttribute('aria-label');
  sceneCanvas.setAttribute('aria-label', 'The 3D view lost its graphics context. The flight and the panel keep running.');
  write(statusEl, '3D VIEW LOST / WAITING FOR THE GRAPHICS CONTEXT'); statusEl.hidden = false;
  write(hintEl, 'L LAUNCH / THE FLIGHT AND THE PANEL KEEP RUNNING');
  if (lat.lattice) panel.attach({ lattice: LATTICE_STUB('context lost') });
  updateHeader(true); updateCaption(true);
  clearTimeout(ctxTimer);
  ctxTimer = setTimeout(contextGone, CONTEXT_WAIT_MS);
}
function onContextRestored() {
  if (!ctxLost) return;
  ctxLost = false; clearTimeout(ctxTimer); ctxTimer = 0;
  if (ctxLabel !== null) sceneCanvas.setAttribute('aria-label', ctxLabel);
  write(statusEl, ''); statusEl.hidden = true;
  write(hintEl, HINT_3D);
  if (lat.lattice) { panel.attach(lat.live ? { lattice: lat.panelView, section: lat.section } : { lattice: LATTICE_STUB(lat.cap === 0 ? 'paused, slow frames' : 'off at tier 0') }); costRestart(); }
  updateHeader(true); updateCaption(true);
  syncScene(); kick();
}
function contextGone() {
  ctxTimer = 0;
  if (!ctxLost || viewKind !== '3d') return;
  ctxLost = false;
  sceneCanvas.removeEventListener('webglcontextlost', onContextLost);
  sceneCanvas.removeEventListener('webglcontextrestored', onContextRestored);
  console.warn('[field] the graphics context did not come back; using the 2D view');
  const l = lat.lattice;
  lat.lattice = null; lat.section = null; lat.texture = null; lat.panelView = null; lat.appliedTier = null; lat.live = false; lat.deferred = false;
  builtSection = null;
  if (l) { try { l.destroy(); } catch { /* the context is gone */ } }
  const s = scene3d; scene3d = null;
  if (s) { try { s.destroy(); } catch { /* the context is gone */ } }
  useFallback('context-lost');
}

/* ================================================================== LATTICE SLOT
   LATTICE SLOT: verified by the second integrator (integrate:b, 2026-10-22, headless
   Chromium on SwiftShader with ?tier=1 pinned, 512 x 160; the measurements are in the
   README and the method):
   - force.cm sign at ?hold=5&lab: the developed section's cm is positive while
     flight.state.Maero is -0.42, because the 2D section's CP sits ahead of the CG
     (destabilising), not because of the convention: cm = cn (xcg - xcp) / D holds in the
     flight sign (positive raises theta), so CM_SIGN stays +1 (see below). The held flow
     does not settle: sampled every 250 steps to 12,500 (fix pass, 2026-10-23), the
     developed CP swings between 9.5 and 21.1 in from the nose (about 4,000 steps a
     cycle), c_n 17 to 32, cm +11 to +82 about the 22 in section CG and +6 to +79 about
     the live CG (21.57 in at the hold), which is the one shown and used (cmAtLiveCg).
   - moving-wall damping: positive pitch rate gives a negative moment change, so
     setBodyRate's sign matches the engine. The slewed response the engine now gives
     (flicks to q +3.38 and -4.62 rad/s from the hold) is in the "Body rate" paragraph of
     vx/js/lattice/lattice.js.
   - slice orientation at alpha +15: scene.checkSign() passes (slice inflow and the drawn
     wind arrow both (0.258, -0.966)); grid row 0, the body's -x side, projects left of
     the axis, where the smoke and the high pressure arrive.
   - lattice CP at alpha 0: a dash (the engine gates xcpCells on a developed flow,
     |alpha| 1 deg and |c_n| 1; the section's rail buttons give c_n -0.1 to -0.4 at 0).
   - tier change: pinning 1 -> 2 -> 1 swaps the grid (512 x 160 -> 768 x 240 -> 512 x
     160), rebuilds the section (dCells 19.46 -> 29.19 -> 19.46, links 2264 -> 3410 ->
     2264), keeps lattice.texture the same object and moves the slice domain with it.

   attachLattice(scene, geometry, flight) wires the lattice engine (FIELD.md section 4)
   to the scene, the panel and the flight. It depends only on the contract's API:
   createLattice(renderer, {cols, rows, tier}) -> {ready, fallback, setSection,
   setInflow, setBodyRate, setView, setTier, frame, step, reset, texture, force, stats,
   destroy}. Until the engine is in, or whenever anything in here fails, the page
   runs without it: the slice stays hidden, the panel's lattice line and the header
   read LATTICE PENDING (or the engine's own fallback reason), nothing is thrown.

   What it does
   - import('./lattice/lattice.js') inside try/catch, createLattice on scene.renderer
     with the current tier's grid ({cols, rows, tier}; the engine scales that grid by its
     tier table on setTier), await ready (15 s cap).
   - Section: geometry.buildSection({cols, rows, finScale, view, cgM}) at the engine's
     grid, handed to setSection in the builder form (sectionBuilder; setTier rebuilds the
     mask once at the new grid), then scene.setSliceTexture(lattice.texture, section),
     panel.attach({lattice: panelLatticeView}) and panel.setSection(section). Rebuilt on a
     fin scale, section view, CG or tier change, at most every 250 ms while a slider moves.
   - Every frame while the stage is on screen: setInflow(u_in, alpha) with
       u_in = clamp(0.03 + 0.05 V / 70, 0.03, 0.10)    (V = flight.state.airspeed, m/s)
     and alpha clamped to +-35 deg (the engine clamps too; the stage caption says so);
     setBodyRate(omegaLU) with the pitch rate in lattice units:
       omegaLU = q * cellM * u_in / V   [rad per lattice step]
     One lattice step lasts cellM * u_in / V seconds of flight time, because the inflow
     u_in cells per step stands for V m/s; this keeps the reduced pitch rate q D / V of
     the flight in the lattice. Below V = 2 m/s the mapping means nothing (the inflow
     floor) and omegaLU is 0. The wall speed it implies at the far end of the body is
     capped at 0.05 lattice units. Sign: the flight convention (positive raises theta),
     which is what the lattice header documents for setBodyRate.
     Then lattice.frame(dt); a new lattice.texture object is handed to the scene.
   - Lab toggle (LATTICE FLIES IT, ?lab): flight.setLatticeMoment(CM_SIGN * CM_SCALE *
     cm about the live CG) while flight.state.lattice is on and the force is developed and under
     0.5 s old (under SwiftShader the readback lags 1.5 to 3 s, so it never feeds there).
     CM_SIGN is +1: FIELD.md section 4 defines xcpCells = xcg - mz / fy, which holds
     only when mz (and cm) are in the flight convention (positive raises theta, so a
     restoring moment at positive alpha reads negative), and vx/js/lattice/lattice.js
     (its header, the "Moments (force.mz, force.cm)" paragraph) says it reports them that way. The flight builder's note
     ("pass -lattice.force.cm") assumed a counterclockwise grid moment; that would
     double the flip and make the lattice destabilise the rocket. CM_SCALE is 1: the
     2D section coefficient is used as the 3D one, which the method calls a
     cross-check for this reason.
   ================================================================== */
const LATTICE_GRIDS = { 3: { cols: 1024, rows: 320 }, 2: { cols: 768, rows: 240 }, 1: { cols: 512, rows: 160 } };
const LATTICE_READY_MS = 15000;
const ALPHA_MAX = 35 * RAD;          // EST, the edge treatment's limit (FIELD 4)
const U_FLOOR = 0.03, U_SLOPE = 0.05, U_V_REF = 70, U_MAX = 0.10;   // FIELD 4 inflow rule, lattice units and m/s
const OMEGA_V_MIN = 2;               // m/s: below this the body-rate mapping is 0
const WALL_U_MAX = 0.05;             // lattice units: cap on the moving-wall speed at the far end of the body
const CM_SIGN = 1;                   // lattice cm (flight convention) to flight.setLatticeMoment; see above
const CM_SCALE = 1;                  // 2D section coefficient taken as the 3D one (EST)
const FORCE_FRESH_MS = 500;
const lat = { lattice: null, panelView: null, section: null, texture: null, live: false, reason: 'lattice pending', clamped: false, rMaxCells: 1, mod: null, cap: 3, shedMs: 0, appliedTier: null };
/* Cost guard (EST), aware of the flow's development. The governor now samples slow
   frames too (each interval clamped to 1 s, core/governor.js, frame()) and steps down
   under software GL, but only on its whole-page p95 over a full 90-frame window, after
   its 6 s start-up grace and a 2.2 s hold; and the engine sheds steps on its own (down to
   one per frame). This guard is the second line, for frames neither can shed fast
   enough: it judges only the frames the lattice runs in, and only after a warm-up:
   - Warm-up starts whenever a grid is built (attach, a tier change, RESUME FLOW) and lasts
     until the guard has seen WARM_FRAMES lattice frames AND the engine reports a developed
     flow (lattice.stats.developed: its start-up viscosity has eased back to tau0, about
     2,000 steps, and the inflow has reached its target), and never longer than WARM_MAX_MS
     of wall time. Shader compilation, the first texture uploads, the CAD build and the
     idle-time run previews all land inside it, so a working GPU (2,000 steps take 1.4 s at
     tier 3 and 60 Hz) is never judged on them, while a renderer that needs seconds per
     frame is judged after WARM_MAX_MS however few frames it has drawn.
   - Verdict: the window is every consecutive lattice-frame interval of the last
     SLOW_HOLD_MS, and at least the last SLOW_MIN_FRAMES. When the window spans at least
     SLOW_HOLD_MS, its median is over SLOW_FRAME_MS, and the engine's own step shedding has
     run out (stats.stepScale at its floor of one step per frame; not waited for when the
     median is over HOPELESS_MS, since fewer steps cannot rescue a frame that slow), one
     lattice tier is shed; below tier 1 the flow pauses and the stage offers RESUME FLOW.
   - A pinned tier (?tier=) is never judged: that is how the lattice is forced on for
     verification under software GL. */
const SLOW_FRAME_MS = 120, SLOW_HOLD_MS = 2500, SLOW_MIN_FRAMES = 3, HOPELESS_MS = 1000, WARM_FRAMES = 20, WARM_MAX_MS = 12000;
const cost = { since: 0, frames: 0, iv: [], at: [] };
let prevFlowing = false;

const inflowLU = (V) => clamp(U_FLOOR + U_SLOPE * ((finite(V) ? V : 0) / U_V_REF), U_FLOOR, U_MAX);
function bodyRateLU(q, V, uIn) {
  if (!lat.section || !finite(q) || !(V > OMEGA_V_MIN)) return 0;
  const w = q * lat.section.cellM * uIn / V;
  const wMax = WALL_U_MAX / Math.max(1, lat.rMaxCells);
  return clamp(w, -wMax, wMax);
}
function latticeTier() { return Math.min(governor.tier, lat.cap); }
function latticeGrid(t) {
  const g = lat.lattice && lat.lattice.grid;
  if (g && g.cols > 0 && g.rows > 0) return { cols: g.cols, rows: g.rows };
  return LATTICE_GRIDS[clamp(t, 1, 3)];
}
function latticeXcpM() {
  const f = lat.live && lat.lattice ? lat.lattice.force : null;
  if (!f || !lat.section || !finite(f.xcpCells) || (finite(f.age_ms) && f.age_ms > 3000)) return NaN;
  return (f.xcpCells - lat.section.xNoseCol) * lat.section.cellM;
}
/* The engine takes the moment about the section's CG cell, the CG the section was built
   with (the CG slider, the liftoff CG); the flight's CG moves forward as the propellant
   burns (22.00 in at liftoff, 20.67 in at burnout). A moment moves with its reference
   point, mz_b = mz_a + fy (b - a), so about the live CG
     cm_live = cm + cn (x_cg,live - x_cg,section) / D        (x in cells, D = dCells)
   which is what the panel prints next to CG / LIVE and what LATTICE FLIES IT hands the
   flight. The CP (xcpCells) does not depend on the reference point. */
function cmAtLiveCg(f) {
  if (!f || !finite(f.cm)) return NaN;
  const sec = lat.section, xcg = flight.state.xcg;
  const d = finite(f.dCells) && f.dCells > 0 ? f.dCells : sec && sec.dCells;
  if (!sec || !sec.cgCell || !finite(xcg) || !finite(f.cn) || !(d > 0)) return f.cm;
  return f.cm + f.cn * (sec.xNoseCol + xcg / sec.cellM - sec.cgCell.x) / d;
}
/* What the panel reads: the engine's force with cm moved to the live CG (cmSection keeps
   the engine's own), plus the stats, the fallback and setView it uses. */
function panelLatticeView(l) {
  let src = null, at = NaN, out = null;
  return {
    get fallback() { return l.fallback; },
    get stats() { return l.stats; },
    get force() {
      const f = l.force;
      if (!f || !finite(f.cm)) return f;
      const xcg = flight.state.xcg;
      if (f !== src || xcg !== at) {
        src = f; at = xcg;
        out = Object.create(f, { cm: { value: cmAtLiveCg(f), enumerable: true }, cmSection: { value: f.cm, enumerable: true } });
      }
      return out;
    },
    setView(name) { return l.setView(name); },
  };
}

function latticePending(reason) {
  lat.live = false; lat.reason = reason || 'lattice pending';
  if (scene3d) scene3d.setSliceTexture(null);
  if (flight.state.lattice) { panel.set('latticeFlies', false); flight.useLattice(false); }
  panel.attach({ lattice: LATTICE_STUB(lat.reason) });
  updateCaption(true); updateHeader(true);
}

/* The section at a grid for the current fin scale, section view and CG. The geometry
   caches masks and sections (geom.js), so asking again for an unchanged one is a lookup. */
function sectionAt(cols, rows) {
  const cfg = flight.config;
  return geometry.buildSection({ cols, rows, finScale: cfg.finScale, view: panelValue('section', 'through'), cgM: cfg.cgFromNose });
}
/* Handed to lattice.setSection in the builder form: the engine calls it at its own grid, on
   setSection and again on a tier change (setTier then builds the mask once, at the new
   grid). builtSection is the section the engine holds. */
let builtSection = null;
const sectionBuilder = ({ cols, rows }) => (builtSection = sectionAt(cols, rows));

function rebuildSection() {
  const l = lat.lattice;
  if (!l || !scene3d) return;
  const t = latticeTier();
  if (t === 0) { lat.live = false; scene3d.setSliceTexture(null); updateCaption(true); updateHeader(true); return; }
  const grid = latticeGrid(t);
  const sec = sectionAt(grid.cols, grid.rows);
  // nothing that shapes the solid changed (wind, rail and angle changes emit flight:config too)
  if (sec === lat.section && sec === builtSection && lat.live) return;
  if (sec !== builtSection) {
    try { l.setSection(sectionBuilder); lastSectionAt = performance.now(); }
    catch (err) { console.warn('[field] lattice.setSection failed; running without the lattice', err); return detachLattice('lattice pending'); }
  }
  lat.section = sec;
  const tailCol = sec.xNoseCol + (geometry.refs.length / sec.cellM);
  lat.rMaxCells = Math.max(sec.cgCell.x - sec.xNoseCol, tailCol - sec.cgCell.x);
  lat.texture = l.texture;
  scene3d.setSliceTexture(l.texture || null, sec);
  panel.setSection(sec);
  const was = lat.live;
  lat.live = true;                 // the texture may appear on a later frame; latticeFrame hands it over when it does
  if (!was) costRestart();
  updateCaption(true);
}

/* apply min(governor tier, cost cap) to the engine, the slice and the panel */
function applyLatticeTier() {
  const l = lat.lattice;
  if (!l) return;
  const t = latticeTier();
  // a governor step that leaves min(governor tier, cap) where it was changes nothing here:
  // no new grid, so no rebuilt section (which drops the readbacks in flight) and no new warm-up
  if (t === lat.appliedTier) { updateHeader(true); updateCaption(true); return; }
  lat.appliedTier = t;
  try { l.setTier(t); } catch (err) { console.warn('[field] lattice.setTier failed', err); }
  if (t === 0) {
    lat.live = false;
    if (scene3d) scene3d.setSliceTexture(null);
    panel.attach({ lattice: LATTICE_STUB(lat.cap === 0 ? 'paused, slow frames' : 'off at tier 0') });
  } else {
    panel.attach({ lattice: lat.panelView });
    rebuildSection();              // setTier has built the section at the new grid; this picks it up
    costRestart();                 // a new grid: the flow restarts, so the warm-up does too
  }
  updateHeader(true); updateCaption(true);
}
function costRestart() { cost.since = performance.now(); cost.frames = 0; cost.iv.length = 0; cost.at.length = 0; }
/* called once per frame the lattice ran in; intervalMs is NaN unless the frame before ran it too */
function watchLatticeCost(intervalMs, now) {
  const l = lat.lattice;
  if (!l || !lat.live || governor.stats.pinned) { cost.iv.length = 0; cost.at.length = 0; return; }
  const s = l.stats || {};
  cost.frames++;
  const warm = now - cost.since < WARM_MAX_MS && (cost.frames < WARM_FRAMES || !s.developed);
  if (warm || !finite(intervalMs)) { cost.iv.length = 0; cost.at.length = 0; return; }
  cost.iv.push(intervalMs); cost.at.push(now);
  // drop the oldest interval while the rest still cover SLOW_HOLD_MS with SLOW_MIN_FRAMES or more
  while (cost.iv.length > SLOW_MIN_FRAMES && now - (cost.at[1] - cost.iv[1]) >= SLOW_HOLD_MS) { cost.iv.shift(); cost.at.shift(); }
  if (cost.iv.length < SLOW_MIN_FRAMES || now - (cost.at[0] - cost.iv[0]) < SLOW_HOLD_MS) return;
  const median = cost.iv.slice().sort((a, b) => a - b)[cost.iv.length >> 1];
  const atFloor = median > HOPELESS_MS || !(s.stepsPerFrame > 0 && s.stepScale > 1.5 / s.stepsPerFrame);
  if (!(median > SLOW_FRAME_MS) || !atFloor) return;
  lat.shedMs = median;
  lat.cap = Math.max(0, latticeTier() - 1);
  console.info(`[field] lattice frames at a median ${Math.round(median)} ms after warm-up: lattice tier capped at ${lat.cap}`);
  applyLatticeTier();
}
function resumeLattice() {
  lat.cap = 3;
  applyLatticeTier();
  kick();
}

function detachLattice(reason) {
  const l = lat.lattice;
  lat.lattice = null; lat.panelView = null; lat.section = null; lat.texture = null; lat.appliedTier = null;
  builtSection = null;
  if (l) { try { l.destroy(); } catch { /* already gone */ } }
  latticePending(reason);
}

/* scene, geometry and flight are the page's own (scene3d, getBakedGeometry(), the
   live flight); the helpers above read the same module-level objects */
async function attachLattice(scene, geometry, flight) {
  if (!scene || scene.fallback || !scene.renderer) return latticePending(scene && scene.fallback ? scene.fallback : 'no-webgl2');
  let mod;
  try { mod = await import('./lattice/lattice.js'); }
  catch (err) { console.warn('[field] lattice engine not loaded; the page runs without it', err); return latticePending('lattice pending'); }
  if (!mod || typeof mod.createLattice !== 'function') return latticePending('lattice pending');
  lat.mod = mod;
  const t = latticeTier();
  let l;
  // the contract's {cols, rows, tier}: the grid at this tier, which the engine scales by its
  // tier table on setTier (FIELD 4); tier 0 at attach starts from the tier-3 grid
  const g0 = LATTICE_GRIDS[t >= 1 ? t : 3];
  try { l = mod.createLattice(scene.renderer, { cols: g0.cols, rows: g0.rows, tier: t }); }
  catch (err) { console.warn('[field] createLattice failed; the page runs without it', err); return latticePending('lattice pending'); }
  let res = null;
  try {
    res = await Promise.race([Promise.resolve(l.ready), new Promise((_, rej) => setTimeout(() => rej(new Error('lattice ready timed out')), LATTICE_READY_MS))]);
  } catch (err) { console.warn('[field] lattice not ready; the page runs without it', err); res = { fallback: 'lattice pending' }; }
  const reason = (l && l.fallback) || (res && res.fallback) || null;
  if (reason || scene3d !== scene) { try { l.destroy(); } catch { /* nothing to free */ } return latticePending(reason || 'lattice pending'); }
  lat.lattice = l;
  lat.panelView = panelLatticeView(l);
  lat.appliedTier = t;
  builtSection = null;
  try { l.setView(panelValue('view', 'smoke')); } catch { /* the view stays the engine's default */ }
  rebuildSection();
  costRestart();
  panel.attach(lat.live ? { lattice: lat.panelView, section: lat.section } : { lattice: LATTICE_STUB('off at tier 0') });
  updateHeader(true);
  kick();
  return l;
}

function latticeFrame(dt) {
  const l = lat.lattice;
  if (!l || !lat.live || ctxLost || !scene3d || !stageOnScreen || document.hidden) return false;
  const st = flight.state;
  const V = finite(st.airspeed) ? st.airspeed : (finite(st.v) ? st.v : 0);
  const uIn = inflowLU(V);
  const a = finite(st.alpha) ? st.alpha : 0;
  lat.clamped = Math.abs(a) > ALPHA_MAX + 1e-9;
  lat.uIn = uIn; lat.alphaIn = clamp(a, -ALPHA_MAX, ALPHA_MAX);
  try {
    l.setInflow(uIn, lat.alphaIn);
    lat.omegaLU = bodyRateLU(st.q, V, uIn);
    l.setBodyRate(lat.omegaLU);
    l.frame(dt);
  } catch (err) {
    console.warn('[field] lattice frame failed; running without the lattice', err);
    detachLattice('lattice pending');
    return false;
  }
  if (l.texture !== lat.texture) { lat.texture = l.texture; scene3d.setSliceTexture(l.texture || null, lat.section); }
  if (st.lattice) {
    const f = l.force;
    if (f && f.developed !== false && finite(f.cm) && !(finite(f.age_ms) && f.age_ms > FORCE_FRESH_MS)) flight.setLatticeMoment(CM_SIGN * CM_SCALE * cmAtLiveCg(f));
  }
  return true;
}
/* ================================================================== end of the LATTICE SLOT */

/* ------------------------------------------------------------------ the loop */
let raf = 0, lastNow = 0, stageOnScreen = true;
function kick() { if (!raf && !document.hidden) { raf = requestAnimationFrame(tick); } }
function tick(now) {
  raf = 0;
  const interval = lastNow ? now - lastNow : NaN;
  const dt = lastNow ? Math.min(MAX_FRAME_S, Math.max(0, interval / 1000)) : 1 / 60;
  lastNow = now;
  let busy = false;
  if (playback.running) {
    flight.step(dt * playback.rate);
    busy = true;
  }
  const flowing = latticeFrame(dt);
  if (flowing) watchLatticeCost(prevFlowing ? interval : NaN, now);
  prevFlowing = flowing;
  busy = busy || flowing;
  if (scene3d) {
    syncScene();
    if (busy) scene3d.render(dt);
  }
  if (playback.rate !== shownRate) { shownRate = playback.rate; panel.sync(); }
  updateHeader(!busy);              // the frame that stops the loop always writes, so a STEP never leaves a stale time
  updateCaption(false);
  if (busy) raf = requestAnimationFrame(tick); else lastNow = 0;
}
document.addEventListener('visibilitychange', () => { if (document.hidden) { if (raf) cancelAnimationFrame(raf); raf = 0; lastNow = 0; } else kick(); });
if (typeof IntersectionObserver === 'function') {
  new IntersectionObserver((es) => { stageOnScreen = es[es.length - 1].isIntersecting; if (stageOnScreen) kick(); }).observe(stage);
}

/* the bus: resets and config changes move the rocket on the pad */
bus.on('flight:reset', () => { syncScene(); kick(); });
bus.on('flight:config', () => { syncScene(); scheduleSection(); kick(); });
/* Section rebuilds while a slider moves. The fin, CG and section controls emit on every
   input event, and a new section costs the main thread tens of milliseconds at tier 3
   (geom.buildSection rasterising the mask, then the engine's cell pass and texture upload
   in setSection). The first change rebuilds on the next frame, later ones at most every
   SECTION_MIN_MS, and the last one always lands (the trailing timer reads the config when
   it fires). A change that leaves the solid as it was (wind, rail, angle) costs a lookup. */
const SECTION_MIN_MS = 250;
let sectionPending = 0, sectionTimer = 0, lastSectionAt = -Infinity;
function scheduleSection() {
  if (sectionPending || sectionTimer || !lat.lattice) return;
  const wait = SECTION_MIN_MS - (performance.now() - lastSectionAt);
  if (wait > 0) sectionTimer = setTimeout(() => { sectionTimer = 0; queueSection(); }, wait);
  else queueSection();
}
function queueSection() {
  if (sectionPending) return;
  sectionPending = requestAnimationFrame(() => { sectionPending = 0; rebuildSection(); kick(); });
}
governor.subscribe(({ tier }) => {
  if (scene3d) scene3d.setTier(tier);
  if (lat.deferred && tier > 0 && scene3d) { lat.deferred = false; attachLattice(scene3d, geometry, flight); }
  applyLatticeTier();
  updateHeader(true); updateCaption(true);
  kick();
});

/* panel controls: the section view and anything that changes the solid rebuild the
   lattice section; settings go back into the URL */
panel.onControl(({ name }) => {
  if (name === 'section' || name === 'fins' || name === 'cg') scheduleSection();
  if (name === 'launch' || name === 'reset') markRun(null);
  if (['fins', 'cg', 'rail', 'angle', 'wind', 'rate', 'view', 'section', 'camera', 'gust'].includes(name)) scheduleUrl();
  if (name === 'view' || name === 'section') updateCaption(true);
  kick();
});

/* ------------------------------------------------------------------ header strip and captions */
function updateHeader(force) {
  const now = performance.now();
  if (!force && now - lastHead < 100) return;
  lastHead = now;
  if (force) updateLatticeRow();
  write(head.tc, timeCode(flight.state.t));
  write(head.rate, `${rateText(playback.rate)} ${playback.auto ? 'AUTO' : 'SET'}`);
  const t = governor.tier;
  write(head.tier, `T${t}${governor.stats.pinned ? ' PINNED' : ''}`);
  if (viewKind === '2d') return;
  const l = lat.lattice;
  if (ctxLost) {
    write(head.grid, 'CONTEXT LOST');
    write(head.engine, 'BARROWMAN 3-DOF / 3D VIEW LOST');
  } else if (l && lat.live) {
    const s = l.stats || {};
    const g = Array.isArray(s.grid) ? `${s.grid[0]}×${s.grid[1]}` : lat.section ? `${lat.section.cols}×${lat.section.rows}` : '—';
    write(head.grid, g);
    write(head.engine, 'BARROWMAN 3-DOF / LBM D2Q9');
  } else if (l && lat.cap === 0) {
    write(head.grid, 'PAUSED, SLOW FRAMES');
    write(head.engine, 'BARROWMAN 3-DOF / LBM PAUSED');
  } else if ((l && latticeTier() === 0) || lat.deferred) {
    write(head.grid, 'OFF AT TIER 0');
    write(head.engine, 'BARROWMAN 3-DOF / LBM OFF');
  } else {
    write(head.grid, String(lat.reason || 'lattice pending').toUpperCase());
    write(head.engine, 'BARROWMAN 3-DOF / LBM PENDING');
  }
}

const VIEW_WORDS = { smoke: 'SMOKE', pressure: 'PRESSURE', vorticity: 'VORTICITY', speed: 'SPEED' };
function updateCaption(force) {
  const now = performance.now();
  if (!force && now - lastCap < 1000) return;      // the numbers in it change at most once a second
  lastCap = now;
  const phone = phoneMq.matches;      // phones get short forms, so a narrow line keeps its last clause
  const section = `${phone ? '' : 'SECTION '}${panelValue('section', 'through') === 'between' ? 'BETWEEN' : 'THROUGH'} THE FINS`;
  if (viewKind === '2d') {
    write(capFlow, `2D SIDE VIEW / ${fallbackWhy === 'no-webgl2' ? 'NO WEBGL2' : 'NO 3D VIEW'} / NO FLOW SECTION`);
    write(capNote, 'ROCKET, CG, CP, WIND AND FORCES FROM THE FLIGHT MODEL');
    capNote.classList.remove('fd-cap-warn');
  } else if (ctxLost) {
    write(capFlow, 'FLOW / 3D VIEW LOST');
    write(capNote, 'WAITING FOR THE GRAPHICS CONTEXT / THE FLIGHT MODEL RUNS');
    capNote.classList.add('fd-cap-warn');
  } else if (lat.lattice && lat.live) {
    write(capFlow, `FLOW / ${VIEW_WORDS[panelValue('view', 'smoke')] || 'SMOKE'} / ${section}`);
    // before the first lattice frame has run, the inflow it is about to get
    const st = flight.state;
    const a = (finite(lat.alphaIn) ? lat.alphaIn : clamp(finite(st.alpha) ? st.alpha : 0, -ALPHA_MAX, ALPHA_MAX)) * DEG;
    const u = finite(lat.uIn) ? lat.uIn : inflowLU(st.airspeed);
    // phones: the clause that matters first
    // the inflow is SIM (the flight's airspeed and alpha through the EST rule); the ±35°
    // hold is the EST limit
    write(capNote, lat.clamped
      ? (phone ? `INFLOW HELD AT\u00a0${fx(a, 0, true)}°\u00a0EST / FLIGHT\u00a0PAST\u00a0IT` : `INFLOW HELD AT ${fx(a, 0, true)}° EST / THE FLIGHT IS PAST IT`)
      : (phone ? `NOT TIME-ACCURATE / ${u.toFixed(3)}\u00a0LU\u00a0/\u00a0${fx(a, 1, true)}°\u00a0SIM` : `2D SECTION / INFLOW ${u.toFixed(3)} LU AT ${fx(a, 1, true)}° SIM / NOT TIME-ACCURATE`));
    capNote.classList.toggle('fd-cap-warn', lat.clamped);
  } else if (lat.lattice && lat.cap === 0) {
    write(capFlow, 'FLOW / PAUSED');
    write(capNote, `FRAMES TOOK ${Math.round(lat.shedMs)} MS WITH THE LATTICE RUNNING`);
    capNote.classList.add('fd-cap-warn');
  } else if ((lat.lattice && latticeTier() === 0) || lat.deferred) {
    write(capFlow, 'FLOW / OFF AT TIER 0');
    write(capNote, governor.stats.pinned ? 'PINNED TO TIER 0' : reducedMq.matches ? 'REDUCED MOTION / STEP WITH THE PANEL' : 'THE GOVERNOR DROPPED TO TIER 0');
    capNote.classList.remove('fd-cap-warn');
  } else {
    write(capFlow, `FLOW / ${String(lat.reason || 'lattice pending').toUpperCase()}`);
    write(capNote, 'THE FLIGHT MODEL RUNS WITHOUT IT');
    capNote.classList.remove('fd-cap-warn');
  }
  // badges: the hold and an armed gust
  badgeHold.hidden = !hold;
  if (hold) write(badgeHold, `HOLD / AOA ${fx(hold.alphaDeg, 1, true)}° SIM / ${timeCode(hold.t)}`);
  badgeGust.hidden = !(armedGust > 0);
  if (armedGust > 0) write(badgeGustT, `GUST ${armedGust.toFixed(1)} MPH AT RAIL EXIT`);
  badgeFlow.hidden = !(lat.lattice && lat.cap === 0);
  badges.hidden = badgeHold.hidden && badgeGust.hidden && badgeFlow.hidden;
}
phoneMq.addEventListener('change', () => updateCaption(true));
$('[data-resume]').addEventListener('click', () => { resumeLattice(); stage.focus({ preventScroll: true }); });
$('[data-disarm]').addEventListener('click', () => { armedGust = 0; scheduleUrl(); updateCaption(true); stage.focus({ preventScroll: true }); });

/* ------------------------------------------------------------------ hold */
function clearHold() { if (hold) { hold = null; updateCaption(true); } }
function holdAt(deg) {
  const target = Math.max(0.5, Math.abs(deg)) * RAD;    // a hold under 0.5 deg is held at 0.5 deg
  const sign = deg < 0 ? -1 : 1;
  const windMph = URL0.wind > 0 ? URL0.wind : HOLD_WIND_MPH;
  playback.reset();
  // a crosswind toward +x gives a positive alpha that falls as the rocket gathers speed;
  // the slider holds 0 to 20 mph, so a negative hold sets the wind through the flight
  if (sign > 0) panel.set('wind', windMph); else flight.setWind(-windMph * MPS_PER_MPH);
  flight.ignite();
  let guard = 0, prev = NaN;
  while (!flight.done && guard++ < 30000) {
    flight.step(0.001);                                  // one integrator step
    const s = flight.state;
    if (s.phase === 'pad' || !(s.airspeed > 1)) continue;
    if (Math.abs(s.alpha) <= target + 1e-9 || (finite(prev) && prev * s.alpha < 0)) break;
    prev = s.alpha;
  }
  paused = true;
  hold = { alphaDeg: flight.state.alpha * DEG, t: flight.state.t };
  syncScene(); panel.wake(); updateCaption(true); kick();
}

/* ------------------------------------------------------------------ runs */
const RUNS = {
  full: { fins: 1, wind: 5, gust: 0 },
  half: { fins: 0.5, wind: 5, gust: 0 },
  none: { fins: 0, wind: 5, gust: 0 },
  wind: { fins: 1, wind: 10, gust: 0 },
  gust: { fins: 1, wind: 0, gust: GUST_DEFAULT_MPH },
};
function markRun(key) {
  for (const el of document.querySelectorAll('.fd-run')) { if (el.dataset.run === key) el.dataset.active = ''; else delete el.dataset.active; }
}
function startRun(key) {
  const r = RUNS[key]; if (!r) return;
  clearHold();
  armedGust = r.gust;
  panel.press('reset');
  panel.set('fins', r.fins);
  panel.set('wind', r.wind);
  panel.set('cg', PAGE_CG_IN);
  panel.set('rail', EST_RAIL_IN);
  panel.set('angle', 0);
  panel.set('gust', r.gust > 0 ? r.gust : GUST_DEFAULT_MPH);
  scheduleUrl();
  // back to the stage: a short way glides, the long way from the runs jumps (a smooth
  // scroll over several screens is slow to watch and slower on a busy renderer)
  window.scrollTo({ top: 0, behavior: reducedMq.matches || scrollY > 2 * innerHeight ? 'auto' : 'smooth' });
  stage.focus({ preventScroll: true });
  panel.press('launch');
  markRun(key);
  updateCaption(true);
}
for (const b of document.querySelectorAll('[data-run-go]')) b.addEventListener('click', () => startRun(b.dataset.runGo));

/* results of each run, flown silently (no bus) in idle time */
function flyRun(r) {
  const f = createFlight({ fins: geometry.finDefaults, finScale: r.fins, wind: r.wind * MPS_PER_MPH }, { bus: null });
  let gustT = NaN;
  if (r.gust > 0) f.onEvent((e) => { if (e.name === 'railExit' && !finite(gustT)) { gustT = e.t; f.gust(r.gust * MPS_PER_MPH); } });
  f.ignite();
  const out = { margin0: f.derived.staticMargin, marginBo: f.derived.staticMarginBurnout, alphaRail: NaN, peakAlpha: 0, theta60: NaN, theta1: NaN, apogee: NaN, upwind: NaN, settle: NaN, marginUp: NaN };
  let railT = NaN, lastBig = NaN, apoT = Infinity;
  const vMin = 50 * M_PER_FT;           // ascent samples above 50 ft/s, as the panel's MAX AOA (EST)
  for (let i = 0; i < 4000 && !f.done; i++) {
    f.step(0.005);
    const s = f.state;
    if (!finite(railT)) { const e = f.events.find((x) => x.name === 'railExit'); if (e) { railT = e.t; out.alphaRail = e.state.alpha * DEG; } }
    if (finite(s.apogee) && apoT === Infinity) { apoT = s.t; out.apogee = s.apogee / M_PER_FT; out.upwind = -s.x / M_PER_FT; }
    if (finite(railT) && s.t <= apoT && s.airspeed > vMin) {
      const a = Math.abs(s.alpha) * DEG;
      if (a > out.peakAlpha) out.peakAlpha = a;
      if (a >= 2) lastBig = s.t;
    }
    if (!finite(out.theta60) && Math.abs(s.theta) > Math.PI / 3 && s.t < apoT) out.theta60 = s.t;
    if (!finite(out.theta1) && s.t >= 1) out.theta1 = s.theta * DEG;
    // the static margin (Barrowman CP against the live CG) crossing to positive as the CG moves forward
    if (!finite(out.marginUp) && out.margin0 < 0 && finite(s.margin) && s.margin >= 0) out.marginUp = s.t;
  }
  const from = r.gust > 0 ? gustT : railT;
  out.settle = finite(lastBig) && finite(from) ? Math.max(0, lastBig - from) : 0;
  out.fn = f.derived.naturalFrequency(30) / (2 * Math.PI);
  f.destroy();
  return out;
}
function fillRun(key, o) {
  const card = document.querySelector(`.fd-run[data-run="${key}"]`); if (!card) return;
  const set = (k, s) => { for (const el of card.querySelectorAll(`[data-r="${k}"]`)) write(el, s); };
  set('margin0', fx(o.margin0, 2, true));
  set('marginBo', fx(o.marginBo, 2, true));
  set('alphaRail', fx(o.alphaRail, 1, true));
  set('peakAlpha', fx(o.peakAlpha, key === 'gust' ? 2 : 1));
  set('theta60', finite(o.theta60) ? o.theta60.toFixed(2) : '—');
  set('theta1', fx(o.theta1, 1, true));
  set('apogee', finite(o.apogee) ? o.apogee.toFixed(0) : '—');
  set('upwind', finite(o.upwind) ? o.upwind.toFixed(0) : '—');
  set('settle', fx(o.settle, 2));
  set('fn', fx(o.fn, 2));
  set('marginUp', fx(o.marginUp, 2));
  if (key === 'none') put('apogeeNone', finite(o.apogee) ? String(Math.round(o.apogee / 10) * 10) : '—');
}
function computeRuns() {
  const keys = Object.keys(RUNS);
  const next = () => {
    const k = keys.shift(); if (!k) return;
    try { fillRun(k, flyRun(RUNS[k])); } catch (err) { console.warn('[field] run preview failed', k, err); }
    idle(next);
  };
  idle(next);
}

/* ------------------------------------------------------------------ configuration table */
function fillConfig() {
  const pv = createFlight({ fins: geometry.finDefaults }, { bus: null });
  const d = pv.derived, refs = geometry.refs, fin = geometry.fin;
  const IN = (m) => m / M_PER_IN;
  put('lengthIn', IN(refs.length).toFixed(2));
  put('lengthMm', (refs.length * 1000).toFixed(1));
  put('diameterIn', IN(refs.diameter).toFixed(3));
  put('diameterMm', (refs.diameter * 1000).toFixed(1));
  put('noseIn', IN(refs.noseLength).toFixed(2));
  put('noseExposedIn', IN(refs.noseExposedLength).toFixed(2));
  put('finRootIn', IN(fin.root).toFixed(2));
  put('finTipIn', IN(fin.tip).toFixed(2));
  put('finSpanIn', IN(fin.span).toFixed(2));
  put('finSweepIn', IN(fin.sweep).toFixed(2));
  put('finThickIn', IN(fin.thickness).toFixed(3));
  put('finLeIn', IN(fin.rootLeadingEdgeFromNose).toFixed(2));
  put('massKg', d.massLiftoff.toFixed(3));
  put('cgBoIn', IN(d.xcgBurnout).toFixed(2));
  put('inertia', d.inertiaLiftoff.toFixed(3));
  put('impulse', d.totalImpulse.toFixed(1));
  put('burn', d.burnTime.toFixed(3));
  put('propG', (d.propellantMass * 1000).toFixed(1));
  put('tw', d.averageThrustToWeight.toFixed(2));
  put('noseCna', d.noseCna.toFixed(2));
  put('noseXcpIn', IN(d.noseXcp).toFixed(2));
  put('finCna', d.finCna.toFixed(2));
  put('kfb', d.finKfb.toFixed(3));
  put('finXcpIn', IN(d.finXcp).toFixed(2));
  put('cna', d.cna.toFixed(2));
  put('xcpIn', IN(d.xcp).toFixed(2));
  put('margin0', d.staticMargin.toFixed(2));
  put('marginBo', d.staticMarginBurnout.toFixed(2));
  put('centroidIn', IN(d.planformCentroid).toFixed(2));
  put('cd', d.cd.toFixed(4));
  put('fn30', (d.naturalFrequency(30) / (2 * Math.PI)).toFixed(2));
  put('zeta30', d.dampingRatio(30).toFixed(3));
  put('railV', (d.railExitSpeedPrediction / M_PER_FT).toFixed(1));
  // the half-fin and finless margins quoted in the method
  pv.setFinScale(0.5);
  put('marginHalf0', fx(pv.derived.staticMargin, 2, true));
  put('marginHalfBo', fx(pv.derived.staticMarginBurnout, 2, true));
  pv.setFinScale(0);
  put('marginNone0', fx(pv.derived.staticMargin, 2, true));
  pv.setFinScale(1);
  pv.destroy();
  const sec = geometry.buildSection({ cols: 1024, rows: 320 });
  put('cellMm', (sec.cellM * 1000).toFixed(3));
  put('dCells', sec.dCells.toFixed(1));
  // still-air apogee, flown in idle time
  idle(() => {
    const f = createFlight({ fins: geometry.finDefaults }, { bus: null });
    f.run(12);
    put('apogee', finite(f.state.apogee) ? (f.state.apogee / M_PER_FT).toFixed(0) : '—');
    f.destroy();
  });
}

/* live CAD re-measurement, once the configuration is in view and the 3D view has the assembly */
function watchGeometryCheck() {
  const row = document.getElementById('configuration');
  if (!row || typeof IntersectionObserver !== 'function') return;
  const io = new IntersectionObserver((es) => {
    if (!es.some((e) => e.isIntersecting)) return;
    const cad = scene3d && scene3d.cad;
    if (!cad) return;                         // no 2.5 MB fetch just for this; the baked copy stands
    io.disconnect();
    idle(async () => {
      try {
        const live = await loadFieldGeometry({ geometry: cad });
        const c = live.check || {};
        if (live.source === 'cad-live' && finite(c.maxRadiusDiffM)) {
          put('geomCheck', `live / agrees to ${(Math.max(c.maxRadiusDiffM, c.maxFinDiffM || 0) * 1e6).toFixed(2)} µm`);
          put('geomCheckNote', `the published assembly re-measured in this tab in ${Math.round((live.timing && live.timing.measureMs) || 0)} ms, against the baked copy`);
        }
        live.destroy();
      } catch (err) { console.warn('[field] CAD re-measurement skipped', err); }
    });
  }, { rootMargin: '200px 0px' });
  io.observe(row);
}
function updateLatticeRow() {
  const l = lat.lattice;
  if (viewKind === '2d') put('latLive', fallbackWhy === 'no-webgl2' ? 'off / no WebGL2' : 'off / no 3D view');
  else if (l && lat.live) {
    const s = l.stats || {};
    const grid = Array.isArray(s.grid) ? `${s.grid[0]} × ${s.grid[1]}` : '—';
    put('latLive', `${grid} / ${finite(s.stepsPerSecond) ? Math.round(s.stepsPerSecond) : '—'} steps/s / ${String(s.precision || '—')}`);
  } else if (l && lat.cap === 0) put('latLive', 'paused, slow frames');
  else if ((l && latticeTier() === 0) || lat.deferred) put('latLive', 'off at tier 0');
  else put('latLive', String(lat.reason || 'pending'));
}
bus.on('lattice:stats', updateLatticeRow);

/* ------------------------------------------------------------------ URL write-back */
function scheduleUrl() { clearTimeout(urlTimer); urlTimer = setTimeout(writeUrl, 400); }
function writeUrl() {
  const p = new URLSearchParams(location.search);
  const v = panel.state.values, cfg = flight.config;
  const setOr = (k, val, dflt, fmt) => { if (val === undefined || val === null || (typeof val === 'number' && Math.abs(val - dflt) < 1e-9) || val === dflt) p.delete(k); else p.set(k, fmt ? fmt(val) : String(val)); };
  setOr('fins', +cfg.finScale.toFixed(2), 1);
  setOr('cg', +(cfg.cgFromNose / M_PER_IN).toFixed(1), PAGE_CG_IN);
  setOr('rail', Math.round(cfg.railLength / M_PER_IN), EST_RAIL_IN);
  setOr('angle', +(cfg.launchAngle * DEG).toFixed(1), 0);
  setOr('wind', +(Math.abs(cfg.wind) / MPS_PER_MPH).toFixed(1), 0);
  setOr('gust', armedGust > 0 ? +armedGust.toFixed(1) : 0, 0);
  setOr('speed', rateOverride ? rateText(rateOverride) : null, null);
  setOr('view', v.view, 'smoke');
  setOr('section', v.section, 'through');
  setOr('cam', v.camera, 'side');
  const q = p.toString();
  const url = `${location.pathname}${q ? `?${q}` : ''}${location.hash}`;
  if (url !== `${location.pathname}${location.search}${location.hash}`) { try { history.replaceState(history.state, '', url); } catch { /* sandboxed */ } }
}

/* ------------------------------------------------------------------ start */
updateHeader(true);
updateCaption(true);
updateLatticeRow();
try { fillConfig(); } catch (err) { console.warn('[field] configuration table kept its static values', err); }
computeRuns();
watchGeometryCheck();

const viewReady = initView().catch((err) => { console.warn('[field] view setup failed', err); return useFallback('scene-failed'); });

(async () => {
  let ready = false;
  const timer = new Promise((r) => setTimeout(r, AUTOLAUNCH_WAIT_MS));
  await Promise.race([viewReady.then(() => { ready = true; }), timer]);
  if (URL0.hold !== undefined) { holdAt(URL0.hold); return; }
  if (URL0.autolaunch && !reducedMq.matches) {
    if (!ready) console.warn('[field] autolaunch before the 3D view was ready');
    panel.press('launch');
  }
})();

/* for probes and the lab: read-only handles */
Object.defineProperty(window, '__field', { value: Object.freeze({ flight, panel, playback, geometry, get scene() { return scene3d || fbView; }, get lattice() { return lat.lattice; }, get slot() { return { ...lat }; } }) });
