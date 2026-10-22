// LAUNCH homepage: HUD clock, scroll choreography for the hero, mission manifest, menu.
(() => {
  const $ = id => document.getElementById(id);
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const seg = (p, a, b) => clamp((p - a) / (b - a));
  const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  // ---------- Austin local time in the HUD ----------
  const fmt = new Intl.DateTimeFormat('en-US', {timeZone: 'America/Chicago', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZoneName: 'short'});
  const clock = $('clock'), clock2 = $('clock2'), tz = $('tz');
  function tick() {
    const parts = Object.fromEntries(fmt.formatToParts(new Date()).map(p => [p.type, p.value]));
    clock.textContent = `${parts.hour}:${parts.minute}:${parts.second}`;
    tz.textContent = parts.timeZoneName || 'CT';
    if (clock2) clock2.textContent = `${parts.hour}:${parts.minute} ${parts.timeZoneName || ''}`.trim();
  }
  tick(); setInterval(tick, 1000);

  // ---------- hero scroll state ----------
  const launch = document.querySelector('.launch'), stage = $('stage'), hud = $('hud');
  const resolveEl = $('resolve'), phases = [...document.querySelectorAll('.ph')];
  const darkSections = [...document.querySelectorAll('[data-theme="dark"]')].filter(n => n !== hud);
  const navLinks = [...document.querySelectorAll('.hud-nav a')];
  const sections = navLinks.map(a => document.querySelector(a.getAttribute('href')));
  let hero = null, ticking = false, lastP = -1, heroVisible = true;

  function update() {
    ticking = false;
    const rect = launch.getBoundingClientRect();
    const travel = Math.max(1, rect.height - innerHeight);
    const p = clamp(-rect.top / travel);
    heroVisible = rect.bottom > 0;
    if (p !== lastP) {
      lastP = p;
      const a = seg(p, .08, .26), k = ease(seg(p, .5, .78)), s = ease(seg(p, .74, .92));
      stage.style.setProperty('--p', p.toFixed(4));
      stage.style.setProperty('--a', a.toFixed(4));
      stage.style.setProperty('--k', k.toFixed(4));
      stage.style.setProperty('--s', s.toFixed(4));
      stage.classList.toggle('is-spec', s > .5);
      const r = Math.round(ease(seg(p, .04, .42)) * 100);
      resolveEl.textContent = String(r).padStart(3, '0');
      const ph = p < .1 ? 0 : p < .55 ? 1 : 2;
      phases.forEach((n, i) => n.classList.toggle('is-on', i === ph));
      hero?.setProgress(p);
    }
    hero?.setActive(heroVisible);
    // HUD theme: what sits under it
    let theme = 'light';
    if (heroVisible && rect.top <= 0 && lastP < .76) theme = 'dark';
    for (const s of darkSections) { const r = s.getBoundingClientRect(); if (r.top <= 28 && r.bottom > 28) theme = 'dark'; }
    if (hud.dataset.theme !== theme) hud.dataset.theme = theme;
    hud.classList.toggle('is-solid', !heroVisible || rect.bottom < innerHeight * .2);
    // current section in nav
    let here = -1;
    sections.forEach((s, i) => { if (s && s.getBoundingClientRect().top < innerHeight * .4) here = i; });
    navLinks.forEach((a, i) => a.classList.toggle('is-here', i === here));
  }
  const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
  addEventListener('scroll', onScroll, {passive: true});
  addEventListener('resize', onScroll);
  update();

  // keyboard: focusing a control in the spec sheet brings the spec phase into view
  const spec = $('spec');
  spec.addEventListener('focusin', () => {
    if (lastP < .9) {
      const travel = launch.offsetHeight - innerHeight;
      scrollTo({top: launch.offsetTop + travel * .95, behavior: 'auto'});
    }
  });

  // ---------- 3D: load after first paint ----------
  const poster = $('poster');
  function showPoster() {
    poster.hidden = false;
    requestAnimationFrame(() => poster.classList.add('is-on'));
    document.documentElement.classList.add('no-gl');
  }
  function webglOK() {
    try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
  }
  const saveData = navigator.connection && navigator.connection.saveData;
  function boot() {
    if (!webglOK() || saveData) { showPoster(); $('loadStatus').textContent = ''; return; }
    $('loadStatus').textContent = 'Loading geometry';
    let settled = false;
    const slow = setTimeout(() => { if (!settled) showPoster(); }, 9000);
    import('./hero3d.min.js').then(m => {
      hero = m.start({
        stage, host: $('gl'), overlay: $('dims'), status: $('loadStatus'), base: '../../assets/charger-explorer/', reduced,
        onReady() { settled = true; clearTimeout(slow); poster.classList.remove('is-on'); hero.setProgress(lastP); stage.classList.add('gl-ready'); },
        onFail(err) { settled = true; clearTimeout(slow); console.warn('3D unavailable', err); showPoster(); $('loadStatus').textContent = ''; },
      });
      if (!hero) showPoster(); else hero.setProgress(lastP);
    }).catch(err => { console.warn(err); showPoster(); });
  }
  if (document.readyState === 'complete') setTimeout(boot, 60);
  else addEventListener('load', () => setTimeout(boot, 60), {once: true});

  // ---------- missions manifest ----------
  const rows = [...document.querySelectorAll('.msn')];
  const pvs = new Map([...document.querySelectorAll('.pv')].map(n => [n.dataset.key, n]));
  const pvNo = $('pvNo'), pvCap = $('pvCap');
  const caps = {
    charger: 'Pad one, Culpeper, Virginia, April 2026',
    hotbox: 'Render blurred, IP protected',
    robo: 'Full 84 part assembly',
    bend: 'Render blurred, IP protected',
    rudder: 'Three axis, magnetic sensing',
    therma: 'Aluminum top, solid state core',
  };
  const wide = matchMedia('(min-width: 760px) and (hover: hover)');
  let current = 'charger';
  function activate(row) {
    const key = row.dataset.media;
    rows.forEach(r => r.classList.toggle('is-active', r === row));
    if (key === current) return;
    current = key;
    pvs.forEach((n, k) => {
      const on = k === key; n.classList.toggle('is-on', on);
      const vid = n.querySelector('video');
      if (vid && !on) vid.pause();
    });
    const n = pvs.get(key);
    pvNo.textContent = row.querySelector('.msn-no').textContent;
    pvCap.textContent = caps[key] || '';
    if (n && n.dataset.video && wide.matches && !reduced) {
      let vid = n.querySelector('video');
      if (!vid) {
        vid = document.createElement('video');
        Object.assign(vid, {muted: true, loop: true, playsInline: true, preload: 'auto'});
        vid.setAttribute('muted', ''); vid.setAttribute('aria-hidden', 'true');
        vid.src = n.dataset.video;
        vid.addEventListener('canplay', () => { if (n.classList.contains('is-on')) { n.querySelector('img').style.opacity = 0; vid.play().catch(() => {}); } }, {once: true});
        n.appendChild(vid);
      } else if (vid.readyState > 2) vid.play().catch(() => {});
    }
  }
  if (rows.length) {
    rows[0].classList.add('is-active');
    const io = new IntersectionObserver(entries => {
      for (const e of entries) if (e.isIntersecting) activate(e.target);
    }, {rootMargin: '-42% 0px -52% 0px'});
    rows.forEach(r => {
      io.observe(r);
      r.addEventListener('pointerenter', () => { if (wide.matches) activate(r); });
      r.addEventListener('focusin', () => activate(r));
    });
  }

  // ---------- phone menu ----------
  const btn = $('menuBtn'), menu = $('menu');
  function setMenu(open) {
    btn.setAttribute('aria-expanded', String(open)); menu.hidden = !open;
    btn.textContent = open ? 'Close' : 'Menu';
    if (open) hud.dataset.menu = 'open'; else delete hud.dataset.menu;
  }
  btn.addEventListener('click', () => setMenu(menu.hidden));
  menu.addEventListener('click', e => { if (e.target.closest('a')) setMenu(false); });
  addEventListener('keydown', e => { if (e.key === 'Escape' && !menu.hidden) { setMenu(false); btn.focus(); } });
})();
