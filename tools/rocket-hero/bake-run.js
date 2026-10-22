#!/usr/bin/env node
// Bake the hero rocket's static assets with the live scene code:
//   node tools/rocket-hero/bake-run.js --port 8892 [--out DIR] [--test]
// Needs the repo served on the port (python3 -m http.server). Writes
// assets/rocket/livery.png, still.webp source PNG and line PNG into --out (default
// assets/rocket/src-png), which tools/rocket-hero/towebp.py converts.
const path = require('path'), fs = require('fs');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright');
const arg = k => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : null; };
const port = arg('port') || '8892', out = arg('out') || path.join(__dirname, 'png'), test = process.argv.includes('--test');
const save = (name, url) => fs.writeFileSync(path.join(out, name), Buffer.from(url.split(',')[1], 'base64'));

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage();
  page.on('console', m => console.log('page:', m.text()));
  page.on('pageerror', e => console.log('pageerror:', e.message));
  await page.goto(`http://127.0.0.1:${port}/tools/rocket-hero/bake.html`);
  await page.waitForFunction(() => window.bakeReady);
  if (test) {
    const variants = JSON.parse(arg('variants') || '[]');
    for (const [i, v] of variants.entries()) save(`test-${i}.png`, await page.evaluate(o => window.renderStill(o), v));
    if (process.argv.includes('--line')) save('test-line.png', await page.evaluate(() => window.renderLine({ height: 1200 })));
  } else {
    save('livery.png', await page.evaluate(() => window.bakeLivery()));
    const liveryUrl = '/assets/rocket/livery.webp';
    save('still.png', await page.evaluate(o => window.renderStill(o), { roll: 0, height: 1200, liveryUrl: fs.existsSync(path.join(__dirname, '../../assets/rocket/livery.webp')) ? liveryUrl : null }));
    save('line.png', await page.evaluate(() => window.renderLine({ height: 1200 })));
    // 800 px copies are inlined in the home page so the poster paints with the first paint.
    save('still-800.png', await page.evaluate(o => window.renderStill(o), { roll: 0, height: 800, liveryUrl }));
    save('line-800.png', await page.evaluate(() => window.renderLine({ height: 800 })));
  }
  await browser.close();
})();
