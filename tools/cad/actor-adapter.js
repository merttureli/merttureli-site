// CAD-backed Therma-Shift coaster: a drop-in for next/js/showreel/coaster.js with the SAME module API
// (create({ THREE, renderer, quality }) -> { group, duration, setProgress, getParts, parts, setPlateTemperature,
// setFanSpeed, update, triangles, height, dispose }), built from a cadmesh model instead of procedural geometry.
//
// Template: tools/cad/actor-adapter.js. To use it (docs/recipes/cad-import.md, "Swap the procedural coaster"):
//   python3 tools/cad.py import OWNER.step --map tools/cad/maps/therma-shift.json   (-> next/assets/3d/therma-shift.*)
//   python3 tools/cad.py loader                                                     (-> next/js/cad/cadmesh.js)
//   cp tools/cad/actor-adapter.js next/js/showreel/coaster.js
// The model loads at module top level, so `import('./coaster.js')` in showreel/index.js resolves only once the
// geometry is in; if the files are missing the import fails and index.js falls back to its placeholder coaster.
// For another project, change MODEL and WINDOWS and keep the rest.
import * as THREE_ from '../three.module.min.js';
import { fetchCadMesh, buildCadMesh } from '../cad/cadmesh.js';

const MODEL = new URL('../../assets/3d/therma-shift.json', import.meta.url);
const DATA = await fetchCadMesh(MODEL);

// Arrival window [start, end] in progress p per part, and lateral-first (slides in over the rim, then drops):
// the same choreography as the procedural coaster.js. Parts not listed arrive in getParts() order.
const WINDOWS = {
  shell: [0.00, 0.40], blower: [0.12, 0.50], board: [0.18, 0.58, true], heatsink: [0.28, 0.64],
  peltier: [0.40, 0.74], thermistor: [0.50, 0.84, true], topPlate: [0.56, 0.90], screws: [0.66, 1.00],
};
const HIDE_WHEN_ASSEMBLED = ['peltier', 'thermistor'];   // covered by the plate at p = 1: skip their draws

export default function create({ THREE = THREE_, renderer, quality = 'high' } = {}) {
  // the plate gets its own material so the temperature tint touches nothing else
  const model = buildCadMesh(THREE, DATA.meta, DATA.buf, { materials: { topPlate: {} } });
  const group = model.group;
  group.name = 'thermaShiftCoaster';

  // coaster.js convention: the top surface center of the plate is the group origin
  const box = new THREE.Box3();
  const plate = model.parts.topPlate;
  if (plate) {
    box.setFromObject(plate);
    const lift = box.max.y, cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
    for (const p of Object.values(model.parts)) p.position.set(p.position.x - cx, p.position.y - lift, p.position.z - cz);
  }
  const height = -new THREE.Box3().setFromObject(group).min.y;

  const parts = model.getParts();
  const list = parts.map((p, i) => {
    const w = WINDOWS[p.name] || [Math.min(.6, i / parts.length * .6), Math.min(1, i / parts.length * .6 + .4)];
    return { ...p, base: p.mesh.position.clone(), win: w, lat: !!w[2] };
  });
  const smoother = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  let progress = 1;
  function setProgress(p) {
    progress = p = Math.min(1, Math.max(0, p));
    for (const r of list) {
      const t = Math.min(1, Math.max(0, (p - r.win[0]) / (r.win[1] - r.win[0])));
      if (r.lat) {
        const kl = 1 - smoother(Math.min(1, t / 0.45)), kv = 1 - smoother(Math.max(0, (t - 0.3) / 0.7));
        r.mesh.position.set(r.base.x + r.explode.x * kl, r.base.y + r.explode.y * kv, r.base.z + r.explode.z * kl);
      } else {
        r.mesh.position.copy(r.base).addScaledVector(r.explode, 1 - smoother(t));
      }
    }
    for (const n of HIDE_WHEN_ASSEMBLED) if (model.parts[n]) model.parts[n].visible = p < 1;
  }

  // Plate temperature tint: same colors as coaster.js
  const plateMats = [];
  if (plate) plate.traverse((o) => { if (o.isMesh && !plateMats.includes(o.material)) plateMats.push(o.material); });
  const cNeutral = new THREE.Color(0xd3d7dd), cWarm = new THREE.Color(0xddcdb9), cCold = new THREE.Color(0xccd8e6);
  const eWarm = new THREE.Color(0xff7a2e), eCold = new THREE.Color(0x8fc2ff), black = new THREE.Color(0);
  const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  function setPlateTemperature(c) {
    const w = sstep(28, 66, c), k = sstep(20, 2, c);
    for (const m of plateMats) {
      m.color.copy(cNeutral).lerp(cWarm, w).lerp(cCold, k);
      m.emissive.copy(black).lerp(eWarm, w * 0.05).lerp(eCold, k * 0.03);
      m.roughness = 0.4 + k * 0.08;
    }
  }

  const rotor = model.parts.blower && model.parts.blower.getObjectByName('rotor');
  let fanSpeed = 0;
  setPlateTemperature(22);
  setProgress(1);

  return {
    group, duration: 4.0, parts: model.parts, triangles: model.triangles, height,
    setProgress,
    getProgress: () => progress,
    getParts: () => list.map(({ name, mesh, explode }) => ({ name, mesh, explode })),
    setPlateTemperature,
    setFanSpeed(rps) { fanSpeed = rps || 0; },
    update(dt) { if (fanSpeed && rotor) rotor.rotation.y -= dt * fanSpeed * Math.PI * 2; },
    dispose() { model.dispose(); },
  };
}
