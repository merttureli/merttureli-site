// STUDIO Beyond page: the photo grid and the in-place viewer.
// The photos are the JSON list in beyond.html (#beyond-photos), one line each; the files are
// next/assets/img/beyond/<name>-<width>.webp from `python3 tools/media.py image SRC --preset beyond`
// (docs/recipes/beyond-photos.md). The viewer grows out of the clicked photo (FLIP: transform and
// clip-path on one <img>), adds a history entry so the back button closes it, and returns focus to
// the photo. Arrow keys, the buttons and a horizontal swipe move through the photos; Esc, Close,
// a click beside the photo or a swipe down close it. Reduced motion: no growing, sliding or fading.
(() => {
  const script = document.currentScript;
  const data = document.getElementById('beyond-photos');
  const grid = document.querySelector('[data-photos]');
  const dlg = document.getElementById('viewer');
  if (!data || !grid || !dlg) return;
  let photos = [];
  try { photos = JSON.parse(data.textContent); } catch (e) { return; }
  photos = photos.filter(p => p && p.name && p.w > 0 && p.h > 0);
  const n = photos.length;
  if (!n) return;

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const WIDTHS = [480, 960, 1280, 1920];   // the "beyond" preset in tools/media.py; keep in step
  // image folder, relative to this script so the page works from next/ or a root twin
  const base = new URL('../assets/img/beyond/', script && script.src ? script.src : location.href).href;
  const widths = p => { const ws = WIDTHS.filter(w => w <= p.w); return ws.length ? ws : [p.w]; };
  const url = (p, w) => base + encodeURIComponent(p.name) + '-' + w + '.webp';
  const srcset = p => widths(p).map(w => url(p, w) + ' ' + w + 'w').join(', ');
  const pad = k => String(k).padStart(2, '0');
  const css = getComputedStyle(document.documentElement);
  const ms = name => { const v = css.getPropertyValue(name).trim(); return v.endsWith('ms') ? parseFloat(v) : parseFloat(v) * 1000 || 0; };
  const EASE = css.getPropertyValue('--ease').trim() || 'ease-out';
  const T_FLIP = ms('--dur-700'), T_FADE = ms('--dur-500'), T_OUT = ms('--dur-250'), T_SNAP = ms('--dur-400');

  /* ------------------------------------------------------------ the grid */
  const items = photos.map((p, i) => {
    const li = document.createElement('li');
    li.className = 'shot';
    li.id = 'photo-' + p.name;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'shot__btn';
    btn.setAttribute('aria-haspopup', 'dialog');
    const img = document.createElement('img');
    img.alt = p.alt || '';
    img.width = p.w;
    img.height = p.h;
    img.loading = 'lazy';
    img.decoding = 'async';
    img.sizes = '(max-width: 760px) 50vw, 25vw';
    img.srcset = srcset(p);
    img.src = url(p, widths(p)[0]);
    const cap = document.createElement('span');
    cap.className = 'shot__cap label';
    cap.textContent = pad(i + 1) + (p.caption ? ' / ' + p.caption : '');
    btn.append(img, cap);
    li.append(btn);
    btn.addEventListener('click', () => open(i));
    return { li, btn, img, p, base: p.w / p.h > 1.2 ? 2 : 1, span: 1 };
  });
  grid.replaceChildren(...items.map(it => it.li));
  const count = document.querySelector('[data-photo-count]');
  if (count) count.textContent = pad(n) + (n === 1 ? ' photograph' : ' photographs');

  // Fill every row: a landscape photo that does not fit the rest of a row widens the photo
  // before it; the last row's spare cells are shared from the end. Order never changes.
  let cols = 0;
  function layout() {
    const c = Math.max(1, parseInt(getComputedStyle(grid).getPropertyValue('--cols'), 10) || 1);
    const gap = parseFloat(getComputedStyle(grid).columnGap) || 0;
    const colW = (grid.clientWidth - gap * (c - 1)) / c;
    items.forEach(it => { it.span = Math.min(it.base, c); });
    let used = 0, rowStart = 0;
    items.forEach((it, k) => {
      if (used + it.span > c) { items[k - 1].span += c - used; used = 0; rowStart = k; }
      if (used === 0) rowStart = k;
      used += it.span;
      if (used === c) used = 0;
    });
    items.forEach(it => { it.start = 0; });
    if (used) {
      // widen from the end, each photo to at most twice its own width (a portrait never becomes a
      // thin strip); what is still spare centers the row
      const row = items.slice(rowStart);
      let spare = c - used;
      for (let grew = true; spare > 0 && grew;) {
        grew = false;
        for (let k = row.length - 1; k >= 0 && spare > 0; k--) {
          if (row[k].span < Math.min(c, row[k].base * 2)) { row[k].span++; spare--; grew = true; }
        }
      }
      if (spare > 1) row[0].start = 1 + Math.floor(spare / 2);
    }
    items.forEach(it => {
      it.li.style.setProperty('--span', it.span);
      if (it.start) it.li.style.setProperty('--start', it.start); else it.li.style.removeProperty('--start');
      it.img.sizes = Math.ceil(colW * it.span + gap * (it.span - 1)) + 'px';
    });
    cols = c;
  }
  layout();

  /* ---------------------------------------------------------- the viewer */
  const $ = s => dlg.querySelector(s);
  const bg = $('[data-lb-bg]'), stage = $('[data-lb-stage]'), view = $('[data-lb-img]');
  const chrome = [...dlg.querySelectorAll('[data-lb-chrome]')];
  const closeBtn = $('[data-lb-close]'), status = $('[data-lb-status]');
  let cur = -1, isOpen = false, closing = false, pushed = false, token = 0, closeDy = 0;
  const hiCache = new Map();

  const fit = p => {
    const r = stage.getBoundingClientRect();
    const cs = getComputedStyle(stage);
    const w = Math.max(1, r.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight));
    const h = Math.max(1, r.height);
    const s = Math.min(w / p.w, h / p.h, 2);   // contain; a small file is never blown up past 2x
    return { w: Math.round(p.w * s), h: Math.round(p.h * s) };
  };
  function sizeView() {
    if (cur < 0) return;
    const f = fit(photos[cur]);
    view.style.width = f.w + 'px';
    view.style.height = f.h + 'px';
  }
  function loadHi(i) {
    const k = (i + n) % n;
    if (hiCache.has(k)) return hiCache.get(k);
    const p = photos[k], im = new Image();
    im.decoding = 'async';
    im.sizes = Math.ceil(fit(p).w) + 'px';
    im.srcset = srcset(p);
    im.src = url(p, widths(p).slice(-1)[0]);
    const pr = (im.decode ? im.decode() : new Promise((res, rej) => { im.onload = res; im.onerror = rej; }))
      .then(() => im.currentSrc || im.src)
      .catch(() => { hiCache.delete(k); return null; });
    hiCache.set(k, pr);
    return pr;
  }
  function text(i) {
    const p = photos[i];
    $('[data-lb-count]').textContent = pad(i + 1) + ' / ' + pad(n);
    $('[data-lb-cap]').textContent = p.caption || '';
    $('[data-lb-alt]').textContent = p.alt || '';
    view.alt = p.alt || '';
    status.textContent = 'Photograph ' + (i + 1) + ' of ' + n + (p.alt ? '. ' + p.alt : '');
  }
  const stop = () => [view, bg, ...chrome].forEach(el => el.getAnimations().forEach(a => a.cancel()));
  const onScreen = r => r.width > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
  const hashFor = i => '#photo-' + photos[i].name;
  const indexFromHash = () => {
    const m = /^#photo-(.+)$/.exec(location.hash);
    if (!m) return -1;
    const name = decodeURIComponent(m[1]);
    return photos.findIndex(p => p.name === name);
  };

  // the transform + clip that puts the full photo exactly over the (cropped, rounded) tile
  function flipFrom(it, dy = 0) {
    const t = it.img.getBoundingClientRect(), f = view.getBoundingClientRect();
    if (!onScreen(t) || !f.width) return null;
    const r = it.p.w / it.p.h;
    let cw = t.width, ch = t.width / r;
    if (ch < t.height) { ch = t.height; cw = ch * r; }
    const s = cw / f.width;
    const dx = t.left + t.width / 2 - (f.left + f.width / 2);
    const dyy = t.top + t.height / 2 - (f.top + f.height / 2);
    const ix = (cw - t.width) / 2 / s, iy = (ch - t.height) / 2 / s;
    const rad = (parseFloat(getComputedStyle(it.btn).borderTopLeftRadius) || 0) / s;
    return [
      { transform: `translate(${dx}px, ${dyy}px) scale(${s})`, clipPath: `inset(${iy}px ${ix}px round ${rad}px)` },
      { transform: `translate(0px, ${dy}px) scale(1)`, clipPath: 'inset(0px 0px round 0px)' }
    ];
  }

  async function open(i, opts = {}) {
    if (closing) return;
    if (isOpen) return show(i);
    const it = items[i];
    cur = i;
    isOpen = true;
    const my = ++token;
    text(i);
    view.style.translate = '';
    view.removeAttribute('srcset');
    view.src = it.img.currentSrc || it.img.src;   // the tile's file is in the cache: no wait
    try { await view.decode(); } catch (e) { /* draws when it arrives */ }
    if (my !== token || !isOpen) return;
        dlg.showModal();
    sizeView();
    if (opts.push !== false) {
      history.pushState({ beyond: photos[i].name }, '', hashFor(i));
      pushed = true;
    }
    closeBtn.focus({ preventScroll: true });
    const kf = !reduced && !opts.instant && flipFrom(it);
    if (kf) {
      it.li.classList.add('is-lifted');
      const a = view.animate(kf, { duration: T_FLIP, easing: EASE });
      bg.animate([{ opacity: 0 }, { opacity: 1 }], { duration: T_FLIP * .8, easing: 'linear' });
      chrome.forEach(el => el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: T_FADE, delay: T_FLIP * .35, easing: EASE, fill: 'backwards' }));
      a.finished.catch(() => {}).then(() => it.li.classList.remove('is-lifted'));
    }
    upgrade(i, my);
    loadHi(i + 1); loadHi(i - 1);
  }

  function upgrade(i, my) {
    loadHi(i).then(src => { if (src && my === token && cur === i && isOpen) view.src = src; });
  }

  async function show(i, dir, fromX = 0) {
    i = (i + n) % n;
    if (!isOpen || closing || i === cur) return;
    if (dir === undefined) dir = i > cur ? 1 : -1;
    const my = ++token;
    cur = i;
    text(i);
    if (pushed || location.hash) history.replaceState(pushed ? { beyond: photos[i].name } : history.state, '', hashFor(i));
    const src = loadHi(i);
    loadHi(i + dir);
    if (!reduced) {
      stop();
      view.style.translate = '';
      const out = view.animate([{ transform: `translateX(${fromX}px)`, opacity: 1 },
        { transform: `translateX(${fromX - dir * Math.max(60, innerWidth * .08)}px)`, opacity: 0 }],
        { duration: T_OUT, easing: 'linear', fill: 'forwards' });
      await Promise.all([out.finished.catch(() => {}), src]);
    }
    const s = await src;
    if (my !== token || !isOpen) return;
    stop();
    view.style.translate = '';
    view.src = s || url(photos[i], widths(photos[i])[0]);
    sizeView();
    try { await view.decode(); } catch (e) { /* ignore */ }
    if (my !== token || !isOpen) return;
    if (!reduced) view.animate([{ transform: `translateX(${dir * 48}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: T_FADE, easing: EASE });
  }

  function requestClose() {
    if (!isOpen || closing) return;
    if (pushed && history.state && history.state.beyond) history.back();   // popstate runs finishClose
    else finishClose();
  }

  function finishClose(dy = 0) {
    if (!isOpen || closing) return;
    closing = true;
    ++token;
    const it = items[cur];
    const r = it.btn.getBoundingClientRect();
    if (!onScreen(r) || r.top < 0 || r.bottom > innerHeight) it.btn.scrollIntoView({ block: 'center', behavior: 'instant' });
    stop();
    view.style.translate = '';
    const kf = !reduced && flipFrom(it, dy);
    const done = () => {
      it.li.classList.remove('is-lifted');
      isOpen = false; closing = false; pushed = false;
      if (dlg.open) dlg.close();
      stop();
      if (indexFromHash() >= 0) history.replaceState(null, '', location.pathname + location.search);
      it.btn.focus({ preventScroll: true });
    };
    if (!kf) return done();
    it.li.classList.add('is-lifted');
    const a = view.animate([kf[1], kf[0]], { duration: T_FLIP * .85, easing: EASE, fill: 'forwards' });
    bg.animate([{ opacity: 1 }, { opacity: 0 }], { duration: T_FLIP * .7, easing: 'linear', fill: 'forwards' });
    chrome.forEach(el => el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: T_OUT, easing: 'linear', fill: 'forwards' }));
    a.finished.catch(() => {}).then(done);
  }

  // the page behind stays put while the viewer is open (no overflow lock, so nothing shifts)
  const hold = e => { if (e.cancelable) e.preventDefault(); };
  dlg.addEventListener('wheel', hold, { passive: false });
  dlg.addEventListener('touchmove', hold, { passive: false });
  closeBtn.addEventListener('click', requestClose);
  $('[data-lb-prev]').addEventListener('click', () => show(cur - 1, -1));
  $('[data-lb-next]').addEventListener('click', () => show(cur + 1, 1));
  dlg.addEventListener('cancel', e => { e.preventDefault(); requestClose(); });
  // a close the page did not ask for (the browser force-closes after repeated Esc): tidy up
  dlg.addEventListener('close', () => {
    if (!isOpen || closing) return;
    const back = pushed && history.state && history.state.beyond;
    isOpen = false; pushed = false; ++token; stop();
    items[cur].li.classList.remove('is-lifted');
    items[cur].btn.focus({ preventScroll: true });
    if (back) history.back();
  });
  dlg.addEventListener('keydown', e => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); show(cur + 1, 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); show(cur - 1, -1); }
    else if (e.key === 'Home') { e.preventDefault(); show(0, -1); }
    else if (e.key === 'End') { e.preventDefault(); show(n - 1, 1); }
  });

  // back and forward buttons: the hash says which photo, if any, is open
  addEventListener('popstate', () => {
    const i = indexFromHash();
    if (i < 0) { if (isOpen) { pushed = false; finishClose(closeDy); closeDy = 0; } return; }
    if (isOpen) show(i);
    else open(i, { push: false, instant: true });
  });

  /* swipe: sideways moves, down closes; a tap beside the photo closes */
  let drag = null;
  stage.addEventListener('pointerdown', e => {
    if (!isOpen || closing || e.button > 0) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), dx: 0, dy: 0, axis: '', onImg: e.target === view };
    stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    drag.dx = e.clientX - drag.x;
    drag.dy = e.clientY - drag.y;
    if (!drag.axis && Math.hypot(drag.dx, drag.dy) > 8) {
      drag.axis = Math.abs(drag.dx) > Math.abs(drag.dy) ? 'x' : 'y';
      stop();
    }
    if (drag.axis === 'x') view.style.translate = drag.dx + 'px 0';
    else if (drag.axis === 'y' && drag.dy > 0) {
      view.style.translate = '0 ' + drag.dy + 'px';
      bg.style.opacity = String(Math.max(.35, 1 - drag.dy / 500));
    }
  });
  const endDrag = (e, cancelled) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    const v = Math.abs(d.axis === 'y' ? d.dy : d.dx) / Math.max(1, performance.now() - d.t);
    bg.style.opacity = '';
    if (!cancelled && d.axis === 'x' && n > 1 && (Math.abs(d.dx) > 60 || v > .5)) {
      const dir = d.dx < 0 ? 1 : -1;
      return show(cur + dir, dir, d.dx);
    }
    if (!cancelled && d.axis === 'y' && d.dy > 0 && (d.dy > 110 || v > .6)) {
      if (pushed && history.state && history.state.beyond) { closeDy = d.dy; history.back(); return; }
      return finishClose(d.dy);
    }
    if (!cancelled && !d.axis && !d.onImg) return requestClose();
    const off = d.axis === 'x' ? `translateX(${d.dx}px)` : d.axis === 'y' ? `translateY(${Math.max(0, d.dy)}px)` : '';
    view.style.translate = '';
    if (off && !reduced) view.animate([{ transform: off }, { transform: 'none' }], { duration: T_SNAP, easing: EASE });
  };
  stage.addEventListener('pointerup', e => endDrag(e, false));
  stage.addEventListener('pointercancel', e => endDrag(e, true));

  /* resize: re-pack the grid, re-fit the open photo */
  let raf = 0;
  addEventListener('resize', () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      layout();
      if (isOpen) sizeView();
      hiCache.clear();
    });
  });

  // a link to one photo (beyond.html#photo-lake-framed) opens it at once
  const start = indexFromHash();
  if (start >= 0) open(start, { push: false, instant: true });
})();
