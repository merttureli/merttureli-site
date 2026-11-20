// Therma-Shift coaster, built from the owner's CAD (ThermaShift_FULL assembly.STEP via tools/cad.py, map
// tools/cad/maps/therma-shift.json, files next/assets/3d/therma-shift.json/.bin) and dressed as the real parts.
// Same module API as before, with additions; showreel/index.js, case-stage.js and the 3D viewer drive it unchanged.
//
// Units metres, +Y up. The top surface centre of the aluminium plate is the group origin (0,0,0); the case hangs
// below to y = -height. The STEP has the whole assembly turned 33.1575 degrees about Y: every part is turned back
// exactly (the port face looks along +Z, the walls are square to the axes) and its geometry is baked into coaster
// space, so each part Group sits at the origin and the shaders can use the measured design directly.
//
// What comes from the CAD: the case, the lid ring, the heatsink (a cross-cut pin sink), the blower frame, the
// ESP32-C3 board. What is modelled here, to scale and in the CAD's place, because the CAD has a plain block or
// nothing: the plate's edge break, the screws with their hex sockets, the push button, the USB-C receptacle, the
// Peltier module, the blower's impeller, the PD trigger, buck and driver boards, the thermistor (coaster-geo.js).
// Materials come from the look (look.js) when a renderer is given, each with what the device knows about itself:
// soft edge breaks, depth in the vent, the port and the holes, a dark closed interior (coaster-shade.js).
// Hot and cold are physical cues, not a colour wash: a reflection tint of a few percent, frost creeping in from
// the plate edge, and (the owner's call) a faint orange or blue tint at the plate's edge that names the mode. Without a renderer (the 3D viewer) the same parts get plain materials and the old halo decals.
// The materials read the state of the case (open, closed, lid on) from where the parts are at draw time, so it
// holds whoever moves them: setProgress, the reel's fly-in wraps or the viewer's own explode.
//
// export default create({ THREE, renderer, quality, look, cull }) -> {
//   group, duration, height, footprint, triangles
//   setProgress(p)          0 = exploded, 1 = assembled. Pure function of p: staggered smootherstep arrivals in build
//                           order (case, fan, electronics, heatsink, Peltier, plate, lid ring, screws, button)
//   getParts()              [{ name, mesh, explode, win }] in build order; mesh is the part's Group, explode a live
//                           Vector3 (m) added at p = 0, win its [start, end] arrival window in p
//   parts                   { shell, blower, board, heatsink, peltier, topPlate, lid, screws, button }
//   setPlateTemperature(c)  degrees C. Near 22 C neutral; hot: the plate's reflection leans warm by tune.tint (6 %)
//                           and, with a look, its edge leans further by tune.edge (the owner's faint cue for the
//                           mode: an orange band toward the tray walls); cold: both lean cool, and frost follows
//                           the temperature unless setFrost drives it
//   setFrost(a)             0..1: dew haze, then needle frost creeping in from the plate edge (1 = tune.frostReach
//                           mm in); null hands frost back to the temperature
//   setFanSpeed(rps), update(dt, time)   the impeller turns; above about 1 turn a second it blurs into a ring
//   setCull(on)             hide what the closed case hides (default on with a renderer, off without): from p = 0.83
//                           up the meshes inside (all but the receptacle) are not drawn; the part Groups stay
//                           visible, so shadows, layout and getParts() are not affected
//   setShadowOpacity(a)     the baked contact shadow decal (the look's contact shadows replace it in the reel)
//   tune                    { tint, edge, warm, cold, frostReach, frostFrom, frostFull }: art direction, read on every call
//   state                   { temperature, frost, tint, edge, fan, closed, progress } as last set
//   tray                    { halfX, halfZ, rim, y }: the open plate area inside the lid ring and the rim height (m)
//   caseBounds              Box3 of the case and lid ring (coaster space, assembled)
//   port                    { position, normal, depth, width, height }: the USB-C slot on the case (coaster space, m):
//                           `position` is on the outer wall face on the receptacle's axis; the plug seats with its
//                           overmold face there, its shell reaching `depth` into the wall along -normal
//   ready                   Promise: the device's own textures are generated (they fill in slices; drawing before
//                           that is safe)
//   stats()                 { triangles: { part: n }, total, closed, meshes, textureBytes, sliceMs, slices, p95SliceMs, maxSliceMs }
//   look                    the look the materials came from, or null
//   dispose()
// }
import * as THREE_ from '../three.module.min.js';
import { fetchCadMesh, buildCadMesh } from '../cad/cadmesh.js';
import { DIM, paint, buildPlate, buildScrews, buildButton, buildReceptacle, buildPeltier, buildRotor, buildBlurRing, buildBoards, buildThermistor } from './coaster-geo.js';
import { createAtlas, createFrostMap, sliceStats } from './coaster-tex.js';
import { createShadeUniforms, shade } from './coaster-shade.js';

const CAD = await fetchCadMesh(new URL('../../assets/3d/therma-shift.json', import.meta.url));
// the look is optional: without it (or without a renderer) the coaster falls back to plain materials
const LOOK = await import('./look.js').catch(() => null);

const TURN = -56.8425 * Math.PI / 180;   // undoes the CAD's turn exactly: the plate's edges land on the axes
const CLOSE_P = 0.83;                    // from here up the plate and the lid ring are seated (their windows end at .82)

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

// plain stand-ins for the look's presets (no renderer: the 3D viewer), the CAD palette's own values
const PLAIN = {
  plasticMolded: { color: 0x6d717c, roughness: 0.74, metalness: 0 },
  aluminumBeadBlast: { color: 0xd3d7dd, roughness: 0.4, metalness: 0.6 },
  aluminumExtruded: { color: 0xc0c5cd, roughness: 0.42, metalness: 0.6 },
  plasticBlack: { color: 0x2a2c31, roughness: 0.62, metalness: 0 },
};

export default function create({ THREE = THREE_, renderer, quality = 'high', look: lookIn, cull } = {}) {
  const low = quality === 'low';
  const look = lookIn || (LOOK && renderer ? LOOK.getLook({ renderer, quality, THREE }) : null);
  const ownLook = !!look && !lookIn;
  if (look) look.env();
  const model = buildCadMesh(THREE, CAD.meta, CAD.buf, {});
  const group = new THREE.Group();
  group.name = 'thermaShiftCoaster';
  group.add(model.group);
  const geos = [], mats = [], texs = [];
  // (with a look the colours are the site's orange and a clear blue, for the edge cue; without one, the muted pair)
  const tune = { tint: 0.06, edge: 0.5, warm: look ? 0xf27a2a : 0xd8a070, cold: look ? 0x4a86f0 : 0x9ab8d8, frostReach: 13, frostFrom: 17, frostFull: 10.5 };

  // ---- the CAD, turned back and baked into coaster space (every part Group ends at the origin, unturned)
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), TURN);
  const parts = {};
  for (const p of model.getParts()) parts[p.name] = p.mesh;
  const off = new THREE.Vector3();
  {
    const pm = parts.topPlate.children[0], pos = pm.geometry.attributes.position, b = new THREE.Box3(), v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) b.expandByPoint(v.fromBufferAttribute(pos, i).add(parts.topPlate.position).applyQuaternion(q));
    off.set((b.min.x + b.max.x) / 2, b.max.y, (b.min.z + b.max.z) / 2);
  }
  const bake = (part) => {
    const v = new THREE.Vector3();
    part.traverse((o) => {
      if (!o.isMesh) return;
      const g = o.geometry, pos = g.attributes.position, nrm = g.attributes.normal, n = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).add(part.position).applyQuaternion(q).sub(off); pos.setXYZ(i, v.x, v.y, v.z);
        v.fromBufferAttribute(nrm, i).applyQuaternion(q).normalize(); n[i * 3] = v.x; n[i * 3 + 1] = v.y; n[i * 3 + 2] = v.z;
      }
      g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
      pos.needsUpdate = true; g.computeBoundingSphere(); g.computeBoundingBox();
    });
    part.position.set(0, 0, 0); part.quaternion.identity();
  };
  for (const n in parts) bake(parts[n]);
  const tris = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;
  const drop = (part) => { for (const o of [...part.children]) { part.remove(o); if (o.geometry) o.geometry.dispose(); } };

  // ---- materials
  const U = createShadeUniforms(THREE);
  const atlas = createAtlas(THREE, { low });
  const frost = createFrostMap(THREE, { low });
  U.csFrostMap.value = frost.texture;
  texs.push(atlas.map, atlas.orm, frost.texture);
  const preset = (name, over = {}, opts = {}) => {
    const m = look ? look.material(name, { side: THREE.DoubleSide, ...over }, opts) : new THREE.MeshStandardMaterial({ ...PLAIN[name], side: THREE.DoubleSide, ...over });
    mats.push(m); return m;
  };
  // one material instance per part (the 3D viewer fades and clips parts through their materials); same shader
  // variants share a program, so this costs no extra programs or draw calls
  const plasticFor = () => shade(preset('plasticMolded', { color: 0x6d717c }), 'plastic', U);
  // the modelled parts are closed and consistently wound: single-sided (a back face z-fights along thin edges);
  // the CAD's own meshes stay double-sided
  // near: the plate is flat, so it only shows a gradient if the softboxes stand close over it (a card a hand's width
  // above the product, as on a real set): its own, tighter share of the look's near-field studio radius
  const plateMat = shade(preset('aluminumBeadBlast', { side: THREE.FrontSide }, { micro: { rough: 0, normal: 0.22 }, near: 0.4 }), 'plate', U);
  // (envIntensity 1.6: at 1 the anisotropic lobe averaged the overhead panel with the dark walls and the sink read
  // as graphite; the owner's renders and a bare 6063 extrusion are a light silver)
  const sinkMat = shade(preset('aluminumExtruded', {}, { axis: [1, 0, 0], envIntensity: 1.6 }), 'sink', U);
  const blowerMat = shade(preset('plasticBlack', { color: 0x34363b, roughness: 0.5 }, { envIntensity: 1.25 }), 'blower', U);
  const paintParams = { vertexColors: true, map: atlas.map, roughnessMap: atlas.orm, metalnessMap: atlas.orm, metalness: 1, roughness: 1, side: THREE.FrontSide };
  const paintFor = () => { const m = shade(look ? look.standard(paintParams, { micro: false }) : new THREE.MeshStandardMaterial(paintParams), 'paint', U); mats.push(m); return m; };
  // prewarm uploads the textures it finds on a material; the frost field lives in a uniform, so name it there too
  plateMat.userData.csFrostMap = frost.texture;
  const mesh = (geo, mat, name, parent) => { const m = new THREE.Mesh(geo, mat); m.name = name; geos.push(geo); parent.add(m); return m; };
  const inner = [];                               // meshes the closed case hides

  // case and lid ring: the CAD's geometry, one plastic
  for (const n of ['shell', 'lid']) { const m = plasticFor(); parts[n].traverse((o) => { if (o.isMesh) o.material = m; }); }
  // heatsink (with the spacer under its pins) and the blower frame: the CAD's geometry
  parts.heatsink.traverse((o) => { if (o.isMesh) { o.material = sinkMat; inner.push(o); } });
  parts.blower.traverse((o) => { if (o.isMesh) { o.material = blowerMat; inner.push(o); } });

  // top plate: the 12-triangle block becomes a plate with an edge break; the thermistor rides under it
  drop(parts.topPlate);
  mesh(buildPlate(THREE), plateMat, 'topPlate:plate', parts.topPlate);
  inner.push(mesh(buildThermistor(THREE, { low }), paintFor(), 'topPlate:thermistor', parts.topPlate));

  // Peltier module, screws
  drop(parts.peltier);
  inner.push(mesh(buildPeltier(THREE, { low, atlas }), paintFor(), 'peltier:module', parts.peltier));
  drop(parts.screws);
  mesh(buildScrews(THREE, { low }), paintFor(), 'screws:shcs', parts.screws);

  // blower: the impeller the CAD leaves out, on a pivot at the blower's axis; a ring stands in for it at speed
  const rotor = new THREE.Group(); rotor.name = 'rotor';
  parts.blower.add(rotor);
  const rotorMesh = mesh(buildRotor(THREE, { low, atlas }), paintFor(), 'rotor:impeller', rotor);
  const blurParams = { color: 0x17181b, roughness: 0.6, metalness: 0, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true };
  const blurMat = look ? look.standard(blurParams, { micro: false }) : new THREE.MeshStandardMaterial(blurParams);
  mats.push(blurMat);
  const blur = mesh(buildBlurRing(THREE, { low }), blurMat, 'rotor:blur', parts.blower);
  blur.visible = false; blur.renderOrder = 1; blur.userData.lookNoShadow = true;
  inner.push(rotorMesh);

  // electronics: the ESP32-C3 board keeps the CAD's mesh (painted by what each face is); the blocks become boards
  {
    const src = parts.board.children[0], g = src.geometry, pos = g.attributes.position, nrm = g.attributes.normal, idx = g.index.array;
    const keep = [], comp = new Uint8Array(pos.count);
    for (let i = 0; i < idx.length; i += 3) {
      const t = [idx[i], idx[i + 1], idx[i + 2]];
      if (!t.every((k) => pos.getZ(k) < -0.0199 && pos.getX(k) > -0.009 && pos.getX(k) < 0.017)) continue;   // the ESP32 only
      keep.push(...t);
      if (t.some((k) => pos.getZ(k) < -0.02105)) for (const k of t) comp[k] = 1;         // a part on the board
    }
    const mask = paint(THREE, 0x235e4b, 0, 0.42), fr4 = paint(THREE, 0xb9a77c, 0, 0.7), chip = paint(THREE, 0x17181b, 0, 0.45), steel = paint(THREE, 0xc6c9cc, 1, 0.3), key = paint(THREE, 0xb9bcc0, 1, 0.4);
    const col = new Float32Array(pos.count * 3), srf = new Float32Array(pos.count * 2), uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) * 1000, z = pos.getZ(i) * 1000;
      const p = comp[i] ? (x > 8.8 ? steel : (x > 4.5 && x < 7.7 && z < -22.2 ? key : chip)) : (Math.abs(nrm.getZ(i)) > 0.7 ? mask : fr4);
      col.set(p.c, i * 3); srf[i * 2] = p.m; srf[i * 2 + 1] = p.r; uv[i * 2] = 0.004; uv[i * 2 + 1] = 0.996;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('surf', new THREE.BufferAttribute(srf, 2)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(keep); g.computeBoundingSphere(); g.computeBoundingBox();
    const boardMat = paintFor(), espMat = paintFor();
    espMat.side = THREE.DoubleSide;                                                       // CAD mesh: double-sided
    src.material = espMat; src.name = 'board:esp32';
    inner.push(src);
    inner.push(mesh(buildBoards(THREE, { low, atlas }), boardMat, 'board:modules', parts.board));
    mesh(buildReceptacle(THREE, { low }), boardMat, 'board:usbc', parts.board);           // seen through the port: never hidden
  }

  // the button the STEP lacks (it has the 7.2 mm hole)
  const button = new THREE.Group(); button.name = 'button';
  mesh(buildButton(THREE, { low }), paintFor(), 'button:switch', button);
  model.group.add(button);
  parts.button = button;

  // getParts in build order, with this coaster's windows and explode offsets
  const list = BUILD.filter(([n]) => parts[n]).map(([name, win, e]) => ({
    name, mesh: parts[name], win, explode: new THREE.Vector3(...e), base: parts[name].position.clone(),
  }));
  const rec = Object.fromEntries(list.map((r) => [r.name, r]));

  // ---- decals: the baked contact shadow under the case (kept for callers without the look), and the halo and pool
  // the 3D viewer drives (meshes named shadow, groundGlow, plateGlow). The reel uses none of them.
  const decalTex = (innerShare, alphaPow, hollow = false) => {
    const n = 128, cv = document.createElement('canvas'); cv.width = cv.height = n;
    const x = cv.getContext('2d'), img = x.createImageData(n, n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const u = Math.abs(i + 0.5 - n / 2) / (n / 2), v = Math.abs(j + 0.5 - n / 2) / (n / 2);
      const qx = Math.max(u - innerShare, 0), qy = Math.max(v - innerShare, 0), d = Math.hypot(qx, qy) / (1 - innerShare);
      const o = (j * n + i) * 4; img.data[o] = img.data[o + 1] = img.data[o + 2] = 255;
      const core = qx === 0 && qy === 0;
      img.data[o + 3] = hollow && core ? 0 : Math.round(Math.pow(Math.max(0, 1 - d), alphaPow) * 255);
    }
    x.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; texs.push(t); return t;
  };
  const W = DIM.hull.x * 0.002, D = DIM.hull.z * 0.002, height = -DIM.hull.y0 / 1000;
  const flat = (w, d, y, mat, parent, order, name) => {
    const g = new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2); geos.push(g);
    const m = new THREE.Mesh(g, mat); m.renderOrder = order; m.position.y = y; m.name = name;
    m.userData.lookSkip = true; m.userData.lookNoShadow = true;
    parent.add(m); return m;
  };
  const decal = (tex, color, opacity) => { const m = new THREE.MeshBasicMaterial({ map: tex, color, transparent: true, depthWrite: false, opacity, toneMapped: false }); m.userData.lookSkip = true; mats.push(m); return m; };
  const shadowMat = decal(decalTex(0.55, 1.8), 0x000000, 0.55), ringMat = decal(decalTex(1 / 1.22, 2.6), 0xffffff, 0), poolMat = decal(decalTex(0.25, 2.2), 0xffffff, 0);
  const shadow = flat(W * 1.45, D * 1.45, -height - 0.0006, shadowMat, parts.shell, -1, 'shadow');
  const pool = flat(W * 2.3, D * 2.3, -height - 0.0009, poolMat, parts.shell, -2, 'groundGlow');
  const ring = flat(W * 1.22, D * 1.22, -0.0004, ringMat, parts.topPlate, 1, 'plateGlow');
  ring.visible = pool.visible = false;
  if (look) shadow.visible = false;               // the look draws real contact shadows; index.js holds this at 0

  // case bounds (case + lid ring) and the USB-C slot, coaster space
  const H = DIM.hull, caseBounds = new THREE.Box3(new THREE.Vector3(-H.x, H.y0, -H.z).multiplyScalar(0.001), new THREE.Vector3(H.x, H.y1, H.z).multiplyScalar(0.001));
  const port = { position: new THREE.Vector3(DIM.usb.x, DIM.usb.y, DIM.port.z).multiplyScalar(0.001), normal: new THREE.Vector3(0, 0, 1), depth: 0.0052, width: DIM.port.w / 1000, height: DIM.port.h / 1000 };
  const tray = { halfX: DIM.tray.x / 1000, halfZ: DIM.tray.z / 1000, rim: DIM.hull.y1 / 1000, y: 0 };

  // ---- assembly
  const smoother = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const state = { temperature: 22, frost: 0, tint: 0, edge: 0, fan: 0, closed: true, progress: 1 };
  let culling = cull === undefined ? !!renderer : !!cull, hidden = false;
  const liftOf = (r, p) => 1 - smoother(Math.min(1, Math.max(0, (p - r.win[0]) / (r.win[1] - r.win[0]))));
  function setProgress(p) {
    state.progress = p = Math.min(1, Math.max(0, p));
    for (let i = 0; i < list.length; i++) { const r = list[i]; r.mesh.position.copy(r.base).addScaledVector(r.explode, liftOf(r, p)); }
    state.closed = p >= CLOSE_P;
    applyCull();
  }
  // What the materials need to know, read from where the parts really are at draw time (whoever moved them: this
  // module, the reel's fly-in wraps or the 3D viewer): is the cavity covered (plate on the case), is the reveal gap
  // shut (lid ring on the case), do the tray walls stand on the plate; and where the key light is, in coaster space.
  // Every coaster mesh calls it before it draws; the first one each frame does the work.
  const ps = new THREE.Vector3(), pp = new THREE.Vector3(), pl = new THREE.Vector3(), inv = new THREE.Matrix4(), qw = new THREE.Quaternion(), keyW = new THREE.Vector3();
  let stamp = -1;
  function sync(renderer) {
    const f = renderer && renderer.info ? renderer.info.render.frame : -2;
    if (f === stamp) return;
    stamp = f;
    inv.copy(group.matrixWorld).invert();
    ps.setFromMatrixPosition(rec.shell.mesh.matrixWorld).applyMatrix4(inv);
    pp.setFromMatrixPosition(rec.topPlate.mesh.matrixWorld).applyMatrix4(inv);
    pl.setFromMatrixPosition(rec.lid.mesh.matrixWorld).applyMatrix4(inv);
    U.csState.value.set(1 - sstep(0, 0.014, pp.distanceTo(ps)), 1 - sstep(0, 0.004, pl.distanceTo(ps)), 1 - sstep(0, 0.008, pl.distanceTo(pp)), state.edge);
    const k = (look && look.studio && look.studio.key) || [-0.62, 0.58, 0.52];
    group.getWorldQuaternion(qw).invert();
    U.csKey.value.copy(keyW.set(k[0], k[1], k[2]).normalize().applyQuaternion(qw));
  }
  group.traverse((o) => { if (o.isMesh && !o.material.transparent) o.onBeforeRender = sync; });
  function applyCull() {
    const h = culling && state.closed;
    if (h === hidden) return;
    hidden = h;
    for (const m of inner) m.visible = !h;
    syncFan();
  }

  // ---- hot and cold
  const cTint = new THREE.Color();
  let frostAuto = true;
  function applyHeat() {
    const c = state.temperature, w = sstep(25, 52, c), k = sstep(20, 12, c);
    state.tint = (w >= k ? w : -k) * tune.tint;
    U.csTint.value.copy(cTint.set(w >= k ? tune.warm : tune.cold));
    // the owner's cue for the mode: the tint is stronger toward the tray walls (the look only; the 3D viewer keeps its halo)
    state.edge = look ? Math.max(w, k) * tune.edge : 0;
    U.csState.value.w = state.edge;
    if (frostAuto) state.frost = sstep(tune.frostFrom, tune.frostFull, c);
    const a = state.frost;
    U.csFrost.value.set(-3 + a * (tune.frostReach + 3), a, Math.abs(state.tint), sstep(0, 0.3, a));
    if (!look) {                                   // no look (the 3D viewer): the halo and the pool still answer the mode
      const g = Math.max(w, k);
      ringMat.color.set(w >= k ? 0xf26a1e : 0x4f86f0); poolMat.color.copy(ringMat.color);
      ringMat.opacity = 0.6 * g; poolMat.opacity = 0.3 * g;
      ring.visible = pool.visible = g > 0.004;
    }
  }
  function setPlateTemperature(c) { state.temperature = c; applyHeat(); }
  function setFrost(a) { frostAuto = a === null || a === undefined; if (!frostAuto) state.frost = Math.min(1, Math.max(0, a)); applyHeat(); }

  // ---- fan
  function syncFan() {
    const k = sstep(0.8, 3, Math.abs(state.fan));
    blur.visible = !hidden && k > 0.01;
    blurMat.opacity = 0.93 * k;
  }
  function setFanSpeed(rps) { state.fan = rps || 0; syncFan(); }
  function update(dt) { if (state.fan && !hidden) rotor.rotation.y = (rotor.rotation.y - state.fan * Math.PI * 2 * dt) % (Math.PI * 2); }

  setPlateTemperature(22);
  setProgress(1);

  const counts = {};
  for (const r of list) { let n = 0; r.mesh.traverse((o) => { if (o.isMesh && o.geometry && !o.material.transparent) n += tris(o.geometry); }); counts[r.name] = Math.round(n); }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  let closedTris = 0, meshCount = 0;
  group.traverse((o) => { if (o.isMesh && !o.material.transparent) { meshCount++; if (!inner.includes(o)) closedTris += tris(o.geometry); } });
  const ready = Promise.all([atlas.ready, frost.ready]).then(() => true);

  return {
    group, duration: 4.0, height, footprint: Math.max(W, D), triangles: total, shadow, port, caseBounds, parts, tray, tune, state, look, ready,
    setProgress,
    getProgress: () => state.progress,
    getParts: () => list.map(({ name, mesh: m, explode, win }) => ({ name, mesh: m, explode, win })),
    setPlateTemperature, setFrost, setFanSpeed, update,
    setCull(on) { culling = !!on; applyCull(); },
    setShadowOpacity(a) { shadowMat.opacity = 0.55 * Math.min(1, Math.max(0, a)); shadow.visible = a > 0.001; },
    stats: () => {
      const l = sliceStats.list.slice().sort((a, b) => a - b);
      return { triangles: counts, total, closed: Math.round(closedTris), meshes: meshCount, inner: inner.length, textureBytes: atlas.bytes + frost.bytes, sliceMs: sliceStats.ms, slices: sliceStats.slices, p95SliceMs: l.length ? l[Math.floor(l.length * 0.95)] : 0, maxSliceMs: sliceStats.max, maxSliceAt: sliceStats.maxAt };
    },
    dispose() {
      model.dispose();
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
      for (const t of texs) t.dispose();
      if (ownLook) look.release();
    },
  };
}
