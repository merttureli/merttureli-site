// Batterymate: how the machine is seen. Viewing angles, what is framed, and the pose table of the scroll scene.
// Plain data and one function, no three.js: the stills are rendered from the same table (see NOTES.md).
//
// A view is { yaw, pitch (radians: the machine turns, the camera does not), boxes (what must fit, model space, m:
// [x0, y0, z0, x1, y1, z1]), fill (0: laid out as the still is; 1: fills its window), align (in that rect) }.
import { TURN_S, turnTime } from './sim.js';

// The whole machine, as four boxes that hug it: bed and ramps, backstop, feeder, thrower.
const ALL = [[-1.055, 0, -.435, .475, .27, .435], [-1.09, .13, -.44, .476, 1.672, -.39], [.468, .02, -.432, .7, .386, -.06], [.635, 0, -.315, 1.075, .53, .17]];

// The rendered still (assets/machine-hero-*.webp): its shape, and the room kept around the machine for its shadow
// (top, right, bottom, left, as shares of the image).
export const STILL = { aspect: 1.04, pad: [.012, .035, .055, .035] };

// The hero: three quarters from the front left, the net tall at the back, the thrower nearest.
export const HERO = { yaw: .5, pitch: .26, boxes: ALL, align: [.5, 1], fill: 0 };

// The pitch the scroll scene shows: from the front left, into the net.
export const PITCH = { from: [-4.4, 1.5, 3.2], aim: [-.38, 1.02] };

// What comes off in the scroll scene so the feeder and the wheels can be seen, and how far each goes (m): the cage
// and the thrower's plates lift, the ground ball ramps slide forward.
export const OPEN = { cage: [0, .62, 0], throwerPlates: [0, .42, 0], groundRamps: [0, 0, .5] };

const ease = t => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const win = (t, a, b) => (t <= a ? 0 : t >= b ? 1 : (t - a) / (b - a));
const mix = (a, b, t) => a + (b - a) * t;

// Key views of the scroll scene.
const one = box => ALL.map(() => box);
const WIDE = HERO;
const BED = { yaw: .46, pitch: .3, boxes: one([-.62, 0, -.44, 1.08, 1.02, .5]), fill: 1, align: [.5, .5] };    // the ball rolls to the feeder
const DRUM = { yaw: .5, pitch: .4, boxes: one([.3, 0, -.44, .98, .52, .0]), fill: 1, align: [.5, .5] };       // the dual chamber
const WHEELS = { yaw: -.3, pitch: .3, boxes: one([.42, 0, -.44, 1.08, .6, .28]), fill: 1, align: [.5, .5] };  // the elbow and the flywheels
const OUT = { yaw: -.05, pitch: .28, boxes: one([-.2, 0, -.44, 1.08, 1.1, 1.3]), fill: 1, align: [.5, .5] };   // the ball leaves

function blend(a, b, t) {
  if (t <= 0) return a;
  if (t >= 1) return b;
  return { yaw: mix(a.yaw, b.yaw, t), pitch: mix(a.pitch, b.pitch, t), boxes: a.boxes.map((A, k) => A.map((v, i) => mix(v, b.boxes[k][i], t))), fill: mix(a.fill, b.fill, t), align: [mix(a.align[0], b.align[0], t), mix(a.align[1], b.align[1], t)] };
}

// The pose table, keyed by scroll: p (0..1 over the pinned section) -> { step, t (seconds into the recorded catch),
// view, open (0..1), ball }. Three steps of equal scroll, x = 3p:
//   0..1  CATCH   the covers come off; the pitch, the net, the drop, the roll down the bed, into the lower chamber
//   1..2  TURN    close on the dual chamber; its half turn follows the scroll evenly
//   2..3  RETURN  round to the elbow and the wheels; the ball runs out, is gripped and thrown; the machine closes
export function storyAt(p, take) {
  const M = take.marks, x = p * 3, step = Math.min(2, Math.floor(x)), u = x - step;
  let t, view;
  if (step === 0) {
    t = mix(.1, M.chamber, ease(win(u, .03, .93)) * .55 + win(u, .03, .93) * .45);
    view = blend(blend(WIDE, BED, ease(win(u, .42, .8))), DRUM, ease(win(u, .8, 1.12)));
  } else if (step === 1) {
    t = M.turn + TURN_S * turnTime(win(u, .14, .86));
    view = blend(blend(BED, DRUM, ease(win(u, -.2, .12))), WHEELS, ease(win(u, .88, 1.2)));
  } else {
    const run = win(u, .05, .5), fly = win(u, .5, .84);
    t = fly > 0 ? mix(M.out, take.end - 1 / 120, fly) : mix(M.exit, M.out, run);
    view = blend(blend(blend(DRUM, WHEELS, ease(win(u, -.12, .2))), OUT, ease(win(u, .46, .7))), WIDE, ease(win(u, .8, 1)));
  }
  const open = ease(win(x, .0, .24)) * (1 - ease(win(x, 2.78, 3)));
  return { step, u, t, view, open, ball: p > .002 && p < .998 && !(step === 2 && u > .84) };
}
