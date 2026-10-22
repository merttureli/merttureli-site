/* Geometry loader for the stage.
   Fetches assembly.json and assembly.bin from their published location
   (resolved against this module, not the page) and builds the three.js
   groups exactly as the CHARGER explorer does (assets/charger-explorer/app.js):
     edges   Float32Array(buffer, part.wire.offset, part.wire.count)  -> LineSegments
     meshes  Float32Array(buffer, mesh.vertexOffset, mesh.vertexCount) +
             Uint32Array(buffer, mesh.indexOffset, mesh.indexCount)   -> Mesh
   Positions in the bin are metres (nose tip y = +0.5707, cap bottom -0.6102,
   body radius 0.034); bounds in the json are millimetres. The livery is painted
   by createLivery() from livery.js so the paint is the published paint. */
import * as THREE from 'three';
import { createLivery } from '../../../assets/charger-explorer/livery.js';
import { storyFor } from '../../../assets/charger-explorer/part-stories.js';
import { centreOf } from './explode.js';
import { HIDDEN_IDS } from '../data/stations.js';

export const JSON_URL = new URL('../../../assets/charger-explorer/assembly.json', import.meta.url);
export const BIN_URL = new URL('../../../assets/charger-explorer/assembly.bin', import.meta.url);

/* assembly.json only (15 KB): enough for the part list when there is no WebGL. */
export async function loadManifest({ signal } = {}) {
  const r = await fetch(JSON_URL, { signal });
  if (!r.ok) throw new Error(`assembly.json HTTP ${r.status}`);
  return r.json();
}

/* Both files. onProgress({received, total}) fires per chunk while the bin streams. */
export async function loadGeometry({ onProgress, signal } = {}) {
  const json = await loadManifest({ signal });
  const r = await fetch(BIN_URL, { signal });
  if (!r.ok) throw new Error(`assembly.bin HTTP ${r.status}`);
  let buffer;
  if (onProgress && r.body && typeof r.body.getReader === 'function') {
    const total = Number(json.bytes) || Number(r.headers.get('content-length')) || 0;
    const chunks = []; let received = 0;
    const reader = r.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value); received += value.byteLength;
      onProgress({ received, total });
    }
    const bytes = new Uint8Array(received); let o = 0;
    for (const c of chunks) { bytes.set(c, o); o += c.byteLength; }
    buffer = bytes.buffer;
  } else {
    buffer = await r.arrayBuffer();
  }
  if (buffer.byteLength !== json.bytes) throw new Error(`Geometry is ${buffer.byteLength} B, manifest says ${json.bytes} B. Reload the page.`);
  return { json, buffer };
}

/* Enrich the manifest's parts with the explorer's stories and metre-space
   centre and bounds. Pure data: safe without WebGL. */
export function describeParts(json) {
  return json.parts.map(p => {
    const s = storyFor(p) || {};
    const bounds = [p.bounds[0].map(v => v * 0.001), p.bounds[1].map(v => v * 0.001)];
    return {
      id: p.id,
      label: s.label || p.label || `Part ${p.id}`,
      category: s.category || '',
      subtitle: s.subtitle || '',
      description: s.description || '',
      role: s.role || '',
      material: s.material || null,
      center: centreOf(p),
      bounds,
      size: [bounds[1][0] - bounds[0][0], bounds[1][1] - bounds[0][1], bounds[1][2] - bounds[0][2]],
      exterior: !!p.exterior,
      referenceOnly: !!p.referenceOnly || HIDDEN_IDS.includes(p.id),
      hasMesh: !!p.mesh,
      raw: p,
    };
  });
}

/* Build one THREE.Group per part under `root`. Returns [{part, group, wire, mesh, bounds}].
   Reference envelopes get no geometry at all (never drawn, nothing uploaded). */
export function buildScene({ json, buffer, root, parts = describeParts(json) }) {
  const paintPart = createLivery();
  const entries = [];
  for (const part of parts) {
    const p = part.raw;
    const group = new THREE.Group();
    group.userData.part = part;
    const entry = { part, group, wire: null, mesh: null, bounds: new THREE.Box3(), liveryColor: null, texture: null };
    if (!part.referenceOnly) {
      const wireGeometry = new THREE.BufferGeometry();
      wireGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(buffer, p.wire.offset, p.wire.count), 3));
      wireGeometry.computeBoundingBox();
      const wire = new THREE.LineSegments(wireGeometry, new THREE.LineBasicMaterial({ transparent: true, depthWrite: false }));
      wire.userData.part = part; group.add(wire); entry.wire = wire;
      entry.bounds.copy(wireGeometry.boundingBox);
      if (p.mesh) {
        const m = p.mesh, geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(buffer, m.vertexOffset, m.vertexCount), 3));
        geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(buffer, m.indexOffset, m.indexCount), 1));
        geometry.computeVertexNormals(); geometry.computeBoundingBox();
        entry.bounds.union(geometry.boundingBox);
        const paint = paintPart(p, geometry), { geometry: paintedGeometry, ...finish } = paint || {};
        const mesh = new THREE.Mesh(paintedGeometry || geometry, new THREE.MeshStandardMaterial({
          metalness: .22, roughness: .4, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, ...finish,
        }));
        mesh.userData.part = part; group.add(mesh); entry.mesh = mesh;
        if (paint) { entry.liveryColor = paint.color; entry.texture = paint.map || null; }
      }
    }
    root.add(group); entries.push(entry);
  }
  return entries;
}

/* Release everything buildScene uploaded. */
export function disposeScene(entries) {
  const textures = new Set();
  for (const e of entries) {
    for (const obj of [e.wire, e.mesh]) {
      if (!obj) continue;
      obj.geometry.dispose();
      if (obj.material.map) textures.add(obj.material.map);
      obj.material.dispose();
    }
    e.group.removeFromParent();
  }
  for (const t of textures) t.dispose();
}
