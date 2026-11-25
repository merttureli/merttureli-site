// figure.js: the page's one WebGL view.
//
// One renderer draws whichever figure is on screen and copies the frame into that figure's 2D canvas, so the
// other figures keep their last frame as a still and only one view is ever live. Each figure shows one model:
// FIG 01 and FIG 04 follow the model tabs, the quickstart's FIG 02 and 03 and the "Any unit" panel always show
// the rudder pedals.
//
// The picture is made in three passes:
//   1. ids    every part in a flat color (its index) plus depth, at cell resolution: outlines and seams
//   2. shade  the CAD materials under the studio rig, at cell resolution (4x MSAA, none while dragging)
//   3. dither a full-screen pass that reads both per cell. Cells are whole device pixels and are counted from the
//             canvas corner, so the 8x8 Bayer pattern is locked to the screen and never swims with the model.
// `resolve` 0..1 (resolve.js) walks from 1-bit to shaded: the tone levels grow in steps while the cells stay at
// least 2 device pixels, then a Bayer-threshold dissolve hands each cell, whole, to the shaded render.
import * as THREE from '../../../next/js/three.module.min.js';
import { addStudioLights, createStudioEnvironment } from '../../../next/js/showreel/engine.js';
import { buildCadMesh } from '../../../next/js/cad/cadmesh.js';
import { MODELS, loadMeta, modelUrl } from './models.js';
import { resolveSteps } from './resolve.js';

const INK = new THREE.Vector3(0x4d / 255, 0xff / 255, 0x9a / 255);
const GROUND = new THREE.Vector3(0x09 / 255, 0x0c / 255, 0x10 / 255);
const FOV = 16, TAN = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const smoother = t => t * t * t * (t * (t * 6 - 15) + 10);
const SWAY = .42;        // radians of phase a second: one sway takes about 15 s
const IDLE = [4, 6];     // an idle sway or spin eases out between these seconds, then the figure stops drawing
const NET_UNTIL = .5;    // below this resolve a net is drawn as a flat 25% tone with an outline, not as wires

export { resolveSteps };

// Pass 1. Per cell: R part id, G depth across the model, B the drawing tone, A the normal's x (for creases).
// The tone is not the studio render: a 1-bit picture needs faces that differ by a lot, so it is one hard key
// light from the upper left on the surface normal, scaled by how light the part's material is.
// R carries two flags above the id: +128 a line set (a net, a wire panel), +64 a flat fill (a net's area).
const ID_VERT = /* glsl */`
varying float vZ;
varying vec3 vN;
varying vec3 vV;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vZ = -mv.z;
  vV = -mv.xyz;
  vN = normalMatrix * normal;
  gl_Position = projectionMatrix * mv;
}`;
const ID_FRAG = /* glsl */`
uniform float uId;
uniform float uAlbedo;
uniform vec2 uRange;
uniform vec3 uKey;
uniform vec3 uFill;
uniform vec3 uShape;     // ambient, fill strength, key exponent
varying float vZ;
varying vec3 vN;
varying vec3 vV;
void main() {
  float d = clamp((vZ - uRange.x) / (uRange.y - uRange.x), 0.0, 1.0);
#if defined(LINE)
  gl_FragColor = vec4((uId + 128.0) / 255.0, d, uAlbedo, 0.5);
#elif defined(FLAT)
  gl_FragColor = vec4((uId + 64.0) / 255.0, d, uAlbedo, 0.5);
#else
  vec3 n = normalize(vN);
  if (dot(n, vV) < 0.0) n = -n;          // CAD faces are not always wound the same way: light the side we see
  float key = pow(max(dot(n, uKey), 0.0), uShape.z), fill = max(dot(n, uFill), 0.0);
  float t = uAlbedo * clamp(uShape.x + (1.0 - uShape.x) * key + uShape.y * fill, 0.0, 1.0);
  gl_FragColor = vec4(uId / 255.0, d, t, n.x * 0.5 + 0.5);
#endif
}`;

const POST_VERT = /* glsl */`
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`;
// Pass 3. Everything is decided per cell (a square of uCell device pixels counted from the canvas corner).
const POST_FRAG = /* glsl */`
precision highp float;
precision highp int;
uniform highp sampler2D tShade;
uniform highp sampler2D tId;
uniform int uCell;
uniform float uLevels;
uniform float uMix;
uniform int uBlock;      // the dissolve's unit, in device px: blocks of whole cells, so it reads as a pattern, never as a tint
uniform vec3 uInk;
uniform vec3 uGround;
uniform float uHot;      // highlighted part id, 0 for none
uniform float uSeam;     // depth step that counts as one surface passing in front of another
uniform float uCrease;   // change in the normal that counts as a fold
uniform vec2 uCue;       // depth cue: tone falls by .x from the nearest surface to the farthest, starting at .y
uniform vec3 uLine;      // tone of an outline, of a fold line, of the gap behind a nearer surface
const int B[64] = int[64](
   0, 32,  8, 40,  2, 34, 10, 42,
  48, 16, 56, 24, 50, 18, 58, 26,
  12, 44,  4, 36, 14, 46,  6, 38,
  60, 28, 52, 20, 62, 30, 54, 22,
   3, 35, 11, 43,  1, 33,  9, 41,
  51, 19, 59, 27, 49, 17, 57, 25,
  15, 47,  7, 39, 13, 45,  5, 37,
  63, 31, 55, 23, 61, 29, 53, 21);
ivec2 gSize;
vec4 at(ivec2 c) { return texelFetch(tId, clamp(c, ivec2(0), gSize - 1), 0); }
float rawId(vec4 t) { return floor(t.r * 255.0 + 0.5); }
float idOf(vec4 t) { return mod(rawId(t), 64.0); }
vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
void main() {
  gSize = textureSize(tId, 0);
  ivec2 c = ivec2(gl_FragCoord.xy) / uCell;
  vec4 here = at(c);
  float raw = rawId(here), id = idOf(here), wire = step(127.5, raw), even = step(63.5, raw) * (1.0 - wire);
  float on = step(0.5, id), d = here.g;
  float hotOn = step(0.5, uHot), isHot = hotOn * (1.0 - step(0.5, abs(id - uHot)));

  // a flat fill keeps its tone at every depth, so a net reads as one even field of dots
  float L = here.b * (1.0 - (1.0 - even) * uCue.x * smoothstep(uCue.y, 1.0, d));
  // outline: this cell touches the ground or stands in front of what is beside it.
  // gap: a nearer surface is right beside it. fold: same part, the surface turns (right and up only, so 1 cell wide).
  float front = 0.0, gap = 0.0, fold = 0.0;
  for (int k = 0; k < 4; k++) {
    ivec2 o = k == 0 ? ivec2(1, 0) : k == 1 ? ivec2(0, 1) : k == 2 ? ivec2(-1, 0) : ivec2(0, -1);
    vec4 nb = at(c + o);
    float ni = idOf(nb);
    if (ni < 0.5) { front = 1.0; continue; }
    float dz = nb.g - d;
    if (dz > uSeam || (ni != id && dz > 0.004)) front = 1.0;
    if (dz < -uSeam) gap = 1.0;
    if (k < 2 && ni == id && abs(dz) <= uSeam && (abs(nb.a - here.a) > uCrease || abs(nb.b - here.b) > uCrease * 0.8)) fold = 1.0;
  }
  L = mix(L, isHot > 0.5 ? mix(L, 1.0, 0.7) : L * 0.4, hotOn);
  // a line set is drawn at its own tone, so wires read as dots that thin out with distance, not as a solid sheet
  float edge = (1.0 - wire) * max(front * uLine.x, fold * uLine.y * (1.0 - even)) * mix(1.0, isHot > 0.5 ? 1.0 : 0.45, hotOn);
  L = max(L, edge);
  L = mix(L, L * uLine.z, gap);

  float n = uLevels - 1.0;
  float b = (float(B[(c.y & 7) * 8 + (c.x & 7)]) + 0.5) / 64.0;
  float v = clamp(floor(L * n + b) / n, 0.0, 1.0);
  vec3 mono = mix(uGround, uInk, v);

  // the dissolve: a block whose threshold is under uMix shows the shaded render, whole; the rest stay dithered
  ivec2 k = ivec2(gl_FragCoord.xy) / uBlock;
  float bk = (float(B[(k.y & 7) * 8 + (k.x & 7)]) + 0.5) / 64.0;
  if (bk < uMix) {
    vec4 s = texelFetch(tShade, clamp(c, ivec2(0), gSize - 1), 0);
    vec3 col = toSRGB(clamp(s.rgb / max(s.a, 1e-4), 0.0, 1.0));
    col = mix(col, isHot > 0.5 ? mix(col, uInk, 0.38) : col * 0.5, hotOn);
    gl_FragColor = vec4(col * s.a, s.a);
  } else {
    gl_FragColor = vec4(mono * on, on);
  }
}`;

export function createFigure({ reduced = false } = {}) {
  const glc = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas: glc, antialias: false, alpha: true, premultipliedAlpha: true });
  renderer.setPixelRatio(1);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.debug.checkShaderErrors = /[?&#]debug\b/.test(location.href);
  const scene = new THREE.Scene();
  const lights = addStudioLights(scene);
  // a little less light than the showreel's rig, so the light gray levers stop clipping to white at resolve 1
  // (3.4% of the model's pixels were pure white; 0.2% are now)
  lights.key.intensity *= .75; lights.hemi.intensity *= .85;
  const env = createStudioEnvironment(renderer);
  const camera = new THREE.PerspectiveCamera(FOV, 1, .05, 30);

  const half = renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float');
  const target = (samples, type) => new THREE.WebGLRenderTarget(4, 4, { type, samples, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
  const shadeType = half ? THREE.HalfFloatType : THREE.UnsignedByteType;
  const rtFull = target(4, shadeType), rtFast = target(0, shadeType), rtId = target(0, THREE.UnsignedByteType);

  const post = new THREE.ShaderMaterial({
    vertexShader: POST_VERT, fragmentShader: POST_FRAG, depthTest: false, depthWrite: false,
    uniforms: {
      tShade: { value: rtFull.texture }, tId: { value: rtId.texture }, uCell: { value: 2 }, uBlock: { value: 4 }, uLevels: { value: 2 }, uMix: { value: 0 },
      uInk: { value: INK }, uGround: { value: GROUND }, uHot: { value: 0 }, uSeam: { value: .014 }, uCrease: { value: .2 },
      uCue: { value: new THREE.Vector2(.45, .15) }, uLine: { value: new THREE.Vector3(1, .8, .08) },
    },
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post);
  quad.frustumCulled = false;
  const postScene = new THREE.Scene(), postCam = new THREE.Camera();
  postScene.add(quad);
  const idRange = new THREE.Vector2(0, 1);           // one shared range: depth is measured across the model, not the frustum
  // the drawing light, in view space: a key from the upper left, a weak fill from the right
  const light = { uRange: { value: idRange }, uKey: { value: new THREE.Vector3(-.72, .42, .55).normalize() }, uFill: { value: new THREE.Vector3(.8, .1, .4).normalize() }, uShape: { value: new THREE.Vector3(.04, .12, 1.6) } };
  // how light a material reads in the drawing: black parts keep half their tone so they do not vanish
  const albedo = color => { const c = new THREE.Color(color), l = Math.pow(.2126 * c.r + .7152 * c.g + .0722 * c.b, 1 / 2.2); return Math.round((.52 + .48 * Math.min(1, l / .8)) * 100) / 100; };
  const idMaterial = (id, tone, kind) => new THREE.ShaderMaterial({
    vertexShader: ID_VERT, fragmentShader: ID_FRAG, side: THREE.DoubleSide, defines: kind ? { [kind]: 1 } : {},
    uniforms: { ...light, uId: { value: id }, uAlbedo: { value: tone } },
  });

  // ------------------------------------------------------------------ models
  const cache = new Map(), listeners = { pick: [] };
  let followKey = null, shown = null;
  const emit = (name, ...a) => { for (const f of listeners[name]) f(...a); };

  // The header is fetched once (models.js, shared with the page's text), then the .bin, then the loader builds it.
  async function fetchModel(key) {
    const { meta } = await loadMeta(key);
    const binUrl = new URL(meta.bin, modelUrl(key)).href;
    let res = await fetch(binUrl);
    if (!res.ok) res = await fetch(binUrl + '.wasm');   // artifact previews rename .bin, as the loader does
    if (!res.ok) throw new Error(`${meta.bin} ${res.status}`);
    return buildCadMesh(THREE, meta, await res.arrayBuffer());
  }
  function loadModel(key) {
    if (!cache.has(key)) cache.set(key, fetchModel(key).then(m => prepare(key, m)));
    return cache.get(key);
  }
  function prepare(key, m) {
    const cfg = MODELS[key], orient = new THREE.Group(), turn = new THREE.Group();
    turn.rotation.order = 'YXZ';                     // a tilt (the "Any unit" panel) happens before the turn
    m.setProgress(1);
    m.group.updateMatrixWorld(true);                 // boxes are measured here, in the model's own coordinates
    const list = m.getParts(), boxes = list.map(p => new THREE.Box3().setFromObject(p.mesh));
    // a model can be framed on a stretch of its length (CHARGER: the avionics bay); the rest falls outside
    const framed = i => !cfg.frame || (list[i].mesh.position.y >= cfg.frame[0] && list[i].mesh.position.y <= cfg.frame[1]);
    const box = new THREE.Box3();
    boxes.forEach((b, i) => { if (framed(i) && !b.isEmpty()) box.union(b); });
    const c = box.getCenter(new THREE.Vector3());
    orient.add(turn); turn.add(m.group);
    if (cfg.lay) orient.rotation.z = cfg.lay;
    m.group.position.copy(c).multiplyScalar(-1);
    for (const mat of Object.values(m.materials)) { mat.envMap = env; mat.envMapIntensity = .45; }
    const stored = list.some(p => p.explode.lengthSq() > 1e-10);
    const parts = [], meshes = [], drawn = [], wires = [], fills = [];
    list.forEach((p, i) => {
      const base = p.mesh.position.clone(), meta = m.meta.parts[i];
      // a placeholder box (12 triangles) or an empty part is drawn but not offered to the pointer
      const pickable = meta.triangles > 12;
      const own = [];
      p.mesh.traverse(o => { if (o.isMesh) { o.userData.shade = o.material; o.userData.idMat = idMaterial(i + 1, albedo(o.material.color)); o.userData.part = i; own.push(o); if (pickable) meshes.push(o); drawn.push(o); } });
      // corners of the part's box, relative to the frame center, for framing
      const corners = [], b = boxes[i];
      if (own.length && framed(i) && !b.isEmpty()) for (let k = 0; k < 8; k++) corners.push(new THREE.Vector3(k & 1 ? b.max.x : b.min.x, k & 2 ? b.max.y : b.min.y, k & 4 ? b.max.z : b.min.z).sub(c));
      parts.push({ name: p.name, index: i, group: p.mesh, base, explode: p.explode, meshes: own, corners, meta, pickable });
    });
    // Line sets stored in the same file (the Robo-Catcher's net and feeder wires) ride with their part. A flat
    // set (the net) also gets a filled quad over its area, drawn instead of the wires at low resolve: a net is
    // thinner than a cell, and its wires would alias into streaks.
    for (const L of Object.values(m.meta.lines || {})) {
      const part = parts.find(p => p.name === L.part);
      if (!part) continue;
      const pos = Float32Array.from(L.positions, (v, i) => v - part.base.getComponent(i % 3));
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const seg = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: L.color }));
      seg.userData.shade = seg.material; seg.userData.idMat = idMaterial(part.index + 1, .5, 'LINE');
      part.group.add(seg);
      drawn.push(seg);
      g.computeBoundingBox();
      const size = g.boundingBox.getSize(new THREE.Vector3()), flatAxis = [size.x, size.y, size.z].indexOf(Math.min(size.x, size.y, size.z));
      if (flatAxis !== 2 || size.z > .002) continue;   // only a net that lies in one x-y plane, as the backstop's does
      const mid = g.boundingBox.getCenter(new THREE.Vector3());
      const fill = new THREE.Mesh(new THREE.PlaneGeometry(size.x, size.y), idMaterial(part.index + 1, .25, 'FLAT'));
      fill.position.copy(mid);
      fill.userData.idMat = fill.material;
      fill.visible = false;
      part.group.add(fill);
      wires.push(seg); fills.push(fill);
    }
    const radiusOut = Math.max(...parts.flatMap(p => p.corners.map(v => Math.max(v.length(), v.clone().add(p.explode).length()))), .001);
    const radiusIn = Math.max(...parts.flatMap(p => p.corners.map(v => v.length())), .001);
    const corner = box.min.clone().sub(c).toArray();     // the low corner of the frame: where the "Any unit" axes start
    return { key, cfg, model: m, orient, turn, parts, meshes, drawn, wires, fills, radiusOut, radiusIn, corner, stored, fits: new Map() };
  }
  function attach(e) {
    if (shown === e) return;
    if (shown) scene.remove(shown.orient);
    scene.add(e.orient);
    shown = e;
  }
  async function useModel(h, key) {
    h.key = key;
    const e = await loadModel(key);
    if (h.key !== key) return e;
    h.entry = e;
    h.hover = -1; h.sticky = false; h.state.partK = null; h.state.hot = -1;
    h.reset();
    snap(h);
    draw(h);
    return e;
  }
  // the model tabs: every figure that follows them changes; the others keep their model
  async function setModel(key) {
    followKey = key;
    await Promise.all(hosts.filter(h => h.follow).map(h => useModel(h, key)));
    if (active) invalidate(active);
    return loadModel(key);
  }

  // The camera distance each turn angle needs to keep the model in the frame, assembled [0] and exploded [1].
  const STEPS = 48, P = new THREE.Vector3(), M = new THREE.Matrix4(), R = new THREE.Matrix4();
  function fitTable(e, aspect) {
    const id = aspect.toFixed(3);
    if (e.fits.has(id)) return e.fits.get(id);
    const pitch = e.cfg.pitch, cp = Math.cos(pitch), sp = Math.sin(pitch), tab = [new Float32Array(STEPS), new Float32Array(STEPS)];
    M.makeRotationZ(e.orient.rotation.z);
    for (let a = 0; a < STEPS; a++) {
      R.makeRotationY(a / STEPS * Math.PI * 2).premultiply(M);
      for (const p of e.parts) for (const v of p.corners) for (let k = 0; k < 2; k++) {
        P.copy(v); if (k) P.add(p.explode);
        P.applyMatrix4(R);
        const x = Math.abs(P.x), y = Math.abs(P.y * cp - P.z * sp), z = P.y * sp + P.z * cp;
        tab[k][a] = Math.max(tab[k][a], z + x / (TAN * aspect), z + y / TAN);
      }
    }
    e.fits.set(id, tab);
    return tab;
  }
  // the largest of those within `win` radians of `yaw`: a figure that sways is framed for its sway, not for a full turn
  function need(tab, yaw, win) {
    if (win >= Math.PI) return Math.max(...tab);
    const span = Math.ceil(win / (Math.PI * 2) * STEPS), at = Math.round(yaw / (Math.PI * 2) * STEPS);
    let d = 0;
    for (let i = at - span; i <= at + span; i++) d = Math.max(d, tab[((i % STEPS) + STEPS) % STEPS]);
    return d;
  }

  // ------------------------------------------------------------------- hosts
  const hosts = [];
  let active = null, raf = 0, last = 0;
  const dpr = () => window.devicePixelRatio || 1;

  // state: cell (CSS px of a dither cell at resolve 0), resolve, explode (0 assembled, 1 exploded), partK (the same per
  // part), hot (index of the part to pick out), sway (radians each way) or spin (radians a second), yaw (offset),
  // tilt (radians about x, before the turn), pitch (camera, else the model's own)
  // opts: model (a fixed model key) or follow (true: the model tabs), sphere (frame on the bounding sphere),
// after(host, project) called after each draw
  function addHost(el, state = {}, opts = {}) {
    const cv = el.querySelector('canvas') || el.appendChild(document.createElement('canvas'));
    const host = {
      el, cv, ctx: cv.getContext('2d'), w: 0, h: 0, area: 0, dirty: true, drawn: false, hover: -1, sticky: false, drag: null, pick: null, over: false, focus: false,
      follow: !!opts.follow, sphere: !!opts.sphere, key: null, entry: null, after: opts.after || null,
      state: { cell: 2, resolve: 0, explode: 0, sway: 0, spin: 0, hot: -1, partK: null, yaw: 0, tilt: 0, pitch: null, margin: 1.04, ...state },
      cur: { resolve: state.resolve || 0, explode: state.explode || 0, tilt: state.tilt || 0, partK: null, dist: 0 },
      user: 0, phase: 0, idle: 0, pitch: .3,
      // the sway eases out after IDLE seconds untouched; a drag, the pointer or the keyboard holds it where it is
      get motion() { return 1 - smooth(IDLE[0], IDLE[1], host.idle); },
      get yaw() { const s = host.state, e = host.entry; return (e ? e.cfg.yaw : 0) + s.yaw + host.user + (s.spin ? host.phase : s.sway * Math.sin(host.phase)); },
      set(patch) { Object.assign(host.state, patch); invalidate(host); },
      turnBy(dy, dp) { host.user += dy; host.pitch = Math.max(-.5, Math.min(1.1, host.pitch + dp)); invalidate(host); },
      reset() { host.user = 0; host.phase = 0; host.idle = 0; host.cur.dist = 0; host.pitch = host.state.pitch != null ? host.state.pitch : host.entry ? host.entry.cfg.pitch : .3; invalidate(host); },
      wake() { host.idle = 0; invalidate(host); },
      snap() { snap(host); invalidate(host); },
    };
    hosts.push(host);
    host.reset();
    try { sizeObserver.observe(el, { box: 'device-pixel-content-box' }); } catch (e) { sizeObserver.observe(el); }
    viewObserver.observe(el);
    bindPointer(host);
    const key = opts.follow ? followKey : opts.model;
    host.ready = key ? useModel(host, key) : Promise.resolve();
    return host;
  }
  const sizeObserver = new ResizeObserver(entries => {
    for (const en of entries) {
      const host = hosts.find(h => h.el === en.target);
      if (!host) continue;
      // whole device pixels, so a dither cell is never resampled
      // (an emulated pixel ratio, as in headless checks, reports CSS px here: then the size is worked out)
      let box = en.devicePixelContentBoxSize && en.devicePixelContentBoxSize[0];
      if (box && dpr() !== 1 && box.inlineSize === Math.round(en.contentRect.width) && box.inlineSize > 0) box = null;
      const w = box ? box.inlineSize : Math.round(en.contentRect.width * dpr()), h = box ? box.blockSize : Math.round(en.contentRect.height * dpr());
      if (w === host.w && h === host.h) continue;
      host.w = w; host.h = h;
      if (w && h) { host.cv.width = w; host.cv.height = h; host.cur.dist = 0; draw(host); }
    }
  });
  const viewObserver = new IntersectionObserver(entries => {
    for (const en of entries) {
      const host = hosts.find(h => h.el === en.target);
      if (host) host.area = en.isIntersecting ? en.intersectionRect.width * en.intersectionRect.height : 0;
    }
    choose();
  }, { threshold: [0, .1, .25, .4, .55, .7, .85, 1] });
  // One figure is live: the one most in view, or the one the pointer or the keyboard is on.
  function choose(claim) {
    let best = claim && claim.area > 0 ? claim : null;
    if (!best) {
      for (const h of hosts) if (h.area > 0 && (!best || h.area > best.area)) best = h;
      if (active && active.area > 0 && best !== active && (active.over || active.focus || active.drag || best.area < active.area * 1.25)) best = active;
    }
    if (best === active) return;
    active = best;
    if (active) invalidate(active);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && active) invalidate(active); });

  function invalidate(host) {
    host.dirty = true;
    if (host === active && !raf && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(tick); }
  }
  function snap(h) { h.cur.resolve = h.state.resolve; h.cur.explode = h.state.explode; h.cur.tilt = h.state.tilt; h.cur.partK = h.state.partK ? Float32Array.from(h.state.partK) : null; h.cur.dist = 0; }
  function refreshAll() { for (const h of hosts) { snap(h); draw(h); } if (active) invalidate(active); }

  // ease the drawn values toward the asked ones; true while anything still moves
  // dt is capped for the easing; wall is the real time since the last frame, for the idle clock
  function step(h, dt, wall = dt) {
    let moving = false;
    const s = h.state, c = h.cur, k = reduced ? 1 : 1 - Math.exp(-dt / .07), kt = reduced ? 1 : 1 - Math.exp(-dt / .32);
    const go = (a, b, eps = .002, kk = k) => { const d = b - a; if (Math.abs(d) < eps) return b; moving = true; return a + d * kk; };
    c.resolve = go(c.resolve, s.resolve);
    c.explode = go(c.explode, s.explode);
    c.tilt = go(c.tilt, s.tilt, .002, kt);
    if (s.partK) {
      if (!c.partK || c.partK.length !== s.partK.length) c.partK = new Float32Array(s.partK.length).fill(c.explode);
      for (let i = 0; i < s.partK.length; i++) c.partK[i] = go(c.partK[i], s.partK[i]);
    } else c.partK = null;
    if ((s.spin || s.sway) && !reduced && !h.over && !h.focus && !h.drag && h.idle < IDLE[1]) {
      h.idle += wall;
      h.phase += (s.spin || SWAY) * dt * h.motion;
      moving = true;
    }
    if (h.entry && h.w) { const want = distance(h); c.dist = c.dist ? go(c.dist, want, want * .0005) : want; }
    return moving;
  }
  function tick(now) {
    raf = 0;
    if (!active || document.hidden) return;
    const wall = (now - last) / 1000, dt = Math.min(.05, wall); last = now;
    const moving = step(active, dt, Math.min(wall, .5));
    if (active.pick) pick(active);
    if (moving || active.dirty) draw(active);
    if (moving) raf = requestAnimationFrame(tick);
  }

  // -------------------------------------------------------------------- draw
  const sizeOf = (rt, w, h) => { if (rt.width !== w || rt.height !== h) rt.setSize(w, h); };
  const outOf = c => { let o = c.explode; if (c.partK) { o = 0; for (const k of c.partK) o = Math.max(o, k); } return smoother(clamp01(o)); };
  function distance(h) {
    const e = h.entry, s = h.state;
    if (h.sphere) {                                  // a figure that tilts is framed on the model's sphere, at every tilt
      const half = Math.atan(TAN * Math.min(1, h.w / h.h));
      return e.radiusIn / Math.sin(half) * s.margin;
    }
    const tab = fitTable(e, h.w / h.h), win = s.spin ? Math.PI : s.sway + .12, center = e.cfg.yaw + s.yaw + h.user;
    const a = need(tab[0], center, win), b = need(tab[1], center, win);
    return (a + (b - a) * outOf(h.cur)) * s.margin;
  }
  function pose(h) {
    const e = h.entry, c = h.cur;
    if (c.partK) e.parts.forEach((p, i) => p.group.position.copy(p.base).addScaledVector(p.explode, smoother(clamp01(c.partK[i]))));
    else e.model.setProgress(1 - c.explode);         // the loader's own call: 0 exploded, 1 assembled
    e.turn.rotation.set(c.tilt, h.yaw, 0);
    const dist = c.dist || (c.dist = distance(h));
    camera.position.set(0, Math.sin(h.pitch) * dist, Math.cos(h.pitch) * dist);
    camera.lookAt(0, 0, 0);
    const r = Math.max(e.radiusOut, e.radiusIn);
    camera.near = Math.max(.01, dist - r * 1.2); camera.far = dist + r * 1.2;
    idRange.set(dist - r, dist + r);
  }
  const V = new THREE.Vector3();
  function draw(h) {
    const e = h.entry;
    if (!e || !h.w || !h.h) return;
    attach(e);
    h.dirty = false;
    if (glc.width !== h.w || glc.height !== h.h) renderer.setSize(h.w, h.h, false);
    const cell0 = Math.max(1, Math.round(h.state.cell * (h.w / Math.max(1, h.el.clientWidth))));
    const { cell, levels, mix } = resolveSteps(h.cur.resolve, cell0);
    const lw = Math.ceil(h.w / cell), lh = Math.ceil(h.h / cell);
    pose(h);
    camera.aspect = lw / lh; camera.updateProjectionMatrix();

    const net = h.cur.resolve < NET_UNTIL;
    sizeOf(rtId, lw, lh);
    for (const o of e.drawn) o.material = o.userData.idMat;
    for (const o of e.wires) o.visible = !net;
    for (const o of e.fills) { o.visible = net; o.material = o.userData.idMat; }
    renderer.setRenderTarget(rtId); renderer.clear(); renderer.render(scene, camera);
    for (const o of e.drawn) o.material = o.userData.shade;
    for (const o of e.wires) o.visible = true;
    for (const o of e.fills) o.visible = false;
    const u = post.uniforms;
    if (mix > 0) {                                   // the shaded render is only needed once the dissolve starts
      const rt = h.drag ? rtFast : rtFull;           // no MSAA while dragging
      sizeOf(rt, lw, lh);
      renderer.setRenderTarget(rt); renderer.clear(); renderer.render(scene, camera);
      u.tShade.value = rt.texture;
    }
    const hot = h.hover >= 0 ? h.hover : h.state.hot;
    u.uCell.value = cell; u.uBlock.value = Math.max(2, cell0) * 2; u.uLevels.value = levels; u.uMix.value = mix; u.uHot.value = hot >= 0 ? hot + 1 : 0;
    renderer.setRenderTarget(null); renderer.clear(); renderer.render(postScene, postCam);
    h.ctx.clearRect(0, 0, h.w, h.h);
    h.ctx.drawImage(glc, 0, 0);
    if (!h.drawn) { h.drawn = true; h.el.classList.add('is-live'); }
    if (h.after) {
      e.orient.updateMatrixWorld(true);
      const cw = h.el.clientWidth, ch = h.el.clientHeight;
      // a point in the model's own frame (meters, from the frame center) to CSS px in the figure
      h.after(h, (x, y, z) => { V.set(x, y, z).applyMatrix4(e.turn.matrixWorld).project(camera); return [(V.x + 1) / 2 * cw, (1 - V.y) / 2 * ch]; });
    }
  }

  // ----------------------------------------------------------------- pointer
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function pick(h) {
    const e = h.entry, at = h.pick;
    h.pick = null;
    if (!e || !at) return;
    const r = h.el.getBoundingClientRect();
    ndc.set((at.x - r.left) / r.width * 2 - 1, 1 - (at.y - r.top) / r.height * 2);
    pose(h); camera.aspect = r.width / r.height; camera.updateProjectionMatrix(); e.orient.updateMatrixWorld(true);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(e.meshes, false)[0], index = hit ? hit.object.userData.part : -1;
    if (index !== h.hover) { h.hover = index; h.dirty = true; }
    emit('pick', h, index, at.x, at.y);
  }
  function clearPick(h) { h.pick = null; h.sticky = false; if (h.hover >= 0) { h.hover = -1; emit('pick', h, -1); invalidate(h); } }
  function bindPointer(h) {
    const el = h.el;
    if (el.dataset.still != null) return;            // a figure that only plays: no turning, no picking
    el.addEventListener('pointerenter', ev => { if (ev.pointerType === 'mouse') { h.over = true; choose(h); } });
    el.addEventListener('pointerleave', () => { h.over = false; if (!h.sticky) clearPick(h); invalidate(h); });
    el.addEventListener('pointerdown', ev => {
      if (ev.button) return;
      choose(h);
      h.drag = { x: ev.clientX, y: ev.clientY, user: h.user, pitch: h.pitch, moved: false, touch: ev.pointerType !== 'mouse' };
      try { el.setPointerCapture(ev.pointerId); } catch (e) { /* synthetic events */ }
    });
    el.addEventListener('pointermove', ev => {
      if (h.drag) {
        const dx = ev.clientX - h.drag.x, dy = ev.clientY - h.drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) h.drag.moved = true;
        if (h.drag.moved) {
          h.user = h.drag.user + dx * .009;
          if (!h.drag.touch) h.pitch = Math.max(-.5, Math.min(1.1, h.drag.pitch + dy * .006));
          clearPick(h);
          invalidate(h);
        }
      } else if (ev.pointerType === 'mouse') { h.pick = { x: ev.clientX, y: ev.clientY }; invalidate(h); }
    });
    const end = ev => {
      const d = h.drag; h.drag = null;
      // a press that did not move asks for the part under it; on touch the answer stays until the next touch
      if (d && !d.moved && ev.type === 'pointerup') { h.pick = { x: ev.clientX, y: ev.clientY }; h.sticky = d.touch; }
      invalidate(h);                                 // and the frame is drawn again with MSAA
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('focus', () => { h.focus = el.matches(':focus-visible'); if (h.focus) choose(h); });
    el.addEventListener('blur', () => { h.focus = false; invalidate(h); });
    el.addEventListener('keydown', ev => {
      const k = { ArrowLeft: [-.14, 0], ArrowRight: [.14, 0], ArrowUp: [0, .08], ArrowDown: [0, -.08] }[ev.key];
      if (k) { ev.preventDefault(); h.focus = true; choose(h); h.turnBy(k[0], k[1]); }
      else if (ev.key === 'Home') { ev.preventDefault(); h.reset(); }
    });
  }

  return {
    THREE, renderer, canvas: glc, hosts, addHost, setModel, loadModel, refreshAll, draw, invalidate, clearPick, claim: h => choose(h),
    get active() { return active; },
    on(name, f) { listeners[name].push(f); },
    uniforms: post.uniforms, light, lights,
  };
}
