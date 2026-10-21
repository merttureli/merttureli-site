#!/usr/bin/env node
/**
 * Visual regression harness for merttureli.com.
 *
 * Serves two copies of the site (baseline and candidate) on two local ports,
 * screenshots every page at every width and palette in both, and diffs the
 * pairs with pixelmatch. Alongside the pixels it checks three gates per page:
 * requests to hosts other than the local server, the number of <h1> elements,
 * and console errors.
 *
 *   node visual-regress.js --baseline ../../../baseline --candidate ../.. --out ./out
 *
 * See README.md for every option.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const http = require("http");

/* ------------------------------------------------------------------ options */

const DEFAULTS = {
  baseline: null,
  candidate: null,
  out: path.join(__dirname, "out"),
  ports: "8930,8931",
  widths: "390,860,1440,1920",
  palettes: "original,slate",
  pages: "index.html,websites.html,privacy.html,404.html,hi/index.html,projects/*.html",
  date: "2026-10-21T12:00:00Z",
  threshold: "0.1",
  concurrency: "4",
  playwright: "/opt/node22/lib/node_modules/playwright",
  // painted over in every screenshot: the photography corridor is a live 3D
  // scene whose resting pose depends on frame timing
  mask: "photo-corridor",
  strict: false,
  retry: true,
};

function parseArgs(argv) {
  const opts = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") { opts.help = true; continue; }
    if (a === "--strict") { opts.strict = true; continue; }
    if (a === "--no-retry") { opts.retry = false; continue; }
    const m = /^--([a-z-]+)(?:=(.*))?$/.exec(a);
    if (!m || !(m[1] in DEFAULTS)) throw new Error("unknown option " + a);
    opts[m[1]] = m[2] !== undefined ? m[2] : argv[++i];
  }
  return opts;
}

const opts = parseArgs(process.argv.slice(2));
if (opts.help || !opts.baseline || !opts.candidate) {
  console.log(fs.readFileSync(path.join(__dirname, "README.md"), "utf8"));
  process.exit(opts.help ? 0 : 2);
}

const { chromium } = require(opts.playwright);
const { PNG } = require("pngjs");
const pixelmatch = require("pixelmatch");

const PORTS = opts.ports.split(",").map(Number);
const WIDTHS = opts.widths.split(",").map(Number);
const PALETTES = opts.palettes.split(",");
const THRESHOLD = Number(opts.threshold);
const CONCURRENCY = Math.max(1, Number(opts.concurrency));
const FROZEN = new Date(opts.date);
const OUT = path.resolve(opts.out);
const SIDES = {
  baseline: { root: path.resolve(opts.baseline), port: PORTS[0] },
  candidate: { root: path.resolve(opts.candidate), port: PORTS[1] },
};
// a realistic height per width, so vh-based heroes lay out as on a device
const HEIGHTS = { 390: 844, 860: 1180, 1440: 900, 1920: 1080 };
// third parties that must never be contacted from a test run
const BLOCKED = /clarity\.ms|bing\.com|workers\.dev|formspree\.io/i;
const PALETTE_KEY = "mert-portfolio-palette-v1";
const MASKS = opts.mask ? opts.mask.split(",").filter(Boolean) : [];

/* ------------------------------------------------------------- static server */

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif",
  ".avif": "image/avif", ".ico": "image/x-icon", ".mp4": "video/mp4", ".webm": "video/webm",
  ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".otf": "font/otf",
  ".pdf": "application/pdf", ".txt": "text/plain; charset=utf-8", ".xml": "application/xml",
  ".glb": "model/gltf-binary", ".bin": "application/octet-stream", ".vcf": "text/vcard",
};

function serve(root, port) {
  const server = http.createServer((req, res) => {
    let rel;
    try { rel = decodeURIComponent(new URL(req.url, "http://x").pathname); }
    catch (e) { res.writeHead(400); return res.end(); }
    let file = path.join(root, path.normalize(rel).replace(/^([/\\])+/, ""));
    if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
    if (!fs.existsSync(file)) {
      const notFound = path.join(root, "404.html");
      res.writeHead(404, { "content-type": TYPES[".html"] });
      return res.end(fs.existsSync(notFound) ? fs.readFileSync(notFound) : "not found");
    }
    const stat = fs.statSync(file);
    const type = TYPES[path.extname(file).toLowerCase()] || "application/octet-stream";
    const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || "");
    if (range) {
      // video elements ask for ranges; answer them so playback behaves as live
      const start = range[1] ? Number(range[1]) : 0;
      const end = range[2] ? Number(range[2]) : stat.size - 1;
      res.writeHead(206, {
        "content-type": type, "accept-ranges": "bytes", "content-length": end - start + 1,
        "content-range": "bytes " + start + "-" + end + "/" + stat.size,
      });
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { "content-type": type, "content-length": stat.size, "accept-ranges": "bytes",
                         "cache-control": "no-store" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

/* -------------------------------------------------------------------- pages */

function expandPages() {
  const out = new Set();
  for (const pat of opts.pages.split(",")) {
    if (!pat.includes("*")) { out.add(pat); continue; }
    const dir = path.dirname(pat);
    const re = new RegExp("^" + path.basename(pat).replace(/[.]/g, "\\.").replace(/\*/g, ".*") + "$");
    for (const side of Object.values(SIDES)) {
      const abs = path.join(side.root, dir);
      if (!fs.existsSync(abs)) continue;
      for (const f of fs.readdirSync(abs)) if (re.test(f)) out.add(path.posix.join(dir, f));
    }
  }
  return [...out].sort();
}

/* ------------------------------------------------------------------ capture */

async function settle(page) {
  await page.evaluate(() => document.fonts.ready);
  // walk the page once so scroll-triggered reveals and lazy media resolve, then
  // return to the top. Timers still run under the frozen clock.
  await page.evaluate(async () => {
    const pause = ms => new Promise(r => setTimeout(r, ms));
    const step = Math.max(200, Math.floor(innerHeight * 0.8));
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      scrollTo(0, y);
      await pause(60);
    }
    scrollTo(0, document.documentElement.scrollHeight);
    await pause(150);
    scrollTo(0, 0);
    await pause(150);
  });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  await page.evaluate(async () => {
    const pause = ms => new Promise(r => setTimeout(r, ms));
    // every <img>, including those inside open shadow roots (the photography
    // corridor mounts its frames into one)
    const all = sel => {
      const out = [];
      const walk = root => {
        out.push(...root.querySelectorAll(sel));
        for (const el of root.querySelectorAll("*")) if (el.shadowRoot) walk(el.shadowRoot);
      };
      walk(document);
      return out;
    };
    // lazy images that never came near the viewport would otherwise load on
    // one side and not the other, so force them all and wait for decode
    const imgs = all("img");
    for (const img of imgs) if (img.loading === "lazy") img.loading = "eager";
    await Promise.race([
      Promise.all(imgs.map(img => (img.complete ? Promise.resolve() : new Promise(r => { img.addEventListener("load", r, { once: true }); img.addEventListener("error", r, { once: true }); }))
        .then(() => img.decode ? img.decode().catch(() => {}) : null))),
      pause(8000),
    ]);
    // A video that started (an autoplay attribute does that even under reduced
    // motion, before media-playback.js pauses it) shows whichever frame it
    // reached, which differs run to run. Put every video back on its poster:
    // load() with no autoplay resets the element and re-shows the poster.
    // Lazy posters (data-poster, applied by js/media-playback.js when a video
    // comes near) get the same treatment as lazy images: force them, and wait
    // until the poster file has loaded and decoded.
    const posters = [];
    for (const v of all("video")) {
      v.pause();
      v.removeAttribute("autoplay");
      v.autoplay = false;
      if (v.dataset.poster) { v.poster = v.dataset.poster; v.removeAttribute("data-poster"); }
      if (v.poster) posters.push(v.poster);
      if (v.readyState > 0 || v.currentTime > 0) v.load();
    }
    await Promise.race([
      Promise.all(posters.map(src => { const im = new Image(); im.src = src; return im.decode().catch(() => {}); })),
      pause(8000),
    ]);
    await pause(300);
    await document.fonts.ready;
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
}

async function capture(browser, side, pagePath, width, palette, file) {
  const origin = "http://127.0.0.1:" + SIDES[side].port;
  const context = await browser.newContext({
    viewport: { width, height: HEIGHTS[width] || 900 },
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  await context.route(BLOCKED, route => route.abort("blockedbyclient"));
  // the daily palette and any date copy read the clock, so freeze it
  await context.clock.setFixedTime(FROZEN);
  await context.addInitScript(([key, value]) => {
    try { localStorage.setItem(key, value); } catch (e) { /* storage blocked */ }
  }, [PALETTE_KEY, palette]);

  const gates = { external: [], consoleErrors: [], blockedNoise: [], pageErrors: [], h1: 0, status: 0 };
  const page = await context.newPage();
  page.on("request", req => {
    const url = req.url();
    if (/^(data|blob|about):/.test(url)) return;
    let reqOrigin;
    try { reqOrigin = new URL(url).origin; } catch (e) { return; }
    if (reqOrigin !== origin) gates.external.push({ url, blocked: BLOCKED.test(url) });
  });
  page.on("console", msg => {
    if (msg.type() !== "error") return;
    const loc = (msg.location() || {}).url || "";
    const entry = { text: msg.text().slice(0, 500), url: loc };
    // failed loads of hosts this harness blocks on purpose are not page bugs
    if (BLOCKED.test(loc) || /ERR_BLOCKED_BY_CLIENT/.test(msg.text())) gates.blockedNoise.push(entry);
    else gates.consoleErrors.push(entry);
  });
  page.on("pageerror", err => gates.pageErrors.push(String(err && err.message || err).slice(0, 500)));

  try {
    const resp = await page.goto(origin + "/" + pagePath, { waitUntil: "networkidle", timeout: 45000 });
    gates.status = resp ? resp.status() : 0;
    await settle(page);
    gates.h1 = await page.evaluate(() => {
      // components may render into open shadow roots, so count there too
      let n = 0;
      const walk = root => {
        n += root.querySelectorAll("h1").length;
        for (const el of root.querySelectorAll("*")) if (el.shadowRoot) walk(el.shadowRoot);
      };
      walk(document);
      return n;
    });
    gates.theme = await page.evaluate(() => document.documentElement.dataset.cardTheme || null);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    await page.screenshot({ path: file, fullPage: true, animations: "disabled", caret: "hide",
                            mask: MASKS.map(sel => page.locator(sel)), maskColor: "#ff00ff" });
  } finally {
    await context.close();
  }
  return gates;
}

/* --------------------------------------------------------------------- diff */

function readPng(file) { return PNG.sync.read(fs.readFileSync(file)); }

function pad(png, w, h) {
  if (png.width === w && png.height === h) return png;
  const out = new PNG({ width: w, height: h });
  // magenta outside the original bounds so a size change always shows as diff
  for (let i = 0; i < out.data.length; i += 4) {
    out.data[i] = 255; out.data[i + 1] = 0; out.data[i + 2] = 255; out.data[i + 3] = 255;
  }
  PNG.bitblt(png, out, 0, 0, png.width, png.height, 0, 0);
  return out;
}

function diffPair(aFile, bFile, outFile) {
  const a = readPng(aFile), b = readPng(bFile);
  const w = Math.max(a.width, b.width), h = Math.max(a.height, b.height);
  const pa = pad(a, w, h), pb = pad(b, w, h);
  const diff = new PNG({ width: w, height: h });
  const pixels = pixelmatch(pa.data, pb.data, diff.data, w, h, { threshold: THRESHOLD });
  const result = {
    pixels, ratio: pixels / (w * h),
    baselineSize: [a.width, a.height], candidateSize: [b.width, b.height],
    sizeChanged: a.width !== b.width || a.height !== b.height,
    bbox: null,
  };
  if (pixels) {
    // bounding box of changed pixels, to say where on the page the change is
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (diff.data[i] === 255 && diff.data[i + 1] === 0 && diff.data[i + 2] === 0) {
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    if (x1 >= 0) result.bbox = [x0, y0, x1, y1];
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, PNG.sync.write(diff));
  }
  return result;
}

/* ---------------------------------------------------------------------- run */

function slug(p) { return p.replace(/\.html$/, "").replace(/[\/]/g, "__"); }

async function pool(items, n, fn) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) { const i = next++; await fn(items[i], i); }
  }));
}

function summariseGates(list) {
  const external = {};
  for (const g of list) for (const r of g.external) {
    const host = new URL(r.url).host;
    external[host] = external[host] || { count: 0, blocked: r.blocked, sample: r.url };
    external[host].count++;
  }
  const uniq = arr => [...new Set(arr)];
  return {
    status: uniq(list.map(g => g.status)),
    h1: uniq(list.map(g => g.h1)),
    themes: uniq(list.map(g => g.theme)),
    externalHosts: external,
    consoleErrors: uniq(list.flatMap(g => g.consoleErrors.map(e => e.text + (e.url ? " @ " + e.url : "")))),
    pageErrors: uniq(list.flatMap(g => g.pageErrors)),
    blockedNoise: uniq(list.flatMap(g => g.blockedNoise.map(e => e.text))).length,
  };
}

function compareGates(b, c) {
  const changes = [];
  const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  if (!same(b.status, c.status)) changes.push("HTTP status " + b.status + " -> " + c.status);
  if (!same(b.h1, c.h1)) changes.push("h1 count " + b.h1 + " -> " + c.h1);
  const bh = Object.keys(b.externalHosts).sort(), ch = Object.keys(c.externalHosts).sort();
  for (const h of ch) if (!bh.includes(h)) changes.push("new external host " + h);
  for (const h of bh) if (!ch.includes(h)) changes.push("external host gone " + h);
  for (const e of c.consoleErrors) if (!b.consoleErrors.includes(e)) changes.push("new console error: " + e);
  for (const e of b.consoleErrors) if (!c.consoleErrors.includes(e)) changes.push("console error gone: " + e);
  for (const e of c.pageErrors) if (!b.pageErrors.includes(e)) changes.push("new page error: " + e);
  return changes;
}

const esc = s => String(s).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));

function contactSheet(report) {
  const rows = report.results.map(r => {
    const cls = r.diff.pixels ? "bad" : "ok";
    return `<tr class="${cls}"><td>${esc(r.page)}</td><td>${r.width}</td><td>${esc(r.palette)}</td>` +
      `<td>${r.diff.pixels}</td><td>${(r.diff.ratio * 100).toFixed(3)}%</td>` +
      `<td>${r.diff.sizeChanged ? esc(r.diff.baselineSize.join("x") + " → " + r.diff.candidateSize.join("x")) : esc(r.diff.baselineSize.join("x"))}</td>` +
      `<td>${r.diff.bbox ? esc(r.diff.bbox.join(", ")) : ""}</td><td>${r.retried ? "yes" : ""}</td></tr>`;
  }).join("\n");
  const cards = report.results.filter(r => r.diff.pixels).map(r => `
  <section class="card">
    <h3>${esc(r.page)} · ${r.width}px · ${esc(r.palette)} <small>${r.diff.pixels} px (${(r.diff.ratio * 100).toFixed(3)}%)${r.diff.bbox ? " · box " + esc(r.diff.bbox.join(",")) : ""}</small></h3>
    <div class="trio">
      <figure><figcaption>baseline</figcaption><a href="${esc(r.images.baseline)}"><img loading="lazy" src="${esc(r.images.baseline)}" alt="baseline"></a></figure>
      <figure><figcaption>candidate</figcaption><a href="${esc(r.images.candidate)}"><img loading="lazy" src="${esc(r.images.candidate)}" alt="candidate"></a></figure>
      <figure><figcaption>diff</figcaption><a href="${esc(r.images.diff)}"><img loading="lazy" src="${esc(r.images.diff)}" alt="diff"></a></figure>
    </div>
  </section>`).join("\n");
  const gateRows = Object.entries(report.gates).map(([p, g]) => `<tr class="${g.changes.length ? "bad" : "ok"}">` +
    `<td>${esc(p)}</td><td>${esc(g.baseline.h1.join("/"))} → ${esc(g.candidate.h1.join("/"))}</td>` +
    `<td>${esc(Object.keys(g.baseline.externalHosts).join(", ") || "none")}</td>` +
    `<td>${esc(Object.keys(g.candidate.externalHosts).join(", ") || "none")}</td>` +
    `<td>${g.baseline.consoleErrors.length + g.baseline.pageErrors.length} → ${g.candidate.consoleErrors.length + g.candidate.pageErrors.length}</td>` +
    `<td>${g.changes.map(esc).join("<br>")}</td></tr>`).join("\n");
  const s = report.summary;
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Visual regression report</title>
<style>
:root{--bg:#fafaf8;--fg:#1a1a1a;--muted:#666;--line:#ddd;--bad:#fde8e8;--ok:transparent;--card:#fff}
@media (prefers-color-scheme: dark){:root{--bg:#141414;--fg:#eee;--muted:#aaa;--line:#333;--bad:#3a1d1d;--card:#1d1d1d}}
body{margin:0;padding:24px 16px;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,sans-serif}
h1{font-size:20px;margin:0 0 4px}p.meta{color:var(--muted);margin:0 0 20px}
table{border-collapse:collapse;width:100%;margin:0 0 28px;font-size:13px;display:block;overflow-x:auto}
th,td{border-bottom:1px solid var(--line);padding:5px 8px;text-align:left;vertical-align:top;white-space:nowrap}
td:last-child{white-space:normal}tr.bad td{background:var(--bad)}
.card{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:12px;margin:0 0 20px}
.card h3{margin:0 0 10px;font-size:15px}.card small{color:var(--muted);font-weight:400}
.trio{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
figure{margin:0}figcaption{color:var(--muted);font-size:12px;margin-bottom:4px}
img{width:100%;height:auto;max-height:900px;object-fit:contain;object-position:top;border:1px solid var(--line);background:#fff}
@media (max-width:700px){.trio{grid-template-columns:1fr}}
</style></head><body>
<h1>Visual regression report</h1>
<p class="meta">baseline ${esc(report.config.baseline)}<br>candidate ${esc(report.config.candidate)}<br>
${s.shots} comparisons · ${s.differing} differ · ${s.gateChanges} pages with gate changes · clock frozen at ${esc(report.config.date)} · reducedMotion reduce · generated ${esc(report.generated)}</p>
<h2>Gates</h2>
<table><thead><tr><th>page</th><th>h1</th><th>external hosts (baseline)</th><th>external hosts (candidate)</th><th>console/page errors</th><th>changes</th></tr></thead><tbody>
${gateRows}
</tbody></table>
<h2>Screens</h2>
<table><thead><tr><th>page</th><th>width</th><th>palette</th><th>diff px</th><th>ratio</th><th>size</th><th>bbox x0,y0,x1,y1</th><th>retried</th></tr></thead><tbody>
${rows}
</tbody></table>
<h2>Differences</h2>
${cards || "<p>No pixel differences.</p>"}
</body></html>
`;
}

async function main() {
  for (const [name, side] of Object.entries(SIDES)) {
    if (!fs.existsSync(path.join(side.root, "index.html"))) throw new Error(name + " has no index.html: " + side.root);
  }
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const servers = await Promise.all(Object.values(SIDES).map(s => serve(s.root, s.port)));
  const browser = await chromium.launch();
  const pages = expandPages();
  const jobs = [];
  for (const p of pages) for (const w of WIDTHS) for (const pal of PALETTES) jobs.push({ page: p, width: w, palette: pal });
  const results = [];
  const gateLog = {};
  const started = Date.now();

  try {
    await pool(jobs, CONCURRENCY, async (job, i) => {
      const name = `${slug(job.page)}--${job.width}--${job.palette}.png`;
      const files = {
        baseline: path.join(OUT, "shots", "baseline", name),
        candidate: path.join(OUT, "shots", "candidate", name),
        diff: path.join(OUT, "diffs", name),
      };
      const shoot = async () => {
        const g = {};
        for (const side of Object.keys(SIDES)) g[side] = await capture(browser, side, job.page, job.width, job.palette, files[side]);
        return g;
      };
      let gates = await shoot();
      let diff = diffPair(files.baseline, files.candidate, files.diff);
      let retried = false;
      if (diff.pixels && opts.retry) {
        // shoot both again; a real change survives, a timing flake usually does not
        retried = true;
        const firstDiff = diff;
        gates = await shoot();
        diff = diffPair(files.baseline, files.candidate, files.diff);
        diff.firstAttemptPixels = firstDiff.pixels;
      }
      if (!diff.pixels && fs.existsSync(files.diff)) fs.rmSync(files.diff);
      for (const side of Object.keys(SIDES)) {
        (gateLog[job.page] = gateLog[job.page] || { baseline: [], candidate: [] })[side].push(gates[side]);
      }
      const rel = f => path.relative(OUT, f).split(path.sep).join("/");
      results.push({ ...job, diff, retried, images: { baseline: rel(files.baseline), candidate: rel(files.candidate), diff: diff.pixels ? rel(files.diff) : null }, gates });
      process.stdout.write(`[${results.length}/${jobs.length}] ${job.page} ${job.width} ${job.palette}: ${diff.pixels ? diff.pixels + " px differ" : "same"}${retried ? " (retried)" : ""}\n`);
    });
  } finally {
    await browser.close();
    servers.forEach(s => s.close());
  }

  results.sort((a, b) => a.page.localeCompare(b.page) || a.width - b.width || a.palette.localeCompare(b.palette));
  const gates = {};
  for (const p of pages) {
    const b = summariseGates(gateLog[p].baseline), c = summariseGates(gateLog[p].candidate);
    gates[p] = { baseline: b, candidate: c, changes: compareGates(b, c) };
  }
  const report = {
    generated: new Date().toISOString(),
    seconds: Math.round((Date.now() - started) / 1000),
    config: { baseline: SIDES.baseline.root, candidate: SIDES.candidate.root, ports: PORTS, widths: WIDTHS,
              palettes: PALETTES, pages, date: FROZEN.toISOString(), threshold: THRESHOLD,
              reducedMotion: "reduce", blocked: String(BLOCKED), masked: MASKS },
    summary: {
      shots: results.length,
      differing: results.filter(r => r.diff.pixels).length,
      differingPages: [...new Set(results.filter(r => r.diff.pixels).map(r => r.page))],
      gateChanges: Object.values(gates).filter(g => g.changes.length).length,
      consoleErrorsCandidate: Object.values(gates).reduce((n, g) => n + g.candidate.consoleErrors.length + g.candidate.pageErrors.length, 0),
    },
    gates,
    results: results.map(({ gates: _g, ...r }) => r),
  };
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(OUT, "index.html"), contactSheet(report));
  console.log(`\n${report.summary.differing}/${report.summary.shots} screens differ; ` +
              `${report.summary.gateChanges} pages with gate changes. Report: ${path.join(OUT, "index.html")}`);
  if (opts.strict && (report.summary.differing || report.summary.gateChanges)) process.exitCode = 1;
}

main().catch(err => { console.error(err); process.exit(2); });
