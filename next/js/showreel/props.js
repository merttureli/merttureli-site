// Showreel props: a glazed stoneware mug of coffee and a plain 12 oz aluminum can (bare metal under clear lacquer,
// no brand, no band, no marks).
//
//   import { createMug, createCan, sloshAt } from './props.js';
//   const mug = createMug({ renderer, quality: 'high' });   // quality: 'high' | 'low'
//
// Both follow the module API shape (group, duration, setProgress, update, dispose). Units are meters, +Y up, the
// base of the object sits on y = 0 and the axis is x = z = 0. Neither prop animates by itself (duration 0,
// setProgress and update are no-ops), so stills are free.
//
// Materials. With a `renderer` (or a `look`) the props make their materials through the studio look (look.js):
// its environment, tone curve, near-field reflections and micro surfaces, so dressThermaShift leaves them alone.
// Without one (the 3D viewer) they are plain MeshPhysicalMaterials with the same values.
//   createMug({ quality, renderer, look })   createCan({ quality, renderer, look })
//
// createMug() extras
//   bodyMesh        outer wall, lip and inner wall in one mesh: charcoal glaze outside, cream inside, the glaze
//                   breaking lighter over the lip, raw stoneware on the foot ring (per-vertex colour and glaze mask)
//   handleMesh      the handle (same glaze material)
//   coffeeSurface   Mesh, the coffee: meniscus, foam against the wall, a few bubbles, the far wall mirrored in it
//   setSlosh(x, z, ripple, phase)
//                   the coffee surface as a pure function of its inputs: x, z are the height (m) of the first
//                   sloshing mode at the wall along the mug's +X and +Z (the surface rocks about the axis across
//                   them), ripple the height (m) of concentric capillary rings, phase (rad) moves the rings outward.
//                   setSlosh(0, 0, 0, 0) is a still surface.
//   settle(t, opts) shorthand: setSlosh(...sloshAt(t, opts)), t seconds since the mug touched down
//   coffeeY         height of the coffee surface above the base (0.0725)
//   coffeeRadius    radius of the coffee surface where it meets the glaze
//   rimRadius       inner radius of the mug at the lip (0.0362); rimY the height of the lip (0.085)
//   height, outerRadius (at the lip), footRadius (the unglazed ring that touches the plate)
//
// createCan() extras
//   bodyMesh / bodyMaterial  the body wall, shoulder and neck: bare aluminum under clear lacquer. The FX artist hooks
//                            condensation here. UVs are isotropic in meters: u = angle / 2pi, v = arc length /
//                            circumference, so bodyMesh.userData.uvMetres (= circumference, 0.2080) converts 1 uv
//                            unit to meters in both axes. v = 0 at the stand ring, about 0.56 at the neck.
//   endsMesh                 base (dome, stand ring, chime) and top (double seam, chuck wall, countersink, panel with
//                            the finger well) in one mesh; baseMesh and topMesh both point at it
//   tabMesh                  stay-on tab, rivet and the score line of the opening in one mesh
//   height (0.1222), radius (0.0331), footRadius (stand ring), panelY, tabAngle (the tab's ring points along +X)
//
// sloshAt(t, { amp, freq, zeta, dir, ripple }) -> [x, z, ripple, phase]
//   a set-down as a pure function of the time since the touch: the first mode (default 3.6 Hz) rocks along `dir`
//   (radians about Y) with peak height `amp` (m) and calms (zeta 0.3); a few rings run outward and die sooner.
//
// Lighting: no lights or environment here. Metal and glaze need an environment (the look's, or the viewer's).
import * as THREE from '../three.module.min.js';

let lookMod = null;
try { lookMod = await import('./look.js'); } catch (e) { /* no studio look: plain three.js materials */ }

const TAU = Math.PI * 2;
const lin = hex => new THREE.Color(hex);          // sRGB hex -> linear working colour

// The studio look for this renderer, if there is one. `release` gives the reference back.
function studio({ look, renderer, quality }) {
  if (look) return { look, release() {} };
  if (renderer && lookMod && lookMod.getLook) {
    try {
      const L = lookMod.getLook({ renderer, quality: quality === 'low' ? 'low' : 'high' });
      L.env();
      return { look: L, release() { L.release(); } };
    } catch (e) { /* fall through to plain materials */ }
  }
  return { look: null, release() {} };
}
// A physical material; `hook(material)` may add its own shader code before the look wraps it.
function material(L, params, lookOpts = {}, hook = null) {
  const P = { ...params };
  if (!L) delete P.anisotropy;                     // anisotropy needs the look's tangent (these meshes have none)
  const m = new THREE.MeshPhysicalMaterial(P);
  if (hook) hook(m);
  return L ? L.inject(m, { envIntensity: 1, ...lookOpts }) : m;
}
const insertAfter = (src, chunk, add) => src.replace(`#include <${chunk}>`, `#include <${chunk}>\n${add}`);

// ---------------------------------------------------------------- profile helpers
// A profile is a polyline of [r, y] points walked so that the solid lies on the left. Normals
// come from central differences, so tangent-continuous joins shade perfectly smooth. Each point
// carries the tag that was current when it was pushed (materials, colours).
class Profile {
  constructor() { this.pts = []; this.tags = []; this.marks = {}; this.cur = ''; }
  get last() { return this.pts[this.pts.length - 1]; }
  tag(t) { this.cur = t; return this; }
  push(r, y) {
    const l = this.last;
    if (l && Math.abs(l[0] - r) < 1e-9 && Math.abs(l[1] - y) < 1e-9) return this;
    this.pts.push([r, y]); this.tags.push(this.cur); return this;
  }
  reverse() { this.pts.reverse(); this.tags.reverse(); return this; }
  mark(name) { this.marks[name] = this.pts.length - 1; return this; }
  line(r, y, n = 1) {
    const [r0, y0] = this.last;
    for (let i = 1; i <= n; i++) this.push(r0 + (r - r0) * i / n, y0 + (y - y0) * i / n);
    return this;
  }
  // center (cr, cy) in (r, y) space, angles in radians, point = c + rad * (cos a, sin a)
  arc(cr, cy, rad, a0, a1, n) {
    for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; this.push(cr + rad * Math.cos(a), cy + rad * Math.sin(a)); }
    return this;
  }
  // cubic bezier from the current point
  bez(p1, p2, p3, n) {
    const p0 = this.last;
    for (let i = 1; i <= n; i++) {
      const t = i / n, u = 1 - t;
      const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
      this.push(a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]);
    }
    return this;
  }
  // normals (nr, ny) and cumulative arc length s for every point
  finish() {
    const P = this.pts, n = P.length;
    this.normals = []; this.s = [0];
    for (let i = 0; i < n; i++) {
      const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)];
      let dr = b[0] - a[0], dy = b[1] - a[1]; const l = Math.hypot(dr, dy) || 1; dr /= l; dy /= l;
      this.normals.push([dy, -dr]);
      if (i) this.s.push(this.s[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
    }
    return this;
  }
}

// Surface of revolution from profile points [i0 .. i1]. uv: u around, v = (s - s0) / vScale.
// extras: { name: { size, at(i) -> number | number[] } } adds one more attribute per profile row.
function revolve(prof, i0, i1, segs, vScale, extras = null) {
  const rows = i1 - i0 + 1, cols = segs + 1;
  const pos = new Float32Array(rows * cols * 3), nor = new Float32Array(rows * cols * 3), uv = new Float32Array(rows * cols * 2);
  const ex = extras ? Object.entries(extras).map(([name, e]) => ({ name, size: e.size, at: e.at, data: new Float32Array(rows * cols * e.size) })) : [];
  const s0 = prof.s[i0];
  for (let j = 0; j < rows; j++) {
    const [r, y] = prof.pts[i0 + j], [nr, ny] = prof.normals[i0 + j], v = (prof.s[i0 + j] - s0) / vScale;
    const vals = ex.map(e => [].concat(e.at(i0 + j)));
    for (let k = 0; k < cols; k++) {
      const a = (k % segs) / segs * TAU, sn = Math.sin(a), cs = Math.cos(a), o = j * cols + k;   // seam column reuses the exact k = 0 values
      pos[o * 3] = r * sn; pos[o * 3 + 1] = y; pos[o * 3 + 2] = r * cs;
      nor[o * 3] = nr * sn; nor[o * 3 + 1] = ny; nor[o * 3 + 2] = nr * cs;
      uv[o * 2] = k / segs; uv[o * 2 + 1] = v;
      for (let e = 0; e < ex.length; e++) for (let c = 0; c < ex[e].size; c++) ex[e].data[o * ex[e].size + c] = vals[e][c];
    }
  }
  const idx = [];
  for (let j = 0; j < rows - 1; j++) for (let k = 0; k < segs; k++) {
    const a = j * cols + k, b = a + 1, c = a + cols, d = c + 1;
    // skip degenerate triangles at the axis
    if (prof.pts[i0 + j][0] > 1e-7) idx.push(a, b, c);
    if (prof.pts[i0 + j + 1][0] > 1e-7) idx.push(b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  for (const e of ex) g.setAttribute(e.name, new THREE.BufferAttribute(e.data, e.size));
  g.setIndex(idx);
  g.computeBoundingSphere(); g.computeBoundingBox();
  return g;
}

// radius of a profile (monotonic in y over the given point range) at height y
function radiusAt(prof, i0, i1, y) {
  for (let i = i0; i < i1; i++) {
    const a = prof.pts[i], b = prof.pts[i + 1];
    if ((a[1] - y) * (b[1] - y) <= 0 && a[1] !== b[1]) return a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]);
  }
  return prof.pts[i1][0];
}

// Join indexed geometries that share the same attributes into one (one draw call). `fill` gives a constant for an
// attribute a part lacks: { color: [r, g, b] }.
function merge(parts, fill = {}) {
  const names = new Set(); for (const g of parts) for (const n in g.attributes) names.add(n);
  let count = 0, icount = 0;
  for (const g of parts) { count += g.attributes.position.count; icount += g.index ? g.index.count : g.attributes.position.count; }
  const out = new THREE.BufferGeometry();
  const index = count > 65535 ? new Uint32Array(icount) : new Uint16Array(icount);
  for (const n of names) {
    const size = (parts.find(g => g.attributes[n]) || {}).attributes[n].itemSize, data = new Float32Array(count * size);
    let o = 0;
    for (const g of parts) {
      const a = g.attributes[n], c = g.attributes.position.count;
      if (a) data.set(a.array.subarray(0, c * size), o * size);
      else { const f = fill[n] || []; for (let i = 0; i < c; i++) for (let k = 0; k < size; k++) data[(o + i) * size + k] = f[k] ?? (n === 'normal' && k === 1 ? 1 : 0); }
      o += c;
    }
    out.setAttribute(n, new THREE.BufferAttribute(data, size));
  }
  let o = 0, io = 0;
  for (const g of parts) {
    const c = g.attributes.position.count;
    if (g.index) for (let i = 0; i < g.index.count; i++) index[io++] = g.index.array[i] + o;
    else for (let i = 0; i < c; i++) index[io++] = i + o;
    o += c;
  }
  out.setIndex(new THREE.BufferAttribute(index, 1));
  out.computeBoundingSphere(); out.computeBoundingBox();
  for (const g of parts) g.dispose();
  return out;
}
function constantAttribute(g, name, values) {
  const n = g.attributes.position.count, size = values.length, data = new Float32Array(n * size);
  for (let i = 0; i < n; i++) for (let k = 0; k < size; k++) data[i * size + k] = values[k];
  g.setAttribute(name, new THREE.BufferAttribute(data, size));
  return g;
}

function triCount(group) {
  let t = 0;
  group.traverse(o => { if (o.isMesh) t += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
  return t;
}

// ---------------------------------------------------------------- mug
const MUG = { H: 0.085, ro: 0.040, ri: 0.0362, coffeeY: 0.0725, foot: 0.0351 };
// sRGB: charcoal glaze, the lighter brown where it breaks thin over an edge, cream liner, raw stoneware body
const MUG_COL = { glaze: 0x3a3b3f, breakLip: 0x7a6650, cream: 0xe6dfd0, clay: 0x8d7b69, clayDark: 0x6f6154 };

// Glazed stoneware: one material for the wall, the liner and the handle. Per vertex: colour and `aGlaze` (1 glazed,
// 0 raw clay: no clearcoat, rough). In the shader: slow mottling of the glaze, faint throwing rings and waviness
// that only show in the reflection, fine grain on the raw clay.
const MUG_GLSL = {
  vpars: /* glsl */`
attribute float aGlaze;
varying float vGlaze;
varying vec3 vMugP;
varying vec3 vMugUp;`,
  vmain: /* glsl */`
vGlaze = aGlaze; vMugP = position;
vMugUp = normalize(normalMatrix * vec3(0.0, 1.0, 0.0));`,
  fpars: /* glsl */`
varying float vGlaze;
varying vec3 vMugP;
varying vec3 vMugUp;
vec3 mugDN;
float mugH(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float mugN(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(mugH(i), mugH(i + vec3(1.0, 0.0, 0.0)), f.x), mix(mugH(i + vec3(0.0, 1.0, 0.0)), mugH(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
             mix(mix(mugH(i + vec3(0.0, 0.0, 1.0)), mugH(i + vec3(1.0, 0.0, 1.0)), f.x), mix(mugH(i + vec3(0.0, 1.0, 1.0)), mugH(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}`,
  color: /* glsl */`
{
  #ifdef MUG_LQ
  float mm = mugN(vMugP * 95.0);
  #else
  float mm = mugN(vMugP * 95.0) * 0.62 + mugN(vMugP * 310.0) * 0.38;      // about 1 cm and 3 mm
  #endif
  float lum = dot(diffuseColor.rgb, vec3(0.3333));
  diffuseColor.rgb *= mix(0.90 + 0.20 * mugN(vMugP * 1500.0), mix(0.80, 0.955, smoothstep(0.02, 0.5, lum)) + mix(0.40, 0.09, smoothstep(0.02, 0.5, lum)) * mm, vGlaze);
}`,
  rough: /* glsl */`
roughnessFactor = mix(0.93, roughnessFactor, vGlaze);`,
  normal: /* glsl */`
{
  float th = atan(vMugP.z, vMugP.x), y = vMugP.y;
  // slopes (radians): throwing rings on a slow spiral, 7.5 mm pitch, and a slow waviness of the wall
  float sy = 0.0055 * cos(y * 837.8 + th + 0.6 * sin(th * 2.0)) + 0.0045 * cos(y * 290.0 - th * 2.0 + 1.3);
  float st = 0.0040 * cos(th * 3.0 + y * 70.0) + 0.0020 * cos(th * 7.0 - y * 150.0 + 2.1);
  vec3 up = vMugUp - normal * dot(normal, vMugUp);
  float ul = length(up);
  mugDN = ul > 0.25 ? (up / ul * sy + cross(up / ul, normal) * st) * vGlaze * smoothstep(0.25, 0.6, ul) : vec3(0.0);
  normal = normalize(normal - mugDN * 0.5);
}`,
  coat: /* glsl */`
#ifdef USE_CLEARCOAT
clearcoatNormal = normalize(clearcoatNormal - mugDN);
#endif`,
  coatAmount: /* glsl */`
#ifdef USE_CLEARCOAT
material.clearcoat *= vGlaze;
#endif`,
};
function mugHook(low) {
  return m => {
    // on the material, not in the hook: a define set in the hook changes the program key after the first compile
    if (low) m.defines = { ...(m.defines || {}), MUG_LQ: '' };
    m.onBeforeCompile = shader => {
      let vs = shader.vertexShader, fs = shader.fragmentShader;
      vs = insertAfter(vs, 'common', MUG_GLSL.vpars);
      vs = insertAfter(vs, 'begin_vertex', MUG_GLSL.vmain);
      fs = insertAfter(fs, 'common', MUG_GLSL.fpars);
      fs = insertAfter(fs, 'color_fragment', MUG_GLSL.color);
      fs = insertAfter(fs, 'roughnessmap_fragment', MUG_GLSL.rough);
      fs = insertAfter(fs, 'normal_fragment_maps', MUG_GLSL.normal);
      fs = insertAfter(fs, 'clearcoat_normal_fragment_maps', MUG_GLSL.coat);
      fs = insertAfter(fs, 'lights_physical_fragment', MUG_GLSL.coatAmount);
      shader.vertexShader = vs; shader.fragmentShader = fs;
    };
    m.customProgramCacheKey = () => 'mug-glaze-1' + (low ? 'l' : '');
  };
}

// Coffee: a dark liquid that mirrors what is above it. The surface rocks in its first sloshing mode and carries
// capillary rings (uSlosh, pure inputs); the fragment adds the foam ring against the wall, a few bubbles, the thin
// amber edge of the meniscus, and the mug's own inner wall reflected in the far side of the surface (a ray against
// the wall cylinder), which is what makes a liquid in a cup read as a liquid.
function coffeeGLSL(bubbles) {
  const B = bubbles.map(b => `vec3(${b.map(x => x.toFixed(5)).join(', ')})`).join(', ');
  return {
    vpars: /* glsl */`
uniform vec4 uSlosh;       // x, z: first-mode height at the wall (m); z: ring height (m); w: ring phase
uniform vec4 uCof;         // radius, coffee y, lip y, ring wave number
varying vec3 vCofP;
varying mat3 vCofNM;
vec3 cofGrad;              // x: dh/dx, y: h, z: dh/dz
void cofWave(vec3 p) {
  float R = uCof.x, r2 = dot(p.xz, p.xz), rho2 = r2 / (R * R), u2 = 3.3893 * rho2;      // u = 1.841 rho
  // first mode: J1(u) cos(theta) / J1(1.841), written without the singular 1 / r
  float F = 3.1638 * (0.5 + u2 * (-0.0625 + u2 * (0.0026042 - u2 * 0.00005425)));
  float G = 10.723 * (-0.125 + u2 * (0.0104167 - u2 * 0.00032552));
  float d = uSlosh.x * p.x + uSlosh.y * p.z;
  float h = F * d / R;
  vec2 g = (F * uSlosh.xy + d * G * p.xz / (R * R)) / R;
  // capillary rings running outward
  float rho = sqrt(rho2), ph = uCof.w * rho - uSlosh.w, win = smoothstep(0.0, 0.2, rho);
  h += uSlosh.z * cos(ph) * win;
  g += -uSlosh.z * uCof.w * sin(ph) * win * p.xz / max(sqrt(r2) * R, 1e-6);
  cofGrad = vec3(g.x, h, g.y);
}`,
    vnormal: /* glsl */`
cofWave(position);
objectNormal = normalize(objectNormal - vec3(cofGrad.x, 0.0, cofGrad.z));`,
    vmain: /* glsl */`
transformed.y += cofGrad.y;
vCofP = transformed; vCofNM = normalMatrix;`,
    fpars: /* glsl */`
uniform vec4 uCof;
uniform vec3 uCofWall, uCofFoam, uCofKey;
uniform vec4 uCofRaft;     // two small rafts of foam against the wall (x, z each; m)
varying vec3 vCofP;
varying mat3 vCofNM;
float cofFoamAmt, cofBub;
vec3 cofBubN;
float cofH(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float cofN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(cofH(i), cofH(i + vec2(1.0, 0.0)), f.x), mix(cofH(i + vec2(0.0, 1.0)), cofH(i + vec2(1.0, 1.0)), f.x), f.y); }
const vec3 cofB[${bubbles.length}] = vec3[${bubbles.length}](${B});   // x, z (m), radius (m)`,
    color: /* glsl */`
{
  float r = length(vCofP.xz), edge = uCof.x - r, th = atan(vCofP.z, vCofP.x);
  // micro-foam clinging to the wall: a thin broken ring of fine bubbles, a little wider where two rafts have gathered
  float nf = 0.5 + 0.26 * sin(th * 3.0 + 1.1) + 0.16 * sin(th * 7.0 + 4.2) + 0.10 * sin(th * 13.0 + 2.3);
  float grain = smoothstep(0.30, 0.70, cofN(vCofP.xz * 3400.0));
  float raft = max(1.0 - length(vCofP.xz - uCofRaft.xy) / 0.0052, 1.0 - length(vCofP.xz - uCofRaft.zw) / 0.0036);
  float w = 0.00022 + 0.0011 * smoothstep(0.45, 0.9, nf) + 0.0045 * smoothstep(0.0, 0.75, raft);
  cofFoamAmt = (1.0 - smoothstep(w * 0.5, w, edge + (cofN(vCofP.xz * 900.0) - 0.5) * 0.0009)) * (0.35 + 0.65 * grain) * smoothstep(0.26, 0.46, max(nf, raft + 0.3));
  // bubbles: clear domes with a brighter rim, sitting against the wall and in the foam
  cofBub = 0.0; cofBubN = vec3(0.0);
  float rim = 0.0;
  for (int i = 0; i < ${bubbles.length}; i++) {
    vec2 d = (vCofP.xz - cofB[i].xy) / cofB[i].z;
    float q = dot(d, d);
    if (q < 1.0) {
      float aa = clamp(fwidth(sqrt(q)) * 1.5, 0.02, 0.5);
      cofBub = 1.0 - smoothstep(1.0 - aa, 1.0, sqrt(q));
      cofBubN = vec3(d.x, 0.0, d.y) * 0.9;
      rim = smoothstep(0.55, 0.9, sqrt(q));
    }
  }
  vec3 base = diffuseColor.rgb;
  base = mix(base, base * 3.0 + vec3(0.016, 0.006, 0.0015), (1.0 - smoothstep(0.0, 0.0010, edge)) * 0.8);   // thin liquid at the wall: amber
  base *= mix(0.75, 1.0, smoothstep(0.0012, 0.008, edge));                                              // darker ring inside the foam
  base = mix(base, uCofFoam * (0.6 + 0.6 * grain), cofFoamAmt * (1.0 - cofBub));
  base = mix(base, uCofFoam * 1.25, cofBub * rim * 0.75);
  diffuseColor.rgb = base;
}`,
    rough: /* glsl */`
roughnessFactor = mix(roughnessFactor, 0.55, cofFoamAmt * (1.0 - cofBub));`,
    normal: /* glsl */`
if (cofBub > 0.0) { vec3 bn = vCofNM * cofBubN; float bl = length(bn); if (bl > 1e-7) normal = normalize(normal + bn / bl * length(cofBubN) * cofBub); }`,
    lights: /* glsl */`
{
  mat3 toObj = transpose(vCofNM);
  vec3 Vo = normalize(toObj * normalize(vViewPosition)), No = normalize(toObj * normal);
  vec3 Ro = reflect(-Vo, No);
  // where does the mirrored ray leave the cup? below the lip it sees the glazed inner wall
  vec2 p = vCofP.xz, d = Ro.xz;
  float a = max(dot(d, d), 1e-6), b = dot(p, d), c = dot(p, p) - uCof.x * uCof.x;
  float t = (-b + sqrt(max(b * b - a * c, 0.0))) / a;
  float yh = vCofP.y + t * Ro.y;
  float wall = (1.0 - smoothstep(uCof.z - 0.0034, uCof.z - 0.0008, yh)) * step(0.0, Ro.y);
  vec2 hn = -normalize(p + t * d);
  vec3 keyO = normalize(toObj * (mat3(viewMatrix) * uCofKey));
  float lit = 0.34 + 0.9 * smoothstep(-0.25, 0.9, dot(hn, normalize(keyO.xz + 1e-5)) * length(keyO.xz) + 0.25 * keyO.y);
  float ao = 0.35 + 0.65 * smoothstep(vCofP.y, uCof.z, yh);
  float F = 0.02 + 0.98 * pow(1.0 - clamp(dot(No, Vo), 0.0, 1.0), 5.0);
  reflectedLight.indirectSpecular = mix(reflectedLight.indirectSpecular, uCofWall * (lit * ao * F), wall * (1.0 - cofFoamAmt));
}`,
  };
}

function handleGeometry(lengthSegs, radialSegs) {
  // C-shaped strap in the XY plane on the +X side, ends buried in the wall.
  const curve = new THREE.CatmullRomCurve3([
    [0.0388, 0.0705], [0.0450, 0.0738], [0.0560, 0.0752], [0.0648, 0.0680], [0.0688, 0.0540],
    [0.0668, 0.0375], [0.0585, 0.0245], [0.0478, 0.0185], [0.0352, 0.0178]
  ].map(p => new THREE.Vector3(p[0], p[1], 0)), false, 'centripetal');
  const cols = radialSegs + 1, rows = lengthSegs + 1;
  const pos = new Float32Array(rows * cols * 3), uv = new Float32Array(rows * cols * 2);
  const p = new THREE.Vector3(), t = new THREE.Vector3(), N = new THREE.Vector3();
  const ss = (a, b, x) => { x = Math.min(1, Math.max(0, (x - a) / (b - a))); return x * x * (3 - 2 * x); };
  const e = 2 / 2.7; // superellipse exponent: soft rounded strap section
  for (let i = 0; i < rows; i++) {
    const u = i / lengthSegs;
    curve.getPointAt(u, p); curve.getTangentAt(u, t);
    N.set(-t.y, t.x, 0).normalize();
    // a pulled handle: it flares where it is luted onto the wall, slimmer through the grip
    const flare = 1 + 0.42 * (1 - ss(0, 0.16, u)) + 0.46 * (1 - ss(0, 0.16, 1 - u));
    const mid = 1 - 0.18 * Math.sin(u * Math.PI);
    const hw = 0.0060 * (1 + 0.55 * (flare - 1)) * mid, ht = 0.0042 * flare * (0.92 + 0.08 * mid);
    for (let k = 0; k < cols; k++) {
      const a = k / radialSegs * TAU, c = Math.cos(a), s = Math.sin(a);
      const x = Math.sign(c) * Math.pow(Math.abs(c), e), z = Math.sign(s) * Math.pow(Math.abs(s), e);
      const o = i * cols + k;
      pos[o * 3] = p.x + N.x * ht * x; pos[o * 3 + 1] = p.y + N.y * ht * x; pos[o * 3 + 2] = hw * z;
      uv[o * 2] = k / radialSegs; uv[o * 2 + 1] = u;
    }
  }
  const idx = [];
  for (let i = 0; i < rows - 1; i++) for (let k = 0; k < radialSegs; k++) {
    const a = i * cols + k, b = a + 1, c = a + cols, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // computeVertexNormals leaves the seam column unsmoothed: average the duplicated column
  const n = g.attributes.normal;
  for (let i = 0; i < rows; i++) {
    const a = i * cols, b = a + radialSegs;
    const x = n.getX(a) + n.getX(b), y = n.getY(a) + n.getY(b), z = n.getZ(a) + n.getZ(b), l = Math.hypot(x, y, z) || 1;
    n.setXYZ(a, x / l, y / l, z / l); n.setXYZ(b, x / l, y / l, z / l);
  }
  g.computeBoundingSphere(); g.computeBoundingBox();
  return g;
}

// A set-down as a pure function of the time since the touch (see the header).
export function sloshAt(t, { amp = 0.0028, freq = 3.6, zeta = 0.3, dir = 0, ripple = 0.0004 } = {}) {
  if (!(t > 0)) return [0, 0, 0, 0];
  const w = TAU * freq, wd = w * Math.sqrt(1 - zeta * zeta);
  const tp = Math.atan2(wd, zeta * w) / wd, peak = Math.exp(-zeta * w * tp) * Math.sin(wd * tp);   // normalize: the first swing reaches `amp`
  const a = amp * Math.exp(-zeta * w * t) * Math.sin(wd * t) / peak;
  const rr = ripple * Math.exp(-t / 0.32) * (1 - Math.exp(-t / 0.03));
  return [a * Math.cos(dir), a * Math.sin(dir), rr, TAU * 7.5 * t];
}

export function createMug({ quality = 'high', renderer = null, look = null } = {}) {
  const low = quality === 'low';
  const segs = low ? 40 : 64;
  const { H, ro, ri, coffeeY, foot } = MUG;
  const group = new THREE.Group(); group.name = 'mug';
  const S = studio({ look, renderer, quality }), L = S.look;

  // body profile, walked with the solid on the left: recessed underside, foot ring, the trimmed ledge where the
  // glaze stops, outer wall, rounded lip, inner wall, floor
  const P = new Profile();
  P.tag('under').push(0, 0.0030).line(0.0292, 0.0030, 1).line(0.0302, 0.0006, 1)
    .tag('foot').arc(0.0309, 0.0007, 0.0007, Math.PI, Math.PI * 1.5, 2).line(0.0344, 0, 1)
    .arc(0.0344, 0.0007, 0.0007, -Math.PI / 2, 0, 2).line(foot, 0.0017, 1)
    .tag('ledge').line(0.0356, 0.0022, 1)
    .tag('out').line(0.0359, 0.0026, 1)
    .bez([0.0368, 0.0040], [0.0388, 0.0520], [ro, H - 0.0019], low ? 8 : 11)
    .tag('lip').arc(ro - 0.0019, H - 0.0019, 0.0019, 0, Math.PI, low ? 8 : 10)
    .tag('in').line(0.03618, coffeeY + 0.0030, 2).bez([0.0358, 0.0560], [0.0348, 0.0300], [0.0336, 0.0125], 4)
    .arc(0.0276, 0.0125, 0.006, 0, -Math.PI / 2, 2)
    .line(0, 0.0065, 1);
  P.finish();
  const [cGlaze, cBreak, cCream, cClay, cClayD] = [MUG_COL.glaze, MUG_COL.breakLip, MUG_COL.cream, MUG_COL.clay, MUG_COL.clayDark].map(h => lin(h).toArray());
  const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const sm = (a, b, x) => { x = Math.min(1, Math.max(0, (x - a) / (b - a))); return x * x * (3 - 2 * x); };
  const colorAt = i => {
    const [r, y] = P.pts[i], t = P.tags[i];
    if (t === 'under') return mixc(cClayD, cClayD, 0);
    if (t === 'foot' || t === 'ledge') return mixc(cClay, cClayD, sm(0.0010, 0, y) * 0.5);
    if (t === 'out') return mixc(cGlaze, cBreak, 0.10 * sm(H - 0.006, H - 0.0019, y)).map(c => c * (0.86 + 0.14 * sm(0.0026, 0.012, y)));   // pooled thicker at the foot
    if (t === 'lip') { const a = Math.atan2(y - (H - 0.0019), r - (ro - 0.0019)); return mixc(mixc(cGlaze, cBreak, 0.10 + 0.52 * Math.sin(a) ** 3), cCream, sm(1.9, 2.9, a)); }
    return mixc(cCream, cCream, 0).map(c => c * (0.80 + 0.20 * sm(coffeeY - 0.001, H - 0.003, y)));       // liner: darker toward the coffee
  };
  const glazeAt = i => (P.tags[i] === 'under' || P.tags[i] === 'foot' || P.tags[i] === 'ledge' ? 0 : 1);
  const bodyGeo = revolve(P, 0, P.pts.length - 1, segs, 0.2, { color: { size: 3, at: colorAt }, aGlaze: { size: 1, at: glazeAt } });

  const glaze = material(L, { color: 0xffffff, vertexColors: true, roughness: 0.42, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.11 },
    { micro: { gen: 'wobble', tile: 0.06, normal: 0, rough: 0, coat: 0.035 } }, mugHook(low));
  const body = new THREE.Mesh(bodyGeo, glaze); body.name = 'mugBody';

  const handleGeo = handleGeometry(low ? 22 : 32, low ? 8 : 12);
  constantAttribute(handleGeo, 'color', cGlaze); constantAttribute(handleGeo, 'aGlaze', [1]);
  const handle = new THREE.Mesh(handleGeo, glaze); handle.name = 'mugHandle';

  // coffee: a polar disc with the meniscus climbing the wall, planar uv
  const lipI = P.tags.indexOf('in');
  const rWall = radiusAt(P, lipI, P.pts.length - 1, coffeeY), cr = rWall + 0.0003;
  const C = new Profile();
  C.push(0, coffeeY);
  for (const f of [0.22, 0.42, 0.6, 0.75, 0.86, 0.925]) C.push(cr * f, coffeeY);
  for (const e of [0.0020, 0.0012, 0.0007, 0.0003, 0]) C.push(cr - e, coffeeY + 0.0011 * Math.exp(-e / 0.00075));
  C.reverse().finish();
  const cg = revolve(C, 0, C.pts.length - 1, low ? 32 : 48, 0.2);
  {
    const p = cg.attributes.position, uv = cg.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, 0.5 + p.getX(i) / (2 * cr), 0.5 - p.getZ(i) / (2 * cr));
  }
  // a few bubbles against the wall (x, z, radius; meters), fixed
  let s = 23; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const bubbles = [];
  for (const [a0, n] of [[2.25, 3], [5.35, 2], [0.75, 1]]) for (let i = 0; i < n; i++) {
    const rad = 0.0005 + rnd() * 0.0008, a = a0 + (rnd() - 0.5) * 0.5, rr = cr - rad - 0.0002 - rnd() * 0.0016;
    bubbles.push([Math.cos(a) * rr, Math.sin(a) * rr, rad]);
  }
  const G = coffeeGLSL(bubbles);
  const uniforms = {
    uSlosh: { value: new THREE.Vector4(0, 0, 0, 0) },
    uCof: { value: new THREE.Vector4(cr, coffeeY, H, 24) },
    uCofWall: { value: lin(MUG_COL.cream) }, uCofFoam: { value: lin(0x86603a) },
    uCofRaft: { value: new THREE.Vector4(Math.cos(2.3) * (cr - 0.001), Math.sin(2.3) * (cr - 0.001), Math.cos(5.3) * (cr - 0.0008), Math.sin(5.3) * (cr - 0.0008)) },
    uCofKey: { value: new THREE.Vector3(...((L && L.studio && L.studio.key) || [-0.62, 0.58, 0.52])).normalize() },
  };
  const coffeeMat = material(L, { color: 0x21130a, roughness: 0.10, metalness: 0, ior: 1.33, specularIntensity: 1 }, {}, m => {
    m.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, uniforms);
      let vs = shader.vertexShader, fs = shader.fragmentShader;
      vs = insertAfter(vs, 'common', G.vpars);
      vs = insertAfter(vs, 'beginnormal_vertex', G.vnormal);
      vs = insertAfter(vs, 'begin_vertex', G.vmain);
      fs = insertAfter(fs, 'common', G.fpars);
      fs = insertAfter(fs, 'color_fragment', G.color);
      fs = insertAfter(fs, 'roughnessmap_fragment', G.rough);
      fs = insertAfter(fs, 'normal_fragment_maps', G.normal);
      fs = insertAfter(fs, 'lights_fragment_end', G.lights);
      shader.vertexShader = vs; shader.fragmentShader = fs;
    };
    m.customProgramCacheKey = () => 'mug-coffee-2';
  });
  const coffeeSurface = new THREE.Mesh(cg, coffeeMat); coffeeSurface.name = 'coffeeSurface';

  group.add(body, handle, coffeeSurface);

  const mats = [glaze, coffeeMat], geos = [bodyGeo, handleGeo, cg];
  const api = {
    group, duration: 0,
    setProgress() {}, update() {},
    // the coffee surface, a pure function of its inputs (see the header)
    setSlosh(x = 0, z = 0, ripple = 0, phase = 0) { uniforms.uSlosh.value.set(x, z, ripple, phase); },
    settle(t, opts) { const v = sloshAt(t, opts); uniforms.uSlosh.value.set(v[0], v[1], v[2], v[3]); },
    dispose() { geos.forEach(g => g.dispose()); mats.forEach(m => m.dispose()); S.release(); },
    bodyMesh: body, handleMesh: handle, coffeeSurface, coffeeMaterial: coffeeMat, glazeMaterial: glaze,
    coffeeY, coffeeRadius: cr, rimRadius: ri, rimY: H, height: H, outerRadius: ro, footRadius: foot,
    triangles: () => triCount(group)
  };
  group.userData.prop = api;       // a handle for labs and capture tools
  return api;
}

// ---------------------------------------------------------------- can
// A standard 12 oz (355 ml) beverage can with a 202 end: body 66.2 mm, 122.2 mm tall, necked to a 54.6 mm double
// seam, stand ring 47.6 mm with a 10 mm dome.
const CAN = { R: 0.03310, H: 0.1222, circumference: TAU * 0.03310, stand: 0.0238 };

// convex hull (monotone chain) of 2D points, used to blend the tab's ring and nose
function hull(points) {
  const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  lo.pop(); up.pop(); return lo.concat(up);
}
function ellipsePts(cx, cy, rx, ry, n, a0 = 0, a1 = TAU) {
  const out = []; for (let i = 0; i < n; i++) { const a = a0 + (a1 - a0) * i / n; out.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]); } return out;
}
const superEllipse = (x, z, cx, cz, rx, rz, e = 2.6) => Math.pow(Math.pow(Math.abs((x - cx) / rx), e) + Math.pow(Math.abs((z - cz) / rz), e), 1 / e);

export function createCan({ quality = 'high', renderer = null, look = null } = {}) {
  const low = quality === 'low';
  const segs = low ? 32 : 48;
  const { R, H, circumference, stand } = CAN;
  const group = new THREE.Group(); group.name = 'can';
  const S = studio({ look, renderer, quality }), L = S.look;
  const P = new Profile();

  // --- bottom: concave dome, stand ring, the chime wall that blends into the body
  const rRing = stand, dRing = 0.0017, domeR = 0.0320;
  const sag = domeR - Math.sqrt(domeR * domeR - rRing * rRing);
  const th = Math.asin(rRing / domeR);                       // slope of the dome where it meets the ring
  const yEnd = dRing * (1 - Math.cos(th));                    // so that the ring's lowest point is y = 0
  const dome0 = yEnd + sag, domeCy = dome0 - domeR;
  P.tag('base');
  for (let i = 0; i <= 2; i++) {                             // apex first, walking outward and down
    const a = Math.PI / 2 - th * i / 2;
    P.push(domeR * Math.cos(a), domeCy + domeR * Math.sin(a));
  }
  // ring arc, ccw, starting with the tangent of the dome (pointing outward and down)
  const a0 = -Math.PI / 2 - th, a1 = -0.62;
  P.arc(rRing + dRing * Math.sin(th), yEnd + dRing * Math.cos(th), dRing, a0, a1, 5);
  const tEnd = [-Math.sin(a1), Math.cos(a1)], pe = P.last;
  P.mark('baseTop');                                          // the body mesh starts at the stand ring: the chime sweats too
  // --- body: chime, wall, shoulder, the smooth die neck
  P.tag('body').bez([pe[0] + tEnd[0] * 0.0040, pe[1] + tEnd[1] * 0.0040], [R, 0.0108 - 0.0046], [R, 0.0108], 6)
    .line(R, 0.1036, 1)
    .bez([R, 0.1062], [0.0318, 0.1082], [0.0297, 0.1108], low ? 5 : 8)
    .bez([0.0279, 0.1130], [0.0264, 0.1140], [0.0263, 0.1160], low ? 5 : 8);
  P.mark('neckTop');
  // --- top: the double seam, chuck wall, countersink, panel
  P.tag('top').bez([0.0263, 0.1166], [0.0273, 0.1164], [0.0273, 0.1172], 4)
    .line(0.0273, 0.1211, 1)
    .arc(0.0262, 0.1211, 0.0011, 0, Math.PI * 0.5, 3)        // seam top, outer shoulder
    .arc(0.0259, 0.1215, 0.0007, Math.PI * 0.5, Math.PI * 1.08, 3)   // over the top and into the chuck wall
    .line(0.0241, 0.1164, 1)
    .arc(0.0235, 0.11625, 0.00058, 0.25, -Math.PI * 1.02, 5)  // countersink
    .line(0.0227, 0.1176, 1)
    .arc(0.0221, 0.1176, 0.0006, 0, Math.PI / 2, 3);          // panel radius
  P.mark('panelEdge');
  P.finish();
  const pb = P.marks.baseTop, pn = P.marks.neckTop, pe2 = P.marks.panelEdge;
  const panelY = 0.1182, panelR = 0.0221;

  // --- materials
  // body: ironed aluminum under clear lacquer. The reflection is a soft vertical mirror; the lacquer adds a sharper one.
  const bodyMaterial = material(L, { color: 0xbcc0c5, metalness: 1, roughness: 0.30, anisotropy: 0.25, clearcoat: 0.45, clearcoatRoughness: 0.1 },
    { axis: [0, 1, 0], envIntensity: 0.72, micro: { gen: 'brushed', tile: 0.05, normal: 0.10, rough: 0.07, planes: [1, 0, 1] } });
  // ends: bare formed aluminum, a little brighter and smoother; vertex colours darken the countersink and the grooves
  const endsMat = material(L, { color: 0xffffff, vertexColors: true, metalness: 1, roughness: 0.34 },
    { envIntensity: 0.78, micro: { gen: 'brushed', tile: 0.006, normal: 0.14, rough: 0.06 } });
  const tabMat = material(L, { color: 0xffffff, vertexColors: true, metalness: 1, roughness: 0.24 }, { envIntensity: 0.85 });

  const bodyMesh = new THREE.Mesh(revolve(P, pb, pn, low ? 48 : 72, circumference), bodyMaterial); bodyMesh.name = 'canBody';
  bodyMesh.userData.uvMetres = circumference;

  // ends: base + top (seam, chuck wall, countersink) + the panel with its finger well, one mesh
  const alu = lin(0xdfe2e6), aluDark = lin(0x8d9198);
  const tint = (c, k) => [c.r * k, c.g * k, c.b * k];
  const topColor = i => {
    const [r, y] = P.pts[i];
    const k = 1 - 0.55 * sm01(0.1176, 0.1160, y) * sm01(0.0262, 0.0245, r);     // the countersink is a shadowed groove
    return tint(alu, k);
  };
  const baseGeo = revolve(P, 0, pb, segs, circumference, { color: { size: 3, at: () => tint(alu, 0.94) } });
  const topGeo = revolve(P, pn, pe2, segs, circumference, { color: { size: 3, at: topColor } });
  // panel: a polar disc, pressed down into the finger well under the tab's ring, with a faint raised bead
  const rings = low ? 7 : 10, pcols = segs + 1;
  const ppos = new Float32Array((rings + 1) * pcols * 3), puv = new Float32Array((rings + 1) * pcols * 2), pcol = new Float32Array((rings + 1) * pcols * 3);
  const well = (x, z) => {
    const q = superEllipse(x, z, 0.0122, 0, 0.0082, 0.0090);
    const bead = q < 1.2 ? 0 : Math.exp(-(((Math.hypot(x, z) - 0.0178) / 0.0007) ** 2)) * 0.00022;   // a faint stiffening bead
    return -0.00075 * (1 - sm01(0.62, 1.0, q)) + bead;
  };
  for (let j = 0; j <= rings; j++) {
    const r = panelR * Math.pow(j / rings, 0.8);
    for (let k = 0; k < pcols; k++) {
      const a = (k % segs) / segs * TAU, x = r * Math.sin(a), z = r * Math.cos(a), o = j * pcols + k;
      ppos[o * 3] = x; ppos[o * 3 + 1] = panelY + well(x, z); ppos[o * 3 + 2] = z;
      puv[o * 2] = k / segs; puv[o * 2 + 1] = j / rings;
      const c = tint(alu, 0.80 - 0.14 * (1 - sm01(0.5, 1.0, superEllipse(x, z, 0.0122, 0, 0.0082, 0.0090))));   // the panel a tone down, the well deeper
      pcol[o * 3] = c[0]; pcol[o * 3 + 1] = c[1]; pcol[o * 3 + 2] = c[2];
    }
  }
  const pidx = [];
  for (let j = 0; j < rings; j++) for (let k = 0; k < segs; k++) {
    const a = j * pcols + k, b = a + 1, c = a + pcols, d = c + 1;
    if (j > 0) pidx.push(a, b, c);
    pidx.push(b, d, c);
  }
  const panelGeo = new THREE.BufferGeometry();
  panelGeo.setAttribute('position', new THREE.BufferAttribute(ppos, 3));
  panelGeo.setAttribute('uv', new THREE.BufferAttribute(puv, 2));
  panelGeo.setAttribute('color', new THREE.BufferAttribute(pcol, 3));
  panelGeo.setIndex(pidx); panelGeo.computeVertexNormals();
  {
    const n = panelGeo.attributes.normal;                    // seam column and the center fan
    for (let j = 0; j <= rings; j++) {
      const a = j * pcols, b = a + segs;
      const x = n.getX(a) + n.getX(b), y = n.getY(a) + n.getY(b), z = n.getZ(a) + n.getZ(b), l = Math.hypot(x, y, z) || 1;
      n.setXYZ(a, x / l, y / l, z / l); n.setXYZ(b, x / l, y / l, z / l);
    }
    for (let k = 0; k < pcols; k++) { n.setXYZ(k, 0, 1, 0); n.setXYZ(rings * pcols + k, 0, 1, 0); }
  }
  const endsGeo = merge([baseGeo, topGeo, panelGeo]);
  const endsMesh = new THREE.Mesh(endsGeo, endsMat); endsMesh.name = 'canEnds';
  group.add(bodyMesh, endsMesh);

  // --- stay-on tab (a ring for the finger and a nose over the opening), its rivet, and the score line: one mesh
  const tabY = panelY + 0.0005;
  const outline = hull([...ellipsePts(0.0108, 0, 0.0083, 0.0076, low ? 20 : 28), ...ellipsePts(-0.0030, 0, 0.0045, 0.0045, low ? 12 : 16)]);
  const shape = new THREE.Shape(outline.map(p => new THREE.Vector2(p[0], p[1])));
  shape.holes.push(new THREE.Path(ellipsePts(0.0116, 0, 0.0049, 0.0041, low ? 14 : 20).map(p => new THREE.Vector2(p[0], p[1]))));
  const tabGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.00055, bevelEnabled: true, bevelThickness: 0.00028, bevelSize: 0.00030, bevelSegments: 2, curveSegments: 8 });
  tabGeo.rotateX(-Math.PI / 2); tabGeo.rotateZ(0.025); tabGeo.translate(0, tabY + 0.00028, 0);   // the ring end stands a little proud
  const rivetGeo = new THREE.SphereGeometry(0.0027, low ? 12 : 18, low ? 4 : 6, 0, TAU, 0, Math.PI / 2); rivetGeo.scale(1, 0.40, 1);
  rivetGeo.translate(0, tabY + 0.0011, 0);
  const studGeo = new THREE.CylinderGeometry(0.0021, 0.0026, tabY - panelY + 0.0004, low ? 10 : 14, 1, true);
  studGeo.translate(0, (tabY + panelY) / 2, 0);
  // the score: a hairline groove around the opening the nose presses in (a rounded tongue from the rivet outward)
  const sc = (rx, rz) => ellipsePts(-0.0104, 0, rx, rz, low ? 28 : 40);
  const score = new THREE.Shape(sc(0.0098, 0.0080).map(p => new THREE.Vector2(p[0], p[1])));
  score.holes.push(new THREE.Path(sc(0.00945, 0.00765).map(p => new THREE.Vector2(p[0], p[1]))));
  const scoreGeo = new THREE.ShapeGeometry(score, 24); scoreGeo.rotateX(-Math.PI / 2); scoreGeo.translate(0, panelY + 0.00006, 0);
  const strip = g => { const n = g.index ? g.toNonIndexed() : g; if (n !== g) g.dispose(); n.deleteAttribute('uv'); return n; };
  const parts = [[tabGeo, tint(alu, 1.0)], [rivetGeo, tint(alu, 0.98)], [studGeo, tint(alu, 0.8)], [scoreGeo, [aluDark.r * 0.5, aluDark.g * 0.5, aluDark.b * 0.5]]]
    .map(([g, c]) => constantAttribute(strip(g), 'color', c));
  const tabMesh = new THREE.Mesh(merge(parts), tabMat); tabMesh.name = 'canTab';
  group.add(tabMesh);

  const mats = [bodyMaterial, endsMat, tabMat];
  const geos = [bodyMesh.geometry, endsGeo, tabMesh.geometry];
  return {
    group, duration: 0,
    setProgress() {}, update() {},
    dispose() { geos.forEach(g => g.dispose()); mats.forEach(m => m.dispose()); S.release(); },
    bodyMesh, bodyMaterial, endsMesh, baseMesh: endsMesh, topMesh: endsMesh, tabMesh,
    height: H, radius: R, footRadius: stand, tabAngle: 0, panelY,
    // where the cold liquid is: the condensation hugs the wall below this height
    fillLine: 0.1085,
    triangles: () => triCount(group)
  };
}
function sm01(a, b, x) { x = Math.min(1, Math.max(0, (x - a) / (b - a))); return x * x * (3 - 2 * x); }

export default { createMug, createCan, sloshAt };
