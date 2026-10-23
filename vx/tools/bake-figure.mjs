#!/usr/bin/env node
/* vx/tools/bake-figure.mjs: bakes the CHARGER field study's path figures into vx/index.html
   (PRESENTATION-PLAN item 9), so they read with JavaScript off.

   It flies, in node, with the page's own modules (vx/js/flight/flight.js through vx/js/story.js
   planFlight, the geometry from vx/js/geom/geom.js), the flights the page flies:
     the lede figure   the default launch (full fins, still air, the 11.2 mph EST gust at rail exit)
                       and the same without fins, on one set of equal-scale ft axes
     the run sketches  the five runs' paths to apogee on the axes every card shares
   and writes story.js's markup between the markers in vx/index.html:
     <!-- bake:lede --> ... <!-- /bake:lede -->
     <!-- bake:sketch:<run> --> ... <!-- /bake:sketch:<run> -->
   It also refreshes the static numbers the page fills live: each run card's [data-r] values
   (story.js runCardValues, the format main.js prints), [data-k="apogeeNone"],
   [data-k="rampSlow"], the end card's two figures ([data-end-apogee], [data-end-second]) and every computed configuration value (story.js configValues, the strings
   main.js fillConfig prints: the CAD measurements, the Barrowman and mass rows, the margins quoted
   in the method, the section's cell size, the still-air apogee), so a reader without JavaScript
   sees the model's numbers, not an earlier model's. In the browser main.js renders the same markup from its own pre-flights
   and swaps a figure in only when its hash (data-sig) differs, so a baked figure is replaced by
   the page's flight whenever the flight model changes and this script has not been run again.

   Usage, from the repository root:
     node vx/tools/bake-figure.mjs           write vx/index.html, print the figures
     node vx/tools/bake-figure.mjs --check   write nothing; exit 1 if vx/index.html is out of date
     node vx/tools/bake-figure.mjs --json    print the figures as JSON (for probes)
   Every number it writes is SIM: computed by the page's flight model. */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getBakedGeometry } from '../js/geom/geom.js';
import { planFlight, RUNS, LAUNCHES, runFlightConfig, runCardValues, ledeFigure, runSketch, configValues } from '../js/story.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PAGE = join(HERE, '..', 'index.html');
const args = new Set(process.argv.slice(2));
const CHECK = args.has('--check'), JSON_OUT = args.has('--json');

const geometry = getBakedGeometry();
const plan = (r) => planFlight(runFlightConfig(geometry.finDefaults, r), { gustMph: r.gust });
const plans = Object.fromEntries(Object.entries(RUNS).map(([k, r]) => [k, plan(r)]));
const pFins = plans.gust;                     // the default launch is Run 05's flight
const pNone = plan(LAUNCHES.nofins);

let html = readFileSync(PAGE, 'utf8');
const before = html;
const problems = [];
function block(name, markup) {
  const re = new RegExp(`(<!-- bake:${name} -->)[\\s\\S]*?(<!-- /bake:${name} -->)`);
  if (!re.test(html)) { problems.push(`marker bake:${name} missing`); return; }
  html = html.replace(re, (_, a, b) => `${a}${markup}${b}`);
}
block('lede', ledeFigure(pFins, pNone));
for (const k of Object.keys(RUNS)) block(`sketch:${k}`, runSketch(k, plans[k]));

// the run cards' static values (the page refills them live with the same format)
for (const [k, p] of Object.entries(plans)) {
  const vals = runCardValues(k, p.result);
  const re = new RegExp(`(<li class="fd-run" data-run="${k}">)([\\s\\S]*?)(</li>)`);
  if (!re.test(html)) { problems.push(`run card ${k} missing`); continue; }
  html = html.replace(re, (_, a, body, c) => a + body.replace(/(<span data-r="(\w+)">)([^<]*)(<\/span>)/g, (m, o, key, v, e) => (key in vals ? `${o}${vals[key]}${e}` : m)) + c);
}
const apogeeNone = String(Math.round(plans.none.result.apogee / 10) * 10);
const rampSlow = `1/${Math.round(1 / pFins.slow)}`;
html = html.replace(/(<span data-k="apogeeNone">)[^<]*(<\/span>)/g, `$1${apogeeNone}$2`);
html = html.replace(/(<span data-k="rampSlow">)[^<]*(<\/span>)/g, `$1${rampSlow}$2`);
// the end card's static figures (the default launch's apogee and its settle time, as story.js showEnd prints them)
const endApogee = runCardValues('gust', pFins.result).apogee, endSecond = runCardValues('gust', pFins.result).settle;
for (const [attr, v] of [['data-end-apogee', endApogee], ['data-end-second', endSecond]]) {
  const re = new RegExp(`(<span[^>]*\\b${attr}>)[^<]*(</span>)`);
  if (!re.test(html)) { problems.push(`${attr} missing`); continue; }
  html = html.replace(re, `$1${v}$2`);
}
// the configuration table's computed values (and their repeats in the method), as fillConfig prints them
const config = configValues(geometry, { apogee: true });
for (const [k, v] of Object.entries(config)) {
  const re = new RegExp(`(<(span|td)[^>]*\\bdata-k="${k}"[^>]*>)[^<]*(</\\2>)`, 'g');
  if (!re.test(html)) { problems.push(`data-k ${k} missing`); continue; }
  html = html.replace(re, (m, open, tag, close) => `${open}${v}${close}`);
}

const figures = {
  lede: { fins: { apogeeFt: +pFins.result.apogee.toFixed(1), xFt: +(-pFins.result.upwind).toFixed(1) }, nofins: { apogeeFt: +pNone.result.apogee.toFixed(1), xFt: +(-pNone.result.upwind).toFixed(1) } },
  runs: Object.fromEntries(Object.entries(plans).map(([k, p]) => [k, { apogeeFt: +p.result.apogee.toFixed(1), upwindFt: +p.result.upwind.toFixed(1), card: runCardValues(k, p.result) }])),
  apogeeNone, rampSlow, config,
};
if (JSON_OUT) { console.log(JSON.stringify(figures, null, 2)); }
else {
  console.log('lede      full fins %s ft at %s ft downrange / no fins %s ft at %s ft downrange (SIM)', figures.lede.fins.apogeeFt, figures.lede.fins.xFt, figures.lede.nofins.apogeeFt, figures.lede.nofins.xFt);
  for (const [k, v] of Object.entries(figures.runs)) console.log('run %s apogee %s ft, upwind %s ft', k.padEnd(5), String(v.apogeeFt).padStart(6), String(v.upwindFt).padStart(6));
  console.log('apogeeNone %s / rampSlow %s', apogeeNone, rampSlow);
  console.log('config    %s', Object.entries(config).map(([k, v]) => `${k} ${v}`).join(', '));
}
if (problems.length) { console.error(problems.join('\n')); process.exit(2); }
if (CHECK) {
  if (html !== before) { console.error('vx/index.html is out of date: run node vx/tools/bake-figure.mjs'); process.exit(1); }
  console.log('vx/index.html is up to date');
} else if (html !== before) { writeFileSync(PAGE, html); console.log('wrote vx/index.html'); }
else console.log('vx/index.html unchanged');
