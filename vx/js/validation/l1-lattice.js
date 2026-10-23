/* Validation track L1: analytic checks of the lattice engine (vx/js/lattice/lattice.js).
   Bench page: vx/lab/validation/l1.html (window.L1.run(spec) and ?case=...). Driver and
   reports: scratchpad validation/L1/ and reports/validation/L1/ (VALIDATION.md, track L1).

   Public engine API only: createLattice, setSection, setViscosity, setSmagorinsky,
   setRegularised, setMachFloor, setStabilisers, setInflow, reset, step, sync, sampleForce,
   fields. The state is read back through lattice.fields.distributions (three RGBA32F
   textures: T0 = f0..f3, T1 = f4..f7, T2 = f8, Fx, Fy, Mz) with a copy pass into a float
   render target owned here, then reduced on the CPU in float64. Nothing in the engine is
   changed.

   Cases
     poiseuille  channel between two solid walls (halfway bounce-back), flat equilibrium
                 inflow at the left edge, the engine's outflow edge at the right. The profile
                 in the developed region is compared with the analytic parabola for the
                 measured flow rate; the viscosity comes from the pressure gradient and the
                 profile curvature, and locally from the non-equilibrium stress.
     square      a solid square in uniform inflow: the engine's reduction against a CPU sum of
                 the per-cell force texture, the link count against the mask, and the force
                 against a control-volume momentum balance of the streaming populations.

   Grid frame as in the engine: +x downstream, row 0 at the bottom, cell centres at
   (i + 0.5, j + 0.5); lattice units throughout (one cell, one step, c_s^2 = 1/3). */
import * as THREE from 'three';
import { createLattice, SMAGORINSKY_C, RE_TARGET, U_REF } from '../lattice/lattice.js';
import { rocketSection, cylinderSection } from '../lattice/lattice-lab.js';
import { buildSection } from '../geom/geom.js';

const CS2 = 1 / 3;
const E = [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [-1, -1], [1, -1]];
const W = [4 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 36, 1 / 36, 1 / 36, 1 / 36];
const SPONGE_MIN = 8;   /* engine: absorbing layer width max(8, 0.05 rows) cells (lattice.js SPONGE_MIN) */

const yieldTask = () => new Promise((r) => setTimeout(r, 0));
const r6 = (v) => (Number.isFinite(v) ? +v.toPrecision(6) : null);

/* ------------------------------------------------------------- renderer */
export function makeRenderer(canvas) {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, preserveDrawingBuffer: false });
  if (!gl) return null;
  const renderer = new THREE.WebGLRenderer({ canvas, context: gl, antialias: false });
  renderer.autoClear = false;
  renderer.setPixelRatio(1);
  renderer.setSize(64, 64, false);
  return renderer;
}

/* ------------------------------------------------------------- readback */
/* Copies a texture texel for texel into an RGBA32F target and reads it back. */
export function createReader(renderer) {
  const quad = new THREE.BufferGeometry();
  quad.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const mat = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3, depthTest: false, depthWrite: false,
    uniforms: { tSrc: { value: null } },
    vertexShader: 'precision highp float;\nin vec3 position;\nvoid main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: 'precision highp float;\nprecision highp int;\nprecision highp sampler2D;\nuniform sampler2D tSrc;\nlayout(location = 0) out vec4 o;\nvoid main() { o = texelFetch(tSrc, ivec2(gl_FragCoord.xy), 0); }',
  });
  const mesh = new THREE.Mesh(quad, mat);
  mesh.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(mesh);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  let rt = null;
  function target(w, h) {
    if (rt && rt.width === w && rt.height === h) return rt;
    if (rt) rt.dispose();
    rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.FloatType, format: THREE.RGBAFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false, stencilBuffer: false, generateMipmaps: false });
    return rt;
  }
  async function read(tex, w, h) {
    const t = target(w, h);
    const prev = renderer.getRenderTarget();
    mat.uniforms.tSrc.value = tex;
    renderer.setRenderTarget(t);
    renderer.render(scene, cam);
    renderer.setRenderTarget(prev);
    const buf = new Float32Array(w * h * 4);
    await renderer.readRenderTargetPixelsAsync(t, 0, 0, w, h, buf);
    return buf;
  }
  return { read, dispose() { if (rt) rt.dispose(); quad.dispose(); mat.dispose(); } };
}

/* Full state of the lattice: the nine post-collision populations per cell (float32 as
   stored, widened; the engine stores f_i - w_i, fields.storage 'f - w', so w_i is added back
   here in float64), the per-cell force channels, rho and u. */
export async function readState(lat, reader) {
  const { cols, rows } = lat.grid;
  const tex = lat.fields.distributions;
  const shift = lat.fields.storage === 'f - w' ? W : [0, 0, 0, 0, 0, 0, 0, 0, 0];
  const [a, b, c] = [await reader.read(tex[0], cols, rows), await reader.read(tex[1], cols, rows), await reader.read(tex[2], cols, rows)];
  const n = cols * rows;
  const f = new Float64Array(9 * n), rho = new Float64Array(n), ux = new Float64Array(n), uy = new Float64Array(n);
  const fx = new Float64Array(n), fy = new Float64Array(n), mz = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const o = 4 * i, p = 9 * i;
    f[p] = a[o] + shift[0]; f[p + 1] = a[o + 1] + shift[1]; f[p + 2] = a[o + 2] + shift[2]; f[p + 3] = a[o + 3] + shift[3];
    f[p + 4] = b[o] + shift[4]; f[p + 5] = b[o + 1] + shift[5]; f[p + 6] = b[o + 2] + shift[6]; f[p + 7] = b[o + 3] + shift[7];
    f[p + 8] = c[o] + shift[8];
    fx[i] = c[o + 1]; fy[i] = c[o + 2]; mz[i] = c[o + 3];
    let r = 0, jx = 0, jy = 0;
    for (let k = 0; k < 9; k++) { const v = f[p + k]; r += v; jx += v * E[k][0]; jy += v * E[k][1]; }
    rho[i] = r; ux[i] = jx / r; uy[i] = jy / r;
  }
  return { cols, rows, f, rho, ux, uy, fx, fy, mz };
}

function feq(k, rho, ux, uy) {
  const eu = E[k][0] * ux + E[k][1] * uy;
  return W[k] * rho * (1 + 3 * eu + 4.5 * eu * eu - 1.5 * (ux * ux + uy * uy));
}

/* least squares polynomial fit (degree d) of ys on xs; returns coefficients c0..cd */
function polyfit(xs, ys, d) {
  const m = d + 1, A = Array.from({ length: m }, () => new Float64Array(m + 1));
  for (let i = 0; i < xs.length; i++) {
    const p = [1];
    for (let k = 1; k <= 2 * d; k++) p.push(p[k - 1] * xs[i]);
    for (let r = 0; r < m; r++) { for (let c = 0; c < m; c++) A[r][c] += p[r + c]; A[r][m] += p[r] * ys[i]; }
  }
  for (let col = 0; col < m; col++) {
    let piv = col;
    for (let r = col + 1; r < m; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    [A[col], A[piv]] = [A[piv], A[col]];
    for (let r = 0; r < m; r++) {
      if (r === col) continue;
      const k = A[r][col] / A[col][col];
      for (let c = col; c <= m; c++) A[r][c] -= k * A[col][c];
    }
  }
  return A.map((row, i) => row[m] / row[i]);
}

/* -------------------------------------------------------------- sections */
/* Channel: fluid rows M .. M + H - 1, solid rows outside (the engine keeps the edge rows
   fluid; they sit outside the walls). Halfway bounce-back puts the walls at y = M and
   y = M + H (cell faces). With M >= 9 no fluid cell of the channel lies inside the engine's
   absorbing layer (max(8, 0.05 rows) cells from an edge) when it is switched on. */
export function channelSection({ H, length, M = 9 }) {
  const cols = length, rows = H + 2 * M;
  const mask = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++) if (r < M || r >= M + H) for (let c = 0; c < cols; c++) mask[r * cols + c] = 1;
  return { mask, cols, rows, dCells: H, cgCell: [cols / 2, rows / 2], wall: M, H };
}

/* Square of side s cells, columns c0 .. c0 + s - 1, rows r0 .. r0 + s - 1. */
export function squareSection({ cols, rows, s, c0, r0 }) {
  const mask = new Uint8Array(cols * rows);
  for (let r = r0; r < r0 + s; r++) for (let c = c0; c < c0 + s; c++) mask[r * cols + c] = 1;
  return { mask, cols, rows, dCells: s, cgCell: [c0 + s / 2, r0 + s / 2] };
}

/* Wall links from the mask as the engine builds them (fluid, non-edge cells; bit k when
   x - e_k is solid). Returns the count. */
export function countLinks(mask, cols, rows) {
  let links = 0;
  for (let r = 1; r < rows - 1; r++) for (let c = 1; c < cols - 1; c++) {
    if (mask[r * cols + c]) continue;
    for (let k = 1; k <= 8; k++) if (mask[(r - E[k][1]) * cols + (c - E[k][0])]) links++;
  }
  return links;
}

/* -------------------------------------------------------------- engine set-up */
function configure(lat, { tau, smag, reg, machK, sponge, positive, inflowNeq = false }) {
  lat.setViscosity({ tau0: tau });
  lat.setSmagorinsky(smag);
  lat.setRegularised(reg);
  lat.setMachFloor(machK);
  lat.setStabilisers({ sponge, positive, inflowNeq: !!inflowNeq });
}
/* model presets: 'plain' is BGK without any subgrid model (the analytic reference model),
   'contract' is BGK + Smagorinsky 0.12 (FIELD.md section 4, the stabilisers off),
   'defaults' is the engine as shipped (Smagorinsky, regularised, speed floor 2, absorbing
   edges, positivity). Overrides: smag, reg, machK, sponge, positive. */
export function modelFor(name, o = {}) {
  const base = name === 'defaults' ? { smag: 0.12, reg: true, machK: 2, sponge: true, positive: true }
    : name === 'contract' ? { smag: 0.12, reg: false, machK: 0, sponge: false, positive: false }
      : { smag: 0, reg: false, machK: 0, sponge: false, positive: false };
  for (const k of ['smag', 'reg', 'machK', 'sponge', 'positive']) if (o[k] !== undefined) base[k] = o[k];
  return base;
}

/* -------------------------------------------------------------- Poiseuille */
/* Analysis of one state: the profile averaged over the station columns, the analytic
   parabola for the measured (discrete) flow rate, the fitted parabola and its zeros (the
   effective walls), the pressure gradient, the viscosity three ways. */
function analyseChannel(st, sec, xa, xb, tau, ga = xa, gb = xb, smag = 0) {
  const { cols } = st, H = sec.H, M = sec.wall;
  const ys = [], u = new Float64Array(H), rhoRow = new Float64Array(H), vmax = { v: 0 };
  for (let j = 0; j < H; j++) ys.push(j + 0.5);
  const ncol = xb - xa + 1;
  for (let c = xa; c <= xb; c++) for (let j = 0; j < H; j++) {
    const i = (M + j) * cols + c;
    u[j] += st.ux[i] / ncol; rhoRow[j] += st.rho[i] / ncol;
    vmax.v = Math.max(vmax.v, Math.abs(st.uy[i]));
  }
  /* discrete flow rate and the analytic parabola with the same discrete sum */
  const Q = u.reduce((s, v) => s + v, 0);
  const shape = ys.map((y) => y * (H - y));
  const k = Q / shape.reduce((s, v) => s + v, 0);
  const ua = shape.map((v) => k * v);
  let e2n = 0, e2d = 0, einf = 0;
  for (let j = 0; j < H; j++) { e2n += (u[j] - ua[j]) ** 2; e2d += ua[j] ** 2; einf = Math.max(einf, Math.abs(u[j] - ua[j])); }
  const uaMax = k * H * H / 4;   /* analytic centre-line speed (continuous parabola, same k) */
  const mid = [Math.floor((H - 1) / 2), Math.ceil((H - 1) / 2)];
  const uMid = (u[mid[0]] + u[mid[1]]) / 2, uaMid = (ua[mid[0]] + ua[mid[1]]) / 2;
  /* fitted parabola over all cells and over the interior (first and last cell left out) */
  const fitAll = polyfit(ys, Array.from(u), 2);
  const fitIn = polyfit(ys.slice(1, -1), Array.from(u).slice(1, -1), 2);
  const roots = (c) => { const [c0, c1, c2] = c, d = Math.sqrt(c1 * c1 - 4 * c2 * c0); return [(-c1 + d) / (2 * c2), (-c1 - d) / (2 * c2)].sort((p, q) => p - q); };
  const [ylo, yhi] = roots(fitAll);
  let resIn = 0;
  for (let j = 0; j < H; j++) resIn = Math.max(resIn, Math.abs(u[j] - (fitIn[0] + fitIn[1] * ys[j] + fitIn[2] * ys[j] * ys[j])));
  const fitMax = fitAll[0] - fitAll[1] * fitAll[1] / (4 * fitAll[2]);
  /* pressure gradient: channel-mean density per column, linear fit over the station */
  const xs = [], rs = [], ms = [];
  for (let c = ga; c <= gb; c++) {
    let s = 0, m = 0;
    for (let j = 0; j < H; j++) { const i = (M + j) * cols + c; s += st.rho[i]; m += st.rho[i] * st.ux[i]; }
    xs.push(c + 0.5); rs.push(s / H); ms.push(m);
  }
  const [rho0, drdx] = polyfit(xs, rs, 1);
  const rhoBar = rs.reduce((s, v) => s + v, 0) / rs.length;
  const massFlux = ms.reduce((s, v) => s + v, 0) / ms.length;
  const massDrift = (ms[ms.length - 1] - ms[0]) / massFlux;
  /* convective correction: rho u = m(y) is constant along x, so d(rho u^2)/dx = -u^2 drho/dx */
  let u2 = 0;
  for (let j = 0; j < H; j++) u2 += u[j] * u[j] / H;
  const nuCurv = CS2 * drdx / (rhoBar * 2 * fitIn[2]);           /* dp/dx = mu u'' */
  const nuCurvC = (CS2 - u2) * drdx / (rhoBar * 2 * fitIn[2]);
  const nuQ = -CS2 * drdx * H * H * H / (12 * rhoBar * Q);
  /* local relaxation time from the non-equilibrium stress of the stored (post-collision)
     populations: Pi*_xy = -(tau - 1) rho c_s^2 du/dy (BGK, Chapman-Enskog), du/dy by central
     differences of the station profile (exact for a parabola) */
  const tauRow = [], dudy = [], tauInv = [];
  for (let j = 1; j < H - 1; j++) {
    let pxy = 0, rr = 0, ti = 0;
    for (let c = xa; c <= xb; c++) {
      const i = (M + j) * cols + c, p = 9 * i;
      let s = 0, qxx = 0, qyy = 0, qxy = 0;
      for (let q = 0; q <= 8; q++) {
        const nq = st.f[p + q] - feq(q, st.rho[i], st.ux[i], st.uy[i]);
        qxx += nq * E[q][0] * E[q][0]; qyy += nq * E[q][1] * E[q][1]; qxy += nq * E[q][0] * E[q][1];
      }
      s = qxy;
      pxy += s / ncol; rr += st.rho[i] / ncol;
      ti += tauEngine(Math.sqrt(2 * (qxx * qxx + qyy * qyy + 2 * qxy * qxy)), st.rho[i], tau, smag, 0.5) / ncol;
    }
    tauInv.push(ti);
    const g = (u[j + 1] - u[j - 1]) / 2;
    dudy.push(g);
    tauRow.push(Math.abs(g) > 1e-12 ? 1 - pxy / (rr * CS2 * g) : NaN);
  }
  return {
    H, station: [xa, xb], Q, uMean: Q / H, uaMax, uMid, uaMid, fitMax,
    errL2: Math.sqrt(e2n / e2d), errInf: einf / uaMax, errMid: (uMid - uaMid) / uaMid, errMax: (fitMax - uaMax) / uaMax,
    wallLo: ylo, wallHi: yhi - H, hEff: yhi - ylo, fitInteriorResidual: resIn / uaMax,
    drhodx: drdx, rho0: rho0 + drdx * 0, rhoBar, massFlux, massDrift, maxUy: vmax.v / uaMax, u2mean: u2,
    nuNominal: (tau - 0.5) / 3, nuCurv, nuCurvCorrected: nuCurvC, nuQ,
    tauRow, tauInv, dudy, profile: Array.from(u), analytic: ua,
  };
}

export async function runPoiseuille(renderer, spec) {
  const {
    H = 32, tau = 0.8, re = null, u: uSpec = null, model = 'plain', lengthH = 4, stationH = [2, 3], gradH = null,
    maxSteps = 200000, checkEvery = 1000, tol = 3e-6, onProgress, minSteps = 0, maxSeconds = 2300, efolds = 13,
  } = spec;
  let stopReason = null;
  const m = modelFor(model, spec);
  const M = spec.M || (m.sponge ? 9 : 2);   /* wall rows incl. the edge row; 9 keeps the channel out of the absorbing layer */
  const nu = (tau - 0.5) / 3;
  const u = uSpec !== null ? uSpec : re * nu / H;
  const inlet = SPONGE_MIN + 1;
  const length = Math.round(inlet + lengthH * H + SPONGE_MIN + 2);
  const sec = channelSection({ H, length, M });
  /* speedCap: the analytic cases run at the speed they ask for (the engine caps the page's inflow at U_CAP) */
  const lat = createLattice(renderer, { cols: sec.cols, rows: sec.rows, tier: 1, fixedGrid: true, autoResetOnNaN: false, speedCap: 0.12 });
  await lat.ready;
  if (lat.fallback) { lat.destroy(); return { case: 'poiseuille', error: lat.fallback }; }
  const reader = createReader(renderer);
  lat.setSection(sec);
  configure(lat, { tau, ...m, inflowNeq: spec.inflowNeq });
  lat.setInflow(u, 0);
  lat.reset();
  const xa = inlet + Math.round(stationH[0] * H), xb = inlet + Math.round(stationH[1] * H) - 1;
  const gh = gradH || [stationH[0] - 0.5, stationH[1] + 0.5];
  const ga = inlet + Math.round(gh[0] * H), gb = inlet + Math.round(gh[1] * H) - 1;
  const t0 = performance.now();
  let steps = 0, prev = null, hist = [], last = null, stepTime = 0;
  const T = H * H / (Math.PI * Math.PI * nu);   /* slowest viscous mode across the channel, steps */
  for (;;) {
    const s0 = performance.now();
    lat.step(checkEvery); steps += checkEvery;
    await lat.sync();
    stepTime += performance.now() - s0;
    const st = await readState(lat, reader);
    const a = analyseChannel(st, sec, xa, xb, tau, ga, gb, m.smag);
    if (!Number.isFinite(a.uMid)) { last = a; break; }
    /* rms change of the station profile between checks (the max over cells sits on a float32
       noise floor of about 2e-6 of u_max once the flow is steady) */
    const change = prev ? Math.sqrt(a.profile.reduce((s2, v, j) => s2 + (v - prev.profile[j]) ** 2, 0) / H) / a.uaMax : Infinity;
    /* remaining transient: the larger of two estimates, the slowest viscous mode decaying with
       e-folding time T, and the observed ratio of successive changes (geometric tail) */
    const ratio = hist.length && hist[hist.length - 1].change > 0 ? change / hist[hist.length - 1].change : 1;
    const byT = change / (1 - Math.exp(-checkEvery / T));
    const remaining = ratio > 0 && ratio < 0.999 ? Math.max(byT, change * ratio / (1 - ratio)) : byT;
    hist.push({ steps, change: r6(change), remaining: r6(remaining), errL2: r6(a.errL2), uMid: r6(a.uMid) });
    prev = a; last = a;
    onProgress?.(steps, maxSteps, a);
    if (remaining < tol && steps >= minSteps) { stopReason = 'residual'; break; }
    if (steps >= efolds * T && steps >= minSteps) { stopReason = `${efolds} e-folds of the slowest viscous mode`; break; }
    if (steps >= maxSteps) { stopReason = 'maxSteps'; break; }
    if (performance.now() - t0 > maxSeconds * 1000) { stopReason = 'maxSeconds'; break; }
    await yieldTask();
  }
  const wall = (performance.now() - t0) / 1000;
  /* development along x: the profile error at four stations */
  const st = await readState(lat, reader);
  const along = [];
  for (const xh of [1, 2, 3, 4, 5]) {
    const c = inlet + Math.round(xh * H);
    if (c + 1 >= sec.cols - SPONGE_MIN - 1) continue;
    const a = analyseChannel(st, sec, c, c, tau, c, c);
    along.push({ xOverH: xh, errL2: r6(a.errL2), uMid: r6(a.uMid), Q: r6(a.Q) });
  }
  const check = await lat.check();
  const result = {
    case: 'poiseuille', model, stabilisers: m, inflowNeq: !!spec.inflowNeq, H, grid: [sec.cols, sec.rows], wallRows: sec.wall, tau, nu, uIn: u,
    re: u * H / nu, mach: u * Math.sqrt(3), gradStation: [ga, gb], steps, slowestModeSteps: Math.round(T), converged: stopReason === 'residual' || /e-folds/.test(stopReason || ''), stopReason,
    stepsPerSecond: Math.round(steps / (stepTime / 1000)), wallSeconds: +wall.toFixed(1), precision: lat.stats.precision,
    station: last.station,
    errL2: r6(last.errL2), errInf: r6(last.errInf), errMid: r6(last.errMid), errMax: r6(last.errMax),
    uMean: r6(last.uMean), uMid: r6(last.uMid), uaMid: r6(last.uaMid), fitMax: r6(last.fitMax), uaMax: r6(last.uaMax),
    wallLo: r6(last.wallLo), wallHi: r6(last.wallHi), hEff: r6(last.hEff), fitInteriorResidual: r6(last.fitInteriorResidual),
    drhodx: r6(last.drhodx), rhoBar: r6(last.rhoBar), massDrift: r6(last.massDrift), maxUyOverUmax: r6(last.maxUy), u2mean: r6(last.u2mean),
    nuNominal: r6(last.nuNominal), nuCurv: r6(last.nuCurv), nuCurvCorrected: r6(last.nuCurvCorrected), nuQ: r6(last.nuQ),
    tauRow: last.tauRow.map(r6), tauInv: last.tauInv.map(r6), dudy: last.dudy.map(r6), profile: last.profile.map(r6), analytic: last.analytic.map(r6),
    along, field: check, history: hist.filter((h, i) => i % Math.max(1, Math.round(hist.length / 40)) === 0 || i === hist.length - 1),
  };
  reader.dispose();
  lat.destroy();
  return result;
}

/* -------------------------------------------------------------- square */
/* Net momentum the streaming step carries into the box [x0, x1] x [y0, y1] (cells), from
   the stored post-collision populations: what crosses the box boundary inwards minus what
   leaves. In a steady state this equals the force on any solid inside the box. */
function boxFlux(st, x0, x1, y0, y1) {
  const { cols, f } = st;
  const inside = (c, r) => c >= x0 && c <= x1 && r >= y0 && r <= y1;
  let px = 0, py = 0;
  for (let r = y0 - 1; r <= y1 + 1; r++) for (let c = x0 - 1; c <= x1 + 1; c++) {
    const inA = inside(c, r), p = 9 * (r * cols + c);
    for (let k = 1; k <= 8; k++) {
      const cc = c + E[k][0], rr = r + E[k][1];
      const inB = inside(cc, rr);
      if (inA === inB) continue;
      const v = f[p + k], sgn = inB ? 1 : -1;   /* into the box: +, out of it: - */
      px += sgn * v * E[k][0]; py += sgn * v * E[k][1];
    }
  }
  return [px, py];
}
function boxMomentum(st, x0, x1, y0, y1, mask) {
  const { cols, f } = st;
  let px = 0, py = 0;
  for (let r = y0; r <= y1; r++) for (let c = x0; c <= x1; c++) {
    if (mask[r * cols + c]) continue;
    const p = 9 * (r * cols + c);
    for (let k = 1; k <= 8; k++) { px += f[p + k] * E[k][0]; py += f[p + k] * E[k][1]; }
  }
  return [px, py];
}

export async function runSquare(renderer, spec) {
  const { s = 8, re = 20, u = 0.05, model = 'plain', colsPerS = 25, rowsPerS = 10, upstreamS = 8, steps = 20000, chunk = 500, onProgress,
    maxSteps = 4 * steps, cdTol = 1e-4, windowUnits = 4 } = spec;
  const m = modelFor(model, spec);
  const cols = Math.round(colsPerS * s) + 1, rows = Math.round(rowsPerS * s);
  const c0 = Math.round(upstreamS * s), r0 = Math.round((rows - s) / 2);
  const sec = squareSection({ cols, rows, s, c0, r0 });
  const nu = u * s / re, tau = 0.5 + 3 * nu;
  const lat = createLattice(renderer, { cols, rows, tier: 1, fixedGrid: true, autoResetOnNaN: false, speedCap: 0.12 });
  await lat.ready;
  if (lat.fallback) { lat.destroy(); return { case: 'square', error: lat.fallback }; }
  const reader = createReader(renderer);
  lat.setSection(sec);
  configure(lat, { tau, ...m });
  lat.setInflow(u, 0);
  lat.reset();
  const t0 = performance.now();
  let stepTime = 0, done = 0;
  const trace = [];
  /* run at least `steps` (30 convective units s / u by default plan), then on until C_D over the
     last chunk differs from C_D windowUnits convective units earlier by less than cdTol (relative),
     or maxSteps. The engine's start-up viscosity (tau 0.75 easing to tau0 over 2,000 steps, not
     scaled with the grid) covers a different share of the history at each s, so a fixed step
     count would compare the grids at different stages of the transient. */
  const winSteps = Math.max(chunk, Math.round(windowUnits * s / u));
  let cdStop = null;
  while (done < maxSteps) {
    const n = chunk;
    const s0 = performance.now();
    lat.step(n); done += n;
    const f = await lat.sampleForce();
    stepTime += performance.now() - s0;
    if (f) trace.push([f.step, r6(f.fx / (0.5 * u * u * s)), r6(f.fy / (0.5 * u * u * s))]);
    onProgress?.(done, maxSteps);
    if (done >= steps && trace.length > 1) {
      /* compare with the latest entry at least winSteps back (a window of windowUnits convective units or more) */
      const last = trace[trace.length - 1], back = [...trace].reverse().find((t) => t[0] <= last[0] - winSteps);
      if (back) {
        const rel = Math.abs(last[1] - back[1]) / Math.abs(last[1]);
        if (rel < cdTol) { cdStop = { relChange: r6(rel), overSteps: last[0] - back[0] }; break; }
      }
    }
    await yieldTask();
  }
  /* final window: the reduction over the last chunk against a CPU sum of the per-cell
     force texture accumulated over exactly the same steps */
  const W_STEPS = chunk;
  lat.step(W_STEPS);
  const st0 = null;
  const fRed = await lat.sampleForce();          /* reduces T2 of the current state, then the sum restarts */
  const st = await readState(lat, reader);       /* same state: no step in between */
  let sx = 0, sy = 0, sm = 0, cellsWithForce = 0;
  for (let i = 0; i < st.fx.length; i++) { sx += st.fx[i]; sy += st.fy[i]; sm += st.mz[i]; if (st.fx[i] || st.fy[i]) cellsWithForce++; }
  const cpu = { fx: sx / W_STEPS, fy: sy / W_STEPS, mz: sm / W_STEPS };
  const linksMask = countLinks(sec.mask, cols, rows);
  /* control volume, exact one-step identity: with st the stored state at step T, the force of
     step T+1 (a one-step reduction) must equal the momentum streamed into a box around the
     square minus what left it, minus the change of the momentum held in the box's fluid
     cells (collisions conserve momentum). Two boxes: 2 cells and s cells around the square. */
  const boxes = [];
  const fOne = await (async () => { lat.step(1); return lat.sampleForce(); })();
  const st1 = await readState(lat, reader);
  for (const g of [2, s]) {
    const x0 = c0 - g, x1 = c0 + s - 1 + g, y0 = r0 - g, y1 = r0 + s - 1 + g;
    const [px, py] = boxFlux(st, x0, x1, y0, y1);
    const [m0x, m0y] = boxMomentum(st, x0, x1, y0, y1, sec.mask);
    const [m1x, m1y] = boxMomentum(st1, x0, x1, y0, y1, sec.mask);
    const fx = px - (m1x - m0x), fy = py - (m1y - m0y);
    boxes.push({ margin: g, influx: [r6(px), r6(py)], dMomentum: [r6(m1x - m0x), r6(m1y - m0y)], fx: r6(fx), fy: r6(fy),
      relDiffFx: r6((fx - fOne.fx) / fOne.fx), diffFyOverFx: r6((fy - fOne.fy) / fOne.fx), fluxOnlyRelDiff: r6((px - fOne.fx) / fOne.fx) });
  }
  /* unsteadiness: box momentum change over 200 steps against the force */
  const [p0x] = boxMomentum(st1, c0 - 2, c0 + s + 1, r0 - 2, r0 + s + 1, sec.mask);
  lat.step(200);
  const fAfter = await lat.sampleForce();
  const st2 = await readState(lat, reader);
  const [p1x] = boxMomentum(st2, c0 - 2, c0 + s + 1, r0 - 2, r0 + s + 1, sec.mask);
  const wall = (performance.now() - t0) / 1000;
  const q = 0.5 * u * u * s;
  const result = {
    case: 'square', model, stabilisers: m, s, grid: [cols, rows], square: { c0, r0 }, blockage: s / rows, re, uIn: u, tau: r6(tau), nu: r6(nu), steps: done + W_STEPS + 201,
    reduction: { fx: r6(fRed.fx), fy: r6(fRed.fy), mz: r6(fRed.mz), links: fRed.links, steps: fRed.steps },
    cpuSum: { fx: r6(cpu.fx), fy: r6(cpu.fy), mz: r6(cpu.mz), cellsWithForce },
    relDiff: { fx: r6((fRed.fx - cpu.fx) / cpu.fx), mz: r6(Math.abs(cpu.mz) > 1e-12 ? (fRed.mz - cpu.mz) / Math.abs(cpu.fx * s) : 0), fyOverFx: r6((fRed.fy - cpu.fy) / cpu.fx) },
    linksMask, linksAnalytic: 12 * s - 4, linksReduction: fRed.links,
    cd: r6(fRed.fx / q), cl: r6(fRed.fy / q), cdAfter: r6(fAfter.fx / q),
    oneStepForce: { fx: r6(fOne.fx), fy: r6(fOne.fy), steps: fOne.steps }, controlVolume: boxes, cvRelDiff: boxes.map((b) => b.relDiffFx),
    boxMomentumRate: r6((p1x - p0x) / 200), boxMomentumRateOverForce: r6((p1x - p0x) / 200 / fRed.fx),
    stepsPerSecond: Math.round(done / (stepTime / 1000)), wallSeconds: +wall.toFixed(1), precision: lat.stats.precision,
    steadyStop: cdStop, convectiveUnits: r6(done * u / s),
    trace: trace.filter((t, i) => i % Math.max(1, Math.round(trace.length / 40)) === 0 || i === trace.length - 1),
    field: await lat.check(),
  };
  void st0;
  reader.dispose();
  lat.destroy();
  return result;
}


/* -------------------------------------------------------------- eddy viscosity field */
/* The relaxation time the engine used in each fluid cell, recovered from the stored
   (post-collision) state: f* - f_eq = keep n with keep = 1 - 1/tau, so the post-collision
   stress norm is Q* = |keep| Q, and tau solves the engine's rule
     tau = max(0.5 (tau0 + sqrt(tau0^2 + 18 C^2 Q / rho)), speed floor, absorbing layer)
   (shaders.js STEP_FRAG). The smallest root above tau0 is taken (a second, spurious root sits
   near tau = 1 where keep vanishes). Cells where the positivity limiter acted are not
   separable and are counted as such (limiter: a post-collision population below zero would
   have been cut, recognisable as min f* = 0 within 1e-7). */
function tauEngine(Qs, rho, tau0, c, floor) {
  /* scan upward from tau0 for the first sign change of h(t) = t - rule(Qs / |1 - 1/t|) */
  const rule = (t) => Math.max(0.5 * (tau0 + Math.sqrt(tau0 * tau0 + 18 * c * c * (Qs / Math.abs(1 - 1 / t)) / rho)), floor);
  let a = Math.max(tau0, floor, 0.5 + 1e-9), ha = a - rule(a);
  if (ha >= 0) return a;
  const top = 0.999;
  const n = 400;
  for (let i = 1; i <= n; i++) {
    const b = a + (top - a) * i / n, hb = b - rule(b);
    if (hb >= 0) {
      let lo = a + (top - a) * (i - 1) / n, hi = b;
      for (let k = 0; k < 50; k++) { const m = 0.5 * (lo + hi); if (m - rule(m) >= 0) hi = m; else lo = m; }
      return 0.5 * (lo + hi);
    }
  }
  return NaN;
}
function pct(arr, p) { if (!arr.length) return null; const a = Float64Array.from(arr).sort(); return a[Math.min(a.length - 1, Math.floor(p * (a.length - 1)))]; }

export async function runEddyField(renderer, spec) {
  const { shape = 'rocket', cols = 512, rows = 160, alphaDeg = 5, u: uAsk = U_REF, re = RE_TARGET, uRef = U_REF, steps = 4000, model = 'defaults', chunk = 500, onProgress } = spec;
  const m = modelFor(model, spec);
  let sec;
  if (shape === 'cylinder') sec = cylinderSection({ cols, rows, d: spec.d || 24, cx: spec.cx || 128, cy: rows / 2 + 0.3 });
  else if (shape === 'page') {
    /* the page's section: geometry.buildSection at this grid, fins at scale 1, 'through' view, page CG */
    const b = buildSection({ cols, rows, finScale: spec.finScale ?? 1, view: spec.view || 'through' });
    let xMax = 0;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (b.mask[r * cols + c] && c + 1 > xMax) xMax = c + 1;
    sec = { mask: b.mask, cols, rows, dCells: b.dCells, cgCell: [b.cgCell.x, b.cgCell.y], xNose: b.xNoseCol, length: xMax - b.xNoseCol };
  } else sec = rocketSection({ cols, rows });
  /* the page's own settings, speed cap included unless the spec raises it (speedCap) */
  const lat = createLattice(renderer, { cols, rows, tier: 1, fixedGrid: true, autoResetOnNaN: false, ...(Number.isFinite(spec.speedCap) ? { speedCap: spec.speedCap } : {}) });
  await lat.ready;
  if (lat.fallback) { lat.destroy(); return { case: 'eddy', error: lat.fallback }; }
  const reader = createReader(renderer);
  lat.setSection(sec);
  lat.setViscosity({ re, uRef });
  lat.setSmagorinsky(m.smag); lat.setRegularised(m.reg); lat.setMachFloor(m.machK); lat.setStabilisers({ sponge: m.sponge, positive: m.positive, inflowNeq: false });
  lat.setInflow(uAsk, alphaDeg * Math.PI / 180);
  const u = lat.stats.uIn;   /* the speed that runs: the engine caps the page's request at its speed cap */
  lat.reset();
  const t0 = performance.now();
  let stepTime = 0;
  for (let d = 0; d < steps; d += chunk) {
    const s0 = performance.now();
    lat.step(Math.min(chunk, steps - d)); await lat.sync();
    stepTime += performance.now() - s0;
    onProgress?.(d + chunk, steps);
    await yieldTask();
  }
  /* reduction check at this grid: a 200-step window reduced by the engine against the CPU sum
     of the per-cell force texture, and the link count against the mask */
  await lat.sampleForce();
  lat.step(200);
  const fRed = await lat.sampleForce();
  const st = await readState(lat, reader);
  let sx = 0, sy = 0, sm = 0;
  for (let i = 0; i < st.fx.length; i++) { sx += st.fx[i]; sy += st.fy[i]; sm += st.mz[i]; }
  const reduceCheck = {
    steps: fRed.steps, reduction: { fx: r6(fRed.fx), fy: r6(fRed.fy), mz: r6(fRed.mz), links: fRed.links },
    cpuSum: { fx: r6(sx / fRed.steps), fy: r6(sy / fRed.steps), mz: r6(sm / fRed.steps) }, linksMask: countLinks(lat.stats ? sec.mask : sec.mask, cols, rows),
    relDiff: { fx: r6((fRed.fx - sx / fRed.steps) / Math.hypot(sx, sy) * fRed.steps), fy: r6((fRed.fy - sy / fRed.steps) / Math.hypot(sx, sy) * fRed.steps), mz: r6((fRed.mz - sm / fRed.steps) / Math.abs(sm / fRed.steps)) },
    cn: r6(fRed.cn), cm: r6(fRed.cm),
  };
  /* what the edges deliver: the inflow edge holds the equilibrium at rho 1 and u_in, not the
     velocity, so the flow that enters depends on the pressure the body raises at the edge.
     Column means over all interior rows (solid cells skipped) at a few columns, and the row
     means of u_y one and two cells inside the bottom and top edges (the cross-flow inlets at
     incidence). */
  const colMean = (col) => {
    let su = 0, sv = 0, sr = 0, sm = 0, k = 0;
    for (let r = 1; r < rows - 1; r++) { const i = r * cols + col; if (sec.mask[i]) continue; su += st.ux[i]; sv += st.uy[i]; sr += st.rho[i]; sm += st.rho[i] * st.ux[i]; k++; }
    return { col, ux: r6(su / k), uy: r6(sv / k), rho: r6(sr / k), massFlux: r6(sm / k), cells: k };
  };
  const rowMean = (row, c0 = 1, c1 = cols - 2) => {
    let su = 0, sv = 0, sr = 0, k = 0;
    for (let col = c0; col <= c1; col++) { const i = row * cols + col; if (sec.mask[i]) continue; su += st.ux[i]; sv += st.uy[i]; sr += st.rho[i]; k++; }
    return { row, ux: r6(su / k), uy: r6(sv / k), rho: r6(sr / k), cells: k };
  };
  const ain = alphaDeg * Math.PI / 180;
  const edgeFlow = {
    uInX: r6(u * Math.cos(ain)), uInY: r6(u * Math.sin(ain)),
    columns: [1, 2, 4, 8, Math.round(cols / 2), cols - 3].map(colMean),
    rows: [1, 2, Math.round(rows / 4), rows - 3, rows - 2].map((r) => rowMean(r)),
  };
  const tau0 = lat.stats.tau0, nu0 = (tau0 - 0.5) / 3, c = m.smag;
  const spongeW = m.sponge ? Math.max(SPONGE_MIN, Math.round(0.05 * rows)) : 0;
  const mask = sec.mask;
  const wallRatio = [], wakeRatio = [], allRatio = [];
  let limited = 0, failed = 0, floorCells = 0, n = 0;
  const floorRatio = [];
  const diag = { sU: [], sDev: [], sIso: [], ratio: [], hp: [], drho: [] };   /* nu_floor / nu0 - 1 in the cells where the speed floor is above tau0 (outside the layer) */
  if (lat.stats.tauNow > tau0 + 1e-9) { reader.dispose(); lat.destroy(); return { case: 'eddy', error: `start-up viscosity still active (tauNow ${lat.stats.tauNow}); run at least 2,000 steps` }; }
  for (let r = 1; r < rows - 1; r++) for (let col = 1; col < cols - 1; col++) {
    const i = r * cols + col;
    if (mask[i]) continue;
    const p = 9 * i, rho = st.rho[i], ux = st.ux[i], uy = st.uy[i];
    let pxx = 0, pyy = 0, pxy = 0, fmin = Infinity;
    for (let k = 0; k < 9; k++) {
      const nk = st.f[p + k] - feq(k, rho, ux, uy);
      pxx += nk * E[k][0] * E[k][0]; pyy += nk * E[k][1] * E[k][1]; pxy += nk * E[k][0] * E[k][1];
      fmin = Math.min(fmin, st.f[p + k]);
    }
    if (fmin < 1e-7) { limited++; continue; }
    const Qs = Math.sqrt(2 * (pxx * pxx + pyy * pyy + 2 * pxy * pxy));
    let floor = 0.5 + m.machK * Math.max(0, Math.hypot(ux, uy) - 0.15);
    if (spongeW > 0) {
      const d = Math.min(col, cols - 1 - col, r, rows - 1 - r), sp = Math.max(0, 1 - d / spongeW);
      floor = Math.max(floor, 0.5 + (0.9 - 0.5) * sp * sp);
    }
    if (floor > tau0 + 1e-9 && (spongeW === 0 || Math.min(col, cols - 1 - col, r, rows - 1 - r) >= spongeW)) { floorCells++; floorRatio.push((floor - tau0) / (tau0 - 0.5)); }
    const t = tauEngine(Qs, rho, tau0, c, floor);
    if (!Number.isFinite(t)) { failed++; continue; }
    n++;
    const ratio = (t - tau0) / (tau0 - 0.5);   /* nu_t / nu0 */
    let wall = false;
    for (let k = 1; k <= 8 && !wall; k++) if (mask[(r - E[k][1]) * cols + (col - E[k][0])]) wall = true;
    const inSponge = spongeW > 0 && Math.min(col, cols - 1 - col, r, rows - 1 - r) < spongeW;
    if (inSponge) continue;
    allRatio.push(ratio);
    if (wall) wallRatio.push(ratio);
    else if (col > (sec.xNose || 0) + (sec.length || 0) && Math.abs(r + 0.5 - rows / 2) < 2 * sec.dCells) wakeRatio.push(ratio);
    /* diagnostic: the strain rate the Smagorinsky rule saw (from the stress, |S|_Pi = Q / (2 rho c_s^2 tau)
       with Q = Q* / |1 - 1/tau|) against the strain rate of the velocity field (central differences,
       |S|_u = sqrt(2 S:S)), split into the deviatoric and the isotropic (trace) part of the stress, in the
       cells of the free stream (more than one body length ahead of the nose or more than 2 D above or
       below the axis, outside the layer). A ratio far above 1 means the rule is fed by stress that is
       not the resolved shear (acoustic compression or non-hydrodynamic content). */
    if (r >= 2 && r < rows - 2 && col >= 2 && col < cols - 2 && !wall) {
      let nb = false;
      for (let k = 1; k <= 8 && !nb; k++) if (mask[(r + E[k][1]) * cols + (col + E[k][0])]) nb = true;
      if (!nb) {
        const iE = i + 1, iW = i - 1, iN = i + cols, iS = i - cols;
        const dux = (st.ux[iE] - st.ux[iW]) / 2, duy = (st.ux[iN] - st.ux[iS]) / 2, dvx = (st.uy[iE] - st.uy[iW]) / 2, dvy = (st.uy[iN] - st.uy[iS]) / 2;
        const sU = Math.sqrt(2 * (dux * dux + dvy * dvy + 0.5 * (duy + dvx) ** 2));
        const keepA = Math.abs(1 - 1 / t), denom = 2 * rho * (1 / 3) * t * keepA;
        const tr = 0.5 * (pxx + pyy), dxx = pxx - tr, dyy = pyy - tr;
        const sDev = Math.sqrt(2 * (dxx * dxx + dyy * dyy + 2 * pxy * pxy)) / denom, sIso = Math.sqrt(2 * 2 * tr * tr) / denom;
        const free = (col < (sec.xNose || 0) - (sec.length || 0) * 0.25 || Math.abs(r + 0.5 - rows / 2) > 2 * sec.dCells);
        if (free) {
          diag.sU.push(sU); diag.sDev.push(sDev); diag.sIso.push(sIso); diag.ratio.push(ratio);
          /* grid-scale velocity fluctuation: u minus the mean of its 8 neighbours, over u_in */
          let mx = 0, my = 0;
          for (let k = 1; k <= 8; k++) { const j = i + E[k][1] * cols + E[k][0]; mx += st.ux[j] / 8; my += st.uy[j] / 8; }
          diag.hp.push(Math.hypot(st.ux[i] - mx, st.uy[i] - my) / u);
          diag.drho.push(Math.abs(st.rho[i] - 1));
        }
      }
    }
  }
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const summary = (a) => ({ cells: a.length, mean: r6(mean(a)), p50: r6(pct(a, 0.5)), p90: r6(pct(a, 0.9)), max: r6(pct(a, 1)) });
  const result = {
    case: 'eddy', shape, model, stabilisers: m, grid: [cols, rows], dCells: r6(sec.dCells), alphaDeg, uIn: u, uRequested: uAsk, re: r6(lat.stats.re), tau0: r6(tau0), nu0: r6(nu0), smagorinsky: c, steps,
    nuTOverNu0: { wallCells: summary(wallRatio), wake: summary(wakeRatio), interiorFluid: summary(allRatio), freeStream: summary(diag.ratio) },
    freeStreamStrain: { strainFromVelocity: summary(diag.sU), strainFromDeviatoricStress: summary(diag.sDev), strainFromTraceStress: summary(diag.sIso), gridScaleSpeedOverUin: summary(diag.hp), absRhoMinus1: summary(diag.drho) },
    effectiveReAtWall: r6(lat.stats.re / (1 + (mean(wallRatio) || 0))),
    reduceCheck, edgeFlow, cellsSolved: n, cellsLimiterOrZero: limited, cellsUnsolved: failed, cellsAtSpeedFloor: floorCells, speedFloorNuOverNu0: summary(floorRatio),
    stepsPerSecond: Math.round(steps / (stepTime / 1000)), wallSeconds: +((performance.now() - t0) / 1000).toFixed(1), field: await lat.check(),
  };
  if (spec.dumpField) {
    /* the macroscopic field of the last read (float32, row-major from row 0), base64, for offline analysis */
    const b64 = (arr) => { const f = Float32Array.from(arr), u8 = new Uint8Array(f.buffer); let bin = ''; for (let k = 0; k < u8.length; k += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(k, k + 0x8000)); return btoa(bin); };
    result.fieldDump = { cols, rows, step: lat.stats.steps, ux: b64(st.ux), uy: b64(st.uy), rho: b64(st.rho), mask: b64(Array.from(sec.mask)) };
  }
  reader.dispose();
  lat.destroy();
  return result;
}

/* ------------------------------------------------------------- step rate */
export async function stepRate(renderer, { cols, rows, steps = 2000 }) {
  const sec = channelSection({ H: rows - 18, length: cols });
  const lat = createLattice(renderer, { cols: sec.cols, rows: sec.rows, tier: 1, fixedGrid: true, autoResetOnNaN: false, speedCap: 0.12 });
  await lat.ready;
  lat.setSection(sec); lat.setViscosity({ tau0: 0.8 }); lat.setInflow(0.05, 0); lat.reset();
  lat.step(50); await lat.sync();
  const t0 = performance.now();
  lat.step(steps); await lat.sync();
  const dt = performance.now() - t0;
  lat.destroy();
  return { cols: sec.cols, rows: sec.rows, steps, seconds: +(dt / 1000).toFixed(2), stepsPerSecond: Math.round(steps * 1000 / dt), mcups: +(steps * sec.cols * sec.rows / dt / 1000).toFixed(2) };
}

export async function run(renderer, spec) {
  if (spec.case === 'poiseuille') return runPoiseuille(renderer, spec);
  if (spec.case === 'square') return runSquare(renderer, spec);
  if (spec.case === 'rate') return stepRate(renderer, spec);
  if (spec.case === 'eddy') return runEddyField(renderer, spec);
  return { error: `unknown case ${spec.case}` };
}
