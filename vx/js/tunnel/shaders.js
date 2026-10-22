/* GLSL for the wind tunnel (WebGL2, GLSL ES 3.00). Every fragment program is
   `#version + <defines> + PRELUDE + source`. Two storage paths share the sources:

     float   RG16F velocity, R16F/R32F scalars, RGBA16F dye (EXT_color_buffer_float
             or EXT_color_buffer_half_float present)
     PACKED  every velocity and scalar texture is RGBA8 with the value encoded in
             two (16 bit) or three (24 bit) channels; the dye is RGBA8 unorm as it
             only ever holds 0..1. Hardware filtering of packed bytes is meaningless,
             so the packed path samples with texelFetch and interpolates by hand.

   Grid. W x H cells, texel (i, j) covers the cell whose centre gl_FragCoord
   reports as (i + 0.5, j + 0.5). Velocity is staggered (MAC): texel (i, j).x is
   u on the cell's LEFT face at (i, j + 0.5), .y is v on its BOTTOM face at
   (i + 0.5, j). Divergence and the pressure gradient are then compact
   differences that compose into the same 5-point Laplacian the Jacobi kernel
   relaxes, so the projection really removes divergence instead of leaving the
   grid-scale (checkerboard) part behind as a collocated layout does.

   Units. Velocity in cells per second, DT = 1/60 s per step, so a back-trace
   moves `u * DT` cells. Pressure is the projection pseudo-pressure
   p = dt * p_physical / rho with h = 1, so `u -= grad p`. Grid y runs down the
   canvas; the composite flips it once when it writes to the screen.

   KIND_* defines pick the value type of a generic pass (splat, copy, fill):
   vec2 velocity, float scalar or vec4 dye. */

export const VERT = `#version 300 es
precision highp float;
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

export const PRELUDE = `
precision highp float;
precision highp int;
precision highp sampler2D;
in vec2 v_uv;
out vec4 fragColor;
const float DT = 1.0 / 60.0;                      /* s per solver step */

ivec2 clampCell(ivec2 p, ivec2 size) { return clamp(p, ivec2(0), size - 1); }

/* 24 bit fixed point in three unorm8 channels; the readback pass uses it on both
   paths, every scalar texture uses it on the packed path. */
vec3 pack24(float v) {
  v = floor(clamp(v, 0.0, 1.0) * 16777215.0 + 0.5);
  float hi = floor(v / 65536.0);
  float r = v - hi * 65536.0;
  float mid = floor(r / 256.0);
  return vec3(hi, mid, r - mid * 256.0) / 255.0;
}
float unpack24(vec3 c) { return dot(floor(c * 255.0 + 0.5), vec3(65536.0, 256.0, 1.0)) / 16777215.0; }

#ifdef PACKED
const float VEL_RANGE = 256.0;     /* cells/s, the 16 bit velocity encoding covers -256..256 */
const float SCALAR_RANGE = 4096.0; /* the 24 bit scalar encoding covers -4096..4096 */
vec2 pack16(float v) {
  v = floor(clamp(v, 0.0, 1.0) * 65535.0 + 0.5);
  float hi = floor(v / 256.0);
  return vec2(hi, v - hi * 256.0) / 255.0;
}
float unpack16(vec2 c) { return dot(floor(c * 255.0 + 0.5), vec2(256.0, 1.0)) / 65535.0; }
vec2 decVel(vec4 c) { return (vec2(unpack16(c.rg), unpack16(c.ba)) * 2.0 - 1.0) * VEL_RANGE; }
vec4 encVel(vec2 v) { v = v / VEL_RANGE * 0.5 + 0.5; return vec4(pack16(v.x), pack16(v.y)); }
float decS(vec4 c) { return (unpack24(c.rgb) * 2.0 - 1.0) * SCALAR_RANGE; }
vec4 encS(float s) { return vec4(pack24(s / SCALAR_RANGE * 0.5 + 0.5), 1.0); }
#define OUT_VEL(v) fragColor = encVel(v)
#define OUT_S(s) fragColor = encS(s)
vec2 fetchVel(sampler2D t, ivec2 p) { return decVel(texelFetch(t, p, 0)); }
float fetchS(sampler2D t, ivec2 p) { return decS(texelFetch(t, p, 0)); }
#else
#define OUT_VEL(v) fragColor = vec4(v, 0.0, 1.0)
#define OUT_S(s) fragColor = vec4(s, 0.0, 0.0, 1.0)
vec2 fetchVel(sampler2D t, ivec2 p) { return texelFetch(t, p, 0).xy; }
float fetchS(sampler2D t, ivec2 p) { return texelFetch(t, p, 0).x; }
#endif

/* Bilinear sample of the raw texel lattice at position x (texel centres at
   i + 0.5), clamped to the edge texels like CLAMP_TO_EDGE. The float path uses
   the hardware filter for velocity; scalars are always interpolated by hand so
   R32F needs no filtering. */
vec2 sampleVel(sampler2D t, vec2 x, vec2 size) {
#ifdef PACKED
  vec2 q = clamp(x - 0.5, vec2(0.0), size - 1.0);
  vec2 f = fract(q);
  ivec2 i = ivec2(floor(q));
  ivec2 m = ivec2(size) - 1;
  vec2 a = fetchVel(t, min(i, m));
  vec2 b = fetchVel(t, min(i + ivec2(1, 0), m));
  vec2 c = fetchVel(t, min(i + ivec2(0, 1), m));
  vec2 d = fetchVel(t, min(i + ivec2(1, 1), m));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
#else
  return texture(t, x / size).xy;
#endif
}
float sampleS(sampler2D t, vec2 x, vec2 size) {
  vec2 q = clamp(x - 0.5, vec2(0.0), size - 1.0);
  vec2 f = fract(q);
  ivec2 i = ivec2(floor(q));
  ivec2 m = ivec2(size) - 1;
  float a = fetchS(t, min(i, m));
  float b = fetchS(t, min(i + ivec2(1, 0), m));
  float c = fetchS(t, min(i + ivec2(0, 1), m));
  float d = fetchS(t, min(i + ivec2(1, 1), m));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
vec4 sampleDye(sampler2D t, vec2 x, vec2 size) { return texture(t, x / size); }

/* MAC lattice samplers: the u lattice sits half a texel left of the texel
   centres, the v lattice half a texel below them. */
float sampleU(sampler2D t, vec2 x, vec2 size) { return sampleVel(t, x + vec2(0.5, 0.0), size).x; }
float sampleV(sampler2D t, vec2 x, vec2 size) { return sampleVel(t, x + vec2(0.0, 0.5), size).y; }
vec2 sampleVelAt(sampler2D t, vec2 x, vec2 size) { return vec2(sampleU(t, x, size), sampleV(t, x, size)); }
/* Velocity at a cell centre: the mean of its two faces per component. */
vec2 cellVel(sampler2D t, ivec2 p, ivec2 sz) {
  vec2 c = fetchVel(t, p);
  float r = fetchVel(t, clampCell(p + ivec2(1, 0), sz)).x;
  float u = fetchVel(t, clampCell(p + ivec2(0, 1), sz)).y;
  return vec2(0.5 * (c.x + r), 0.5 * (c.y + u));
}

#if defined(KIND_VEL)
#define T vec2
#define FETCH(t, p) fetchVel(t, p)
#define SAMPLE(t, x, sz) sampleVelAt(t, x, sz)
#define OUT(v) OUT_VEL(v)
#define TOT(v) (v).xy
#elif defined(KIND_S)
#define T float
#define FETCH(t, p) fetchS(t, p)
#define SAMPLE(t, x, sz) sampleS(t, x, sz)
#define OUT(v) OUT_S(v)
#define TOT(v) (v).x
#elif defined(KIND_DYE)
#define T vec4
#define FETCH(t, p) texelFetch(t, p, 0)
#define SAMPLE(t, x, sz) sampleDye(t, x, sz)
#define OUT(v) fragColor = (v)
#define TOT(v) (v)
#endif
`;

/* Signed distance to the union of up to 12 shapes, in the caller's units.
   A: capsule (x1, y1, x2, y2) with B = (r, 0, 0, 0); box (cx, cy, hw, hh) with
   B = (cos a, sin a, 0, 1). Negative inside. */
export const SDF = `
uniform vec4 u_shapeA[12];
uniform vec4 u_shapeB[12];
uniform int u_count;
float sdf(vec2 x) {
  float d = 1.0e4;
  for (int i = 0; i < 12; i++) {
    if (i >= u_count) break;
    vec4 A = u_shapeA[i];
    vec4 B = u_shapeB[i];
    if (B.w < 0.5) {
      vec2 pa = x - A.xy, ba = A.zw - A.xy;
      float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1.0e-6), 0.0, 1.0);
      d = min(d, length(pa - ba * h) - B.x);
    } else {
      vec2 q = x - A.xy;
      q = vec2(B.x * q.x + B.y * q.y, -B.y * q.x + B.x * q.y);   /* into the box frame (rotate by -a) */
      q = abs(q) - A.zw;
      d = min(d, length(max(q, 0.0)) + min(max(q.x, q.y), 0.0));
    }
  }
  return d;
}`;

/* Obstacle tests. A face is closed when either cell it separates is solid. */
const SOLID = `
uniform sampler2D u_mask;
bool solid(ivec2 q) { return fetchS(u_mask, q) < 0.0; }
bool closedU(ivec2 p) { return solid(p) || (p.x > 0 && solid(p - ivec2(1, 0))); }
bool closedV(ivec2 p) { return solid(p) || (p.y > 0 && solid(p - ivec2(0, 1))); }
`;

/* Domain layout. Fluid cells are x = 0 .. W-2; the last column x = W-1 is a
   ghost whose stored u face is the OUTLET face of the last fluid cell. The left
   domain face carries the inflow; the bottom wall face has no normal flow; the
   top wall is the unstored face above the last row (see DIVERGENCE). At the
   start of a step the outlet face copies its upstream neighbour (convective
   outflow, used by the advection); the projection then corrects that face with
   the Dirichlet p = 0 mirror so the last fluid cell ends the step divergence
   free. `WALLS` is shared by the boundary and gradient passes. */
const WALLS = `
  if (p.x == 0) v = vec2(u_uInf, 0.0);
  if (p.y == 0) v.y = 0.0;
  if (p.x == sz.x - 1) v.y = 0.0;
`;
const OUTLET_COPY = `
  if (p.x == sz.x - 1) v.x = fetchVel(u_vel, p - ivec2(1, 0)).x;
`;

/* 1. Inflow, outflow, walls and the obstacle written into the velocity field. */
export const BOUNDARY = `
${SOLID}
uniform sampler2D u_vel;
uniform vec2 u_size;
uniform float u_uInf;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  ivec2 sz = ivec2(u_size);
  vec2 v = fetchVel(u_vel, p);
  if (closedU(p)) v.x = 0.0;
  if (closedV(p)) v.y = 0.0;
  ${OUTLET_COPY}
  ${WALLS}
  OUT_VEL(v);
}`;

/* 2a. Semi-Lagrangian advection of the staggered velocity: each face component
   is traced from its own lattice position with the full velocity there. Also
   the MacCormack forward estimate (decay 1). */
export const ADVECT_VEL = `
uniform sampler2D u_vel;
uniform sampler2D u_src;
uniform vec2 u_size;
uniform float u_decay;
uniform float u_uInf;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec2 x = gl_FragCoord.xy;
  vec2 pu = x - vec2(0.5, 0.0);                                          /* this texel's u face */
  vec2 pv = x - vec2(0.0, 0.5);                                          /* this texel's v face */
  vec2 own = fetchVel(u_vel, p);
  vec2 velU = vec2(own.x, sampleV(u_vel, pu, u_size));
  vec2 velV = vec2(sampleU(u_vel, pv, u_size), own.y);
  float nu = sampleU(u_src, pu - velU * DT, u_size);
  float nv = sampleV(u_src, pv - velV * DT, u_size);
  /* dissipation acts on the perturbation from the free stream, not on the
     velocity: a divergence-free field stays divergence-free and the uniform
     flow is an exact steady state, so no mass is created at the inlet */
  OUT_VEL(mix(vec2(u_uInf, 0.0), vec2(nu, nv), u_decay));
}`;

/* 2b. MacCormack correction for the staggered velocity:
   phi = phi_hat + 0.5 (phi_n - A_reverse(phi_hat)), each component limited to
   the min/max of the four lattice values around its back-traced point. */
export const MACCORMACK_VEL = `
uniform sampler2D u_vel;
uniform sampler2D u_src;
uniform sampler2D u_fwd;
uniform vec2 u_size;
uniform float u_decay;
uniform float u_uInf;
vec2 limits(sampler2D t, vec2 q, int comp) {
  q = clamp(q, vec2(0.0), u_size - 1.0);
  ivec2 i = ivec2(floor(q));
  ivec2 m = ivec2(u_size) - 1;
  float a = fetchVel(t, min(i, m))[comp];
  float b = fetchVel(t, min(i + ivec2(1, 0), m))[comp];
  float c = fetchVel(t, min(i + ivec2(0, 1), m))[comp];
  float d = fetchVel(t, min(i + ivec2(1, 1), m))[comp];
  return vec2(min(min(a, b), min(c, d)), max(max(a, b), max(c, d)));
}
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec2 x = gl_FragCoord.xy;
  vec2 pu = x - vec2(0.5, 0.0);
  vec2 pv = x - vec2(0.0, 0.5);
  vec2 own = fetchVel(u_vel, p);
  vec2 velU = vec2(own.x, sampleV(u_vel, pu, u_size));
  vec2 velV = vec2(sampleU(u_vel, pv, u_size), own.y);
  vec2 hatN1 = fetchVel(u_fwd, p);
  vec2 hatN = vec2(sampleU(u_fwd, pu + velU * DT, u_size), sampleV(u_fwd, pv + velV * DT, u_size));
  vec2 result = hatN1 + 0.5 * (fetchVel(u_src, p) - hatN);
  /* lattice-relative positions of the back-traced points: u lattice texel
     coordinates are x + 0.5 (then - 0.5 for the floor), v lattice y + 0.5 */
  vec2 lu = limits(u_src, (pu - velU * DT) - vec2(0.0, 0.5), 0);
  vec2 lv = limits(u_src, (pv - velV * DT) - vec2(0.5, 0.0), 1);
  result = vec2(clamp(result.x, lu.x, lu.y), clamp(result.y, lv.x, lv.y));
  OUT_VEL(mix(vec2(u_uInf, 0.0), result, u_decay));
}`;

/* 2c. Dye advection on the finer cell-centred grid; the velocity is sampled at
   the dye position on the staggered lattices. */
export const ADVECT_DYE = `
uniform sampler2D u_vel;
uniform sampler2D u_src;
uniform vec2 u_velSize;
uniform vec2 u_size;
uniform float u_decay;
void main() {
  vec2 x = gl_FragCoord.xy;
  vec2 ratio = u_size / u_velSize;                                       /* dye cells per velocity cell */
  vec2 v = sampleVelAt(u_vel, x / ratio, u_velSize) * ratio;             /* dye cells per second */
  fragColor = sampleDye(u_src, x - v * DT, u_size) * u_decay;
}`;
export const MACCORMACK_DYE = `
uniform sampler2D u_vel;
uniform sampler2D u_src;
uniform sampler2D u_fwd;
uniform vec2 u_velSize;
uniform vec2 u_size;
uniform float u_decay;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec2 x = gl_FragCoord.xy;
  vec2 ratio = u_size / u_velSize;
  vec2 v = sampleVelAt(u_vel, x / ratio, u_velSize) * ratio;
  vec2 back = x - v * DT;
  vec4 hatN1 = texelFetch(u_fwd, p, 0);
  vec4 hatN = sampleDye(u_fwd, x + v * DT, u_size);
  vec4 result = hatN1 + 0.5 * (texelFetch(u_src, p, 0) - hatN);
  vec2 q = clamp(back - 0.5, vec2(0.0), u_size - 1.0);
  ivec2 i = ivec2(floor(q));
  ivec2 m = ivec2(u_size) - 1;
  vec4 a = texelFetch(u_src, min(i, m), 0);
  vec4 b = texelFetch(u_src, min(i + ivec2(1, 0), m), 0);
  vec4 c = texelFetch(u_src, min(i + ivec2(0, 1), m), 0);
  vec4 d = texelFetch(u_src, min(i + ivec2(1, 1), m), 0);
  result = clamp(result, min(min(a, b), min(c, d)), max(max(a, b), max(c, d)));
  fragColor = result * u_decay;
}`;

/* 3. Vorticity omega = dv/dx - du/dy at cell centres, central differences of
   the cell-centred velocity, 1/s. */
export const CURL = `
uniform sampler2D u_vel;
uniform vec2 u_size;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  ivec2 sz = ivec2(u_size);
  vec2 L = cellVel(u_vel, clampCell(p - ivec2(1, 0), sz), sz);
  vec2 R = cellVel(u_vel, clampCell(p + ivec2(1, 0), sz), sz);
  vec2 B = cellVel(u_vel, clampCell(p - ivec2(0, 1), sz), sz);
  vec2 Tt = cellVel(u_vel, clampCell(p + ivec2(0, 1), sz), sz);
  OUT_S(0.5 * ((R.y - L.y) - (Tt.x - B.x)));
}`;

/* 4. Vorticity confinement (Fedkiw et al.): f = eps * h * (N x omega) with
   N = grad|omega| normalised and h = 1 cell, evaluated at cell centres and
   averaged onto each face from the two cells it separates. eps is the fraction
   of the local vorticity added as a velocity kick per 1/60 s step. */
export const VORTICITY = `
${SOLID}
uniform sampler2D u_vel;
uniform sampler2D u_curl;
uniform vec2 u_size;
uniform float u_eps;
vec2 force(ivec2 c, ivec2 sz) {
  float L = fetchS(u_curl, clampCell(c - ivec2(1, 0), sz));
  float R = fetchS(u_curl, clampCell(c + ivec2(1, 0), sz));
  float B = fetchS(u_curl, clampCell(c - ivec2(0, 1), sz));
  float Tt = fetchS(u_curl, clampCell(c + ivec2(0, 1), sz));
  float C = fetchS(u_curl, c);
  vec2 grad = 0.5 * vec2(abs(R) - abs(L), abs(Tt) - abs(B));
  vec2 N = grad / (length(grad) + 1.0e-5);
  return u_eps * C * vec2(N.y, -N.x);
}
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  ivec2 sz = ivec2(u_size);
  vec2 fc = force(p, sz);
  vec2 fl = force(clampCell(p - ivec2(1, 0), sz), sz);
  vec2 fb = force(clampCell(p - ivec2(0, 1), sz), sz);
  vec2 v = fetchVel(u_vel, p) + vec2(0.5 * (fc.x + fl.x), 0.5 * (fc.y + fb.y));
  if (closedU(p)) v.x = 0.0;
  if (closedV(p)) v.y = 0.0;
  OUT_VEL(v);
}`;

/* 5a. Gaussian velocity splat, each face weighted at its own position. */
export const SPLAT_VEL = `
uniform sampler2D u_src;
uniform vec2 u_point;
uniform float u_radius;
uniform vec4 u_value;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec2 du = gl_FragCoord.xy - vec2(0.5, 0.0) - u_point;
  vec2 dv = gl_FragCoord.xy - vec2(0.0, 0.5) - u_point;
  float gu = exp(-dot(du, du) / (u_radius * u_radius));
  float gv = exp(-dot(dv, dv) / (u_radius * u_radius));
  OUT_VEL(fetchVel(u_src, p) + vec2(u_value.x * gu, u_value.y * gv));
}`;
/* 5b. Gaussian splat for a cell-centred field (dye). KIND_DYE. */
export const SPLAT = `
uniform sampler2D u_src;
uniform vec2 u_point;
uniform float u_radius;
uniform vec4 u_value;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec2 d = gl_FragCoord.xy - u_point;
  float g = exp(-dot(d, d) / (u_radius * u_radius));
  OUT(FETCH(u_src, p) + TOT(u_value) * g);
}`;

/* 6. Divergence of the intermediate velocity, 1/s, compact on the faces. Faces
   touching the body are closed, the unstored top face is the wall, the ghost
   column carries none. */
export const DIVERGENCE = `
${SOLID}
uniform sampler2D u_vel;
uniform vec2 u_size;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  ivec2 sz = ivec2(u_size);
  vec2 C = fetchVel(u_vel, p);
  float uL = closedU(p) ? 0.0 : C.x;
  float vB = closedV(p) ? 0.0 : C.y;
  ivec2 pr = p + ivec2(1, 0), pt = p + ivec2(0, 1);
  float uR = (p.x < sz.x - 1) ? (closedU(pr) ? 0.0 : fetchVel(u_vel, pr).x) : uL;
  float vT = (p.y < sz.y - 1) ? (closedV(pt) ? 0.0 : fetchVel(u_vel, pt).y) : 0.0;
  float div = (uR - uL) + (vT - vB);
  if (solid(p) || p.x == sz.x - 1) div = 0.0;
  OUT_S(div);
}`;

/* Pressure neighbours with the boundary conditions folded in: the body, the
   walls and the inflow are Neumann (dp/dn = 0: use the centre value); the
   outlet face of the last fluid cell (x = W-2) is Dirichlet p = 0 (mirror: -C). */
const PRESSURE = `
${SOLID}
uniform sampler2D u_p;
float pn(ivec2 q, float C) { return solid(q) ? C : fetchS(u_p, q); }
`;
const PRESSURE_NEIGHBOURS = `
  float C = fetchS(u_p, p);
  float L = (p.x > 0)        ? pn(p - ivec2(1, 0), C) : C;
  float R = (p.x < sz.x - 2) ? pn(p + ivec2(1, 0), C) : -C;
  float B = (p.y > 0)        ? pn(p - ivec2(0, 1), C) : C;
  float Tt = (p.y < sz.y - 1) ? pn(p + ivec2(0, 1), C) : C;
`;

/* 7. One damped Jacobi relaxation of laplacian(p) = div, warm started from the
   previous step. Plain Jacobi has amplification -1 on the checkerboard mode of
   the 5-point Laplacian and never converges it; with weight omega = 0.8 (the
   optimal 2D smoother) every mode contracts, the highest by 0.6 per sweep.
   u_h2 is the cell size squared: 1 on the solver grid, 16 on the coarse level. */
export const JACOBI = `
${PRESSURE}
uniform sampler2D u_div;
uniform vec2 u_size;
uniform float u_omega;
uniform float u_h2;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  ivec2 sz = ivec2(u_size);
  ${PRESSURE_NEIGHBOURS}
  float np = mix(C, (L + R + B + Tt - fetchS(u_div, p) * u_h2) * 0.25, u_omega);
  if (solid(p) || p.x == sz.x - 1) np = 0.0;                             /* solids and the ghost column hold no pressure */
  OUT_S(np);
}`;

/* 7b. Two-level correction. Jacobi only ever moves information one cell per
   sweep, so a body-sized divergence pattern survives 24 sweeps almost intact
   and, step after step, creates mass along the wake. The residual
   r = div - laplacian(p) is averaged onto a grid four times coarser, solved
   there with the same kernel (sixteen times cheaper per sweep, four times
   further per sweep), and the correction is interpolated back and added. */
export const RESIDUAL = `
${PRESSURE}
uniform sampler2D u_div;
uniform vec2 u_size;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  ivec2 sz = ivec2(u_size);
  ${PRESSURE_NEIGHBOURS}
  float r = fetchS(u_div, p) - (L + R + B + Tt - 4.0 * C);
  if (solid(p) || p.x == sz.x - 1) r = 0.0;
  OUT_S(r);
}`;
/* Coarse cell = the block mean of its fine residual (4 x 4, solids and the
   cells beyond the grid contribute nothing): full weighting, so a block that is
   mostly body carries a correspondingly small correction and the fine
   smoother, not the coarse level, resolves the surface. */
export const RESTRICT = `
uniform sampler2D u_src;
uniform sampler2D u_mask;
uniform vec2 u_fineSize;
void main() {
  ivec2 c = ivec2(gl_FragCoord.xy) * 4;
  ivec2 fine = ivec2(u_fineSize);
  float s = 0.0, n = 0.0;
  for (int dy = 0; dy < 4; dy++) for (int dx = 0; dx < 4; dx++) {
    ivec2 q = c + ivec2(dx, dy);
    if (q.x >= fine.x || q.y >= fine.y) continue;
    n += 1.0;
    if (fetchS(u_mask, q) < 0.0) continue;
    s += fetchS(u_src, q);
  }
  OUT_S(n > 0.0 ? s / n : 0.0);
}`;
/* Coarse mask: solid only when the whole block is body. A block with any
   fluid in it stays a fluid cell of the coarse problem, so the thin body
   (six cells at tier 2) never cuts the coarse domain in two and the
   correction stays smooth across it; the fine sweeps apply the wall. */
export const COARSE_MASK = `
uniform sampler2D u_mask;
uniform vec2 u_fineSize;
void main() {
  ivec2 c = ivec2(gl_FragCoord.xy) * 4;
  ivec2 fine = ivec2(u_fineSize);
  float n = 0.0, solidCount = 0.0;
  for (int dy = 0; dy < 4; dy++) for (int dx = 0; dx < 4; dx++) {
    ivec2 q = c + ivec2(dx, dy);
    if (q.x >= fine.x || q.y >= fine.y) continue;
    n += 1.0; if (fetchS(u_mask, q) < 0.0) solidCount += 1.0;
  }
  OUT_S(n > 0.0 && solidCount >= n ? -1.0 : 1.0);
}`;
/* p += e interpolated from the coarse FLUID cells only. A coarse solid cell
   holds no correction (the kernel zeroes it), and plain bilinear sampling
   would pull the interpolant toward that zero along the body: a Dirichlet
   condition where the fine kernel is Neumann, which pumps a spurious normal
   pressure gradient into the surface cells every step. Weights of solid
   neighbours are dropped and the rest renormalised; fine solids stay at zero. */
export const PROLONGATE = `
uniform sampler2D u_p;
uniform sampler2D u_e;
uniform sampler2D u_mask;
uniform sampler2D u_maskC;
uniform vec2 u_coarseSize;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  if (fetchS(u_mask, p) < 0.0) { OUT_S(0.0); return; }
  vec2 q = clamp(gl_FragCoord.xy / 4.0 - 0.5, vec2(0.0), u_coarseSize - 1.0);
  vec2 f = fract(q);
  ivec2 i = ivec2(floor(q));
  ivec2 m = ivec2(u_coarseSize) - 1;
  ivec2 c[4];
  c[0] = min(i, m); c[1] = min(i + ivec2(1, 0), m); c[2] = min(i + ivec2(0, 1), m); c[3] = min(i + ivec2(1, 1), m);
  vec4 w = vec4((1.0 - f.x) * (1.0 - f.y), f.x * (1.0 - f.y), (1.0 - f.x) * f.y, f.x * f.y);
  float e = 0.0, wsum = 0.0;
  for (int k = 0; k < 4; k++) {
    if (fetchS(u_maskC, c[k]) < 0.0) continue;
    e += w[k] * fetchS(u_e, c[k]); wsum += w[k];
  }
  OUT_S(fetchS(u_p, p) + (wsum > 0.0 ? e / wsum : 0.0));
}`;

/* 8. Projection: each face loses the pressure difference across it, closed
   faces are zeroed and the walls rewritten so the dye advection sees clean
   conditions. The outlet face (ghost column) sees the Dirichlet mirror, the
   same -C the Jacobi kernel used, so the last fluid cell ends divergence free. */
export const GRADIENT = `
${PRESSURE}
uniform sampler2D u_vel;
uniform vec2 u_size;
uniform float u_uInf;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  ivec2 sz = ivec2(u_size);
  float L = (p.x > 0) ? fetchS(u_p, p - ivec2(1, 0)) : 0.0;
  float C = (p.x == sz.x - 1) ? -L : fetchS(u_p, p);
  if (p.x > 0 && p.x < sz.x - 1 && solid(p - ivec2(1, 0))) L = C;
  float B = (p.y > 0) ? pn(p - ivec2(0, 1), C) : C;
  vec2 v = fetchVel(u_vel, p) - vec2(C - L, C - B);
  if (closedU(p)) v.x = 0.0;
  if (closedV(p)) v.y = 0.0;
  ${WALLS}
  OUT_VEL(v);
}`;

/* Obstacle mask: the signed distance (cells) to the shapes, clamped to +-64. */
export const MASK = `
${SDF}
void main() { OUT_S(clamp(sdf(gl_FragCoord.xy), -64.0, 64.0)); }`;

/* 9. Smoke rake: up to 9 Gaussian ports on the inflow edge. Each port holds
   its concentration profile (max, not add) so the streak keeps the Gaussian's
   width instead of saturating out to the tails. */
export const RAKE = `
uniform sampler2D u_dye;
uniform int u_ports;
uniform float u_x;        /* port column, dye cells */
uniform float u_y0;       /* first port row, dye cells */
uniform float u_dy;       /* row spacing, dye cells */
uniform float u_sigma;    /* dye cells */
uniform float u_strength; /* density at a port centre */
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 d = texelFetch(u_dye, p, 0);
  float s = 0.0;
  for (int i = 0; i < 9; i++) {
    if (i >= u_ports) break;
    vec2 r = gl_FragCoord.xy - vec2(u_x, u_y0 + float(i) * u_dy);
    s += exp(-dot(r, r) / (2.0 * u_sigma * u_sigma));
  }
  d.r = max(d.r, min(1.0, s * u_strength));
  fragColor = vec4(d.r, 0.0, 0.0, 1.0);
}`;

/* Resample a field into a new grid (tier change, aspect change). u_scale
   rescales the value: velocity in cells/s grows with the grid, pressure with
   its square. The velocity version samples each face on its own lattice. */
export const COPY = `
uniform sampler2D u_src;
uniform vec2 u_srcSize;
uniform float u_scale;
void main() { OUT(SAMPLE(u_src, v_uv * u_srcSize, u_srcSize) * u_scale); }`;
export const COPY_VEL = `
uniform sampler2D u_src;
uniform vec2 u_srcSize;
uniform vec2 u_size;
uniform float u_scale;
void main() {
  vec2 x = gl_FragCoord.xy;
  vec2 k = u_srcSize / u_size;
  float nu = sampleU(u_src, (x - vec2(0.5, 0.0)) * k, u_srcSize);
  float nv = sampleV(u_src, (x - vec2(0.0, 0.5)) * k, u_srcSize);
  OUT_VEL(vec2(nu, nv) * u_scale);
}`;

/* Constant fill (a packed "zero" is not four zero bytes). */
export const FILL = `
uniform vec4 u_value;
void main() { OUT(TOT(u_value)); }`;

/* Scalar readback: the value packed to 24 bits over +-u_range so readPixels can
   use UNSIGNED_BYTE on every path. */
export const READBACK = `
uniform sampler2D u_src;
uniform float u_range;
void main() {
  float s = fetchS(u_src, ivec2(gl_FragCoord.xy));
  fragColor = vec4(pack24(s / u_range * 0.5 + 0.5), 1.0);
}`;

/* 10. Composite to the canvas, premultiplied alpha over transparent.
   field 0 smoke: paper white at <= u_alpha; 1 velocity magnitude; 2 pressure
   relative to the wall static at the same station; 3 vorticity, on the ink
   ramp with the livery only at the positive extreme.
   The obstacle is cut to transparent so the stage canvas can draw the real
   rocket above. Grid y runs down the canvas, so v is flipped here once. */
export const COMPOSITE = `
${SDF}
uniform sampler2D u_dye;
uniform sampler2D u_vel;
uniform sampler2D u_p;
uniform sampler2D u_curl;
uniform vec2 u_velSize;
uniform vec2 u_canvas;    /* device px */
uniform float u_cell;     /* device px per velocity cell */
uniform int u_field;
uniform float u_uInf;     /* cells/s, for the velocity ramp */
uniform float u_pScale;   /* pseudo-pressure at stagnation, 0.5 U^2 dt */
uniform float u_wScale;   /* vorticity of the body shear layer */
uniform float u_alpha;    /* smoke ceiling */
uniform float u_fade;     /* 0..1 whole-layer multiplier */
const vec3 INK = vec3(0.039);                 /* #0A0A0A */
const vec3 PAPER = vec3(0.937);               /* #EFEFEE */
const vec3 LIVERY = vec3(0.839, 0.231, 0.031); /* #D63B08 */
vec3 rampMag(float m) {
  vec3 c = mix(INK, PAPER, clamp(m, 0.0, 1.0));
  return mix(c, LIVERY, smoothstep(1.05, 1.4, m));
}
vec3 rampSigned(float v) {
  vec3 c = mix(INK, PAPER, clamp(v, -1.0, 1.0) * 0.5 + 0.5);
  return mix(c, LIVERY, smoothstep(0.8, 1.2, v));
}
void main() {
  vec2 uv = vec2(gl_FragCoord.x / u_canvas.x, 1.0 - gl_FragCoord.y / u_canvas.y);
  vec2 cell = uv * u_velSize;
  float cut = smoothstep(-0.75, 0.75, sdf(cell) * u_cell);              /* 0 inside the body, in device px */
  vec4 c;
  if (u_field == 0) {
    float s = clamp(texture(u_dye, uv).r, 0.0, 1.0);
    float a = u_alpha * (1.0 - exp(-2.2 * s)) / (1.0 - exp(-2.2));     /* soft knee so thin streaks still read */
    c = vec4(a);                                                       /* paper, premultiplied */
  } else if (u_field == 1) {
    float m = length(sampleVelAt(u_vel, cell, u_velSize)) / max(u_uInf, 1.0e-3);
    c = vec4(rampMag(m), 1.0);
  } else if (u_field == 2) {
    /* like a tunnel's wall static taps: pressure relative to the top wall at
       the same station, which removes the channel-wide gradient that drives
       the flow against the velocity decay and leaves the body's own field */
    float pref = sampleS(u_p, vec2(cell.x, 1.5), u_velSize);
    float v = (sampleS(u_p, cell, u_velSize) - pref) / max(u_pScale, 1.0e-4);
    c = vec4(rampSigned(v), 1.0);
  } else {
    float v = sampleS(u_curl, cell, u_velSize) / max(u_wScale, 1.0e-4);
    c = vec4(rampSigned(v), 1.0);
  }
  fragColor = c * cut * u_fade;
}`;
