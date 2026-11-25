// The index is the shop. A row opens in place into the photograph, its label, the options and the wall.
import { SIZES, PAPERS, FRAMES, DEFAULT, HANG_CENTER, ROLLED, MAX_PER_LINE, sizeOf, paperOf, frameOf, price, summary, geometry, money, inches, sizeName } from './catalog.js';
import { bag, say, openBag } from './bag.js';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const EASE = 'cubic-bezier(.2,.7,.1,1)';
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const topOffset = () => { const bar = document.getElementById('bar'), dock = bar.querySelector('.bar__dock');
  return Math.max(bar.getBoundingClientRect().bottom, dock ? dock.getBoundingClientRect().bottom : 0); };

const prints = [...document.querySelectorAll('.row')].map((row, i) => {
  const img = row.querySelector('.row__img'), thumb = img.dataset.src || img.getAttribute('src');
  const w = +row.dataset.w, h = +row.dataset.h, format = row.querySelector('.row__fmt').textContent;
  const [fa, fb] = (format.match(/(\d+):(\d+)/) || [0, w, h]).slice(1).map(Number);   // the stated ratio, "4:3" or "4:5"
  return {
    slug: row.dataset.slug, n: i + 1, row, btn: row.querySelector('.row__btn'), panel: row.querySelector('.row__panel'), inBag: row.querySelector('.row__bag'),
    title: `${row.querySelector('.row__a').textContent} ${row.querySelector('.row__b').textContent}`.replace(/\s+/g, ' ').trim(),
    place: row.dataset.place || '', format, alt: img.alt, ratio: Math.max(fa, fb) / Math.min(fa, fb),
    thumb, base: thumb.replace(/-480\.webp$/, ''), w, h, landscape: w > h, sel: { ...DEFAULT }, built: false, timer: 0,
  };
});
let current = null;

// ---- the wall ----------------------------------------------------------------------------------------
function wallMarkup(p) {
  return `<section class="wall" aria-label="On the wall">
    <div class="wall__head"><h4 class="wall__title">On the wall, at true scale</h4><p class="wall__cap" data-wall-cap></p></div>
    <div class="wall__view">
      <div class="wall__scene" role="img" data-wall-scene>
        <span class="fdim" aria-hidden="true"></span>
        <img class="wall__fig" src="assets/figure.svg" alt="" width="248" height="698" decoding="async">
        <img class="wall__sofa" src="assets/sofa.svg" alt="" width="848" height="328" decoding="async">
        <div class="wall__hang" data-wall-hang aria-hidden="true">
          <div class="wall__print" data-wall-print><div class="wall__sheet"><img src="${esc(p.thumb)}" alt="" decoding="async"></div></div>
          <span class="pdim pdim--w"><span data-dim-w></span></span>
          <span class="pdim pdim--h"><span data-dim-h></span></span>
        </div>
      </div>
      <div class="wall__ground"><span class="sdim" aria-hidden="true"></span><span class="g g-fig" aria-hidden="true">5 ft 9 in</span><span class="g g-sofa" aria-hidden="true">84 in</span><button class="wall__close" type="button" data-close>Close</button></div>
    </div>
  </section>`;
}

function drawWall(p, animate) {
  const g = geometry(p, p.sel), frame = frameOf(p.sel), panel = p.panel;
  const hang = panel.querySelector('[data-wall-hang]'), print = panel.querySelector('[data-wall-print]');
  const before = animate && !reduced ? hang.getBoundingClientRect() : null;
  hang.style.setProperty('--w', g.outerW); hang.style.setProperty('--h', g.outerH); hang.style.setProperty('--b', g.bottom); hang.style.setProperty('--f', g.f);
  hang.style.setProperty('--iw', g.imageW); hang.style.setProperty('--ih', g.imageH);
  print.dataset.frame = p.sel.frame;
  panel.querySelector('[data-dim-w]').textContent = `${inches(g.outerW)} in`;
  panel.querySelector('[data-dim-h]').textContent = `${inches(g.outerH)} in`;
  const framed = p.sel.frame === 'none' ? 'unframed' : `in ${frame.id === 'oak' ? 'an' : 'a'} ${frame.name.toLowerCase()} frame`;
  panel.querySelector('[data-wall-cap]').textContent = `${sizeName(sizeOf(p.sel))}, ${framed}. Center at ${HANG_CENTER} in, museum height.`;
  panel.querySelector('[data-wall-scene]').setAttribute('aria-label',
    `Scale drawing of a wall. ${p.title}, ${framed}, ${inches(g.outerW)} in wide and ${inches(g.outerH)} in tall, hangs above a sofa 84 in wide, beside a standing figure 5 ft 9 in tall.`);
  if (!before) return;
  const after = hang.getBoundingClientRect();              // the wall redraws: the print grows or shrinks into its new size
  if (!after.width || !before.width || (Math.abs(after.width - before.width) < .5 && Math.abs(after.height - before.height) < .5)) return;
  print.animate([{ transform: `translate(${before.left - after.left}px,${before.top - after.top}px) scale(${before.width / after.width},${before.height / after.height})` }, { transform: 'none' }],
    { duration: 300, easing: EASE });
}

// ---- one panel -----------------------------------------------------------------------------------------
const cell = (name, id, label, add, checked) =>
  `<label class="cell"><input type="radio" name="${name}" value="${id}"${checked ? ' checked' : ''}><span class="cell__name">${label}</span><span class="cell__add" data-add="${id}">${add}</span></label>`;

function build(p) {
  const s = p.slug, sizesW = `(min-width: 1100px) ${p.landscape ? '57vw' : '32vw'}, ${p.landscape ? '94vw' : '(min-width: 760px) 48vw, 92vw'}`;
  p.panel.innerHTML = `<div class="panel"><div class="panel__in ${p.landscape ? 'is-landscape' : 'is-portrait'}">
    <figure class="panel__photo" style="background-image:url('${esc(p.thumb)}')">
      <img src="${esc(p.base)}-1280.webp" srcset="${esc(p.base)}-960.webp 960w, ${esc(p.base)}-1280.webp 1280w" sizes="${sizesW}" width="${p.w}" height="${p.h}" alt="" decoding="async">
    </figure>
    <div class="panel__side">
      <p class="head label__title">${esc(p.title)}</p>
      <form class="panel__buy" novalidate>
        <fieldset class="opt-set"><legend class="vh">Size</legend><div class="opt">
          <span class="opt__legend" aria-hidden="true">Size</span>
          <div class="opt__set">${SIZES.map(z => cell(`size-${s}`, z.id, sizeName(z), money(z.price), z.id === p.sel.size)).join('')}</div>
          <p class="opt__note" data-note-size></p>
        </div></fieldset>
        <fieldset class="opt-set"><legend class="vh">Paper</legend><div class="opt">
          <span class="opt__legend" aria-hidden="true">Paper</span>
          <div class="opt__set opt__set--2">${PAPERS.map(z => cell(`paper-${s}`, z.id, z.name, z.add ? `+${money(z.add)}` : 'Included', z.id === p.sel.paper)).join('')}</div>
          <p class="opt__note" data-note-paper></p>
        </div></fieldset>
        <fieldset class="opt-set"><legend class="vh">Frame</legend><div class="opt">
          <span class="opt__legend" aria-hidden="true">Frame</span>
          <div class="opt__set">${FRAMES.map(z => cell(`frame-${s}`, z.id, z.name, '', z.id === p.sel.frame)).join('')}</div>
          <p class="opt__note" data-note-frame></p>
        </div></fieldset>
        <div class="buy">
          <span class="buy__label" id="price-label-${s}">Price</span>
          <output class="buy__price head" aria-labelledby="price-label-${s}" data-price></output>
          <button class="buy__add" type="submit">Add to bag</button>
          <p class="buy__sum" data-sum></p>
        </div>
      </form>
    </div>
    <dl class="label__list">
      ${p.place ? `<div><dt>Where</dt><dd>${esc(p.place)}</dd></div>` : ''}
      <div><dt>Process</dt><dd data-process></dd></div>
      <div><dt>Edition</dt><dd>50, numbered and signed</dd></div>
      <div><dt>Format</dt><dd>${esc(p.format)}</dd></div>
    </dl>
    ${wallMarkup(p)}
  </div></div>`;
  p.panel.querySelector('.panel__photo img').alt = p.alt;
  const form = p.panel.querySelector('form');
  form.addEventListener('change', () => {
    p.sel = { size: form.elements[`size-${s}`].value, paper: form.elements[`paper-${s}`].value, frame: form.elements[`frame-${s}`].value };
    refresh(p, true);
  });
  form.addEventListener('submit', e => {
    e.preventDefault();
    const added = bag.add({ slug: p.slug, title: p.title, thumb: p.thumb, ...p.sel }), n = bag.count();
    openBag(form.querySelector('.buy__add'));              // then speak inside the bag: the page behind it is inert
    say(added ? `Added ${p.title}, ${summary(p.sel)}. The bag holds ${n} ${n === 1 ? 'print' : 'prints'}.`
      : `The bag already holds ${MAX_PER_LINE} of ${p.title}, ${summary(p.sel)}. ${MAX_PER_LINE} per order.`);
  });
  p.panel.querySelector('[data-close]').addEventListener('click', () => close(p, { focus: true }));
  if (!(window.CSS && CSS.supports && CSS.supports('width', '1cqw')) && 'ResizeObserver' in window) {   // older browsers: set the wall's inch in pixels by hand
    const view = p.panel.querySelector('.wall__view'), wall = p.panel.querySelector('.wall');
    new ResizeObserver(() => { const u = view.clientWidth / (parseFloat(getComputedStyle(wall).getPropertyValue('--sw')) || 232) + 'px';
      view.querySelectorAll('.wall__scene,.wall__ground').forEach(el => el.style.setProperty('--u', u)); }).observe(view);
  }
  p.built = true;
  refresh(p, false);
}

function refresh(p, animate) {
  const size = sizeOf(p.sel), paper = paperOf(p.sel), g = geometry(p, p.sel), q = sel => p.panel.querySelector(sel);
  p.panel.querySelectorAll('.cell').forEach(c => c.classList.toggle('is-on', c.querySelector('input').checked));
  q('[data-price]').textContent = money(price(p.sel));
  q('[data-sum]').textContent = `${summary(p.sel)}.`;
  q('[data-process]').textContent = `Pigment print on ${paper.name.toLowerCase()}`;
  q('[data-note-size]').textContent = `Sheet ${sizeName(size)}. The image on it is ${inches(g.imageShort)} × ${inches(g.imageLong)} in.`;
  q('[data-note-paper]').textContent = paper.note;
  q('[data-note-frame]').textContent = p.sel.frame === 'none'
    ? (size.id === ROLLED ? 'No frame. The sheet is sent rolled, ready for your framer.' : 'No frame. The sheet is sent flat, ready for your framer.')
    : `Solid wood, 0.75 in. Hangs ${inches(g.outerW)} in wide, ${inches(g.outerH)} in tall.`;
  FRAMES.forEach(f => { q(`input[name="frame-${p.slug}"][value="${f.id}"] ~ .cell__add`).textContent = f.id === 'none' ? 'Print only' : `+${money(size.frame)}`; });
  drawWall(p, animate);
}

// ---- open and close ------------------------------------------------------------------------------------
function close(p, { instant = false, focus = false } = {}) {
  if (!p.row.classList.contains('is-open')) return;
  clearTimeout(p.timer);
  p.row.classList.remove('is-open');
  p.btn.setAttribute('aria-expanded', 'false');
  if (current === p) current = null;
  if (focus) p.btn.focus({ preventScroll: true });
  if (!instant) {                                           // closed from deep inside the panel: bring its row back under the bar
    const top = p.row.getBoundingClientRect().top, under = topOffset();
    if (top < under) window.scrollTo({ top: window.scrollY + top - under + 1, behavior: reduced ? 'instant' : 'smooth' });
  }
  if (instant || reduced) p.panel.hidden = true; else p.timer = setTimeout(() => { p.panel.hidden = true; }, 470);
}

function open(p) {
  if (current && current !== p) {                           // one row open at a time: fold the other without a jump
    const before = p.row.getBoundingClientRect().top;
    close(current, { instant: true });
    const after = p.row.getBoundingClientRect().top;
    if (after !== before) window.scrollBy({ top: after - before, behavior: 'instant' });
  }
  clearTimeout(p.timer);
  if (!p.built) build(p);
  p.panel.hidden = false;
  p.panel.getBoundingClientRect();                          // so the clip runs from the rule
  p.row.classList.add('is-open');
  p.btn.setAttribute('aria-expanded', 'true');
  current = p;
  hidePeek();
  // Bring the row under the bar. If its options column would then end below the screen (a short window),
  // go on to the top of the panel, where that column sticks and "Add to bag" is in view.
  const under = topOffset(), rowTop = p.row.getBoundingClientRect().top, side = p.panel.querySelector('.panel__side');
  let y = window.scrollY + rowTop - under + 1;
  if (getComputedStyle(side).position === 'sticky' && under + side.getBoundingClientRect().bottom - rowTop > window.innerHeight - 12)
    y = window.scrollY + p.panel.getBoundingClientRect().top - under;
  window.scrollTo({ top: y, behavior: reduced ? 'instant' : 'smooth' });
}

function initRows() {
  const list = document.getElementById('rows');
  prints.forEach(p => p.btn.addEventListener('click', () => (p.row.classList.contains('is-open') ? close(p) : open(p))));
  list.addEventListener('keydown', e => {
    const row = e.target.closest('.row'); if (!row) return;
    const i = prints.findIndex(p => p.row === row), onButton = e.target.classList.contains('row__btn');
    if (e.key === 'Escape' && prints[i].row.classList.contains('is-open')) { e.preventDefault(); close(prints[i], { focus: true }); return; }
    if (!onButton) return;
    let to = -1;
    if (e.key === 'ArrowDown') to = Math.min(prints.length - 1, i + 1);
    else if (e.key === 'ArrowUp') to = Math.max(0, i - 1);
    else if (e.key === 'Home') to = 0;
    else if (e.key === 'End') to = prints.length - 1;
    if (to < 0) return;
    e.preventDefault();
    prints[to].btn.focus();
  });
  const marks = () => prints.forEach(p => { const n = bag.countOf(p.slug); p.inBag.textContent = n ? `In the bag: ${n}` : ''; });
  bag.subscribe(marks); marks();
}

// ---- the photograph that follows the pointer -------------------------------------------------------------
const peek = document.getElementById('peek'), peekImg = document.getElementById('peek-img');
let peekOn = false, px = 0, py = 0, tx = 0, ty = 0, raf = 0, lastX = -1, lastY = -1, peekFor = null;
function hidePeek() { peekOn = false; peekFor = null; if (peek) peek.classList.remove('is-on'); }
function placePeek(p, x) {
  const vw = document.documentElement.clientWidth, vh = window.innerHeight, m = 16, edge = 8;
  const r = p.btn.getBoundingClientRect(), top = topOffset();
  // The photograph sits above or below the row, never over the title being read and never over an open panel.
  const keep = current ? current.panel.getBoundingClientRect() : null;
  const roomBelow = (keep && keep.top >= r.bottom ? Math.min(vh, keep.top) : vh) - edge - (r.bottom + m);
  const roomAbove = (r.top - m) - (keep && keep.bottom <= r.top ? Math.max(top, keep.bottom) : top) - edge;
  let w = p.landscape ? 360 : 280, h = Math.round(w * p.h / p.w);
  const below = roomBelow >= h || roomBelow >= roomAbove, room = below ? roomBelow : roomAbove;
  if (room < h) { const k = room / h; if (k < .55) { hidePeek(); return; } w = Math.round(w * k); h = Math.round(h * k); }
  ty = below ? r.bottom + m : r.top - m - h;
  let left = x + 28; if (left + w > vw - m) left = x - 28 - w;
  tx = Math.max(m, Math.min(vw - w - m, left));
  if (peekFor !== p) { peekFor = p; peekImg.src = p.thumb; }
  peek.style.width = w + 'px'; peek.style.height = h + 'px';
  if (!peekOn) { px = tx; py = ty; peekOn = true; peek.classList.add('is-on'); }
  if (!raf) raf = requestAnimationFrame(stepPeek);
}
function stepPeek() {
  raf = 0;
  px += (tx - px) * .22; py += (ty - py) * .22;
  if (Math.abs(tx - px) < .3) px = tx; if (Math.abs(ty - py) < .3) py = ty;
  peek.style.transform = `translate3d(${px.toFixed(1)}px,${py.toFixed(1)}px,0)`;
  if (peekOn && (px !== tx || py !== ty)) raf = requestAnimationFrame(stepPeek);
}
function probe() {
  if (lastX < 0) return;
  const el = document.elementFromPoint(lastX, lastY), btn = el && el.closest && el.closest('.row__btn');
  const p = btn && prints.find(q => q.btn === btn);
  if (p && !p.row.classList.contains('is-open')) placePeek(p, lastX); else hidePeek();
}
function initPeek() {
  if (!peek || reduced || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  const list = document.getElementById('rows');
  list.addEventListener('pointermove', e => { if (e.pointerType !== 'mouse') return; lastX = e.clientX; lastY = e.clientY; probe(); });
  list.addEventListener('pointerleave', () => { lastX = lastY = -1; hidePeek(); });
  window.addEventListener('scroll', probe, { passive: true });
  window.addEventListener('blur', hidePeek);
}

// Thumbnails below the first screen wait, so the first view stays light. They all load at the first sign of a
// visitor (a scroll, a key, a touch), before their rows arrive; the About photograph waits until it is near.
function initLazy() {
  const imgs = [...document.querySelectorAll('img[data-src]')], rows = imgs.filter(img => img.classList.contains('row__img'));
  const load = img => { if (!img.dataset.src) return; if (img.dataset.srcset) img.srcset = img.dataset.srcset; img.src = img.dataset.src; img.removeAttribute('data-src'); img.removeAttribute('data-srcset'); };
  if (!('IntersectionObserver' in window)) { imgs.forEach(load); return; }
  const watch = margin => new IntersectionObserver((entries, io) => entries.forEach(e => { if (e.isIntersecting) { io.unobserve(e.target); load(e.target); } }), { rootMargin: margin });
  const near = watch('0px'), far = watch('900px 0px');
  imgs.forEach(img => (rows.includes(img) ? near : far).observe(img));
  const all = () => { ['scroll', 'keydown', 'pointerdown', 'touchstart', 'wheel'].forEach(t => window.removeEventListener(t, all, true)); rows.forEach(load); };
  ['scroll', 'keydown', 'pointerdown', 'touchstart', 'wheel'].forEach(t => window.addEventListener(t, all, { capture: true, passive: true }));
}

export function initShop() { initLazy(); initRows(); initPeek(); }
