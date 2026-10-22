# HANDOFF: opt/studies

Branch `opt/studies`, from `claude/funny-sagan-acgved`. Not pushed.

## What changed

### 1. Four studies as working pages (`studies/`)
- `studies/hangar/`, `studies/launch/`, `studies/studio/`, `studies/specimen/`: the four redesign prototypes, copied
  from each prototype's `publish-files.json` list (normal `.bin`/`.glb` names; no `.step`, no work/shots folders).
- Shared with the site instead of duplicated:
  - CHARGER explorer: every "Explore" link and the 3D heroes point at `../../assets/charger-explorer/`
    (Hangar loads `assembly.glb`, Launch loads `assembly.json` + `assembly.bin` from there). The prototypes'
    older explorer copies are gone, so all four now open the site's current explorer.
  - Resume: `../../assets/Mert-Tureli-Resume.pdf`.
  - Launch's mission clips: `../../assets/motion/` (hotbox, bend fixture byte-identical; Therma-Shift now uses the
    site's `therma-shift-360-noflow-960-alpha.webm` (615 KB) instead of a 2 MB copy).
  - Archivo and Martian Mono (byte-identical in Hangar, Launch and Studio): one copy in `studies/shared/fonts/`.
    These are the studies' own font files. No site font file or font-family declaration was touched.
  - three.js was not deduped: Hangar (r186 min), Studio (r170 min) and Launch (custom esbuild bundle) are three
    different builds, and the explorer's unminified vendor copy would cost visitors more bytes.
- `studies/shared/study.css` + `study.js`, loaded by all four:
  - fixed "Back to websites" pill to `/websites.html#studies`. Each study keeps its calls to action at the bottom of
    the first screen, so the pill sits where that study has room (Hangar: top right under the header; Launch and Studio:
    bottom center on desktop, top on phones; Specimen: top left on desktop, header row on narrow screens).
    The pill hides itself when the page runs inside the websites page frame.
  - reloads the page when `prefers-reduced-motion` changes (all four read it once at start; INVENTORY.md).
- Each page has `<meta name="robots" content="noindex">`; `robots.txt` has `Disallow: /studies/`. No analytics on them.
- Studio (INVENTORY.md): top-level `:hover` fills wrapped in `@media (hover: hover)` so they no longer stick after a tap,
  and `.round`, `.door`, `.btn` got matching `:focus-visible` fills.
- Prototype page copy was not edited.

### 2. Studies section on `websites.html`
- Markup of `#studies` replaced: picker (four `button`s with `aria-pressed`, letter, name, one-line description), a browser
  frame showing the selected study's first screen, actions "Explore it here" and "Open full page".
- Explore creates one `iframe` on click (none on load, never more than one; switching while live replaces it). The poster
  stays up with a loading pill until the frame loads, then fades out. The live page renders at a 1200 px virtual width and
  is scaled to fit, so it lines up with the poster. Focus moves into the frame when it is ready; "Close live view" removes
  the frame and returns focus. Status changes are announced through a polite live region.
- Phones (max-width 700px): phone frame with the phone screenshot. The Explore button is hidden and "Open full page" is the
  primary button. If the window shrinks to phone width while live, the frame closes.
- Posters: fresh Playwright captures of the repo copies, desktop at 1200x750 (1.5x, saved at 1200 and 1800 wide) and phone
  at 390x844 (2x, saved at 720 wide), AVIF + WebP in `assets/studies/` (24 files, 0.96 MB).
- `css/website-studies.css` rewritten for the new section (old soft relief/alloy/field/signal rules removed; the
  `<link>` line is unchanged). `js/website-studies.js` is new (one `defer` script tag added in `<head>`). The old
  `data-study` and lift-the-layers handlers were removed from `js/website-inquiry.js`.
- Copy changed only inside the section: the lead, the four descriptions and the frame/button labels. The descriptions are the
  compare board one-liners, trimmed: removed references to other studios and brands (Hermeus, Vast, Snellenberg/Huguenin,
  Nothing, Johnston Marklee) and to "you/your", "the real CHARGER" became "CHARGER rendered live" (it is the CAD flight
  model, per INVENTORY.md), "catalogue" became "catalog", "A bold evolution of your monochrome identity" became
  "My monochrome identity, pushed further". `python3 check-writing.py websites.html` reports clean (study pages too).

## Repo weight added
7.66 MB total: `studies/` 6.70 MB (Hangar 1.5, Launch 1.1, Studio 2.2, Specimen 2.0, shared 0.14) and `assets/studies/`
0.96 MB. The raw prototype folders were about 80 MB.

## Verification (evidence in /tmp/claude-0/-home-user-merttureli-site/fe356c8b-023d-52dd-b7f6-84e925c9294d/scratchpad/opt/studies/)
- Study pages at 390, 860, 1000 and 1440, normal and reduced motion: no console errors (only SwiftShader GL performance
  warnings), no 4xx or failed requests, no requests to other hosts, no horizontal overflow, pill present with the right
  href, robots meta present. `report.json`, `report-rm.json`, `shots/*-fold.png`, `shots/*-end.png`,
  `sheet-phone.png`, `sheet-860.png`, `sheet-b.png`, `sheet-rm.png`.
- Reduced-motion change on a study page reloads it (`tools/inquiry.js`).
- Live flow at 1440 (`tools/flow.js`): no iframe and no study-page request before a click; keyboard select and Explore;
  loading then live; iframe titled and focused; wheel scrolls inside it (scrollY 3200); switching while live keeps one
  iframe; close removes it and returns focus. Screens: `shots/flow-1440-*.png`, `sheet-flow.png`, `sheet-flow2.png`.
- Phone flow at 390: Explore hidden, phone poster, Open full page navigates to `/studies/studio/`, the pill returns to
  `/websites.html#studies`. `shots/flow-390-*.png`.
- Section screenshots before/after: `shots/web-before-*.png`, `shots/web-final-{390,860,1440}.png`,
  `shots/web-final-1440-slate.png` (palette tokens follow).
- Inquiry dialog end to end with Formspree mocked at 390 and 1440: opens, posts, shows the complete panel.
  `shots/inquiry-*-complete.png`.
- Regression: full-page captures of baseline (HEAD export) vs candidate in harness conditions (reduced motion, frozen clock,
  original and slate palettes, 390 and 1440). Everything above `#studies` is pixel-identical. Below it, content is the same
  (`regress/below-1440-original.png`); the remaining pixel noise is text antialiasing from the section's new height landing on
  a fractional pixel. The `tools/visual-regress` harness itself was not run because it needs two ports and this batch has one.

## For the orchestrator / owner
- Outside the section, proof item 03 on `websites.html` still describes the old toggles ("kept as working excerpts... from soft
  relief to a green terminal"). Left unchanged because copy outside the section is on hold. Suggested replacement:
  - before: `<p>Four alternative directions for this portfolio, kept as working excerpts. Each one restyles the same content, from soft relief to a green terminal.</p>`
  - after: `<p>Four redesigns of this portfolio, each built as a working page. Each one restyles the same content, from a light hangar to a monochrome catalog.</p>`
- Process item 03 ("like the studies above") is still accurate.
- `robots.txt` Disallow means crawlers will not fetch the pages to read their noindex; both were requested.
- Not done, by design: no redesign of the prototypes; their copy (for example Launch's CG 22 IN / Ø 2.63 annotations flagged
  in INVENTORY.md) is as the owner reviewed it.
