/* Barrowman stability terms for CHARGER. Pure functions, SI units, no DOM.

   References (STD):
   - J. S. Barrowman, "The Practical Calculation of the Aerodynamic Characteristics of
     Slender Finned Vehicles", M.S. thesis, Catholic University of America, 1967; and
     J. S. and J. A. Barrowman, "The Theoretical Prediction of the Center of Pressure",
     NARAM-8 R&D report, 1966. Subsonic, small angle of attack, rigid body.
   - G. K. Mandell, G. J. Caporaso, W. P. Bengen, "Topics in Advanced Model Rocketry",
     MIT Press 1973: the corrective and damping moment coefficients and jet damping.
   - W. T. Thomson, "Introduction to Space Dynamics", Wiley 1961: the variable-mass
     angular-momentum balance (the dI/dt term of the jet damping).
   - S. Niskanen, "Development of an Open Source Model Rocket Simulation Software"
     (OpenRocket technical documentation), 2009: the body-lift extension
     C_N = K (A_plan / A_ref) sin^2(alpha) with K = 1.1 (after Galejs), at the planform
     centroid, used above small angles.

   Conventions:
   - Every axial station x is measured from the nose tip, positive aft, in metres.
   - The reference area is the body cross-section A_ref = pi d^2 / 4 and the reference
     length is the body diameter d. Normal-force slopes are per radian.
   - Fins are trapezoidal: root chord C_R, tip chord C_T, span s (root to tip, one fin),
     leading-edge sweep distance X_R (axial distance from the root leading edge to the tip
     leading edge), and the root leading edge station X_B. n is the fin count. */

/** K for the body-lift term (STD: Galejs, as used by OpenRocket). Dimensionless. */
export const BODY_LIFT_K = 1.1;

/** CP of the nose as a fraction of its length (STD: Barrowman 1967, table of nose shapes). */
export const NOSE_CP_FRACTION = Object.freeze({ cone: 2 / 3, ogive: 0.466, parabolic: 0.5, haack: 0.437, power: 0.5 });

/** Nose normal-force slope per radian. Barrowman: 2 for any nose whose base diameter is the
    reference diameter (independent of shape). Scaled by (d_base / d_ref)^2 otherwise. */
export function noseCna(baseDiameter = 1, refDiameter = baseDiameter) {
  const r = baseDiameter / refDiameter;
  return 2 * r * r;
}

/** Nose CP from the tip, m. ogive: 0.466 L (STD). Unknown shapes fall back to the ogive. */
export function noseCp(shape, length) {
  const f = NOSE_CP_FRACTION[shape] ?? NOSE_CP_FRACTION.ogive;
  return f * length;
}

/** Length of the fin mid-chord line, m: from the root mid-chord to the tip mid-chord.
    l_m = sqrt(s^2 + (X_R + C_T/2 - C_R/2)^2). */
export function finMidChordLength({ root, tip, span, sweep }) {
  const dx = sweep + tip / 2 - root / 2;
  return Math.sqrt(span * span + dx * dx);
}

/** Barrowman fin-set normal-force slope per radian, with body interference.
      (C_Na)_f = K_fb * 4 n (s/d)^2 / (1 + sqrt(1 + (2 l_m / (C_R + C_T))^2))
      K_fb = 1 + R / (s + R),   R = body radius at the fins
    The 4 n (s/d)^2 form is Barrowman's for three or four fins. Returns zeros for a
    removed fin set (span or chords of zero). */
export function finCna(fins, refDiameter, bodyRadius = refDiameter / 2) {
  const { n, root, tip, span } = fins;
  if (!(n > 0) || !(span > 0) || !(root + tip > 0)) return { cna: 0, cnaNoInterference: 0, kfb: 1, midChord: 0 };
  const lm = finMidChordLength(fins);
  const ratio = (2 * lm) / (root + tip);
  const sd = span / refDiameter;
  const bare = (4 * n * sd * sd) / (1 + Math.sqrt(1 + ratio * ratio));
  const kfb = 1 + bodyRadius / (span + bodyRadius);
  return { cna: kfb * bare, cnaNoInterference: bare, kfb, midChord: lm };
}

/** Mean aerodynamic chord of a trapezoid, m, and the axial position of its leading edge
    behind the root leading edge, m.
      MAC = (2/3) (C_R + C_T - C_R C_T / (C_R + C_T))
      x_MAC_LE = (X_R / 3) (C_R + 2 C_T) / (C_R + C_T) */
export function finMac({ root, tip, sweep }) {
  const sum = root + tip;
  if (!(sum > 0)) return { mac: 0, xLe: 0 };
  return { mac: (2 / 3) * (sum - (root * tip) / sum), xLe: (sweep / 3) * (root + 2 * tip) / sum };
}

/** Fin-set CP from the nose tip, m: the quarter chord of the MAC.
      X_f = X_B + (X_R / 3)(C_R + 2 C_T)/(C_R + C_T) + (1/6)(C_R + C_T - C_R C_T / (C_R + C_T)) */
export function finCp(fins) {
  const { mac, xLe } = finMac(fins);
  return fins.rootLeadingEdgeFromNose + xLe + mac / 4;
}

/** Planform area of one fin, m^2. */
export function finArea({ root, tip, span }) { return 0.5 * (root + tip) * span; }

/** Tangent-ogive radius at station x from the tip, m (0 <= x <= L). */
export function ogiveRadius(x, length, radius) {
  const rho = (radius * radius + length * length) / (2 * radius);   // ogive radius of curvature, m
  const u = length - x;
  return Math.sqrt(Math.max(0, rho * rho - u * u)) + radius - rho;
}

/** Outer radius of the body at station x, m: tangent ogive, cylinder, then the screw cap
    (a short cylinder of smaller radius at the tail). Fins excluded. */
export function bodyRadiusAt(x, body) {
  const { length, diameter, noseLength, tailCapLength = 0, tailCapRadius = diameter / 2 } = body;
  const R = diameter / 2;
  if (x < 0 || x > length) return 0;
  if (x <= noseLength) return ogiveRadius(x, noseLength, R);
  if (x >= length - tailCapLength) return tailCapRadius;
  return R;
}

/** Body planform (side projection) area, m^2, and its centroid from the nose, m, by
    midpoint integration of 2 r(x) dx in 1 mm steps. */
export function bodyPlanform(body) {
  const N = Math.max(200, Math.round(body.length / 0.001));
  const dx = body.length / N;
  let area = 0, moment = 0;
  for (let i = 0; i < N; i++) {
    const x = (i + 0.5) * dx;
    const a = 2 * bodyRadiusAt(x, body) * dx;
    area += a; moment += a * x;
  }
  return { area, centroid: area > 0 ? moment / area : body.length / 2 };
}

/** Body-lift normal-force coefficient (STD, OpenRocket after Galejs), signed with alpha:
      C_N,body = K (A_plan / A_ref) sin^2(alpha) sgn(alpha). Zero slope at alpha = 0, so the
    classic Barrowman result is unchanged at small angles. */
export function bodyLiftCn(alpha, planformArea, refArea) {
  const s = Math.sin(alpha);
  return BODY_LIFT_K * (planformArea / refArea) * s * s * Math.sign(alpha);
}

/** Aerodynamic pitch-damping coefficient (Mandell): sum over the lifting components of
    C_Na,i (x_i - x_cg)^2 / L_ref^2. Dimensionless. The damping moment is then
    M = -(1/2) rho V A_ref L_ref^2 C_mq omega, in N m with omega in rad/s. */
export function dampingCmq(components, xcg, refLength) {
  let s = 0;
  for (const c of components) { const d = c.xcp - xcg; s += c.cna * d * d; }
  return s / (refLength * refLength);
}

/** Jet damping coefficient, N m s, for a body that loses mass through a nozzle.
      with xProp:     mdot [ (x_nozzle - x_cg)^2 - (x_prop - x_cg)^2 ]
      without xProp:  mdot (x_nozzle - x_cg)^2   (Mandell's form)
    The first term is the angular momentum the exhaust carries out through the nozzle exit
    (Mandell, Caporaso and Bengen 1973). The second is the dI/dt term of the variable-mass
    balance d(I omega)/dt = M - mdot (x_nozzle - x_cg)^2 omega: with the propellant a point
    mass at xProp, dI/dt = -mdot (x_prop - x_cg)^2 (the CG-shift terms cancel because
    m_dry (x_dry - x_cg) + m_p (x_prop - x_cg) = 0), so I d(omega)/dt = M - c2_jet omega with
    the difference above (W. T. Thomson, Introduction to Space Dynamics, Wiley 1961; RocketPy
    documentation, Equations of Motion v0, nozzle term). Positive while x_cg lies ahead of the
    midpoint of x_prop and x_nozzle, which holds for every CG the flight model accepts. */
export function jetDamping(mdot, xNozzle, xcg, xProp) {
  const d = xNozzle - xcg;
  if (!Number.isFinite(xProp)) return mdot * d * d;
  const e = xProp - xcg;
  return mdot * (d * d - e * e);
}

/** Whole-vehicle analysis at small angle: component slopes and stations, total C_Na, CP,
    planform for the body-lift term, reference area. `body` is
    {length, diameter, noseLength, noseShape, tailCapLength, tailCapRadius}; `fins` as above
    (pass null or a zero span for a finless vehicle). */
export function analyse(body, fins) {
  const d = body.diameter;
  const refArea = Math.PI * d * d / 4;
  const nose = { name: 'nose', cna: noseCna(d, d), xcp: noseCp(body.noseShape || 'ogive', body.noseLength) };
  const f = fins ? finCna(fins, d, d / 2) : { cna: 0, cnaNoInterference: 0, kfb: 1, midChord: 0 };
  const finSet = { name: 'fins', cna: f.cna, xcp: fins && f.cna > 0 ? finCp(fins) : 0, kfb: f.kfb, cnaNoInterference: f.cnaNoInterference, midChord: f.midChord };
  const components = finSet.cna > 0 ? [nose, finSet] : [nose];
  let cna = 0, m = 0;
  for (const c of components) { cna += c.cna; m += c.cna * c.xcp; }
  const planform = bodyPlanform(body);
  return {
    refArea, refLength: d, components, nose, fins: finSet,
    cna, xcp: cna > 0 ? m / cna : nose.xcp,
    planformArea: planform.area, planformCentroid: planform.centroid,
    finArea: fins ? finArea(fins) : 0, mac: fins ? finMac(fins).mac : 0,
  };
}

/** Static margin in calibres: (x_cp - x_cg) / d. */
export function staticMargin(xcp, xcg, diameter) { return (xcp - xcg) / diameter; }

/** Scale a fin planform about its root leading edge by k (k = 0 removes the fins). */
export function scaleFins(fins, k) {
  return { ...fins, root: fins.root * k, tip: fins.tip * k, span: fins.span * k, sweep: fins.sweep * k };
}
