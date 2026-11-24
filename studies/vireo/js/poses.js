// Vireo poses: where the rocket is, per scroll position (the film) and per part (the "Look closer" view).
// A pose is what rig.js draws: tilt (rad, nose right of straight up), lean (nose toward the camera), roll (about
// the body), the station on the body axis that is looked at (CAD y, m), the camera distance (m), where that
// station sits in the reference frame (ox, oy in half widths and half heights, +y up) and how far the sections
// have slid apart (0..1). `land` is the 16:10 frame, `port` the 0.62 frame of a phone.
//
// The film runs on one number u: 0 the hero, 1 the statement (rocket upright at the side), 2 the start of the
// pinned "Inside" scene, 3 its end. `pull` (0..1) takes the interior parts out of their tubes to the side (rig.js
// PULL); `side` moves the focus across the airframe by that many meters, so a close-up can sit on a pulled part.
//
// The rocket never leaves the stage: the hero copy fades and lifts first (vireo.js), then the rocket turns in
// place to stand at the side of the statement. Before the pin it turns again to lie on the diagonal of the screen,
// comes apart along it, the interior parts come out of the tubes, the camera moves in to the payload and to the
// motor mount, and the rocket goes back together in the middle of the screen to be turned by hand.
export const ROLL0 = 0.5;          // the lettering toward the camera
const P = (u, tilt, lean, roll, station, dist, ox, oy, explode = 0, pull = 0, side = 0) => ({ u, tilt, lean, roll, station, dist, ox, oy, explode, pull, side });
const D = 1.13;                    // the diagonal: the nose 25 degrees above the horizontal
export const FILM = {
  land: [
    P(0.00, 1.19, 0.22, ROLL0, -0.02, 2.1, 0.06, 0.31),
    P(0.24, 1.19, 0.22, ROLL0 + 0.1, -0.02, 2.1, 0.06, 0.31),
    P(0.43, 0.8, 0.15, ROLL0 + 0.3, -0.02, 2.95, 0.36, 0.02),
    P(0.66, 0.28, 0.05, ROLL0 + 0.6, -0.02, 3.45, 0.68, -0.02),
    P(0.92, 0, 0, ROLL0 + 0.8, -0.02, 3.7, 0.84, -0.02),
    P(1.70, 0, 0, ROLL0 + 1.0, -0.02, 3.7, 0.84, 0.04),
    // onto the diagonal, whole, in the middle of the screen
    P(2.00, D, 0.1, 0.6, -0.1, 3.0, 0.02, -0.06),
    P(2.04, D, 0.1, 0.6, -0.1, 3.0, 0.02, -0.06),
    // apart along it, then the insides out to the side
    P(2.16, D, 0.1, 0.62, -0.1, 3.15, 0.0, -0.03, 0.6, 0),
    P(2.25, D, 0.1, 0.64, -0.1, 3.2, 0.0, -0.03, 0.6, 1),
    P(2.33, D, 0.1, 0.66, -0.1, 3.2, 0.0, -0.03, 0.6, 1),
    // the payload
    P(2.44, D - 0.12, 0.3, 0.62, 0.4, 0.92, -0.12, 0.13, 0.6, 1, 0.105),
    P(2.54, D - 0.12, 0.3, 0.72, 0.4, 0.92, -0.12, 0.13, 0.6, 1, 0.105),
    // along the airframe, out a little on the way
    P(2.60, D, 0.05, 0.9, -0.3, 1.9, -0.02, 0.05, 0.6, 1, 0),
    // the motor mount
    P(2.66, D + 0.06, -0.24, 1.1, -0.95, 0.95, -0.04, 0.1, 0.6, 1, -0.03),
    P(2.76, D + 0.06, -0.24, 1.25, -0.95, 0.95, -0.04, 0.1, 0.6, 1, -0.03),
    // back together in the middle, to be turned by hand
    P(2.87, 1.0, 0.2, ROLL0, -0.02, 2.5, 0.0, 0.02),
    P(3.00, 1.0, 0.2, ROLL0, -0.02, 2.5, 0.0, 0.02),
  ],
  // a phone: no wide shot (the stack would be a few pixels across); close-ups where the parts are large
  port: [
    P(0.00, 0.79, 0.22, ROLL0, 0.5707, 2.5, 0.74, 0.76),
    P(0.24, 0.79, 0.22, ROLL0 + 0.1, 0.5707, 2.5, 0.74, 0.76),
    P(0.62, 0.3, 0.08, ROLL0 + 0.5, 0.2, 3.4, 0.78, 0.12),
    P(0.95, 0, 0, ROLL0 + 0.8, -0.02, 3.6, 0.79, -0.04),
    P(1.70, 0, 0, ROLL0 + 1.0, -0.02, 3.6, 0.79, 0.0),
    // whole, on a diagonal of the phone, above the words at the bottom
    P(2.00, 0.62, 0.12, 0.6, -0.02, 3.3, 0.0, -0.2),
    P(2.09, 0.62, 0.12, 0.6, -0.02, 3.3, 0.0, -0.2),
    // apart: the camera moves in on the upper half, the payload comes out of its tube to the side
    P(2.19, 0.66, 0.12, 0.62, 0.46, 2.3, -0.12, 0.3, 0.6, 0),
    P(2.26, 0.66, 0.12, 0.64, 0.46, 2.3, -0.12, 0.3, 0.6, 1, 0.05),
    P(2.33, 0.66, 0.12, 0.66, 0.46, 2.3, -0.12, 0.3, 0.6, 1, 0.05),
    // the payload
    P(2.44, 0.95, 0.3, 0.62, 0.4, 1.0, 0.0, 0.24, 0.6, 1, 0.105),
    P(2.54, 0.95, 0.3, 0.72, 0.4, 1.0, 0.0, 0.24, 0.6, 1, 0.105),
    P(2.60, 0.85, 0.05, 0.9, -0.3, 2.3, 0.0, 0.12, 0.6, 1, 0),
    // the motor mount
    P(2.66, 1.05, -0.2, 1.1, -0.98, 1.1, 0.06, 0.1, 0.6, 1, -0.03),
    P(2.76, 1.05, -0.2, 1.25, -0.98, 1.1, 0.06, 0.1, 0.6, 1, -0.03),
    P(2.87, 0.6, 0.2, ROLL0, -0.02, 3.8, 0.0, -0.08),
    P(3.00, 0.6, 0.2, ROLL0, -0.02, 3.8, 0.0, -0.08),
  ],
};

// The pinned scene's words, by its own progress p = u - 2: [fade in from, full from, full to, gone by].
export const INSIDE_UI = {
  title: [-0.2, -0.08, 0.06, 0.1],
  caps: [[0.13, 0.17, 0.32, 0.36], [0.38, 0.42, 0.55, 0.59], [0.61, 0.65, 0.77, 0.81]],
  chip: [0.82, 0.86, 0.95, 1.0],
  out: [0.95, 1.0],                 // the model fades and steps back before the stage lets go
};
export const TURN_FROM = 0.84;     // p from which the model can be turned by hand

// Where the rocket lies in the hero still's frame (left, top, right, bottom, as fractions), measured from the
// render of FILM.*[0]: vireo.js fits it between the bar and the hero copy before three.js is loaded.
export const HERO_BOX = { land: [0.158, 0.0789, 0.9309, 0.6422], port: [0, 0.1198, 0.8701, 0.7075] };

const KEYS = ['tilt', 'lean', 'roll', 'station', 'ox', 'oy', 'explode', 'pull', 'side'];
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
