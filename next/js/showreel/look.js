// SHOWREEL look: an opt-in studio look for ONE actor (the Therma-Shift pilot), so it can read as a filmed product
// while the rocket, the other reels and the page stay exactly as they were.
//
// Nothing here touches shared state. The renderer keeps NoToneMapping, the engine's four lights and its shared
// PMREM stay as they are, no light is added, no shadow map is turned on. Everything is per material or per mesh:
//
//   1. Environment: an actor-owned procedural studio (big soft key high front-left, tall rim strip right rear, top
//      panel, weak cool fill, neutral walls and the page as the floor), drawn once by a shader into an
//      equirectangular half-float target and prefiltered to a PMREM (cube 512 high, 256 low). Only materials the
//      look adopts receive it, parallax-corrected so the softboxes sit about 20 cm away (a flat plate shows a gradient).
//   2. Light: the engine's shared rig still lights these materials (lights are global in three.js; a scoped light
//      would change every program's light count, the rocket's included). Per material the look rescales its direct
//      diffuse, direct specular and hemisphere terms (uniform `light`), so the image-based studio carries the shape
//      and the shared rig only adds a touch of direct key. Hard directional specular dots on satin metal go away.
//   3. Tone: a filmic-neutral curve (Khronos PBR Neutral, mid-tones true, highlights roll off, no veil) applied in
//      each adopted material's own shader, in place of three's tone-mapping chunk (inactive under NoToneMapping).
//      Page whites and every other actor are untouched.
//   4. Materials: factory presets (MeshPhysicalMaterial or MeshStandardMaterial) with optional clearcoat,
//      anisotropy (the tangent comes from an object-space axis, so CAD meshes without UVs work) and a triplanar
//      micro surface (normal plus roughness) from procedural textures generated in time slices.
//   5. Ground: analytic soft contact shadows on a transparent receiver (no floor, no extra pass): every occluder is
//      a box or disc proxy that follows its object; each one adds a tight contact core, an area-light key shadow
//      whose penumbra widens with height, and a broad ambient occlusion. A second receiver can sit on a part (the
//      plate) for props. High tier can add a faint mirrored reflection that fades within a few centimetres.
//
// Costs (also in scratchpad report engine.md): 0 full-screen passes on both tiers; 1 draw call per receiver,
// +1 per reflected mesh (high only); one-time env build (one equirect draw plus a PMREM); procedural textures on the
// CPU in slices of at most SLICE_MS.
//
// API
//   getLook({ renderer, quality, THREE }) -> look       one per renderer (ref-counted; release() when done)
//   look.ready()                                         Promise: env built and every queued texture generated
//   look.adopt(rootOrMaterial, opts)                     give existing MeshStandard/Physical materials the look
//   look.material(preset, overrides, lookOpts)           a new material from a preset (see PRESETS)
//   look.physical(params, lookOpts) / look.standard(params, lookOpts)
//   look.tex.brushed|beadBlast|grain|layerLines|extrusion|wobble(opts) -> DataTexture (filled in slices)
//   look.tex.noise                                        { hash2, vnoise, fbm } (tileable value noise)
//   look.createGround({ parent, y, size, ... }) -> ground   ground.add(object, opts), ground.reflect(meshes, opts)
//   look.uniforms                                        { exposure, light } shared by every adopted material
//   look.toneGLSL                                        `vec3 lookTone(vec3)` for ShaderMaterials (steam etc.)
//   look.setStudioCenter(object, radius, offset)         near-field studio: env reflections parallax-corrected on a
//                                                        sphere of `radius` (object units) around the object
//   look.setStudio(studio)                               rebuild the environment from another STUDIO description
//   look.frame()                                         per-frame update (studio centre, mirrors); the engine pre-pass
//   look.stats()                                         { envMs, texMs, slices, p95SliceMs, maxSliceMs, textures, ... }
//   dressThermaShift({ engine, quality, stage, view, coaster, mug, can, plate, parts, presets })   the actor's one call
import * as THREE_ from '../three.module.min.js';

export const LOOK_VERSION = 1;
const SLICE_MS = 4;                 // texture generation yields once a slice has run this long (steps are 32 texels)

// ----------------------------------------------------------------- tiers
export const TIERS = {
  high: { env: 2048, tex: 512, anisotropy: true, reflection: true, maxOcc: 16, texAniso: 8 },
  low: { env: 1024, tex: 256, anisotropy: true, reflection: false, maxOcc: 12, texAniso: 4 },
};

// --------------------------------------------------------------- studio
// Each panel: direction to its centre (world, the camera looks down -Z), angular half size (deg, horizontal and
// vertical as seen from the object), corner radius (share of the smaller half size), radiance (linear), colour,
// `fall` (diffuser fall-off toward the edges, 0..1), `grad` (a linear gradient across the panel: [x, y] share).
export const STUDIO = {
  walls: { top: [0.20, 0.20, 0.21], horizon: [0.16, 0.16, 0.17], floor: [0.40, 0.39, 0.38], under: [0.18, 0.18, 0.18] },
  panels: [
    { name: 'key', dir: [-0.62, 0.58, 0.52], half: [40, 36], radius: 0.10, radiance: 3.0, color: [1.0, 0.985, 0.96], fall: 0.35, grad: [0.20, 0.25] },
    { name: 'top', dir: [-0.25, 0.85, -0.45], half: [42, 14], radius: 0.10, radiance: 1.3, color: [1.0, 1.0, 1.0], fall: 0.30, grad: [-0.7, 0.6] },
    { name: 'rim', dir: [0.80, 0.16, -0.58], half: [5.5, 36], radius: 0.35, radiance: 7.0, color: [1.0, 1.0, 1.0], fall: 0.10, grad: [0, 0.10] },
    { name: 'fill', dir: [0.78, -0.04, 0.62], half: [28, 18], radius: 0.15, radiance: 0.5, color: [0.86, 0.91, 1.0], fall: 0.40, grad: [0, 0] },
    { name: 'kicker', dir: [-0.86, 0.12, -0.50], half: [4, 22], radius: 0.35, radiance: 2.4, color: [1.0, 0.99, 0.97], fall: 0.10, grad: [0, 0] },
  ],
  key: [-0.62, 0.58, 0.52],          // the key's direction, used by the contact shadows
};

const f3 = a => `vec3(${a.map(x => (+x).toFixed(5)).join(',')})`;
const f1 = x => (+x).toFixed(5);

function studioShader(studio) {
  const W = studio.walls;
  let panels = '';
  for (const p of studio.panels) {
    const c = new THREE_.Vector3(...p.dir).normalize();
    const up0 = Math.abs(c.y) > 0.92 ? new THREE_.Vector3(0, 0, -1) : new THREE_.Vector3(0, 1, 0);
    const r = new THREE_.Vector3().crossVectors(up0, c).normalize();     // panel right, seen from the object
    const u = new THREE_.Vector3().crossVectors(c, r).normalize();
    const hx = Math.tan(p.half[0] * Math.PI / 180), hy = Math.tan(p.half[1] * Math.PI / 180);
    const rad = Math.min(hx, hy) * p.radius;
    panels += `
    { // ${p.name}
      float k = dot(d, ${f3(c.toArray())});
      if (k > 0.0) {
        vec2 q = vec2(dot(d, ${f3(r.toArray())}), dot(d, ${f3(u.toArray())})) / k;
        vec2 h = vec2(${f1(hx)}, ${f1(hy)});
        float sd = rrect(q, h, ${f1(rad)});
        float edge = 1.0 - smoothstep(-px * k, px * k, sd);
        vec2 n = q / h;
        float body = 1.0 - ${f1(p.fall)} * dot(n, n) * 0.5;
        body *= 1.0 + ${f1(p.grad[0])} * n.x + ${f1(p.grad[1])} * n.y;
        col += ${f3(p.color)} * (${f1(p.radiance)} * edge * max(body, 0.0));
      }
    }`;
  }
  return {
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `
    precision highp float;
    varying vec2 vUv;
    uniform float px;
    float rrect(vec2 p, vec2 h, float r) { vec2 q = abs(p) - h + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
    void main() {
      float phi = (vUv.x - 0.5) * 6.28318530718, th = (vUv.y - 0.5) * 3.14159265359;
      vec3 d = vec3(cos(th) * cos(phi), sin(th), cos(th) * sin(phi));
      // walls: a soft neutral studio, a touch brighter overhead, the page as a lit floor below the horizon
      float y = d.y;
      vec3 col = y >= 0.0 ? mix(${f3(W.horizon)}, ${f3(W.top)}, pow(y, 0.6))
                          : mix(${f3(W.floor)}, ${f3(W.under)}, smoothstep(0.0, 1.0, -y * 1.6));
      col = mix(col, ${f3(W.horizon)}, (1.0 - smoothstep(0.0, 0.06, abs(y))) * 0.5);
      ${panels}
      gl_FragColor = vec4(col, 1.0);
    }`,
  };
}

// ------------------------------------------------------------ tone + light
const TONE_GLSL = `
uniform float lookExposure;
// Khronos PBR Neutral: mid-tones stay true, highlights roll off toward white without a hue shift or a veil.
vec3 lookTone(vec3 color) {
  color *= lookExposure;
  const float startCompression = 0.8 - 0.04;
  const float desaturation = 0.15;
  float x = min(color.r, min(color.g, color.b));
  float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  color -= offset;
  float peak = max(color.r, max(color.g, color.b));
  if (peak < startCompression) return color;
  const float d = 1.0 - startCompression;
  float newPeak = 1.0 - d * d / (peak + d - startCompression);
  color *= newPeak / peak;
  float g = 1.0 - 1.0 / (desaturation * (peak - newPeak) + 1.0);
  return mix(color, vec3(newPeak), g);
}`;

const MICRO_VERT_PARS = `
varying vec3 vLookP;
varying vec3 vLookN;
#ifdef LOOK_ANISO
uniform vec3 lookAxis;
varying vec3 vLookT;
#endif`;
const MICRO_VERT = `
vLookP = transformed;
vLookN = objectNormal;
#ifdef LOOK_ANISO
vLookT = normalize((modelViewMatrix * vec4(lookAxis, 0.0)).xyz);
#endif`;
const MICRO_FRAG_PARS = `
#ifdef LOOK_MICRO
uniform sampler2D lookMicroMap;
uniform vec4 lookMicro;     // x: 1 / tile (m), y: normal strength, z: roughness amount, w: clearcoat normal strength
uniform vec3 lookPlanes;    // strength per projection plane (x, y, z)
uniform mat3 normalMatrix;
varying vec3 vLookP;
varying vec3 vLookN;
vec4 lookTri;               // r, g: averaged tangent normal, b: roughness offset, a: height
vec3 lookMicroN(vec3 n) {   // triplanar, UDN blend, object space
  vec3 w = pow(abs(n), vec3(4.0)); w /= (w.x + w.y + w.z);
  vec3 p = vLookP * lookMicro.x;
  vec4 tx = texture2D(lookMicroMap, p.zy), ty = texture2D(lookMicroMap, p.xz), tz = texture2D(lookMicroMap, p.xy);
  lookTri = tx * w.x + ty * w.y + tz * w.z;
  vec2 nx = (tx.rg * 2.0 - 1.0) * lookPlanes.x, ny = (ty.rg * 2.0 - 1.0) * lookPlanes.y, nz = (tz.rg * 2.0 - 1.0) * lookPlanes.z;
  vec3 a = vec3(nx + n.zy, n.x).zyx, b = vec3(ny + n.xz, n.y).xzy, c = vec3(nz + n.xy, n.z);
  return normalize(a * w.x + b * w.y + c * w.z);
}
#endif
#ifdef LOOK_ANISO
varying vec3 vLookT;
#endif`;
const MICRO_ROUGH = `
#ifdef LOOK_MICRO
vec3 lookN0 = normalize(vLookN);
vec3 lookN1 = lookMicroN(lookN0);
roughnessFactor = clamp(roughnessFactor + lookMicro.z * (lookTri.b * 2.0 - 1.0), 0.03, 1.0);
#endif`;
const MICRO_NORMAL = `
#ifdef LOOK_MICRO
{
  vec3 dn = normalMatrix * (lookN1 - lookN0);
  #ifdef DOUBLE_SIDED
    dn *= faceDirection;
  #endif
  normal = normalize(normal + dn * lookMicro.y);
}
#endif
#ifdef LOOK_ANISO
{
  // the brushing axis projected into the surface; where it runs into the surface (an end face, a pole) fall back to
  // any tangent, blended so curved surfaces stay smooth
  vec3 t = vLookT - normal * dot(normal, vLookT);
  float tl = length(t);
  vec3 alt = normalize(cross(normal, abs(normal.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  vec3 T = normalize(mix(alt, t / max(tl, 1e-4), smoothstep(0.05, 0.3, tl)));
  tbn = mat3(T, cross(normal, T), normal);
}
#endif`;
const MICRO_COAT = `
#if defined(LOOK_MICRO) && defined(USE_CLEARCOAT)
{
  vec3 dn = normalMatrix * (lookN1 - lookN0);
  #ifdef DOUBLE_SIDED
    dn *= faceDirection;
  #endif
  clearcoatNormal = normalize(clearcoatNormal + dn * lookMicro.w);
}
#endif`;
// Near-field studio: the environment is treated as a sphere of radius lookEnv.w around lookEnv.xyz (world), so a
// flat plate sees the softbox move across it (a long gradient) the way a real one a metre away does. Radius 0 = off.
const PARALLAX_VERT_PARS = `
varying vec3 vLookW;`;
const PARALLAX_VERT = `
#ifdef USE_INSTANCING
vLookW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
#else
vLookW = (modelMatrix * vec4(transformed, 1.0)).xyz;
#endif`;
const PARALLAX_FRAG_PARS = `
uniform vec4 lookEnv;
uniform float lookNear;     // this material's share of the studio radius (1 = the shared one; a flat plate sets less)
varying vec3 vLookW;
vec3 lookParallax(vec3 r) {
  if (lookEnv.w <= 0.0) return r;
  vec3 p = vLookW - lookEnv.xyz;
  float R = lookEnv.w * lookNear;
  // a part that flies out of the studio sphere (the exploded view, a prop carried in) is held just inside it, so the
  // lookup stays continuous (outside, rays missed the sphere and the reflection broke along a hard edge)
  float L = length(p), m = 0.9 * R;
  if (L > m) p *= m / L;
  float b = dot(p, r), c = dot(p, p) - R * R;
  float h = b * b - c;
  if (h < 0.0) return r;
  return normalize(p + (-b + sqrt(h)) * r);
}`;
const LIGHT_PARS = `
uniform vec3 lookLight;     // x: direct diffuse, y: direct specular, z: hemisphere (shared rig) gains`;
const LIGHT_BEGIN = `
irradiance *= lookLight.z;`;
const LIGHT_END = `
reflectedLight.directDiffuse *= lookLight.x;
reflectedLight.directSpecular *= lookLight.y;
#ifdef USE_CLEARCOAT
clearcoatSpecularDirect *= lookLight.y;
#endif`;

function after(src, chunk, add) {
  const tag = `#include <${chunk}>`;
  return src.includes(tag) ? src.replace(tag, `${tag}\n${add}`) : src;
}

// -------------------------------------------------------------- scheduler
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
function yieldTask() {
  return new Promise(r => {
    if (typeof MessageChannel !== 'undefined') { const c = new MessageChannel(); c.port1.onmessage = () => r(); c.port2.postMessage(0); }
    else setTimeout(r, 0);
  });
}
function createScheduler(stats) {
  const queue = [];
  let running = null;
  async function run() {
    while (queue.length) {
      const job = queue[0];
      const t0 = now();
      let done = false;
      try { while (!(done = job.it.next().done) && now() - t0 < SLICE_MS); } catch (e) { done = true; job.fail(e); }
      const dt = now() - t0;
      stats.texMs += dt; stats.slices++; if (dt > stats.maxSliceMs) stats.maxSliceMs = dt; stats.sliceList.push(dt);
      if (done) { queue.shift(); job.ok(); }
      await yieldTask();
    }
    running = null;
  }
  return {
    add(it) {
      let ok, fail; const p = new Promise((a, b) => { ok = a; fail = b; });
      queue.push({ it, ok, fail });
      if (!running) running = run();
      return p;
    },
    idle: () => running || Promise.resolve(),
  };
}

// ---------------------------------------------------------- noise (tileable)
function hash2(x, y, seed) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
// value noise on a periodic px x py lattice; x, y in lattice units
function vnoise(x, y, px, py, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const x0 = ((xi % px) + px) % px, y0 = ((yi % py) + py) % py, x1 = (x0 + 1) % px, y1 = (y0 + 1) % py;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash2(x0, y0, seed), b = hash2(x1, y0, seed), c = hash2(x0, y1, seed), d = hash2(x1, y1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, px, py, seed, oct = 4, gain = 0.5) {
  let s = 0, a = 0.5, n = 0;
  for (let o = 0; o < oct; o++) { s += a * vnoise(x, y, px, py, seed + o * 17); n += a; a *= gain; x *= 2; y *= 2; px *= 2; py *= 2; }
  return s / n;
}
export const noise = { hash2, vnoise, fbm };

// --------------------------------------------------------- micro textures
// Every generator writes a height field h(u, v) in [-1, 1] (tileable), then turns it into an RGBA8 micro map:
// RG the tangent normal (u, v), B a roughness offset around 0.5, A the height. Lines and grain run along u.
function* heightToMap(h, rough, size, data, bump) {
  const at = (x, y) => h[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * bump, dy = (at(x, y + 1) - at(x, y - 1)) * bump;
      const l = Math.hypot(dx, dy, 1), i = (y * size + x) * 4;
      data[i] = Math.round((-dx / l * 0.5 + 0.5) * 255);
      data[i + 1] = Math.round((-dy / l * 0.5 + 0.5) * 255);
      data[i + 2] = Math.max(0, Math.min(255, Math.round((0.5 + 0.5 * rough[y * size + x]) * 255)));
      data[i + 3] = Math.round((0.5 + 0.5 * h[y * size + x]) * 255);
      if ((x & 31) === 31) yield;
    }
    yield;
  }
}
const GEN = {
  // brushed or ironed metal: long fine streaks along u, a few deeper scratches, slow banding
  *brushed(o, h, r, n) {
    const L = o.streak || 6, R = o.lines || n / 2, seed = o.seed || 1;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const u = x / n, v = y / n;
        let s = 0.55 * (vnoise(u * L, v * R, L, R, seed) * 2 - 1) + 0.3 * (vnoise(u * L * 2, v * R * 2, L * 2, R * 2, seed + 3) * 2 - 1);
        s += 0.25 * (fbm(u * 2, v * 6, 2, 6, seed + 9, 3) * 2 - 1);
        const sc = hash2(0, Math.floor(v * R * 1.5), seed + 41);
        if (sc > 0.985) s -= 0.9 * (vnoise(u * 3, 0, 3, 1, seed + y) > 0.45 ? 1 : 0);
        h[y * n + x] = s; r[y * n + x] = 0.35 * s;
        if ((x & 31) === 31) yield;
      }
      yield;
    }
  },
  // extrusion die lines: cleaner, more regular streaks along u
  *extrusion(o, h, r, n) {
    const R = o.lines || n / 4, seed = o.seed || 2;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const u = x / n, v = y / n;
        const s = 0.7 * (vnoise(u * 2, v * R, 2, R, seed) * 2 - 1) + 0.3 * (vnoise(u * 3, v * R * 3, 3, R * 3, seed + 5) * 2 - 1);
        h[y * n + x] = s; r[y * n + x] = 0.2 * s;
        if ((x & 31) === 31) yield;
      }
      yield;
    }
  },
  // bead blast: isotropic fine dimples (two scales)
  *beadBlast(o, h, r, n) {
    const C = o.cells || n / 3, seed = o.seed || 3;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const u = x / n, v = y / n;
        const s = 0.65 * (vnoise(u * C, v * C, C, C, seed) * 2 - 1) + 0.35 * (vnoise(u * C * 2, v * C * 2, C * 2, C * 2, seed + 7) * 2 - 1);
        h[y * n + x] = s; r[y * n + x] = 0.5 * (fbm(u * 16, v * 16, 16, 16, seed + 11, 2) * 2 - 1);
        if ((x & 31) === 31) yield;
      }
      yield;
    }
  },
  // molded or printed plastic grain: fine stipple plus a sparse sparkle
  *grain(o, h, r, n) {
    const C = o.cells || n / 2, seed = o.seed || 4;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const u = x / n, v = y / n;
        let s = 0.6 * (vnoise(u * C, v * C, C, C, seed) * 2 - 1) + 0.4 * (vnoise(u * C / 4, v * C / 4, C / 4, C / 4, seed + 2) * 2 - 1);
        const sp = hash2(x, y, seed + 13) > 0.996 ? 1 : 0;
        h[y * n + x] = s + sp * 0.8; r[y * n + x] = 0.3 * s - sp * 0.6;
        if ((x & 31) === 31) yield;
      }
      yield;
    }
  },
  // FDM layer lines along u: `lines` per tile, a slight per-layer wobble and height variation
  *layerLines(o, h, r, n) {
    const N = o.lines || 48, seed = o.seed || 5;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const u = x / n, v = y / n;
        const w = 0.08 * (vnoise(u * 6, v * N, 6, N, seed) - 0.5);
        const ph = (v + w / N) * N, f = ph - Math.floor(ph);
        const amp = 0.75 + 0.25 * hash2(Math.floor(ph) % N, 0, seed + 3);
        const s = amp * (1 - Math.pow(Math.abs(f * 2 - 1), 1.6) * 2) * 0.8 + 0.2 * (vnoise(u * n / 4, v * n / 4, n / 4, n / 4, seed + 8) * 2 - 1);
        h[y * n + x] = s; r[y * n + x] = 0.15 * s;
        if ((x & 31) === 31) yield;
      }
      yield;
    }
  },
  // slow, low-amplitude waviness (glaze, lacquer): irregular reflections without visible texture
  *wobble(o, h, r, n) {
    const C = o.cells || 4, seed = o.seed || 6;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const u = x / n, v = y / n;
        h[y * n + x] = fbm(u * C, v * C, C, C, seed, 3) * 2 - 1; r[y * n + x] = 0;
        if ((x & 31) === 31) yield;
      }
      yield;
    }
  },
};
const BUMP = { brushed: 1.2, extrusion: 1.0, beadBlast: 1.6, grain: 1.4, layerLines: 1.5, wobble: 6 };

// ------------------------------------------------------------- presets
// sRGB hex base colours; roughness, metalness as in the reference sheet (REFERENCE.md); micro: generator, tile
// (m per texture repeat), normal and roughness strength, `planes` per projection plane, `coat` clearcoat wobble.
export const PRESETS = {
  aluminumBeadBlast: { kind: 'physical', color: 0xc9cdd3, metalness: 1, roughness: 0.40, micro: { gen: 'beadBlast', tile: 0.012, normal: 0.35, rough: 0.04 } },
  aluminumBrushed: { kind: 'physical', color: 0xcfd3d8, metalness: 1, roughness: 0.30, anisotropy: 0.55, axis: [1, 0, 0], micro: { gen: 'brushed', tile: 0.03, normal: 0.25, rough: 0.12 } },
  aluminumExtruded: { kind: 'physical', color: 0xc9ccd1, metalness: 1, roughness: 0.35, anisotropy: 0.4, axis: [0, 0, 1], micro: { gen: 'extrusion', tile: 0.02, normal: 0.3, rough: 0.08 } },
  aluminumCut: { kind: 'standard', color: 0xdde0e4, metalness: 1, roughness: 0.28, micro: { gen: 'brushed', tile: 0.004, normal: 0.25, rough: 0.05 } },
  stainless: { kind: 'physical', color: 0xc6c9cc, metalness: 1, roughness: 0.30, micro: { gen: 'brushed', tile: 0.006, normal: 0.15, rough: 0.05 } },
  blackOxide: { kind: 'standard', color: 0x2a2b2e, metalness: 0.85, roughness: 0.48, micro: { gen: 'grain', tile: 0.004, normal: 0.12, rough: 0.08 } },
  plasticMatte: { kind: 'physical', color: 0x6d717c, metalness: 0, roughness: 0.72, sheen: 0.25, sheenRoughness: 0.8, sheenColor: 0x9ea3ad, micro: { gen: 'layerLines', tile: 0.008, normal: 0.22, rough: 0.06, planes: [1, 0.25, 1] } },
  plasticMolded: { kind: 'physical', color: 0x6d717c, metalness: 0, roughness: 0.74, sheen: 0.2, sheenRoughness: 0.8, sheenColor: 0x9ea3ad, micro: { gen: 'grain', tile: 0.006, normal: 0.25, rough: 0.08 } },
  plasticBlack: { kind: 'standard', color: 0x1f2023, metalness: 0, roughness: 0.60, micro: { gen: 'grain', tile: 0.005, normal: 0.3, rough: 0.10 } },
  ceramic: { kind: 'standard', color: 0xe9e6df, metalness: 0, roughness: 0.55, micro: { gen: 'grain', tile: 0.006, normal: 0.12, rough: 0.06 } },
  solderMask: { kind: 'physical', color: 0x2d7a5e, metalness: 0, roughness: 0.45, clearcoat: 0.35, clearcoatRoughness: 0.35, micro: { gen: 'grain', tile: 0.01, normal: 0.08, rough: 0.05 } },
  glaze: { kind: 'physical', color: 0x2f3033, metalness: 0, roughness: 0.45, clearcoat: 1, clearcoatRoughness: 0.06, micro: { gen: 'wobble', tile: 0.06, normal: 0.0, rough: 0.0, coat: 0.05 } },
  stoneware: { kind: 'standard', color: 0xb99872, metalness: 0, roughness: 0.9, micro: { gen: 'grain', tile: 0.008, normal: 0.4, rough: 0.05 } },
  canLacquer: { kind: 'physical', color: 0xc8ccd0, metalness: 1, roughness: 0.26, anisotropy: 0.35, axis: [0, 1, 0], clearcoat: 0.6, clearcoatRoughness: 0.08, micro: { gen: 'brushed', tile: 0.05, normal: 0.12, rough: 0.06, planes: [1, 0, 1] } },
  cablePVC: { kind: 'standard', color: 0x1d1e21, metalness: 0, roughness: 0.45, micro: { gen: 'grain', tile: 0.006, normal: 0.15, rough: 0.08 } },
  braided: { kind: 'standard', color: 0x2b2d31, metalness: 0, roughness: 0.85 },
  silicone: { kind: 'physical', color: 0xa3141a, metalness: 0, roughness: 0.35, sheen: 0.3, sheenColor: 0xffffff, sheenRoughness: 0.5 },
  gold: { kind: 'standard', color: 0xc9a24a, metalness: 1, roughness: 0.28 },
  copper: { kind: 'standard', color: 0xb87333, metalness: 1, roughness: 0.30 },
  coffee: { kind: 'physical', color: 0x2a160c, metalness: 0, roughness: 0.05, ior: 1.33 },
};

// ------------------------------------------------------------------ look
const looks = new WeakMap();
const sharedTex = new Map();        // generated micro texels by generator key, shared across looks (ref-counted)

// One look per renderer: the hero engine keeps it across guest rebuilds, a case stage gets its own.
export function getLook({ renderer, quality = 'high', THREE = THREE_ } = {}) {
  let L = looks.get(renderer);
  if (!L || L.disposed) { L = createLook({ renderer, quality, THREE }); looks.set(renderer, L); }
  L.refs++;
  return L;
}

export function createLook({ renderer, quality = 'high', THREE = THREE_, studio = STUDIO } = {}) {
  const tier = { ...(TIERS[quality] || TIERS.high), name: quality === 'low' ? 'low' : 'high' };
  const stats = { sliceList: [], envMs: 0, texMs: 0, slices: 0, maxSliceMs: 0, textures: 0, texBytes: 0, materials: 0, receivers: 0, mirrors: 0, envSize: tier.env / 4 };
  const sched = createScheduler(stats);
  const uniforms = {
    lookExposure: { value: 0.95 },
    lookLight: { value: new THREE.Vector3(0.45, 0.25, 0.30) },
    lookEnv: { value: new THREE.Vector4(0, 0, 0, 0) },
  };
  // the near-field studio follows one object (setStudioCenter); radius in that object's local units (m)
  let studioAt = null, studioR = 0.4, studioOff = new THREE.Vector3();
  const _c = new THREE.Vector3(), _s = new THREE.Vector3();
  function setStudioCenter(object, radius = 0.4, offset = [0, 0, 0]) { studioAt = object; studioR = radius; studioOff.set(...offset); }
  function syncStudio() {
    if (!studioAt) { uniforms.lookEnv.value.w = 0; return; }
    studioAt.updateWorldMatrix(true, false);
    _c.copy(studioOff).applyMatrix4(studioAt.matrixWorld);
    _s.setFromMatrixScale(studioAt.matrixWorld);
    uniforms.lookEnv.value.set(_c.x, _c.y, _c.z, studioR * (_s.x + _s.y + _s.z) / 3);
  }
  const adopted = new Set(), textures = new Set(), grounds = new Set(), texCache = new Map();
  let envMap = null, envRT = null, envPromise = null;

  // ---- environment
  // in three tasks (a frame may be drawn between them): the studio drawn to its equirect target, the PMREM's
  // programs compiled, the PMREM itself. Same steps and output as one call; only the task boundaries are new.
  let envMs = 0;
  async function buildEnv() {
    const t0 = now();
    const W = tier.env, H = W / 2;
    const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, depthBuffer: false, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    const sh = studioShader(look.studio);
    const mat = new THREE.ShaderMaterial({ ...sh, uniforms: { px: { value: 1.6 * Math.PI * 2 / W } }, depthTest: false, depthWrite: false });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    const tri = new THREE.Mesh(geo, mat); tri.frustumCulled = false;
    const sc = new THREE.Scene(); sc.add(tri);
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    // its program starts compiling now and is used a task later (no wait where the driver links in parallel)
    { const prev = renderer.getRenderTarget(); renderer.setRenderTarget(rt); try { renderer.compile(sc, cam); } catch (e) { /* the draw compiles */ } renderer.setRenderTarget(prev); }
    envMs = now() - t0;
    await yieldTask();
    const t2 = now();
    const prevRT = renderer.getRenderTarget(), prevAuto = renderer.autoClear, prevXR = renderer.xr.enabled;
    renderer.xr.enabled = false; renderer.autoClear = true;
    renderer.setRenderTarget(rt); renderer.render(sc, cam);
    renderer.setRenderTarget(prevRT); renderer.autoClear = prevAuto; renderer.xr.enabled = prevXR;
    rt.texture.mapping = THREE.EquirectangularReflectionMapping;
    envMs += now() - t2;
    await yieldTask();
    let t1 = now();
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    envMs += now() - t1;
    await yieldTask();
    t1 = now();
    const out = pmrem.fromEquirectangular(rt.texture);
    pmrem.dispose(); rt.dispose(); geo.dispose(); mat.dispose();
    if (envRT) envRT.dispose();
    envRT = out; envMap = out.texture; envMap.name = 'look-studio';
    for (const m of adopted) { m.envMap = envMap; m.needsUpdate = true; }
    stats.envMs = envMs + now() - t1;
    return envMap;
  }
  function env() {
    if (!envPromise) envPromise = yieldTask().then(buildEnv);
    return envPromise;
  }
  // context loss: render targets lose their pixels; data textures and programs come back by themselves
  const canvas = renderer.domElement;
  const onRestore = () => { envRT = null; envPromise = null; env(); };   // the old target died with the context
  if (canvas && canvas.addEventListener) canvas.addEventListener('webglcontextrestored', onRestore);

  // ---- textures
  function makeTex(gen, o = {}) {
    const n = o.size || tier.tex, key = [gen, n, o.seed, o.lines, o.cells, o.streak, o.bump].join('|');
    if (texCache.has(key)) return texCache.get(key);
    // the texels are generated once per page and shared by every look (the case page has two stages, so two
    // looks); each look keeps its own DataTexture, because a texture is uploaded and disposed per renderer
    let sh = sharedTex.get(key);
    if (!sh) {
      const data = new Uint8Array(n * n * 4);
      for (let i = 0; i < data.length; i += 4) { data[i] = data[i + 1] = 128; data[i + 2] = 128; data[i + 3] = 128; }
      const h = new Float32Array(n * n), r = new Float32Array(n * n);
      const bump = (o.bump || BUMP[gen] || 1) * n / 256;
      sh = { data, refs: 0, ready: sched.add((function* () {
        yield* GEN[gen](o, h, r, n);
        yield* heightToMap(h, r, n, data, bump);
      })()) };
      sharedTex.set(key, sh);
    }
    sh.refs++;
    const tex = new THREE.DataTexture(sh.data, n, n, THREE.RGBAFormat, THREE.UnsignedByteType);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = Math.min(tier.texAniso, renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 1);
    tex.colorSpace = THREE.NoColorSpace; tex.name = `look-${gen}`;
    tex.needsUpdate = true;
    tex.userData.ready = sh.ready.then(() => { tex.needsUpdate = true; });
    tex.userData.lookShared = key;
    texCache.set(key, tex); textures.add(tex);
    stats.textures++; stats.texBytes += Math.round(n * n * 4 * 4 / 3);
    return tex;
  }
  const tex = { noise };
  for (const g of Object.keys(GEN)) tex[g] = (o) => makeTex(g, o);

  // ---- materials
  // lookOpts: { micro: { map | gen, tile, normal, rough, coat, planes }, axis: [x, y, z] (anisotropy direction,
  // object space), envIntensity, tone (default true), light (default true), near (default 1: this material's share
  // of the near-field studio radius; smaller brings the softboxes closer, so a flat plate shows a longer gradient) }
  function inject(m, o = {}) {
    if (m.userData.look) return m;
    const micro = o.micro && (o.micro.map || o.micro.gen) ? o.micro : null;
    const map = micro ? (micro.map || makeTex(micro.gen, micro)) : null;
    const aniso = !!(m.isMeshPhysicalMaterial && m.anisotropy > 0);
    const own = {
      lookMicroMap: { value: map },
      lookMicro: { value: new THREE.Vector4(micro ? 1 / (micro.tile || 0.01) : 1, micro ? (micro.normal ?? 0.3) : 0, micro ? (micro.rough ?? 0) : 0, micro ? (micro.coat ?? 0) : 0) },
      lookPlanes: { value: new THREE.Vector3(...((micro && micro.planes) || [1, 1, 1])) },
      lookAxis: { value: new THREE.Vector3(...(o.axis || [1, 0, 0])).normalize() },
      lookNear: { value: o.near ?? 1 },
    };
    const tone = o.tone !== false, light = o.light !== false, parallax = o.parallax !== false;
    const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey;
    // Defines go on the material now, not in onBeforeCompile: three passes material.defines into the hook by
    // reference, so setting them there changed the material's program key after its first compile, and every such
    // material linked a second, identical program on its next draw (8 programs outside prewarm, on the case page too).
    if (map || aniso) m.defines = { ...(m.defines || {}), ...(map ? { LOOK_MICRO: '' } : {}), ...(aniso ? { LOOK_ANISO: '' } : {}) };
    m.onBeforeCompile = function (shader, r) {
      if (prev) prev.call(this, shader, r);
      Object.assign(shader.uniforms, uniforms, own);
      let vs = shader.vertexShader, fs = shader.fragmentShader;
      if (map || aniso) {
        vs = after(vs, 'common', MICRO_VERT_PARS);
        vs = after(vs, 'begin_vertex', MICRO_VERT);
        fs = after(fs, 'common', MICRO_FRAG_PARS);
        fs = after(fs, 'roughnessmap_fragment', MICRO_ROUGH);
        fs = after(fs, 'normal_fragment_maps', MICRO_NORMAL);
        fs = after(fs, 'clearcoat_normal_fragment_maps', MICRO_COAT);
      }
      if (parallax && fs.includes('#include <envmap_physical_pars_fragment>')) {
        vs = after(vs, 'common', PARALLAX_VERT_PARS);
        vs = after(vs, 'begin_vertex', PARALLAX_VERT);
        fs = after(fs, 'common', PARALLAX_FRAG_PARS);
        fs = fs.replace('#include <envmap_physical_pars_fragment>', THREE.ShaderChunk.envmap_physical_pars_fragment.replace(
          'reflectVec = inverseTransformDirection( reflectVec, viewMatrix );',
          'reflectVec = lookParallax( inverseTransformDirection( reflectVec, viewMatrix ) );'));
      }
      if (light) {
        fs = after(fs, 'common', LIGHT_PARS);
        fs = after(fs, 'lights_fragment_begin', LIGHT_BEGIN);
        fs = after(fs, 'lights_fragment_end', LIGHT_END);
      }
      if (tone) {
        fs = after(fs, 'common', TONE_GLSL);
        fs = fs.replace('#include <tonemapping_fragment>', 'gl_FragColor.rgb = lookTone(gl_FragColor.rgb);');
      }
      shader.vertexShader = vs; shader.fragmentShader = fs;
    };
    const flags = `look${LOOK_VERSION}|${map ? 'm' : ''}${aniso ? 'a' : ''}${tone ? 't' : ''}${light ? 'l' : ''}${parallax ? 'p' : ''}`;
    m.customProgramCacheKey = function () { return (prevKey ? prevKey.call(this) : '') + '|' + flags; };
    if (o.envIntensity !== undefined) m.envMapIntensity = o.envIntensity;
    if (envMap) m.envMap = envMap;
    m.userData.look = flags;
    if (map) m.userData.lookMicroMap = map;       // prewarm uploads textures it finds in userData
    m.userData.lookUniforms = own;
    m.needsUpdate = true;
    adopted.add(m); stats.materials++;
    return m;
  }
  function adopt(root, o = {}) {
    const one = m => {
      if (!m || !(m.isMeshStandardMaterial) || m.userData.look || m.userData.lookSkip) return;
      inject(m, { envIntensity: o.envIntensity ?? 1, ...o });
    };
    if (root && root.isMaterial) one(root);
    else if (root) root.traverse(x => { for (const m of [].concat(x.material || [])) one(m); });
    return root;
  }
  function build(kind, params = {}, o = {}) {
    const P = { ...params };
    if (!tier.anisotropy) delete P.anisotropy;
    const m = kind === 'physical' ? new THREE.MeshPhysicalMaterial(P) : new THREE.MeshStandardMaterial(P);
    return inject(m, { envIntensity: 1, ...o });
  }
  const physical = (params, o) => build('physical', params, o);
  const standard = (params, o) => build('standard', params, o);
  function material(name, overrides = {}, o = {}) {
    const p = PRESETS[name];
    if (!p) throw new Error(`look: no preset "${name}"`);
    const { kind, micro, axis, ...params } = p;
    const P = { ...params, ...overrides };
    for (const k of ['color', 'sheenColor', 'emissive', 'attenuationColor', 'specularColor']) if (typeof P[k] === 'number' || typeof P[k] === 'string') P[k] = new THREE.Color(P[k]);
    const mo = o.micro === false ? null : { ...(micro || {}), ...(o.micro || {}) };
    return build(o.kind || kind, P, { ...o, micro: mo && (mo.gen || mo.map) ? mo : null, axis: o.axis || axis });
  }

  // ---- ground: analytic contact shadows on a transparent receiver
  // createGround({ parent, y, size, fade, opacity, renderOrder, terms, follow, followMax })
  //   parent     the receiver's frame (its local y = 0 plane, +Y up, units m); the mesh is added to it
  //   y          the plane's height in parent space (default 0)
  //   size       square extent (m); shadows fade out between fade * size and size / 2 from the centre
  //   follow     optional occluder object: the plane drops with that object's bottom (never above y, at most
  //              followMax below it), so a part that explodes downward never sinks through the page
  //   terms      { core, key, amb }: [s0 (m), penumbra growth per m of height, alpha, height (m) at which alpha halves]
  //   sweep      how far the key shadow is swept away from the light (1 = the light's own angle, softened)
  // ground.add(object, { shape: 'box' | 'disc' | 'frame', radius, inset, strength, contact, box, exclude }) -> record
  //   box: measured now from the object's opaque meshes (the least-area footprint over yaw), then carried with the object
  //   contact: share of the footprint that touches the page (1 for flat bottoms, about 0.3 for a sphere or a fillet)
  //   disc: radius (m) about the box centre; frame: a box with a hole, `inset` (m) wide walls (a lid ring)
  // ground.reflect(meshes, { opacity, fade }) (high tier only), ground.remove(object), ground.opacity, dispose()
  function createGround({ parent, y = 0, size = 0.36, fade = 0.32, opacity = 1, renderOrder = -2, name = 'lookGround', terms = {}, follow = null, followMax = 0.08, sweep = 1 } = {}) {
    const N = tier.maxOcc;
    const T = {
      core: [0.0018, 0.05, 0.60, 0.006],
      key: [0.0030, 0.22, 0.50, 0.06],
      amb: [0.0080, 0.40, 0.30, 0.06],
      ...terms,
    };
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: true,
      uniforms: {
        uA: { value: Array.from({ length: N }, () => new THREE.Vector4()) },
        uB: { value: Array.from({ length: N }, () => new THREE.Vector4()) },
        uC: { value: Array.from({ length: N }, () => new THREE.Vector4()) },
        uCount: { value: 0 },
        uCore: { value: new THREE.Vector4(...T.core) }, uKey: { value: new THREE.Vector4(...T.key) }, uAmb: { value: new THREE.Vector4(...T.amb) },
        uShift: { value: new THREE.Vector2() },
        uOpacity: { value: opacity }, uFade: { value: new THREE.Vector2(size * fade, size * 0.5) },
      },
      defines: { N },
      vertexShader: 'varying vec2 vP; void main() { vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
      varying vec2 vP;
      uniform vec4 uA[N], uB[N], uC[N];   // A: centre x, z, bottom, top; B: axis x, z, half sizes; C: shape, strength, inset
      uniform int uCount;
      uniform vec4 uCore, uKey, uAmb;
      uniform vec2 uShift, uFade;
      uniform float uOpacity;
      float erf_(float x) {
        float s = sign(x); x = abs(x);
        float t = 1.0 / (1.0 + 0.3275911 * x);
        return s * (1.0 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * exp(-x * x));
      }
      // a rectangle (half size h) convolved with a Gaussian of deviation s: exact and separable
      float boxS(vec2 p, vec2 h, float s) {
        float k = 0.70710678 / s;
        return 0.25 * (erf_((p.x + h.x) * k) - erf_((p.x - h.x) * k)) * (erf_((p.y + h.y) * k) - erf_((p.y - h.y) * k));
      }
      // a disc of radius r: radial profile, centre value normalised to the true convolution
      float discS(vec2 p, float r, float s) {
        float k = 0.70710678 / s, d = length(p);
        float v = 0.5 * (1.0 - erf_((d - r) * k));
        return v * (1.0 - exp(-r * r / (2.0 * s * s))) / (0.5 * (1.0 + erf_(r * k)));
      }
      // off: the shadow's sweep away from the light over the occluder's height (the footprint is stretched along it)
      float occ(vec4 A, vec4 B, vec4 C, vec2 off, float h, vec4 term, float k) {
        float s = term.x + term.y * h;
        B.zw *= k;
        vec2 rel = vP - A.xy - 0.5 * off;
        vec2 ax = B.xy, ay = vec2(-B.y, B.x);
        vec2 lp = vec2(dot(rel, ax), dot(rel, ay));
        vec2 sw = abs(vec2(dot(off, ax), dot(off, ay)));
        B.zw += 0.5 * (C.x > 0.5 && C.x < 1.5 ? vec2(length(sw)) : sw);
        float reach = max(B.z, B.w) + 3.5 * s;
        if (dot(lp, lp) > 2.0 * reach * reach) return 0.0;
        float S = C.x > 1.5 ? boxS(lp, B.zw, s) - boxS(lp, max(B.zw - C.z, 0.0), s)
                : C.x > 0.5 ? discS(lp, B.z, s) : boxS(lp, B.zw, s);
        return term.z * C.y / (1.0 + h / term.w) * S;
      }
      void main() {
        float vis = 1.0;
        for (int i = 0; i < N; i++) {
          if (i >= uCount) break;
          vec4 A = uA[i], B = uB[i], C = uC[i];
          float hb = max(A.z, 0.0), hm = max(0.5 * (A.z + A.w), 0.0);
          vis *= 1.0 - occ(A, B, C, vec2(0.0), hb, uCore, C.w);         // contact core: tight, only near the page
          vis *= 1.0 - occ(A, B, C, uShift * max(A.w, 0.0), hm, uKey, 1.0); // the key's area shadow, swept away from it
          vis *= 1.0 - occ(A, B, C, vec2(0.0), hm, uAmb, 1.0);          // sky occlusion, broad and faint
        }
        float e = max(abs(vP.x), abs(vP.y));
        float a = (1.0 - vis) * uOpacity * (1.0 - smoothstep(uFade.x, uFade.y, e));
        gl_FragColor = vec4(0.0, 0.0, 0.0, a);
      }`,
    });
    const geo = new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = name; mesh.position.y = y; mesh.renderOrder = renderOrder; mesh.frustumCulled = false;
    mesh.userData.lookSkip = true; mesh.userData.lookNoShadow = true;
    if (parent) parent.add(mesh);
    const occs = [], mirrors = [];
    const inv = new THREE.Matrix4(), M = new THREE.Matrix4(), v = new THREE.Vector3(), c = new THREE.Vector3(), sc = new THREE.Vector3();
    const ax = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()], kd = new THREE.Vector3(), q = new THREE.Quaternion(), m3 = new THREE.Matrix3();
    const shown = o => { for (let x = o; x; x = x.parent) { if (!x.visible) return false; if (x === mesh.parent) return true; } return true; };
    let fade0 = 1;

    function add(object, o = {}) {
      object.updateWorldMatrix(true, true); mesh.updateWorldMatrix(true, false);
      inv.copy(mesh.matrixWorld).invert();
      // every vertex in receiver space (a bounding box of a turned bounding box would grow the footprint)
      const xs = [], zs = [];
      let y0 = Infinity, y1 = -Infinity;
      const push = p => { xs.push(p.x); zs.push(p.z); if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; };
      if (o.box) {
        M.multiplyMatrices(inv, object.matrixWorld);
        for (let i = 0; i < 8; i++) push(v.set(i & 1 ? o.box.max.x : o.box.min.x, i & 2 ? o.box.max.y : o.box.min.y, i & 4 ? o.box.max.z : o.box.min.z).applyMatrix4(M));
      } else object.traverse(m => {
        if (!m.isMesh || !m.geometry || m.userData.lookNoShadow || [].concat(m.material || []).some(x => x.transparent) || (o.exclude && o.exclude(m))) return;
        M.multiplyMatrices(inv, m.matrixWorld);
        const pos = m.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) push(v.fromBufferAttribute(pos, i).applyMatrix4(M));
      });
      if (!xs.length) return null;
      // footprint: the yaw whose rectangle has the least area (coarse 3 degree search, then 0.25 degree)
      const ext = a => {
        const c = Math.cos(a), s = Math.sin(a);
        let u0 = Infinity, u1 = -Infinity, w0 = Infinity, w1 = -Infinity;
        for (let i = 0; i < xs.length; i++) { const u = xs[i] * c + zs[i] * s, w = zs[i] * c - xs[i] * s; if (u < u0) u0 = u; if (u > u1) u1 = u; if (w < w0) w0 = w; if (w > w1) w1 = w; }
        return { a, u0, u1, w0, w1, area: (u1 - u0) * (w1 - w0) };
      };
      let best = ext(0);
      if (o.shape !== 'disc') {
        for (let d = 3; d < 90; d += 3) { const e = ext(d * Math.PI / 180); if (e.area < best.area * 0.999) best = e; }
        const a0 = best.a;
        for (let d = -2.75; d <= 2.75; d += 0.25) { const e = ext(a0 + d * Math.PI / 180); if (e.area < best.area * 0.9999) best = e; }
      }
      const c = Math.cos(best.a), sn = Math.sin(best.a);
      const cu = (best.u0 + best.u1) / 2, cw = (best.w0 + best.w1) / 2;
      const ctr = new THREE.Vector3(cu * c - cw * sn, (y0 + y1) / 2, cu * sn + cw * c);
      let hx = (best.u1 - best.u0) / 2, hz = (best.w1 - best.w0) / 2;
      if (o.shape === 'disc' && o.radius) hx = hz = o.radius;
      const hy = (y1 - y0) / 2;
      // kept in object space so it rides with the object
      const toObj = new THREE.Matrix4().copy(object.matrixWorld).invert().multiply(mesh.matrixWorld);
      m3.setFromMatrix4(toObj);
      const rec = {
        object, shape: o.shape === 'frame' ? 2 : o.shape === 'disc' ? 1 : 0, strength: o.strength ?? 1, inset: o.inset || 0, contact: o.contact ?? 1,
        c: ctr.applyMatrix4(toObj),
        a: [new THREE.Vector3(c * hx, 0, sn * hx), new THREE.Vector3(0, hy, 0), new THREE.Vector3(-sn * hz, 0, c * hz)].map(x => x.applyMatrix3(m3)),
        hb: 0, ht: 0,
      };
      occs.push(rec);
      return rec;
    }
    function remove(object) { for (let i = occs.length - 1; i >= 0; i--) if (occs[i].object === object) occs.splice(i, 1); }
    // an occluder's centre and half axes in the frame `F` (inverse world matrix given)
    function place(r, Finv) {
      M.multiplyMatrices(Finv, r.object.matrixWorld);
      v.copy(r.c).applyMatrix4(M);
      m3.setFromMatrix4(M);
      for (let i = 0; i < 3; i++) ax[i].copy(r.a[i]).applyMatrix3(m3);
      const ey = Math.abs(ax[0].y) + Math.abs(ax[1].y) + Math.abs(ax[2].y);
      r.hb = v.y - ey; r.ht = v.y + ey;
    }
    const fr = follow ? () => occs.find(r => r.object === follow) : null;
    let stamp = -1;
    // everything that depends on the pose, once per rendered frame (the first draw that needs it computes it)
    function sync() {
      const f = renderer.info.render.frame;
      if (f === stamp) return;
      stamp = f;
      if (fr && mesh.parent) {
        const r = fr();
        mesh.parent.updateWorldMatrix(true, false);
        if (r) {
          r.object.updateWorldMatrix(true, false);
          place(r, inv.copy(mesh.parent.matrixWorld).invert());
          const low = Math.min(y, Math.max(y - followMax, r.hb));
          mesh.position.y = low;
          // the followed part leaves through the floor: the shadows go with it
          fade0 = 1 - Math.min(1, Math.max(0, (y - followMax - r.hb) / 0.01));
        }
        mesh.updateMatrixWorld(true);
      } else mesh.updateWorldMatrix(true, false);
      const U = mat.uniforms;
      inv.copy(mesh.matrixWorld).invert();
      // the key pushes shadows away from itself: its direction in receiver space, per unit of height
      mesh.matrixWorld.decompose(sc, q, c);
      kd.set(...look.studio.key).normalize().applyQuaternion(q.invert());
      U.uShift.value.set(-kd.x / Math.max(0.35, kd.y), -kd.z / Math.max(0.35, kd.y)).multiplyScalar(0.5 * sweep);
      U.uOpacity.value = ground.opacity * fade0;
      let n = 0;
      for (const r of occs) {
        if (n >= N) break;
        if (!shown(r.object)) continue;
        r.object.updateWorldMatrix(true, false);
        place(r, inv);
        if (r.ht < -0.002) continue;
        // footprint: the two axes that lie flattest
        let i0 = 0, i1 = 1, i2 = 2;
        const tilt = i => Math.abs(ax[i].y) / (ax[i].length() || 1);
        if (tilt(i0) > tilt(i2)) [i0, i2] = [i2, i0];
        if (tilt(i1) > tilt(i2)) [i1, i2] = [i2, i1];
        const A0 = ax[i0], A1 = ax[i1];
        const l0 = Math.hypot(A0.x, A0.z) || 1e-6, l1 = Math.hypot(A1.x, A1.z) || 1e-6;
        U.uA.value[n].set(v.x, v.z, r.hb, r.ht);
        U.uB.value[n].set(A0.x / l0, A0.z / l0, l0, l1);
        U.uC.value[n].set(r.shape, r.strength * (r.hb < 0 ? Math.max(0, 1 + r.hb / 0.01) : 1), r.inset, r.contact);
        n++;
      }
      U.uCount.value = n;
      mat.uniformsNeedUpdate = true;
      syncMirrors();
    }
    mesh.onBeforeRender = sync;

    // high tier: a faint mirrored copy of some meshes under the ground, fading within `fade` m (receiver units).
    // One extra draw call per mesh. Low tier: a no-op.
    function reflect(meshes, { opacity: op = 0.12, fade: fd = 0.04 } = {}) {
      if (!tier.reflection) return [];
      for (const src of [].concat(meshes)) {
        src.traverse(s => {
          if (!s.isMesh || !s.material || s.userData.lookNoShadow || [].concat(s.material).some(x => x.transparent)) return;
          const us = [];
          const mm = [].concat(s.material).map(sm => {
            const keep = sm.userData; sm.userData = {};
            const m = sm.clone();
            sm.userData = keep;
            m.userData = { lookSkip: true };
            m.transparent = true; m.depthWrite = false; m.premultipliedAlpha = true; m.forceSinglePass = true;
            if (m.envMap === null && sm.envMap) m.envMap = sm.envMap;
            const U = { lookMirror: { value: new THREE.Vector4() }, lookMirrorFade: { value: new THREE.Vector2(fd, op) } };
            us.push(U);
            const base = sm.onBeforeCompile, baseKey = sm.customProgramCacheKey;
            m.onBeforeCompile = function (sh, r) {
              if (base) base.call(sm, sh, r);
              Object.assign(sh.uniforms, U);
              sh.vertexShader = after(sh.vertexShader, 'common', 'varying vec3 vLookMW;');
              sh.vertexShader = after(sh.vertexShader, 'worldpos_vertex', 'vLookMW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
              sh.fragmentShader = after(sh.fragmentShader, 'common', 'varying vec3 vLookMW;\nuniform vec4 lookMirror;\nuniform vec2 lookMirrorFade;');
              sh.fragmentShader = sh.fragmentShader.replace('#include <premultiplied_alpha_fragment>', `{
                float lookD = -(dot(vLookMW, lookMirror.xyz) + lookMirror.w) / lookMirrorFade.x;
                gl_FragColor.a *= lookMirrorFade.y * (1.0 - smoothstep(0.0, 1.0, lookD)) * step(0.0, lookD);
              }
              #include <premultiplied_alpha_fragment>`);
            };
            m.customProgramCacheKey = function () { return (baseKey ? baseKey.call(sm) : '') + '|lookMirror'; };
            return m;
          });
          const r = new THREE.Mesh(s.geometry, Array.isArray(s.material) ? mm : mm[0]);
          r.name = 'lookMirror'; r.renderOrder = renderOrder - 1; r.frustumCulled = false;
          r.matrixAutoUpdate = false; r.matrixWorldAutoUpdate = false;
          r.userData.lookSkip = true; r.userData.lookNoShadow = true;
          r.onBeforeRender = sync;
          mesh.add(r);
          mirrors.push({ src: s, r, us, fd });
          stats.mirrors++;
        });
      }
      return mirrors;
    }
    const Sy = new THREE.Matrix4().makeScale(1, -1, 1), G = new THREE.Matrix4(), Gi = new THREE.Matrix4(), P = new THREE.Plane(), pn = new THREE.Vector3(), pp = new THREE.Vector3();
    function syncMirrors() {
      if (!mirrors.length) return;
      G.copy(mesh.matrixWorld); Gi.copy(G).invert();
      pn.set(0, 1, 0).transformDirection(G); pp.setFromMatrixPosition(G);
      P.setFromNormalAndCoplanarPoint(pn, pp);
      const s = sc.setFromMatrixScale(G).y;
      for (const m of mirrors) {
        m.src.updateWorldMatrix(true, false);
        m.r.matrixWorld.multiplyMatrices(G, Sy).multiply(Gi).multiply(m.src.matrixWorld);
        for (const U of m.us) { U.lookMirror.value.set(P.normal.x, P.normal.y, P.normal.z, P.constant); U.lookMirrorFade.value.set(m.fd * s, m.op0 ?? U.lookMirrorFade.value.y); }
      }
    }
    // before the frame (engine pre-pass): visibility of the mirrors has to be decided before three culls
    function frame() {
      for (const m of mirrors) m.r.visible = mesh.visible && shown(m.src) && ground.opacity > 0;
    }
    const ground = {
      mesh, add, remove, reflect, sync, frame, occluders: occs, mirrors, opacity,
      uniforms: mat.uniforms,
      dispose() {
        if (mesh.parent) mesh.parent.remove(mesh);
        geo.dispose(); mat.dispose();
        for (const m of mirrors) for (const x of [].concat(m.r.material)) x.dispose();
        grounds.delete(ground); stats.receivers--;
      },
    };
    grounds.add(ground); stats.receivers++;
    return ground;
  }

  // ---- per frame (mirrors follow their sources); engine.addPrePass(look.frame) or call before render
  function frame() { syncStudio(); for (const g of grounds) g.frame(); }

  const look = {
    THREE, renderer, quality: tier.name, tier, uniforms, studio,
    stats: () => {
      const l = stats.sliceList.slice().sort((a, b) => a - b), { sliceList, ...rest } = stats;
      return { ...rest, p95SliceMs: l.length ? l[Math.floor(l.length * 0.95)] : 0, medianSliceMs: l.length ? l[l.length >> 1] : 0, adopted: adopted.size };
    },
    get envMap() { return envMap; },
    refs: 0, disposed: false,
    // rebuild the environment from another studio description (labs, art direction); returns a Promise
    setStudio(st) { look.studio = st; envPromise = null; return env(); },
    env, adopt, inject, material, physical, standard, tex, presets: PRESETS, createGround, frame, setStudioCenter,
    toneGLSL: TONE_GLSL,
    // env first, then every texture queued so far (and any queued while waiting)
    async ready() { await env(); await sched.idle(); await sched.idle(); await Promise.allSettled([...textures].map(t => t.userData.ready)); return look; },
    release() { if (--look.refs <= 0) look.dispose(); },
    dispose() {
      look.disposed = true;
      if (canvas && canvas.removeEventListener) canvas.removeEventListener('webglcontextrestored', onRestore);
      for (const g of [...grounds]) g.dispose();
      for (const t of textures) {
        t.dispose();
        const sh = sharedTex.get(t.userData.lookShared);
        if (sh && --sh.refs <= 0) sharedTex.delete(t.userData.lookShared);
      }
      if (envRT) envRT.dispose();
      envRT = envMap = null; textures.clear(); texCache.clear(); adopted.clear();
      if (looks.get(renderer) === look) looks.delete(renderer);
    },
  };
  return look;
}

// ------------------------------------------------------- Therma-Shift dress
// The one call createThermaShift makes (index.js). Gives every material under `stage` the look, puts the analytic
// contact shadow on the page under the coaster (following each part, the mug and the can; the plane drops with the
// shell in the exploded view) and a second receiver on the top plate for the props, optionally a faint reflection of
// the case on the high tier (`reflection`, off by default), and registers the per-frame pre-pass on the engine. Builders that replace a material with a
// factory material later keep all of this (adopt skips materials that already carry the look).
//   dressThermaShift({ engine, quality, stage, view, coaster, mug, can, plate, parts, reflection }) -> Promise<{
//     look, ground, plateGround, frame(), dispose() }>
// `parts` are the reel's part records ({ name, mesh }) whose meshes the reel flies in and out.
// presets (default true): every material that does not carry the look yet is swapped for the factory preset of its
// real counterpart (THERMA_PRESETS) before the rest is adopted. A builder that already uses look.material() keeps its
// own; the can body keeps its material (the condensation shader lives on it), so does the coffee (its crema map).
export const THERMA_PRESETS = {
  shell: 'plasticMatte', lid: 'plasticMatte', topPlate: 'aluminumBeadBlast', heatsink: 'aluminumExtruded',
  blower: 'plasticBlack', peltier: 'ceramic', board: ['solderMask', { color: 0x2f7d63 }], screws: 'blackOxide',
  button: m => (m.metalness > 0.5 ? 'stainless' : 'plasticBlack'),
  mugOuter: 'glaze', mugHandle: 'glaze', mugInner: ['glaze', { color: 0xe9e2d3, roughness: 0.3 }],
  usbCable: m => (m.metalness > 0.5 ? 'stainless' : 'cablePVC'),
  can: m => (m.metalness > 0.5 ? ['aluminumCut', { roughness: 0.3 }] : null),
};
function applyPresets(look, stage, { coaster, can }) {
  const made = new Map();
  const get = (spec, m) => {
    if (typeof spec === 'function') spec = spec(m);
    if (!spec) return null;
    const [name, over] = Array.isArray(spec) ? spec : [spec, {}];
    const key = name + JSON.stringify(over) + m.side;
    if (!made.has(key)) made.set(key, look.material(name, { ...over, side: m.side }));
    return made.get(key);
  };
  const partOf = new Map();
  if (coaster && coaster.parts) for (const n in coaster.parts) coaster.parts[n].traverse(o => partOf.set(o, n));
  const keep = new Set([can && (can.bodyMaterial || (can.bodyMesh && can.bodyMesh.material))].filter(Boolean));
  stage.traverse(o => {
    if (!o.isMesh || Array.isArray(o.material) || !o.material || !o.material.isMeshStandardMaterial) return;
    const m = o.material;
    if (m.userData.look || m.transparent || keep.has(m) || /coffee/i.test(o.name)) return;
    let key = partOf.get(o) || o.name;
    if (!THERMA_PRESETS[key]) for (let x = o.parent; x; x = x.parent) {
      if (x.name === 'usbCable') { key = 'usbCable'; break; }
      if (can && x === can.group) { key = 'can'; break; }
    }
    const spec = THERMA_PRESETS[key];
    const nm = spec && get(spec, m);
    if (nm) o.material = nm;
  });
}

export async function dressThermaShift({ engine, quality = 'high', stage, view, coaster, mug, can, plate, parts = [], presets = true, reflection = false }) {
  const look = getLook({ renderer: engine.renderer, quality });
  await look.env();
  if (presets) applyPresets(look, stage, { coaster, can });
  look.adopt(stage);
  const H = coaster.height || 0.0291;
  const shell = coaster.parts && coaster.parts.shell;
  // the page receiver: a tight dark line where the case meets the page (on every side, also the lit one), the key's
  // shadow leaving to the right rear, and only a little broad occlusion, so the page stays clean around the object
  const ground = look.createGround({ parent: view, y: -H - 0.0002, size: 0.36, follow: shell || null, followMax: 0.075, name: 'lookGround',
    terms: { core: [0.0012, 0.08, 0.85, 0.008], key: [0.0025, 0.26, 0.46, 0.06], amb: [0.010, 0.4, 0.22, 0.06] } });
  // the coaster: one proxy per part (sparse parts are weaker, the screws and the button are too small to matter)
  const SHAPE = { lid: { shape: 'frame', inset: 0.0045 }, board: { strength: 0.45 }, blower: { strength: 0.9 } };
  for (const P of parts) {
    if (/screws|button/.test(P.name)) continue;
    ground.add(P.mesh, SHAPE[P.name] || {});
  }
  const noHandle = m => /handle/i.test(m.name || '');
  if (mug) ground.add(mug.group, { shape: 'disc', radius: mug.outerRadius || 0.04, exclude: noHandle });
  if (can) ground.add(can.group, { shape: 'disc', radius: can.radius || 0.033 });
  // the props on the plate: a receiver riding on the top plate, just above its surface
  let plateGround = null;
  if (plate) {
    plateGround = look.createGround({ parent: plate, y: 0.0003 - plate.position.y, size: 0.0802, fade: 0.36, sweep: 0.3, renderOrder: 1, name: 'lookPlateGround',
      terms: { core: [0.0007, 0.05, 0.6, 0.004], key: [0.0030, 0.28, 0.35, 0.04], amb: [0.006, 0.3, 0.22, 0.05] } });
    plateGround.mesh.position.x = -plate.position.x; plateGround.mesh.position.z = -plate.position.z;
    if (mug) plateGround.add(mug.group, { shape: 'disc', radius: mug.outerRadius || 0.04, exclude: noHandle });
    if (can) plateGround.add(can.group, { shape: 'disc', radius: can.radius || 0.033 });
  }
  // a mirrored copy of the case in the page (high tier) is off by default: on this page it read as a ghost with
  // see-through holes under the front wall, and the object sits better on the contact line alone. `reflection: true`
  // (labs) brings it back; the cost is 2 draw calls and about 7,000 triangles.
  if (shell && reflection) ground.reflect([shell, coaster.parts.lid].filter(Boolean), { opacity: 0.07, fade: 0.025 });
  // the near-field studio is centred on the coaster's middle (20 cm radius: big softboxes close in, as in a product set)
  look.setStudioCenter(coaster.group, 0.2, [0, -H / 2, 0]);
  const frame = () => { if (stage.visible) look.frame(); };
  const unPre = engine.addPrePass ? engine.addPrePass(frame) : null;
  await look.ready();
  return {
    look, ground, plateGround, frame,
    dispose() { if (unPre) unPre(); ground.dispose(); if (plateGround) plateGround.dispose(); look.release(); },
  };
}

// ============================================================ rudder pedals
// The same studio, tone curve and contact shadows for the rudder pedals actor (showreel/rudder-pedals.js): printed
// plastic with layer lines, steel rods and bearings, black oxide hardware, spring steel, nickel magnets, jacketed
// wires and the controller board, each keeping its own colour. Nothing shared is set: the near-field studio centre
// is this actor's OWN uniform on each of its materials (the shared one, look.setStudioCenter, belongs to whichever
// actor set it), so building the pedals never changes another reel.
//   dressRudderPedals({ engine, quality, view, model, plane, parts, edges }) -> Promise<{
//     look, ground, materials, frame(), setShadow(a), dispose() }>
// Call it with the parts assembled and upright (progress 1, no fly-in transform): the shadow proxies are measured
// then. `parts` are the reel's part records ({ name, mesh }); `plane` is the aircraft accent (its paint gets the
// studio and the tone curve, no parallax: it flies metres away). frame() places the receiver under the lowest
// exploded part and the studio on the assembly: call it whenever the pose changed (the receiver also calls it
// before it draws). edges (default true): CAD meshes get rounded edges and dark creases and bores (edgeGeometry).
export const RUDDER_PRESETS = {
  // [preset, overrides, lookOpts]; the colour (and a map) always comes from the material it replaces
  plastic: ['plasticMatte', { roughness: 0.66 }, { envIntensity: 1.15, micro: { tile: 0.03, normal: 0.045, rough: 0.015, planes: [1, 0.6, 1] } }],   // layer lines nearly invisible, as on the real prints
  steel: ['stainless', { roughness: 0.2 }, {}],
  darkMetal: ['blackOxide', { roughness: 0.42 }, {}],
  spring: ['stainless', { roughness: 0.22 }, { micro: false }],
  magnet: ['stainless', { roughness: 0.16 }, { micro: false }],
  wire: ['cablePVC', { roughness: 0.42, vertexColors: true }, { micro: false }],
  parts: ['plasticBlack', { roughness: 0.5, vertexColors: true }, {}],   // vertex colours; the lookMetal attribute marks bare metal
  board: ['solderMask', {}, {}],
};
// per kind: bevel width (m) and strength, crease width (m) and darkness, occlusion inside closed bores and slots
const RUDDER_EDGES = {
  plastic: [0.0009, 0.9, 0.0032, 0.5, 0.42],
  steel: [0.0004, 0.8, 0.0016, 0.4, 0.55],
  darkMetal: [0.0004, 0.8, 0.0016, 0.4, 0.55],
  parts: [0.0003, 0.7, 0.0010, 0.35, 0.6],
};

// chain one more shader edit (and its program key) after the look's own
function extendMaterial(m, key, fn) {
  const base = m.onBeforeCompile, baseKey = m.customProgramCacheKey;
  m.onBeforeCompile = function (sh, r) { base.call(this, sh, r); fn(sh); };
  m.customProgramCacheKey = function () { return baseKey.call(this) + '|' + key; };
  m.needsUpdate = true;
  return m;
}

// Rounded edges and occlusion for hard-edged CAD meshes, without new triangles. edgeGeometry() returns a non-indexed
// copy with two attributes: lookEdge (per corner, the distance to each of its triangle's edges: positive where the
// edge is a convex hard edge, negative where it is a concave one, far where it is smooth) and lookSoft (the rounded
// normal at that corner, and in w the occlusion of closed concave surfaces: bores, slots). The shader bends the
// normal toward the rounded one within `bevel` of a convex edge (the edge catches a highlight, at least a pixel
// wide) and darkens within `crease` of a concave one.
const EDGE_Q = 0.5, EDGE_FAR = Math.round(0.9 * 32767);
export function edgeGeometry(T, src, o) { const it = edgeSteps(T, src, o); let r; while (!(r = it.next()).done); return r.value; }
// the same work as a generator that yields every few hundred triangles (dressRudderPedals runs it in time slices)
function* edgeSteps(T, src, { hard = 0.92, cavity = 0.42, grid = 2e4 } = {}) {
  const g = src.index ? src.toNonIndexed() : src.clone();
  const P = g.attributes.position, Nn = g.attributes.normal, nC = P.count, nT = (nC / 3) | 0;
  const p = P.array, n = new Float32Array(nC * 3);
  for (let i = 0; i < nC; i++) {
    const x = Nn.getX(i), y = Nn.getY(i), z = Nn.getZ(i), l = Math.hypot(x, y, z) || 1;
    n[3 * i] = x / l; n[3 * i + 1] = y / l; n[3 * i + 2] = z / l;
  }
  yield;
  // welded positions; the rounded normal of a position is the mean of the distinct normals that meet there
  const ids = new Uint32Array(nC), map = new Map(), lists = [];
  let np = 0;
  for (let i = 0; i < nC; i++) {
    if ((i & 1023) === 1023) yield;
    const k = ((Math.round(p[3 * i] * grid) + 32768) * 65536 + Math.round(p[3 * i + 1] * grid) + 32768) * 65536 + Math.round(p[3 * i + 2] * grid) + 32768;   // one number per 50 micron cell
    let id = map.get(k);
    if (id === undefined) { id = np++; map.set(k, id); lists.push([0, 0, 0]); }
    ids[i] = id;
    const L = lists[id], x = n[3 * i], y = n[3 * i + 1], z = n[3 * i + 2];
    let dup = false;
    for (let j = 3; j < L.length; j += 3) if (L[j] * x + L[j + 1] * y + L[j + 2] * z > 0.985) { dup = true; break; }
    if (!dup) { L.push(x, y, z); L[0] += x; L[1] += y; L[2] += z; }
  }
  // face normals (turned to agree with the stored ones) and doubled areas
  const fn = new Float32Array(nT * 3), ar = new Float32Array(nT);
  for (let t = 0; t < nT; t++) {
    const a = 9 * t, e1x = p[a + 3] - p[a], e1y = p[a + 4] - p[a + 1], e1z = p[a + 5] - p[a + 2], e2x = p[a + 6] - p[a], e2y = p[a + 7] - p[a + 1], e2z = p[a + 8] - p[a + 2];
    let x = e1y * e2z - e1z * e2y, y = e1z * e2x - e1x * e2z, z = e1x * e2y - e1y * e2x;
    const l = Math.hypot(x, y, z);
    ar[t] = l;
    if (l < 1e-14) continue;
    x /= l; y /= l; z /= l;
    if (x * (n[a] + n[a + 3] + n[a + 6]) + y * (n[a + 1] + n[a + 4] + n[a + 7]) + z * (n[a + 2] + n[a + 5] + n[a + 8]) < 0) { x = -x; y = -y; z = -z; }
    fn[3 * t] = x; fn[3 * t + 1] = y; fn[3 * t + 2] = z;
  }
  const E = new Int16Array(nC * 3).fill(EDGE_FAR), S = new Int8Array(nC * 4);
  const up = new Int32Array(nT), conc = new Float32Array(nT), conv = new Float32Array(nT);
  for (let t = 0; t < nT; t++) up[t] = t;
  const find = i => { while (up[i] !== i) { up[i] = up[up[i]]; i = up[i]; } return i; };
  const join = (a, b) => { a = find(a); b = find(b); if (a !== b) { up[a] = b; conc[b] += conc[a]; conv[b] += conv[a]; } return b; };
  const dotN = (i, j) => n[3 * i] * n[3 * j] + n[3 * i + 1] * n[3 * j + 1] + n[3 * i + 2] * n[3 * j + 2];
  const quant = v => Math.max(1, Math.min(32767, Math.round(Math.min(v, 0.44) / EDGE_Q * 32767)));
  function mark(t, k, convex) {
    const io = 3 * t + k, i1 = 3 * t + (k + 1) % 3, i2 = 3 * t + (k + 2) % 3;
    const len = Math.hypot(p[3 * i2] - p[3 * i1], p[3 * i2 + 1] - p[3 * i1 + 1], p[3 * i2 + 2] - p[3 * i1 + 2]) || 1e-9;
    const h = quant(ar[t] / len);   // the opposite corner's height over this edge
    E[3 * io + k] = convex ? h : -h; E[3 * i1 + k] = E[3 * i2 + k] = convex ? 0 : -1;
  }
  const half = new Map();
  yield;
  for (let t = 0; t < nT; t++) {
    if ((t & 255) === 255) yield;
    if (ar[t] < 1e-14) continue;
    for (let k = 0; k < 3; k++) {
      const i1 = 3 * t + (k + 1) % 3, i2 = 3 * t + (k + 2) % 3, a = ids[i1], b = ids[i2];
      if (a === b) continue;
      const key = a < b ? a * np + b : b * np + a, o = half.get(key);
      if (o === undefined) { half.set(key, 3 * t + k); continue; }
      half.delete(key);
      const t2 = (o / 3) | 0, k2 = o % 3, j1 = 3 * t2 + (k2 + 1) % 3, j2 = 3 * t2 + (k2 + 2) % 3;
      const ja = ids[j1] === a ? j1 : j2, jb = ja === j1 ? j2 : j1, jo = 3 * t2 + k2;
      // convex when the neighbour's far corner lies under this face
      const side = fn[3 * t] * (p[3 * jo] - p[3 * i1]) + fn[3 * t + 1] * (p[3 * jo + 1] - p[3 * i1 + 1]) + fn[3 * t + 2] * (p[3 * jo + 2] - p[3 * i1 + 2]);
      const cf = fn[3 * t] * fn[3 * t2] + fn[3 * t + 1] * fn[3 * t2 + 1] + fn[3 * t + 2] * fn[3 * t2 + 2];
      if (Math.min(dotN(i1, ja), dotN(i2, jb)) < hard && cf < 0.995) { mark(t, k, side < 0); mark(t2, k2, side < 0); continue; }
      const r = join(t, t2), ang = Math.acos(Math.max(-1, Math.min(1, cf)));
      if (ang > 0.02) (side > 0 ? conc : conv)[r] += ang;
    }
  }
  // a smooth surface that turns inward all the way round (its normals cancel) is a bore, a slot or a pocket wall
  const sx = new Float32Array(nT), sy = new Float32Array(nT), sz = new Float32Array(nT), sa = new Float32Array(nT);
  for (let t = 0; t < nT; t++) { const r = find(t); sx[r] += fn[3 * t] * ar[t]; sy[r] += fn[3 * t + 1] * ar[t]; sz[r] += fn[3 * t + 2] * ar[t]; sa[r] += ar[t]; }
  const occ = Math.round(cavity * 127);
  yield;
  for (let t = 0; t < nT; t++) {
    if ((t & 511) === 511) yield;
    const r = find(t);
    const hole = conc[r] > 2 && conc[r] > 4 * conv[r] && Math.hypot(sx[r], sy[r], sz[r]) < 0.3 * sa[r];
    for (let k = 0; k < 3; k++) {
      const i = 3 * t + k, L = lists[ids[i]], l = Math.hypot(L[0], L[1], L[2]);
      const ok = l > 1e-6, q = ok ? 127 / l : 127;   // opposite normals cancel (a thin fin): keep the corner's own
      S[4 * i] = Math.round((ok ? L[0] : n[3 * i]) * q); S[4 * i + 1] = Math.round((ok ? L[1] : n[3 * i + 1]) * q); S[4 * i + 2] = Math.round((ok ? L[2] : n[3 * i + 2]) * q);
      S[4 * i + 3] = hole ? occ : 127;
    }
  }
  g.setAttribute('lookEdge', new T.BufferAttribute(E, 3, true));
  g.setAttribute('lookSoft', new T.BufferAttribute(S, 4, true));
  g.computeBoundingSphere();
  return g;
}
const EDGE_VERT_PARS = `
attribute vec3 lookEdge;
attribute vec4 lookSoft;
varying vec3 vLookEdge;
varying vec4 vLookSoft;`;
const EDGE_VERT = `
vLookEdge = lookEdge * ${EDGE_Q.toFixed(2)};
vLookSoft = vec4(normalMatrix * lookSoft.xyz, lookSoft.w);`;
const EDGE_FRAG_PARS = `
varying vec3 vLookEdge;
varying vec4 vLookSoft;
uniform vec4 lookBevel;     // x: bevel width (m), y: its strength, z: crease width (m), w: its darkness
float lookOcc = 1.0;`;
const EDGE_FRAG = `
{
  vec3 lookE = vLookEdge, lookS = step(0.0, lookE);
  vec3 lookDv = mix(vec3(1.0), lookE, lookS), lookDc = mix(-lookE, vec3(1.0), lookS);
  float d0 = min(lookDv.x, min(lookDv.y, lookDv.z)), d1 = min(lookDc.x, min(lookDc.y, lookDc.z));
  float w0 = max(lookBevel.x, 1.25 * fwidth(d0)), w1 = max(lookBevel.z, 1.25 * fwidth(d1));
  vec3 sn = normalize(vLookSoft.xyz);
  #ifdef DOUBLE_SIDED
    sn *= faceDirection;
  #endif
  normal = normalize(mix(normal, sn, (1.0 - smoothstep(0.0, w0, d0)) * lookBevel.y * clamp(lookBevel.x / w0, 0.45, 1.0)));
  float cr = 1.0 - smoothstep(0.0, w1, d1);
  lookOcc = (1.0 - lookBevel.w * cr * cr) * vLookSoft.w;
}`;
function edgeMaterial(T, m, [bw, bs, cw, cd]) {
  const U = { lookBevel: { value: new T.Vector4(bw, bs, cw, cd) } };
  return extendMaterial(m, 'edge', sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = after(after(sh.vertexShader, 'common', EDGE_VERT_PARS), 'begin_vertex', EDGE_VERT);
    sh.fragmentShader = after(after(sh.fragmentShader, 'common', EDGE_FRAG_PARS), 'normal_fragment_maps', EDGE_FRAG)
      .replace('#include <opaque_fragment>', 'outgoingLight *= lookOcc;\n#include <opaque_fragment>');
  });
}
// a `lookMetal` vertex attribute (0 or 1) marks bare metal (tin leads, gold pads, the shield can, screws) inside one
// merged, vertex-coloured mesh; plain materials never read it
const METAL_FRAG = `
metalnessFactor = mix(metalnessFactor, 1.0, vLookMetal); roughnessFactor = mix(roughnessFactor, 0.34, vLookMetal);`;

export async function dressRudderPedals({ engine, quality = 'high', view, model, plane = null, parts = [], edges = true }) {
  const look = getLook({ renderer: engine.renderer, quality });
  const T = look.THREE, undo = [], made = new Map(), geos = [];
  let ground = null;
  const restore = () => {
    for (const [mesh, mat, geo] of undo) { mesh.material = mat; mesh.geometry = geo; }
    for (const m of made.values()) m.dispose();
    for (const g of geos) g.dispose();
    if (ground) ground.dispose();
  };
  try {
    // ---- shadows: a tight line where the walls and supports stand, a soft key shadow that widens with height
    // under the raised levers, rods and sensor lever; every proxy rides with its part (exploded view, fly-in)
    const Y0 = -0.0002;
    ground = look.createGround({ parent: view, y: Y0, size: 0.8, fade: 0.3, sweep: 0.6, name: 'lookGround',
      terms: { core: [0.0014, 0.08, 0.85, 0.008], key: [0.0035, 0.26, 0.36, 0.11], amb: [0.012, 0.4, 0.22, 0.10] } });
    const STRENGTH = { rocker: 0.6, rodR: 0.3, rodL: 0.3, leverR: 0.8, leverL: 0.8 };
    // a lever or the sensor lever that comes to rest on the page (the low exploded layout) touches it along an edge, not with its whole outline
    // each proxy is the part's own bounds (its CAD meshes, not the small added details such as the anchor screw that
    // sticks out of a wall): eight corners instead of every vertex, so measuring costs nothing
    const inv = new T.Matrix4(), m4 = new T.Matrix4(), pt = new T.Vector3();
    const boxOf = root => {
      const b = new T.Box3();
      root.updateWorldMatrix(true, true); inv.copy(root.matrixWorld).invert();
      root.traverse(o => {
        if (!o.isMesh || !o.geometry || o.userData.detail) return;
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        const g = o.geometry.boundingBox; m4.multiplyMatrices(inv, o.matrixWorld);
        for (let i = 0; i < 8; i++) b.expandByPoint(pt.set(i & 1 ? g.max.x : g.min.x, i & 2 ? g.max.y : g.min.y, i & 4 ? g.max.z : g.min.z).applyMatrix4(m4));
      });
      return b;
    };
    for (const P of parts) ground.add(P.mesh, { box: boxOf(P.mesh), strength: STRENGTH[P.name] ?? 1, contact: /^(wall|core)/.test(P.name) ? 1 : 0.3 });
    const rest = parts.filter(P => !/^rod/.test(P.name)).map(P => [P.mesh, P.mesh.position.y]);   // the rods also move with the linkage

    await look.env();
    // ---- materials: the real counterpart of each, in the owner's colour, with this actor's own studio centre
    const env = { value: new T.Vector4() };
    const mk = (kind, src) => {
      const key = kind + src.uuid;
      if (made.has(key)) return made.get(key);
      const [name, over, lo] = RUDDER_PRESETS[kind];
      const m = look.material(name, { ...over, color: src.color.clone(), side: src.side, ...(src.map ? { map: src.map } : {}) }, lo);
      // charcoal plastic keeps reading as charcoal under the studio (its form would sink into black otherwise)
      if (kind === 'plastic' && src.color.r + src.color.g + src.color.b < 0.24) m.envMapIntensity = 1.5;
      m.userData.lookUniforms.lookEnv = env;
      if (edges && RUDDER_EDGES[kind]) edgeMaterial(T, m, RUDDER_EDGES[kind]);
      if (kind === 'parts') extendMaterial(m, 'metal', sh => {
        sh.vertexShader = after(after(sh.vertexShader, 'common', 'attribute float lookMetal;\nvarying float vLookMetal;'), 'begin_vertex', 'vLookMetal = lookMetal;');
        sh.fragmentShader = after(after(sh.fragmentShader, 'common', 'varying float vLookMetal;'), 'metalnessmap_fragment', METAL_FRAG);
      });
      made.set(key, m);
      return m;
    };
    const cad = new Map(Object.entries(model.materials).map(([k, m]) => [m, k === 'steel' || k === 'darkMetal' ? k : 'plastic']));
    const todo = [];
    model.group.traverse(o => {
      if (!o.isMesh || !o.material || !o.material.isMeshStandardMaterial || o.material.userData.look) return;
      const src = o.material, d = o.userData.detail;
      const kind = cad.get(src) || (o.name === 'springs' ? 'spring' : o.name === 'wires' ? 'wire' : d === 'magnets' ? 'magnet' : src.map ? 'board' : d ? 'parts' : null);
      if (!kind) return;
      undo.push([o, src, o.geometry]);
      o.material = mk(kind, src);
      if (edges && RUDDER_EDGES[kind]) todo.push([o, RUDDER_EDGES[kind][4]]);
    });
    let t0 = now();
    for (const [o, cavity] of todo) {
      const it = edgeSteps(T, o.geometry, { cavity });
      let r;
      while (!(r = it.next()).done) if (now() - t0 > SLICE_MS) { await yieldTask(); t0 = now(); }
      geos.push(r.value); o.geometry = r.value;
    }
    if (plane) look.adopt(plane.group, { parallax: false, envIntensity: 1.4 });

    const H = model.height || 0.26, c = new T.Vector3(), s = new T.Vector3();
    function frame() {
      let y = 0;
      for (const [mesh, y0] of rest) y = Math.min(y, mesh.position.y - y0);
      ground.mesh.position.y = Y0 + Math.max(y, -0.12);
      model.group.updateWorldMatrix(true, false);
      c.set(0, H / 2, 0).applyMatrix4(model.group.matrixWorld); s.setFromMatrixScale(model.group.matrixWorld);
      env.value.set(c.x, c.y, c.z, 0.5 * (s.x + s.y + s.z) / 3);
    }
    const sync = ground.mesh.onBeforeRender;
    ground.mesh.onBeforeRender = function (...a) { frame(); sync.apply(this, a); };
    frame();
    await look.ready();
    return {
      look, ground, materials: made, frame,
      setShadow(a) { ground.opacity = a; },
      dispose() { restore(); look.release(); },
    };
  } catch (e) { restore(); look.release(); throw e; }
}

// ============================================================ Robo-Catcher
// The Robo-Catcher on the studio look, in the owner's materials (robo-catcher.js calls it once the machine stands
// assembled and upright):
//   dressRoboCatcher({ engine, quality, view, model, balls, parts, edges }) -> Promise<{
//     look, ground, materials, net, frame(), setShadow(a), dispose() }>
// `model` is robo-catcher.js createModel(): its `hints` say where the net, the poles, the wire panels, the plywood
// sheets and the flywheel treads are; `balls` are createAccent() softballs (one or two), `parts` the reel's part
// records ({ name, mesh }). What it does:
//   net      the 1 px line set becomes a rope net: a sheet with one vertex per knot that hangs with a little sag
//            and follows model.setNet / setNetImpact; cords, their twist and the knots are drawn by the shader in
//            cell coordinates and box-filtered per pixel, so they stay crisp and still while the net moves
//   wires    the feeder's wire panels become thin steel tubes that never get thinner than about a pixel
//   poles    white PVC, with a coupling where two poles meet and a cap on top
//   panels   the plywood sheets are cut out of their merged meshes: rubber on the top face, plies on the edges,
//            grain underneath; balls shade them (a small soft shadow under each ball, in the material)
//   wheels   plastic rims with a matte rubber tread; plates, sheet metal, gears, shafts, the printed dual chamber
//   ground   analytic ground shadows for the bed, the ramps, the poles, the feeder, the thrower and each ball
// Nothing shared is set: the studio centre and every other value is a uniform of this actor's own materials.
export const ROBO_PRESETS = {
  // [preset, overrides, lookOpts, keep the CAD colour of the material it replaces]
  pvc: ['plasticMolded', { color: 0xc9c9c3, roughness: 0.18, sheen: 0 }, { envIntensity: 1.0, micro: { tile: 0.02, normal: 0.04, rough: 0.03 } }],
  frame: ['aluminumBeadBlast', { color: 0xa6abb1, roughness: 0.44 }, { micro: { tile: 0.02, normal: 0.2, rough: 0.05 } }],
  sheet: ['stainless', { color: 0xb3b7bc, roughness: 0.4 }, { micro: { tile: 0.03, normal: 0.12, rough: 0.06 } }],
  plate: ['aluminumBrushed', { color: 0xcdd1d5, roughness: 0.26, anisotropy: 0.6 }, { axis: [0, 1, 0], near: 0.5, envIntensity: 1.3, micro: { tile: 0.12, normal: 0.3, rough: 0.18 } }],
  steel: ['stainless', { roughness: 0.24 }, { micro: { tile: 0.02, normal: 0.1, rough: 0.05 } }, true],
  motor: ['blackOxide', { roughness: 0.42 }, {}, true],
  printed: ['plasticMatte', { roughness: 0.66 }, { envIntensity: 1.15, micro: { tile: 0.06, normal: 0.32, rough: 0.08, planes: [1, 0.6, 1] } }, true],
  molded: ['plasticMolded', { roughness: 0.52 }, { micro: { tile: 0.02, normal: 0.2, rough: 0.08 } }, true],
  wheel: ['plasticMolded', { roughness: 0.36, sheen: 0 }, { micro: { gen: 'grain', tile: 0.03, normal: 0.5, rough: 0.05 } }, true],
  panel: ['plasticMolded', { color: 0xffffff, roughness: 0.74, sheen: 0 }, { micro: { gen: 'grain', tile: 0.05, normal: 0.55, rough: 0.05 } }],
  wire: ['stainless', { color: 0xc4c8cc, roughness: 0.3 }, { micro: false }],
  rope: ['braided', { color: 0x2b2c30, roughness: 0.6 }, {}],
};
// which kind each CAD mesh becomes: part name -> the mesh's palette key (without "robo:") -> kind
const ROBO_KINDS = {
  bed: { frame: 'frame' }, groundRamps: { frame: 'panel' }, backstop: { frame: 'pvc' },
  cage: { frame: 'frame', accent2: 'sheet', black: 'motor' },
  indexer: { frame: 'printed', accent2: 'printed' }, tube: { frame: 'molded' },
  throwerBase: { frame: 'sheet', black: 'motor', steel: 'steel' },
  throwerPlates: { accent: 'plate', frame: 'sheet', steel: 'steel' },
  flywheelBottom: { steel: 'steel', accent: 'wheel' }, flywheelTop: { steel: 'steel', accent: 'wheel' },
  idlers: { steel: 'steel' },
};
// per kind: bevel width (m) and strength, crease width (m) and darkness, occlusion inside closed bores and slots
const ROBO_EDGES = {
  frame: [0.0012, 0.8, 0.004, 0.4, 0.55], sheet: [0.001, 0.8, 0.003, 0.4, 0.55], plate: [0.0014, 0.9, 0.004, 0.45, 0.5],
  steel: [0.0006, 0.85, 0.002, 0.45, 0.55], motor: [0.0008, 0.8, 0.003, 0.4, 0.55], printed: [0.0012, 0.9, 0.004, 0.5, 0.42],
  molded: [0.0012, 0.8, 0.004, 0.4, 0.45], wheel: [0.0012, 0.8, 0.004, 0.5, 0.5], panel: [0.0008, 0.7, 0.003, 0.3, 0.6],
};
const ROBO_ROPE = { cord: 0.0014, knot: 0.0038, jitter: 0.0035, pitch: 0.0075, border: 1.7, lift: 0.004 };   // cord and knot radius (m), twist pitch, border cord scale, gap to the poles

// ---- zones: one mesh, two or three materials. lookZone.x says what a face is (0 the material itself, 1 a plywood
// edge, 2 rubber), lookZone.y how high it is in the sheet (0 underside .. 1 top face)
const ZONE_FRAG_PARS = `
varying vec2 vLookZone;
uniform vec4 lookRubber;    // rgb: the rubber (linear), a: its roughness
uniform vec4 lookPly;       // x: plies through a sheet, y: share of the micro normal outside the rubber
uniform vec3 lookPlyA;      // the light veneer
uniform vec3 lookPlyB;      // the dark one (the glue lines and the cross plies)
vec3 lookZoneN;`;
const ZONE_COLOR = `
{
  float zr = step(1.5, vLookZone.x), ze = step(0.5, vLookZone.x) * (1.0 - zr);
  float t = vLookZone.y * lookPly.x, tw = fwidth(t);
  float band = smoothstep(0.5 - tw, 0.5 + tw, abs(fract(t * 0.5) * 2.0 - 1.0));
  band = mix(band, 0.5, clamp(tw * 1.5 - 0.5, 0.0, 1.0));     // plies thinner than a pixel: their mean
  vec3 ply = mix(lookPlyA, lookPlyB, band) * (0.7 + 0.3 * diffuseColor.g / max(lookPlyA.g, 1e-3));
  diffuseColor.rgb = mix(mix(diffuseColor.rgb, ply, ze), lookRubber.rgb, zr);
}`;
function zoneMaterial(T, m, { rubber = 0x232427, rough = 0.92, plies = 7, share = 0.4, plyA = 0xd8bb8a, plyB = 0x8b6238 } = {}) {
  const c = new T.Color(rubber);
  const U = { lookRubber: { value: new T.Vector4(c.r, c.g, c.b, rough) }, lookPly: { value: new T.Vector4(plies, share, 0, 0) }, lookPlyA: { value: new T.Color(plyA) }, lookPlyB: { value: new T.Color(plyB) } };
  return extendMaterial(m, 'zone', sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = after(after(sh.vertexShader, 'common', 'attribute vec2 lookZone;\nvarying vec2 vLookZone;'), 'begin_vertex', 'vLookZone = lookZone;');
    let fs = after(sh.fragmentShader, 'common', ZONE_FRAG_PARS);
    fs = after(fs, 'map_fragment', ZONE_COLOR);
    fs = after(fs, 'roughnessmap_fragment', 'roughnessFactor = mix(roughnessFactor, lookRubber.a, step(1.5, vLookZone.x));');
    fs = after(fs, 'normal_fragment_maps', 'lookZoneN = normal;');
    // the rubber keeps the whole micro texture, the smoother rim or veneer a share of it
    sh.fragmentShader = fs.replace('#include <emissivemap_fragment>', 'normal = normalize(mix(lookZoneN, normal, mix(lookPly.y, 1.0, step(1.5, vLookZone.x))));\n#include <emissivemap_fragment>');
  });
}
// ---- balls shade the surface they roll on: contact occlusion under the ball and its soft shadow away from the key
const BALLS_FRAG_PARS = `
uniform vec4 lookBalls[2];  // world centre and radius of each ball (radius 0: none)
uniform vec3 lookKey;       // toward the key light, world
float lookBallShade(vec3 P, vec3 N) {
  float sh = 1.0;
  for (int i = 0; i < 2; i++) {
    vec4 b = lookBalls[i];
    vec3 d = b.xyz - P;
    float L2 = dot(d, d);
    if (b.w <= 0.0 || L2 > 100.0 * b.w * b.w) continue;
    float ao = clamp(dot(N, d) * inversesqrt(L2), 0.0, 1.0) * b.w * b.w / max(L2, b.w * b.w);
    float t = dot(d, lookKey), pen = 0.25 * b.w + 0.3 * max(t, 0.0);
    float k = (1.0 - smoothstep(b.w - pen, b.w + pen, length(d - t * lookKey))) * step(0.0, t) * 4.0 * b.w / (4.0 * b.w + max(t, 0.0));
    sh *= (1.0 - 0.62 * ao) * (1.0 - 0.5 * k);
  }
  return sh;
}`;
function ballShadeMaterial(m, U) {
  return extendMaterial(m, 'balls', sh => {
    Object.assign(sh.uniforms, U);
    sh.fragmentShader = after(sh.fragmentShader, 'common', BALLS_FRAG_PARS)
      .replace('#include <opaque_fragment>', 'outgoingLight *= lookBallShade(vLookW, inverseTransformDirection(normal, viewMatrix));\n#include <opaque_fragment>');
  });
}
// ---- rope net: lookNet is the cell coordinate of a vertex (knots at whole numbers)
const ROPE_FRAG_PARS = `
varying vec2 vLookNet;
uniform vec4 lookRope;      // x, y: cell size (m), z: cord radius (m), w: knot radius (m)
uniform vec4 lookRopeN;     // x, y: cells across and up, z: twist pitch (m), w: border cord scale`;
const ROPE_FRAG = `
{
  vec2 g = vLookNet, fw = max(fwidth(g), vec2(1e-6));
  vec2 id = floor(g + 0.5), q = g - id, c = abs(q);                        // the nearest cord and the offset from it, in cells
  vec2 bd = min(step(id, vec2(0.5)) + step(lookRopeN.xy - 0.5, id), 1.0);  // 1 on the border cords
  vec2 hw = lookRope.z / lookRope.xy * mix(vec2(1.0), vec2(lookRopeN.w), bd);
  // each cord, box-filtered over the pixel: a cord thinner than a pixel keeps its share of it instead of breaking up
  vec2 cov = (clamp(c + 0.5 * fw, -hw, hw) - clamp(c - 0.5 * fw, -hw, hw)) / fw;
  vec2 lim = lookRopeN.yx + hw.yx;
  cov *= step(-hw.yx, g.yx) * step(g.yx, lim);                             // cords end at the border
  vec2 dm = q * lookRope.xy;
  float px = 0.5 * (fw.x * lookRope.x + fw.y * lookRope.y), rk = lookRope.w * mix(1.0, 0.5 + 0.5 * lookRopeN.w, max(bd.x, bd.y));
  float dk = length(dm), ck = clamp((rk - dk) / px + 0.5, 0.0, 1.0) * min(1.0, 2.0 * rk / px);
  ck *= step(-0.5, id.x) * step(id.x, lookRopeN.x + 0.5) * step(-0.5, id.y) * step(id.y, lookRopeN.y + 0.5);
  float lookA = 1.0 - (1.0 - cov.x) * (1.0 - cov.y) * (1.0 - ck);
  if (lookA < 0.004) discard;
  diffuseColor.a *= lookA;
  // the sheet's tangents from screen derivatives, then each cord as a round, twisted strand and each knot as a bead
  vec3 q0 = dFdx(vViewPosition), q1 = dFdy(vViewPosition), N0 = normal;
  vec2 s0 = dFdx(g), s1 = dFdy(g);
  vec3 q1p = cross(q1, N0), q0p = cross(N0, q0);
  vec3 Tu = q1p * s0.x + q0p * s1.x, Tv = q1p * s0.y + q0p * s1.y;
  float sc = inversesqrt(max(max(dot(Tu, Tu), dot(Tv, Tv)), 1e-20));
  Tu *= -sc; Tv *= -sc;
  vec2 s = clamp(q / hw, -1.0, 1.0) * clamp(2.0 * hw / fw - 0.5, 0.0, 1.0);          // across each cord, flat when it is thinner than a pixel
  vec2 along = g.yx * lookRope.yx / lookRopeN.z;                                      // twists along each cord
  vec2 tw = smoothstep(1.5, 4.0, lookRopeN.z / (fw.yx * lookRope.yx));                // gone before a twist is smaller than two pixels
  vec2 wave = sin(6.2832 * (along + 0.45 * s)) * tw;
  vec2 slope = cos(6.2832 * (along + 0.45 * s)) * tw;
  vec3 nV = N0 * sqrt(1.0 - s.x * s.x) + Tu * s.x - Tv * 0.55 * slope.x;
  vec3 nH = N0 * sqrt(1.0 - s.y * s.y) + Tv * s.y - Tu * 0.55 * slope.y;
  vec2 r = clamp(dm / rk, -1.0, 1.0) * clamp(2.0 * rk / px - 0.5, 0.0, 1.0);
  vec3 nK = N0 * sqrt(max(1.0 - dot(r, r), 0.0)) + Tu * r.x + Tv * r.y;
  float wV = cov.x * (1.0 - ck), wH = cov.y * (1.0 - cov.x) * (1.0 - ck);
  normal = normalize(nV * wV + nH * wH + nK * ck + N0 * 1e-4);
  // the grooves between the strands are dark; a cord too thin to show them keeps their mean
  diffuseColor.rgb *= 0.62 - 0.38 * (wV * wave.x + wH * wave.y) / max(wV + wH + ck, 1e-4);
}`;
function ropeNet(T, look, N, mat, R) {
  const { cols, rows } = N, M = 0.3;                  // the sheet reaches 0.3 cell past the border cords, to carry their outer half
  const us = [-M], vs = [-M];
  for (let i = 0; i <= cols; i++) us.push(i);
  for (let j = 0; j <= rows; j++) vs.push(j);
  us.push(cols + M); vs.push(rows + M);
  const nu = us.length, nv = vs.length, n = nu * nv, cw = (N.x1 - N.x0) / cols, ch = (N.y1 - N.y0) / rows;
  const flat = new Float32Array(n * 2), base = new Float32Array(n * 3), pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), cell = new Float32Array(n * 2), o = [0, 0, 0];
  for (let j = 0, k = 0; j < nv; j++) for (let i = 0; i < nu; i++, k++) {
    const x = N.x0 + us[i] * cw, y = N.y0 + vs[j] * ch;
    N.rest(x, y, o);
    flat[2 * k] = x; flat[2 * k + 1] = y;
    // hand-tied: no knot sits exactly on the grid (the border cords stay straight)
    const in_ = i > 1 && i < nu - 2 && j > 1 && j < nv - 2 ? R.jitter : 0;
    base[3 * k] = x + o[0] + in_ * (hash2(i, j, 31) * 2 - 1); base[3 * k + 1] = y + o[1] + in_ * (hash2(i, j, 47) * 2 - 1); base[3 * k + 2] = N.z + R.lift + o[2] + 0.6 * in_ * (hash2(i, j, 59) * 2 - 1);
    cell[2 * k] = us[i]; cell[2 * k + 1] = vs[j];
  }
  const idx = [];
  for (let j = 0; j < nv - 1; j++) for (let i = 0; i < nu - 1; i++) { const a = j * nu + i, b = a + 1, c = a + nu, d = c + 1; idx.push(a, b, d, a, d, c); }
  const geo = new T.BufferGeometry();
  const aP = new T.BufferAttribute(pos, 3), aN = new T.BufferAttribute(nrm, 3);
  aP.setUsage(T.DynamicDrawUsage); aN.setUsage(T.DynamicDrawUsage);
  geo.setAttribute('position', aP); geo.setAttribute('normal', aN); geo.setAttribute('lookNet', new T.BufferAttribute(cell, 2));
  geo.setIndex(idx);
  // the net can swing half a metre: one generous bound, never recomputed
  geo.boundingSphere = new T.Sphere(new T.Vector3((N.x0 + N.x1) / 2, (N.y0 + N.y1) / 2, N.z), Math.hypot(N.x1 - N.x0, N.y1 - N.y0) / 2 + 0.6);
  const mesh = new T.Mesh(geo, mat);
  mesh.name = 'lookRopeNet'; mesh.userData.lookNoShadow = true;
  function update() {
    for (let k = 0; k < n; k++) {
      N.field(flat[2 * k], flat[2 * k + 1], o);
      pos[3 * k] = base[3 * k] + o[0]; pos[3 * k + 1] = base[3 * k + 1] + o[1]; pos[3 * k + 2] = base[3 * k + 2] + o[2];
    }
    // normals from the neighbours on the grid
    for (let j = 0, k = 0; j < nv; j++) for (let i = 0; i < nu; i++, k++) {
      const a = 3 * (k - (i > 0 ? 1 : 0)), b = 3 * (k + (i < nu - 1 ? 1 : 0)), c = 3 * (k - (j > 0 ? nu : 0)), d = 3 * (k + (j < nv - 1 ? nu : 0));
      const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2], vx = pos[d] - pos[c], vy = pos[d + 1] - pos[c + 1], vz = pos[d + 2] - pos[c + 2];
      const x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx, l = Math.hypot(x, y, z) || 1;
      nrm[3 * k] = x / l; nrm[3 * k + 1] = y / l; nrm[3 * k + 2] = z / l;
    }
    aP.needsUpdate = true; aN.needsUpdate = true;
  }
  update();
  return { mesh, geo, update, triangles: idx.length / 3 };
}
// ---- thin wire: tubes whose radius never falls under about half a pixel (they stay whole lines, as GL lines did)
const WIRE_VERT = `
{
  vec4 lookMv = modelViewMatrix * vec4(transformed, 1.0);
  float lookPx = lookWire.x * length(modelViewMatrix[0].xyz) * lookWire.y * projectionMatrix[1][1] / (isOrthographic ? 1.0 : max(-lookMv.z, 1e-4));
  transformed += objectNormal * lookWire.x * (max(1.0, lookWire.z / max(lookPx, 1e-4)) - 1.0);
}`;
function wireGeometry(T, segs, r, sides = 5) {
  const pos = [], nrm = [], idx = [], a = new T.Vector3(), b = new T.Vector3(), d = new T.Vector3(), u = new T.Vector3(), v = new T.Vector3(), w = new T.Vector3();
  for (let i = 0; i < segs.length; i += 6) {
    a.set(segs[i], segs[i + 1], segs[i + 2]); b.set(segs[i + 3], segs[i + 4], segs[i + 5]);
    d.subVectors(b, a).normalize();
    u.set(Math.abs(d.y) < 0.9 ? 0 : 1, Math.abs(d.y) < 0.9 ? 1 : 0, 0).cross(d).normalize(); v.crossVectors(d, u);
    const o = pos.length / 3;
    for (let k = 0; k < sides; k++) {
      const t = k / sides * Math.PI * 2;
      w.copy(u).multiplyScalar(Math.cos(t)).addScaledVector(v, Math.sin(t));
      for (const e of [a, b]) { pos.push(e.x + w.x * r, e.y + w.y * r, e.z + w.z * r); nrm.push(w.x, w.y, w.z); }
      const k1 = (k + 1) % sides;
      idx.push(o + 2 * k, o + 2 * k1, o + 2 * k + 1, o + 2 * k1, o + 2 * k1 + 1, o + 2 * k + 1);
    }
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(nrm, 3));
  g.setIndex(idx); g.computeBoundingSphere();
  return g;
}
// ---- PVC fittings: a coupling where two poles meet end to end, a cap on each top
function fittingsGeometry(T, P, sides = 20) {
  const R = P.r + 0.0004, R1 = P.r * 1.3, pos = [], nrm = [];
  const V = a => a.map(p => new T.Vector2(p[0], p[1]));
  const coupling = V([[R, -0.038], [R1 - 0.002, -0.038], [R1, -0.036], [R1, -0.0035], [R1 + 0.0012, -0.0025], [R1 + 0.0012, 0.0025], [R1, 0.0035], [R1, 0.036], [R1 - 0.002, 0.038], [R, 0.038]]);
  const cap = V([[R, -0.03], [R1 - 0.002, -0.03], [R1, -0.028], [R1, 0.004], [R1 - 0.004, 0.009], [R1 * 0.5, 0.0115], [0.0001, 0.012]]);
  const put = (profile, x, y) => {
    const g = new T.LatheGeometry(profile, sides).toNonIndexed(), p = g.attributes.position, q = g.attributes.normal;
    for (let i = 0; i < p.count; i++) { pos.push(p.getX(i) + x, p.getY(i) + y, p.getZ(i) + P.z); nrm.push(q.getX(i), q.getY(i), q.getZ(i)); }
    g.dispose();
  };
  for (const x of P.xs) { for (let i = 1; i < P.ys.length - 1; i++) put(coupling, x, P.ys[i]); put(cap, x, P.ys[P.ys.length - 1]); }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(nrm, 3));
  g.computeBoundingSphere();
  return g;
}
// ---- plywood: the sheets inside a merged CAD mesh. `slabs` are [nx, ny, nz, d0, d1] in mesh space (unit normal, the
// offsets of the underside and the top face). Returns the sheets as their own geometry (uv along the grain, lookZone:
// 0 underside, 1 edge, 2 top face) and the rest of the mesh.
function panelGeometry(T, src, slabs, { tile = 0.5, tol = 0.0012 } = {}) {
  const P = src.attributes.position, Nn = src.attributes.normal, I = src.index, nT = (I ? I.count : P.count) / 3, nV = P.count;
  const S = slabs.map(([nx, ny, nz, d0, d1]) => {
    const n = new T.Vector3(nx, ny, nz).normalize(), g = new T.Vector3(1, 0, 0).addScaledVector(n, -n.x).normalize();   // the face grain runs along x
    return { n, g, b: new T.Vector3().crossVectors(n, g), d0, d1 };
  });
  // which sheet each vertex lies in (bit k: within sheet k), then each triangle: all three corners in one sheet
  const inS = new Uint8Array(nV), p = new T.Vector3();
  for (let i = 0; i < nV; i++) {
    p.fromBufferAttribute(P, i);
    for (let k = 0; k < S.length; k++) { const d = p.dot(S[k].n); if (d > S[k].d0 - tol && d < S[k].d1 + tol) inS[i] |= 1 << k; }
  }
  const of = new Int8Array(nT);
  let nP = 0;
  const ix = (t, k) => (I ? I.getX(3 * t + k) : 3 * t + k);
  for (let t = 0; t < nT; t++) {
    const m = inS[ix(t, 0)] & inS[ix(t, 1)] & inS[ix(t, 2)];
    of[t] = m ? Math.log2(m & -m) : -1;
    if (m) nP++;
  }
  const mk = (n, full) => ({ n: 0, pos: new Float32Array(n * 9), nrm: new Float32Array(n * 9), uv: full ? new Float32Array(n * 6) : null, zone: full ? new Float32Array(n * 6) : null });
  const out = mk(nP, true), rest = mk(nT - nP, false);
  const q = [new T.Vector3(), new T.Vector3(), new T.Vector3()], e1 = new T.Vector3(), e2 = new T.Vector3(), fn = new T.Vector3(), dn = [0, 0, 0];
  for (let t = 0; t < nT; t++) {
    const s = of[t] < 0 ? null : S[of[t]], dst = s ? out : rest, o = dst.n++;
    for (let k = 0; k < 3; k++) {
      const i = ix(t, k), j = 9 * o + 3 * k;
      q[k].fromBufferAttribute(P, i);
      dst.pos[j] = q[k].x; dst.pos[j + 1] = q[k].y; dst.pos[j + 2] = q[k].z;
      dst.nrm[j] = Nn.getX(i); dst.nrm[j + 1] = Nn.getY(i); dst.nrm[j + 2] = Nn.getZ(i);
      if (s) dn[k] = q[k].dot(s.n);
    }
    if (!s) continue;
    fn.crossVectors(e1.subVectors(q[1], q[0]), e2.subVectors(q[2], q[0])).normalize();
    const face = Math.abs(fn.dot(s.n)) > 0.7, top = face && Math.min(dn[0], dn[1], dn[2]) > s.d0 + 0.0015;
    const long = Math.abs(fn.dot(s.b)) > Math.abs(fn.dot(s.g));           // an edge that runs along the grain
    for (let k = 0; k < 3; k++) {
      const u = q[k].dot(s.g), v = q[k].dot(s.b), w = Math.min(1, Math.max(0, (dn[k] - s.d0) / (s.d1 - s.d0))), j = 6 * o + 2 * k;
      out.uv[j] = (face || long ? u : v) / tile; out.uv[j + 1] = face ? v / tile : 0.37;
      out.zone[j] = face ? (top ? 2 : 0) : 1; out.zone[j + 1] = w;
    }
  }
  const geo = (o) => {
    if (!o.n) return null;
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(o.pos, 3)); g.setAttribute('normal', new T.BufferAttribute(o.nrm, 3));
    if (o.uv) { g.setAttribute('uv', new T.BufferAttribute(o.uv, 2)); g.setAttribute('lookZone', new T.BufferAttribute(o.zone, 2)); }
    g.computeBoundingSphere();
    return g;
  };
  return { panel: geo(out), rest: geo(rest) };
}
// the face veneer: tan wood with long, slightly wavy grain lines (canvas strokes, no pixel loops); tiles both ways
function plywoodTexture(T, n) {
  const c = document.createElement('canvas'); c.width = c.height = n;
  const g = c.getContext('2d');
  g.fillStyle = '#c9a877'; g.fillRect(0, 0, n, n);
  let seed = 11;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 150; i++) {
    const y = rnd() * n, a = (1 + 2 * rnd()) * n / 256, f = 1 + Math.floor(rnd() * 3), ph = rnd() * 7, dark = rnd() < 0.7;
    g.strokeStyle = dark ? `rgba(118,78,40,${0.05 + 0.2 * rnd()})` : `rgba(236,212,170,${0.05 + 0.15 * rnd()})`;
    g.lineWidth = (0.5 + 2.2 * rnd() * rnd()) * n / 256;
    for (const o of [-n, 0, n]) {
      g.beginPath();
      for (let x = 0; x <= n; x += n / 32) { const yy = y + o + a * Math.sin(x / n * Math.PI * 2 * f + ph); if (x) g.lineTo(x, yy); else g.moveTo(x, yy); }
      g.stroke();
    }
  }
  const t = new T.CanvasTexture(c);
  t.wrapS = t.wrapT = T.RepeatWrapping; t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4; t.name = 'look-plywood';
  return t;
}

export async function dressRoboCatcher({ engine, quality = 'high', view, model, balls = [], parts = [], edges = true }) {
  const look = getLook({ renderer: engine.renderer, quality });
  const T = look.THREE, H = model.hints, low = look.tier.name === 'low';
  const undo = [], added = [], made = new Map(), geos = [], texs = [], lines = [];
  let ground = null, net = null;
  const restore = () => {
    for (const [mesh, mat, geo, rz] of undo) { mesh.material = mat; mesh.geometry = geo; mesh.rotation.z = rz; }
    for (const o of added) o.removeFromParent();
    for (const [seg, parent] of lines) parent.add(seg);
    if (H.net) { H.net.sync = null; H.net.hung = false; H.net.lift = 0; }
    for (const m of made.values()) m.dispose();
    for (const g of geos) g.dispose();
    for (const t of texs) t.dispose();
    if (ground) ground.dispose();
  };
  try {
    // ---- ground shadows: the bed, the ramps, the feeder and the thrower stand on the page (a tight contact line and
    // a soft key shadow); each pole throws a long faint streak; a ball has a small soft shadow where it is low. The
    // net casts none. Lengths are those of the pedals' ground, scaled to a machine eight times its size.
    let t0 = now();
    const breathe = async (ms = 2.5) => { if (now() - t0 > ms) { await yieldTask(); t0 = now(); } };   // never hold a frame
    const Y0 = -0.001;
    ground = look.createGround({ parent: view, y: Y0, size: 6.4, fade: 0.3, sweep: 0.6, name: 'lookGround',
      terms: { core: [0.009, 0.08, 0.8, 0.07], key: [0.024, 0.26, 0.4, 0.8], amb: [0.085, 0.4, 0.22, 0.7] } });
    const inv = new T.Matrix4(), m4 = new T.Matrix4(), pt = new T.Vector3();
    const boxOf = root => {
      const b = new T.Box3();
      root.updateWorldMatrix(true, true); inv.copy(root.matrixWorld).invert();
      root.traverse(o => {
        if (!o.isMesh || !o.geometry) return;
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        const g = o.geometry.boundingBox; m4.multiplyMatrices(inv, o.matrixWorld);
        for (let i = 0; i < 8; i++) b.expandByPoint(pt.set(i & 1 ? g.max.x : g.min.x, i & 2 ? g.max.y : g.min.y, i & 4 ? g.max.z : g.min.z).applyMatrix4(m4));
      });
      return b;
    };
    const CAST = { bed: [1, 0.6], groundRamps: [1, 0.5], cage: [1, 0.8], tube: [0.6, 0.3], throwerBase: [1, 0.7], throwerPlates: [0.9, 0.5] };   // strength, contact
    for (const P of parts) if (CAST[P.name]) ground.add(P.mesh, { box: boxOf(P.mesh), strength: CAST[P.name][0], contact: CAST[P.name][1] });
    if (H.poles) for (const x of H.poles.xs) for (let i = 0; i < H.poles.ys.length - 1; i++) {
      const r = H.poles.r, y0 = H.poles.ys[i], y1 = H.poles.ys[i + 1];
      ground.add(H.poles.part, { box: new T.Box3(new T.Vector3(x - r, y0, H.poles.z - r), new T.Vector3(x + r, y1, H.poles.z + r)), strength: 3, contact: 1 });
    }
    for (const b of balls) ground.add(b.group, { shape: 'disc', radius: b.radius, box: new T.Box3(new T.Vector3(-b.radius, -b.radius, -b.radius), new T.Vector3(b.radius, b.radius, b.radius)), strength: 1, contact: 0.3 });
    const rest = parts.map(P => [P.mesh, P.mesh.position.y]);

    await look.env();
    await yieldTask(); t0 = now();
    // ---- materials, with this actor's own studio centre
    const env = { value: new T.Vector4() };
    const UB = { lookBalls: { value: [new T.Vector4(), new T.Vector4()] }, lookKey: { value: new T.Vector3(...look.studio.key).normalize() } };
    const UW = { lookWire: { value: new T.Vector3(0.0013, 450, 0.55) } };
    const mk = (kind, src, extra) => {
      const key = kind + (src ? src.uuid : '');
      if (made.has(key)) return made.get(key);
      const [name, over, lo, tint] = ROBO_PRESETS[kind];
      const m = look.material(name, { ...over, side: src ? src.side : T.DoubleSide, ...(tint && src ? { color: src.color.clone() } : {}), ...extra }, lo);
      m.userData.lookUniforms.lookEnv = env;
      if (kind === 'panel') { zoneMaterial(T, m, { rubber: 0x38393c, rough: 0.82, share: 0.4 }); ballShadeMaterial(m, UB); }
      if (kind === 'wheel') zoneMaterial(T, m, { rubber: 0x1b1b1d, rough: 0.93, share: 0.15 });
      // white on a white page: a black card on each side of the set draws a soft dark line down a pole's edges
      if (kind === 'pvc') extendMaterial(m, 'flag', sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <transmission_fragment>', 'totalDiffuse *= 1.0 - 0.6 * pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 1.5);\n#include <transmission_fragment>'); });
      if (edges && ROBO_EDGES[kind]) edgeMaterial(T, m, ROBO_EDGES[kind]);
      made.set(key, m);
      return m;
    };
    const wood = plywoodTexture(T, low ? 128 : 256);
    texs.push(wood);
    const keyOf = new Map(Object.entries(model.materials).map(([k, m]) => [m, k.replace(/^robo:/, '')]));
    const slabsOf = new Map((H.plywood || []).map(p => [p.part, p.slabs]));
    const todo = [];   // [mesh, cavity]: rounded edges, computed in time slices below
    const swap = (o, kind, geo, src) => {
      o.material = mk(kind, src, kind === 'panel' ? { map: wood } : null);
      if (geo) { o.geometry = geo; geos.push(geo); }
      if (edges && ROBO_EDGES[kind]) todo.push([o, ROBO_EDGES[kind][4]]);
    };
    for (const [name, part] of Object.entries(model.parts)) {
      const meshes = [];
      part.traverse(o => { if (o.isMesh && o.material && o.material.isMeshStandardMaterial && keyOf.has(o.material) && !o.material.userData.look) meshes.push(o); });
      for (const o of meshes) {
        const src = o.material, kind = (ROBO_KINDS[name] || {})[keyOf.get(src)];
        if (!kind) continue;
        undo.push([o, src, o.geometry, o.rotation.z]);
        const slabs = slabsOf.get(part);
        if (slabs) {
          // the sheets leave the merged mesh; what stays is the frame around them (if anything)
          const off = o.position, sl = slabs.map(([nx, ny, nz, d0, d1]) => { const d = nx * off.x + ny * off.y + nz * off.z; return [nx, ny, nz, d0 - d, d1 - d]; });
          const { panel, rest: left } = panelGeometry(T, o.geometry, sl);
          if (kind === 'panel' || !left) { swap(o, 'panel', panel, src); continue; }
          swap(o, kind, left, src);
          if (panel) {
            const pm = new T.Mesh(panel, o.material);
            pm.name = name + ':plywood'; pm.position.copy(o.position);
            o.parent.add(pm); added.push(pm);
            swap(pm, 'panel', panel, src);
          }
        } else if (kind === 'wheel') {
          const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(), p = g.attributes.position, z = new Float32Array(p.count * 2);
          for (let i = 0; i < p.count; i += 3) {
            let r = 0;
            for (let k = 0; k < 3; k++) r += Math.hypot(p.getY(i + k) + o.position.y, p.getZ(i + k) + o.position.z) / 3;   // the shaft is the part's own x axis
            if (r > H.treadR) z[2 * i] = z[2 * i + 2] = z[2 * i + 4] = 2;
          }
          g.setAttribute('lookZone', new T.BufferAttribute(z, 2));
          swap(o, kind, g, src);
        } else if (kind === 'printed') {
          // printed flat on the bed: the layers stack along the shaft (the part's x). The micro texture stacks along a
          // mesh's own y, so the mesh is turned a quarter and its geometry turned back.
          const g = o.geometry.clone().applyMatrix4(m4.makeRotationZ(Math.PI / 2));
          o.rotation.z -= Math.PI / 2;
          swap(o, kind, g, src);
        } else swap(o, kind, null, src);
        await breathe();
      }
    }
    // rounded edges and dark creases (the pedals' edge code), in time slices
    for (const [o, cavity] of todo) {
      const it = edgeSteps(T, o.geometry, { cavity });
      let r;
      while (!(r = it.next()).done) await breathe();
      geos.push(r.value); o.geometry = r.value;
    }
    await breathe(0);
    // ---- the rope net in place of the line set
    if (H.net) {
      const N = H.net, R = ROBO_ROPE;
      const mat = mk('rope', null, { transparent: true, depthWrite: false, side: T.DoubleSide });
      const UR = { lookRope: { value: new T.Vector4((N.x1 - N.x0) / N.cols, (N.y1 - N.y0) / N.rows, R.cord, R.knot) }, lookRopeN: { value: new T.Vector4(N.cols, N.rows, R.pitch, R.border) } };
      extendMaterial(mat, 'rope', sh => {
        Object.assign(sh.uniforms, UR);
        sh.vertexShader = after(after(sh.vertexShader, 'common', 'attribute vec2 lookNet;\nvarying vec2 vLookNet;'), 'begin_vertex', 'vLookNet = lookNet;');
        sh.fragmentShader = after(after(sh.fragmentShader, 'common', ROPE_FRAG_PARS), 'normal_fragment_maps', ROPE_FRAG);
      });
      N.hung = true; N.lift = R.lift;
      net = ropeNet(T, look, N, mat, R);
      geos.push(net.geo);
      N.part.add(net.mesh); added.push(net.mesh);
      lines.push([N.lines, N.lines.parent]); N.lines.removeFromParent();
      N.sync = net.update;
    }
    await breathe(0);
    // ---- steel wire in place of the feeder's line set
    if (H.wires) {
      const W = H.wires, g = wireGeometry(T, W.segments, UW.lookWire.value.x, low ? 4 : 5);
      const mat = mk('wire', null);
      extendMaterial(mat, 'wire', sh => {
        Object.assign(sh.uniforms, UW);
        sh.vertexShader = after(after(sh.vertexShader, 'common', 'uniform vec3 lookWire;     // radius (m), half the drawing height (px), least radius (px)'), 'begin_vertex', WIRE_VERT);
      });
      const mesh = new T.Mesh(g, mat);
      mesh.name = 'lookWire';
      geos.push(g); W.part.add(mesh); added.push(mesh);
      lines.push([W.lines, W.lines.parent]); W.lines.removeFromParent();
    }
    // ---- PVC fittings on the poles
    if (H.poles) {
      const g = fittingsGeometry(T, H.poles, low ? 12 : 20), pole = H.poles.part.children.find(o => o.isMesh && o.material.userData.look);
      const mesh = new T.Mesh(g, pole ? pole.material : mk('pvc', null));
      mesh.name = 'lookFittings';
      geos.push(g); H.poles.part.add(mesh); added.push(mesh);
    }
    // ---- the softballs: leather under the same studio and tone
    for (const b of balls) { look.adopt(b.mesh.material, { envIntensity: 1 }); const u = b.mesh.material.userData.lookUniforms; if (u) u.lookEnv = env; }

    const size = model.size || new T.Vector3(2, 1.6, 1), c = new T.Vector3(), s = new T.Vector3(), v2 = new T.Vector2();
    function frame() {
      // the receiver stays under the lowest part of the exploded view
      let y = 0;
      for (const [mesh, y0] of rest) y = Math.min(y, mesh.position.y - y0);
      ground.mesh.position.y = Y0 + Math.max(y, -0.2);
      // the studio stands around the machine
      model.group.updateWorldMatrix(true, false);
      c.set(0, size.y / 2, 0).applyMatrix4(model.group.matrixWorld); s.setFromMatrixScale(model.group.matrixWorld);
      const k = (s.x + s.y + s.z) / 3;
      env.value.set(c.x, c.y, c.z, 3.2 * k);
      for (let i = 0; i < 2; i++) {
        const b = balls[i], u = UB.lookBalls.value[i];
        if (!b || !b.group.visible || !b.group.parent) { u.w = 0; continue; }
        b.group.updateWorldMatrix(true, false);
        c.setFromMatrixPosition(b.group.matrixWorld);
        u.set(c.x, c.y, c.z, b.radius * k);
      }
      UW.lookWire.value.y = 0.5 * engine.renderer.getDrawingBufferSize(v2).y;
    }
    const sync = ground.mesh.onBeforeRender;
    ground.mesh.onBeforeRender = function (...a) { frame(); sync.apply(this, a); };
    frame();
    await look.ready();
    let gone = false;
    return {
      look, ground, materials: made, net, frame,
      setShadow(a) { ground.opacity = a; },
      dispose() { if (gone) return; gone = true; restore(); look.release(); },
    };
  } catch (e) { restore(); look.release(); throw e; }
}

// =============================================================== CHARGER, the hero rocket
// dressRocket: the rocket that next/js/hero3d.js createRocket builds plain, under the same studio and tone as the
// reels. The call swaps its materials, adds a nozzle throat and (given a scene) a soft shadow on the page, and can
// be undone (dispose). It reads nothing from the hero page, so the 3D viewer can call it on its own renderer.
//   paint    the airframe is two painted cardboard tubes: orange gloss paint under a clear coat (a faint orange
//            peel in the coat only), the red bands as paint. The lettering is vinyl on top of the coat: satin,
//            with a hair of raised edge. The rocket's detail map carries it (hero3d.js livery: red = vinyl,
//            green = the seam lines at the nose cone, the tube joint and the motor mount, blue = each tube's
//            spiral winding seam, a whisper of a groove that only shows where the highlight crosses it)
//   petg     printed PETG with fine layer lines stacked along the airframe: the white nose cone (its diffuse
//            darkens toward the turning edge, so it stands off the light page), the red screw cap, the motor mount
//   fins     plywood painted white: flat sheet with its real thickness; each face darkens toward its eased
//            outline (a soft edge, 3 mm) and toward the root
//   dark     the plastic rail buttons, and a nozzle throat with soot in the cap's bore (added: the model has no motor)
//   studio   the shared environment, turned for these materials only (material.envMapRotation): about the vertical
//            until the key softbox lies along the airframe, then about the airframe to lift its reflection onto the
//            upper third of the tube: one long soft highlight. The clear coat mirrors it `coat` times brighter
//            (a softbox is far brighter against a 4 % mirror than the studio map, tuned for bare metal, holds)
//   glow     rocket.glow.value lights the aft end and the fins from the flame (the intro sets it, flame.js `light`)
//   shadow   one quad behind the rocket: the analytic soft shadow of the body, the nose taper and the two fin pairs
//            (they turn with the roll) under that same key; it follows the lift and the flight, and widens and
//            fades as the rocket leaves. For a fixed camera that looks down -Z (the hero); the viewer passes none
// Nothing shared is set: the studio centre, its turn and every other value is a uniform of these materials.
//
//   dressRocket({ rocket, engine, renderer, scene, quality, merge, nozzle, shadow, turn }) -> Promise of
//     { look, materials (by name: paint, nose, cap, mount, fins, buttons, nozzle; unmerged: paint, paint2, fin1..4,
//       button1, button2), parts (CAD part id -> its material), meshes (added: fins, buttons, nozzle),
//       shadow (Mesh or null), key (Vector3: the turned key, toward the light), aim(), frame(), setShadow(0..1),
//       dispose() }
//     rocket    createRocket()'s result, or a promise of it (the studio is then built beside its download)
//     engine    showreel/engine.js engine: gives renderer and scene, and runs frame() before each draw
//     renderer, scene   in place of an engine; without a scene (or with shadow: false) there is no page shadow.
//               Without an engine, call frame() before a draw if there is a shadow or the layout's tilt can change
//     merge     true: the four fins and the two buttons become one mesh each (the hero: 9 draws); false: every CAD
//               mesh stays and gets a material of its own (the viewer picks, dims and ghosts single parts; they
//               all share the two programs), the fins and tubes only get a new geometry of the same shape
//     nozzle    false leaves the throat out (a model that has the motor)
//     turn      null: aim() follows rocket.layout.tiltZ, the airframe's tilt on screen; a number (rad) fixes the
//               studio's turn about the vertical and leaves out the lift (an orbiting camera)
//     ownStudio true (the hero): the rocket gets its own small copy of the studio (ROCKET_LOOK.env wide), built
//               beside the model download, and never takes the shared one. The rocket is the first 3D a visitor
//               sees, and the shared 2048 px studio cost most of a second before its first frame in software GL;
//               the guests still build and use the shared studio as before, and the rocket looks the same before
//               and after a guest is built. false (the viewer): the shared studio, as the reels use it
export const ROCKET_LOOK = {
  studio: 1.8,                       // radius (m) of the near-field studio around the rest position
  env: { high: 512, low: 512 },      // width (px) of the rocket's own studio map (ownStudio): at rest within 1 level of the shared 2048
  keyFront: 0.5,                     // the turned key stays at least this far in front (its z, of a unit vector)
  keyLift: 0.42,                     // then the studio turns this far (rad) about the airframe: the highlight moves up the tube
  // coat: gain of the clear coat's mirror image of the key; flag: what is left of its image of everything else
  paint: { roughness: 0.55, clearcoat: 0.55, clearcoatRoughness: 0.3, envIntensity: 1, coat: 1.25, flag: 0.35, micro: { gen: 'wobble', size: 128, cells: 4, tile: 0.016, normal: 0, rough: 0, coat: 0.1 } },
  // edge height (m), the vinyl's own roughness, the share of coat gloss it keeps, that gloss's roughness;
  // seam: darkness of a seam line; wind: depth (m) of the spiral winding seam under the paint
  vinyl: { height: 0.00035, roughness: 0.48, coat: 0.5, coatRoughness: 0.32, seam: 0.5, wind: 0.00006 },
  petg: { gen: 'layerLines', size: 256, tile: 0.03, normal: 0.26, rough: 0.08, planes: [1, 0.6, 1] },
  capTile: 0.05,                     // the small screw cap's layers are drawn coarser, so a 2x crop can show them
  flat: { gen: 'wobble', size: 128, cells: 4, tile: 0.012, normal: 0.04, rough: 0.03 },
  // colour (null = the CAD colour), roughness, env gain, turning-edge darkening
  nose: [0xf1f0eb, 0.38, 1.0, 0.7], fins: [0xf1f0eb, 0.5, 1.0, 0], cap: [null, 0.36, 1.1, 0], mount: [0x8c9096, 0.45, 1.0, 0],
  buttons: [null, 0.42, 1.0, 0], nozzle: [0x4a4541, 0.85, 0.7, 0],
  finRim: 0.5,                       // how dark a fin face gets toward its eased outline, and toward the root
  glow: { back: 0.05, reach: 0.062, color: [3.0, 0.85, 0.24] },   // the flame's light: how far behind the nozzle (m), 1/e reach (m), linear colour
  // the page is `gap` behind the airframe (m), `rise` more per metre flown; per term: blur at the page (m), blur per
  // metre of gap, strength; fade: the shadow goes between these distances flown (m)
  // front: the shadow's light stands at least this far in front (a grazing key would smear it across the page)
  shadow: { gap: 0.075, rise: 0.2, front: 0.85, key: [0.012, 0.2, 0.13], amb: [0.02, 0.35, 0.05], color: 0x15171d, fade: [0.25, 1.1] },
};
const RKT_FRAG_PARS = `
uniform float lookGlow;     // the motor's light (rocket.glow)
uniform vec4 lookGlowP;     // xyz: the flame (object space), w: reach (m)
uniform vec3 lookGlowC;
// a height step as a normal (true slopes: the surface derivatives are not normalised)
vec3 lookBump(vec3 n, vec2 dH, float fd) {
  vec3 sx = dFdx(-vViewPosition), sy = dFdy(-vViewPosition);
  vec3 r1 = cross(sy, n), r2 = cross(n, sx);
  float det = dot(sx, r1) * fd;
  return normalize(abs(det) * n - sign(det) * (dH.x * r1 + dH.y * r2));
}`;
const RKT_GLOW = `
{
  vec3 gv = lookGlowP.xyz - vLookP;
  float gd = length(gv);
  float gn = dot(normalize(vLookN), gv / max(gd, 1e-4));
  totalDiffuse += diffuseColor.rgb * lookGlowC * (lookGlow * exp(-gd / lookGlowP.w) * (0.4 + 0.6 * saturate(gn * 0.5 + 0.5)));
}
#include <transmission_fragment>`;
const RKT_SOLID_PARS = `
uniform vec4 lookRkt;       // x: fin outline and root darkening, y: turning-edge darkening, z: fin root radius (m)
uniform vec4 lookSoot;      // x, y: radius (m) where the soot is full and where it ends, z: only below this height, w: strength
varying vec4 vLookRim;      // distance (m) to the four sides of a fin face`;
const RKT_SOLID_ALBEDO = `
{
  float rr = length(vLookP.xz);
  float rim = min(min(vLookRim.x, vLookRim.y), min(vLookRim.z, vLookRim.w));
  diffuseColor.rgb *= 1.0 - lookRkt.x * (0.6 * (1.0 - smoothstep(0.0, 0.003, rim)) + 0.4 * (1.0 - smoothstep(lookRkt.z, lookRkt.z + 0.014, rr)));
  diffuseColor.rgb *= 1.0 - lookSoot.w * (1.0 - smoothstep(lookSoot.x, lookSoot.y, rr)) * step(vLookP.y, lookSoot.z);
}`;
const RKT_SOLID_TURN = `
totalDiffuse *= 1.0 - lookRkt.y * pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 1.5);`;
const RKT_PAINT_PARS = `
uniform sampler2D lookDetail;   // r: vinyl lettering, g: seam lines, b: the tubes' spiral winding seam
uniform vec4 lookVinyl;         // x: edge height (m), y: the vinyl's roughness, z: coat gloss it keeps, w: that gloss's roughness
uniform vec3 lookSeam;          // x: darkness of a seam line, y: the coat's mirror image away from the key, z: its gain on the key
uniform float lookWind;         // depth (m) of the winding seam
uniform vec3 lookKeyDir;        // toward the turned key (world)
vec3 lookD;
vec2 lookDH;`;
const RKT_SHADOW_FRAG = `
varying vec2 vP;            // metres: x along the airframe (tail to nose), y across
uniform vec4 uBody;         // x: tail, y: shoulder, z: nose tip, w: half width
uniform vec4 uFins;         // x: from, y: to, z, w: half widths of the two fin pairs
uniform vec4 uSoft;         // x: key blur, y: key strength, z: ambient blur, w: ambient strength
uniform vec3 uColor;
uniform float uOpacity;
float erf_(float x) {
  float s = sign(x); x = abs(x);
  float t = 1.0 / (1.0 + 0.3275911 * x);
  return s * (1.0 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * exp(-x * x));
}
float band(float y, float w, float k) { return 0.5 * (erf_((y + w) * k) - erf_((y - w) * k)); }
float occ(float s) {
  float k = 0.70710678 / s;
  float t = clamp((vP.x - uBody.y) / (uBody.z - uBody.y), 0.0, 1.0);
  float o = band(vP.y, uBody.w * (1.0 - t * t), k) * band(vP.x - 0.5 * (uBody.x + uBody.z), 0.5 * (uBody.z - uBody.x), k);
  float f = band(vP.x - 0.5 * (uFins.x + uFins.y), 0.5 * (uFins.y - uFins.x), k);
  return max(o, f * max(band(vP.y, uFins.z, k), band(vP.y, uFins.w, k)));
}
void main() {
  float a = 1.0 - (1.0 - uSoft.y * occ(uSoft.x)) * (1.0 - uSoft.w * occ(uSoft.z));
  gl_FragColor = vec4(uColor, a * uOpacity);
}`;
// CAD fin boxes -> one mesh with flat normals and `lookRim`: the distance (m) from a vertex to the four sides of
// its own face (linear across the face, so the least of the four is the distance to the outline)
function finGeometry(T, fins) {
  const P = [], N = [], R = [], v = [0, 1, 2].map(() => new T.Vector3()), n = new T.Vector3(), e = new T.Vector3(), c = new T.Vector3(), q = new T.Vector3();
  for (const f of fins) {
    const pos = f.geometry.attributes.position, idx = f.geometry.index, faces = new Map();
    const tris = idx ? idx.count / 3 : pos.count / 3, at = i => (idx ? idx.getX(i) : i);
    for (let t = 0; t < tris; t++) {
      for (let k = 0; k < 3; k++) v[k].fromBufferAttribute(pos, at(t * 3 + k));
      n.subVectors(v[1], v[0]).cross(e.subVectors(v[2], v[0])).normalize();
      const key = [n.x, n.y, n.z, n.dot(v[0])].map(x => Math.round(x * 500)).join();
      if (!faces.has(key)) faces.set(key, { n: n.clone(), pts: [], tris: [] });
      const F = faces.get(key);
      for (let k = 0; k < 3; k++) { if (!F.pts.some(p => p.distanceToSquared(v[k]) < 1e-10)) F.pts.push(v[k].clone()); F.tris.push(v[k].clone()); }
    }
    for (const F of faces.values()) {
      // the face's corners in order around its centre, then one inward line per side
      c.set(0, 0, 0); for (const p of F.pts) c.addScaledVector(p, 1 / F.pts.length);
      const ax = F.pts[0].clone().sub(c).normalize(), ay = F.n.clone().cross(ax);
      const ring = F.pts.slice().sort((a, b) => Math.atan2(q.subVectors(a, c).dot(ay), q.dot(ax)) - Math.atan2(e.subVectors(b, c).dot(ay), e.dot(ax)));
      const sides = ring.slice(0, 4).map((a, i) => { const b = ring[(i + 1) % ring.length], d = b.clone().sub(a).normalize(), inw = F.n.clone().cross(d); if (inw.dot(q.subVectors(c, a)) < 0) inw.negate(); return [a, inw]; });
      for (const p of F.tris) {
        P.push(p.x, p.y, p.z); N.push(F.n.x, F.n.y, F.n.z);
        for (let i = 0; i < 4; i++) R.push(sides[i] ? Math.max(0, q.subVectors(p, sides[i][0]).dot(sides[i][1])) : 1);
      }
    }
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(N, 3)); g.setAttribute('lookRim', new T.Float32BufferAttribute(R, 4));
  return g;
}
// a CAD tube (hero3d.js wraps it without an index, so its normals are flat and a gloss shows every facet): the same
// triangles with the normals of a true cylinder about y; the end rings keep theirs
function tubeGeometry(T, src, joint = null) {
  const g = new T.BufferGeometry(), pos = src.attributes.position, nrm = src.attributes.normal, out = new Float32Array(pos.count * 3);
  let ring = 0;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), nx = nrm.getX(i), ny = nrm.getY(i), nz = nrm.getZ(i), r = Math.hypot(x, z) || 1;
    if (Math.abs(ny) > 0.7) { out[i * 3 + 1] = Math.sign(ny); if (joint !== null && Math.abs(pos.getY(i) - joint) < 1e-3) ring++; continue; }
    const s = nx * x + nz * z < 0 ? -1 : 1;
    out[i * 3] = s * x / r; out[i * 3 + 2] = s * z / r;
  }
  g.setAttribute('position', pos); if (src.attributes.uv) g.setAttribute('uv', src.attributes.uv);
  g.setAttribute('normal', new T.BufferAttribute(out, 3));
  // the end ring at `joint` (where the two tubes butt together) is left out: the two rings would fight for the seam
  if (ring && !src.index) {
    const idx = [];
    for (let i = 0; i < pos.count; i += 3) if (!(Math.abs(out[i * 3 + 1]) === 1 && Math.abs(pos.getY(i) - joint) < 1e-3)) idx.push(i, i + 1, i + 2);
    g.setIndex(idx);
  } else if (src.index) g.setIndex(src.index);
  g.boundingBox = src.boundingBox; g.boundingSphere = src.boundingSphere;
  return g;
}
// indexed position + normal meshes of one frame -> one geometry
// the rocket's own studio: the shared studio's panels drawn into a W x W/2 map, then prefiltered (look.js buildEnv,
// smaller). Returns { texture, ms, dispose }.
function rocketStudio(T, renderer, studio, W) {
  const t0 = now();
  const rt = new T.WebGLRenderTarget(W, W / 2, { type: T.HalfFloatType, depthBuffer: false, generateMipmaps: false, minFilter: T.LinearFilter, magFilter: T.LinearFilter });
  const mat = new T.ShaderMaterial({ ...studioShader(studio), uniforms: { px: { value: 1.6 * Math.PI * 2 / W } }, depthTest: false, depthWrite: false });
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  geo.setAttribute('uv', new T.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
  const tri = new T.Mesh(geo, mat); tri.frustumCulled = false;
  const sc = new T.Scene(); sc.add(tri);
  const prevRT = renderer.getRenderTarget(), prevAuto = renderer.autoClear;
  renderer.autoClear = true; renderer.setRenderTarget(rt); renderer.render(sc, new T.OrthographicCamera(-1, 1, 1, -1, 0, 1));
  renderer.setRenderTarget(prevRT); renderer.autoClear = prevAuto;
  rt.texture.mapping = T.EquirectangularReflectionMapping;
  const pmrem = new T.PMREMGenerator(renderer), out = pmrem.fromEquirectangular(rt.texture);
  pmrem.dispose(); rt.dispose(); geo.dispose(); mat.dispose();
  out.texture.name = 'rocket-studio';
  return { texture: out.texture, ms: now() - t0, dispose: () => out.dispose() };
}
function joinGeometry(T, meshes) {
  const P = [], N = [], I = [];
  for (const m of meshes) {
    const g = m.geometry, base = P.length / 3;
    P.push(...g.attributes.position.array); N.push(...g.attributes.normal.array);
    if (g.index) for (let i = 0; i < g.index.count; i++) I.push(base + g.index.getX(i)); else for (let i = 0; i < g.attributes.position.count; i++) I.push(base + i);
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(N, 3)); g.setIndex(I);
  return g;
}

export async function dressRocket({ rocket, engine = null, renderer = engine && engine.renderer, scene = engine && engine.scene, quality = 'high', merge = true, nozzle = true, shadow: wantShadow = true, turn = null, ownStudio = false } = {}) {
  const look = getLook({ renderer, quality });
  const T = look.THREE, low = look.tier.name === 'low', R = ROCKET_LOOK;
  const undo = [], added = [], all = [], geos = [], texs = [], materials = {}, parts = {}, meshes = {};
  let unPre = null, gone = false, shadow = null, studio = null, studioP = null;
  const canvas = renderer && renderer.domElement;
  const onRestore = () => { if (studio) studio.dispose(); studio = rocketStudio(T, renderer, look.studio, R.env[low ? 'low' : 'high']); for (const m of all) m.needsUpdate = true; };
  const restore = () => {
    if (unPre) unPre();
    if (canvas && ownStudio) canvas.removeEventListener('webglcontextrestored', onRestore);
    for (const m of all) delete m.envMap;
    if (studio) studio.dispose();
    for (const o of added) o.removeFromParent();
    for (const [mesh, mat, parent, geo] of undo) { mesh.material = mat; mesh.geometry = geo; if (parent && !mesh.parent) parent.add(mesh); }
    for (const m of all) m.dispose();
    for (const g of geos) g.dispose();
    for (const t of texs) t.dispose();
  };
  try {
    // the studio: the rocket's own (built in its own task, beside the model download), or the shared one
    if (ownStudio) {
      studioP = yieldTask().then(() => { if (!gone) studio = rocketStudio(T, renderer, look.studio, R.env[low ? 'low' : 'high']); });
      if (canvas) canvas.addEventListener('webglcontextrestored', onRestore);
    } else look.env().catch(() => {});
    const micro = [look.tex[R.paint.micro.gen](R.paint.micro), look.tex[R.petg.gen](R.petg), look.tex[R.flat.gen](R.flat)];
    rocket = await rocket;
    const model = rocket.model, part = {};
    for (const o of model.children) if (o.isMesh && o.userData.part !== undefined) part[o.userData.part] = o;
    const nose = part[0], tubes = [part[1], part[2]], fins = [6, 7, 8, 9].map(i => part[i]), buttons = [part[10], part[11]], mount = part[18], cap = part[19];
    if ([nose, ...tubes, ...fins, ...buttons, mount, cap].some(o => !o)) throw new Error('look: not the hero rocket');
    for (const o of [nose, ...tubes, ...fins, ...buttons, mount, cap]) if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    const yTail = cap.geometry.boundingBox.min.y, yNose = nose.geometry.boundingBox.max.y, yShoulder = tubes[0].geometry.boundingBox.max.y;
    const rBody = tubes[0].geometry.boundingBox.max.x, finBox = new T.Box3().copy(fins[0].geometry.boundingBox);
    for (const f of fins) finBox.union(f.geometry.boundingBox);
    const rFin = Math.max(finBox.max.x, finBox.max.z), glow = rocket.glow || { value: 0 };
    await yieldTask();

    // ---- materials: two programs (the paint, and one for every solid part)
    const env = { value: new T.Vector4(0, 0, 0, R.studio) }, key = new T.Vector3(0, 0, 1);
    const UG = { lookGlow: glow, lookGlowP: { value: new T.Vector4(0, yTail - R.glow.back, 0, R.glow.reach) }, lookGlowC: { value: new T.Vector3(...R.glow.color) } };
    const own = (name, m, key, U, fn) => {
      m.userData.lookUniforms.lookEnv = env;
      // its own studio: a guest's later build of the shared one (look.js buildEnv sets every adopted material) leaves it
      if (ownStudio) Object.defineProperty(m, 'envMap', { configurable: true, enumerable: true, get: () => (studio ? studio.texture : null), set() {} });
      extendMaterial(m, key, sh => {
        Object.assign(sh.uniforms, UG, U);
        sh.fragmentShader = after(sh.fragmentShader, 'common', RKT_FRAG_PARS).replace('#include <transmission_fragment>', RKT_GLOW);
        fn(sh);
      });
      m.name = 'rocket:' + name; materials[name] = m; all.push(m);
      return m;
    };
    const src = tubes[0].material;
    const detail = rocket.detailMap(low ? 0.5 : 1);
    texs.push(detail);
    const V = R.vinyl;
    const paintOf = name => own(name, look.physical({ color: 0xffffff, map: src.map, roughness: R.paint.roughness, metalness: 0, clearcoat: R.paint.clearcoat, clearcoatRoughness: R.paint.clearcoatRoughness, side: src.side },
      { envIntensity: R.paint.envIntensity, micro: R.paint.micro }), 'rocketPaint',
    { lookDetail: { value: detail }, lookVinyl: { value: new T.Vector4(V.height, V.roughness, V.coat, V.coatRoughness) }, lookSeam: { value: new T.Vector3(V.seam, R.paint.flag, R.paint.coat) }, lookWind: { value: V.wind }, lookKeyDir: { value: key } }, sh => {
      let fs = after(sh.fragmentShader, 'common', RKT_PAINT_PARS);
      fs = after(fs, 'map_fragment', 'lookD = texture2D(lookDetail, vMapUv).rgb;\ndiffuseColor.rgb *= 1.0 - lookSeam.x * lookD.g;');
      fs = after(fs, 'roughnessmap_fragment', 'roughnessFactor = mix(roughnessFactor, lookVinyl.y, lookD.r);');
      fs = after(fs, 'normal_fragment_maps', '{ float lookH = lookD.r * lookVinyl.x - lookD.b * (1.0 - lookD.r) * lookWind; lookDH = vec2(dFdx(lookH), dFdy(lookH)); normal = lookBump(normal, lookDH, faceDirection); }');
      fs = after(fs, 'clearcoat_normal_fragment_maps', 'clearcoatNormal = lookBump(clearcoatNormal, lookDH, faceDirection);');
      fs = after(fs, 'lights_physical_fragment', 'material.clearcoat *= mix(1.0, lookVinyl.z, lookD.r);\nmaterial.clearcoatRoughness = mix(material.clearcoatRoughness, lookVinyl.w, lookD.r);');
      // flags around the set: the coat mirrors the key softbox at full gain and the rest of the studio dimmed (its thin
      // strips drew hairlines down a tube this small), and nothing from behind the rocket (a white hairline down the
      // lower edge), so both edges turn dark and the tube stands off the light page
      fs = after(fs, 'lights_fragment_end', '{ vec3 lookR = inverseTransformDirection(reflect(-geometryViewDir, geometryClearcoatNormal), viewMatrix);\nclearcoatSpecularIndirect *= smoothstep(-0.6, 0.0, lookR.z) * mix(lookSeam.y, lookSeam.z, smoothstep(0.34, 0.72, dot(lookR, lookKeyDir))); }');
      sh.fragmentShader = fs;
    });
    const solid = (name, [color, roughness, envIntensity, turnEdge], from, mic, { rim = 0, soot = [0, 1, 0, 0] } = {}) => own(name,
      look.standard({ color: color === null ? from.color.clone() : new T.Color(color), roughness, metalness: 0, side: T.DoubleSide }, { envIntensity, micro: mic }), 'rocketSolid',
      { lookRkt: { value: new T.Vector4(rim, turnEdge, rBody, 0) }, lookSoot: { value: new T.Vector4(...soot) } }, sh => {
        sh.vertexShader = after(after(sh.vertexShader, 'common', 'attribute vec4 lookRim;\nvarying vec4 vLookRim;'), 'begin_vertex', 'vLookRim = lookRim;');
        let fs = after(after(sh.fragmentShader, 'common', RKT_SOLID_PARS), 'color_fragment', RKT_SOLID_ALBEDO);
        sh.fragmentShader = fs.replace('#include <transmission_fragment>', RKT_SOLID_TURN + '\n#include <transmission_fragment>');
      });
    const swap = (o, m, g = null) => { undo.push([o, o.material, null, o.geometry]); o.material = m; parts[o.userData.part] = m; if (g) { o.geometry = g; geos.push(g); } };
    const hide = (o, m) => { undo.push([o, o.material, o.parent, o.geometry]); parts[o.userData.part] = m; o.removeFromParent(); };
    const add = (name, g, m) => { const o = new T.Mesh(g, m); o.name = name; geos.push(g); model.add(o); added.push(o); meshes[name] = o; return o; };
    const joint = (tubes[0].geometry.boundingBox.min.y + tubes[1].geometry.boundingBox.max.y) / 2;
    tubes.forEach((o, i) => swap(o, i && merge ? materials.paint : paintOf(i ? 'paint2' : 'paint'), tubeGeometry(T, o.geometry, joint)));
    swap(nose, solid('nose', R.nose, nose.material, R.petg));
    swap(cap, solid('cap', R.cap, cap.material, { ...R.petg, tile: R.capTile }, { soot: nozzle ? [0.0086, 0.019, yTail + 0.0008, 0.6] : undefined }));
    swap(mount, solid('mount', R.mount, mount.material, R.petg));
    const finOf = name => solid(name, R.fins, fins[0].material, R.flat, { rim: R.finRim }), buttonOf = name => solid(name, R.buttons, buttons[0].material, R.flat);
    if (merge) {
      add('fins', finGeometry(T, fins), finOf('fins'));
      add('buttons', joinGeometry(T, buttons), buttonOf('buttons'));
      for (const o of fins) hide(o, materials.fins);
      for (const o of buttons) hide(o, materials.buttons);
    } else {
      fins.forEach((o, i) => swap(o, finOf('fin' + (i + 1)), finGeometry(T, [o])));
      buttons.forEach((o, i) => swap(o, buttonOf('button' + (i + 1))));
    }
    // the nozzle: the motor's aft closure and its throat, seen through the cap's bore (8.5 mm radius)
    if (nozzle) {
      const throat = [[0, 0.016], [0.0026, 0.016], [0.0062, 0.0026], [0.0089, 0.0018]].map(([r, y]) => new T.Vector2(r, yTail + y));
      add('nozzle', new T.LatheGeometry(throat, low ? 14 : 20), solid('nozzle', R.nozzle, null, R.flat, { soot: [0.0024, 0.0075, 1, 0.88] }));
    }
    await yieldTask();

    // ---- the studio's key for this actor: turned about the vertical until it lies along the airframe (as far as
    // it stays in front), then about the airframe, which lifts its reflection up the tube
    const K = new T.Vector3(...look.studio.key).normalize(), hor = Math.hypot(K.x, K.z);
    const q1 = new T.Quaternion(), q2 = new T.Quaternion(), m4 = new T.Matrix4(), eul = new T.Euler(), up = new T.Vector3(0, 1, 0), axis = new T.Vector3();
    let tilt = NaN, gain = 1;
    function aim() {
      if (turn !== null) q1.setFromAxisAngle(up, turn);
      else {
        tilt = rocket.layout.tiltZ;
        const ax = -Math.sin(tilt), ay = Math.cos(tilt);                   // the airframe on screen (nose first)
        const lim = Math.sqrt(Math.max(0, hor * hor - R.keyFront * R.keyFront));
        const kx = Math.abs(ax) > 1e-3 ? Math.max(-lim, Math.min(lim, -K.y * ay / ax)) : lim;
        q1.setFromAxisAngle(up, Math.atan2(kx, Math.sqrt(hor * hor - kx * kx)) - Math.atan2(K.x, K.z));
        q1.premultiply(q2.setFromAxisAngle(axis.set(ax, ay, 0), R.keyLift));
      }
      key.copy(K).applyQuaternion(q1);
      // three builds the lookup matrix from the negated Euler angles: hand it the inverse turn's angles, negated
      eul.setFromRotationMatrix(m4.makeRotationFromQuaternion(q2.copy(q1).invert()), 'XYZ');
      for (const m of all) if (m.envMapRotation) m.envMapRotation.set(-eul.x, -eul.y, -eul.z, 'XYZ');
    }
    aim();

    // ---- the shadow on the page
    const S = R.shadow;
    let frame = () => { if (turn === null && rocket.layout.tiltZ !== tilt) aim(); };
    if (wantShadow && scene) {
      const shadowMat = new T.ShaderMaterial({
        // drawn first, under everything: in the opaque list with its own blending, so the rocket always covers it
        transparent: false, depthTest: false, depthWrite: false, blending: T.CustomBlending, blendSrc: T.SrcAlphaFactor, blendDst: T.OneMinusSrcAlphaFactor, blendSrcAlpha: T.OneFactor, blendDstAlpha: T.OneMinusSrcAlphaFactor,
        uniforms: { uBody: { value: new T.Vector4() }, uFins: { value: new T.Vector4() }, uSoft: { value: new T.Vector4() }, uColor: { value: new T.Color(S.color) }, uOpacity: { value: 1 } },
        vertexShader: 'varying vec2 vP; void main() { vP = position.xy * vec2(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz)); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: RKT_SHADOW_FRAG,
      });
      all.push(shadowMat);
      shadow = new T.Mesh(new T.PlaneGeometry(1, 1), shadowMat);
      shadow.name = 'lookRocketShadow'; shadow.renderOrder = -3; shadow.frustumCulled = false; shadow.visible = false;
      geos.push(shadow.geometry); scene.add(shadow); added.push(shadow);
      const pN = new T.Vector3(), pT = new T.Vector3(), ex = new T.Vector3(), ez = new T.Vector3();
      const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
      const shown = () => { for (let o = model; o; o = o.parent) { if (!o.visible) return false; if (o === scene) return true; } return false; };
      frame = () => {
        const fly = Math.abs(rocket.state.fly);
        const op = shown() ? gain * (1 - smooth(S.fade[0], S.fade[1], fly)) : 0;
        if (op < 0.004) { if (shadow.visible) shadow.visible = false; return; }
        if (turn === null && rocket.layout.tiltZ !== tilt) aim();
        model.updateWorldMatrix(true, false);
        const e = model.matrixWorld.elements, gap = S.gap + S.rise * Math.min(fly, 1.5), zP = -gap, kz = Math.max(key.z, S.front);
        // the axis ends and the two fin directions, thrown onto the page along the key
        const cast = p => { const k = (p.z - zP) / kz; p.x -= key.x * k; p.y -= key.y * k; return p; };
        cast(pN.set(0, yNose, 0).applyMatrix4(model.matrixWorld)); cast(pT.set(0, yTail, 0).applyMatrix4(model.matrixWorld));
        const dx = pN.x - pT.x, dy = pN.y - pT.y, len = Math.hypot(dx, dy) || 1e-3, ux = dx / len, uy = dy / len;
        ex.set(e[0], e[1], e[2]).normalize(); ez.set(e[8], e[9], e[10]).normalize();
        const across = d => (d.x - key.x * d.z / kz) * -uy + (d.y - key.y * d.z / kz) * ux;
        const cx = across(ex), cz = across(ez), k = len / (yNose - yTail), x0 = -len / 2;
        const u = shadowMat.uniforms, sk = S.key[0] + S.key[1] * gap, sa = S.amb[0] + S.amb[1] * gap;
        u.uBody.value.set(x0, x0 + (yShoulder - yTail) * k, len / 2, rBody * Math.hypot(cx, cz));
        u.uFins.value.set(x0 + (finBox.min.y + 0.006 - yTail) * k, x0 + (finBox.max.y - 0.01 - yTail) * k, rFin * Math.abs(cx), rFin * Math.abs(cz));
        u.uSoft.value.set(sk, S.key[2], sa, S.amb[2]);
        u.uOpacity.value = op;
        const m = 2.6 * sa;
        shadow.position.set((pN.x + pT.x) / 2, (pN.y + pT.y) / 2, zP);
        shadow.rotation.z = Math.atan2(uy, ux);
        shadow.scale.set(len + 2 * m, 2 * (rFin * Math.max(Math.abs(cx), Math.abs(cz), 0.4) + m), 1);
        shadow.visible = true;
      };
    }
    unPre = engine && engine.addPrePass ? engine.addPrePass(() => frame()) : null;

    if (ownStudio) { await studioP; await Promise.allSettled(micro.map(t => t.userData.ready)); for (const m of all) m.needsUpdate = true; }
    else await look.ready();
    // upload the maps now, one per task, so the first flying frame does not
    for (const t of [src.map, detail, ...micro]) { if (t && renderer.initTexture) renderer.initTexture(t); await yieldTask(); }
    frame();
    return {
      look, materials, parts, meshes, shadow, key, aim, frame: () => frame(), get studioMs() { return studio ? studio.ms : 0; },
      setShadow(a) { gain = a; },
      dispose() { if (gone) return; gone = true; restore(); look.release(); },
    };
  } catch (e) { restore(); look.release(); throw e; }
}
