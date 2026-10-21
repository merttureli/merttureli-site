# HANDOFF: integration (branch opt/integrate)

From `a6d3ea8` (all approved batches merged, pages pre-rendered). Three steps, one commit each:

| commit | step |
| --- | --- |
| `d49bfd2` | A. Pending handoffs b2a, b2c, b2d, b2e, b3, b5, b6, robots.txt, `_headers` |
| `829b9b3` | B. Batch 2b: headings and landmarks (zero visual diff) |
| `9da5d16` | C. Batch 8: layout and motion polish (intended visual changes) |
| `1ae8d02` | Poster preloads removed after measuring (see "Performance"); first version of this file |
| last | HANDOFF.md |

Evidence lives under
`/tmp/claude-0/-home-user-merttureli-site/fe356c8b-023d-52dd-b7f6-84e925c9294d/scratchpad/opt/integrate/`
(written `EV/` below). Patch scripts are in `EV/patches/`.

`python3 tools/build.py --check` exits 0 at every commit. `python3 check-writing.py` reports 0 flagged
(now 9 files: the built pages plus websites, hi/ and 404).

## Step A: pending handoffs

Already done before this branch (verified, skipped): the palette script first in the case-page head
(b3), the Websites nav item on case pages and the "I could not" strings in `js/inquiry-delivery.js`
(b5), `<html lang>` (b1), websites.html og:image alt (b5).

**b2c media (G5: posters only for transparent clips)**
- `src/index.html`: WebP hero poster and `preload="metadata"`. I added the `<link rel="preload"
  as="image" fetchpriority="high">` for the poster in step A and removed it in `1ae8d02`, because
  measurement showed it made things slower (see "Performance"). Card and Beyond posters are `data-poster` (WebP), so nothing below
  the fold downloads at t=0. robo, rudder, therma-noflow, kaan and hurjet sources carry
  `data-src-md`/`data-src-sm`. The hero swap code (template only; the static build drops it) uses the
  WebP posters and the 1280/960 variants.
- `build-case.py`: `MOTION_VARIANTS`, `OPAQUE_CLIPS`, `webm_source()`. Case hero clips: eager WebP poster
  (also no preload, see "Performance"), lazy `data-src` sources, `preload="none"`. The
  mechanism band: `data-poster`, lazy sources with its 1280/960 webm, mp4 kept.
- mp4 removed from every transparent clip (index hero, every case hero except bend-fixture). Kept for
  hotbox, bend-fixture, the mechanism band and the balloon, as b2c listed.
- `websites.html` uses the WebP poster at its real 1280x720. The explorer's og:image moved from the old
  PNG poster to `assets/og/case-charger-v1.png` (1200x630), so the PNG could go.
- Deleted 31 files (40.4 MB): every old PNG/JPG poster, the baked-background mp4s, the orphan
  `charger-wide*` and `therma-shift-360*` clips (including their unused variants), and
  `assets/og-cover.png`. Before deleting, `EV/patches/refs.py` scanned every .html/.js/.css/.json/.py/
  .md/.svg/.xml/.txt in the tree (src/, the explorer, websites.html, cards/, _ds/ included) for each file
  name. The deleted list had zero hits: `EV/orphans.txt`, full scan `EV/asset-refs-before-delete.json`.
  The full-size `*-alpha.webm` originals stay: they are still the `data-src` default.

**b2d**: hero caption "CHARGER / rendered from the flight model, 28 components at their true
stations". The CHARGER case page "The airframe" section ends with "Explore in 3D to see all 28
components at their true stations." linking `../assets/charger-explorer/index.html`.

**b2e**: case-page sections carry `data-track` ids: `brief`, `results` (the stats band), and each
labelled section by its anchor or label slug (`the-airframe`, ...). In a run of light sections each part
is wrapped in a div with the run's own flex column and gap, so the layout is unchanged.

**b3**: static fallback inside `<photo-corridor>` (link to photography-lab with the lighthouse thumb).
It is hidden once the loader attaches its shadow root.

**b6**: icon links, og:site_name, og:image per page with width/height/alt, twitter:card, Person
JSON-LD (no employer, no worksFor) on the home page, `assets/og/cover-v1.png` for the home page. Case pages
use `case-<slug>-v1.png` with the `og_alt` from b6. The CHARGER `<title>` is "CHARGER · Deployable
sensor payload · Mert Tureli". All descriptions use b6's proposed text (home 159, cases 144 to 160
characters). The old data-URI favicon is gone everywhere, including privacy.html. `FAVICON` is deleted
from build-case.py.
`assets/og/websites-v1.png` was regenerated with the page's new headline (WEBSITES / DESIGNED AND
BUILT), using b6's generator with only the headline changed (`EV/patches/make_og_ws.py`). The `-v1` name
was kept because no branch with it has been served from main.

**b2a**: the case-page wordmark links to `../index.html`. SiteHeader hard-wires `href="#"`, so
`tools/prerender/prerender.js` rewrites it on pages below the root. On the home page it stays `#`.

**robots.txt**: `Disallow: /src/` added (`/tools/` was already there).
**`_headers`**: `https://:project.pages.dev/*` gets `X-Robots-Tag: noindex`. GitHub Pages ignores it.

**Harness change** (`tools/visual-regress`): a lazy `data-poster` is now applied and awaited before
capture, like a lazy image. Without that, the harness's fast scroll left every card poster blank on the
candidate (the first run, `EV/regress-A/`, showed 645K changed pixels in the Beyond band for that
reason alone). In a real scroll every poster loads (`EV/patches/postercheck.js`).

**Harness, A against a6d3ea8** (`EV/regress-A2/`, index + case pages): every diff is explained.
- index, all widths: the hero caption text (b2d), plus 2K to 6K px of resampling inside the card posters
  (PNG/JPG to WebP, robo 1920 to 1280 px, kaan/hurjet 1920 to 800 px). Crops: `EV/evidence-A/`
  `index-1440-caption.png`, `index-860-robo-poster.png`, `index-860-kaan-hurjet.png`. The posters look the same;
  the x8 diff only shows edges.
- charger: the new "Explore in 3D" paragraph (+76 px at 390, +50 at 860; text only at 1440/1920).
  `charger-390-explore.png`, `charger-1440-explore.png`.
- robo-catcher, rudder-pedals: 14 to 218 px in the hero poster (WebP re-encode). `robo-1440-hero.png`,
  `rudder-860-hero.png`. bend-fixture and therma-shift: identical.
- websites, privacy, 404, hi: identical.

## Step B: headings and landmarks (batch 2b)

- Home: one `<h1>` "Mert<br>Tureli" (same DisplayHeading, same look). Project, role and the About
  "Mert Tureli" titles are `h3` (`as="h3"`). Section Rules (About, Experience, What I work with,
  Recognition) are `h2`, Elsewhere is `h3` under "Get in touch". The work section has no visible label,
  so it gets a visually hidden `<h2>Work</h2>` (absolutely positioned, out of the flex flow).
- Case pages: the title is the `h1`; every Rule (Brief and each section) is an `h2`.
- Rule labels: a Rule marked `data-heading="N"` has its label span turned into an `<hN>` by
  `prerender.js`. It keeps the inline style plus `margin: 0; font-weight: inherit; line-height:
  inherit` (base.css gives h1-h4 weight 500 and the title line height). `css/depth.css` matched the
  label as `[data-depth-rule] > span`; that is now `> :is(span, h2, h3)`.
- Landmarks: SiteHeader moved out of the hero section (before it, still absolutely positioned at the top),
  so it is the banner. Content is wrapped in `<main id="main">`. The footer stays outside `<main>`. The
  header nav gets `aria-label="Main"`.
- Skip link: first element in `<body>`, "Skip to content", a mono caps paper pill with an ink border,
  off-screen until focused (`.skip-link` in the helmet style, so case pages inherit it). Crops:
  `EV/evidence-B/index_html-1440-skip.png`, `projects_charger_html-390-skip.png`. Enter moves focus into
  `<main>`.
- **Harness: 0/48 screens differ** against `d49bfd2` (`EV/regress-B/`). The only gate change is the case
  pages' h1 count going from 0 to 1.
- Outline of every page: `EV/outline-B.json`. Home:

  ```
  h1 Mert Tureli
    h2 About            > h3 Mert Tureli
    h2 Work             > h3 HOTBOX / Robo-Catcher / Deployable sensor payload / bend fixture / rudder pedals / Therma-Shift
    h2 Experience       > h3 x4 roles
    h2 What I work with
    h2 Beyond engineering
    h2 Recognition
    h2 Like what you see? Let's build yours.
    h2 Get in touch     > h3 Elsewhere
  ```
  Case pages: `h1 <title>` then one `h2` per section (Brief, The event, ..., What I learned).
  Every page: 1 main, 1 banner header outside main, 1 contentinfo footer, nav labelled, skip link present.

## Step C: batch 8 (intended visual changes)

Before/after crops (before = `829b9b3`, after = this branch, Original palette): `EV/evidence-C/`.
Harness against `829b9b3`: `EV/regress-C/` (48/80 differ: index and every case page). What each diff is:

| finding | change | crops | diffs it explains |
| --- | --- | --- | --- |
| visual-5 | A light run after a dark plate or stats band gets `var(--section-y)` top padding (`after_dark` in build-case.py). | `v5-charger-1440-after-stats.png`, `v5-charger-390-after-stats.png` | every case page grows by one section-y per dark plate (+118 to +700 px) and everything below shifts |
| visual-6 | `title_level()`: a title with a word of 10+ letters uses `--fs-display-2`. Only CHARGER (DEPLOYABLE) qualifies. Measured: at display-1 DEPLOYABLE ran 360 px past its column at 1440, and off the screen at 390. | `v6-charger-1440-hero.png`, `v6-charger-1024-hero.png`, `v6-charger-390-hero.png` | charger hero at all widths |
| visual-8 | Experience top padding 0 (Work already ends with section spacing; gap 252 to 126 px at 1440). Recognition gets bottom padding, so its last hairline and the Websites hairline no longer stack. The Websites rule uses `--line-hairline` (same value as before). | `v8-index-1440-work-experience.png`, `v8-index-1440-recognition-websites.png` | index from Experience down; net page height change is small because the two paddings cancel |
| visual-11 | Header row padding `0 max(var(--page-margin), (100% - var(--max-width)) / 2)`; the hero grid, the hero caption row, the Beyond overlay and the case hero widen to `max-width + 2 * page-margin`. Everything starts at 120 px at 1920. Nothing changes below 1856 px. | `v11-index-1920-top.png`, `v11-charger-1920-top.png`, `v11-index-1920-beyond.png` | the 1920 shots of every page (header and hero x-shift) |
| visual-13 | Experience role column 1fr to 1.2fr, so "DESIGN ENGINEER AND / MATERIALS INTERN" and "ENGINEERING INTERN" break two words a line. Same-year range "June to September 2026"; `&nbsp;` keeps every year with its month. | `v13-index-1440-roles.png`, `v13-index-1440-sunthru.png` | index Experience block (shorter by 14 to 19 px at 1440/1920) |
| visual-14 | Outline buttons keep the invert and the 2px lift. Removed: the rotating conic ring, the press `scale(.975)` and inset shadow, and the `:active` depress. Case pages: "← Previous: X" as the same outline pill as "Next" (`button(trailing=...)`). | `v14-index-1440-outline-hover.png`, `v14-charger-1440-prevnext.png`, `v14-charger-390-prevnext.png` | case-page prev/next row |
| motion-7 | depth.css, interaction-polish.css, mobile.css and the explorer launcher use `--t-hover`, `--t-enter`, `--dur-*`, `--ease-out`. `--depth-ease` and the overridden button transition are gone. Hovers go from 180 to 240 ms. Exceptions noted in depth.css: corridor 42 s drift, 1050 ms dissolve. | none (no resting-state change) | none |
| motion-10 | Option (a): `js/depth-motion.js` deleted (an opacity .85 to 1 fade plus a page-wide MutationObserver and rect scans). The Motion switch's CSS now keys on `html[data-motion]`, which site-palette.js already sets. Content was and is visible at rest. | none | none |
| motion-5 | Ripples step at a fixed 60 Hz through a time accumulator (max 2 steps a frame, backlog dropped). Same look at 60 Hz, same speed at 30/120 Hz. Stale pixel-budget comment rewritten. | none | none |

Not done in step C:
- visual-13's grid remainders (Beyond 3+2 / 4+1, skills 2-column leftover). They are layout, not orphaned
  words, and the brief scoped the item to headings.
- motion-10 option (b) (scroll-driven decoration). It reverses an owner decision (5a9e4f0).
- visual-14: I kept the lift as the one extra cue. The finding offered keeping the orbit only on "See
  the work" as an alternative; I did not do that.

## Final checks (all on opt/integrate)

- `python3 tools/build.py --check`: exit 0. `python3 check-writing.py`: 0 flagged across 9 files.
- **Harness against a6d3ea8**, all 11 pages x 390/860/1440/1920 x original/slate, corridor masked
  (`EV/regress-final/`, run on `9da5d16`; `1ae8d02` only removes the preload `<link>`s): 48/88 differ, all on index and the 5 case pages, all accounted for above (A:
  posters, caption, explore paragraph; C: the table). websites, privacy, 404, hi and photography-lab are
  identical. Gate changes: only the case-page h1 0 to 1. Candidate: 0 external hosts, 0 console errors,
  0 page errors on every page.
- `EV/final/final-checks.txt` (`EV/patches/final-checks.js`), all PASS:
  - Every page at 390 and 1440, scrolled through: no external host (analytics not even attempted on
    localhost), no console or page error.
  - Phone menu at 390 on index and charger: it opens with Work to Contact plus Email and Resume, Escape
    closes it, and Experience scrolls (index) or navigates to `index.html#experience` (case page, lands
    with the section at 72 px within 1.5 s, same as a6d3ea8). Screenshots `menu-390-*.png`.
  - Display: the footer switches original, slate, green and warm, the choice persists across reload, the
    Motion switch flips `html[data-motion]`, and the case page at 390 switches from the menu.
  - Explorer: it opens with a 778x667 canvas, Back closes it and stays on index (`explorer-open-1440.png`).
  - Websites inquiry at 390 with Formspree route-mocked: one POST, completion panel shown, no errors.
- Throttled mobile: see "Performance" below.

## Performance

Pixel 5, CDP 150 ms RTT, 1.6 Mbps down, CPU 4x, cache off, median of 5. The script is b1's, with a page
list option (`EV/patches/perf.js`). Final run: `EV/final/perf.json`. a6d3ea8 was measured in the same
session, because the absolute numbers drift between sessions by about 70 ms.

| page | batch 1 report | a6d3ea8 today | opt/integrate | LCP element now |
| --- | --- | --- | --- | --- |
| index FCP | 1400 ms | 1356 ms | 1440 ms | |
| index LCP | **3948 ms** | 4092 ms | **1544 ms** | hero poster, WebP (was the 350 KB PNG) |
| charger FCP | 1176 ms | 1224 ms | 1244 ms | |
| charger LCP | **1176 ms** | 1224 ms | **1244 ms** | the lede paragraph (unchanged) |

- Index LCP drops by about 2.5 s: the hero poster is a 15 KB WebP instead of a 350 KB PNG, and the card
  posters no longer download at t=0.
- Index FCP is +84 ms against today's a6d3ea8 run. a6d3ea8 itself measured 1432 ms in an earlier run
  this session, so this is within the session-to-session spread. Charger is +20 ms, which is noise.
- **Deviation from the brief:** the hero poster preload with `fetchpriority="high"` made both metrics
  worse, so it is not shipped. Same session, same server:
  - index with the preload: FCP = LCP 1608 ms.
  - index without it: FCP 1444, LCP 1516.
  - index with the preload minus fetchpriority: FCP 1412, LCP 1744.
  - charger with the preload: 1304. Without it: 1248.

  The static HTML already names the poster early, and at 1.6 Mbps a high-priority image competes with
  the stylesheets and fonts. To restore it, it is one `<link>` in `src/index.html`'s head.

## Copy touched (all from the handoffs or findings in scope)

Hero caption (b2d); the "Explore in 3D" sentence (b2d); meta descriptions and the CHARGER title (b6);
the websites OG image headline (b5); "← Previous:" (visual-14); "June to September 2026" (visual-13).
New UI text: "Skip to content", the hidden "Work" heading.

## Noticed, not changed (copy hold or out of scope)

- websites.html proof list still says the explorer has "thirty components at true stations". The
  explorer and the home caption now say 28.
- Charger case copy uses UK spellings ("Centre of gravity", "calibres", "Carbon fibre"). Case ledes use
  "we/our" ("We built CHARGER", "our capstone team"). b5's proposed check-writing rules (headings ending
  in "?", we/our/us) were **not** added: they would fail on this held copy and on the home page's "Like
  what you see?". check-writing.py only gained the three extra default targets.
- Home #websites block copy: b5's proposal is still pending (copy hold).
- `../index.html#x` to `../#x` (seo-9) and generating sitemap.xml from build-case.py were not asked for.
- The harness reports diff bounding boxes that stop at y=16383 on index at 390/860 (pages are 21.7K
  px). The screenshots are full height, so it looks like a cap in the diff step. The index differences
  there are fully explained by A and C, but treat the harness as blind below 16384 px on very tall pages
  until that is checked.
- Owner items carried over: the robo desktop clip is 6.2 MB (b2c contact sheet); poster-only on Safari
  without VP9 alpha (no WebKit here to test); Clarity consent for EEA/UK; the Worker must accept the new
  `ev` names; re-scrape share cards after deploy; `_headers` only matters if the site is ever on
  Cloudflare Pages.
