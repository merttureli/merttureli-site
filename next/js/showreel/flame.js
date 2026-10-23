// FLAME: CHARGER's lit motor for the hero fly-in, and the optional smoke trail.
//
// The motor is an AeroTech G77R-7 single use (29 x 124 mm, Redline propellant). The flame is drawn in the
// CAD look: a few nested soft cones and a glow card, no photo textures and no particles. What it is based on
// (sources in docs/design/3d.md, "Motor flame"):
//   thrust   the RASP curve below (thrustcurve.org G77R/L, the same samples as vx/js/data/motor-g77r.js):
//            66 N at 0.06 s, rising to 99 N at 0.64 s, burnout at 1.277 s, about 80 N average
//   color    Redline burns scarlet (strontium); the core at the nozzle reads white-yellow, then orange, then
//            scarlet to crimson at the tail; no shock diamonds show at this size
//   shape    narrow at the nozzle, widest about 40% down, a pointed tail; length follows thrust
//   smoke    white to tan, lit pink only next to the flame
//
//   const flame = createFlame();             // flame.group sits at the nozzle, plume along -Y
//   rocketRollGroup.add(flame.group); scene.add(flame.world);
//   flame.set({ thrust: 0..1.25, ember: 0..1, time })   // thrust 1 = 80 N; 0 and ember 0 = hidden (no draws)
//   flame.puff(worldPos, dirWorld) / flame.update(dt)   // the thin wisp left after burnout
//
//   const smoke = createSmoke({ host, box, camera });   // #reel-smoke: a 2D layer behind the drift words
//   smoke.emit(worldPos, strength, tint); smoke.update(dt); smoke.active; smoke.dispose()
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

// ------------------------------------------------------------------ plume
// Sizes in meters (the rocket's own units). The nozzle exit of the single-use G77 is not published; about
// 11 mm is assumed for a polymer nozzle in a 29 mm case, drawn at 13 mm so the plume reads at phone size.
// Lengths are for 80 N and scale with sqrt(thrust); the outer sheath is about 14 motor diameters, shorter than a scaled launch photo suggests, so the plume stays a
// detail of the CAD model and fits the phone frame.
const NOZZLE_R = .0065;
const LAYERS = [
  // length, profile (radius in nozzle radii at 0, .12, .4, .7, 1), colors nozzle > middle > tail, alpha, additive share
  { len: .40, prof: [1.3, 2.6, 3.9, 2.9, .3], c: [0xff4a30, 0xe8162e, 0xb80c26], a: .56, add: 0, order: 1 },
  { len: .25, prof: [1.05, 1.9, 2.5, 1.7, .12], c: [0xffb048, 0xff5a2a, 0xe8202f], a: .86, add: .1, order: 2 },
  { len: .105, prof: [.9, 1.35, 1.45, .95, .06], c: [0xfffdf2, 0xffeaa8, 0xffa040], a: .97, add: .25, order: 3 },
];

const VS = /* glsl */`
uniform float uTime, uSeed, uWob;
varying float vS, vA;
varying vec3 vN, vV;
void main() {
  vS = 1.0 - uv.y; vA = uv.x;
  vec3 p = position;
  // soft flicker: the sheath breathes a little more toward the tail
  float w = 1.0 + uWob * vS * (0.6 * sin(vS * 19.0 - uTime * 31.0 + vA * 12.566 + uSeed) + 0.4 * sin(vS * 7.0 - uTime * 17.0 + uSeed * 1.7));
  p.xz *= w;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;
const FS = /* glsl */`
uniform vec3 uC0, uC1, uC2;
uniform float uAlpha, uAdd, uTime, uSeed;
varying float vS, vA;
varying vec3 vN, vV;
void main() {
  float facing = abs(dot(normalize(vN), normalize(vV)));
  float edge = smoothstep(0.0, 0.8, facing);                    // soft silhouette: a glow, not a solid
  vec3 col = vS < 0.45 ? mix(uC0, uC1, vS / 0.45) : mix(uC1, uC2, (vS - 0.45) / 0.55);
  float len = smoothstep(1.0, 0.5, vS) * smoothstep(0.0, 0.035, vS);
  float n = sin(vS * 23.0 - uTime * 29.0 + vA * 18.85 + uSeed) * sin(vS * 9.0 - uTime * 13.0 + uSeed * 2.3);
  float a = clamp(uAlpha * edge * len * (0.92 + 0.14 * n), 0.0, 1.0);
  gl_FragColor = vec4(col * a, a * (1.0 - uAdd));                // premultiplied; uAdd > 0 leans additive
}`;

function latheProfile(prof) {
  // tip (y = -1) to nozzle (y = 0), so the lathe's normals face out; radius in nozzle radii
  const at = [0, .12, .4, .7, 1], pts = [];
  const N = 24;
  for (let i = N; i >= 0; i--) {
    const s = i / N;
    let k = 0; while (k < at.length - 2 && s > at[k + 1]) k++;
    const u = (s - at[k]) / (at[k + 1] - at[k]), e = u * u * (3 - 2 * u);
    pts.push(new THREE.Vector2(prof[k] + (prof[k + 1] - prof[k]) * e, -s));
  }
  return pts;
}

function glowTexture(stops) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  for (const [o, col] of stops) r.addColorStop(o, col);
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createFlame({ nozzleRadius = NOZZLE_R } = {}) {
  const group = new THREE.Group(), world = new THREE.Group();
  group.name = 'flame'; world.name = 'flame-wisp';
  const seed = Math.random() * 10;
  const layers = LAYERS.map((L, i) => {
    const mat = new THREE.ShaderMaterial({
      vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      uniforms: {
        uTime: { value: 0 }, uSeed: { value: seed + i * 3.1 }, uWob: { value: .05 + i * .01 },
        uAlpha: { value: 0 }, uAdd: { value: L.add },
        uC0: { value: new THREE.Color().setHex(L.c[0], THREE.LinearSRGBColorSpace) },
        uC1: { value: new THREE.Color().setHex(L.c[1], THREE.LinearSRGBColorSpace) },
        uC2: { value: new THREE.Color().setHex(L.c[2], THREE.LinearSRGBColorSpace) },
      },
    });
    const mesh = new THREE.Mesh(new THREE.LatheGeometry(latheProfile(L.prof), 20), mat);
    mesh.renderOrder = 10 + L.order;
    mesh.frustumCulled = false;
    group.add(mesh);
    return { L, mesh, mat };
  });
  // the hot spot at the nozzle exit and the warm halo around it
  const glowMat = new THREE.SpriteMaterial({ map: glowTexture([[0, 'rgba(255,214,150,1)'], [.25, 'rgba(255,120,60,.55)'], [.6, 'rgba(232,40,50,.16)'], [1, 'rgba(232,40,50,0)']]), transparent: true, depthWrite: false });
  const glow = new THREE.Sprite(glowMat);
  glow.renderOrder = 9;
  group.add(glow);
  // the wisp: two soft grey cards left in the air after burnout
  const puffMat = () => new THREE.SpriteMaterial({ map: wispTex, transparent: true, depthWrite: false, opacity: 0 });
  const wispTex = glowTexture([[0, 'rgba(236,232,228,.9)'], [.45, 'rgba(214,210,206,.45)'], [1, 'rgba(210,206,202,0)']]);
  const wisps = [0, 1].map(() => { const s = new THREE.Sprite(puffMat()); s.visible = false; s.renderOrder = 8; world.add(s); return { s, age: 9, life: 1.6, v: new THREE.Vector3(), r0: .02 }; });

  let shown = true;
  function set({ thrust = 0, ember = 0, time = 0 }) {
    const on = thrust > .002 || ember > .002;
    if (on !== shown) { shown = on; group.visible = on; }
    if (!on) return;
    const k = Math.sqrt(Math.max(0, thrust));
    const t = time / 1000;
    for (const { L, mesh, mat } of layers) {
      const len = L.len * Math.max(.05, k) * (1 + .03 * Math.sin(t * 41 + mat.uniforms.uSeed.value));
      mesh.scale.set(nozzleRadius * (.75 + .25 * Math.min(1, k)), len, nozzleRadius * (.75 + .25 * Math.min(1, k)));
      mesh.visible = thrust > .002;
      mat.uniforms.uAlpha.value = L.a * Math.min(1, thrust * 1.6);
      mat.uniforms.uTime.value = t;
    }
    // glow: bright while burning; after burnout a small deep-red ember that fades
    const g = Math.min(1, thrust * 1.3);
    const size = .05 + .05 * g + .025 * ember;
    glow.scale.set(size, size, 1);
    glow.position.y = -.004 - .008 * g;
    glowMat.opacity = Math.min(1, .85 * g + .55 * ember) * (1 + .06 * Math.sin(t * 53));
    glowMat.color.setRGB(1, .55 + .45 * g, .45 + .55 * g, THREE.SRGBColorSpace);
  }
  // one wisp from the nozzle, drifting back along the exhaust direction; call after burnout
  let wi = 0;
  function puff(pos, dir, size = .02) {
    const w = wisps[wi++ % wisps.length];
    w.age = 0; w.r0 = size; w.s.visible = true; w.s.position.copy(pos);
    w.v.copy(dir).multiplyScalar(.05).add(new THREE.Vector3(.004, .012, 0));
  }
  function update(dt) {
    let any = false;
    for (const w of wisps) {
      if (w.age >= w.life) continue;
      w.age += dt; any = true;
      const u = Math.min(1, w.age / w.life);
      w.s.position.addScaledVector(w.v, dt);
      w.v.multiplyScalar(Math.exp(-dt * 1.4));
      const r = w.r0 * (1 + 3.2 * (1 - Math.exp(-w.age * 1.6)));
      w.s.scale.set(r, r * 1.15, 1);
      w.s.material.opacity = .38 * Math.min(1, w.age / .18) * (1 - u) ** 1.6;
      if (w.age >= w.life) w.s.visible = false;
    }
    return any;
  }
  // compile the flame's programs now (shown, off screen of nothing: compile() ignores visibility)
  function prewarm(renderer, camera, scene) { try { renderer.compile(scene, camera); } catch (e) { /* first draw compiles */ } }
  function dispose() {
    for (const { mesh, mat } of layers) { mesh.geometry.dispose(); mat.dispose(); }
    glowMat.map.dispose(); glowMat.dispose(); wispTex.dispose();
    for (const w of wisps) w.s.material.dispose();
    group.removeFromParent(); world.removeFromParent();
  }
  set({ thrust: 0 });
  return { group, world, set, puff, update, prewarm, dispose, get wisping() { return wisps.some(w => w.age < w.life); } };
}

// ------------------------------------------------------------------ smoke
// The #reel-smoke variant: a low-resolution 2D layer under the drift words (inside .hero__stage, z-index 0),
// so the trail never covers the text or the marquee. Puffs are soft round cards that grow, drift and thin out;
// all of them are gone within LIFE seconds, then the layer clears itself and stops drawing.
const LIFE = 4, SCALE = 3;  // seconds a puff lives; canvas pixels are 3 CSS px

export function createSmoke({ host, box, camera }) {
  const cv = document.createElement('canvas');
  cv.className = 'hero__smoke'; cv.setAttribute('aria-hidden', 'true');
  host.prepend(cv);
  const ctx = cv.getContext('2d');
  const sprite = document.createElement('canvas'); sprite.width = sprite.height = 64;
  {
    const g = sprite.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.5, 'rgba(255,255,255,.5)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  }
  // tinted copies: lit (warm white), shade (grey under-side), pink (next to the flame)
  const tint = (rgb) => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.drawImage(sprite, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = rgb; g.fillRect(0, 0, 64, 64); return c; };
  const LIT = tint('rgb(252,250,247)'), SHADE = tint('rgb(176,172,168)'), PINK = tint('rgb(255,170,170)');
  const puffs = [];
  let W = 0, H = 0, hostRect = null;
  function size() {
    const r = host.getBoundingClientRect();
    W = Math.max(1, Math.round(r.width / SCALE)); H = Math.max(1, Math.round(r.height / SCALE));
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  }
  size();
  const v = new THREE.Vector3();
  // world point -> host CSS px
  function toHost(p) {
    v.copy(p).project(camera);
    const b = box.getBoundingClientRect(); hostRect = host.getBoundingClientRect();
    return { x: b.left - hostRect.left + (v.x + 1) / 2 * b.width, y: b.top - hostRect.top + (1 - v.y) / 2 * b.height, unit: b.height };
  }
  // strength 0..1; dir: exhaust direction on screen (px vector), the puff keeps a little of it
  function emit(p, strength, dir, lit = 1) {
    const s = toHost(p);
    const u = s.unit / 777;          // puff sizes are tuned on the 390 x 844 phone frame
    puffs.push({
      x: s.x, y: s.y, vx: dir.x * 120 * u + (Math.random() - .5) * 24 * u, vy: dir.y * 120 * u + (Math.random() - .5) * 24 * u,
      r0: (8 + 4 * Math.random()) * u, r1: (150 + 90 * Math.random()) * u * (.7 + .3 * strength),
      a: .3 * strength, age: 0, lit, wind: (Math.random() - .6) * 24 * u, rise: (40 + 24 * Math.random()) * u,
    });
  }
  let drawn = false;
  function update(dt) {
    if (!puffs.length) { if (drawn) { ctx.clearRect(0, 0, W, H); drawn = false; cv.style.visibility = 'hidden'; } return false; }
    cv.style.visibility = '';
    ctx.clearRect(0, 0, W, H);
    for (let i = puffs.length - 1; i >= 0; i--) {
      const P = puffs[i];
      P.age += dt;
      if (P.age >= LIFE) { puffs.splice(i, 1); continue; }
      const damp = Math.exp(-dt * 1.8);
      P.vx = P.vx * damp; P.vy = P.vy * damp;
      P.x += (P.vx + P.wind) * dt; P.y += (P.vy - P.rise) * dt;
    }
    // shade first, then the lit body offset up a little: soft volume without lighting
    for (const pass of [SHADE, LIT, PINK]) {
      for (const P of puffs) {
        const u = P.age / LIFE, r = P.r0 + (P.r1 - P.r0) * (1 - Math.exp(-P.age * 1.25));
        let a = P.a * Math.min(1, P.age / .2) * (1 - u) ** 1.8;
        if (pass === SHADE) a *= .7;
        else if (pass === PINK) a *= .6 * P.lit * Math.exp(-P.age * 2.2);
        if (a < .004) continue;
        const oy = pass === SHADE ? r * .18 : 0;
        ctx.globalAlpha = a;
        ctx.drawImage(pass, (P.x - r) / SCALE, (P.y - r + oy) / SCALE, 2 * r / SCALE, 2 * r / SCALE);
      }
    }
    ctx.globalAlpha = 1;
    drawn = true;
    return true;
  }
  function dispose() { cv.remove(); puffs.length = 0; }
  return { emit, update, resize: size, dispose, get active() { return puffs.length > 0 || drawn; }, canvas: cv };
}
