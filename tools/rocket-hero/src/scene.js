// The hero rocket scene. Built from the explorer's own triangles, livery and materials
// (assets/charger-explorer/app.js and livery.js), so the seated rocket and the explorer match.
import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Mesh, BufferGeometry, BufferAttribute,
  MeshStandardMaterial, HemisphereLight, DirectionalLight, DoubleSide, Quaternion, Vector3,
  NeutralToneMapping, NoToneMapping, SRGBColorSpace
} from 'three';
import { bodyUV } from '../../../assets/charger-explorer/livery.js';
import { smoothNoseNormals } from '../../../assets/charger-explorer/nose-normals.js';
import { VIEW, HERO_RIG } from '../../../assets/rocket/rig.js';

export { VIEW, HERO_RIG };

export function makeRig(rig = HERO_RIG) {
  const group = new Group();
  for (const l of rig) {
    if (l.type === 'hemi') group.add(new HemisphereLight(l.sky, l.ground, l.intensity));
    else { const d = new DirectionalLight(l.color, l.intensity); d.position.set(...l.position); group.add(d); }
  }
  return group;
}

// Same as livery.js wrapGeometry: one paint sheet in assembly coordinates.
function wrapGeometry(source) {
  const geometry = source.toNonIndexed(), positions = geometry.getAttribute('position'), uv = new Float32Array(positions.count * 2);
  for (let i = 0; i < positions.count; i += 3) {
    const triangle = [0, 1, 2].map(j => bodyUV(positions.getX(i + j), positions.getY(i + j), positions.getZ(i + j)));
    if (Math.max(...triangle.map(p => p[0])) - Math.min(...triangle.map(p => p[0])) > .5) for (const point of triangle) if (point[0] < .5) point[0] += 1;
    triangle.forEach((point, j) => uv.set(point, (i + j) * 2));
  }
  geometry.setAttribute('uv', new BufferAttribute(uv, 2));
  source.dispose();
  return geometry;
}

// The explorer's finishes (app.js material + livery.js paint + applyAppearance colours).
function finishFor(id, map) {
  const base = { metalness: .22, roughness: .4, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 };
  if (id === 1 || id === 2) return { ...base, color: 0xffffff, map, metalness: 0, roughness: .58 };
  if (id === 0 || (id >= 6 && id <= 9)) return { ...base, color: 0xeeeeeb, metalness: 0, roughness: .58 };
  if (id === 19) return { ...base, color: 0x890919, metalness: .08, roughness: .4 };
  if (id === 10 || id === 11) return { ...base, color: 0xc8c8c5 };
  return { ...base, color: 0x9c9c99 };
}

export function buildModel(meta, buf, map) {
  const group = new Group(), [cx, cy, cz] = meta.center, s = meta.step;
  for (const part of meta.parts) {
    const [vo, vn] = part.verts, [io, ic] = part.index, q = new Int16Array(buf, vo, vn * 3), pos = new Float32Array(vn * 3);
    for (let i = 0; i < pos.length; i += 3) { pos[i] = q[i] * s + cx; pos[i + 1] = q[i + 1] * s + cy; pos[i + 2] = q[i + 2] * s + cz; }
    let g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(pos, 3));
    g.setIndex(new BufferAttribute(new Uint32Array(new Uint16Array(buf, io, ic)), 1));
    g.computeVertexNormals();
    if (part.id === 0) smoothNoseNormals(g);
    if (part.id === 1 || part.id === 2) g = wrapGeometry(g);
    group.add(new Mesh(g, new MeshStandardMaterial(finishFor(part.id, map))));
  }
  return group;
}

// Rocket rotation for a roll (degrees) in the hero camera frame: pitched toward the camera,
// then turned so roll 0 shows the lettering.
const _qa = new Quaternion(), _qb = new Quaternion(), X = new Vector3(1, 0, 0), Y = new Vector3(0, 1, 0);
export function poseQuaternion(rollDeg, out = new Quaternion()) {
  _qa.setFromAxisAngle(X, VIEW.pitch);
  _qb.setFromAxisAngle(Y, -VIEW.front + rollDeg * Math.PI / 180);
  return out.copy(_qa).multiply(_qb);
}

export function makeView({ canvas, antialias = true, preserve = false, toneMapping = false }) {
  const renderer = new WebGLRenderer({ canvas, antialias, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: preserve, powerPreference: 'low-power' });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = toneMapping ? NeutralToneMapping : NoToneMapping;
  const scene = new Scene();
  scene.add(makeRig());
  const camera = new PerspectiveCamera(VIEW.fov, VIEW.aspect, VIEW.dist - .5, VIEW.dist + .5);
  camera.position.set(0, 0, VIEW.dist);
  // spin rotates about the rocket's middle; model sits so that point is at the origin.
  const spin = new Group(), model = new Group();
  model.position.y = -VIEW.cy;
  spin.add(model); scene.add(spin);
  const setRoll = deg => poseQuaternion(deg, spin.quaternion);
  setRoll(0);
  return { renderer, scene, camera, spin, model, setRoll, render() { renderer.render(scene, camera); } };
}
