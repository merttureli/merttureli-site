# Site tokens (current site)

Every color, size, space, radius, shadow, layer, breakpoint and timing the current site uses: where it is
defined, what to call it, and what is still a literal. Studio (`next/`) has its own system:
[studio.md](studio.md). Motion rules for both sites: [motion.md](motion.md). Palettes: [../recipes/palette.md](../recipes/palette.md).

## How do I

| I want to | Do this |
|---|---|
| Use a color that follows the palettes and dark sections | `color: var(--text-body)` (or `--text-display`, `--text-muted`, `--text-meta`, `--line-hairline`, `--line-strong`, `--surface-page`). Never a hex. |
| Use a fixed color (same in every palette) | add a name to `css/tokens.css`, then `var(--color-...)` |
| Space things | `gap: var(--space-5)`. Scale: 4 8 12 16 24 32 48 64 96 128 192 256 px = `--space-1` to `--space-12` |
| Set type | `font: 400 var(--fs-meta)/var(--lh-meta) var(--font-mono); letter-spacing: var(--ls-caps); text-transform: uppercase` (a label) |
| Make a tap target | `min-height: var(--touch-target)` (44px) |
| Draw a focus ring | `outline: var(--focus-ring-width) solid currentColor; outline-offset: var(--focus-ring-offset)` |
| Add a new token | add it to `css/tokens.css` (new name only, fixed value, one comment). It loads on every page through `css/fonts.css`. |
| Change a palette color | `css/site-palette.css`, see [palette.md](../recipes/palette.md). Never edit `_ds/`. |
| Hide something on phones | `@media (max-width: 860px) { ... }` (the site breakpoint; see Breakpoints) |
| Find literals that should be tokens | `grep -nE -e '#[0-9a-fA-F]{3,8}\b' -e '[0-9]+px' css/<file>.css`, then check the tables below |
| Change "the card" corner radius | there is no one card: see "Radius by component" below and change the token for the piece the owner means |
| Prove a token swap changed nothing | `python3 tools/build.py --check`, then visual-regress on the pages that load the file (command at the end) |

## Where tokens live

| Layer | File | Holds | Edit? |
|---|---|---|---|
| Design-system export | `_ds/mert-t-reli-design-system-56763c60-2006-4913-8e27-d9c1c8053e6d/tokens/{colors,typography,spacing,layout,effects,motion}.css` | ink ramp, semantic colors, `.on-dark`, type scale, spacing, layout, z, radius, shadow, motion | No. A re-export would overwrite it. Override in the files below. |
| Fonts | `css/fonts.css` | `@font-face`, `--font-name`, `--font-display`, `--font-body`, `--font-mono` | Yes |
| Site tokens | `css/tokens.css` | the site's own names (table below) | Yes, new names only |
| Palettes | `css/site-palette.css` | per-theme ink ramp, alpha steps, accent, depth, smoke, corridor; Original contrast fix | Yes |
| Depth surfaces | `css/depth.css` `:root` | `--depth-stage-hi/mid/lo`, `--depth-panel-a/b` (palettes retint them) | Yes |
| Stand-alone pages | `css/photography-lab.css`, `404.html` and `hi/index.html` inline `<style>` | their own small palettes (below) | Yes, in place |

`css/tokens.css` is pulled in by `@import url("tokens.css")` at the top of `css/fonts.css`, because `css/fonts.css`
is the one stylesheet every page links (home, case studies, websites, privacy, 404, hi, photography lab; the
src templates reach it through `_ds/.../tokens/fonts.css`). Cost: one small chained request.

### Which page loads what

| Page | `_ds` tokens | `css/tokens.css` | Site CSS |
|---|---|---|---|
| `index.html` (from `src/index.html`) | all | yes | rocket, interaction-polish, website-entry, mobile, depth, site-palette, static-interactions |
| `projects/*.html` (from `build-case.py`) | all | yes | interaction-polish, mobile, depth, site-palette, static-interactions |
| `websites.html` | all | yes | interaction-polish, websites, website-studies, site-palette |
| `privacy.html` | all but motion | yes | none (inline styles) |
| `photography-lab.html` | none | yes | photography-lab |
| `404.html`, `hi/index.html` | none | yes | inline `<style>` only |

So a `_ds` token (`--space-*`, `--fs-*`, ...) works in every file above except `photography-lab.css`, 404 and hi.
A `css/tokens.css` token works everywhere.

## Safe and scoped tokens

A token is safe to put in place of a literal only if nothing re-defines it in a narrower scope. These do:

| Token | Changed by | So |
|---|---|---|
| `--ink-*`, `--paper`, `--board`, `--ink-a*`, `--paper-a*`, `--accent`, `--accent-contrast`, `--depth-*` | palettes (`html[data-card-theme]`) | `#0a0a0a` is not `var(--ink-900)`: in Green it is `#1c2520` |
| `--text-*`, `--line-*`, `--surface-page`, `--accent` | `.on-dark` (and `#contact.on-dark`, `.depth-panel`, `#mt-menu .site-display`) | use them for color that should flip on dark plates |
| `--text-meta`, `--paper-a45` | Original contrast fix (`#666666`, `.55`) | the exported value is not what renders |
| `--dur-3` to `--dur-6`, `--stagger` | `prefers-reduced-motion: reduce` (become 1ms / 0ms) | never swap a literal `.48s` for `var(--dur-3)` |
| `--font-display`, `--fs-display-2` | the home page `h1` (inline style in `src/index.html` head) | |

Never alias a scoped token in `:root` (`--x: var(--text-meta)`): it resolves on `:root` and ignores the scope.
Everything in `css/tokens.css` is fixed.

## Site tokens (`css/tokens.css`)

| Token | Value | Use |
|---|---|---|
| `--touch-target` | 44px | min tap size: buttons, menu, close, calendar |
| `--focus-ring-width` | 2px | the 2px focus outlines (websites.css page rings are 1px, from `_ds` base) |
| `--focus-ring-offset` | 4px | the common offset (3, 5, 6px rings keep their literal) |
| `--z-menu` | 9999 | phone menu overlay `#mt-menu` |
| `--z-loader` | 2147483646 | `.site-loading` indicator |
| `--fs-ui-mono` | 11px | mono UI text: browser-frame bars, index chips, "try" pills |
| `--radius-card` | 12px | `.websell-frame`, `.charger-launch-cue` (desktop; the phone frame uses `--radius-phone`) |
| `--radius-phone` | 36px | `.websell-frame` at phone width (`css/website-entry.css` `@media`), the frame drawn as a phone body |
| `--radius-phone-screen` | 29px | its `.websell-screen` (`--radius-phone` minus the 7px bezel; change both together) |
| `--color-live` | #ff5a1f | "live" dot in the home websites frame |
| `--color-error` | #842a25 | inquiry form error text |
| `--frame-tint` / `--frame-fade` / `--frame-swap` | .3s / .4s / .22s | browser frame (home `.websell-*` and websites `.study-*`): background change, page fade-in, swap fade |
| `--frame-load-cycle` / `--frame-blink-cycle` | 1.1s / 1s | frame loader sweep, status dot blink |
| `--study-<name>-bg` / `-fg` | hangar #e5e4e0 / #141518, launch #0a0b0d / #ecebe6, studio #e7e8ea / #121315, specimen #efefec / #0d0d0c | first paint of each study in the frame; must match `studies/<name>/` |

## Design-system tokens (`_ds/.../tokens/`)

### Color (Original palette)

| Group | Tokens |
|---|---|
| Ink ramp | `--ink-900` #0A0A0A, `-800` #141414, `-700` #2B2B2B, `-600` #454545, `-500` #6B6B6B, `-400` #8C8C8C, `-300` #A8A8A8, `-200` #C9C9C9, `-100` #DEDEDE, `-050` #EFEFEE, `--paper` #FFF, `--board` #D9D9D9 |
| Alpha | `--ink-a80/a55/a30/a12/a06` (ink at .80 .55 .30 .12 .06), `--paper-a90/a70/a45/a18/a08` |
| Surface | `--surface-page` paper, `--surface-raised` paper, `--surface-sunken` ink-050, `--surface-board` board, `--surface-inverse` ink-900 |
| Text | `--text-display` ink-900, `--text-body` ink-700, `--text-muted` ink-500, `--text-meta` ink-400 (renders #666666, see above), `--text-inverse` paper, `--text-inverse-muted` paper-a70 |
| Line | `--line-hairline` ink-a12, `--line-strong` ink-900, `--line-inverse` paper-a18 |
| Accent | `--accent` #111111, `--accent-contrast` paper (achromatic by decision) |
| Scrim | `--scrim-top` rgba(0,0,0,.42), `--scrim-bottom` rgba(0,0,0,.05) |
| `.on-dark` | surface ink-900, display paper, body paper-a90, muted paper-a70, meta paper-a45, hairline paper-a18, strong paper, accent #FFF |

Palettes (Card green, Slate, Warm) set the whole ramp, alphas, accent, depth, `--smoke-0..3` and
`--corridor-*`: values in `css/site-palette.css`, swatches in `js/site-palette.js`.

### Type

| Group | Tokens |
|---|---|
| Families (`css/fonts.css`) | `--font-name` Archivo wdth 116 wght 600 (the name), `--font-display` Archivo wdth 106 (headings, nav), `--font-body` Archivo wdth 100, `--font-mono` Martian Mono at 85% size-adjust |
| Display sizes | `--fs-display-1` clamp(54px, 9.7vw, 155px), `-2` clamp(40px, 6.7vw, 108px), `-3` clamp(30px, 4.4vw, 71px), `--fs-title-1` clamp(24px, 2.7vw, 44px) |
| Fixed sizes | `--fs-title-2` 32, `--fs-title-3` 24, `--fs-body-lg` 18, `--fs-body` 16, `--fs-body-sm` 14, `--fs-meta` 12, `--fs-meta-sm` 10 (px) |
| Line height | `--lh-display` .92, `--lh-title` 1.08, `--lh-body` 1.62, `--lh-meta` 1.4 |
| Tracking | `--ls-display` -.03em, `--ls-title` -.015em, `--ls-body` 0, `--ls-caps` .18em, `--ls-caps-wide` .32em, `--ls-nav` .12em |
| Weight | `--fw-light` 300, `--fw-regular` 400, `--fw-medium` 500, `--fw-semibold` 600, `--fw-bold` 700 |
| Measure | `--measure` 62ch, `--measure-narrow` 44ch |

### Space, layout, layers

| Group | Tokens |
|---|---|
| Space | `--space-0` 0, `-1` 4, `-2` 8, `-3` 12, `-4` 16, `-5` 24, `-6` 32, `-7` 48, `-8` 64, `-9` 96, `-10` 128, `-11` 192, `-12` 256 (px) |
| Rhythm | `--gutter` space-5, `--page-margin` clamp(24px, 5vw, 88px), `--section-y` clamp(96px, 14vh, 192px), `--stack-tight` space-3, `--stack` space-5, `--stack-loose` space-8 |
| Layout | `--max-width` 1680px, `--max-text` 720px, `--header-h` 88px, `--rail-w` 48px, `--grid-columns` 12 |
| Z | `--z-base` 0, `--z-media` 1, `--z-content` 10, `--z-rail` 40, `--z-header` 50, `--z-overlay` 90; site: `--z-menu` 9999, `--z-loader` 2147483646 |

### Radius, border, shadow, effects

| Group | Tokens |
|---|---|
| Radius | `--radius-xs` 2, `-sm` 4, `-md` 8, `-lg` 20 (the panel curve), `-xl` 40, `-2xl` 64, `-pill` 999 (px); site: `--radius-card` 12, `--radius-phone` 36, `--radius-phone-screen` 29 |
| Border | `--border-hair` 1px hairline, `--border-strong` 1px strong, `--border-thick` 2px strong |
| Shadow | `--shadow-panel` 0 24px 60px -20px ink .28, `--shadow-float` 0 40px 120px -32px ink .34; depth.css adds `--depth-shadow` on `.depth-design` |
| Scrim | `--scrim-hero`, `--scrim-bottom-up` |

### Radius by component

| What the owner may call it | Element | Token | Defined in |
|---|---|---|---|
| browser frame, website card (home) | `.websell-frame`, desktop | `--radius-card` 12px | `css/tokens.css` |
| phone frame (home, phone width) | `.websell-frame` + `.websell-screen` | `--radius-phone` 36px, `--radius-phone-screen` 29px | `css/tokens.css` |
| "Explore in 3D" cue | `.charger-launch-cue` | `--radius-card` 12px | `css/tokens.css` |
| panels, case study cards | `.depth-panel`, `cards()` panels (components.md S11) | `--radius-lg` 20px | `_ds` export (override in `css/tokens.css`, never edit `_ds/`) |
| render stage (home work, case heroes) | `.depth-stage` | literal 14px | `css/depth.css` |
| study frame (websites.html) | `.study-frame` | `--radius-md` 8px | `_ds` export |
| study phone frame (websites.html, phone width) | `.study-frame` + `.study-screen` | literals 34px and 27px (not the home phone's 36/29) | `css/website-studies.css` `@media` |
| pills, buttons | `.ds-button`, belt pills | `--radius-pill` 999px | `_ds` export |
| Grain, blur | `--grain-url`, `--grain-opacity` .28, `--grain-opacity-strong` .5, `--blur-glass` saturate(120%) blur(14px), `--blur-heavy` |

### Motion

| Token | Value |
|---|---|
| `--ease-out` | cubic-bezier(0.22, 1, 0.36, 1) (not the `ease-out` keyword) |
| `--ease-in-out` | cubic-bezier(0.65, 0, 0.35, 1) |
| `--dur-1` ... `--dur-6` | 120, 240, 480, 780, 1200, 2400 ms (3 to 6 become 1ms under reduced motion) |
| `--stagger` | 90ms (0 under reduced motion) |
| `--t-hover` / `--t-enter` / `--t-media` | dur-2 / dur-4 / dur-5 with `--ease-out` |

## Breakpoints

Custom properties do not work inside `@media`, so these are names for the docs. Keep CSS and JS in step.

| Name | Query | CSS | JS |
|---|---|---|---|
| phone (site) | `max-width: 860px` / `min-width: 861px` | mobile, depth, rocket, site-palette, websites | `js/mobile-nav.js` (`MOBILE`), `js/rocket-flight.js`, `js/website-inquiry.js` |
| frame narrow | `max-width: 1000px` | website-entry, websites | |
| frame phone | `max-width: 700px` | website-entry, website-studies, websites | `js/home-websites.js`, `js/website-studies.js` |
| studies picker | `max-width: 1100px`, `900px` | website-studies | |
| wide hero | `min-width: 1600px` | websites | |
| phone video | `max-width: 720px` | | `js/media-playback.js` |
| photography | `max-width: 650px` | photography-lab | `js/photography-lab.js`, `js/photography-gallery.js` |
| small phone | `max-width: 360px` | `hi/index.html` | |
| pointer | `(hover: hover) and (pointer: fine)`, `(hover: hover)` | depth, rocket, website-entry, website-studies | `js/rocket-flight.js` |
| motion | `prefers-reduced-motion: reduce` plus `html[data-motion="off"]` | most files | see [motion.md](motion.md) |

## Stand-alone palettes (left in place)

| Page | Tokens | Why not shared |
|---|---|---|
| `photography-lab.html` (`css/photography-lab.css`) | `--bg` #0a0a0a, `--paper` #eeeae4, `--muted` #a39f99, `--line` #ffffff26, `--accent` #c67650 | its own dark warm look, no `_ds`; same values feed the corridor fallbacks in `js/photography-loader.js` |
| `404.html` | `--ink` #0A0A0A, `--paper` #FFF, `--p90/p70/p45/p14` paper alphas, `--body/--display/--mono` stacks, `--ease` = `--ease-out` | must render with nothing but `/css/fonts.css`, from any path |
| `hi/index.html` | `--bg` #1c2520, `--ink` #e4e8dc, `--quiet` #b9c3b3, `--line` #53604f | the business-card page, in the Card green palette values |

Do not reuse these short names (`--bg`, `--ink`, `--line`, `--muted`, `--quiet`, `--p*`) in `css/tokens.css`:
it loads on those pages too.

## What was migrated

81 literals became tokens, each a pure rename (same value text, token defined on `:root` and never re-scoped):

| File | Now uses |
|---|---|
| `css/website-entry.css` | study pairs, `--color-live`, frame timings, `--fs-ui-mono`, `--fs-meta`, `--radius-card`, `--radius-sm`, focus ring, `--touch-target`, `--space-1/2/4` |
| `css/website-studies.css` | study pairs, frame timings, `--fs-ui-mono`, `--fs-body-sm`, `--radius-sm`, focus ring, `--space-2` |
| `css/websites.css` | `--touch-target` (8 controls), `--fs-meta`, `--fs-body-sm`, `--fs-body`, `--fs-ui-mono`, `--lh-meta`, `--ls-caps-wide`, `--color-error`, `--space-2/3` |
| `css/mobile.css` | `--z-menu`, `--touch-target`, `--ls-nav`, `--space-3`, focus ring |
| `css/rocket.css` | `--touch-target`, `--space-3/4`, focus ring |
| `css/depth.css` | `--radius-card`, `--radius-lg`, focus ring width |
| `css/site-palette.css` | `--touch-target`, focus ring width |
| `css/interaction-polish.css` | `--z-loader`, `--space-5` |

## What was not migrated, and why

| Literal | Where | Why |
|---|---|---|
| Ink-colored hex like `#0a0a0a`, `#000b`, `#ffffff24`, `rgba(10,10,10,.78)` | depth.css shadows and highlights, website-entry, mobile, websites backdrop | fixed on purpose: `var(--ink-900)` would retint them in other palettes. Palette fixes are written per theme in site-palette.css. |
| Hero gradients, smoke, corridor colors | depth.css, site-palette.css | one-off art direction, already per palette |
| Off-scale px (10, 13, 14, 15, 18, 22, 26, 28, 35, 72 ...) | everywhere | optical sizes with no matching token; naming each would add tokens used once |
| Glyph sizes (`32px` close, `34px` menu links, `24px` arrows) | mobile, websites, photography-lab | display glyphs, not the type scale |
| One-off timings: rocket build `.85s` / `.12s` delay, `.22s` / `.32s` fades, belt 90s, inquiry `.45s` / `.3s`, menu `.22s` | rocket, websites | single uses; motion rules in [motion.md](motion.md) |
| Phone frame radii 36/29 and 34/27px | website-entry, website-studies | the two frames differ by 2px; unifying them is a visible change |
| `z-index: 1, 2, 3, -1, 100` | local stacking | local stacking contexts, not page layers |
| `photography-lab.css`, `404.html`, `hi/index.html` | | stand-alone pages (above); 404 and hi inline styles stay self-contained |
| `assets/charger-explorer/launcher.css` | home | belongs to the explorer bundle |
| Inline `style=""` on `index.html`, `projects/*.html` | generated | rendered by the `_ds` components; they already read `_ds` tokens |
| Fallbacks like `var(--t-hover, .24s)`, `var(--paper-a45, #ffffff73)` | rocket, site-palette | the token always resolves; harmless |

## Known issues found (not fixed: each is a visible change)

| Issue | Where |
|---|---|
| The websites.html "live" dot uses `var(--accent, #ff5a1f)`. `--accent` is always set (#111111 in Original; the frame is not inside `.on-dark`), so the dot is near black on the dark frame bar, while the home frame shows `--color-live` orange. Fix if wanted: `var(--color-live)`. | `css/website-studies.css` `.study-frame[data-state=live] .study-state-dot` |
| Phone breakpoints disagree: 860 (site), 720 (`js/media-playback.js`), 700 (frames), 650 (photography). | see Breakpoints |
| The `css/fonts.css` header comment says Archivo Display is wdth 110; its `@font-face` pins `font-stretch: 106%` (and `_ds/.../tokens/typography.css` says 106). Comment only. | `css/fonts.css` |

## Verify a token change

```sh
python3 tools/build.py --check
B=$(mktemp -d); git archive HEAD | tar -x -C "$B"
node tools/visual-regress/visual-regress.js --baseline "$B" --candidate . --out /tmp/regress \
  --pages 'index.html,websites.html,privacy.html,404.html,hi/index.html,projects/*.html' \
  --widths 390,1440 --palettes original,slate
```

Add `photography-lab.html` with `--mask .corridor` if `css/fonts.css` or `css/tokens.css` changed (its 3D
corridor moves between shots). The home websites frame and websites.html studies load live iframes; a differing
shot there is usually the iframe still loading, so rerun that page alone before trusting it.
