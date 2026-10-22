/* Stand-in for vx/js/data/motor-g77r.js, with the same export shape. Used only while the
   real thrust curve module is missing. NOT a datasheet curve.

   Shape (EST): a trapezoid with a 0.05 s ramp, a flat plateau and a 0.25 s linear tail,
   sized so that it integrates to the published burn time and average thrust:
     burn 1.25 s (PAGE: projects/charger.html, Aerotech G77R-7)
     average thrust 77 N (the "77" in the G77 designation is the average thrust in newtons)
     total impulse 77 N x 1.25 s = 96.25 N s
     plateau F_p: impulse = F_p (0.05/2 + (1.00 - 0.05) + 0.25/2) = 1.10 F_p  ->  F_p = 87.5 N
   Masses (EST, not from a datasheet): a 29 mm single-use G reload of this class carries
   roughly 60 g of propellant in a casing of roughly 125 g total. */

const PLATEAU_N = 96.25 / 1.10;   // 87.5 N, EST (see above)

export const MOTOR = Object.freeze({
  name: 'Aerotech G77R-7 (fallback trapezoid, EST)',
  source: 'EST',
  curve: Object.freeze([
    Object.freeze([0, 0]),
    Object.freeze([0.05, PLATEAU_N]),
    Object.freeze([1.0, PLATEAU_N]),
    Object.freeze([1.25, 0]),
  ]),
  propellantMass_kg: 0.060,   // EST
  totalMass_kg: 0.125,        // EST
  burnTime_s: 1.25,           // PAGE
  averageThrust_N: 77,        // PAGE (designation)
  totalImpulse_Ns: 96.25,     // derived from the two above
  diameter_m: 0.029,          // 29 mm motor class
  length_m: 0.124,            // CAD part 5 length
});

/** Thrust in N at time t in s after ignition, linear between curve points, 0 outside. */
export function thrust(t) {
  const c = MOTOR.curve;
  if (!(t >= c[0][0]) || t >= c[c.length - 1][0]) return 0;
  for (let i = 1; i < c.length; i++) {
    if (t <= c[i][0]) {
      const [t0, f0] = c[i - 1], [t1, f1] = c[i];
      return f0 + (f1 - f0) * (t - t0) / (t1 - t0);
    }
  }
  return 0;
}

export default MOTOR;
