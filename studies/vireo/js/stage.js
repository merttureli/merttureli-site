// Vireo stage: drives the one rig (rig.js) from the scroll and from the "Look closer" list.
//
// The same canvas serves two places, never both at once: the sticky stage behind the hero, the statement and the
// pinned "Inside" scene (pose = a function of the scroll, poses.js FILM), and the view in "Look closer" (pose
// eased toward the picked part, the rest ghosted). It is moved between them while neither is on screen.
// Frames are drawn only while something moves, the place is on screen and the tab is visible.
import { createRig, containRect, FRAME } from './rig.js';
import { createGovernor } from '../../../next/js/showreel/engine.js';
import { FILM, CLOSER, TURN_FROM, poseAt } from './poses.js';

const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const TAU = Math.PI * 2;

export async function mount(api) {
  const { reduced, stage, canvas, poster, film, statement, inside, pin, chip, closerView, closer, setInsideUI } = api;
  const portQ = matchMedia('(max-aspect-ratio: 68/100)'), phoneQ = matchMedia('(max-width: 760px)');
  const quality = (innerWidth < 760 || (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4) ? 'low' : 'high';
  const rig = await createRig({ canvas, quality });
  const S = rig.state;
  // the site's own frame-time governor: steps the pixel ratio down when the median frame is slow (off under automation)
  const gov = createGovernor(rig.renderer);
  await api.sweepDone;

  let host = null, raf = 0, last = 0, shown = false;
  // the hero's frame: fitted between the bar and the hero copy (vireo.js heroFit, the same transform as the poster);
  // it eases back to the plain frame as the rocket turns to stand at the side
  // On a short screen the pinned scene's frame stops above its words, which sit under the model there.
  let base = { x: 0, y: 0, w: 1, h: 1 }, low = base, fit = { s: 1, dx: 0, dy: 0 }, fitK = '';
  const fitFrame = (k, j) => {
    const sig = k.toFixed(4) + j.toFixed(4);
    if (sig === fitK) return;
    fitK = sig;
    const s = 1 + (fit.s - 1) * k, dx = fit.dx * k, dy = fit.dy * k, R = { x: base.x * s + dx, y: base.y * s + dy, w: base.w * s, h: base.h * s };
    for (const key of ['x', 'y', 'w', 'h']) R[key] += (low[key] - R[key]) * j;
    rig.setFrame(R);
  };
  const ks = u => [1 - smooth(0.24, 0.62, u), smooth(1.75, 2.0, u)];
  // ---- the film (stage)
  let uCur = 0, uGoal = 0, yA = 1, yIn0 = 2, yIn1 = 3, rollIdle = 0, rollOn = false;
  let turn = 0, turnVel = 0, leanOff = 0, dragging = false;
  const pose = {};
  // ---- look closer
  const cur = {}, CK = ['tilt', 'lean', 'roll', 'station', 'ox', 'oy'];
  let goal = null;

  function measure() {
    if (host === 'stage') {
      const W = stage.clientWidth, H = stage.clientHeight, port = portQ.matches;
      rig.size(W, H, FRAME[port ? 'port' : 'land']);
      base = containRect(W, H, FRAME[port ? 'port' : 'land'], { ay: port ? 0 : 0.5 });
      low = H < 560 ? containRect(W, H - 120, FRAME[port ? 'port' : 'land'], { ay: 0 }) : base;
      fit = api.heroFit ? api.heroFit() : fit; fitK = '';
      fitFrame(...ks(uCur));
      yA = H * 0.55;
      yIn0 = inside.offsetTop; yIn1 = inside.offsetTop + inside.offsetHeight - H;
    } else if (host === 'closer') {
      const W = closerView.clientWidth, H = closerView.clientHeight, a = FRAME[phoneQ.matches ? 'closerPort' : 'closerLand'];
      rig.size(W, H, a);
      rig.setFrame(containRect(W, H, a));
    }
  }
  const filmU = () => {
    const y = scrollY - film.offsetTop;
    if (y <= yA) return Math.max(0, y / yA);
    if (y <= yIn0) return 1 + (y - yA) / (yIn0 - yA);
    return 2 + clamp01((y - yIn0) / Math.max(1, yIn1 - yIn0));
  };
  const vis = el => { const r = el.getBoundingClientRect(), h = innerHeight; return { v: Math.max(0, Math.min(r.bottom, h) - Math.max(r.top, 0)), top: r.top, bottom: r.bottom }; };
  function chooseHost() {
    const c = vis(closerView);
    if (reduced) return 'closer';
    const f = vis(film);
    if (f.v > 0 && f.v >= c.v) return 'stage';
    if (c.v > 0) return 'closer';
    return -f.bottom < c.top - innerHeight ? 'stage' : 'closer';     // neither on screen: wait at the nearer one
  }
  const onScreen = () => (host === 'stage' ? vis(film).v > 0 : host === 'closer' ? vis(closerView).v > 0 : false);

  function setHost(h) {
    if (h === host) return;
    stage.classList.remove('is-live'); closerView.classList.remove('is-live');
    host = h; shown = false;
    if (h === 'stage') {
      stage.append(canvas);
      rig.setGrade('dark');
      rig.setGhost(null); rig.snapOpacity();
      measure();
      uCur = uGoal = filmU();
    } else {
      closerView.append(canvas);
      rig.setGrade('light');
      S.explode = 0; S.pull = 0; S.side = 0; S.turn = 0;
      measure();
      pick(closer.current, true);
      rig.warmGhosts();
    }
  }

  // ---- one frame of the film: the pose for the (smoothed) scroll position
  function stepStage(dt) {
    uGoal = filmU();
    const d = uGoal - uCur;
    uCur = Math.abs(d) < 0.0004 ? uGoal : uCur + d * (1 - Math.exp(-dt * 9));
    poseAt(FILM[portQ.matches ? 'port' : 'land'], uCur, pose);
    // the slow roll of the first screens; it comes to rest on a whole turn as the pinned scene takes the roll over
    const idle = rollOn ? 1 - smooth(1.9, 2.05, uCur) : 0;
    rollIdle += 0.13 * Math.min(dt, 0.1) * idle;
    const rest = Math.round(rollIdle / TAU) * TAU, rollNow = rollIdle + (rest - rollIdle) * smooth(1.95, 2.14, uCur);
    // turned by hand at the end of the scene
    const p = uCur - 2, w = smooth(TURN_FROM - 0.06, TURN_FROM, p);
    if (!dragging) { turn += turnVel * dt; turnVel *= Math.exp(-dt * 3.2); if (Math.abs(turnVel) < 0.002) turnVel = 0; }
    if (w <= 0 && (turn || leanOff)) { turn = 0; leanOff = 0; turnVel = 0; }
    S.tilt = pose.tilt; S.lean = pose.lean + leanOff * w; S.roll = pose.roll + rollNow; S.turn = turn * w;
    S.station = pose.station; S.dist = pose.dist; S.ox = pose.ox; S.oy = pose.oy; S.explode = pose.explode; S.pull = pose.pull; S.side = pose.side;
    fitFrame(...ks(uCur));
    stage.classList.toggle('in-pin', uCur > 1.9);       // on a phone or a short screen the model fades out above the words (CSS)
    setInsideUI(clamp01(p));
    return uCur !== uGoal || idle > 0 || dragging || turnVel !== 0;
  }

  // ---- look closer: ease toward the picked part
  function pick(key, snap = false) {
    const c = CLOSER[key] || CLOSER.whole;
    goal = c[phoneQ.matches ? 'port' : 'land'];
    rig.setGhost(c.ids);
    if (snap || reduced || cur.dist === undefined) { for (const k of CK) cur[k] = goal[k]; cur.dist = goal.dist; rig.snapOpacity(); }
    invalidate();
  }
  function stepCloser(dt) {
    const k = 1 - Math.exp(-dt * 3.6);
    let moving = false;
    for (const key of CK) { const d = goal[key] - cur[key]; if (Math.abs(d) > 0.0008) { cur[key] += d * k; moving = true; } else cur[key] = goal[key]; }
    const dl = Math.log(goal.dist) - Math.log(cur.dist);
    if (Math.abs(dl) > 0.0008) { cur.dist = Math.exp(Math.log(cur.dist) + dl * k); moving = true; } else cur.dist = goal.dist;
    if (rig.stepOpacity(1 - Math.exp(-dt * 6))) moving = true;
    S.tilt = cur.tilt; S.lean = cur.lean; S.roll = cur.roll; S.station = cur.station; S.dist = cur.dist; S.ox = cur.ox; S.oy = cur.oy; S.explode = 0; S.pull = 0; S.side = 0; S.turn = 0;
    return moving;
  }

  function frame(now) {
    raf = 0;
    if (document.hidden || !host) return;
    // the real frame time (capped at a quarter second), so a slow machine gets fewer frames, not slow motion
    const dt = last ? Math.min(0.25, (now - last) / 1000) : 1 / 60;
    if (last) gov.sample(now - last);
    last = now;
    const moving = host === 'stage' ? stepStage(dt) : stepCloser(dt);
    rig.render();
    if (!shown) { shown = true; requestAnimationFrame(() => (host === 'stage' ? stage : closerView).classList.add('is-live')); }
    if (moving && onScreen()) raf = requestAnimationFrame(frame); else last = 0;
  }
  function invalidate() { if (!raf && !document.hidden && host) raf = requestAnimationFrame(frame); }

  // ---- wiring
  const sync = () => { const h = chooseHost(); if (h !== host) { setHost(h); invalidate(); } else if (onScreen() || !shown) invalidate(); };
  api.onScroll.add(sync);
  api.onResize.add(() => { measure(); if (host === 'closer') pick(closer.current, true); invalidate(); });
  document.addEventListener('visibilitychange', invalidate);
  closer.onChange(key => { if (host === 'closer') pick(key); });
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); stage.classList.remove('is-live'); closerView.classList.remove('is-live'); poster.style.visibility = ''; });
  canvas.addEventListener('webglcontextrestored', () => { shown = false; invalidate(); });

  // turning the model by hand at the end of the pinned scene: drag, or the arrow keys on the chip
  if (!reduced) {
    let px = 0, py = 0, pt = 0, id = null;
    pin.addEventListener('pointerdown', e => {
      if (!pin.classList.contains('can-turn') || !e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
      if (e.target.closest('button')) return;           // the chip turns the model a quarter on a press, not a drag
      dragging = true; id = e.pointerId; px = e.clientX; py = e.clientY; pt = performance.now(); turnVel = 0;
      pin.setPointerCapture(id); pin.classList.add('is-turning'); invalidate();
    });
    pin.addEventListener('pointermove', e => {
      if (!dragging || e.pointerId !== id) return;
      const now = performance.now(), dx = e.clientX - px, dy = e.clientY - py, dtm = Math.max(1, now - pt) / 1000;
      turn += dx * 0.0085; leanOff = Math.max(-0.55, Math.min(0.55, leanOff + dy * 0.004));
      turnVel = turnVel * 0.6 + (dx * 0.0085 / dtm) * 0.4;
      px = e.clientX; py = e.clientY; pt = now; invalidate();
    });
    const end = e => { if (!dragging || e.pointerId !== id) return; dragging = false; id = null; pin.classList.remove('is-turning'); turnVel = Math.max(-6, Math.min(6, turnVel)); invalidate(); };
    pin.addEventListener('pointerup', end); pin.addEventListener('pointercancel', end);
    // a press on the chip (pointer, Enter or Space) turns the model a quarter
    chip.addEventListener('click', () => { if (!pin.classList.contains('can-turn')) return; turnVel += (Math.PI / 2) * 3.2; invalidate(); });
    chip.addEventListener('keydown', e => {
      const step = { ArrowLeft: [-1.6, 0], ArrowRight: [1.6, 0], ArrowUp: [0, -0.12], ArrowDown: [0, 0.12] }[e.key];
      if (!step) return;
      e.preventDefault(); turnVel += step[0]; leanOff = Math.max(-0.55, Math.min(0.55, leanOff + step[1])); invalidate();
    });
  }

  // ---- go live
  setHost(chooseHost());
  if (host === 'stage') {
    api.live();
    // the still stays under the canvas while it fades in over it, then goes; only then does the roll start
    setTimeout(() => { poster.style.visibility = 'hidden'; rollOn = true; invalidate(); }, 750);
    const idleCb = window.requestIdleCallback || (f => setTimeout(f, 600));
    setTimeout(() => idleCb(() => rig.warmGhosts()), 2500);
  } else { api.live(); poster.style.visibility = reduced ? '' : 'hidden'; rollOn = true; }
  invalidate();
  window.__vireo = { rig, get host() { return host; }, get u() { return uCur; }, invalidate };
  return rig;
}
