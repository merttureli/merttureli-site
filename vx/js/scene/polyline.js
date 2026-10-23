/* Screen-space polylines for the CHARGER field scene (presentation plan items 10 and 12).

   WebGL draws GL_LINES one device pixel wide whatever lineWidth says, and a path that has
   to read 1 px in flight and 2 px on the end plate needs a real width. This is a ribbon:
   every point is two vertices, and the vertex shader pushes them apart across the line in
   screen space, so the width is in CSS px at any distance (the flight path seen from 4 m
   or from 600 m) and the joins follow the bend (a miter, limited). The outer pixel is
   feathered by coverage, so a 1 px line reads as one pixel without MSAA.

   Points are world positions (meters). A point behind the camera slides along its segment
   to the near side, so a path that runs past the camera (the chase view looking up the
   flight path) is cut, not folded across the screen. An optional dash pattern is in world
   meters along the path (the caller converts px to meters with the meters per pixel).

   createPolyline({capacity, color, opacity, width, dash, depthTest, renderOrder, halo})
     -> { mesh, count, capacity, push(x, y, z), set(points), clear(), setHead(x, y, z | null),
          setStyle({color, opacity, width, dash}), setResolution(wPx, hPx, dpr), at(i, out),
          bounds(out), dispose() }
   color is [r, g, b] in display values (0..1, the page's sRGB, as the canvas labels draw);
   the scene's other shaders write display values the same way. width is in CSS px; dash is
   [onM, offM] or null. Up to capacity points; push() past it thins the stored path to every
   second point and keeps going (a whole flight is about 1,000 points at 0.01 s). */
import * as THREE from 'three';

export const POLYLINE_MAX = 4096;          // points per line (presentation plan item 10)
const MITER_MIN = 0.35;                    // the miter never grows past 1 / 0.35 of the half width
const NEAR_W = 1e-3;                       // clip w below which a vertex counts as behind the camera

const VERT = /* glsl */`
attribute vec3 aPrev;
attribute vec3 aNext;
attribute float aSide;
attribute float aDist;
uniform vec2 uRes;        // drawing buffer px
uniform float uHalf;      // half the drawn width in buffer px (the line's half width plus one feather px)
varying float vSide;
varying float vDist;
vec4 clipOf(vec3 p) { return projectionMatrix * modelViewMatrix * vec4(p, 1.0); }
/* slide a point behind the camera along its segment to the near side */
vec4 nearSide(vec4 c, vec4 o) {
  if (c.w >= ${NEAR_W.toFixed(4)}) return c;
  if (o.w < ${NEAR_W.toFixed(4)}) return c;
  float t = (${NEAR_W.toFixed(4)} - c.w) / (o.w - c.w);
  return mix(c, o, clamp(t, 0.0, 1.0));
}
void main() {
  vec4 c = clipOf(position), p = clipOf(aPrev), n = clipOf(aNext);
  if (c.w < ${NEAR_W.toFixed(4)}) c = n.w >= ${NEAR_W.toFixed(4)} ? nearSide(c, n) : nearSide(c, p);
  if (c.w < ${NEAR_W.toFixed(4)}) { gl_Position = vec4(0.0, 0.0, -2.0, 1.0); vSide = 0.0; vDist = 0.0; return; }
  p = nearSide(p, c); n = nearSide(n, c);
  vec2 hres = 0.5 * uRes;
  vec2 sc = c.xy / c.w * hres;
  vec2 sp = p.xy / max(p.w, ${NEAR_W.toFixed(4)}) * hres;
  vec2 sn = n.xy / max(n.w, ${NEAR_W.toFixed(4)}) * hres;
  vec2 d1 = sc - sp, d2 = sn - sc;
  float l1 = length(d1), l2 = length(d2);
  d1 = l1 > 1e-4 ? d1 / l1 : (l2 > 1e-4 ? d2 / l2 : vec2(1.0, 0.0));
  d2 = l2 > 1e-4 ? d2 / l2 : d1;
  vec2 t = d1 + d2;
  t = length(t) > 1e-4 ? normalize(t) : d1;
  vec2 nrm = vec2(-t.y, t.x);
  float miter = max(${MITER_MIN.toFixed(2)}, dot(nrm, vec2(-d1.y, d1.x)));
  vec2 off = nrm * (aSide * uHalf / miter);
  c.xy += off / hres * c.w;
  gl_Position = c;
  vSide = aSide;
  vDist = aDist;
}`;
const FRAG = /* glsl */`
uniform vec3 uColor;
uniform float uOpacity;
uniform float uHalf;
uniform float uLineHalf;  // the line's own half width in buffer px
uniform vec2 uDash;       // on, off (m along the path); on = 0 draws solid
varying float vSide;
varying float vDist;
void main() {
  if (uDash.x > 0.0 && mod(vDist, uDash.x + uDash.y) > uDash.x) discard;
  float d = abs(vSide) * uHalf;                      // px from the center line
  float cover = clamp(uLineHalf + 0.5 - d, 0.0, 1.0); // pixel coverage of a line uLineHalf * 2 wide
  if (cover <= 0.0) discard;
  gl_FragColor = vec4(uColor, uOpacity * cover);
}`;

export function createPolyline({ capacity = POLYLINE_MAX, color = [1, 1, 1], opacity = 1, width = 1, dash = null, depthTest = true, renderOrder = 4 } = {}) {
  const cap = Math.max(2, Math.min(POLYLINE_MAX, capacity | 0));
  const nv = cap * 2;
  const pos = new Float32Array(nv * 3), prev = new Float32Array(nv * 3), next = new Float32Array(nv * 3);
  const side = new Float32Array(nv), dist = new Float32Array(nv);
  for (let i = 0; i < nv; i++) side[i] = i % 2 ? -1 : 1;
  const idx = new Uint16Array((cap - 1) * 6);
  for (let i = 0; i < cap - 1; i++) {
    const a = 2 * i, o = 6 * i;
    idx[o] = a; idx[o + 1] = a + 1; idx[o + 2] = a + 2; idx[o + 3] = a + 2; idx[o + 4] = a + 1; idx[o + 5] = a + 3;
  }
  const geo = new THREE.BufferGeometry();
  const aPos = new THREE.BufferAttribute(pos, 3), aPrev = new THREE.BufferAttribute(prev, 3), aNext = new THREE.BufferAttribute(next, 3);
  const aDist = new THREE.BufferAttribute(dist, 1);
  for (const a of [aPos, aPrev, aNext, aDist]) a.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', aPos);
  geo.setAttribute('aPrev', aPrev);
  geo.setAttribute('aNext', aNext);
  geo.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
  geo.setAttribute('aDist', aDist);
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.setDrawRange(0, 0);
  const uniforms = {
    uRes: { value: new THREE.Vector2(1, 1) }, uHalf: { value: 1.5 }, uLineHalf: { value: 0.5 },
    uColor: { value: new THREE.Vector3(1, 1, 1) }, uOpacity: { value: 1 }, uDash: { value: new THREE.Vector2(0, 0) },
  };
  const material = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms, transparent: true, depthTest, depthWrite: false });
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = renderOrder;
  mesh.visible = false;

  const pts = new Float32Array(cap * 3);    // committed points (world m)
  let n = 0, head = null, widthPx = width, dpr = 1;
  let dirtyFrom = Infinity;                  // first point index whose vertices need an upload

  function writeVertex(i) {
    // point i of the drawn list (committed points, then the head)
    const P = pointAt(i), A = pointAt(i > 0 ? i - 1 : i), B = pointAt(i + 1 < drawn() ? i + 1 : i);
    const d = i > 0 ? dist[2 * (i - 1)] + Math.hypot(P[0] - A[0], P[1] - A[1], P[2] - A[2]) : 0;
    for (let s = 0; s < 2; s++) {
      const v = 2 * i + s, o = v * 3;
      pos[o] = P[0]; pos[o + 1] = P[1]; pos[o + 2] = P[2];
      prev[o] = A[0]; prev[o + 1] = A[1]; prev[o + 2] = A[2];
      next[o] = B[0]; next[o + 1] = B[1]; next[o + 2] = B[2];
      dist[v] = d;
    }
  }
  const tmpP = [0, 0, 0];
  function pointAt(i) {
    if (i < n) { tmpP[0] = pts[3 * i]; tmpP[1] = pts[3 * i + 1]; tmpP[2] = pts[3 * i + 2]; return tmpP.slice(); }
    return head ? head.slice() : tmpP.slice();
  }
  const drawn = () => Math.min(cap, n + (head && n < cap ? 1 : 0));
  function flush() {
    const m = drawn();
    if (dirtyFrom < m) {
      const from = Math.max(0, dirtyFrom - 1);       // the point before changed too (its next)
      for (let i = from; i < m; i++) writeVertex(i);
      const v0 = 2 * from, vc = 2 * (m - from);
      // ranges add up until the next upload (three clears them after it), so two flushes in one frame both land
      for (const a of [aPos, aPrev, aNext]) { a.addUpdateRange(v0 * 3, vc * 3); a.needsUpdate = true; }
      aDist.addUpdateRange(v0, vc); aDist.needsUpdate = true;
    }
    dirtyFrom = Infinity;
    geo.setDrawRange(0, m > 1 ? (m - 1) * 6 : 0);
    mesh.visible = m > 1;
  }
  function thin() {
    // keep every second point (and the last), so a long path still fits
    let w = 0;
    for (let r = 0; r < n; r += 2) { pts[3 * w] = pts[3 * r]; pts[3 * w + 1] = pts[3 * r + 1]; pts[3 * w + 2] = pts[3 * r + 2]; w++; }
    if ((n - 1) % 2) { pts[3 * w] = pts[3 * (n - 1)]; pts[3 * w + 1] = pts[3 * (n - 1) + 1]; pts[3 * w + 2] = pts[3 * (n - 1) + 2]; w++; }
    n = w; dirtyFrom = 0;
  }
  function pushRaw(x, y, z) {
    if (!(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z))) return false;
    if (n >= cap - 1) thin();                         // one slot stays free for the head
    pts[3 * n] = x; pts[3 * n + 1] = y; pts[3 * n + 2] = z;
    dirtyFrom = Math.min(dirtyFrom, n);
    n++;
    return true;
  }
  function applyStyle({ color: c, opacity: o, width: w, dash: d } = {}) {
    if (Array.isArray(c)) uniforms.uColor.value.set(c[0], c[1], c[2]);
    if (Number.isFinite(o)) uniforms.uOpacity.value = Math.max(0, Math.min(1, o));
    if (Number.isFinite(w) && w > 0) widthPx = w;
    if (d !== undefined) { if (Array.isArray(d) && d[0] > 0) uniforms.uDash.value.set(d[0], Math.max(0, d[1] || 0)); else uniforms.uDash.value.set(0, 0); }
    uniforms.uLineHalf.value = 0.5 * widthPx * dpr;
    uniforms.uHalf.value = 0.5 * widthPx * dpr + 1;
  }
  applyStyle({ color, opacity, width, dash });

  return {
    mesh, material,
    get count() { return n; },
    get capacity() { return cap; },
    get width() { return widthPx; },
    get opacity() { return uniforms.uOpacity.value; },
    /* append a point (world m); returns false for a non-finite point */
    push(x, y, z = 0) { const ok = pushRaw(x, y, z); flush(); return ok; },
    /* replace the whole line: an array of [x, y, z?] or {x, y, z?}; more than the capacity is thinned evenly */
    set(points) {
      n = 0; dirtyFrom = 0;
      const len = points ? points.length : 0;
      const stride = len > cap - 1 ? Math.ceil(len / (cap - 1)) : 1;
      for (let i = 0; i < len; i += stride) {
        const p = points[i];
        if (Array.isArray(p)) pushRaw(p[0], p[1], p[2] || 0); else if (p) pushRaw(p.x, p.y, p.z || 0);
      }
      if (len && stride > 1 && (len - 1) % stride) { const p = points[len - 1]; if (Array.isArray(p)) pushRaw(p[0], p[1], p[2] || 0); else if (p) pushRaw(p.x, p.y, p.z || 0); }
      flush();
    },
    clear() { n = 0; head = null; dirtyFrom = Infinity; flush(); },
    /* the live end of the line (the rocket now), drawn after the committed points; null removes it */
    setHead(x, y, z = 0) {
      const h = Number.isFinite(x) && Number.isFinite(y) ? [x, y, z] : null;
      if (!h && !head) return;
      if (h && head && h[0] === head[0] && h[1] === head[1] && h[2] === head[2]) return;
      head = h;
      dirtyFrom = Math.min(dirtyFrom, n);
      flush();
    },
    setStyle(s) { applyStyle(s); },
    setResolution(wPx, hPx, ratio = 1) {
      dpr = ratio > 0 ? ratio : 1;
      uniforms.uRes.value.set(Math.max(1, wPx * dpr), Math.max(1, hPx * dpr));
      applyStyle({});
    },
    /* committed point i into out ([x, y, z]); the head is not a committed point */
    at(i, out = [0, 0, 0]) { if (i < 0 || i >= n) return null; out[0] = pts[3 * i]; out[1] = pts[3 * i + 1]; out[2] = pts[3 * i + 2]; return out; },
    /* {x0, y0, x1, y1} of the committed points (world m), or null when empty */
    bounds() {
      if (!n) return null;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = 0; i < n; i++) { const x = pts[3 * i], y = pts[3 * i + 1]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      return { x0, y0, x1, y1 };
    },
    dispose() { geo.dispose(); material.dispose(); mesh.removeFromParent(); },
  };
}
