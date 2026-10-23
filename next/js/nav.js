// PAGE NAVIGATION (every Studio page, the case pages, 404, privacy, hi). Loaded in the <head>,
// not deferred, so it runs before the first paint; styles are next/css/nav.css.
// Docs: docs/design/motion.md (Page transitions).
//
// 1. Land at the top. A fresh navigation (Navigation Timing type "navigate") starts at the top,
//    or at the #hash target when the address has one; Back and Forward keep the browser's own
//    restore. Inside a frame (the claude.ai preview runs the site in an iframe) the host page
//    keeps its own scroll across our navigations, which left you mid page or at the bottom, so
//    scrollIntoView brings the frame's top (or the target) back into view there too.
// 2. Shared media for the view transition (nav.css): the clicked album photo or work tile media
//    on the old page and the hero photo or stage media on the new one get the same
//    view-transition-name for one transition, so the picture grows into place. Back reverses it.
// 3. Entrance: html.nav-enter on a fresh navigation (nav.css rises the first block).
(() => {
  const root = document.documentElement;
  const navEntry = performance.getEntriesByType ? performance.getEntriesByType('navigation')[0] : null;
  const type = navEntry ? navEntry.type : 'navigate';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const shot = /[?&]shot/.test(location.search);
  let framed = false;
  try { framed = window.self !== window.top; } catch (e) { framed = true; }

  /* 1. land at the top */
  if (type === 'navigate') {
    let touched = false;
    const mark = () => { touched = true; };
    ['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach(t => addEventListener(t, mark, { passive: true, capture: true, once: true }));
    const target = () => {
      if (location.hash.length < 2) return null;
      try { return document.getElementById(decodeURIComponent(location.hash.slice(1))); } catch (e) { return null; }
    };
    const land = (late) => {
      if (touched || document.querySelector('dialog[open]')) return;
      const el = target();
      if (el) {
        // late: fonts and images have settled; go back to the target if the layout moved it
        const off = Math.abs(el.getBoundingClientRect().top - (parseFloat(getComputedStyle(el).scrollMarginTop) || 0));
        if (framed && !late || late && off > 8) el.scrollIntoView({ block: 'start', behavior: 'instant' });
      } else if (location.hash.length < 2) {
        if (framed && !late) root.scrollIntoView({ block: 'start', behavior: 'instant' });
        else if (scrollY) scrollTo(0, 0);
      }
    };
    document.addEventListener('DOMContentLoaded', () => land(false));
    addEventListener('load', () => {
      land(true);
      if (document.fonts) document.fonts.ready.then(() => land(true));
    });
  }

  /* 3. entrance (nav.css), fresh navigations only */
  if (type === 'navigate' && !reduced && !shot) {
    root.classList.add('nav-enter');
    setTimeout(() => root.classList.remove('nav-enter'), 1600);
  }

  /* 2. shared media */
  if (reduced || !('onpagereveal' in window)) return;
  const HERO = '.bhero__photo img, .stage__media';
  const MEDIA = '.tile__media, .nextp__media, img';
  const page = u => { const x = new URL(u, location.href); return x.origin + x.pathname.replace(/index\.html$/, ''); };
  const nameFor = u => (/\/beyond\.html$/.test(new URL(u, location.href).pathname) ? 'nav-photo' : 'nav-media');
  const inView = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.bottom > 0 && r.top < innerHeight; };
  const named = new Set();
  const clear = () => { named.forEach(el => { el.style.viewTransitionName = ''; el.style.transition = ''; el.style.transform = ''; }); named.clear(); };
  const give = (el, name) => {
    if (!el || !inView(el)) return false;
    el.style.viewTransitionName = name;
    named.add(el);
    if (name === 'nav-photo') {
      el.style.transition = 'none'; el.style.transform = 'none';   // drop the hover zoom
      // the photo's caption pill travels with it (otherwise the photo covers it until the end)
      const cap = el.closest('figure') && el.closest('figure').querySelector('figcaption');
      if (cap && inView(cap)) { cap.style.viewTransitionName = 'nav-cap'; named.add(cap); }
    }
    return true;
  };
  // the media of a link on this page that points at url (the clicked one first)
  const linkMedia = (url, first) => {
    const links = [...document.querySelectorAll('a[href]')].filter(a => page(a.href) === page(url));
    if (first && links.includes(first)) links.unshift(first);
    for (const a of links) { const m = a.querySelector(MEDIA); if (m && inView(m)) return m; }
    return null;
  };
  const ready = el => el && [...(el.matches('img') ? [el] : el.querySelectorAll('img'))].every(i => i.complete && i.naturalWidth) ? el : null;
  let clicked = null;
  addEventListener('click', e => { clicked = e.target.closest ? e.target.closest('a[href]') : null; }, true);

  // old page: name the picture we leave from
  addEventListener('pageswap', e => {
    clear();
    if (!e.viewTransition || !e.activation || !e.activation.entry) return;
    const to = e.activation.entry.url;
    if (page(to) === page(location.href)) return;
    give(linkMedia(to, clicked), nameFor(to)) || give(document.querySelector(HERO), nameFor(location.href));
  });

  // new page: name the picture we arrive at
  addEventListener('pagereveal', e => {
    clear();
    if (!e.viewTransition) return;
    const act = window.navigation && navigation.activation;
    const from = act && act.from && act.from.url;
    if (!from || page(from) === page(location.href)) return;
    // Back/Forward: only the link we left from, and only once its image has loaded (the browser
    // restores the scroll after this, so the hero would fly off screen, and a lazy image that is
    // not in yet would grow in as an empty box). Then it is the plain crossfade.
    const ok = act.navigationType === 'traverse'
      ? give(ready(linkMedia(from)), nameFor(from))
      : give(document.querySelector(HERO), nameFor(location.href));
    if (ok) root.classList.remove('nav-enter');   // the picture is the entrance
    e.viewTransition.finished.finally(clear);
  });
})();
