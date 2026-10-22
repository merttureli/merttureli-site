// Showreel FX: coffee steam, can condensation, plate water ring, optional heat shimmer.
//
// All effects are procedural (no image files) and follow the showreel module contract:
// nothing animates on its own clock, every effect has an off state that skips its draw / shader work,
// and every effect can be shown as a still (set the level, never call update).
//
//   import { createSteam, applyCondensation, createWaterRing, createHeatShimmer } from './fx.js';
//
//   const steam = createSteam({ radius: mug.rimRadius, height: 0.16, quality });
//   mug.coffeeSurface.add(steam.group)       // or position steam.group at the coffee surface centre
//   steam.setIntensity(0..1)                  // 0 = hidden (no draw call)
//   steam.update(dt, time)                    // dt in seconds; drives the curl field
//   steam.setTime(t)                          // still frame at time t (reduced motion)
//
//   const cond = applyCondensation(can.bodyMesh, { fillLine: 0.108 });  // mesh or material
//   cond.setAmount(0..1)                      // 0 = shader branch skipped; 1 = fully beaded can with a few drips
//   cond.dispose()                            // restores the material's own shader
//
//   const ring = createWaterRing({ radius: 0.033 });  // tiny wet ring on the plate under the can
//   ring.setAmount(0..1)                      // place ring.group on the plate top, centred under the can
//
//   const shimmer = createHeatShimmer({ radius: mug.rimRadius });  // faint warm rising haze above the mug
//   shimmer.setIntensity(0..1); shimmer.update(dt, time)
//
// Default export follows the module API shape for the engine: create(ctx) -> { group, duration, setProgress,
// update, dispose, createSteam, applyCondensation, createWaterRing, createHeatShimmer } (the group is empty;
// effects are attached to the props that carry them).
import * as THREE from '../three.module.min.js';

// ---------------------------------------------------------------------------------------------------------
// shared: a tiny tileable fbm noise texture (64x64, one channel)
let noiseTex = null, noiseUsers = 0;
function getNoise() {
  if (noiseTex) { noiseUsers++; return noiseTex; }
  const N = 64, data = new Uint8Array(N * N * 4);
  let s = 1337;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const lat = (P) => { const g = new Float32Array(P * P); for (let i = 0; i < g.length; i++) g[i] = rnd(); return g; };
  const octs = [[4, .5], [8, .27], [16, .15], [32, .08]].map(([P, w]) => ({ P, w, g: lat(P) }));
  const sm = t => t * t * (3 - 2 * t);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let v = 0;
    for (const { P, w, g } of octs) {
      const fx = x / N * P, fy = y / N * P, ix = Math.floor(fx), iy = Math.floor(fy), tx = sm(fx - ix), ty = sm(fy - iy);
      const a = g[(iy % P) * P + ix % P], b = g[(iy % P) * P + (ix + 1) % P], c = g[((iy + 1) % P) * P + ix % P], d = g[((iy + 1) % P) * P + (ix + 1) % P];
      v += w * ((a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty);
    }
    const o = (y * N + x) * 4, c8 = Math.max(0, Math.min(255, Math.round(v / 1.0 * 255)));
    data[o] = data[o + 1] = data[o + 2] = c8; data[o + 3] = 255;
  }
  noiseTex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  noiseTex.wrapS = noiseTex.wrapT = THREE.RepeatWrapping;
  noiseTex.magFilter = THREE.LinearFilter; noiseTex.minFilter = THREE.LinearFilter;
  noiseTex.needsUpdate = true;
  noiseUsers = 1;
  return noiseTex;
}
function releaseNoise() { if (--noiseUsers <= 0 && noiseTex) { noiseTex.dispose(); noiseTex = null; noiseUsers = 0; } }

const srgb = (hex) => new THREE.Color(hex); // THREE.Color(hex) converts sRGB hex to linear working space

// ---------------------------------------------------------------------------------------------------------
// STEAM: camera-facing ribbons advected by a curl field. One InstancedMesh, one draw call.
// Each ribbon is a streak line rooted on the coffee disk: the curl field scrolls upward with time, so the
// curls rise and evolve while the root stays put; ribbons fade in, drift, fade out and re-root elsewhere.
const STEAM_VS = /* glsl */`
uniform float uTime, uIntensity, uRadius, uHeight, uRise, uWidth;
uniform vec2 uDrift, uLightDir;
attribute vec4 aSeed;
varying float vSide, vS, vFade, vSeed, vWide, vLit;
float h1(float n) { return fract(sin(n) * 43758.5453123); }
vec3 pot(vec3 p) {
  return vec3(sin(p.y * 1.31 + p.z * 0.93) + 0.55 * sin(p.z * 2.17 - p.y * 1.73 + 1.3),
              sin(p.z * 1.13 + p.x * 1.41 + 2.0) + 0.55 * sin(p.x * 2.31 + p.z * 1.87),
              sin(p.x * 1.21 + p.y * 1.53 + 4.0) + 0.55 * sin(p.y * 2.63 - p.x * 1.79 + 0.7));
}
// curl of a smooth vector potential: divergence-free, so wisps swirl instead of bunching up
vec3 curl(vec3 p) {
  const float e = 0.08;
  vec3 a = pot(p + vec3(e, 0., 0.)), b = pot(p - vec3(e, 0., 0.));
  vec3 c = pot(p + vec3(0., e, 0.)), d = pot(p - vec3(0., e, 0.));
  vec3 f = pot(p + vec3(0., 0., e)), g = pot(p - vec3(0., 0., e));
  return vec3((c.z - d.z) - (f.y - g.y), (f.x - g.x) - (a.z - b.z), (a.y - b.y) - (c.x - d.x)) / (2.0 * e);
}
// a point on a ribbon (s 0..1 from the coffee up): a streak line whose curls are carried upward by the
// scrolling field, so the root stays on the coffee while the shape rises and evolves
vec3 ribbon(float s, vec3 src, float len, float sd) {
  float y = s * len, g = y / uHeight;
  const float F = 38.0;                       // field scale: 1 unit = 26 mm
  vec3 p = vec3(src.x * F + sd, y * F - uTime * uRise * F, src.z * F - sd * 0.7);
  vec3 c = curl(p + vec3(0.0, 0.0, uTime * 0.12)) * 0.25;
  float amp = uHeight * (0.015 + 0.24 * g * g);   // calm sheet at the surface, turbulent higher up
  float spread = 1.0 - 0.18 * smoothstep(0.0, 0.25, g) + 1.6 * g * g;
  vec3 o = vec3(src.x * spread, y, src.z * spread);
  o.xz += c.xz * amp;
  o.y += c.y * amp * 0.2;
  o.xz += uDrift * g * g;
  return o;
}
void main() {
  float side = position.x, s = position.y;
  float cyc = mix(3.4, 6.0, aSeed.y);
  float ct = uTime / cyc + aSeed.x;
  float k = floor(ct), ph = fract(ct);
  float ha = h1(k * 12.9898 + aSeed.z * 78.233), hb = h1(k * 39.3468 + aSeed.w * 11.1351);
  float ang = ha * 6.2831853, rr = sqrt(hb) * uRadius * 0.7;
  vec3 src = vec3(cos(ang) * rr, 0.0, sin(ang) * rr);
  float wide = step(0.66, aSeed.w);
  float len = uHeight * mix(0.6, 1.0, h1(k * 7.31 + aSeed.y)) * mix(0.55, 1.0, uIntensity);
  float sd = aSeed.z * 5.0 + k * 0.61;
  vec3 p0 = ribbon(s, src, len, sd), p1 = ribbon(s + 0.05, src, len, sd);
  vec4 m0 = modelViewMatrix * vec4(p0, 1.0), m1 = modelViewMatrix * vec4(p1, 1.0);
  vec2 tg = m1.xy - m0.xy;
  tg = dot(tg, tg) > 1e-14 ? normalize(tg) : vec2(0.0, 1.0);
  vec2 nr = vec2(-tg.y, tg.x);
  float sc = length(modelViewMatrix[0].xyz);
  float w = mix(0.0019, 0.0105, pow(s, 1.0)) * mix(0.8, 1.25, aSeed.y) * (1.0 + wide * 1.5) * uWidth;
  m0.xy += nr * side * w * sc;
  gl_Position = projectionMatrix * m0;
  float life = smoothstep(0.0, 0.22, ph) * (1.0 - smoothstep(0.68, 1.0, ph));
  float vis = smoothstep(aSeed.z - 0.12, aSeed.z + 0.06, uIntensity * 1.05);
  vFade = life * vis * smoothstep(0.0, 0.1, s) * (1.0 - smoothstep(0.4, 1.0, s)) * mix(1.0, 0.42, wide) * mix(1.0, 0.72, s);
  vSide = side; vS = s * len; vSeed = aSeed.w; vWide = wide;
  vLit = dot(nr, uLightDir);
}`;
const STEAM_FS = /* glsl */`
uniform sampler2D uNoise;
uniform float uTime, uAlpha, uRise;
uniform vec3 uLit, uEdge;
varying float vSide, vS, vFade, vSeed, vWide, vLit;
void main() {
  float a = 1.0 - vSide * vSide;
  vec2 uv = vec2(vSide * mix(0.1, 0.04, vWide) + vSeed * 13.7, (vS - uTime * uRise) * 6.0);
  #ifdef STEAM_LQ
  float n = texture2D(uNoise, uv).r;
  #else
  float n = texture2D(uNoise, uv).r * 0.62 + texture2D(uNoise, uv * vec2(1.7, 2.9) + 0.37).r * 0.38;
  #endif
  float br = smoothstep(0.26, 0.66, n);
  float alpha = a * br * vFade * uAlpha;
  if (alpha < 0.003) discard;
  // shade the wisp like a soft tube: lit flank toward the key light, cool grey flank away from it
  float lit = clamp(0.5 + 0.6 * vSide * vLit * (1.0 - 0.4 * smoothstep(0.03, 0.15, vS)), 0.0, 1.0);
  vec3 col = mix(uEdge, uLit, clamp(lit * 0.75 + a * a * 0.35, 0.0, 1.0));
  gl_FragColor = vec4(col, alpha);
  #include <colorspace_fragment>
}`;

export function createSteam({ radius = 0.036, height = 0.19, quality = 'high', count } = {}) {
  const SEG = quality === 'low' ? 18 : 28;
  const N = count || (quality === 'low' ? 24 : 40);
  const pos = [], idx = [];
  for (let i = 0; i <= SEG; i++) { const s = i / SEG; pos.push(-1, s, 0, 1, s, 0); }
  for (let i = 0; i < SEG; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  const seeds = new Float32Array(N * 4);
  let s = 9001; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < N; i++) { seeds[i * 4] = rnd(); seeds[i * 4 + 1] = rnd(); seeds[i * 4 + 2] = (i + rnd() * .8) / N; seeds[i * 4 + 3] = rnd(); }
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, height * .5, 0), height * .9 + radius * 2);

  const uniforms = {
    uTime: { value: 0 }, uIntensity: { value: 0 }, uRadius: { value: radius }, uHeight: { value: height },
    uRise: { value: 0.04 }, uWidth: { value: 1 }, uDrift: { value: new THREE.Vector2(0.006, -0.003) },
    uLightDir: { value: new THREE.Vector2(-0.45, 0.89) },
    uNoise: { value: getNoise() }, uAlpha: { value: 0 },
    uLit: { value: srgb(0xffffff) }, uEdge: { value: srgb(0x7f858f) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, vertexShader: STEAM_VS, fragmentShader: STEAM_FS, defines: quality === 'low' ? { STEAM_LQ: '' } : {},
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, N);
  mesh.name = 'steam';
  mesh.frustumCulled = true;
  mesh.renderOrder = 10;
  mesh.visible = false;
  const group = new THREE.Group();
  group.name = 'steam';
  group.add(mesh);
  let intensity = 0, time = 0;
  return {
    group, mesh, duration: 0,
    setIntensity(v) {
      intensity = Math.max(0, Math.min(1, v));
      uniforms.uIntensity.value = intensity;
      uniforms.uAlpha.value = Math.min(1, intensity * 1.6);
      mesh.visible = intensity > 0.002;
    },
    setProgress(p) { this.setIntensity(p); },
    setTime(t) { time = t; uniforms.uTime.value = t; },
    update(dt) { if (!mesh.visible) return; time += Math.min(Math.max(dt, 0), 0.1); uniforms.uTime.value = time; },
    get intensity() { return intensity; },
    uniforms,
    dispose() { geo.dispose(); mat.dispose(); releaseNoise(); group.removeFromParent(); },
  };
}

// ---------------------------------------------------------------------------------------------------------
// CONDENSATION: injected into the can body's MeshStandard/MeshPhysical material.
// Cylindrical coordinates (arc length around the axis, height) in metres, so droplets keep real sizes
// (beads ~0.3-1.2 mm, larger coalesced drops ~2-3 mm, a few drip runs that clear the mist behind them).
// Amount is a pure function input: droplets nucleate at per-cell thresholds, grow ~sqrt, big drops sweep
// their surroundings clean (coalescence) and, near the top of the range, a few run down as drips.
const COND_VERT_PARS = /* glsl */`
uniform vec2 uCondAxis;
varying vec3 vCondP;
varying vec3 vCondT;`;
const COND_VERT = /* glsl */`
vCondP = position;
{ vec3 ct = vec3(-(position.z - uCondAxis.y), 0.0, position.x - uCondAxis.x);
  vCondT = normalMatrix * (dot(ct, ct) > 1e-12 ? normalize(ct) : vec3(1.0, 0.0, 0.0)); }`;
const COND_FRAG_PARS = /* glsl */`
uniform float uCondAmount, uCondR, uCondGlint, uCondMist;
uniform vec2 uCondAxis;
uniform vec4 uCondY;         // yMin, yMax, fill line, seed
uniform vec3 uCondMistColor;
varying vec3 vCondP;
varying vec3 vCondT;
float cH1(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec2 cH2(vec2 p) { float n = cH1(p); return vec2(n, cH1(p + n + 17.17)); }
float cNoiseP(vec2 p, float P) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float x0 = mod(i.x, P), x1 = mod(i.x + 1.0, P);
  return mix(mix(cH1(vec2(x0, i.y)), cH1(vec2(x1, i.y)), f.x), mix(cH1(vec2(x0, i.y + 1.0)), cH1(vec2(x1, i.y + 1.0)), f.x), f.y);
}
// one droplet layer: cells of size cs (m); N cells around; nucleation thresholds in [t0,t1]; returns nearest drop
// best = (local d.xy in drop radii, normalised distance q, radius m), bc = drop centre (m)
void cLayer(vec2 uvm, float cs, float N, float A, float t0, float t1, float rMax, float seed, inout vec4 best, inout vec2 bc) {
  vec2 p = uvm / cs, ip = floor(p), fp = fract(p);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 c = vec2(float(i), float(j));
    vec2 id = ip + c; id.x = mod(id.x, N);
    vec2 h = cH2(id + seed);
    float th = mix(t0, t1, h.x);
    float g = clamp((A - th) / (1.0 - th), 0.0, 1.0);
    if (g <= 0.0) continue;
    float hr = cH1(id + seed + 3.1);
    float r = rMax * (0.32 + 0.68 * hr * hr) * sqrt(g);
    vec2 ctr = c + 0.1 + 0.8 * cH2(id + seed + 9.7);
    vec2 d = fp - ctr;
    d.y *= d.y < 0.0 ? 0.86 : 1.14;           // gravity: drops sag, heavier at the bottom
    float q = length(d) / r;
    if (q < best.z) { best = vec4(d / r, q, r * cs); bc = (ip + ctr) * cs; }
  }
}`;
const COND_COLOR = /* glsl */`
float cCov = 0.0, cTrail = 0.0, cMist = 0.0, cDetail = 1.0, cQ = 9.0, cGrain = 0.0;
vec2 cD = vec2(0.0);
if (uCondAmount > 0.001) {
  vec2 rel = vCondP.xz - uCondAxis;
  float ang = atan(rel.y, rel.x);                        // -pi..pi
  float circ = 6.2831853 * uCondR;
  vec2 uvm = vec2((ang / 6.2831853 + 0.5) * circ, vCondP.y);  // metres: arc length, height
  float span = uCondY.y - uCondY.x;
  // where the cold liquid is: nothing above the fill line, soft edges at the body ends
  float rag = (cNoiseP(vec2(uvm.x / circ * 9.0, 3.0), 9.0) - 0.5) * 0.008 + (cNoiseP(vec2(uvm.x / circ * 31.0, 5.0), 31.0) - 0.5) * 0.003;
  float region = smoothstep(uCondY.x, uCondY.x + 0.004, vCondP.y) * (1.0 - smoothstep(uCondY.z - 0.016 + rag, uCondY.z + rag, vCondP.y));
  // low-frequency patchiness (breath-like density variation, ~1 cm)
  float patchN = cNoiseP(vec2(uvm.x / circ * 22.0, uvm.y * 140.0 + uCondY.w), 22.0) * 0.65
               + cNoiseP(vec2(uvm.x / circ * 47.0, uvm.y * 300.0 + 7.0), 47.0) * 0.35;
  float A = uCondAmount * region * mix(0.86, 1.1, patchN);
  float pix = max(length(fwidth(uvm)), 1e-6);           // metres per pixel
  // layers: small beads (1.25 mm cells), coalesced drops (3.4 mm cells)
  vec4 bS = vec4(0.0, 0.0, 9.0, 0.0), bL = vec4(0.0, 0.0, 9.0, 0.0);
  vec2 cS = vec2(0.0), cL = vec2(0.0);
  float nS = floor(circ / 0.00125), nL = floor(circ / 0.0034);
  cLayer(uvm, circ / nS, nS, A, 0.03, 0.6, 0.5, uCondY.w, bS, cS);
  cLayer(uvm, circ / nL, nL, A, 0.36, 1.05, 0.40, uCondY.w + 31.0, bL, cL);
  // drips: a few columns run down once the can is wet, wiping a clear wet track
  float dc = 0.0062, nD = floor(circ / dc); dc = circ / nD;
  float colx = uvm.x / dc, ic = mod(floor(colx), nD);
  vec2 hd = cH2(vec2(ic, 5.3 + uCondY.w));
  float dStart = 0.66 + hd.y * 0.36;
  float dg = clamp((uCondAmount - dStart) / (1.0 - dStart + 0.04), 0.0, 1.0) * step(hd.x, 0.2);
  vec4 bD = vec4(0.0, 0.0, 9.0, 0.0); vec2 cDc = vec2(0.0);
  if (dg > 0.0) {
    float y0 = uCondY.z - 0.008 - cH1(vec2(ic, 2.2)) * span * 0.45;
    float yh = y0 - dg * dg * (y0 - uCondY.x) * (0.55 + 0.45 * hd.y);
    float tx = (floor(colx) + 0.5 + (hd.y - 0.5) * 0.4) * dc + sin(uvm.y * 520.0 + hd.x * 40.0) * 0.00025;
    float hw = mix(0.0002, 0.00045, smoothstep(y0, yh, uvm.y));
    float dx = abs(uvm.x - tx);
    float aa = pix * 1.2;
    cTrail = (1.0 - smoothstep(hw - aa, hw + aa, dx)) * smoothstep(yh, yh + 0.001, uvm.y) * (1.0 - smoothstep(y0 - 0.002, y0, uvm.y));
    float rh = 0.0011 + 0.0005 * hd.y;
    vec2 d = vec2(uvm.x - tx, uvm.y - (yh + rh * 0.55));
    d.y *= d.y < 0.0 ? 0.78 : 1.25;
    bD = vec4(d / rh, length(d) / rh, rh); cDc = vec2(tx, yh);
  }
  // coalescence: a big drop sweeps a clear halo; small beads whose centre falls in it are gone
  if (bL.z < 6.0) {
    vec2 lc = cL;
    float rS = bS.w;
    if (distance(cS, lc) < bL.w * 1.5 + rS) bS.z = 9.0;
  }
  if (cTrail > 0.0) bS.z = 9.0;
  vec4 b = bS;
  if (bL.z < b.z) b = bL;
  if (bD.z < b.z) b = bD;
  cQ = b.z; cD = b.xy;
  float aaq = clamp(pix / max(b.w, 1e-6) * 1.4, 0.02, 1.0);
  cCov = 1.0 - smoothstep(1.0 - aaq, 1.0, b.z);
  cDetail = smoothstep(0.7, 2.2, b.w / pix);            // drops smaller than ~2 px fade to an average sheen
  float halo = (bL.z < 1.6) ? (1.0 - smoothstep(1.15, 1.6, bL.z)) : 0.0;
  cMist = uCondMist * smoothstep(0.0, 0.4, A) * (0.84 + 0.16 * patchN) * (1.0 - cTrail) * (1.0 - 0.3 * halo) * (1.0 - cCov);
  // micro droplets (the mist itself): one jittered dot per 0.45 mm cell, visible as grain only when > ~1 px
  {
    vec2 mp = uvm / 0.00045; vec2 mi = floor(mp), mf = fract(mp);
    mi.x = mod(mi.x, floor(circ / 0.00045));
    vec2 mh = cH2(mi + 71.0);
    float mr = (0.12 + 0.22 * mh.x) * smoothstep(0.0, 0.6, A);
    float md = length(mf - (0.3 + 0.4 * mh.yx)) / max(mr, 1e-3);
    float mvis = smoothstep(0.8, 2.0, 0.00045 * mr / pix);
    cGrain = (1.0 - smoothstep(0.6, 1.0, md)) * mvis * cMist;
  }
  // albedo
  vec3 base = diffuseColor.rgb;
  vec3 misted = base + (uCondMistColor - base) * (0.045 * cMist + 0.1 * cGrain);
  // a drop is a small lens: it shows the scene upside down (dark table at its top, bright sky at its
  // bottom), a thin dark rim where light is totally reflected, and a bright caustic near the bottom
  float ring = mix(1.0, 0.55, smoothstep(0.72, 1.0, cQ) * cDetail);
  float lowGlow = smoothstep(0.15, -0.75, cD.y) * (1.0 - smoothstep(0.75, 1.0, cQ));
  float topDark = smoothstep(-0.1, 0.8, cD.y);
  float caustic = (1.0 - smoothstep(0.0, 0.38, length(cD - vec2(0.12, -0.5))));
  vec3 dropCol = base * ring * mix(1.0, 0.72, topDark * cDetail);
  dropCol += (uCondMistColor * 0.55 + base * 0.45) * (0.16 * lowGlow + 0.35 * caustic) * cDetail;
  dropCol = mix(base + (uCondMistColor - base) * 0.05, dropCol, cDetail);
  vec3 col = mix(misted, base * 0.97, cTrail);
  diffuseColor.rgb = mix(col, dropCol, cCov);
}`;
const COND_ROUGH = /* glsl */`
if (uCondAmount > 0.001) {
  roughnessFactor = mix(roughnessFactor, 0.6, cMist * 0.85);
  roughnessFactor = mix(roughnessFactor, 0.25, cGrain);
  roughnessFactor = mix(roughnessFactor, 0.2, cTrail);
  roughnessFactor = mix(roughnessFactor, mix(0.32, 0.09, cDetail), cCov);
}`;
const COND_METAL = /* glsl */`
if (uCondAmount > 0.001) metalnessFactor *= (1.0 - 0.5 * cMist) * (1.0 - 0.5 * cCov) * (1.0 - 0.4 * cTrail);`;
const COND_NORMAL = /* glsl */`
vec3 cN = normal;
if (uCondAmount > 0.001 && (cCov > 0.0 || cTrail > 0.0)) {
  vec3 T = normalize(vCondT - normal * dot(normal, vCondT));
  vec3 B = cross(T, normal);
  vec2 sl = cD / max(cQ, 1.0) * 0.86;
  vec3 nl = vec3(sl, sqrt(max(1.0 - dot(sl, sl), 0.0)));
  vec3 nDrop = normalize(T * nl.x + B * nl.y + normal * nl.z);
  cN = normalize(mix(normal, nDrop, cCov * cDetail));
  // water is clear: the paint under a drop is lit as the can is, only reflections follow the dome.
  // Undo the key light's diffuse change from the perturbed normal so drops don't shade like opaque beads.
  #if NUM_DIR_LIGHTS > 0
  vec3 cL = directionalLights[0].direction;
  float cK = (max(dot(normal, cL), 0.0) + 0.25) / (max(dot(cN, cL), 0.0) + 0.25);
  diffuseColor.rgb *= mix(1.0, clamp(cK, 0.5, 2.2), cCov * cDetail);
  #endif
  normal = cN;
}`;
const COND_EMISSIVE = /* glsl */`
if (uCondAmount > 0.001 && cCov > 0.0) {
  // crisp reflection of a bright overhead source (softbox / window) in each drop; with an environment
  // map the IBL already reflects the room, so this only tops it up
  vec3 V = normalize(vViewPosition);
  vec3 R = reflect(-V, cN);
  float fres = 0.04 + 0.96 * pow(1.0 - clamp(dot(cN, V), 0.0, 1.0), 5.0);
  float sky = smoothstep(0.62, 0.92, R.y) * smoothstep(-0.7, 0.1, -R.x);
  // plus the crisp catch-light of the key (upper left, in front): the cue that says "water"
  float cat = pow(max(dot(R, normalize(vec3(-0.45, 0.75, 0.5))), 0.0), 90.0);
  sky = sky * 0.5 + cat * 3.0;
  #ifdef USE_ENVMAP
  float gk = 0.6;
  #else
  float gk = 1.0;
  #endif
  totalEmissiveRadiance += vec3(sky * (0.7 + 1.6 * fres) * cCov * cDetail * uCondGlint * gk);
}`;

export function applyCondensation(target, options = {}) {
  const mesh = target && target.isMesh ? target : null;
  const material = mesh ? mesh.material : target;
  if (!material || !(material.isMeshStandardMaterial)) throw new Error('applyCondensation: needs a MeshStandardMaterial/MeshPhysicalMaterial or a mesh using one');
  let { radius, yMin, yMax, fillLine, axis } = options;
  if (mesh && (radius == null || yMin == null || yMax == null || !axis)) {
    const g = mesh.geometry; if (!g.boundingBox) g.computeBoundingBox();
    const bb = g.boundingBox;
    if (radius == null) radius = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) / 2;
    if (yMin == null) yMin = bb.min.y;
    if (yMax == null) yMax = bb.max.y;
    if (!axis) axis = [(bb.min.x + bb.max.x) / 2, (bb.min.z + bb.max.z) / 2];
  }
  radius = radius ?? 0.033; yMin = yMin ?? 0; yMax = yMax ?? 0.122; axis = axis || [0, 0];
  if (fillLine == null) fillLine = yMin + (yMax - yMin) * 0.9;
  const uniforms = {
    uCondAmount: { value: 0 }, uCondR: { value: radius }, uCondGlint: { value: options.glint ?? 1 },
    uCondMist: { value: options.mist ?? 1 },
    uCondAxis: { value: new THREE.Vector2(axis[0], axis[1]) },
    uCondY: { value: new THREE.Vector4(yMin, yMax, fillLine, options.seed ?? 0) },
    uCondMistColor: { value: srgb(options.mistColor ?? 0xe9dcdc) },
  };
  const prevCompile = material.onBeforeCompile, prevKey = material.customProgramCacheKey;
  material.onBeforeCompile = (shader, renderer) => {
    if (prevCompile) prevCompile.call(material, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + COND_VERT_PARS)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + COND_VERT);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + COND_FRAG_PARS)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + COND_COLOR)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + COND_ROUGH)
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n' + COND_METAL)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + COND_NORMAL)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + COND_EMISSIVE);
  };
  material.customProgramCacheKey = () => (prevKey ? prevKey.call(material) : '') + '|fx-cond-1';
  material.needsUpdate = true;
  let amount = 0;
  return {
    material, uniforms,
    setAmount(v) { amount = Math.max(0, Math.min(1, v)); uniforms.uCondAmount.value = amount; },
    setProgress(p) { this.setAmount(p); },
    get amount() { return amount; },
    dispose() {
      material.onBeforeCompile = prevCompile || (() => {});
      material.customProgramCacheKey = prevKey || THREE.Material.prototype.customProgramCacheKey;
      material.needsUpdate = true;
    },
  };
}

// ---------------------------------------------------------------------------------------------------------
// WATER RING: run-off from the can pooling on the plate, a thin irregular wet ring with a few beads.
// A flat annulus with a procedural alpha; dark-ish glossy water film. Sits 0.3 mm above the plate.
export function createWaterRing({ radius = 0.033, quality = 'high' } = {}) {
  const inner = radius * 0.86, outer = radius * 1.22;
  const geo = new THREE.RingGeometry(inner, outer, quality === 'low' ? 48 : 96, 1);
  geo.rotateX(-Math.PI / 2);
  const uniforms = { uRingAmount: { value: 0 }, uRingR: { value: radius } };
  const mat = new THREE.MeshStandardMaterial({ color: 0x8a8e94, roughness: 0.1, metalness: 0.3, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vRingP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRingP = position.xz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uRingAmount, uRingR;
varying vec2 vRingP;
float rH(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float rN(float x, float P) { float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(rH(vec2(mod(i, P), 1.0)), rH(vec2(mod(i + 1.0, P), 1.0)), f); }`)
      .replace('#include <alphamap_fragment>', `#include <alphamap_fragment>
{
  float ang = atan(vRingP.y, vRingP.x) / 6.2831853 + 0.5;
  float r = length(vRingP);
  float A = uRingAmount;
  float wob = (rN(ang * 18.0, 18.0) - 0.5) * 0.0016 + (rN(ang * 53.0, 53.0) - 0.5) * 0.0006;
  float puddle = smoothstep(0.55, 1.0, rN(ang * 7.0 + 3.0, 7.0)) * 0.0022 * A;   // a few spots where run-off pooled
  float w = (0.0004 + 0.0012 * A) + puddle;
  float c = uRingR + 0.0003 + wob * A + puddle * 0.4;
  float aa = max(fwidth(r), 1e-6) * 1.2;
  float ringM = smoothstep(c - w - aa, c - w + aa, r) * (1.0 - smoothstep(c + w * 0.2 - aa, c + w + aa, r));
  float on = smoothstep(0.0, 0.25, A) * smoothstep(0.2, 0.6, rN(ang * 11.0 + 9.0, 11.0) + A * 0.7);
  diffuseColor.a *= ringM * on * 0.32;
  if (diffuseColor.a < 0.004) discard;
}`);
  };
  mat.customProgramCacheKey = () => 'fx-ring-1';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'waterRing'; mesh.position.y = 0.0003; mesh.renderOrder = 2; mesh.visible = false;
  const group = new THREE.Group(); group.name = 'waterRing'; group.add(mesh);
  let amount = 0;
  return {
    group, mesh,
    setAmount(v) { amount = Math.max(0, Math.min(1, v)); uniforms.uRingAmount.value = amount; mesh.visible = amount > 0.002; },
    setProgress(p) { this.setAmount(p); },
    get amount() { return amount; },
    dispose() { geo.dispose(); mat.dispose(); group.removeFromParent(); },
  };
}

// ---------------------------------------------------------------------------------------------------------
// HEAT SHIMMER (cheap): no screen-space refraction (would need a scene copy). Instead a faint warm
// rising haze column above the mug: one camera-facing quad with scrolling noise, additive-free normal
// blending, nearly invisible on its own; it reads as warmth behind the steam.
export function createHeatShimmer({ radius = 0.036, height = 0.12 } = {}) {
  const geo = new THREE.PlaneGeometry(1, 1, 1, 1);
  geo.translate(0, 0.5, 0);
  const uniforms = { uTime: { value: 0 }, uIntensity: { value: 0 }, uNoise: { value: getNoise() }, uW: { value: radius * 2.6 }, uH: { value: height }, uTint: { value: srgb(0xf3e3cf) } };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false,
    vertexShader: /* glsl */`
uniform float uW, uH;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(0.0, position.y * uH, 0.0, 1.0);
  float sc = length(modelViewMatrix[0].xyz);
  mv.x += position.x * uW * sc;
  gl_Position = projectionMatrix * mv;
}`,
    fragmentShader: /* glsl */`
uniform sampler2D uNoise;
uniform float uTime, uIntensity;
uniform vec3 uTint;
varying vec2 vUv;
void main() {
  vec2 uv = vec2(vUv.x * 0.7, vUv.y * 0.9 - uTime * 0.35);
  float n = texture2D(uNoise, uv + texture2D(uNoise, uv * 0.5 + uTime * 0.05).r * 0.3).r;
  float col = 1.0 - pow(abs(vUv.x - 0.5) * 2.0, 2.0);
  float fade = smoothstep(0.0, 0.15, vUv.y) * (1.0 - smoothstep(0.35, 1.0, vUv.y));
  float a = col * fade * smoothstep(0.35, 0.8, n) * 0.07 * uIntensity;
  if (a < 0.002) discard;
  gl_FragColor = vec4(uTint, a);
  #include <colorspace_fragment>
}`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'heatShimmer'; mesh.renderOrder = 9; mesh.visible = false; mesh.frustumCulled = false;
  const group = new THREE.Group(); group.name = 'heatShimmer'; group.add(mesh);
  let intensity = 0, time = 0;
  return {
    group, mesh,
    setIntensity(v) { intensity = Math.max(0, Math.min(1, v)); uniforms.uIntensity.value = intensity; mesh.visible = intensity > 0.002; },
    setProgress(p) { this.setIntensity(p); },
    setTime(t) { time = t; uniforms.uTime.value = t; },
    update(dt) { if (!mesh.visible) return; time += Math.min(Math.max(dt, 0), 0.1); uniforms.uTime.value = time; },
    dispose() { geo.dispose(); mat.dispose(); releaseNoise(); group.removeFromParent(); },
  };
}

// ---------------------------------------------------------------------------------------------------------
export default function create({ quality = 'high' } = {}) {
  const group = new THREE.Group();
  group.name = 'fx';
  return {
    group, duration: 0,
    setProgress() {}, update() {}, dispose() {},
    createSteam: (o = {}) => createSteam({ quality, ...o }),
    applyCondensation: (t, o) => applyCondensation(t, o),
    createWaterRing: (o = {}) => createWaterRing({ quality, ...o }),
    createHeatShimmer: (o = {}) => createHeatShimmer(o),
  };
}
