// The bag: what is in it (memory, mirrored to sessionStorage) and the panel from the right.
// Nothing is sent anywhere. "Check out" ends on a notice that this is a sample.
import { price, summary, money, SIZES, PAPERS, FRAMES } from './catalog.js';

const KEY = 'halfstop.bag.v1', MAX = 10;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const listeners = new Set();
let items = [];

const known = (list, id) => list.some(x => x.id === id);
try {
  const saved = JSON.parse(sessionStorage.getItem(KEY) || '[]');
  if (Array.isArray(saved)) items = saved.filter(it => it && typeof it.slug === 'string' && typeof it.title === 'string' && typeof it.thumb === 'string' &&
    known(SIZES, it.size) && known(PAPERS, it.paper) && known(FRAMES, it.frame) && it.qty >= 1 && it.qty <= MAX)
    .map(it => ({ slug: it.slug, title: it.title, thumb: it.thumb, size: it.size, paper: it.paper, frame: it.frame, qty: Math.floor(it.qty) }));
} catch (e) { items = []; }

const keyOf = it => [it.slug, it.size, it.paper, it.frame].join('|');
function changed() {
  try { sessionStorage.setItem(KEY, JSON.stringify(items)); } catch (e) { /* private mode: the bag still lives in memory */ }
  listeners.forEach(fn => fn());
}

export const bag = {
  items: () => items,
  count: () => items.reduce((n, it) => n + it.qty, 0),
  countOf: slug => items.reduce((n, it) => n + (it.slug === slug ? it.qty : 0), 0),
  subtotal: () => items.reduce((n, it) => n + it.qty * price(it), 0),
  add(it) {
    const hit = items.find(x => keyOf(x) === keyOf(it));
    if (hit) hit.qty = Math.min(MAX, hit.qty + 1); else items.push({ ...it, qty: 1 });
    changed();
  },
  setQty(key, qty) { const hit = items.find(x => keyOf(x) === key); if (hit) { hit.qty = Math.max(1, Math.min(MAX, qty)); changed(); } },
  remove(key) { items = items.filter(x => keyOf(x) !== key); changed(); },
  clear() { items = []; changed(); },
  subscribe(fn) { listeners.add(fn); },
};

// One polite live region for the whole page.
const live = document.getElementById('live');
let liveTimer = 0;
export function say(text) {
  if (!live) return;
  live.textContent = '';
  clearTimeout(liveTimer);
  liveTimer = setTimeout(() => { live.textContent = text; }, 60);
}
const prints = n => `${n} ${n === 1 ? 'print' : 'prints'}`;
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---- the panel -------------------------------------------------------------------------------------
const dialog = document.getElementById('bag'), body = document.getElementById('bag-body'), title = document.getElementById('bag-title');
const openBtn = document.getElementById('bag-open'), closeBtn = document.getElementById('bag-close');
const counts = [document.getElementById('bag-count'), document.getElementById('bag-count-2')];
let opener = null, view = 'list', closing = 0;

function renderCount() {
  const n = bag.count();
  counts.forEach(el => { if (el) el.textContent = n; });
  openBtn.classList.toggle('has-items', n > 0);
  title.classList.toggle('has-items', n > 0);
}

function renderList() {
  view = 'list';
  if (!items.length) {
    body.innerHTML = `<div class="bag__empty"><p>The bag is empty.</p><button class="btn" type="button" data-act="index">Go to the index</button></div>`;
    return;
  }
  body.innerHTML = `<ul class="bag__list">${items.map(it => {
    const k = esc(keyOf(it)), t = esc(it.title);
    return `<li class="bag__item" data-key="${k}">
      <div class="bag__thumb"><img src="${esc(it.thumb)}" alt="" decoding="async"></div>
      <div class="bag__what">
        <p class="bag__title">${t}</p>
        <p class="bag__opts">${esc(summary(it))}</p>
        <div class="bag__ctl">
          <div class="qty" role="group" aria-label="Quantity of ${t}">
            <button type="button" data-act="less" aria-label="One fewer"${it.qty <= 1 ? ' aria-disabled="true"' : ''}>&minus;</button>
            <output aria-label="Quantity">${it.qty}</output>
            <button type="button" data-act="more" aria-label="One more"${it.qty >= MAX ? ' aria-disabled="true"' : ''}>+</button>
          </div>
          <button class="bag__remove" type="button" data-act="remove" aria-label="Remove ${t}, ${esc(summary(it))}">Remove</button>
        </div>
      </div>
      <p class="bag__price">${money(it.qty * price(it))}</p>
    </li>`;
  }).join('')}</ul>
  <div class="bag__foot">
    <p class="bag__sub"><span>Subtotal, ${prints(bag.count())}</span><span class="head">${money(bag.subtotal())}</span></p>
    <p class="bag__ship">Shipping is added at the next step.</p>
    <button class="bag__checkout" type="button" data-act="checkout">Check out</button>
  </div>`;
}

function renderNotice(n, total) {
  view = 'notice';
  body.innerHTML = `<div class="bag__notice">
    <p class="head" id="bag-notice" tabindex="-1">Nothing was ordered.</p>
    <p>This is a sample site by Mert Tureli. Halfstop Editions is an invented shop, so no order was placed, nothing was charged and nothing was sent or stored.</p>
    <p>The bag held ${prints(n)}, ${money(total)}. It is empty again.</p>
    <button class="btn" type="button" data-act="index">Back to the index</button>
  </div>`;
}

function focusables() {
  return [...dialog.querySelectorAll('button,[href],input,[tabindex]:not([tabindex="-1"])')].filter(el => !el.disabled && el.offsetParent !== null);
}

export function openBag(from) {
  if (dialog.open) return;
  clearTimeout(closing);
  opener = from || document.activeElement;
  renderList();
  const rootEl = document.documentElement;
  rootEl.style.setProperty('--sbw', (window.innerWidth - rootEl.clientWidth) + 'px');   // keep the page still when its scrollbar goes
  rootEl.classList.add('bag-open');
  dialog.showModal();
  dialog.getBoundingClientRect();                       // start the slide from off screen
  dialog.classList.add('is-in');
  title.focus({ preventScroll: true });
}

function finishClose() {
  clearTimeout(closing);
  if (dialog.open) dialog.close();
  dialog.classList.remove('is-in');
  document.documentElement.classList.remove('bag-open');
  const back = opener && document.contains(opener) ? opener : openBtn;
  opener = null;
  back.focus({ preventScroll: true });
}

export function closeBag(then) {
  if (!dialog.open) return;
  dialog.classList.remove('is-in');
  clearTimeout(closing);
  const done = () => { finishClose(); if (then) then(); };
  if (reduced) done(); else closing = setTimeout(done, 310);
}

function onAction(e) {
  const btn = e.target.closest('[data-act]');
  if (!btn || btn.getAttribute('aria-disabled') === 'true') return;
  const act = btn.dataset.act, li = btn.closest('.bag__item'), key = li && li.dataset.key;
  if (act === 'index') {
    closeBag(() => { const first = document.querySelector('.row__btn'); opener = null; document.getElementById('index').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' }); if (first) first.focus({ preventScroll: true }); });
    return;
  }
  if (act === 'checkout') {
    const n = bag.count(), total = bag.subtotal();
    bag.clear();
    renderNotice(n, total);
    document.getElementById('bag-notice').focus();
    say(`Nothing was ordered. This is a sample site. The bag is empty again.`);
    return;
  }
  const it = items.find(x => keyOf(x) === key);
  if (!it) return;
  if (act === 'remove') {
    const index = items.indexOf(it);
    bag.remove(key);
    renderList();
    const next = body.querySelectorAll('.bag__remove')[Math.min(index, items.length - 1)];
    (next || body.querySelector('.btn') || title).focus();
    say(`Removed ${it.title}. The bag holds ${prints(bag.count())}.`);
    return;
  }
  bag.setQty(key, it.qty + (act === 'more' ? 1 : -1));
  renderList();
  const again = body.querySelector(`.bag__item[data-key="${CSS.escape(key)}"] [data-act="${act}"]`);
  if (again) (again.getAttribute('aria-disabled') === 'true' ? again.parentElement.querySelector(`[data-act="${act === 'more' ? 'less' : 'more'}"]`) : again).focus();
  say(`${it.title}: quantity ${it.qty}. Subtotal ${money(bag.subtotal())}.`);
}

export function initBag() {
  renderCount();
  bag.subscribe(renderCount);
  openBtn.addEventListener('click', () => openBag(openBtn));
  closeBtn.addEventListener('click', () => closeBag());
  body.addEventListener('click', onAction);
  dialog.addEventListener('cancel', e => { e.preventDefault(); closeBag(); });
  dialog.addEventListener('close', () => { if (document.documentElement.classList.contains('bag-open')) finishClose(); });
  dialog.addEventListener('click', e => {               // a click on the scrim, outside the panel
    if (e.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closeBag();
  });
  dialog.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); closeBag(); return; }
    if (e.key !== 'Tab') return;                          // keep Tab inside the bag
    const list = focusables();
    if (!list.length) { e.preventDefault(); return; }
    const first = list[0], last = list[list.length - 1], at = document.activeElement;
    if (e.shiftKey && (at === first || !list.includes(at))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (at === last || !list.includes(at))) { e.preventDefault(); first.focus(); }
  });
}
