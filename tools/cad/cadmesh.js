// cadmesh.js: load a model written by `python3 tools/cad.py import` (format "cadmesh" v1).
// Canonical copy: tools/cad/cadmesh.js. `python3 tools/cad.py loader` copies it to next/js/cad/.
// No imports: pass the page's own THREE so every actor shares one three.js build.
//
//   import { loadCadMesh } from '../cad/cadmesh.js';
//   const model = await loadCadMesh(THREE, 'assets/3d/therma-shift.json');
//   group.add(model.group);
//
// Returns {
//   group                 THREE.Group named after the model; one child Group per part
//   getParts()            [{ name, mesh, explode }] in build order: the same shape as coaster.js getParts(),
//                         `mesh` is the part's Group (positioned at its pivot, the part's bounds center),
//                         `explode` a live Vector3 (meters) added to the assembled position at progress 0
//   parts                 { name: Group } by showreel name; a map "sub" becomes a named child Group at its own
//                         pivot (parts.blower.getObjectByName('rotor').rotation.y = a)
//   setProgress(p)        0 = exploded, 1 = assembled (smootherstep, no stagger; choreograph your own if needed)
//   materials             { key: MeshStandardMaterial } shared per palette key / color (one per key, so a
//                         tint like setPlateTemperature can edit materials.satinAluminum directly)
//   setPivot(name, [x,y,z]) move a part's or sub's pivot (parent space, meters) without moving it: hinges, axles
//   triangles, meta       triangle count; the parsed JSON (labels, CAD names, flags per part)
//   dispose()
// }
// Options: { materials: { partNameOrKey: THREE.Material | params }, side: THREE.DoubleSide, bin: url }
// Units meters, +Y up. A CAD part name maps to `name` through tools/cad/maps/<model>.json.
export async function loadCadMesh(THREE, url, opts = {}) {
  const { meta, buf } = await fetchCadMesh(url, opts);
  return buildCadMesh(THREE, meta, buf, opts);
}

// Fetch once, build many: actors whose factory is synchronous fetch at module top level
// (`const data = await fetchCadMesh(...)`; dynamic import() waits for it) and build in the factory.
export async function fetchCadMesh(url, opts = {}) {
  const abs = new URL(url, location.href);
  const res = await fetch(abs);
  if (!res.ok) throw new Error(`cadmesh: ${abs} ${res.status}`);
  const meta = await res.json();
  if (meta.format !== 'cadmesh' || meta.version !== 1) throw new Error(`cadmesh: ${abs} is not a cadmesh v1 file`);
  const binUrl = opts.bin || new URL(meta.bin, abs).href;
  // artifact previews rename .bin to .bin.wasm; try that before giving up
  let bres = await fetch(binUrl);
  if (!bres.ok) bres = await fetch(binUrl + '.wasm');
  if (!bres.ok) throw new Error(`cadmesh: ${binUrl} ${bres.status}`);
  return { meta, buf: await bres.arrayBuffer() };
}

export function buildCadMesh(THREE, meta, buf, opts = {}) {
  const [cx, cy, cz] = meta.center, s = meta.scale / 32767;
  const side = opts.side ?? THREE.DoubleSide, over = opts.materials || {};
  const group = new THREE.Group();
  group.name = meta.name;
  const materials = {}, geos = [], list = [], parts = {};
  const mat = (m, partName) => {
    const o = over[partName] || over[m.key];
    if (o && o.isMaterial) return o;
    const key = o ? `${partName}:${m.key || m.color}` : (m.key || m.color);
    if (!materials[key]) materials[key] = new THREE.MeshStandardMaterial({ color: m.color, roughness: m.roughness, metalness: m.metalness, side, ...(o || {}) });
    return materials[key];
  };
  let triangles = 0;
  for (const p of meta.parts) {
    const part = new THREE.Group();
    part.name = p.name;
    part.position.fromArray(p.pivot);
    part.userData = { label: p.label, cad: p.cad, exterior: p.exterior, referenceOnly: p.referenceOnly };
    const subs = {};
    for (const [name, piv] of Object.entries(p.subs || {})) {
      const g = new THREE.Group();
      g.name = name;
      g.position.set(piv[0] - p.pivot[0], piv[1] - p.pivot[1], piv[2] - p.pivot[2]);
      part.add(g);
      subs[name] = g;
    }
    for (const pr of p.prims) {
      const [px, py, pz] = pr.sub ? p.subs[pr.sub] : p.pivot, n = pr.pos[1];
      const q = new Int16Array(buf, pr.pos[0], n * 3), pos = new Float32Array(n * 3);
      for (let i = 0; i < n * 3; i += 3) {
        pos[i] = q[i] * s + cx - px; pos[i + 1] = q[i + 1] * s + cy - py; pos[i + 2] = q[i + 2] * s + cz - pz;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const [io, ic, bits] = pr.idx;
      g.setIndex(new THREE.BufferAttribute(bits === 32 ? new Uint32Array(buf, io, ic) : new Uint16Array(buf, io, ic), 1));
      if (pr.nrm != null) g.setAttribute('normal', new THREE.BufferAttribute(new Int8Array(buf, pr.nrm, n * 3), 3, true));
      else g.computeVertexNormals();
      g.computeBoundingSphere();
      geos.push(g);
      const mesh = new THREE.Mesh(g, mat(pr.material, p.name));
      mesh.name = `${pr.sub || p.name}:${pr.material.key || pr.material.color}`;
      (pr.sub ? subs[pr.sub] : part).add(mesh);
      triangles += ic / 3;
    }
    group.add(part);
    parts[p.name] = part;
    list.push({ name: p.name, mesh: part, explode: new THREE.Vector3().fromArray(p.explode), base: part.position.clone() });
  }
  const smoother = t => t * t * t * (t * (t * 6 - 15) + 10);
  function setProgress(p) {
    const k = 1 - smoother(Math.min(1, Math.max(0, p)));
    for (const r of list) r.mesh.position.copy(r.base).addScaledVector(r.explode, k);
  }
  // Move a part's (or a sub's) pivot to a point in its parent's space without moving what you see:
  // hinges, axles, pedal pivots. Use origin "keep" in the map so CAD coordinates read straight (mm / 1000).
  function setPivot(target, point) {
    const obj = typeof target === 'string' ? (parts[target] || group.getObjectByName(target)) : target;
    if (!obj) throw new Error(`cadmesh: no part or sub named ${target}`);
    const d = new THREE.Vector3().fromArray(point).sub(obj.position);
    for (const c of obj.children) c.position.sub(d);
    obj.position.add(d);
    const r = list.find(r => r.mesh === obj);
    if (r) r.base.add(d);
    return obj;
  }
  return {
    group, parts, materials, triangles, meta, setProgress, setPivot,
    getParts: () => list.map(({ name, mesh, explode }) => ({ name, mesh, explode })),
    dispose() {
      for (const g of geos) g.dispose();
      for (const m of Object.values(materials)) m.dispose();
      group.removeFromParent();
    },
  };
}
