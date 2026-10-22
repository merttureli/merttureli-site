# HANDOFF: opt/hero (live CHARGER hero rocket, skills belt, seat to 3D explorer)

Branch `opt/hero`, from `claude/funny-sagan-acgved`, with `claude/funny-sagan-acgved` at 54dd658
(Archivo and Martian Mono) merged in. Never pushed. No copy changes: the only new strings are the
Expand button ("Expand", aria-label "Expand the CHARGER 3D explorer").
Evidence: `/tmp/claude-0/-home-user-merttureli-site/fe356c8b-023d-52dd-b7f6-84e925c9294d/scratchpad/opt/hero/`
(called `EV/` below).

## What changed

### 1. Opening rocket, live 3D (hero)
- The hero's CHARGER video is replaced by the live rocket, in the same box (`#charger-launch` keeps
  its link, cue and aria). Hero text is layered above the rocket; at rest the rocket sits in the right
  column (below the buttons on phones), so the name is never covered.
- First paint: the CAD line drawing (with internals) and a satin still are inlined (800 px webp,
  10 KB together). A CSS-only animation (`@property --rv`, 0.85 s after 0.12 s) sweeps tail to nose
  from the line drawing into the painted rocket, with a glow on the front. No script on that path.
- After `load` + idle, `assets/rocket/rocket-live.js` (three.js r186 bundled from the explorer's own
  vendored copy, 135 KB gz) mounts the matte rocket into a canvas that takes over the still.
- Scroll (native, no scroll-jacking, one rAF per scroll event, nothing when idle): the rocket lifts
  along its nose out of the hero, turns toward vertical and rolls 360 degrees about its own axis. It is
  out of view while About, HOTBOX and Robo-Catcher pass (it never covers that copy), then glides in
  from the right, rolling, and settles in the CHARGER entry's seat with zero speed against the page,
  so from then on the browser carries it natively. Canvas draws only when the roll changes; DPR is
  capped at 1.5.
- The line drawing is new: rendered from the explorer's own CAD (silhouettes, creases and open edges
  of all 28 parts, internals at 70 %) with the live camera, so it registers with the 3D build to the
  pixel. The prototype's Blender `line.webp` used another camera and would not register.
- The hero model `assets/rocket/charger-live.{json,bin}` (112 KB, plain `.bin`) is cut from the
  explorer's own `assembly.bin` (same triangles); livery is the explorer's livery canvas baked to
  `livery.webp`; materials are the explorer's; light is the prototype's matte dark-studio rig
  (`assets/rocket/rig.js`, shared with the explorer).
- Sources and rebuild steps: `tools/rocket-hero/` (cut_model.py, src/, bake.html/js, bake-run.js,
  towebp.py, build.sh).

### 2. Skills belt
- The 7-group skills grid became one belt with the same items (group labels kept as markers),
  CSS animation at ~34 px/s (duration set from the measured width), seamless (duplicate list is
  `aria-hidden`), pauses on hover and on keyboard focus (the belt is a focusable region named
  "What I work with"). Reduced motion (system setting or the site's Display switch): a static
  wrapped list.

### 3. Seat to 3D viewer
- The explorer dialog now lives inside the CHARGER seat (in place of the pad photo MediaFrame).
  Inline it is shown without `open` (no focus move, no top layer), the iframe is `aria-hidden` and
  out of the tab order, and the real `Expand` button is the keyboard path.
- Handoff: once the rocket is seated the explorer draws the same view (hero pose converted to its
  camera: same rotation, distance, px-per-metre, livery, materials and rig), then the hero canvas
  fades out over 0.22 s. Measured: the two images differ only on anti-aliased edges (EV/match1440,
  EV/match390: about 0.7 % / 0.35 % of slot pixels over 24 levels, all edge pixels).
- Inline behaviour: drag to orbit (the explorer's own OrbitControls), wheel and vertical swipes still
  scroll the page (`touch-action: pan-y`, zoom off inline), a tap expands. After a drag the rocket
  stays seated (no fly-back on scroll up).
- Expand (button, tap, `#charger-launch`, any `a[href="#charger-explorer"]`): the dialog opens modal
  and its clip grows from the seat rect while the dark panel fades in under the rocket; the explorer
  animates the same rocket from the seat pose to its own opening view (light rigs crossfade), the UI
  fades in at the end. Close reverses into the seat. From the hero (explorer already loaded) it grows
  from the hero rocket and returns to it. If the explorer has not loaded yet, the dialog opens as
  before and loads it. Back closes, history and focus return as before. Reduced motion: 0.2 s fades,
  no rocket move.
- Explorer changes (`assets/charger-explorer/`): `?inline=1` mode and a `window.chargerExplorer`
  handoff API in app.js, inline CSS in style.css, nose-cone normals smoothed (`nose-normals.js`,
  shared with the hero; removes CAD blotches), `three.module.min.js` (same r186, minified: 190 KB gz
  instead of 419 KB) in the import map. The standalone page and the full-screen dialog behave as
  before (EV/shots-explorer2.png).
- Loading: explorer assets load on the way down (once the hero is behind and the seat is within four
  screens, on idle), not on page load (0 explorer requests before scrolling in every perf run).
- Analytics: `data-track="charger-3d-inline"` on the seat, `data-track="charger-3d-expand"` on the
  button, and `mtTrack('charger-3d-expand')` / `mtTrack('charger-3d-inline-drag')` events. Existing
  section ids unchanged.

### Outside the three items (needed for the budget)
- `js/site-palette.js`: `update()` rewrote the Display switch label on every call, which retriggered
  its own MutationObserver forever (~450 DOM writes/s) and woke `mobile-nav.js`'s rAF every frame on
  every page. Now it writes only on change. Idle rAF went from 180 per 3 s to 0, on all pages.

## Verification
- `python3 tools/build.py --check` passes. No horizontal scroll at 390/860/1440/1920. No console
  errors (the only 404 in local runs is `/assets/grain.svg`, an absolute path that resolves on the
  real site; it only fails because I served base and candidate under subpaths).
- Section-aligned harness diff (harness settings: reduced motion, frozen clock, original and slate,
  390/860/1440/1920, corridor masked; changed sections pinned to baseline height so everything after
  them sits at the same subpixel offset): 0 diff in every section except hero, CHARGER article and
  skills (EV/sdiff-results.txt, images in EV/sdiff/). Other pages: 0 diff (EV/odiff; websites 1440 is
  a lazy preview iframe timing flake, 404 is the requested-URL text). The stock full-page harness
  will report shifts below the CHARGER entry and skills because those sections changed height.
  I did not run it because it needs two extra ports.
- Recordings (frame sequences + mp4): full scroll `EV/final/scroll-1440.mp4`, `EV/final/scroll-390.mp4`
  (frames in `EV/final/scroll-*/`); seat to dialog and back, slowed 40-60x for capture
  `EV/final/handoff-1440.mp4`, `EV/final/handoff-390.mp4` (frames `EV/final/handoff-*/`); hero entry
  `EV/rec/sheet-hero-open.jpg`, `EV/rec/sheet-hero-close.jpg`; CSS build stretched
  `EV/rec/sheet-build-1440.jpg`; reduced motion `EV/reduce/sheet.jpg`, `EV/rec/sheet-390-reduce.jpg`;
  interactions (cold open, Back, keyboard, drag, tap) `EV/inter/`. Touch: a vertical swipe over the
  inline explorer scrolls the page, a horizontal one turns the rocket (EV/tools/touch.js).
- Performance (EV/perf/*.json, tools in EV/tools/perf.js). Served with gzip like GitHub Pages
  (EV/tools/gzserve.js on port 8892), cache off. Mobile = 390x844 DPR 3, 4x CPU, Fast 3G, 5 runs;
  WebGL is SwiftShader (CPU), so GPU-side costs are pessimistic.

| | current site | opt/hero |
|---|---|---|
| FCP median (mobile) | 2668 ms | 2672 ms |
| LCP median (mobile) | 3244 ms (hero video poster) | 2672 ms (inlined line drawing = FCP) |
| LCP desktop 1440, 3 runs | 628 / 152 / 348 ms | 616 / 140 / 200 ms |
| Bytes before scrolling (mobile) | 1238 KB | 994 KB |
| Explorer requests before scrolling | 0 | 0 |
| rAF calls in 3 s idle, top / at the seat | 180 / 180 | 0 / 0 |
| Main thread per scroll frame, top to seat (mobile) | 8.6 ms | 3.4 ms |
| Long tasks in the 9 s after navigation (mobile) | 2-5, 273-462 ms | 5-8, 629-1016 ms |

  The extra long tasks are the live rocket mounting after `load` + idle (module, geometry, shader
  compile; SwiftShader compile is ~220 ms of it). It is split into steps with yields and uses
  `compileAsync` where the GPU supports it. Draw cost per roll frame: 0.4-0.7 ms main thread.

## Open questions for the owner
1. The CHARGER entry's pad photo ("On the pad") is gone from the home page, as asked ("in place of
   CHARGER's current media"). It is still on the case study page. Bring it back somewhere?
2. Between the hero and the CHARGER entry the rocket is out of view (it launches out of the hero and
   glides back in) instead of floating over the About, HOTBOX and Robo-Catcher copy. OK?
3. On desktop the explorer (~2.7 MB, mostly the CAD binary) starts loading right after the hero,
   because CHARGER is only ~3 screens down. Fine, or wait until closer?
4. The explorer's look is unchanged except the smoother nose cone. While it is inline it uses the
   hero's matte rig and crossfades to its own lighting as it expands. Prefer the matte rig in the
   full-screen explorer too?
5. Hero video files `assets/motion/charger-painted-wide*` are no longer used by the home page (still
   referenced by the case pages' generated head and websites.html, so I left them).
