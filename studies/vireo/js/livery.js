// Vireo livery: the rocket's lettering, set to read along the body on this page.
//
// next/js/hero3d.js paints the livery on a canvas with the letters stacked one under the other, upright when the
// rocket stands on the pad. This page shows the rocket lying nose up and to the right (the hero, the exploded
// stack, the stills), where stacked letters lie on their side and read from the nose down. So, on this page only,
// the same two canvases (the paint and the look's vinyl and seam map, look.js dressRocket) are painted again with
// the words turned a quarter: each word runs from the tail toward the nose, so with the nose to the right it reads
// left to right, the right way up. Colors, bands, seams, stations and the typeface are hero3d.js's own.
const BODY_TOP = 0.370693, BODY_BOTTOM = -0.570693, TUBE_JOINT = -0.0786;

function paint(c, detail) {
  const ctx = c.getContext('2d'), scale = c.width / 512, L = BODY_TOP - BODY_BOTTOM;
  const py = y => (BODY_TOP - y) / L * c.height;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  if (detail) {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.globalCompositeOperation = 'lighter';
    const pitch = 0.085 / L * c.height;
    for (const [top, bottom, phase] of [[BODY_TOP, TUBE_JOINT, 0.3], [TUBE_JOINT, BODY_BOTTOM, 0.75]]) {
      ctx.save(); ctx.beginPath(); ctx.rect(0, py(top), c.width, py(bottom) - py(top)); ctx.clip();
      for (const [lw, col] of [[7 * scale, '#000030'], [4.6 * scale, '#000040'], [2.2 * scale, '#00008f']]) {
        ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath();
        for (let y = py(top) - (1 + phase) * pitch; y < py(bottom) + pitch; y += pitch) { ctx.moveTo(0, y); ctx.lineTo(c.width, y + pitch); }
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.fillStyle = '#0f0';
    const w = Math.max(1, 0.0007 / L * c.height);
    for (const y of [BODY_TOP, TUBE_JOINT, BODY_BOTTOM]) ctx.fillRect(0, py(y) - w, c.width, 2 * w);
    ctx.fillStyle = '#f00';
  } else {
    ctx.fillStyle = '#d63b08'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#890919';
    for (const [t, b] of [[BODY_TOP, 0.352], [-0.067, -0.085]]) ctx.fillRect(0, py(t), c.width, py(b) - py(t));
    ctx.fillStyle = '#fff';
  }
  // a word along the body, centered on station y (m), letters h (m) tall, at most `len` (m) long
  const word = (text, y, h, len) => {
    ctx.save();
    ctx.translate(c.width / 2, py(y));
    ctx.rotate(-Math.PI / 2);                        // the baseline runs toward the nose; the letters' tops face the same way round the body as before
    ctx.font = `800 ${h / L * c.height}px Archivo, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${(0.12 * h / L * c.height).toFixed(1)}px`;
    ctx.fillText(text, 0, 0, len / L * c.height);
    ctx.restore();
  };
  word('CHARGER', 0.15, 0.040, 0.34);
  word('UCRC', -0.187, 0.037, 0.15);
  word('2026', -0.425, 0.036, 0.14);
  // the bolt between UCRC and 2026, turned the same quarter
  const bolt = [[9, -0.281], [-15, -0.315], [-3, -0.315], [-10, -0.341], [16, -0.305], [3, -0.305]];
  const cy = -0.311, k = c.width / (2 * Math.PI * 34);
  ctx.beginPath();
  bolt.forEach(([x, y], i) => {
    // (x mm round the body, y m along it) turned a quarter about the bolt's middle
    const dx = x / 1000, dy = y - cy, rx = -dy, ry = dx;
    const px = c.width / 2 + rx * 1000 * k, pyy = py(cy + ry);
    i ? ctx.lineTo(px, pyy) : ctx.moveTo(px, pyy);
  });
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

// Paint the rocket's two livery canvases again. `renderer` has compiled the paint (its uniforms hold the map).
export function relabel(renderer, tubeMeshes) {
  const done = new Set();
  for (const m of tubeMeshes) {
    const mat = m.material;
    const map = mat && mat.map;
    if (map && map.image && map.image.getContext && !done.has(map)) { paint(map.image, false); map.needsUpdate = true; done.add(map); }
    const u = renderer.properties.get(mat).uniforms;
    const det = u && u.lookDetail && u.lookDetail.value;
    if (det && det.image && det.image.getContext && !done.has(det)) { paint(det.image, true); det.needsUpdate = true; done.add(det); }
  }
  return done.size;
}
