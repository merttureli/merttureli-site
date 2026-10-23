// Therma-Shift coaster, built from the owner's CAD (ThermaShift_FULL assembly.STEP via tools/cad.py, map
// tools/cad/maps/therma-shift.json, files next/assets/3d/therma-shift.json/.bin). Same module API as the procedural
// stand-in it replaces, so showreel/index.js drives it unchanged.
//
// Units metres, +Y up. The top surface centre of the aluminium plate is the group origin (0,0,0); the case hangs
// below to y = -height. The STEP has the whole assembly turned 33 degrees about Y: every part is turned back so the
// face with the USB-C port, the vent slot and the button hole looks along +Z. The STEP has no button (it was added
// last): it is modelled here from the turntable videos (a small panel-mount push button: hex nut, satin steel
// barrel, black cap) and seated in the round hole.
//
// export default create({ THREE, renderer, quality }) -> {
//   group, duration, height, footprint, triangles
//   setProgress(p)          0 = exploded, 1 = assembled. Pure function of p: staggered smootherstep arrivals in build
//                           order (case, fan, electronics, heatsink, Peltier, plate, lid ring, screws, button)
//   getParts()              [{ name, mesh, explode, win }] in build order; mesh is the part's Group, explode a live
//                           Vector3 (m) added at p = 0, win its [start, end] arrival window in p
//   parts                   { shell, blower, board, heatsink, peltier, topPlate, lid, screws, button }
//   setPlateTemperature(c)  degrees C: neutral aluminium near 22 C, amber-orange when hot, icy blue when cold, with a
//                           soft halo on the lid ring and a coloured pool on the ground
//   setShadowOpacity(a)     baked soft contact shadow under the case (rides with the case)
//   setFanSpeed(rps), update(dt)   kept for the API (the CAD fan is one solid, so nothing spins)
//   caseBounds              Box3 of the case and lid ring (coaster space, assembled)
//   port                    { position, normal, depth, width, height }: the USB-C slot on the case (coaster space, m):
//                           the plug seats with its overmold face at `position`, pushing `depth` into the wall along
//                           -normal
//   dispose()
// }
import * as THREE_ from '../three.module.min.js';
import { fetchCadMesh, buildCadMesh } from '../cad/cadmesh.js';

const CAD = await fetchCadMesh(new URL('../../assets/3d/therma-shift.json', import.meta.url));

const TURN = -57 * Math.PI / 180;     // undoes the CAD's 33 degree turn: the port face looks along +Z
// Features of the case front, measured on the CAD in the turned frame (mm, model center origin): see the map doc.
const PORT = { x: -25.61, y: -11.41, z: 45.11, w: 12.0, h: 5.5, depth: 5.2 };   // USB-C slot, receptacle 5.2 mm in
const BUTTON = { x: 29.64, y: -3.41, z: 45.11 };                               // round hole, 6.5 mm

// build order: [name, arrival window in p, explode offset (m)]
const BUILD = [
  ['shell', [0.00, 0.16], [0, -0.060, 0]],
  ['blower', [0.10, 0.26], [0, -0.008, 0]],
  ['board', [0.20, 0.38], [0, 0.006, 0]],
  ['heatsink', [0.32, 0.50], [0, 0.014, 0]],
  ['peltier', [0.44, 0.60], [0, 0.026, 0]],
  ['topPlate', [0.54, 0.72], [0, 0.038, 0]],
  ['lid', [0.66, 0.82], [0, 0.050, 0]],
  ['screws', [0.76, 0.92], [0, 0.062, 0]],
  ['button', [0.86, 1.00], [0, 0, 0.026]],
];

export default function create({ THREE = THREE_, renderer, quality = 'high' } = {}) {
  const low = quality === 'low';
  const model = buildCadMesh(THREE, CAD.meta, CAD.buf, { materials: { topPlate: {} } });
  const group = new THREE.Group();
  group.name = 'thermaShiftCoaster';
  const geos = [], mats = [], texs = [];

  // turn every part back (position about the model center, and the part itself), then put the plate top center at
  // the origin
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), TURN);
  const parts = {};
  for (const p of model.getParts()) { p.mesh.position.applyQuaternion(q); p.mesh.quaternion.premultiply(q); parts[p.name] = p.mesh; }
  group.add(model.group);
  model.group.updateMatrixWorld(true);
  const pb = new THREE.Box3().setFromObject(parts.topPlate, true);   // precise: the parts are turned
  const off = new THREE.Vector3((pb.min.x + pb.max.x) / 2, pb.max.y, (pb.min.z + pb.max.z) / 2);
  for (const n in parts) parts[n].position.sub(off);
  const mm = (x, y, z) => new THREE.Vector3(x / 1000 - off.x, y / 1000 - off.y, z / 1000 - off.z);

  // the button the STEP lacks: hex nut against the wall, satin barrel, black cap
  const steel = new THREE.MeshStandardMaterial({ color: 0xc9ccd0, roughness: 0.32, metalness: 0.85 });
  const capMat = new THREE.MeshStandardMaterial({ color: 0x1a1b1e, roughness: 0.45, metalness: 0 });
  mats.push(steel, capMat);
  const seg = low ? 16 : 24;
  const button = new THREE.Group(); button.name = 'button';
  const cyl = (r, h, z, mat, n = seg) => {
    const g = new THREE.CylinderGeometry(r, r, h, n).rotateX(Math.PI / 2).translate(0, 0, z); geos.push(g);
    const m = new THREE.Mesh(g, mat); button.add(m); return m;
  };
  cyl(0.0046, 0.0015, 0.00075, steel, 6).rotation.z = Math.PI / 6;     // hex nut, 8 mm across flats
  cyl(0.0030, 0.0036, 0.0033, steel);                                 // threaded barrel
  cyl(0.0033, 0.0006, 0.0050, steel);                                 // bezel lip
  cyl(0.0022, 0.0012, 0.0058, capMat);                                // cap
  cyl(0.0029, 0.0060, -0.0030, steel);                                // body behind the wall
  button.position.copy(mm(BUTTON.x, BUTTON.y, BUTTON.z));
  model.group.add(button);
  parts.button = button;

  // getParts in build order, with this coaster's windows and explode offsets
  const list = BUILD.filter(([n]) => parts[n]).map(([name, win, e]) => ({
    name, mesh: parts[name], win, explode: new THREE.Vector3(...e), base: parts[name].position.clone(),
  }));

  // soft contact shadow under the case, riding with it
  // inner: share of the plane that is the flat core; hollow: core is transparent (a halo around an opening)
  const decalTex = (inner, alphaPow, hollow = false) => {
    const n = 128, cv = document.createElement('canvas'); cv.width = cv.height = n;
    const x = cv.getContext('2d'), img = x.createImageData(n, n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const u = Math.abs(i + 0.5 - n / 2) / (n / 2), v = Math.abs(j + 0.5 - n / 2) / (n / 2);
      const qx = Math.max(u - inner, 0), qy = Math.max(v - inner, 0), d = Math.hypot(qx, qy) / (1 - inner);
      const o = (j * n + i) * 4; img.data[o] = img.data[o + 1] = img.data[o + 2] = 255;
      const core = qx === 0 && qy === 0;
      img.data[o + 3] = hollow && core ? 0 : Math.round(Math.pow(Math.max(0, 1 - d), alphaPow) * 255);
    }
    x.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; texs.push(t); return t;
  };
  model.group.updateMatrixWorld(true);
  const caseBox = new THREE.Box3().setFromObject(parts.shell, true), lidBox = new THREE.Box3().setFromObject(parts.lid, true);
  const W = caseBox.max.x - caseBox.min.x, D = caseBox.max.z - caseBox.min.z;
  const height = -caseBox.min.y, lidTop = lidBox.max.y;
  const flat = (w, d, y, mat, parent, order) => {
    const g = new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2); geos.push(g);
    const m = new THREE.Mesh(g, mat); m.renderOrder = order;
    // decals live in the part's local frame: undo the part's turn so they stay square to the case
    const local = parent.worldToLocal(new THREE.Vector3((caseBox.min.x + caseBox.max.x) / 2, y, (caseBox.min.z + caseBox.max.z) / 2).add(group.position));
    m.position.copy(local); m.quaternion.copy(q).invert();
    parent.add(m); return m;
  };
  model.group.updateMatrixWorld(true);
  const shadowMat = new THREE.MeshBasicMaterial({ map: decalTex(0.55, 1.8), color: 0x000000, transparent: true, depthWrite: false, opacity: 0.55, toneMapped: false });
  const ringMat = new THREE.MeshBasicMaterial({ map: decalTex(1 / 1.22, 2.6), color: 0xffffff, transparent: true, depthWrite: false, opacity: 0, toneMapped: false });
  const poolMat = new THREE.MeshBasicMaterial({ map: decalTex(0.25, 2.2), color: 0xffffff, transparent: true, depthWrite: false, opacity: 0, toneMapped: false });
  mats.push(shadowMat, ringMat, poolMat);
  const shadow = flat(W * 1.45, D * 1.45, -height - 0.0006, shadowMat, parts.shell, -1); shadow.name = 'shadow';
  const pool = flat(W * 2.3, D * 2.3, -height - 0.0009, poolMat, parts.shell, -2); pool.name = 'groundGlow';
  // the halo sits just under the plate top: plate and lid ring hide its core, the glow spills out around the case
  const ring = flat(W * 1.22, D * 1.22, -0.0004, ringMat, parts.topPlate, 1); ring.name = 'plateGlow';
  ring.visible = pool.visible = false;

  // case bounds (case + lid ring), coaster space: colliders for the cable
  const caseBounds = caseBox.clone().union(lidBox);
  // the USB-C slot, in coaster space
  const port = { position: mm(PORT.x, PORT.y, PORT.z), normal: new THREE.Vector3(0, 0, 1), depth: PORT.depth / 1000, width: PORT.w / 1000, height: PORT.h / 1000 };

  const smoother = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  let progress = 1;
  function setProgress(p) {
    progress = p = Math.min(1, Math.max(0, p));
    for (let i = 0; i < list.length; i++) {
      const r = list[i], t = Math.min(1, Math.max(0, (p - r.win[0]) / (r.win[1] - r.win[0])));
      r.mesh.position.copy(r.base).addScaledVector(r.explode, 1 - smoother(t));
    }
  }

  // Plate temperature as a clear status read (pre-allocated colours, no per-call allocation): neutral aluminium near
  // 22 C, amber-orange (a touch warmer than the rocket's orange) when hot, icy blue when cold. Tint + modest emissive,
  // with the metal turning more diffuse so the colour carries; plus the lid halo and ground pool.
  const plateMats = [];
  parts.topPlate.traverse((o) => { if (o.isMesh && o.material !== ringMat && !plateMats.includes(o.material)) plateMats.push(o.material); });
  const cNeutral = new THREE.Color(0xd3d7dd), cWarm = new THREE.Color(0xd9692c), cCold = new THREE.Color(0x7fa6e0);
  const eWarm = new THREE.Color(0xff5410), eCold = new THREE.Color(0x2a62ff);
  const gWarm = new THREE.Color(0xf26a1e), gCold = new THREE.Color(0x4f86f0);
  const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  function setPlateTemperature(c) {
    const w = sstep(25, 52, c), k = sstep(20, 12, c), g = Math.max(w, k);
    for (let i = 0; i < plateMats.length; i++) {
      const m = plateMats[i];
      m.color.copy(cNeutral).lerp(cWarm, w).lerp(cCold, k);
      if (w >= k) m.emissive.copy(eWarm).multiplyScalar(w * 0.3); else m.emissive.copy(eCold).multiplyScalar(k * 0.16);
      m.metalness = 0.6 - 0.4 * g;
      m.roughness = 0.4 + k * 0.1;
    }
    if (w >= k) { ringMat.color.copy(gWarm); poolMat.color.copy(gWarm); } else { ringMat.color.copy(gCold); poolMat.color.copy(gCold); }
    ringMat.opacity = 0.6 * g; poolMat.opacity = 0.3 * g;
    ring.visible = pool.visible = g > 0.004;
  }
  setPlateTemperature(22);
  setProgress(1);

  let triangles = model.triangles;
  button.traverse((o) => { if (o.isMesh) triangles += o.geometry.index ? o.geometry.index.count / 3 : o.geometry.attributes.position.count / 3; });
  return {
    group, duration: 4.0, height, footprint: Math.max(W, D), triangles, shadow, port, caseBounds, parts,
    setProgress,
    getProgress: () => progress,
    getParts: () => list.map(({ name, mesh, explode, win }) => ({ name, mesh, explode, win })),
    setPlateTemperature,
    setFanSpeed() {},
    setShadowOpacity(a) { shadowMat.opacity = 0.55 * Math.min(1, Math.max(0, a)); shadow.visible = a > 0.001; },
    update() {},
    dispose() {
      model.dispose();
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
      for (const t of texs) t.dispose();
    },
  };
}
