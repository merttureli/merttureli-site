# vx: CHARGER field study

The experimental build of merttureli.com, reachable at `/vx/`. It sits beside the production site and does not replace it: plain HTML, CSS and ES modules, no build step, no bundler, no CDN. The only third-party code is the three.js r186 the CHARGER explorer already ships, imported through an import map from `assets/charger-explorer/vendor/`.

The page launches CHARGER (Union College Rocket Team, first place in the Deployable Sensor Payload event at Battle of the Rockets 2026) again in slow motion. Two models, two jobs:

- **Flight** (CPU, pure JS) flies the rocket: a planar rigid body (downrange, altitude, pitch), RK4 at 1 ms, Barrowman (1967) normal-force slopes and centres of pressure for the ogive nose and four fins with body interference, body lift at large angles of attack as OpenRocket adds it, pitch and jet damping (Mandell, Caporaso and Bengen), the AeroTech G77R thrust curve, a rail, wind and gusts. One drag coefficient is fitted so the still-air apogee equals the case study's 1,033 ft.
- **Lattice** (GPU, three.js render targets) shows the air: a D2Q9 lattice Boltzmann section through the pitch plane (Chen and Doolen 1998) with a Smagorinsky subgrid model (Hou, Sterling, Chen and Doolen 1996) and moving-wall bounce-back (Ladd 1994). The air arrives at the flight model's angle of attack. Its force and moment, measured by momentum exchange, are printed next to Barrowman's as a cross-check; a lab toggle (`?lab`) lets the lattice moment fly the rocket instead.

The method section on the page states the caveats: a 2D section of a body of revolution, a lattice viscosity set for a Reynolds number of 3,000 at the top inflow speed (u_in 0.10; since Re = u_in D / nu it follows the inflow, 900 on the pad to about 2,800 at CHARGER's peak 87.5 m/s), the inflow floor that keeps the smoke moving on the pad, the ±35° inflow limit, and a replay at 1/8 of real time in which the flow is quasi-steady rather than time-accurate.

## Source tags

Every number on the page carries one.

| tag | meaning |
| --- | --- |
| PAGE | published on merttureli.com (`projects/charger.html`, `index.html`) |
| CAD | measured from `assets/charger-explorer/assembly.json` and `assembly.bin` |
| EST | estimated here; the page or the code says how |
| FIT | fitted to a published figure (the drag coefficient, to the 1,033 ft apogee) |
| SIM | computed live in the tab |
| STD | textbook constant or method, with the reference named |

The CAD assembly is 46.5 in long with four fins; the case study describes a 37 in three-fin design with a 1.80 cal margin. Four fins is the final configuration. Shape comes from the CAD, mass (2.2 lb) and the default CG (22 in from the nose) from the page, and the margin is recomputed: 4.15 cal at the page CG.

## Files

```
vx/
  index.html            the field study page
  README.md             this file
  css/
    tokens.css          tokens, fonts, base styles (shared, do not edit)
    field.css           the page: header strip, stage, method, configuration, runs, footer
    panel.css           the instrument panel, the phone sheet, the chart dock
    scene.css           hooks for the 3D canvas
  js/
    main.js             the integrator: playback, URL state, runs, the configuration table, the lattice slot
    core/bus.js         typed event bus (flight:event, flight:reset, flight:config, lattice:stats, ui:view, ui:camera, governor:tier)
    core/governor.js    adaptive quality tiers 3 to 0 from measured frame times
    data/motor-g77r.js  the G77R thrust curve from its RASP file
    data/stations.js    from the retired page; the loader reads only HIDDEN_IDS from it
    stage/loader.js     loads assembly.json and assembly.bin and builds the three.js parts
    stage/explode.js    from the retired page; the loader reads only centreOf from it
    flight/             flight.js, barrowman.js, flight.test.mjs
    geom/               geom.js (sections and measurements), geom-measure.js, geom-cad.js (the baked measurement), geom-bake.mjs
    lattice/            lattice.js, shaders.js, lattice-lab.js
    scene/              scene.js, slice.js, markers.js, camera.js, exhaust.js, scene-testcard.js (lab only)
    panel/              panel.js, controls.js, chart.js, fallback.js (the 2D view), format.js, lab-script.js (lab only)
  lab/
    index.html          the lab index
    flight.html, geom.html, lattice.html, scene.html, panel.html
```

## Modules

| module | factory | lab |
| --- | --- | --- |
| flight | `createFlight(config, {bus})` -> state, derived, events, history, step, reset, ignite, gust, flick, setters | `lab/flight.html` |
| geometry | `getBakedGeometry()`, `loadFieldGeometry({geometry})` -> profile, fin, refs, `buildSection({cols, rows, finScale, view, cgM})`, `sectionPolygons()` | `lab/geom.html` |
| lattice | `createLattice(renderer, {cols, rows, tier})` -> ready, fallback, setSection, setInflow, setBodyRate, setView, setTier, frame, texture, force, stats | `lab/lattice.html` |
| scene | `createScene(canvas, {tier, zoom, touchAction})` -> ready, renderer, setFlight, setSliceTexture, setSliceView, setCamera, setMarkers, render | `lab/scene.html` |
| panel | `mountPanel(stage, {flight, playback, scene, lattice, geometry})` -> set, press, attach, sync, onControl; `createFallbackView()` for no WebGL2 | `lab/panel.html` |

Every factory returns an object with `destroy()`, honours `prefers-reduced-motion` and survives a missing WebGL2 context. Each module's header comment has its full API. They share one sign convention: x downrange (the wind blows toward +x), y up, pitch from +y positive toward +x, and alpha from the relative wind to the body axis, positive toward +x.

## The page

- **Init order** (`js/main.js`): governor pin from `?tier`, the baked geometry, the flight with the URL configuration, the playback object, the panel, then the scene by dynamic import (or the 2D view), then the lattice through `attachLattice()`.
- **Playback**: 1/8 of real time until 3 s after burnout, then real time, unless the visitor or `?speed` picks a rate. The flight is stepped by screen time multiplied by the rate, at most 0.25 s per frame.
- **Lattice slot**: `attachLattice(scene, geometry, flight)` in `main.js` imports the engine inside a try/catch. If it fails, the page runs without it and says LATTICE PENDING. It calls `createLattice(renderer, {cols, rows, tier})` with the FIELD 4 grid for the current tier; the engine takes `cols x rows` as the grid at that tier and scales it by its tier table on `setTier`, so a tier change swaps the grid, the section is rebuilt at the new grid and the slice follows (`{fixedGrid: true}` keeps one grid at every tier; nothing on the page uses it, and the validation gates pass one grid and never change tier). Each frame it sets the inflow from the flight's airspeed and angle of attack and the body rate from the pitch rate (`q cellM u_in / V` rad per step, flight sign). Section rebuilds (fin scale, CG, section view) are throttled to one per 250 ms while a slider moves, with a trailing rebuild, and the section goes to the engine in the builder form, so a tier change builds the mask once at the new grid; a change that leaves the solid as it was (wind, rail, angle) costs a cache lookup.
- **Cost guard** (`watchLatticeCost` in `main.js`): judges only the frames the lattice runs in, and only after a warm-up that starts whenever a grid is built and lasts until 20 lattice frames have passed and the engine reports a developed flow (`stats.developed`: its start-up viscosity has eased back, about 2,000 steps, and the inflow has reached its target), and never longer than 12 s of wall time, however few frames a slow renderer has drawn by then. After that, the window is the lattice-frame intervals of the last 2.5 s, and at least the last 3. When it spans 2.5 s or more, its median is over 120 ms and the engine is already down to one step per frame (not waited for when the median is over 1 s, since fewer steps cannot rescue a frame that slow), one lattice tier is shed; below tier 1 the flow pauses and the stage offers RESUME FLOW. A governor step that leaves the lattice tier where it was rebuilds nothing and does not restart the warm-up. A pinned `?tier` is never judged.
- **Governor** (`core/governor.js`): no tier change in the first 6 s, and after a step down from tier t the step back up to t waits 30 s, doubling each time t fails again (up to 4 min). Without the backoff the page flipped between tier 1 and tier 0 every 25 s under software GL, because tier 0 turns the lattice off and so always measures quiet.
- **Lattice readouts**: `lattice.force.developed` is false until the flow is developed; the panel's C_m row shows a dash until then. `force.xcpCells` is null until then, and also below 1° of inflow angle or `|c_n|` 1: the CAD section's rail buttons make the mask asymmetric, which gives a steady `c_n` of about −0.1 to −0.4 at 0° (measured at tier 1), and a CP of that is noise. The engine takes its moment about the section's CG cell (the CG slider, the liftoff CG); `main.js` moves it to the flight's live CG, `cm + cn (x_cg,live − x_cg,section) / D` in cells, before the panel prints it beside CG / LIVE and before LATTICE FLIES IT hands it to the flight (the CP does not depend on the reference point). The lattice values are 2D section values, and the held flow does not settle: at `?hold=5&lab&tier=1` (512 × 160, SwiftShader, sampled every 250 steps to 12,500) the developed section's CP swings between 9.5 and 21.1 in from the nose with a period of about 4,000 steps, c_n 17 to 32 and C_m +6 to +79 about the live CG (21.57 in at the hold; +11 to +82 about the 22 in section CG), always ahead of the CG. An unconfined flat plate of the same length would give c_n = 2π sin α L / D = 9.5 at 5°, so the domain's confinement already dominates there. The engine header's "+44 at 5 deg" is one developed snapshot from its build. So the `?lab` toggle that lets the lattice fly the rocket diverges by construction. The moment's sign was checked on the page: `force.cm` follows the flight convention (`xcpCells = xcg - mz/fy`, so the CP ahead of the CG reads positive), and a flick with positive pitch rate lowers it (the moving wall damps the rotation; the slewed response is in the "Body rate" paragraph of `lattice.js`).
- **Scene CP**: the scene takes both CPs from `flight.state` (`js/scene/scene.js`, `js/scene/markers.js`): the static Barrowman `xcp` for the CP dot, its label and MARGIN, equal to the panel's CP / BARROWMAN and STATIC MARGIN, and `xcpNow`, the CP at the current angle of attack with body lift, for the normal-force arrow, so in the finless loop the arrow sits where the force acts (21 in, against 4.3 in for the small-angle CP). `sceneDerived` in `main.js` passes `derived.xcp` only as the fallback for a state without them.
- **Lost graphics context**: the stage says 3D VIEW LOST and the lattice stops while the browser restores the context; a restore picks up where it was (the engine restarts its flow). If the context is not back within 5 s, the 3D view and the lattice are dropped for the 2D view, and the flight and the panel carry on.
- **Forced colours**: the panel's chart dock grows upward to show the chart's text summary, so `main.js` writes the dock's real height to `--fd-dock-real` and `field.css` keeps the view, its captions and the hint above it.
- **Fallbacks**: no WebGL2 gives the panel's 2D side view with the full panel; reduced motion gives tier 0 (no flow, no camera moves, STEP buttons) and no autolaunch; without JavaScript the stage shows a still and the method, configuration and runs read as plain HTML.

### URL parameters

| parameter | effect |
| --- | --- |
| `fins=0..1.5` or `none`, `half`, `full` | fin scale about the root leading edge |
| `cg=<in>`, `rail=<in>`, `angle=<deg>`, `wind=<mph>` | the panel's sliders |
| `gust=<mph>` | fire a gust of that peak when the forward rail button leaves the rail, every launch, until disarmed |
| `speed=1/32`, `1/8`, `1/2`, `1` | playback rate (turns the automatic rate off) |
| `view=smoke`, `pressure`, `vorticity`, `speed`; `section=through`, `between`; `cam=side`, `quarter`, `chase`, `pad` | flow view, section plane, camera |
| `seed=<n>` | the flight model's seed (only matters with turbulence) |
| `autolaunch=1` | launch once the 3D view is ready (ignored under reduced motion) |
| `hold=<deg>` | fly a crosswind (`wind`, else 10 mph) and freeze flight time where the angle of attack has fallen to that value; the lattice keeps running |
| `tier=0..3` | pin the quality tier |
| `lab` | show the LATTICE FLIES IT toggle |

The panel's settings are written back into the address with `history.replaceState`, so a link reproduces a configuration. Keyboard, while the stage is in view: L launch, Space pause, R reset, G gust, 1 to 4 views; arrow keys flick the rocket when the 3D view has focus.

## Tests and labs

```
# flight model tests, plain node:assert
node vx/js/flight/flight.test.mjs

# serve the repository root, then open /vx/ and /vx/lab/
python3 -m http.server 8000
```

The page and every lab pass the verification harness (console, page errors, failed requests, horizontal overflow, screenshots at 1440x900 and 390x844, with reduced motion and without WebGL). Frame rates measured under software rendering (SwiftShader) are not representative of a graphics card.

The lattice's validation gate (`lab/lattice.html?validate=cylinder`, FIELD 4): a cylinder 24 cells across in a 512 x 192 grid at Re 100, 20,000 steps. Last run (2026-10-22, headless Chromium, SwiftShader, rgba32f): C_D 1.450 (standard deviation 0.010 over the last 5,000 steps), St 0.169 (period 2,833 steps, 4 lift zero crossings), 99 steps per second; the gate's range for 2D flow at Re 100 and 12 percent blockage is C_D 1.35 to 1.55 and St 0.16 to 0.18, from the unconfined Strouhal number of about 0.164 at Re 100 (Williamson 1996, Annual Review of Fluid Mechanics 28) raised, with the drag, by the blockage (Sahin and Owens 2004, Physics of Fluids 16).

No analytics. Nothing leaves the tab. `noindex` stays on every page.
