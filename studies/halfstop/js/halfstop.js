// Halfstop Editions. Entry point: the wordmark that shrinks into the bar, the newsletter row, then the shop.
import { initBag } from './bag.js';
import { initShop } from './shop.js';

const root = document.documentElement;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = id => document.getElementById(id);

// The page width without the scrollbar: the wordmark is sized from it so its ink runs margin to margin.
const setWidth = () => root.style.setProperty('--pw', root.clientWidth + 'px');
setWidth();

// ---- the wordmark docks into the bar over the first screen of scroll, and the sticker scrolls away under the bar
function initDock() {
  if (reduced || !root.classList.contains('is-dock')) { root.classList.remove('is-dock'); return; }
  const word = $('wordmark'), mark = $('bar-mark-text'), clip = $('sticker-clip'), sticker = $('sticker'), bar = $('bar');
  const line = document.querySelector('.mast__line');
  let g = null, queued = false;
  function measure() {
    const y = window.scrollY, was = word.style.transform;
    word.style.transform = 'none';
    const w = word.getBoundingClientRect();                 // at rest, where the stylesheet puts it
    word.style.transform = was;
    const m = mark.getBoundingClientRect(), dock = bar.querySelector('.bar__dock').getBoundingClientRect();
    const under = Math.max(bar.getBoundingClientRect().bottom, dock.bottom);
    g = {                                                   // the moves from rest to its place in the bar
      dx: m.left - w.left, dy: m.top - w.top, s1: m.height / w.height,
      range: Math.max(40, line.getBoundingClientRect().top + y - under),
      stickerEnd: sticker.offsetTop + sticker.offsetHeight * 1.3,
    };
  }
  function draw() {
    queued = false;
    const y = Math.max(0, window.scrollY), p = Math.min(1, y / g.range);
    word.style.transform = p ? `translate3d(${g.dx * p}px,${g.dy * p}px,0) scale(${1 + (g.s1 - 1) * p})` : 'none';
    root.classList.toggle('is-docked', p >= 1);
    clip.style.setProperty('--sy', y.toFixed(1));
    clip.classList.toggle('is-off', y > g.stickerEnd);
  }
  const queue = () => { if (!queued) { queued = true; requestAnimationFrame(draw); } };
  const again = () => { setWidth(); measure(); draw(); };
  measure(); draw();
  window.addEventListener('scroll', queue, { passive: true });
  window.addEventListener('resize', again);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(again);
  window.addEventListener('load', again);
}
window.addEventListener('resize', setWidth);

// ---- the newsletter row: checks the address, then says it is a sample. Nothing is sent or stored.
function initNews() {
  const form = $('news-form'), input = $('news-email'), msg = $('news-msg');
  if (!form) return;
  const ok = v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
  form.addEventListener('submit', e => {
    e.preventDefault();
    const v = input.value.trim();
    if (!v || !ok(v)) {
      input.setAttribute('aria-invalid', 'true');
      msg.textContent = v ? 'That does not look like an email address. Check it and try again.' : 'Enter an email address first.';
      input.focus();
      return;
    }
    input.removeAttribute('aria-invalid');
    input.value = '';
    msg.textContent = 'This is a sample site, so the address was not sent or saved. On the real shop you would now be on the list.';
  });
  input.addEventListener('input', () => { if (input.hasAttribute('aria-invalid')) input.removeAttribute('aria-invalid'); });
}

// Section links: smooth unless motion is reduced. The hash is kept so the back button works.
function initLinks() {
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href^="#"]'); if (!a) return;
    const target = document.getElementById(a.getAttribute('href').slice(1)); if (!target) return;
    e.preventDefault();
    if (target.id === 'top') window.scrollTo({ top: 0, behavior: reduced ? 'instant' : 'smooth' });
    else target.scrollIntoView({ behavior: reduced ? 'instant' : 'smooth', block: 'start' });
    history.replaceState(null, '', '#' + target.id);
    const focusable = target.matches('a,button,input,[tabindex]') ? target : target.querySelector('h2,h3,.row__btn');
    if (a.classList.contains('skip')) { const first = document.querySelector('.row__btn'); if (first) first.focus({ preventScroll: true }); }
    else if (focusable && !focusable.matches('.row__btn')) { focusable.setAttribute('tabindex', '-1'); focusable.focus({ preventScroll: true }); }
  });
}

initDock();
initBag();
initShop();
initNews();
initLinks();
