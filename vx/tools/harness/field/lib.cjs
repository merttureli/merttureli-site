/*
 * lib.cjs: shared helpers for the CHARGER field-study verification scripts in this folder.
 * Node built-ins and Playwright only. The static server and the Chromium launch flags are
 * copied from ../check.cjs (not imported), so this folder stands on its own.
 *
 * Exit codes used by every script: 0 PASS, 1 FAIL (a gate failed), 2 NOT READY (the page or
 * engine under test is not there yet; nothing was judged), 3 ERROR (the harness itself broke).
 */
const path = require("path");
const fs = require("fs");
const http = require("http");
const { execFileSync } = require("child_process");

const PW_MODULE = process.env.PW_MODULE || "/opt/node22/lib/node_modules/playwright";
const ROOT = "/home/user/merttureli-site";
const SCRATCH = "${process.env.VX_SCRATCH || '/tmp/vx-scratch'}";
const REPORTS = path.join(SCRATCH, "reports/field/probes");
const EXIT = { PASS: 0, FAIL: 1, NOT_READY: 2, ERROR: 3 };
const CHROMIUM_ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required", "--disable-dev-shm-usage"];

class NotReady extends Error {}

/* Arguments: --name value pairs, bare --flags, and positionals. --help prints the file's header comment. */
function args(file, argv = process.argv.slice(2)) {
  if (argv.includes("--help") || argv.includes("-h")) {
    const src = fs.readFileSync(file, "utf8");
    const m = /\/\*([\s\S]*?)\*\//.exec(src);
    console.log((m ? m[1] : "").split("\n").map((l) => l.replace(/^ ?\* ?/, "")).join("\n").trim());
    process.exit(0);
  }
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) { o._.push(a); continue; }
    const k = a.slice(2);
    if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) o[k] = argv[++i]; else o[k] = true;
  }
  return o;
}
const num = (v, d) => (v === undefined || v === true || !Number.isFinite(Number(v)) ? d : Number(v));
const viewports = (s) => String(s).split(",").map((v) => { const [w, h] = v.split("x").map(Number); return { width: w, height: h }; });

/* Merge query strings: later keys override earlier ones. */
function withQuery(pagePath, ...extra) {
  const [p, q0] = String(pagePath).replace(/^\.?\//, "").split("?");
  const sp = new URLSearchParams(q0 || "");
  for (const e of extra) if (e) for (const [k, v] of new URLSearchParams(String(e).replace(/^\?/, ""))) sp.set(k, v);
  const q = sp.toString().replace(/=(&|$)/g, "$1");
  return q ? `${p}?${q}` : p;
}

const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".ico": "image/x-icon",
  ".webm": "video/webm", ".mp4": "video/mp4", ".glb": "model/gltf-binary", ".bin": "application/octet-stream",
  ".wasm": "application/wasm", ".ttf": "font/ttf", ".woff": "font/woff", ".woff2": "font/woff2", ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8", ".xml": "application/xml",
};
/* Static server for the repo root (copied from check.cjs: Range support, no-store). Resolves to {server, base}. */
function serve(root = ROOT, port = 0) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let url = decodeURIComponent(req.url.split("?")[0]);
      if (url.endsWith("/")) url += "index.html";
      const file = path.join(root, url);
      if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
      fs.stat(file, (err, st) => {
        if (err || !st.isFile()) { res.writeHead(404); return res.end("not found"); }
        const type = MIME[path.extname(file).toLowerCase()] || "application/octet-stream";
        const range = req.headers.range;
        if (range) {
          const m = /bytes=(\d*)-(\d*)/.exec(range);
          const start = m[1] ? Number(m[1]) : 0; let end = m[2] ? Number(m[2]) : st.size - 1;
          if (start >= st.size) { res.writeHead(416, { "Content-Range": `bytes */${st.size}` }); return res.end(); }
          end = Math.min(end, st.size - 1);
          res.writeHead(206, { "Content-Type": type, "Content-Range": `bytes ${start}-${end}/${st.size}`, "Accept-Ranges": "bytes", "Content-Length": end - start + 1 });
          return fs.createReadStream(file, { start, end }).pipe(res);
        }
        res.writeHead(200, { "Content-Type": type, "Content-Length": st.size, "Accept-Ranges": "bytes", "Cache-Control": "no-store" });
        fs.createReadStream(file).pipe(res);
      });
    });
    server.listen(port, "127.0.0.1", () => resolve({ server, base: `http://127.0.0.1:${server.address().port}/` }));
  });
}

async function launch() {
  const { chromium } = require(PW_MODULE);
  return chromium.launch({ headless: true, args: CHROMIUM_ARGS });
}

/* In-page probe, installed before any page script. It records:
   - __probe.samples: one entry per animation frame {w: ms since navigation, t: simulated time or null}
   - __probe.bus: every bus event (vx/js/core/bus.js is a module singleton; importing the same URL
     once the import map has been parsed returns the page's own instance)
   - __probe.dom: CustomEvents with a ':' in the type dispatched on any EventTarget (a DOM bus)
   - __probe.hooks(): the page's objects found by shape (flight, scene, lattice, panel, playback, bus)
   - __probe.read(): time code, phase, lattice line, header strip text, from hooks or the DOM. */
function probeScript(busPath) {
  return `(() => {
  if (window.__probe) return;
  const P = window.__probe = { samples: [], bus: [], dom: [], busOk: false, busError: null, maxSamples: 40000 };
  const shapes = {
    flight: (o) => o.state && typeof o.step === 'function' && 'events' in o,
    scene: (o) => o.camera && o.three && o.three.body,
    lattice: (o) => typeof o.setInflow === 'function' && 'stats' in o,
    panel: (o) => typeof o.press === 'function' && typeof o.set === 'function' && o.state,
    playback: (o) => typeof o.launch === 'function' && 'rate' in o,
    bus: (o) => typeof o.on === 'function' && typeof o.emit === 'function' && o.state,
  };
  P.hooks = () => {
    const found = {}; const seen = new Set();
    const visit = (o, depth, name) => {
      if (!o || typeof o !== 'object' || seen.has(o) || o instanceof Node || o === window) return;
      seen.add(o);
      for (const [k, test] of Object.entries(shapes)) { try { if (!found[k] && test(o)) found[k] = { obj: o, path: name }; } catch {} }
      if (depth > 0) return;
      for (const k of Object.keys(o).slice(0, 60)) { let v; try { v = o[k]; } catch { continue; } visit(v, depth + 1, name + '.' + k); }
    };
    const names = ['__field', 'field', '__charger', 'charger', 'vxPanel', '__scene', 'flightLab', 'lattice', '__geom'];
    for (const k of Object.keys(window)) if (/^__|field|flight|scene|lattice|panel|charger/i.test(k) && !names.includes(k)) names.push(k);
    for (const n of names) { let v; try { v = window[n]; } catch { continue; } visit(v, 0, n); }
    if (!found.bus && P.busObj) found.bus = { obj: P.busObj, path: 'import(' + ${JSON.stringify(busPath)} + ')' };
    return found;
  };
  const TC = /T([+\\u2212-])\\s?(\\d{1,4}(?:\\.\\d+)?)/;
  let tcEl = null, tcScan = 0;
  const findText = (re) => {
    const w = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) if (re.test(n.nodeValue.trim())) return n.parentElement;
    return null;
  };
  const timeEl = () => {
    if (tcEl && tcEl.isConnected) return tcEl;
    const now = performance.now(); if (now - tcScan < 500) return null; tcScan = now;
    tcEl = document.querySelector('.pn-tc, [data-timecode], .timecode, .tc') || findText(/^T[+\\u2212-]\\d{1,4}\\.\\d{3}$/);
    return tcEl;
  };
  const parseT = (s) => { const m = TC.exec(s || ''); return m ? (m[1] === '+' ? 1 : -1) * Number(m[2]) : null; };
  let hk = null, hkAt = -1e9;
  const hooks = () => { const now = performance.now(); if (now - hkAt > 1000) { hkAt = now; try { hk = P.hooks(); } catch { hk = {}; } } return hk || {}; };
  P.simTime = () => {
    const f = hooks().flight; const t = f && f.obj.state && f.obj.state.t;
    if (Number.isFinite(t)) return t;
    const el = timeEl(); return el ? parseT(el.textContent) : null;
  };
  P.read = () => {
    const h = hooks(); const f = h.flight && h.flight.obj, L = h.lattice && h.lattice.obj;
    const q = (s) => { const e = document.querySelector(s); return e ? e.textContent.trim().replace(/\\s+/g, ' ') : null; };
    const rail = document.querySelector('aside.pn');
    const latEl = document.querySelector('.pn-line-v') || findText(/STEPS\\s*\\/\\s*S|LATTICE (PENDING|OFF)|NOT ATTACHED/i);
    const header = document.querySelector('header, .field-head, .fs-head');
    let stats = null; try { stats = L && L.stats ? JSON.parse(JSON.stringify(L.stats)) : null; } catch {}
    return {
      t: P.simTime(), timecode: (timeEl() || {}).textContent || null,
      phase: (f && (f.phase || (f.state && f.state.phase))) || (rail && rail.dataset.phase) || q('.pn-phase'),
      play: rail ? rail.dataset.play || null : null,
      alphaDeg: f && f.state && Number.isFinite(f.state.alpha) ? f.state.alpha * 180 / Math.PI : null,
      latticeLine: latEl ? latEl.textContent.trim().replace(/\\s+/g, ' ') : null, latticeStats: stats,
      latticeFallback: L ? L.fallback || null : null,
      header: header ? header.textContent.trim().replace(/\\s+/g, ' ').slice(0, 300) : null,
      headerFields: Object.fromEntries([...document.querySelectorAll('[data-h]')].slice(0, 20).map((e) => [e.dataset.h, e.textContent.trim().replace(/\\s+/g, ' ')])),
      hooks: Object.fromEntries(Object.entries(h).map(([k, v]) => [k, v.path])),
    };
  };
  let last = 0;
  const tick = (now) => {
    if (P.samples.length < P.maxSamples) P.samples.push({ w: +now.toFixed(2), t: P.simTime() });
    if (P.onTick) { try { P.onTick(P.samples.length - 1); } catch {} }
    last = now; requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  const safe = (d) => { try { return JSON.parse(JSON.stringify(d, (k, v) => (k === 'state' && v && typeof v === 'object' ? { t: v.t, phase: v.phase, alpha: v.alpha, altitude: v.altitude, v: v.v } : v))); } catch { return String(d); } };
  const rec = (type, d, via) => { const e = { type, via, w: +performance.now().toFixed(1), detail: safe(d) }; (via === 'dom' ? P.dom : P.bus).push(e); if (P.bus.length > 5000) P.bus.splice(0, 1000); };
  /* remember each canvas's context type and attributes; ?probe-preserve forces preserveDrawingBuffer */
  const gc = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, attrs) {
    if (/webgl/i.test(type) && window.__probeForcePreserve) attrs = Object.assign({}, attrs, { preserveDrawingBuffer: true });
    const c = gc.call(this, type, attrs);
    if (c && !this.__ctxType) { this.__ctxType = type; this.__ctxAttrs = attrs || null; }
    return c;
  };
  P.glCanvas = () => [...document.querySelectorAll('canvas')].filter((c) => /webgl/i.test(c.__ctxType || '')).sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0] || null;
  const orig = EventTarget.prototype.dispatchEvent;
  EventTarget.prototype.dispatchEvent = function (ev) { try { if (ev && typeof ev.type === 'string' && ev.type.includes(':')) rec(ev.type, ev.detail, 'dom'); } catch {} return orig.call(this, ev); };
  const hookBus = () => {
    if (P.busTried) return; P.busTried = true;
    if (!${JSON.stringify(busPath)}) return;
    import(new URL(${JSON.stringify(busPath)}, location.origin).href).then((m) => {
      const bus = m.bus || m.default; if (!bus || typeof bus.on !== 'function') return;
      P.busObj = bus; P.busOk = true;
      for (const type of ['flight:event', 'flight:reset', 'flight:config', 'lattice:stats', 'ui:view', 'ui:camera', 'governor:tier']) bus.on(type, (d) => rec(type, d, 'bus'));
    }).catch((e) => { P.busError = String(e && e.message || e); });
  };
  /* readyState 'interactive' comes after the parser has registered the import map and before
     deferred module scripts run, so this import neither blocks the map nor misses early events. */
  document.addEventListener('readystatechange', () => { if (document.readyState !== 'loading') hookBus(); });
})();`;
}

/* A context + page with logging. opts: viewport, reducedMotion, video {dir,size}, webgl (false disables), busPath. */
async function openPage(browser, opts = {}) {
  const vp = opts.viewport || { width: 1440, height: 900 };
  const ctx = await browser.newContext({
    viewport: vp, deviceScaleFactor: 1, reducedMotion: opts.reducedMotion || "no-preference",
    hasTouch: vp.width < 600, isMobile: vp.width < 600, recordVideo: opts.video || undefined,
  });
  const page = await ctx.newPage();
  const videoStartWall = Date.now();
  const busPath = opts.busPath === undefined ? "/vx/js/core/bus.js" : opts.busPath;
  const log = { consoleErrors: [], consoleWarnings: [], consoleLines: [], pageErrors: [], failedRequests: [], abortedRequests: [], http: [] };
  page.on("console", (m) => {
    const t = m.type(), text = m.text();
    if (t === "error") log.consoleErrors.push(text); else if (t === "warning") log.consoleWarnings.push(text);
    if (opts.keepConsole) log.consoleLines.push({ type: t, text, at: Date.now() });
  });
  page.on("pageerror", (e) => log.pageErrors.push(String((e && e.message) || e)));
  page.on("requestfailed", (r) => { const f = r.failure(); const text = f ? f.errorText : "failed"; if (/ERR_ABORTED/.test(text)) log.abortedRequests.push(r.url()); else log.failedRequests.push(`${r.url()} :: ${text}`); });
  page.on("response", (r) => { if (r.status() >= 400) log.failedRequests.push(`${r.url()} :: HTTP ${r.status()}`); log.http.push([r.status(), r.url()]); });
  if (opts.webgl === false) await page.addInitScript(() => { const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, ...a) { if (/webgl/i.test(t)) return null; return g.call(this, t, ...a); }; });
  await page.addInitScript({ content: probeScript(busPath) });
  return { ctx, page, log, videoStartWall };
}

/* Field-page readiness: the new page carries the panel (aside.pn) or says FIELD STUDY. */
async function fieldState(page) {
  return page.evaluate(() => {
    const text = (document.body && document.body.innerText) || "";
    return {
      title: document.title, h1: [...document.querySelectorAll("h1")].map((h) => h.textContent.trim().replace(/\s+/g, " ")),
      panel: !!document.querySelector("aside.pn, .pn-host"), fieldText: /field study/i.test(document.title + " " + text.slice(0, 20000)),
      canvases: document.querySelectorAll("canvas").length,
    };
  });
}
function assertField(st, pagePath) {
  if (st.panel || st.fieldText) return;
  throw new NotReady(`${pagePath} is not the field study page yet (title "${st.title}", h1 ${JSON.stringify(st.h1.slice(0, 2))}, no aside.pn panel, no "FIELD STUDY" text)`);
}
const httpStatus = (log, url) => { const hit = log.http.filter(([, u]) => u.split("?")[0] === url.split("?")[0]); return hit.length ? hit[hit.length - 1][0] : null; };

function stats(arr) {
  const a = arr.filter(Number.isFinite).sort((x, y) => x - y);
  if (!a.length) return { n: 0 };
  const pct = (q) => a[Math.min(a.length - 1, Math.floor(q * a.length))];
  return { n: a.length, mean: +(a.reduce((s, v) => s + v, 0) / a.length).toFixed(2), p50: +pct(0.5).toFixed(2), p95: +pct(0.95).toFixed(2), max: +a[a.length - 1].toFixed(2), over50: a.filter((v) => v > 50).length };
}
/* Remove noise the probe itself causes (its bus import) from the error lists. */
function cleanLog(log, busPath = "/vx/js/core/bus.js") {
  const mine = (s) => busPath && s.includes(busPath) && /404|ERR_/.test(s);
  return { consoleErrors: [...new Set(log.consoleErrors)], pageErrors: [...new Set(log.pageErrors)], failedRequests: [...new Set(log.failedRequests.filter((s) => !mine(s)))], consoleWarnings: log.consoleWarnings.length };
}

function outDir(o, name) { const d = path.resolve(o.out || path.join(REPORTS, name)); fs.mkdirSync(d, { recursive: true }); return d; }
function writeJSON(dir, name, obj) { const f = path.join(dir, name); fs.writeFileSync(f, JSON.stringify(obj, null, 2)); return f; }
function ffmpeg(args) { try { execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: "pipe" }); return true; } catch (e) { return String(e.stderr || e.message).slice(0, 300); } }
function toMp4(webm, mp4) { return ffmpeg(["-i", webm, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-crf", "23", mp4]); }

/* Run main(ctx) with a server and a browser; map the outcome to the exit code and the SUMMARY line.
   clean: a RegExp of this script's own output names, removed from the out dir first. */
async function run(name, o, main, clean) {
  const dir = outDir(o, name);
  if (clean) for (const f of fs.readdirSync(dir)) if (clean.test(f)) fs.rmSync(path.join(dir, f), { force: true });   // no stale outputs from an earlier run
  const report = { script: name, startedAt: new Date().toISOString(), root: path.resolve(o.root || ROOT), swiftshader: "Chromium with --use-angle=swiftshader: WebGL is software-rendered here; timings are not representative of a GPU." };
  let status = "ERROR", detail = "", code = EXIT.ERROR, server = null, browser = null;
  try {
    if (!o.static) { const s = await serve(report.root, num(o.port, 0)); server = s.server; report.base = s.base; browser = await launch(); }
    const r = await main({ dir, report, base: report.base, browser });
    status = r.pass ? "PASS" : "FAIL"; code = r.pass ? EXIT.PASS : EXIT.FAIL; detail = r.detail || "";
  } catch (e) {
    if (e instanceof NotReady) { status = "NOT READY"; code = EXIT.NOT_READY; detail = e.message; }
    else { status = "ERROR"; code = EXIT.ERROR; detail = String((e && e.stack) || e).split("\n").slice(0, 4).join(" | "); }
    report.error = detail;
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (server) server.close();
  }
  report.status = status; report.exitCode = code; report.finishedAt = new Date().toISOString();
  const f = writeJSON(dir, "report.json", report);
  console.log(`SUMMARY ${name}: ${status}${detail ? " " + detail : ""}  report=${f}`);
  process.exit(code);
}

module.exports = { ROOT, SCRATCH, REPORTS, EXIT, NotReady, args, num, viewports, withQuery, serve, launch, openPage, fieldState, assertField, httpStatus, stats, cleanLog, outDir, writeJSON, ffmpeg, toMp4, run, probeScript };
