/* main.js: the integrator of the CHARGER field study (FIELD.md section 8).

   It owns no physics and no drawing. It builds the collaborators, wires them and
   drives one animation loop:
     flight   vx/js/flight/flight.js   createFlight, stepped here (frame seconds x rate)
     geometry vx/js/geom/geom.js       the baked CAD measurement (synchronous, no fetch)
     panel    vx/js/panel/panel.js     readouts, controls, strip chart, phone sheet
     scene    vx/js/scene/scene.js     the 3D stage, imported only when WebGL is there
     fallback vx/js/panel/fallback.js  the 2D side view when there is no WebGL2
     lattice  vx/js/lattice/lattice.js through attachLattice() below (the LATTICE SLOT)
     story    vx/js/story.js           the run tracker, the pre-flight plans and the ramp, the narrator,
                                       the director, the end card, the title plate, the slate

   Init order: governor pin (?tier) -> geometry -> flight (URL config applied) ->
   playback -> panel (lattice stub 'lattice pending') -> scene (dynamic import) or the
   2D fallback -> scene.ready -> attachLattice -> ?hold or ?autolaunch. The runs and the
   configuration table are computed with silent preview flights in idle time.

   Playback (handed to the panel): {rate, auto, holding, narrating, rateLabel, plan, setRate,
   launch, pause, resume, step, reset, paused, running, done, atApogee}. The rate is the true rate
   (flight seconds per wall second). Until the visitor or ?speed picks one it follows the launch's
   beat plan (story.js planFlight, a silent pre-flight of the same configuration and armed gust,
   cached by createPlanner): 1/8 on the rail, a slow rate from rail exit through the wobble
   (about 1/20 for the default launch), a 1.5 s HOLD at the first pitch extreme (rate 0, the clock
   stopped, the header reads HOLD), 1/4 by the settle and real time by about T+1.6 s; never
   faster than real time. Without a plan it falls back to 1/8 until 3 s after burnout, then 1. The
   flight is advanced by min(frame seconds, 0.25) x rate, one 1 ms flight step at a time
   (advanceFlight), so the run tracker and the narrator sample it on the run cards' 5 ms grid and
   the apogee stop lands on the first grid step at or after the apogee event.

   Apogee stop and end card (PRESENTATION-PLAN item 2): every launch pauses at apogee and the end
   card (story.js) shows the apogee and the settle time of the flight just flown, with the run
   cards' definitions (createRunTracker), so the default launch's card equals the Run 05 card.
   REPLAY resets and launches the same configuration; WITHOUT FINS (WITH FINS after a finless
   flight) does the same with the other fin choice; CONTINUE PAST APOGEE (or PAUSE, Space, or
   STEP) resumes, and the flight runs on to 2 s past apogee as flight.js defines; LAUNCH or L at
   the card starts a new flight. flight.js is unchanged.

   Default launch: with no flight setting in the URL (fins, cg, rail, angle, wind, gust, hold), the
   page arms the 11.2 mph EST gust for rail exit, so LAUNCH, L and a bare ?autolaunch=1 fly Run
   05's conditions. The title plate's two pills (data-launch="fins" | "nofins", wave 2) call
   launchDefault: reset to the study defaults, sync the lattice section, back to the stage, launch.

   The front door (item 3): the header carries the MERT TURELI wordmark, the time code with the
   true rate and CASE STUDY, RUNS, SITE (GRID, TIER and ENGINE are in the panel's lattice line).
   The title plate (static HTML in the stage, the page's h1) hides on any launch, a ?hold or the
   first drag across the view, and comes back when the flight is reset to the pad; the 3D plates
   step aside while it shows. The hint line shows only on the idle pad.

   The narrated replay (item 7): the narrator (story.js) writes one plain caption at each state
   transition into the stage's caption slot (the polite live region while it narrates; the panel's
   event lines are muted then, and its phone peek row shows the caption), the plates dim to the
   beat's subject through scene.setEmphasis when the scene has it, the slate names the launch's
   conditions for 1.2 s and then sits quietly under the time code (the GUST / DISARM pill shows
   only on the pad), and under reduced motion NEXT BEAT and PREVIOUS BEAT step to the plan's beat
   times. The camera director (story.js createDirector, item 12, through the scene's own API) runs
   until the visitor picks a camera or orbits.

   The AUTO view (item 8): unless the visitor or ?view picked a view, the slice shows smoke on the
   pad, pressure from rail exit to the end of the wobble (or the pitch past 60 deg) and smoke after,
   with a 240 ms fade out and a 480 ms fade in at each switch; the caption slot carries the legend.

   Section sync at a launch (item 1b): a run start, the default launch, the end card's fin toggle
   and the panel's prepareLaunch hook rebuild the lattice section synchronously before the flight
   starts (syncSectionNow) and restart the flow when the solid changed, as a ?fins= load does.

   DOM events on the stage element (not bus events): field:launch {config, armedGustMph, plan} when
   a flight is ignited through playback, and field:end {summary} when the end card shows.

   URL state (read once at load; the panel's settings are written back with
   history.replaceState): ?fins=0..1.5|none|half|full ?cg=<in> ?rail=<in> ?angle=<deg>
   ?wind=<mph> ?gust=<mph, fired at rail exit; 0 for still air> ?speed=1/32|1/8|1/2|1 ?view=smoke|
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
import { createFlight, DT as FLIGHT_DT } from './flight/flight.js';
import { getBakedGeometry, loadFieldGeometry } from './geom/geom.js';
import { mountPanel } from './panel/panel.js';
import { createFallbackView } from './panel/fallback.js';
import {
  createStory, createRunTracker, createPlanner, createNarrator, createDirector as createStoryDirector, SAMPLE_STEPS, RAMP, EMPHASIS,
  RUNS as RUN_SETUPS, LAUNCHES as LAUNCH_SETUPS, GUST_DEFAULT_MPH as STORY_GUST_MPH, runFlightConfig, runCardValues, ledeFigure, runSketch, figureFinWords,
  configValues, stillAirApogee, CG_DEFAULT_IN,
} from './story.js';

/* ------------------------------------------------------------------ constants */
const DEG = 180 / Math.PI;
const RAD = Math.PI / 180;
const M_PER_IN = 0.0254;               // STD, exact
const M_PER_FT = 0.3048;               // STD, exact
const MPS_PER_MPH = 0.44704;           // STD, exact
const RATES = [1 / 32, 1 / 8, 1 / 2, 1];
const AUTO_SLOW = RAMP.RAIL;           // EST: the replay's rate on the pad and on the rail (story.js RAMP)
/* without a beat plan (it failed, or a ?hold flight resumed) the replay falls back to the old rule:
   1/8 of real time until AUTO_AFTER_BURNOUT_S after burnout, then real time */
const AUTO_FAST = 1;
const AUTO_AFTER_BURNOUT_S = 3;
const VIEW_FADE_OUT_MS = 240, VIEW_FADE_IN_MS = 480;   // item 8: the AUTO view switch (the site's durations)
const HOLD_LATE_S = 0.01;              // s: a HOLD more than this past its pitch extreme is skipped (the flight was stepped past it)
const BEAT_PAST = 0.005;               // s: NEXT BEAT stops one 5 ms sample past a beat, so the state that names it has been sampled
const MAX_FRAME_S = 0.25;              // a long frame never advances more than this of screen time (the flight's own per-call clamp)
/* the page's CG: the CAD airframe's estimate at the page mass, 27.17 in EST (story.js CG_DEFAULT_IN, flight.js
   CG_ESTIMATE_CAD); the case study's 22 in (PAGE) belongs to its 37 in design (Method 05, flag vx-cg) */
const CG_URL_IN = +CG_DEFAULT_IN.toFixed(1);   // the default as the panel and the URL print it (27.2): a ?cg within 0.05 in of it is the default
const EST_RAIL_IN = 72;                // EST, a 6 ft rail
const GUST_DEFAULT_MPH = STORY_GUST_MPH;   // EST: the 5 m/s of the FIELD 3 test, 11.2 mph (story.js); the default launch arms it for rail exit
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
/* the true rate as the header prints it: 1/n when n is within 3 percent of it (1/8 on the rail, the
   plan's slow rate, 1/4), 1 at real time, else the multiplier to two decimals (the ramp's eases between
   them), so a rate of 0.69 never reads 1/1 */
const rateText = (r) => {
  if (!(r > 0)) return '—';
  if (r >= 0.995) return '1';
  const n = Math.round(1 / r);
  return n >= 2 && Math.abs(n * r - 1) <= 0.03 ? `1/${n}` : `${r.toFixed(2)}×`;
};
const NB = '\u00a0';               // a number and its unit, and a separator and the segment before it, never part at a line break
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
const capKey = $('[data-cap-key]');
const head = Object.fromEntries([...document.querySelectorAll('[data-h]')].map((el) => [el.dataset.h, el]));
let lastHead = 0, lastCap = 0;         // header strip and caption throttles
const write = (el, s) => { if (el && el.textContent !== s) el.textContent = s; };
/* the same for a caption line whose hyphenated words never break, at the hyphen or from a short word before
   them (NOT TIME-ACCURATE stays one piece on a phone) */
const writeNw = (el, s) => {
  if (!el || el.textContent === s) return;
  el.textContent = '';
  for (const part of String(s).split(/((?:\S{1,3} )?\S+-\S+)/)) {
    if (!part) continue;
    if (/-\S/.test(part) && !/\s\S+\s/.test(part)) { const n = document.createElement('span'); n.className = 'fd-nw'; n.textContent = part; el.appendChild(n); }
    else el.appendChild(document.createTextNode(part));
  }
};
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
// ?bench=1 | full | quick: the self-benchmark (C2 section 9). It ignores ?autolaunch, ?hold and ?speed, and ?tier
// limits its engine and pacing phases to that tier instead of pinning the page
const BENCH = (() => { const v = (params.get('bench') || '').trim().toLowerCase(); return v === '1' || v === 'full' ? 'full' : v === 'quick' ? 'quick' : null; })();
if (BENCH) { URL0.autolaunch = false; URL0.hold = undefined; URL0.speed = undefined; }
// a written-back 11.2 is the default gust (5 m/s), not 11.2 mph exactly: the same flight as Run 05 after a reload
if (URL0.gust !== undefined && Math.abs(URL0.gust - GUST_DEFAULT_MPH) < 0.05) URL0.gust = GUST_DEFAULT_MPH;
// any flight setting in the URL: that configuration, as given; none: the default launch (the gust armed)
URL0.config = ['fins', 'cg', 'rail', 'angle', 'wind', 'gust', 'hold'].some((k) => URL0[k] !== undefined);

/* ------------------------------------------------------------------ governor */
let bench = null;           // the self-benchmark while it runs: {hold, tick, event, label, res} (?bench)
let benchResult = null;     // its last result
let runsDone = false;       // the run previews, the figures and the pad's plan are flown (computeRuns)
if (BENCH) governor.pin(benchTiers()[0]);   // pinned before the governor starts, so it never adapts during the bench
else if (URL0.tier !== undefined) governor.pin(Math.round(URL0.tier));
governor.start();

/* ------------------------------------------------------------------ geometry and flight */
const geometry = getBakedGeometry();              // CAD, measured by geom-measure.js and baked; no fetch
const flightConfig = { fins: geometry.finDefaults, cgFromNose: CG_DEFAULT_IN * M_PER_IN };
if (URL0.fins !== undefined) flightConfig.finScale = URL0.fins;
if (URL0.cg !== undefined && Math.abs(URL0.cg - CG_URL_IN) > 0.05) flightConfig.cgFromNose = URL0.cg * M_PER_IN;
if (URL0.rail !== undefined) flightConfig.railLength = URL0.rail * M_PER_IN;
if (URL0.angle !== undefined) flightConfig.launchAngle = URL0.angle * RAD;
if (URL0.wind !== undefined) flightConfig.wind = URL0.wind * MPS_PER_MPH;
if (URL0.seed !== undefined) flightConfig.seed = Math.round(URL0.seed);
const flight = createFlight(flightConfig);

/* ------------------------------------------------------------------ playback */
let rateOverride = URL0.speed;                    // undefined = automatic
let paused = false;
let hold = null;                                  // {alphaDeg, t} while a ?hold is shown
// mph, fired at rail exit on every launch until disarmed: the default launch arms the 11.2 mph EST gust
let armedGust = URL0.gust !== undefined ? (URL0.gust > 0 ? URL0.gust : 0) : (URL0.config ? 0 : GUST_DEFAULT_MPH);
let flightGustMph = 0;      // the gust the flight in progress was launched with (it fires, or fired, at rail exit); DISARM changes armedGust, the next launch's
let shownRate = '';
let urlTimer = 0;
let atApogee = false;       // paused by the page at apogee, the end card up
let pastApogee = false;     // CONTINUE PAST APOGEE for this flight: no second stop
let stepAcc = 0;            // flight seconds not yet stepped (advanceFlight steps 1 ms at a time)
let firingArmed = false;    // the armed gust is being fired through the panel (its onControl echo is not a visitor's gust)
let flown = null;           // what the flight in progress was given: {gusts: [{mph, t, armed}], flicks: [t]}
let endSummary = null;      // the last end card's figures (the run tracker's result)
let plan = null;            // the beat plan of the flight in progress (story.js planFlight): beats, ramp, HOLD
let freeze = null;          // {left: ms} while the replay holds at the first pitch extreme (HOLD)
let freezeDone = false;     // this flight's HOLD has played, or the flight left the plan
let planValid = false;      // the flight in progress still repeats its pre-flight (no visitor gust, flick or setting changed)
let chartGhost = null;      // item 11: the flight kept as a labeled ghost trace after the end card's fin toggle
let quiet = false;          // a ?hold flight is being set up: no narration, no director, no slate
let director = null;        // the camera director (story.js createDirector), once the 3D scene exists
let draggedSinceReset = false;   // the visitor dragged across the view since the last reset: the title plate stays away
let viewAuto = !URL0.view;   // the AUTO view (item 8), used when the panel has no AUTO of its own (panel.setAutoView)
let viewFade = null;         // {phase: 'out' | 'in', t0, to} while an AUTO switch fades the slice
let autoOffered = false;     // the first AUTO pick has offered AUTO in the panel's view group
const tracker = createRunTracker(flight);   // the run cards' definitions, on the live flight
const planner = createPlanner();            // pre-flights cached by configuration (story.js)
/* the narrator writes the caption slot (a polite live region while it narrates) and picks the plate
   the beat is about; the plates dim only while the replay plays (applyEmphasis) */
const narrator = createNarrator({
  onCaption: (text) => showCaption(text),
  onEmphasis: () => applyEmphasis(),
});
/* one caption, three places: the stage's caption slot (the polite live region while it narrates), the
   phone sheet's peek row (panel.setPeekCaption, when the panel has it, not live, so it is spoken once)
   and the panel's event lines, muted while the caption speaks (panel.muteEvents) */
function showCaption(text) {
  if (story) story.caption(text, { live: !!text });
  if (panel && typeof panel.setPeekCaption === 'function') {
    try { panel.setPeekCaption(text || '', { live: false }); stage.toggleAttribute('data-peek-cap', !!text); }
    catch (err) { console.warn('[field] panel.setPeekCaption failed', err); }
  }
  if (panel && typeof panel.muteEvents === 'function') panel.muteEvents(!!text);
}

function burnoutT() { const e = flight.events.find((x) => x.name === 'burnout'); return e ? e.t : NaN; }
/* the beat plan for a configuration and an armed gust: cached, else flown now (tens of ms) */
function planOf(config, gustMph) {
  try { return planner.plan(config, { gustMph: gustMph > 0 ? gustMph : 0 }); }
  catch (err) { console.warn('[field] the pre-flight failed; the replay uses the plain rate', err); return null; }
}
/* One 1 ms flight step at a time: the run tracker and the narrator sample every SAMPLE_STEPS
   steps (the run cards' 5 ms grid, so the live figures equal the cards'), and the apogee stop
   comes on the first grid step with an apogee. While the auto rate plays (auto: true, from the
   frame loop), the replay holds for plan.freezeMs at the plan's first pitch extreme: the step
   that would pass it is not taken and the HOLD starts. At most 250 steps a frame (0.25 s of
   screen time at real time); a STEP of 10 s is 10,000, a few milliseconds. The trajectory is the
   same for any step pattern (flight.js integrates at a fixed 1 ms). */
function advanceFlight(seconds, { auto = false } = {}) {
  if (finite(seconds) && seconds > 0) stepAcc += seconds;
  while (stepAcc >= FLIGHT_DT * (1 - 1e-9) && flight.ignited && !flight.done && !atApogee) {
    if (!freezeDone && plan && finite(plan.freezeAt) && flight.state.t >= plan.freezeAt - 1e-9) {
      // the HOLD plays only where it belongs: a flight stepped past the first pitch extreme (STEP,
      // NEXT BEAT) and then resumed does not freeze later on (at the end card, say)
      if (!auto || rateOverride || flight.state.t > plan.freezeAt + HOLD_LATE_S) freezeDone = true;
      else { freezeDone = true; freeze = { left: plan.freezeMs }; stepAcc = 0; break; }
    }
    flight.step(FLIGHT_DT);
    stepAcc -= FLIGHT_DT;
    if (flight.state.stepIndex % SAMPLE_STEPS !== 0) continue;
    tracker.sample();
    if (!quiet) narrator.sample(flight);
    if (!pastApogee && finite(flight.state.apogee)) { stopAtApogee(); break; }
  }
  if (flight.done || atApogee || !flight.ignited) stepAcc = 0;
}
function igniteFlight() {
  if (flight.ignited || flight.done) return false;
  flight.ignite();
  tracker.start();
  atApogee = false; pastApogee = false; stepAcc = 0; endSummary = null;
  freeze = null; freezeDone = false;
  flown = { gusts: [], flicks: [], changed: NaN };
  flightGustMph = armedGust > 0 ? armedGust : 0;
  lastActivity = performance.now();
  story.hidePlate();
  if (quiet) { plan = null; planValid = false; narrator.stop(); }
  else {
    // the silent pre-flight of this very configuration and armed gust: the beat times, the ramp, the HOLD
    plan = planOf(flight.config, flightGustMph);
    planValid = !!plan;
    narrator.start(plan);
    story.slate(slateText(), { loud: true });
    if (director) director.launch();
  }
  updateCaption(true);
  stage.dispatchEvent(new CustomEvent('field:launch', { detail: { config: { ...flight.config }, armedGustMph: armedGust, plan: plan ? { kind: plan.kind, slow: plan.slow, freezeAt: plan.freezeAt, beats: { ...plan.beats } } : null } }));
  return true;
}
/* the rate label the header (and, on request, the panel) prints: always the true rate */
function rateLabel() {
  if (hold || (freeze && !rateOverride)) return 'HOLD';
  if (flight.ignited && !flight.done && paused) return 'PAUSED';
  return `${rateText(playback.rate)} ${playback.auto ? 'AUTO' : 'SET'}`;
}
const playback = {
  /* the true rate: flight seconds per wall second. A rate button or ?speed wins; else the plan's
     ramp (0 during the HOLD); else, on the pad or without a plan, 1/8 (then the old rule). */
  get rate() {
    if (rateOverride) return rateOverride;
    if (freeze) return 0;
    if (plan && flight.ignited) return plan.rateAt(flight.state.t);
    const bo = burnoutT();
    return finite(bo) && flight.state.t >= bo + AUTO_AFTER_BURNOUT_S ? AUTO_FAST : AUTO_SLOW;
  },
  get auto() { return !rateOverride; },
  get holding() { return !!freeze && !rateOverride; },       // the replay's HOLD (rate 0, the clock stopped)
  get narrating() { return narrator.on && !!narrator.caption; },   // the caption slot speaks (the panel can mute its event lines)
  get rateLabel() { return rateLabel(); },
  get plan() { return plan; },
  setRate(r) { const s = snapRate(Number(r)); if (s) { rateOverride = s; freeze = null; kick(); } },
  get paused() { return paused && flight.ignited && !flight.done; },
  get running() { return flight.ignited && !flight.done && !paused; },
  get done() { return flight.done; },
  get atApogee() { return atApogee; },
  /* item 11, for the strip chart (all SIM, the run cards' definitions; see beatsNow): the beats of the
     flight in progress, the pre-flight a LAUNCH from the pad would fly (its trace dims the empty chart)
     and the flight kept as a labeled ghost after the end card's fin toggle (cleared on a visitor's reset) */
  get beats() { return beatsNow(); },
  get preview() { return flight.ignited ? null : planner.peek(flight.config, { gustMph: armedGust > 0 ? armedGust : 0 }); },
  get ghostTrace() { return chartGhost; },
  launch() {
    clearHold();
    // at the end card LAUNCH starts a new flight (CONTINUE PAST APOGEE, PAUSE and Space resume this one)
    if (flight.done || atApogee) { endFlight(); flight.reset(); }
    igniteFlight();
    paused = false;
    kick();
  },
  pause() { if (flight.ignited && !flight.done) paused = true; kick(); },
  resume() { clearHold(); if (atApogee) continuePast(); paused = false; kick(); },
  play() { this.resume(); },
  step(seconds = 0.1) {
    const s = finite(seconds) && seconds > 0 ? Math.min(seconds, 10) : 0.1;
    if (flight.done) return;
    clearHold();
    igniteFlight();
    if (atApogee) continuePast();          // a STEP at the end card steps on past apogee
    paused = true;
    advanceFlight(s);
    narrator.frame(0, false);              // the beat the step passed shows now, not on the next frame (a slow frame is half a second)
    syncScene(); kick();
  },
  reset() { clearHold(); paused = false; endFlight(); flight.reset(); kick(); },
};
/* the apogee stop: pause, the end card with the tracker's figures, a field:end event */
function stopAtApogee() {
  atApogee = true; paused = true; stepAcc = 0; freeze = null;
  endSummary = tracker.result();
  const cfg = flight.config;
  const conditions = conditionsText();
  narrator.stop();                       // the narration ends at apogee: the end card takes over
  story.slate(null);
  story.showEnd({ apogeeFt: endSummary.apogee, settleS: endSummary.settle, theta60: endSummary.theta60, margin0: endSummary.margin0, gust: finite(endSummary.gustT), finScale: cfg.finScale, conditions, lateSettle: lateSettle() });
  // item 10: the director has put the end plate up (inside the step that ended the climb); its caption
  // names the two paths and their conditions. The ghost can land a moment later, so it is read again.
  showPlateCaption();
  setTimeout(() => { if (atApogee) showPlateCaption(); }, 250);
  stage.dispatchEvent(new CustomEvent('field:end', { detail: { summary: { ...endSummary }, conditions, finScale: cfg.finScale } }));
  if (panel) panel.wake();
}
/* The run cards' settle figure (the last sample at 2 deg or more before apogee) is the end of the wobble,
   which the narration calls STRAIGHT AGAIN, unless the angle rises past 2 deg again later in the climb
   (Run 04's 10 mph crosswind near apogee). Then the end card and the chart name that figure for what it
   is (story.js showEnd; beats.settleLate). Known only while the flight repeats its pre-flight. */
function lateSettle() {
  if (!plan || !planValid) return false;
  const b = plan.beats;
  return plan.kind !== 'over' && finite(b.settle) && finite(b.settleLast) && b.settleLast - b.settle > 0.05;
}
/* The beats of the flight in progress for the chart's event ticks (item 11), with the run cards'
   definitions, so PEAK and SETTLED read what the cards and the end card read:
     peakAlpha  the largest |alpha| after rail exit, ascent, airspeed above 50 ft/s (deg); peakT its time
     settleS    the time back under 2 deg after the gust (after rail exit without one), the last sample at
                2 deg or more before apogee (s); settle = that sample's flight time
     railExit, gust, burnout, apogee (s), apogeeFt, pitch60 (the pitch past 60 deg of a rocket that turns over)
   From the pre-flight while the flight repeats it (source 'plan', known from ignition); after a
   visitor's gust, flick or setting it is known only at apogee, from the live tracker (source 'flight').
   null on the pad and for a ?hold. */
function beatsNow() {
  if (!flight.ignited || hold) return null;
  const cfg = flight.config;
  if (plan && planValid) {
    const r = plan.result, b = plan.beats;
    const from = finite(r.gustT) ? r.gustT : r.railT;
    return Object.freeze({ source: 'plan', kind: plan.kind, finScale: cfg.finScale, gustMph: plan.gustMph,
      railExit: r.railT, gust: r.gustT, peakT: r.peakT, peakAlpha: r.peakAlpha, settle: r.settle > 0 && finite(from) ? from + r.settle : NaN, settleS: r.settle,
      settleLate: lateSettle(), wobbleEnd: b.settle,
      pitch60: b.pitch60, theta60: r.theta60, burnout: b.burnout, apogee: r.apogeeT, apogeeFt: r.apogee });
  }
  if (!endSummary) return null;
  const r = endSummary, from = finite(r.gustT) ? r.gustT : r.railT;
  return Object.freeze({ source: 'flight', kind: null, finScale: cfg.finScale, gustMph: null,
    railExit: r.railT, gust: r.gustT, peakT: r.peakT, peakAlpha: r.peakAlpha, settle: r.settle > 0 && finite(from) ? from + r.settle : NaN, settleS: r.settle,
    pitch60: r.margin0 < 0 ? r.theta60 : NaN, theta60: r.theta60, burnout: burnoutT(), apogee: r.apogeeT, apogeeFt: r.apogee });
}
/* the flight just flown, to apogee, as the chart's ghost (item 11): its pre-flight's trace when it
   repeated it, else its own history. [[t, alphaDeg, thetaDeg], ...] every 10 ms. */
function keepChartGhost() {
  if (!flight.ignited || hold) { chartGhost = null; return; }
  let trace;
  if (plan && planValid) trace = plan.trace;
  else {
    const apoT = endSummary && finite(endSummary.apogeeT) ? endSummary.apogeeT : (finite(flight.state.apogee) ? flight.state.t : Infinity);
    trace = [];
    flight.history.forEach((h) => { if (h.phase !== 'pad' && h.t <= apoT + 1e-9) trace.push(Object.freeze([h.t, h.alpha * DEG, h.theta * DEG])); });
    trace = Object.freeze(trace);
  }
  chartGhost = Object.freeze({ label: figureFinWords(flight.config.finScale), finScale: flight.config.finScale, trace, beats: beatsNow() });
}
function clearChartGhost() { if (chartGhost) { chartGhost = null; if (panel) panel.wake(); } }
function continuePast() { atApogee = false; pastApogee = true; story.hideEnd(); story.slate(slateText()); }
function endFlight() { atApogee = false; pastApogee = false; stepAcc = 0; freeze = null; freezeDone = false; plan = null; narrator.stop(); story.slate(null); story.hideEnd(); }
const finWords = (k) => (Math.abs(k - 1) < 0.005 ? 'Full fins' : k < 0.005 ? 'No fins' : Math.abs(k - 0.5) < 0.005 ? 'Half fins' : `Fin scale ${k.toFixed(2)}`);
/* the end card's conditions line, sentence case (the card sets it in caps): what this flight was given.
   Each number keeps its unit, and each separator the segment before it, across a line break (NB). */
const joinParts = (parts) => parts.join(`${NB}/ `);
function conditionsText() {
  const cfg = flight.config;
  const windMph = Math.abs(cfg.wind) / MPS_PER_MPH;
  const parts = [finWords(cfg.finScale), windMph < 0.05 ? 'still air' : `wind ${windMph.toFixed(1)}${NB}mph EST`];
  for (const g of (flown && flown.gusts) || []) parts.push(g.armed ? `gust ${g.mph.toFixed(1)}${NB}mph EST at rail exit` : `gust ${g.mph.toFixed(1)}${NB}mph EST at T+${g.t.toFixed(2)}${NB}s`);
  for (const t of (flown && flown.flicks) || []) parts.push(`flick at T+${t.toFixed(2)}${NB}s`);
  const cgIn = cfg.cgFromNose / M_PER_IN, railIn = cfg.railLength / M_PER_IN, angleDeg = cfg.launchAngle * DEG;
  if (Math.abs(cgIn - CG_DEFAULT_IN) > 0.05) parts.push(`CG ${cgIn.toFixed(1)}${NB}in`);
  if (Math.abs(railIn - EST_RAIL_IN) > 0.5) parts.push(`rail ${railIn.toFixed(0)}${NB}in`);
  if (Math.abs(angleDeg) > 0.05) parts.push(`launch angle ${fx(angleDeg, 1, true)}°`);
  // a setting changed during the flight (a slider): the settings above are the last ones, so say when
  if (flown && finite(flown.changed)) parts.push(`settings changed at T+${flown.changed.toFixed(2)}${NB}s`);
  return joinParts(parts);
}
/* the slate (item 7): what this launch flies, as the launch starts (the armed gust has not fired yet).
   During a flight it names that flight's gust (flightGustMph), not the next launch's. */
function slateText() {
  const cfg = flight.config;
  const windMph = Math.abs(cfg.wind) / MPS_PER_MPH;
  const parts = [finWords(cfg.finScale), windMph < 0.05 ? 'still air' : `wind ${windMph.toFixed(1)}${NB}mph EST`];
  const gust = flight.ignited ? flightGustMph : armedGust;
  if (gust > 0) parts.push(`gust ${gust.toFixed(1)}${NB}mph EST at rail exit`);
  const cgIn = cfg.cgFromNose / M_PER_IN, railIn = cfg.railLength / M_PER_IN, angleDeg = cfg.launchAngle * DEG;
  if (Math.abs(cgIn - CG_DEFAULT_IN) > 0.05) parts.push(`CG ${cgIn.toFixed(1)}${NB}in`);
  if (Math.abs(railIn - EST_RAIL_IN) > 0.5) parts.push(`rail ${railIn.toFixed(0)}${NB}in`);
  if (Math.abs(angleDeg) > 0.05) parts.push(`launch angle ${fx(angleDeg, 1, true)}°`);
  return joinParts(parts);
}
/* the plates dim to the beat's subject only while the replay plays (scene.setEmphasis, when the
   scene has it); full strength paused, at the end and on the pad */
let emphasisKey = '';
function applyEmphasis() {
  const s = scene3d;
  const list = playback.running && narrator.on && narrator.id ? (EMPHASIS[narrator.id] || null) : null;   // the beat's subject stays lit through the HOLD too
  const key = list ? list.join(',') : '';
  if (key === emphasisKey) return;
  emphasisKey = key;
  if (s && typeof s.setEmphasis === 'function') { try { s.setEmphasis(list); } catch (err) { console.warn('[field] scene.setEmphasis failed', err); } }
}

/* armed gust: fired through the panel (it announces it) when the forward button leaves the rail;
   the run tracker counts the settle time from it, as the run previews do for Run 05. The director
   pushes in at rail exit and eases out at burnout (item 12), while the replay plays. */
flight.onEvent((e) => {
  if (e.name === 'railExit' && flightGustMph > 0 && panel) {
    const mph = flightGustMph;
    firingArmed = true;
    try { panel.press('fireGust', mph); } finally { firingArmed = false; }
    tracker.noteGust(e.t);
    if (!quiet) narrator.noteGust(e.t, mph, { planned: true });
    if (flown) flown.gusts.push({ mph, t: e.t, armed: true });
  }
  // the scene's director follows the flight's events itself; the plain one is driven from here
  if (quiet || !director || sceneDirector) return;
  if (e.name === 'railExit') director.railExit(pushInMs());
  if (e.name === 'burnout') director.burnout();
});
/* wall ms from rail exit to the end of the wobble at the rate that will play it (the push-in's length) */
function pushInMs() {
  if (!plan) return 6000;
  const b = plan.beats, end = plan.kind === 'over' ? b.pitch60 : plan.kind === 'wobble' ? b.settle : b.railExit + 0.5;
  if (rateOverride) return 1000 * (end - b.railExit) / rateOverride;
  return 1000 * plan.screen(b.railExit, end) + (finite(plan.freezeAt) ? plan.freezeMs : 0);
}

/* ------------------------------------------------------------------ panel */
const LATTICE_STUB = (reason) => ({ fallback: reason, force: null, stats: { grid: null, fallback: reason }, setView() {} });
let panel = null;
panel = mountPanel(stage, {
  flight, playback, geometry, scene: null, lattice: LATTICE_STUB('lattice pending'), headingLevel: 2,
  defaults: Object.assign({}, URL0.view ? { view: URL0.view } : {}, URL0.section ? { section: URL0.section } : {}, URL0.cam ? { camera: URL0.cam } : {}),
  // the CG slider's tagged default: the CAD estimate (EST), not the case study's 22 in
  refs: { cg: `EST ${CG_URL_IN.toFixed(1)}` },
  // the panel's page hooks (its RUNS row and DISARM); hoisted function declarations below
  startRun: (key) => startRun(key), disarmGust: () => disarmGust(), armedGust: () => armedGust,
  // before a panel launch that starts a new flight (LAUNCH, L, peek play and its FINS toggle): the
  // lattice gets the section for the fins now set (item 1b)
  prepareLaunch: () => prepareLaunch(),
});
/* the story layer: the end card at apogee and the caption slot (story.js) */
const story = createStory({
  stage,
  onReplay: () => replayFlight(),
  onToggleFins: (to) => toggleFins(to),
  onContinue: () => { playback.resume(); stage.focus({ preventScroll: true }); },
  onBeat: (dir) => beat(dir),
  onPlate: () => { syncPlateMarkers(); updateCaption(true); kick(); },
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
  syncPlateMarkers(s);
}
/* the title plate is a title card: the 3D plates (CG, CP, ALT and the arrows) step aside while it
   shows, so they do not run through its words; the panel's MARKERS setting comes back with them.
   On a phone the plate covers the lower half of the view: the slice fades out under it (its white
   lines ran behind the 10 px eyebrow) and padFraming lifts the rocket into the band above it. */
function syncPlateMarkers(s = scene3d) {
  if (!s || typeof s.setMarkers !== 'function') return;
  s.setMarkers(panelValue('markers', true) !== false && !story.plateShown);
  const phonePlate = phoneMq.matches && story.plateShown;
  if (phonePlate) { sliceOpacity(0); slicePlateHidden = true; }
  else if (slicePlateHidden) {
    // the plate has gone: the slice fades back in as an AUTO switch does (instant without one)
    slicePlateHidden = false;
    if (!viewFade && lat.live && isViewAuto() && !reducedMq.matches && governor.tier > 0) { viewFade = { phase: 'in', t0: performance.now(), to: panelValue('view', 'smoke') }; kick(); }
    else if (!viewFade) sliceOpacity(1);
  }
  padFraming(s);
}
let slicePlateHidden = false;   // the slice is faded out under the phone's title plate
/* The phone's front door: while the title plate is up and the director still holds the empty stage's
   hero view, the rocket is framed farther out with the aim moved toward the tail, so it stands in the
   band above the plate instead of under its h1 (camera.js setFraming: k scales the fit, a positive aimM
   moves the aim point toward the tail, so the rocket rides up the screen). EST, framing choices. The
   director's own launch and reset framing replace it (director.js begin and pad); padFraming runs again
   after each director.pad(). */
const PHONE_PAD_FRAMING = Object.freeze({ k: 2.3, aimM: 1 });   // aimM 1 m is camera.js's limit (FRAMING_AIM_M); the nose and body clear the plate's h1, the fins meet its eyebrow
let padFramed = false;
function padFraming(s = scene3d) {
  if (!s || typeof s.setFraming !== 'function' || !director || !director.active || !sceneDirector || flight.ignited) { padFramed = false; return; }
  const want = phoneMq.matches && portraitMq.matches && story.plateShown;   // a cut, not a move, so reduced motion too; a landscape phone keeps the plate left of the rocket
  if (want) { s.setFraming(PHONE_PAD_FRAMING, { animate: false }); padFramed = true; }
  else if (padFramed) { s.setFraming(null, { animate: false }); padFramed = false; }
}
const portraitMq = matchMedia('(orientation: portrait)');
phoneMq.addEventListener('change', () => syncPlateMarkers());
portraitMq.addEventListener('change', () => syncPlateMarkers());

/* The camera director (items 10 and 12): the scene's (vx/js/scene/director.js) when it loaded,
   driven by the flight's own events: the hero view on the empty stage, side from ignition, the push-in
   to the settle, the ease-out from burnout and, at apogee, the end plate: the whole path from the pad
   with the other fin choice as a ghost, flown silently in this tab (ghostFlight), clear of the end card
   and the phone sheet. A camera in the URL or picked in the panel, or an orbit, stands it down for good.
   Without the scene's module the plain story.js director runs (no plate). */
let sceneDirector = false;
let cameraPicked = false;  // the visitor picked a camera: a director made later (a scene back from a lost context) starts released
function makeDirector(s, dmod) {
  const reduced = () => reducedMq.matches || governor.tier === 0;
  if (dmod && typeof dmod.createDirector === 'function') {
    try {
      // the flight's own gust (flightGustMph), so a DISARM during the flight does not change what its plate claims
      const d = dmod.createDirector(s, { flight, reduced, plan: () => plan, gustMph: () => flightGustMph, ghost: (cfg, o) => ghostFlight(cfg, o && o.gustMph), avoid: plateAvoid });
      sceneDirector = true;
      if (typeof s.setOverlays === 'function') s.setOverlays(overlayEls);
      return d;
    } catch (err) { console.warn('[field] the scene director failed; using the plain one', err); }
  }
  sceneDirector = false;
  return createStoryDirector(s, { reduced });
}
/* the ghost on the end plate: the same configuration and armed gust with the other fin choice (no fins
   after a finned flight, full fins after a finless one), the planner's silent pre-flight, moved into the
   flight frame the scene draws (the pre-flight's path is downrange and altitude from the pad) */
function ghostFlight(cfg, gustMph) {
  const other = cfg && cfg.finScale > 0.005 ? 0 : 1;
  const p = planOf({ ...cfg, finScale: other }, gustMph);
  if (!p) return null;
  const st = flight.state;
  const ox = finite(st.x) && finite(st.downrange) ? st.x - st.downrange : 0;
  const oy = finite(st.y) && finite(st.altitude) ? st.y - st.altitude : 0;
  return { points: p.path.map((q) => ({ x: q.x + ox, y: q.y + oy })), finScale: other, apogeeFt: p.result.apogee };
}
/* what the plate keeps clear: the end card, and on a phone the sheet's peek row */
function plateAvoid() {
  const out = [];
  const card = stage.querySelector('[data-end]');
  if (card && !card.hidden) out.push(card);
  const sheet = phoneMq.matches ? stage.querySelector('.pn') : null;
  if (sheet) out.push(sheet);
  return out;
}
/* the page's DOM over the canvas: the 3D plates and the plate's tick labels keep off it */
function overlayEls() {
  return [...stage.querySelectorAll('.fd-badges > :not([hidden])'), stage.querySelector('[data-end]:not([hidden])')].filter(Boolean);
}
/* the end plate's caption (item 10), from what the director drew: the two fin choices and the
   conditions, set as the end card's last line with its tag */
/* Each path's apogee is named too (a short screen's compact card can cover the plate), every number
   keeps its unit across a line break, and the tag (SIM, story.plateLine) closes the line. */
function plateCaption() {
  const p = director && sceneDirector ? director.plate : null;
  if (!p || !p.main) return '';
  const ft = (v) => (finite(v) ? ` ${v.toFixed(0)}${NB}ft` : '');
  const a = figureFinWords(p.main.finScale) + ft(p.main.apogeeFt);
  const b = p.ghost ? figureFinWords(p.ghost.finScale).toLowerCase() + ft(p.ghost.apogeeFt) : '';
  const g = finite(p.gustMph) && p.gustMph > 0 ? p.gustMph : 0;
  const w = finite(p.windMps) ? Math.abs(p.windMps) / MPS_PER_MPH : 0;
  const air = w >= 0.05 ? `${w.toFixed(1)}${NB}mph crosswind EST` : '';
  const cond = g ? `${b ? 'the same ' : ''}gust, ${g.toFixed(1)}${NB}mph EST${air ? `, in a ${air}` : ''}` : air ? `${b ? 'the same ' : ''}${air}` : `${b ? 'the same ' : ''}still air`;
  const parts = [`${a}${b ? ` and ${b}` : ''}`, cond];
  if (flown && finite(flown.changed)) parts.push(`settings changed at T+${flown.changed.toFixed(2)}${NB}s`);
  parts.push(`${b ? 'both flown' : 'flown'} in this tab`);
  return `${joinParts(parts)}${NB}/`;
}
function showPlateCaption() { story.plateLine(plateCaption(), 'SIM'); }
/* a WebGL2 context can be made (the probe's context is released at once) */
function webgl2Available() {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return false;
    const ext = gl.getExtension('WEBGL_lose_context');
    if (ext) ext.loseContext();
    return true;
  } catch { return false; }
}
/* the CAD download's progress on the stage's status line, at most once a second (C1-3) */
let cadShownAt = -Infinity;
function cadProgress(e) {
  if ((scene3d && scene3d.cad) || !statusEl || statusEl.hidden) return;
  const now = performance.now();
  const received = e && finite(e.received) ? e.received : NaN, total = e && finite(e.total) && e.total > 0 ? e.total : NaN;
  if (!finite(received) || (now - cadShownAt < 1000 && !(received >= total))) return;
  cadShownAt = now;
  const mb = (v) => (v / 1e6).toFixed(1);
  write(statusEl, finite(total) ? `LOADING THE CAD ASSEMBLY / ${mb(received)} OF ${mb(total)} MB` : `LOADING THE CAD ASSEMBLY / ${mb(received)} MB`);
}

async function initView() {
  if (!webglAvailable()) return useFallback('no-webgl2');
  // the scene's camera director (items 10 and 12) loads beside the scene; without it, story.js's
  const dirLoad = import('./scene/director.js').catch((err) => { console.warn('[field] the scene director did not load; using the plain one', err); return null; });
  // the CAD assembly is fetched here, beside the scene module, with its progress on the stage's status
  // line (C1-3), and handed to createScene ({cad}, which the scene takes as given). If this fetch fails,
  // the scene fetches it itself (and gets onProgress too, for when it passes that on to the loader).
  // Only with a WebGL2 context to draw it in: a WebGL1-only browser goes to the 2D view at once, not
  // after a 2.5 MB download (the governor's probe accepts WebGL1).
  const cadLoad = !webgl2Available() ? Promise.resolve(null) : import('./stage/loader.js').then((m) => m.loadGeometry({ onProgress: cadProgress }))
    .catch((err) => { console.warn('[field] the CAD prefetch failed; the scene loads it itself', err); return null; });
  let mod;
  try { mod = await import('./scene/scene.js'); }
  catch (err) { console.warn('[field] the 3D scene did not load; using the 2D view', err); return useFallback('scene-module'); }
  const cad = await cadLoad;
  let s;
  try { s = mod.createScene(sceneCanvas, { tier: governor.tier, zoom: false, touchAction: 'pan-y pinch-zoom', onProgress: cadProgress, ...(cad ? { cad } : {}) }); }
  catch (err) { console.warn('[field] the 3D scene failed; using the 2D view', err); return useFallback('scene-failed'); }
  if (s.fallback) { try { s.destroy(); } catch { /* the no-op fallback */ } return useFallback(s.fallback); }
  scene3d = s; viewKind = '3d';
  applyPanelToScene(s);
  dirModule = await dirLoad;
  director = makeDirector(s, dirModule);
  if (URL0.cam) director.release();
  else if (!flight.ignited) { director.pad(); padFraming(s); }
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
  updateBeats(); updateCaption(true);
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
  fbCanvas = c;
  const v = panel.state.values;
  // the second line is the source tag of every number the 2D view draws (its CG, CP,
  // wind and angle readouts are the flight model's; the rail length is the 72 in estimate)
  const why = reason === 'no-webgl2' ? 'NO WEBGL2 IN THIS BROWSER' : reason === 'context-lost' ? 'THE 3D VIEW LOST ITS CONTEXT' : 'THE 3D VIEW DID NOT LOAD';
  fbView = createFallbackView(c, geometry, flight, {
    finScale: flight.config.finScale, view: v.section || 'through', markers: v.markers !== false,
    caption: [`2D VIEW / ${why}`, 'TRUE ANGLES / SIM / RAIL EST'],
    // the 2D end plate (item 10, fallback.js): the same ghost, the same keep-clear and the same rule for
    // when the ghost belongs (the flight still repeats its pre-flight) as the 3D director's
    ghost: (cfg, o) => ghostFlight(cfg, o && finite(o.gustMph) ? o.gustMph : flightGustMph),
    ghostValid: () => planValid,
    gustMph: () => flightGustMph,
    avoid: plateAvoid,
  });
  panel.attach({ scene: fbView, lattice: LATTICE_STUB(reason === 'no-webgl2' ? 'no-webgl2' : 'no 3d view') });
  write(hintEl, 'DRAG THE ROCKET SIDEWAYS TO FLICK IT / L LAUNCH');
  write(statusEl, ''); statusEl.hidden = true;
  updateCaption(true);
  updateLatticeRow();
  updateBeats();
  return true;
}

/* A lost WebGL context (a GPU reset, or the browser reclaiming the context) leaves the
   canvas black and stops the lattice: the scene and the engine both stop drawing and wait
   for a restore. The stage says so meanwhile. If the context is not back within
   CONTEXT_WAIT_MS of visible time (a hidden tab does not count: mobile browsers drop contexts
   in the background and restore them on return, C2-02) the lattice is dropped and the 3D scene
   is parked behind the 2D view, so the flight and the panel carry on; the restore listener
   stays, and a context that comes back later brings the 3D view and the lattice back (unpark,
   C1-1). A restore inside the wait picks up where it was (the engine restarts its flow, so the
   cost guard's warm-up starts again too). */
const CONTEXT_WAIT_MS = 5000;
const HINT_3D = hintEl ? hintEl.textContent : '';
let ctxLost = false, ctxTimer = 0, ctxLabel = null;
let parked = null;         // the 3D scene kept, hidden, through a loss longer than CONTEXT_WAIT_MS
let fbCanvas = null;       // the 2D view's canvas (useFallback), removed when a parked scene comes back
let dirModule = null;      // vx/js/scene/director.js once loaded (a scene that comes back gets a new director)
/* the wait counts visible time only: armed while the tab is visible, cleared while it is hidden */
function armCtxTimer() {
  clearTimeout(ctxTimer); ctxTimer = 0;
  if (ctxLost && !parked && viewKind === '3d' && !document.hidden) ctxTimer = setTimeout(contextGone, CONTEXT_WAIT_MS);
}
function onContextLost() {
  if (ctxLost || viewKind !== '3d') return;
  ctxLost = true;
  ctxLabel = sceneCanvas.getAttribute('aria-label');
  sceneCanvas.setAttribute('aria-label', 'The 3D view lost its graphics context. The flight and the panel keep running.');
  write(statusEl, '3D VIEW LOST / WAITING FOR THE GRAPHICS CONTEXT'); statusEl.hidden = false;
  write(hintEl, 'L LAUNCH / THE FLIGHT AND THE PANEL KEEP RUNNING');
  if (lat.lattice) panel.attach({ lattice: LATTICE_STUB('context lost') });
  updateHeader(true); updateCaption(true);
  armCtxTimer();
}
function onContextRestored() {
  if (parked) { unpark(); return; }
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
  if (!ctxLost || viewKind !== '3d' || parked) return;
  console.warn('[field] the graphics context did not come back within 5 s; the 2D view stands in until it does');
  const l = lat.lattice;
  lat.lattice = null; lat.section = null; lat.texture = null; lat.panelView = null; lat.appliedTier = null; lat.live = false; lat.deferred = false;
  builtSection = null;
  if (l) { try { l.destroy(); } catch { /* the context is gone */ } }
  // the scene is parked, not destroyed: its canvas keeps the context, and the restore listener stays
  parked = scene3d; scene3d = null;
  if (director) { director.destroy(); director = null; }
  useFallback('context-lost');
}
/* a context back after the 2D view took over: the parked scene returns (three.js and the scene
   re-upload on the restore), the 2D view goes, and the lattice is attached again */
function unpark() {
  const s = parked;
  parked = null; ctxLost = false; clearTimeout(ctxTimer); ctxTimer = 0;
  if (!s) return;
  console.info('[field] the graphics context came back; the 3D view returns');
  if (fbView) { try { fbView.destroy(); } catch { /* already gone */ } fbView = null; }
  if (fbCanvas) { fbCanvas.remove(); fbCanvas = null; }
  sceneCanvas.classList.remove('fd-off');
  viewport.classList.remove('fd-2d');
  sceneCanvas.removeAttribute('aria-hidden');
  if (ctxLabel !== null) sceneCanvas.setAttribute('aria-label', ctxLabel);
  scene3d = s; viewKind = '3d'; fallbackWhy = '';
  write(statusEl, ''); statusEl.hidden = true;
  write(hintEl, HINT_3D);
  panel.attach({ scene: s });
  applyPanelToScene(s);
  director = makeDirector(s, dirModule);
  if (URL0.cam || cameraPicked) director.release();
  else if (!flight.ignited) { director.pad(); padFraming(s); }
  if (governor.tier === 0 && (governor.ceiling === 0 || governor.stats.pinned)) {
    lat.deferred = true; lat.reason = 'off at tier 0';
    panel.attach({ lattice: LATTICE_STUB('off at tier 0') });
  } else attachLattice(s, geometry, flight);
  updateLatticeRow(); updateHeader(true); updateCaption(true); updateBeats();
  syncScene(); kick();
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
   - body rate: measured then with the moving-wall model (positive pitch rate gave a
     negative moment change, so setBodyRate's sign matches the engine). Since the engine's
     fix of 2026-10-23 setBodyRate runs in the body frame by default (walls at rest, the
     edge stream turning, Coriolis, centrifugal and Euler forces by Guo forcing); the page
     calls it without a mode, so it gets the body frame. The section's pitch damping is
     not a damping derivative of the rocket (lattice.js, BODY RATE).
   - the measurements above were taken before that fix, at an inflow of 0.10; the engine
     now runs at most 0.05 (U_CAP) and counts forces as developed after 1.5 body lengths of
     travel. The panel shows the section's CP and cm only under ?lab, from force.mean (the
     developed chord-pass means), labeled 2D SECTION ONLY / NOT COMPARABLE: validation L3
     put the section's CP 15 to 18 in from the nose against Barrowman's 29 to 33 in.
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
     (the contract's rule; the engine runs min(u_in, U_CAP 0.05), reached at 28 m/s, and
     scales the body rate by the same ratio, so the reduced pitch rate is kept)
     and alpha clamped to +-35 deg (the engine clamps too; the stage caption says so);
     setBodyRate(omegaLU) with the pitch rate in lattice units for the requested u_in
     (no mode: the engine's default body frame):
       omegaLU = q * cellM * u_in / V   [rad per lattice step]
     One lattice step lasts cellM * u_in / V seconds of flight time, because the inflow
     u_in cells per step stands for V m/s; this keeps the reduced pitch rate q D / V of
     the flight in the lattice. Below V = 2 m/s the mapping means nothing (the inflow
     floor) and omegaLU is 0. The rotation speed it implies at the far end of the body is
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
     2D section coefficient is used as the 3D one, which is why the toggle is lab-only
     and not quantitative (validation L3: a 2D section is no check on the flight model).
   ================================================================== */
const LATTICE_GRIDS = { 3: { cols: 1024, rows: 320 }, 2: { cols: 768, rows: 240 }, 1: { cols: 512, rows: 160 } };
const LATTICE_READY_MS = 15000;
const ALPHA_MAX = 35 * RAD;          // EST, the edge treatment's limit (FIELD 4)
const U_FLOOR = 0.03, U_SLOPE = 0.05, U_V_REF = 70, U_MAX = 0.10;   // FIELD 4 inflow rule, lattice units and m/s
const OMEGA_V_MIN = 2;               // m/s: below this the body-rate mapping is 0
const WALL_U_MAX = 0.05;             // lattice units: cap on the rotation speed at the far end of the body
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
/* the 2D section's CP for the scene's ?lab ring: the developed chord-pass mean (force.mean), never one window */
function latticeXcpM() {
  const f = lat.live && lat.lattice ? lat.lattice.force : null;
  const m = f && f.mean ? f.mean : null;
  if (!m || !lat.section || !finite(m.xcpCells) || (finite(f.age_ms) && f.age_ms > 3000)) return NaN;
  return (m.xcpCells - lat.section.xNoseCol) * lat.section.cellM;
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
   the engine's own), the same for its developed chord-pass mean (force.mean, what the
   ?lab rows show), plus the stats, the fallback and setView it uses. */
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
        const m = f.mean && finite(f.mean.cm) ? Object.freeze({ ...f.mean, cm: cmAtLiveCg(f.mean), cmSection: f.mean.cm }) : f.mean;
        out = Object.create(f, { cm: { value: cmAtLiveCg(f), enumerable: true }, cmSection: { value: f.cm, enumerable: true }, mean: { value: m, enumerable: true } });
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
  if (bench && bench.event) bench.event('guard', { cap: lat.cap, medianMs: median });
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
  catch (err) { console.warn('[field] lattice engine not loaded; the page runs without it', err); return latticePending('lattice unavailable'); }
  if (!mod || typeof mod.createLattice !== 'function') return latticePending('lattice unavailable');
  lat.mod = mod;
  const t = latticeTier();
  let l;
  // the contract's {cols, rows, tier}: the grid at this tier, which the engine scales by its
  // tier table on setTier (FIELD 4); tier 0 at attach starts from the tier-3 grid
  const g0 = LATTICE_GRIDS[t >= 1 ? t : 3];
  try { l = mod.createLattice(scene.renderer, { cols: g0.cols, rows: g0.rows, tier: t }); }
  catch (err) { console.warn('[field] createLattice failed; the page runs without it', err); return latticePending('lattice unavailable'); }
  let res = null;
  try {
    res = await Promise.race([Promise.resolve(l.ready), new Promise((_, rej) => setTimeout(() => rej(new Error('lattice ready timed out')), LATTICE_READY_MS))]);
  } catch (err) { console.warn('[field] lattice not ready; the page runs without it', err); res = { fallback: 'lattice unavailable' }; }
  const reason = (l && l.fallback) || (res && res.fallback) || null;
  if (reason || scene3d !== scene) { try { l.destroy(); } catch { /* nothing to free */ } return latticePending(reason || (scene3d !== scene ? 'lattice pending' : 'lattice unavailable')); }
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
  if (!l || !lat.live || ctxLost || !scene3d || !stageOnScreen || document.hidden || lat.idle || (bench && bench.hold)) return false;
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
let wasPlaying = false;
function tick(now) {
  raf = 0;
  const cpu0 = performance.now();
  const interval = lastNow ? now - lastNow : NaN;
  const dt = lastNow ? Math.min(MAX_FRAME_S, Math.max(0, interval / 1000)) : 1 / 60;
  lastNow = now;
  let busy = false;
  if (playback.running) {
    // the HOLD counts down only while the replay plays (a pause in the middle of it keeps the rest)
    if (freeze) { freeze.left -= dt * 1000; if (freeze.left <= 0 || rateOverride) freeze = null; }
    else advanceFlight(dt * playback.rate, { auto: true });
    busy = true;
  }
  narrator.frame(dt * 1000, playback.running, playback.rate);   // the dwell runs at the narrated slow rate (story.js)
  const playing = playback.running && !atApogee;
  if (playing !== wasPlaying) { wasPlaying = playing; if (director) director.playing(playing); updateHeader(true); updateCaption(true); updateBeats(); }
  applyEmphasis();
  busy = autoView(now) || busy;
  const flowing = latticeFrame(dt);
  if (flowing) watchLatticeCost(prevFlowing ? interval : NaN, now);
  prevFlowing = flowing;
  busy = busy || flowing;
  if (scene3d) {
    syncScene();
    if (busy) scene3d.render(dt);
  }
  // the panel's rate line follows the true rate: re-read it whenever the printed rate changes
  const label = `${rateLabel()}|${rateText(playback.rate)}`;
  if (label !== shownRate) { shownRate = label; panel.sync(); updateHeader(true); }
  updateHeader(!busy);              // the frame that stops the loop always writes, so a STEP never leaves a stale time
  updateCaption(false);
  if (playback.running) lastActivity = now;   // a flight that plays counts as activity (the idle pause counts from its end)
  if (bench && bench.tick) bench.tick(interval, performance.now() - cpu0, flowing);
  if (busy) raf = requestAnimationFrame(tick); else lastNow = 0;
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { if (raf) cancelAnimationFrame(raf); raf = 0; lastNow = 0; }
  else { costRestart(); kick(); }   // the guard's warm-up starts again: hidden time is not judged (C1-7)
  armCtxTimer();                     // a lost context's wait counts visible time only (C2-02)
});
if (typeof IntersectionObserver === 'function') {
  new IntersectionObserver((es) => { stageOnScreen = es[es.length - 1].isIntersecting; if (stageOnScreen) kick(); }).observe(stage);
}

/* Idle pause (C2-01). The lattice is the page's one endless cost: at tier 3 it moves tens of GB/s
   of state while the stage is on screen. When nothing has happened on the stage or in the panel for
   LATTICE_IDLE_MS and no flight plays (a flight that plays counts as activity, so the wait starts at
   its end, the end card included), the flow pauses: latticeFrame returns false, the loop stops and
   the stage shows FLOW PAUSED with Resume flow. Any input on the stage or in the panel, a launch, a
   run button or Resume flow brings it back (the engine picks up where it was; the cost guard's
   warm-up starts again). A pinned tier (?tier), a ?hold and the benchmark are exempt, so the probes
   and the verification holds keep flowing. */
const LATTICE_IDLE_MS = 90000;
let lastActivity = performance.now(), idleTimer = 0;
function idleExempt() { return !!hold || governor.stats.pinned || !!bench || !!BENCH; }
function armIdle(ms = LATTICE_IDLE_MS) { clearTimeout(idleTimer); idleTimer = setTimeout(checkIdle, Math.max(250, ms) + 50); }
function checkIdle() {
  idleTimer = 0;
  const left = LATTICE_IDLE_MS - (performance.now() - lastActivity);
  if (left > 0) return armIdle(left);
  if (playback.running || idleExempt() || !lat.lattice || !lat.live || lat.idle) return armIdle();
  lat.idle = true;
  console.info('[field] the flow paused after 90 s without input on the stage');
  if (lat.lattice) panel.attach({ lattice: LATTICE_STUB('flow paused') });
  updateCaption(true); updateLatticeRow(); updateHeader(true); kick();
}
function markActivity() {
  lastActivity = performance.now();
  if (lat.idle) {
    lat.idle = false;
    if (lat.lattice && lat.live) panel.attach({ lattice: lat.panelView, section: lat.section });
    costRestart(); updateCaption(true); updateLatticeRow(); updateHeader(true); kick();
  }
  if (!idleTimer) armIdle();
}
for (const type of ['pointerdown', 'keydown', 'wheel']) stage.addEventListener(type, markActivity, { passive: true, capture: true });
armIdle();

/* the bus: resets and config changes move the rocket on the pad */
bus.on('flight:reset', () => {
  // back on the pad: the title plate (unless the visitor has dragged since), the hero camera, the beats
  if (!quiet && !flight.ignited && !hold) {
    if (!draggedSinceReset) story.showPlate();
    if (director) { director.pad(); padFraming(); }
  }
  draggedSinceReset = false;
  updateBeats(); updateCaption(true);
  syncScene(); kick();
});
let padPlanTimer = 0;       // a slider's run of config events plans the pad once, 400 ms after the last
bus.on('flight:config', () => {
  // a setting changed in the middle of a flight: it no longer repeats its pre-flight
  // on the pad, the plan LAUNCH would fly, for the chart's dimmed preview (playback.preview), in idle time
  if (!flight.ignited && runsDone) { clearTimeout(padPlanTimer); padPlanTimer = setTimeout(() => idle(() => { if (!flight.ignited) { planOf(flight.config, armedGust); if (panel) panel.wake(); } }), 400); }
  if (flight.ignited && !flight.done && !quiet) {
    narrator.diverge(); freezeDone = true; planValid = false; if (director && typeof director.diverge === 'function') director.diverge();
    if (flown && !finite(flown.changed)) flown.changed = flight.state.t;   // the end card and the plate's caption say when
  }
  syncScene(); scheduleSection(); kick();
});
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
/* Item 1b: at a launch that changes the solid (a run start, the default launch, the end
   card's fin toggle), the engine must hold the new section before the flight starts. A
   deferred rebuild (above) leaves the old solid in the flow for the first frames, and the
   cells it frees keep their stale flow and dye: the ghost fins. So the section is rebuilt
   here, now, and when the solid changed the flow restarts from uniform inflow, as it does
   when the page loads with ?fins=. lattice.reset() keeps the mask (it only re-initialises
   the distributions and the dye from the cell texture setSection wrote). */
function syncSectionNow() {
  if (sectionPending) { cancelAnimationFrame(sectionPending); sectionPending = 0; }
  if (sectionTimer) { clearTimeout(sectionTimer); sectionTimer = 0; }
  const l = lat.lattice;
  if (!l || !scene3d) return false;
  const before = builtSection;
  rebuildSection();
  if (!lat.live || builtSection === before || !builtSection) return false;
  try { l.reset(); } catch (err) { console.warn('[field] lattice.reset failed', err); }
  costRestart();
  return true;
}
/* the panel's hook before a launch that starts a new flight (its FINS toggle sets the fins first) */
function prepareLaunch() { syncSectionNow(); return true; }
governor.subscribe(({ tier }) => {
  if (scene3d) scene3d.setTier(tier);
  if (lat.deferred && tier > 0 && scene3d) { lat.deferred = false; attachLattice(scene3d, geometry, flight); }
  applyLatticeTier();
  updateHeader(true); updateCaption(true);
  kick();
});

/* panel controls: the section view and anything that changes the solid rebuild the
   lattice section; settings go back into the URL */
panel.onControl(({ name, value, source }) => {
  if (name === 'section' || name === 'fins' || name === 'cg') scheduleSection();
  // a visitor's gust or flick during the flight: the end card names it, and the settle time counts from
  // the last gust; the narration follows the live state from here (the flight left its pre-flight)
  if (name === 'fireGust' && !firingArmed && flight.ignited && !flight.done && !atApogee && flown) {
    const mph = finite(value) ? value : panelValue('gust', GUST_DEFAULT_MPH);
    tracker.noteGust(flight.state.t); flown.gusts.push({ mph, t: flight.state.t, armed: false });
    narrator.noteGust(flight.state.t, mph); freezeDone = true; planValid = false;
    if (director && typeof director.noteGust === 'function') director.noteGust(mph, flight.state.t);
  }
  if (name === 'flick' && finite(value) && value !== 0 && flight.ignited && !flight.done && !flight.state.onRail && flown) {
    flown.flicks.push(flight.state.t);
    narrator.noteFlick(flight.state.t); freezeDone = true; planValid = false;
    if (director && typeof director.diverge === 'function') director.diverge();
  }
  // the visitor's own camera or view: the director stands down, the AUTO view ends
  if (name === 'camera' && source !== 'api') { cameraPicked = true; if (director) director.release(); }
  if (name === 'view' && source !== 'api' && source !== 'auto' && !panelAuto()) setViewAuto(false);
  if (name === 'view' || name === 'viewAuto') { if (!isViewAuto() && viewFade) { viewFade = null; sliceOpacity(1); } scheduleUrl(); }
  if (name === 'launch' || name === 'reset') markRun(null);
  if (name === 'reset' && source !== 'api') clearChartGhost();   // a visitor's reset clears the chart's ghost
  if (source !== 'api' && source !== 'auto') markActivity();
  if (['fins', 'cg', 'rail', 'angle', 'wind', 'rate', 'view', 'section', 'camera', 'gust'].includes(name)) scheduleUrl();
  if (name === 'view' || name === 'section') updateCaption(true);
  kick();
});

/* ------------------------------------------------------------------ header strip and captions */
/* The header carries the wordmark, the time code and the true rate (item 3): GRID, TIER and ENGINE
   are in the panel's lattice line (ALL READOUTS). The rate is HOLD during the replay's hold and
   during a ?hold, PAUSED while paused, else the rate and AUTO or SET. */
function updateHeader(force) {
  const now = performance.now();
  if (!force && now - lastHead < 100) return;
  lastHead = now;
  if (force) updateLatticeRow();
  write(head.tc, timeCode(flight.state.t));
  // the rate and its mode apart, so a phone can drop the mode word (field.css) and keep the rate
  const label = rateLabel();
  const word = label === 'HOLD' || label === 'PAUSED';
  write(head.rate, word ? label : rateText(playback.rate));
  write(head.mode, word ? '' : ` ${playback.auto ? 'AUTO' : 'SET'}`);
}

const VIEW_WORDS = { smoke: 'SMOKE', pressure: 'PRESSURE', vorticity: 'VORTICITY', speed: 'SPEED' };
function updateCaption(force) {
  const now = performance.now();
  if (!force && now - lastCap < 1000) return;      // the numbers in it change at most once a second
  lastCap = now;
  const phone = phoneMq.matches;      // phones get short forms, so a narrow line keeps its last clause
  const section = `${phone ? '' : 'SECTION '}${panelValue('section', 'through') === 'between' ? 'BETWEEN' : 'THROUGH'} THE FINS`;
  let keyView = '';                   // the legend line (item 8): pressure and smoke get swatches
  if (viewKind === '2d') {
    write(capFlow, `2D SIDE VIEW / ${fallbackWhy === 'no-webgl2' ? 'NO WEBGL2' : 'NO 3D VIEW'} / NO FLOW SECTION`);
    writeNw(capNote, 'ROCKET, CG, CP, WIND AND FORCES FROM THE FLIGHT MODEL');
    capNote.classList.remove('fd-cap-warn');
  } else if (ctxLost) {
    write(capFlow, 'FLOW / 3D VIEW LOST');
    writeNw(capNote, 'WAITING FOR THE GRAPHICS CONTEXT / THE FLIGHT MODEL RUNS');
    capNote.classList.add('fd-cap-warn');
  } else if (lat.lattice && lat.live && !lat.idle) {
    const view = panelValue('view', 'smoke');
    write(capFlow, `FLOW / ${VIEW_WORDS[view] || 'SMOKE'}${isViewAuto() ? ' AUTO' : ''} / ${section}`);
    if (view === 'pressure' || view === 'smoke') keyView = view;
    // the inflow held at the EST limit while the flight is past it; otherwise what the picture is
    // (the inflow in lattice units is in the panel's ALL READOUTS and in Method 03)
    const a = (finite(lat.alphaIn) ? lat.alphaIn : clamp(finite(flight.state.alpha) ? flight.state.alpha : 0, -ALPHA_MAX, ALPHA_MAX)) * DEG;
    writeNw(capNote, lat.clamped
      ? (phone ? `INFLOW HELD AT ${fx(a, 0, true)}° EST / FLIGHT PAST IT` : `INFLOW HELD AT ${fx(a, 0, true)}° EST / THE FLIGHT IS PAST IT`)
      : 'A FLAT 2D SLICE OF THE AIR / NOT TIME-ACCURATE');
    capNote.classList.toggle('fd-cap-warn', lat.clamped);
  } else if (lat.lattice && lat.idle) {
    write(capFlow, 'FLOW / PAUSED');
    writeNw(capNote, phone ? 'NO INPUT FOR 90 S / TAP TO RESUME' : 'NO INPUT FOR 90 S / CLICK THE STAGE TO RESUME');
    capNote.classList.remove('fd-cap-warn');
  } else if (lat.lattice && lat.cap === 0) {
    write(capFlow, 'FLOW / PAUSED');
    writeNw(capNote, `FRAMES TOOK ${Math.round(lat.shedMs)} MS WITH THE LATTICE RUNNING`);
    capNote.classList.add('fd-cap-warn');
  } else if ((lat.lattice && latticeTier() === 0) || lat.deferred) {
    write(capFlow, 'FLOW / OFF AT TIER 0');
    writeNw(capNote, governor.stats.pinned ? 'PINNED TO TIER 0' : reducedMq.matches ? 'REDUCED MOTION / STEP WITH THE PANEL' : 'THE GOVERNOR DROPPED TO TIER 0');
    capNote.classList.remove('fd-cap-warn');
  } else {
    write(capFlow, `FLOW / ${String(lat.reason || 'lattice pending').toUpperCase()}`);
    writeNw(capNote, 'THE FLIGHT MODEL RUNS WITHOUT IT');
    capNote.classList.remove('fd-cap-warn');
  }
  if (capKey) { capKey.hidden = !keyView; if (keyView && capKey.dataset.view !== keyView) capKey.dataset.view = keyView; }
  // badges: the hold, an armed gust (on the pad only: during a flight the slate names it), the paused flow
  badgeHold.hidden = !hold;
  if (hold) write(badgeHold, `HOLD / AOA ${fx(hold.alphaDeg, 1, true)}° SIM / ${timeCode(hold.t)}`);
  badgeGust.hidden = !(armedGust > 0) || flight.ignited;
  if (armedGust > 0) write(badgeGustT, `GUST ${armedGust.toFixed(1)} MPH EST AT RAIL EXIT`);
  badgeFlow.hidden = !(lat.lattice && (lat.cap === 0 || lat.idle));
  const slateUp = stage.hasAttribute('data-slate-up');
  badges.hidden = badgeHold.hidden && badgeGust.hidden && badgeFlow.hidden && !slateUp;
  // the hint line shows only on the idle pad, and not under the title plate (item 4)
  if (hintEl) hintEl.hidden = flight.ignited || !!hold || story.plateShown || viewKind === 'loading';
}
phoneMq.addEventListener('change', () => updateCaption(true));
$('[data-resume]').addEventListener('click', () => { markActivity(); resumeLattice(); stage.focus({ preventScroll: true }); });
$('[data-disarm]').addEventListener('click', () => { disarmGust(); stage.focus({ preventScroll: true }); });
/* DISARM: still air from the next launch on (the panel's DISARM calls this too). During a flight whose
   gust has not fired yet (on the rail), that flight changes too: its gust will not fire, so it no longer
   repeats its pre-flight, and the plan's beats, the HOLD, the caption numbers and the plate's ghost step
   aside, as for a flick. Once the gust has fired, the flight in progress keeps it (its plate and end card
   still describe it); only the next launch is still air. */
function disarmGust() {
  armedGust = 0;
  if (flight.ignited && !flight.done && !atApogee && flightGustMph > 0 && !(flown && flown.gusts.some((g) => g.armed))) {
    flightGustMph = 0;
    if (!quiet) {
      planValid = false; freezeDone = true;
      narrator.diverge();
      if (director && typeof director.diverge === 'function') director.diverge();
      story.slate(slateText());
    }
  }
  scheduleUrl(); updateCaption(true); if (panel) panel.wake();
}

/* ------------------------------------------------------------------ hold */
function clearHold() { if (hold) { hold = null; updateCaption(true); } }
function holdAt(deg) {
  const target = Math.max(0.5, Math.abs(deg)) * RAD;    // a hold under 0.5 deg is held at 0.5 deg
  const sign = deg < 0 ? -1 : 1;
  const windMph = URL0.wind > 0 ? URL0.wind : HOLD_WIND_MPH;
  // a verification hold: no title plate, no narration, no slate, the side camera
  quiet = true;
  try {
    playback.reset();
    // a crosswind toward +x gives a positive alpha that falls as the rocket gathers speed;
    // the slider holds 0 to 20 mph, so a negative hold sets the wind through the flight
    if (sign > 0) panel.set('wind', windMph); else flight.setWind(-windMph * MPS_PER_MPH);
    igniteFlight();                                        // the run tracker follows the held flight too, so a RESUME reaches a true end card
    if (director) director.launch();
    let guard = 0, prev = NaN;
    while (!flight.done && guard++ < 30000) {
      flight.step(FLIGHT_DT);                              // one integrator step
      if (flight.state.stepIndex % SAMPLE_STEPS === 0) tracker.sample();
      const s = flight.state;
      if (s.phase === 'pad' || !(s.airspeed > 1)) continue;
      if (Math.abs(s.alpha) <= target + 1e-9 || (finite(prev) && prev * s.alpha < 0)) break;
      prev = s.alpha;
    }
  } finally { quiet = false; }
  story.hidePlate({ instant: true });
  paused = true;
  hold = { alphaDeg: flight.state.alpha * DEG, t: flight.state.t };
  syncScene(); panel.wake(); updateCaption(true); kick();
}

/* ------------------------------------------------------------------ the title plate, the AUTO view, the beats */
/* The title plate (item 3, static HTML in the stage) hides on any launch (igniteFlight), on a run
   button, on a ?hold and on the first drag across the view; it comes back when the flight is reset to
   the pad, unless the visitor has dragged since the reset. */
{
  let down = null;
  viewport.addEventListener('pointerdown', (e) => { down = e.target && e.target.closest && e.target.closest('.fd-plate, .fd-end, .fd-badges, .fd-beats') ? null : { x: e.clientX, y: e.clientY }; }, { passive: true });
  viewport.addEventListener('pointermove', (e) => {
    if (!down || !story.plateShown) return;
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) { draggedSinceReset = true; down = null; story.hidePlate(); updateCaption(true); }
  }, { passive: true });
  const up = () => { down = null; };
  viewport.addEventListener('pointerup', up, { passive: true });
  viewport.addEventListener('pointercancel', up, { passive: true });
}

/* The AUTO view (item 8): unless the visitor (or ?view) picked a view, the slice shows smoke on the
   pad, pressure from rail exit to the end of the wobble (or to the pitch past 60 deg), and smoke
   after. Each switch fades the slice out over VIEW_FADE_OUT_MS, changes the view through the panel
   (so its VIEW control follows), and fades it back in over VIEW_FADE_IN_MS; instant under reduced
   motion, at tier 0 nothing changes (no lattice). The plan's window stops the view from flickering at
   the zero crossings of a wobble; once the flight has left its plan, the view follows the live
   |alpha| (2 deg or more within the last 0.3 s of flight). */
function panelAuto() { return !!panel && typeof panel.setAutoView === 'function'; }
/* AUTO lives in the panel when it offers it (its AUTO button; a picked view ends it); else here */
function isViewAuto() { return panelAuto() ? (autoOffered ? !!panel.viewAuto : !URL0.view) : viewAuto; }
function applyAutoView(v) {
  if (panelAuto()) return panel.setAutoView(v) !== false;
  panel.set('view', v); return true;
}
function autoViewTarget() {
  const st = flight.state;
  if (!flight.ignited || st.onRail || atApogee || finite(st.apogee)) return 'smoke';
  if (plan && narrator.valid) {
    const b = plan.beats;
    const end = plan.kind === 'over' ? b.pitch60 : plan.kind === 'wobble' ? b.settle : -Infinity;
    return st.t <= end + 1e-9 ? 'pressure' : 'smoke';
  }
  const lb = narrator.state ? narrator.state.lastBig : NaN;
  return finite(lb) && st.t - lb < 0.3 && !(narrator.state && narrator.state.over) ? 'pressure' : 'smoke';
}
function sliceOpacity(o) {
  const s = scene3d;
  if (!s) return false;
  if (typeof s.setSliceOpacity === 'function') { s.setSliceOpacity(o); return true; }
  const sl = s.three && s.three.slice;             // the scene's published handles (scene.js api.three)
  if (sl && typeof sl.setOpacity === 'function') { sl.setOpacity(o); return true; }
  return false;
}
/* once a frame; true while a fade runs (the loop keeps drawing) */
function autoView(now) {
  if (!lat.lattice || !lat.live || !scene3d) { if (viewFade) { viewFade = null; sliceOpacity(1); } return false; }
  // the first pick offers AUTO in the panel's view group (on unless the URL picked a view)
  if (panelAuto() && !autoOffered) { autoOffered = true; panel.setAutoView(autoViewTarget()); updateCaption(true); }
  if (!isViewAuto()) { if (viewFade) { viewFade = null; sliceOpacity(1); } return false; }
  const cur = panelValue('view', 'smoke');
  if (!viewFade) {
    const want = autoViewTarget();
    if (want === cur) return false;
    const instant = reducedMq.matches || governor.tier === 0 || !sliceOpacity(1);
    if (instant) { applyAutoView(want); updateCaption(true); return false; }
    viewFade = { phase: 'out', t0: now, to: want };
  }
  const ease = (k) => 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3);   // close to the site's ease-out
  if (viewFade.phase === 'out') {
    const k = (now - viewFade.t0) / VIEW_FADE_OUT_MS;
    sliceOpacity(1 - ease(k));
    if (k >= 1) {
      if (!applyAutoView(viewFade.to)) { sliceOpacity(1); viewFade = null; return false; }   // AUTO ended meanwhile
      updateCaption(true); viewFade = { phase: 'in', t0: now, to: viewFade.to };
    }
    return true;
  }
  const k = (now - viewFade.t0) / VIEW_FADE_IN_MS;
  sliceOpacity(ease(k));
  if (k >= 1) { sliceOpacity(1); viewFade = null; }
  return true;
}
/* AUTO on or off: off when the visitor picks a view (panel onControl, source 'ui' or 'key') */
function setViewAuto(on) {
  if (panelAuto()) { autoOffered = true; panel.set('viewAuto', !!on); } else viewAuto = !!on;
  if (!viewAuto && viewFade) { viewFade = null; sliceOpacity(1); }
  scheduleUrl(); updateCaption(true); kick();
}

/* NEXT BEAT and PREVIOUS BEAT (item 7, reduced motion): step the flight to the plan's beat times
   with playback.step, 5 ms past each beat so the state that names it has been sampled. PREVIOUS
   resets to the pad and steps forward again (the flight is deterministic; the armed gust fires at
   rail exit again). On the pad the plan is the one LAUNCH would fly. */
function beatPlan() { return plan || (!flight.ignited ? planOf(flight.config, armedGust) : null); }
/* a beat's stop: BEAT_PAST after it, rounded up to the flight's 1 ms step grid. A beat time off the grid
   (rail exit's, interpolated, 0.2355 s) would otherwise stop 1 ms short, still count as next, and the
   next press would move one step with no new caption. */
const beatStop = (b) => Math.ceil((b.t + BEAT_PAST) * 1000 - 1e-6) / 1000;
function beat(dir) {
  const p = beatPlan();
  if (!p || hold) return;
  const pressed = stage.querySelector(`[data-beat="${dir > 0 ? 'next' : 'prev'}"]`);
  const hadFocus = !!pressed && document.activeElement === pressed;
  const t = flight.ignited ? flight.state.t : -1;
  if (dir > 0) {
    if (flight.done || atApogee) return;
    const nb = p.beatList.find((b) => beatStop(b) > t + 1e-6);
    if (!nb) return;
    playback.step(beatStop(nb) - Math.max(0, t));
  } else {
    const back = [...p.beatList].reverse().find((b) => beatStop(b) < t - 1e-6);
    playback.reset();
    if (back) playback.step(beatStop(back));
  }
  updateBeats(); updateCaption(true);
  // keyboard focus stays on the pressed button (the next press is one key away; PREVIOUS passes through the
  // pad, where the button is disabled for a moment and the browser drops its focus, so it is given back);
  // it moves only when that button is now disabled: NEXT at the end card to its REPLAY, PREVIOUS on the pad
  // to NEXT
  const a = document.activeElement;
  if (!pressed || !(hadFocus || a === pressed || !a || a === document.body)) return;
  if (!pressed.disabled) { if (a !== pressed) pressed.focus({ preventScroll: true }); return; }
  const replay = story.endShown ? stage.querySelector('[data-end-replay]') : null;
  const other = stage.querySelector(`[data-beat="${dir > 0 ? 'prev' : 'next'}"]`);
  const to = replay && replay.getClientRects().length ? replay : other && !other.disabled ? other : stage;
  to.focus({ preventScroll: true });
}
function updateBeats() {
  const show = reducedMq.matches && viewKind !== 'loading';
  if (!show) { story.setBeats({ show: false }); return; }
  const p = flight.ignited ? plan : null;
  const t = flight.ignited ? flight.state.t : -1;
  const next = !flight.done && !atApogee && (!p || p.beatList.some((b) => beatStop(b) > t + 1e-6));
  story.setBeats({ show: true, prev: flight.ignited, next });
}
reducedMq.addEventListener('change', () => updateBeats());

/* ------------------------------------------------------------------ runs */
const RUNS = RUN_SETUPS;          // story.js: full, half, none, wind, gust (the bake script flies the same)
/* the default launch and its finless twin (the title plate's two buttons, wave 2): Run 05's conditions */
const LAUNCHES = LAUNCH_SETUPS;
function markRun(key) {
  for (const el of document.querySelectorAll('.fd-run')) { if (el.dataset.run === key) el.dataset.active = ''; else delete el.dataset.active; }
}
/* quiet: no scroll, no focus move, no LAST RUN mark (the benchmark's runs) */
function startRun(key, { quiet: q = false } = {}) {
  const r = RUNS[key] || (key === 'nofins' ? LAUNCHES.nofins : null); if (!r) return;
  clearHold();
  clearChartGhost();
  markActivity();
  armedGust = r.gust;
  panel.press('reset');
  panel.set('fins', r.fins);
  panel.set('wind', r.wind);
  panel.set('cg', CG_DEFAULT_IN);
  panel.set('rail', EST_RAIL_IN);
  panel.set('angle', 0);
  panel.set('gust', r.gust > 0 ? r.gust : GUST_DEFAULT_MPH);
  syncSectionNow();                 // item 1b: the engine holds this run's solid before the flight starts
  scheduleUrl();
  // back to the stage: a short way glides, the long way from the runs jumps (a smooth
  // scroll over several screens is slow to watch and slower on a busy renderer)
  if (!q) {
    window.scrollTo({ top: 0, behavior: reducedMq.matches || scrollY > 2 * innerHeight ? 'auto' : 'smooth' });
    stage.focus({ preventScroll: true });
  }
  panel.press('launch');
  if (!q) markRun(RUNS[key] ? key : null);
  updateCaption(true);
}
for (const b of document.querySelectorAll('[data-run-go]')) b.addEventListener('click', () => startRun(b.dataset.runGo));
/* the default launch (Run 05's conditions) or the same without fins: the title plate's hook */
function launchDefault(kind = 'fins') {
  const k = String(kind).toLowerCase();
  startRun(k === 'nofins' || k === 'none' || k === '0' ? 'nofins' : 'gust');
}
document.addEventListener('click', (e) => {
  const b = e.target && e.target.closest ? e.target.closest('[data-launch]') : null;
  if (!b || b.disabled) return;
  e.preventDefault();
  launchDefault(b.dataset.launch);
});
/* the end card: the same flight again, or the same with the other fin choice */
function replayFlight() {
  clearHold();
  panel.press('reset');
  syncSectionNow();
  stage.focus({ preventScroll: true });
  panel.press('launch');
  updateCaption(true);
}
function toggleFins(to) {
  clearHold();
  keepChartGhost();                 // item 11: the flight just flown stays on the chart as a labeled ghost
  panel.press('reset');
  panel.set('fins', to > 0 ? 1 : 0);
  syncSectionNow();
  scheduleUrl();
  stage.focus({ preventScroll: true });
  panel.press('launch');
  updateCaption(true);
}

/* results of each run, flown silently (no bus) in idle time. A run card's flight is the run's
   pre-flight (story.js planFlight, which tracks it with createRunTracker, the live end card's
   definitions, every 5 ms of flight), flown with the configuration a run start gives the live flight
   (startRun sets these through the panel: the CAD CG estimate, rail 72 in, launch angle 0). So each card
   describes exactly the flight its button flies, and the plan is cached for that launch. */
function runConfig(r) { return runFlightConfig(geometry.finDefaults, r, { seed: URL0.seed }); }
function flyRun(r) {
  const p = planOf(runConfig(r), r.gust);
  if (!p) throw new Error('no pre-flight');
  return p.result;
}
function fillRun(key, o) {
  const card = document.querySelector(`.fd-run[data-run="${key}"]`); if (!card) return;
  // the card's own format (story.js runCardValues), the one the bake script writes into the HTML
  const vals = runCardValues(key, o);
  for (const el of card.querySelectorAll('[data-r]')) if (el.dataset.r in vals) write(el, vals[el.dataset.r]);
  if (key === 'none') put('apogeeNone', finite(o.apogee) ? String(Math.round(o.apogee / 10) * 10) : '—');
}
function computeRuns() {
  // the five cards, then the plans the title plate's two buttons and a cold LAUNCH would need
  const jobs = Object.keys(RUNS).map((k) => () => fillRun(k, flyRun(RUNS[k])));
  // Method 04 quotes the default launch's slow rate (Run 05's conditions, the plan just flown)
  jobs.push(() => { const p = planOf(runConfig(RUNS.gust), RUNS.gust.gust); if (p) put('rampSlow', rateText(p.slow)); });
  jobs.push(() => planOf(runConfig(LAUNCHES.nofins), LAUNCHES.nofins.gust));
  // the lede figure and the run sketches from this tab's own pre-flights (item 9), against the baked copy
  jobs.push(() => liveFigures());
  jobs.push(() => { if (!flight.ignited) planOf(flight.config, armedGust); });
  const next = () => {
    const job = jobs.shift(); if (!job) { runsDone = true; if (panel) panel.wake(); return; }
    try { job(); } catch (err) { console.warn('[field] run preview failed', err); }
    idle(next);
  };
  idle(next);
}

/* Item 9: the lede figure and the run sketches. The HTML carries the copies vx/tools/bake-figure.mjs
   baked in node from the same modules (story.js ledeFigure and runSketch on planFlight), so they read
   with JS off. Here the same markup is rendered from this tab's own pre-flights (the run cards' plans,
   cached) and compared by its hash (data-sig): a figure that matches stays as it is; one that differs
   (the flight model changed since the last bake, or this engine's Math differs from node's) is replaced
   by this tab's and logged. window.__field.figure has the outcome and the values drawn. */
const figureState = { done: false, lede: 'pending', runs: {}, values: {} };
function swapFigure(host, markup) {
  if (!host) return 'missing';
  const old = host.querySelector('svg.fd-fig-svg');
  const sig = /data-sig="([0-9a-f]+)"/.exec(markup);
  if (old && sig && old.getAttribute('data-sig') === sig[1]) return 'match';
  const tpl = document.createElement('template');
  tpl.innerHTML = markup;
  const svg = tpl.content.firstElementChild;
  if (!svg) return 'failed';
  if (old) old.replaceWith(svg); else host.prepend(svg);
  return old ? 'replaced' : 'added';
}
function liveFigures() {
  try {
    const pf = planOf(runConfig(LAUNCHES.fins), LAUNCHES.fins.gust), pn = planOf(runConfig(LAUNCHES.nofins), LAUNCHES.nofins.gust);
    if (pf && pn) {
      figureState.lede = swapFigure(document.querySelector('[data-fig="lede"]'), ledeFigure(pf, pn));
      figureState.values.lede = { fins: pf.result.apogee, finsX: -pf.result.upwind, nofins: pn.result.apogee, nofinsX: -pn.result.upwind };
    } else figureState.lede = 'no plan';
    for (const k of Object.keys(RUNS)) {
      const p = planOf(runConfig(RUNS[k]), RUNS[k].gust);
      figureState.runs[k] = p ? swapFigure(document.querySelector(`[data-fig="${k}"]`), runSketch(k, p)) : 'no plan';
      if (p) figureState.values[k] = { apogee: p.result.apogee, upwind: p.result.upwind };
    }
    const off = [figureState.lede, ...Object.values(figureState.runs)].filter((v) => v !== 'match');
    if (off.length) console.info(`[field] path figures re-rendered from this tab's flights (the baked copy differs): ${JSON.stringify({ lede: figureState.lede, ...figureState.runs })}`);
  } catch (err) { console.warn('[field] the path figures keep their baked copy', err); figureState.lede = 'failed'; }
  figureState.done = true;
}

/* ------------------------------------------------------------------ configuration table */
/* the computed rows (story.js configValues: the same strings vx/tools/bake-figure.mjs writes into the
   HTML for a reader without JavaScript), then the still-air apogee in idle time */
function fillConfig() {
  for (const [k, s] of Object.entries(configValues(geometry, { apogee: false }))) put(k, s);
  idle(() => put('apogee', stillAirApogee(geometry)));
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
  else if (l && lat.idle) put('latLive', 'paused after 90 s without input');
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
function scheduleUrl() { if (BENCH) return; clearTimeout(urlTimer); urlTimer = setTimeout(writeUrl, 400); }   // the bench writes nothing back
function writeUrl() {
  const p = new URLSearchParams(location.search);
  const v = panel.state.values, cfg = flight.config;
  const setOr = (k, val, dflt, fmt) => { if (val === undefined || val === null || (typeof val === 'number' && Math.abs(val - dflt) < 1e-9) || val === dflt) p.delete(k); else p.set(k, fmt ? fmt(val) : String(val)); };
  setOr('fins', +cfg.finScale.toFixed(2), 1);
  setOr('cg', +(cfg.cgFromNose / M_PER_IN).toFixed(1), CG_URL_IN);
  setOr('rail', Math.round(cfg.railLength / M_PER_IN), EST_RAIL_IN);
  setOr('angle', +(cfg.launchAngle * DEG).toFixed(1), 0);
  setOr('wind', +(Math.abs(cfg.wind) / MPS_PER_MPH).toFixed(1), 0);
  // the default launch arms the gust: with every other flight setting at its default, an armed
  // default gust is the bare URL and still air writes gust=0; otherwise no gust is the default
  const plain = !['fins', 'cg', 'rail', 'angle', 'wind'].some((k) => p.has(k));
  setOr('gust', armedGust > 0 ? +armedGust.toFixed(1) : 0, plain ? +GUST_DEFAULT_MPH.toFixed(1) : 0);
  setOr('speed', rateOverride ? rateText(rateOverride) : null, null);
  setOr('view', isViewAuto() ? null : v.view, 'smoke');   // the AUTO view writes nothing
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

/* ------------------------------------------------------------------ ?bench=1: the self-benchmark (C2 section 9) */
/* One URL the owner opens on each machine and browser: ?bench=1 (about 75 s on a graphics card) or
   ?bench=quick (about 25 s). It measures, in order:
     ENV      browser, device, GL strings and limits, extensions, precision path, timer resolution
     REFRESH  60 display intervals with the page idle (the display rate; a 30 Hz cap is named)
     CPU      the still-air flight run(12) (wall ms, apogee, an FNV-1a hash of its history) and a
              512 x 160 section build (an uncached fin scale)
     ENGINE   per tier, with the page's inflow held off: warm-up to 2,000 steps, then step(N) with
              N doubled until one batch takes 400 ms, three repetitions behind the engine's GPU fence
              (completed work, not issue rate); a force sample and the field check at a fixed state
     PACING   per tier, 11 s of Run 01 at a fixed 1/8 (3 s discarded): frame intervals, the loop's CPU
              time, completed steps per second, the engine's step scale, the scene's draw stats
     AUTO     (full only) 25 s of the gust run at real time with the governor free: its tier changes
              and the slow-frame guard
   then restores the page and prints a plain-text block (and the same as JSON) to copy. Each tier is
   pinned while it is measured, so the governor and the guard stay out of the numbers. A phase that
   loses the tab or the stage is marked interrupted and repeated once. While it runs, ?autolaunch,
   ?hold and ?speed are ignored and the address is not written back. */
const BENCH_PHASES = { full: ['ENV', 'REFRESH', 'CPU', 'ENGINE', 'PACING', 'AUTO', 'REPORT'], quick: ['ENV', 'REFRESH', 'CPU', 'ENGINE', 'PACING', 'REPORT'] };
const BENCH_TIER_STEPS = { 3: 24, 2: 16, 1: 8 };            // the engine's steps per 60 Hz frame (FIELD 4), for the verdict
const BENCH_PACE_MS = 11000, BENCH_DISCARD_MS = 3000, BENCH_AUTO_MS = 25000, BENCH_ENGINE_TARGET_MS = 400;
function benchTiers() {
  if (finite(URL0.tier)) return [clamp(Math.round(URL0.tier), 1, 3)];
  const top = governor.ceiling > 0 ? governor.ceiling : 1;
  if (BENCH === 'quick') return [top];
  const out = []; for (let t = top; t >= 1; t--) out.push(t); return out;
}
const benchWait = (ms) => new Promise((r) => setTimeout(r, ms));
const benchFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
const pct = (arr, p) => { if (!arr.length) return NaN; const a = arr.slice().sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.max(0, Math.ceil(p * a.length) - 1))]; };
const median = (arr) => pct(arr, 0.5);
const fnv1a = (str) => { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, '0'); };
async function benchUntil(fn, ms) { const t0 = performance.now(); while (!fn()) { if (performance.now() - t0 > ms) return false; await benchWait(100); } return true; }

function mountBench() {
  const sec = document.createElement('section');
  sec.className = 'fd-sec fd-bench on-dark'; sec.id = 'bench'; sec.setAttribute('aria-labelledby', 'bench-h');
  sec.innerHTML = '<div class="fd-wrap"><p class="eyebrow">Benchmark</p><h2 class="fd-bench-h" id="bench-h">Benchmark</h2>'
    + '<p class="fd-bench-status" aria-live="polite" data-bench-status>Benchmark / waiting for the page</p>'
    + '<pre class="fd-bench-pre" tabindex="0" data-bench-pre aria-label="Benchmark result"></pre>'
    + '<details class="fd-more fd-bench-more"><summary>The result as JSON</summary><pre class="fd-bench-pre" data-bench-json tabindex="0" aria-label="Benchmark result as JSON"></pre></details>'
    + '<div class="fd-bench-act"><button type="button" class="fd-end-b fd-end-b-p" data-bench-copy disabled>Copy result</button><button type="button" class="fd-end-b" data-bench-again disabled>Run again</button><span class="fd-bench-note" data-bench-note role="status"></span></div></div>';
  stage.after(sec);
  const pre = sec.querySelector('[data-bench-pre]');
  const note = sec.querySelector('[data-bench-note]');
  sec.querySelector('[data-bench-copy]').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(pre.textContent); note.textContent = 'Copied'; }
    catch {
      const r = document.createRange(); r.selectNodeContents(pre);
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
      note.textContent = 'Press Command or Control and C to copy';
    }
  });
  sec.querySelector('[data-bench-again]').addEventListener('click', () => location.reload());
  return sec;
}

async function runBench() {
  const sec = mountBench();
  const statusLine = sec.querySelector('[data-bench-status]');
  const phases = BENCH_PHASES[BENCH];
  const tiers = benchTiers();
  const res = { version: 1, mode: BENCH, tiers, started: new Date().toISOString(), deployed: document.lastModified, phases: {}, engine: {}, pacing: {}, auto: null, errors: [] };
  bench = { hold: false, tick: null, event: null, label: 'BENCHMARK RUNNING', res };
  const rail = stage.querySelector('.pn');
  let phaseIdx = 0, phaseName = '', phaseEnd = 0, lastStatus = 0;
  const left = () => {
    const nominal = { ENV: 0.5, REFRESH: 1, CPU: 1, ENGINE: 6 * tiers.length, PACING: 11 * tiers.length, AUTO: 25, REPORT: 0 };
    let s = Math.max(0, (phaseEnd - performance.now()) / 1000);
    for (let i = phaseIdx + 1; i < phases.length; i++) s += nominal[phases[i]];
    return Math.round(s);
  };
  const status = (force = false) => {
    const now = performance.now();
    if (!force && now - lastStatus < 1000) return;
    lastStatus = now;
    const text = `Benchmark / ${phaseIdx + 1} of ${phases.length} / ${phaseName} / ${left()} s left`;
    write(statusLine, text);
    write(statusEl, text.toUpperCase()); statusEl.hidden = false;
  };
  const statusTimer = setInterval(() => status(), 1000);
  const enter = (name, sub = '', ms = 0) => { phaseIdx = Math.max(0, phases.indexOf(name)); phaseName = sub ? `${name} ${sub}` : name; phaseEnd = performance.now() + ms; status(true); };
  // a timed phase: repeated once if the tab or the stage was lost during it
  async function timed(name, fn) {
    for (let attempt = 0; attempt < 2; attempt++) {
      let lost = '';
      const watch = setInterval(() => { if (document.hidden) lost = 'tab hidden'; else if (!stageOnScreen) lost = 'stage off screen'; }, 100);
      let out;
      try { out = await fn(); } catch (err) { out = { error: String((err && err.message) || err) }; }
      clearInterval(watch);
      if (!lost) return out;
      res.errors.push(`${name}: interrupted (${lost})`);
      await benchUntil(() => !document.hidden, 600000);
      window.scrollTo(0, 0); await benchWait(500);
      if (attempt === 1) return { ...(out || {}), interrupted: lost };
    }
    return null;
  }

  // start conditions: the view, the lattice settled, the previews, the fonts, a visible tab
  window.scrollTo(0, 0);
  if (rail) rail.inert = true;
  try { panel.attach({ bench: { label: bench.label } }); } catch { /* the panel ignores keys it does not know */ }
  const snap = { ...panel.state.values };
  const gust0 = armedGust, override0 = rateOverride;
  enter('ENV');
  await viewReady;
  await benchUntil(() => lat.lattice || lat.deferred || viewKind === '2d' || (lat.reason && lat.reason !== 'lattice pending'), 30000);
  await benchUntil(() => runsDone, 30000);
  try { await document.fonts.ready; } catch { /* no font API */ }
  await benchUntil(() => !document.hidden, 600000);

  // 1. ENV
  try {
    const n = navigator, ua = n.userAgentData;
    const env = {
      userAgent: n.userAgent, brands: ua && ua.brands ? ua.brands.map((b) => `${b.brand} ${b.version}`).join(', ') : null, platform: ua ? ua.platform : null, mobile: ua ? ua.mobile : null,
      cores: n.hardwareConcurrency || null, memoryGB: n.deviceMemory || null, dpr: devicePixelRatio, screen: `${screen.width}x${screen.height}`, viewport: `${innerWidth}x${innerHeight}`,
      coarse: matchMedia('(pointer: coarse)').matches, reduced: reducedMq.matches,
      saveData: !!(n.connection && n.connection.saveData), effectiveType: n.connection ? n.connection.effectiveType || null : null,
      heuristicTier: governor.ceiling, pinned: governor.stats.pinned,
      api: { requestIdleCallback: typeof requestIdleCallback === 'function', importmap: !!(HTMLScriptElement.supports && HTMLScriptElement.supports('importmap')), connection: !!n.connection, deviceMemory: 'deviceMemory' in n },
    };
    try { if (typeof n.getBattery === 'function') { const b = await n.getBattery(); env.battery = `${b.charging ? 'charging' : 'on battery'}, ${Math.round(b.level * 100)}%`; } } catch { /* no battery API */ }
    let tmin = Infinity, prev = performance.now();
    for (let i = 0; i < 2000; i++) { const t = performance.now(); if (t > prev) { tmin = Math.min(tmin, t - prev); } prev = t; }
    env.timerMs = finite(tmin) ? +tmin.toFixed(4) : null;
    const gl = scene3d && scene3d.renderer ? scene3d.renderer.getContext() : null;
    if (gl) {
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      const ext = (x) => !!gl.getExtension(x);
      env.gl = { version: gl.getParameter(gl.VERSION), glsl: gl.getParameter(gl.SHADING_LANGUAGE_VERSION), vendor: gl.getParameter(gl.VENDOR), renderer: gl.getParameter(gl.RENDERER),
        unmaskedVendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : null, unmaskedRenderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : null,
        maxTexture: gl.getParameter(gl.MAX_TEXTURE_SIZE), drawBuffers: gl.getParameter(gl.MAX_DRAW_BUFFERS), colorAttachments: gl.getParameter(gl.MAX_COLOR_ATTACHMENTS), samples: gl.getParameter(gl.MAX_SAMPLES),
        antialias: !!(gl.getContextAttributes() || {}).antialias,
        ext: { colorBufferFloat: ext('EXT_color_buffer_float'), colorBufferHalfFloat: ext('EXT_color_buffer_half_float'), textureFloatLinear: ext('OES_texture_float_linear'), floatBlend: ext('EXT_float_blend'), parallelCompile: ext('KHR_parallel_shader_compile'), timerQuery: ext('EXT_disjoint_timer_query_webgl2') },
        pixelRatio: scene3d.renderer.getPixelRatio() };
    }
    env.precision = lat.lattice && lat.lattice.stats ? lat.lattice.stats.precision : null;
    env.lattice = lat.lattice ? 'live' : (lat.reason || 'none');
    res.env = env;
  } catch (err) { res.errors.push(`ENV: ${err.message || err}`); }

  // 2. REFRESH
  enter('REFRESH', '', 1000);
  try {
    // the page's own loop idle (the flow held), so the intervals are the display's
    bench.hold = true; await benchWait(400);
    const iv = []; let last = 0;
    await new Promise((resolve) => { const f = (t) => { if (last) iv.push(t - last); last = t; if (iv.length < 60) requestAnimationFrame(f); else resolve(); }; requestAnimationFrame(f); });
    const m = median(iv);
    res.refresh = { medianMs: +m.toFixed(2), hz: +(1000 / m).toFixed(1), capped30: m >= 30 && m < 40, slow: m >= 40 };
  } catch (err) { res.errors.push(`REFRESH: ${err.message || err}`); }
  bench.hold = false;

  // 3. CPU
  enter('CPU');
  try {
    const t0 = performance.now();
    const f = createFlight({ fins: geometry.finDefaults }, { bus: null });
    f.run(12);
    const ms = performance.now() - t0;
    let str = '';
    f.history.forEach((r) => { str += `${Math.round(r.x * 1e6)},${Math.round(r.y * 1e6)},${Math.round(r.theta * 1e9)};`; });
    res.cpu = { flightMs: +ms.toFixed(1), apogeeFt: finite(f.state.apogee) ? +(f.state.apogee / M_PER_FT).toFixed(3) : null, historyHash: fnv1a(str) };
    f.destroy();
    const t1 = performance.now();
    geometry.buildSection({ cols: 512, rows: 160, finScale: 0.99991 });
    res.cpu.sectionMs = +(performance.now() - t1).toFixed(1);
  } catch (err) { res.errors.push(`CPU: ${err.message || err}`); }

  const l = lat.lattice;
  if (!l) {
    res.latticeNote = `LATTICE: ${String(lat.deferred ? 'off at tier 0' : lat.reason || 'none').toUpperCase()}`;
  } else {
    // 4. ENGINE, per tier
    for (const t of tiers) {
      enter('ENGINE', `T${t}`, 6000);
      res.engine[t] = await timed(`ENGINE T${t}`, async () => {
        bench.hold = true;
        governor.pin(t); applyLatticeTier(); await benchFrame();
        const L = lat.lattice; if (!L) throw new Error('no lattice');
        L.setInflow(0.10, 15 * RAD); L.setBodyRate(0); L.reset();
        const w0 = performance.now();
        while ((L.stats.steps || 0) < 2000 && performance.now() - w0 < 8000) { L.step(64); await L.sync(); }
        const developed = !!L.stats.developed;
        let N = 64, el = 0;
        for (;;) { const a = performance.now(); L.step(N); await L.sync(); el = performance.now() - a; if (el >= BENCH_ENGINE_TARGET_MS || N >= 8192) break; N *= 2; }
        const rates = [];
        for (let i = 0; i < 3; i++) { const a = performance.now(); L.step(N); await L.sync(); rates.push(N / ((performance.now() - a) / 1000)); }
        const sps = median(rates);
        const g = L.grid;
        const force = await L.sampleForce().catch(() => null);
        const chk = await L.check().catch(() => null);
        return { stepsPerSecond: Math.round(sps), mlups: +(sps * g.cols * g.rows / 1e6).toFixed(1), msPerStep: +(1000 / sps).toFixed(3), batch: N, precision: L.stats.precision, developed,
          grid: `${g.cols}x${g.rows}`, bad: chk ? chk.bad : null, maxU: chk ? +Number(chk.maxSpeed).toFixed(4) : null, maxDrho: chk ? +Number(chk.maxDrho).toFixed(4) : null,
          cn: force && finite(force.cn) ? +force.cn.toFixed(3) : null, cm: force && finite(force.cm) ? +force.cm.toFixed(3) : null };
      });
      if (params.get('precision') === 'both' && lat.mod && scene3d) {
        try {
          const g = LATTICE_GRIDS[t];
          const h = lat.mod.createLattice(scene3d.renderer, { cols: g.cols, rows: g.rows, tier: t, fixedGrid: true, precision: 'half' });
          await h.ready; h.setSection(sectionBuilder); h.setInflow(0.10, 15 * RAD); h.reset();
          for (let i = 0; i < 32; i++) { h.step(64); await h.sync(); }
          const a = performance.now(); h.step(1024); await h.sync();
          res.engine[`${t}half`] = { stepsPerSecond: Math.round(1024 / ((performance.now() - a) / 1000)), precision: h.stats.precision };
          h.destroy();
          builtSection = null; rebuildSection();
        } catch (err) { res.errors.push(`ENGINE T${t} half: ${err.message || err}`); }
      }
    }
    bench.hold = false;
    // 5. PACING, per tier
    for (const t of tiers) {
      enter('PACING', `T${t}`, BENCH_PACE_MS);
      res.pacing[t] = await timed(`PACING T${t}`, async () => {
        governor.pin(t); applyLatticeTier();
        startRun('full', { quiet: true });
        playback.setRate(1 / 8);
        const iv = [], cpu = [], samples = [];
        let flowingFrames = 0, frames = 0, longMax = 0, longN = 0, po = null;
        try { po = new PerformanceObserver((list) => { for (const e of list.getEntries()) { longN++; longMax = Math.max(longMax, e.duration); } }); po.observe({ type: 'long-animation-frame', buffered: false }); } catch { po = null; }
        const heap0 = performance.memory ? performance.memory.usedJSHeapSize : null;
        const t0 = performance.now();
        bench.tick = (interval, ms, flowing) => {
          if (performance.now() - t0 < BENCH_DISCARD_MS) return;
          frames++; if (flowing) flowingFrames++;
          if (finite(interval)) iv.push(interval);
          cpu.push(ms);
        };
        while (performance.now() - t0 < BENCH_PACE_MS) {
          await benchWait(1000);
          if (performance.now() - t0 < BENCH_DISCARD_MS) continue;
          const L = lat.lattice, st = L ? L.stats : {}, sc = scene3d && scene3d.stats ? scene3d.stats : {};
          samples.push({ sps: st.stepsPerSecond, rateSource: st.rateSource, stepScale: st.stepScale, shed: st.shed, issueMs: st.issueMs, msPerFrame: st.msPerFrame, sceneMs: sc.ms, calls: sc.calls, triangles: sc.triangles });
        }
        bench.tick = null;
        if (po) po.disconnect();
        playback.reset();
        const base = res.refresh ? res.refresh.medianMs : 1000 / 60;
        const sz = viewKind === '3d' ? { x: sceneCanvas.width, y: sceneCanvas.height } : null;   // the drawing buffer is the canvas's own size
        const fps = iv.length ? 1000 / (iv.reduce((a, b) => a + b, 0) / iv.length) : NaN;
        const spsList = samples.map((x) => x.sps).filter(finite), scales = samples.map((x) => x.stepScale).filter(finite), sceneMs = samples.map((x) => x.sceneMs).filter(finite);
        return { fps: +fps.toFixed(1), p50: +pct(iv, 0.5).toFixed(1), p90: +pct(iv, 0.9).toFixed(1), p95: +pct(iv, 0.95).toFixed(1), p99: +pct(iv, 0.99).toFixed(1), max: +Math.max(0, ...iv).toFixed(1),
          dropped: iv.length ? +(100 * iv.filter((x) => x > 1.5 * base).length / iv.length).toFixed(1) : null,
          tickP50: +pct(cpu, 0.5).toFixed(2), tickP95: +pct(cpu, 0.95).toFixed(2), stepsPerSecond: spsList.length ? Math.round(median(spsList)) : null,
          minStepScale: scales.length ? +Math.min(...scales).toFixed(2) : null, sceneMs: sceneMs.length ? +median(sceneMs).toFixed(2) : null,
          backingMpx: sz && finite(sz.x) ? +((sz.x * sz.y) / 1e6).toFixed(2) : null, flowingShare: frames ? +(flowingFrames / frames).toFixed(2) : null,
          longFrames: po ? longN : null, longMaxMs: po ? +longMax.toFixed(0) : null,
          heapMB: heap0 !== null && performance.memory ? { start: +(heap0 / 1e6).toFixed(1), end: +(performance.memory.usedJSHeapSize / 1e6).toFixed(1) } : null,
          histogram: (() => { const h = {}; for (const x of iv) { const b = Math.min(200, Math.round(x)); h[b] = (h[b] || 0) + 1; } return h; })() };
      });
    }
    // 6. AUTO (full only)
    if (BENCH === 'full') {
      enter('AUTO', '', BENCH_AUTO_MS);
      res.auto = await timed('AUTO', async () => {
        const changes = [], guard = [];
        const t0 = performance.now();
        const off = bus.on('governor:tier', (e) => changes.push({ t_ms: Math.round(performance.now() - t0), tier: e.tier, reason: e.reason || '' }));
        bench.event = (name, d) => { if (name === 'guard') guard.push({ t_ms: Math.round(performance.now() - t0), cap: d.cap, medianMs: Math.round(d.medianMs) }); };
        const start = governor.tier;
        governor.pin(null); resumeLattice();
        startRun('gust', { quiet: true });
        playback.setRate(1);
        while (performance.now() - t0 < BENCH_AUTO_MS) {
          await benchWait(1000);
          if (playback.atApogee || playback.done) { startRun('gust', { quiet: true }); playback.setRate(1); }
        }
        bench.event = null; if (typeof off === 'function') off();
        playback.reset();
        return { start, end: governor.tier, changes, guard, cap: lat.cap };
      });
    }
  }

  // 7. RESTORE AND REPORT
  enter('REPORT');
  try {
    bench.hold = false; bench.tick = null; bench.event = null;
    governor.pin(URL0.tier !== undefined ? Math.round(URL0.tier) : null);
    lat.cap = 3; applyLatticeTier();
    rateOverride = override0; armedGust = gust0;
    playback.reset();
    for (const [k, v] of Object.entries(snap)) { try { panel.set(k, v); } catch { /* a value the panel no longer takes */ } }
  } catch (err) { res.errors.push(`RESTORE: ${err.message || err}`); }
  if (rail) rail.inert = false;
  try { panel.attach({ bench: null }); } catch { /* ignored */ }
  res.finished = new Date().toISOString();
  res.totalS = Math.round((Date.parse(res.finished) - Date.parse(res.started)) / 1000);
  res.verdict = benchVerdict(res);
  const text = benchText(res);
  const json = JSON.stringify(res, null, 1);
  console.log(text); console.log(json);
  clearInterval(statusTimer);
  sec.querySelector('[data-bench-pre]').textContent = text;
  sec.querySelector('[data-bench-json]').textContent = json;
  sec.querySelector('[data-bench-copy]').disabled = false;
  sec.querySelector('[data-bench-again]').disabled = false;
  write(statusLine, 'Benchmark done / result below');
  write(statusEl, 'BENCHMARK DONE / RESULT BELOW'); statusEl.hidden = false;
  bench = null;
  benchResult = res;
  document.documentElement.dataset.bench = 'done';
  sec.querySelector('[data-bench-pre]').focus({ preventScroll: false });
  updateCaption(true); kick();
  return res;
}
function benchVerdict(res) {
  const ok = [];
  for (const t of res.tiers) {
    const e = res.engine[t], p = res.pacing[t];
    const engineOk = !!e && finite(e.stepsPerSecond) && e.stepsPerSecond >= 1.1 * BENCH_TIER_STEPS[t] * 60;
    const paceOk = !!p && finite(p.p95) && p.p95 <= 34 && finite(p.dropped) && p.dropped <= 5 && (p.minStepScale === null || p.minStepScale >= 0.75);
    if (engineOk && paceOk) ok.push(t);
  }
  const rec = ok.length ? Math.max(...ok) : 0;
  const heur = governor.ceiling;
  return { heuristic: heur, recommended: rec, word: rec === heur ? 'MATCHES' : heur > rec ? 'HEURISTIC TOO HIGH' : 'HEURISTIC TOO LOW', passing: ok };
}
function benchText(res) {
  const e = res.env || {}, g = e.gl || {}, x = g.ext || {};
  const yn = (v) => (v ? 'y' : 'n');
  const col = (v, w) => String(v === null || v === undefined || (typeof v === 'number' && !Number.isFinite(v)) ? 'n/a' : v).padEnd(w);
  const L = [];
  L.push(`CHARGER FIELD BENCH v1 / ${res.started} / page deployed ${res.deployed}`);
  L.push(`MODE      ${res.mode} / tiers ${res.tiers.join(' ')} / ${res.totalS} s`);
  if (e.reduced) L.push('NOTE      REDUCED MOTION IS ON: THE PAGE NORMALLY RUNS THE LATTICE AT TIER 0');
  L.push(`BROWSER   ${e.userAgent || 'n/a'}`);
  L.push(`DEVICE    cores ${e.cores ?? 'n/a'} / memory ${e.memoryGB ? `${e.memoryGB} GB` : 'n/a'} / dpr ${e.dpr} / screen ${e.screen} / viewport ${e.viewport} / coarse ${e.coarse ? 'yes' : 'no'} / reduced ${e.reduced ? 'yes' : 'no'} / battery ${e.battery || 'n/a'}`);
  L.push(`GL        ${g.version || 'n/a'} / ${g.glsl || 'n/a'}`);
  L.push(`GPU       vendor ${g.vendor || 'n/a'} / renderer ${g.renderer || 'n/a'} / unmasked ${g.unmaskedVendor || 'n/a'} ${g.unmaskedRenderer || ''}`.trimEnd());
  L.push(`LIMITS    max texture ${g.maxTexture ?? 'n/a'} / draw buffers ${g.drawBuffers ?? 'n/a'} / samples ${g.samples ?? 'n/a'} / antialias ${g.antialias ? 'yes' : 'no'}`);
  L.push(`EXT       color_buffer_float ${yn(x.colorBufferFloat)} / color_buffer_half_float ${yn(x.colorBufferHalfFloat)} / texture_float_linear ${yn(x.textureFloatLinear)} / float_blend ${yn(x.floatBlend)} / parallel_compile ${yn(x.parallelCompile)} / timer_query ${yn(x.timerQuery)}`);
  const r = res.refresh || {};
  L.push(`TIMER     resolution ${e.timerMs ?? 'n/a'} ms / display ${r.hz ?? 'n/a'} Hz${r.capped30 ? ' (RAF CAPPED NEAR 30 HZ: LOW POWER MODE OR ENERGY SAVER)' : r.slow ? ' (FRAMES SLOWER THAN 25 HZ WITH THE PAGE IDLE)' : ''}`);
  L.push(`GOVERNOR  heuristic T${e.heuristicTier ?? governor.ceiling} / precision ${e.precision || 'n/a'}`);
  const c = res.cpu || {};
  L.push(`CPU       flight run(12) ${c.flightMs ?? 'n/a'} ms / apogee ${c.apogeeFt ?? 'n/a'} ft / history ${c.historyHash || 'n/a'} / section 512x160 ${c.sectionMs ?? 'n/a'} ms`);
  if (res.latticeNote) L.push(res.latticeNote);
  else {
    L.push('ENGINE    tier  steps/s  MLUPS  ms/step  precision  developed  bad  maxU    maxDrho  cn      cm');
    for (const t of res.tiers) {
      const q = res.engine[t] || {};
      L.push(q.error ? `          ${col(t, 6)}error: ${q.error}` : `          ${col(t, 6)}${col(q.stepsPerSecond, 9)}${col(q.mlups, 7)}${col(q.msPerStep, 9)}${col(q.precision, 11)}${col(q.developed ? 'y' : 'n', 11)}${col(q.bad, 5)}${col(q.maxU, 8)}${col(q.maxDrho, 9)}${col(q.cn, 8)}${col(q.cm, 8)}${q.interrupted ? ` interrupted (${q.interrupted})` : ''}`);
      const h = res.engine[`${t}half`]; if (h) L.push(`          ${col(`${t}h`, 6)}${col(h.stepsPerSecond, 9)}${col('', 7)}${col('', 9)}${col(h.precision, 11)}`);
    }
    L.push('PACING    tier  fps    p50     p90     p95     p99     max     dropped  tick p50/p95  steps/s  stepScale  scene ms  backing Mpx');
    for (const t of res.tiers) {
      const q = res.pacing[t] || {};
      L.push(q.error ? `          ${col(t, 6)}error: ${q.error}` : `          ${col(t, 6)}${col(q.fps, 7)}${col(q.p50, 8)}${col(q.p90, 8)}${col(q.p95, 8)}${col(q.p99, 8)}${col(q.max, 8)}${col(q.dropped === null ? null : `${q.dropped}%`, 9)}${col(`${q.tickP50}/${q.tickP95}`, 14)}${col(q.stepsPerSecond, 9)}${col(q.minStepScale, 11)}${col(q.sceneMs, 10)}${col(q.backingMpx, 8)}${q.interrupted ? ` interrupted (${q.interrupted})` : ''}`);
    }
    if (res.auto) {
      const a = res.auto;
      const ch = a.error ? `error: ${a.error}` : (a.changes || []).filter((q) => q.reason !== 'pinned by visitor' && q.reason !== 'unpinned').map((q) => `${(q.t_ms / 1000).toFixed(1)} s T${q.tier} (${q.reason})`).join(', ') || 'no change';
      const gd = a.guard && a.guard.length ? a.guard.map((q) => `${(q.t_ms / 1000).toFixed(1)} s cap ${q.cap} (median ${q.medianMs} ms)`).join(', ') : 'none';
      L.push(`AUTO      start T${a.start} / ${ch} / guard ${gd} / end T${a.end}`);
    }
  }
  const v = res.verdict || {};
  L.push(`VERDICT   heuristic T${v.heuristic} / recommended T${v.recommended} / ${v.word}`);
  if (res.errors.length) L.push(`ERRORS    ${res.errors.join(' / ')}`);
  return L.join('\n');
}

/* for probes and the lab: read-only handles */
Object.defineProperty(window, '__field', { value: Object.freeze({
  flight, panel, playback, geometry, story,
  get scene() { return scene3d || fbView; }, get lattice() { return lat.lattice; }, get slot() { return { ...lat }; },
  get end() { return endSummary ? { ...endSummary } : null; },   // the last end card's figures (run tracker, SIM)
  launchDefault, startRun, disarmGust, armedGust: () => armedGust, prepareLaunch,   // hooks: the title plate and the panel
  get flightGustMph() { return flightGustMph; },   // the flight in progress's own gust (fix phase: DISARM mid-flight changes only the next launch)
  // the narrated replay (wave 2): the beat plan of the flight in progress, the planner (cached
  // pre-flights), the narrator, the director, the AUTO view and the reduced-motion beat stepper
  get plan() { return plan; }, planner, narrator, get director() { return director; },
  get viewAuto() { return isViewAuto(); }, setViewAuto, beat, rateLabel,
  // wave 3: the path figures' outcome (item 9), the chart's beats (item 11), the director's kind, the
  // idle pause, a parked scene (a lost context) and the benchmark's result (?bench)
  get figure() { return { ...figureState, runs: { ...figureState.runs } }; },
  get beats() { return beatsNow(); }, get ghostTrace() { return chartGhost; },
  get sceneDirector() { return sceneDirector; },
  get idle() { return { paused: !!lat.idle, sinceActivityMs: Math.round(performance.now() - lastActivity), afterMs: LATTICE_IDLE_MS, exempt: idleExempt() }; },
  get parked() { return !!parked; },
  get bench() { return benchResult; },
}) });
if (BENCH) runBench().catch((err) => { console.warn('[field] the benchmark failed', err); document.documentElement.dataset.bench = 'failed'; });
