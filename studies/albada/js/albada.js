/* Albada. The page is one morning: the scroll drives the color of the ground, the clock in the bar,
   the balloon on the flight strip, the drift of the photographs and the walk of the arcade.
   With prefers-reduced-motion none of that runs: the grounds change by section (in the CSS),
   and only the clock and the ink of the bar and of the way back are kept in step here. */
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
const bar = $('bar'), hero = $('top'), heroMedia = $('heroMedia'), letters = [...document.querySelectorAll('#wordmark .wm b')];
const strip = $('strip'), stripFly = $('stripFly'), stripTime = $('stripTime'), barClock = $('barClock');
const arcade = $('arcade'), arcadeView = $('arcadeView'), arcadeTrack = $('arcadeTrack'), arcadeIntro = $('arcadeIntro');
const foot = document.querySelector('.foot'), back = document.querySelector('.study-back--albada');
const book = $('book'), bookForm = $('bookForm'), stepDate = $('stepDate'), calGrid = $('calGrid');
const tones = [...document.querySelectorAll('.tone:not(.tone--fixed)')];
const allTones = [...document.querySelectorAll('.tone')];
const timed = [...document.querySelectorAll('main [data-time]')];
const LIFT = [0.1, 0.24, 0.05, 0.3, 0.15, 0.2];            // each letter of the wordmark leaves at its own rate
const minutes = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const clock = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}`;
const pageTop = el => el.getBoundingClientRect().top + scrollY;
const toneAt = y => { let under = allTones[0]; for (const el of allTones) if (el.getBoundingClientRect().top <= y) under = el; return under; };

/* ---------- measurements (redone when the layout changes) ---------- */
let vh = innerHeight, vw = root.clientWidth, barH = 72, colorAt = null, times = [], altitude = [], heroH = 0, stripOn = false;
let pinned = false, arcadeTop = 0, arcadeRun = 0, arcadeHold = 0, arcadeStart = 0;
const pinQuery = matchMedia('(min-width: 900px) and (min-height: 560px)');
const stripQuery = matchMedia('(min-width: 1100px)');
const wideQuery = matchMedia('(min-width: 900px)');
const FADE = 300;                                          // the arcade's title is gone after this much of the walk

function measure() {
  vh = innerHeight; vw = root.clientWidth; barH = bar.offsetHeight; heroH = hero.offsetHeight;
  stripOn = !reduce && stripQuery.matches;

  /* the arcade: pinned, it holds for 40vh, then the bays walk in from the right of the title and stop whole */
  arcade.style.setProperty('--vw', vw + 'px');
  const wantPin = !reduce && pinQuery.matches;
  if (wantPin !== pinned) {
    pinned = wantPin;
    arcade.classList.toggle('is-pinned', pinned);
    if (pinned) { arcadeView.removeAttribute('tabindex'); arcadeView.scrollLeft = 0; }
    else { arcadeView.tabIndex = 0; arcadeTrack.style.transform = ''; arcadeIntro.removeAttribute('style'); }
  }
  if (pinned) {
    arcadeHold = vh * 0.4;
    arcadeStart = Math.round(arcadeIntro.offsetWidth + clamp(vw * 0.07, 48, 120));
    arcadeRun = Math.round(arcadeHold + arcadeStart + vh * 0.3);
    arcade.style.setProperty('--run', arcadeRun + 'px');
  }
  arcadeTop = pageTop(arcade);

  /* a jump to the booking lands with the calendar head and its rows in view */
  if (bookForm.hidden) book.style.scrollMarginTop = '';
  else {
    const b = book.getBoundingClientRect(), s = stepDate.getBoundingClientRect(), g = calGrid.getBoundingClientRect();
    const lead = clamp(vh - barH - (g.bottom - s.top + 20), 12, vh * 0.3);
    book.style.scrollMarginTop = Math.round(lead - (s.top - b.top)) + 'px';
  }

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
const last = {}, wrote = new Map();
let queued = false;
const put = (el, name, value) => { let m = wrote.get(el); if (!m) wrote.set(el, m = {}); if (m[name] !== value) { m[name] = value; el.style.setProperty(name, value); } };
const copyTone = (el, tone, pairs) => { const cs = getComputedStyle(tone); for (const [to, from] of pairs) put(el, to, cs.getPropertyValue(from).trim()); };
const drifting = new Set();

function frame() {
  queued = false;
  const y = scrollY, probe = y + vh * 0.5;
  const footTop = foot.getBoundingClientRect().top, overFoot = footTop < barH * 0.5;
  const backY = vh - 42, backOnFoot = footTop < backY;      // the way back sits at the bottom left from 900 wide

  /* the ground and the ink: for the page, for the bar and for the way back */
  if (!reduce) {
    const bg = colorAt(probe), ink = inkFor(bg), dark = luminance(bg) < FLIP;
    put(root, '--bg', css(bg)); put(root, '--ink', css(ink)); put(root, '--accent', css(accentFor(bg, ink)));
    put(root, '--action', css(dark ? BURNER : TERRA)); put(root, '--on-action', dark ? css(NIGHT) : '#fff');
    if (root.dataset.ground !== (dark ? 'dark' : 'light')) root.dataset.ground = dark ? 'dark' : 'light';
    const d = overFoot || dark;
    put(root, '--bar-ink', css(overFoot ? CREAM : ink)); put(root, '--bar-bg', css(overFoot ? NIGHT : bg));
    put(root, '--bar-action', css(d ? BURNER : TERRA)); put(root, '--bar-on-action', d ? css(NIGHT) : '#fff');
    if (back) { put(back, '--back-ink', css(backOnFoot ? CREAM : ink)); put(back, '--back-bg', css(backOnFoot ? NIGHT : bg)); }
  } else {
    const under = toneAt(barH * 0.5);
    if (last.under !== under) { last.under = under; copyTone(root, under, [['--bar-ink', '--ink'], ['--bar-bg', '--sec-bg'], ['--bar-action', '--action'], ['--bar-on-action', '--on-action']]); }
    const below = toneAt(backY);
    if (back && last.below !== below) { last.below = below; copyTone(back, below, [['--back-ink', '--ink'], ['--back-bg', '--sec-bg']]); }
  }
  bar.classList.toggle('is-veiled', y > 8);                 // clear only at rest on the first screen

  /* the clock */
  let i = 0;
  for (let k = 0; k < times.length; k++) if (probe >= times[k].top) i = k;
  const now = times[i], next = times[i + 1];
  const flowing = next ? now.min + (next.min - now.min) * clamp((probe - now.top) / (next.top - now.top)) : now.min;
  const barText = clock(stripOn || reduce ? now.min : flowing);
  if (last.clock !== barText) { last.clock = barText; barClock.textContent = barText; }

  if (!reduce) {
    /* the flight strip: it is the flight, so it leaves once the basket is down */
    if (stripOn) {
      let alt = 0;
      for (let k = 0; k < altitude.length - 1; k++) { const [a, va] = altitude[k], [b, vb] = altitude[k + 1];
        if (probe >= a && probe < b) { alt = va + (vb - va) * smooth((probe - a) / (b - a)); break; } }
      stripFly.style.transform = `translate3d(0,${(-alt * (strip.offsetHeight - 22)).toFixed(1)}px,0)`;
      const t = clock(flowing);
      if (last.strip !== t) { last.strip = t; stripTime.textContent = t; }
      strip.classList.toggle('is-on', y > heroH * 0.55 && y < arcadeTop - vh * 0.5);
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
    /* the arcade: hold, then the title fades (it never slides under an edge) while the bays walk in */
    if (pinned) {
      const walked = clamp(y - arcadeTop - arcadeHold, 0, arcadeStart), f = clamp(walked / FADE);
      arcadeTrack.style.transform = `translate3d(${(arcadeStart - walked).toFixed(1)}px,0,0)`;
      arcadeIntro.style.opacity = ((1 - f) ** 2).toFixed(3);
      arcadeIntro.style.transform = `translate3d(${(-0.35 * Math.min(walked, FADE)).toFixed(1)}px,0,0)`;
      arcadeIntro.style.visibility = f >= 1 ? 'hidden' : 'visible';
    }
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

/* ---------- long jumps: more than two screens away, cut there inside a view transition ----------
   A smooth scroll over twelve thousand pixels flashes through every ground of the morning.
   Short jumps keep the browser's own smooth scroll. */
document.addEventListener('click', e => {
  const a = e.target.closest('a[href^="#"]');
  if (!a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const target = document.getElementById(decodeURIComponent(a.hash.slice(1)));
  if (!target || Math.abs(target.getBoundingClientRect().top) <= innerHeight * 2) return;
  e.preventDefault();
  const go = () => { target.scrollIntoView({ block: 'start', behavior: 'instant' }); frame(); };
  if (!reduce && document.startViewTransition) document.startViewTransition(go); else go();
  history.pushState(null, '', a.hash);
  if (!target.hasAttribute('tabindex')) target.tabIndex = -1;
  target.focus({ preventScroll: true });
});

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
  if (open) sheet.scrollTop = 0;
}
menuBtn.addEventListener('click', () => setSheet(sheet.hidden));
sheet.addEventListener('click', e => { if (e.target.closest('a')) setSheet(false); });
addEventListener('keydown', e => { if (e.key === 'Escape' && !sheet.hidden) { setSheet(false); menuBtn.focus(); } });
wideQuery.addEventListener('change', e => { if (e.matches && !sheet.hidden) setSheet(false); remeasure(); });
