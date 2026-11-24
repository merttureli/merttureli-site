// Batterymate: how the machine is seen. Viewing angles, what is framed, and the pose table of the scroll scene.
// Plain data and one function, no three.js: the stills are rendered from the same table (see NOTES.md).
//
// A view is { yaw, pitch (radians, the machine turns, the camera does not), boxes (what must fit, model space, m:
// [x0, y0, z0, x1, y1, z1]), fill (0: laid out as the still is; 1: fills its window), align (in that rect) }.

// The whole machine, as four boxes that hug it: bed and ramps, backstop, feeder, thrower.
const ALL = [[-1.055, 0, -.435, .475, .27, .435], [-1.09, .13, -.44, .476, 1.672, -.39], [.468, .02, -.432, .7, .386, -.06], [.635, 0, -.315, 1.075, .53, .17]];

// The rendered still (assets/machine-hero-*.webp): its shape, and the room kept around the machine for its shadow
// (top, right, bottom, left, as shares of the image).
export const STILL = { aspect: 1.04, pad: [.012, .035, .055, .035] };

// The hero: three quarters from the front left, the net tall at the back, the thrower nearest.
export const HERO = { yaw: .5, pitch: .26, boxes: ALL, align: [.5, 1], fill: 0 };

// The pitch the scroll scene shows: from the front left, into the net.
export const PITCH = { from: [-1.5, 1.7, 4.4], aim: [-.42, 1.0] };

// Covers that lift off in the scroll scene so the feeder and the wheels can be seen: how far each goes (m).
export const OPEN = { cage: [0, .5, 0], throwerPlates: [0, .34, 0] };

const ease = t => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const win = (t, a, b) => (t <= a ? 0 : t >= b ? 1 : (t - a) / (b - a));
const mix = (a, b, t) => a + (b - a) * t;

// Key views of the scroll scene.
const one = box => ALL.map(() => box);
const WIDE = HERO;
const FEED = { yaw: .2, pitch: .34, boxes: one([.1, 0, -.44, 1.08, .9, .3]), fill: 1, align: [.5, .5] };
const THROW = { yaw: -.35, pitch: .3, boxes: one([.3, 0, -.44, 1.08, .9, .44]), fill: 1, align: [.5, .5] };

function blend(a, b, t) {
  if (t <= 0) return a;
  if (t >= 1) return b;
  return { yaw: mix(a.yaw, b.yaw, t), pitch: mix(a.pitch, b.pitch, t), boxes: a.boxes.map((A, k) => A.map((v, i) => mix(v, b.boxes[k][i], t))), fill: mix(a.fill, b.fill, t), align: [mix(a.align[0], b.align[0], t), mix(a.align[1], b.align[1], t)] };
}

// Scroll progress p (0..1 over the pinned section) -> { step 0..2, t (seconds into the recorded catch), view, open, ball }.
// Three steps of equal scroll: CATCH (the pitch, the net, the bed, into the chamber), TURN (the half turn), RETURN
// (the elbow, the wheels, the throw).
export function storyAt(p, take) {
  const M = take.marks, x = p * 3, step = Math.min(2, Math.floor(x)), u = x - step;
  let t;
  if (step === 0) t = mix(.12, M.chamber + .02, ease(win(u, .04, .96)));
  else if (step === 1) t = mix(M.turn, M.exit, win(u, .1, .9));
  else t = mix(M.exit, take.end - 1 / 120, win(u, .08, .92) ** 1.15);
  const open = ease(win(x, .0, .22));
  const a = ease(win(x, .55, 1.12)), b = ease(win(x, 1.82, 2.2)), c = ease(win(x, 2.72, 3));
  let view = blend(WIDE, FEED, a);
  if (b > 0) view = blend(FEED, THROW, b);
  if (c > 0) view = blend(THROW, WIDE, c * .6);
  return { step, u, t, view, open, ball: true };
}
