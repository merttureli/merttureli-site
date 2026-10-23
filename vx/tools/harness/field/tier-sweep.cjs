#!/usr/bin/env node
/*
 * tier-sweep.cjs: the field page at each governor tier and under reduced motion, both viewports.
 *
 *   node tier-sweep.cjs [--page vx/index.html] [--tiers 3,2,1,0] [--seconds 12] [options]
 *
 * For each viewport and each tier N it opens <page>?tier=N&autolaunch=1&speed=1, then <page> with
 * prefers-reduced-motion: reduce (plain URL, so no tier pin; tier 0 rules are expected and nothing
 * should launch on its own). Each run lasts --seconds after load and records: animation-frame
 * deltas (p50, p95, max, frames over 50 ms), the simulated time reached, the tier the page shows
 * (header [data-h=tier], else lattice stats, else the panel's lattice line "Tn", else the last
 * governor:tier bus event), the lattice stats line, console errors, page errors, failed requests,
 * horizontal overflow, and a screenshot. SwiftShader timings are software GL: they show relative
 * cost between tiers on this machine, not what a GPU would do.
 *
 * Options
 *   --page <path>          default vx/index.html
 *   --tiers <list>         default 3,2,1,0
 *   --viewports <list>     default 1440x900,390x844
 *   --seconds <s>          default 12
 *   --query <qs>           merged into every run's query
 *   --no-reduced           skip the reduced-motion runs
 *   --any-page             skip the field-page readiness check (labs)
 *   --out <dir>            default reports/field/probes/tier-sweep        --root <dir>
 *
 * Writes report.json, tiers.md (the table) and <run>.png per run.
 * Gates per run: no console errors, page errors or failed requests; no horizontal overflow; the
 * tier shown equals the tier asked (0 under reduced motion) wherever the page shows one.
 * Exit 0 PASS, 1 FAIL, 2 NOT READY (not the field page), 3 harness error. One SUMMARY line last.
 */
const path = require("path");
const fs = require("fs");
const L = require("./lib.cjs");

const o = L.args(__filename);
const PAGE = (o.page || "vx/index.html").replace(/^\.?\//, "");
const TIERS = String(o.tiers || "3,2,1,0").split(",").map(Number).filter((n) => n >= 0 && n <= 3);
const VPS = L.viewports(o.viewports || "1440x900,390x844");
const SECONDS = L.num(o.seconds, 12);
const NOTE = "Frame times are measured under SwiftShader (software GL in headless Chromium on a shared CPU); they compare tiers on this machine and are not representative of a GPU.";

function seenTier(r, lastBusTier) {
  const h = r.headerFields && r.headerFields.tier; let m = h && /(\d)/.exec(h);
  if (m) return { tier: Number(m[1]), from: "header [data-h=tier]" };
  if (r.latticeStats && Number.isFinite(r.latticeStats.tier)) return { tier: r.latticeStats.tier, from: "lattice.stats.tier" };
  m = /\bT(\d)\b/.exec(r.latticeLine || ""); if (m) return { tier: Number(m[1]), from: "lattice line" };
  if (Number.isFinite(lastBusTier)) return { tier: lastBusTier, from: "governor:tier event" };
  return { tier: null, from: "not shown" };
}

L.run("tier-sweep", o, async ({ dir, report, base, browser }) => {
  const runs = [];
  for (const vp of VPS) {
    const plan = TIERS.map((t) => ({ name: `tier${t}`, url: L.withQuery(PAGE, `tier=${t}&autolaunch=1&speed=1`, o.query), want: t, reduced: false }));
    if (!o["no-reduced"]) plan.push({ name: "reduced", url: L.withQuery(PAGE, o.query), want: 0, reduced: true });
    for (const p of plan) {
      const label = `${p.name}-${vp.width}x${vp.height}`;
      const { ctx, page, log } = await L.openPage(browser, { viewport: vp, reducedMotion: p.reduced ? "reduce" : "no-preference" });
      try {
        const t0 = Date.now();
        const resp = await page.goto(base + p.url, { waitUntil: "load", timeout: 60000 }).catch(() => null);
        if (!resp || resp.status() >= 400) throw new L.NotReady(`${PAGE} did not load (HTTP ${resp && resp.status()})`);
        const loadMs = Date.now() - t0;
        await page.waitForTimeout(1000);
        const st = await L.fieldState(page);
        if (!o["any-page"]) L.assertField(st, PAGE);
        const wStart = await page.evaluate(() => performance.now());
        await page.waitForTimeout(SECONDS * 1000);
        const d = await page.evaluate((w0) => {
          const P = window.__probe; const s = P.samples.filter((x) => x.w >= w0); const dts = [];
          for (let i = 1; i < s.length; i++) dts.push(s[i].w - s[i - 1].w);
          const ts = s.map((x) => x.t).filter(Number.isFinite);
          const gov = P.bus.filter((e) => e.type === "governor:tier").pop();
          const lat = P.bus.filter((e) => e.type === "lattice:stats").pop();
          return { dts, tMin: ts.length ? Math.min(...ts) : null, tMax: ts.length ? Math.max(...ts) : null, read: P.read(), busTier: gov && gov.detail ? gov.detail.tier : null, busLattice: lat ? lat.detail : null,
            overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1, scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth };
        }, wStart);
        const shot = path.join(dir, `${label}.png`);
        await page.screenshot({ path: shot });
        const errs = L.cleanLog(log);
        const tier = seenTier(d.read, d.busTier);
        const ft = L.stats(d.dts);
        const run = {
          label, viewport: `${vp.width}x${vp.height}`, url: p.url, reducedMotion: p.reduced, loadMs, tierAsked: p.want, tierSeen: tier.tier, tierFrom: tier.from,
          frames: ft, simTime: { start: d.tMin, end: d.tMax, advanced: d.tMax !== null && d.tMin !== null && d.tMax - d.tMin > 0.05 },
          latticeLine: d.read.latticeLine, latticeStats: d.read.latticeStats || d.busLattice || null, header: d.read.headerFields,
          errors: errs, overflow: d.overflow, scrollWidth: d.scrollWidth, clientWidth: d.clientWidth, screenshot: shot,
        };
        run.gates = {
          noConsoleErrors: errs.consoleErrors.length === 0, noPageErrors: errs.pageErrors.length === 0, noFailedRequests: errs.failedRequests.length === 0,
          noOverflow: !d.overflow, tierMatches: tier.tier === null ? null : tier.tier === p.want,
        };
        runs.push(run);
        console.log(`  ${label}: tier ${p.want}->${tier.tier ?? "-"}  p50 ${ft.p50 ?? "-"} p95 ${ft.p95 ?? "-"} ms  T ${d.tMax === null ? "-" : d.tMax.toFixed(2)}  errors ${errs.consoleErrors.length}+${errs.pageErrors.length}+${errs.failedRequests.length}${d.overflow ? "  OVERFLOW" : ""}`);
      } finally { await ctx.close().catch(() => {}); }
    }
  }
  report.page = PAGE; report.note = NOTE; report.runs = runs;
  const cell = (v) => (v === null || v === undefined ? "-" : String(v).replace(/\|/g, "/"));
  const rows = runs.map((r) => `| ${r.viewport} | ${r.reducedMotion ? "reduced motion" : "tier " + r.tierAsked} | ${cell(r.tierSeen)} | ${r.frames.n || 0} | ${cell(r.frames.p50)} | ${cell(r.frames.p95)} | ${cell(r.frames.max)} | ${cell(r.frames.over50)} | ${r.simTime.end === null ? "-" : r.simTime.end.toFixed(2)} | ${cell(r.latticeLine)} | ${r.errors.consoleErrors.length} | ${r.errors.pageErrors.length} | ${r.errors.failedRequests.length} | ${r.overflow ? "YES" : "no"} |`);
  const md = [`# Tier sweep: ${PAGE}`, "", `${NOTE}`, "", `Each run: ${SECONDS} s after load. Tier runs use ?tier=N&autolaunch=1&speed=1; the reduced-motion run uses the plain URL.`, "",
    "| viewport | run | tier seen | frames | p50 ms | p95 ms | max ms | >50 ms | sim T end | lattice line | console err | page err | failed req | overflow |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|", ...rows, "",
    ...runs.filter((r) => r.errors.consoleErrors.length || r.errors.pageErrors.length || r.errors.failedRequests.length).map((r) => `- ${r.label}: ${[...r.errors.pageErrors, ...r.errors.consoleErrors, ...r.errors.failedRequests].slice(0, 3).join(" / ")}`)].join("\n");
  fs.writeFileSync(path.join(dir, "tiers.md"), md + "\n");
  report.table = path.join(dir, "tiers.md");
  const bad = runs.filter((r) => Object.values(r.gates).some((v) => v === false));
  return { pass: bad.length === 0, detail: `${runs.length} runs, ${bad.length} failing${bad.length ? " (" + bad.map((r) => r.label + ":" + Object.entries(r.gates).filter(([, v]) => v === false).map(([k]) => k).join("+")).slice(0, 4).join(", ") + ")" : ""} / table ${report.table} / SwiftShader timings are software GL` };
}, /^((tier\d|reduced)-.*\.png|tiers\.md)$/);
