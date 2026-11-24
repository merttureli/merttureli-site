// Batterymate: the page. Everything the first view needs; the 3D machine (machine.js, three.js) loads after it.
// Nothing here talks to a server: no fetch, no form action. The booking is checked and answered in the page.
const html = document.documentElement;
const still = html.classList.contains('still');            // prefers-reduced-motion (set in <head>; study.js reloads on change)
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const win = (t, a, b) => clamp01((t - a) / (b - a));
const ease = t => t * t * (3 - 2 * t);
const barH = () => parseFloat(getComputedStyle(html).getPropertyValue('--bar')) || 60;

// ------------------------------------------------------------------ scroll
// One reader of the scroll position; everything that follows the scroll is called from one frame.
const followers = [];
let ticking = false, vh = innerHeight, vw = html.clientWidth, pageP = 0;
function onFrame() {
  ticking = false;
  const max = Math.max(1, html.scrollHeight - vh);
  pageP = clamp01(scrollY / max);
  for (const f of followers) f(scrollY, pageP);
}
const request = () => { if (!ticking) { ticking = true; requestAnimationFrame(onFrame); } };
addEventListener('scroll', request, { passive: true });
addEventListener('resize', () => { vh = innerHeight; vw = html.clientWidth; layouts.forEach(f => f()); request(); });
const layouts = [];

// ------------------------------------------------------------------- field
// The chalk lines of a softball field, to scale (feet), fixed to the window behind every band. Each band shows its
// part in its own line color (clip-path on the band). The drawing drifts up as the page is read and its lines are
// drawn as they come into view: the outfield first, home plate last. Still: the whole field, drawn, not moving.
{
  const tpl = $('#field'), FW = 320, FH = 262;
  const fields = $$('[data-field]').map(band => {
    const svg = tpl.content.firstElementChild.cloneNode(true);
    band.prepend(svg);
    return { band, svg, paths: $$('path', svg).map(el => { const [a, b] = el.dataset.w.split(' ').map(Number); return { el, a, b, v: -1 }; }) };
  });
  let H = 0, top = 0, intro = still ? 1 : 0;
  layouts.push(() => {
    const s = still ? Math.min((vh - barH()) / FH, Math.max(vw / FW, 3)) : Math.max(vw / 290, vh * 1.35 / FH);
    H = FH * s; top = barH();
    for (const f of fields) { f.svg.style.width = FW * s + 'px'; f.svg.style.height = H + 'px'; f.svg.style.marginLeft = -FW * s / 2 + 'px'; f.svg.style.setProperty('--fw', (2 / s).toFixed(4)); }
  });
  const draw = (y, P) => {
    const ty = still ? top : top - (H - (vh - top)) * P;
    const Q = .2 * intro + .8 * P;
    for (const f of fields) {
      const r = f.band.getBoundingClientRect();
      if (r.bottom < 0 || r.top > vh) continue;
      f.svg.style.transform = `translate3d(0,${ty.toFixed(1)}px,0)`;
      if (still) continue;
      for (const p of f.paths) {
        const v = 1 - ease(win(Q, p.a, p.b));
        if (Math.abs(v - p.v) > .002 || (v === 0 && p.v !== 0)) { p.v = v; p.el.style.strokeDashoffset = v.toFixed(3); }
      }
    }
  };
  followers.push(draw);
  if (!still) {
    const t0 = performance.now();
    const run = now => { intro = clamp01((now - t0) / 1500); intro = 1 - (1 - intro) ** 3; draw(scrollY, pageP); if (intro < 1) requestAnimationFrame(run); };
    requestAnimationFrame(run);
  }
}

// -------------------------------------------------------------------- seam
// The softball's seam down the right edge: the page's scroll path. It is stitched as far as the page has been read
// and a ball rides its end.
{
  const box = $('.seam'), svg = $('.seam__svg'), thread = $('.seam__thread'), stitch = $('.seam__stitch'), ball = $('.seam__ball');
  let w = 0, h = 0;
  const xAt = y => w / 2 + w * .2 * Math.sin(y / h * Math.PI * 2);
  layouts.push(() => {
    const r = box.getBoundingClientRect();
    w = r.width; h = r.height;
    let d = '';
    for (let y = 0; y <= h; y += 6) d += (y ? 'L' : 'M') + xAt(y).toFixed(1) + ' ' + y;
    thread.setAttribute('d', d); stitch.setAttribute('d', d);
  });
  followers.push((y, P) => {
    const at = 10 + (h - 20) * P;
    svg.style.clipPath = `inset(0 0 ${(h - at).toFixed(1)}px 0)`;
    ball.style.transform = `translate3d(${(xAt(at) - w / 2).toFixed(1)}px,${at.toFixed(1)}px,0)`;
  });
}

// ------------------------------------------------------------------ ticker
// Runs edge to edge and leans with the scroll speed. Copies of the run follow one another; the offset wraps by
// exactly one run, so the loop point never shows. Still: the claims wrap and stand.
if (!still) {
  const box = $('#ticker'), lean = $('.ticker__lean'), run = $('.ticker__run');
  let runW = 0, x = 0, last = 0, on = false, raf = 0, lastY = scrollY, speed = 0, tilt = 0;
  const fill = () => {
    $$('.ticker__run[aria-hidden]', lean).forEach(n => n.remove());
    runW = run.getBoundingClientRect().width;
    for (let i = 0, n = Math.ceil(vw / runW) + 1; i < n; i++) { const c = run.cloneNode(true); c.setAttribute('aria-hidden', 'true'); lean.append(c); }
  };
  layouts.push(fill);
  const frame = now => {
    raf = 0;
    if (!on || document.hidden) { last = 0; return; }
    const dt = last ? Math.min(.05, (now - last) / 1000) : 0;
    last = now;
    const v = dt ? (scrollY - lastY) / dt : 0;              // px/s of scroll
    lastY = scrollY;
    speed += (v - speed) * Math.min(1, dt * 8);
    tilt += (Math.max(-14, Math.min(14, -speed * .012)) - tilt) * Math.min(1, dt * 10);
    x = (x + (64 + Math.min(900, Math.abs(speed) * .5)) * dt) % runW;
    lean.style.transform = `translate3d(${(-x).toFixed(2)}px,0,0) skewX(${tilt.toFixed(2)}deg)`;
    raf = requestAnimationFrame(frame);
  };
  new IntersectionObserver(es => { on = es[es.length - 1].isIntersecting; if (on && !raf) { last = 0; lastY = scrollY; raf = requestAnimationFrame(frame); } }).observe(box);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && on && !raf) raf = requestAnimationFrame(frame); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fill);
}

// -------------------------------------------------------------- headlines
// Slam in from the left by line: the hero when its font is in, the others as they come into view.
{
  const hero = $('.hero__title');
  const go = () => hero.classList.add('is-in');
  if (document.fonts && document.fonts.ready) Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 900))]).then(go); else go();
  const io = new IntersectionObserver(es => { for (const e of es) if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } }, { rootMargin: '0px 0px -12% 0px' });
  $$('.reveal').forEach(el => io.observe(el));
}

// -------------------------------------------------------------- scoreboard
const score = { thrown: 0, returned: 0 };
function setNum(el, n) {
  el.textContent = String(n % 100).padStart(2, '0');
  if (still) return;
  el.classList.remove('is-flip'); void el.offsetWidth; el.classList.add('is-flip');
}
const say = text => { $('#say').textContent = text; };

// ------------------------------------------------------------------- catch
// Click, tap or Space: a ball leaves the pointer. With the live machine it flies (machine.js); before the machine is
// in, without WebGL, or with reduced motion, the throw is a dotted arc drawn at once and the numbers just change.
const hero = $('.hero'), heroBox = $('#heroBox'), fx = $('#fx'), throwBtn = $('#throw'), chipText = $('.chip__text');
const NET_AT = [.42, .4];                                   // where the net is in the still (share of the box)
let machine = null, pointer = null, heroSeen = true;
if (matchMedia('(hover: none)').matches) chipText.textContent = chipText.dataset.touch;

function ring(x, y, back) {
  if (still) return;
  const r = hero.getBoundingClientRect(), el = document.createElement('i');
  el.className = 'fx-ring' + (back ? ' fx-ring--back' : '');
  el.style.left = x - r.left + 'px'; el.style.top = y - r.top + 'px';
  fx.append(el);
  el.addEventListener('animationend', () => el.remove());
}
function arc(x, y) {
  const r = hero.getBoundingClientRect(), b = heroBox.getBoundingClientRect();
  const x0 = x - r.left, y0 = y - r.top, x1 = b.left - r.left + b.width * NET_AT[0], y1 = b.top - r.top + b.height * NET_AT[1];
  const lift = Math.max(60, Math.hypot(x1 - x0, y1 - y0) * .28);
  $$('.fx-arc', fx).slice(0, -2).forEach(n => n.remove());
  fx.insertAdjacentHTML('beforeend', `<svg class="fx-arc"><path d="M${x0.toFixed(1)} ${y0.toFixed(1)}Q${((x0 + x1) / 2).toFixed(1)} ${(Math.min(y0, y1) - lift).toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}"/><circle cx="${x0.toFixed(1)}" cy="${y0.toFixed(1)}" r="9"/><circle cx="${x1.toFixed(1)}" cy="${y1.toFixed(1)}" r="9"/></svg>`);
}
function pitch(x, y) {
  if (machine && machine.mode === 'hero') {
    if (!machine.throwFrom(x, y)) {                         // five in the air already
      throwBtn.classList.add('is-full'); setTimeout(() => throwBtn.classList.remove('is-full'), 260);
      return;
    }
    setNum($('#nThrown'), ++score.thrown);
    ring(x, y, false);
    return;
  }
  // no live machine: the whole catch at once
  arc(x, y);
  setNum($('#nThrown'), ++score.thrown);
  setNum($('#nReturned'), ++score.returned);
  say(`Ball returned. ${score.returned} thrown, ${score.returned} returned.`);
}
const onReturned = (b, at) => {
  setNum($('#nReturned'), ++score.returned);
  if (at) ring(at.x, at.y, true);
  say(`Ball returned. ${score.thrown} thrown, ${score.returned} returned.`);
};
// where a throw without a pointer starts: the last place the pointer was in the hero, else the ball on the chip
function spot() {
  const r = hero.getBoundingClientRect();
  if (pointer && pointer.y > r.top && pointer.y < r.bottom) return pointer;
  const b = $('.chip__ball').getBoundingClientRect();
  return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
}
const control = 'a, button, input, select, textarea, label, summary';
hero.addEventListener('pointermove', e => { pointer = { x: e.clientX, y: e.clientY }; }, { passive: true });
hero.addEventListener('click', e => {
  if (e.target.closest(control)) return;                    // a link, a button or a field never throws
  pointer = { x: e.clientX, y: e.clientY };
  userPlayed();
  pitch(e.clientX, e.clientY);
});
throwBtn.addEventListener('click', e => {
  userPlayed();
  const p = e.detail === 0 ? spot() : { x: e.clientX, y: e.clientY };   // keyboard: no pointer
  pitch(p.x, p.y);
});
// Space throws while the first screen is up and focus is nowhere in particular. In a field, on a link or on a
// button the key keeps its own meaning (the throw control is a button: Space and Enter press it).
document.addEventListener('keydown', e => {
  if (e.code !== 'Space' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  const a = document.activeElement;
  if (a && a !== document.body && a !== html) return;
  if (!heroSeen) return;
  e.preventDefault();
  userPlayed();
  const p = spot();
  pitch(p.x, p.y);
});

// until the visitor throws, the page shows how: a warm-up toss from the chip every few seconds
let warm = 0, played = false;
function userPlayed() { played = true; clearTimeout(warm); }
function warmUp(first) {
  clearTimeout(warm);
  if (played || still || window.__noWarm) return;
  warm = setTimeout(() => {
    if (!played && machine && machine.mode === 'hero' && heroSeen && !document.hidden && scrollY < 40 && machine.balls === 0) { const p = spot(); pitch(p.x, p.y); }
    warmUp(false);
  }, first ? 900 : 7000);
}

// ------------------------------------------------------------ how it works
// Pinned for three screens; the scroll runs the three steps on the same machine.
const how = $('#how'), howPin = $('.how__pin'), steps = $$('.step', how), howBox = $('#howBox');
let howP = 0, howStep = 0;
function howAt() {
  const r = how.getBoundingClientRect(), top = barH(), range = r.height - (vh - top);
  howP = range > 0 ? clamp01((top - r.top) / range) : 0;
  const s = Math.min(2, Math.floor(howP * 3));
  if (s !== howStep) { howStep = s; steps.forEach((el, i) => el.classList.toggle('is-on', i === s)); how.dataset.step = s; }
}

// ------------------------------------------------------------ the machine
// One canvas. It is in the hero or in the pinned stage, whichever shows more of itself; off screen it draws nothing.
const live = html.classList.contains('live');
function place() {
  if (!machine) return;
  const visible = el => { const r = el.getBoundingClientRect(); return Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, barH())); };
  const a = visible(hero), b = visible(howPin);
  heroSeen = a > vh * .4;
  if (!a && !b) { machine.show(false); return; }
  // before and after the pinned run the scene stands in its first and last pose, which is exactly the still: the
  // still stands in while the window slides on or off the screen, and the GPU rests
  if (b > a && (howP <= 0 || howP >= 1)) { machine.show(false); how.classList.remove('is-live'); hero.classList.remove('is-live'); return; }
  if (b > a) { machine.mount('how', $('#howStage'), howBox, [.5, .6]); how.classList.add('is-live'); hero.classList.remove('is-live'); }
  else { machine.mount('hero', $('#heroStage'), heroBox, [.5, 1]); hero.classList.add('is-live'); how.classList.remove('is-live'); }
  machine.show(true);
  if (machine.mode === 'how') machine.story(howP);
}
if (live) {
  // the words change in this frame; the machine is drawn in the next, so a slow frame of 3D never holds the words back
  let placing = false, settle = 0;
  followers.push(() => {
    howAt();
    if (!placing) { placing = true; requestAnimationFrame(() => { placing = false; place(); }); }
    clearTimeout(settle);
    settle = setTimeout(() => { if (machine) machine.redraw(); }, 140);
  });
  const start = async () => {
    try {
      const { createMachine } = await import('./machine.js');
      const quality = (innerWidth < 760 || (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4) ? 'low' : 'high';
      const canvas = document.createElement('canvas');
      canvas.setAttribute('aria-hidden', 'true');
      machine = await createMachine({ canvas, quality, on: { returned: onReturned } });
      window.__batterymate = machine;
      place();
      warmUp(true);
    } catch (err) {
      // no WebGL after all: the page keeps its stills, and the steps stand one under another
      console.info('[batterymate] the live machine is not available; keeping the stills', err);
      html.classList.remove('live');
      request();
    }
  };
  const idle = () => (window.requestIdleCallback ? requestIdleCallback(start, { timeout: 1500 }) : setTimeout(start, 300));
  if (document.readyState === 'complete') idle(); else addEventListener('load', idle, { once: true });
} else {
  new IntersectionObserver(es => { heroSeen = es[es.length - 1].intersectionRatio > .4; }, { threshold: [0, .4, 1] }).observe(hero);
}

// ------------------------------------------------------------ the numbers
// Lamps light left to right as the board comes into view; each numeral flips over as its lamp comes on.
{
  const board = $('#linescore'), innings = $$('.inning', board);
  if (still) innings.forEach(el => el.classList.add('is-lit'));
  else new IntersectionObserver((es, io) => {
    if (!es.some(e => e.isIntersecting)) return;
    io.disconnect();
    innings.forEach((el, i) => setTimeout(() => el.classList.add('is-lit'), 140 * i));
  }, { rootMargin: '0px 0px -22% 0px' }).observe(board);
}

// ------------------------------------------------------------- book a demo
// Checked here, answered here. Nothing leaves the page.
{
  const form = $('#booking'), card = $('#lineup');
  const err = (id, text) => { $('#' + id).textContent = text; };
  const fields = {
    team: { el: $('#team'), err: 'errTeam', test: v => (v.trim() ? '' : 'Enter the team name.') },
    level: { el: $('#level'), err: 'errLevel', test: v => (v ? '' : 'Pick a level.') },
    players: { el: $('#players'), err: 'errPlayers', test: v => (!v.trim() ? 'Enter the number of players.' : /^\d+$/.test(v.trim()) && +v >= 1 && +v <= 40 ? '' : 'Enter a number from 1 to 40.') },
    email: { el: $('#email'), err: 'errEmail', test: v => (!v.trim() ? 'Enter an email.' : /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) ? '' : 'That email does not look right. Check it.') },
  };
  const check = f => { const m = f.test(f.el.value); err(f.err, m); if (m) f.el.setAttribute('aria-invalid', 'true'); else f.el.removeAttribute('aria-invalid'); return !m; };
  for (const f of Object.values(fields)) {
    f.el.addEventListener('blur', () => { if (f.el.value || f.el.hasAttribute('aria-invalid')) check(f); });
    f.el.addEventListener('input', () => { if (f.el.hasAttribute('aria-invalid')) check(f); });
  }
  // a taken slot cannot be picked: it says so and the choice stays where it was
  let picked = null;
  $$('input[name="slot"]', form).forEach(r => {
    const taken = r.closest('.slot').classList.contains('is-taken');
    r.addEventListener('click', e => {
      if (!taken) return;
      e.preventDefault();
      err('errSlot', `${r.value.replace(',', '')} is taken. Pick an open slot.`);
    });
    r.addEventListener('change', () => {
      if (taken) { r.checked = false; if (picked) picked.checked = true; return; }
      picked = r; err('errSlot', '');
    });
  });
  form.addEventListener('submit', e => {
    e.preventDefault();
    const slot = $('input[name="slot"]:checked', form);
    const okSlot = !!slot && !slot.closest('.slot').classList.contains('is-taken');
    err('errSlot', okSlot ? '' : 'Pick an open slot.');
    const bad = Object.values(fields).filter(f => !check(f));
    if (!okSlot) { ($('.slot:not(.is-taken) input', form)).focus(); return; }
    if (bad.length) { bad[0].el.focus(); return; }
    $('#outTeam').textContent = fields.team.el.value.trim();
    $('#outLevel').textContent = fields.level.el.value;
    $('#outPlayers').textContent = String(+fields.players.el.value);
    $('#outSlot').textContent = slot.value;
    $('#outEmail').textContent = fields.email.el.value.trim();
    form.hidden = true; card.hidden = false;
    card.classList.remove('is-in'); void card.offsetWidth; card.classList.add('is-in');
    card.focus({ preventScroll: true });
    card.scrollIntoView({ block: 'nearest', behavior: still ? 'auto' : 'smooth' });
    request();
  });
  $('#again').addEventListener('click', () => {
    card.hidden = true; form.hidden = false;
    fields.team.el.focus();
    request();
  });
}

layouts.forEach(f => f());
howAt();
onFrame();
