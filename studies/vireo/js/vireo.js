// Vireo: the page's own script. Everything here works without three.js; the 3D (stage.js, rig.js) is imported
// after the first paint and takes over the stage canvas when it is ready.
import { INSIDE_UI, TURN_FROM, HERO_BOX, band } from './poses.js';

const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const html = document.documentElement;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
// No WebGL 2: the 3D is never asked for and the page keeps its stills, as it does with reduced motion.
const hasGL = (() => {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return false;
    const lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext();
    return true;
  } catch (e) { return false; }
})();
if (reduced || !hasGL) html.classList.add('static');
const isStatic = () => html.classList.contains('static');
const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const vh = () => window.innerHeight;

// ------------------------------------------------------------------ one scroll loop
const onScroll = new Set(), onResize = new Set();
let ticking = false;
function flush() { ticking = false; for (const f of onScroll) f(); }
addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(flush); } }, { passive: true });
let rz = 0;
addEventListener('resize', () => { cancelAnimationFrame(rz); rz = requestAnimationFrame(() => { for (const f of onResize) f(); flush(); }); });

// ------------------------------------------------------------------ local bar: clear over the hero, then glass
{
  const bar = $('#bar'), buybar = $('#buybar'), back = $('.study-back'), themed = $$('main [data-theme], footer[data-theme]'), links = $$('.bar__nav a');
  const targets = links.map(a => $(a.getAttribute('href')));
  const update = () => {
    bar.classList.toggle('is-glass', scrollY > vh() * 0.45);
    let theme = 'dark', low = 'dark';
    for (const s of themed) { const top = s.getBoundingClientRect().top; if (top <= 24) theme = s.dataset.theme; if (top <= vh() - 44) low = s.dataset.theme; }
    if (bar.dataset.theme !== theme) bar.dataset.theme = theme;
    if (buybar.dataset.theme !== low) buybar.dataset.theme = low;
    if (back && back.dataset.theme !== theme) back.dataset.theme = theme;      // the way back is docked in the bar and takes its theme
    let here = -1;
    targets.forEach((t, i) => { if (t && t.getBoundingClientRect().top <= vh() * 0.4) here = i; });
    links.forEach((a, i) => { if (i === here) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); });
  };
  onScroll.add(update); update();
}

// ------------------------------------------------------------------ the phone's buy bar
// Only on a phone tall enough for it (CSS), and only once the hero's own copy has left the screen. It steps away
// while the page scrolls down and comes back when it scrolls up, and it is away while the gallery's controls, the
// form or the footer are on screen.
{
  const buybar = $('#buybar'), seen = new Set();
  let lastY = scrollY, down = false;
  const update = () => {
    const y = scrollY;
    if (Math.abs(y - lastY) > 6) { down = y > lastY; lastY = y; }
    const away = y < vh() * 0.9 || seen.size > 0 || down;
    if (away === isAway) return;
    isAway = away;
    clearTimeout(gone);
    buybar.inert = away;
    if (away) { buybar.classList.add('is-away'); gone = setTimeout(() => { buybar.hidden = true; }, 320); }
    else { buybar.hidden = false; requestAnimationFrame(() => requestAnimationFrame(() => buybar.classList.remove('is-away'))); }
  };
  let isAway = null, gone = 0;
  const io = new IntersectionObserver(es => {
    for (const e of es) { if (e.isIntersecting) seen.add(e.target); else seen.delete(e.target); }
    update();
  }, { rootMargin: '0px 0px -12% 0px' });
  for (const el of [$('#reserve'), $('.foot'), $('.gallery__ctl')]) io.observe(el);
  onScroll.add(update); update();
}

// ------------------------------------------------------------------ reveals: a 24 px rise, once
{
  const els = $$('.reveal');
  if (isStatic() || !('IntersectionObserver' in window)) els.forEach(e => e.classList.add('in'));
  else {
    $$('.nums .num').forEach((e, i) => { e.style.transitionDelay = i * 90 + 'ms'; });
    const io = new IntersectionObserver(es => { for (const e of es) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }, { rootMargin: '0px 0px -10% 0px', threshold: 0.12 });
    els.forEach(e => io.observe(e));
  }
}

// ------------------------------------------------------------------ hero: the light sweeps along the body once, the copy rises
const stage = $('#stage'), posterImg = $('#poster img'), hero = $('.hero');
let stageLive = false;
const sweepDone = new Promise(resolve => {
  if (isStatic()) { hero.classList.add('ready'); resolve(); return; }
  let gone = false;
  const go = () => {
    if (gone) return; gone = true;
    stage.classList.add('sweep'); hero.classList.add('ready');
    const end = () => { stage.classList.add('swept'); resolve(); };
    posterImg.addEventListener('animationend', end, { once: true });
    setTimeout(end, 2200);
  };
  if (posterImg.complete && posterImg.naturalWidth) go();
  else { posterImg.addEventListener('load', go, { once: true }); posterImg.addEventListener('error', go, { once: true }); setTimeout(go, 1500); }
});
// The hero rocket is fitted between the bar and the hero copy, 64px clear of both: the still and the live frame get the
// same scale (about the rocket's nose end) and shift. HERO_BOX is where the rocket lies in the hero still's frame.
const heroCopy = $('.hero__copy');
function containRect(W, H, aspect, ay = 0.5) { let w = W, h = W / aspect; if (h > H) { h = H; w = H * aspect; } return { x: (W - w) / 2, y: (H - h) * ay, w, h }; }
function heroFit() {
  const W = stage.clientWidth, H = stage.clientHeight, port = matchMedia('(max-aspect-ratio: 68/100)').matches;
  const R = containRect(W, H, port ? 0.62 : 1.6, port ? 0 : 0.5), b = HERO_BOX[port ? 'port' : 'land'];
  const x1 = R.x + b[2] * R.w, y0 = R.y + b[1] * R.h, y1 = R.y + b[3] * R.h;
  const m = Math.min(64, H * 0.1), top = $('#bar').offsetHeight + m;
  const bottom = heroCopy.parentElement.offsetTop + heroCopy.offsetTop + (hero.getBoundingClientRect().top - stage.getBoundingClientRect().top) - m;
  const s = Math.max(0.45, Math.min(1, (bottom - top) / (y1 - y0)));
  const ny0 = Math.min(Math.max(y0, top), bottom - (y1 - y0) * s);
  const dx = s < 1 ? Math.min(x1 * (1 - s), Math.max(0, W - 24 - x1 * s)) : 0, dy = ny0 - y0 * s;
  return { s, dx, dy: Math.abs(dy) < 0.5 ? 0 : dy };
}
const fitPoster = () => {
  const f = heroFit(), t = f.s === 1 && !f.dx && !f.dy ? '' : `translate(${f.dx.toFixed(1)}px, ${f.dy.toFixed(1)}px) scale(${f.s.toFixed(4)})`;
  for (const el of $$('.film__poster, .film__glow')) el.style.transform = t;
};
fitPoster(); onResize.add(fitPoster);
// the hero copy fades and lifts over the first part of the scroll, before the rocket turns
if (!isStatic()) {
  const heroIn = $('.hero__in');
  const lift = () => {
    const t = clamp01(scrollY / (vh() * 0.16));
    heroIn.style.opacity = (1 - t).toFixed(3);
    heroIn.style.transform = t ? `translateY(${(-t * 40).toFixed(1)}px)` : '';
    heroIn.style.visibility = t >= 1 ? 'hidden' : '';
  };
  onScroll.add(lift); lift();
}
// until the live rocket takes the stage, the still must not sit behind the statement: it fades with the scroll
if (!isStatic()) {
  const fade = () => { if (!stageLive) $('#poster').style.opacity = String(1 - clamp01(scrollY / (vh() * 0.55))); };
  onScroll.add(fade); fade();
}

// ------------------------------------------------------------------ statement: words light up as the scroll passes them
{
  const p = $('#statement');
  if (!isStatic()) {
    const words = p.textContent.trim().split(/\s+/);
    p.textContent = '';
    const spans = words.map((w, i) => { const s = document.createElement('span'); s.className = 'w'; s.textContent = w; p.append(s, i < words.length - 1 ? ' ' : ''); return s; });
    let lit = -1;
    const update = () => {
      const r = p.getBoundingClientRect(), h = vh();
      const t = clamp01((h * 0.82 - r.top) / (r.height + h * 0.3));
      const n = Math.round(t * spans.length * 1.04);
      if (n === lit) return;
      lit = n;
      spans.forEach((s, i) => s.classList.toggle('on', i < n));
    };
    onScroll.add(update); update();
  }
}

// ------------------------------------------------------------------ inside: the pinned scene's words
const inside = $('#inside'), pin = $('#insidePin'), title = $('.inside__title'), caps = $$('.cap', pin), chip = $('#turnChip');
function setInsideUI(p) {
  const rise = (el, a) => { el.style.opacity = a.toFixed(3); el.style.transform = a > 0 && a < 1 ? `translateY(${((1 - a) * 14).toFixed(1)}px)` : ''; el.style.visibility = a > 0 ? 'visible' : 'hidden'; };
  rise(title, band(INSIDE_UI.title, p));
  caps.forEach((c, i) => rise(c, band(INSIDE_UI.caps[i], p)));
  const a = stageLive ? band(INSIDE_UI.chip, p) : 0;
  chip.style.opacity = a.toFixed(3); chip.style.visibility = a > 0 ? 'visible' : 'hidden';
  // the model fades and steps back before the stage lets go of it
  const [o0, o1] = INSIDE_UI.out, out = clamp01((p - o0) / (o1 - o0));
  stage.style.setProperty('--out', out.toFixed(3));
  pin.classList.toggle('can-turn', stageLive && p >= TURN_FROM);
}
const insideProgress = () => { const r = inside.getBoundingClientRect(); return clamp01(-r.top / Math.max(1, r.height - vh())); };
if (!isStatic()) { const f = () => { if (!stageLive) setInsideUI(insideProgress()); }; onScroll.add(f); f(); }

// ------------------------------------------------------------------ the short version: a gallery that snaps and advances
{
  const root = $('#gallery'), track = $('#galleryTrack'), cards = $$('.card', track), dots = $$('.dot', root), play = $('#galleryPlay');
  const HOLD = 5000;
  let index = 0, paused = reduced, inView = false, held = false, t0 = performance.now(), elapsed = 0, raf = 0;
  const edge = () => parseFloat(getComputedStyle(track).paddingLeft) || 0;
  const leftOf = i => Math.min(cards[i].offsetLeft - edge(), track.scrollWidth - track.clientWidth);
  const setFill = v => dots[index].style.setProperty('--fill', v.toFixed(3));
  function mark(i) {
    if (i === index) return;
    dots[index].removeAttribute('aria-current'); dots[index].style.removeProperty('--fill');
    index = i;
    dots[index].setAttribute('aria-current', 'true');
    elapsed = 0; t0 = performance.now(); setFill(paused ? 1 : 0);
  }
  function go(i, smooth = true) {
    i = (i + cards.length) % cards.length;
    track.scrollTo({ left: leftOf(i), behavior: smooth && !reduced ? 'smooth' : 'auto' });
    mark(i);
  }
  const running = () => !paused && inView && !held && !document.hidden;
  function tick(now) {
    raf = 0;
    if (!running()) return;
    elapsed += now - t0; t0 = now;
    if (elapsed >= HOLD) go(index + 1); else setFill(elapsed / HOLD);
    raf = requestAnimationFrame(tick);
  }
  const kick = () => { t0 = performance.now(); if (running() && !raf) raf = requestAnimationFrame(tick); };
  let st = 0;
  track.addEventListener('scroll', () => {
    clearTimeout(st);
    st = setTimeout(() => {                         // settled: which card is at the start
      let best = 0, bd = Infinity;
      cards.forEach((c, i) => { const d = Math.abs(leftOf(i) - track.scrollLeft); if (d < bd) { bd = d; best = i; } });
      mark(best);
    }, 90);
  }, { passive: true });
  dots.forEach((d, i) => d.addEventListener('click', () => { go(i); kick(); }));
  track.addEventListener('keydown', e => {
    const to = { ArrowRight: Math.min(cards.length - 1, index + 1), ArrowLeft: Math.max(0, index - 1), Home: 0, End: cards.length - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault(); go(to); kick();
  });
  const hold = v => () => { held = v; if (!v) { elapsed = 0; } kick(); };
  track.addEventListener('pointerdown', hold(true)); addEventListener('pointerup', () => { if (held) hold(false)(); }); addEventListener('pointercancel', () => { if (held) hold(false)(); });
  track.addEventListener('focusin', hold(true)); track.addEventListener('focusout', hold(false));
  function setPaused(v) {
    paused = v;
    play.setAttribute('aria-pressed', String(v));
    play.setAttribute('aria-label', v ? 'Play the highlights' : 'Pause the highlights');
    if (v) setFill(1); else { elapsed = 0; setFill(0); }
    kick();
  }
  play.addEventListener('click', () => setPaused(!paused));
  setPaused(paused);
  new IntersectionObserver(es => { inView = es[es.length - 1].isIntersecting; kick(); }, { threshold: 0.5 }).observe(track);
  document.addEventListener('visibilitychange', kick);
  onResize.add(() => go(index, false));
}

// ------------------------------------------------------------------ look closer: plus pills, one open at a time
// Until (or unless) the live view runs, the panel shows a rendered still of the opened part.
const closerPoster = $('.closer__poster');
const CLOSER_ALT = {
  whole: 'CHARGER whole, at an angle on a light gray studio.',
  nose: 'The nose cone of CHARGER, solid, with the rest of the rocket drawn as a faint ghost behind it.',
  payload: 'The payload inside the upper tube, solid, with the rest of the rocket drawn as a faint ghost.',
  camera: 'The camera and its mount in the forward assembly, solid, with the rest of the rocket drawn as a faint ghost.',
  mount: 'The motor mount, the motor and the screw cap, solid, with the rest of the rocket drawn as a faint ghost.',
  fins: 'The four fins, solid, with the rest of the rocket drawn as a faint ghost.',
  recovery: 'The lower shock cord mount, solid, with the rest of the rocket drawn as a faint ghost.',
};
function still(key) {
  const k = key || 'whole', img = $('img', closerPoster), src = $('source', closerPoster);
  if (closerPoster.dataset.part === k) return;
  closerPoster.dataset.part = k;
  src.srcset = `assets/closer-${k}-port.webp`; img.src = `assets/closer-${k}-land.webp`;
  img.alt = CLOSER_ALT[k];
}
const closer = (() => {
  const items = $$('.plus'), listeners = new Set();
  let current = null;
  function open(key, quiet = false) {
    current = key;
    for (const li of items) {
      const on = li.dataset.part === key;
      li.classList.toggle('is-open', on);
      $('.plus__btn', li).setAttribute('aria-expanded', String(on));
    }
    still(key);
    if (!quiet) for (const f of listeners) f(current);
  }
  for (const li of items) $('.plus__btn', li).addEventListener('click', () => open(li.dataset.part === current ? null : li.dataset.part));
  open(items[0].dataset.part, true);
  return { get current() { return current; }, onChange: f => listeners.add(f) };
})();

// ------------------------------------------------------------------ flight: the curve draws with the scroll
{
  const chart = $('#chart'), svgs = $$('.chart__svg', chart).map(svg => {
    const line = $('.chart__line', svg), head = $('.chart__head', svg), L = line.getTotalLength();
    line.style.strokeDasharray = `${L} ${L}`;
    // where along the line each event sits
    const marks = $$('.mark', svg).map(g => {
      const x = +g.dataset.x, y = +g.dataset.y; let at = 0, bd = Infinity;
      for (let i = 0; i <= 400; i++) { const p = line.getPointAtLength(L * i / 400), d = (p.x - x) ** 2 + (p.y - y) ** 2; if (d < bd) { bd = d; at = i / 400; } }
      return { g, at };
    });
    return { svg, line, head, L, marks };
  });
  let cur = isStatic() ? 1 : 0, goal = cur, raf = 0;
  function draw() {
    for (const s of svgs) {
      s.line.style.strokeDashoffset = String(s.L * (1 - cur));
      const p = s.line.getPointAtLength(s.L * cur);
      s.head.setAttribute('cx', p.x.toFixed(1)); s.head.setAttribute('cy', p.y.toFixed(1));
      for (const m of s.marks) m.g.classList.toggle('on', cur >= m.at - 0.004);
    }
  }
  function step() {
    raf = 0;
    cur += (goal - cur) * 0.14;
    if (Math.abs(goal - cur) < 0.0015) cur = goal;
    draw();
    if (cur !== goal) raf = requestAnimationFrame(step);
  }
  const update = () => {
    if (isStatic()) return;
    const r = chart.getBoundingClientRect(), h = vh();
    goal = clamp01((h * 0.86 - r.top) / (r.height * 0.8 + h * 0.22));
    if (goal !== cur && !raf) raf = requestAnimationFrame(step);
  };
  draw(); onScroll.add(update); update();
}

// ------------------------------------------------------------------ flight: numerals count up as they enter
if (!isStatic()) {
  const fmt = (v, dec, sep) => { const s = v.toFixed(dec); return sep ? s.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : s; };
  const io = new IntersectionObserver(es => {
    for (const e of es) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      const el = e.target, end = +el.dataset.count, dec = +(el.dataset.dec || 0), sep = !!el.dataset.sep, t0 = performance.now(), D = 900;
      el.style.minWidth = el.getBoundingClientRect().width + 'px';
      const step = now => {
        const t = clamp01((now - t0) / D), k = 1 - (1 - t) ** 4;
        el.textContent = fmt(end * k, dec, sep);
        if (t < 1) requestAnimationFrame(step); else { el.textContent = fmt(end, dec, sep); el.style.minWidth = ''; }
      };
      el.textContent = fmt(0, dec, sep);
      requestAnimationFrame(step);
    }
  }, { rootMargin: '0px 0px -6% 0px', threshold: 0.3 });
  $$('.num__v').forEach(el => io.observe(el));
}

// ------------------------------------------------------------------ flight: five live traces (shapes only: the channels are not named)
{
  const box = $('#tele'), rows = $$('canvas', box);
  const SHAPES = [
    (x, t) => Math.sin(x * 2.2 - t * 0.9) * 0.55 + Math.sin(x * 5.1 - t * 1.7) * 0.18,
    (x, t) => Math.sin(x * 9 - t * 3.2) * 0.3 * (0.6 + 0.4 * Math.sin(x * 1.3 - t * 0.5)) + Math.sin(x * 23 - t * 7) * 0.08,
    (x, t) => Math.tanh(Math.sin(x * 3.1 - t * 1.1) * 4) * 0.42 + Math.sin(x * 17 - t * 5) * 0.05,
    (x, t) => Math.sin(x * 1.4 - t * 0.6) * 0.62,
    (x, t) => { const u = ((x * 1.6 - t * 0.8) % 1 + 1) % 1; return Math.exp(-u * 5) * Math.sin(u * 40) * 0.7; },
  ];
  let inView = false, raf = 0, last = 0, T = 3;
  function size() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    for (const c of rows) { const r = c.getBoundingClientRect(); c.width = Math.max(2, Math.round(r.width * dpr)); c.height = Math.round(40 * dpr); }
  }
  function draw() {
    rows.forEach((c, k) => {
      const g = c.getContext('2d'), W = c.width, Hh = c.height, f = SHAPES[k];
      g.clearRect(0, 0, W, Hh);
      g.lineWidth = Math.max(1, Hh / 32); g.lineJoin = 'round'; g.lineCap = 'round';
      const grad = g.createLinearGradient(0, 0, W, 0);
      grad.addColorStop(0, 'rgba(245,245,247,0)'); grad.addColorStop(0.12, 'rgba(245,245,247,.5)'); grad.addColorStop(1, 'rgba(245,245,247,.95)');
      g.strokeStyle = grad;
      g.beginPath();
      const n = Math.ceil(W / 3);
      for (let i = 0; i <= n; i++) { const x = i / n, y = Hh / 2 - f(x * 6, T + k * 1.7) * Hh * 0.42; i ? g.lineTo(x * (W - 5), y) : g.moveTo(0, y); }
      g.stroke();
      g.fillStyle = '#ff5b1f';
      g.beginPath(); g.arc(W - 5, Hh / 2 - f(6, T + k * 1.7) * Hh * 0.42, Math.max(2, Hh / 16), 0, 7); g.fill();
    });
  }
  function tick(now) {
    raf = 0;
    if (!inView || document.hidden || isStatic()) return;
    if (now - last > 30) { T += Math.min(0.1, (now - last) / 1000); last = now; draw(); }
    raf = requestAnimationFrame(tick);
  }
  const kick = () => { last = performance.now(); if (!raf && inView && !document.hidden && !isStatic()) raf = requestAnimationFrame(tick); };
  size(); draw();
  onResize.add(() => { size(); draw(); });
  new IntersectionObserver(es => { inView = es[es.length - 1].isIntersecting; kick(); }).observe(box);
  document.addEventListener('visibilitychange', kick);
}

// ------------------------------------------------------------------ reserve: pick a kit, leave an email, read the confirmation
{
  const form = $('#order'), done = $('#done'), email = $('#email'), field = $('.field', form), kitErr = $('#kitErr'), emailErr = $('#emailErr');
  const picked = () => $('input[name="kit"]:checked', form);
  const okEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
  form.addEventListener('change', e => { if (e.target.name === 'kit') kitErr.hidden = true; });
  email.addEventListener('input', () => { emailErr.hidden = true; field.classList.remove('is-bad'); email.removeAttribute('aria-invalid'); });
  form.addEventListener('submit', e => {
    e.preventDefault();                               // nothing is sent: no action, no request
    const kit = picked(), value = email.value.trim(), good = okEmail(value);
    kitErr.hidden = !!kit;
    emailErr.hidden = good; field.classList.toggle('is-bad', !good);
    if (!good) email.setAttribute('aria-invalid', 'true');
    if (!kit) { $('input[name="kit"]', form).focus(); return; }
    if (!good) { email.focus(); return; }
    $('#doneLine').textContent = `${kit.value}, ${kit.dataset.price}, for ${value}.`;
    form.hidden = true; done.hidden = false; done.classList.add('in');
    done.focus({ preventScroll: true });
    done.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
  });
  $('#doneBack').addEventListener('click', () => {
    form.reset(); done.hidden = true; done.classList.remove('in'); form.hidden = false;
    $('input[name="kit"]', form).focus();
  });
}

// ------------------------------------------------------------------ the 3D, after the first paint
{
  const api = {
    reduced: isStatic(), stage, canvas: $('#canvas'), poster: $('#poster'), film: $('.film'), statement: $('.statement'), inside, pin, chip,
    closerView: $('#closerView'), closer, setInsideUI, sweepDone, onScroll, onResize, heroFit,
    live() { stageLive = true; },
  };
  let asked = false;
  const load = () => {
    if (asked) return; asked = true;
    import('./stage.js').then(m => m.mount(api)).catch(e => {
      console.warn('[vireo] 3D unavailable, the stills stay', e);
      if (!stageLive && !isStatic()) { html.classList.add('static'); $('#poster').style.opacity = ''; for (const el of [title, ...caps]) { el.style.opacity = ''; el.style.transform = ''; el.style.visibility = ''; } $$('.reveal').forEach(el => el.classList.add('in')); }
    });
  };
  const idle = window.requestIdleCallback || (f => setTimeout(f, 200));
  if (!hasGL) { /* stills only */ }
  else if (isStatic()) new IntersectionObserver((es, io) => { if (es.some(e => e.isIntersecting)) { io.disconnect(); load(); } }, { rootMargin: '120% 0px' }).observe(api.closerView);
  else if (document.readyState === 'complete') idle(load, { timeout: 1200 });
  else addEventListener('load', () => idle(load, { timeout: 1200 }), { once: true });
}
