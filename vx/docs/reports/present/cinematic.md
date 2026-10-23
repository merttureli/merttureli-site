# Cinematic review: the CHARGER field study as a high-speed replay

Lens: a motion and interaction director. The launch should feel like a high-speed camera replay: camera choreography per phase, the moment of ignition, the slow-motion wobble, the fins' pressure flashing in, the settle, the empty stage before launch, the end state. What is the one shot someone screenshots? Where is motion decorative and where is it informative? Does reduced motion still read?

Method: I served the repo root and opened /home/user/merttureli-site/vx/index.html in headless Chromium on SwiftShader, at 1440x900 and 390x844, with clarity.ms, bing.com, workers.dev and formspree.io blocked in every context. SwiftShader runs at about 100 lattice steps per second, so I stepped the flight deterministically through `window.__field.playback.step`. I also pre-developed the lattice in-page (1,200 to 1,500 steps, then 300 to 400 more at each beat) so each frame shows roughly what a graphics card shows at that instant. I shot four sequences:

- The run 05 gust in the side, pad and chase cameras.
- The gust beats in the pressure view.
- The no-fins run in the pressure view.
- The phone with the sheet collapsed and expanded.

I also reused the cold-load frames from the interrupted first run of this lens and looked at the other lenses' end-state, reduced-motion and no-WebGL frames. I flew every run in node with the page's own flight module to get the exact beat times (scripts/traj.mjs) and the screen time under each rate rule (scripts/ramp.mjs). Two images are mocks I drew outside the page, and both say so on the image. Read-only: nothing in the repo changed.

Files, all in /tmp/claude-0/-home-user-merttureli-site/89c47636-e713-59a0-ab78-6864669d7dfa/scratchpad/reports/present/cinematic/:

| Image | What it shows |
|---|---|
| sheet-side-gust-run.png | Run 05 in the default side camera, T+0 to T+8.05, smoke |
| sheet-pad-camera.png, sheet-chase-camera.png | The same run from the pad and chase presets |
| sheet-gust-pressure-beats.png, beats-gust/gp-*.png | Run 05 in the pressure view at pad, rail exit, peak AOA, T+0.55, max pitch T+0.70, T+0.95 |
| sheet-nofins-pressure-beats.png, beats-nofins/np-*.png | Run 03 (no fins, 5 mph) at T+0.9, 1.15 and 1.4 |
| phone-gust-t0p7-pair.png | 390x844 at T+0.70, sheet collapsed and expanded |
| d-cold-1s5.png, d-cold-12s.png | The empty stage before launch |
| mock-end-plate.png | MOCK: the proposed end plate, Run 01 and Run 03 paths from the node flight model |
| mock-streaks-t0p436.png | MOCK: relative-air streaks over the real T+0.436 frame |
| scripts/ | runner (run.cjs), sequences, node probes, sheet and mock scripts |

## Verdict

The page already holds every ingredient of a strong replay: a livery rocket on a dark stage, a plume that scales with thrust, a pressure field that flips sides as the nose swings, and a no-fins run that turns the rocket sideways in a slab of orange. Only the editing is missing. Today the camera never moves on its own, the rate never changes on its own at the moments that matter, and the replay ends on its weakest frame.

1. **The time budget is upside down.** The auto rate is 1/8 from ignition until 3 s after burnout, then real time. The part that explains fins (rail exit to settle, T+0.249 to T+0.97) gets 5.8 s of screen time. The 26 s after it are slow-motion coast in which nothing changes. The whole replay is 40 s, and its middle two-thirds is dead air.
2. **The camera is a locked-off tripod glued to the rocket.** The side preset follows rigidly, so the rocket never moves in frame. The ground leaves within a second of screen time, and by T+7 the frame matches the pad frame minus the ground (story/03-autolaunch-speed1-12s). Nothing on screen gives speed or height except the ALT plate. The pad camera is not a launch photographer's shot: at T+0 it is a telephoto that crops the pad and looks like the side view (sheet-pad-camera.png).
3. **The beat that matters is fast and unmarked.** In run 05 the air meets the rocket at 7.2° at T+0.436 while the body has turned only 0.8°. The fins then swing the nose 8.5° into the gust by T+0.70, and the pressure field flips from the left side of the slice to the right (gp-t0p436, gp-t0p7). At 1/8 that flip takes 2.1 s of screen time, with no hold, no push-in and no change of view. The default view is smoke, and smoke cannot keep up in a slowed replay (proposal 3).
4. **The ending undoes the replay.** The flight runs 2 s past apogee, so the last image is a rocket falling tail first: AOA −180.00, the chart pegged, a warning-coloured caption "INFLOW HELD AT −35° EST / THE FLIGHT IS PAST IT" (first-timer/d20-auto-21). The best possible last image, both paths on one plate (mock-end-plate.png), does not exist.
5. **What already works.** Motion that maps one to one onto the model (the body's pitch, the REL WIND arrow, the N and T arrows, the plume length, the ALT cursor, the chart) is honest and well drawn. Reduced motion is clean: tier 0, no autoplay, STEP 0.1 S and STEP 1 S buttons, everything readable (first-timer/d90-reduced). The phone composition with the sheet collapsed is the best framing on the site: the tilted rocket fills the portrait stage (phone-gust-t0p7-pair.png, left).

## The replay as it plays today, shot by shot

Beat times are from node with the page's flight module (run 05: 11.2 mph gust at rail exit; run 03: no fins, 5 mph). Screen times are at the current auto rate.

| Beat | Flight time | Screen time now | What the frame shows | Problem |
|---|---|---|---|---|
| Empty stage | before launch | open-ended | Rocket on the rail, ~30 plates and readouts at zero, a white-striped box around the body (d-cold-12s) | Static. Reads as an instrument, not a shot. The stripes read as a cage at 0° |
| Ignition | 0 to 0.006 | 0.05 s | Plume sprite appears, faint orange ground glow (g-t0p03) | No beat: same framing, same labels, ignition is a few pixels |
| Rail | 0.006 to 0.249 | 1.9 s | Rocket rises on the rail; camera follows, ground slides away | Fine, but the plume flickers at wall-clock speed while the rocket moves at 1/8 |
| Gust hits | 0.249 to 0.436 | 1.5 s | Arrow tilts 7°; body tilts 0.8° | The visible cue is a 7° arrow and a 40 px orange N arrow |
| Fins push back | 0.436 to 0.70 | 2.1 s | Body swings to −8.5°, pressure flips sides | The best physics on the page, played at the same speed as the rail |
| Overshoot and settle | 0.70 to 0.97 | 2.2 s | Small second swing, flat | No hold, no punctuation |
| Coast | 0.97 to 8.04 | 26 s at 1/8, then 3.8 s at 1 | Identical frames; altitude rises on a plate | Dead air |
| After apogee | 8.04 to 10.05 | 2 s | Pitch-over, tail-first fall, AOA −180, warning caption | The last image is an artefact |

## Motion audit: informative or decorative

| Motion | Kind | Verdict |
|---|---|---|
| Rocket translation and pitch | Informative, flight model | Keep. The only thing that must stay true to flight time |
| REL WIND arrow, N arrow, T arrow, ALT cursor | Informative, one to one with state | Keep. N disappears on the orange pressure field (visual lens r2) |
| Plume length and ground glow | Informative, thrust | Keep |
| Plume flicker and sprite drift | Decorative, wall-clock time | Fix: run it on flight time, or the slow motion reads as fake (proposal 7) |
| Lattice smoke and pressure | Informative but quasi-steady ("NOT TIME-ACCURATE") | Keep; pick the view that keeps up (proposal 3) |
| Camera rigid follow | Neutral | Keep for angle beats; it reads true only face-on |
| Camera preset transitions, 1200 ms | Transitional | Use them as edits on beats (proposal 4) |
| Strip chart scroll | Informative | Keep |
| Missing: any world reference at altitude, any visible gust, any path history | | Proposals 2 and 9 |

## The one shot

- **What people screenshot:** run 03 at T+1.15 in the pressure view (beats-nofins/np-t1p15.png). The rocket is 47° over, the windward side is a slab of livery orange, the CP sits 4.3 in from the nose ahead of the CG, and a long N arrow points at it. It needs no words.
- **What people forward:** the end plate (mock-end-plate.png). Run 01 climbs to 1,028 ft and leans into the wind. Run 03 arcs over downwind and tops out at 342 ft. Same breeze, both SIM, one picture.
- The finned rocket's own hero frame is T+0.70 in the pressure view with a push-in (gp-t0p7, and the phone version in phone-gust-t0p7-pair.png): the body 8.5° over and the orange pressure on the far side of the fins. Today nothing lingers on it.

## Proposals, ranked by impact per effort

Every proposal keeps the source tags and the honesty rule, the house type and colour (ink ramp, livery orange as the one accent), the site easing cubic-bezier(0.22, 1, 0.36, 1), reduced motion and the 2D fallback.

### 1. An event-driven speed ramp that stops at apogee (S to M)

- **What:** replace the fixed auto rule (1/8 until 3 s after burnout, then 1, until 2 s after apogee) with keyframes taken from the beat times of the same configuration. The page already flies each configuration silently (flyRun in main.js); fly the launch's own config the same way at LAUNCH. The rate eases in log space between keyframes with smoothstep:
  - Ignition and rail at 1/8.
  - Ease to a slow rate from 0.05 s before rail exit to 0.05 s after.
  - Hold it through peak AOA and the first pitch swing.
  - Ease back to 1/4 by the settle time, and to real time by about T+1.6 s.
  - One freeze-frame, 1.5 s with the clock stopped, at the first pitch extreme after peak AOA (T+0.70 in run 05).
  - Pause at the apogee event and hand over to the end plate (proposal 2). The rest of the 2 s stays one RESUME away.
- **The slow rate:** chosen so that rail exit to settle gets about 12 s of screen time, clamped to 1/32 to 1/8.
  - Run 05: about 1/20.
  - Run 01: its 0.22 s settle clamps at 1/32.
  - Run 03: the window runs from rail exit to pitch past 60° (T+1.62), about 1/9 to 1/12.
- **Run 05 with these keyframes (scripts/ramp.mjs):** rail 2.1 s, rail exit to peak AOA 3.6 s, peak AOA to max pitch 5.3 s, overshoot to settle 3.8 s, ramp-out 1.6 s, coast 6.4 s. 26 s in all with the freeze and a 2 s apogee hold, against 40 s today. The wobble gets 12.7 s instead of 5.8 s, and the slow-motion coast goes from 26 s to none.
- **Why:** a non-engineer sees the push and the overshoot at a speed the eye can follow, and the replay ends before attention does. This is the signature of a high-speed replay: the clip visibly slows into the event and speeds out of it.
- **Where:**
  - main.js: the `playback.rate` getter, a `beats(config)` helper next to flyRun, and the apogee pause.
  - index.html: Method 04, rewritten (the "1/8 until 3 s after burnout" sentence).
  - The header RATE and the panel's rate line show the live rate ("1/20 AUTO", "HOLD AUTO").
- **Risk:**
  - Honesty: the rate shown must always be the true rate, and the clock stays flight time. The freeze must read HOLD, never a frozen clock with no label. Rate buttons still override, as today.
  - Performance: none (one silent flight per launch, already done for the run cards).
- **Verify:**
  - launch-video.cjs at ?autolaunch=1: log the rate against flight time and compare the per-segment screen times with the table above within 10 percent.
  - The header RATE matches `playback.rate` at every sampled frame. A rate button mid-flight stops the ramp.
  - The flight pauses at the apogee event, with T+ equal to the apogee time.
  - Reduced motion: no autoplay as today. STEP still works, and a "next beat" step can use the same beat table.

### 2. The end plate: pull back to the whole path, with the counterpart's path as a ghost (M)

- **What:** at the apogee pause, the camera eases back (2400 ms, site easing) to a side-view framing that fits the flight path from the pad to apogee. A path line drawn from `flight.history` stays visible during the flight in paper at 45 percent, 1 px; on the plate it becomes 2 px. The plate also carries:
  - Event ticks with mono labels: RAIL EXIT, BURNOUT, APOGEE n FT SIM.
  - The altitude ladder, which already runs to 1,100 ft, for scale.
  - The counterpart run's path as a ghost, flown silently in this tab with the same wind: fins on or off at the same breeze, or the still-air path for the gust run. Finned paths in paper, finless in livery orange.
  - A caption: RUN 01 AND RUN 03 / THE SAME 5 MPH CROSSWIND EST / BOTH PATHS FLOWN IN THIS TAB SIM.
  - The plate holds until the visitor acts.

  mock-end-plate.png shows the result from the real model: 1,028 ft leaning 82 ft upwind against 342 ft drifting 281 ft downwind.
- **Why:** this is the single image that explains fins to anyone, and the one a recruiter or a friend forwards. It replaces today's last frame (tail first, −180°, warning caption).
- **Where:**
  - scene.js: `setTrail(points)` and `setGhostTrail(points, label)`, two THREE.Line objects with a dynamic buffer of up to 4,096 points, plus event tick sprites through the existing label code.
  - camera.js: a 'plate' framing that fits a world box in the side view (fitDistance already fits a box).
  - main.js: the apogee hand-off and the ghost run.
  - fallback.js: draw the same plate in 2D; it already has an altitude ladder.
- **Risk:**
  - Honesty: both paths are SIM flights of the page's model, never CHARGER's measured path. The caption must say so, and the wind keeps its EST tag.
  - Performance: two lines of at most a few thousand points.
  - The far clip (3,000 m) and the ladder already cover the framing. A pull-back to about 550 m makes the rocket a dot, so draw a 3 px livery tick at its position.
- **Verify:**
  - Screenshots at the apogee pause for runs 01, 03, 04 and 05 at 1440x900 and 390x844.
  - The path's top equals the run card's apogee, and run 04's x at apogee equals the card's "upwind at apogee".
  - Reduced motion: a cut to the plate, no pull-back.
  - No-WebGL: the same plate in the 2D view.

### 3. Make the fins' push flash in: an automatic pressure view through the wobble, with a legend (S)

- **What:** while the visitor has not picked a view, switch the slice from smoke to pressure at rail exit and back to smoke after settle. Each switch is a 240 ms fade of `slice.setOpacity` to 0, the view change, then a 480 ms fade back in, all on the site easing. While pressure shows, a two-swatch legend sits in the caption slot: ORANGE / AIR PRESSING HARDER and GREY / PRESSING LESS. This is shared with the first-timer lens's legend.
- **Why it is the right view, not just the prettier one:**
  - In the lattice a pressure disturbance crosses the grid at the lattice speed of sound, c_s = 1/√3, about 0.58 cells per step, while the smoke is carried at the inflow, 0.03 to 0.10 cells per step (FIELD 4).
  - So the pressure field answers a change of angle 6 to 19 times sooner than the smoke. The slowed replay gives the lattice only a few thousand steps across the wobble.
  - The smoke picture therefore lags the angle; the pressure picture keeps up. In run 05 the orange side flips from left (T+0.436) to right (T+0.70): the restoring push changing sides as the nose overshoots.
  - At tier 1 the same frames in smoke show nearly straight stripes (sheet-side-gust-run.png).
- **Where:**
  - main.js: on flight events, only while the view is 'auto'; the visitor's choice wins, as with the rate.
  - slice.js: already has setOpacity.
  - field.css: the legend.
  - The view row in the panel gains an AUTO state.
- **Risk:**
  - Honesty: the caption names the view at all times (FLOW / PRESSURE / ...). The 6 to 19 times figure is an estimate from c_s and u_in; measure it before it goes into Method (see Verify).
  - Performance: none.
  - At tier 0 or with no lattice there is no change.
- **Verify:**
  - Step the inflow angle from 0 to 7° at ?hold and count the steps until the windward-minus-leeward pressure difference reaches 90 percent of its held value (hold-pressure.cjs already measures the patches). Do the same for the dye's angle at the body. Report both.
  - Screenshots at T+0.436 and T+0.70 show the orange side flip (as in gp-t0p436 and gp-t0p7).
  - The legend passes a11y.cjs contrast.

### 4. A director: one camera move per phase, face-on whenever an angle is read (M)

- **What:** an automatic camera that runs only until the visitor touches the camera, like the auto rate. Per phase:

  | Phase | Camera |
  |---|---|
  | Empty stage | A three-quarter hero, low: quarter at about 6° elevation and 24° azimuth, k 1.15. Shows the livery, the fins in depth, the rail, the stand and the grid to the horizon. Static, no idle orbit |
  | Liftoff event | The existing 1200 ms move to side. At 1/8 it lands about 0.7 s of screen time before rail exit. The plume lights the rail during the move |
  | Rail exit to settle | Side, face-on to the pitch plane, the only view where angles read true. A slow push-in from k 1.0 to 0.8, aimed 0.15 m aft of the frame point (toward the CP and the fins), on the site easing over the slow window. Hold through the freeze-frame |
  | Burnout to apogee | Ease out to k 1.6 and 8° elevation, so the ladder and the falling ground read as height |
  | Apogee | The plate (proposal 2) |

  Run 03 stays in side all the way. The pitch-aware fit in camera.js already turns the frame box with the body.
- **Why:** the camera tells the viewer where to look, in order: the rocket, the launch, the angle, the push, the height, the result. Today every beat has the same framing.
- **Where:**
  - vx/js/scene/director.js (new, a few dozen lines), or main.js listening to flight:event.
  - camera.js: `setFraming({k, aimM})` eased on the side and quarter presets. The rig's fitK easing is already there. Add a director flag that the 'start' handler clears.
  - Replace or drop the current pad preset: a telephoto at T+0 that looks like side.
- **Risk:**
  - Honesty: no angle beat is ever shown from the quarter view.
  - Performance: none.
  - Depends on the label layout fix from visual lens r2 (labels on pitch-over), or on proposal 6. A push-in makes plate collisions worse.
- **Verify:**
  - A video at ?autolaunch=1. Log `scene.stats.camera` (mode, preset, distance) at each event against the table.
  - An orbit drag mid-flight stops the director, and so does a camera preset.
  - Reduced motion: no moves; side throughout; a cut to the plate.
  - Screenshots at T+0.70 at both viewports.

### 5. Phone: tuck the sheet away when the replay starts (S)

- **What:** LAUNCH, L, the peek play button and every run button collapse the phone sheet before the flight starts, so the replay is never played behind the panel. The sheet stays collapsed until the end plate.
- **Why:** with the sheet expanded, a launch plays behind it with only the nose visible (phone-gust-t0p7-pair.png, right). The phone's collapsed framing is the best on the site.
- **Where:** panel.js `press('launch')` and the run path in main.js, calling `setSheet('collapsed')` when `phoneMq` matches. Keep focus on the peek play button for keyboard and screen-reader users.
- **Risk:** none.
- **Verify:** at 390x844, expand the sheet, press LAUNCH: the stage is visible at T+0.3. Run the a11y.cjs phone pass for focus.

### 6. Let the plates step back while the replay runs (S to M)

- **What:** during playback the 3D plates dim to about 35 percent, except the one the beat is about:
  - REL WIND / ALPHA from rail exit to peak AOA.
  - The N arrow and the CP plate through the push and the freeze.
  - ALT through the coast.

  The hint line (DRAG THE ROCKET TO FLICK IT / ...) shows on the pad only. All plates come back at full strength on pause and on the plate. The panel keeps every number throughout.
- **Why:** a shot has one subject. Today eight plates and a hint compete with a 7° tilt (gp-t0p436).
- **Where:**
  - markers.js: `setEmphasis(names)`, opacity per plate.
  - scene.js: ladder labels.
  - main.js: beat to emphasis.
  - field.css: the hint, hidden while playback runs.
- **Risk:**
  - Honesty: no number is hidden, only dimmed, and the panel and chart carry them all. Dimmed plates may fall under contrast while they are not the subject. Keep the canvas aria-label carrying the beat's numbers at 1 Hz, as today.
  - Performance: none.
- **Verify:** screenshots at the five beats at both viewports. a11y.cjs; the dimmed state applies only while playing and returns on pause.

### 7. Put the fire on flight time (S)

- **What:** the exhaust's sprite drift (FLOW_HZ 2.6 plume lengths per second) and its per-frame jitter run on wall-clock time, so at 1/8 the flame flickers at full speed on a rocket that crawls. Advance the plume by dt × playback rate, with the jitter re-drawn once per 1/60 s of flight time. At 1/20 the flame then visibly slows, the way flame does in high-speed footage. Plume length and the ground glow already follow thrust.
- **Why:** the slow motion has to feel like one camera running fast. One element at real speed gives the trick away.
- **Where:** scene.js: a `setTimeScale(rate)` that main.js calls each frame, passed to `exhaust.update(dt * timeScale, thrust)` in vx/js/scene/exhaust.js.
- **Risk:** none; decorative and still tied to thrust. Reduced motion already holds a still plume.
- **Verify:** sprite phase advance per wall second equals FLOW_HZ × COUNT × rate within 5 percent at 1/8 and at 1, logged from a lab hook.

### 8. A slate at the start of each replay (S)

- **What:** for 1.2 s after LAUNCH, the run's conditions sit top left in the stage's mono caption style, then move up into the header: RUN 05 / GUST AT RAIL EXIT / 11.2 MPH EST / FULL FINS / AUTO RATE. Through the slow window, a quiet second line reads REPLAY 1/20. This replaces the GUST 11.2 MPH AT RAIL EXIT / DISARM pill during playback; DISARM moves to the panel's gust control. The pill covers the phone's slice and the T plate (phone-gust-t0p7-pair.png, left).
- **Why:** like a clapperboard, it tells the viewer what they are about to watch before it happens, and it states the EST conditions on the stage.
- **Where:** main.js `startRun` and launch, field.css.
- **Risk:** none. Tags stay on the numbers.
- **Verify:** screenshots at T+0 and T+0.3 for each run at both viewports. The live region updates no faster than 1 Hz.

### 9. Relative-air streaks: speed, the gust and the angle of attack in one honest image (M, optional)

- **What:** a sparse field of world-fixed air parcels around the rocket:
  - 120 to 200 parcels, depth-faded paper at 15 to 45 percent, 1 px.
  - Advected by `flight.state.wind`, so the gust moves them sideways.
  - Each drawn as a short segment along the relative air with a fixed flight-time shutter (about 4 ms).

  Seen from the camera that follows the rocket, their direction is exactly v_air = wind − v_rocket, the REL WIND arrow. So the angle between the streaks and the body is the angle of attack, and their length is airspeed. They lengthen through boost, shorten through coast and vanish at apogee. They fade out below about 15 m/s and are invisible on the pad in still air. Caption: STREAKS / RELATIVE AIR / SIM.
- **Why:** this is the only proposal that gives the coast and the gust a visible cause in the world, without inventing anything. mock-streaks-t0p436.png shows the direction taken from the page's own arrow.
- **Where:** scene.js or a new vx/js/scene/streaks.js, one LineSegments object, drawn behind the slice. Tier 1 and up.
- **Risk:**
  - Brand: in a still frame they can read as rain (the mock shows it). Keep them sparse, short and in depth, or drop the idea.
  - Honesty: never imply measured flow; the caption says what they are.
  - Performance: negligible.
- **Verify:**
  - At ?hold=15, project two points of a streak and the body axis and measure the on-screen angle: 15° within 1° in the side view.
  - On the pad in still air, none are visible.
  - Reduced motion: static ticks redrawn on each STEP.

### 10. Let the flow section dissolve into the air (S)

- **What:** widen the slice's edge fade on its long sides (uFade from 0.02 to about 0.10 in uv) and hide the hairline frame during playback, keeping the four corner ticks. The field then reads as air around the rocket instead of a box with a barcode in it.
- **Why:** the hard box is the most "instrument" element on the stage. The first-timer lens saw a cage at 0°.
- **Where:** vx/js/scene/slice.js (uFade and uFrame), toggled by main.js while playing.
- **Risk:**
  - Honesty: none. The faded band is the absorbing edge layer, which Method already calls numerical.
  - Brand: the corner ticks stay.
- **Verify:** before and after screenshots at ?hold=15&view=pressure&tier=1. The field inside the inner 80 percent of the slice is unchanged pixel for pixel.

## Reduced motion and no WebGL, per proposal

| Proposal | Reduced motion | No WebGL (2D view) |
|---|---|---|
| 1 Speed ramp | No autoplay, as today. STEP and a "next beat" step use the same beat table; the freeze becomes a step stop | Applies; the 2D view is driven by the same playback |
| 2 End plate | A cut, no pull-back | Drawn in 2D with the existing ladder |
| 3 Pressure auto view | An instant switch on the step that crosses rail exit | Not applicable |
| 4 Director | No moves, side throughout, a cut to the plate | Not applicable |
| 5 Sheet tuck | Applies (not motion) | Applies |
| 6 Plates step back | Applies on step, no fades | The 2D view already shows few labels |
| 7 Fire on flight time | The plume already holds a still frame | Not applicable |
| 8 Slate | A static line, no move into the header | Applies |
| 9 Streaks | Static ticks along v_air, redrawn on step | Can be drawn in 2D the same way |
| 10 Slice fade | Applies | Not applicable |

## Do not do

- Camera shake at ignition, lens flare, bloom or chromatic aberration: decorative, and in a replay that claims to be a measurement they read as fake.
- A countdown, a smoke cloud on the pad or a launch sound: fabricated, and sound is out of scope.
- Autoplaying the full launch on page load: the replay is the payoff and should start when the viewer is looking. One click from the front door the first-timer lens proposes is enough.
- Showing any angle beat from the quarter, chase or pad view: angles read true only face-on to the pitch plane.
- A freeze-frame with a running clock, or a slow rate the header does not show.
- Faster than real time for the coast: the rate set stays at 1 or slower.

## Dependencies and order

- Proposals 1 and 2 share the apogee pause. 2, 3 and 4 hang off the beat table that 1 builds.
- Land the visual lens r2 label fixes (labels on pitch-over, the N arrow on the orange field) before or with 4, or do 6 first.
- 5, 7, 8 and 10 are independent and small.
- 9 is optional; judge it in motion on a real graphics card before keeping it.

## Notes on this run

- SwiftShader frames take 0.5 to 2 s with the lattice running. Every beat frame here was stepped deterministically, and the lattice was developed in-page first.
- The banded contours in the pressure frames are tier 1 (512 × 160) on software rendering. A graphics card at tier 3 shows a smoother field.
- The flight beat times (rail exit 0.249 s, peak AOA 0.436 s, max pitch −8.51° at 0.70 s, burnout 1.277 s, apogee 8.04 s; run 03 apogee 342 ft at 3.00 s; run 01 apogee 1,028 ft) are SIM from the page's own flight module in node.
