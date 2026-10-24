// VIEWER launcher: the only part loaded with the page (a few KB). Docs: docs/recipes/viewer.md.
//
// Opens a product's 3D viewer in place, growing from what was clicked:
//   home    the CHARGER explorer tile ([data-explorer-link], its href stays as the no-JS
//           fallback), the hero rocket while it rests, and the small "3D" button on a work
//           tile (<button class="tile__3d" data-viewer="<slug>" hidden>, a sibling of the
//           tile's link, so the rest of the tile still opens the case page)
//   case    the live 3D stage, or its "Explore in 3D" button (<button class="stage__3d"
//           data-viewer="<slug>" hidden> inside .stage__card)
// Buttons ship hidden and are shown here (no JS or no WebGL: no button).
// Addresses: home #3d-<slug> (CHARGER keeps #charger), case pages #explore. Shareable:
// loading one opens the viewer directly. Back or Esc closes it and the page is where it was.
// The shell (viewer.js), its CSS and the product config are fetched when a trigger comes near
// the viewport; the model when it is hovered, focused or touched (or near, for an `eager`
// product), or on the first open. While a viewer is open the hero showreel and any case stage
// are paused. Modified clicks (new tab) keep the fallback link.
import { PRODUCTS } from './products/index.js';

const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const isCase = !!document.querySelector('.stage__card [data-viewer]');
const hashOf = slug => (isCase ? '#explore' : PRODUCTS[slug].hash || '#3d-' + slug);
const slugOfHash = hash => Object.keys(PRODUCTS).find(s => known.has(s) && hashOf(s) === hash);
const known = new Set();              // products with a trigger on this page
const sources = new Map();            // slug -> { el (grows), focus (gets focus back), href? }
const V = new Map();                  // slug -> { mod, ex, warmP }
let cssP = null, current = null, pushed = false, busy = false;

function webgl() {
  try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch (e) { return false; }
}
function css() {
  if (!cssP) cssP = new Promise(res => {
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = new URL('../../css/viewer.css', import.meta.url).href;
    l.onload = l.onerror = () => res();
    document.head.append(l);
  });
  return cssP;
}
// pause these while a viewer is open: the hero showreel and any live case stage
const hosts = () => [window.__reel, ...Object.values(window.__caseStages || {}).map(s => (s.hold ? { pause: () => s.hold(true), resume: () => s.hold(false) } : null))];
const hooks = slug => ({ onRequestClose: requestClose, onClosed, hosts });
function entry(slug) {
  if (!V.has(slug)) V.set(slug, { mod: null, ex: null, data: false });
  return V.get(slug);
}
// the code (shell, config, CSS); `data` also fetches the model and builds the scene graph on idle
function prefetch(slug, data = false) {
  const E = entry(slug);
  if (!E.mod) {
    css();
    E.mod = Promise.all([import('./viewer.js'), PRODUCTS[slug].load()]).then(([shell, m]) => ({ shell, config: m.default }));
    E.mod.catch(err => console.warn('[viewer] unavailable', slug, err));
  }
  if (data && !E.data) {
    E.data = true;
    E.mod.then(({ shell, config }) => {
      if (config.prefetch) config.prefetch();
      // build the scene graph while the main thread is free (no renderer yet)
      const idle = window.requestIdleCallback || (f => setTimeout(f, 300));
      idle(() => { if (!E.ex) E.ex = shell.createViewer(config, hooks(slug)); E.ex.warm().catch(() => {}); }, { timeout: 3000 });
    }).catch(() => {});
  }
  return E.mod;
}
async function get(slug) {
  const E = entry(slug);
  const { shell, config } = await prefetch(slug, true);
  await css();
  if (!E.ex) E.ex = shell.createViewer(config, hooks(slug));
  return E.ex;
}

const isOpen = () => !!(current && current.ex && current.ex.isOpen);
function setHash(hash) {
  if (location.hash === hash) return;
  try { history.pushState({ cx: 1 }, '', hash); pushed = true; }
  catch (e) { pushed = false; }   // sandboxed preview: no history entry, Esc and the button still close
}
function clearHash(hash) {
  if (location.hash !== hash) return;
  try { history.replaceState(history.state && history.state.cx ? null : history.state, '', location.pathname + location.search); } catch (e) { /* keep the hash */ }
}

async function open(slug, origin = 'tile') {
  if (!PRODUCTS[slug] || isOpen() || busy) return;
  busy = true;
  const src = sources.get(slug) || {};
  try {
    const ex = await get(slug);
    current = { slug, ex, hash: hashOf(slug) };
    if (origin !== 'link') setHash(current.hash);
    await ex.open({ origin, tile: origin === 'tile' ? src.el : null, focus: origin === 'tile' ? src.focus : null });
  } catch (err) {
    console.warn('[viewer] could not open', slug, err);
    if (origin === 'tile' && src.href) location.href = src.href;   // fall back to the link's own page
  } finally { busy = false; }
}
// the button or Esc: go back through history when the open pushed an entry
function requestClose() {
  if (!isOpen()) return;
  if (pushed && location.hash === current.hash) { pushed = false; history.back(); }   // popstate closes it
  else { clearHash(current.hash); current.ex.close(); }
}
// closed by any route: drop the hash entry if it is still there
function onClosed() {
  const hash = current && current.hash;
  if (!hash || location.hash !== hash) return;
  if (pushed) { pushed = false; history.back(); } else clearHash(hash);
}
function route() {
  const slug = slugOfHash(location.hash);
  if (isOpen() && (!slug || slug !== current.slug)) { pushed = false; current.ex.close(); }
  else if (slug && !isOpen()) open(slug, 'link');
}
addEventListener('popstate', route);
addEventListener('hashchange', route);

// ---- triggers
const plain = e => !(e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey);
function watch(slug, el) {
  for (const ev of ['pointerenter', 'focus', 'touchstart']) el.addEventListener(ev, () => prefetch(slug, true), { passive: true, once: true });
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => { if (es.some(x => x.isIntersecting)) { io.disconnect(); prefetch(slug, !!PRODUCTS[slug].eager); } }, { rootMargin: '600px 0px' });
    io.observe(el);
  }
}
// the CHARGER explorer tile: the link itself grows
const tile = document.querySelector('[data-explorer-link]');
if (tile && PRODUCTS.charger) {
  known.add('charger');
  sources.set('charger', { el: tile, focus: tile, href: tile.href });
  tile.setAttribute('aria-haspopup', 'dialog');
  tile.addEventListener('click', e => {
    if (!plain(e)) return;
    e.preventDefault();
    open('charger', 'tile');
  });
  watch('charger', tile);
}
// "3D" buttons on work tiles and on a case stage
const gl = webgl();
for (const b of document.querySelectorAll('button[data-viewer]')) {
  const slug = b.dataset.viewer;
  if (!PRODUCTS[slug] || !gl) continue;
  const card = b.closest('.stage__card');
  const t = b.closest('.tile');
  const el = card || (t && (t.querySelector('.tile__link') || t)) || b;
  known.add(slug);
  if (!sources.has(slug) || card) sources.set(slug, { el, focus: b });
  b.hidden = false;
  b.setAttribute('aria-haspopup', 'dialog');
  b.addEventListener('click', e => { if (!plain(e)) return; e.preventDefault(); e.stopPropagation(); sources.set(slug, { el, focus: b }); open(slug, 'tile'); });
  watch(slug, b);
  // the case page: a click anywhere on the live stage opens it too
  const stageEl = card && card.querySelector('.stage__live');
  if (stageEl) {
    stageEl.classList.add('is-viewer');
    stageEl.addEventListener('click', e => { if (!plain(e)) return; sources.set(slug, { el, focus: b }); open(slug, 'tile'); });
    stageEl.addEventListener('pointerenter', () => prefetch(slug, true), { passive: true, once: true });
  }
}

// ---- the hero rocket (showreel/index.js: window.__reel.hitRocket, only while it rests): CHARGER
const hero = document.querySelector('[data-hero]');
const reel = () => window.__reel && window.__reel.hitRocket ? window.__reel : null;
const skip = t => t.closest && t.closest('a, button, input, label, select, textarea, [data-menu], dialog');
if (hero && PRODUCTS.charger) {
  known.add('charger');
  document.addEventListener('click', e => {
    if (e.defaultPrevented || e.button !== 0 || isOpen() || skip(e.target)) return;
    const r = reel();
    if (r && r.hitRocket(e.clientX, e.clientY)) { e.preventDefault(); open('charger', 'hero'); }
  });
  if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
    let px = 0, py = 0, queued = false, hot = false;
    const test = () => {
      queued = false;
      const r = reel(), on = !!(r && !isOpen() && r.hitRocket(px, py));
      if (on !== hot) { hot = on; hero.style.cursor = on ? 'pointer' : ''; if (on) prefetch('charger', true); }
    };
    hero.addEventListener('pointermove', e => { px = e.clientX; py = e.clientY; if (!queued) { queued = true; requestAnimationFrame(test); } }, { passive: true });
    hero.addEventListener('pointerleave', () => { if (hot) { hot = false; hero.style.cursor = ''; } });
  }
}

// the hero mounts after load and idle: keep it paused if a viewer is already open
addEventListener('reel:ready', e => { if (isOpen() && e.detail) e.detail.pause(); });

// deep link
if (slugOfHash(location.hash)) open(slugOfHash(location.hash), 'link');
// debug and tests
window.__viewer = {
  open: (slug, o = 'tile') => open(slug, o), close: requestClose, prefetch: slug => prefetch(slug, true),
  api: slug => (V.get(slug) || {}).ex || null, get current() { return current && current.slug; }, get products() { return [...known]; },
  get reduced() { return reduced.matches; },
};
// the CHARGER explorer's own handle, kept for its tests and captures
if (known.has('charger')) window.__explorer = { open: (o = 'tile') => open('charger', o), close: requestClose, prefetch: () => prefetch('charger', true), get api() { return (V.get('charger') || {}).ex || null; }, get reduced() { return reduced.matches; } };
