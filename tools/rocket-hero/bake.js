// Offline bake (run through tools/rocket-hero/bake-run.js). Uses the same scene code as the
// live hero, so the still and the line drawing register with the live render to the pixel.
import * as THREE from 'three';
import { createLivery } from '/assets/charger-explorer/livery.js';
import { makeView, buildModel, VIEW, makeRig } from './src/scene.js';

const EXP = '/assets/charger-explorer/';

async function livery() {
  await document.fonts.load('700 32px "Space Grotesk"');
  const paint = createLivery(), g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
  return paint({ id: 1 }, g).map;
}

async function hero(opts = {}) {
  const [meta, buf] = await Promise.all([fetch('/assets/rocket/charger-live.json').then(r => r.json()), fetch('/assets/rocket/charger-live.bin').then(r => r.arrayBuffer())]);
  let map;
  if (opts.liveryUrl) {
    const img = new Image(); img.src = opts.liveryUrl; await img.decode();
    map = new THREE.Texture(img); map.colorSpace = THREE.SRGBColorSpace; map.wrapS = THREE.RepeatWrapping; map.anisotropy = 4; map.needsUpdate = true;
  } else map = await livery();
  return { meta, buf, map };
}

window.bakeLivery = async () => (await livery()).image.toDataURL('image/png');

window.renderStill = async ({ roll = 0, height = 1200, toneMapping = false, liveryUrl = null, bg = null, rig = null } = {}) => {
  const { meta, buf, map } = await hero({ liveryUrl });
  const canvas = document.createElement('canvas'); document.body.appendChild(canvas);
  const v = makeView({ canvas, preserve: true, toneMapping });
  if (rig) { v.scene.remove(v.scene.children[0]); v.scene.add(makeRig(rig)); }
  if (bg !== null) v.renderer.setClearColor(bg, 1);
  v.model.add(buildModel(meta, buf, map));
  v.renderer.setPixelRatio(1); v.renderer.setSize(Math.round(height * VIEW.aspect), height, false);
  v.setRoll(roll); v.render();
  const url = canvas.toDataURL('image/png'); canvas.remove(); v.renderer.dispose();
  return url;
};

// Line drawing: the explorer's CAD edges for every part plus the outline of every surface,
// white on transparent; shell lines at full strength, internals at 70%.
window.renderLine = async ({ roll = 0, height = 1200, interior = .7 } = {}) => {
  const [meta, buf] = await Promise.all([fetch(EXP + 'assembly.json').then(r => r.json()), fetch(EXP + 'assembly.bin').then(r => r.arrayBuffer())]);
  const canvas = document.createElement('canvas'); document.body.appendChild(canvas);
  const v = makeView({ canvas, preserve: true });
  v.setRoll(roll);
  v.scene.updateMatrixWorld(true);
  const inv = v.model.matrixWorld.clone().invert(), eye = v.camera.position.clone().applyMatrix4(inv);
  for (const p of meta.parts) {
    if (p.referenceOnly) continue;
    const segs = p.mesh ? [outline(new Float32Array(buf, p.mesh.vertexOffset, p.mesh.vertexCount), new Uint32Array(buf, p.mesh.indexOffset, p.mesh.indexCount), eye)] : [new Float32Array(buf, p.wire.offset, p.wire.count)];
    for (const s of segs) {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(s, 3));
      v.model.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: p.exterior ? 1 : interior, depthTest: false, depthWrite: false })));
    }
  }
  v.renderer.setPixelRatio(1); v.renderer.setSize(Math.round(height * VIEW.aspect), height, false);
  v.render();
  const url = canvas.toDataURL('image/png'); canvas.remove(); v.renderer.dispose();
  return url;
};

// Drawing edges on a mesh welded by position (CAD exports split vertices at seams): the
// silhouette (one face toward the eye, one away), creases sharper than 35 degrees, open edges.
function outline(pos, idx, eye) {
  const key = i => `${Math.round(pos[i * 3] * 1e5)},${Math.round(pos[i * 3 + 1] * 1e5)},${Math.round(pos[i * 3 + 2] * 1e5)}`;
  const weld = new Map(), id = new Int32Array(pos.length / 3);
  for (let i = 0; i < id.length; i++) { const k = key(i); if (!weld.has(k)) weld.set(k, i); id[i] = weld.get(k); }
  const edges = new Map(), out = [], crease = Math.cos(35 * Math.PI / 180);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), e = new THREE.Vector3();
  for (let t = 0; t < idx.length; t += 3) {
    const [i0, i1, i2] = [id[idx[t]], id[idx[t + 1]], id[idx[t + 2]]];
    a.fromArray(pos, i0 * 3); b.fromArray(pos, i1 * 3); c.fromArray(pos, i2 * 3);
    n.subVectors(b, a).cross(e.subVectors(c, a));
    if (n.lengthSq() < 1e-16) continue;
    n.normalize();
    const front = n.dot(e.copy(eye).sub(a)) > 0, nx = n.x, ny = n.y, nz = n.z;
    for (const [p, q] of [[i0, i1], [i1, i2], [i2, i0]]) {
      const k = p < q ? p + ':' + q : q + ':' + p, prev = edges.get(k);
      if (prev === undefined) edges.set(k, { p, q, front, nx, ny, nz, faces: 1 });
      else if (prev.faces === 1) {
        prev.faces = 2;
        const dot = Math.abs(prev.nx * nx + prev.ny * ny + prev.nz * nz);
        if (prev.front !== front || dot < crease) out.push(p, q);
      }
    }
  }
  for (const e of edges.values()) if (e.faces === 1) out.push(e.p, e.q);
  const f = new Float32Array(out.length * 3);
  out.forEach((i, j) => { f[j * 3] = pos[i * 3]; f[j * 3 + 1] = pos[i * 3 + 1]; f[j * 3 + 2] = pos[i * 3 + 2]; });
  return f;
}
window.bakeReady = true;
