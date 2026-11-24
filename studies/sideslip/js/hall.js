// The Hall sensing instrument: a magnet on the moving part passes over the sensor with an air gap between them,
// and the output follows the field the sensor sees. Illustration of the principle, not a calibration: the
// field is that of a small bar magnet (vertical component at the sensor), scaled to the 0..1023 readout.
import { makeSeg } from './seg.js';

const X0 = 144, TRAVEL = 112, GAP = 54 / TRAVEL;   // svg units: sensor at x 144, magnet travels +-112, gap 54
const field = u => u / (u * u + GAP * GAP) ** 2.5;
const PEAK = field(GAP / 2);
export const hallOut = m => Math.max(0, Math.min(1023, Math.round(512 + 496 * field(m) / PEAK)));
const sx = m => 128 + m * 124, sy = c => 36 - (c - 512) / 512 * 30;

export function createHall({ reduced }) {
  const root = document.querySelector('.inst .hall');
  if (!root) return { step() {} };
  const mag = root.querySelector('.hall-mag'), range = document.getElementById('hall-range'), out = document.getElementById('hall-out');
  const curve = document.querySelector('.scope-curve'), trace = document.querySelector('.scope-trace'), dot = document.querySelector('.scope-dot');
  const seg = makeSeg(document.querySelector('svg.seg[data-of="hall"]'));
  let d = '';
  for (let i = 0; i <= 128; i++) { const m = -1 + i / 64; d += (i ? 'L' : 'M') + sx(m).toFixed(1) + ' ' + sy(hallOut(m)).toFixed(1); }
  curve.setAttribute('d', d);

  let m = reduced ? .35 : 0, t = 0, auto = !reduced, visible = false, lastM = NaN, said = 0;
  const hist = [];
  new IntersectionObserver(es => { visible = es[0].isIntersecting; }).observe(root);
  range.addEventListener('input', () => {
    auto = false; m = +range.value / 100;
    clearTimeout(said); said = setTimeout(() => { out.textContent = `Magnet ${m < 0 ? 'left of' : m > 0 ? 'right of' : 'over'} the sensor, output ${hallOut(m)} of 1023.`; }, 600);
  });

  function draw() {
    if (m === lastM) return;
    lastM = m;
    mag.setAttribute('transform', `translate(${(X0 + m * TRAVEL).toFixed(2)} 0)`);
    const c = hallOut(m);
    seg(c);
    dot.setAttribute('cx', sx(m).toFixed(1)); dot.setAttribute('cy', sy(c).toFixed(1));
    hist.push(m); if (hist.length > (auto ? 18 : 2)) hist.splice(0, hist.length - (auto ? 18 : 2));
    // the lit trace runs along the curve through the last positions (sampled, so a jump follows the curve too)
    let p = '';
    for (let i = 0; i < hist.length; i++) {
      const a = i ? hist[i - 1] : hist[0], b = hist[i], k = i ? Math.max(1, Math.ceil(Math.abs(b - a) * 64)) : 1;
      for (let j = i ? 1 : 0; j <= k; j++) { const v = a + (b - a) * j / k; p += (p ? 'L' : 'M') + sx(v).toFixed(1) + ' ' + sy(hallOut(v)).toFixed(1); }
    }
    trace.setAttribute('d', p);
    if (document.activeElement !== range) range.value = String(Math.round(m * 100));
  }
  draw();
  return {
    step(dt) {
      if (!visible) return;
      if (auto) { t += dt; m = Math.sin(t * 1.1) * .92; }
      draw();
    },
  };
}
