# First-timer review: the CHARGER field study, /vx/

Lens: a smart person with no engineering background opens the page cold. What do they get in 3, 10 and 60 seconds? What is noise? Where do they get lost? What would make them say "oh, that is why rockets have fins"?

Method: the real page served from the repo root in headless Chromium (SwiftShader), 1440x900 and 390x844. Scenarios I ran: a cold load; ?tier=1 idle; a "covered" pass with the panel, chart, captions and markers hidden (the stage on its own); ?autolaunch=1 at the auto rate; the No fins and Gust runs started from their cards; ?hold=15 in the pressure and smoke views, with the lattice stepped 2,000 steps in-page so the field is developed the way a GPU user would see it; the sections below the stage; the phone with the sheet open and closed, plus a launch; --no-gl; reduced motion. I read the Method, Configuration and Runs text in full. The screenshots are in `reports/present/first-timer/` (named below). Read-only: nothing in the repo was changed.

## The verdict in one paragraph

The engineering is all there and it is honest, but a first-timer never gets to it. The first screen reads as an instrument dump: a small orange rocket, about 30 boxed mono readouts, 23 SIM chips in the stage text alone, and an empty chart. The header jargon ("FIELD STUDY 01 / PITCH PLANE", GRID, TIER) and the missing owner name do the rest. The best line on the page, "What the fins do", and the one plain sentence ("A gust or a crosswind tips the nose; the fins, aft of the centre of gravity, push it back") are one screen below the fold. The single image that explains fins to anyone is the No fins run turning sideways. It is at the bottom of a 10,357 px page, after the Method and the Configuration table. And the obvious first action, the big white LAUNCH, flies in still air: the angle of attack reads 0.00 for the whole flight, the chart is a flat line, and nothing shows what fins do. Then the replay ends with the rocket sliding down tail first at AOA -180.00. One correctness bug also hits the hero comparison: started from its card, the No fins run keeps ghost fins in the flow section.

## 3 seconds (d01-cold-1s5, p02-cold-12s)

What they understand: a rocket, on a launch rail, at night. Some kind of simulator. A white LAUNCH button.

What they do not understand: whose page this is (no name above the fold; the header says CHARGER / FIELD STUDY 01 / PITCH PLANE), what question it answers, or what LAUNCH will show them. Every label near the rocket is engineer shorthand with a source suffix: REL WIND 0 FT/S SIM, ALPHA 0.0 DEG SIM, CG 22.0 IN SIM, CP 33.1 IN SIM, MARGIN +4.15 CAL SIM, N 0.00 LBF SIM, ALT 0 FT SIM, 0 FT AGL. The right rail adds 25 more rows: CN ALPHA, DAMPING RATIO, CM / LATTICE 2D, and so on.

## 10 seconds (d03-cold-10s)

The smoke rake fades in as about 15 vertical white stripes inside a bracketed box around the rocket. At zero angle this reads as a barcode or a cage, not as air moving. The caption under it says "2D SECTION / INFLOW 0.030 LU AT 0.0 DEG SIM / NOT TIME-ACCURATE". LU (lattice units) is the first unexplained acronym a visitor tries to read. The hint line ("DRAG THE ROCKET TO FLICK IT / DRAG SPACE TO ORBIT / L LAUNCH") is the only instruction, and "flick" does not say why you would.

## 60 seconds: the default launch (d20-auto-00 to d20-auto-21)

They press LAUNCH. At 1/8 speed the rocket rises, but the camera follows it, so in the frame it barely moves. Only the plume and the receding grid show that it launched. From pad to coast the frames look almost the same (compare d10 with d20-auto-07 at T+2.2 s). The angle of attack stays at 0.00 the whole way, the smoke stays straight, the force arrow never appears and the chart is a flat line. On a real GPU that is about 34 s of wall time before the rate switches to real time. Then the flight ends 2 s after apogee: the rocket falls tail first, AOA -180.00, the chart pegs off scale and the caption says "INFLOW HELD AT -35 DEG EST / THE FLIGHT IS PAST IT" (d20-auto-21). A first-timer's last image is a rocket going backwards.

If they scroll instead, they reach "WHAT THE FINS DO" (d70-study), the first plain sentence on the page. It is half jargon ("a rigid-body flight model computes the pitch motion with Barrowman's stability method, and a lattice Boltzmann section through the pitch plane..."). The plain idea comes last, and it should come first. Next comes METHOD: about 3,000 px of RK4, interference factors, τ0, regularised collision and Guo extrapolation. Most first-timers stop there. The Runs, which are the experiment a layperson can follow, come after the Configuration table.

## The cover test (d12-covered-panel-markers)

With the panel, chart, captions and markers hidden, the stage at rest is a rocket on a rail inside a box of white stripes. It tells no story. During the Gust run the story is real but tiny (d50-gust-01, peak AOA +7.2 deg): the rocket leans a degree, the stripes lean a few degrees, and the only cue for "the fins push back" is a 40 px orange arrow labelled N +0.60 LBF. During the No fins run the stage needs no words (d40-nofins-04, d40-nofins-08): the rocket swings sideways, the smoke curls around it, and it flies a loop. That is the "oh, that is why rockets have fins" moment, and you only reach it by scrolling to the bottom and pressing "Launch run 03".

## Where they get lost

1. No name and no premise above the fold. The h1 is "CHARGER / FIELD STUDY 01 / PITCH PLANE".
2. The first action demonstrates nothing (still air, AOA 0.00 throughout).
3. Pressure has no legend (d63-hold-pressure-developed): one side of the box turns orange, the other shows grey contour lines, and nothing on the stage says orange means the air pressing harder. The developed smoke at 15 deg reads as a moire, wood grain or a fingerprint (d63-hold-smoke-developed). The pressure view is the more legible of the two for a layperson.
4. The fin choice (NONE / HALF / FULL), the most understandable control on the page, sits below about 30 readouts in the right rail. On the phone it sits under Events and Lattice (p04-sheet-open-scrolled).
5. Section order: Method, then Configuration, then Runs. A layperson needs the reverse.
6. Phone: the collapsed sheet row reads PHASE / TIME / AOA DEG / SM CAL. "SM CAL" stops even an engineer for a second. The lede shows a keyboard-shortcut table (L, SPACE, R, G, 1 to 4, ARROWS) on a touch device (p1-study).
7. The end state (tail first, -180 deg) and the "INFLOW HELD AT -35 DEG" caption.

## Bug found on the way (verified, reproducible)

Ghost fins in the No fins run. Load `?tier=1`, wait for the lattice, then click "Launch run 03". The 3D model loses its fins, but the flow section keeps two fin-shaped solids at the tail (black cut-outs with an orange rim), and the smoke bends around fins that are not there. This happened every time I tried, clicking 6 s and 15 s after load (d40-nofins-01-tail-crop, d40-nofins-08, d47-nofins-late-2). Loading with `?fins=none&wind=5&autolaunch=1` instead gives a clean finless section (d47-nofins-url-1). The side-by-side is d47-ghost-fins-compare. Setting the fin scale to 0 at the pad without launching also looked clean (d46), so the fault is in the run path: reset, then set, then launch in `startRun` in vx/js/main.js, plus the section rebuild or the lattice reset. main.js's own section object did change (solid cells went from 6,710 to 6,284 at 512x160), so the engine or its view mask is holding the old solid. This is the comparison a first-timer most needs, and right now the flow picture in it is wrong.

## What already works for a first-timer

- The livery rocket on the dark stage, the plume, and the No fins loop: strong images.
- "WHAT THE FINS DO" at display size: the right headline, in the right voice.
- The run cards: five plain titles (Full fins, Half fins, No fins, Crosswind 10 mph, Gust at rail exit), each with a "Watch..." sentence. The apogee row in the cards makes a plain contrast by accident: 1,028 ft with fins, 342 ft without.
- The no-WebGL 2D view (d81-nogl-launched): a clean outline with CG, CP, the wind arrow and an altitude ladder. It is more legible to a layperson than the 3D labels.
- Reduced motion (d90-reduced) keeps everything readable and adds STEP buttons.

## Proposals, ranked by impact per effort

1. **Fix the ghost fins in Run 03** (main.js startRun and section rebuild, lattice setSection/reset; S to M). Why: the finless comparison is the page's one universal image, and today the flow in it still has fins. Honesty: this restores it. Verify: click Run 03 at 6 s and 15 s after load and screenshot the tail at T+1 s: no cut-outs. Compare the engine's mask solid count with the `?fins=none` load. Run the d47 compare again.

2. **A plain front door on the empty stage** (index.html .fd-stage plus main.js plus field.css; M). Before the first launch, show over the stage's left third, on ink: the display headline "WHAT THE FINS DO" (moved up from the lede), one body sentence in plain words ("Wind tips a rocket's nose. Fins behind its balance point catch the air and turn it back. Launch it with fins, then without."), a mono byline ("MERT TURELI / CAPTAIN AND CHIEF ENGINEER / FIRST PLACE, BATTLE OF THE ROCKETS 2026" with the PAGE tag), and two buttons: LAUNCH WITH FINS (Run 01, 5 mph) and LAUNCH WITHOUT FINS (Run 03, same breeze). The overlay steps back on launch and returns as a compact end card. Why: in 3 seconds the visitor knows whose page it is, what question it answers, and the one thing to do. Honesty: the sentence is textbook (Barrowman). The award is PAGE. The runs are existing SIM runs with EST wind. Verify: 1440 and 390 cold screenshots show headline, byline and both buttons over the stage. Keyboard reaches both buttons. --no-gl and reduced motion show the same overlay over the 2D view. Run the harness.

3. **Make the first launch show the effect** (main.js default launch; S). Today LAUNCH flies still air and AOA stays 0.00. Make the panel's LAUNCH (and L) fly the Run 01 setup (full fins, 5 mph crosswind) on the first press, and keep still air one click away (a "Still air" run or the wind slider at 0). Then the first thing anyone sees is the nose being tipped and turned back. Honesty: the wind is already an EST slider. Update the Configuration row or label the default "5 mph crosswind EST" in the panel and the badge. Verify: with ?autolaunch=1, AOA is non-zero after rail exit and the chart shows the wobble and settle. The Configuration table matches what LAUNCH flies.

4. **Run cards with flight-path sketches, and the pair in the lede** (main.js flyRun keeps a decimated (x, y) path; a small inline SVG per card; field.css; M). Draw every run on the same axes: Full fins is a near-vertical line to 1,028 ft, No fins is a loop topping out at 342 ft, Crosswind leans into the wind. Put a two-up "with fins / without fins" version under the lede headline. Why: a non-engineer gets the whole study from two lines in one second, and it is also the screenshot people forward. Honesty: it is the same silent SIM flights whose numbers the cards already print. Tag it SIM and label the axes (ft downrange, ft altitude). Verify: the paths match the card numbers (apogee, upwind at apogee). Screenshots at both viewports. It renders with JS on and degrades to the numbers with JS off.

5. **Plain beat captions driven by the flight** (main.js updateCaption, field.css; M). One line at display-adjacent size in the stage caption slot, changed only on state transitions and at 1 Hz or slower: ON THE RAIL / OFF THE RAIL: THE WIND TIPS THE NOSE (railExit with |alpha| > 2 deg) / THE FINS PUSH IT BACK (moment restoring and |alpha| falling) / STRAIGHT AGAIN (|alpha| < 2 deg) / for negative margin, NOTHING PUSHES BACK: IT TURNS SIDEWAYS / APOGEE. The engineering caption (2D SECTION / inflow / NOT TIME-ACCURATE) moves to a second, dimmer line, or into Method. Why: it tells the story in order with the readouts stepped back. Honesty: each caption is conditional on SIM state, never scripted by time, so a still-air flight never claims a push. Verify: run the five runs and check that each caption appears only when its condition holds (log state at each transition). Check that the live region stays at 1 Hz or slower.

6. **End the replay at apogee with an end card** (main.js playback and flight stop condition for the page, not for tests; S to M). Stop showing the 2 s after apogee (tail first, AOA -180.00, chart pegged, "INFLOW HELD AT -35 DEG"). Freeze at apogee and show the end card, APOGEE <ft> SIM / T+<s> S from the flight just flown (1,033 ft at T+8.05 s in still air), with LAUNCH AGAIN and the other fin choice. Why: the last image becomes the result, not an artifact. Honesty: FIELD already rules recovery out of scope, so stopping at apogee is the cleaner claim. Verify: d20-style sweep: the last frame is the apogee card, and the chart stays within its scale.

7. **Reorder below the stage: lede, Runs, Method, Configuration** (index.html section order, the fd-index numbers, the header nav; S). Lead each run card with its plain "Watch..." sentence and put the numbers after it. Rewrite Run 02's note in one plain line, with the margin detail under it. Why: the experiment comes before the appendix, and a layperson stops at Method. Honesty: none. Verify: links.cjs, a11y.cjs heading order, and the skip links still land.

8. **Legends for the flow views on the stage** (main.js updateCaption, field.css; S). Pressure: two swatches, "ORANGE / AIR PRESSING HARDER" and "GREY / PRESSING LESS". Smoke: "WHITE LINES / SMOKE CARRIED BY THE AIR". Make pressure the view the plain story points to at the push beat. Why: today the orange slab has no key, and the developed smoke at 15 deg looks like a moire. Honesty: it describes the ramp (rho - 1, positive in orange), and the 2D caveat stays in Method. Verify: the ?hold=15 pressure screenshot shows the legend at 1440 and 390, and the legend contrast passes a11y.cjs.

9. **Quiet the instrument layer by default** (panel.js, panel.css, markers.js labels; S to M). FIELD section 7 already says the readouts are "SIM unless tagged". Drop the per-row SIM chips and the SIM suffix on the 3D plates, keep "ALL SIM UNLESS TAGGED" in each section head, and show chips only on PAGE, CAD and EST values. Give CG, CP and AOA a plain sub-label (balance point / where the air's push acts / how far the nose points off the oncoming air). Collapse Stability beyond margin, plus the Lattice and Configuration sections, behind an INSTRUMENTS disclosure that is closed on first load. Why: it cuts about 30 tags and 15 rows from the first screen without hiding any source. Honesty: every number's source stays determinable, as the spec allows. The honesty reviewer should confirm the wording. Verify: a11y.cjs (names, focus), screenshots, and a check that every PAGE, CAD and EST value still shows its chip.

10. **Phone first screen** (panel.css and panel.js collapsed row; field.css; S). Collapsed row: replace SM CAL with MARGIN / CAL, and add the fins toggle (WITH / WITHOUT) next to the play button. Hide the lede's keyboard table on `(pointer: coarse)`. Why: the phone visitor gets the same single choice as on desktop, without keyboard noise. Honesty: none. Verify: 390x844 screenshots with the sheet closed and open, plus a tap on the toggle and a launch.

## Cut or hide

- The header meta GRID / TIER / RATE: lab and Method material. Keep the name and the flight time.
- "PITCH PLANE" in the page's one h1. Lead with Mert Tureli and CHARGER.
- The per-row SIM chips (23 in the stage text) and the SIM suffix on every 3D plate: SIM unless tagged, as FIELD section 7 says.
- The stage caption line "INFLOW 0.030 LU AT 0.0 DEG": lattice units mean nothing to a visitor. Move it to Method.
- The panel's LATTICE section (grid / steps per second / tier / precision) on the page. Show it under ?lab only.
- CN ALPHA, PITCH FREQUENCY, DAMPING RATIO, CP / LATTICE 2D and CM / LATTICE 2D in the default panel. Move them behind the INSTRUMENTS disclosure.
- The vorticity and speed views and the THROUGH / BETWEEN FINS section switch from the default panel. Keep smoke and pressure, and leave the rest under ?lab.
- The FLICK STEP ±57.3 DEG/S row and the FLICK − / + buttons from the default panel. Keep the drag hint and the arrows key.
- The keyboard-shortcut table in the lede on touch devices. It is also in the panel's KEYS block, so it is duplicated on desktop.
- The "0 FT AGL" ladder label, which duplicates the ALT plate on the pad.
- The 2 s of tail-first descent after apogee in the replay.
- Jargon in the og:description ("Barrowman rigid-body flight model and a lattice Boltzmann section"). When the link is shared, the preview should say what the page shows: why fins keep a rocket straight, flown again from the CAD.
