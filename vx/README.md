# vx: CHARGER field study

The experimental build of merttureli.com, reachable at `/vx/`. It sits beside the production site and does not replace it: plain HTML, CSS and ES modules, no build step, no bundler, no CDN. The only third-party code is the three.js r186 the CHARGER explorer already ships, imported through an import map from `assets/charger-explorer/vendor/`.

The page launches CHARGER (Union College Rocket Team, first place in the Deployable Sensor Payload event at Battle of the Rockets 2026) again in slow motion. Two models, two jobs:

- **Flight** (CPU, pure JS) flies the rocket: a planar rigid body (downrange, altitude, pitch), RK4 at 1 ms, Barrowman (1967) normal-force slopes and centres of pressure for the ogive nose and four fins with body interference, body lift at large angles of attack as OpenRocket adds it, pitch and jet damping (Mandell, Caporaso and Bengen), the AeroTech G77R thrust curve, a rail, wind and gusts. One drag coefficient is fitted so the still-air apogee equals the case study's 1,033 ft.
- **Lattice** (GPU, three.js render targets) shows the air: a D2Q9 lattice Boltzmann section through the pitch plane (Chen and Doolen 1998) with a Smagorinsky subgrid model (Hou, Sterling, Chen and Doolen 1996) and moving-wall bounce-back (Ladd 1994). The air arrives at the flight model's angle of attack. Its force and moment, measured by momentum exchange, are printed next to Barrowman's as a cross-check; a lab toggle (`?lab`) lets the lattice moment fly the rocket instead.

The method section on the page states the caveats: a 2D section of a body of revolution, a lattice Reynolds number of 3,000, the inflow floor that keeps the smoke moving on the pad, the ±35° inflow limit, and a replay at 1/8 of real time in which the flow is quasi-steady rather than time-accurate.

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
    data/stations.js    part stations, read by the assembly loader
    stage/loader.js     loads assembly.json and assembly.bin and builds the three.js parts (explode.js is its helper)
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
| lattice | `createLattice(renderer, {tier})` -> ready, fallback, setSection, setInflow, setBodyRate, setView, setTier, frame, texture, force, stats | `lab/lattice.html` |
| scene | `createScene(canvas, {tier, zoom, touchAction})` -> ready, renderer, setFlight, setSliceTexture, setSliceView, setCamera, setMarkers, render | `lab/scene.html` |
| panel | `mountPanel(stage, {flight, playback, scene, lattice, geometry})` -> set, press, attach, sync, onControl; `createFallbackView()` for no WebGL2 | `lab/panel.html` |

Every factory returns an object with `destroy()`, honours `prefers-reduced-motion` and survives a missing WebGL2 context. Each module's header comment has its full API. They share one sign convention: x downrange (the wind blows toward +x), y up, pitch from +y positive toward +x, and alpha from the relative wind to the body axis, positive toward +x.

## The page

- **Init order** (`js/main.js`): governor pin from `?tier`, the baked geometry, the flight with the URL configuration, the playback object, the panel, then the scene by dynamic import (or the 2D view), then the lattice through `attachLattice()`.
- **Playback**: 1/8 of real time until 3 s after burnout, then real time, unless the visitor or `?speed` picks a rate. The flight is stepped by screen time multiplied by the rate, at most 0.25 s per frame.
- **Lattice slot**: `attachLattice(scene, geometry, flight)` in `main.js` imports the engine inside a try/catch. If it fails, the page runs without it and says LATTICE PENDING. If frames stay over 120 ms with the lattice running, it sheds a lattice tier, and below tier 1 it pauses the flow and offers RESUME FLOW (a pinned `?tier` is never shed).
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
# flight model, 20 tests, plain node:assert
node vx/js/flight/flight.test.mjs

# serve the repository root, then open /vx/ and /vx/lab/
python3 -m http.server 8000
```

The page and every lab pass the verification harness (console, page errors, failed requests, horizontal overflow, screenshots at 1440x900 and 390x844, with reduced motion and without WebGL). Frame rates measured under software rendering (SwiftShader) are not representative of a graphics card.

No analytics. Nothing leaves the tab. `noindex` stays on every page.
