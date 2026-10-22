(() => {
  const SCRIPT = document.currentScript && document.currentScript.src;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canHover = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const CASE = 'https://merttureli.com/projects/';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };

  // Every fact below is from the live site copy.
  const BUILDS = [
    { key: 'charger', tag: 'Airframe / Payload', name: 'CHARGER', rest: ' airframe and payload', org: 'Union College Rocket Team', year: '2026',
      meta: 'Union College Rocket Team, 2026 / Captain and chief engineer', href: CASE + 'charger.html',
      fig: '1ST', figL: 'Battle of the Rockets 2026, Deployable Sensor Payload event',
      rows: [['Length', '37 IN'], ['Apogee, sim.', '1,033 FT'], ['Descent', '13.8 FT/S']], explorer: true },
    { key: 'hotbox', tag: 'Thermal / Instrumentation', name: 'HOTBOX', rest: ' thermal test bench', org: 'SunThru', year: '2026',
      meta: 'SunThru, 2026 / Design, electronics, firmware, safety', href: null,
      fig: '60 MIN', figL: 'Readings must hold steady for a full hour before a result is accepted',
      rows: [['Runs', 'OVERNIGHT'], ['Reads', 'HEAT FLOW'], ['Cost, approx.', '1/4 QUOTE']], ip: true },
    { key: 'robo-catcher', tag: 'Mechanism / Electronics / Firmware', name: 'Robo-Catcher', rest: ', senior capstone', org: 'Union College', year: '2025',
      meta: 'Senior capstone, 2025 / Twelve person team', href: CASE + 'robo-catcher.html',
      fig: '100%', figL: 'Feed indexing reliability on competition day',
      rows: [['Assembly', '84 PARTS'], ['I owned', 'ELEC + FW'], ['Budget', 'UNDER']] },
    { key: 'bend-fixture', tag: 'Design for manufacture', name: 'Three-point bend fixture', rest: ' and data logger', org: 'SunThru', year: '2026',
      meta: 'SunThru, 2026 / Solo design', href: CASE + 'bend-fixture.html',
      fig: '3-PT', figL: 'Flexural test fixture for aerogel, too fragile for off the shelf fixtures',
      rows: [['Build', '3D PRINTED'], ['Parts', 'INTERLOCKING'], ['Status', 'IN USE']], ip: true },
    { key: 'rudder-pedals', tag: 'Mechanism / Firmware', name: 'Flight sim rudder pedals', rest: '', org: 'personal project', year: '2026',
      meta: 'Personal project, 2026 / Solo', href: CASE + 'rudder-pedals.html',
      fig: '3 AXIS', figL: 'Rudder and toe brakes with contactless magnetic sensing',
      rows: [['Firmware', 'USB HID'], ['Drivers', 'NONE'], ['Sensing', 'HALL']] },
    { key: 'therma-shift', tag: 'Thermal / Control electronics', name: 'Therma-Shift', rest: ' coaster', org: 'personal project', year: '2026',
      meta: 'Personal project, 2026 / Solo', href: CASE + 'therma-shift.html',
      fig: 'HOT/COLD', figL: 'Actively heats or cools any mug or glass, closed loop',
      rows: [['Control', 'CLOSED LOOP'], ['Safety', 'RUNAWAY CUT'], ['Top', 'ALUMINUM']] }
  ];
  const pad = (n) => String(n).padStart(2, '0');
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

  /* ---------- dot-matrix scan-in ---------- */
  const GLYPHS = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789';
  function scan(el, dur = 820) {
    const final = el.dataset.final || el.textContent;
    el.dataset.final = final;
    if (reduced) { el.textContent = final; return; }
    cancelAnimationFrame(el._raf);
    const parts = final.split(/(\d[\d,]*(?:\.\d+)?)/);
    const t0 = performance.now();
    el.style.whiteSpace = 'pre';
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      let out = '';
      parts.forEach((tk, i) => {
        if (i % 2) {
          const dec = (tk.split('.')[1] || '').length, v = parseFloat(tk.replace(/,/g, '')) * e;
          let s = v.toFixed(dec);
          if (tk.includes(',')) s = Number(s).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
          out += s.padStart(tk.length, ' ');
        } else {
          for (let j = 0; j < tk.length; j++) {
            const c = tk[j];
            out += (/[A-Z]/i.test(c) && p < 0.35 + j * 0.06) ? GLYPHS[(Math.random() * GLYPHS.length) | 0] : c;
          }
        }
      });
      el.textContent = p < 1 ? out : final;
      if (p < 1) el._raf = requestAnimationFrame(step); else el.style.whiteSpace = '';
    };
    el._raf = requestAnimationFrame(step);
  }
  const scanIO = new IntersectionObserver((entries) => {
    entries.forEach((en) => { if (en.isIntersecting) { scanIO.unobserve(en.target); setTimeout(() => scan(en.target), (+en.target.dataset.delay || 0)); } });
  }, { threshold: 0.6 });

  /* ---------- specimen grid ---------- */
  const grid = $('#grid');
  grid.innerHTML = BUILDS.map((b, i) => `
    <li class="spec" data-i="${i}">
      <div class="plate plate-ink">
        <img class="study" src="assets/img/study-${b.key}.webp" width="800" height="1000" alt="${esc(b.name + b.rest)}, white study model" loading="${i < 3 ? 'eager' : 'lazy'}" decoding="async">
        <img class="real" data-src="assets/img/real-${b.key}.webp" alt="" decoding="async">
        <span class="p-no dot">S-${pad(i + 1)}</span>
        <span class="p-tag">${b.tag}</span>
        <span class="p-foot" aria-hidden="true"><span class="p-ruler"></span><span>Plate ${pad(i + 1)} / ${pad(BUILDS.length)}</span></span>
        <button type="button" class="plate-hit" aria-pressed="false" aria-label="Show the real ${esc(b.name)} and its specs"></button>
        <div class="p-specs">
          <p class="p-key"><span class="dot" data-final="${b.fig}">${b.fig}</span><span>${b.figL}</span></p>
          <dl class="p-rows">${b.rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
          ${b.explorer ? `<a class="p-link" href="../../assets/charger-explorer/index.html" data-explorer>Explore in 3D <span aria-hidden="true">↗</span></a>`
            : b.href ? `<a class="p-link" href="${b.href}">Case study <span aria-hidden="true">↗</span></a>` : `<span class="p-ip">IP protected, shown blurred</span>`}
        </div>
      </div>
      <div class="cap">
        <h3>${b.href ? `<a href="${b.href}">${esc(b.name + b.rest)}</a>` : esc(b.name + b.rest)}</h3>
        <p>${b.meta}</p>
      </div>
    </li>`).join('');

  const specs = $$('.spec', grid);
  const loadReal = (spec) => { const r = $('.real', spec); if (r && !r.src) r.src = r.dataset.src; };
  const nearIO = new IntersectionObserver((entries) => entries.forEach((en) => { if (en.isIntersecting) { nearIO.unobserve(en.target); loadReal(en.target); } }), { threshold: 0.3 });
  function setOn(spec, on) {
    if (spec.classList.contains('is-on') === on) return;
    loadReal(spec);
    spec.classList.toggle('is-on', on);
    $('.plate-hit', spec).setAttribute('aria-pressed', String(on));
    if (on) { const k = $('.p-key .dot', spec); scan(k, 560); $$('.p-rows dd', spec).forEach((d, j) => { d.dataset.final = d.dataset.final || d.textContent; setTimeout(() => scan(d, 480), 80 + j * 60); }); }
  }
  specs.forEach((spec) => {
    nearIO.observe(spec);
    const hit = $('.plate-hit', spec), b = BUILDS[+spec.dataset.i];
    let lastType = 'mouse';
    spec.addEventListener('pointerenter', (e) => { lastType = e.pointerType; if (e.pointerType === 'mouse') setOn(spec, true); });
    spec.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') setOn(spec, false); });
    hit.addEventListener('pointerdown', (e) => { lastType = e.pointerType; });
    hit.addEventListener('click', () => {
      if (lastType === 'mouse' && canHover) {
        const link = $('.p-link', spec);
        if (link) { link.click(); return; }
      }
      const on = !spec.classList.contains('is-on');
      if (on) specs.forEach((o) => o !== spec && setOn(o, false));
      setOn(spec, on);
    });
    spec.addEventListener('focusin', () => setOn(spec, true));
    spec.addEventListener('focusout', (e) => { if (!spec.contains(e.relatedTarget)) setOn(spec, false); });
  });

  /* ---------- index view ---------- */
  const list = $('#indexList'), viewer = $('.viewer'), vStill = $('.viewer-still'), vTurn = $('.viewer-turn'), vNo = $('.viewer-no'), vCap = $('.viewer-cap');
  list.innerHTML = BUILDS.map((b, i) => {
    const inner = `<span class="ix-n">${pad(i + 1)}</span><b>${esc(b.name)}</b>${esc(b.rest)}, ${esc(b.org)}, ${b.year}${b.href || b.explorer ? '<span class="ix-go" aria-hidden="true">↗</span>' : ''}`;
    return `<li>${b.href ? `<a class="ix" data-i="${i}" href="${b.href}">${inner}</a>` : `<span class="ix" data-i="${i}" tabindex="0">${inner}</span>`}</li>`;
  }).join('');
  let cur = -1;
  function setViewer(i) {
    if (i === cur) return; cur = i;
    const b = BUILDS[i];
    $$('.ix', list).forEach((x) => x.classList.toggle('is-cur', +x.dataset.i === i));
    vStill.src = `assets/img/study-${b.key}.webp`;
    vNo.textContent = 'S-' + pad(i + 1); scan(vNo, 380);
    vCap.textContent = b.tag;
    viewer.classList.remove('playing');
    if (reduced) return;
    vTurn.src = `assets/video/turn-${b.key}.mp4`;
    vTurn.currentTime = 0;
    const p = vTurn.play();
    if (p) p.then(() => viewer.classList.add('playing')).catch(() => {});
  }
  $$('.ix', list).forEach((x) => {
    x.addEventListener('pointerenter', () => setViewer(+x.dataset.i));
    x.addEventListener('focus', () => setViewer(+x.dataset.i));
  });
  if (!canHover) {
    const rowIO = new IntersectionObserver((en) => en.forEach((e) => { if (e.isIntersecting) setViewer(+e.target.dataset.i); }), { rootMargin: '-40% 0px -40% 0px' });
    $$('.ix', list).forEach((x) => rowIO.observe(x));
  }

  /* ---------- view switch ---------- */
  const views = $('#views'), idx = $('#index');
  function setView(v, save) {
    views.dataset.view = v;
    grid.hidden = v !== 'grid'; idx.hidden = v !== 'index';
    $$('.switch button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === v)));
    if (v === 'index') { cur = -1; setViewer(0); } else { vTurn.pause(); }
    const shown = v === 'grid' ? grid : idx;
    if (!reduced && save) shown.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 380, easing: 'cubic-bezier(.16,1,.3,1)' });
    if (save) store.set('mt-view', v);
  }
  $$('.switch button').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view, true)));
  const qv = new URLSearchParams(location.search).get('view');
  if (qv === 'index' || store.get('mt-view') === 'index') setView('index', false);

  /* ---------- scan targets ---------- */
  $$('[data-scan]').forEach((el, i) => {
    if (el.closest('.hp-read')) { el.dataset.delay = 300 + (i % 4) * 110; }
    scanIO.observe(el);
  });

  /* ---------- dock + section counter ---------- */
  const dock = $('#dock'), dockNo = $('#dockNo');
  const secs = ['work', 'experience', 'beyond', 'websites', 'contact'].map((id) => document.getElementById(id));
  let ticking = false;
  const onScroll = () => {
    if (ticking) return; ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      dock.classList.toggle('is-on', scrollY > innerHeight * 0.75);
      let n = 0; secs.forEach((s, i) => { if (s.getBoundingClientRect().top < innerHeight * 0.5) n = i + 1; });
      const here = n ? '#' + secs[n - 1].id : '';
      document.querySelectorAll('.top-nav a, .dock a').forEach((a) => a.classList.toggle('is-here', a.getAttribute('href') === here));
      const t = pad(n) + '/05'; if (dockNo.textContent !== t) dockNo.textContent = t;
    });
  };
  addEventListener('scroll', onScroll, { passive: true }); onScroll();

  /* ---------- Austin clock ---------- */
  const clock = $('#clock');
  try {
    const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Chicago', hour: '2-digit', minute: '2-digit', hour12: false });
    const tick = () => { clock.textContent = fmt.format(new Date()); };
    tick(); setInterval(tick, 20000);
  } catch (e) {}

  /* ---------- explorer entry: the plate opens into the explorer ---------- */
  const wipe = $('#wipe');
  document.addEventListener('click', (e) => {
    const a = e.target.closest('#openExplorer, [data-explorer]');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || reduced) return;
    e.preventDefault();
    const src = a.closest('.plate, .hero-plate') || a;
    const r = src.getBoundingClientRect();
    wipe.classList.remove('go');
    wipe.style.cssText = `--t:${r.top}px;--r:${innerWidth - r.right}px;--b:${innerHeight - r.bottom}px;--l:${r.left}px;opacity:1`;
    void wipe.offsetWidth;
    wipe.classList.add('go');
    wipe.style.cssText = '--t:0px;--r:0px;--b:0px;--l:0px;opacity:1';
    setTimeout(() => { location.href = a.href; }, 400);
  });
  addEventListener('pageshow', () => { wipe.classList.remove('go'); wipe.style.cssText = ''; });

  /* ---------- 3D hero, after the page has loaded ---------- */
  const q = new URLSearchParams(location.search);
  if (q.get('gl') !== '0') {
    const go = () => import(new URL('hero.js', SCRIPT).href).then((m) => m.startHero({ force: q.get('gl') === '1' })).catch(() => {});
    const later = () => ('requestIdleCallback' in window) ? requestIdleCallback(go, { timeout: 1200 }) : setTimeout(go, 300);
    if (document.readyState === 'complete') later(); else addEventListener('load', later, { once: true });
  }
})();
