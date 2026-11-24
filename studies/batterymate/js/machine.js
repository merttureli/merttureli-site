// Batterymate: the live machine. Loaded after first paint (three.js is 692 KB), never in the first view.
//
// One WebGL canvas for the whole page. It sits in the hero, where the page plays catch (sim.js), and moves into the
// pinned "How it works" stage, where the same machine is posed by the scroll (poses.js). Only the host most on screen
// has it; the other shows its rendered still.
//
// The machine, its softball and its studio are the portfolio's own: createModel and createAccent from the showreel
// actor (next/js/showreel/robo-catcher.js), dressRoboCatcher from look.js, the engine's rig and camera (engine.js).
// Nothing is copied from them but the ball's path in CAD mm (sim.js).
//
// Framing: the camera never moves. The machine keeps one viewing angle per pose; where and how large it lands on the
// page is a zoom and a lens shift (PerspectiveCamera.zoom and setViewOffset), so the same picture can be laid into
// any box of the layout and the rendered stills match the live canvas exactly.
//
//   const m = await createMachine({ canvas, quality, on })
//   m.mount('hero' | 'how', host, box, fit) put the canvas in `host`, lay the machine into `box` as its still is laid
//   m.throwFrom(clientX, clientY, user)     a pitch from that point of the page (hero only) -> true if a ball left
//   m.story(p)                              pose the scroll scene, p 0..1 (how only)
//   m.show(on)                              draw or stop (off screen, hidden tab)
//   m.clientOf(vec3)                        page position of a point in the machine's space
import { createEngine, THREE, clamp01, lerp } from '../../../next/js/showreel/engine.js';
import { createModel, createAccent } from '../../../next/js/showreel/robo-catcher.js';
import { dressRoboCatcher } from '../../../next/js/showreel/look.js';
import { createSim, MAX_BALLS } from './sim.js';
import { HERO, STILL, OPEN, PITCH, storyAt } from './poses.js';

const SCALE = .2;                          // the machine in the engine's world: 2.2 units from the camera, 11 m away
const CENTER = [.01, .78, 0];              // what the view turns about (model space, m)
const Z_THROW = 4.4;                       // a pitch starts on this plane in front of the machine (m)

export async function createMachine({ canvas, quality = 'high', on = {}, capture = false, pixelRatio = 0 }) {
  const engine = createEngine({ canvas, preserve: capture, pixelRatio: pixelRatio || Math.min(devicePixelRatio || 1, quality === 'low' ? 1.5 : 1.75) });
  const { camera, renderer } = engine;
  const model = createModel({ THREE, quality });
  const accents = Array.from({ length: MAX_BALLS }, () => createAccent({ THREE, quality }));
  const stage = new THREE.Group(), turn = new THREE.Group(), view = new THREE.Group();
  stage.scale.setScalar(SCALE);
  view.position.set(-CENTER[0], -CENTER[1], -CENTER[2]);
  stage.add(turn); turn.add(view); view.add(model.group);
  for (const a of accents) { view.add(a.group); a.group.visible = false; }
  engine.scene.add(stage);
  model.setProgress(1);
  turn.rotation.set(HERO.pitch, HERO.yaw, 0);
  stage.updateMatrixWorld(true);

  const parts = model.getParts();
  await Promise.all(accents.map(a => a.ready));
  const dress = await dressRoboCatcher({ engine, quality, view, model, balls: accents, parts });
  // the look's ground takes few occluders; the balls get their own soft shadows below
  for (const a of accents) dress.ground.remove(a.group);
  engine.adopt(stage);
  dress.setShadow(1);
  const base = Object.fromEntries(parts.map(p => [p.name, p.mesh.position.clone()]));
  const sim = createSim({ THREE, model, radius: accents[0].radius });
  const R = sim.R;

  // ---- ball shadows: a soft disc on the ground under each ball, swept away from the key, wider and fainter with height
  const shadowTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(0,0,0,1)'); grd.addColorStop(.45, 'rgba(0,0,0,.55)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const shadowGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const shadows = accents.map(() => {
    const m = new THREE.Mesh(shadowGeo, new THREE.MeshBasicMaterial({ map: shadowTex, color: 0x0a1126, transparent: true, opacity: 0, depthWrite: false }));
    m.renderOrder = -1; m.visible = false; m.userData.lookSkip = true;
    view.add(m);
    return m;
  });
  const sweep = dress.ground.uniforms.uShift.value;      // the key's push per unit of height (set by the ground each frame)
  function placeBall(i, b) {
    const A = accents[i], S = shadows[i], show = !!b.on;
    A.group.visible = show; S.visible = false;
    if (!show) return;
    A.group.position.copy(b.p);
    A.setSpin(b.q);
    const k = 1 / Math.sqrt(b.squash);
    A.mesh.scale.set(k, b.squash, k); A.ghost.scale.copy(A.mesh.scale);
    A.ghost.visible = b.xray > .01; A.ghost.material.opacity = .55 * b.xray;
    const h = b.p.y - R;
    if (h > -.01 && b.xray < .5) {
      const d = 2.6 * R * (1 + 1.5 * Math.min(h, 3));
      S.visible = true;
      S.scale.set(d, 1, d);
      S.position.set(b.p.x + sweep.x * h, .004, b.p.z + sweep.y * h);
      S.material.opacity = .5 / (1 + h / .45) * (1 - b.xray);
    }
  }

  // ---- framing
  let W = 1, H = 1, host = null, box = null, fit = [.5, 1], mode = '', shown = false, pose = HERO;
  const v3 = new THREE.Vector3(), near = new THREE.Vector3(), far = new THREE.Vector3(), inv = new THREE.Matrix4();
  // Lay the boxes `b` (model space: [x0, y0, z0, x1, y1, z1]) into the page rect (px in the canvas), seen from (yaw, pitch).
  function frameTo(p, rect) {
    turn.rotation.set(p.pitch, p.yaw, 0);
    stage.updateMatrixWorld(true);
    camera.zoom = 1; camera.clearViewOffset(); camera.updateProjectionMatrix();
    let l = Infinity, r = -Infinity, t = Infinity, b = -Infinity;
    for (const B of p.boxes) for (let i = 0; i < 8; i++) {
      v3.set(B[i & 1 ? 3 : 0], B[i & 2 ? 4 : 1], B[i & 4 ? 5 : 2]).applyMatrix4(view.matrixWorld).project(camera);
      const x = (v3.x + 1) / 2 * W, y = (1 - v3.y) / 2 * H;
      if (x < l) l = x; if (x > r) r = x; if (y < t) t = y; if (y > b) b = y;
    }
    const zoom = Math.min(rect.w / (r - l), rect.h / (b - t)) * (p.zoom || 1);
    const ax = p.align ? p.align[0] : .5, ay = p.align ? p.align[1] : .5;
    const left = rect.l + (rect.w - (r - l) * zoom) * ax, top = rect.t + (rect.h - (b - t) * zoom) * ay;
    camera.zoom = zoom;
    camera.setViewOffset(W, H, -(left - (W / 2 + (l - W / 2) * zoom)), -(top - (H / 2 + (t - H / 2) * zoom)), W, H);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    inv.copy(view.matrixWorld).invert();
  }
  // Where the machine goes, in canvas px. The rendered still is an image of STILL.aspect with the machine inside
  // STILL.pad; in the page it is fitted into the layout box (object-fit: contain, anchored at `fit`). The live machine
  // is laid into exactly that rect, so still and canvas swap without a jump. A view with `fill` uses the whole box.
  function boxRect(v) {
    const c = canvas.getBoundingClientRect(), r0 = (box || canvas).getBoundingClientRect();
    const r = { l: r0.left - c.left, t: r0.top - c.top, w: r0.width, h: r0.height };
    const k = Math.min(r.w / STILL.aspect, r.h), sw = k * STILL.aspect, sh = k, P = STILL.pad;
    const sl = r.l + (r.w - sw) * fit[0], st = r.t + (r.h - sh) * fit[1];
    const a = { l: sl + sw * P[3], t: st + sh * P[0], w: sw * (1 - P[1] - P[3]), h: sh * (1 - P[0] - P[2]) };
    const f = v.fill || 0;
    if (!f) return a;
    const m = Math.min(r.w, r.h) * .07;
    return { l: lerp(a.l, r.l + m, f), t: lerp(a.t, r.t + m, f), w: lerp(a.w, r.w - 2 * m, f), h: lerp(a.h, r.h - 2 * m, f) };
  }
  function resize() {
    if (!host) return false;
    const w = Math.round(host.clientWidth), h = Math.round(host.clientHeight);
    if (!w || !h) return false;
    if (w !== W || h !== H) { W = w; H = h; engine.size(w, h); }
    return true;
  }
  function reframe() { frameTo(pose, boxRect(pose)); }

  // page point -> a ray in the machine's space
  function rayAt(cx, cy) {
    const c = canvas.getBoundingClientRect(), nx = (cx - c.left) / c.width * 2 - 1, ny = -((cy - c.top) / c.height * 2 - 1);
    near.set(nx, ny, -1).unproject(camera).applyMatrix4(inv);
    far.set(nx, ny, 1).unproject(camera).applyMatrix4(inv);
    return { o: near, d: far.sub(near).normalize() };
  }
  function clientOf(p) {
    const c = canvas.getBoundingClientRect();
    v3.copy(p).applyMatrix4(view.matrixWorld).project(camera);
    return { x: c.left + (v3.x + 1) / 2 * c.width, y: c.top + (1 - v3.y) / 2 * c.height };
  }

  // ---- the hero: catch
  const origin = new THREE.Vector3();
  function throwFrom(cx, cy, user = null) {
    if (mode !== 'hero') return false;
    const { o, d } = rayAt(cx, cy);
    let t = (Z_THROW - o.z) / d.z;
    origin.copy(o).addScaledVector(d, t);
    if (origin.y < R + .05) { t = (R + .05 - o.y) / d.y; origin.copy(o).addScaledVector(d, t); }
    // aim where the pointer is on the net; off the net, at the nearest part of it
    const tn = (sim.restZ(0, 1) - o.z) / d.z;
    const b = sim.throwBall(origin, o.x + d.x * tn + (Math.random() - .5) * .08, o.y + d.y * tn + (Math.random() - .5) * .08, user);
    if (!b) return false;
    kick();
    return true;
  }
  sim.on = (type, b) => { if (on[type]) on[type](b, type === 'returned' ? clientOf(b.origin) : null); };

  // ---- the scroll scene: one recorded catch, scrubbed
  const covers = Object.entries(OPEN).map(([name, off]) => ({ part: model.parts[name], base: base[name], off: new THREE.Vector3(...off) }));
  function setOpen(k) { for (const c of covers) c.part.position.copy(c.base).addScaledVector(c.off, k); }
  let take = null, storyP = 0;
  const demo = { on: 1, p: new THREE.Vector3(), q: new THREE.Quaternion(), squash: 1, xray: 0 }, qb = new THREE.Quaternion();
  function sample(t) {
    const f = Math.min(take.n - 1.001, Math.max(0, t / take.dt)), i = Math.floor(f), k = f - i, j = i + 1;
    const P = take.p, Q = take.q, Nn = take.net;
    demo.p.set(lerp(P[3 * i], P[3 * j], k), lerp(P[3 * i + 1], P[3 * j + 1], k), lerp(P[3 * i + 2], P[3 * j + 2], k));
    demo.q.set(Q[4 * i], Q[4 * i + 1], Q[4 * i + 2], Q[4 * i + 3]).slerp(qb.set(Q[4 * j], Q[4 * j + 1], Q[4 * j + 2], Q[4 * j + 3]), k);
    demo.squash = lerp(take.squash[i], take.squash[j], k); demo.xray = lerp(take.xray[i], take.xray[j], k);
    model.setNetImpact(Nn[4 * i], Nn[4 * i + 1], lerp(Nn[4 * i + 2], Nn[4 * j + 2], k), lerp(Nn[4 * i + 3], Nn[4 * j + 3], k));
    model.setIndex(lerp(take.idx[i], take.idx[j], k));
    model.setSpin(lerp(take.top[i], take.top[j], k), lerp(take.bottom[i], take.bottom[j], k));
  }
  function story(p) {
    storyP = clamp01(p);
    if (mode !== 'how') return;
    if (!take) take = sim.record(new THREE.Vector3(...PITCH.from), PITCH.aim[0], PITCH.aim[1]);
    const s = storyAt(storyP, take);
    pose = s.view;
    setOpen(s.open);
    sample(s.t);
    demo.on = s.ball ? 1 : 0;
    placeBall(0, demo);
    for (let i = 1; i < MAX_BALLS; i++) placeBall(i, { on: 0 });
    reframe();
    draw();
  }

  // ---- drawing: only while shown, and in the hero only while something moves
  let raf = 0, last = 0, dirty = true;
  function draw() { if (shown) { engine.render(); dirty = false; } else dirty = true; }
  function heroFrame() {
    for (let i = 0; i < MAX_BALLS; i++) placeBall(i, sim.balls[i]);
    sim.apply();
  }
  function loop(now) {
    raf = 0;
    if (!shown || mode !== 'hero' || document.hidden) { last = 0; return; }
    const dt = last ? Math.min(.05, (now - last) / 1000) : 1 / 60;
    last = now;
    if (sim.busy || dirty) {
      if (sim.busy) sim.step(dt);
      heroFrame();
      draw();
      if (on.frame) on.frame(dt);
    }
    if (sim.busy) raf = requestAnimationFrame(loop); else last = 0;
  }
  function kick() { if (!raf && shown && mode === 'hero' && !document.hidden) raf = requestAnimationFrame(loop); }

  const ro = new ResizeObserver(() => { if (resize()) { reframe(); if (mode === 'how') story(storyP); else { heroFrame(); dirty = true; draw(); } } });
  function mount(m, hostEl, boxEl, at = [.5, 1]) {
    if (mode === m && host === hostEl) return;
    fit = at;
    if (host) ro.unobserve(host);
    if (box && box !== host) ro.unobserve(box);
    mode = m; host = hostEl; box = boxEl || hostEl;
    host.appendChild(canvas);
    ro.observe(host); if (box !== host) ro.observe(box);
    resize();
    if (m === 'hero') {
      pose = HERO;
      setOpen(0);
      sim.apply(); if (!sim.net.on) model.setNetImpact(0, 0, 0, 0);
      reframe(); heroFrame(); dirty = true; draw(); kick();
    } else story(storyP);
  }
  function show(v) {
    shown = !!v;
    if (!shown) { if (raf) cancelAnimationFrame(raf); raf = 0; last = 0; return; }
    if (mode === 'how') story(storyP); else { dirty = true; kick(); }
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && shown) { last = 0; dirty = true; kick(); } });

  return {
    mount, show, throwFrom, story, clientOf, kick,
    get mode() { return mode; }, get busy() { return sim.busy; }, get balls() { return sim.count(); },
    // for the stills and line drawings (scratch scripts) and for looking around while tuning
    debug: { engine, model, dress, sim, view, turn, stage, accents, frameTo, reframe, draw, heroFrame, placeBall, setOpen, get take() { return take; }, set pose(p) { pose = p; }, get pose() { return pose; }, base, THREE },
  };
}
