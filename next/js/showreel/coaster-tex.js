// Therma-Shift coaster: the two small procedural textures the device needs. No image files.
//
//   createAtlas(THREE, { low })   the detail atlas the painted parts share (coaster-geo.js): the faces of the four
//       electronics boards (solder mask with traces under it, pads, vias, silk), the Peltier's part number, the
//       blower label. Two canvases with one layout: `map` (sRGB colour) and `orm` (G roughness, B metalness, the
//       layout three.js reads for roughnessMap and metalnessMap). 512 px high tier, 256 px low. A white block in the
//       top left corner is where every untextured vertex points.
//       -> { map, orm, rect(key) -> [u0, v0, u1, v1], ready (Promise), dispose() }
//   createFrostMap(THREE, { low })  the plate's frost field, 512 px (256 low), RGBA8: R how late frost reaches a spot
//       (low frequency plus veins: the front's feathery outline), G crystal density (needles that point in from the
//       nearest edge), B and A the crystal normal. Generated in slices of at most 3 ms.
//       -> { texture, ready (Promise), dispose() }
//   slices(generator, label)      run a generator in later tasks of at most 3 ms (MessageChannel between them) -> Promise
//
// Markings: generic designators and the part class numbers the real parts carry (TEC1-12703, DC 12V); no brands.

const SLICE_MS = 3;
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const yieldTask = () => new Promise(r => {
  if (typeof MessageChannel !== 'undefined') { const c = new MessageChannel(); c.port1.onmessage = () => r(); c.port2.postMessage(0); } else setTimeout(r, 0);
});
export const sliceStats = { ms: 0, slices: 0, max: 0, maxAt: '', list: [] };
export async function slices(it, label = '') {
  await yieldTask();                       // never in the caller's task (the actor factory)
  for (;;) {
    const t0 = now(); let done = false;
    while (!(done = it.next().done) && now() - t0 < SLICE_MS);
    const dt = now() - t0; sliceStats.ms += dt; sliceStats.slices++; sliceStats.list.push(dt); if (dt > sliceStats.max) { sliceStats.max = dt; sliceStats.maxAt = label; }
    if (done) return;
    await yieldTask();
  }
}

// deterministic random and tileable value noise
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function hash2(x, y, seed) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed), c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x, y, seed, oct = 3) => { let s = 0, a = 0.5, n = 0; for (let o = 0; o < oct; o++) { s += a * vnoise(x, y, seed + o * 17); n += a; a *= 0.5; x *= 2.03; y *= 2.03; } return s / n; };
const ridge = (x, y, seed) => 1 - Math.abs(vnoise(x, y, seed) * 2 - 1);

// -------------------------------------------------------------------- atlas
// layout at 512 px: [x, y, w, h, mm wide, mm tall]
const LAYOUT = {
  drv: [10, 10, 216, 180, 24, 20], drvBack: [236, 10, 216, 180, 24, 20],
  pd: [10, 200, 99, 247, 11, 27.4], pdBack: [119, 200, 99, 247, 11, 27.4],
  buck: [228, 200, 158, 111, 17.5, 12.3], buckBack: [228, 321, 158, 111, 17.5, 12.3],
  tec: [396, 200, 108, 108, 40, 40], fan: [400, 320, 96, 96, 13.8, 13.8],
};
const MASK = '#235e4b', MASK_HI = '#2f735d', MASK_LO = '#1c4f3f', SILK = '#e9ece6', TIN = '#c9cbcc', GOLD = '#c8ad62', HOLE = '#141a17';

export function createAtlas(THREE, { low = false } = {}) {
  const S = low ? 256 : 512, k = S / 512;
  const mk = () => { const c = document.createElement('canvas'); c.width = c.height = S; return c; };
  const cm = mk(), co = mk();
  let g = null, o = null;                  // contexts are made in the first slice (a cold 2D context costs milliseconds)
  const map = new THREE.CanvasTexture(cm), orm = new THREE.CanvasTexture(co);
  map.colorSpace = THREE.SRGBColorSpace; orm.colorSpace = THREE.NoColorSpace;
  for (const t of [map, orm]) { t.anisotropy = low ? 2 : 4; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; }
  map.name = 'coaster-atlas'; orm.name = 'coaster-atlas-orm';
  const rm = (rough, metal) => `rgb(0,${Math.round(rough * 255)},${Math.round(metal * 255)})`;
  // a board face: both canvases get the same shapes; d(mm) -> px
  function face(key, draw) {
    const [x, y, w, h, mw, mh] = LAYOUT[key], sx = w * k / mw, sy = h * k / mh;
    return [[g, false], [o, true]].map(([c, isO]) => () => {
      c.save(); c.beginPath(); c.rect(x * k, y * k, w * k, h * k); c.clip(); c.translate(x * k, y * k); c.scale(sx, sy);
      draw(c, isO, mw, mh, sx);
      c.restore();
    });
  }
  const fill = (c, isO, col, r, m) => { c.fillStyle = isO ? rm(r, m) : col; c.strokeStyle = c.fillStyle; };
  // solder mask with a soft ground pour, traces under it, vias
  function mask(c, isO, w, h, seed, { traces = 9 } = {}) {
    const R = rng(seed);
    fill(c, isO, MASK, 0.42, 0); c.fillRect(0, 0, w, h);
    if (!isO) {                                   // copper pour: slightly lighter islands under the mask
      c.fillStyle = MASK_HI; c.globalAlpha = 0.35;
      for (let i = 0; i < 5; i++) c.fillRect(R() * w, R() * h, 2 + R() * w * 0.5, 1.5 + R() * h * 0.4);
      c.globalAlpha = 1;
    }
    for (let i = 0; i < traces; i++) {            // traces: runs with 45 degree bends
      let x = R() * w, y = R() * h; const wd = 0.22 + R() * 0.3;
      c.lineWidth = wd; c.lineCap = 'round'; c.lineJoin = 'round';
      fill(c, isO, i % 3 ? MASK_HI : MASK_LO, 0.4, 0);
      c.beginPath(); c.moveTo(x, y);
      for (let s = 0; s < 4; s++) {
        const d = 1.5 + R() * 6, dir = Math.floor(R() * 4);
        const nx = x + [d, 0, -d, 0][dir], ny = y + [0, d, 0, -d][dir];
        const b = 0.6 * Math.sign(nx - x || 1), e = 0.6 * Math.sign(ny - y || 1);
        c.lineTo(nx - (dir % 2 ? 0 : b), ny - (dir % 2 ? e : 0)); x = nx + (dir % 2 ? b : 0); y = ny + (dir % 2 ? 0 : e); c.lineTo(x, y);
      }
      c.stroke();
      via(c, isO, x, y, 0.32);
    }
  }
  function via(c, isO, x, y, r) { fill(c, isO, GOLD, 0.34, 1); c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); fill(c, isO, HOLE, 0.7, 0); c.beginPath(); c.arc(x, y, r * 0.45, 0, 7); c.fill(); }
  function pad(c, isO, x, y, w, h, col = TIN) { fill(c, isO, col, 0.32, 1); c.fillRect(x - w / 2, y - h / 2, w, h); }
  // a through-hole solder joint seen from the solder side: a bright cone with the pin's cut end
  function joint(c, isO, x, y, r = 0.85) {
    fill(c, isO, '#b9bbbd', 0.3, 1); c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
    fill(c, isO, '#e3e4e5', 0.22, 1); c.beginPath(); c.arc(x - r * 0.18, y - r * 0.18, r * 0.5, 0, 7); c.fill();
    fill(c, isO, '#8d9092', 0.4, 1); c.beginPath(); c.arc(x, y, r * 0.24, 0, 7); c.fill();
  }
  function silkRect(c, isO, x, y, w, h) { fill(c, isO, SILK, 0.6, 0); c.lineWidth = 0.16; c.strokeRect(x - w / 2, y - h / 2, w, h); }
  function text(c, isO, s, x, y, size, col = SILK, rough = 0.6, rot = 0) {
    fill(c, isO, col, rough, 0); c.save(); c.translate(x, y); c.rotate(rot);
    c.font = `600 ${size}px ui-monospace, Menlo, Consolas, monospace`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(s, 0, 0); c.restore();
  }
  const jobs = [
    // DRV8871 breakout, populated side (matches buildBoards: x to the right, y down from the top edge)
    () => face('drv', (c, isO, w, h) => {
      mask(c, isO, w, h, 11);
      for (let i = 0; i < 6; i++) { via(c, isO, 12 - 6.35 + i * 2.54, 1.4, 0.75); }                        // header row
      silkRect(c, isO, 12, 6.8, 6.4, 6.2);                                                               // chip outline
      for (let i = 0; i < 4; i++) for (const s of [-1, 1]) pad(c, isO, 12 - 1.9 + i * 1.27, 6.8 + s * 2.75, 0.6, 1.5);
      pad(c, isO, 12, 6.8, 3.4, 2.4, GOLD);                                                              // thermal pad
      silkRect(c, isO, 12 - 8.2, 4.6, 4.2, 4.2);
      for (const s of [-1, 1]) { silkRect(c, isO, 12 + s * 5.6, 15.6, 8.2, 8.0); for (const t of [-1, 1]) pad(c, isO, 12 + s * 5.6 + t * 1.9, 15.6 - 0.3, 2.0, 2.0); }
      text(c, isO, 'U1', 17.4, 4.2, 1.5); text(c, isO, 'C1', 3.6, 8.6, 1.3); text(c, isO, 'OUT', 6.4, 10.6, 1.25); text(c, isO, 'PWR', 17.6, 10.6, 1.25);
      text(c, isO, 'R1', 19.2, 8.2, 1.1); text(c, isO, 'IN1 IN2 GND VM', 12, 3.1, 0.95);
    }),
    // DRV8871 breakout, solder side: terminal and header joints, a ground pour
    () => face('drvBack', (c, isO, w, h) => {
      mask(c, isO, w, h, 12, { traces: 6 });
      for (let i = 0; i < 6; i++) joint(c, isO, 12 + 6.35 - i * 2.54, 1.4, 0.8);
      for (const s of [-1, 1]) for (const t of [-1, 1]) joint(c, isO, 12 + s * 5.6 + t * 1.9, 15.3, 1.15);
      for (let i = 0; i < 9; i++) via(c, isO, 9.6 + (i % 3) * 1.2, 5.6 + Math.floor(i / 3) * 1.2, 0.3);   // thermal vias
      text(c, isO, 'DRV8871', 12, 10.6, 1.5); text(c, isO, 'VM 6.5-45V', 12, 12.5, 1.0);
    }),
    // USB-C PD trigger board, top (x across, y from the terminal end to the port end)
    () => face('pd', (c, isO, w, h) => {
      mask(c, isO, w, h, 21, { traces: 7 });
      silkRect(c, isO, 5.5, 4.2, 8.2, 7.8); for (const t of [-1, 1]) pad(c, isO, 5.5 + t * 1.9, 4.5, 2.0, 2.0);
      pad(c, isO, 5.9, 14.2, 3.4, 3.4, GOLD); silkRect(c, isO, 5.9, 14.2, 4.0, 4.0);
      for (let i = 0; i < 6; i++) pad(c, isO, 3.0 + i * 1.0, 20.4, 0.34, 1.2);                            // receptacle pads
      silkRect(c, isO, 5.5, 23.9, 9.6, 7.0);
      text(c, isO, '12V', 2.2, 9.6, 1.2); text(c, isO, 'U1', 9.2, 12.0, 1.1); text(c, isO, 'Q1', 2.0, 11.2, 1.0); text(c, isO, 'CC1 CC2', 5.5, 18.6, 0.9);
    }),
    () => face('pdBack', (c, isO, w, h) => {
      mask(c, isO, w, h, 22, { traces: 4 });
      for (const t of [-1, 1]) joint(c, isO, 5.5 + t * 1.9, 4.5, 1.1);
      for (const t of [-1, 1]) joint(c, isO, 5.5 + t * 4.47, 21.6, 0.8);
      text(c, isO, 'PD 12V 3A', 5.5, 12.0, 1.15, SILK, 0.6, Math.PI / 2);
    }),
    // buck converter, populated side
    () => face('buck', (c, isO, w, h) => {
      mask(c, isO, w, h, 31, { traces: 6 });
      silkRect(c, isO, w / 2 - 3.6, h / 2 + 0.4, 5.8, 5.8); silkRect(c, isO, w / 2 + 3.3, h / 2 - 1.6, 4.4, 5.4);
      for (const [x, y] of [[1.3, 1.3], [w - 1.3, 1.3], [1.3, h - 1.3], [w - 1.3, h - 1.3]]) via(c, isO, x, y, 0.85);
      text(c, isO, 'IN+', 2.4, 3.4, 0.95); text(c, isO, 'OUT+', w - 2.8, 3.4, 0.95); text(c, isO, 'L1', w / 2 - 3.6, 1.6, 1.0);
    }),
    () => face('buckBack', (c, isO, w, h) => {
      mask(c, isO, w, h, 32, { traces: 3 });
      for (const [x, y] of [[1.3, 1.3], [w - 1.3, 1.3], [1.3, h - 1.3], [w - 1.3, h - 1.3]]) joint(c, isO, x, y, 0.95);
      text(c, isO, '5V 3A', w / 2, h / 2, 1.5);
    }),
    // the Peltier's cold face: bare ceramic (white: the vertex colour carries it) with the part number in black ink
    () => face('tec', (c, isO, w, h) => {
      fill(c, isO, '#ffffff', 1, 0); c.fillRect(0, 0, w, h);
      text(c, isO, 'TEC1-12703', w / 2, h - 5.6, 3.3, '#2a2b2e', 0.9);
      text(c, isO, '2311', w / 2, h - 9.6, 2.2, '#3a3b3e', 0.9);
    }),
    // the blower label: matte silver sticker, a ring, small print that does not read at hero size
    () => face('fan', (c, isO, w, h) => {
      fill(c, isO, '#202125', 0.75, 0); c.fillRect(0, 0, w, h);
      fill(c, isO, '#d6d6d1', 1, 0); c.beginPath(); c.arc(w / 2, h / 2, w * 0.47, 0, 7); c.fill();
      fill(c, isO, '#8c8e90', 1, 0); c.lineWidth = 0.22; c.beginPath(); c.arc(w / 2, h / 2, w * 0.40, 0, 7); c.stroke();
      text(c, isO, 'DC 12V', w / 2, h / 2 - 1.5, 2.0, '#2c2d30', 1); text(c, isO, '0.12A', w / 2, h / 2 + 0.9, 1.7, '#2c2d30', 1);
      text(c, isO, '4010', w / 2, h / 2 + 3.0, 1.3, '#55575a', 1);
      fill(c, isO, '#3c3d40', 1, 0); c.beginPath(); c.moveTo(w / 2 - 0.9, 2.0); c.lineTo(w / 2 + 0.9, 2.0); c.lineTo(w / 2, 3.3); c.fill();   // rotation arrow
    }),
  ];
  // small steps, so a slice can stop between any two: the two contexts, the first text (the font lookup), then
  // each face on each canvas (a millisecond or less each)
  const ready = slices((function* () {
    // drawn once and uploaded once: a CPU-rastered canvas (no GPU canvas to flush and read back at upload)
    g = cm.getContext('2d', { willReadFrequently: true }); g.fillStyle = '#fff'; g.fillRect(0, 0, S, S); yield;
    o = co.getContext('2d', { willReadFrequently: true }); o.fillStyle = '#fff'; o.fillRect(0, 0, S, S); yield;
    text(g, false, 'A', -9, -9, 1); yield;
    for (const j of jobs) for (const step of j()) { step(); yield; }
    map.needsUpdate = true; orm.needsUpdate = true;
  })(), 'atlas');
  const inset = 1.5 / S;
  return {
    map, orm, ready, size: S, bytes: Math.round(S * S * 4 * 4 / 3) * 2,
    rect(key) { const [x, y, w, h] = LAYOUT[key]; return [x / 512 + inset, 1 - (y + h) / 512 + inset, (x + w) / 512 - inset, 1 - y / 512 - inset]; },
    dispose() { map.dispose(); orm.dispose(); },
  };
}

// ------------------------------------------------------------------- frost
// u, v across the plate (0..1 = -40..40 mm in x and z). Needles point inward from the nearest edge, so the crystal
// noise is stretched along that direction; where two edges are equally near (the diagonals) the two fields blend.
export function createFrostMap(THREE, { low = false } = {}) {
  const n = low ? 256 : 512, data = new Uint8Array(n * n * 4);
  data.fill(128);                          // neutral until the slices have filled it
  const tex = new THREE.DataTexture(data, n, n, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.MirroredRepeatWrapping; tex.generateMipmaps = true;   // mirrored: the shader also tiles it small for grain
  tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter; tex.anisotropy = low ? 2 : 4;
  tex.colorSpace = THREE.NoColorSpace; tex.name = 'coaster-frost'; tex.needsUpdate = true;
  let H = null;
  // crystals: fine grains everywhere, short needles along the growth direction (a: mm along it, c: across it)
  const grains = (x, z) => 0.6 * ridge(x * 0.75, z * 0.75, 5) + 0.4 * ridge(x * 1.9 + 3, z * 1.9, 6);
  const needles = (a, c, seed) => Math.pow(ridge(a * 0.34 + 0.8 * vnoise(c * 0.35, a * 0.08, seed + 2), c * 1.5, seed), 2.4);
  const ready = slices((function* () {
    H = new Float32Array(n * n); yield;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const px = (x + 0.5) / n * 80 - 40, pz = (y + 0.5) / n * 80 - 40;      // mm
        const dx = 40 - Math.abs(px), dz = 40 - Math.abs(pz);
        const w = Math.min(1, Math.max(0, 0.5 + (dz - dx) / 6));               // 1: the x edge is nearer
        const nd = needles(dx, pz, 3) * w + needles(dz, px, 4) * (1 - w);
        const c = Math.min(1, 0.62 * grains(px, pz) + 0.55 * nd);
        // when frost arrives: patches at every scale (a fractal coastline, not a contour), fringed by the needles
        const late = 0.66 * fbm(px * 0.07 + 7, pz * 0.07 + 3, 21, 4) + 0.22 * ridge(px * 0.21, pz * 0.21, 33) + 0.12 * (1 - nd);
        const i = (y * n + x) * 4;
        data[i] = Math.round(Math.min(1, Math.max(0, (late - 0.5) * 1.5 + 0.5)) * 255);
        data[i + 1] = Math.round(c * 255);
        H[y * n + x] = c;
        if ((x & 31) === 31) yield;
      }
    }
    const b = 2.2 * n / 256;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const at = (i, j) => H[Math.min(n - 1, Math.max(0, j)) * n + Math.min(n - 1, Math.max(0, i))];
        const gx = (at(x + 1, y) - at(x - 1, y)) * b, gy = (at(x, y + 1) - at(x, y - 1)) * b, l = Math.hypot(gx, gy, 1), i = (y * n + x) * 4;
        data[i + 2] = Math.round((-gx / l * 0.5 + 0.5) * 255); data[i + 3] = Math.round((-gy / l * 0.5 + 0.5) * 255);
        if ((x & 31) === 31) yield;
      }
    }
    tex.needsUpdate = true;
  })(), 'frost');
  return { texture: tex, ready, size: n, bytes: Math.round(n * n * 4 * 4 / 3), dispose() { tex.dispose(); } };
}
