# Components

Every repeated piece of UI on both sites: what it is, where it is used, the snippet to paste, its variants and the rules.
See them rendered live with the real CSS in [catalog.html](catalog.html) (open it from a local server, see below).

| Site | Pages | How a component is written |
|---|---|---|
| Site (merttureli.com) | `index.html`, `projects/*.html` | Generated. Write `<x-import component-from-global-scope="MertTReliDesignSystem_56763c.Name" ...>` in `src/index.html`, or case data in `content/projects/<slug>.json`. Then `python3 tools/build.py`. |
| Site, plain pages | `websites.html` (and new plain pages) | The same look as classes: `.ds-header`, `.ds-meta`, `.ds-display`, `.ds-title`, `.ds-lead`, `.ds-button`, `.ds-link`, `.ds-footer` from `css/websites.css`. |
| Studio | `next/index.html` | Hand-written HTML, short BEM classes (`.block`, `.block__part`, `.block--variant`) from `next/css/studio.css`. |

Tokens behind these: `docs/design/site-tokens.md` (site), `docs/design/studio.md` (Studio), motion rules in `docs/design/motion.md`.

## How do I...

| Task | Do this |
|---|---|
| See every component | `python3 -m http.server 8000` from the repo root, open http://127.0.0.1:8000/docs/design/catalog.html |
| Copy a snippet | In the catalog, pick the tab (`src/index.html`, `content/...json`, `websites.html` or `HTML`) and press Copy |
| Add a component to the home page | Paste the `src/index.html` snippet, then `python3 tools/build.py` and `python3 tools/check.py` |
| Change a case study | Edit `content/projects/<slug>.json` (see `docs/recipes/content.md`), then `python3 tools/build.py` |
| Check the site palettes | Catalog, Site section, Palette buttons (Original, Green, Slate, Warm) |
| Check a component at phone width | Catalog preview bar: `390` or `768` |
| Add a component to the catalog | See [Catalog maintenance](#catalog-maintenance) |

Never edit `index.html` or `projects/*.html` by hand: they are rebuilt from `src/` and `content/`.
The "Built HTML (read only)" tab in the catalog shows what the build writes, for reference.

## Find by what you want to change

Same table as the top of [catalog.html](catalog.html#find).

| I want to change | Look at | Edit here |
|---|---|---|
| Studio accent (the orange) | T06, T17 | `--signal`, `--signal-ink` in `next/css/tokens.css` |
| Site colors | catalog Palette buttons | `css/site-palette.css` ([palette.md](../recipes/palette.md)) |
| Site corner radius | S11 (panels) | frames and cues `--radius-card`, the phone frame `--radius-phone` in `css/tokens.css`; panels `--radius-lg` ([site-tokens.md](site-tokens.md), "Radius by component") |
| Site nav links | S01 | `nav` in `src/index.html`; case pages `NAV` in `build-case.py` |
| Studio nav links | T01, T02 | `.top__nav` and `.menu` in `next/index.html` |
| A Studio project (text, specs, image) | T11 | `<li class="project">` and its stage `<img data-key>` in `next/index.html` |
| Case study figures | S10 | `"kind": "stats"` in `content/projects/<slug>.json`, then build |
| Add a Studio section with a component | T03 + T13, T09, T15 | `python3 tools/new.py section NAME`, paste the snippet into `NAME__body` ([new-page.md](../recipes/new-page.md)) |
| Mark a line for the owner | S15 | `python3 tools/check-flags.py --next-id SLUG` ([flags.md](../recipes/flags.md)) |

Catalog links by id work too: `catalog.html#T13` opens the Toolkit list.

## Index

| # | Component | Used in | Source | Live |
|---|---|---|---|---|
| S01 | [Site header](#s01-site-header) | home, case studies, websites | `SiteHeader`; `.ds-header` | [catalog](catalog.html#site-header) |
| S02 | [Button](#s02-button) | everywhere | `Button` + `[data-depth-button]`; `.ds-button`; `.websell-cta` | [catalog](catalog.html#site-button) |
| S03 | [Meta label and caption](#s03-meta-label-and-caption) | everywhere | `Meta`, `Caption`; `.ds-meta`, `.ds-index` | [catalog](catalog.html#site-meta) |
| S04 | [Section rule](#s04-section-rule) | home, case studies | `Rule` | [catalog](catalog.html#site-rule) |
| S05 | [Display heading and body](#s05-display-heading-and-body) | every title | `DisplayHeading`; `.ds-display`, `.ds-title`, `.ds-lead` | [catalog](catalog.html#site-heading) |
| S06 | [Spec list](#s06-spec-list) | home, case briefs | `SpecList` | [catalog](catalog.html#site-spec) |
| S07 | [Media frame](#s07-media-frame) | home work, case galleries | `MediaFrame` | [catalog](catalog.html#site-media) |
| S08 | [Render stage](#s08-render-stage) | home work, case heroes | `.depth-stage` + `js/media-playback.js` | [catalog](catalog.html#site-stage) |
| S09 | [Work entry](#s09-work-entry) | home `#work` | composite | [catalog](catalog.html#site-work) |
| S10 | [Stats band](#s10-stats-band) | case studies | `stats_band()` | [catalog](catalog.html#site-stats) |
| S11 | [Panels and ruled list](#s11-panels-and-ruled-list) | case studies | `cards()`, `bullets()` | [catalog](catalog.html#site-lists) |
| S12 | [Pills and skills belt](#s12-pills-and-skills-belt) | home | `.skills-belt*` | [catalog](catalog.html#site-belt) |
| S13 | [Hero chrome](#s13-hero-chrome) | home, case heroes | `Grain`, `SocialRail`, `Caption`, `ScrollCue` | [catalog](catalog.html#site-chrome) |
| S14 | [Footer](#s14-footer) | all site pages | `Wordmark` + `Meta`; `.ds-footer` | [catalog](catalog.html#site-footer) |
| S15 | [Copy flag](#s15-copy-flag) | site copy under review | `mark.flag` | [catalog](catalog.html#site-flag) |
| T01 | [Top bar](#t01-top-bar) | Studio | `.top`, `.wordmark`, `.top__nav` | [catalog](catalog.html#studio-top) |
| T02 | [Menu button and panel](#t02-menu-button-and-panel) | Studio | `.menu-btn`, `.menu` | [catalog](catalog.html#studio-menu) |
| T03 | [Label and section rule](#t03-label-and-section-rule) | Studio | `.label`, `.rule` | [catalog](catalog.html#studio-rule) |
| T04 | [Display type and serif accent](#t04-display-type-and-serif-accent) | Studio | `.display`, `.serif`, `.manifesto` | [catalog](catalog.html#studio-display) |
| T05 | [Text link](#t05-text-link) | Studio | `.link` | [catalog](catalog.html#studio-link) |
| T06 | [Round button](#t06-round-button) | Studio | `.round` | [catalog](catalog.html#studio-round) |
| T07 | [Pill button](#t07-pill-button) | Studio | `.btn` | [catalog](catalog.html#studio-btn) |
| T08 | [Status dot and pill](#t08-status-dot-and-pill) | Studio | `.dot`, `.pill` | [catalog](catalog.html#studio-dot) |
| T09 | [Proof stats](#t09-proof-stats) | Studio | `.stats` | [catalog](catalog.html#studio-stats) |
| T10 | [Doors](#t10-doors) | Studio | `.door`, `.arrow` | [catalog](catalog.html#studio-door) |
| T11 | [Project entry](#t11-project-entry) | Studio | `.project`, `.specs` | [catalog](catalog.html#studio-project) |
| T12 | [Experience rows](#t12-experience-rows) | Studio | `.rows`, `details` | [catalog](catalog.html#studio-rows) |
| T13 | [Toolkit list](#t13-toolkit-list) | Studio | `.tools`, `.chips` | [catalog](catalog.html#studio-chips) |
| T14 | [Photo scatter](#t14-photo-scatter) | Studio | `.scatter`, `.ph` | [catalog](catalog.html#studio-photo) |
| T15 | [Steps and spec card](#t15-steps-and-spec-card) | Studio | `.steps`, `.spec-card` | [catalog](catalog.html#studio-steps) |
| T16 | [Drift words](#t16-drift-words) | Studio | `.drift`, `.slot` | [catalog](catalog.html#studio-drift) |
| T17 | [Name marquee](#t17-name-marquee) | Studio | `.marquee` | [catalog](catalog.html#studio-marquee) |
| T18 | [Feature link](#t18-feature-link) | Studio | `.explorer` | [catalog](catalog.html#studio-explorer) |
| T19 | [Footer](#t19-footer) | Studio | `.foot` | [catalog](catalog.html#studio-foot) |

## Rules for both sites

- Monochrome plus one accent. Site: no hue at all (the photos carry color). Studio: the signal orange (`--signal` in `next/css/tokens.css`) for one thing per view.
- Small mono caps for anything measured or filed; big display caps for titles; little in between.
- Separators in labels are ` / `. Indices are zero-padded (`01`). No full stop on labels or captions.
- Hover is the only state change: no press effect, no ripple. Focus always visible.
- Motion respects `prefers-reduced-motion` (site: also the Display control, `html[data-motion="off"]`).
- Copy rules: `python3 check-writing.py <file>`; US spelling; no em or en dashes.

---

## Site

The `NS` below is `MertTReliDesignSystem_56763c`. Template snippets go in `src/index.html`; `hint-size` is a layout hint for the runtime, copy it from a similar element.

### S01 Site header

Wordmark left, four links right, a Menu button below 861px. Floats over the dark hero on home and case pages; sits on a hairline on the websites page.

- Used in: `index.html`, `projects/*.html`, `websites.html`
- Built from: `SiteHeader` (_ds); hover in `css/interaction-polish.css`; phone rules in `css/mobile.css`; `.ds-header` in `css/websites.css`
- Edit: links in `nav` inside `renderVals()` in `src/index.html`; case pages: `NAV` in `build-case.py`

```html
<x-import component-from-global-scope="MertTReliDesignSystem_56763c.SiteHeader" items="{{ nav }}" active="index" inverse="true" floating="true" dc-props="{{ headerRow }}" hint-size="100%,88px"></x-import>
```
```html
<!-- plain page -->
<header class="ds-header">
  <a class="ds-wordmark" href="index.html">MERT TURELI</a>
  <nav class="ds-nav" aria-label="Main navigation"><a href="index.html#work">Work</a><a href="index.html#beyond">Beyond</a><a href="websites.html" aria-current="page">Websites</a><a href="index.html#contact">Contact</a></nav>
  <button class="ds-menu-button" id="open-menu" type="button" aria-label="Menu" aria-haspopup="dialog" aria-controls="site-menu" aria-expanded="false"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>
</header>
```

| Variant | Effect |
|---|---|
| `inverse="true"` | white type for a dark hero; omit for ink on paper |
| `floating="true"` | absolute, no hairline |
| `aria-current="page"` (plain) | keeps the underline on the current link |

Do: same four links in the same order everywhere. Case pages link back with `../index.html#section`.
Don't: add a fifth link (phone menu and desktop row assume four); edit the built header.

### S02 Button

Pill call to action in mono caps with a trailing arrow (nudges 3px on hover) and a 2px lift from `css/depth.css`.

- Used in: home hero, work entries, contact; case heroes; websites page; home Websites block
- Built from: `Button` (_ds), `[data-depth-button]` in `css/depth.css`, hover in `css/interaction-polish.css`; `.ds-button` in `css/websites.css`; `.websell-cta` in `css/website-entry.css`
- Edit: `src/index.html`; case pages: `button()` in `build-case.py`

```html
<x-import component-from-global-scope="MertTReliDesignSystem_56763c.Button" data-depth-button="outline" variant="outline" trailing="→" href="projects/robo-catcher.html#mechanism-tour" hint-size="220px,44px">See the mechanism</x-import>
<x-import component-from-global-scope="MertTReliDesignSystem_56763c.Button" data-depth-button="glass" variant="glass" trailing="→" href="#charger" hint-size="180px,44px">See the work</x-import>
```
```html
<!-- plain page -->
<a class="ds-button ds-button--solid" data-depth-button="outline" href="#inquiry">Find a day to talk <span aria-hidden="true">→</span></a>
<a class="ds-button" data-depth-button="outline" href="#inquiry">Get in touch <span aria-hidden="true">→</span></a>
```

| Variant | Where |
|---|---|
| `glass` | only over dark plates or photos |
| `outline` | paper, and `.on-dark` sections (the tokens flip) |
| `solid`, `ghost`, `link` | exist in the DS, unused today |
| `.ds-button--solid` | the one filled button on a plain page |
| `.websell-cta`, `--solid` | home Websites block only (on ink) |

Do: two to four words; `→` for in-site, `↗` for a page that opens elsewhere; one primary per block; `data-depth-button` equal to `variant`.
Don't: add shadows, colors or a press effect; use glass on white; hand-write the inline styles on the home page.

### S03 Meta label and caption

Small mono caps for eyebrows, credit lines and captions. An optional index prints in full ink before the text.

- Used in: every section; `.ds-meta`, `.ds-index` on the websites page
- Built from: `Meta`, `Caption` (_ds); `[data-depth-label]` color in `css/depth.css`
- Edit: `src/index.html`; case pages: `meta()` in `build-case.py`, `eyebrow` in the content JSON

```html
<x-import data-depth-label="true" component-from-global-scope="MertTReliDesignSystem_56763c.Meta" index="01" hint-size="240px,16px">Airframe / Payload</x-import>
<x-import component-from-global-scope="MertTReliDesignSystem_56763c.Meta" tone="muted" hint-size="100%,16px">Union College Rocket Team, 2026 / Captain and chief engineer / First place</x-import>
<x-import component-from-global-scope="MertTReliDesignSystem_56763c.Caption" index="02" hint-size="100%,16px">84 part assembly</x-import>
```
```html
<span class="ds-meta ds-meta--wide">Web design / Austin, Texas</span>
<span class="ds-index" aria-hidden="true">01</span>
```

Variants: `tone` = meta (default) / `muted` / `strong` / `body`; `wide="true"` opens tracking to 0.32em; `data-depth-label` makes it follow `.on-dark` and the palettes.
Do: ` / ` separators, zero-padded indices, no full stop.
Don't: put sentences in a label; use a label as a section's only heading.

### S04 Section rule

A hairline with a mono label left and a numeral right. With `data-heading="2"` the build turns the label into the section's `<h2>`.

- Used in: home About, What I work with, Contact; every case section
- Built from: `Rule` (_ds), `[data-depth-rule]` in `css/depth.css`
- Edit: `src/index.html`; case pages: each section's `label` (`rule()` in `build-case.py`)

```html
<x-import data-depth-rule="true" data-heading="2" component-from-global-scope="MertTReliDesignSystem_56763c.Rule" label="About" right="01" hint-size="100%,14px"></x-import>
```

Variants: `right` numeral (optional); `data-heading` 2 or 3; `strong` (full ink line, unused).
Do: one rule opens each content section; one to three words.
Don't: stack a rule on a border-top; drop `data-heading` where nothing else heads the section.

### S05 Display heading and body

Archivo caps at 0.92 line height. `level` sets size only, `as` sets the element.

- Used in: every title. The home h1 (the name) uses Archivo Name, set in the head of `src/index.html`.
- Built from: `DisplayHeading` (_ds); `.ds-display`, `.ds-title`, `.ds-lead` in `css/websites.css`
- Edit: `src/index.html`; case pages: `title` and section text in the content JSON

| `level` | Size token | Use |
|---|---|---|
| 1 | `--fs-display-1` | hero, CHARGER feature |
| 2 | `--fs-display-2` | section titles; case titles with a 10+ letter word (`title_level()`) |
| 3 | `--fs-display-3` | sub titles |
| 4 | `--fs-title-1` | work entry titles |

```html
<x-import component-from-global-scope="MertTReliDesignSystem_56763c.DisplayHeading" level="4" as="h3" hint-size="100%,60px">Robo-Catcher</x-import>
<p style="font-size: var(--fs-body); line-height: var(--lh-body); color: var(--text-body); max-width: var(--measure)">One or two sentences.</p>
```
```html
<h2 class="ds-title">Live<br>sites</h2>
<p class="ds-lead">One sentence.</p>
```

Variants: `treatment="inverse"` (white on dark); `outline` (unused). Lead size: `--fs-body-lg`.
Do: two to four words, one `<br>` at most, one h1 per page, body capped at `--measure`.
Don't: choose a level for its element; use mid sizes for emphasis.

### S06 Spec list

Mono key and value rows on hairlines.

- Used in: home CHARGER feature, About; case-study brief
- Built from: `SpecList` (_ds); phone columns in `css/mobile.css`
- Edit: rows in `renderVals()` (`chargerSpecs`, `aboutSpecs`) in `src/index.html`; case pages: `brief` in the content JSON

```html
<x-import component-from-global-scope="MertTReliDesignSystem_56763c.SpecList" items="{{ chargerSpecs }}" hint-size="100%,140px"></x-import>
```
```js
// inside renderVals() return { ... }
chargerSpecs: [
  { label: "Event", value: "Battle of the Rockets 2026" },
  { label: "Result", value: "First place" },
],
```
```json
"brief": [{ "label": "Status", "value": "Thermal stack validated, electronics in progress" }]
```

Variants: a row's `aside` adds a muted third value; `columns` overrides the grid; `dense` drops hairlines (unused).
Do: one or two word labels, values with units, three to five rows.
Don't: put prose in a value; hand-write rows in the markup.

### S07 Media frame

Photo with grain, 8px corners, the mounted-print shadow from `css/depth.css`, indexed caption under it.

- Used in: home work entries, Beyond; case galleries
- Built from: `MediaFrame` + `Grain` (_ds); `figure > div:first-child` rules in `css/depth.css`
- Edit: `src/index.html`; case pages: a section's `frames` in the content JSON

```html
<x-import component-from-global-scope="MertTReliDesignSystem_56763c.MediaFrame" src="assets/photos/shop-and-machine-photography/machine-field.jpg" alt="Robo-Catcher on the field" ratio="4 / 3" caption="On the field" index="a" hover-zoom="true" hint-size="100%,180px"></x-import>
```
```json
"frames": [{ "src": "assets/photos/charger-rocket-photography/charger-pad-tall.jpg", "alt": "CHARGER on the launch rail before a flight", "caption": "On the rail", "index": "01" }]
```

Variants: `ratio` 3 / 2 (default), 4 / 3, 4 / 5; `scrim` hero / bottom / flat for type on the photo; `grain="false"` for screenshots.
Do: real alt text; credit photographers in the caption; make derivatives first (`python3 tools/media.py image`).
Don't: add a border, fill or shadow; expect `hover-zoom` to scale (depth.css pins it to a 1.5% lift on purpose).

### S08 Render stage

Inset 14px tray for transparent CAD renders and turntable videos. The video follows the contract in the header of `js/media-playback.js`.

- Used in: home work entries; case-study heroes
- Built from: `.depth-stage` in `css/depth.css`; `js/media-playback.js`
- Edit: `src/index.html`; case pages: `clip`, `clip_sizes` in the content JSON

```html
<div class="depth-stage" style="position: relative; aspect-ratio: 16 / 9; overflow: hidden">
  <video data-clip="1" data-poster="assets/motion/robo-catcher-360-poster.webp" loop muted playsinline preload="none" style="position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain">
    <source data-src="assets/motion/robo-catcher-360-alpha.webm" data-src-md="assets/motion/robo-catcher-360-1280-alpha.webm" data-src-sm="assets/motion/robo-catcher-360-960-alpha.webm" type="video/webm">
  </video>
</div>
```

IP protected pill (inside the stage, after the video):
```html
<div style="position: absolute; inset: auto 0 0 0; display: flex; justify-content: center">
  <span style="font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: var(--ls-caps); text-transform: uppercase; color: var(--text-display); border: 1px solid var(--line-hairline); border-radius: var(--radius-pill); padding: 5px 12px; white-space: nowrap">IP protected</span>
</div>
```

Variants: aspect 16 / 9, 4 / 3, 5 / 4; inside `.depth-hero` the tray is transparent with a floor shadow; opaque renders add an mp4 `<source>`.
Do: always `data-poster`; ship `-1280` and `-960` (`python3 tools/media.py video`); blur and pill NDA hardware.
Don't: use `src` or `autoplay`; put opaque photos in the tray.

### S09 Work entry

One home-page project: asymmetric two-column `<article>` under a hairline. Text column (S03, S05, body, S02) beside a render stage (S08). Sides alternate.

- Used in: home `#work`
- Edit: `src/index.html`; recipe `docs/recipes/add-project.md`

```html
<article data-reveal="1" style="display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: var(--space-8); align-items: start; padding-top: var(--space-7); border-top: 1px solid var(--line-hairline)">
  <div style="display: flex; flex-direction: column; gap: var(--space-5)">
    <x-import data-depth-label="true" component-from-global-scope="MertTReliDesignSystem_56763c.Meta" index="04" hint-size="240px,16px">Design for manufacture</x-import>
    <x-import component-from-global-scope="MertTReliDesignSystem_56763c.DisplayHeading" level="4" as="h3" hint-size="100%,60px">Three-point bend fixture</x-import>
    <x-import component-from-global-scope="MertTReliDesignSystem_56763c.Meta" tone="muted" hint-size="100%,16px">SunThru, 2026 / Solo design</x-import>
    <p style="font-size: var(--fs-body); line-height: var(--lh-body); color: var(--text-body); max-width: var(--measure)">One or two sentences.</p>
    <x-import component-from-global-scope="MertTReliDesignSystem_56763c.Button" data-depth-button="outline" variant="outline" trailing="→" href="projects/bend-fixture.html" hint-size="220px,44px">Case study</x-import>
  </div>
  <div style="min-width: 0; display: flex; flex-direction: column; gap: var(--space-3)">
    <div class="depth-stage" style="position: relative; aspect-ratio: 4 / 3"><!-- video, S08 --></div>
  </div>
</article>
```

Variants: text first `1.4fr`/`1.5fr` : `1fr`; render first `1fr : 1.4fr` or `1.35fr : 1fr`; optional caption and a media-frame pair under the render.
Do: alternate sides; number in order (CHARGER is `01`); same field order every time.
Don't: 50/50 splits; a third column or a card background.

### S10 Stats band

Big figures on an ink band right after a case hero. Auto-fit grid, 190px minimum column.

- Used in: every case study; built by `stats_band()` in `build-case.py`
- Edit: the `"kind": "stats"` section of `content/projects/<slug>.json`

```json
{ "kind": "stats", "stats": [
  { "value": "11 &deg;C", "label": "Cold face at 12 V, steady state" },
  { "value": "~5 min", "label": "To thermal equilibrium" }
] }
```

Do: two to four short values with units; labels say what was measured and how.
Don't: a figure without a unit or a source; put it on paper.

### S11 Panels and ruled list

Numbered panels on the sunken surface (`cards()`), or a numbered list on hairlines (`bullets()`).

- Used in: Therma-Shift constraints (panels); CHARGER, Robo-Catcher, Therma-Shift specs (list)
- Edit: a section's `cards` or `list` in the content JSON

```json
{ "label": "Constraints", "cards": ["Universal: any mug, glass or can, the device adapts to the drinkware", "Dual mode, heating and cooling from the same hardware"] }
{ "label": "Where it stands", "list": ["10.7 to 12 degrees C cold face at 12 V, steady state"] }
```

Do: panels for three or six short constraints; list for specs or steps that read in order.
Don't: headings inside panels; panels and a list in one section.

### S12 Pills and skills belt

Outlined mono pills grouped under strong meta labels, on a belt that loops sideways and pauses on hover or focus. With motion off it wraps into rows.

- Used in: home, What I work with
- Built from: `.skills-belt*` in `css/rocket.css`
- Edit: `src/index.html`; change both lists (the second is the `aria-hidden` loop copy)

```html
<div data-reveal="1" class="skills-belt" tabindex="0" role="region" aria-label="What I work with">
  <div class="skills-belt-track">
    <ul class="skills-belt-list">
      <li class="skills-belt-group"><x-import component-from-global-scope="MertTReliDesignSystem_56763c.Meta" index="01" tone="strong" hint-size="200px,16px">Design and CAD</x-import></li>
      <li><span style="display: inline-flex; align-items: center; padding: 7px 13px; border: 1px solid var(--line-hairline); border-radius: var(--radius-pill); font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: var(--ls-caps); text-transform: uppercase; color: var(--text-body); white-space: nowrap">SolidWorks</span></li>
    </ul>
    <ul class="skills-belt-list" aria-hidden="true"><!-- same items --></ul>
  </div>
</div>
```

Variants: `--belt-duration` on `.skills-belt` (90s default).
Do: keep the lists identical. Don't: drop `aria-hidden` from the copy; make pills clickable.

### S13 Hero chrome

Grain overlay, glass social rail on the right edge, caption and square scroll cue at the foot of the dark hero. The scroll cue is the only hard corner in the system.

- Used in: home hero; case heroes (grain + rail)
- Built from: `Grain`, `SocialRail`, `Caption`, `ScrollCue` (_ds); `.depth-hero` in `css/depth.css`
- Edit: `src/index.html`; rail links: `social` in `renderVals()`

```html
<x-import component-from-global-scope="MertTReliDesignSystem_56763c.Grain" blend="overlay" strength="normal" hint-size="100%,100%"></x-import>
<x-import component-from-global-scope="MertTReliDesignSystem_56763c.SocialRail" items="{{ social }}" inverse="true" fixed="true" hint-size="36px,120px"></x-import>
<x-import component-from-global-scope="MertTReliDesignSystem_56763c.ScrollCue" inverse="true" shape="square" hint-size="72px,72px"></x-import>
```

Variants: grain `strength` subtle (14%) / normal / strong; `blend` overlay on dark, multiply on light plates.
Do: grain on photos, plates and gradients; glass only over dark ground.
Don't: grain on plain white paper; round the scroll cue.

### S14 Footer

Ink band: 16px wordmark left, one meta line right, mono colophon below. Case pages copy the home footer at build time (`footer_block()`); the palette and motion control (`js/site-palette.js`) mounts into it.

- Edit: the home footer in `src/index.html`, then `python3 tools/build.py`; plain pages: `.ds-footer`

```html
<footer class="ds-footer on-dark">
  <div class="page-width ds-footer-inner">
    <div class="ds-footer-row"><a class="ds-wordmark ds-wordmark--md" href="index.html">MERT TURELI</a><span class="ds-meta">Austin, Texas / Web design and build</span></div>
    <p class="ds-colophon"><a href="index.html">Portfolio</a> / <a href="privacy.html">Privacy</a></p>
  </div>
</footer>
```

Do: change the footer once, on the home page; keep Privacy last.
Don't: edit a case footer in `projects/`; float the Display control over content.

### S15 Copy flag

An open question for the owner, in place: dotted underline, question in `data-note`.

- Built from: `mark.flag` in `css/site-palette.css`; `flag()` in `build-case.py`
- Commands: `python3 tools/check-flags.py` lists every flag and exits 1 while any remain (expected today). Recipe: `docs/recipes/flags.md`

```html
<mark class="flag" data-flag="home-022" data-note="Fact pass: is 2024 the correct year for the portrait caption?">2024</mark>
```
```json
["37 inches, single stage, ", { "flag": "charger-029", "note": "Diameter: CAD measures 2.68 in. Confirm 2.63 or correct it.", "text": "2.63" }, " inches across."]
```

Do: id `<page>-<nnn>`; the note is the exact question. Resolve by replacing the mark with the final text.
Don't: style flags further; leave a resolved mark in place.

---

## Studio

All snippets go in `next/index.html`. Behavior (magnetic pull, menu, drift swap, marquee, stage swap, clock, parallax) lives in `next/js/studio.js`; `data-*` hooks in the snippets are what it looks for, so keep them.

### T01 Top bar

Wordmark (the copyright sign spins on hover) and four links that grow a 5px dot. Below 761px the links hide and T02 takes over.

```html
<header class="top" data-top>
  <a class="wordmark" href="#top" aria-label="Mert Tureli, back to top"><span class="wordmark__c">&copy;</span> Mert Tureli</a>
  <nav class="top__nav" aria-label="Main">
    <a href="#work" data-magnetic>Work</a>
    <a href="#experience" data-magnetic>Experience</a>
    <a href="#websites" data-magnetic>Websites</a>
    <a href="#contact" data-magnetic>Contact</a>
  </nav>
  <button class="menu-btn" type="button" aria-expanded="false" aria-controls="menu" data-menu-btn data-magnetic>
    <span class="menu-btn__lines" aria-hidden="true"></span><span class="sr-only">Menu</span>
  </button>
</header>
```

Do: in-page anchors only; `data-magnetic` on each link. Don't: give the bar a background; add a fifth link.

### T02 Menu button and panel

58px ink circle fixed top right (shown when `studio.js` adds `.is-shown`, always on phones). Open: signal orange, lines cross, ink panel slides in.

```html
<div class="menu" id="menu" data-menu hidden>
  <div class="menu__panel">
    <p class="label">Navigation</p>
    <nav aria-label="Menu">
      <a href="#work">Work</a>
      <a href="#experience">Experience</a>
      <a href="#beyond">Beyond</a>
      <a href="#websites">Websites</a>
      <a href="#contact">Contact</a>
    </nav>
    <div class="menu__foot">
      <a href="../assets/Mert-Tureli-Resume.pdf">Resume (PDF)</a>
      <a href="https://linkedin.com/in/merttureli" rel="noopener">LinkedIn</a>
      <a href="mailto:merttureli0@gmail.com">merttureli0@gmail.com</a>
    </div>
  </div>
</div>
```

Do: list every section, including ones the top bar skips. Don't: toggle `hidden` yourself (`studio.js` handles focus and Escape).

### T03 Label and section rule

`.label` is the narrow mono caps for every small word. `.rule` opens each section.

```html
<div class="rule"><span class="label">02 / Selected work</span><span class="label hide-s">2024 to 2026</span></div>
<!-- on ink, inside .web -->
<div class="rule rule--dark"><span class="label">05 / Websites</span><span class="label"><span class="dot" aria-hidden="true"></span> Booking web projects</span></div>
```

Variants: `.rule--dark`; `.hide-s` hides below 761px; right side can be `class="label link"`.
Do: number sections `01 / Name` in page order. Don't: use the rule as the heading; add an `h2` (visible or `.sr-only`).

### T04 Display type and serif accent

Heavy wide Archivo caps; one word per heading in Bodoni Moda italic.

```html
<h2 class="display">Things I <em class="serif">built</em><br>and measured</h2>
<h2 class="manifesto">I <em class="serif">fly</em> ultralights, make short <em class="serif">films</em>, ...</h2>
```

Variants: `.display--web` (larger, serif in signal, inside `.web`), `.display--contact` (largest), `.manifesto` (serif in signal ink).
Do: one serif word, the one that carries the meaning. Don't: serif in body or labels.

### T05 Text link

Mono caps, full underline that retracts on hover.

```html
<a class="link" href="https://merttureli.com/projects/charger.html">Case study</a>
<a class="link link--quiet" href="https://www.union.edu/..." rel="noopener">Union College news</a>
```

Variants: `--quiet` (muted, outside sources), `--light` (on ink). Group in `<p class="project__links">`.
Do: say where it goes; `rel="noopener"` outside. Don't: use it for a section's main action.

### T06 Round button

The main call to action: floods from the bottom on hover, drifts toward the cursor.

```html
<a class="round round--signal round--xl" href="https://merttureli.com/websites.html" data-magnetic><span class="round__in">Find a day<br>to talk</span></a>
<a class="round round--ink round--l" href="mailto:merttureli0@gmail.com" data-magnetic><span class="round__in">Get in<br>touch</span></a>
```

| Variant | Effect |
|---|---|
| `--ink` / `--signal` | ink fills signal / signal fills paper |
| (none) / `--l` / `--xl` | 132px / 168px / up to 210px; or set `--size` |
| `<span class="round ...">` | inside a larger link (explorer entry) |

Do: one per section, two short lines. Don't: more than four words; nest links.

### T07 Pill button

62px outlined pill, ink fill rises as a curve and flattens on hover.

```html
<div class="contact__doors">
  <a class="btn" href="mailto:merttureli0@gmail.com?subject=Engineering" data-magnetic><span>Talk engineering</span></a>
  <a class="btn btn--ghost" href="../assets/Mert-Tureli-Resume.pdf" data-magnetic><span>Resume (PDF)</span></a>
</div>
```

Do: wrap the label in `<span>`. Don't: use on ink (no dark variant yet).

### T08 Status dot and pill

7px green dot that pings every 2.4s. `.pill` is styled but not on the page today.

```html
<span class="pill"><span class="dot" aria-hidden="true"></span>Booking web projects</span>
```

Variants: `.dot--still` (ink, no ping). Do: one true live status only.

### T09 Proof stats

Four big numbers on full-ink rules, two by two on phones.

```html
<dl class="stats">
  <div class="stat">
    <dt class="stat__n">13.8<small>ft/s</small></dt>
    <dd>CHARGER payload descent rate, against a 15 ft/s limit, on a $716 hardware budget.</dd>
  </div>
  <!-- three more -->
</dl>
```

Do: exactly four; unit in `<small>`. Don't: numbers the case studies do not back up.

### T10 Doors

Two big link panels, one per audience; arrow turns 45 degrees into signal on hover.

```html
<div class="doors">
  <a class="door" href="#work">
    <span class="label">For engineers</span>
    <span class="door__title">Hardware, end to <em class="serif">end</em></span>
    <span class="door__sub">Six builds, a first place, the full record.</span>
    <span class="door__go" aria-hidden="true"><span class="arrow"></span></span>
  </a>
  <a class="door door--dark" href="#websites">...</a>
</div>
```

`.arrow` is a reusable CSS arrow in `currentColor`. Don't: put buttons inside a door.

### T11 Project entry

One build in the Work list. Desktop shows the image in the sticky `.work__frame`; phones show `.project__media`.

```html
<li class="project" data-project="robo" data-name="Robo-Catcher" data-tag="84 part CAD assembly">
  <figure class="project__media"><img src="assets/img/robo-catcher-1400.webp" alt="..." loading="lazy" decoding="async" width="1020" height="855"></figure>
  <p class="label">02 / Mechanism + firmware / Senior capstone, 2025</p>
  <h3 class="project__title">Robo-Catcher</h3>
  <p class="project__body">Two to four sentences.</p>
  <dl class="specs">
    <div><dt>Indexing</dt><dd>100% on competition day</dd></div>
    <div><dt>Build cost</dt><dd>Under $700</dd></div>
    <div><dt>Weight</dt><dd>55 lb, fits a car trunk</dd></div>
  </dl>
  <p class="project__links"><a class="link" href="https://merttureli.com/projects/robo-catcher.html">Case study</a></p>
</li>
<!-- plus, in .work__frame: -->
<img data-key="robo" src="assets/img/robo-catcher-1400.webp" alt="" loading="lazy" decoding="async">
```

Do: three specs; keep `data-project`, `data-key` and the drift `<sup>` number in step. Don't: skip `width`/`height`.
Where every project fact lives across both sites: `docs/recipes/content.md`.

### T12 Experience rows

Native `<details>` accordion, no JS.

```html
<li class="row">
  <details>
    <summary>
      <span class="row__when label">Jun to Sep 2026</span>
      <span class="row__role">Engineering intern</span>
      <span class="row__org">SunThru</span>
      <span class="row__line">One line, hidden below 1101px.</span>
      <span class="row__plus" aria-hidden="true"></span>
    </summary>
    <div class="row__more"><p>One or two paragraphs.</p></div>
  </details>
</li>
```

Do: newest first. Don't: links inside `<summary>`; facts only in `.row__line`.

### T13 Toolkit list

```html
<div class="tools">
  <p class="label">Toolkit</p>
  <ul class="chips"><li>SolidWorks, expert</li><li>GD&amp;T to ASME Y14.5</li></ul>
  <p class="label tools__edu">B.S. Mechanical Engineering, Union College, 2026 / ...</p>
</div>
```

Slashes come from CSS. Do: most important first. Don't: turn items into pills.

### T14 Photo scatter

Photos off-grid on 12 columns, each drifting at its own speed (`data-par`).

```html
<figure class="ph ph--b" data-par=".08"><img src="assets/img/lake-framed-420.webp" srcset="assets/img/lake-framed-420.webp 420w, assets/img/lake-framed-720.webp 720w" sizes="(max-width: 700px) 60vw, 22vw" alt="Lake framed by pine branches" loading="lazy" decoding="async" width="720" height="900"><figcaption class="label">Photograph / Lake</figcaption></figure>
```

Five slots `.ph--a` to `.ph--e` (each its own span and offset, re-laid on phones). Do: `-420`/`-720` webp with `srcset`; caption `Place / Kind`. Don't: a sixth photo without a slot class.

### T15 Steps and spec card

Inside `.web` (ink) only.

```html
<ol class="steps">
  <li><span class="label">01</span><b>A conversation</b><span>Tell me what you're building. A rough idea is a good place to start.</span></li>
</ol>
<div class="spec-card" data-reveal>
  <p class="label">This page, measured</p>
  <dl><div><dt>Frameworks</dt><dd>0</dd></div></dl>
</div>
```

Do: three steps; only measured facts in the card.

### T16 Drift words

Words floating behind the hero object; each slot cycles three words.

```html
<!-- x, y in % of the stage; --d is scroll parallax depth -->
<span class="slot s-l" style="--x:59%;--y:38%;--d:.55">
  <i>Robo-Catcher<sup>02</sup></i><i>Rudder pedals<sup>05</sup></i><i>Bend fixture<sup>06</sup></i>
</span>
```

| Class | Look |
|---|---|
| `.s-xl` | wide caps |
| `.s-l` | sentence case |
| `.s-m` | serif italic |
| `.s-s` | mono, in brackets |
| `.front` | above the object |

Slots 3 and 6 hide on phones; the rest are repositioned by `nth-child` in `studio.css`, so check phones after reordering. The showreel (`next/js/showreel/`) highlights the active project's slot.

### T17 Name marquee

The page's h1, four identical items with signal dots; the first is real, copies are `aria-hidden`.

```html
<h1 class="marquee" data-marquee>
  <span class="marquee__track" data-marquee-track>
    <span class="marquee__item">Mert Tureli<span class="marquee__sep" aria-hidden="true"></span></span><span class="marquee__item" aria-hidden="true">Mert Tureli<span class="marquee__sep"></span></span><span class="marquee__item" aria-hidden="true">Mert Tureli<span class="marquee__sep"></span></span><span class="marquee__item" aria-hidden="true">Mert Tureli<span class="marquee__sep"></span></span>
  </span>
</h1>
```

### T18 Feature link

Full-width ink panel that is one link: ghost word, tilting render, copy bottom left, round button (a `<span>`) bottom right. Copy the `.explorer` block from `next/index.html` for a second feature.

### T19 Footer

```html
<footer class="foot wrap">
  <div><p class="label">Version</p><p>2026 Studio</p></div>
  <div><p class="label">Local time</p><p data-clock>Austin</p></div>
  <div><p class="label">Socials</p><p><a class="link" href="https://linkedin.com/in/merttureli" rel="noopener">LinkedIn</a> <a class="link" href="mailto:merttureli0@gmail.com">Email</a></p></div>
  <p class="foot__credit">CAD renders from the source assemblies. Hand built, no framework.</p>
</footer>
```

Three facts plus the credit; two columns on phones.

---

## Catalog maintenance

`docs/design/catalog.html` is plain HTML, edited by hand. Its runtime is `docs/design/catalog/catalog.js`, its look `docs/design/catalog/catalog.css`. It has `noindex`.

How a preview works: each `<figure class="pv">` holds one `<script type="text/html" class="demo">`. `catalog.js` renders that markup in an iframe that loads the real CSS of its profile, with `<base>` set so paths read exactly as on the page. The demo text is also the snippet shown under it.

| Attribute on `figure.pv` | Meaning |
|---|---|
| `data-profile` | `site` (home and case CSS), `web` (websites.html CSS), `studio` (next/ CSS) |
| `data-bg` | site/web: `paper`, `dark` (adds `.on-dark`), `sunken`; studio: `paper`, `paper2`, `ink` |
| `data-pad` | stage padding (CSS) |
| `data-height` | fixed height in px, for fixed or absolutely placed components |
| `data-stage-css` | demo-only spacing CSS, kept out of the snippet |
| `data-js` | real page scripts by name: `media-playback` loads `js/media-playback.js` |
| `data-behavior` | demo-only motion that page JS normally drives: `drift`, `marquee`, `shown` |
| `data-label` | caption in the preview bar |

Add a component:
1. Copy a whole `<section class="c">` block in the right part (Site or Studio). Give it a new `id` (`site-x` or `studio-x`), `data-n` (`S16`, `T20`) and name. The index builds itself.
2. Paste the markup into `<script type="text/html" class="demo">`. Paths as on the page (site: from the root; Studio: from `next/`).
3. Add snippet tabs in `.code`: `<script type="text/plain" title="src/index.html">...</script>`, or `data-from="0"` to reuse demo 0. The tab name goes in `title`, not a `data-` attribute, so the link checker skips it.
4. Fill Used in / Built from / Edit, Variants, Do, Don't. Add the same entry to this file.
5. Check it: `python3 -m http.server 8000`, open `/docs/design/catalog.html` at 390 and 1440, 0 console errors.

Notes:
- Site stylesheet lists in `catalog.js` (`PROFILES`) mirror the `<link>` order of the built `index.html` and of `websites.html`. If a page gains or drops a stylesheet, update the list. `css/tokens.css` comes in through the `@import` in `css/fonts.css`.
- Demo markup sits in `<script type="text/html">`, so the link checker does not read it. A broken demo path shows as a failed request in the browser.
- Studio previews load `studio.css` only, not `studio.js`: magnetic pull, menu toggling, stage swaps and the clock are not live there.
