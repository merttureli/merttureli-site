# vx: CHARGER field study

The experimental build of merttureli.com, reachable at `/vx/` (noindex). It sits beside the production site and does not replace it: plain HTML, CSS and ES modules, no build step, no bundler, no CDN. The only third-party code is the three.js r186 the CHARGER explorer already ships, imported through an import map from `assets/charger-explorer/vendor/`.

The page answers one question for anyone: what do the fins do? It launches CHARGER (Union College Rocket Team, first place in the Deployable Sensor Payload event at Battle of the Rockets 2026) again from the CAD, in slow motion, with and without its four fins. Two models, two jobs:

- **Flight** (CPU, pure JS) flies the rocket: a planar rigid body (downrange, altitude, pitch), RK4 at 1 ms, Barrowman (1967) normal-force slopes and centers of pressure for the ogive nose and four fins with body interference, body lift at large angles of attack as OpenRocket adds it, pitch damping (Mandell, Caporaso and Bengen) and jet damping with the variable-mass term (Thomson 1961), the AeroTech G77R thrust curve, a rail with the CAD's button stations, wind and gusts. One drag coefficient is fitted so the still-air apogee equals the case study's 1,033 ft. The CG is the CAD airframe's estimate, 27.17 in from the nose (see "The CG" below).
- **Lattice** (GPU, three.js render targets) shows the air: a D2Q9 lattice Boltzmann section through the pitch plane (Chen and Doolen 1998) with a Smagorinsky subgrid model (Hou, Sterling, Chen and Doolen 1996) and halfway bounce-back walls, computed in the body's own frame so the pitch rate reaches the air as Coriolis, centrifugal and Euler forces by Guo forcing (Guo, Zheng and Shi 2002). The flow runs at an inflow of at most 0.05 lattice units, lattice Reynolds number 900 to 1,500. The air arrives at the flight model's angle of attack. Its force and moment, measured by momentum exchange, belong to a 2D section and are not comparable with the rocket's (validation track L3: the section's center of pressure sits 15 to 18 in from the nose, Barrowman's at 29 to 33 in), so the panel shows them only under `?lab`, as chord-pass means labeled 2D SECTION ONLY / NOT COMPARABLE; a lab toggle lets the lattice moment fly the rocket instead, and says it is not quantitative.

The appendix states the limits in three lines (a 2D slice, not 3D; slow motion, not a film of the flow; a Reynolds number over 100 times too low, so the lattice shows the air and does not check the flight model, which flies the rocket), then the method and the configuration in full.

## What a visitor sees

1. **The stage, one screen.** The header: the MERT TURELI wordmark (to `/`), CHARGER FIELD STUDY 01, the time code with the true playback rate (`T+00.436 / 1/20 AUTO`, `HOLD`, `PAUSED`), CASE STUDY, RUNS, SITE. Over the 3D view, the title plate: the eyebrow, WHAT THE FINS DO (the page's one h1), one plain sentence, the byline with its PAGE tag and two pills, WATCH WITH FINS and WITHOUT FINS. The flight panel sits in a right rail (a bottom sheet on phones), the strip chart in a dock under the view.
2. **The default launch.** Full fins, still air and an 11.2 mph EST gust at rail exit (Run 05's conditions). The replay narrates itself in plain captions, slows through the wobble, holds 1.5 s at the first swing (HOLD) and pauses at apogee.
3. **The end plate.** At apogee the camera eases back to a face-on view of the whole path from the pad, with the other fin choice's path as a ghost, flown silently in the same tab; the end card shows the apogee and the time back under 2° after the gust, with REPLAY, WITHOUT FINS (WITH FINS after a finless flight), THE CASE STUDY and CONTINUE PAST APOGEE. Its last line names the two paths and their conditions: FULL FINS AND NO FINS / THE SAME GUST, 11.2 MPH EST / BOTH FLOWN IN THIS TAB / SIM.
4. **Below the stage.** A first-person lede with the brief rows from the case study and the lede figure (both paths on one set of equal-scale ft axes, with their apogees in display type), the five runs (each with a path sketch on the axes every card shares), the appendix (the three limits, Method, Configuration) and Words used here. The footer carries the exits: Resume (PDF), LinkedIn, Email, the case study, merttureli.com, the labs.

## Source tags

Every number on the page carries one.

| tag | meaning |
| --- | --- |
| PAGE | published on merttureli.com (`projects/charger.html`, `index.html`) |
| CAD | measured from `assets/charger-explorer/assembly.json` and `assembly.bin` |
| EST | estimated here; the page or the code says how |
| FIT | fitted to a published figure (the drag coefficient, to the 1,033 ft apogee) |
| SIM | computed live in the tab (or, for the baked figures, by the same modules in node; the page re-flies them) |
| STD | textbook constant or method, with the reference named |

The case study and the CAD agree on four trapezoidal fins, a 2.68 in body (2.677 in in the CAD), and the fin root chord and sweep. Four differences remain, stated in Method 05: the length (CAD 46.49 in against the case study's 37 in, an open question for the owner, flagged `vx-length`), the CG (below, flagged `vx-cg`), the stability margin (2.16 cal at the CAD CG estimate, 4.09 cal at the case study's 22 in, against the case study's 1.80 cal for its 37 in airframe, which stays the case study's figure) and the fin height (CAD span 2.17 in against 2.36 in). Shape comes from the CAD, mass from the page (2.2 lb, flagged `vx-mass`: the case study no longer states it).

## The CG

The page's shape is the CAD's, and the case study's 22 in CG belongs to its 37 in design (59.5 percent of its length). Every part-wise estimate of the 46.49 in CAD airframe at the page mass gives 27.09 to 27.24 in (validation F1, case F02: CAD part volumes, OpenRocket material densities, nine density scenarios), so the page flies `flight.js CG_ESTIMATE_CAD`, 0.690 m (27.17 in, EST), through `story.js CG_DEFAULT_IN`: the flight's default in `main.js`, the run starts, the run cards, the figures, the end card and the configuration rows (`configValues`). `flight.js` itself keeps the PAGE 22 in as its default (FIELD 1), so the labs and the tests still fly it. The 22 in stays on the page as the case study's figure (Method 05, the configuration's case study rows), never as this study's result, and the panel's CG slider moves the CG (`?cg=<in>`). At the estimate the margin is 2.16 cal (2.01 to 2.47 over the density scenarios); at 22 in it would be 4.09 cal. The difference shows most without fins: body lift acts at the planform centroid, 24.22 in from the nose, which is ahead of 27.17 in, so the finless and half-fin rockets tumble (Runs 02 and 03); at 22 in the finless one pitched over and arced away instead. Open question for the owner, flagged `vx-cg` next to `vx-length`: a measured CG replaces the estimate.

## Validation

Both models were checked against published references, closed forms and an independent code in five tracks (L1 to L3 for the lattice, F1 and F2 for the flight model), then fixed where the checks found a defect and checked again. `lab/validation.html` lists all 351 cases with the reference and its source, the measured value (and the value before the fixes where a case was measured again), the error, the tolerance set before the run and the result: 230 pass, 91 fail, 30 informational, counting the 105 cases measured again after the fixes at their new result. Most fails are in the lattice tracks: the cylinder at the page's own grid and domain, and the 2D section against the 3D rocket.

What the fixes changed:

- Lattice (`lattice.js`, `shaders.js`): the inflow is capped at 0.05 lattice units (`U_CAP`; Re 1,500 at that speed, the same tau0, so the lattice Re runs 900 to 1,500) and the body rate is scaled with it; the pitch rate runs in the body frame (walls at rest, Coriolis, centrifugal, Euler and frame-acceleration forces by Guo forcing; `setBodyRate(omega, 'wall')` keeps the moving wall for spinning cylinders); the outflow edges keep only the regularized non-equilibrium part (Latt et al. 2008); the textures hold f_i - w_i; forces count as developed after 1.5 body lengths of travel and `force.mean` holds the chord-pass means; the cylinder gate runs to saturation 16 D behind the inflow edge of a 768 x 192 grid against unconfined references and reads C_D 1.369 and St 0.164 (1.320 and 0.165 published).
- Flight (`flight.js`, `barrowman.js`): jet damping with the variable-mass term; the damping ratio and frequency from the two-degree-of-freedom short period (Mandell's values stay as `dampingRatioMandell`); rail events interpolated to the exact crossing; the nose CP on the exposed 0.200 m ogive (vehicle CP 32.94 in); the CAD's rail-button stations (rail exit 43.3 ft/s, 46.4 with the case study's); `CG_ESTIMATE_CAD` and `derived.staticMarginCadCg` exported.

The limits the page states, in short: the lattice runs at Re 900 to 1,500 against about 3 x 10^5 for the rocket, with 10 to 25 percent extra viscosity in the wall cells; the 2D section's center of pressure sits 15 to 18 in from the nose against Barrowman's 29 to 33 in, its normal force is 16 to 35 times Barrowman's and the page's domain inflates it about 1.7 times; a pitching plate in the body frame gets 0.38 of its lift slope per unit pitch rate against 0.5, so the section's damping is not the rocket's and LATTICE FLIES IT is not quantitative; the inflow edge delivers 97.9 and 96.3 percent of the inflow at 5 and 10 deg; single force readings scatter by 22 and 66 percent (C_N, C_m); staircase walls leave a grid error of several percent; the CG is an estimate; the slender-rod inertia is 17 to 26 percent high; the drag coefficient is fitted to a simulated apogee and there is no flight data (a component estimate gives 0.44 to 0.66); constant sea-level density puts apogee 0.38 percent low; Barrowman and RocketPy agreeing checks the arithmetic, not the method; software-GL step rates say nothing about a graphics card. The full lists (25 lattice and 17 flight limits) are on the validation lab.

Run it:

```
# the flight model's tests (26) and the flight validation runner, plain node
node vx/js/flight/flight.test.mjs
node vx/js/validation/f1-flight.mjs

# serve the repository root, then open the labs
python3 -m http.server 8000
#   /vx/lab/validation.html                    every case, filterable (all / fail only / measured after the fix)
#   /vx/lab/lattice.html?validate=cylinder     the lattice gate on this machine's GPU (seconds on a graphics card)
#   /vx/lab/validation/l1.html?case=poiseuille&H=16&tau=0.8&re=10&model=plain   one L1 bench case
```

`vx/js/validation/f1-flight.mjs` still hard-codes the 0.232 m nose and the case study's rail stations in two references (A10 and C11), so it reports 38 of 40 against the fixed engine; the fix phase's copy passes 42 of 42 (an open item for the validation area).

## Files

```
vx/
  index.html            the field study page
  README.md             this file
  og-field.png          the share image: a real 1200 x 630 capture of the title plate (tools/capture-og.cjs)
  css/
    tokens.css          tokens, fonts, base styles (shared, do not edit)
    field.css           the page: header, stage (title plate, captions, legend, slate, end card), path figures, reading sections, footer, the bench section
    panel.css           the instrument panel, the phone sheet, the chart dock
    scene.css           hooks for the 3D canvas
  js/
    main.js             the integrator: playback and the speed ramp, the apogee stop, the end plate hand-off, the AUTO view, URL state, runs and figures, the configuration table, the lattice slot, the idle pause, the lost-context handling, ?bench
    story.js            the story layer: the run tracker (the run cards' definitions), the runs, the pre-flight plans and the ramp, the narrator, the path figures, a plain fallback director, the end card, the title plate, the slate
    core/bus.js         typed event bus (flight:event, flight:reset, flight:config, lattice:stats, ui:view, ui:camera, governor:tier)
    core/governor.js    adaptive quality tiers 3 to 0 from measured frame times
    data/motor-g77r.js  the G77R thrust curve from its RASP file
    data/stations.js    station data; the loader reads HIDDEN_IDS from it
    data/validation.js  the validation campaign's results, rendered by lab/validation.html (generated)
    stage/loader.js     loads assembly.json and assembly.bin and builds the three.js parts
    stage/explode.js    part centers for the loader
    flight/             flight.js, barrowman.js, flight.test.mjs
    geom/               geom.js (sections and measurements), geom-measure.js, geom-cad.js (the baked measurement), geom-bake.mjs
    lattice/            lattice.js, shaders.js, lattice-lab.js
    scene/              scene.js, slice.js, markers.js, camera.js, exhaust.js, director.js (the camera director and the end plate), trail.js and polyline.js (the paths), scene-testcard.js (lab only)
    panel/              panel.js, controls.js, chart.js, fallback.js (the 2D view), format.js, lab-script.js (lab only)
    validation/         the validation benches (lab only)
  tools/
    bake-figure.mjs     bakes the lede figure, the run sketches, the run cards' static numbers and the configuration's computed values into index.html (node)
    capture-og.cjs      captures og-field.png from the running page (Playwright)
  lab/
    index.html          the lab index
    flight.html, geom.html, lattice.html, scene.html, panel.html
    validation.html     every validation case with its reference, error, tolerance and result
    validation/         the lattice bench pages (L1, L2 cylinder, L3)
```

## Modules

| module | factory | lab |
| --- | --- | --- |
| flight | `createFlight(config, {bus})` -> state, derived, events, history, step, reset, ignite, gust, flick, setters | `lab/flight.html` |
| geometry | `getBakedGeometry()`, `loadFieldGeometry({geometry})` -> profile, fin, refs, `buildSection({cols, rows, finScale, view, cgM})`, `sectionPolygons()` | `lab/geom.html` |
| lattice | `createLattice(renderer, {cols, rows, tier})` -> ready, fallback, setSection, setInflow, setBodyRate, setView, setTier, frame, step, sync, sampleForce, check, texture, force, stats | `lab/lattice.html` |
| scene | `createScene(canvas, {tier, zoom, touchAction, cad, onProgress})` -> ready, renderer, cad, setFlight, setSliceTexture, setSliceView, setCamera, setFraming, setDissolve, setEmphasis, setSliceOpacity, setTrail, setGhostTrail, setPlate, setOverlays, onFlight, onCameraMode, render | `lab/scene.html` |
| director | `createDirector(scene, {flight, reduced, plan, gustMph, ghost, avoid})` -> active, phase, plate, release, pad, launch, playing, noteGust, diverge, destroy | `lab/scene.html` |
| panel | `mountPanel(stage, {flight, playback, scene, lattice, geometry, startRun, disarmGust, armedGust, prepareLaunch})` -> set, press, attach, sync, onControl, setAutoView, setPeekCaption, muteEvents; `createFallbackView()` for no WebGL2 | `lab/panel.html` |
| story | `createRunTracker(flight)`; `planFlight(config, {gustMph})` / `createPlanner()` -> kind, beats, beatList, keys, slow, freezeAt, rateAt, screen, path, trace, result; `createNarrator({onCaption, onEmphasis})`; `RUNS`, `LAUNCHES`, `runFlightConfig`, `runCardValues`, `liftTurnDeg`, `configValues`, `stillAirApogee`; `pathFigure`, `ledeFigure`, `runSketch`; `createStory({stage, ...})` -> showEnd, hideEnd, plateLine, caption, showPlate, hidePlate, slate, setBeats | none (the page) |

Every factory returns an object with `destroy()`, honors `prefers-reduced-motion` and survives a missing WebGL2 context. Each module's header comment has its full API. They share one sign convention: x downrange (the wind blows toward +x), y up, pitch from +y positive toward +x, and alpha from the relative wind to the body axis, positive toward +x.

## The page (`js/main.js`)

- **Init order**: governor pin from `?tier` (or the benchmark's first tier), the baked geometry, the flight with the URL configuration, the playback object, the panel, then, when WebGL2 is there, the scene module, the scene's director and the CAD assembly in parallel (the CAD fetch reports its bytes on the stage's status line, `LOADING THE CAD ASSEMBLY / 1.2 OF 2.5 MB`, at most once a second, and is handed to `createScene({cad})`), then the lattice through `attachLattice()`. Without WebGL2, or when the scene fails, the panel's 2D view. The run previews, the figures and the pad's plan are flown in idle time.
- **Head order**: the four stylesheets come first, then the font preloads, the import map and the module preloads: the page's static graph and the 3D scene's chain (three.js, the scene modules, the loader), so they arrive in parallel instead of one hop at a time.
- **Default launch**: with no flight setting in the URL (`fins`, `cg`, `rail`, `angle`, `wind`, `gust`, `hold`), LAUNCH, L, the title plate's WATCH WITH FINS and a bare `?autolaunch=1` fly Run 05's conditions: full fins, still air, the 11.2 mph EST gust as the forward button leaves the rail. Disarm (the stage badge on the pad, or the panel) or `?gust=0` gives still air from the next launch. The flight in progress keeps its own gust (`flightGustMph`, which the director, the 2D plate and the slate read): pressed after rail exit, DISARM changes only the next launch; pressed on the rail, before the gust fires, the flight no longer repeats its pre-flight (a divergence, as a flick: no plan beats, no HOLD, no ghost). A setting changed during a flight is named on the end card and the plate's caption (`settings changed at T+n s`).
- **Playback and the speed ramp**: `playback.rate` is always the true rate. At each launch with the automatic rate, `story.js planFlight` flies the same configuration and armed gust silently (cached by configuration; the run previews seed the cache) and gives the beat times and the ramp: 1/8 on the rail; a slow rate from just before rail exit, chosen so the wobble takes about 12 s on screen, held between 1/32 and 1/8 (1/20 for the default launch); a 1.5 s HOLD at the first pitch extreme (rate 0, the header reads HOLD; a flight stepped past that point does not hold later); 1/4 by the settle; real time by about T+1.6 s; never faster than real time. A rate button or `?speed` overrides it. The header prints the rate as 1/n only where n is within 3 percent of it, otherwise as a multiplier (`0.69×`), so the ramp's eases never read as 1/1. The flight is stepped one 1 ms step at a time (`advanceFlight`), so the run tracker and the narrator sample it on the run cards' 5 ms grid.
- **Narration**: one plain caption in the stage's caption slot (`[data-story-cap]`, the polite live region while it narrates; the panel's event lines are muted and its phone peek row shows the caption), changed only when the flight's state crosses a condition, so a still-air flight never claims a push. The caption slot is a polite live region from first paint (`aria-live`, `aria-atomic`; visually hidden while empty, `data-empty`), so the first line of every flight is announced. The gust beat comes as |alpha| first reaches 2° after the gust while the flight repeats its pre-flight, named with the pre-flight's peak (A GUST FROM THE SIDE ... THE NOSE TIPS UP TO 7.6° SIM); off the plan, at the first peak. The slate (`[data-slate]`) names the launch's conditions, loud for 1.2 s, then quiet. The plates dim to the beat's subject (`scene.setEmphasis`). Reduced motion: no autoplay; NEXT BEAT and PREVIOUS BEAT (`[data-beat]`) step to the plan's beat times (5 ms past each, rounded up to the 1 ms step grid; a wobble also stops at its second peak, `peak2`, for EACH SWING SMALLER), the beat's caption shows at once, and keyboard focus stays on the pressed button (NEXT hands it to the end card's REPLAY at apogee, PREVIOUS to NEXT on the pad).
- **Camera director and the end plate** (items 10 and 12): `vx/js/scene/director.js`, loaded beside the scene and driven by the flight's own events: the hero view on the empty stage, side from ignition, a push-in from rail exit to the settle, an ease-out from burnout, and at apogee the end plate. `main.js` gives it the beat plan, the flight's own gust (`flightGustMph`), the ghost (`ghostFlight`: the same configuration and gust with the other fin choice, the planner's silent pre-flight, moved into the flight frame) and what to keep clear (the end card, and the sheet on a phone). A camera in the URL or picked in the panel, or an orbit, stands it down for good. Reduced motion: side throughout and a cut to the plate. If the module does not load, story.js's plain director runs (no plate). On a portrait phone, while the title plate is up and the director holds the hero view, `padFraming` frames the rocket farther out with the aim toward the tail (`PHONE_PAD_FRAMING`, k 2.3, aimM 1, camera.js's aim limit) and the slice fades out under the plate.
- **Apogee stop and end card** (`js/story.js`): every launch pauses on the first 5 ms grid step at or after the apogee event. The end card's figures come from `createRunTracker`, the same code that fills the run cards, so the default launch's card equals the Run 05 card. The second figure reads STRAIGHT AGAIN AFTER THE GUST (UNDER 2°) (after rail exit without a gust), or LAST OVER 2° AFTER ... when the angle rose past 2° again late in the climb (Run 04; `lateSettle`, `beats.settleLate`). Its last line (`[data-end-plate]`) is the plate's caption, built from `director.plate`, with both apogees; it is hidden where there is no plate (the 2D view). CONTINUE PAST APOGEE (also PAUSE, Space or STEP) resumes; the flight runs on to 2 s past apogee as `flight.js` defines. While the card shows, the flow lines step aside with the slice.
- **Path figures** (item 9): the lede figure (the default launch and its finless twin under the same gust, equal-scale ft axes, the apogees in display type with SIM tags) and the run sketches (each run's path on the axes every card shares) are drawn by `story.js pathFigure`. `tools/bake-figure.mjs` bakes them into `index.html` with the page's own modules in node, so they read with JS off; `main.js liveFigures()` renders the same markup from the tab's own pre-flights and swaps a figure in only when its hash (`data-sig`) differs (the flight model changed since the last bake). `window.__field.figure` reports `match` or `replaced` per figure. Finned paths are ink, a finless one livery orange and dashed; every word is ink.
- **The strip chart's beats** (item 11, for the panel's chart): `playback.beats` gives the flight's GUST, PEAK (the cards' Peak AOA and its time), SETTLED (the cards' "under 2° after the gust"), BURNOUT and APOGEE with the run cards' definitions, from the pre-flight while the flight repeats it (`source: 'plan'`) and from the live tracker at apogee otherwise (`source: 'flight'`); `playback.preview` is the plan a LAUNCH from the pad would fly (its `trace` dims the empty chart); `playback.ghostTrace` keeps the flight just flown after the end card's fin toggle, as a labeled ghost, until a visitor's reset or a run start. Plans carry `trace` (`[t, alphaDeg, thetaDeg]` every 10 ms to apogee).
- **AUTO view**: unless the visitor or `?view` picked a view, the slice shows smoke on the pad, pressure from rail exit to the end of the wobble (or the pitch past 60°) and smoke after, with a 240 ms fade out and a 480 ms fade in (instant under reduced motion). The caption block carries the legend (`[data-cap-key]`).
- **Section sync at a launch**: a run start, the default launch, the end card's fin toggle and the panel's `prepareLaunch` hook rebuild the lattice section synchronously before the flight starts (`syncSectionNow`) and restart the flow when the solid changed, as a `?fins=` load does.
- **Lattice slot**: `attachLattice(scene, geometry, flight)` imports the engine inside a try/catch; if the import, `createLattice` or `ready` fails, the page runs without it and says LATTICE UNAVAILABLE (LATTICE PENDING only while it is on its way). Each frame it sets the inflow from the flight's airspeed and angle of attack (the contract's 0.03 to 0.10 lattice units; the engine runs at most 0.05 and scales the body rate with it) and the body rate from the pitch rate (`q cellM u_in / V` rad per step, flight sign, the engine's default body frame). Under `?lab` the panel reads `force.mean`, the developed chord-pass means, with cm moved to the live CG. Section rebuilds are throttled to one per 250 ms while a slider moves, with a trailing rebuild.
- **Cost guard** (`watchLatticeCost`): judges only the frames the lattice runs in, after a warm-up (20 lattice frames and a developed flow, never longer than 12 s); a median over 120 ms across 2.5 s with the engine already at one step per frame sheds one lattice tier, and below tier 1 the flow pauses with RESUME FLOW. The warm-up restarts whenever the tab comes back into view, so hidden time is never judged. A pinned `?tier` is never judged.
- **Idle pause**: after 90 s without input on the stage or in the panel and with no flight playing (a flight that plays counts as activity, so the wait starts at its end), the flow pauses and the loop stops: the stage shows FLOW PAUSED with Resume flow, the caption NO INPUT FOR 90 S. Any input on the stage, a launch, a run button or Resume flow brings it back. A pinned tier, a `?hold` and the benchmark are exempt.
- **Lost graphics context**: the stage says 3D VIEW LOST and the lattice stops while the browser restores the context; a restore inside 5 s of visible time picks up where it was (hidden time does not count: mobile browsers drop contexts in the background and restore them on return). After that, the lattice is dropped and the 3D scene is parked behind the 2D view; the restore listener stays, and a context that comes back later brings the 3D view and the lattice back.
- **Short screens** (height 500 px or less: landscape phones, desktops at 200 percent zoom): the stage fits the screen (no 540 px minimum), the chart canvas goes (the dock's text summary and the panel's live region stay rendered for screen readers), the title plate drops its eyebrow and keeps its sentence one size down; at 420 px or less the end card drops its eyebrow.
- **The title plate's size**: `--fd-plate-h` follows the view's width and its height (it never grows up into the header at 1280 x 720), and the plate keeps to the left half of the view (at most half the view's width less 96 px; its two pills stay on one row below the rocket's stand); its eyebrow goes on desktops under 780 px tall. While it is up, at every width, the flow lines and the gust pill step aside. Its text fades over 480 ms and what it keeps clear (the 3D plates, the flow lines) comes back when it has gone (`onPlate(false)` from story.js's timer).
- **Fallbacks**: no WebGL2 gives the panel's 2D side view with the full panel, the captions, the title plate and the end card over it; reduced motion gives tier 0 (no flow, no camera moves, STEP buttons, NEXT BEAT and PREVIOUS BEAT) and no autolaunch; without JavaScript the stage shows the title plate and a still, and the lede (with its figure), the runs (with their sketches), the appendix and the glossary read as plain HTML.
- **Hooks**: `window.__field` (read-only, for probes and the lab): `flight`, `panel`, `playback`, `geometry`, `story`, `scene`, `lattice`, `slot`, `end`, `plan`, `planner`, `narrator`, `director`, `sceneDirector`, `viewAuto`, `setViewAuto`, `beat`, `rateLabel`, `launchDefault('fins' | 'nofins')`, `startRun(key)`, `disarmGust()`, `armedGust()`, `flightGustMph`, `prepareLaunch()`, `figure`, `beats`, `ghostTrace`, `idle`, `parked`, `bench`. Any element with `data-launch="fins"` or `data-launch="nofins"` starts the default launch or the same without fins. The stage element dispatches `field:launch` {config, armedGustMph, plan} and `field:end` {summary, conditions, finScale} as DOM events.

### URL parameters

| parameter | effect |
| --- | --- |
| `fins=0..1.5` or `none`, `half`, `full` | fin scale about the root leading edge |
| `cg=<in>`, `rail=<in>`, `angle=<deg>`, `wind=<mph>` | the panel's sliders |
| `gust=<mph>` | fire a gust of that peak when the forward rail button leaves the rail, every launch, until disarmed; `gust=0` for still air. With no flight setting in the URL the default launch arms 11.2 mph |
| `speed=1/32`, `1/8`, `1/2`, `1` | playback rate (turns the automatic rate, its ramp and its HOLD off) |
| `view=smoke`, `pressure`, `vorticity`, `speed`; `section=through`, `between`; `cam=side`, `quarter`, `chase`, `pad` | flow view (turns the AUTO view off), section plane, camera (turns the director off) |
| `seed=<n>` | the flight model's seed (only matters with turbulence) |
| `autolaunch=1` | launch once the 3D view is ready (ignored under reduced motion); bare, it flies the default launch |
| `hold=<deg>` | fly a crosswind (`wind`, else 10 mph) and freeze flight time where the angle of attack has fallen to that value; the lattice keeps running |
| `tier=0..3` | pin the quality tier (with `bench`, the tier the benchmark measures) |
| `bench=1`, `bench=quick` | run the self-benchmark (below); `&precision=both` adds float16 engine rows |
| `lab` | the lab view: the 2D section's CP and CM rows (2D SECTION ONLY / NOT COMPARABLE), its CP ring on the stage and the LATTICE FLIES IT toggle (not quantitative) |

The panel's settings are written back into the address with `history.replaceState`, so a link reproduces a configuration (not during the benchmark). Keyboard, while the stage is in view: L launch, Space pause, R reset, G gust, 1 to 4 views; arrow keys flick the rocket when the 3D view has focus.

## The self-benchmark (`?bench=1`)

Open `https://merttureli.com/vx/?bench=1` on each machine and browser, plugged in, with the tab in front and other tabs closed. Wait about 75 seconds without touching the page, press Copy result and paste it. `?bench=quick` takes about 25 s (the heuristic tier only, no auto phase).

It runs below the stage, in a Benchmark section, and writes its progress to the stage's status line too. In order: the environment (browser, device, GL strings, unmasked GPU vendor and renderer where the browser gives them, limits, extensions, the precision path, timer resolution), 60 display intervals with the page idle (a 30 Hz cap is named), the still-air flight `run(12)` (wall ms, apogee to 3 decimals and an FNV-1a hash of its history, which shows whether two JavaScript engines fly identically) and a 512 x 160 section build, then per tier the engine alone (steps per second behind the GPU fence, MLUPS, ms per step, a force sample and the field check at a fixed state) and 11 s of Run 01 at 1/8 (frame-time percentiles, dropped frames, the loop's CPU time, completed steps per second, the engine's step scale, the scene's draw time, the backing store), and in full mode 25 s with the governor free (its tier changes and the slow-frame guard). Each tier is pinned while it is measured; a phase that loses the tab or the stage is repeated once. The block ends with a verdict: the highest tier whose engine and pacing both pass, against the device heuristic (MATCHES, HEURISTIC TOO HIGH or HEURISTIC TOO LOW). For the engine's validation on a real GPU, `lab/lattice.html?validate=cylinder` runs in seconds there; paste its C_D and St beside the block.

## Tools

```
# the lede figure, the run sketches, the run cards' static numbers and the configuration's computed values, from the page's own modules
node vx/tools/bake-figure.mjs            # writes vx/index.html (between the bake markers)
node vx/tools/bake-figure.mjs --check    # exit 1 if vx/index.html is out of date

# the share image, a real capture of the running page (1200 x 630)
node vx/tools/capture-og.cjs --frame title   # the title plate before the first launch (default; the shipped og-field.png)
node vx/tools/capture-og.cjs --frame plate   # the end plate of the default launch
```

Run the bake after any change to the flight model or the runs; the page re-flies the figures and swaps in its own when the bake is stale, so a stale bake only shows with JavaScript off. The capture script uses Playwright from `PW_MODULE` or `/opt/node22/lib/node_modules/playwright`, blocks the analytics hosts and aborts every request that is not a GET.

## Tests and labs

```
# flight model tests, plain node:assert
node vx/js/flight/flight.test.mjs

# serve the repository root, then open /vx/ and /vx/lab/
python3 -m http.server 8000
```

The page and every lab pass the verification harness (console, page errors, failed requests, horizontal overflow, screenshots at 1440x900 and 390x844, with reduced motion and without WebGL). Frame rates measured under software rendering (SwiftShader) are not representative of a graphics card.

The lattice's validation gate (`lab/lattice.html?validate=cylinder`, revised after validation track L2; see Validation above): a cylinder 24 cells across at Re 100 in a 768 x 192 grid, its center 16 D behind the inflow edge, 60,000 steps, averaged over whole saturated lift cycles. Measured (L2-07, 10 saturated cycles, on the CPU transcription of the fixed engine, which matched the GPU engine to 5.3e-5 over 12,000 steps): C_D 1.369, St 0.164, C_L amplitude 0.323, against the unconfined 2D references 1.320, 0.165 and 0.318 (Parvar et al. 2023, arXiv:2303.09262, Table 1), with tolerances of 5, 5 and 15 percent. The earlier 512 x 192, 20,000-step gate printed C_D 1.450 and St 0.169 before the shedding had saturated (saturated 1.473 and 0.172).

No analytics. Nothing leaves the tab. `noindex` stays on every page.
