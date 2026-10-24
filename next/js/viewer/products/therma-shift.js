// Therma-Shift on the viewer shell (next/js/viewer/viewer.js). Config API: docs/recipes/viewer.md.
//
// The coaster is the showreel's own: coaster.js builds it from next/assets/3d/therma-shift.* (the CAD, turned
// so the USB-C port faces +Z, the plate top centre at the origin, the button the STEP lacks), with the same
// materials, the plate glow (setPlateTemperature: orange hot, blue cold, a halo on the lid ring and a pool on
// the ground) and the baked contact shadow. The mug and the silver can are props.js, the USB-C cable cable.js:
// all three exactly as the hero and the case stage show them. Metal needs the studio environment the
// showreel gives its guests (engine.js createStudioEnvironment through adopt()); the shell has no renderer
// before the first open, so studioEnv() below paints the same environment on the CPU (same sphere, same three
// panels, linear light) and three.js prefilters it on first use.
//
// Explode follows the real stack axis (+Y): the lid ring and its screws lift off, then the aluminum top plate,
// the thermoelectric module and the finned heatsink climb in that order; the blower stays, the electronics
// and the case drop away below. The section cut is a vertical plane through the stack axis.
// Product controls: Heat / Cool / Off drives the plate glow, a mug or the can on the plate, the cable in or out.
// The mug and the can are parts (so the frame fits them) with no number and no list row; they show only while
// picked in "On the plate".
//
// Card text: the case page's own words (content/projects/therma-shift.json), no new facts.
const ASSET = new URL('../../showreel/', import.meta.url).href;
let modsP = null;
// the code and the CAD data (coaster.js fetches its model as it loads); safe to call many times
function prefetch() {
  if (!modsP) {
    modsP = Promise.all([import(ASSET + 'coaster.js'), import(ASSET + 'props.js'), import(ASSET + 'cable.js')]);
    modsP.catch(() => { modsP = null; });
  }
  return modsP;
}

// Explode at 100 % (metres along +Y, coaster space). Assembled the stack runs, top down: lid ring and screws
// (y -0.7 .. 3.3 mm), top plate (0 .. -1.5), module (-1.5 .. -5.1), heatsink (-5.1 .. -17), blower (-17 .. -27)
// with the electronics around it, all in the case (-1.5 .. -29).
const STACK = { screws: .086, lid: .066, topPlate: .048, peltier: .032, heatsink: .016, blower: 0, board: -.026, shell: -.054 };
const GROUPS = [
  { key: 'case', label: 'Case' },
  { key: 'stack', label: 'Thermal stack' },
  { key: 'air', label: 'Airflow' },
  { key: 'board', label: 'Electronics' },
];
// Plate temperature per mode (degrees C, coaster.js setPlateTemperature): the case stage's warm and cool holds
const TEMP = { heat: 55, cool: 11, off: 22 };
const AIR = 'Air enters all bottom grille slots, passes through the heatsink fins, descends into the blower and exits the oval side vent.';
// [id, label, kind, group, exterior, anchor (m, from the part's box centre), card]
const PARTS = [
  ['lid', 'Lid ring', 'Case', 'case', true, [-.041, .002, .041], { lede: 'No proprietary cup, ever' }],
  ['topPlate', 'Aluminum top plate', 'Thermal stack', 'stack', true, [.016, 0, -.012], {
    lede: 'An NTC thermistor at the plate closes the loop, targeting about 2 degrees F around setpoint.',
    desc: 'Universal: any mug, glass or can, the device adapts to the drinkware',
  }],
  ['peltier', 'Thermoelectric module', 'Thermal stack', 'stack', false, [-.012, 0, .012], {
    lede: 'A thermoelectric module heats or cools depending on current direction.',
    desc: 'Dual mode verified: the same stack heats and cools by polarity',
    rows: [['Module', 'TEC1-12703'], ['Bench test', '10.7 to 12 degrees C cold face at 12 V, steady state']],
  }],
  ['heatsink', 'Finned heatsink', 'Thermal stack', 'stack', false, [.018, 0, .018], {
    lede: 'The TEC1-12703 sits between an aluminum top plate and a finned heatsink with a blower.',
    desc: AIR,
  }],
  ['blower', 'Blower', 'Airflow', 'air', false, [-.018, 0, .018], {
    lede: 'Heating and cooling use the same flow direction.',
    desc: AIR,
  }],
  ['board', 'Electronics', 'Electronics', 'board', false, [.02, 0, -.02], {
    lede: 'Powered over USB-C Power Delivery, within a desk power budget',
    desc: 'Separate firmware cutoffs watch for thermal runaway independently of the control loop and shut the device down on a fault.',
    rows: [['Status', 'Thermal stack validated, electronics in progress']],
  }],
  ['shell', 'Case', 'Case', 'case', true, [0, 0, .044], {
    lede: 'Low profile and quiet enough for an office desk',
    desc: 'The coaster has to run unattended on a desk.',
  }],
  ['screws', 'Screws', 'Case', 'case', true, null, {}],
];
const PROP_CARD = { lede: 'Universal: any mug, glass or can, the device adapts to the drinkware' };

// The studio environment of engine.js createStudioEnvironment(), painted on the CPU as an equirectangular
// half-float map (linear light): the graded sphere (#f4f2ee top, #d9dadd middle, #6f737a bottom) and the key
// softbox, rim strip and fill card, each facing the centre. three.js turns it into a PMREM on first use.
function studioEnv(THREE) {
  const Wd = 256, Ht = 128, data = new Uint16Array(Wd * Ht * 4);
  const top = new THREE.Color(0xf4f2ee), mid = new THREE.Color(0xd9dadd), low = new THREE.Color(0x6f737a), c = new THREE.Color();
  const up = new THREE.Vector3(0, 1, 0);
  const panels = [[6, 4, -4, 6, 5, 3.2], [1.4, 7, 6, 3, -5, 2.2], [5, 2, 5, -1, 4, .9]].map(([w, h, x, y, z, k]) => {
    const p = new THREE.Vector3(x, y, z), zA = p.clone().negate().normalize();
    const xA = new THREE.Vector3().crossVectors(up, zA).normalize(), yA = new THREE.Vector3().crossVectors(zA, xA);
    return { w, h, p, xA, yA, col: [k, k * .98, k * .95] };
  });
  const d = new THREE.Vector3(), q = new THREE.Vector3(), H = THREE.DataUtils.toHalfFloat;
  for (let j = 0; j < Ht; j++) for (let i = 0; i < Wd; i++) {
    // three.js equirect lookup: u = atan(z, x) / 2pi + .5, v = asin(y) / pi + .5 (v up)
    const phi = ((i + .5) / Wd - .5) * 2 * Math.PI, theta = ((j + .5) / Ht - .5) * Math.PI;
    d.set(Math.cos(theta) * Math.cos(phi), Math.sin(theta), Math.cos(theta) * Math.sin(phi));
    if (d.y > 0) c.copy(mid).lerp(top, Math.pow(d.y, .7)); else c.copy(mid).lerp(low, Math.pow(-d.y, .6));
    let rgb = [c.r, c.g, c.b], best = Infinity;
    for (const P of panels) {
      const dp = d.dot(P.p);
      if (dp <= 0) continue;
      const t = P.p.lengthSq() / dp;
      if (t >= best) continue;
      q.copy(d).multiplyScalar(t).sub(P.p);
      if (Math.abs(q.dot(P.xA)) <= P.w / 2 && Math.abs(q.dot(P.yA)) <= P.h / 2) { best = t; rgb = P.col; }
    }
    const o = (j * Wd + i) * 4;
    data[o] = H(rgb[0]); data[o + 1] = H(rgb[1]); data[o + 2] = H(rgb[2]); data[o + 3] = H(1);
  }
  const tex = new THREE.DataTexture(data, Wd, Ht, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.LinearSRGBColorSpace;
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}
// engine.js adopt(): the environment at x .55 on every standard material, once
function adopt(root, env) {
  root.traverse(o => {
    for (const m of o.material ? [].concat(o.material) : []) {
      if (!m.isMeshStandardMaterial || m.userData.viewerEnv) continue;
      m.userData.viewerEnv = true; m.envMap = env; m.envMapIntensity *= .55; m.needsUpdate = true;
    }
  });
}

const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (k === 'class') el.className = v; else if (k === 'text') el.textContent = v; else el.setAttribute(k, v); }
  el.append(...kids);
  return el;
};
const smooth = x => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

// the product controls: one row per control, a label and a set of pressed / unpressed buttons
const ui = { rows: null, set: null };
function segRow(label, key, options) {
  const btns = options.map(([value, text]) => h('button', { class: 'cx__btn', type: 'button', 'data-value': value, 'aria-pressed': 'false', text }));
  const row = h('div', { class: 'cx__row', role: 'group', 'aria-label': label },
    h('span', { text: label }), h('div', { class: 'cx__btns', style: 'grid-column: 2 / 4; gap: 6px' }, ...btns));
  btns.forEach(b => b.addEventListener('click', () => ui.set && ui.set(key, b.dataset.value)));
  return { row, sync: v => btns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.value === v))) };
}

export default {
  slug: 'therma-shift',
  name: 'Therma-Shift 3D model',
  title: 'Therma-Shift',
  eyebrow: 'Interactive / The CAD model',
  prefetch,
  base: () => [.42, -.62, 0],                     // the showreel's view of the coaster
  groups: GROUPS,
  cut: { point: [0, -.014, 0] },                  // vertical, through the stack axis
  ghost: { exterior: .1, interior: .18 },
  tour: { stops: ['topPlate', 'peltier', 'heatsink', 'blower', 'board'] },

  controls() {
    const mode = segRow('Mode', 'mode', [['heat', 'Heat'], ['cool', 'Cool'], ['off', 'Off']]);
    const prop = segRow('On plate', 'prop', [['none', 'None'], ['mug', 'Mug'], ['can', 'Can']]);
    const cable = segRow('Cable', 'cable', [['in', 'In'], ['out', 'Out']]);
    ui.rows = { mode, prop, cable };
    return [mode.row, prop.row, cable.row];
  },

  async build(ctx) {
    const { THREE } = ctx;
    const [{ default: createCoaster }, { createMug, createCan }, { createCable }] = await prefetch();
    const quality = innerWidth < 760 || (navigator.hardwareConcurrency || 8) <= 4 ? 'low' : 'high';
    const coaster = createCoaster({ THREE, quality });
    const cp = coaster.parts;
    const root = coaster.group.children[0];       // the cadmesh group: plate top centre at its origin
    root.updateMatrixWorld(true);
    cp.shell.attach(cp.button);                   // the button rides with the case
    // decals (shadow, glows) are not part meshes: the shell must not ghost, clip or pick them
    const decal = o => o.name === 'shadow' || o.name === 'groundGlow' || o.name === 'plateGlow';
    const meshesOf = obj => { const out = []; obj.traverse(o => { if (o.isMesh && !decal(o)) out.push(o); }); return out; };
    const plateGlow = cp.topPlate.getObjectByName('plateGlow'), groundGlow = cp.shell.getObjectByName('groundGlow');
    // props on the plate, and the cable (its rope baked once, toward the back left, long enough to run out of frame)
    const mug = createMug({ quality }), can = createCan({ quality });
    mug.group.rotation.y = .9; can.group.rotation.y = -.4;
    root.add(mug.group, can.group);
    const cable = createCable({ THREE, quality, port: coaster.port, ground: -coaster.height, box: coaster.caseBounds });
    cable.bake(new THREE.Vector3(coaster.port.position.x - .2, -coaster.height, coaster.port.position.z + .32));
    root.add(cable.group);
    const cableMats = [];
    cable.group.traverse(o => { if (o.isMesh) for (const m of [].concat(o.material)) if (!cableMats.includes(m)) { cableMats.push(m); m.userData.a0 = m.opacity; m.userData.t0 = m.transparent; m.userData.d0 = m.depthWrite; } });
    const env = studioEnv(THREE);
    adopt(coaster.group, env);

    // screws: the label sits on the right corner screw head
    root.updateMatrixWorld(true);
    let screwAt = null;
    cp.screws.traverse(o => {
      if (!o.isMesh) return;
      o.geometry.computeBoundingBox();
      const b = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
      const pos = o.geometry.attributes.position, v = new THREE.Vector3(), best = new THREE.Vector3(-1e3, 0, 0);
      for (let i = 0; i < pos.count; i += 7) { v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); if (v.x - v.z > best.x - best.z) best.copy(v); }
      best.y = b.max.y;
      screwAt = best;
    });

    // anchors are offsets from the part's box centre (coaster space = the shell's model space)
    const centreOf = obj => { const b = new THREE.Box3(); for (const m of meshesOf(obj)) { m.geometry.computeBoundingBox(); b.union(m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld)); } return b.getCenter(new THREE.Vector3()); };
    const anchors = { screws: screwAt ? screwAt.clone().sub(centreOf(cp.screws)).toArray() : null };
    const list = PARTS.map(([id, label, kind, group, exterior, anchor, card]) => ({
      id, label, kind, group, exterior, obj: cp[id], meshes: meshesOf(cp[id]), explode: [0, STACK[id], 0],
      card: { title: label, ...card }, anchor: anchors[id] || anchor, tag: true,
    }));
    const props = [['mug', 'Mug', mug], ['can', 'Can', can]].map(([id, label, p]) => ({
      id, label, kind: 'On the plate', group: 'stack', exterior: true, obj: p.group, meshes: meshesOf(p.group),
      explode: [0, STACK.topPlate, 0], card: { title: label, ...PROP_CARD }, tag: false,
    }));

    // ---- product state: the mode (plate temperature), what is on the plate, the cable
    const S = { mode: 'off', prop: 'none', cable: 'in', temp: TEMP.off, cableT: 1e3, propT: 1, tourMode: null, glowA: [0, 0] };
    const outDur = () => (cable.plugOut ? cable.plugOut.duration : 1.6), inDur = () => (cable.plugIn ? cable.plugIn.duration : 2.6);
    const applyTemp = c => { coaster.setPlateTemperature(c); S.glowA = [plateGlow.material.opacity, groundGlow.material.opacity]; };
    const sync = () => { if (!ui.rows) return; ui.rows.mode.sync(S.mode); ui.rows.prop.sync(S.prop); ui.rows.cable.sync(S.cable); };
    const say = { heat: 'Heat: the plate runs hot.', cool: 'Cool: the plate runs cold.', off: 'Off.', none: 'Nothing on the plate.', mug: 'Mug on the plate.', can: 'Can on the plate.', in: 'Cable in.', out: 'Cable out.' };
    ui.set = (key, v) => {
      if (S[key] === v) return;
      if (key === 'cable') {
        S.cable = v; S.cableT = 0;
        if (v === 'out' && S.mode !== 'off') S.mode = 'off';          // no power, no heat or cold
      } else if (key === 'mode') {
        S.mode = v;
        if (v !== 'off' && S.cable === 'out') { S.cable = 'in'; S.cableT = 0; }
      } else { S.prop = v; S.propT = 0; }
      sync(); ctx.live(say[v]); ctx.invalidate();
    };
    const rest = () => {
      S.mode = 'off'; S.prop = 'none'; S.cable = 'in'; S.cableT = 1e3; S.propT = 1; S.tourMode = null;
      S.temp = TEMP.off; applyTemp(S.temp);
      for (const id of ['mug', 'can']) { const P = ctx.part(id); if (P) { P.visible = false; P.opacity = 0; P.li.hidden = true; } }
      sync();
    };
    applyTemp(S.temp);

    return {
      model: coaster.group,
      parts: [...list, ...props],
      dispose() { coaster.dispose(); mug.dispose(); can.dispose(); cable.dispose(); env.dispose(); },
      ready() { rest(); },
      reset() { rest(); },
      // every frame while open: plate temperature, the cable, the props (true while any of them moves)
      update(t, state, c, dt) {
        let moving = false;
        // the tour shows both modes: hot at the plate, cold at the module, then back to the visitor's choice
        const stop = state.tour ? c.parts.find(P => P.id === ['topPlate', 'peltier', 'heatsink', 'blower', 'board'][state.tour.i]) : null;
        S.tourMode = stop ? (stop.id === 'topPlate' ? 'heat' : stop.id === 'peltier' ? 'cool' : S.tourMode) : null;
        const goal = TEMP[S.tourMode || S.mode];
        if (Math.abs(goal - S.temp) > .05) {
          S.temp = c.reduced ? goal : S.temp + (goal - S.temp) * (1 - Math.exp(-dt * 2.4));
          applyTemp(S.temp); moving = true;
        } else if (S.temp !== goal) { S.temp = goal; applyTemp(goal); }
        // the cable: plug in, or pull out (c.reduced: straight to the end pose)
        const dur = S.cable === 'in' ? inDur() : outDur();
        if (S.cableT < dur) { S.cableT = c.reduced ? dur : S.cableT + dt; moving = true; }
        // the props: shown only while picked (and while the plate is), a short drop onto the plate
        for (const id of ['mug', 'can']) {
          const P = c.part(id);
          P.visible = S.prop === id && c.part('topPlate').visible;
          P.li.hidden = true;
        }
        // labels that would sit on the mug or can (anchors over the plate) step aside while it is there
        const onPlate = S.prop !== 'none' && state.explode < .35;
        for (const P of c.parts) {
          if (P.data.tag === false && !P.data.under) continue;
          const a = P.data.anchor || [0, 0, 0], under = onPlate && Math.hypot(P.center.x + a[0], P.center.z + a[2]) < .046;
          P.data.under = under; P.data.tag = !under;
        }
        if (S.propT < 1) { S.propT = c.reduced ? 1 : Math.min(1, S.propT + dt / .55); moving = true; }
        return moving;
      },
      // after the shell has placed the parts: the cable rides with the case, glows and cable ghost with their parts
      pose(state, c) {
        const shell = c.part('shell'), plate = c.part('topPlate');
        cable.group.position.y = shell.dir.y * state.explode;
        if (S.cable === 'in') cable.showIn(S.cableT); else if (S.cableT < outDur()) cable.showOut(S.cableT); else cable.hide();
        const a = shell.visible ? shell.opacity : 0;
        cable.group.visible = cable.group.visible !== false && a > .004;
        for (const m of cableMats) {
          const tr = a < .999 || m.userData.t0;
          if (m.transparent !== tr) { m.transparent = tr; m.needsUpdate = true; }
          m.opacity = m.userData.a0 * a; m.depthWrite = a < .999 ? false : m.userData.d0;
        }
        plateGlow.material.opacity = S.glowA[0] * (plate.visible ? plate.opacity : 0);
        groundGlow.material.opacity = S.glowA[1] * (shell.visible ? shell.opacity : 0);
        // the contact shadow would show as a dark floor where the cut takes the near half away
        coaster.setShadowOpacity(1 - .8 * state.cutT);
        const p = c.part(S.prop);
        if (p && S.propT < 1) p.obj.position.y += .035 * (1 - smooth(S.propT)) ** 2;
      },
    };
  },
};
