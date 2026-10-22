/* Wind tunnel: a WebGL2 stable-fluids solver with the rocket silhouette as a
   solid obstacle, a smoke rake on the inflow edge, pointer disturbance and four
   field views. Hero backdrop only: the stage canvas draws the real rocket above
   the transparent cut-out this module leaves where the obstacle is.

   Per step at tier 3 (about 35 draws plus one per pointer splat):
     boundary write (inflow, outflow, free-slip walls, no-slip obstacle)
     MacCormack advection of velocity (bilinear at tier 2)
     curl, vorticity confinement (eps 0.06 per step, see params)
     pointer splats (velocity and dye)
     divergence, damped Jacobi pressure (24 at tier 3, 16 at tier 2) around a
     two-level correction on a grid four times coarser (120 / 64 sweeps there,
     a sixteenth of a fine sweep each), gradient subtraction
     dye advection at 2x the velocity grid, rake injection, composite.

   Start-up is spread over animation frames so the page stays interactive:
   the context is created at once (so `fallback` answers "no WebGL2"
   synchronously), the 26 programs are issued together without reading any
   status and the driver links them in the background while the page runs;
   a fence behind the links is polled once per frame without waiting and their
   status is read in one pass on the frame after it signals (with
   KHR_parallel_shader_compile: each program as soon as it reports complete);
   the grids are allocated on the next frame and the warm-up steps begin on the
   frame after that. stats.build records the frames, the wall time and the
   main-thread time the status reads cost.

   Units: velocity in grid cells per second on a staggered (MAC) lattice, DT =
   1/60 s per step, pressure is the projection pseudo-pressure (see shaders.js).
   The grid is independent of DPR; the composite is drawn at canvas resolution.
   Grid y runs down the canvas.

   Public surface (ARCHITECTURE.md section 4, tunnel):
     createTunnel(canvas, { tier, dpr, forcePacked, preroll }) ->
       setObstacle(shapes), setPointer(x, y, vx, vy), setFreestream(u), setField(f),
       setTier(t), setVisible(b), setFade(f), freeze(b), reset(), step(n), draw(),
       selfCheck(), resize(), destroy(), params, stats, fallback, canvas
     bus event tunnel:stats at 1 Hz, from the first frame with grids. */
import { bus } from '../core/bus.js';
import { governor } from '../core/governor.js';
import { createGL } from './gl.js';
import * as S from './shaders.js';

/* Section 7.7 budgets. `width` is the cell count along the canvas's long side.
   `coarse` is the sweep count on the W/4 correction level (each one sixteenth
   of a fine sweep): information crosses that level one cell per sweep, so the
   80-wide coarse grid of tier 3 needs more of them than the 48-wide one. */
export const TIERS = {
  3: { width: 320, jacobi: 24, coarse: 120, maccormack: true, run: true, label: 'full' },
  2: { width: 192, jacobi: 16, coarse: 64, maccormack: false, run: true, label: 'reduced' },
  1: { width: 192, jacobi: 16, coarse: 64, maccormack: false, run: false, frozen: true, label: 'frozen' },
  0: { width: 0, jacobi: 0, coarse: 0, maccormack: false, run: false, off: true, label: 'off' },
};
export const FIELDS = ['smoke', 'velocity', 'pressure', 'vorticity'];

const DT = 1 / 60;             /* s per step */
const U_REF = 0.14;            /* canvas widths per second at uInf = 1 (about 7 s to cross) */
const CFL_MAX = 1.0;           /* cells per step the free stream may not exceed */
const RAMP_MS = 1200;          /* freestream ramp, on the site's easing */
const FROZEN_STEPS = 240;      /* steps settled off screen for the tier 1 still frame */
const WARMUP_CHUNK = 24;       /* steps per animation frame while settling, keeps the thread responsive */
const PIXEL_BUDGET = 2.2e6;    /* composite pixels; DPR is lowered beyond this */
const SPLAT_RADIUS = 0.028;    /* of the canvas width, Gaussian e-fold radius */
const SPLAT_GAIN = 0.5;        /* pointer speed in cells/s to impulse in cells/s */
const SPLAT_MAX = 90;          /* cells/s, impulse clamp */
const SPLAT_DYE = 0.5;         /* smoke density a fast flick leaves behind */
const SPLAT_SPEED_REF = 1200;  /* CSS px/s that counts as a fast flick */
const MAX_SPLATS = 4;          /* per step; older pointer samples are dropped */
const RAKE_SIGMA = 1.5;        /* velocity cells */
const RAKE_STRENGTH = 1.0;     /* density held at a port centre */
const RAKE_X = 1.5;            /* cells from the inflow edge */
const RAKE_SPAN = 0.72;        /* of the grid height the ports spread over */
const SMOKE_ALPHA = 0.6;       /* paper white ceiling in the smoke view */
const JACOBI_OMEGA = 0.8;      /* damped Jacobi weight, the optimal 2D smoother */
const MIN_CELLS = 16;          /* short-side floor so an extreme aspect never collapses the grid */
const RESIZE_DEBOUNCE_MS = 120;
const BUILD_POLL_FRAMES = 120; /* frames to poll for completion before reading LINK_STATUS regardless */

/* [key, source, defines]: every program the solver and the composite use,
   issued in this order (the allocation's fills first). */
const PROGRAMS = [
  ['fillVel', S.FILL, ['KIND_VEL']], ['fillS', S.FILL, ['KIND_S']], ['fillDye', S.FILL, ['KIND_DYE']],
  ['copyVel', S.COPY_VEL], ['copyS', S.COPY, ['KIND_S']], ['copyDye', S.COPY, ['KIND_DYE']],
  ['mask', S.MASK], ['coarseMask', S.COARSE_MASK],
  ['boundary', S.BOUNDARY], ['advectVel', S.ADVECT_VEL], ['macVel', S.MACCORMACK_VEL],
  ['curl', S.CURL], ['vorticity', S.VORTICITY], ['splatVel', S.SPLAT_VEL], ['splatDye', S.SPLAT, ['KIND_DYE']],
  ['divergence', S.DIVERGENCE], ['jacobi', S.JACOBI], ['residual', S.RESIDUAL], ['restrict', S.RESTRICT],
  ['prolongate', S.PROLONGATE], ['gradient', S.GRADIENT],
  ['advectDye', S.ADVECT_DYE], ['macDye', S.MACCORMACK_DYE], ['rake', S.RAKE, ['KIND_DYE']],
  ['composite', S.COMPOSITE], ['readback', S.READBACK],
];

/* cubic-bezier(0.22, 1, 0.36, 1), the site's one easing, solved for y at a given x. */
export function cubicBezier(x1, y1, x2, y2) {
  const A = (a1, a2) => 1 - 3 * a2 + 3 * a1, B = (a1, a2) => 3 * a2 - 6 * a1, C = (a1) => 3 * a1;
  const at = (t, a1, a2) => ((A(a1, a2) * t + B(a1, a2)) * t + C(a1)) * t;
  const slope = (t, a1, a2) => 3 * A(a1, a2) * t * t + 2 * B(a1, a2) * t + C(a1);
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const s = slope(t, x1, x2);
      if (Math.abs(s) < 1e-6) break;
      t -= (at(t, x1, x2) - x) / s;
      t = Math.min(1, Math.max(0, t));
    }
    return at(t, y1, y2);
  };
}
export const easeOut = cubicBezier(0.22, 1, 0.36, 1);

const clampTier = (t) => Math.max(0, Math.min(3, Number.isFinite(t) ? Math.round(t) : 3));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function createTunnel(canvas, options = {}) {
  /* eps: fraction of the local vorticity added per step. 0.06 keeps the free
     stream laminar and the wake crisp; 0.18 (the concept's figure, which came
     from splat-art presets) amplifies grid-scale noise into turbulence
     everywhere downstream, see the lab's eps slider. */
  const params = { uInf: 1, eps: 0.06, jacobi: 24, coarse: 120, rake: 7, dyeDecay: 0.996, velDecay: 0.998, field: 'smoke', grid: [0, 0] };
  const stats = {
    steps: 0, stepMs: 0, frames: 0, fps: 0, drawsPerStep: 0, tier: 0, path: 'OFF', renderer: '',
    grid: [0, 0], dyeGrid: [0, 0], uInfCells: 0, cfl: 0, jacobi: 0, maccormack: false,
    running: false, visible: true, hidden: !!document.hidden, lost: false, frozen: false, divRms: null, preroll: 0, coarse: 120,
    /* start-up record: programs linked of total, frames and wall ms the build
       spanned, main-thread ms spent on status reads */
    build: { parallel: false, programs: PROGRAMS.length, linked: 0, frames: 0, ms: 0, waitMs: 0, done: false },
  };

  let tier = clampTier(options.tier ?? governor.tier);
  let G = null, P = null, F = null;       /* gl layer, programs (set once all are linked), fields */
  let fallback = null;                   /* null until the first context attempt; true for good once WebGL2 or the GLSL fails */
  let building = false, buildRaf = 0;    /* the multi-frame program build, then the frame that allocates the grids */
  let W = 0, H = 0, cssW = 0, cssH = 0;
  let shapes = [];
  const shapeA = new Float32Array(48), shapeB = new Float32Array(48);
  let shapeCount = 0, maskDirty = true;
  const splats = [];
  let raf = 0, warmRaf = 0, running = false, visible = true, frozen = false, lost = false, destroyed = false;
  let acc = 0, lastFrame = 0, fade = 1;
  let maccormack = TIERS[tier].maccormack;
  const preroll = Math.max(0, Math.min(2000, Math.round(+options.preroll || 0)));   /* steps settled before the first frame */
  const ramp = { from: 0, to: params.uInf, t0: 0, started: false };
  let uEff = 0, uInfCells = 0;
  let resizeTimer = 0;

  /* ---------- GL setup ---------- */
  /* true once the context exists and every program is linked. The first call
     creates the context and starts the build; the build calls resize() and
     resume() itself when it is done. */
  function initGL() {
    if (P) return true;
    if (building || lost || fallback === true) return false;     /* a lost context rebuilds from onRestored */
    try {
      G = createGL(canvas, { forcePacked: !!options.forcePacked });
    } catch { G = null; }
    if (!G) { fallback = true; stats.path = 'NO WEBGL2'; return false; }
    fallback = false;
    stats.path = G.path;
    buildPrograms();
    return false;
  }
  /* Issue every program at once (well under a millisecond: nothing is read
     back), then finish them on a later frame, once the driver is through. A
     status read is a round trip that queues behind whatever the GPU process is
     busy with, so the reads go in one pass when there is nothing left to wait
     for, never spread thin over the seconds when the stage uploads and draws for
     the first time. Without the extension "through" is a fence issued behind
     the links; with it each program says so itself and is finished then. */
  function buildPrograms() {
    const pending = [], built = {};
    const b = stats.build;
    b.parallel = G.parallel; b.linked = 0; b.frames = 0; b.ms = 0; b.waitMs = 0; b.done = false;
    const t0 = performance.now();
    let fence = null;
    building = true;
    const finish = (job) => {
      const tw = performance.now();
      built[job.key] = G.finish(job.p);
      b.waitMs += performance.now() - tw; b.linked++;
    };
    const tick = () => {
      buildRaf = 0;
      if (destroyed || lost || !G || G.gl.isContextLost()) { building = false; return; }
      b.frames++;
      try {
        const force = b.frames > BUILD_POLL_FRAMES;
        if (b.frames === 1) {
          for (const [key, src, defines] of PROGRAMS) pending.push({ key, p: G.program(src, defines) });
          if (!G.parallel) fence = G.fence();
        } else if (G.parallel) {
          for (let i = 0; i < pending.length; i++) {
            if (force || G.linked(pending[i].p)) { finish(pending[i]); pending.splice(i--, 1); }
          }
        } else {
          const through = G.fenceDone(fence);
          if (through || force) {
            if (!through) G.gl.deleteSync(fence);
            fence = null;
            while (pending.length) finish(pending.shift());
          }
        }
      } catch (err) {
        /* a driver that rejects the GLSL: behave exactly like no WebGL */
        console.info('[tunnel] shader build failed, tunnel off:', err && err.message);
        try { G.clearCanvas(); G.destroy(); } catch { /* context may be gone */ }
        G = null; building = false; fallback = true; stats.path = 'SHADER BUILD FAILED';
        return;
      }
      b.ms = performance.now() - t0;
      if (pending.length) { buildRaf = requestAnimationFrame(tick); return; }
      P = built; building = false; b.done = true;
      stats.renderer = G.rendererString();
      /* the grids on a frame of their own: allocation is a burst of uploads and clears */
      buildRaf = requestAnimationFrame(() => { buildRaf = 0; resize(); resume(); });
    };
    tick();
  }
  function cancelBuild() { if (buildRaf) cancelAnimationFrame(buildRaf); buildRaf = 0; building = false; }

  function fill(prog, t, value) {
    const u = G.use(prog);
    G.gl.uniform4f(u.u_value, value, 0, 0, 0);
    G.draw(t);
  }
  function copy(prog, src, dst, scale) {
    const u = G.use(prog);
    G.tex(0, src.tex);
    G.gl.uniform1i(u.u_src, 0);
    G.gl.uniform2f(u.u_srcSize, src.w, src.h);
    if (u.u_size) G.gl.uniform2f(u.u_size, dst.w, dst.h);
    G.gl.uniform1f(u.u_scale, scale);
    G.draw(dst);
  }
  function releaseFields(f) {
    if (!f) return;
    f.vel.release(); G.release(f.velScratch); f.pres.release(); G.release(f.div); G.release(f.curl);
    G.release(f.mask); G.release(f.scratchS); f.dye.release(); G.release(f.dyeScratch); G.release(f.bytes);
    f.presC.release(); G.release(f.resC); G.release(f.maskC);
  }
  /* Allocate the grids. An existing field set is resampled into the new one
     (velocity scaled by the cell ratio, pressure by its square) so a tier change
     or an aspect change never resets the flow. */
  function allocate(w, h) {
    const old = F;
    const wc = Math.ceil(w / 4), hc = Math.ceil(h / 4);       /* coarse pressure level */
    F = {
      w, h, dw: w * 2, dh: h * 2, wc, hc,
      vel: G.pair(w, h, 'vel'), velScratch: G.target(w, h, 'vel'),
      pres: G.pair(w, h, 'scalar32'),
      div: G.target(w, h, 'scalar32'), curl: G.target(w, h, 'scalar'), mask: G.target(w, h, 'scalar'),
      scratchS: G.target(w, h, 'scalar32'),
      presC: G.pair(wc, hc, 'scalar32'), resC: G.target(wc, hc, 'scalar32'), maskC: G.target(wc, hc, 'scalar'),
      dye: G.pair(w * 2, h * 2, 'dye'), dyeScratch: G.target(w * 2, h * 2, 'dye'),
      bytes: null,
    };
    for (const t of [F.vel.read, F.vel.write, F.velScratch]) fill(P.fillVel, t, 0);
    for (const t of [F.pres.read, F.pres.write, F.div, F.curl, F.scratchS, F.presC.read, F.presC.write, F.resC]) fill(P.fillS, t, 0);
    fill(P.fillS, F.maskC, 1);
    for (const t of [F.dye.read, F.dye.write, F.dyeScratch]) fill(P.fillDye, t, 0);
    if (old) {
      const s = w / old.w;
      copy(P.copyVel, old.vel.read, F.vel.read, s);
      copy(P.copyS, old.pres.read, F.pres.read, s * s);
      copy(P.copyDye, old.dye.read, F.dye.read, 1);
      releaseFields(old);
    }
    W = w; H = h;
    params.grid = [w, h];
    stats.grid = [w, h]; stats.dyeGrid = [w * 2, h * 2];
    maskDirty = true;
  }
  /* The budget width goes on the long side; the short side follows the aspect.
     Both counts are multiples of 4 so every coarse cell covers a whole 4 x 4
     block: a partial block along a wall makes the coarse kernel attribute a
     full cell's area to a half cell, its correction there overshoots by two,
     and the warm-started pressure grows along that wall step after step. The
     aspect error this leaves is under 2 cells; the composite and the obstacle
     are mapped by the canvas, so nothing on screen shifts. */
  function gridDims(width) {
    const snap = (n) => Math.max(MIN_CELLS, 4 * Math.round(n / 4));
    if (cssW >= cssH) return [snap(width), snap(cssH * width / cssW)];
    return [snap(cssW * width / cssH), snap(width)];
  }
  function ensureFields() {
    const spec = TIERS[tier];
    if (spec.off || !G) return false;
    const [w, h] = gridDims(spec.width);
    if (!F || w !== W || h !== H) allocate(w, h);
    return true;
  }

  /* ---------- obstacle ---------- */
  function uploadShapes() {
    if (!W || !cssW) return;
    const sx = W / cssW, sy = H / cssH, sr = (sx + sy) / 2;
    shapeCount = 0;
    for (const s of shapes) {
      if (shapeCount >= 12) break;
      const i = shapeCount * 4;
      if (s.kind === 'capsule') {
        shapeA.set([s.x1 * sx, s.y1 * sy, s.x2 * sx, s.y2 * sy], i);
        shapeB.set([Math.max(0, s.r) * sr, 0, 0, 0], i);
      } else if (s.kind === 'box') {
        const cx = s.cx ?? (s.x + s.w / 2), cy = s.cy ?? (s.y + s.h / 2);
        const a = (s.angle || 0) * Math.PI / 180;
        shapeA.set([cx * sx, cy * sy, s.w / 2 * sx, s.h / 2 * sy], i);
        shapeB.set([Math.cos(a), Math.sin(a), 0, 1], i);
      } else continue;
      shapeCount++;
    }
    maskDirty = true;
  }
  function writeMask() {
    const u = G.use(P.mask);
    G.gl.uniform4fv(u.u_shapeA, shapeA);
    G.gl.uniform4fv(u.u_shapeB, shapeB);
    G.gl.uniform1i(u.u_count, shapeCount);
    G.draw(F.mask);
    const c = G.use(P.coarseMask);
    G.tex(0, F.mask.tex);
    G.gl.uniform1i(c.u_mask, 0); G.gl.uniform2f(c.u_fineSize, W, H);
    G.draw(F.maskC);
    maskDirty = false;
  }

  /* ---------- parameters ---------- */
  function readParams(now) {
    params.uInf = clamp(+params.uInf || 0, 0, 2);
    params.eps = clamp(+params.eps || 0, 0, 1);
    params.jacobi = clamp(Math.round(+params.jacobi || 1), 1, 64);
    params.coarse = clamp(Math.round(+params.coarse || 0), 0, 240);
    params.rake = clamp(Math.round(+params.rake || 0), 0, 9);
    params.dyeDecay = clamp(+params.dyeDecay || 0, 0.9, 1);
    params.velDecay = clamp(+params.velDecay || 0, 0.9, 1);
    if (!FIELDS.includes(params.field)) params.field = 'smoke';
    if (params.uInf !== ramp.to) { ramp.from = uEff; ramp.to = params.uInf; ramp.t0 = now; }
    const k = ramp.t0 ? easeOut(Math.min(1, (now - ramp.t0) / RAMP_MS)) : 1;
    uEff = ramp.from + (ramp.to - ramp.from) * k;
    /* cells per second, clamped so the free stream never crosses more than CFL_MAX cells per step */
    uInfCells = Math.min(uEff * U_REF * W, CFL_MAX / DT);
    stats.uInfCells = uInfCells;
    stats.cfl = uInfCells * DT;
    stats.jacobi = params.jacobi;
    stats.coarse = params.coarse;
    stats.maccormack = maccormack;
  }

  /* ---------- one solver step ---------- */
  function step() {
    if (!F || lost) return;
    const gl = G.gl;
    const t0 = performance.now();
    let draws = 0;
    const D = (t) => { G.draw(t); draws++; };
    readParams(t0);
    if (maskDirty) writeMask();
    const dw = F.dw, dh = F.dh;
    let u;

    /* 1. boundaries and the obstacle */
    u = G.use(P.boundary);
    G.tex(0, F.vel.read.tex); G.tex(1, F.mask.tex);
    gl.uniform1i(u.u_vel, 0); gl.uniform1i(u.u_mask, 1);
    gl.uniform2f(u.u_size, W, H); gl.uniform1f(u.u_uInf, uInfCells);
    D(F.vel.write); F.vel.swap();

    /* 2. self-advection */
    if (maccormack) {
      u = G.use(P.advectVel);
      G.tex(0, F.vel.read.tex); G.tex(1, F.vel.read.tex);
      gl.uniform1i(u.u_vel, 0); gl.uniform1i(u.u_src, 1);
      gl.uniform2f(u.u_size, W, H); gl.uniform1f(u.u_decay, 1); gl.uniform1f(u.u_uInf, uInfCells);
      D(F.velScratch);
      u = G.use(P.macVel);
      G.tex(0, F.vel.read.tex); G.tex(1, F.vel.read.tex); G.tex(2, F.velScratch.tex);
      gl.uniform1i(u.u_vel, 0); gl.uniform1i(u.u_src, 1); gl.uniform1i(u.u_fwd, 2);
      gl.uniform2f(u.u_size, W, H); gl.uniform1f(u.u_decay, params.velDecay); gl.uniform1f(u.u_uInf, uInfCells);
      D(F.vel.write); F.vel.swap();
    } else {
      u = G.use(P.advectVel);
      G.tex(0, F.vel.read.tex); G.tex(1, F.vel.read.tex);
      gl.uniform1i(u.u_vel, 0); gl.uniform1i(u.u_src, 1);
      gl.uniform2f(u.u_size, W, H); gl.uniform1f(u.u_decay, params.velDecay); gl.uniform1f(u.u_uInf, uInfCells);
      D(F.vel.write); F.vel.swap();
    }

    /* 3. curl, 4. vorticity confinement */
    u = G.use(P.curl);
    G.tex(0, F.vel.read.tex);
    gl.uniform1i(u.u_vel, 0); gl.uniform2f(u.u_size, W, H);
    D(F.curl);
    if (params.eps > 0) {
      u = G.use(P.vorticity);
      G.tex(0, F.vel.read.tex); G.tex(1, F.curl.tex); G.tex(2, F.mask.tex);
      gl.uniform1i(u.u_vel, 0); gl.uniform1i(u.u_curl, 1); gl.uniform1i(u.u_mask, 2);
      gl.uniform2f(u.u_size, W, H); gl.uniform1f(u.u_eps, params.eps);
      D(F.vel.write); F.vel.swap();
    }

    /* 5. pointer splats */
    if (splats.length) {
      const r = SPLAT_RADIUS * W;
      for (const sp of splats) {
        u = G.use(P.splatVel);
        G.tex(0, F.vel.read.tex);
        gl.uniform1i(u.u_src, 0); gl.uniform2f(u.u_point, sp.x, sp.y); gl.uniform1f(u.u_radius, r);
        gl.uniform4f(u.u_value, sp.vx, sp.vy, 0, 0);
        D(F.vel.write); F.vel.swap();
        if (sp.dye > 0) {
          u = G.use(P.splatDye);
          G.tex(0, F.dye.read.tex);
          gl.uniform1i(u.u_src, 0); gl.uniform2f(u.u_point, sp.x * 2, sp.y * 2); gl.uniform1f(u.u_radius, r * 2);
          gl.uniform4f(u.u_value, sp.dye, 0, 0, 0);
          D(F.dye.write); F.dye.swap();
        }
      }
      splats.length = 0;
    }

    /* 6. divergence, 7. Jacobi, 8. projection */
    u = G.use(P.divergence);
    G.tex(0, F.vel.read.tex); G.tex(1, F.mask.tex);
    gl.uniform1i(u.u_vel, 0); gl.uniform1i(u.u_mask, 1); gl.uniform2f(u.u_size, W, H);
    D(F.div);
    const sweeps = (n, pair, div, mask, w, h, h2) => {
      u = G.use(P.jacobi);
      G.tex(1, mask.tex); G.tex(2, div.tex);
      gl.uniform1i(u.u_p, 0); gl.uniform1i(u.u_mask, 1); gl.uniform1i(u.u_div, 2); gl.uniform2f(u.u_size, w, h);
      gl.uniform1f(u.u_omega, JACOBI_OMEGA); gl.uniform1f(u.u_h2, h2);
      for (let i = 0; i < n; i++) { G.tex(0, pair.read.tex); D(pair.write); pair.swap(); }
    };
    const pre = params.coarse > 0 ? Math.max(1, Math.round(params.jacobi / 3)) : params.jacobi;
    sweeps(pre, F.pres, F.div, F.mask, W, H, 1);
    if (params.coarse > 0) {
      /* residual to the coarse level, solve the correction there, add it back */
      u = G.use(P.residual);
      G.tex(0, F.pres.read.tex); G.tex(1, F.mask.tex); G.tex(2, F.div.tex);
      gl.uniform1i(u.u_p, 0); gl.uniform1i(u.u_mask, 1); gl.uniform1i(u.u_div, 2); gl.uniform2f(u.u_size, W, H);
      D(F.scratchS);
      u = G.use(P.restrict);
      G.tex(0, F.scratchS.tex); G.tex(1, F.mask.tex);
      gl.uniform1i(u.u_src, 0); gl.uniform1i(u.u_mask, 1); gl.uniform2f(u.u_fineSize, W, H);
      D(F.resC);
      fill(P.fillS, F.presC.read, 0); draws++;
      sweeps(params.coarse, F.presC, F.resC, F.maskC, F.wc, F.hc, 16);
      u = G.use(P.prolongate);
      G.tex(0, F.pres.read.tex); G.tex(1, F.presC.read.tex); G.tex(2, F.mask.tex); G.tex(3, F.maskC.tex);
      gl.uniform1i(u.u_p, 0); gl.uniform1i(u.u_e, 1); gl.uniform1i(u.u_mask, 2); gl.uniform1i(u.u_maskC, 3); gl.uniform2f(u.u_coarseSize, F.wc, F.hc);
      D(F.pres.write); F.pres.swap();
      sweeps(params.jacobi - pre, F.pres, F.div, F.mask, W, H, 1);
    }
    u = G.use(P.gradient);
    G.tex(0, F.pres.read.tex); G.tex(1, F.mask.tex); G.tex(2, F.vel.read.tex);
    gl.uniform1i(u.u_p, 0); gl.uniform1i(u.u_mask, 1); gl.uniform1i(u.u_vel, 2);
    gl.uniform2f(u.u_size, W, H); gl.uniform1f(u.u_uInf, uInfCells);
    D(F.vel.write); F.vel.swap();

    /* 9. dye advection on the 2x grid */
    if (maccormack) {
      u = G.use(P.advectDye);
      G.tex(0, F.vel.read.tex); G.tex(1, F.dye.read.tex);
      gl.uniform1i(u.u_vel, 0); gl.uniform1i(u.u_src, 1);
      gl.uniform2f(u.u_velSize, W, H); gl.uniform2f(u.u_size, dw, dh); gl.uniform1f(u.u_decay, 1);
      D(F.dyeScratch);
      u = G.use(P.macDye);
      G.tex(0, F.vel.read.tex); G.tex(1, F.dye.read.tex); G.tex(2, F.dyeScratch.tex);
      gl.uniform1i(u.u_vel, 0); gl.uniform1i(u.u_src, 1); gl.uniform1i(u.u_fwd, 2);
      gl.uniform2f(u.u_velSize, W, H); gl.uniform2f(u.u_size, dw, dh); gl.uniform1f(u.u_decay, params.dyeDecay);
      D(F.dye.write); F.dye.swap();
    } else {
      u = G.use(P.advectDye);
      G.tex(0, F.vel.read.tex); G.tex(1, F.dye.read.tex);
      gl.uniform1i(u.u_vel, 0); gl.uniform1i(u.u_src, 1);
      gl.uniform2f(u.u_velSize, W, H); gl.uniform2f(u.u_size, dw, dh); gl.uniform1f(u.u_decay, params.dyeDecay);
      D(F.dye.write); F.dye.swap();
    }

    /* 10. smoke rake */
    if (params.rake > 0) {
      const n = params.rake;
      const dy = n > 1 ? dh * RAKE_SPAN / (n - 1) : 0;
      u = G.use(P.rake);
      G.tex(0, F.dye.read.tex);
      gl.uniform1i(u.u_dye, 0); gl.uniform1i(u.u_ports, n);
      gl.uniform1f(u.u_x, RAKE_X * 2); gl.uniform1f(u.u_y0, dh / 2 - (n - 1) / 2 * dy); gl.uniform1f(u.u_dy, dy);
      gl.uniform1f(u.u_sigma, RAKE_SIGMA * 2); gl.uniform1f(u.u_strength, RAKE_STRENGTH);
      D(F.dye.write); F.dye.swap();
    }

    stats.steps++;
    stats.drawsPerStep = draws;
    const ms = performance.now() - t0;
    stats.stepMs = stats.stepMs ? stats.stepMs + 0.1 * (ms - stats.stepMs) : ms;
  }

  /* ---------- composite ---------- */
  function draw() {
    if (!F || lost || !G || TIERS[tier].off) return;       /* tier 0 draws nothing, whoever asks */
    const gl = G.gl;
    const field = FIELDS.indexOf(params.field);
    if (field === 3) {
      /* the vorticity view wants the curl of the projected field, not the pre-projection one */
      const c = G.use(P.curl);
      G.tex(0, F.vel.read.tex);
      gl.uniform1i(c.u_vel, 0); gl.uniform2f(c.u_size, W, H);
      G.draw(F.curl);
    }
    const u = G.use(P.composite);
    G.tex(0, F.dye.read.tex); G.tex(1, F.vel.read.tex); G.tex(2, F.pres.read.tex); G.tex(3, F.curl.tex);
    gl.uniform1i(u.u_dye, 0); gl.uniform1i(u.u_vel, 1); gl.uniform1i(u.u_p, 2); gl.uniform1i(u.u_curl, 3);
    gl.uniform2f(u.u_velSize, W, H);
    gl.uniform2f(u.u_canvas, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.uniform1f(u.u_cell, gl.drawingBufferWidth / W);
    gl.uniform1i(u.u_field, Math.max(0, field));
    const uc = Math.max(uInfCells, 1e-3);
    gl.uniform1f(u.u_uInf, uc);
    gl.uniform1f(u.u_pScale, 0.5 * uc * uc * DT);   /* stagnation pseudo-pressure */
    gl.uniform1f(u.u_wScale, uc * 0.5);             /* shear across about two cells */
    gl.uniform1f(u.u_alpha, SMOKE_ALPHA);
    gl.uniform1f(u.u_fade, fade);
    gl.uniform4fv(u.u_shapeA, shapeA); gl.uniform4fv(u.u_shapeB, shapeB); gl.uniform1i(u.u_count, shapeCount);
    G.draw(null);
    stats.frames++;
  }

  /* ---------- loop ---------- */
  function shouldRun() {
    return !destroyed && !lost && visible && !document.hidden && !frozen && !!F && TIERS[tier].run;
  }
  function frame(now) {
    raf = 0;
    if (!shouldRun()) { running = false; stats.running = false; return; }
    raf = requestAnimationFrame(frame);
    const dt = lastFrame ? Math.min(now - lastFrame, 100) : 1000 / 60;
    lastFrame = now;
    stats.fps = stats.fps ? stats.fps + 0.08 * (1000 / Math.max(dt, 1) - stats.fps) : 1000 / dt;
    /* fixed 1/60 s steps from an accumulator: 120 Hz displays step every other
       frame, slow frames step once and let the simulation run slow rather than
       pile up work */
    acc += dt;
    let n = Math.floor((acc + 0.5) / (1000 / 60));
    if (n > 2 || dt > 25) n = Math.min(n, 1);
    acc = Math.min(acc - n * (1000 / 60), 1000 / 60);
    if (n > 0) { for (let i = 0; i < n; i++) step(); draw(); }
  }
  function start() {
    if (running || !shouldRun()) return;
    running = true; stats.running = true;
    lastFrame = 0; acc = 0;
    if (!ramp.started) { ramp.started = true; ramp.from = 0; ramp.to = params.uInf; ramp.t0 = performance.now(); }
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0; running = false; stats.running = false;
  }
  function stopWarmup() { if (warmRaf) cancelAnimationFrame(warmRaf); warmRaf = 0; }
  /* Settle the field in chunks of WARMUP_CHUNK steps per animation frame
     until `target` steps exist, with the free stream already at its setpoint,
     then call `then`. Tier 1 uses it off screen for its one still frame; the
     `preroll` option uses it so a page can start with a developed wake, and
     draws after every chunk (`show`) so the canvas is never blank or stale
     while a slow GPU is still settling: the flow visibly fills in, fast. */
  function warmup(target, then, show = false) {
    stop(); stopWarmup();
    if (!F) return;
    if (!ramp.started) { ramp.started = true; ramp.from = params.uInf; ramp.to = params.uInf; ramp.t0 = 0; }
    const chunk = () => {
      warmRaf = 0;
      if (destroyed || lost || !F) return;
      const n = Math.min(WARMUP_CHUNK, target - stats.steps);
      for (let i = 0; i < n; i++) step();
      if (stats.steps < target) { if (show) draw(); warmRaf = requestAnimationFrame(chunk); }
      else then();
    };
    /* the first chunk on the next frame too: whatever asked (the grid
       allocation, a tier change) has already had this one */
    warmRaf = requestAnimationFrame(chunk);
  }
  /* Whatever the tier wants now: loop, settle and freeze, or nothing. */
  function resume() {
    if (!G || !F || lost || destroyed) return;
    /* a warm-up under way already finishes what this call would start (every
       state change that should alter it cancels it first); restarting it here
       would starve it, since the page calls setVisible(true) on every scroll frame */
    if (warmRaf) return;
    const spec = TIERS[tier];
    if (spec.off) return;
    if (!visible || document.hidden) return;
    if (spec.frozen || frozen) { if (stats.steps < FROZEN_STEPS && !frozen) warmup(FROZEN_STEPS, draw); else draw(); return; }
    if (stats.steps < preroll) { warmup(preroll, () => { draw(); start(); }, true); return; }
    start();
  }

  /* ---------- sizing ---------- */
  function resize() {
    if (destroyed) return;
    const r = canvas.getBoundingClientRect();
    cssW = r.width || canvas.clientWidth; cssH = r.height || canvas.clientHeight;
    if (cssW < 2 || cssH < 2) return;
    let d = options.dpr ?? governor.dpr(tier);
    if (cssW * cssH * d * d > PIXEL_BUDGET) d = Math.sqrt(PIXEL_BUDGET / (cssW * cssH));
    const pw = Math.max(1, Math.round(cssW * d)), ph = Math.max(1, Math.round(cssH * d));
    const changed = canvas.width !== pw || canvas.height !== ph;
    if (changed) { canvas.width = pw; canvas.height = ph; }
    if (TIERS[tier].off) return;
    if (!initGL()) return;
    if (!ensureFields()) return;
    uploadShapes();
    if (changed && !running) draw();
  }
  function scheduleResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { resize(); if (!running) resume(); }, RESIZE_DEBOUNCE_MS);
  }

  /* ---------- readback (self-check) ---------- */
  /* Scalar texture to a Float32Array through the 24 bit readback target. The
     render is enqueued now, the bytes arrive when the GPU has passed it. */
  async function readScalar(t, range) {
    if (!F.bytes) F.bytes = G.target(W, H, 'bytes');
    const u = G.use(P.readback);
    G.tex(0, t.tex);
    G.gl.uniform1i(u.u_src, 0); G.gl.uniform1f(u.u_range, range);
    G.draw(F.bytes);
    const w = W, h = H;
    const bytes = await G.readBytes(F.bytes, new Uint8Array(w * h * 4));
    const out = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const v = (bytes[i * 4] * 65536 + bytes[i * 4 + 1] * 256 + bytes[i * 4 + 2]) / 16777215;
      out[i] = (v * 2 - 1) * range;
    }
    return out;
  }
  /* RMS divergence (1/s) of the intermediate and the projected velocity over
     the fluid cells, plus the same over the interior (more than two cells from
     the body and the domain edge) where the projection is fully resolved. On a
     collocated grid the central divergence and gradient compose into a
     wide-stencil Laplacian, so grid-scale divergence on the body surface is
     invisible to the compact Jacobi kernel; the surface band carries most of
     what remains. */
  async function selfCheck() {
    if (!F || lost || !G) return null;
    if (stats.steps === 0) step();
    const w = W, h = H, atStep = stats.steps, u0 = uInfCells;
    const pBefore = readScalar(F.div, 64);
    const u = G.use(P.divergence);
    G.tex(0, F.vel.read.tex); G.tex(1, F.mask.tex);
    G.gl.uniform1i(u.u_vel, 0); G.gl.uniform1i(u.u_mask, 1); G.gl.uniform2f(u.u_size, w, h);
    G.draw(F.scratchS);
    const pAfter = readScalar(F.scratchS, 64);
    const pMask = readScalar(F.mask, 64);
    const [before, after, mask] = await Promise.all([pBefore, pAfter, pMask]);
    if (before.length !== w * h) return null;
    let sb = 0, sa = 0, n = 0, sbi = 0, sai = 0, ni = 0, maxAfter = 0, maxAt = [0, 0];
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (mask[i] < 0) continue;
      const b2 = before[i] * before[i], a2 = after[i] * after[i];
      sb += b2; sa += a2; n++;
      if (mask[i] > 2.5 && x > 2 && x < w - 3 && y > 2 && y < h - 3) { sbi += b2; sai += a2; ni++; }
      if (Math.abs(after[i]) > maxAfter) { maxAfter = Math.abs(after[i]); maxAt = [x, y]; }
    }
    /* continuity: the column mean of u at ten stations must equal the inlet
       speed to within the quantum, whatever the wake does. The float path can
       read u straight from the velocity texture's first channel; the packed
       path cannot decode it through the scalar readback, so it integrates the
       column means of the projected divergence instead (u(x) - U = sum div). */
    const profile = [];
    if (!G.packed) {
      const uTex = await readScalar(F.vel.read, 256);
      for (let k = 0; k <= 9; k++) {
        const x = k === 9 ? w - 2 : Math.max(1, Math.round(k / 9 * (w - 3)));
        let su = 0, nu = 0;
        for (let y = 0; y < h; y++) { const i = y * w + x; if (mask[i] >= 0) { su += uTex[i]; nu++; } }
        profile.push({ x: x / w, u: nu ? su / nu : 0 });
      }
    } else {
      let run = u0;
      for (let x = 0; x < w - 1; x++) {
        let sd = 0; for (let y = 0; y < h; y++) sd += after[y * w + x];
        run += sd / h;
        if (x === 1 || x % Math.max(1, Math.round((w - 3) / 9)) === 0 || x === w - 2) profile.push({ x: x / w, u: run });
      }
    }
    const result = {
      before: Math.sqrt(sb / Math.max(1, n)), after: Math.sqrt(sa / Math.max(1, n)), cells: n,
      beforeInterior: Math.sqrt(sbi / Math.max(1, ni)), afterInterior: Math.sqrt(sai / Math.max(1, ni)), interiorCells: ni,
      maxAfter, maxAt, uInfCells: u0, step: atStep, profile,
    };
    stats.divRms = result;
    return result;
  }

  /* ---------- events ---------- */
  function onLost(e) {
    e.preventDefault();
    lost = true; stats.lost = true;
    stop(); stopWarmup(); cancelBuild();
  }
  function onRestored() {
    lost = false; stats.lost = false;
    /* every GL object died with the context; drop them and rebuild */
    cancelBuild();
    G = null; P = null; F = null; W = H = 0;
    stats.steps = 0; stats.stepMs = 0; stats.divRms = null;
    ramp.started = false;
    resize();
    resume();
  }
  function onVisibility() {
    stats.hidden = !!document.hidden;
    if (document.hidden) { stop(); stopWarmup(); } else resume();
  }
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);
  document.addEventListener('visibilitychange', onVisibility);
  const ro = 'ResizeObserver' in window ? new ResizeObserver(scheduleResize) : null;
  if (ro) ro.observe(canvas); else addEventListener('resize', scheduleResize);
  const statsTimer = setInterval(() => {
    if (destroyed || building || buildRaf) return;       /* nothing to report until the grids exist */
    bus.emit('tunnel:stats', { grid: [W, H], jacobi: params.jacobi, steps: stats.steps, stepMs: stats.stepMs, tier, field: params.field, fps: stats.fps, frames: stats.frames, path: stats.path, running });
  }, 1000);

  /* ---------- public ---------- */
  const tunnel = {
    canvas, params, stats,
    get fallback() { return fallback; },
    get tier() { return tier; },
    get gl() { return G ? G.gl : null; },
    setObstacle(list) {
      shapes = Array.isArray(list) ? list.filter(Boolean).slice(0, 12) : [];
      uploadShapes();
      if (F && !running && !warmRaf) { if (!maskDirty) return; writeMask(); draw(); }
    },
    /* CSS px and CSS px/s. Impulse is the pointer speed in grid units times
       SPLAT_GAIN, clamped to SPLAT_MAX; fast flicks also leave smoke. */
    setPointer(x, y, vx, vy) {
      if (!F || !cssW) return;
      const speed = Math.hypot(vx, vy);
      if (!(speed > 1)) return;
      const sx = W / cssW, sy = H / cssH;
      let ivx = vx * sx * SPLAT_GAIN, ivy = vy * sy * SPLAT_GAIN;
      const m = Math.hypot(ivx, ivy);
      if (m > SPLAT_MAX) { ivx *= SPLAT_MAX / m; ivy *= SPLAT_MAX / m; }
      splats.push({ x: x * sx, y: y * sy, vx: ivx, vy: ivy, dye: Math.min(1, speed / SPLAT_SPEED_REF) * SPLAT_DYE });
      if (splats.length > MAX_SPLATS) splats.shift();
    },
    setFreestream(u) { params.uInf = clamp(+u || 0, 0, 2); },
    setField(f) { if (FIELDS.includes(f)) { params.field = f; if (!running) draw(); } },
    setFade(f) { fade = clamp(+f || 0, 0, 1); if (!running) draw(); },
    setTier(t) {
      t = clampTier(t);
      tier = t; stats.tier = t;
      const spec = TIERS[t];
      stop(); stopWarmup();
      if (spec.off) { if (G) G.clearCanvas(); return; }
      params.jacobi = spec.jacobi;
      params.coarse = spec.coarse;
      maccormack = spec.maccormack;
      resize();
      resume();
    },
    setVisible(v) {
      visible = !!v; stats.visible = visible;
      if (visible) resume(); else { stop(); stopWarmup(); }
    },
    /* Lab control: hold the field still while keeping it drawable. */
    freeze(b) {
      frozen = !!b; stats.frozen = frozen;
      if (frozen) { stop(); stopWarmup(); draw(); } else resume();
    },
    reset() {
      if (!F) return;
      for (const t of [F.vel.read, F.vel.write, F.velScratch]) fill(P.fillVel, t, 0);
      for (const t of [F.pres.read, F.pres.write, F.div, F.curl, F.scratchS]) fill(P.fillS, t, 0);
      for (const t of [F.dye.read, F.dye.write, F.dyeScratch]) fill(P.fillDye, t, 0);
      splats.length = 0;
      stats.steps = 0; stats.divRms = null;
      ramp.started = false; uEff = 0; ramp.to = params.uInf; ramp.from = 0; ramp.t0 = 0;
      if (running) { ramp.started = true; ramp.t0 = performance.now(); }
      else if (TIERS[tier].frozen) warmup(FROZEN_STEPS, draw);
      else draw();
    },
    step(n = 1) { if (!F) return; for (let i = 0; i < n; i++) step(); },
    draw, selfCheck, resize,
    /* Lab control: simulate a lost context through WEBGL_lose_context. */
    loseContext(restoreMs = 1500) {
      const ext = G && G.loseContextExt;
      if (!ext) return false;
      ext.loseContext();
      setTimeout(() => { try { ext.restoreContext(); } catch { /* already gone */ } }, restoreMs);
      return true;
    },
    destroy() {
      destroyed = true;
      stop(); stopWarmup(); cancelBuild();
      clearTimeout(resizeTimer);
      clearInterval(statsTimer);
      if (ro) ro.disconnect(); else removeEventListener('resize', scheduleResize);
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      document.removeEventListener('visibilitychange', onVisibility);
      if (G && !lost) { try { releaseFields(F); G.clearCanvas(); G.destroy(); } catch { /* context gone */ } }
      G = null; P = null; F = null;
    },
  };

  stats.tier = tier;
  stats.preroll = preroll;
  stats.jacobi = params.jacobi = TIERS[tier].jacobi || params.jacobi;
  stats.coarse = params.coarse = TIERS[tier].coarse || params.coarse;
  resize();
  resume();
  return tunnel;
}
export default createTunnel;
