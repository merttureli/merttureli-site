/* Exhaust plume for the CHARGER field scene (FIELD.md section 6): additive sprites
   behind the nozzle, scaled by thrust, off at tier 0. Purely a visual reading of
   the thrust value the flight model passes in; nothing here is a combustion model.

   The plume group lives in the rocket's CAD frame with its origin at the nozzle
   exit (aft face of the motor screw cap, CAD y = -0.6102 m) and extends along -y.
   Plume length and width grow with T / T_REF. Flicker (sprites drifting aft and a
   small per-frame jitter) runs only at tier 1 and above and never under
   prefers-reduced-motion; the plume then holds a still frame at the same size.
   A warm point light at the nozzle (tier 2 and above) lights the airframe; it
   stays in the scene at intensity 0 when off so the light count, and with it every
   compiled shader program, never changes. */
import * as THREE from 'three';

export const NOZZLE_Y = -0.6102;          // CAD, aft face of the motor screw cap (m)
export const T_REF_N = 100;               // EST, plume reference thrust (N); the G77R averages about 77 N by its designation
const COUNT = 22;                         // sprites in the plume
const LEN_M = [0.15, 1.1];                // plume length (m) at T -> 0 and at T_REF
const WIDTH_M = [0.04, 0.18];             // sprite size (m) at the nozzle and at the plume's end, at T_REF
const FLOW_HZ = 2.6;                      // sprite drift, plume lengths per second
const JITTER = 0.1;                       // per-frame size jitter (fraction)
const LIGHT_PEAK = 5;                     // point light intensity at T_REF (three's physical units, candela)
const LIGHT_RANGE_M = 7;

/* Colour along the plume, s = 0 at the nozzle to 1 at the end: white-hot core,
   amber, the livery orange, the deep livery red. */
const STOPS = [[0, [1.0, 0.95, 0.84]], [0.18, [1.0, 0.72, 0.36]], [0.5, [0.84, 0.23, 0.03]], [1, [0.54, 0.04, 0.10]]];
function colourAt(s, out) {
  for (let i = 1; i < STOPS.length; i++) {
    if (s <= STOPS[i][0]) {
      const [s0, a] = STOPS[i - 1], [s1, b] = STOPS[i], k = (s - s0) / (s1 - s0);
      return out.setRGB(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, THREE.SRGBColorSpace);
    }
  }
  const c = STOPS[STOPS.length - 1][1];
  return out.setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace);
}

function glowTexture() {
  const size = 64, c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  if (g) {
    const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, size, size);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* Deterministic hash noise so the jitter is the same on every run (no Math.random). */
function hash(n) { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

export function createExhaust({ tier = 3, reducedMotion = false } = {}) {
  const group = new THREE.Group();
  group.name = 'exhaust';
  group.position.set(0, NOZZLE_Y, 0);
  const texture = glowTexture();
  const sprites = [];
  const col = new THREE.Color();
  for (let i = 0; i < COUNT; i++) {
    const m = new THREE.SpriteMaterial({ map: texture, color: 0xffffff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, depthTest: true });
    const s = new THREE.Sprite(m);
    s.renderOrder = 30;
    group.add(s); sprites.push(s);
  }
  // nozzle glow, larger and dimmer, fixed at the exit
  const glowMat = new THREE.SpriteMaterial({ map: texture, color: 0xffd9a0, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
  const glow = new THREE.Sprite(glowMat); glow.renderOrder = 31; group.add(glow);
  const light = new THREE.PointLight(0xffa850, 0, LIGHT_RANGE_M, 2);
  light.position.set(0, -0.12, 0);
  group.add(light);

  let phase = 0, frame = 0, thrust = 0, level = 0;
  let reduced = !!reducedMotion, t = tier | 0;

  function layout(k, jitter) {
    const len = LEN_M[0] + (LEN_M[1] - LEN_M[0]) * Math.min(1.4, k);
    const widthK = 0.55 + 0.45 * Math.min(1.2, k);
    for (let i = 0; i < COUNT; i++) {
      const s = ((i + phase) % COUNT) / COUNT;                    // 0 at the nozzle, 1 at the end
      const sp = sprites[i];
      const j = jitter ? 1 + JITTER * (2 * hash(i * 13 + frame) - 1) : 1;
      const w = (WIDTH_M[0] + (WIDTH_M[1] - WIDTH_M[0]) * Math.pow(s, 0.8)) * widthK * j;
      sp.position.set(0, -s * len, 0);
      sp.scale.set(w, w * (1 + 0.6 * (1 - s)), 1);
      colourAt(s, col);
      sp.material.color.copy(col);
      // fade in over the first 4 percent (no hard edge at the nozzle) and out to the end
      sp.material.opacity = Math.min(1, s / 0.04) * Math.pow(1 - s, 1.4) * Math.min(1, 0.35 + k) * 0.9;
    }
    const g = 0.1 * widthK * (jitter ? 1 + 0.5 * JITTER * (2 * hash(frame * 7) - 1) : 1);
    glow.position.set(0, -0.03, 0);
    glow.scale.set(g * 1.8, g * 2.2, 1);
    glowMat.opacity = Math.min(1, 0.45 + k * 0.6) * 0.9;
  }

  return {
    group, light,
    /* dt in seconds of wall time, thrustN in newtons. Returns true while the plume
       wants another frame (visible and flickering). */
    update(dt, thrustN) {
      thrust = Number.isFinite(thrustN) ? Math.max(0, thrustN) : 0;
      const k = thrust / T_REF_N;
      const on = t > 0 && k > 0.005;
      group.visible = on;
      level = on ? k : 0;
      light.intensity = on && t >= 2 ? LIGHT_PEAK * Math.min(1.3, k) : 0;
      if (!on) return false;
      const flicker = !reduced && t >= 1;
      if (flicker) { phase = (phase + Math.min(0.1, Math.max(0, dt)) * FLOW_HZ * COUNT) % COUNT; frame++; }
      layout(k, flicker);
      return flicker;
    },
    get level() { return level; },
    get visible() { return group.visible; },
    setTier(n) { t = n | 0; },
    setReducedMotion(r) { reduced = !!r; },
    dispose() {
      texture.dispose();
      for (const s of sprites) s.material.dispose();
      glowMat.dispose();
      light.dispose?.();
      group.removeFromParent();
    },
  };
}
