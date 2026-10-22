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
   the view moves only when the flight moves. */
import { bus } from '../core/bus.js';
import { governor } from '../core/governor.js';
import { DEG, M_PER_FT, M_PER_IN, N_PER_LBF, fixed, timeCode, phaseLabel, readDerived, firstFinite, readHistory, resolveOutline, createIdleLoop, fitCanvas, readTheme } from './format.js';
import { cgSymbol } from './chart.js';

const CG_SCREEN_Y = 0.56;        // CG sits at 56 % of the canvas height: room for the wind arrow above the nose
const ROCKET_FRAC_H = 0.56;      // rocket length as a fraction of the canvas height
const TAPE_W = 58;               // CSS px, altitude tape on the left edge
const TAPE_PX_PER_FT = 3;        // tape scale; 260 ft/s at 1x scrolls 780 px/s
const SCALE_BAR_IN = 6;          // scale bar length, inches
const FLICK_TAU_S = 0.35;        // s: a drag of r x d over |r|^2 radians is spread over this time to give a pitch rate (EST, feel)
const FLICK_MAX = 4;             // rad/s clamp on the flick impulse
const N_ARROW_PX_PER_LBF = 60;   // px per lbf for the normal-force arrow, clamped to 0.35 of the rocket length

export function createFallbackView(canvas, geometry, flight, opts = {}) {
  const ctx = canvas.getContext('2d');
  const o = Object.assign({ markers: true, finScale: 1, view: 'through', lattice: null, caption: null, onFlick: null, selfLoop: true }, opts);
  let th = readTheme(canvas);
  let size = { w: 1, h: 1 }, dpr = governor.dpr();
  let outline = null, outlineKey = '';
  let lastT = NaN, dirty = true, visible = true, destroyed = false;
  let pad = null;                 // {x, y, theta} captured on the pad, for the ground and the rail
  let drag = null;                // {id, sx, sy, x, y, rx, ry}
  let lastFlick = NaN, lastLabel = 0;
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
    const s = Math.max(40, Math.min((ROCKET_FRAC_H * h) / L, (1.4 * (w - TAPE_W)) / L));   // px per metre
    const cx = TAPE_W + (w - TAPE_W) * 0.5, cy = h * CG_SCREEN_Y;
    // world (m, y up) to screen, camera on the CG
    const WX = (wx) => cx + (wx - x) * s, WY = (wy) => cy - (wy - y) * s;

    // ground and rail near the pad (world frame); both leave the view after launch
    const tailOff = L - ref;
    const gx = pad.x - tailOff * Math.sin(pad.theta), gy = pad.y - tailOff * Math.cos(pad.theta);
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
      if (groundY + 14 < h) ctx.fillText(`PAD / RAIL ${fixed(railLen / M_PER_IN, 0)} IN`, Math.max(TAPE_W + 8, WX(bx) + 10), groundY + 6);
    }

    // rocket in its own frame: translate to the CG, rotate by theta
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

    const toScreen = (a, l) => { const lx = l * s, ly = (a - ref) * s, c = Math.cos(theta), sn = Math.sin(theta); return [cx + lx * c - ly * sn, cy + lx * sn + ly * c]; };
    const dirScreen = (dx, dy) => { const c = Math.cos(theta), sn = Math.sin(theta); return [dx * c - dy * sn, dx * sn + dy * c]; };

    if (o.markers) {
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
      const labA = `AOA ${fixed(alpha * DEG, 2, true).trim()} DEG`;
      const labW = `REL WIND ${fixed(v / M_PER_FT, 1)} FT/S`;
      const lx = Math.max(sx0, nx) + 14, ly = Math.min(sy0, ny - r) + 2;
      plate(ctx, th, [labW, labA], Math.min(lx, w - 150), Math.max(14, ly));

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
      if (Number.isFinite(xl)) { const [lx2, ly2] = toScreen(xl, 0); ctx.strokeStyle = th.a90; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(lx2, ly2, 8, 0, Math.PI * 2); ctx.stroke(); marks.push({ a: xl, text: `CP LBM ${fixed(xl / M_PER_IN, 2)} IN` }); }
      if (Number.isFinite(xcp)) { const [px, py] = toScreen(xcp, 0); ctx.fillStyle = th.accent; ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.fill(); marks.push({ a: xcp, text: `CP ${fixed(xcp / M_PER_IN, 2)} IN` }); }
      cgSymbol(ctx, gx2, gy2, 7, th.paper, th.ink900);
      marks.push({ a: xcg, text: `CG ${fixed(xcg / M_PER_IN, 2)} IN` });
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
        ctx.strokeStyle = th.a18; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(mx + nxs * (R * s + 3), my + nys * (R * s + 3)); ctx.lineTo(lx3 + (right ? -3 : 3), ly3); ctx.stroke();
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

    drawTape(firstFinite(st.altitude, y));
    drawCaption(t, st.phase);
    drawScaleBar(s);
    stats.draws++; stats.lastDrawMs = performance.now() - t0;
    const now = performance.now();
    if (now - lastLabel > 1000) {   // aria-label at most once per second
      lastLabel = now;
      canvas.setAttribute('aria-label', `Side view of the rocket at ${timeCode(t)}: ${phaseLabel(st.phase).toLowerCase()}, pitch ${fixed(theta * DEG, 1, true).trim()} degrees, angle of attack ${fixed(alpha * DEG, 1, true).trim()} degrees, altitude ${fixed(y / M_PER_FT, 0)} ft.`.replace(/−/g, 'minus '));
    }
  }

  function drawTape(y) {
    const { h } = size;
    const alt = y / M_PER_FT;
    ctx.fillStyle = th.ink900; ctx.fillRect(0, 0, TAPE_W, h);
    ctx.strokeStyle = th.a18; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(TAPE_W - 0.5, 0); ctx.lineTo(TAPE_W - 0.5, h); ctx.stroke();
    const cy = h * CG_SCREEN_Y;
    const span = h / TAPE_PX_PER_FT;
    ctx.font = `10px ${th.mono}`; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let f = Math.floor((alt - span) / 10) * 10, n = 0; f <= alt + span && n < 1000; f += 10, n++) {   // bounded: at 1e17 ft, f + 10 === f
      const ty = cy - (f - alt) * TAPE_PX_PER_FT;
      if (ty < -10 || ty > h + 10) continue;
      const major = f % 50 === 0;
      ctx.strokeStyle = major ? th.a45 : th.a18;
      ctx.beginPath(); ctx.moveTo(TAPE_W - (major ? 10 : 5), Math.round(ty) + 0.5); ctx.lineTo(TAPE_W - 1, Math.round(ty) + 0.5); ctx.stroke();
      if (major && Math.abs(ty - cy) > 14 && ty > 26 && ty < h - 8) { ctx.fillStyle = th.a70; ctx.fillText(String(f), TAPE_W - 14, ty); }   // clear of the caption and the bottom edge
    }
    // current altitude box
    ctx.fillStyle = th.ink900; ctx.fillRect(2, cy - 9, TAPE_W - 6, 18);
    ctx.strokeStyle = th.a70; ctx.strokeRect(2.5, cy - 8.5, TAPE_W - 7, 17);
    ctx.fillStyle = th.paper; ctx.fillText(fixed(alt, 0), TAPE_W - 8, cy + 0.5);
    ctx.fillStyle = th.ink900; ctx.fillRect(0, 0, TAPE_W - 1, 22);
    ctx.fillStyle = th.a70; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('ALT FT', 6, 8);
  }

  function drawCaption(t, phase) {
    const lines = o.caption || ['2D VIEW / PITCH PLANE', 'TRUE ANGLES / SIM'];
    ctx.font = `10px ${th.mono}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    let yy = 8;
    for (const [i, line] of [...lines, `${timeCode(t)} / ${phaseLabel(phase)}`].entries()) {
      ctx.fillStyle = i === lines.length ? th.paper : th.a70;
      ctx.fillText(line, TAPE_W + 12, yy); yy += 14;
    }
  }

  function drawScaleBar(s) {
    const { w, h } = size;
    const len = SCALE_BAR_IN * M_PER_IN * s;
    const x1 = w - 14, x0 = x1 - len, yb = h - 14;
    ctx.strokeStyle = th.a70; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x0, yb - 4); ctx.lineTo(x0, yb + 0.5); ctx.lineTo(x1, yb + 0.5); ctx.lineTo(x1, yb - 4); ctx.stroke();
    ctx.fillStyle = th.a70; ctx.font = `10px ${th.mono}`; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    ctx.fillText(`${SCALE_BAR_IN} IN`, x1, yb - 6);
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
    if (changed || dirty || drag) { lastT = t; dirty = false; draw(); }
    return changed || !!drag;
  }, { idleFrames: 12, poll: () => visible && flight && flight.state && flight.state.t !== lastT });
  const offs = [
    bus.on('flight:reset', () => { pad = null; dirty = true; loop.wake(); }),
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
    get state() { return { draws: stats.draws, lastDrawMs: stats.lastDrawMs, running: loop.running, visible, markers: o.markers, finScale: o.finScale, view: o.view, outlineSource: outline ? outline.source : null, lastFlick, size: { ...size }, dpr }; },
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
function plate(ctx, th, lines, x, y) {
  ctx.font = `10px ${th.mono}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  const wMax = Math.max(...lines.map((l) => ctx.measureText(l).width));
  ctx.fillStyle = 'rgba(10,10,10,.72)'; ctx.fillRect(x - 4, y - 8, wMax + 8, lines.length * 13 + 3);
  lines.forEach((l, i) => { ctx.fillStyle = i === 0 ? th.a70 : th.a90; ctx.fillText(l, x, y + i * 13); });
}
const unit = (dx, dy) => { const l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; };
const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
