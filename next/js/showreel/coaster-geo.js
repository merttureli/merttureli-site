// Therma-Shift coaster: the geometry the CAD does not carry (coaster.js builds the device from it).
//
// The STEP gives the case, the lid ring, the heatsink, the blower frame and one detailed board; everything else is a
// plain block, or missing. This module models those parts to scale from what the real part is (REFERENCE.md of the
// pilot): the plate with its edge break, M2 socket head cap screws with a hex socket, the panel push button, the
// USB-C receptacle, the Peltier module (two ceramic plates, sealed edge, leads), the blower's impeller, the four
// electronics modules, the thermistor. Nothing here changes the design: every part keeps the CAD's envelope and place.
//
// All parts are authored in millimetres in COASTER SPACE (plate top centre at the origin, +Y up, the port face
// looks along +Z) and written in metres. One part is one merged BufferGeometry ("painted" geometry): per vertex a
// linear colour, a metalness and a roughness (attribute `surf`), and a uv into the detail atlas (coaster-tex.js), so
// one material and one draw call cover a whole part whatever it is made of.
//
//   painter(THREE)                     the builder: box, quad, lathe, ngon, prism, band, disc, tube; build() -> geometry
//   paint(THREE, hex, metal, rough)    a surface: sRGB hex colour, metalness, roughness
//   DIM                                the measured design (mm), shared with coaster-shade.js and coaster.js
//   buildPlate, buildScrews, buildButton, buildReceptacle, buildPeltier, buildRotor, buildBlurRing, buildBoards,
//   buildThermistor                    (THREE, { low, atlas }) -> BufferGeometry (metres, coaster space)

// ------------------------------------------------------------------ design
// Measured on the CAD in the exact frame (the STEP is turned 33.1575 degrees; coaster.js undoes exactly that).
export const DIM = {
  hull: { x: 42.5, z: 45.0, y0: -28.98, y1: 3.13, r: 2.5 },          // case + lid ring, outer
  tray: { x: 39.0, z: 40.0 },                                          // the lid ring's opening over the plate
  gap: { y0: -1.48, y1: -0.67 },                                       // reveal between the case and the lid ring
  cavity: { x: 40.0, z: 40.0, floor: -26.98, rim: -1.48 },             // inside the case
  plate: { x: 40.0, z: 40.0, t: 1.5 },
  screw: { x: 35.0, z: 42.5, top: 3.33, seat: 1.33, tip: -4.67, bore: 1.9 },
  button: { x: 29.625, y: -16.29, z: 45.0, r: 3.6 },                   // the round hole on the port face
  port: { x: -25.5, y: -23.98, w: 12.4, h: 6.0, r: 1.0, z: 45.0, wall: 5.0 },   // the cutout through the 5 mm wall
  usb: { x: -25.5, y: -25.30, z: 40.0 },                               // the receptacle's axis and mouth (inner wall face)
  vent: { x: 0, y: -21.97, w: 28.0, h: 8.0, r: 3.4, z0: 30.0, duct: 20.0 },
  peltier: { s: 20.0, y0: -5.1, y1: -1.5 },
  sink: { s: 20.0, top: -5.1, base: -8.1, pins: -16.0, spacer: -17.0 },
  blower: { s: 20.0, top: -17.0, bottom: -27.0, hub: 10.0, ring: 14.0, floor: -25.0 },
  pd: { x0: -31.0, x1: -20.0, y0: -26.98, y1: -14.98, z0: 12.0, z1: 40.0 },
  buck: { x0: -28.37, x1: -10.87, y0: -27.18, y1: -14.88, z0: -24.3, z1: -20.0 },
  drvA: { x0: 27.59, x1: 35.59, y0: -23.18, y1: -3.18, z0: -1.77, z1: 22.23 },
  drvB: { x0: 27.65, x1: 35.65, y0: -23.18, y1: -3.18, z0: -25.77, z1: -1.77 },
};

export function paint(THREE, hex, metal = 0, rough = 0.5, gain = 1) {
  const c = new THREE.Color(hex);
  return { c: [c.r * gain, c.g * gain, c.b * gain], m: metal, r: rough };
}
// the same surface, darker (cheap baked occlusion for sockets, slots and insides)
const shade = (p, k) => ({ c: [p.c[0] * k, p.c[1] * k, p.c[2] * k], m: p.m, r: p.r });

// ----------------------------------------------------------------- painter
export function painter(THREE, { white = [0.004, 0.996] } = {}) {
  const pos = [], nrm = [], col = [], srf = [], uvs = [], idx = [];
  let M = new THREE.Matrix4(), N = new THREE.Matrix3(), flip = false;
  const stack = [];
  const v = new THREE.Vector3(), n = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3();
  function vert(x, y, z, nx, ny, nz, p, u = white[0], w = white[1]) {
    v.set(x, y, z).applyMatrix4(M); n.set(nx, ny, nz).applyMatrix3(N).normalize();
    pos.push(v.x, v.y, v.z); nrm.push(n.x, n.y, n.z); col.push(p.c[0], p.c[1], p.c[2]); srf.push(p.m, p.r); uvs.push(u, w);
    return pos.length / 3 - 1;
  }
  const tri = (i, j, k) => (flip ? idx.push(i, k, j) : idx.push(i, j, k));
  // run f with the transform m (Matrix4) applied on top of the current one
  function at(m, f) {
    stack.push([M.clone(), flip]);
    M = M.clone().multiply(m); N.getNormalMatrix(M); flip = M.determinant() < 0;
    f();
    [M, flip] = stack.pop(); N.getNormalMatrix(M);
  }
  // a flat quad, corners counter-clockwise seen from outside; uv: [u0, v0, u1, v1] for corners 0 (u0, v0) .. 2 (u1, v1)
  function quad(p0, p1, p2, p3, p, uv) {
    a.set(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]); b.set(p3[0] - p0[0], p3[1] - p0[1], p3[2] - p0[2]);
    a.cross(b).normalize();
    const U = uv ? [[uv[0], uv[1]], [uv[2], uv[1]], [uv[2], uv[3]], [uv[0], uv[3]]] : null;
    const i = [p0, p1, p2, p3].map((q, k) => vert(q[0], q[1], q[2], a.x, a.y, a.z, p, U ? U[k][0] : undefined, U ? U[k][1] : undefined));
    tri(i[0], i[1], i[2]); tri(i[0], i[2], i[3]);
  }
  // an axis-aligned box from its bounds; skip: string of faces to leave out ('x-', 'y+', ...);
  // paints: per face override { 'y+': paint }; uv: per face [u0, v0, u1, v1] (left-bottom to right-top seen from outside)
  function box(x0, x1, y0, y1, z0, z1, p, { skip = '', paints = {}, uv = {} } = {}) {
    const F = {
      'x+': [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]],
      'x-': [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]],
      'y+': [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]],
      'y-': [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]],
      'z+': [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]],
      'z-': [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]],
    };
    for (const k in F) if (!skip.includes(k)) quad(...F[k], paints[k] || p, uv[k]);
  }
  // a surface of revolution about the local Y axis. profile: [[r, y, flags?, paint?], ...]; walking along it the
  // outside is on the right (bottom to top up the outside, then inward over the top). flags: 's' joins the two
  // segments at that point smoothly; paint applies to the segment that starts there. arc, start: partial turns.
  function lathe(profile, seg, p, { arc = Math.PI * 2, start = 0 } = {}) {
    const P = profile, K = P.length - 1, sn = [];
    for (let i = 0; i < K; i++) { const dr = P[i + 1][0] - P[i][0], dy = P[i + 1][1] - P[i][1], l = Math.hypot(dr, dy) || 1; sn.push([dy / l, -dr / l]); }
    const closed = Math.abs(arc - Math.PI * 2) < 1e-6;
    for (let i = 0; i < K; i++) {
      const pp = P[i][3] || p;
      const s0 = i > 0 && /s/.test(P[i][2] || ''), s1 = i < K - 1 && /s/.test(P[i + 1][2] || '');
      const n0 = s0 ? [sn[i][0] + sn[i - 1][0], sn[i][1] + sn[i - 1][1]] : sn[i];
      const n1 = s1 ? [sn[i][0] + sn[i + 1][0], sn[i][1] + sn[i + 1][1]] : sn[i];
      const ring = [];
      for (let j = 0; j <= seg; j++) {
        const t = start + arc * j / seg, c = Math.cos(t), s = Math.sin(t);
        ring.push([vert(P[i][0] * c, P[i][1], P[i][0] * s, n0[0] * c, n0[1], n0[0] * s, pp), vert(P[i + 1][0] * c, P[i + 1][1], P[i + 1][0] * s, n1[0] * c, n1[1], n1[0] * s, pp)]);
      }
      for (let j = 0; j < seg; j++) {
        const A = ring[j], B = ring[closed && j === seg - 1 ? seg : j + 1];
        if (P[i + 1][0] > 1e-9) tri(A[0], A[1], B[1]);
        if (P[i][0] > 1e-9) tri(A[0], B[1], B[0]);
      }
    }
  }
  // a closed outline in the local XY plane ([[x, y], ...], counter-clockwise seen from +Z) pulled from z0 to z1
  // (z1 > z0): the wall only. inside: the wall faces inward (a hole). smooth: one normal per point (round shapes).
  function prism(out, z0, z1, p, { inside = false, smooth = false } = {}) {
    const L = out.length, nn = [];
    for (let i = 0; i < L; i++) {
      const A = out[i], B = out[(i + 1) % L], dx = B[0] - A[0], dy = B[1] - A[1], l = Math.hypot(dx, dy) || 1;
      nn.push([dy / l, -dx / l]);
    }
    const k = inside ? -1 : 1;
    for (let i = 0; i < L; i++) {
      const j = (i + 1) % L, A = out[i], B = out[j], h = (i + L - 1) % L;
      const na = smooth ? [nn[i][0] + nn[h][0], nn[i][1] + nn[h][1]] : nn[i], nb = smooth ? [nn[i][0] + nn[j][0], nn[i][1] + nn[j][1]] : nn[i];
      const i0 = vert(A[0], A[1], z0, na[0] * k, na[1] * k, 0, p), i1 = vert(B[0], B[1], z0, nb[0] * k, nb[1] * k, 0, p);
      const i2 = vert(B[0], B[1], z1, nb[0] * k, nb[1] * k, 0, p), i3 = vert(A[0], A[1], z1, na[0] * k, na[1] * k, 0, p);
      if (inside) { tri(i0, i2, i1); tri(i0, i3, i2); } else { tri(i0, i1, i2); tri(i0, i2, i3); }
    }
  }
  // the strip between two outlines with the same point count (A at zA, B at zB), flat per segment unless smooth
  // with a given normal function; up = +1 faces +Z when B is outside A (an annulus seen from +Z)
  function band(A, zA, B, zB, p, { up = 1 } = {}) {
    const L = A.length;
    for (let i = 0; i < L; i++) {
      const j = (i + 1) % L;
      const q = [[A[i][0], A[i][1], zA], [B[i][0], B[i][1], zB], [B[j][0], B[j][1], zB], [A[j][0], A[j][1], zA]];
      if (up > 0) quad(q[0], q[1], q[2], q[3], p); else quad(q[3], q[2], q[1], q[0], p);
    }
  }
  // a fan over a convex outline at z, facing +Z (up = 1) or -Z
  function cap(out, z, p, { up = 1, uv = null } = {}) {
    let cx = 0, cy = 0; for (const q of out) { cx += q[0]; cy += q[1]; } cx /= out.length; cy /= out.length;
    const f = (x, y) => (uv ? [uv[0] + (x - uv[4]) * uv[2], uv[1] + (y - uv[5]) * uv[3]] : [undefined, undefined]);
    const c = vert(cx, cy, z, 0, 0, up, p, ...f(cx, cy));
    const r = out.map(q => vert(q[0], q[1], z, 0, 0, up, p, ...f(q[0], q[1])));
    for (let i = 0; i < out.length; i++) { const j = (i + 1) % out.length; if (up > 0) tri(c, r[i], r[j]); else tri(c, r[j], r[i]); }
  }
  // a round tube along a polyline (points [[x, y, z], ...]), n sides, parallel-transported frames
  function tube(pts, r, n, p, { caps = true, pEnd = null, endLen = 0 } = {}) {
    const P = pts.map(q => new THREE.Vector3(...q)), T = [];
    for (let i = 0; i < P.length; i++) T.push(new THREE.Vector3().subVectors(P[Math.min(P.length - 1, i + 1)], P[Math.max(0, i - 1)]).normalize());
    let u = new THREE.Vector3(0, 1, 0); if (Math.abs(T[0].y) > 0.9) u.set(1, 0, 0);
    u.sub(T[0].clone().multiplyScalar(u.dot(T[0]))).normalize();
    const rings = [];
    let run = 0; const len = [0];
    for (let i = 1; i < P.length; i++) { run += P[i].distanceTo(P[i - 1]); len.push(run); }
    for (let i = 0; i < P.length; i++) {
      if (i) { u.sub(T[i].clone().multiplyScalar(u.dot(T[i]))).normalize(); }
      const w = new THREE.Vector3().crossVectors(T[i], u);
      const pp = pEnd && run - len[i] <= endLen + 1e-6 ? pEnd : p, ring = [];
      for (let j = 0; j < n; j++) {
        const t = j / n * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
        const nx = u.x * c + w.x * s, ny = u.y * c + w.y * s, nz = u.z * c + w.z * s;
        ring.push(vert(P[i].x + nx * r, P[i].y + ny * r, P[i].z + nz * r, nx, ny, nz, pp));
      }
      rings.push(ring);
    }
    for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < n; j++) {
      const k = (j + 1) % n; tri(rings[i][j], rings[i + 1][j], rings[i + 1][k]); tri(rings[i][j], rings[i + 1][k], rings[i][k]);
    }
    if (caps) for (const [i, s] of [[0, -1], [P.length - 1, 1]]) {
      const t = T[i], pp = pEnd && i ? pEnd : p, c = vert(P[i].x, P[i].y, P[i].z, t.x * s, t.y * s, t.z * s, pp);
      const w = new THREE.Vector3().crossVectors(t, u), ring = [];
      for (let j = 0; j < n; j++) { const a2 = j / n * Math.PI * 2; ring.push(vert(P[i].x + (u.x * Math.cos(a2) + w.x * Math.sin(a2)) * r, P[i].y + (u.y * Math.cos(a2) + w.y * Math.sin(a2)) * r, P[i].z + (u.z * Math.cos(a2) + w.z * Math.sin(a2)) * r, t.x * s, t.y * s, t.z * s, pp)); }
      for (let j = 0; j < n; j++) { const k = (j + 1) % n; if (s > 0) tri(c, ring[j], ring[k]); else tri(c, ring[k], ring[j]); }
    }
  }
  function build(scale = 0.001) {
    const g = new THREE.BufferGeometry(), p = new Float32Array(pos.length);
    for (let i = 0; i < pos.length; i++) p[i] = pos[i] * scale;
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nrm), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
    g.setAttribute('surf', new THREE.BufferAttribute(new Float32Array(srf), 2));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
    g.setIndex(pos.length / 3 > 65535 ? new THREE.BufferAttribute(new Uint32Array(idx), 1) : new THREE.BufferAttribute(new Uint16Array(idx), 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
  return { vert, tri, quad, box, lathe, prism, band, cap, tube, at, build, get triangles() { return idx.length / 3; } };
}

// outlines (counter-clockwise seen from +Z)
const circle = (r, n, cx = 0, cy = 0, a0 = 0) => Array.from({ length: n }, (_, i) => [cx + r * Math.cos(a0 + i / n * Math.PI * 2), cy + r * Math.sin(a0 + i / n * Math.PI * 2)]);
// a stadium w x h (h = the round ends' diameter), n points per half circle
function stadium(w, h, n, cx = 0, cy = 0) {
  const r = h / 2, s = w / 2 - r, o = [];
  for (let i = 0; i <= n; i++) { const a = -Math.PI / 2 + Math.PI * i / n; o.push([cx + s + r * Math.cos(a), cy + r * Math.sin(a)]); }
  for (let i = 0; i <= n; i++) { const a = Math.PI / 2 + Math.PI * i / n; o.push([cx - s + r * Math.cos(a), cy + r * Math.sin(a)]); }
  return o;
}
// the radius of a regular hexagon (inradius a, a corner at angle 0) at angle t
const hexR = (a, t) => { const m = ((t % (Math.PI / 3)) + Math.PI / 3) % (Math.PI / 3); return a / Math.cos(m - Math.PI / 6); };
// Catmull-Rom through the control points, n steps per span
function spline(P, n) {
  const out = [], at = i => P[Math.min(P.length - 1, Math.max(0, i))];
  for (let i = 0; i < P.length - 1; i++) for (let k = 0; k < n; k++) {
    const t = k / n, a = at(i - 1), b = at(i), c = at(i + 1), d = at(i + 2);
    out.push([0, 1, 2].map(j => 0.5 * ((2 * b[j]) + (-a[j] + c[j]) * t + (2 * a[j] - 5 * b[j] + 4 * c[j] - d[j]) * t * t + (-a[j] + 3 * b[j] - 3 * c[j] + d[j]) * t * t * t)));
  }
  out.push(P[P.length - 1]);
  return out;
}
const rotX = (THREE, a) => new THREE.Matrix4().makeRotationX(a);
const move = (THREE, x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);

// -------------------------------------------------------------------- plate
// 80 x 80 x 1.5 mm sheet with a 0.4 mm edge break on top (smooth across the break, so the edge holds a highlight)
// and a small one below. Its own material (coaster-shade.js plate), so no paint attributes: position and normal only.
export function buildPlate(THREE) {
  const { x: X, z: Z, t } = DIM.plate, c = 0.4, c2 = 0.15;
  const pos = [], nrm = [], idx = [];
  const V = (x, y, z, nx, ny, nz) => { const l = Math.hypot(nx, ny, nz); pos.push(x / 1000, y / 1000, z / 1000); nrm.push(nx / l, ny / l, nz / l); return pos.length / 3 - 1; };
  const Q = (a, b, c3, d) => idx.push(a, b, c3, a, c3, d);
  // top
  Q(V(-X + c, 0, Z - c, 0, 1, 0), V(X - c, 0, Z - c, 0, 1, 0), V(X - c, 0, -Z + c, 0, 1, 0), V(-X + c, 0, -Z + c, 0, 1, 0));
  // four sides: edge break (normal sweeps from up to out), wall, lower break; mitred corners
  const side = (ox, oz) => {             // outward direction (ox, oz); the edge runs along the other axis
    const tx = oz, tz = -ox;             // along the edge, counter-clockwise seen from above
    const P = (s, inset, y) => [ox * ((ox ? X : Z) - inset) + tx * s * ((tx ? X : Z) - inset), y, oz * ((oz ? Z : X) - inset) + tz * s * ((tz ? Z : X) - inset)];
    const strip = (i0, y0, n0, i1, y1, n1) => {
      const a = P(-1, i0, y0), b = P(1, i0, y0), c3 = P(1, i1, y1), d = P(-1, i1, y1);
      Q(V(...a, ...n0), V(...b, ...n0), V(...c3, ...n1), V(...d, ...n1));
    };
    const up = [0, 1, 0], out = [ox, 0, oz], dn = [ox, -1, oz];
    strip(0, -c, out, c, 0, up);                 // the break: out at its lower edge, up where it meets the top
    strip(0, -t + c2, out, 0, -c, out);          // wall
    strip(c2, -t, dn, 0, -t + c2, out);          // lower break
  };
  side(1, 0); side(0, -1); side(-1, 0); side(0, 1);
  Q(V(-X + c2, -t, -Z + c2, 0, -1, 0), V(X - c2, -t, -Z + c2, 0, -1, 0), V(X - c2, -t, Z - c2, 0, -1, 0), V(-X + c2, -t, Z - c2, 0, -1, 0));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nrm), 3));
  g.setIndex(idx);
  g.computeBoundingSphere(); g.computeBoundingBox();
  return g;
}

// ------------------------------------------------------------------- screws
// ISO 4762 M2 x 6 in stainless: head 3.7 dia x 2.0 with a 0.2 mm top chamfer, hex socket 1.5 across flats and
// 1.0 deep with a conical bottom, a plain 2.0 mm shank (the thread is finer than a pixel at any size the reel shows).
export function buildScrews(THREE, { low = false } = {}) {
  const b = painter(THREE), S = DIM.screw, n = low ? 12 : 24;
  const steel = paint(THREE, 0xc2c5c9, 1, 0.3), face = paint(THREE, 0xc8cbcf, 1, 0.36), shank = paint(THREE, 0xa9adb2, 1, 0.42);
  const wall = shade(steel, 0.34), pit = shade(steel, 0.16);
  const R = 1.84, ch = 0.2, a = 0.75, depth = 1.0;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.at(move(THREE, sx * S.x, 0, sz * S.z), () => {
    // shank and head, bottom to top
    b.lathe([[0, S.tip, '', shank], [0.8, S.tip, '', shank], [1.0, S.tip + 0.25, '', shank], [1.0, S.seat, '', steel], [R, S.seat, '', steel], [R, S.top - ch, 's', face], [R - ch, S.top]], n, steel);
    // top face between the chamfer and the hex, the socket walls, its conical bottom
    const out = [], hex = [];
    for (let i = 0; i < n; i++) { const t = i / n * Math.PI * 2; out.push([(R - ch) * Math.cos(t), (R - ch) * Math.sin(t)]); hex.push([hexR(a, t) * Math.cos(t), hexR(a, t) * Math.sin(t)]); }
    // the outlines are in XZ here: map local (x, y, z) -> (x, z, -y) so +Z of the outline is +Y
    b.at(rotX(THREE, -Math.PI / 2), () => {
      const o2 = out.map(q => [q[0], -q[1]]).reverse(), h2 = hex.map(q => [q[0], -q[1]]).reverse();
      b.band(h2, S.top, o2, S.top, face);
      b.prism(h2, S.top - depth, S.top, wall, { inside: true });
      const c = b.vert(0, 0, S.top - depth - 0.28, 0, 0, 1, pit), ring = h2.map(q => b.vert(q[0], q[1], S.top - depth, 0, 0, 1, pit));
      for (let i = 0; i < ring.length; i++) b.tri(c, ring[i], ring[(i + 1) % ring.length]);
    });
  });
  return b.build();
}

// ------------------------------------------------------------------- button
// The STEP has the 7.2 mm hole and no button. A 7 mm panel push button fits it: the threaded bushing comes through
// the wall, a hex nut holds it on the outside, the black plunger cap stands proud, the switch body and its two solder
// lugs are behind the wall. Axis along +Z, z = 0 at the wall face.
export function buildButton(THREE, { low = false } = {}) {
  const b = painter(THREE), B = DIM.button, n = low ? 24 : 48, seg = low ? 16 : 28;
  const nickel = paint(THREE, 0xc4c7ca, 1, 0.3), nut = paint(THREE, 0xb4b8bc, 1, 0.36), cap = paint(THREE, 0x18191c, 0, 0.36);
  const body = paint(THREE, 0x202125, 0, 0.55), brass = paint(THREE, 0xc9a24a, 1, 0.34), dark = shade(nickel, 0.3);
  b.at(move(THREE, B.x, B.y, B.z), () => {
    // hex nut 9 mm across flats, 1.8 thick, the outer face chamfered at 30 degrees (the corners fall away in arcs)
    const a = 4.5, t = 1.8, rc = 4.36, rh = 3.56, hexO = [], top = [], ch = [], hole = [];
    for (let i = 0; i < n; i++) {
      const th = i / n * Math.PI * 2, r = hexR(a, th), c = Math.cos(th), s = Math.sin(th);
      hexO.push([r * c, r * s]); top.push([rc * c, rc * s]); hole.push([rh * c, rh * s]);
      ch.push(t - Math.max(0, r - rc) * 0.577);
    }
    b.band(hole, t, top, t, nut);                                   // flat face
    for (let i = 0; i < n; i++) {                                   // chamfer down to the flats
      const j = (i + 1) % n;
      b.quad([top[i][0], top[i][1], t], [hexO[i][0], hexO[i][1], ch[i]], [hexO[j][0], hexO[j][1], ch[j]], [top[j][0], top[j][1], t], nut);
      b.quad([hexO[i][0], hexO[i][1], 0], [hexO[j][0], hexO[j][1], 0], [hexO[j][0], hexO[j][1], ch[j]], [hexO[i][0], hexO[i][1], ch[i]], nut);
    }
    // everything round, about +Z: lathe is about Y, so turn Y onto Z
    b.at(rotX(THREE, Math.PI / 2), () => {
      // bushing: M7 x 0.75 thread standing 1.9 mm proud of the nut, its end face, the bore the cap rides in
      const th = [];
      for (let k = 0; k < 3; k++) { const y = t + 0.05 + k * 0.62; th.push([3.5, y, 's'], [3.27, y + 0.31, 's']); }
      b.lathe([[3.5, -5.2], [3.5, t + 0.05, 's'], ...th.slice(1), [3.5, t + 1.9, ''], [3.3, t + 2.05, ''], [2.62, t + 2.05, '', dark], [2.62, t + 1.2]], seg, nickel);
      // plunger cap: black, a small edge break and a slight dome
      b.lathe([[2.42, t + 1.2], [2.42, t + 3.25, 's'], [2.3, t + 3.42, 's'], [1.6, t + 3.56, 's'], [0.8, t + 3.63, 's'], [0, t + 3.66]], seg, cap);
      // behind the wall: the switch body and its end
      b.lathe([[0, -16.6], [3.3, -16.6], [3.55, -16.3], [3.55, -5.2], [3.5, -5.2]], seg, body);
    });
    // two solder lugs
    for (const s of [-1, 1]) b.box(s * 1.5 - 0.25, s * 1.5 + 0.25, -0.9, 0.9, -20.4, -16.6, brass);
  });
  return b.build();
}

// --------------------------------------------------------------- receptacle
// USB Type-C receptacle on the PD trigger board, its mouth at the inner wall face (5 mm inside the cutout, as in the
// CAD): stainless shell 8.94 x 3.26 with a 0.3 mm wall, the black tongue with its contact rows, closed at the back.
export function buildReceptacle(THREE, { low = false } = {}) {
  const b = painter(THREE), U = DIM.usb, n = low ? 5 : 8;
  const steel = paint(THREE, 0xc9ccd0, 1, 0.28), rim = paint(THREE, 0xd6d9dc, 1, 0.24), inner = shade(steel, 0.42), back = paint(THREE, 0x0c0c0e, 0, 0.6);
  const tongue = paint(THREE, 0x17181a, 0, 0.45), gold = paint(THREE, 0xc9a24a, 1, 0.3);
  const L = 7.35, O = stadium(8.94, 3.26, n), I = stadium(8.34, 2.56, n);
  b.at(move(THREE, U.x, U.y, U.z), () => {
    b.prism(O, -L, 0, steel, { smooth: true });
    b.band(I, 0, O, 0, rim);
    b.prism(I, -L + 0.4, 0, inner, { inside: true, smooth: true });
    b.cap(I, -L + 0.4, back);
    b.cap(O, -L, steel, { up: -1 });
    // tongue 6.69 x 0.70, its tip 0.9 mm inside the mouth; five contact pads on top and below
    b.box(-3.345, 3.345, -0.35, 0.35, -L + 0.4, -0.9, tongue, { skip: 'z-' });
    for (let i = 0; i < 5; i++) {
      const x = -2.6 + i * 1.3;
      b.box(x - 0.36, x + 0.36, 0.35, 0.385, -4.6, -1.25, gold, { skip: 'y-z-' });
      b.box(x - 0.36, x + 0.36, -0.385, -0.35, -4.6, -1.25, gold, { skip: 'y+z-' });
    }
    // two shell legs soldered to the board
    for (const s of [-1, 1]) b.box(s * 4.47 - 0.15, s * 4.47 + 0.15, -2.3, -1.2, -5.6, -4.4, steel);
  });
  return b.build();
}

// ------------------------------------------------------------------ Peltier
// TEC1-12703 class, 40 x 40 x 3.6: two alumina plates 0.8 mm thick, the pellet layer sealed with a silicone bead set
// back from the edge (the pellets show through it as a faint row), the part number on the cold face, red and black
// silicone leads with tinned ends leaving one edge near a corner.
export function buildPeltier(THREE, { low = false, atlas = null } = {}) {
  const b = painter(THREE), P = DIM.peltier, s = P.s;
  const cer = paint(THREE, 0xe9e6df, 0, 0.55), edge = paint(THREE, 0xdedbd3, 0, 0.6), seal = paint(THREE, 0xcfccc4, 0, 0.5), pellet = paint(THREE, 0xa3a29d, 0, 0.5);
  const red = paint(THREE, 0xa3141a, 0, 0.36), blk = paint(THREE, 0x17181a, 0, 0.36), tin = paint(THREE, 0xc8c9cb, 1, 0.34);
  const yt = P.y1 - 0.8, yb = P.y0 + 0.8;
  const mark = atlas && atlas.rect('tec');
  b.box(-s, s, yt, P.y1, -s, s, cer, { paints: { 'x+': edge, 'x-': edge, 'z+': edge, 'z-': edge }, uv: mark ? { 'y+': mark } : {} });
  b.box(-s, s, P.y0, yb, -s, s, cer, { paints: { 'x+': edge, 'x-': edge, 'z+': edge, 'z-': edge } });
  // sealed pellet layer, 0.35 mm inside the ceramic edge, with a row of pellets hinted behind the bead
  const q = s - 0.35;
  b.box(-q, q, yb, yt, -q, q, seal, { skip: 'y+y-' });
  const np = low ? 0 : 15, pitch = 2.4;
  for (let i = 0; i < np; i++) {
    const c = (i - (np - 1) / 2) * pitch, e = q + 0.012;
    b.quad([c - 0.7, yb + 0.25, e], [c + 0.7, yb + 0.25, e], [c + 0.7, yt - 0.25, e], [c - 0.7, yt - 0.25, e], pellet);
    b.quad([c + 0.7, yb + 0.25, -e], [c - 0.7, yb + 0.25, -e], [c - 0.7, yt - 0.25, -e], [c + 0.7, yt - 0.25, -e], pellet);
    b.quad([e, yb + 0.25, c + 0.7], [e, yb + 0.25, c - 0.7], [e, yt - 0.25, c - 0.7], [e, yt - 0.25, c + 0.7], pellet);
    b.quad([-e, yb + 0.25, c - 0.7], [-e, yb + 0.25, c + 0.7], [-e, yt - 0.25, c + 0.7], [-e, yt - 0.25, c - 0.7], pellet);
  }
  // leads: 1.6 mm silicone wire leaving the sealed edge on the +X side, then dressed back along the channel
  // between the heatsink and the driver boards (clear of both), tinned ends
  const ym = (yb + yt) / 2, sides = low ? 5 : 7;
  const runs = [
    [red, [[18.8, ym, 13.4], [21.2, ym, 13.4], [22.9, ym - 0.3, 12.9], [23.9, ym - 1.2, 11.2], [24.3, ym - 2.6, 8.0], [24.3, ym - 4.4, 3.0], [24.2, ym - 6.0, -3.0], [24.0, ym - 7.2, -9.0], [23.9, ym - 7.8, -13.0]]],
    [blk, [[18.8, ym, 16.6], [21.4, ym, 16.6], [23.6, ym - 0.3, 16.2], [25.2, ym - 1.3, 14.4], [25.9, ym - 2.8, 10.6], [25.9, ym - 4.7, 5.0], [25.8, ym - 6.4, -1.5], [25.6, ym - 7.7, -8.0], [25.5, ym - 8.3, -12.0]]],
  ];
  for (const [pnt, ctl] of runs) {
    const pts = spline(ctl, low ? 2 : 4);
    b.tube(pts, 0.8, sides, pnt, { caps: false });
    const e = pts[pts.length - 1], d = pts[pts.length - 2], l = Math.hypot(e[0] - d[0], e[1] - d[1], e[2] - d[2]);
    b.tube([e, [e[0] + (e[0] - d[0]) / l * 2.2, e[1] + (e[1] - d[1]) / l * 2.2, e[2] + (e[2] - d[2]) / l * 2.2]], 0.42, sides, tin);
  }
  return b.build();
}

// -------------------------------------------------------------------- rotor
// The blower's impeller, which the CAD draws as a solid hub in an empty ring: forward-curved blades between the hub
// and the scroll wall, a shroud ring tying their tips, the hub cap with its label. Built about the blower's axis
// (x = z = 0) so coaster.js can spin it.
export function buildRotor(THREE, { low = false, atlas = null } = {}) {
  const b = painter(THREE), B = DIM.blower;
  const blade = paint(THREE, 0x1b1c20, 0, 0.5), capP = paint(THREE, 0x202125, 0, 0.46), ring = paint(THREE, 0x1d1e22, 0, 0.5);
  const lab = atlas && atlas.rect('fan'), white = paint(THREE, 0xffffff, 0, 0.62);
  const N = low ? 19 : 31, r0 = 10.35, r1 = 13.55, y1 = B.top - 0.45, y0 = B.floor + 0.5, th = 0.34;
  for (let i = 0; i < N; i++) {
    const a0 = i / N * Math.PI * 2;
    // forward-curved: the blade leans in the direction of rotation toward its tip; three points along it
    const P = [0, 0.5, 1].map(t => { const r = r0 + (r1 - r0) * t, a = a0 + 0.34 * t * t + 0.10 * t; return [r * Math.cos(a), r * Math.sin(a)]; });
    for (let k = 0; k < 2; k++) {
      const A = P[k], C = P[k + 1], dx = C[0] - A[0], dz = C[1] - A[1], l = Math.hypot(dx, dz), nx = -dz / l * th / 2, nz = dx / l * th / 2;
      b.quad([A[0] + nx, y0, A[1] + nz], [C[0] + nx, y0, C[1] + nz], [C[0] + nx, y1, C[1] + nz], [A[0] + nx, y1, A[1] + nz], blade);
      b.quad([C[0] - nx, y0, C[1] - nz], [A[0] - nx, y0, A[1] - nz], [A[0] - nx, y1, A[1] - nz], [C[0] - nx, y1, C[1] - nz], blade);
      b.quad([A[0] + nx, y1, A[1] + nz], [C[0] + nx, y1, C[1] + nz], [C[0] - nx, y1, C[1] - nz], [A[0] - nx, y1, A[1] - nz], blade);
    }
  }
  // shroud ring over the blade tips, hub cap (a low dome) with the label disc
  const seg = low ? 24 : 48;
  b.lathe([[13.75, y1 - 0.5], [13.75, y1 + 0.1], [12.75, y1 + 0.1], [12.75, y1 - 0.5]], seg, ring);
  b.lathe([[9.85, B.top - 0.9], [9.85, B.top - 0.12, 's'], [9.6, B.top + 0.04, 's'], [6.9, B.top + 0.1]], seg, capP);
  // label: a disc with uv from the atlas (silver sticker with a ring of small print)
  const R = 6.9, y = B.top + 0.1, c = b.vert(0, y, 0, 0, 1, 0, white, lab ? (lab[0] + lab[2]) / 2 : undefined, lab ? (lab[1] + lab[3]) / 2 : undefined), rv = [];
  for (let i = 0; i < seg; i++) {
    const a = i / seg * Math.PI * 2, cx = Math.cos(a), cz = Math.sin(a);
    rv.push(b.vert(R * cx, y, R * cz, 0, 1, 0, white, lab ? (lab[0] + lab[2]) / 2 + cx * (lab[2] - lab[0]) / 2 : undefined, lab ? (lab[1] + lab[3]) / 2 - cz * (lab[3] - lab[1]) / 2 : undefined));
  }
  for (let i = 0; i < seg; i++) b.tri(c, rv[(i + 1) % seg], rv[i]);
  return b.build();
}
// the impeller at speed: a flat ring over the blades (its material draws the streaks); position and uv only
export function buildBlurRing(THREE, { low = false } = {}) {
  const B = DIM.blower, seg = low ? 32 : 64, pos = [], uv = [], idx = [];
  for (let i = 0; i <= seg; i++) {
    const a = i / seg * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    pos.push(10.05 * c / 1000, (B.top - 0.38) / 1000, 10.05 * s / 1000, 13.95 * c / 1000, (B.top - 0.38) / 1000, 13.95 * s / 1000);
    uv.push(i / seg, 0, i / seg, 1);
    if (i < seg) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
  g.setIndex(idx); g.computeVertexNormals(); g.computeBoundingSphere();
  return g;
}

// ------------------------------------------------------------------- boards
// The four modules the CAD draws as plain blocks, each inside its block: the USB-C PD trigger board (flat, by the
// port; its receptacle is buildReceptacle), the buck converter (on edge at the back), and the two DRV8871 driver
// breakouts on edge by the right wall, populated side out. The ESP32-C3 board keeps the CAD's own mesh (coaster.js
// paints it). Boards are 1.6 mm FR4: mask and silk from the atlas on both faces, a bare laminate edge.
export function buildBoards(THREE, { low = false, atlas = null } = {}) {
  const b = painter(THREE);
  const R = k => (atlas ? atlas.rect(k) : null);
  const mask = paint(THREE, 0xffffff, 1, 1), fr4 = paint(THREE, 0xb9a77c, 0, 0.7), chip = paint(THREE, 0x141518, 0, 0.42), chipTop = paint(THREE, 0x1a1b1e, 0, 0.5);
  const tin = paint(THREE, 0xc9cacc, 1, 0.3), can = paint(THREE, 0xbfc2c5, 1, 0.38), term = paint(THREE, 0x3d8a5c, 0, 0.5), termD = shade(paint(THREE, 0x3d8a5c, 0, 0.5), 0.4);
  const tan = paint(THREE, 0xa1855a, 0, 0.5), res = paint(THREE, 0x222224, 0, 0.5), ferr = paint(THREE, 0x2b2b2e, 0, 0.62), elec = paint(THREE, 0x25262a, 0, 0.4), brass = paint(THREE, 0xc9a24a, 1, 0.34);
  const seg = low ? 10 : 16;
  // a two-pin screw terminal: body, wire entries, two slotted screws; local frame: sits on y = 0, wires enter at +z
  const terminal = (w = 7.6, d = 7.2, h = 8.4) => {
    b.box(-w / 2, w / 2, 0, h, -d / 2, d / 2, term, { skip: 'y-' });
    for (const s of [-1, 1]) {
      const x = s * w / 4;
      b.quad([x - 1.25, 0.9, d / 2 + 0.01], [x + 1.25, 0.9, d / 2 + 0.01], [x + 1.25, 3.7, d / 2 + 0.01], [x - 1.25, 3.7, d / 2 + 0.01], termD);
      b.at(move(THREE, x, 0, -0.3), () => b.lathe([[1.45, h - 0.5, '', termD], [1.45, h + 0.02, '', tin], [0, h + 0.02]], seg, tin));
      b.box(x - 1.2, x + 1.2, h + 0.02, h + 0.04, -0.3 - 0.22, -0.3 + 0.22, termD, { skip: 'y-' });
    }
  };
  const smd = (x, y, z, sx, sy, sz, p) => { b.box(x - sx / 2, x + sx / 2, y, y + sy, z - sz / 2, z + sz / 2, p, { skip: 'y-' }); };
  const passive = (x, z, p, along = 'x') => {                       // 0603: body with two tinned ends
    const l = 1.6, w = 0.8, h = 0.5;
    if (along === 'x') { smd(x, 0, z, l - 0.6, h, w, p); smd(x - 0.55, 0, z, 0.36, h + 0.02, w + 0.02, tin); smd(x + 0.55, 0, z, 0.36, h + 0.02, w + 0.02, tin); }
    else { smd(x, 0, z, w, h, l - 0.6, p); smd(x, 0, z - 0.55, w + 0.02, h + 0.02, 0.36, tin); smd(x, 0, z + 0.55, w + 0.02, h + 0.02, 0.36, tin); }
  };

  // --- USB-C PD trigger board: flat, 11 x 27.4, on the floor posts; x across, z toward the port
  {
    const D = DIM.pd, y0 = D.y0 + 0.02, y1 = y0 + 1.6, z1 = D.z1 - 0.6;
    b.box(D.x0, D.x1, y0, y1, D.z0, z1, fr4, { paints: { 'y+': mask, 'y-': mask }, uv: { 'y+': R('pd'), 'y-': R('pdBack') } });
    b.at(move(THREE, (D.x0 + D.x1) / 2, y1, 0), () => {
      b.at(move(THREE, 0, 0, D.z0 + 4.2).multiply(new THREE.Matrix4().makeRotationY(Math.PI)), () => terminal(7.6, 7.2, 10.2));   // output terminal, wires leave toward -z
      smd(0.4, 0, 26.2, 3.0, 0.75, 3.0, chip);                      // PD controller (QFN)
      smd(-2.6, 0, 21.6, 2.9, 1.1, 1.6, chip);                      // MOSFET (SOT-23 class)
      passive(2.9, 22.2, tan); passive(2.9, 24.0, res); passive(-3.0, 25.4, res, 'z'); passive(2.6, 29.4, tan, 'z'); passive(-2.4, 29.0, res);
      smd(3.6, 0, 18.4, 1.0, 0.45, 0.6, paint(THREE, 0xe9ecef, 0, 0.3));   // status LED (off)
    });
  }
  // --- buck converter: 17.5 x 12.3 on edge at the back, populated side toward +z
  {
    const D = DIM.buck, zb = D.z0 + 0.2, zf = zb + 1.6;
    b.box(D.x0, D.x1, D.y0, D.y1, zb, zf, fr4, { paints: { 'z+': mask, 'z-': mask }, uv: { 'z+': R('buck'), 'z-': R('buckBack') } });
    // local frame: x along the board, y out of it (+z in coaster space), z = -height
    b.at(move(THREE, (D.x0 + D.x1) / 2, (D.y0 + D.y1) / 2, zf).multiply(rotX(THREE, Math.PI / 2)), () => {
      smd(-3.6, 0, 0.4, 5.2, 2.4, 5.2, ferr);                       // inductor
      smd(3.3, 0, -1.6, 3.9, 1.5, 4.9, chip);                       // converter (SOIC-8)
      smd(3.6, 0, 3.6, 3.2, 1.6, 3.2, paint(THREE, 0x2a5aa8, 0, 0.45));   // trimmer
      b.at(move(THREE, 3.6, 1.6, 3.6), () => b.lathe([[0.9, 0], [0.9, 0.25], [0, 0.25]], seg, brass));
      smd(-7.4, 0, -3.6, 1.6, 1.2, 3.0, tan); smd(7.4, 0, 3.4, 1.6, 1.2, 3.0, tan);
      passive(0.4, 3.9, res); passive(0.2, -4.6, res);
    });
  }
  // --- two DRV8871 breakouts: 24 x 20 on edge by the right wall, populated side toward +x
  for (const D of [DIM.drvA, DIM.drvB]) {
    const xb = D.x0 + 0.05, xf = xb + 1.6, zc = (D.z0 + D.z1) / 2, yc = (D.y0 + D.y1) / 2;
    b.box(xb, xf, D.y0, D.y1, D.z0, D.z1, fr4, { paints: { 'x+': mask, 'x-': mask }, uv: { 'x+': R('drv'), 'x-': R('drvBack') } });
    // local frame on the populated face: x = -z (to the right seen from +x), y = +x (out of the board), z = -y (down)
    const F = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, -1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, -1, 0)).setPosition(xf, yc, zc);
    b.at(F, () => {
      // two terminals along the lower edge (motor out, power in), wires leave downward... they sit flat on the board
      for (const s of [-1, 1]) b.at(move(THREE, s * 5.6, 0, 5.6).multiply(new THREE.Matrix4().makeScale(1, 0.74, 1)), () => terminal(7.6, 7.4, 8.4));
      smd(0, 0, -3.2, 4.9, 1.35, 3.9, chip, {});                    // DRV8871 (HSOP-8)
      for (let i = 0; i < 4; i++) for (const s of [-1, 1]) smd(-1.9 + i * 1.27, 0.0, -3.2 + s * 2.55, 0.42, 0.5, 1.2, tin);   // its leads
      smd(0, 1.35, -3.2, 3.6, 0.02, 2.6, chipTop);
      smd(-8.2, 0, -5.4, 3.4, 2.6, 3.4, elec);                      // bulk capacitor (case B)
      smd(-8.2, 2.6, -5.4, 3.0, 0.02, 3.0, can);
      passive(6.0, -6.4, res); passive(6.0, -4.4, tan); passive(8.6, -1.6, res, 'z'); passive(-5.0, -0.4, tan);
      // six header pins along the upper edge
      for (let i = 0; i < 6; i++) { smd(-6.35 + i * 2.54, 0, -8.6, 0.64, 2.6, 0.64, brass); smd(-6.35 + i * 2.54, 0, -8.6, 2.3, 0.9, 2.3, chip); }
    });
  }
  return b.build();
}

// --------------------------------------------------------------- thermistor
// The NTC thermistor that closes the loop at the plate: an epoxy bead bonded under the plate just outside the
// Peltier's footprint, a strip of polyimide tape over its leads, the twin lead dropping toward the board.
export function buildThermistor(THREE, { low = false } = {}) {
  const b = painter(THREE), t = -DIM.plate.t;
  const epoxy = paint(THREE, 0x15161a, 0, 0.3), tape = paint(THREE, 0xb8782a, 0, 0.32), wire = paint(THREE, 0x7a1f16, 0, 0.4), tin = paint(THREE, 0xc8c9cb, 1, 0.34);
  const x = -27.5, z = 24.5, n = low ? 8 : 12;
  b.at(move(THREE, x, t, z).multiply(rotX(THREE, Math.PI)), () => b.lathe([[1.5, 0], [1.5, 0.5, 's'], [1.25, 1.35, 's'], [0.7, 1.85, 's'], [0, 2.0]], n, epoxy));
  b.box(x + 1.0, x + 8.6, t - 0.06, t, z - 2.6, z + 2.6, tape, { skip: 'y+' });
  for (const s of [-1, 1]) {
    const zz = z + s * 0.5;
    b.tube([[x + 1.2, t - 0.36, zz], [x + 8.4, t - 0.36, zz], [x + 9.6, t - 0.7, zz], [x + 10.3, t - 2.2, zz + s * 0.2], [x + 10.5, t - 5.0, zz + s * 0.3], [x + 10.4, t - 7.4, zz + s * 0.3]], 0.3, low ? 4 : 5, wire, { caps: true, pEnd: tin, endLen: 1.2 });
  }
  return b.build();
}
