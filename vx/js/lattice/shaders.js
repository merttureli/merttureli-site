/* GLSL ES 3.00 sources for the D2Q9 lattice Boltzmann engine (lattice.js).
   Every program is a RawShaderMaterial with glslVersion GLSL3, so each source
   carries its own precision statements and layout(location = n) outputs.

   Lattice (FIELD.md section 4; Chen and Doolen 1998, STD):
     velocities  e0 (0,0); e1..e4 (1,0) (0,1) (-1,0) (0,-1); e5..e8 (1,1) (-1,1) (-1,-1) (1,-1)
     weights     4/9, 1/9 x4, 1/36 x4; c_s^2 = 1/3 (lattice units: one cell, one step)
     equilibrium f_i^eq = w_i rho (1 + 3 e.u + 4.5 (e.u)^2 - 1.5 u.u)
   Storage: three RGBA textures per state
     T0 = (g0, g1, g2, g3)   T1 = (g4, g5, g6, g7)   T2 = (g8, Fx, Fy, Mz)
   with g_i = f_i - w_i, the deviation from the rest state, on both the float32 and the
   float16 path, and every step computed in that shifted form: rho - 1 is the sum of the
   g_i and f_i^eq - w_i = w_i ((rho - 1) + rho (3 e.u + 4.5 (e.u)^2 - 1.5 u.u)), so the
   small part that carries the flow keeps the full mantissa instead of being rounded
   against w_i and against rho = 1 (DDF shifting, Lehmann, Krause, Amati, Sega, Harting
   and Gekle 2022, Phys. Rev. E 106, 015308, STD). Validation (track L1, D4): storing and
   summing the full f_i in float32 biased a steady channel by 2.4e-5 of u_max at tau 0.6;
   a float32 port in the shifted form cut that to 3.3e-6.
   The spare channels of T2 carry the momentum-exchange force of the cell's
   wall links, summed over the steps since the last reduction (float32 path) or
   for the last step only (float16 path).

   Grid frame: +x from nose to tail (column 0 upstream), +y toward the body's +x
   side, cell centres at (i + 0.5, j + 0.5), row 0 at the bottom of the texture.
   Moments are positive in the flight convention (positive raises theta), which
   is minus the counter-clockwise moment in this frame (FIELD.md section 2). */

export const D2Q9 = {
  e: [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [-1, -1], [1, -1]],
  w: [4 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 36, 1 / 36, 1 / 36, 1 / 36],
  opp: [0, 3, 4, 1, 2, 7, 8, 5, 6],
};
/* What the state textures hold: f_i - w_i (validation readers add w_i back). */
export const STORAGE = 'f - w';
/* texture and channel holding population k */
const SLOT = [['tF0', 'x'], ['tF0', 'y'], ['tF0', 'z'], ['tF0', 'w'], ['tF1', 'x'], ['tF1', 'y'], ['tF1', 'z'], ['tF1', 'w'], ['tF2', 'x']];

const HEAD = /* glsl */`precision highp float;
precision highp int;
precision highp sampler2D;
`;

/* One triangle that covers the viewport; the vertex shader ignores the camera. */
export const VERT = /* glsl */`${HEAD}
in vec3 position;
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

/* Constants shared by the lattice programs. */
const LATTICE_COMMON = /* glsl */`
const ivec2 E[9] = ivec2[9](ivec2(0, 0), ivec2(1, 0), ivec2(0, 1), ivec2(-1, 0), ivec2(0, -1), ivec2(1, 1), ivec2(-1, 1), ivec2(-1, -1), ivec2(1, -1));
const float W[9] = float[9](4.0 / 9.0, 1.0 / 9.0, 1.0 / 9.0, 1.0 / 9.0, 1.0 / 9.0, 1.0 / 36.0, 1.0 / 36.0, 1.0 / 36.0, 1.0 / 36.0);
const int OPP[9] = int[9](${D2Q9.opp.join(', ')});
/* f_i^eq - w_i at density 1 + dr and velocity u (FIELD.md section 4, shifted form) */
float feqS(int i, float dr, vec2 u) {
  float eu = dot(vec2(E[i]), u);
  return W[i] * (dr + (1.0 + dr) * (3.0 * eu + 4.5 * eu * eu - 1.5 * dot(u, u)));
}
/* second-order Hermite reconstruction 4.5 w_i Q_iab P_ab, Q_iab = e_ia e_ib - delta_ab / 3 */
float hermite2(int i, float pxx, float pxy, float pyy) {
  vec2 e = vec2(E[i]);
  return 4.5 * W[i] * ((e.x * e.x - 1.0 / 3.0) * pxx + 2.0 * e.x * e.y * pxy + (e.y * e.y - 1.0 / 3.0) * pyy);
}
`;

/* ------------------------------------------------------------------ init */
/* Writes the equilibrium at rho 1: the free stream in fluid cells (an impulsive start,
   the tunnel already running when the model goes in), rest inside the solid. In the body
   frame (uFrame 1, see STEP_FRAG) the free stream carries the frame's rotation, u_in -
   Omega x (r - r_cg). Force channels zero. */
export const INIT_FRAG = /* glsl */`${HEAD}
uniform sampler2D tCell;
uniform vec2 uU;
uniform float uOmega;
uniform vec2 uCg;
uniform float uFrame;
layout(location = 0) out vec4 o0;
layout(location = 1) out vec4 o1;
layout(location = 2) out vec4 o2;
${LATTICE_COMMON}
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec2 r = vec2(p) + 0.5 - uCg;
  vec2 u = texelFetch(tCell, p, 0).r > 0.5 ? vec2(0.0) : uU + uFrame * uOmega * vec2(r.y, -r.x);
  o0 = vec4(feqS(0, 0.0, u), feqS(1, 0.0, u), feqS(2, 0.0, u), feqS(3, 0.0, u));
  o1 = vec4(feqS(4, 0.0, u), feqS(5, 0.0, u), feqS(6, 0.0, u), feqS(7, 0.0, u));
  o2 = vec4(feqS(8, 0.0, u), 0.0, 0.0, 0.0);
}
`;

/* ------------------------------------------------------------------ step */
/* One lattice step, single pull pass: gather, bounce-back, collide, write.

   Gather: f_k(x, t+1) = f*_k(x - e_k, t), with f* the stored post-collision state.
   Body rate, two modes (uFrame, set by lattice.js setBodyRate):
     body frame (uFrame = 1, the default): the grid moves and turns with the body, so the
     walls are at rest and the motion enters as it does for any non-inertial frame: the
     outer edges see the free stream u_in - Omega x (r - r_cg), and every fluid cell feels
     the Coriolis, centrifugal and Euler accelerations and the frame's own acceleration,
     F / rho = -2 Omega x u - Omega x (Omega x r) - dOmega/dt x r - a_cg, with
     -a_cg = du_in/dt + Omega x u_in in body axes (u_in is minus the body's velocity; uAccel,
     from the slewed inflow, lattice.js). The last term is what keeps the far field
     consistent: with alpha held while the body turns (a steady pull-up, the definition of
     a pitch-rate derivative) the path curves and the frame accelerates sideways, while a
     body that turns on a straight path sees alpha change at minus its rate and the term
     vanishes. All of it is added with the forcing of Guo, Zheng and Shi 2002 (STD,
     Phys. Rev. E 65, 046308): u = (sum e f + F / 2) / rho (solved exactly for the
     Coriolis part, which depends on u) and a source (1 - 1 / (2 tau)) w_i [3 (e_i - u) +
     9 (e_i . u) e_i] . F after the collision. This is the only correct form for a body
     that turns as a whole (a pitching section): validation track L3 (section 3, defect 1)
     measured that a moving-wall velocity normal to a static wall acts as transpiration
     (it injects mass on one face and removes it on the other) and gave 2.0 to 2.5 times
     the physical force.
     moving wall (uFrame = 0): the walls move at u_w = omega x (r_w - r_cg) on a static
     mask (Ladd 1994, STD); exact only where that velocity is tangent to the wall, which
     is the case for a spinning cylinder (Magnus), and kept for it.
   Wall links: when x - e_k is solid, the population that left x toward the wall as
   direction opp(k) returns halfway through the step as
       f_k(x, t+1) = f*_opp(k)(x, t) + 2 w_k rho_w (e_k . u_w) / c_s^2,
   u_w = omega x (r_w - r_cg) at the halfway point r_w = x + 0.5 - 0.5 e_k in the moving-wall
   mode and 0 in the body frame, rho_w the local density. Momentum exchange on that link
   with the Galilean correction of Wen, Zhang, Tu, Wang and Fang (2014, STD):
       F = (e_opp - u_w) f*_opp - (e_k - u_w) f_k(x, t+1)
   and its moment about r_cg in the flight convention, M = -(r x F)_z.
   Collide: BGK with Smagorinsky (Hou, Sterling, Chen and Doolen 1996, STD)
       Pi_ab = sum_i e_ia e_ib (f_i - f_i^eq),  Q = sqrt(2 Pi:Pi),
       tau = 0.5 (tau0 + sqrt(tau0^2 + 18 C^2 Q / rho)),  f* = f - (f - f^eq) / tau.
   With uReg = 1 the non-equilibrium part is first projected on its Hermite moments up
   to second order (Latt and Chopard 2006, STD): f_neq,i = 4.5 w_i Q_iab Pi_ab with
   Q_iab = e_ia e_ib - delta_ab / 3, plus 3 w_i e_i . (-F / 2) when a body force acts
   (the first moment the forcing leaves in f - f^eq), which drops the ghost modes that
   blow up as tau approaches 0.5.
   Absorbing layer (uSpongeW > 0): within uSpongeW cells of an outer edge tau
   rises quadratically to uSpongeTau, which damps the waves and the shear layer
   an edge condition throws back into the domain (EST).
   Positivity (uPositive = 1): the relaxation factor is limited so that every
   post-collision population stays non-negative, f* = f_eq + k n with |k| cut to
   min f_eq,i / |n_i| over the offending directions (the positivity rule of
   Brownlee, Gorban and Levesley 2007, STD). Acts only where a population would
   go negative, which is where an instability starts.
   Local speed floor (uMachK > 0): tau >= 0.5 + K max(0, |u| - U), a viscosity
   that rises only where the local lattice Mach number |u| / c_s passes U / c_s,
   which happens at a sharp nose or fin tip at incidence. Conserves mass and
   momentum (it only changes the relaxation rate); EST, see lattice.js.
   Outer edges: a cell on an edge where the free stream (at that cell, in the body
   frame) enters is set to the equilibrium at rho 1 and that velocity (uInflowNeq = 0,
   the default); any other edge cell takes the velocity of its inward neighbour
   (zero-gradient outflow, Guo, Zheng and Shi 2002, STD) with the density held at 1 and
   any inward (backflow) normal velocity removed, plus the neighbour's non-equilibrium
   part projected on its second-order Hermite moment (the regularised extrapolation of
   Latt, Chopard, Malaspinas, Deville and Michler 2008, Phys. Rev. E 77, 056703, STD).
   The plain copy of the neighbour's non-equilibrium part that was here before carried
   its ghost modes across the edge and was unstable next to cells relaxing at tau near
   1/2: validation track L1 (defect D1) measured a plain BGK channel at tau 0.505 (Re 10,
   Ma 0.002) going chaotic from the outflow edge after about 5,000 steps, steady once the
   copy is projected. With uInflowNeq = 1 an inflow cell takes u_in with the neighbour's
   density and the same projected non-equilibrium part instead, which removes the
   one-cell density jump an inflow edge carries at incidence but, in a domain this short
   across the flow, lets the windward half pressurise further (lattice.js header, EDGES).
   A plain copy of the neighbour's density let mass pile up once a lifting section's
   vortices crossed the outflow edges (domain rho - 1 reached 0.2 within 10,000
   steps with the rocket at 4 degrees); holding rho there anchors the pressure.
   Any alpha in +-35 degrees works. */
function stepFrag() {
  /* Generated as straight-line scalar code (no arrays passed to functions),
     which keeps the populations in registers on every compiler, SwiftShader's
     included. Constants per direction come from D2Q9 above. Every population
     variable holds f - w (see the storage note at the top). */
  const { e: E, opp: OPP } = D2Q9;
  const W = (k) => (k === 0 ? 'W0' : k < 5 ? 'W1' : 'W5');
  const num = (v) => (v < 0 ? `(${v.toFixed(1)})` : v.toFixed(1));
  const ev = (k) => `vec2(${num(E[k][0])}, ${num(E[k][1])})`;
  const dot = (k, a) => {
    const t = [];
    if (E[k][0]) t.push(`${E[k][0] < 0 ? '-' : ''}${a}.x`);
    if (E[k][1]) t.push(`${E[k][1] < 0 ? '-' : ''}${a}.y`);
    return t.length ? t.join(' + ').replace('+ -', '- ') : '0.0';
  };
  const ks = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  const lines = [];
  for (let k = 1; k <= 8; k++) {
    const [tex, ch] = SLOT[k];
    const o = OPP[k];
    lines.push(`  float f${k};
  if ((bits & ${1 << (k - 1)}) != 0) {
    vec2 d = pc - 0.5 * ${ev(k)};
    vec2 uw = omW * vec2(-d.y, d.x);
    f${k} = s${o} + 6.0 * ${W(k)} * rhoW * (${dot(k, 'uw')});
    vec2 Fl = (-${ev(k)} - uw) * (s${o} + ${W(k)}) - (${ev(k)} - uw) * (f${k} + ${W(k)});
    F += Fl;
    M += d.y * Fl.x - d.x * Fl.y;
  } else {
    f${k} = texelFetch(${tex}, p - ivec2(${E[k][0]}, ${E[k][1]}), 0).${ch};
  }`);
  }
  /* shifted equilibrium q_k = f_k^eq - w_k */
  const eq = ks.map((k) => (k === 0
    ? `  float q0 = W0 * (dr - rho * usq);`
    : `  float eu${k} = ${dot(k, 'u')};\n  float q${k} = ${W(k)} * (dr + rho * (3.0 * eu${k} + 4.5 * eu${k} * eu${k} - usq));`)).join('\n');
  const neq = ks.map((k) => `  float n${k} = f${k} - q${k};`).join('\n');
  /* Hermite projection: Q_iab Pi_ab with Q_iab = e_ia e_ib - delta_ab / 3, plus the first moment -F / 2 */
  const reg = ks.map((k) => {
    const [x, y] = E[k];
    return `    n${k} = 4.5 * ${W(k)} * (${num(x * x)} * pxx - pxx / 3.0 + ${num(2 * x * y)} * pxy + ${num(y * y)} * pyy - pyy / 3.0) - 1.5 * ${W(k)} * (${dot(k, 'Fb')});`;
  }).join('\n');
  /* Guo source w_k [3 (e_k - u) + 9 (e_k . u) e_k] . F (times 1 - 1 / (2 tau) below) */
  const src = ks.map((k) => (k === 0
    ? `    t0 = W0 * (-3.0 * dot(u, Fb));`
    : `    t${k} = ${W(k)} * (3.0 * (${dot(k, 'Fb')} - dot(u, Fb)) + 9.0 * eu${k} * (${dot(k, 'Fb')}));`)).join('\n');
  return /* glsl */`${HEAD}
uniform sampler2D tF0;
uniform sampler2D tF1;
uniform sampler2D tF2;
uniform sampler2D tCell;   /* r: 1 inside the solid; g: bit k-1 set when x - e_k is solid (x 1/255) */
uniform vec2 uU;           /* inflow velocity, lattice units */
uniform float uTau0;       /* molecular relaxation time, nu = (tau0 - 0.5) / 3 */
uniform float uC2;         /* Smagorinsky constant squared, C = 0.12 */
uniform float uOmega;      /* body angular velocity about +z of the grid (counter-clockwise), rad per step */
uniform float uOmegaDot;   /* its change over the last step, rad per step per step (body frame only) */
uniform float uFrame;      /* 1: body frame (walls at rest, rotating free stream, fictitious forces); 0: moving wall */
uniform vec2 uAccel;       /* body frame: minus the frame's acceleration, du_in/dt + Omega x u_in, per step per step */
uniform vec2 uCg;          /* rotation and moment centre, cells */
uniform float uAccum;      /* 1: add this step's link forces to the stored sum; 0: start a new sum */
uniform float uReg;        /* 1: regularised collision */
uniform float uMachU;      /* local speed above which the viscosity floor rises, lattice units */
uniform float uMachK;      /* slope of that floor, tau per lattice unit of speed (0: off) */
uniform float uSpongeW;    /* width of the absorbing layer along the outer edges, cells (0: off) */
uniform float uSpongeTau;  /* relaxation time at the edge itself */
uniform float uPositive;   /* 1: limit the relaxation so no population goes negative */
uniform float uInflowNeq;  /* 1: an inflow edge cell takes the neighbour's density and non-equilibrium part; 0: equilibrium at rho 1 */
layout(location = 0) out vec4 o0;
layout(location = 1) out vec4 o1;
layout(location = 2) out vec4 o2;
${LATTICE_COMMON}
const float W0 = 4.0 / 9.0;
const float W1 = 1.0 / 9.0;
const float W5 = 1.0 / 36.0;
const float EDGE_EPS = 1e-6;   /* lattice units; a freestream component smaller than this does not count as inflow */

void writeEq(vec2 u) {
  o0 = vec4(feqS(0, 0.0, u), feqS(1, 0.0, u), feqS(2, 0.0, u), feqS(3, 0.0, u));
  o1 = vec4(feqS(4, 0.0, u), feqS(5, 0.0, u), feqS(6, 0.0, u), feqS(7, 0.0, u));
  o2 = vec4(feqS(8, 0.0, u), 0.0, 0.0, 0.0);
}

void main() {
  ivec2 size = textureSize(tCell, 0);
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec2 pc = vec2(p) + 0.5 - uCg;
  float omF = uFrame * uOmega;            /* rotation of the frame (body frame) */
  float omW = uOmega - omF;               /* rotation of the walls (moving-wall mode) */
  float omD = uFrame * uOmegaDot;
  vec2 acc = uFrame * uAccel;
  bool x0 = p.x == 0, x1 = p.x == size.x - 1, y0 = p.y == 0, y1 = p.y == size.y - 1;
  if (x0 || x1 || y0 || y1) {
    vec2 uf = uU + omF * vec2(pc.y, -pc.x);   /* the free stream at this cell, u_in - Omega x r */
    bool inflow = (x0 && uf.x > EDGE_EPS) || (x1 && uf.x < -EDGE_EPS) || (y0 && uf.y > EDGE_EPS) || (y1 && uf.y < -EDGE_EPS);
    if (inflow && uInflowNeq < 0.5) { writeEq(uf); return; }
    /* density, velocity and non-equilibrium part of the inward neighbour (clamped into
       the texture, so grids one or two cells wide stay finite) */
    ivec2 inward = ivec2(x0 ? 1 : x1 ? -1 : 0, y0 ? 1 : y1 ? -1 : 0);
    ivec2 q = clamp(p + inward, ivec2(0), size - 1);
    vec4 b0 = texelFetch(tF0, q, 0);
    vec4 b1 = texelFetch(tF1, q, 0);
    float b8 = texelFetch(tF2, q, 0).x;
    float dn = b0.x + b0.y + b0.z + b0.w + b1.x + b1.y + b1.z + b1.w + b8;
    vec2 un = vec2(b0.y - b0.w + b1.y - b1.z - b1.w + b8, b0.z - b1.x + b1.y + b1.z - b1.w - b8) / (1.0 + dn);
    vec2 ue = un;
    float de = 0.0;
    if (inflow) {
      /* inflow with uInflowNeq = 1: u_in at the neighbour's density (Guo, Zheng and Shi 2002) */
      ue = uf; de = dn;
    } else {
      /* outflow: the neighbour's velocity (zero gradient) at the freestream density 1; a
         velocity that points back into the domain loses its inward normal part (backflow
         through an open edge is what blows such edges up) */
      if (inward.x != 0 && un.x * float(inward.x) > 0.0) ue.x = 0.0;
      if (inward.y != 0 && un.y * float(inward.y) > 0.0) ue.y = 0.0;
    }
    /* the neighbour's non-equilibrium stress, carried over as its Hermite projection */
    float m1 = b0.y - feqS(1, dn, un), m2 = b0.z - feqS(2, dn, un), m3 = b0.w - feqS(3, dn, un), m4 = b1.x - feqS(4, dn, un);
    float m5 = b1.y - feqS(5, dn, un), m6 = b1.z - feqS(6, dn, un), m7 = b1.w - feqS(7, dn, un), m8 = b8 - feqS(8, dn, un);
    float pxx = m1 + m3 + m5 + m6 + m7 + m8;
    float pyy = m2 + m4 + m5 + m6 + m7 + m8;
    float pxy = m5 - m6 + m7 - m8;
    o0 = vec4(feqS(0, de, ue) + hermite2(0, pxx, pxy, pyy), feqS(1, de, ue) + hermite2(1, pxx, pxy, pyy), feqS(2, de, ue) + hermite2(2, pxx, pxy, pyy), feqS(3, de, ue) + hermite2(3, pxx, pxy, pyy));
    o1 = vec4(feqS(4, de, ue) + hermite2(4, pxx, pxy, pyy), feqS(5, de, ue) + hermite2(5, pxx, pxy, pyy), feqS(6, de, ue) + hermite2(6, pxx, pxy, pyy), feqS(7, de, ue) + hermite2(7, pxx, pxy, pyy));
    o2 = vec4(feqS(8, de, ue) + hermite2(8, pxx, pxy, pyy), 0.0, 0.0, 0.0);
    return;
  }
  vec4 cell = texelFetch(tCell, p, 0);
  if (cell.r > 0.5) { writeEq(vec2(0.0)); return; }

  vec4 a0 = texelFetch(tF0, p, 0);
  vec4 a1 = texelFetch(tF1, p, 0);
  vec4 a2 = texelFetch(tF2, p, 0);
  float s0 = a0.x, s1 = a0.y, s2 = a0.z, s3 = a0.w, s4 = a1.x, s5 = a1.y, s6 = a1.z, s7 = a1.w, s8 = a2.x;
  float rhoW = 1.0 + (s0 + s1 + s2 + s3 + s4 + s5 + s6 + s7 + s8);
  int bits = int(cell.g * 255.0 + 0.5);
  vec2 F = vec2(0.0);
  float M = 0.0;
  float f0 = s0;
${lines.join('\n')}

  float dr = f0 + f1 + f2 + f3 + f4 + f5 + f6 + f7 + f8;
  float rho = 1.0 + dr;
  vec2 u = vec2(f1 - f3 + f5 - f6 - f7 + f8, f2 - f4 + f5 + f6 - f7 - f8) / rho;
  vec2 Fb = vec2(0.0);
  bool forced = omF != 0.0 || omD != 0.0 || acc != vec2(0.0);
  if (forced) {
    /* fictitious forces of the body frame: F / rho = 2 Omega (u_y, -u_x) + Omega^2 r + dOmega/dt (r_y, -r_x) - a_cg,
       with u = (j + F / 2) / rho solved exactly for the Coriolis term */
    vec2 g = omF * omF * pc + omD * vec2(pc.y, -pc.x) + acc;
    vec2 a = u + 0.5 * g;
    u = vec2(a.x + omF * a.y, a.y - omF * a.x) / (1.0 + omF * omF);
    Fb = rho * (2.0 * omF * vec2(u.y, -u.x) + g);
  }
  float usq = 1.5 * dot(u, u);
${eq}
${neq}
  float pxx = n1 + n3 + n5 + n6 + n7 + n8;
  float pyy = n2 + n4 + n5 + n6 + n7 + n8;
  float pxy = n5 - n6 + n7 - n8;
  float Q = sqrt(2.0 * (pxx * pxx + pyy * pyy + 2.0 * pxy * pxy));
  float tau = 0.5 * (uTau0 + sqrt(uTau0 * uTau0 + 18.0 * uC2 * Q / rho));
  tau = max(tau, 0.5 + uMachK * max(0.0, length(u) - uMachU));
  if (uSpongeW > 0.0) {
    float d = min(min(float(p.x), float(size.x - 1 - p.x)), min(float(p.y), float(size.y - 1 - p.y)));
    float sp = max(0.0, 1.0 - d / uSpongeW);
    tau = max(tau, 0.5 + (uSpongeTau - 0.5) * sp * sp);
  }
  float keep = 1.0 - 1.0 / tau;
  if (uReg > 0.5) {
${reg}
  }
  float t0 = 0.0, t1 = 0.0, t2 = 0.0, t3 = 0.0, t4 = 0.0, t5 = 0.0, t6 = 0.0, t7 = 0.0, t8 = 0.0;
  if (forced) {
${src}
    float kf = 1.0 - 0.5 / tau;
    t0 *= kf; t1 *= kf; t2 *= kf; t3 *= kf; t4 *= kf; t5 *= kf; t6 *= kf; t7 *= kf; t8 *= kf;
  }
  if (uPositive > 0.5) {
    float lim = abs(keep);
${ks.map((k) => `    float c${k} = q${k} + ${W(k)} + t${k};\n    if (keep * n${k} < -c${k}) lim = min(lim, max(c${k}, 0.0) / abs(n${k}));`).join('\n')}
    keep = sign(keep) * lim;
  }
  o0 = vec4(q0 + keep * n0 + t0, q1 + keep * n1 + t1, q2 + keep * n2 + t2, q3 + keep * n3 + t3);
  o1 = vec4(q4 + keep * n4 + t4, q5 + keep * n5 + t5, q6 + keep * n6 + t6, q7 + keep * n7 + t7);
  o2 = vec4(q8 + keep * n8 + t8, (uAccum > 0.5 ? a2.yzw : vec3(0.0)) + vec3(F, M));
}
`;
}
export const STEP_FRAG = stepFrag();

/* ----------------------------------------------------------------- macro */
/* Velocity, density deviation and vorticity at grid resolution, once per
   frame: (ux, uy, rho - 1, omega) with omega = d(uy)/dx - d(ux)/dy (counter-
   clockwise positive in the grid), central differences, one-sided at edges.
   A solid cell reports the wall velocity at its centre (zero in the body frame) and
   rho 1, so the vorticity next to the wall sees the no-slip condition. In the body frame
   the velocity is relative to the turning body and the vorticity is the absolute one
   (the frame's 2 Omega added back), so a section turning in still air shows none. */
export const MACRO_FRAG = /* glsl */`${HEAD}
uniform sampler2D tF0;
uniform sampler2D tF1;
uniform sampler2D tF2;
uniform sampler2D tCell;
uniform float uOmega;
uniform float uFrame;
uniform vec2 uCg;
layout(location = 0) out vec4 o;
${LATTICE_COMMON}
vec3 moments(ivec2 q) {
  if (texelFetch(tCell, q, 0).r > 0.5) {
    vec2 d = vec2(q) + 0.5 - uCg;
    return vec3((1.0 - uFrame) * uOmega * vec2(-d.y, d.x), 0.0);
  }
  vec4 a = texelFetch(tF0, q, 0);
  vec4 b = texelFetch(tF1, q, 0);
  float c = texelFetch(tF2, q, 0).x;
  float dr = a.x + a.y + a.z + a.w + b.x + b.y + b.z + b.w + c;
  vec2 m = vec2(a.y - a.w + b.y - b.z - b.w + c, a.z - b.x + b.y + b.z - b.w - c);
  return vec3(m / (1.0 + dr), dr);
}
void main() {
  ivec2 size = textureSize(tCell, 0);
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec3 c = moments(p);
  ivec2 xm = ivec2(max(p.x - 1, 0), p.y), xp = ivec2(min(p.x + 1, size.x - 1), p.y);
  ivec2 ym = ivec2(p.x, max(p.y - 1, 0)), yp = ivec2(p.x, min(p.y + 1, size.y - 1));
  float dvdx = (moments(xp).y - moments(xm).y) / float(xp.x - xm.x);
  float dudy = (moments(yp).x - moments(ym).x) / float(yp.y - ym.y);
  o = vec4(c.xy, c.z, dvdx - dudy + 2.0 * uFrame * uOmega);
}
`;

/* ------------------------------------------------------------------- dye */
/* Smoke at dye resolution (uScale dye pixels per cell): semi-Lagrangian
   advection on the lattice velocity with a midpoint (RK2) backtrace over the
   uSteps lattice steps since the last dye update. A backtrace that leaves the
   domain through an inflow edge picks up fresh smoke from the rake, which lies
   along the inflow direction everywhere upstream, so the lines enter through
   every inflow edge at any alpha. R: rake smoke; G: dye released from the wall cells (shows the
   boundary layer and the wake). Decay per update in uDecay. */
export const DYE_FRAG = /* glsl */`${HEAD}
uniform sampler2D tDye;
uniform sampler2D tMacro;
uniform sampler2D tCell;
uniform vec2 uGrid;        /* cols, rows */
uniform float uScale;      /* dye pixels per cell */
uniform float uSteps;      /* lattice steps to advect over */
uniform vec2 uDecay;       /* multiplicative decay of (rake, wall) dye for this update */
uniform vec2 uFlow;        /* (cos alpha, sin alpha) */
uniform float uSpacing;    /* rake line spacing across the flow, cells */
uniform float uWidth;      /* rake line half width, cells */
uniform float uWallDye;    /* level the wall cells hold */
uniform float uInit;       /* 1: write the initial streaklines */
layout(location = 0) out vec4 o;
float rake(vec2 q) {
  vec2 n = vec2(-uFlow.y, uFlow.x);
  float s = dot(q - 0.5 * uGrid, n) / uSpacing;
  float d = abs(fract(s + 0.5) - 0.5) * uSpacing;
  return 1.0 - smoothstep(0.3 * uWidth, uWidth, d);
}
void main() {
  vec2 q = gl_FragCoord.xy / uScale;
  vec4 cell = texelFetch(tCell, ivec2(q), 0);
  if (cell.r > 0.5) { o = vec4(0.0, 0.0, 0.0, 1.0); return; }
  if (uInit > 0.5) { o = vec4(rake(q), 0.0, 0.0, 1.0); return; }
  vec2 v1 = texture(tMacro, q / uGrid).xy;
  vec2 v2 = texture(tMacro, (q - 0.5 * uSteps * v1) / uGrid).xy;
  vec2 b = q - uSteps * v2;
  /* a backtrace that leaves through an edge where the freestream enters picks up
     rake smoke; one that leaves through an outflow edge reads the edge value
     (zero gradient, like the lattice boundary there) */
  bool fresh = (b.x < 0.5 && uFlow.x > 1e-4) || (b.x > uGrid.x - 0.5 && uFlow.x < -1e-4)
            || (b.y < 0.5 && uFlow.y > 1e-4) || (b.y > uGrid.y - 0.5 && uFlow.y < -1e-4);
  vec2 d = fresh ? vec2(rake(b), 0.0) : texture(tDye, b / uGrid).rg * uDecay;
  if (cell.g > 0.0) d.g = max(d.g, uWallDye);
  o = vec4(d, 0.0, 1.0);
}
`;

/* ------------------------------------------------------------- composite */
/* The four views into an RGBA8 texture at dye resolution, display-referred
   sRGB values, alpha 0 inside the solid (from the linearly filtered mask so
   the edge is smooth at the dye resolution). Ramps use the site's tokens:
   ink-900 #0A0A0A, ink-800 #141414, ink-600 #454545, paper #FFFFFF, livery #D63B08.
     smoke     rake smoke in paper over ink, wall dye in the livery orange
     pressure  C_p = (rho - 1) c_s^2 / (0.5 u_in^2); suction toward paper, positive
               toward the livery orange, isobars every 0.1
     vorticity omega D / u_in; counter-clockwise (grid) orange, clockwise paper
     speed     |u| / u_in from ink to paper, isotachs every 0.1
   Every view draws an ink-900 rim on the fluid side of the wall, about 0.06 D wide
   (one to three cells), from the cell texture's b channel (rim coverage, built with
   the mask in lattice.js, linearly filtered like it): the positive end of the
   pressure and vorticity ramps is the livery orange of the rocket body itself, and
   the suction end is the paper of its nose, so without the rim the body's outline
   would dissolve into the field it sits in. */
export const COMPOSITE_FRAG = /* glsl */`${HEAD}
uniform sampler2D tMacro;
uniform sampler2D tDye;
uniform sampler2D tCell;
uniform vec2 uGrid;
uniform vec2 uOut;         /* output size, pixels */
uniform int uView;         /* 0 smoke, 1 pressure, 2 vorticity, 3 speed */
uniform float uUin;        /* inflow speed, lattice units */
uniform float uD;          /* reference length, cells */
layout(location = 0) out vec4 o;
const vec3 INK900 = vec3(0.039, 0.039, 0.039);
const vec3 INK800 = vec3(0.078, 0.078, 0.078);
const vec3 INK600 = vec3(0.271, 0.271, 0.271);
const vec3 PAPER = vec3(1.0);
const vec3 LIVERY = vec3(0.839, 0.231, 0.031);
float contour(float v, float step) {
  float w = fwidth(v / step);
  float d = abs(fract(v / step + 0.5) - 0.5);
  return 1.0 - smoothstep(0.0, 1.5 * w, d);
}
/* compresses |v| into 0..1 with e-fold s */
float soft(float v, float s) { return 1.0 - exp(-abs(v) / s); }
void main() {
  vec2 uv = gl_FragCoord.xy / uOut;
  vec4 cell = texture(tCell, uv);
  float solid = cell.r;
  float alpha = 1.0 - smoothstep(0.3, 0.7, solid);
  float rim = smoothstep(0.25, 0.75, cell.b) * alpha;
  vec4 m = texture(tMacro, uv);
  float u0 = max(uUin, 1e-4);
  vec3 col;
  if (uView == 0) {
    vec2 d = clamp(texture(tDye, uv).rg, 0.0, 1.0);
    col = mix(INK900, PAPER * 0.92, d.r * 0.9);
    col = mix(col, LIVERY, d.g * 0.85);
  } else if (uView == 1) {
    float cp = m.z / (1.5 * u0 * u0);            /* (rho - 1) / 3 over 0.5 u^2 */
    float t = soft(cp, 0.45);
    col = cp >= 0.0 ? mix(INK800, LIVERY, t) : mix(INK800, PAPER * 0.88, t);
    col = mix(col, cp >= 0.0 ? PAPER : INK900, 0.14 * contour(cp, 0.1));
  } else if (uView == 2) {
    float w = m.w * uD / u0;
    float t = soft(w, 1.6);
    col = w >= 0.0 ? mix(INK900, LIVERY, t) : mix(INK900, PAPER * 0.85, t);
  } else {
    float s = length(m.xy) / u0;
    float t = clamp(s / 1.5, 0.0, 1.0);
    col = mix(INK900, PAPER * 0.9, t * t * (3.0 - 2.0 * t));
    col = mix(col, INK600, 0.35 * contour(s, 0.1) * step(0.05, s));
  }
  col = mix(col, INK900, rim);
  o = vec4(col, alpha);
}
`;

/* ------------------------------------------------------------- reduction */
/* Level 0: per 2 x 2 block of cells, (Fx, Fy, Mz, wall links) from T2 and the
   link bits. Level n: 2 x 2 sums of the level below, bounds-checked so odd
   sizes reduce exactly. Ends at 1 x 1. uCount scales the count channel at every
   level: 1 on a float32 chain; 0.25 on a float16 chain (no float32 render
   targets), where a sum above 2,048 would lose exactness and one above 65,504
   would overflow, so the count is carried as a mean and multiplied back by
   4^levels on the CPU. The force sums stay sums (a mean would underflow). */
export const REDUCE0_FRAG = /* glsl */`${HEAD}
uniform sampler2D tF2;
uniform sampler2D tCell;
uniform float uCount;
layout(location = 0) out vec4 o;
int popcount8(int b) { int n = 0; for (int i = 0; i < 8; i++) n += (b >> i) & 1; return n; }
void main() {
  ivec2 size = textureSize(tCell, 0);
  ivec2 base = ivec2(gl_FragCoord.xy) * 2;
  vec4 acc = vec4(0.0);
  for (int j = 0; j < 2; j++) for (int i = 0; i < 2; i++) {
    ivec2 q = base + ivec2(i, j);
    if (q.x >= size.x || q.y >= size.y) continue;
    int bits = int(texelFetch(tCell, q, 0).g * 255.0 + 0.5);
    if (bits == 0) continue;
    acc += vec4(texelFetch(tF2, q, 0).yzw, float(popcount8(bits)));
  }
  o = vec4(acc.xyz, acc.w * uCount);
}
`;
export const REDUCE_FRAG = /* glsl */`${HEAD}
uniform sampler2D tSrc;
uniform float uCount;
layout(location = 0) out vec4 o;
void main() {
  ivec2 size = textureSize(tSrc, 0);
  ivec2 base = ivec2(gl_FragCoord.xy) * 2;
  vec4 acc = vec4(0.0);
  for (int j = 0; j < 2; j++) for (int i = 0; i < 2; i++) {
    ivec2 q = base + ivec2(i, j);
    if (q.x < size.x && q.y < size.y) acc += texelFetch(tSrc, q, 0);
  }
  o = vec4(acc.xyz, acc.w * uCount);
}
`;

/* -------------------------------------------------------------- probe */
/* Validation helper: per 2 x 2 block, the count of non-finite or out-of-range
   cells (rho outside 0.2..5, |u| above 0.5) and the max |u| and max |rho - 1|,
   reduced like the force (the two counts scaled by uCount, as there). Runs only on
   request (lattice.check()). */
export const PROBE0_FRAG = /* glsl */`${HEAD}
uniform sampler2D tF0;
uniform sampler2D tF1;
uniform sampler2D tF2;
uniform sampler2D tCell;
uniform float uCount;
layout(location = 0) out vec4 o;
${LATTICE_COMMON}
void main() {
  ivec2 size = textureSize(tCell, 0);
  ivec2 base = ivec2(gl_FragCoord.xy) * 2;
  vec4 acc = vec4(0.0);
  for (int j = 0; j < 2; j++) for (int i = 0; i < 2; i++) {
    ivec2 q = base + ivec2(i, j);
    if (q.x >= size.x || q.y >= size.y) continue;
    if (texelFetch(tCell, q, 0).r > 0.5) continue;
    vec4 a = texelFetch(tF0, q, 0);
    vec4 b = texelFetch(tF1, q, 0);
    float c = texelFetch(tF2, q, 0).x;
    float dr = a.x + a.y + a.z + a.w + b.x + b.y + b.z + b.w + c;
    float rho = 1.0 + dr;
    vec2 u = vec2(a.y - a.w + b.y - b.z - b.w + c, a.z - b.x + b.y + b.z - b.w - c) / rho;
    float speed = length(u);
    bool bad = !(rho > 0.2 && rho < 5.0 && speed < 0.5);   /* NaN fails every comparison */
    acc.x += bad ? 1.0 : 0.0;
    acc.y += 1.0;
    if (!bad) { acc.z = max(acc.z, speed); acc.w = max(acc.w, abs(dr)); }
  }
  o = vec4(acc.xy * uCount, acc.zw);
}
`;
/* x, y summed (scaled by uCount); z, w max */
export const PROBE_FRAG = /* glsl */`${HEAD}
uniform sampler2D tSrc;
uniform float uCount;
layout(location = 0) out vec4 o;
void main() {
  ivec2 size = textureSize(tSrc, 0);
  ivec2 base = ivec2(gl_FragCoord.xy) * 2;
  vec4 acc = vec4(0.0);
  for (int j = 0; j < 2; j++) for (int i = 0; i < 2; i++) {
    ivec2 q = base + ivec2(i, j);
    if (q.x >= size.x || q.y >= size.y) continue;
    vec4 v = texelFetch(tSrc, q, 0);
    acc.xy += v.xy;
    acc.zw = max(acc.zw, v.zw);
  }
  o = vec4(acc.xy * uCount, acc.zw);
}
`;

