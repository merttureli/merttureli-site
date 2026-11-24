// resolve.js: what one position of the resolve control draws. Shared by the figure (figure.js) and the label
// under the slider (stepwise.js), so the words always say what the picture does.
//
// 0 is 1-bit: two tones, big cells. The number of tones then grows in steps (3, 4, 6, 8) while the cells stay
// at least 2 device pixels. From about 0.55 a Bayer-threshold dissolve hands the picture to the shaded render in
// square blocks of cells (figure.js uBlock): a block whose threshold is under `mix` shows its true color, every
// other block stays dithered green. Nothing is ever a blend of the two. The cells go to 1 device pixel at 0.85,
// and at 1 every block is shaded.
const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const LEVELS = [[.08, 2], [.2, 3], [.34, 4], [.48, 6], [Infinity, 8]];

export function resolveSteps(r, cell0 = 2) {
  const levels = LEVELS.find(([to]) => r < to)[1];
  const cell = r < .3 ? cell0 : r < .85 ? Math.max(2, Math.round(cell0 / 2)) : 1;
  const mix = clamp01((r - .54) / .42);
  return { cell, levels, mix };
}

export function resolveText(r) {
  const { levels, mix } = resolveSteps(r);
  if (mix >= 1) return 'Shaded';
  if (mix > 0) return `${Math.round(mix * 100)}% shaded`;
  return levels === 2 ? '1-bit' : `${levels} tones`;
}
