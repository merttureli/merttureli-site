/* Test card for the scene's lattice slice (lab and verification only; the page
   samples the real lattice.texture instead).

   Draws, in grid space (one canvas row per grid row, row 0 on the canvas's top
   line, flipY off, exactly the render target layout the slice expects):
     - a checkerboard of 16-cell squares at low alpha, so the depth ordering of the
       plane against the rocket reads (the plane is see-through everywhere);
     - smoke-like streaks along the inflow direction (cos alpha, sin alpha), the
       lattice's own convention (FIELD.md section 2), entering from the inflow edges;
     - the body section cut out to alpha 0 (the transparent interior, as the
       lattice's composite does) with a hairline outline, from the CAD profile
       (nose, tubes and screw cap: maximum radius per 2 mm station) and the two
       in-plane fins (parts 6 and 8, convex hull on (x, y), scaled about the root
       leading edge by finScale); 'between' cuts the body only;
     - a livery strip on column 0 (upstream of the nose) and a hairline on the
       last row (the body's +x side), each labelled so it reads from the default
       camera on +z.
   If the slice mapping were mirrored, the streaks would cross the wind arrow
   instead of running parallel to it, and the cut-out would miss the airframe. */
import * as THREE from 'three';

const CELL_PX = 2;                  // canvas pixels per grid cell
const CHECK = 16;                   // checker square, cells
const PROFILE_PARTS = [0, 1, 2, 19];   // CAD: nose cone, upper and lower tube, screw cap
const FIN_IN_PLANE = [6, 8];        // CAD: fins at +x and -x lie in the pitch plane
const STATION_M = 0.002;            // profile sampling (m), as FIELD.md section 5

/* Profile and fin hulls from the assembly (positions in the bin are metres). */
export function measureCad(cad) {
  const { json, buffer } = cad;
  const byId = new Map(json.parts.map(p => [p.id, p]));
  let yMax = -Infinity, yMin = Infinity;
  /* Each part's own envelope (maximum radius per 2 mm station, sorted), then the
     profile is the maximum over parts of each envelope interpolated linearly
     between that part's stations. A tube mesh has vertices only at its two ends,
     so a plain per-station maximum over all parts would dip to whatever interior
     part happens to have vertices in between (the nose shoulder, for one). */
  const envelopes = [];
  for (const id of PROFILE_PARTS) {
    const p = byId.get(id);
    if (!p || !p.mesh) continue;
    const f = new Float32Array(buffer, p.mesh.vertexOffset, p.mesh.vertexCount);
    const bins = new Map();
    for (let i = 0; i < f.length; i += 3) {
      const r = Math.hypot(f[i], f[i + 2]), y = f[i + 1];
      const b = Math.round(y / STATION_M);
      if (!(bins.get(b) >= r)) bins.set(b, r);
      if (y > yMax) yMax = y; if (y < yMin) yMin = y;
    }
    envelopes.push([...bins.entries()].sort((a, b) => a[0] - b[0]).map(([b, r]) => [b * STATION_M, r]));
  }
  const at = (env, y) => {
    if (y < env[0][0] - 1e-9 || y > env[env.length - 1][0] + 1e-9) return 0;
    let lo = 0, hi = env.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (env[m][0] <= y) lo = m; else hi = m; }
    const [y0, r0] = env[lo], [y1, r1] = env[hi];
    return y1 > y0 ? r0 + (r1 - r0) * (y - y0) / (y1 - y0) : Math.max(r0, r1);
  };
  const profile = [];
  for (let y = yMax; y >= yMin - 1e-9; y -= STATION_M) profile.push([y, Math.max(0, ...envelopes.map(e => at(e, y)))]);
  if (profile.length && profile[profile.length - 1][0] > yMin) profile.push([yMin, Math.max(0, ...envelopes.map(e => at(e, yMin)))]);
  const fins = FIN_IN_PLANE.map(id => {
    const p = byId.get(id);
    if (!p || !p.mesh) return null;
    const f = new Float32Array(buffer, p.mesh.vertexOffset, p.mesh.vertexCount);
    const pts = [];
    for (let i = 0; i < f.length; i += 3) pts.push([f[i], f[i + 1]]);
    const hull = convexHull(pts);
    const side = Math.sign(p.bounds[0][0] + p.bounds[1][0]) || 1;
    const rootX = side * Math.min(Math.abs(p.bounds[0][0]), Math.abs(p.bounds[1][0])) * 0.001;
    const leY = p.bounds[1][1] * 0.001;
    return { id, hull, rootX, leY };
  }).filter(Boolean);
  return { profile, fins, noseY: yMax, tailY: yMin };
}

function convexHull(points) {
  const pts = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const p of pts) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
  upper.pop(); lower.pop();
  return lower.concat(upper);
}

export function createTestCard({ cols = 512, rows = 160 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = cols * CELL_PX; canvas.height = rows * CELL_PX;
  const g = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.flipY = false;                       // canvas top line = grid row 0 = v 0, as a render target
  texture.colorSpace = THREE.NoColorSpace;     // display values, sampled raw by the slice
  texture.minFilter = THREE.LinearFilter; texture.generateMipmaps = false;
  let measured = null;

  /* Draw the card. domain {cols, rows, cellM, xNoseCol, axisRow}; cad from scene.cad. */
  function draw({ alpha = 0, finScale = 1, view = 'through', domain, cad = null }) {
    if (!g) return;
    if (cad && !measured) measured = measureCad(cad);
    const W = canvas.width, H = canvas.height;
    const S = CELL_PX;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, W, H);
    // checkerboard, low alpha so the rocket shows through
    for (let r = 0; r < rows; r += CHECK) for (let c = 0; c < cols; c += CHECK) {
      g.fillStyle = ((r / CHECK + c / CHECK) & 1) ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.035)';
      g.fillRect(c * S, r * S, CHECK * S, CHECK * S);
    }
    // streaks along the inflow (cos a, sin a) from the edges the flow enters through
    const ca = Math.cos(alpha), sa = Math.sin(alpha);
    const L = Math.hypot(cols, rows) * 1.2;
    g.lineCap = 'round';
    const starts = [];
    for (let r = -rows; r < rows * 2; r += 14) starts.push([0, r]);
    for (const [c0, r0] of starts) {
      // back the start off upstream so every streak enters the domain
      const x0 = (c0 - ca * L * 0.5) * S, y0 = (r0 - sa * L * 0.5) * S;
      const x1 = (c0 + ca * L) * S, y1 = (r0 + sa * L) * S;
      const grd = g.createLinearGradient(x0, y0, x1, y1);
      grd.addColorStop(0, 'rgba(255,236,214,0.0)');
      grd.addColorStop(0.3, 'rgba(255,236,214,0.85)');
      grd.addColorStop(1, 'rgba(255,236,214,0.15)');
      g.strokeStyle = grd;
      g.lineWidth = 2.2 * S;
      g.shadowColor = 'rgba(255,236,214,0.6)'; g.shadowBlur = 6 * S;
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    }
    g.shadowBlur = 0;
    // inflow edge: column 0, livery strip; last row (body +x side), paper hairline
    g.fillStyle = 'rgba(214,59,8,0.95)'; g.fillRect(0, 0, 3 * S, H);
    g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillRect(0, H - S, W, S);
    // body section cut out (transparent interior) with an outline
    if (measured && domain) {
      const { cellM, xNoseCol, axisRow } = domain;
      const noseY = measured.noseY;
      const toCol = (y) => (xNoseCol + (noseY - y) / cellM) * S;
      const toRow = (x) => (axisRow + x / cellM) * S;
      const path = new Path2D();
      const prof = measured.profile;
      prof.forEach(([y, r], i) => { const X = toCol(y), Y = toRow(r); if (i) path.lineTo(X, Y); else path.moveTo(X, Y); });
      for (let i = prof.length - 1; i >= 0; i--) path.lineTo(toCol(prof[i][0]), toRow(-prof[i][1]));
      path.closePath();
      if (view === 'through' && finScale > 0) {
        for (const fin of measured.fins) {
          fin.hull.forEach(([x, y], i) => {
            const xs = fin.rootX + (x - fin.rootX) * finScale, ys = fin.leY + (y - fin.leY) * finScale;
            const X = toCol(ys), Y = toRow(xs);
            if (i) path.lineTo(X, Y); else path.moveTo(X, Y);
          });
          path.closePath();
        }
      }
      g.globalCompositeOperation = 'destination-out';
      g.fillStyle = '#000'; g.fill(path, 'nonzero');
      g.globalCompositeOperation = 'source-over';
      g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 1 * S; g.stroke(path);
    }
    // labels that read from the default camera on +z: on screen, canvas +y runs right and
    // canvas +x runs down, so text is drawn through the transposing transform (a reflection).
    g.save();
    g.setTransform(0, 1, 1, 0, 0, 0);
    g.font = `400 ${7 * S}px "IBM Plex Mono", ui-monospace, monospace`;
    g.textBaseline = 'top';
    g.fillStyle = 'rgba(214,59,8,1)';
    g.fillText('COL 0  UPSTREAM', 6 * S, 5 * S);
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.textAlign = 'right';
    g.fillText('ROW +  BODY +X', H - 6 * S, W - 13 * S);
    g.restore();
    texture.needsUpdate = true;
  }
  return { canvas, texture, draw, get measured() { return measured; }, dispose() { texture.dispose(); } };
}
