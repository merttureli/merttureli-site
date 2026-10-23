#!/usr/bin/env node
/*
 * lattice-validate.cjs: run the lattice cylinder gate headless and judge it.
 *
 *   node lattice-validate.cjs [--page vx/lab/lattice.html] [--case cylinder] [options]
 *
 * Opens <page>?validate=<case> (FIELD.md section 4: cylinder D 24 cells in 512 x 192 at Re 100,
 * u 0.05, 20,000 steps; drag from the last 5,000 steps, Strouhal from lift zero crossings) and
 * waits up to --timeout-min for the result: a console line starting with LATTICE_VALIDATE followed
 * by JSON, or JSON in <pre id="validate">. LATTICE_PROGRESS lines are logged as progress.
 * Field names accepted: cd | C_D | CD | cD and st | St | strouhal.
 *
 * Options
 *   --page <path>         default vx/lab/lattice.html
 *   --case <name>         default cylinder (the gates below apply to cylinder only)
 *   --steps <n>           pass &steps=n (shorter runs for checking the harness; the gate is 20,000)
 *   --query <qs>          extra query merged in (for example "c=0.1")
 *   --cd lo,hi            default 1.2,1.7      --st lo,hi   default 0.15,0.19
 *   --timeout-min <m>     default 25           --start-timeout <s>  default 90 (no sign of a run: NOT READY)
 *   --out <dir>           default reports/field/probes/lattice-validate     --root <dir>
 *
 * Writes report.json (the engine's full JSON, progress, timings, gates) and final.png.
 * Gates: no page errors or failed requests; the result has no error; finite fields (when reported);
 * C_D within --cd; St within --st. The report also states that SwiftShader is software GL, so the
 * engine's stepsPerSecond here says nothing about a GPU.
 * Exit 0 PASS, 1 FAIL, 2 NOT READY (page missing, no validate mode, or no WebGL2/float targets),
 * 3 harness error. Prints one SUMMARY line last.
 */
const path = require("path");
const L = require("./lib.cjs");

const o = L.args(__filename);
const PAGE = (o.page || "vx/lab/lattice.html").replace(/^\.?\//, "");
const CASE = typeof o.case === "string" ? o.case : "cylinder";
const range = (s, d) => { const v = String(s || d).split(",").map(Number); return v.length === 2 && v.every(Number.isFinite) ? v : d.split(",").map(Number); };
const CD = range(o.cd, "1.2,1.7"), ST = range(o.st, "0.15,0.19");
const TIMEOUT_MS = L.num(o["timeout-min"], 25) * 60000, START_MS = L.num(o["start-timeout"], 90) * 1000;
const first = (r, keys) => { for (const k of keys) if (r && Number.isFinite(Number(r[k])) && r[k] !== null) return Number(r[k]); return null; };

L.run("lattice-validate", o, async ({ dir, report, base, browser }) => {
  const url = L.withQuery(PAGE, `validate=${CASE}`, o.steps ? `steps=${L.num(o.steps, 20000)}` : "", o.query);
  Object.assign(report, { page: url, case: CASE, gates: null, limits: { cd: CD, st: ST } });
  const { ctx, page, log } = await L.openPage(browser, { viewport: { width: 1440, height: 900 }, busPath: null });
  const progress = []; let result = null, resultFrom = null; const t0 = Date.now();
  page.on("console", (m) => {
    const t = m.text();
    if (t.startsWith("LATTICE_PROGRESS")) progress.push({ atS: +((Date.now() - t0) / 1000).toFixed(1), line: t.slice(17, 120) });
    if (t.startsWith("LATTICE_VALIDATE") && !result) { try { result = JSON.parse(t.slice(t.indexOf("{"))); resultFrom = "console"; } catch (e) { report.parseError = String(e.message); } }
  });
  try {
    const resp = await page.goto(base + url, { waitUntil: "load", timeout: 60000 }).catch(() => null);
    if (!resp || resp.status() >= 400) throw new L.NotReady(`${PAGE} is missing (HTTP ${resp ? resp.status() : "no response"})`);
    let started = false, lastPre = "";
    while (!result && Date.now() - t0 < TIMEOUT_MS) {
      await page.waitForTimeout(3000);
      const pre = await page.evaluate(() => { const e = document.getElementById("validate"); return e ? { text: e.textContent.trim(), hidden: e.hidden } : null; }).catch(() => null);
      if (pre && pre.text) {
        started = true; lastPre = pre.text.slice(0, 120);
        if (pre.text.startsWith("{")) { try { result = JSON.parse(pre.text); resultFrom = "pre#validate"; } catch { /* still writing */ } }
      }
      if (progress.length) started = true;
      if (!started && Date.now() - t0 > START_MS) {
        const why = log.pageErrors.length ? `page error "${log.pageErrors[0].slice(0, 120)}"` : pre ? "pre#validate stayed empty" : "no <pre id=validate> and no LATTICE_ console lines";
        throw new L.NotReady(`${PAGE}?validate=${CASE} shows no validation run after ${START_MS / 1000} s (${why})`);
      }
    }
    report.wallSeconds = +((Date.now() - t0) / 1000).toFixed(1);
    report.progress = progress; report.lastStatus = lastPre;
    await page.screenshot({ path: path.join(dir, "final.png") }).catch(() => {});
    report.screenshot = path.join(dir, "final.png");
    if (!result) { report.gates = { finishedInTime: false }; return { pass: false, detail: `no result within ${TIMEOUT_MS / 60000} min (last status "${lastPre}")` }; }
    if (result.liftTrace) { report.liftTracePoints = result.liftTrace.length; delete result.liftTrace; }
    report.result = result; report.resultFrom = resultFrom;
    if (result.error && /no-webgl2|no-float/.test(result.error)) throw new L.NotReady(`the engine cannot run here: ${result.error}`);
    const cd = first(result, ["cd", "C_D", "CD", "cD"]), st = first(result, ["st", "St", "strouhal", "ST"]);
    const errs = L.cleanLog(log, null); report.errors = errs;
    report.numbers = { cd, st, cdStd: result.cdStd, periodSteps: result.periodSteps, liftCrossings: result.liftCrossings, steps: result.steps, precision: result.precision, engineStepsPerSecond: result.stepsPerSecond, engineWallSeconds: result.wallSeconds, note: "stepsPerSecond is under SwiftShader (software GL), not representative of a GPU" };
    const isCyl = CASE === "cylinder";
    report.gates = {
      noPageErrors: errs.pageErrors.length === 0, noFailedRequests: errs.failedRequests.length === 0, noEngineError: !result.error,
      finite: result.finite === undefined ? null : result.finite !== false,
      cdInRange: isCyl ? cd !== null && cd >= CD[0] && cd <= CD[1] : null,
      stInRange: isCyl ? st !== null && st >= ST[0] && st <= ST[1] : null,
    };
    const fails = Object.entries(report.gates).filter(([, v]) => v === false).map(([k]) => k);
    return { pass: fails.length === 0, detail: `${fails.length ? "failed " + fails.join(",") + " / " : ""}${CASE} C_D ${cd ?? "-"} [${CD}] St ${st ?? "-"} [${ST}] / ${result.steps ?? "?"} steps in ${result.wallSeconds ?? report.wallSeconds} s (${result.stepsPerSecond ?? "?"} steps/s, SwiftShader)${result.error ? " / engine error " + result.error : ""}` };
  } finally { await ctx.close().catch(() => {}); }
}, /^final\.png$/);
