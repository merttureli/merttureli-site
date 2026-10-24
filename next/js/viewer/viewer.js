// VIEWER SHELL: one in-place 3D viewer for every project (docs/recipes/viewer.md).
//
// launch.js imports this and a product config (next/js/viewer/products/<slug>.js) on
// prefetch, and calls createViewer(config, hooks) on the first open. The shell owns
// everything that is the same for every product; the config owns only the model.
//
// The shell: a full-screen modal <dialog> that grows from the element that was clicked
// (a work tile, a case-page stage or the hero) while the model flies from where it was
// drawn there to the centre (close is the same move backwards); orbit, zoom, pan and
// reset; a glass controls panel (a bottom sheet on phones); numbered orange labels;
// part-group toggles; an explode slider; an optional section cut with solid stencil
// caps; part cards; an optional tour; an optional slot for product controls (sliders,
// toggles) with an update(t, state) hook for product motion; focus trap, Esc, reduced
// motion; dispose or keep warm. launch.js owns the URL hash, Back, deep links, prefetch
// near the viewport and pausing the hero and any case stage while it is open.
//
// The renderer is created on the first open and kept warm after a close with its
// canvas shrunk to 1 x 1 px (programs and buffers stay, the full-screen colour, depth
// and MSAA buffers go), so a second open costs no shader compile; after WARM_MS closed
// it is disposed completely. It draws only while something moves.
//
// Lit by the hero's rig (addStudioLights from showreel/engine.js) with the hero's
// renderer settings, through one three.js copy (next/js/three.module.min.js).
// The CHARGER explorer is products/charger.js on this shell.
import * as THREE from '../three.module.min.js';
import { addStudioLights, createStudioEnvironment, ease, clamp01, lerp, win } from '../showreel/engine.js';

const reducedQ = matchMedia('(prefers-reduced-motion: reduce)');
const OPEN_MS = 900, CLOSE_MS = 720;              // --dur-900; close a touch quicker
const WARM_MS = 180000;
const CUT_MS = 650;                               // section sweep
const CAP_COLOR = 0xd2cdc4;                       // section caps: matte warm grey
const VIEW_RATE = 7;                              // how fast the view eases to its goal (1/s)
const envs = new WeakMap();                       // one studio environment (PMREM) per renderer
const DEFAULTS = {
  fov: 24,                                        // the hero's lens (hero3d.js LAYOUTS)
  fit: .9,                                        // share of the frame the whole model fills
  roll0: 0,                                       // home turn about the model's +Y axis (rad)
  base: () => [.42, -.62, 0],                     // home orientation (Euler XYZ, rad): a three-quarter view from a little above
  center: true,                                   // centre the model's box on the orbit pivot
  env: true,                                      // the studio environment on the model's standard materials (engine.js adopt)
  clearHead: true,                                // the model's frame starts below the title block
  controlsSheet: 'always',                        // phones: product controls always in the sheet, or 'more' (only when it is open)
  ghost: { exterior: .07, interior: .16 },        // opacity of the other parts while one is picked
  tourMs: 3300,
};
// UI words; a product can replace any of them (config.text)
const TEXT = {
  canvas: 'Drag to turn, scroll or pinch to zoom, arrow keys to turn, plus and minus to zoom. Pick a part to read about it.',
  close: 'Close the viewer', panel: 'Viewer controls', hint: 'Drag to turn / Scroll to zoom / Click a part',
  explode: 'Explode', section: 'Section', labels: 'Labels', tour: 'Tour', reset: 'Reset view', skip: 'Skip tour',
  show: 'Show', parts: 'Parts', more: 'More controls', fewer: 'Fewer controls', closeCard: 'Close the part card',
  whole: 'Whole model.', lost: '3D paused. Close and open the viewer again to restore it.',
};

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
const toV3 = v => (v == null ? new THREE.Vector3() : typeof v === 'number' ? new THREE.Vector3(0, v, 0) : v.isVector3 ? v.clone() : new THREE.Vector3().fromArray(v));

export function createViewer(product, { onRequestClose, onClosed, hosts } = {}) {
  const C = { ...DEFAULTS, ...product, ghost: { ...DEFAULTS.ghost, ...(product.ghost || {}) } };
  const T = { ...TEXT, ...(product.text || {}) };
  const id = s => `cx-${C.slug}-${s}`;
  const GROUPS = (C.groups || []).map(g => (Array.isArray(g) ? { key: g[0], label: g[1] } : g));
  const TOUR = (C.tour && (C.tour.stops || C.tour)) || [];
  const TOUR_MS = (C.tour && C.tour.ms) || C.tourMs;
  const CUT = C.cut === false || C.cut == null ? null : { cap: CAP_COLOR, ...(C.cut === true ? {} : C.cut) };
  const FOV = C.fov;
  // ---------------------------------------------------------------- DOM
  const canvas = h('canvas', { class: 'cx__canvas', tabindex: '0', role: 'img', 'aria-label': C.canvasLabel || `${C.name || C.title}. ${T.canvas}` });
  const ink = h('span', { class: 'cx__ink' });
  const ground = h('div', { class: 'cx__ground', 'aria-hidden': 'true' }, ink, ...(C.ghostWord ? [h('span', { class: 'cx__ghost', text: C.ghostWord })] : []));
  const tags = h('div', { class: 'cx__tags cx__ui', 'aria-hidden': 'true' });
  const title = h('h2', { class: 'cx__title', id: id('title'), text: C.title });
  const head = h('header', { class: 'cx__head cx__ui' }, ...(C.eyebrow ? [h('p', { class: 'label', text: C.eyebrow })] : []), title);
  const closeBtn = h('button', { class: 'cx__close cx__ui', type: 'button', 'aria-label': T.close });
  const explode = h('input', { type: 'range', id: id('explode'), min: '0', max: '100', step: '1', value: '0' });
  const explodeOut = h('output', { for: id('explode'), text: '0%' });
  const btn = (text, act, pressed) => h('button', { class: 'cx__btn', type: 'button', 'data-act': act, 'aria-pressed': pressed == null ? false : String(pressed), text });
  const cutBtn = btn(T.section, 'cut', false), labelsBtn = btn(T.labels, 'labels', true), tourBtn = btn(T.tour, 'tour'), resetBtn = btn(T.reset, 'reset');
  const chips = GROUPS.map(({ key, label }) => h('button', { class: 'cx__btn cx__btn--chip', type: 'button', 'data-group': key, 'aria-pressed': 'true' }, h('span', { class: 'dot', 'aria-hidden': 'true' }), label));
  const list = h('ol', { class: 'cx__parts' });
  const more = h('div', { class: 'cx__more', id: id('more') },
    ...(chips.length > 1 ? [h('h3', { class: 'label', text: T.show }), h('div', { class: 'cx__chips' }, ...chips)] : []),
    h('h3', { class: 'label', text: T.parts }), list);
  const grab = h('button', { class: 'cx__grab', type: 'button', 'aria-expanded': 'false', 'aria-controls': id('more'), text: T.more });
  const custom = h('div', { class: 'cx__custom', hidden: true });
  const panel = h('aside', { class: 'cx__panel cx__ui' + (C.controlsSheet === 'more' ? ' is-controls-more' : ''), 'aria-label': T.panel }, grab,
    h('div', { class: 'cx__row' }, h('label', { for: id('explode'), text: T.explode }), explode, explodeOut),
    h('div', { class: 'cx__btns' }, ...(CUT ? [cutBtn] : []), labelsBtn, ...(TOUR.length ? [tourBtn] : []), resetBtn), custom, more);
  const cardX = h('button', { class: 'cx__x', type: 'button', 'aria-label': T.closeCard });
  const cardLabel = h('p', { class: 'label' }), cardTitle = h('h3', { id: id('card-title'), tabindex: '-1' }), cardLede = h('p', { class: 'lede' }), cardDesc = h('p', { class: 'desc' });
  const cardDl = h('dl');
  const card = h('section', { class: 'cx__card cx__ui', 'aria-labelledby': id('card-title'), hidden: true }, cardX, cardLabel, cardTitle, cardLede, cardDesc, cardDl);
  const tourStep = h('span', { class: 'label' }), tourName = h('span', { class: 'cx__tname' }), tourLine = h('span', { class: 'cx__tline' });
  const tourSkip = h('button', { class: 'cx__btn', type: 'button', text: T.skip });
  const tourBox = h('div', { class: 'cx__tour cx__ui', hidden: true, role: 'status' }, h('div', { class: 'cx__ttext' }, tourStep, tourName, tourLine), tourSkip);
  const hint = h('p', { class: 'cx__hint label cx__ui', text: T.hint });
  const live = h('div', { class: 'sr-only', 'aria-live': 'polite' });
  const dialog = h('dialog', { class: 'cx', 'aria-labelledby': id('title'), 'data-lenis-prevent': '', 'data-viewer-slug': C.slug, tabindex: '-1' },
    ground, canvas, tags, head, panel, card, tourBox, hint, closeBtn, live);
  document.body.append(dialog);

  // ---------------------------------------------------------------- state
  const S = {
    phase: 'closed', origin: 'tile', tileEl: null, built: false,
    explode: 0, explodeGoal: 0, cutOn: false, cutT: 0, labels: true,
    groups: Object.fromEntries(GROUPS.map(g => [g.key, true])),
    selected: null, tour: null, sheetOpen: false, t: 0,
  };
  const stats = { opens: 0, firstFrameMs: 0, openMs: 0, buildMs: 0, frames: 0, frameMs: [], cpuMs: [], cold: true };

  let renderer = null, scene = null, camera = null, pivot = null, model = null, built = null;
  let capMesh = null, stencilMat = null, parts = [], byId = new Map(), raf = 0, last = 0, warmTimer = 0, buildP = null;
  let fly = null, R = { x: 0, y: 0, w: 1, h: 1 }, Rg = null, W = 1, H = 1, scissor = null;   // R: the frame drawn in; Rg: where it is heading
  let env = null, keep = null, meshList = [], viewRate = VIEW_RATE;
  let cutFar = .12;
  const clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 1e3), modelPlane = new THREE.Plane(), cutNormal = new THREE.Vector3(0, 0, -1), cutPoint = new THREE.Vector3();
  const qBase = new THREE.Quaternion(), qTmp = new THREE.Quaternion(), qRoll = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0);
  const V = new THREE.Vector3(), V2 = new THREE.Vector3(), TGT = new THREE.Vector3(), M = new THREE.Matrix4(), BOX = new THREE.Box3();
  const ROLL0 = C.roll0;
  // the view: model orientation = orbit * base * roll(about the model's Y axis); camera on +Z of target
  const cur = { orbit: new THREE.Quaternion(), roll: ROLL0, target: new THREE.Vector3(), dist: 2.2, camRoll: 0 };
  const goal = { orbit: new THREE.Quaternion(), roll: ROLL0, zoom: 1, pan: new THREE.Vector3(), focus: null };

  const mobile = () => innerWidth <= 760;
  const layoutBase = () => {
    const port = innerWidth / innerHeight < 1;
    qBase.setFromEuler(new THREE.Euler(...C.base(port)));
  };

  // what a product config's hooks receive
  const ctx = {
    THREE, Y, get scene() { return scene; }, get pivot() { return pivot; }, get model() { return model; }, get camera() { return camera; },
    get parts() { return parts; }, part: pid => byId.get(pid), state: S, invalidate: () => invalidate(), live: text => { live.textContent = text; },
    get rect() { return { ...R }; }, get size() { return { w: W, h: H }; }, get reduced() { return reducedQ.matches; },
    get roll0() { return ROLL0; }, get fov() { return FOV; },
    get renderer() { return renderer; }, get env() { return env; },
    setExplode: (v, o) => setExplodeQuiet(v, o), setShown: (pid, on) => setShown(pid, on),
    // the camera, for a product's own motion (Play): goals the view eases to, as the user's own moves do
    view: {
      set: o => setView(o), home: () => setView({ yaw: 0, pitch: 0, roll: ROLL0, zoom: 1, pan: [0, 0, 0], focus: null, rate: VIEW_RATE }),
      get: () => ({ orbit: goal.orbit.clone(), roll: goal.roll, zoom: goal.zoom, pan: goal.pan.toArray(), focus: goal.focus, rate: viewRate }),
    },
  };
  // a hook from the build result, else from the config
  const hook = name => (built && built[name]) || C[name];

  // ---------------------------------------------------------------- build
  // the scene graph (CPU only: decode, materials, part list). launch.js runs it on idle once the
  // model is prefetched, so the first open only has the renderer and the shaders to make
  let sceneP = null;
  function warm() {
    if (sceneP) return sceneP;
    sceneP = (async () => {
      scene = new THREE.Scene();
      addStudioLights(scene);
      camera = new THREE.PerspectiveCamera(FOV, 1, .01, 30);
      pivot = new THREE.Group();
      scene.add(pivot);
      built = await C.build(ctx);
      model = built.model;
      if (model.parent !== pivot) { model.removeFromParent(); pivot.add(model); }
      model.updateMatrixWorld(true);
      // the part list
      const inv = new THREE.Matrix4().copy(model.matrixWorld).invert();
      const used = new Map(), owners = new Map();
      const isIn = (o, root) => { for (; o; o = o.parent) if (o === root) return true; return false; };
      for (const p of built.parts) {
        const obj = p.obj;
        const meshes = p.meshes ? [...p.meshes] : [];
        if (!p.meshes) obj.traverse(o => { if (o.isMesh) meshes.push(o); });
        for (const m of meshes) (owners.get(m) || owners.set(m, []).get(m)).push(p);
      }
      let warned = false;
      for (const p of built.parts) {
        const obj = p.obj;
        const meshes = p.meshes ? [...p.meshes] : [];
        if (!p.meshes) obj.traverse(o => { if (o.isMesh) meshes.push(o); });
        let box = p.box;
        if (!box) {
          box = new THREE.Box3();
          const tight = p.tight != null ? p.tight : C.tightBoxes;
          for (const m of meshes) {
            m.updateWorldMatrix(true, false);
            M.copy(inv).multiply(m.matrixWorld);
            if (tight && m.geometry.attributes.position) {
              // vertex by vertex: a turned part's own box, turned, would frame it too loose
              const pos = m.geometry.attributes.position;
              for (let i = 0; i < pos.count; i++) box.expandByPoint(V.fromBufferAttribute(pos, i).applyMatrix4(M));
            } else { m.geometry.computeBoundingBox(); box.union(BOX.copy(m.geometry.boundingBox).applyMatrix4(M)); }
          }
          if (box.isEmpty()) box.setFromCenterAndSize(obj.position, new THREE.Vector3(.004, .004, .004));
        }
        // one material per part, so a part can ghost alone (a mesh several parts share keeps its own)
        if (C.uniqueMaterials !== false) for (const m of meshes) {
          if (owners.get(m).length > 1) continue;
          const owner = used.get(m.material);
          if (owner !== undefined && owner !== p) m.material = m.material.clone();
          used.set(m.material, p);
        }
        // a part with no group: config.defaultGroup, else none (always shown, never toggled)
        let group = p.group != null ? p.group : C.defaultGroup != null ? C.defaultGroup : null;
        if (group == null && GROUPS.length && C.defaultGroup === undefined && !warned) { warned = true; console.warn(`[viewer] ${C.slug}: part "${p.id}" has no group; it always shows (set config.defaultGroup, or null to silence this)`); }
        const P = {
          id: p.id, label: p.label, kind: p.kind || '', card: p.card || null, obj, meshes, base: obj.position.clone(), box,
          center: box.getCenter(new THREE.Vector3()), dir: toV3(p.explode), opacity: 1, ghost: 1, visible: p.shown !== false, n: 0, tag: null, li: null,
          group, exterior: p.exterior !== false, data: p, shown: p.shown !== false, listed: p.list !== false,
          frame: p.frame !== false,
        };
        // anchors that follow a moving object (p.follow): its matrix in model space at rest, inverted
        if (p.follow) { p.follow.updateWorldMatrix(true, false); P.followRest = new THREE.Matrix4().copy(inv).multiply(p.follow.matrixWorld).invert(); P.followInObj = isIn(p.follow, obj); }
        parts.push(P); byId.set(P.id, P);
      }
      // every mesh once, with the parts that show it (a shared mesh follows the most opaque of them)
      meshList = [];
      for (const P of parts) for (const m of P.meshes) {
        if (m.userData.viewerOwners && m.userData.viewerOwners.shell === meshList) { if (!m.userData.viewerOwners.includes(P)) m.userData.viewerOwners.push(P); continue; }
        const own = [P]; own.shell = meshList; m.userData.viewerOwners = own;
        meshList.push({ m, owners: own, outside: false });
      }
      for (const E of meshList) E.outside = !E.owners.some(P => isIn(E.m, P.obj));
      // centre the model on the pivot (the orbit turns about its middle)
      if (C.center) {
        const b = new THREE.Box3();
        for (const P of parts) b.union(P.box);
        if (!b.isEmpty()) model.position.sub(b.getCenter(V));
      }
      // section plane: through cut.point (model space) or the middle of the model
      if (CUT) {
        const b = new THREE.Box3();
        for (const P of parts) b.union(P.box);
        cutPoint.copy(CUT.point ? toV3(CUT.point) : b.getCenter(V));
        cutFar = CUT.far != null ? CUT.far : b.getSize(V).length() * .6;
      }
      // materials: clipping plane always set (a far plane clips nothing), so toggling the cut
      // never changes a shader; stencil passes for the caps
      stencilMat = new THREE.MeshBasicMaterial({
        colorWrite: false, depthWrite: false, depthTest: false, side: THREE.DoubleSide, clippingPlanes: [clipPlane],
        stencilWrite: true, stencilFunc: THREE.AlwaysStencilFunc, stencilFail: THREE.InvertStencilOp, stencilZFail: THREE.InvertStencilOp, stencilZPass: THREE.InvertStencilOp,
      });
      const noRay = () => {};
      for (const { m, owners: own } of meshList) {
        m.material.clippingPlanes = [clipPlane];
        m.material.needsUpdate = true;
        m.userData.part = own[0];
        if (!CUT) continue;
        const s = new THREE.Mesh(m.geometry, stencilMat);
        s.renderOrder = 1; s.visible = false; s.raycast = noRay; s.userData.stencil = true;
        m.add(s); m.userData.stencilMesh = s;
      }
      if (CUT) {
        capMesh = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshStandardMaterial({
          color: CUT.cap, roughness: .82, metalness: 0, side: THREE.DoubleSide,
          stencilWrite: true, stencilRef: 0, stencilFunc: THREE.NotEqualStencilFunc, stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp, stencilZPass: THREE.ReplaceStencilOp,
        }));
        capMesh.renderOrder = 2; capMesh.visible = false; capMesh.raycast = noRay;
        scene.add(capMesh);
      }
      // numbering: the config's order, or its sort
      if (C.sortParts) parts.sort(C.sortParts);
      let n = 0;
      for (const P of parts) P.n = P.listed ? ++n : 0;
      buildList();
      if (C.controls && !custom.childElementCount) {
        const els = [].concat(C.controls(ctx) || []);
        custom.append(...els); custom.hidden = !els.length;
      }
      hook('ready') && hook('ready')(ctx);
    })();
    sceneP.catch(() => { sceneP = null; });
    return sceneP;
  }
  function build() {
    if (buildP) return buildP;
    const t0 = performance.now();
    buildP = (async () => {
      await warm();
      if (!renderer) {
        renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, stencil: true, powerPreference: 'default' });
        renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.setClearColor(0x000000, 0);
        renderer.localClippingEnabled = true;
        renderer.debug.checkShaderErrors = /[?&#]debug\b/.test(location.href);
        canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); live.textContent = T.lost; });
      }
      // the studio environment (engine.js createStudioEnvironment, one per renderer) on every standard
      // material of the model that has none yet, at x .55 as engine.adopt() gives the showreel's guests
      if (C.env !== false) {
        env = envs.get(renderer);
        if (!env) { env = createStudioEnvironment(renderer); envs.set(renderer, env); }
        model.traverse(o => {
          for (const m of o.material ? [].concat(o.material) : []) {
            if (!m.isMeshStandardMaterial || m.envMap || m.userData.viewerEnv) continue;
            m.userData.viewerEnv = true; m.envMap = env; m.envMapIntensity *= .55; m.needsUpdate = true;
          }
        });
      }
      hook('gpu') && hook('gpu')(ctx);
      layoutBase();
      R = stageRect();
      // compile every variant now (opaque and ghosted parts, stencil passes, caps), not on first use
      const all = [];
      scene.traverse(o => { if (o.isMesh) { all.push([o, o.visible]); o.visible = true; } });
      setPose(); renderer.setSize(Math.max(2, W), Math.max(2, H), false);
      const compile = async () => {
        if (renderer.extensions.has('KHR_parallel_shader_compile')) await renderer.compileAsync(scene, camera).catch(() => {});
        else renderer.compile(scene, camera);
      };
      for (const transparent of [true, false]) {
        for (const { m } of meshList) { m.material.transparent = transparent; m.material.needsUpdate = true; }
        await compile();
      }
      // keep both variants warm: three.js frees a program once no material uses it, so the ghosted
      // (transparent) programs would go with the pass above and the first pick would compile again.
      // An invisible copy of each part material in each state holds its program for as long as the scene lives.
      if (!keep) {
        keep = new THREE.Group();
        const seen = new Set();
        for (const { m } of meshList) {
          if (seen.has(m.material)) continue;
          seen.add(m.material);
          for (const transparent of [true, false]) {
            const k = m.material.clone();
            k.transparent = transparent; k.depthWrite = !transparent; k.opacity = transparent ? .5 : 1;
            const km = new THREE.Mesh(m.geometry, k);
            km.frustumCulled = false; km.raycast = () => {}; km.userData.keep = true;
            keep.add(km);
          }
        }
        scene.add(keep);
        await compile();
      }
      // compile() alone builds programs without the section plane's clipping state, so the first real
      // frame (and the first pick) would build them again: draw once with everything on, the canvas still
      // hidden (open() keeps it at opacity 0 until the fly starts)
      keep.visible = true;
      renderer.render(scene, camera);
      keep.visible = false;
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
    built && built.dispose && built.dispose();
    scene.traverse(o => {
      if (!o.isMesh || o.userData.stencil) return;
      if (!o.userData.keep) o.geometry.dispose();
      for (const m of [].concat(o.material)) { if (m.map) m.map.dispose(); m.dispose(); }
    });
    stencilMat.dispose();
    renderer.renderLists.dispose();
    renderer.info.reset();
    scene = camera = pivot = model = built = capMesh = stencilMat = keep = null;
    parts = []; byId = new Map(); meshList = []; buildP = sceneP = null; S.built = false;
    list.replaceChildren(); tags.replaceChildren();
  }

  function buildList() {
    list.replaceChildren(); tags.replaceChildren();
    for (const P of parts) {
      const b = h('button', { type: 'button' }, h('span', { class: 'cx__n', 'aria-hidden': 'true', text: pad(P.n) }), h('span', { class: 'cx__pname', text: P.label }), h('span', { class: 'cx__pcat', text: P.kind }));
      b.setAttribute('aria-label', `${pad(P.n)}, ${P.label}`);
      b.addEventListener('click', () => select(P.id, { fromList: true }));
      const li = h('li', { hidden: !P.listed }, b);
      list.append(li); P.li = li; P.btn = b;
      const t = h('button', { class: 'cx__tag', type: 'button', tabindex: '-1', text: String(P.n) }, h('span', { class: 'tip', text: P.label }));
      t.addEventListener('click', e => { e.stopPropagation(); select(P.id); });
      tags.append(t); P.tag = t;
    }
  }

  // ---------------------------------------------------------------- geometry helpers
  // a part's point in model space as it is drawn now: explode, and the motion of what it follows (p.follow)
  const FM = new THREE.Matrix4(), MI = new THREE.Matrix4();
  function partLocal(P, out, pt = P.center) {
    out.copy(pt);
    if (!P.followRest || !P.followInObj) out.addScaledVector(P.dir, S.explode);
    if (P.followRest) {
      model.updateWorldMatrix(true, false); P.data.follow.updateWorldMatrix(true, false);
      out.applyMatrix4(FM.copy(MI.copy(model.matrixWorld).invert()).multiply(P.data.follow.matrixWorld).multiply(P.followRest));
    }
    return out;
  }
  function partWorldCenter(P, out) { return model.localToWorld(P.followRest ? partLocal(P, out) : out.copy(P.center).addScaledVector(P.dir, S.explode)); }
  // where its numbered label sits: anchor(out, P, ctx) (model space, every frame), an offset from the box centre, or the centre
  function tagWorld(P, out) {
    const a = P.data.anchor;
    if (typeof a === 'function') return model.localToWorld(a(out, P, ctx) || out);
    if (a) return model.localToWorld(partLocal(P, out, V2.copy(P.center).add(toV3(a))));
    return partWorldCenter(P, out);
  }
  function visibleBox(explodeAmt, out) {
    out.makeEmpty();
    for (const P of parts) {
      if (!P.visible || !P.frame) continue;
      BOX.copy(P.box).translate(V2.copy(P.dir).multiplyScalar(explodeAmt));
      out.union(BOX);
    }
    if (out.isEmpty()) out.setFromCenterAndSize(V.set(0, 0, 0), V2.set(.1, .1, .1));
    return out;
  }
  // distance that fits the visible parts in the frame at the home orientation (so turning never zooms)
  const fitBox = new THREE.Box3();
  function homeDist(explodeAmt, rect = R) {
    visibleBox(explodeAmt, fitBox);
    const c = fitBox.getCenter(new THREE.Vector3()), q = qTmp.copy(qBase).multiply(qRoll.setFromAxisAngle(Y, ROLL0));
    const tanV = Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * C.fit, tanH = tanV * rect.w / rect.h;
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
  function homeCenter(out, explodeAmt = S.explode) { visibleBox(explodeAmt, fitBox); return model.localToWorld(fitBox.getCenter(out)); }

  // where the parts and the plane are for the current state
  function placeParts() { for (const P of parts) { P.obj.position.copy(P.base).addScaledVector(P.dir, S.explode); } }
  function setPose() {
    pivot.quaternion.copy(cur.orbit).multiply(qBase).multiply(qRoll.setFromAxisAngle(Y, cur.roll));
    if (fly && fly.q) pivot.quaternion.copy(fly.q);
    if (fly && fly.p) pivot.position.copy(fly.p); else pivot.position.set(0, 0, 0);
    placeParts();
    for (const P of parts) P.obj.visible = P.visible && P.opacity > .004;
    // a mesh outside its part's object (shared, or handed over by the config) shows while any of its parts does
    for (const E of meshList) if (E.outside) E.m.visible = E.owners.some(P => P.visible && P.opacity > .004);
    const poseH = hook('pose'); if (poseH) poseH(S, ctx);
    pivot.updateMatrixWorld(true);
    // section plane: through the cut point in model space, swept in from outside
    const k = S.cutT;
    if (CUT && k > 0) {
      modelPlane.normal.copy(cutNormal); modelPlane.constant = -cutNormal.dot(cutPoint) + cutFar * (1 - easeIO(k));
      clipPlane.copy(modelPlane).applyMatrix4(model.matrixWorld);
      capMesh.visible = true;
      clipPlane.coplanarPoint(capMesh.position);
      capMesh.quaternion.setFromUnitVectors(V.set(0, 0, 1), V2.copy(clipPlane.normal).negate());
    } else { clipPlane.normal.set(0, 0, -1); clipPlane.constant = 1e3; if (capMesh) capMesh.visible = false; }
    if (CUT) for (const E of meshList) {
      const s = E.m.userData.stencilMesh;
      if (s) s.visible = k > 0 && E.owners.some(P => P.ghost > .99);
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
    // product motion: the config's update(t, state) hook; true keeps the frames coming
    S.t += dt;
    const upd = hook('update');
    if (upd && S.phase !== 'closing' && upd(S.t, S, ctx, dt)) moving = true;
    // explode slider (smoothed), section sweep, ghosting
    const ke = damp(dt, 9);
    if (Math.abs(S.explodeGoal - S.explode) > 1e-4) { S.explode = lerp(S.explode, S.explodeGoal, ke); moving = true; } else S.explode = S.explodeGoal;
    const cutGoal = S.cutOn ? 1 : 0;
    if (S.cutT !== cutGoal) { S.cutT = reducedQ.matches ? cutGoal : clamp01(S.cutT + Math.sign(cutGoal - S.cutT) * dt * 1000 / CUT_MS); moving = true; }
    const kg = damp(dt, 8);
    for (const P of parts) {
      const g = !P.visible ? 0 : P.ghost;
      if (Math.abs(P.opacity - g) > .003) { P.opacity = lerp(P.opacity, g, kg); moving = true; } else P.opacity = g;
    }
    // a mesh shared by several parts follows the most opaque of them, so a picked part never fades with its neighbours
    for (const E of meshList) {
      let o = E.owners[0].opacity;
      for (let i = 1; i < E.owners.length; i++) if (E.owners[i].opacity > o) o = E.owners[i].opacity;
      const m = E.m, t = o < .999;
      if (m.material.transparent !== t) { m.material.transparent = t; m.material.depthWrite = !t; m.material.needsUpdate = true; }
      m.material.opacity = o;
    }
    if (!fly) {
      // view: damp toward the goal
      const kv = damp(dt, viewRate);
      if (Rg) {
        const off = Math.abs(R.x - Rg.x) + Math.abs(R.y - Rg.y) + Math.abs(R.w - Rg.w) + Math.abs(R.h - Rg.h);
        if (off > .5) { R = lerpRect(R, Rg, kv); moving = true; } else R = { ...Rg };
      }
      const prevD = cur.dist;
      if (cur.orbit.angleTo(goal.orbit) > 1e-4) { cur.orbit.slerp(goal.orbit, kv); moving = true; } else cur.orbit.copy(goal.orbit);
      if (Math.abs(cur.roll - goal.roll) > 1e-4) { cur.roll = lerp(cur.roll, goal.roll, kv); moving = true; } else cur.roll = goal.roll;
      pivot.quaternion.copy(cur.orbit).multiply(qBase).multiply(qRoll.setFromAxisAngle(Y, cur.roll));
      placeParts();
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
      // between the title and the sheet, or the part card when one is up (it sits on the sheet)
      const top = C.clearHead ? Math.max(74, headBottom() + 8) : 74, sheetTop = panel.getBoundingClientRect().top || H - 150;
      dialog.style.setProperty('--cx-sheet', Math.round(H - sheetTop) + 'px');
      const cardTop = card.hidden ? 0 : card.getBoundingClientRect().top;
      const bottom = cardTop > top + 160 ? cardTop : sheetTop;
      return { x: 0, y: top, w: W, h: Math.max(140, bottom - top - 8) };
    }
    const left = panel.getBoundingClientRect().left || W - 380;
    if (C.clearHead) {
      // below the title block, so the model never runs under the heading
      const top = Math.min(H * .4, headBottom() + 12);
      return { x: 0, y: top, w: Math.max(200, left - 12), h: H - top - 12 };
    }
    return { x: 0, y: 0, w: Math.max(200, left - 12), h: H };
  }
  function headBottom() { const b = head.getBoundingClientRect(); return b.height ? b.bottom : 0; }
  function resize() {
    if (!S.built) return;
    layoutBase();
    Rg = stageRect();
    if (S.phase !== 'closed') renderer.setSize(W, H, false);
    invalidate();
  }
  addEventListener('resize', () => { if (S.phase !== 'closed') resize(); }, { passive: true });

  // ---------------------------------------------------------------- the fly
  // A pose: where the model is (pivot quaternion and position), the camera (target,
  // distance, roll) and the frame R it is drawn in. Ground: the panel rect it covers.
  // A product can supply its own start poses (config.poses.tile(el, ctx), .hero(ctx), .stage(el, ctx));
  // the default is the home view fitted into the clicked element's media box.
  function homeQ() { return new THREE.Quaternion().copy(qBase).multiply(qRoll.setFromAxisAngle(Y, ROLL0)); }
  // the home view, at explode 0, fitted into a screen rect
  function fitPose(rect) {
    const q = homeQ();
    pivot.quaternion.copy(q); pivot.position.set(0, 0, 0); placeParts(); pivot.updateMatrixWorld(true);
    return { q, p: new THREE.Vector3(), target: homeCenter(new THREE.Vector3(), 0), dist: homeDist(0, rect), camRoll: 0, R: { ...rect } };
  }
  const rectOf = el => { const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; };
  const mediaOf = el => (el && (el.querySelector('[data-viewer-media], .tile__media, .stage__live') || el));
  function startPose(origin, el) {
    const P = C.poses || {};
    if (origin === 'hero') return P.hero ? P.hero(ctx) : null;
    if (!el) return null;
    const custom = el.matches('.stage__card') ? P.stage : P.tile;
    if (custom) return custom(el, ctx);
    const r = rectOf(mediaOf(el));
    return r.w > 4 && r.h > 4 ? () => fitPose(r) : null;
  }
  const resolve = p => (typeof p === 'function' ? p() : p);
  function homePose() {
    R = stageRect(); Rg = { ...R };
    goal.orbit.identity(); goal.roll = ROLL0; goal.zoom = 1; goal.pan.set(0, 0, 0); goal.focus = null;
    cur.orbit.identity(); cur.roll = ROLL0;
    const q = homeQ();
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
  // the clicked element's own fill and corner, so the ground starts as that element
  function inkFrom(el) {
    let e = el, cs = null;
    while (e && e !== document.body) {
      cs = getComputedStyle(e);
      if (cs.backgroundImage !== 'none' || (cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent')) break;
      e = e.parentElement; cs = null;
    }
    ink.style.background = cs ? (cs.backgroundImage !== 'none' ? `${cs.backgroundImage}, ${cs.backgroundColor}` : cs.backgroundColor) : '';
    return parseFloat(getComputedStyle(el).borderTopLeftRadius) || 28;
  }
  function stepFly(now) {
    const F = fly;
    if (!F.t0) F.t0 = now;
    const pin = window.__cxFlyU;                      // debug and capture: hold the fly at this progress
    const u = pin != null ? pin : F.dur ? clamp01((now - F.t0) / F.dur) : 1, e = easeIO(u);
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
  const pauseHosts = () => (hosts ? hosts().filter(Boolean) : []);
  async function open({ origin = 'tile', tile = null, focus = null } = {}) {
    if (S.phase !== 'closed') return;
    const t0 = performance.now(), still = reducedQ.matches;
    clearTimeout(warmTimer);
    S.phase = 'opening'; S.origin = origin; S.tileEl = tile; S.focusEl = focus;
    stats.cold = !S.built;
    S.opener = document.activeElement;
    // read where the model is drawn before anything moves, then freeze the hero and any case stage
    const tileR = origin === 'tile' && tile && !still ? tile.getBoundingClientRect() : null;
    const groundFrom = tileR ? { x: tileR.left, y: tileR.top, w: tileR.width, h: tileR.height } : null;
    const radius = tileR ? inkFrom(tile) : 28;
    let start = still ? null : startPose(origin, tileR ? tile : null);
    for (const host of pauseHosts()) host.pause();
    W = innerWidth; H = innerHeight;
    document.documentElement.classList.add('cx-lock');
    dialog.classList.remove('is-ui');
    dialog.showModal();
    dialog.focus({ preventScroll: true });
    canvas.style.opacity = '0';
    // the ground grows at once, on the same clock as the fly; the model joins when it is built
    const fade = origin === 'link' || still;
    const groundAt = (u, e) => {
      if (groundFrom) {
        const g = lerpRect(groundFrom, fullRect(), e);
        scissor = u < 1 ? g : null;
        setGround(u < 1 ? g : null, radius * (1 - e), 1 - easeIO(win(u, .3, .85)));   // starts as the element, turns to paper
      } else setGround(null, 0, 0, fade ? 1 : clamp01(u / .45));
      if (u > .62) dialog.classList.add('is-ui');
    };
    const dur = start ? OPEN_MS : still ? 0 : 360;
    groundAt(0, 0);
    let gRaf = 0;
    const gStep = now => { const u = window.__cxFlyU != null ? window.__cxFlyU : dur ? clamp01((now - t0) / dur) : 1; groundAt(u, easeIO(u)); gRaf = S.built ? 0 : requestAnimationFrame(gStep); };
    if (dur) gRaf = requestAnimationFrame(gStep);
    try { await build(); } catch (err) {
      cancelAnimationFrame(gRaf);
      S.phase = 'closed'; dialog.close(); document.documentElement.classList.remove('cx-lock');
      for (const host of pauseHosts()) host.resume();
      throw err;
    }
    cancelAnimationFrame(gRaf);
    renderer.setSize(W, H, false);
    resetState();
    start = resolve(start);
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
        // joined mid-way (or no fly): fade the model in
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
  }

  function resetState() {
    S.explode = S.explodeGoal = 0; explode.value = '0'; explodeOut.value = '0%';
    S.cutOn = false; S.cutT = 0; cutBtn.setAttribute('aria-pressed', 'false');
    for (const g of GROUPS) S.groups[g.key] = true;
    for (const c of chips) c.setAttribute('aria-pressed', 'true');
    viewRate = VIEW_RATE;
    for (const P of parts) { P.shown = P.data.shown !== false; P.visible = P.shown; P.ghost = 1; P.opacity = P.shown ? 1 : 0; P.li.hidden = !P.listed || !P.shown; }
    S.selected = null; hideCard(); setSheet(false);
    tourBtn.hidden = reducedQ.matches;
    S.t = 0;
    hook('reset') && hook('reset')(S, ctx);
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
    let target = null, groundTo = null, radius = 28;
    if (!reducedQ.matches) {
      if (origin === 'hero' && reel && C.poses && C.poses.hero) { reel.resume(); target = () => C.poses.hero(ctx); if (!target()) target = null; }
      else if (tile) {
        const r = tile.getBoundingClientRect();
        if (r.bottom > 40 && r.top < innerHeight - 40) { target = resolve(startPose('tile', tile)); groundTo = { x: r.left, y: r.top, w: r.width, h: r.height }; radius = inkFrom(tile); }
      }
    }
    // everything goes back to rest on the way
    S.explodeGoal = 0; S.cutOn = false; S.selected = null; goal.focus = null;
    for (const P of parts) P.ghost = 1;
    const from = { q: pivot.quaternion.clone(), p: pivot.position.clone(), target: cur.target.clone(), dist: cur.dist, camRoll: cur.camRoll, R: { ...R } };
    const ex0 = S.explode, cut0 = S.cutT, vis0 = parts.map(P => P.opacity);
    // parts a group chip hid come back on the way; parts the product hid (props) stay hidden
    const vis1 = parts.map(P => P.visible || (P.shown && P.group != null && S.groups[P.group] === false));
    await runFly({
      from: target ? from : null, to: target, dur: reducedQ.matches ? 0 : target ? CLOSE_MS : 280,
      step(u, e) {
        S.explode = ex0 * (1 - e); S.explodeGoal = S.explode; S.cutT = cut0 * (1 - e);
        parts.forEach((P, i) => { P.opacity = lerp(vis0[i], vis1[i] ? 1 : 0, e); P.visible = vis1[i]; });
        if (groundTo) {
          const g = lerpRect(fullRect(), groundTo, e);
          scissor = g;
          setGround(g, radius * e, easeIO(win(u, .15, .7)));
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
    document.documentElement.classList.remove('cx-lock', 'cx-from-hero', 'cx-covered');
    if (dialog.open) dialog.close();
    canvas.style.opacity = ''; setGround(null, 0, 0);
    for (const host of pauseHosts()) host.resume();
    // focus back to the element that opened it (or wherever it was)
    const back = S.origin === 'tile' && S.tileEl ? (S.focusEl || S.tileEl) : S.opener;
    const refocus = () => { if (back && back.focus && back.isConnected && document.activeElement !== back && S.phase === 'closed') back.focus({ preventScroll: true }); };
    refocus(); requestAnimationFrame(refocus);   // the closing dialog can take focus back for one frame
    // keep warm: drop the full-screen buffers now, everything else after WARM_MS
    if (renderer) renderer.setSize(1, 1, false);
    clearTimeout(warmTimer);
    warmTimer = setTimeout(dispose, WARM_MS);
    onClosed && onClosed();
  }
  function waitOpen() { return new Promise(res => { const t = () => (S.phase === 'opening' ? setTimeout(t, 50) : res()); t(); }); }
  // the browser closed the dialog by itself (a second Esc while closing, for example)
  dialog.addEventListener('close', () => { if (S.phase !== 'closed') finish(); });
  // one Esc press can reach us as keydown and as the dialog's cancel: handle it once
  let escKey = false;
  dialog.addEventListener('cancel', e => { e.preventDefault(); if (!escKey) esc(); });
  function esc() {
    if (S.tour) { endTour(true); return; }
    if (S.selected != null) { deselect(); return; }
    onRequestClose ? onRequestClose() : close();
  }
  closeBtn.addEventListener('click', () => (onRequestClose ? onRequestClose() : close()));
  // keep page scrolling (and Lenis, which listens on window) out of the viewer
  for (const ev of ['wheel', 'keydown', 'pointerdown', 'touchstart']) dialog.addEventListener(ev, e => {
    if (ev === 'keydown' && e.key === 'Escape') { e.preventDefault(); escKey = true; setTimeout(() => { escKey = false; }); esc(); }
    if (ev === 'keydown' && e.key === 'Tab') trapTab(e);
    e.stopPropagation();
  }, { passive: ev !== 'keydown' });

  // focus trap: Tab cycles through the dialog's own controls and never reaches the browser bar
  function trapTab(e) {
    const els = [...dialog.querySelectorAll('button, input, select, [tabindex="0"]')].filter(el => !el.disabled && el.tabIndex >= 0 && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
    if (!els.length) return;
    const i = els.indexOf(document.activeElement), last = els.length - 1;
    if (e.shiftKey ? i <= 0 : i === last || i < 0) { e.preventDefault(); els[e.shiftKey ? last : 0].focus(); }
  }

  // ---------------------------------------------------------------- selection and card
  function partFacingRoll(P) {
    const x = P.center.x, z = P.center.z;
    if (Math.hypot(x, z) < .006) return goal.roll;
    // camera direction in the model's pre-roll frame, angle about its Y axis
    qTmp.copy(goal.orbit).multiply(qBase).invert();
    V.set(0, 0, 1).applyQuaternion(qTmp);
    const a = Math.atan2(V.x, V.z), b = Math.atan2(x, z);
    let r = a - b;
    while (r - goal.roll > Math.PI) r -= 2 * Math.PI;
    while (r - goal.roll < -Math.PI) r += 2 * Math.PI;
    return r;
  }
  function select(pid, { fromList = false, quiet = false } = {}) {
    const P = byId.get(pid);
    if (!P) return;
    if (!P.visible && P.group != null) { S.groups[P.group] = true; syncGroups(); }
    S.selected = pid;
    for (const Q of parts) Q.ghost = Q === P ? 1 : (Q.exterior ? C.ghost.exterior : C.ghost.interior);
    goal.focus = pid; goal.zoom = 1; goal.pan.set(0, 0, 0);
    if (C.faceParts !== false) goal.roll = partFacingRoll(P);
    for (const Q of parts) { Q.btn.setAttribute('aria-current', String(Q === P)); Q.tag.classList.toggle('is-on', Q === P); }
    if (!quiet) showCard(P, fromList);
    live.textContent = `${P.label} in focus.`;
    invalidate();
  }
  function deselect() {
    if (S.selected == null) return;
    S.selected = null; goal.focus = null; goal.zoom = 1; goal.pan.set(0, 0, 0);
    for (const Q of parts) { Q.ghost = 1; Q.btn.setAttribute('aria-current', 'false'); Q.tag.classList.remove('is-on'); }
    hideCard();
    live.textContent = T.whole;
    invalidate();
  }
  function showCard(P, focusIt) {
    const c = P.card || {};
    cardLabel.textContent = c.label != null ? c.label : P.kind ? `${pad(P.n)} / ${P.kind}` : pad(P.n);
    cardTitle.textContent = c.title || P.label; cardLede.textContent = c.lede || ''; cardDesc.textContent = c.desc || '';
    cardLede.hidden = !c.lede; cardDesc.hidden = !c.desc;
    const rows = (c.rows || []).filter(r => r && r[1]);
    cardDl.replaceChildren(...rows.map(([dt, dd]) => h('div', {}, h('dt', { text: dt }), h('dd', { text: dd }))));
    cardDl.hidden = !rows.length;
    card.hidden = false; hint.hidden = true;
    card.scrollTop = 0;
    if (mobile()) { setSheet(false); relayout(); }
    if (focusIt) cardTitle.focus({ preventScroll: true });
  }
  function hideCard() { const was = !card.hidden; card.hidden = true; hint.hidden = false; if (was && mobile()) relayout(); }
  // phones: the frame shrinks above the card, after it has laid out
  const relayout = () => { if (S.built && S.phase !== 'closed') requestAnimationFrame(resize); };
  cardX.addEventListener('click', () => { const P = byId.get(S.selected); deselect(); if (P && P.btn && !mobile()) P.btn.focus({ preventScroll: true }); });

  // ---------------------------------------------------------------- controls
  explode.addEventListener('input', () => { endTour(true); S.explodeGoal = +explode.value / 100; explodeOut.value = explode.value + '%'; invalidate(); });
  function setCut(on) {
    if (!CUT) return;
    if (on && !S.cutOn) {
      // the half facing the camera comes away: plane normal, in model space, points away from the camera
      model.updateWorldMatrix(true, false);
      qTmp.setFromRotationMatrix(model.matrixWorld).invert();
      cutNormal.set(0, 0, -1).applyQuaternion(qTmp);
      if (CUT.keepAxis !== false) cutNormal.y = 0;     // the plane holds the model's +Y axis
      if (cutNormal.lengthSq() < 1e-4) cutNormal.set(0, 0, -1);
      cutNormal.normalize();
    }
    S.cutOn = on; cutBtn.setAttribute('aria-pressed', String(on));
    invalidate();
  }
  cutBtn.addEventListener('click', () => { endTour(true); setCut(!S.cutOn); });
  labelsBtn.addEventListener('click', () => { S.labels = !S.labels; labelsBtn.setAttribute('aria-pressed', String(S.labels)); invalidate(); });
  tourBtn.addEventListener('click', () => startTour());
  resetBtn.addEventListener('click', () => {
    endTour(true); deselect();
    goal.orbit.identity(); goal.roll = ROLL0; goal.zoom = 1; goal.pan.set(0, 0, 0); viewRate = VIEW_RATE;
    S.explodeGoal = 0; explode.value = '0'; explodeOut.value = '0%'; setCut(false);
    hook('reset') && hook('reset')(S, ctx);
    invalidate();
  });
  function syncGroups() {
    for (const c of chips) c.setAttribute('aria-pressed', String(S.groups[c.dataset.group]));
    for (const P of parts) { P.visible = P.shown && (P.group == null || S.groups[P.group] !== false); P.li.hidden = !P.visible || !P.listed; }
    invalidate();
  }
  // a product shows or hides one of its parts (a prop, an option): it fades like a group toggle
  function setShown(pid, on) { const P = byId.get(pid); if (!P) return; P.shown = !!on; if (!on && S.selected === pid) deselect(); syncGroups(); }
  // set the explode amount from a product's own code: the slider follows, nothing else reacts (no tour end, no input event)
  function setExplodeQuiet(v, { instant = false } = {}) {
    const k = clamp01(+v || 0);
    S.explodeGoal = k; if (instant || reducedQ.matches) S.explode = k;
    explode.value = String(Math.round(k * 100)); explodeOut.value = explode.value + '%';
    invalidate();
  }
  // view goals for a product's own motion: yaw and pitch (rad, from home, the drag's axes), roll about +Y,
  // zoom (1 = fit), pan (world metres), focus (a part id or null), rate (how fast it eases, 1/s; default 7)
  function setView(o = {}) {
    if (o.orbit) goal.orbit.copy(o.orbit);
    else if (o.yaw != null || o.pitch != null) {
      goal.orbit.setFromAxisAngle(Y, o.yaw || 0).premultiply(qTmp.setFromAxisAngle(V.set(1, 0, 0), o.pitch || 0));
    }
    if (o.roll != null) goal.roll = o.roll;
    if (o.zoom != null) goal.zoom = Math.max(.12, Math.min(2.6, o.zoom));
    if (o.pan) goal.pan.copy(toV3(o.pan));
    if (o.focus !== undefined) goal.focus = o.focus != null && byId.has(o.focus) ? o.focus : null;
    if (o.rate != null) viewRate = o.rate;
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
    // phones: the open sheet and the part card share the space above it, so the card steps aside
    if (mobile() && S.selected != null && !S.tour) card.hidden = open;
    S.sheetOpen = open; panel.classList.toggle('is-open', open);
    grab.setAttribute('aria-expanded', String(open)); grab.textContent = open ? T.fewer : T.more;
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
    viewRate = VIEW_RATE;
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
  canvas.addEventListener('wheel', e => { e.preventDefault(); if (S.phase !== 'open') return; endTour(true); viewRate = VIEW_RATE; zoomBy(Math.exp(e.deltaY * .0012)); invalidate(); }, { passive: false });
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
      const own = hit.object.userData.viewerOwners;
      const P = own && own.length > 1 ? (own.find(Q => Q.id === S.selected) || own.find(Q => Q.visible) || own[0]) : hit.object.userData.part;
      if (!P) continue;
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
      let ok = show && P.visible && P.listed && P.meshes.length > 0 && P.data.tag !== false && (only == null || P.id === only);
      if (ok) {
        tagWorld(P, V).project(camera);
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
  function startTour() {
    if (S.phase !== 'open' || reducedQ.matches || !TOUR.length) return;
    deselect();
    goal.orbit.identity(); goal.zoom = 1; goal.pan.set(0, 0, 0);
    S.explodeGoal = 0; explode.value = '0'; explodeOut.value = '0%';
    S.tour = { i: -1 };
    tourBox.hidden = false; hint.hidden = true;
    nextStop();
  }
  function nextStop() {
    const Tr = S.tour;
    if (!Tr) return;
    Tr.i++;
    if (Tr.i >= TOUR.length) { endTour(false); return; }
    const P = byId.get(TOUR[Tr.i]);
    if (!P) { nextStop(); return; }
    select(P.id, { quiet: true });
    tourStep.textContent = `${pad(Tr.i + 1)} / ${pad(TOUR.length)}`;
    tourName.textContent = P.label; tourLine.textContent = (P.card && P.card.lede) || '';
    tourTimer = setTimeout(nextStop, TOUR_MS);
    hook('tourStop') && hook('tourStop')(Tr.i, P.id, ctx);
    dialog.dispatchEvent(new CustomEvent('viewer:tourstop', { detail: { i: Tr.i, id: P.id } }));
  }
  // skipped (any input) or finished: back to the whole model, free orbit
  function endTour(byUser) {
    if (!S.tour) return;
    clearTimeout(tourTimer);
    S.tour = null; tourBox.hidden = true; hint.hidden = !card.hidden;
    deselect();
    goal.roll = ROLL0;
    live.textContent = byUser ? 'Tour skipped.' : 'Tour finished.';
    hook('tourEnd') && hook('tourEnd')(byUser, ctx);
    dialog.dispatchEvent(new CustomEvent('viewer:tourend', { detail: { byUser } }));
    invalidate();
  }
  tourSkip.addEventListener('click', () => endTour(true));

  // ---------------------------------------------------------------- API
  return {
    slug: C.slug, open, close, warm, dialog,
    get isOpen() { return S.phase !== 'closed'; }, get phase() { return S.phase; }, get busy() { return raf !== 0 || !!fly; },
    stats, state: S, dispose,
    get view() { return { cur: { ...cur, target: cur.target.toArray(), orbit: cur.orbit.toArray() }, goal: { ...goal, pan: goal.pan.toArray(), orbit: goal.orbit.toArray() }, R, W, H, home: S.built ? homeDist(S.explode) : 0 }; },
    get parts() { return parts.map(P => ({ id: P.id, n: P.n, label: P.label, group: P.group, visible: P.visible, center: P.center.toArray().map(v => +v.toFixed(3)), size: P.box.getSize(new THREE.Vector3()).toArray().map(v => +v.toFixed(3)), meshes: P.meshes.length })); },
    select: pid => select(pid), deselect, setCut, startTour: () => startTour(), endTour: () => endTour(true), setView, setShown, ctx,
    setExplode(v) { explode.value = String(Math.round(v * 100)); explode.dispatchEvent(new Event('input')); },
    screenOf(pid) { const P = byId.get(pid); if (!P || !camera) return null; setPose(); partWorldCenter(P, V).project(camera); return { x: (V.x + 1) / 2 * W, y: (1 - V.y) / 2 * H }; },
    info() { return renderer ? { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, programs: renderer.info.programs.length, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures } : null; },
  };
}
