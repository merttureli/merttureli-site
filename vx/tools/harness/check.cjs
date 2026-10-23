#!/usr/bin/env node
/*
 * Page verification harness for the merttureli-site vx build.
 *
 *   node check.cjs <page-path-relative-to-repo-root> [options]
 *
 * Options
 *   --root <dir>        repo root to serve (default /home/user/merttureli-site)
 *   --out <dir>         where screenshots + report.json go (default ./out)
 *   --viewports a,b     e.g. 1440x900,390x844 (default both)
 *   --steps <n>         scroll screenshots per viewport (default 5)
 *   --no-reduced        skip the prefers-reduced-motion pass
 *   --no-gl             also run a pass with WebGL disabled
 *   --video             record a scroll-through video (webm) at the first viewport
 *   --wait <ms>         extra settle time after load (default 1500)
 *   --timeout <ms>      navigation timeout (default 45000)
 *   --port <n>          fixed port (default: random free port)
 *   --quiet             print only the summary line
 *
 * Exit code 0 when no console errors, page errors or failed requests were seen
 * on the main pass; 1 otherwise. The report is always written.
 */
const path = require("path");
const fs = require("fs");
const http = require("http");
const { chromium } = require(process.env.PW_MODULE || "/opt/node22/lib/node_modules/playwright");

const argv = process.argv.slice(2);
if (!argv.length || argv.includes("--help")) {
  console.log(fs.readFileSync(__filename, "utf8").split("*/")[0].replace(/^\/\*\s?/, ""));
  process.exit(0);
}
const opt = (name, dflt) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : dflt; };
const flag = (name) => argv.includes(name);
const page = argv[0].replace(/^\.?\//, "");
const ROOT = path.resolve(opt("--root", "/home/user/merttureli-site"));
const OUT = path.resolve(opt("--out", "./out"));
const VIEWPORTS = opt("--viewports", "1440x900,390x844").split(",").map(v => { const [w, h] = v.split("x").map(Number); return { width: w, height: h }; });
const STEPS = Number(opt("--steps", 5));
const WAIT = Number(opt("--wait", 1500));
const TIMEOUT = Number(opt("--timeout", 45000));
const QUIET = flag("--quiet");
fs.mkdirSync(OUT, { recursive: true });

const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".ico": "image/x-icon",
  ".webm": "video/webm", ".mp4": "video/mp4", ".glb": "model/gltf-binary", ".bin": "application/octet-stream",
  ".wasm": "application/wasm", ".ttf": "font/ttf", ".woff": "font/woff", ".woff2": "font/woff2", ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8", ".xml": "application/xml", ".vcf": "text/vcard", ".step": "application/octet-stream",
};
function serve(root) {
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
          let start = m[1] ? Number(m[1]) : 0, end = m[2] ? Number(m[2]) : st.size - 1;
          if (start >= st.size) { res.writeHead(416, { "Content-Range": `bytes */${st.size}` }); return res.end(); }
          end = Math.min(end, st.size - 1);
          res.writeHead(206, { "Content-Type": type, "Content-Range": `bytes ${start}-${end}/${st.size}`, "Accept-Ranges": "bytes", "Content-Length": end - start + 1 });
          return fs.createReadStream(file, { start, end }).pipe(res);
        }
        res.writeHead(200, { "Content-Type": type, "Content-Length": st.size, "Accept-Ranges": "bytes", "Cache-Control": "no-store" });
        fs.createReadStream(file).pipe(res);
      });
    });
    server.listen(Number(opt("--port", 0)), "127.0.0.1", () => resolve(server));
  });
}

async function runPass(browser, label, vp, { reducedMotion = "no-preference", webgl = true, video = false, base }) {
  const ctx = await browser.newContext({
    viewport: vp, deviceScaleFactor: 1, reducedMotion,
    hasTouch: vp.width < 600, isMobile: vp.width < 600,
    recordVideo: video ? { dir: OUT, size: vp } : undefined,
  });
  const p = await ctx.newPage();
  const log = { label, viewport: `${vp.width}x${vp.height}`, reducedMotion, webgl, consoleErrors: [], consoleWarnings: [], pageErrors: [], failedRequests: [], screenshots: [] };
  p.on("console", (m) => { const t = m.type(); const text = m.text(); if (t === "error") log.consoleErrors.push(text); else if (t === "warning") log.consoleWarnings.push(text); });
  p.on("pageerror", (e) => log.pageErrors.push(String(e && e.message || e)));
  log.abortedRequests = [];
  p.on("requestfailed", (r) => { const f = r.failure(); const text = f ? f.errorText : "failed"; if (/ERR_ABORTED/.test(text)) { log.abortedRequests.push(r.url()); return; } log.failedRequests.push(`${r.url()} :: ${text}`); });
  p.on("response", (r) => { if (r.status() >= 400) log.failedRequests.push(`${r.url()} :: HTTP ${r.status()}`); });
  if (!webgl) await p.addInitScript(() => { const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, ...a) { if (/webgl/i.test(t)) return null; return g.call(this, t, ...a); }; });
  await p.addInitScript(() => { window.__lcp = 0; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp = e.startTime; }).observe({ type: "largest-contentful-paint", buffered: true }); } catch {} });
  const t0 = Date.now();
  await p.goto(base + page, { waitUntil: "load", timeout: TIMEOUT });
  log.loadMs = Date.now() - t0;
  await p.waitForTimeout(WAIT);
  // CSS smooth scrolling makes programmatic scrollTo animate, which blanks screenshots mid-flight in software rendering.
  await p.addStyleTag({ content: "html, body { scroll-behavior: auto !important; }" });
  const shot = async (name) => { const f = path.join(OUT, `${label}-${name}.png`); await p.screenshot({ path: f, fullPage: false }); log.screenshots.push(f); };
  await shot("00-top");
  const metrics = await p.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight, clientHeight: document.documentElement.clientHeight,
    scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth,
    title: document.title, h1: [...document.querySelectorAll("h1")].map(h => h.textContent.trim().replace(/\s+/g, " ")).slice(0, 3),
    headings: [...document.querySelectorAll("h1,h2,h3")].length,
    imagesNoAlt: [...document.querySelectorAll("img:not([alt])")].length,
    canvases: document.querySelectorAll("canvas").length,
    videos: document.querySelectorAll("video").length,
    webgl: (() => { try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; } })(),
    focusables: document.querySelectorAll("a[href],button,input,select,textarea,[tabindex]:not([tabindex='-1'])").length,
    bodyText: (document.body.innerText || "").length,
    lcpMs: Math.round(window.__lcp || 0),
    emptyAlt: [...document.querySelectorAll("img[alt='']")].filter(i => !i.closest("[aria-hidden='true']") && i.width > 120).length,
  }));
  log.metrics = metrics;
  log.horizontalOverflow = metrics.scrollWidth > metrics.clientWidth + 1;
  // Scroll sweep with frame timing.
  const frames = await p.evaluate(async (steps) => {
    const max = Math.max(0, document.documentElement.scrollHeight - innerHeight);
    const samples = []; let last = performance.now();
    const total = Math.max(1200, Math.min(6000, max * 1.2));
    const start = performance.now();
    await new Promise((done) => {
      function tick(now) {
        const u = Math.min(1, (now - start) / total);
        scrollTo(0, max * (0.5 - 0.5 * Math.cos(Math.PI * u)));
        samples.push(now - last); last = now;
        if (u < 1) requestAnimationFrame(tick); else done();
      }
      requestAnimationFrame(tick);
    });
    samples.shift();
    const sorted = [...samples].sort((a, b) => a - b);
    const pct = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] || 0;
    return { frames: samples.length, meanMs: +(samples.reduce((a, b) => a + b, 0) / Math.max(1, samples.length)).toFixed(2), p50Ms: +pct(0.5).toFixed(2), p95Ms: +pct(0.95).toFixed(2), maxMs: +Math.max(...samples, 0).toFixed(2), longFrames: samples.filter(s => s > 50).length, scrollMax: max };
  }, STEPS);
  log.frameTiming = frames;
  // Step screenshots.
  for (let i = 1; i <= STEPS; i++) {
    await p.evaluate((u) => scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * u), i / STEPS);
    await p.waitForTimeout(700);
    await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    await shot(`${String(i).padStart(2, "0")}-${Math.round(100 * i / STEPS)}pct`);
  }
  await p.evaluate(() => scrollTo(0, 0));
  await p.waitForTimeout(300);
  // Keyboard reachability: tab 12 times and record what got focus.
  const focusTrail = [];
  for (let i = 0; i < 12; i++) { await p.keyboard.press("Tab"); focusTrail.push(await p.evaluate(() => { const e = document.activeElement; if (!e || e === document.body) return "body"; return `${e.tagName.toLowerCase()}${e.id ? "#" + e.id : ""}${e.className && typeof e.className === "string" ? "." + e.className.split(" ").filter(Boolean).slice(0, 2).join(".") : ""}`; })); }
  log.focusTrail = focusTrail;
  if (video) { await p.evaluate(() => scrollTo(0, 0)); await p.evaluate(async () => { const max = document.documentElement.scrollHeight - innerHeight; const start = performance.now(); await new Promise(d => { function t(n) { const u = Math.min(1, (n - start) / 9000); scrollTo(0, max * (0.5 - 0.5 * Math.cos(Math.PI * u))); if (u < 1) requestAnimationFrame(t); else d(); } requestAnimationFrame(t); }); }); await p.waitForTimeout(800); }
  await p.close();
  if (video) { const v = await ctx.pages; }
  await ctx.close();
  return log;
}

(async () => {
  const server = await serve(ROOT);
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}/`;
  const browser = await chromium.launch({ headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required", "--disable-dev-shm-usage"] });
  const report = { page, base, startedAt: new Date().toISOString(), passes: [] };
  try {
    for (const [i, vp] of VIEWPORTS.entries()) {
      report.passes.push(await runPass(browser, `main-${vp.width}x${vp.height}`, vp, { base, video: flag("--video") && i === 0 }));
      if (!flag("--no-reduced")) report.passes.push(await runPass(browser, `reduced-${vp.width}x${vp.height}`, vp, { base, reducedMotion: "reduce" }));
      if (flag("--no-gl") && i === 0) report.passes.push(await runPass(browser, `nogl-${vp.width}x${vp.height}`, vp, { base, webgl: false }));
    }
  } catch (e) {
    report.fatal = String(e && e.stack || e);
  } finally {
    await browser.close();
    server.close();
  }
  if (flag("--video")) { for (const f of fs.readdirSync(OUT)) if (f.endsWith(".webm")) fs.renameSync(path.join(OUT, f), path.join(OUT, "scroll-through.webm")); }
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  const main = report.passes.filter(p => p.label.startsWith("main-"));
  let bad = 0;
  for (const p of report.passes) {
    const issues = p.consoleErrors.length + p.pageErrors.length + p.failedRequests.length;
    if (p.label.startsWith("main-")) bad += issues + (p.horizontalOverflow ? 1 : 0);
    if (!QUIET) {
      console.log(`\n== ${p.label}  load ${p.loadMs}ms  lcp ${p.metrics.lcpMs}ms  text ${p.metrics.bodyText} chars  headings ${p.metrics.headings}  canvases ${p.metrics.canvases}  webgl ${p.metrics.webgl}`);
      console.log(`   frames: mean ${p.frameTiming.meanMs}ms p50 ${p.frameTiming.p50Ms}ms p95 ${p.frameTiming.p95Ms}ms max ${p.frameTiming.maxMs}ms long(>50ms) ${p.frameTiming.longFrames}/${p.frameTiming.frames}  scroll ${p.frameTiming.scrollMax}px`);
      console.log(`   overflow-x: ${p.horizontalOverflow}  imgs without alt: ${p.metrics.imagesNoAlt} (empty alt on large imgs: ${p.metrics.emptyAlt})  focusables: ${p.metrics.focusables}  tab trail: ${p.focusTrail.slice(0, 6).join(" > ")}`);
      if (p.consoleErrors.length) console.log("   console errors:\n     " + [...new Set(p.consoleErrors)].slice(0, 12).join("\n     "));
      if (p.pageErrors.length) console.log("   page errors:\n     " + [...new Set(p.pageErrors)].slice(0, 12).join("\n     "));
      if (p.failedRequests.length) console.log("   failed requests:\n     " + [...new Set(p.failedRequests)].slice(0, 12).join("\n     "));
      if (p.consoleWarnings.length) console.log(`   warnings: ${p.consoleWarnings.length} (first: ${p.consoleWarnings[0].slice(0, 160)})`);
    }
  }
  if (report.fatal) { console.log("FATAL: " + report.fatal); bad++; }
  console.log(`\nSUMMARY ${page}: ${bad === 0 ? "CLEAN" : bad + " issue(s)"}  report=${path.join(OUT, "report.json")}  screenshots=${OUT}`);
  process.exit(bad === 0 ? 0 : 1);
})();
