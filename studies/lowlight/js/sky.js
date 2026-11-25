/* Low Light: the sky. One 2D canvas, fixed behind the page.
   The stars turn slowly about a pole. The page's scroll position is geared to the same turn, so scrolling
   moves the sky faster than its "tail" can follow and every star draws out into an arc, the way it does in
   a long exposure. When the page rests the tail catches up and the arcs close back to points.
   Now and then a meteor crosses, always away from one radiant. */

const TAU = Math.PI * 2;

function rng(seed) {                       // small seeded generator: the same sky on every visit
  let a = seed >>> 0;
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

export function createSky(canvas, { reduced, onMeteor }) {
  const ctx = canvas.getContext('2d', { alpha: false });   // opaque: nothing is ever behind the sky, so it need not be blended
  const TURN = TAU / 1500;                 // at rest: one turn in 25 minutes
  const GEAR = 0.0005;                     // radians of sky per pixel of scroll
  const BUCKETS = 5;
  let w = 0, h = 0, dpr = 1, px = 0, py = 0, phone = false;
  let stars = [], bright = [], buckets = [];
  let red = false, color = '255,255,255', ground = '#060814', sprite = null;
  const REST = 0.0007;                     // a sweep smaller than this is drawn as a point
  const SWEEP = 0.72;                      // the longest arc a star may draw, in radians
  let clock = 0, headS = 0, tailS = 0, started = false;
  let active = true, meteors = [], nextMeteor = 3.5, radiant = { x: 0, y: 0 };
  let dirty = true, skip = false;
  let tx = -1, ty = -1;                    // where the page wants the pole: each band puts it in its own free sky
  let slow = 0, lite = false;              // a device that cannot keep up draws every other faint star from then on
  const rand = rng(20270812);

  function build() {
    w = canvas.clientWidth; h = canvas.clientHeight; phone = w < 700;
    // device pixel ratio capped at 2, and lower still on a very large screen: stars are dots, they do not need the pixels
    dpr = Math.min(window.devicePixelRatio || 1, 2, Math.max(1, Math.sqrt(3.4e6 / Math.max(1, w * h))));
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    // the pole the sky turns about; the page moves it band by band, so the field is made to cover the
    // screen from a pole anywhere on it
    if (tx < 0) { px = w * (phone ? 0.64 : 0.7); py = h * 0.22; } else { px = tx; py = ty; }
    radiant = { x: w * (phone ? 0.2 : 0.3), y: h * 0.1 };
    const R = Math.hypot(w, h) + 8;
    const count = Math.min(phone ? 2600 : 6500, Math.round(Math.PI * R * R * (phone ? 0.00082 : 0.00066)));
    const r = rng(812);
    stars = []; bright = []; buckets = Array.from({ length: BUCKETS }, () => []);
    // a loose band of denser stars crosses the field; the rest are spread evenly
    const bandAngle = -0.55, bx = Math.cos(bandAngle), by = Math.sin(bandAngle);
    for (let i = 0; i < count; i++) {
      let x, y;
      if (i % 10 < 3) {
        const along = (r() * 2 - 1) * R, across = (r() + r() + r() - 1.5) * R * 0.2;
        x = bx * along - by * across + R * 0.18; y = by * along + bx * across + R * 0.3;
        if (x * x + y * y > R * R) { i--; continue; }
      } else { const rr = R * Math.sqrt(r()), a = r() * TAU; x = Math.cos(a) * rr; y = Math.sin(a) * rr; }
      const m = Math.pow(r(), i % 10 < 3 ? 5 : 3.3);       // most stars are faint, a few are not; the band is fainter still
      const s = { x, y, r: Math.hypot(x, y), a: Math.atan2(y, x), m, size: 0.9 + m * 1.9, alpha: 0.2 + 0.8 * Math.pow(m, 0.42), tw: r() * TAU, sp: 0.6 + r() * 1.6 };
      if (m > 0.62) bright.push(s); else buckets[Math.min(BUCKETS - 1, Math.floor(Math.pow(m / 0.62, 0.5) * BUCKETS))].push(s);
      stars.push(s);
    }
    // one steady star almost on the pole
    const pole = { x: 3, y: -2, r: Math.hypot(3, 2), a: Math.atan2(-2, 3), m: 0.9, size: 2.4, alpha: 0.95, tw: 0, sp: 0.4 };
    bright.push(pole); stars.push(pole);
    paint();
    dirty = true;
  }

  function paint() {                        // the soft glow under the brightest stars
    sprite = document.createElement('canvas'); sprite.width = sprite.height = 64;
    const g = sprite.getContext('2d'), grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, `rgba(${color},.9)`); grad.addColorStop(0.12, `rgba(${color},.42)`); grad.addColorStop(0.4, `rgba(${color},.08)`); grad.addColorStop(1, `rgba(${color},0)`);
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  }

  function draw(t) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1; ctx.fillStyle = ground; ctx.fillRect(0, 0, w, h);
    const base = -clock * TURN, head = base + headS, tail = base + tailS;       // counterclockwise, as the northern sky turns
    const ch = Math.cos(head), sh = Math.sin(head), ct = Math.cos(tail), st = Math.sin(tail);
    const sweep = head - tail, trailing = Math.abs(sweep) > REST, ccw = sweep < 0;
    const pad = 4;
    ctx.fillStyle = `rgb(${color})`; ctx.strokeStyle = `rgb(${color})`; ctx.lineCap = 'round';
    const dim = red ? 0.7 : 1;
    for (let b = 0; b < BUCKETS; b++) {
      const list = buckets[b]; if (!list.length) continue;
      const alpha = (0.2 + 0.66 * Math.pow(b / (BUCKETS - 1), 1.2)) * dim, size = 0.9 + 0.9 * (b / (BUCKETS - 1));
      ctx.globalAlpha = alpha; ctx.beginPath();
      const step = lite && b < 3 ? 2 : 1;
      if (!trailing) {
        for (let i = 0; i < list.length; i += step) {
          const s = list[i], x = px + s.x * ch - s.y * sh, y = py + s.x * sh + s.y * ch;
          if (x < -pad || y < -pad || x > w + pad || y > h + pad) continue;
          ctx.rect(x - size / 2, y - size / 2, size, size);
        }
        ctx.fill();
      } else {
        ctx.lineWidth = size; ctx.lineCap = b < 3 ? 'butt' : 'round';
        for (let i = 0; i < list.length; i += step) {
          const s = list[i], x = px + s.x * ch - s.y * sh, y = py + s.x * sh + s.y * ch;
          const x0 = px + s.x * ct - s.y * st, y0 = py + s.x * st + s.y * ct;
          if ((x < -pad && x0 < -pad) || (y < -pad && y0 < -pad) || (x > w + pad && x0 > w + pad) || (y > h + pad && y0 > h + pad)) continue;
          ctx.moveTo(x0, y0);
          if (s.r * Math.abs(sweep) < 26) ctx.lineTo(x, y); else ctx.arc(px, py, s.r, s.a + tail, s.a + head, ccw);
        }
        ctx.stroke();
      }
    }
    // the bright ones, one at a time, with a glow and a slow flicker
    for (let i = 0; i < bright.length; i++) {
      const s = bright[i], x = px + s.x * ch - s.y * sh, y = py + s.x * sh + s.y * ch;
      const x0 = px + s.x * ct - s.y * st, y0 = py + s.x * st + s.y * ct;
      if ((x < -30 && x0 < -30) || (y < -30 && y0 < -30) || (x > w + 30 && x0 > w + 30) || (y > h + 30 && y0 > h + 30)) continue;
      const tw = reduced ? 1 : 0.86 + 0.14 * Math.sin(t * s.sp + s.tw);
      const a = Math.min(1, s.alpha * tw) * dim;
      if (trailing) {                                    // a trail carries its own light: no glow, no head
        ctx.globalAlpha = a; ctx.lineWidth = s.size; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x0, y0);
        if (s.r * Math.abs(sweep) < 26) ctx.lineTo(x, y); else ctx.arc(px, py, s.r, s.a + tail, s.a + head, ccw);
        ctx.stroke();
        continue;
      }
      const g = s.size * (2.2 + 3.2 * s.m);
      ctx.globalAlpha = a * 0.55; ctx.drawImage(sprite, x - g, y - g, g * 2, g * 2);
      ctx.globalAlpha = a; ctx.beginPath(); ctx.arc(x, y, s.size * 0.62, 0, TAU); ctx.fill();
    }
    for (const m of meteors) {
      const k = m.age / m.life; if (k <= 0 || k >= 1) continue;
      const lead = 1 - Math.pow(1 - k, 2.2);                              // fast, then slowing
      const hx = m.x + m.dx * m.len * lead, hy = m.y + m.dy * m.len * lead;
      const tl = Math.min(m.len * 0.55, m.len * lead) * (1 - k * 0.5);
      const tx = hx - m.dx * tl, ty = hy - m.dy * tl, fade = Math.sin(Math.PI * Math.min(1, k * 1.15)) * dim;
      const grad = ctx.createLinearGradient(tx, ty, hx, hy);
      grad.addColorStop(0, `rgba(${color},0)`); grad.addColorStop(1, `rgba(${color},${0.95 * fade})`);
      ctx.globalAlpha = 1; ctx.strokeStyle = grad; ctx.lineWidth = m.wide; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx, hy); ctx.stroke();
      ctx.globalAlpha = fade * 0.8; ctx.drawImage(sprite, hx - 9, hy - 9, 18, 18);
      ctx.strokeStyle = `rgb(${color})`;
    }
    ctx.globalAlpha = 1;
  }

  function spawn() {
    // start somewhere in the upper field and run directly away from the radiant
    const ang = (0.08 + rand() * 0.62) * Math.PI, dist = (0.1 + rand() * 0.55) * Math.max(w, h);
    const dx = Math.cos(ang), dy = Math.sin(ang);
    const x = radiant.x + dx * dist, y = radiant.y + dy * dist;
    if (x < 12 || x > w - 12 || y < 0 || y > h * 0.8) return false;
    meteors.push({ x, y, dx, dy, len: (phone ? 150 : 240) + rand() * (phone ? 130 : 260), life: 0.55 + rand() * 0.5, age: 0, wide: 1.4 + rand() * 0.9, counted: false });
    return true;
  }

  /* dt in seconds, y = scroll position. Returns nothing; draws when there is something new to show. */
  function frame(dt, y, t) {
    clock += dt;
    const target = -y * GEAR;
    if (!started) { headS = tailS = target; started = true; }
    headS += (target - headS) * (1 - Math.exp(-dt / 0.11));
    tailS += (headS - tailS) * (1 - Math.exp(-dt / 0.52));
    if (Math.abs(headS - tailS) > SWEEP) tailS = headS - Math.sign(headS - tailS) * SWEEP;   // a long jump still leaves arcs, not a whirlpool
    if (tx >= 0) {                          // the pole glides to where the band in view wants it
      const k = 1 - Math.exp(-dt / 0.16), dx = (tx - px) * k, dy = (ty - py) * k;
      if (Math.abs(dx) + Math.abs(dy) > 0.02) { px += dx; py += dy; dirty = true; }
    }
    if (!active) return;
    nextMeteor -= dt;
    if (nextMeteor <= 0) { nextMeteor = spawn() ? 5 + rand() * 7 : 0.4; }
    for (const m of meteors) { m.age += dt; if (!m.counted && m.age > m.life * 0.35) { m.counted = true; onMeteor && onMeteor(); } }
    meteors = meteors.filter(m => m.age < m.life);
    // at rest the sky moves a twentieth of a pixel a frame: every other frame is plenty
    const busy = Math.abs(headS - tailS) > REST || meteors.length > 0 || dirty;
    if (!lite && busy) { slow = dt > 0.03 ? slow + 1 : Math.max(0, slow - 2); if (slow > 45) lite = true; }
    skip = !busy && !skip;
    if (skip) return;
    dirty = false;
    draw(t);
  }

  function still() {                         // reduced motion: points, no turn, no meteors
    headS = tailS = 0; clock = 0; started = true; meteors = []; draw(0);
  }

  return {
    build, frame, still,
    setPole(x, y, now) { tx = x; ty = y; if (now) { px = x; py = y; dirty = true; } },
    setActive(on) { if (on && !active) dirty = true; active = on; },
    setRed(on) {
      red = on; color = on ? '255,59,47' : '255,255,255'; ground = on ? '#000' : '#060814'; paint(); dirty = true;
      if (stars.length) { if (reduced) still(); else draw(performance.now() / 1000); }       // at once, so the sky changes with the page
    },
    resize() { const nw = canvas.clientWidth, nh = canvas.clientHeight; if (nw !== w || Math.abs(nh - h) > 1) { build(); if (reduced) still(); } },
    get count() { return stars.length; },
  };
}
