#!/usr/bin/env node
/* vx/tools/capture-og.cjs: captures the CHARGER field study's share image, vx/og-field.png
   (PRESENTATION-PLAN item 9). A real frame of the page, never a mock-up: it serves the repository
   root, opens vx/index.html in headless Chromium and screenshots the stage's view box, which is
   exactly 1200 x 630 at a 1520 x 830 window (the 320 px panel rail to the right, the 48 px header
   above, the 152 px chart dock below).

   Frames:
     --frame title   (default, the shipped og-field.png) the title plate before the first launch:
                     WHAT THE FINS DO, the plain sentence, the byline with his name, the rocket on the
                     rail with the flow section running
     --frame plate   the end plate of the default launch: the full-fins path to apogee with the
                     no-fins path as its ghost, the end card with the apogee and the settle time (every
                     number SIM, flown in the tab at capture time)
   Options: --out <png> (default vx/og-field.png), --tier <n> (default 1; SwiftShader runs tier 1).

   Usage, from the repository root:
     node vx/tools/capture-og.cjs [--frame title|plate] [--out vx/og-field.png]
   Playwright comes from PW_MODULE or /opt/node22/lib/node_modules/playwright (CLAUDE.md rule 7: never
   playwright install). Every context blocks clarity.ms, bing.com, workers.dev and formspree.io, and
   aborts any request that is not a GET or a HEAD; the page sends no analytics. */
const path = require('path');
const fs = require('fs');
const http = require('http');
const pw = require(process.env.PW_MODULE || '/opt/node22/lib/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const arg = (name, dflt) => { const i = process.argv.indexOf(`--${name}`); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt; };
const FRAME = arg('frame', 'title');
const OUT = path.resolve(arg('out', path.join(ROOT, 'vx', 'og-field.png')));
const TIER = Number(arg('tier', '1'));
const W = 1520, H = 830, CLIP = { x: 0, y: 48, width: 1200, height: 630 };
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.bin': 'application/octet-stream', '.pdf': 'application/pdf' };
const BLOCK = /(^|\.)(clarity\.ms|bing\.com|workers\.dev|formspree\.io)$/i;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
      let url = decodeURIComponent(req.url.split('?')[0]);
      if (url.endsWith('/')) url += 'index.html';
      const file = path.join(ROOT, url);
      if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
      fs.stat(file, (err, st) => {
        if (err || !st.isFile()) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size });
        fs.createReadStream(file).pipe(res);
      });
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, base: `http://127.0.0.1:${server.address().port}/` }));
  });
}
async function until(page, fn, ms) {
  const t0 = Date.now();
  for (;;) {
    let ok = false; try { ok = await page.evaluate(fn); } catch { ok = false; }
    if (ok) return true;
    if (Date.now() - t0 > ms) throw new Error(`timed out waiting for ${String(fn).slice(0, 80)}`);
    await sleep(250);
  }
}

(async () => {
  const { server, base } = await serve();
  const browser = await pw.chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  try {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, reducedMotion: 'no-preference' });
    await ctx.route('**/*', (route) => {
      const req = route.request();
      let host = ''; try { host = new URL(req.url()).hostname; } catch { /* data: */ }
      if (BLOCK.test(host) || (req.method() !== 'GET' && req.method() !== 'HEAD')) return route.abort('blockedbyclient');
      return route.continue();
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e && e.message || e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`${base}vx/index.html?tier=${TIER}`, { waitUntil: 'load' });
    await until(page, () => window.__field && window.__field.scene && window.__field.scene.cad, 180000);
    await page.evaluate(() => document.fonts.ready);
    const box = await page.evaluate(() => { const r = document.querySelector('.fd-viewport').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
    if (Math.round(box.width) !== CLIP.width || Math.round(box.height) !== CLIP.height || Math.round(box.y) !== CLIP.y) throw new Error(`the view box is ${JSON.stringify(box)}, not 1200 x 630 at y 48`);
    if (FRAME === 'title') {
      // the flow develops behind the plate: wait for the engine's own developed flag, then a little more
      await until(page, () => window.__field.lattice && window.__field.lattice.stats.developed, 300000).catch(() => console.warn('the lattice did not report a developed flow; capturing anyway'));
      await sleep(4000);
    } else {
      await page.click('[data-launch="fins"]');
      await sleep(400);
      await page.evaluate(() => window.__field.playback.pause());
      for (let i = 0; i < 15; i++) {
        const at = await page.evaluate(() => { const pb = window.__field.playback; if (!pb.atApogee) pb.step(1); return pb.atApogee; });
        if (at) break;
      }
      await until(page, () => window.__field.playback.atApogee && window.__field.director && window.__field.director.plate, 30000);
      await sleep(4000);                    // the camera's 2.4 s pull-back to the plate, and a settled frame
      await page.mouse.move(W - 10, 10);    // no hover state on the stage
    }
    await page.screenshot({ path: OUT, clip: CLIP });
    const st = await page.evaluate(() => ({ t: window.__field.flight.state.t, end: window.__field.end, plate: window.__field.director && window.__field.director.plate }));
    console.log(`wrote ${path.relative(process.cwd(), OUT)} (${CLIP.width} x ${CLIP.height}, frame ${FRAME}, T+${st.t.toFixed(3)} s${st.end ? `, apogee ${st.end.apogee.toFixed(1)} ft SIM` : ''})`);
    if (errors.length) { console.error('page errors:', errors.join(' | ')); process.exitCode = 1; }
  } finally {
    await browser.close(); server.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
