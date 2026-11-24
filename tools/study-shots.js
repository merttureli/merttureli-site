#!/usr/bin/env node
/* Screenshots and a health report for one design study or sample site.

     node tools/study-shots.js <key> [--out DIR] [--steps N] [--path /studies/<key>/]

   Serves the repository on a free local port, opens /studies/<key>/ at desktop (1440 x 900) and phone
   (390 x 844) width, and writes to DIR (default: a folder in the system temp directory):

     desktop-00.png ...   the page a screen at a time, top to bottom (N steps, default 8), so scroll-driven
     phone-00.png ...     effects are caught in the act
     desktop-full.png, phone-full.png, desktop-reduced.png (prefers-reduced-motion: reduce, first screen)
     sheet-desktop.jpg, sheet-phone.jpg   every frame on one contact sheet, for a quick look at the whole page
     report.json          console errors, failed and outside requests, bytes by type, sideways overflow,
                          focusable elements with no visible name, images with no alt

   Nothing is clicked or submitted. Analytics hosts are blocked, as in every Playwright run here. */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2), key = args.find(a => !a.startsWith('--'));
const opt = (name, fallback) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : fallback; };
if (!key) { console.error('usage: node tools/study-shots.js <key> [--out DIR] [--steps N] [--path /studies/<key>/]'); process.exit(2); }
const out = path.resolve(opt('out', path.join(os.tmpdir(), 'study-shots-' + key))), steps = +opt('steps', 8), page0 = opt('path', `/studies/${key}/`);
fs.mkdirSync(out, { recursive: true });

const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.woff2': 'font/woff2', '.woff': 'font/woff', '.mp4': 'video/mp4', '.webm': 'video/webm', '.bin': 'application/octet-stream', '.glb': 'model/gltf-binary', '.ico': 'image/x-icon' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  const data = fs.readFileSync(file), range = req.headers.range;
  if (range) {                                            // video needs byte ranges
    const m = /bytes=(\d+)-(\d*)/.exec(range), a = +m[1], b = m[2] ? +m[2] : data.length - 1;
    res.writeHead(206, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Content-Range': `bytes ${a}-${b}/${data.length}`, 'Accept-Ranges': 'bytes', 'Content-Length': b - a + 1 });
    res.end(data.subarray(a, b + 1)); return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Content-Length': data.length, 'Accept-Ranges': 'bytes' });
  res.end(data);
});

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`, browser = await chromium.launch(), report = { key, url: page0, views: {} };
  for (const [name, viewport, reduced] of [['desktop', { width: 1440, height: 900 }, false], ['phone', { width: 390, height: 844 }, false], ['desktop-reduced', { width: 1440, height: 900 }, true]]) {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: reduced ? 'reduce' : 'no-preference', isMobile: name === 'phone', hasTouch: name === 'phone' });
    await ctx.route(/clarity\.ms|bing\.com|workers\.dev|formspree\.io/, r => r.abort());
    const page = await ctx.newPage(), v = report.views[name] = { errors: [], failed: [], outside: [], bytes: {} };
    page.on('pageerror', e => v.errors.push(String(e).slice(0, 300)));
    page.on('console', m => { if (m.type() === 'error') v.errors.push(m.text().slice(0, 300)); });
    page.on('requestfailed', r => v.failed.push(r.url().replace(base, '')));
    page.on('request', r => { if (!r.url().startsWith(base) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) v.outside.push(r.url().slice(0, 120)); });
    page.on('response', async r => { if (!r.url().startsWith(base)) return; if (r.status() >= 400) v.failed.push(`${r.status()} ${r.url().replace(base, '')}`);
      try { const n = (await r.body()).length, t = r.request().resourceType(); v.bytes[t] = (v.bytes[t] || 0) + n; } catch (e) {} });
    await page.goto(base + page0, { waitUntil: 'load' });
    await page.waitForTimeout(2500);
    if (reduced) { await page.screenshot({ path: path.join(out, 'desktop-reduced.png') }); await ctx.close(); continue; }
    const size = await page.evaluate(() => ({ h: document.documentElement.scrollHeight, w: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    v.height = size.h; v.sidewaysOverflow = size.w - size.cw;
    for (let i = 0; i < steps; i++) {
      await page.evaluate(y => window.scrollTo({ top: y, behavior: 'instant' }), Math.round((size.h - viewport.height) * i / Math.max(1, steps - 1)));
      await page.waitForTimeout(900);
      await page.screenshot({ path: path.join(out, `${name}-${String(i).padStart(2, '0')}.png`) });
    }
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' })); await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(out, `${name}-full.png`), fullPage: true }).catch(() => {});
    Object.assign(v, await page.evaluate(() => ({
      unnamed: [...document.querySelectorAll('a,button,input,select,textarea,[tabindex]')].filter(e => e.offsetParent && !(e.innerText || '').trim() && !e.getAttribute('aria-label') && !e.getAttribute('aria-labelledby') && !e.getAttribute('title') && !(e.labels && e.labels.length) && !e.querySelector('img[alt]:not([alt=""])')).map(e => e.outerHTML.slice(0, 90)),
      noAlt: [...document.querySelectorAll('img:not([alt])')].map(e => e.getAttribute('src')),
      h1: document.querySelectorAll('h1').length, title: document.title, noindex: !!document.querySelector('meta[name=robots][content*=noindex]'),
    })));
    v.kb = Math.round(Object.values(v.bytes).reduce((a, b) => a + b, 0) / 1024);
    await ctx.close();
  }
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 1));
  const sheet = await browser.newPage({ viewport: { width: 1800, height: 900 } });
  for (const [name, per, w] of [['desktop', 4, 446], ['phone', 8, 221]]) {       // contact sheets: frame number in the corner
    const cells = Array.from({ length: steps }, (_, i) => { const f = path.join(out, `${name}-${String(i).padStart(2, '0')}.png`);
      return fs.existsSync(f) ? `<figure><img src="data:image/png;base64,${fs.readFileSync(f).toString('base64')}"><figcaption>${i}</figcaption></figure>` : ''; }).join('');
    await sheet.setContent(`<body style="margin:0;background:#777;display:grid;grid-template-columns:repeat(${per},${w}px);gap:4px;padding:4px;font:12px sans-serif">
      <style>figure{margin:0;position:relative}img{width:${w}px;display:block}figcaption{position:absolute;left:0;top:0;background:#000;color:#fff;padding:1px 5px}</style>${cells}</body>`, { waitUntil: 'load' });
    await sheet.screenshot({ path: path.join(out, `sheet-${name}.jpg`), type: 'jpeg', quality: 72, fullPage: true });
  }
  const d = report.views.desktop, p = report.views.phone;
  console.log(`${key}: desktop ${d.kb} KB, ${d.errors.length} errors, ${d.failed.length} failed, ${d.outside.length} outside requests, overflow ${d.sidewaysOverflow}px; phone ${p.kb} KB, ${p.errors.length} errors, overflow ${p.sidewaysOverflow}px`);
  console.log(`shots and report.json in ${out}`);
  await Promise.race([browser.close(), new Promise(r => setTimeout(r, 4000))]); server.close(); process.exit(0);
})();
