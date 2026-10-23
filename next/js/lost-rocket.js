// 404: CHARGER, a little lost. Not a fork: the model, livery, materials and
// lights are the hero's own (hero3d.js createRocket on showreel/engine.js),
// so the rocket matches the Studio hero exactly; this file only adds a calm
// wander (drift, slow roll, a nose that leans toward the pointer).
//
// Loaded by 404.html after load + idle, never before first paint. The poster
// next/assets/img/charger-lost-{440,880}.webp is this same rig at time T0
// (render it again with mountLost({ box, still: true }) if the pose changes),
// so the switch from still to live is seamless. Reduced motion keeps the
// poster; rendering stops while the stage is off screen or the tab is hidden.
//
// The rocket never leaves its stage: fit() samples the whole wander (five
// minutes of it, pointer at every extreme) and frames the camera so every
// pose stays inside the canvas with a margin. The stage itself sits beside
// (desktop) or above (phone) the text in CSS, so the rocket never covers it.
import { THREE, createEngine, screenExtents } from './showreel/engine.js';
import { createRocket, applyCamera } from './hero3d.js';

export const T0 = 0;                       // ms on the wander clock: the poster frame
const LAYOUT = 'port';                     // hero portrait framing (fit() then sets distance and shift)
const MARGIN = .04;                        // share of the stage kept clear around every pose

// Pose at wander time t (ms). Pure function of t and the pointer state.
export function wander(rocket, t) {
  const s = rocket.state;
  s.spin = t * .00016;                     // slow roll about the airframe (one turn in about 40 s)
  rocket.pose(t);                          // hero framing, sway and pointer lean
  const g = rocket.group;
  g.position.x += Math.sin(t * .00019) * .11 + Math.sin(t * .00043 + 1) * .035;
  g.position.y += Math.sin(t * .00015 + 2) * .085 + Math.sin(t * .00037) * .03;
  g.rotation.z = Math.sin(t * .00012) * .2 + Math.sin(t * .00029 + .5) * .05;
  g.rotation.y += s.sx * .22;              // nose toward the pointer (on top of the hero's own lean)
}

// Frame the camera so the union of every wander pose fits the canvas (w x h px)
// with MARGIN on each side. Depends only on the aspect, so the poster matches.
function fit(engine, rocket, w, h) {
  const L = rocket.layout, cam = engine.camera, s = rocket.state, origin = new THREE.Object3D();
  L.shiftX = 0; L.shiftY = 0;
  for (let pass = 0; pass < 4; pass++) {
    applyCamera(cam, L); cam.aspect = w / h; cam.updateProjectionMatrix();
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of [-1, 0, 1]) for (const q of [-1, 0, 1]) {
      s.px = s.sx = p; s.py = s.sy = q;
      for (let t = 0; t <= 300000; t += 1500) {
        wander(rocket, t);
        const e = screenExtents([rocket.group], origin, cam, w, h);
        x0 = Math.min(x0, -e.l); x1 = Math.max(x1, e.r); y0 = Math.min(y0, -e.u); y1 = Math.max(y1, e.d);
      }
    }
    const unit = 2 * engine.viewAt(0).halfH / h;  // world units per px at the rocket's depth
    L.shiftX -= (x0 + x1) / 2 * unit;
    L.shiftY += (y0 + y1) / 2 * unit;
    const k = Math.max((x1 - x0) / (w * (1 - 2 * MARGIN)), (y1 - y0) / (h * (1 - 2 * MARGIN)));
    L.dist *= k;
  }
  applyCamera(cam, L); cam.aspect = w / h; cam.updateProjectionMatrix();
  s.px = s.sx = s.py = s.sy = 0;
}

export async function mountLost({ box, base = '/next/assets/3d/', still = false, pixelRatio } = {}) {
  const canvas = box.querySelector('canvas');
  const engine = createEngine({ canvas, preserve: still, pixelRatio });
  const rocket = await createRocket({ layout: LAYOUT, base });
  engine.scene.add(rocket.group);
  applyCamera(engine.camera, rocket.layout);
  const resize = () => engine.size(Math.max(1, box.clientWidth), Math.max(1, box.clientHeight));
  resize();
  fit(engine, rocket, box.clientWidth || 4, box.clientHeight || 5);
  rocket.settle(T0);
  wander(rocket, T0);
  engine.render();
  if (still) return { engine, rocket };

  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  let raf = 0, onScreen = true, clock = T0, last = 0;
  const running = () => onScreen && !document.hidden && !reduced.matches;
  function frame(now) {
    raf = 0;
    clock += Math.min(64, now - last); last = now;
    wander(rocket, clock);
    engine.render();
    if (running()) raf = requestAnimationFrame(frame);
  }
  function kick() { if (!raf && running()) { last = performance.now(); raf = requestAnimationFrame(frame); } }

  new IntersectionObserver(e => { onScreen = e[0].isIntersecting; kick(); }).observe(box);
  document.addEventListener('visibilitychange', kick);
  reduced.addEventListener('change', () => { box.classList.toggle('is-live', !reduced.matches); kick(); });
  new ResizeObserver(() => { resize(); if (!raf) { wander(rocket, clock); engine.render(); } }).observe(box);
  if (fine) addEventListener('pointermove', e => {
    const r = box.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    rocket.state.px = Math.max(-1, Math.min(1, (e.clientX - cx) / (innerWidth / 2)));
    rocket.state.py = Math.max(-1, Math.min(1, (e.clientY - cy) / (innerHeight / 2)));
  }, { passive: true });

  box.classList.add('is-live');
  kick();
  return { engine, rocket };
}
