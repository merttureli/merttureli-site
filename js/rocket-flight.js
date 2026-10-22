/* CHARGER hero rocket: build, flight and landing in the CHARGER entry.

   Hero: the line drawing and the satin still paint with the page (inlined) and css/rocket.css builds
   one into the other. After load the live rocket (assets/rocket/rocket-live.js) takes over the canvas.
   Scrolling lifts the rocket out of the hero along its nose while it rolls once about its own axis.
   CHARGER entry: as the seat comes up, the rocket glides in from the right, rolling, and settles in
   the seat with no speed left against the page, so it is simply carried by the native scroll. Once
   it is seated the explorer (assets/charger-explorer/integration.js) takes its place, drawn the
   same way, so the swap does not show.

   Native scroll only: one requestAnimationFrame per scroll event, nothing when idle, and the canvas
   draws only when the roll or its size changes. Reduced motion (the system setting or the site's
   Display switch, followed live): no build, no flight and no roll; the rocket stays still in the
   hero, a still copy waits in the seat and the explorer fades in over it. */
(() => {
  'use strict';
  const hero = document.querySelector('[data-rocket-hero]'), seat = document.querySelector('[data-charger-seat]');
  if (!hero || !seat) return;
  const heroSection = hero.closest('section');
  const heroBox = hero.querySelector('[data-rocket-box]'), heroShadow = hero.querySelector('[data-rocket-shadow]');
  const seatWrap = seat.querySelector('[data-rocket-seat]');
  const seatBox = seatWrap.querySelector('[data-rocket-box]'), seatShadow = seatWrap.querySelector('[data-rocket-shadow]');
  // World height the rocket canvas shows: assets/rocket/rig.js VIEW.frame.
  const FRAME = (.5707 + .6102) * 1.04;
  const DPR = Math.min(window.devicePixelRatio || 1, 1.5);
  const reduceQuery = matchMedia('(prefers-reduced-motion: reduce)');
  const motionOn = () => (window.PortfolioDisplay ? window.PortfolioDisplay.motion() : !reduceQuery.matches);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const smooth = t => t * t * (3 - 2 * t);
  const stats = window.__rocket = { draws: 0, frames: 0, live: false, phase: '', seated: false, handed: false };

  let still = !motionOn();
  let vw = 0, vh = 0, heroH = 0, liftEnd = 1, seatY = 0, glide = 1, seatCx = 0, seatW = 0;
  let restTilt = 61, seatTilt = 24, heroBoxH = 1, seatBoxH = 1;
  let live = null, canvas = null, canvasBox = null, lastRoll = NaN, liveLoading = false;
  let heroPose = null, seatPose = null, seated = false, handed = false, pinned = false, loadRequested = false;
  let ticking = false, relayoutAfterClose = false;

  /* ---------- poster: sharper copies once they are decoded ---------- */
  // The inlined poster is 800 px tall. When the rocket stays still (reduced motion) the full still is
  // drawn into a canvas over it once the page has loaded: sharper, and a canvas is not an LCP candidate,
  // so the swap cannot move the page's LCP.
  let stillCanvas = null;
  function sharpStill() {
    if (stillCanvas || !still) return;
    const img = new Image();
    img.src = new URL('assets/rocket/still.webp', document.baseURI).href;
    img.decode().then(() => {
      if (stillCanvas || !still) return;
      const c = document.createElement('canvas'), w = heroBox.offsetWidth, h = heroBox.offsetHeight;
      c.width = Math.round(w * DPR); c.height = Math.round(h * DPR); c.className = 'still-canvas';
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      stillCanvas = c; heroBox.appendChild(c); heroBox.classList.add('has-still');
    }).catch(() => {});
  }
  // The CSS build runs from the first paint; mark it done so the drawing layers drop out.
  function built() { heroBox.classList.add('is-built'); }
  if (still) built();
  else {
    heroBox.addEventListener('animationend', e => { if (e.animationName === 'rocket-build') built(); }, { once: false });
    setTimeout(built, 1600);
  }

  /* ---------- geometry ---------- */
  function cssNumber(el, name, fallback) { const v = parseFloat(getComputedStyle(el).getPropertyValue(name)); return Number.isFinite(v) ? v : fallback; }
  function measure() {
    vw = document.documentElement.clientWidth; vh = window.innerHeight;
    const y = scrollY, hs = heroSection.getBoundingClientRect(), sr = seat.getBoundingClientRect();
    heroH = hs.height;
    liftEnd = Math.max(1, Math.min(heroH, vh) * .9);
    seatY = Math.max(liftEnd + 1, sr.top + y + sr.height / 2 - vh / 2);
    glide = clamp(Math.min(vh * .95, seatY - liftEnd - vh * .15), 1, vh * .95);
    seatCx = sr.left + sr.width / 2; seatW = sr.width;
    restTilt = cssNumber(hero, '--tilt', 61); seatTilt = cssNumber(seatWrap, '--tilt', 24);
    heroBoxH = heroBox.offsetHeight || 1; seatBoxH = seatBox.offsetHeight || 1;
    sizeCanvas();
  }

  // Hero: lift along the nose, tilt toward vertical, recede a little, roll once. u = 0 at rest.
  function heroAt(u) {
    const e = smooth(u), tilt = restTilt - 22 * e, a = tilt * Math.PI / 180, lift = vh * .42 * u * u;
    return { x: Math.sin(a) * lift, y: -Math.cos(a) * lift - vh * .04 * e, tilt, s: 1 - .1 * e, roll: 360 * (.5 - .5 * Math.cos(Math.PI * u)), shadow: Math.pow(1 - clamp(u * 2.2, 0, 1), 2) };
  }
  // Seat: glide in from the right and settle. v = 1 is seated; offsets fall to zero with zero slope,
  // so at the seat the rocket has no speed left against the page.
  function seatAt(v) {
    const w = 1 - v, e = w * w;
    const far = vw - seatCx + seatBoxH * .55 + 40;
    return { x: far * e, y: -vh * .55 * e, tilt: seatTilt + 26 * e, s: 1 + .08 * e, roll: -360 * e, shadow: v * v * v };
  }
  function transformFor(p) {
    return `translate(-50%,-50%) translate(var(--ox,0px),var(--oy,0px)) translate3d(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px,0) rotate(${p.tilt.toFixed(2)}deg) scale(${p.s.toFixed(4)})`;
  }

  /* ---------- live canvas ---------- */
  function sizeCanvas() {
    if (!live || !canvasBox) return false;
    return live.size(canvasBox.offsetWidth, canvasBox.offsetHeight);
  }
  function moveCanvas(box) {
    if (!canvas || canvasBox === box) return;
    if (canvasBox) canvasBox.classList.remove('has-canvas', 'canvas-ready');
    canvasBox = box; box.appendChild(canvas); sizeCanvas(); lastRoll = NaN;
    box.classList.add('has-canvas', 'canvas-ready');
  }
  function drawRoll(roll) {
    if (!live || Math.abs(roll - lastRoll) < .02) return;
    lastRoll = roll; live.draw(roll); stats.draws++;
  }
  function startLive() {
    if (live || liveLoading || still) return;
    liveLoading = true;
    import(new URL('assets/rocket/rocket-live.js', document.baseURI).href)
      .then(mod => { canvas = document.createElement('canvas'); return mod.mountLive({ canvas, base: new URL('assets/rocket/', document.baseURI).href, dpr: DPR }); })
      .then(api => {
        live = api; stats.live = true;
        const box = phaseBox();
        canvasBox = box; box.appendChild(canvas); sizeCanvas();
        const p = box === seatBox ? seatPose : heroPose;
        live.draw(p ? p.roll : 0); lastRoll = p ? p.roll : 0;
        requestAnimationFrame(() => { box.classList.add('has-canvas'); setTimeout(() => { if (canvasBox === box) box.classList.add('canvas-ready'); }, 340); });
      })
      .catch(err => { liveLoading = false; live = null; console.warn('CHARGER live rocket unavailable, keeping the still', err); });
  }
  const phaseBox = () => (scrollY < liftEnd + vh * .5 ? heroBox : seatBox);

  /* ---------- explorer handoff ---------- */
  const host = () => window.ChargerExplorerHost;
  // Seat pose in viewport px, for the explorer: tilt, roll, px per metre and centre.
  function poseOf(box, p) {
    const r = box.getBoundingClientRect();
    return { theta: p.tilt * Math.PI / 180, roll: p.roll, k: box.offsetHeight * p.s / FRAME, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
  }
  const restSeat = { x: 0, y: 0, tilt: 24, s: 1, roll: 0, shadow: 1 };
  function seatPoseNow() { return poseOf(seatBox, { ...restSeat, tilt: seatTilt }); }
  function heroPoseNow() { return poseOf(heroBox, heroPose || heroAt(0)); }

  function setSeated(on) {
    if (on === seated) return;
    seated = on; stats.seated = on;
    if (!on) {
      // Back in flight: our rocket shows first, then the explorer steps aside.
      if (handed) { handed = false; stats.handed = false; seatWrap.classList.remove('is-handed'); }
      host()?.unseat();
    } else trySeat();
  }
  function trySeat() {
    const h = host();
    if (!seated || handed || !h) return;
    if (!h.seat(seatPoseNow(), still)) return; // not ready yet; the host calls back when it is
    handed = true; stats.handed = true;
    seatWrap.classList.add('is-handed');
  }

  /* ---------- the frame ---------- */
  function frame() {
    ticking = false;
    if (host()?.busy) return;
    stats.frames++;
    const y = scrollY;
    // The explorer loads on the way down: once the hero is behind and the seat is within four
    // screens, when the page is idle, so it is ready before the rocket glides in.
    if (!loadRequested && y > Math.max(liftEnd, seatY - vh * 4)) {
      loadRequested = true;
      const go = () => host()?.load();
      if (window.requestIdleCallback) requestIdleCallback(go, { timeout: 1500 }); else setTimeout(go, 200);
    }
    if (still) {
      hero.classList.remove('is-flying');
      heroBox.style.transform = ''; heroShadow.style.opacity = '';
      seatWrap.classList.add('is-on');
      seatBox.style.transform = ''; seatShadow.style.opacity = '1';
      heroPose = heroAt(0); seatPose = { ...restSeat, tilt: seatTilt };
      setSeated(y > seatY - vh * 1.2 || pinned);
      stats.phase = 'still';
      return;
    }
    // hero
    const u = clamp(y / liftEnd, 0, 1);
    heroPose = heroAt(u);
    const heroOn = u < 1;
    heroBox.style.visibility = heroOn ? '' : 'hidden';
    if (heroOn) {
      heroBox.style.transform = u === 0 ? '' : transformFor(heroPose);
      heroShadow.style.opacity = (heroPose.shadow * .6).toFixed(3);
    }
    // seat
    // within 2 px of the seat counts as seated (scroll positions are whole or device pixels)
    const v = pinned || y >= seatY - 2 ? 1 : clamp((y - (seatY - glide)) / glide, 0, 1);
    seatPose = seatAt(v);
    const seatOn = v > 0;
    seatWrap.classList.toggle('is-on', seatOn);
    if (seatOn) {
      seatBox.style.transform = v === 1 ? '' : transformFor(seatPose);
      seatShadow.style.opacity = seatPose.shadow.toFixed(3);
    } else seatShadow.style.opacity = '0';
    setSeated(v === 1);
    // one canvas: wherever the rocket is on screen
    if (live) {
      if (heroOn) { moveCanvas(heroBox); drawRoll(heroPose.roll); }
      else if (seatOn && !handed) { moveCanvas(seatBox); drawRoll(seatPose.roll); }
    }
    stats.phase = heroOn ? 'hero' : seatOn ? (handed ? 'explorer' : seated ? 'seated' : 'glide') : 'away';
  }
  const request = () => { if (!ticking) { ticking = true; requestAnimationFrame(frame); } };
  addEventListener('scroll', request, { passive: true });
  let resizeRaf = 0;
  function relayout() {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => {
      if (host()?.busy) { relayoutAfterClose = true; return; }
      measure(); lastRoll = NaN; frame();
      if (handed) host()?.reseat(seatPoseNow());
    });
  }
  addEventListener('resize', relayout, { passive: true });
  if ('ResizeObserver' in window) { const ro = new ResizeObserver(relayout); ro.observe(heroSection); ro.observe(seat); }
  document.fonts?.ready.then(relayout);

  /* ---------- reduced motion, followed live ---------- */
  function applyMotion() {
    const next = !motionOn();
    if (next === still) return;
    still = next;
    if (still) {
      built();
      if (canvasBox) canvasBox.classList.remove('has-canvas', 'canvas-ready');
      if (canvas) canvas.remove();
      canvasBox = null;
      if (document.readyState === 'complete') sharpStill();
    } else if (document.readyState === 'complete') startLive();
    handed = false; seated = false; seatWrap.classList.remove('is-handed');
    host()?.unseat();
    measure(); lastRoll = NaN; frame();
  }
  document.addEventListener('portfolio:motion', applyMotion);
  reduceQuery.addEventListener?.('change', applyMotion);

  /* ---------- public, for the explorer host ---------- */
  window.RocketFlight = {
    seatPose: seatPoseNow,
    heroPose: heroPoseNow,
    heroVisible() { const r = heroBox.getBoundingClientRect(); return heroBox.style.visibility !== 'hidden' && r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw; },
    heroRect: () => heroBox.getBoundingClientRect(),
    seatRect: () => seat.getBoundingClientRect(),
    // The explorer is drawing the hero rocket (grown into the dialog from the hero); hide ours meanwhile.
    hideHero(on) { hero.classList.toggle('is-lent', !!on); },
    explorerReady() { trySeat(); },
    // The dialog closed: catch up on a resize that happened while it was open.
    dialogClosed() { if (relayoutAfterClose) { relayoutAfterClose = false; relayout(); } else request(); },
    pin() { pinned = true; request(); },
    get still() { return still; }
  };

  /* ---------- skills belt: a constant, calm speed ---------- */
  const belt = document.querySelector('.skills-belt');
  function beltSpeed() {
    const list = belt && belt.querySelector('.skills-belt-list');
    if (list) belt.style.setProperty('--belt-duration', Math.max(30, list.getBoundingClientRect().width / 34).toFixed(1) + 's');
  }
  beltSpeed();
  document.fonts?.ready.then(beltSpeed);

  /* ---------- go ---------- */
  measure(); frame();
  const goLive = () => { sharpStill(); (window.requestIdleCallback ? requestIdleCallback(startLive, { timeout: 1200 }) : setTimeout(startLive, 200)); };
  if (document.readyState === 'complete') goLive(); else addEventListener('load', goLive, { once: true });
})();
