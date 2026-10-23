/* The camera director of the CHARGER field study (presentation plan items 10 and 12).

   One camera move per phase, keyed to the flight, and face on whenever an angle is read:
     empty stage     the static low three-quarter hero (camera.js HERO: 24 deg round, 6 deg up,
                     k 1.15). Reduced motion or tier 0: side.
     ignition        the existing 1200 ms move to side (liftoff follows 6 ms later).
     rail exit to    side, face on to the pitch plane, pushing in from k 1.0 to 0.8 (an ease in
     settle          and out over rail exit to settle). The aim leans 0.08 m toward the nose up to
                     the gust beat's peak and holds there while the arc shows (the nose, the
                     relative wind and the angle-of-attack arc in frame: the angle, the narrator's
                     gust caption), then moves to 0.15 m aft by settle on the site easing (the CP
                     and the fins: the push, its caption). The push is keyed to flight time,
                     not wall time: it runs at the replay's own rate, so it holds through the HOLD
                     and through a pause, and a visitor's rate pick changes its pace with the
                     flight's. Settle is the beat plan's (the wobble's end; the pitch past 60 deg
                     for a rocket that turns over; half a second past rail exit in still air).
     burnout on      ease out to k 1.6 at 8 deg elevation over 2.4 s of flight time (it starts at
                     settle when settle comes later, as for a finless rocket).
     apogee          the end plate: the camera eases back over 2400 ms (a cut under reduced
                     motion) to a face-on view of the whole path from the pad, with the other fin
                     choice's path as a ghost, the ticks RAIL EXIT, BURNOUT and APOGEE n FT SIM,
                     clear of the page's end card. It holds until the visitor acts: CONTINUE (the
                     flight runs on past apogee) returns to side, a reset returns to the hero.
   It stops directing the camera for good on any orbit or zoom (the scene's onCameraMode reports
   'free'), and the page calls release() when the visitor picks a camera. The data it draws (the
   path, the gust line, the arc, closing the plate on a reset) carries on after a release.

   The gust beat: while the armed gust's pulse acts (from rail exit for config.gustDuration,
   0.5 s of flight) the wind arrow's plate reads GUST 11.2 MPH EST, and from the gust until just
   past the peak (ARC_AFTER_PEAK_S, while the camera still leans toward the nose; the push beat
   that follows is about the fins) the scene is asked for the angle-of-attack arc. The scene
   draws the arc only face on (the side preset, settled, off the
   plate), so an angle never reads from the quarter, chase, pad or hero views, whoever asks; the
   director itself never uses those presets after the pad.

   Driven by the flight, not by timers: flight.onEvent (ignition, railExit, burnout, apogee) and
   the state the page already hands the scene every frame (scene.onFlight). The page needs no
   per-frame call. The path comes from flight.history (every 0.01 s), so a STEP or a NEXT BEAT
   that jumps seconds still draws the curve the rocket flew.

   createDirector(scene, opts) -> director
     opts.flight     the flight model (createFlight). Without it the director falls back to the
                     page's explicit calls (railExit(ms), burnout(), apogee()) and the state alone.
     opts.reduced    () => bool: reduced motion or tier 0 (no moves, side throughout, a cut to the plate)
     opts.plan       () => the beat plan of the flight in progress (story.js planFlight: kind, beats)
     opts.gustMph    () => the armed gust in mph (it fires at rail exit), 0 for none
     opts.ghost      (config, {gustMph}) => {points: [{x, y}] (flight frame m, pad to apogee),
                     finScale, apogeeFt?} | [{x, y}] | null: the same conditions with the other fin
                     choice, flown silently in this tab. Asked once per flight in idle time after
                     ignition (and at apogee if it is not back yet).
     opts.avoid      () => [Element | DOMRect]: what the plate keeps clear (the end card).
   director: active, phase, stats, release(), pad(), launch(), railExit(ms), burnout(), apogee(),
     playing(on), noteGust(mph, t, {planned}), diverge(), setGhost(points | data | null, opts),
     destroy(). */
import { finWords } from './trail.js';
import { easeSite } from './camera.js';

const M_PER_FT = 0.3048;                  // STD, exact
export const PUSH = Object.freeze({ k: 0.8, aimM: 0.15, noseAimM: -0.08 });   // rail exit to settle (EST, framing choices; negative aim is toward the nose)
export const COAST = Object.freeze({ k: 1.6, elDeg: 8, s: 2.4 });   // burnout on: k, elevation, flight seconds of the ease
const SIDE_EL_DEG = 3;                    // camera.js SIDE.el: the side preset's own elevation
const SETTLE_DEFAULT_S = 0.72;            // rail exit to settle without a plan (the default launch's, SIM)
const CALM_PUSH_S = 0.5;                  // still air: the push runs half a second of flight past rail exit (as the page's pushInMs)
const GUST_DUR_DEFAULT_S = 0.5;           // FIELD 3: one-minus-cosine pulse of 0.5 s
const CONTINUE_EPS_S = 0.02;              // flight time past apogee that means the visitor pressed CONTINUE
export const ARC_AFTER_PEAK_S = 0.08;     // the arc stays this long past the gust beat's peak (flight s; 1.6 s on screen at 1/20)
const EPS = 1e-4;
export const DIRECTOR_PHASES = Object.freeze(['pad', 'rail', 'push', 'held', 'coast', 'plate', 'past']);

const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const idle = (fn) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 1500 }) : setTimeout(fn, 60));
const cancelIdle = (h) => { if (h == null) return; if (typeof cancelIdleCallback === 'function') cancelIdleCallback(h); else clearTimeout(h); };

export function createDirector(scene, opts = {}) {
  const { flight = null, reduced = () => false, plan = () => null, gustMph = () => 0, ghost = null, avoid = null } = opts;
  const has = (k) => !!scene && typeof scene[k] === 'function';
  const call = (k, ...a) => { if (has(k)) { try { return scene[k](...a); } catch (err) { console.warn('[director]', k, err); } } return undefined; };
  const isReduced = () => { try { return !!reduced(); } catch { return false; } };

  let active = !!(scene && has('setCamera'));
  let destroyed = false;
  let phase = 'pad';
  let marks = null;                        // {railT, settleT, burnoutT, coastT, apogeeT, ticks: {}} of the flight in progress
  let gust = null;                         // {mph, t0, dur} the pulse the plate line and the arc follow
  let lastHistT = -Infinity, lastT = NaN, trailN = 0;
  let ghostData = null, ghostKey = '', ghostJob = null, diverged = false;
  let framed = { k: 1, aimM: 0, elDeg: null };   // what the director last set
  let gustShown = false, arcAsked = false;
  let padCam = '';                         // the preset pad() last set, so a repeated pad() on the same empty stage does not restart the move

  /* ---------------------------------------------------------------- the camera */
  function frame(f) {
    if (!active || isReduced()) return;
    const el = f.elDeg == null ? null : f.elDeg;
    if (Math.abs(f.k - framed.k) < EPS && Math.abs(f.aimM - framed.aimM) < EPS && (el === framed.elDeg || (el != null && framed.elDeg != null && Math.abs(el - framed.elDeg) < 1e-3))) return;
    framed = { k: f.k, aimM: f.aimM, elDeg: el };
    call('setFraming', { k: f.k, aimM: f.aimM, elDeg: el }, { animate: false });
  }
  function resetFraming() { framed = { k: 1, aimM: 0, elDeg: null }; call('setFraming', null, { animate: false }); }

  /* the plan, when it describes this flight (its rail exit matches) */
  function planHere(railT) {
    const p = (() => { try { return plan(); } catch { return null; } })();
    return p && p.beats && finite(p.beats.railExit) && Math.abs(p.beats.railExit - railT) < 0.01 ? p : null;
  }
  /* the gust beat's peak, where the aim starts to move aft: the plan's peak, else 0.2 s past rail exit */
  function peakOf(railT, settleT) {
    const p = planHere(railT);
    const pk = p && finite(p.beats.peak) ? p.beats.peak : railT + 0.2;
    return Math.max(railT, Math.min(settleT - 0.05, pk));
  }
  /* the settle the push runs to, from the plan when it describes this flight */
  function settleOf(railT) {
    const p = (() => { try { return plan(); } catch { return null; } })();
    const b = p && p.beats;
    if (b && finite(b.railExit) && Math.abs(b.railExit - railT) < 0.01) {
      if (p.kind === 'over' && finite(b.pitch60)) return Math.max(railT + 0.2, b.pitch60);
      if (p.kind === 'wobble' && finite(b.settle)) return Math.max(railT + 0.2, b.settle);
      if (p.kind === 'calm') return railT + CALM_PUSH_S;
    }
    return railT + (gustMph() > 0 ? SETTLE_DEFAULT_S : CALM_PUSH_S);
  }

  /* the framing at flight time t (keyed to the flight, so it holds through the HOLD and a pause) */
  function direct(t) {
    if (!marks || !finite(marks.railT) || t < marks.railT) return;
    const { railT, settleT, peakT } = marks;
    const u = clamp01((t - railT) / Math.max(0.05, settleT - railT));
    const s = u * u * (3 - 2 * u);                                   // the push: ease in and out (slow at both ends)
    const ub = clamp01((t - railT) / Math.max(0.05, peakT - railT));
    // the aft move waits for the arc to go (the gust beat's caption dwells about as long), then runs to settle
    const aftT = Math.max(peakT, Math.min(peakT + ARC_AFTER_PEAK_S, settleT - 0.05));
    const ua = clamp01((t - aftT) / Math.max(0.05, settleT - aftT));
    const kPush = Math.exp(Math.log(PUSH.k) * s);
    const aimNose = PUSH.noseAimM * ub * ub * (3 - 2 * ub);           // toward the nose for the angle
    const aimPush = aimNose + (PUSH.aimM - aimNose) * easeSite(ua);    // then aft for the push
    if (phase === 'push' && u >= 1) phase = 'held';
    const coastT = finite(marks.burnoutT) ? Math.max(marks.burnoutT, settleT) : Infinity;
    if (t >= coastT) {
      if (phase === 'push' || phase === 'held') phase = 'coast';
      const v = easeSite(clamp01((t - coastT) / COAST.s));
      frame({ k: Math.exp(Math.log(kPush) + (Math.log(COAST.k) - Math.log(kPush)) * v), aimM: aimPush * (1 - v), elDeg: SIDE_EL_DEG + (COAST.elDeg - SIDE_EL_DEG) * v });
    } else frame({ k: kPush, aimM: aimPush, elDeg: null });
  }

  /* ---------------------------------------------------------------- the path */
  /* append the history samples newer than the last one drawn (flight frame, the scene converts) */
  function feed(st) {
    if (!flight || !flight.history) {
      if (st && finite(st.t) && finite(st.x) && finite(st.y) && st.t >= lastHistT + 0.01) { call('setTrail', [{ x: st.x, y: st.y }], { append: true }); lastHistT = st.t; trailN++; }
      return;
    }
    const h = flight.history, n = h.length;
    if (!n) return;
    let i = n;
    while (i > 0 && h.at(i - 1).t > lastHistT + 1e-9) i--;
    if (i >= n) return;
    const pts = [];
    for (let j = i; j < n; j++) { const r = h.at(j); if (marks && finite(marks.apogeeT) && r.t > marks.apogeeT + 1e-9 && phase !== 'past') break; pts.push({ x: r.x, y: r.y }); lastHistT = r.t; }
    if (pts.length) { call('setTrail', pts, { append: true }); trailN += pts.length; }
  }
  function tickList() {
    const out = [];
    if (!marks) return out;
    for (const key of ['railExit', 'burnout', 'apogee']) { const tk = marks.ticks[key]; if (tk) out.push({ key, ...tk }); }
    return out;
  }

  /* ---------------------------------------------------------------- the ghost */
  const keyOf = (cfg, g) => (cfg ? [cfg.finScale, cfg.wind, cfg.cgFromNose, cfg.railLength, cfg.launchAngle, cfg.seed, g].map((v) => (finite(v) ? +v.toFixed(5) : String(v))).join('|') : '');
  function normalizeGhost(d) {
    if (!d) return null;
    const pts = Array.isArray(d) ? d : d.points;
    if (!Array.isArray(pts) || pts.length < 2) return null;
    const fin = Array.isArray(d) ? NaN : +d.finScale;
    let y0 = NaN, yMax = -Infinity;
    for (const p of pts) { const y = Array.isArray(p) ? p[1] : p && p.y; if (finite(y)) { if (!finite(y0)) y0 = y; if (y > yMax) yMax = y; } }
    let apex = null;
    for (const p of pts) { const y = Array.isArray(p) ? p[1] : p && p.y; if (y === yMax) { apex = { x: Array.isArray(p) ? p[0] : p.x, y }; break; } }
    const ft = finite(d.apogeeFt) ? d.apogeeFt : (finite(y0) && finite(yMax) ? (yMax - y0) / M_PER_FT : NaN);
    return { points: pts, finScale: fin, apogeeFt: ft, apex };
  }
  function askGhost(sync = false) {
    if (typeof ghost !== 'function' || !flight) return;
    const cfg = flight.config, g = +gustMph() || 0, key = keyOf(cfg, g);
    if (ghostData && ghostKey === key) return;
    const run = () => {
      ghostJob = null;
      if (destroyed) return;
      try { const d = normalizeGhost(ghost({ ...cfg }, { gustMph: g })); if (d) { ghostData = d; ghostKey = key; } }
      catch (err) { console.warn('[director] the ghost flight failed', err); }
    };
    if (sync) { cancelIdle(ghostJob); run(); } else if (!ghostJob) ghostJob = idle(run);
  }
  function showGhost() {
    const here = flight ? keyOf(flight.config, +gustMph() || 0) : ghostKey;
    if (diverged || !ghostData || ghostKey !== here) { call('setGhostTrail', null, { ticks: [] }); return false; }
    const d = ghostData, fin = finite(d.finScale) ? d.finScale : (flight && flight.config.finScale > 0 ? 0 : 1);
    const ticks = d.apex && finite(d.apogeeFt) ? [{ key: 'apogee', x: d.apex.x, y: d.apex.y, ft: d.apogeeFt, tag: 'SIM' }] : [];
    call('setGhostTrail', d.points, { finScale: fin, name: finWords(fin), ticks });
    return true;
  }

  /* ---------------------------------------------------------------- phases */
  function pad() {
    const fresh = phase !== 'pad' || !!marks;
    phase = 'pad'; marks = null; gust = null; lastHistT = -Infinity; lastT = NaN; trailN = 0; diverged = false;
    cancelIdle(ghostJob); ghostJob = null;
    setGustLine(false); askArc(false);
    call('setTrail', null, { ticks: [], live: false });
    call('setGhostTrail', null, { ticks: [] });
    call('setPlate', null);                                   // the plate always closes on a reset, directed or not
    if (!active) return;
    const want = isReduced() ? 'side' : 'hero';
    if (!fresh && padCam === want) return;
    padCam = want;
    resetFraming();
    call('setCamera', want);
  }
  function begin() {
    if (phase !== 'pad' && marks) return;
    phase = 'rail';
    marks = { railT: NaN, settleT: NaN, peakT: NaN, burnoutT: NaN, apogeeT: NaN, ticks: {} };
    gust = null; lastHistT = -Infinity; trailN = 0; diverged = false;
    const fin = flight ? flight.config.finScale : 1;
    call('setTrail', null, { ticks: [], finScale: fin, name: finWords(fin), live: true });
    call('setGhostTrail', null, { ticks: [] });
    call('setPlate', null);
    askGhost(false);
    padCam = '';
    if (!active) return;
    resetFraming();
    call('setCamera', 'side');
  }
  function onRailExit(t, st) {
    if (!marks) begin();
    marks.railT = t;
    marks.settleT = settleOf(t);
    marks.peakT = peakOf(t, marks.settleT);
    if (st && finite(st.x) && finite(st.y)) marks.ticks.railExit = { x: st.x, y: st.y };
    const g = +gustMph() || 0;
    if (g > 0) gust = { mph: g, t0: t, dur: flight && finite(flight.config.gustDuration) ? flight.config.gustDuration : GUST_DUR_DEFAULT_S, planned: true };
    phase = 'push';
    call('setTrail', undefined, { ticks: tickList() });
  }
  function onBurnout(t, st) {
    if (!marks) return;
    marks.burnoutT = t;
    if (st && finite(st.x) && finite(st.y)) marks.ticks.burnout = { x: st.x, y: st.y };
    call('setTrail', undefined, { ticks: tickList() });
  }
  function toPlate(t, st) {
    if (!marks) begin();
    marks.apogeeT = finite(t) ? t : (st && finite(st.t) ? st.t : NaN);
    feed(st);
    if (st && finite(st.x) && finite(st.y)) {
      call('setTrail', [{ x: st.x, y: st.y }], { append: true });
      const ft = finite(st.apogee) ? st.apogee / M_PER_FT : (finite(st.altitude) ? st.altitude / M_PER_FT : NaN);
      marks.ticks.apogee = { x: st.x, y: st.y, ft, tag: 'SIM' };
    }
    call('setTrailLive', false);
    call('setTrail', undefined, { ticks: tickList() });
    setGustLine(false); askArc(false);
    phase = 'plate';
    // a camera the visitor took keeps its view: no plate, and no ghost path drawn into that view without one
    if (!active) { call('setGhostTrail', null, { ticks: [] }); return; }
    askGhost(true);                                           // the cached ghost if it is this configuration's, else fly it now
    showGhost();
    call('setPlate', 'trails', { avoid: typeof avoid === 'function' ? avoid : null, animate: !isReduced() });
  }
  function leavePlate() {
    phase = 'past';
    call('setGhostTrail', null, { ticks: [] });
    call('setTrailLive', true);
    call('setPlate', null);
  }

  /* the gust beat: the plate line while the pulse acts, the arc asked for with it */
  function setGustLine(on) { if (on === gustShown) return; gustShown = on; call('setGust', on && gust ? { mph: gust.mph, tag: 'EST' } : null); }
  function askArc(on) { if (on === arcAsked) return; arcAsked = on; call('setAoaArc', on); }

  /* ---------------------------------------------------------------- inputs */
  function onEvent(e) {
    if (destroyed || !e) return;
    switch (e.name) {
      case 'ignition': if (phase !== 'pad' || marks) pad(); begin(); break;   // always a new flight (a REPLAY may skip the pad state)
      case 'railExit': onRailExit(e.t, e.state); break;
      case 'burnout': onBurnout(e.t, e.state); break;
      case 'apogee': toPlate(e.t, e.state); break;
      default: break;
    }
  }
  function onState(st) {
    if (destroyed || !st) return;
    const ign = flight ? !!flight.ignited : st.phase !== 'pad';
    if (!ign && st.phase === 'pad' && (!finite(st.t) || st.t <= 1e-9)) { if (phase !== 'pad' || marks) pad(); lastT = NaN; return; }
    if (ign && phase === 'pad') begin();
    const t = st.t;
    if (finite(lastT) && finite(t) && t + 1e-9 < lastT) { pad(); begin(); }   // time went back without a pad state: a fresh flight
    lastT = t;
    // a director created mid-flight catches up on the events it missed
    if (flight && marks) {
      if (!finite(marks.railT)) { const ev = flight.events.find((x) => x.name === 'railExit'); if (ev) onRailExit(ev.t, ev.state); }
      if (!finite(marks.burnoutT)) { const ev = flight.events.find((x) => x.name === 'burnout'); if (ev) onBurnout(ev.t, ev.state); }
    }
    if (phase === 'plate') {
      if (finite(marks.apogeeT) && t > marks.apogeeT + CONTINUE_EPS_S) leavePlate();
      else {
        // the page stops on its first 5 ms grid step at or after the apogee event: end the path and put the
        // APOGEE tick on that state, the one the end card and the run cards read (and where the rocket is)
        if (!marks.apexFixed && finite(st.x) && finite(st.y) && finite(st.apogee)) {
          marks.apexFixed = true;
          call('setTrail', [{ x: st.x, y: st.y }], { append: true });
          marks.ticks.apogee = { x: st.x, y: st.y, ft: st.apogee / M_PER_FT, tag: 'SIM' };
          call('setTrail', undefined, { ticks: tickList() });
        }
        return;
      }
    }
    if (phase !== 'plate') feed(st);
    if (phase === 'past') return;
    // the gust beat
    const acting = !!gust && t > gust.t0 && t < gust.t0 + gust.dur;
    setGustLine(acting);
    // the arc: the planned gust's beat runs to just past the peak; a visitor's gust (noteGust) for its pulse
    const arcEnd = gust ? (gust.planned && marks && finite(marks.peakT) ? Math.min(gust.t0 + gust.dur, marks.peakT + ARC_AFTER_PEAK_S) : gust.t0 + gust.dur) : -Infinity;
    askArc(acting && t < arcEnd && (phase === 'push' || phase === 'held' || phase === 'coast'));
    if (flight && finite(st.apogee) && phase !== 'plate' && phase !== 'past' && marks && !finite(marks.apogeeT)) { toPlate(st.t, st); return; }
    direct(t);
  }

  const offEvent = flight && typeof flight.onEvent === 'function' ? flight.onEvent(onEvent) : () => {};
  const offState = has('onFlight') ? scene.onFlight(onState) : () => {};
  const offCam = has('onCameraMode') ? scene.onCameraMode((e) => { if (e && e.mode === 'free') active = false; }) : () => {};

  // start where the flight is
  if (!flight || !flight.ignited) pad();
  else { begin(); onState(flight.state); }

  return {
    get active() { return active; },
    get phase() { return phase; },
    get stats() {
      return {
        active, phase, reduced: isReduced(),
        marks: marks ? { railT: marks.railT, peakT: marks.peakT, settleT: marks.settleT, burnoutT: marks.burnoutT, apogeeT: marks.apogeeT, ticks: tickList() } : null,
        gust: gust ? { ...gust, acting: gustShown } : null, arcAsked,
        trail: trailN, ghost: ghostData ? { points: ghostData.points.length, finScale: ghostData.finScale, apogeeFt: ghostData.apogeeFt, shown: phase === 'plate' && !diverged } : null,
        diverged, framed: { ...framed },
      };
    },
    /* what the plate shows, for the page's caption: the flight's and the ghost's fin scales and apogees (ft,
       SIM); null whenever the plate is not on the stage (before apogee, after CONTINUE, or a camera the
       visitor took before apogee), so the caption never names paths the stage does not show */
    get plate() {
      if (phase !== 'plate' || !marks) return null;
      if (scene && 'plate' in scene && !scene.plate) return null;
      const a = marks.ticks.apogee;
      return {
        main: { finScale: flight ? flight.config.finScale : NaN, apogeeFt: a ? a.ft : NaN },
        ghost: ghostData && !diverged ? { finScale: ghostData.finScale, apogeeFt: ghostData.apogeeFt } : null,
        gustMph: +gustMph() || 0, windMps: flight ? flight.config.wind : NaN,
      };
    },
    /* the visitor took the camera (a preset in the panel): stop moving it, for good */
    release() { active = false; },
    /* explicit calls (the page's existing ones; with opts.flight they are covered by the events) */
    pad() { pad(); },
    launch() { if (phase === 'pad' || !marks) begin(); },
    railExit(ms) {
      if (flight || !active || isReduced()) return;
      call('setFraming', { k: PUSH.k, aimM: PUSH.aimM }, { ms: Math.max(600, ms || 6000), ease: 'linear' });
    },
    burnout() { if (flight || !active || isReduced()) return; call('setFraming', { k: COAST.k, aimM: 0, elDeg: COAST.elDeg }, { ms: COAST.s * 1000 }); },
    apogee() { if (phase !== 'plate') toPlate(flight ? flight.state.t : NaN, flight ? flight.state : null); },
    /* the slice dissolve follows the replay whether or not the camera is still directed */
    playing(on) { call('setDissolve', !!on); },
    /* a gust fired at flight time t: planned (the armed one) or the visitor's (the flight then leaves
       the plan, and the plate shows no ghost: its conditions are no longer this flight's) */
    noteGust(mph, t, { planned = false } = {}) {
      if (!(mph > 0)) return;
      const tt = finite(t) ? t : (flight ? flight.state.t : NaN);
      gust = { mph: +mph, t0: tt, dur: flight && finite(flight.config.gustDuration) ? flight.config.gustDuration : GUST_DUR_DEFAULT_S, planned: !!planned };
      if (!planned) diverged = true;
    },
    /* the flight left its plan (a flick, a setting changed mid-flight): no ghost on this plate */
    diverge() { diverged = true; },
    /* hand the ghost in directly (instead of opts.ghost): points or {points, finScale, apogeeFt}; null clears */
    setGhost(d, o = {}) { ghostData = normalizeGhost(d && !Array.isArray(d) ? d : { points: d, ...o }); ghostKey = flight ? keyOf(flight.config, +gustMph() || 0) : ''; if (phase === 'plate' && (!scene || !('plate' in scene) || scene.plate)) showGhost(); return !!ghostData; },
    destroy() {
      if (destroyed) return;
      destroyed = true; active = false;
      cancelIdle(ghostJob); ghostJob = null;
      offEvent(); offState(); offCam();
    },
  };
}

export default createDirector;
