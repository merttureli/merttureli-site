/* Camera path of the stack walk.
   Ten keyframes: the pad view, eight station stops and the final pull-out. Each
   keyframe is a pose {target, distance, azimuth, elevation}; the camera sits at
   target + distance along the spherical direction (azimuth around the rocket's
   axis, elevation above the target). Between keyframes every channel is a
   Catmull-Rom spline on non-uniform knots (the progress values), with
   Fritsch-Carlson tangent limiting so the walk never backs up, and a dwell
   easing per leg so the camera settles at each stop. Azimuth steps 35 deg per
   stop so the descent corkscrews; the pull-out completes one full turn so the
   lettering faces the visitor again at the end. Units: metres, radians,
   progress 0..1 of the range section. */
import * as THREE from 'three';
import { explodeAt, displacement } from './explode.js';
import { TUBE_IDS } from '../data/stations.js';

export const FOV_DEG = 36;                 // vertical field of view, as the explorer
export const PAD_VIEW = { distance: 1.9, elevationDeg: 8, azimuthDeg: 0 };
export const PULL_OUT = { distance: 2.6, elevationDeg: 12, azimuthDeg: 360 };
export const STATION_ELEVATION_DEG = 10;   // slightly above each stop, looking down the stack
export const STATION_DISTANCE_M = [0.2, 0.9]; // clamp of the fitted stop distance (metres)
export const STATION_MARGIN = 1.3;         // fit margin around the station's exploded box
export const PAD_MARGIN = 1.08;            // the standing rocket keeps this much air top and bottom
export const PULL_OUT_MARGIN = 1.06;
export const SCHEDULE = {
  padHold: 0.03,    // the camera holds the pad pose until here (hero copy reads)
  firstStop: 0.10,  // station 1
  lastStop: 0.88,   // station 8
  end: 1.0,         // pull-out complete
  dwell: 0.15,      // fraction of each leg spent settled at either end
  walkStart: 0.065, // a station becomes current halfway through the fly-in
  walkEnd: 0.94,    // and the last station lets go partway through the pull-out
};
const DEG = Math.PI / 180;

function smoothstep(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

const UP = new THREE.Vector3(0, 1, 0);
const _D = new THREE.Vector3(), _X = new THREE.Vector3(), _Y = new THREE.Vector3(), _c = new THREE.Vector3(), _q = new THREE.Vector3();
/* Unit direction from a target to a camera at (azimuth, elevation). */
export function direction(az, el, out = new THREE.Vector3()) { return out.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)); }

/* Exact distance at which a world-space box fits the view from (az, el).
   Dollying the camera along its own axis leaves each corner's camera-space x
   and y unchanged and only grows its depth, so for every corner the needed
   distance is  q.D + margin * max(|q.X| / h, |q.Y| / v)  where q is the corner
   relative to the box centre, D the camera direction, X and Y the camera's
   right and up (three.js lookAt basis), h and v the half-width and half-height
   of the view at unit depth. The maximum over the eight corners is the answer. */
export function fitBox(box, az, el, aspect, margin = STATION_MARGIN, fovDeg = FOV_DEG) {
  const v = Math.tan(fovDeg * DEG / 2), h = v * Math.max(0.1, aspect);
  direction(az, el, _D);
  _X.crossVectors(UP, _D).normalize(); if (_X.lengthSq() < 1e-8) _X.set(1, 0, 0);
  _Y.crossVectors(_D, _X);
  box.getCenter(_c);
  let d = 0;
  for (let i = 0; i < 8; i++) {
    _q.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).sub(_c);
    const need = _q.dot(_D) + margin * Math.max(Math.abs(_q.dot(_X)) / h, Math.abs(_q.dot(_Y)) / v);
    if (need > d) d = need;
  }
  return d;
}

/* Fritsch-Carlson limited Catmull-Rom tangents on non-uniform knots t. */
function tangents(t, y) {
  const n = t.length, m = new Float64Array(n), d = new Float64Array(n - 1);
  for (let i = 0; i < n - 1; i++) d[i] = (y[i + 1] - y[i]) / (t[i + 1] - t[i]);
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) { m[i] = 0; continue; }           // local extremum: flat
    let s = (y[i + 1] - y[i - 1]) / (t[i + 1] - t[i - 1]);      // Catmull-Rom
    const lim = 3 * Math.min(Math.abs(d[i - 1]), Math.abs(d[i]));
    if (Math.abs(s) > lim) s = Math.sign(s) * lim;              // no overshoot
    m[i] = s;
  }
  return m; // ends stay 0: the path starts and ends at rest
}
function hermite(y0, y1, m0, m1, h, u) {
  const u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * y0 + (u3 - 2 * u2 + u) * h * m0 + (-2 * u3 + 3 * u2) * y1 + (u3 - u2) * h * m1;
}

/* Build the path for the current viewport aspect.
     parts      enriched parts (center [x,y,z] m, bounds [[min],[max]] m, referenceOnly)
     stations   data/stations.js
     aspect     canvas width / height
     explodeOf  p -> e, the schedule or a constant override
     frontAngle absolute azimuth (rad) of the livery front; station azimuths are relative to it */
export function buildPath({ parts, stations, aspect = 1.6, explodeOf = explodeAt, frontAngle = 0 }) {
  const byId = new Map(parts.map(p => [p.id, p]));
  const CH = 6; // tx ty tz distance azimuth elevation
  const keys = [];
  const tmpBox = new THREE.Box3(), centre = new THREE.Vector3();
  const disp = [0, 0, 0];

  function exploded(part, e, box) {
    displacement(part, e, part.center, disp);
    box.min.set(part.bounds[0][0] + disp[0], part.bounds[0][1] + disp[1], part.bounds[0][2] + disp[2]);
    box.max.set(part.bounds[1][0] + disp[0], part.bounds[1][1] + disp[1], part.bounds[1][2] + disp[2]);
    return box;
  }
  function stackBox(e) {
    const box = new THREE.Box3();
    for (const p of parts) if (!p.referenceOnly) box.union(exploded(p, e, tmpBox));
    return box;
  }

  // 0: pad view, the whole rocket standing, unexploded
  const whole = stackBox(0);
  whole.getCenter(centre);
  const azPad = PAD_VIEW.azimuthDeg * DEG, elPad = PAD_VIEW.elevationDeg * DEG;
  // 1.9 m, or further when the viewport's vertical fov cannot hold the standing rocket at that distance
  const dPad = Math.max(PAD_VIEW.distance, fitBox(whole, azPad + frontAngle, elPad, aspect, PAD_MARGIN));
  keys.push({ p: SCHEDULE.padHold, kind: 'pad', label: 'Pad', v: [centre.x, centre.y, centre.z, dPad, azPad, elPad] });

  // 1..8: station stops at their progress, framed on the members as exploded at that progress
  const stops = [];
  for (const s of stations) {
    const p = SCHEDULE.firstStop + (SCHEDULE.lastStop - SCHEDULE.firstStop) * s.index / (stations.length - 1);
    const e = explodeOf(p);
    const box = new THREE.Box3();
    const members = s.partIds.map(id => byId.get(id)).filter(m => m && !TUBE_IDS.includes(m.id));
    for (const m of members) box.union(exploded(m, e, tmpBox));
    if (box.isEmpty()) box.setFromCenterAndSize(new THREE.Vector3(0, s.y, 0), new THREE.Vector3(0.07, 0.07, 0.07));
    box.getCenter(centre);
    const az = s.azimuth * DEG, el = STATION_ELEVATION_DEG * DEG;
    const d = Math.min(STATION_DISTANCE_M[1], Math.max(STATION_DISTANCE_M[0], fitBox(box, az + frontAngle, el, aspect, STATION_MARGIN)));
    keys.push({ p, kind: 'station', index: s.index, label: s.label, v: [centre.x, centre.y, centre.z, d, az, el] });
    stops.push(p);
  }

  // 9: pull-out facing the fully exploded stack
  const full = stackBox(explodeOf(SCHEDULE.end));
  full.getCenter(centre);
  const azEnd = PULL_OUT.azimuthDeg * DEG, elEnd = PULL_OUT.elevationDeg * DEG;
  // 2.6 m, or further when the exploded stack (about 2 m tall) needs it to fit
  const dEnd = Math.max(PULL_OUT.distance, fitBox(full, azEnd + frontAngle, elEnd, aspect, PULL_OUT_MARGIN));
  keys.push({ p: SCHEDULE.end, kind: 'pull-out', label: 'Pull-out', v: [centre.x, centre.y, centre.z, dEnd, azEnd, elEnd] });

  // spline tables
  const t = keys.map(k => k.p);
  const chans = [];
  for (let c = 0; c < CH; c++) { const y = keys.map(k => k.v[c]); chans.push({ y, m: tangents(t, y) }); }
  const legs = keys.length - 1;

  function evalAt(p, out) {
    if (p <= t[0]) { for (let c = 0; c < CH; c++) out[c] = chans[c].y[0]; return out; }
    if (p >= t[legs]) { for (let c = 0; c < CH; c++) out[c] = chans[c].y[legs]; return out; }
    let i = 0; while (i < legs - 1 && p >= t[i + 1]) i++;
    const h = t[i + 1] - t[i], u = (p - t[i]) / h;
    const a = i === 0 ? 0 : SCHEDULE.dwell, b = i === legs - 1 ? 0 : SCHEDULE.dwell;
    const ue = smoothstep(0, 1, (u - a) / (1 - a - b));
    for (let c = 0; c < CH; c++) { const ch = chans[c]; out[c] = hermite(ch.y[i], ch.y[i + 1], ch.m[i], ch.m[i + 1], h, ue); }
    return out;
  }
  const scratch = new Float64Array(CH);
  const halfLeg = (SCHEDULE.lastStop - SCHEDULE.firstStop) / (stations.length - 1) / 2;

  return {
    keys, stops, aspect,
    /* Pose at progress p. `out` is reused when given. */
    poseAt(p, out = { target: new THREE.Vector3(), distance: 0, azimuth: 0, elevation: 0, padWeight: 1 }) {
      evalAt(p, scratch);
      out.target.set(scratch[0], scratch[1], scratch[2]);
      out.distance = scratch[3]; out.azimuth = scratch[4]; out.elevation = scratch[5];
      out.padWeight = 1 - smoothstep(SCHEDULE.padHold, SCHEDULE.firstStop, p);
      return out;
    },
    /* 1 in the pad view and the final pull-out (everything solid), 1 during the walk is `descent`. */
    descentWeight(p) { return smoothstep(SCHEDULE.padHold, SCHEDULE.firstStop, p) * (1 - smoothstep(SCHEDULE.lastStop, SCHEDULE.walkEnd + 0.03, p)); },
    padWeight(p) { return 1 - smoothstep(SCHEDULE.padHold, SCHEDULE.firstStop, p); },
    /* Index of the current station or -1 (pad view, pull-out). */
    stationAt(p) {
      if (p < SCHEDULE.walkStart || p > SCHEDULE.walkEnd) return -1;
      let best = 0, bd = Infinity;
      for (let i = 0; i < stops.length; i++) { const d = Math.abs(p - stops[i]); if (d < bd) { bd = d; best = i; } }
      return best;
    },
    /* Per-station activeness 0..1: 1 within 30% of a half leg of the stop, 0 beyond 75%. Crossfades the opacity schedule. */
    weights(p, out = new Float64Array(stops.length)) {
      for (let i = 0; i < stops.length; i++) out[i] = 1 - smoothstep(0.3, 0.75, Math.abs(p - stops[i]) / halfLeg);
      return out;
    },
  };
}

/* World position of the camera for a pose; azimuth is relative to frontAngle. */
export function cameraPosition(pose, frontAngle, out = new THREE.Vector3()) {
  const az = pose.azimuth + frontAngle, el = pose.elevation, d = pose.distance;
  return out.set(
    pose.target.x + d * Math.sin(az) * Math.cos(el),
    pose.target.y + d * Math.sin(el),
    pose.target.z + d * Math.cos(az) * Math.cos(el),
  );
}
