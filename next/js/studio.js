// STUDIO page behaviour. One rAF loop drives everything that moves with
// scroll; it only writes transforms and one CSS variable, and it idles when
// nothing is on screen that needs it.
(() => {
  const root = document.documentElement;
  root.classList.remove('no-js');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  /* smooth scroll (desktop wheel only; touch keeps native momentum) */
  let lenis = null;
  if (!reduced && window.Lenis && !/[?&]shot/.test(location.search)) {
    lenis = new window.Lenis({ lerp: 0.11, wheelMultiplier: 1, smoothWheel: true });
  }
  const scrollTo = (target) => {
    const el = typeof target === 'string' ? $(target) : target;
    if (!el) return;
    if (lenis) lenis.scrollTo(el, { offset: 0, duration: 1.4 });
    else el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
  };
  $$('a[href^="#"]').forEach(a => a.addEventListener('click', e => {
    const id = a.getAttribute('href');
    if (id.length < 2) return;
    const el = $(id);
    if (!el) return;
    e.preventDefault();
    closeMenu();
    scrollTo(el);
    history.replaceState(null, '', id);
    el.setAttribute('tabindex', '-1');
    el.focus({ preventScroll: true });
  }));

  /* hero: marquee, drifting words, parallax */
  const hero = $('[data-hero]');
  const drift = $('[data-drift]');
  const track = $('[data-marquee-track]');
  const object = $('[data-hero-object]');
  const slots = $$('.slot', drift);
  let heroVisible = true, heroH = hero.offsetHeight, itemW = 0;
  const measure = () => { heroH = hero.offsetHeight; itemW = track.firstElementChild.getBoundingClientRect().width; };
  measure();
  addEventListener('resize', measure, { passive: true });
  document.fonts && document.fonts.ready.then(measure);
  new IntersectionObserver(e => { heroVisible = e[0].isIntersecting; }, { threshold: 0 }).observe(hero);

  let set = 0;
  window.__studio = { get lastSwap() { return lastSwap; } };
  // heldSlot keeps showing word heldIdx while the other slots keep cycling.
  let heldSlot = null, heldIdx = 0;
  const setWords = (n) => {
    set = (n + 3) % 3;
    slots.forEach((slot, si) => [...slot.children].forEach((w, i) => {
      w.style.transitionDelay = (si * 70) + 'ms';
      w.classList.toggle('on', slot === heldSlot ? i === heldIdx : i === set);
    }));
  };
  setWords(0);
  // The showreel holds the active project's name in its slot and brings that
  // slot forward; the other slots keep cycling (see showreel/index.js).
  const words = {
    hold(slot, i) { if (heldSlot === slot && heldIdx === i) return; heldSlot = slot; heldIdx = i; setWords(set); },
    release() { heldSlot = null; },
    focus(slot) { drift.classList.toggle('is-reel', !!slot); slots.forEach(s => s.classList.toggle('is-active', s === slot)); }
  };

  let x = 0, dir = -1, lastY = scrollY, lastT = performance.now(), boost = 0, lastSwap = performance.now(), lastScrollAt = 0, lastP = -1;
  const par = $$('[data-par]'), parOn = new Set();
  const io = new IntersectionObserver(es => es.forEach(e => e.isIntersecting ? parOn.add(e.target) : parOn.delete(e.target)), { rootMargin: '10% 0px' });
  par.forEach(el => io.observe(el));

  function frame(now) {
    if (lenis) lenis.raf(now);
    const y = lenis ? lenis.animatedScroll : scrollY;
    const dt = Math.min(64, now - lastT); lastT = now;
    const dy = y - lastY; lastY = y;
    if (Math.abs(dy) > 0.3) { dir = dy > 0 ? -1 : 1; lastScrollAt = now; }
    if (heroVisible) {
      const p = Math.min(1, Math.max(0, y / heroH));
      if (Math.abs(p - lastP) > 0.0005) {
        lastP = p;
        drift.style.setProperty('--p', p.toFixed(4));
        object.style.translate = `0 ${(-p * 90).toFixed(1)}px`;
        dispatchEvent(new CustomEvent('studio:scroll', { detail: p }));
        // words change as you scroll (every ~16% of the hero)
        const n = Math.floor(p * 6) % 3;
        if (n !== set && p > 0.02) { setWords(n); lastSwap = now; }
      }
      if (!reduced) {
        boost += (Math.min(Math.abs(dy) * 0.9, 24) - boost) * 0.08;
        x += dir * ((innerWidth < 760 ? 0.03 : 0.045) * dt + boost);
        if (itemW) { if (x <= -itemW) x += itemW; if (x > 0) x -= itemW; }
        track.style.transform = `translate3d(${x.toFixed(2)}px, 0, 0)`;
        // idle: keep the words changing slowly at the top of the page
        if (now - lastSwap > 3800 && now - lastScrollAt > 1500) { setWords(set + 1); lastSwap = now; }
      }
    }
    if (!reduced) parOn.forEach(el => {
      const r = el.getBoundingClientRect();
      const c = (r.top + r.height / 2 - innerHeight / 2);
      el.style.transform = `translate3d(0, ${(c * parseFloat(el.dataset.par)).toFixed(1)}px, 0)`;
    });
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  /* magnetic buttons */
  if (fine && !reduced) {
    $$('[data-magnetic]').forEach(el => {
      const inner = el.querySelector('.round__in, span:not(.menu-btn__lines)');
      const strength = el.classList.contains('round') ? 0.38 : 0.28;
      let r = null;
      el.addEventListener('pointerenter', () => { r = el.getBoundingClientRect(); el.style.transition = 'transform var(--dur-250) var(--ease)'; if (inner) inner.style.transition = 'transform var(--dur-250) var(--ease)'; });
      el.addEventListener('pointermove', e => {
        if (!r) r = el.getBoundingClientRect();
        const mx = e.clientX - (r.left + r.width / 2), my = e.clientY - (r.top + r.height / 2);
        el.style.transform = `translate3d(${mx * strength}px, ${my * strength}px, 0)`;
        if (inner) inner.style.transform = `translate3d(${mx * strength * 0.5}px, ${my * strength * 0.5}px, 0)`;
      });
      el.addEventListener('pointerleave', () => {
        r = null;
        el.style.transition = 'transform var(--dur-900) var(--ease-back)';
        el.style.transform = '';
        if (inner) { inner.style.transition = el.style.transition; inner.style.transform = ''; }
      });
    });
  }

  /* menu */
  const menuBtn = $('[data-menu-btn]'), menu = $('[data-menu]');
  function openMenu() { menu.hidden = false; menuBtn.setAttribute('aria-expanded', 'true'); lenis && lenis.stop(); $('nav a', menu).focus(); }
  function closeMenu() { if (menu.hidden) return; menu.hidden = true; menuBtn.setAttribute('aria-expanded', 'false'); lenis && lenis.start(); }
  menuBtn.addEventListener('click', () => menu.hidden ? openMenu() : (closeMenu(), menuBtn.focus()));
  menu.addEventListener('click', e => { if (e.target === menu) closeMenu(); });
  addEventListener('keydown', e => { if (e.key === 'Escape' && !menu.hidden) { closeMenu(); menuBtn.focus(); } });
  new IntersectionObserver(e => menuBtn.classList.toggle('is-shown', !e[0].isIntersecting), { threshold: 0 }).observe($('.top__nav'));

  /* selected work: the stage follows the project in view */
  const stage = $('[data-work-stage]');
  if (stage) {
    const imgs = $$('img', stage), ghost = $('[data-ghost]', stage), idx = $('[data-stage-idx]', stage), tag = $('[data-stage-tag]', stage);
    const projects = $$('[data-project]');
    let current = 'charger';
    const show = (p) => {
      const key = p.dataset.project;
      projects.forEach(q => q.classList.toggle('is-active', q === p));
      if (key === current) return;
      current = key;
      imgs.forEach(i => i.classList.toggle('is-on', i.dataset.key === key));
      ghost.classList.add('is-swap');
      setTimeout(() => { ghost.textContent = p.dataset.name; ghost.classList.remove('is-swap'); }, 260);
      idx.textContent = String(projects.indexOf(p) + 1).padStart(2, '0') + ' / ' + String(projects.length).padStart(2, '0');
      tag.textContent = p.dataset.tag;
    };
    const po = new IntersectionObserver(es => es.forEach(e => e.isIntersecting && show(e.target)), { rootMargin: '-45% 0px -45% 0px' });
    projects.forEach(p => po.observe(p));
  }

  /* reveal */
  const ro = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('is-in'); ro.unobserve(e.target); } }), { rootMargin: '0px' });
  $$('[data-reveal]').forEach(el => ro.observe(el));

  /* local time in Austin */
  const clock = $('[data-clock]');
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' });
  const tick = () => { clock.textContent = fmt.format(new Date()) + ' in Austin'; };
  tick(); setInterval(tick, 30000);

  /* live CHARGER and the showreel: after load and idle, only if WebGL works.
     With reduced motion the poster stays; if the setting is turned off later,
     the live hero starts then (the showreel itself listens for changes too). */
  const saveData = navigator.connection && navigator.connection.saveData;
  const canGL = (() => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; } })();
  if (!saveData && canGL && !/[?&]still/.test(location.search)) {
    const rq = matchMedia('(prefers-reduced-motion: reduce)');
    let mounted = false, loaded = document.readyState === 'complete';
    const start = () => {
      if (mounted || rq.matches) return;
      mounted = true;
      import('./showreel/index.js').then(m => m.mountShowreel({ box: object, drift, words }))
        .catch(err => console.warn('3D hero unavailable, keeping the still', err));
    };
    const later = () => (window.requestIdleCallback ? requestIdleCallback(start, { timeout: 2500 }) : setTimeout(start, 1200));
    if (loaded) later(); else addEventListener('load', () => { loaded = true; later(); });
    rq.addEventListener('change', () => { if (!rq.matches && loaded) start(); });
  }
})();
