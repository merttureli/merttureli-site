/* fallback.js: the 2D side view for browsers without WebGL2 or float render
   targets. createFallbackView(canvas, geometry, flight, opts) draws the rocket
   outline from geometry.sectionPolygons (metres) rotated by the live pitch angle,
   with the CG symbol, the Barrowman CP dot, the relative-wind arrow ahead of the
   nose, the angle-of-attack arc, the normal-force arrow at the CP, an optional
   thrust arrow, the rail and the ground near the pad and an altitude tape. It reads
   flight.state every frame it draws and never steps the flight.

   Sign convention (FIELD 2): theta is the body axis angle from +y, positive toward
   +x (downrange). On screen x runs right and y down, so a positive theta is a
   clockwise rotation, which is what ctx.rotate(+theta) does. Alpha is the angle
   from the direction the rocket flies into the air to the body axis, positive
   toward +x; the relative air therefore moves along (sin alpha, cos alpha) in the
   rocket's local screen frame (x = body +x side, y = aft) and pushes the normal
   force toward the body's +x side for a positive alpha.

   Loop: an idle-aware rAF that draws while flight.state.t changes, a drag is in
   progress or a redraw is pending, and sleeps otherwise (a 4 Hz timer notices an
   external driver). Nothing runs while the canvas is off screen or the tab is
   hidden. Reduced motion changes nothing here because nothing here is decorative:
   the view moves only when the flight moves.

   Labels (presentation wave 2): the same words as the 3D stage's plates
   (vx/js/scene/markers.js PLATE_WORDS and its thresholds, copied here because this
   view must not load three.js): CG / BALANCE POINT, CP / AIR'S PUSH with N n.nn LBF
   SIM while |N| is above 0.05 lbf, and AIR on the wind arrow while the airspeed is
   above 1 m/s, with ALPHA n.n° SIM from 0.5 deg of |alpha|. The numbers themselves
   live in the panel.

   The end plate (presentation wave 3, item 10, the 2D part of the stage's plate in
   vx/js/scene/director.js): at the apogee stop (the apogee event, until the flight time is
   PLATE_PAST_S past it) the camera eases back over PLATE_MS on the site easing (a cut under
   reduced motion) to a face-on view at equal scale that fits the pad to apogee, kept clear of
   the caption lines and of what the page puts over the view (the end card, [data-end], or
   opts.avoid). On it: the flight's path from flight.history (1 px at paper 45 percent while
   flying, 2 px on the plate), the same conditions with the other fin choice as a ghost (2 px at
   75 percent; finned paths paper, finless the livery orange), ticks RAIL EXIT, BURNOUT and
   APOGEE n FT SIM with the fin words (the scene's trail.js words, copied: this view must not
   load three.js), the altitude tape at the plate's scale with faint guides across, a feet
   scale bar, a 3 px livery dot for the rocket once it is under ROCKET_DOT_PX long, and the
   caption FULL FINS AND NO FINS / THE SAME GUST, 11.2 MPH EST / BOTH FLOWN IN THIS TAB / SIM
   (the page's plate caption words, in caps). The plate holds until the flight moves on
   (CONTINUE, a reset, a new launch). The ghost is opts.ghost(config, {gustMph}) (the page's
   director option, points in the flight frame), else the page's planner
   (window.__field.planner, the other fin choice, the pre-flight's path moved into the flight
   frame); none when the flight left its pre-flight (a visitor's gust or flick:
   window.__field.beats.source is not 'plan', or opts.ghostValid() false). */
import { bus } from '../core/bus.js';
import { governor } from '../core/governor.js';
import { DEG, M_PER_FT, M_PER_IN, N_PER_LBF, MPS_PER_MPH, fixed, timeCode, phaseLabel, readDerived, firstFinite, readHistory, readEvents, resolveOutline, createIdleLoop, fitCanvas, readTheme } from './format.js';
import { cgSymbol } from './chart.js';

const CG_SCREEN_Y = 0.56;        // CG sits at 56 % of the canvas height: room for the wind arrow above the nose
const ROCKET_FRAC_H = 0.56;      // rocket length as a fraction of the canvas height
const TAPE_W = 58;               // CSS px, altitude tape on the left edge
const TAPE_PX_PER_FT = 3;        // tape scale; 260 ft/s at 1x scrolls 780 px/s
const SCALE_BAR_IN = 6;          // scale bar length, inches
const FLICK_TAU_S = 0.35;        // s: a drag of r x d over |r|^2 radians is spread over this time to give a pitch rate (EST, feel)
const FLICK_MAX = 4;             // rad/s clamp on the flick impulse
const N_ARROW_PX_PER_LBF = 60;   // px per lbf for the normal-force arrow, clamped to 0.35 of the rocket length
/* the stage's label set (copied from vx/js/scene/markers.js; keep the two in step) */
const PLATE_WORDS = { cg: 'BALANCE POINT', cp: "AIR'S PUSH", air: 'AIR' };
const ALPHA_SHOW_DEG = 0.5;      // ALPHA line from 0.5 deg of |alpha|
const N_SHOW_LBF = 0.05;         // N line above 0.05 lbf
const AIR_SHOW_MPS = 1;          // AIR names the arrow only while the relative wind has a direction worth naming
/* the end plate (item 10) */
const PLATE_MS = 2400;           // the ease back to the plate, ms (the site's longest duration; the scene's PLATE_MS)
const PLATE_PAST_S = 0.02;       // s past the apogee event that still count as the stop (CONTINUE moves on)
const PLATE_HEADROOM = 0.04;     // above the higher apogee
const ROCKET_DOT_PX = 12;        // under this length on screen the rocket is a livery dot
const FINLESS_BELOW = 0.005;     // a fin scale under this is "no fins" (vx/js/scene/trail.js)
/* the plate's words (vx/js/scene/trail.js TICK_WORDS and finWords, copied; keep the two in step) */
const TICK_WORDS = { railExit: 'RAIL EXIT', burnout: 'BURNOUT', apogee: 'APOGEE' };
function finWords(k) {
  if (!Number.isFinite(k)) return '';
  if (Math.abs(k - 1) < 0.005) return 'FULL FINS';
  if (k < FINLESS_BELOW) return 'NO FINS';
  if (Math.abs(k - 0.5) < 0.005) return 'HALF FINS';
  return `FIN SCALE ${k.toFixed(2)}`;
}
/* the site easing, cubic-bezier(0.22, 1, 0.36, 1) (BRIEF: one easing) */
const ease = (() => {
  const p1x = 0.22, p1y = 1, p2x = 0.36, p2y = 1;
  const cx = 3 * p1x, bx = 3 * (p2x - p1x) - cx, ax = 1 - cx - bx;
  const cy = 3 * p1y, by = 3 * (p2y - p1y) - cy, ay = 1 - cy - by;
  const X = (t) => ((ax * t + bx) * t + cx) * t, Y = (t) => ((ay * t + by) * t + cy) * t, dX = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (!(x > 0)) return 0; if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) { const e = X(t) - x, d = dX(t); if (Math.abs(e) < 1e-6 || Math.abs(d) < 1e-6) break; t -= e / d; }
    return Y(Math.max(0, Math.min(1, t)));
  };
})();

export function createFallbackView(canvas, geometry, flight, opts = {}) {
  const ctx = canvas.getContext('2d');
  const o = Object.assign({ markers: true, finScale: 1, view: 'through', lattice: null, caption: null, onFlick: null, selfLoop: true,
    plate: true, plateCaption: true, ghost: null, gustMph: null, ghostValid: null, avoid: null, reduced: null }, opts);
  let th = readTheme(canvas);
  let size = { w: 1, h: 1 }, dpr = governor.dpr();
  let outline = null, outlineKey = '';
  let lastT = NaN, dirty = true, visible = true, destroyed = false;
  let pad = null;                 // {x, y, theta} captured on the pad, for the ground and the rail
  let drag = null;                // {id, sx, sy, x, y, rx, ry}
  let lastFlick = NaN, lastLabel = 0;
  let plateSt = null;             // the end plate while it is up: {t0, apoT, apo, main, ghost, gust, wind, finScale, reduced, k, fit, ticks}
  let plateAnimating = false, lastU = 0;
  let avoidAt = -Infinity, avoidRects = [];
  const reducedMq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  const stats = { draws: 0, lastDrawMs: 0 };

  if (!canvas.hasAttribute('role')) canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Side view of the rocket in the pitch plane');
  canvas.classList.add('pn-fallback');

  function ensureOutline() {
    const cfg = flight && flight.config;
    const key = `${o.finScale.toFixed(3)}|${o.view}|${cfg ? cfg.length : ''}`;
    if (outline && key === outlineKey) return outline;
    outline = resolveOutline(geometry, cfg, { finScale: o.finScale, view: o.view });
    outlineKey = key;
    return outline;
  }

  function resize() { dpr = governor.dpr(); size = fitCanvas(canvas, dpr); dirty = true; loop.wake(); }

  function draw() {
    if (!ctx || destroyed) return;
    const t0 = performance.now();
    const st = (flight && flight.state) || {};
    const d = (flight && flight.derived) || {};
    const out = ensureOutline();
    const { w, h } = size;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = th.ink900; ctx.fillRect(0, 0, w, h);
    const L = out.length, R = out.radius;
    const t = num(st.t, 0), theta = num(st.theta, 0), alpha = num(st.alpha, 0), y = num(st.y, 0), x = num(st.x, 0);
    const xcg = firstFinite(st.xcg, readDerived(d, 'xcg', t), flight?.config?.cgFromNose, 0.5588);   // live CG station, m from the nose
    const xcp = firstFinite(readDerived(d, 'xcp', t), st.xcp);
    const ref = firstFinite(st.refFromNose, xcg);   // the body station that state.x, y track (flight.js: the liftoff CG station)
    if (st.phase === 'pad') pad = { x, y, theta };
    else if (!pad) {   // mounted mid-flight: the first history sample is the pad, else assume the origin
      const s0 = (readHistory(flight && flight.history) || [])[0];
      pad = s0 && Number.isFinite(s0.y) ? { x: num(s0.x, 0), y: s0.y, theta: num(s0.theta, 0) } : { x: 0, y: 0, theta: num(flight?.config?.launchAngle, 0) };
    }
    // the tail's foot on the pad
    const tailOff = L - ref;
    const gx = pad.x - tailOff * Math.sin(pad.theta), gy = pad.y - tailOff * Math.cos(pad.theta);
    // the camera: on the CG while flying; at the apogee stop it eases back to the end plate (item 10)
    const sF = Math.max(40, Math.min((ROCKET_FRAC_H * h) / L, (1.4 * (w - TAPE_W)) / L));   // px per meter
    const cam = camera(st, { x, y, sF, cxF: TAPE_W + (w - TAPE_W) * 0.5, cyF: h * CG_SCREEN_Y, gx, gy, w, h });
    const s = cam.s, cx = cam.rx, cy = cam.ry;
    // world (m, y up) to screen: the rocket's reference point sits at (cx, cy)
    const WX = (wx) => cx + (wx - x) * s, WY = (wy) => cy - (wy - y) * s;
    const onPlate = cam.u > 0;
    const tiny = L * s < ROCKET_DOT_PX;
    lastU = cam.u;
    const alt = firstFinite(st.altitude, y - pad.y);
    if (onPlate) drawGuides(alt, cy, cam.pxft, cam.u);
    drawPaths(cam, WX, WY, st);

    // ground and rail near the pad (world frame); both leave the view after launch
    const groundY = WY(gy);
    if (groundY < h + 4) {
      ctx.strokeStyle = th.a45; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(TAPE_W, Math.round(groundY) + 0.5); ctx.lineTo(w, Math.round(groundY) + 0.5); ctx.stroke();
      ctx.strokeStyle = th.a18;
      for (let hx = TAPE_W + ((WX(0) - TAPE_W) % 12 + 12) % 12; hx < w; hx += 12) { ctx.beginPath(); ctx.moveTo(hx, groundY + 1); ctx.lineTo(hx - 8, groundY + 9); ctx.stroke(); }
      const railLen = num(flight?.config?.railLength, num(flight?.config?.rail, 1.83));
      const off = (R + 0.006);   // rail sits behind the rail buttons, on the body's -x side
      const bx = gx - off * Math.cos(pad.theta), by = gy + off * Math.sin(pad.theta);
      const ex = bx + railLen * Math.sin(pad.theta), ey = by + railLen * Math.cos(pad.theta);
      ctx.strokeStyle = th.a45; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(WX(bx), WY(by)); ctx.lineTo(WX(ex), WY(ey)); ctx.stroke();
      ctx.lineWidth = 1;
      ctx.font = `10px ${th.mono}`; ctx.fillStyle = th.a70; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      if (groundY + 14 < h && !onPlate) ctx.fillText(`PAD / RAIL ${fixed(railLen / M_PER_IN, 0)} IN`, Math.max(TAPE_W + 8, WX(bx) + 10), groundY + 6);
    }

    // rocket in its own frame: translate to the CG, rotate by theta (a livery dot once it is tiny)
    if (tiny && !onPlate) rocketDot(cx, cy);
    else if (!tiny) {
    ctx.save();
    ctx.translate(cx, cy); ctx.rotate(theta);
    const P = (a, l) => [l * s, (a - ref) * s];
    // body axis, drawing convention long dash short dash, extended ahead of the nose
    ctx.strokeStyle = th.a18; ctx.setLineDash([10, 3, 2, 3]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, P(-0.32 * L, 0)[1]); ctx.lineTo(0, P(L + 0.04, 0)[1]); ctx.stroke(); ctx.setLineDash([]);
    ctx.lineJoin = 'round';
    for (const pass of ['solid', 'detail']) for (const p of out.polys) {
      if ((p.kind === 'detail') !== (pass === 'detail')) continue;      // edge-on fins and seats: light lines over the body
      ctx.beginPath();
      p.pts.forEach(([a, l], i) => { const [px, py] = P(a, l); if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); });
      ctx.closePath();
      if (pass === 'solid') { ctx.fillStyle = th.ink800; ctx.fill(); ctx.strokeStyle = th.a90; ctx.lineWidth = 1.5; }
      else { ctx.strokeStyle = th.a45; ctx.lineWidth = 1; }
      ctx.stroke();
    }
    ctx.restore();
    }

    const toScreen = (a, l) => { const lx = l * s, ly = (a - ref) * s, c = Math.cos(theta), sn = Math.sin(theta); return [cx + lx * c - ly * sn, cy + lx * sn + ly * c]; };
    const dirScreen = (dx, dy) => { const c = Math.cos(theta), sn = Math.sin(theta); return [dx * c - dy * sn, dx * sn + dy * c]; };

    if (o.markers && !onPlate && !tiny) {
      // relative wind: arrives along the flight path from upstream and ends at the end of
      // the body it reaches first (the nose in flight, the tail when |alpha| > 90 deg)
      const v = firstFinite(st.airspeed, st.v, 0);
      const fromAft = Math.cos(alpha) < 0;
      const [nx, ny] = toScreen(fromAft ? L : 0, 0);
      const len = Math.max(36, Math.min(0.16 * h, 36 + v * 0.9));
      const [ux, uy] = dirScreen(Math.sin(alpha), Math.cos(alpha));       // air direction, local (sin a, cos a)
      const sx0 = nx - ux * (len + 10), sy0 = ny - uy * (len + 10), sx1 = nx - ux * 10, sy1 = ny - uy * 10;
      ctx.strokeStyle = th.a90; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(sx0, sy0); ctx.lineTo(sx1, sy1); ctx.stroke();
      head(ctx, sx1, sy1, ux, uy, 7, th.a90);
      // angle-of-attack arc between the body axis (pointing out of that end) and the upstream direction
      const r = Math.min(len * 0.7, 54);
      const axisAng = theta - Math.PI / 2 + (fromAft ? Math.PI : 0);   // screen angle of the body axis out of the anchored end
      const upAng = Math.atan2(-uy, -ux);               // screen angle pointing upstream
      if (Math.abs(alpha) > 0.002) {
        const delta = Math.atan2(Math.sin(upAng - axisAng), Math.cos(upAng - axisAng));   // the short way round
        ctx.strokeStyle = th.a70; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(nx, ny, r, axisAng, axisAng + delta, delta < 0); ctx.stroke();
      }
      ctx.font = `10px ${th.mono}`; ctx.textBaseline = 'middle';
      if (v > AIR_SHOW_MPS) {
        const aDeg = alpha * DEG;
        const lines = [PLATE_WORDS.air];
        if (Number.isFinite(aDeg) && Math.abs(aDeg) >= ALPHA_SHOW_DEG) lines.push(`ALPHA ${fixed(aDeg, 1, true).trim()}° SIM`);
        const lx = Math.max(sx0, nx) + 14, ly = Math.min(sy0, ny - r) + 2;
        plate(ctx, th, lines, Math.min(lx, w - 150), Math.max(14, ly), false);
      }

      // normal force at the CP, along the body's +x side for N > 0
      const N = num(st.N, 0);
      if (Number.isFinite(xcp)) {
        const [px, py] = toScreen(xcp, 0);
        const nl = Math.min(0.35 * L * s, Math.abs(N / N_PER_LBF) * N_ARROW_PX_PER_LBF);
        if (nl > 3) {
          const [fx, fy] = dirScreen(Math.sign(N), 0);
          ctx.strokeStyle = th.accent; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + fx * nl, py + fy * nl); ctx.stroke();
          head(ctx, px + fx * nl, py + fy * nl, fx, fy, 8, th.accent);
        }
      }
      // thrust at the nozzle when the flight model exposes it (state.thrust or state.T, newtons)
      const T = num(st.thrust, num(st.T, 0));
      if (T > 0.5) {
        const [tx, ty] = toScreen(L, 0);
        const tl = Math.min(0.3 * L * s, 10 + T * 0.6);
        const [bx2, by2] = dirScreen(0, 1);
        ctx.strokeStyle = th.a70; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(tx + bx2 * (tl + 6), ty + by2 * (tl + 6)); ctx.lineTo(tx + bx2 * 6, ty + by2 * 6); ctx.stroke();
        head(ctx, tx + bx2 * 6, ty + by2 * 6, -bx2, -by2, 7, th.a70);
      }
      // CG and CP markers, labelled off the body's +x side along its normal so a tilted
      // or tumbling body never runs through its own labels
      const [gx2, gy2] = toScreen(xcg, 0);
      const marks = [];
      const xl = latticeXcp();
      if (Number.isFinite(xl)) { const [lx2, ly2] = toScreen(xl, 0); ctx.strokeStyle = th.a90; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(lx2, ly2, 8, 0, Math.PI * 2); ctx.stroke(); marks.push({ a: xl, text: `CP 2D SECTION ${fixed(xl / M_PER_IN, 2)} IN` }); }
      if (Number.isFinite(xcp)) {
        const [px, py] = toScreen(xcp, 0); ctx.fillStyle = th.accent; ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.fill();
        marks.push({ a: xcp, text: `CP / ${PLATE_WORDS.cp}` });
        const nLbf = N / N_PER_LBF;
        if (Number.isFinite(nLbf) && Math.abs(nLbf) > N_SHOW_LBF) marks.push({ a: xcp + 1e-6, text: `N ${fixed(nLbf, 2, true).trim()} LBF SIM`, lead: false });   // under the CP words, no leader of its own
      }
      cgSymbol(ctx, gx2, gy2, 7, th.paper, th.ink900);
      marks.push({ a: xcg, text: `CG / ${PLATE_WORDS.cg}` });
      const off = (R + 0.03) * s + 12;                    // px from the axis to the label anchor
      const [nxs, nys] = dirScreen(1, 0);                 // the body's +x normal on screen
      const right = nxs >= -0.2;
      ctx.font = `10px ${th.mono}`; ctx.textBaseline = 'middle'; ctx.textAlign = right ? 'left' : 'right';
      const placed = [];
      for (const m of marks.sort((p, q) => p.a - q.a)) {
        const [mx, my] = toScreen(m.a, 0);
        let lx3 = mx + nxs * off, ly3 = my + nys * off;
        const tw = ctx.measureText(m.text).width;
        for (const q of placed) if (Math.abs(q.y - ly3) < 13 && Math.abs(q.x - lx3) < tw + 8) ly3 = q.y + 13;
        lx3 = right ? Math.min(lx3, w - tw - 6) : Math.max(lx3, TAPE_W + tw + 6);
        placed.push({ x: lx3, y: ly3 });
        if (m.lead !== false) {
          ctx.strokeStyle = th.a18; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(mx + nxs * (R * s + 3), my + nys * (R * s + 3)); ctx.lineTo(lx3 + (right ? -3 : 3), ly3); ctx.stroke();
        }
        ctx.fillStyle = th.a90; ctx.fillText(m.text, lx3, ly3);
      }
    }

    // drag vector while flicking
    if (drag) {
      ctx.strokeStyle = th.a70; ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(drag.sx, drag.sy); ctx.lineTo(drag.x, drag.y); ctx.stroke(); ctx.setLineDash([]);
      head(ctx, drag.x, drag.y, ...unit(drag.x - drag.sx, drag.y - drag.sy), 6, th.a70);
      ctx.fillStyle = th.a90; ctx.font = `10px ${th.mono}`; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
      ctx.fillText(`FLICK ${fixed(flickRate(drag) * DEG, 0, true).trim()} DEG/S`, drag.x + 8, drag.y - 6);
    }

    if (onPlate) { drawPlateTicks(cam, WX, WY); if (tiny) rocketDot(cx, cy); }
    drawTape(alt, cy, cam.pxft);
    drawCaption(t, st.phase);
    drawScaleBar(s, onPlate);
    stats.draws++; stats.lastDrawMs = performance.now() - t0;
    const now = performance.now();
    if (now - lastLabel > 1000) {   // aria-label at most once per second
      lastLabel = now;
      canvas.setAttribute('aria-label', onPlate ? plateLabel() : `Side view of the rocket at ${timeCode(t)}: ${phaseLabel(st.phase).toLowerCase()}, pitch ${fixed(theta * DEG, 1, true).trim()} degrees, angle of attack ${fixed(alpha * DEG, 1, true).trim()} degrees, altitude ${fixed(alt / M_PER_FT, 0)} ft.`.replace(/−/g, 'minus '));
    }
  }

  /* the altitude tape: the current altitude (altM, m above the pad) at y = cy, pxft px per foot
     (3 while flying; the plate's own scale on the plate, so the tape is the plate's altitude scale) */
  function tapeSteps(pxft) {
    const minor = [10, 50, 100, 500, 1000].find((v) => v * pxft >= 6) || 1000;
    const major = [50, 100, 200, 500, 1000, 2000].find((v) => v % minor === 0 && v * pxft >= 40) || 2000;
    return { minor, major };
  }
  function drawTape(altM, cy, pxft) {
    const { h } = size;
    const alt = altM / M_PER_FT;
    ctx.fillStyle = th.ink900; ctx.fillRect(0, 0, TAPE_W, h);
    ctx.strokeStyle = th.a18; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(TAPE_W - 0.5, 0); ctx.lineTo(TAPE_W - 0.5, h); ctx.stroke();
    const { minor, major } = tapeSteps(pxft);
    const span = h / pxft;
    ctx.font = `10px ${th.mono}`; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    // the tape ends at 0 ft (the pad): below it, ground hatched as in the view, and no negative altitudes
    const groundTy = cy + alt * pxft;
    if (groundTy < h) {
      const gy = Math.round(Math.max(0, groundTy)) + 0.5;
      ctx.save();
      ctx.beginPath(); ctx.rect(0, gy, TAPE_W - 1, h - gy); ctx.clip();
      ctx.strokeStyle = th.a18;
      for (let k = -TAPE_W, n = 0; k < h - gy + TAPE_W && n < 400; k += 10, n++) { ctx.beginPath(); ctx.moveTo(TAPE_W, gy + k); ctx.lineTo(0, gy + k + TAPE_W); ctx.stroke(); }
      ctx.restore();
      ctx.strokeStyle = th.a45; ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(TAPE_W - 1, gy); ctx.stroke();
    }
    for (let f = Math.max(0, Math.floor((alt - span) / minor) * minor), n = 0; f <= alt + span && n < 1000; f += minor, n++) {   // bounded: at 1e17 ft, f + minor === f
      const ty = cy - (f - alt) * pxft;
      if (ty < -10 || ty > h + 10) continue;
      const isMajor = f % major === 0;
      ctx.strokeStyle = isMajor ? th.a45 : th.a18;
      ctx.beginPath(); ctx.moveTo(TAPE_W - (isMajor ? 10 : 5), Math.round(ty) + 0.5); ctx.lineTo(TAPE_W - 1, Math.round(ty) + 0.5); ctx.stroke();
      if (isMajor && Math.abs(ty - cy) > 14 && ty > 26 && ty < h - 8) { ctx.fillStyle = th.a70; ctx.fillText(String(f), TAPE_W - 14, ty); }   // clear of the caption and the bottom edge
    }
    // current altitude box
    ctx.fillStyle = th.ink900; ctx.fillRect(2, cy - 9, TAPE_W - 6, 18);
    ctx.strokeStyle = th.a70; ctx.strokeRect(2.5, cy - 8.5, TAPE_W - 7, 17);
    ctx.fillStyle = th.paper; ctx.fillText(fixed(alt, 0), TAPE_W - 8, cy + 0.5);
    ctx.fillStyle = th.ink900; ctx.fillRect(0, 0, TAPE_W - 1, 22);
    ctx.fillStyle = th.a70; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('ALT FT', 6, 8);
  }
  /* on the plate: the tape's major altitudes as faint lines across the view, so the tape reads as
     the plate's scale (faded in with the move) */
  function drawGuides(altM, cy, pxft, u) {
    const { w, h } = size;
    const alt = altM / M_PER_FT;
    const { major } = tapeSteps(pxft);
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, (u - 0.5) / 0.5));
    ctx.strokeStyle = th.a08; ctx.lineWidth = 1;
    for (let f = 0, n = 0; n < 200; f += major, n++) {
      const ty = cy - (f - alt) * pxft;
      if (ty < -2) break;
      if (ty > h + 2) continue;
      ctx.beginPath(); ctx.moveTo(TAPE_W, Math.round(ty) + 0.5); ctx.lineTo(w, Math.round(ty) + 0.5); ctx.stroke();
    }
    ctx.restore();
  }

  function captionLines() {
    const base = o.caption || ['2D VIEW / PITCH PLANE', 'TRUE ANGLES / SIM'];
    if (!plateSt || o.plateCaption === false) return base;          // plateSt exists only while the plate is up
    return [base[0], ...plateCaptionLines()];
  }
  function drawCaption(t, phase) {
    const lines = captionLines();
    ctx.font = `10px ${th.mono}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    let yy = 8;
    for (const [i, line] of [...lines, `${timeCode(t)} / ${phaseLabel(phase)}`].entries()) {
      ctx.fillStyle = i === lines.length ? th.paper : th.a70;
      ctx.fillText(line, TAPE_W + 12, yy); yy += 14;
    }
  }
  /* the caption block's box (the plate keeps clear of it) */
  function captionRect() {
    const lines = [...captionLines(), 'T+00.000 / DESCENT'];
    ctx.font = `10px ${th.mono}`;
    const wMax = Math.max(...lines.map((l) => ctx.measureText(l).width));
    return { l: TAPE_W + 6, t: 0, r: TAPE_W + 12 + wMax + 8, b: 8 + lines.length * 14 + 4 };
  }

  /* the scale bar: 6 in beside the rocket, a round number of feet on the plate */
  function drawScaleBar(s, onPlate) {
    const { w, h } = size;
    let len = SCALE_BAR_IN * M_PER_IN * s, label = `${SCALE_BAR_IN} IN`;
    if (onPlate) {
      const pxft = s * M_PER_FT;
      const ft = [10, 20, 50, 100, 200, 500, 1000, 2000].find((v) => v * pxft >= 40) || 2000;
      len = ft * pxft; label = `${ft} FT`;
      if (len > w * 0.4) return;
    }
    const x1 = w - 14, x0 = x1 - len, yb = h - 14;
    ctx.strokeStyle = th.a70; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x0, yb - 4); ctx.lineTo(x0, yb + 0.5); ctx.lineTo(x1, yb + 0.5); ctx.lineTo(x1, yb - 4); ctx.stroke();
    ctx.fillStyle = th.a70; ctx.font = `10px ${th.mono}`; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    ctx.fillText(label, x1, yb - 6);
  }

  /* ---------------------------------------------------------------- the end plate (item 10) */
  const isReduced = () => { try { return typeof o.reduced === 'function' ? !!o.reduced() : !!(reducedMq && reducedMq.matches); } catch { return false; } };
  /* the apogee stop: the apogee event, until the flight is PLATE_PAST_S past it */
  function plateWanted(st) {
    if (o.plate === false || !flight || st.phase === 'pad') return null;
    const apo = (readEvents(flight.events) || []).find((e) => e && e.name === 'apogee');
    if (!apo || !Number.isFinite(apo.t) || !Number.isFinite(st.t)) return null;
    return st.t >= apo.t - 1e-6 && st.t <= apo.t + PLATE_PAST_S + 1e-9 ? apo : null;
  }
  function readGust() {
    try {
      if (typeof o.gustMph === 'function') { const v = Number(o.gustMph()); return Number.isFinite(v) && v > 0 ? v : 0; }
      const f = window.__field;
      const p = f && f.plan;
      if (p && Number.isFinite(p.gustMph)) return Math.max(0, p.gustMph);   // the armed gust this flight was planned with
      if (f && typeof f.armedGust === 'function') { const v = Number(f.armedGust()); return Number.isFinite(v) && v > 0 ? v : 0; }
    } catch { /* no page */ }
    return 0;
  }
  function ghostValid() {
    try {
      if (typeof o.ghostValid === 'function') return !!o.ghostValid();
      const f = window.__field;
      if (f && 'beats' in f) { const b = f.beats; return !!b && b.source === 'plan'; }   // the flight still repeats its pre-flight
    } catch { return false; }
    return true;
  }
  /* the same conditions with the other fin choice, in the flight frame */
  function makeGhost(cfg, gust, st) {
    if (!ghostValid()) return null;
    let g = null;
    try {
      if (typeof o.ghost === 'function') g = o.ghost({ ...cfg }, { gustMph: gust });
      else {
        const f = window.__field, pl = f && f.planner;
        if (pl && typeof pl.plan === 'function') {
          const other = cfg.finScale > FINLESS_BELOW ? 0 : 1;
          const p = pl.plan({ ...cfg, finScale: other }, { gustMph: gust });
          const ox = Number.isFinite(st.x) && Number.isFinite(st.downrange) ? st.x - st.downrange : 0;
          const oy = Number.isFinite(st.y) && Number.isFinite(st.altitude) ? st.y - st.altitude : 0;
          if (p && Array.isArray(p.path)) g = { points: p.path.map((q) => ({ x: q.x + ox, y: q.y + oy })), finScale: other, apogeeFt: p.result ? p.result.apogee : NaN };
        }
      }
    } catch (err) { console.warn('[fallback] the ghost path failed', err); g = null; }
    return g && Array.isArray(g.points) && g.points.length > 1 ? g : null;
  }
  function startPlate(apo, st) {
    const main = [{ x: pad.x, y: pad.y }];
    const push = (r) => { if (r && r.phase !== 'pad' && Number.isFinite(r.x) && Number.isFinite(r.y) && r.t <= apo.t + 1e-6) main.push({ x: r.x, y: r.y }); };
    const hist = flight.history;
    if (hist && typeof hist.forEach === 'function' && !Array.isArray(hist)) hist.forEach(push); else for (const r of (readHistory(hist) || [])) push(r);
    const as = apo.state || {};
    if (Number.isFinite(as.x) && Number.isFinite(as.y)) main.push({ x: as.x, y: as.y });
    const cfg = flight.config || {};
    const gust = readGust();
    plateSt = {
      t0: performance.now(), apoT: apo.t, apo, main, ghost: makeGhost(cfg, gust, st), gust, wind: num(cfg.wind, 0),
      finScale: num(cfg.finScale, o.finScale), reduced: isReduced(), k: 0, fit: null, ticks: [],
      apogeeFt: Number.isFinite(as.apogee) ? as.apogee / M_PER_FT : Number.isFinite(as.altitude) ? as.altitude / M_PER_FT : Number.isFinite(as.y) ? (as.y - pad.y) / M_PER_FT : NaN,
    };
    avoidAt = -Infinity;
  }
  function camera(st, { x, y, sF, cxF, cyF, gx, gy, w, h }) {
    const apo = plateWanted(st);
    if (!apo) { plateSt = null; plateAnimating = false; return { s: sF, rx: cxF, ry: cyF, u: 0, pxft: TAPE_PX_PER_FT }; }
    if (!plateSt || plateSt.apoT !== apo.t) startPlate(apo, st);
    const P = plateFit(w, h, gx, gy);
    plateSt.fit = P;
    const k = plateSt.reduced ? 1 : Math.min(1, (performance.now() - plateSt.t0) / PLATE_MS);
    plateSt.k = k;
    plateAnimating = k < 1;
    const u = ease(k);
    // the rocket glides from where it is on screen to its place on the plate while the scale
    // eases in log space, so the zoom reads as one move (and never jumps)
    const prx = P.sx + (x - P.ax) * P.s, pry = P.sy - (y - P.ay) * P.s;
    const s = Math.exp(Math.log(sF) + (Math.log(P.s) - Math.log(sF)) * u);
    const pxft = Math.exp(Math.log(TAPE_PX_PER_FT) + (Math.log(P.s * M_PER_FT) - Math.log(TAPE_PX_PER_FT)) * u);
    return { s, rx: cxF + (prx - cxF) * u, ry: cyF + (pry - cyF) * u, u: Math.max(u, 1e-6), pxft, P };
  }
  /* the plate's frame: both paths and the pad at equal scale, inside the view less the tape, the
     caption block, the scale bar and the page's overlays, each pushing in from the side that costs
     the box the least scale */
  function plateFit(w, h, gx, gy) {
    const ps = plateSt;
    let x0 = Math.min(gx, pad.x), x1 = Math.max(gx, pad.x), y0 = Math.min(gy, pad.y), y1 = Math.max(gy, pad.y);
    const grow = (p) => { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; };
    for (const p of ps.main) grow(p);
    if (ps.ghost) for (const p of ps.ghost.points) grow(p);
    const bw = Math.max(1, x1 - x0), bh = Math.max(1, (y1 - y0) * (1 + PLATE_HEADROOM));
    let A = { l: TAPE_W + 18, t: 10, r: w - 24, b: h - 34 };
    for (const R of [captionRect(), ...avoidList()]) A = pushOut(A, R, bw, bh);
    const sc = Math.max(1e-4, Math.min((A.r - A.l) / bw, (A.b - A.t) / bh));
    return { s: sc, ax: (x0 + x1) / 2, ay: y0 + bh / 2, sx: (A.l + A.r) / 2, sy: (A.t + A.b) / 2, area: A, box: { x0, x1, y0, y1 } };
  }
  function pushOut(A, R, bw, bh) {
    if (!(R.r > A.l && R.l < A.r && R.b > A.t && R.t < A.b)) return A;
    const cands = [
      { ...A, l: Math.max(A.l, R.r + 10) }, { ...A, r: Math.min(A.r, R.l - 10) },
      { ...A, t: Math.max(A.t, R.b + 10) }, { ...A, b: Math.min(A.b, R.t - 10) },
    ].filter((c) => c.r - c.l >= 40 && c.b - c.t >= 40);
    if (!cands.length) return A;
    const sc = (c) => Math.min((c.r - c.l) / bw, (c.b - c.t) / bh);
    return cands.reduce((best, c) => (sc(c) > sc(best) ? c : best), cands[0]);
  }
  /* what the page puts over the view (opts.avoid, else the end card), in canvas px, read at most every 250 ms */
  function avoidList() {
    const now = performance.now();
    if (now - avoidAt < 250) return avoidRects;
    avoidAt = now;
    let els = [];
    try {
      if (typeof o.avoid === 'function') els = o.avoid() || [];
      else { const host = canvas.closest ? canvas.closest('.pn-host') : null; const card = host && host.querySelector('[data-end]'); if (card && !card.hidden) els = [card]; }
    } catch { els = []; }
    const cr = canvas.getBoundingClientRect();
    avoidRects = [];
    for (const e of els) {
      const r = e && typeof e.getBoundingClientRect === 'function' ? e.getBoundingClientRect() : e;
      if (!r || !(r.width > 0) || !(r.height > 0)) continue;
      avoidRects.push({ l: r.left - cr.left, t: r.top - cr.top, r: r.left - cr.left + r.width, b: r.top - cr.top + r.height });
    }
    return avoidRects;
  }
  const pathColor = (k) => (Number.isFinite(k) && k < FINLESS_BELOW ? th.accent : th.paper);
  function strokePts(pts, WX, WY, color, alpha, width) {
    if (!pts || pts.length < 2) return;
    ctx.save();
    ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath();
    let lx = NaN, ly = NaN;
    for (let i = 0; i < pts.length; i++) {
      const px = WX(pts[i].x), py = WY(pts[i].y);
      if (i && i < pts.length - 1 && Math.abs(px - lx) < 0.6 && Math.abs(py - ly) < 0.6) continue;
      if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      lx = px; ly = py;
    }
    ctx.stroke();
    ctx.restore();
  }
  /* the path: while flying, the history so far at 1 px, paper 45 percent; on the plate the path to
     apogee at 2 px and the ghost at 2 px, 75 percent (finned paper, finless orange) */
  function drawPaths(cam, WX, WY, st) {
    const ps = cam.u > 0 ? plateSt : null;
    if (ps) {
      const u = cam.u;
      if (ps.ghost) strokePts(ps.ghost.points, WX, WY, pathColor(ps.ghost.finScale), 0.75 * u, 2);
      strokePts(ps.main, WX, WY, pathColor(ps.finScale), 0.45 + 0.5 * u, 1 + u);
      return;
    }
    if (!flight || st.phase === 'pad') return;
    const hist = flight.history;
    const pts = [];
    const push = (r) => { if (r && r.phase !== 'pad' && Number.isFinite(r.x) && Number.isFinite(r.y)) pts.push({ x: r.x, y: r.y }); };
    if (hist && typeof hist.forEach === 'function' && !Array.isArray(hist)) hist.forEach(push); else for (const r of (readHistory(hist) || [])) push(r);
    if (Number.isFinite(st.x) && Number.isFinite(st.y)) pts.push({ x: st.x, y: st.y });
    if (pad) pts.unshift({ x: pad.x, y: pad.y });
    strokePts(pts, WX, WY, th.paper, 0.45, 1);
  }
  function rocketDot(x, y) {
    ctx.fillStyle = th.ink900; ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = th.accent; ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill();
  }
  /* the plate's ticks: a + in the path's color and its words on an ink plate, placed clear of
     each other, the caption, the overlays, the ticks and the canvas edge (faded in at the end of
     the move). A label first tries the spots beside its tick; where none is clear it moves out
     past the paths in its own rows or stacks a row at a time above or below, with a leader back
     to the tick; only then may it lie over a path (its ink plate covers the line), and it is left
     out only where no spot clears the other labels at all. */
  function drawPlateTicks(cam, WX, WY) {
    const ps = plateSt; if (!ps) return;
    const a = Math.max(0, Math.min(1, (cam.u - 0.6) / 0.4));
    const { w, h } = size;
    const ev = (n) => (readEvents(flight.events) || []).find((e) => e && e.name === n);
    const items = [];
    const as = ps.apo.state || {};
    const last = ps.main[ps.main.length - 1];
    const apoPt = Number.isFinite(as.x) && Number.isFinite(as.y) ? { x: as.x, y: as.y } : last;
    if (apoPt) items.push({ key: 'apogee', p: apoPt, color: pathColor(ps.finScale), lines: [`${TICK_WORDS.apogee} ${Number.isFinite(ps.apogeeFt) ? Math.round(ps.apogeeFt) : '--'} FT SIM`, finWords(ps.finScale)] });
    if (ps.ghost) { const g = ps.ghost.points[ps.ghost.points.length - 1]; items.push({ key: 'ghost', p: g, color: pathColor(ps.ghost.finScale), lines: [`${TICK_WORDS.apogee} ${Number.isFinite(ps.ghost.apogeeFt) ? Math.round(ps.ghost.apogeeFt) : '--'} FT SIM`, finWords(ps.ghost.finScale)] }); }
    for (const key of ['railExit', 'burnout']) {
      const e = ev(key);
      if (e && e.state && Number.isFinite(e.state.x) && e.t <= ps.apoT) items.push({ key, p: { x: e.state.x, y: e.state.y }, color: pathColor(ps.finScale), lines: [TICK_WORDS[key]] });
    }
    const blocked = [captionRect(), ...avoidList()];
    const placed = [];
    // the paths on screen (every 3 px or so): a label never sits on a path
    const onScreen = [];
    for (const pts of [ps.main, ps.ghost ? ps.ghost.points : []]) {
      let lx = NaN, ly = NaN;
      for (const q of pts) { const sx = WX(q.x), sy = WY(q.y); if (Math.abs(sx - lx) + Math.abs(sy - ly) < 3) continue; onScreen.push(sx, sy); lx = sx; ly = sy; }
    }
    const coversPath = (b, px, py) => {
      for (let i = 0; i < onScreen.length; i += 2) {
        const qx = onScreen[i], qy = onScreen[i + 1];
        if (qx > b.l - 2 && qx < b.r + 2 && qy > b.t - 2 && qy < b.b + 2 && Math.hypot(qx - px, qy - py) > 7) return true;
      }
      return false;
    };
    const hit = (b, R) => b.l < R.r && b.r > R.l && b.t < R.b && b.b > R.t;
    // the paths' x extent in a band of rows (the on-screen samples), or null
    const pathsX = (y0, y1) => {
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < onScreen.length; i += 2) { const qy = onScreen[i + 1]; if (qy < y0 || qy > y1) continue; const qx = onScreen[i]; if (qx < lo) lo = qx; if (qx > hi) hi = qx; }
      return lo <= hi ? { lo, hi } : null;
    };
    const marks = items.map((it) => ({ it, x: WX(it.p.x), y: WY(it.p.y) }));
    // its own tick, or another drawn on the same spot (two apogees at one height)
    const sameMark = (q, own) => { const m = marks.find((o) => o.it === own); return q.it === own || (m && Math.hypot(q.x - m.x, q.y - m.y) < 3); };
    const coversMark = (b, own) => marks.some((q) => !sameMark(q, own) && q.x > b.l - 6 && q.x < b.r + 6 && q.y > b.t - 6 && q.y < b.b + 6);
    // where a leader may end on the label: its near side (level with the tick, else its top or bottom rows),
    // or its near edge when it sits above or below the tick
    const leaderEnds = (b, px, py) => {
      if (b.l > px || b.r < px) { const ex = b.l > px ? b.l : b.r; return [[ex, Math.max(b.t + 4, Math.min(b.b - 4, py))], [ex, b.t + 4], [ex, b.b - 4]]; }
      const ey = b.t > py ? b.t : b.b;
      return [[Math.max(b.l + 4, Math.min(b.r - 4, px)), ey], [b.l + 4, ey], [b.r - 4, ey]];
    };
    // the first of those whose leader keeps clear of the other ticks and of the labels placed before it, or null
    const leaderFor = (b, px, py, own) => {
      for (const [ex, ey] of leaderEnds(b, px, py)) {
        const dx = ex - px, dy = ey - py, l2 = dx * dx + dy * dy || 1;
        let ok = true;
        for (const q of marks) {
          if (sameMark(q, own)) continue;
          const u = Math.max(0, Math.min(1, ((q.x - px) * dx + (q.y - py) * dy) / l2));
          if (Math.hypot(px + dx * u - q.x, py + dy * u - q.y) < 6.5) { ok = false; break; }
        }
        for (const R of placed) { if (!ok) break; for (let i = 1; i < 16; i++) { const x = px + dx * i / 16, y = py + dy * i / 16; if (x > R.l && x < R.r && y > R.t && y < R.b) { ok = false; break; } } }
        if (ok) return [ex, ey];
      }
      return null;
    };
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = `10px ${th.mono}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ps.ticks = [];
    for (const it of items) {
      const px = WX(it.p.x), py = WY(it.p.y);
      ctx.strokeStyle = it.color; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(px - 5.5, py); ctx.lineTo(px + 5.5, py); ctx.moveTo(px, py - 5.5); ctx.lineTo(px, py + 5.5); ctx.stroke();
      const lines = it.lines.filter(Boolean);
      const tw = Math.max(...lines.map((l) => ctx.measureText(l).width)), lh = lines.length * 13 + 3;
      // beside the tick, then stepped down or up a label at a time with a leader back to it
      const cands = [[px + 10, py - lh / 2, false], [px - 10 - tw - 8, py - lh / 2, false], [px + 8, py - lh - 6, false], [px + 8, py + 6, false], [px - tw - 16, py - lh - 6, false], [px - tw - 16, py + 6, false]];
      for (const k of [1, -1, 2, -2, 3, -3, 4]) { const dy = k * (lh + 6); cands.push([px + 14, py - lh / 2 + dy, true], [px - 14 - tw - 8, py - lh / 2 + dy, true]); }
      const first = (list, overPath) => {
        for (const [bx, by, lead] of list) {
          const b = { l: bx, t: by, r: bx + tw + 8, b: by + lh, lead };
          if (b.l < TAPE_W + 4 || b.r > w - 4 || b.t < 2 || b.b > h - 2) continue;
          if (blocked.some((R) => hit(b, R)) || placed.some((R) => hit({ l: b.l - 3, t: b.t - 2, r: b.r + 3, b: b.b + 2 }, R)) || coversMark(b, it)) continue;
          if (!overPath && coversPath(b, px, py)) continue;
          if (lead && !(b.end = leaderFor(b, px, py, it))) continue;
          return b;
        }
        return null;
      };
      let spot = first(cands, false);
      if (!spot) {
        // none clear beside the tick: past the paths in the label's own rows, stacked a row at a time
        const far = [];
        for (const k of [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6]) {
          const by = py - lh / 2 + k * (lh + 6), ext = pathsX(by - 3, by + lh + 3);
          if (ext) far.push([ext.hi + 10, by, true], [ext.lo - 10 - tw - 8, by, true]);
        }
        spot = first(far, false) || first([...cands, ...far], true);
      }
      if (!spot) { ps.ticks.push({ key: it.key, x: px, y: py, shown: false }); continue; }
      placed.push(spot);
      if (spot.lead) {
        const [ex, ey] = spot.end || leaderEnds(spot, px, py)[0], d = Math.hypot(ex - px, ey - py) || 1;
        ctx.strokeStyle = th.a45; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(px + (ex - px) * 6 / d, py + (ey - py) * 6 / d); ctx.lineTo(ex, ey); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(10,10,10,.85)'; ctx.fillRect(spot.l, spot.t, spot.r - spot.l, spot.b - spot.t);
      lines.forEach((l, i) => { ctx.fillStyle = i === 0 ? th.a90 : th.a70; ctx.fillText(l, spot.l + 4, spot.t + 8 + i * 13); });
      ps.ticks.push({ key: it.key, x: px, y: py, shown: true, rect: { ...spot } });
    }
    ctx.restore();
  }
  function plateCaptionLines() {
    const ps = plateSt;
    const a = finWords(ps.finScale), b = ps.ghost ? finWords(ps.ghost.finScale) : '';
    const g = ps.gust > 0 ? ps.gust : 0, wmph = Math.abs(ps.wind) / MPS_PER_MPH;
    const same = b ? 'THE SAME ' : '';
    const air = wmph >= 0.05 ? `${wmph.toFixed(1)} MPH CROSSWIND EST` : '';
    const cond = g ? `${same}GUST, ${g.toFixed(1)} MPH EST${air ? `, IN A ${air}` : ''}` : air ? `${same}${air}` : `${same}STILL AIR`;
    return [b ? `${a} AND ${b}` : a, cond, `${b ? 'BOTH FLOWN' : 'FLOWN'} IN THIS TAB / SIM`];
  }
  function plateLabel() {
    const ps = plateSt; if (!ps) return 'Side view of the rocket';
    const ft = (v) => (Number.isFinite(v) ? `${Math.round(v)} ft` : 'unknown height');
    let s = `End plate: the path from the pad to apogee, ${ft(ps.apogeeFt)}, ${finWords(ps.finScale).toLowerCase()}`;
    if (ps.ghost) s += `; the other path is the same conditions with ${finWords(ps.ghost.finScale).toLowerCase()}, ${ft(ps.ghost.apogeeFt)}; both flown in this tab (SIM).`;
    else s += ', flown in this tab (SIM).';
    return s;
  }
  function plateInfo() {
    if (!plateSt || !(lastU > 0)) return null;
    const ps = plateSt;
    return { up: true, main: { finScale: ps.finScale, apogeeFt: ps.apogeeFt }, ghost: ps.ghost ? { finScale: ps.ghost.finScale, apogeeFt: ps.ghost.apogeeFt } : null, gustMph: ps.gust, windMps: ps.wind };
  }

  /* lattice CP in metres from the nose, when a lattice and its section are known */
  function latticeXcp() {
    const lat = o.lattice, sec = o.section;
    const f = lat && lat.force;
    if (!f || lat.fallback || !sec) return NaN;
    if (Number.isFinite(f.xcp_m)) return f.xcp_m;
    if (!Number.isFinite(f.xcpCells) || !(sec.cellM > 0)) return NaN;
    return (f.xcpCells - num(sec.xNoseCol, 0)) * sec.cellM;
  }

  /* flick: grab the body, drag sideways, release. Pitch rate (rad/s, + toward +x) is
     the rigid rotation r x d / |r|^2 of the grabbed point over FLICK_TAU_S. On
     screen y is down, so r x d > 0 is clockwise, which is +theta. */
  function flickRate(dr) {
    const dx = dr.x - dr.sx, dy = dr.y - dr.sy;
    const r2 = dr.rx * dr.rx + dr.ry * dr.ry;
    if (r2 < 25) return 0;
    const w = (dr.rx * dy - dr.ry * dx) / r2 / FLICK_TAU_S;
    return Math.max(-FLICK_MAX, Math.min(FLICK_MAX, w));
  }
  function hitBody(px, py) {
    if (lastU > 0) return null;                         // the end plate: nothing to grab
    const st = (flight && flight.state) || {};
    const out = ensureOutline();
    const { h, w } = size;
    const s = Math.max(40, Math.min((ROCKET_FRAC_H * h) / out.length, (1.4 * (w - TAPE_W)) / out.length));
    const cx = TAPE_W + (w - TAPE_W) * 0.5, cy = h * CG_SCREEN_Y;
    const th0 = num(st.theta, 0), c = Math.cos(th0), sn = Math.sin(th0);
    const dx = px - cx, dy = py - cy;
    const lx = dx * c + dy * sn, ly = -dx * sn + dy * c;           // inverse rotation into the body frame
    const xcg = firstFinite(st.xcg, readDerived(flight?.derived, 'xcg', num(st.t, 0)), 0.5588);
    const ref = firstFinite(st.refFromNose, xcg);
    const a = ly / s + ref, l = lx / s;
    const hit = a > -0.03 && a < out.length + 0.03 && Math.abs(l) < out.radius + 0.07;
    return hit ? { rx: dx, ry: dy } : null;
  }
  const canFlick = () => !!(flight && typeof flight.flick === 'function');
  function onDown(e) {
    if (!canFlick() || e.button > 0) return;
    const r = canvas.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    const hit = hitBody(px, py);
    if (!hit) return;
    drag = { id: e.pointerId, sx: px, sy: py, x: px, y: py, rx: hit.rx, ry: hit.ry };
    try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic events */ }
    canvas.dataset.dragging = '1';
    dirty = true; loop.wake();
  }
  function onMove(e) {
    const r = canvas.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    if (drag && e.pointerId === drag.id) { drag.x = px; drag.y = py; dirty = true; loop.wake(); return; }
    if (canFlick() && e.pointerType === 'mouse') canvas.style.cursor = hitBody(px, py) ? 'grab' : '';
  }
  function onUp(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const wv = e.type === 'pointercancel' ? 0 : flickRate(drag);
    drag = null; delete canvas.dataset.dragging; dirty = true; loop.wake();
    if (Math.abs(wv) > 0.02) {
      lastFlick = wv;
      try { flight.flick(wv); } catch (err) { console.error('[fallback] flick failed', err); }
      if (typeof o.onFlick === 'function') o.onFlick(wv);
    }
  }
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);

  /* scheduling */
  const loop = createIdleLoop(() => {
    if (!visible) return false;
    const t = flight && flight.state ? flight.state.t : NaN;
    const changed = t !== lastT;
    if (changed || dirty || drag || plateAnimating) { lastT = t; dirty = false; draw(); }
    return changed || !!drag || plateAnimating;
  }, { idleFrames: 12, poll: () => visible && flight && flight.state && flight.state.t !== lastT,
    pollMs: () => (!visible ? 0 : flight && flight.state && flight.state.phase && flight.state.phase !== 'pad' && !flight.done ? 250 : 1000) });   // C2-24: no poll off screen, 1 s at rest
  const offs = [
    bus.on('flight:reset', () => { pad = null; plateSt = null; plateAnimating = false; dirty = true; loop.wake(); }),
    bus.on('flight:event', () => { dirty = true; loop.wake(); }),
    bus.on('flight:config', () => { outlineKey = ''; dirty = true; loop.wake(); }),
    governor.subscribe(() => { resize(); }),
  ];
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => resize()) : null;
  ro && ro.observe(canvas);
  const io = typeof IntersectionObserver === 'function' ? new IntersectionObserver((es) => { visible = es[es.length - 1].isIntersecting; if (visible) { dirty = true; loop.wake(); } }) : null;
  io && io.observe(canvas);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (!destroyed) { th = readTheme(canvas); dirty = true; loop.wake(); } });
  resize();

  return {
    fallback: true,
    render() { dirty = false; lastT = flight?.state?.t; draw(); },
    resize,
    wake() { dirty = true; loop.wake(); },
    setFinScale(k) { o.finScale = Math.max(0, Number(k) || 0); outlineKey = ''; dirty = true; loop.wake(); },
    setSliceView(v) { o.view = v === 'between' ? 'between' : 'through'; outlineKey = ''; dirty = true; loop.wake(); },
    setMarkers(on) { o.markers = !!on; dirty = true; loop.wake(); },
    setGeometry(g) { geometry = g; outlineKey = ''; dirty = true; loop.wake(); },
    setFlight(f) { flight = f; pad = null; outlineKey = ''; dirty = true; loop.wake(); },
    setLattice(lat, section) { o.lattice = lat; if (section) o.section = section; dirty = true; loop.wake(); },
    setSection(section) { o.section = section; dirty = true; loop.wake(); },
    setCaption(lines) { o.caption = lines; dirty = true; loop.wake(); },
    /* the end plate (item 10): setPlate(false) keeps the follow view at the apogee stop;
       setPlateOptions({ghost, gustMph, ghostValid, avoid, reduced, plateCaption}) late binding */
    setPlate(on) { o.plate = on !== false; plateSt = null; dirty = true; loop.wake(); },
    setPlateOptions(next = {}) { for (const k of ['ghost', 'gustMph', 'ghostValid', 'avoid', 'reduced', 'plateCaption']) if (k in next) o[k] = next[k]; plateSt = null; avoidAt = -Infinity; dirty = true; loop.wake(); },
    /* {up, main: {finScale, apogeeFt}, ghost: {finScale, apogeeFt} | null, gustMph, windMps} while the plate is up, else null (the shape of the scene director's plate) */
    get plate() { return plateInfo(); },
    get state() {
      const ps = plateSt && lastU > 0 ? plateSt : null;
      return { draws: stats.draws, lastDrawMs: stats.lastDrawMs, running: loop.running, visible, markers: o.markers, finScale: o.finScale, view: o.view, outlineSource: outline ? outline.source : null, lastFlick, size: { ...size }, dpr,
        plate: ps ? { up: true, k: ps.k, u: lastU, scale: ps.fit ? ps.fit.s : NaN, area: ps.fit ? { ...ps.fit.area } : null, box: ps.fit ? { ...ps.fit.box } : null, points: ps.main.length, ghostPoints: ps.ghost ? ps.ghost.points.length : 0, ghostFinScale: ps.ghost ? ps.ghost.finScale : null, apogeeFt: ps.apogeeFt, ghostApogeeFt: ps.ghost ? ps.ghost.apogeeFt : null, ticks: ps.ticks.map((t) => ({ ...t })), caption: o.plateCaption === false ? null : plateCaptionLines() } : { up: false } };
    },
    destroy() {
      destroyed = true; loop.destroy(); offs.forEach((f) => f()); ro && ro.disconnect(); io && io.disconnect();
      canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp); canvas.removeEventListener('pointercancel', onUp);
      canvas.classList.remove('pn-fallback');
    },
  };
}

function head(ctx, x, y, ux, uy, size, color) {
  const px = -uy, py = ux;
  ctx.fillStyle = color; ctx.beginPath();
  ctx.moveTo(x + ux * 2, y + uy * 2);
  ctx.lineTo(x - ux * size + px * size * 0.45, y - uy * size + py * size * 0.45);
  ctx.lineTo(x - ux * size - px * size * 0.45, y - uy * size - py * size * 0.45);
  ctx.closePath(); ctx.fill();
}
/* a label plate; dimFirst: the first line is a quiet heading (false: every line at full strength) */
function plate(ctx, th, lines, x, y, dimFirst = true) {
  ctx.font = `10px ${th.mono}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  const wMax = Math.max(...lines.map((l) => ctx.measureText(l).width));
  ctx.fillStyle = 'rgba(10,10,10,.72)'; ctx.fillRect(x - 4, y - 8, wMax + 8, lines.length * 13 + 3);
  lines.forEach((l, i) => { ctx.fillStyle = i === 0 && dimFirst ? th.a70 : th.a90; ctx.fillText(l, x, y + i * 13); });
}
const unit = (dx, dy) => { const l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; };
const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
