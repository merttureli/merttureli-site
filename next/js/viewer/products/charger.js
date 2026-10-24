// CHARGER on the viewer shell (next/js/viewer/viewer.js): the flight model, opened in place over the
// Studio home from the explorer tile or the hero rocket (#charger). Config API: docs/recipes/viewer.md.
//
// The rocket is the hero's own: createRocket() from hero3d.js builds the same eleven exterior meshes,
// livery and materials from next/assets/3d/charger-hero.* (the file the hero already loaded), and this
// module adds the seventeen interior parts from next/assets/3d/charger-explorer.* (cadmesh,
// tools/cad/explorer_to_cadmesh.py). Card text: assets/charger-explorer/part-stories.js, unchanged.
//
// Explode slides along the body axis: sections slide apart, each part keeps its true station in its
// section. The section cut runs through the body axis. The tour has five stops.
import { createRocket, LAYOUTS } from '../../hero3d.js';
import { fetchCadMesh, buildCadMesh } from '../../cad/cadmesh.js';
import { storyFor } from '../../../../assets/charger-explorer/part-stories.js';

const ASSETS = new URL('../../../assets/3d/', import.meta.url).href;
const FRONT_ANGLE = Math.atan2(1, 2.8);           // hero3d.js: the livery's front
const ROLL0 = -FRONT_ANGLE + LAYOUTS.land.roll;   // CHARGER lettering toward the camera

// Explode: how far each part slides along the body axis (metres, model space) at 100 %.
// Sections move apart in the order they are assembled: nose forward, the payload out of
// the upper tube, the coupler, recovery mount and altimeter between the tubes, the motor
// section out of the back (as it does for replacement) and the screw cap behind it.
const SLIDE = {
  0: .46,
  14: .25, 15: .25, 17: .25, 23: .25, 24: .25, 25: .25,
  1: 0, 10: 0,
  16: -.12, 13: -.12, 20: -.12, 21: -.12, 22: -.12, 27: -.12, 28: -.12, 29: -.12,
  26: .07, 12: .07,
  2: -.36, 11: -.36,
  18: -.62, 5: -.62, 6: -.62, 7: -.62, 8: -.62, 9: -.62,
  19: -.7,
};
// Part groups for the toggles, by the story category (part-stories.js).
const GROUPS = [
  ['airframe', 'Airframe', ['Airframe', 'Launch interface']],
  ['payload', 'Payload', ['Payload', 'Avionics', 'Electrical', 'Communications', 'Internal structure']],
  ['recovery', 'Recovery', ['Recovery']],
  ['motor', 'Motor', ['Propulsion', 'Motor retention']],
];
const EXTERIOR = [0, 1, 2, 6, 7, 8, 9, 10, 11];

let dataP = null;
// Fetch the interior model (and warm the hero's metadata). Safe to call many times.
export function prefetch() {
  if (!dataP) {
    dataP = Promise.all([fetchCadMesh(ASSETS + 'charger-explorer.json'), fetch(ASSETS + 'charger-hero.json').then(r => r.json())]);
    dataP.catch(() => { dataP = null; });
  }
  return dataP;
}

export default {
  slug: 'charger',
  name: 'CHARGER flight model',
  title: 'Take CHARGER apart',
  eyebrow: 'Interactive / The flight model',
  ghostWord: 'CHARGER',
  text: { close: 'Close the explorer', panel: 'Explorer controls', whole: 'Full rocket.', lost: '3D paused. Close and open the explorer again to restore it.' },
  fov: 24,
  roll0: ROLL0,
  base: port => [.16, 0, port ? .14 : 1.42],
  center: false,                                   // the hero's model keeps its own offset (body axis on the roll axis)
  uniqueMaterials: false,                          // one material per part already (hero meshes and the per-part cadmesh override)
  env: false,                                      // the rocket keeps the hero's look: never adopted (docs/design/3d.md)
  clearHead: false,                                // the rocket's frame runs under the title, as it always has
  ghost: { exterior: .07, interior: .16 },
  cut: { point: [0, 0, 0], far: .12 },             // through the body axis, swept in from outside
  groups: GROUPS.map(([key, label]) => ({ key, label })),
  sortParts: (a, b) => b.center.y - a.center.y,    // numbering: nose to tail by station
  tour: { stops: [0, 24, 26, 18, 6], ms: 3300 },   // nose, avionics bay, recovery, motor mount, fins
  prefetch,

  async build({ THREE }) {
    const [rocket, [data, heroMeta]] = await Promise.all([createRocket({ layout: 'land', base: ASSETS }), prefetch()]);
    // the hero's model group: outer > tilt > roll > model (hero3d.js createRocket); it keeps its
    // own offset that puts the body centre on the roll axis
    const model = rocket.group.children[0].children[0].children[0];
    model.removeFromParent();
    const ids = heroMeta.parts.map(p => p.id);
    if (ids.length !== model.children.length) throw new Error('explorer: hero model and its metadata disagree');
    const over = {};
    for (const p of data.meta.parts) over[p.name] = {};   // one material per part, so a part can ghost alone
    const cad = buildCadMesh(THREE, data.meta, data.buf, { materials: over });
    model.add(cad.group);
    const parts = [], BOX = new THREE.Box3();
    const add = (id, obj, meshes, box) => {
      const story = storyFor({ id });
      if (!story || story.category === 'Reference') return;
      parts.push({
        id, obj, meshes, box, label: story.label, kind: story.category,
        group: (GROUPS.find(g => g[2].includes(story.category)) || GROUPS[0])[0],
        exterior: EXTERIOR.includes(id), explode: [0, SLIDE[id] || 0, 0],
        card: { title: story.label, lede: story.subtitle, desc: story.description, rows: [['Role', story.role], ['Material', story.material]] },
      });
    };
    model.children.slice(0, ids.length).forEach((mesh, i) => {
      mesh.geometry.computeBoundingBox();
      add(ids[i], mesh, [mesh], mesh.geometry.boundingBox.clone());
    });
    for (const p of data.meta.parts) {
      const g = cad.parts[p.name], meshes = [];
      const box = new THREE.Box3();
      g.traverse(o => { if (o.isMesh) { meshes.push(o); o.geometry.computeBoundingBox(); box.union(BOX.copy(o.geometry.boundingBox).translate(g.position)); } });
      if (box.isEmpty()) box.setFromCenterAndSize(g.position, new THREE.Vector3(.004, .004, .004));
      add(p.id, g, meshes, box);
    }
    return { model, parts, dispose: () => cad.dispose() };
  },

  // where the rocket is drawn when it is clicked: the tile's poster or the hero
  poses: {
    // the tile's image (hero-land.webp, the land layout's still): its content box (object-fit:
    // contain) and any hover transform on it
    tile(tile, { THREE, Y }) {
      const img = tile.querySelector('.tile__media img');
      if (!img) return null;
      const box = img.parentElement.getBoundingClientRect();
      const a = 16 / 9, bw = box.width, bh = box.height;
      let w = bw, hh = bw / a;
      if (hh > bh) { hh = bh; w = bh * a; }
      let cx = box.left + bw / 2, cy = box.top + bh / 2, s = 1, rot = 0;
      const tr = getComputedStyle(img).transform;
      if (tr && tr !== 'none') {
        const m = new DOMMatrix(tr);
        s = Math.hypot(m.a, m.b); rot = Math.atan2(m.b, m.a); cx += m.e; cy += m.f;
      }
      w *= s; hh *= s;
      const L = LAYOUTS.land;
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(L.tiltX, 0, L.tiltZ)).multiply(new THREE.Quaternion().setFromAxisAngle(Y, ROLL0));
      return { q, p: new THREE.Vector3(), target: new THREE.Vector3(), dist: L.dist, camRoll: rot, R: { x: cx - w / 2, y: cy - hh / 2, w, h: hh } };
    },
    hero({ THREE }) {
      const r = window.__reel;
      if (!r || !r.rocket || !r.engine) return null;
      const hm = r.rocket.group.children[0] && r.rocket.group.children[0].children[0] && r.rocket.group.children[0].children[0].children[0];
      if (!hm) return null;
      hm.updateWorldMatrix(true, false);
      const M = new THREE.Matrix4().copy(hm.matrix).invert().premultiply(hm.matrixWorld);
      const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
      M.decompose(p, q, s);
      const b = r.engine.renderer.domElement.getBoundingClientRect();
      return { q, p, target: new THREE.Vector3(), dist: r.engine.camera.position.z, camRoll: 0, R: { x: b.left, y: b.top, w: b.width, h: b.height } };
    },
  },
};
