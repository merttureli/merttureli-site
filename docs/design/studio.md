# Studio design system (next/)

The Studio site is `next/index.html` + `next/css/studio.css` + `next/js/studio.js` (+ the 3D hero in
`next/js/hero3d.js` and `next/js/showreel/`). Every design value lives as a token in `next/css/tokens.css`.

| Doc | For |
|---|---|
| this file | tokens (color, type, space, layers, shape), breakpoints, markup contracts, how-tos |
| `docs/design/motion.md` | easings, durations, reduced motion, pausing, Lenis, timers (both sites) |
| `docs/design/components.md` | the components (buttons, pills, rules, cards...) with snippets |
| `docs/design/3d.md` | 3D look: materials, lights, units, budgets |
| `docs/design/studio-tokens-migration.md` | the one-time move of `studio.css` literals onto tokens |

**Status.** Migrated: `next/index.html` links `css/tokens.css` before `css/studio.css`, and `studio.css` has no
`:root` block and no color literals. New CSS uses the tokens below. `python3 tools/check.py --only tokens` proves a
later token rename moved no value.

## Use a token

```css
.thing { color: var(--ink-soft); font-size: var(--text-s); border-top: var(--hairline);
         transition: transform var(--dur-600) var(--ease); }
```

Rules:

- No new hex, rgba, px font size or duration literal in `studio.css`. Use a token, or add one to `tokens.css`
  (right group, value comment if not obvious) and use that.
- Do not rename tokens. Change a value in `tokens.css` and every use follows.
- A value used once by one component may stay literal (component sizes, fluid heading sizes). See "Left as
  literals" in the migration doc.
- Check: `grep -nE '#[0-9a-fA-F]{3,8}\b|rgba?\(' next/css/studio.css` prints nothing after the migration.

## Color

Light surfaces (the page):

| Token | Value | Role |
|---|---|---|
| `--paper` | `#e7e8ea` | page background. Also `<meta name="theme-color">` in `next/index.html`: change both |
| `--paper-2` | `#dcdee1` | raised panel: work frame, door hover fill, Beyond section, phone project media |
| `--paper-3` | `#d0d3d7` | ghost words on paper, photo placeholder, chip separators |
| `--ink` | `#121315` | text, dark sections, dark buttons |
| `--ink-2` | `#1d1f22` | hover fill on dark doors |
| `--ink-soft` | `#3a3d42` | body copy under headings |
| `--muted` | `#676b72` | labels, quiet links, credits |
| `--line` | `rgba(18, 19, 21, .16)` | hairlines on paper |
| `--signal` | `#ff4f00` | the one accent: focus ring, hover fills, dots, active menu button. Use sparingly |
| `--signal-ink` | `#b83700` | accent as text on paper (readable orange) |
| `--live` | `#1f9d55` | "available" status dot |
| `--pill-fill` | `rgba(255, 255, 255, .35)` | status pill background |
| `--scrim` | `rgba(18, 19, 21, .3)` | behind the open menu |
| `--shadow-soft`, `--shadow-clear` | `rgba(18, 19, 21, .13)`, `rgba(18, 19, 21, 0)` | hero contact shadow gradient |

Paper on ink (dark surfaces: `.web`, `.door--dark`, `.explorer__link`, `.menu__panel`):

| Token | Value | Role |
|---|---|---|
| `--line-dark` | `rgba(231, 232, 234, .16)` | hairlines on ink |
| `--paper-soft-hi` | `.75` alpha | lead copy on ink (explorer sub) |
| `--paper-soft` | `.7` alpha | body copy on ink (steps, menu foot) |
| `--paper-muted` | `.55` alpha | labels on ink |
| `--paper-muted-lo` | `.5` alpha | small labels on ink (menu label, spec card terms) |
| `--paper-ring` | `.22` alpha | ring around the menu button |
| `--paper-ghost` | `.14` alpha | outlined ghost word on ink |

Dark section recipe: `background: var(--ink); color: var(--paper);`, labels `var(--paper-muted)`, body
`var(--paper-soft)`, rules `.rule--dark` / `var(--hairline-dark)`, accent text `var(--signal)` (not `--signal-ink`).

## Type

Three voices. Fonts load in `studio.css` (`@font-face`); files in `studies/shared/fonts/` and `next/assets/fonts/`.

| Voice | Tokens | Class | Used for |
|---|---|---|---|
| Display (Archivo, variable width) | `--display`, `--display-stretch: 112%`, `--display-weight: 760` | `.display`, `.s-xl` | headings, uppercase, tight negative tracking |
| Mono (Martian Mono) | `--mono`, `--mono-stretch: 87.5%`, `--mono-tracking: .02em` | `.label`, `.link`, `.pill`, `.s-s` | labels, links, specs, uppercase |
| Serif italic (Bodoni Moda) | `--serif` | `<em class="serif">` (inline accent) | one or two words inside a heading or line |

Body is Archivo at `--text-l` (17px; 16px on phone), line-height 1.55.

Fixed sizes (fluid headings keep their own `clamp()`):

| Token | px | Typical use |
|---|---|---|
| `--text-l` | 17 | body, large round button label |
| `--text-m` | 16 | phone body, `.btn`, explorer sub |
| `--text-s` | 15 | secondary copy, nav, round button label, list lines |
| `--text-xs` | 14 | captions, footer |
| `--text-2xs` | 13 | fine print, phone captions, spec values |
| `--text-mono-l` | 12 | mono links, skip link, menu foot |
| `--text-mono-m` | 11 | `.label`, `.pill`, small drift words |
| `--text-mono-s` | 10.5 | spec terms (`dt`) |
| `--text-mono-xs` | 10 | superscripts, phone pills |

Snippets:

```html
<p class="label">Selected work</p>                         <!-- mono label -->
<h2 class="display">Things I <em class="serif">built</em></h2>
<a class="link" href="#work">See the work</a>              <!-- mono link, underline wipes on hover -->
```

## Space and layout

| Token | Value | Use |
|---|---|---|
| `--gutter` | `clamp(16px, 3.2vw, 48px)` | page side padding (`.wrap`, `.top`), grid column gap |
| `--wrap-max` | `1680px` | max content width (`.wrap`, explorer card) |
| `--space-14-28` | `clamp(14px, 2vw, 28px)` | cell padding between stat columns |
| `--space-20-40` | `clamp(20px, 3vw, 40px)` | inset of a corner button in a card |
| `--space-40-70` | `clamp(40px, 5vw, 70px)` | gap before a sub-block (tools list, contact line), work top padding |
| `--space-40-90` | `clamp(40px, 6vw, 90px)` | heading to grid (`.work__grid`, `.web__grid`) |
| `--space-50-90` | `clamp(50px, 6vw, 90px)` | between blocks in a dark section (spec card, CTA row) |
| `--space-70-140` | `clamp(70px, 9vw, 140px)` | section padding (proof bottom, websites) |
| `--space-80-160` | `clamp(80px, 10vw, 160px)` | large section padding (contact top, Beyond bottom) |

Section skeleton (copy this for a new section):

```html
<section class="NAME" id="NAME" aria-labelledby="NAME-title">
  <div class="wrap">
    <div class="rule"><span class="label">06 / Name</span><span class="label hide-s">Right label</span></div>
    <h2 id="NAME-title" class="display">Heading <em class="serif">accent</em></h2>
    <div class="NAME__grid" data-reveal><!-- content --></div>
  </div>
</section>
```

```css
.NAME { padding: var(--space-70-140) 0; }            /* dark: add background: var(--ink); color: var(--paper); */
```

## Breakpoints and input

`var()` does not work in media queries; copy the numbers.

| Query | Meaning |
|---|---|
| `@media (max-width: 760px)` | phone: one column, nav becomes the round menu button, smaller type |
| `.hide-s` | class that hides an element under 760px |
| `@media (max-width: 1100px)` | tablet: experience rows drop a column, spec card stacks |
| `@media (hover: hover)` | wrap every `:hover` rule in this (touch never sticks in a hover state) |
| `(hover: hover) and (pointer: fine)` | magnetic buttons only (`studio.js`) |
| `@media (prefers-reduced-motion: reduce)` | see motion.md |

Every hover effect also gets the same look on `:focus-visible` (see the end of `studio.css`).

## Layers and shape

| Token | Value | Use |
|---|---|---|
| `--z-top` | 20 | top bar |
| `--z-menu` | 30 | menu overlay |
| `--z-menu-btn` | 40 | round menu button (above the overlay) |
| `--z-skip` | 100 | skip link |
| `--radius-pill` | `999px` | pills, `.btn` |
| `--radius-focus` | `2px` | focus ring corner |
| `--hairline` | `1px solid var(--line)` | every rule and divider on paper |
| `--hairline-dark` | `1px solid var(--line-dark)` | same on ink |

Inside the hero, z-index 1 to 4 is local: drift words 1, stage 2, front words and foot 3, head 4.
Round things use `border-radius: 50%`.

## Markup contracts (data the CSS and JS read)

| Hook | Where | Contract |
|---|---|---|
| `.slot` `style="--x:5%;--y:52%;--d:.9"` | hero drift words | `--x`/`--y` position in % of the stage, `--d` scroll parallax depth (lift = `--d` x 180px over the hero). Phone positions are overridden in the 760px block by `nth-child`. Each slot holds three `<i>` words (one per word set); the showreel finds a project by the first text of an `<i>` |
| `.s-xl` `.s-l` `.s-m` `.s-s` | on `.slot` | drift word size voice |
| `data-reveal` | any block | rises in once when scrolled into view; always visible at rest |
| `data-par=".08"` | figures in Beyond | parallax factor (px per px from viewport center); negative moves the other way |
| `data-magnetic` | `.round`, `.btn`, nav links, menu button | follows the pointer on fine-pointer devices |
| `.round` `--size` | round buttons | diameter; `.round--l` 168px, `.round--xl` fluid |
| `data-project data-name data-tag` | work list items | drives the sticky stage image, ghost word and index |

## Design values in JS

These cannot be CSS tokens. Edit them in place (grep the name). Motion timers are in motion.md.

| Value | File: name | Now |
|---|---|---|
| Drift word sets | `studio.js`: `setWords`, `% 3` | 3 sets per slot |
| Magnetic strength | `studio.js`: `strength` | `.38` round, `.28` others, inner label `.5` of that |
| Marquee speed | `studio.js`: `x += dir * (...)` | `.045` px/ms, `.03` under 760px wide |
| Hero object scroll lift | `studio.js`: `object.style.translate` | `-90px` over the hero height |
| Austin clock | `studio.js`: `fmt` | `America/Chicago`, refresh 30 s |
| Rocket livery | `hero3d.js`: `livery()` | body `#d63b08`, bands `#890919`, letters `#fff` |
| Rocket materials and framing | `hero3d.js`: `loadModel`, `LAYOUTS` | see 3d.md |
| Studio lights and environment | `showreel/engine.js`: `addStudioLights`, `createStudioEnvironment` | see 3d.md |

## How do I

| Task | Do this |
|---|---|
| Change the accent | `--signal` (and `--signal-ink` for text on paper) in `tokens.css` |
| Change the page gray | `--paper` in `tokens.css` and `theme-color` in `next/index.html`; check `--paper-2`/`-3` still step |
| Make a hover slower | change the role duration in `tokens.css` (motion.md lists which token each hover uses) |
| Add a size, color or space | add it to the right group in `tokens.css`, then use `var(--name)` |
| Add a dark section | section skeleton + the dark section recipe above, `.rule--dark` |
| Add a drift word | add `<i>` to a `.slot` (three per slot), keep the first `<i>` text equal to the project's `word` if the showreel uses it |
| Check nothing moved | `python3 tools/check.py --fast`; pixel diff with `tools/visual-regress` on `next/index.html` (migration doc has the command) |
