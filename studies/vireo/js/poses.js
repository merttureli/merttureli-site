// Vireo poses: where the rocket is, per scroll position (the film) and per part (the "Look closer" view).
// A pose is what rig.js draws: tilt (rad, nose right of straight up), lean (nose toward the camera), roll (about
// the body), the station on the body axis that is looked at (CAD y, m), the camera distance (m), where that
// station sits in the reference frame (ox, oy in half widths and half heights, +y up) and how far the sections
// have slid apart (0..1). `land` is the 16:10 frame, `port` the 0.62 frame of a phone.
//
// The film runs on one number u: 0 the hero, 1 the statement (rocket upright at the side), 2 the start of the
// pinned "Inside" scene, 3 its end.
const H = Math.PI / 2;
export const ROLL0 = 0.5;          // the lettering toward the camera

export const FILM = {
  // The hero rocket leaves the way it points (it flies up and out before the page's words reach it), then comes
  // back standing at the side, rising behind the hero's last line, and waits there through the statement.
  land: [
    { u: 0.00, tilt: 1.19, lean: 0.22, roll: ROLL0, station: -0.02, dist: 2.1, ox: 0.06, oy: 0.31, explode: 0 },
    { u: 0.70, tilt: 1.19, lean: 0.22, roll: ROLL0 + 0.5, station: -0.02, dist: 2.1, ox: 1.9, oy: 1.47, explode: 0 },
    { u: 0.72, tilt: 0.5, lean: 0, roll: ROLL0 + 0.8, station: 0.5707, dist: 3.25, ox: 2.6, oy: -0.4, explode: 0 },
    { u: 0.74, tilt: 0, lean: 0, roll: ROLL0 + 1.1, station: 0.5707, dist: 3.25, ox: 0.8, oy: -1.25, explode: 0 },
    { u: 1.00, tilt: 0, lean: 0, roll: ROLL0 + 1.1, station: 0.5707, dist: 3.25, ox: 0.8, oy: 0.096, explode: 0 },
    { u: 1.26, tilt: 0, lean: 0, roll: ROLL0 + 1.1, station: 0.5707, dist: 3.25, ox: 0.8, oy: 0.844, explode: 0 },
    { u: 1.30, tilt: 0, lean: 0, roll: ROLL0 + 1.1, station: -0.02, dist: 3.25, ox: 0.8, oy: -0.011, explode: 0 },
    { u: 2.00, tilt: 0, lean: 0, roll: ROLL0 + 1.1, station: -0.02, dist: 3.25, ox: 0.8, oy: -0.011, explode: 0 },
    // apart, the whole length of it across the screen
    { u: 2.17, tilt: H, lean: 0.16, roll: 0.6, station: -0.093, dist: 3.35, ox: 0.0, oy: -0.1, explode: 0.55 },
    { u: 2.25, tilt: H, lean: 0.16, roll: 0.6, station: -0.093, dist: 3.35, ox: 0.0, oy: -0.1, explode: 0.55 },
    // the payload
    { u: 2.43, tilt: H - 0.1, lean: 0.30, roll: 0.62, station: 0.40, dist: 0.86, ox: -0.04, oy: 0.1, explode: 0.62 },
    { u: 2.52, tilt: H - 0.1, lean: 0.30, roll: 0.72, station: 0.40, dist: 0.86, ox: -0.04, oy: 0.1, explode: 0.62 },
    // the motor mount
    { u: 2.70, tilt: H + 0.1, lean: -0.24, roll: 1.1, station: -0.98, dist: 0.9, ox: 0.04, oy: 0.1, explode: 0.62 },
    { u: 2.78, tilt: H + 0.1, lean: -0.24, roll: 1.25, station: -0.98, dist: 0.9, ox: 0.04, oy: 0.1, explode: 0.62 },
    // back together, to be turned by hand
    { u: 2.94, tilt: 1.0, lean: 0.2, roll: ROLL0, station: -0.02, dist: 2.35, ox: 0.0, oy: 0.05, explode: 0 },
    { u: 3.00, tilt: 1.0, lean: 0.2, roll: ROLL0, station: -0.02, dist: 2.35, ox: 0.0, oy: 0.05, explode: 0 },
  ],
  port: [
    { u: 0.00, tilt: 0.79, lean: 0.22, roll: ROLL0, station: 0.5707, dist: 2.5, ox: 0.74, oy: 0.76, explode: 0 },
    { u: 0.30, tilt: 0.79, lean: 0.22, roll: ROLL0 + 0.4, station: 0.5707, dist: 2.5, ox: 3.41, oy: 2.41, explode: 0 },
    { u: 0.34, tilt: 0.3, lean: 0, roll: ROLL0 + 0.8, station: 0.5707, dist: 3.0, ox: 3.4, oy: -0.5, explode: 0 },
    { u: 0.40, tilt: 0, lean: 0, roll: ROLL0 + 1.1, station: 0.5707, dist: 3.4, ox: 0.82, oy: -2.3, explode: 0 },
    { u: 0.92, tilt: 0, lean: 0, roll: ROLL0 + 1.1, station: 0.5707, dist: 3.4, ox: 0.82, oy: 0.83, explode: 0 },
    { u: 1.00, tilt: 0, lean: 0, roll: ROLL0 + 1.1, station: -0.02, dist: 3.4, ox: 0.82, oy: 0.013, explode: 0 },
    { u: 2.00, tilt: 0, lean: 0, roll: ROLL0 + 1.1, station: -0.02, dist: 3.4, ox: 0.82, oy: 0.013, explode: 0 },
    { u: 2.17, tilt: 0, lean: 0, roll: 0.6, station: -0.093, dist: 5.4, ox: 0.66, oy: 0.0, explode: 0.55 },
    { u: 2.25, tilt: 0, lean: 0, roll: 0.6, station: -0.093, dist: 5.4, ox: 0.66, oy: 0.0, explode: 0.55 },
    { u: 2.43, tilt: 1.0, lean: 0.28, roll: 0.62, station: 0.40, dist: 1.3, ox: 0.05, oy: 0.2, explode: 0.62 },
    { u: 2.52, tilt: 1.0, lean: 0.28, roll: 0.72, station: 0.40, dist: 1.3, ox: 0.05, oy: 0.2, explode: 0.62 },
    { u: 2.70, tilt: 1.0, lean: -0.2, roll: 1.1, station: -0.98, dist: 1.25, ox: 0.0, oy: 0.2, explode: 0.62 },
    { u: 2.78, tilt: 1.0, lean: -0.2, roll: 1.25, station: -0.98, dist: 1.25, ox: 0.0, oy: 0.2, explode: 0.62 },
    { u: 2.94, tilt: 0.6, lean: 0.2, roll: ROLL0, station: -0.02, dist: 3.3, ox: 0.0, oy: 0.08, explode: 0 },
    { u: 3.00, tilt: 0.6, lean: 0.2, roll: ROLL0, station: -0.02, dist: 3.3, ox: 0.0, oy: 0.08, explode: 0 },
  ],
};

// The pinned scene's words, by its own progress p = u - 2: [fade in from, full from, full to, gone by].
export const INSIDE_UI = {
  title: [-1, -0.5, 0.19, 0.25],
  caps: [[0.12, 0.17, 0.24, 0.29], [0.38, 0.43, 0.52, 0.57], [0.65, 0.70, 0.78, 0.83]],
  chip: [0.9, 0.95, 2, 3],
};
export const TURN_FROM = 0.9;      // p from which the model can be turned by hand

const KEYS = ['tilt', 'lean', 'roll', 'station', 'ox', 'oy', 'explode'];
const ease = t => t * t * (3 - 2 * t);
export function poseAt(list, u, out = {}) {
  let i = 0;
  while (i < list.length - 2 && u > list[i + 1].u) i++;
  const a = list[i], b = list[i + 1];
  const t = ease(Math.min(1, Math.max(0, (u - a.u) / (b.u - a.u || 1))));
  for (const k of KEYS) out[k] = a[k] + (b[k] - a[k]) * t;
  out.dist = Math.exp(Math.log(a.dist) + (Math.log(b.dist) - Math.log(a.dist)) * t);
  return out;
}
export const band = ([a, b, c, d], p) => (p <= a || p >= d ? 0 : p < b ? (p - a) / (b - a) : p <= c ? 1 : 1 - (p - c) / (d - c));

// "Look closer": which CAD parts stay solid (ids as in assets/charger-explorer/part-stories.js) and the view.
// `land` puts the subject right of the list; on a phone the view has its own box above the list.
export const CLOSER = {
  whole: { ids: null, land: { tilt: 0.62, lean: 0.2, roll: ROLL0, station: -0.02, dist: 2.9, ox: 0.34, oy: 0.0 }, port: { tilt: 0.8, lean: 0.2, roll: ROLL0, station: -0.02, dist: 3.5, ox: 0, oy: 0 } },
  nose: { ids: [0], land: { tilt: 0.5, lean: 0.3, roll: 0.9, station: 0.43, dist: 1.1, ox: 0.36, oy: -0.02 }, port: { tilt: 0.7, lean: 0.3, roll: 0.9, station: 0.45, dist: 1.25, ox: 0, oy: 0 } },
  payload: { ids: [14, 15, 17, 23, 24, 25], land: { tilt: 0.5, lean: 0.3, roll: 0.62, station: 0.22, dist: 1.2, ox: 0.36, oy: 0.0 }, port: { tilt: 0.7, lean: 0.3, roll: 0.62, station: 0.23, dist: 1.45, ox: 0, oy: 0 } },
  camera: { ids: [15, 17, 14], land: { tilt: 0.5, lean: 0.55, roll: 2.2, station: 0.335, dist: 0.52, ox: 0.36, oy: 0.0 }, port: { tilt: 0.7, lean: 0.55, roll: 2.2, station: 0.335, dist: 0.6, ox: 0, oy: 0 } },
  mount: { ids: [18, 19, 5], land: { tilt: 0.62, lean: -0.3, roll: 1.2, station: -0.56, dist: 0.9, ox: 0.4, oy: 0.06 }, port: { tilt: 0.7, lean: -0.3, roll: 1.2, station: -0.535, dist: 0.95, ox: 0, oy: 0 } },
  fins: { ids: [6, 7, 8, 9], land: { tilt: 0.62, lean: -0.42, roll: 0.9, station: -0.52, dist: 0.95, ox: 0.4, oy: 0.06 }, port: { tilt: 0.7, lean: -0.42, roll: 0.9, station: -0.5, dist: 1.1, ox: 0, oy: 0 } },
  recovery: { ids: [26], land: { tilt: 0.5, lean: 0.25, roll: 0.3, station: -0.4, dist: 0.66, ox: 0.36, oy: 0.0 }, port: { tilt: 0.7, lean: 0.25, roll: 0.3, station: -0.4, dist: 0.75, ox: 0, oy: 0 } },
};
