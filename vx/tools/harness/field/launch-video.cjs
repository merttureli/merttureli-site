#!/usr/bin/env node
/*
 * launch-video.cjs: record the CHARGER field page launching and check the flight events.
 *
 *   node launch-video.cjs [--page vx/index.html] [--query "k=v&k2=v2"] [options]
 *
 * Opens <page>?autolaunch=1&speed=1 (merged with --query; later keys win) at 1440x900, records
 * --seconds of video with Playwright recordVideo, samples the simulated time every animation
 * frame, and writes:
 *   launch.webm + launch.mp4            the recording (mp4 through the system ffmpeg)
 *   frame-T<t>.png                      the video frame at each simulated time in --frames.
 *                                       Frame-accurate: while recording, a 112 x 8 px strip at the
 *                                       bottom-right corner shows the animation-frame counter in
 *                                       binary (magenta guards, 12 bits); ffmpeg reads it back so
 *                                       each video frame maps to the sampled simulated time. The
 *                                       bottom 8 px are cropped from launch.mp4 and the frames.
 *                                       --no-sync drops the strip (frames then use the page-creation
 *                                       time, which runs about 1 s off under load).
 *   frame-T<t>-live.png                 a full-resolution screenshot taken when the time code
 *                                       first passes t (the report gives the actual T of both)
 *   report.json                         events, phase transitions, time line, errors, gates
 *
 * Where the data comes from, best first: window objects found by shape (window.__field or any
 * global holding {flight, scene, lattice, panel}); the shared bus (vx/js/core/bus.js imported once
 * the import map is parsed, so the page's own instance); CustomEvents named "x:y" on any DOM
 * EventTarget; the DOM (time code .pn-tc or any "T+00.000" text, phase from aside.pn[data-phase]
 * or .pn-phase). Phase transitions stand in for events when no bus or hook is reachable.
 *
 * Options
 *   --page <path>          page relative to the repo root (default vx/index.html)
 *   --query <qs>           extra query string merged over autolaunch=1&speed=1
 *   --seconds <s>          recording length after load (default 24)
 *   --frames <list>        simulated times for frames (default 0.3,1.3,3,8)
 *   --viewport WxH         default 1440x900
 *   --require <list>       events that must occur (default ignition,liftoff,railExit,burnout)
 *   --no-sync              no frame-counter strip (frames then use the page-creation time)
 *   --press-launch         press LAUNCH (button, else key L) after load (for pages without autolaunch)
 *   --eval <js>            run this in the page after load (lab set-up)
 *   --any-page             skip the field-page readiness check (labs)
 *   --out <dir>            default reports/field/probes/launch-video
 *   --root <dir>           repo root to serve (default /home/user/merttureli-site)
 *
 * Gates: no console errors, page errors or failed requests; the simulated time advances; every
 * --require event is seen; the core events are in time order (ignition <= liftoff <= railExit <=
 * burnout <= apogee); the video is at least --seconds - 2 long. Frames past the last simulated time
 * reached are listed as not reached (a warning: SwiftShader can run slower than real time).
 * Exit 0 PASS, 1 FAIL, 2 NOT READY (page is not the field study yet), 3 harness error.
 * Prints one SUMMARY line last.
 */
const path = require("path");
const fs = require("fs");
const L = require("./lib.cjs");

const o = L.args(__filename);
const PAGE = (o.page || "vx/index.html").replace(/^\.?\//, "");
const URL_PATH = L.withQuery(PAGE, "autolaunch=1&speed=1", o.query);
const SECONDS = L.num(o.seconds, 24);
const FRAMES = String(o.frames || "0.3,1.3,3,8").split(",").map(Number).filter(Number.isFinite);
const VP = L.viewports(o.viewport || "1440x900")[0];
const REQUIRE = String(o.require || "ignition,liftoff,railExit,burnout").split(",").filter(Boolean);
const CORE = ["ignition", "liftoff", "railExit", "burnout", "apogee"];
const PHASE_EVENT = { rail: "liftoff", boost: "railExit", coast: "burnout", descent: "apogee" };

L.run("launch-video", o, async ({ dir, report, base, browser }) => {
  report.page = URL_PATH; report.viewport = `${VP.width}x${VP.height}`; report.seconds = SECONDS;
  const vidDir = path.join(dir, "video-tmp");
  fs.rmSync(vidDir, { recursive: true, force: true });
  const { ctx, page, log, videoStartWall } = await L.openPage(browser, { viewport: VP, video: { dir: vidDir, size: VP } });
  if (!o["no-sync"]) await page.addInitScript(clockStrip);
  let closed = false;
  const close = async () => { if (!closed) { closed = true; await ctx.close(); } };
  try {
    const t0 = Date.now();
    const resp = await page.goto(base + URL_PATH, { waitUntil: "load", timeout: 60000 }).catch((e) => ({ status: () => 0, err: e }));
    report.loadMs = Date.now() - t0;
    if (!resp || resp.status() >= 400 || resp.status() === 0) throw new L.NotReady(`${PAGE} did not load (HTTP ${resp && resp.status()})`);
    await page.waitForTimeout(1200);
    report.pageState = await L.fieldState(page);
    if (!o["any-page"]) L.assertField(report.pageState, PAGE);
    if (typeof o.eval === "string") report.evalResult = await page.evaluate(o.eval).catch((e) => "eval failed: " + e.message);
    if (o["press-launch"]) {
      const b = page.locator("button[data-act=launch]").or(page.getByRole("button", { name: /^launch/i })).first();
      if (await b.isVisible().catch(() => false)) await b.click(); else await page.keyboard.press("l");
      report.pressedLaunch = true;
    }
    // Poll the simulated time; take a live screenshot when it first passes each frame time.
    const timeline = [], phases = [], pending = [...FRAMES].sort((a, b) => a - b), live = [];
    let lastPhase = null, lastKeep = 0, maxT = -Infinity;
    while (Date.now() - t0 < SECONDS * 1000) {
      const r = await page.evaluate(() => (window.__probe ? window.__probe.read() : null)).catch(() => null);
      const now = Date.now();
      if (r) {
        if (Number.isFinite(r.t)) maxT = Math.max(maxT, r.t);
        if (r.phase && r.phase !== lastPhase) { phases.push({ phase: String(r.phase).toLowerCase(), t: r.t, wallS: +((now - t0) / 1000).toFixed(2) }); lastPhase = r.phase; }
        if (now - lastKeep > 500) { timeline.push({ wallS: +((now - t0) / 1000).toFixed(2), t: r.t, phase: r.phase, alphaDeg: r.alphaDeg == null ? null : +r.alphaDeg.toFixed(2), lattice: r.latticeLine }); lastKeep = now; }
        while (pending.length && Number.isFinite(r.t) && r.t >= pending[0]) {
          const want = pending.shift(); const f = path.join(dir, `frame-T${want}-live.png`);
          await page.screenshot({ path: f });
          const after = await page.evaluate(() => window.__probe.read().t).catch(() => null);
          live.push({ want, tBefore: r.t, tAfter: after, file: f });
        }
      }
      await page.waitForTimeout(80);
    }
    report.timeline = timeline; report.phaseTransitions = phases; report.liveFrames = live;
    const probe = await page.evaluate(() => {
      const P = window.__probe; const h = P.hooks(); const f = h.flight && h.flight.obj;
      const evs = f && Array.isArray(f.events) ? f.events.map((e) => ({ name: e.name, t: e.t })) : null;
      const panelEvents = h.panel && h.panel.obj.state && h.panel.obj.state.events || null;
      const readouts = {};
      for (const el of document.querySelectorAll(".pn-r[data-r]")) { const v = el.querySelector(".pn-v"); readouts[el.dataset.r] = v ? v.textContent.trim() : null; }
      return { timeOrigin: performance.timeOrigin, samples: P.samples, bus: P.bus, dom: P.dom, busOk: P.busOk, busError: P.busError, hooks: Object.fromEntries(Object.entries(h).map(([k, v]) => [k, v.path])), flightEvents: evs, panelEvents, readouts, final: P.read() };
    });
    const videoPath = await page.video().path();
    await close();
    // Events: hooks first, then the bus, then the DOM bus, then phase transitions.
    const busEv = probe.bus.filter((e) => e.type === "flight:event").map((e) => ({ name: e.detail && e.detail.name, t: e.detail && e.detail.t, wallMs: e.w }));
    const domEv = probe.dom.filter((e) => e.type === "flight:event" && e.detail).map((e) => ({ name: e.detail.name, t: e.detail.t }));
    const phaseEv = phases.filter((p) => PHASE_EVENT[p.phase]).map((p) => ({ name: PHASE_EVENT[p.phase], t: p.t, approx: true }));
    const src = probe.flightEvents && probe.flightEvents.length ? ["hooks", probe.flightEvents] : busEv.length ? ["bus", busEv] : domEv.length ? ["dom-event", domEv] : ["phase", phaseEv];
    report.events = { source: src[0], sequence: src[1].map((e) => `${e.name}@${Number(e.t).toFixed(3)}`), list: src[1], busEmissionOrder: busEv.map((e) => e.name), panelEvents: probe.panelEvents };
    report.probe = { busOk: probe.busOk, busError: probe.busError, hooks: probe.hooks, readouts: probe.readouts, final: probe.final, otherBus: [...new Set(probe.bus.map((e) => e.type))] };
    // Frame timing and the simulated-time line.
    const samples = probe.samples, dts = [];
    for (let i = 1; i < samples.length; i++) dts.push(samples[i].w - samples[i - 1].w);
    report.frameTimesMs = L.stats(dts.slice(1));
    report.maxSimT = Number.isFinite(maxT) ? maxT : null;
    // Video: rename, convert, extract the frame at each simulated time.
    const webm = path.join(dir, "launch.webm"), mp4 = path.join(dir, "launch.mp4");
    if (videoPath && fs.existsSync(videoPath)) fs.renameSync(videoPath, webm);
    fs.rmSync(vidDir, { recursive: true, force: true });
    report.video = { webm: fs.existsSync(webm) ? webm : null };
    if (report.video.webm) {
      const conv = L.ffmpeg(["-i", webm, "-vf", "crop=iw:ih-8:0:0", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-crf", "23", mp4]);
      report.video.mp4 = conv === true ? mp4 : null; if (conv !== true) report.video.mp4Error = conv;
      report.video.durationS = durationOf(report.video.mp4 || webm);
    }
    const clock = !o["no-sync"] && report.video.webm ? readClock(webm, VP) : null;
    report.videoSync = clock ? { method: "frame-counter strip", decodedFrames: clock.filter((c) => c !== null).length, of: clock.length } : { method: "page creation time (approximate)" };
    report.frames = FRAMES.map((want) => {
      const k = samples.findIndex((s) => Number.isFinite(s.t) && s.t >= want && s.t < want + 5);
      if (k < 0) return { want, reached: false };
      let offsetS, shown = k, how = "counter";
      const j = clock ? clock.findIndex((c) => c !== null && c >= k) : -1;
      if (j >= 0) { offsetS = j / FPS; shown = clock[j]; }
      else { const a = samples[Math.max(0, k - 1)], b = samples[k]; offsetS = (probe.timeOrigin + b.w - videoStartWall) / 1000; how = "page-creation clock"; void a; }
      const f = path.join(dir, `frame-T${want}.png`);
      const ok = L.ffmpeg(["-ss", offsetS.toFixed(3), "-i", webm, "-frames:v", "1", "-vf", "crop=iw:ih-8:0:0", f]);
      const r3 = (s) => (s && Number.isFinite(s.t) ? +s.t.toFixed(3) : null);
      return { want, reached: true, simT: r3(samples[k]), shownSimT: [r3(samples[shown]), r3(samples[shown + 1])], videoOffsetS: +offsetS.toFixed(3), sync: how, file: ok === true && fs.existsSync(f) ? f : null, error: ok === true ? undefined : ok };
    });
    // Gates.
    const errs = L.cleanLog(log);
    report.errors = errs;
    const names = src[1].map((e) => e.name);
    const order = CORE.map((n) => src[1].find((e) => e.name === n)).filter(Boolean);
    const outOfOrder = order.filter((e, i) => i > 0 && Number(e.t) + 1e-6 < Number(order[i - 1].t)).map((e) => e.name);
    report.gates = {
      noConsoleErrors: errs.consoleErrors.length === 0, noPageErrors: errs.pageErrors.length === 0, noFailedRequests: errs.failedRequests.length === 0,
      timeAdvanced: report.maxSimT !== null && report.maxSimT > 0.5,
      requiredEvents: REQUIRE.every((n) => names.includes(n)), missingEvents: REQUIRE.filter((n) => !names.includes(n)),
      eventsInOrder: outOfOrder.length === 0, outOfOrder,
      videoLength: !report.video.webm ? false : report.video.durationS == null ? null : report.video.durationS >= SECONDS - 2,   // null: no ffprobe to measure it
    };
    const fails = Object.entries(report.gates).filter(([k, v]) => v === false).map(([k]) => k);
    const notReached = report.frames.filter((f) => !f.reached).map((f) => f.want);
    report.warnings = notReached.length ? [`frames not reached (max simulated T ${report.maxSimT}): ${notReached.join(", ")}`] : [];
    const seq = report.events.sequence.join(" > ") || "none";
    return { pass: fails.length === 0, detail: `${fails.length ? "failed " + fails.join(",") + " / " : ""}events(${src[0]}) ${seq} / maxT ${report.maxSimT === null ? "-" : report.maxSimT.toFixed(2)} / errors ${errs.consoleErrors.length}+${errs.pageErrors.length}+${errs.failedRequests.length} / video ${report.video.durationS || 0}s${notReached.length ? " / not reached T" + notReached.join(",") : ""}${errs.pageErrors.length ? ` / first page error "${errs.pageErrors[0].slice(0, 120)}"` : ""}` };
  } finally { await close().catch(() => {}); }
}, /^(frame-T.*\.png|launch\.(webm|mp4))$/);

/* In-page: a 14-block strip (magenta guard, 12 bits of the animation-frame counter, magenta guard). */
function clockStrip() {
  const P = window.__probe; if (!P) return;
  let el = null, bits = [];
  P.onTick = (i) => {
    if (!el) {
      if (!document.body) return;
      el = document.createElement("div"); el.setAttribute("aria-hidden", "true");
      el.style.cssText = "position:fixed;right:0;bottom:0;width:112px;height:8px;display:flex;z-index:2147483647;pointer-events:none";
      for (let b = 0; b < 14; b++) { const s = document.createElement("span"); s.style.cssText = `flex:0 0 8px;height:8px;background:${b === 0 || b === 13 ? "#f0f" : "#000"}`; el.appendChild(s); bits.push(s); }
      document.documentElement.appendChild(el);
    }
    for (let b = 0; b < 12; b++) bits[b + 1].style.background = (i >> (11 - b)) & 1 ? "#fff" : "#000";
  };
}
/* Decode the strip from every video frame resampled at FPS; returns the counter per output frame or null. */
const FPS = 50;
function readClock(file, vp) {
  try {
    const W = 112, H = 8;
    const raw = require("child_process").execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", file, "-vf", `crop=${W}:${H}:${vp.width - W}:${vp.height - H},fps=${FPS}`, "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"], { maxBuffer: 256 << 20 });
    const n = W * H * 3, out = [];
    const px = (f, x, y) => { const k = f * n + (y * W + x) * 3; return [raw[k], raw[k + 1], raw[k + 2]]; };
    const magenta = ([r, g, b]) => r > 150 && b > 150 && g < 110;
    for (let f = 0; (f + 1) * n <= raw.length; f++) {
      if (!magenta(px(f, 4, 4)) || !magenta(px(f, 108, 4))) { out.push(null); continue; }
      let c = 0;
      for (let b = 0; b < 12; b++) { const [r, g, bl] = px(f, 8 * (b + 1) + 4, 4); c = (c << 1) | ((r + g + bl) / 3 > 128 ? 1 : 0); }
      out.push(c);
    }
    // the counter only grows: drop decodes that go backwards (compression noise)
    let hi = -1; for (let f = 0; f < out.length; f++) { if (out[f] === null) continue; if (out[f] < hi) out[f] = null; else hi = out[f]; }
    return out;
  } catch { return null; }
}

function durationOf(file) {
  try {
    const out = require("child_process").execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString().trim();
    return Number.isFinite(Number(out)) ? +Number(out).toFixed(2) : null;
  } catch { return null; }
}
