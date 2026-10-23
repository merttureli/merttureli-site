/* Markers for the CHARGER field scene (FIELD.md section 6): the CG symbol (circle
   with alternating filled quadrants), the Barrowman CP dot, a hollow CP ring for the
   lattice's measured CP, the relative wind arrow ahead of the nose, the normal force
   arrow scaled by N, the thrust arrow at the tail scaled by T, each with a mono label
   carrying its source tag.

   Two CP stations: the dot, its CP label and the MARGIN are the static Barrowman CP
   (xcp, the small-angle value the panel prints as CP / BARROWMAN and STATIC MARGIN);
   the normal force arrow sits where the force acts at this alpha (xcpForce, Barrowman
   plus body lift, flight.state.xcpNow), which moves forward of the dot at large alpha.
   The ring is the lattice's 2D-section CP, labelled CP 2D SECTION: a section of a long
   body lifts like a wing, so it sits ahead of the CG and is not the rocket's CP; the
   scene draws it only where the integrator asks (scene option latticeCp, ?lab).

   Label layout is done on the canvas in CSS px (layoutPlates): every plate tries
   spots around its anchor and keeps the cheapest. A station on the body (CG, CP, ring)
   tries both sides of the projected axis, beside the body, the fins or the slice, slid
   along it, so a rocket pitched over gets its labels above and below it; an arrow's
   label (wind, thrust) tries spots round its tail and part way up the arrow. Plates
   placed earlier, the body, the fins, the arrows, the slice and the caption band
   along the canvas bottom cost, so does distance from the anchor. Each spot is
   clamped FIT_MARGIN_PX inside the canvas first, clear of the stage's corner ticks, so
   no plate is ever clipped, and a plate that ends up away from its anchor gets a 1 px
   leader.

   Everything here is an annotation: drawn after the opaque rocket and the slice,
   depthTest off, constant size on screen (sprites without size attenuation, arrow
   thickness from the metres-per-pixel at the rocket's depth). Arrow lengths are in
   metres in the world so they scale with the rocket.

   Sign convention (FIELD.md section 2): body axis at theta from +y, positive toward
   +x; relative air velocity v_air = wind - v_rocket; alpha = theta - angle(-v_air).
   The air therefore arrives from the world direction (sin(theta - alpha),
   cos(theta - alpha)) and the wind arrow points along v_air, the opposite way.
   The wind arrow ends at the end of the body the air reaches first: the nose while
   |alpha| < 90 deg, the tail past that (falling tail first after apogee).
   N is positive along the body's local +x axis, the leeward side for a positive
   alpha (Barrowman normal force has the sign of alpha); it is drawn in push
   convention, the head touching the body at the CP station on the windward side,
   over an ink halo so it reads on the orange of the pressure view.
   Thrust is drawn in push convention too, aft of the nozzle pointing forward. */
import * as THREE from 'three';

const PAPER = '#ffffff', INK = '#0a0a0a', LIVERY = '#d63b08';
const LB_PER_N = 0.2248089;          // STD, 1 N = 0.2248089 lbf
const IN_PER_M = 39.37008;           // STD, 1 m = 39.37008 in
const FT_PER_M = 3.280840;           // STD, 1 m = 3.280840 ft
const DEG = 180 / Math.PI;
/* Display scales (EST, chosen so the arrows read at the rocket's scale): */
export const N_ARROW_M_PER_N = 0.03;     // 30 mm per newton of normal force, clamped to 0.7 m
export const T_ARROW_M_PER_N = 0.006;    // 6 mm per newton of thrust, clamped to 0.8 m
const N_ARROW_MAX_M = 0.7, T_ARROW_MAX_M = 0.8;
const WIND_ARROW_M = [0.24, 0.5];        // relative wind arrow length (m) from rest to 100 m/s and above
const BODY_R = 0.034;                    // CAD body radius (m)
export const LABEL_PX = 11;              // mono label size in CSS px (site meta 10 to 12 px); the scene never scales it below 10 px

/* ---------- mono labels ---------------------------------------------------
   One fixed-size canvas per label (the texture never changes size, so three
   never reallocates it); text is drawn left, right or centre aligned inside it
   with an ink plate behind the text only. Up to two lines. */
const LABEL_W = 320, LABEL_H = 60;        // CSS px of the label canvas (up to three lines)
export function createLabel({ align = 'left', dpr = 2, plate = true } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = LABEL_W * dpr; canvas.height = LABEL_H * dpr;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter; texture.generateMipmaps = false;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false });
  const sprite = new THREE.Sprite(material);
  sprite.renderOrder = 40;
  sprite.frustumCulled = false;            // the plate may be offset far from its anchor point
  let key = '', alignNow = align, usedW = 0, usedH = 0;
  const label = {
    sprite, texture, canvas,
    get width() { return usedW; }, get height() { return usedH; },
    /* lines: up to three, each an array of [text, colour or null for paper] segments. */
    set(lines, al = alignNow) {
      const k = al + '|' + JSON.stringify(lines);
      if (k === key || !ctx) return;
      key = k; alignNow = al;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, LABEL_W, LABEL_H);
      ctx.font = `400 ${LABEL_PX}px "IBM Plex Mono", ui-monospace, Menlo, monospace`;
      if ('letterSpacing' in ctx) ctx.letterSpacing = '1.4px';     // about 0.12em at 11 px
      ctx.textBaseline = 'middle';
      const padX = 6, lineH = 16, padY = 3;
      const widths = lines.map(segs => segs.reduce((w, [t]) => w + ctx.measureText(t).width, 0) + (segs.length - 1) * 8);
      const w = Math.min(LABEL_W, Math.ceil(Math.max(0, ...widths) + padX * 2));
      const h = Math.min(LABEL_H, lines.length * lineH + padY * 2);
      usedW = w; usedH = h;
      const x0 = al === 'right' ? LABEL_W - w : al === 'center' ? (LABEL_W - w) / 2 : 0;
      const y0 = (LABEL_H - h) / 2;
      if (plate && lines.length) {
        ctx.fillStyle = 'rgba(10,10,10,0.92)';       // dense enough that a hairline behind (the ladder, the rail) does not cut the letters
        ctx.fillRect(x0, y0, w, h);
        ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1;
        ctx.strokeRect(x0 + 0.5, y0 + 0.5, w - 1, h - 1);
      }
      lines.forEach((segs, i) => {
        let x = x0 + padX;
        const y = y0 + padY + lineH * (i + 0.5) + 0.5;
        for (const [t, c] of segs) { ctx.fillStyle = c || 'rgba(255,255,255,0.94)'; ctx.fillText(t, x, y); x += ctx.measureText(t).width + 8; }
      });
      texture.needsUpdate = true;
    },
    /* Size the sprite to `px` CSS px of canvas height on screen and anchor it so
       the plate edge sits gapPx from the point (side: 'right' of the point,
       'left' of it, 'above', 'below'). pxToScale converts CSS px to sprite scale. */
    place(pxToScale, side = 'right', gapPx = 10, dyPx = 0) {
      const s = pxToScale(LABEL_H);
      sprite.scale.set(s * LABEL_W / LABEL_H, s, 1);
      const x0 = alignNow === 'right' ? LABEL_W - usedW : alignNow === 'center' ? (LABEL_W - usedW) / 2 : 0;
      // cy is the anchor's height in the canvas measured from the top; a positive
      // dyPx moves the label down the screen.
      let cx, cy = 0.5 - dyPx / LABEL_H;
      if (side === 'right') cx = (x0 - gapPx) / LABEL_W;
      else if (side === 'left') cx = (x0 + usedW + gapPx) / LABEL_W;
      else { cx = (x0 + usedW / 2) / LABEL_W; cy += (side === 'above' ? 1 : -1) * (usedH / 2 + gapPx) / LABEL_H; }
      sprite.center.set(cx, 1 - cy);
    },
    /* Size the sprite as place() does and put the plate's centre (ox, oy) label px
       from the anchor point (+y down the screen): the layout's own placement. */
    placeAt(pxToScale, ox, oy) {
      const s = pxToScale(LABEL_H);
      sprite.scale.set(s * LABEL_W / LABEL_H, s, 1);
      const x0 = alignNow === 'right' ? LABEL_W - usedW : alignNow === 'center' ? (LABEL_W - usedW) / 2 : 0;
      sprite.center.set((x0 + usedW / 2 - ox) / LABEL_W, 0.5 + oy / LABEL_H);
    },
    /* Forget the drawn text so the next set() repaints (fonts arrived, context restored). */
    invalidate() { key = ''; },
    dispose() { texture.dispose(); material.dispose(); },
  };
  return label;
}

/* ---------- symbols ------------------------------------------------------- */
function symbolTexture(draw, size = 64) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  if (g) draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
  return t;
}
/* CG roundel: circle, quadrants 1 and 3 filled paper, 2 and 4 filled ink. */
function cgTexture() {
  return symbolTexture((g, s) => {
    const r = s / 2 - 3, c = s / 2;
    for (let q = 0; q < 4; q++) {
      g.beginPath(); g.moveTo(c, c); g.arc(c, c, r, -Math.PI / 2 + q * Math.PI / 2, q * Math.PI / 2); g.closePath();
      g.fillStyle = q % 2 === 0 ? PAPER : INK; g.fill();
    }
    g.lineWidth = 2.5; g.strokeStyle = PAPER; g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.stroke();
  });
}
function dotTexture() {
  return symbolTexture((g, s) => {
    const c = s / 2;
    g.fillStyle = LIVERY; g.beginPath(); g.arc(c, c, s / 2 - 6, 0, Math.PI * 2); g.fill();
    g.lineWidth = 3; g.strokeStyle = PAPER; g.stroke();
  });
}
function ringTexture() {
  return symbolTexture((g, s) => {
    const c = s / 2;
    g.lineWidth = 5; g.strokeStyle = PAPER; g.beginPath(); g.arc(c, c, s / 2 - 5, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 2; g.strokeStyle = LIVERY; g.beginPath(); g.arc(c, c, s / 2 - 5, 0, Math.PI * 2); g.stroke();
  });
}
function makeSymbol(texture) {
  const m = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false });
  const s = new THREE.Sprite(m); s.renderOrder = 38;
  return s;
}

/* ---------- arrows --------------------------------------------------------
   Shaft cylinder and head cone in world space, oriented along the direction,
   thickness set from metres per pixel so the line reads 2 px at any distance. */
const Y = new THREE.Vector3(0, 1, 0);
/* padPx widens the arrow by that many px on every side and runs it a little past
   both ends: an ink copy drawn under an arrow is its halo. */
export function createArrow(color, opacity = 1, { padPx = 0 } = {}) {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false, depthWrite: false });
  const shaftGeo = new THREE.CylinderGeometry(1, 1, 1, 8, 1, false).translate(0, 0.5, 0);
  const headGeo = new THREE.ConeGeometry(1, 1, 14, 1, false).translate(0, 0.5, 0);
  const shaft = new THREE.Mesh(shaftGeo, material), head = new THREE.Mesh(headGeo, material);
  shaft.renderOrder = head.renderOrder = 36;
  group.add(shaft, head);
  const dir = new THREE.Vector3();
  return {
    group, material,
    /* from tail to tip (world), mpp = metres per CSS pixel at that depth. */
    set(tail, tip, mpp) {
      dir.subVectors(tip, tail);
      const len = dir.length();
      if (!(len > 4 * mpp)) { group.visible = false; return false; }
      dir.divideScalar(len);
      group.visible = true;
      const pad = padPx * mpp, run = len + 2.2 * pad;
      group.position.copy(tail).addScaledVector(dir, -pad);
      group.quaternion.setFromUnitVectors(Y, dir);
      const headLen = Math.min(len * 0.5, 11 * mpp) + 2.2 * pad, r = 1.0 * mpp + pad, hr = 4.6 * mpp + 2 * pad;
      shaft.scale.set(r, Math.max(1e-6, run - headLen * 0.9), r);
      head.position.set(0, run - headLen, 0);
      head.scale.set(hr, headLen, hr);
      return true;
    },
    dispose() { shaftGeo.dispose(); headGeo.dispose(); material.dispose(); },
  };
}

/* Keep a label on screen: flip it to the other side of its anchor when the
   preferred side would run past the viewport edge (FIT_MARGIN_PX).
   view: { camera, width (CSS px), labelK }. */
const _ndc = new THREE.Vector3();
/* Labels keep this far inside the canvas: the stage's corner registration ticks sit
   12 px in and run 14 px (scene.css .sc-ticks), plus 4 px of air. */
export const FIT_MARGIN_PX = 12 + 14 + 4;
const FIT_Y_REACH_PX = 160;              // an anchor further off screen than this is not chased (its label stays with it)
/* Keep a label's plate inside the canvas vertically: returns the dyPx (label px,
   positive down the screen) to pass to place() so the plate, plus belowPx of label
   hung under it, stays FIT_MARGIN_PX inside the top and bottom edges. side and
   gapPx as in place(). view: { camera, height (CSS px), labelK }. */
export function fitLabelY(label, pos, side, gapPx, view, dyPx = 0, belowPx = 0) {
  const H = view.height;
  if (!(H > 0) || !label.height) return dyPx;
  _ndc.copy(pos).project(view.camera);
  if (!(_ndc.z < 1) || !Number.isFinite(_ndc.y)) return dyPx;          // behind the camera
  const y = (1 - _ndc.y) / 2 * H;                                        // anchor, CSS px from the top
  if (y < -FIT_Y_REACH_PX || y > H + FIT_Y_REACH_PX) return dyPx;
  const k = view.labelK || 1;
  let c = dyPx;                                                          // plate centre offset from the anchor, label px
  if (side === 'above') c -= label.height / 2 + gapPx; else if (side === 'below') c += label.height / 2 + gapPx;
  const top = y + (c - label.height / 2) * k, bottom = y + (c + label.height / 2 + belowPx) * k;
  if (top < FIT_MARGIN_PX) return dyPx + (FIT_MARGIN_PX - top) / k;
  if (bottom > H - FIT_MARGIN_PX) return dyPx - Math.min(bottom - (H - FIT_MARGIN_PX), Math.max(0, top - FIT_MARGIN_PX)) / k;
  return dyPx;
}
export function fitLabelSide(label, pos, side, gapPx, view) {
  if (side !== 'left' && side !== 'right') return side;
  const x = (_ndc.copy(pos).project(view.camera).x + 1) / 2 * view.width;
  const w = (label.width + gapPx) * view.labelK;
  const m = FIT_MARGIN_PX;
  if (side === 'left' && x - w < m && x + w < view.width - m) return 'right';
  if (side === 'right' && x + w > view.width - m && x - w > m) return 'left';
  return side;
}

const fmt = (v, d) => (Number.isFinite(v) ? v.toFixed(d) : '--');
/* Signed figures as the panel sets them: U+2212 for minus, and a value that rounds to
   zero prints without a sign (never -0.00). */
export const MINUS = '\u2212';
export function signed(v, d) {
  if (!Number.isFinite(v)) return '--';
  const t = Math.abs(v).toFixed(d);
  return Number(t) === 0 ? t : (v < 0 ? MINUS : '+') + t;
}
const sgn = signed;
const META = 'rgba(255,255,255,0.72)';  // informational secondary text, paper-a70 or stronger (FIELD.md section 2)

/* ---------- plate layout on the canvas (CSS px) ------------------------------
   Rectangles are {x0, y0, x1, y1}; obstacles are capsules {ax, ay, bx, by, r, w}
   (a segment with a radius and a cost per px of reach into a plate) and the slice's
   projected quad (a soft cost per px^2 of plate on it). */
const LAYOUT = {
  plateK: 3,            // cost per px^2 of overlap with a plate placed earlier (PLATE_PAD apart)
  sliceK: 0.06,         // cost per px^2 of plate over the slice: beside the section beats on it, when it fits
  distK: 1,             // cost per px between the anchor and the plate
  sideK: 40,            // cost of the less preferred side of the body
  dirK: 30,             // cost of an arrow's plate turned from its preferred direction (times 1 - cos)
};
const PLATE_PAD = 4;                     // px kept between plates
const AXIS_SLIDES = [0, 1, -1, 2, -2];   // slides along the body axis, in plate lengths
const FREE_EXTRA = [0, 24, 48];          // extra distance (px) tried for an arrow's plate (wind, thrust)
const FREE_ALONG = [0, 1 / 3, 2 / 3];     // spots along the arrow from its tail that a plate may sit beside
const ALONG_K = 0.3;                      // cost per px a plate sits up the arrow from its tail
const LEADER_PX = 26;                    // a plate further than this from its anchor gets a leader line
/* The stage's captions live along the canvas bottom (scene.css .sc-hint, the page's
   flow caption and its HOLD badge on a phone): plates avoid that band when they can. */
const CAPTION_BAND_PX = 104, CAPTION_BAND_K = 1;
const LEADER_MAX = 5;
/* A plate keeps its spot from the frame before unless another one is clearly cheaper
   (cost per px the plate's offset from its anchor changes, capped), so near ties do
   not make labels hop from side to side as the rocket turns. */
const STICK_K = 0.15, STICK_CAP_PX = 120;
const REACH_PX = 160;                    // an anchor further off the canvas than this keeps no label
/* CAD fin bounds (FIELD.md section 1): root leading edge at CAD y -500.7 mm, axial
   extent 85 mm and span 55 mm at fin scale 1, scaled about the leading edge. */
const FIN = { leY: -0.5007, chordM: 0.085, spanM: 0.055 };

const _s = new THREE.Vector3();
function toScreen(v, camera, W, H, o) {
  _s.copy(v).project(camera);
  o.x = (_s.x + 1) / 2 * W; o.y = (1 - _s.y) / 2 * H; o.z = _s.z;
  o.ok = _s.z > -1 && _s.z < 1 && Number.isFinite(o.x) && Number.isFinite(o.y);
  o.on = o.ok && o.x > -REACH_PX && o.x < W + REACH_PX && o.y > -REACH_PX && o.y < H + REACH_PX;
  return o;
}
function overlapArea(x0, y0, x1, y1, r) {
  const w = Math.min(x1, r.x1) - Math.max(x0, r.x0), h = Math.min(y1, r.y1) - Math.max(y0, r.y0);
  return w > 0 && h > 0 ? w * h : 0;
}
function distPtRect(px, py, x0, y0, x1, y1) { return Math.hypot(Math.max(x0 - px, 0, px - x1), Math.max(y0 - py, 0, py - y1)); }
function distPtSeg(px, py, g) {
  const vx = g.bx - g.ax, vy = g.by - g.ay, l2 = vx * vx + vy * vy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - g.ax) * vx + (py - g.ay) * vy) / l2)) : 0;
  return Math.hypot(px - (g.ax + t * vx), py - (g.ay + t * vy));
}
/* Liang-Barsky: does the segment cross the rectangle? */
function segHitsRect(g, x0, y0, x1, y1) {
  const dx = g.bx - g.ax, dy = g.by - g.ay;
  let t0 = 0, t1 = 1;
  const clip = (p, q) => {
    if (p === 0) return q >= 0;
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
    return true;
  };
  return clip(-dx, g.ax - x0) && clip(dx, x1 - g.ax) && clip(-dy, g.ay - y0) && clip(dy, y1 - g.ay);
}
function segRectDist(g, x0, y0, x1, y1) {
  if (segHitsRect(g, x0, y0, x1, y1)) return 0;
  return Math.min(distPtRect(g.ax, g.ay, x0, y0, x1, y1), distPtRect(g.bx, g.by, x0, y0, x1, y1),
    distPtSeg(x0, y0, g), distPtSeg(x1, y0, g), distPtSeg(x0, y1, g), distPtSeg(x1, y1, g));
}
/* Share of the rectangle inside a convex quad (corners in order), from a 4 x 3 sample grid. */
function shareInQuad(q, x0, y0, x1, y1) {
  let inside = 0;
  for (let j = 0; j < 3; j++) for (let i = 0; i < 4; i++) {
    const px = x0 + (x1 - x0) * (i + 0.5) / 4, py = y0 + (y1 - y0) * (j + 0.5) / 3;
    let pos = 0, neg = 0;
    for (let c = 0; c < 4; c++) {
      const a = q[c], b = q[(c + 1) % 4];
      const cr = (b.x - a.x) * (py - a.y) - (b.y - a.y) * (px - a.x);
      if (cr > 0) pos++; else if (cr < 0) neg++;
    }
    if (!(pos && neg)) inside++;
  }
  return inside / 12;
}

/* ---------- the marker set ------------------------------------------------ */
export function createMarkers({ dpr = 2 } = {}) {
  const group = new THREE.Group();
  group.name = 'markers';
  const textures = [cgTexture(), dotTexture(), ringTexture()];
  const cg = makeSymbol(textures[0]), cp = makeSymbol(textures[1]), ring = makeSymbol(textures[2]);
  const wind = createArrow(0xffffff, 0.95), normal = createArrow(0xd63b08, 1), thrust = createArrow(0xffffff, 0.7);
  // the normal-force arrow over an ink halo: the pressure view's windward field is the same orange
  const normalHalo = createArrow(0x0a0a0a, 0.85, { padPx: 1.2 });
  normalHalo.group.children.forEach(m => { m.renderOrder = 35; });
  const L = {
    cg: createLabel({ align: 'right', dpr }), cp: createLabel({ dpr }), ring: createLabel({ dpr }),
    wind: createLabel({ dpr }), thrust: createLabel({ dpr }),
  };
  // the thrust arrow draws before the additive plume (renderOrder 30), so it reads inside the glow
  thrust.group.children.forEach(m => { m.renderOrder = 29; });
  thrust.material.opacity = 0.7;
  // leader lines from a plate that had to move away to its anchor (1 px, paper-a45)
  const leaderPos = new Float32Array(LEADER_MAX * 6);
  const leaderGeo = new THREE.BufferGeometry();
  leaderGeo.setAttribute('position', new THREE.BufferAttribute(leaderPos, 3));
  leaderGeo.setDrawRange(0, 0);
  const leaderMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, depthTest: false, depthWrite: false });
  const leaders = new THREE.LineSegments(leaderGeo, leaderMat);
  leaders.renderOrder = 37; leaders.frustumCulled = false;
  group.add(cg, cp, ring, normalHalo.group, wind.group, normal.group, thrust.group, leaders, ...Object.values(L).map(l => l.sprite));
  let visible = true;
  const P = {
    cg: new THREE.Vector3(), cp: new THREE.Vector3(), ring: new THREE.Vector3(), nose: new THREE.Vector3(), tail: new THREE.Vector3(),
    a: new THREE.Vector3(), from: new THREE.Vector3(), axis: new THREE.Vector3(), side: new THREE.Vector3(),
    wTail: new THREE.Vector3(), wTip: new THREE.Vector3(), nTail: new THREE.Vector3(), nHead: new THREE.Vector3(),
    tTail: new THREE.Vector3(), tHead: new THREE.Vector3(), f0: new THREE.Vector3(), f1: new THREE.Vector3(), u: new THREE.Vector3(),
  };
  const S = {};                                  // screen points, CSS px
  for (const k of ['nose', 'tail', 'cg', 'cp', 'ring', 'wTail', 'wTip', 'nTail', 'nHead', 'tTail', 'tHead', 'f0', 'f1', 'q0', 'q1', 'q2', 'q3']) S[k] = { x: 0, y: 0, z: 0, ok: false, on: false };
  const out = { windDir: new THREE.Vector3(), windTail: new THREE.Vector3(), windTip: new THREE.Vector3(), plates: {} };
  const prevOffset = {};                         // plate name -> its centre's offset from its anchor last frame (px)
  let lastText = -1e9;

  /* s: { body: Object3D (CAD frame), noseY, tailY, xcg, xcp, xcpForce?, xcpLattice,
     theta, alpha, v, airspeed, thrust, N, finScale?, tags }, view: { camera, pxToScale,
     mpp, now, width and height (CSS px), labelK (label scale on this viewport),
     slice? (the slice's four world corners in order while it is drawn), reserved?
     (screen rectangles {x0, y0, x1, y1} other labels already hold) }. xcp is the
     static Barrowman CP (dot, label, margin); xcpForce is where N acts (the arrow),
     xcp when absent; xcpLattice is the 2D-section CP (ring), NaN to leave it out. The
     relative wind uses airspeed (|v_air|, the flight model's state.airspeed); v, the
     inertial speed, stands in only when no airspeed is given. */
  function update(s, view) {
    group.visible = visible;
    if (!visible) return;
    const { camera, pxToScale, mpp } = view;
    const W = view.width || 0, H = view.height || 0, k = view.labelK || 1;
    const body = s.body;
    const finScale = Number.isFinite(s.finScale) ? Math.max(0, s.finScale) : 1;
    const ax = P.axis.set(Math.sin(s.theta), Math.cos(s.theta), 0);          // body +y in the world
    const sideX = P.side.set(Math.cos(s.theta), -Math.sin(s.theta), 0);      // body +x in the world
    body.localToWorld(P.nose.set(0, s.noseY, 0));
    body.localToWorld(P.tail.set(0, s.tailY, 0));
    body.localToWorld(P.cg.set(0, s.noseY - s.xcg, 0));
    body.localToWorld(P.cp.set(0, s.noseY - s.xcp, 0));
    const hasRing = Number.isFinite(s.xcpLattice);
    if (hasRing) body.localToWorld(P.ring.set(0, s.noseY - s.xcpLattice, 0));

    // symbols, constant CSS px
    cg.position.copy(P.cg); cg.scale.setScalar(pxToScale(22));
    cp.visible = Number.isFinite(s.xcp); cp.position.copy(P.cp); cp.scale.setScalar(pxToScale(14));
    ring.visible = hasRing; if (hasRing) { ring.position.copy(P.ring); ring.scale.setScalar(pxToScale(24)); }

    // relative wind: arrives from (sin(theta - alpha), cos(theta - alpha)), at the end of
    // the body the air reaches first (the tail past |alpha| = 90 deg, clear of the fins)
    const gam = s.theta - s.alpha;
    const vAir = Number.isFinite(s.airspeed) ? s.airspeed : s.v;
    P.from.set(Math.sin(gam), Math.cos(gam), 0);
    const tailFirst = Math.cos(s.alpha) < 0;
    const vlen = WIND_ARROW_M[0] + (WIND_ARROW_M[1] - WIND_ARROW_M[0]) * Math.min(1, Math.max(0, vAir) / 100);
    P.wTip.copy(tailFirst ? P.tail : P.nose).addScaledVector(P.from, (tailFirst ? 0.04 : 0.03) + 6 * mpp);
    P.wTail.copy(P.wTip).addScaledVector(P.from, vlen);
    const windShown = wind.set(P.wTail, P.wTip, mpp);
    wind.material.opacity = vAir > 1 ? 0.95 : 0.5;
    out.windDir.copy(P.from).negate(); out.windTail.copy(P.wTail); out.windTip.copy(P.wTip);

    // normal force where it acts at this alpha (xcpForce), push convention from the
    // windward side; its value is printed in the CP label block, so the arrow carries no label
    const xf = Number.isFinite(s.xcpForce) ? s.xcpForce : s.xcp;
    let nShown = false;
    if (Number.isFinite(s.N) && Number.isFinite(xf)) {
      const f = Math.sign(s.N) || 1;
      const len = Math.min(N_ARROW_MAX_M, Math.abs(s.N) * N_ARROW_M_PER_N);
      body.localToWorld(P.a.set(0, s.noseY - xf, 0));
      P.nHead.copy(P.a).addScaledVector(sideX, -f * (BODY_R + 0.008));
      P.nTail.copy(P.nHead).addScaledVector(sideX, -f * len);
      nShown = normal.set(P.nTail, P.nHead, mpp);
    } else normal.group.visible = false;
    if (nShown) normalHalo.set(P.nTail, P.nHead, mpp); else normalHalo.group.visible = false;

    // thrust at the tail, push convention aft of the nozzle
    const tLen = Math.min(T_ARROW_MAX_M, Math.max(0, s.thrust) * T_ARROW_M_PER_N);
    P.tHead.copy(P.tail).addScaledVector(ax, -(0.02 + 4 * mpp));
    P.tTail.copy(P.tHead).addScaledVector(ax, -tLen);
    const tShown = thrust.set(P.tTail, P.tHead, mpp);

    // labels: text at most every 100 ms (10 Hz) so the digits stay legible
    const tags = s.tags || {};
    if (view.now - lastText > 100) {
      lastText = view.now;
      L.cg.set([[['CG', META], [`${fmt(s.xcg * IN_PER_M, 1)} IN`], [tags.xcg || 'SIM', META]]], 'right');
      L.cp.set([[['CP', META], [`${fmt(s.xcp * IN_PER_M, 1)} IN`], [tags.xcp || 'SIM', META]],
        [['MARGIN', META], [`${sgn((s.xcp - s.xcg) / (2 * BODY_R), 2)} CAL`], [tags.margin || 'SIM', META]],
        ...(Number.isFinite(s.N) ? [[['N', META], [`${sgn(s.N * LB_PER_N, 2)} LBF`], [tags.N || 'SIM', META]]] : [])]);
      // two lines, so the qualifier stays and the plate fits beside the body on a phone
      if (hasRing) L.ring.set([[['CP 2D SECTION', META]], [[`${fmt(s.xcpLattice * IN_PER_M, 1)} IN`], [tags.xcpLattice || 'SIM', META]]]);
      L.wind.set([[['REL WIND', META], [`${fmt(Math.max(0, vAir) * FT_PER_M, 0)} FT/S`], [tags.airspeed || tags.v || 'SIM', META]],
        [['ALPHA', META], [`${sgn(s.alpha * DEG, 1)} DEG`], [tags.alpha || 'SIM', META]]]);
      if (tShown) L.thrust.set([[['T', META], [`${fmt(s.thrust * LB_PER_N, 1)} LBF`], [tags.thrust || 'SIM', META]]]);
    }
    layoutPlates(s, view, { W, H, k, finScale, hasRing, windShown, nShown, tShown, camera, pxToScale, mpp });
  }

  /* Place the plates in order (wind, CG, CP block, ring, thrust); see the header. */
  function layoutPlates(s, view, o) {
    const { W, H, k, camera, pxToScale, mpp } = o;
    const sc = (name, v) => toScreen(v, camera, W, H, S[name]);
    const pN = sc('nose', P.nose), pT = sc('tail', P.tail);
    // the body axis on screen, toward the nose, and its normal (screen right of an upright rocket)
    let ux = pN.x - pT.x, uy = pN.y - pT.y;
    const ul = Math.hypot(ux, uy);
    if (pN.ok && pT.ok && ul > 1e-3) { ux /= ul; uy /= ul; } else { ux = 0; uy = -1; }
    const nx = -uy, ny = ux;
    const plates = Array.isArray(view.reserved) ? view.reserved.filter(Boolean) : [], segs = [];
    const band = { x0: 0, y0: H - CAPTION_BAND_PX, x1: W, y1: H };
    const rBody = Math.max(BODY_R / mpp, 11) + 3;                 // the body, or the CG roundel where the body is thinner
    if (pN.ok && pT.ok) segs.push({ ax: pT.x, ay: pT.y, bx: pN.x, by: pN.y, r: rBody, w: 40 });
    let rFin = 0;
    if (o.finScale > 0) {
      s.body.localToWorld(P.f0.set(0, FIN.leY, 0)); s.body.localToWorld(P.f1.set(0, FIN.leY - FIN.chordM * o.finScale, 0));
      const a = sc('f0', P.f0), b = sc('f1', P.f1);
      rFin = (BODY_R + FIN.spanM * o.finScale) / mpp + 2;
      if (a.ok && b.ok) segs.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, r: rFin, w: 30 });
    }
    const arrowSeg = (shown, ta, tb, ka, kb, r, w) => {
      if (!shown) return;
      const a = sc(ka, ta), b = sc(kb, tb);
      if (a.ok && b.ok) segs.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, r, w });
    };
    arrowSeg(o.windShown, P.wTail, P.wTip, 'wTail', 'wTip', 6, 100);
    arrowSeg(o.nShown, P.nTail, P.nHead, 'nTail', 'nHead', 6, 40);
    arrowSeg(o.tShown, P.tTail, P.tHead, 'tTail', 'tHead', 6, 60);
    // the slice's footprint and its half-width across the axis
    let quad = null, sliceHalf = 0;
    if (view.slice && view.slice.length === 4) {
      quad = view.slice.map((v, i) => sc('q' + i, v));
      if (quad.every(q => q.ok)) for (const q of quad) sliceHalf = Math.max(sliceHalf, Math.abs((q.x - pT.x) * nx + (q.y - pT.y) * ny));
      else quad = null;
    }
    const clears = [rBody + 6];
    if (rFin > 0) clears.push(rFin + 6);
    if (quad && sliceHalf > rBody + 6) clears.push(sliceHalf + 8);

    const m = FIT_MARGIN_PX;
    function cost(x0, y0, x1, y1) {
      let c = 0;
      for (const r of plates) c += overlapArea(x0 - PLATE_PAD, y0 - PLATE_PAD, x1 + PLATE_PAD, y1 + PLATE_PAD, r) * LAYOUT.plateK;
      for (const g of segs) { const d = g.r - segRectDist(g, x0, y0, x1, y1); if (d > 0) c += d * g.w; }
      if (quad) c += shareInQuad(quad, x0, y0, x1, y1) * (x1 - x0) * (y1 - y0) * LAYOUT.sliceK;
      c += overlapArea(x0, y0, x1, y1, band) * CAPTION_BAND_K;
      return c;
    }
    /* Try one spot: clamp it inside the canvas, score it, keep it if it is the best.
       a is the anchor: a point {x, y}, or an arrow {ax, ay, bx, by} the plate labels. */
    function consider(best, cx, cy, w, h, a, extra) {
      cx = m + w / 2 > W - m - w / 2 ? W / 2 : Math.max(m + w / 2, Math.min(W - m - w / 2, cx));
      cy = m + h / 2 > H - m - h / 2 ? H / 2 : Math.max(m + h / 2, Math.min(H - m - h / 2, cy));
      const x0 = cx - w / 2, y0 = cy - h / 2, x1 = cx + w / 2, y1 = cy + h / 2;
      const d = 'bx' in a ? segRectDist(a, x0, y0, x1, y1) : distPtRect(a.x, a.y, x0, y0, x1, y1);
      let c = cost(x0, y0, x1, y1) + d * LAYOUT.distK + extra;
      if (stick) c += STICK_K * Math.min(STICK_CAP_PX, Math.hypot(cx - stick.x - stick.ox, cy - stick.y - stick.oy));
      if (!best.r || c < best.c) { best.c = c; best.r = { x0, y0, x1, y1, cx, cy }; }
    }
    /* A plate for a station on the axis: beside the body (or the fins, or the slice)
       on either side of the projected axis, slid along it to clear earlier plates. */
    function axisPlate(label, a, pref) {
      const w = label.width * k, h = label.height * k, best = { c: 0, r: null };
      if (!(w > 0) || !a.on) return null;
      const eN = Math.abs(nx) * w / 2 + Math.abs(ny) * h / 2, eU = Math.abs(ux) * w / 2 + Math.abs(uy) * h / 2;
      const step = 2 * eU + PLATE_PAD;
      for (const c of clears) for (const sd of [pref, -pref]) for (const sl of AXIS_SLIDES) {
        consider(best, a.x + nx * sd * (c + eN) + ux * sl * step, a.y + ny * sd * (c + eN) + uy * sl * step, w, h, a, sd === pref ? 0 : LAYOUT.sideK);
      }
      return best.r;
    }
    /* A plate for an arrow, from its tail a (screen) toward its tip b: round spots near
       the tail and part way up the arrow, in eight directions and the preferred one, a
       little further out when that is cheaper (the arrow itself is an obstacle). */
    function arrowPlate(label, a, b, px, py, gap) {
      const w = label.width * k, h = label.height * k, best = { c: 0, r: null };
      if (!(w > 0) || !a.on) return null;
      const seg = { ax: a.x, ay: a.y, bx: b.x, by: b.y }, len = Math.hypot(b.x - a.x, b.y - a.y);
      for (const t of FREE_ALONG) {
        const ox = a.x + (b.x - a.x) * t, oy = a.y + (b.y - a.y) * t;
        for (let i = 0; i <= 8; i++) {
          const ex = i < 8 ? Math.cos(i * Math.PI / 4) : px, ey = i < 8 ? Math.sin(i * Math.PI / 4) : py;
          const e = Math.abs(ex) * w / 2 + Math.abs(ey) * h / 2;
          const extra = LAYOUT.dirK * (1 - (ex * px + ey * py)) + ALONG_K * t * len;
          for (const more of FREE_EXTRA) consider(best, ox + ex * (gap + e + more), oy + ey * (gap + e + more), w, h, seg, extra);
        }
      }
      return best.r;
    }
    let stick = null;                              // {x, y (anchor now), ox, oy (offset last frame)} of the plate being placed
    const stickTo = (name, a) => { const p = prevOffset[name]; stick = p && a ? { x: a.x, y: a.y, ox: p.ox, oy: p.oy } : null; };
    let nLead = 0;
    /* A leader from the anchor (a point, or the nearest point of an arrow b-to-a) to the
       plate, when the plate sits more than LEADER_PX away. */
    function lead(a, r, symR, b = null) {
      if (nLead >= LEADER_MAX) return;
      if (b) {
        let bd = Infinity, bx = a.x, by = a.y;
        for (let i = 0; i <= 16; i++) {
          const x = a.x + (b.x - a.x) * i / 16, y = a.y + (b.y - a.y) * i / 16, d = distPtRect(x, y, r.x0, r.y0, r.x1, r.y1);
          if (d < bd) { bd = d; bx = x; by = y; }
        }
        a = { x: bx, y: by, z: a.z };
      }
      const d = distPtRect(a.x, a.y, r.x0, r.y0, r.x1, r.y1);
      if (!(d > LEADER_PX)) return;
      const qx = Math.max(r.x0, Math.min(r.x1, a.x)), qy = Math.max(r.y0, Math.min(r.y1, a.y));
      const sx = a.x + (qx - a.x) * symR / d, sy = a.y + (qy - a.y) * symR / d;
      for (const [px, py, j] of [[sx, sy, 0], [qx, qy, 3]]) {
        P.u.set(px / W * 2 - 1, 1 - py / H * 2, a.z).unproject(camera);
        leaderPos.set([P.u.x, P.u.y, P.u.z], nLead * 6 + j);
      }
      nLead++;
    }
    function put(name, label, a, r, symR, world, b = null) {
      label.sprite.visible = !!r;
      out.plates[name] = r;
      stick = null;
      if (!r) { delete prevOffset[name]; return; }
      prevOffset[name] = { ox: r.cx - a.x, oy: r.cy - a.y };
      label.sprite.position.copy(world);               // the anchor; the plate is offset from it on screen
      label.placeAt(pxToScale, (r.cx - a.x) / k, (r.cy - a.y) / k);
      plates.push(r);
      lead(a, r, symR, b);
    }

    // which side: the CP block away from the N arrow, the CG label opposite it, the
    // ring's label opposite the CG label
    const pCg = sc('cg', P.cg), pCp = sc('cp', P.cp);
    let arrowSide = -1;
    if (o.nShown && S.nTail.ok) arrowSide = Math.sign((S.nTail.x - pCp.x) * nx + (S.nTail.y - pCp.y) * ny) || -1;
    const cpPref = -arrowSide, cgPref = arrowSide;

    // wind: continue the arrow back from its tail, else beside it
    if (o.windShown && S.wTail.ok && S.wTip.ok) {
      let dx = S.wTail.x - S.wTip.x, dy = S.wTail.y - S.wTip.y; const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
      stickTo('wind', S.wTail);
      put('wind', L.wind, S.wTail, arrowPlate(L.wind, S.wTail, S.wTip, dx, dy, 8), 0, P.wTail, S.wTip);
    } else put('wind', L.wind, S.wTail, null);
    stickTo('cg', pCg);
    put('cg', L.cg, pCg, axisPlate(L.cg, pCg, cgPref), 12, P.cg);
    stickTo('cp', pCp);
    put('cp', L.cp, pCp, cp.visible ? axisPlate(L.cp, pCp, cpPref) : null, 8, P.cp);
    if (o.hasRing) { const pR = sc('ring', P.ring); stickTo('ring', pR); put('ring', L.ring, pR, axisPlate(L.ring, pR, cpPref), 13, P.ring); } else put('ring', L.ring, S.ring, null);
    // thrust: beside the arrow, toward screen right first
    if (o.tShown && S.tTail.ok && S.tHead.ok) { stickTo('thrust', S.tTail); put('thrust', L.thrust, S.tTail, arrowPlate(L.thrust, S.tTail, S.tHead, 1, 0, 8), 0, P.tTail, S.tHead); }
    else put('thrust', L.thrust, S.tTail, null);
    leaderGeo.setDrawRange(0, nLead * 2);
    if (nLead) leaderGeo.attributes.position.needsUpdate = true;
    leaders.visible = nLead > 0;
  }
  return {
    group, out,
    update,
    setVisible(v) { visible = !!v; group.visible = visible; },
    refresh() { lastText = -1e9; for (const l of Object.values(L)) l.invalidate(); },
    get visible() { return visible; },
    dispose() {
      for (const t of textures) t.dispose();
      for (const s of [cg, cp, ring]) s.material.dispose();
      wind.dispose(); normal.dispose(); normalHalo.dispose(); thrust.dispose();
      leaderGeo.dispose(); leaderMat.dispose();
      for (const l of Object.values(L)) l.dispose();
      group.removeFromParent();
    },
  };
}
