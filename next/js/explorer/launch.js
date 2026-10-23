// CHARGER EXPLORER launcher: the only part loaded with the page (a few KB).
//
// Opens the explorer in place: a click on the explorer tile (its href stays as the
// no-JS fallback), a click on the hero rocket while it rests, or the URL #charger
// (shareable; loading next/#charger opens it directly). Back or Esc closes it and
// the page is where it was. The explorer itself (explorer.js, its CSS and the model)
// is fetched only when the tile comes near the viewport, is hovered or focused, or
// on the first open. Modified clicks (new tab) keep the fallback link.
const HASH = '#charger';
const tile = document.querySelector('[data-explorer-link]');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
let mod = null, cssP = null, ex = null, pushed = false, busy = false;

function css() {
  if (!cssP) cssP = new Promise(res => {
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = new URL('../../css/explorer.css', import.meta.url).href;
    l.onload = l.onerror = () => res();
    document.head.append(l);
  });
  return cssP;
}
// fetch the code, the stylesheet and the model data; build nothing yet
function prefetch() {
  if (!mod) {
    css();
    mod = import('./explorer.js').then(m => { m.prefetch(); return m; });
    mod.catch(err => console.warn('[explorer] unavailable', err));
  }
  return mod;
}
async function get() {
  const m = await prefetch();
  await css();
  if (!ex) ex = m.createExplorer({ onRequestClose: requestClose, onClosed });
  return ex;
}

const isOpen = () => !!(ex && ex.isOpen);
function setHash() {
  if (location.hash === HASH) return;
  try { history.pushState({ cx: 1 }, '', HASH); pushed = true; }
  catch (e) { pushed = false; }   // sandboxed preview: no history entry, Esc and the button still close
}
function clearHash() {
  if (location.hash !== HASH) return;
  try { history.replaceState(history.state && history.state.cx ? null : history.state, '', location.pathname + location.search); } catch (e) { /* keep the hash */ }
}

async function open(origin, from) {
  if (isOpen() || busy) return;
  busy = true;
  try {
    const e = await get();
    if (origin !== 'link') setHash();
    await e.open({ origin, tile: from || tile });
  } catch (err) {
    console.warn('[explorer] could not open', err);
    if (origin === 'tile' && tile) location.href = tile.href;   // fall back to the standalone page
  } finally { busy = false; }
}
// the button or Esc: go back through history when the open pushed an entry
function requestClose() {
  if (!isOpen()) return;
  if (pushed && location.hash === HASH) { pushed = false; history.back(); }   // popstate closes it
  else { clearHash(); ex.close(); }
}
// closed by any route: drop the #charger entry if it is still there
function onClosed() {
  if (location.hash !== HASH) return;
  if (pushed) { pushed = false; history.back(); } else clearHash();
}
addEventListener('popstate', () => {
  if (location.hash === HASH) { if (!isOpen()) open('link'); }
  else if (isOpen()) { pushed = false; ex.close(); }
});
addEventListener('hashchange', () => {
  if (location.hash === HASH && !isOpen()) open('link');
  else if (location.hash !== HASH && isOpen()) { pushed = false; ex.close(); }
});

// ---- the tile
if (tile) {
  tile.setAttribute('aria-haspopup', 'dialog');
  tile.addEventListener('click', e => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    open('tile', tile);
  });
  for (const ev of ['pointerenter', 'focus', 'touchstart']) tile.addEventListener(ev, prefetch, { passive: true, once: true });
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => { if (es.some(x => x.isIntersecting)) { io.disconnect(); prefetch(); } }, { rootMargin: '600px 0px' });
    io.observe(tile);
  }
}

// ---- the hero rocket (showreel/index.js: window.__reel.hitRocket, only while it rests)
const hero = document.querySelector('[data-hero]');
const reel = () => window.__reel && window.__reel.hitRocket ? window.__reel : null;
const skip = t => t.closest && t.closest('a, button, input, label, select, textarea, [data-menu], dialog');
if (hero) {
  document.addEventListener('click', e => {
    if (e.defaultPrevented || e.button !== 0 || isOpen() || skip(e.target)) return;
    const r = reel();
    if (r && r.hitRocket(e.clientX, e.clientY)) { e.preventDefault(); open('hero'); }
  });
  if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
    let px = 0, py = 0, queued = false, hot = false;
    const test = () => {
      queued = false;
      const r = reel(), on = !!(r && !isOpen() && r.hitRocket(px, py));
      if (on !== hot) { hot = on; hero.style.cursor = on ? 'pointer' : ''; if (on) prefetch(); }
    };
    hero.addEventListener('pointermove', e => { px = e.clientX; py = e.clientY; if (!queued) { queued = true; requestAnimationFrame(test); } }, { passive: true });
    hero.addEventListener('pointerleave', () => { if (hot) { hot = false; hero.style.cursor = ''; } });
  }
}

// the hero mounts after load and idle: keep it paused if the explorer is already open
addEventListener('reel:ready', e => { if (isOpen() && e.detail) e.detail.pause(); });

// deep link
if (location.hash === HASH) open('link');
// debug and tests
window.__explorer = { open: (o = 'tile') => open(o), close: requestClose, prefetch, get api() { return ex; }, get reduced() { return reduced.matches; } };
