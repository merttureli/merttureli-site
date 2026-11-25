// steps.js: the words in the quickstart blocks, built from a model's own JSON header.
// The layouts follow what the real tool prints (tools/cad/pipeline.py: inspect, run_import); `stepwise` stands
// for `python3 tools/cad.py`. Left out because the shipped files cannot tell: the read and mesh times, and
// inspect's per-part size and color columns. File sizes are bytes / 1000, as in the figure captions.
import { MODELS } from './models.js';

// ---- tools/cad/naming.py, line for line: the name the tool suggests for a CAD part ("07-fin-1" -> "fin1")
const hasCase = s => s.toLowerCase() !== s.toUpperCase();
const isUpper = s => hasCase(s) && s === s.toUpperCase(), isLower = s => hasCase(s) && s === s.toLowerCase(), isDigit = s => /^\d+$/.test(s);
export function tokens(cad) {
  const s = cad.replace(/^\s*\d+\s*[-_.\s]\s*/, '') || cad, out = [];
  for (const chunk of s.split(/[^A-Za-z0-9]+/)) {
    if (!chunk) continue;
    if (isUpper(chunk) || isLower(chunk) || isDigit(chunk)) out.push(chunk);
    else out.push(...chunk.split(/(?<=[a-z0-9])(?=[A-Z])/).filter(Boolean));
  }
  return out.length ? out : ['part'];
}
export function reelName(cad) {
  const t = tokens(cad).map(x => x.toLowerCase());
  const name = t[0] + t.slice(1).map(x => x.slice(0, 1).toUpperCase() + x.slice(1)).join('');
  return /^[a-z]/i.test(name) ? name : 'part' + name.slice(0, 1).toUpperCase() + name.slice(1);
}

const pad = (s, n) => String(s).padEnd(n), lpad = (s, n) => String(s).padStart(n);
const kb = bytes => (bytes / 1000).toFixed(1);
const uniq = a => [...new Set(a)];
export const count = n => n.toLocaleString('en-US');

// Long CAD names are shortened in the middle to fit the block (the page says so); the end of a name, where the
// instance number is, is kept. `cols` is how many characters fit across the block.
export function shorten(s, n) {
  if (s.length <= n) return s;
  const tail = Math.floor((n - 1) * .45), head = n - 1 - tail;
  return s.slice(0, head).trimEnd() + '\u2026' + s.slice(s.length - tail).trimStart();
}

// ---- 01 inspect
export function inspectTerm(key, { meta }, map, cols = 96) {
  const cfg = MODELS[key], rows = [];
  meta.parts.forEach((p, i) => { for (const cad of p.cad) rows.push({ cad, part: i }); });
  for (const cad of map.skipped || []) rows.push({ cad, part: -1 });
  const size = [0, 1, 2].map(i => (meta.bounds[1][i] - meta.bounds[0][i]) * 1000), longest = 'xyz'[size.indexOf(Math.max(...size))];
  // the CAD name gets about half the width and the suggested name the rest; each is shortened only if it must be
  const sug = Math.max(14, ...rows.map(r => reelName(r.cad).length)), room = Math.max(32, cols - 4);
  const w = Math.max(16, Math.min(56, Math.max(...rows.map(r => r.cad.length)), room - Math.min(sug, Math.floor(room / 2)))), ws = room - w;
  const lines = [
    { text: `${cfg.step}.step: ${rows.length} parts, unit ${meta.source.unit}, size ${size.map(v => v.toFixed(1)).join(' x ')} mm (x y z)`, cls: 'ok' },
    { text: `The longest side is ${longest}. Output is +Y up: pass --up z if the model is Z-up.` },
    { text: '' },
    { text: `  ${pad('CAD name', w)}  suggested name`, cls: 'head' },
    ...rows.map(r => ({ text: `  ${pad(shorten(r.cad, w), w)}  ${shorten(reelName(r.cad), ws)}`, part: r.part })),
    { text: '' },
    { text: `wrote starter map ${cfg.file}.map.json`, cls: 'ok' },
  ];
  return { cmd: `stepwise inspect ${cfg.step}.step --map-out ${cfg.file}.map.json`, lines, names: rows.length };
}

// ---- 02 import
// A part's CAD names, as many as fit in `room` (at most three), then "and N more", as the tooltip does.
function cadList(cad, room) {
  const more = n => (n ? `, and ${n} more` : '');
  if (room < 24) room = room < 12 ? 36 : room;       // a block too narrow for any of it wraps the row, as a terminal does
  for (let k = Math.min(3, cad.length); k >= 1; k--) {
    const text = cad.slice(0, k).join(', ') + more(cad.length - k);
    if (text.length <= room) return text;
  }
  const one = shorten(cad[0], room - more(cad.length - 1).length) + more(cad.length - 1);
  return room - more(cad.length - 1).length >= 12 ? one : `${cad.length} names`;
}
export function importTerm(key, { meta, jsonBytes }, map, cols = 96) {
  const cfg = MODELS[key], src = meta.source, out = map.json.out;
  const w = Math.max(10, ...meta.parts.map(p => p.name.length));
  const how = [src.deflection_mm != null && `deflection ${src.deflection_mm.toFixed(3)} mm`, src.angle_rad != null && `angle ${src.angle_rad.toFixed(2)} rad`, `up ${src.up}`, `origin ${src.origin}`].filter(Boolean).join(', ');
  const lines = [
    { text: `${cfg.step}.step -> ${meta.name}: ${meta.parts.length} parts, ${meta.triangles} triangles (${how})`, cls: 'ok' },
    { text: '' },
    { text: `  ${pad('name', w)}  ${lpad('tris', 7)}  ${pad('material', 15)} cad`, cls: 'head' },
    ...meta.parts.map((p, i) => {
      const mats = uniq(p.prims.map(pr => pr.material.key || pr.material.color)).join('+') || (p.material.key || p.material.color);
      const subs = Object.keys(p.subs || {}), lead = `  ${pad(p.name, w)}  ${lpad(p.triangles, 7)}  ${pad(mats, 15)} `;
      const tail = subs.length ? ` (subs: ${subs.join(', ')})` : '';
      return { text: lead + cadList(p.cad, cols - lead.length - tail.length) + tail, part: i, slow: true };
    }),
  ];
  if (map.skipped && map.skipped.length) {
    const each = Math.max(16, Math.floor((cols - 19 - 2 * (map.skipped.length - 1)) / map.skipped.length));
    lines.push({ text: '' }, { text: `skipped by a rule: ${map.skipped.map(c => shorten(c, each)).join(', ')}`, cls: 'note' });
  }
  lines.push(
    { text: '' },
    { text: `wrote ${out}`, cls: 'ok', done: true },
    { text: `  ${pad(meta.name + '.json', 32)} ${lpad(kb(jsonBytes), 8)} KB` },
    { text: `  ${pad(meta.bin, 32)} ${lpad(kb(meta.bytes), 8)} KB` },
    { text: '' },
    { text: `look at it:  stepwise view ${out.replace(/\/$/, '')} --name ${meta.name} --serve PORT`, cls: 'note' },
  );
  return { cmd: `stepwise import ${cfg.step}.step --map ${cfg.file}.map.json`, lines };
}

// ---- 03 load
export function viewerCode(key, { meta }) {
  const cfg = MODELS[key], p = meta.parts.find(q => q.name === cfg.part) || meta.parts[0];
  const vec = p.explode.map(v => +v.toFixed(3)).join(', ');
  return `import * as THREE from 'three';
import { loadCadMesh } from 'stepwise';

const canvas = document.querySelector('#view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(24, 16 / 9, 0.05, 30);
camera.position.z = 2.2;
scene.add(new THREE.HemisphereLight(0xffffff, 0x7d828c, 1.35));

// one call fetches ${meta.name}.json and ${meta.bin}
const model = await loadCadMesh(THREE, '/models/${meta.name}.json');
scene.add(model.group);              // ${meta.parts.length} parts, ${count(meta.triangles)} triangles, meters, +Y up

model.setProgress(0);                // exploded: every part out along its own vector
model.setProgress(1);                // assembled

for (const { name, explode } of model.getParts()) {
  console.log(name, explode);        // "${p.name}", Vector3(${vec})
}

renderer.setAnimationLoop(() => {
  model.parts.${p.name}.rotation.y += 0.01;   // a part is a Group at its own pivot
  renderer.render(scene, camera);
});
`;
}
export function pageCode() {
  return `<canvas id="view"></canvas>

<script type="importmap">
  { "imports": { "three": "/vendor/three.module.min.js", "stepwise": "/vendor/${'stepwise'}.js" } }
</script>
<script type="module" src="/viewer.js"></script>
`;
}

// ---- a map file as text: one key per line, one rule per line, long match lists one name per line
export function mapText(json) {
  const q = v => JSON.stringify(v), num = v => (Number.isInteger(v) ? v.toFixed(1) : String(v));
  const head = Object.entries(json).filter(([k]) => k !== 'parts').map(([k, v]) =>
    `  ${q(k)}: ${Array.isArray(v) ? '[' + v.map(q).join(', ') + ']' : typeof v === 'number' ? num(v) : q(v)},`);
  const rule = r => {
    const rest = Object.entries(r).filter(([k]) => k !== 'match').map(([k, v]) => `${q(k)}: ${Array.isArray(v) ? '[' + v.map(q).join(', ') + ']' : q(v)}`).join(', ');
    const m = r.match;
    if (!Array.isArray(m) || m.join('').length < 56) return `    { "match": ${Array.isArray(m) ? '[' + m.map(q).join(', ') + ']' : q(m)}, ${rest} }`;
    return `    { "match": [\n${m.map(x => '        ' + q(x)).join(',\n')}\n      ], ${rest} }`;
  };
  return `{\n${head.join('\n')}\n  "parts": [\n${json.parts.map(rule).join(',\n')}\n  ]\n}\n`;
}

// ---- highlighting: tints of the ink and the green only
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const span = (cls, s) => `<span class="t-${cls}">${esc(s)}</span>`;
function paint(src, rules) {
  let out = '', i = 0;
  const re = new RegExp(rules.map(r => `(${r[1].source})`).join('|'), 'g');
  for (const m of src.matchAll(re)) {
    out += esc(src.slice(i, m.index));
    const k = m.slice(1).findIndex(g => g !== undefined);
    out += span(typeof rules[k][0] === 'function' ? rules[k][0](src, m) : rules[k][0], m[0]);
    i = m.index + m[0].length;
  }
  return out + esc(src.slice(i));
}
export const paintJson = src => paint(src, [
  [(s, m) => (/^\s*:/.test(s.slice(m.index + m[0].length)) ? 'f' : 's'), /"(?:[^"\\]|\\.)*"/],
  ['n', /-?\b\d+(?:\.\d+)?\b|\b(?:true|false|null)\b/],
  ['p', /[{}[\],:]/],
]);
export const paintJs = src => paint(src, [
  ['c', /\/\/[^\n]*/],
  ['s', /'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/],
  ['k', /\b(?:import|from|const|await|for|of|new|as)\b/],
  ['n', /\b0x[0-9a-f]+\b|\b\d+(?:\.\d+)?\b/],
  ['p', /[{}()[\];,.=+*/<>:-]/],
]);
export const paintHtml = src => paint(src, [
  ['s', /"[^"\n]*"/],
  ['k', /<\/?[a-z]+|>/],
  ['p', /[{}:,=]/],
]);
