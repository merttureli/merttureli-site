/* CHARGER flight model: 3-DOF planar rigid body (x, y, pitch) with Barrowman stability.
   Pure JS, no DOM. Deterministic and seedable. Contract: FIELD.md sections 2 and 3.

   FRAME AND SIGNS (FIELD.md section 2, binding)
     World x downrange (wind blows toward +x), y up. theta is the body axis angle from +y,
     positive toward +x (clockwise in a y-up picture). Body axis a = (sin theta, cos theta),
     body normal n = (cos theta, -sin theta), which is the body's +x side.
     v_air = wind - v_rocket. alpha = theta - angle of (-v_air) from +y, wrapped to +-pi.
     The pitching moment M is in the theta sense (positive M raises theta). With the CP aft
     of the CG a positive alpha gives a normal force along +n at the CP and a negative M.

   EQUATIONS OF MOTION (rigid body, flat earth, no rotation of the earth)
     m(t) dv/dt = T a + D v_air/|v_air| + N n - m g y_hat
     I(t) d(omega)/dt = M_aero + M_damp
     T thrust along the axis (motor curve), D = q A_ref C_D drag along the relative wind,
     N = q A_ref C_N normal force along n, q = rho |v_air|^2 / 2.
     C_N = (C_Na,nose + C_Na,fins) sin(alpha) + 1.1 (A_plan/A_ref) sin^2(alpha) sgn(alpha)
       (Barrowman 1967 slopes; the sin form and the body-lift term as OpenRocket, STD).
     M_aero = -sum_i q A_ref C_N,i (x_i - x_cg)   over nose, fins, body-lift centroid, or
              C_m,lattice q A_ref d when the lattice flies it (10 Hz low-pass).
     M_damp = -[ (1/2) rho |v_air| A_ref d^2 C_mq + mdot ((x_nozzle - x_cg)^2 - (x_prop - x_cg)^2) ] omega
       C_mq = sum over nose and fins of C_Na,i (x_i - x_cg)^2 / d^2   (Mandell, STD)
       the second term is jet damping with the variable-mass dI/dt term (STD: Mandell for
       the nozzle flux, Thomson 1961 for dI/dt; barrowman.js jetDamping), mdot from the
       thrust curve. Without the dI/dt term it would be about 5 times larger through the burn
       (validation F1 B04, F2 G06).
       While the lattice flies it, the aerodynamic C_mq term is left out: the lattice
       moment already carries the pitch-rate damping of its moving walls (Ladd), so only
       the jet damping is added to it.
     The lattice moment is used only once a finite C_m has been supplied: until the first
     setLatticeMoment, and after setLatticeMoment(NaN or null), the Barrowman moment flies
     the rocket even with useLattice(true) (state.latticeActive says which one is in use).
     Linearised pitch dynamics used for the derived frequency and damping. With
       C1 = q A_ref C_Na (x_cp - x_cg) [N m/rad], C2 = the bracket in M_damp [N m s] and
       Z = (q A_ref C_Na + T) / (m V) [1/s], the rate at which the normal force and the
       thrust turn the flight path toward the body axis (alpha' = q - Z alpha):
       - two degrees of freedom (alpha, q), the short period (Etkin, Dynamics of Flight;
         validation F1 section B):  s^2 + (C2/I + Z) s + C1/I + Z C2/I = 0,
         omega_n = sqrt(C1/I + Z C2/I), zeta = (C2/I + Z) / (2 omega_n).
         derived.naturalFrequency and derived.dampingRatio return these: the simulated
         oscillation decays at this rate (F1 B05: 0.142 fitted against 0.142 predicted).
       - one degree of freedom (Mandell): I theta'' + C2 theta' + C1 theta = 0,
         omega_n = sqrt(C1/I), zeta = C2 / (2 sqrt(C1 I)); derived.naturalFrequencyMandell
         and derived.dampingRatioMandell. It leaves out the flight-path turning and reads
         zeta about 28 percent low in the coast (F1 B06, F2 E09).

   MASS PROPERTIES (EST unless tagged)
     Liftoff mass 0.998 kg (PAGE 2.2 lb) and CG 0.5588 m from the nose (PAGE 22 in) include
     the loaded motor. Propellant mass from the motor module burns in proportion to the
     delivered impulse (mdot = m_p0 T(t) / I_total). The propellant is a point mass at the
     motor's mid-length; the motor's aft end sits 0.0254 m ahead of the screw cap (EST). The
     dry CG follows from the liftoff CG. Inertia: the dry mass as a uniform slender rod of
     the full length about its own CG (m L^2 / 12) plus the parallel-axis terms of the dry
     mass and the propellant point mass about the moving vehicle CG.
     The PAGE CG of 22 in is the case study's design review figure for the 37 in airframe. A part-wise estimate of the
     46.5 in CAD airframe at the page mass puts it at 0.688 to 0.692 m (validation F1 F02;
     0.669 to 0.700 m over the density scenarios), a margin near 2.2 cal against 4.1 cal.
     The default stays PAGE (FIELD 1) until the owner gives the measured CG; CG_ESTIMATE_CAD
     and derived.staticMarginCadCg carry the estimate so a page can print the range.
     The slender rod reads the pitch inertia 17 to 26 percent above a part-wise CAD estimate
     at the same mass and CG (F1 F01), so the pitch frequency may be 7 to 11 percent low.
     Position (x, y) is the world position of a fixed body station, refFromNose (the liftoff
     CG station). The CG moves forward by a few centimetres during the burn; its kinematic
     coupling into translation is neglected (EST, under 0.04 m).

   RAIL
     The rail starts at the world origin and points along the launch angle. On the pad the
     aft end of the airframe rests on the rail base (the scene draws it there too), so the
     aft rail button starts aftButtonFromAft = 0.1156 m up the rail and the forward button
     buttonSpacing = 0.4407 m ahead of that (CAD: assembly parts 10 and 11, 0.6246 m and
     1.0653 m from the nose of the 46.5 in airframe). The page's stations (2 in from the aft
     end, 13 in apart) belong to the 37 in design and stay available as PAGE_RAIL_BUTTONS;
     they give 46.4 ft/s at rail exit against 43.3 ft/s (validation F1 C13, at the crossing).
     With travel measured along the rail:
       railExit,  forward button leaves the top:  travel = railLength - aftButtonFromAft - buttonSpacing
       railClear, aft button leaves the top:      travel = railLength - aftButtonFromAft
     Until railClear the rocket is constrained to the rail direction; only axial forces act
     and the rail carries the rest. Rail friction is neglected. Both crossings are found
     inside the step that passes them (cubic Hermite in travel over the step): railExit time
     and speed are interpolated there, and the step that passes railClear is split at the
     crossing, rail-constrained before it and free after it, so neither depends on where
     the 1 ms grid falls (validation F1 C02, C12; F2 B01). predictRailExit integrates the
     same axial equation with the same interpolation. The rail in use is captured when the
     rocket is placed on the pad; setRail and setLaunchAngle after ignition take effect at
     the next reset.

   INTEGRATION
     Classic RK4 at a fixed 0.001 s (the step that passes railClear is taken as two RK4
     sub-steps that meet at the crossing). step(dtPhysical) accumulates and sub-steps, so the
     trajectory is identical for any frame pattern. Gusts are smooth functions of time;
     turbulence (off by default) is a seeded first-order Gauss-Markov process held over
     each step. history samples every 10 steps (0.01 s) into a preallocated ring buffer.

   EVENTS (inserted in order of t)
     ignition (t = 0), liftoff (thrust exceeds weight), railExit (time interpolated to the
     crossing; the event state is the end of that step, with railExitSpeed interpolated),
     maxQ, burnout, maxAlpha, apogee. maxQ carries the time and state of the largest q. It
     is emitted only when that peak is certain: after rail exit, with the rocket decelerating (burnout, or thrust
     below drag plus the weight component along the axis), and with q low-passed at 10 Hz
     below 0.9 of its own running peak. Turbulence (fresh noise every step) and gusts near
     the pad therefore cannot fire it early. maxAlpha is the first local maximum of |alpha|
     after rail exit; rail exit itself counts when |alpha| falls from there, as it does in a
     crosswind while the airspeed grows. The detector runs on alpha low-passed at 5 Hz with
     a hysteresis of max(0.5 deg, 15 percent of the peak), so per-step turbulence cannot end
     the swing; the event carries the largest unfiltered |alpha| inside that first swing.
     It can be smaller than state.maxAlpha, the largest |alpha| over the whole ascent. Both
     count only samples with q >= ALPHA_Q_MIN. Setters on a destroyed instance do nothing.

   PUBLIC API (createFlight(config, { bus }) -> flight)
     flight.state     read-only view rewritten every step: t, x, y (world m, reference station),
                      vx, vy, v, theta (wrapped +-pi), thetaUnwrapped, omega (= q, rad/s), alpha,
                      airspeed, qdyn (Pa), thrust, drag, N (N), M, Maero, Mdamp (N m, theta
                      sense), cn, cm, xcg, xcp, xcpNow (m from nose), margin (cal), wind (m/s incl.
                      gusts), altitude, downrange, railTravel, onRail, railLength, railAngle,
                      refFromNose, maxAlpha, maxQ, apogee, railExitSpeed, phase, done, fault,
                      lattice (the toggle), latticeActive (a lattice C_m is in use), latticeCm
     flight.config / derived / events / history / phase / done / ignited
     step(dtPhysical), run(seconds) (ignites if needed), reset(), ignite(),
     gust(peak_mps), flick(pitchRate_radps), setWind, setFinScale, setFins, setCg, setRail,
     setLaunchAngle, setTurbulence, setSeed, setLatticeMoment(Cm), useLattice(bool),
     configure(patch), momentAt(alpha, V, t), bodyToWorld(station), onEvent(fn), destroy()
     Bus: flight:event {name, t, state}, flight:reset {t}, flight:config {config}. */

import { bus as sharedBus } from '../core/bus.js';
import * as B from './barrowman.js';
// Thrust curve: AeroTech G77R single-use, RASP samples from thrustcurve.org (see that file).
import { MOTOR as DEFAULT_MOTOR } from '../data/motor-g77r.js';

/* ---------------------------------------------------------------- constants */
export const DT = 0.001;                 // s, fixed RK4 step (FIELD 3)
export const HISTORY_EVERY = 10;         // steps per history sample, 0.01 s (FIELD 3)
export const HISTORY_CAPACITY = 4096;    // samples, 40.96 s of flight
export const STOP_AFTER_APOGEE = 2;      // s, recovery is out of scope (FIELD 3)
export const MAX_STEP_CALL = 0.25;       // s of physical time accepted per step() call
export const G0 = 9.80665;               // m/s^2, standard gravity (STD, ISO 80000-3)
export const RHO_SL = 1.225;             // kg/m^3, ISA sea-level density (STD, ISO 2533)
export const IN = 0.0254;                // m per inch (STD, exact)
export const FT = 0.3048;                // m per foot (STD, exact)
export const LB = 0.45359237;            // kg per pound (STD, exact)
export const LATTICE_LP_HZ = 10;         // Hz, low-pass on the lattice moment (FIELD 3)
export const CN_LIMIT = 60;              // guard on |C_N|; physical maximum here is about 30
export const APOGEE_FT_PAGE = 1033;      // ft, simulated apogee published on the site (PAGE)
/** Pa. maxAlpha (state and event) only counts samples at or above this dynamic pressure
    (airspeed about 9 m/s): near apogee alpha is set by a vanishing airspeed and says nothing
    about stability (EST threshold). The lab shades the same region of the chart. */
export const ALPHA_Q_MIN = 50;
/** Event detectors (EST choices, see EVENTS in the header). */
export const MAXQ_LP_HZ = 10;            // Hz, low-pass on q for the maxQ release test
export const MAXQ_DROP = 0.9;            // maxQ is released once filtered q is below this fraction of its peak
export const ALPHA_LP_HZ = 5;            // Hz, low-pass on alpha for the maxAlpha detector
export const ALPHA_HYST_DEG = 0.5;       // deg, absolute hysteresis of the maxAlpha detector
export const ALPHA_HYST_REL = 0.15;      // fraction of the peak, relative hysteresis of the maxAlpha detector
/** Rail-button stations of the CAD airframe, m from the nose tip: the centres of the axial
    bounds of assembly parts 10 (forward) and 11 (aft), as vx/js/geom measures them
    (geometry.features.railButtons). CAD. */
export const CAD_RAIL_BUTTONS = Object.freeze({ forwardFromNose: 0.6246295, aftFromNose: 1.0653225, source: 'CAD' });
/** The page's stations, from the case study's 37 in airframe: aft button 2 in from the aft end,
    13 in apart (22 in from the nose). PAGE. Not the default: the CAD is the final airframe. */
export const PAGE_RAIL_BUTTONS = Object.freeze({ aftButtonFromAft: 2 * IN, buttonSpacing: 13 * IN, source: 'PAGE' });
/** m, nose tip to screw cap (CAD). */
const LENGTH_CAD = 1.1809;
/** m, aft rail button ahead of the aft end: 0.1156 (CAD, 4.55 in). */
export const AFT_BUTTON_FROM_AFT = LENGTH_CAD - CAD_RAIL_BUTTONS.aftFromNose;
/** m, forward to aft rail button: 0.4407 (CAD, 17.35 in). */
export const BUTTON_SPACING = CAD_RAIL_BUTTONS.aftFromNose - CAD_RAIL_BUTTONS.forwardFromNose;

/** CG of the CAD airframe at the PAGE liftoff mass, m from the nose (EST, validation F1 case
    F02: part-wise CAD volumes from assembly.bin with OpenRocket 15.03 material densities and
    the motor as given, nine density scenarios, every non-motor part scaled to 0.998 kg).
    atPageMass is the spread at 0.998 kg; lo and hi the spread of the unscaled scenarios.
    The page's 22 in is 59.5 percent of its 37 in length; this is 58.4 percent of 46.5 in.
    Not the default (FIELD 1 keeps the PAGE CG until the owner gives the measured CG). */
export const CG_ESTIMATE_CAD = Object.freeze({ value: 0.690, atPageMass: Object.freeze([0.688, 0.692]), lo: 0.669, hi: 0.700, source: 'EST' });

/** Drag coefficient on A_ref = pi d^2/4 (A_ref 3.632e-3 m^2), FIT 2026-10-22 by bisection
    so that the no-wind, zero-launch-angle apogee equals 1,033 ft (PAGE), with the G77R RASP
    curve in vx/js/data/motor-g77r.js, 0.998 kg liftoff and constant sea-level density.
    Bisection result 0.633874 (to 1e-6), apogee 1,032.99 ft. One constant for the whole
    flight and every fin scale (EST: no Mach, Reynolds, base-drag or fin-area dependence).
    flight.test.mjs repeats the fit and fails if the motor data or the model drift by more
    than 1 percent of apogee. */
export const CD_FIT = 0.6339;

/** Fin planform measured from the CAD (assembly.bin part 6, four unique vertices in the
    x-y plane: (34, -500.69) (34, -570.69) (89, -585.69) (89, -555.69) mm, nose tip at
    y = +570.693 mm). Root 70 mm, tip 30 mm, span 55 mm, leading-edge sweep 55 mm,
    thickness 3.175 mm (z extent), root leading edge 1.071385 m from the nose. CAD. */
export const CAD_FINS = Object.freeze({
  n: 4, root: 0.070, tip: 0.030, span: 0.055, sweep: 0.055, thickness: 0.003175,
  rootLeadingEdgeFromNose: 1.071385, source: 'CAD',
});

/** Defaults, SI. Tags: PAGE, CAD, EST, FIT, STD. */
export const DEFAULTS = Object.freeze({
  length: LENGTH_CAD,          // m, 1.1809, nose tip to screw cap (CAD)
  diameter: 0.068,             // m, body tube (CAD, radius 34 mm)
  noseLength: 0.200,           // m, exposed tangent ogive (CAD: geometry.refs.noseExposedLength; the
                               // CAD profile is within 0.25 mm of an ogive of L 0.200 m, R 0.034 m.
                               // The nose part, part 0, is 0.232 m: its last 32 mm sit at the body radius.)
  noseShape: 'ogive',          // tangent ogive (CAD)
  tailCapLength: 0.0395,       // m, screw cap protrusion behind the body tube (CAD, part 19)
  tailCapRadius: 0.0215,       // m (CAD, part 19)
  fins: CAD_FINS,              // planform before finScale (CAD; geometry module may pass its own)
  finScale: 1,                 // 1 = as built, 0 = removed
  massLiftoff: 2.2 * LB,       // kg, 0.998 (PAGE 2.2 lb)
  cgFromNose: 22 * IN,         // m, 0.5588 (PAGE 22 in)
  motor: null,                 // null = the default motor module
  motorAftFromTail: 0.0254,    // m, motor aft end ahead of the screw cap (EST)
  motorLength: 0.124,          // m, used when the motor module gives none (CAD part 5)
  cd: CD_FIT,                  // FIT, see CD_FIT
  airDensity: RHO_SL,          // kg/m^3 (STD), constant with altitude
  gravity: G0,                 // m/s^2 (STD)
  railLength: 1.83,            // m (EST default 6 ft), 0.9 .. 2.4
  buttonSpacing: BUTTON_SPACING,         // m, 0.4407 (CAD; PAGE_RAIL_BUTTONS has the 37 in design's 0.3302)
  aftButtonFromAft: AFT_BUTTON_FROM_AFT, // m, 0.1156 (CAD; PAGE 0.0508)
  launchAngle: 0,              // rad, +-10 deg, positive tilts the rail toward +x
  wind: 0,                     // m/s toward +x, uniform profile
  windProfile: 'uniform',
  gustDuration: 0.5,           // s, one-minus-cosine pulse (FIELD 3)
  turbulence: 0,               // m/s RMS, off by default (EST model)
  turbulenceTime: 0.5,         // s, correlation time of the Gauss-Markov turbulence (EST)
  seed: 1,
});

export const LIMITS = Object.freeze({
  finScale: [0, 1.5], cgFromNose: [0.30, 1.05], railLength: [0.9, 2.4],
  launchAngle: [-10 * Math.PI / 180, 10 * Math.PI / 180], wind: [-9, 9], turbulence: [0, 5],
  gust: [-15, 15], flick: [-10, 10], latticeCm: [-50, 50],
});

export const PHASES = Object.freeze(['pad', 'rail', 'boost', 'coast', 'descent']);
export const EVENT_NAMES = Object.freeze(['ignition', 'liftoff', 'railExit', 'maxQ', 'burnout', 'maxAlpha', 'apogee']);

/* ---------------------------------------------------------------- helpers */
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const DEG = Math.PI / 180;
const LP_Q = 1 - Math.exp(-2 * Math.PI * MAXQ_LP_HZ * DT);       // first-order low-pass gains per DT step
const LP_ALPHA = 1 - Math.exp(-2 * Math.PI * ALPHA_LP_HZ * DT);
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
function wrapPi(a) { a = (a + Math.PI) % (2 * Math.PI); if (a < 0) a += 2 * Math.PI; return a - Math.PI; }

/** Fraction u in [0, 1] of a step of length h at which the travel reaches goal, from the
    travel and speed at both ends (cubic Hermite, Newton from the linear guess, bisection as
    the fallback). The interpolant matches position and speed at both ends, so u is exact to
    O(h^4) in travel; for the 1 ms step that is far below a microsecond. */
export function crossing(p0, v0, p1, v1, goal, h) {
  if (!(p1 > p0) || goal <= p0) return 0;
  if (goal >= p1) return 1;
  const m0 = v0 * h, m1 = v1 * h;
  const P = (u) => { const u2 = u * u, u3 = u2 * u; return (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * p1 + (u3 - u2) * m1; };
  const dP = (u) => { const u2 = u * u; return (6 * u2 - 6 * u) * p0 + (3 * u2 - 4 * u + 1) * m0 + (-6 * u2 + 6 * u) * p1 + (3 * u2 - 2 * u) * m1; };
  let lo = 0, hi = 1, u = (goal - p0) / (p1 - p0);
  for (let i = 0; i < 40; i++) {
    const f = P(u) - goal;
    if (Math.abs(f) < 1e-15 * Math.max(1, Math.abs(goal))) break;
    if (f > 0) hi = u; else lo = u;
    const d = dP(u);
    let un = d > 0 ? u - f / d : NaN;
    if (!(un > lo && un < hi)) un = 0.5 * (lo + hi);
    if (Math.abs(un - u) < 1e-15) { u = un; break; }
    u = un;
  }
  return clamp(u, 0, 1);
}

/** mulberry32 PRNG (public domain, T. Ettinger): 32-bit state, period 2^32. */
function mulberry32(seed) {
  let s = seed >>> 0;
  return function next() {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Normalise a motor module (either naming) into {curve, propellantMass, totalMass, length,
    burnTime, totalImpulse, name, source} with cumulative impulse at each curve point. */
export function normaliseMotor(m) {
  const src = m || DEFAULT_MOTOR;
  const raw = (src.curve || []).map(([t, f]) => [Number(t), Math.max(0, Number(f))]).filter(([t, f]) => finite(t) && finite(f));
  raw.sort((p, q) => p[0] - q[0]);
  if (!raw.length || raw[0][0] > 0) raw.unshift([0, 0]);
  if (raw[raw.length - 1][1] !== 0) raw.push([raw[raw.length - 1][0] + 1e-3, 0]);
  const ts = Float64Array.from(raw, (p) => p[0]);
  const fs = Float64Array.from(raw, (p) => p[1]);
  const cum = new Float64Array(raw.length);
  for (let i = 1; i < raw.length; i++) cum[i] = cum[i - 1] + 0.5 * (fs[i] + fs[i - 1]) * (ts[i] - ts[i - 1]);
  const total = cum[cum.length - 1];
  let burnEnd = ts[ts.length - 1];
  for (let i = ts.length - 1; i > 0; i--) { if (fs[i - 1] > 0) { burnEnd = ts[i]; break; } }
  return {
    name: src.name || [src.manufacturer, src.designation].filter(Boolean).join(' ') || 'motor',
    source: typeof src.source === 'string' ? src.source : (src.source && src.source.url ? 'RASP curve (thrustcurve.org via OpenRocket)' : 'config'),
    ts, fs, cum, totalImpulse: total, burnEnd,
    propellantMass: Number(src.propellantMass_kg ?? src.propellantMass ?? 0.06),
    totalMass: Number(src.totalMass_kg ?? src.totalMass ?? 0.125),
    length: Number(src.length_m ?? (src.length_mm != null ? src.length_mm / 1000 : src.length) ?? NaN),
    burnTime: Number(src.burnTime_s ?? src.burnTime ?? burnEnd),
    curve: raw,
  };
}

function thrustAt(mo, t) {
  const ts = mo.ts, fs = mo.fs, n = ts.length;
  if (!(t >= ts[0]) || t >= ts[n - 1]) return 0;
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (ts[mid] <= t) lo = mid; else hi = mid; }
  const u = (t - ts[lo]) / (ts[hi] - ts[lo]);
  return fs[lo] + (fs[hi] - fs[lo]) * u;
}
/** Delivered impulse up to t, N s (exact integral of the piecewise-linear curve). */
function impulseAt(mo, t) {
  const ts = mo.ts, fs = mo.fs, n = ts.length;
  if (!(t > ts[0])) return 0;
  if (t >= ts[n - 1]) return mo.totalImpulse;
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (ts[mid] <= t) lo = mid; else hi = mid; }
  const dt = t - ts[lo];
  const f = fs[lo] + (fs[hi] - fs[lo]) * dt / (ts[hi] - ts[lo]);
  return mo.cum[lo] + 0.5 * (fs[lo] + f) * dt;
}

/* ---------------------------------------------------------------- model build */
/** Everything that depends on the configuration only. */
function buildModel(cfg) {
  const motor = normaliseMotor(cfg.motor);
  const fins = B.scaleFins(cfg.fins, cfg.finScale);
  const body = { length: cfg.length, diameter: cfg.diameter, noseLength: cfg.noseLength, noseShape: cfg.noseShape, tailCapLength: cfg.tailCapLength, tailCapRadius: cfg.tailCapRadius };
  const aero = B.analyse(body, fins.span > 0 && fins.root > 0 ? fins : null);
  const motorLength = finite(motor.length) && motor.length > 0 ? motor.length : cfg.motorLength;
  const xMotorAft = cfg.length - cfg.motorAftFromTail;          // nozzle exit station, m
  const xProp = xMotorAft - motorLength / 2;                      // propellant point mass, m
  const mp0 = clamp(motor.propellantMass, 0, cfg.massLiftoff * 0.5);
  const mDry = cfg.massLiftoff - mp0;
  const xDry = (cfg.massLiftoff * cfg.cgFromNose - mp0 * xProp) / mDry;
  return {
    cfg, motor, fins, body, aero, motorLength, xMotorAft, xProp, mp0, mDry, xDry,
    refArea: aero.refArea, d: cfg.diameter,
    finsActive: aero.fins.cna > 0,
  };
}

/** Mass properties at time t: m, xcg, I, mdot. Writes into out. */
function massAt(model, t, out) {
  const mo = model.motor;
  const frac = mo.totalImpulse > 0 ? impulseAt(mo, t) / mo.totalImpulse : 1;
  const mp = model.mp0 * (1 - frac);
  const m = model.mDry + mp;
  const xcg = (model.mDry * model.xDry + mp * model.xProp) / m;
  const L = model.cfg.length;
  const dd = model.xDry - xcg, dp = model.xProp - xcg;
  out.m = m; out.xcg = xcg; out.mp = mp;
  out.I = model.mDry * L * L / 12 + model.mDry * dd * dd + mp * dp * dp;
  out.mdot = mo.totalImpulse > 0 ? model.mp0 * thrustAt(mo, t) / mo.totalImpulse : 0;
  return out;
}

/** Aerodynamic loads at angle of attack alpha (rad), airspeed V (m/s), CG station xcg (m),
    motor mass flow mdot (kg/s) and pitch rate om (rad/s). latticeCm replaces the Barrowman
    static moment when it is a number; the aerodynamic part of the pitch damping is then
    dropped (the lattice moment includes its moving-wall damping) and jet damping stays.
    Jet damping includes the variable-mass dI/dt term (barrowman.js jetDamping).
    Writes into out and returns it:
      cnNose, cnFins, cnBody, cn (normal-force coefficients on A_ref), N (N, along +n),
      drag (N, along the relative wind), Maero, Mdamp, M (N m, theta sense), cm (Maero on
      q A_ref d), cmq, c2 (N m s), xcpNow (m, CP including body lift at this alpha). */
export function aeroLoads(model, cfg, alpha, V, xcg, mdot, om, latticeCm, out = {}) {
  const A = model.refArea, d = model.d, aero = model.aero;
  const q = 0.5 * cfg.airDensity * V * V;
  const sa = Math.sin(alpha);
  let cnNose = aero.nose.cna * sa;
  let cnFins = model.finsActive ? aero.fins.cna * sa : 0;
  let cnBody = B.bodyLiftCn(alpha, aero.planformArea, A);
  let cn = cnNose + cnFins + cnBody;
  if (!finite(cn)) { cnNose = cnFins = cnBody = cn = 0; }
  else if (Math.abs(cn) > CN_LIMIT) { const k = CN_LIMIT / Math.abs(cn); cnNose *= k; cnFins *= k; cnBody *= k; cn *= k; }
  const N = q * A * cn;
  const Mbarrowman = -q * A * (cnNose * (aero.nose.xcp - xcg) + cnFins * (aero.fins.xcp - xcg) + cnBody * (aero.planformCentroid - xcg));
  const Maero = finite(latticeCm) ? latticeCm * q * A * d : Mbarrowman;
  let cmq = 0;
  { const dn = aero.nose.xcp - xcg; cmq += aero.nose.cna * dn * dn; }
  if (model.finsActive) { const df = aero.fins.xcp - xcg; cmq += aero.fins.cna * df * df; }
  cmq /= d * d;
  const c2 = (finite(latticeCm) ? 0 : 0.5 * cfg.airDensity * V * A * d * d * cmq) + B.jetDamping(mdot, model.xMotorAft, xcg, model.xProp);
  const Mdamp = -c2 * om;
  out.cnNose = cnNose; out.cnFins = cnFins; out.cnBody = cnBody; out.cn = cn; out.N = N;
  out.drag = q * A * cfg.cd; out.Maero = Maero; out.Mdamp = Mdamp; out.M = Maero + Mdamp;
  out.cm = q > 1e-9 ? Maero / (q * A * d) : 0; out.cmq = cmq; out.c2 = c2; out.qdyn = q;
  out.xcpNow = Math.abs(cn) > 1e-9 ? (cnNose * aero.nose.xcp + cnFins * aero.fins.xcp + cnBody * aero.planformCentroid) / cn : aero.xcp;
  return out;
}

/* ---------------------------------------------------------------- factory */
/**
 * createFlight(config, { bus }) -> flight
 * config: partial overrides of DEFAULTS (SI). bus: an event bus with emit(type, detail), the
 * shared vx bus by default, null to stay silent (tests).
 */
export function createFlight(config = {}, { bus = sharedBus } = {}) {
  let cfg = sanitise({ ...DEFAULTS, ...config });
  let model = buildModel(cfg);
  let derived = null;

  // integrator state
  const s = new Float64Array(6);        // x, y, vx, vy, theta, omega
  const k1 = new Float64Array(6), k2 = new Float64Array(6), k3 = new Float64Array(6), k4 = new Float64Array(6), tmp = new Float64Array(6), prev = new Float64Array(6);
  const mp = { m: 0, xcg: 0, I: 0, mdot: 0, mp: 0 };
  const info = {};
  const loads = {};
  let t = 0, stepIndex = 0, acc = 0;
  let ignited = false, lifted = false, railExited = false, railClear = false, burnedOut = false, apogeeReached = false, done = false;
  let tApogee = Infinity, maxAlt = 0, maxQ = 0, tMaxQ = 0, maxQEmitted = false, qF = 0, qFPeak = 0;
  let alphaF = 0, alphaArmed = false, alphaFPeak = 0, alphaRawPeak = 0, alphaPeakT = 0, maxAlphaEmitted = false, maxAlphaAbs = 0;
  let railExitSpeed = NaN, railExitT = NaN, railClearT = NaN, liftoffT = NaN, fault = null, groundHit = false, pendingLiftoff = false, pendingRailExit = false;
  let refFromNose = cfg.cgFromNose, x0 = 0, y0 = 0;
  let railAngle = cfg.launchAngle, railLen = cfg.railLength;   // the rail in use, captured on the pad
  let gusts = [];                       // {t0, peak, dur}
  let turb = 0, rng = mulberry32(cfg.seed);
  // lattice moment: latticeHave is false until a finite C_m arrives (and again after
  // setLatticeMoment(NaN)); until then the Barrowman moment flies it even with the toggle on
  let latticeOn = false, latticeHave = false, latticeCmIn = 0, latticeCmF = 0;
  const latticeActive = () => latticeOn && latticeHave;
  const events = [];
  const alphaSnap = {}, qSnap = {};     // state copies at the running peaks, so the maxAlpha and maxQ events carry the peak state
  const listeners = new Set();
  let destroyed = false;

  const state = {};                     // published view, rewritten after every step
  const history = createRing(HISTORY_CAPACITY);

  /* -------------------------------------------------- forces */
  function windAt(time) {
    let w = cfg.wind + turb;
    for (let i = 0; i < gusts.length; i++) {
      const g = gusts[i], u = time - g.t0;
      if (u > 0 && u < g.dur) w += 0.5 * g.peak * (1 - Math.cos(2 * Math.PI * u / g.dur));
    }
    return w;
  }

  /** Derivative of y at time tt. mode: 'rail' or 'free'. Fills info when asked. */
  function deriv(tt, y, out, mode, want) {
    const th = y[4], om = y[5];
    const ax = Math.sin(th), ay = Math.cos(th);   // body axis
    const nx = ay, ny = -ax;                       // body normal, +x side
    massAt(model, tt, mp);
    const m = mp.m, xcg = mp.xcg;
    const T = thrustAt(model.motor, tt);
    const w = windAt(tt);
    const vax = w - y[2], vay = -y[3];            // v_air = wind - v
    const V2 = vax * vax + vay * vay, V = Math.sqrt(V2);
    const q = 0.5 * cfg.airDensity * V2;
    let alpha = 0;
    if (V > 1e-6) alpha = wrapPi(th - Math.atan2(-vax, -vay));
    const L = aeroLoads(model, cfg, alpha, V, xcg, mp.mdot, om, latticeActive() ? latticeCmF : null, loads);
    const D = L.drag, N = L.N, M = L.M;
    const dx = V > 1e-6 ? vax / V : 0, dy = V > 1e-6 ? vay / V : 0;
    const g = cfg.gravity;
    const Fx = T * ax + D * dx + N * nx;
    const Fy = T * ay + D * dy + N * ny - m * g;
    out[0] = y[2]; out[1] = y[3];
    if (mode === 'rail') {
      const ux = Math.sin(railAngle), uy = Math.cos(railAngle);
      let a = (Fx * ux + Fy * uy) / m;
      const vAlong = y[2] * ux + y[3] * uy;
      if (vAlong <= 0 && a < 0) a = 0;            // the rail stop holds it
      out[2] = a * ux; out[3] = a * uy; out[4] = 0; out[5] = 0;
    } else {
      out[2] = Fx / m; out[3] = Fy / m; out[4] = om; out[5] = M / mp.I;
    }
    if (want) {
      info.m = m; info.xcg = xcg; info.I = mp.I; info.mdot = mp.mdot; info.thrust = T; info.wind = w;
      info.airspeed = V; info.qdyn = q; info.alpha = alpha; info.drag = D; info.N = N; info.M = M;
      info.Maero = L.Maero; info.Mdamp = L.Mdamp; info.cn = L.cn; info.cnNose = L.cnNose; info.cnFins = L.cnFins; info.cnBody = L.cnBody;
      info.cmq = L.cmq; info.c2 = L.c2; info.xcpNow = L.xcpNow; info.cm = L.cm;
    }
    return out;
  }

  /* -------------------------------------------------- integration */
  /** One classic RK4 step of length h from time t0 (default: the fixed step from t). */
  function rk4(mode, t0 = t, h = DT) {
    deriv(t0, s, k1, mode, false);
    for (let i = 0; i < 6; i++) tmp[i] = s[i] + 0.5 * h * k1[i];
    deriv(t0 + 0.5 * h, tmp, k2, mode, false);
    for (let i = 0; i < 6; i++) tmp[i] = s[i] + 0.5 * h * k2[i];
    deriv(t0 + 0.5 * h, tmp, k3, mode, false);
    for (let i = 0; i < 6; i++) tmp[i] = s[i] + h * k3[i];
    deriv(t0 + h, tmp, k4, mode, false);
    for (let i = 0; i < 6; i++) s[i] += (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
  }

  function railTravel(y = s) {
    const ux = Math.sin(railAngle), uy = Math.cos(railAngle);
    return (y[0] - x0) * ux + (y[1] - y0) * uy;
  }
  function railSpeed(y = s) { return y[2] * Math.sin(railAngle) + y[3] * Math.cos(railAngle); }

  function advance() {
    // turbulence: one Gauss-Markov update per fixed step, before the step (deterministic)
    if (cfg.turbulence > 0) {
      const e = Math.exp(-DT / cfg.turbulenceTime);
      const u1 = Math.max(1e-12, rng()), u2 = rng();
      const xi = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);   // Box-Muller
      turb = turb * e + cfg.turbulence * Math.sqrt(1 - e * e) * xi;
    } else turb = 0;
    // low-pass on the lattice moment: first order, cutoff LATTICE_LP_HZ
    { const a = 1 - Math.exp(-2 * Math.PI * LATTICE_LP_HZ * DT); latticeCmF += a * (latticeCmIn - latticeCmF); }

    prev.set(s);
    if (!lifted) {
      t += DT; stepIndex++;
      massAt(model, t, mp);
      if (thrustAt(model.motor, t) > mp.m * cfg.gravity) { lifted = true; liftoffT = t; pendingLiftoff = true; }
    } else {
      const mode = railClear ? 'free' : 'rail';
      const t0 = t;
      rk4(mode);
      if (mode === 'rail') {
        const ux = Math.sin(railAngle), uy = Math.cos(railAngle);
        const vAlong = s[2] * ux + s[3] * uy;
        if (vAlong < 0 || railTravel() < 0) {         // never slide back through the pad
          const tr = Math.max(0, railTravel());
          s[0] = x0 + tr * ux; s[1] = y0 + tr * uy; s[2] = Math.max(0, vAlong) * ux; s[3] = Math.max(0, vAlong) * uy;
        }
        // the rail crossings inside this step, on the rail-constrained trajectory
        const tr0 = railTravel(prev), v0 = railSpeed(prev), tr1 = railTravel(), v1 = railSpeed();
        const goalExit = railLen - cfg.aftButtonFromAft - cfg.buttonSpacing, goalClear = railLen - cfg.aftButtonFromAft;
        if (!railExited && tr1 >= goalExit) {
          const u = crossing(tr0, v0, tr1, v1, goalExit, DT);
          pendingRailExit = true; railExitT = t0 + u * DT; railExitSpeed = Math.abs(v0 + u * (v1 - v0));
        }
        if (tr1 >= goalClear) {
          // the aft button leaves inside this step: redo it, rail-constrained up to the crossing
          // and free after it, so the release does not wait for the next grid point
          const u = crossing(tr0, v0, tr1, v1, goalClear, DT);
          s.set(prev);
          if (u > 0) rk4('rail', t0, u * DT);
          railClear = true; railClearT = t0 + u * DT;
          if (u < 1) rk4('free', t0 + u * DT, (1 - u) * DT);
        }
      }
      t += DT; stepIndex++;
    }
    // NaN guard: restore the last good state and stop
    for (let i = 0; i < 6; i++) if (!finite(s[i])) { s.set(prev); fault = 'non-finite state'; done = true; break; }

    deriv(t, s, k1, railClear ? 'free' : 'rail', true);
    publish();
    detectEvents();
    if (stepIndex % HISTORY_EVERY === 0) pushHistory();
  }

  function detectEvents() {
    const alt = s[1] - y0;
    if (pendingLiftoff) { pendingLiftoff = false; addEvent('liftoff', liftoffT); }
    if (pendingRailExit) {
      // time and speed interpolated to the crossing inside the step (advance); state at the step end
      pendingRailExit = false; railExited = true;
      state.railExitSpeed = railExitSpeed;
      addEvent('railExit', railExitT);
    }
    if (!burnedOut && t >= model.motor.burnEnd - 1e-9) { burnedOut = true; addEvent('burnout', model.motor.burnEnd); }
    alphaF += LP_ALPHA * (info.alpha - alphaF);
    if (lifted) {
      qF += LP_Q * (info.qdyn - qF);
      if (qF > qFPeak) qFPeak = qF;
      if (info.qdyn > maxQ) { maxQ = info.qdyn; tMaxQ = t; if (!maxQEmitted) Object.assign(qSnap, state); }
      if (!maxQEmitted && railExited && qFPeak > 10 && qF < MAXQ_DROP * qFPeak
          && (burnedOut || info.thrust < info.drag + info.m * cfg.gravity * Math.cos(s[4]))) {
        maxQEmitted = true; addEvent('maxQ', tMaxQ, null, qSnap);
      }
    }
    if (railExited && !apogeeReached) {
      const a = Math.abs(info.alpha), qok = info.qdyn >= ALPHA_Q_MIN;
      if (qok && a > maxAlphaAbs) maxAlphaAbs = a;
      if (!maxAlphaEmitted && qok) {
        // first swing: from the first armed sample (rail exit) until the filtered |alpha|
        // falls a hysteresis below its own peak; the event keeps the raw peak of that swing
        const af = Math.abs(alphaF);
        if (!alphaArmed) { alphaArmed = true; alphaFPeak = af; alphaRawPeak = -1; }
        if (af > alphaFPeak) alphaFPeak = af;
        if (a > alphaRawPeak) { alphaRawPeak = a; alphaPeakT = t; Object.assign(alphaSnap, state); }
        if (af < alphaFPeak - Math.max(ALPHA_HYST_DEG * DEG, ALPHA_HYST_REL * alphaFPeak)) {
          maxAlphaEmitted = true; addEvent('maxAlpha', alphaPeakT, null, alphaSnap);
        }
      }
    }
    if (lifted && alt > maxAlt) maxAlt = alt;
    if (lifted && !apogeeReached && t > liftoffT + 0.05 && prev[3] > 0 && s[3] <= 0) {
      apogeeReached = true; tApogee = t; addEvent('apogee', t, { altitude: maxAlt, apogee: maxAlt, phase: 'descent' });
    }
    if (lifted && alt < -1e-6 && railClear) { groundHit = true; done = true; }
    if (apogeeReached && t >= tApogee + STOP_AFTER_APOGEE - 1e-9) done = true;
    state.phase = phaseNow();
    state.done = done;
  }

  function phaseNow() {
    if (!lifted) return 'pad';
    if (apogeeReached) return 'descent';
    if (!railExited) return 'rail';
    return burnedOut ? 'coast' : 'boost';
  }

  function addEvent(name, time, extra, from = state) {
    if (from === state) state.phase = phaseNow();
    const snap = { ...from, ...(extra || {}) };
    const ev = { name, t: time, state: snap };
    let i = events.length;
    while (i > 0 && events[i - 1].t > time) i--;
    events.splice(i, 0, ev);
    for (const fn of listeners) { try { fn(ev); } catch (err) { console.error('[flight] listener threw', err); } }
    if (bus) bus.emit('flight:event', ev);
  }

  function publish() {
    const alt = s[1] - y0;
    state.t = t;
    state.x = s[0]; state.y = s[1];
    state.vx = s[2]; state.vy = s[3];
    state.v = Math.hypot(s[2], s[3]);
    state.theta = wrapPi(s[4]); state.thetaUnwrapped = s[4]; state.q = s[5]; state.omega = s[5];
    state.altitude = alt;
    state.downrange = s[0] - x0;
    state.alpha = info.alpha; state.airspeed = info.airspeed; state.qdyn = info.qdyn;
    state.thrust = info.thrust; state.drag = info.drag; state.mass = info.m; state.inertia = info.I; state.mdot = info.mdot;
    state.N = info.N; state.M = info.M; state.Maero = info.Maero; state.Mdamp = info.Mdamp;
    state.cn = info.cn; state.cm = info.cm; state.cmq = info.cmq;
    state.xcg = info.xcg; state.xcp = model.aero.xcp; state.xcpNow = info.xcpNow;
    state.margin = (model.aero.xcp - info.xcg) / model.d;
    state.wind = info.wind;
    state.railTravel = lifted ? railTravel() : 0;
    state.onRail = !railClear;
    state.railLength = railLen; state.railAngle = railAngle;
    state.refFromNose = refFromNose;
    state.maxAlpha = maxAlphaAbs;
    state.maxQ = maxQ;
    state.apogee = apogeeReached ? maxAlt : NaN;
    state.maxAltitude = maxAlt;
    state.railExitSpeed = railExitSpeed;
    state.railExitTime = railExitT; state.railClearTime = railClearT;
    state.ignited = ignited;
    state.lattice = latticeOn;
    state.latticeActive = latticeActive();
    state.latticeCm = latticeCmF;
    state.fault = fault;
    state.groundHit = groundHit;
    state.stepIndex = stepIndex;
  }

  function pushHistory() {
    const r = history._next();
    r.t = t; r.x = s[0]; r.y = s[1]; r.v = state.v; r.theta = state.theta; r.alpha = info.alpha;
    r.q = s[5]; r.qdyn = info.qdyn; r.phase = state.phase; r.N = info.N; r.M = info.M;
  }

  /* -------------------------------------------------- derived */
  function computeDerived() {
    const aero = model.aero, d = model.d, A = model.refArea;
    const m0 = {}, mb = {};
    massAt(model, 0, m0); massAt(model, model.motor.burnEnd + 1, mb);
    const C1per = (V) => 0.5 * cfg.airDensity * V * V * A * aero.cna;     // N m per (rad m)
    const props = (tt) => (tt === undefined ? m0 : massAt(model, tt, {}));
    function c1(V, tt) { const p = props(tt); return C1per(V) * (aero.xcp - p.xcg); }
    function c2(V, tt) {
      const p = props(tt);
      const comps = aero.components;
      const cmq = B.dampingCmq(comps, p.xcg, d);
      const jet = tt === undefined ? 0 : B.jetDamping(p.mdot, model.xMotorAft, p.xcg, model.xProp);
      return 0.5 * cfg.airDensity * V * A * d * d * cmq + jet;
    }
    /** Linearised pitch dynamics at airspeed V (m/s) and time tt (s; omitted = liftoff mass
        with the motor not burning: no thrust, no jet damping). See the header. */
    function shortPeriod(V, tt) {
      const p = props(tt);
      const C1 = c1(V, tt), C2 = c2(V, tt), I = p.I;
      const T = tt === undefined ? 0 : thrustAt(model.motor, tt);
      const Z = V > 1e-9 ? (C1per(V) + T) / (p.m * V) : 0;           // 1/s, flight-path turning per unit alpha
      const k = C1 / I + Z * C2 / I, c = C2 / I + Z;
      const ok = C1 > 0 && k > 0;
      return {
        V, t: tt, C1, C2, I, Z, thrust: T, mass: p.m,
        omegaN: ok ? Math.sqrt(k) : 0, zeta: ok ? c / (2 * Math.sqrt(k)) : NaN,
        omegaNMandell: C1 > 0 ? Math.sqrt(C1 / I) : 0, zetaMandell: C1 > 0 ? C2 / (2 * Math.sqrt(C1 * I)) : NaN,
      };
    }
    const rail = predictRailExit();
    const tw = (model.motor.totalImpulse / Math.max(1e-9, model.motor.burnEnd)) / (cfg.massLiftoff * cfg.gravity);
    let peak = 0; for (const f of model.motor.fs) peak = Math.max(peak, f);
    derived = Object.freeze({
      cna: aero.cna,                                 // per rad (SIM, Barrowman)
      xcp: aero.xcp,                                 // m from nose (SIM)
      components: aero.components.map((c) => ({ name: c.name, cna: c.cna, xcp: c.xcp })),
      finCna: aero.fins.cna, finXcp: aero.fins.xcp, finKfb: aero.fins.kfb, noseCna: aero.nose.cna, noseXcp: aero.nose.xcp,
      finsActive: model.finsActive, fins: { ...model.fins },
      refArea: A, refLength: d, planformArea: aero.planformArea, planformCentroid: aero.planformCentroid,
      xcgLiftoff: m0.xcg, xcgBurnout: mb.xcg,
      xcg: (tt = 0) => massAt(model, tt, {}).xcg,
      staticMargin: (aero.xcp - m0.xcg) / d,         // cal at liftoff (SIM)
      staticMarginBurnout: (aero.xcp - mb.xcg) / d,  // cal at burnout (SIM)
      massLiftoff: m0.m, massBurnout: mb.m, inertiaLiftoff: m0.I, inertiaBurnout: mb.I,
      cmqLiftoff: B.dampingCmq(aero.components, m0.xcg, d),
      corrective: (V, tt) => c1(V, tt),            // C1, N m/rad
      damping: (V, tt) => c2(V, tt),               // C2, N m s
      // two-degree-of-freedom short period (alpha, q), rad/s and dimensionless: the decay the
      // simulated motion shows (header; validation F1 B05, F2 E02)
      naturalFrequency: (V, tt) => shortPeriod(V, tt).omegaN,
      dampingRatio: (V, tt) => shortPeriod(V, tt).zeta,
      naturalFrequency2: (V, tt) => shortPeriod(V, tt).omegaN,
      dampingRatio2: (V, tt) => shortPeriod(V, tt).zeta,
      // Mandell's one-degree-of-freedom values (exclude the flight-path turning Z)
      naturalFrequencyMandell: (V, tt) => shortPeriod(V, tt).omegaNMandell,
      dampingRatioMandell: (V, tt) => shortPeriod(V, tt).zetaMandell,
      shortPeriod,
      // margin at any CG (cal), and at the CAD-based CG estimate (EST, CG_ESTIMATE_CAD) with its spread
      staticMarginAt: (xcg) => (aero.xcp - xcg) / d,
      cgEstimateCad: CG_ESTIMATE_CAD,
      staticMarginCadCg: (aero.xcp - CG_ESTIMATE_CAD.value) / d,
      staticMarginCadCgRange: [(aero.xcp - CG_ESTIMATE_CAD.hi) / d, (aero.xcp - CG_ESTIMATE_CAD.lo) / d],
      railExitSpeedPrediction: rail.speed, railExitTimePrediction: rail.t, liftoffTimePrediction: rail.tLiftoff,
      motorName: model.motor.name, motorSource: model.motor.source,
      totalImpulse: model.motor.totalImpulse, burnTime: model.motor.burnEnd, peakThrust: peak,
      averageThrustToWeight: tw, peakThrustToWeight: peak / (cfg.massLiftoff * cfg.gravity),
      propellantMass: model.mp0, xPropellant: model.xProp, xNozzle: model.xMotorAft,
      cd: cfg.cd,
    });
  }

  /** Axial motion on the rail with no wind, RK4 at DT, until the forward button leaves; the
      speed and time are interpolated to the crossing inside the last step. */
  function predictRailExit() {
    const g = cfg.gravity, ca = Math.cos(cfg.launchAngle), A = model.refArea;
    const p = { m: 0, xcg: 0, I: 0, mdot: 0, mp: 0 };
    let tt = 0, guard = 0;
    for (; guard < 20000; guard++) { tt += DT; massAt(model, tt, p); if (thrustAt(model.motor, tt) > p.m * g) break; }
    const tLiftoff = tt;
    const goal = cfg.railLength - cfg.aftButtonFromAft - cfg.buttonSpacing;   // forward button at the rail top
    const f = (time, v) => { massAt(model, time, p); const a = (thrustAt(model.motor, time) - p.m * g * ca - 0.5 * cfg.airDensity * v * v * A * cfg.cd) / p.m; return v <= 0 && a < 0 ? 0 : a; };
    let x = 0, v = 0, xp = 0, vp = 0;
    for (guard = 0; guard < 20000 && x < goal; guard++) {
      xp = x; vp = v;
      const a1 = f(tt, v), x1 = v;
      const a2 = f(tt + DT / 2, v + a1 * DT / 2), x2 = v + a1 * DT / 2;
      const a3 = f(tt + DT / 2, v + a2 * DT / 2), x3 = v + a2 * DT / 2;
      const a4 = f(tt + DT, v + a3 * DT), x4 = v + a3 * DT;
      x += DT / 6 * (x1 + 2 * x2 + 2 * x3 + x4);
      v += DT / 6 * (a1 + 2 * a2 + 2 * a3 + a4);
      if (v < 0) v = 0;
      tt += DT;
    }
    if (!(x >= goal)) return { speed: NaN, t: NaN, tLiftoff };
    const u = crossing(xp, vp, x, v, goal, DT);                   // interpolated to the crossing, as the flight does
    return { speed: vp + u * (v - vp), t: tt - DT + u * DT, tLiftoff };
  }

  /* -------------------------------------------------- lifecycle */
  function placeOnPad() {
    railAngle = cfg.launchAngle; railLen = cfg.railLength;
    const ux = Math.sin(railAngle), uy = Math.cos(railAngle);
    refFromNose = cfg.cgFromNose;
    // aft end at the rail base; the reference station sits (length - refFromNose) up the rail
    const up = cfg.length - refFromNose;
    x0 = up * ux; y0 = up * uy;
    s[0] = x0; s[1] = y0; s[2] = 0; s[3] = 0; s[4] = cfg.launchAngle; s[5] = 0;
  }

  function reset() {
    if (destroyed) return;
    t = 0; stepIndex = 0; acc = 0;
    ignited = lifted = railExited = railClear = burnedOut = apogeeReached = done = false;
    tApogee = Infinity; maxAlt = 0; maxQ = 0; tMaxQ = 0; maxQEmitted = false; qF = 0; qFPeak = 0;
    alphaF = 0; alphaArmed = false; alphaFPeak = 0; alphaRawPeak = 0; alphaPeakT = 0; maxAlphaEmitted = false; maxAlphaAbs = 0;
    railExitSpeed = NaN; railExitT = NaN; railClearT = NaN; liftoffT = NaN; fault = null; groundHit = false; pendingLiftoff = false; pendingRailExit = false;
    gusts = []; turb = 0; rng = mulberry32(cfg.seed); latticeCmF = latticeCmIn;
    events.length = 0; history._clear();
    placeOnPad();
    deriv(0, s, k1, 'rail', true);
    publish();
    state.phase = 'pad'; state.done = false;
    if (bus) bus.emit('flight:reset', { t: 0 });
  }

  function reconfigure(patch) {
    if (destroyed) return;
    cfg = sanitise({ ...cfg, ...patch });
    model = buildModel(cfg);
    computeDerived();
    if (!ignited) {
      // on the pad no random number has been drawn yet: reseed so configure({seed}) and
      // createFlight({seed}) give the same flight (after ignition a new seed waits for reset)
      rng = mulberry32(cfg.seed); turb = 0;
      placeOnPad(); deriv(0, s, k1, 'rail', true); publish(); state.phase = 'pad'; state.done = false;
    }
    else { deriv(t, s, k1, railClear ? 'free' : 'rail', true); publish(); state.phase = phaseNow(); state.done = done; }
    if (bus) bus.emit('flight:config', { config: cfg });
  }

  function ignite() {
    if (ignited || done || destroyed) return false;
    ignited = true;
    addEvent('ignition', 0);
    return true;
  }

  function step(dtPhysical) {
    if (destroyed || !ignited || done) return 0;
    if (!finite(dtPhysical) || dtPhysical <= 0) return 0;
    acc += Math.min(dtPhysical, MAX_STEP_CALL);
    let n = 0;
    while (acc >= DT * (1 - 1e-9) && !done) { advance(); acc -= DT; n++; }
    if (done) acc = 0;
    return n;
  }

  function run(seconds) {
    if (!ignited) ignite();
    const n = Math.round(Math.max(0, seconds) / DT);
    let i = 0;
    for (; i < n && !done; i++) advance();
    return i;
  }

  computeDerived();
  reset();

  const flight = {
    get state() { return state; },
    get config() { return cfg; },
    get derived() { return derived; },
    get events() { return events; },
    get history() { return history; },
    get phase() { return state.phase; },
    get done() { return done; },
    get ignited() { return ignited; },
    get model() { return model; },
    step, run, reset, ignite,
    gust(peak) {
      if (destroyed || !finite(peak) || !ignited || done) return false;
      gusts.push({ t0: t, peak: clamp(peak, ...LIMITS.gust), dur: cfg.gustDuration });
      gusts = gusts.filter((g) => t - g.t0 < g.dur);
      return true;
    },
    flick(rate) {
      if (destroyed || !finite(rate) || !ignited || done || !railClear) return false;
      s[5] += clamp(rate, ...LIMITS.flick);
      publish();
      return true;
    },
    setWind(v) { if (finite(v)) reconfigure({ wind: v }); return cfg.wind; },
    setFinScale(k) { if (finite(k)) reconfigure({ finScale: k }); return cfg.finScale; },
    setFins(f) { if (f && finite(f.root) && finite(f.span)) reconfigure({ fins: { ...cfg.fins, ...f } }); return cfg.fins; },
    setCg(m) { if (finite(m)) reconfigure({ cgFromNose: m }); return cfg.cgFromNose; },
    setRail(m) { if (finite(m)) reconfigure({ railLength: m }); return cfg.railLength; },
    setLaunchAngle(rad) { if (finite(rad)) reconfigure({ launchAngle: rad }); return cfg.launchAngle; },
    setTurbulence(rms) { if (finite(rms)) reconfigure({ turbulence: rms }); return cfg.turbulence; },
    setSeed(n) { if (finite(n)) reconfigure({ seed: n }); return cfg.seed; },
    /** C_m from the lattice (theta sense, on q A_ref d). NaN or null withdraws it: the
        Barrowman moment flies the rocket again until the next finite value. The first
        value after a withdrawal starts the 10 Hz low-pass from the moment in use, so the
        handover is smooth. Returns the value held, or NaN when none is held. */
    setLatticeMoment(cm) {
      if (destroyed) return latticeHave ? latticeCmIn : NaN;
      if (cm === null || cm === undefined || Number.isNaN(cm)) { latticeHave = false; state.latticeActive = latticeActive(); return NaN; }
      if (!finite(cm)) return latticeHave ? latticeCmIn : NaN;
      if (!latticeHave) latticeCmF = finite(state.cm) ? clamp(state.cm, ...LIMITS.latticeCm) : 0;
      latticeHave = true;
      latticeCmIn = clamp(cm, ...LIMITS.latticeCm);
      state.latticeActive = latticeActive();
      return latticeCmIn;
    },
    useLattice(on) {
      if (destroyed) return latticeOn;
      latticeOn = !!on;
      if (latticeOn && latticeHave) latticeCmF = latticeCmIn;   // a value already held takes over at once, as before
      state.lattice = latticeOn; state.latticeActive = latticeActive();
      return latticeOn;
    },
    configure(patch) { if (patch && typeof patch === 'object') reconfigure(patch); return cfg; },
    onEvent(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    /** Static loads at a given alpha (rad) and airspeed (m/s), mass properties at time tt
        (default liftoff), no pitch rate. For tests and the lab readout. */
    momentAt(alpha, V, tt = 0) { const p = massAt(model, tt, {}); return aeroLoads(model, cfg, alpha, V, p.xcg, 0, 0, latticeActive() ? latticeCmF : null, {}); },
    /** World position of a body station (m from the nose). */
    bodyToWorld(station) {
      const d = refFromNose - station;
      return { x: s[0] + d * Math.sin(s[4]), y: s[1] + d * Math.cos(s[4]) };
    },
    /** Stops the instance for good: no more steps, events or bus traffic; setters become no-ops. */
    destroy() { destroyed = true; done = true; listeners.clear(); gusts = []; acc = 0; bus = null; },
  };
  return flight;
}

/** Clamp and validate a configuration; unknown keys pass through untouched. */
function sanitise(c) {
  const out = { ...c };
  const num = (k, lo, hi, fb) => { out[k] = finite(out[k]) ? clamp(out[k], lo, hi) : fb; };
  num('finScale', ...LIMITS.finScale, DEFAULTS.finScale);
  num('cgFromNose', ...LIMITS.cgFromNose, DEFAULTS.cgFromNose);
  num('railLength', ...LIMITS.railLength, DEFAULTS.railLength);
  num('launchAngle', ...LIMITS.launchAngle, DEFAULTS.launchAngle);
  num('wind', ...LIMITS.wind, DEFAULTS.wind);
  num('turbulence', ...LIMITS.turbulence, DEFAULTS.turbulence);
  num('cd', 0.05, 3, DEFAULTS.cd);
  num('massLiftoff', 0.2, 10, DEFAULTS.massLiftoff);
  num('airDensity', 0.1, 2, DEFAULTS.airDensity);
  num('gravity', 1, 30, DEFAULTS.gravity);
  num('gustDuration', 0.05, 5, DEFAULTS.gustDuration);
  num('turbulenceTime', 0.01, 10, DEFAULTS.turbulenceTime);
  num('buttonSpacing', 0, 1, DEFAULTS.buttonSpacing);
  num('aftButtonFromAft', 0, 0.5, DEFAULTS.aftButtonFromAft);
  // geometry and mass stations (the geometry module feeds these): finite and inside the
  // airframe, otherwise the CAD default (scaled down only if the airframe is too short for it)
  for (const k of ['length', 'diameter', 'motorLength']) if (!(finite(out[k]) && out[k] > 0)) out[k] = DEFAULTS[k];
  const L = out.length, R = out.diameter / 2;
  const inside = (k, ok, fb) => { if (!(finite(out[k]) && ok(out[k]))) out[k] = fb; };
  inside('noseLength', (v) => v > 0 && v < L, Math.min(DEFAULTS.noseLength, 0.5 * L));
  inside('tailCapLength', (v) => v >= 0 && v < 0.2 * L, Math.min(DEFAULTS.tailCapLength, 0.1 * L));
  inside('tailCapRadius', (v) => v > 0 && v <= R, Math.min(DEFAULTS.tailCapRadius, R));
  inside('motorAftFromTail', (v) => v >= 0 && v < 0.5 * L, Math.min(DEFAULTS.motorAftFromTail, 0.25 * L));
  out.seed = finite(out.seed) ? (out.seed >>> 0) : DEFAULTS.seed;
  const f = out.fins || CAD_FINS;
  out.fins = Object.freeze({
    n: finite(f.n) ? Math.max(0, Math.round(f.n)) : 4,
    root: finite(f.root) ? Math.max(0, f.root) : CAD_FINS.root,
    tip: finite(f.tip) ? Math.max(0, f.tip) : CAD_FINS.tip,
    span: finite(f.span) ? Math.max(0, f.span) : CAD_FINS.span,
    sweep: finite(f.sweep) ? f.sweep : CAD_FINS.sweep,
    thickness: finite(f.thickness) ? f.thickness : CAD_FINS.thickness,
    rootLeadingEdgeFromNose: finite(f.rootLeadingEdgeFromNose) ? f.rootLeadingEdgeFromNose : CAD_FINS.rootLeadingEdgeFromNose,
    source: f.source || 'config',
  });
  return Object.freeze(out);
}

/** Preallocated ring buffer of history samples. at(0) is the oldest. */
function createRing(capacity) {
  const buf = Array.from({ length: capacity }, () => ({ t: 0, x: 0, y: 0, v: 0, theta: 0, alpha: 0, q: 0, qdyn: 0, phase: 'pad', N: 0, M: 0 }));
  let head = 0, size = 0;
  return {
    capacity,
    get length() { return size; },
    at(i) { if (i < 0 || i >= size) return undefined; return buf[(head - size + i + capacity) % capacity]; },
    last() { return size ? buf[(head - 1 + capacity) % capacity] : undefined; },
    toArray() { const a = new Array(size); for (let i = 0; i < size; i++) a[i] = { ...buf[(head - size + i + capacity) % capacity] }; return a; },
    forEach(fn) { for (let i = 0; i < size; i++) fn(buf[(head - size + i + capacity) % capacity], i); },
    _next() { const r = buf[head]; head = (head + 1) % capacity; if (size < capacity) size++; return r; },
    _clear() { head = 0; size = 0; },
  };
}

export default createFlight;
