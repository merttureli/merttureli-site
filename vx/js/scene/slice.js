/* The lattice slice for the CHARGER field scene (FIELD.md sections 2, 5 and 6).

   A quad in the rocket's local pitch plane that covers the lattice domain and
   samples the lattice's view texture (alpha blended, depthTest on, depthWrite off,
   drawn after the opaque rocket). The mesh lives in the rocket's CAD frame
   (metres, nose tip at +y, body +x is world +x when theta = 0), so it moves and
   pitches with the rocket.

   Grid to body mapping (binding, FIELD.md section 2):
     grid +x (columns) runs nose to tail, column 0 upstream of the nose:
         CAD y = noseY - (col - xNoseCol) * cellM
     grid +y (rows) is the body's +x side, the axis on row axisRow:
         CAD x = (row - axisRow) * cellM
   Texture coordinates follow the render target layout: u = col / cols and
   v = row / rows with row 0 at v = 0 (a CanvasTexture must set flipY = false and
   draw row 0 on the canvas's top line).
   The lattice's inflow direction in the grid is (cos alpha, sin alpha); under this
   map it becomes (sin alpha, -cos alpha) in the body frame, which the rocket's
   rotation by theta turns into the world direction -(sin(theta - alpha),
   cos(theta - alpha)): exactly v_air from the flight model's alpha. So for a
   positive alpha the smoke enters from the body's -x side and flows toward +x, and
   it is parallel to the relative wind arrow in markers.js. gridDirToWorld() maps
   any grid vector through the mesh's actual world matrix so a lab can check it.

   Domain defaults (FIELD.md section 5): the rocket spans 66 percent of the width,
   the nose sits at 0.12 cols, the axis is centred vertically; at every tier the
   grid is 3.2 : 1 (1024 x 320, 768 x 240, 512 x 160), so the plane's size in
   metres does not change with the tier. */
import * as THREE from 'three';
import { easeSite } from './camera.js';

export const NOSE_Y = 0.5707;             // CAD, nose tip (m)
export const LENGTH_M = 1.1809;           // CAD, nose tip to screw cap (m)
export const SECTION = { span: 0.66, noseFrac: 0.12, cols: 1024, rows: 320 };   // FIELD.md section 5
const BETWEEN_RAD = Math.PI / 4;          // 'between' rotates the plane 45 deg about the body axis
const VIEW_MS = 480;                      // view rotation, the site's --dur-3
const VIEW_OPACITY = { smoke: 1, pressure: 0.94, vorticity: 0.94, speed: 0.94 };

export function defaultDomain({ cols = SECTION.cols, rows = SECTION.rows, lengthM = LENGTH_M } = {}) {
  return { cols, rows, cellM: lengthM / (SECTION.span * cols), xNoseCol: SECTION.noseFrac * cols, axisRow: rows / 2 };
}

/* Accepts a buildSection() result or any {cols, rows, cellM, xNoseCol, axisRow?}. */
export function normaliseDomain(d, fallback = defaultDomain()) {
  if (!d) return { ...fallback };
  const cols = d.cols > 0 ? d.cols : fallback.cols;
  const rows = d.rows > 0 ? d.rows : fallback.rows;
  const cellM = d.cellM > 0 ? d.cellM : LENGTH_M / (SECTION.span * cols);
  const xNoseCol = Number.isFinite(d.xNoseCol) ? d.xNoseCol : SECTION.noseFrac * cols;
  const axisRow = Number.isFinite(d.axisRow) ? d.axisRow : rows / 2;
  return { cols, rows, cellM, xNoseCol, axisRow };
}

/* Grid position (continuous cell coordinates) to the CAD frame, 'through' view. */
export function gridToLocal(col, row, domain, noseY = NOSE_Y, out = new THREE.Vector3()) {
  return out.set((row - domain.axisRow) * domain.cellM, noseY - (col - domain.xNoseCol) * domain.cellM, 0);
}

const VERT = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
/* Field over a hairline domain frame with hard-cornered registration ticks. The
   texture holds display colours already, so no colour-space conversion is applied. */
const FRAG = /* glsl */`
uniform sampler2D uMap;
uniform float uOpacity;
uniform vec2 uFade;      // edge fade width in uv on each axis
uniform vec2 uTick;      // corner tick length in uv on each axis
uniform float uFrame;    // frame alpha
varying vec2 vUv;
void main() {
  vec4 c = texture2D(uMap, vUv);
  vec2 d = min(vUv, 1.0 - vUv);
  float fade = smoothstep(0.0, uFade.x, d.x) * smoothstep(0.0, uFade.y, d.y);
  float a = clamp(c.a * uOpacity * fade, 0.0, 1.0);
  vec2 px = d / max(fwidth(vUv), vec2(1e-6));         // distance to each edge in pixels
  float line = 1.0 - smoothstep(0.6, 1.6, min(px.x, px.y));
  float tick = (d.x < uTick.x && d.y < uTick.y) ? 1.0 - smoothstep(1.2, 2.4, min(px.x, px.y)) : 0.0;
  float f = max(line * uFrame, tick * 0.8);
  float oa = a + f * (1.0 - a);
  vec3 rgb = oa > 1e-4 ? (c.rgb * a * (1.0 - f) + vec3(1.0) * f) / oa : vec3(0.0);
  if (oa < 0.002) discard;
  gl_FragColor = vec4(rgb, oa);
}`;

export function createSlice({ noseY = NOSE_Y, domain = null, reducedMotion = false } = {}) {
  let dom = normaliseDomain(domain);
  const geometry = new THREE.BufferGeometry();
  const pos = new Float32Array(12), uv = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.setIndex([0, 1, 2, 2, 1, 3]);
  const material = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG,
    uniforms: {
      uMap: { value: null }, uOpacity: { value: 1 }, uFade: { value: new THREE.Vector2(0.02, 0.064) },
      uTick: { value: new THREE.Vector2(0.03, 0.096) }, uFrame: { value: 0.24 },
    },
    transparent: true, depthTest: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'slice';
  mesh.renderOrder = 20;                  // after the opaque rocket (transparent list, then by order)
  mesh.frustumCulled = false;
  mesh.visible = false;
  let texture = null, view = 'through', viewName = 'smoke', opacity = 1, reduced = !!reducedMotion;
  let tween = null;                       // { from, to, t0 }

  function rebuild() {
    const { cols, rows, cellM, xNoseCol, axisRow } = dom;
    const yU0 = noseY + xNoseCol * cellM, yU1 = noseY - (cols - xNoseCol) * cellM;   // u = 0 and u = 1
    const xV0 = -axisRow * cellM, xV1 = (rows - axisRow) * cellM;                    // v = 0 and v = 1
    // vertices in uv order (0,0) (1,0) (0,1) (1,1); grid +x along -y, grid +y along +x
    pos.set([xV0, yU0, 0, xV0, yU1, 0, xV1, yU0, 0, xV1, yU1, 0]);
    geometry.attributes.position.needsUpdate = true;
    geometry.computeBoundingSphere();
    const aspect = cols / rows;            // uv units per metre differ by this ratio on the two axes
    material.uniforms.uFade.value.set(0.02, 0.02 * aspect);
    material.uniforms.uTick.value.set(0.03, 0.03 * aspect);
  }
  rebuild();

  const api = {
    mesh,
    get domain() { return { ...dom }; },
    get texture() { return texture; },
    get view() { return view; },
    get viewName() { return viewName; },
    get size() { return { widthM: dom.cols * dom.cellM, heightM: dom.rows * dom.cellM }; },
    setTexture(tex, d) {
      texture = tex || null;
      material.uniforms.uMap.value = texture;
      if (d) api.setDomain(d);
      mesh.visible = !!texture;
    },
    setDomain(d) { dom = normaliseDomain(d, dom); rebuild(); },
    setView(v, { animate = true } = {}) {
      if (v !== 'through' && v !== 'between') return false;
      view = v;
      const to = v === 'between' ? BETWEEN_RAD : 0;
      if (reduced || !animate) { tween = null; mesh.rotation.y = to; }
      else tween = { from: mesh.rotation.y, to, t0: performance.now() };
      return true;
    },
    setViewName(name) {
      viewName = name in VIEW_OPACITY ? name : viewName;
      material.uniforms.uOpacity.value = opacity * (VIEW_OPACITY[viewName] ?? 1);
    },
    setOpacity(o) { opacity = Math.max(0, Math.min(1, +o || 0)); api.setViewName(viewName); },
    setReducedMotion(r) { reduced = !!r; if (reduced && tween) { mesh.rotation.y = tween.to; tween = null; } },
    /* Advances the view rotation; true while it still turns. */
    update() {
      if (!tween) return false;
      const k = easeSite((performance.now() - tween.t0) / VIEW_MS);
      mesh.rotation.y = tween.from + (tween.to - tween.from) * k;
      if (k >= 1) { tween = null; return false; }
      return true;
    },
    /* A grid-space vector (gx along columns, gy along rows) as a world direction,
       through the mesh's current world matrix (call after updateMatrixWorld). */
    gridDirToWorld(gx, gy, out = new THREE.Vector3()) {
      return out.set(gy, -gx, 0).transformDirection(mesh.matrixWorld);
    },
    /* The quad's four world corners in order round its edge (uv 00, 10, 11, 01), for
       the label layout. */
    corners(out = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]) {
      mesh.updateMatrixWorld();
      [0, 1, 3, 2].forEach((v, i) => mesh.localToWorld(out[i].set(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2])));
      return out;
    },
    /* Grid cell coordinates to a world point through the current world matrix. */
    gridToWorld(col, row, out = new THREE.Vector3()) {
      gridToLocal(col, row, dom, noseY, out);
      return mesh.localToWorld(out);
    },
    dispose() { geometry.dispose(); material.dispose(); mesh.removeFromParent(); },
  };
  return api;
}
