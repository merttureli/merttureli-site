/* f1-flight.mjs: validation track F1, flight model internals. Node only, no dependencies.
   Run from the repo root:  node vx/js/validation/f1-flight.mjs [--json out.json]

   Reproduces the JS-side cases of reports/validation/F1.md (scratchpad): Barrowman components against the
   1966 NARAM-8 equations and the Centuri TIR-33 JAVELIN example, the damping ratio of the simulated motion against
   the one- and two-degree-of-freedom linear models, dt convergence, determinism, energy in a vacuum coast, the
   vertical no-drag flight and the rail exit speed against closed forms, and the apogee sensitivities.
   The independent scipy integration and the CAD part-wise mass properties live with the report (they need
   numpy/scipy).

   dt, cd = 0, airDensity = 0 and ISA density are not reachable through the public API, so this script writes
   test-only copies of flight.js into the OS temp folder with exact, counted text patches (DT constant, relaxed
   clamps, an ISA density function). The engine file is never modified; with the new keys unused each copy
   reproduces the engine bitwise (checked below).

   Sources: Barrowman and Barrowman 1966, The Theoretical Prediction of the Center of Pressure, NARAM-8 (eq. 12,
   29, 37 with the table on p. 18a, 39, 58, 76, 77, 80); Barrowman 1970, Centuri TIR-33, pp. 21-22; Niskanen 2013,
   OpenRocket technical documentation (eq. 3.34, 3.40, 3.53, 3.56); Van Milligan 2007, Apogee Peak of Flight 193
   and 195 to 197 (Mandell's C1, C2, natural frequency, damping ratio); ISO 2533 atmosphere. */
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
const VX = join(HERE, '..');                         // vx/js
const ENG = await import(pathToFileURL(join(VX, 'flight/flight.js')).href);
const B = await import(pathToFileURL(join(VX, 'flight/barrowman.js')).href);
const { MOTOR } = await import(pathToFileURL(join(VX, 'data/motor-g77r.js')).href);
const GEO = await import(pathToFileURL(join(VX, 'geom/geom.js')).href);
const quiet = { bus: null };
const DEG = Math.PI / 180, FT = 0.3048, IN = 0.0254, MPH = 0.44704, G = ENG.G0;
const rel = (a, b) => (a - b) / b;
const cases = [];
function check(id, name, ref, src, meas, err, tol, ok, unit = '') { cases.push({ id, name, ref, src, meas, err, tol, pass: !!ok, unit }); }

/* ---------------------------------------------------------------- variants */
const TMP = join(tmpdir(), `vx-f1-${process.pid}`);
mkdirSync(TMP, { recursive: true });
function rep(s, a, b) { const n = s.split(a).length - 1; if (n !== 1) throw new Error(`patch matched ${n} times: ${a.slice(0, 50)}`); return s.replace(a, b); }
async function variant(dt) {
  let s = readFileSync(join(VX, 'flight/flight.js'), 'utf8');
  const abs = (p) => pathToFileURL(join(VX, p)).href;
  s = rep(s, "from '../core/bus.js'", `from '${abs('core/bus.js')}'`);
  s = rep(s, "from './barrowman.js'", `from '${abs('flight/barrowman.js')}'`);
  s = rep(s, "from '../data/motor-g77r.js'", `from '${abs('data/motor-g77r.js')}'`);
  s = rep(s, 'export const DT = 0.001;', `export const DT = ${dt};`);
  s = rep(s, "num('cd', 0.05, 3, DEFAULTS.cd);", "num('cd', 0, 3, DEFAULTS.cd);");
  s = rep(s, "num('airDensity', 0.1, 2, DEFAULTS.airDensity);", "num('airDensity', 0, 2, DEFAULTS.airDensity);");
  s = rep(s, "num('gravity', 1, 30, DEFAULTS.gravity);", "num('gravity', 0, 30, DEFAULTS.gravity);");
  s = rep(s, 'const q = 0.5 * cfg.airDensity * V2;', 'const cfgA = finite(cfg.isaElevation) ? isaCfg(cfg, y[1] - y0) : cfg; const q = 0.5 * cfgA.airDensity * V2;');
  s = rep(s, 'const L = aeroLoads(model, cfg, alpha, V, xcg, mp.mdot, om, latticeActive() ? latticeCmF : null, loads);',
             'const L = aeroLoads(model, cfgA, alpha, V, xcg, mp.mdot, om, latticeActive() ? latticeCmF : null, loads);');
  s += '\nfunction isaCfg(cfg, alt) { const h = cfg.isaElevation + Math.max(0, alt); const T = 288.15 - 0.0065 * h; return { ...cfg, airDensity: 1.225 * Math.pow(T / 288.15, 4.25588) }; }\n';
  const f = join(TMP, `flight-dt${dt}.mjs`);
  writeFileSync(f, '/* test-only copy written by vx/js/validation/f1-flight.mjs */\n' + s);
  return import(pathToFileURL(f).href);
}
const V = {};
for (const dt of [0.002, 0.001, 0.0005, 0.00025]) V[dt] = await variant(dt);

/* ---------------------------------------------------------------- A Barrowman */
const d = ENG.createFlight({}, quiet).derived;
check('A01', 'nose C_Na', 2, 'B66 eq. 12', d.noseCna, d.noseCna - 2, 'exact', d.noseCna === 2, '/rad');
const ogiveXD = (F) => { const A = F * F, Bq = A + 0.25, C = A - 0.25, Dd = Bq * Bq, E = A * F, Gg = F / Bq; const H = Math.atan(Math.abs(Gg / Math.sqrt(1 - Gg * Gg))); return F + 4 * Dd * (C * H - F) + 4 * E / 3; };
const TABLE = [0.430, 0.914, 1.387, 1.857, 2.326, 2.794, 3.261, 3.729, 4.196, 4.663];
const tmax = Math.max(...TABLE.map((v, i) => Math.abs(ogiveXD(i + 1) - v)));
check('A03', 'tangent-ogive CP formula against the 1966 table, F = 1..10 (max |error| in D)', 0, 'B66 eq. 37, p. 18a', tmax, tmax, '0.0005 D', tmax <= 5e-4, 'D');
const xl232 = ogiveXD(0.232 / 0.068) / (0.232 / 0.068);
check('A04', 'exact ogive CP fraction at fineness 3.41 against the 0.466 rule', xl232, 'B66 eq. 37', 0.466, rel(0.466, xl232), '1 percent', Math.abs(rel(0.466, xl232)) < 0.01);
const geo = GEO.getBakedGeometry();
{
  const s = geo.profile.s, r = geo.profile.r, Lx = geo.refs.noseExposedLength, R = geo.refs.diameter / 2;
  let Vn = 0; for (let i = 1; i < s.length && s[i] <= Lx + 1e-6; i++) Vn += 0.5 * Math.PI * (r[i] ** 2 + r[i - 1] ** 2) * (s[i] - s[i - 1]);
  const Xcad = Lx - Vn / (Math.PI * R * R);
  check('A05', 'nose CP: engine (0.466 x 0.232 m, shoulder included) against L - V/A of the CAD exposed ogive (0.200 m)', Xcad, 'B66 eq. 29 on the geometry profile', d.noseXcp, rel(d.noseXcp, Xcad), '2 percent', Math.abs(rel(d.noseXcp, Xcad)) < 0.02, 'm');
}
{
  const f = ENG.CAD_FINS, dd = 0.068, rt = 0.034;
  const l = Math.hypot(f.span, f.sweep + f.tip / 2 - f.root / 2);
  const bare = 16 * (f.span / dd) ** 2 / (1 + Math.sqrt(1 + (2 * l / (f.root + f.tip)) ** 2));
  const K = 1 + rt / (f.span + rt);
  const xf = f.rootLeadingEdgeFromNose + f.sweep / 3 * (f.root + 2 * f.tip) / (f.root + f.tip) + (f.root + f.tip - f.root * f.tip / (f.root + f.tip)) / 6;
  const fn = B.finCna(f, dd, rt);
  check('A06', 'four-fin C_Na, no interference', bare, 'B66 eq. 58 by hand', fn.cnaNoInterference, rel(fn.cnaNoInterference, bare), '0.1 percent', Math.abs(rel(fn.cnaNoInterference, bare)) < 1e-3, '/rad');
  check('A07', 'interference factor K_T(B)', K, 'B66 eq. 77; OR eq. 3.56', fn.kfb, rel(fn.kfb, K), '0.1 percent', Math.abs(rel(fn.kfb, K)) < 1e-3);
  check('A08', 'four-fin C_Na with interference', K * bare, 'B66 eq. 58 x 77', d.finCna, rel(d.finCna, K * bare), '1 percent', Math.abs(rel(d.finCna, K * bare)) < 0.01, '/rad');
  check('A09', 'fin CP from the nose', xf, 'B66 eq. 76; OR eq. 3.34', d.finXcp, d.finXcp - xf, '1 mm', Math.abs(d.finXcp - xf) < 1e-3, 'm');
  const xcp = (2 * 0.466 * 0.232 + K * bare * xf) / (2 + K * bare);
  check('A10', 'vehicle CP', xcp, 'B66 eq. 80', d.xcp, d.xcp - xcp, '1 mm', Math.abs(d.xcp - xcp) < 1e-3, 'm');
  const Afin = 0.5 * (f.root + f.tip) * f.span, Aref = Math.PI * dd * dd / 4, M = 87.5 / 340.29, beta = Math.sqrt(1 - M * M);
  const orC = 2 * 2 * Math.PI * f.span ** 2 / Aref / (1 + Math.sqrt(1 + (beta * f.span ** 2 / (Afin * f.span / l)) ** 2));
  check('A11', 'fin C_Na at the peak Mach 0.257, compressible Diederich form (engine is incompressible)', orC, 'OR eq. 3.40, 3.53', fn.cnaNoInterference, rel(fn.cnaNoInterference, orC), '2 percent', Math.abs(rel(fn.cnaNoInterference, orC)) < 0.02, '/rad');
}
{
  const jav = { n: 4, root: 1.6, tip: 0.85, span: 1.65, sweep: 0.75, rootLeadingEdgeFromNose: 11.2 };
  const fn = B.finCna(jav, 0.75, 0.375), an = B.analyse({ length: 18, diameter: 0.75, noseLength: 3.6, noseShape: 'ogive' }, jav);
  const T = [['A13', 'JAVELIN fin C_Na, no interference', 28.6, fn.cnaNoInterference], ['A14', 'JAVELIN K_fb', 1.185, fn.kfb], ['A15', 'JAVELIN fin C_Na in the presence of the body', 33.9, fn.cna],
    ['A16', 'JAVELIN fin CP (in)', 11.86, B.finCp(jav)], ['A17', 'JAVELIN nose CP (in)', 1.68, B.noseCp('ogive', 3.6)], ['A18', 'JAVELIN total C_Na', 35.9, an.cna], ['A19', 'JAVELIN vehicle CP (in)', 11.3, an.xcp]];
  for (const [id, nm, r, m] of T) check(id, nm, r, 'TIR-33 pp. 21-22 (slide rule)', m, rel(m, r), '1 percent', Math.abs(rel(m, r)) < 0.01);
}

/* ---------------------------------------------------------------- B damping (controlled: no gravity, no drag) */
function peaks(tr) { const p = []; for (let i = 1; i < tr.length - 1; i++) if (tr[i][1] > tr[i - 1][1] && tr[i][1] >= tr[i + 1][1] && tr[i][1] > 0) p.push(tr[i]); return p; }
for (const k of [0.3, 0.6, 0.95]) {
  const f = V[0.001].createFlight({ gravity: 0, cd: 0, motor: { ...MOTOR, curve: MOTOR.curve.map(([t, F]) => [t, F * k]) } }, quiet);
  f.ignite(); f.run(f.derived.burnTime + 0.3);
  const s0 = f.state, Vs = s0.airspeed, t0 = s0.t, dv = f.derived;
  const C1 = dv.corrective(Vs, t0), C2 = dv.damping(Vs, t0), I = s0.inertia, Z = s0.qdyn * dv.refArea * dv.cna / (s0.mass * Vs);
  const a1 = C2 / I + Z, a0 = C1 / I + Z * C2 / I, z2 = a1 / (2 * Math.sqrt(a0)), zM = dv.dampingRatio(Vs, t0);
  f.flick(dv.naturalFrequency(Vs, t0) * DEG);
  const tr = []; for (let i = 0; i < 3000; i++) { f.run(0.001); tr.push([f.state.t, f.state.alpha]); }
  const p = peaks(tr).slice(0, 6);
  const Td = (p[p.length - 1][0] - p[0][0]) / (p.length - 1), sig = Math.log(p[0][1] / p[p.length - 1][1]) / (p[p.length - 1][0] - p[0][0]);
  const wd = 2 * Math.PI / Td, zfit = sig / Math.hypot(sig, wd);
  check(`B05-${Vs.toFixed(0)}`, `zeta of the simulated oscillation at ${Vs.toFixed(1)} m/s (log decrement) against the 2-DOF short-period model`, z2, 'short-period algebra with Z = (q A C_Na + T)/(m V); C1, C2 as POF 193/195', zfit, rel(zfit, z2), '2 percent', Math.abs(rel(zfit, z2)) < 0.02);
  if (k === 0.3) check('B06', 'engine dampingRatio (Mandell, 1-DOF) against the simulated decay', zfit, 'B05', zM, rel(zM, zfit), '10 percent', Math.abs(rel(zM, zfit)) < 0.10);
}

/* ---------------------------------------------------------------- C integrator */
function fly(mod, cfg, gust = 0) {
  const f = mod.createFlight(cfg, quiet);
  let vmax = 0, amax = 0, re = null, th3 = NaN;
  f.onEvent((e) => { if (e.name === 'railExit') { re = e.state.railExitSpeed; if (gust) f.gust(gust); } });
  f.ignite();
  const dt = mod.DT;
  while (!f.done) { f.run(dt); const s = f.state; vmax = Math.max(vmax, s.v); if (re !== null && s.phase !== 'descent' && s.qdyn >= 50) amax = Math.max(amax, Math.abs(s.alpha)); if (Number.isNaN(th3) && s.t >= 3 - 1e-9) th3 = s.theta; }
  return { apogee: f.state.apogee, vmax, re, amax, th3, f };
}
const runs = {};
for (const dt of [0.002, 0.001, 0.0005, 0.00025]) runs[dt] = { still: fly(V[dt], {}), wind: fly(V[dt], { wind: 10 * MPH }), gust: fly(V[dt], {}, 5) };
{
  const a = ENG.createFlight({ wind: 10 * MPH }, quiet); a.run(60);
  const same = JSON.stringify(a.history.toArray()) === JSON.stringify(runs[0.001].wind.f.history.toArray());
  check('C00', 'test-only copy at dt 1 ms reproduces the engine bitwise', 'identical', 'engine', same ? 'identical' : 'different', 0, 'bitwise', same);
}
const dtc = (id, nm, get, tol) => { const r = get(runs[0.00025]), m = get(runs[0.001]); check(id, `dt convergence: ${nm} (1 ms against 0.25 ms)`, r, 'engine at dt 0.25 ms', m, rel(m, r), `${tol * 100} percent`, Math.abs(rel(m, r)) < tol); };
dtc('C01', 'still-air apogee', (x) => x.still.apogee, 1e-3);
dtc('C02', 'rail exit speed', (x) => x.still.re, 5e-3);
dtc('C03', 'maximum speed', (x) => x.still.vmax, 1e-4);
dtc('C04', '10 mph crosswind, alpha at rail exit', (x) => x.wind.amax, 1e-2);
dtc('C05', '10 mph crosswind, pitch at T+3 s', (x) => x.wind.th3, 1e-2);
dtc('C06', 'gust at rail exit, peak alpha', (x) => x.gust.amax, 1e-2);
{
  const h = () => { const f = ENG.createFlight({ wind: 3, turbulence: 2, seed: 42 }, quiet); f.ignite(); while (!f.done) f.step(1 / 60); return createHash('sha256').update(JSON.stringify(f.history.toArray())).digest('hex'); };
  const a = h(), b = h();
  check('C07', 'determinism: two runs with turbulence (seed 42), SHA-256 of the history', a, 'same input', b, 0, 'bitwise', a === b);
}
{
  const f = V[0.001].createFlight({ airDensity: 0 }, quiet); f.ignite(); f.run(1.4);
  const e0 = 0.5 * f.state.v ** 2 + G * f.state.altitude; let mr = 0;
  while (!f.done) { f.run(0.001); mr = Math.max(mr, Math.abs(0.5 * f.state.v ** 2 + G * f.state.altitude - e0) / e0); }
  check('C08', 'specific energy drift in a vacuum coast', 0, 'energy conservation', mr, mr, '1e-9', mr < 1e-9);
}
/* closed forms: rocket equation with mass proportional to impulse, piecewise-linear thrust */
const mo = ENG.normaliseMotor(MOTOR);
const thrust = (t) => { const { ts, fs } = mo; if (t <= 0 || t >= ts[ts.length - 1]) return 0; let i = 0; while (ts[i + 1] <= t) i++; return fs[i] + (fs[i + 1] - fs[i]) * (t - ts[i]) / (ts[i + 1] - ts[i]); };
const impulse = (t) => { const { ts, fs, cum } = mo; if (t <= 0) return 0; if (t >= ts[ts.length - 1]) return mo.totalImpulse; let i = 0; while (ts[i + 1] <= t) i++; const F = thrust(t); return cum[i] + 0.5 * (fs[i] + F) * (t - ts[i]); };
const m0 = ENG.DEFAULTS.massLiftoff, mp0 = mo.propellantMass, c = mo.totalImpulse / mp0;
const mass = (t) => m0 - mp0 * impulse(t) / mo.totalImpulse;
const bisect = (fn, a, b) => { let fa = fn(a); for (let i = 0; i < 200; i++) { const m = 0.5 * (a + b), fm = fn(m); if ((fm > 0) === (fa > 0)) { a = m; fa = fm; } else b = m; } return 0.5 * (a + b); };
const tlo = bisect((t) => thrust(t) - mass(t) * G, 1e-6, 0.05);
const vcf = (t) => c * Math.log(mass(tlo) / mass(t)) - G * (t - tlo);
function simpson(fn, a, b, eps = 1e-12, depth = 40) {
  const m = 0.5 * (a + b), fa = fn(a), fb = fn(b), fm = fn(m);
  const rec = (a, b, fa, fm, fb, whole, eps, dep) => { const m = 0.5 * (a + b), l = 0.5 * (a + m), r = 0.5 * (m + b), fl = fn(l), fr = fn(r); const left = (m - a) / 6 * (fa + 4 * fl + fm), right = (b - m) / 6 * (fm + 4 * fr + fb); if (dep <= 0 || Math.abs(left + right - whole) <= 15 * eps) return left + right + (left + right - whole) / 15; return rec(a, m, fa, fl, fm, left, eps / 2, dep - 1) + rec(m, b, fm, fr, fb, right, eps / 2, dep - 1); };
  return rec(a, b, fa, fm, fb, (b - a) / 6 * (fa + 4 * fm + fb), eps, depth);
}
const hcf = (t) => { const pts = [tlo, ...Array.from(mo.ts).filter((x) => x > tlo && x < t), t]; let h = 0; for (let i = 1; i < pts.length; i++) h += simpson(vcf, pts[i - 1], pts[i]); return h; };
{
  const tbo = mo.burnEnd, vbo = vcf(tbo), apo = hcf(tbo) + vbo * vbo / (2 * G);
  const r = fly(V[0.001], { cd: 0 });
  check('D01', 'vertical no-drag apogee against the closed form', apo, 'rocket equation + ballistic coast', r.apogee, rel(r.apogee, apo), '0.1 percent', Math.abs(rel(r.apogee, apo)) < 1e-3, 'm');
  const goal = 1.83 - 2 * IN - 13 * IN;
  const tre = bisect((t) => hcf(t) - goal, tlo + 1e-4, 0.6);
  check('C11', 'rail exit speed, no drag, against the closed form (variable mass)', vcf(tre), 'closed form from the thrust curve', r.re, rel(r.re, vcf(tre)), '0.5 percent', Math.abs(rel(r.re, vcf(tre))) < 5e-3, 'm/s');
}

/* ---------------------------------------------------------------- E sensitivities */
{
  const base = fly(V[0.001], {}).apogee;
  const k = (s) => ({ ...MOTOR, curve: MOTOR.curve.map(([t, F]) => [t, F * s]) });
  const S = [['E01', 'ISA, sea-level site', { isaElevation: 0 }], ['E02', 'ISA, 1,000 ft site', { isaElevation: 1000 * FT }], ['E05', 'impulse +3 percent', { motor: k(1.03) }], ['E06', 'impulse -3 percent', { motor: k(0.97) }],
    ['E07', 'mass +5 percent', { massLiftoff: m0 * 1.05 }], ['E08', 'mass -5 percent', { massLiftoff: m0 * 0.95 }], ['E09', 'cd +10 percent', { cd: ENG.CD_FIT * 1.1 }], ['E10', 'cd -10 percent', { cd: ENG.CD_FIT * 0.9 }]];
  for (const [id, nm, cfg] of S) { const r = fly(V[0.001], cfg); check(id, `sensitivity: ${nm} (apogee ft; rail exit ${(r.re / FT).toFixed(2)} ft/s)`, base / FT, 'default flight', r.apogee / FT, rel(r.apogee, base), 'informational', true, 'ft'); }
}

/* ---------------------------------------------------------------- report */
const pad = (s, n) => String(s).padEnd(n).slice(0, n);
const num = (v) => (typeof v === 'number' ? (Math.abs(v) >= 1e4 || (Math.abs(v) < 1e-3 && v !== 0) ? v.toExponential(3) : v.toPrecision(6)) : String(v).slice(0, 12));
console.log(`${pad('case', 8)} ${pad('name', 70)} ${pad('reference', 13)} ${pad('measured', 13)} ${pad('error', 11)} ${pad('tolerance', 13)} result`);
for (const r of cases) console.log(`${pad(r.id, 8)} ${pad(r.name, 70)} ${pad(num(r.ref), 13)} ${pad(num(r.meas), 13)} ${pad(num(r.err), 11)} ${pad(r.tol, 13)} ${r.pass ? 'PASS' : 'FAIL'}`);
const failed = cases.filter((r) => !r.pass);
console.log(`\n${cases.length - failed.length}/${cases.length} pass. Failing cases are the model or input defects listed in reports/validation/F1.md: ${failed.map((r) => r.id).join(', ') || 'none'}`);
const jx = process.argv.indexOf('--json');
if (jx > 0 && process.argv[jx + 1]) writeFileSync(process.argv[jx + 1], JSON.stringify(cases, null, 1));
try { rmSync(TMP, { recursive: true, force: true }); } catch { /* temp copies are disposable */ }
if (failed.length) process.exitCode = 1;
