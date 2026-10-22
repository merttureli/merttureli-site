/* LATTICE: a D2Q9 lattice Boltzmann engine on three.js render targets.
   FIELD.md section 4 is the contract; section 2 holds the sign conventions.

   Model (lattice units: one cell, one step; c_s^2 = 1/3; STD, Chen and Doolen 1998)
     BGK collision, Smagorinsky subgrid viscosity C = 0.12 (STD, Hou, Sterling,
     Chen and Doolen 1996), nu = (tau0 - 0.5) / 3. Single pull pass: gather,
     bounce-back, collide, write, into three RGBA32F textures through one MRT
     draw (WebGLRenderTarget count 3, NearestFilter, no depth). Without float32
     render targets: RGBA16F holding f_i - w_i (stats.precision says which).
     Stabilisers, documented because the contract's model alone did not pass its
     own gate (see MACH_K and STARTUP_TAU below):
       regularised collision (STD, Latt and Chopard 2006), on by default: the
         non-equilibrium part is projected on its second-order moment before
         relaxing, which removes the ghost modes that grow at tau0 near 0.504;
       a local viscosity floor where |u| > 0.15 (EST), off elsewhere;
       a start-up viscosity that eases from tau 0.75 to tau0 over 2,000 steps
         after a reset (EST).
     Walls: halfway bounce-back with Ladd's moving-wall term (STD, Ladd 1994),
     u_w = omega x (r - r_cg) from setBodyRate. Outer edges: equilibrium at rho 1
     and u_in where the freestream enters; elsewhere zero-gradient velocity and
     non-equilibrium part (STD, Guo, Zheng and Shi 2002) with rho held at 1.
     Force: momentum exchange per wall link (Galilean-corrected, STD, Wen et al.
     2014), accumulated per cell in the spare channels of the third texture,
     reduced by 2 x 2 halving passes to 1 x 1 and read back with
     renderer.readRenderTargetPixelsAsync at 10 Hz. Never a synchronous read.
     Dye: RG16F at twice the grid (once at tier 1), semi-Lagrangian, smoke rake
     along the inflow direction. Views composited into an RGBA8 texture
     (lattice.texture) with alpha 0 inside the solid.

   Numbers (tags as in FIELD.md):
     grids and steps per frame by tier, TIERS below (contract)
     u_in = clamp(0.03 + 0.05 V / 70 m/s, 0.03, 0.10) lattice units (contract; the
       0.03 floor keeps the smoke moving on the pad), inflowFor(V)
     tau0 = 0.5 + 3 u_ref D_cells / Re with Re 3000 at u_ref 0.10, the top of the
       inflow range: Re = u_in D_cells / nu then runs from 900 on the pad to 3000
       (SIM). With the lab rocket (D 38.9 cells at tier 3) tau0 = 0.50389.
     The real rocket at 70 m/s is near Re 3e5 (D 0.068 m CAD, nu 1.5e-5 m^2/s STD
       sea-level air); the lattice is a Reynolds-scaled model and says so.

   Grid frame: +x from nose to tail (column 0 upstream of the nose), +y the body's
   +x side; inflow direction (cos alpha, sin alpha) with alpha from section 2.
   Mask rows: row 0 is grid y = 0 (bottom of the texture), index row * cols + col.
   Moments (force.mz, force.cm) are positive in the flight convention (positive
   raises theta), so a restoring moment at positive alpha reads negative and
   xcpCells = xcg - mz / fy (contract).

   The engine never listens to the pointer and owns no animation loop: the
   caller drives frame(dt) from its own requestAnimationFrame. */
import * as THREE from 'three';
import { bus } from '../core/bus.js';
import { governor } from '../core/governor.js';
import * as S from './shaders.js';

/* Tier table (FIELD.md section 4). rake: smoke lines across the domain height. */
export const TIERS = Object.freeze({
  3: Object.freeze({ cols: 1024, rows: 320, steps: 24, dyeScale: 2, rake: 28 }),
  2: Object.freeze({ cols: 768, rows: 240, steps: 16, dyeScale: 2, rake: 22 }),
  1: Object.freeze({ cols: 512, rows: 160, steps: 8, dyeScale: 1, rake: 16 }),
  0: Object.freeze({ cols: 0, rows: 0, steps: 0, dyeScale: 0, rake: 0 }),
});
export const VIEWS = Object.freeze(['smoke', 'pressure', 'vorticity', 'speed']);
export const SMAGORINSKY_C = 0.12;   /* STD, Hou et al. 1996 (contract value) */
export const RE_TARGET = 3000;       /* lattice Reynolds number at U_REF (contract) */
export const U_REF = 0.10;           /* lattice units, top of the inflow range (contract) */
export const ALPHA_MAX = 35 * Math.PI / 180;   /* rad, edge treatment holds to here (contract) */
export const MACH_FLOOR = 2;         /* default slope of the local speed floor, tau per lattice unit (see MACH_K) */

const FRAME_BUDGET_MS = 48;   /* ms; CPU issue time per frame before steps are shed (contract), also the frame
                                 interval above which the step count backs off (a GPU that cannot keep up) */
const SHED_DOWN = 0.75;       /* step-scale factor per frame while the frame interval is over budget */
const SHED_UP = 1.08;         /* recovery factor per frame once the interval is under 60 percent of budget */
const READ_PERIOD_MS = 100;   /* force readback at 10 Hz (contract) */
const STATS_PERIOD_MS = 1000; /* lattice:stats at 1 Hz (contract) */
const REF_FRAME_S = 1 / 60;   /* s; the tier's steps are per 60 Hz frame, a faster display runs fewer per frame */
const U_MAX = 0.12;           /* lattice units; above this the lattice Mach number passes 0.2 */
const RAKE_DECAY = 1.0;       /* rake smoke e-folds over this many domain widths of freestream travel */
const WALL_DECAY = 0.35;      /* wall dye e-folds over this many domain widths */
const WALL_DYE = 0.9;         /* wall dye level held in the cells that touch the solid */
const XCP_MIN_CN = 0.02;      /* below this |c_n| the centre of pressure is undefined (returns null) */
const SLEW = 1e-4;            /* lattice units per step per component: the boundary inflow approaches the setInflow
                                 target at this rate, so a jump in alpha or speed arrives as a ramp instead of a
                                 pressure wave (EST; 0.03 to 0.10 takes 700 steps, the page's boost needs about 3e-5) */
const STARTUP_TAU = 0.75;     /* relaxation time right after a reset (nu 0.083) */
const STARTUP_STEPS = 2000;   /* steps over which it eases back to tau0 (EST). A reset starts the tunnel already
                                 running (uniform inflow, the impulsive start of a model dropped into the stream);
                                 the extra viscosity damps the pressure pulse the walls throw off in the first steps,
                                 which at tau0 = 0.504 would otherwise grow. Starting from still air instead sends a
                                 plane wave of rho - 1 = u / c_s (0.17 at u 0.10) through the domain. */
const MACH_U = 0.15;          /* lattice units (local Mach 0.26): above this local speed the viscosity floor rises */
const MACH_K = MACH_FLOOR;    /* tau per lattice unit of speed above MACH_U (EST): at |u| 0.30, tau >= 0.80. */
/* Stability gate history (rocket stand-in, tier 3 grid, alpha 15 deg, u_in 0.10, SwiftShader, SIM):
     plain BGK + Smagorinsky, contract edges (copy outflow): blew up at Re 3000, 2000, 1000 and 500
       within 2,000 to 4,500 steps; regularised alone at Re 3000: 2,500 steps;
     with the final edges and no stabiliser: Re 3000, 1500, 750 and 375 all blew up within 8,000 steps;
     regularised + speed floor: 5,000 steps clean, then the copy outflow let mass pile up (rho - 1
       reached 0.2), so outflow edges hold rho at 1;
     + positivity + absorbing edges: 14,000 steps, then backflow through the top outflow edge;
     + backflow removal: 20,000 steps clean, max |u| 0.355, max |rho - 1| 0.159.
   The cylinder gate (Re 100, tau0 0.536, |u| < 0.07) runs with every stabiliser on: the regularised
   collision touches only the non-hydrodynamic modes, the speed floor never engages below |u| 0.15,
   and the 10-cell absorbing edges start 73 cells or more from the cylinder. */
const SPONGE_FRAC = 0.05;     /* absorbing layer width as a fraction of the rows (16 cells at tier 3), EST */
const SPONGE_MIN = 8;         /* cells, the narrowest layer */
const SPONGE_TAU = 0.9;       /* relaxation time at the edge itself (nu 0.13), EST */
const SELFTEST_TOL = 2e-3;    /* tolerance on f0 after one step of uniform flow (half float carries 1e-3) */

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* Inflow speed in lattice units for an airspeed in m/s (contract formula). */
export function inflowFor(V) { return clamp(0.03 + 0.05 * ((Number(V) || 0) / 70), 0.03, 0.10); }
/* Molecular relaxation time for a lattice Reynolds number at reference speed uRef. */
export function tauFor(re, uRef, dCells) { return 0.5 + 3 * uRef * dCells / Math.max(1, re); }
/* Pitch rate q (rad/s, flight convention) to the body rate setBodyRate expects,
   matching the reduced rate q D / V between flight and lattice. Returns 0 below
   2 m/s, where the inflow floor makes the mapping meaningless. */
export function pitchRateToLattice(q, V, dMeters, dCells, uIn) {
  if (!(V > 2) || !(dCells > 0)) return 0;
  return q * dMeters * uIn / (V * dCells);
}

/* IEEE half to float, for the RGBA16F readback path. */
function halfToFloat(h) {
  const s = h & 0x8000 ? -1 : 1, e = (h >> 10) & 0x1f, m = h & 0x3ff;
  if (e === 0) return s * Math.pow(2, -14) * (m / 1024);
  if (e === 31) return m ? NaN : s * Infinity;
  return s * Math.pow(2, e - 15) * (1 + m / 1024);
}

export function createLattice(renderer, options = {}) {
  const fixedGrid = Number(options.cols) > 0 && Number(options.rows) > 0;
  const reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let tier = Number.isInteger(options.tier) ? clamp(options.tier, 0, 3) : (reducedMotion ? 0 : governor.tier);

  const stats = {
    grid: [0, 0], dye: [0, 0], tier, stepsPerFrame: 0, stepsPerSecond: 0, msPerFrame: 0, issueMs: 0,
    precision: 'none', re: 0, tau0: 0, tauNow: 0, nu: 0, uIn: 0.05, uNow: 0, alpha: 0, alphaDeg: 0, dCells: 0,
    steps: 0, shed: 0, stepScale: 1, nanResets: 0, view: 'smoke', smagorinsky: SMAGORINSKY_C, regularised: options.regularised !== false, machK: Number.isFinite(options.machK) ? options.machK : MACH_K,
    sponge: options.sponge !== false, positive: options.positive !== false,
    fallback: null, lost: false, forceReadback: true,
  };
  const api = {
    ready: null, fallback: null, stats, texture: null, force: null, stepsPerFrame: null,
    get tier() { return tier; },
    get grid() { return { cols: grid.cols, rows: grid.rows, dyeScale: grid.dyeScale }; },
    get fields() { return fieldsView(); },
    setSection, setInflow, setBodyRate, setView, setTier, frame, step, render, reset, sampleForce, check, sync,
    setViscosity, setSmagorinsky, setRegularised, setMachFloor, setStabilisers, resources, destroy,
  };
  const noop = () => {};
  const grid = { cols: 0, rows: 0, dyeScale: 2, rake: 28 };
  let destroyed = false;
  let fA = null, fB = null, macro = null, dyeA = null, dyeB = null, view = null, chain = [];
  let cellTex = null;
  let stepCarry = 0, lastFrameAt = 0, lastStatsAt = 0, frameEma = 0, stepScale = 1;
  const window1 = { start: 0, frames: 0, steps: 0, issue: 0, wall: 0 };

  /* ---------------------------------------------------------- capability */
  const gl = renderer && typeof renderer.getContext === 'function' ? renderer.getContext() : null;
  const isGL2 = !!gl && typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
  if (!isGL2) return fail('no-webgl2');
  const hasF32 = renderer.extensions.has('EXT_color_buffer_float');
  const hasF16 = hasF32 || renderer.extensions.has('EXT_color_buffer_half_float');
  if (!hasF16) return fail('no-float');

  function fail(reason) {
    api.fallback = reason; stats.fallback = reason;
    api.ready = Promise.resolve({ fallback: reason, precision: 'none' });
    for (const k of ['setSection', 'setInflow', 'setBodyRate', 'setView', 'setTier', 'frame', 'step', 'render', 'reset', 'setViscosity', 'setSmagorinsky', 'setRegularised', 'setMachFloor', 'setStabilisers']) api[k] = noop;
    api.sampleForce = () => Promise.resolve(null);
    api.check = () => Promise.resolve(null);
    api.sync = () => Promise.resolve(false);
    api.resources = () => ({ targets: 0, materials: 0, textures: 0, geometries: 0 });
    api.destroy = () => { destroyed = true; };
    return api;
  }

  /* ---------------------------------------------------------- GL objects */
  let half = !hasF32 || options.precision === 'half';   /* float16 deviation path (the option forces it, for testing) */
  const quad = new THREE.BufferGeometry();
  quad.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const scene = new THREE.Scene();
  const mesh = new THREE.Mesh(quad);
  mesh.frustumCulled = false;
  scene.add(mesh);
  scene.matrixWorldAutoUpdate = false;

  const materials = [];
  function material(fragmentShader, uniforms) {
    const m = new THREE.RawShaderMaterial({
      vertexShader: S.VERT, fragmentShader, uniforms, glslVersion: THREE.GLSL3,
      depthTest: false, depthWrite: false, defines: half ? { DEV: 1 } : {},
    });
    materials.push(m);
    return m;
  }
  const u = (value) => ({ value });
  let mats = null;
  function buildMaterials() {
    for (const m of materials) m.dispose();
    materials.length = 0;
    mats = {
      init: material(S.INIT_FRAG, { tCell: u(null), uU: u(new THREE.Vector2()) }),
      step: material(S.STEP_FRAG, {
        tF0: u(null), tF1: u(null), tF2: u(null), tCell: u(null), uU: u(new THREE.Vector2()),
        uTau0: u(0.51), uC2: u(SMAGORINSKY_C * SMAGORINSKY_C), uOmega: u(0), uCg: u(new THREE.Vector2()), uAccum: u(0), uReg: u(0),
        uMachU: u(MACH_U), uMachK: u(0), uSpongeW: u(0), uSpongeTau: u(SPONGE_TAU), uPositive: u(1),
      }),
      macro: material(S.MACRO_FRAG, { tF0: u(null), tF1: u(null), tF2: u(null), tCell: u(null), uOmega: u(0), uCg: u(new THREE.Vector2()) }),
      dye: material(S.DYE_FRAG, {
        tDye: u(null), tMacro: u(null), tCell: u(null), uGrid: u(new THREE.Vector2()), uScale: u(2), uSteps: u(0),
        uDecay: u(new THREE.Vector2(1, 1)), uFlow: u(new THREE.Vector2(1, 0)), uSpacing: u(12), uWidth: u(0.6), uWallDye: u(WALL_DYE), uInit: u(0),
      }),
      composite: material(S.COMPOSITE_FRAG, {
        tMacro: u(null), tDye: u(null), tCell: u(null), uGrid: u(new THREE.Vector2()), uOut: u(new THREE.Vector2()),
        uView: u(0), uUin: u(0.05), uD: u(24),
      }),
      reduce0: material(S.REDUCE0_FRAG, { tF2: u(null), tCell: u(null) }),
      reduce: material(S.REDUCE_FRAG, { tSrc: u(null) }),
      probe0: material(S.PROBE0_FRAG, { tF0: u(null), tF1: u(null), tF2: u(null), tCell: u(null) }),
      probe: material(S.PROBE_FRAG, { tSrc: u(null) }),
    };
  }

  const targets = new Set();
  function target(w, h, opts) {
    const t = new THREE.WebGLRenderTarget(w, h, {
      minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false,
      depthBuffer: false, stencilBuffer: false, wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping, ...opts,
    });
    targets.add(t);
    return t;
  }
  function dropTarget(t) { if (t) { t.dispose(); targets.delete(t); } }
  const stateType = () => (half ? THREE.HalfFloatType : THREE.FloatType);

  /* Allocates (or resizes) every target for the current grid. The view target
     keeps its object so lattice.texture stays valid across tier changes. */
  function allocate() {
    const { cols, rows, dyeScale } = grid;
    const dw = cols * dyeScale, dh = rows * dyeScale;
    const lin = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
    if (!fA || fA.texture.type !== stateType()) {
      dropTarget(fA); dropTarget(fB);
      fA = target(cols, rows, { count: 3, type: stateType(), format: THREE.RGBAFormat });
      fB = target(cols, rows, { count: 3, type: stateType(), format: THREE.RGBAFormat });
    } else { fA.setSize(cols, rows); fB.setSize(cols, rows); }
    if (!macro) macro = target(cols, rows, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, ...lin });
    else macro.setSize(cols, rows);
    if (!dyeA) {
      dyeA = target(dw, dh, { type: THREE.HalfFloatType, format: THREE.RGFormat, ...lin });
      dyeB = target(dw, dh, { type: THREE.HalfFloatType, format: THREE.RGFormat, ...lin });
    } else { dyeA.setSize(dw, dh); dyeB.setSize(dw, dh); }
    if (!view) { view = target(dw, dh, { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, ...lin }); api.texture = view.texture; }
    else view.setSize(dw, dh);
    for (const t of chain) dropTarget(t);
    chain = [];
    let w = cols, h = rows;
    do {
      w = Math.ceil(w / 2); h = Math.ceil(h / 2);
      chain.push(target(w, h, { type: stateType(), format: THREE.RGBAFormat }));
    } while (w > 1 || h > 1);
    stats.grid = [cols, rows]; stats.dye = [dw, dh];
  }
  /* Frees the GPU memory (tier 0, or a lost context); the objects stay so
     three re-creates them on the next use. */
  function releaseGPU() { for (const t of targets) t.dispose(); }

  /* ------------------------------------------------------------ section */
  let sectionSource = null;
  const section = { cols: 0, rows: 0, dCells: 24, cgX: 0, cgY: 0, solidCells: 0, links: 0, clippedEdge: 0 };
  let cellData = null;

  function normaliseCg(cg, cols, rows) {
    if (Array.isArray(cg)) return [Number(cg[0]), Number(cg[1] ?? rows / 2)];
    if (cg && typeof cg === 'object') return [Number(cg.x ?? cg.col), Number(cg.y ?? cg.row ?? rows / 2)];
    if (Number.isFinite(cg)) return [cg, rows / 2];
    return [cols / 2, rows / 2];
  }
  /* The section for the current grid: from a builder, or resampled (nearest)
     from a section built at another size, with dCells and the centre scaled. */
  function sectionFor(cols, rows) {
    let s = typeof sectionSource === 'function' ? sectionSource({ cols, rows }) : sectionSource;
    if (!s || !s.mask) return null;
    const sc = s.cols | 0, sr = s.rows | 0;
    let [cx, cy] = normaliseCg(s.cgCell, sc, sr);
    let mask = s.mask, d = Number(s.dCells) || 0;
    if (sc !== cols || sr !== rows) {
      const out = new Uint8Array(cols * rows);
      for (let r = 0; r < rows; r++) {
        const rr = Math.min(sr - 1, Math.floor((r + 0.5) * sr / rows));
        for (let c = 0; c < cols; c++) out[r * cols + c] = mask[rr * sc + Math.min(sc - 1, Math.floor((c + 0.5) * sc / cols))];
      }
      mask = out; d *= cols / sc; cx *= cols / sc; cy *= rows / sr;
    }
    return { mask, dCells: d, cgX: cx, cgY: cy };
  }
  /* Cell texture: r = 255 inside the solid, g = bit k-1 set when the neighbour
     x - e_k is solid (fluid cells only). Edge rows and columns stay fluid. */
  function applySection() {
    const { cols, rows } = grid;
    const s = sectionFor(cols, rows);
    const solid = new Uint8Array(cols * rows);
    let clipped = 0;
    if (s) for (let i = 0; i < solid.length; i++) solid[i] = s.mask[i] ? 1 : 0;
    for (let c = 0; c < cols; c++) for (const r of [0, rows - 1]) { if (solid[r * cols + c]) clipped++; solid[r * cols + c] = 0; }
    for (let r = 0; r < rows; r++) for (const c of [0, cols - 1]) { if (solid[r * cols + c]) clipped++; solid[r * cols + c] = 0; }
    if (!cellData || cellData.length !== cols * rows * 4) cellData = new Uint8Array(cols * rows * 4);
    else cellData.fill(0);
    const E = S.D2Q9.e;
    let solids = 0, links = 0;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const i = r * cols + c, o = i * 4;
      cellData[o + 3] = 255;
      if (solid[i]) { cellData[o] = 255; solids++; continue; }
      if (r === 0 || c === 0 || r === rows - 1 || c === cols - 1) continue;
      let bits = 0;
      for (let k = 1; k <= 8; k++) if (solid[(r - E[k][1]) * cols + (c - E[k][0])]) { bits |= 1 << (k - 1); links++; }
      cellData[o + 1] = bits;
    }
    if (!cellTex || cellTex.image.width !== cols || cellTex.image.height !== rows) {
      if (cellTex) cellTex.dispose();
      cellTex = new THREE.DataTexture(cellData, cols, rows, THREE.RGBAFormat, THREE.UnsignedByteType);
      cellTex.minFilter = THREE.LinearFilter; cellTex.magFilter = THREE.LinearFilter;
      cellTex.wrapS = cellTex.wrapT = THREE.ClampToEdgeWrapping;
      cellTex.generateMipmaps = false; cellTex.flipY = false; cellTex.unpackAlignment = 1;
    } else cellTex.image.data = cellData;
    cellTex.needsUpdate = true;
    Object.assign(section, { cols, rows, dCells: s ? s.dCells : 0, cgX: s ? s.cgX : cols / 2, cgY: s ? s.cgY : rows / 2, solidCells: solids, links, clippedEdge: clipped });
    stats.dCells = section.dCells;
    updateViscosity();
  }

  /* ---------------------------------------------------------- parameters */
  const flow = { uIn: 0.05, alpha: 0, omega: 0, view: 0 };
  const visc = { mode: 're', re: RE_TARGET, uRef: U_REF, tau0: 0.51, c: SMAGORINSKY_C, reg: options.regularised !== false, machK: Number.isFinite(options.machK) ? options.machK : MACH_K, sponge: options.sponge !== false, positive: options.positive !== false };
  function updateViscosity() {
    const d = section.dCells > 0 ? section.dCells : 24;
    if (visc.mode === 're') visc.tau0 = tauFor(visc.re, visc.uRef, d);
    visc.tau0 = Math.max(0.5 + 1e-5, visc.tau0);
    const nu = (visc.tau0 - 0.5) / 3;
    stats.tau0 = visc.tau0; stats.nu = nu;
    stats.re = nu > 0 ? flow.uIn * d / nu : Infinity;
  }

  /* -------------------------------------------------------------- passes */
  let depth = 0, saved = null;
  function begin() {
    if (depth++ > 0) return;
    saved = { target: renderer.getRenderTarget(), autoClear: renderer.autoClear };
    renderer.autoClear = false;
  }
  function end() {
    if (--depth > 0) return;
    renderer.setRenderTarget(saved.target);
    renderer.autoClear = saved.autoClear;
    saved = null;
  }
  function pass(mat, rt) {
    mesh.material = mat;
    renderer.setRenderTarget(rt);
    renderer.render(scene, camera);
  }
  function setVec(v, x, y) { v.value.set(x, y); }
  const targetVec = () => [flow.uIn * Math.cos(flow.alpha), flow.uIn * Math.sin(flow.alpha)];
  const inflow = { x: 0, y: 0 };      /* boundary inflow now, slewing toward targetVec() */
  function advanceInflow() {
    const [tx, ty] = targetVec();
    inflow.x += clamp(tx - inflow.x, -SLEW, SLEW);
    inflow.y += clamp(ty - inflow.y, -SLEW, SLEW);
  }

  let accumSteps = 0, accumReset = true, pendingDye = 0, sinceReset = STARTUP_STEPS;
  /* tau0 with the start-up easing (smoothstep from STARTUP_TAU down to tau0) */
  function tauNow() {
    if (sinceReset >= STARTUP_STEPS || STARTUP_TAU <= visc.tau0) return visc.tau0;
    const t = sinceReset / STARTUP_STEPS, w = 1 - t * t * (3 - 2 * t);
    return visc.tau0 + (STARTUP_TAU - visc.tau0) * w;
  }
  function initState() {
    const m = mats.init;
    m.uniforms.tCell.value = cellTex;
    setVec(m.uniforms.uU, inflow.x, inflow.y);
    pass(m, fA);
    accumSteps = 0; accumReset = true;
  }
  function stepOnce() {
    const m = mats.step.uniforms;
    m.tF0.value = fA.textures[0]; m.tF1.value = fA.textures[1]; m.tF2.value = fA.textures[2];
    m.tCell.value = cellTex;
    advanceInflow();
    setVec(m.uU, inflow.x, inflow.y);
    m.uTau0.value = tauNow(); m.uC2.value = visc.c * visc.c; m.uReg.value = visc.reg ? 1 : 0;
    m.uMachK.value = visc.machK; m.uMachU.value = MACH_U;
    m.uSpongeW.value = visc.sponge ? Math.max(SPONGE_MIN, Math.round(SPONGE_FRAC * grid.rows)) : 0;
    m.uPositive.value = visc.positive ? 1 : 0;
    m.uOmega.value = -flow.omega;                 /* flight rate (clockwise in the grid) to counter-clockwise */
    setVec(m.uCg, section.cgX, section.cgY);
    m.uAccum.value = (!half && !accumReset) ? 1 : 0;
    pass(mats.step, fB);
    const t = fA; fA = fB; fB = t;
    accumReset = false; accumSteps++; pendingDye++; stats.steps++; window1.steps++; sinceReset++;
    stats.uNow = Math.hypot(inflow.x, inflow.y); stats.tauNow = m.uTau0.value;
  }
  function dyePass(init) {
    const m = mats.dye.uniforms;
    m.tDye.value = dyeA.texture; m.tMacro.value = macro.texture; m.tCell.value = cellTex;
    setVec(m.uGrid, grid.cols, grid.rows);
    m.uScale.value = grid.dyeScale;
    m.uSteps.value = pendingDye;
    const travel = pendingDye * flow.uIn;
    setVec(m.uDecay, Math.exp(-travel / (RAKE_DECAY * grid.cols)), Math.exp(-travel / (WALL_DECAY * grid.cols)));
    const ang = Math.hypot(inflow.x, inflow.y) > 1e-6 ? Math.atan2(inflow.y, inflow.x) : flow.alpha;   /* rake follows the inflow as it is now */
    setVec(m.uFlow, Math.cos(ang), Math.sin(ang));
    m.uSpacing.value = grid.rows / Math.max(1, grid.rake);
    m.uWidth.value = Math.max(0.55, 1.2 / grid.dyeScale);
    m.uInit.value = init ? 1 : 0;
    pass(mats.dye, dyeB);
    const t = dyeA; dyeA = dyeB; dyeB = t;
    pendingDye = 0;
  }
  function renderViews() {
    const mm = mats.macro.uniforms;
    mm.tF0.value = fA.textures[0]; mm.tF1.value = fA.textures[1]; mm.tF2.value = fA.textures[2];
    mm.tCell.value = cellTex; mm.uOmega.value = -flow.omega; setVec(mm.uCg, section.cgX, section.cgY);
    pass(mats.macro, macro);
    if (pendingDye > 0) dyePass(false);
    const c = mats.composite.uniforms;
    c.tMacro.value = macro.texture; c.tDye.value = dyeA.texture; c.tCell.value = cellTex;
    setVec(c.uGrid, grid.cols, grid.rows); setVec(c.uOut, grid.cols * grid.dyeScale, grid.rows * grid.dyeScale);
    c.uView.value = flow.view; c.uUin.value = flow.uIn; c.uD.value = section.dCells > 0 ? section.dCells : 24;
    pass(mats.composite, view);
  }
  function reduceChain(first, firstUniforms, next) {
    for (const [k, v] of Object.entries(firstUniforms)) first.uniforms[k].value = v;
    pass(first, chain[0]);
    for (let i = 1; i < chain.length; i++) { next.uniforms.tSrc.value = chain[i - 1].texture; pass(next, chain[i]); }
    return chain[chain.length - 1];
  }
  function readTarget(rt, index = 0, x = 0, y = 0) {
    const buf = half ? new Uint16Array(4) : new Float32Array(4);
    return renderer.readRenderTargetPixelsAsync(rt, x, y, 1, 1, buf, undefined, index)
      .then((b) => (half ? Array.from(b, halfToFloat) : Array.from(b)));
  }

  /* -------------------------------------------------------------- force */
  let live = false, lost = false, readsInFlight = 0, lastRead = 0;
  const autoNaNReset = options.autoResetOnNaN !== false;
  function sampleForce() {
    if (!live || lost || destroyed || tier === 0) return Promise.resolve(api.force);
    if (accumSteps === 0 || readsInFlight > 3) return Promise.resolve(api.force);
    begin();
    const last = reduceChain(mats.reduce0, { tF2: fA.textures[2], tCell: cellTex }, mats.reduce);
    end();
    const n = half ? 1 : accumSteps;
    const meta = { steps: n, uIn: flow.uIn, alpha: flow.alpha, d: section.dCells, cgX: section.cgX, issued: performance.now(), stepIndex: stats.steps };
    accumSteps = 0; accumReset = true;
    readsInFlight++;
    let p;
    try { p = readTarget(last); } catch (err) { readsInFlight--; stats.forceReadback = false; return Promise.resolve(api.force); }
    return p.then((v) => {
      readsInFlight--;
      if (destroyed) return null;
      const f = forceFrom(v, meta);
      if (!f.finite && autoNaNReset) { stats.nanResets++; reset(); return api.force; }
      api.force = f;
      return f;
    }, () => { readsInFlight--; stats.forceReadback = false; return api.force; });
  }
  function forceFrom(v, m) {
    const [sx, sy, sm, links] = v;
    const fx = sx / m.steps, fy = sy / m.steps, mz = sm / m.steps;
    const q = m.uIn > 1e-4 ? 0.5 * m.uIn * m.uIn : NaN;   /* dynamic pressure, rho_ref = 1 */
    const d = m.d > 0 ? m.d : 1;
    const ca = Math.cos(m.alpha), sa = Math.sin(m.alpha);
    const cn = fy / (q * d);
    const issued = m.issued;
    return {
      fx, fy, mz,
      cx: fx / (q * d), cn, cm: mz / (q * d * d),
      cd: (fx * ca + fy * sa) / (q * d), cl: (-fx * sa + fy * ca) / (q * d),
      xcpCells: Math.abs(cn) > XCP_MIN_CN ? m.cgX - mz / fy : null,
      links, steps: m.steps, step: m.stepIndex, uIn: m.uIn, alpha: m.alpha, dCells: m.d,
      finite: Number.isFinite(sx) && Number.isFinite(sy) && Number.isFinite(sm),
      get age_ms() { return performance.now() - issued; },
    };
  }

  /* Validation probe: counts non-finite or out-of-range fluid cells and the
     extremes of |u| and |rho - 1| over the whole field (async readback). */
  function check() {
    if (!live || lost || destroyed) return Promise.resolve(null);
    begin();
    const last = reduceChain(mats.probe0, { tF0: fA.textures[0], tF1: fA.textures[1], tF2: fA.textures[2], tCell: cellTex }, mats.probe);
    end();
    const step = stats.steps;
    return readTarget(last).then(([bad, cells, maxSpeed, maxDrho]) => ({ bad, cells, maxSpeed, maxDrho, step }), () => null);
  }

  /* Resolves once the GPU has finished every lattice command issued so far
     (an async one-texel readback behind a fence). For benches and gates. */
  function sync() {
    if (!live || lost || destroyed || tier === 0) return Promise.resolve(false);
    return readTarget(fA, 0, 0, 0).then(() => true, () => false);
  }

  /* ------------------------------------------------------------ lifecycle */
  function gridForTier(t) {
    const spec = TIERS[t] || TIERS[1];
    if (fixedGrid) return { cols: options.cols | 0, rows: options.rows | 0, dyeScale: spec.dyeScale || 2, rake: spec.rake || 28 };
    return { cols: spec.cols, rows: spec.rows, dyeScale: spec.dyeScale, rake: spec.rake };
  }
  function configure(t) {
    const g = gridForTier(t > 0 ? t : 1);
    const changed = g.cols !== grid.cols || g.rows !== grid.rows || g.dyeScale !== grid.dyeScale || !fA;
    Object.assign(grid, g);
    if (changed) { allocate(); applySection(); }
    return changed;
  }
  function reset() {
    if (!mats || destroyed || lost || tier === 0) return;
    begin();
    [inflow.x, inflow.y] = targetVec();  /* uniform inflow: the tunnel is already running */
    sinceReset = 0;
    stats.uNow = Math.hypot(inflow.x, inflow.y); stats.tauNow = tauNow();
    initState();
    pendingDye = 0;
    dyePass(true);
    renderViews();
    end();
    stats.steps = 0;
    api.force = null;
  }

  /* Self-test: after init and one step of uniform flow every fluid cell holds
     the equilibrium, so f0 = 4/9 (1 - 1.5 u^2). A float32 target that does not
     render (incomplete framebuffer) reads back wrong and drops to float16. */
  async function selfTest() {
    const expect = (4 / 9) * (1 - 1.5 * flow.uIn * flow.uIn) - (half ? 4 / 9 : 0);   /* before the await: the caller may change the inflow meanwhile */
    [inflow.x, inflow.y] = targetVec();
    sinceReset = STARTUP_STEPS;
    begin(); initState(); stepOnce(); end();
    const v = await readTarget(fA, 0, grid.cols >> 1, 2);   /* an interior cell far from the body */
    if (options.debug) console.log('[lattice] self-test', half ? 'rgba16f' : 'rgba32f', 'read', v, 'expect', expect);
    return Number.isFinite(v[0]) && Math.abs(v[0] - expect) < SELFTEST_TOL;
  }
  async function boot() {
    buildMaterials();
    configure(tier);
    let ok = false;
    try { ok = await selfTest(); } catch (err) { ok = false; if (options.debug) console.log('[lattice] self-test threw', String(err && err.stack || err)); }
    if (!ok && !half && !destroyed) {
      half = true;
      buildMaterials();
      dropTarget(fA); dropTarget(fB); fA = fB = null;
      configure(tier);
      try { ok = await selfTest(); } catch { stats.forceReadback = false; ok = true; }
    }
    if (destroyed) return { fallback: null, precision: 'none' };
    if (!ok) {
      releaseGPU();
      api.texture = null;
      api.fallback = stats.fallback = 'no-float';
      return { fallback: 'no-float', precision: 'none' };
    }
    stats.precision = half ? 'rgba16f-dev' : 'rgba32f';
    live = true;
    if (tier === 0) releaseGPU();
    else reset();
    return { fallback: null, precision: stats.precision };
  }
  api.ready = boot().catch((err) => {
    console.warn('[lattice] start-up failed, running without the lattice', err);
    api.fallback = stats.fallback = 'no-float';
    return { fallback: 'no-float', precision: 'none' };
  });

  /* --------------------------------------------------------------- public */
  function setSection(s) {
    sectionSource = s || null;
    if (!mats || destroyed) return;
    applySection();   /* a section built at another size is resampled to the grid */
    if (live && tier > 0 && !lost) { begin(); renderViews(); end(); }
  }
  function setInflow(uIn, alpha) {
    flow.uIn = clamp(Number(uIn) || 0, 0, U_MAX);
    flow.alpha = clamp(Number(alpha) || 0, -ALPHA_MAX, ALPHA_MAX);
    stats.uIn = flow.uIn; stats.alpha = flow.alpha; stats.alphaDeg = flow.alpha * 180 / Math.PI;
    updateViscosity();
  }
  /* omegaLU: pitch rate in lattice units (rad per step), flight convention:
     positive raises theta, which turns the body clockwise in the grid frame. */
  function setBodyRate(omegaLU) { flow.omega = Number(omegaLU) || 0; }
  function setView(name) {
    const i = VIEWS.indexOf(name);
    if (i < 0) return;
    flow.view = i; stats.view = name;
    if (live && tier > 0 && !lost) { begin(); renderViews(); end(); }
  }
  function setTier(t) {
    t = clamp(Math.round(Number(t) || 0), 0, 3);
    if (t === tier) return;
    const was = tier;
    tier = t; stats.tier = t;
    if (!mats || destroyed) return;
    if (t === 0) { releaseGPU(); return; }
    const changed = configure(t);
    if (live && (changed || was === 0)) reset();
  }
  /* Viscosity: { re, uRef } keeps Re fixed at uRef (tau0 follows the section),
     or { tau0 } fixes the relaxation time. */
  function setViscosity(v = {}) {
    if (Number.isFinite(v.tau0)) { visc.mode = 'tau'; visc.tau0 = v.tau0; }
    else if (Number.isFinite(v.re)) { visc.mode = 're'; visc.re = v.re; if (Number.isFinite(v.uRef)) visc.uRef = v.uRef; }
    updateViscosity();
  }
  function setSmagorinsky(c) { visc.c = Math.max(0, Number(c) || 0); stats.smagorinsky = visc.c; }
  function setRegularised(on) { visc.reg = !!on; stats.regularised = visc.reg; }
  /* Local speed floor on tau (see shaders.js): k in tau per lattice unit above MACH_U, 0 turns it off. */
  function setMachFloor(k) { visc.machK = Math.max(0, Number(k) || 0); stats.machK = visc.machK; }
  /* Stabiliser switches for the lab and the gates: { sponge, positive } booleans. */
  function setStabilisers(o = {}) {
    if ('sponge' in o) visc.sponge = !!o.sponge;
    if ('positive' in o) visc.positive = !!o.positive;
    stats.sponge = visc.sponge; stats.positive = visc.positive;
  }

  function step(n = 1) {
    if (!live || destroyed || lost || tier === 0) return 0;
    n = Math.max(0, Math.floor(n));
    begin();
    for (let i = 0; i < n; i++) stepOnce();
    end();
    return n;
  }
  /* Draws the current state into lattice.texture without stepping (advects
     the dye over any steps taken through step()). */
  function render() {
    if (!live || destroyed || lost || tier === 0) return;
    begin(); renderViews(); end();
  }

  function frame(dt) {
    if (!live || destroyed || lost || tier === 0) return;
    const now = performance.now();
    const base = Number.isFinite(api.stepsPerFrame) && api.stepsPerFrame > 0 ? api.stepsPerFrame : (TIERS[tier] || TIERS[1]).steps;
    const scale = Number.isFinite(dt) && dt > 0 ? clamp(dt / REF_FRAME_S, 0.25, 1) : 1;
    /* back off when frames arrive slower than the budget (GPU-bound), recover when they are quick */
    if (lastFrameAt) {
      const iv = now - lastFrameAt;
      if (iv < 1000) frameEma = frameEma ? frameEma * 0.8 + iv * 0.2 : iv;
      if (frameEma > FRAME_BUDGET_MS) stepScale = Math.max(1 / base, stepScale * SHED_DOWN);
      else if (frameEma < 0.6 * FRAME_BUDGET_MS) stepScale = Math.min(1, stepScale * SHED_UP);
    }
    const want = base * scale;
    stepCarry += want * stepScale;
    const n = Math.max(0, Math.floor(stepCarry));
    stepCarry -= n;
    stats.stepsPerFrame = base; stats.stepScale = stepScale;
    begin();
    let done = 0;
    for (; done < n; done++) {
      if (done > 0 && performance.now() - now > FRAME_BUDGET_MS) break;
      stepOnce();
    }
    stats.shed += Math.max(0, Math.round(want - done));
    renderViews();
    end();
    if (now - lastRead >= READ_PERIOD_MS) { lastRead = now; sampleForce(); }
    const t1 = performance.now();
    if (!window1.start) window1.start = now;
    window1.frames++; window1.issue += t1 - now;
    if (lastFrameAt) window1.wall = (window1.wall || 0) + (now - lastFrameAt);
    lastFrameAt = now;
    if (now - lastStatsAt >= STATS_PERIOD_MS) {
      const span = Math.max(1, now - window1.start);
      stats.stepsPerSecond = Math.round(window1.steps * 1000 / span);
      stats.msPerFrame = window1.frames > 1 ? (window1.wall || 0) / (window1.frames - 1) : 0;
      stats.issueMs = window1.issue / Math.max(1, window1.frames);
      lastStatsAt = now;
      Object.assign(window1, { start: now, frames: 0, steps: 0, issue: 0, wall: 0 });
      bus.emit('lattice:stats', {
        grid: stats.grid.slice(), stepsPerSecond: stats.stepsPerSecond, force: api.force,
        msPerFrame: stats.msPerFrame, precision: stats.precision, re: stats.re, tier,
      });
    }
  }

  function fieldsView() {
    if (!fA) return null;
    return {
      velocity: { texture: macro.texture, channels: 'rg', units: 'lattice units (cells per step)' },
      density: { texture: macro.texture, channels: 'b', units: 'rho - 1' },
      vorticity: { texture: macro.texture, channels: 'a', units: 'per step, counter-clockwise in the grid' },
      dye: { texture: dyeA.texture, channels: 'rg', units: 'rake smoke, wall dye (0..1)' },
      distributions: fA.textures,
      cells: cellTex,
    };
  }
  function resources() {
    return { targets: targets.size, materials: materials.length, textures: cellTex ? 1 : 0, geometries: destroyed ? 0 : 1 };
  }

  /* context loss: stop, then rebuild the state when the browser restores it */
  const canvas = renderer.domElement;
  const onLost = () => { lost = true; stats.lost = true; };
  const onRestored = () => { lost = false; stats.lost = false; if (cellTex) cellTex.needsUpdate = true; if (live && tier > 0) reset(); };
  canvas?.addEventListener?.('webglcontextlost', onLost);
  canvas?.addEventListener?.('webglcontextrestored', onRestored);

  function destroy() {
    if (destroyed) return;
    destroyed = true; live = false;
    canvas?.removeEventListener?.('webglcontextlost', onLost);
    canvas?.removeEventListener?.('webglcontextrestored', onRestored);
    for (const t of targets) t.dispose();
    targets.clear();
    for (const m of materials) m.dispose();
    materials.length = 0;
    quad.dispose();
    if (cellTex) cellTex.dispose();
    cellTex = null; fA = fB = macro = dyeA = dyeB = view = null; chain = [];
    api.texture = null; api.force = null;
  }

  return api;
}

export default createLattice;
