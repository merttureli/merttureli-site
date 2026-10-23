/* lab-script.js: a scripted stand-in for the flight and lattice modules, used by
   the panel lab (vx/lab/panel.html) while those modules are built in parallel.
   It is NOT the flight model and its numbers are not results: it exists so the
   panel can be driven through a plausible launch with the same duck-typed shape
   FIELD 3 and 4 specify.

   createScriptFlight({ emit }) -> flight-shaped object
     state {t, x, y, v, theta, alpha, q, qdyn, phase, N, M, thrust}, derived,
     events, history, config, step(dt), run(s), reset(), ignite(), gust(peak),
     flick(rate), setWind, setFinScale, setCg, setRail, setLaunchAngle,
     setLatticeMoment, useLattice, done, phase, calls (a log of setter calls)
   The script:
     thrust   a G77R-like trapezoid, 95 N peak at 0.04 s, 75 N at 1.10 s, out at
              1.25 s (burn time PAGE; the shape is EST for the script), propellant
              62.5 g (EST) burnt in proportion to impulse
     mass     0.998 kg at liftoff (PAGE 2.2 lb)
     drag     Cd 0.62 on the CAD reference area (EST, tuned so apogee lands near 8 s)
     rail     a scripted exit at 0.35 s (the lab brief), constrained before it
     pitch    theta'' = -K alpha - c theta', K = omega0^2 (margin/margin0)(cna/cna0)
              with omega0 set so the alpha wobble measures about 1.2 Hz (the lab brief) and
              zeta 0.12; K fades with (V/20 m/s)^2 below 20 m/s; a negative margin
              makes K negative and the rocket diverges
     CP       Barrowman stand-in (nose C_Na 2 at 0.466 Ln; four trapezoidal fins
              with interference 1 + R/(s + R); STD, Barrowman 1967) on the CAD
              planform from format.js
     gust     one-minus-cosine pulse, 0.5 s, toward +x; the script fires 5 m/s at
              0.60 s unless autoGust is false
   Sign convention FIELD 2: theta from +y toward +x, alpha = theta - angle of
   (-v_air) from +y, v_air = wind - v_rocket; positive alpha, negative moment.

   createScriptLattice(flight) -> lattice-shaped object with force, stats, fallback,
   setView, and tick() to refresh the force from the flight's alpha. */
import { OUTLINE_DEFAULTS } from './format.js';

const G = 9.80665;               // m/s2, STD
const RHO = 1.225;               // kg/m3, STD sea-level ISA
const DT = 0.001;                // s, fixed sub-step
const HIST_DT = 0.01;            // s, history sampling (FIELD 3)
const M0 = 0.998;                // kg, PAGE 2.2 lb
const MPROP = 0.0625;            // kg, EST for the script
const CD = 0.62;                 // EST, script drag coefficient
const BURN = 1.25;               // s, PAGE
const RAIL_EXIT_T = 0.35;        // s, scripted (lab brief)
const WOBBLE_HZ = 1.13;          // Hz, stiffness parameter: with the thrust and path coupling the alpha wobble measures about 1.2 Hz (lab brief)
const ZETA = 0.12;               // scripted damping ratio
const V_FADE = 20;               // m/s, aerodynamic stiffness fades below this
const GUST_S = 0.5;              // s, gust duration (FIELD 3)
const AUTO_GUST_T = 0.6, AUTO_GUST_MPS = 5;   // scripted gust after rail exit

function thrustAt(t) {           // N, trapezoid (EST shape)
  if (t < 0 || t > BURN) return 0;
  if (t < 0.04) return 95 * (t / 0.04);
  if (t < 1.10) return 95 - 20 * ((t - 0.04) / 1.06);
  return 75 * (1 - (t - 1.10) / 0.15);
}
const TOTAL_IMPULSE = (() => { let s = 0; for (let t = 0; t < BURN; t += DT) s += thrustAt(t) * DT; return s; })();

/* Barrowman stand-in: total C_Na and CP from the nose (m) for fin scale k */
export function barrowmanStandIn(config, k) {
  const R = config.diameter / 2, d = config.diameter;
  const f = config.fins;
  const cnaN = 2, xN = 0.466 * config.noseLength;
  if (!(k > 0)) return { cna: cnaN, xcp: xN };
  const s = f.span * k, cr = f.root * k, ct = f.tip * k, xt = f.sweep * k;
  const lf = Math.hypot(s, xt + ct / 2 - cr / 2);
  const cnaF = (1 + R / (s + R)) * (4 * f.n * (s / d) ** 2) / (1 + Math.sqrt(1 + (2 * lf / (cr + ct)) ** 2));
  const xF = f.rootLeadingEdgeFromNose + (xt / 3) * (cr + 2 * ct) / (cr + ct) + (1 / 6) * ((cr + ct) - (cr * ct) / (cr + ct));
  const cna = cnaN + cnaF;
  return { cna, xcp: (cnaN * xN + cnaF * xF) / cna };
}

export function createScriptFlight({ emit = () => {}, autoGust = true } = {}) {
  const config = {
    length: OUTLINE_DEFAULTS.length, diameter: OUTLINE_DEFAULTS.diameter, noseLength: OUTLINE_DEFAULTS.noseLength,
    fins: { ...OUTLINE_DEFAULTS.fins }, finScale: 1, cgFromNose: 0.5588, railLength: 1.8288, launchAngle: 0, wind: 0, massLiftoff: M0,
  };
  const A = Math.PI * config.diameter ** 2 / 4;
  const xMotor = config.length - 0.0254 - 0.06;    // m from the nose, propellant centre (EST: 0.0254 m ahead of the cap, FIELD 3, plus half a 120 mm grain)
  const ref = barrowmanStandIn(config, 1);
  const margin0 = (ref.xcp - config.cgFromNose) / config.diameter;
  const omega0 = (2 * Math.PI * WOBBLE_HZ) / Math.sqrt(1 - ZETA * ZETA);
  let bw = ref;
  let st, events, history, gusts, acc, nextHist, prev, latticeOn = false, latticeCm = 0;
  const calls = [];
  const log = (s) => { calls.push(s); if (calls.length > 12) calls.shift(); };

  function blank() {
    return { t: 0, x: 0, y: 0, v: 0, vx: 0, vy: 0, theta: config.launchAngle, omega: 0, alpha: 0, q: 0, qdyn: 0, phase: 'pad', N: 0, M: 0, thrust: 0, mass: M0 };
  }
  function reset() {
    st = blank(); events = []; history = []; gusts = autoGust ? [{ t0: AUTO_GUST_T, peak: AUTO_GUST_MPS }] : []; acc = 0; nextHist = 0;
    prev = { qdyn: 0, absA: 0, rising: false };
    history.push(sample());
    emit('flight:reset', {});
  }
  function sample() { return { t: st.t, x: st.x, y: st.y, v: st.v, theta: st.theta, alpha: st.alpha, q: st.omega, qdyn: st.qdyn, phase: st.phase, N: st.N, M: st.M }; }
  function event(name) {
    if (events.some((e) => e.name === name)) return;
    const e = { name, t: +st.t.toFixed(4), state: sample() };
    events.push(e); emit('flight:event', e);
  }
  const xcgAt = (t) => {
    const burnt = MPROP * Math.min(1, burntImpulse(t) / TOTAL_IMPULSE);
    return (M0 * config.cgFromNose - burnt * xMotor) / (M0 - burnt);
  };
  const impulseCache = new Map();
  function burntImpulse(t) {
    const key = Math.round(Math.min(t, BURN) * 1000);
    if (impulseCache.has(key)) return impulseCache.get(key);
    let s = 0; for (let u = 0; u < key / 1000; u += DT) s += thrustAt(u) * DT;
    impulseCache.set(key, s); return s;
  }
  const windAt = (t) => {
    let w = config.wind;
    for (const g of gusts) { const u = t - g.t0; if (u >= 0 && u <= GUST_S) w += (g.peak / 2) * (1 - Math.cos((2 * Math.PI * u) / GUST_S)); }
    return w;
  };

  function sub() {
    const t = st.t;
    const T = thrustAt(t);
    const burnt = MPROP * Math.min(1, burntImpulse(t) / TOTAL_IMPULSE);
    const m = M0 - burnt;
    const w = windAt(t);
    const rvx = st.vx - w, rvy = st.vy;                     // -v_air = v_rocket - wind
    const vrel = Math.hypot(rvx, rvy);
    const qdyn = 0.5 * RHO * vrel * vrel;
    const flightAng = vrel > 1 ? Math.atan2(rvx, rvy) : st.theta;   // angle of (-v_air) from +y
    let alpha = st.theta - flightAng;
    alpha = Math.atan2(Math.sin(alpha), Math.cos(alpha));
    const bx = Math.sin(st.theta), by = Math.cos(st.theta);
    const drag = CD * qdyn * A;
    const ux = vrel > 1e-6 ? rvx / vrel : 0, uy = vrel > 1e-6 ? rvy / vrel : 0;
    let ax = (T * bx - drag * ux) / m, ay = (T * by - drag * uy) / m - G;
    const onRail = st.phase === 'rail' || st.phase === 'pad';
    if (st.phase === 'pad') { ax = 0; ay = 0; }
    if (st.phase === 'rail') {                                    // constrained to the rail direction, axial forces only
      const along = Math.max(0, ax * bx + ay * by);
      ax = along * bx; ay = along * by;
    }
    // pitch: scripted second-order response on the relative wind
    const xcg = xcgAt(t);
    const margin = (bw.xcp - xcg) / config.diameter;
    const fade = Math.min(1, (vrel / V_FADE) ** 2);
    let K = omega0 * omega0 * (margin / margin0) * (bw.cna / ref.cna) * fade;
    if (latticeOn) K = omega0 * omega0 * fade * (-latticeCm / Math.max(1e-6, ref.cna * margin0)) * 1;   // lab toggle: the lattice moment flies it
    const c = 2 * ZETA * Math.sqrt(Math.abs(K)) + 0.2;            // + 0.2 1/s floor so a near-zero K still settles
    let dom = 0;
    if (!onRail) dom = -K * Math.sin(alpha) - c * st.omega;
    const N = bw.cna * Math.sin(alpha) * qdyn * A;               // N, toward the body +x side for alpha > 0
    const Mz = -N * (bw.xcp - xcg);                               // N m, + toward +theta
    // integrate (semi-implicit Euler at 1 ms)
    st.vx += ax * DT; st.vy += ay * DT;
    if (st.phase === 'rail') { const along = st.vx * bx + st.vy * by; st.vx = along * bx; st.vy = along * by; }
    st.x += st.vx * DT; st.y += st.vy * DT;
    st.omega += dom * DT; st.theta += st.omega * DT;
    st.t += DT;
    Object.assign(st, { v: Math.hypot(st.vx, st.vy), alpha: vrel > 1 ? alpha : 0, q: st.omega, qdyn, N: vrel > 1 ? N : 0, M: vrel > 1 ? Mz : 0, thrust: T, mass: m });
    // phases and events
    if (st.phase === 'rail' && T > m * G) event('liftoff');
    if (st.phase === 'rail' && st.t >= RAIL_EXIT_T) { st.phase = 'boost'; event('railExit'); }
    if (st.phase === 'boost' && st.t >= BURN) { st.phase = 'coast'; event('burnout'); }
    if (!events.some((e) => e.name === 'maxQ') && st.t > 0.05 && qdyn < prev.qdyn) event('maxQ');
    if (events.some((e) => e.name === 'railExit') && !events.some((e) => e.name === 'maxAlpha')) {
      const a = Math.abs(st.alpha);
      if (prev.rising && a < prev.absA && prev.absA > 0.002) event('maxAlpha');
      prev.rising = a > prev.absA; prev.absA = a;
    }
    prev.qdyn = qdyn;
    if ((st.phase === 'coast' || st.phase === 'boost') && st.t > BURN && st.vy <= 0) { st.phase = 'descent'; event('apogee'); }
    if (st.t >= nextHist - 1e-9) { history.push(sample()); nextHist += HIST_DT; if (history.length > 2400) history.shift(); }
  }

  const apogeeT = () => { const e = events.find((x) => x.name === 'apogee'); return e ? e.t : Infinity; };
  const done = () => st.t >= apogeeT() + 2;
  function step(dt) {
    if (st.phase === 'pad' || !(dt > 0)) return;
    acc += Math.min(dt, 0.25);
    while (acc >= DT && !done()) { sub(); acc -= DT; }
    if (done()) acc = 0;
  }
  function run(seconds) { const end = st.t + seconds; while (st.t < end - 1e-9 && !done() && st.phase !== 'pad') sub(); }
  function ignite() { if (st.phase !== 'pad') return; st.phase = 'rail'; nextHist = HIST_DT; event('ignition'); }
  function refreshBw() { bw = barrowmanStandIn(config, config.finScale); emit('flight:config', { config }); }

  reset();
  const derived = {
    get xcp() { return bw.xcp; },
    xcg: (t) => xcgAt(Number.isFinite(t) ? t : st.t),
    get staticMargin() { return (bw.xcp - xcgAt(st.t)) / config.diameter; },
    get cna() { return bw.cna; },
    naturalFrequency(V) { const xcg = xcgAt(st.t); const m = (bw.xcp - xcg) / config.diameter; const K = omega0 * omega0 * (m / margin0) * (bw.cna / ref.cna) * Math.min(1, ((V || 0) / V_FADE) ** 2); return K > 0 ? Math.sqrt(K) : 0; },
    dampingRatio() { return ZETA; },
  };
  return {
    get state() { return st; }, get events() { return events; }, get history() { return history; },
    config, derived, calls, step, run, reset, ignite,
    get phase() { return st.phase; }, get done() { return done(); },
    gust(peak) { log(`flight.gust(${(+peak).toFixed(3)})`); gusts.push({ t0: st.t, peak: +peak || 0 }); },
    flick(rate) { log(`flight.flick(${(+rate).toFixed(3)})`); if (st.phase !== 'pad' && st.phase !== 'rail') st.omega += +rate || 0; },
    setWind(mps) { log(`flight.setWind(${(+mps).toFixed(3)})`); config.wind = +mps || 0; emit('flight:config', { config }); },
    setFinScale(k) { log(`flight.setFinScale(${(+k).toFixed(2)})`); config.finScale = Math.max(0, +k || 0); refreshBw(); },
    setCg(m) { log(`flight.setCg(${(+m).toFixed(4)})`); config.cgFromNose = +m; emit('flight:config', { config }); },
    setRail(m) { log(`flight.setRail(${(+m).toFixed(4)})`); config.railLength = +m; emit('flight:config', { config }); },
    setLaunchAngle(rad) { log(`flight.setLaunchAngle(${(+rad).toFixed(4)})`); config.launchAngle = +rad || 0; if (st.phase === 'pad') st.theta = config.launchAngle; emit('flight:config', { config }); },
    setLatticeMoment(cm) { latticeCm = +cm || 0; },
    useLattice(on) { log(`flight.useLattice(${!!on})`); latticeOn = !!on; },
    get autoGust() { return autoGust; },
  };
}

/* lattice stand-in: force from the flight's alpha with a small scripted offset from
   Barrowman, as if measured; stats as a tier-3 lattice would report them. */
export function createScriptLattice(flight, { cols = 1024, rows = 320 } = {}) {
  const cellM = flight.config.length / (0.66 * cols);   // FIELD 5: the rocket spans 66 % of the width
  const section = { cellM, xNoseCol: 0.12 * cols, cols, rows, dCells: flight.config.diameter / cellM };
  const lat = {
    fallback: null, view: 'smoke', section,
    force: { fx: 0, fy: 0, mz: 0, cn: 0, cm: 0, xcpCells: NaN, age_ms: 0 },
    stats: { grid: `${cols}x${rows}`, stepsPerSecond: 0, msPerFrame: 0, precision: 'f32', re: 3000, tier: 3 },
    stamp: performance.now(),
    setView(v) { lat.view = v; },
    tick(tier = 3) {
      const st = flight.state, d = flight.derived;
      const a = st.alpha || 0;
      const cn = d.cna * 0.94 * Math.sin(a);                    // scripted: 6 % below Barrowman
      const xcpM = d.xcp + 0.012;                               // scripted: 12 mm aft of Barrowman
      const xcg = typeof d.xcg === 'function' ? d.xcg(st.t) : d.xcg;
      const cm = -cn * (xcpM - xcg) / flight.config.diameter;
      lat.force = { fx: 0, fy: cn, mz: cm, cn, cm, xcpCells: Math.abs(a) > 0.002 ? section.xNoseCol + xcpM / cellM : NaN, age_ms: 0 };
      lat.stamp = performance.now();
      const steps = [0, 8, 16, 24][tier] || 0;
      lat.stats = { ...lat.stats, stepsPerSecond: steps * 60, msPerFrame: steps ? 4.1 : 0, tier };
    },
    age() { lat.force.age_ms = performance.now() - lat.stamp; },
  };
  return lat;
}
