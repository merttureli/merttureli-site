// Sideslip: the one WebGL view of the page. Loaded after the first paint (three.js is 692 KB), never before.
//
// The pedals are the site's own CAD assembly and the linkage is not redone here: createModel() from the
// showreel actor (next/js/showreel/rudder-pedals.js) solves it from the CAD joints, so setDrive(x) swings each
// lever arm on its pivot bolt, drives the link rods and rocks the sensor lever, and setToe(l, r) tips each
// pedal back on its hinge. Three numbers pose it: rudder -1..1, left brake 0..1, right brake 0..1.
// Lights and environment are the shared studio rig (engine.js), the finish and the ground shadow are look.js
// (dressRudderPedals). This module adds no lights. It only frames, colors and draws.
import { THREE, createEngine } from '../../../next/js/showreel/engine.js';
import { createModel } from '../../../next/js/showreel/rudder-pedals.js';

// The model is always framed inside a 5 : 4 reference rectangle that is fitted into the canvas like
// `object-fit: contain`, so the rendered still (assets/rp3-hero-*.webp, made at 5 : 4 with the 'hero' shot) and the
// live canvas line up in any box.
export const FRAME = 5 / 4;
const FOV = 22;
// yaw and tilt of the assembly (rad), camera distance (m), the point the camera looks at (model meters, before
// the turn) and a shift of the picture in the frame (share of the frame height, + is up)
export const SHOTS = {
  hero: { yaw: -1.02, tilt: .36, dist: 1.1, at: [0, .118, 0], lift: .0 },
  seat: { yaw: -Math.PI / 2, tilt: .5, dist: 1.12, at: [0, .118, 0], lift: 0 },
  side: { yaw: 0, tilt: .08, dist: 1.04, at: [0, .13, 0], lift: 0 },
};

// The page's palette on the product: charcoal walls, light gray levers, the pedals in the signal red, and the
// three signal wires in plate white (the CAD look has them yellow, green and blue).
const PEDAL = 0xd62a1f;
const SIGNAL = [0xd8a21b, 0x2f8a4a, 0x2c6fb7], SIGNAL_TO = 0xd9dad6;

export async function createStage({ canvas, quality = 'high', preserve = false, pixelRatio } = {}) {
  const engine = createEngine({ canvas, preserve, pixelRatio });
  const { scene, camera, renderer } = engine;
  const model = createModel({ THREE, legible: true });
  const view = new THREE.Group();
  view.add(model.group);
  scene.add(view);

  if (model.materials['#e59f5c']) model.materials['#e59f5c'].color.setHex(PEDAL);
  recolorWires(model);

  let dress = null;
  try {
    const look = await import('../../../next/js/showreel/look.js');
    dress = await look.dressRudderPedals({ engine, quality, view, model, parts: model.getParts() });
  } catch (e) { console.warn('[sideslip] studio look not available, plain materials kept', e); }
  engine.adopt(view);

  // ---- framing
  const shot = { ...SHOTS.hero }, from = { ...shot }, to = { ...shot };
  let turnT = 1, w = 2, h = 2;
  const target = new THREE.Vector3();
  function frame() {
    view.rotation.set(shot.tilt, shot.yaw, 0);
    view.position.set(0, 0, 0);
    view.updateMatrixWorld(true);
    target.set(...shot.at).applyMatrix4(view.matrixWorld);
    // keep the reference rectangle whole: a box narrower than 3 : 2 widens the vertical field instead of cropping
    const aspect = w / h, k = Math.max(1, FRAME / aspect), half = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(half * k));
    camera.aspect = aspect;
    camera.position.set(target.x, target.y - shot.lift * 2 * half * shot.dist, shot.dist);
    camera.lookAt(target.x, target.y - shot.lift * 2 * half * shot.dist, 0);
    camera.updateProjectionMatrix();
  }
  function size(cw, ch) {
    w = Math.max(2, Math.round(cw)); h = Math.max(2, Math.round(ch));
    renderer.setSize(w, h, false);
    frame();
  }
  const easeOut = t => 1 - (1 - t) ** 3;
  // turn to another shot: `snap` jumps (reduced motion, first frame); step(dt) returns true while it turns
  function setShot(name, snap = false) {
    const s = SHOTS[name] || SHOTS.hero;
    Object.assign(from, shot, { at: [...shot.at] });
    Object.assign(to, s, { at: [...s.at] });
    turnT = snap ? 1 : 0;
    if (snap) { Object.assign(shot, to, { at: [...to.at] }); frame(); }
  }
  function step(dt) {
    if (turnT >= 1) return false;
    turnT = Math.min(1, turnT + dt / .45);
    const k = easeOut(turnT), mix = (a, b) => a + (b - a) * k;
    shot.yaw = mix(from.yaw, to.yaw); shot.tilt = mix(from.tilt, to.tilt); shot.dist = mix(from.dist, to.dist); shot.lift = mix(from.lift, to.lift);
    shot.at = from.at.map((v, i) => mix(v, to.at[i]));
    frame();
    return true;
  }

  // ---- pose
  function pose(x, l, r) {
    model.setDrive(x);
    model.setToe(l, r);
    model.refresh();
  }

  // ---- where a part is on screen (0..1 in the canvas box): the axis tags' leader lines end there
  const P = model.parts, pedalL = P.leverL.getObjectByName('pedalL'), pedalR = P.leverR.getObjectByName('pedalR');
  const centerOf = obj => {
    const box = new THREE.Box3(), b = new THREE.Box3(), inv = new THREE.Matrix4(), m4 = new THREE.Matrix4();
    obj.updateWorldMatrix(true, true); inv.copy(obj.matrixWorld).invert();
    obj.traverse(o => {
      if (!o.isMesh || o.userData.detail) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      box.union(b.copy(o.geometry.boundingBox).applyMatrix4(m4.multiplyMatrices(inv, o.matrixWorld)));
    });
    return box.getCenter(new THREE.Vector3());
  };
  const anchors = { x: [P.rocker, new THREE.Vector3()], y: [pedalL, centerOf(pedalL)], z: [pedalR, centerOf(pedalR)] };
  const v3 = new THREE.Vector3();
  function locate(key, out = {}) {
    const [obj, at] = anchors[key];
    scene.updateMatrixWorld();
    v3.copy(at).applyMatrix4(obj.matrixWorld).project(camera);
    out.x = (v3.x + 1) / 2; out.y = (1 - v3.y) / 2;
    return out;
  }

  pose(0, 0, 0);
  frame();
  return {
    engine, model, dress, size, setShot, step, pose, locate, frame,
    render() { engine.render(); },
    dispose() { if (dress) dress.dispose(); model.dispose(); engine.dispose(); },
  };
}

// the wires are one mesh with a color per vertex: the three signal colors become plate white
function recolorWires(model) {
  const mesh = model.group.getObjectByName('wires');
  if (!mesh) return;
  const col = mesh.geometry.attributes.color, c = new THREE.Color(), to = new THREE.Color().setHex(SIGNAL_TO, THREE.SRGBColorSpace);
  const from = SIGNAL.map(hex => new THREE.Color().setHex(hex, THREE.SRGBColorSpace));
  for (let i = 0; i < col.count; i++) {
    c.fromBufferAttribute(col, i);
    if (from.some(f => Math.abs(f.r - c.r) + Math.abs(f.g - c.g) + Math.abs(f.b - c.b) < .02)) col.setXYZ(i, to.r, to.g, to.b);
  }
  col.needsUpdate = true;
}
