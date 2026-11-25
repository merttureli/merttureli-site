// Seven-segment digits drawn in SVG, so the unlit segments show, and LED bar meters.
// A digit cell is 20 x 36 units with 6 units between cells; segments are 4 units thick with a 1.2 unit gap.
const W = 20, H = 36, S = 6, T = 4, G = 1.2;
const l = T / 2, r = W - T / 2, top = T / 2, mid = H / 2, bot = H - T / 2;
const hseg = (x0, x1, y) => [[x0, y], [x0 + T / 2, y - T / 2], [x1 - T / 2, y - T / 2], [x1, y], [x1 - T / 2, y + T / 2], [x0 + T / 2, y + T / 2]];
const vseg = (x, y0, y1) => [[x, y0], [x + T / 2, y0 + T / 2], [x + T / 2, y1 - T / 2], [x, y1], [x - T / 2, y1 - T / 2], [x - T / 2, y0 + T / 2]];
const SEGS = {
  a: hseg(l + G, r - G, top), b: vseg(r, top + G, mid - G), c: vseg(r, mid + G, bot - G), d: hseg(l + G, r - G, bot),
  e: vseg(l, mid + G, bot - G), f: vseg(l, top + G, mid - G), g: hseg(l + G, r - G, mid),
};
const ORDER = 'abcdefg';
const MASK = { 0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg', '-': 'g', ' ': '', '*': 'abcdefg' };

// Fill an <svg class="seg" data-n="4"> and return set(text): text is right aligned, blanks stay unlit.
export function makeSeg(svg) {
  const n = +svg.dataset.n || 4, NS = 'http://www.w3.org/2000/svg';
  svg.setAttribute('viewBox', `0 0 ${n * W + (n - 1) * S} ${H}`);
  const cells = [];
  for (let i = 0; i < n; i++) {
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('transform', `translate(${i * (W + S)} 0)`);
    const polys = ORDER.split('').map(k => {
      const p = document.createElementNS(NS, 'polygon');
      p.setAttribute('points', SEGS[k].map(q => q.map(v => +v.toFixed(2)).join(',')).join(' '));
      g.appendChild(p);
      return p;
    });
    svg.appendChild(g);
    cells.push({ polys, ch: null });
  }
  return function set(text) {
    const s = String(text).padStart(n, ' ').slice(-n);
    for (let i = 0; i < n; i++) {
      const ch = s[i], cell = cells[i];
      if (cell.ch === ch) continue;
      cell.ch = ch;
      const m = MASK[ch] ?? '';
      cell.polys.forEach((p, k) => p.classList.toggle('on', m.includes(ORDER[k])));
    }
  };
}

// An LED bar of N cells (8px pitch). set(v) lights 0..1 from the left; a centered bar takes -1..1 from the middle.
// data-cells="fit" sizes the bar to whole cells of the room its parent gives it (up to data-max).
export function makeBar(el) {
  const center = el.classList.contains('bar-m--center'), i = el.querySelector('i');
  let cells = +el.dataset.cells || 32, last = '', lastV = 0;
  const apply = () => el.style.setProperty('--cells', cells);
  if (el.dataset.cells === 'fit') {
    const host = el.parentElement, max = +el.dataset.max || 64;
    const fit = () => {
      const cs = getComputedStyle(host);
      let room = host.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      for (const sib of host.children) if (sib !== el && getComputedStyle(host).flexDirection === 'row') room -= sib.getBoundingClientRect().width + parseFloat(cs.columnGap || 0);
      let c = Math.max(4, Math.min(max, Math.floor((room + 2) / 8)));
      if (center && c % 2) c--;
      if (c !== cells) { cells = c; apply(); last = ''; set(lastV); }
    };
    cells = 0; new ResizeObserver(fit).observe(host);
  }
  apply();
  function set(v) {
    lastV = v;
    if (!cells) return;
    let a, b;
    if (center) {
      const half = cells / 2, k = Math.round(Math.abs(v) * half);
      if (v < 0) { a = half - k; b = half; } else { a = half; b = half + k; }
    } else { a = 0; b = Math.round(Math.max(0, Math.min(1, v)) * cells); }
    const key = a + ',' + b;
    if (key === last) return;
    last = key;
    i.style.clipPath = b <= a ? 'inset(0 100% 0 0)' : `inset(0 ${Math.max(0, (cells - b) * 8 - 2)}px 0 ${a * 8}px)`;
  }
  return set;
}
