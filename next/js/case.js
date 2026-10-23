// STUDIO case (product) pages: menu, local nav state, reveals, Austin clock, magnetic
// buttons. Clips are in clips.js. No scroll loop: everything here is event or observer driven.
(() => {
  document.documentElement.classList.remove('no-js');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  window.__jumpUntil = 0;
  const lnav = $('[data-lnav]');
  const navH = () => (lnav ? lnav.offsetHeight : 0);

  /* in-page anchors: scroll under the sticky product bar */
  $$('a[href^="#"]').forEach(a => a.addEventListener('click', e => {
    const id = a.getAttribute('href');
    if (id.length < 2) return;
    const el = $(id);
    if (!el) return;
    e.preventDefault();
    window.__jumpUntil = performance.now() + 2000;
    closeMenu();
    const y = el.getBoundingClientRect().top + scrollY - (id === '#overview' ? 0 : navH() - 1);
    scrollTo({ top: id === '#overview' ? 0 : y, behavior: reduced ? 'auto' : 'smooth' });
    history.replaceState(null, '', id);
    el.setAttribute('tabindex', '-1');
    el.focus({ preventScroll: true });
  }));

  /* local nav: mark the section in view */
  if (lnav) {
    const links = $$('.lnav__links a', lnav);
    const map = new Map(links.map(a => [a.getAttribute('href').slice(1), a]));
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (!e.isIntersecting) return;
      links.forEach(a => a.removeAttribute('aria-current'));
      const a = map.get(e.target.id);
      if (a) a.setAttribute('aria-current', 'true');
    }), { rootMargin: '-40% 0px -55% 0px' });
    map.forEach((a, id) => { const s = document.getElementById(id); if (s) io.observe(s); });
  }

  /* menu */
  const menuBtn = $('[data-menu-btn]'), menu = $('[data-menu]');
  function openMenu() { menu.hidden = false; menuBtn.setAttribute('aria-expanded', 'true'); $('nav a', menu).focus(); }
  function closeMenu() { if (!menu || menu.hidden) return; menu.hidden = true; menuBtn.setAttribute('aria-expanded', 'false'); }
  if (menuBtn && menu) {
    menuBtn.addEventListener('click', () => menu.hidden ? openMenu() : (closeMenu(), menuBtn.focus()));
    menu.addEventListener('click', e => { if (e.target === menu) closeMenu(); });
    addEventListener('keydown', e => { if (e.key === 'Escape' && !menu.hidden) { closeMenu(); menuBtn.focus(); } });
    const topNav = $('.top__nav');
    if (topNav) new IntersectionObserver(e => menuBtn.classList.toggle('is-shown', !e[0].isIntersecting), { threshold: 0 }).observe(topNav);
  }

  /* magnetic buttons (same feel as the home page) */
  if (fine && !reduced) {
    $$('[data-magnetic]').forEach(el => {
      const strength = 0.28;
      let r = null;
      el.addEventListener('pointerenter', () => { r = el.getBoundingClientRect(); el.style.transition = 'transform var(--dur-250) var(--ease)'; });
      el.addEventListener('pointermove', e => {
        if (!r) r = el.getBoundingClientRect();
        el.style.transform = `translate3d(${(e.clientX - r.left - r.width / 2) * strength}px, ${(e.clientY - r.top - r.height / 2) * strength}px, 0)`;
      });
      el.addEventListener('pointerleave', () => { r = null; el.style.transition = 'transform var(--dur-900) var(--ease-back)'; el.style.transform = ''; });
    });
  }

  /* reveal: every block is fully visible at rest. A block rises in only when it enters
     from the bottom during a calm scroll. Blocks already on screen or above at load,
     anchor jumps (2 s), fast scrolls, ?shot captures and reduced motion never animate,
     and a started rise always runs to full opacity, on or off screen. */
  if (!reduced && !/[?&]shot/.test(location.search)) {
    let lastY = scrollY, lastT = performance.now(), fastUntil = 0;
    addEventListener('scroll', () => {
      const now = performance.now();
      if (Math.abs(scrollY - lastY) / Math.max(1, now - lastT) > 2.5) fastUntil = now + 450;
      lastY = scrollY; lastT = now;
    }, { passive: true });
    const ro = new IntersectionObserver(es => es.forEach(e => {
      if (!e.isIntersecting) return;
      ro.unobserve(e.target);
      const now = performance.now();
      if (now > fastUntil && now > window.__jumpUntil && e.boundingClientRect.top > innerHeight * 0.72) e.target.classList.add('is-in');
    }));
    $$('[data-reveal]').forEach(el => { if (el.getBoundingClientRect().top > innerHeight) ro.observe(el); });
  }

  /* local time in Austin */
  const clock = $('[data-clock]');
  if (clock) {
    const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' });
    const tick = () => { clock.textContent = fmt.format(new Date()) + ' in Austin'; };
    tick(); setInterval(tick, 30000);
  }
})();
