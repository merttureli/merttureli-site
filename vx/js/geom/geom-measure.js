/* vx/js/geom/geom-measure.js
   Pure measurement of the CHARGER CAD assembly (assets/charger-explorer/assembly.json
   + assembly.bin). No DOM, no WebGL, no imports: it runs in the browser (geom.js) and
   in node (geom-bake.mjs, which writes the baked copy in geom-cad.js).

   Inputs, as vx/js/stage/loader.js returns them:
     json    the manifest. Part bounds are millimetres (CAD).
     buffer  ArrayBuffer of Float32 positions and Uint32 indices. Each part has
             wire {offset (bytes), count (floats)} and optionally
             mesh {vertexOffset, vertexCount, indexOffset, indexCount}.
   The bin's length unit is not assumed: binScale() compares it with the json bounds
   (the published bin is in metres, nose tip y = +0.570693, screw cap y = -0.610193).

   Frame: CAD y is the rocket axis with the nose at +y. Everything this file returns is
   in metres, with s = axial distance aft of the nose tip (s = noseTipY - y). */

export const PROFILE_STEP_M = 0.002;       // FIELD 5: outer radius sampled every 2 mm
export const FIN_PART_IDS = [6, 7, 8, 9];  // CAD: assembly.json labels Fin 1 .. Fin 4
export const PLANFORM_PART_ID = 6;         // CAD: Fin 1, the fin on CAD +x
export const RAIL_BUTTON_IDS = [10, 11];   // CAD: rail buttons, left out of the radius profile (one-sided, not axisymmetric); geom.js puts them in the section as one-sided polygons
export const MM = 0.001;                   // m per mm (json bounds are mm)
const EPS_M = 2e-7;                        // 0.2 um: tolerance for an edge touching a sample plane; float32 near 0.6 m resolves 6e-8 m
const TOL_M = 1e-6;                        // 1 um: vertices this close to the root or tip line count as on it

/* Metres per bin unit, from part 0's mesh against its json bound (mm). Rounded to a
   power of ten so a stray vertex cannot skew it. */
export function binScale(json, buffer) {
  const p = json.parts.find(q => q.mesh) || json.parts[0];
  const v = positionsOf(p, buffer);
  let maxY = -Infinity;
  for (let i = 1; i < v.length; i += 3) if (v[i] > maxY) maxY = v[i];
  const ratio = (p.bounds[1][1] * MM) / maxY;
  return Number.isFinite(ratio) && ratio > 0 ? Math.pow(10, Math.round(Math.log10(ratio))) : 1;
}

function positionsOf(p, buffer) {
  if (p.mesh) return new Float32Array(buffer, p.mesh.vertexOffset, p.mesh.vertexCount);
  return new Float32Array(buffer, p.wire.offset, p.wire.count);
}

/* Every straight edge of a part as [x0,y0,z0, x1,y1,z1, ...] in bin units: the three
   edges of every mesh triangle, or the wire segments when the part has no mesh. */
function edgesOf(p, buffer) {
  if (p.mesh) {
    const v = new Float32Array(buffer, p.mesh.vertexOffset, p.mesh.vertexCount);
    const ix = new Uint32Array(buffer, p.mesh.indexOffset, p.mesh.indexCount);
    const out = new Float32Array((ix.length / 3) * 18);
    let o = 0;
    const put = (m, n) => {
      out[o++] = v[m]; out[o++] = v[m + 1]; out[o++] = v[m + 2];
      out[o++] = v[n]; out[o++] = v[n + 1]; out[o++] = v[n + 2];
    };
    for (let t = 0; t < ix.length; t += 3) {
      const a = ix[t] * 3, b = ix[t + 1] * 3, c = ix[t + 2] * 3;
      put(a, b); put(b, c); put(c, a);
    }
    return out;
  }
  return new Float32Array(buffer, p.wire.offset, p.wire.count); // already segment pairs
}

/* The parts that make up the axisymmetric outer shape: everything except the four
   fins, the two rail buttons and the reference-only envelopes (not physical). The
   buttons stand on one side only, so a radius profile (mirrored about the axis) cannot
   hold them; measureFeatures() returns their bounds and geom.js adds them to the
   section as one-sided polygons. */
export function profileParts(json) {
  return json.parts.filter(p => !FIN_PART_IDS.includes(p.id) && !RAIL_BUTTON_IDS.includes(p.id) && !p.referenceOnly);
}

/* Outer radius profile, FIELD 5. For a sample plane y = y_i the cross-section of a
   triangle is a segment whose ends lie on the triangle's edges; the radius
   sqrt(x^2 + z^2) is convex, so its maximum over that segment sits at an end. The
   maximum over all edge crossings of the plane is therefore the exact maximum radius
   of the faceted surface in that plane. Samples run every PROFILE_STEP_M from the nose
   tip (s = 0) to the aft face of the screw cap (s = length), the last sample landing
   exactly on the aft face. */
export function measureProfile(json, buffer, { step = PROFILE_STEP_M } = {}) {
  const k = binScale(json, buffer);
  const parts = profileParts(json);
  const edgeSets = parts.map(p => edgesOf(p, buffer));
  let yTop = -Infinity, yBot = Infinity;
  for (const e of edgeSets) for (let i = 1; i < e.length; i += 3) { const y = e[i] * k; if (y > yTop) yTop = y; if (y < yBot) yBot = y; }
  const length = yTop - yBot;
  const nGrid = Math.floor(length / step + 1e-9) + 1;
  const n = Math.abs((nGrid - 1) * step - length) < EPS_M ? nGrid : nGrid + 1;
  const s = new Float64Array(n), r = new Float64Array(n);
  for (let i = 0; i < n; i++) s[i] = Math.min(i * step, length);
  s[n - 1] = length;
  const hit = (i, x0, y0, z0, x1, y1, z1) => {
    const y = yTop - s[i];
    let rad;
    if (Math.abs(y1 - y0) < 1e-12) rad = Math.max(Math.hypot(x0, z0), Math.hypot(x1, z1));
    else {
      const t = Math.min(1, Math.max(0, (y - y0) / (y1 - y0)));
      rad = Math.hypot(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t);
    }
    if (rad > r[i]) r[i] = rad;
  };
  for (const e of edgeSets) {
    for (let j = 0; j < e.length; j += 6) {
      const x0 = e[j] * k, y0 = e[j + 1] * k, z0 = e[j + 2] * k, x1 = e[j + 3] * k, y1 = e[j + 4] * k, z1 = e[j + 5] * k;
      const lo = Math.min(y0, y1) - EPS_M, hi = Math.max(y0, y1) + EPS_M;
      // sample i sits at y = yTop - i*step: the indices whose plane meets [lo, hi]
      const i0 = Math.max(0, Math.ceil((yTop - hi) / step));
      const i1 = Math.min(nGrid - 1, Math.floor((yTop - lo) / step));
      for (let i = i0; i <= i1; i++) hit(i, x0, y0, z0, x1, y1, z1);
      if (n > nGrid && lo <= yBot) hit(n - 1, x0, y0, z0, x1, y1, z1);
    }
  }
  return { step, s, r, length, noseTipY: yTop, tailY: yBot, binScale: k, parts: parts.map(p => p.id) };
}

/* Convex hull, Andrew's monotone chain. Points [[a, b], ...]; counter-clockwise, no
   repeated end point, collinear points dropped. */
export function convexHull(points) {
  const p = points.slice().sort((u, v) => u[0] - v[0] || u[1] - v[1]);
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 1e-18) lower.pop(); lower.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 1e-18) upper.pop(); upper.push(q); }
  upper.pop(); lower.pop();
  return lower.concat(upper);
}

/* Fin planform, FIELD 5: part 6 projected on the plane that holds its span and the
   axis (CAD x, y for Fin 1), convex hull, then
     root chord  axial extent of the hull on the root line (smallest radius)
     tip chord   axial extent on the tip line (largest radius)
     span        tip radius minus root radius
     sweep       axial distance from the root leading edge to the tip leading edge
                 (leading edge = the nose side, +y), positive aft
     thickness   extent across the plane (CAD z for Fin 1)
     rootLeadingEdgeFromNose  noseTipY minus the root leading edge y
   hull is returned in section coordinates [s (m aft of the nose tip), h (m above the
   root line)], counter-clockwise in (s, h). */
export function measureFin(json, buffer, { partId = PLANFORM_PART_ID, noseTipY } = {}) {
  const k = binScale(json, buffer);
  const p = json.parts.find(q => q.id === partId);
  if (!p) throw new Error(`assembly.json has no part ${partId}`);
  const v = positionsOf(p, buffer);
  // radial direction: the bounds axis (x or z) the fin sits out along
  const b = p.bounds, cx = (b[0][0] + b[1][0]) / 2, cz = (b[0][2] + b[1][2]) / 2;
  const alongX = Math.abs(cx) >= Math.abs(cz), sign = Math.sign(alongX ? cx : cz) || 1;
  const pts = [];
  let tMin = Infinity, tMax = -Infinity;
  for (let i = 0; i < v.length; i += 3) {
    const x = v[i] * k, y = v[i + 1] * k, z = v[i + 2] * k;
    pts.push([sign * (alongX ? x : z), y]);
    const t = alongX ? z : x; if (t < tMin) tMin = t; if (t > tMax) tMax = t;
  }
  const hull = convexHull(pts);
  let rRoot = Infinity, rTip = -Infinity;
  for (const [rad] of hull) { if (rad < rRoot) rRoot = rad; if (rad > rTip) rTip = rad; }
  const chord = (rLine) => {
    let lo = Infinity, hi = -Infinity;
    for (const [rad, y] of hull) if (Math.abs(rad - rLine) <= TOL_M) { if (y < lo) lo = y; if (y > hi) hi = y; }
    return { le: hi, te: lo, c: hi - lo };
  };
  const root = chord(rRoot), tip = chord(rTip);
  const tipY = Number.isFinite(noseTipY) ? noseTipY : measureNoseTipY(json, buffer);
  const hullSH = hull.map(([rad, y]) => [tipY - y, rad - rRoot]);
  // (s, h) flips the y axis, so re-orient to counter-clockwise in (s, h)
  if (signedArea(hullSH) < 0) hullSH.reverse();
  return {
    partId,
    root: root.c,
    tip: tip.c,
    span: rTip - rRoot,
    sweep: root.le - tip.le,
    thickness: tMax - tMin,
    rootLeadingEdgeFromNose: tipY - root.le,
    rootRadius: rRoot,
    tipTrailingEdgeAft: root.te - tip.te,   // how far the tip trailing edge sits aft of the root trailing edge
    area: Math.abs(signedArea(hullSH)),
    hull: hullSH,
  };
}

export function signedArea(poly) {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
  return a / 2;
}

function measureNoseTipY(json, buffer) {
  const k = binScale(json, buffer);
  let top = -Infinity;
  for (const p of profileParts(json)) { const v = positionsOf(p, buffer); for (let i = 1; i < v.length; i += 3) if (v[i] * k > top) top = v[i] * k; }
  return top;
}

/* Axial stations named from the part bounds (json, mm), as s aft of the nose tip in m. */
export function measureFeatures(json, noseTipY) {
  const by = id => json.parts.find(p => p.id === id);
  const s = (id, end) => { const p = by(id); return p ? noseTipY - p.bounds[end][1] * MM : NaN; };
  return {
    noseShoulder: s(1, 1),   // forward edge of the upper body tube: where the exposed nose ends
    noseConeAft: s(0, 0),    // aft end of the nose cone part, shoulder included
    bodyTubeEnd: s(2, 0),    // aft edge of the lower body tube
    mountEnd: s(18, 0),      // aft end of the revised motor mount
    capEnd: s(19, 0),        // aft face of the motor screw cap
    railButtons: RAIL_BUTTON_IDS.map(id => { const p = by(id); return p ? noseTipY - ((p.bounds[0][1] + p.bounds[1][1]) / 2) * MM : NaN; }),
    railButtonBounds: RAIL_BUTTON_IDS.map(id => buttonBounds(by(id), noseTipY)).filter(Boolean),
  };
}

/* A rail button's box from its json bounds (mm), in metres:
     sFwd, sAft   axial extent, aft of the nose tip
     rIn, rOut    radial extent along the axis it stands out on (CAD x or z)
     axis, side   that axis and its sign (+1 or -1)
     across       [lo, hi] extent along the other cross axis; the button meets the
                  plane through the rocket axis and its own axis when lo <= 0 <= hi */
function buttonBounds(p, noseTipY) {
  if (!p) return null;
  const [lo, hi] = p.bounds;
  const cx = (lo[0] + hi[0]) / 2, cz = (lo[2] + hi[2]) / 2;
  const alongX = Math.abs(cx) >= Math.abs(cz), a = alongX ? 0 : 2, o = alongX ? 2 : 0;
  const side = Math.sign(alongX ? cx : cz) || 1;
  return {
    id: p.id,
    sFwd: noseTipY - hi[1] * MM, sAft: noseTipY - lo[1] * MM,
    rIn: Math.min(Math.abs(lo[a]), Math.abs(hi[a])) * MM, rOut: Math.max(Math.abs(lo[a]), Math.abs(hi[a])) * MM,
    axis: alongX ? 'x' : 'z', side,
    across: [lo[o] * MM, hi[o] * MM],
  };
}

/* Everything geom.js needs, in one call. */
export function measureAssembly(json, buffer) {
  const profile = measureProfile(json, buffer);
  const fin = measureFin(json, buffer, { noseTipY: profile.noseTipY });
  const features = measureFeatures(json, profile.noseTipY);
  return { profile, fin, features };
}
