---
name: palette
description: Use when asked to change a color of the current site's palettes (Original, Card green, Slate, Warm, Daily), add or remove a palette, change the default palette, or fix palette contrast.
---

# Palettes

Detail: `docs/recipes/palette.md`. Tokens: `docs/design/site-tokens.md`.

1. Colors: `css/site-palette.css`, block `html[data-card-theme="<name>"]` plus the rules right after it. Names, labels, swatches: `js/site-palette.js`.
2. Tweak: change the value and its matching `rgba(...)` alpha steps; if `--paper` or `--ink-900` changed, update the swatch in `js/site-palette.js`.
3. Add: copy the `warm` block and its follow-up rules, rename, set every value (ramp, depth, `--smoke-0..3` as 6 digit hex, corridor); add to `names`, `labels`, `swatches`. Tell the owner Daily's rotation shifts.
4. Default palette (`'original'` in `js/site-palette.js`): change only on the owner's word.
5. Contrast: meta `--ink-400` at least 4.75:1 on `--paper`, `--ink-050`, `--depth-panel-b`; body and on-dark text at least 4.5:1 (checker snippet in the recipe).
6. Look: in the console `localStorage.setItem('mert-portfolio-palette-v1','<name>'); location.reload()`.
7. `python3 tools/check.py`, then visual regress on `index.html,websites.html` with `--palettes <name>` (command in the recipe).
8. Commit the CSS and JS together.
