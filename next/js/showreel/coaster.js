// Therma-Shift coaster: procedural stand-in for the owner's CAD (to be replaced by the real model later; keep the API).
//
// Units metres, +Y up. The top surface centre of the aluminium plate is the group origin (0,0,0); the shell hangs below to
// y = -0.0453. Footprint 0.112 x 0.106 m.
//
// export default create({ THREE, renderer, quality }) -> {
//   group, duration,
//   setProgress(p)          0 = fully exploded, 1 = assembled. Pure function of p, staggered smootherstep arrivals in build
//                           order (shell, blower, board, heatsink, peltier, thermistor, topPlate, screws). The board and
//                           thermistor slide in over the rim first, then drop. At p = 1 the covered Peltier and
//                           thermistor are hidden (visible = false) to save draws.
//   update(dt, time)        spins the blower rotor at the speed set by setFanSpeed (0 by default, so it is a no-op).
//   setPlateTemperature(c)  degrees C, 0..70. Tints the top plate only: neutral aluminium near 22 C, warm amber above
//                           about 40 C, cool blue-white below about 15 C. Subtle by design.
//   setFanSpeed(rps)        blower rotor revolutions per second for update().
//   setShadowOpacity(a)     baked soft contact shadow under the shell (0..1, default 1). The decal is `shadow`; it rides
//                           with the shell part, so hide it while the coaster is airborne.
//   getParts()              [{ name, mesh, explode }] in build order. `mesh` is the part's Object3D (a Group), `explode`
//                           the exploded-view offset (Vector3, metres) added to its assembled position at p = 0. The
//                           vectors are live: tweak them and call setProgress again.
//   parts                   { shell, topPlate, peltier, heatsink, blower, thermistor, board, screws } by name.
//   triangles               triangle count of the whole model (for the budget check).
//   dispose()
// }
import * as THREE_ from '../three.module.min.js';

// --------------------------------------------------------------------------------------------- dimensions (m)
const W = 0.112, D = 0.106, H = 0.045;           // shell outer
const HW = W / 2, HD = D / 2;
const R = 0.005, T = 0.0025;                     // shell corner radius, wall
const LID = 0.0065;                              // lid band height below the plate top
const PW = 0.100, PD = 0.094, PT = 0.003;        // aluminium plate
const STACK_X = -0.004;                          // Peltier / heatsink / blower centre line (board sits at +x)
const PEL = 0.040, PEL_T = 0.0036;               // TEC1-12703
const HS_W = 0.050, HS_D = 0.044, HS_B = 0.004, HS_F = 0.013, HS_N = 13;
const FAN = 0.040, FAN_T = 0.010;
const Y_PEL = -PT, Y_HS = -PT - PEL_T, Y_FAN = Y_HS - HS_B - HS_F - 0.0012;

export default function create({ THREE = THREE_, renderer, quality = 'high' } = {}) {
  const low = quality === 'low';
  const SEG = low ? 3 : 6;                        // segments per quarter round
  const group = new THREE.Group();
  group.name = 'thermaShiftCoaster';
  const geos = [], mats = [], texs = [];
  const track = (g) => (geos.push(g), g);

  // ------------------------------------------------------------------------------------------- materials
  const M = (o, phys) => { const m = phys ? new THREE.MeshPhysicalMaterial(o) : new THREE.MeshStandardMaterial(o); mats.push(m); return m; };
  const mat = {
    shell: M({ color: 0x6d717c, roughness: 0.74, metalness: 0, vertexColors: true }),
    plate: M({ color: 0xd3d7dd, roughness: 0.4, metalness: 0.6, emissive: 0x000000 }),
    ceramic: M({ color: 0xc4874f, roughness: 0.74, metalness: 0 }),   // orange, sampled from the owner's render
    pellets: M({ color: 0xa96b38, roughness: 0.7, metalness: 0 }),
    sealant: M({ color: 0xbd7c45, roughness: 0.8, metalness: 0 }),
    sink: M({ color: 0xc0c5cd, roughness: 0.42, metalness: 0.6 }),     // satin aluminium, sampled from the render
    fan: M({ color: 0x2a2c31, roughness: 0.62, metalness: 0 }),
    blade: M({ color: 0x1b1c20, roughness: 0.55, metalness: 0 }),
    label: M({ color: 0x3b3e45, roughness: 0.5, metalness: 0 }),
    pcb: M({ color: 0x2d6b59, roughness: 0.55, metalness: 0.05 }),
    chip: M({ color: 0x141518, roughness: 0.45, metalness: 0 }),
    steel: M({ color: 0xbfc3c8, roughness: 0.34, metalness: 0.9 }),
    socket: M({ color: 0x2c2e33, roughness: 0.5, metalness: 0.6 }),
    red: M({ color: 0xa8231b, roughness: 0.5, metalness: 0 }),
    black: M({ color: 0x17181b, roughness: 0.5, metalness: 0 }),
    epoxy: M({ color: 0x15161a, roughness: 0.32, metalness: 0 }),
    kapton: M({ color: 0xc27a1c, roughness: 0.35, metalness: 0, transparent: true, opacity: 0.78 }),
    led: M({ color: 0x2bd46d, roughness: 0.4, metalness: 0, emissive: 0x22c25e, emissiveIntensity: 0.7 }),
  };

  // ------------------------------------------------------------------------------------------- geometry helpers
  // Rounded rectangle path points (x, y) in shape space, counter-clockwise, n segments per corner.
  function rrPoints(w, h, r, cx = 0, cy = 0, n = SEG) {
    const pts = [], hw = w / 2, hh = h / 2;
    r = Math.min(r, hw, hh);
    const corners = [[hw - r, hh - r, 0], [-hw + r, hh - r, 0.5], [-hw + r, -hh + r, 1], [hw - r, -hh + r, 1.5]];
    for (const [x, y, a0] of corners) {
      for (let i = 0; i <= n; i++) {
        const a = (a0 + i / n * 0.5) * Math.PI;
        pts.push(new THREE.Vector2(cx + x + Math.cos(a) * r, cy + y + Math.sin(a) * r));
      }
    }
    return pts;
  }
  const rrShape = (w, h, r, cx, cy, n) => new THREE.Shape(rrPoints(w, h, r, cx, cy, n));
  const rrPath = (w, h, r, cx, cy, n) => new THREE.Path(rrPoints(w, h, r, cx, cy, n));
  const circlePath = (r, cx, cy, n = 12) => { const pts = []; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; pts.push(new THREE.Vector2(cx + Math.cos(a) * r, cy + Math.sin(a) * r)); } return new THREE.Path(pts); };

  // Extrude a shape (shape space x,y = world x,-z) upward along +Y from y0 with an optional chamfer c. The chamfer grows
  // the outline by c, so pass outlines already inset by c.
  function extrudeY(shape, depth, y0, c = 0, n = SEG) {
    const g = new THREE.ExtrudeGeometry(shape, {
      depth: Math.max(depth - 2 * c, 1e-5), curveSegments: n, steps: 1,
      bevelEnabled: c > 0, bevelThickness: c, bevelSize: c, bevelOffset: 0, bevelSegments: 1,
    });
    g.rotateX(-Math.PI / 2);                        // shape y -> world -z, extrude z -> world +y
    g.translate(0, y0 + c, 0);
    return g;
  }
  // Chamfered box centred at (x, y, z).
  function cbox(w, h, d, c, x = 0, y = 0, z = 0, r = 0) {
    const s = r > 0 ? rrShape(w - 2 * c, d - 2 * c, Math.max(r - c, 0.0002), 0, 0, 2) : chamferRect(w - 2 * c, d - 2 * c, c * 0.8);
    const g = extrudeY(s, h, y - h / 2, c, 2);
    g.translate(x, 0, -0 + z);
    return g;
  }
  function chamferRect(w, d, k) {
    const hw = w / 2, hd = d / 2;
    return new THREE.Shape([[hw - k, hd], [-hw + k, hd], [-hw, hd - k], [-hw, -hd + k], [-hw + k, -hd], [hw - k, -hd], [hw, -hd + k], [hw, hd - k]].map(([a, b]) => new THREE.Vector2(a, b)));
  }

  // Smooth normals across facets that meet at less than `deg`, keep hard edges (chamfers, corners) crisp.
  function smooth(g, deg = 40) {
    if (g.index) g = g.toNonIndexed();
    const pos = g.attributes.position, n = pos.count, cosT = Math.cos(deg * Math.PI / 180);
    const fn = new Float32Array(n * 3), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    for (let i = 0; i < n; i += 3) {
      a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
      c.sub(b); a.sub(b); c.cross(a);                // area-weighted face normal
      for (let k = 0; k < 3; k++) { fn[(i + k) * 3] = c.x; fn[(i + k) * 3 + 1] = c.y; fn[(i + k) * 3 + 2] = c.z; }
    }
    const map = new Map(), key = (i) => `${Math.round(pos.getX(i) * 2e5)},${Math.round(pos.getY(i) * 2e5)},${Math.round(pos.getZ(i) * 2e5)}`;
    for (let i = 0; i < n; i++) { const k = key(i); let l = map.get(k); if (!l) map.set(k, l = []); l.push(i); }
    const out = new Float32Array(n * 3);
    for (const list of map.values()) {
      for (const i of list) {
        const ix = fn[i * 3], iy = fn[i * 3 + 1], iz = fn[i * 3 + 2], il = Math.hypot(ix, iy, iz) || 1;
        let sx = 0, sy = 0, sz = 0;
        for (const j of list) {
          const jx = fn[j * 3], jy = fn[j * 3 + 1], jz = fn[j * 3 + 2], jl = Math.hypot(jx, jy, jz) || 1;
          if ((ix * jx + iy * jy + iz * jz) / (il * jl) >= cosT) { sx += jx; sy += jy; sz += jz; }
        }
        const l = Math.hypot(sx, sy, sz) || 1;
        out[i * 3] = sx / l; out[i * 3 + 1] = sy / l; out[i * 3 + 2] = sz / l;
      }
    }
    g.setAttribute('normal', new THREE.BufferAttribute(out, 3));
    g.deleteAttribute('uv');
    return g;
  }
  // Concatenate non-indexed geometries (position + normal [+ color]).
  function merge(list, withColor = false) {
    list = list.map((g) => { if (g.index) g = g.toNonIndexed(); if (!g.attributes.normal) g.computeVertexNormals(); return g; });
    const total = list.reduce((s, g) => s + g.attributes.position.count, 0);
    const hasColor = withColor || list.some((g) => g.attributes.color);
    const P = new Float32Array(total * 3), N = new Float32Array(total * 3), C = hasColor ? new Float32Array(total * 3).fill(1) : null;
    let o = 0;
    for (const g of list) {
      const c = g.attributes.position.count;
      P.set(g.attributes.position.array, o * 3); N.set(g.attributes.normal.array, o * 3);
      if (C && g.attributes.color) C.set(g.attributes.color.array, o * 3);
      o += c; g.dispose();
    }
    const m = new THREE.BufferGeometry();
    m.setAttribute('position', new THREE.BufferAttribute(P, 3));
    m.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    if (C) m.setAttribute('color', new THREE.BufferAttribute(C, 3));
    m.computeBoundingSphere();
    return track(m);
  }
  const mesh = (g, m, name) => { const o = new THREE.Mesh(g, m); o.name = name || ''; o.matrixAutoUpdate = false; o.updateMatrix(); return o; };
  const part = (name) => { const p = new THREE.Group(); p.name = name; group.add(p); return p; };

  // ------------------------------------------------------------------------------------------- shell
  // Printed blue-grey box: lid band with a recessed pocket for the plate, a fine seam groove, walls with rounded corners,
  // the +X side wall carries the USB-C port, the side vent slot and a round port; the floor has intake slots and sits on a
  // slightly inset plinth. Interior faces are darkened through vertex colours (cheap baked occlusion).
  const shell = part('shell');
  {
    const parts = [];
    const lidTop = 0.0011, lidBot = -LID, c = 0.0007;
    // Lid band (chamfered top and bottom edge: the bottom chamfer plus the groove ring reads as the lid seam).
    const lidShape = rrShape(W - 2 * c, D - 2 * c, R - c);
    lidShape.holes.push(rrPath(PW + 0.0006 + 2 * c, PD + 0.0006 + 2 * c, 0.002 + c));
    parts.push(extrudeY(lidShape, lidTop - lidBot, lidBot, c));
    // Ledge the plate rests on, hidden under it.
    const ledge = rrShape(PW, PD, 0.002); ledge.holes.push(rrPath(PW - 0.008, PD - 0.008, 0.002));
    parts.push(extrudeY(ledge, 0.0015, -PT - 0.0015));
    // Seam groove: a slightly inset ring between lid band and body.
    const gap = 0.0007, grooveShape = rrShape(W - 0.0012, D - 0.0012, R - 0.0006);
    grooveShape.holes.push(rrPath(W - 2 * T, D - 2 * T, R - T));
    parts.push(extrudeY(grooveShape, gap, lidBot - gap));
    // Body: a C-shaped ring (everything except the straight part of the +X wall) plus the +X wall with real holes.
    const yb = -H + 0.0012, yt = lidBot - gap, hBody = yt - yb;
    const arc = (cx, cz, r, a0, a1, out) => { for (let i = 0; i <= SEG; i++) { const a = a0 + (a1 - a0) * i / SEG; out.push(new THREE.Vector2(cx + Math.cos(a) * r, -(cz + Math.sin(a) * r))); } };
    const cpts = [], P2 = Math.PI / 2;
    // outer, world (x,z) angles measured from +x toward +z
    arc(HW - R, HD - R, R, 0, P2, cpts); arc(-HW + R, HD - R, R, P2, 2 * P2, cpts);
    arc(-HW + R, -HD + R, R, 2 * P2, 3 * P2, cpts); arc(HW - R, -HD + R, R, 3 * P2, 4 * P2, cpts);
    // inner, reversed
    const ri = R - T;
    arc(HW - R, -HD + R, ri, 4 * P2, 3 * P2, cpts); arc(-HW + R, -HD + R, ri, 3 * P2, 2 * P2, cpts);
    arc(-HW + R, HD - R, ri, 2 * P2, P2, cpts); arc(HW - R, HD - R, ri, P2, 0, cpts);
    parts.push(extrudeY(new THREE.Shape(cpts), hBody, yb));
    // +X wall: shape in (u = -z, v = y), extruded along +x.
    const span = D - 2 * R;
    const wall = new THREE.Shape([[-span / 2, yb], [span / 2, yb], [span / 2, yt], [-span / 2, yt]].map(([u, v]) => new THREE.Vector2(u, v)));
    const hole = (z, y, w, h, r) => wall.holes.push(rrPath(w, h, r, -z, y, 3));
    hole(0.0300, -0.0352, 0.0124, 0.0068, 0.0013);           // USB-C opening (port + status LED)
    hole(0.0030, -0.0255, 0.0250, 0.0094, 0.0047);           // side vent slot
    wall.holes.push(circlePath(0.0038, 0.0310, -0.0170, low ? 10 : 18)); // round port (u = -z, z = -0.030)
    const wg = new THREE.ExtrudeGeometry(wall, { depth: T, bevelEnabled: false, curveSegments: 3 });
    wg.rotateY(Math.PI / 2); wg.translate(HW - T, 0, 0);
    parts.push(wg);
    // Floor with intake slots under the blower, plus the inset plinth.
    const floor = rrShape(W - 2 * T + 0.0004, D - 2 * T + 0.0004, ri + 0.0002);
    for (let i = 0; i < 6; i++) floor.holes.push(rrPath(0.026, 0.0022, 0.0011, STACK_X, (i - 2.5) * 0.0052, 2));
    parts.push(extrudeY(floor, 0.0018, yb));
    const plinth = rrShape(W - 0.0036, D - 0.0036, R - 0.0018);
    for (let i = 0; i < 6; i++) plinth.holes.push(rrPath(0.026, 0.0022, 0.0011, STACK_X, (i - 2.5) * 0.0052, 2));
    parts.push(extrudeY(plinth, 0.0012 + 0.0004, -H - 0.0003, 0.0004));
    // Inner bosses for the plate screws (visible through the plate holes when exploded).
    const scr = screwXY();
    // Corner posts: rounded columns from the screw axis into the wall corner.
    for (const [x, z] of scr) {
      const sx = Math.sign(x), sz = Math.sign(z), x0 = Math.abs(x) - 0.0032, x1 = HW - T + 0.0006, z0 = Math.abs(z) - 0.0032, z1 = HD - T + 0.0006;
      const post = rrShape(x1 - x0, z1 - z0, 0.0016, sx * (x0 + x1) / 2, -sz * (z0 + z1) / 2, 3);
      post.holes.push(circlePath(0.0012, x, -z, 8));
      parts.push(extrudeY(post, 0.0385, -0.043));
    }

    const g = merge(parts.map((p) => smooth(p, 40)), true);
    // Baked occlusion: interior faces darker, port walls a little darker.
    const pos = g.attributes.position, nor = g.attributes.normal, col = g.attributes.color;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), nx = nor.getX(i), ny = nor.getY(i), nz = nor.getZ(i);
      let k = 1;
      const inward = (x * nx + z * nz) < 0 && Math.abs(ny) < 0.5;
      const insideBox = Math.abs(x) < HW - T + 1e-4 && Math.abs(z) < HD - T + 1e-4;
      if (inward && y < lidBot) k = 0.46;
      if (ny > 0.5 && y < -0.035 && insideBox) k = 0.4;          // floor top
      if (ny < -0.5 && y > -0.012 && insideBox) k = 0.5;          // undersides inside
      if (x > HW - T - 1e-4 && Math.abs(nx) < 0.5 && y < lidBot) k = Math.min(k, 0.72); // port and vent reveals
      if (insideBox && y < -0.006 && y > -0.0436 && Math.abs(ny) < 0.5 && !inward && Math.abs(x) < HW - T - 1e-4) k = Math.min(k, 0.55); // bosses, slot reveals
      col.setXYZ(i, k, k, k);
    }
    shell.add(mesh(g, mat.shell, 'shellBody'));
  }

  // Soft contact shadow (baked canvas gradient), rides with the shell.
  const shadowTex = (() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const x = cv.getContext('2d'), img = x.createImageData(64, 64);
    for (let j = 0; j < 64; j++) for (let i = 0; i < 64; i++) {
      // rounded-rect distance falloff
      const u = Math.abs(i + 0.5 - 32) / 32, v = Math.abs(j + 0.5 - 32) / 32;
      const qx = Math.max(u - 0.55, 0), qy = Math.max(v - 0.55, 0), d = Math.hypot(qx, qy) / 0.45;
      const a = Math.pow(Math.max(0, 1 - d), 1.8);
      const o = (j * 64 + i) * 4; img.data[o] = img.data[o + 1] = img.data[o + 2] = 0; img.data[o + 3] = Math.round(a * 255);
    }
    x.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; texs.push(t); return t;
  })();
  const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.55, toneMapped: false });
  mats.push(shadowMat);
  const shadow = mesh(track(new THREE.PlaneGeometry(W * 1.45, D * 1.45).rotateX(-Math.PI / 2).translate(0, -H - 0.0006, 0)), shadowMat, 'shadow');
  shadow.renderOrder = -1;
  shell.add(shadow);

  // ------------------------------------------------------------------------------------------- top plate
  function screwXY() { const ix = PW / 2 - 0.0045, iz = PD / 2 - 0.0045; return [[ix, iz], [-ix, iz], [-ix, -iz], [ix, -iz]]; }
  const topPlate = part('topPlate');
  {
    const c = 0.00035;
    const s = rrShape(PW - 2 * c, PD - 2 * c, 0.002 - c);
    for (const [x, z] of screwXY()) s.holes.push(circlePath(0.0029 + c, x, -z, 12));
    topPlate.add(mesh(smooth(track(extrudeY(s, PT, -PT, c, low ? 3 : 4)), 35), mat.plate, 'plate'));
  }

  // ------------------------------------------------------------------------------------------- screws (M3 countersunk)
  const screws = part('screws');
  // Two instanced draws for all four screws; setProgress spins each about its own axis as it lands.
  const SCREW_XY = screwXY();
  const screwSteel = new THREE.InstancedMesh(merge([
    smooth(new THREE.CylinderGeometry(0.0028, 0.0015, 0.0016, 14, 1).translate(0, -0.0008, 0), 50),
    smooth(new THREE.CylinderGeometry(0.0015, 0.0015, 0.008, 8, 1).translate(0, -0.0056, 0), 50),
  ]), mat.steel, 4);
  const screwSock = new THREE.InstancedMesh(track(new THREE.CircleGeometry(0.0011, 6).rotateX(-Math.PI / 2).translate(0, 0.00003, 0)), mat.socket, 4);
  screwSteel.name = 'screwHeads'; screwSock.name = 'screwSockets';
  screws.add(screwSteel, screwSock);
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _yAxis = new THREE.Vector3(0, 1, 0);
  function poseScrews(ang) {
    for (let i = 0; i < 4; i++) {
      _q.setFromAxisAngle(_yAxis, ang + i * 0.9);
      _m.compose(_p.set(SCREW_XY[i][0], 0, SCREW_XY[i][1]), _q, _s);
      screwSteel.setMatrixAt(i, _m); screwSock.setMatrixAt(i, _m);
    }
    screwSteel.instanceMatrix.needsUpdate = true; screwSock.instanceMatrix.needsUpdate = true;
  }
  poseScrews(0);
  screwSteel.computeBoundingSphere(); screwSock.computeBoundingSphere();

  // ------------------------------------------------------------------------------------------- Peltier TEC1-12703
  const peltier = part('peltier');
  {
    const cer = 0.0008, mid = PEL_T - 2 * cer;
    const g = merge([cbox(PEL, cer, PEL, 0.00025, 0, -cer / 2), cbox(PEL, cer, PEL, 0.00025, 0, -PEL_T + cer / 2)].map((x) => smooth(x)));
    peltier.add(mesh(g, mat.ceramic, 'ceramic'));
    peltier.add(mesh(track(new THREE.BoxGeometry(PEL - 0.0016, mid, PEL - 0.0016).translate(0, -cer - mid / 2, 0)), mat.pellets, 'pellets'));
    // silicone sealant bead along the edges
    const sealant = rrShape(PEL - 0.0008, PEL - 0.0008, 0.0006, 0, 0, 2); sealant.holes.push(rrPath(PEL - 0.0016, PEL - 0.0016, 0.0002, 0, 0, 1));
    peltier.add(mesh(smooth(track(extrudeY(sealant, mid, -cer - mid))), mat.sealant, 'sealant'));
    // red / black leads from the hot (bottom) side, toward the driver board
    const lead = (z, m) => {
      const pts = [[0.0192, -0.0018, z], [0.027, -0.0019, z], [0.032, -0.004, z * 1.05], [0.035, -0.012, z * 1.1], [0.037, -0.021, z * 1.15]]
        .map(([x, y, zz]) => new THREE.Vector3(x, y, zz));
      return mesh(track(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), low ? 10 : 18, 0.00065, low ? 5 : 6, false)), m);
    };
    peltier.add(lead(0.008, mat.red), lead(0.0115, mat.black));
    peltier.position.set(STACK_X, Y_PEL, 0);
  }

  // ------------------------------------------------------------------------------------------- heatsink (aluminium, fins down)
  const heatsink = part('heatsink');
  {
    const list = [smooth(cbox(HS_W, HS_B, HS_D, 0.0004, 0, -HS_B / 2))];
    const pitch = (HS_W - 0.0012) / (HS_N - 1);
    for (let i = 0; i < HS_N; i++) {
      const x = -HS_W / 2 + 0.0006 + i * pitch;
      list.push(new THREE.BoxGeometry(0.0012, HS_F, HS_D - 0.001).translate(x, -HS_B - HS_F / 2 + 0.0001, 0));
    }
    heatsink.add(mesh(merge(list), mat.sink, 'fins'));
    heatsink.position.set(STACK_X, Y_HS, 0);
  }

  // ------------------------------------------------------------------------------------------- blower (40 mm, rotor visible from the top)
  const blower = part('blower');
  const rotor = new THREE.Group();
  {
    const c = 0.0004;
    const s = rrShape(FAN - 2 * c, FAN - 2 * c, 0.003);
    s.holes.push(circlePath(0.0188 + c, 0, 0, low ? 18 : 28));
    for (const [x, z] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) s.holes.push(circlePath(0.0016 + c, x * 0.016, -z * 0.016, 8));
    const frame = smooth(extrudeY(s, FAN_T, -FAN_T, c, low ? 3 : 5), 40);
    // motor mount disc and three struts across the bottom
    const strutList = [frame, smooth(new THREE.CylinderGeometry(0.0085, 0.0085, 0.0014, low ? 14 : 22, 1).translate(0, -FAN_T + 0.0007, 0), 40)];
    for (let i = 0; i < 3; i++) {
      const g = new THREE.BoxGeometry(0.019, 0.0012, 0.0016).translate(0.0095, -FAN_T + 0.0006, 0);
      g.rotateY(i * Math.PI * 2 / 3 + 0.4); strutList.push(g);
    }
    blower.add(mesh(merge(strutList), mat.fan, 'housing'));
    // rotor: hub + blades
    const nb = low ? 5 : 7, bl = [smooth(new THREE.CylinderGeometry(0.0072, 0.0074, 0.0078, low ? 14 : 22, 1).translate(0, -FAN_T / 2 - 0.0004, 0), 40)];
    for (let i = 0; i < nb; i++) {
      const g = new THREE.BoxGeometry(0.0115, 0.0068, 0.0007);
      g.rotateX(0.55); g.translate(0.0072 + 0.0115 / 2 - 0.0006, -FAN_T / 2 - 0.0004, 0); g.rotateY(i * Math.PI * 2 / nb);
      bl.push(g);
    }
    rotor.add(mesh(merge(bl), mat.blade, 'rotor'));
    rotor.add(mesh(track(new THREE.CircleGeometry(0.0058, low ? 14 : 20).rotateX(-Math.PI / 2).translate(0, -0.0006, 0)), mat.label, 'hubLabel'));
    blower.add(rotor);
    blower.position.set(STACK_X, Y_FAN, 0);
  }

  // ------------------------------------------------------------------------------------------- driver board (USB-C, MCU, status LED)
  const board = part('board');
  {
    const bx = 0.040, bz = 0.027, by = -0.0389;           // board centre (bottom of PCB), receptacle lines up with the wall port
    board.add(mesh(smooth(track(cbox(0.026, 0.0016, 0.036, 0.0002, 0, by + 0.0008, 0))), mat.pcb, 'pcb'));
    board.add(mesh(merge([
      cbox(0.007, 0.0009, 0.007, 0.0002, -0.003, by + 0.0016 + 0.00045, -0.004),
      cbox(0.004, 0.0008, 0.003, 0.0001, -0.006, by + 0.0016 + 0.0004, 0.008),
      cbox(0.003, 0.0012, 0.0045, 0.0001, 0.003, by + 0.0016 + 0.0006, -0.0125),
    ].map((x) => smooth(x))), mat.chip, 'chips'));
    // USB-C receptacle: stadium tube along x, its mouth flush with the wall's inner face
    const rs = rrShape(0.0089, 0.0032, 0.0016, 0, 0, 4); rs.holes.push(rrPath(0.0081, 0.0024, 0.0012, 0, 0, 4));
    const rg = new THREE.ExtrudeGeometry(rs, { depth: 0.0072, bevelEnabled: false, curveSegments: 4 });
    rg.rotateY(Math.PI / 2); rg.translate(HW - T - 0.0072 + 0.0008 - bx, by + 0.0016 + 0.0016 + 0.0001, 0.0315 - bz);
    const tongue = new THREE.BoxGeometry(0.0062, 0.0007, 0.0062).translate(HW - T - 0.0034 - bx, by + 0.0033, 0.0315 - bz);
    board.add(mesh(merge([smooth(rg, 40), tongue]), mat.steel, 'usbC'));
    board.add(mesh(track(new THREE.BoxGeometry(0.0016, 0.0007, 0.0009).translate(HW - T - 0.0012 - bx, by + 0.0016 + 0.00035, 0.0258 - bz)), mat.led, 'led'));
    board.position.set(bx, 0, bz);
  }

  // ------------------------------------------------------------------------------------------- NTC thermistor under the plate
  const thermistor = part('thermistor');
  {
    const bead = new THREE.SphereGeometry(0.0011, low ? 6 : 8, low ? 4 : 6); bead.scale(1, 0.8, 1.25);
    thermistor.add(mesh(track(bead.translate(0, -0.0010, 0)), mat.epoxy, 'bead'));
    const legs = merge([0.00045, -0.00045].map((x) => new THREE.CylinderGeometry(0.00017, 0.00017, 0.012, 4, 1).rotateX(Math.PI / 2).translate(x, -0.0007, 0.0068)));
    thermistor.add(mesh(legs, mat.steel, 'leads'));
    thermistor.add(mesh(track(new THREE.BoxGeometry(0.0065, 0.00012, 0.010).translate(0, -0.00006, 0.0028)), mat.kapton, 'kapton'));
    thermistor.position.set(STACK_X + PEL / 2 + 0.0055, -PT, -0.006);
    thermistor.rotation.y = Math.PI;
  }

  // ------------------------------------------------------------------------------------------- parts, explode, progress
  const order = [
    // name, part, explode offset, arrival window [start, end] in p, lateral-first (slides over the rim, then drops in)
    ['shell', shell, [0, -0.112, 0], [0.00, 0.40]],
    ['blower', blower, [0, -0.030, 0], [0.12, 0.50]],
    ['board', board, [0.052, 0.046, 0.020], [0.18, 0.58], true],
    ['heatsink', heatsink, [0, 0.004, 0], [0.28, 0.64]],
    ['peltier', peltier, [0, 0.030, 0], [0.40, 0.74]],
    ['thermistor', thermistor, [0.024, 0.040, 0.018], [0.50, 0.84], true],
    ['topPlate', topPlate, [0, 0.056, 0], [0.56, 0.90]],
    ['screws', screws, [0, 0.082, 0], [0.66, 1.00]],
  ];
  const parts = {}, list = [];
  for (const [name, obj, e, win, lat = false] of order) {
    const rec = { name, mesh: obj, explode: new THREE.Vector3(...e), base: obj.position.clone(), win, lat };
    parts[name] = obj; list.push(rec);
  }
  const smoother = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  let progress = 1;
  function setProgress(p) {
    progress = p = Math.min(1, Math.max(0, p));
    for (const r of list) {
      const t = Math.min(1, Math.max(0, (p - r.win[0]) / (r.win[1] - r.win[0])));
      if (r.lat) {
        // lateral offset closes over the first 45 % of the window while the part stays high, then it drops in
        const kl = 1 - smoother(Math.min(1, t / 0.45)), kv = 1 - smoother(Math.max(0, (t - 0.3) / 0.7));
        r.mesh.position.set(r.base.x + r.explode.x * kl, r.base.y + r.explode.y * kv, r.base.z + r.explode.z * kl);
      } else {
        r.mesh.position.copy(r.base).addScaledVector(r.explode, 1 - smoother(t));
      }
    }
    // screws turn in as they land (two and a half turns)
    const st = list[list.length - 1], ts = Math.min(1, Math.max(0, (p - st.win[0]) / (st.win[1] - st.win[0])));
    const ang = (1 - smoother(ts)) * Math.PI * 5;
    poseScrews(ang);
    // the Peltier and thermistor are fully covered once the plate is down: skip their draws
    peltier.visible = thermistor.visible = p < 1;
  }

  // Plate temperature tint (pre-allocated colours, no per-call allocation).
  const cNeutral = new THREE.Color(0xd3d7dd), cWarm = new THREE.Color(0xddcdb9), cCold = new THREE.Color(0xccd8e6);
  const eWarm = new THREE.Color(0xff7a2e), eCold = new THREE.Color(0x8fc2ff), eTmp = new THREE.Color();
  const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  function setPlateTemperature(c) {
    const w = sstep(28, 66, c), k = sstep(20, 2, c);
    mat.plate.color.copy(cNeutral).lerp(cWarm, w).lerp(cCold, k);
    mat.plate.emissive.copy(eTmp.setRGB(0, 0, 0)).lerp(eWarm, w * 0.05).lerp(eCold, k * 0.03);
    mat.plate.roughness = 0.4 + k * 0.08;          // a cold plate looks a touch duller (faint mist)
  }
  setPlateTemperature(22);
  setProgress(1);

  let fanSpeed = 0;
  let triangles = 0;
  group.traverse((o) => { if (o.isMesh && o !== shadow) { const g = o.geometry; triangles += (g.index ? g.index.count : g.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1); } });

  return {
    group, duration: 4.0, parts, triangles, shadow,
    setProgress,
    getProgress: () => progress,
    getParts: () => list.map(({ name, mesh, explode }) => ({ name, mesh, explode })),
    setPlateTemperature,
    setFanSpeed(rps) { fanSpeed = rps || 0; },
    setShadowOpacity(a) { shadowMat.opacity = 0.55 * Math.min(1, Math.max(0, a)); shadow.visible = a > 0.001; },
    update(dt) { if (fanSpeed) rotor.rotation.y -= dt * fanSpeed * Math.PI * 2; },
    dispose() {
      screwSteel.dispose(); screwSock.dispose();
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
      for (const t of texs) t.dispose();
      group.removeFromParent();
    },
  };
}
