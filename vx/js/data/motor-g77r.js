/* motor-g77r.js — thrust curve and figures for the AeroTech G77R, the motor
   the CHARGER page flies as a G77R-7 (the delay does not change the curve).

   Which G77R: AeroTech has sold two motors under this name. The one used here
   is the 29 x 124 mm single-use motor (thrustcurve.org designation G77R/L,
   case "SU 29.0x124.0", sold with 4, 7 or 10 s delays). The other is the
   RMS-29/120 reload (G77R-14A, 149 to 150 mm long, 155 g). The single-use
   motor is the match: the CAD motor envelope in
   assets/charger-explorer/assembly.json is 29 x 124.0 mm, a fixed 7 s delay
   exists only on the single-use motor, and OpenRocket's figures for this
   curve (average thrust 80.56 N, burn estimate 1.26 s) give the page's thrust
   to weight of 8.17 at a liftoff mass of 1.006 kg, which is the page's
   2.2 pound rocket.

   Where the numbers come from: every curve sample, the dimensions and both
   masses are copied unchanged from the RASP .eng file thrustcurve.org
   distributed for this motor, as mirrored in the OpenRocket repository (exact
   URL in MOTOR.source.url). Its header reads: "Single-Use Casing. Entered by
   Tim Van Milligan for RockSim Users. Used John Coker's ThrustCurve Tracer
   software and NAR cert paperwork dated 7-29-06." The same 30 samples, with
   the same thrustcurve.org digest, are in OpenRocket 23.09's bundled motor
   database. totalImpulse_Ns and the delay list are the published retail
   figures (Apogee Components). The leading [0, 0] is the RASP convention
   (thrust is zero at ignition) written out; it is not a measured sample.
   averageThrust_N is the curve's own impulse divided by its burn time and is
   marked as such. Nothing in this file is invented, smoothed or resampled. */

/* [t_seconds, thrust_newtons], as published. 31 rows: the implied [0, 0]
   plus the 30 samples of the RASP file, the last one being burnout. */
const CURVE = [
    [0, 0],
    [0.01, 19.124],
    [0.018, 15.668],
    [0.059, 66.59],
    [0.084, 72.35],
    [0.122, 75.115],
    [0.151, 77.419],
    [0.173, 77.65],
    [0.271, 85.945],
    [0.337, 88.018],
    [0.424, 91.935],
    [0.475, 93.318],
    [0.523, 94.931],
    [0.57, 96.313],
    [0.61, 96.313],
    [0.644, 99.309],
    [0.656, 96.774],
    [0.728, 95.622],
    [0.792, 94.24],
    [0.902, 91.014],
    [0.961, 88.479],
    [1.017, 88.018],
    [1.047, 84.562],
    [1.071, 81.106],
    [1.099, 76.037],
    [1.127, 69.355],
    [1.158, 61.06],
    [1.188, 44.931],
    [1.213, 30.184],
    [1.231, 18.203],
    [1.277, 0]
];

export const MOTOR = Object.freeze({
  designation: 'G77R',
  thrustcurveDesignation: 'G77R/L',
  commonName: 'G77',
  manufacturer: 'AeroTech',
  motorType: 'single-use',
  propellant: 'Redline',
  diameter_mm: 29,            // RASP header
  length_mm: 124,             // RASP header; Apogee also lists 124 mm
  totalMass_kg: 0.122,        // RASP header; Apogee lists 123.0 g
  propellantMass_kg: 0.0591,  // RASP header; Apogee lists 58.1 g
  totalImpulse_Ns: 102.9,     // published (Apogee); the curve integrates to 101.70 N s, 1.2 percent lower
  averageThrust_N: 79.64,     // derived: curve impulse 101.70 N s over the curve burn time 1.277 s; no published average found for this motor
  peakThrust_N: 99.309,       // highest curve sample; Apogee lists 96.9 N
  burnTime_s: 1.277,          // last curve sample (burnout); Apogee lists 1.3 s
  delays_s: Object.freeze([4, 7, 10]), // fixed delays sold (Apogee models 77604, 77607, 77610); the RASP header lists only 4
  curve: Object.freeze(CURVE.map((row) => Object.freeze(row))),
  source: Object.freeze({
    url: 'https://raw.githubusercontent.com/openrocket/openrocket/release-15.03/core/resources-src/datafiles/thrustcurves/thrustcurve.org/AeroTech_G77.eng',
    retrievedOn: '2026-10-22',
    notes: 'RASP file from thrustcurve.org, traced by Tim Van Milligan with John Coker\'s ThrustCurve Tracer from the NAR certification paperwork dated 2006-07-29, mirrored in the OpenRocket repository (tag release-15.03, folder thrustcurves/thrustcurve.org). ' +
      'Cross-checked against the motor database bundled in OpenRocket 23.09 (https://raw.githubusercontent.com/openrocket/openrocket/release-23.09/core/resources/datafiles/thrustcurves/thrustcurves.ser), which holds the same samples under thrustcurve.org digest 5937899bdb55f4ac156710ed742dc719, designation G77R/L, case SU 29.0x124.0. ' +
      'thrustcurve.org itself (API and motor pages) answered HTTP 503 throughout retrieval, so the file could not be taken from it directly. ' +
      'totalImpulse_Ns and delays_s are from https://www.apogeerockets.com/Rocket_Motors/AeroTech_Motors/29mm_Motors_Loadable/Aerotech_29mm_Loadable_Motor_G77R-7 (102.9 N s, max 96.9 N, burn 1.3 s, 123.0 g, propellant 58.1 g, 124 mm). ' +
      'This is a traced curve from the certification plot, not a raw load cell record. ' +
      'Not the RMS-29/120 reload: AeroTech lists that motor at 105 N s, 77.0 N average, 107 N peak, 1.3 s, 55 g propellant, 155 g (https://aerotech-rocketry.com/products/product_758869c8-a46d-40de-9ef7-457dff960f22).',
  }),
});

/* Thrust in newtons at time t seconds after ignition: linear interpolation
   between the published samples, 0 before ignition and after burnout. */
export function thrust(t) {
  const c = MOTOR.curve;
  if (t >= 0 && t <= MOTOR.burnTime_s) {
    let lo = 0;
    let hi = c.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (c[mid][0] <= t) lo = mid; else hi = mid;
    }
    const [t0, f0] = c[lo];
    const [t1, f1] = c[hi];
    return t1 === t0 ? f1 : f0 + (f1 - f0) * (t - t0) / (t1 - t0);
  }
  return 0;
}
