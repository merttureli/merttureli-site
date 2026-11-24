/* Loose prints. A print keeps its place in the layout; picking it up only changes --dx, --dy and --tilt,
   which the stylesheet turns into translate and rotate.

   Mouse and pen: press and move. Touch: press and hold (a quick swipe still scrolls the page), then move.
   Keyboard: focus lifts a print, the arrow keys move it, Escape puts it back. */

const HOLD_MS = 230;        // how long a finger rests before the print comes up
const SLOP = 9;             // finger travel, in px, that means "this is a scroll"
let top = 10;               // z-index of the print picked up last
let drag = null;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function state(el) {
  if (!el._p) el._p = { x: 0, y: 0, vx: 0, vy: 0, tilt: 0, rest: 0, raf: 0 };
  return el._p;
}
function paint(el) {
  const p = el._p;
  el.style.setProperty('--dx', p.x.toFixed(1) + 'px');
  el.style.setProperty('--dy', p.y.toFixed(1) + 'px');
  el.style.setProperty('--tilt', p.tilt.toFixed(2) + 'deg');
}
function raise(el) { el.style.setProperty('--z', String(++top)); }

/* How far this print may travel: its middle stays inside its zone (the cover, or its stop). */
function limits(el) {
  const p = state(el), zone = el.closest('[data-zone]') || document.body;
  const z = zone.getBoundingClientRect(), r = el.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2, pad = 28;
  return {
    minX: p.x + (Math.max(z.left, 0) + pad - cx), maxX: p.x + (Math.min(z.right, document.documentElement.clientWidth) - pad - cx),
    minY: p.y + (z.top + pad - cy), maxY: p.y + (z.bottom - pad - cy),
  };
}

export function initPrints({ still }) {
  const prints = [...document.querySelectorAll('.print[data-move]')];
  const said = document.getElementById('print-said');
  const say = t => { if (said) { said.textContent = ''; requestAnimationFrame(() => { said.textContent = t; }); } };

  /* ---- drop in and develop, once, when a print first comes into view ---- */
  if (still || !('IntersectionObserver' in window)) prints.forEach(el => el.classList.add('is-in'));
  else {
    const io = new IntersectionObserver(entries => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.12 });
    prints.forEach(el => io.observe(el));
  }

  /* ---- letting go: the print keeps a little of its speed, then settles a touch crooked ---- */
  function settle(el, glide) {
    const p = state(el);
    cancelAnimationFrame(p.raf);
    if (still || !glide) { p.vx = p.vy = 0; p.tilt = p.rest; paint(el); return; }
    const lim = limits(el);
    let last = performance.now();
    const step = now => {
      const dt = Math.min(34, now - last); last = now;
      p.x += p.vx * dt; p.y += p.vy * dt;
      const k = Math.pow(0.9, dt / 16.7); p.vx *= k; p.vy *= k;
      if (p.x < lim.minX || p.x > lim.maxX) { p.x = clamp(p.x, lim.minX, lim.maxX); p.vx = 0; }
      if (p.y < lim.minY || p.y > lim.maxY) { p.y = clamp(p.y, lim.minY, lim.maxY); p.vy = 0; }
      p.tilt += (p.rest - p.tilt) * (1 - Math.pow(0.82, dt / 16.7));
      paint(el);
      if (Math.hypot(p.vx, p.vy) > 0.012 || Math.abs(p.rest - p.tilt) > 0.05) p.raf = requestAnimationFrame(step);
      else { p.tilt = p.rest; paint(el); }
    };
    p.raf = requestAnimationFrame(step);
  }

  function begin(e) {
    const d = drag; if (!d || d.live) return;
    const p = state(d.el);
    cancelAnimationFrame(p.raf);
    d.live = true; d.lim = limits(d.el); d.ox = p.x; d.oy = p.y; d.sx = d.lx; d.sy = d.ly; d.scroll0 = window.scrollY;
    d.el.classList.remove('is-homing', 'is-keyed');
    d.el.classList.add('is-held');
    raise(d.el);
    try { d.el.setPointerCapture(d.id); } catch (err) { /* the pointer is already gone */ }
  }
  function end(glide) {
    const d = drag; if (!d) return;
    clearTimeout(d.timer); drag = null;
    if (!d.live) return;
    const p = state(d.el);
    d.el.classList.remove('is-held');
    if (performance.now() - d.lt > 90) p.vx = p.vy = 0;               // it was held still before letting go
    p.vx = clamp(p.vx, -2.2, 2.2); p.vy = clamp(p.vy, -2.2, 2.2);
    if (!still) p.rest = clamp(p.rest * 0.4 + p.vx * 5, -4.5, 4.5);                 // lands a little crooked, the way it was thrown
    settle(d.el, glide);
  }

  for (const el of prints) {
    state(el);
    el.addEventListener('pointerdown', e => {
      if (drag || (e.pointerType === 'mouse' && e.button !== 0)) return;
      drag = { el, id: e.pointerId, touch: e.pointerType === 'touch', live: false, sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY, lt: performance.now() };
      if (drag.touch) drag.timer = setTimeout(begin, HOLD_MS);
    });
    el.addEventListener('pointermove', e => {
      const d = drag; if (!d || d.el !== el || e.pointerId !== d.id) return;
      const now = performance.now(), dt = Math.max(1, now - d.lt), p = state(el);
      if (!d.live) {
        const far = Math.hypot(e.clientX - d.sx, e.clientY - d.sy);
        if (d.touch) { if (far > SLOP) { clearTimeout(d.timer); drag = null; } d.lx = e.clientX; d.ly = e.clientY; return; }
        if (far < 4) return;
        d.lx = e.clientX; d.ly = e.clientY; begin();
      }
      const nx = clamp(d.ox + (e.clientX - d.sx), d.lim.minX, d.lim.maxX);
      const ny = clamp(d.oy + (e.clientY - d.sy) + (window.scrollY - d.scroll0), d.lim.minY, d.lim.maxY);
      p.vx = p.vx * 0.6 + ((e.clientX - d.lx) / dt) * 0.4;
      p.vy = p.vy * 0.6 + ((e.clientY - d.ly) / dt) * 0.4;
      p.x = nx; p.y = ny; d.lx = e.clientX; d.ly = e.clientY; d.lt = now;
      if (!still) p.tilt += (clamp(p.rest + p.vx * 9, -8, 8) - p.tilt) * 0.3;   // it swings a little as it moves
      paint(el);
    });
    el.addEventListener('pointerup', e => { if (drag && drag.el === el && e.pointerId === drag.id) end(true); });
    el.addEventListener('pointercancel', e => { if (drag && drag.el === el && e.pointerId === drag.id) end(false); });
    el.addEventListener('lostpointercapture', () => { if (drag && drag.el === el && drag.live) end(false); });
    /* Once a finger has picked a print up, the page must not scroll under it. */
    el.addEventListener('touchmove', e => { if (drag && drag.el === el && drag.live && e.cancelable) e.preventDefault(); }, { passive: false });
    el.addEventListener('contextmenu', e => { if (drag && drag.el === el) e.preventDefault(); });
    el.addEventListener('dragstart', e => e.preventDefault());

    el.addEventListener('focus', () => { if (el.matches(':focus-visible')) raise(el); });
    el.addEventListener('keydown', e => {
      const p = state(el), step = e.shiftKey ? 48 : 16;
      const move = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (move) {
        e.preventDefault();
        cancelAnimationFrame(p.raf);
        const lim = limits(el);
        p.x = clamp(p.x + move[0], lim.minX, lim.maxX); p.y = clamp(p.y + move[1], lim.minY, lim.maxY); p.vx = p.vy = 0;
        el.classList.remove('is-homing'); el.classList.add('is-keyed');
        raise(el); paint(el);
        if (!el._told) { el._told = true; say('Print moved. Escape puts it back.'); }
      } else if (e.key === 'Escape' && (p.x || p.y || p.rest)) {
        e.preventDefault();
        cancelAnimationFrame(p.raf);
        p.x = p.y = p.vx = p.vy = p.rest = p.tilt = 0;
        el.classList.remove('is-keyed'); el.classList.add('is-homing');
        paint(el); el._told = false; say('Print put back.');
      }
    });
  }
}
