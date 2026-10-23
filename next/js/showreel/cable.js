// USB-C cable for the Therma-Shift reel: a supporting detail. Only the plug end ever shows: it flies in and seats
// cleanly in the case's port while the cable, plugged in somewhere beyond the edge of the page, is pulled along,
// whips a little with its momentum, drapes and lands on the ground, then rests in a short run leading off screen.
// Later the plug pops out and the cable slides away off that same edge.
//
// The far end is an anchor just outside the viewport, chosen by the hero for each layout (bake(anchor) on resize):
// the shortest run off screen that keeps clear of the drift word, the marquee and the coaster. The rope is a Verlet
// simulation run once per layout (fixed 120 Hz step, a few dozen points: cheap on phones) and baked at 60 frames per
// second; the reel samples the bake as a pure function of time, so seeking, reverse play and aborts are exact and
// nothing integrates at run time. Drawing: one thin tube (Catmull-Rom through the rope points, parallel-transport
// frames) and a faint contact-shadow ribbon, rewritten in place (no per-frame allocation), plus the plug.
//
//   const cable = createCable({ THREE, quality, port, ground, box });   // coaster space, metres
//   cable.group                     add next to the coaster (same parent)
//   cable.bake(anchor)              simulate for this anchor (coaster space, on the ground, off screen)
//   cable.plugIn.duration, cable.plugOut.duration
//   cable.showIn(t), cable.showOut(t)   pose at t seconds into the plug-in / the pull-out (clamped)
//   cable.capture(), cable.showAway(k)  abort: freeze the current pose, then slide it off along the run (k 0..1)
//   cable.hide(), cable.visible, cable.baked, cable.triangles, cable.dispose()
//
// Units metres. Real sizes: USB-C plug shell 8.25 x 2.4 mm, 6.6 mm long; overmold 11 x 5 x 17 mm; cable 3.2 mm.

const HZ = 120, FPS = 60;     // simulation step, bake rate
const SEG = 0.016;            // rope segment length
const MAXN = 48;              // rope points at most (geometry is allocated for this many)
const GRAVITY = 4.0;          // m/s^2: slowed a little so the drape reads at hero scale (the coaster is 9 cm wide)
const ITER = 14;
const SR = 0.024;             // plug front face to where the cable leaves the strain relief
const SLACK = 1.05;           // rope length over the straight run from port to anchor

export function createCable({ THREE, quality = 'high', port, ground, box }) {
  const low = quality === 'low';
  const R = low ? 0.0014 : 0.0016;                       // thin, a touch thinner on phones
  const group = new THREE.Group(); group.name = 'usbCable';
  const geos = [], mats = [];
  const nrm = port.normal.clone().normalize();
  const seat = port.position.clone().addScaledVector(nrm, 0.0004);
  const up = new THREE.Vector3(0, 1, 0);

  // ------------------------------------------------------------------ plug (matte dark grey, satin shell)
  const grey = new THREE.MeshStandardMaterial({ color: 0x45484d, roughness: 0.72, metalness: 0 });
  const shellMat = new THREE.MeshStandardMaterial({ color: 0xbfc2c6, roughness: 0.36, metalness: 0.85 });
  mats.push(grey, shellMat);
  const stadium = (w, h, z0, z1, mat) => {
    const r = Math.min(w, h) / 2 * 0.999, s = new THREE.Shape(), hw = w / 2 - r;
    s.moveTo(-hw, -h / 2); s.lineTo(hw, -h / 2); s.absarc(hw, 0, r, -Math.PI / 2, Math.PI / 2, false);
    s.lineTo(-hw, h / 2); s.absarc(-hw, 0, r, Math.PI / 2, Math.PI * 1.5, false);
    const g = new THREE.ExtrudeGeometry(s, { depth: z1 - z0, bevelEnabled: false, curveSegments: low ? 4 : 6 });
    g.translate(0, 0, z0); geos.push(g);
    return new THREE.Mesh(g, mat);
  };
  const plug = new THREE.Group(); plug.name = 'usbPlug';
  plug.add(stadium(0.00825, 0.0024, -0.0066, 0, shellMat));                  // metal shell (goes into the port)
  plug.add(stadium(0.011, 0.005, 0.0004, 0.017, grey));                     // overmold
  const relief = new THREE.CylinderGeometry(R * 1.1, R * 1.6, SR - 0.017, low ? 8 : 10, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.017 + (SR - 0.017) / 2);
  geos.push(relief); plug.add(new THREE.Mesh(relief, grey));
  group.add(plug);

  // ------------------------------------------------------------------ tube + shadow ribbon (allocated for MAXN)
  const SUB = 2, RS = low ? 4 : 5, MMAX = (MAXN - 1) * SUB + 1;
  const tubePos = new Float32Array(MMAX * RS * 3), tubeNrm = new Float32Array(MMAX * RS * 3);
  const idx = [];
  for (let i = 0; i < MMAX - 1; i++) for (let j = 0; j < RS; j++) {
    const a = i * RS + j, b = i * RS + (j + 1) % RS, c = a + RS, d = b + RS;
    idx.push(a, c, b, b, c, d);
  }
  const tubeGeo = new THREE.BufferGeometry();
  tubeGeo.setAttribute('position', new THREE.BufferAttribute(tubePos, 3).setUsage(THREE.DynamicDrawUsage));
  tubeGeo.setAttribute('normal', new THREE.BufferAttribute(tubeNrm, 3).setUsage(THREE.DynamicDrawUsage));
  tubeGeo.setIndex(idx); geos.push(tubeGeo);
  const tube = new THREE.Mesh(tubeGeo, grey); tube.name = 'cableTube'; tube.frustumCulled = false;
  const shPos = new Float32Array(MMAX * 2 * 3), shCol = new Float32Array(MMAX * 2 * 4);
  const shIdx = [];
  for (let i = 0; i < MMAX - 1; i++) { const a = i * 2; shIdx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  const shGeo = new THREE.BufferGeometry();
  shGeo.setAttribute('position', new THREE.BufferAttribute(shPos, 3).setUsage(THREE.DynamicDrawUsage));
  shGeo.setAttribute('color', new THREE.BufferAttribute(shCol, 4).setUsage(THREE.DynamicDrawUsage));
  shGeo.setIndex(shIdx); geos.push(shGeo);
  const shMat = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, transparent: true, depthWrite: false, toneMapped: false });
  mats.push(shMat);
  const shadow = new THREE.Mesh(shGeo, shMat); shadow.name = 'cableShadow'; shadow.renderOrder = -1; shadow.frustumCulled = false;
  group.add(tube, shadow);

  // ------------------------------------------------------------------ state of the current bake
  let N = 0, M = 0, seg = SEG;
  const anchor = new THREE.Vector3(), out = new THREE.Vector3(), exitPt = new THREE.Vector3();
  let runLen = 0;
  const pre = seat.clone().addScaledVector(nrm, 0.03);                  // lined up, 30 mm out
  const A0 = new THREE.Vector3(), A1 = new THREE.Vector3(), A2 = new THREE.Vector3();
  const D0 = seat.clone().addScaledVector(nrm, 0.022), D1 = new THREE.Vector3(), D2 = new THREE.Vector3(), D3 = new THREE.Vector3();
  const farIn0 = new THREE.Vector3(), farOut1 = new THREE.Vector3();
  const T_FLY = 0.8, T_INS = 0.16, T_CLICK = 0.14, T_OUT = 0.2, T_AWAY = 1.1;

  const bez = (a, b, c, d, t, o) => {
    const u = 1 - t;
    return o.set(0, 0, 0).addScaledVector(a, u * u * u).addScaledVector(b, 3 * u * u * t).addScaledVector(c, 3 * u * t * t).addScaledVector(d, t * t * t);
  };
  const eOut = t => 1 - (1 - t) ** 3, eIn = t => t * t, eIO = t => (t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
  const cl = t => (t < 0 ? 0 : t > 1 ? 1 : t);
  const _a = new THREE.Vector3(), _b = new THREE.Vector3();
  // plug front-face position, cable axis (plug +z) and far-end position at time t of the plug-in
  function plugInPose(t, pos, axis, far) {
    const s = eOut(cl(t / T_FLY));
    if (t < T_FLY) {
      bez(A0, A1, A2, pre, s, pos);
      bez(A0, A1, A2, pre, Math.min(1, s + 0.01), _a); bez(A0, A1, A2, pre, Math.max(0, s - 0.01), _b);
      axis.subVectors(_b, _a);                                    // head leads, cable trails
      if (axis.lengthSq() < 1e-12) axis.copy(nrm); else axis.normalize();
      axis.lerp(nrm, cl((t / T_FLY - 0.5) / 0.5) ** 2).normalize();
    } else if (t < T_FLY + T_INS) {
      pos.lerpVectors(pre, seat, eIO(cl((t - T_FLY) / T_INS))); axis.copy(nrm);
    } else {
      const k = cl((t - T_FLY - T_INS) / T_CLICK);                 // the click: 0.3 mm past, back to seat
      pos.copy(seat).addScaledVector(nrm, -0.0003 * Math.sin(Math.PI * k) * (1 - k)); axis.copy(nrm);
    }
    if (far) far.lerpVectors(farIn0, anchor, s);                  // the far end is fed in, off screen
    return pos;
  }
  function plugOutPose(t, pos, axis, far) {
    if (t < T_OUT) {
      pos.lerpVectors(seat, D0, cl(t / T_OUT) * (2 - cl(t / T_OUT))); axis.copy(nrm);
    } else {
      const s = eIn(cl((t - T_OUT) / T_AWAY));
      bez(D0, D1, D2, D3, s, pos);
      bez(D0, D1, D2, D3, Math.min(1, s + 0.01), _a); bez(D0, D1, D2, D3, Math.max(0, s - 0.01), _b);
      axis.subVectors(_a, _b); if (axis.lengthSq() < 1e-12) axis.copy(out); else axis.normalize();   // the cable leads now
      axis.lerp(nrm, 1 - cl((t - T_OUT) / 0.3)).normalize();
    }
    if (far) far.lerpVectors(anchor, farOut1, eIn(cl((t - T_OUT * 0.5) / T_AWAY)));
    return pos;
  }

  // ------------------------------------------------------------------ simulation
  let P = null, Q = null;
  const pp = new THREE.Vector3(), ax = new THREE.Vector3(), fp = new THREE.Vector3();
  const g = GRAVITY / (HZ * HZ), gy = ground + R;
  const bx0 = box.min.x - R, bx1 = box.max.x + R, by0 = box.min.y, by1 = box.max.y + R, bz0 = box.min.z - R, bz1 = box.max.z + R;
  function collide(i) {
    let x = P[i], y = P[i + 1], z = P[i + 2];
    if (y < gy) {                                                  // ground: small bounce, strong friction
      const vy = y - Q[i + 1];
      y = gy; Q[i + 1] = y + vy * 0.2;
      Q[i] = x - (x - Q[i]) * 0.5; Q[i + 2] = z - (z - Q[i + 2]) * 0.5;
    }
    if (x > bx0 && x < bx1 && y > by0 && y < by1 && z > bz0 && z < bz1) {   // the case: out by the nearest face
      const dx0 = x - bx0, dx1 = bx1 - x, dy1 = by1 - y, dz0 = z - bz0, dz1 = bz1 - z;
      const m = Math.min(dx0, dx1, dy1, dz0, dz1);
      if (m === dz1) z = bz1; else if (m === dz0) z = bz0; else if (m === dx0) x = bx0; else if (m === dx1) x = bx1; else y = by1;
    }
    P[i] = x; P[i + 1] = y; P[i + 2] = z;
  }
  function pin(pose, t) {
    pose(t, pp, ax, fp);
    for (let k = 0; k < 2; k++) {
      const d = SR + k * seg;
      P[k * 3] = pp.x + ax.x * d; P[k * 3 + 1] = pp.y + ax.y * d; P[k * 3 + 2] = pp.z + ax.z * d;
    }
    const e = (N - 1) * 3; P[e] = fp.x; P[e + 1] = fp.y; P[e + 2] = fp.z;
  }
  function link(i, j, rest, k) {
    const a = i * 3, b = j * 3;
    const dx = P[b] - P[a], dy = P[b + 1] - P[a + 1], dz = P[b + 2] - P[a + 2];
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-9, f = (d - rest) / d * k;
    const wa = i < 2 || i === N - 1 ? 0 : 0.5, wb = j < 2 || j === N - 1 ? 0 : 0.5, w = wa + wb;
    if (!w) return;
    P[a] += dx * f * wa / w; P[a + 1] += dy * f * wa / w; P[a + 2] += dz * f * wa / w;
    P[b] -= dx * f * wb / w; P[b + 1] -= dy * f * wb / w; P[b + 2] -= dz * f * wb / w;
  }
  function solve(pose, t) {
    for (let i = 2; i < N - 1; i++) {
      const o = i * 3;
      for (let c = 0; c < 3; c++) { const v = (P[o + c] - Q[o + c]) * 0.985; Q[o + c] = P[o + c]; P[o + c] += v; }
      P[o + 1] -= g;
    }
    pin(pose, t);
    for (let it = 0; it < ITER; it++) {
      for (let i = 0; i < N - 1; i++) link(i, i + 1, seg, 1);
      for (let i = 0; i < N - 2; i++) link(i, i + 2, seg * 2 * 0.997, 0.08);   // a little bend stiffness
      pin(pose, t);
      for (let i = 2; i < N - 1; i++) collide(i * 3);
    }
  }
  function record(pose, duration, init) {
    const frames = Math.ceil(duration * FPS) + 1, data = new Float32Array(frames * N * 3);
    init();
    const per = HZ / FPS;
    data.set(P, 0);
    for (let f = 1; f < frames; f++) {
      for (let s = 1; s <= per; s++) solve(pose, ((f - 1) * per + s) / HZ);
      data.set(P, f * N * 3);
    }
    return { duration, frames, data };
  }
  const api = { plugIn: null, plugOut: null, baked: false };
  // Simulate for an anchor (coaster space, on the ground beyond the edge of the page). Resize-time only.
  function bake(a) {
    anchor.copy(a); anchor.y = ground + R;
    exitPt.copy(seat).addScaledVector(nrm, SR + 0.004);
    out.subVectors(anchor, exitPt); out.y = 0; runLen = out.length(); out.normalize();
    const L = Math.max(0.05, runLen * SLACK + SR);
    N = Math.min(MAXN, Math.max(10, Math.round(L / SEG) + 1)); seg = L / (N - 1); M = (N - 1) * SUB + 1;
    P = new Float32Array(N * 3); Q = new Float32Array(N * 3);
    // arrival: from just beyond the anchor, a low arc toward the port, the last leg straight along -normal
    A0.copy(anchor).addScaledVector(out, 0.04).addScaledVector(up, 0.05);
    A1.copy(exitPt).lerp(anchor, 0.55).addScaledVector(up, 0.06);
    A2.copy(pre).addScaledVector(nrm, 0.07).addScaledVector(up, 0.012);
    farIn0.copy(anchor).addScaledVector(out, L * 0.9);
    // departure: straight out, then low along the run and past the anchor
    D1.copy(D0).addScaledVector(nrm, 0.04).addScaledVector(up, 0.01);
    D2.copy(D0).lerp(anchor, 0.6).addScaledVector(up, 0.02);
    D3.copy(anchor).addScaledVector(out, 0.12).addScaledVector(up, 0.01);
    farOut1.copy(anchor).addScaledVector(out, L + 0.12);
    api.plugIn = record(plugInPose, 2.6, () => {
      plugInPose(0, pp, ax, fp); plugInPose(1 / HZ, _a, _b, null);
      const vx = _a.x - pp.x, vy = _a.y - pp.y, vz = _a.z - pp.z;
      for (let i = 0; i < N; i++) {                                  // straight from the plug to the far end
        const k = i / (N - 1), o = i * 3;
        _b.copy(pp).addScaledVector(ax, SR).lerp(fp, k);
        P[o] = _b.x; P[o + 1] = Math.max(gy, _b.y); P[o + 2] = _b.z;
        Q[o] = P[o] - vx * (1 - k); Q[o + 1] = P[o + 1] - vy * (1 - k); Q[o + 2] = P[o + 2] - vz * (1 - k);
      }
    });
    const rest = api.plugIn.data.subarray((api.plugIn.frames - 1) * N * 3);
    api.plugOut = record(plugOutPose, 1.6, () => { P.set(rest); Q.set(rest); });
    tubeGeo.setDrawRange(0, (M - 1) * RS * 6);
    shGeo.setDrawRange(0, (M - 1) * 6);
    api.baked = true;
  }

  // ------------------------------------------------------------------ drawing
  const pts = new Float32Array(MAXN * 3), awayPts = new Float32Array(MAXN * 3);
  const cur = new THREE.Vector3(), nxt = new THREE.Vector3(), tan = new THREE.Vector3(), nor = new THREE.Vector3(), bin = new THREE.Vector3(), tmp = new THREE.Vector3();
  const mtx = new THREE.Matrix4();
  function crAt(u, o) {
    const i = Math.min(N - 2, Math.floor(u)), t = u - i;
    const i0 = Math.max(0, i - 1), i1 = i, i2 = i + 1, i3 = Math.min(N - 1, i + 2);
    const t2 = t * t, t3 = t2 * t;
    for (let c = 0; c < 3; c++) {
      const p0 = pts[i0 * 3 + c], p1 = pts[i1 * 3 + c], p2 = pts[i2 * 3 + c], p3 = pts[i3 * 3 + c];
      o.setComponent(c, 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3));
    }
    return o;
  }
  function orient(obj, pos, axis) {
    tmp.crossVectors(up, axis); if (tmp.lengthSq() < 1e-8) tmp.set(1, 0, 0); tmp.normalize();
    bin.crossVectors(axis, tmp);
    mtx.makeBasis(tmp, bin, axis); obj.quaternion.setFromRotationMatrix(mtx); obj.position.copy(pos);
  }
  function draw(plugPos, plugAxis) {
    orient(plug, plugPos, plugAxis);
    crAt(0, cur); crAt(1 / SUB, nxt); tan.subVectors(nxt, cur).normalize();
    nor.crossVectors(tan, up); if (nor.lengthSq() < 1e-8) nor.set(1, 0, 0); nor.normalize();
    for (let r = 0; r < M; r++) {
      const u = r / SUB;
      crAt(u, cur);
      crAt(Math.min(N - 1, u + 0.25), nxt); tmp.copy(nxt); crAt(Math.max(0, u - 0.25), nxt); tan.subVectors(tmp, nxt);
      if (tan.lengthSq() > 1e-14) tan.normalize();
      nor.addScaledVector(tan, -nor.dot(tan)); if (nor.lengthSq() < 1e-10) nor.crossVectors(tan, up); nor.normalize();   // parallel transport
      bin.crossVectors(tan, nor);
      for (let j = 0; j < RS; j++) {
        const a = j / RS * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a), o = (r * RS + j) * 3;
        const nx = nor.x * ca + bin.x * sa, ny = nor.y * ca + bin.y * sa, nz = nor.z * ca + bin.z * sa;
        tubeNrm[o] = nx; tubeNrm[o + 1] = ny; tubeNrm[o + 2] = nz;
        tubePos[o] = cur.x + nx * R; tubePos[o + 1] = cur.y + ny * R; tubePos[o + 2] = cur.z + nz * R;
      }
      const h = cur.y - ground - R, al = 0.22 * Math.max(0, 1 - h / 0.025);
      tmp.set(-tan.z, 0, tan.x); if (tmp.lengthSq() < 1e-10) tmp.set(1, 0, 0); tmp.normalize().multiplyScalar(R * 2.2);
      const so = r * 6, co = r * 8;
      shPos[so] = cur.x + tmp.x; shPos[so + 1] = ground + 0.0003; shPos[so + 2] = cur.z + tmp.z;
      shPos[so + 3] = cur.x - tmp.x; shPos[so + 4] = ground + 0.0003; shPos[so + 5] = cur.z - tmp.z;
      shCol[co] = shCol[co + 1] = shCol[co + 2] = 0; shCol[co + 3] = al;
      shCol[co + 4] = shCol[co + 5] = shCol[co + 6] = 0; shCol[co + 7] = al;
    }
    tubeGeo.attributes.position.needsUpdate = true; tubeGeo.attributes.normal.needsUpdate = true;
    shGeo.attributes.position.needsUpdate = true; shGeo.attributes.color.needsUpdate = true;
    group.visible = true;
  }
  function frameOf(b, t) {
    const x = Math.min(b.frames - 1, Math.max(0, t * FPS)), i = Math.min(b.frames - 2, Math.floor(x)), k = x - i;
    const A = i * N * 3, B = A + N * 3;
    for (let j = 0; j < N * 3; j++) pts[j] = b.data[A + j] + (b.data[B + j] - b.data[A + j]) * k;
  }
  const pPos = new THREE.Vector3(), pAx = new THREE.Vector3();
  function showIn(t) { if (!api.baked) return hide(); frameOf(api.plugIn, t); plugInPose(Math.min(t, api.plugIn.duration), pPos, pAx, null); draw(pPos, pAx); }
  function showOut(t) { if (!api.baked) return hide(); frameOf(api.plugOut, t); plugOutPose(Math.min(t, api.plugOut.duration), pPos, pAx, null); draw(pPos, pAx); }
  // abort: pull the plug 12 mm straight out, then slide the whole run off along its own line, past the anchor
  const awayPos = new THREE.Vector3(), awayAx = new THREE.Vector3();
  function capture() { awayPts.set(pts); awayPos.copy(plug.position); awayAx.set(0, 0, 1).applyQuaternion(plug.quaternion); }
  function showAway(k) {
    if (k >= 1 || !api.baked) { hide(); return; }
    const pull = 0.012 * Math.min(1, k / 0.15), slide = (runLen + 0.08) * Math.max(0, (k - 0.12) / 0.88) ** 2;
    tmp.copy(nrm).multiplyScalar(pull).addScaledVector(out, slide);
    for (let j = 0; j < N; j++) { pts[j * 3] = awayPts[j * 3] + tmp.x; pts[j * 3 + 1] = awayPts[j * 3 + 1] + tmp.y; pts[j * 3 + 2] = awayPts[j * 3 + 2] + tmp.z; }
    pPos.copy(awayPos).add(tmp);
    draw(pPos, awayAx);
  }
  function hide() { group.visible = false; }
  hide();

  // defineProperties, not Object.assign: assign would read the getters once and freeze their values
  Object.defineProperties(api, Object.getOwnPropertyDescriptors({
    group, bake, showIn, showOut, capture, showAway, hide,
    get visible() { return group.visible; },
    get triangles() { let t = (M - 1) * RS * 2 + (M - 1) * 2; plug.traverse(o => { if (o.isMesh) t += o.geometry.index ? o.geometry.index.count / 3 : o.geometry.attributes.position.count / 3; }); return Math.round(t); },
    get points() { return N; },
    get anchor() { return anchor; },
    dispose() { for (const x of geos) x.dispose(); for (const m of mats) m.dispose(); },
  }));
  return api;
}
