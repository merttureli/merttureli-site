/* Lab bench for the lattice engine (vx/lab/lattice.html). Owns its renderer
   and canvas, builds analytic sections, draws lattice.texture with an overlay,
   and runs the validation gates headless:
     ?validate=cylinder   cylinder D 24 cells in 512 x 192 at Re 100 (FIELD.md section 4)
     ?validate=stability  rocket stand-in, tier 3 grid, alpha 15 deg, u_in 0.10, Re 3000
     ?validate=bench      steps per second at tiers 3, 2 and 1
     ?validate=destroy    counts targets, materials, textures and programs before and after destroy()
   Each writes JSON into <pre id="validate"> and to console.log with the prefix
   LATTICE_VALIDATE. Options: &steps=N, &re=N, &reg=1, &alpha=deg, &u=lu, &neq=1 (stability: inflow
   cells at the neighbour density).
   Nothing here listens to the pointer for the flow; the controls are inputs. */
import * as THREE from 'three';
import { bus } from '../core/bus.js';
import { governor } from '../core/governor.js';
import { createLattice, TIERS, VIEWS, RE_TARGET, U_REF, SMAGORINSKY_C, MACH_FLOOR } from './lattice.js';

const DEG = Math.PI / 180;

/* ------------------------------------------------------------ sections */
/* The analytic rocket stand-in (EST: a lab shape, not the CAD section; the page
   uses vx/js/geom). Proportions from the CAD assembly: length over diameter
   1181 / 68 = 17.4, ogive nose 232 / 68 = 3.41 D, fin root chord 85.0 / 68 =
   1.25 D, fin span 55 / 68 = 0.81 D, fin trailing edge 24.5 / 68 = 0.36 D ahead
   of the tail (CAD). Leading-edge sweep 0.6 root chords and tip chord 0.45 root
   chords are EST. The body spans 66 percent of the width with the nose at
   0.12 cols and the axis at mid height, as geometry.buildSection does. CG at
   22 in from the nose (PAGE) on the CAD length: 0.5588 / 1.1809 = 0.473 L. */
export const ROCKET = Object.freeze({ lOverD: 1181 / 68, noseD: 232 / 68, rootD: 85 / 68, spanD: 55 / 68, teFromTailD: 24.5 / 68, sweepRoot: 0.6, tipRoot: 0.45, cgL: 0.5588 / 1.1809 });
export function rocketSection({ cols, rows }) {
  const L = 0.66 * cols, x0 = 0.12 * cols, D = L / ROCKET.lOverD, R = D / 2, Ln = ROCKET.noseD * D;
  const axis = rows / 2;
  const rho = (R * R + Ln * Ln) / (2 * R);              /* tangent ogive radius */
  const cr = ROCKET.rootD * D, span = ROCKET.spanD * D, sweep = ROCKET.sweepRoot * cr, ct = ROCKET.tipRoot * cr;
  const te = x0 + L - ROCKET.teFromTailD * D, le = te - cr;
  const radius = (dx) => (dx < 0 || dx > L ? -1 : dx < Ln ? Math.sqrt(Math.max(0, rho * rho - (Ln - dx) * (Ln - dx))) + R - rho : R);
  const mask = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    const y = r + 0.5, ay = Math.abs(y - axis);
    for (let c = 0; c < cols; c++) {
      const x = c + 0.5;
      let solid = ay <= radius(x - x0);
      if (!solid) {
        const yy = ay - R;                              /* height above the body surface */
        if (yy >= 0 && yy <= span) {
          const t = yy / span, xx = x - le;
          solid = xx >= sweep * t && xx <= cr + (sweep + ct - cr) * t;
        }
      }
      if (solid) mask[r * cols + c] = 1;
    }
  }
  return { mask, cols, rows, dCells: D, cgCell: [x0 + ROCKET.cgL * L, axis], xNose: x0, length: L, label: 'ROCKET STAND-IN' };
}
/* Flat plate, chord 0.2 cols, two cells thick, centre at 0.38 cols. The
   incidence phi turns the chord to (cos phi, -sin phi): the same sense as alpha.
   Moment centre at the quarter chord. */
export function plateSection({ cols, rows, incidenceDeg = 0 }) {
  const c = 0.2 * cols, t = 2, cx = 0.38 * cols, cy = rows / 2, p = incidenceDeg * DEG;
  const ax = Math.cos(p), ay = -Math.sin(p);
  const mask = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
    const dx = k + 0.5 - cx, dy = r + 0.5 - cy;
    const s = dx * ax + dy * ay, n = -dx * ay + dy * ax;
    if (Math.abs(s) <= c / 2 && Math.abs(n) <= t / 2) mask[r * cols + k] = 1;
  }
  return { mask, cols, rows, dCells: c, cgCell: [cx - ax * c / 4, cy - ay * c / 4], xNose: cx - ax * c / 2, length: c, label: 'FLAT PLATE' };
}
/* Cylinder; by default D = rows / 8 (12.5 percent blockage) at 0.25 cols. */
export function cylinderSection({ cols, rows, d = rows / 8, cx = 0.25 * cols, cy = rows / 2 }) {
  const R = d / 2, mask = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
    const dx = k + 0.5 - cx, dy = r + 0.5 - cy;
    if (dx * dx + dy * dy <= R * R) mask[r * cols + k] = 1;
  }
  return { mask, cols, rows, dCells: d, cgCell: [cx, cy], xNose: cx - R, length: d, label: 'CYLINDER' };
}

/* ------------------------------------------------------------- display */
/* Draws lattice.texture to the lab canvas as stored (display-referred values,
   no colour conversion) and hatches the solid where the view's alpha is 0. */
const DISPLAY_VERT = `precision highp float;
in vec3 position;
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const DISPLAY_FRAG = `precision highp float;
precision highp sampler2D;
uniform sampler2D tView;
uniform vec2 uRes;
uniform float uDpr;
layout(location = 0) out vec4 o;
void main() {
  vec4 c = texture(tView, gl_FragCoord.xy / uRes);
  float h = step(0.78, fract((gl_FragCoord.x + gl_FragCoord.y) / (6.0 * uDpr)));
  vec3 body = mix(vec3(0.169), vec3(0.271), h);   /* ink-700 #2B2B2B with ink-600 #454545 hatching */
  o = vec4(mix(body, c.rgb, c.a), 1.0);
}`;
function createDisplay(renderer) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const mat = new THREE.RawShaderMaterial({
    vertexShader: DISPLAY_VERT, fragmentShader: DISPLAY_FRAG, glslVersion: THREE.GLSL3, depthTest: false, depthWrite: false,
    uniforms: { tView: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uDpr: { value: 1 } },
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(mesh);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  return {
    draw(texture) {
      if (!texture) return;
      const s = renderer.getDrawingBufferSize(new THREE.Vector2());
      mat.uniforms.tView.value = texture;
      mat.uniforms.uRes.value.copy(s);
      mat.uniforms.uDpr.value = renderer.getPixelRatio();
      renderer.setRenderTarget(null);
      renderer.render(scene, cam);
    },
    dispose() { geo.dispose(); mat.dispose(); },
  };
}

/* --------------------------------------------------------- validation */
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
const yieldTask = () => new Promise((r) => setTimeout(r, 0));
function mean(a) { return a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN; }
/* fixed decimals as a number; null for null, undefined or a non-finite value */
const round = (v, d) => (v === null || v === undefined || !Number.isFinite(v) ? null : +v.toFixed(d));

/* Cylinder gate. A 4 degree inflow for the first 1,500 steps breaks the
   symmetry so the shedding starts inside the run (stated in the result). */
export async function validateCylinder(renderer, { steps = 20000, chunk = 50, onProgress, onFrame, smagorinsky = SMAGORINSKY_C } = {}) {
  const cols = 512, rows = 192, D = 24, u = 0.05, re = 100;
  const KICK_STEPS = 1500, KICK_DEG = 4;
  const lat = createLattice(renderer, { cols, rows, tier: 3, autoResetOnNaN: false });
  await lat.ready;
  if (lat.fallback) { lat.destroy(); return { case: 'cylinder', error: lat.fallback }; }
  const cx = 128, cy = rows / 2 + 0.3;
  lat.setSection(cylinderSection({ cols, rows, d: D, cx, cy }));
  lat.setSmagorinsky(smagorinsky);
  lat.setViscosity({ re, uRef: u });
  lat.setInflow(u, KICK_DEG * DEG);
  lat.reset();
  const t0 = performance.now();
  const samples = [];
  for (let s = 0; s < steps; s += chunk) {
    if (s >= KICK_STEPS) lat.setInflow(u, 0);
    lat.step(Math.min(chunk, steps - s));
    const f = await lat.sampleForce();
    if (f && f.finite !== undefined) samples.push({ t: f.step - f.steps / 2, end: f.step, fx: f.fx, fy: f.fy, finite: f.finite });
    if ((s / chunk) % 10 === 0) { lat.render(); onFrame?.(lat); onProgress?.(s + chunk, steps); await yieldTask(); }
  }
  const wall = (performance.now() - t0) / 1000;
  const q = 0.5 * u * u;
  const avgFrom = steps - Math.min(5000, Math.floor(steps / 4));
  const tail = samples.filter((p) => p.end > avgFrom && p.t >= KICK_STEPS);
  const cd = mean(tail.map((p) => p.fx)) / (q * D);
  const cdStd = Math.sqrt(mean(tail.map((p) => (p.fx / (q * D) - cd) ** 2)));
  const liftFrom = Math.max(KICK_STEPS + 2000, Math.floor(steps * 0.4));
  const lift = samples.filter((p) => p.t >= liftFrom);
  const fyMean = mean(lift.map((p) => p.fy));
  const ups = [];
  for (let i = 1; i < lift.length; i++) {
    const a = lift[i - 1].fy - fyMean, b = lift[i].fy - fyMean;
    if (a < 0 && b >= 0) ups.push(lift[i - 1].t + (lift[i].t - lift[i - 1].t) * (-a / (b - a)));
  }
  const period = ups.length > 1 ? (ups[ups.length - 1] - ups[0]) / (ups.length - 1) : NaN;
  const st = D / (period * u);
  const clTail = samples.filter((p) => p.end > avgFrom).map((p) => p.fy / (q * D));
  const clAmp = clTail.length ? (Math.max(...clTail) - Math.min(...clTail)) / 2 : NaN;
  const finite = samples.every((p) => p.finite);
  const probe = await lat.check();
  const result = {
    case: 'cylinder', grid: [cols, rows], dCells: D, centre: [cx, cy], uIn: u, re, tau0: +lat.stats.tau0.toFixed(5), smagorinsky,
    regularised: lat.stats.regularised, positivity: lat.stats.positive, absorbingEdges: lat.stats.sponge, machFloor: lat.stats.machK,
    precision: lat.stats.precision, steps, sampleWindowSteps: chunk,
    perturbation: `alpha ${KICK_DEG} deg for the first ${KICK_STEPS} steps`,
    cd: +cd.toFixed(4), cdStd: +cdStd.toFixed(4), cdWindow: [avgFrom, steps],
    st: +st.toFixed(4), periodSteps: +period.toFixed(1), liftCrossings: ups.length, liftWindow: [liftFrom, steps], clAmplitude: +clAmp.toFixed(4),
    literature: { cd: [1.35, 1.55], st: [0.16, 0.18], note: '2D, Re 100, about 12 percent blockage (FIELD.md section 4)' },
    cdInRange: cd >= 1.35 && cd <= 1.55, stInRange: st >= 0.16 && st <= 0.18,
    finite, field: probe, wallSeconds: +wall.toFixed(1), stepsPerSecond: Math.round(steps / wall),
    liftTrace: samples.filter((p, i) => i % 4 === 3).map((p) => [Math.round(p.t), +(p.fy / (q * D)).toFixed(3)]),
  };
  lat.destroy();
  return result;
}

/* Stability gate: the rocket stand-in at the tier 3 grid. */
export async function validateStability(renderer, { steps = 20000, re = RE_TARGET, uIn = U_REF, alphaDeg = 15, reg = true, machK = null, positive = true, sponge = true, inflowNeq = false, tier = 3, chunk = 100, checkEvery = 1000, onProgress, onFrame } = {}) {
  const lat = createLattice(renderer, { tier, autoResetOnNaN: false });
  await lat.ready;
  if (lat.fallback) { lat.destroy(); return { case: 'stability', error: lat.fallback }; }
  lat.setSection(rocketSection);
  lat.setViscosity({ re, uRef: U_REF });
  lat.setRegularised(reg);
  if (machK !== null && Number.isFinite(machK)) lat.setMachFloor(machK);
  lat.setStabilisers({ positive, sponge, inflowNeq });
  lat.setInflow(uIn, alphaDeg * DEG);
  lat.reset();
  const t0 = performance.now();
  const checks = [];
  let failedAt = null;
  for (let s = 0; s < steps; s += chunk) {
    lat.step(Math.min(chunk, steps - s));
    const done = Math.min(steps, s + chunk);
    if (done % checkEvery === 0 || done === steps) {
      const c = await lat.check();
      const f = await lat.sampleForce();
      checks.push({ step: done, bad: c ? c.bad : null, maxSpeed: c ? +c.maxSpeed.toFixed(4) : null, maxDrho: c ? +c.maxDrho.toFixed(4) : null, cn: f ? round(f.cn, 3) : null, cm: f ? round(f.cm, 3) : null });
      lat.render(); onFrame?.(lat); onProgress?.(done, steps);
      if (!c || c.bad > 0) { failedAt = done; break; }
      await yieldTask();
    }
  }
  const wall = (performance.now() - t0) / 1000;
  const last = checks[checks.length - 1] || {};
  const g = lat.stats;
  const result = {
    case: 'stability', grid: g.grid, tier, shape: 'rocket stand-in', dCells: +g.dCells.toFixed(2), alphaDeg, uIn, re: +g.re.toFixed(0), tau0: +g.tau0.toFixed(5),
    smagorinsky: g.smagorinsky, regularised: reg, machFloor: g.machK, positivity: g.positive, absorbingEdges: g.sponge, inflowNeq: g.inflowNeq, precision: g.precision, stepsRequested: steps, stepsRun: last.step || 0,
    nanFree: failedAt === null && last.bad === 0, failedAt, checks, wallSeconds: +wall.toFixed(1), stepsPerSecond: Math.round((last.step || 0) / wall),
    force: lat.force ? { cn: round(lat.force.cn, 4), cm: round(lat.force.cm, 4), cd: round(lat.force.cd, 4), xcpCells: round(lat.force.xcpCells, 1), cgCell: +(0.12 * g.grid[0] + ROCKET.cgL * 0.66 * g.grid[0]).toFixed(1), note: '2D section values; edge confinement dominates above about 5 deg (lattice.js header, EDGES)' } : null,
  };
  lat.destroy();
  return result;
}

/* Step rate per tier, two ways. Throughput: step(n) then lattice.sync() (a
   fenced readback), doubling n until one batch takes 2 s. Frame loop: frame()
   plus a draw of lattice.texture to the canvas every animation frame for a
   fixed wall time, then a sync so queued work is counted. Software GL is not
   representative of a GPU. */
export async function validateBench(renderer, { seconds = 4, onProgress, draw } = {}) {
  const rows = [];
  for (const tier of [3, 2, 1]) {
    const lat = createLattice(renderer, { tier, autoResetOnNaN: false });
    await lat.ready;
    if (lat.fallback) { lat.destroy(); rows.push({ tier, error: lat.fallback }); continue; }
    lat.setSection(rocketSection);
    lat.setInflow(0.08, 8 * DEG);
    lat.reset();
    lat.step(4); await lat.sync();
    let n = 8, sps = 0;
    for (;;) {
      const t0 = performance.now();
      lat.step(n);
      await lat.sync();
      const dt = performance.now() - t0;
      sps = n * 1000 / dt;
      if (dt > 2000 || n > 20000) break;
      n *= 2;
    }
    const s0 = lat.stats.steps, f0 = performance.now();
    let frames = 0;
    while (performance.now() - f0 < seconds * 1000) { lat.frame(1 / 60); draw?.(lat); frames++; await nextFrame(); }
    await lat.sync();
    const f1 = performance.now();
    rows.push({
      tier, grid: lat.stats.grid, stepsPerFrameTier: TIERS[tier].steps, throughputStepsPerSecond: Math.round(sps), throughputBatch: n,
      loopFrames: frames, loopMsPerFrame: +((f1 - f0) / frames).toFixed(1), loopStepsPerSecond: Math.round((lat.stats.steps - s0) * 1000 / (f1 - f0)),
      shedInLoop: lat.stats.shed, precision: lat.stats.precision,
    });
    onProgress?.(rows.length, 3);
    lat.destroy();
  }
  const ctx = renderer.getContext(), dbg = ctx.getExtension('WEBGL_debug_renderer_info');
  return { case: 'bench', renderer: dbg ? ctx.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown', note: 'software GL (SwiftShader) is not representative of a GPU', tiers: rows };
}

/* destroy(): resources the lattice holds and what three reports before and after. */
export async function validateDestroy(renderer) {
  const info = () => ({ textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries, programs: renderer.info.programs ? renderer.info.programs.length : null });
  const before = info();
  const lat = createLattice(renderer, { tier: 2, autoResetOnNaN: false });
  await lat.ready;
  lat.setSection(rocketSection);
  lat.setInflow(0.08, 10 * DEG);
  lat.reset();
  for (let i = 0; i < 6; i++) { lat.frame(1 / 60); await nextFrame(); }
  await lat.sampleForce();
  await lat.check();
  const held = lat.resources();
  const during = info();
  lat.destroy();
  lat.destroy();
  await nextFrame();
  const after = info();
  return {
    case: 'destroy', held, before, during, after,
    released: after.textures === before.textures && after.geometries === before.geometries && after.programs === before.programs,
    afterDestroy: { texture: lat.texture, resources: lat.resources() },
  };
}

/* ---------------------------------------------------------------- lab */
export function mountLab(doc = document) {
  const $ = (id) => doc.getElementById(id);
  const query = new URLSearchParams(location.search);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const validate = query.get('validate');
  const status = $('status');
  const stage = $('stage'), glCanvas = $('gl'), overlay = $('overlay'), note = $('note'), readout = $('readout'), chart = $('chart'), pre = $('validate');
  const octx = overlay.getContext('2d'), cctx = chart.getContext('2d');

  /* renderer on our own WebGL2 context, so a missing context never throws inside three */
  let gl = null, renderer = null;
  try { gl = glCanvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: true }); } catch { gl = null; }
  if (gl) {
    try { renderer = new THREE.WebGLRenderer({ canvas: glCanvas, context: gl, antialias: false }); renderer.autoClear = false; } catch { renderer = null; }
  }
  const display = renderer ? createDisplay(renderer) : null;

  if (validate) return runValidation(validate);

  /* ---------- state ---------- */
  const state = {
    shape: query.get('shape') || 'rocket', alphaDeg: query.has('alpha') ? Number(query.get('alpha')) : 10, uIn: query.has('u') ? Number(query.get('u')) : 0.08,
    re: query.has('re') ? Number(query.get('re')) : RE_TARGET, rate: 0, incidence: 0, view: VIEWS.includes(query.get('view')) ? query.get('view') : 'smoke',
    tierMode: query.has('tier') ? String(query.get('tier')) : 'auto', spf: 0, running: !reduced, reg: query.get('reg') !== '0', smag: true,
  };
  const startTier = state.tierMode === 'auto' ? (reduced ? 1 : Math.max(1, governor.tier)) : Number(state.tierMode);
  const lattice = createLattice(renderer, { tier: startTier, precision: query.get('precision') === 'half' ? 'half' : undefined });
  window.lattice = lattice;
  const builder = ({ cols, rows }) => (state.shape === 'plate' ? plateSection({ cols, rows, incidenceDeg: state.incidence })
    : state.shape === 'cylinder' ? cylinderSection({ cols, rows }) : rocketSection({ cols, rows }));
  let current = null;
  const sectionNow = () => { const g = lattice.grid; current = builder({ cols: g.cols || 1024, rows: g.rows || 320 }); return current; };

  /* ---------- layout ---------- */
  let box = { x: 0, y: 0, w: 1, h: 1, W: 1, H: 1 }, dpr = 1;
  function layout() {
    const g = lattice.grid.cols ? lattice.grid : { cols: 1024, rows: 320 };
    const W = stage.clientWidth;
    const narrow = W < 600;
    const ml = narrow ? 30 : 64, mr = narrow ? 12 : 24, mt = narrow ? 30 : 40, mb = narrow ? 30 : 40;
    const w = Math.max(120, W - ml - mr), h = Math.round(w * g.rows / g.cols);
    const H = h + mt + mb;
    stage.style.height = `${H}px`;
    box = { x: ml, y: mt, w, h, W, H };
    dpr = Math.min(2, devicePixelRatio || 1);
    Object.assign(glCanvas.style, { left: `${ml}px`, top: `${mt}px`, width: `${w}px`, height: `${h}px` });
    if (renderer) { renderer.setPixelRatio(dpr); renderer.setSize(w, h, false); }
    overlay.width = Math.round(W * dpr); overlay.height = Math.round(H * dpr);
    overlay.style.width = `${W}px`; overlay.style.height = `${H}px`;
    const cw = chart.clientWidth || W;
    chart.width = Math.round(cw * dpr); chart.height = Math.round(120 * dpr);
    draw();
  }

  /* ---------- drawing ---------- */
  const css = getComputedStyle(doc.documentElement);
  const tok = (n, f) => (css.getPropertyValue(n).trim() || f);
  const C = { paper: '#FFFFFF', p90: 'rgba(255,255,255,.90)', p70: 'rgba(255,255,255,.70)', p45: 'rgba(255,255,255,.45)', p18: 'rgba(255,255,255,.18)', livery: tok('--livery', '#D63B08'), ink: '#0A0A0A' };
  const MONO = `10px ${tok('--font-mono', 'monospace')}`;
  function gx(x) { const g = lattice.grid; return box.x + x / g.cols * box.w; }
  function gy(y) { const g = lattice.grid; return box.y + box.h - y / g.rows * box.h; }
  function drawOverlay() {
    const g = lattice.grid;
    octx.setTransform(dpr, 0, 0, dpr, 0, 0);
    octx.clearRect(0, 0, box.W, box.H);
    octx.font = MONO; octx.textBaseline = 'alphabetic'; octx.lineWidth = 1;
    /* frame and ticks every 64 cells */
    octx.strokeStyle = C.p18; octx.strokeRect(box.x - 0.5, box.y - 0.5, box.w + 1, box.h + 1);
    if (!g.cols) return;
    octx.fillStyle = C.p70; octx.strokeStyle = C.p45;
    const step = box.w < 500 ? 256 : 128;
    for (let c = 0; c <= g.cols; c += step) {
      const x = gx(c);
      octx.beginPath(); octx.moveTo(x, box.y + box.h + 2); octx.lineTo(x, box.y + box.h + 7); octx.stroke();
      octx.textAlign = c === 0 ? 'left' : c >= g.cols ? 'right' : 'center';
      octx.fillText(String(c), x, box.y + box.h + 19);
    }
    octx.textAlign = 'left';
    octx.fillText(`${g.cols} x ${g.rows} CELLS`, box.x, box.y - 12);
    octx.textAlign = 'right';
    octx.fillText(`${state.view.toUpperCase()} / SRC: SIM`, box.x + box.w, box.y - 12);
    /* inflow arrow in the left margin */
    const a = lattice.stats.alpha || 0, L = Math.min(40, box.x - 8);
    const cx = box.x / 2 + 2, cy = box.y + box.h / 2;
    const dx = Math.cos(a) * L / 2, dy = -Math.sin(a) * L / 2;
    octx.strokeStyle = C.p90; octx.fillStyle = C.p90; octx.lineWidth = 1.5;
    octx.beginPath(); octx.moveTo(cx - dx, cy - dy); octx.lineTo(cx + dx, cy + dy); octx.stroke();
    const hx = cx + dx, hy = cy + dy, ang = Math.atan2(dy, dx);
    octx.beginPath(); octx.moveTo(hx, hy); octx.lineTo(hx - 7 * Math.cos(ang - 0.45), hy - 7 * Math.sin(ang - 0.45)); octx.lineTo(hx - 7 * Math.cos(ang + 0.45), hy - 7 * Math.sin(ang + 0.45)); octx.closePath(); octx.fill();
    octx.lineWidth = 1; octx.textAlign = 'center'; octx.fillStyle = C.p70;
    octx.fillText('U_IN', cx, cy - 24);
    octx.fillText(`${(lattice.stats.alphaDeg || 0).toFixed(1)}°`, cx, cy + 32);
    if (!current) return;
    /* CG: circle with alternating filled quadrants */
    const [cgx, cgy] = current.cgCell;
    const X = gx(cgx), Y = gy(cgy), r = 6;
    octx.fillStyle = C.ink; octx.beginPath(); octx.arc(X, Y, r, 0, 2 * Math.PI); octx.fill();
    octx.fillStyle = C.paper;
    for (const q0 of [0, Math.PI]) { octx.beginPath(); octx.moveTo(X, Y); octx.arc(X, Y, r, q0, q0 + Math.PI / 2); octx.closePath(); octx.fill(); }
    octx.strokeStyle = C.paper; octx.beginPath(); octx.arc(X, Y, r, 0, 2 * Math.PI); octx.stroke();
    const roomy = box.w >= 600;
    octx.textAlign = 'center'; octx.fillStyle = C.p90;
    const labelAbove = gy(cgy) - Math.max(16, (current.dCells / g.rows) * box.h * 0.5 + 12);
    if (roomy) octx.fillText(state.shape === 'rocket' ? 'CG' : 'REF', X, labelAbove);
    /* CP ring and resultant from the lattice */
    const f = lattice.force;
    if (f && f.finite && f.xcpCells !== null && f.xcpCells > -g.cols && f.xcpCells < 2 * g.cols) {
      const px = gx(clampN(f.xcpCells, 0, g.cols)), py = gy(cgy);
      octx.strokeStyle = C.livery; octx.lineWidth = 2;
      octx.beginPath(); octx.arc(px, py, 7, 0, 2 * Math.PI); octx.stroke();
      const mag = Math.hypot(f.fx, f.fy) || 1, k = Math.min(box.h * 0.42, 18 + 26 * Math.abs(f.cn));
      const ex = px + (f.fx / mag) * k, ey = py - (f.fy / mag) * k;
      octx.beginPath(); octx.moveTo(px, py); octx.lineTo(ex, ey); octx.stroke();
      octx.lineWidth = 1; octx.fillStyle = C.p90; octx.textAlign = 'center';
      if (roomy) octx.fillText('CP', px, py + (f.fy > 0 ? 24 : -16));
    }
    /* reference length bar */
    const dpx = current.dCells / g.cols * box.w;
    const bx = box.x + box.w - dpx - 2, by = box.y + box.h + 26;
    octx.strokeStyle = C.p70; octx.beginPath(); octx.moveTo(bx, by - 3); octx.lineTo(bx, by + 3); octx.moveTo(bx, by); octx.lineTo(bx + dpx, by); octx.moveTo(bx + dpx, by - 3); octx.lineTo(bx + dpx, by + 3); octx.stroke();
    octx.textAlign = 'right'; octx.fillStyle = C.p70;
    octx.fillText(`${state.shape === 'plate' ? 'C' : 'D'} ${current.dCells.toFixed(1)} CELLS`, bx - 8, by + 4);
  }
  const clampN = (v, a, b) => Math.min(b, Math.max(a, v));

  /* strip chart: c_n and c_m (c_l and c_d for the cylinder), 10 Hz samples */
  const hist = [];
  let lastForceStep = -1;
  function pushForce() {
    const f = lattice.force;
    if (!f || f.step === lastForceStep) return;
    lastForceStep = f.step;
    const a = state.shape === 'cylinder' ? f.cl : f.cn, b = state.shape === 'cylinder' ? f.cd : f.cm;
    if (Number.isFinite(a) && Number.isFinite(b)) { hist.push([a, b]); if (hist.length > 240) hist.shift(); }
  }
  function drawChart() {
    const W = chart.width / dpr, H = chart.height / dpr;
    cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cctx.clearRect(0, 0, W, H);
    cctx.font = MONO; cctx.lineWidth = 1;
    const names = state.shape === 'cylinder' ? ['C_L', 'C_D'] : ['C_N', 'C_M'];
    let lo = -0.5, hi = 0.5;
    for (const [a, b] of hist) { lo = Math.min(lo, a, b); hi = Math.max(hi, a, b); }
    const pad = (hi - lo) * 0.1; lo -= pad; hi += pad;
    const narrow = W < 560;
    const top = narrow ? 34 : 20, bottom = H - 8, left = 0, right = W;
    const yv = (v) => bottom - (v - lo) / (hi - lo) * (bottom - top);
    cctx.strokeStyle = C.p18;
    cctx.beginPath(); cctx.moveTo(left, yv(0)); cctx.lineTo(right, yv(0)); cctx.stroke();
    cctx.textAlign = 'left';
    let lx = left;
    for (const [i, color] of [[0, C.p90], [1, C.livery]]) {
      cctx.fillStyle = color; cctx.fillRect(lx, 6, 12, 2);
      cctx.fillStyle = C.p90; cctx.fillText(names[i], lx + 18, 11);
      lx += 18 + cctx.measureText(names[i]).width + 16;
    }
    cctx.fillStyle = C.p70;
    cctx.fillText(narrow ? `/ LAST ${(hist.length / 10).toFixed(0)} S / SIM` : `/ LAST ${(hist.length / 10).toFixed(0)} S OF READBACKS AT 10 HZ / SRC: SIM`, lx, 11);
    cctx.textAlign = narrow ? 'left' : 'right';
    cctx.fillText(`RANGE ${hi.toFixed(2)} / ${lo.toFixed(2)}`, narrow ? left : right, narrow ? 25 : 11);
    const n = 240;
    for (const [idx, color] of [[0, C.p90], [1, C.livery]]) {
      cctx.strokeStyle = color; cctx.lineWidth = 2; cctx.beginPath();
      hist.forEach((p, i) => { const x = left + (i + n - hist.length) / (n - 1) * (right - left); const y = yv(p[idx]); if (i) cctx.lineTo(x, y); else cctx.moveTo(x, y); });
      cctx.stroke();
    }
    cctx.lineWidth = 1;
  }

  const fmt = (v, d = 3) => (v === null || v === undefined || !Number.isFinite(v) ? '–' : v.toFixed(d));
  let lastReadout = 0, lastAria = 0;
  function drawReadout(force = false) {
    const now = performance.now();
    if (!force && now - lastReadout < 250) return;
    lastReadout = now;
    const s = lattice.stats, f = lattice.force, g = lattice.grid;
    const d = current ? current.dCells : 0;
    const xcpCal = f && f.xcpCells !== null && current ? (f.xcpCells - current.xNose) / d : null;
    const lines = [
      `ENGINE    D2Q9 / ONE PULL PASS / MRT x3 / ${s.precision.toUpperCase()}`,
      `MODEL     BGK + SMAGORINSKY C ${s.smagorinsky.toFixed(2)} (STD HOU 1996)${s.regularised ? ' / REGULARISED (STD LATT 2006)' : ''}`,
      `STABILISE ${[s.positive ? 'POSITIVITY (STD BROWNLEE 2007)' : '', s.machK > 0 ? 'TAU FLOOR ABOVE |U| 0.15 (EST)' : '', s.sponge ? 'ABSORBING EDGES (EST)' : ''].filter(Boolean).join(' / ') || 'OFF'}`,
      `EDGES     INFLOW ${s.inflowNeq ? 'U_IN AT THE NEIGHBOUR DENSITY (STD GUO 2002)' : 'EQUILIBRIUM AT RHO 1 AND U_IN'} / OUTFLOW ZERO GRADIENT, RHO 1`,
      `GRID      ${g.cols} x ${g.rows} CELLS / DYE ${s.dye[0]} x ${s.dye[1]} / TIER ${lattice.tier} / ${lattice.stepsPerFrame || (TIERS[lattice.tier] || TIERS[0]).steps} STEPS PER FRAME${lattice.stepsPerFrame ? ' (SET)' : ''}`,
      `RATE      ${s.stepsPerSecond} STEPS/S / ${fmt(s.msPerFrame, 1)} MS PER FRAME / ${fmt(s.issueMs, 2)} MS ISSUE / ${s.shed} SHED (SIM)`,
      `FLOW      U_IN ${fmt(s.uIn)} LU${Math.abs(s.uNow - s.uIn) > 5e-4 ? ` (RAMPING, ${fmt(s.uNow)})` : ''} / ALPHA ${fmt(s.alphaDeg, 1)} DEG / TAU0 ${fmt(s.tau0, 5)}${s.tauNow > s.tau0 + 1e-5 ? ` (START-UP ${fmt(s.tauNow, 3)})` : ''} / NU ${fmt(s.nu, 5)} / RE ${fmt(s.re, 0)} (SIM)`,
      `SECTION   ${current ? current.label : '–'} / D ${fmt(d, 1)} CELLS / ${lattice.stats.dCells ? '' : 'NO SOLID / '}CG ${current ? fmt(current.cgCell[0], 1) : '–'} CELLS${state.shape === 'rocket' ? ' (PAGE 22 IN ON THE CAD LENGTH)' : ''}`,
      f ? `FORCE     FX ${fmt(f.fx, 5)} / FY ${fmt(f.fy, 5)} / MZ ${fmt(f.mz, 4)} LU / MEAN OF ${f.steps} STEPS / ${f.links} LINKS / AGE ${fmt(f.age_ms, 0)} MS (SIM)`
        : 'FORCE     – (FIRST READBACK AFTER 100 MS OF RUNNING)',
      f ? `COEFF     CN ${fmt(f.cn)} / CM ${fmt(f.cm)} / CD ${fmt(f.cd)} / CL ${fmt(f.cl)} / XCP ${f.xcpCells === null ? (f.cn === null ? '– (NO INFLOW)' : '– (|CN| < 0.02)') : `${fmt(f.xcpCells, 1)} CELLS = ${fmt(xcpCal, 2)} CAL FROM THE NOSE`} (SIM, 2D SECTION)`
        : 'COEFF     –',
      `STATE     STEP ${s.steps} / ${state.running ? 'RUNNING' : 'PAUSED'} / VIEW ${state.view.toUpperCase()} / NAN RESETS ${s.nanResets}${s.lost ? ' / CONTEXT LOST' : ''}${lattice.fallback ? ` / FALLBACK ${lattice.fallback.toUpperCase()}` : ''}`,
    ];
    if (lattice.fallback) {
      lines.splice(3, lines.length - 3,
        `GRID      – / LATTICE OFF (${lattice.fallback.toUpperCase()})`,
        `REQUESTED ${current ? current.label : '–'} / ALPHA ${fmt(state.alphaDeg, 1)} DEG / U_IN ${fmt(state.uIn)} LU / RE ${fmt(state.re, 0)} AT U_IN 0.10 / VIEW ${state.view.toUpperCase()}`,
        'FORCE     – (NO LATTICE)');
    }
    readout.textContent = lines.join('\n');
    if (now - lastAria > 2000) {
      lastAria = now;
      stage.setAttribute('aria-label', `Lattice Boltzmann flow section, ${current ? current.label.toLowerCase() : 'no section'} at ${fmt(s.alphaDeg, 1)} degrees, ${state.view} view, grid ${g.cols} by ${g.rows} cells, step ${s.steps}${f ? `, normal force coefficient ${fmt(f.cn, 2)}, moment coefficient ${fmt(f.cm, 2)}` : ''}. Page simulation in lattice units.`);
    }
  }
  function draw() {
    if (display && lattice.texture && lattice.tier > 0 && !lattice.fallback) display.draw(lattice.texture);
    drawOverlay();
    pushForce();
    drawChart();
    drawReadout();
    updateNote();
  }
  let noteHtml = null;
  function updateNote() {
    let html = '';
    if (!renderer) html = '<b>WebGL2 unavailable</b><br>The lattice needs WebGL2 render targets / the bench shows its controls and readout only';
    else if (lattice.fallback === 'no-float') html = '<b>No float render targets</b><br>This GPU cannot render to RGBA32F or RGBA16F / lattice off';
    else if (lattice.tier === 0) html = '<b>Tier 0</b><br>Lattice off / pick tier 1 to 3 to run the bench';
    let line = '';
    if (!html && stillPending) line = `Reduced motion / no autoplay / computing a still frame, ${stillDone} of ${STILL_STEPS} steps`;
    else if (!html && reduced && !state.running) line = `Reduced motion / no autoplay / a still frame after ${lattice.stats.steps} steps / Play or Step runs the bench`;
    if (status.textContent !== line) status.textContent = line;
    if (html === noteHtml) return;
    noteHtml = html; note.hidden = !html; note.innerHTML = html ? `<span>${html}</span>` : '';
  }

  /* ---------- loop ---------- */
  let raf = 0, last = 0;
  function loop(now) {
    raf = 0;
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60;
    last = now;
    if (state.running) lattice.frame(dt);
    draw();
    if (state.running && !doc.hidden) raf = requestAnimationFrame(loop);
  }
  function kick() { if (!raf && !doc.hidden) { last = 0; raf = requestAnimationFrame(loop); } }
  function redraw() { if (!state.running) { lattice.render(); requestAnimationFrame(() => { draw(); drawReadout(true); }); } }
  doc.addEventListener('visibilitychange', () => { if (doc.hidden) { cancelAnimationFrame(raf); raf = 0; } else if (state.running) kick(); });

  /* reduced motion: no autoplay; one still frame computed without being shown */
  const STILL_STEPS = 600;
  let stillPending = false, stillDone = 0;
  async function computeStill() {
    stillPending = true; stillDone = 0;
    draw(); drawReadout(true);
    while (stillDone < STILL_STEPS && !state.running) {
      stillDone += lattice.step(40) || 40;
      updateNote(); drawReadout(true);
      await nextFrame();
    }
    stillPending = false;
    lattice.render();
    await lattice.sampleForce();
    draw(); drawReadout(true);
  }

  /* ---------- controls ---------- */
  function bindRange(id, fmtOut, apply) {
    const input = $(id), out = $(`${id}-out`);
    const show = () => { out.value = fmtOut(Number(input.value)); };
    input.addEventListener('input', () => { show(); apply(Number(input.value)); });
    show();
    return { set(v) { input.value = String(v); show(); } };
  }
  const ctl = {};
  ctl.alpha = bindRange('alpha', (v) => `${v.toFixed(1)}°`, (v) => { state.alphaDeg = v; lattice.setInflow(state.uIn, v * DEG); redraw(); });
  ctl.u = bindRange('uin', (v) => v.toFixed(3), (v) => { state.uIn = v; lattice.setInflow(v, state.alphaDeg * DEG); redraw(); });
  ctl.re = bindRange('re', (v) => v.toFixed(0), (v) => { state.re = v; lattice.setViscosity({ re: v, uRef: U_REF }); redraw(); });
  ctl.rate = bindRange('rate', (v) => (v ? `${v.toFixed(1)}e-4` : '0'), (v) => { state.rate = v; lattice.setBodyRate(v * 1e-4); });
  ctl.inc = bindRange('incidence', (v) => `${v.toFixed(1)}°`, (v) => { state.incidence = v; if (state.shape === 'plate') { lattice.setSection(builder); sectionNow(); redraw(); } });
  ctl.spf = bindRange('spf', (v) => (v ? String(v) : 'TIER'), (v) => { state.spf = v; lattice.stepsPerFrame = v || null; drawReadout(true); });
  ctl.alpha.set(state.alphaDeg); ctl.u.set(state.uIn); ctl.re.set(state.re);
  $('reg').checked = state.reg;
  $('reg').addEventListener('change', (e) => { state.reg = e.target.checked; lattice.setRegularised(state.reg); });
  $('smag').addEventListener('change', (e) => { state.smag = e.target.checked; lattice.setSmagorinsky(state.smag ? SMAGORINSKY_C : 0); });
  $('positive').addEventListener('change', (e) => lattice.setStabilisers({ positive: e.target.checked }));
  $('sponge').addEventListener('change', (e) => lattice.setStabilisers({ sponge: e.target.checked }));
  $('mach').addEventListener('change', (e) => lattice.setMachFloor(e.target.checked ? MACH_FLOOR : 0));
  $('neq').addEventListener('change', (e) => { lattice.setStabilisers({ inflowNeq: e.target.checked }); drawReadout(true); });

  const shapeButtons = [...doc.querySelectorAll('[data-shape]')];
  function setShape(name) {
    state.shape = name;
    for (const b of shapeButtons) b.setAttribute('aria-pressed', String(b.dataset.shape === name));
    $('incidence-row').hidden = name !== 'plate';
    hist.length = 0; lastForceStep = -1;
    lattice.setSection(builder); sectionNow();
    lattice.reset();
    redraw();
  }
  for (const b of shapeButtons) b.addEventListener('click', () => setShape(b.dataset.shape));

  const viewButtons = [...doc.querySelectorAll('[data-view]')];
  function setView(name) {
    state.view = name;
    for (const b of viewButtons) b.setAttribute('aria-pressed', String(b.dataset.view === name));
    lattice.setView(name);
    redraw();
  }
  for (const b of viewButtons) b.addEventListener('click', () => setView(b.dataset.view));

  const tierSel = $('tier');
  tierSel.value = state.tierMode === 'auto' ? 'auto' : String(startTier);
  function applyTier(t) {
    lattice.setTier(t);
    sectionNow(); layout();
    if (t > 0 && !state.running) redraw();
  }
  tierSel.addEventListener('change', () => {
    state.tierMode = tierSel.value;
    applyTier(state.tierMode === 'auto' ? Math.max(1, governor.tier) : Number(state.tierMode));
  });
  /* auto follows the governor down to tier 1; the bench goes to tier 0 only when chosen */
  bus.on('governor:tier', ({ tier }) => { if (state.tierMode === 'auto' && !reduced) applyTier(Math.max(1, tier)); });

  const playBtn = $('play');
  function setRunning(on) {
    state.running = on;
    playBtn.textContent = on ? 'Pause' : 'Play';
    playBtn.setAttribute('aria-pressed', String(!on));
    if (on) kick(); else drawReadout(true);
  }
  playBtn.addEventListener('click', () => setRunning(!state.running));
  function stepOnce() {
    const n = lattice.stepsPerFrame || (TIERS[lattice.tier] || TIERS[1]).steps;
    lattice.step(n);
    lattice.render();
    lattice.sampleForce().then(() => { draw(); drawReadout(true); });
    draw();
  }
  $('step').addEventListener('click', stepOnce);
  $('reset').addEventListener('click', () => { hist.length = 0; lastForceStep = -1; lattice.reset(); redraw(); });
  $('check').addEventListener('click', async () => {
    const c = await lattice.check();
    $('check-out').textContent = c ? `FIELD CHECK AT STEP ${c.step}: ${c.bad} BAD OF ${c.cells} FLUID CELLS / MAX |U| ${c.maxSpeed.toFixed(4)} LU / MAX |RHO - 1| ${c.maxDrho.toFixed(4)}` : 'FIELD CHECK UNAVAILABLE';
  });
  addEventListener('keydown', (e) => {
    const t = e.target;
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    /* Space belongs to a focused button, link or summary (it activates them); the shortcut
       only takes it from the page itself */
    const control = t && typeof t.closest === 'function' && t.closest('button, a[href], [role="button"], summary, [contenteditable]');
    if (e.key >= '1' && e.key <= '4') setView(VIEWS[Number(e.key) - 1]);
    else if (e.key === ' ') { if (control) return; e.preventDefault(); setRunning(!state.running); }
    else if (e.key === 's' || e.key === 'S') stepOnce();
    else if (e.key === 'r' || e.key === 'R') $('reset').click();
  });

  /* layout on the next frame, so the stage height set inside layout never feeds back into the observer */
  let layoutQueued = 0;
  const queueLayout = () => { if (!layoutQueued) layoutQueued = requestAnimationFrame(() => { layoutQueued = 0; layout(); }); };
  if ('ResizeObserver' in window) new ResizeObserver(queueLayout).observe(stage.parentElement);
  else addEventListener('resize', queueLayout);

  /* ---------- go ---------- */
  lattice.setInflow(state.uIn, state.alphaDeg * DEG);
  lattice.setViscosity({ re: state.re, uRef: U_REF });
  lattice.setRegularised(state.reg);
  lattice.setView(state.view);
  for (const b of viewButtons) b.setAttribute('aria-pressed', String(b.dataset.view === state.view));
  for (const b of shapeButtons) b.setAttribute('aria-pressed', String(b.dataset.shape === state.shape));
  $('incidence-row').hidden = state.shape !== 'plate';
  lattice.setSection(builder);
  sectionNow();
  layout();
  setRunning(state.running);
  lattice.ready.then(() => {
    sectionNow(); layout();
    if (state.running) kick();
    else if (lattice.tier > 0 && !lattice.fallback) computeStill();
    else { draw(); drawReadout(true); }
  });
  return { lattice, renderer };

  /* ---------- validation runs ---------- */
  async function runValidation(kind) {
    doc.body.classList.add('is-validating');
    const show = (text) => { pre.hidden = false; pre.textContent = text; };
    const stageDraw = (lat) => {
      if (!display || !lat.texture) return;
      layoutFor(lat);
      display.draw(lat.texture);
    };
    function layoutFor(lat) {
      const g = lat.grid, W = stage.clientWidth, ml = 24, w = W - 48, h = Math.round(w * g.rows / g.cols);
      stage.style.height = `${h + 48}px`;
      Object.assign(glCanvas.style, { left: `${ml}px`, top: '24px', width: `${w}px`, height: `${h}px` });
      renderer.setPixelRatio(1); renderer.setSize(w, h, false);
    }
    if (!renderer) { const r = { case: kind, error: 'no-webgl2' }; show(JSON.stringify(r, null, 2)); console.log('LATTICE_VALIDATE ' + JSON.stringify(r)); return; }
    const num = (k, d) => (query.has(k) ? Number(query.get(k)) : d);
    let lastLog = 0;
    const progress = (done, total) => {
      show(`VALIDATE ${kind.toUpperCase()} / ${done} OF ${total}`);
      if (performance.now() - lastLog > 30000) { lastLog = performance.now(); console.log(`LATTICE_PROGRESS ${kind} ${done} / ${total}`); }
    };
    let result;
    try {
      if (kind === 'cylinder') result = await validateCylinder(renderer, { steps: num('steps', 20000), onProgress: progress, onFrame: stageDraw, smagorinsky: num('c', SMAGORINSKY_C) });
      else if (kind === 'stability') result = await validateStability(renderer, { steps: num('steps', 20000), re: num('re', RE_TARGET), uIn: num('u', U_REF), alphaDeg: num('alpha', 15), reg: query.get('reg') !== '0', machK: query.has('mach') ? num('mach', 0) : null, positive: query.get('pos') !== '0', sponge: query.get('sponge') !== '0', inflowNeq: query.get('neq') === '1', tier: num('tier', 3), onProgress: progress, onFrame: stageDraw });
      else if (kind === 'bench') result = await validateBench(renderer, { seconds: num('seconds', 4), onProgress: progress, draw: stageDraw });
      else if (kind === 'destroy') result = await validateDestroy(renderer);
      else result = { case: kind, error: 'unknown validation; use cylinder, stability, bench or destroy' };
    } catch (err) {
      result = { case: kind, error: String(err && err.message || err) };
    }
    show(JSON.stringify(result, null, 2));
    console.log('LATTICE_VALIDATE ' + JSON.stringify(result));
    return result;
  }
}
