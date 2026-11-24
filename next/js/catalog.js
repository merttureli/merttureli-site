// STUDIO websites page, section #studies: the catalog of sample sites. Styles: next/css/catalog.css.
// Lazy posters, frame stepping on hover and keyboard focus, filters by job, and the full-screen viewer
// dialog (one iframe at a time, created only when a page is opened, at Desktop, Tablet 820 or Phone 390).
// Deep links: websites.html#<key> (for example #vireo) opens that page in the viewer; the keys are the
// folder names under studies/ and none of them is a section id on this page. Back closes the viewer.
// Every page's URL is its poster's href, so the build's path rewriting covers it (next/ and the root).
// No framework, no request leaves the site.
(() => {
  const root = document.querySelector('[data-catalog]'), dialog = document.getElementById('catalog-viewer');
  if (!root || !dialog) return;
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const hover = matchMedia('(hover: hover)');
  const narrow = matchMedia('(max-width: 760px)');
  const entries = $$('.cat-entry', root), keys = entries.map(e => e.dataset.key);

  /* ---------------------------------------------------------- posters */
  // An image's data-src becomes its src when its poster comes near the screen (frame 1 and the phone);
  // frames 2 to 4 load the first time the poster is hovered or focused.
  const fill = img => { if (img && img.dataset.src) { img.src = img.dataset.src; img.removeAttribute('data-src'); } };
  $$('.cat-poster img', root).forEach(img => img.addEventListener('error', () => img.classList.add('is-broken'), { once: true }));
  const near = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
    near.unobserve(e.target);
    fill($('.cat-poster__f', e.target)); fill($('.cat-poster__phone img', e.target));
  }), { rootMargin: '240px 0px' });
  $$('.cat-poster', root).forEach(p => near.observe(p));

  const STEP = 720; // ms a frame shows while a poster is hovered or focused
  function stepper(poster) {
    const frames = $$('.cat-poster__f', poster), ticks = $$('.cat-poster__ticks i', poster);
    let i = 0, timer = 0, on = 0;
    const show = n => { i = n; frames.forEach((f, k) => f.classList.toggle('is-on', k === n)); ticks.forEach((t, k) => t.classList.toggle('is-on', k === n)); };
    const next = () => {
      const n = (i + 1) % frames.length, f = frames[n];
      if (f.complete && f.naturalWidth) show(n);                     // a frame that has not arrived is waited for
      timer = setTimeout(next, STEP);
    };
    const start = () => {
      if (++on > 1 || reduce.matches) return;
      frames.forEach(fill); poster.classList.add('is-stepping');
      ticks[0] && ticks[0].classList.add('is-on');
      timer = setTimeout(next, STEP / 2);
    };
    const stop = () => { if (on > 0 && --on > 0) return; on = 0; clearTimeout(timer); poster.classList.remove('is-stepping'); show(0); ticks.forEach(t => t.classList.remove('is-on')); };
    poster.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse' && hover.matches) start(); });
    poster.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') stop(); });
    poster.addEventListener('focus', () => { if (poster.matches(':focus-visible')) start(); });
    poster.addEventListener('blur', stop);
    return stop;
  }
  const stops = $$('.cat-poster', root).map(stepper);

  /* ---------------------------------------------------------- filters */
  const chips = $$('.cat-chip', root), count = $('[data-count]', root), groups = $$('[data-group]', root), bar = $('[data-filters]', root);
  const lnav = $('[data-lnav]');
  function filter(kind, announce) {
    let shown = 0;
    chips.forEach(c => c.setAttribute('aria-pressed', String(c.dataset.kind === kind)));
    entries.forEach(e => { const on = kind === 'all' || e.dataset.kinds.split(' ').includes(kind); e.hidden = !on; if (on) shown++; });
    groups.forEach(g => { const n = $$('.cat-entry', g).filter(e => !e.hidden).length; g.hidden = !n; $('.cat-entries', g).classList.toggle('is-single', n === 1); });
    const label = chips.find(c => c.dataset.kind === kind).textContent.trim();
    count.textContent = kind === 'all' ? `${shown} sites` : `${shown} of ${entries.length} sites`;
    if (announce) {
      // keep the first group that is left just under the filters when it would be above them
      const first = groups.find(g => !g.hidden), top = first.getBoundingClientRect().top;
      const under = (lnav ? lnav.offsetHeight : 0) + bar.offsetHeight;
      if (top < under) window.scrollTo({ top: window.scrollY + top - under - 8, behavior: 'instant' });
      $('[data-announce]', root).textContent = `${label}: showing ${shown} of ${entries.length} sites`;
    }
  }
  chips.forEach(c => c.addEventListener('click', () => filter(c.dataset.kind, true)));
  filter('all', false);
  // the chip bar gets its hairline once it is stuck under the section bar (read on scroll: an observer
  // misses an anchor jump that carries the bar from below the screen straight to stuck)
  let ticking = false;
  const stuck = () => {
    ticking = false;
    const r = bar.getBoundingClientRect(), at = lnav ? lnav.getBoundingClientRect().bottom : 0;
    bar.classList.toggle('is-stuck', r.top <= at + 1);
  };
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(stuck); } }, { passive: true });
  stuck();

  /* ----------------------------------------------------------- viewer */
  const stage = $('[data-v-stage]', dialog), holder = $('[data-v-frame]', dialog), status = $('[data-v-status]', dialog);
  const sizeBtns = $$('.cview__size', dialog), tab = $('[data-v-tab]', dialog), closeBtn = $('[data-v-close]', dialog);
  const urlEl = $('[data-v-url]', dialog), tagEl = $('[data-v-tag]', dialog);
  const WIDTHS = { tablet: 820, phone: 390 };
  let openKey = null, iframe = null, size = 'desktop', pushed = false, returnTo = null;

  const entryOf = key => $(`#e-${key}`, root);
  const nameOf = key => $('.cat-entry__name', entryOf(key)).textContent.trim();
  const srcOf = key => $('.cat-poster', entryOf(key)).getAttribute('href');
  const isSample = key => !entryOf(key).dataset.kinds.split(' ').includes('redesign');
  const idxOf = key => String(keys.indexOf(key) + 1).padStart(2, '0');

  function layout() {
    if (!iframe) return;
    const sw = stage.clientWidth, sh = stage.clientHeight, pad = size === 'desktop' ? 0 : (narrow.matches ? 12 : 28);
    const roomW = sw - pad * 2, roomH = sh - pad * 2;
    const w = size === 'desktop' ? Math.max(sw, 1280) : WIDTHS[size];
    const scale = Math.min(1, roomW / w);
    const boxW = Math.round(w * scale), boxH = size === 'desktop' ? sh : roomH;
    holder.style.width = boxW + 'px'; holder.style.height = boxH + 'px'; holder.style.top = (size === 'desktop' ? 0 : pad) + 'px';
    iframe.style.width = w + 'px'; iframe.style.height = Math.round(boxH / scale) + 'px';
    iframe.style.transform = scale < 1 ? `scale(${scale})` : '';
    dialog.classList.toggle('is-scaled', scale < 1 && size !== 'desktop');
  }
  function setSize(s, say) {
    size = s; dialog.dataset.size = s;
    sizeBtns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.size === s)));
    layout();
    if (say && openKey) status.textContent = `${nameOf(openKey)} at ${s === 'desktop' ? 'desktop width' : WIDTHS[s] + ' pixels wide'}`;
  }
  sizeBtns.forEach(b => b.addEventListener('click', () => setSize(b.dataset.size, true)));
  new ResizeObserver(layout).observe(stage);

  // Escape inside the framed page closes the viewer too, unless that page has a dialog of its own open
  function escapeFrom(frame) {
    try {
      frame.contentWindow.addEventListener('keydown', e => {
        if (e.key !== 'Escape') return;
        const doc = frame.contentDocument;
        if (doc && doc.querySelector('dialog[open], [aria-modal="true"]:not([hidden])')) return;
        close();
      }, true);
    } catch (err) { /* another origin: the dialog's own Escape still works once focus is back in the bar */ }
  }

  function show(key) {
    if (openKey === key) return;
    const name = nameOf(key), src = srcOf(key), sample = isSample(key);
    openKey = key;
    returnTo = $('.cat-poster', entryOf(key));
    $('[data-v-name]', dialog).textContent = name;
    $('[data-v-idx]', dialog).textContent = idxOf(key);
    urlEl.textContent = `/studies/${key}/`;
    tagEl.hidden = !sample;
    tab.href = src; tab.setAttribute('aria-label', `Open ${name} in a new tab`);
    if (iframe) iframe.remove();
    iframe = document.createElement('iframe');
    iframe.title = sample ? `${name}, sample site` : `${name}, redesign of this site`;
    iframe.addEventListener('load', () => { escapeFrom(iframe); status.textContent = `${name} is open in the viewer`; });
    iframe.src = src;
    holder.replaceChildren(iframe);
    document.documentElement.classList.add('is-viewing');
    if (!dialog.open) dialog.showModal();
    setSize(size, false);
    (sizeBtns.find(b => b.getAttribute('aria-pressed') === 'true') || closeBtn).focus();
  }
  function hide() {
    if (!openKey) return;
    openKey = null;
    if (iframe) { iframe.remove(); iframe = null; }
    holder.replaceChildren();
    if (dialog.open) dialog.close();
    document.documentElement.classList.remove('is-viewing');
    status.textContent = '';
    // focus goes back to the poster; Back to an address with a #section moves focus to that section
    // after popstate, so it is set again a moment later
    const back = returnTo; returnTo = null;
    if (back) {
      back.focus({ preventScroll: true });
      setTimeout(() => { if (!dialog.open && document.activeElement !== back) back.focus({ preventScroll: true }); }, 80);
    }
  }
  // The hash is the truth: #<key> means that page is open. Any other hash (a section) leaves it closed.
  function sync() {
    const key = decodeURIComponent(location.hash.slice(1));
    if (keys.includes(key)) show(key); else hide();
  }
  function open(key) {
    history.pushState({ catalog: key }, '', '#' + key); pushed = true; sync();
  }
  function close() {
    if (!openKey) return;
    if (pushed && history.state && history.state.catalog) { pushed = false; history.back(); return; }   // popstate then hides it
    history.replaceState(null, '', location.pathname + location.search + '#studies'); hide();
  }
  $$('[data-open]', root).forEach(a => a.addEventListener('click', e => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;   // a new tab still gets the page itself
    e.preventDefault(); stops.forEach(s => s()); open(a.dataset.open);
  }));
  // the name opens the same page by pointer; the keyboard has the poster
  entries.forEach(e => $('.cat-entry__name', e).addEventListener('click', () => open(e.dataset.key)));
  closeBtn.addEventListener('click', close);
  dialog.addEventListener('cancel', e => { e.preventDefault(); close(); });
  addEventListener('popstate', sync);
  addEventListener('hashchange', sync);
  setSize(narrow.matches ? 'phone' : 'desktop', false);
  if (keys.includes(location.hash.slice(1))) {                 // a shared link opens its page at once
    entryOf(location.hash.slice(1)).scrollIntoView({ block: 'center', behavior: 'instant' });
    sync();
  }
})();
