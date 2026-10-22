// Screenshot a CAD viewer page: node tools/cad/shot.js URL OUT.png [WIDTH HEIGHT]
// Writes OUT.png (assembled, with the part panel) and OUT-exploded.png. Exits 1 on console errors or failed requests.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const [url, out, w = '1440', h = '900'] = process.argv.slice(2);
if (!url || !out) { console.error('usage: node tools/cad/shot.js URL OUT.png [WIDTH HEIGHT]'); process.exit(2); }
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
  await ctx.route(/clarity\.ms|bing\.com|workers\.dev|formspree\.io/, r => r.abort());
  const page = await ctx.newPage();
  const problems = [];
  page.on('console', m => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
  page.on('pageerror', e => problems.push('pageerror: ' + e.message));
  page.on('requestfailed', r => { if (!/\.bin$/.test(r.url())) problems.push('failed: ' + r.url()); });
  page.on('response', r => { if (r.status() >= 400 && !/\.bin\.wasm$/.test(r.url())) problems.push(`http ${r.status()}: ${r.url()}`); });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__cad && window.__cad.ready, null, { timeout: 30000 });
  await page.screenshot({ path: out });
  await page.evaluate(() => { window.__cad.shotMode(true); window.__cad.set({ explode: 1, zoom: 1.35 }); });
  const ex = out.replace(/\.png$/, '') + '-exploded.png';
  await page.screenshot({ path: ex });
  const meta = await page.evaluate(() => ({ parts: window.__cad.meta.parts.length, tris: window.__cad.meta.triangles }));
  await browser.close();
  console.log(`wrote ${out} and ${ex} (${meta.parts} parts, ${meta.tris} triangles)`);
  if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
