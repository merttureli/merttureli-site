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
// part in its own line color (clip-path on a layer of the band). The drawing drifts up as the page is read and its lines are
// drawn as they come into view: the outfield first, home plate last. Still: the whole field, drawn, not moving.
{
  const tpl = $('#field'), FW = 320, FH = 262;
  const fields = $$('[data-field]').map(band => {
    const svg = tpl.content.firstElementChild.cloneNode(true);
    const clip = document.createElement('div');
    clip.className = 'field-clip';
    clip.append(svg);
    band.prepend(clip);
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
    if (!w || !h) return;                                   // not laid out yet (a hidden frame)
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
// the pinned scene needs a screen at least 561px tall; under that the steps stand one under another (CSS agrees)
const pinMQ = matchMedia('(min-height: 561px)');
const pinned = () => html.classList.contains('live') && pinMQ.matches;
pinMQ.addEventListener('change', () => request());

function ring(x, y, back) {
  if (still) return;
  const r = hero.getBoundingClientRect(), el = document.createElement('i');
  el.className = 'fx-ring' + (back ? ' fx-ring--back' : '');
  el.style.left = x - r.left + 'px'; el.style.top = y - r.top + 'px';
  fx.append(el);
  el.addEventListener('animationend', () => el.remove());
}
// a click that cannot be thrown: five balls are in the air already. A crossed ring at the pointer says so.
function nope(x, y) {
  const r = hero.getBoundingClientRect();
  $$('.fx-no', fx).forEach(n => n.remove());
  const el = document.createElement('i');
  el.className = 'fx-no' + (x - r.left > r.width - 280 ? ' is-left' : '');
  el.innerHTML = '<b>Five in the air</b>';
  el.style.left = x - r.left + 'px'; el.style.top = y - r.top + 'px';
  fx.append(el);
  if (still) setTimeout(() => el.remove(), 1400); else el.addEventListener('animationend', () => el.remove());
  say('Five balls are in the air. Wait for one to come back.');
}
function arc(x, y) {
  const r = hero.getBoundingClientRect(), b = heroBox.getBoundingClientRect();
  const x0 = x - r.left, y0 = y - r.top, x1 = b.left - r.left + b.width * NET_AT[0], y1 = b.top - r.top + b.height * NET_AT[1];
  const lift = Math.max(60, Math.hypot(x1 - x0, y1 - y0) * .28);
  $$('.fx-arc', fx).slice(0, -2).forEach(n => n.remove());
  fx.insertAdjacentHTML('beforeend', `<svg class="fx-arc"><path d="M${x0.toFixed(1)} ${y0.toFixed(1)}Q${((x0 + x1) / 2).toFixed(1)} ${(Math.min(y0, y1) - lift).toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}"/><circle cx="${x0.toFixed(1)}" cy="${y0.toFixed(1)}" r="9"/><circle cx="${x1.toFixed(1)}" cy="${y1.toFixed(1)}" r="9"/></svg>`);
}
function pitch(x, y) {
  if (machine) {
    if (machine.mode !== 'hero' || !hero.classList.contains('is-live')) heroLive();   // the still stood in; the live machine takes the catch
    if (!machine.throwFrom(x, y)) {                         // five in the air already
      throwBtn.classList.add('is-full'); setTimeout(() => throwBtn.classList.remove('is-full'), 260);
      nope(x, y);
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
// Keys. Space throws only at the very top of the page with focus nowhere in particular; anywhere else it scrolls.
// In a field, on a link or on a button a key keeps its own meaning (the throw control is a button: Space and Enter
// press it). Inside the pinned scene the browser's own page step is tiny (the pinned layer fills the screen and is
// left out of it), so Space, Shift+Space, Page Down and Page Up step the page there by nine tenths of a screen.
const typing = el => !!el && el.matches && el.matches('input, select, textarea, [contenteditable], [contenteditable] *');
document.addEventListener('keydown', e => {
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
  const a = document.activeElement, free = !a || a === document.body || a === html;
  const space = e.code === 'Space' || e.key === ' ';
  if (space && !e.shiftKey && free && scrollY < 40) {
    e.preventDefault();
    if (e.repeat) return;
    userPlayed();
    const p = spot();
    pitch(p.x, p.y);
    return;
  }
  const page = space || e.code === 'PageDown' || e.code === 'PageUp' || e.key === 'PageDown' || e.key === 'PageUp';
  if (!page || typing(a) || !pinActive()) return;
  if (space && !free && !a.matches('a[href]')) return;
  e.preventDefault();
  const up = e.code === 'PageUp' || e.key === 'PageUp' || (space && e.shiftKey);
  scrollBy({ top: (up ? -1 : 1) * Math.round((vh - barH()) * .9), behavior: still ? 'auto' : 'smooth' });
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
function pinActive() {
  if (!pinned()) return false;
  const r = how.getBoundingClientRect();
  return r.top <= barH() + 2 && r.bottom >= vh - 2;
}
function howAt() {
  const r = how.getBoundingClientRect(), top = barH(), range = r.height - (vh - top);
  howP = range > 0 ? clamp01((top - r.top) / range) : 0;
  const s = Math.min(2, Math.floor(howP * 3));
  if (s !== howStep) { howStep = s; steps.forEach((el, i) => el.classList.toggle('is-on', i === s)); how.dataset.step = s; }
}

// ------------------------------------------------------------ the machine
// One canvas. It is in the hero or in the pinned stage, whichever shows more of itself; off screen it draws nothing.
const live = html.classList.contains('live');
function heroLive() {
  machine.mount('hero', $('#heroStage'), heroBox, [.5, 1]); hero.classList.add('is-live'); how.classList.remove('is-live');
  machine.show(true);
}
function place() {
  if (!machine) return;
  const visible = el => { const r = el.getBoundingClientRect(); return Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, barH())); };
  const a = visible(hero), b = pinned() ? visible(howPin) : 0;
  heroSeen = a > vh * .4;
  // Off screen the canvas draws nothing. On screen the live machine is always shown: it goes to whichever of the hero
  // and the pinned window shows more of itself (the other, mostly scrolled away, keeps its rendered still). The hero
  // draws only while something moves, so a hero standing still costs the GPU nothing.
  if (!a && !b) { machine.show(false); return; }
  if (b > a) {
    machine.mount('how', $('#howStage'), howBox, [.5, .6]); how.classList.add('is-live'); hero.classList.remove('is-live');
    machine.show(true);
    machine.story(howP);
  } else heroLive();
}
if (live) {
  // the words change in this frame; the machine is drawn in the next, so a slow frame of 3D never holds the words back
  let placing = false;
  followers.push(() => { howAt(); if (!placing) { placing = true; requestAnimationFrame(() => { placing = false; place(); }); } });
  const start = async () => {
    try {
      const { createMachine } = await import('./machine.js');
      const quality = (innerWidth < 760 || (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4) ? 'low' : 'high';
      const canvas = document.createElement('canvas');
      canvas.setAttribute('aria-hidden', 'true');
      const trail = document.createElement('canvas'), overlay = document.createElement('canvas');
      trail.className = 'hero__trail'; overlay.className = 'how__overlay';
      $('#heroStage').append(trail); $('#howStage').after(overlay);
      machine = await createMachine({ canvas, quality, on: { returned: onReturned }, trail, overlay });
      window.__batterymate = machine;
      place();
      warmUp(true);
    } catch (err) {
      // no WebGL after all: the page keeps its stills, and the steps stand one under another
      console.info('[batterymate] the live machine is not available; keeping the stills', err);
      html.classList.remove('live');
      $$('.hero__trail, .how__overlay').forEach(n => n.remove());
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
  // The lamp row lights a bulb at a time over the same 0.84 s.
  const board = $('#linescore'), innings = $$('.inning', board), bulbs = $('.ls__bulbs-on', board), PITCH_PX = 20, RUN = 140 * innings.length;
  if (still) innings.forEach(el => el.classList.add('is-lit'));
  else new IntersectionObserver((es, io) => {
    if (!es.some(e => e.isIntersecting)) return;
    io.disconnect();
    innings.forEach((el, i) => setTimeout(() => el.classList.add('is-lit'), 140 * i));
    const t0 = performance.now(), n = Math.ceil(bulbs.parentElement.clientWidth / PITCH_PX);
    const run = now => {
      const k = Math.min(1, (now - t0) / RUN);
      bulbs.style.width = k >= 1 ? '100%' : Math.ceil(k * n) * PITCH_PX + 'px';
      if (k < 1) requestAnimationFrame(run);
    };
    requestAnimationFrame(run);
  }, { rootMargin: '0px 0px -22% 0px' }).observe(board);
}

// ------------------------------------------------------------- book a demo
// Checked here, answered here. Nothing leaves the page.
{
  // One alert speaks for a failed submit (a summary above the button); the notes under each field are plain text.
  const form = $('#booking'), card = $('#lineup'), sum = $('#errSum');
  const err = (id, text) => { $('#' + id).textContent = text; };
  const fields = {
    team: { el: $('#team'), err: 'errTeam', name: 'team name', test: v => (v.trim() ? '' : 'Enter the team name.') },
    level: { el: $('#level'), err: 'errLevel', name: 'level', test: v => (v ? '' : 'Pick a level.') },
    players: { el: $('#players'), err: 'errPlayers', name: 'players', test: v => (!v.trim() ? 'Enter the number of players.' : /^\d+$/.test(v.trim()) && +v >= 1 && +v <= 40 ? '' : 'Enter a number from 1 to 40.') },
    email: { el: $('#email'), err: 'errEmail', name: 'email', test: v => (!v.trim() ? 'Enter an email.' : /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) ? '' : 'That email does not look right. Check it.') },
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
      $('#bookSay').textContent = $('#errSlot').textContent;
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
    const names = (okSlot ? [] : ['a slot']).concat(bad.map(f => f.name));
    if (names.length) {
      const list = names.length > 1 ? names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] : names[0];
      sum.textContent = `${names.length === 1 ? 'One thing to fix' : names.length + ' things to fix'}: ${list}. The notes are under each one.`;
      if (!okSlot) ($('.slot:not(.is-taken) input', form)).focus(); else bad[0].el.focus();
      return;
    }
    sum.textContent = '';
    $('#outTeam').textContent = fields.team.el.value.trim();
    $('#outLevel').textContent = fields.level.el.value;
    $('#outPlayers').textContent = String(+fields.players.el.value);
    $('#outSlot').textContent = slot.value;
    $('#outEmail').textContent = fields.email.el.value.trim();
    $('#outEmail').classList.add('is-case');
    $('#outDay').textContent = slot.value.split(',')[0] + '.';
    form.hidden = true; card.hidden = false;
    card.classList.remove('is-in'); void card.offsetWidth; card.classList.add('is-in');
    card.focus({ preventScroll: true });
    card.scrollIntoView({ block: 'start', behavior: still ? 'auto' : 'smooth' });
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
