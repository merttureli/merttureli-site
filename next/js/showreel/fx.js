// Showreel FX for the Therma-Shift reel: physical cues for heat and cold instead of colour washes.
//
// All effects are procedural (no image files) and follow the showreel module contract: nothing animates on its own
// clock, every effect is a pure function of the values it is given (an amount or a progress, a time, a
// disturbance), has an off state that skips its draw or its shader work, and can be shown as a still.
//
//   import { createSteam, applyCondensation, createWaterRing, createColdFog, createFrost, createHeatShimmer, ready } from './fx.js';
//   await ready()                     resolves once the shared noise texture is generated (in slices of at most 4 ms)
//
//   STEAM: a soft volumetric plume over the coffee (one camera-facing quad; the fragment shader marches a few depth
//   slices through a curling, rising field). It thins with height and breaks into wisps; it is never ribbons.
//     const steam = createSteam({ radius: mug.rimRadius, height: 0.12, quality });
//     mug.group.add(steam.group); steam.group.position.y = mug.coffeeY;   // rooted at the middle of the coffee surface
//     steam.setIntensity(a)           amount 0..1.5 (0 = hidden, no draw call; above 1 is a surge); setAmount is the same
//     steam.setDisturbance(d, x, y, z)   d 0..1 stirs the plume (wider, more broken); (x, y, z) is a push in the steam
//                                     group's own frame, meters at the nominal top: the plume leans that way
//     steam.setTime(t)                the field at time t (seconds): a pure function, use it from sample(T)
//     steam.update(dt)                only for callers that never call setTime: advances an internal clock
//
//   CONDENSATION on the can, injected into its body material. One progress value drives the stages:
//     0.00 to 0.20  a haze: the mirror turns to a frosted film
//     0.15 to 0.55  nucleation: fine beads appear everywhere, each a pinpoint
//     0.45 to 0.85  growth: beads grow, big drops form, swallow their neighbours and thin the haze around them
//     0.75 to 1.00  a few drops reach running size and run down, each leaving a clear track
//     const cond = applyCondensation(can.bodyMesh, { fillLine: can.fillLine });   // mesh or material
//     cond.setAmount(p)               0..1, deterministic for a given p (seek, reverse and stills are exact); 0 = off
//     cond.dispose()                  restores the material's own shader
//
//   WATER RING: what the can leaves on the plate: a meniscus line where its stand ring sat and a few fallen drops.
//     const ring = createWaterRing({ radius: can.radius, standRadius: can.footRadius, quality });
//     ring.setAmount(a)               0..1; place ring.group on the plate top, centred under the can
//
//   COLD FOG: cold air spilling out of the tray, over the lid rim, down the case and out across the page.
//     const fog = createColdFog({ box: coaster.caseBounds, quality });   // box: THREE.Box3 of the case, coaster space
//     coaster.group.add(fog.group);
//     fog.setAmount(a)  0..1          fog.setTime(t)  pure   fog.update(dt)  only without setTime
//
//   FROST: a cold film creeping in from the plate's edges (dew first, then a fine crystalline grain).
//     const frost = createFrost({ size: 0.0802, quality });   // put frost.group on the plate top, centred
//     frost.setAmount(p)              0..1, how far the film has crept in and how dense it is
//
//   HEAT SHIMMER: the air over the hot plate bends what is behind it. High tier only: it copies the pixels behind
//   the quad (a small region, not a full-screen pass) and redraws them a fraction of a pixel off. Nothing on low.
//     const shimmer = createHeatShimmer({ width: 0.09, height: 0.07, quality });   // put the group on the plate top
//     shimmer.setIntensity(a)  0..1   shimmer.setTime(t)  pure   shimmer.update(dt)  only without setTime
//
// Default export follows the module API shape for the engine: create(ctx) -> { group, duration, setProgress, update,
// dispose, createSteam, applyCondensation, createWaterRing, createColdFog, createFrost, createHeatShimmer } (the
// group is empty; effects are attached to the props that carry them).
import * as THREE from '../three.module.min.js';

// ---------------------------------------------------------------------------------------------------------
// shared: a tileable fbm noise texture, three independent fields in R, G, B (128 x 128; 64 x 64 on low).
// It is generated in slices of at most SLICE_MS (the texture exists at once, mid grey, and fills in a few tasks
// later), so building an effect never blocks a frame. `ready()` resolves when every pending texture is filled.
const SLICE_MS = 4;
const noiseTex = {}, noiseUsers = {}, pending = new Set();
function sliced(it) {
  const p = new Promise(done => {
    const step = () => {
      const t0 = performance.now();
      let fin = false;
      while (!(fin = it.next().done) && performance.now() - t0 < SLICE_MS);
      if (fin) done(); else setTimeout(step, 0);
    };
    setTimeout(step, 0);
  });
  pending.add(p); p.then(() => pending.delete(p));
  return p;
}
export function ready() { return Promise.all([...pending]).then(() => true); }
function getNoise(low) {
  const N = low ? 64 : 128, key = N;
  if (noiseTex[key]) { noiseUsers[key]++; return noiseTex[key]; }
  const data = new Uint8Array(N * N * 4).fill(128);
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  noiseTex[key] = t; noiseUsers[key] = 1;
  t.userData.ready = sliced((function* () {
    let s = 1337;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const sm = x => x * x * (3 - 2 * x);
    for (let ch = 0; ch < 3; ch++) {
      const octs = [[4, .5], [8, .27], [16, .15], [32, .08]].map(([P, w]) => { const g = new Float32Array(P * P); for (let i = 0; i < g.length; i++) g[i] = rnd(); return { P, w, g }; });
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          let v = 0;
          for (const { P, w, g } of octs) {
            const fx = x / N * P, fy = y / N * P, ix = Math.floor(fx), iy = Math.floor(fy), tx = sm(fx - ix), ty = sm(fy - iy);
            const a = g[(iy % P) * P + ix % P], b = g[(iy % P) * P + (ix + 1) % P], c = g[((iy + 1) % P) * P + ix % P], d = g[((iy + 1) % P) * P + (ix + 1) % P];
            v += w * ((a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty);
          }
          data[(y * N + x) * 4 + ch] = Math.max(0, Math.min(255, Math.round(v * 255)));
        }
        if ((y & 3) === 3) yield;
      }
    }
    t.needsUpdate = true;
  })());
  return t;
}
function releaseNoise(low) { const key = low ? 64 : 128; if (--noiseUsers[key] <= 0 && noiseTex[key]) { noiseTex[key].dispose(); noiseTex[key] = null; noiseUsers[key] = 0; } }

const srgb = (hex) => new THREE.Color(hex); // THREE.Color(hex) converts sRGB hex to linear working space
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const insertAfter = (src, chunk, add) => src.replace(`#include <${chunk}>`, `#include <${chunk}>\n${add}`);

// ---------------------------------------------------------------------------------------------------------
// STEAM. One quad that faces the camera and stands on the coffee, along the mug's own up axis. Per pixel the
// fragment shader adds a few depth slices of one density field: a column that opens with height, a noise that
// scrolls upward and is warped by a second noise (the curl), a threshold that climbs with height so the plume
// breaks into wisps and is gone by the top. Each slice sways on its own, which reads as depth. Light: a second tap
// toward the key tells which flank is lit. Everything is a function of uTime, uAmount, uDist and the push.
const STEAM_VS = /* glsl */`
uniform vec2 uSize;
uniform vec3 uPush;
varying vec2 vP;
varying float vPush;
void main() {
  vec4 c = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  vec3 up = (modelViewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz;
  float sc = length(up); up /= sc;
  vec3 right = cross(up, vec3(0.0, 0.0, 1.0));
  right = dot(right, right) > 1e-6 ? normalize(right) : vec3(1.0, 0.0, 0.0);
  vP = vec2(position.x * uSize.x, position.y * uSize.y);
  vec3 push = (modelViewMatrix * vec4(uPush, 0.0)).xyz / sc;
  vPush = dot(push, right);
  gl_Position = projectionMatrix * vec4(c.xyz + (right * vP.x + up * vP.y) * sc, 1.0);
}`;
const STEAM_FS = /* glsl */`
uniform sampler2D uNoise;
uniform float uTime, uAmount, uDist, uRadius, uHeight, uRise, uAlpha;
uniform vec3 uLit, uShade;
varying vec2 vP;
varying float vPush;
void main() {
  float g = vP.y / uHeight;                        // 0 at the coffee, 1 at the nominal top
  if (g < 0.0 || g > 1.32) discard;
  float t = uTime, amt = min(uAmount, 1.5);
  // the column: a neck just above the cup, then it opens; a slow meander; a push bends it with height squared
  float w = uRadius * (0.80 - 0.22 * smoothstep(0.0, 0.35, g)) + uHeight * (0.04 + 0.25 * g * g) * (1.0 + 0.7 * uDist);
  float cx = vPush * g * g + uHeight * 0.045 * g * sin(g * 2.6 - t * 0.55) + uHeight * 0.03 * g * g * sin(t * 0.31 + 1.7);
  float x0 = vP.x - cx;
  if (abs(x0) > 2.3 * w) discard;
  float vis = 1.0, light = 0.0, sum = 0.0;
  for (int i = 0; i < STEAM_SLICES; i++) {
    float z = (float(i) + 0.5) / float(STEAM_SLICES), zc = z * 2.0 - 1.0;
    float sway = uHeight * 0.07 * g * sin(g * 3.4 + z * 6.2832 + t * (0.5 + 0.4 * z));
    float x = x0 - sway;
    vec2 q = vec2(x / 0.105 + z * 0.37, (vP.y - t * uRise * (0.82 + 0.36 * z)) / 0.135 + z * 0.71);
    // the curl: a slower field pushes the sample point around, more with height and when disturbed
    vec2 wv = texture2D(uNoise, q * 0.47 + vec2(0.13, t * 0.017)).rg - 0.5;
    q += wv * (0.30 + 0.75 * g) * (1.0 + 1.5 * uDist);
    #ifdef STEAM_LQ
    float n = texture2D(uNoise, q).b;
    #else
    float n = texture2D(uNoise, q).b * 0.72 + texture2D(uNoise, q * 2.6 + 0.37).r * 0.28;
    #endif
    float prof = exp(-1.5 * x * x / (w * w)) * (1.0 - 0.3 * zc * zc);
    float lo = mix(0.08, 0.42, smoothstep(0.0, 0.8, g)) + 0.20 * (1.0 - min(amt, 1.0)) - 0.05 * max(amt - 1.0, 0.0);
    float d = smoothstep(lo, lo + 0.30, n + 0.22 * (prof - 0.5)) * prof;
    #ifndef STEAM_LQ
    // which flank is lit: denser toward the key (upper left) means this point sits in the plume's own shade
    float n2 = texture2D(uNoise, q + vec2(-0.045, 0.045)).b;
    light += d * clamp(0.66 + 3.0 * (n - n2) - 0.22 * x / w, 0.0, 1.0);
    #else
    light += d * clamp(0.7 - 0.25 * x / w, 0.0, 1.0);
    #endif
    sum += d;
    vis *= 1.0 - d * 0.62;
  }
  float fade = smoothstep(0.0, 0.11, g) * (1.0 - smoothstep(0.50, 1.28, g)) * (1.0 - 0.40 * g);
  float alpha = (1.0 - vis) * fade * uAlpha * (1.0 - 0.3 * uDist);
  if (alpha < 0.004) discard;
  vec3 col = mix(uShade, uLit, light / max(sum, 1e-4));
  gl_FragColor = vec4(col, alpha);
  #include <colorspace_fragment>
}`;

export function createSteam({ radius = 0.036, height = 0.19, quality = 'high' } = {}) {
  const low = quality === 'low';
  const W = 2 * (radius * 0.9 + height * 0.62), H = height * 1.32;
  const geo = new THREE.PlaneGeometry(1, 1, 1, 1);
  geo.translate(0, 0.5, 0);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, H * .5, 0), Math.hypot(W, H) * 0.6);
  const uniforms = {
    uTime: { value: 0 }, uAmount: { value: 0 }, uDist: { value: 0 }, uPush: { value: new THREE.Vector3() },
    uRadius: { value: radius }, uHeight: { value: height }, uSize: { value: new THREE.Vector2(W, H) },
    uRise: { value: 0.055 }, uAlpha: { value: 0 }, uNoise: { value: getNoise(low) },
    // on a light page steam is a little brighter than the page where it is lit and a cool grey where it shades itself
    uLit: { value: srgb(0xffffff) }, uShade: { value: srgb(0xa9b0ba) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, vertexShader: STEAM_VS, fragmentShader: STEAM_FS,
    defines: low ? { STEAM_LQ: '', STEAM_SLICES: 2 } : { STEAM_SLICES: 4 },
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'steam';
  mesh.frustumCulled = false;       // the quad is placed in the vertex shader
  mesh.renderOrder = 10;
  mesh.visible = false;
  const group = new THREE.Group();
  group.name = 'steam';
  group.add(mesh);
  let intensity = 0, time = 0, auto = true;
  return group.userData.fx = {
    group, mesh, duration: 0,
    setIntensity(v) {
      intensity = clamp(v, 0, 1.5);
      uniforms.uAmount.value = intensity;
      uniforms.uAlpha.value = Math.min(1, intensity * 1.5) * (low ? 0.95 : 0.90);
      mesh.visible = intensity > 0.002;
    },
    setAmount(v) { this.setIntensity(v); },
    setProgress(p) { this.setIntensity(p); },
    // d 0..1 stirs the plume; (x, y, z) leans it (meters at the top, in the steam group's frame)
    setDisturbance(d = 0, x = 0, y = 0, z = 0) { uniforms.uDist.value = clamp(d, 0, 1); uniforms.uPush.value.set(x, y, z); },
    setTime(t) { auto = false; time = t; uniforms.uTime.value = t; },
    update(dt) { if (!auto || !mesh.visible) return; time += Math.min(Math.max(dt, 0), 0.1); uniforms.uTime.value = time; },
    get intensity() { return intensity; },
    uniforms,
    dispose() { geo.dispose(); mat.dispose(); releaseNoise(low); group.removeFromParent(); },
  };
}

// ---------------------------------------------------------------------------------------------------------
// CONDENSATION: injected into the can body's MeshStandard/MeshPhysical material.
// Cylindrical coordinates (arc length around the axis, height) in meters, so droplets keep real sizes (beads 0.3 to
// 1.2 mm, coalesced drops 2 to 3 mm, a few runs that clear the film behind them). The amount is the only input:
// the film comes first, droplets nucleate at per-cell thresholds and grow with a square root, big drops sweep their
// surroundings clean, and near the end a few run down. Water is drawn as what it is: the clear lacquer layer of
// the material becomes the water surface over each drop (its own normal, mirror smooth), the metal under it stays
// metal; the film between drops is a rough, slightly white scatter that kills the mirror.
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
uniform vec3 uCondMistColor, uCondKey;
varying vec3 vCondP;
varying vec3 vCondT;
float cCov, cTrail, cMist, cDetail, cQ, cGrain;
vec2 cD, cGrainD;
vec3 cN;
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
    if (A <= th) continue;                    // not nucleated yet (th can lie above 1: a cell that stays dry)
    float g = clamp((A - th) / max(1.0 - th, 0.08), 0.0, 1.0);
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
cCov = 0.0; cTrail = 0.0; cMist = 0.0; cDetail = 1.0; cQ = 9.0; cGrain = 0.0; cD = vec2(0.0); cGrainD = vec2(0.0);
if (uCondAmount > 0.001) {
  vec2 rel = vCondP.xz - uCondAxis;
  float ang = atan(rel.y, rel.x);                        // -pi..pi
  float circ = 6.2831853 * uCondR;
  vec2 uvm = vec2((ang / 6.2831853 + 0.5) * circ, vCondP.y);  // meters: arc length, height
  float span = uCondY.y - uCondY.x;
  float pix = max(length(fwidth(vCondP)), 1e-6);        // meters per pixel (no seam: taken from the position)
  // where the cold liquid is: nothing above the fill line, soft edges at the body ends
  float rag = (cNoiseP(vec2(uvm.x / circ * 9.0, 3.0), 9.0) - 0.5) * 0.008 + (cNoiseP(vec2(uvm.x / circ * 31.0, 5.0), 31.0) - 0.5) * 0.003;
  float region = smoothstep(uCondY.x, uCondY.x + 0.004, vCondP.y) * (1.0 - smoothstep(uCondY.z - 0.014 + rag, uCondY.z + rag, vCondP.y));
  // low-frequency patchiness (breath-like density variation, about 1 cm)
  float patchN = cNoiseP(vec2(uvm.x / circ * 22.0, uvm.y * 140.0 + uCondY.w), 22.0) * 0.65
               + cNoiseP(vec2(uvm.x / circ * 47.0, uvm.y * 300.0 + 7.0), 47.0) * 0.35;
  float A = uCondAmount;
  // stage 1, the film: it arrives first, from the bottom (coldest) up
  float haze = smoothstep(0.0, 0.2, A - 0.10 * (vCondP.y - uCondY.x) / span + 0.06 * (patchN - 0.5)) * region;
  // stages 2 and 3: beads nucleate once the film is there, then grow; big drops form later
  float An = clamp((A - 0.14) / 0.86, 0.0, 1.0) * region * mix(0.82, 1.12, patchN);
  vec4 bS = vec4(0.0, 0.0, 9.0, 0.0), bL = vec4(0.0, 0.0, 9.0, 0.0);
  vec2 cS = vec2(0.0), cL = vec2(0.0);
  float nS = floor(circ / 0.00125), nL = floor(circ / 0.0036);
  cLayer(uvm, circ / nS, nS, An, 0.02, 0.58, 0.47, uCondY.w, bS, cS);
  cLayer(uvm, circ / nL, nL, An, 0.42, 1.03, 0.43, uCondY.w + 31.0, bL, cL);
  // stage 4, runs: a few columns let go once the can is wet, each wiping a clear track
  float dc = 0.0062, nD = floor(circ / dc); dc = circ / nD;
  float colx = uvm.x / dc, ic = mod(floor(colx), nD);
  vec2 hd = cH2(vec2(ic, 5.3 + uCondY.w));
  float dStart = 0.72 + hd.y * 0.22;
  float dg = clamp((A - dStart) / (1.0 - dStart + 0.03), 0.0, 1.0) * step(hd.x, 0.27);
  vec4 bD = vec4(0.0, 0.0, 9.0, 0.0);
  if (dg > 0.0) {
    float y0 = uCondY.z - 0.012 - cH1(vec2(ic, 2.2)) * span * 0.42;
    float yh = y0 - dg * dg * (y0 - uCondY.x - 0.004) * (0.5 + 0.5 * hd.y);
    float tx = (floor(colx) + 0.5 + (hd.y - 0.5) * 0.4) * dc + sin(uvm.y * 420.0 + hd.x * 40.0) * 0.00028;
    float hw = mix(0.00030, 0.00062, smoothstep(y0, yh, uvm.y));
    float dx = abs(uvm.x - tx);
    float aa = pix * 1.2;
    cTrail = (1.0 - smoothstep(hw - aa, hw + aa, dx)) * smoothstep(yh, yh + 0.001, uvm.y) * (1.0 - smoothstep(y0 - 0.002, y0, uvm.y));
    float rh = 0.0015 + 0.0006 * hd.y;
    vec2 d = vec2(uvm.x - tx, uvm.y - (yh + rh * 0.55));
    d.y *= d.y < 0.0 ? 0.80 : 1.9;            // a running drop is a teardrop: round below, drawn out above
    bD = vec4(d / rh, length(d) / rh, rh);
  }
  // coalescence: a big drop sweeps a clear halo; small beads whose centre falls in it are gone
  if (bL.z < 6.0 && distance(cS, cL) < bL.w * 1.5 + bS.w) bS.z = 9.0;
  if (cTrail > 0.0) bS.z = 9.0;
  vec4 b = bS;
  if (bL.z < b.z) b = bL;
  if (bD.z < b.z) b = bD;
  cQ = b.z; cD = b.xy;
  float aaq = clamp(pix / max(b.w, 1e-6) * 1.4, 0.02, 1.0);
  cCov = 1.0 - smoothstep(1.0 - aaq, 1.0, b.z);
  cDetail = smoothstep(0.6, 2.0, b.w / pix);            // drops under about 2 px fade to an average sheen
  // (and they take the film with them only in part: a bead smaller than a pixel that swaps the dull film for clear
  // metal flips that whole pixel to white on the lit side and to black on the dark side, which is speckle)
  cCov *= mix(0.45, 1.0, cDetail);
  float halo = bL.z < 1.7 ? 1.0 - smoothstep(1.1, 1.7, bL.z) : 0.0;
  // the film thins as the water gathers into drops, is gone in the tracks and around big drops
  cMist = uCondMist * haze * (0.82 + 0.18 * patchN) * (1.0 - 0.26 * smoothstep(0.5, 1.0, A)) * (1.0 - cTrail) * (1.0 - 0.55 * halo) * (1.0 - cCov);
  #ifndef COND_LQ
  // the film itself is droplets too small to see one by one: where a pixel is fine enough, each is a pinpoint
  {
    vec2 mp = uvm / 0.00045; vec2 mi = floor(mp), mf = fract(mp);
    mi.x = mod(mi.x, floor(circ / 0.00045));
    vec2 mh = cH2(mi + 71.0);
    float mr = (0.14 + 0.24 * mh.x) * smoothstep(0.08, 0.5, A);
    vec2 md = (mf - (0.3 + 0.4 * mh.yx)) / max(mr, 1e-3);
    float mvis = smoothstep(0.7, 1.8, 0.00045 * mr / pix);
    cGrain = (1.0 - smoothstep(0.6, 1.0, length(md))) * mvis * cMist;
    cGrainD = md;
  }
  #endif
  // albedo (the body is metal: this colours its reflection, and the film's scatter once the metalness drops)
  vec3 base = diffuseColor.rgb;
  vec3 misted = mix(base, uCondMistColor, 0.55 * cMist);
  // a drop is a small lens: a thin dark rim, the metal under it clear and a little deeper, a bright crescent low down
  float rim = smoothstep(0.82, 1.0, cQ) * cDetail;
  float low = smoothstep(0.2, -0.8, cD.y) * (1.0 - smoothstep(0.7, 1.0, cQ));
  vec3 dropCol = mix(base, uCondMistColor, 0.40) * mix(1.0, 0.60, rim) * (1.0 + 0.30 * low * cDetail);
  dropCol = mix(mix(base, uCondMistColor, 0.45), dropCol, cDetail);
  vec3 col = mix(misted, base * 0.86, cTrail);
  diffuseColor.rgb = mix(col, dropCol, cCov);
}`;
const COND_ROUGH = /* glsl */`
if (uCondAmount > 0.001) {
  roughnessFactor = mix(roughnessFactor, 0.66, cMist * 0.9);
  roughnessFactor = mix(roughnessFactor, 0.20, cTrail * 0.6);
  roughnessFactor = mix(roughnessFactor, mix(0.40, 0.16, cDetail), cCov);
}`;
const COND_METAL = /* glsl */`
if (uCondAmount > 0.001) metalnessFactor *= (1.0 - 0.55 * cMist) * (1.0 - 0.40 * cCov);`;
const COND_NORMAL = /* glsl */`
cN = normal;
if (uCondAmount > 0.001 && (cCov > 0.0 || cGrain > 0.0)) {
  vec3 T = normalize(vCondT - normal * dot(normal, vCondT));
  vec3 B = cross(T, normal);
  vec2 sl = cD / max(cQ, 1.0) * 0.88 * cCov * cDetail + cGrainD * 0.7 * cGrain;
  vec3 nl = vec3(sl, sqrt(max(1.0 - dot(sl, sl), 0.0)));
  cN = normalize(T * nl.x + B * nl.y + normal * nl.z);
  // the metal seen through a drop is bent a little (a lens); without a clear layer the dome itself takes the light
  #ifdef USE_CLEARCOAT
  normal = normalize(mix(normal, cN, 0.35));
  #else
  normal = cN;
  #endif
}`;
const COND_COAT_NORMAL = /* glsl */`
#ifdef USE_CLEARCOAT
if (uCondAmount > 0.001) clearcoatNormal = normalize(mix(clearcoatNormal, cN, max(cCov * cDetail, cGrain)));
#endif`;
const COND_COAT = /* glsl */`
#ifdef USE_CLEARCOAT
if (uCondAmount > 0.001) {
  float cWater = max(cCov * cDetail, cGrain);
  // the film scatters the lacquer's mirror away; over a drop the clear layer is the water surface itself
  material.clearcoat = mix(material.clearcoat * (1.0 - 0.9 * cMist), 1.0, cWater);
  material.clearcoatRoughness = mix(mix(material.clearcoatRoughness, 0.55, cMist), 0.03, cWater);
  material.clearcoat = mix(material.clearcoat, 0.8, cTrail * (1.0 - cWater));
}
#endif`;
const COND_EMISSIVE = /* glsl */`
if (uCondAmount > 0.001 && cCov > 0.0) {
  // light gathered by the drop lands as a soft crescent on its lower side
  float lowGlow = smoothstep(0.1, -0.75, cD.y) * (1.0 - smoothstep(0.72, 1.0, cQ));
  totalEmissiveRadiance += uCondMistColor * (0.30 * lowGlow * cCov * cDetail * uCondGlint);
  // the catch-light: the lamp inside the key softbox, mirrored as a pinpoint in each drop (the cue that says water)
  vec3 cV = normalize(vViewPosition);
  vec3 cR = reflect(-cV, cN);
  float cat = pow(max(dot(cR, normalize(mat3(viewMatrix) * uCondKey)), 0.0), 140.0);
  // (a bead too small to resolve has one normal, so on the lit side each lit up whole, as a white dot: keep those
  // to a soft speck and leave the pinpoint to drops large enough to show a dome)
  totalEmissiveRadiance += vec3(cat * 2.8 * cCov * mix(0.10, 1.0, cDetail * cDetail) * uCondGlint);
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
  if (fillLine == null) fillLine = yMin + (yMax - yMin) * 0.93;
  const low = options.quality === 'low';
  const uniforms = {
    uCondAmount: { value: 0 }, uCondR: { value: radius }, uCondGlint: { value: options.glint ?? 1 },
    uCondMist: { value: options.mist ?? 1 },
    uCondAxis: { value: new THREE.Vector2(axis[0], axis[1]) },
    uCondY: { value: new THREE.Vector4(yMin, yMax, fillLine, options.seed ?? 0) },
    uCondMistColor: { value: srgb(options.mistColor ?? 0xd3d9df) },
    uCondKey: { value: new THREE.Vector3(...(options.key || [-0.62, 0.58, 0.52])).normalize() },
  };
  const prevCompile = material.onBeforeCompile, prevKey = material.customProgramCacheKey;
  // on the material, not in the hook (three hands the hook material.defines by reference: a define set there
  // changes the program key after the first compile and links a duplicate program on the next draw)
  if (low) material.defines = { ...(material.defines || {}), COND_LQ: '' };
  material.onBeforeCompile = (shader, renderer) => {
    if (prevCompile) prevCompile.call(material, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = insertAfter(insertAfter(shader.vertexShader, 'common', COND_VERT_PARS), 'begin_vertex', COND_VERT);
    let fs = shader.fragmentShader;
    fs = insertAfter(fs, 'common', COND_FRAG_PARS);
    fs = insertAfter(fs, 'color_fragment', COND_COLOR);
    fs = insertAfter(fs, 'roughnessmap_fragment', COND_ROUGH);
    fs = insertAfter(fs, 'metalnessmap_fragment', COND_METAL);
    fs = insertAfter(fs, 'normal_fragment_maps', COND_NORMAL);
    fs = insertAfter(fs, 'clearcoat_normal_fragment_maps', COND_COAT_NORMAL);
    fs = insertAfter(fs, 'emissivemap_fragment', COND_EMISSIVE);
    fs = insertAfter(fs, 'lights_physical_fragment', COND_COAT);
    shader.fragmentShader = fs;
  };
  material.customProgramCacheKey = () => (prevKey ? prevKey.call(material) : '') + '|fx-cond-4' + (low ? 'l' : '');
  material.needsUpdate = true;
  let amount = 0;
  return {
    material, uniforms,
    setAmount(v) { amount = clamp(v, 0, 1); uniforms.uCondAmount.value = amount; },
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
// WATER RING: what the cold can leaves on the plate. A flat annulus whose fragment shader builds a height field:
// the meniscus line that wicked along the can's stand ring (broken, a little wider where run-off gathered) and a
// few drops that fell from the wall. The height gives the normal, the normal mirrors the studio: water reads by
// its highlights, a thin dark edge toward the light and a bright crescent away from it, over a plate that is only
// slightly darker where wet. Drawn premultiplied, so a highlight is not dimmed by the film's low opacity.
const RING_FRAG_PARS = /* glsl */`
uniform float uRingAmount;
uniform vec3 uRingR;          // stand ring radius, can wall radius, seed
uniform vec3 uRingKey;        // toward the key light, world
varying vec2 vRingP;
varying vec3 vRingKey;
varying mat3 vRingNM;
float rCov, rHeight;
vec2 rSlope;
float rH(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float rN(float x, float P) { float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(rH(vec2(mod(i, P), 1.0)), rH(vec2(mod(i + 1.0, P), 1.0)), f); }`;
const RING_ALPHA = /* glsl */`
{
  float ang = atan(vRingP.y, vRingP.x) / 6.2831853 + 0.5;
  float r = length(vRingP), A = uRingAmount;
  vec2 er = vRingP / max(r, 1e-6);
  float aa = max(fwidth(r), 1e-6);
  // the meniscus line under the stand ring: present where the run-off reached it, wider at a few pools
  float n1 = rN(ang * 11.0 + uRingR.z, 11.0), n2 = rN(ang * 29.0 + 3.0, 29.0);
  float on = smoothstep(0.62, 0.30, n1 + 0.25 * n2 - A * 0.80 + 0.2);
  float pool = smoothstep(0.55, 0.95, rN(ang * 5.0 + 1.7 + uRingR.z, 5.0)) * smoothstep(0.35, 1.0, A);
  float w = (0.00030 + 0.00055 * A) * (0.35 + 1.3 * n2) + 0.0016 * pool;                // half width
  float c = uRingR.x + 0.0002 + (n1 - 0.5) * 0.0006 + pool * 0.0009;
  float u = (r - c) / w;                                                                 // -1..1 across the line
  float lineH = sqrt(max(1.0 - u * u, 0.0)) * on;
  float cov = (1.0 - smoothstep(1.0 - aa / w * 1.5, 1.0, abs(u))) * step(0.01, on) * smoothstep(0.0, 0.08, on);
  vec2 slope = er * (u / max(sqrt(max(1.0 - u * u, 0.02)), 0.1)) * 0.8;
  float h = lineH;
  // fallen drops between the stand ring and a little beyond the wall: jittered cells, each with its own threshold
  {
    float cs = 0.0042;
    vec2 p = vRingP / cs, ip = floor(p), fp = fract(p);
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      vec2 cc = vec2(float(i), float(j)), id = ip + cc;
      float h1 = rH(id + uRingR.z + 3.0), h2 = rH(id + 17.3), h3 = rH(id + 41.7);
      vec2 ctr = cc + 0.2 + 0.6 * vec2(h2, h3);
      float rc = length((ip + ctr) * cs);
      float ok = step(uRingR.x + 0.002, rc) * step(rc, uRingR.y + 0.0045);
      float g = clamp((A - (0.25 + 0.7 * h1)) / 0.3, 0.0, 1.0) * ok;
      if (g <= 0.0) continue;
      float rad = (0.00045 + 0.0011 * h2 * h2) * sqrt(g);
      vec2 d = (fp - ctr) * cs / rad;
      float q = length(d);
      if (q < 1.0) {
        float dh = sqrt(1.0 - q * q);
        if (dh > h) { h = dh; slope = d / max(dh, 0.25) * 0.75; }
        cov = max(cov, 1.0 - smoothstep(1.0 - clamp(aa / rad * 1.5, 0.03, 0.6), 1.0, q));
      }
    }
  }
  rCov = cov; rHeight = h; rSlope = slope;
  if (cov < 0.004) discard;
}`;
const RING_NORMAL = /* glsl */`
{
  vec3 nl = vec3(rSlope.x, 1.0, rSlope.y);
  normal = normalize(vRingNM * nl);
}`;
const RING_OUT = /* glsl */`
{
  // water over bead-blasted metal: the wet patch is a little darker and clearer; toward the key a thin dark edge,
  // away from it the light the drop gathered
  vec2 kd = normalize(vRingKey.xz + 1e-5);
  float side = dot(normalize(rSlope + 1e-5), kd) * smoothstep(0.05, 0.5, length(rSlope));   // +1: the flank facing the key
  float edge = 1.0 - rHeight;
  float dark = 0.16 + 0.34 * smoothstep(0.35, 1.0, edge) * max(side, 0.0);
  float caustic = smoothstep(0.25, 0.9, edge) * max(-side, 0.0) * (1.0 - smoothstep(0.93, 1.0, edge));
  vec3 spec = gl_FragColor.rgb;
  float a = clamp(dark, 0.0, 1.0) * rCov;
  gl_FragColor = vec4((spec + vec3(0.42, 0.45, 0.48) * caustic) * rCov, a);
}`;

export function createWaterRing({ radius = 0.033, standRadius = null, quality = 'high', seed = 0 } = {}) {
  const low = quality === 'low';
  const stand = standRadius || radius * 0.72;
  const inner = stand - 0.004, outer = radius + 0.006;
  const geo = new THREE.RingGeometry(inner, outer, low ? 32 : 48, 1);
  geo.rotateX(-Math.PI / 2);
  const uniforms = {
    uRingAmount: { value: 0 }, uRingR: { value: new THREE.Vector3(stand, radius, seed) },
    uRingKey: { value: new THREE.Vector3(-0.62, 0.58, 0.52).normalize() },
  };
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0x000000, roughness: 0.04, metalness: 0, ior: 1.33, specularIntensity: 1,
    transparent: true, depthWrite: false, premultipliedAlpha: true, polygonOffset: true, polygonOffsetFactor: -2,
  });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = insertAfter(insertAfter(shader.vertexShader, 'common', `
uniform vec3 uRingKey;
varying vec2 vRingP;
varying vec3 vRingKey;
varying mat3 vRingNM;`), 'begin_vertex', `
vRingP = position.xz; vRingNM = normalMatrix;
vRingKey = normalize(transpose(mat3(modelMatrix)) * uRingKey);`);
    let fs = shader.fragmentShader;
    fs = insertAfter(fs, 'common', RING_FRAG_PARS);
    fs = insertAfter(fs, 'alphamap_fragment', RING_ALPHA);
    fs = insertAfter(fs, 'normal_fragment_maps', RING_NORMAL);
    // after tone and colour space, before the premultiply: the output is built here (already premultiplied)
    fs = fs.replace('#include <premultiplied_alpha_fragment>', RING_OUT);
    shader.fragmentShader = fs;
  };
  mat.customProgramCacheKey = () => 'fx-ring-3';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'waterRing'; mesh.position.y = 0.0003; mesh.renderOrder = 2; mesh.visible = false;
  mesh.userData.lookNoShadow = true;
  const group = new THREE.Group(); group.name = 'waterRing'; group.add(mesh);
  let amount = 0;
  return {
    group, mesh,
    setAmount(v) { amount = clamp(v, 0, 1); uniforms.uRingAmount.value = amount; mesh.visible = amount > 0.002; },
    setProgress(p) { this.setAmount(p); },
    get amount() { return amount; },
    uniforms,
    dispose() { geo.dispose(); mat.dispose(); group.removeFromParent(); },
  };
}

// ---------------------------------------------------------------------------------------------------------
// COLD FOG. Cold air is heavy: it pools in the tray around the can, spills over the lid rim, slides down the case
// and spreads over the page, thinning as it goes. One mesh: a skirt that follows that path around the whole case
// (two shells on high, one on low, a few millimeters off the surfaces so it never cuts into them), with a noise
// that scrolls along the flow. The sheet fades where it is seen edge-on, so it has no outline.
const FOG_VS = /* glsl */`
attribute vec3 aFlow;         // x: meters around the case, y: meters along the flow from the tray, z: seconds of travel to here
attribute float aShell;
attribute vec2 aOut;          // outward direction of this stretch of the case's outline
varying vec3 vFlow;
varying float vShell, vFace, vNear;
void main() {
  vFlow = aFlow; vShell = aShell;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vec3 n = normalize(normalMatrix * normal), toEye = normalize(-mv.xyz);
  vFace = abs(dot(n, toEye));
  // only the sides that face the viewer carry fog: the far rim's bank would read as an outline behind the case
  vNear = dot(normalize(normalMatrix * vec3(aOut.x, 0.0, aOut.y)), toEye);
  gl_Position = projectionMatrix * mv;
}`;
const FOG_FS = /* glsl */`
uniform sampler2D uNoise;
uniform float uTime, uAmount, uAlpha;
uniform vec4 uPath;           // flow distance at: rim crest, top of the wall, foot of the wall, end
uniform vec3 uColor;
varying vec3 vFlow;
varying float vShell, vFace, vNear;
void main() {
  float s = vFlow.y, t = uTime;
  // the pattern rides the flow: its coordinate is the travel time to this point (a crawl in the tray and over the
  // rim, faster down the wall, slowing on the page), so wisps stretch where the air speeds up and nothing shears
  float fall = smoothstep(uPath.y - 0.004, uPath.z, s);
  vec2 q = vec2(vFlow.x / 0.115 + vShell * 0.43, (vFlow.z - t) * 0.21 + vShell * 0.29);
  vec2 wv = texture2D(uNoise, q * 0.6 + vec2(t * 0.011, 0.0)).rg - 0.5;
  q += wv * 0.55;
  #ifdef FOG_LQ
  float n = texture2D(uNoise, q).b;
  #else
  float n = texture2D(uNoise, q).b * 0.7 + texture2D(uNoise, q * 2.3 + 0.21).r * 0.3;
  #endif
  // thick in the tray and at the crest, thinning as it falls: it is gone a little over half way down the wall and
  // never reaches the page (a veil over the whole wall and a bank on the page read as dust on the case in a still)
  float onWall = fall * (1.0 - smoothstep(uPath.z - 0.004, uPath.z + 0.012, s));
  float wallT = clamp((s - uPath.y) / max(uPath.z - uPath.y, 1e-4), 0.0, 1.0);
  float body = smoothstep(0.0, 0.006, s) * mix(1.0, 0.5, onWall) * (1.0 - smoothstep(0.05, 0.62, wallT));
  float lo = 0.42 - 0.30 * uAmount + 0.10 * onWall;
  float d = smoothstep(lo, lo + 0.80, n) * body;
  float a = d * uAlpha * smoothstep(0.10, 0.55, vFace) * mix(1.0, 0.75, vShell) * smoothstep(-0.05, 0.35, vNear);
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColor, a);
  #include <colorspace_fragment>
}`;

export function createColdFog({ box = null, quality = 'high', reach = 0.05, inset = 0.008 } = {}) {
  const low = quality === 'low';
  const b = box || new THREE.Box3(new THREE.Vector3(-0.0426, -0.029, -0.0451), new THREE.Vector3(0.0426, 0.0031, 0.0451));
  const hx = (b.max.x - b.min.x) / 2, hz = (b.max.z - b.min.z) / 2, cx = (b.max.x + b.min.x) / 2, cz = (b.max.z + b.min.z) / 2;
  const top = b.max.y, ground = b.min.y, wallH = top - ground;
  // the flow path in a vertical section through a wall: d = distance outward from the wall face, y = height
  const section = off => {
    const pts = [];
    const add = (d, y) => pts.push([d, y]);
    add(-inset, top - 0.0020 + off * 0.4);                              // in the tray, over the plate margin
    add(-inset * 0.45, top + 0.0006 + off * 0.7);
    const crest = top + 0.0012 + off * 0.45;                             // the bank over the rim stays low
    add(-0.0010, crest);
    const rc = 0.0035 + off;                                             // round the top edge
    for (let i = 1; i <= 3; i++) { const a = i / 3 * Math.PI / 2; add(Math.sin(a) * rc, crest - (1 - Math.cos(a)) * rc); }
    const yFoot = ground + 0.0065 + off * 0.5, rf = 0.006;
    add(rc, top - wallH * 0.33); add(rc, top - wallH * 0.66); add(rc, yFoot + rf * 0.2);
    for (let i = 1; i <= 3; i++) { const a = i / 3 * Math.PI / 2; add(rc + (1 - Math.cos(a)) * rf, yFoot - Math.sin(a) * (yFoot - ground - 0.0012 - off * 0.5)); }
    for (let i = 1; i <= 3; i++) add(rc + rf + reach * i / 3, ground + 0.0012 + off * 0.5 + 0.0015 * i / 3);
    return pts;
  };
  // the perimeter: a rounded rectangle, parameterised by the outward distance d (corners of radius d + a little)
  const perim = [];
  const sideN = low ? 3 : 5, cornN = low ? 2 : 4;
  const corners = [[1, 1, 0], [-1, 1, 1], [-1, -1, 2], [1, -1, 3]];      // sign x, sign z, quarter
  for (const [sx, sz, qd] of corners) {
    for (let i = 0; i <= cornN; i++) perim.push({ kind: 'corner', sx, sz, a: (qd + i / cornN) * Math.PI / 2 });
    const next = corners[(qd + 1) % 4];
    for (let i = 1; i < sideN; i++) perim.push({ kind: 'side', from: [sx, sz], to: [next[0], next[1]], t: i / sideN });
  }
  const at = (p, d) => {
    // d < 0 is inside the footprint: shrink the rectangle; d > 0 offsets it outward with rounded corners
    const ex = hx + Math.min(d, 0), ez = hz + Math.min(d, 0), r = Math.max(d, 0);
    if (p.kind === 'corner') return [cx + p.sx * ex + Math.cos(p.a) * r, cz + p.sz * ez + Math.sin(p.a) * r, Math.cos(p.a), Math.sin(p.a)];
    const x0 = p.from[0] * ex, z0 = p.from[1] * ez, x1 = p.to[0] * ex, z1 = p.to[1] * ez;
    const nx = (p.from[0] + p.to[0]) / 2, nz = (p.from[1] + p.to[1]) / 2;
    return [cx + x0 + (x1 - x0) * p.t + nx * r, cz + z0 + (z1 - z0) * p.t + nz * r, nx, nz];
  };
  const pos = [], nor = [], flow = [], shell = [], outs = [], idx = [];
  let path = null;
  const shells = low ? [0.0030] : [0.0025, 0.0085];
  shells.forEach((off, si) => {
    const sec = section(off), rows = sec.length, cols = perim.length + 1, base = pos.length / 3;
    const sAt = [0]; for (let j = 1; j < rows; j++) sAt.push(sAt[j - 1] + Math.hypot(sec[j][0] - sec[j - 1][0], sec[j][1] - sec[j - 1][1]));
    if (!path) path = [sAt[2], sAt[5], sAt[8], sAt[rows - 1]];
    // travel time along the section (s): 16 mm/s in the tray and over the crest, 50 mm/s down the wall, slowing on the page
    const speed = j => (j <= 2 ? 0.016 : j <= 5 ? 0.016 + 0.034 * (j - 2) / 3 : j <= 11 ? 0.05 : 0.05 - 0.032 * (j - 11) / (rows - 1 - 11));
    const tau = [0]; for (let j = 1; j < rows; j++) tau.push(tau[j - 1] + (sAt[j] - sAt[j - 1]) / ((speed(j) + speed(j - 1)) / 2));
    let u = 0, prev = null;
    for (let k = 0; k < cols; k++) {
      const p = perim[k % perim.length];
      const ref = at(p, 0.004);
      if (prev) u += Math.hypot(ref[0] - prev[0], ref[1] - prev[1]);
      prev = ref;
      for (let j = 0; j < rows; j++) {
        const [d, y] = sec[j], q = at(p, d);
        pos.push(q[0], y, q[1]);
        // normal: perpendicular to the section, in the plane of the outward direction and up
        const a = sec[Math.max(0, j - 1)], c = sec[Math.min(rows - 1, j + 1)];
        let td = c[0] - a[0], ty = c[1] - a[1]; const l = Math.hypot(td, ty) || 1; td /= l; ty /= l;
        nor.push(q[2] * -ty, td, q[3] * -ty);
        flow.push(u, sAt[j], tau[j]); shell.push(si); outs.push(q[2], q[3]);
      }
    }
    for (let k = 0; k < cols - 1; k++) for (let j = 0; j < rows - 1; j++) {
      const a = base + k * rows + j, c = a + rows;
      idx.push(a, c, a + 1, a + 1, c, c + 1);
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow, 3));
  geo.setAttribute('aShell', new THREE.Float32BufferAttribute(shell, 1));
  geo.setAttribute('aOut', new THREE.Float32BufferAttribute(outs, 2));
  geo.setIndex(idx); geo.computeBoundingSphere();
  const uniforms = {
    uTime: { value: 0 }, uAmount: { value: 0 }, uAlpha: { value: 0 }, uNoise: { value: getNoise(low) },
    uPath: { value: new THREE.Vector4(...path) }, uColor: { value: srgb(0xf4f7fa) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, vertexShader: FOG_VS, fragmentShader: FOG_FS, defines: low ? { FOG_LQ: '' } : {},
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'coldFog'; mesh.renderOrder = 8; mesh.visible = false; mesh.userData.lookNoShadow = true;
  const group = new THREE.Group(); group.name = 'coldFog'; group.add(mesh);
  let amount = 0, time = 0, auto = true;
  return {
    group, mesh, duration: 0,
    setAmount(v) { amount = clamp(v, 0, 1); uniforms.uAmount.value = amount; uniforms.uAlpha.value = Math.min(1, amount * 1.6) * (low ? 0.30 : 0.26); mesh.visible = amount > 0.002; },
    setIntensity(v) { this.setAmount(v); },
    setProgress(p) { this.setAmount(p); },
    setTime(t) { auto = false; time = t; uniforms.uTime.value = t; },
    update(dt) { if (!auto || !mesh.visible) return; time += Math.min(Math.max(dt, 0), 0.1); uniforms.uTime.value = time; },
    get amount() { return amount; },
    triangles: idx.length / 3, uniforms,
    dispose() { geo.dispose(); mat.dispose(); releaseNoise(low); group.removeFromParent(); },
  };
}

// ---------------------------------------------------------------------------------------------------------
// FROST: a cold film on the plate, creeping in from its edges. First a dew haze that takes the mirror out of the
// metal, then a fine grain with a few needles at the advancing front. (At the 11 C this design reaches, a real
// plate shows the dew, not ice: `crystals` sets how icy the film gets; 0 is dew only.)
const FROST_FRAG_PARS = /* glsl */`
uniform float uFrostAmount, uFrostHalf, uFrostCrystals;
varying vec2 vFrostP;
float fH(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float fN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(fH(i), fH(i + vec2(1.0, 0.0)), f.x), mix(fH(i + vec2(0.0, 1.0)), fH(i + vec2(1.0, 1.0)), f.x), f.y); }
float frostIce;`;
const FROST_ALPHA = /* glsl */`
{
  vec2 e = uFrostHalf - abs(vFrostP);                    // distance to the two nearer edges
  float d = min(e.x, e.y), A = uFrostAmount;
  float n = fN(vFrostP * 420.0) * 0.55 + fN(vFrostP * 1300.0 + 3.1) * 0.45;
  // the front: it leaves the edge at once and reaches about 60% of the way in; soft, a little ragged, and the
  // film is densest at the edge, where it has been cold longest
  float front = A * uFrostHalf * 0.62 * (0.82 + 0.36 * fN(vFrostP * 130.0)) + 0.0006;
  float film = (1.0 - smoothstep(front * 0.18, front, d + (n - 0.5) * 0.0022)) * smoothstep(0.0, 0.12, A);
  // needles: short bright strokes that grow inward from the edge side, densest just behind the front
  vec2 dir = e.x < e.y ? vec2(sign(vFrostP.x), 0.0) : vec2(0.0, sign(vFrostP.y));
  vec2 along = vec2(dot(vFrostP, dir), dot(vFrostP, vec2(-dir.y, dir.x)));
  float needle = smoothstep(0.80, 0.97, fN(vec2(along.x * 260.0, along.y * 2400.0 + fN(along.yy * 300.0) * 6.0)));
  float grain = smoothstep(0.55, 0.9, fN(vFrostP * 2600.0));
  frostIce = uFrostCrystals * film * smoothstep(0.35, 0.9, A) * max(needle * smoothstep(front * 0.2, front * 0.9, d), 0.5 * grain);
  diffuseColor.a *= clamp(film * (0.28 + 0.18 * n) * (0.6 + 0.4 * A) + frostIce * 0.4, 0.0, 0.85);
  if (diffuseColor.a < 0.004) discard;
}`;
export function createFrost({ size = 0.0802, quality = 'high', crystals = 0.45 } = {}) {
  const geo = new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2);
  const uniforms = { uFrostAmount: { value: 0 }, uFrostHalf: { value: size / 2 }, uFrostCrystals: { value: crystals } };
  const mat = new THREE.MeshStandardMaterial({ color: 0xe6ecf2, roughness: 0.82, metalness: 0, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = insertAfter(insertAfter(shader.vertexShader, 'common', 'varying vec2 vFrostP;'), 'begin_vertex', 'vFrostP = position.xz;');
    let fs = shader.fragmentShader;
    fs = insertAfter(fs, 'common', FROST_FRAG_PARS);
    fs = insertAfter(fs, 'alphamap_fragment', FROST_ALPHA);
    fs = insertAfter(fs, 'roughnessmap_fragment', 'roughnessFactor = mix(roughnessFactor, 0.35, frostIce);');
    shader.fragmentShader = fs;
  };
  mat.customProgramCacheKey = () => 'fx-frost-2';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'frost'; mesh.position.y = 0.0002; mesh.renderOrder = 0.5; mesh.visible = false; mesh.userData.lookNoShadow = true;
  const group = new THREE.Group(); group.name = 'frost'; group.add(mesh);
  let amount = 0;
  return {
    group, mesh,
    setAmount(v) { amount = clamp(v, 0, 1); uniforms.uFrostAmount.value = amount; mesh.visible = amount > 0.002; },
    setProgress(p) { this.setAmount(p); },
    get amount() { return amount; },
    uniforms,
    dispose() { geo.dispose(); mat.dispose(); group.removeFromParent(); },
  };
}

// ---------------------------------------------------------------------------------------------------------
// HEAT SHIMMER. Warm air over the plate has a lower refractive index, so whatever is behind it wobbles by a
// fraction of a pixel. That is the whole effect: there is no tint and no haze. High tier: just before its quad is
// drawn, the pixels behind it are copied from the frame (only the quad's own screen rectangle, never the full
// frame) and the quad redraws them displaced by a rising noise, strongest low over the plate and gone at its edges.
// It only bends what the canvas itself drew (the device, the mug, their shadows); the page behind the canvas is not
// in the frame. Low tier: nothing is drawn (the steam and the mode of the device carry the heat).
const SHIMMER_VS = /* glsl */`
uniform vec2 uSize;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 c = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  vec3 up = (modelViewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz;
  float sc = length(up); up /= sc;
  vec3 right = cross(up, vec3(0.0, 0.0, 1.0));
  right = dot(right, right) > 1e-6 ? normalize(right) : vec3(1.0, 0.0, 0.0);
  gl_Position = projectionMatrix * vec4(c.xyz + (right * (uv.x - 0.5) * uSize.x + up * uv.y * uSize.y) * sc, 1.0);
}`;
const SHIMMER_FS = /* glsl */`
uniform sampler2D uGrab, uNoise;
uniform vec4 uRect;           // the copied rectangle in drawing-buffer pixels: x, y, 1 / w, 1 / h
uniform vec2 uSize;
uniform float uTime, uIntensity, uPixels;
varying vec2 vUv;
void main() {
  // the field has to be smooth from one pixel to the next (cells one to three centimeters across, rising at about
  // 4 cm/s): with millimeter cells it shifted neighboring rows by different amounts and edges came out uneven
  vec2 q = vec2(vUv.x * uSize.x / 0.11, vUv.y * uSize.y / 0.11 - uTime * 0.36);
  vec2 n = (texture2D(uNoise, q).rg - 0.5) * 1.5;
  float env = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x) * smoothstep(0.0, 0.06, vUv.y) * (1.0 - smoothstep(0.25, 1.0, vUv.y));
  vec2 off = n * (uPixels * uIntensity * env);
  gl_FragColor = texture2D(uGrab, (gl_FragCoord.xy + off - uRect.xy) * uRect.zw);
}`;
export function createHeatShimmer({ width = 0.09, height = 0.07, radius = null, quality = 'high', pixels = 1.6 } = {}) {
  const low = quality === 'low';
  if (radius && width === 0.09) width = radius * 2.6;
  const group = new THREE.Group(); group.name = 'heatShimmer';
  let intensity = 0, time = 0, auto = true;
  if (low) {
    return {
      group, mesh: null,
      setIntensity(v) { intensity = clamp(v, 0, 1); }, setProgress(p) { this.setIntensity(p); },
      setTime(t) { time = t; }, update() {}, get intensity() { return intensity; }, dispose() { group.removeFromParent(); },
    };
  }
  const geo = new THREE.PlaneGeometry(1, 1, 1, 1);
  geo.translate(0.5, 0.5, 0);    // uv = position
  let grab = null, gw = 0, gh = 0;
  const uniforms = {
    uGrab: { value: null }, uNoise: { value: getNoise(false) }, uRect: { value: new THREE.Vector4(0, 0, 1, 1) },
    uSize: { value: new THREE.Vector2(width, height) }, uTime: { value: 0 }, uIntensity: { value: 0 }, uPixels: { value: pixels },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, vertexShader: SHIMMER_VS, fragmentShader: SHIMMER_FS,
    transparent: true, blending: THREE.NoBlending, depthTest: false, depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'heatShimmer'; mesh.renderOrder = 9; mesh.visible = false; mesh.frustumCulled = false; mesh.userData.lookNoShadow = true;
  const c = new THREE.Vector3(), up = new THREE.Vector3(), rt = new THREE.Vector3(), p = new THREE.Vector3(), at = new THREE.Vector2(), sz = new THREE.Vector2();
  // just before the quad is drawn (after everything opaque and every earlier transparent object): copy the pixels
  // under it. The rectangle is the quad's screen bounds plus a margin, clamped to the drawing buffer.
  mesh.onBeforeRender = (renderer, scene, camera) => {
    if (renderer.getRenderTarget()) return;                 // only in the main frame
    mesh.updateWorldMatrix(true, false);
    const mv = p.set(0, 0, 0).applyMatrix4(mesh.matrixWorld).applyMatrix4(camera.matrixWorldInverse); c.copy(mv);
    up.set(0, 1, 0).transformDirection(mesh.matrixWorld).transformDirection(camera.matrixWorldInverse);
    const sc = mesh.matrixWorld.getMaxScaleOnAxis();
    rt.crossVectors(up, p.set(0, 0, 1)); if (rt.lengthSq() < 1e-6) rt.set(1, 0, 0); rt.normalize();
    renderer.getDrawingBufferSize(sz);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < 4; i++) {
      p.copy(c).addScaledVector(rt, (i & 1 ? 0.5 : -0.5) * width * sc).addScaledVector(up, (i & 2 ? 1 : 0) * height * sc).applyMatrix4(camera.projectionMatrix);
      const x = (p.x * 0.5 + 0.5) * sz.x, y = (p.y * 0.5 + 0.5) * sz.y;
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
    x0 = Math.max(0, Math.floor(x0) - 4); y0 = Math.max(0, Math.floor(y0) - 4); x1 = Math.min(sz.x, Math.ceil(x1) + 4); y1 = Math.min(sz.y, Math.ceil(y1) + 4);
    const w = Math.max(1, x1 - x0), h = Math.max(1, y1 - y0);
    if (!grab || w > gw || h > gh) {                        // grow in steps so a slow move does not reallocate each frame
      if (grab) grab.dispose();
      gw = Math.ceil(w / 64) * 64 + 64; gh = Math.ceil(h / 64) * 64 + 64;
      grab = new THREE.FramebufferTexture(gw, gh);
      grab.minFilter = grab.magFilter = THREE.LinearFilter;
      uniforms.uGrab.value = grab;
    }
    x0 = Math.min(x0, Math.max(0, sz.x - gw)); y0 = Math.min(y0, Math.max(0, sz.y - gh));
    renderer.copyFramebufferToTexture(grab, at.set(x0, y0));
    uniforms.uRect.value.set(x0, y0, 1 / gw, 1 / gh);
  };
  group.add(mesh);
  return {
    group, mesh,
    setIntensity(v) { intensity = clamp(v, 0, 1); uniforms.uIntensity.value = intensity; mesh.visible = intensity > 0.002; },
    setProgress(p2) { this.setIntensity(p2); },
    setTime(t) { auto = false; time = t; uniforms.uTime.value = t; },
    update(dt) { if (!auto || !mesh.visible) return; time += Math.min(Math.max(dt, 0), 0.1); uniforms.uTime.value = time; },
    get intensity() { return intensity; },
    uniforms,
    dispose() { geo.dispose(); mat.dispose(); if (grab) grab.dispose(); releaseNoise(false); group.removeFromParent(); },
  };
}

// ---------------------------------------------------------------------------------------------------------
export default function create({ quality = 'high' } = {}) {
  const group = new THREE.Group();
  group.name = 'fx';
  return {
    group, duration: 0,
    setProgress() {}, update() {}, dispose() {}, ready,
    createSteam: (o = {}) => createSteam({ quality, ...o }),
    applyCondensation: (t, o = {}) => applyCondensation(t, { quality, ...o }),
    createWaterRing: (o = {}) => createWaterRing({ quality, ...o }),
    createColdFog: (o = {}) => createColdFog({ quality, ...o }),
    createFrost: (o = {}) => createFrost({ quality, ...o }),
    createHeatShimmer: (o = {}) => createHeatShimmer({ quality, ...o }),
  };
}
