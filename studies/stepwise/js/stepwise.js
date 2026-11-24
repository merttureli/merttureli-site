// stepwise.js: the page. Everything here is light and runs at once; the 3D (three.js and figure.js) is
// fetched after the first paint and takes over the stills.
import { MODELS, loadMeta } from './models.js';
import { inspectTerm, importTerm, viewerCode, pageCode, mapText, paintJson, paintJs, paintHtml, count } from './steps.js';
import { mapFor } from './maps.js';
import { resolveText } from './resolve.js';

const still = document.documentElement.classList.contains('still');
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const live = $('#live');
const say = text => { live.textContent = ''; requestAnimationFrame(() => { live.textContent = text; }); };

// Steps 01 and 02 always show the rudder pedals, the one model here that came from a STEP file through import.
const STEP_KEY = 'rudder-pedals';
let fig = null, currentKey = 'rudder-pedals';
const hosts = {}, terms = {};

// ---------------------------------------------------------------- progress
// The rail (wide screens) and the strip under the bar (narrow ones) follow the section in view.
const sections = $$('[data-section]'), railLinks = $$('[data-rail]'), navLinks = $$('.bar__nav a');
const names = { top: 'Start', quickstart: 'Quickstart', get: 'What you get', models: 'Models', access: 'Access' };
let spyQueued = false, lastSection = -1;
function spy() {
  spyQueued = false;
  const y = scrollY + innerHeight * .38, max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
  let cur = 0;
  sections.forEach((s, i) => { if (s.offsetTop <= y) cur = i; });
  const next = sections[cur + 1], top = sections[cur].offsetTop;
  let frac = next ? clamp01((y - top) / (next.offsetTop - top)) : 0;
  if (scrollY >= max - 2) { cur = sections.length - 1; frac = 0; }
  $('#railFill').style.setProperty('--p', ((cur + frac) / (sections.length - 1)).toFixed(4));
  $('#barFill').style.setProperty('--p', clamp01(scrollY / max).toFixed(4));
  if (cur !== lastSection) {
    lastSection = cur;
    const id = sections[cur].dataset.section;
    railLinks.forEach((a, i) => { a.classList.toggle('is-done', i < cur); if (i === cur) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); });
    navLinks.forEach(a => { if (a.getAttribute('href') === '#' + id) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); });
    $('#hereNo').textContent = String(cur + 1).padStart(2, '0');
    $('#hereName').textContent = names[id];
  }
  scrollResolve();
}
const queueSpy = () => { if (!spyQueued) { spyQueued = true; requestAnimationFrame(spy); } };
addEventListener('scroll', queueSpy, { passive: true });
addEventListener('resize', queueSpy);

// -------------------------------------------------------------------- copy
async function copyText(text) {
  try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; } } catch (e) { /* fall through */ }
  const ta = document.createElement('textarea');
  ta.value = text; ta.setAttribute('readonly', ''); ta.setAttribute('aria-hidden', 'true');
  ta.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0';
  document.body.append(ta); ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (e) { /* no clipboard at all */ }
  ta.remove();
  return ok;
}
function textFor(btn) {
  if (btn.dataset.copy) return btn.dataset.copy;
  const panel = btn.dataset.copyTabs ? $('[role=tabpanel]:not([hidden]) pre', btn.closest('.block')) : document.getElementById(btn.dataset.copyFrom);
  return panel.dataset.cmd || panel.textContent;
}
for (const btn of $$('.copy')) {
  const label = btn.textContent;
  let timer = 0;
  btn.addEventListener('click', async () => {
    const ok = await copyText(textFor(btn));
    btn.textContent = ok ? 'Copied' : 'Not copied';
    btn.classList.toggle('is-copied', ok);
    const box = btn.closest('.install');
    if (box) box.classList.toggle('is-copied', ok);
    if (btn.dataset.note) document.getElementById(btn.dataset.note).textContent = ok ? 'Copied. Stepwise is a sample name, so there is nothing to install.' : 'The browser did not allow the copy. Stepwise is a sample name, so there is nothing to install.';
    else say(ok ? 'Copied to the clipboard.' : 'The browser did not allow the copy.');
    clearTimeout(timer);
    timer = setTimeout(() => { btn.textContent = label; btn.classList.remove('is-copied'); if (box) box.classList.remove('is-copied'); }, 1800);
  });
}

// -------------------------------------------------------------------- tabs
function tablist(list, onSelect) {
  const tabs = $$('[role=tab]', list);
  const select = (tab, focus, silent) => {
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1;
      const panel = document.getElementById(t.getAttribute('aria-controls'));
      if (panel && tabs.some(o => o.getAttribute('aria-controls') !== t.getAttribute('aria-controls'))) panel.hidden = !on;
    }
    if (focus) tab.focus();
    if (onSelect && !silent) onSelect(tab);
  };
  list.addEventListener('click', e => { const t = e.target.closest('[role=tab]'); if (t) select(t); });
  list.addEventListener('keydown', e => {
    const i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    const to = { ArrowRight: (i + 1) % tabs.length, ArrowLeft: (i + tabs.length - 1) % tabs.length, Home: 0, End: tabs.length - 1 }[e.key];
    if (to != null) { e.preventDefault(); select(tabs[to], true); }
  });
  return { show: tab => select(tab, false, true) };
}
const modelTabs = tablist($('#modelTabs'), tab => selectModel(tab.dataset.model));
tablist($('.tabs--files'));

// --------------------------------------------------------------- terminals
// A terminal holds its whole output from the start (so the block never changes size) and shows it a line at a
// time when it scrolls into view. With reduced motion it is all there at once.
function createTerm(pre, hooks = {}) {
  const caret = document.createElement('span');
  caret.className = 'caret'; caret.setAttribute('aria-hidden', 'true');
  let lines = [], cmd = '', cmdEl = null, tail = null, token = 0, ran = false, visible = false;
  const prompt = () => { const s = document.createElement('span'); s.className = 'prompt'; s.setAttribute('aria-hidden', 'true'); s.textContent = '$ '; return s; };
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible && !ran && lines.length) run(); }, { threshold: .3 }).observe(pre);
  function setContent(c) {
    token++; cmd = c.cmd; lines = c.lines; ran = false;
    pre.textContent = ''; pre.dataset.cmd = cmd; pre.scrollTop = 0; pre.scrollLeft = 0;
    pre.classList.remove('is-running', 'is-done');
    const first = document.createElement('span');
    first.className = 'ln ln--cmd';
    cmdEl = document.createElement('span'); cmdEl.className = 'cmd';
    first.append(prompt(), cmdEl);
    pre.append(first, '\n');
    for (const l of lines) {
      const s = document.createElement('span');
      s.className = 'ln' + (l.cls ? ' ln--' + l.cls : '');
      s.textContent = l.text || ' ';
      if (l.part != null && l.part >= 0) s.dataset.part = l.part;
      l.el = s;
      pre.append(s, '\n');
    }
    tail = document.createElement('span'); tail.className = 'ln ln--cmd';
    tail.append(prompt());
    pre.append(tail);
    if (still) { cmdEl.textContent = cmd; pre.classList.add('is-done'); ran = true; if (hooks.end) hooks.end(); return; }
    for (const l of lines) l.el.classList.add('is-wait');
    tail.classList.add('is-wait');
    if (visible) run();
  }
  const follow = el => { const y = el.offsetTop + el.offsetHeight - pre.clientHeight + 14; if (y > pre.scrollTop) pre.scrollTop = y; };
  async function run() {
    if (!lines.length) return;
    if (still) { if (hooks.end) hooks.end(); return; }
    const my = ++token;
    ran = true;
    pre.classList.add('is-running'); pre.classList.remove('is-done');
    pre.scrollTop = 0;
    for (const l of lines) l.el.classList.add('is-wait');
    tail.classList.add('is-wait');
    cmdEl.textContent = '';
    cmdEl.after(caret);
    if (hooks.start) hooks.start();
    await sleep(220);
    for (let i = 1; i <= cmd.length; i++) { if (my !== token) return; cmdEl.textContent = cmd.slice(0, i); await sleep(13); }
    await sleep(280);
    const per = Math.max(14, Math.min(60, 1300 / lines.length));
    for (const l of lines) {
      if (my !== token) return;
      l.el.classList.remove('is-wait');
      follow(l.el);
      if (hooks.line) hooks.line(l);
      await sleep(l.slow ? 170 : l.text ? per : per / 2);
    }
    if (my !== token) return;
    tail.classList.remove('is-wait'); tail.append(caret); follow(tail);
    pre.classList.replace('is-running', 'is-done');
    if (hooks.end) hooks.end();
  }
  // a line and the part it names point at each other
  pre.addEventListener('pointerover', e => { const l = e.target.closest('.ln[data-part]'); if (hooks.point && !pre.classList.contains('is-running')) hooks.point(l ? +l.dataset.part : -1); });
  pre.addEventListener('pointerleave', () => { if (hooks.point && !pre.classList.contains('is-running')) hooks.point(-1); });
  return { pre, setContent, run, mark(part) { for (const l of lines) if (l.el && l.part != null) l.el.classList.toggle('is-hot', l.part === part && part >= 0); } };
}

const hot = (name, part) => { if (hosts[name]) hosts[name].set({ hot: part }); };
terms.inspect = createTerm($('#term-inspect'), {
  line: l => { hot('inspect', l.part != null ? l.part : -1); },
  end: () => { hot('inspect', -1); },
  point: part => { hot('inspect', part); terms.inspect.mark(part); },
});
terms.import = createTerm($('#term-import'), {
  start: () => { if (hosts.import && hosts.import.entry) hosts.import.set({ partK: new Float32Array(hosts.import.entry.parts.length), hot: -1 }); },
  line: l => {
    const h = hosts.import;
    if (!h || !h.state.partK) return;
    if (l.part != null && l.part >= 0) { const k = Float32Array.from(h.state.partK); k[l.part] = 1; h.set({ partK: k, hot: l.part }); }
    else if (l.done) h.set({ partK: null, explode: 1, hot: -1 });
  },
  end: () => { if (hosts.import) hosts.import.set({ partK: null, explode: 1, hot: -1 }); },
  point: part => { hot('import', part); terms.import.mark(part); },
});
for (const b of $$('.run')) b.addEventListener('click', () => { terms[b.dataset.run].run(); say('Running the command again.'); });

// ------------------------------------------------------------------ models
const cap = (name, text) => { for (const el of $$(`[data-cap=${name}]`)) el.textContent = text; };

// Steps 01 and 02: filled once with the rudder pedals, and again when the blocks change width. A terminal's rows
// are cut to the characters that fit across it, so a row never runs off sideways.
let stepInfo = null, termCols = { inspect: 0, import: 0 };
function colsOf(pre) {
  const cs = getComputedStyle(pre), c = document.createElement('canvas').getContext('2d');
  c.font = `${cs.fontSize} ${cs.fontFamily}`;
  const ch = c.measureText('0'.repeat(20)).width / 20 || 7.8;
  return Math.floor((pre.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 2) / ch);
}
function fillSteps(force) {
  if (!stepInfo) return;
  const ci = colsOf(terms.inspect.pre), cm = colsOf(terms.import.pre);
  if (!force && ci === termCols.inspect && cm === termCols.import) return;
  const map = mapFor(STEP_KEY, stepInfo), inspect = inspectTerm(STEP_KEY, stepInfo, map, ci);
  if (force || ci !== termCols.inspect) terms.inspect.setContent(inspect);
  if (force || cm !== termCols.import) terms.import.setContent(importTerm(STEP_KEY, stepInfo, map, cm));
  termCols = { inspect: ci, import: cm };
  if (!force) return;
  const { meta } = stepInfo;
  cap('names', `${inspect.names} CAD names`);
  cap('parts', `${meta.parts.length} parts on their vectors`);
  $('[data-name=map]').textContent = `${MODELS[STEP_KEY].file}.map.json`;
  $('#code-map code').innerHTML = paintJson(mapText(map.json));
}
let colsTimer = 0;
addEventListener('resize', () => { clearTimeout(colsTimer); colsTimer = setTimeout(() => fillSteps(false), 200); });

// FIG 01, step 03 and the table follow the model tabs
function fill(key, info) {
  const { meta } = info, cfg = MODELS[key];
  const mats = new Set(meta.parts.flatMap(p => p.prims.map(pr => pr.material.key || pr.material.color))).size;
  cap('model', cfg.title);
  cap('title', cfg.title);
  cap('tris', `${count(meta.triangles)} triangles`);
  cap('kb', `${Math.round(meta.bytes / 1000)} KB`);
  cap('mats', `${mats} materials, studio light`);
  $('#stageHero').setAttribute('aria-label', `${cfg.title}, ${meta.parts.length} parts. Arrow keys turn the model. Home resets the view.`);
  $('#heroPanel').setAttribute('aria-labelledby', 'tab-' + key);
  $('#code-viewer code').innerHTML = paintJs(viewerCode(key, info));
  $('#code-page code').innerHTML = paintHtml(pageCode());
  const v = document.getElementById('code-viewer'); v.scrollTop = 0; v.scrollLeft = 0;
  for (const row of $$('[data-row]')) {
    const on = row.dataset.row === key, b = $('[data-open]', row);
    row.classList.toggle('is-current', on);
    if (!b) continue;
    b.textContent = on ? 'Shown in FIG 01' : 'View in FIG 01';
    if (on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
  }
}
let filled = '';
async function selectModel(key) {
  currentKey = key;
  const tab = document.getElementById('tab-' + key);
  modelTabs.show(tab);
  tab.classList.add('is-loading');
  hideTip();
  try {
    const info = await loadMeta(key);
    if (currentKey !== key) return;
    if (fig) await fig.setModel(key);
    if (currentKey !== key) return;
    if (filled !== key) { filled = key; fill(key, info); }
    setRange($('#explode'), 0); setRange($('#progress'), 100);
    if (hosts.hero) { hosts.hero.set({ explode: 0 }); hosts.load.set({ explode: 0 }); }
  } catch (err) {
    console.error(err);
    say('That model did not load.');
  } finally { tab.classList.remove('is-loading'); }
}
for (const b of $$('[data-open]')) b.addEventListener('click', () => {
  selectModel(b.dataset.open);
  $('#fig1').scrollIntoView({ block: 'center', behavior: still ? 'auto' : 'smooth' });
  document.getElementById('tab-' + b.dataset.open).focus({ preventScroll: true });
});

// ----------------------------------------------------------------- sliders
const resolve = $('#resolve'), explode = $('#explode'), progress = $('#progress');
function setRange(el, v) {
  el.value = v;
  el.style.setProperty('--p', (el.value - el.min) / (el.max - el.min) * 100 + '%');
  const n = (el.value / 100).toFixed(2);
  document.getElementById(el.getAttribute('aria-describedby')).textContent = el === progress ? 'p = ' + n : n;
}
let manual = false, resolveNow = still ? 1 : 0;
function setResolve(r) {
  resolveNow = r;
  setRange(resolve, Math.round(r * 100));
  resolve.setAttribute('aria-valuetext', resolveText(r));
  $('#heroMode').textContent = resolveText(r);
  if (hosts.hero) hosts.hero.set({ resolve: r });
}
// In the hero the scroll is the resolve control too, until the slider is touched. It is measured on the figure, not
// the page: resolving starts where the stage stood at load (on a phone, once it is well in view) and ends about a
// third of a screen later, while most of it can still be seen.
const heroStage = $('#stageHero');
let resolveFrom = null;
function scrollResolve() {
  if (manual || still) return;
  const top = heroStage.getBoundingClientRect().top;
  if (resolveFrom == null) resolveFrom = Math.min(top + scrollY, innerHeight * .3);
  const r = clamp01((resolveFrom - top) / (innerHeight * .3));
  if (Math.abs(r - resolveNow) > .004 || (r === 0 || r === 1) && r !== resolveNow) setResolve(r);
}
addEventListener('resize', () => { resolveFrom = null; });
resolve.addEventListener('input', () => { manual = true; setResolve(resolve.value / 100); });
explode.addEventListener('input', () => { setRange(explode, explode.value); if (hosts.hero) hosts.hero.set({ explode: explode.value / 100 }); });
progress.addEventListener('input', () => { setRange(progress, progress.value); if (hosts.load) hosts.load.set({ explode: 1 - progress.value / 100 }); });
setRange(explode, 0); setRange(progress, 100); setResolve(resolveNow);

// ----------------------------------------------------------------- tooltip
const tip = $('#tip');
function hideTip() { tip.hidden = true; }
function showTip(part, x, y) {
  const m = part.meta, seen = new Map();
  for (const c of m.cad) seen.set(c, (seen.get(c) || 0) + 1);
  const cads = [...seen].map(([c, n]) => (n > 1 ? `${c} x${n}` : c));
  tip.children[0].textContent = part.name;
  tip.children[1].textContent = m.label && m.label !== part.name ? m.label : '';
  tip.children[2].textContent = 'CAD: ' + cads.slice(0, 3).join(', ') + (cads.length > 3 ? `, and ${cads.length - 3} more` : '');
  tip.hidden = false;
  const w = tip.offsetWidth, h = tip.offsetHeight;
  tip.style.left = Math.max(8, Math.min(innerWidth - w - 8, x + 16)) + 'px';
  tip.style.top = (y + 20 + h > innerHeight - 8 ? y - h - 12 : y + 20) + 'px';
}
addEventListener('scroll', () => { if (!tip.hidden) { hideTip(); if (fig) for (const h of fig.hosts) if (h.sticky) fig.clearPick(h); } }, { passive: true });

// -------------------------------------------------------------------- form
const form = $('#accessForm'), email = $('#email'), msg = $('#emailMsg');
form.addEventListener('submit', e => {
  e.preventDefault();
  const v = email.value.trim(), ok = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
  msg.classList.toggle('is-ok', ok);
  if (ok) { email.removeAttribute('aria-invalid'); msg.textContent = `Request recorded for ${v}. This is a sample site, so nothing was sent.`; }
  else { email.setAttribute('aria-invalid', 'true'); msg.textContent = v ? 'That is not an email address. It needs the form name@company.com.' : 'Enter a work email, like name@company.com.'; email.focus(); }
});
email.addEventListener('input', () => { if (email.hasAttribute('aria-invalid')) { email.removeAttribute('aria-invalid'); msg.textContent = ''; } });

// ---------------------------------------------------------------------- 3D
async function start3d() {
  try {
    const { createFigure } = await import('./figure.js');
    fig = createFigure({ reduced: still });
    const stage = name => $(`.fig__stage[data-fig=${name}]`);
    hosts.hero = fig.addHost(stage('hero'), { cell: 2, sway: .34, resolve: resolveNow, explode: explode.value / 100 }, { follow: true });
    hosts.inspect = fig.addHost(stage('inspect'), { cell: 2, sway: .22, resolve: 0 }, { model: STEP_KEY });
    hosts.import = fig.addHost(stage('import'), { cell: 2, sway: .18, resolve: 0, explode: 1 }, { model: STEP_KEY });
    hosts.load = fig.addHost(stage('load'), { cell: 2, spin: .3, resolve: 1, explode: 1 - progress.value / 100 }, { follow: true });
    hosts.units = units(fig);
    fig.on('pick', (host, index, x, y) => {
      if (index < 0 || !host.entry) hideTip(); else showTip(host.entry.parts[index], x, y);
      if (host === hosts.inspect) terms.inspect.mark(index);
      if (host === hosts.import) terms.import.mark(index);
    });
    await Promise.all([fig.setModel(currentKey), ...fig.hosts.map(h => h.ready)]);
    document.documentElement.classList.add('has-3d');
    window.__stepwise.fig = fig;
  } catch (err) {
    // no WebGL: the stills stay, the controls that would move them go
    document.documentElement.classList.add('no-3d');
    console.warn('Stepwise: 3D is off.', err);
  }
}
// ------------------------------------------------------------------ --up z
// The "Any unit" panel: the rudder pedals as a Z-up file would first stand in a +Y-up page (on their back), then
// turned by --up z. The axes belong to the file: x, y, z before; after the turn (x, y, z) -> (x, z, -y), so the
// axis that was z is now y and the one that was y is now -z.
const QUARTER = Math.PI / 2;
function units(fig) {
  const el = $('.units__stage'), svg = $('.units__axes', el), state = $('#unitsState'), play = $('#unitsPlay');
  const ax = { x: $('.ax--x', svg), y: $('.ax--y', svg), z: $('.ax--z', svg) };
  let timer = 0;
  // the axes are drawn as a small gizmo in the corner, as CAD tools do: they turn with the model, and keep their
  // foreshortening, but stay out of the picture
  const host = fig.addHost(el, { cell: 2, tilt: 0, yaw: -.35, pitch: .38, margin: .86 }, { model: STEP_KEY, sphere: true, after: (h, project) => {
    const r = h.entry.radiusIn * .5, o = project(0, 0, 0), ch = el.clientHeight, at = [40, ch - 28];
    // the file's axes in the model's own frame: x is x, the file's y is -z, the file's z is +y
    const ends = { x: [r, 0, 0], y: [0, 0, -r], z: [0, r, 0] }, dirs = {};
    for (const k of 'xyz') { const p = project(...ends[k]); dirs[k] = [p[0] - o[0], p[1] - o[1]]; }
    const f = 34 / Math.max(...Object.values(dirs).map(([x, y]) => Math.hypot(x, y)), 1);
    const done = h.cur.tilt < .02;
    svg.classList.toggle('is-out', done);
    for (const k of 'xyz') {
      const [dx, dy] = dirs[k], line = ax[k].firstChild, t = ax[k].lastChild, len = Math.hypot(dx, dy) || 1;
      line.setAttribute('x1', at[0]); line.setAttribute('y1', at[1]);
      line.setAttribute('x2', (at[0] + dx * f).toFixed(1)); line.setAttribute('y2', (at[1] + dy * f).toFixed(1));
      t.setAttribute('x', (at[0] + dx * f + dx / len * 10).toFixed(1)); t.setAttribute('y', (at[1] + dy * f + dy / len * 10).toFixed(1));
      t.textContent = done ? { x: 'x', y: '-z', z: 'y' }[k] : k;
    }
  } });
  const show = isOut => { state.textContent = isOut ? 'Out: +Y up' : 'In: Z up, read as is'; };
  function run() {
    clearTimeout(timer);
    host.set({ tilt: QUARTER }); host.snap(); show(false); fig.claim(host);
    timer = setTimeout(() => { host.set({ tilt: 0 }); timer = setTimeout(() => show(true), still ? 0 : 1300); }, still ? 1400 : 900);
  }
  play.addEventListener('click', run);
  let seen = false;
  new IntersectionObserver(([en]) => { if (en.isIntersecting && !seen) { seen = true; run(); } }, { threshold: .6 }).observe(el);
  return host;
}

window.__stepwise = { hosts, terms, selectModel, get key() { return currentKey; } };
loadMeta(STEP_KEY).then(info => { stepInfo = info; (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => fillSteps(true)); });
selectModel(currentKey);
spy();
const idle = f => (window.requestIdleCallback ? requestIdleCallback(f, { timeout: 1500 }) : setTimeout(f, 300));
if (document.readyState === 'complete') idle(start3d); else addEventListener('load', () => idle(start3d), { once: true });
