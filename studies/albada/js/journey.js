/* The color journey: one background color for the whole viewport, driven by the scroll, moving through
   the colors of the morning. Pure functions, so the same code can be checked outside the browser.

   Colors are mixed in OKLab (no gray dip between two hues). The ink is chosen from the background's
   luminance so text keeps at least 4.5 to 1 at every point: cream on dark, green-black on light, and
   in the narrow band between the two it goes to pure white or pure black and flips once. */

const hexToRgb = hex => { const n = parseInt(hex.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const toLin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const toSrgb = c => { c = Math.min(1, Math.max(0, c)); return Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)); };

export function rgbToOklab([r, g, b]) {
  r = toLin(r); g = toLin(g); b = toLin(b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
export function oklabToRgb([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [toSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s), toSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s), toSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)];
}
export const luminance = ([r, g, b]) => 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b);
export const contrast = (a, b) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
export const css = ([r, g, b]) => `rgb(${r} ${g} ${b})`;
export const parseColor = str => {                       // "#rrggbb", "rgb(r, g, b)" or "rgb(r g b)"
  str = String(str).trim();
  if (str[0] === '#') return hexToRgb(str.length === 4 ? '#' + [...str.slice(1)].map(c => c + c).join('') : str);
  const m = str.match(/[\d.]+/g); return m ? m.slice(0, 3).map(Number) : [0, 0, 0];
};

const mixRgb = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const clamp01 = t => Math.min(1, Math.max(0, t));
const ease = t => t * t * (3 - 2 * t);

export const INK_ON_DARK = [247, 236, 214], INK_ON_LIGHT = [28, 32, 25], BURNER = [244, 162, 58];
const WHITE = [255, 255, 255], BLACK = [0, 0, 0], FLIP = 0.179;

/* Ink for a background. Below FLIP the ink is cream, warming to white as the background nears the
   band where cream would drop under 4.5; above FLIP it is black, settling to the green-black. */
export function inkFor(bg) {
  const Y = luminance(bg);
  return Y < FLIP ? mixRgb(INK_ON_DARK, WHITE, clamp01((Y - 0.085) / (0.14 - 0.085)))
                  : mixRgb(BLACK, INK_ON_LIGHT, clamp01((Y - 0.25) / (0.34 - 0.25)));
}
/* The burner amber is for dark grounds only: past the point where it would lose contrast it becomes the ink. */
export function accentFor(bg, ink) {
  const Y = luminance(bg);
  return mixRgb(BURNER, ink, clamp01((Y - 0.045) / (0.06 - 0.045)));
}

/* stops: [{ top, color:[r,g,b], via:[[r,g,b], ...] }] in page order; `via` colors are passed through on the
   way INTO that stop. Returns a function of the probe position (a y in page pixels). */
export function makeJourney(stops, windowBefore, windowAfter) {
  const lab = stops.map(s => ({ top: s.top, path: [...(s.via || []), s.color].map(rgbToOklab) }));
  return function colorAt(y) {
    let i = 0;
    for (let k = 1; k < lab.length; k++) if (y >= lab[k].top - windowBefore) i = k;
    if (i === 0) return oklabToRgb(lab[0].path[lab[0].path.length - 1]);
    const prev = lab[i - 1].path[lab[i - 1].path.length - 1], path = [prev, ...lab[i].path];
    const t = ease(clamp01((y - (lab[i].top - windowBefore)) / (windowBefore + windowAfter)));
    if (t >= 1) return oklabToRgb(path[path.length - 1]);
    const f = t * (path.length - 1), k = Math.min(path.length - 2, Math.floor(f)), u = f - k;
    return oklabToRgb(path[k].map((v, j) => v + (path[k + 1][j] - v) * u));
  };
}
