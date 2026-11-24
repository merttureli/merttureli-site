// stepwise.js: the page. Everything here is light and runs at once; the 3D (three.js and figure.js) is
// fetched after the first paint and takes over the stills.
import { MODELS, loadMeta } from './models.js';
import { inspectTerm, importTerm, viewerCode, pageCode, mapText, paintJson, paintJs, paintHtml, count } from './steps.js';
import { mapFor } from './maps.js';

const still = document.documentElement.classList.contains('still');
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const live = $('#live');
const say = text => { live.textContent = ''; requestAnimationFrame(() => { live.textContent = text; }); };

let fig = null, currentKey = 'rudder-pedals';
const hosts = {}, terms = {};

// ---------------------------------------------------------------- progress
// The rail (wide screens) and the strip under the bar (narrow ones) follow the section in view.
const sections = $$('[data-section]'), railLinks = $$('[data-rail]'), navLinks = $$('.bar__nav a');
const names = { top: 'Start', quickstart: 'Quickstart', docs: 'Docs', models: 'Models', access: 'Access' };
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
  start: () => { if (hosts.import && fig.entry) hosts.import.set({ partK: new Float32Array(fig.entry.parts.length), hot: -1 }); },
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
function fill(key, info) {
  const { meta } = info, cfg = MODELS[key], map = mapFor(key, info);
  const inspect = inspectTerm(key, info, map);
  const mats = new Set(meta.parts.flatMap(p => p.prims.map(pr => pr.material.key || pr.material.color))).size;
  const stored = meta.parts.some(p => p.explode.some(Boolean));
  cap('model', meta.name);
  cap('tris', `${count(meta.triangles)} triangles`);
  cap('kb', `${Math.round(meta.bytes / 1000)} KB`);
  cap('names', `${inspect.names} CAD names`);
  cap('parts', stored ? `${meta.parts.length} parts on their vectors` : `${meta.parts.length} parts, automatic vectors`);
  cap('mats', `${mats} materials, studio light`);
  $('#stageHero').setAttribute('aria-label', `${cfg.title}, ${meta.parts.length} parts. Arrow keys turn the model. Home resets the view.`);
  $('#heroPanel').setAttribute('aria-labelledby', 'tab-' + key);
  $('[data-name=map]').textContent = `${cfg.file}.map.json`;
  $('#code-map code').innerHTML = paintJson(mapText(map.json));
  $('#code-viewer code').innerHTML = paintJs(viewerCode(key, info));
  $('#code-page code').innerHTML = paintHtml(pageCode());
  for (const id of ['code-map', 'code-viewer']) { const p = document.getElementById(id); p.scrollTop = 0; p.scrollLeft = 0; }
  terms.inspect.setContent(inspect);
  terms.import.setContent(importTerm(key, info, map));
  for (const row of $$('[data-row]')) {
    const on = row.dataset.row === key, b = $('[data-open]', row);
    row.classList.toggle('is-current', on);
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
    if (hosts.hero) { hosts.hero.set({ explode: 0 }); hosts.load.set({ explode: 0 }); hosts.import.set({ explode: 1 }); }
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
// what the resolve value means, in the figure's own steps (figure.js resolveSteps, 2 px cells)
function modeText(r) {
  const levels = Math.round(Math.pow(2, 1 + 5 * clamp01((r - .08) / .52))), mix = clamp01((r - .5) / .42);
  return r < .09 ? '1-bit' : mix <= 0 ? `${levels} levels` : mix < 1 ? `${Math.round(mix * 100)}% shaded` : 'Shaded';
}
let manual = false, resolveNow = still ? 1 : 0;
function setResolve(r) {
  resolveNow = r;
  setRange(resolve, Math.round(r * 100));
  resolve.setAttribute('aria-valuetext', modeText(r));
  $('#heroMode').textContent = modeText(r);
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
    hosts.hero = fig.addHost(stage('hero'), { cell: 2, sway: .34, resolve: resolveNow, explode: explode.value / 100 });
    hosts.inspect = fig.addHost(stage('inspect'), { cell: 2, sway: .22, resolve: 0 });
    hosts.import = fig.addHost(stage('import'), { cell: 2, sway: .18, resolve: 0, explode: 1 });
    hosts.load = fig.addHost(stage('load'), { cell: 2, spin: .3, resolve: 1, explode: 1 - progress.value / 100 });
    fig.on('pick', (host, index, x, y) => {
      if (index < 0 || !fig.entry) hideTip(); else showTip(fig.entry.parts[index], x, y);
      if (host === hosts.inspect) terms.inspect.mark(index);
      if (host === hosts.import) terms.import.mark(index);
    });
    await fig.setModel(currentKey);
    document.documentElement.classList.add('has-3d');
    window.__stepwise.fig = fig;
  } catch (err) {
    // no WebGL: the stills stay, the controls that would move them go
    document.documentElement.classList.add('no-3d');
    console.warn('Stepwise: 3D is off.', err);
  }
}
window.__stepwise = { hosts, terms, selectModel, get key() { return currentKey; } };
selectModel(currentKey);
spy();
const idle = f => (window.requestIdleCallback ? requestIdleCallback(f, { timeout: 1500 }) : setTimeout(f, 300));
if (document.readyState === 'complete') idle(start3d); else addEventListener('load', () => idle(start3d), { once: true });
