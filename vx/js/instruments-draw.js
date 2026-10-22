/* instruments-draw.js — the maths and the canvas-2D painters behind the three
   rail instruments (altimeter tape with drum counter, non-linear VSI, engine-style
   frame-time gauge). Everything here is pure: it takes a 2D context, a box in CSS
   px, a data object and a theme, and draws. Scheduling, DOM and bus wiring live in
   instruments.js.

   Symbology rules (from the architecture): 1.5 px strokes, paper-a90 on ink-900,
   no glow, no bloom. The livery orange marks only the next-section line and bug
   and the active tier annunciator (never small text: orange on ink is 4.2:1);
   the deep red marks only an over-budget frame time.
   Text that carries information (tick labels, scale labels, units, SRC lines,
   station names) is paper-a70 or stronger; paper-a45 is kept for the drum's
   off faces and paper-a18 for hatching and unreachable tiers. The words a reader
   needs on the tape (station index and name, 500 px tick numbers, SRC lines) are
   9 to 10 px; a station name that does not fit steps down to 8 px, then takes an
   ellipsis.
   All text is IBM Plex Mono through the theme's font string.

   Every painter tolerates NaN, Infinity and degenerate boxes: it draws what it
   can and never throws or loops without bound. */

export const TAPE_TICK_PX = 100;      // scroll px between minor ticks on the altimeter tape
export const TAPE_LABEL_PX = 500;     // scroll px between labelled major ticks
export const DRUM_DIGITS = 5;         // the counter shows 00000..99999 px
export const DRUM_CARRY_PX = 10;      // a higher wheel turns only during the last 10 px (10 %) of the lower wheel's 100 px turn
export const VSI_HALF_DEG = 85;       // 170 degree dial: 85 degrees each side of zero
export const VSI_MAX = 3000;          // px/s at the end of the scale
export const ENGINE_MAX_MS = 50;      // end of the frame-time scale
export const BUDGET_MS = 1000 / 60;   // 16.7 ms, one frame at 60 Hz
export const WARN_MS = BUDGET_MS + 1; // one millisecond of tolerance so a steady 60 Hz (measured as 16.7) never reads as over budget
export const ENGINE_START_DEG = 150;  // arc starts lower-left (canvas degrees, clockwise from east)
export const ENGINE_SWEEP_DEG = 240;  // and sweeps clockwise to lower-right
export const FLASH_MS = 240;          // annunciator flash on a tier change (his --dur-2)
export const STROKE = 1.5;            // symbology stroke in CSS px
export const CAPTION_H = 24;          // two caption lines (name/unit and SRC) under a stacked instrument
export const NAME_PX = 9;             // caption name size (ALT, VSI, ENG)
export const SRC_PX = 9;              // SRC line size: "SRC: SCROLL" untracked is 59.4 px, inside the 63 px rail canvas
export const STATION_IDX_PX = 10;     // station index on the rail tape
export const STRIP_IDX_PX = 9;        // station index along the strip's top edge (10 px would clip at the canvas top)
export const STATION_PX = 9;          // station name on the tape; fitted down to STATION_MIN_PX, then cut with an ellipsis
export const STATION_MIN_PX = 8;
export const TICK_PX = 9;             // 500 px tick numbers
export const UNIT_PX = 7.5;           // caption unit size (PX, P95 16.8)
const MAX_TICKS = 2000;               // loop guard for the tape ticks (far beyond any real tape)

const DEG = Math.PI / 180;
const num = (v, fallback = 0) => (Number.isFinite(v) ? v : fallback);

/* VSI needle deflection in degrees from zero for a velocity v in px/s. The scale is
   non-linear like the real instrument: 0–500 px/s takes half of each 85 degree
   half-arc, 500–1000 a quarter, 1000–3000 the last quarter. Beyond 3000 the needle
   rests on the stop. NaN reads as zero. */
export function vsiAngle(v) {
  const s = Math.min(VSI_MAX, Math.abs(v) || 0);
  let f;
  if (s <= 500) f = (s / 500) * 0.5;
  else if (s <= 1000) f = 0.5 + ((s - 500) / 500) * 0.25;
  else f = 0.75 + ((s - 1000) / 2000) * 0.25;
  return (v > 0 ? 1 : v < 0 ? -1 : 0) * f * VSI_HALF_DEG;
}

/* Odometer wheels for a scroll depth in px. Wheel 0 carries the last two digits on
   one drum of 100 faces (00..99) that turns once per 100 px, so its position is
   value mod 100 / 100 of a turn; its sub-face offset is the fractional px. Each
   higher wheel (hundreds, thousands, ten-thousands) is driven by a carry pin and
   moves only during the last 10 px of the wheel below, exactly like a mechanical
   counter. Returns [{ faces, index, offset }] with offset in 0..1 of one face. */
export function drumWheels(value) {
  const v = Math.max(0, Math.min(99999.999, num(value)));
  const pair = v % 100;
  const wheels = [{ faces: 100, index: Math.floor(pair), offset: pair - Math.floor(pair) }];
  let modulus = 100;                                  // full turn of the wheel below, in px
  for (let k = 0; k < DRUM_DIGITS - 2; k++) {
    const lowerTurn = modulus;                        // 100, 1000, 10000 px
    modulus *= 10;                                    // this wheel's full turn: 1000, 10000, 100000 px
    const index = Math.floor((v % modulus) / lowerTurn);
    const below = v % lowerTurn;                      // where the wheel below is inside its own turn
    const offset = Math.max(0, (below - (lowerTurn - DRUM_CARRY_PX)) / DRUM_CARRY_PX);
    wheels.push({ faces: 10, index, offset });
  }
  return wheels;
}

/* Engine arc angle (canvas radians) for a frame time in ms. NaN reads as zero. */
export function engineAngle(ms) {
  const f = Math.max(0, Math.min(1, num(ms) / ENGINE_MAX_MS));
  return (ENGINE_START_DEG + f * ENGINE_SWEEP_DEG) * DEG;
}

/* ---- small helpers ---------------------------------------------------- */

/* Older themes (before `mid` existed) fall back to `dim` for informational text. */
function norm(th) { return th.mid ? th : { ...th, mid: th.dim }; }
function font(ctx, th, px, spacing = 0) {
  ctx.font = `400 ${px}px ${th.mono}`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = spacing ? `${spacing}em` : '0px';
}
function text(ctx, th, str, x, y, { px = 8, align = 'left', color = th.sym, spacing = 0, baseline = 'middle' } = {}) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  font(ctx, th, px, spacing);
  ctx.textAlign = align; ctx.textBaseline = baseline; ctx.fillStyle = color;
  ctx.fillText(str, Math.round(x), Math.round(y));
}
/* Text that must fit a width: steps the size down to opts.minPx (never below 8 px),
   then cuts characters behind an ellipsis. Measures only; returns { s, px, w }. */
function fitText(ctx, th, str, maxW, opts) {
  const min = Math.max(8, opts.minPx || 8);
  let px = opts.px, s = str;
  font(ctx, th, px, opts.spacing || 0);
  while (ctx.measureText(s).width > maxW && px > min) { px = Math.max(min, px - 0.5); font(ctx, th, px, opts.spacing || 0); }
  if (ctx.measureText(s).width > maxW) {
    while (s.length > 1 && ctx.measureText(s + '\u2026').width > maxW) s = s.slice(0, -1);
    s = s.replace(/\s+$/, '') + '\u2026';
  }
  return { s, px, w: ctx.measureText(s).width };
}
/* Glyph band of a line of caps or digits drawn with textBaseline 'middle': half an em
   above the centre and 0.4 em below, slightly generous against Plex Mono's measured box
   (4.4 / 3.6 px at 9 px), so collision tests err on the side of a gap. */
const bandUp = (px) => 0.5 * px, bandDn = (px) => 0.4 * px;
/* Axis-aligned rectangles [x0, y0, x1, y1]; true when they come closer than pad px. */
const hits = (a, b, pad = 1) => a[0] < b[2] + pad && b[0] < a[2] + pad && a[1] < b[3] + pad && b[1] < a[3] + pad;
function line(ctx, x0, y0, x1, y1, color, width = STROKE) {
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'butt'; ctx.stroke();
}
/* Diagonal hatch (1 px lines every 6 px) for the parts of a tape that lie outside the page. */
function hatch(ctx, x, y, w, h, color) {
  if (!(w > 0) || !(h > 0) || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w + h)) return;
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.beginPath();
  for (let d = -h; d < w + h; d += 6) { ctx.moveTo(x + d, y + h); ctx.lineTo(x + d + h, y); }
  ctx.stroke(); ctx.restore();
}
/* Two caption lines at the bottom of a stacked instrument: NAME ... UNIT, then SRC. */
function caption(ctx, th, w, h, name, unit, src) {
  text(ctx, th, name, 2, h - 15, { px: NAME_PX, color: th.sym, spacing: 0.08 });
  if (unit) text(ctx, th, unit, w - 2, h - 15, { px: UNIT_PX, align: 'right', color: th.mid, spacing: 0.04 });
  text(ctx, th, src, 2, h - 5, { px: SRC_PX, color: th.mid });
}
/* Mix two CSS colours given as rgb arrays. */
function mix(a, b, t) { return `rgb(${a.map((c, i) => Math.round(c + (b[i] - c) * t)).join(',')})`; }
export function parseRgb(css) {
  const m = /rgba?\(([^)]+)\)/.exec(css);
  if (m) return m[1].split(',').slice(0, 3).map(Number);
  const h = /#([0-9a-f]{6})/i.exec(css);
  if (h) return [0, 2, 4].map(i => parseInt(h[1].slice(i, i + 2), 16));
  return [255, 255, 255];
}

/* ---- drum counter -------------------------------------------------------- */

/* A five-digit mechanical counter inside a hairline box centred on (cx, cy).
   Each wheel is drawn as a clipped strip of faces; a wheel mid-carry shows the
   outgoing face sliding up and the incoming one rising from below. */
export function drawDrum(ctx, th, cx, cy, value, { boxW = 48, boxH = 18, px = 11, pointer = 'left' } = {}) {
  th = norm(th);
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return;
  const x0 = Math.round(cx - boxW / 2), y0 = Math.round(cy - boxH / 2);
  const faceH = boxH - 2;                        // one face is the box interior
  ctx.fillStyle = th.ink; ctx.fillRect(x0, y0, boxW, boxH);
  ctx.strokeStyle = th.sym; ctx.lineWidth = 1; ctx.strokeRect(x0 + .5, y0 + .5, boxW - 1, boxH - 1);
  if (pointer === 'left') {                      // notch toward the tape scale
    ctx.beginPath(); ctx.moveTo(x0 + .5, cy - 5); ctx.lineTo(x0 - 6, cy); ctx.lineTo(x0 + .5, cy + 5); ctx.closePath();
    ctx.fillStyle = th.ink; ctx.fill(); ctx.strokeStyle = th.sym; ctx.stroke();
    ctx.fillStyle = th.ink; ctx.fillRect(x0 + 1, cy - 4, 2, 8);  // reopen the box edge under the notch
  }
  const wheels = drumWheels(value);              // [pair, hundreds, thousands, ten-thousands]
  font(ctx, th, px); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const colW = (boxW - 6) / DRUM_DIGITS;         // uniform digit pitch, 3 px inset each side
  ctx.save(); ctx.beginPath(); ctx.rect(x0 + 1, y0 + 1, boxW - 2, boxH - 2); ctx.clip();
  // Draw wheels from the most significant (left) to the pair wheel (right, two columns wide).
  // Every digit sits on the same column pitch, so the pair wheel's two characters are drawn one per column.
  for (let w = wheels.length - 1; w >= 0; w--) {
    const wheel = wheels[w];
    const slot = wheels.length - 1 - w;          // 0 = ten-thousands ... 3 = the pair
    for (let k = -1; k <= 2; k++) {              // neighbouring faces so the roll is continuous
      const faceIndex = (wheel.index + k + wheel.faces) % wheel.faces;
      const y = cy + (k - wheel.offset) * faceH;
      if (y < y0 - faceH || y > y0 + boxH + faceH) continue;
      const str = wheel.faces === 100 ? String(faceIndex).padStart(2, '0') : String(faceIndex);
      ctx.fillStyle = (k === 0 && wheel.offset < .5) || (k === 1 && wheel.offset >= .5) ? th.sym : th.dim;
      for (let c = 0; c < str.length; c++) ctx.fillText(str[c], Math.round(x0 + 3 + colW * (slot + c + .5)), Math.round(y));
    }
  }
  ctx.restore();
}

/* ---- altimeter ------------------------------------------------------------ */

/* d: { y, max, scale (tape px per scroll px), sections: [{ index, label, top, state: 'past'|'current'|'next'|'ahead' }],
        nextTop (px or null), wide (horizontal tape for the strip) } */
export function drawAltimeter(ctx, th, w, h, d) {
  th = norm(th);
  ctx.clearRect(0, 0, w, h);
  const data = { ...d, y: num(d.y), max: Math.max(0, num(d.max)), scale: d.scale > 0 && Number.isFinite(d.scale) ? d.scale : 0.12, sections: Array.isArray(d.sections) ? d.sections : [] };
  if (data.wide) return drawAltimeterWide(ctx, th, w, h, data);
  const tapeH = h - CAPTION_H;
  const cy = Math.round(tapeH / 2);
  const { scale, y, max } = data;
  const yOf = (s) => cy - (s - y) * scale;        // deeper on the page = higher on the tape, like altitude
  const lo = y - cy / scale, hi = y + (tapeH - cy) / scale;   // scroll depths at the tape's bottom and top
  const boxTop = cy - 9, boxBot = cy + 9;          // drum box occupies this band
  const drumBox = [6, boxTop, 60, boxBot];          // box plus its notch toward the scale
  const tape = [0, 0, w, tapeH];
  const inside = (r) => r[1] >= tape[1] && r[3] <= tape[3];
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, w, Math.max(0, tapeH)); ctx.clip();
  hatch(ctx, 0, 0, w, Math.min(tapeH, yOf(max)), th.faint);                  // beyond the page end
  hatch(ctx, 0, Math.max(0, yOf(0)), w, tapeH - Math.max(0, yOf(0)), th.faint); // above the page top
  // station marks first so tick labels can yield to them. Each mark is a hairline from
  // x 24 to the edge; the index (10 px) sits above and the name (9 px) below, both
  // right-aligned at the edge and set 13 px off the line so they clear the 14 px tall
  // next-section bug. Text is drawn only when it clears the drum box by a pixel and
  // lies inside the tape; every drawn rectangle is kept so tick numbers can yield.
  const taken = [];
  const right = w - 2, nameLeft = 12;               // the name never reaches the 10 px major ticks
  for (const s of data.sections) {
    const ty = yOf(num(s.top));
    if (!(ty >= -24 && ty <= tapeH + 24)) continue;
    const r = Math.round(ty);
    const col = s.state === 'next' || s.state === 'current' ? th.sym : th.mid;   // the orange is kept for the line and the bug: small orange text on ink is 4.2:1
    line(ctx, 24, r + .5, w, r + .5, s.state === 'next' ? th.livery : th.faint, 1);
    taken.push([24, r - 1, w, r + 2]);
    const idx = String(s.index == null ? '' : s.index);
    if (idx) {
      const iy = r - 13;
      font(ctx, th, STATION_IDX_PX);
      const iw = ctx.measureText(idx).width;
      const rect = [right - iw, iy - bandUp(STATION_IDX_PX), right, iy + bandDn(STATION_IDX_PX)];
      if (!hits(rect, drumBox) && inside(rect)) {
        text(ctx, th, idx, right, iy, { px: STATION_IDX_PX, align: 'right', color: col });
        taken.push([13, rect[1], rect[2], rect[3]]);   // the whole row: '11500  05' would read as one number
      }
    }
    if (s.label) {
      const ny = r + 13;
      const fit = fitText(ctx, th, String(s.label), right - nameLeft, { px: STATION_PX, minPx: STATION_MIN_PX });
      const rect = [right - fit.w, ny - bandUp(fit.px), right, ny + bandDn(fit.px)];
      if (!hits(rect, drumBox) && inside(rect)) {
        text(ctx, th, fit.s, right, ny, { px: fit.px, align: 'right', color: col });
        taken.push(rect);
      }
    }
  }
  // ticks every 100 px, numbers every 500 px; a number is skipped where it would touch
  // the drum box, a station's line or text or index row, or the number before it, or
  // where the tape edge would cut it
  const first = Math.ceil(Math.max(lo, 0) / TAPE_TICK_PX) * TAPE_TICK_PX;
  const last = Math.min(hi, max);
  let prev = null;
  for (let s = first, n = 0; s <= last + 1e-6 && n < MAX_TICKS; s += TAPE_TICK_PX, n++) {
    const ty = Math.round(yOf(s)) + .5;
    const major = Math.round(s) % TAPE_LABEL_PX === 0;
    line(ctx, 0, ty, major ? 10 : 5, ty, th.sym, 1);
    if (!major) continue;
    const str = String(Math.round(s));
    font(ctx, th, TICK_PX);
    const rect = [13, ty - bandUp(TICK_PX), 13 + ctx.measureText(str).width, ty + bandDn(TICK_PX)];
    if (!inside(rect) || hits(rect, drumBox) || taken.some(t => hits(rect, t)) || (prev && hits(rect, prev))) continue;
    text(ctx, th, str, 13, ty, { px: TICK_PX, color: th.mid });
    prev = rect;
  }
  // next-section bug: a notched orange marker on the right edge, like a PFD altitude bug
  if (Number.isFinite(data.nextTop)) {
    const ty = Math.max(6, Math.min(tapeH - 6, yOf(data.nextTop)));
    ctx.beginPath();
    ctx.moveTo(w, ty - 7); ctx.lineTo(w - 7, ty - 7); ctx.lineTo(w - 7, ty - 3); ctx.lineTo(w - 3, ty);
    ctx.lineTo(w - 7, ty + 3); ctx.lineTo(w - 7, ty + 7); ctx.lineTo(w, ty + 7); ctx.closePath();
    ctx.fillStyle = th.livery; ctx.fill();
  }
  ctx.restore();
  line(ctx, 0, cy, 6, cy, th.sym);                 // reference line stub into the scale
  drawDrum(ctx, th, 36, cy, y, { boxW: 48, boxH: 18, px: 11 });
  caption(ctx, th, w, h, 'ALT', 'PX', 'SRC: SCROLL');
}

/* Horizontal tape for the bottom strip: deeper to the right, ticks rising from a
   baseline, station indices along the top edge, the drum box centred on the reference. */
function drawAltimeterWide(ctx, th, w, h, d) {
  const base = 40;                                 // tick baseline; the caption sits beneath it
  const cx = Math.round(w / 2);
  const { scale, y, max } = d;
  const xOf = (s) => cx + (s - y) * scale;
  const lo = y - cx / scale, hi = y + (w - cx) / scale;
  const boxL = cx - 24, boxR = cx + 24;
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, w, base + 1); ctx.clip();
  hatch(ctx, 0, 0, Math.min(w, xOf(0)), base, th.faint);
  hatch(ctx, Math.max(0, xOf(max)), 0, w - Math.max(0, xOf(max)), base, th.faint);
  line(ctx, 0, base + .5, w, base + .5, th.faint, 1);
  const marks = [];
  for (const s of d.sections) {
    const tx = Math.round(xOf(num(s.top))) + .5;
    if (!(tx >= -20 && tx <= w + 20)) continue;
    marks.push(tx);
    const col = s.state === 'next' || s.state === 'current' ? th.sym : th.mid;
    line(ctx, tx, 0, tx, 8, s.state === 'next' ? th.livery : th.dim, 1);
    if (tx < boxL - 6 || tx > boxR + 6) text(ctx, th, s.index, tx + 8, 5, { px: STRIP_IDX_PX, color: col });   // 8 px clears the bug's half-width; 9 px glyphs span y 0.5..8.6
  }
  const first = Math.ceil(Math.max(lo, 0) / TAPE_TICK_PX) * TAPE_TICK_PX;
  const last = Math.min(hi, max);
  let prevR = -Infinity;
  for (let s = first, n = 0; s <= last + 1e-6 && n < MAX_TICKS; s += TAPE_TICK_PX, n++) {
    const tx = Math.round(xOf(s)) + .5;
    const major = Math.round(s) % TAPE_LABEL_PX === 0;
    line(ctx, tx, base, tx, base - (major ? 9 : 5), th.sym, 1);
    if (!major) continue;
    const str = String(Math.round(s));
    font(ctx, th, TICK_PX);
    const half = ctx.measureText(str).width / 2;
    if (tx + half > boxL - 3 && tx - half < boxR + 3) continue;   // the number shares the drum box's rows (y 21..29): keep 3 px from it
    if (tx - half < 1 || tx + half > w - 1) continue;            // never half a number at the cell edge
    if (tx - half < prevR + 4) continue;                         // a dense tape scale never overprints two numbers
    if (marks.some(m => Math.abs(m - tx) < 14)) continue;
    text(ctx, th, str, tx, base - 15, { px: TICK_PX, align: 'center', color: th.mid });
    prevR = tx + half;
  }
  if (Number.isFinite(d.nextTop)) {
    const tx = Math.max(6, Math.min(w - 6, xOf(d.nextTop)));
    ctx.beginPath();                               // bug hanging from the top edge, notch pointing down
    ctx.moveTo(tx - 6, 0); ctx.lineTo(tx + 6, 0); ctx.lineTo(tx + 6, 6); ctx.lineTo(tx + 3, 6); ctx.lineTo(tx, 10);
    ctx.lineTo(tx - 3, 6); ctx.lineTo(tx - 6, 6); ctx.closePath();
    ctx.fillStyle = th.livery; ctx.fill();
  }
  ctx.restore();
  line(ctx, cx, base - 10, cx, base, th.sym);      // reference pointer under the drum
  drawDrum(ctx, th, cx, 20, y, { boxW: 48, boxH: 18, px: 11, pointer: 'none' });
  text(ctx, th, 'ALT', 2, h - 6, { px: 8, color: th.sym, spacing: 0.08 });
  text(ctx, th, 'SRC: SCROLL', w - 2, h - 6, { px: SRC_PX, align: 'right', color: th.mid });
}

/* ---- vertical speed indicator ---------------------------------------------- */

/* d: { vy, peak, showPeak, wide }
   The pivot sits at the left edge and the 170 degree arc opens to the right, so a
   64 px rail gets a 50 px needle: zero points east, climb (scrolling down the page,
   vy > 0) swings the needle up, descent swings it down, as on the round instrument.
   In the strip the text block (name, value, unit, SRC) needs about 60 px to the
   right of the dial, so narrow cells shrink the dial first and drop its labels. */
export function drawVsi(ctx, th, w, h, d) {
  th = norm(th);
  ctx.clearRect(0, 0, w, h);
  const wide = d.wide;
  const vy = num(d.vy), peak = num(d.peak);
  const dialH = wide ? h : h - CAPTION_H;
  const R = wide ? Math.max(10, Math.min(24, h / 2 - 4, w - 78)) : Math.max(10, Math.min(w - 14, dialH / 2 - 4));
  const showLabels = R >= 20;
  const cx = 8, cy = Math.round(dialH / 2);
  const angle = (v) => -vsiAngle(v) * DEG;                 // canvas y points down, so climb is a negative angle
  ctx.beginPath(); ctx.arc(cx, cy, R, -VSI_HALF_DEG * DEG, VSI_HALF_DEG * DEG); ctx.strokeStyle = th.faint; ctx.lineWidth = 1; ctx.stroke();
  // scale marks: minor every 100 to 500, then 1000, 2000, 3000; labels in hundreds of px/s
  const marks = [0, 100, 200, 300, 400, 500, 1000, 2000, 3000];
  const labels = wide ? { 0: '0', 500: '5', 3000: '30' } : { 0: '0', 500: '5', 1000: '10', 3000: '30' };
  for (const v of marks) {
    for (const sign of v === 0 ? [1] : [1, -1]) {
      const a = angle(v * sign);
      const major = v === 0 || v === 500 || v === 1000 || v === 3000;
      const len = major ? 6 : 3;
      line(ctx, cx + Math.cos(a) * (R - len), cy + Math.sin(a) * (R - len), cx + Math.cos(a) * R, cy + Math.sin(a) * R, th.sym, major ? STROKE : 1);
      if (labels[v] && showLabels) {
        const off = wide ? 9 : 11;
        text(ctx, th, labels[v], cx + Math.cos(a) * (R - off), cy + Math.sin(a) * (R - off), { px: wide ? 6 : 7, align: 'center', color: th.mid });
      }
    }
  }
  if (!wide) {                                              // outside the arc, in the free corners to the right of its ends
    text(ctx, th, 'UP', w - 2, cy - R + 4, { px: 6.5, align: 'right', color: th.mid, spacing: 0.06 });
    text(ctx, th, 'DN', w - 2, cy + R - 4, { px: 6.5, align: 'right', color: th.mid, spacing: 0.06 });
  }
  // peak-hold mark outside the rim
  if (d.showPeak && Math.abs(peak) >= 1) {
    const a = angle(peak);
    line(ctx, cx + Math.cos(a) * (R + 1), cy + Math.sin(a) * (R + 1), cx + Math.cos(a) * (R + 5), cy + Math.sin(a) * (R + 5), th.sym);
  }
  // needle with a short tail, hub on top
  const a = angle(vy);
  line(ctx, cx - Math.cos(a) * 4, cy - Math.sin(a) * 4, cx + Math.cos(a) * (R - 2), cy + Math.sin(a) * (R - 2), th.sym);
  ctx.beginPath(); ctx.arc(cx, cy, 2.2, 0, Math.PI * 2); ctx.fillStyle = th.ink; ctx.fill(); ctx.strokeStyle = th.sym; ctx.lineWidth = STROKE; ctx.stroke();
  const val = (vy > 0 ? '+' : vy < 0 ? '−' : '') + String(Math.round(Math.abs(vy)));
  if (wide) {
    const tx = cx + R + 10;
    text(ctx, th, 'VSI', tx, 10, { px: 8, color: th.sym, spacing: 0.08 });
    text(ctx, th, val, tx, cy + 1, { px: 11, color: th.sym });
    text(ctx, th, 'PX/S', tx + 38, cy + 2, { px: 6.5, color: th.mid, spacing: 0.04 });
    text(ctx, th, 'SRC: SCROLL', tx, h - 7, { px: SRC_PX, color: th.mid });
  } else {
    if (showLabels) text(ctx, th, 'PX/S', cx + R - 8, cy + 11, { px: 6, align: 'right', color: th.mid, spacing: 0.04 });   // inside the dial, under the rest position
    text(ctx, th, 'VSI', 2, h - 15, { px: NAME_PX, color: th.sym, spacing: 0.08 });
    text(ctx, th, val, w - 2, h - 15, { px: NAME_PX, align: 'right', color: th.sym });
    text(ctx, th, 'SRC: SCROLL', 2, h - 5, { px: SRC_PX, color: th.mid });
  }
}

/* ---- engine gauge (frame time) ---------------------------------------------- */

/* d: { p50, p95, tier, ceiling, flash (0..1 progress of the 240 ms flash, or null), wide }
   In the strip the annunciator row and the SRC line need about 48 px right of the
   dial, so narrow cells shrink the dial to fit. */
export function drawEngine(ctx, th, w, h, d) {
  th = norm(th);
  ctx.clearRect(0, 0, w, h);
  const wide = d.wide;
  const p50 = num(d.p50), p95 = num(d.p95);
  const tier = num(d.tier, 0), ceiling = num(d.ceiling, 3);
  const R = wide ? Math.max(10, Math.min(20, h / 2 - 7, (w - 62) / 2)) : 24;
  const cx = wide ? R + 6 : 32, cy = wide ? Math.round(h / 2) : 32;
  const aStart = engineAngle(0), aEnd = engineAngle(ENGINE_MAX_MS), aBudget = engineAngle(BUDGET_MS);
  const over = p50 > WARN_MS;                     // over budget beyond the 1 ms tolerance
  ctx.lineWidth = 1; ctx.strokeStyle = th.faint;
  ctx.beginPath(); ctx.arc(cx, cy, R, aStart, aEnd); ctx.stroke();
  // fill 0..p50; the part past the budget tick in the deep red once it is really over
  const aVal = engineAngle(p50);
  ctx.lineWidth = STROKE;
  ctx.beginPath(); ctx.arc(cx, cy, R, aStart, over ? aBudget : aVal); ctx.strokeStyle = th.sym; ctx.stroke();
  if (over) { ctx.beginPath(); ctx.arc(cx, cy, R, aBudget, aVal); ctx.strokeStyle = th.warn; ctx.stroke(); }
  // scale ticks every 10 ms, the 16.7 ms budget tick longer
  for (let ms = 0; ms <= ENGINE_MAX_MS; ms += 10) {
    const a = engineAngle(ms);
    line(ctx, cx + Math.cos(a) * (R - 3), cy + Math.sin(a) * (R - 3), cx + Math.cos(a) * (R + 1), cy + Math.sin(a) * (R + 1), th.dim, 1);
  }
  line(ctx, cx + Math.cos(aBudget) * (R - 6), cy + Math.sin(aBudget) * (R - 6), cx + Math.cos(aBudget) * (R + 3), cy + Math.sin(aBudget) * (R + 3), th.sym);
  // p95 as a hollow triangle riding outside the arc
  const a95 = engineAngle(p95);
  const px = cx + Math.cos(a95) * (R + 3), py = cy + Math.sin(a95) * (R + 3);
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.lineTo(px + Math.cos(a95 + 0.35) * 6, py + Math.sin(a95 + 0.35) * 6);
  ctx.lineTo(px + Math.cos(a95 - 0.35) * 6, py + Math.sin(a95 - 0.35) * 6);
  ctx.closePath(); ctx.strokeStyle = p95 > BUDGET_MS * 2 ? th.warn : th.sym; ctx.lineWidth = 1; ctx.stroke();
  text(ctx, th, '0', cx + Math.cos(aStart) * (R + 7), cy + Math.sin(aStart) * (R + 7), { px: 6.5, align: 'center', color: th.mid });
  text(ctx, th, '50', cx + Math.cos(aEnd) * (R + 7), cy + Math.sin(aEnd) * (R + 7), { px: 6.5, align: 'center', color: th.mid });
  const valStr = p50 >= 100 ? '99+' : p50.toFixed(1);
  const valPx = wide ? (R < 18 ? 8 : 10) : 11;    // a shrunken dial (narrow strip cell) takes a smaller value
  text(ctx, th, valStr, cx, cy - 2, { px: valPx, align: 'center', color: over ? th.warn : th.sym });
  text(ctx, th, 'MS', cx, cy + (R < 18 ? 7 : 9), { px: 6, align: 'center', color: th.mid, spacing: 0.1 });
  // annunciators T0..T3: the active tier lit (flashing paper to livery on a change),
  // reachable tiers outlined, tiers above the governor's ceiling faint
  const boxW = wide ? 11 : 13, boxH = 12, gap = wide ? 1 : 2;
  const rowW = 4 * boxW + 3 * gap;
  const ax = wide ? cx + R + 8 : Math.round((w - rowW) / 2), ay = wide ? 5 : 66;
  for (let t = 0; t < 4; t++) {
    const x = ax + t * (boxW + gap);
    const active = t === tier;
    const reachable = t <= ceiling;
    if (active) {
      ctx.fillStyle = Number.isFinite(d.flash) ? mix(th.paperRgb, th.liveryRgb, Math.max(0, Math.min(1, d.flash))) : th.livery;
      ctx.fillRect(x, ay, boxW, boxH);
    } else {
      ctx.strokeStyle = reachable ? th.dim : th.faint; ctx.lineWidth = 1; ctx.strokeRect(x + .5, ay + .5, boxW - 1, boxH - 1);
    }
    text(ctx, th, 'T' + t, x + boxW / 2, ay + boxH / 2 + .5, { px: 7, align: 'center', color: active ? th.ink : reachable ? th.mid : th.faint });
  }
  if (wide) {
    text(ctx, th, 'ENG', ax, cy + 5, { px: 8, color: th.sym, spacing: 0.08 });
    text(ctx, th, 'SRC: RAF', ax, h - 7, { px: SRC_PX, color: th.mid });
  } else {
    caption(ctx, th, w, h, 'ENG', 'P95 ' + (p95 >= 100 ? '99+' : p95.toFixed(1)), 'SRC: RAF');
  }
}
