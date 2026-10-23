#!/usr/bin/env node
/*
 * hold-pressure.cjs: the pressure difference across the fins at a held angle of attack.
 *
 *   node hold-pressure.cjs [--page vx/index.html] [--alpha 15] [--view pressure] [options]
 *
 * Opens <page>?hold=<alpha>&view=<view>&probe=1 at 1440x900 (probe=1 asks the page for
 * preserveDrawingBuffer; harmless if ignored), waits for the lattice to report steps, waits
 * --settle seconds more, screenshots the stage, and reads back two patches either side of the
 * rocket just ahead of the fin root leading edge, plus a profile across the axis at that station.
 *
 * Where the patches are (body frame of the CAD, metres; FIELD.md section 1): the fin root leading
 * edge is at axial y = -0.5007 (nose tip +0.5707), body radius R = 0.034. Patch centres sit
 * --ahead m (0.015) toward the nose from the root leading edge, at x = +-(--off) R (2 R), in the
 * pitch plane (the 'through' slice). In the lattice section this is just upstream of the fin, one
 * patch on the windward side and one on the leeward side.
 * How the screen position is found:
 *   1. hooks: any window object shaped like the scene (camera + three.body, e.g. window.__field.scene)
 *      gives body.matrixWorld, camera.matrixWorldInverse and projectionMatrix as last rendered; the
 *      body points are projected exactly.
 *   2. no hooks: the slice is located from the rocket's screen image. The script switches the view
 *      to SPEED (panel button, else key 4), where the free stream paints the whole slice light grey,
 *      takes the light grey pixels (min channel over 100, max under 235) on the WebGL canvas, fits a
 *      rectangle (principal axes for the direction; per axis, the extent where the light-pixel count
 *      per 2 px band stays above 30 percent of the 90th-percentile band), checks the aspect is
 *      near the grid's 3.2, takes the nose end as the top end (--nose-end to override), maps the body points through the section layout (nose at 0.12
 *      of the width, rocket 0.66 of the width, height 0.5591 m), and switches back to <view>.
 *      Checked against path 1 on the scene lab with a uniform light slice: within 9 px (0.7 R),
 *      biased toward the nose (the slice's soft edge reads short); sides A and B are unlabelled.
 * Pixels: the WebGL canvas is copied to a 2D canvas inside a requestAnimationFrame callback (after
 * the page's own frame); the full-page screenshot is sampled too. The ramp value per patch is
 *   r8 = (R - B) - max(0, B - 20)   in 8-bit levels
 * which is signed for the lattice pressure ramp (positive toward the livery orange, suction toward
 * paper grey, 0 at ink-800). Outputs: stage.png, annotated.png, zoom.png, report.json.
 *
 * Options
 *   --page <path>  --query <qs>  --alpha <deg> (15)  --view <name> (pressure)  --settle <s> (20)
 *   --lattice-timeout <s>   wait for steps (default 120)    --no-lattice-wait   (labs)
 *   --ahead <m> (0.015)  --off <R> (2)  --patch <px> (max 9; also capped at 0.6 R on screen)
 *   --min-steps <n>     lattice steps needed at capture (default 100)
 *   --wait-steps <n>    after --settle, keep waiting until the lattice reports n steps (default 0;
 *                       under SwiftShader the page runs a few steps per second, so use 1500 with a
 *                       pinned tier, e.g. --query tier=1, which also stops the page's slow-frame
 *                       lattice pause)      --steps-timeout <s>  cap for that wait (default 900)
 *   --nose-end top|bottom|left|right   (image path: which end of the slice holds the nose)
 *   --no-hooks          force the image path      --force-preserve  inject preserveDrawingBuffer
 *   --diff-only         gate on the difference only (not the sign)    --min-diff <levels> (12)
 *   --eval <js>   run in the page after load (lab set-up)
 *   --any-page  --reduced  --out <dir> (reports/field/probes/hold-pressure)  --root <dir>
 *
 * Gates: no console/page errors or failed requests; patches found on the canvas; the lattice shows the
 * requested view and has run --min-steps steps; the two ramp values differ by at least --min-diff
 * levels; they have opposite sign (unless --diff-only).
 * Exit 0 PASS, 1 FAIL, 2 NOT READY (not the field page, no lattice steps, or the fin root cannot be
 * located), 3 harness error. Prints one SUMMARY line last.
 */
const path = require("path");
const fs = require("fs");
const L = require("./lib.cjs");

const o = L.args(__filename);
const PAGE = (o.page || "vx/index.html").replace(/^\.?\//, "");
const ALPHA = L.num(o.alpha, 15), VIEW = typeof o.view === "string" ? o.view : "pressure";
const SETTLE = L.num(o.settle, 20), LAT_TIMEOUT = L.num(o["lattice-timeout"], 120);
const MIN_STEPS = L.num(o["min-steps"], 100), WAIT_STEPS = L.num(o["wait-steps"], 0), STEPS_TIMEOUT = L.num(o["steps-timeout"], 900);
const AHEAD = L.num(o.ahead, 0.015), OFF = L.num(o.off, 2), PATCH = L.num(o.patch, 9), MIN_DIFF = L.num(o["min-diff"], 12);
const VP = { width: 1440, height: 900 };
const R = 0.034, FIN_LE_Y = -0.5007, NOSE_Y = 0.5707, LENGTH = 1.1809, SECTION_H = 0.5591;
const Y_S = FIN_LE_Y + AHEAD;
const POINTS = { A: [OFF * R, Y_S, 0], B: [-OFF * R, Y_S, 0], finLeA: [R, FIN_LE_Y, 0], finLeB: [-R, FIN_LE_Y, 0], nose: [0, NOSE_Y, 0], tail: [0, NOSE_Y - LENGTH, 0] };
for (let i = 0; i <= 32; i++) POINTS[`p${i}`] = [(-4 + i / 4) * R, Y_S, 0];
const r8 = (c) => (c ? +((c[0] - c[2]) - Math.max(0, c[2] - 20)).toFixed(1) : null);   // null: patch off the image

L.run("hold-pressure", o, async ({ dir, report, base, browser }) => {
  const url = L.withQuery(PAGE, `hold=${ALPHA}&view=${VIEW}&probe=1`, o.query);
  Object.assign(report, { page: url, alphaDeg: ALPHA, view: VIEW, points: POINTS, metric: "r8 = (R - B) - max(0, B - 20)" });
  const { ctx, page, log } = await L.openPage(browser, { viewport: VP, reducedMotion: o.reduced ? "reduce" : "no-preference" });
  if (o["force-preserve"]) await page.addInitScript(() => { window.__probeForcePreserve = true; });
  const read = () => page.evaluate(() => { const P = window.__probe; const r = P.read(); const ls = P.bus.filter((e) => e.type === "lattice:stats").pop(); r.busStats = ls ? ls.detail : null; return r; });
  try {
    const resp = await page.goto(base + url, { waitUntil: "load", timeout: 60000 }).catch(() => null);
    if (!resp || resp.status() >= 400) throw new L.NotReady(`${PAGE} did not load (HTTP ${resp && resp.status()})`);
    await page.waitForTimeout(1500);
    report.pageState = await L.fieldState(page);
    await page.evaluate(`window.__hpDecode = ${decode.toString()}`);
    if (typeof o.eval === "string") report.evalResult = await page.evaluate(o.eval).catch((e) => "eval failed: " + e.message);
    if (!o["any-page"]) L.assertField(report.pageState, PAGE);
    // 1. the lattice must be stepping
    let r = await read();
    if (!o["no-lattice-wait"]) {
      const t0 = Date.now();
      while (!stepping(r) && Date.now() - t0 < LAT_TIMEOUT * 1000) { await page.waitForTimeout(1000); r = await read(); }
      report.latticeWaitS = +((Date.now() - t0) / 1000).toFixed(1);
      if (!stepping(r)) throw new L.NotReady(`the lattice reported no steps within ${LAT_TIMEOUT} s (line "${r.latticeLine}", fallback ${r.latticeFallback}, bus stats ${JSON.stringify(r.busStats)})`);
    }
    report.latticeAtStart = pick(r);
    await page.waitForTimeout(SETTLE * 1000);
    r = await read();
    if (WAIT_STEPS > 0) {   // software GL runs few steps per second: wait for a developed field
      const t1 = Date.now(); const steps = (x) => ((x.latticeStats || x.busStats || {}).steps || 0);
      while (steps(r) < WAIT_STEPS && Date.now() - t1 < STEPS_TIMEOUT * 1000) { await page.waitForTimeout(5000); r = await read(); }
      report.waitedForStepsS = +((Date.now() - t1) / 1000).toFixed(1);
    }
    report.latticeAtCapture = pick(r);
    // 2. where the fin root is on screen
    let loc = o["no-hooks"] ? null : await page.evaluate(projectByHooks, POINTS);
    if (loc) report.locate = { method: "hooks", scene: loc.path, sliceView: loc.sliceView };
    else {
      await setView(page, "speed"); await page.waitForTimeout(2500);
      const shot = (await page.screenshot()).toString("base64");
      const seg = await page.evaluate(segmentSlice, { b64: shot, noseEnd: o["nose-end"] || "top" });
      await setView(page, VIEW); await page.waitForTimeout(2500);
      report.locate = { method: "image (speed view, principal-axis rectangle)", seg: seg && seg.info };
      if (!seg || !seg.ok) throw new L.NotReady(`could not locate the fin root without page hooks (${seg ? seg.why : "segmentation failed"}); expose window.__field = {flight, scene, lattice, panel} or check annotated output`);
      loc = { pts: mapSection(seg.rect) };
    }
    report.screen = Object.fromEntries(["A", "B", "finLeA", "finLeB", "nose", "tail"].map((k) => [k, loc.pts[k] && loc.pts[k].map((v) => +v.toFixed(1))]));
    // 3. pixels: canvas readback in rAF, and the screenshot
    const rpx = Math.hypot(loc.pts.finLeA[0] - loc.pts.finLeB[0], loc.pts.finLeA[1] - loc.pts.finLeB[1]) / 2;
    const size = Math.max(5, Math.min(PATCH, Math.round(0.6 * rpx)));   // patch spans about (OFF -+ 0.3) R
    report.patchPx = size; report.bodyRadiusPx = +rpx.toFixed(1);
    const rects = { A: box(loc.pts.A, size), B: box(loc.pts.B, size) };
    const prof = Array.from({ length: 33 }, (_, i) => box(loc.pts[`p${i}`], 3));
    const canvas = await page.evaluate(readCanvas, { rects: { ...rects, ...Object.fromEntries(prof.map((b, i) => [`p${i}`, b])) } });
    const full = await page.screenshot();
    const fromShot = await page.evaluate(readPng, { b64: full.toString("base64"), rects: { ...rects, ...Object.fromEntries(prof.map((b, i) => [`p${i}`, b])) } });
    const useCanvas = canvas && canvas.ok && canvas.means.A && canvas.nonEmpty;
    const src = useCanvas ? canvas.means : fromShot;
    report.pixels = {
      source: useCanvas ? `canvas readback in rAF (${canvas.how})` : "screenshot", glAttrs: canvas && canvas.attrs, canvasNote: canvas && canvas.why,
      A: { rgb: src.A, r8: r8(src.A), screenshotRgb: fromShot.A }, B: { rgb: src.B, r8: r8(src.B), screenshotRgb: fromShot.B },
      profile: prof.map((_, i) => (src[`p${i}`] ? r8(src[`p${i}`]) : null)), profileX_R: prof.map((_, i) => -4 + i / 4),
    };
    // 4. images
    const stage = await page.evaluate(() => { const c = window.__probe.glCanvas(); const s = c && (c.closest(".pn-host, #stage, .stage, [data-stage]") || c.parentElement); if (!s) return null; const b = s.getBoundingClientRect(); return { x: Math.max(0, b.left), y: Math.max(0, b.top), w: Math.min(innerWidth, b.right) - Math.max(0, b.left), h: Math.min(innerHeight, b.bottom) - Math.max(0, b.top) }; });
    const clip = stage && stage.w > 10 && stage.h > 10 ? { x: stage.x, y: stage.y, width: stage.w, height: stage.h } : undefined;
    await page.screenshot({ path: path.join(dir, "stage.png"), clip });
    const ann = await page.evaluate(annotate, { b64: full.toString("base64"), rects, prof, pts: loc.pts, clip: clip || { x: 0, y: 0, width: VP.width, height: VP.height } });
    for (const [k, v] of Object.entries(ann)) fs.writeFileSync(path.join(dir, `${k}.png`), Buffer.from(v.split(",")[1], "base64"));
    report.images = ["stage.png", "annotated.png", "zoom.png"].map((f) => path.join(dir, f));
    // 5. gates
    const errs = L.cleanLog(log); report.errors = errs;
    const a = report.pixels.A.r8, b = report.pixels.B.r8, diff = +Math.abs(a - b).toFixed(1);
    const ls = report.latticeAtCapture.stats || {};
    report.gates = {
      noConsoleErrors: errs.consoleErrors.length === 0, noPageErrors: errs.pageErrors.length === 0, noFailedRequests: errs.failedRequests.length === 0,
      patchesOnCanvas: !!(canvas && canvas.inside),
      differenceAtLeast: diff >= MIN_DIFF, difference: diff,
      oppositeSign: a * b < 0,
      viewIsRequested: ls.view ? ls.view === VIEW : null,
      latticeSteps: Number.isFinite(ls.steps) ? ls.steps >= MIN_STEPS : null,
    };
    const fails = Object.entries(report.gates).filter(([k, v]) => v === false && !(o["diff-only"] && k === "oppositeSign")).map(([k]) => k);
    return { pass: fails.length === 0, detail: `${fails.length ? "failed " + fails.join(",") + " / " : ""}locate ${report.locate.method.split(" ")[0]} / r8 A ${a} B ${b} diff ${diff} (min ${MIN_DIFF}) / steps ${ls.steps ?? "-"} (line "${report.latticeAtCapture.line}") / errors ${errs.consoleErrors.length}+${errs.pageErrors.length}+${errs.failedRequests.length}` };
  } finally { await ctx.close().catch(() => {}); }
}, /^(stage|annotated|zoom)\.png$/);

function stepping(r) {
  const s = r.latticeStats || r.busStats || {};
  if (Number.isFinite(s.steps)) return s.steps > 0;
  if (s.stepsPerSecond > 0) return true;
  const m = /(\d+)\s*STEPS\s*\/\s*S/i.exec(r.latticeLine || "") || /(\d+)\s*STEPS\s*\/\s*S/i.exec(r.header || "");
  return !!(m && Number(m[1]) > 0);
}
function pick(r) { const s = r.latticeStats || r.busStats || null; return { line: r.latticeLine, fallback: r.latticeFallback, alphaDeg: r.alphaDeg, t: r.t, phase: r.phase, hooks: r.hooks, stats: s && { grid: s.grid, steps: s.steps, stepsPerSecond: s.stepsPerSecond, alphaDeg: s.alphaDeg, view: s.view, precision: s.precision, re: s.re } }; }
function box([x, y], size = PATCH) { const h = Math.floor(size / 2); return { x: Math.round(x) - h, y: Math.round(y) - h, w: size, h: size }; }
async function setView(page, name) {
  const b = page.locator(`[data-ctl=view] button[data-value=${name}]`).or(page.getByRole("button", { name: new RegExp(`^${name}`, "i") })).first();
  if (await b.isVisible().catch(() => false) && await b.isEnabled().catch(() => false)) return b.click();
  const key = { smoke: "1", pressure: "2", vorticity: "3", speed: "4" }[name];
  if (key) await page.keyboard.press(key);
}
/* rect {c:[x,y], a:[ux,uy] (nose to tail), b:[px,py], hl, hw} -> screen points for every body point */
function mapSection(rect) {
  const out = {};
  for (const [k, [x, y]] of Object.entries(POINTS)) {
    const u = 0.12 + 0.66 * (NOSE_Y - y) / LENGTH, v = 0.5 + x / SECTION_H;
    out[k] = [rect.c[0] + (u - 0.5) * 2 * rect.hl * rect.a[0] + (v - 0.5) * 2 * rect.hw * rect.b[0], rect.c[1] + (u - 0.5) * 2 * rect.hl * rect.a[1] + (v - 0.5) * 2 * rect.hw * rect.b[1]];
  }
  return out;
}

/* ---- in-page functions (serialised by page.evaluate) ---- */
function projectByHooks(points) {
  const h = window.__probe.hooks(); const s = h.scene && h.scene.obj;
  if (!s || !s.camera || !s.three || !s.three.body) return null;
  const E = s.three.body.matrixWorld.elements, V = s.camera.matrixWorldInverse.elements, P = s.camera.projectionMatrix.elements;
  const mul = (m, [x, y, z, w]) => [m[0] * x + m[4] * y + m[8] * z + m[12] * w, m[1] * x + m[5] * y + m[9] * z + m[13] * w, m[2] * x + m[6] * y + m[10] * z + m[14] * w, m[3] * x + m[7] * y + m[11] * z + m[15] * w];
  const el = (s.renderer && s.renderer.domElement) || window.__probe.glCanvas(); const rc = el.getBoundingClientRect();
  const pts = {};
  for (const [k, p] of Object.entries(points)) { const c = mul(P, mul(V, mul(E, [...p, 1]))); pts[k] = [rc.left + (c[0] / c[3] + 1) / 2 * rc.width, rc.top + (1 - c[1] / c[3]) / 2 * rc.height]; }
  return { pts, path: h.scene.path, sliceView: s.sliceView || null };
}
async function decode(b64) {
  const img = new Image(); img.src = "data:image/png;base64," + b64; await img.decode();
  const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
  const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(img, 0, 0); return { c, x };
}
async function segmentSlice({ b64, noseEnd }) {
  const gl = window.__probe.glCanvas(); if (!gl) return { ok: false, why: "no WebGL canvas" };
  const rc = gl.getBoundingClientRect(); const { x } = await window.__hpDecode(b64);
  const L0 = Math.max(0, Math.floor(rc.left)), T0 = Math.max(0, Math.floor(rc.top)), W = Math.min(x.canvas.width, Math.floor(rc.right)) - L0, H = Math.min(x.canvas.height, Math.floor(rc.bottom)) - T0;
  const d = x.getImageData(L0, T0, W, H).data; const px = [];
  for (let j = 2; j < H - 2; j += 2) for (let i = 2; i < W - 2; i += 2) { const k = (j * W + i) * 4, r = d[k], g = d[k + 1], b = d[k + 2]; if (Math.min(r, g, b) > 100 && Math.max(r, g, b) < 235 && Math.max(r, g, b) - Math.min(r, g, b) < 40) px.push([L0 + i, T0 + j]); }
  if (px.length < 500) return { ok: false, why: `only ${px.length} light pixels in the speed view`, info: { light: px.length } };
  const n = px.length, mx = px.reduce((s, p) => s + p[0], 0) / n, my = px.reduce((s, p) => s + p[1], 0) / n;
  let sxx = 0, syy = 0, sxy = 0; for (const [a, b] of px) { sxx += (a - mx) ** 2; syy += (b - my) ** 2; sxy += (a - mx) * (b - my); }
  const th = 0.5 * Math.atan2(2 * sxy, sxx - syy); let a = [Math.cos(th), Math.sin(th)];
  /* extents: where the light-pixel count per 2 px band across the axis falls under 30 percent of the
     90th-percentile band; sparse light things off the slice (labels, arrows) never reach that */
  const ext = (arr) => {
    const lo = Math.floor(Math.min(...arr) / 2), cnt = new Map();
    for (const v of arr) { const k = Math.floor(v / 2) - lo; cnt.set(k, (cnt.get(k) || 0) + 1); }
    const keys = [...cnt.keys()].sort((u, v) => u - v), ref = keys.map((k) => cnt.get(k)).sort((u, v) => u - v)[Math.floor(keys.length * 0.9)];
    const ok = keys.filter((k) => cnt.get(k) >= 0.3 * ref);
    return [(ok[0] + lo) * 2, (ok[ok.length - 1] + lo + 1) * 2];
  };
  const pa = px.map(([u, v]) => (u - mx) * a[0] + (v - my) * a[1]), pb = px.map(([u, v]) => -(u - mx) * a[1] + (v - my) * a[0]);
  const [a0, a1] = ext(pa), [b0, b1] = ext(pb);
  const c = [mx + a[0] * (a0 + a1) / 2 - a[1] * (b0 + b1) / 2, my + a[1] * (a0 + a1) / 2 + a[0] * (b0 + b1) / 2];
  const dirs = { top: [0, 1], bottom: [0, -1], left: [1, 0], right: [-1, 0] }[noseEnd] || [0, 1];
  if (a[0] * dirs[0] + a[1] * dirs[1] < 0) a = [-a[0], -a[1]];   // a runs from the nose end to the tail end
  const rect = { c, a, b: [-a[1], a[0]], hl: (a1 - a0) / 2, hw: (b1 - b0) / 2 };
  const aspect = rect.hl / rect.hw, area = 4 * rect.hl * rect.hw / (W * H);
  const info = { light: n, angleDeg: +(th * 180 / Math.PI).toFixed(1), aspect: +aspect.toFixed(2), areaFrac: +area.toFixed(3), centre: c.map(Math.round), noseEnd };
  const clipped = a0 + mx < L0 + 6 || b0 + my < T0 + 6;
  if (aspect < 2.6 || aspect > 4.0) return { ok: false, why: `rectangle aspect ${aspect.toFixed(2)} is not near the grid's 3.2`, info };
  if (area < 0.02) return { ok: false, why: "slice too small on screen", info };
  return { ok: true, rect, info: { ...info, clippedWarning: clipped } };
}
function readCanvas({ rects }) {
  const gl = window.__probe.glCanvas(); if (!gl) return { ok: false, why: "no WebGL canvas" };
  const ctx = gl.getContext(gl.__ctxType); const attrs = ctx && ctx.getContextAttributes ? ctx.getContextAttributes() : null;
  const h = window.__probe.hooks(); const scene = h.scene && h.scene.obj;
  return new Promise((res) => requestAnimationFrame(() => {
    const rc = gl.getBoundingClientRect(), sx = gl.width / rc.width, sy = gl.height / rc.height;
    const c = document.createElement("canvas"); c.width = gl.width; c.height = gl.height;
    const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(gl, 0, 0);
    let how = "drawImage after the page's frame";
    const blank = () => { const d = x.getImageData(0, 0, c.width, c.height).data; for (let i = 0; i < d.length; i += 4 * 97) if (d[i] || d[i + 1] || d[i + 2]) return false; return true; };
    if (blank() && scene && typeof scene.render === "function") { try { scene.render(0); x.drawImage(gl, 0, 0); how = "scene.render(0) then drawImage (render-on-demand page)"; } catch {} }
    const means = {}; let inside = true, sum = 0;
    for (const [k, r] of Object.entries(rects)) {
      const X = Math.round((r.x - rc.left) * sx), Y = Math.round((r.y - rc.top) * sy), w = Math.max(1, Math.round(r.w * sx)), h = Math.max(1, Math.round(r.h * sy));
      if (X < 0 || Y < 0 || X + w > gl.width || Y + h > gl.height) { if (k === "A" || k === "B") inside = false; continue; }
      const d = x.getImageData(X, Y, w, h).data; const m = [0, 0, 0, 0];
      for (let i = 0; i < d.length; i += 4) { m[0] += d[i]; m[1] += d[i + 1]; m[2] += d[i + 2]; m[3] += d[i + 3]; }
      means[k] = m.slice(0, 3).map((v) => +(v / (d.length / 4)).toFixed(1)); sum += m[0] + m[1] + m[2];
    }
    res({ ok: true, how, means, inside, nonEmpty: sum > 0, attrs: attrs && { preserveDrawingBuffer: attrs.preserveDrawingBuffer, alpha: attrs.alpha, antialias: attrs.antialias }, why: sum > 0 ? null : "canvas read back empty (drawing buffer cleared); the screenshot was used" });
  }));
}
async function readPng({ b64, rects }) {
  const { x } = await window.__hpDecode(b64); const out = {};
  for (const [k, r] of Object.entries(rects)) {
    if (r.x < 0 || r.y < 0 || r.x + r.w > x.canvas.width || r.y + r.h > x.canvas.height) continue;
    const d = x.getImageData(r.x, r.y, r.w, r.h).data; const m = [0, 0, 0];
    for (let i = 0; i < d.length; i += 4) { m[0] += d[i]; m[1] += d[i + 1]; m[2] += d[i + 2]; }
    out[k] = m.map((v) => +(v / (d.length / 4)).toFixed(1));
  }
  return out;
}
async function annotate({ b64, rects, prof, pts, clip }) {
  const { c } = await window.__hpDecode(b64); const g = c.getContext("2d");
  g.lineWidth = 2; g.font = "12px monospace";
  g.strokeStyle = "#00e5ff"; g.beginPath(); g.moveTo(...pts.nose); g.lineTo(...pts.tail); g.stroke();
  g.strokeStyle = "#00ff66"; for (const k of ["finLeA", "finLeB"]) { g.beginPath(); g.arc(pts[k][0], pts[k][1], 4, 0, 7); g.stroke(); }
  g.fillStyle = "#ffff00"; for (const b of prof) g.fillRect(b.x + 1, b.y + 1, 1, 1);
  for (const [k, r] of Object.entries(rects)) { g.strokeStyle = "#ffff00"; g.strokeRect(r.x - 1.5, r.y - 1.5, r.w + 3, r.h + 3); g.fillStyle = "#ffff00"; g.fillText(k, r.x + r.w + 4, r.y + r.h); }
  const out = {};
  const crop = (x0, y0, w, h, k) => { const o = document.createElement("canvas"); o.width = Math.round(w * k); o.height = Math.round(h * k); const og = o.getContext("2d"); og.imageSmoothingEnabled = false; og.drawImage(c, x0, y0, w, h, 0, 0, o.width, o.height); return o.toDataURL("image/png"); };
  out.annotated = crop(clip.x, clip.y, clip.width, clip.height, 1);
  const cx = (pts.A[0] + pts.B[0]) / 2, cy = (pts.A[1] + pts.B[1]) / 2;
  out.zoom = crop(Math.max(0, cx - 80), Math.max(0, cy - 80), 160, 160, 3);
  return out;
}
