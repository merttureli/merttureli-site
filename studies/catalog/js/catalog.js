// The catalog of sample sites: lazy posters, frame stepping on hover and focus, filters by job, and the
// full-screen viewer (one iframe at a time, a width switch, the open sample named in the URL hash).
// No framework, no request leaves the page: every file is in this repository.
(() => {
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const hover = matchMedia('(hover: hover)');
  const narrow = matchMedia('(max-width: 760px)');
  const entries = $$('.entry'), keys = entries.map(e => e.dataset.key);

  /* ---------------------------------------------------------- posters */
  // An image's data-src becomes its src when its poster comes near the screen (frame 1 and the phone);
  // frames 2 to 4 load the first time the poster is hovered or focused.
  const fill = img => { if (img && img.dataset.src) { img.src = img.dataset.src; img.removeAttribute('data-src'); } };
  const missing = img => img.addEventListener('error', () => img.classList.add('is-broken'), { once: true });   // the tile's ground shows instead
  $$('.poster img').forEach(missing);
  const near = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
    near.unobserve(e.target);
    fill($('.poster__f', e.target)); fill($('.poster__phone img', e.target));
  }), { rootMargin: '240px 0px' });
  $$('.poster').forEach(p => near.observe(p));

  const STEP = 720; // ms a frame shows while a poster is hovered or focused
  function stepper(poster) {
    const frames = $$('.poster__f', poster), ticks = $$('.poster__ticks i', poster);
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
  const stops = $$('.poster').map(stepper);

  /* ---------------------------------------------------------- filters */
  const chips = $$('.chip'), count = $('[data-count]'), groups = $$('[data-group]'), bar = $('[data-filters]');
  function filter(kind, announce) {
    let shown = 0;
    chips.forEach(c => c.setAttribute('aria-pressed', String(c.dataset.kind === kind)));
    entries.forEach(e => { const on = kind === 'all' || e.dataset.kinds.split(' ').includes(kind); e.hidden = !on; if (on) shown++; });
    groups.forEach(g => { const n = $$('.entry', g).filter(e => !e.hidden).length; g.hidden = !n; $('.entries', g).classList.toggle('is-single', n === 1); });
    const label = chips.find(c => c.dataset.kind === kind).textContent.trim();
    count.textContent = kind === 'all' ? `${shown} sites` : `${shown} of ${entries.length} sites`;
    if (announce) {
      const first = groups.find(g => !g.hidden), top = first.getBoundingClientRect().top;
      if (top < bar.offsetHeight) window.scrollTo({ top: window.scrollY + top - bar.offsetHeight - 8, behavior: 'instant' });
      $('[data-announce]').textContent = `${label}: showing ${shown} of ${entries.length} sites`;
    }
  }
  chips.forEach(c => c.addEventListener('click', () => filter(c.dataset.kind, true)));
  filter('all', false);
  // the chip bar gets its hairline once it is stuck under the top of the screen
  const sentinel = document.createElement('div'); sentinel.setAttribute('aria-hidden', 'true'); bar.before(sentinel);
  new IntersectionObserver(([e]) => bar.classList.toggle('is-stuck', !e.isIntersecting)).observe(sentinel);

  /* ----------------------------------------------------------- viewer */
  const dialog = $('#viewer'), stage = $('[data-v-stage]'), holder = $('[data-v-frame]'), status = $('[data-v-status]');
  const sizeBtns = $$('.size', dialog), tab = $('[data-v-tab]', dialog), closeBtn = $('[data-v-close]', dialog);
  const WIDTHS = { tablet: 820, phone: 390 };
  let openKey = null, iframe = null, size = 'desktop', pushed = false, returnTo = null;

  const nameOf = key => $('.entry__name', $(`#e-${key}`)).textContent.trim();
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
    if (say) status.textContent = `${nameOf(openKey)} at ${s === 'desktop' ? 'desktop width' : WIDTHS[s] + ' pixels wide'}`;
  }
  sizeBtns.forEach(b => b.addEventListener('click', () => setSize(b.dataset.size, true)));
  new ResizeObserver(layout).observe(stage);

  function show(key) {
    if (openKey === key) return;
    const name = nameOf(key), src = `${key}/`;
    openKey = key;
    returnTo = $(`#e-${key} .poster`);
    $('[data-v-name]', dialog).textContent = name;
    $('[data-v-idx]', dialog).textContent = idxOf(key);
    tab.href = src; tab.setAttribute('aria-label', `Open ${name} in a new tab`);
    if (iframe) iframe.remove();
    iframe = document.createElement('iframe');
    iframe.title = `${name}, sample site`;
    iframe.addEventListener('load', () => { status.textContent = `${name} is open in the viewer`; });
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
    if (returnTo) { returnTo.focus({ preventScroll: false }); returnTo = null; }
  }
  // The hash is the truth: #<key> means that sample is open. Back closes the viewer.
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
    history.replaceState(null, '', location.pathname + location.search); hide();
  }
  $$('[data-open]').forEach(a => a.addEventListener('click', e => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;   // a new tab still gets the page itself
    e.preventDefault(); stops.forEach(s => s()); open(a.dataset.open);
  }));
  // the name and the facts open the same sample by pointer; the keyboard has the poster
  entries.forEach(e => $('.entry__name', e).addEventListener('click', () => open(e.dataset.key)));
  closeBtn.addEventListener('click', close);
  dialog.addEventListener('cancel', e => { e.preventDefault(); close(); });
  addEventListener('popstate', sync);
  addEventListener('hashchange', sync);
  if (narrow.matches) setSize('phone', false); else setSize('desktop', false);
  if (keys.includes(location.hash.slice(1))) {                 // a shared link opens its sample at once
    const key = location.hash.slice(1);
    $(`#e-${key}`).scrollIntoView({ block: 'center', behavior: 'instant' });
    sync();
  }
})();
