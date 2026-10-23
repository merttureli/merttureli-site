# Story lens: the CHARGER field study as a told story

Reviewer: a science communicator. Page: /home/user/merttureli-site/vx/index.html, served from the repo root and opened in Playwright (SwiftShader, ?tier=1 pinned where the lattice matters). Read-only; nothing in the repo was changed.
Screenshots: /tmp/claude-0/-home-user-merttureli-site/89c47636-e713-59a0-ab78-6864669d7dfa/scratchpad/reports/present/story/ (file names below). Probe scripts: /tmp/claude-0/-home-user-merttureli-site/89c47636-e713-59a0-ab78-6864669d7dfa/scratchpad/story-probe/.

## Verdict

The story the page means to tell is clear in its own words. The best sentence is the lede's last one: "A gust or a crosswind tips the nose; the fins, aft of the centre of gravity, push it back." The page itself does not tell that story. The model, the chart and the runs contain every beat, but you get them only if you already know where to look. The beats are all there; what is missing is a narrator.

1. **The default path tells the wrong story.** LAUNCH, the L key and `?autolaunch=1` fly in still air with no gust. The angle of attack reads 0.00 from pad to apogee, and the chart is a flat line on a ±2° scale (02-default-launch-5s, -20s). Then, 2 s after apogee, the descent flips it tail-first: the readout says −180.00°, the chart line drops off the bottom, and the caption turns to the warning colour, "INFLOW HELD AT −35° EST / THE FLIGHT IS PAST IT" (03-autolaunch-speed1-16s). So a newcomer's first launch has nothing happening and then ends on what looks like an alarm. The physics is right, but the story is wrong.
2. **The story lives below the fold, behind 7,000 px of method.** The order is stage, lede, Method (1,580 words, 3,644 px), Configuration (3,323 px), then Runs (1,234 px). The two runs that carry the story are 05 (gust at rail exit: one damped wobble) and 03 (no fins: the loop). They are the last thing on the page.
3. **Every beat shows every idea.** The first frame has about 30 numbers: five header fields (GRID 512×160, TIER T1 PINNED, RATE 1/8 AUTO), sixteen panel readouts, five scene plates (CP 33.1 IN SIM / MARGIN +4.15 CAL SIM / N 0.00 LBF SIM...) and two caption lines ("2D SECTION / INFLOW 0.030 LU AT 0.0° SIM / NOT TIME-ACCURATE"). No plain sentence appears on the first screen. The h1 is the 12 px strip "CHARGER / FIELD STUDY 01 / PITCH PLANE" (01-cold-10000ms-1440).
4. **The key moment is too small to see.** In the gust run at peak angle (T+0.40, α +6.8°; 04-gust-run-08s), the rocket is still nearly upright. The gust itself is never drawn. The smoke barely bends at 7°, and the normal-force arrow that "pushes it back" is about 12 px long (0.42 lbf at 30 mm/N). The chart under the stage tells the story best: rail exit, a 7° spike, a damped wiggle, flat (09-panel-end-1440). But nothing labels its beats in words.
5. **What already works.**
   - The no-fins run is the one frame anyone would screenshot (07-run-nofins-20s, -40s). The rocket is pitched over, the smoke wraps the body, a long orange force arrow points at the nose, and the CP sits ahead of the CG.
   - The small CP/CG bar at the foot of the panel is the clearest diagram on the page: a rocket outline, the balance point, the pressure point and "+4.15 CAL" between them.
   - The 2D fallback view (31-nogl-6s-1440) is more legible than the 3D one for this story. The force arrow is large, and the labels are sparse.
   - The flight model is deterministic. The page already flies each run silently in idle time (flyRun). So every beat time can be known before the replay starts, and captions never have to guess or lag.

Things only SwiftShader showed, not judged as design: the cost guard's "FLOW PAUSED / Resume flow" badge, the slow lattice development, and smoke that stays nearly straight at the 15° hold (06-hold15-smoke-30s). The pressure view at the hold does read as "the air presses harder on this side" (05-hold15-pressure-30s), but nothing on the stage says that orange means higher pressure. The orange also blends into the orange airframe.

## The story, as it should be told

There is one idea per beat. Captions are plain words, at most about 18 per beat, sentence case, with the source tag as a small mono chip after each number. There are no rhetorical questions and no exclamation marks. Every number comes from the live flight or from the deterministic pre-flight of the same config, with its tag.

The beat times are from node, running vx/js/flight/flight.js with full fins, still air and the run-05 gust (5 m/s at rail exit). Script: story-probe/cf.mjs.

| Beat | Trigger (from the silent pre-flight) | Rate and hold | Camera | Caption (plain) | Panel in story mode |
|---|---|---|---|---|---|
| 0 Pad | page ready | idle | pad preset, static | CHARGER on its launch rail, the rocket my team flew to first place in 2026 PAGE. Press launch to see it fly again, slowed down. | Only LAUNCH; title card over the stage (proposal 2) |
| 1 Ignition | ignition | 1/8 | side | Ignition. The motor pushes 20.4 lbf SIM; for its first 72 in EST the rail keeps the rocket straight. | Thrust, airspeed |
| 2 Rail exit | railExit, T+0.249 | hold 2 s, then 1/32 | side, tighter (angles only read true face-on to the pitch plane) | Off the rail at 46.6 ft/s SIM. From here only the fins keep it pointed. | Rail exit speed |
| 3 Gust | gust fired at railExit, to maxAlpha T+0.436 | 1/32; freeze 2.5 s at maxAlpha | side | A gust of 11.2 mph EST from the side. The air now meets the rocket at an angle: 7.25° SIM. | AOA row highlighted, gust peak; the angle drawn on the stage |
| 4 Fins push back | maxAlpha to the first zero crossing, T+0.579 | 1/32 | side | The fins sit 11.1 in SIM behind the balance point. The air pushes on them and turns the nose back into the wind, like a weathervane. | CP/CG bar promoted, margin, normal force; pressure view at tier 2 and up, with a legend |
| 5 Wobble | first zero to settle | 1/8 | side | It swings past straight and back. Each swing is smaller than the last. | AOA and chart |
| 6 Settled | last time above 2°, T+0.968 | hold 2 s | side, easing out | Settled: under 2° within 0.72 s of the gust SIM. | Settle time, ticked on the chart |
| 7 Coast | burnout, T+1.277 | 1/2, then 1 | quarter, wide | Burnout at 1.28 s SIM. It coasts up, pointed into the air. | Altitude |
| 8 Apogee (end card) | apogee | stop at apogee, not 2 s after | side, wide, altitude ladder | Apogee 1,027 ft SIM. The fins turned a gust into one damped wobble. Next: the same gust without fins. | The annotated chart as the end card; buttons "Without fins", "Replay", "Open the instruments" |

The counterfactual is the same config with fin scale 0. The node values below are SIM, and the page must compute its own.

| Beat | Trigger | Caption |
|---|---|---|
| N0 Pad | ready | The same rocket, fins removed. The point where the air pushes is now ahead of the balance point, by 17.7 in SIM. |
| N1 Gust | railExit | The same 11.2 mph EST gust. |
| N2 No push back | α keeps rising past the finned run's peak | Nothing turns it back. The air's push is ahead of the balance point, so it tips the nose further over. |
| N3 Over | pitch past 60°, T+1.56 | Past 60° at T+1.56 s SIM. It loops instead of climbing. |
| N4 End card | apogee, T+2.93 | Apogee 334 ft SIM, about a third of the finned flight. Two traces, one chart. |

The chart in N4 overlays the finned run's α as a ghost trace, with both traces labelled.

Caption numbers in the tables are examples taken from screenshots and node; on the page each one fills live (thrust, distances, speeds) or from the pre-flight (peak, settle, apogee).

Timing: about 30 s for the finned story (pad 2 s, rail hold 2 s, beats 3 and 4 at 1/32 for about 10.6 s, the freeze 2.5 s, beat 5 at 1/8 for 3.1 s, the settle hold 2 s, the coast about 7 s) and about 23 s for the finless one at 1/8. The header RATE shows the real rate throughout (1/32 STORY), so the slow motion is never hidden.

Reduced motion: the same beats become a stepper. NEXT BEAT runs playback.step to the beat's time; the scene stays still, and the caption changes. This works because the beat times are precomputed. No WebGL: the same captions sit over the 2D view, which already draws the CG, CP, wind and force arrows clearly. Screen readers: the caption is the polite live region in story mode, so beats are several seconds apart, and the event announcements are muted there to avoid double speech.

## Plain-language layer (honest wording)

This text works as tooltips on the panel row names (a `dfn` with a popover, tap on the phone), as words on the scene plates in story mode, and as a short "Words used here" list in the appendix.

- **Angle of attack (AOA, α)**: the angle between where the nose points and where the air comes from. At 0° the rocket flies straight into the air.
- **Centre of gravity (CG)**: the balance point. CHARGER balances 22 in from the nose at liftoff (PAGE). The point moves forward as the motor burns (SIM).
- **Centre of pressure (CP)**: where the air's sideways push on the whole rocket adds up. Fins far back pull it toward the tail.
- **Static margin, calibres**: how far the CP sits behind the CG, counted in body diameters (1 cal = 2.68 in here, CAD). A positive margin means the air turns the nose back; a negative one means it tips it further over.
- **Normal force**: the sideways push of the air on the rocket.
- **Restoring moment**: the twist that push puts on the rocket about its balance point.
- **Pitch, pitch rate**: where the nose points, in degrees from straight up, and how fast that is changing.
- **Dynamic pressure**: how hard the oncoming air presses. It grows with the square of the speed.
- **Rail exit**: the moment the rocket leaves the guide rail. Before it the rail steers; after it the fins do.
- **Weathercocking**: a finned rocket turns into a crosswind, like a weathervane, and climbs upwind.
- **Pitch frequency, damping ratio**: how fast the rocket would wobble, and how quickly the wobble dies away.
- **Barrowman's method**: the standard hand calculation of a model rocket's CP and stability (Barrowman 1967).
- **Lattice Boltzmann section**: airflow computed on a grid of cells, each holding how much air moves in each of nine directions. Here it is a flat 2D slice through the rocket, shown for the picture and as a cross-check, not used to fly it. A flat slice exaggerates some forces (Method 03).
- **Source tags**: PAGE published on merttureli.com; CAD measured from the 3D model; EST chosen here; FIT tuned to match a published number; SIM worked out live in your browser; STD a textbook value.

Scene plates in story mode:
- BALANCE POINT (CG) 22.0 IN
- AIR'S PUSH (CP) 33.1 IN
- 11.1 IN APART / 4.15 CAL
- AIR ARRIVES FROM HERE / 148 FT/S
- ANGLE 7.2°

Instrument mode keeps today's labels unchanged.

Proposed lede, in his voice, every fact from the site:

> CHARGER won the Deployable Sensor Payload event at Battle of the Rockets 2026 (PAGE). I was captain and chief engineer of the team that built it (PAGE). This page flies it again, slowed down, to show one thing: why it flies straight. When a gust tips the nose, the air pushes on the fins, which sit behind the balance point, and that push turns the nose back. Without fins the same push turns it over.
> Under it: a Barrowman flight model and a lattice Boltzmann slice of the air, every number tagged with its source.

## Proposals, ranked by impact per effort

1. **Narrated replay as the default launch (L).** LAUNCH, L, the title-card button and `?autolaunch=1` with no other config fly the run-05 conditions: still air and an 11.2 mph EST gust at rail exit. The flight carries the beat track above. The beat times come from a silent pre-flight of the same deterministic config (flyRun already does this). The story mode adds holds and a 1/32 window from rail exit to settle, and it stops at apogee with the end card. Free flight, the panel sliders and any URL config still behave as today.
   - Where: vx/js/main.js (story controller: beats from the pre-flight, rate and hold schedule, end card), a new helper vx/js/story.js, a caption element in the stage in vx/index.html, vx/css/field.css. Quick win first: arm the gust on the first launch and stop the default replay at apogee. That is a few lines in main.js.
   - Honesty: every caption number fills from flight state or the pre-flight, with a tag. The gust is labelled EST. The descent stays in instrument mode.
   - Performance: negligible.
   - Verify: Playwright at 1440 and 390 with ?autolaunch=1. Screenshot each beat. Assert that each caption's numbers equal the panel's at that t. Check that the end card appears at the apogee event and that the header RATE always matches the real rate. Run under reduced motion (stepper) and --no-gl (captions over the 2D view). The harness must report CLEAN.
2. **A title card on the empty pad, and the plain lede (S).** Before the first launch, the stage shows "WHAT THE FINS DO" at display size over the dark pad, with one plain sentence, a WATCH THE REPLAY button (it starts proposal 1) and an "Open the instruments" link. It fades on launch and returns after the end card. The h1 becomes "What the fins do", with CHARGER / FIELD STUDY 01 as the eyebrow. Swap in the lede above.
   - Where: vx/index.html (stage, h1, lede), field.css, main.js.
   - Honesty and performance: no risk.
   - Verify: cold screenshots at 1440 and 390 show one sentence and one button in the first frame. There is still exactly one h1. Check the skip links. Check reduced motion (static) and no-GL (over the 2D view).
3. **Instruments step back until asked (M).** Add a story mode, the default on a cold visit.
   - The panel folds to phase, time, AOA and margin, plus the one row the current beat needs, highlighted. The rest goes under ALL READOUTS.
   - The header strip hides GRID, TIER and RATE apart from the 1/32 STORY rate tag.
   - The flow caption reads in words: "FLAT SLICE OF THE AIR / 2D / NOT TO TIME", with lattice units only in instrument mode.
   - The scene hint shows only on the idle pad and after the end card.
   - INSTRUMENTS is one toggle in the header, remembered per viewer in localStorage behind try/catch. ?lab, ?hold, any URL config and the Runs buttons start in instrument mode.
   - Where: vx/js/panel/panel.js and panel.css (data-mode, row priority), main.js (header, caption), field.css.
   - Honesty: no number removed, only folded.
   - Verify: both modes at both viewports, keyboard reachability of every control in both, ?hold=15 opening in instrument mode, and the harness CLEAN.
4. **Plain-language layer (M).** Use the glossary above as row-name popovers and as story-mode scene plates in words ("BALANCE POINT (CG)", "AIR'S PUSH (CP)"), and add a "Words used here" list in the appendix. Run cards lead with the takeaway in plain words, and their stat labels are plain: "SETTLED UNDER 2° / 0.72 S".
   - Where: vx/js/scene/markers.js (label sets by mode), panel.js (dfn and popover), vx/index.html (glossary, cards), copy.
   - Honesty: every gloss is textbook-standard. Calibre is defined with its CAD diameter.
   - Verify: no word from the banned list, no emoji, no exclamation marks (grep). Plates fit beside the body at 390. Popovers open by keyboard and by tap.
5. **The chart as the story's summary (M).**
   - Event ticks in words at the beats: GUST, PEAK 7.25°, PUSHED BACK, SETTLED 0.72 S, BURNOUT, APOGEE.
   - The α trace runs dim and dashed before rail exit, with the note "ON THE RAIL". Today the 5 mph crosswind runs start the chart at +36° to +90° and the plate reads ALPHA +23.9° while the rail holds the rocket (17-run-full-01s).
   - The y-scale fits from rail exit.
   - At the end card the chart enlarges as the takeaway.
   - Where: vx/js/panel/chart.js; settle time computed live in main.js with the run cards' definition.
   - Honesty: the pre-rail values stay in the instrument readout.
   - Verify: settle and peak ticks equal the run-05 card values, and the y-range fits the trace after rail exit.
6. **Story-first page order (M).**
   - Runs move directly under the lede, retitled "Five flights", in story order: gust, no fins, half fins, crosswind, breeze. Each card puts its plain takeaway first and its numbers second.
   - Method and Configuration become an appendix, "How it was computed".
   - Method 03 gets a two-sentence plain summary, with the full 400 words in a disclosure. Method 07 and the Configuration table are disclosed under their headings.
   - No text is deleted, and the #method, #configuration and #runs anchors are kept.
   - Where: vx/index.html, field.css, copy.
   - Verify: Runs start within one screen of the lede at 1440. The JS-off render is complete. The anchors and skip links still land. The harness is CLEAN.
7. **The counterfactual in one picture (M).** The end card's "Without fins" replays the same gust with fin scale 0 (node: peak 28.8°, past 60° at T+1.56 s, apogee 334 ft, all SIM). The chart keeps the finned run's α as a labelled ghost trace.
   - Where: main.js (a second run config), chart.js (ghost series).
   - Honesty: both traces are SIM, from the same config apart from the fins, and both are labelled. Run 03 (5 mph breeze) stays as is.
   - Verify: the page's numbers equal a node run of the same config, the ghost clears on reset, and both traces are legible at 390.
8. **Make the invisible forces visible at beats 3 and 4 (M).**
   - Draw the gust as a side wind sweep labelled "GUST 11.2 MPH EST" while the pulse acts.
   - Draw the angle of attack as an arc between the body axis and the relative wind, with its value.
   - In story mode, give the normal-force arrow a legible display scale, with "N 0.42 LBF" on the arrow and "arrows not to scale" in the caption.
   - Promote the panel's CP/CG bar onto the stage during beat 4.
   - At tier 2 and up, crossfade to the pressure view with the legend "ORANGE: AIR PRESSING HARDER" and a "2D SLICE" tag.
   - Where: vx/js/scene/markers.js, scene.js, main.js.
   - Risk: the arrow scale is a display choice, so it must be stated. The pressure field may not develop within a 2–3 s beat. Check on a real GPU, and fall back to smoke if it has not.
   - Verify: screenshots at maxAlpha at 1440 and 390, the arrow length monotonic in N, and the legend present whenever the pressure view shows.
9. **The phone tells the story in the sheet's peek row (S, after 1).** In story mode, the collapsed row shows the beat caption with play and next, instead of "PHASE / TIME / AOA DEG / SM CAL". Hide the lede's keyboard shortcut list on coarse pointers (15-phone-lede). Move the armed-gust badge off the rocket's tail (13-phone-gust-8s).
   - Where: panel.js and panel.css (peek), field.css.
   - Verify: 390 × 844 with the sheet open and closed through the whole narrated run, and the caption never covering the rocket.
10. **Reduced motion and no-WebGL get the same story (S, after 1).** Beats as a stepper (NEXT BEAT and PREVIOUS BEAT jump to the precomputed times), and the captions and end card over the 2D fallback.
    - Where: main.js, field.css.
    - Verify: the reduced-motion and --no-gl passes reach every beat by keyboard, with no autoplay.

## Cut or hide

- The default still-air launch as the first thing a visitor sees. Keep it as free flight, not as the story.
- The descent after apogee in the narrated replay; it ends at apogee. The −180° flip stays in instrument mode.
- The keyboard shortcut list in the lede. On touch it is useless, and on desktop it repeats the panel's KEYS block.
- GRID, TIER and the TIER PINNED wording in the header strip in story mode.
- "LU", "INFLOW 0.030 LU AT 0.0°" and "NOT TIME-ACCURATE" in the stage caption in story mode. Replace them with "FLAT SLICE OF THE AIR / NOT TO TIME".
- The always-on hint line during a replay.
- Pitch frequency, damping ratio, CN alpha, dynamic pressure, CP lattice 2D and CM lattice 2D from the story-mode panel. Fold them under ALL READOUTS.
- The FLICK STEP and FLICK +/− buttons, the THROUGH/BETWEEN FINS section and the VORTICITY and SPEED views from story mode.
- The duplicate source-tag legend at the foot of the panel in story mode.
- "CHARGER / PITCH PLANE", the panel title that repeats the header.
- Method 03's 400 words, Method 07's test list and the Configuration table from the main read. Put them under disclosures; delete nothing.
- The run 02 watch text in its current form. Rewrite it plainly: too little fin, small wobbles grow at first, the motor's burn moves the balance point forward, and by T+0.87 s SIM the fins win.

## Screenshots referred to

- 01-cold-10000ms-1440.png: the first frame
- 02-default-launch-5s and -20s-1440.png: the still-air launch with a flat AOA
- 03-autolaunch-speed1-16s.png: the −180° warning ending
- 04-gust-run-08s, -10s and -21s.png: the gust beats as they are today
- 05-hold15-pressure-30s.png and 06-hold15-smoke-30s.png
- 07-run-nofins-20s and -40s.png: the screenshot frame
- 09-panel-end-1440.png: the damped wobble on the chart
- 10-phone-cold.png, 11-phone-sheet-open.png, 13-phone-gust-8s.png, 15-phone-lede.png
- phone-strip-a.png and phone-strip-b.png
- 17-run-full-01s.png: the pad AOA of +36°
- 20-lede-1440.png, 21-method-1440.png
- 30-reduced-6s-1440.png, 31-nogl-6s-1440.png
