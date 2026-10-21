# Batch 3: display control and contrast (branch opt/b3-display)

Findings: visual-1, motion-9, code-8, a11y-7, visual-2, motion-4, a11y-5, a11y-6.
Followed critic resolutions C2/C3/C4 as given in the task.

## What changed

**Display control (visual-1, code-8, a11y-7, motion-9)** - `js/site-palette.js`, `css/site-palette.css`
- Removed the fixed "Colors" pill. Replaced it with one **Display** control (Palette + Motion), mounted at runtime into
  the last `<footer>` (its inner `div`) and into the mobile menu overlay `#mt-menu`. Nothing floats over content at any width.
  The script finds both hosts at runtime and re-mounts through a MutationObserver if a runtime re-render replaces them,
  so it works with the current x-dc runtime and with static pre-rendered HTML. It also mounts into the websites.html footer.
- Type is `var(--font-mono)` at `--fs-meta` caps with `--ls-caps`, hairline borders from `--line-hairline`, pill radius
  from `--radius-pill`. No Arial anywhere (also fixed the Arial close button in `css/websites.css`). Fallback values
  are given for tokens websites.html does not load.
- Palette buttons keep `aria-pressed`. Swatches now show each palette's paper over its ink.
- **Motion** is a `role="switch"` button. It defaults to `prefers-reduced-motion` (and follows live changes) until the
  visitor chooses. An explicit choice is stored in `localStorage['mert-portfolio-motion-v1']` (`on`/`off`), with every
  access in try/catch. State goes on `html[data-motion]`, `window.PortfolioDisplay.motion()` and a `portfolio:motion` event.
- Wired into `js/media-playback.js` (hero and all looping videos), `js/depth-motion.js` (reveals and CSS via
  `data-depth-motion`), `js/shader-bg.js` (contact smoke parks on one still frame) and `js/photography-gallery.js`
  (corridor drift). Each one falls back to the media query when the Display script is not on the page (photography-lab).
  This covers WCAG 2.2.2.
- Corridor button: when motion is off it now reads "Motion off" (disabled) instead of the confusing disabled "Resume motion".
- Mobile menu: made it scroll on short phones (`justify-content: safe center`, `flex-shrink: 0`, close button fixed).

**Themes complete (visual-2, motion-4)**
- `css/depth.css`: stage and panel gradients now use `--depth-stage-hi/mid/lo` and `--depth-panel-a/b`. The `:root`
  defaults are the previous literals, so Original is pixel-identical. Depth labels use `var(--text-meta)` (light) and
  `var(--paper-a70)` (dark) instead of the hard-coded `#65676a` / `#bdc0c2`.
- `css/site-palette.css`: green, slate and warm now each set a full ramp with distinct 600/500/400 steps (400 holds
  4.75:1 or better on paper, ink-050 and the darkest panel stop), theme-derived 300/200/100/050/board, depth surfaces,
  smoke stops (`--smoke-0..3`) and corridor tokens. Warm `--ink-700` went from #584736 to #4a3c2e so 600 could sit
  between it and 500 (the warm `--accent` is still #584736).
- `js/shader-bg.js`: Original keeps the blue ramp. Other palettes read `--smoke-0..3` from `<html>` and re-upload when
  `data-card-theme` changes. The scrim is now `var(--ink-900)` at the same 0.58 opacity (rgba(10,10,10,.58) on Original).
- `js/photography-loader.js`: the corridor `:host` reads `--corridor-bg/paper/muted`, so there is no black seam on tinted palettes.
- `css/mobile.css`: the fixed mobile header uses `color-mix(in srgb, var(--ink-900) 88%, transparent)` (with the old
  rgba kept as a fallback), so it follows the palette.

**Contrast (a11y-5, a11y-6)**
- Original override is in `css/site-palette.css`, scoped to `html:not([data-card-theme]), html[data-card-theme="original"]`,
  not in `_ds`: `--text-meta: #666666` (5.74:1 on white, 4.99:1 on #EFEFEE) and `--paper-a45: rgba(255,255,255,.55)`
  (6.28:1 on ink-900, up from 4.48:1). Inside `.depth-panel` on Original, meta goes one step further to #5c5c5c, because the
  panel gradient runs down to #DEDFDF under a multiply grain.
- Contact: lifted the label color (`#contact.on-dark { --text-meta: var(--paper-a90) }`, and the Elsewhere rule label to
  paper-a90). The scrim is unchanged on Original. Theme smoke ramps are tuned so the labels clear 4.5:1.

## Verification (port 8945, analytics and formspree blocked)
Screenshots: `/tmp/claude-0/-home-user-merttureli-site/fe356c8b-023d-52dd-b7f6-84e925c9294d/scratchpad/opt/b3/before/` and `.../opt/b3/after/`
(named `<page>-<theme>-<width>-<spot>.png`, with spots top/stage/panel/corridor/contact/footer, for all 4 palettes at 1440 and 390;
plus `after/menu-390-*.png`, `after/menu-375x600-*.png`, `after/websites-1440-footer.png`). Axe output: `before/axe.json`, `after/axe.json`.
Scripts: `.../opt/b3/tools/{shoot,func,sample,misc}.js`.

- axe 4.10 color-contrast on index.html and projects/charger.html, for all 4 palettes at 1440 and 390: **before**, Original had 16 (index) and
  36 (charger) violations. **After**, there are 0 on every palette. The remaining axe violations (html-has-lang, landmark-one-main,
  region, page-has-heading-one) are page structure, which belongs to the prerender batch.
- Pixel re-sample (6 shader frames, label colour composited over sampled background). Contact labels, minimum: Original 5.10,
  green 5.89, slate 5.69, warm 5.48 (all at least 5.1 at 390 too). Before the theme ramps were tuned, slate and warm dipped to 4.1 to 4.3. Baseline was 2.6 to 3.9. Depth-panel `dt` minimum:
  Original 4.87, green 4.62, slate 4.59, warm 4.60.
- Functional: with no OS preference, motion starts on. Toggling it off pauses the hero video and the shader, and sets `data-depth-motion=off`. It persists across reload.
  With OS reduce, motion starts off. Toggling it on plays the hero and shader and persists. Palette changes from the footer and from the
  mobile menu sync both controls. No horizontal scroll at 390. There are no page errors.

## Snippets for the orchestrator (I did not edit these files)

1. **build-case.py** (visual-4 overlap). Generated case pages lose the head script on regeneration. Line ~457:
   - before: `'<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'`
   - after:  `'<!DOCTYPE html>\n<html lang="en">\n<head>\n<script src="../js/site-palette.js"></script>\n<meta charset="utf-8">\n'`
   (`css/site-palette.css` already arrives through the helmet copied from index.html.)
2. **index.html** (motion-9), static fallback for the corridor. The loader attaches a shadow root without a slot, so this is hidden once it mounts:
   - before: `<photo-corridor style="display:block;height:clamp(430px,48vw,740px)"></photo-corridor>`
   - after:  `<photo-corridor style="display:block;height:clamp(430px,48vw,740px)"><a href="photography-lab.html" style="display:grid;place-items:center;gap:var(--space-4);height:100%;color:var(--paper);font-family:var(--font-mono);font-size:var(--fs-meta);letter-spacing:var(--ls-caps);text-transform:uppercase;text-decoration:none"><img src="assets/photos/beyond/gallery/lighthouse-thumb.webp" alt="" loading="lazy" decoding="async" style="max-height:60%;width:auto">Explore photography</a></photo-corridor>`

## Left undone / notes
- Case pages have no mobile menu overlay: `js/mobile-nav.js` only builds it from `#` links. There, the Display control is reachable in
  the footer only. If the nav batch builds the overlay on case pages, the control mounts into it automatically.
- I did not apply the optional inline-style extraction from code-8 (it should follow the prerender).
- The Original-theme grey smoke option from motion-4 is not offered. Per C4, Original keeps the blue.
- The CSS `@media (prefers-reduced-motion)` rules in depth.css still apply when a visitor with OS reduce turns Motion on. Only
  micro-transitions are affected. Videos, shader, reveals and the corridor follow the switch.
- New UI copy: "Display", "Palette", "Motion", "On", "Off", "Motion off". The existing palette note text is unchanged.
