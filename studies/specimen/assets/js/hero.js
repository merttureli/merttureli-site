// Hero plate: CHARGER turns in place; scrolling separates it into its parts.
import { createStudy } from './specimen-gl.js';

export async function startHero({ force = false } = {}) {
  const plate = document.getElementById('heroPlate');
  const canvas = document.getElementById('heroGL');
  const sepVal = document.getElementById('sepVal');
  const ruler = plate.querySelector('.hp-scale'), rulerL = ruler && ruler.querySelector('span');
  let lastR = '';
  if (!plate || !canvas) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const base = new URL('../model/', import.meta.url).href;
  let study;
  try { study = await createStudy(canvas, { base }); } catch (e) { return; } // poster stays

  const s = study.state;
  const phone = () => innerWidth < 600;
  const setPose = () => { s.tilt = phone() ? 0 : -0.06; s.zoom = phone() ? 0.86 : 0.98; s.elev = 0.15; s.shift = phone() ? 0.34 : 0.3; s.shiftY = phone() ? 0.09 : 0; };
  setPose();
  study.resize();
  let visible = true, raf = 0, last = performance.now(), dragging = false, lastX = 0, vel = 0;
  const px = new Uint8Array(4), cost = [];
  let explode = 0, frames = 0, slowFrames = 0, started = performance.now(), slow = false;

  const pinned = () => innerWidth > 900;
  const target = () => {
    if (pinned()) return Math.min(1, Math.max(0, scrollY / (innerHeight * 0.42)));
    const r = plate.getBoundingClientRect();
    const p = (innerHeight * 0.55 - (r.top + r.height * 0.5)) / (r.height * 0.45);
    return Math.min(1, Math.max(0, p));
  };
  let lastSep = '';
  function frame(now) {
    raf = 0;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    frames++;
    if (frames > 4 && dt > 0.045) slowFrames++;
    if (!force && frames === 40 && slowFrames > 24) { slow = true; }
    if (!dragging && !reduced) s.spin += dt * 0.24 + vel; vel *= 0.92;
    const t = target();
    explode = reduced ? t : explode + (t - explode) * Math.min(1, dt * 9);
    s.explode = explode < 0.002 ? 0 : explode;
    if (frames >= 2 && frames <= 4 && !force) {
      const t0 = performance.now(); study.draw(); study.gl.readPixels(0, 0, 1, 1, study.gl.RGBA, study.gl.UNSIGNED_BYTE, px);
      cost.push(performance.now() - t0);
      if (frames === 4) { cost.sort((a, b) => a - b); if (cost[1] > 34) slow = true; }
    } else study.draw();
    const sep = String(Math.round(explode * 100)).padStart(3, '0') + '%';
    if (sep !== lastSep) { sepVal.textContent = sep; lastSep = sep; }
    if (ruler && s.ruler) {
      const R = s.ruler, key = R.top.toFixed(4) + R.bottom.toFixed(4);
      if (key !== lastR) {
        lastR = key; ruler.style.top = (R.top * 100) + '%'; ruler.style.bottom = ((1 - R.bottom) * 100) + '%';
        rulerL.textContent = R.inches.toFixed(1) + ' IN';
        ruler.style.left = `calc(${(0.5 + s.shift / 2) * 100}% + ${phone() ? 30 : 64}px)`;
      }
    }
    if (frames === 5) plate.classList.add('gl-on');
    if (slow) { plate.classList.remove('gl-on'); plate.classList.add('gl-slow'); return; }
    if (visible && !document.hidden && (!reduced || dragging || Math.abs(t - explode) > 0.001 || frames < 6)) raf = requestAnimationFrame(frame);
  }
  const kick = () => { if (!raf && visible && !slow) { last = performance.now(); raf = requestAnimationFrame(frame); } };
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) kick(); }, { threshold: 0 }).observe(plate);
  new ResizeObserver(() => { setPose(); study.resize(); kick(); }).observe(canvas);
  document.addEventListener('visibilitychange', kick);
  addEventListener('scroll', kick, { passive: true });

  canvas.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; vel = 0; canvas.setPointerCapture(e.pointerId); kick(); });
  canvas.addEventListener('pointermove', (e) => { if (!dragging) return; const dx = e.clientX - lastX; lastX = e.clientX; s.spin += dx * 0.012; vel = dx * 0.0008; kick(); });
  const up = () => { dragging = false; kick(); };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  kick();
}
