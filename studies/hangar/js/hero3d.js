// Live CHARGER render for the hero, built straight from assembly.glb.
// One model, one renderer, rendered only while the hero is on screen.
// The same code renders the poster stills (?poster=wide|tall|xray), so the
// still and the live canvas line up to the pixel when the canvas fades in.
import * as THREE from '../vendor/three.module.min.js';

const GLB = '../../assets/charger-explorer/assembly.glb';
// glb node index -> role. Names in the file are SolidWorks leftovers, so roles
// are assigned by index (checked against the geometry bounds).
const NOSE = 0, TUBES = [1, 2], MOTOR = 3, FINS = [4, 5, 6, 7], RAIL = [8, 9], CAP = 16;
const EXTERIOR = new Set([NOSE, ...TUBES, MOTOR, ...FINS, ...RAIL, CAP]);
const AFT_Y = -0.6102, NOSE_Y = 0.5707, MID_Y = (AFT_Y + NOSE_Y) / 2;

// Framing per layout. aspect must match the CSS box (.rocket-stage) for that pose.
export const POSES = {
  wide: { aspect: 3.1, tilt: 0.075, yaw: -0.34, pitch: 0.12, roll: 0.0, fov: 15, margin: 0.92 },
  tall: { aspect: 0.46, tilt: 1.33, yaw: -0.30, pitch: 0.10, roll: 0.0, fov: 20, margin: 0.94 },
  xray: { aspect: 2.4, tilt: 0.16, yaw: -0.42, pitch: 0.18, roll: 0.0, fov: 16, margin: 0.9 },
};

// ---------------------------------------------------------------- glb parse
async function loadGLB(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('model unavailable');
  const buf = await res.arrayBuffer();
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('not a glb');
  const jsonLen = dv.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jsonLen)));
  const bin = 20 + jsonLen + 8;
  const SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
  const TYPE = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array };
  const read = i => {
    const a = json.accessors[i], v = json.bufferViews[a.bufferView], T = TYPE[a.componentType];
    const start = bin + (v.byteOffset || 0) + (a.byteOffset || 0);
    return new T(buf.slice(start, start + a.count * SIZE[a.type] * T.BYTES_PER_ELEMENT));
  };
  return json.nodes.map((node, i) => {
    const p = json.meshes[node.mesh].primitives[0];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(read(p.attributes.POSITION), 3));
    g.setIndex(new THREE.BufferAttribute(read(p.indices), 1));
    g.computeVertexNormals();
    return { index: i, name: node.name, geometry: g };
  });
}

// ------------------------------------------------------------------ livery
// Adapted from the explorer's livery.js: one paint sheet wrapped round the tubes.
const BODY_TOP = .370693, BODY_BOTTOM = -.570693, FRONT = Math.atan2(1, 2.8);
function bodyUV(x, y, z) {
  let u = .5 + (Math.atan2(x, z) - FRONT) / (2 * Math.PI);
  u = ((u % 1) + 1) % 1;
  return [u, (y - BODY_BOTTOM) / (BODY_TOP - BODY_BOTTOM)];
}
function wrap(source) {
  const g = source.toNonIndexed(), pos = g.getAttribute('position');
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i += 3) {
    const tri = [0, 1, 2].map(j => bodyUV(pos.getX(i + j), pos.getY(i + j), pos.getZ(i + j)));
    if (Math.max(...tri.map(p => p[0])) - Math.min(...tri.map(p => p[0])) > .5) for (const p of tri) if (p[0] < .5) p[0] += 1;
    tri.forEach((p, j) => uv.set(p, (i + j) * 2));
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}
function liveryTexture(renderer) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 2048;
  const x = c.getContext('2d');
  const py = y => (BODY_TOP - y) / (BODY_TOP - BODY_BOTTOM) * c.height;
  x.fillStyle = '#d63b08'; x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = '#890919';
  for (const [t, b] of [[BODY_TOP, .352], [-.067, -.085]]) x.fillRect(0, py(t), c.width, py(b) - py(t));
  x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
  const letters = (text, first, step, h) => {
    x.font = `800 ${h / (BODY_TOP - BODY_BOTTOM) * c.height}px Archivo, sans-serif`;
    [...text].forEach((l, i) => x.fillText(l, c.width / 2, py(first - i * step), 80));
  };
  letters('CHARGER', .318, .056, .040);
  letters('UCRC', -.121, .044, .037);
  letters('2026', -.355, .043, .036);
  const bolt = [[9, -.281], [-15, -.315], [-3, -.315], [-10, -.341], [16, -.305], [3, -.305]];
  x.beginPath();
  bolt.forEach(([bx, by], i) => { const px = c.width / 2 + bx * c.width / (2 * Math.PI * 34); i ? x.lineTo(px, py(by)) : x.moveTo(px, py(by)); });
  x.closePath(); x.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return t;
}

// ------------------------------------------------------------- environment
// A small studio built in code: warm grey room, three softboxes. No HDR download.
function studio(renderer, dark) {
  const s = new THREE.Scene();
  const room = new THREE.SphereGeometry(10, 48, 24), col = [], p = room.getAttribute('position');
  const top = new THREE.Color(dark ? 0x2a2b2e : 0xdedcd7), bottom = new THREE.Color(dark ? 0x0c0c0d : 0x4a4845);
  for (let i = 0; i < p.count; i++) { const k = THREE.MathUtils.smoothstep(p.getY(i), -6, 6); const c = bottom.clone().lerp(top, k); col.push(c.r, c.g, c.b); }
  room.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  s.add(new THREE.Mesh(room, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const box = (w, h, pos, k) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(k, k, k), side: THREE.DoubleSide }));
    m.position.set(...pos); m.lookAt(0, 0, 0); s.add(m);
  };
  box(9, 2.6, [0, 7, 1.5], 4.2);     // overhead strip, the long highlight down the tube
  box(1.6, 7, [-7, 1.2, 4], 3.4);    // key from front left
  box(1.2, 7, [7, 0.5, -3], 2.6);    // rim from behind right
  box(7, 1.2, [0, -2, 8], 0.55);     // low front bounce
  const pm = new THREE.PMREMGenerator(renderer);
  const env = pm.fromScene(s, 0.03).texture; pm.dispose();
  return env;
}

// ------------------------------------------------------------------- build
export async function createHero(canvas, { poseName = 'wide', poster = false, dpr } = {}) {
  const pose = POSES[poseName];
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: poster, powerPreference: 'high-performance' });
  renderer.setPixelRatio(dpr || Math.min(devicePixelRatio || 1, 1.75));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = poseName === 'xray' ? 1.05 : 1.0;

  const scene = new THREE.Scene();
  scene.environment = studio(renderer, poseName === 'xray');
  const key = new THREE.DirectionalLight(0xffffff, 1.1); key.position.set(-2, 4, 3); scene.add(key);

  await document.fonts?.load('800 64px Archivo').catch(() => {});
  const parts = await loadGLB(GLB);

  // hierarchy: yaw > tilt > lay (axis to +x) > roll (about own axis) > centre
  const yawG = new THREE.Group(), tiltG = new THREE.Group(), layG = new THREE.Group(), rollG = new THREE.Group(), centre = new THREE.Group();
  scene.add(yawG); yawG.add(tiltG); tiltG.add(layG); layG.add(rollG); rollG.add(centre);
  layG.rotation.z = -Math.PI / 2; centre.position.y = -MID_Y;
  const nozzle = new THREE.Object3D(); nozzle.position.y = AFT_Y; centre.add(nozzle);
  const plume = new THREE.Object3D(); plume.position.y = AFT_Y - 0.12; centre.add(plume);

  const xray = poseName === 'xray';
  const tex = xray ? null : liveryTexture(renderer);
  const paint = (o = {}) => new THREE.MeshPhysicalMaterial({ roughness: .36, metalness: 0, clearcoat: 1, clearcoatRoughness: .12, envMapIntensity: 1.1, ...o });
  const samples = [];
  for (const part of parts) {
    const i = part.index;
    if (!xray && !EXTERIOR.has(i)) { part.geometry.dispose(); continue; }
    let mesh;
    if (xray) {
      const shell = i === NOSE || TUBES.includes(i) || FINS.includes(i) || RAIL.includes(i);
      if (shell) {
        mesh = new THREE.Mesh(part.geometry, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .07, depthWrite: false }));
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(part.geometry, 28), new THREE.LineBasicMaterial({ color: 0xff5a1f, transparent: true, opacity: .55 }));
        centre.add(edges);
      } else {
        const hot = i === MOTOR || i === CAP;
        mesh = new THREE.Mesh(part.geometry, new THREE.MeshStandardMaterial({ color: hot ? 0xff5a1f : 0xe8e6e1, roughness: .42, metalness: hot ? .3 : .08 }));
      }
    } else if (TUBES.includes(i)) {
      mesh = new THREE.Mesh(wrap(part.geometry), paint({ map: tex }));
      part.geometry.dispose();
    } else if (i === NOSE || FINS.includes(i)) {
      mesh = new THREE.Mesh(part.geometry, paint({ color: 0xf1f0ec, roughness: .4 }));
    } else if (i === CAP) {
      mesh = new THREE.Mesh(part.geometry, new THREE.MeshPhysicalMaterial({ color: 0x7d0d18, metalness: .65, roughness: .28, clearcoat: .6 }));
    } else if (i === MOTOR) {
      mesh = new THREE.Mesh(part.geometry, new THREE.MeshStandardMaterial({ color: 0x1b1c1e, metalness: .2, roughness: .6 }));
    } else {
      mesh = new THREE.Mesh(part.geometry, new THREE.MeshStandardMaterial({ color: 0xdedcd7, roughness: .5 }));
    }
    centre.add(mesh);
    const pos = part.geometry.getAttribute('position');
    if (EXTERIOR.has(i)) for (let v = 0; v < pos.count; v += 9) samples.push(new THREE.Vector3(pos.getX(v), pos.getY(v), pos.getZ(v)));
  }

  const camera = new THREE.PerspectiveCamera(pose.fov, pose.aspect, 0.05, 50);
  const base = { yaw: pose.yaw, tilt: pose.tilt, roll: pose.roll };
  function orient(dyaw = 0, dpitch = 0, droll = 0, lift = 0) {
    yawG.rotation.y = base.yaw + dyaw;
    tiltG.rotation.z = base.tilt;
    rollG.rotation.y = base.roll + droll;
    yawG.position.y = lift;
    camera.userData.pitch = pose.pitch + dpitch;
  }

  // Fit: put the camera on a pitched ray and solve distance + centre so the
  // rocket fills the box by `margin`. Converges in a few passes at this fov.
  let dist = 4, target = new THREE.Vector3();
  function placeCamera() {
    const p = camera.userData.pitch;
    camera.position.set(target.x, target.y + Math.sin(p) * dist, target.z + Math.cos(p) * dist);
    camera.lookAt(target); camera.updateMatrixWorld(); camera.updateProjectionMatrix();
  }
  function fit() {
    orient(); scene.updateMatrixWorld(true);
    const world = samples.map(v => centre.localToWorld(v.clone()));
    const t = Math.tan(THREE.MathUtils.degToRad(pose.fov / 2));
    for (let pass = 0; pass < 6; pass++) {
      placeCamera();
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (const w of world) { const n = w.clone().project(camera); x0 = Math.min(x0, n.x); x1 = Math.max(x1, n.x); y0 = Math.min(y0, n.y); y1 = Math.max(y1, n.y); }
      const scale = Math.max((x1 - x0) / 2, (y1 - y0) / 2) / pose.margin;
      // shift target toward the bbox centre, in camera plane units
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
      target.addScaledVector(right, cx * dist * t * pose.aspect).addScaledVector(up, cy * dist * t);
      dist *= scale;
    }
    placeCamera();
  }
  fit();

  function project(obj) {
    const v = obj.getWorldPosition(new THREE.Vector3()).project(camera);
    return { x: v.x * .5 + .5, y: -v.y * .5 + .5 };
  }
  function exhaust() {
    const a = project(nozzle), b = project(plume);
    const dx = (b.x - a.x) * pose.aspect, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
    return { x: a.x, y: a.y, dx: dx / l, dy: dy / l };
  }

  function size(w, h) { renderer.setSize(w, h, false); }
  function render() { renderer.render(scene, camera); }

  // live motion: slow hover, small roll, pointer parallax (eased by caller)
  function update(t, px = 0, py = 0, still = false) {
    if (still) orient();
    else orient(px * 0.07, py * 0.035, Math.sin(t * 0.21) * 0.16, Math.sin(t * 0.62) * 0.006);
    placeCamera();
    render();
    return exhaust();
  }

  return { renderer, size, render, update, exhaust, pose, dispose: () => renderer.dispose() };
}
