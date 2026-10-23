// CHARGER hero object: the real flight-model exterior, rendered live.
// Loaded only after the page is idle. The poster <img> stays underneath, so
// a missing or slow WebGL simply leaves the identical still in place.
// The rocket is one actor in the shared showreel scene (showreel/engine.js
// owns the renderer, camera and lights; showreel/index.js the sequence).
import * as THREE from './three.module.min.js';
import { createEngine } from './showreel/engine.js';

const BODY_TOP = .370693, BODY_BOTTOM = -.570693, FRONT_ANGLE = Math.atan2(1, 2.8);

// Framing per layout. The poster files are rendered with these same numbers.
export const LAYOUTS = {
  land: { aspect: 16 / 9, roll: .34, tiltZ: 1.16, tiltX: .16, dist: 2.2, fov: 24, shiftX: 0, shiftY: .0 },
  port: { aspect: 3 / 4, roll: .34, tiltZ: .6, tiltX: .16, dist: 3.0, fov: 24, shiftX: 0, shiftY: 0 }
};

function bodyUV(x, y, z) {
  let u = .5 + (Math.atan2(x, z) - FRONT_ANGLE) / (2 * Math.PI);
  u = ((u % 1) + 1) % 1;
  return [u, (y - BODY_BOTTOM) / (BODY_TOP - BODY_BOTTOM)];
}
function wrap(geometry) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  const pos = g.getAttribute('position'), uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i += 3) {
    const tri = [0, 1, 2].map(j => bodyUV(pos.getX(i + j), pos.getY(i + j), pos.getZ(i + j)));
    if (Math.max(...tri.map(p => p[0])) - Math.min(...tri.map(p => p[0])) > .5) for (const p of tri) if (p[0] < .5) p[0] += 1;
    tri.forEach((p, j) => uv.set(p, (i + j) * 2));
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}
// Same livery as the explorer: orange body, red bands, vertical CHARGER / UCRC / 2026.
function livery() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 2048;
  const ctx = c.getContext('2d');
  const py = y => (BODY_TOP - y) / (BODY_TOP - BODY_BOTTOM) * c.height;
  ctx.fillStyle = '#d63b08'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#890919';
  for (const [t, b] of [[BODY_TOP, .352], [-.067, -.085]]) ctx.fillRect(0, py(t), c.width, py(b) - py(t));
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const letters = (text, y0, step, h) => {
    ctx.font = `800 ${h / (BODY_TOP - BODY_BOTTOM) * c.height}px Archivo, sans-serif`;
    [...text].forEach((l, i) => ctx.fillText(l, c.width / 2, py(y0 - i * step), 80));
  };
  letters('CHARGER', .318, .056, .040); letters('UCRC', -.121, .044, .037); letters('2026', -.355, .043, .036);
  const bolt = [[9, -.281], [-15, -.315], [-3, -.315], [-10, -.341], [16, -.305], [3, -.305]];
  ctx.beginPath();
  bolt.forEach(([x, y], i) => { const px = c.width / 2 + x * c.width / (2 * Math.PI * 34); i ? ctx.lineTo(px, py(y)) : ctx.moveTo(px, py(y)); });
  ctx.closePath(); ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = THREE.RepeatWrapping; tex.anisotropy = 8;
  return tex;
}

// Resolved from this module, not the page, so the live root pages (which load next/js/) find the model too.
const MODEL_BASE = new URL('../assets/3d/', import.meta.url).href;

async function loadModel(base) {
  const [meta, buf] = await Promise.all([
    fetch(base + 'charger-hero.json').then(r => r.json()),
    fetch(base + 'charger-hero.bin').then(r => r.arrayBuffer())
  ]);
  const q = new Int16Array(buf, 0, meta.indexByteOffset / 2), s = meta.scale / 32767, [cx, cy, cz] = meta.center;
  const tex = livery(), group = new THREE.Group();
  for (const p of meta.parts) {
    const src = q.subarray(p.vOff, p.vOff + p.vCount), pos = new Float32Array(p.vCount);
    for (let i = 0; i < p.vCount; i += 3) { pos[i] = src[i] * s + cx; pos[i + 1] = src[i + 1] * s + cy; pos[i + 2] = src[i + 2] * s + cz; }
    let g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(new THREE.BufferAttribute(new Uint16Array(buf, meta.indexByteOffset + p.iOff * 2, p.iCount), 1));
    let mat;
    if (p.id === 1 || p.id === 2) { g = wrap(g); mat = { color: 0xffffff, map: tex, roughness: .5, metalness: 0 }; }
    else {
      g.computeVertexNormals();
      if (p.id === 0 || (p.id >= 6 && p.id <= 9)) mat = { color: 0xf1f1ee, roughness: .45, metalness: 0 };
      else if (p.id === 19) mat = { color: 0x890919, roughness: .38, metalness: .1 };
      else if (p.id === 10 || p.id === 11) mat = { color: 0x1d1e21, roughness: .5, metalness: .1 };
      else mat = { color: 0x8c9096, roughness: .35, metalness: .5 };
    }
    group.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, ...mat })));
  }
  // centre on the body so roll spins about the airframe axis
  group.position.y = -(BODY_TOP + BODY_BOTTOM) / 2 + .02;
  return group;
}

// The rocket actor: framing, sway, pointer parallax and the scroll roll/lift,
// plus `fly` (offset along the airframe axis, + is nose first) and `spin`
// (extra roll) for the showreel to fly it out and back.
export async function createRocket({ layout = 'land', base = MODEL_BASE } = {}) {
  await document.fonts.load('800 40px Archivo').catch(() => {});
  const L = { ...LAYOUTS[layout] };
  const outer = new THREE.Group(), tilt = new THREE.Group(), roll = new THREE.Group();
  outer.add(tilt); tilt.add(roll);
  roll.add(await loadModel(base));
  tilt.rotation.z = L.tiltZ; tilt.rotation.x = L.tiltX;
  const state = { scroll: 0, px: 0, py: 0, sx: 0, sy: 0, fly: 0, spin: 0 };
  const axis = { x: 0, y: 1 };
  function pose(time) {
    state.sx += (state.px - state.sx) * .06; state.sy += (state.py - state.sy) * .06;
    const sway = Math.sin(time * .00032) * .32;
    roll.rotation.y = -FRONT_ANGLE + L.roll + sway + state.scroll * 1.6 + state.spin;
    outer.rotation.y = state.sx * .16; outer.rotation.x = -state.sy * .1;
    // lift along the airframe axis as the page scrolls
    const a = L.tiltZ + Math.PI / 2, lift = state.scroll * .55 + state.fly;
    axis.x = Math.cos(a); axis.y = Math.sin(a);
    outer.position.set(axis.x * lift + L.shiftX, axis.y * lift + L.shiftY + Math.sin(time * .0007) * .012, 0);
  }
  function setLayout(name) { Object.assign(L, LAYOUTS[name]); tilt.rotation.z = L.tiltZ; tilt.rotation.x = L.tiltX; }
  function settle(time = 0) { state.sx = state.px; state.sy = state.py; pose(time); }
  pose(0);
  return { group: outer, state, layout: L, axis, pose, setLayout, settle };
}

export function applyCamera(camera, L) { camera.fov = L.fov; camera.position.set(0, 0, L.dist); camera.updateProjectionMatrix(); }

// Standalone still/loop of the rocket alone (poster renders, other studies).
export async function createHero({ canvas, layout = 'land', base = MODEL_BASE, preserve = false, pixelRatio }) {
  const engine = createEngine({ canvas, preserve, pixelRatio });
  const rocket = await createRocket({ layout, base });
  engine.scene.add(rocket.group);
  applyCamera(engine.camera, rocket.layout);
  const { renderer, scene, camera } = engine;
  function setLayout(name) { rocket.setLayout(name); applyCamera(camera, rocket.layout); }
  function render(time = 0) { rocket.pose(time); renderer.render(scene, camera); }
  return { renderer, size: engine.size, render, state: rocket.state, setLayout, still(time = 0) { rocket.settle(time); renderer.render(scene, camera); } };
}

// Page integration lives in showreel/index.js; kept as an alias.
export function mountHero(box, opts = {}) { return import('./showreel/index.js').then(m => m.mountShowreel({ box, ...opts })); }
