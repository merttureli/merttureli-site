#!/usr/bin/env node
// Render the Studio home's product tile loops from the hero showreel's own actors.
// Recipe: docs/recipes/tile-loops.md
//
//   node tools/render-loops.js [key ...] [--port 9152] [--fps 30] [--max-kb 560] [--frames DIR] [--keep] [--dry-run]
//   node tools/render-loops.js [key ...] --frames DIR --encode-only    (re-encode frames kept by an earlier --frames run)
//
// keys: charger, robo-catcher, rudder-pedals, therma-shift (default: all four). HOTBOX and the bend fixture are
// IP-limited and never animated: there is no key for them.
//
// For each key it serves the repo on 127.0.0.1:<port>, opens tools/render-loops/stage.html in headless Chromium
// (Playwright from /opt/node22, software WebGL), poses the product as a pure function of loop time for every
// frame, screenshots the stage (the hero's grey ground, rig, environment and soft shadow), then encodes with
// ffmpeg into next/assets/loops/:
//   <key>-loop.webm      VP9, the tile clip (crf 26, raised until it is under --max-kb)
//   <key>-loop.mp4       H.264 fallback for browsers without VP9 (same size cap)
//   <key>-loop-<w>.webp  posters, frame 0 of the loop, at the clip width (1x) and twice it (2x)
// Frame 0 is the poster and pose(seconds) equals pose(0), so the clip loops without a seam.
// Analytics and form hosts are blocked; nothing is POSTed.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { execFileSync } = require('child_process');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'next', 'assets', 'loops');
const BLOCK = /clarity\.ms|bing\.com|workers\.dev|formspree\.io/;

// render size (supersampled), clip size, poster widths
const JOBS = {
  charger: { render: [1920, 1080], clip: [960, 540], posters: [960, 1920] },
  'robo-catcher': { render: [1440, 960], clip: [720, 480], posters: [720, 1440] },
  'rudder-pedals': { render: [1440, 960], clip: [720, 480], posters: [720, 1440] },
  'therma-shift': { render: [1800, 900], clip: [900, 450], posters: [900, 1800] },
};

function args() {
  const a = process.argv.slice(2), o = { keys: [], port: 9152, fps: 30, maxKb: 560, frames: null, keep: false, dry: false, encodeOnly: false };
  for (let i = 0; i < a.length; i++) {
    const v = a[i];
    if (v === '--port') o.port = +a[++i];
    else if (v === '--fps') o.fps = +a[++i];
    else if (v === '--max-kb') o.maxKb = +a[++i];
    else if (v === '--frames') o.frames = a[++i];
    else if (v === '--keep') o.keep = true;
    else if (v === '--dry-run') o.dry = true;
    else if (v === '--encode-only') o.encodeOnly = true;
    else if (v === '-h' || v === '--help') { console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 20).join('\n')); process.exit(0); }
    else if (JOBS[v]) o.keys.push(v);
    else { console.error(`unknown argument ${v} (keys: ${Object.keys(JOBS).join(', ')})`); process.exit(2); }
  }
  if (!o.keys.length) o.keys = Object.keys(JOBS);
  if (o.encodeOnly && !o.frames) { console.error('--encode-only needs --frames DIR'); process.exit(2); }
  return o;
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.bin': 'application/octet-stream', '.css': 'text/css', '.webp': 'image/webp', '.woff2': 'font/woff2', '.png': 'image/png' };
function serve(port) {
  const server = http.createServer((req, res) => {
    if (req.method !== 'GET') { res.writeHead(405); return res.end(); }
    const p = path.normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^([/\\])+/, '');
    const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise(r => server.listen(port, '127.0.0.1', () => r(server)));
}

const ff = (argv, dry) => { if (dry) { console.log('ffmpeg ' + argv.join(' ')); return; } execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...argv], { stdio: 'inherit' }); };
const kb = f => Math.round(fs.statSync(f).size / 1024);

function encode(key, job, dir, fps, maxKb, dry) {
  const [cw, ch] = job.clip, src = path.join(dir, '%04d.png'), base = path.join(OUT, `${key}-loop`);
  const scale = `scale=${cw}:${ch}:flags=lanczos`;
  // VP9: constant quality, raised until the clip fits the budget
  for (let crf = 26; crf <= 50; crf += 2) {
    ff(['-framerate', String(fps), '-i', src, '-vf', `${scale},format=yuv420p`, '-c:v', 'libvpx-vp9', '-crf', String(crf), '-b:v', '0', '-deadline', 'good', '-cpu-used', '1', '-row-mt', '1', '-g', String(fps * 8), '-an', base + '.webm'], dry);
    if (dry || kb(base + '.webm') <= maxKb) { if (!dry) console.log(`  ${key}-loop.webm  crf ${crf}  ${kb(base + '.webm')} KB`); break; }
  }
  for (let crf = 20; crf <= 38; crf += 2) {
    ff(['-framerate', String(fps), '-i', src, '-vf', `${scale},format=yuv420p`, '-c:v', 'libx264', '-crf', String(crf), '-preset', 'slow', '-profile:v', 'high', '-tune', 'animation', '-movflags', '+faststart', '-an', base + '.mp4'], dry);
    if (dry || kb(base + '.mp4') <= maxKb) { if (!dry) console.log(`  ${key}-loop.mp4   crf ${crf}  ${kb(base + '.mp4')} KB`); break; }
  }
  for (const w of job.posters) {
    const h = Math.round(w * ch / cw), f = `${base}-${w}.webp`;
    ff(['-i', path.join(dir, '0000.png'), '-vf', `scale=${w}:${h}:flags=lanczos`, '-c:v', 'libwebp', '-quality', '80', '-compression_level', '6', '-preset', 'picture', '-frames:v', '1', f], dry);
    if (!dry) console.log(`  ${path.basename(f)}  ${kb(f)} KB`);
  }
}

(async () => {
  const o = args();
  fs.mkdirSync(OUT, { recursive: true });
  if (o.encodeOnly) {
    for (const key of o.keys) {
      const dir = path.join(o.frames, key), n = fs.readdirSync(dir).filter(f => /^\d{4}\.png$/.test(f)).length;
      const seconds = +fs.readFileSync(path.join(dir, 'seconds.txt'), 'utf8');
      console.log(`${key}: ${n} frames, ${seconds} s`);
      encode(key, JOBS[key], dir, n / seconds, o.maxKb, o.dry);
    }
    return;
  }
  const server = await serve(o.port);
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  try {
    for (const key of o.keys) {
      const job = JOBS[key], [W, H] = job.render;
      const dir = o.frames ? path.join(o.frames, key) : fs.mkdtempSync(path.join(os.tmpdir(), `loop-${key}-`));
      fs.mkdirSync(dir, { recursive: true });
      const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
      await ctx.route('**/*', r => (BLOCK.test(r.request().url()) || r.request().method() === 'POST' ? r.abort() : r.continue()));
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(String(e)));
      page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      await page.goto(`http://127.0.0.1:${o.port}/tools/render-loops/stage.html`, { waitUntil: 'load' });
      await page.waitForFunction(() => window.stageReady, null, { timeout: 60000 });
      const info = await page.evaluate(([k, w, h]) => window.stage.setup(k, w, h), [key, W, H]);
      const n = Math.round(info.seconds * o.fps);
      fs.writeFileSync(path.join(dir, 'seconds.txt'), String(info.seconds));
      console.log(`${key}: ${info.seconds.toFixed(2)} s, ${n} frames at ${W}x${H}${info.bbox ? ', product box ' + ['l', 't', 'r', 'b'].map(s => Math.round(info.bbox[s])).join(' ') : ''}`);
      const t0 = Date.now();
      if (!o.dry) {
        for (let i = 0; i < n; i++) {
          await page.evaluate(([t, dt]) => window.stage.frame(t, dt), [info.seconds * i / n, info.seconds / n]);
          await page.screenshot({ path: path.join(dir, String(i).padStart(4, '0') + '.png'), clip: { x: 0, y: 0, width: W, height: H } });
          if (i % 30 === 29) process.stdout.write(`  ${i + 1}/${n} frames, ${((Date.now() - t0) / (i + 1)).toFixed(0)} ms each\r`);
        }
        process.stdout.write('\n');
      }
      if (errors.length) { console.error(`  page errors:\n  ${errors.join('\n  ')}`); process.exitCode = 1; }
      await ctx.close();
      encode(key, job, dir, n / info.seconds, o.maxKb, o.dry);
      if (!o.keep && !o.frames) fs.rmSync(dir, { recursive: true, force: true });
      else console.log(`  frames kept in ${dir}`);
    }
  } finally {
    await browser.close();
    server.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
