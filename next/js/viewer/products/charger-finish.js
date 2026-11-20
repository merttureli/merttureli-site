// CHARGER explorer finish: every part reads as what it is (products/charger.js loads this module; if it or
// showreel/look.js cannot load, the explorer keeps its flat CAD colours).
//
//   exterior   the hero's own dress, one call: look.js dressRocket on the viewer's renderer (paint, vinyl, printed
//              nose, mount and cap, fins, rail buttons), asked for one mesh per part and without the hero's
//              stand-in nozzle and page shadow. The inside of each body tube goes to its own cardboard mesh.
//   printed    every printed interior part is a twin of the hero's printed motor mount (same program, same layer lines)
//   mapped     the rest share one program: a colour sheet and a detail sheet (red height, green roughness, blue
//              metalness) painted here in code: placeholder boards, 9 V batteries, the camera, the motor, the
//              antenna, the wooden rods and the cardboard inside of the body tubes
// The owner's facts: cardboard tubes, plywood fins, printed interior parts, three 9 V batteries and two boards on
// the PCB holder (the board art is a placeholder: his designs are not to hand), plastic rail buttons, wooden rods.
import * as LOOK from '../../showreel/look.js';

// Every number of the finish, in one place. Lengths in metres unless a name says mm.
export const FINISH = {
  printed: { coupler: 0x8c9096, mount: 0x8c9096, holders: 0xa3a6ab, roughness: 0.45 },   // colour not stated: the hero mount's grey
  mapped: { envIntensity: 1, bump: 1.4, micro: { gen: 'wobble', size: 128, cells: 4, tile: 0.012, normal: 0.04, rough: 0.03 } },
  cardboardPitch: 0.085,            // one turn of the tube's spiral winding seam
  battery: { mm: [26.5, 46, 17.5], snap: 2.5, fit: 0.93 },   // a 9 V block, its terminals, and the scale that clears the tube wall as modeled
  board: { thick: 0.0016, main: [0.05, 0.168], control: [0.046, 0.068] },
};

// ------------------------------------------------------------------ painter
// Two canvases drawn together: colour, and detail (r height, g roughness, b metalness). An ink is
// [colour, height, roughness, metalness].
const rng = seed => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
function sheet(w, h, k = 1) {
  const cv = [0, 1].map(() => Object.assign(document.createElement('canvas'), { width: Math.round(w * k), height: Math.round(h * k) }));
  const cx = cv.map(c => { const x = c.getContext('2d'); x.scale(k, k); return x; });
  const sty = (ink, i) => (i ? `rgb(${Math.round(ink[1] * 255)},${Math.round(ink[2] * 255)},${Math.round(ink[3] * 255)})` : ink[0]);
  const each = f => cx.forEach((c, i) => f(c, ink => sty(ink, i)));
  const S = {
    w, h, cv,
    alpha(a) { each(c => { c.globalAlpha = a; }); },
    rect(x, y, W, H, ink) { each((c, s) => { c.fillStyle = s(ink); c.fillRect(x, y, W, H); }); },
    frame(x, y, W, H, lw, ink) { each((c, s) => { c.strokeStyle = s(ink); c.lineWidth = lw; c.strokeRect(x, y, W, H); }); },
    rrect(x, y, W, H, r, ink) { each((c, s) => { c.fillStyle = s(ink); c.beginPath(); c.roundRect(x, y, W, H, r); c.fill(); }); },
    disc(x, y, r, ink) { each((c, s) => { c.fillStyle = s(ink); c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); }); },
    ring(x, y, r, lw, ink, a0 = 0, a1 = 7) { each((c, s) => { c.strokeStyle = s(ink); c.lineWidth = lw; c.beginPath(); c.arc(x, y, r, a0, a1); c.stroke(); }); },
    line(pts, lw, ink) { each((c, s) => { c.strokeStyle = s(ink); c.lineWidth = lw; c.lineCap = c.lineJoin = 'round'; c.beginPath(); pts.forEach(([x, y], j) => (j ? c.lineTo(x, y) : c.moveTo(x, y))); c.stroke(); }); },
    radial(x, y, r0, r1, a, b) { each((c, s) => { const g = c.createRadialGradient(x, y, r0, x, y, r1); g.addColorStop(0, s(a)); g.addColorStop(1, s(b)); c.fillStyle = g; c.beginPath(); c.arc(x, y, r1, 0, 7); c.fill(); }); },
    clip(x, y, W, H, f) { each(c => { c.save(); c.beginPath(); c.rect(x, y, W, H); c.clip(); }); f(); each(c => c.restore()); },
  };
  return S;
}
const INK = {
  mask: ['#1d5a44', .5, .42, 0], pour: ['#23694f', .5, .42, 0], trace: ['#2c7b5c', .53, .4, 0], via: ['#3a8f6c', .5, .36, 0], fr4: ['#a3a878', .46, .75, 0],
  gold: ['#c7a352', .56, .3, 1], tin: ['#c3c7cb', .64, .3, 1], hole: ['#08090a', .15, .9, 0], silk: ['#e3e6e0', .53, .6, 0],
  ic: ['#131416', .9, .5, 0], icTop: ['#1b1c1f', .93, .4, 0], dot: ['#2c2e32', .82, .5, 0], cap: ['#a98a5c', .74, .5, 0], res: ['#18191b', .7, .45, 0],
  can: ['#c9ccd0', 1, .24, 1], black: ['#17181b', .5, .5, 0], body: ['#1d1e21', .5, .42, .15], jacket: ['#323843', .5, .36, .35],
};

// A believable generic board: the owner's own board designs are not available, so this is a placeholder by seed.
// Solder mask, copper under it, plated holes, a few packages, passives and connectors. No text, no layout claims.
// `keep` are rectangles left free for parts that stand on the board as real boxes.
function board(S, [X, Y, W, H], seed, keep = []) {
  const R = rng(seed), I = INK, free = (x, y, w, h) => !keep.some(k => x < k[0] + k[2] + 4 && x + w > k[0] - 4 && y < k[1] + k[3] + 4 && y + h > k[1] - 4);
  S.rect(X - 4, Y - 4, W + 8, H + 8, I.mask);
  S.clip(X, Y, W, H, () => {
    S.alpha(.6); for (let i = 0; i < 6; i++) S.rect(X + R() * W * .7, Y + R() * H * .9, W * (.2 + R() * .45), H * (.03 + R() * .09), I.pour);
    S.alpha(.9);
    for (let i = 0, n = Math.round(W * H / 2400); i < n; i++) {
      let x = X + 8 + R() * (W - 16), y = Y + 8 + R() * (H - 16);
      const pts = [[x, y]];
      for (let s = 0, m = 2 + (R() * 4 | 0); s < m; s++) { const L = 10 + R() * 44, d = (R() * 8 | 0) * Math.PI / 4; x += Math.cos(d) * L; y += Math.sin(d) * L; pts.push([x, y]); }
      S.line(pts, 1.5, I.trace); S.disc(x, y, 2.3, I.via); S.disc(pts[0][0], pts[0][1], 2.3, I.via);
    }
    S.alpha(1);
  });
  S.frame(X + 1, Y + 1, W - 2, H - 2, 2, I.fr4);
  for (const [fx, fy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const hx = X + 13 + fx * (W - 26), hy = Y + 13 + fy * (H - 26); S.disc(hx, hy, 8.5, I.gold); S.disc(hx, hy, 5, I.hole); }
  for (const k of keep) { S.frame(k[0] - 2, k[1] - 2, k[2] + 4, k[3] + 4, 1, I.silk); for (let i = 0, n = Math.max(2, Math.round(Math.max(k[2], k[3]) / 14)); i < n; i++) { const t = (i + .5) / n; S.disc(k[2] > k[3] ? k[0] + t * k[2] : k[0] + k[2] / 2, k[2] > k[3] ? k[1] + k[3] / 2 : k[1] + t * k[3], 2.6, I.tin); } }
  const chip = (x, y, w, h) => {
    const n = Math.max(3, Math.round(Math.max(w, h) / 6)), up = h > w;
    for (let i = 0; i < n; i++) { const t = (i + .5) / n; up ? S.rect(x - 4, y + t * h - 1.2, w + 8, 2.4, I.tin) : S.rect(x + t * w - 1.2, y - 4, 2.4, h + 8, I.tin); }
    S.rect(x, y, w, h, I.ic); S.rect(x + 1.5, y + 1.5, w - 3, h - 3, I.icTop); S.disc(x + 4.5, y + 4.5, 1.5, I.dot);
    S.alpha(.8); S.line([[x - 6, y - 7], [x + 4, y - 7]], 1, I.silk); S.alpha(1);
  };
  const passive = (x, y, up, tan) => { const [w, h] = up ? [4.6, 9] : [9, 4.6]; S.rect(x, y, w, h, I.tin); up ? S.rect(x, y + 2.2, w, h - 4.4, tan ? I.cap : I.res) : S.rect(x + 2.2, y, w - 4.4, h, tan ? I.cap : I.res); };
  let y = Y + 30;
  while (y < Y + H - 40) {
    const rowH = 15 + R() * 30;
    let x = X + 12;
    while (x < X + W - 18) {
      const t = R(), room = X + W - 12 - x;
      if (t < .26 && room > 30) { const w = Math.min(room, 22 + R() * 26), h = Math.min(rowH, 16 + R() * 24); if (free(x - 5, y - 8, w + 10, h + 13)) chip(x, y, w, h); x += w + 12; }
      else if (t < .62) { const up = R() < .5, n = 1 + (R() * 3 | 0); for (let i = 0; i < n; i++) { const px = x + (up ? i * 8 : 0), py = y + (up ? 0 : i * 7.5); if (py + 9 < y + rowH + 4 && free(px, py, 9, 9)) passive(px, py, up, R() < .55); } x += (up ? n * 8 : 9) + 7; }
      else if (t < .72 && room > 20 && rowH > 18) { const r = Math.min(rowH / 2, 7 + R() * 5); if (free(x, y, 2 * r, 2 * r)) { S.ring(x + r, y + r, r + 2, 1, I.silk); S.disc(x + r, y + r, r, I.can); S.disc(x + r, y + r, r * .78, ['#b9bcc1', .97, .2, 1]); } x += 2 * r + 9; }
      else if (t < .8 && room > 14) { if (free(x, y, 8, 6)) { S.rect(x, y, 8, 5, I.tin); S.rect(x + 1.6, y, 4.8, 5, ['#e9e6d2', .66, .35, 0]); } x += 14; }
      else x += 8 + R() * 16;
    }
    y += rowH + 9 + R() * 8;
  }
}

function electronicsSheet(k) {
  const S = sheet(1024, 1024, k), I = INK, B = E;
  S.rect(0, 0, 1024, 1024, I.mask);
  // the boards: main (the keep rects are its real boxes: terminal block, header, shield can), control, altimeter
  board(S, B.main, 11, B.mainKeep.map(([x, y, w, h]) => [B.main[0] + x, B.main[1] + y, w, h]));
  board(S, B.control, 23, B.controlKeep.map(([x, y, w, h]) => [B.control[0] + x, B.control[1] + y, w, h]));
  board(S, B.altTop, 37);
  // the solder side: mask, tracks, the through-hole joints of whatever stands on the other face
  for (const [r, seed] of [[B.altBack, 41], [B.back, 43]]) {
    const R = rng(seed);
    S.rect(r[0] - 4, r[1] - 4, r[2] + 8, r[3] + 8, I.mask);
    S.clip(r[0], r[1], r[2], r[3], () => {
      for (let i = 0; i < r[2] * r[3] / 1500; i++) { let x = r[0] + R() * r[2], y = r[1] + R() * r[3]; const pts = [[x, y]]; for (let s = 0; s < 3; s++) { const L = 14 + R() * 50, d = (R() * 8 | 0) * Math.PI / 4; x += Math.cos(d) * L; y += Math.sin(d) * L; pts.push([x, y]); } S.line(pts, 1.5, I.trace); S.disc(x, y, 2.8, I.tin); }
      for (let i = 0; i < 9; i++) S.disc(r[0] + 20 + i * 9, r[1] + r[3] - 24, 2.8, I.tin);
    });
    S.frame(r[0] + 1, r[1] + 1, r[2] - 2, r[3] - 2, 2, I.fr4);
    for (const [fx, fy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const hx = r[0] + 13 + fx * (r[2] - 26), hy = r[1] + 13 + fy * (r[3] - 26); S.disc(hx, hy, 8.5, I.gold); S.disc(hx, hy, 5, I.hole); }
  }
  // a board's edge: mask over the laminate, the laminate showing along the rim
  { const r = B.edge; S.rect(r[0] - 4, r[1] - 4, r[2] + 8, r[3] + 8, ['#174a38', .5, .5, 0]); for (let i = 0; i < 5; i++) S.rect(r[0] - 4, r[1] + 3 + i * 9, r[2] + 8, 3, i % 2 ? ['#8f9568', .48, .8, 0] : ['#a9ad82', .52, .8, 0]); }
  { const r = B.side; S.rect(r[0] - 4, r[1] - 4, r[2] + 8, r[3] + 8, ['#184c39', .5, .46, 0]); S.frame(r[0] + 1.5, r[1] + 1.5, r[2] - 3, r[3] - 3, 3, I.fr4); }
  // swatches for the parts that stand on a board
  { const r = B.black; S.rect(r[0] - 4, r[1] - 4, r[2] + 8, r[3] + 8, I.black); }
  { const r = B.tin; S.rect(r[0] - 4, r[1] - 4, r[2] + 8, r[3] + 8, I.tin); S.alpha(.25); for (let i = 0; i < 12; i++) S.rect(r[0] - 4, r[1] + i * 4, r[2] + 8, 1, ['#aeb2b7', .6, .36, 1]); S.alpha(1); }
  { const r = B.term; S.rect(r[0] - 4, r[1] - 4, r[2] + 8, r[3] + 8, ['#1f2a26', .5, .5, 0]); for (let i = 0; i < 3; i++) { const x = r[0] + (i + .5) * r[2] / 3, y = r[1] + r[3] / 2; S.disc(x, y, 13, ['#0c0e0d', .2, .8, 0]); S.disc(x, y, 10.5, I.tin); S.line([[x - 8, y - 3], [x + 8, y + 3]], 2.4, ['#5c6064', .4, .5, 1]); } }
  { const r = B.header; S.rect(r[0] - 4, r[1] - 4, r[2] + 8, r[3] + 8, I.black); for (let i = 0; i < 10; i++) { const x = r[0] + (i + .5) * r[2] / 10, y = r[1] + r[3] / 2; S.rect(x - 4.5, y - 4.5, 9, 9, ['#0a0b0c', .2, .8, 0]); S.rect(x - 2.2, y - 2.2, 4.4, 4.4, I.gold); } }
  // the 9 V block: a plain jacket (no brand), crimped rims, the terminal plate
  { const r = B.nvFront; S.rect(r[0] - 4, r[1] - 4, r[2] + 8, r[3] + 8, I.jacket); S.alpha(.5); for (let i = 0; i < 26; i++) S.rect(r[0] - 4, r[1] + rng(i + 3)() * r[3], r[2] + 8, 1, ['#2e333c', .5, .3, .35]); S.alpha(1); for (const y of [r[1], r[1] + r[3] - 7]) { S.rect(r[0] - 4, y, r[2] + 8, 7, ['#9da2a8', .6, .32, 1]); S.rect(r[0] - 4, y + (y === r[1] ? 6 : 0), r[2] + 8, 1.4, ['#15171b', .3, .6, 0]); } }
  { const r = B.nvSide; S.rect(r[0] - 4, r[1] - 4, r[2] + 8, r[3] + 8, I.jacket); for (const y of [r[1], r[1] + r[3] - 7]) { S.rect(r[0] - 4, y, r[2] + 8, 7, ['#9da2a8', .6, .32, 1]); S.rect(r[0] - 4, y + (y === r[1] ? 6 : 0), r[2] + 8, 1.4, ['#15171b', .3, .6, 0]); } S.rect(r[0] + r[2] / 2 - 1, r[1] + 7, 2, r[3] - 14, ['#1c1f25', .42, .5, .35]); }
  { const r = B.nvTop; S.rect(r[0] - 4, r[1] - 4, r[2] + 8, r[3] + 8, ['#9da2a8', .6, .32, 1]); S.rrect(r[0] + 5, r[1] + 5, r[2] - 10, r[3] - 10, 6, ['#15161a', .42, .62, 0]); for (const fx of [.26, .74]) { S.disc(r[0] + fx * r[2], r[1] + r[3] / 2, 30, ['#22242a', .46, .5, 0]); S.disc(r[0] + fx * r[2], r[1] + r[3] / 2, 22, ['#7d8288', .5, .4, 1]); } }
  { const r = B.nvBottom; S.rect(r[0] - 4, r[1] - 4, r[2] + 8, r[3] + 8, ['#9da2a8', .6, .32, 1]); S.rrect(r[0] + 6, r[1] + 6, r[2] - 12, r[3] - 12, 5, ['#7f848a', .52, .42, 1]); }
  return S;
}
// Regions of the electronics sheet (logical px in 1024 x 1024): [x, y, w, h]
const E = {
  main: [8, 8, 284, 954], mainKeep: [[30, 880, 96, 52], [246, 300, 18, 150], [96, 560, 76, 76]],     // 5.68 px per mm of a 50 x 168 mm board
  control: [304, 8, 262, 386], controlKeep: [[150, 316, 84, 48]],
  altTop: [580, 8, 208, 476], altBack: [800, 8, 208, 476],
  back: [304, 708, 262, 300], edge: [580, 500, 96, 48], side: [580, 700, 180, 300], black: [692, 500, 48, 48], tin: [756, 500, 48, 48], term: [580, 568, 150, 60], header: [580, 644, 200, 22],
  nvFront: [304, 410, 152, 264], nvSide: [470, 410, 100, 264], nvTop: [820, 500, 152, 100], nvBottom: [820, 616, 152, 100],
};

function woodSheet(k) {
  const S = sheet(1024, 320, k), R = rng(7);
  S.rect(0, 0, 1024, 320, ['#d0af7e', .5, .64, 0]);
  S.clip(0, 0, 1024, 256, () => {
    for (let i = 0; i < 9; i++) { S.alpha(.16); S.rect(0, R() * 256, 1024, 3 + R() * 7, ['#b18b57', .46, .68, 0]); }
    for (let i = 0; i < 460; i++) {
      S.alpha(.06 + R() * .22);
      const pts = []; let y = R() * 256; for (let x = -20; x <= 1044; x += 44) { y += (R() - .5) * 1.5; pts.push([x, y]); }
      S.line(pts, .5 + R() * 1.7, R() < .8 ? ['#9a7242', .4, .72, 0] : ['#e6cc9c', .6, .56, 0]);
    }
    S.alpha(.4); for (let i = 0; i < 1500; i++) S.rect(R() * 1024, R() * 256, 3 + R() * 10, .8, ['#86602f', .3, .78, 0]);
    S.alpha(1);
  });
  S.clip(0, 256, 1024, 64, () => { S.rect(0, 256, 1024, 64, ['#c7a36e', .5, .74, 0]); S.alpha(.45); for (let i = 0; i < 40; i++) S.ring(-30, 470, 120 + i * 7, 1.6, ['#9a7242', .4, .78, 0]); S.alpha(.3); for (let i = 0; i < 300; i++) S.disc(R() * 200, 256 + R() * 64, .7, ['#7a5628', .3, .8, 0]); S.alpha(1); });
  return S;
}
// kraft cardboard, one turn of a wound tube per tile: fibres, and the winding seam as the tile's diagonal
function cardboardSheet(k) {
  const S = sheet(256, 256, k), R = rng(19);
  S.rect(0, 0, 256, 256, ['#a8825c', .5, .9, 0]);
  for (let i = 0; i < 900; i++) { S.alpha(.05 + R() * .12); const x = R() * 256, y = R() * 256, a = (R() - .5) * .9, L = 6 + R() * 26; S.line([[x, y], [x + Math.cos(a) * L, y + Math.sin(a) * L]], .6 + R(), R() < .5 ? ['#8d6a45', .42, .95, 0] : ['#c29c74', .58, .85, 0]); }
  S.alpha(.5); for (const o of [-256, 0, 256]) { S.line([[o - 4, 260], [o + 260, -4]], 1.6, ['#7c5b3a', .25, .95, 0]); S.line([[o - 1, 260], [o + 263, -4]], 1, ['#b9946d', .62, .85, 0]); }
  S.alpha(1);
  return S;
}
function motorSheet(k) {
  const S = sheet(384, 640, k), R = rng(5), C = ['#161618', .5, .4, 0];
  S.rect(0, 0, 384, 640, C);
  S.alpha(.1); for (let y = 0; y < 512; y += 2 + R() * 2) S.rect(0, y, 384, 1, R() < .5 ? ['#25262a', .56, .34, 0] : ['#0c0c0e', .44, .48, 0]);
  S.alpha(.35); S.rect(95, 0, 1.2, 512, ['#2a2b2f', .6, .36, 0]);
  S.alpha(1); for (const y of [0, 492]) S.rect(0, y, 384, 20, ['#1b1b1e', .56, .3, 0]);
  S.rect(0, 20, 384, 1.5, ['#0a0a0b', .3, .5, 0]); S.rect(0, 490.5, 384, 1.5, ['#0a0a0b', .3, .5, 0]);
  // aft end: the casing rim, the nozzle's exit cone, the throat with a little soot
  S.clip(0, 520, 120, 120, () => { S.rect(0, 520, 120, 120, ['#1b1b1e', .85, .4, 0]); S.radial(60, 580, 15, 50, ['#131212', .12, .85, 0], ['#403d3a', .78, .6, 0]); S.alpha(.55); S.ring(60, 580, 21, 9, ['#2c1e14', .2, .95, 0]); S.alpha(1); S.disc(60, 580, 15, ['#040404', 0, .95, 0]); S.ring(60, 580, 50, 1.5, ['#09090a', .4, .5, 0]); });
  // forward end: the closure and its centre plug
  S.clip(128, 520, 120, 120, () => { S.rect(128, 520, 120, 120, ['#1b1b1e', .6, .45, 0]); S.ring(188, 580, 42, 2, ['#0b0b0c', .35, .6, 0]); S.disc(188, 580, 17, ['#35322f', .5, .85, 0]); S.ring(188, 580, 17, 1.4, ['#0b0b0c', .3, .6, 0]); });
  return S;
}
function cameraSheet(k) {
  const S = sheet(512, 512, k), I = INK, screw = (x, y) => { S.disc(x, y, 5, ['#0d0e10', .35, .5, .4]); S.disc(x, y, 3.6, ['#3a3c41', .45, .35, 1]); S.line([[x - 2.4, y], [x + 2.4, y]], 1, ['#111214', .3, .5, 1]); S.line([[x, y - 2.4], [x, y + 2.4]], 1, ['#111214', .3, .5, 1]); };
  S.rect(0, 0, 512, 512, I.body);
  // the lens face
  S.frame(3, 3, 250, 214, 2, ['#2a2b2f', .58, .36, .2]);
  S.disc(128, 110, 88, ['#0e0f11', .86, .32, .5]);
  for (let i = 0; i < 72; i++) { const a = i / 72 * Math.PI * 2; S.line([[128 + Math.cos(a) * 78, 110 + Math.sin(a) * 78], [128 + Math.cos(a) * 87, 110 + Math.sin(a) * 87]], 1.6, ['#23252a', .95, .3, .5]); }
  S.disc(128, 110, 72, ['#17181b', .78, .22, .6]); S.ring(128, 110, 66, 2, ['#2f3136', .82, .2, .7]);
  S.radial(128, 110, 4, 60, ['#05070c', .92, .04, 0], ['#0f1830', .62, .04, 0]);
  S.alpha(.4); S.ring(128, 110, 44, 9, ['#44307a', .8, .04, 0], 3.5, 5.0); S.alpha(.3); S.ring(128, 110, 33, 6, ['#1f6a66', .84, .04, 0], .4, 1.7); S.alpha(1);
  S.disc(128, 110, 17, ['#020203', .9, .06, 0]); S.ring(128, 110, 17, 1.2, ['#1c2233', .9, .06, 0]);
  S.alpha(.55); S.ring(128, 110, 50, 3, ['#dfe7ff', .8, .04, 0], 3.7, 4.3); S.alpha(1);
  S.disc(228, 28, 3.5, I.hole); screw(22, 22); screw(22, 198); screw(234, 198);
  // the back
  S.frame(259, 3, 250, 214, 2, ['#2a2b2f', .58, .36, .2]); S.rrect(344, 84, 84, 30, 6, ['#07080a', .2, .7, 0]); S.rect(356, 96, 60, 6, ['#8f7a3c', .3, .35, 1]); S.rect(326, 150, 120, 7, ['#07080a', .2, .7, 0]); screw(278, 22); screw(490, 22); screw(278, 198); screw(490, 198);
  // the long sides: the split line of the two shells, a button, a status light (off), vents
  for (const [x, w] of [[0, 217], [224, 187]]) {
    S.frame(x + 3, 227, w - 6, 282, 2, ['#2a2b2f', .58, .36, .2]); S.rect(x, 366, w, 1.6, ['#0a0b0c', .3, .55, .1]);
    for (let i = 0; i < 5; i++) S.rrect(x + w / 2 - 34, 452 + i * 8, 68, 3.4, 1.7, ['#08090a', .25, .7, 0]);
  }
  S.rrect(86, 270, 46, 24, 8, ['#0c0d0f', .3, .5, .1]); S.rrect(89, 273, 40, 18, 6, ['#2a2c31', .72, .5, .1]); S.disc(109, 322, 4.2, ['#40444b', .56, .2, 0]);
  return S;
}
function antennaSheet(k) {
  const S = sheet(64, 256, k), G = ['#b89843', .55, .3, 1];
  S.rect(0, 0, 64, 256, ['#151618', .5, .6, 0]);
  S.rect(0, 0, 64, 66, G); for (let y = 2; y < 42; y += 3) S.rect(0, y, 64, 1.1, ['#6f5a22', .3, .4, 1]);
  S.rect(0, 42, 64, 1.5, ['#57461a', .3, .4, 1]); for (let x = 0; x < 64; x += 64 / 6) S.rect(x, 44, 1.6, 21, ['#8c7330', .42, .35, 1]);
  S.rect(0, 66, 64, 8, ['#0c0d0e', .56, .32, 0]); S.rect(0, 88, 64, 1.5, ['#232428', .6, .5, 0]);
  return S;
}

// ------------------------------------------------------------------ geometry
// A box whose faces each have their own four vertices: the face is read from the normal. faces: { px, nx, py, ny,
// pz, nz, all } -> [x, y, w, h, turn] in sheet px; the face's first axis runs along w (turn: along h).
function boxUV(T, g, faces, [W, H]) {
  g.computeBoundingBox();
  const b = g.boundingBox, p = g.attributes.position, n = g.attributes.normal, uv = new Float32Array(p.count * 2), V = new T.Vector3(), N = new T.Vector3();
  const rel = (i) => (V.getComponent(i) - b.min.getComponent(i)) / Math.max(1e-9, b.max.getComponent(i) - b.min.getComponent(i));
  for (let i = 0; i < p.count; i++) {
    V.fromBufferAttribute(p, i); N.fromBufferAttribute(n, i);
    const ax = Math.abs(N.x) > .7 ? 0 : Math.abs(N.y) > .7 ? 1 : 2, f = faces[(N.getComponent(ax) > 0 ? 'p' : 'n') + 'xyz'[ax]] || faces.all;
    let a = rel(ax === 0 ? 2 : 0), c = rel(ax === 1 ? 2 : 1);
    if (f[4]) [a, c] = [c, a];
    uv[i * 2] = (f[0] + a * f[2]) / W; uv[i * 2 + 1] = 1 - (f[1] + (1 - c) * f[3]) / H;
  }
  g.setAttribute('uv', new T.BufferAttribute(uv, 2));
  return g;
}
// A turned part about its own Y axis, made non-indexed in place: the side wraps a full-width strip (u is the angle,
// the sheet repeats in u), end faces map as discs.
function latheUV(T, g, { side, top, bottom }, [W, H]) {
  if (g.index) { const ni = g.toNonIndexed(); g.setIndex(null); for (const k of Object.keys(ni.attributes)) g.setAttribute(k, ni.attributes[k]); }
  g.computeBoundingBox();
  const b = g.boundingBox, p = g.attributes.position, n = g.attributes.normal, uv = new Float32Array(p.count * 2), R = Math.max(b.max.x, b.max.z, -b.min.x, -b.min.z);
  for (let i = 0; i < p.count; i += 3) {
    const ny = (n.getY(i) + n.getY(i + 1) + n.getY(i + 2)) / 3, cap = ny > .7 ? top : ny < -.7 ? bottom : null;
    const us = [0, 1, 2].map(j => .5 + Math.atan2(p.getX(i + j), p.getZ(i + j)) / (2 * Math.PI));
    if (!cap && Math.max(...us) - Math.min(...us) > .5) for (let j = 0; j < 3; j++) if (us[j] < .5) us[j] += 1;
    for (let j = 0; j < 3; j++) {
      const x = p.getX(i + j), y = p.getY(i + j), z = p.getZ(i + j);
      if (cap) { uv[(i + j) * 2] = (cap[0] + (.5 + x / (2 * R)) * cap[2]) / W; uv[(i + j) * 2 + 1] = 1 - (cap[1] + (.5 - z / (2 * R)) * cap[3]) / H; }
      else { uv[(i + j) * 2] = (side[0] + us[j] * side[2]) / W; uv[(i + j) * 2 + 1] = 1 - (side[1] + (1 - (y - b.min.y) / (b.max.y - b.min.y)) * side[3]) / H; }
    }
  }
  g.setAttribute('uv', new T.BufferAttribute(uv, 2));
  return g;
}
const SIZE = [1024, 1024];
const mm = v => v * 1e-3;
const boxAt = (T, [w, h, d], faces, M) => boxUV(T, new T.BoxGeometry(w, h, d), faces, SIZE).applyMatrix4(M);
function swatch(T, g, [x, y, w, h], M) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (x + (.2 + uv.getX(i) * .6) * w) / SIZE[0], 1 - (y + (.2 + uv.getY(i) * .6) * h) / SIZE[1]);
  return g.applyMatrix4(M);
}
function merge(T, list) {
  const P = [], N = [], U = [];
  for (const g0 of list) { const g = g0.index ? g0.toNonIndexed() : g0; P.push(...g.attributes.position.array); N.push(...g.attributes.normal.array); U.push(...g.attributes.uv.array); }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(N, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(U, 2));
  return g;
}
// a 9 V block, long axis +Y, both snap terminals on the +Y end (the round one and the six-sided one)
function nineVolt(T, M, s) {
  const [w, h, d] = FINISH.battery.mm.map(v => mm(v) * s), sn = mm(FINISH.battery.snap) * s, at = (x, y) => new T.Matrix4().makeTranslation(x, y, 0).premultiply(M);
  return [
    boxAt(T, [w, h, d], { pz: E.nvFront, nz: E.nvFront, px: E.nvSide, nx: E.nvSide, py: E.nvTop, ny: E.nvBottom }, at(0, 0)),
    swatch(T, new T.CylinderGeometry(mm(2.85) * s, mm(2.85) * s, sn, 12), E.tin, at(-mm(6.35) * s, h / 2 + sn / 2)),
    swatch(T, new T.CylinderGeometry(mm(4.1) * s, mm(3.7) * s, sn, 6), E.tin, at(mm(6.35) * s, h / 2 + sn / 2)),
  ];
}
// the PCB holder's plate: its normal, width axis, half thickness and the run of its full-width part (holder space)
function plateOf(T, g) {
  const p = g.attributes.position, idx = g.index, a = new T.Vector3(), b = new T.Vector3(), c = new T.Vector3(), n = new T.Vector3(), area = new Map();
  for (let i = 0; i < idx.count; i += 3) {
    a.fromBufferAttribute(p, idx.getX(i)); b.fromBufferAttribute(p, idx.getX(i + 1)); c.fromBufferAttribute(p, idx.getX(i + 2));
    n.subVectors(b, a).cross(c.sub(a)); const A = n.length(); n.normalize();
    if (Math.abs(n.y) > .1) continue;
    const key = [n.x, n.z].map(v => Math.round(v * 20)).join(); const e = area.get(key) || { A: 0, n: n.clone() }; e.A += A; area.set(key, e);
  }
  const N = [...area.values()].sort((x, y) => y.A - x.A)[0].n; if (N.z < 0) N.negate();
  const Wd = new T.Vector3(N.z, 0, -N.x);                    // width axis: W x Y = N
  let t = 0, y0 = Infinity, y1 = -Infinity, half = 0;
  for (let i = 0; i < p.count; i++) { a.fromBufferAttribute(p, i); t = Math.max(t, a.dot(N)); half = Math.max(half, Math.abs(a.dot(Wd))); }
  for (let i = 0; i < p.count; i++) { a.fromBufferAttribute(p, i); if (Math.abs(a.dot(Wd)) > half * .8) { y0 = Math.min(y0, a.y); y1 = Math.max(y1, a.y); } }
  // a frame per side: x across the plate, y up, z out of that face
  const side = s => (x, y, z) => new T.Matrix4().makeBasis(Wd.clone().multiplyScalar(s), new T.Vector3(0, 1, 0), N.clone().multiplyScalar(s)).setPosition(Wd.clone().multiplyScalar(s * x).addScaledVector(N, s * (t + z)).setY(y));
  return { front: side(1), back: side(-1), y0, y1, half, t };
}

// ------------------------------------------------------------------ prepare (CPU, no renderer)
// Builds what the explorer's part list has to know before it opens. Both are invisible until dress() succeeds.
//   on the PCB holder (stated by the owner): the main board on one face; on the other, the back, the ejection
//       charge control board and the three 9 V batteries in a pi (two upright side by side, the third across their
//       top). One mesh, a child of the middle PCB holder, so it is picked, dimmed, slid and cut with the holder.
//       The front is the plate's face toward +Z of the model; which of the two faces is which is my choice.
//   in each body tube: an empty mesh that becomes its cardboard inside
export function prepare({ THREE: T, exterior, cad, quality = 'high' }) {
  const k = quality === 'low' ? .5 : 1;
  const P = { T, cad, exterior, walls: {}, onHolder: null, extra: {},
    sheets: { elec: electronicsSheet(k), cam: cameraSheet(k), mot: motorSheet(k), ant: antennaSheet(k), wood: woodSheet(k), card: cardboardSheet(k) } };
  const holder = cad.parts.middlePcbHolder, hm = holder && holder.children.find(o => o.isMesh);
  if (hm) {
    const pl = plateOf(T, hm.geometry), B = FINISH.battery, s = B.fit, [bw, bh, bd] = B.mm.map(v => mm(v) * s), sn = mm(B.snap) * s, gap = mm(.4);
    const yb = pl.y0 + mm(6), legY = yb + sn + bh / 2, barY = yb + sn + bh + gap + bw / 2, Z = bd / 2 + gap;
    const rot = a => new T.Matrix4().makeRotationZ(a);
    const th = FINISH.board.thick, [mw, mh] = FINISH.board.main, [cw, ch] = FINISH.board.control, k = mw / E.main[2];
    const faces = art => ({ pz: art, nz: E.back, all: E.edge }), sidesOf = top => ({ pz: top, all: E.black });
    const cy = pl.y1 - mm(8) - ch / 2, my = (pl.y0 + pl.y1) / 2;
    const mainAt = (x, y, z) => pl.front(x, my + y, z), ctlAt = (x, y, z) => pl.back(x, cy + y, z);
    // a part that stands on a board, over the rectangle the board art keeps free for it
    const stand = (frame, [w, h], [x, y, kw, kh], tall, part) => boxAt(T, [kw * k, kh * k, tall], part, frame(-w / 2 + (x + kw / 2) * k, h / 2 - (y + kh / 2) * k, th + tall / 2));
    const boards = new T.Mesh(merge(T, [
      boxAt(T, [mw, mh, th], faces(E.main), mainAt(0, 0, th / 2)),
      stand(mainAt, [mw, mh], E.mainKeep[0], mm(10), sidesOf(E.term)),
      stand(mainAt, [mw, mh], E.mainKeep[1], mm(8.5), { pz: [...E.header, 1], all: E.black }),
      stand(mainAt, [mw, mh], E.mainKeep[2], mm(2.6), { all: E.tin }),
      boxAt(T, [cw, ch, th], faces(E.control), ctlAt(0, 0, th / 2)),
      stand(ctlAt, [cw, ch], E.controlKeep[0], mm(10), sidesOf(E.term)),
      ...nineVolt(T, rot(Math.PI).premultiply(pl.back(-(bw + gap) / 2, legY, Z)), s),
      ...nineVolt(T, rot(Math.PI).premultiply(pl.back((bw + gap) / 2, legY, Z)), s),
      ...nineVolt(T, rot(-Math.PI / 2).premultiply(pl.back(-sn / 2, barY, Z)), s),
    ]), new T.MeshStandardMaterial({ color: 0x2d6b59, roughness: .55, metalness: .05, side: T.DoubleSide }));
    boards.name = 'boards'; boards.visible = false;
    boards.geometry.computeBoundingBox();
    holder.add(boards); P.onHolder = boards;
  }
  // the cardboard inside of each body tube: an empty mesh now, filled when the tube is dressed
  for (const id of [1, 2]) {
    const tube = exterior[id]; if (!tube) continue;
    const wall = new T.Mesh(new T.BufferGeometry(), new T.MeshStandardMaterial({ color: 0xa8825c, roughness: .9, metalness: 0, side: T.DoubleSide }));
    wall.name = 'tubeInside'; wall.visible = false; wall.raycast = () => {};
    tube.add(wall); P.walls[id] = wall; P.extra[id] = [wall];
  }
  return P;
}

// ------------------------------------------------------------------ dress (GPU)
// The viewer shell's `dress(ctx)`: ctx.engine stands in for the hero's engine. Returns { dispose }.
export async function dress(ctx, P, rocket) {
  const { T, cad, exterior } = P, undo = [], own = [];
  let rk = null;
  const swap = (mesh, m) => { undo.push(() => { mesh.material = old; }); const old = mesh.material; mesh.material = m; };
  const fail = e => { for (const u of undo.reverse()) try { u(); } catch (x) { /* keep undoing */ } for (const o of own) o.dispose(); if (rk) rk.dispose(); throw e; };
  try {
    // ---- THE EXTERIOR: the hero's own dress, on this renderer. Nothing about the paint is decided in this file.
    const reel = window.__reel && window.__reel.rocket;
    rocket.layout.tiltZ = reel ? reel.layout.tiltZ : rocket.layout.tiltZ;   // the key lies along the airframe as it does in the hero
    // the shell keeps its own part record in mesh.userData.part; the dress reads the CAD part id there
    const mine = Object.entries(exterior).map(([id, m]) => { const v = m.userData.part; m.userData.part = +id; return () => { m.userData.part = v; }; });
    // one mesh per part (merge: false); the stand-in nozzle and the page shadow belong to the hero's flight
    const t0 = performance.now();
    try { rk = await LOOK.dressRocket({ rocket, engine: ctx.engine, quality: ctx.quality, merge: false, nozzle: false, shadow: false }); } finally { for (const f of mine) f(); }
    const look = rk.look, t1 = performance.now();

    // ---- sheets and the mapped material (one program)
    const aniso = Math.min(8, ctx.renderer.capabilities.getMaxAnisotropy()), Sh = P.sheets;
    const tex = (S, { repeat = null, wrapS = false } = {}) => S.cv.map((c, i) => {
      const t = new T.CanvasTexture(c); t.colorSpace = i ? T.NoColorSpace : T.SRGBColorSpace; t.anisotropy = aniso;
      if (wrapS || repeat) t.wrapS = T.RepeatWrapping; if (repeat) { t.wrapT = T.RepeatWrapping; t.repeat.set(...repeat); }
      own.push(t); return t;
    });
    const mountMat = rk.materials.mount, studio = mountMat.userData.lookUniforms.lookEnv, F = FINISH.mapped;
    const mapped = ([map, det]) => {
      const m = look.standard({ color: 0xffffff, map, bumpMap: det, bumpScale: F.bump, roughnessMap: det, roughness: 1, metalnessMap: det, metalness: 1, side: T.DoubleSide }, { envIntensity: F.envIntensity, micro: F.micro });
      m.userData.lookUniforms.lookEnv = studio; m.envMapRotation.copy(mountMat.envMapRotation);   // the rocket's own studio and its turn
      own.push(m); return m;
    };
    const printed = color => { const m = ctx.twin(mountMat); m.color.set(color); m.roughness = FINISH.printed.roughness; own.push(m); return m; };
    const meshOf = name => cad.parts[name] && cad.parts[name].children.find(o => o.isMesh);
    const each = (names, f) => { for (const n of names) { const m = meshOf(n); if (m) f(m, n); } };

    // ---- printed parts (stated by the owner): twins of the hero's printed motor mount
    const C = FINISH.printed;
    each(['internalCoupler', 'lowerShockCordMount'], m => swap(m, printed(C.coupler)));
    each(['payload', 'antennaHolder', 'topPcbHolder', 'middlePcbHolder', 'bottomPcbHolder'], m => swap(m, printed(C.holders)));
    // ---- electronics: the altimeter, and on the PCB holder the placeholder boards and the three 9 V batteries
    const elec = tex(Sh.elec);
    each(['altimeter'], m => { boxUV(T, m.geometry, { pz: E.altTop, nz: E.altBack, px: E.side, nx: E.side, py: [...E.side, 1], ny: [...E.side, 1] }, SIZE); swap(m, mapped(elec)); });
    if (P.onHolder) { swap(P.onHolder, mapped(elec)); P.onHolder.visible = true; undo.push(() => { P.onHolder.visible = false; }); }
    // ---- the camera (the lens on its forward face), the motor, the antenna, the rods
    const cam = tex(Sh.cam);
    each(['camera'], m => { boxUV(T, m.geometry, { py: [0, 0, 256, 220], ny: [256, 0, 256, 220], pz: [0, 224, 217, 288], nz: [0, 224, 217, 288], px: [224, 224, 187, 288], nx: [224, 224, 187, 288] }, [512, 512]); swap(m, mapped(cam)); });
    const mot = tex(Sh.mot, { wrapS: true });
    each(['motor'], m => { latheUV(T, m.geometry, { side: [0, 0, 384, 512], bottom: [0, 520, 120, 120], top: [128, 520, 120, 120] }, [384, 640]); swap(m, mapped(mot)); });
    const ant = tex(Sh.ant, { wrapS: true });
    each(['antenna'], m => { latheUV(T, m.geometry, { side: [0, 0, 64, 256] }, [64, 256]); swap(m, mapped(ant)); });
    const wood = tex(Sh.wood);
    each(['woodenRod1', 'woodenRod2', 'woodenRod3', 'woodenRod4'], (m, n) => {
      const i = +n.slice(-1) - 1, strip = j => [i % 2 ? 1024 : 0, ((i + j) % 4) * 64, i % 2 ? -1024 : 1024, 64, 1];
      boxUV(T, m.geometry, { px: strip(0), pz: strip(1), nx: strip(2), nz: strip(3), py: [i * 64, 256, 64, 64], ny: [(i + 1) * 64, 256, 64, 64] }, [1024, 320]); swap(m, mapped(wood));
    });
    // ---- the body tubes are cardboard (stated): the paint keeps the outside, the inside and the ends go to their own mesh
    const card = tex(Sh.card, { repeat: [1, 0.941 / FINISH.cardboardPitch] });
    for (const id of [1, 2]) {
      const tube = exterior[id], wall = P.walls[id]; if (!tube || !wall) continue;
      const g = tube.geometry, p = g.attributes.position, outer = [], inner = [];
      let R = 0; for (let i = 0; i < p.count; i++) R = Math.max(R, Math.hypot(p.getX(i), p.getZ(i)));
      const at = g.index ? i => g.index.getX(i) : i => i, n = g.index ? g.index.count : p.count;
      for (let i = 0; i < n; i += 3) { const v = [at(i), at(i + 1), at(i + 2)]; (v.every(j => Math.hypot(p.getX(j), p.getZ(j)) > R - 2e-4) ? outer : inner).push(...v); }
      const oldIndex = g.index; g.setIndex(outer); undo.push(() => { g.setIndex(oldIndex); wall.visible = false; wall.raycast = () => {}; });
      const wg = wall.geometry; for (const a of ['position', 'normal', 'uv']) wg.setAttribute(a, g.attributes[a]); wg.setIndex(inner); wg.computeBoundingBox(); wg.computeBoundingSphere();
      swap(wall, mapped(card)); wall.visible = true; delete wall.raycast;
    }
    await look.ready();
    for (const t of own) if (t.isTexture && ctx.renderer.initTexture) ctx.renderer.initTexture(t);
    return { look, rocket: rk, stats: { rocketMs: Math.round(t1 - t0), interiorMs: Math.round(performance.now() - t1) }, dispose() { for (const o of own) o.dispose(); rk.dispose(); } };
  } catch (e) { fail(e); }
}
