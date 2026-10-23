import { BufferAttribute } from 'three';

// The nose cone is a body of revolution. Normals taken from its smoothed profile r(y) remove the
// blotches the CAD triangulation leaves, and every triangle is wound outward so DoubleSide
// lighting never flips near the tip. Shared by the explorer and the hero rocket.
export function smoothNoseNormals(g) {
  const p = g.getAttribute('position'), n = new Float32Array(p.count * 3);
  let y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const bins = 160, rmax = new Float32Array(bins + 1).fill(-1);
  for (let i = 0; i < p.count; i++) { const k = Math.round((p.getY(i) - y0) / (y1 - y0) * bins); rmax[k] = Math.max(rmax[k], Math.hypot(p.getX(i), p.getZ(i))); }
  const known = []; rmax.forEach((r, k) => { if (r >= 0) known.push(k); });
  for (let k = 0; k <= bins; k++) if (rmax[k] < 0) {
    const a = known.filter(q => q < k).pop(), b = known.find(q => q > k);
    rmax[k] = a === undefined ? rmax[b] : b === undefined ? rmax[a] : rmax[a] + (rmax[b] - rmax[a]) * (k - a) / (b - a);
  }
  const sm = rmax.map((_, k) => { let s = 0, c = 0; for (let j = -2; j <= 2; j++) { const q = k + j; if (q >= 0 && q <= bins) { s += rmax[q]; c++; } } return s / c; });
  const dy = (y1 - y0) / bins, tip = (y1 - y0) * .002;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), r = Math.hypot(x, z), k = Math.min(bins - 1, Math.max(1, Math.round((p.getY(i) - y0) / dy)));
    const slope = (sm[k + 1] - sm[k - 1]) / (2 * dy), ny = -slope, l = Math.hypot(1, ny);
    if (r < tip) n.set([0, 1, 0], i * 3); else n.set([x / r / l, ny / l, z / r / l], i * 3);
  }
  g.setAttribute('normal', new BufferAttribute(n, 3));
  if (!g.index) return g;
  const idx = g.index.array.slice(), P = (i, c) => p.getComponent(i, c);
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    const ux = P(b, 0) - P(a, 0), uy = P(b, 1) - P(a, 1), uz = P(b, 2) - P(a, 2), vx = P(c, 0) - P(a, 0), vy = P(c, 1) - P(a, 1), vz = P(c, 2) - P(a, 2);
    const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
    if (fx * (n[a * 3] + n[b * 3] + n[c * 3]) + fy * (n[a * 3 + 1] + n[b * 3 + 1] + n[c * 3 + 1]) + fz * (n[a * 3 + 2] + n[b * 3 + 2] + n[c * 3 + 2]) < 0) { idx[t + 1] = c; idx[t + 2] = b; }
  }
  g.setIndex(new BufferAttribute(idx, 1));
  return g;
}
