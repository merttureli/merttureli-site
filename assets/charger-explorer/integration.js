// CHARGER explorer on the home page. The explorer (an iframe of index.html) lives in the CHARGER entry's
// seat. Inline it is the rocket that landed there (js/rocket-flight.js hands over to it, drawn the same
// way); Expand and every Explore-in-3D entry point grow it into the full-screen dialog as one continuous
// move, and closing shrinks it back. The page markup is static, so the launcher is delegated.
(() => {
  const dialog = document.getElementById('charger-explorer');
  const frame = document.getElementById('charger-frame');
  if (!dialog || !frame) return;
  const closeButton = document.getElementById('charger-close');
  const status = document.getElementById('charger-launch-status');
  const bg = dialog.querySelector('.charger-dialog-bg');
  const bar = dialog.querySelector('.charger-dialog-bar');
  const seat = dialog.closest('[data-charger-seat]');
  const expandButton = document.querySelector('[data-charger-expand]');
  const reduceQuery = matchMedia('(prefers-reduced-motion: reduce)');
  const motionOff = () => (window.PortfolioDisplay ? !window.PortfolioDisplay.motion() : reduceQuery.matches);
  const track = name => { try { window.mtTrack?.(name); } catch { /* never let tracking break the page */ } };
  const flight = () => window.RocketFlight;
  // ?slowmo=N stretches the grow and shrink N times, for review only.
  const SLOW = Math.max(1, +new URLSearchParams(location.search).get('slowmo') || 1);
  const EASE = 'cubic-bezier(.65,0,.35,1)', OPEN_MS = 700 * SLOW, CLOSE_MS = 620 * SLOW;

  let api = null, ready = null, wantSeat = null, inlineShown = false;
  let state = 'closed', origin = 'plain', animations = [];
  let returnFocus = null, scrollPosition = 0, savedStyle = null, pendingBack = false, reopenAfterBack = null, cleaned = true;

  /* ---------- loading ---------- */
  function load() {
    if (ready) return ready;
    ready = new Promise((resolve, reject) => {
      frame.addEventListener('load', () => {
        let tries = 0;
        const find = () => {
          let found = null;
          try { found = frame.contentWindow?.chargerExplorer; } catch { /* not ours */ }
          if (found) { found.ready.then(() => { api = found; resolve(found); }, reject); return; }
          if (++tries > 50) { reject(Error('explorer unavailable')); return; }
          setTimeout(find, 100);
        };
        find();
      }, { once: true });
    });
    ready.then(onReady, () => {});
    frame.src = frame.dataset.src;
    return ready;
  }
  function onReady() {
    status.hidden = true;
    if (state === 'closed') { const f = flight(); if (f) f.explorerReady(); else if (wantSeat) seatInline(wantSeat.pose, wantSeat.fade); }
    else if (origin === 'plain') api.openPlain();
  }

  /* ---------- inline in the seat ---------- */
  function framePose(pose, rect = frame.getBoundingClientRect()) { return { ...pose, cx: pose.cx - rect.left, cy: pose.cy - rect.top }; }
  function setInlineAttributes(on) {
    if (on) { dialog.setAttribute('aria-hidden', 'true'); frame.setAttribute('tabindex', '-1'); }
    else { dialog.removeAttribute('aria-hidden'); frame.removeAttribute('tabindex'); }
  }
  function seatInline(pose, fade) {
    dialog.classList.add('is-inline');
    dialog.style.transition = fade ? '' : 'none';
    setInlineAttributes(true);
    api.seat(framePose(pose));
    dialog.classList.add('is-shown'); inlineShown = true;
    if (!fade) { void dialog.offsetWidth; dialog.style.transition = ''; }
  }
  function hideInline() {
    if (!inlineShown) return;
    inlineShown = false;
    dialog.style.transition = 'none';
    dialog.classList.remove('is-shown');
    void dialog.offsetWidth; dialog.style.transition = '';
  }

  /* ---------- opening and closing ---------- */
  const visibleShare = r => Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0)) / Math.max(1, r.height);
  function pinBody() {
    scrollPosition = scrollY;
    savedStyle = {};
    for (const key of ['position', 'top', 'width', 'overflow', 'paddingRight']) savedStyle[key] = document.body.style[key];
    const gutter = innerWidth - document.documentElement.clientWidth;
    document.body.style.paddingRight = (parseFloat(getComputedStyle(document.body).paddingRight) + gutter) + 'px';
    Object.assign(document.body.style, { position: 'fixed', top: `-${scrollPosition}px`, width: '100%', overflow: 'hidden' });
  }
  function stopAnimations() { animations.forEach(a => a.cancel()); animations = []; }
  // The dialog is revealed from (or closed down to) a rect: its clip grows from the seat while the dark
  // panel fades in under the rocket, which the explorer keeps drawing throughout.
  function morphPanel(rect, opening, duration) {
    const box = dialog.getBoundingClientRect();
    const from = `inset(${rect.top - box.top}px ${box.right - rect.right}px ${box.bottom - rect.bottom}px ${rect.left - box.left}px round 14px)`;
    const to = 'inset(0px 0px 0px 0px round 0px)';
    const timing = { duration, easing: EASE, fill: 'both' };
    animations.push(dialog.animate(opening ? [{ clipPath: from }, { clipPath: to }] : [{ clipPath: to }, { clipPath: from }], timing));
    animations.push(bg.animate(opening ? [{ opacity: 0 }, { opacity: 1, offset: .45 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 1, offset: .55 }, { opacity: 0 }], { duration, easing: 'linear', fill: 'both' }));
    animations.push(bar.animate(opening ? [{ opacity: 0 }, { opacity: 0, offset: .55 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 0, offset: .3 }, { opacity: 0 }], { duration, easing: 'linear', fill: 'both' }));
  }

  function open(trigger) {
    if (typeof dialog.showModal !== 'function') { location.href = frame.dataset.src.replace(/\?.*$/, ''); return; }
    if (state !== 'closed') return;
    // A close is still waiting for its history.back(). Reopen once it lands, or its popstate would close this open.
    if (pendingBack) { reopenAfterBack = trigger || true; return; }
    returnFocus = trigger instanceof Element ? trigger : expandButton;
    const f = flight(), still = motionOff();
    const seatRect = seat.getBoundingClientRect();
    origin = api && inlineShown && visibleShare(seatRect) > .3 ? 'seat'
      : api && f && f.heroVisible() && !still ? 'hero' : 'plain';
    if (origin === 'seat' || returnFocus === expandButton) track('charger-3d-expand');
    const heroPose = origin === 'hero' ? f.heroPose() : null, heroRect = origin === 'hero' ? f.heroRect() : null;
    const rect = returnFocus?.getBoundingClientRect?.();
    if (rect) dialog.style.setProperty('--charger-origin', `${clamp((rect.x + rect.width / 2) / innerWidth * 100)}% ${clamp((rect.y + rect.height / 2) / innerHeight * 100)}%`);
    // Push the history entry before the body is pinned, so the entry under it keeps the real scroll position.
    // A deep link (#charger-explorer already in the URL) and Forward onto the entry reuse the current one.
    if (location.hash !== '#charger-explorer') history.pushState({ chargerExplorer: true }, '', '#charger-explorer');
    cleaned = false;
    pinBody();
    stopAnimations();
    const morph = origin !== 'plain' && !still;
    dialog.style.transition = 'none';
    dialog.classList.remove('is-inline', 'is-shown');
    dialog.classList.toggle('is-morphing', morph);
    dialog.style.setProperty('--morph-ms', OPEN_MS + 'ms');
    seat.classList.add('is-expanded');
    setInlineAttributes(false);
    inlineShown = false;
    dialog.showModal();
    dialog.style.transition = '';
    state = 'opening';
    document.getElementById('charger-launch')?.setAttribute('aria-expanded', 'true');
    expandButton?.setAttribute('aria-expanded', 'true');
    closeButton.focus({ preventScroll: true });
    const done = () => { if (state === 'opening') state = 'open'; };
    if (morph) {
      status.hidden = true;
      const fr = frame.getBoundingClientRect();
      if (origin === 'seat') {
        morphPanel(seatRect, true, OPEN_MS);
        api.expand(framePose(f.seatPose(), fr), { duration: OPEN_MS, keepView: true, shift: [seatRect.left - fr.left, seatRect.top - fr.top] }).then(done);
      } else {
        f.hideHero(true);
        morphPanel(heroRect, true, OPEN_MS);
        api.expand(framePose(heroPose, fr), { duration: OPEN_MS }).then(done);
      }
    } else {
      // Not loaded yet, or reduced motion: the dialog fades in and the explorer opens on its own view.
      if (still) animations.push(dialog.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'linear' }));
      status.hidden = !!api;
      if (api) api.openPlain();
      else load();
      setTimeout(done, still ? 200 : 480);
    }
  }

  function close() {
    if (!dialog.open || state === 'closing') return;
    const f = flight(), still = motionOff();
    state = 'closing';
    stopAnimations();
    const toSeat = api && origin === 'seat' && !still;
    const toHero = api && origin === 'hero' && !still && f?.heroVisible();
    if (toSeat || toHero) {
      const target = toSeat ? seat.getBoundingClientRect() : f.heroRect();
      dialog.style.setProperty('--morph-ms', CLOSE_MS + 'ms');
      morphPanel(target, false, CLOSE_MS);
      dialog.classList.add('is-morphing', 'is-closing');
      const pose = () => framePose(toSeat ? f.seatPose() : f.heroPose());
      api.collapse(pose, { duration: CLOSE_MS }).then(() => finishClose(toSeat ? 'seat' : 'hero'));
    } else {
      dialog.classList.remove('is-morphing');
      dialog.classList.add('is-closing');
      if (still) { animations.push(dialog.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: 'linear', fill: 'forwards' })); setTimeout(() => finishClose('plain'), 200); }
      else setTimeout(() => finishClose('plain'), 220);
    }
  }
  function finishClose(to) {
    if (state !== 'closing') return;
    dialog.close();
    dialog.classList.remove('is-closing', 'is-morphing');
    stopAnimations();
    state = 'closed';
    afterClose(); // not left to the async close event, so a quick reopen cannot slip in before the cleanup
    const f = flight();
    seat.classList.add('shadow-in'); seat.classList.remove('is-expanded');
    setTimeout(() => seat.classList.remove('shadow-in'), 450);
    if (to === 'hero') f?.hideHero(false);
    // Back in the seat: the same picture, now inline. Elsewhere the flight decides when to seat it again.
    if (api && to === 'seat') seatInline(f.seatPose(), false);
    else if (api && wantSeat) seatInline(f ? f.seatPose() : wantSeat.pose, true);
    else hideInline();
  }
  function afterClose() {
    if (cleaned) return;
    cleaned = true;
    if (savedStyle) Object.assign(document.body.style, savedStyle);
    savedStyle = null;
    scrollTo({ top: scrollPosition, behavior: 'instant' });
    document.getElementById('charger-launch')?.setAttribute('aria-expanded', 'false');
    expandButton?.setAttribute('aria-expanded', 'false');
    // Back and Forward already moved the URL. Otherwise drop the entry open() pushed, so Back never
    // lands on the open dialog. A deep-link entry has nothing to go back to, so only strip the hash.
    if (location.hash === '#charger-explorer') {
      if (history.state?.chargerExplorer) { pendingBack = true; history.back(); setTimeout(settleBack, 1500); }
      else history.replaceState(history.state, '', location.pathname + location.search);
    }
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    else expandButton?.focus({ preventScroll: true });
  }
  const clamp = v => Math.max(0, Math.min(100, v));

  // The close event is async and can arrive after a quick reopen; only clean up if the dialog is still closed.
  dialog.addEventListener('close', () => { if (!dialog.open && state === 'closed') afterClose(); });
  closeButton.addEventListener('click', close);
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  let backdropDown = false;
  const outside = event => { const r = dialog.getBoundingClientRect(); return event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom; };
  dialog.addEventListener('pointerdown', event => { backdropDown = dialog.open && event.target === dialog && outside(event); });
  dialog.addEventListener('click', event => { if (backdropDown && event.target === dialog && outside(event)) close(); backdropDown = false; });
  document.addEventListener('click', event => {
    const trigger = event.target.closest?.('#charger-launch,a[href="#charger-explorer"],[data-charger-expand]');
    if (!trigger || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); open(trigger);
  });
  window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== frame.contentWindow) return;
    const type = event.data?.type;
    if (type === 'charger:close') close();
    else if (type === 'charger:tap' && state === 'closed') open(expandButton);
    else if (type === 'charger:interact') { flight()?.pin(); track('charger-3d-inline-drag'); }
  });
  // popstate covers Back and Forward, hashchange covers a hand-edited URL. Both are idempotent, so
  // browsers that fire both for one navigation open or close the dialog once.
  const syncWithURL = () => { if (location.hash === '#charger-explorer') open(); else if (dialog.open) close(); };
  function settleBack() {
    if (!pendingBack) return;
    pendingBack = false;
    // The traversal never happened (no earlier entry to go back to): fall back to stripping the hash.
    if (location.hash === '#charger-explorer') history.replaceState(history.state, '', location.pathname + location.search);
    const again = reopenAfterBack; reopenAfterBack = null;
    if (again) open(again === true ? undefined : again);
  }
  window.addEventListener('popstate', () => { if (pendingBack) settleBack(); else syncWithURL(); });
  window.addEventListener('hashchange', syncWithURL);

  /* ---------- for js/rocket-flight.js ---------- */
  window.ChargerExplorerHost = {
    load,
    get ready() { return !!api; },
    // The rocket has landed: show the explorer in its place. False until the explorer is ready.
    seat(pose, fade) {
      wantSeat = { pose, fade };
      if (!api) { load(); return false; }
      if (state !== 'closed') return true;
      seatInline(pose, fade);
      return true;
    },
    reseat(pose) { if (wantSeat) wantSeat.pose = pose; if (api && inlineShown && state === 'closed') api.seat(framePose(pose)); },
    unseat() { wantSeat = null; if (state === 'closed') hideInline(); }
  };
  if (location.hash === '#charger-explorer') open();
})();
