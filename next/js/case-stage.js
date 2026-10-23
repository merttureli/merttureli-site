// STUDIO case pages: the live 3D opening. The product on the case hero is the hero showreel's own
// actor (same model, materials, studio rig, PMREM environment and contact shadow), mounted on its
// own canvas inside the stage card, the way the next/lab/ pages mount one actor outside the hero.
//
// The same element also carries moments further down a page (a band in place of an old clip, e.g.
// data-case-stage="rudder-pedals:side"); only the live stage most on screen draws at any time.
//
// Markup (written by tools/build-studio-cases.py):
//   <div class="stage__live" data-case-stage="therma-shift" role="img" aria-label="...">
//     <picture class="stage__still">...</picture>        poster rendered from this module (see below)
//     <canvas aria-hidden="true"></canvas>
//   </div>
//   <button class="clip-toggle" data-stage-toggle hidden>...</button>   pause / play
//
// Behaviour: play once, then settle into a gentle loop (time driven, not scroll driven: the
// choreography has real dynamics, a ball in flight, a cable that drapes, toe brakes that press,
// and those read wrong scrubbed backwards or at scroll speed; the stage is also mostly in the
// first screen, so there is little scroll to scrub with). The first frame is the poster's pose,
// so the still hands over to the canvas without a jump; the product then opens into its exploded
// view in place, closes, and shows what it does. The loop never repeats the opening.
//   Therma-Shift   opens and closes, the USB-C cable plugs in, the mug warms (orange plate),
//                  the silver can chills (blue plate); loop: mug, warm, can, chill, cable stays in
//   Robo-Catcher   opens and closes; loop: the ball arcs into the net, rolls to the feeder, the
//                  indexer turns it over, the flywheels throw it back out, the wheels spin down
//   Rudder pedals  opens and closes (springs and wires come off first, go back on last); loop:
//                  the hero's pedal beat, rudder both ways, the side turn that shows the springs,
//                  Hall sensors and wiring, each toe brake. The aircraft stays out at this size
// Everything is posed through the actor's own pure sample(T); the few overrides below use the
// actor's public parts (model, cable, values) and keep the loop seamless.
//
// Rules kept: one three.js (next/js/three.module.min.js), the engine's lights and PMREM env, no
// lights here; builds only when the stage nears the viewport; draws nothing off screen, in a
// hidden tab or while paused; reduced motion, Save-Data, ?still or no WebGL keep the poster.
//
// Stills: ?stage-capture[=dpr][&t=s] builds at once with a readable canvas, poses t and sets
// window.__caseStage.ready; `python3 tools/stills.py` reads it on next/lab/stills.html.
// Debug and capture: window.__caseStages[key] (and __caseStage, the first) { t, running, pause(), resume(), seek(t) }.

// ------------------------------------------------------------------ adapters
// plan(S, actor) -> { intro: [segment], loop: [segment], post(actor, at) }
// A segment maps d page seconds linearly onto actor time T0 -> T1 (T0 > T1 plays it backwards,
// T0 = T1 holds). post() runs after actor.sample(); `at` = { T, tag, u (0..1 in the segment), pass }.
const ADAPTERS = {
  'therma-shift': {
    load: () => import('./showreel/index.js').then(m => m.createThermaShift),
    // share of the card the actor may use (it sizes itself inside this, as in the hero)
    free: { land: [.1, .04, .1, .04], port: [.04, .06, .04, .08] },
    plan(S, actor) {
      const A = S.ASSEMBLE, M = S.MUG_DROP, CE = S.CAN_EXIT, BT = S.BEAT;
      const cable = actor.cable;
      return {
        intro: [
          { tag: 'open', d: 3.0, T0: A.t1, T1: A.t0 },
          { tag: 'hold', d: .9, T0: A.t0, T1: A.t0 },
          { tag: 'story', d: BT.t1 - A.t0, T0: A.t0, T1: BT.t1 },
        ],
        // mug drop (its own .45 s pre-roll) through the can leaving and the plate going back to neutral
        loop: [{ tag: 'loop', d: BT.t1 - (M.t0 - .45), T0: M.t0 - .45, T1: BT.t1 }],
        post(a, at) {
          // the cable stays plugged in once it is in: no pull-out (that leads into the hero's exit)
          if (cable && (at.tag === 'loop' || (at.tag === 'story' && at.T >= CE.t1))) cable.showIn(1e3);
        },
      };
    },
  },
  'robo-catcher': {
    load: () => import('./showreel/robo-catcher.js').then(m => m.createActor),
    free: { land: [.08, .05, .08, .05], port: [.04, .08, .04, .08] }, grow: { land: 1.5, port: 1.4 }, fit: true,
    plan(S, actor) {
      const AS = S.ROBO_ASSEMBLE, Pt = S.ROBO_PITCH, Fd = S.ROBO_FEED, Ix = S.ROBO_INDEX, Th = S.ROBO_THROW;
      const model = actor.model, v = actor.values;
      // flywheel speed, measured from the actor itself while it holds full speed (rad/s)
      actor.sample(Ix.t0 + .7, S); const a0 = v.top;
      actor.sample(Ix.t0 + .8, S); const w = (v.top - a0) / .1;
      // the actor's spin profile: up while the ball is fed, full for the throw, down after it
      const t0 = Fd.t0 + .4, t1 = Ix.t0 + .6, t2 = Th.t1 - .1, t3 = Th.t1 + 1.2;
      const spin = T => {
        if (T <= t0) return 0;
        const up = (t1 - t0) / 2 * w;
        if (T < t1) return w * (T - t0) ** 2 / (2 * (t1 - t0));
        if (T < t2) return up + w * (T - t1);
        const hold = up + w * (t2 - t1);
        if (T < t3) { const s = T - t2; return hold + w * s - w * s * s / (2 * (t3 - t2)); }
        return hold + w * (t3 - t2) / 2;
      };
      const full = spin(1e3), TAIL = 1.6;
      return {
        intro: [
          { tag: 'open', d: 2.2, T0: AS.t1, T1: AS.t0 },
          { tag: 'hold', d: .6, T0: AS.t0, T1: AS.t0 },
          { tag: 'cycle', d: Th.t1 - AS.t0, T0: AS.t0, T1: Th.t1 },
          { tag: 'tail', d: TAIL, T0: Th.t1 - 1e-3, T1: Th.t1 - 1e-3 },
        ],
        loop: [
          { tag: 'cycle', d: Th.t1 - Pt.t0, T0: Pt.t0, T1: Th.t1 },
          { tag: 'tail', d: TAIL, T0: Th.t1 - 1e-3, T1: Th.t1 - 1e-3 },
        ],
        post(a, at) {
          // the wheels spin down after the throw (the hero opens the machine there) and keep their angle
          // from pass to pass; the indexer turns on by half a turn each pass (its two chambers are alike)
          const T = at.tag === 'tail' ? Th.t1 + at.u * TAIL : at.T;
          const ang = at.pass * full + spin(T);
          model.setSpin(ang, ang);
          model.setIndex(v.idx + at.pass * Math.PI);
        },
      };
    },
  },
  'rudder-pedals': {
    load: () => import('./showreel/rudder-pedals.js').then(m => m.createActor),
    free: { land: [.08, .05, .08, .05], port: [.05, .08, .05, .08] }, grow: { land: 1.8, port: 1.5 },
    plan(S, actor) {
      const A = S.RUDDER_PEDALS_ASSEMBLE, X = S.RUDDER_PEDALS_ACTION;
      const model = actor.model, view = model.group.parent;
      const flight = actor.accent.group.parent;
      // the hero turns the assembly a little across its whole act; here the beat loops, so that slow
      // drift is taken out of the beat (measured: the yaw at its start and at its end, both facing front)
      actor.sample(X.t0, S); const y0 = view.rotation.y;
      actor.sample(X.t1 - 1e-4, S); const y1 = view.rotation.y;
      // springs and wires are rebuilt in the view's frame: bring its matrix up to date first
      const grow = g => { view.updateWorldMatrix(true, false); model.setGrow(g, g); model.refresh(); };
      return {
        intro: [
          { tag: 'open', d: 2.4, T0: A.t1, T1: A.t0 },
          { tag: 'hold', d: .6, T0: A.t0, T1: A.t0 },
          { tag: 'story', d: X.t1 - A.t0, T0: A.t0, T1: X.t1 },
        ],
        loop: [{ tag: 'beat', d: X.t1 - X.t0, T0: X.t0, T1: X.t1 }],
        post(a, at) {
          flight.visible = false;                                  // the aircraft stays out at case size
          if (at.T >= X.t0) view.rotation.y -= (at.T - X.t0) / (X.t1 - X.t0) * (y1 - y0);
          const v = actor.values;
          // springs and wires are on at the start pose and through every loop; they come off first when it opens
          if (at.tag === 'open') grow(Math.max(v.growS, 1 - smooth(at.u / .3)));
          else if (at.tag === 'beat') grow(1);
        },
      };
    },
  },
  // further down the rudder pedals page: the mechanism moment, the same beat seen from the side the
  // whole time (springs, Hall sensors and wiring in view), in place of the old mechanism clip
  'rudder-pedals:side': {
    load: () => import('./showreel/rudder-pedals.js').then(m => m.createActor),
    free: { land: [.1, .06, .1, .06], port: [.05, .06, .05, .06] }, grow: { land: 1.6, port: 1.5 },
    plan(S, actor) {
      const X = S.RUDDER_PEDALS_ACTION;
      const model = actor.model, view = model.group.parent, flight = actor.accent.group.parent;
      // the hero's side turn, measured where it holds (the yaw and the slight push in it ends on)
      actor.sample(X.t0 + 8, S); const ySide = view.rotation.y, sSide = view.scale.x;
      return {
        intro: [],
        loop: [{ tag: 'beat', d: X.t1 - X.t0, T0: X.t0, T1: X.t1 }],
        post() {
          flight.visible = false;
          view.rotation.y = ySide; view.scale.setScalar(sSide); view.updateWorldMatrix(true, false);
          model.setGrow(1, 1); model.refresh();
        },
      };
    },
  },
};
let T3 = null;   // three.js, from the engine module once loaded
// Screen rect (px) of the visible, opaque meshes under root: each mesh's box corners projected.
function shownRect(root, camera, w, h) {
  const v = new T3.Vector3(), r = { l: Infinity, t: Infinity, r: -Infinity, b: -Infinity };
  camera.updateMatrixWorld(); root.updateWorldMatrix(true, true);
  root.traverseVisible(m => {
    if (!m.isMesh || !m.geometry || (m.material && m.material.transparent)) return;
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    const bb = m.geometry.boundingBox;
    for (let i = 0; i < 8; i++) {
      v.set(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z).applyMatrix4(m.matrixWorld).project(camera);
      const x = (v.x + 1) / 2 * w, y = (1 - v.y) / 2 * h;
      if (x < r.l) r.l = x; if (x > r.r) r.r = x; if (y < r.t) r.t = y; if (y > r.b) r.b = y;
    }
  });
  return r;
}
const smooth = x => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

// ------------------------------------------------------------------ mount
// Several live stages can sit on one page (the opening and, further down, a moment); only one draws at
// a time: the one with the most of itself on screen. The others hold their last frame.
const stages = [];
let active = null;
function pickActive() {
  let best = null;
  for (const s of stages) if (s.eligible() && (!best || s.seen > best.seen)) best = s;
  if (best === active) return;
  const was = active; active = best;
  if (was) was.stop();
  if (active) active.kick();
}

function mount(box) {
  const key = box.dataset.caseStage, ad = ADAPTERS[key];
  const card = box.closest('.stage__card, .band') || box;
  const canvas = box.querySelector('canvas');
  const toggle = card.querySelector('[data-stage-toggle]');
  const qs = new URLSearchParams(location.search);
  const cap = qs.has('stage-capture'), capDpr = +qs.get('stage-capture') || 0, capT = +qs.get('t') || 0;
  const reducedQ = matchMedia('(prefers-reduced-motion: reduce)');
  const saveData = navigator.connection && navigator.connection.saveData;
  const still = () => { box.classList.remove('is-live'); box.classList.add('is-still'); };
  if (!ad || !canvas || !webgl() || (!cap && (reducedQ.matches || saveData || qs.has('still')))) { still(); return; }

  let engine = null, actor = null, S = null, plan = null, built = null;
  let t = 0, raf = 0, last = 0, started = false, onScreen = false, userPaused = false, introD = 0, loopD = 0;
  const self = { seen: 0, eligible: () => started && onScreen && !userPaused && !reducedQ.matches, kick: () => kick(), stop: () => stop() };
  stages.push(self);
  const api = {
    key, ready: false,
    get t() { return t; }, get running() { return !!raf; }, get actor() { return actor; },
    pause() { userPaused = true; pickActive(); stop(); },
    resume() { userPaused = false; pickActive(); kick(); },
    seek(tt, dt = 1 / 60) { if (!actor) return; t = Math.max(0, tt); pose(t); actor.update(dt, t); engine.render(); },
  };
  (window.__caseStages = window.__caseStages || {})[key] = api;
  if (!window.__caseStage) window.__caseStage = api;

  // ---- build (once, when the stage nears the viewport)
  function build() {
    if (built) return built;
    built = (async () => {
      const [{ createEngine, createTimeline, THREE }, factory] = await Promise.all([import('./showreel/engine.js'), ad.load()]);
      T3 = THREE;
      const quality = (innerWidth < 760 || (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4) ? 'low' : 'high';
      engine = createEngine({ canvas, preserve: cap, pixelRatio: capDpr || undefined });
      actor = await factory({ engine, quality });
      engine.scene.add(actor.group);
      // the hero's lead-in before a guest (index.js HANDOVER), so every window the actor reads starts in range
      S = createTimeline([['HANDOVER', .7], ...actor.sequence]).states;
      size();                       // the actor is laid out before anything samples it
      plan = ad.plan(S, actor);
      W = H = 0; size();            // and again with the plan, to check the start pose's real extent
      introD = plan.intro.reduce((s, g) => s + g.d, 0);
      loopD = plan.loop.reduce((s, g) => s + g.d, 0);
      await actor.prewarm(engine.renderer, engine.camera, engine.scene);
      api.seek(cap ? capT : 0);
      new ResizeObserver(() => { if (size()) { pose(t); engine.render(); } }).observe(box);
      api.ready = true;
      return true;
    })().catch(err => { console.warn('[case-stage] live model unavailable, keeping the still', err); still(); built = Promise.resolve(false); return false; });
    return built;
  }

  // ---- framing: the actor sizes and places itself inside a free box of the card (clear of the index
  // label and the caption row), exactly as it does inside the hero's free area
  let W = 0, H = 0;
  function size() {
    const r = box.getBoundingClientRect(), w = Math.round(r.width), h = Math.round(r.height);
    if (!w || !h || (w === W && h === H)) return false;
    W = w; H = h;
    engine.size(w, h);
    const vw = engine.viewAt(0), o = w < h * 1.15 ? 'port' : 'land', f = ad.free[o], g = (ad.grow && ad.grow[o]) || 1;
    const labelRow = rowBottom(card.querySelector('.stage__idx'), r), capRow = rowTop(card.querySelector('.stage__cap, figcaption'), r, h);
    const inner = { l: w * f[0], t: Math.max(h * f[1], labelRow + 6), r: w * (1 - f[2]), b: Math.min(h * (1 - f[3]), capRow - 6) };
    // The actor measures itself at the centre of the view and then moves there; with real perspective the
    // parts nearest the camera land a little further out than measured (Robo-Catcher's long ramps, `fit`).
    // Measure the start pose where it really is and pull the box in by any overshoot (twice at most).
    for (let i = 0; i < 3; i++) {
      layoutIn(inner, g, w, h, vw);
      if (!plan || !ad.fit) break;
      pose(0);
      const got = shownRect(actor.group, engine.camera, w, h), d = 2;
      const over = { l: inner.l - got.l, t: inner.t - got.t, r: got.r - inner.r, b: got.b - inner.b };
      if (Math.max(over.l, over.t, over.r, over.b) <= d) break;
      for (const k of ['l', 't']) if (over[k] > d) inner[k] += over[k] + d;
      for (const k of ['r', 'b']) if (over[k] > d) inner[k] -= over[k] + d;
    }
    return true;
  }
  // An actor sizes itself as a share of its free area (a share tuned for the hero, where it shares the
  // stage with the drift words). To let it take more of the card, hand it a larger free area with the
  // part outside the usable box marked as `avoid`: it then grows, and its placement and exploded view
  // still keep inside the box.
  function layoutIn(inner, g, w, h, vw) {
    let free = inner, avoid = [];
    if (g > 1) {
      const cx = (inner.l + inner.r) / 2, cy = (inner.t + inner.b) / 2, hw = (inner.r - inner.l) / 2 * g, hh = (inner.b - inner.t) / 2 * g;
      free = { l: cx - hw, t: cy - hh, r: cx + hw, b: cy + hh };
      avoid = [
        { l: free.l - 1, r: inner.l, t: free.t - 1, b: free.b + 1 }, { l: inner.r, r: free.r + 1, t: free.t - 1, b: free.b + 1 },
        { l: free.l - 1, r: free.r + 1, t: free.t - 1, b: inner.t }, { l: free.l - 1, r: free.r + 1, t: inner.b, b: free.b + 1 },
      ];
    }
    actor.layout({ halfW: vw.halfW, halfH: vw.halfH, camera: engine.camera, w, h, free, avoid, vp: { l: 0, t: 0, r: w, b: h } });
  }
  // a label row only counts when it sits over the canvas (a phone caption below the media does not)
  const rowBottom = (el, r) => { const b = el && el.getBoundingClientRect(); return b && b.top < r.bottom && b.bottom > r.top ? b.bottom - r.top : 40; };
  const rowTop = (el, r, h) => { const b = el && el.getBoundingClientRect(); return b && b.top < r.bottom && b.bottom > r.top ? b.top - r.top : h - 40; };

  // ---- time: page seconds -> actor time
  function locate(tt) {
    let list = plan.intro, pass = 0, x = tt;
    if (tt >= introD) { x = (tt - introD) % loopD; pass = 1 + Math.floor((tt - introD) / loopD); list = plan.loop; }
    for (const g of list) {
      if (x < g.d || g === list[list.length - 1]) { const u = Math.min(1, x / g.d); return { T: g.T0 + (g.T1 - g.T0) * u, tag: g.tag, u, pass }; }
      x -= g.d;
    }
  }
  function pose(tt) {
    const at = locate(tt);
    actor.sample(at.T, S);
    plan.post(actor, at);
  }

  // ---- loop: runs only while started, on screen, the active stage, the tab visible and not paused
  const wantRun = () => self.eligible() && active === self && !document.hidden;
  function frame(now) {
    raf = 0;
    if (!wantRun()) { last = 0; return; }
    const dt = last ? Math.min(.064, (now - last) / 1000) : 1 / 60;
    last = now; t += dt;
    pose(t);
    if (actor.visible) actor.update(dt, t);
    engine.render();
    raf = requestAnimationFrame(frame);
  }
  function kick() { if (!raf && wantRun()) { last = 0; raf = requestAnimationFrame(frame); } }
  function stop() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }
  function start() {
    if (started) return;
    started = true;
    box.classList.add('is-live');
    if (toggle) toggle.hidden = false;
    pickActive();
    kick();
  }

  if (cap) { build(); return; }
  // build when near, play once at least half of it is in view, then whenever it is the stage most in view
  let half = false;
  new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) build(); }, { rootMargin: '60% 0px' }).observe(box);
  new IntersectionObserver(es => {
    const e = es[es.length - 1];
    onScreen = e.isIntersecting;
    self.seen = e.intersectionRect.height;
    half = half || e.intersectionRatio >= .5 || e.intersectionRect.height >= innerHeight * .5;
    if (!onScreen) stop();
    if (onScreen && half && !started) build().then(ok => { if (ok) start(); });
    pickActive();
    kick();
  }, { threshold: [0, .1, .2, .3, .4, .5, .6, .7, .8, .9, 1] }).observe(box);
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : kick()));
  reducedQ.addEventListener('change', () => {
    if (reducedQ.matches) { stop(); still(); } else if (started) { box.classList.remove('is-still'); box.classList.add('is-live'); }
    pickActive(); kick();
  });
  if (toggle) {
    const label = toggle.querySelector('span');
    toggle.addEventListener('click', () => {
      userPaused = !userPaused;
      toggle.setAttribute('aria-pressed', String(userPaused));
      if (label) label.textContent = userPaused ? 'Play' : 'Pause';
      if (userPaused) stop();
      pickActive(); kick();
    });
  }
}

function webgl() {
  try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch (e) { return false; }
}

document.querySelectorAll('[data-case-stage]').forEach(mount);
