/* Markers for the CHARGER field scene (FIELD.md section 6): the CG symbol (circle
   with alternating filled quadrants), the Barrowman CP dot, a hollow CP ring for the
   lattice's measured CP, the relative wind arrow ahead of the nose, the normal force
   arrow at the CP scaled by N, the thrust arrow at the tail scaled by T, each with a
   mono label carrying its source tag.

   Everything here is an annotation: drawn after the opaque rocket and the slice,
   depthTest off, constant size on screen (sprites without size attenuation, arrow
   thickness from the metres-per-pixel at the rocket's depth). Arrow lengths are in
   metres in the world so they scale with the rocket.

   Sign convention (FIELD.md section 2): body axis at theta from +y, positive toward
   +x; relative air velocity v_air = wind - v_rocket; alpha = theta - angle(-v_air).
   The air therefore arrives from the world direction (sin(theta - alpha),
   cos(theta - alpha)) and the wind arrow points along v_air, the opposite way.
   N is positive along the body's local +x axis, the leeward side for a positive
   alpha (Barrowman normal force has the sign of alpha); it is drawn in push
   convention, the head touching the body at the CP station on the windward side.
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
        ctx.fillStyle = 'rgba(10,10,10,0.74)';
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
export function createArrow(color, opacity = 1) {
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
      group.position.copy(tail);
      group.quaternion.setFromUnitVectors(Y, dir);
      const headLen = Math.min(len * 0.5, 11 * mpp), r = 1.0 * mpp, hr = 4.6 * mpp;
      shaft.scale.set(r, Math.max(1e-6, len - headLen * 0.9), r);
      head.position.set(0, len - headLen, 0);
      head.scale.set(hr, headLen, hr);
      return true;
    },
    dispose() { shaftGeo.dispose(); headGeo.dispose(); material.dispose(); },
  };
}

/* Keep a label on screen: flip it to the other side of its anchor when the
   preferred side would run past the viewport edge (4 px margin).
   view: { camera, width (CSS px), labelK }. */
const _ndc = new THREE.Vector3();
export function fitLabelSide(label, pos, side, gapPx, view) {
  if (side !== 'left' && side !== 'right') return side;
  const x = (_ndc.copy(pos).project(view.camera).x + 1) / 2 * view.width;
  const w = (label.width + gapPx) * view.labelK;
  if (side === 'left' && x - w < 4 && x + w < view.width - 4) return 'right';
  if (side === 'right' && x + w > view.width - 4 && x - w > 4) return 'left';
  return side;
}

const fmt = (v, d) => (Number.isFinite(v) ? v.toFixed(d) : '--');
const sgn = (v, d) => (Number.isFinite(v) ? (v >= 0 ? '+' : '-') + Math.abs(v).toFixed(d) : '--');
const META = 'rgba(255,255,255,0.72)';  // informational secondary text, paper-a70 or stronger (FIELD.md section 2)

/* ---------- the marker set ------------------------------------------------ */
export function createMarkers({ dpr = 2 } = {}) {
  const group = new THREE.Group();
  group.name = 'markers';
  const textures = [cgTexture(), dotTexture(), ringTexture()];
  const cg = makeSymbol(textures[0]), cp = makeSymbol(textures[1]), ring = makeSymbol(textures[2]);
  const wind = createArrow(0xffffff, 0.95), normal = createArrow(0xd63b08, 1), thrust = createArrow(0xffffff, 0.7);
  const L = {
    cg: createLabel({ align: 'right', dpr }), cp: createLabel({ dpr }), ring: createLabel({ dpr }),
    wind: createLabel({ dpr }), thrust: createLabel({ dpr }),
  };
  // the thrust arrow draws before the additive plume (renderOrder 30), so it reads inside the glow
  thrust.group.children.forEach(m => { m.renderOrder = 29; });
  thrust.material.opacity = 0.7;
  group.add(cg, cp, ring, wind.group, normal.group, thrust.group, ...Object.values(L).map(l => l.sprite));
  let visible = true;
  const P = {
    cg: new THREE.Vector3(), cp: new THREE.Vector3(), ring: new THREE.Vector3(), nose: new THREE.Vector3(), tail: new THREE.Vector3(),
    a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), from: new THREE.Vector3(), axis: new THREE.Vector3(), side: new THREE.Vector3(),
    sa: new THREE.Vector3(), sb: new THREE.Vector3(),
  };
  const out = { windDir: new THREE.Vector3(), windTail: new THREE.Vector3(), windTip: new THREE.Vector3() };
  let lastText = -1e9;

  /* Screen x (NDC) of a world point, for choosing which side a label goes. */
  function ndcX(v, camera) { return P.sa.copy(v).project(camera).x; }
  const fit = fitLabelSide;

  /* s: { body: Object3D (CAD frame), noseY, tailY, xcg, xcp, xcpLattice, theta,
     alpha, v, airspeed, thrust, N, tags }, view: { camera, pxToScale, mpp, now,
     width (CSS px), labelK (label scale on this viewport) }. The relative wind
     uses airspeed (|v_air|, the flight model's state.airspeed); v, the inertial
     speed, stands in only when no airspeed is given. */
  function update(s, view) {
    group.visible = visible;
    if (!visible) return;
    const { camera, pxToScale, mpp } = view;
    const body = s.body;
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

    // relative wind: arrives from (sin(theta - alpha), cos(theta - alpha))
    const gam = s.theta - s.alpha;
    const vAir = Number.isFinite(s.airspeed) ? s.airspeed : s.v;
    P.from.set(Math.sin(gam), Math.cos(gam), 0);
    const vlen = WIND_ARROW_M[0] + (WIND_ARROW_M[1] - WIND_ARROW_M[0]) * Math.min(1, Math.max(0, vAir) / 100);
    const tip = P.a.copy(P.nose).addScaledVector(P.from, 0.03 + 6 * mpp);
    const tail = P.b.copy(tip).addScaledVector(P.from, vlen);
    wind.set(tail, tip, mpp);
    wind.material.opacity = vAir > 1 ? 0.95 : 0.5;
    out.windDir.copy(P.from).negate(); out.windTail.copy(tail); out.windTip.copy(tip);
    L.wind.sprite.position.copy(tail);
    const windSide = ndcX(tail, camera) < ndcX(tip, camera) ? 'left' : 'right';

    // normal force at the CP, push convention from the windward side; its value is
    // printed in the CP label block (it acts there), so the arrow carries no label
    const nOk = Number.isFinite(s.N) && Number.isFinite(s.xcp);
    let arrowRight = false;                  // the N arrow lies right of the body on screen
    if (nOk) {
      const f = Math.sign(s.N) || 1;
      const len = Math.min(N_ARROW_MAX_M, Math.abs(s.N) * N_ARROW_M_PER_N);
      const head = P.c.copy(P.cp).addScaledVector(sideX, -f * (BODY_R + 0.008));
      const t0 = P.sb.copy(head).addScaledVector(sideX, -f * len);
      if (normal.set(t0, head, mpp)) arrowRight = ndcX(t0, camera) > ndcX(head, camera);
    } else normal.group.visible = false;
    // the CP block goes on the side away from the N arrow, the CG label opposite it
    const cpSide = arrowRight ? 'left' : 'right', cgSide = arrowRight ? 'right' : 'left';

    // thrust at the tail, push convention aft of the nozzle
    const tLen = Math.min(T_ARROW_MAX_M, Math.max(0, s.thrust) * T_ARROW_M_PER_N);
    const tHead = P.c.copy(P.tail).addScaledVector(ax, -(0.02 + 4 * mpp));
    const tTail = P.sb.copy(tHead).addScaledVector(ax, -tLen);
    const tShown = thrust.set(tTail, tHead, mpp);
    L.thrust.sprite.visible = tShown;
    if (tShown) L.thrust.sprite.position.copy(tTail);

    // labels: text at most every 100 ms (10 Hz) so the digits stay legible
    const tags = s.tags || {};
    if (view.now - lastText > 100) {
      lastText = view.now;
      L.cg.set([[['CG', META], [`${fmt(s.xcg * IN_PER_M, 1)} IN`], [tags.xcg || 'SIM', META]]], 'right');
      L.cp.set([[['CP', META], [`${fmt(s.xcp * IN_PER_M, 1)} IN`], [tags.xcp || 'SIM', META]],
        [['MARGIN', META], [`${fmt((s.xcp - s.xcg) / (2 * BODY_R), 2)} CAL`], [tags.margin || 'SIM', META]],
        ...(Number.isFinite(s.N) ? [[['N', META], [`${sgn(s.N * LB_PER_N, 2)} LBF`], [tags.N || 'SIM', META]]] : [])]);
      if (hasRing) L.ring.set([[['CP LBM', META], [`${fmt(s.xcpLattice * IN_PER_M, 1)} IN`], [tags.xcpLattice || 'SIM', META]]]);
      L.wind.set([[['REL WIND', META], [`${fmt(Math.max(0, vAir) * FT_PER_M, 0)} FT/S`], [tags.airspeed || tags.v || 'SIM', META]],
        [['ALPHA', META], [`${sgn(s.alpha * DEG, 1)} DEG`], [tags.alpha || 'SIM', META]]], windSide);
      if (tShown) L.thrust.set([[['T', META], [`${fmt(s.thrust * LB_PER_N, 1)} LBF`], [tags.thrust || 'SIM', META]]]);
    }
    L.cg.sprite.position.copy(P.cg); L.cg.place(pxToScale, fit(L.cg, P.cg, cgSide, 16, view), 16);
    L.cp.sprite.position.copy(P.cp); L.cp.sprite.visible = cp.visible; L.cp.place(pxToScale, fit(L.cp, P.cp, cpSide, 14, view), 14);
    // The lattice CP label hangs under the Barrowman CP block (both are read together).
    L.ring.sprite.visible = hasRing;
    if (hasRing) { L.ring.sprite.position.copy(cp.visible ? P.cp : P.ring); L.ring.place(pxToScale, fit(L.ring, L.ring.sprite.position, cpSide, 14, view), 14, cp.visible ? (L.cp.height + L.ring.height) / 2 + 3 : 0); }
    L.wind.place(pxToScale, fit(L.wind, L.wind.sprite.position, windSide, 8, view), 8);
    if (tShown) L.thrust.place(pxToScale, fit(L.thrust, L.thrust.sprite.position, 'right', 8, view), 8);
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
      wind.dispose(); normal.dispose(); thrust.dispose();
      for (const l of Object.values(L)) l.dispose();
      group.removeFromParent();
    },
  };
}
