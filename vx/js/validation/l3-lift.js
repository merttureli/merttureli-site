/* L3 validation bench: moving walls, lifting surfaces and the CHARGER section (VALIDATION.md, track L3).
   Runs one schedule on the real engine (vx/js/lattice/lattice.js) through its public API only:
   setSection, setViscosity, setSmagorinsky, setRegularised, setMachFloor, setStabilisers, setInflow,
   setBodyRate, reset, step, sampleForce, check. A schedule is a list of phases {steps, alphaDeg, omega}
   (omega in rad per lattice step, flight sign: positive raises theta, clockwise in the grid). At each
   phase start the bench calls setInflow(u, alpha) and setBodyRate(omega); the engine slews both.
   The force is the engine's own whole-domain momentum-exchange reduction (sampleForce), read after
   every chunk, so each sample is the mean over that chunk. Nothing in the engine is changed.
   The long runs of track L3 use a CPU transcription of the same step (scratchpad validation/L3/l3lbm.c);
   this bench produces the GPU traces the transcription is checked against.
   Shapes: 'cylinder' {D, cx, cy}; 'plate' {chord, thick, cx, cy}; 'charger' {finScale} from
   geom.buildSection at the grid (the page's section). Lattice units throughout. */
import { createLattice } from '../lattice/lattice.js';
import { buildSection } from '../geom/geom.js';

const DEG = Math.PI / 180;

export function shapeFor(cfg) {
  const { cols, rows } = cfg;
  const mask = new Uint8Array(cols * rows);
  if (cfg.shape === 'cylinder') {
    const R = cfg.D / 2;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const dx = c + 0.5 - cfg.cx, dy = r + 0.5 - cfg.cy;
      if (dx * dx + dy * dy <= R * R) mask[r * cols + c] = 1;
    }
    return { mask, dCells: cfg.D, cg: [cfg.cx, cfg.cy] };
  }
  if (cfg.shape === 'plate') {
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (Math.abs(c + 0.5 - cfg.cx) <= cfg.chord / 2 && Math.abs(r + 0.5 - cfg.cy) <= cfg.thick / 2) mask[r * cols + c] = 1;
    }
    return { mask, dCells: cfg.chord, cg: [cfg.mx ?? cfg.cx, cfg.cy] };
  }
  if (cfg.shape === 'charger') {
    const s = buildSection({ cols, rows, finScale: cfg.finScale });
    return { mask: s.mask, dCells: s.dCells, cg: [s.cgCell.x, s.cgCell.y] };
  }
  throw new Error('unknown shape ' + cfg.shape);
}

export async function runSchedule(renderer, cfg, { log = (...a) => console.log(...a) } = {}) {
  const c = Object.assign({ smag: 0.12, reg: true, machK: 2, sponge: true, positive: true, chunk: 50, u: 0.05 }, cfg);
  const { cols, rows } = c;
  const lat = createLattice(renderer, { cols, rows, tier: 3, fixedGrid: true, autoResetOnNaN: false, ...(Number.isFinite(c.speedCap) ? { speedCap: c.speedCap } : {}) });
  /* body-rate mode (lattice.js setBodyRate): a spinning cylinder is a wall moving along itself ('wall');
     a plate or a section pitching as a whole turns the frame ('frame', the engine's default) */
  const mode = c.rateMode || (c.shape === 'cylinder' ? 'wall' : 'frame');
  const ready = await lat.ready;
  if (lat.fallback) { lat.destroy(); return { case: c.name, error: lat.fallback }; }
  const shape = shapeFor(c);
  lat.setSection({ mask: shape.mask, cols, rows, dCells: shape.dCells, cgCell: shape.cg });
  lat.setSmagorinsky(c.smag); lat.setRegularised(c.reg); lat.setMachFloor(c.machK);
  lat.setStabilisers({ sponge: c.sponge, positive: c.positive });
  if (Number.isFinite(c.tau0)) lat.setViscosity({ tau0: c.tau0 }); else lat.setViscosity({ re: c.re, uRef: c.uRef ?? c.u });
  const ph = c.sched;
  lat.setInflow(c.u, ph[0].alphaDeg * DEG); lat.setBodyRate(ph[0].omega || 0, mode);
  lat.reset();
  const t0 = performance.now();
  const samples = [];
  let s = 0;
  for (let p = 0; p < ph.length; p++) {
    if (p > 0) { lat.setInflow(c.u, ph[p].alphaDeg * DEG); lat.setBodyRate(ph[p].omega || 0, mode); }
    let done = 0;
    while (done < ph[p].steps) {
      const n = Math.min(c.chunk, ph[p].steps - done);
      lat.step(n); s += n; done += n;
      const f = await lat.sampleForce();
      samples.push([s - n / 2, s, p, f ? f.fx : null, f ? f.fy : null, f ? f.mz : null, f ? f.steps : null]);
      if (s % 1000 === 0) log('L3_PROGRESS ' + JSON.stringify({ case: c.name, step: s, wallS: +((performance.now() - t0) / 1000).toFixed(1), fy: f && f.fy }));
    }
  }
  const wallS = (performance.now() - t0) / 1000;
  const field = await lat.check();
  const res = {
    case: c.name, config: c, precision: ready.precision, engine: { tau0: lat.stats.tau0, nu: lat.stats.nu, dCells: shape.dCells, cg: shape.cg, bodyRate: mode, storage: lat.fields && lat.fields.storage },
    steps: s, wallS: +wallS.toFixed(1), stepsPerSecond: +(s / wallS).toFixed(2), mcups: +(s * cols * rows / wallS / 1e6).toFixed(3), field, samples,
  };
  lat.destroy();
  return res;
}
