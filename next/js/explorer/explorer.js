// CHARGER EXPLORER: the flight model, opened in place over the Studio home.
//
// launch.js imports this on prefetch and calls createExplorer() on the first open.
//
// The rocket is the hero's own: createRocket() from hero3d.js builds the same eleven
// exterior meshes, livery and materials from next/assets/3d/charger-hero.* (the file
// the hero already loaded), and this module adds the seventeen interior parts from
// next/assets/3d/charger-explorer.* (cadmesh, tools/cad/explorer_to_cadmesh.py). It is
// lit by the hero's rig (addStudioLights from showreel/engine.js) with the same
// renderer settings, through one three.js copy (next/js/three.module.min.js).
//
// Open: the tile (or the hero canvas) grows to the full screen and the rocket flies
// from where it was drawn there to the centre; close is the same move backwards. The
// renderer is created on the first open and kept warm after a close with its canvas
// shrunk to 1 x 1 px (programs and buffers stay, the full-screen colour, depth and
// MSAA buffers go), so a second open costs no shader compile; after WARM_MS closed it
// is disposed completely. While open, the hero showreel is paused (no rAF), and this
// module draws only while something moves.
//
// Controls follow next/lab/rudder-pedals-review.html: numbered orange labels, part
// group toggles, an explode slider (along the body axis: sections slide apart, each
// part keeps its true station in its section) and a section cut (a clipping plane
// through the body axis with solid stencil caps). Tap a part for its card: the text is
// part-stories.js, unchanged. A five stop tour plays on the first open of a visit.
import * as THREE from '../three.module.min.js';
import { addStudioLights, ease, clamp01, lerp, win } from '../showreel/engine.js';
import { createRocket, LAYOUTS } from '../hero3d.js';
import { fetchCadMesh, buildCadMesh } from '../cad/cadmesh.js';
import { storyFor } from '../../../assets/charger-explorer/part-stories.js';

const ASSETS = new URL('../../assets/3d/', import.meta.url).href;
const reducedQ = matchMedia('(prefers-reduced-motion: reduce)');
const FOV = 24;                                   // the hero's lens (hero3d.js LAYOUTS)
const FRONT_ANGLE = Math.atan2(1, 2.8);           // hero3d.js: the livery's front
const ROLL0 = -FRONT_ANGLE + LAYOUTS.land.roll;   // CHARGER lettering toward the camera
const OPEN_MS = 900, CLOSE_MS = 720;              // --dur-900; close a touch quicker
const WARM_MS = 180000;
const GHOST_EXT = .07, GHOST_INT = .16;           // opacity of the other parts while one is picked
const CUT_MS = 650, CUT_FAR = .12;                // section sweep; plane offset that clips nothing
const CAP_COLOR = 0xd2cdc4;                       // section caps: matte warm grey

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
// Tour: nose, avionics bay, recovery, motor mount, fins. Each stop shows the part's
// own subtitle from part-stories.js.
const TOUR = [0, 24, 26, 18, 6];
const TOUR_MS = 3300;

let dataP = null;
// Fetch the interior model (and warm the hero's metadata). Safe to call many times.
export function prefetch() {
  if (!dataP) {
    dataP = Promise.all([fetchCadMesh(ASSETS + 'charger-explorer.json'), fetch(ASSETS + 'charger-hero.json').then(r => r.json())]);
    dataP.catch(() => { dataP = null; });
  }
  return dataP;
}

const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v; else if (k === 'text') el.textContent = v; else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
  }
  el.append(...kids);
  return el;
};
const pad = n => String(n).padStart(2, '0');
const easeIO = ease.inOutCubic;

export function createExplorer({ onRequestClose, onClosed }) {
  // ---------------------------------------------------------------- DOM
  const canvas = h('canvas', { class: 'cx__canvas', tabindex: '0', role: 'img', 'aria-label': 'CHARGER flight model. Drag to turn, scroll or pinch to zoom, arrow keys to turn, plus and minus to zoom. Pick a part to read about it.' });
  const ink = h('span', { class: 'cx__ink' });
  const ground = h('div', { class: 'cx__ground', 'aria-hidden': 'true' }, ink, h('span', { class: 'cx__ghost', text: 'CHARGER' }));
  const tags = h('div', { class: 'cx__tags cx__ui', 'aria-hidden': 'true' });
  const title = h('h2', { class: 'cx__title', id: 'cx-title', text: 'Take CHARGER apart' });
  const head = h('header', { class: 'cx__head cx__ui' }, h('p', { class: 'label', text: 'Interactive / The flight model' }), title);
  const closeBtn = h('button', { class: 'cx__close cx__ui', type: 'button', 'aria-label': 'Close the explorer' });
  const explode = h('input', { type: 'range', id: 'cx-explode', min: '0', max: '100', step: '1', value: '0' });
  const explodeOut = h('output', { for: 'cx-explode', text: '0%' });
  const btn = (text, act, pressed) => h('button', { class: 'cx__btn', type: 'button', 'data-act': act, 'aria-pressed': pressed == null ? false : String(pressed), text });
  const cutBtn = btn('Section', 'cut', false), labelsBtn = btn('Labels', 'labels', true), tourBtn = btn('Tour', 'tour'), resetBtn = btn('Reset view', 'reset');
  const chips = GROUPS.map(([key, text]) => {
    const b = h('button', { class: 'cx__btn cx__btn--chip', type: 'button', 'data-group': key, 'aria-pressed': 'true' }, h('span', { class: 'dot', 'aria-hidden': 'true' }), text);
    return b;
  });
  const list = h('ol', { class: 'cx__parts' });
  const more = h('div', { class: 'cx__more', id: 'cx-more' },
    h('h3', { class: 'label', text: 'Show' }), h('div', { class: 'cx__chips' }, ...chips),
    h('h3', { class: 'label', text: 'Parts' }), list);
  const grab = h('button', { class: 'cx__grab', type: 'button', 'aria-expanded': 'false', 'aria-controls': 'cx-more', text: 'More controls' });
  const panel = h('aside', { class: 'cx__panel cx__ui', 'aria-label': 'Explorer controls' }, grab,
    h('div', { class: 'cx__row' }, h('label', { for: 'cx-explode', text: 'Explode' }), explode, explodeOut),
    h('div', { class: 'cx__btns' }, cutBtn, labelsBtn, tourBtn, resetBtn), more);
  const cardX = h('button', { class: 'cx__x', type: 'button', 'aria-label': 'Close the part card' });
  const cardLabel = h('p', { class: 'label' }), cardTitle = h('h3', { id: 'cx-card-title', tabindex: '-1' }), cardLede = h('p', { class: 'lede' }), cardDesc = h('p', { class: 'desc' });
  const cardRole = h('dd'), cardMat = h('dd'), cardMatRow = h('div', {}, h('dt', { text: 'Material' }), cardMat);
  const card = h('section', { class: 'cx__card cx__ui', 'aria-labelledby': 'cx-card-title', hidden: true }, cardX, cardLabel, cardTitle, cardLede, cardDesc,
    h('dl', {}, h('div', {}, h('dt', { text: 'Role' }), cardRole), cardMatRow));
  const tourStep = h('span', { class: 'label' }), tourName = h('span', { class: 'cx__tname' }), tourLine = h('span', { class: 'cx__tline' });
  const tourSkip = h('button', { class: 'cx__btn', type: 'button', text: 'Skip tour' });
  const tourBox = h('div', { class: 'cx__tour cx__ui', hidden: true, role: 'status' }, h('div', { class: 'cx__ttext' }, tourStep, tourName, tourLine), tourSkip);
  const hint = h('p', { class: 'cx__hint label cx__ui', text: 'Drag to turn / Scroll to zoom / Click a part' });
  const live = h('div', { class: 'sr-only', 'aria-live': 'polite' });
  const dialog = h('dialog', { class: 'cx', 'aria-labelledby': 'cx-title', 'data-lenis-prevent': '', tabindex: '-1' },
    ground, canvas, tags, head, panel, card, tourBox, hint, closeBtn, live);
  document.body.append(dialog);

  // ---------------------------------------------------------------- state
  const S = {
    phase: 'closed', origin: 'tile', tileEl: null, built: false,
    explode: 0, explodeGoal: 0, cutOn: false, cutT: 0, labels: true,
    groups: Object.fromEntries(GROUPS.map(g => [g[0], true])),
    selected: null, toured: false, tour: null, sheetOpen: false,
  };
  try { S.toured = sessionStorage.getItem('cx-toured') === '1'; } catch (e) { /* private mode */ }
  const stats = { opens: 0, firstFrameMs: 0, openMs: 0, buildMs: 0, frames: 0, frameMs: [], cpuMs: [], cold: true };

  let renderer = null, scene = null, camera = null, pivot = null, model = null, cad = null;
  let capMesh = null, stencilMat = null, parts = [], byId = new Map(), raf = 0, last = 0, warmTimer = 0, buildP = null;
  let fly = null, R = { x: 0, y: 0, w: 1, h: 1 }, W = 1, H = 1, scissor = null;
  const clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 1e3), modelPlane = new THREE.Plane(), cutNormal = new THREE.Vector3(0, 0, -1);
  const qBase = new THREE.Quaternion(), qTmp = new THREE.Quaternion(), qRoll = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0);
  const V = new THREE.Vector3(), V2 = new THREE.Vector3(), TGT = new THREE.Vector3(), M = new THREE.Matrix4(), BOX = new THREE.Box3();
  // the view: rocket orientation = orbit * base * roll(about the body axis); camera on +Z of target
  const cur = { orbit: new THREE.Quaternion(), roll: ROLL0, target: new THREE.Vector3(), dist: 2.2, camRoll: 0 };
  const goal = { orbit: new THREE.Quaternion(), roll: ROLL0, zoom: 1, pan: new THREE.Vector3(), focus: null };

  const mobile = () => innerWidth <= 760;
  const layoutBase = () => {
    const port = innerWidth / innerHeight < 1;
    qBase.setFromEuler(new THREE.Euler(.16, 0, port ? .14 : 1.42));
  };

  // ---------------------------------------------------------------- build
  function build() {
    if (buildP) return buildP;
    const t0 = performance.now();
    buildP = (async () => {
      const [rocket, [data, heroMeta]] = await Promise.all([createRocket({ layout: 'land', base: ASSETS }), prefetch()]);
      if (!renderer) {
        renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, stencil: true, powerPreference: 'default' });
        renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.setClearColor(0x000000, 0);
        renderer.localClippingEnabled = true;
        renderer.debug.checkShaderErrors = /[?&#]debug\b/.test(location.href);
        canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); live.textContent = '3D paused. Close and open the explorer again to restore it.'; });
      }
      scene = new THREE.Scene();
      addStudioLights(scene);
      camera = new THREE.PerspectiveCamera(FOV, 1, .01, 30);
      pivot = new THREE.Group();
      scene.add(pivot);
      // the hero's model group: outer > tilt > roll > model (hero3d.js createRocket); it keeps its
      // own offset that puts the body centre on the roll axis
      model = rocket.group.children[0].children[0].children[0];
      model.removeFromParent();
      pivot.add(model);
      const ids = heroMeta.parts.map(p => p.id);
      if (ids.length !== model.children.length) throw new Error('explorer: hero model and its metadata disagree');
      const over = {};
      for (const p of data.meta.parts) over[p.name] = {};   // one material per part, so a part can ghost alone
      cad = buildCadMesh(THREE, data.meta, data.buf, { materials: over });
      model.add(cad.group);
      // the part list: hero meshes by id, then the interior parts
      const add = (id, obj, meshes, box) => {
        const story = storyFor({ id });
        if (!story || story.category === 'Reference') return;
        const P = { id, story, obj, meshes, base: obj.position.clone(), box, center: box.getCenter(new THREE.Vector3()), slide: SLIDE[id] || 0, opacity: 1, ghost: 1, visible: true, n: 0, tag: null, li: null };
        P.group = (GROUPS.find(g => g[2].includes(story.category)) || GROUPS[0])[0];
        P.exterior = story.category !== 'Reference' && [0, 1, 2, 6, 7, 8, 9, 10, 11].includes(id);
        parts.push(P); byId.set(id, P);
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
      // materials: clipping plane always set (a far plane clips nothing), so toggling the cut
      // never changes a shader; stencil passes for the caps
      stencilMat = new THREE.MeshBasicMaterial({
        colorWrite: false, depthWrite: false, depthTest: false, side: THREE.DoubleSide, clippingPlanes: [clipPlane],
        stencilWrite: true, stencilFunc: THREE.AlwaysStencilFunc, stencilFail: THREE.InvertStencilOp, stencilZFail: THREE.InvertStencilOp, stencilZPass: THREE.InvertStencilOp,
      });
      const noRay = () => {};
      for (const P of parts) for (const m of P.meshes) {
        m.material.clippingPlanes = [clipPlane];
        m.material.needsUpdate = true;
        m.userData.part = P;
        const s = new THREE.Mesh(m.geometry, stencilMat);
        s.renderOrder = 1; s.visible = false; s.raycast = noRay; s.userData.stencil = true;
        m.add(s);
      }
      capMesh = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshStandardMaterial({
        color: CAP_COLOR, roughness: .82, metalness: 0, side: THREE.DoubleSide,
        stencilWrite: true, stencilRef: 0, stencilFunc: THREE.NotEqualStencilFunc, stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp, stencilZPass: THREE.ReplaceStencilOp,
      }));
      capMesh.renderOrder = 2; capMesh.visible = false; capMesh.raycast = noRay;
      scene.add(capMesh);
      // numbering: nose to tail by station
      parts.sort((a, b) => b.center.y - a.center.y).forEach((P, i) => { P.n = i + 1; });
      buildList();
      layoutBase();
      resize();
      // compile every variant now (opaque and ghosted parts, stencil passes, caps), not on first use
      const all = [];
      scene.traverse(o => { if (o.isMesh) { all.push([o, o.visible]); o.visible = true; } });
      setPose(); renderer.setSize(Math.max(2, W), Math.max(2, H), false);
      for (const transparent of [true, false]) {
        for (const P of parts) for (const m of P.meshes) { m.material.transparent = transparent; m.material.needsUpdate = true; }
        if (renderer.extensions.has('KHR_parallel_shader_compile')) await renderer.compileAsync(scene, camera).catch(() => {});
        else renderer.compile(scene, camera);
      }
      for (const [o, v] of all) o.visible = v;
      stats.buildMs = Math.round(performance.now() - t0);
      S.built = true;
    })();
    buildP.catch(() => { buildP = null; });
    return buildP;
  }
  // free the GPU memory (geometry, textures, programs); the renderer and its 1 x 1 canvas stay
  function dispose() {
    if (!S.built || S.phase !== 'closed') return;
    stop();
    cad && cad.dispose();
    scene.traverse(o => {
      if (!o.isMesh || o.userData.stencil) return;
      o.geometry.dispose();
      for (const m of [].concat(o.material)) { if (m.map) m.map.dispose(); m.dispose(); }
    });
    stencilMat.dispose();
    renderer.renderLists.dispose();
    renderer.info.reset();
    scene = camera = pivot = model = cad = capMesh = stencilMat = null;
    parts = []; byId = new Map(); buildP = null; S.built = false;
    list.replaceChildren(); tags.replaceChildren();
  }

  function buildList() {
    list.replaceChildren(); tags.replaceChildren();
    for (const P of parts) {
      const b = h('button', { type: 'button' }, h('span', { class: 'cx__n', 'aria-hidden': 'true', text: pad(P.n) }), h('span', { class: 'cx__pname', text: P.story.label }), h('span', { class: 'cx__pcat', text: P.story.category }));
      b.setAttribute('aria-label', `${pad(P.n)}, ${P.story.label}`);
      b.addEventListener('click', () => select(P.id, { fromList: true }));
      const li = h('li', {}, b);
      list.append(li); P.li = li; P.btn = b;
      const t = h('button', { class: 'cx__tag', type: 'button', tabindex: '-1', text: String(P.n) }, h('span', { class: 'tip', text: P.story.label }));
      t.addEventListener('click', e => { e.stopPropagation(); select(P.id); });
      tags.append(t); P.tag = t;
    }
  }

  // ---------------------------------------------------------------- geometry helpers
  const slideOf = P => P.slide * S.explode;
  function partWorldCenter(P, out) { return model.localToWorld(out.copy(P.center).setY(P.center.y + slideOf(P))); }
  function visibleBox(explodeAmt, out) {
    out.makeEmpty();
    for (const P of parts) {
      if (!P.visible) continue;
      BOX.copy(P.box); BOX.min.y += P.slide * explodeAmt; BOX.max.y += P.slide * explodeAmt;
      out.union(BOX);
    }
    if (out.isEmpty()) out.setFromCenterAndSize(V.set(0, 0, 0), V2.set(.1, .1, .1));
    return out;
  }
  // distance that fits the visible parts in the frame at the home orientation (so turning never zooms)
  const fitBox = new THREE.Box3();
  function homeDist(explodeAmt) {
    visibleBox(explodeAmt, fitBox);
    const c = fitBox.getCenter(V2), q = qTmp.copy(qBase).multiply(qRoll.setFromAxisAngle(Y, ROLL0));
    const tanV = Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * .9, tanH = tanV * R.w / R.h;
    let d = .2;
    for (let i = 0; i < 8; i++) {
      V.set(i & 1 ? fitBox.max.x : fitBox.min.x, i & 2 ? fitBox.max.y : fitBox.min.y, i & 4 ? fitBox.max.z : fitBox.min.z).sub(c).applyQuaternion(q);
      d = Math.max(d, V.z + Math.abs(V.x) / tanH, V.z + Math.abs(V.y) / tanV);
    }
    return d;
  }
  function partDist(P) {
    const r = Math.max(.012, P.box.getSize(V).length() / 2);
    const half = THREE.MathUtils.degToRad(FOV / 2) * Math.min(1, R.w / R.h);
    return Math.max(.12, r / Math.sin(half) * 1.9);
  }
  function homeCenter(out) { visibleBox(S.explode, fitBox); return model.localToWorld(fitBox.getCenter(out)); }

  // where the parts and the plane are for the current state
  function setPose() {
    pivot.quaternion.copy(cur.orbit).multiply(qBase).multiply(qRoll.setFromAxisAngle(Y, cur.roll));
    if (fly && fly.q) pivot.quaternion.copy(fly.q);
    if (fly && fly.p) pivot.position.copy(fly.p); else pivot.position.set(0, 0, 0);
    for (const P of parts) { P.obj.position.copy(P.base); P.obj.position.y += slideOf(P); P.obj.visible = P.visible && P.opacity > .004; }
    pivot.updateMatrixWorld(true);
    // section plane: through the body axis in model space, swept in from outside
    const k = S.cutT;
    if (k > 0) {
      modelPlane.normal.copy(cutNormal); modelPlane.constant = CUT_FAR * (1 - easeIO(k));
      clipPlane.copy(modelPlane).applyMatrix4(model.matrixWorld);
      capMesh.visible = true;
      clipPlane.coplanarPoint(capMesh.position);
      capMesh.quaternion.setFromUnitVectors(V.set(0, 0, 1), V2.copy(clipPlane.normal).negate());
    } else { clipPlane.normal.set(0, 0, -1); clipPlane.constant = 1e3; capMesh.visible = false; }
    for (const P of parts) for (const m of P.meshes) {
      const s = m.children[0];
      if (s && s.userData.stencil) s.visible = k > 0 && P.ghost > .99;
    }
    // camera: on +Z of the target, the frame R of the canvas spans the lens
    camera.position.copy(cur.target); camera.position.z += cur.dist;
    camera.rotation.set(0, 0, cur.camRoll);
    camera.updateMatrixWorld();
    const near = Math.max(.005, cur.dist * .02), far = cur.dist + 6;
    const t = near * Math.tan(THREE.MathUtils.degToRad(FOV / 2)), kk = t / (R.h / 2), cx = R.x + R.w / 2, cy = R.y + R.h / 2;
    camera.near = near; camera.far = far;
    camera.projectionMatrix.makePerspective(-cx * kk, (W - cx) * kk, cy * kk, (cy - H) * kk, near, far);
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  }

  // ---------------------------------------------------------------- frames
  function invalidate() { if (!raf && S.phase !== 'closed' && S.built) raf = requestAnimationFrame(frame); }
  function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; last = 0; }
  function frame(now) {
    raf = 0;
    if (S.phase === 'closed' || !S.built) return;
    const dt = last ? Math.min(.05, (now - last) / 1000) : 1 / 60;
    if (last) { stats.frames++; if (stats.frameMs.length < 600) stats.frameMs.push(now - last); }
    last = now;
    const c0 = performance.now();
    const moving = step(dt, now);
    draw();
    if (stats.cpuMs.length < 600) stats.cpuMs.push(performance.now() - c0);
    if (moving) raf = requestAnimationFrame(frame); else last = 0;
  }
  const damp = (dt, rate) => (reducedQ.matches ? 1 : 1 - Math.exp(-dt * rate));
  function step(dt, now) {
    let moving = false;
    if (fly) moving = stepFly(now) || true;
    // explode slider (smoothed), section sweep, ghosting
    const ke = damp(dt, 9);
    if (Math.abs(S.explodeGoal - S.explode) > 1e-4) { S.explode = lerp(S.explode, S.explodeGoal, ke); moving = true; } else S.explode = S.explodeGoal;
    const cutGoal = S.cutOn ? 1 : 0;
    if (S.cutT !== cutGoal) { S.cutT = reducedQ.matches ? cutGoal : clamp01(S.cutT + Math.sign(cutGoal - S.cutT) * dt * 1000 / CUT_MS); moving = true; }
    const kg = damp(dt, 8);
    for (const P of parts) {
      const g = !P.visible ? 0 : P.ghost;
      if (Math.abs(P.opacity - g) > .003) { P.opacity = lerp(P.opacity, g, kg); moving = true; } else P.opacity = g;
      const t = P.opacity < .999;
      for (const m of P.meshes) {
        if (m.material.transparent !== t) { m.material.transparent = t; m.material.depthWrite = !t; m.material.needsUpdate = true; }
        m.material.opacity = P.opacity;
      }
    }
    if (!fly) {
      // view: damp toward the goal
      const kv = damp(dt, 7);
      const prevD = cur.dist;
      if (cur.orbit.angleTo(goal.orbit) > 1e-4) { cur.orbit.slerp(goal.orbit, kv); moving = true; } else cur.orbit.copy(goal.orbit);
      if (Math.abs(cur.roll - goal.roll) > 1e-4) { cur.roll = lerp(cur.roll, goal.roll, kv); moving = true; } else cur.roll = goal.roll;
      pivot.quaternion.copy(cur.orbit).multiply(qBase).multiply(qRoll.setFromAxisAngle(Y, cur.roll));
      for (const P of parts) { P.obj.position.copy(P.base); P.obj.position.y += slideOf(P); }
      pivot.updateMatrixWorld(true);
      const F = goal.focus != null ? byId.get(goal.focus) : null;
      const tgt = F ? partWorldCenter(F, TGT) : homeCenter(TGT);
      tgt.add(goal.pan);
      const d = (F ? partDist(F) : homeDist(S.explode)) * goal.zoom;
      if (cur.target.distanceToSquared(tgt) > 1e-10) { cur.target.lerp(tgt, kv); moving = true; } else cur.target.copy(tgt);
      if (Math.abs(cur.dist - d) / d > 1e-4) { cur.dist = Math.exp(lerp(Math.log(cur.dist), Math.log(d), kv)); moving = true; } else cur.dist = d;
      if (Math.abs(cur.camRoll) > 1e-4) { cur.camRoll = lerp(cur.camRoll, 0, kv); moving = true; } else cur.camRoll = 0;
      if (cur.dist !== prevD) moving = true;
    }
    return moving;
  }
  function draw() {
    setPose();
    if (scissor) {
      renderer.setScissorTest(false); renderer.clear();
      renderer.setScissorTest(true);
      renderer.setScissor(scissor.x, H - scissor.y - scissor.h, scissor.w, scissor.h);
      renderer.render(scene, camera);
      renderer.setScissorTest(false);
    } else renderer.render(scene, camera);
    placeTags();
  }

  // ---------------------------------------------------------------- layout
  function stageRect() {
    W = innerWidth; H = innerHeight;
    if (mobile()) {
      const top = 74, sheetTop = panel.getBoundingClientRect().top || H - 150;
      dialog.style.setProperty('--cx-sheet', Math.round(H - sheetTop) + 'px');
      return { x: 0, y: top, w: W, h: Math.max(140, sheetTop - top - 8) };
    }
    const left = panel.getBoundingClientRect().left || W - 380;
    return { x: 0, y: 0, w: Math.max(200, left - 12), h: H };
  }
  function resize() {
    if (!S.built) return;
    layoutBase();
    const r = stageRect();
    if (!fly) R = r;
    if (S.phase !== 'closed') renderer.setSize(W, H, false);
    invalidate();
  }
  addEventListener('resize', () => { if (S.phase !== 'closed') resize(); }, { passive: true });

  // ---------------------------------------------------------------- the fly
  // A pose: where the rocket is (pivot quaternion and position), the camera (target,
  // distance, roll) and the frame R it is drawn in. Ground: the panel rect it covers.
  function posePoster(rect, rot = 0) {
    const L = LAYOUTS.land;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(L.tiltX, 0, L.tiltZ)).multiply(new THREE.Quaternion().setFromAxisAngle(Y, ROLL0));
    return { q, p: new THREE.Vector3(), target: new THREE.Vector3(), dist: L.dist, camRoll: rot, R: rect };
  }
  // the tile's image (hero-land.webp, the land layout's still) as a pose: its content box
  // (object-fit: contain) and any hover transform on it
  function tilePose(tile) {
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
    return posePoster({ x: cx - w / 2, y: cy - hh / 2, w, h: hh }, rot);
  }
  function heroPose() {
    const r = window.__reel;
    if (!r || !r.rocket || !r.engine) return null;
    const hm = r.rocket.group.children[0] && r.rocket.group.children[0].children[0] && r.rocket.group.children[0].children[0].children[0];
    if (!hm) return null;
    hm.updateWorldMatrix(true, false);
    M.copy(hm.matrix).invert().premultiply(hm.matrixWorld);
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    M.decompose(p, q, s);
    const b = r.engine.renderer.domElement.getBoundingClientRect();
    return { q, p, target: new THREE.Vector3(), dist: r.engine.camera.position.z, camRoll: 0, R: { x: b.left, y: b.top, w: b.width, h: b.height } };
  }
  function homePose() {
    R = stageRect();
    goal.orbit.identity(); goal.roll = ROLL0; goal.zoom = 1; goal.pan.set(0, 0, 0); goal.focus = null;
    cur.orbit.identity(); cur.roll = ROLL0;
    const q = new THREE.Quaternion().copy(qBase).multiply(qRoll.setFromAxisAngle(Y, ROLL0));
    pivot.quaternion.copy(q); pivot.position.set(0, 0, 0); pivot.updateMatrixWorld(true);
    return { q, p: new THREE.Vector3(), target: homeCenter(new THREE.Vector3()), dist: homeDist(S.explode), camRoll: 0, R: { ...R } };
  }
  function applyPose(a) {
    fly = fly || {};
    fly.q = a.q; fly.p = a.p;
    cur.target.copy(a.target); cur.dist = a.dist; cur.camRoll = a.camRoll; R = a.R;
  }
  const lerpRect = (a, b, t) => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), w: lerp(a.w, b.w, t), h: lerp(a.h, b.h, t) });
  function lerpPose(a, b, t) {
    return {
      q: a.q.clone().slerp(b.q, t), p: a.p.clone().lerp(b.p, t), target: a.target.clone().lerp(b.target, t),
      dist: Math.exp(lerp(Math.log(a.dist), Math.log(b.dist), t)), camRoll: lerp(a.camRoll, b.camRoll, t), R: lerpRect(a.R, b.R, t),
    };
  }
  // ground (the paper panel): transform-only FLIP between a rect and the full screen
  function setGround(rect, radius, inkA, alpha = 1) {
    if (!rect) { ground.style.transform = ''; ground.style.borderRadius = ''; }
    else {
      const sx = Math.max(1e-3, rect.w / W), sy = Math.max(1e-3, rect.h / H);
      ground.style.transform = `translate(${rect.x}px, ${rect.y}px) scale(${sx}, ${sy})`;
      ground.style.borderRadius = radius ? `${radius / sx}px / ${radius / sy}px` : '';
    }
    ink.style.opacity = inkA.toFixed(3);
    ground.style.opacity = alpha >= 1 ? '' : alpha.toFixed(3);
  }
  function stepFly(now) {
    const F = fly;
    if (!F.t0) F.t0 = now;
    const u = F.dur ? clamp01((now - F.t0) / F.dur) : 1, e = easeIO(u);
    const to = typeof F.to === 'function' ? F.to() : F.to;
    if (to && F.from) applyPose(lerpPose(F.from, to, e));
    F.step && F.step(u, e);
    if (u >= 1) { fly = null; F.done && F.done(); return false; }
    return true;
  }
  function runFly(spec) {
    return new Promise(res => { fly = { t0: 0, ...spec, done: () => { spec.done && spec.done(); res(); } }; stop(); invalidate(); });
  }

  // ---------------------------------------------------------------- open / close
  const fullRect = () => ({ x: 0, y: 0, w: innerWidth, h: innerHeight });
  async function open({ origin = 'tile', tile = null } = {}) {
    if (S.phase !== 'closed') return;
    const t0 = performance.now(), still = reducedQ.matches;
    clearTimeout(warmTimer);
    S.phase = 'opening'; S.origin = origin; S.tileEl = tile;
    stats.cold = !S.built;
    S.opener = document.activeElement;
    const reel = window.__reel;
    // read where the rocket is drawn before anything moves, then freeze the hero
    const tileR = origin === 'tile' && tile && !still ? tile.getBoundingClientRect() : null;
    const groundFrom = tileR ? { x: tileR.left, y: tileR.top, w: tileR.width, h: tileR.height } : null;
    let start = still ? null : origin === 'hero' ? heroPose() : tileR ? tilePose(tile) : null;
    if (reel) reel.pause();
    W = innerWidth; H = innerHeight;
    document.documentElement.classList.add('cx-lock');
    dialog.classList.remove('is-ui');
    dialog.showModal();
    dialog.focus({ preventScroll: true });
    canvas.style.opacity = '0';
    // the ground grows at once, on the same clock as the fly; the rocket joins when it is built
    const fade = origin === 'link' || still;
    const groundAt = (u, e) => {
      if (groundFrom) {
        const g = lerpRect(groundFrom, fullRect(), e);
        scissor = u < 1 ? g : null;
        setGround(u < 1 ? g : null, 28 * (1 - e), clamp01(u / .14) * (1 - easeIO(win(u, .3, .85))));
      } else setGround(null, 0, 0, fade ? 1 : clamp01(u / .45));
      if (u > .62) dialog.classList.add('is-ui');
    };
    const dur = start ? OPEN_MS : still ? 0 : 360;
    groundAt(0, 0);
    let gRaf = 0;
    const gStep = now => { const u = dur ? clamp01((now - t0) / dur) : 1; groundAt(u, easeIO(u)); gRaf = S.built ? 0 : requestAnimationFrame(gStep); };
    if (dur) gRaf = requestAnimationFrame(gStep);
    try { await build(); } catch (err) {
      cancelAnimationFrame(gRaf);
      S.phase = 'closed'; dialog.close(); document.documentElement.classList.remove('cx-lock');
      if (reel) reel.resume();
      throw err;
    }
    cancelAnimationFrame(gRaf);
    renderer.setSize(W, H, false);
    resetState();
    const home = homePose();
    const u0 = dur ? (performance.now() - t0) / dur : 1;
    if (u0 > .55) start = null;                        // built late: no fly from a spot the eye has left
    if (origin === 'hero' && start) document.documentElement.classList.add('cx-from-hero');
    stats.opens++;
    let firstAt = 0;
    await runFly({
      from: start || home, to: () => homePose(), dur, t0,
      step(u, e) {
        if (!firstAt) { firstAt = performance.now(); stats.firstFrameMs = Math.round(firstAt - t0); }
        // joined mid-way (or no fly): fade the rocket in
        const a = start && u0 < .02 ? 1 : still ? 1 : clamp01((performance.now() - firstAt) / 260);
        canvas.style.opacity = a >= 1 ? '' : a.toFixed(3);
        groundAt(u, e);
      },
    });
    const tail = performance.now() - firstAt;
    if (canvas.style.opacity !== '') await new Promise(r => setTimeout(r, Math.max(0, 260 - tail)));
    scissor = null; canvas.style.opacity = '';
    setGround(null, 0, 0);
    dialog.classList.add('is-ui');
    document.documentElement.classList.add('cx-covered');
    S.phase = 'open';
    stats.openMs = Math.round(performance.now() - t0);
    invalidate();
    if (!S.toured) startTour();
  }

  function resetState() {
    S.explode = S.explodeGoal = 0; explode.value = '0'; explodeOut.value = '0%';
    S.cutOn = false; S.cutT = 0; cutBtn.setAttribute('aria-pressed', 'false');
    for (const g of GROUPS) S.groups[g[0]] = true;
    for (const c of chips) c.setAttribute('aria-pressed', 'true');
    for (const P of parts) { P.visible = true; P.ghost = 1; P.opacity = 1; P.li.hidden = false; }
    S.selected = null; hideCard(); setSheet(false);
  }

  async function close() {
    if (S.phase !== 'open' && S.phase !== 'opening') return;
    if (S.phase === 'opening') { await waitOpen(); if (S.phase !== 'open') return; }
    S.phase = 'closing';
    endTour(false);
    hideCard();
    dialog.classList.remove('is-ui');
    document.documentElement.classList.remove('cx-covered');
    const origin = S.origin, reel = window.__reel;
    const tile = S.tileEl;
    // fly back to where it came from, if that is on screen; else fade out
    let target = null, groundTo = null;
    if (!reducedQ.matches) {
      if (origin === 'hero' && reel) { reel.resume(); target = () => heroPose(); if (!target()) target = null; }
      else if (tile) {
        const r = tile.getBoundingClientRect();
        if (r.bottom > 40 && r.top < innerHeight - 40) { target = tilePose(tile); groundTo = { x: r.left, y: r.top, w: r.width, h: r.height }; }
      }
    }
    // everything goes back to rest on the way
    S.explodeGoal = 0; S.cutOn = false; S.selected = null; goal.focus = null;
    for (const P of parts) P.ghost = 1;
    const from = { q: pivot.quaternion.clone(), p: pivot.position.clone(), target: cur.target.clone(), dist: cur.dist, camRoll: cur.camRoll, R: { ...R } };
    const ex0 = S.explode, cut0 = S.cutT, vis0 = parts.map(P => P.opacity);
    await runFly({
      from: target ? from : null, to: target, dur: reducedQ.matches ? 0 : target ? CLOSE_MS : 280,
      step(u, e) {
        S.explode = ex0 * (1 - e); S.explodeGoal = S.explode; S.cutT = cut0 * (1 - e);
        parts.forEach((P, i) => { P.opacity = lerp(vis0[i], 1, e); P.visible = true; });
        if (groundTo) {
          const g = lerpRect(fullRect(), groundTo, e);
          scissor = g;
          setGround(g, 28 * e, easeIO(win(u, .15, .7)));
        } else if (origin === 'hero' && target) setGround(null, 0, 0, 1 - easeIO(win(u, .35, 1)));
        else { setGround(null, 0, 0, 1 - e); canvas.style.opacity = (1 - e).toFixed(3); }
      },
    });
    finish();
  }
  function finish() {
    stop();
    fly = null; scissor = null;
    S.phase = 'closed';
    const wasHero = document.documentElement.classList.contains('cx-from-hero');
    document.documentElement.classList.remove('cx-lock', 'cx-from-hero', 'cx-covered');
    if (dialog.open) dialog.close();
    canvas.style.opacity = ''; setGround(null, 0, 0);
    const reel = window.__reel;
    if (reel) reel.resume();
    // focus back to the tile (or wherever it was)
    const back = S.origin === 'tile' && S.tileEl ? S.tileEl : S.opener;
    if (back && back.focus && back.isConnected) back.focus({ preventScroll: true });
    // keep warm: drop the full-screen buffers now, everything else after WARM_MS
    if (renderer) renderer.setSize(1, 1, false);
    clearTimeout(warmTimer);
    warmTimer = setTimeout(dispose, WARM_MS);
    void wasHero;
    onClosed && onClosed();
  }
  function waitOpen() { return new Promise(res => { const t = () => (S.phase === 'opening' ? setTimeout(t, 50) : res()); t(); }); }
  // the browser closed the dialog by itself (a second Esc while closing, for example)
  dialog.addEventListener('close', () => { if (S.phase !== 'closed') finish(); });
  dialog.addEventListener('cancel', e => { e.preventDefault(); esc(); });
  let escAt = 0;
  function esc() {
    if (performance.now() - escAt < 80) return;   // keydown and cancel both report one press
    escAt = performance.now();
    if (S.tour) { endTour(true); return; }
    if (S.selected != null) { deselect(); return; }
    onRequestClose();
  }
  closeBtn.addEventListener('click', () => onRequestClose());
  // keep page scrolling (and Lenis, which listens on window) out of the explorer
  for (const ev of ['wheel', 'keydown', 'pointerdown', 'touchstart']) dialog.addEventListener(ev, e => {
    if (ev === 'keydown' && e.key === 'Escape') { e.preventDefault(); esc(); }
    e.stopPropagation();
  }, { passive: ev !== 'keydown' });

  // ---------------------------------------------------------------- selection and card
  function partFacingRoll(P) {
    const x = P.center.x, z = P.center.z;
    if (Math.hypot(x, z) < .006) return goal.roll;
    // camera direction in the rocket's pre-roll frame, angle about the body axis
    qTmp.copy(goal.orbit).multiply(qBase).invert();
    V.set(0, 0, 1).applyQuaternion(qTmp);
    const a = Math.atan2(V.x, V.z), b = Math.atan2(x, z);
    let r = a - b;
    while (r - goal.roll > Math.PI) r -= 2 * Math.PI;
    while (r - goal.roll < -Math.PI) r += 2 * Math.PI;
    return r;
  }
  function select(id, { fromList = false, quiet = false } = {}) {
    const P = byId.get(id);
    if (!P) return;
    if (!P.visible) { S.groups[P.group] = true; syncGroups(); }
    S.selected = id;
    for (const Q of parts) Q.ghost = Q === P ? 1 : (Q.exterior ? GHOST_EXT : GHOST_INT);
    goal.focus = id; goal.zoom = 1; goal.pan.set(0, 0, 0);
    goal.roll = partFacingRoll(P);
    for (const Q of parts) { Q.btn.setAttribute('aria-current', String(Q === P)); Q.tag.classList.toggle('is-on', Q === P); }
    if (!quiet) showCard(P, fromList);
    live.textContent = `${P.story.label} in focus.`;
    invalidate();
  }
  function deselect() {
    if (S.selected == null) return;
    S.selected = null; goal.focus = null; goal.zoom = 1; goal.pan.set(0, 0, 0);
    for (const Q of parts) { Q.ghost = 1; Q.btn.setAttribute('aria-current', 'false'); Q.tag.classList.remove('is-on'); }
    hideCard();
    live.textContent = 'Full rocket.';
    invalidate();
  }
  function showCard(P, focusIt) {
    const s = P.story;
    cardLabel.textContent = `${pad(P.n)} / ${s.category}`;
    cardTitle.textContent = s.label; cardLede.textContent = s.subtitle; cardDesc.textContent = s.description;
    cardRole.textContent = s.role; cardMatRow.hidden = !s.material; cardMat.textContent = s.material || '';
    card.hidden = false; hint.hidden = true;
    card.scrollTop = 0;
    if (mobile()) setSheet(false);
    if (focusIt) cardTitle.focus({ preventScroll: true });
  }
  function hideCard() { card.hidden = true; hint.hidden = false; }
  cardX.addEventListener('click', () => { const P = byId.get(S.selected); deselect(); if (P && P.btn && !mobile()) P.btn.focus({ preventScroll: true }); });

  // ---------------------------------------------------------------- controls
  explode.addEventListener('input', () => { endTour(true); S.explodeGoal = +explode.value / 100; explodeOut.value = explode.value + '%'; invalidate(); });
  function setCut(on) {
    if (on && !S.cutOn) {
      // the half facing the camera comes away: plane normal, in model space, points away from the camera
      model.updateWorldMatrix(true, false);
      qTmp.setFromRotationMatrix(model.matrixWorld).invert();
      cutNormal.set(0, 0, -1).applyQuaternion(qTmp); cutNormal.y = 0;
      if (cutNormal.lengthSq() < 1e-4) cutNormal.set(0, 0, -1);
      cutNormal.normalize();
    }
    S.cutOn = on; cutBtn.setAttribute('aria-pressed', String(on));
    invalidate();
  }
  cutBtn.addEventListener('click', () => { endTour(true); setCut(!S.cutOn); });
  labelsBtn.addEventListener('click', () => { S.labels = !S.labels; labelsBtn.setAttribute('aria-pressed', String(S.labels)); invalidate(); });
  tourBtn.addEventListener('click', () => startTour(true));
  resetBtn.addEventListener('click', () => {
    endTour(true); deselect();
    goal.orbit.identity(); goal.roll = ROLL0; goal.zoom = 1; goal.pan.set(0, 0, 0);
    S.explodeGoal = 0; explode.value = '0'; explodeOut.value = '0%'; setCut(false);
    invalidate();
  });
  function syncGroups() {
    for (const c of chips) c.setAttribute('aria-pressed', String(S.groups[c.dataset.group]));
    for (const P of parts) { P.visible = S.groups[P.group]; P.li.hidden = !P.visible; }
    invalidate();
  }
  for (const c of chips) c.addEventListener('click', () => {
    endTour(true);
    const k = c.dataset.group;
    S.groups[k] = !S.groups[k];
    if (!S.groups[k] && S.selected != null && byId.get(S.selected).group === k) deselect();
    syncGroups();
  });
  function setSheet(open) {
    S.sheetOpen = open; panel.classList.toggle('is-open', open);
    grab.setAttribute('aria-expanded', String(open)); grab.textContent = open ? 'Fewer controls' : 'More controls';
    if (S.built && S.phase !== 'closed') requestAnimationFrame(resize);
  }
  grab.addEventListener('click', () => setSheet(!S.sheetOpen));

  // ---------------------------------------------------------------- orbit, zoom, pan, pick
  const ptrs = new Map();
  let downAt = null, panMode = false, pinch = 0, dragged = false;
  const rotBy = (dx, dy) => {
    qTmp.setFromAxisAngle(V.set(0, 1, 0), dx * .0085); goal.orbit.premultiply(qTmp);
    qTmp.setFromAxisAngle(V.set(1, 0, 0), dy * .0085); goal.orbit.premultiply(qTmp);
    goal.orbit.normalize();
  };
  const zoomBy = f => { goal.zoom = Math.max(.12, Math.min(2.6, goal.zoom * f)); };
  const panBy = (dx, dy) => { const k = 2 * cur.dist * Math.tan(THREE.MathUtils.degToRad(FOV / 2)) / R.h; goal.pan.x -= dx * k; goal.pan.y += dy * k; };
  canvas.addEventListener('pointerdown', e => {
    if (S.phase !== 'open') return;
    canvas.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 1) { downAt = { x: e.clientX, y: e.clientY, t: performance.now() }; dragged = false; panMode = e.shiftKey || e.button === 2; }
    else { downAt = null; pinch = 0; }
    endTour(true);
  });
  const lift = e => { ptrs.delete(e.pointerId); pinch = 0; if (!ptrs.size) canvas.classList.remove('is-drag'); };
  canvas.addEventListener('pointerup', e => {
    const d = downAt;
    lift(e);
    if (d && !dragged && performance.now() - d.t < 600) pick(e.clientX, e.clientY);
    downAt = null;
  });
  canvas.addEventListener('pointercancel', e => { lift(e); downAt = null; });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointermove', e => {
    const p = ptrs.get(e.pointerId);
    if (!p) { hover(e.clientX, e.clientY); return; }
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 6) { dragged = true; canvas.classList.add('is-drag'); }
    if (!dragged && ptrs.size === 1) return;
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()], dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch) zoomBy(pinch / dist);
      pinch = dist; panBy(dx / 2, dy / 2);
    } else if (panMode) panBy(dx, dy);
    else rotBy(dx, dy);
    invalidate();
  });
  canvas.addEventListener('wheel', e => { e.preventDefault(); if (S.phase !== 'open') return; endTour(true); zoomBy(Math.exp(e.deltaY * .0012)); invalidate(); }, { passive: false });
  canvas.addEventListener('keydown', e => {
    if (S.phase !== 'open') return;
    const k = e.key, step = e.shiftKey ? 30 : 12;
    if (k === 'ArrowLeft') rotBy(-step, 0); else if (k === 'ArrowRight') rotBy(step, 0);
    else if (k === 'ArrowUp') rotBy(0, -step); else if (k === 'ArrowDown') rotBy(0, step);
    else if (k === '+' || k === '=') zoomBy(.85); else if (k === '-' || k === '_') zoomBy(1.18);
    else return;
    e.preventDefault(); endTour(true); invalidate();
  });
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function hitPart(x, y) {
    if (!S.built || S.phase !== 'open') return null;
    setPose();
    ndc.set(x / W * 2 - 1, -(y / H) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const objs = [];
    for (const P of parts) if (P.obj.visible) for (const m of P.meshes) objs.push(m);
    const cutting = S.cutT > 0;
    let ghostHit = null;
    for (const hit of ray.intersectObjects(objs, false)) {
      if (cutting && clipPlane.distanceToPoint(hit.point) < 0) continue;
      const P = hit.object.userData.part;
      if (P.ghost > .5) return P;
      if (!ghostHit || (ghostHit.exterior && !P.exterior)) ghostHit = P;
    }
    return ghostHit;
  }
  function pick(x, y) {
    const P = hitPart(x, y);
    if (P) select(P.id); else deselect();
  }
  let hoverQ = false, hx = 0, hy = 0;
  function hover(x, y) {
    if (!matchMedia('(hover: hover)').matches) return;
    hx = x; hy = y;
    if (hoverQ) return;
    hoverQ = true;
    requestAnimationFrame(() => { hoverQ = false; canvas.classList.toggle('is-hot', !!hitPart(hx, hy)); });
  }

  // ---------------------------------------------------------------- labels
  const placed = [];
  function placeTags() {
    const show = S.labels && S.phase === 'open' && !fly;
    placed.length = 0;
    const only = S.tour ? TOUR[S.tour.i] : S.selected;
    for (const P of parts) {
      const t = P.tag;
      let ok = show && P.visible && P.meshes.length > 0 && (only == null || P.id === only);
      if (ok) {
        partWorldCenter(P, V).project(camera);
        const x = (V.x + 1) / 2 * W, y = (1 - V.y) / 2 * H;
        ok = V.z < 1 && x > R.x + 10 && x < R.x + R.w - 10 && y > R.y + 10 && y < R.y + R.h - 10;
        if (ok && only == null) for (const q of placed) if (Math.abs(q[0] - x) < 24 && Math.abs(q[1] - y) < 24) { ok = false; break; }
        if (ok) { placed.push([x, y]); t.style.transform = `translate(${(x - 11).toFixed(1)}px, ${(y - 11).toFixed(1)}px)`; }
      }
      if (t.hidden === ok) t.hidden = !ok;
    }
  }

  // ---------------------------------------------------------------- tour
  let tourTimer = 0;
  function startTour(force = false) {
    if (S.phase !== 'open' || (!force && S.toured)) return;
    S.toured = true;
    try { sessionStorage.setItem('cx-toured', '1'); } catch (e) { /* private mode */ }
    deselect();
    goal.orbit.identity(); goal.zoom = 1; goal.pan.set(0, 0, 0);
    S.explodeGoal = 0; explode.value = '0'; explodeOut.value = '0%';
    S.tour = { i: -1 };
    tourBox.hidden = false; hint.hidden = true;
    nextStop();
  }
  function nextStop() {
    const T = S.tour;
    if (!T) return;
    T.i++;
    if (T.i >= TOUR.length) { endTour(false); return; }
    const P = byId.get(TOUR[T.i]);
    select(P.id, { quiet: true });
    tourStep.textContent = `${pad(T.i + 1)} / ${pad(TOUR.length)}`;
    tourName.textContent = P.story.label; tourLine.textContent = P.story.subtitle;
    tourTimer = setTimeout(nextStop, TOUR_MS);
  }
  // skipped (any input) or finished: back to the whole rocket, free orbit
  function endTour(byUser) {
    if (!S.tour) return;
    clearTimeout(tourTimer);
    S.tour = null; tourBox.hidden = true; hint.hidden = !card.hidden;
    deselect();
    goal.roll = ROLL0;
    live.textContent = byUser ? 'Tour skipped.' : 'Tour finished.';
    invalidate();
  }
  tourSkip.addEventListener('click', () => endTour(true));

  // ---------------------------------------------------------------- API
  return {
    open, close,
    get isOpen() { return S.phase !== 'closed'; }, get phase() { return S.phase; }, get busy() { return raf !== 0 || !!fly; },
    stats, state: S, dispose,
    get view() { return { cur: { ...cur, target: cur.target.toArray(), orbit: cur.orbit.toArray() }, goal: { ...goal, pan: goal.pan.toArray(), orbit: goal.orbit.toArray() }, R, W, H, home: S.built ? homeDist(S.explode) : 0 }; },
    get parts() { return parts.map(P => ({ id: P.id, n: P.n, label: P.story.label, group: P.group, visible: P.visible, center: P.center.toArray().map(v => +v.toFixed(3)), size: P.box.getSize(new THREE.Vector3()).toArray().map(v => +v.toFixed(3)), meshes: P.meshes.length })); },
    select: id => select(id), deselect, setCut, startTour: () => startTour(true), endTour: () => endTour(true),
    setExplode(v) { explode.value = String(Math.round(v * 100)); explode.dispatchEvent(new Event('input')); },
    screenOf(id) { const P = byId.get(id); if (!P || !camera) return null; setPose(); partWorldCenter(P, V).project(camera); return { x: (V.x + 1) / 2 * W, y: (1 - V.y) / 2 * H }; },
    info() { return renderer ? { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, programs: renderer.info.programs.length, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures } : null; },
  };
}
