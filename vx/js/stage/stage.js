/* CHARGER stage: the live three.js rocket of the vx page.
   Pad view (the hero), a scroll-driven descent through the real assembly
   station by station while the stack explodes, and a final pull-out facing the
   exploded stack. Renders strictly on demand: a frame is drawn only when the
   progress moved by more than 1e-4, the tier changed, the pointer moved in the
   pad view, a goto animation is running, the canvas was resized or the WebGL
   context came back. In the pad view at tier 2 or better a 100 ms timer
   advances the idle yaw one step per draw, and a requestAnimationFrame chain
   runs only while the pointer parallax is still easing or a goto flies or
   releases; both stop themselves otherwise. Shader programs are linked while the
   geometry builds (renderer.compileAsync, bounded), so the first frame only draws.
   Public API: ARCHITECTURE.md section 4. Events: stage:ready, stage:render,
   stage:station, and assets:geometry when the stage fetched the geometry itself. */
import * as THREE from 'three';
import { bus } from '../core/bus.js';
import { FRONT_ANGLE } from '../../../assets/charger-explorer/livery.js';
import { loadGeometry, loadManifest, describeParts, buildScene, disposeScene } from './loader.js';
import { STATIONS, stationsOfParts, TUBE_IDS } from '../data/stations.js';
import { explodeAt, displacement, appearance } from './explode.js';
import { buildPath, cameraPosition, fitBox, FOV_DEG, SCHEDULE } from './path.js';

const DEG = Math.PI / 180;
const YAW_RATE = 0.2 * DEG;        // rad/s, idle yaw in the pad view (0.2 deg/s)
const YAW_RESUME_MS = 1500;        // the yaw pauses this long after the last pointer move
const YAW_STEP_MS = 100;           // the idle yaw advances once per step (0.02 deg at 0.2 deg/s), one draw per step
const PARALLAX = 4 * DEG;          // +-4 deg of pointer parallax on both axes
const PARALLAX_TAU_MS = 110;       // one-pole ease of the parallax toward the pointer
const DEBOUNCE_MS = 120;           // tier 0 and 1 render this long after the last progress change
const GOTO_MS = 1150;              // default goto duration, as the explorer's focus motion
const GOTO_MARGIN = 1.42;          // fit margin when framing one part, as the explorer
const RELEASE_SPAN = 0.02;         // progress span over which a goto pose blends back to the path
const RELEASE_MS = 480;            // and the time it takes without a scroll (tier 0: at once)
const BODY_RADIUS_M = 0.034;       // body tube radius, for the silhouette capsule
const NEAR_MIN = 0.00005, NEAR_MAX = 0.02; // near plane bounds (metres), recomputed per frame as the explorer does
const COMPILE_WAIT_MS = 3000;      // longest the build waits for the driver to finish linking before the first draw
const MODES = ['solid', 'edges', 'wire'];

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function smoothstep(a, b, x) { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
function easeInOut(t) { t = clamp(t, 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); }
/* DPR policy per tier (ARCHITECTURE.md section 2). */
export function dprForTier(tier) { const d = devicePixelRatio || 1; return tier >= 3 ? Math.min(d, 2) : tier === 2 ? Math.min(d, 1.5) : 1; }

function makePose() { return { target: new THREE.Vector3(), distance: 1, azimuth: 0, elevation: 0, padWeight: 0 }; }
function copyPose(from, to) { to.target.copy(from.target); to.distance = from.distance; to.azimuth = from.azimuth; to.elevation = from.elevation; to.padWeight = from.padWeight; return to; }
function lerpPose(a, b, k, out) {
  out.target.lerpVectors(a.target, b.target, k);
  out.distance = a.distance + (b.distance - a.distance) * k;
  out.azimuth = a.azimuth + (b.azimuth - a.azimuth) * k;
  out.elevation = a.elevation + (b.elevation - a.elevation) * k;
  out.padWeight = a.padWeight + (b.padWeight - a.padWeight) * k;
  return out;
}

export async function createStage({ canvas, geometry, tier = 3 } = {}) {
  if (!canvas) throw new Error('createStage needs a canvas');
  const stations = STATIONS.map(s => ({ ...s, partIds: [...s.partIds] }));
  const stationsOf = stationsOfParts(stations);

  // ---- state -------------------------------------------------------------
  let renderer = null, scene = null, root = null, camera = null;
  let entries = [], byId = new Map(), parts = [], path = null, built = false, destroyed = false;
  let progress = 0, explodeOverride = null, mode = 'solid';
  tier = clamp(tier | 0, 0, 3);
  let width = 0, height = 0, dpr = 1;
  let pageVisible = true, onScreen = true, contextLost = false;
  let frame = 0, loopId = 0, loopLast = 0, debounceTimer = 0, yawTimer = 0, yawLast = 0;
  const pending = new Set();             // reasons collected since the last draw, joined into stage:render.reason
  const aborter = new AbortController(); // cancels an in-flight geometry fetch on destroy()
  let yaw = 0, lastPointerAt = -1e9;
  const pointerTarget = { x: 0, y: 0 }, parallax = { x: 0, y: 0 };
  let parallaxMoving = false;
  let gotoState = null;           // { phase: 'fly'|'hold'|'release', id, from, to, start, duration, p0, resolve }
  let focusWeight = 0;            // 1 while a goto holds its part in view, fading out over the release blend
  let lastStation = -2, renders = 0;
  const info = { calls: 0, triangles: 0, ms: 0 };
  const displayed = makePose();   // pose of the last draw (absolute azimuth)
  const basePose = makePose(), scratchPose = makePose();
  const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpV3 = new THREE.Vector3(), tmpV4 = new THREE.Vector3(), tmpBox = new THREE.Box3();
  const disp = [0, 0, 0];
  let weights = new Float64Array(stations.length);
  let lastRender = null;
  let ro = null, io = null;

  // ---- renderer ----------------------------------------------------------
  let gl = null;
  try {
    gl = canvas.getContext('webgl2', { alpha: true, antialias: true, depth: true, stencil: false, premultipliedAlpha: true, preserveDrawingBuffer: false, powerPreference: 'low-power' });
  } catch { gl = null; }
  const fallback = !gl;
  if (!fallback) {
    renderer = new THREE.WebGLRenderer({ canvas, context: gl, antialias: true, alpha: true, powerPreference: 'low-power' });
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.info.autoReset = true;
    scene = new THREE.Scene();
    root = new THREE.Group(); scene.add(root);
    camera = new THREE.PerspectiveCamera(FOV_DEG, 1, NEAR_MAX, 20);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x777777, 2.6));
    for (const [position, power] of [[[3, 4, 5], 3.5], [[-3, 0, -2], 2]]) {
      const light = new THREE.DirectionalLight(0xffffff, power); light.position.set(...position); scene.add(light);
    }
    dpr = dprForTier(tier);
    renderer.setPixelRatio(dpr);
  }

  // ---- helpers -----------------------------------------------------------
  const canDraw = () => built && !fallback && !destroyed && pageVisible && onScreen && !contextLost && !document.hidden && width > 0 && height > 0;
  const inPad = () => !gotoState && progress < SCHEDULE.firstStop;
  const explodeOf = () => (explodeOverride == null ? explodeAt : () => explodeOverride);
  const currentExplode = () => (explodeOverride == null ? explodeAt(progress) : explodeOverride);

  function rebuildPath() {
    if (!parts.length) return;
    path = buildPath({ parts, stations, aspect: width && height ? width / height : 1.6, explodeOf: explodeOf(), frontAngle: FRONT_ANGLE });
  }
  function cancelFrame() { if (frame) { cancelAnimationFrame(frame); frame = 0; } }
  function cancelLoop() { if (loopId) { cancelAnimationFrame(loopId); loopId = 0; } clearTimeout(yawTimer); yawTimer = 0; }
  function invalidate(reason) {
    pending.add(reason);
    if (!canDraw() || frame) return;
    frame = requestAnimationFrame(draw);
  }
  function debounced(reason) {
    pending.add(reason);
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => { debounceTimer = 0; if (canDraw() && !frame) frame = requestAnimationFrame(draw); }, DEBOUNCE_MS);
  }

  // ---- pose --------------------------------------------------------------
  /* The pose to draw now: the path pose with the pad offsets (idle yaw and
     parallax fade out with padWeight over the fly-in), or a goto override. */
  function computePose(now, out) {
    path.poseAt(progress, basePose);
    basePose.azimuth += FRONT_ANGLE + basePose.padWeight * (yaw + parallax.x * PARALLAX);
    basePose.elevation += basePose.padWeight * (-parallax.y * PARALLAX);
    if (!gotoState) { focusWeight = 0; return copyPose(basePose, out); }
    const g = gotoState;
    if (g.phase === 'fly') {
      const k = g.duration > 0 ? easeInOut((now - g.start) / g.duration) : 1;
      lerpPose(g.from, g.to, k, out);
      focusWeight = k;
      if (k >= 1) { g.phase = 'hold'; const r = g.resolve; g.resolve = null; r?.(true); }
      return out;
    }
    if (g.phase === 'hold') { focusWeight = 1; return copyPose(g.to, out); }
    // release: blend the held pose back onto the path over RELEASE_MS, or sooner as the visitor
    // scrolls on; the scroll term keeps its furthest excursion so the blend never runs backwards
    const tb = g.duration > 0 ? easeInOut((now - g.start) / g.duration) : 1;
    g.maxDelta = Math.max(g.maxDelta, Math.abs(progress - g.p0));
    const rb = Math.max(tb, smoothstep(0, RELEASE_SPAN, g.maxDelta));
    lerpPose(g.from, basePose, rb, out);
    focusWeight = 1 - rb;
    if (rb >= 1) { gotoState = null; focusWeight = 0; }
    return out;
  }

  // ---- draw --------------------------------------------------------------
  function draw(now = performance.now()) {
    frame = 0;
    if (!canDraw()) return;
    const reason = pending.size ? [...pending].join('+') : 'render'; pending.clear();
    const hadGoto = !!gotoState;
    const t0 = performance.now();
    const pose = computePose(now, scratchPose);
    copyPose(pose, displayed);

    // explode: group positions per the explorer's displacement
    const e = currentExplode();
    for (const en of entries) {
      if (en.part.referenceOnly) continue;
      displacement(en.part, e, en.part.center, disp);
      en.group.position.set(disp[0], disp[1], disp[2]);
    }

    // appearance: the opacity schedule crossfaded between stations
    const descent = path.descentWeight(progress);
    path.weights(progress, weights);
    const si = path.stationAt(progress);
    const nearest = si >= 0 ? stations[si] : null;
    const focusId = gotoState ? gotoState.id : -1;
    for (const en of entries) {
      const a = appearance(en.part, { weights, stationsOf, nearest, descent });
      if (en.part.id === focusId && focusWeight > 0) {
        // the goto target is the subject while it is held, whatever the schedule says
        a.opacity = Math.max(a.opacity, focusWeight);
        a.active = Math.max(a.active, focusWeight);
        a.edgesOnly = a.edgesOnly && focusWeight < 0.5;
      }
      applyAppearance(en, a);
    }

    // camera
    cameraPosition(pose, 0, camera.position);
    camera.lookAt(pose.target);
    // Keep depth precision at assembly scale without clipping close component views (as app.js).
    const near = Math.max(NEAR_MIN, Math.min(NEAR_MAX, pose.distance * 0.01));
    if (camera.near !== near) { camera.near = near; camera.updateProjectionMatrix(); }
    root.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    renderer.render(scene, camera);
    info.calls = renderer.info.render.calls;
    info.triangles = renderer.info.render.triangles;
    info.ms = +(performance.now() - t0).toFixed(2);
    renders++;

    if (si !== lastStation) { lastStation = si; bus.emit('stage:station', { index: si, station: nearest }); }
    lastRender = { progress, station: nearest, explode: e, mode, info: { ...info }, reason };
    bus.emit('stage:render', lastRender);
    // a goto flies and releases on a rAF chain; once the release has landed on the path the pad idle motion resumes
    if (gotoState && (gotoState.phase === 'fly' || gotoState.phase === 'release')) frame = requestAnimationFrame(draw);
    else if (hadGoto && !gotoState) ensureLoop();
  }

  function applyAppearance(en, a) {
    const { part } = en;
    en.opacity = a.opacity; en.appearance = a;
    en.group.visible = a.opacity > 0.0005;
    if (!en.group.visible) return;
    const active = a.active;
    if (en.wire) {
      const wire = en.wire;
      const show = a.edgesOnly || mode !== 'solid' || !en.mesh;
      wire.visible = show;
      if (show) {
        const strength = a.edgesOnly ? 1 : mode === 'wire' ? 0.75 : 0.17 + 0.21 * active;
        wire.material.opacity = a.opacity * strength;
        wire.material.color.setHex(0x999999).lerp(WHITE, active);
        wire.renderOrder = active > 0.5 ? 3 : 0;
      }
    }
    if (en.mesh) {
      const mesh = en.mesh, m = mesh.material;
      mesh.visible = !a.edgesOnly && mode !== 'wire';
      if (mesh.visible) {
        m.opacity = a.opacity;
        const transparent = a.opacity < 0.999;
        if (m.transparent !== transparent) { m.transparent = transparent; m.needsUpdate = true; }
        m.depthWrite = !transparent;
        if (en.liveryColor != null) m.color.setHex(en.liveryColor);
        else m.color.setHex(part.exterior ? 0xc8c8c5 : 0x9c9c99).lerp(ACTIVE_MESH, active);
        mesh.renderOrder = active > 0.5 ? 3 : 0;
      }
    }
  }
  const WHITE = new THREE.Color(0xffffff), ACTIVE_MESH = new THREE.Color(0xf1f1ee);

  // ---- pad idle motion: yaw on a 100 ms timer, parallax on a rAF chain only while it eases ----
  const loopWanted = () => inPad() && tier >= 2 && canDraw();
  const parallaxPending = () => Math.abs(pointerTarget.x - parallax.x) > 1e-3 || Math.abs(pointerTarget.y - parallax.y) > 1e-3;
  function ensureLoop() { armYaw(); armParallax(); }
  /* The yaw timer fires every YAW_STEP_MS once the pointer has rested for YAW_RESUME_MS; each tick draws one step. */
  function armYaw() {
    if (yawTimer || !loopWanted()) return;
    yawLast = 0;
    yawTimer = setTimeout(yawTick, Math.max(YAW_STEP_MS, lastPointerAt + YAW_RESUME_MS - performance.now()));
  }
  function yawTick() {
    yawTimer = 0;
    if (!loopWanted()) return;
    const now = performance.now();
    if (now - lastPointerAt > YAW_RESUME_MS) {
      yaw += YAW_RATE * (yawLast ? Math.min(250, now - yawLast) : YAW_STEP_MS) / 1000;
      yawLast = now;
      invalidate('yaw');
    } else yawLast = 0;
    armYaw();
  }
  /* The parallax eases toward the pointer on a one-pole filter; the chain ends the frame it settles. */
  function armParallax() {
    if (loopId || !loopWanted() || !(parallaxPending() || parallaxMoving)) return;
    loopLast = 0; loopId = requestAnimationFrame(parallaxTick);
  }
  function parallaxTick(now) {
    loopId = 0;
    if (!loopWanted()) return;
    const dt = loopLast ? Math.min(100, now - loopLast) : 16.7; loopLast = now;
    const k = 1 - Math.exp(-dt / PARALLAX_TAU_MS);
    if (parallaxPending()) { parallax.x += (pointerTarget.x - parallax.x) * k; parallax.y += (pointerTarget.y - parallax.y) * k; parallaxMoving = true; }
    else { parallax.x = pointerTarget.x; parallax.y = pointerTarget.y; parallaxMoving = false; }
    cancelFrame(); pending.add('pointer'); draw(now);
    if (parallaxMoving) loopId = requestAnimationFrame(parallaxTick);
  }

  // ---- geometry build ----------------------------------------------------
  async function build() {
    try {
      let geo = geometry;
      const { signal } = aborter;
      if (fallback) {
        const json = geo?.json || await loadManifest({ signal });
        if (destroyed) return false;
        parts = describeParts(json);
      } else {
        if (!geo) { geo = await loadGeometry({ signal }); if (destroyed) return false; bus.emit('assets:geometry', geo); }
        parts = describeParts(geo.json);
        if (document.fonts?.load) await document.fonts.load('700 32px "Space Grotesk"').catch(() => {});
        if (destroyed) return false;
        entries = buildScene({ json: geo.json, buffer: geo.buffer, root, parts });
        byId = new Map(entries.map(en => [en.part.id, en]));
        await precompile();
      }
      if (destroyed) return false;
      built = true;
      rebuildPath();
      measure(true);
      bus.emit('stage:ready', { parts, stations });
      invalidate('ready');
      ensureLoop();
      return true;
    } catch (err) {
      if (destroyed || err?.name === 'AbortError') return false; // destroy() cancelled the fetch: not an error
      stage.error = err;
      console.error('[stage] geometry failed', err);
      return false;
    }
  }

  /* Link the shader programs before the first visible frame, so that frame only draws. compile() only
     queues the GL compile and link. With KHR_parallel_shader_compile the driver links off the main thread
     and compileAsync resolves once the programs report complete; the transparent back and front passes the
     descent switches the parts to (applyAppearance) are queued too, so the first scroll into the walk does
     not link on the main thread either, and the wait covers the pad view's programs. The wait is bounded:
     a lost context or a driver that never reports completion only falls back to linking on the first draw.
     Without the extension the pad view's programs are queued now (a head start, no wait): anything queued
     ahead of the first draw would hold it, and compileAsync would only warn that the extension is missing. */
  async function precompile() {
    let timer = 0, opaque = [];
    try {
      if (!renderer.extensions.has('KHR_parallel_shader_compile')) { renderer.compile(scene, camera); return; }
      opaque = entries.filter(en => en.mesh && !en.mesh.material.transparent).map(en => en.mesh.material);
      renderer.compile(scene, camera);
      for (const m of opaque) m.transparent = true;
      renderer.compile(scene, camera);
      for (const m of opaque) { m.transparent = false; m.needsUpdate = true; }
      // re-selects the pad view's programs (already queued, nothing new compiles) and waits for them
      await Promise.race([renderer.compileAsync(scene, camera), new Promise((resolve) => { timer = setTimeout(resolve, COMPILE_WAIT_MS); })]);
    } catch { /* not fatal: the first draw links whatever is left, as it did before */ }
    finally {
      clearTimeout(timer);
      for (const m of opaque) if (m.transparent) { m.transparent = false; m.needsUpdate = true; }
    }
  }

  // ---- sizing / visibility -----------------------------------------------
  function measure(force = false) {
    if (fallback) return;
    const w = Math.round(canvas.clientWidth), h = Math.round(canvas.clientHeight);
    if (!w || !h) return;
    const nd = dprForTier(tier);
    if (!force && w === width && h === height && nd === dpr) return;
    width = w; height = h; dpr = nd;
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    rebuildPath();
  }
  const onVisibility = () => { if (document.hidden) { cancelFrame(); cancelLoop(); } else { invalidate('visible'); ensureLoop(); } };
  const onLost = (ev) => { ev.preventDefault(); contextLost = true; cancelFrame(); cancelLoop(); };
  const onRestored = () => { contextLost = false; for (const en of entries) if (en.texture) en.texture.needsUpdate = true; invalidate('context-restored'); ensureLoop(); };
  if (!fallback) {
    canvas.addEventListener('webglcontextlost', onLost, false);
    canvas.addEventListener('webglcontextrestored', onRestored, false);
    document.addEventListener('visibilitychange', onVisibility);
    if ('ResizeObserver' in window) { ro = new ResizeObserver(() => stage.resize()); ro.observe(canvas); }
    if ('IntersectionObserver' in window) {
      io = new IntersectionObserver((list) => { onScreen = list[list.length - 1].isIntersecting; if (onScreen) { invalidate('onscreen'); ensureLoop(); } else { cancelFrame(); cancelLoop(); } }, { threshold: 0 });
      io.observe(canvas);
    }
  }

  // ---- API ---------------------------------------------------------------
  const stage = {
    fallback,
    error: null,
    get parts() { return parts; },
    get stations() { return stations; },
    get info() { return info; },
    get progress() { return progress; },
    get station() { return path && built ? path.stationAt(progress) : -1; },
    get explode() { return currentExplode(); },
    get explodeOverride() { return explodeOverride; },
    get mode() { return mode; },
    get tier() { return tier; },
    get dpr() { return dpr; },
    get size() { return { width, height }; },
    get pose() { return { target: [displayed.target.x, displayed.target.y, displayed.target.z], distance: displayed.distance, azimuthDeg: (displayed.azimuth - FRONT_ANGLE) / DEG, elevationDeg: displayed.elevation / DEG, yawDeg: yaw / DEG, padWeight: displayed.padWeight }; },
    get renders() { return renders; },
    get contextLost() { return contextLost; },
    get lastRender() { return lastRender; },
    get path() { return path; },
    get canvas() { return canvas; },
    get renderer() { return renderer; },

    setProgress(p) {
      p = clamp(Number(p) || 0, 0, 1);
      if (built && Math.abs(p - progress) < 1e-4 && renders > 0) return;
      progress = p;
      if (gotoState && gotoState.phase !== 'release' && Math.abs(p - gotoState.p0) > 0.001) stage.release();
      if (!built) return;
      if (tier >= 2) invalidate('progress'); else debounced('progress');
      if (inPad()) ensureLoop(); else cancelLoop();
    },
    setPointer(nx, ny) {
      pointerTarget.x = clamp(Number(nx) || 0, -1, 1); pointerTarget.y = clamp(Number(ny) || 0, -1, 1);
      lastPointerAt = performance.now();
      if (!built || tier === 0 || !inPad()) return;
      if (tier >= 2) ensureLoop();
      else { parallax.x = pointerTarget.x; parallax.y = pointerTarget.y; invalidate('pointer'); }
    },
    setExplode(e) {
      const n = Number(e);
      explodeOverride = e == null || !Number.isFinite(n) ? null : clamp(n, 0, 1);
      rebuildPath();
      if (built) invalidate('explode');
    },
    setMode(m) {
      if (!MODES.includes(m)) return;
      mode = m;
      if (built) invalidate('mode');
    },
    setTier(t) {
      t = clamp(t | 0, 0, 3);
      if (t === tier) return;
      tier = t;
      measure();
      if (built) invalidate('tier');
      if (tier < 2) cancelLoop(); else ensureLoop();
    },
    setVisible(v) {
      pageVisible = !!v;
      if (pageVisible) { invalidate('visible'); ensureLoop(); }
      else { cancelFrame(); cancelLoop(); clearTimeout(debounceTimer); debounceTimer = 0; }
    },
    resize() { measure(); if (built) invalidate('resize'); },
    render() { cancelFrame(); if (canDraw()) draw(performance.now()); },

    /* Animate the camera to a part; resolves true when it arrives, false when a scroll released it first. */
    goto(partId, { duration = GOTO_MS } = {}) {
      const en = byId.get(Number(partId));
      if (!en || !built || en.part.referenceOnly) return Promise.resolve(false);
      if (gotoState?.resolve) gotoState.resolve(false);
      const from = copyPose(renders ? displayed : computePose(performance.now(), scratchPose), makePose());
      const to = makePose();
      // Frame the part where the next frame will draw it: group positions only update on draw,
      // so derive the offset from the explode value of the current progress, not from the group.
      displacement(en.part, currentExplode(), en.part.center, disp);
      tmpBox.copy(en.bounds).translate(tmpV.set(disp[0], disp[1], disp[2]));
      tmpBox.getCenter(to.target);
      to.azimuth = from.azimuth;                  // keep the heading: a goto dollies, it does not spin
      to.elevation = 10 * DEG;
      to.distance = Math.max(0.08, fitBox(tmpBox, to.azimuth, to.elevation, width / height, GOTO_MARGIN));
      to.padWeight = 0;
      return new Promise((resolve) => {
        gotoState = { phase: 'fly', id: en.part.id, from, to, start: performance.now(), duration: tier === 0 ? 0 : Math.max(0, duration), p0: progress, resolve };
        cancelLoop();
        invalidate('goto');
      });
    },
    /* Let a goto pose go: the camera blends back onto the path over RELEASE_MS, or over the next 2% of progress, whichever lands first. */
    release() {
      if (!gotoState || gotoState.phase === 'release') return;
      if (gotoState.resolve) { const r = gotoState.resolve; gotoState.resolve = null; r(false); }
      gotoState = { phase: 'release', id: gotoState.id, from: copyPose(displayed, makePose()), p0: gotoState.p0, start: performance.now(), duration: tier === 0 ? 0 : RELEASE_MS, maxDelta: 0 };
      if (built) invalidate('release');
    },

    /* Last applied appearance of a part: {opacity, edgesOnly, active} or null before the first render. */
    appearanceOf(partId) { const en = byId.get(Number(partId)); return en && en.appearance ? { ...en.appearance } : null; },

    /* Screen position of a part's centre (bounds centre + explode offset) after the last render, canvas CSS px. */
    project(partId) {
      const en = byId.get(Number(partId));
      if (!en || !built || !renders) return { x: 0, y: 0, visible: false, depth: 0 };
      en.bounds.getCenter(tmpV).add(en.group.position).applyMatrix4(root.matrixWorld);
      const depth = camera.position.distanceTo(tmpV);
      tmpV.project(camera);
      const x = (tmpV.x * 0.5 + 0.5) * width, y = (-tmpV.y * 0.5 + 0.5) * height;
      const visible = tmpV.z > -1 && tmpV.z < 1 && (en.opacity ?? 0) > 0.005 && x >= 0 && x <= width && y >= 0 && y <= height;
      return { x, y, visible, depth };
    },

    /* Exterior shapes in canvas CSS px for the tunnel obstacle; empty outside the pad view.
       capsule: nose cone and tubes as one capsule between the projected tip and tube bottom.
       box: four fins and two rail buttons, oriented along the rocket's on-screen axis.
       `angle` is radians, positive clockwise on screen (y down); `deg` is the same in degrees. */
    silhouette() {
      if (!built || fallback || !renders || !path || path.padWeight(progress) <= 0) return [];
      const nose = byId.get(0), tube2 = byId.get(2);
      if (!nose || !tube2) return [];
      const toScreen = (v) => { v.applyMatrix4(root.matrixWorld).project(camera); return [(v.x * 0.5 + 0.5) * width, (-v.y * 0.5 + 0.5) * height, v.z]; };
      // the endpoints follow their groups' explode displacement, as the fin and rail-button boxes do
      tmpV3.set(0, nose.part.bounds[1][1], 0).add(nose.group.position);
      tmpV4.set(0, tube2.part.bounds[0][1], 0).add(tube2.group.position);
      const top = toScreen(tmpV.copy(tmpV3));
      const bottom = toScreen(tmpV.copy(tmpV4));
      // projected radius: the body radius along the camera's right axis at the capsule's mid point
      const right = tmpV2.setFromMatrixColumn(camera.matrixWorld, 0).normalize().multiplyScalar(BODY_RADIUS_M);
      tmpV3.add(tmpV4).multiplyScalar(0.5);
      const mid = toScreen(tmpV.copy(tmpV3));
      const midR = toScreen(tmpV.copy(tmpV3).add(right));
      const r = Math.hypot(midR[0] - mid[0], midR[1] - mid[1]);
      // on-screen axis (unit, tip to tail) and the roll angle of the rocket on screen
      let ax = bottom[0] - top[0], ay = bottom[1] - top[1]; const len = Math.hypot(ax, ay) || 1; ax /= len; ay /= len;
      const angle = Math.atan2(-ax, ay);
      const shapes = [{ kind: 'capsule', id: 'airframe', x1: top[0] + ax * r, y1: top[1] + ay * r, x2: bottom[0] - ax * r, y2: bottom[1] - ay * r, r }];
      const cos = Math.cos(angle), sin = Math.sin(angle);
      const corner = [];
      for (const id of [6, 7, 8, 9, 10, 11]) {
        const en = byId.get(id); if (!en) continue;
        tmpBox.copy(en.bounds).translate(en.group.position);
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (let i = 0; i < 8; i++) {
          tmpV.set(i & 1 ? tmpBox.max.x : tmpBox.min.x, i & 2 ? tmpBox.max.y : tmpBox.min.y, i & 4 ? tmpBox.max.z : tmpBox.min.z);
          const s = toScreen(tmpV);
          // into the rocket's screen frame: rotate by -angle about the top point
          const px = s[0] - top[0], py = s[1] - top[1];
          const lx = px * cos + py * sin, ly = -px * sin + py * cos;
          if (lx < minX) minX = lx; if (lx > maxX) maxX = lx; if (ly < minY) minY = ly; if (ly > maxY) maxY = ly;
        }
        const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
        corner.push({ kind: 'box', id: id <= 9 ? `fin-${id - 5}` : `rail-button-${id - 9}`, x: top[0] + cx * cos - cy * sin, y: top[1] + cx * sin + cy * cos, w: maxX - minX, h: maxY - minY, angle, deg: angle / DEG });
      }
      return shapes.concat(corner);
    },

    destroy() {
      destroyed = true;
      aborter.abort();
      cancelFrame(); cancelLoop();
      clearTimeout(debounceTimer); debounceTimer = 0;
      if (gotoState?.resolve) gotoState.resolve(false);
      gotoState = null;
      ro?.disconnect(); io?.disconnect();
      if (!fallback) {
        canvas.removeEventListener('webglcontextlost', onLost, false);
        canvas.removeEventListener('webglcontextrestored', onRestored, false);
        document.removeEventListener('visibilitychange', onVisibility);
        disposeScene(entries); entries = []; byId.clear();
        renderer.dispose();
        renderer.forceContextLoss();
        renderer = null; scene = null; root = null; camera = null;
      }
      built = false;
    },
  };
  stage.ready = build();
  return stage;
}
export default createStage;
