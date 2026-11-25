/* Low Light: start-up. Wires the red light switch, the marquees, the photograph panels and the one loop
   that drives the sky and the type from the scroll position. No requests leave the page. */
import { createSky } from './sky.js';
import { createWaves, fitBlock } from './type.js';
import { createClock } from './clock.js';
import { createRsvp } from './rsvp.js';

const root = document.documentElement;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const phoneQ = matchMedia('(max-width: 700px)');
const store = {
  get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* private mode: the visit just forgets */ } },
};

/* ---------- the bar: clear over the first screen; once the page moves, a band of the night runs behind it so
   its chips, and the way back that says this is a sample site, never sit over words or fields scrolling past ---------- */
{
  const veil = () => root.classList.toggle('is-veiled', window.scrollY > 4);
  window.addEventListener('scroll', veil, { passive: true });
  veil();
}

/* ---------- meteor tally: kept for the visit ---------- */
let tally = Math.max(0, parseInt(store.get('lowlight-meteors'), 10) || 0);
const tallyEls = [...document.querySelectorAll('[data-tally]')];
const showTally = () => tallyEls.forEach(e => { e.textContent = String(tally).padStart(2, '0'); });
showTally();
if (reduced) { const n = document.getElementById('tally-note'); if (n) n.textContent = 'Motion is off on this device, so the sky is held still.'; }

/* ---------- the sky ---------- */
const sky = createSky(document.getElementById('sky'), { reduced, onMeteor() { tally++; store.set('lowlight-meteors', String(tally)); showTally(); } });
sky.setRed(root.hasAttribute('data-red'));
sky.build();
const inView = new Set();
const skyWatch = new IntersectionObserver(es => { for (const e of es) e.isIntersecting ? inView.add(e.target) : inView.delete(e.target); sky.setActive(inView.size > 0); });
document.querySelectorAll('[data-sky]').forEach(s => skyWatch.observe(s));

/* ---------- red light switch ---------- */
const redBtn = document.getElementById('redswitch'), theme = document.querySelector('meta[name="theme-color"]');
function setRed(on, animate) {
  const apply = () => {
    root.toggleAttribute('data-red', on);
    redBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (theme) theme.setAttribute('content', on ? '#000000' : '#060814');
    sky.setRed(on);
  };
  if (animate && !reduced && document.startViewTransition) document.startViewTransition(apply); else apply();
  store.set('lowlight-red', on ? '1' : '0');
}
redBtn.setAttribute('aria-pressed', root.hasAttribute('data-red') ? 'true' : 'false');
redBtn.addEventListener('click', () => setRed(!root.hasAttribute('data-red'), true));

/* ---------- marquees: real text once, copies hidden from readers, the loop exactly one copy long ---------- */
const shout = document.getElementById('shout');
const marquees = [...document.querySelectorAll('[data-marquee]')].map(el => ({ el, track: el.querySelector('.marquee-track'), group: el.querySelector('.marquee-group') }));
function layMarquees() {
  if (reduced) return;
  for (const m of marquees) {
    m.track.querySelectorAll('[aria-hidden="true"].marquee-group').forEach(c => c.remove());
    const one = m.group.getBoundingClientRect().width; if (!one) continue;
    const copies = Math.ceil(window.innerWidth / one) + 1;
    for (let i = 0; i < copies; i++) { const c = m.group.cloneNode(true); c.setAttribute('aria-hidden', 'true'); m.track.appendChild(c); }
    m.el.style.setProperty('--shift', -one + 'px');
    m.el.style.setProperty('--dur', (one / (phoneQ.matches ? 62 : 96)).toFixed(2) + 's');
    m.el.setAttribute('data-run', '');
  }
}
if (shout) {
  const pause = document.getElementById('shout-pause');
  pause.addEventListener('click', () => { const on = !shout.hasAttribute('data-paused'); shout.toggleAttribute('data-paused', on); pause.setAttribute('aria-pressed', on ? 'true' : 'false'); });
  new IntersectionObserver(es => shout.toggleAttribute('data-off', !es[0].isIntersecting)).observe(shout);
}

/* ---------- the field: a panel opens on hover and focus, and stays open when pressed ---------- */
const panels = [...document.querySelectorAll('.panel')];
// At rest a panel is narrow and takes a small file. The first time it opens it asks for the size it then needs.
const sharpen = p => { const img = p.querySelector('img'); if (img && !img.dataset.wide) { img.dataset.wide = '1'; img.sizes = +img.getAttribute('width') > +img.getAttribute('height') ? '(max-width: 700px) 150vw, 62vw' : '(max-width: 700px) 90vw, 46vw'; } };
const openPanel = k => panels.forEach((p, i) => { p.setAttribute('aria-pressed', i === k ? 'true' : 'false'); if (i === k) sharpen(p); });
panels.forEach((p, i) => {
  p.addEventListener('click', () => openPanel(p.getAttribute('aria-pressed') === 'true' && !phoneQ.matches ? -1 : i));
  p.addEventListener('pointerenter', () => sharpen(p)); p.addEventListener('focus', () => sharpen(p));
});
const panelDefault = () => openPanel(phoneQ.matches ? 0 : -1);
panelDefault(); phoneQ.addEventListener('change', panelDefault);

/* ---------- house rules: five lines, one size, each at the width that fills the measure ---------- */
const rulesList = document.querySelector('.rules-list'), rules = [...document.querySelectorAll('.rule[data-fit]')];
function fitRules() {
  if (!rulesList) return;
  const units = [];
  for (const r of rules) {
    const segs = [...r.querySelectorAll('span')];
    r.style.fontVariationSettings = r.style.marginLeft = ''; segs.forEach(s => { s.style.fontVariationSettings = s.style.marginLeft = ''; });
    if (phoneQ.matches && segs.length) segs.forEach(s => units.push({ el: s, text: s.textContent.trim().toUpperCase(), weight: '800' }));
    else units.push({ el: r, text: r.textContent.replace(/\s+/g, ' ').trim().toUpperCase(), weight: '800' });
  }
  const { fs, widths, pulls } = fitBlock(units, { width: rulesList.clientWidth - 2 * parseFloat(getComputedStyle(rulesList).paddingLeft), floor: phoneQ.matches ? 60 : 75 });
  rulesList.style.setProperty('--rule-fs', fs.toFixed(2) + 'px');
  units.forEach((u, i) => { u.el.style.fontVariationSettings = `"wdth" ${widths[i].toFixed(2)}`; u.el.style.marginLeft = (-pulls[i]).toFixed(4) + 'em'; });
}

/* The disc that crosses the rules as the page scrolls and turns what it covers inside out. It is a round
   window holding an inverted copy of the list: the window moves one way and the copy moves back by as much,
   so the copy stays in register with the list. Both are transforms, so a scroll paints nothing here. */
const rulesSec = document.getElementById('rules'), disc = document.querySelector('.rules-disc'), rulesInner = document.querySelector('.rules-inner');
let discBox = null, discInv = null;
function measureDisc() {
  if (!rulesSec || !disc || !rulesInner) return;
  const r = rulesSec.getBoundingClientRect(), d = Math.round(Math.min(r.width * (phoneQ.matches ? 0.8 : 0.4), r.height * 0.62));
  discBox = { top: r.top + window.scrollY, h: r.height, w: r.width, d };
  disc.style.width = disc.style.height = d + 'px';
  // a fresh copy each layout, so it carries the widths the rules were just fitted to
  discInv = rulesInner.cloneNode(true);
  discInv.classList.add('rules-inv');
  discInv.querySelectorAll('[id]').forEach(e => e.removeAttribute('id'));
  discInv.style.width = r.width + 'px';
  disc.replaceChildren(discInv);
}
function moveDisc(y) {
  if (!discBox) return;
  const vh = window.innerHeight, p = reduced ? 0.62 : (y + vh - discBox.top) / (vh + discBox.h);
  if (p < -0.02 || p > 1.02) return;
  const { w, h, d } = discBox;
  const x = -d * 0.55 + (w - d * 0.35) * p, top = h * 0.06 + (h - d) * 0.94 * (1 - Math.pow(1 - p, 1.4));
  disc.style.transform = `translate3d(${x.toFixed(1)}px,${top.toFixed(1)}px,0)`;
  discInv.style.transform = `translate3d(${(-x).toFixed(1)}px,${(-top).toFixed(1)}px,0)`;
}

/* ---------- the hero: the two stargazers sit either side of the T's stem ----------
   In the photograph there is a strip of clear sky between the two heads, about two thirds of the way across.
   On a laptop and wider the photograph is slid along so that strip is behind the stem of the T, wherever the
   swell of width has put the T, so the people never cover more than an edge of any stem. */
const heroSec = document.querySelector('.hero'), heroPeople = document.querySelector('.hero-people');
const heroMovers = [...document.querySelectorAll('.hero-photo,.hero-people,.hero-ground')];
const GAP = 0.675;                         // the middle of the clear strip, as a share of the photograph's width
let heroBox = null, heroShift = null;
function measureHero() {
  heroBox = null; heroShift = null;
  heroMovers.forEach(m => { m.style.transform = ''; });
  if (!heroSec || !heroPeople || phoneQ.matches) return;
  const line = document.querySelector('.hero-line[data-hero="2"]'), hr = heroSec.getBoundingClientRect();
  heroBox = { W: hr.width, pw: heroPeople.offsetWidth, left: line.getBoundingClientRect().left - hr.left };
}
function placePeople() {
  if (!heroBox) return;
  const tc = waves.heroT(); if (tc == null) return;
  const { W, pw, left } = heroBox;
  const s = Math.round(Math.min(pw * 0.3, Math.max(-(W - pw), left + tc - (W - pw + GAP * pw))));
  if (s === heroShift) return;
  heroShift = s;
  const t = `translate3d(${s}px,0,0)`;
  heroMovers.forEach(m => { m.style.transform = t; });
}

/* ---------- where the sky turns: each band with sky in it names a spot of free sky for the pole ----------
   Hero: the counter of the O. Program: the hub of the night clock, so the trails turn about the dial.
   The field: the strip under the photographs. RSVP: the margin under the form. Footer: the open sky at right.
   While a band is on screen it pulls the pole toward its spot by how much of it shows. */
let poles = [];
function measurePoles() {
  const sy = window.scrollY, W = window.innerWidth, at = (el) => { const r = el.getBoundingClientRect(); return { top: r.top + sy, bottom: r.bottom + sy, left: r.left, width: r.width, height: r.height }; };
  poles = [];
  const o = document.querySelectorAll('.hero-line[data-hero="1"] i')[1];
  if (heroSec && o) { const b = at(heroSec), r = at(o); poles.push({ ...b, x: r.left + r.width / 2, y: r.top + r.height * 0.48 }); }
  const prog = document.getElementById('program'), dial = document.getElementById('dial');
  if (prog && dial && dial.clientWidth) { const d = at(dial); poles.push({ ...at(prog), x: d.left + d.width / 2, y: d.top + (parseFloat(dial.style.getPropertyValue('--cy')) || d.height / 2) }); }
  const field = document.getElementById('field'), note = document.querySelector('.field-note');
  if (field && note) { const f = at(field), n = at(note); poles.push({ ...f, x: W * 0.5, y: (n.top + f.bottom) / 2 }); }
  const rs = document.getElementById('rsvp');
  if (rs) { const r = at(rs); poles.push({ ...r, x: W * (phoneQ.matches ? 0.5 : 0.62), y: r.bottom - 40 }); }
  const foot = document.getElementById('foot');
  if (foot) { const f = at(foot); poles.push({ ...f, x: W * (phoneQ.matches ? 0.7 : 0.74), y: f.top + f.height * 0.3 }); }
}
function aimPole(y, now) {
  const vh = window.innerHeight; let sw = 0, sx = 0, syy = 0;
  for (const p of poles) {
    const vis = Math.min(p.bottom, y + vh) - Math.max(p.top, y); if (vis <= 0) continue;
    sw += vis; sx += vis * p.x; syy += vis * Math.min(vh * 0.94, Math.max(vh * 0.06, p.y - y));
  }
  if (sw > 0) sky.setPole(sx / sw, syy / sw, now);
}

/* ---------- start: nothing is measured until the faces are in ---------- */
const clock = createClock();
let waves = null, rsvp = null, raf = 0, last = 0, lastY = -1;

function layout() {
  waves.layout(); fitRules(); layMarquees(); clock.build(); measureDisc(); measureHero(); rsvp.refit();
  if (!reduced) { measurePoles(); aimPole(window.scrollY, true); }
  lastY = -1;
  if (reduced) { waves.update(0); placePeople(); moveDisc(0); sky.still(); }
}
function tick(now) {
  raf = requestAnimationFrame(tick);
  const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000)); last = now;
  const y = window.scrollY;
  if (y !== lastY) { waves.update(y); if (y < (heroBox ? innerHeight * 1.2 : 0)) placePeople(); moveDisc(y); aimPole(y); lastY = y; }
  sky.frame(dt, y, now / 1000);
}
const run = () => { if (!raf && !reduced && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(tick); } };
const halt = () => { cancelAnimationFrame(raf); raf = 0; };

Promise.all([document.fonts.load('800 80px Anybody'), document.fonts.load('400 80px Anybody'), document.fonts.load('400 13px "Azeret Mono"'), document.fonts.ready]).catch(() => {}).then(() => {
  waves = createWaves({ reduced });
  rsvp = createRsvp({ reduced });
  layout();
  if (!reduced) waves.update(window.scrollY);
  run();
  document.addEventListener('visibilitychange', () => (document.hidden ? halt() : run()));
  let timer = 0, lastW = window.innerWidth, lastH = window.innerHeight;
  window.addEventListener('resize', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      // a phone's address bar sliding away changes the height a little: that is not a new layout
      const w = window.innerWidth, h = window.innerHeight;
      if (w === lastW && Math.abs(h - lastH) < 140) return;
      lastW = w; lastH = h; sky.resize(); layout();
    }, 160);
  });
  if (document.readyState !== 'complete') window.addEventListener('load', layout, { once: true });
});
