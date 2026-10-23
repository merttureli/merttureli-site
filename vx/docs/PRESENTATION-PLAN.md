# PRESENTATION-PLAN.md: the CHARGER field study for non-engineers

Synthesis of the five presentation reviews (first-timer, story, cinematic, brand, recruiter) in
`reports/present/`. Page: `/home/user/merttureli-site/vx/index.html`. Only `vx/` changes; nothing
outside it. Read-only so far: nothing in the repo was edited for this plan.

## The plan in one paragraph

The engineering is honest and complete. What fails is the first minute. The first screen is 112 visible
text nodes of 10 to 11 px mono, 19 of them carrying SIM, and no owner name. The obvious button (LAUNCH)
flies still air, so the angle of attack reads 0.00 for the whole flight. The replay then ends tail first
at -180.00 degrees under a warning caption. The one picture that explains fins, the finless rocket
turning over, sits 8,900 px down, after 7,000 px of method. Two defects make it worse: the PAGE-tagged
case-study facts are stale, and Run 03 shows ghost fins in the flow section. The plan fixes the two
defects first. Then it makes the first launch show the effect and end on the result. Then it gives the
stage a front door with his name, steps the instruments back, and puts the story before the appendix.
Narration, the forwardable figure, the end plate, the chart and the camera build on top of that.
Twelve items, ranked by impact per effort.

## What I checked on the real page (this synthesis)

Probes are in `synth-scripts/` and shots in `reports/present/synth/` (Playwright, SwiftShader, with
clarity.ms, bing.com, workers.dev and formspree.io blocked, no POSTs, 0 page errors).

- Cold first viewport, 1440x900, `?tier=1`: 112 visible text nodes, 19 with SIM, `MERT TURELI` absent
  (`cold-1440.log`, `d-cold.png`). The phone first screen is the same instrument (`p-cold.png`); the peek row
  reads `PHASE / TIME / AOA DEG / SM CAL`, and the open sheet is 2.6 screens of rows (`p-sheet-open.png`).
- Default LAUNCH: AOA 0.00 at T+0.45 and T+3.45. At T+8.45 it reads -180.00 at 1,032 ft (descent). At
  T+10.05 the caption reads `INFLOW HELD AT −35° EST / THE FLIGHT IS PAST IT`, with the chart cliff at
  apogee (`d-launch-a..d.png`).
- Run 03 started from its card: at T+1.21 the 3D model has no fins, but the slice holds two fin-shaped
  cut-outs with an orange rim (`run03-t1p15.png`, enlarged in `run03-tail-crop.png`). This reproduces the
  first-timer's finding.
- Page geometry at 1440: lede at 900 px, Method 3,644 px tall, Configuration 3,302 px, Runs starts at
  8,915 px of 10,336 (`sections.log`).
- Stale PAGE facts: `vx/index.html` lines 156, 157, 202, 204, 205 and 206, and `vx/js/geom/geom.js:61`,
  say three fins and 2.63 in. projects/charger.html now says four trapezoidal fins and 2.68 in. The
  37 in, 1.80 cal at 22 in and fin chord figures still match.
- Node, the page's own flight module (`story-probe/cf.mjs`), full fins, still air, 11.2 mph gust at rail
  exit: rail exit T+0.249, peak AOA 7.25 deg at T+0.436, back under 2 deg 0.72 s after the gust, apogee
  about 1,027 to 1,029 ft. The same with no fins: past 60 deg pitch at T+1.56, apogee 334 ft. All SIM.
  The page computes its own values; these numbers are only the expected range.
- The visual lens r2 label layout (labels above and below a pitched-over body, the pitch-aware camera
  fit, the N arrow's ink halo) has landed (modules.md fix:modules:r2). The camera work in item 12 no
  longer waits on it.

## Decisions where the lenses disagreed

- **Default launch: the gust, not the 5 mph crosswind.** LAUNCH flies full fins, still air, and the
  11.2 mph EST gust at rail exit (Run 05's conditions). Story and cinematic built their beat tables on
  it. In still air the AOA reads 0 on the rail, so the visitor sees one disturbance and one damped
  response. A crosswind starts the AOA at +36 to +90 deg while the rail still holds the rocket, which
  has to be explained before it helps. "Without fins" means the same gust with fin scale 0: it loops
  (334 ft SIM). Run 01 and Run 03 stay as they are, as cards.
- **Tags: every number keeps its own tag.** Several lenses proposed inheriting SIM from a section
  header. Rejected (see do-not list). SIM is set quieter instead (plain text at paper-a70, no box).
  PAGE, CAD, EST, FIT and STD keep the hairline box. Folding rows away does most of the work: the
  first screen drops from 19 SIM to about 5.
- **The rate stays visible, but leaves the header's engine fields.** GRID, TIER and ENGINE move to
  the panel's lattice line. The true playback rate travels with the time code (`T+00.436 / 1/20 AUTO`,
  `HOLD`), so slow motion is never hidden.
- **Stage plates: words, plus the one number the beat is about.** The plates read `CG / BALANCE
  POINT`, `CP / AIR'S PUSH` and `AIR`, plus the alpha value with its tag. Every other number lives in
  the panel. This merges brand ("the stage names, the panel measures") with story (plain plates).
- **One panel with disclosures, not a story mode and an instrument mode.** Two parallel label sets
  would double the copy that has to stay true.
- **Run cards get flight-path sketches (downrange against altitude), not AOA-against-time small
  multiples.** A non-engineer reads a path at once. The AOA story goes on the strip chart, with words
  at the beats (item 11).
- **The big-figures band folds into the lede figure.** It shows 1,027 FT against 334 FT in display
  type, with SIM tags. 4.15 cal is never shown beside 1.80 cal.
- **Lab leaves the header; it stays in the footer.**

## Ranked items

| # | Item | Area (owner) | Effort | Depends on |
|---|---|---|---|---|
| 1 | Fix what is wrong today: stale case-study facts, ghost fins | copy + geom data; page + lattice | S + S/M | none |
| 2 | First launch shows the point and ends on the result | page | S/M | 1b |
| 3 | Front door: title plate, his header, the exits | page + copy | M | 2 |
| 4 | Instruments step back | panel + scene + page | M | none (coordinate header with 3) |
| 5 | Below the stage: story first, appendix after | copy + page | M | 1a |
| 6 | Phone: the stage is the screen | panel + page | S | 2 (peek caption after 7) |
| 7 | Narrated replay: beats, speed ramp, plain captions | page (new story.js) + scene | M/L | 2 |
| 8 | Pressure view that reads, with a legend | page + panel + scene | S | 2 (better with 7) |
| 9 | With and without fins: the figure and the share preview | page | M | 1b, 2, 5 |
| 10 | End plate: the whole path, with the other fin choice as a ghost | scene + panel (fallback) + page | M | 2, 9 (7 for the pause hand-off) |
| 11 | The chart as the summary | panel + page | M | 2, 7, 10 |
| 12 | Director camera, flame on flight time, the slice dissolves | scene | M | 7, 10 |

---

### 1. Fix what is wrong today (S for 1a, S to M for 1b)

**1a. Stale case-study facts.** Area: copy, plus the geometry data.
- What: make every PAGE claim match projects/charger.html as it stands.
  - Four fins, maximum diameter 2.68 in.
  - Rename the row group "Case study figures" (drop "three-fin design review").
  - Row 206 note: "at a 22 in CG; the case study's figure, not this study's result".
  - Rewrite Method 05 around the differences that remain. Length: CAD 46.49 in against 37 in. Margin:
    4.15 cal SIM against 1.80 cal PAGE. Fin height: CAD span 2.17 in against 2.36 in. The length is
    an open owner question; do not resolve it.
  - Fix `PAGE_FIGURES` in `vx/js/geom/geom.js:60-61` (diameterIn 2.68, finCount 4), the geometry lab
    sentence (`vx/lab/geom.html:565`) and `vx/README.md:25`.
- Why: the page's one outbound project link shows the study misquoting the owner's own case study. A
  careful reader finds it within a minute. Today it breaks the honesty rule.
- Copy rule: the factual values ship as a correction under the honesty rule. The reworded Method 05
  sentences go to the owner for approval before the page goes public (CLAUDE.md rule 2).
- Risk: none to performance; it restores honesty.
- Verify:
  - A script pulls every PAGE-tagged value in `vx/index.html` and finds it in the visible text of
    projects/charger.html or index.html: 0 misses.
  - `grep -rniE 'three-fin|three fins|2\.63' vx` returns nothing.
  - Geometry lab screenshot. Harness CLEAN.

**1b. Ghost fins in Run 03.** Area: page (`vx/js/main.js` startRun, rebuildSection, scheduleSection),
plus the lattice (`vx/js/lattice/lattice.js` setSection and the view mask).
- What: `startRun` does reset, then set fins 0, then launch in one task. The section rebuild is
  deferred to a later animation frame and throttled to 250 ms. The engine keeps drawing the old solid.
  Rebuild and hand the finless section to the engine synchronously when the run starts, before
  launch, the way a `?fins=none` load does. Also check that the lattice reset on launch does not
  restore the previous mask.
- Why: the finless loop is the page's one universal image. Today its flow shows fins that are not
  there.
- Risk: none to honesty; it restores it. Performance: one extra section build per run start. The mask
  is cached per grid.
- Verify:
  - At `?tier=1`, click Run 03 at 6 s and at 15 s after load and step to T+1.2 s. The tail crop shows no
    cut-outs.
  - The engine's mask solid count equals the `?fins=none&wind=5&autolaunch=1` load's.
  - Repeat for Run 02 (half fins) and back to Run 01 (full).
  - Rerun `synth-scripts/run03.cjs` and compare with `run03-tail-crop.png`.

### 2. First launch shows the point and ends on the result (S to M)
Area: page (`vx/js/main.js`, the Configuration table in `vx/index.html`, `vx/css/field.css`).
- What:
  - LAUNCH, L and a bare `?autolaunch=1` fly the default config: full fins, still air, and the
    11.2 mph EST gust armed at rail exit. Today armedGust is 0 unless the URL sets it; make
    GUST_DEFAULT_MPH the initial value when no URL config is given. DISARM and the wind slider stay,
    so still air is one click away.
  - The page pauses playback at the apogee event. flight.js and its tests are unchanged: the flight
    still runs 2 s past apogee if resumed.
  - At the pause, a DOM end card shows two figures from the flight just flown, with tags: apogee in
    ft SIM, and the time back under 2 deg after the gust, in s SIM, using the run cards' definition
    (airspeed above 50 ft/s, from the gust time). It has four controls: REPLAY, WITHOUT FINS (same
    config, fins 0), THE CASE STUDY (`../projects/charger.html`) and a quiet CONTINUE PAST APOGEE.
  - Add a Configuration row: "Default launch: still air, gust 11.2 mph at rail exit EST".
- Why: the one button everyone presses then shows the nose tipped and turned back, and the last
  image is a result, not -180 deg.
- Risk: honesty is low. The gust is already an EST input; the badge, the Configuration row and the
  end card must all say EST. No performance cost.
- Verify:
  - `?autolaunch=1`: AOA is non-zero after rail exit (peak within 5 percent of 7.25 deg) and settles.
    The last frame is the end card, with T+ equal to the apogee event time.
  - No -180 readout and no chart cliff before CONTINUE is pressed.
  - The end card figures equal the Run 05 card's values.
  - `launch-video.cjs` PASS. Reduced motion: no autoplay, and the card still shows after stepping.
    `--no-gl`: the card sits over the 2D view.
  - `node vx/js/flight/flight.test.mjs`: 22/22.

### 3. Front door: title plate, his header, the exits (M)
Area: page and copy (`vx/index.html` stage, `.fd-head` and footer; `vx/css/field.css`; `vx/js/main.js`
show and hide, updateHeader).
- **Title plate, before the first launch.** Static HTML over the stage's lower left, visible with
  JS off:
  - The existing eyebrow: FIELD STUDY 01 / CHARGER / UNION COLLEGE ROCKET TEAM / 2026.
  - `WHAT THE FINS DO` at `--fs-display-1`. This becomes the page's one h1; the header line becomes a
    paragraph, and the lede heading moves to an h2 eyebrow.
  - One plain sentence, owner copy. Draft: "A gust tips the nose. The fins, behind the balance
    point, push it back. Watch it with fins, then without."
  - A mono byline with tag: MERT TURELI / CAPTAIN AND CHIEF ENGINEER / FIRST PLACE, BATTLE OF THE
    ROCKETS 2026 PAGE.
  - Two pills: WATCH WITH FINS (paper, primary: the default launch) and WITHOUT FINS.
  - The plate fades on launch, on a run button or on the first drag (480 ms, site easing; instant
    under reduced motion). It becomes the end card (item 2) at apogee.
- **Header.** Left: the MERT TURELI wordmark linking to `/`, then `/ CHARGER FIELD STUDY 01`. Right:
  the time code with the true rate, then CASE STUDY, RUNS, SITE. GRID, TIER and ENGINE move to the
  panel's lattice line; Lab goes to the footer only.
- **Exits.** Add a footer link row in the main site's wording: Resume (PDF)
  (`../assets/Mert-Tureli-Resume.pdf`), LinkedIn, Email (mailto), The CHARGER case study,
  merttureli.com, The labs. No "hire", "available" or "open to roles".
- **Title.** Drop "VX" from the `<title>` (owner copy).
- Why: in 3 seconds the visitor knows whose page it is, what question it answers and the one thing to
  do. It also brings back the 184 px against 10 px contrast the first screen lacks.
- Risk: honesty none. The byline and the award are PAGE facts, and the buttons fly existing SIM
  configs. Performance none.
- Verify:
  - Cold screenshots at 1440x900, 390x844 and 320 wide show the h1, the byline and both pills.
  - A first-viewport text dump (`recruiter-scripts/r1-desktop.cjs`) contains MERT TURELI, CAPTAIN AND
    CHIEF ENGINEER and FIRST PLACE within 3 s.
  - `brand-scripts/s10-audit.cjs` finds a Space Grotesk node of 64 px or more on the first screen.
  - a11y.cjs finds exactly one h1, both pills reachable with focus rings, and the skip links landing.
  - links.cjs passes with the new targets (the resume PDF exists).
  - JS-off screenshot shows the plate. Reduced motion and `--no-gl` show the plate over the 2D view.
  - The harness reports no overflow at 320, 390, 1040 and 1440.

### 4. Instruments step back (M)
Area: panel (`vx/js/panel/panel.js`, `controls.js`, `vx/css/panel.css`); scene (`vx/js/scene/markers.js`
label text, `scene.js` ladder label); page (`main.js` caption and hint).
- **Panel top level:**
  - Playback (LAUNCH, PAUSE, RESET, rate).
  - A RUNS row (01 FULL / 02 HALF / 03 NONE / 04 WIND / 05 GUST, calling startRun).
  - FINS: NONE / HALF / FULL.
  - Four readouts set large, each with a plain sub-label (owner copy): time code; altitude;
    angle of attack ("nose off the oncoming air"); static margin ("balance point to the air's push,
    in body widths").
  - The CP/CG bar, the clearest diagram on the page.
- **Folded below:**
  - ALL READOUTS: the other 15 rows, Events and the lattice line with grid, steps per second, tier,
    precision and the inflow in LU.
  - CONFIGURE: CG, rail, angle, wind, gust with FIRE and DISARM, flick step and the FLICK buttons.
  - VIEW: all four views, the section and the camera.
  - KEYS: hidden on `(pointer: coarse)`.
  - All are closed on first load. The open state is remembered per viewer in localStorage inside
    try/catch. `?lab` and `?hold` open ALL READOUTS.
- **Remove:** the panel title "CHARGER / PITCH PLANE", which repeats the header, and the duplicate
  tag legend at the panel foot (it stays in Method).
- **Tags:** every row keeps its tag. SIM is plain text at paper-a70; the other tags keep the box. The
  accessible name keeps the full tag.
- **Stage plates:** `CG / BALANCE POINT` and `CP / AIR'S PUSH` as words. `AIR` on the wind arrow, plus
  `ALPHA n.n° SIM` when |alpha| is 0.5 deg or more. N with its value only while |N| is above
  0.05 lbf.
  - The ALT cursor keeps its label; drop the duplicate `0 FT AGL` ladder label.
  - The caption's second line becomes "A FLAT 2D SLICE OF THE AIR / NOT TIME-ACCURATE" (owner copy);
    the LU inflow figures move to ALL READOUTS and Method.
  - The hint line shows only on the idle pad.
- Why: the first screen stops reading as an instrument dump while every source stays visible. Choosing
  what to show is the mastery signal a hiring manager reads.
- Risk: honesty none. Nothing is removed; every number keeps its tag. The keyboard trail and the 1 Hz
  live-region rule are unchanged.
- Verify:
  - The first-viewport dump shows 6 or fewer SIM, and every PAGE, CAD and EST value still carries its
    boxed tag.
  - At 1440x900 the collapsed rail's scrollHeight is under 900 px.
  - a11y.cjs: every control reachable with disclosures open and closed, names include the tags,
    live regions at 1000 ms or slower, 0 contrast failures.
  - Screenshots with the disclosures closed and open at both viewports.
  - `?hold=15&tier=1` opens ALL READOUTS.

### 5. Below the stage: story first, appendix after (M)
Area: copy and page (`vx/index.html` order, `.fd-index` and nav; `vx/css/field.css` details styling).
- What:
  - **Lede.** One first-person paragraph replaces the keyboard table, which stays in the panel's
    KEYS. Recruiter draft (owner copy; every fact is on projects/charger.html): "I founded the Union
    College Rocket Team and led it as captain and chief engineer. CHARGER, the team's 2026 rocket,
    dropped a sensor payload at apogee, streamed five channels of telemetry to a handheld ground
    station, and won the Deployable Sensor Payload event at Battle of the Rockets 2026. This page
    flies it again from the CAD, in slow motion, with and without its four fins."
  - Under the paragraph: the brief rows in the case study's mono spec style (Role, Team, Event,
    Result, PAGE), and a slot for item 9's figure. The existing technical sentence follows.
  - **Runs** come next. Intro: "Five runs, one change each." Each card leads with its plain "Watch..."
    sentence, with the numbers after it. Rewrite Run 02 plainly: too little fin at first, the burn
    moves the balance point forward, and by T+0.87 s SIM the fins win.
  - **Appendix: how it was computed.**
    - Open with three plain limits: a 2D slice, not 3D; slow motion, not a film of the flow; more than
      100 times below the real Reynolds number, so the lattice is a cross-check and the flight model
      flies the rocket.
    - Then Method, with Method 02's stabilizer paragraph, Method 03's long caveat and Method 07's test
      list in native details elements, first paragraph visible.
    - Then Configuration, with the Lattice group and the page-state rows (Live / pending, CAD
      measurement / baked copy) in details.
    - Then a short "Words used here" list: AOA, CG, CP, static margin and caliber (1 cal = 2.68 in
      CAD), normal force, rail exit, weathercocking, Barrowman, the lattice slice, the source tags.
      The story lens wrote the glossary text.
  - Delete nothing. Keep the #method, #configuration and #runs anchors. While these paragraphs are
    rewritten anyway, change "centre" to "center" (six times) and "regularised" to "regularized".
- Why: a layperson stops at Method's first paragraph, and the experiment they can follow sits at the
  bottom. Results before method is how a story and a recruiter's skim both read. The stated limits
  are the strongest mastery signal on the page, and they move from a 330-word block to three lines.
- Risk: honesty none if every caveat stays reachable. The ">100 times" follows from figures already on
  the page (about 3 x 10^5 real against 2,400 to 2,800 in the lattice). All new copy needs the owner
  (CLAUDE.md rules 2 and 3).
- Verify:
  - `python3 check-writing.py vx/index.html` is clean, and `grep -nE 'centre|calibre|colour|regularis'
    vx/index.html` returns nothing (the checker misses UK spelling).
  - Every fact in the paragraph is found in projects/charger.html.
  - At 1440, Runs start within one screen of the lede end. On the phone, Runs start before screen 6
    (today it is screen 17 of 21).
  - links.cjs passes, the skip links and #runs land, a11y.cjs heading order holds, and details open
    by keyboard.
  - JS-off screenshot reads the whole appendix. The data-k and data-r fills still populate.

### 6. Phone: the stage is the screen (S)
Area: panel (`panel.js` press('launch'), setSheet, the peek row; `panel.css`); page (`main.js` startRun
and the plate buttons; `field.css`).
- What:
  - Every launch path collapses the sheet before the flight starts: LAUNCH, L, peek play, run
    buttons and plate buttons. Focus goes to peek play.
  - The peek row reads PHASE / TIME / AOA / MARGIN (not SM CAL), with a WITH / WITHOUT fins toggle
    beside play. After item 7 it shows the beat caption while narrating.
  - The keys list is hidden on coarse pointers everywhere.
  - The gust badge moves off the rocket's tail and the T plate (item 7's slate replaces it later).
- Why: with the sheet open, a launch plays behind it, nose only. Collapsed, the tilted rocket fills the
  portrait stage: the best framing on the site.
- Risk: none.
- Verify:
  - At 390x844: open the sheet, press LAUNCH, and the stage is visible at T+0.3.
  - Tap the toggle and launch: the fins change in the 3D model and in the section (with 1b).
  - The a11y.cjs phone pass covers focus order. No overflow at 320.

### 7. Narrated replay: beats, speed ramp, plain captions (M to L)
Area: page (new `vx/js/story.js`; `main.js` playback.rate, updateCaption, startRun; `field.css`);
scene (`markers.js` setEmphasis).
- What:
  - **Beat table.** At every launch with the auto rate, a silent pre-flight of the same deterministic
    config (as flyRun does) yields the beat times: rail exit, gust, peak AOA, first zero crossing,
    first pitch extreme, settle (under 2 deg, the cards' definition), burnout and apogee. For finless
    runs, pitch past 60 deg replaces settle.
  - **Speed ramp.** The rate eases in log space:
    - 1/8 through the rail.
    - A slow rate from 0.05 s before rail exit, chosen so that rail exit to settle gets about 12 s of
      screen time, clamped to 1/32 to 1/8 (about 1/20 for the default launch).
    - One 1.5 s freeze labeled HOLD at the first pitch extreme.
    - 1/4 by settle, real time by about T+1.6.
    - The pause at apogee hands over to the end card (item 2).
    - A rate button or `?speed=` overrides it and stops the ramp, as today.
  - **Captions.** One plain line in the caption slot, changed only on state transitions, with numbers
    filled from live state or the pre-flight, each with its tag (owner copy):
    - ON THE RAIL
    - OFF THE RAIL AT n FT/S SIM
    - A GUST FROM THE SIDE, 11.2 MPH EST: THE AIR MEETS THE NOSE AT n° SIM
    - THE FINS, n IN BEHIND THE BALANCE POINT, PUSH IT BACK
    - EACH SWING SMALLER
    - STRAIGHT AGAIN, n S AFTER THE GUST SIM
    - COASTING UP
    - APOGEE
    - Finless: NOTHING PUSHES BACK: IT TURNS SIDEWAYS, then PAST 60° AT T+n S SIM.
  - Each caption needs its condition: |alpha| above 2 deg after rail exit; a restoring moment with
    |alpha| falling; |alpha| under 2 deg; the sign of the margin. Captions are never timed, so a
    still-air flight never claims a push.
  - **Slate.** For 1.2 s at launch, "FULL FINS / STILL AIR / GUST 11.2 MPH EST AT RAIL EXIT", then
    the conditions sit quietly under the time code. This replaces the GUST / DISARM pill during
    playback; DISARM lives in CONFIGURE.
  - **Plates step back.** While playing, the plates dim to about 35 percent except the beat's subject:
    ALPHA from rail exit to peak, N and CP through the push, ALT through the coast. Full strength on
    pause and at the end.
  - **Accessibility.** The caption is the polite live region while narrating, and the event
    announcements are muted then.
  - **Reduced motion.** No autoplay. NEXT BEAT and PREVIOUS BEAT step the flight to the precomputed
    beat times with playback.step.
  - **No WebGL.** Captions sit over the 2D view.
  - Rewrite Method 04's "1/8 until 3 s after burnout" sentence (owner copy).
- Why: the story plays in order, one idea per beat, at a speed the eye can follow. The wobble gets
  about 12.7 s of screen time instead of 5.8 s. The 26 s of identical slow-motion coast go, and the
  replay drops from about 40 s to about 26 s.
- Risk: honesty needs care. The shown rate must always be the true rate. The freeze reads HOLD; T+
  stays flight time and is never faster than real time. Performance: one silent flight per launch,
  already done for the cards.
- Verify:
  - `launch-video.cjs` at `?autolaunch=1`: log the rate against flight time. Segment screen times
    are within 10 percent of `cinematic/scripts/ramp.mjs`. The header rate equals playback.rate on
    every sampled frame, and a rate button stops the ramp.
  - Fly the five runs, the default and the finless default, and log the state at every caption
    change. Each caption appears only when its condition holds, and its numbers equal the panel's
    at that t.
  - a11y.cjs live-region interval is 1000 ms or more.
  - Reduced motion reaches every beat by keyboard. `--no-gl` shows the captions. Harness CLEAN.

### 8. Pressure view that reads, with a legend (S)
Area: page (`main.js` view switching, `updateCaption`; `field.css` legend); panel (`controls.js` AUTO
state; `panel.css` BOOST pill); scene (`scene.js` altitude cursor color).
- What:
  - Unless the visitor has picked a view, the view is AUTO: smoke on the pad, pressure from rail exit
    to settle (or to pitch past 60 deg), smoke after.
  - Each switch fades the slice opacity to 0 over 240 ms, changes the view, then fades back in over
    480 ms. The switch is instant under reduced motion.
  - While pressure shows, the caption slot carries two swatches: ORANGE / AIR PRESSING HARDER and
    GREY / PRESSING LESS, plus 2D SLICE. The smoke view gets WHITE LINES / SMOKE CARRIED BY THE AIR.
  - So that orange means push: the altitude cursor line, the BOOST pill and the HOLD badge border
    become paper.
- Why: in the default launch the orange side flips from left to right between T+0.436 and T+0.70: the
  restoring push changing sides. Pressure is the view that keeps up with a slowed replay; smoke lags.
  Today the orange slab has no key.
- Risk: honesty. The caption always names the view. The "pressure keeps up 6 to 19 times sooner"
  figure is an estimate; measure it before any of it goes into Method. Performance: none. At tier 0
  nothing changes.
- Verify:
  - At `?hold`, step the inflow angle from 0 to 7 deg and count the steps until the windward-minus-
    leeward pressure difference reaches 90 percent of its held value. Do the same for the dye angle.
    Report both.
  - Screenshots at T+0.436 and T+0.70 at both viewports show the flip and the legend.
  - `hold-pressure.cjs --query tier=1 --wait-steps 1500` PASS. a11y.cjs contrast on the legend.
  - If the field still floods orange at the gust's 7 deg, raise the pressure re-ramp (deferred list)
    with screenshots.

### 9. With and without fins: the figure and the share preview (M)
Area: page (`main.js` flyRun keeps a path decimated to 0.05 s; `vx/index.html` lede figure and run card
slots; head tags; `field.css`; a bake script under `vx/` for the static SVG).
- What:
  - **Lede figure.** Under the lede paragraph, the default pair on one set of axes (ft downrange, ft
    altitude, equal scale): full fins and no fins under the same gust. Each path ends in its apogee
    in display type with a SIM tag, about 1,027 FT against 334 FT on today's model. Caption: "THE SAME
    11.2 MPH GUST EST / BOTH FLOWN WITH THIS PAGE'S MODEL / SIM".
  - Bake the figure in node from `vx/js/flight/flight.js` as inline SVG, so it reads with JS off; the
    live flyRun result replaces it and must match.
  - **Run cards.** Each card gets a small path sketch on shared axes. Run 03 shows its own 342 ft
    loop; each card's caption names its own conditions.
  - **Share preview.** Capture a real frame of the page (the end plate or the title plate) as
    `vx/og-field.png`, 1200x630. Write a plain og:description (owner copy, recruiter draft).
- Why: a non-engineer gets the whole study from two lines in one second. It is the image a hiring
  manager forwards, and today the link previews the generic site cover with a jargon description.
- Risk: honesty. The paths are SIM flights of the page's model, never CHARGER's measured path, and
  the caption says so. The og image must be a real capture, not a mock-up. Performance: negligible
  (computed once in idle time).
- Verify:
  - A script compares the SVG apogees and the run 04 upwind distance with the run cards: 0
    mismatches.
  - Screenshots at both widths with JS on and off. The og:image meta check reads 1200x630.
  - links.cjs passes.

### 10. End plate: the whole path, with the other fin choice as a ghost (M)
Area: scene (`scene.js` setTrail and setGhostTrail, two THREE.Line objects of up to 4,096 points with
tick labels; `camera.js` a plate framing that fits a world box); panel (`fallback.js` the same plate in
2D); page (`main.js` the apogee hand-off and the ghost flight).
- What:
  - At the apogee pause the camera eases back over 2400 ms to a side view that fits the pad to apogee.
  - The flight's path comes from flight.history: 1 px at paper 45 percent during flight, 2 px on the
    plate.
  - Ticks mark RAIL EXIT, BURNOUT and APOGEE n FT SIM; the existing altitude ladder gives the scale.
  - The ghost is the same conditions with the other fin choice, flown silently in this tab. Finned
    paths are drawn in paper, finless ones in livery orange.
  - A 3 px livery marker shows the rocket. The item 2 end card sits on the plate.
  - Caption: "FULL FINS AND NO FINS / THE SAME GUST, 11.2 MPH EST / BOTH FLOWN IN THIS TAB / SIM",
    with the conditions per run.
  - The plate holds until the visitor acts.
- Why: it replaces the weakest last frame with the one picture that explains fins to anyone (see
  `cinematic/mock-end-plate.png`).
- Risk: honesty as in item 9. Performance: two polylines.
- Verify:
  - Screenshots at the pause for the default launch and runs 01, 03, 04 and 05, at 1440x900 and
    390x844. Each path's top equals its card's apogee; run 04's x at apogee equals 165 ft upwind.
  - Reduced motion: a cut to the plate, no move. `--no-gl`: the same plate in 2D. Harness CLEAN.

### 11. The chart as the summary (M)
Area: panel (`vx/js/panel/chart.js`); page (`main.js` settle time, shared with the cards).
- What:
  - The AOA trace stops at apogee, marked APOGEE / DESCENT NOT PLOTTED. This removes the -180 deg
    cliff even after CONTINUE.
  - The trace before rail exit is dim and dashed, with ON THE RAIL; the y-scale fits from rail exit.
  - Event ticks in words: GUST, PEAK n°, SETTLED n S, BURNOUT, APOGEE.
  - After WITHOUT FINS, the finned run's AOA stays as a labeled ghost trace, which clears on reset.
  - On the pad, the dock shows the default launch's precomputed trace, dimmed, instead of an empty
    grid.
- Why: the damped wiggle is the clearest picture of "the fins push it back" on the page, and today it
  has no words. On the pad the empty 152 px band is dead space.
- Risk: honesty. Descent is said to be unplotted (FIELD 3: recovery out of scope), and the settle
  definition equals the cards'. Performance none.
- Verify:
  - The PEAK and SETTLED ticks equal the Run 05 card (7.25 deg, 0.72 s).
  - The chart stays inside its scale for the whole default launch and after CONTINUE.
  - Labels are readable at 390 with no trace over the text. Cold screenshot shows the dimmed trace.

### 12. Director camera, flame on flight time, the slice dissolves (M)
Area: scene (new `vx/js/scene/director.js` or the same logic in main.js on flight:event; `camera.js`
setFraming({k, aimM}); `scene.js` setTimeScale; `exhaust.js`; `slice.js` uFade and uFrame; `markers.js`
AOA arc).
- What:
  - **Director.** It runs until the visitor touches the camera, like the auto rate:
    - Empty stage: a static low three-quarter hero (about 6 deg elevation, 24 deg azimuth, k 1.15).
    - Liftoff: the existing move to side.
    - Rail exit to settle: side, face-on, with a slow push-in from k 1.0 to 0.8, aimed 0.15 m aft
      toward the CP and the fins, held through the HOLD.
    - Burnout to apogee: ease out to k 1.6 at 8 deg elevation.
    - Apogee: the plate (item 10).
    - Replace the pad preset, a telephoto that looks like side.
  - **AOA arc.** At the gust beat, an arc between the body axis and the relative wind, with its value
    and tag, plus GUST 11.2 MPH EST on the wind arrow while the pulse acts.
  - **Flame on flight time.** The plume's sprite drift and jitter advance by dt times the playback
    rate.
  - **Slice dissolves.** While playing, widen the slice's long-edge fade (uFade.x 0.02 to about 0.10)
    and hide its hairline frame, keeping the corner ticks.
- Why: the camera tells the viewer where to look, in order, and the slow motion stops giving itself
  away (today the flame flickers at full speed on a crawling rocket). The box-and-barcode slice reads
  as a cage.
- Risk: honesty. No angle beat is ever shown from the quarter, chase or pad view. The faded band is
  the absorbing layer Method already calls numerical. Performance none.
- Verify:
  - Log scene.stats.camera at each flight event against the phase table. An orbit drag mid-flight
    stops the director.
  - Plume phase advance per wall second equals FLOW_HZ x COUNT x rate within 5 percent, at 1/8 and
    at 1.
  - At `?hold=15&view=pressure&tier=1`, the inner 80 percent of the slice is unchanged pixel for pixel.
  - Reduced motion: no moves, side throughout, a cut to the plate. Screenshots at T+0.70 at both
    viewports.

---

## Gates for every item

- `node --check` on every touched JS file, and `node vx/js/flight/flight.test.mjs` (22/22; the
  flight module is not changed by this plan).
- `node scratchpad/harness/check.cjs vx/index.html --out <dir> --steps 4 --viewports
  1440x900,390x844 --no-gl`, and again with `vx/index.html?tier=3`: CLEAN on every pass (main,
  reduced motion, no-GL). Look at the PNGs.
- In `harness/field`:
  - a11y.cjs at 1440x900 and `--viewport 390x844`
  - links.cjs
  - launch-video.cjs
  - `hold-pressure.cjs --query tier=1 --wait-steps 1500`
  - tier-sweep.cjs
- For copy: `python3 check-writing.py vx/index.html` plus the UK-spelling grep. New copy is first
  person where it speaks for him, past tense for what happened, US spelling, no em or en dashes, no
  emoji, no exclamation marks, never job hunting.
- `git diff --stat` lists only `vx/` paths. `python3 tools/check.py --fast` from the repo root is
  unchanged.
- Every Playwright context blocks clarity.ms, bing.com, workers.dev and formspree.io. No POSTs.

## Do not do

Rejected for honesty:
- Inheriting source tags from section headers, or dropping per-row SIM. The rule is that every number
  keeps its tag. The fix is a quieter SIM style plus folding rows away (item 4).
- Any freeze without a HOLD label, any slow rate the page does not show, or a coast faster than real
  time. T+ is always flight time.
- Captions scripted by time instead of conditioned on flight state. A still-air flight must never
  claim a push.
- Calling a SIM path "CHARGER's flight", or showing any path without "flown in this tab / SIM" and
  its conditions.
- Rescaling the normal-force arrow for drama behind an "arrows not to scale" note. The arrow stays
  one to one; the pressure view (item 8) and the AOA arc (item 12) carry the push.
- Showing any angle beat from the quarter, chase or pad camera. Angles read true only face-on to the
  pitch plane.
- Setting 4.15 cal beside 1.80 cal as a comparison, or printing 1.80 cal as the study's result.
- Putting the "pressure keeps up 6 to 19 times sooner" estimate in copy before it is measured.
- Deleting Method or Configuration text, or cutting the descent from flight.js. Fold into
  disclosures; the descent stays one CONTINUE away.
- A lede claim about who wrote the flight model and the lattice engine, until the owner words it
  (owner question 2).
- A mocked-up og image. It must be a real capture.

Rejected for performance:
- Autoplaying the launch on page load. The replay starts on a click, and an idle stage costs nothing.
- Blended grain or light overlays over the WebGL canvas at tiers 0 and 1 (see the deferred list).
- A second lattice instance or plane for the presentation.

Rejected for brand:
- Camera shake at ignition, lens flare, bloom, chromatic aberration, a countdown, a pad smoke cloud or
  any sound. Decorative, and in a replay that claims to be a measurement they read as fake.
- Relative-air streaks in this pass. In stills they read as rain (`cinematic/mock-streaks-t0p436.png`).
  Judge them only on a real GPU, later.
- A second accent color (instrument green or amber), display type inside the rail, grain over the
  panel or the reading sections, glassy or blurred panels.
- Two parallel label sets (a story mode and an instrument mode). One plain set with disclosures.
- Any public link to the validation bench pages before they wear the lab chrome.
- "Hire", "available", "open to roles" or any pitch next to the exits.

## Deferred, not rejected

- The site's radial light and grain on the stage (brand 5): measure the compositing cost at tier 3 and
  tier 1 first.
- A pressure ramp with orange held for the strongest positive pressure (brand 6). This is lattice
  `shaders.js` work, and it changes the legend; take it up if item 8's screenshots still flood at 7 deg.
- One lab chrome for vx/lab (brand 10).
- dfn popovers on panel row names. The sub-labels (item 4) and the glossary (item 5) come first.

## Owner questions (before anything goes public)

1. Approve the new copy:
   - the title plate sentence and the byline (item 3)
   - the lede paragraph and the brief rows (item 5)
   - the panel sub-labels and the caption line (item 4)
   - the beat captions and the slate (item 7)
   - the three plain limits and the glossary (item 5)
   - the Run 02 rewrite and Method 04 and 05 (items 5, 7, 1a)
   - the og:description and the title without "VX" (items 9, 3)
   - the US-spelling fixes in existing paragraphs (item 5)

   CLAUDE.md rules 2 and 3 apply.
2. Authorship: one footer sentence in his words saying what he built, directed and checked on this
   page. A recruiter will assume he wrote the flight model and the GPU lattice engine.
3. Which length is current: 37 in (case study) or 46.49 in (CAD)? Method 05 states both until he
   answers.
4. Type: the live site moved to Archivo and Martian Mono (commit 92af1f3); vx is in Space Grotesk and
   IBM Plex Mono as BRIEF.md requires. Follow the site or not? Following it means lifting FIELD.md's
   "do not edit tokens.css".
5. The exits row (Resume, LinkedIn, Email) on a noindex experimental page: confirm.
