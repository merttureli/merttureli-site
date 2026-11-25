# Studies and sample sites

Each folder here is one self-contained page that shows a style of website. The first four (`hangar`, `launch`,
`studio`, `specimen`) are redesigns of the portfolio. The rest are sample client sites: each has an invented
brand, one job, and is built from the owner's real projects, renders, 3D models and photos.

The catalog of all twelve is the Websites page: `next/websites.html`, section `#studies` (built to `websites.html`;
styles `next/css/catalog.css`, script `next/js/catalog.js`, posters in `catalog/assets/`, made by
`tools/study-posters.js`). It opens each page in a viewer dialog at desktop, tablet and phone width, and
`websites.html#<key>` opens one directly. `studies/index.html` only sends old links there, carrying a `#<key>`.
A new sample needs an entry there, its posters and its key in `studies/index.html`. `robots.txt` keeps `/studies/`
out of search (except `shared/` and `catalog/assets/`, which the Websites page loads) and every page carries
`noindex`.

## The folder

```
studies/<key>/
  index.html     the page
  css/<key>.css
  js/<key>.js    ES modules, no build step
  fonts/         woff2 files this sample alone uses (from Fontsource; shared ones are in ../shared/fonts)
  assets/        images made for this sample (webp); reuse the site's own files where they fit
  NOTES.md       the brief: client, job, references, palette, type, effects, and what is invented
```

## The head and the way back

```html
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<link rel="stylesheet" href="../shared/study.css">
<script src="../shared/study.js"></script>
<title>...</title>
```

First thing in `<body>`, the pill back to the Websites page (copy it from `vireo/index.html`). It sits bottom
left by default, fixed, and there it takes taps meant for the page: a review found it over option cells, form
fields and footer links on phones. So every sample places it in its own CSS (never in `shared/study.css`):
docked in the sample's own bar where there is room, restyled to belong to that bar, and at no width from 360
to 1920 on top of a headline, a control, a form field or a dialog. Its link stays.

On a sample site the pill is also the mark that the page is a sample (the owner's decision, November 2026):
several samples show prices and a booking or reserve flow, and a visitor who lands on one directly must not take
it for a real shop. So it reads "Sample site" with its back arrow, never shorter and never an icon alone, at
every width from 360 to 1920 ("Sample site by Mert Tureli" is fine where there is clear room), and its name for
readers says both things: `aria-label="Sample site by Mert Tureli. Back to websites"`. It shows on the first
screen and stays on screen while the page scrolls: where a sample's bar scrolls away or is clear, the sample
gives the pill a band to sit on, so the page passes under the band and never under the pill. The four
redesigns of the portfolio keep "Back to websites". Inside the catalog's viewer on the Websites page the pill
hides itself (the viewer's own bar says the page is a sample).

## Rules for a sample site

- **One job that works.** The main action is on the first screen and can be completed in the page. A form
  checks its fields and then says it is a sample. Nothing is sent: no `fetch`, no form `action`, no analytics.
- **No outside requests.** Fonts, scripts and images are served from this repository. No CDN, no framework.
- **Motion.** Smooth on a laptop, off under `prefers-reduced-motion: reduce` (the content must still read),
  paused when off screen. `shared/study.js` reloads the page when the setting changes.
- **Sizes.** Laid out for 390 and 1440 pixels wide with no sideways scroll. 3D and video load after the first
  view.
- **Access.** Text contrast at least 4.5 to 1, everything reachable by keyboard with a visible focus ring, one
  `h1`, `alt` on every image, a skip link.
- **Content.** Facts about the owner's projects come from `content/projects/*.json` and the live pages. Invented
  brand names, prices, dates and quotes are fine, and the footer says so in one line: the page is a sample by
  Mert Tureli and the brand is invented. Never use HOTBOX or the bend fixture. US spelling, no em or en dashes.
- **Its own look.** `NOTES.md` names the references and what was taken from each. Do not reuse another study's
  fonts, palette or signature effect.

## What can be reused

| Need | Where |
|---|---|
| three.js | `../../next/js/three.module.min.js` (import it once per page) |
| A project's 3D model | `loadCadMesh(THREE, '../../next/assets/3d/<name>.json')` from `../../next/js/cad/cadmesh.js`: parts by name, an explode vector per part, `setProgress(p)`. Models: `charger-explorer`, `charger-hero`, `robo-catcher`, `rudder-pedals`, `therma-shift` |
| The realistic materials and studio light | `../../next/js/showreel/engine.js` (`createEngine`) and `look.js` (`getLook`, `dressRocket`, `dressRoboCatcher`, `dressRudderPedals`, `dressThermaShift`); read `docs/design/3d.md` first |
| Renders and loops | `../../next/assets/img/`, `../../next/assets/img/stills/`, `../../next/assets/loops/` |
| Travel and landscape photos (up to 1920 wide) | `../../next/assets/img/beyond/` |
| Project photos | `../../assets/photos/` (most are 520 wide: use small) |
| Smooth scrolling | `../../next/js/lenis.min.js` |

## Browser features (checked November 2026)

| Feature | Use it how |
|---|---|
| Scroll-driven animations (`animation-timeline`) | As an enhancement only (Firefox got it in October 2026). Scroll scenes are driven from JavaScript, or work without the animation |
| View transitions in one page, `@starting-style`, `text-wrap: balance`, container queries, `:has`, `color-mix` | Freely |
| Cross-page view transitions, anchor positioning, `text-wrap: pretty` | As an enhancement only |
| Relative colors, P3 color | With a plain sRGB fallback first |
| `backdrop-filter` blur | Freely, but never as the only thing between text and a busy picture |

Dated in late 2026, so not in any sample: purple gradients and glowing orbs, glass behind running text, a
"new" badge on everything, wide-tracked uppercase labels as the only idea, the hard-shadow kit look on every
card, letters animating in on every heading, taking over the scroll.

## Checking one

```sh
node tools/study-shots.js <key> --out <folder>   # screenshots a screen at a time at 1440 and 390 wide, and report.json
python3 tools/check.py                           # links, script syntax, noindex: must pass before a commit
```

`report.json` lists console errors, failed and outside requests, bytes by type, sideways overflow, controls with
no name and images with no `alt`. All of those lists should be empty.
