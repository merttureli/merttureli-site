# HANDOFF: opt/hero2 (one rocket, hero into its own CHARGER section)

Branch `opt/hero2`, from `claude/funny-sagan-acgved` (cc98398). Never pushed.
Evidence: `/tmp/claude-0/-home-user-merttureli-site/fe356c8b-023d-52dd-b7f6-84e925c9294d/scratchpad/opt/hero2/`
(called `EV/` below). Tools used are in `EV/tools/`.

## What the owner saw, and why
Two rockets: the hero rocket lifted out of the top of the screen while a second copy (a still image in the
CHARGER seat, `.seat-rocket`) glided in from the right, three screens further down. Both are gone: there is
now one rocket element for the whole trip.

## What changed

### 1. Page structure (`src/index.html`, rebuilt `index.html`)
- New `<section id="charger" class="on-dark charger-feature">` right after the hero: label, a large
  `CHARGER` heading (h2), then the entry's existing text unchanged (Deployable sensor payload, team line,
  both paragraphs, the four specs), `Read the case study` and `Explore this rocket`, and the seat with the
  explorer dialog and `Expand`. The CHARGER article is removed from `#work`; the rest keeps its order.
- Index labels: CHARGER is now 01, HOTBOX 02, Robo-Catcher 03 (bend fixture 04 onward unchanged).
- Text: nothing removed or reworded. The only additions are the `CHARGER` heading (asked for) and the
  Explore button, which reuses the hero's existing "Explore this rocket" label (`data-charger-open`; it
  opens the explorer like Expand, and falls back to the explorer page without JS).
- Hero `overflow: hidden` became `overflow-x: clip`, so the rocket can leave the hero downward.

### 2. One rocket, one continuous flight (`js/rocket-flight.js`, `css/rocket.css`)
- The hero's rocket box is the only rocket. Scrolling moves it along a cubic path in screen space, from its
  rest pose to the seat, while it rolls 360 degrees, turns from 61 to 24 degrees and scales to the seat size.
  It leaves drifting up slower than the page (so it falls down the page, behind MERT TURELI's column) and
  arrives moving exactly with the page, so after the landing the browser carries it natively. It is on
  screen the whole way (path traces `EV/after/path-1440.txt`, `EV/after/path-390.txt`; rocket
  count is exactly 1 at every scroll point at 390, 860, 1440 and 1920, `EV/after/rockets-count.txt`).
- The CHARGER heading and copy sit above the rocket (it flies behind them, like the hero text).
- Native scroll only, one rAF per scroll event, nothing when idle; the canvas draws only when the roll
  changes, DPR capped at 1.5 (the canvas is sized for the larger of the hero and seat sizes).
- Reduced motion (system or Display switch, live): the rocket rests in the hero; past half way to CHARGER
  it fades out (0.2 s) and fades in at the seat, where the explorer takes over. Never two at once.

### 3. One ground, one shift to light
- Hero and CHARGER share `--ink-900`. The hero's foot band (darker gradient plus a hairline) now fades to
  plain ink, so the edge is invisible (pixel rows across it are equal within the grain's 1 level,
  `EV/after/b1440/`, `EV/after/b390/`). Follows every palette (`--ink-900`).
- `.charger-shift`: one 160 to 340 px eased gradient band (smoothstep stops in oklab, with a plain
  linear-gradient fallback) from ink to paper after the CHARGER section.

### 4. Seat, inline viewer and full-screen explorer in the same colour (`integration.js`, `app.js`, CSS)
- Handoff as before (same pose, camera and rig): measured difference rocket vs explorer at the seat
  0.23 % of seat pixels at 1440 and 0.7 % at 390 (DPR 2), all anti-aliased edges (`EV/after/match*/compare.png`).
- The inline viewer is transparent on the section's ink; the dialog is now full-bleed, with no border,
  shadow or backdrop blur, and its panel is `--ink-900`. From the seat the panel is opaque from the first
  frame, so Expand/Close only move the clip edges: no grey, no fade, no colour step (frame sampling of the
  background through open and close: identical values, original and slate, `EV/after/h1440*`).
- The explorer page paints with its own `--ink`; the host now sets it to the page's `--ink-900` (per
  palette) on load and on every open, so non-original palettes match too.
- After the visitor drags the inline rocket, scrolling back up first turns it back to the seated pose
  (0.3 s, new `chargerExplorer.settle`), then the flight rocket takes over and eases onto its path. No
  moment with two rockets (`EV/after/inter1440/2-up40-*.png`).
- Plain open (explorer not loaded yet, or reduced motion) is a short opacity fade of the ink panel.

### 5. Explorer loading
- Desktop (min-width 861px, fine pointer, no Save-Data, not 2g/3g): preloads once the page has settled after
  load and nothing is scrolling, so its heavy setup never lands mid-flight. Without this, the setup ran
  during the flight and cost 7 to 11 ms per scroll frame on desktop (SwiftShader).
- Phones and slow links: on the first pause in scrolling past 12 % of a screen, or at the landing. Our
  rocket holds the seat until the explorer is ready, so a late explorer never shows as a gap.

## Verification
- `python3 tools/build.py --check` passes; `check-writing.py index.html` clean; visible-text diff vs base:
  only `CHARGER` and one more `Explore this rocket` (`EV/tools/textdiff.py`). No horizontal overflow at
  390/860/1440/1920. No console errors in any run.
- Recordings (frames + mp4): whole page top to bottom `EV/final/scroll-1440.mp4`, `EV/final/scroll-390.mp4`
  (frames in `EV/final/scroll-*/`, sheets `EV/final/sheet-scroll-*.jpg`); seat to dialog and back, slowed 14x
  `EV/final/handoff-1440.mp4`, `EV/final/handoff-390.mp4` (sheets `EV/final/sheet-handoff-*.jpg`). Also 860
  and 1920 flights `EV/after/sheet-s860.jpg`, `EV/after/sheet-s1920.jpg`; reduced motion
  `EV/after/sheet-reduce*.jpg`; mid-flight Explore, drag, keyboard, Back `EV/after/inter*/`.
- Baseline (before) flight: `EV/before/sheet-scroll-*.jpg`. Prototype sheets compared:
  `redesign/b2/home/review/sheet-live-*.jpg` (frames 00 to 04): same camera-still feel, the rocket stays in
  view rolling while the name scrolls under it and the CHARGER title screen rises to meet it.
- Colour boundaries, every top-level section at 390 and 1440: `EV/after/sheet-b1440.jpg`,
  `EV/after/sheet-b390.jpg`. Real wheel scrolling captured frame by frame through the shift: no light frame
  in the dark part (`EV/tools/wheel.js`). Note: programmatic smooth `scrollTo` screenshots in headless Chrome
  show a transient white bar at the top; it is a capture artifact (absent with instant scroll and with real
  wheel input), present in the base too.
- Section-aligned harness diff (reduced motion, frozen clock, original and slate, 4 widths; CHARGER removed
  from both copies so the rest aligns, `EV/sdiff-results.txt`): 0 diff everywhere except the hero (its
  bottom band, 0.01 to 0.15 %), HOTBOX and Robo-Catcher (the index numbers, about 25 px), and one
  subpixel row at the top of About at 860 (the hero's last row). The stock full-page harness will report
  shifts below the hero because CHARGER moved.
- Performance (`EV/perf/*.json`, mobile = 390x844 DPR 3, 4x CPU, Fast 3G; WebGL on SwiftShader):

| | base (current branch) | opt/hero2 |
|---|---|---|
| LCP mobile, 3 runs | 3088 / 3184 / 2624 ms | 3096 / 3156 / 2596 ms (same element, the inlined line drawing) |
| LCP desktop, 3 runs | 576 / 136 / 148 ms | 556 / 160 / 140 ms |
| Idle rAF in 3 s, top / seated / below (page and explorer iframe) | 0 / 0 | 0 / 0 / 0 |
| Explorer requests before scrolling, mobile | 0 | 0 |
| Explorer requests before scrolling, desktop | 0 | 5 (idle preload, see 5) |
| Main thread per scroll frame to the seat, desktop | 1.2 to 1.3 ms | 1.1 to 1.6 ms |
| Main thread per scroll frame to the seat, mobile | 3.4 to 3.7 ms | 3.8 to 6.8 ms |

  Mobile per-frame cost is higher because every frame of the (now one-screen) flight draws the roll, where
  before most of the long scroll had the rocket off screen; the draw is SwiftShader CPU raster here.

## For the owner / orchestrator
1. `See the work` still jumps to `#work` (now starting at HOTBOX, below About), section ids unchanged.
   Point it at `#charger` instead? (one-attribute change in `src/index.html`)
2. Desktop now preloads the explorer (about 2.7 MB) after the page settles. Fine, or wait for a scroll?
3. Other dark/light edges further down are unchanged hard edges between photo or shader blocks and paper:
   skills to the Beyond photo, the Beyond gallery to Recognition, Websites to the Contact smoke, Contact to
   the footer. No flashes or mismatched colours found there; they could get the same gradient band if wanted.
4. The full-screen explorer is now edge to edge on desktop (it was inset 20 px with a border), so its colour
   meets the section's directly.
