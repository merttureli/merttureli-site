/* Low Light: the display type.
   Anybody's width axis runs 50 to 150 and every glyph's advance is linear along it. So each capital is
   measured once at both ends, and after that a line's width at any setting is arithmetic, not layout.

   Three uses:
   - waves:  a word that always fills its measure exactly while a swell of width travels through its
             letters as the page scrolls (hero lines and the one-word band of each section)
   - blocks: lines of different lengths set at one size, each at the width that makes it fill the measure
   - fitText: one line (the name on the pass) set to fill its box */

const WMIN = 50, WMAX = 150, SPAN = WMAX - WMIN;
const BOX = 0.7175;                 // height of a display line box in em (see .wave in the stylesheet)
const table = new Map();            // "weight|char" -> advance, left bearing and right bearing in em, each at width 50 and at 150
let probe, pen;

function measure(chars, weight) {
  const need = [...new Set(chars)].filter(c => !table.has(weight + '|' + c));
  if (!need.length) return;
  if (!probe) {
    probe = document.createElement('div');
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;white-space:pre;font-family:var(--display);font-size:400px;line-height:1;letter-spacing:0;font-kerning:none;text-transform:none;pointer-events:none';
    document.body.appendChild(probe);
    pen = document.createElement('canvas').getContext('2d');
  }
  probe.style.fontWeight = weight;
  const cells = [];
  for (const c of need) for (const w of [WMIN, WMAX]) {
    const s = document.createElement('span');
    s.style.cssText = `display:inline-block;font-variation-settings:"wdth" ${w}`;
    s.textContent = c === ' ' ? '\u00a0' : c;
    probe.appendChild(s); cells.push(s);
  }
  const widths = cells.map(s => s.getBoundingClientRect().width / 400);
  probe.textContent = '';
  // Side bearings: where the ink starts and stops inside the advance. A canvas can read them; if it does not
  // agree with the page about the advance (no width axis in canvas text), the bearings are left at zero.
  const face = getComputedStyle(probe).fontFamily;
  need.forEach((c, i) => {
    const row = [widths[i * 2], widths[i * 2 + 1], 0, 0, 0, 0];
    if (c !== ' ') ['ultra-condensed', 'extra-expanded'].forEach((stretch, k) => {
      pen.font = `${weight} ${stretch} 400px ${face}`;
      const m = pen.measureText(c);
      if (Math.abs(m.width / 400 - row[k]) < 0.01) { row[2 + k] = -m.actualBoundingBoxLeft / 400; row[4 + k] = (m.width - m.actualBoundingBoxRight) / 400; }
    });
    table.set(weight + '|' + c, row);
  });
}

/* A string as ink: its width in em at 50 (a), what it gains by 150 (b), and the first letter's left bearing
   (l at 50, lg gained by 150), which the line is pulled back by so the ink starts exactly on the margin. */
function span(text, weight) {
  const chars = [...text];
  measure(chars, weight);
  let a = 0, b = 0;
  for (const c of chars) { const t = table.get(weight + '|' + c); a += t[0]; b += t[1] - t[0]; }
  const f = table.get(weight + '|' + chars[0]), z = table.get(weight + '|' + chars[chars.length - 1]);
  return { a: a - f[2] - z[4], b: b - (f[3] - f[2]) - (z[5] - z[4]), l: f[2], lg: f[3] - f[2] };
}
const widthFor = (m, em) => WMIN + SPAN * (em - m.a) / m.b;       // axis setting at which the string's ink is `em` wide
const emAt = (m, w) => m.a + m.b * (w - WMIN) / SPAN;
const bearAt = (m, w) => m.l + m.lg * (w - WMIN) / SPAN;
const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
const setW = (el, w) => { el.style.fontVariationSettings = `"wdth" ${w.toFixed(2)}`; };

/* ---------- waves ---------- */
export function createWaves({ reduced }) {
  const hero = document.querySelector('.hero');
  const items = [...document.querySelectorAll('[data-wave]')].map(el => {
    const text = el.textContent.trim().toUpperCase();
    const weight = getComputedStyle(el).fontWeight;
    el.textContent = '';
    const spans = [...text].map(c => { const s = document.createElement('i'); s.textContent = c === ' ' ? ' ' : c; el.appendChild(s); return s; });
    measure([...text], weight);
    const adv = [...text].map(c => table.get(weight + '|' + c)), n = adv.length;
    // per letter: advance at 50 and gain per unit of width; the two outer letters give up their outer bearing
    const lo = adv.map((v, i) => v[0] - (i === 0 ? v[2] : 0) - (i === n - 1 ? v[4] : 0));
    const gain = adv.map((v, i) => ((v[1] - v[0]) - (i === 0 ? v[3] - v[2] : 0) - (i === n - 1 ? v[5] - v[4] : 0)) / SPAN);
    return { el, text, weight, spans, lo, gain, m: span(text, weight), l: adv[0][2], lg: (adv[0][3] - adv[0][2]) / SPAN,
      dir: el.dataset.dir === '-1' ? -1 : 1, hero: !!el.dataset.hero, fs: 0, mean: 100, need: 0, x: [], top: 0, h: 0, applied: [] };
  });
  let vh = window.innerHeight, heroH = 1;

  function layout() {
    vh = window.innerHeight;
    const heroes = items.filter(i => i.hero);
    if (heroes.length === 2 && hero) {
      // The two hero lines share one mean width, chosen so that both fill the measure and together fill the height that is free.
      const title = heroes[0].el.parentElement, cs = getComputedStyle(hero);
      const W = title.clientWidth, gap = parseFloat(cs.getPropertyValue('--hero-gap')) || 0, reserve = parseFloat(cs.getPropertyValue('--reserve')) || 0;
      heroH = hero.offsetHeight;
      const H = heroH - title.offsetTop - reserve - gap;
      const tall = w => BOX * W * (1 / emAt(heroes[0].m, w) + 1 / emAt(heroes[1].m, w));
      let lo = W < 700 ? 57 : 64, hi = 132;
      let mean = lo;
      if (tall(lo) > H) { if (tall(hi) >= H) mean = hi; else { for (let k = 0; k < 30; k++) { mean = (lo + hi) / 2; if (tall(mean) > H) lo = mean; else hi = mean; } } }
      for (const it of heroes) { it.mean = mean; it.W = W; it.fs = W / emAt(it.m, mean); }
    }
    for (const it of items) {
      if (!it.hero) {
        it.el.style.fontSize = '';
        const W = it.el.parentElement.clientWidth, pref = parseFloat(getComputedStyle(it.el).fontSize);
        it.mean = clamp(widthFor(it.m, W / pref), 60, 138); it.W = W; it.fs = W / emAt(it.m, it.mean);
      }
      it.el.style.fontSize = it.fs.toFixed(2) + 'px';
      it.need = (it.W - 0.4) / it.fs;
      // where each letter's middle sits along the line, 0 to 1, at the mean width
      let run = 0; const total = emAt(it.m, it.mean);
      it.x = it.lo.map((a, i) => { const adv = a + it.gain[i] * (it.mean - WMIN); const mid = (run + adv / 2) / total; run += adv; return mid; });
      it.applied = [];
    }
    for (const it of items) { const r = it.el.getBoundingClientRect(); it.top = r.top + window.scrollY; it.h = r.height; it.el.setAttribute('data-ready', ''); }
  }

  /* One line: letters near `c` take up to AMP more width than the rest, and the rest give way by exactly as much. */
  const AMP = 100, REACH = 0.62;
  function solve(it, c) {
    const n = it.lo.length, bump = new Array(n);
    for (let i = 0; i < n; i++) { const u = Math.abs(it.x[i] - c) / REACH; bump[i] = u >= 1 ? 0 : 0.5 + 0.5 * Math.cos(Math.PI * u); }
    let lo = WMIN - AMP, hi = WMAX, base = it.mean;
    for (let k = 0; k < 26; k++) {
      base = (lo + hi) / 2;
      let em = 0;
      for (let i = 0; i < n; i++) em += it.lo[i] + it.gain[i] * (clamp(base + AMP * bump[i], WMIN, WMAX) - WMIN);
      if (em > it.need) hi = base; else lo = base;
    }
    for (let i = 0; i < n; i++) {
      const w = Math.round(clamp(lo + AMP * bump[i], WMIN, WMAX) * 20) / 20;
      if (it.applied[i] !== w) {
        it.applied[i] = w; setW(it.spans[i], w);
        if (i === 0) it.spans[0].style.marginLeft = (-(it.l + it.lg * (w - WMIN))).toFixed(4) + 'em';
      }
    }
  }

  function update(y) {
    for (const it of items) {
      let p;
      if (reduced) { if (it.applied.length) continue; solve(it, 9); continue; }       // far off the line: every letter at one width
      if (it.hero) p = clamp(y / (heroH * 0.92), 0, 1);
      else { p = (y + vh - it.top) / (vh + it.h); if ((p < -0.05 || p > 1.05) && it.applied.length) continue; p = clamp(p, 0, 1); }
      const from = it.hero ? 0.06 : -0.12, to = it.hero ? 0.94 : 1.12;
      const t = it.dir > 0 ? p : 1 - p;
      solve(it, from + (to - from) * t);
    }
  }
  return { layout, update, items };
}

/* ---------- blocks ---------- */
export function fitBlock(units, { width, floor }) {
  // one size for every line: the longest line sits at `floor`, the others open up until they fill the measure
  const ms = units.map(u => span(u.text, u.weight));
  const fs = Math.min(...ms.map(m => width / emAt(m, floor)));
  const widths = ms.map(m => clamp(widthFor(m, (width - 0.4) / fs), WMIN, WMAX));
  return { fs, widths, pulls: ms.map((m, i) => bearAt(m, widths[i])) };
}

/* ---------- one line in a box ---------- */
export function fitText(el, text, { width, size, maxSize }) {
  const weight = getComputedStyle(el).fontWeight, m = span(text.toUpperCase(), weight);
  let fs = size, w = widthFor(m, (width - 0.4) / fs);
  if (w < WMIN) { w = WMIN; fs = (width - 0.4) / m.a; }
  else if (w > WMAX) { w = WMAX; fs = Math.min(maxSize, (width - 0.4) / (m.a + m.b)); }
  el.style.fontSize = fs.toFixed(2) + 'px';
  el.style.marginLeft = (-bearAt(m, w)).toFixed(4) + 'em';
  setW(el, w);
}
