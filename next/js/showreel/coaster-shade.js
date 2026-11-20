// Therma-Shift coaster: what the device's materials know about the device (coaster.js applies it).
//
// A real-time material lights every surface as if nothing stood around it. The coaster is a closed box with a
// recessed tray, a reveal gap, a vent tunnel, a port and holes, so most of what makes it read as an object is where
// light does NOT reach. Every coaster geometry is in coaster space (plate top centre at the origin, metres), so the
// shaders can ask the measured design (coaster-geo.js DIM) directly, per fragment, with no baked maps:
//
//   plastic  the case and the lid ring. The enclosure as a signed distance field (rounded hull, minus the tray, the
//            reveal gap, the vent, the port, the button hole, the screw counterbores): its gradient replaces the CAD's
//            hard-edged normals near every outside edge (soft 0.2 to 0.8 mm edge breaks that hold a highlight) and
//            its depth darkens the gap, the holes and the vent tunnel. The open cavity is lit by how much of the
//            opening each point sees; with the plate on it goes dark.
//   plate    the aluminium plate: contact occlusion and the key's soft shadow from the lid ring's walls, the dark
//            seam at the tray, a reflection tint of at most a few percent for hot and cold, and frost: a dew haze and
//            then needle crystals creeping in from the plate edge (texture from coaster-tex.js createFrostMap).
//   paint    the painted detail parts (coaster-geo.js): per-vertex metalness and roughness, dark inside the closed case.
//   sink     the heatsink: saw-cut faces brighter than the extruded ones, the pin field falling dark toward the base,
//            the plastic spacer under the pins.
//   blower   the blower frame: the impeller channel and the outlet falling dark.
//
// Each variant is appended to the material's own shader (after the look's chunks when the material came from
// look.js); nothing is removed. Uniforms are shared objects, so one state drives every material.
//
//   createShadeUniforms(THREE) -> { csState, csFrost, csKey, csFrostMap, csTint }
//   shade(material, variant, uniforms) -> material

export function createShadeUniforms(THREE) {
  return {
    // x: the cavity is closed (plate seated) 0..1, y: the reveal gap is closed (lid ring seated) 0..1,
    // z: the lid ring's walls stand over the plate 0..1, w: how far the plate's edge leans toward csTint 0..1
    csState: { value: new THREE.Vector4(1, 1, 1, 0) },
    // x: how far the frost front has crept in from the tray walls (mm), y: frost amount 0..1 (0 = none),
    // z: reflection tint strength 0..1, w: dew haze ahead of the front 0..1
    csFrost: { value: new THREE.Vector4(0, 0, 0, 0) },
    csTint: { value: new THREE.Color(1, 1, 1) },                 // the colour the reflection leans toward (linear)
    csKey: { value: new THREE.Vector3(-0.62, 0.58, 0.52).normalize() },   // toward the key light, coaster space
    csFrostMap: { value: null },
  };
}

const VERT_PARS = `
varying vec3 vCsP;
varying vec3 vCsN;`;
const VERT = `
vCsP = transformed;
vCsN = objectNormal;`;
const FRAG_PARS = `
varying vec3 vCsP;
varying vec3 vCsN;
uniform vec4 csState;
// a section cut (the 3D viewer clips every part) opens the case: nothing inside is dark then
#if NUM_CLIPPING_PLANES > 0
#define csClosed 0.0
#else
#define csClosed csState.x
#endif
#ifndef LOOK_MICRO
uniform mat3 normalMatrix;
#endif`;

// ------------------------------------------------------------------ plastic
const PLASTIC_PARS = `
// rounded rectangle: x the signed distance, yz its gradient
vec3 csRRect(vec2 p, vec2 h, float r) {
  vec2 q = abs(p) - h + r, s = sign(p);
  if (q.x > 0.0 && q.y > 0.0) { float l = length(q); return vec3(l - r, q / l * s); }
  return q.x > q.y ? vec3(q.x - r, s.x, 0.0) : vec3(q.y - r, 0.0, s.y);
}
// cut c (negative inside the cutter) out of the solid d, with an edge break of k
void csCut(inout float d, inout vec3 g, float c, vec3 gc, float k) {
  float h = clamp(0.5 + 0.5 * (-c - d) / k, 0.0, 1.0);
  d = mix(d, -c, h) + k * h * (1.0 - h);
  g = mix(g, -gc, h);
}
// the enclosure (mm, coaster space): distance, gradient, and the depth behind the outer skin
float csSolid(vec3 p, out vec3 g, out float depth) {
  vec3 h2 = csRRect(p.xz, vec2(42.5, 45.0), 2.5);
  float sy = p.y > -12.925 ? 1.0 : -1.0, dy = abs(p.y + 12.925) - 16.055;
  float r = sy > 0.0 ? 0.55 : 0.8;
  vec2 q = vec2(h2.x, dy) + r;
  float d;
  if (q.x > 0.0 && q.y > 0.0) { float l = length(q); d = l - r; g = (q.x * vec3(h2.y, 0.0, h2.z) + q.y * vec3(0.0, sy, 0.0)) / l; }
  else if (q.x > q.y) { d = h2.x; g = vec3(h2.y, 0.0, h2.z); }
  else { d = dy; g = vec3(0.0, sy, 0.0); }
  // the tray over the plate
  vec3 a = vec3(abs(p.x) - 39.0, -1.5 - p.y, abs(p.z) - 40.0);
  float dt = max(a.x, max(a.y, a.z));
  vec3 gt = a.x > a.y && a.x > a.z ? vec3(sign(p.x), 0.0, 0.0) : (a.z > a.y ? vec3(0.0, 0.0, sign(p.z)) : vec3(0.0, -1.0, 0.0));
  depth = max(0.0, -max(max(h2.x, dy), -dt));
  csCut(d, g, dt, gt, 0.32);
  // the reveal gap between the case and the lid ring
  csCut(d, g, abs(p.y + 1.075) - 0.405, vec3(0.0, sign(p.y + 1.075), 0.0), 0.2);
  // the vent tunnel, the port cutout, the button hole (front wall)
  if (p.z > 20.0 && p.y < -8.0) {
    vec3 c = csRRect(p.xy - vec2(0.0, -21.97), vec2(14.0, 4.0), 3.4);
    float b = 29.0 - p.z;
    csCut(d, g, max(c.x, b), c.x > b ? vec3(c.yz, 0.0) : vec3(0.0, 0.0, -1.0), 0.34);
    c = csRRect(p.xy - vec2(-25.5, -23.98), vec2(6.2, 3.0), 1.0); b = 39.0 - p.z;
    csCut(d, g, max(c.x, b), c.x > b ? vec3(c.yz, 0.0) : vec3(0.0, 0.0, -1.0), 0.28);
    vec2 o = p.xy - vec2(29.625, -16.29); float l = length(o);
    csCut(d, g, max(l - 3.6, b), l - 3.6 > b ? vec3(o / max(l, 1e-4), 0.0) : vec3(0.0, 0.0, -1.0), 0.28);
  }
  // the screw counterbores in the lid ring
  if (p.y > 0.6) {
    vec2 u = abs(p.xz) - vec2(35.0, 42.5); float l = length(u), b = 1.25 - p.y;
    csCut(d, g, max(l - 1.9, b), l - 1.9 > b ? vec3(sign(p.x) * u.x, 0.0, sign(p.z) * u.y) / max(l, 1e-4) : vec3(0.0, -1.0, 0.0), 0.2);
  }
  return d;
}
// how much light reaches a point of the plastic
float csPlasticOcc(vec3 p, float depth, float trayWall) {
  bool cav = abs(p.x) < 40.05 && abs(p.z) < 40.05 && p.y > -27.03 && p.y < -1.52;
  if (cav) {
    // the duct from the vent tunnel to the blower: always enclosed
    if (abs(p.x) < 14.05 && p.y < -17.9 && p.z > 20.0) return max(0.02, exp(-(45.0 - p.z) / 4.2));
    float h = max(0.0, -1.48 - p.y);
    vec4 w = vec4(40.0 - p.x, 40.0 + p.x, 40.0 - p.z, 40.0 + p.z); w = max(w, 0.0); w *= w;
    float v = dot(w / (w + h * h + 1e-3), vec4(0.25));
    return mix(0.05 + 0.95 * pow(v, 1.25), 0.035, csClosed);
  }
  // inside the walls: the reveal gap, the counterbores, the front openings
  if (p.y > -1.52 && p.y < -0.63) return mix(1.0, max(0.03, exp(-depth / 0.42)), csState.y);
  float lam = 1.4;
  if (p.z > 39.9 && p.y < -8.0 && abs(p.x) < 40.0) { depth = 45.0 - p.z; lam = abs(p.x) < 15.0 ? 4.2 : (p.x < 0.0 ? 2.6 : 2.0); }
  else if (p.y > 0.0) lam = 0.9;
  float o = max(0.03, exp(-depth / lam));
  // the tray walls darken toward the plate they stand on
  return o * mix(1.0, mix(0.66, 1.0, smoothstep(0.0, 2.6, p.y)), trayWall * csState.z);
}`;
const PLASTIC_NORMAL = `
vec3 csP = vCsP * 1000.0, csG; float csDepth;
float csD = csSolid(csP, csG, csDepth);
{
  vec3 n0 = normalize(vCsN); csG = normalize(csG);
  if (abs(csD) < 0.17 && dot(csG, n0) > 0.2) normal = normalize(normal + normalMatrix * (csG - n0) * faceDirection);
}`;
// (back faces only ever show through the hairline cracks of the CAD tessellation: leave them lit, so a crack is not a dark dot)
const PLASTIC_LIGHT = `
if (gl_FrontFacing) outgoingLight *= csPlasticOcc(csP, csDepth, step(abs(max(abs(csP.x) - 39.0, abs(csP.z) - 40.0)), 0.06) * step(-0.7, csP.y));`;

// -------------------------------------------------------------------- plate
const PLATE_PARS = `
uniform sampler2D csFrostMap;
uniform vec4 csFrost;
uniform vec3 csTint;
uniform vec3 csKey;
#define CS_EDGE_MM 9.0
#define CS_EDGE_LIGHT 0.50`;
const PLATE_SURFACE = `
vec3 csP = vCsP * 1000.0;
float csTop = smoothstep(-0.42, -0.02, csP.y);
vec4 csF = texture2D(csFrostMap, csP.xz / 80.0 + 0.5);
vec4 csF2 = csF;
float csIce = 0.0, csHaze = 0.0, csEdge = 0.0;
{
  // hot or cold: the reflection leans a few percent toward a colour; the plate never glows
  diffuseColor.rgb = mix(diffuseColor.rgb, csTint, csFrost.z);
  // faint handling wear: the highlight is not perfectly even
  roughnessFactor = clamp(roughnessFactor + (csF.r - 0.5) * 0.035 * csTop, 0.04, 1.0);
  if (csFrost.y > 0.001) {
    float dw = min(39.0 - abs(csP.x), 40.0 - abs(csP.z));
    float t = (csFrost.x - dw) / 3.0 + (0.5 - csF.r) * 4.2;         // > 0 where frost has arrived
    float cover = smoothstep(0.0, 2.2, t) * csTop;                   // a soft front: the frost thins out, it has no outline
    // dew first: a film of droplets too small to see, on its own smoother front. It scatters a little, so the plate
    // turns slightly milky and lighter, never darker and never white: strong, it read either as stains (a dark
    // half-metal) or as paint (a white one) with the bare plate looking dirty next to it
    float th = (csFrost.x - dw) / 3.0 + (0.5 - csF.r) * 1.2;
    csHaze = smoothstep(-2.4, 0.2, th) * csTop * csFrost.w;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.88, 0.90, 0.93), 0.34 * csHaze);
    metalnessFactor *= 1.0 - 0.34 * csHaze;
    roughnessFactor = min(1.0, roughnessFactor + 0.08 * csHaze);
    // then frost: grainy at the front, filling in solid behind it (the same field tiled small gives the fine grain)
    csF2 = texture2D(csFrostMap, csP.xz / 11.0);
    // (at most about two thirds ice: a fine frost over metal. Filled solid it came out whiter than the page, like
    // paint, and made the bare plate next to it look dirty)
    csIce = 0.66 * cover * mix(0.42 + 0.36 * csF.g + 0.22 * csF2.g, 1.0, clamp(t * 0.22, 0.0, 0.85));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.68, 0.75, 0.84) * (0.92 + 0.16 * csF2.g), csIce * 0.95);
    metalnessFactor *= 1.0 - 0.97 * csIce;
    // (thin frost keeps the plate's own sheen: a half-rough half-metal mirrors the whole dim studio instead of the
    // panel over it, which made the frost front the darkest thing on the plate)
    roughnessFactor = mix(roughnessFactor, 0.86, csIce * csIce);
  }
  // the owner's cue for the mode (csState.w): toward the tray walls the surface, bare or frosted, leans further
  // toward the colour, falling off inward. Faint: a tint at the plate's edge, not a lit panel
  csEdge = csState.w * exp(-max(min(39.0 - abs(csP.x), 40.0 - abs(csP.z)), 0.0) / CS_EDGE_MM) * csTop;
  diffuseColor.rgb = mix(diffuseColor.rgb, csTint, min(0.7, csEdge));
}`;
const PLATE_NORMAL = `
{
  // an edge break thinner than a pixel beads along the edge: flatten it as it gets small on screen
  float px = max(max(fwidth(csP.x), fwidth(csP.z)), fwidth(csP.y));
  float f = smoothstep(0.15, 0.5, px) * (1.0 - csTop) * step(-0.45, csP.y);
  normal = normalize(normal + normalMatrix * (vec3(0.0, 1.0, 0.0) - normalize(vCsN)) * f * faceDirection);
}
// (the crystals only roughen the surface where the frost is dense: thin frost is still mostly a mirror, and tilting
// that mirror showed the dark studio walls as blotches along the front)
if (csIce > 0.001) normal = normalize(normal + normalMatrix * vec3(csF.b + csF2.b * 1.6 - 1.3, 0.0, csF.a + csF2.a * 1.6 - 1.3) * (csIce * csIce * 0.7) * faceDirection);`;
const PLATE_LIGHT = `
{
  // the tray: contact occlusion at the lid ring's walls, the dark seam, the key's soft shadow from the wall it comes over
  float wx = 39.0 - abs(csP.x), wz = 40.0 - abs(csP.z);
  float ao = (1.0 - 0.40 * exp(-wx / 1.5)) * (1.0 - 0.40 * exp(-wz / 1.5)) * (0.25 + 0.75 * smoothstep(0.0, 0.45, min(wx, wz)));
  vec2 kd = csKey.xz / max(csKey.y, 0.3);
  float sx = kd.x < 0.0 ? csP.x + 39.0 : 39.0 - csP.x, sz = kd.y < 0.0 ? csP.z + 40.0 : 40.0 - csP.z;
  float lx = 3.13 * abs(kd.x), lz = 3.13 * abs(kd.y);
  float sh = max(1.0 - smoothstep(0.2 * lx, 1.5 * lx + 0.6, sx), 1.0 - smoothstep(0.2 * lz, 1.5 * lz + 0.6, sz));
  float tray = mix(1.0, ao * (1.0 - 0.30 * sh), csState.z);
  // its edges, behind the reveal gap, see nothing once the lid ring is on
  outgoingLight *= mix(mix(1.0, 0.03, csState.y), tray, csTop);
  // (a little of the cue is its own light, so it stays a clean colour where the plate mirrors something dark)
  outgoingLight += csTint * (CS_EDGE_LIGHT * csEdge);
}`;

// -------------------------------------------------------------------- paint
const PAINT_VERT_PARS = `
attribute vec2 surf;
varying vec2 vCsSurf;`;
const PAINT_VERT = `
vCsSurf = surf;`;
const PAINT_PARS = `
varying vec2 vCsSurf;`;
const PAINT_SURFACE = `
metalnessFactor *= vCsSurf.x;
roughnessFactor *= vCsSurf.y;`;
// inside the closed case nothing is lit, except what faces the port: the receptacle's mouth at the end of the cutout
const INSIDE_LIGHT = `
{
  vec3 p = vCsP * 1000.0;
  float inside = step(abs(p.x), 40.0) * step(abs(p.z), 40.02) * step(p.y, -1.5);
  float port = 0.55 * exp(-(40.0 - p.z) / 2.4) * step(abs(p.x + 25.5), 6.6) * step(abs(p.y + 24.4), 3.6);
  outgoingLight *= mix(1.0, max(0.035, port), csClosed * inside);
  // what crosses the reveal gap (the screws' shanks) is as dark as the gap
  float gap = step(-1.52, p.y) * step(p.y, -0.63);
  outgoingLight *= mix(1.0, max(0.03, exp(-max(min(42.5 - abs(p.x), 45.0 - abs(p.z)), 0.0) / 0.42)), csState.y * gap);
}`;

// --------------------------------------------------------------------- sink
const SINK_SURFACE = `
vec3 csP = vCsP * 1000.0;
float csSpacer = step(csP.y, -16.02);
{
  // saw-cut faces (across the extrusion, which runs along x) are brighter and smoother than the extruded ones
  float cut = smoothstep(0.6, 0.9, abs(normalize(vCsN).x)) * (1.0 - csSpacer);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.72, 0.74, 0.77), cut * 0.7);
  roughnessFactor = mix(roughnessFactor, 0.27, cut);
  // the spacer under the pins is a plastic frame
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.022, 0.023, 0.026), csSpacer);
  metalnessFactor *= 1.0 - csSpacer;
  roughnessFactor = mix(roughnessFactor, 0.62, csSpacer);
}`;
const SINK_LIGHT = `
{
  // between the pins light dies toward the base: bright tips, near-black roots, never pure black
  float edge = min(20.0 - abs(csP.x), 20.0 - abs(csP.z));
  float deep = smoothstep(-16.0, -8.3, csP.y);
  float occ = mix(1.0, mix(0.92, 0.13, deep), smoothstep(0.04, 0.8, edge));
  outgoingLight *= mix(1.0, occ, step(csP.y, -8.12) * (1.0 - csSpacer)) * mix(1.0, 0.035, csClosed);
}`;

// ------------------------------------------------------------------- blower
const BLOWER_LIGHT = `
{
  vec3 p = vCsP * 1000.0; float r = length(p.xz);
  // the impeller channel and the outlet fall dark with depth
  float ch = step(p.y, -17.03) * max(step(9.9, r) * step(r, 14.1), step(abs(p.x), 14.02) * step(6.0, p.z) * step(p.y, -17.3));
  outgoingLight *= mix(1.0, mix(0.62, 0.09, smoothstep(-17.0, -23.5, p.y)), ch) * mix(1.0, 0.035, csClosed);
}`;

const VARIANTS = {
  plastic: { pars: PLASTIC_PARS, normal: PLASTIC_NORMAL, light: PLASTIC_LIGHT },
  plate: { pars: PLATE_PARS, surface: PLATE_SURFACE, normal: PLATE_NORMAL, light: PLATE_LIGHT },
  paint: { vpars: PAINT_VERT_PARS, vert: PAINT_VERT, pars: PAINT_PARS, surface: PAINT_SURFACE, light: INSIDE_LIGHT },
  sink: { surface: SINK_SURFACE, light: SINK_LIGHT },
  blower: { light: BLOWER_LIGHT },
};

const after = (src, chunk, add) => src.replace(`#include <${chunk}>`, `#include <${chunk}>\n${add}`);
const before = (src, chunk, add) => src.replace(`#include <${chunk}>`, `${add}\n#include <${chunk}>`);

export function shade(material, variant, uniforms) {
  const V = VARIANTS[variant];
  if (!V) throw new Error(`coaster-shade: no variant "${variant}"`);
  const prev = material.onBeforeCompile, prevKey = material.customProgramCacheKey;
  material.onBeforeCompile = function (sh, r) {
    if (prev) prev.call(this, sh, r);
    Object.assign(sh.uniforms, uniforms);
    let vs = sh.vertexShader, fs = sh.fragmentShader;
    vs = after(vs, 'common', VERT_PARS + (V.vpars || ''));
    vs = after(vs, 'begin_vertex', VERT + (V.vert || ''));
    fs = after(fs, 'common', FRAG_PARS + (V.pars || ''));
    if (V.surface) fs = after(fs, 'metalnessmap_fragment', V.surface);
    if (V.normal) fs = before(fs, 'clearcoat_normal_fragment_begin', V.normal);
    if (V.light) fs = before(fs, 'opaque_fragment', V.light);
    sh.vertexShader = vs; sh.fragmentShader = fs;
  };
  material.customProgramCacheKey = function () { return (prevKey ? prevKey.call(this) : '') + '|cs1:' + variant; };
  material.userData.csVariant = variant;
  material.needsUpdate = true;
  return material;
}
