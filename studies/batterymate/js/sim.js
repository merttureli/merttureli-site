// Batterymate: the game of catch as a small simulation in the machine's own space (meters, +Y up, +Z the front,
// where the thrower stands).
//
// The mechanism is the Robo-Catcher's, and its numbers are the showreel actor's (next/js/showreel/robo-catcher.js):
// the ball's way through the feeder in CAD mm, the net as a critically damped pocket, the dead bounce on the rubber
// bed, the half turn of the dual chamber, the grip and the throw. That actor poses two balls as a pure function of
// reel time. Here a ball can be thrown from anywhere at any time, so the same steps run as a state machine with a
// queue at the feeder. No three.js import: the page's own THREE is passed in.
//
//   const sim = createSim({ THREE, model, radius });
//   sim.throwBall(origin, aimX, aimY) -> ball | null     origin: Vector3, aim: a point on the net (model x, y)
//   sim.step(dt)                                         advance, then write the net, the chamber and the wheels
//   sim.balls                                            [{ on, p, q, squash, xray, state, origin, id }]
//   sim.record(origin, aimX, aimY) -> take               one whole catch, sampled, for the scroll scene
//   sim.busy                                             anything still moving
//   sim.on = (type, ball) => {}                          'net', 'grip', 'returned'

// ---- the machine, CAD mm (catcher_mesh.npz part list; meta.source.shift_mm takes CAD mm to model space)
const SHIFT = [285.3485, -621.6494, -1387.8047];
const BALL_R = 47.6;
const AX_INDEXER = [816.408, 1141.89];             // indexer shaft (y, z); it turns about x
const LOWER = [273.9, 707.3, 1138.4];              // lower chamber
const EXIT_RAMP = [347, 913, 1142];
const TUBE_IN = [372, 922, 1143.8];                // transfer elbow
const TUBE_BEND = [396, 922, 1320 - 176];
const TUBE_OUT = [572, 922, 1320];
const GRIP = [571, 920, 1404];                     // between the flywheels
const NET_Z = 989;                                 // the net plane
// the catch bed: two sheets sloping down to the feeder
const rampY = x => (x < -573.5 ? 835.2 + (x + 1334.6) * (759.1 - 835.2) / (1334.6 - 572.6) : 761.2 + (x + 574.3) * (683.0 - 761.2) / (187.5 + 574.3));

// ---- physics, real units
const G = 9.81;
const ROLL = 5 / 7;                                // a solid ball rolling without slipping
const SLOPE = .101;                                // the bed falls 5.8 degrees toward the feeder
const BED_A = ROLL * G * SLOPE;
const BED_E = .3;                                  // restitution on the rubber: low and dead
const NET_OMEGA = 10.2, NET_TAN = 1.5, NET_RING_S = 1.3, TS = 2 / NET_OMEGA;
const IDX_TURN = .72, IDX_SETTLE = .22;            // the half turn and its settle against the stop (s)
const EXIT_A = 6, EXIT_V = 1.5;                    // out of the upper chamber and through the elbow (m/s^2, m/s)
const V_IN = 9, V_OUT = 11;                        // the pitch and the return (m/s)
const SPIN = 15, BOTTOM_K = 1.08, DIP = .14;       // wheel speed for the eye (rad/s), lower wheel faster, loss at a grip
const PITCH_SPIN = 15;
export const MAX_BALLS = 5;

const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = t => { t = clamp01(t); return t * t * (3 - 2 * t); };

export function createSim({ THREE, model, radius }) {
  const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const mm = a => V3((a[0] + SHIFT[0]) / 1000, (a[1] + SHIFT[1]) / 1000, (a[2] + SHIFT[2]) / 1000);
  const R = radius || BALL_R / 1000;
  const pLower = mm(LOWER), pExitRamp = mm(EXIT_RAMP), pTubeIn = mm(TUBE_IN), pBend = mm(TUBE_BEND), pTubeOut = mm(TUBE_OUT), pGrip = mm(GRIP);
  const idxAxis = mm([0, AX_INDEXER[0], AX_INDEXER[1]]);
  const bendC = mm([TUBE_BEND[0], 922, 1320]), bendR = (TUBE_OUT[0] - TUBE_BEND[0]) / 1000;
  const X = V3(1, 0, 0), X_NEG_Z = V3(0, 0, -1), UP = V3(0, 1, 0), AX_BEND = V3(1, 0, -1).normalize();
  const pUpper = pLower.clone().sub(idxAxis).applyAxisAngle(X, -Math.PI).add(idxAxis);
  const bedY = x => (rampY(x * 1000 - SHIFT[0]) + SHIFT[1]) / 1000;
  const BED_X1 = (187.5 + SHIFT[0]) / 1000;        // the bed's last sheet ends here
  const X_WAIT = pLower.x - 2 * R - .004;          // a ball waiting for the chamber stands here
  const trough = { y: (661 + BALL_R + SHIFT[1]) / 1000, z: (1141.5 + SHIFT[2]) / 1000 };
  const exitL = [pUpper.distanceTo(pExitRamp), pExitRamp.distanceTo(pTubeIn), pTubeIn.distanceTo(pBend), Math.PI / 2 * bendR, pTubeOut.distanceTo(pGrip)];
  const exitLen = exitL.reduce((a, b) => a + b, 0), exitTAcc = EXIT_V / EXIT_A, exitSAcc = EXIT_V * exitTAcc / 2;
  const SPIN_OUT = V_OUT * (BOTTOM_K - 1) / (BOTTOM_K + 1) / R;

  // ---- the net at rest: where its surface hangs at (x, y), whatever a ball is doing to it right now
  const N = model.hints.net, bs0 = model.parts.backstop.position.clone(), o3 = [0, 0, 0];
  const restZ = (x, y) => {
    if (!N) return (NET_Z + SHIFT[2]) / 1000;
    let z = bs0.z + N.z;
    if (N.hung) z += N.lift + N.rest(x - bs0.x, y - bs0.y, o3)[2];
    return z;
  };
  // the part of the net a ball may be aimed at (clear of the poles, the top cord and the bed)
  const zone = N
    ? { x0: bs0.x + N.xl + .2, x1: bs0.x + N.xr - .2, y0: bs0.y + N.y0 + .34, y1: bs0.y + N.y1 - .2 }
    : { x0: -.85, x1: .25, y0: .6, y1: 1.4 };
  const netDepth = (vn, t) => (t <= 0 ? 0 : t < TS ? vn * t * Math.exp(-NET_OMEGA * t) : vn * TS * Math.exp(-2) * Math.exp(-(t - TS) / TS));
  const tanAt = t => t * Math.exp(-NET_OMEGA * NET_TAN * t);
  const halfTurn = t => {
    if (t <= 0) return 0;
    if (t < IDX_TURN) return Math.PI * (1 - Math.cos(Math.PI * (t / IDX_TURN) ** 1.5)) / 2;
    const s = t - IDX_TURN;
    return Math.PI + .02 * Math.exp(-s / .05) * Math.sin(2 * Math.PI * s / .09);
  };

  // ---- state
  let T = 0, ids = 0;
  const balls = Array.from({ length: MAX_BALLS }, (_, i) => ({
    slot: i, id: 0, on: 0, state: 'idle', t0: 0, p: V3(), v: V3(), q: new THREE.Quaternion(), squash: 1, xray: 0,
    origin: V3(), o0: V3(), v0: V3(), tf: 0, c: V3(), vc: V3(), vn: 0, axis: V3(1, 0, 0),
    x: 0, vx: 0, zLand: 0, xLand: 0, tLand: 0, hops: [], vEnd: 0, s: 0, user: null,
  }));
  const net = { on: false, t0: 0, x: 0, y: 0, vn: 0, c: V3(), v: V3(), depth: 0, phase: 0 };
  const idx = { base: 0, t0: -1e3, turning: false };
  const wheel = { w: 0, top: 0, bottom: 0, last: -1e3 };
  const sim = { balls, on: null, zone, R, restZ, pGrip, pLower, pUpper, bedY, get time() { return T; }, get net() { return net; }, get index() { return idx.base + (idx.turning ? halfTurn(T - idx.t0) : 0); }, wheel };
  const qa = new THREE.Quaternion(), tmp = V3();
  const turn = (b, axis, angle) => { qa.setFromAxisAngle(axis, angle); b.q.premultiply(qa); };
  const emit = (type, b) => { if (sim.on) sim.on(type, b); };

  // A pitch: from `origin` to the net at (aimX, aimY), solved back from the contact point so it lands where it is aimed.
  sim.throwBall = (origin, aimX, aimY, user = null) => {
    const b = balls.find(k => !k.on);
    if (!b) return null;
    const x = Math.min(zone.x1, Math.max(zone.x0, aimX)), y = Math.min(zone.y1, Math.max(zone.y0, aimY));
    b.c.set(x, y, restZ(x, y) + R);
    b.origin.copy(origin); b.o0.copy(origin);
    b.tf = Math.min(.9, Math.max(.42, b.c.distanceTo(origin) / V_IN));
    b.v0.copy(b.c).sub(origin).divideScalar(b.tf); b.v0.y += G * b.tf / 2;
    b.axis.crossVectors(b.v0, UP).normalize();
    b.q.identity(); b.p.copy(origin); b.squash = 1; b.xray = 0;
    b.on = 1; b.state = 'in'; b.t0 = T; b.id = ++ids; b.user = user;
    return b;
  };

  const feederTaken = () => balls.some(b => b.on && (b.state === 'enter' || b.state === 'chamber' || b.state === 'turn'));
  const upperClear = () => !balls.some(b => b.on && b.state === 'exit' && b.s < .11);

  function stepBall(b, dt) {
    const u = T - b.t0;
    switch (b.state) {
      case 'in': {
        if (u < b.tf) {
          b.p.copy(b.o0).addScaledVector(b.v0, u); b.p.y -= G * u * u / 2;
          turn(b, b.axis, PITCH_SPIN * dt);
          break;
        }
        // contact: the net takes it
        b.vc.copy(b.v0); b.vc.y -= G * b.tf; b.vn = Math.max(1.5, -b.vc.z);
        b.state = 'net'; b.t0 += b.tf;
        Object.assign(net, { on: true, t0: b.t0, vn: b.vn, owner: b.id });
        net.c.copy(b.c); net.v.copy(b.vc);
        emit('net', b);
      }
      // falls through
      case 'net': {
        const t = T - b.t0;
        if (t < TS) {
          const k = tanAt(t);
          b.p.set(b.c.x + b.vc.x * k, b.c.y + b.vc.y * k, 0);
          if (net.owner === b.id) writeNet();
          b.p.z = model.netZ(b.p.x, b.p.y) + R;
          turn(b, b.axis, PITCH_SPIN * dt * Math.exp(-t / .05));   // the net takes the spin
          break;
        }
        // pushed back out at 0.135 of its speed; it keeps a little of its sideways speed if that is toward the feeder
        b.v.set(Math.min(1.6, Math.max(0, .3 * b.vc.x)), 0, b.vn * Math.exp(-2));
        b.state = 'fall'; b.t0 = T;
      }
      // falls through
      case 'fall': {
        b.v.y -= G * dt;
        b.p.addScaledVector(b.v, dt);
        b.p.x = Math.min(b.p.x, X_WAIT);
        const floor = bedY(b.p.x) + R;
        if (b.p.y <= floor && b.v.y < 0) {
          // on the rubber: a dead bounce, and the slope turns some of the fall into speed toward the feeder
          const vy = -b.v.y;
          b.p.y = floor;
          b.x = b.xLand = b.p.x; b.zLand = b.p.z; b.tLand = T;
          b.vx = ROLL * b.v.x + (1 + BED_E) * vy * SLOPE;
          b.v.z *= ROLL;
          b.hops = [];
          let at = 0;
          for (let h = BED_E * vy; h > .15; h *= BED_E) { b.hops.push([at, h]); at += 2 * h / G; }
          b.state = 'bed'; b.t0 = T;
        }
        break;
      }
      case 'bed': {
        // rolls down the bed, queues behind the ball ahead, and goes in when the lower chamber is free
        let limit = Infinity;
        for (const k of balls) if (k !== b && k.on && k.state === 'bed' && k.x > b.x) limit = Math.min(limit, k.x - 2 * R);
        const first = limit === Infinity;
        if (first && feederTaken()) limit = X_WAIT;
        b.vx += BED_A * dt;
        let x = b.x + b.vx * dt;
        if (x > limit) { x = Math.max(b.x, limit); b.vx = 0; }
        const s = T - b.tLand;
        let hop = 0;
        for (const [h0, v] of b.hops) if (s >= h0 && s < h0 + 2 * v / G) { const k = s - h0; hop = v * k - G / 2 * k * k; }
        turn(b, X_NEG_Z, (x - b.x) / R);
        b.x = x;
        const w = smooth((x - b.xLand) / Math.max(.05, BED_X1 - b.xLand));
        const zA = b.zLand + b.v.z * .12 * (1 - Math.exp(-s / .12));
        b.p.set(x, bedY(x) + R + hop, lerp(zA, trough.z, w));
        b.xray = clamp01((x * 1000 - SHIFT[0] + 240) / 90);      // under the bed's cover near the feeder
        if (first && x >= X_WAIT - 1e-4 && !feederTaken() && hop < .01) { b.state = 'enter'; b.t0 = T; b.vEnd = Math.max(.7, b.vx); b.s = b.x; }
        break;
      }
      case 'enter': {
        // off the sheet: a short drop into the trough, level into the lower chamber
        const xx = Math.min(pLower.x, b.s + b.vEnd * u), w = clamp01((xx - b.s) / (pLower.x - b.s));
        const y0 = bedY(b.s) + R;
        turn(b, X_NEG_Z, (xx - b.p.x) / R);
        b.p.set(xx, Math.max(pLower.y, y0 - G / 2 * u * u), lerp(trough.z, pLower.z, w));
        b.xray = 1;
        if (xx >= pLower.x) { b.p.copy(pLower); b.state = 'chamber'; b.t0 = T; }
        break;
      }
      case 'chamber': {
        b.p.copy(pLower); b.xray = 1;
        if (!idx.turning && upperClear() && u > .04) { idx.turning = true; idx.t0 = T; b.state = 'turn'; b.t0 = T; b.s = 0; emit('turn', b); }
        break;
      }
      case 'turn': {
        const a = halfTurn(u);
        b.p.copy(pLower).sub(idxAxis).applyAxisAngle(X, -a).add(idxAxis);
        turn(b, X, -(a - b.s)); b.s = a;
        b.xray = 1;
        if (u >= IDX_TURN) { b.state = 'exit'; b.t0 = T; b.s = 0; b.p.copy(pUpper); }
        break;
      }
      case 'exit': {
        // eases out of the upper chamber, down the exit ramp and through the elbow to the wheels
        const s = u < exitTAcc ? EXIT_A * u * u / 2 : exitSAcc + EXIT_V * (u - exitTAcc);
        const straight = exitL[0] + exitL[1] + exitL[2];
        turn(b, s > straight ? AX_BEND : X_NEG_Z, (s - b.s) / R);
        b.s = s; b.xray = 1;
        let r = s, done = false;
        const seg = [[pUpper, pExitRamp], [pExitRamp, pTubeIn], [pTubeIn, pBend]];
        for (let k = 0; k < 3 && !done; k++) { if (r < exitL[k]) { b.p.lerpVectors(seg[k][0], seg[k][1], r / exitL[k]); done = true; } else r -= exitL[k]; }
        if (!done && r < exitL[3]) { const th = r / bendR; b.p.set(bendC.x + Math.sin(th) * bendR, pTubeIn.y, bendC.z - Math.cos(th) * bendR); done = true; }
        else if (!done) { r -= exitL[3]; b.p.lerpVectors(pTubeOut, pGrip, Math.min(1, r / exitL[4])); }
        if (s >= exitLen) {
          // gripped and thrown back to where it came from
          b.state = 'out'; b.t0 = T; b.p.copy(pGrip);
          b.tf = Math.min(.7, Math.max(.3, pGrip.distanceTo(b.origin) / V_OUT));
          b.v0.copy(b.origin).sub(pGrip).divideScalar(b.tf); b.v0.y += G * b.tf / 2;
          wheel.w *= 1 - DIP;
          emit('grip', b);
        }
        break;
      }
      case 'out': {
        b.p.copy(pGrip).addScaledVector(b.v0, u); b.p.y -= G * u * u / 2;
        b.squash = 1 - .1 * Math.sin(Math.PI * clamp01(u / .05));
        b.xray = 1 - clamp01(u / .04);
        turn(b, X, -SPIN_OUT * dt);
        if (u >= b.tf) { b.p.copy(b.origin); b.state = 'idle'; b.on = 0; b.squash = 1; b.xray = 0; emit('returned', b); }
        break;
      }
    }
  }

  function writeNet() {
    if (!net.on) return;
    const t = T - net.t0, k = tanAt(Math.min(t, TS));
    net.x = net.c.x + net.v.x * k; net.y = net.c.y + net.v.y * k;
    net.depth = netDepth(net.vn, t); net.phase = clamp01(t / NET_RING_S);
    if (net.phase >= 1 && net.depth < 1e-4) { net.depth = 0; net.on = false; }
    model.setNetImpact(net.x, net.y, net.depth, net.phase);
  }

  function advance(dt) {
    T += dt;
    // the chamber's half turn ends; the other chamber is now at the bottom
    if (idx.turning && T - idx.t0 >= IDX_TURN + IDX_SETTLE) { idx.turning = false; idx.base += Math.PI; }
    // each ball once, the ones furthest along first, so a queue moves up within the step
    for (const b of balls.filter(k => k.on).sort((a, c) => c.x - a.x)) stepBall(b, dt);
    writeNet();
    // flywheels: up while a ball is in play, down a moment after the last one is back
    const any = balls.some(b => b.on);
    if (any) wheel.last = T;
    const target = any || T - wheel.last < .9 ? SPIN : 0;
    wheel.w += (target - wheel.w) * (1 - Math.exp(-dt / (target ? .28 : 1.1)));
    if (!target && wheel.w < .02) wheel.w = 0;
    wheel.top += wheel.w * dt; wheel.bottom += wheel.w * BOTTOM_K * dt;
  }
  // model x of the balls on the bed decides the order; others keep theirs
  sim.step = dt => {
    let left = Math.min(dt, .1);
    while (left > 1e-6) { const h = Math.min(left, 1 / 120); advance(h); left -= h; }
    sim.apply();
  };
  sim.apply = () => {
    model.setIndex(sim.index);
    model.setSpin(wheel.top, wheel.bottom);
  };
  Object.defineProperty(sim, 'busy', { get: () => balls.some(b => b.on) || net.on || idx.turning || wheel.w > 0 });
  sim.count = () => balls.reduce((n, b) => n + (b.on ? 1 : 0), 0);
  sim.reset = () => {
    for (const b of balls) { b.on = 0; b.state = 'idle'; b.x = 0; b.xray = 0; b.squash = 1; }
    Object.assign(net, { on: false, depth: 0, phase: 0 });
    Object.assign(idx, { base: 0, turning: false, t0: -1e3 });
    Object.assign(wheel, { w: 0, top: 0, bottom: 0, last: -1e3 });
    T = 0;
    model.setNetImpact(0, 0, 0, 0);
    sim.apply();
  };

  // One whole catch, sampled at 120 Hz for the scroll scene: positions, turns, the net, the chamber, the wheels, and
  // the times its steps begin. Leaves the simulation as it found it (reset).
  sim.record = (origin, aimX, aimY) => {
    const keep = sim.on;
    sim.on = null; sim.reset();
    const b = sim.throwBall(origin, aimX, aimY), H = 1 / 120;
    const take = { dt: H, n: 0, p: [], q: [], squash: [], xray: [], net: [], idx: [], top: [], bottom: [], marks: {} };
    let last = '';
    for (let i = 0; i < 120 * 12 && (b.on || i === 0); i++) {
      if (b.state !== last) { take.marks[b.state] = i * H; last = b.state; }
      take.p.push(b.p.x, b.p.y, b.p.z); take.q.push(b.q.x, b.q.y, b.q.z, b.q.w);
      take.squash.push(b.squash); take.xray.push(b.xray);
      take.net.push(net.x, net.y, net.depth, net.phase);
      take.idx.push(sim.index); take.top.push(wheel.top); take.bottom.push(wheel.bottom);
      take.n++;
      advance(H);
    }
    take.end = take.n * H;
    sim.reset(); sim.on = keep;
    return take;
  };
  return sim;
}
