/* Albada. The page is one morning: the scroll drives the color of the ground, the clock in the bar,
   the balloon on the flight strip, the drift of the photographs and the walk of the arcade.
   With prefers-reduced-motion none of that runs: the grounds change by section (in the CSS),
   and only the clock and the bar's ink are kept in step here. */
import { makeJourney, inkFor, accentFor, luminance, parseColor, css } from './journey.js';
import { initBooking } from './booking.js';

const root = document.documentElement, $ = id => document.getElementById(id);
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = t => t * t * (3 - 2 * t);
const NIGHT = [12, 18, 32], CREAM = [247, 236, 214], BURNER = [244, 162, 58], TERRA = [180, 83, 42], FLIP = 0.179;

root.classList.add('ready');
if (!reduce) root.classList.add('journey');

/* ---------- the booking, and the next open morning on the first screen ---------- */
const booking = initBooking({ reduce });
if (booking && $('nextOpen')) $('nextOpen').textContent = booking.label;

/* ---------- elements ---------- */
const bar = $('bar'), hero = $('top'), heroMedia = $('heroMedia'), letters = [...document.querySelectorAll('.wm b')];
const strip = $('strip'), stripFly = $('stripFly'), stripTime = $('stripTime'), barClock = $('barClock');
const arcade = $('arcade'), arcadeView = $('arcadeView'), arcadeTrack = $('arcadeTrack'), arcadeIntro = $('arcadeIntro'), foot = document.querySelector('.foot');
const tones = [...document.querySelectorAll('.tone:not(.tone--fixed)')];
const allTones = [...document.querySelectorAll('.tone')];
const timed = [...document.querySelectorAll('main [data-time]')];
const LIFT = [0.1, 0.24, 0.05, 0.3, 0.15, 0.2];            // each letter of the wordmark leaves at its own rate
const minutes = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const clock = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}`;
const pageTop = el => el.getBoundingClientRect().top + scrollY;

/* ---------- measurements (redone when the layout changes) ---------- */
let vh = innerHeight, colorAt = null, times = [], altitude = [], arcadeTop = 0, arcadeRun = 0, heroH = 0, pinned = false, stripOn = false;
const pinQuery = matchMedia('(min-width: 900px) and (min-height: 560px)');
const stripQuery = matchMedia('(min-width: 1100px)');

function measure() {
  vh = innerHeight; heroH = hero.offsetHeight;
  stripOn = !reduce && stripQuery.matches;

  const wantPin = !reduce && pinQuery.matches;
  if (wantPin !== pinned) {
    pinned = wantPin;
    arcade.classList.toggle('is-pinned', pinned);
    if (pinned) { arcadeView.removeAttribute('tabindex'); arcadeView.scrollLeft = 0; arcadeTrack.prepend(arcadeIntro); }   // the title walks past with the arches
    else { arcadeView.tabIndex = 0; arcadeTrack.style.transform = ''; arcadeView.before(arcadeIntro); }
  }
  if (pinned) {
    arcadeRun = Math.max(0, arcadeTrack.scrollWidth - arcadeView.clientWidth);
    arcade.style.setProperty('--run', arcadeRun + 'px');
  }
  arcadeTop = pageTop(arcade);

  if (!reduce) {
    const stops = tones.map(el => { const cs = getComputedStyle(el);
      return { top: pageTop(el), color: parseColor(cs.getPropertyValue('--sec-bg')), via: el.dataset.via ? el.dataset.via.split(',').map(parseColor) : [] }; });
    colorAt = makeJourney(stops, vh * 0.36, vh * 0.1);
  }
  times = timed.map(el => ({ top: pageTop(el), min: minutes(el.dataset.time) }));

  // the balloon: on the ground until lift-off, highest above the cloud, down again by breakfast
  const at = (id, f = 0) => { const el = $(id); return pageTop(el) + el.offsetHeight * f; };
  altitude = [[at('h0640'), 0], [at('h0715'), 0], [at('h0740'), 0.56], [at('h0810'), 0.9], [at('h0810', 0.5), 1], [at('h0840'), 0.6], [at('h0840', 0.55), 0.1], [arcadeTop, 0]];
}

/* ---------- one frame ---------- */
let last = {}, queued = false;
const put = (el, name, value) => { const k = (el === root ? 'r' : el === bar ? 'b' : 'x') + name; if (last[k] !== value) { last[k] = value; el.style.setProperty(name, value); } };
const drifting = new Set();

function frame() {
  queued = false;
  const y = scrollY, probe = y + vh * 0.5;

  /* the ground and the ink */
  const overFoot = foot.getBoundingClientRect().top < bar.offsetHeight * 0.5;
  if (!reduce) {
    const bg = colorAt(probe), ink = inkFor(bg), dark = luminance(bg) < FLIP;
    put(root, '--bg', css(bg)); put(root, '--ink', css(ink)); put(root, '--accent', css(accentFor(bg, ink)));
    put(root, '--action', css(dark ? BURNER : TERRA)); put(root, '--on-action', dark ? css(NIGHT) : '#fff');
    if (root.dataset.ground !== (dark ? 'dark' : 'light')) root.dataset.ground = dark ? 'dark' : 'light';
    const d = overFoot || dark;
    put(bar, '--bar-ink', css(overFoot ? CREAM : ink)); put(bar, '--bar-bg', css(overFoot ? NIGHT : bg));
    put(bar, '--bar-action', css(d ? BURNER : TERRA)); put(bar, '--bar-on-action', d ? css(NIGHT) : '#fff');
  } else {
    const line = bar.offsetHeight * 0.5;
    let under = allTones[0];
    for (const el of allTones) if (el.getBoundingClientRect().top <= line) under = el;
    if (last.under !== under) { last.under = under; const cs = getComputedStyle(under);
      for (const [to, from] of [['--bar-ink', '--ink'], ['--bar-bg', '--sec-bg'], ['--bar-action', '--action'], ['--bar-on-action', '--on-action']]) bar.style.setProperty(to, cs.getPropertyValue(from).trim()); }
  }
  bar.classList.toggle('is-veiled', y > heroH - bar.offsetHeight - 8);

  /* the clock */
  let i = 0;
  for (let k = 0; k < times.length; k++) if (probe >= times[k].top) i = k;
  const now = times[i], next = times[i + 1];
  const flowing = next ? now.min + (next.min - now.min) * clamp((probe - now.top) / (next.top - now.top)) : now.min;
  const barText = clock(stripOn || reduce ? now.min : flowing);
  if (last.clock !== barText) { last.clock = barText; barClock.textContent = barText; }

  if (!reduce) {
    /* the flight strip */
    if (stripOn) {
      let alt = 0;
      for (let k = 0; k < altitude.length - 1; k++) { const [a, va] = altitude[k], [b, vb] = altitude[k + 1];
        if (probe >= a && probe < b) { alt = va + (vb - va) * smooth((probe - a) / (b - a)); break; } }
      stripFly.style.transform = `translate3d(0,${(-alt * (strip.offsetHeight - 22)).toFixed(1)}px,0)`;
      const t = clock(flowing);
      if (last.strip !== t) { last.strip = t; stripTime.textContent = t; }
      strip.classList.toggle('is-on', y > heroH * 0.55 && y < arcadeTop - vh * 0.5);   // the strip is the flight: it leaves once the basket is down
    }
    /* the first screen: the photograph falls behind, the letters leave one by one */
    if (y < heroH) {
      heroMedia.style.transform = `translate3d(0,${(y * 0.24).toFixed(1)}px,0)`;
      letters.forEach((b, k) => { b.style.translate = `0 ${(-y * LIFT[k]).toFixed(1)}px`; });
    }
    /* photographs drift a few percent slower than the page */
    for (const win of drifting) {
      const r = win.getBoundingClientRect(), p = clamp((r.top + r.height / 2 - vh / 2) / (vh / 2 + r.height / 2), -1, 1);
      if (win.hasAttribute('data-float')) win.style.setProperty('--float', (p * 26).toFixed(1) + 'px');
      else win.firstElementChild.style.setProperty('--drift', (-p * 0.055 * r.height).toFixed(1) + 'px');
    }
    /* the arcade walks past */
    if (pinned && arcadeRun) arcadeTrack.style.transform = `translate3d(${(-clamp((y - arcadeTop) / arcadeRun) * arcadeRun).toFixed(1)}px,0,0)`;
  }
}
const ask = () => { if (!queued) { queued = true; requestAnimationFrame(frame); } };
const remeasure = () => { measure(); ask(); };

measure(); frame();
addEventListener('scroll', ask, { passive: true });
addEventListener('resize', remeasure);
addEventListener('load', remeasure);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(remeasure);
if ('ResizeObserver' in window) { let h = 0; new ResizeObserver(() => { const n = document.body.offsetHeight; if (n !== h) { h = n; remeasure(); } }).observe(document.body); }

/* ---------- rises and drift: only what is on screen ---------- */
if (!reduce && 'IntersectionObserver' in window) {
  const rises = new IntersectionObserver(entries => { for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-in'); rises.unobserve(e.target); } }, { rootMargin: '0px 0px -10% 0px', threshold: 0.08 });
  document.querySelectorAll('[data-rise]').forEach(el => {
    const group = el.parentElement.querySelectorAll(':scope > [data-rise]');
    el.style.setProperty('--d', ([...group].indexOf(el) * 0.14).toFixed(2) + 's');
    rises.observe(el);
  });
  const near = new IntersectionObserver(entries => { for (const e of entries) { if (e.isIntersecting) drifting.add(e.target); else drifting.delete(e.target); } ask(); }, { rootMargin: '15% 0px 15% 0px' });
  document.querySelectorAll('[data-drift],[data-float]').forEach(el => near.observe(el));
  // the burner only breathes while the first screen is in view
  const glow = document.querySelector('.hero__glow');
  if (glow) new IntersectionObserver(([e]) => { glow.style.animationPlayState = e.isIntersecting ? 'running' : 'paused'; }).observe(hero);
} else {
  document.querySelectorAll('[data-rise]').forEach(el => el.classList.add('is-in'));
}

/* ---------- the phone menu ---------- */
const menuBtn = $('menuBtn'), sheet = $('sheet'), main = $('main');
function setSheet(open) {
  sheet.hidden = !open;
  menuBtn.setAttribute('aria-expanded', open);
  menuBtn.textContent = open ? 'Close' : 'Menu';
  root.classList.toggle('sheet-open', open);
  bar.classList.toggle('bar--sheet', open);
  main.inert = open; foot.inert = open;
}
menuBtn.addEventListener('click', () => setSheet(sheet.hidden));
sheet.addEventListener('click', e => { if (e.target.closest('a')) setSheet(false); });
addEventListener('keydown', e => { if (e.key === 'Escape' && !sheet.hidden) { setSheet(false); menuBtn.focus(); } });
matchMedia('(min-width: 900px)').addEventListener('change', e => { if (e.matches && !sheet.hidden) setSheet(false); });
