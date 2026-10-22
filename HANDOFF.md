# Handoff: opt/fonts (Archivo + Martian Mono)

Branch `opt/fonts`, cut from `claude/funny-sagan-acgved`. Not pushed.

## What changed

**Faces.** Archivo replaces Space Grotesk and Martian Mono replaces IBM Plex Mono
on every page: home, the five case pages, websites, privacy, 404, /hi/,
photography lab (and the gallery fragment it loads), the design-system tokens,
and the CHARGER explorer, including the livery lettering that `livery.js` draws on
the rocket (Archivo 700, as in the prototypes the owner liked).

**Files** (`assets/fonts/`, OFL texts alongside):

| file | source | size |
|---|---|---|
| `archivo-latin.woff2` | Google Fonts latin file, instanced to wdth 100-125 (wght 100-900 kept) | 62.5 KB (was 90.1 as served) |
| `archivo-latin-ext.woff2` | same, latin-ext | 59.1 KB (was 86.2) |
| `martian-mono-latin.woff2` | Google Fonts wght-only variable (100-800) | 23.6 KB |
| `martian-mono-latin-ext.woff2` | same, latin-ext | 15.9 KB |

Instancing used fontTools `varLib.instancer` (`{'wdth': (100, 125)}`); it drops
the condensed masters the site never uses. The script is in the scratchpad
(`opt/fonts/tools/build_fonts.py`) if the files ever need regenerating.

Removed, now unreferenced: all `space-grotesk-*` and `ibm-plex-mono-*` woff2,
their two OFL files, and `assets/charger-explorer/fonts/` (two TTFs, 266 KB). The
explorer now loads the site's own woff2 from `../fonts/`, so it shares the cache
with the pages (and with the home page's explorer dialog).

**Roles.** One Archivo file is declared under three family names in
`css/fonts.css`, each pinned to one width by the `font-stretch` descriptor (the
browser clamps the wdth axis into the face's range). The design system renders
inline `font-family: var(--font-display)` styles, so the width rides on the
family token and no inline style needed touching:

| token | family | width / weight | used for |
|---|---|---|---|
| `--font-body` | Archivo | wdth 100 | running text, UI copy |
| `--font-display` | Archivo Display | wdth 106 | headings, titles, nav, wordmark, big figures |
| `--font-name` | Archivo Name | wdth 116, wght 600 (pinned by the face) | the name: home hero h1, /hi/ |
| `--font-mono` | Martian Mono | `size-adjust: 85%` | labels, specs, indices |

- The name is short of Archivo's full 125 width, per the owner. It renders at
  600 whatever weight DisplayHeading asks for, because the face pins the weight.
- Display caps run about 1.2 times as wide as Space Grotesk's, so the display
  tokens (`_ds/.../tokens/typography.css`) scale to 0.84 of their old values
  (`--fs-display-1/2/3`, `--fs-title-1`). Lines of caps keep their old length and
  break where they broke before; cap height is about 0.82 of before, which the
  wider letters make up for. The website-entry heading on the home page scales
  the same way.
- Martian Mono's tall x-height and wide cells would make every label about 15%
  bigger and 17% longer. `size-adjust: 85%` matches the old mono's x-height and
  label length, so pills, spec rows and rule labels keep their layout.
- Tracking: display keeps `-0.03em`. Mixed-case headings tuned for Space
  Grotesk's looser fit ease off (photography lab h1 -0.07 to -0.045em, its h2s,
  the mechanism walkthrough, the explorer's h1, lede, part titles and wordmark).
- Home h1: a `<style>` in the `<head>` of `src/index.html` (deliberately outside
  the helmet block, which build-case.py copies to the case pages) redefines
  `--font-display` and `--fs-display-2` on `h1` only. That swaps in Archivo Name
  and gives the name a 52px floor on phones without an `!important` or a markup
  change. If the new hero stops using DisplayHeading level 2, the family still
  applies and only the size floor drops out.

**Other edits.** `tools/prerender/prerender.js` preloads the two new latin files.
`404.html`, `websites.html`, `privacy.html` and `photography-lab.html` now preload
them too (404 and the last three had none). `/hi/` preloads Archivo only and keeps
its system `ui-monospace` labels, so the QR landing page still loads one font.
`launcher.css` (home page dialog) and `project-walkthrough.css` point at the new
families. The calendar day numbers and time-zone select on the websites page use
`--font-body` (they are UI copy and were picking up the display width). DS readme,
manifest and lint config list the new faces. No copy changed.

## Payload (font bytes on first load, measured from the responses)

| page | before | after |
|---|---|---|
| home, case pages, websites, privacy, photography | 36.1 KB (SG latin 21.8 + Plex 400 14.4) | 84.0 KB (Archivo 61.0 + Martian 23.0) |
| 404 | 50.7 KB (also Plex 500) | 84.0 KB |
| /hi/ | 21.8 KB | 61.0 KB |
| CHARGER explorer | 265.9 KB (two TTFs) | 84.0 KB, the same files as the site, so 0 after any page |
| font files in the repo | 408 KB (13 woff2 + 2 TTF) | 161 KB (4 woff2) |

latin-ext loads only if a page shows a character outside latin; none does today.
The cost is +48 KB on a first visit to a page. It is one cached pair for the whole
site, and the explorer is 182 KB lighter.

## How I verified it

- `python3 tools/build.py --check`: all pages ok.
- `check-writing.py`: identical output before and after on all 12 pages.
- Visual harness (`tools/visual-regress`, baseline = `claude/funny-sagan-acgved`
  export, all 12 pages × 390/860/1440/1920 × original and slate palettes): every
  screen differs, as a font change has to; 0 gate changes, 0 console errors, no
  external requests, h1 counts unchanged. Report:
  `/tmp/claude-0/-home-user-merttureli-site/fe356c8b-023d-52dd-b7f6-84e925c9294d/scratchpad/opt/fonts/regress-final/index.html`
  (the first, original-palette-only run is in `.../opt/fonts/regress/`).
- Before/after side-by-side crops of every page and width:
  `/tmp/claude-0/-home-user-merttureli-site/fe356c8b-023d-52dd-b7f6-84e925c9294d/scratchpad/opt/fonts/sbs1/`
  (e.g. `index--1440--original-00.png`, `projects__charger--390--original-01.png`).
  Explorer, /hi/, 404 and the home dialog are under `.../opt/fonts/shots/` and `.../opt/fonts/sbs/`
  (`dialog-cand-1440.png`, `sbs/livery.png` for the rocket lettering, `sbs/study-*.png` for
  the four design studies, `sbs/walk.png` for the mechanism walkthrough).
- A layout script (`.../opt/fonts/tools/heads.js`) compared every heading,
  button and link between baseline and candidate at all four widths, and flagged
  anything outside the viewport or clipped. Output: `.../opt/fonts/heads-final.txt`.
  scrollWidth equals the viewport on every page at every width. The nav does not
  wrap (at 1440 and 1920 it sits on one line; at 390 and 860 the header shows the
  menu button, as before), and no pill, button or label grew.
- Ports: 8891 for the candidate. The harness needs a second server for the
  baseline, so it ran on 18891.

## Left as is, for the owner or another batch

1. **Printed business cards.** `cards/cards.html` and `cards/references.html` are
   print artwork and still load Space Grotesk and Plex Mono from Google Fonts. I
   did not touch print files. The websites page says /hi/ "matches the printed
   card"; the type will differ until the cards are reprinted. Switch these two
   files to the new pair before the next print run.
2. **Raster images with baked-in lettering.** The rocket renders and posters
   (home hero render, `assets/motion/charger-*`) show livery lettering drawn
   before this change, and the OG images in `assets/og/` were set in Space
   Grotesk. They need a re-render or re-export to match. The live 3D explorer
   letters the rocket in Archivo already.
3. **Experience titles at 1440.** "Design engineer and materials intern" goes
   from 2 to 3 lines in its 462px column (other titles keep their breaks). It reads
   fine. A smaller `--fs-title-1` would pull it back but would shrink every
   project title.
4. **Older overflow, unrelated to fonts.** On case pages at 390, long section
   rule labels ("Sizing the feeder before cutting anything", "Validate the physics
   before the electronics") are `nowrap` and run about 15-35px past the column.
   The page's `overflow-x: hidden` clips them. This was true with Plex Mono too;
   Martian Mono at 85% is slightly narrower.
5. **Design studies** on the websites page (`css/website-studies.css`) keep
   their own tight tracking (-0.065 to -0.08em). They are frozen alternative
   directions and still read as intended in Archivo.
6. **Concurrency.** In `src/index.html` I only added the `<style>` block in
   `<head>` described above. I made no markup changes and touched nothing in the
   hero, skills or CHARGER sections. When the other agent's hero lands, rerun
   `python3 tools/build.py` and check the name at 390 and 1440.
