// Rudder pedals on the viewer shell (next/js/viewer/viewer.js). Config API: docs/recipes/viewer.md.
//
// The model is the showreel's own, unchanged: createModel() from showreel/rudder-pedals.js builds the
// CAD assembly (next/assets/3d/rudder-pedals.*) plus the parts the STEP does not carry (springs,
// anchor screws, disc magnets, Hall sensors including the center rudder sensor, wiring, the ESP
// controller board), and solves the linkage from the CAD joints. Controls, toggles, explode and the
// 28 numbered parts follow next/lab/rudder-pedals-review.html, the page the owner approved the model
// on: Rudder, Left toe and Right toe sliders and Play motion (actionPose, the hero's pedal beat);
// eight part groups; Explode is the showreel's staggered build order (setProgress), and the springs
// and wires come off while the view is exploded.
//
// The shell moves and ghosts one object per part; here a part is a label of the review page, and
// several labels can share a mesh (the four springs are one tube mesh, the board and its
// connectors one mesh, the sensor lever and its magnet holder one CAD part). So each part hands the
// shell a stand-in object, the meshes it owns, and a box; the pose hook drives the mechanism from
// the shell state and moves each part's anchor and box with it every frame. A mesh shared by several
// parts is owned by the first; the update hook gives that owner the highest ghost of the parts that
// share it, so a picked part never fades out with its neighbours.
//
// Card text: the review page's approved part notes and the case page (content/projects/
// rudder-pedals.json); no other facts. The controller is an ESP board (owner), not the Pro Micro
// the case page still names.
import { createStudioEnvironment } from '../../showreel/engine.js';

let modP = null;
// the showreel module (it fetches the CAD model when it is imported); shared with the hero and the case stage
export function prefetch() {
  if (!modP) { modP = import('../../showreel/rudder-pedals.js'); modP.catch(() => { modP = null; }); }
  return modP;
}

// ---------------------------------------------------------------- words
const SENSE = 'Each axis uses an A1301 Hall effect sensor reading a magnet on the moving part. No contact, nothing to wear.';   // case page, Sensing
const USB = 'The ESP controller board shows up as a standard USB gamepad. No driver needed.';                                   // case page, Firmware (owner: ESP board)
const SWING = 'Full rudder swings each lever about 11 degrees.';                                                                // review page
const TOE = 'A full toe brake tips it back 16 degrees.';                                                                        // review page
const POCKET = 'The round pockets measure 10.2 mm across and 2.8 mm deep.';                                                      // review page
const sentence = s => (s ? s[0].toUpperCase() + s.slice(1) + (/[.)]$/.test(s) ? '' : '.') : '');

// Part groups (the review page's Show chips). Parts without a group always show.
const GROUPS = [
  { key: 'springs', label: 'Springs' },
  { key: 'sensors', label: 'Sensors and magnets' },
  { key: 'wiring', label: 'Wiring' },
  { key: 'board', label: 'Board' },
  { key: 'screws', label: 'Anchor screws' },
  { key: 'walls', label: 'Side walls' },
  { key: 'levers', label: 'Lever arms' },
  { key: 'pedals', label: 'Pedals' },
];
const KIND = { springs: 'Springs', sensors: 'Sensing', magnets: 'Sensing', wiring: 'Wiring', board: 'Board', screws: 'Anchor screws', walls: 'Side walls', levers: 'Lever arms', pedals: 'Pedals', frame: 'Frame', linkage: 'Linkage' };

// The STEP parts, as the review page labels them: [id, name, part, STEP point (mm), note, group, kind]
const CAD = [
  ['lever-l', 'Left lever arm', 'leverL', [600, 248, 1344.5], 'swings on its top pivot bolt', 'levers'],
  ['lever-r', 'Right lever arm', 'leverR', [600, 238, 1184.5], 'swings on its top pivot bolt', 'levers'],
  ['pedal-l', 'Left pedal', 'pedalL', [612, 186, 1400], 'tips back on its hinge bolt (toe brake)', 'pedals'],
  ['pedal-r', 'Right pedal', 'pedalR', [618, 182, 1130], 'tips back on its hinge bolt (toe brake)', 'pedals'],
  ['wall-l', 'Left side wall', 'wallL', [678.1, 40, 1309], 'nine adjustment holes, four slots, two support slits', 'walls'],
  ['wall-r', 'Right side wall', 'wallR', [678.1, 40, 1219], '', 'walls'],
  ['core', 'Middle supports', 'core', [672.2, 150, 1264.5], 'front and back plates', 'frame'],
  ['rocker', 'Sensor lever', 'rocker', [543.1, 103.2, 1300], 'rocks on the center bolt', 'frame', 'linkage'],
  ['holder', 'Center magnet holder', 'rocker', [594, 99.4, 1265.8], 'holds the two center magnets under its flaps', 'frame', 'linkage'],
  ['rod-l', 'Left link rod', 'rodL', [544, 176, 1334.3], '', 'frame', 'linkage'],
  ['rod-r', 'Right link rod', 'rodR', [544, 165, 1194.8], '', 'frame', 'linkage'],
];
// the added parts: the model's own labels (showreel/rudder-pedals.js createDetails), by name
const ADDED = {
  'Centering spring (right)': 'spring-center-r', 'Centering spring (left)': 'spring-center-l',
  'Brake spring (right)': 'spring-brake-r', 'Brake spring (left)': 'spring-brake-l',
  'Disc magnet (right pedal)': 'magnet-r', 'Disc magnet (left pedal)': 'magnet-l',
  'Hall sensor (right lever)': 'hall-r', 'Hall sensor (left lever)': 'hall-l',
  'Center magnets': 'magnets-center', 'Center Hall sensor': 'hall-center',
  'Left sensor wires': 'wires-l', 'Right sensor wires': 'wires-r', 'Center sensor wires': 'wires-center',
  'ESP controller board': 'board', 'Sensor connectors': 'connectors',
  'Anchor screw (right)': 'screw-r', 'Anchor screw (left)': 'screw-l',
};
// the mesh each added part owns (detail mesh names in the model)
const MESH = {
  'spring-center-r': 'springs', 'magnet-r': 'magnetR', 'magnet-l': 'magnetL', 'hall-r': 'sensorR', 'hall-l': 'sensorL',
  'magnets-center': 'centerMagnet', 'hall-center': 'sensorCenter', 'wires-l': 'wires', board: ['boardBody', 'boardTop'],
  'screw-r': 'anchorScrewR', 'screw-l': 'anchorScrewL',
};
// a second sentence for some cards (case page and review page, see above)
const DESC = {
  'magnet-r': `${POCKET} ${SENSE}`, 'magnet-l': `${POCKET} ${SENSE}`, 'magnets-center': SENSE,
  'hall-r': SENSE, 'hall-l': SENSE, 'hall-center': SENSE,
  board: USB, 'lever-l': SWING, 'lever-r': SWING, 'pedal-l': TOE, 'pedal-r': TOE,
};
const ORDERS = { springs: 1, sensors: 2, magnets: 2, wiring: 3, board: 4, screws: 5 };
const EXTERIOR = new Set(['walls', 'levers', 'pedals']);

// ---------------------------------------------------------------- motion controls
const PLAY_GAP = .6;                                   // rest between two plays of the beat (review page)
const fmtRudder = v => (Math.abs(v) < .005 ? '0' : `${v < 0 ? 'L' : 'R'} ${Math.round(Math.abs(v) * 100)}%`);
const fmtToe = v => `${Math.round(v * 100)}%`;

// one studio environment per renderer (the same one the hero and the case stages give the model)
const envs = new WeakMap();

// the motion state and its controls: one rudder pedals viewer per page
const M = { drive: 0, toeL: 0, toeR: 0, playing: false, playT: 0 };
const C = {};
let play = () => {}, quiet = false;
function show() {
  if (!C.rudder) return;
  C.rudder.value = M.drive; C.rudderOut.value = fmtRudder(M.drive);
  C.toeL.value = M.toeL; C.toeLOut.value = fmtToe(M.toeL);
  C.toeR.value = M.toeR; C.toeROut.value = fmtToe(M.toeR);
  C.play.setAttribute('aria-pressed', String(M.playing)); C.play.textContent = M.playing ? 'Pause' : 'Play motion';
}
function stopPlay() { if (!M.playing) return; M.playing = false; show(); }

export default {
  slug: 'rudder-pedals',
  name: 'Rudder pedals, the CAD assembly with the added springs, sensors, wiring and board',
  title: 'Rudder pedals',
  eyebrow: 'Interactive / The pedal assembly',
  ghostWord: 'PEDALS',
  text: { whole: 'Whole assembly.' },
  fov: 26,                                             // the review page's lens
  base: () => [Math.PI / 2 - 1.12, -.62, 0],           // the review page's home view (theta .62, phi 1.12)
  uniqueMaterials: false,                              // every mesh gets its own material in build()
  ghost: { exterior: .07, interior: .16 },
  cut: false,
  groups: GROUPS,
  tour: { stops: ['hall-l', 'magnet-l', 'hall-center', 'board', 'spring-center-l'], ms: 3300 },
  prefetch,

  // product controls: Play motion and Center, then the three sliders (on phones, in the expanded sheet)
  controls(ctx) {
    const h = (tag, attrs = {}, ...kids) => { const el = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'class') el.className = v; else if (k === 'text') el.textContent = v; else el.setAttribute(k, v); } el.append(...kids); return el; };
    const row = (key, text, min) => {
      const id = `cx-rudder-pedals-${key}`;
      const input = h('input', { type: 'range', id, min: String(min), max: '1', step: '0.01', value: '0' });
      const out = h('output', { for: id, text: key === 'rudder' ? '0' : '0%' });
      input.addEventListener('input', () => { stopPlay(); M[key === 'rudder' ? 'drive' : key] = +input.value; show(); ctx.invalidate(); });
      C[key] = input; C[key + 'Out'] = out;
      return h('div', { class: 'cx__row' }, h('label', { for: id, text }), input, out);
    };
    C.play = h('button', { class: 'cx__btn', type: 'button', 'aria-pressed': 'false', text: 'Play motion' });
    C.play.addEventListener('click', () => play());
    const center = h('button', { class: 'cx__btn', type: 'button', text: 'Center' });
    center.addEventListener('click', () => { stopPlay(); M.drive = M.toeL = M.toeR = 0; show(); ctx.invalidate(); });
    return [
      h('h3', { class: 'label', text: 'Motion' }),
      h('div', { class: 'cx__btns' }, C.play, center),
      h('div', { class: 'cx__more cx__motion' }, row('rudder', 'Rudder', -1), row('toeL', 'Left toe', 0), row('toeR', 'Right toe', 0)),
    ];
  },

  async build(ctx) {
    const { THREE } = ctx;
    const mod = await prefetch();
    const model = mod.createModel({ THREE });
    const D = model.details, root = model.group, Pm = model.parts;
    // own material per mesh, so each part ghosts alone
    root.traverse(o => { if (o.isMesh) o.material = o.material.clone(); });

    // ---- the studio environment (engine.adopt on the review page): made with the shell's renderer the
    // first time a material compiles (the shell compiles every variant before the first frame)
    const mats = [];
    root.traverse(o => { if (o.isMesh && o.material.isMeshStandardMaterial) mats.push(o.material); });
    let renderer = null, envDone = false;
    const applyEnv = () => {
      if (envDone || !renderer) return;
      envDone = true;
      let env = envs.get(renderer);
      if (!env) { env = createStudioEnvironment(renderer); envs.set(renderer, env); }
      for (const m of mats) if (!m.envMap) { m.envMap = env; m.envMapIntensity *= .55; m.needsUpdate = true; }
      if (probe.parent) probe.removeFromParent();
    };
    const probe = new THREE.Mesh(new THREE.PlaneGeometry(1e-4, 1e-4), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
    probe.material.onBeforeCompile = (p, r) => { if (!renderer) { renderer = r; queueMicrotask(applyEnv); } };
    probe.frustumCulled = false; probe.raycast = () => {};
    ctx.scene.add(probe);
    const sceneHook = ctx.scene.onBeforeRender;
    ctx.scene.onBeforeRender = function (r, ...rest) { if (!renderer) renderer = r; applyEnv(); return sceneHook.call(this, r, ...rest); };

    // ---- labels: the added parts first (springs, sensors and magnets, wiring, board, screws), then the STEP parts
    const pedalOf = S => Pm['lever' + S].getObjectByName('pedal' + S);
    const objOf = part => (part.startsWith('pedal') ? pedalOf(part.slice(5)) : Pm[part]);
    const labels = [
      ...D.labels.map(L => ({ L, id: ADDED[L.name], name: L.name, note: L.note, group: L.group === 'magnets' ? 'sensors' : L.group, kind: KIND[L.group], order: ORDERS[L.group] || 9, added: 1 })),
      ...CAD.map(([id, name, part, cad, note, group, kind]) => {
        const obj = objOf(part);
        return { L: { obj, at: model.localOf(obj, cad) }, id, name, note, group, kind: KIND[kind || group], order: 9, added: 0, part };
      }),
    ].sort((a, b) => (b.added - a.added) || (a.order - b.order));

    // ---- which meshes each part owns
    const byName = new Map();
    root.traverse(o => { if (o.isMesh && o.name) (byName.get(o.name) || byName.set(o.name, []).get(o.name)).push(o); });
    const own = (o, test) => o.children.filter(c => c.isMesh && !c.userData.detail && (!test || test(c)));
    const shared = new Map();   // primary part id -> ids of the parts that show the same meshes
    const share = (primary, ...ids) => shared.set(primary, ids);
    share('spring-center-r', 'spring-center-l', 'spring-brake-r', 'spring-brake-l');
    share('wires-l', 'wires-r', 'wires-center');
    share('board', 'connectors');
    share('rocker', 'holder');
    const meshesOf = R => {
      if (R.part) return R.id === 'holder' ? [] : own(objOf(R.part));
      const k = MESH[R.id];
      return k ? [].concat(k).flatMap(n => byName.get(n) || []) : [];
    };

    // ---- boxes (model space) at rest; each moves with the CAD part that carries it
    root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), M4 = new THREE.Matrix4(), B = new THREE.Box3(), V = new THREE.Vector3();
    const topOf = o => { while (o && o.parent !== root) o = o.parent; return o; };
    const anchor = (R, out) => {
      const L = R.L;
      if (L.spring || L.wire) return D.labelPoint(L, out);
      return out.copy(L.at).applyMatrix4(L.obj.matrixWorld).applyMatrix4(inv);
    };
    const proxyMat = new THREE.MeshBasicMaterial();
    const noRay = () => {};
    const parts = labels.map(R => {
      const meshes = meshesOf(R);
      const box = new THREE.Box3();
      const dynamic = !!(R.L.spring || R.L.wire);
      if (!dynamic && meshes.length && R.id !== 'connectors') for (const m of meshes) { m.geometry.computeBoundingBox(); box.union(B.copy(m.geometry.boundingBox).applyMatrix4(M4.copy(inv).multiply(m.matrixWorld))); }
      if (box.isEmpty()) box.setFromCenterAndSize(anchor(R, V), V.clone().setScalar(.016));
      R.rest = box.clone(); R.box = box;
      R.carrier = R.L.obj ? topOf(R.L.obj) : null;
      R.carrier0 = R.carrier ? R.carrier.position.clone() : null;
      R.real = meshes;
      R.secondary = !meshes.length || [...shared.values()].some(ids => ids.includes(R.id));
      // the shell ghosts and picks through P.meshes: the primary hands it the real meshes, the others a stand-in
      const stand = new THREE.Mesh(undefined, proxyMat.clone()); stand.raycast = noRay;
      R.shellMeshes = R.secondary ? [stand] : meshes;
      return {
        id: R.id, label: R.name, kind: R.kind, group: R.group, exterior: EXTERIOR.has(R.group),
        obj: new THREE.Object3D(), meshes: R.shellMeshes, box,
        card: { title: R.name, lede: sentence(R.note), desc: DESC[R.id] || '' },
      };
    });
    const rows = new Map(labels.map(R => [R.id, R]));
    // every mesh of the model belongs to a part (bolts and nuts go with their CAD part)
    const owned = new Set(labels.flatMap(R => R.real));
    root.traverse(o => { if (o.isMesh && !owned.has(o)) console.warn('[viewer] rudder-pedals: mesh without a part', o.name); });

    // ---- the mechanism
    const explodeInput = () => { const d = document.querySelector('dialog[data-viewer-slug="rudder-pedals"]'); return d && d.querySelector('input[id$="-explode"]'); };
    play = () => {
      if (M.playing) { stopPlay(); return; }
      M.playing = true; M.playT = 0;
      const ex = explodeInput();   // the review page: Play assembles the view first
      if (ex && ex.value !== '0') { quiet = true; ex.value = '0'; ex.dispatchEvent(new Event('input')); quiet = false; }
      show(); ctx.invalidate();
    };

    const hooks = {
      model: root, parts,
      dispose() { model.dispose(); if (probe.parent) probe.removeFromParent(); probe.geometry.dispose(); probe.material.dispose(); },
      ready() {
        // moving the explode slider stops the motion (review page)
        const ex = explodeInput();
        if (ex && !ex.dataset.pedals) { ex.dataset.pedals = '1'; ex.addEventListener('input', () => { if (!quiet) stopPlay(); }); }
      },
      reset() { M.playing = false; M.drive = M.toeL = M.toeR = 0; show(); },
      // runs first in every frame: play the beat; a shared mesh follows the most opaque part that shows it
      update(t, S, c, dt) {
        for (const [primary, ids] of shared) {
          const P = c.part(primary);
          if (!P) continue;
          let g = S.selected == null ? 1 : 0;
          for (const id of [primary, ...ids]) { const Q = c.part(id); if (Q && Q.ghost > g) g = Q.ghost; }
          P.ghost = g;
        }
        if (!M.playing) return false;
        M.playT += dt;
        const u = (M.playT + .4) % (mod.ACTION_SECONDS + PLAY_GAP);
        const p = mod.actionPose(Math.min(u, mod.ACTION_SECONDS));
        M.drive = p.drive; M.toeL = p.toeL; M.toeR = p.toeR;
        show();
        return true;
      },
      // every draw: pose the mechanism from the shell state, then move each part's anchor, box and meshes
      pose(S, c) {
        model.setProgress(1 - S.explode);
        model.setDrive(M.drive); model.setToe(M.toeL, M.toeR);
        const g = S.explode < .002 ? 1 : 0;                  // springs and wires come off while exploded (review page)
        model.setGrow(g, g);
        model.refresh();
        root.updateMatrixWorld(true);
        inv.copy(root.matrixWorld).invert();
        for (const P of c.parts) {
          const R = rows.get(P.id);
          anchor(R, P.center);
          if (R.L.spring || R.L.wire) P.box.setFromCenterAndSize(P.center, V.setScalar(.02));
          else if (R.carrier) P.box.copy(R.rest).translate(V.copy(R.carrier.position).sub(R.carrier0));
          if (!R.secondary) {
            const on = P.visible && P.opacity > .004;
            for (const m of R.real) m.visible = on;
          }
        }
      },
    };
    return hooks;
  },
};
