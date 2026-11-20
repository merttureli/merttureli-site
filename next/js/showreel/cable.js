// USB-C cable for the Therma-Shift reel. Only the plug end ever shows: it flies in, lines up, seats with a stop in
// the case's port, and rests in a short run that leaves the page. Later it is pulled and the cable slides away.
//
// The plug is a real one: a stainless shell (stadium section, lead-in chamfer, the folded seam along its top flat,
// a dark mouth), a slim matte overmold with rounded edges, a ribbed strain relief, then a braided cable.
//
// The cable has no simulation and no state. Its center line is a closed-form curve of the plug pose: it leaves
// the strain relief along the plug's axis (stiff: straight at first, never tighter than about 25 mm of radius),
// sinks to the ground in an S whose length grows with the height of the plug, lies down, and runs in a lazy curve
// to the far end beyond the edge of the page. Lag comes from history, not from integration: the point where the
// cable touches down is computed from the plug pose a moment earlier, so a plug that stops keeps its cable moving
// for a beat and a plug that moves drags a loop behind it. Everything is a pure function of time (showIn, showOut)
// or of the poses it is given (showPose), so seeking, reverse play, stills and aborts are exact.
//
//   const cable = createCable({ THREE, quality, port, ground, box, renderer });   // coaster space, meters
//     port      { position, normal, depth, width, height } from coaster.js
//     ground    y of the page;  box  THREE.Box3 of the case (the cable never cuts through it)
//     renderer  (or look) optional: the materials then carry the studio look at once. Without it they pick the look
//               up at the first draw when their neighbors carry it (the hero, the case stage), and stay plain
//               otherwise (the 3D viewer)
//     timing    optional { fly, align, insert, click, out, away } seconds, to re-time the built-in moves
//     seatDepth optional: how far the overmold enters the port cutout (default 3 mm or 60% of port.depth)
//   cable.group                     add next to the coaster (same parent)
//   cable.bake(anchor)              set the far end (coaster space, on the ground, off screen). Cheap: no simulation
//   cable.pathAt(t) -> [Vector3]    the centerline at time t of the plug-in, without drawing (layout tests)
//   cable.plugIn.duration, cable.plugOut.duration, cable.plugIn.seated (the time the plug hits its stop)
//   cable.showIn(t), cable.showOut(t)   pose at t seconds into the plug-in / the pull-out (clamped)
//   cable.showPose(pos, axis, lagPos, lagAxis)
//                                   drive the plug yourself: pos is the overmold's front face, axis the unit vector
//                                   from that face back along the cable. lagPos / lagAxis (optional) are the same
//                                   pose about 0.1 s earlier: the touch-down point follows them
//   cable.seat                      Vector3: pos when seated;  cable.normal  the port's outward unit normal
//   cable.capture(), cable.showAway(k)  abort: freeze the current pose, then slide it off along the run (k 0..1)
//   cable.hide(), cable.visible, cable.baked, cable.triangles, cable.plug (the plug's Group), cable.dispose()
//
// Shadows: a soft ribbon under the plug and the cable, built like the look's contact shadows (a tight dark core at
// the contact, wider and fainter with height, swept away from the key). The look's analytic occluders are boxes
// that ride with rigid parts; a bending cable is not one, so it carries its own.
//
// Units meters. Real sizes: plug shell 8.25 x 2.4 mm, 6.65 mm long; overmold 11.4 x 5.0 x 19 mm; cable 3.6 mm.
let lookMod = null;
try { lookMod = await import('./look.js'); } catch (e) { /* no studio look: plain materials */ }

const MAXN = 44;              // center line points
const SUB = 2;                // tube rings per point
const SHELL = 0.00665;        // length of the metal shell in front of the overmold
const MOLD = 0.019;           // overmold length
const SR = 0.0305;            // overmold front face to where the cable leaves the strain relief
const KEY = [-0.62, 0.58, 0.52];   // the studio key (look.js STUDIO.key), for the shadow's sweep

export function createCable({ THREE, quality = 'high', port, ground, box, renderer = null, look = null, timing = {}, seatDepth = null }) {
  const low = quality === 'low';
  const R = low ? 0.0016 : 0.0018;                       // cable radius (3.6 mm; a touch thinner on phones)
  const group = new THREE.Group(); group.name = 'usbCable';
  const geos = [], mats = [], texs = [];
  const nrm = port.normal.clone().normalize();
  const enter = seatDepth ?? Math.min(0.003, (port.depth || 0.005) * 0.6);
  const seat = port.position.clone().addScaledVector(nrm, -enter);
  const up = new THREE.Vector3(0, 1, 0);

  // ------------------------------------------------------------------ materials
  // braid: a tangent-space normal map, two families of strands crossing over and under; it only shows close up
  function braidTexture() {
    const n = 64, h = new Float32Array(n * n), data = new Uint8Array(n * n * 4);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const u = x / n, v = y / n;
      const a = Math.abs(Math.sin(Math.PI * (u * 2 + v * 2))), b = Math.abs(Math.sin(Math.PI * (u * 2 - v * 2)));
      const over = Math.sin(Math.PI * 2 * (u * 2)) * Math.sin(Math.PI * 2 * (v * 2)) > 0 ? 1 : 0;   // which family is on top here
      h[y * n + x] = Math.max(a * (over ? 1 : 0.62), b * (over ? 0.62 : 1));
    }
    const at = (x, y) => h[((y + n) % n) * n + ((x + n) % n)];
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * 1.6, dy = (at(x, y + 1) - at(x, y - 1)) * 1.6, l = Math.hypot(dx, dy, 1), i = (y * n + x) * 4;
      data[i] = Math.round((-dx / l * 0.5 + 0.5) * 255); data[i + 1] = Math.round((-dy / l * 0.5 + 0.5) * 255); data[i + 2] = Math.round((1 / l * 0.5 + 0.5) * 255); data[i + 3] = 255;
    }
    const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
    t.anisotropy = 4; t.needsUpdate = true; texs.push(t);
    return t;
  }
  const shellMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.27, metalness: 1 });
  const moldMat = new THREE.MeshPhysicalMaterial({ color: 0x232529, roughness: 0.58, metalness: 0 });
  const tubeMat = new THREE.MeshPhysicalMaterial({ color: 0x2e3035, roughness: 0.86, metalness: 0, normalMap: low ? null : braidTexture(), normalScale: new THREE.Vector2(0.9, 0.9) });
  mats.push(shellMat, moldMat, tubeMat);
  const lookOpts = new Map([
    // (0.62: at full strength the shell's top flat mirrored the overhead panel as one white bar, with no metal left in it)
    [shellMat, { envIntensity: 0.62, micro: { gen: 'brushed', tile: 0.006, normal: 0.12, rough: 0.05 } }],
    [moldMat, { envIntensity: 1, micro: { gen: 'grain', tile: 0.005, normal: 0.22, rough: 0.08 } }],
    [tubeMat, { envIntensity: 1 }],
  ]);
  let L = null, releaseLook = null, resolved = false;
  const dressWith = l => { L = l; for (const [m, o] of lookOpts) { delete m.userData.look; L.inject(m, o); } };
  if (look) { dressWith(look); resolved = true; }
  else if (renderer && lookMod && lookMod.getLook) {
    try { const l = lookMod.getLook({ renderer, quality: low ? 'low' : 'high' }); releaseLook = () => l.release(); dressWith(l); resolved = true; } catch (e) { /* plain */ }
  } else if (lookMod && lookMod.getLook) {
    for (const m of mats) m.userData.look = 'pending';   // dressThermaShift leaves these alone; they join the look at the first draw
  } else resolved = true;
  // first draw without a renderer argument: take the look only if the neighbors already carry it
  function resolve(r) {
    resolved = true;
    for (const m of mats) if (m.userData.look === 'pending') delete m.userData.look;
    let dressed = false;
    const root = group.parent;
    if (root) root.traverse(o => { if (dressed || !o.material) return; for (const m of [].concat(o.material)) if (!mats.includes(m) && m.userData && m.userData.lookUniforms) dressed = true; });
    if (!dressed) return;
    try { const l = lookMod.getLook({ renderer: r, quality: low ? 'low' : 'high' }); releaseLook = () => l.release(); dressWith(l); } catch (e) { /* plain */ }
  }

  // ------------------------------------------------------------------ plug
  // ring of a rounded rectangle, counter-clockwise seen from +z; `seam` adds the four points of a hairline on the top flat
  const ringPts = (w, h, r, n, seam = 0) => {
    const out = [], hw = w / 2 - r, hh = h / 2 - r;
    [[hw, hh], [-hw, hh], [-hw, -hh], [hw, -hh]].forEach(([cx, cy], q) => {
      for (let i = 0; i <= n; i++) { const a = (q + i / n) * Math.PI / 2; out.push([cx + r * Math.cos(a), cy + r * Math.sin(a), 1]); }
      if (q === 0 && seam) out.push([seam * 1.6, h / 2, 1], [seam, h / 2, 0], [-seam, h / 2, 0], [-seam * 1.6, h / 2, 1]);
    });
    return out;
  };
  // loft rings (each { z, w, h, r, c }) into a smooth skin; optional flat caps; colour c times the ring point's shade
  function loft(rings, n, { capFront = false, capBack = false, seam = 0, color = false } = {}) {
    const P = rings.map(s => ringPts(s.w, s.h, Math.min(s.r, Math.min(s.w, s.h) / 2 * 0.999), n, seam)), K = P[0].length, I = rings.length;
    const pos = [], nor = [], col = [], idx = [];
    const v = (i, k) => { const p = P[i][(k + K) % K]; return [p[0], p[1], rings[i].z]; };
    for (let i = 0; i < I; i++) for (let k = 0; k < K; k++) {
      const p = v(i, k), a = v(i, k + 1), b = v(i, k - 1), c = v(Math.min(I - 1, i + 1), k), d = v(Math.max(0, i - 1), k);
      const tx = a[0] - b[0], ty = a[1] - b[1], tz = a[2] - b[2], sx = c[0] - d[0], sy = c[1] - d[1], sz = c[2] - d[2];
      let nx = ty * sz - tz * sy, ny = tz * sx - tx * sz, nz = tx * sy - ty * sx; const l = Math.hypot(nx, ny, nz) || 1;
      pos.push(p[0], p[1], p[2]); nor.push(nx / l, ny / l, nz / l);
      const s = (rings[i].c ?? 1) * (seam ? 0.42 + 0.58 * P[i][k][2] : 1); col.push(s, s, s);
    }
    for (let i = 0; i < I - 1; i++) for (let k = 0; k < K; k++) {
      const a = i * K + k, b = i * K + (k + 1) % K, c = a + K, d = b + K;
      idx.push(a, b, c, b, d, c);
    }
    const cap = (i, dir, shade) => {
      const o = pos.length / 3;
      pos.push(0, 0, rings[i].z); nor.push(0, 0, dir); col.push(shade, shade, shade);
      for (let k = 0; k < K; k++) { const p = v(i, k); pos.push(p[0], p[1], p[2]); nor.push(0, 0, dir); col.push(shade, shade, shade); }
      for (let k = 0; k < K; k++) { const a = o + 1 + k, b = o + 1 + (k + 1) % K; if (dir < 0) idx.push(o, b, a); else idx.push(o, a, b); }
    };
    if (capFront !== false) cap(0, -1, capFront === true ? (rings[0].c ?? 1) : capFront);
    if (capBack !== false) cap(I - 1, 1, capBack === true ? (rings[I - 1].c ?? 1) : capBack);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    if (color) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx); g.computeBoundingSphere(); g.computeBoundingBox();
    geos.push(g);
    return g;
  }
  const merge = list => {
    const names = Object.keys(list[0].attributes), out = new THREE.BufferGeometry();
    let count = 0, ic = 0; for (const g of list) { count += g.attributes.position.count; ic += g.index.count; }
    for (const nm of names) {
      const size = list[0].attributes[nm].itemSize, data = new Float32Array(count * size); let o = 0;
      for (const g of list) { data.set(g.attributes[nm].array, o * size); o += g.attributes.position.count; }
      out.setAttribute(nm, new THREE.BufferAttribute(data, size));
    }
    const index = new Uint16Array(ic); let o = 0, io = 0;
    for (const g of list) { for (let i = 0; i < g.index.count; i++) index[io++] = g.index.array[i] + o; o += g.attributes.position.count; }
    out.setIndex(new THREE.BufferAttribute(index, 1)); out.computeBoundingSphere(); out.computeBoundingBox();
    for (const g of list) { g.dispose(); geos.splice(geos.indexOf(g), 1); }
    geos.push(out);
    return out;
  };
  const cn = low ? 2 : 4;                                 // points per corner
  const plug = new THREE.Group(); plug.name = 'usbPlug';
  // shell: lead-in chamfer at the tip, the seam along the top flat, the rim of the mouth, the dark inside
  const sw = 0.00825, sh = 0.0024, st = 0.00028;         // width, height, wall
  const shellGeo = merge([
    loft([{ z: -SHELL, w: sw - 0.0003, h: sh - 0.0003, r: 0.00105 }, { z: -SHELL + 0.00035, w: sw, h: sh, r: 0.0012 }, { z: 0.0006, w: sw, h: sh, r: 0.0012 }], cn, { seam: 0.00008, color: true }),
    loft([{ z: -SHELL, w: sw - 0.0003, h: sh - 0.0003, r: 0.00105, c: 0.9 }, { z: -SHELL + 0.00001, w: sw - 2 * st, h: sh - 2 * st, r: 0.0009, c: 0.55 }, { z: -SHELL + 0.0016, w: sw - 2 * st, h: sh - 2 * st, r: 0.0009, c: 0.05 }], cn, { capBack: 0.04, seam: 0.00008, color: true }),
  ]);
  // the inside faces the mouth: flip the second skin's winding by drawing the material double sided
  shellMat.side = THREE.DoubleSide;
  const shellMesh = new THREE.Mesh(shellGeo, shellMat); shellMesh.name = 'usbShell';
  // overmold and strain relief: one skin, a rounded slab that draws in to a round collar, then five ribs to the cable
  const mw = Math.min(0.0114, (port.width || 0.012) - 0.0006), mh = Math.min(0.0050, (port.height || 0.0055) - 0.0005);
  const rings = [
    { z: 0, w: mw - 0.0014, h: mh - 0.0014, r: 0.0010 }, { z: 0.00025, w: mw - 0.0006, h: mh - 0.0006, r: 0.0012 }, { z: 0.0007, w: mw, h: mh, r: 0.0014 },
    { z: 0.0125, w: mw, h: mh, r: 0.0014 }, { z: 0.0150, w: mw - 0.0012, h: mh, r: 0.0019 }, { z: 0.0172, w: mw - 0.0040, h: mh + 0.0002, r: 0.0024 },
    { z: MOLD, w: 0.0056, h: 0.0056, r: 0.0028 },
  ];
  const ribs = low ? 3 : 5, z0 = MOLD, len = SR - MOLD, pitch = len / (ribs + 0.35);
  for (let i = 0; i < ribs; i++) {
    const a = z0 + pitch * i, rOut = 0.0027 - (0.0027 - R - 0.00045) * (i + 0.5) / ribs, rIn = rOut - 0.00032;
    rings.push({ z: a + pitch * 0.08, w: rOut * 2, h: rOut * 2, r: rOut }, { z: a + pitch * 0.62, w: rOut * 2, h: rOut * 2, r: rOut },
      { z: a + pitch * 0.72, w: rIn * 2, h: rIn * 2, r: rIn }, { z: a + pitch * 0.96, w: rIn * 2, h: rIn * 2, r: rIn });
  }
  rings.push({ z: SR - 0.0004, w: (R + 0.0003) * 2, h: (R + 0.0003) * 2, r: R + 0.0003 }, { z: SR, w: R * 2, h: R * 2, r: R });
  const moldGeo = loft(rings, cn, { capFront: true, capBack: true });
  const moldMesh = new THREE.Mesh(moldGeo, moldMat); moldMesh.name = 'usbOvermold';
  plug.add(shellMesh, moldMesh);
  group.add(plug);

  // ------------------------------------------------------------------ tube + shadow ribbon
  const RS = low ? 6 : 8, MMAX = (MAXN - 1) * SUB + 1, RC = RS + 1;
  const tubePos = new Float32Array(MMAX * RC * 3), tubeNrm = new Float32Array(MMAX * RC * 3), tubeUv = new Float32Array(MMAX * RC * 2);
  const idx = [];
  for (let i = 0; i < MMAX - 1; i++) for (let j = 0; j < RS; j++) {
    const a = i * RC + j, b = a + 1, c = a + RC, d = b + RC;
    idx.push(a, b, c, b, d, c);                              // outward: the old tube was wound inside out
  }
  const tubeGeo = new THREE.BufferGeometry();
  tubeGeo.setAttribute('position', new THREE.BufferAttribute(tubePos, 3).setUsage(THREE.DynamicDrawUsage));
  tubeGeo.setAttribute('normal', new THREE.BufferAttribute(tubeNrm, 3).setUsage(THREE.DynamicDrawUsage));
  tubeGeo.setAttribute('uv', new THREE.BufferAttribute(tubeUv, 2).setUsage(THREE.DynamicDrawUsage));
  tubeGeo.setIndex(idx); geos.push(tubeGeo);
  const tube = new THREE.Mesh(tubeGeo, tubeMat); tube.name = 'cableTube'; tube.frustumCulled = false;
  tube.onBeforeRender = r => { if (!resolved) resolve(r); };
  // shadow ribbon: PL rows under the plug, then one per tube ring; x across in -1..1, alpha per row
  const PL = 4, SM = MMAX + PL;
  const shPos = new Float32Array(SM * 2 * 3), shA = new Float32Array(SM * 2 * 2);
  const shIdx = [];
  for (let i = 0; i < SM - 1; i++) { const a = i * 2; shIdx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  const shGeo = new THREE.BufferGeometry();
  shGeo.setAttribute('position', new THREE.BufferAttribute(shPos, 3).setUsage(THREE.DynamicDrawUsage));
  shGeo.setAttribute('aShade', new THREE.BufferAttribute(shA, 2).setUsage(THREE.DynamicDrawUsage));
  shGeo.setIndex(shIdx); geos.push(shGeo);
  const shMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: { uOpacity: { value: 1 } },
    vertexShader: 'attribute vec2 aShade; varying vec2 vS; void main() { vS = aShade; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform float uOpacity; varying vec2 vS; void main() { float a = vS.y * exp(-3.4 * vS.x * vS.x) * uOpacity; if (a < 0.003) discard; gl_FragColor = vec4(0.0, 0.0, 0.0, a); }',
  });
  mats.push(shMat);
  const shadow = new THREE.Mesh(shGeo, shMat); shadow.name = 'cableShadow'; shadow.renderOrder = -1; shadow.frustumCulled = false;
  shadow.userData.lookNoShadow = true; shadow.userData.lookSkip = true;
  shadow.onBeforeRender = () => { shMat.uniforms.uOpacity.value = shMat.opacity; };   // the 3D viewer ghosts the cable through material.opacity
  group.add(tube, shadow);

  // ------------------------------------------------------------------ the built-in moves (pure functions of t)
  const T = { fly: 0.95, align: 0.14, insert: 0.13, click: 0.12, out: 0.22, away: 1.1, ...timing };
  const N = MAXN, M = MMAX;
  const anchor = new THREE.Vector3(), out = new THREE.Vector3(), exitPt = new THREE.Vector3();
  let runLen = 0, runL = 0.3;
  const pre = seat.clone().addScaledVector(nrm, 0.012 + enter);          // lined up, 12 mm clear of the wall
  const A0 = new THREE.Vector3(), A1 = new THREE.Vector3(), A2 = new THREE.Vector3();
  const D0 = seat.clone().addScaledVector(nrm, 0.022 + enter), D1 = new THREE.Vector3(), D2 = new THREE.Vector3(), D3 = new THREE.Vector3();
  const farIn0 = new THREE.Vector3(), farOut1 = new THREE.Vector3();
  const bez = (a, b, c, d, t, o) => {
    const u = 1 - t;
    return o.set(0, 0, 0).addScaledVector(a, u * u * u).addScaledVector(b, 3 * u * u * t).addScaledVector(c, 3 * u * t * t).addScaledVector(d, t * t * t);
  };
  const cl = t => (t < 0 ? 0 : t > 1 ? 1 : t);
  const eArrive = t => 1 - (1 - t) ** 4;                  // fast start, long soft landing
  const eIn = t => t * t, eIO = t => (t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
  const _a = new THREE.Vector3(), _b = new THREE.Vector3();
  const tSeat = () => T.fly + T.align + T.insert;
  // plug front-face position, cable axis (plug +z) and far-end position at time t of the plug-in
  function plugInPose(t, pos, axis, far) {
    const s = eArrive(cl(t / T.fly));
    if (t < T.fly) {
      bez(A0, A1, A2, pre, s, pos);
      bez(A0, A1, A2, pre, Math.min(1, s + 0.01), _a); bez(A0, A1, A2, pre, Math.max(0, s - 0.01), _b);
      axis.subVectors(_b, _a);                                    // head leads, cable trails
      if (axis.lengthSq() < 1e-12) axis.copy(nrm); else axis.normalize();
      axis.lerp(nrm, cl((t / T.fly - 0.35) / 0.5) ** 2).normalize();
    } else if (t < T.fly + T.align) {
      // lined up: a breath of drift onto the port's axis before the push
      const k = cl((t - T.fly) / T.align);
      pos.copy(pre).addScaledVector(nrm, -0.0012 * eIO(k)); axis.copy(nrm);
    } else if (t < tSeat()) {
      const k = cl((t - T.fly - T.align) / T.insert);              // the push: gathers speed, then meets the stop
      _a.copy(pre).addScaledVector(nrm, -0.0012);
      pos.lerpVectors(_a, seat, k * k * (2.2 - 1.2 * k)); axis.copy(nrm);
    } else {
      const k = cl((t - tSeat()) / T.click);                       // the stop: a quarter millimeter back, then home
      pos.copy(seat).addScaledVector(nrm, 0.00025 * Math.sin(Math.PI * k) * (1 - k)); axis.copy(nrm);
    }
    if (far) far.lerpVectors(farIn0, anchor, s);                  // the far end is fed in, off screen
    return pos;
  }
  function plugOutPose(t, pos, axis, far) {
    if (t < T.out) {
      const k = cl(t / T.out);                                     // a short pull to break the latch, then it comes free
      pos.lerpVectors(seat, D0, k * k * (3 - 2 * k)); axis.copy(nrm);
    } else {
      const s = eIn(cl((t - T.out) / T.away));
      bez(D0, D1, D2, D3, s, pos);
      bez(D0, D1, D2, D3, Math.min(1, s + 0.01), _a); bez(D0, D1, D2, D3, Math.max(0, s - 0.01), _b);
      axis.subVectors(_a, _b); if (axis.lengthSq() < 1e-12) axis.copy(out); else axis.normalize();   // the cable leads now
      axis.lerp(nrm, 1 - cl((t - T.out) / 0.3)).normalize();
    }
    if (far) far.lerpVectors(anchor, farOut1, eIn(cl((t - T.out * 0.5) / T.away)));
    return pos;
  }
  const api = { plugIn: { duration: 2.6, seated: 0 }, plugOut: { duration: 1.6 }, baked: false };
  // Set the far end (coaster space, on the ground beyond the edge of the page). Resize-time only; no simulation.
  function bake(a) {
    anchor.copy(a); anchor.y = ground + R;
    exitPt.copy(seat).addScaledVector(nrm, SR + 0.004);
    out.subVectors(anchor, exitPt); out.y = 0; runLen = out.length(); out.normalize();
    runL = Math.max(0.05, runLen * 1.05 + SR);
    // arrival: from just beyond the far end, a low arc toward the port, the last leg straight along -normal
    A0.copy(anchor).addScaledVector(out, 0.04).addScaledVector(up, 0.05);
    A1.copy(exitPt).lerp(anchor, 0.55).addScaledVector(up, 0.06);
    A2.copy(pre).addScaledVector(nrm, 0.07).addScaledVector(up, 0.012);
    farIn0.copy(anchor).addScaledVector(out, runL * 0.9);
    // departure: straight out, then low along the run and past the far end
    D1.copy(D0).addScaledVector(nrm, 0.04).addScaledVector(up, 0.01);
    D2.copy(D0).lerp(anchor, 0.6).addScaledVector(up, 0.02);
    D3.copy(anchor).addScaledVector(out, 0.12).addScaledVector(up, 0.01);
    farOut1.copy(anchor).addScaledVector(out, runL + 0.12);
    api.plugIn.seated = tSeat(); api.plugIn.duration = Math.max(2.6, tSeat() + T.click + 1.1);
    api.plugOut.duration = Math.max(1.6, T.out + T.away + 0.1);
    tubeGeo.setDrawRange(0, (M - 1) * RS * 6);
    shGeo.setDrawRange(0, (SM - 1) * 6);
    api.baked = true;
  }

  // ------------------------------------------------------------------ the cable's shape: a pure function of poses
  const pts = new Float32Array(MAXN * 3);
  const E = new THREE.Vector3(), El = new THREE.Vector3(), axh = new THREE.Vector3(), dirF = new THREE.Vector3(), dirG = new THREE.Vector3(), dirT = new THREE.Vector3();
  const G = new THREE.Vector3(), b1 = new THREE.Vector3(), b2 = new THREE.Vector3(), c1 = new THREE.Vector3(), c2 = new THREE.Vector3(), perp = new THREE.Vector3(), tmp = new THREE.Vector3();
  const gy = ground + R;
  const bx0 = box.min.x - R - 0.002, bx1 = box.max.x + R + 0.002, bz0 = box.min.z - R - 0.002, bz1 = box.max.z + R + 0.002, by1 = box.max.y + R;
  const smoother = u => u * u * u * (u * (u * 6 - 15) + 10);
  // pos, axis: the plug now. lpos, laxis: the plug a moment ago (the touch-down follows it). far: the far end.
  // wob: meters, a small bow of the hanging part (the settle after the stop).
  function shape(pos, axis, lpos, laxis, far, wob) {
    E.copy(pos).addScaledVector(axis, SR);
    El.copy(lpos).addScaledVector(laxis, SR);
    const h = Math.max(0, E.y - gy), hl = Math.max(0, El.y - gy);
    axh.set(laxis.x, 0, laxis.z); if (axh.lengthSq() < 0.04) axh.copy(out); axh.normalize();
    dirF.set(far.x - El.x, 0, far.z - El.z); const dist = dirF.length() || 1e-6; dirF.multiplyScalar(1 / dist);
    // the sag: longer for a higher plug (a stiff cable), never past most of the way to the far end
    const Ls = Math.min(0.058 * Math.pow(Math.max(hl, 0.004) / 0.0177, 0.4), dist * 0.62);
    dirG.copy(axh).multiplyScalar(0.62).addScaledVector(dirF, 0.38).normalize();
    dirT.copy(axh).multiplyScalar(0.25).addScaledVector(dirF, 0.75).normalize();
    G.set(El.x + dirG.x * Ls, gy, El.z + dirG.z * Ls);
    // hanging part: leaves along the plug's own axis, lands along dirT
    tmp.set(axis.x, 0, axis.z); const al = tmp.length() || 1; tmp.multiplyScalar(1 / al);
    b1.copy(E).addScaledVector(tmp, Ls * 0.46); b2.copy(G).addScaledVector(dirT, -Ls * 0.36);
    const d2 = Math.hypot(far.x - G.x, far.z - G.z);
    c1.copy(G).addScaledVector(dirT, d2 * 0.34); c2.copy(far).addScaledVector(out, -d2 * 0.34);
    perp.set(-dirF.z, 0, dirF.x);
    const slack = Math.min(0.011, d2 * 0.05);
    const n1 = Math.max(7, Math.min(N - 10, Math.round(N * Ls * 1.5 / (Ls * 1.5 + d2 + 1e-6))));
    for (let i = 0; i < N; i++) {
      const o = i * 3;
      if (i <= n1) {
        const u = i / n1, v = 1 - u;
        const x = v * v * v * E.x + 3 * v * v * u * b1.x + 3 * v * u * u * b2.x + u * u * u * G.x;
        const z = v * v * v * E.z + 3 * v * v * u * b1.z + 3 * v * u * u * b2.z + u * u * u * G.z;
        let y = gy + h * (1 - smoother(u)) + axis.y * Ls * 0.9 * u * v * v * v + wob * Math.sin(Math.PI * u) * v;
        if (y < gy) y = gy;
        pts[o] = x; pts[o + 1] = y; pts[o + 2] = z;
      } else {
        const u = (i - n1) / (N - 1 - n1), v = 1 - u, s = slack * Math.sin(Math.PI * 2 * u) * u * u * (3 - 2 * u);   // a lazy S, tangent at the touch-down
        pts[o] = v * v * v * G.x + 3 * v * v * u * c1.x + 3 * v * u * u * c2.x + u * u * u * far.x + perp.x * s;
        pts[o + 1] = gy;
        pts[o + 2] = v * v * v * G.z + 3 * v * v * u * c1.z + 3 * v * u * u * c2.z + u * u * u * far.z + perp.z * s;
      }
      // never through the case: out by the nearest wall
      const x = pts[o], y = pts[o + 1], z = pts[o + 2];
      if (i > 2 && x > bx0 && x < bx1 && z > bz0 && z < bz1 && y < by1) {
        const m = Math.min(x - bx0, bx1 - x, z - bz0, bz1 - z);
        if (m === bz1 - z) pts[o + 2] = bz1; else if (m === z - bz0) pts[o + 2] = bz0; else if (m === x - bx0) pts[o] = bx0; else pts[o] = bx1;
      }
    }
  }

  // ------------------------------------------------------------------ drawing
  const cur = new THREE.Vector3(), nxt = new THREE.Vector3(), tan = new THREE.Vector3(), nor = new THREE.Vector3(), bin = new THREE.Vector3();
  const mtx = new THREE.Matrix4(), qw = new THREE.Quaternion(), kd = new THREE.Vector3();
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
  // one shadow row: center c at height hgt above the page, half width hw of the thing casting, direction `side`
  function shadowRow(row, c, hgt, hw, side, gain) {
    // the look's terms: a tight core at the contact, the key's shadow swept away and widening with height
    const w = hw * 1.5 + 0.0012 + 0.24 * hgt, al = gain * (0.40 / (1 + hgt / 0.007) + 0.16 / (1 + hgt / 0.05));
    const sx = c.x + kd.x * hgt, sz = c.z + kd.z * hgt, so = row * 6, ao = row * 4;
    shPos[so] = sx + side.x * w * 1.9; shPos[so + 1] = ground + 0.0003; shPos[so + 2] = sz + side.z * w * 1.9;
    shPos[so + 3] = sx - side.x * w * 1.9; shPos[so + 4] = ground + 0.0003; shPos[so + 5] = sz - side.z * w * 1.9;
    shA[ao] = 1; shA[ao + 1] = al; shA[ao + 2] = -1; shA[ao + 3] = al;
  }
  function draw(plugPos, plugAxis) {
    orient(plug, plugPos, plugAxis);
    // the key's sweep per meter of height, in this group's frame (the stage turns under a fixed studio)
    group.getWorldQuaternion(qw); kd.set(KEY[0], KEY[1], KEY[2]).normalize().applyQuaternion(qw.invert());
    const ky = Math.max(0.35, kd.y); kd.set(-kd.x / ky * 0.5, 0, -kd.z / ky * 0.5);
    // under the plug: PL rows from the shell's tip to the strain relief
    tmp.set(-plugAxis.z, 0, plugAxis.x); if (tmp.lengthSq() < 1e-10) tmp.set(1, 0, 0); tmp.normalize(); nor.copy(tmp);
    for (let r = 0; r < PL; r++) {
      const k = r / (PL - 1), zz = -SHELL + (SR * 0.8 + SHELL) * k;      // stops short of the cable's first row (no fold)
      cur.copy(plugPos).addScaledVector(plugAxis, zz);
      const hw = k < 0.2 ? 0.0041 : k < 0.7 ? 0.0057 : 0.0057 - (0.0057 - R) * (k - 0.7) / 0.3;
      shadowRow(r, cur, Math.max(0, cur.y - ground - 0.0025), hw, nor, r === 0 ? 0 : 1);
    }
    crAt(0, cur); crAt(1 / SUB, nxt); tan.subVectors(nxt, cur).normalize();
    nor.crossVectors(tan, up); if (nor.lengthSq() < 1e-8) nor.set(1, 0, 0); nor.normalize();
    let len = 0, px = 0, py = 0, pz = 0;
    for (let r = 0; r < M; r++) {
      const u = r / SUB;
      crAt(u, cur);
      crAt(Math.min(N - 1, u + 0.25), nxt); tmp.copy(nxt); crAt(Math.max(0, u - 0.25), nxt); tan.subVectors(tmp, nxt);
      if (tan.lengthSq() > 1e-14) tan.normalize();
      nor.addScaledVector(tan, -nor.dot(tan)); if (nor.lengthSq() < 1e-10) nor.crossVectors(tan, up); nor.normalize();   // parallel transport
      bin.crossVectors(tan, nor);
      if (r) len += Math.hypot(cur.x - px, cur.y - py, cur.z - pz);
      px = cur.x; py = cur.y; pz = cur.z;
      for (let j = 0; j < RC; j++) {
        const a = (j % RS) / RS * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a), o = (r * RC + j) * 3, uo = (r * RC + j) * 2;
        const nx = nor.x * ca + bin.x * sa, ny = nor.y * ca + bin.y * sa, nz = nor.z * ca + bin.z * sa;
        tubeNrm[o] = nx; tubeNrm[o + 1] = ny; tubeNrm[o + 2] = nz;
        tubePos[o] = cur.x + nx * R; tubePos[o + 1] = cur.y + ny * R; tubePos[o + 2] = cur.z + nz * R;
        tubeUv[uo] = j / RS * 2; tubeUv[uo + 1] = len / 0.0052;
      }
      tmp.set(-tan.z, 0, tan.x); if (tmp.lengthSq() < 1e-10) tmp.set(1, 0, 0); tmp.normalize();
      shadowRow(PL + r, cur, Math.max(0, cur.y - ground - R), R, tmp, 1);
    }
    tubeGeo.attributes.position.needsUpdate = true; tubeGeo.attributes.normal.needsUpdate = true; tubeGeo.attributes.uv.needsUpdate = true;
    shGeo.attributes.position.needsUpdate = true; shGeo.attributes.aShade.needsUpdate = true;
    group.visible = true;
  }
  const pPos = new THREE.Vector3(), pAx = new THREE.Vector3(), lPos = new THREE.Vector3(), lAx = new THREE.Vector3(), fPos = new THREE.Vector3(), fl = new THREE.Vector3();
  const LAG = 0.1;                                          // seconds: the touch-down follows the plug this much later
  function showIn(t) {
    if (!api.baked) return hide();
    t = Math.max(0, Math.min(t, api.plugIn.duration));
    plugInPose(t, pPos, pAx, fPos); plugInPose(Math.max(0, t - LAG), lPos, lAx, fl);
    // the settle: the hanging part bows once after the stop and comes to rest
    const ts = t - tSeat(), wob = ts > 0 ? 0.0032 * Math.exp(-ts / 0.2) * Math.sin(ts * 21) : 0;
    shape(pPos, pAx, lPos, lAx, fPos, wob); draw(pPos, pAx);
  }
  function showOut(t) {
    if (!api.baked) return hide();
    t = Math.max(0, Math.min(t, api.plugOut.duration));
    plugOutPose(t, pPos, pAx, fPos); plugOutPose(Math.max(0, t - LAG), lPos, lAx, fl);
    shape(pPos, pAx, lPos, lAx, fPos, 0); draw(pPos, pAx);
  }
  // drive the plug from outside: a pure function of the poses given
  function showPose(pos, axis, lagPos = null, lagAxis = null, far = null) {
    if (!api.baked) return hide();
    pPos.copy(pos); pAx.copy(axis).normalize();
    lPos.copy(lagPos || pos); lAx.copy(lagAxis || axis).normalize();
    shape(pPos, pAx, lPos, lAx, far || anchor, 0); draw(pPos, pAx);
  }
  // The centerline at time t of the plug-in (this group's frame), computed without drawing: the layout tests the real
  // drape, not a straight line. Uses its own pose vectors, so capture() and the next draw are unaffected.
  const qP = new THREE.Vector3(), qA = new THREE.Vector3(), qL = new THREE.Vector3(), qLA = new THREE.Vector3(), qF = new THREE.Vector3(), qF2 = new THREE.Vector3();
  function pathAt(t, o = []) {
    if (!api.baked) return o;
    t = Math.max(0, Math.min(t, api.plugIn.duration));
    plugInPose(t, qP, qA, qF); plugInPose(Math.max(0, t - LAG), qL, qLA, qF2);
    shape(qP, qA, qL, qLA, qF, 0);
    for (let i = 0; i < N; i++) o.push(new THREE.Vector3(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]));
    return o;
  }
  // abort: pull the plug 12 mm straight out, then slide the whole run off along its own line, past the far end
  const awayPos = new THREE.Vector3(), awayAx = new THREE.Vector3(), awayFar = new THREE.Vector3(), aP = new THREE.Vector3(), aA = new THREE.Vector3();
  function capture() { awayPos.copy(pPos); awayAx.copy(pAx); awayFar.copy(fPos.lengthSq() ? fPos : anchor); }
  function showAway(k) {
    if (k >= 1 || !api.baked) { hide(); return; }
    const pull = (0.012 + enter) * Math.min(1, k / 0.15), slide = (runLen + 0.08) * Math.max(0, (k - 0.12) / 0.88) ** 2;
    tmp.copy(nrm).multiplyScalar(pull).addScaledVector(out, slide);
    aP.copy(awayPos).add(tmp); aA.copy(awayAx); fl.copy(awayFar).addScaledVector(out, slide);
    shape(aP, aA, aP, aA, fl, 0); draw(aP, aA);
  }
  function hide() { group.visible = false; }
  hide();

  // defineProperties, not Object.assign: assign would read the getters once and freeze their values
  Object.defineProperties(api, Object.getOwnPropertyDescriptors({
    group, plug, bake, pathAt, showIn, showOut, showPose, capture, showAway, hide, seat, normal: nrm, timing: T,
    get visible() { return group.visible; },
    get triangles() { let t = (M - 1) * RS * 2 + (SM - 1) * 2; plug.traverse(o => { if (o.isMesh) t += o.geometry.index ? o.geometry.index.count / 3 : o.geometry.attributes.position.count / 3; }); return Math.round(t); },
    get points() { return N; },
    get anchor() { return anchor; },
    dispose() { for (const x of geos) x.dispose(); for (const m of mats) m.dispose(); for (const t of texs) t.dispose(); if (releaseLook) releaseLook(); },
  }));
  return api;
}
