/* L2 validation analysis (VALIDATION.md, track L2): pure functions shared by the browser bench
   (l2-cylinder.js, the GPU engine) and the Node analysis of the CPU transcription's traces, so both
   paths reduce a force trace the same way. Lattice units. No DOM, no GL.
   samples: [{t (chunk centre, steps), end (steps), cd, cl, cdAll, clAll}]; wakes: [{t, lr, lrD, dp}]. */
export const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
export const r6 = (v) => (Number.isFinite(v) ? +v.toPrecision(6) : null);

/* Upward zero crossings of C_L about the window mean (linear interpolation) and per-cycle
   statistics between consecutive crossings. */
export function cycles(samples, from) {
  const s = samples.filter((p) => p.t >= from);
  if (s.length < 8) return { ups: [], cyc: [] };
  const m = mean(s.map((p) => p.cl));
  const ups = [];
  for (let i = 1; i < s.length; i++) {
    const a = s[i - 1].cl - m, b = s[i].cl - m;
    if (a < 0 && b >= 0) ups.push(s[i - 1].t + (s[i].t - s[i - 1].t) * (-a / (b - a)));
  }
  const cyc = [];
  for (let k = 1; k < ups.length; k++) {
    const seg = s.filter((p) => p.t >= ups[k - 1] && p.t < ups[k]);
    if (seg.length < 4) continue;
    const cl = seg.map((p) => p.cl), cd = seg.map((p) => p.cd);
    cyc.push({ t0: ups[k - 1], t1: ups[k], period: ups[k] - ups[k - 1], clAmp: (Math.max(...cl) - Math.min(...cl)) / 2, clMean: mean(cl), cdMean: mean(cd), cdAmp: (Math.max(...cd) - Math.min(...cd)) / 2 });
  }
  return { ups, cyc };
}

/* Periodic shedding: the last avgCycles full lift cycles that are saturated give the mean drag, the
   lift amplitude and the period. A cycle counts as saturated when its mean drag is within 0.2
   percent and its lift amplitude within 5 percent of the mean of the last three full cycles (the
   drag lags the lift while the shedding grows, and in the largest domains the lift amplitude beats
   by a few percent from cycle to cycle); a run that ends while the shedding still grows therefore
   averages fewer cycles, and reports saturated: false when fewer than 3 qualify (the first version
   took the last avgCycles cycles regardless, which on the finer grids averaged the growth phase in). Settle times are the first cycle from which every later
   cycle has its lift amplitude within 5 percent of the final one (clAmp95) and its mean drag
   within 1 percent (cdMean1pct). */
export function analyseUnsteady(samples, { D, u, kickSteps = 0, avgCycles = 10 }) {
  const all = cycles(samples, Math.max(kickSteps, 2000));
  const cyc = all.cyc, last3 = cyc.slice(-3);
  const refCd = mean(last3.map((c) => c.cdMean)), refCl = mean(last3.map((c) => c.clAmp));
  let k = cyc.length;
  while (last3.length && k > 0 && cyc.length - k < avgCycles && Math.abs(cyc[k - 1].clAmp - refCl) <= 0.05 * refCl && Math.abs(cyc[k - 1].cdMean - refCd) <= 0.002 * Math.abs(refCd)) k--;
  const use = cyc.slice(k);
  const period = mean(use.map((k) => k.period));
  const clAmpF = mean(use.map((k) => k.clAmp)), cdF = mean(use.map((k) => k.cdMean));
  let sat95 = null, cd1 = null;
  for (let i = 0; i < cyc.length; i++) if (cyc.slice(i).every((k) => k.clAmp >= 0.95 * clAmpF && k.clAmp <= 1.05 * clAmpF)) { sat95 = cyc[i].t0; break; }
  for (let i = 0; i < cyc.length; i++) if (cyc.slice(i).every((k) => Math.abs(k.cdMean - cdF) <= 0.01 * cdF)) { cd1 = cyc[i].t0; break; }
  const spread = (f) => { const v = use.map(f); return v.length ? (Math.max(...v) - Math.min(...v)) / 2 : null; };
  return {
    cdMean: r6(cdF), cdAmp: r6(mean(use.map((k) => k.cdAmp))), clAmp: r6(clAmpF), clMean: r6(mean(use.map((k) => k.clMean))),
    periodSteps: r6(period), st: r6(D / (period * u)), cyclesUsed: use.length, cyclesTotal: cyc.length, saturated: use.length >= 3,
    cycleSpread: { cdMean: r6(spread((k) => k.cdMean)), clAmp: r6(spread((k) => k.clAmp)), period: r6(spread((k) => k.period)) },
    window: use.length ? [Math.round(use[0].t0), Math.round(use[use.length - 1].t1)] : null,
    settle: { clAmp95: sat95 === null ? null : Math.round(sat95), cdMean1pct: cd1 === null ? null : Math.round(cd1), developedFlagAt: 2000 + kickSteps },
    cycles: cyc.map((k) => ({ t0: Math.round(k.t0), period: r6(k.period), clAmp: r6(k.clAmp), cdMean: r6(k.cdMean) })),
  };
}

/* Steady flow: means over the last window; settle times are the last sample that sits outside
   1 percent and 0.1 percent of the final drag (and 1 and 5 percent of the final bubble length). */
export function analyseSteady(samples, wakes, final, { steadyWindow = 2000, kickSteps = 0 }) {
  const end = samples.length ? samples[samples.length - 1].end : 0;
  const tail = samples.filter((p) => p.end > end - steadyWindow);
  const cd = mean(tail.map((p) => p.cd)), cl = mean(tail.map((p) => p.cl));
  const settle = (tol) => { let tLast = 0; for (const p of samples) if (Math.abs(p.cd - cd) > tol * Math.abs(cd)) tLast = p.end; return tLast; };
  const lrSettle = (tol) => { let tLast = 0; for (const p of wakes) if (Math.abs(p.lr - final.lr) > tol * Math.max(final.lr, 1)) tLast = p.t; return tLast; };
  return {
    cd: r6(cd), cl: r6(cl), cdAllLinks: r6(mean(tail.map((p) => p.cdAll))), lrD: r6(final.lrD), lrCells: r6(final.lr), dp: r6(final.dp), minCentreUx: r6(final.minUx),
    settle: { cd1pct: settle(0.01), cd01pct: settle(0.001), lr1pct: lrSettle(0.01), lr5pct: lrSettle(0.05), developedFlagAt: 2000 + kickSteps },
  };
}

/* Recirculation length and front-to-rear pressure difference from the centre-line strip.
   ux(k), rho(k), solid(k) over columns wx0 + k; xFront and xRear are the halfway walls (cell
   edges) at the front and rear stagnation points. */
export function centreLineStats({ ux, rho, solid, wx0, xFront, xRear, D }) {
  const w = ux.length;
  let lr = 0, found = false, minUx = Infinity;
  for (let k = xRear - wx0; k < w - 1; k++) {
    if (solid[k]) continue;
    const a = ux[k], b = ux[k + 1];
    minUx = Math.min(minUx, a);
    if (a < 0 && b >= 0) { lr = (wx0 + k + 0.5 + (-a / (b - a))) - xRear; found = true; break; }
    if (a >= 0 && k === xRear - wx0) break;
  }
  const fk = xFront - wx0, rk = xRear - wx0;
  const rhoF = 1.5 * rho[fk - 1] - 0.5 * rho[fk - 2];
  const rhoR = 1.5 * rho[rk] - 0.5 * rho[rk + 1];
  return { lr: found ? lr : 0, lrD: found ? lr / D : 0, minUx, dRho: rhoF - rhoR, dp: (rhoF - rhoR) / 3 };
}
