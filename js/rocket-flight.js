/* CHARGER hero rocket: build, flight and landing in the CHARGER section.

   One rocket, one element. The hero's line drawing and satin still paint with the page (inlined) and
   css/rocket.css builds one into the other. After load the live rocket (assets/rocket/rocket-live.js)
   takes over with a canvas in the same box. Scrolling carries that box out of the hero and down into
   the seat of the CHARGER section right below it, rolling once about its own axis, and it never leaves
   the screen on the way. It arrives with no speed left against the page, so from the seat on the
   browser carries it natively. Once it is seated the explorer (assets/charger-explorer/integration.js)
   takes its place, drawn the same way, so the swap does not show.

   Native scroll only: one requestAnimationFrame per scroll event, nothing when idle, and the canvas
   draws only when the roll or its size changes. Reduced motion (the system setting or the site's
   Display switch, followed live): no build, no flight and no roll; the rocket rests in the hero and,
   once the page is scrolled toward CHARGER, fades over to the seat, where the explorer fades in. */
(() => {
  'use strict';
  const hero = document.querySelector('[data-rocket-hero]'), seat = document.querySelector('[data-charger-seat]');
  if (!hero || !seat) return;
  const box = hero.querySelector('[data-rocket-box]'), shadow = hero.querySelector('[data-rocket-shadow]');
  // World height the rocket canvas shows: assets/rocket/rig.js VIEW.frame.
  const FRAME = (.5707 + .6102) * 1.04;
  const DPR = Math.min(window.devicePixelRatio || 1, 1.5);
  const reduceQuery = matchMedia('(prefers-reduced-motion: reduce)');
  const motionOn = () => (window.PortfolioDisplay ? window.PortfolioDisplay.motion() : !reduceQuery.matches);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const smooth = t => t * t * (3 - 2 * t);
  const stats = window.__rocket = { draws: 0, frames: 0, live: false, phase: '', seated: false, handed: false };

  let still = !motionOn();
  let vw = 0, vh = 0, landY = 1, restX = 0, restY = 0, seatX = 0, seatY = 0, restTilt = 61, seatTilt = 24, seatScale = 1;
  let live = null, canvas = null, lastRoll = NaN, liveLoading = false;
  let pose = null, seated = false, handed = false, pinned = false, loadRequested = false;
  let ticking = false, relayoutAfterClose = false, stillAt = '', stillTimer = 0;
  let settling = false, catchFrom = null, catchAt = 0, loadTimer = 0, lastScrollAt = 0;

  /* ---------- poster: sharper copy once it is decoded ---------- */
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
      const c = document.createElement('canvas'), m = Math.max(1, seatScale);
      c.width = Math.round(box.offsetWidth * DPR * m); c.height = Math.round(box.offsetHeight * DPR * m); c.className = 'still-canvas';
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      stillCanvas = c; box.appendChild(c); box.classList.add('has-still');
    }).catch(() => {});
  }
  // The CSS build runs from the first paint; mark it done so the drawing layers drop out.
  function built() { box.classList.add('is-built'); }
  if (still) built();
  else {
    box.addEventListener('animationend', e => { if (e.animationName === 'rocket-build') built(); });
    setTimeout(built, 1600);
  }

  /* ---------- geometry ---------- */
  function cssNumber(el, name, fallback) { const v = parseFloat(getComputedStyle(el).getPropertyValue(name)); return Number.isFinite(v) ? v : fallback; }
  function measure() {
    vw = document.documentElement.clientWidth; vh = window.innerHeight;
    const y = scrollY, held = box.style.transform;
    box.style.transform = '';
    const r = box.getBoundingClientRect(), s = seat.getBoundingClientRect();
    box.style.transform = held;
    // Centres in page px: the rocket at rest in the hero, and the seat.
    restX = r.left + r.width / 2; restY = r.top + r.height / 2 + y;
    seatX = s.left + s.width / 2; seatY = s.top + s.height / 2 + y;
    // The rocket lands as the seat reaches the middle of the screen.
    landY = Math.max(vh * .5, seatY - vh / 2);
    restTilt = cssNumber(hero, '--tilt', 61); seatTilt = cssNumber(seat, '--tilt', 24);
    seatScale = s.height ? s.height * cssNumber(seat, '--seat-len', .9) * 1.04 / (box.offsetHeight || 1) : 1;
    sizeCanvas();
  }

  // u = 0 at rest in the hero, 1 in the seat. The path is a cubic in screen space from where the rocket
  // rests to where the seat is when it lands: it leaves drifting up slower than the page (so it falls
  // behind the hero and flies down the page) and arrives moving exactly with the page.
  const LEAVE = .3;
  function poseAt(u, y) {
    const u2 = u * u, u3 = u2 * u;
    const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
    const sx = h00 * restX + h01 * seatX;
    const sy = h00 * restY + h10 * -LEAVE * landY + h01 * (seatY - landY) + h11 * -landY;
    const e = smooth(u);
    return {
      x: sx - restX, y: sy - (restY - y),
      tilt: restTilt + (seatTilt - restTilt) * e, s: 1 + (seatScale - 1) * e,
      roll: 360 * (.5 - .5 * Math.cos(Math.PI * u)), shadow: Math.pow(1 - clamp(u * 2.4, 0, 1), 2)
    };
  }
  const seatPoseAbs = () => ({ x: seatX - restX, y: seatY - restY, tilt: seatTilt, s: seatScale, roll: 0, shadow: 0 });
  function blendPose(a, b, t) {
    const L = (p, q) => p + (q - p) * t;
    let roll = b.roll - a.roll; roll -= 360 * Math.round(roll / 360); // the short way round
    return { x: L(a.x, b.x), y: L(a.y, b.y), tilt: L(a.tilt, b.tilt), s: L(a.s, b.s), roll: a.roll + roll * t, shadow: L(a.shadow, b.shadow) };
  }
  function transformFor(p) {
    return `translate(-50%,-50%) translate(var(--ox,0px),var(--oy,0px)) translate3d(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px,0) rotate(${p.tilt.toFixed(2)}deg) scale(${p.s.toFixed(4)})`;
  }

  /* ---------- live canvas ---------- */
  // The canvas is sized for the larger of the hero and seat sizes, so it stays sharp in both.
  function sizeCanvas() {
    if (!live) return false;
    const m = Math.max(1, Math.min(1.6, seatScale));
    return live.size(box.offsetWidth * m, box.offsetHeight * m);
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
        if (still) { liveLoading = false; return; }
        live = api; stats.live = true;
        box.appendChild(canvas); sizeCanvas();
        const roll = pose ? pose.roll : 0;
        live.draw(roll); lastRoll = roll;
        requestAnimationFrame(() => { box.classList.add('has-canvas'); setTimeout(() => box.classList.add('canvas-ready'), 340); });
      })
      .catch(err => { liveLoading = false; live = null; console.warn('CHARGER live rocket unavailable, keeping the still', err); });
  }

  /* ---------- explorer handoff ---------- */
  const host = () => window.ChargerExplorerHost;
  // A pose in viewport px, for the explorer: tilt, roll, px per metre and centre.
  function seatPoseNow() {
    const r = seat.getBoundingClientRect();
    return { theta: seatTilt * Math.PI / 180, roll: 0, k: box.offsetHeight * seatScale / FRAME, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
  }
  function heroPoseNow() {
    const p = pose || poseAt(0, scrollY), r = box.getBoundingClientRect();
    return { theta: p.tilt * Math.PI / 180, roll: p.roll, k: box.offsetHeight * p.s / FRAME, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
  }

  function setSeated(on) {
    if (on === seated) return;
    seated = on; stats.seated = on;
    if (!on) {
      pinned = false;
      // Back in flight: our rocket shows at once under the explorer, then the explorer steps aside.
      if (handed) {
        handed = false; stats.handed = false;
        box.style.transition = 'none'; box.classList.remove('is-handed'); void box.offsetWidth; box.style.transition = '';
      }
      host()?.unseat();
    } else trySeat();
  }
  function trySeat() {
    const h = host();
    if (!seated || handed || !h) return;
    if (!h.seat(seatPoseNow(), still)) return; // not ready yet; the host calls back when it is
    handed = true; stats.handed = true;
    box.classList.add('is-handed');
  }

  /* ---------- reduced motion: rest in the hero or sit in the seat, with a short fade between ---------- */
  function stillFrame(y) {
    const want = y > landY * .5 ? 'seat' : 'hero';
    if (want !== stillAt) {
      const first = !stillAt;
      stillAt = want;
      clearTimeout(stillTimer);
      const place = () => {
        pose = want === 'seat' ? seatPoseAbs() : poseAt(0, y);
        box.style.transform = want === 'seat' ? transformFor(pose) : '';
        shadow.style.opacity = want === 'seat' ? '0' : '';
        box.classList.remove('is-away');
      };
      if (first) place();
      else { box.classList.add('is-away'); stillTimer = setTimeout(place, 200); }
    }
    setSeated(want === 'seat');
    stats.phase = 'still-' + want;
  }

  /* ---------- explorer loading ---------- */
  function loadExplorer() { if (loadRequested) return; loadRequested = true; clearTimeout(loadTimer); host()?.load(); }
  // On a desktop on a good connection the seat is only a screen away, so the explorer also loads once
  // the page has settled after load, while nothing is moving: its setup then never lands mid-flight.
  // Phones, Save-Data and slow links wait for the visitor to scroll (above).
  function preloadWhenIdle() {
    const c = navigator.connection;
    if (loadRequested || !matchMedia('(min-width: 861px) and (pointer: fine)').matches || c?.saveData || /(^|-)2g|3g/.test(c?.effectiveType || '')) return;
    const tryNow = () => {
      if (loadRequested) return;
      if (performance.now() - lastScrollAt < 400) { setTimeout(tryNow, 500); return; }
      loadExplorer();
    };
    setTimeout(() => (window.requestIdleCallback ? requestIdleCallback(tryNow, { timeout: 2000 }) : tryNow()), 1500);
  }

  /* ---------- the frame ---------- */
  function frame() {
    ticking = false;
    if (host()?.busy) return;
    stats.frames++;
    const y = scrollY;
    // The explorer loads once the page starts moving toward CHARGER (it sits right below the hero), at
    // the first pause in the scroll (its setup is heavy, so not mid-flight), or at once on landing. Our
    // rocket holds the seat until it is ready, so a late explorer never shows as a gap.
    lastScrollAt = performance.now();
    if (!loadRequested && y > vh * .12) {
      clearTimeout(loadTimer);
      if (y >= landY - 2) loadExplorer();
      else loadTimer = setTimeout(() => (window.requestIdleCallback ? requestIdleCallback(loadExplorer, { timeout: 1000 }) : loadExplorer()), 180);
    }
    if (still) { stillFrame(y); return; }
    // After a drag in the seat the rocket stays seated; scrolling back up first turns the explorer back to
    // the seated pose, then our rocket takes over and eases onto the flight path from where it sat.
    if (pinned && y < landY - 2 && !settling) {
      settling = true;
      const done = () => { settling = false; pinned = false; catchFrom = seatPoseAbs(); catchAt = performance.now(); request(); };
      (host()?.settle(seatPoseNow()) || Promise.resolve()).then(done, done);
    }
    const hold = pinned;
    const u = hold ? 1 : clamp(y / landY, 0, 1);
    pose = u === 1 ? seatPoseAbs() : poseAt(u, y);
    if (catchFrom && !hold) {
      const t = (performance.now() - catchAt) / 240;
      if (t >= 1 || u === 1) catchFrom = null;
      else { pose = blendPose(catchFrom, pose, smooth(t)); request(); }
    }
    box.style.transform = u === 0 ? '' : transformFor(pose);
    shadow.style.opacity = u === 0 ? '' : (pose.shadow * .6).toFixed(3);
    // within 2 px of the seat counts as seated (scroll positions are whole or device pixels)
    setSeated(hold || y >= landY - 2);
    if (!handed) drawRoll(pose.roll);
    stats.phase = u === 0 ? 'rest' : handed ? 'explorer' : seated ? 'seated' : 'flight';
  }
  const request = () => { if (!ticking) { ticking = true; requestAnimationFrame(frame); } };
  addEventListener('scroll', request, { passive: true });
  let resizeRaf = 0;
  function relayout() {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => {
      if (host()?.busy) { relayoutAfterClose = true; return; }
      measure(); lastRoll = NaN; if (still) stillAt = ''; frame();
      if (handed) host()?.reseat(seatPoseNow());
    });
  }
  addEventListener('resize', relayout, { passive: true });
  if ('ResizeObserver' in window) { const ro = new ResizeObserver(relayout); ro.observe(hero.closest('section')); ro.observe(seat); ro.observe(document.body); }
  document.fonts?.ready.then(relayout);

  /* ---------- reduced motion, followed live ---------- */
  function applyMotion() {
    const next = !motionOn();
    if (next === still) return;
    still = next;
    stillAt = ''; clearTimeout(stillTimer); box.classList.remove('is-away');
    if (still) {
      built();
      box.classList.remove('has-canvas', 'canvas-ready');
      if (canvas) canvas.remove();
      if (document.readyState === 'complete') sharpStill();
    } else {
      if (stillCanvas) { stillCanvas.remove(); stillCanvas = null; box.classList.remove('has-still'); }
      if (live) { box.appendChild(canvas); sizeCanvas(); box.classList.add('has-canvas', 'canvas-ready'); }
      else if (document.readyState === 'complete') startLive();
    }
    handed = false; seated = false; pinned = false; box.classList.remove('is-handed');
    host()?.unseat();
    measure(); lastRoll = NaN; frame();
  }
  document.addEventListener('portfolio:motion', applyMotion);
  reduceQuery.addEventListener?.('change', applyMotion);

  /* ---------- public, for the explorer host ---------- */
  window.RocketFlight = {
    seatPose: seatPoseNow,
    heroPose: heroPoseNow,
    // The rocket itself is on screen (not handed to the explorer).
    heroVisible() { if (handed) return false; const r = box.getBoundingClientRect(); return r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw; },
    heroRect: () => box.getBoundingClientRect(),
    seatRect: () => seat.getBoundingClientRect(),
    // The explorer is drawing the rocket (grown into the dialog from it); hide ours meanwhile.
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
  const goLive = () => { sharpStill(); (window.requestIdleCallback ? requestIdleCallback(startLive, { timeout: 1200 }) : setTimeout(startLive, 200)); preloadWhenIdle(); };
  if (document.readyState === 'complete') goLive(); else addEventListener('load', goLive, { once: true });
})();
