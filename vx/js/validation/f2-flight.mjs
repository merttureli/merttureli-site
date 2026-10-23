/* f2-flight.mjs: validation track F2, the flight.js side of the RocketPy cross-check. Node only, no dependencies.
   Run from the repo root:  node vx/js/validation/f2-flight.mjs --out <file.json>

   Writes one JSON file with
   - inputs: every quantity the RocketPy model needs, read from the engine itself (dry mass and dry CG,
     propellant station, nozzle station, pitch inertia at liftoff and burnout, Barrowman slopes and stations,
     the thrust curve as the engine interpolates it, cd, rail rule);
   - runs: per-step (1 ms) histories of the engine for the F2 cases: still air, 10 mph crosswind, the page's
     default 5 m/s gust fired at rail exit, and pitch-rate flicks at T+0.8 s and T+2.0 s in still air;
   - derived: the engine's linearised natural frequency and damping ratio at the airspeeds the cases pass.

   The RocketPy side (Python 3.13, RocketPy 1.13.0 in a venv) lives with the F2 report, as F1's scipy code
   does: validation/F2/py/ in the session scratchpad (rp_model.py builds CHARGER from this file's inputs block,
   rp_runs.py flies the cases, bridge.py attributes the differences, analyze.py writes the cases).

   The engine is used through its public API only (createFlight, run/step, gust, flick, onEvent); nothing is
   patched. Sign conventions are the engine's (FIELD.md section 2): x downrange (the wind blows toward +x),
   y up, theta from +y toward +x, alpha = theta - angle of the relative wind. */
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const VX = join(HERE, '..');
const ENG = await import(pathToFileURL(join(VX, 'flight/flight.js')).href);
const { finDefaults } = await import(pathToFileURL(join(VX, 'geom/geom.js')).href);
const quiet = { bus: null };
const MPH = 0.44704;

const args = process.argv.slice(2);
const out = args.includes('--out') ? args[args.indexOf('--out') + 1] : 'f2-flight.json';

function inputs() {
  const f = ENG.createFlight({ fins: finDefaults }, quiet);
  const m = f.model, d = f.derived, mo = m.motor;
  return {
    engine: 'vx/js/flight/flight.js', dt: ENG.DT, cdFit: ENG.CD_FIT,
    config: { ...f.config, fins: { ...f.config.fins }, motor: null },
    finDefaults: { ...finDefaults },
    mass: { massLiftoff: f.config.massLiftoff, mp0: m.mp0, mDry: m.mDry, xDry: m.xDry, xProp: m.xProp,
      xMotorAft: m.xMotorAft, motorLength: m.motorLength, length: f.config.length,
      inertiaDryOwn: m.mDry * f.config.length ** 2 / 12,
      inertiaLiftoff: d.inertiaLiftoff, inertiaBurnout: d.inertiaBurnout, xcgLiftoff: d.xcgLiftoff, xcgBurnout: d.xcgBurnout },
    motor: { name: mo.name, totalImpulse: mo.totalImpulse, burnEnd: mo.burnEnd, propellantMass: mo.propellantMass,
      curve: mo.curve.map(([t, F]) => [t, F]) },
    aero: { refArea: d.refArea, refLength: d.refLength, cna: d.cna, xcp: d.xcp, noseCna: d.noseCna, noseXcp: d.noseXcp,
      finCna: d.finCna, finXcp: d.finXcp, finKfb: d.finKfb, planformArea: d.planformArea, planformCentroid: d.planformCentroid,
      staticMargin: d.staticMargin, staticMarginBurnout: d.staticMarginBurnout, cmqLiftoff: d.cmqLiftoff },
    rail: { railLength: f.config.railLength, aftButtonFromAft: f.config.aftButtonFromAft, buttonSpacing: f.config.buttonSpacing,
      railExitTravel: f.config.railLength - f.config.aftButtonFromAft - f.config.buttonSpacing,
      railClearTravel: f.config.railLength - f.config.aftButtonFromAft,
      railExitSpeedPrediction: d.railExitSpeedPrediction, railExitTimePrediction: d.railExitTimePrediction },
  };
}

/* One flight, every 1 ms step recorded. opts: {wind, gustAtRailExit, flickAt, flickRate} */
function fly(name, cfg, opts = {}) {
  const f = ENG.createFlight({ fins: finDefaults, ...cfg }, quiet);
  let gustFired = NaN;
  f.onEvent((e) => {
    if (e.name === 'railExit' && opts.gustAtRailExit) { f.gust(opts.gustAtRailExit); gustFired = f.state.t; }
  });
  f.ignite();
  const keys = ['t', 'x', 'y', 'vx', 'vy', 'theta', 'omega', 'alpha', 'airspeed', 'thrust', 'mass', 'inertia', 'xcg', 'wind', 'M', 'N', 'drag', 'qdyn', 'railTravel'];
  const rec = Object.fromEntries(keys.map((k) => [k, []]));
  const onRail = [];
  let flicked = NaN, steps = 0;
  const t0 = process.hrtime.bigint();
  const push = () => { const s = f.state; for (const k of keys) rec[k].push(+s[k].toPrecision(10)); onRail.push(s.onRail ? 1 : 0); };
  push();
  while (!f.done && steps < 40000) {
    if (opts.flickAt !== undefined && !(flicked >= 0) && f.state.t >= opts.flickAt - 1e-9) { if (f.flick(opts.flickRate)) { flicked = f.state.t; rec.omega[rec.omega.length - 1] = f.state.omega; } }
    f.step(ENG.DT); steps++;
    push();
  }
  const wall = Number(process.hrtime.bigint() - t0) / 1e9;
  const ev = {};
  for (const e of f.events) ev[e.name] = { t: e.t, altitude: e.state.altitude, v: e.state.v, alpha: e.state.alpha };
  return { name, cfg, opts, gustFired, flicked, steps, wallSeconds: wall, stepsPerSecond: steps / wall,
    railExitSpeed: f.state.railExitSpeed, apogee: f.state.apogee, maxAlpha: f.state.maxAlpha, events: ev, rec, onRail };
}

const inp = inputs();
const runs = {
  still: fly('still', {}),
  wind10: fly('wind10', { wind: 10 * MPH }),
  gust5: fly('gust5', {}, { gustAtRailExit: 5 }),
  flick08: fly('flick08', {}, { flickAt: 0.8, flickRate: 0.5 }),
  flick20: fly('flick20', {}, { flickAt: 2.0, flickRate: 0.5 }),
};
const f = ENG.createFlight({ fins: finDefaults }, quiet);
const derived = [];
for (const V of [14, 20, 30, 40, 50, 60, 70, 80, 87.5]) {
  derived.push({ V, wnLiftoff: f.derived.naturalFrequency(V), zetaLiftoff: f.derived.dampingRatio(V),
    wnBurnout: f.derived.naturalFrequency(V, 2), zetaBurnout: f.derived.dampingRatio(V, 2) });
}
writeFileSync(out, JSON.stringify({ generated: new Date().toISOString(), inputs: inp, runs, derived }));
for (const [k, r] of Object.entries(runs)) {
  console.log(`${k.padEnd(8)} steps ${r.steps} apogee ${r.apogee.toFixed(3)} m railExit ${r.railExitSpeed.toFixed(4)} m/s  ${Math.round(r.stepsPerSecond)} steps/s`);
}
console.log('wrote', out);
