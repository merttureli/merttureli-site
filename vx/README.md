# vx

The experimental build of merttureli.com, reachable at `/vx/`. It is a separate entry point beside the production site, not a replacement for it: plain HTML, CSS and ES modules, no build step, no bundler, no CDN. The only third-party code is the three.js the CHARGER explorer already ships, imported through an import map from `assets/charger-explorer/vendor/`.

The page is the launch control console for CHARGER. It boots with a measured T-minus sequence while a pen plotter draws the rocket from its wire geometry as the bytes arrive, renders the flight model live from the published assembly inside a page wind-tunnel simulation, flies the camera down the stack station by station as the page scrolls, and instruments itself in the open: an altimeter, a vertical-speed indicator and an engine gauge read the page, a telemetry wall and an adaptive quality governor show their numbers, a console answers real commands, and a build manifest lists every file the page loaded with its measured transfer size. Every number on the page is measured from the page in the visitor's browser. Nothing is sent anywhere, and there are no analytics.

Every sentence is copied from `index.html`, `projects/charger.html`, the explorer's `part-stories.js` or `vx/js/data/mission.js`; anything derived is labelled DERIVED. Decorative numbers are labelled as page instrumentation (`SRC: SCROLL`, `SRC: RAF`, `SRC: GAMEPAD`, `PAGE SIMULATION`), never as flight data.

## Files

```
vx/
  index.html            the page
  README.md             this file
  css/
    tokens.css          tokens, fonts, base styles (shared)
    lab.css             layout for the lab pages (shared)
    vx.css              page layout: header, range track and sticky stage, sheets, plates, fixed roots, footer
    mobile.css          under 860 px: strip instruments, ticker, bottom sheet, shorter track, safe areas
    <module>.css        one file per module, class prefix per module
  js/
    main.js             the page integrator: boots, mounts every module, wires the bus, routes, console commands
    core/               bus.js, governor.js (quality tiers), scroll.js (sampler), media.js (near-viewport video)
    boot.js, plotter.js the T-minus overlay and the pen plotter
    stage/              the three.js stage: stage.js, loader.js, path.js, explode.js
    tunnel/             the WebGL2 wind tunnel: tunnel.js, shaders.js, gl.js
    callouts.js         leader-line part callouts
    instruments.js      altimeter, VSI, engine gauge (instruments-draw.js holds the pure drawing helpers)
    telemetry.js        the telemetry wall and ticker
    console.js          the command console; data/vfs.js is the manifest of real repository files
    hid.js              the Gamepad API bench
    contact-sheet.js    the contact sheet; data/frames.js is the frame manifest with real dimensions
    dimension.js        live dimension lines
    timeline.js, ladder.js, timeline-util.js, data/mission.js   the mission timeline and the flight-event ladder
    data/stations.js    the eight stops of the stack walk
  lab/
    index.html          LAB / 00 / INDEX, one line per lab page
    <module>.html       each engine alone with its parameters exposed
```

## Modules

| id | lab page | what it does |
| --- | --- | --- |
| stage | `lab/stage.html` | CHARGER rendered live from `assembly.json` + `assembly.bin`; pad view, eight-station descent on a Catmull-Rom path, the explorer's explode displacement, silhouette for the tunnel |
| callouts | `lab/callouts.html` | anchor dot, 45 degree elbow, horizontal run to a label rail; labels from the part stories; bottom sheet on coarse pointers |
| tunnel | `lab/tunnel.html` | stable fluids on ping-pong framebuffers, obstacle from the stage silhouette, pointer splats, four field views |
| boot | `lab/boot.html` | the T-minus sequence with measured steps; the plotter draws the exterior parts as their byte ranges arrive |
| instruments | `lab/instruments.html` | altimeter tape with the sections as station marks, VSI with peak hold, engine gauge of frame time with tier annunciators |
| telemetry | `lab/telemetry.html` | ten cells and two strip charts; `status` in the console prints its snapshot |
| console | `lab/console.html` | `/` or Ctrl K; built-ins plus the page's commands (goto, explode, mode, gov, telemetry, status, manifest, export, reader, dim, boot, field, websites, inquire, resume, linkedin, mail, lab) |
| hid | `lab/hid.html` | three gauges reading a connected controller through the Gamepad API |
| contact-sheet | `lab/contact-sheet.html` | 35 frames in 36 cells, a native-resolution loupe, a viewer, I/O marks and a PNG export |
| dimension | `lab/dimension.html` | dimension lines in px and mm on `[data-dim]` elements; `dim` in the console |
| timeline | `lab/timeline.html` | the month axis Aug 2023 to Sep 2026, the launch weekend hour track, the flight-event ladder |

## Quality tiers

`core/governor.js` measures real frame intervals and assigns a tier from 3 (full) to 0 (static). Every heavy module reads it: the tunnel changes grid and solver iterations, the stage its DPR and render policy, the instruments and strip charts their rate. `prefers-reduced-motion` forces tier 0. `?tier=N` pins a tier for verification; the last stable tier is stored locally as `vx-tier`.

## URL switches and storage

- `?tier=N` pins the governor; `?field=pressure` picks the tunnel's composite view.
- `?noboot`, `?card` and `#card` skip the boot overlay.
- Hash routes: `#pad`, `#03-charger`, `#ladder`, `#decisions`, `#weekend`, `#01-hotbox`, `#02-robo-catcher`, `#04-bend-fixture`, `#05-rudder-pedals`, `#06-therma-shift`, `#experience`, `#skills`, `#beyond`, `#recognition`, `#websites`, `#contact`. An unknown hash prints `NO SECTION AT #name` in the console log.
- `localStorage`: `vx-boot-v1` (boot seen), `vx-tier` (last stable tier), `vx-reader` (reading mode). `sessionStorage`: `vx-console-history`.

Reading mode (the header toggle or `reader` in the console) unpins the stage, lists the eight stations with their parts as text, freezes the instruments and sets tier 0. It is the screen-reader and keyboard path and is independent of reduced motion.

## Verification

The harness serves the repository root, opens a page at 1440 x 900 and 390 x 844, scrolls through it, screenshots, records console errors, page errors and failed requests, measures frame times during a scroll sweep, checks horizontal overflow, tabs through the page and re-runs under reduced motion and, with `--no-gl`, without WebGL. A page is not done while it logs anything.

```
node <scratchpad>/harness/check.cjs vx/index.html --out <dir> --no-gl
node <scratchpad>/harness/check.cjs 'vx/index.html?tier=3&noboot=1' --out <dir>
node <scratchpad>/harness/check.cjs vx/lab/index.html --out <dir>
node --check vx/js/main.js
```

Frame times measured by the harness reflect software rendering (SwiftShader) in headless Chromium, not GPU cost; on a GPU the stage renders in 1 to 3 ms and the governor keeps tier 3.
