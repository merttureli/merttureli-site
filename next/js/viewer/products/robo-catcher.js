// Robo-Catcher on the viewer shell (next/js/viewer/viewer.js). Config API: docs/recipes/viewer.md.
//
// The machine is the showreel actor's own (next/js/showreel/robo-catcher.js): createActor() builds the
// same model (the owner's render mesh and material groups, the net and the feeder's wire panels as
// line sets, the indexer and flywheels on their real axles) and the same optic-yellow ball. The
// viewer drives it through the actor's pure sample(T), so Play cycle is the reel's choreography: the
// ball arcs into the net, drops on the sloped bed, rolls into the feeder's lower chamber, the indexer
// turns it 180 degrees, it runs through the transfer elbow and the flywheels throw it back out. The
// tour plays the same path one stop at a time.
//
// Explode separates the five subsystems: frame (bed and ground ramps), net, feed (cage and transfer
// elbow), indexer (lifted out of the cage) and the flywheel thrower. Card text is the case study's own
// words (content/projects/robo-catcher.json); part names are the cadmesh labels
// (tools/cad/maps/robo-catcher.npz.json).
//
// The shell has no environment map for products, so this module gives the materials the studio
// environment the hero and the case stage use (engine.js createStudioEnvironment), drawn as an
// equirect texture that three.js turns into the same kind of PMREM on first use.
const ACTOR = () => import('../../showreel/robo-catcher.js');
const ENGINE = () => import('../../showreel/engine.js');
const SLUG = 'robo-catcher';

// The case study's words (content/projects/robo-catcher.json), unchanged.
const SAY = {
  lede: 'A machine that catches the ball and returns it.',
  feeder: 'The feeder is a rotating dual chamber: catch a ball, rotate 180 degrees, hand it to the return flywheel.',
  index: '100% feed indexing on competition day: every ball delivered, no misses',
  learned: 'The MATLAB torque study felt slow while teammates were already printing parts. Then the feeder ran a full competition day without a missed index.',
  flywheel: 'Return flywheel, 120 W DC motor',
  portable: '55 lb, one person portable, assembles with no tools',
};
const GROUPS = [
  { key: 'frame', label: 'Frame' },
  { key: 'net', label: 'Net' },
  { key: 'feed', label: 'Feed' },
  { key: 'indexer', label: 'Indexer' },
  { key: 'thrower', label: 'Thrower' },
];
// Labels are the cadmesh file's (the map's for the flywheels: the file has their part names).
// Parts in the ball's order (net, bed, feeder, indexer, elbow, flywheels), then what holds them.
// explode: metres in model space at 100 % (+X toward the thrower, +Y up, +Z the front, where the
// pitcher stands). The feeder slides off the end of the bed, the indexer rises out of the cage, the
// elbow follows, the thrower comes forward and out; its top plates lift off the flywheels.
const THROWER = [.74, 0, .3];
const add = (a, b) => a.map((v, i) => v + b[i]);
const PARTS = [
  { id: 'backstop', label: 'Backstop poles and net', group: 'net', explode: [0, .12, -.34], card: { lede: SAY.lede } },
  { id: 'bed', label: 'Catch bed and ramps', group: 'frame', explode: [0, 0, 0], card: { lede: SAY.portable, rows: [['Build', 'Laser cut HDF and 3D printed parts'], ['Total build cost', '<$700']] } },
  { id: 'cage', label: 'Feeder cage', group: 'feed', explode: [.3, 0, -.1], card: { lede: SAY.feeder, rows: [['Role', 'Feeding subsystem co-lead, all electronics and firmware']] } },
  { id: 'indexer', label: 'Rotating dual chamber', group: 'indexer', explode: [.3, .52, -.1], exterior: false, card: { lede: SAY.index, desc: SAY.learned } },
  { id: 'tube', label: 'Transfer elbow', group: 'feed', explode: [.5, .3, .04], exterior: false },
  { id: 'flywheelTop', label: 'Upper flywheel', group: 'thrower', explode: add(THROWER, [0, .07, 0]), exterior: false, card: { lede: SAY.flywheel } },
  { id: 'flywheelBottom', label: 'Lower flywheel', group: 'thrower', explode: THROWER, exterior: false, card: { lede: SAY.flywheel } },
  { id: 'idlers', label: 'Idler gears', group: 'thrower', explode: add(THROWER, [.12, .04, 0]), exterior: false },
  { id: 'throwerPlates', label: 'Thrower plates', group: 'thrower', explode: add(THROWER, [0, .17, 0]) },
  { id: 'throwerBase', label: 'Thrower base', group: 'thrower', explode: THROWER, card: { lede: SAY.flywheel } },
  { id: 'groundRamps', label: 'Ground ball ramps', group: 'frame', explode: [0, 0, .26] },
];
const KIND = Object.fromEntries(GROUPS.map(g => [g.key, g.label]));
// Tour: one stop per step of the ball's path; each plays its stretch of the reel (actor seconds,
// from the start of ROBO_PITCH) while the part is in focus.
const TOUR_MS = 3600;
const TOUR = [
  ['backstop', 'ROBO_PITCH', 0, 'ROBO_PITCH', 1.9],     // the pitch, the net gives, the ball drops on the bed
  ['bed', 'ROBO_PITCH', 1.9, 'ROBO_FEED', 1.6],          // it rolls down the sloped bed
  ['cage', 'ROBO_FEED', 1.5, 'ROBO_FEED', 2.3],          // into the feeder and its lower chamber
  ['indexer', 'ROBO_INDEX', 0, 'ROBO_INDEX', 1.5],       // the chamber turns 180 degrees
  ['flywheelTop', 'ROBO_THROW', 0, 'ROBO_THROW', 1.5],   // the elbow, the flywheels grip it and throw it back
];
const TAIL = 1.4;                                       // after a cycle: the wheels spin down (seconds)

let modP = null;
// Fetch the actor module (it fetches the model when it loads) and the engine. Safe to call many times.
function prefetch() {
  if (!modP) {
    modP = Promise.all([ACTOR(), ENGINE()]);
    modP.catch(() => { modP = null; });
  }
  return modP;
}

// engine.js createStudioEnvironment(), drawn by ray into an equirect (same sphere grade, key softbox,
// rim strip and fill card), in linear light with headroom (half float)
function studioEnv(THREE) {
  const W = 256, H = 128, data = new Uint16Array(W * H * 4), half = THREE.DataUtils.toHalfFloat;
  const top = new THREE.Color(0xf4f2ee), mid = new THREE.Color(0xd9dadd), low = new THREE.Color(0x6f737a), c = new THREE.Color();
  const up = new THREE.Vector3(0, 1, 0);
  const panels = [[6, 4, -4, 6, 5, 3.2], [1.4, 7, 6, 3, -5, 2.2], [5, 2, 5, -1, 4, .9]].map(([w, h, x, y, z, k]) => {
    const p = new THREE.Vector3(x, y, z), zA = p.clone().negate().normalize();
    const xA = new THREE.Vector3().crossVectors(up, zA).normalize(), yA = new THREE.Vector3().crossVectors(zA, xA);
    return { w, h, p, xA, yA, d2: p.lengthSq(), color: new THREE.Color(k, k * .98, k * .95) };
  });
  const d = new THREE.Vector3(), q = new THREE.Vector3();
  for (let j = 0; j < H; j++) {
    const lat = ((j + .5) / H - .5) * Math.PI;
    for (let i = 0; i < W; i++) {
      const th = ((i + .5) / W - .5) * 2 * Math.PI;
      d.set(Math.cos(lat) * Math.cos(th), Math.sin(lat), Math.cos(lat) * Math.sin(th));
      const y = d.y;
      if (y > 0) c.copy(mid).lerp(top, Math.pow(y, .7)); else c.copy(mid).lerp(low, Math.pow(-y, .6));
      let near = Infinity;
      for (const P of panels) {
        const dp = d.dot(P.p);
        if (dp <= 0) continue;
        const t = P.d2 / dp;
        if (t >= near) continue;
        q.copy(d).multiplyScalar(t).sub(P.p);
        if (Math.abs(q.dot(P.xA)) <= P.w / 2 && Math.abs(q.dot(P.yA)) <= P.h / 2) { near = t; c.copy(P.color); }
      }
      const o = (j * W + i) * 4;
      data[o] = half(c.r); data[o + 1] = half(c.g); data[o + 2] = half(c.b); data[o + 3] = half(1);
    }
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.LinearSRGBColorSpace;
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

// ------------------------------------------------------------------ state shared by the hooks
let A = null;            // { actor, model, ball, S, lines, w, env }
let playBtn = null, spinBtn = null;
const run = { cyc: null, tour: null, spinOn: false, spinVel: 0, spinAng: 0, wheelBase: 0, idxBase: 0, last: 0 };

function setPressed(b, on) { if (b) b.setAttribute('aria-pressed', String(on)); }

// pose the actor at reel time T (clamped to the cycle) and add the viewer's own turns on top
function poseAt(T, extraWheel = 0) {
  const { actor, model, S } = A, Th = S.ROBO_THROW;
  actor.sample(Math.min(T, Th.t1 - 1e-3), S);
  const v = actor.values;
  let wheel = v.top;
  if (T > Th.t1) {   // after the throw the reel opens the machine; here the wheels only spin down
    const s = Math.min(T - Th.t1, TAIL);
    wheel = A.full + A.w * s - A.w * s * s / (2 * TAIL);
  }
  model.setSpin(run.wheelBase + wheel + run.spinAng + extraWheel, run.wheelBase + wheel + run.spinAng + extraWheel);
  model.setIndex(v.idx + run.idxBase);
  return wheel;
}
function rest() { poseAt(A.S.ROBO_PITCH.t0); }

function stopCycle(done) {
  if (!run.cyc) return;
  if (done) { run.wheelBase += A.full + A.w * TAIL / 2; run.idxBase += Math.PI; }   // the two chambers are alike
  run.cyc = null;
  setPressed(playBtn, false);
  rest();
}

function controls(ctx) {
  const btn = (text, act) => {
    const b = document.createElement('button');
    b.className = 'cx__btn'; b.type = 'button'; b.dataset.act = act; b.textContent = text; b.setAttribute('aria-pressed', 'false');
    return b;
  };
  playBtn = btn('Play cycle', 'cycle');
  spinBtn = btn('Spin flywheels', 'spin');
  playBtn.addEventListener('click', () => {
    if (!A) return;
    if (run.cyc) { stopCycle(false); ctx.live('Cycle stopped.'); ctx.invalidate(); return; }
    // the ball runs through the assembled machine: close it first (this also ends a tour)
    const ex = document.getElementById(`cx-${SLUG}-explode`);
    if (ex && +ex.value !== 0) { ex.value = '0'; ex.dispatchEvent(new Event('input')); }
    ctx.state.explodeGoal = 0;
    run.tour = null;
    run.cyc = { t: 0 };
    setPressed(playBtn, true);
    ctx.live('Cycle playing.');
    ctx.invalidate();
  });
  spinBtn.addEventListener('click', () => {
    run.spinOn = !run.spinOn;
    setPressed(spinBtn, run.spinOn);
    ctx.live(run.spinOn ? 'Flywheels spinning.' : 'Flywheels stopping.');
    ctx.invalidate();
  });
  const row = document.createElement('div');
  row.className = 'cx__btns';
  row.append(playBtn, spinBtn);
  return [row];
}

function update(t, state, ctx, dt) {
  if (!A) return false;
  const S = A.S;
  let moving = false;
  // spin toggle: eases up to the reel's full speed and back down
  const goalVel = run.spinOn ? A.w : 0;
  if (Math.abs(run.spinVel - goalVel) > 1e-3) { run.spinVel += (goalVel - run.spinVel) * (1 - Math.exp(-dt * 2.2)); moving = true; } else run.spinVel = goalVel;
  if (run.spinVel) { run.spinAng += run.spinVel * dt; moving = true; }
  // the explode slider opens the machine: the ball cannot run through it, so a cycle stops
  if (run.cyc && state.explodeGoal > 0) stopCycle(false);
  // tour: each stop plays its stretch of the path
  const tr = state.tour;
  if (tr && tr.i >= 0 && tr.i < TOUR.length) {
    if (run.cyc) stopCycle(false);
    if (!run.tour || run.tour.i !== tr.i) run.tour = { i: tr.i, t0: t };
    const [, s0, a, s1, b] = TOUR[tr.i];
    const T0 = S[s0].t0 + a, T1 = S[s1].t0 + b;
    const u = Math.min(1, (t - run.tour.t0) / (TOUR_MS / 1000 * .82));
    poseAt(T0 + (T1 - T0) * u);
    return true;
  }
  if (run.tour) { run.tour = null; rest(); moving = true; }
  if (run.cyc) {
    run.cyc.t += dt;
    const T = S.ROBO_PITCH.t0 + run.cyc.t;
    if (T > S.ROBO_THROW.t1 + TAIL) { stopCycle(true); return true; }
    poseAt(T);
    return true;
  }
  if (moving) poseAt(S.ROBO_PITCH.t0);
  return moving;
}

// the net and the feeder's wire panels are line sets: ghost and cut them with their part
function pose(state, ctx) {
  if (!A) return;
  for (const L of A.lines) {
    const P = ctx.part(L.part);
    const o = P ? P.opacity : 1, tr = o < .999;
    if (L.mat.transparent !== tr) { L.mat.transparent = tr; L.mat.needsUpdate = true; }
    L.mat.opacity = o;
  }
}

function reset(state, ctx) {
  if (!A) return;
  run.cyc = null; run.tour = null; run.spinOn = false; run.spinVel = 0; run.spinAng = 0; run.wheelBase = 0; run.idxBase = 0;
  setPressed(playBtn, false); setPressed(spinBtn, false);
  // like the tour: no product motion with reduced motion
  if (playBtn) playBtn.hidden = ctx.reduced;
  if (spinBtn) spinBtn.hidden = ctx.reduced;
  rest();
}

function ready(ctx) {
  // the line sets take the shell's section plane (every part material carries it)
  const m = ctx.parts.find(P => P.meshes.length).meshes[0].material;
  for (const L of A.lines) { L.mat.clippingPlanes = m.clippingPlanes; L.mat.needsUpdate = true; }
}

async function build(ctx) {
  const { THREE } = ctx;
  const [actorMod, engine] = await prefetch();
  const env = studioEnv(THREE);
  // the actor as the reel builds it; adopt() gives its materials the studio environment, as engine.adopt does
  const adopt = root => root.traverse(o => {
    for (const mt of [].concat(o.material || [])) {
      if (!mt.isMeshStandardMaterial || mt.envMap) continue;
      mt.envMap = env; mt.envMapIntensity *= .55; mt.needsUpdate = true;
    }
  });
  const actor = await actorMod.createActor({ engine: { renderer: null, adopt }, quality: 'high' });
  const model = actor.model, ball = actor.accent;
  const S = engine.createTimeline(actor.sequence).states;
  // flywheel full speed (rad/s), measured from the actor while it holds it (as case-stage.js does)
  actor.sample(S.ROBO_INDEX.t0 + .7, S); const a0 = actor.values.top;
  actor.sample(S.ROBO_INDEX.t0 + .8, S); const w = (actor.values.top - a0) / .1;
  actor.sample(S.ROBO_THROW.t1 - 1e-3, S); const full = actor.values.top;
  // the ball rides in the model's space (it was the model's sibling in the reel's view group)
  model.group.add(ball.group);
  const lines = [];
  model.group.traverse(o => { if (o.isLineSegments) lines.push({ part: o.name.split(':')[0], mat: o.material }); });
  A = { actor, model, ball, S, lines, w, full, env };
  rest();
  const parts = PARTS.map(p => {
    const obj = model.parts[p.id];
    return {
      id: p.id, obj, group: p.group, kind: KIND[p.group], explode: p.explode, exterior: p.exterior !== false,
      label: p.label,
      card: p.card ? { ...p.card } : null,
    };
  });
  return {
    model: model.group, parts, update, pose, reset, ready,
    dispose() { actor.dispose(); env.dispose(); A = null; playBtn = spinBtn = null; },
  };
}

export default {
  slug: SLUG,
  name: 'Robo-Catcher 3D model',
  title: 'Robo-Catcher',
  eyebrow: 'Interactive / The CAD model',
  prefetch,
  build,
  controls,
  groups: GROUPS,
  // a three-quarter view from the front right, a little above, with the feeder and the thrower nearest
  // (the owner's turntable angle); phones turn it more side-on so the long bed takes less width
  base: port => (port ? [.36, -.95, 0] : [.34, -.62, 0]),
  fit: .86,
  faceParts: false,                                     // a pick keeps the machine's heading
  cut: { point: [.56, .2, -.25], keepAxis: true },   // through the indexer shaft: the chamber inside the cage
  tour: { stops: TOUR.map(s => s[0]), ms: TOUR_MS },
};
