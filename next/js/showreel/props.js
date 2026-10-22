// Showreel props: a ceramic coffee mug and a plain red 355 ml soda can.
//
//   import { createMug, createCan } from './props.js';
//   const mug = createMug({ renderer, quality: 'high' });   // quality: 'high' | 'low'
//
// Both follow the module API shape (group, duration, setProgress, update, dispose). Units are
// metres, +Y up, the base of the object sits on y = 0 and the axis is x = z = 0. Neither prop
// animates by itself (duration 0, setProgress and update are no-ops), so stills are free.
//
// createMug() extras
//   coffeeSurface   Mesh, the coffee disc (planar UV, canvas map with a faint crema ring)
//   coffeeY         world-up height of the coffee surface above the base (0.0725)
//   coffeeRadius    radius of the coffee surface where it meets the glaze
//   rimRadius       inner radius of the mug at the lip: radius of the open mouth (0.0362)
//   rimY            height of the lip (0.085): put steam between coffeeY and rimY + a bit
//   height, outerRadius
//   Glaze is charcoal outside and warm off-white inside so the coffee reads against it.
//
// createCan() extras
//   bodyMesh / bodyMaterial  the painted red body (MeshStandardMaterial). The FX artist hooks
//                            condensation here. UVs are isotropic in metres: u = angle / 2pi,
//                            v = arc length / circumference, so bodyMesh.userData.uvMetres
//                            (= circumference, 0.2077) converts 1 uv unit to metres in both axes.
//                            v = 0 at the bottom of the painted body, about 0.50 at its neck.
//   baseMesh, topMesh        brushed aluminium dome/ring and lid with seam
//   tabMesh                  pull tab (plus rivet and score line as children of group)
//   height, radius, tabAngle the tab points along +X (rotate group.rotation.y to taste)
//
// Lighting: no lights or environment here. The metal parts need an environment map (the
// engine's shared one) to look like metal; with only direct lights they go dark.
import * as THREE from '../three.module.min.js';

const TAU = Math.PI * 2;

// ---------------------------------------------------------------- profile helpers
// A profile is a polyline of [r, y] points walked so that the solid lies on the left. Normals
// come from central differences, so tangent-continuous joins shade perfectly smooth.
class Profile {
  constructor() { this.pts = []; this.marks = {}; }
  get last() { return this.pts[this.pts.length - 1]; }
  push(r, y) {
    const l = this.last;
    if (l && Math.abs(l[0] - r) < 1e-9 && Math.abs(l[1] - y) < 1e-9) return this;
    this.pts.push([r, y]); return this;
  }
  reverse() { this.pts.reverse(); return this; }
  mark(name) { this.marks[name] = this.pts.length - 1; return this; }
  line(r, y, n = 1) {
    const [r0, y0] = this.last;
    for (let i = 1; i <= n; i++) this.push(r0 + (r - r0) * i / n, y0 + (y - y0) * i / n);
    return this;
  }
  // centre (cr, cy) in (r, y) space, angles in radians, point = c + rad * (cos a, sin a)
  arc(cr, cy, rad, a0, a1, n) {
    for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; this.push(cr + rad * Math.cos(a), cy + rad * Math.sin(a)); }
    return this;
  }
  // cubic bezier from the current point
  bez(p1, p2, p3, n) {
    const p0 = this.last;
    for (let i = 1; i <= n; i++) {
      const t = i / n, u = 1 - t;
      const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
      this.push(a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]);
    }
    return this;
  }
  // normals (nr, ny) and cumulative arc length s for every point
  finish() {
    const P = this.pts, n = P.length;
    this.normals = []; this.s = [0];
    for (let i = 0; i < n; i++) {
      const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)];
      let dr = b[0] - a[0], dy = b[1] - a[1]; const l = Math.hypot(dr, dy) || 1; dr /= l; dy /= l;
      this.normals.push([dy, -dr]);
      if (i) this.s.push(this.s[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
    }
    return this;
  }
}

// Surface of revolution from profile points [i0 .. i1]. uv: u around, v = (s - s0) / vScale.
function revolve(prof, i0, i1, segs, vScale) {
  const rows = i1 - i0 + 1, cols = segs + 1;
  const pos = new Float32Array(rows * cols * 3), nor = new Float32Array(rows * cols * 3), uv = new Float32Array(rows * cols * 2);
  const s0 = prof.s[i0];
  for (let j = 0; j < rows; j++) {
    const [r, y] = prof.pts[i0 + j], [nr, ny] = prof.normals[i0 + j], v = (prof.s[i0 + j] - s0) / vScale;
    for (let k = 0; k < cols; k++) {
      const a = (k % segs) / segs * TAU, sn = Math.sin(a), cs = Math.cos(a), o = j * cols + k;   // seam column reuses the exact k = 0 values
      pos[o * 3] = r * sn; pos[o * 3 + 1] = y; pos[o * 3 + 2] = r * cs;
      nor[o * 3] = nr * sn; nor[o * 3 + 1] = ny; nor[o * 3 + 2] = nr * cs;
      uv[o * 2] = k / segs; uv[o * 2 + 1] = v;
    }
  }
  const idx = [];
  for (let j = 0; j < rows - 1; j++) for (let k = 0; k < segs; k++) {
    const a = j * cols + k, b = a + 1, c = a + cols, d = c + 1;
    // skip degenerate triangles at the axis
    if (prof.pts[i0 + j][0] > 1e-7) idx.push(a, b, c);
    if (prof.pts[i0 + j + 1][0] > 1e-7) idx.push(b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere(); g.computeBoundingBox();
  return g;
}

// radius of a profile (monotonic in y over the given point range) at height y
function radiusAt(prof, i0, i1, y) {
  for (let i = i0; i < i1; i++) {
    const a = prof.pts[i], b = prof.pts[i + 1];
    if ((a[1] - y) * (b[1] - y) <= 0 && a[1] !== b[1]) return a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]);
  }
  return prof.pts[i1][0];
}

function triCount(group) {
  let t = 0;
  group.traverse(o => { if (o.isMesh) t += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
  return t;
}

function canvasOrNull(w, h) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}

// Fine brushed / spun-metal grain as a roughness map (green channel). Lines run around the
// axis (constant along u) so highlights on the lid read as turned rings.
function brushedTexture(seed = 7) {
  const c = canvasOrNull(256, 256); if (!c) return null;
  const ctx = c.getContext('2d');
  let s = seed; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  ctx.fillStyle = '#d2d2d2'; ctx.fillRect(0, 0, 256, 256);
  let level = 0.86;
  for (let y = 0; y < 256; y++) {
    level += (rnd() - 0.5) * 0.07; level = Math.min(1, Math.max(0.74, level));
    const v = Math.round(level * 255);
    ctx.fillStyle = `rgb(${v},${v},${v})`; ctx.fillRect(0, y, 256, 1);
  }
  // sparse longer streaks, still wrapping seamlessly in x
  for (let i = 0; i < 90; i++) {
    const y = Math.floor(rnd() * 256), v = Math.round((0.55 + rnd() * 0.45) * 255);
    ctx.globalAlpha = 0.25 + rnd() * 0.3; ctx.fillStyle = `rgb(${v},${v},${v})`;
    const x0 = rnd() * 256, w = 40 + rnd() * 160;
    ctx.fillRect(x0, y, w, 1); if (x0 + w > 256) ctx.fillRect(x0 - 256, y, w, 1);
  }
  ctx.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}

// ---------------------------------------------------------------- mug
const MUG = { H: 0.085, ro: 0.040, ri: 0.0362, coffeeY: 0.0725 };

function coffeeTexture() {
  const c = canvasOrNull(256, 256); if (!c) return null;
  const ctx = c.getContext('2d'), m = 128;
  let s = 11; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const g = ctx.createRadialGradient(m, m, 0, m, m, m);
  g.addColorStop(0, '#2b160a'); g.addColorStop(0.5, '#331a0c'); g.addColorStop(0.78, '#3f2210');
  g.addColorStop(0.89, '#5a3519'); g.addColorStop(0.945, '#7b4f29'); g.addColorStop(0.985, '#5a3719'); g.addColorStop(1, '#2a150a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
  // soft crema patches (no hard strokes) and a few small bubbles clinging near the wall
  for (let i = 0; i < 7; i++) {
    const a = rnd() * TAU, r = 25 + rnd() * 55, x = m + Math.cos(a) * r, y = m + Math.sin(a) * r, rad = 28 + rnd() * 34;
    const pg = ctx.createRadialGradient(x, y, 0, x, y, rad);
    pg.addColorStop(0, `rgba(118,76,40,${0.16 + rnd() * 0.1})`); pg.addColorStop(1, 'rgba(118,76,40,0)');
    ctx.fillStyle = pg; ctx.fillRect(0, 0, 256, 256);
  }
  for (let i = 0; i < 46; i++) {
    const a = rnd() * TAU, r = 100 + rnd() * 22, rad = 0.8 + rnd() * 2.2;
    ctx.fillStyle = `rgba(150,102,60,${0.25 + rnd() * 0.3})`;
    ctx.beginPath(); ctx.arc(m + Math.cos(a) * r, m + Math.sin(a) * r, rad, 0, TAU); ctx.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

function handleGeometry(lengthSegs, radialSegs) {
  // C-shaped strap in the XY plane on the +X side, ends buried in the wall.
  const curve = new THREE.CatmullRomCurve3([
    [0.0395, 0.0705], [0.0450, 0.0738], [0.0560, 0.0752], [0.0648, 0.0680], [0.0688, 0.0540],
    [0.0668, 0.0375], [0.0585, 0.0245], [0.0478, 0.0185], [0.0352, 0.0178]
  ].map(p => new THREE.Vector3(p[0], p[1], 0)), false, 'centripetal');
  const cols = radialSegs + 1, rows = lengthSegs + 1;
  const pos = new Float32Array(rows * cols * 3), uv = new Float32Array(rows * cols * 2);
  const p = new THREE.Vector3(), t = new THREE.Vector3(), N = new THREE.Vector3(), B = new THREE.Vector3(0, 0, 1);
  const ss = (a, b, x) => { x = Math.min(1, Math.max(0, (x - a) / (b - a))); return x * x * (3 - 2 * x); };
  const e = 2 / 2.7; // superellipse exponent: soft rounded strap section
  for (let i = 0; i < rows; i++) {
    const u = i / lengthSegs;
    curve.getPointAt(u, p); curve.getTangentAt(u, t);
    N.set(-t.y, t.x, 0).normalize();
    const flare = 1 + 0.30 * (1 - ss(0, 0.2, u)) + 0.34 * (1 - ss(0, 0.2, 1 - u));
    const mid = 1 - 0.18 * Math.sin(u * Math.PI);                   // slimmer in the middle
    const hw = 0.0060 * (1 + 0.5 * (flare - 1)) * mid, ht = 0.0042 * flare * (0.92 + 0.08 * mid);
    for (let k = 0; k < cols; k++) {
      const a = k / radialSegs * TAU, c = Math.cos(a), s = Math.sin(a);
      const x = Math.sign(c) * Math.pow(Math.abs(c), e), z = Math.sign(s) * Math.pow(Math.abs(s), e);
      const o = i * cols + k;
      pos[o * 3] = p.x + N.x * ht * x; pos[o * 3 + 1] = p.y + N.y * ht * x; pos[o * 3 + 2] = hw * z;
      uv[o * 2] = k / radialSegs; uv[o * 2 + 1] = u;
    }
  }
  const idx = [];
  for (let i = 0; i < rows - 1; i++) for (let k = 0; k < radialSegs; k++) {
    const a = i * cols + k, b = a + 1, c = a + cols, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // computeVertexNormals leaves the seam column unsmoothed: average the duplicated column
  const n = g.attributes.normal;
  for (let i = 0; i < rows; i++) {
    const a = i * cols, b = a + radialSegs;
    const x = n.getX(a) + n.getX(b), y = n.getY(a) + n.getY(b), z = n.getZ(a) + n.getZ(b), l = Math.hypot(x, y, z) || 1;
    n.setXYZ(a, x / l, y / l, z / l); n.setXYZ(b, x / l, y / l, z / l);
  }
  g.computeBoundingSphere(); g.computeBoundingBox();
  return g;
}

export function createMug({ quality = 'high' } = {}) {
  const segs = quality === 'low' ? 40 : 64;
  const { H, ro, ri, coffeeY } = MUG;
  const group = new THREE.Group(); group.name = 'mug';

  // body profile: foot, outer wall, rounded lip, inner wall, floor (solid on the left)
  const P = new Profile();
  P.push(0, 0).line(0.0335, 0)
    .arc(0.0335, 0.003, 0.003, -Math.PI / 2, 0, 4)                               // foot radius
    .bez([0.0373, 0.0290], [0.0392, 0.0600], [ro, H - 0.0019], 10)               // slightly flared wall
    .arc(ro - 0.0019, H - 0.0019, 0.0019, 0, Math.PI, 8);                       // lip, apex is the middle
  const lipIndex = P.pts.length - 1 - 4; P.mark('apex');
  P.marks.apex = lipIndex;
  P.bez([0.0360, 0.0600], [0.0348, 0.0300], [0.0336, 0.0125], 10)                // inner wall
    .arc(0.0276, 0.0125, 0.006, 0, -Math.PI / 2, 5)                              // floor fillet
    .line(0, 0.0065, 2);
  P.finish();

  const glazeOut = new THREE.MeshStandardMaterial({ color: 0x2f2d2b, roughness: 0.58, metalness: 0 });
  const glazeIn = new THREE.MeshStandardMaterial({ color: 0xe9e2d3, roughness: 0.32, metalness: 0 });
  const outer = new THREE.Mesh(revolve(P, 0, lipIndex, segs, 0.2), glazeOut); outer.name = 'mugOuter';
  const inner = new THREE.Mesh(revolve(P, lipIndex, P.pts.length - 1, segs, 0.2), glazeIn); inner.name = 'mugInner';

  const handle = new THREE.Mesh(handleGeometry(quality === 'low' ? 24 : 36, quality === 'low' ? 10 : 14), glazeOut); handle.name = 'mugHandle';

  // coffee: slight meniscus where it climbs the wall, planar uv for the crema texture
  const innerFrom = lipIndex;
  const rWall = radiusAt(P, innerFrom, P.pts.length - 1, coffeeY);
  const cr = rWall + 0.0004;
  const C = new Profile();
  C.push(0, coffeeY).line(cr - 0.0030, coffeeY, 2).bez([cr - 0.0014, coffeeY], [cr - 0.0006, coffeeY + 0.0003], [cr, coffeeY + 0.0011], 3);
  C.reverse().finish();
  const cg = revolve(C, 0, C.pts.length - 1, segs, 0.2);
  {
    const p = cg.attributes.position, uv = cg.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, 0.5 + p.getX(i) / (2 * cr), 0.5 - p.getZ(i) / (2 * cr));
  }
  const cTex = coffeeTexture();
  const coffeeMat = new THREE.MeshPhysicalMaterial({
    color: cTex ? 0xffffff : 0x3a1f0e, map: cTex, roughness: 0.17, metalness: 0, ior: 1.33, specularIntensity: 1
  });
  const coffeeSurface = new THREE.Mesh(cg, coffeeMat); coffeeSurface.name = 'coffeeSurface';

  group.add(outer, inner, handle, coffeeSurface);

  const mats = [glazeOut, glazeIn, coffeeMat], geos = [outer.geometry, inner.geometry, handle.geometry, cg];
  return {
    group, duration: 0,
    setProgress() {}, update() {},
    dispose() { geos.forEach(g => g.dispose()); mats.forEach(m => m.dispose()); if (cTex) cTex.dispose(); },
    coffeeSurface, coffeeY, coffeeRadius: cr, rimRadius: ri, rimY: H, height: H, outerRadius: ro,
    triangles: () => triCount(group)
  };
}

// ---------------------------------------------------------------- can
const CAN = { R: 0.03310, H: 0.1221, circumference: TAU * 0.03310 };

// convex hull (monotone chain) of 2D points, used to blend the tab's ring and nose
function hull(points) {
  const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  lo.pop(); up.pop(); return lo.concat(up);
}
function ellipsePts(cx, cy, rx, ry, n, a0 = 0, a1 = TAU) {
  const out = []; for (let i = 0; i < n; i++) { const a = a0 + (a1 - a0) * i / n; out.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]); } return out;
}

export function createCan({ quality = 'high' } = {}) {
  const segs = quality === 'low' ? 40 : 64;
  const { R, H, circumference } = CAN;
  const group = new THREE.Group(); group.name = 'can';
  const P = new Profile();

  // --- bottom: concave dome, standing ring, chime wall that blends into the body
  const rRing = 0.0235, dRing = 0.0020, domeR = 0.0320;
  const sag = domeR - Math.sqrt(domeR * domeR - rRing * rRing);
  const th = Math.asin(rRing / domeR);                       // slope of the dome where it meets the ring
  const yEnd = dRing * (1 - Math.cos(th));                    // so that the ring's lowest point is y = 0
  const dome0 = yEnd + sag, domeCy = dome0 - domeR;
  for (let i = 0; i <= 4; i++) {                             // apex first, walking outward and down
    const a = Math.PI / 2 - th * i / 4;
    P.push(domeR * Math.cos(a), domeCy + domeR * Math.sin(a));
  }
  // ring arc, ccw, starting with the tangent of the dome (pointing outward and down)
  const a0 = -Math.PI / 2 - th, a1 = -0.75;
  P.arc(rRing + dRing * Math.sin(th), yEnd + dRing * Math.cos(th), dRing, a0, a1, 6);
  const tEnd = [-Math.sin(a1), Math.cos(a1)], pe = P.last;
  P.bez([pe[0] + tEnd[0] * 0.0038, pe[1] + tEnd[1] * 0.0038], [R, 0.0092 - 0.0030], [R, 0.0092], 6);
  P.mark('baseTop');
  // --- body: cylinder, shoulder, neck
  P.line(R, 0.1030, 1)
    .bez([R, 0.1068], [0.0272, 0.1082], [0.0263, 0.1125], 8)
    .line(0.0260, 0.1150, 1);
  P.mark('neckTop');
  // --- top: seam out, rounded crown, countersink wall, panel
  P.bez([0.0262, 0.1160], [0.0277, 0.1160], [0.0278, 0.1176], 5)
    .line(0.0278, 0.1198, 1)
    .arc(0.0256, 0.1199, 0.0022, 0, Math.PI, 8)
    .line(0.0226, 0.1173, 2)
    .arc(0.0215, 0.1173, 0.0011, 0, -Math.PI / 2, 4)           // fillet into the panel
    .line(0, 0.1162, 2);
  P.finish();

  const pb = P.marks.baseTop, pn = P.marks.neckTop, pend = P.pts.length - 1;
  const panelY = 0.1162;

  // materials
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xb8141c, roughness: 0.4, metalness: 0.42 });
  const rough = brushedTexture();
  if (rough) rough.repeat.set(1, circumference / 0.03);
  const metal = new THREE.MeshPhysicalMaterial({
    color: 0xdfe2e5, metalness: 1, roughness: 0.34, roughnessMap: rough || null
  });
  const baseMat = metal.clone(), topMat = metal.clone();
  topMat.roughness = 0.3;

  const bodyMesh = new THREE.Mesh(revolve(P, pb, pn, quality === 'low' ? 48 : 96, circumference), bodyMaterial); bodyMesh.name = 'canBody';
  bodyMesh.userData.uvMetres = circumference;
  const baseMesh = new THREE.Mesh(revolve(P, 0, pb, segs, circumference), baseMat); baseMesh.name = 'canBase';
  const topMesh = new THREE.Mesh(revolve(P, pn, pend, segs, circumference), topMat); topMesh.name = 'canTop';
  group.add(bodyMesh, baseMesh, topMesh);

  // --- pull tab: hull of a ring and a nose, with a finger hole, lifted off the panel on a rivet
  const outline = hull([...ellipsePts(0.0125, 0, 0.0090, 0.0082, 40), ...ellipsePts(-0.0028, 0, 0.0046, 0.0046, 24)]);
  const shape = new THREE.Shape(outline.map(p => new THREE.Vector2(p[0], p[1])));
  const hole = new THREE.Path(ellipsePts(0.0130, 0, 0.0054, 0.0044, 28).map(p => new THREE.Vector2(p[0], p[1])));
  shape.holes.push(hole);
  const tabGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.0006, bevelEnabled: true, bevelThickness: 0.00012, bevelSize: 0.00012, bevelSegments: 1, curveSegments: 12 });
  tabGeo.rotateX(-Math.PI / 2);
  const tabMat = metal.clone(); tabMat.roughness = 0.28; tabMat.roughnessMap = null;
  const tabMesh = new THREE.Mesh(tabGeo, tabMat); tabMesh.name = 'canTab';
  const tabY = panelY + 0.0021;
  tabMesh.position.set(0, tabY, 0); tabMesh.rotation.z = -0.02;
  const rivetGeo = new THREE.SphereGeometry(0.0029, 16, 6, 0, TAU, 0, Math.PI / 2); rivetGeo.scale(1, 0.42, 1);
  const rivet = new THREE.Mesh(rivetGeo, tabMat); rivet.position.set(0, tabY + 0.0007, 0); rivet.name = 'canRivet';
  const stud = new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0026, tabY - panelY, 12, 1, true), baseMat);
  stud.position.set(0, (tabY + panelY) / 2, 0); stud.name = 'canStud';
  // score line of the opening flap, a hairline groove
  const scoreOuter = ellipsePts(-0.0108, 0, 0.0100, 0.0085, 48), scoreInner = ellipsePts(-0.0108, 0, 0.0096, 0.0081, 48);
  const score = new THREE.Shape(scoreOuter.map(p => new THREE.Vector2(p[0], p[1])));
  score.holes.push(new THREE.Path(scoreInner.map(p => new THREE.Vector2(p[0], p[1]))));
  const scoreGeo = new THREE.ShapeGeometry(score, 24); scoreGeo.rotateX(-Math.PI / 2);
  const scoreMat = new THREE.MeshStandardMaterial({ color: 0x6d7176, metalness: 0.9, roughness: 0.55 });
  const scoreMesh = new THREE.Mesh(scoreGeo, scoreMat); scoreMesh.position.y = panelY + 0.00012; scoreMesh.name = 'canScore';
  group.add(tabMesh, rivet, stud, scoreMesh);

  const mats = [bodyMaterial, baseMat, topMat, tabMat, scoreMat, metal];
  const geos = [bodyMesh.geometry, baseMesh.geometry, topMesh.geometry, tabGeo, rivetGeo, stud.geometry, scoreGeo];
  return {
    group, duration: 0,
    setProgress() {}, update() {},
    dispose() { geos.forEach(g => g.dispose()); mats.forEach(m => m.dispose()); if (rough) rough.dispose(); },
    bodyMesh, bodyMaterial, baseMesh, topMesh, tabMesh,
    height: H, radius: R, tabAngle: 0, panelY,
    triangles: () => triCount(group)
  };
}

export default { createMug, createCan };
