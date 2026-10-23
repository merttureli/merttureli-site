# Probe builder hand-off (2026-10-22, run against the mid-integration page)

Scripts: scratchpad/harness/field/{launch-video,hold-pressure,lattice-validate,tier-sweep,links,a11y}.cjs (+ lib.cjs). Exit 0 pass, 1 gate failed, 2 not ready, 3 harness broke. Reports under scratchpad/reports/field/probes/<script>/.
Commands (from harness/field): node launch-video.cjs | node hold-pressure.cjs --query tier=1 --wait-steps 1500 --steps-timeout 900 (SwiftShader; plain on a GPU) | node lattice-validate.cjs (~7 min) | node tier-sweep.cjs | node links.cjs | node a11y.cjs and node a11y.cjs --viewport 390x844

Results so far: launch-video PASS (events ignition 0.000, liftoff 0.006, railExit 0.249, maxQ 1.228, burnout 1.277, apogee 8.053); lattice-validate PASS (C_D 1.4504, St 0.1694, 20,000 steps, 51 steps/s under SwiftShader); hold-pressure PASS only with ?tier=1 pinned and 1500 steps (windward +163.2 vs leeward -153.6 on the ramp channel; the page's slow-frame guard otherwise pauses the lattice under software GL); tier-sweep PASS (10 runs, requested tier shown, no errors, no overflow); links PASS (7 pages, 43 files, 138 refs, 0 missing); a11y PASS at both viewports (44/44 and 19/19 tab stops, live regions at most 1 Hz, 0 contrast failures of 180).

Findings for the second integration pass:
1. The slow-frame lattice pause ("OFF / PAUSED, SLOW FRAMES") blocks the hold gate under software GL unless ?tier= is pinned. Decide whether a pinned tier should disable the guard, and make sure a real GPU never trips it on the first frames (warm-up).
2. The first lattice.stats.stepsPerSecond sample after start is implausible (17,000 to 25,000); later samples are sane. Fix the first-sample window.
3. vx/lab/flight.html fails a11y: 9 sliders have no accessible name (labels point at the <output>), Relaunch button contrast 4.23:1. Fix in the lab page.
4. "Cannot access 'lastHead' before initialization" was seen once on the page and has since been fixed; keep a regression check.

## Lattice builder's honest limits (from build:lattice notes, binding for the copy)
- In a 2D section the long body lifts like a wing: the lattice CP lands about 1 calibre ahead of the CG at alpha 15, and cm was destabilising at alpha 4. The lattice is a qualitative flow and fin-pressure picture, not a 3D stability number; the "lattice flies it" lab toggle is statically unstable by construction. The method section must say this plainly and the panel's lattice CP / Cm readouts must be labelled as a 2D section cross-check.
- Re 3000 in the lattice against about 3e5 for the real rocket.
- Default stabilisers (regularised collision, positivity limiter, speed floor, absorbing edges, start-up viscosity, Guo outflow) deviate from FIELD.md section 4 and are documented in the headers; the plain model stays selectable.
- About 2,000 steps after a reset carry a start-up transient (stats.tauNow > stats.tau0 flags it); forces and the pressure view are noisy then. Readouts should show a dash until the flow is developed.
- Integration pattern: createLattice(scene.renderer, {tier}); setSection with the builder form so tier changes rebuild the mask; inflowFor(V) and pitchRateToLattice(q, V, D, dCells, uIn) helpers exist; cm already uses the flight sign.
