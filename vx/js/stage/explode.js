/* Explode displacement and the opacity schedule of the stack walk.
   The displacement is the CHARGER explorer's (assets/charger-explorer/app.js,
   updatePositions): every part moves away from the stack axis along a golden
   angle so neighbours never overlap, and along the axis by three quarters of
   its own height above the origin. Units: metres (bounds in assembly.json are
   millimetres, the explorer scales by 0.001). */
import { BAND_M, TUBE_IDS } from '../data/stations.js';

/* Progress window of the explode ramp (fraction of the range section). */
export const EXPLODE_START = 0.12;
export const EXPLODE_END = 0.85;
/* Golden angle in radians; id x 2.39996 spreads the parts around the axis. */
export const GOLDEN_ANGLE = 2.39996;
/* Radial throw in metres for parts that sit on the axis (|c.x| and |c.z| under 5 mm). */
export const RADIAL_M = 0.12;
/* Axial stretch factor: a part at y moves to y x (1 + 0.75 e). */
export const AXIAL = 0.75;
/* Parts further than 5 mm off the axis keep their own direction, doubled. */
export const OFF_AXIS_M = 0.005;

/* e(p): 0 before EXPLODE_START, 1 after EXPLODE_END, linear between. */
export function explodeAt(p) {
  const t = (p - EXPLODE_START) / (EXPLODE_END - EXPLODE_START);
  return t <= 0 ? 0 : t >= 1 ? 1 : t;
}

/* Bounds centre in metres: (min + max) x 0.0005. */
export function centreOf(part) {
  const b = part.bounds;
  return [(b[0][0] + b[1][0]) * 0.0005, (b[0][1] + b[1][1]) * 0.0005, (b[0][2] + b[1][2]) * 0.0005];
}

/* Displacement vector for a part at explode amount e (0..1). `centre` is the
   bounds centre in metres (centreOf); pass it to avoid recomputing per frame. */
export function displacement(part, e, centre = centreOf(part), out = [0, 0, 0]) {
  const [cx, cy, cz] = centre;
  const angle = part.id * GOLDEN_ANGLE;
  out[0] = (Math.abs(cx) > OFF_AXIS_M ? cx * 2 : Math.cos(angle) * RADIAL_M) * e;
  out[1] = cy * AXIAL * e;
  out[2] = (Math.abs(cz) > OFF_AXIS_M ? cz * 2 : Math.sin(angle) * RADIAL_M) * e;
  return out;
}

/* Opacity levels of the schedule (ARCHITECTURE.md section 4). */
export const OPACITY = {
  active: 1,     // the current station's parts
  context: 0.5,  // parts within BAND_M of the station centre but not listed
  tube: 0.18,    // exterior body tubes, so the interior reads
  dim: 0.12,     // everything else, drawn as edges only
};

/* Appearance of one part for this frame.
     weights     per-station activeness 0..1 (path.weights), crossfades stations
     stationsOf  Map part id -> station indexes
     nearest     the current station object or null
     descent     0 in the pad view and the final pull-out (everything solid), 1 during the walk
   Returns { opacity, edgesOnly, active }. `active` is 0..1 and drives colour and wire strength. */
export function appearance(part, { weights, stationsOf, nearest, descent }) {
  if (part.referenceOnly) return { opacity: 0, edgesOnly: false, active: 0 };
  const tube = TUBE_IDS.includes(part.id);
  let active = 0;
  if (!tube) {
    const list = stationsOf.get(part.id);
    if (list) for (const i of list) if (weights[i] > active) active = weights[i];
  }
  let base, edges = false;
  if (tube) base = OPACITY.tube;
  else if (nearest && Math.abs(part.center[1] - nearest.y) <= BAND_M) base = OPACITY.context;
  else { base = OPACITY.dim; edges = true; }
  const scheduled = base + (OPACITY.active - base) * active;
  const opacity = 1 + (scheduled - 1) * descent;
  return { opacity, edgesOnly: edges && active < 0.5 && descent > 0.5, active: active * descent };
}
