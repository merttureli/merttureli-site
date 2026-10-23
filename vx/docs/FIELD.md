# FIELD.md: CHARGER field study. Binding architecture contract.

Read BRIEF.md first (who Mert is, the design system, assets, hard constraints). This file
replaces ARCHITECTURE.md for the new page; the old vx page is being retired and its parts
recycled. Repo root /home/user/merttureli-site. Everything lives under vx/. Nothing outside vx/
may change. Plain ES modules, no build, no CDN; three.js r186 is vendored and imported through
the import map `{"imports":{"three":"../assets/charger-explorer/vendor/three.module.js"}}`
(lab pages use `../../assets/...`). No emoji, no exclamation marks anywhere. Owner decisions
already made: four fins (the CAD is the final configuration), Lattice Boltzmann engine, the
study replaces /vx/, the G77R thrust curve is pulled from the web (vx/js/data/motor-g77r.js is
being produced by another agent; if it is not there yet, stub it with the same export shape).

## 0. What the page is

One page: a launch of CHARGER shown as a slow-motion replay inside a 3D scene, with a 2D
lattice-Boltzmann flow section through the pitch plane and the rocket's rigid-body motion from
the Barrowman stability method. The point is to show why fins keep a rocket straight: the flow
shows the pressure on the fins at angle of attack, the dynamics show the rocket wobbling after
rail exit and settling. Two models, two jobs:

- FLIGHT (CPU, pure JS): 3-DOF planar rigid body (x, y, pitch), Barrowman CP and normal-force
  slope with four fins, thrust curve, drag, pitch damping, rail, wind and gusts. It flies the
  rocket. Deterministic, seedable, unit-tested with node.
- LATTICE (GPU, three.js render targets): D2Q9 lattice Boltzmann with a Smagorinsky subgrid
  model, the rocket section as a solid, the inflow at the flight model's angle of attack. It
  shows the flow and measures force and moment on the body by momentum exchange. The measured
  moment and the measured centre of pressure are displayed next to Barrowman as a cross-check.
  A lab toggle lets the lattice fly the rocket instead; the page default is Barrowman.

Honesty rule: every number on the page carries a source tag. PAGE = published on the owner's
site (projects/charger.html, index.html), CAD = measured from assets/charger-explorer/assembly,
EST = estimated here (say how), FIT = fitted to a published figure (say which), SIM = computed
live, STD = textbook constant with the reference named. Facts about CHARGER may come only from
the site. Physics statements must be textbook-standard and name their source (Barrowman 1967;
Mandell, Caporaso and Bengen, Topics in Advanced Model Rocketry; Chen and Doolen 1998 for LBM;
Hou, Sterling, Chen and Doolen 1996 for Smagorinsky LBM; Ladd 1994 for moving bounce-back).

## 1. The rocket as the site states it

| Item | Value | Tag |
|---|---|---|
| Length | 37 in | PAGE (design review figure) |
| Diameter | 2.63 in | PAGE |
| Mass at liftoff | 2.2 lb | PAGE |
| CG from nose | 22 in | PAGE |
| Static margin | 1.80 cal (three-fin design review figure) | PAGE |
| Fins | three trapezoidal, root chord 2.76 in, height 2.36 in, sweep 2.17 in | PAGE |
| Motor | Aerotech G77R-7, thrust to weight 8.17, burn 1.25 s | PAGE |
| Simulated apogee | 1,033 ft | PAGE |
| Rail buttons | 2 in from the aft end and 22 in from the nose | PAGE |
| CAD assembly | nose tip y +570.7 mm, screw cap y -610.2 mm, body radius 34 mm, four fins (parts 6, 7, 8, 9) at 90 degrees, fin bounds radial 34 to 89 mm, axial -585.7 to -500.7 mm, thickness 3.17 mm | CAD |

Known discrepancy, to be stated plainly in the method section and reported to the owner: the
CAD assembly is 1,181 mm (46.5 in) long with four fins; the page describes a 37 in three-fin
design. The owner says four fins is the final configuration. Rule: shape and dimensions come
from the CAD (scaled 0.001 m per CAD unit), mass from the page, CG defaults to the page's
22 in from the nose and is a slider labelled PAGE, margin is recomputed live and labelled SIM.
Never print 1.80 cal as the study's result.

Internal units are SI (m, kg, s, rad). Display units follow the site: in, ft, ft/s, mph, lb,
lbf, lbf in, lbf/ft2, degrees, calibres. Formatting: mono, fixed decimals, no thousands separator
below 10,000.

## 2. Shared conventions (all modules)

- Reuse from the old vx: vx/css/tokens.css (do not edit), vx/js/core/bus.js, vx/js/core/
  governor.js, vx/js/stage/loader.js (assembly loader) and the livery painter at assets/
  charger-explorer/livery.js, vx/js/instruments-draw.js (canvas chart primitives, optional).
  APIs are in reports/modules.md. Everything else in vx/ is legacy and will be deleted by the
  integrator; do not depend on it.
- Governor tiers 3..0 as before (governor.tier, governor.dpr(), governor:tier events, ?tier=N,
  prefers-reduced-motion forces tier 0 motion rules). Lattice grid and steps per tier are in
  section 4. Tier 0: lattice off, scene static, flight still runs when the user presses play.
- Bus events (only these): flight:event {name, t, state}, flight:reset, flight:config {config},
  lattice:stats {grid, stepsPerSecond, force} at 1 Hz, ui:view {view}, ui:camera {preset},
  governor:tier. Per-frame data is read directly from flight.state, never through the bus.
- Module directory ownership (create exactly these; helper files allowed with the same prefix):
  lattice: vx/js/lattice/lattice.js, vx/js/lattice/shaders.js, vx/lab/lattice.html
  geometry: vx/js/geom/geom.js, vx/lab/geom.html
  flight: vx/js/flight/flight.js, vx/js/flight/barrowman.js, vx/js/flight/flight.test.mjs, vx/lab/flight.html
  scene: vx/js/scene/scene.js, vx/js/scene/slice.js, vx/js/scene/markers.js, vx/js/scene/camera.js, vx/js/scene/exhaust.js, vx/css/scene.css, vx/lab/scene.html
  panel: vx/js/panel/panel.js, vx/js/panel/chart.js, vx/js/panel/controls.js, vx/js/panel/fallback.js, vx/css/panel.css, vx/lab/panel.html
  integrator (later): vx/index.html, vx/js/main.js, vx/css/field.css, vx/lab/index.html, vx/README.md
- Every module exports a factory returning an object with destroy() that cancels rAF, removes
  listeners and disposes GL resources. Every module honours prefers-reduced-motion (no autoplay,
  no decorative motion) and survives a missing WebGL2 context (resolve to a fallback flag, never
  throw at import time).
- Lab pages: one per module at vx/lab/<id>.html, styled with ../css/tokens.css, mono meta caps,
  dark stage. Controls as range inputs and buttons; a readout of internal state. Each lab must
  pass the harness: node /tmp/claude-0/-home-user-merttureli-site/89c47636-e713-59a0-ab78-6864669d7dfa/scratchpad/harness/check.cjs <page> --out <dir> --steps 3 --viewports 1440x900,390x844 (add --no-gl for a second pass). Look at the PNGs.
- Text: 10 px mono on ink uses paper-a70 or stronger when it carries information. Canvases are
  aria-hidden or role=img with an aria-label updated at most once per second. No live region
  updates faster than 1 Hz.
- Sign convention, binding for everyone: world frame x downrange (wind blows toward +x), y up.
  Pitch theta is the body axis angle from +y, positive toward +x. Relative air velocity
  v_air = wind - v_rocket. Angle of attack alpha = theta - angle of (-v_air) from +y, i.e. the
  angle from the relative wind direction the rocket flies into to the body axis, positive toward
  +x. With CP aft of CG a positive alpha produces a negative pitching moment (restoring).
  In the lattice grid, +x runs nose to tail (column 0 is upstream of the nose), +y is the body's
  +x side. Inflow direction in the grid is (cos alpha, sin alpha) with this alpha. The scene maps
  the grid onto the rocket's local frame so that a positive alpha in the flight model shows the
  smoke arriving from the side the nose has rotated toward; the scene lab verifies this with a
  wind arrow at alpha = +15 degrees.

## 3. FLIGHT (vx/js/flight)

createFlight(config) -> flight
- config defaults (SI, with tags): length 1.1809 (CAD), diameter 0.068 (CAD), noseLength 0.232
  (CAD, ogive), fins from geometry measurement passed in by the caller or the CAD defaults in
  section 5 {n: 4, root, tip, span, sweep, thickness, rootLeadingEdgeFromNose}, massLiftoff
  0.998 kg (PAGE 2.2 lb), cgFromNose 0.5588 (PAGE 22 in), motor from vx/js/data/motor-g77r.js
  (curve, propellantMass, totalMass; the motor sits with its aft end 0.0254 m ahead of the
  screw cap, EST), inertia EST: airframe treated as a uniform slender rod about the CG plus the
  motor propellant as a point mass, documented in the header; cd FIT so that the no-wind,
  zero-launch-angle apogee equals 1,033 ft (PAGE), found by bisection in the tests and written
  as a constant with the fitted value and the date; airDensity 1.225 (STD, sea level ISA);
  rail length 1.83 m (EST default 6 ft, slider 0.9 to 2.4), launch angle 0 (slider +-10 deg);
  wind 0 m/s (slider 0 to 9 m/s shown in mph), wind profile uniform; gust: one-minus-cosine
  pulse of given peak and 0.5 s duration; turbulence off by default, seeded if on.
- Barrowman (barrowman.js, pure functions with tests): nose C_Na = 2 per rad, CP at 0.466 of
  the nose length for an ogive; body tube terms zero in the classic method; four trapezoidal
  fins with body interference factor 1 + R/(s + R); fin CP by the standard formula (sweep of the
  quarter chord plus the mean aerodynamic chord term). Non-linear extension at large alpha
  (STD, as OpenRocket does): body lift C_N_body = 1.1 (A_plan/A_ref) sin^2 alpha acting at the
  planform centroid; normal forces use sin alpha, and C_N is clamped so that a finless rocket
  tumbles rather than producing NaN. Pitch damping: C_mq from the sum over nose and fins of
  C_Na_i (x_i - x_cg)^2 / (L_ref^2) with L_ref the diameter, plus a jet damping term from the
  motor mass flow (STD, Mandell). State all of it in the header with units.
- Rail: while the aft rail button is on the rail, the rocket is constrained to the rail
  direction; only axial forces act. Rail exit is the event when the forward button leaves the
  rail (the rocket has moved railLength minus the button spacing from the page: 22 in from the
  nose and 2 in from the aft end). Record rail exit speed.
- Integrator: RK4 at fixed dt 0.001 s; flight.step(dtPhysical) sub-steps and accumulates;
  the caller passes dtPhysical = frameSeconds * playbackRate. Events in order with t:
  ignition, liftoff (thrust exceeds weight), railExit, maxQ, burnout, maxAlpha (first local
  max after rail exit), apogee. flight.history is a ring buffer of {t, x, y, v, theta, alpha,
  q, qdyn, phase, N, M} sampled every 0.01 s. Phases: pad, rail, boost, coast, descent (stop
  the sim 2 s after apogee; recovery is out of scope).
- Derived (recomputed on config change): xcp, xcg(t), staticMargin (cal), cna, naturalFrequency(V)
  and dampingRatio(V) from the linearised pitch equation, railExitSpeedPrediction.
- API: state (read-only view), config, derived, step(dt), run(seconds) for tests, reset(),
  ignite(), gust(peak_mps), flick(pitchRateImpulse_radps), setWind(mps), setFinScale(k)
  (scales span and chords about the root leading edge; k = 0 removes fins), setCg(m),
  setRail(m), setLaunchAngle(rad), setLatticeMoment(Cm) with useLattice(true|false) for the lab
  toggle (moment replaces the Barrowman moment, low-pass filtered 10 Hz), events, history, phase.
- Tests (flight.test.mjs, plain node:assert, run with node): ogive nose CP at 0.466 L; a hand
  computed four-fin C_Na and CP within 1 percent; positive alpha gives a negative moment with
  positive margin; finless rocket diverges (alpha exceeds 60 degrees within 3 s of rail exit);
  full fins settle (alpha below 2 degrees within 4 s after a 5 m/s gust at rail exit); no-wind
  apogee within 1 percent of 1,033 ft after the fit; energy and NaN guards at dt extremes;
  determinism (two runs with the same seed produce identical histories).

## 4. LATTICE (vx/js/lattice)

createLattice(renderer, { cols, rows, tier }) -> lattice. Runs inside the three.js renderer the
scene owns (render targets, RawShaderMaterial, GLSL3), so the scene samples its textures
directly. Nothing in the lattice reacts to the pointer.
- D2Q9: e0 (0,0); e1..e4 (1,0) (0,1) (-1,0) (0,-1); e5..e8 (1,1) (-1,1) (-1,-1) (1,-1);
  weights 4/9, 1/9 x4, 1/36 x4; c_s^2 = 1/3. Equilibrium f_i^eq = w_i rho (1 + 3 e.u + 4.5 (e.u)^2
  - 1.5 u.u). BGK collision with tau_eff from Smagorinsky: Pi_ab = sum_i e_ia e_ib (f_i -
  f_i^eq), Q = sqrt(2 Pi:Pi), tau_eff = 0.5 (tau0 + sqrt(tau0^2 + 18 C^2 Q / rho)), C = 0.12.
  nu = (tau0 - 0.5) / 3. Single pull pass: gather, bounce-back, collide, write.
- Storage: nine distributions in three RGBA32F textures (EXT_color_buffer_float), ping-pong,
  one MRT pass (WebGLRenderTarget with count 3, NearestFilter, no depth). If float32 render
  targets are unavailable, use RGBA16F and store f_i - w_i (deviation from rest) to keep
  precision; document which path is active in stats.precision. No WebGL2: lattice.fallback =
  'no-webgl2'; no float targets at all: 'no-float'.
- Solid: an R8 mask texture from geometry.buildSection (1 = solid). Walls: halfway bounce-back
  with the moving-wall term (Ladd): f_ibar(x, t+1) = f_i*(x, t) - 2 w_i rho_w (e_i . u_w) / c_s^2,
  u_w = omega x (r - r_cg) in lattice units, omega and r_cg as uniforms (setBodyRate).
- Outer boundaries per edge cell: if the freestream points into the domain there, set
  equilibrium at rho 1 and u = u_in (cos alpha, sin alpha); otherwise zero-gradient outflow
  (copy the neighbour). This handles any alpha up to +-35 degrees.
- Force by momentum exchange over boundary links, accumulated per cell into an RGBA32F
  texture (Fx, Fy, Mz about r_cg, link count), summed by a halving reduction to 1x1 and read
  with renderer.readRenderTargetPixelsAsync at 10 Hz or slower; never a synchronous readPixels
  in the frame loop. lattice.force = {fx, fy, mz, cn, cm, xcpCells, age_ms}; coefficients:
  cn = fy / (0.5 rho u_in^2 D_cells), cm = mz / (0.5 rho u_in^2 D_cells^2), xcpCells = xcg -
  mz / fy (guarded). D_cells is the body diameter in cells, supplied by setSection.
- Inflow speed: u_in = clamp(0.03 + 0.05 (V / 70 m/s), 0.03, 0.10) lattice units; the floor
  keeps the smoke moving on the pad and is stated on the page. Reynolds in lattice units
  Re = u_in D_cells / nu; tau0 chosen for Re 3000 at tier 3 (state the values).
- Dye: RG16F at twice the grid resolution, semi-Lagrangian advection on the lattice velocity,
  smoke rake on the inflow edge (horizontal lines, count by tier), slow decay. Views (setView):
  smoke, pressure (rho - 1, diverging ramp ink/paper with the livery orange for the positive
  side), vorticity, speed. The composite pass writes an RGBA8 view texture (lattice.texture)
  with alpha 0 inside the solid, at dye resolution.
- Tiers: 3: 1024x320, 24 steps per frame; 2: 768x240, 16; 1: 512x160, 8 and the dye at grid
  resolution; 0: off. frame(dtSeconds) runs the tier's steps (never more than 48 ms of CPU
  issue time per frame; measure with performance.now and shed steps). step(n) for labs and
  validation. Stats at 1 Hz: grid, stepsPerSecond, msPerFrame, precision, re.
- API: ready (Promise), fallback, setSection({mask, cols, rows, dCells, cgCell}), setInflow(uIn,
  alpha), setBodyRate(omegaLU), setView(name), setTier(t), frame(dt), step(n), reset(),
  texture, fields {velocity, density, vorticity, dye} (for the lab), force, stats, destroy().
- Validation gate (lab, ?validate=cylinder, also runnable headless): a cylinder of diameter 24
  cells in a 512x192 grid at Re 100 (u 0.05), 20,000 steps, mean drag coefficient over the last
  5,000 steps and Strouhal number from lift zero crossings. Literature for 2D at Re 100 and
  12 percent blockage: C_D about 1.35 to 1.55, St about 0.16 to 0.18. Report the numbers; the
  method section prints them. Also report the step rate at each tier under SwiftShader
  (software GL here is not representative; say so).

## 5. GEOMETRY (vx/js/geom)

loadFieldGeometry() -> Promise<geometry>, using vx/js/stage/loader.js to read assembly.json and
assembly.bin (CAD units mm, rocket axis y, nose at +y).
- profile: outer radius as a function of the axial coordinate, sampled every 2 mm from the nose
  tip to the screw cap, the maximum over all non-fin parts; fin: part 6 projected on (x, y),
  convex hull, measured root chord, tip chord, span, sweep (leading edge), thickness (z extent),
  root leading edge from the nose; refs: length, diameter, noseLength, finCount 4, all in m.
  Print the measured fin numbers against the PAGE figures (2.76 / 2.36 / 2.17 in) in the lab.
- buildSection({cols, rows, finScale, view}) -> {mask: Uint8Array, cellM, xNoseCol, xCgCol(cg_m),
  dCells, boundary: [{col,row,nx,ny}]}. The rocket spans 66 percent of the width, nose at
  column 0.12 cols, centred vertically. view 'through': body profile plus two fin planforms
  (scaled by finScale about the root leading edge) plus the two edge-on fins as 2-cell slabs;
  view 'between': body only. Fin scale 0 removes fins. Mask must be odd-symmetric about the axis
  only where the geometry is; no stray cells; a single pass over cells with a signed distance
  to the polygon set (sample at cell centres).
- Also exports finDefaults (the measured planform in m) for the flight config and
  sectionPolygons({finScale, view}) in metres for the panel's 2D fallback drawing.
- Lab: draws the section at 1024x320 with the fins, prints the measurements table, finScale
  and view controls.

## 6. SCENE (vx/js/scene)

createScene(canvas, { geometry }) -> scene. Owns the THREE.WebGLRenderer (antialias off above
DPR 1.5, powerPreference high-performance, pixel ratio from governor.dpr()). scene.renderer is
passed to createLattice by the integrator.
- World: y up, x downrange, z toward the default camera. Ground plane with a mono grid, a rail
  (1010 profile as a long box, length from config), altitude ticks every 100 ft on a vertical
  ladder beside the rail area, labels as small sprites in mono. Rocket group at (x, y) rotated
  theta about z; inside it the CAD model from the loader with the livery, four fins (fin group
  scalable about the root for finScale), units 0.001 m per CAD unit.
- Slice (slice.js): a PlaneGeometry in the rocket's local pitch plane covering the lattice
  domain (cols x cellM by rows x cellM, nose column aligned to the nose tip), ShaderMaterial
  sampling lattice.texture with alpha blending, depthTest on, depthWrite off, rendered after the
  opaque rocket. The mapping of grid axes to local axes follows the section 2 sign convention.
  setSliceTexture(tex), setSliceView('through'|'between') rotates the plane 45 degrees about
  the axis when 'between'. Tier 3 may add a second plane at 90 degrees only if a second
  lattice instance is supplied (optional, not required).
- Markers (markers.js): CG symbol (circle with alternating filled quadrants), CP dot (Barrowman)
  and a hollow CP ring (lattice, when available), relative wind arrow ahead of the nose, normal
  force arrow at the CP scaled by N, thrust arrow at the tail scaled by T, all with mono labels;
  toggled by setMarkers(bool). Exhaust (exhaust.js): additive sprite plume scaled by thrust,
  off at tier 0.
- Camera (camera.js): presets side, quarter, chase, pad; smooth transitions on the site easing;
  chase follows the rocket in world space with lag; orbit by dragging empty space using the
  vendored OrbitControls (assets/charger-explorer/vendor/OrbitControls.js) with zoom limits.
- Interaction: pointer down on the rocket (raycast against an invisible capsule around the
  body) starts a flick drag; moving sideways shows a vector; release returns the pitch-rate
  impulse through onFlick(radPerSec). Pointer elsewhere orbits. Touch the same. The pointer
  never reaches the lattice.
- API: ready, renderer, setFlight(state, derived), setSliceTexture, setSliceView, setView (for
  the slice ramp only, passed through), setCamera(preset), setMarkers, setFinScale, setRail(m),
  onFlick(fn), setTier, resize(), render(dt), destroy(). Reduced motion: no camera transitions,
  no plume flicker.
- Lab: loads the real model, a checkerboard test texture on the slice, sliders for x, y, theta,
  alpha (with the wind arrow), finScale, camera presets, markers; the alpha = +15 degrees
  screenshot must show the arrow on the side the nose points toward.

## 7. PANEL (vx/js/panel)

mountPanel(root, { flight, lattice, scene, playback }) -> panel. DOM only, mono.
- Readouts (SIM unless tagged): time code T+00.000, phase, altitude ft, airspeed ft/s, angle of
  attack deg, pitch deg, pitch rate deg/s, dynamic pressure lbf/ft2, static margin cal, CP in
  from nose (Barrowman) and CP (lattice) in, normal force lbf, restoring moment lbf in
  (Barrowman) and C_m (lattice), rail exit speed ft/s once known, max alpha, apogee ft once
  known, lattice line: grid, steps per second, tier, precision.
- Controls (controls.js): LAUNCH, PAUSE, RESET; playback 1/32, 1/8, 1/2, 1; fin scale slider
  with presets none, half, full; CG from nose (in); rail length (in); launch angle; wind mph;
  gust peak mph and FIRE GUST; FLICK hint (drag the rocket); view (smoke, pressure, vorticity,
  speed); section (through fins, between fins); camera presets; markers toggle; lattice flies
  it (lab only, hidden on the page unless ?lab). Keyboard: L launch, R reset, space pause,
  1-4 views, G gust.
- Chart (chart.js): canvas 2D strip chart of alpha and pitch in degrees over an 8 s window that
  scrolls, event ticks with labels (railExit, burnout, apogee), 2 px lines, ink ramp, one
  accent. Also a small CP/CG bar: a horizontal rocket outline with the CP and CG positions.
- Fallback (fallback.js): createFallbackView(canvas, geometry, flight) draws the rocket outline
  from geometry.sectionPolygons with CG, CP, wind arrow and force arrows on a 2D canvas, animated
  by the flight model, for browsers without WebGL2 or float render targets.
- Layout: desktop right rail 320 px, chart docked at the bottom of the stage; phone bottom sheet
  with a handle, collapsed row shows phase, time code, alpha, margin. Reduced motion: no
  autoplay, STEP 0.1 s buttons appear.
- Lab: a synthetic flight (the real flight module if present, else a scripted state) driving the
  panel and the fallback view; both viewports.

## 8. PAGE (integrator, after the build)

vx/index.html replaces the old page. Header strip (mono meta: CHARGER / FIELD STUDY 01 / PITCH
PLANE, engine, grid, tier, time code). Stage: scene canvas, panel, chart. Below: Method (what is
simulated, modelled, estimated and fitted, with tags; the validation numbers; the slow-motion
and inflow-floor caveats; the CAD versus page discrepancy), Configuration table (every number
with its tag), Runs (full fins, half fins, no fins, crosswind 10 mph, gust at rail exit; each a
button that configures, resets and launches), footer links to merttureli.com and
projects/charger.html. URL state ?fins=&cg=&rail=&wind=&gust=&speed=&view=&cam=&seed=&autolaunch=1
&hold=<alphaDeg> (hold pauses the flight at a fixed alpha with the lattice running, for
verification). noindex stays. No analytics. Skip link, one h1, forced-colors, 100svh,
safe-area insets. Delete every legacy vx file the new page does not import; rewrite README and
the lab index.

## 9. Verification gates

- Each module: node --check, harness CLEAN at both viewports (and --no-gl), screenshots looked at.
- flight.test.mjs passes under node. Lattice validation numbers reported. Scene alpha-sign check.
- Page: harness CLEAN on default, reduced motion, --no-gl and ?tier=3; a 20 s video at
  ?autolaunch=1&speed=1; a screenshot at ?hold=15&view=pressure showing the pressure
  difference across the fins; phone bottom sheet screenshots; keyboard trail reaches every
  control; no console errors; LCP under 1 s on the harness.
