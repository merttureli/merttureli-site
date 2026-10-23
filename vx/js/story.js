/* story.js: the story layer over the CHARGER field study stage (PRESENTATION-PLAN items 2, 3, 7
   and 8; item 12's director hook).

   It owns no physics and draws nothing in WebGL. Its parts:

   1. createRunTracker(flight): the run cards' definitions in one place. main.js tracks the live
      flight with it, and planFlight (below) flies every run preview with it, so the end card and
      the run cards can never disagree. It samples flight.state on the run cards' grid, every
      SAMPLE_STEPS flight steps (5 ms); call sample() after each step whose state.stepIndex is a
      multiple of SAMPLE_STEPS.
        peakAlpha  largest |alpha| after rail exit, ascent only, airspeed above 50 ft/s (EST,
                   the panel's MAX AOA rule), deg; peakT its flight time, s
        settle     the last sample at or above 2 deg of |alpha| (same samples) minus the time of
                   the last gust (noteGust), or of rail exit when no gust was fired, s; 0 when
                   |alpha| never reached 2 deg
        theta60    first time the pitch passes 60 deg before apogee, s
        alphaRail  alpha at the rail exit event, deg; theta1 pitch at T+1 s, deg
        apogee     ft; upwind  -x at apogee, ft; marginUp  first time a negative liftoff margin
                   turns positive as the CG moves forward, s
      Every value is SIM: computed in this tab from the flight model.

   2. planFlight(config, { gustMph }) -> plan: the silent pre-flight (item 7). It flies the same
      deterministic configuration as the live flight, with the armed gust fired at rail exit as
      main.js fires it, to apogee, and returns the tracker's result (the run cards use it, so the
      cards, the end card and the beats share one definition), the beat times, the speed ramp
      and a decimated path. flight.js integrates at a fixed 1 ms whatever the step pattern, so
      the live flight repeats the pre-flight exactly until the visitor adds a gust or a flick.
        plan.kind    'wobble' (disturbed, settles), 'over' (an unstable rocket whose pitch passes
                     60 deg) or 'calm' (|alpha| never reaches 2 deg after rail exit)
        plan.beats   { railExit, gust, peak, peakAlpha, zero, swing, settle, settleLast, pitch60,
                     burnout, apogee }, s of flight time (NaN when absent): peak is the first
                     local maximum of |alpha| at 2 deg or more after rail exit, zero the first
                     sign change of alpha after it, swing the first pitch extreme after it,
                     settle the end of the wobble (the last sample at 2 deg or more before
                     |alpha| stays under 2 deg for SETTLE_QUIET_S), settleLast the tracker's
                     settle (the last such sample before apogee; equal for the default launch)
        plan.beatList [{ t, name }] in time order: the stops of NEXT BEAT and PREVIOUS BEAT
                     (a wobbling flight also stops at its second peak of |alpha|, 'peak2', so
                     the EACH SWING SMALLER caption has a stop of its own)
        plan.keys    the ramp's keyframes [[t, rate], ...]; plan.rateAt(t) eases between them in
                     log space with a smoothstep (cinematic/scripts/ramp.mjs). plan.slow is the
                     slow rate, plan.freezeAt the HOLD time (or NaN), plan.freezeMs 1500.
        plan.screen(a, b)  seconds of screen time the ramp gives flight times a..b (no HOLD)
        plan.path    [{ t, x, y }] every 50 ms to apogee, x downrange and y altitude in m (SIM),
                     for the lede figure, the run card sketches and the end plate (items 9 and 10)
        plan.trace   [[t, alphaDeg, thetaDeg], ...] every 10 ms to apogee (SIM), for the strip
                     chart's pad preview and its ghost trace (item 11)
        plan.result.liftTurnDeg  for an airframe unstable at small angles (negative margin at
                     liftoff), the angle of attack above which the body lift behind the CG turns
                     the nose back (the static moment changes sign, flight.js aeroLoads' terms at
                     the liftoff CG), deg; NaN otherwise (SIM; Run 02's card)
      The ramp (EST): 1/8 on the rail; from 0.05 s before rail exit a slow rate, chosen so that
      rail exit to settle (or to pitch past 60 deg) takes about RAMP.TARGET_S of screen time,
      clamped to 1/32..1/8 and rounded to a readable fraction (RAMP.NICE); held through the
      first pitch extreme (where a wobbling flight freezes for 1.5 s, labeled HOLD); 1/4 by
      0.08 s after the settle; real time by T+1.6 s or soon after. A calm flight goes from 1/8
      on the rail to real time by T+1.6 s. Never faster than real time.
   createPlanner() caches plans by configuration, so the run previews computed in idle time are
   reused when the same configuration is launched.

   3. createNarrator({ onCaption, onEmphasis }): the plain captions of the narrated replay. It is
      fed every 5 ms sample of the live flight and shows one line, changed only when the flight's
      state crosses a condition, never on a timer, so a still-air flight never claims a push:
        rail      on the rail, until the rail exit event
        off       the rail exit event: the forward button leaves the rail (flight.state.railExitSpeed)
        gust      after a gust, stable rocket with fins: while the flight repeats its pre-flight,
                  as |alpha| first reaches 2 deg, named with the pre-flight's peak (plan.beats.
                  peakAlpha), so the words come while the nose tips; off the plan, at the first
                  peak of |alpha| (2 deg or more), with that peak
        push      |alpha| 2 deg or more and falling, the aerodynamic moment against alpha, a
                  positive static margin and fins on (the distance is the fins' CP behind the
                  live CG)
        smaller   a later peak of |alpha| smaller than the one before, after a zero crossing
        straight  |alpha| under 2 deg and staying there (the pre-flight's settle time while the
                  flight repeats it; otherwise 0.2 s of flight under 2 deg)
        coast     burnout passed and nothing else pending (never after 'over')
        sideways  no fins, |alpha| 2 deg or more and rising
        over      the pitch past 60 deg, unstable at liftoff
      A caption stays at least DWELL_MS of running wall time at the narrated slow rate (RAMP.MAX,
      1/8) before the next one replaces it; a faster rate shortens the dwell in proportion (at real
      time it is DWELL_MS / 8 of flight time), a slower one never lengthens it. The dwell only holds
      a caption whose own condition still holds: once it stops holding (the rail caption after rail
      exit, the gust caption once the nose has crossed zero), the next pending caption that holds
      replaces it at once. A pending caption whose condition no longer holds by then is dropped.
      frame(wallMs, running, rate) takes the true playback rate. While paused or stepping
      (NEXT BEAT, STEP) the newest beat the step passed shows at once. The narration ends at apogee
      (the end card takes over).

   4. createStory({ stage, onReplay, onToggleFins, onContinue, onBeat, onPlate }): the DOM. The end card
      ([data-end]), the caption slot ([data-story-cap]), the title plate ([data-plate]), the
      slate ([data-slate]) and the reduced-motion beat buttons ([data-beat="next|prev"]).
      story.showEnd(summary) / hideEnd(), story.plateLine(text, tag) (the end plate's caption, the
      card's last line), story.caption(text), story.showPlate() /
      hidePlate({ instant }), story.plateShown (onPlate(shown) on each change), story.slate(text | null, { loud }),
      story.setBeats({ prev, next }) (enable state), story.endShown, story.card, destroy().

   5. createDirector(scene, { reduced }) (item 12, through the scene's own API): the empty stage
      in the 'hero' preset, the side view from ignition, a slow push-in from rail exit to the
      settle, an ease-out from burnout, the slice dissolved while playing. It stands down for
      good once the visitor picks a camera or orbits. Reduced motion: side throughout, no moves.

   Reduced motion: the end card, the plate and the slate appear without transitions (field.css).
   No WebGL: everything here is DOM over the 2D view and works unchanged. */
import { createFlight, DT, CG_ESTIMATE_CAD, PAGE_RAIL_BUTTONS } from './flight/flight.js';
import { bodyLiftCn } from './flight/barrowman.js';

const DEG = 180 / Math.PI;
const M_PER_FT = 0.3048;                  // STD, exact
const M_PER_IN = 0.0254;                  // STD, exact
const MPS_PER_MPH = 0.44704;              // STD, exact
export const SAMPLE_STEPS = 5;            // flight steps (1 ms each) per tracker sample: the run cards' 5 ms grid
export const SETTLE_DEG = 2;              // EST: "under 2° AOA" on the run cards
export const SETTLE_V_MIN = 50 * M_PER_FT;  // m/s: only samples above 50 ft/s count, as the panel's MAX AOA (EST)
export const PITCH_OVER = Math.PI / 3;    // 60 deg: "pitch past 60°" on the run cards
export const RAMP = Object.freeze({       // EST, the narrated replay's speed ramp (PRESENTATION-PLAN item 7)
  RAIL: 1 / 8, MIN: 1 / 32, MAX: 1 / 8, QUARTER: 1 / 4, TARGET_S: 12, HOLD_MS: 1500, REAL_BY: 1.6,
  NICE: Object.freeze([8, 10, 12, 16, 20, 24, 32]),
});
export const DWELL_MS = 1500;             // a caption stays at least this long (wall time at the narrated 1/8) while the replay runs and it holds
export const SETTLE_QUIET_S = 0.3;        // s of flight under 2 deg that end a wobble (the ramp, NEXT BEAT and the STRAIGHT caption)
const PATH_EVERY = 10;                    // samples (50 ms) per path point
const TRACE_MS = 10;                      // ms of flight per trace point (the flight history's 0.01 s)

const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/* ------------------------------------------------------------------ run tracker */
export function createRunTracker(flight) {
  let out, railT, lastBig, apoT, gustT;
  function start() {
    const d = flight.derived || {};
    out = { margin0: d.staticMargin, marginBo: d.staticMarginBurnout, alphaRail: NaN, peakAlpha: 0, peakT: NaN, theta60: NaN, theta1: NaN, apogee: NaN, apogeeT: NaN, upwind: NaN, settle: NaN, marginUp: NaN, railT: NaN, gustT: NaN };
    railT = NaN; lastBig = NaN; apoT = Infinity; gustT = NaN;
  }
  function sample() {
    const s = flight.state;
    if (!finite(railT)) {
      const e = flight.events.find((x) => x.name === 'railExit');
      if (e) { railT = e.t; out.alphaRail = e.state.alpha * DEG; }
    }
    if (finite(s.apogee) && apoT === Infinity) { apoT = s.t; out.apogee = s.apogee / M_PER_FT; out.apogeeT = s.t; out.upwind = -s.x / M_PER_FT; }
    if (finite(railT) && s.t <= apoT && s.airspeed > SETTLE_V_MIN) {
      const a = Math.abs(s.alpha) * DEG;
      if (a > out.peakAlpha) { out.peakAlpha = a; out.peakT = s.t; }
      if (a >= SETTLE_DEG) lastBig = s.t;
    }
    if (!finite(out.theta60) && Math.abs(s.theta) > PITCH_OVER && s.t < apoT) out.theta60 = s.t;
    if (!finite(out.theta1) && s.t >= 1) out.theta1 = s.theta * DEG;
    // the static margin (Barrowman CP against the live CG) crossing to positive as the CG moves forward
    if (!finite(out.marginUp) && out.margin0 < 0 && finite(s.margin) && s.margin >= 0) out.marginUp = s.t;
  }
  function result() {
    const from = finite(gustT) ? gustT : railT;
    out.settle = finite(lastBig) && finite(from) ? Math.max(0, lastBig - from) : 0;
    out.railT = railT; out.gustT = gustT;
    return { ...out };
  }
  start();
  return {
    start, sample, result,
    /* a gust fired at flight time t (the armed one at rail exit, or FIRE GUST); the settle time counts from the last one */
    noteGust(t) { if (finite(t) && t <= apoT) gustT = t; },
    get gustT() { return gustT; },
    get lastBig() { return lastBig; },
  };
}

/* ------------------------------------------------------------------ the ramp */
/* log-space smoothstep between keyframes [[t, rate], ...] (cinematic/scripts/ramp.mjs) */
export function rateAt(keys, t) {
  if (!keys || !keys.length) return RAMP.RAIL;
  if (!(t > keys[0][0])) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t0, r0] = keys[i - 1], [t1, r1] = keys[i];
    if (t <= t1) { const u = (t - t0) / (t1 - t0); const s = u * u * (3 - 2 * u); return Math.exp(Math.log(r0) + (Math.log(r1) - Math.log(r0)) * s); }
  }
  return keys[keys.length - 1][1];
}
/* seconds of screen time the keyframes give flight times a..b */
export function screenTime(keys, a, b, dt = 0.0005) {
  if (!(b > a)) return 0;
  let s = 0;
  for (let t = a; t < b; t += dt) s += Math.min(dt, b - t) / rateAt(keys, t + 0.5 * Math.min(dt, b - t));
  return s;
}
function keysFor(kind, b, slow) {
  const R = RAMP.RAIL;
  const tR = finite(b.railExit) ? b.railExit : 0.25;
  if (kind === 'calm') return [[0, R], [tR + 0.05, R], [Math.max(RAMP.REAL_BY, tR + 0.6), 1]];
  const k = [[0, R], [Math.max(0.005, tR - 0.05), R], [tR + 0.05, slow]];
  if (kind === 'over') {
    const t60 = Math.max(b.pitch60, tR + 0.15);
    k.push([t60, slow], [t60 + 0.4, 1 / 2], [t60 + 0.8, 1]);
  } else {
    const tS = Math.max(b.settle, tR + 0.15);
    const tHold = finite(b.swing) && b.swing < tS ? Math.max(b.swing + 0.05, tR + 0.1) : tR + 0.1;
    const tQ = Math.max(tS + 0.08, tHold + 0.1);
    k.push([tHold, slow], [tQ, RAMP.QUARTER], [Math.max(RAMP.REAL_BY, tQ + 0.5), 1]);
  }
  return k;
}
function chooseSlow(kind, b) {
  if (kind === 'calm') return RAMP.RAIL;
  const end = kind === 'over' ? b.pitch60 : b.settle;
  const f = (s) => screenTime(keysFor(kind, b, s), b.railExit, end, 0.001);
  if (f(RAMP.MAX) >= RAMP.TARGET_S) return RAMP.MAX;
  if (f(RAMP.MIN) <= RAMP.TARGET_S) return RAMP.MIN;
  let lo = Math.log(RAMP.MIN), hi = Math.log(RAMP.MAX);
  for (let i = 0; i < 24; i++) { const m = 0.5 * (lo + hi); if (f(Math.exp(m)) > RAMP.TARGET_S) lo = m; else hi = m; }
  const raw = Math.exp(0.5 * (lo + hi));
  // a readable fraction: the header and the panel print 1/n
  const den = RAMP.NICE.reduce((best, d) => (Math.abs(Math.log(d * raw)) < Math.abs(Math.log(best * raw)) ? d : best), RAMP.NICE[0]);
  return 1 / den;
}

/* The angle of attack above which an airframe that is unstable at small angles turns its nose back:
   the static moment of flight.js aeroLoads (nose and fins with sin alpha at their CPs, body lift
   1.1 (A_plan / A_ref) sin^2 alpha at the planform centroid), taken about the liftoff CG, changes
   sign from tipping to restoring. Bisected to 0.01 deg between 0 and 60 deg; NaN for a stable
   airframe (or one that never turns back below 60 deg). SIM, from the flight's own derived values. */
export function liftTurnDeg(fl) {
  const d = fl && fl.derived;
  if (!d || !(d.staticMargin < 0)) return NaN;
  const xcg = d.xcgLiftoff;
  const M = (al) => {
    const sa = Math.sin(al);
    return -(d.noseCna * sa * (d.noseXcp - xcg) + (d.finsActive ? d.finCna * sa * (d.finXcp - xcg) : 0) + bodyLiftCn(al, d.planformArea, d.refArea) * (d.planformCentroid - xcg));
  };
  const R = Math.PI / 180;
  let lo = 0.01 * R, hi = NaN;
  for (let deg = 0.5; deg <= 60 + 1e-9; deg += 0.5) { if (M(deg * R) < 0) { hi = deg * R; break; } lo = deg * R; }
  if (!finite(hi)) return NaN;
  for (let i = 0; i < 40; i++) { const mid = 0.5 * (lo + hi); if (M(mid) < 0) hi = mid; else lo = mid; }
  return 0.5 * (lo + hi) / R;
}

/* ------------------------------------------------------------------ the pre-flight */
export function planFlight(config, { gustMph = 0 } = {}) {
  const f = createFlight({ ...config }, { bus: null });
  const tr = createRunTracker(f);
  const gustMps = gustMph > 0 ? gustMph * MPS_PER_MPH : 0;
  // fired inside the rail exit event, as main.js fires the armed gust on the live flight
  if (gustMps > 0) f.onEvent((e) => { if (e.name === 'railExit' && !finite(tr.gustT)) { tr.noteGust(e.t); f.gust(gustMps); } });
  f.ignite(); tr.start();
  const chunk = SAMPLE_STEPS * DT;
  const S = [];
  const path = [];
  const trace = [];
  for (let i = 0; i < 4000 && !f.done; i++) {
    f.step(chunk); tr.sample();
    const s = f.state;
    S.push({ t: s.t, a: s.alpha, th: s.theta, v: s.airspeed });
    if (i % PATH_EVERY === 0) path.push({ t: s.t, x: s.downrange, y: s.altitude });
    if (Math.round(s.t * 1000) % TRACE_MS === 0) trace.push(Object.freeze([s.t, s.alpha * DEG, s.theta * DEG]));
    if (finite(s.apogee)) { path.push({ t: s.t, x: s.downrange, y: s.altitude }); break; }
  }
  const r = tr.result();
  r.fn = f.derived.naturalFrequency(30) / (2 * Math.PI);    // the Run 05 card's frequency at 98 ft/s
  const ev = (n) => { const e = f.events.find((x) => x.name === n); return e ? e.t : NaN; };
  const tR = r.railT;
  r.liftTurnDeg = liftTurnDeg(f);
  const b = { railExit: tR, gust: r.gustT, peak: NaN, peakAlpha: NaN, zero: NaN, peak2: NaN, swing: NaN, settle: NaN, settleLast: NaN, pitch60: NaN, burnout: ev('burnout'), apogee: r.apogeeT };
  const after = S.filter((x) => x.t > tR);
  const abs = (x) => Math.abs(x.a) * DEG;
  let iP = -1;
  for (let i = 0; i + 1 < after.length; i++) {
    const a = abs(after[i]), prev = i > 0 ? abs(after[i - 1]) : -Infinity, next = abs(after[i + 1]);
    if (a >= SETTLE_DEG && a >= prev && a > next) { iP = i; break; }
  }
  if (iP >= 0) {
    b.peak = after[iP].t; b.peakAlpha = abs(after[iP]);
    let iZ = -1;
    for (let i = iP + 1; i < after.length; i++) if (after[i].a * after[iP].a < 0) { b.zero = after[i].t; iZ = i; break; }
    // the second peak of |alpha| (2 deg or more) after the zero crossing: where EACH SWING SMALLER is named
    if (iZ > 0) {
      for (let i = iZ; i + 1 < after.length; i++) {
        const a = abs(after[i]), prev = abs(after[i - 1]), next = abs(after[i + 1]);
        if (a >= SETTLE_DEG && a >= prev && a > next) { b.peak2 = after[i].t; break; }
      }
    }
    for (let i = iP + 1; i + 1 < after.length; i++) {
      const d0 = after[i].th - after[i - 1].th, d1 = after[i + 1].th - after[i].th;
      if (d0 !== 0 && d0 * d1 <= 0) { b.swing = after[i].t; break; }
    }
  }
  // settle: the end of the wobble, the last sample at 2 deg or more before |alpha| stays under 2 deg
  // for SETTLE_QUIET_S (counted samples, ascent). It equals the tracker's settle when the flight stays
  // straight to apogee (the default launch); a strong crosswind lifts |alpha| again late in the coast,
  // which the tracker's definition counts and the ramp and the captions do not wait for.
  const apoLim = finite(r.apogeeT) ? r.apogeeT : Infinity;
  let lastBigT = NaN;
  for (const x of after) {
    if (x.t > apoLim) break;
    if (!(x.v > SETTLE_V_MIN)) continue;
    if (abs(x) >= SETTLE_DEG) lastBigT = x.t;
    else if (finite(lastBigT) && x.t - lastBigT >= SETTLE_QUIET_S - 1e-9) { b.settle = lastBigT; break; }
  }
  if (!finite(b.settle) && r.settle > 0 && finite(lastBigT)) b.settle = lastBigT;
  b.settleLast = r.settle > 0 ? r.settle + (finite(r.gustT) ? r.gustT : tR) : NaN;
  const over = finite(r.theta60) && r.margin0 < 0;
  if (over) b.pitch60 = r.theta60;
  const kind = over ? 'over' : (r.peakAlpha >= SETTLE_DEG && finite(b.settle)) ? 'wobble' : 'calm';
  const slow = chooseSlow(kind, b);
  const keys = keysFor(kind, b, slow);
  const lastKey = keys[keys.length - 1][0];
  const freezeAt = kind === 'wobble' && finite(b.swing) && b.swing > tR && b.swing < lastKey && b.swing < (finite(b.settle) ? b.settle + 0.08 : Infinity) ? b.swing : NaN;
  const beatList = [];
  const add = (t, name) => { if (finite(t) && !beatList.some((x) => Math.abs(x.t - t) < 1e-6)) beatList.push({ t, name }); };
  add(tR, 'railExit');
  if (kind !== 'calm') add(b.peak, 'peak');
  if (kind === 'wobble') { add(b.zero, 'zero'); add(b.swing, 'swing'); add(finite(b.peak2) && b.peak2 < (finite(b.settle) ? b.settle : Infinity) ? b.peak2 : NaN, 'peak2'); add(finite(b.settle) ? b.settle + SAMPLE_STEPS * DT : NaN, 'settle'); }
  if (kind === 'over') add(b.pitch60, 'pitch60');
  add(b.burnout, 'burnout');
  add(b.apogee, 'apogee');
  beatList.sort((x, y) => x.t - y.t);
  f.destroy();
  return Object.freeze({
    kind, gustMph: gustMps > 0 ? gustMph : 0, result: r, beats: Object.freeze(b), beatList: Object.freeze(beatList),
    keys: Object.freeze(keys.map((k) => Object.freeze(k))), slow, freezeAt, freezeMs: RAMP.HOLD_MS, path: Object.freeze(path),
    trace: Object.freeze(trace),
    rateAt: (t) => rateAt(keys, t),
    screen: (a, z) => screenTime(keys, a, z),
  });
}

/* plans cached by configuration (the run previews and the default launches are flown once) */
export function createPlanner() {
  const cache = new Map();
  const r9 = (v) => (finite(v) ? Math.round(v * 1e9) / 1e9 : String(v));
  function keyOf(c, gustMph) {
    const fins = c.fins || {};
    return JSON.stringify([r9(c.finScale), r9(c.wind), r9(c.cgFromNose), r9(c.railLength), r9(c.launchAngle), r9(c.seed), r9(c.turbulence), r9(c.massLiftoff), r9(c.cd),
      r9(fins.n), r9(fins.root), r9(fins.tip), r9(fins.span), r9(fins.sweep), r9(fins.rootLeadingEdgeFromNose), r9(gustMph > 0 ? gustMph : 0)]);
  }
  return {
    plan(config, { gustMph = 0 } = {}) {
      const k = keyOf(config, gustMph);
      let p = cache.get(k);
      if (!p) { p = planFlight(config, { gustMph }); cache.set(k, p); if (cache.size > 24) cache.delete(cache.keys().next().value); }
      return p;
    },
    peek(config, { gustMph = 0 } = {}) { return cache.get(keyOf(config, gustMph)) || null; },
    keyOf,
    get size() { return cache.size; },
  };
}

/* ------------------------------------------------------------------ caption text (owner copy, COPY-REVIEW.md) */
/* sentence case here; the caption slot sets it in caps (field.css). Every number keeps its tag. */
const f1 = (v) => (finite(v) ? Math.abs(v).toFixed(1) : '—');
const f2 = (v) => (finite(v) ? Math.abs(v).toFixed(2) : '—');
export const CAPTION_TEXT = Object.freeze({
  rail: () => 'On the rail',
  off: (d) => `Off the rail at ${f1(d.ftps)} ft/s SIM`,
  gust: (d) => `A gust from the side, ${f1(d.mph)} mph EST: the nose tips up to ${f1(d.deg)}° SIM`,
  push: (d) => `The fins, ${f1(d.inches)} in SIM behind the balance point, push it back`,
  smaller: () => 'Each swing smaller',
  straight: (d) => `Straight again, ${f2(d.s)} s SIM after ${d.gust ? 'the gust' : 'rail exit'}`,
  coast: () => 'Coasting up',
  apogee: () => 'Apogee',
  sideways: () => 'Nothing pushes back: it turns sideways',
  over: (d) => `Past 60° at T+${f2(d.t)} s SIM`,
});
const RANK = { rail: 0, off: 1, gust: 2, sideways: 2, push: 3, smaller: 4, straight: 5, over: 5, coast: 6, apogee: 9 };
/* the plate each beat is about (item 7's emphasis; markers.out.shown names air, alpha, n, plus cg, cp, alt, thrust) */
export const EMPHASIS = Object.freeze({
  rail: ['thrust'], off: ['air', 'alpha'], gust: ['air', 'alpha'], push: ['cp', 'n'], smaller: ['air', 'alpha'],
  straight: ['air', 'alpha'], coast: ['alt'], sideways: ['air', 'alpha', 'cp', 'n'], over: ['air', 'alpha'], apogee: null,
});

/* ------------------------------------------------------------------ the narrator */
export function createNarrator({ onCaption = () => {}, onEmphasis = () => {}, dwellMs = DWELL_MS } = {}) {
  let on = false, plan = null, valid = false;
  let shown = null, dwellLeft = 0;
  let queue = [];             // triggered beats in order, each shown when the one before has dwelt, if it still holds
  let m = null;
  const freshMem = () => ({ railT: NaN, prevA: NaN, prevT: NaN, prevSign: 0, rising: false, peaks: [], crossed: false, lastBig: NaN, under: NaN,
    pushed: false, smaller: false, straight: false, gustShown: false, sideways: false, over: false, coast: false, origin: NaN });
  let gust = null;            // { t, mph } the last gust
  let floor = -1;             // captions of a lower or equal rank than this do not come back (a new gust or flick lowers it)
  let lastState = null, lastFlight = null;

  function trigger(id, data) {
    const rank = RANK[id];
    if (rank <= floor) return;                         // a beat already passed does not come back (a new gust or flick lowers the floor)
    if (queue.some((q) => q.id === id)) return;
    queue = queue.filter((q) => q.rank < rank);        // a later beat drops nothing before it, an earlier one never follows it
    queue.push({ id, rank, text: CAPTION_TEXT[id](data || {}), data });
  }
  function validNow(w, s, fl) {
    if (!w) return false;
    const a = Math.abs(s.alpha) * DEG;
    switch (w.id) {
      case 'rail': return !finite(m.railT);
      case 'off': return finite(m.railT);
      case 'gust': return a >= SETTLE_DEG && !m.crossed;
      case 'push': return a >= SETTLE_DEG && !m.rising && s.Maero * s.alpha < 0 && s.margin > 0 && fl.config.finScale > 0.005;
      case 'smaller': return !m.straight && !m.over;
      case 'straight': return a < SETTLE_DEG;
      case 'coast': return s.phase === 'coast' || s.phase === 'descent';
      case 'sideways': return a >= SETTLE_DEG;
      default: return true;
    }
  }
  function show(w) {
    shown = w; dwellLeft = dwellMs;
    floor = Math.max(floor, w.rank);
    onCaption(w.text, w.id);
    onEmphasis(EMPHASIS[w.id] === undefined ? null : EMPHASIS[w.id], w.id);
  }
  return {
    get on() { return on; },
    get plan() { return plan; },
    get valid() { return valid; },
    get caption() { return shown ? shown.text : ''; },
    get id() { return shown ? shown.id : null; },
    get pending() { return queue.map((q) => q.id); },
    get state() { return m ? { ...m, peaks: m.peaks.slice(), floor, gust: gust ? { ...gust } : null } : null; },
    start(p) { on = true; plan = p || null; valid = !!p; shown = null; queue = []; dwellLeft = 0; floor = -1; gust = null; m = freshMem(); },
    stop() { on = false; plan = null; valid = false; shown = null; queue = []; m = null; gust = null; onCaption('', null); onEmphasis(null, null); },
    /* the live flight left the pre-flight's path (a visitor's gust or flick): live conditions only */
    diverge() { valid = false; },
    noteGust(t, mph, { planned = false } = {}) {
      if (!on) return;
      gust = { t, mph };
      if (!planned) { valid = false; floor = Math.min(floor, RANK.off); }
      m.peaks = []; m.crossed = false; m.pushed = false; m.smaller = false; m.straight = false; m.gustShown = false; m.coast = false; m.origin = t;
    },
    noteFlick(t) {
      if (!on || !m) return;
      valid = false; floor = Math.min(floor, RANK.off);
      m.peaks = []; m.crossed = false; m.pushed = false; m.smaller = false; m.straight = false; m.gustShown = true; m.coast = false; m.origin = t;
    },
    /* one 5 ms sample of the live flight (after the step) */
    sample(fl) {
      if (!on || !m) return;
      const s = fl.state;
      lastState = s; lastFlight = fl;
      const a = Math.abs(s.alpha) * DEG;
      if (finite(s.apogee)) { trigger('apogee'); return; }
      // rail exit is the page's: the forward button leaving the rail (the rail exit event, its speed)
      if (!finite(m.railT)) {
        const e = fl.events.find((x) => x.name === 'railExit');
        if (!e) { if (fl.ignited && s.phase !== 'pad') trigger('rail'); m.prevA = a; m.prevT = s.t; m.prevSign = Math.sign(s.alpha); return; }
        m.railT = e.t;
        if (!finite(m.origin)) m.origin = m.railT;
        trigger('off', { ftps: (finite(s.railExitSpeed) ? s.railExitSpeed : e.state.v) / M_PER_FT });
      }
      const fins = fl.config.finScale > 0.005;
      const counted = s.airspeed > SETTLE_V_MIN;
      const big = a >= SETTLE_DEG && counted;
      if (big) { m.lastBig = s.t; m.under = NaN; } else if (!finite(m.under)) m.under = s.t;
      // the gust beat while the flight repeats its pre-flight: as |alpha| first reaches 2 deg after the
      // gust, so the words come while the nose tips (not once it has tipped), named with the pre-flight's
      // peak; off the plan it waits for the peak itself (below)
      if (valid && plan && gust && !m.gustShown && fins && s.margin >= 0 && a >= SETTLE_DEG && s.t > gust.t && finite(plan.beats.peakAlpha)) {
        m.gustShown = true; trigger('gust', { mph: gust.mph, deg: plan.beats.peakAlpha });
      }
      const sign = Math.sign(s.alpha);
      if (m.prevSign && sign && sign !== m.prevSign) m.crossed = true;
      const falling = finite(m.prevA) && a < m.prevA;
      // a local maximum of |alpha| (the sample before was the peak)
      if (m.rising && falling && m.prevA >= SETTLE_DEG) {
        m.peaks.push({ t: m.prevT, a: m.prevA, crossedBefore: m.crossed });
        const n = m.peaks.length;
        if (n === 1 && gust && !m.gustShown && s.margin >= 0 && fins) { m.gustShown = true; trigger('gust', { mph: gust.mph, deg: m.prevA }); }
        else if (n >= 2 && !m.smaller && m.peaks[n - 1].a < m.peaks[n - 2].a && m.crossed && s.margin > 0 && fins) { m.smaller = true; trigger('smaller'); }
        m.crossed = false;
      }
      if (!fins && big && !falling && !m.sideways && !m.over) { m.sideways = true; trigger('sideways'); }
      // the push: |alpha| falling for two samples running (so it never lands on the peak's own sample)
      if (!m.pushed && big && falling && m.fell && s.Maero * s.alpha < 0 && s.margin > 0 && fins) { m.pushed = true; trigger('push', { inches: (fl.derived.finXcp - s.xcg) / M_PER_IN }); }
      const d0 = fl.derived;
      if (!m.over && Math.abs(s.theta) > PITCH_OVER && finite(d0.staticMargin) && d0.staticMargin < 0) { m.over = true; trigger('over', { t: s.t }); }
      const disturbed = finite(m.lastBig);
      if (disturbed && !m.straight && !m.over && !big) {
        const settled = valid && plan && finite(plan.beats.settle) ? s.t > plan.beats.settle + 1e-9 : finite(m.under) && s.t - m.under >= 0.2 - 1e-9;
        if (settled) { m.straight = true; trigger('straight', { s: Math.max(0, m.lastBig - (gust ? gust.t : m.railT)), gust: !!gust }); }
      }
      // a rocket that turned over keeps its 'over' line: a tumbling one passes under 2 deg on every turn, and
      // 'Coasting up' would read as calm
      if (!m.coast && (s.phase === 'coast' || s.phase === 'descent') && (!disturbed || m.straight) && !m.over && !big) { m.coast = true; trigger('coast'); }
      m.rising = finite(m.prevA) && a > m.prevA;
      m.fell = falling;
      m.prevA = a; m.prevT = s.t; if (sign) m.prevSign = sign;
    },
    /* once a frame: wallMs of wall time since the last call, running = the replay plays, rate = the true
       playback rate (flight seconds per wall second; 0 or missing during a HOLD) */
    frame(wallMs, running, rate = 0) {
      if (!on) return;
      // the dwell runs at the narrated slow rate: a faster rate spends it faster (never slower)
      const k = finite(rate) && rate > RAMP.MAX ? rate / RAMP.MAX : 1;
      if (running) dwellLeft -= Math.max(0, wallMs || 0) * k;
      if (!queue.length) return;
      // while paused or stepping, the newest beat the step passed shows at once (its condition held when it
      // triggered, inside the step); while playing, the next one in order once the caption on screen has
      // dwelt, and only if its condition still holds
      if (!running) { const pick = queue[queue.length - 1]; queue = []; show(pick); return; }
      // the dwell only holds a caption that is still true: one whose condition stopped holding gives way now
      if (shown && dwellLeft > 0 && (!lastState || validNow(shown, lastState, lastFlight))) return;
      while (queue.length) {
        const q = queue.shift();
        if (!lastState || validNow(q, lastState, lastFlight)) { show(q); return; }
      }
    },
  };
}

/* ------------------------------------------------------------------ the runs and the path figures (item 9) */
/* The five runs and the default launch with its finless twin, as the page flies them: a run start sets
   the page's CG (the CAD estimate, 27.17 in EST), rail 72 in (EST) and launch angle 0 through the panel
   (main.js startRun), so a run card, its sketch and the lede figure describe exactly the flight its
   button flies. */
export const GUST_DEFAULT_MPH = 5 / MPS_PER_MPH;   // EST: the 5 m/s of the FIELD 3 test, 11.2 mph, fired at rail exit
/* The page's CG: the CAD airframe's part-wise estimate at the page mass (flight.js CG_ESTIMATE_CAD, 0.690 m,
   EST, validation F1 F02). The page's shape is the CAD's, and the case study's 22 in (PAGE) belongs to its
   37 in design, so the page flies the estimate until the owner gives a measured CG (flag vx-cg). */
export const PAGE_CG_IN = 22;                      // PAGE: the case study's figure, for its 37 in design
export const CG_DEFAULT_IN = CG_ESTIMATE_CAD.value / M_PER_IN;   // EST: 27.17 in, the page's default CG
export const RUN_CG_IN = CG_DEFAULT_IN;            // EST
export const RUN_RAIL_IN = 72;                     // EST, a 6 ft rail
export const RUNS = Object.freeze({
  full: Object.freeze({ fins: 1, wind: 5, gust: 0 }),
  half: Object.freeze({ fins: 0.5, wind: 5, gust: 0 }),
  none: Object.freeze({ fins: 0, wind: 5, gust: 0 }),
  wind: Object.freeze({ fins: 1, wind: 10, gust: 0 }),
  gust: Object.freeze({ fins: 1, wind: 0, gust: GUST_DEFAULT_MPH }),
});
/* the default launch (Run 05's conditions) and the same without fins: the title plate's two buttons */
export const LAUNCHES = Object.freeze({ fins: RUNS.gust, nofins: Object.freeze({ fins: 0, wind: 0, gust: GUST_DEFAULT_MPH }) });
/* the flight configuration a run start gives the live flight (createFlight fills the defaults) */
export function runFlightConfig(finDefaults, r, { seed } = {}) {
  const c = { fins: finDefaults, finScale: r.fins, wind: r.wind * MPS_PER_MPH, cgFromNose: RUN_CG_IN * M_PER_IN, railLength: RUN_RAIL_IN * M_PER_IN, launchAngle: 0 };
  if (finite(seed)) c.seed = Math.round(seed);
  const f = createFlight(c, { bus: null });
  const cfg = f.config; f.destroy();
  return cfg;
}
/* a run card's numbers as the card prints them (main.js fillRun and the bake script both use this) */
const sgn = (v, d) => { if (!finite(v)) return '—'; const s = Math.abs(v).toFixed(d); return Number(s) === 0 ? s : (v < 0 ? '−' : '+') + s; };
const uns = (v, d) => { if (!finite(v)) return '—'; const s = Math.abs(v).toFixed(d); return v < 0 && Number(s) !== 0 ? '−' + s : s; };
export function runCardValues(key, o) {
  return {
    margin0: sgn(o.margin0, 2), marginBo: sgn(o.marginBo, 2), alphaRail: sgn(o.alphaRail, 1),
    peakAlpha: uns(o.peakAlpha, key === 'gust' ? 2 : 1), theta60: finite(o.theta60) ? o.theta60.toFixed(2) : '—',
    theta1: sgn(o.theta1, 1), apogee: finite(o.apogee) ? o.apogee.toFixed(0) : '—', upwind: finite(o.upwind) ? o.upwind.toFixed(0) : '—',
    settle: uns(o.settle, 2), fn: uns(o.fn, 2), marginUp: uns(o.marginUp, 2), liftTurn: uns(o.liftTurnDeg, 1),
  };
}

/* The configuration table's computed numbers (index.html [data-k]), as main.js fillConfig prints
   them: the CAD measurements of the baked geometry, the flight model's derived values at the page
   defaults (the CAD CG estimate, 27.17 in EST, full fins), the margin at the case study's 22 in and
   over the estimate's spread, the rail exit speed with the case study's button stations, the
   half-fin and finless margins, the tier 3 section's cell
   size and, with { apogee: true }, the still-air apogee (a 12 s flight, a few ms in node). The bake
   script writes the same strings into the HTML, so a reader without JavaScript sees the model's
   numbers too. Values only; the live page state (latLive, geomCheck) is not here. */
export function configValues(geometry, { apogee = true } = {}) {
  const v = {};
  const IN = (m) => m / M_PER_IN;
  const refs = geometry.refs, fin = geometry.fin;
  v.lengthIn = IN(refs.length).toFixed(2);
  v.lengthMm = (refs.length * 1000).toFixed(1);
  v.diameterIn = IN(refs.diameter).toFixed(3);
  v.diameterMm = (refs.diameter * 1000).toFixed(1);
  v.noseIn = IN(refs.noseLength).toFixed(2);
  v.noseExposedIn = IN(refs.noseExposedLength).toFixed(2);
  v.finRootIn = IN(fin.root).toFixed(2);
  v.finTipIn = IN(fin.tip).toFixed(2);
  v.finSpanIn = IN(fin.span).toFixed(2);
  v.finSweepIn = IN(fin.sweep).toFixed(2);
  v.finThickIn = IN(fin.thickness).toFixed(3);
  v.finLeIn = IN(fin.rootLeadingEdgeFromNose).toFixed(2);
  const pv = createFlight({ fins: geometry.finDefaults, cgFromNose: CG_DEFAULT_IN * M_PER_IN }, { bus: null });
  const d = pv.derived;
  v.cgIn = IN(pv.config.cgFromNose).toFixed(2);
  v.cgLoIn = IN(CG_ESTIMATE_CAD.atPageMass[0]).toFixed(2);
  v.cgHiIn = IN(CG_ESTIMATE_CAD.atPageMass[1]).toFixed(2);
  v.massKg = d.massLiftoff.toFixed(3);
  v.cgBoIn = IN(d.xcgBurnout).toFixed(2);
  v.inertia = d.inertiaLiftoff.toFixed(3);
  v.impulse = d.totalImpulse.toFixed(1);
  v.burn = d.burnTime.toFixed(3);
  v.propG = (d.propellantMass * 1000).toFixed(1);
  v.tw = d.averageThrustToWeight.toFixed(2);
  v.noseCna = d.noseCna.toFixed(2);
  v.noseXcpIn = IN(d.noseXcp).toFixed(2);
  v.finCna = d.finCna.toFixed(2);
  v.kfb = d.finKfb.toFixed(3);
  v.finXcpIn = IN(d.finXcp).toFixed(2);
  v.cna = d.cna.toFixed(2);
  v.xcpIn = IN(d.xcp).toFixed(2);
  v.margin0 = d.staticMargin.toFixed(2);
  v.marginBo = d.staticMarginBurnout.toFixed(2);
  // the margin at the case study's 22 in (its figure's CG) and over the CAD estimate's spread (EST)
  v.marginPage0 = d.staticMarginAt(PAGE_CG_IN * M_PER_IN).toFixed(2);
  v.marginCadLo = d.staticMarginCadCgRange[0].toFixed(2);
  v.marginCadHi = d.staticMarginCadCgRange[1].toFixed(2);
  v.centroidIn = IN(d.planformCentroid).toFixed(2);
  v.cd = d.cd.toFixed(4);
  v.fn30 = (d.naturalFrequency(30) / (2 * Math.PI)).toFixed(2);
  v.zeta30 = d.dampingRatio(30).toFixed(3);
  v.railV = (d.railExitSpeedPrediction / M_PER_FT).toFixed(1);
  // the same with the case study's rail-button stations (2 in from the aft end, 13 in apart, PAGE)
  {
    const pp = createFlight({ fins: geometry.finDefaults, cgFromNose: CG_DEFAULT_IN * M_PER_IN, aftButtonFromAft: PAGE_RAIL_BUTTONS.aftButtonFromAft, buttonSpacing: PAGE_RAIL_BUTTONS.buttonSpacing }, { bus: null });
    v.railVPage = (pp.derived.railExitSpeedPrediction / M_PER_FT).toFixed(1);
    pp.destroy();
  }
  // the half-fin and finless margins quoted in the method
  pv.setFinScale(0.5);
  v.marginHalf0 = sgn(pv.derived.staticMargin, 2);
  v.marginHalfBo = sgn(pv.derived.staticMarginBurnout, 2);
  pv.setFinScale(0);
  v.marginNone0 = sgn(pv.derived.staticMargin, 2);
  pv.destroy();
  if (typeof geometry.buildSection === 'function') {
    const sec = geometry.buildSection({ cols: 1024, rows: 320 });
    v.cellMm = (sec.cellM * 1000).toFixed(3);
    v.dCells = sec.dCells.toFixed(1);
  }
  if (apogee) v.apogee = stillAirApogee(geometry);
  return v;
}
/* the still-air apogee at the page defaults, ft, as the configuration table prints it */
export function stillAirApogee(geometry) {
  const f = createFlight({ fins: geometry.finDefaults, cgFromNose: CG_DEFAULT_IN * M_PER_IN }, { bus: null });
  f.run(12);
  const s = finite(f.state.apogee) ? (f.state.apogee / M_PER_FT).toFixed(0) : '—';
  f.destroy();
  return s;
}

/* Path figures: downrange against altitude in ft, at equal scale (a foot across is a foot up), to
   apogee, SIM. One renderer for the lede figure (the default launch and its finless twin) and the run
   card sketches; the bake script (vx/tools/bake-figure.mjs) writes its output into vx/index.html so
   the figures read with JS off, and main.js renders the same markup from the page's own pre-flights
   and swaps it in when it differs (the markup carries a hash, data-sig). Finned paths are ink, a
   finless one livery orange and dashed (shape as well as color); every text is ink, never the
   series color. The text sizes are px of the drawing (field.css sets the faces). */
export const FIGURE = Object.freeze({
  lede: Object.freeze({ w: 340, h: 400, l: 48, r: 12, t: 22, b: 46, x0Ft: -200, yTopFt: 1200, gridFt: 200 }),
  card: Object.freeze({ w: 200, h: 156, l: 32, r: 6, t: 10, b: 26, x0Ft: -250, yTopFt: 1100, gridFt: 500 }),
});
const FINLESS = 0.005;                    // a fin scale under this is "no fins" (as the scene's trail.js)
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const n1 = (v) => (Math.round(v * 10) / 10).toFixed(1).replace(/\.0$/, '');
const fnv = (str) => { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, '0'); };
const minus = (v) => (v < 0 ? '−' + Math.abs(v) : String(v));
export function figureFinWords(k) { return k < FINLESS ? 'No fins' : Math.abs(k - 1) < FINLESS ? 'Full fins' : Math.abs(k - 0.5) < FINLESS ? 'Half fins' : `Fin scale ${k.toFixed(2)}`; }
/* series: [{ id, finScale, points: [{x, y}] (m: downrange, altitude), apogeeFt, xFt (downrange at apogee) }] */
export function pathFigure({ kind = 'lede', series = [], title = '', desc = '' } = {}) {
  const L = FIGURE[kind] || FIGURE.lede;
  const ph = L.h - L.t - L.b, pw = L.w - L.l - L.r;
  const s = ph / L.yTopFt;                                   // px per ft, both axes
  const x1Ft = L.x0Ft + pw / s;
  const X = (ft) => L.l + (ft - L.x0Ft) * s, Y = (ft) => L.t + ph - ft * s;
  const lede = kind === 'lede';
  const o = [];
  const id = `fdfig-${kind}-${series.map((q) => q.id).join('-')}`;
  o.push(`<svg class="fd-fig-svg fd-fig-${kind}" viewBox="0 0 ${L.w} ${L.h}" width="${L.w}" height="${L.h}" role="img" aria-labelledby="${id}-t ${id}-d" data-scale-px-per-ft="${s.toFixed(5)}">`);
  o.push(`<title id="${id}-t">${esc(title)}</title><desc id="${id}-d">${esc(desc)}</desc>`);
  // the grid: squares of gridFt, so the equal scale shows
  o.push('<g class="fd-fig-grid" aria-hidden="true">');
  for (let f = L.gridFt; f <= L.yTopFt + 1e-6; f += L.gridFt) o.push(`<line x1="${n1(L.l)}" y1="${n1(Y(f))}" x2="${n1(L.w - L.r)}" y2="${n1(Y(f))}"/>`);
  for (let f = Math.ceil(L.x0Ft / L.gridFt) * L.gridFt; f <= x1Ft + 1e-6; f += L.gridFt) if (f !== 0) o.push(`<line x1="${n1(X(f))}" y1="${n1(L.t)}" x2="${n1(X(f))}" y2="${n1(L.t + ph)}"/>`);
  o.push('</g>');
  // the axes' words: altitude and downrange in ft
  o.push('<g class="fd-fig-ax" aria-hidden="true">');
  for (let f = L.gridFt; f <= L.yTopFt + 1e-6; f += L.gridFt) o.push(`<text x="${n1(L.l - 6)}" y="${n1(Y(f) + 3.5)}" text-anchor="end">${f}</text>`);
  if (lede) {
    for (let f = Math.ceil(L.x0Ft / L.gridFt) * L.gridFt; f <= x1Ft + 1e-6; f += L.gridFt) o.push(`<text x="${n1(X(f))}" y="${n1(L.t + ph + 15)}" text-anchor="middle">${minus(f)}</text>`);
    o.push(`<text x="${n1(L.l)}" y="${n1(L.t - 9)}">Altitude, ft</text>`);
    o.push(`<text x="${n1(L.l)}" y="${n1(L.h - 6)}">Downrange, ft, equal scale</text>`);
  } else {
    o.push(`<text x="${n1(L.l)}" y="${n1(L.h - 7)}">ft, equal scale</text>`);
  }
  o.push('</g>');
  // the ground and the pad
  o.push(`<g class="fd-fig-ground" aria-hidden="true"><line x1="${n1(L.l)}" y1="${n1(L.t + ph)}" x2="${n1(L.w - L.r)}" y2="${n1(L.t + ph)}"/><line x1="${n1(X(0))}" y1="${n1(L.t + ph - 5)}" x2="${n1(X(0))}" y2="${n1(L.t + ph + 5)}"/></g>`);
  // the paths, finless last so its dashes read over a finned line it crosses
  const order = series.slice().sort((a, b) => (a.finScale < FINLESS) - (b.finScale < FINLESS));
  for (const q of order) {
    const off = q.finScale < FINLESS;
    const pts = q.points || [];
    let d = '';
    for (let i = 0; i < pts.length; i++) d += `${i ? 'L' : 'M'}${n1(X(pts[i].x / M_PER_FT))} ${n1(Y(pts[i].y / M_PER_FT))}`;
    const top = pts.length ? pts[pts.length - 1] : { x: 0, y: 0 };
    const px = X(top.x / M_PER_FT), py = Y(top.y / M_PER_FT);
    o.push(`<g class="fd-fig-s${off ? ' fd-fig-off' : ''}" data-series="${esc(q.id)}" data-fin-scale="${q.finScale}" data-apogee-ft="${finite(q.apogeeFt) ? q.apogeeFt.toFixed(1) : ''}" data-x-ft="${finite(q.xFt) ? q.xFt.toFixed(1) : ''}">`);
    o.push(`<path class="fd-fig-line" d="${d}"/>`);
    o.push(`<circle class="fd-fig-dot" cx="${n1(px)}" cy="${n1(py)}" r="${lede ? 4 : 3}"/>`);
    // the apogee label beside the point: the figure in display type with its unit and tag, the fin words
    // with a swatch of the line above it (lede); one mono line on a card
    const num = finite(q.apogeeFt) ? q.apogeeFt.toFixed(0) : '—';
    if (lede) {
      const nw = num.length * 23.5, wUnit = 18, wTag = 30, wAll = nw + 6 + wUnit + 6 + wTag;
      const right = px + 12 + wAll <= L.w - L.r;
      const x = right ? px + 12 : px - 12 - wAll;
      o.push(`<g class="fd-fig-lab" transform="translate(${n1(x)} ${n1(py)})">`);
      o.push(`<line class="fd-fig-sw" x1="0" y1="-23" x2="16" y2="-23"/><text class="fd-fig-name" x="22" y="-19">${esc(figureFinWords(q.finScale))}</text>`);
      o.push(`<text class="fd-fig-n" x="0" y="15">${num}</text><text class="fd-fig-u" x="${n1(nw + 6)}" y="15">ft</text>`);
      o.push(`<rect class="fd-fig-tag" x="${n1(nw + 6 + wUnit + 6)}" y="3.5" width="${wTag}" height="15" rx="2"/><text class="fd-fig-tagt" x="${n1(nw + 6 + wUnit + 6 + wTag / 2)}" y="14.5" text-anchor="middle">SIM</text>`);
      o.push('</g>');
    } else {
      const label = `${num} ft`;
      const wl = label.length * 7.3, wTag = 26, wAll = wl + 5 + wTag;
      const right = px + 8 + wAll <= L.w - L.r;
      const x = right ? px + 8 : px - 8 - wAll;
      const y = Math.max(L.t + 8, py);
      o.push(`<g class="fd-fig-lab" transform="translate(${n1(x)} ${n1(y)})"><text class="fd-fig-cn" x="0" y="4">${label}</text><rect class="fd-fig-tag" x="${n1(wl + 5)}" y="-6.5" width="${wTag}" height="14" rx="2"/><text class="fd-fig-tagt" x="${n1(wl + 5 + wTag / 2)}" y="3.6" text-anchor="middle">SIM</text></g>`);
    }
    o.push('</g>');
  }
  o.push('</svg>');
  const body = o.join('');
  return body.replace('<svg ', `<svg data-sig="${fnv(body)}" `);
}
/* one series from a plan (story.js planFlight) */
export function figureSeries(id, plan, finScale) {
  const r = plan.result;
  return { id, finScale, points: plan.path, apogeeFt: r.apogee, xFt: finite(r.upwind) ? -r.upwind : NaN };
}
const atFt = (v) => (finite(v) ? `${Math.abs(v).toFixed(0)} ft ${v < 0 ? 'upwind' : 'downrange'}` : 'an unknown distance');
/* the lede figure: the default launch and its finless twin under the same gust */
export function ledeFigure(planFins, planNone) {
  const a = figureSeries('fins', planFins, 1), b = figureSeries('nofins', planNone, 0);
  return pathFigure({
    kind: 'lede', series: [a, b],
    title: 'Flight paths to apogee, with fins and without',
    desc: `Full fins: up to ${a.apogeeFt.toFixed(0)} ft, ${atFt(a.xFt)} at apogee. No fins: it turns over and reaches ${b.apogeeFt.toFixed(0)} ft, ${atFt(b.xFt)}. Still air and the same 11.2 mph gust at rail exit (EST), both flown with this page's model (SIM). Downrange and altitude at equal scale.`,
  });
}
/* conditions in words, for a run card's sketch */
export function runConditions(r) {
  const parts = [];
  parts.push(r.wind > 0 ? `${r.wind} mph crosswind` : 'still air');
  if (r.gust > 0) parts.push(`${r.gust.toFixed(1)} mph gust at rail exit`);
  return parts.join(', ');
}
/* a run card's sketch: its own path on the axes every card shares */
export function runSketch(key, plan) {
  const r = RUNS[key];
  const q = figureSeries(key, plan, r.fins);
  return pathFigure({
    kind: 'card', series: [q],
    title: `Run path to apogee: ${figureFinWords(r.fins).toLowerCase()}, ${runConditions(r)}`,
    desc: `Up to ${finite(q.apogeeFt) ? q.apogeeFt.toFixed(0) : 'an unknown'} ft, ${atFt(q.xFt)} at apogee (SIM). Downrange and altitude at equal scale, the same axes on every run.`,
  });
}

/* ------------------------------------------------------------------ the director (item 12) */
export function createDirector(scene, { reduced = () => false } = {}) {
  let active = !!(scene && typeof scene.setCamera === 'function');
  const has = (k) => !!scene && typeof scene[k] === 'function';
  const off = has('onCameraMode') ? scene.onCameraMode((e) => { if (e && e.mode === 'free') active = false; }) : () => {};
  const call = (k, ...a) => { if (has(k)) { try { return scene[k](...a); } catch (err) { console.warn('[story] director', k, err); } } return undefined; };
  return {
    get active() { return active; },
    release() { active = false; },
    pad() {
      if (!active) return;
      call('setFraming', null, { animate: false });
      call('setCamera', reduced() ? 'side' : 'hero');
    },
    launch() { if (!active) return; call('setFraming', null, { animate: false }); call('setCamera', 'side'); },
    railExit(ms) { if (!active || reduced()) return; call('setFraming', { k: 0.8, aimM: 0.15 }, { ms: Math.max(600, ms || 6000), ease: 'linear' }); },
    burnout() { if (!active || reduced()) return; call('setFraming', { k: 1.6, aimM: 0, elDeg: 8 }, { ms: 2400 }); },
    /* the slice dissolve follows the replay whether or not the camera is still directed */
    playing(on) { call('setDissolve', !!on); },
    destroy() { off(); active = false; },
  };
}

/* ------------------------------------------------------------------ the DOM: end card, caption slot, plate, slate, beats */
export function createStory({ stage, onReplay, onToggleFins, onContinue, onBeat, onPlate } = {}) {
  const $ = (sel) => (stage ? stage.querySelector(sel) : null);
  const card = $('[data-end]');
  const cap = $('[data-story-cap]');
  const plate = $('[data-plate]');
  const slateEl = $('[data-slate]');
  const beatRow = $('[data-beats]');
  const beatPrev = $('[data-beat="prev"]');
  const beatNext = $('[data-beat="next"]');
  const reducedMq = matchMedia('(prefers-reduced-motion: reduce)');
  const el = card ? {
    apogee: card.querySelector('[data-end-apogee]'),
    second: card.querySelector('[data-end-second]'),
    secondLabel: card.querySelector('[data-end-second-label]'),
    secondPre: card.querySelector('[data-end-second-pre]'),
    cond: card.querySelector('[data-end-cond]'),
    replay: card.querySelector('[data-end-replay]'),
    fins: card.querySelector('[data-end-fins]'),
    cont: card.querySelector('[data-end-continue]'),
    status: card.querySelector('[data-end-status]'),
    plate: card.querySelector('[data-end-plate]'),
  } : {};
  let shown = false, finsTo = 0, statusTimer = 0, plateTimer = 0, slateTimer = 0, plateUp = !!plate && !plate.hasAttribute('data-gone');
  const write = (node, s) => { if (node && node.textContent !== s) node.textContent = s; };
  const fx = (v, d) => (finite(v) ? Math.abs(v).toFixed(d) : '—');

  const on = [];
  const bind = (node, fn) => { if (!node || typeof fn !== 'function') return; const h = (e) => { e.preventDefault(); fn(e); }; node.addEventListener('click', h); on.push(() => node.removeEventListener('click', h)); };
  bind(el.replay, () => onReplay && onReplay());
  bind(el.fins, () => onToggleFins && onToggleFins(finsTo));
  bind(el.cont, () => onContinue && onContinue());
  bind(beatPrev, () => onBeat && onBeat(-1));
  bind(beatNext, () => onBeat && onBeat(1));

  function showEnd(sum = {}) {
    if (!card) return;
    write(el.apogee, finite(sum.apogeeFt) ? sum.apogeeFt.toFixed(0) : '—');
    // an unstable rocket (negative margin at liftoff) that turned over never settles: the card gives the
    // time it passed 60° instead, the Run 03 card's figure. A stable one also passes 60° near apogee in a
    // strong crosswind as its path arcs over; that is not turning over, so it keeps the settle time.
    const over = finite(sum.theta60) && sum.margin0 < 0;
    // the narration's words for the run cards' figure (the last sample at 2 deg or more before apogee);
    // when the angle rose past 2 deg again late in the climb (a strong crosswind), that figure is not
    // when it went straight again (the narration's), so it is named for what it is (sum.lateSettle)
    const from = sum.gust ? 'the gust' : 'rail exit';
    write(el.secondLabel, over ? 'Pitch past 60°' : sum.lateSettle ? `Last over 2° after ${from}` : `Straight again after ${from} (under\u00a02°)`);
    write(el.secondPre, over ? 'T+' : '');
    write(el.second, over ? sum.theta60.toFixed(2) : fx(sum.settleS, 2));
    write(el.cond, sum.conditions || '');
    finsTo = sum.finScale > 0 ? 0 : 1;
    write(el.fins, finsTo === 0 ? 'Without fins' : 'With fins');
    hidePlate({ instant: true });
    card.hidden = false;
    if (stage) stage.dataset.endUp = '';     // field.css moves the phone badges clear of the card
    // the next frame, so the transition runs from the hidden state (field.css; none under reduced motion)
    requestAnimationFrame(() => { if (shown) card.dataset.in = ''; });
    shown = true;
    // one polite line, a moment after the panel's own apogee announcement (live regions at 1 Hz or slower)
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => write(el.status, `Paused at apogee, ${finite(sum.apogeeFt) ? `${sum.apogeeFt.toFixed(0)} feet, SIM, computed in this tab` : 'height unknown'}. Replay, ${finsTo === 0 ? 'without fins' : 'with fins'}, the case study and continue past apogee are on the stage.`), 1200);
  }
  /* the end plate's caption (item 10), the card's last line: what the paths on the stage are and
     their conditions, with its tag; '' or null hides it (no plate, as in the 2D view) */
  function plateLine(text, tag = 'SIM') {
    const node = el.plate;
    if (!node) return;
    const s = text ? String(text) : '';
    if (node.dataset.text === `${s}|${tag}`) return;
    node.dataset.text = `${s}|${tag}`;
    node.textContent = s;
    if (s && tag) { const t = document.createElement('span'); t.className = 'tag'; t.textContent = tag; node.append('\u00a0', t); }
    node.hidden = !s;
  }
  /* a control about to be hidden hands keyboard focus to the stage, so a key (L, R) that hides the
     control it was pressed on does not drop focus to the page body */
  function keepFocus(box) {
    const a = document.activeElement;
    if (box && a && a !== document.body && box.contains(a) && stage) { try { stage.focus({ preventScroll: true }); } catch { /* not focusable */ } }
  }
  function hideEnd() {
    if (!card) return;
    if (!card.hidden) keepFocus(card);
    clearTimeout(statusTimer);
    write(el.status, '');
    plateLine('');
    delete card.dataset.in;
    card.hidden = true;
    if (stage) delete stage.dataset.endUp;
    shown = false;
  }
  /* The caption slot is a polite live region from the page's first paint (index.html: aria-live,
     aria-atomic), rendered and visually hidden while empty (data-empty, field.css), so its first line
     of every flight is announced: a region made live in the same task its text arrives is not
     reliably read. Only the narrator writes it, so it speaks only while narrating. */
  function caption(text) {
    if (!cap) return;
    const s = text ? String(text) : '';
    write(cap, s);
    cap.toggleAttribute('data-empty', !s);
    if (cap.hidden) cap.hidden = false;
  }
  /* the title plate (item 3): static HTML, so it reads with JS off. It fades out over 480 ms on the
     site easing (instant under reduced motion); once gone, its h1 stays in the accessibility tree
     (visually hidden), the rest leaves it. */
  function showPlate() {
    if (!plate) return;
    clearTimeout(plateTimer);
    plate.removeAttribute('data-gone');
    const was = plateUp || (!!stage && stage.hasAttribute('data-plate-up'));   // a show inside the fade: the plates never came back
    plateUp = true;
    if (stage) stage.dataset.plateUp = '';
    requestAnimationFrame(() => { if (plateUp) plate.removeAttribute('data-out'); });
    if (!was && typeof onPlate === 'function') onPlate(true);
  }
  /* The plate's text is on screen for the 480 ms of its fade, so what it keeps clear (the 3D plates,
     through onPlate(false), and the flow lines, through #stage[data-plate-up]) comes back when it has
     gone, not when it starts to go; at once for an instant or reduced-motion hide. */
  function hidePlate({ instant = false } = {}) {
    if (!plate || !plateUp) return;
    keepFocus(plate);
    plateUp = false;
    clearTimeout(plateTimer);
    plate.setAttribute('data-out', '');
    const gone = () => {
      plate.setAttribute('data-gone', '');
      if (stage) delete stage.dataset.plateUp;
      if (typeof onPlate === 'function') onPlate(false);
    };
    if (instant || reducedMq.matches) gone();
    else plateTimer = setTimeout(() => { if (!plateUp) gone(); }, 500);
  }
  /* the slate (item 7): the conditions, loud for 1.2 s at a launch, then quiet under the time code */
  function slate(text, { loud = false, ms = 1200 } = {}) {
    if (!slateEl) return;
    clearTimeout(slateTimer);
    const s = text ? String(text) : '';
    write(slateEl, s);
    slateEl.hidden = !s;
    if (stage) { if (s) stage.dataset.slateUp = ''; else delete stage.dataset.slateUp; }
    if (s && loud) { slateEl.dataset.loud = ''; slateTimer = setTimeout(() => { delete slateEl.dataset.loud; }, ms); }
    else delete slateEl.dataset.loud;
  }
  function setBeats({ prev = false, next = false, show = true } = {}) {
    if (!beatRow) return;
    beatRow.hidden = !show;
    if (beatPrev) beatPrev.disabled = !prev;
    if (beatNext) beatNext.disabled = !next;
  }
  return {
    showEnd, hideEnd, plateLine, caption, showPlate, hidePlate, slate, setBeats,
    get endShown() { return shown; },
    get plateShown() { return plateUp; },
    get card() { return card; },
    get plate() { return plate; },
    destroy() {
      hideEnd(); on.forEach((f) => f()); on.length = 0; clearTimeout(plateTimer); clearTimeout(slateTimer);
      if (cap) { cap.textContent = ''; cap.setAttribute('data-empty', ''); }
    },
  };
}

export default createStory;
