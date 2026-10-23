/* L2 validation bench: cylinder series and domain effects (VALIDATION.md, track L2).
   Runs one cylinder case on the real engine (vx/js/lattice/lattice.js) through its public API
   and measures, from the engine's own state:
     - the force on the cylinder: the engine's per-cell momentum-exchange sums (third state
       texture, channels y z w) read back over a box around the cylinder only, so channel walls
       (Schaefer and Turek geometry) do not enter; the engine's whole-domain reduction
       (sampleForce) is recorded beside it as a cross-check;
     - the centre-line velocity behind the cylinder (recirculation length) and the density in
       front of and behind it (pressure difference), from the distributions in float32;
     - a velocity profile across the domain at a given column (inflow development check).
   Nothing in the engine is changed: two small read-only passes copy a region of the engine's
   textures (lattice.fields) into a float32 target of this module and read it back.
   Lattice units throughout: one cell, one step; rho_ref 1; c_s^2 = 1/3.
   Coefficients: C = F / (0.5 rho_ref u_in^2 D) with u_in the inflow speed (for the channel cases
   u_in is the mean velocity of the developed profile, the Schaefer and Turek reference speed). */
import * as THREE from 'three';
import { createLattice } from '../lattice/lattice.js';
import { mean, r6, analyseUnsteady, analyseSteady, centreLineStats } from './l2-analysis.js';

const DEG = Math.PI / 180;
const VERT = `precision highp float;
in vec3 position;
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const FORCE_FRAG = `precision highp float;
precision highp sampler2D;
uniform sampler2D tF2;
uniform vec2 uOff;
layout(location = 0) out vec4 o;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy) + ivec2(uOff);
  o = vec4(texelFetch(tF2, p, 0).yzw, 0.0);
}`;
/* uShift 1: the engine stores f_i - w_i (lattice.fields.storage 'f - w'), so the sum is rho - 1 */
const MACRO_FRAG = `precision highp float;
precision highp sampler2D;
uniform sampler2D tF0;
uniform sampler2D tF1;
uniform sampler2D tF2;
uniform sampler2D tCell;
uniform vec2 uOff;
uniform float uShift;
layout(location = 0) out vec4 o;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy) + ivec2(uOff);
  vec4 a = texelFetch(tF0, p, 0);
  vec4 b = texelFetch(tF1, p, 0);
  float c = texelFetch(tF2, p, 0).x;
  float sum = a.x + a.y + a.z + a.w + b.x + b.y + b.z + b.w + c;
  float dr = uShift > 0.5 ? sum : sum - 1.0;
  vec2 m = vec2(a.y - a.w + b.y - b.z - b.w + c, a.z - b.x + b.y + b.z - b.w - c);
  float solid = texelFetch(tCell, p, 0).r > 0.5 ? 1.0 : 0.0;
  o = vec4(m / (1.0 + dr), dr, solid);
}`;
const SHOW_FRAG = `precision highp float;
precision highp sampler2D;
uniform sampler2D tView;
uniform vec2 uRes;
layout(location = 0) out vec4 o;
void main() {
  vec4 c = texture(tView, gl_FragCoord.xy / uRes);
  o = vec4(mix(vec3(0.17), c.rgb, c.a), 1.0);
}`;

function createProbe(renderer) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const mk = (frag, uniforms) => new THREE.RawShaderMaterial({ vertexShader: VERT, fragmentShader: frag, glslVersion: THREE.GLSL3, depthTest: false, depthWrite: false, uniforms });
  const force = mk(FORCE_FRAG, { tF2: { value: null }, uOff: { value: new THREE.Vector2() } });
  const macro = mk(MACRO_FRAG, { tF0: { value: null }, tF1: { value: null }, tF2: { value: null }, tCell: { value: null }, uOff: { value: new THREE.Vector2() }, uShift: { value: 0 } });
  const show = mk(SHOW_FRAG, { tView: { value: null }, uRes: { value: new THREE.Vector2(1, 1) } });
  const mesh = new THREE.Mesh(geo, force);
  mesh.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(mesh);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const rts = new Map();
  function rt(w, h) {
    const k = `${w}x${h}`;
    if (!rts.has(k)) rts.set(k, new THREE.WebGLRenderTarget(w, h, { type: THREE.FloatType, format: THREE.RGBAFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false, stencilBuffer: false, generateMipmaps: false }));
    return rts.get(k);
  }
  async function run(mat, x0, y0, w, h) {
    const t = rt(w, h);
    const prev = renderer.getRenderTarget();
    mat.uniforms.uOff.value.set(x0, y0);
    mesh.material = mat;
    renderer.setRenderTarget(t);
    renderer.render(scene, cam);
    renderer.setRenderTarget(prev);
    const buf = new Float32Array(w * h * 4);
    await renderer.readRenderTargetPixelsAsync(t, 0, 0, w, h, buf);
    return buf;
  }
  return {
    /* per-cell momentum-exchange sums (Fx, Fy, Mz) since the engine's last force reduction */
    force(lat, x0, y0, w, h) {
      force.uniforms.tF2.value = lat.fields.distributions[2];
      return run(force, x0, y0, w, h);
    },
    /* (ux, uy, rho - 1, solid) per cell, float32, from the distributions */
    macro(lat, x0, y0, w, h) {
      const f = lat.fields;
      macro.uniforms.tF0.value = f.distributions[0]; macro.uniforms.tF1.value = f.distributions[1];
      macro.uniforms.tF2.value = f.distributions[2]; macro.uniforms.tCell.value = f.cells;
      macro.uniforms.uShift.value = f.storage === 'f - w' ? 1 : 0;
      return run(macro, x0, y0, w, h);
    },
    draw(texture) {
      if (!texture) return;
      const s = renderer.getDrawingBufferSize(new THREE.Vector2());
      show.uniforms.tView.value = texture; show.uniforms.uRes.value.copy(s);
      mesh.material = show;
      renderer.setRenderTarget(null);
      renderer.render(scene, cam);
    },
    dispose() { for (const t of rts.values()) t.dispose(); force.dispose(); macro.dispose(); show.dispose(); geo.dispose(); },
  };
}

/* Cylinder (and optional channel walls) mask. Cell centres inside the circle are solid. Channel walls
   are solid rows 1 and rows - 2 (the engine keeps the outer rows fluid), so the halfway walls sit at
   y = 2 and y = rows - 2 and the channel is rows - 4 cells high. */
export function cylinderMask({ cols, rows, D, cx, cy, walls = false }) {
  const R = D / 2, mask = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const dx = c + 0.5 - cx, dy = r + 0.5 - cy;
    if (dx * dx + dy * dy <= R * R) mask[r * cols + c] = 1;
  }
  if (walls) for (let c = 0; c < cols; c++) { mask[1 * cols + c] = 1; mask[(rows - 2) * cols + c] = 1; }
  return mask;
}

export async function runCase(renderer, cfg, { log = (...a) => console.log(...a), onFrame } = {}) {
  const c = Object.assign({
    name: 'case', cols: 448, rows: 192, D: 16, cx: null, cy: null, u: 0.05, re: 100,
    smag: 0.12, reg: true, machK: 2, sponge: true, positive: true, walls: false,
    steps: 40000, chunk: 50, kickDeg: 0, kickSteps: 0, mode: 'unsteady',
    avgCycles: 8, steadyTol: 2e-5, steadyWindow: 2000, minSteps: 6000, wakeEvery: 500, profileCol: null,
    maxWallS: 38 * 60, progressEvery: 2000,
  }, cfg);
  if (c.cx === null) c.cx = 8 * c.D;
  if (c.cy === null) c.cy = c.rows / 2;
  const { cols, rows, D, cx, cy, u } = c, R = D / 2;
  const lat = createLattice(renderer, { cols, rows, tier: 3, fixedGrid: true, autoResetOnNaN: false });
  const ready = await lat.ready;
  if (lat.fallback) { lat.destroy(); return { case: c.name, error: lat.fallback }; }
  if (lat.stats.precision !== 'rgba32f') { lat.destroy(); return { case: c.name, error: `probe needs rgba32f, engine runs ${lat.stats.precision}` }; }
  const probe = createProbe(renderer);
  const mask = cylinderMask({ cols, rows, D, cx, cy, walls: c.walls });
  lat.setSection({ mask, cols, rows, dCells: D, cgCell: [cx, cy] });
  lat.setSmagorinsky(c.smag); lat.setRegularised(c.reg); lat.setMachFloor(c.machK);
  lat.setStabilisers({ sponge: c.sponge, positive: c.positive, inflowNeq: !!c.inflowNeq });
  lat.setViscosity({ re: c.re, uRef: u });
  lat.setInflow(u, c.kickSteps > 0 ? c.kickDeg * DEG : 0);
  lat.reset();
  const tau0 = lat.stats.tau0, nu = (tau0 - 0.5) / 3;
  const q = 0.5 * u * u * D;

  /* force box: every fluid cell that can hold a link to the cylinder */
  const bx0 = Math.max(1, Math.floor(cx - R) - 2), bx1 = Math.min(cols - 1, Math.ceil(cx + R) + 2);
  const by0 = Math.max(c.walls ? 3 : 1, Math.floor(cy - R) - 2), by1 = Math.min(c.walls ? rows - 3 : rows - 1, Math.ceil(cy + R) + 2);
  /* centre line: the two rows whose centres bracket cy, interpolation weight wy */
  const y0 = Math.max(0, Math.min(rows - 2, Math.floor(cy - 0.5))), wy = cy - (y0 + 0.5);
  const rowSolidEnd = (r) => { let e = -1; for (let k = 0; k < cols; k++) if (mask[r * cols + k] && k < cx + D) e = k; return e + 1; };
  const rowSolidStart = (r) => { for (let k = 0; k < cols; k++) if (mask[r * cols + k] && Math.abs(k + 0.5 - cx) <= R + 1) return k; return -1; };
  const xRear = Math.max(rowSolidEnd(y0), rowSolidEnd(y0 + 1));     /* halfway wall at the rear stagnation point (cell edge) */
  const xFront = Math.min(rowSolidStart(y0), rowSolidStart(y0 + 1)); /* and at the front */
  const wx0 = Math.max(0, xFront - 4), wx1 = Math.min(cols - 1, Math.ceil(cx + R + 14 * D));

  async function centreLine() {
    const w = wx1 - wx0, b = await probe.macro(lat, wx0, y0, w, 2);
    const ux = new Float64Array(w), rho = new Float64Array(w), solid = new Uint8Array(w);
    for (let k = 0; k < w; k++) {
      ux[k] = (1 - wy) * b[k * 4] + wy * b[(w + k) * 4];
      rho[k] = (1 - wy) * b[k * 4 + 2] + wy * b[(w + k) * 4 + 2];
      solid[k] = b[k * 4 + 3] > 0.5 || b[(w + k) * 4 + 3] > 0.5 ? 1 : 0;
    }
    return centreLineStats({ ux, rho, solid, wx0, xFront, xRear, D });
  }
  async function profile(col) {
    const b = await probe.macro(lat, col, 0, 1, rows);
    const pts = [];
    for (let r = 0; r < rows; r++) if (b[r * 4 + 3] < 0.5) pts.push([r + 0.5, b[r * 4], b[r * 4 + 2]]);
    return pts;
  }

  const t0 = performance.now();
  const samples = [], wakes = [];
  let s = 0, lastLog = 0, maxBoxDiff = 0, truncated = false, kicked = c.kickSteps > 0;
  while (s < c.steps) {
    if (kicked && s >= c.kickSteps) { lat.setInflow(u, 0); kicked = false; }
    const n = Math.min(c.chunk, c.steps - s);
    lat.step(n); s += n;
    const fb = await probe.force(lat, bx0, by0, bx1 - bx0, by1 - by0);
    let fx = 0, fy = 0;
    for (let i = 0; i < fb.length; i += 4) { fx += fb[i]; fy += fb[i + 1]; }
    fx /= n; fy /= n;
    const tot = await lat.sampleForce();
    const totFx = tot ? tot.fx : NaN, totFy = tot ? tot.fy : NaN;
    if (!c.walls && Number.isFinite(totFx)) maxBoxDiff = Math.max(maxBoxDiff, Math.abs(totFx - fx) / Math.max(1e-12, Math.abs(fx)));
    samples.push({ t: s - n / 2, end: s, cd: fx / q, cl: fy / q, cdAll: totFx / q, clAll: totFy / q });
    if (!Number.isFinite(fx) || !Number.isFinite(fy)) break;
    if (c.wakeEvery > 0 && s % c.wakeEvery === 0 && s >= c.kickSteps) wakes.push({ t: s, ...(await centreLine()) });
    const wall = (performance.now() - t0) / 1000;
    if (s - lastLog >= c.progressEvery) {
      lastLog = s;
      log('L2_PROGRESS ' + JSON.stringify({ case: c.name, step: s, of: c.steps, wallS: +wall.toFixed(1), sps: Math.round(s / wall), cd: r6(fx / q), cl: r6(fy / q), lrD: wakes.length ? r6(wakes[wakes.length - 1].lrD) : null }));
      if (onFrame && s % (c.progressEvery * 5) === 0) { lat.setView('vorticity'); lat.render(); onFrame(lat, probe); }
    }
    if (c.mode === 'steady' && s >= c.minSteps && s % c.steadyWindow === 0) {
      const w1 = samples.filter((p) => p.end > s - c.steadyWindow).map((p) => p.cd);
      const w0 = samples.filter((p) => p.end > s - 2 * c.steadyWindow && p.end <= s - c.steadyWindow).map((p) => p.cd);
      const lrNow = wakes.length ? wakes[wakes.length - 1].lr : 0;
      const lrThen = wakes.find((p) => p.t === s - c.steadyWindow);
      const dLr = lrThen ? Math.abs(lrNow - lrThen.lr) / Math.max(1, lrNow) : 1;
      if (Math.abs(mean(w1) - mean(w0)) / Math.abs(mean(w1)) < c.steadyTol && dLr < 10 * c.steadyTol) break;
    }
    if (wall > c.maxWallS) { truncated = true; break; }
  }
  const wallS = (performance.now() - t0) / 1000;
  const result = {
    case: c.name, config: c, engine: { tau0: r6(tau0), nu: r6(nu), reNominal: r6(u * D / nu), precision: ready.precision, smagorinsky: lat.stats.smagorinsky, regularised: lat.stats.regularised, machK: lat.stats.machK, sponge: lat.stats.sponge, positive: lat.stats.positive, solidCells: null },
    geometry: { blockage: c.walls ? D / (rows - 4) : D / rows, heightD: (c.walls ? rows - 4 : rows) / D, upstreamD: cx / D, downstreamD: (cols - cx) / D, forceBox: [bx0, by0, bx1, by1], xFront, xRear, effectiveDCentreLine: xRear - xFront },
    steps: s, wallS: +wallS.toFixed(1), stepsPerSecond: +(s / wallS).toFixed(1), mcups: +(s * cols * rows / wallS / 1e6).toFixed(2), truncated,
    boxVsDomainMaxRelDiff: c.walls ? null : r6(maxBoxDiff),
  };
  const last = samples[samples.length - 1];
  if (c.mode === 'steady') {
    const cl1 = await centreLine();
    Object.assign(result, analyseSteady(samples, wakes, cl1, c), { dpOverRhoU2: r6(cl1.dp / (u * u)), converged: !truncated && s < c.steps });
  } else {
    Object.assign(result, analyseUnsteady(samples, { D, u, kickSteps: c.kickSteps, avgCycles: c.avgCycles }));
  }
  if (c.profileCol !== null) {
    const yw0 = c.walls ? 2 : 0, yw1 = c.walls ? rows - 2 : rows, H = yw1 - yw0;
    /* only the rows between the halfway walls (the edge rows outside the channel walls are fluid cells at rest) */
    const pts = (await profile(c.profileCol)).filter((p) => p[0] > yw0 && p[0] < yw1);
    const us = pts.map((p) => p[1]);
    const um = mean(us), umax = Math.max(...us);
    let dev = 0, l2 = 0;
    pts.forEach(([y, ux]) => { const up = 6 * um * (y - yw0) * (yw1 - y) / (H * H); dev = Math.max(dev, Math.abs(ux - up)); l2 += (ux - up) ** 2; });
    result.inletProfile = { col: c.profileCol, rows: pts.length, meanUx: r6(um), meanRhoUx: r6(pts.reduce((a, p) => a + (1 + p[2]) * p[1], 0) / pts.length), meanRho: r6(1 + mean(pts.map((p) => p[2]))), maxUx: r6(umax), maxOverMean: r6(umax / um), parabolaMaxDevOverMax: r6(dev / (1.5 * um)), parabolaRmsDevOverMax: r6(Math.sqrt(l2 / pts.length) / (1.5 * um)), points: pts.map(([y, ux, d]) => [y, r6(ux), r6(d)]) };
  }
  result.field = await lat.check();
  result.final = { cd: last ? r6(last.cd) : null, cl: last ? r6(last.cl) : null };
  const keep = Math.max(1, Math.ceil(samples.length / 3000));
  result.trace = samples.filter((p, i) => i % keep === 0).map((p) => [p.end, r6(p.cd), r6(p.cl)]);
  result.wakeTrace = wakes.filter((p, i) => i % Math.max(1, Math.ceil(wakes.length / 400)) === 0).map((p) => [p.t, r6(p.lrD), r6(p.dp)]);
  if (onFrame) { lat.setView('vorticity'); lat.render(); onFrame(lat, probe); }
  lat.destroy();
  probe.dispose();
  return result;
}
