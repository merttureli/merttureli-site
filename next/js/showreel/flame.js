// FLAME: CHARGER's lit motor for the hero fly-in, and the smoke it leaves behind.
//
// The motor is an AeroTech G77R-7 single use (29 x 124 mm, Redline propellant). What the picture is based on
// (sources in docs/design/3d.md, "Motor flame"):
//   thrust   the RASP curve below (thrustcurve.org G77R/L, the same samples as vx/js/data/motor-g77r.js):
//            66 N at 0.06 s, rising to 99 N at 0.64 s, burnout at 1.277 s, about 80 N average
//   color    Redline burns scarlet (strontium); the core at the nozzle reads white-yellow, then orange, then
//            scarlet to crimson at the tail; no shock diamonds show at this size
//   shape    narrow at the nozzle, widest about a third down, a ragged tail; length and width follow thrust
//   smoke    white to tan, lit pink only next to the flame
//
// The flame is one camera-facing quad along the exhaust axis. Its shader draws a turbulent plume from a small
// tileable noise texture generated here (no photo textures): the noise runs down the plume, bends its centre
// line, frays its edge and tears the tail into tongues. The page is light and the canvas transparent, so the
// flame is drawn as light itself: a nearly opaque core, saturated translucent edges and a faint halo.
// The smoke is one instanced mesh of soft, noise-eroded puffs that stay where they were left in the world.
//
//   const flame = createFlame();             // flame.group sits at the nozzle, plume along -Y
//   rocketRollGroup.add(flame.group); scene.add(flame.world);
//   flame.set({ thrust: 0..1.25, ember: 0..1, time })   // thrust 1 = 80 N; 0 and ember 0 = hidden (no draws)
//   flame.light                                         // 0..: the flame's light on the rocket (rocket.glow)
//   flame.puff(worldPos, dirWorld) / flame.update(dt, nozzleWorldPos?)   // the thin wisp left after burnout; given the
//                                       nozzle, it keeps leaving from there as the rocket coasts on
//
//   const smoke = createSmoke({ scene, quality });      // in the hero canvas (one draw call, at most 180 puffs, 110 on low)
//   smoke.emit(worldPos, strength, dirWorld, lit); smoke.update(dt); smoke.active; smoke.dispose()
//     emit fills the gap since the last call with puffs along the path, so the trail is unbroken at any speed
//
// Nothing here runs on its own clock: the hero's loop calls set/update.
import * as THREE from '../three.module.min.js';

// [t s, thrust N]: the implied [0, 0] plus the 30 RASP samples, unchanged.
export const G77R = Object.freeze({
  burn: 1.277, avg: 79.64, peak: 99.309, diameter: .029, length: .124,
  curve: [[0, 0], [.01, 19.124], [.018, 15.668], [.059, 66.59], [.084, 72.35], [.122, 75.115], [.151, 77.419], [.173, 77.65],
    [.271, 85.945], [.337, 88.018], [.424, 91.935], [.475, 93.318], [.523, 94.931], [.57, 96.313], [.61, 96.313], [.644, 99.309],
    [.656, 96.774], [.728, 95.622], [.792, 94.24], [.902, 91.014], [.961, 88.479], [1.017, 88.018], [1.047, 84.562], [1.071, 81.106],
    [1.099, 76.037], [1.127, 69.355], [1.158, 61.06], [1.188, 44.931], [1.213, 30.184], [1.231, 18.203], [1.277, 0]],
});
export function thrustAt(t) {
  const c = G77R.curve;
  if (t <= 0 || t >= G77R.burn) return 0;
  let i = 1;
  while (c[i][0] < t) i++;
  const [t0, f0] = c[i - 1], [t1, f1] = c[i];
  return f0 + (f1 - f0) * (t - t0) / (t1 - t0);
}

// ------------------------------------------------------------------ noise
// One 64 px tileable texture for the flame and the smoke: three octaves of value noise per channel, each channel at
// its own scale. Seeded, so every visit (and every capture) draws the same flame.
let noiseTex = null;
function noise() {
  if (noiseTex) return noiseTex;
  const n = 64, d = new Uint8Array(n * n * 4);
  let s = 0x2f6e2b1;
  const rnd = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  for (const [ch, base] of [[0, 3], [1, 5], [2, 8]]) {
    for (let o = 0, w = .55; o < 3; o++, w *= .5) {
      const c = base << o, lat = new Float32Array(c * c);
      for (let i = 0; i < lat.length; i++) lat[i] = rnd();
      for (let y = 0; y < n; y++) {
        const fy = y / n * c, y0 = fy | 0, ty = fy - y0, sy = ty * ty * (3 - 2 * ty), ya = (y0 % c) * c, yb = ((y0 + 1) % c) * c;
        for (let x = 0; x < n; x++) {
          const fx = x / n * c, x0 = fx | 0, tx = fx - x0, sx = tx * tx * (3 - 2 * tx), xa = x0 % c, xb = (x0 + 1) % c;
          const v = (lat[ya + xa] * (1 - sx) + lat[ya + xb] * sx) * (1 - sy) + (lat[yb + xa] * (1 - sx) + lat[yb + xb] * sx) * sy;
          d[(y * n + x) * 4 + ch] += Math.round(v * w / .9625 * 255);
        }
      }
    }
  }
  for (let i = 3; i < d.length; i += 4) d[i] = 255;
  noiseTex = new THREE.DataTexture(d, n, n, THREE.RGBAFormat, THREE.UnsignedByteType);
  noiseTex.wrapS = noiseTex.wrapT = THREE.RepeatWrapping; noiseTex.magFilter = THREE.LinearFilter; noiseTex.minFilter = THREE.LinearFilter;
  noiseTex.needsUpdate = true;
  return noiseTex;
}

// ------------------------------------------------------------------ plume
// Sizes in meters (the rocket's own units). The nozzle exit of the single-use G77 is not published; the screw
// cap's bore is 17 mm, and about 13 mm is drawn. At 80 N the visible plume is about 0.42 m long (14 motor
// diameters, shorter than a scaled launch photo suggests, so it fits the phone frame) and 5 cm wide where it is
// widest; both follow sqrt(thrust).
const PLUME = { len: .52, wid: .085, nozzle: .0068 };   // the quad (at 80 N) and the nozzle radius

const VS = /* glsl */`
uniform float uLen, uWid;
varying vec2 vP;
void main() {
  vP = vec2(position.x * uWid, -position.y * uLen);                          // metres: across, along (0 at the nozzle)
  vec4 c = modelViewMatrix * vec4(0.0, position.y * uLen, 0.0, 1.0);         // on the exhaust axis
  vec3 a = normalize((modelViewMatrix * vec4(0.0, -1.0, 0.0, 0.0)).xyz);
  vec3 side = normalize(cross(a, normalize(c.xyz)) + vec3(1e-5, 0.0, 0.0));  // across the axis, facing the camera
  c.xyz += side * position.x * uWid;
  gl_Position = projectionMatrix * c;
}`;
const FS = /* glsl */`
uniform sampler2D uNoise;
uniform float uTime, uSeed, uLen, uPower, uAlpha, uEmber, uNozzle;
varying vec2 vP;
vec3 ramp(float t) {                                   // crimson > scarlet > orange > yellow > white-yellow
  vec3 c = mix(vec3(0.60, 0.03, 0.14), vec3(0.80, 0.05, 0.13), smoothstep(0.0, 0.12, t));
  c = mix(c, vec3(0.96, 0.17, 0.10), smoothstep(0.10, 0.26, t));
  c = mix(c, vec3(1.0, 0.47, 0.13), smoothstep(0.26, 0.44, t));
  c = mix(c, vec3(1.0, 0.80, 0.36), smoothstep(0.44, 0.64, t));
  return mix(c, vec3(1.0, 0.985, 0.90), smoothstep(0.64, 0.86, t));
}
void main() {
  float s = vP.y / uLen, x = vP.x, t = uTime;
  float sp = max(s, 0.0), on = step(0.0, s);
  // the noise runs down the plume, stretched along it; each side of the stream gets its own
  vec2 q = vec2(x * 21.0, vP.y * 5.5 - t * 9.0) + uSeed;
  float n1 = texture2D(uNoise, q).r;                                               // billows
  float n2 = texture2D(uNoise, q * vec2(2.1, 2.6) + vec2(0.37, -t * 6.0)).g;       // flicker
  float n3 = texture2D(uNoise, vec2(0.21 + uSeed, vP.y * 2.2 - t * 3.4)).b;        // the tail's sway
  float n4 = texture2D(uNoise, vec2(x * 38.0, vP.y * 7.0 - t * 13.0) + uSeed * 1.7).b;   // fine streaks
  float wild = smoothstep(0.02, 0.55, sp);                                         // calm at the nozzle, torn downstream
  float xc = x + (n3 - 0.5) * 0.03 * sp * sp;
  // radius: out of the nozzle, full width a quarter down, a tapered tail; the edge frays with the noise
  float R = mix(uNozzle, 0.027 * uPower, 1.0 - exp(-sp * 9.0)) * (1.0 - 0.55 * smoothstep(0.5, 1.0, sp));
  R *= 1.0 + (n1 - 0.5) * (0.25 + 1.3 * wild) + (n2 - 0.5) * (0.12 + 0.6 * wild);
  // where the plume ends: the noise tears the tail into tongues (they thin out, they do not turn to mist)
  float end = 1.0 - smoothstep(0.45, 0.95, sp + (n1 - 0.5) * 0.7 * wild + (n2 - 0.5) * 0.3 * wild);
  float rho = abs(xc) / max(R * (0.25 + 0.75 * end), 1e-4);
  float body = (1.0 - smoothstep(0.5, 1.0, rho)) * smoothstep(0.0, 0.1, end) * on;
  // temperature: white-yellow on the axis at the nozzle, cooling down the plume and out to the edge
  float T = (1.0 - pow(min(rho, 1.0), 1.6)) * exp(-sp * 2.3) * (0.5 + 0.5 * end) + (n4 - 0.5) * 0.13 * wild + (n1 - 0.5) * 0.12;
  vec3 col = ramp(clamp(T, 0.0, 1.0) * on);
  float a = body * (0.88 + 0.12 * smoothstep(0.1, 0.4, T));
  // a faint red halo around the stream, and the hot spot at the nozzle
  float halo = exp(-max(rho - 0.75, 0.0) * 2.6) * end * smoothstep(-0.02, 0.05, s) * 0.11;
  col = mix(vec3(0.93, 0.13, 0.13), col, clamp(a / max(a + halo, 1e-4), 0.0, 1.0));
  a = a + halo * (1.0 - a);
  float d2 = (x * x + vP.y * vP.y) / (uNozzle * uNozzle);
  float spot = exp(-d2 * 0.2) * uPower;
  col = mix(col, vec3(1.0, 0.97, 0.86), clamp(spot * 1.4, 0.0, 1.0));
  a = max(a, clamp(spot * 1.6, 0.0, 1.0)) * uAlpha;
  // after burnout: an ember in the throat, deep orange to red
  float em = uEmber * exp(-d2 * (0.5 + 1.2 * (1.0 - uEmber)));
  col = mix(col, mix(vec3(0.75, 0.08, 0.05), vec3(1.0, 0.55, 0.16), uEmber), clamp(em * 2.0, 0.0, 1.0) * (1.0 - uAlpha));
  a = max(a, clamp(em * 1.3, 0.0, 1.0));
  float add = 0.3 * smoothstep(0.55, 1.0, T) * uAlpha;                             // the core adds light
  gl_FragColor = vec4(col * a, a * (1.0 - add));                                   // premultiplied
}`;

// ------------------------------------------------------------------ puffs
// Smoke as soft cards that stay in the world: one instanced mesh, each puff a camera-facing quad with a
// noise-eroded edge and a lit and a shaded side. Used by the trail (createSmoke) and by the flame's last wisp.
const PUFF_VS = /* glsl */`
attribute vec4 aPos;        // world position, radius (m)
attribute vec4 aDat;        // alpha, seed, heat (pink next to the flame), tan (the smoke darkens as it thins)
varying vec2 vUv;
varying vec4 vDat;
void main() {
  vUv = position.xy; vDat = aDat;
  vec4 mv = viewMatrix * vec4(aPos.xyz, 1.0);
  mv.xy += position.xy * aPos.w;
  gl_Position = projectionMatrix * mv;
}`;
const PUFF_FS = /* glsl */`
uniform sampler2D uNoise;
varying vec2 vUv;
varying vec4 vDat;
void main() {
  // each puff looks at its own patch of the noise, turned by its seed
  float ca = cos(vDat.y * 40.0), sa = sin(vDat.y * 40.0);
  vec2 q = mat2(ca, sa, -sa, ca) * vUv * 0.2 + vec2(vDat.y, vDat.y * 1.618);
  vec3 n = texture2D(uNoise, q).rgb;
  vec3 m = texture2D(uNoise, q * 2.7 + 0.31).rgb;
  float nn = n.r * 0.6 + m.g * 0.4;
  float r = length(vUv);
  // a lumpy edge that frays more as the puff thins (vDat.w runs 0 to 1 over its life)
  float body = 1.0 - smoothstep(0.42 - 0.2 * vDat.w, 0.96, r + (nn - 0.5) * (0.9 + 0.5 * vDat.w));
  body *= 1.0 - smoothstep(0.84, 1.0, r);
  // the billows' own relief, lit from the upper left like the rocket
  vec2 g = vUv * 0.75 + (n.gb - 0.5) * 1.5 + (m.rb - 0.5) * 0.7;
  float lit = smoothstep(-0.5, 0.7, dot(g, vec2(-0.38, 0.92)));
  vec3 col = mix(mix(vec3(0.70, 0.675, 0.655), vec3(0.69, 0.63, 0.57), vDat.w), mix(vec3(1.0, 0.995, 0.985), vec3(0.96, 0.935, 0.90), vDat.w), lit);
  col = mix(col, vec3(1.0, 0.60, 0.52), vDat.z * (0.35 + 0.4 * lit));
  float a = body * vDat.x;
  gl_FragColor = vec4(col * a, a);
}`;
function createPuffs({ max = 64, renderOrder = 7 } = {}) {
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const aPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4), aDat = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
  aPos.setUsage(THREE.DynamicDrawUsage); aDat.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aPos', aPos); geo.setAttribute('aDat', aDat);
  geo.instanceCount = 0;
  const mat = new THREE.ShaderMaterial({
    vertexShader: PUFF_VS, fragmentShader: PUFF_FS, uniforms: { uNoise: { value: noise() } },
    transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'smoke'; mesh.frustumCulled = false; mesh.renderOrder = renderOrder; mesh.visible = false;
  const list = [];           // oldest first, so younger puffs draw over older ones
  // p: { x, y, z, vx, vy, vz, r0, r1, a, life, heat, age, seed, rise }
  function add(p) { if (list.length >= max) list.shift(); list.push(p); }
  function update(dt) {
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      p.age += dt;
      if (p.age >= p.life) continue;
      const drag = Math.exp(-dt * 2.4);
      p.vx *= drag; p.vy *= drag; p.vz *= drag;
      // it slows, then drifts: a slow rise and a sideways curl of its own
      const k = Math.min(1, p.age * 1.2);
      p.x += (p.vx + Math.sin(p.seed * 61 + p.age * 2.1) * .012 * k) * dt;
      p.y += (p.vy + p.rise * k) * dt;
      p.z += p.vz * dt;
      const u = p.age / p.life, r = p.r0 + (p.r1 - p.r0) * (1 - Math.exp(-p.age * 1.7));
      aPos.setXYZW(n, p.x, p.y, p.z, r);
      aDat.setXYZW(n, p.a * Math.min(1, p.age / .07) * (1 - u) ** 1.3, p.seed, p.heat * Math.exp(-p.age * 5.5), Math.min(1, u * 1.5));
      list[n++] = p;
    }
    list.length = n;
    geo.instanceCount = n; mesh.visible = n > 0;
    if (n) { aPos.needsUpdate = true; aDat.needsUpdate = true; aPos.clearUpdateRanges(); aPos.addUpdateRange(0, n * 4); aDat.clearUpdateRanges(); aDat.addUpdateRange(0, n * 4); }
    return n > 0;
  }
  function dispose() { list.length = 0; mesh.removeFromParent(); geo.dispose(); mat.dispose(); }
  return { mesh, add, update, dispose, get count() { return list.length; }, max };
}

export function createFlame({ nozzleRadius = PLUME.nozzle } = {}) {
  const group = new THREE.Group(), world = new THREE.Group();
  group.name = 'flame'; world.name = 'flame-wisp';
  const seed = Math.random();
  const U = {
    uNoise: { value: noise() }, uTime: { value: 0 }, uSeed: { value: seed }, uLen: { value: PLUME.len }, uWid: { value: PLUME.wid },
    uPower: { value: 0 }, uAlpha: { value: 0 }, uEmber: { value: 0 }, uNozzle: { value: nozzleRadius },
  };
  const mat = new THREE.ShaderMaterial({
    vertexShader: VS, fragmentShader: FS, uniforms: U, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, .07, 0, 1, .07, 0, 1, -1, 0, -1, -1, 0], 3));
  geo.setIndex([0, 2, 1, 0, 3, 2]);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 11; mesh.frustumCulled = false;
  group.add(mesh);
  // the wisp: a thin grey strand that leaves the nozzle after burnout
  const wisps = createPuffs({ max: 10, renderOrder: 8 });
  world.add(wisps.mesh);
  let wisp = null, light = 0;

  let shown = true;
  function set({ thrust = 0, ember = 0, time = 0 }) {
    const on = thrust > .002 || ember > .002;
    if (on !== shown) { shown = on; group.visible = on; }
    light = 0;
    if (!on) return;
    const k = Math.sqrt(Math.max(0, thrust)), t = time / 1000;
    U.uTime.value = t;
    U.uPower.value = .7 + .3 * Math.min(1.15, k);
    U.uLen.value = PLUME.len * Math.max(.06, k) * (1 + .035 * Math.sin(t * 41 + seed * 9) + .02 * Math.sin(t * 67));
    U.uAlpha.value = Math.min(1, thrust * 5);
    U.uEmber.value = ember;
    light = Math.min(1.25, thrust) * (.9 + .1 * Math.sin(t * 53 + seed * 5)) + .22 * ember;
  }
  // a wisp from the nozzle, drifting back along the exhaust direction; call after burnout
  function puff(pos, dir, size = .02) { wisp = { t: 0, next: 0, pos: pos.clone(), dir: dir.clone(), size }; }
  function update(dt, from = null) {
    if (wisp) {
      if (from) wisp.pos.copy(from);
      wisp.t += dt;
      while (wisp.next <= wisp.t && wisp.next < .62) {
        const f = 1 - wisp.next / .62, j = () => Math.random() - .5;
        wisps.add({
          x: wisp.pos.x, y: wisp.pos.y, z: wisp.pos.z, vx: wisp.dir.x * .1 * f + j() * .02, vy: wisp.dir.y * .1 * f + j() * .02, vz: 0,
          r0: wisp.size * .32, r1: wisp.size * (1.5 + f), a: .2 + .2 * f, life: 1.3 + .5 * Math.random(), heat: 0, age: wisp.t - wisp.next, seed: Math.random(), rise: .05,
        });
        wisp.next += .09;
      }
      if (wisp.next >= .62) wisp = null;
    }
    return wisps.update(dt) || !!wisp;
  }
  // compile the flame's programs now (compile() ignores visibility)
  function prewarm(renderer, camera, scene) { try { renderer.compile(scene, camera); } catch (e) { /* first draw compiles */ } }
  function dispose() { geo.dispose(); mat.dispose(); wisps.dispose(); group.removeFromParent(); world.removeFromParent(); }
  set({ thrust: 0 });
  return { group, world, set, puff, update, prewarm, dispose, get wisping() { return wisps.count > 0 || !!wisp; }, get light() { return light; } };
}

// ------------------------------------------------------------------ smoke
// The trail: puffs are left where the nozzle was, keep a little of the exhaust's speed, slow, billow, rise and thin
// out within LIFE seconds. They are in the hero canvas (`scene`), in front of the drift words for those seconds.
const LIFE = 2.3, JET = 0.9;

export function createSmoke({ scene, quality = 'high', max = quality === 'low' ? 110 : 180 } = {}) {
  const puffs = createPuffs({ max });
  if (scene) scene.add(puffs.mesh);
  // spacing along the path (m), below the puffs' birth radius, so the trail is one body from the nozzle on
  const gap = quality === 'low' ? .017 : .012, last = new THREE.Vector3();
  let since = 9, alive = false;
  // strength 0..1; dir: the exhaust direction in the world (a Vector3; a plain { x, y } is read as screen x, y)
  function emit(p, strength, dir, lit = 1) {
    const dx = dir.x, dy = dir.isVector3 ? dir.y : -dir.y, dz = dir.isVector3 ? dir.z : 0;
    if (since >= .13) last.copy(p);
    // The jet leaves the nozzle at JET m/s against the rocket's own speed: from a fast rocket the smoke is left
    // standing in the air, from a slow one it streams away behind the flame.
    const fwd = since > 1e-4 && since < .13 ? -((p.x - last.x) * dx + (p.y - last.y) * dy + (p.z - last.z) * dz) / since : 0;
    const back = Math.max(.12, JET * strength - Math.max(0, fwd));
    // fill the path since the last call: at most 16 puffs, the older ones already aged
    const n = Math.max(1, Math.min(16, Math.round(p.distanceTo(last) / gap)));
    for (let i = 1; i <= n; i++) {
      const f = i / n, j = () => Math.random() - .5, sp = back * (.65 + .7 * Math.random());
      puffs.add({
        x: last.x + (p.x - last.x) * f, y: last.y + (p.y - last.y) * f, z: last.z + (p.z - last.z) * f + j() * .01,
        vx: dx * sp + j() * .24, vy: dy * sp + j() * .24, vz: dz * sp,
        r0: .018 + .008 * Math.random(), r1: (.075 + .055 * Math.random()) * (.65 + .35 * strength),
        a: (.5 + .2 * Math.random()) * (.4 + .6 * strength), life: LIFE * (.72 + .28 * Math.random()), heat: lit * strength,
        age: n > 1 ? (1 - f) * since : 0, seed: Math.random(), rise: .03 + .03 * Math.random(),
      });
    }
    last.copy(p); since = 0;
  }
  function update(dt) { since += dt; alive = puffs.update(dt); return alive; }
  return { emit, update, resize() {}, dispose: puffs.dispose, get active() { return alive; }, mesh: puffs.mesh };
}
