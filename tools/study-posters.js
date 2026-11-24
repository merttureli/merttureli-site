#!/usr/bin/env node
/* Poster frames for the catalog of sample sites (studies/index.html).

     node tools/study-posters.js [key ...] [--wait MS]

   Serves the repository on a free local port and, for each key (default: all twelve below), opens
   /studies/<key>/ and writes into studies/catalog/assets/:

     <key>-1.jpg ... <key>-4.jpg   1440 x 900 at the top, a third, two thirds and the end of the page, saved 960 wide
     <key>-phone.jpg               390 x 844 at the top, saved 390 wide

   Each frame waits for fonts, the images in view and a settle time (3D pages need several seconds in headless
   Chromium: a page with a <canvas> gets --wait, default 7000 ms, the others half of it). The page is told it is
   framed (data-study-framed), so its "Back to websites" pill hides as it does in the catalog's viewer.
   No poster may show HOTBOX or the bend fixture (the site's IP rule): elements that name them are hidden first.
   A key whose page is missing, fails to load or paints nothing gets neutral placeholder frames; the run never
   fails on one sample. Nothing is clicked or submitted; analytics and form hosts are blocked. */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'studies', 'catalog', 'assets');
const ALL = ['vireo', 'albada', 'halfstop', 'batterymate', 'stepwise', 'lowlight', 'sideslip', 'slowroads', 'hangar', 'launch', 'studio', 'specimen'];
const args = process.argv.slice(2);
const waitArg = args.indexOf('--wait'), WAIT = waitArg >= 0 ? +args[waitArg + 1] : 7000;
const keys = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--wait');
const unknown = keys.filter(k => !ALL.includes(k));
if (unknown.length) { console.error(`unknown key: ${unknown.join(', ')} (known: ${ALL.join(' ')})`); process.exit(2); }
const todo = keys.length ? keys : ALL;
const DESK = { width: 1440, height: 900 }, PHONE = { width: 390, height: 844 }, DESK_OUT = 960, QUALITY = 0.78;
fs.mkdirSync(OUT, { recursive: true });

const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.woff2': 'font/woff2', '.woff': 'font/woff', '.mp4': 'video/mp4', '.webm': 'video/webm', '.bin': 'application/octet-stream', '.glb': 'model/gltf-binary', '.ico': 'image/x-icon' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  const data = fs.readFileSync(file), range = req.headers.range;
  if (range) {
    const m = /bytes=(\d+)-(\d*)/.exec(range), a = +m[1], b = m[2] ? +m[2] : data.length - 1;
    res.writeHead(206, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Content-Range': `bytes ${a}-${b}/${data.length}`, 'Accept-Ranges': 'bytes', 'Content-Length': b - a + 1 });
    res.end(data.subarray(a, b + 1)); return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Content-Length': data.length, 'Accept-Ranges': 'bytes' });
  res.end(data);
});

const FRAMED = `(() => { const mark = () => document.documentElement && document.documentElement.setAttribute('data-study-framed', '');
  mark(); document.addEventListener('DOMContentLoaded', mark); })();`;

// The site's IP rule: no HOTBOX and no bend fixture in a poster. The four portfolio redesigns predate the rule
// and still show HOTBOX, so before each capture every element that names either (text, alt, src) is hidden
// with the card or figure around it, and the capture is refused if one is still on screen.
const SCRUB = () => {
  const bad = /hotbox|bend[\s-]*fixture/i, hide = el => { const box = el.closest('article, li, figure, .project, .card, .tile, [class*=card], [class*=project]') || el; box.style.setProperty('visibility', 'hidden', 'important'); };
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n; (n = walk.nextNode());) if (bad.test(n.nodeValue) && n.parentElement) hide(n.parentElement);
  document.querySelectorAll('img, video, [aria-label], [title]').forEach(el => { if (bad.test([el.getAttribute('alt'), el.getAttribute('src'), el.getAttribute('poster'), el.getAttribute('aria-label'), el.getAttribute('title')].join(' '))) hide(el); });
  const left = [];
  const w2 = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n; (n = w2.nextNode());) { const el = n.parentElement; if (!el || !bad.test(n.nodeValue)) continue;
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    if (cs.visibility !== 'hidden' && r.bottom > 0 && r.top < innerHeight && r.width > 0) left.push(n.nodeValue.trim().slice(0, 40)); }
  return left;
};
async function scrubbed(page) {
  const left = await page.evaluate(SCRUB);
  if (left.length) throw new Error('a HOTBOX or bend fixture mention is still on screen: ' + left.join(' | '));
  return page.screenshot({ type: 'png' });
}

// Wait for web fonts and every image that intersects the viewport (lazy ones included), with a cap.
async function settle(page, ms) {
  await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
  await page.waitForFunction(() => [...document.images].every(img => {
    const r = img.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight || r.width === 0) return true;
    return img.complete;
  }), null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(ms);
}

// Downscale a PNG screenshot in the browser (high-quality smoothing) and return JPEG bytes.
async function toJpeg(helper, png, width) {
  const url = await helper.evaluate(async ({ b64, width, q }) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = width; c.height = Math.round(img.height * width / img.width);
    const g = c.getContext('2d'); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', q);
  }, { b64: png.toString('base64'), width, q: QUALITY });
  return Buffer.from(url.split(',')[1], 'base64');
}

// A neutral tile in the catalog's own paper color, for a page that is missing or broken right now.
async function placeholder(helper, width, height) {
  const url = await helper.evaluate(({ width, height, q }) => {
    const c = document.createElement('canvas'); c.width = width; c.height = height;
    const g = c.getContext('2d'); g.fillStyle = '#dcdee1'; g.fillRect(0, 0, width, height);
    return c.toDataURL('image/jpeg', q);
  }, { width, height, q: QUALITY });
  return Buffer.from(url.split(',')[1], 'base64');
}

async function shoot(browser, base, helper, key) {
  const file = path.join(ROOT, 'studies', key, 'index.html');
  const written = [], warn = [];
  const save = (name, buf) => { fs.writeFileSync(path.join(OUT, name), buf); written.push(name); };
  const fallback = async why => {
    for (let i = 1; i <= 4; i++) save(`${key}-${i}.jpg`, await placeholder(helper, DESK_OUT, 600));
    save(`${key}-phone.jpg`, await placeholder(helper, 390, 844));
    console.log(`${key}: placeholder (${why})`);
  };
  if (!fs.existsSync(file)) return fallback('no studies/' + key + '/index.html');

  const frames = {};
  for (const [name, viewport, mobile] of [['desktop', DESK, false], ['phone', PHONE, true]]) {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile, reducedMotion: 'no-preference' });
    await ctx.route(/clarity\.ms|bing\.com|workers\.dev|formspree\.io/, r => r.abort());
    await ctx.route(u => !u.href.startsWith(base) && !/^(data|blob):/.test(u.href), r => r.abort());   // nothing leaves this machine
    await ctx.addInitScript(FRAMED);
    const page = await ctx.newPage();
    page.setDefaultTimeout(120000);   // a software-GL frame of a 3D page can take seconds to capture
    page.on('pageerror', e => warn.push(String(e).slice(0, 160)));
    try {
      const res = await page.goto(`${base}/studies/${key}/`, { waitUntil: 'load', timeout: 45000 });
      if (!res || res.status() >= 400) throw new Error('HTTP ' + (res ? res.status() : 'none'));
      const has3d = await page.evaluate(() => !!document.querySelector('canvas') || [...document.scripts].some(s => /three|stage|rig/.test(s.src)));
      const first = has3d ? WAIT : WAIT / 2;
      await settle(page, first);
      const tall = await page.evaluate(() => document.documentElement.scrollHeight);
      if (tall < 200) throw new Error('the page paints nothing');
      if (name === 'phone') { frames.phone = await scrubbed(page); }
      else {
        frames.desk = [];
        for (let i = 0; i < 4; i++) {
          if (i) {
            const h = await page.evaluate(() => document.documentElement.scrollHeight);
            await page.evaluate(y => window.scrollTo({ top: y, behavior: 'instant' }), Math.round((h - viewport.height) * i / 3));
            await settle(page, has3d ? Math.max(2500, WAIT / 2) : 1800);
          }
          frames.desk.push(await scrubbed(page));
        }
      }
    } catch (e) {
      await ctx.close();
      return fallback(String(e.message || e).split('\n')[0]);
    }
    await ctx.close();
  }
  for (let i = 0; i < 4; i++) save(`${key}-${i + 1}.jpg`, await toJpeg(helper, frames.desk[i], DESK_OUT));
  save(`${key}-phone.jpg`, await toJpeg(helper, frames.phone, 390));
  const kb = Math.round(written.reduce((a, n) => a + fs.statSync(path.join(OUT, n)).size, 0) / 1024);
  console.log(`${key}: ${written.length} frames, ${kb} KB${warn.length ? `, ${warn.length} page errors (first: ${warn[0]})` : ''}`);
}

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  const helper = await browser.newPage();
  await helper.setContent('<!doctype html><title>posters</title>');
  for (const key of todo) {
    try { await shoot(browser, base, helper, key); }
    catch (e) { console.log(`${key}: skipped (${String(e.message || e).split('\n')[0]})`); }
  }
  console.log(`frames in ${path.relative(process.cwd(), OUT) || OUT}`);
  await Promise.race([browser.close(), new Promise(r => setTimeout(r, 4000))]); server.close(); process.exit(0);
})();
