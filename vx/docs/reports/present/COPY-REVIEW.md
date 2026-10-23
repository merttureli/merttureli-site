# COPY-REVIEW.md: new or rewritten owner-facing copy in the presentation work

Every sentence or label below is new or reworded on the vx field study and needs the owner's
approval before the page goes public (CLAUDE.md rules 2 and 3). Each entry names its file and
where it shows. Areas append their own sections.

## Wave 1, panel (item 4): vx/js/panel/panel.js, vx/js/panel/controls.js

Where: the flight panel (desktop right rail; phone bottom sheet). All visible panel text is mono
caps unless noted.

Large readouts (top level of the panel, panel.js `BIG` and the time row):
- Label `TIME` (was `FLIGHT TIME / SIM` under the old 36 px time code). Sub-label, sentence case
  in the body face: "Seconds since ignition".
- `ALTITUDE`, sub-label: "Height above the pad".
- `ANGLE OF ATTACK`, sub-label: "Nose off the oncoming air" (the plan's draft).
- `STATIC MARGIN`, sub-label: "Balance point to the air's push, in body widths" (the plan's
  draft).
- Each keeps its unit and its SIM tag; the time row keeps `SLOW MOTION 1/8` or `REAL TIME`.

CP/CG bar key (under the bar, panel.js `barLegend`):
- `CG / BALANCE POINT`, `CP / AIR'S PUSH` (the same words the plan gives the stage plates, so
  the page keeps one label set), and `CP / LATTICE 2D` (an existing readout label, shown only
  while the bar draws the lattice ring).

Headings and fold summaries (controls.js, panel.js `FOLDS`):
- `RUNS`, `FINS`, `ALL READOUTS`, `CONFIGURE`, `VIEW`, `KEYS`.
- The fin preset group's accessible name is now "Fins" (was "Fin presets").
- A visually hidden heading "Readouts" over the four large readouts, and a hidden word "phase"
  before the phase chip, for screen readers.

RUNS row (controls.js `RUNS`):
- Visible: `01 FULL`, `02 HALF`, `03 NONE`, `04 WIND`, `05 GUST` (the plan's labels).
- Accessible names (no numbers, so no source tags; the run cards keep the conditions):
  - "01 FULL, launch run 01: full fins in a crosswind"
  - "02 HALF, launch run 02: half fins in a crosswind"
  - "03 NONE, launch run 03: no fins in a crosswind"
  - "04 WIND, launch run 04: full fins in a stronger crosswind"
  - "05 GUST, launch run 05: full fins, still air, a gust at rail exit"

CONFIGURE fold (controls.js):
- Row `ARMED AT RAIL EXIT` with the armed gust in mph (EST tag when it is the 11.2 mph default)
  or `NONE`.
- Button `DISARM`, accessible name "Disarm, the gust armed for rail exit".
- Live-region announcement after DISARM: "Gust disarmed."
- Note `NEEDS THE PAGE` under RUNS or DISARM when the page gives the panel no way to start a
  run or to read the armed gust (same pattern as the existing `NEEDS THE FLIGHT MODEL`).

ALL READOUTS, lattice group (panel.js `writeLatticeLine`):
- Row `ENGINE` reading `BARROWMAN 3-DOF / LBM D2Q9` (also `LBM PENDING`, `LBM PAUSED`,
  `LBM OFF`, `LBM NOT ATTACHED`). The wording is the header strip's ENGINE field, moved here
  (decision: GRID, TIER and ENGINE leave the header).
- Rows `INFLOW` (LU, SIM) and `INFLOW ANGLE` (DEG, SIM; EST while held at the 35 degree limit),
  moved from the stage caption (item 4).
- Note while held: `INFLOW HELD AT -35° EST / THE FLIGHT IS PAST IT` (the caption's existing
  wording, with the true sign).

Removed (nothing reworded): the panel title `CHARGER / PITCH PLANE` and the tag legend at the
panel foot (the Method section keeps the legend).

## Wave 1, page (items 1a, 2 and 5): vx/index.html, vx/js/main.js, vx/js/story.js, vx/lab/geom.html, vx/README.md

Where: vx/index.html unless noted. Old wording is quoted where a sentence was replaced or cut,
so it can be restored. Facts in the new copy come from projects/charger.html (PAGE) or the page's
own model (SIM); every number keeps its tag.

### Item 1a, corrected case-study facts (values ship under the honesty rule; wording needs approval)

- Configuration, row group: "Case study figures" (was "Case study figures, three-fin design review").
- Configuration, Maximum diameter: 2.68 in PAGE (was 2.63 in). Fins: 4 PAGE (was 3).
- Configuration, Stability margin note: "at a 22 in CG; the case study's figure, not this study's
  result" (was "...; the three-fin figure, not this study's result").
- Method 05, "The rocket here and in the case study", rewritten. New text:
  - "The case study and the CAD assembly agree on four trapezoidal fins, a body 2.68 in across,
    the fin root chord (2.76 in) and sweep (2.17 in), and the CG 22 in from the nose PAGE; the CAD
    measures the body at 2.677 in, the root chord at 2.76 in and the sweep at 2.17 in CAD. Shape
    and dimensions here come from the CAD, the mass from the page (2.2 lb) PAGE, and the CG
    defaults to the page's 22 in from the nose PAGE. Three differences remain."
  - List item "Length. The CAD assembly is 46.49 in from nose tip to screw cap CAD; the case study
    gives 37 in PAGE." followed by the flag text (owner question, `vx-length`): "Which one is
    current is an open question; until it is settled, this page states both and takes the shape
    from the CAD."
  - List item "Stability margin. Recomputed for the CAD airframe at the page CG, the margin is
    4.15 cal SIM. The case study gives 1.80 cal at the same CG for its 37 in airframe PAGE; that is
    the case study's figure, not a result of this study."
  - List item "Fin height. The CAD fin span is 2.17 in CAD, against the case study's 2.36 in
    height PAGE."
  - Cut from the old Method 05: "The case study describes a 37 in design with three fins and a
    stability margin of 1.80 cal at a 22 in CG PAGE. Four fins is the final configuration." and
    "The 1.80 cal is the design-review figure for the three-fin design, not a result of this
    study." (their facts are in the new list, corrected).
- vx/lab/geom.html notes: "...against the page's 37 in PAGE (which length is current is an open
  question for the owner); its body diameter is ... against 2.68 in PAGE" (was "...37 in PAGE for
  the three-fin design review; ... against 2.63 in"). Fin count row note: "match" (was "four is
  final").
- vx/README.md, the CAD paragraph, rewritten to the same three differences.

### Item 2, the default launch and the end card

- Configuration, Launch and air, new row: "Default launch / gust 11.2 mph / EST / still air and
  full fins, the gust fired at rail exit, as in run 05; the replay pauses at apogee".
- Stage badge (main.js updateCaption): "GUST 11.2 MPH EST AT RAIL EXIT" (was "GUST 11.2 MPH AT
  RAIL EXIT"; the EST tag added). It now shows on a cold load, since the default launch arms it.
- End card at apogee (stage, bottom left; vx/index.html `[data-end]`, text set by story.js and
  main.js; shown in mono caps):
  - Eyebrow: "Paused at apogee / <conditions>". Conditions (main.js conditionsText), joined by
    " / ": "Full fins", "Half fins", "No fins" or "Fin scale 0.75"; "still air" or "wind 5.0 mph
    EST"; "gust 11.2 mph EST at rail exit"; for a visitor's own gust "gust 11.0 mph EST at T+1.20
    s"; "flick at T+0.80 s"; and only when changed from the defaults "CG 24.0 in", "rail 60 in",
    "launch angle +5.0°".
  - Figure labels: "Apogee" (ft, SIM), then the run cards' own labels: "Under 2° AOA, after the
    gust", "Under 2° AOA, after rail exit", or, for an unstable rocket that turned over, "Pitch
    past 60°" (T+ s, SIM).
  - Controls: "Replay", "Without fins" (after a finless flight: "With fins"), "The case study"
    (link to ../projects/charger.html), "Continue past apogee".
  - Group name for screen readers: "Paused at apogee".
  - Polite status line, 1.2 s after the card shows (screen readers only): "Paused at apogee, 1027
    feet. Replay, without fins, the case study and continue past apogee are on the stage." (with
    "with fins" after a finless flight).

### Item 5, below the stage

- Lede paragraph, first person, replaces the keyboard table beside the old paragraph (the
  recruiter draft, unchanged): "I founded the Union College Rocket Team and led it as captain
  and chief engineer. CHARGER, the team's 2026 rocket, dropped a sensor payload at apogee,
  streamed five channels of telemetry to a handheld ground station, and won the Deployable
  Sensor Payload event at Battle of the Rockets 2026 PAGE. This page flies it again from the CAD,
  in slow motion, with and without its four fins."
- Brief rows beside it (mono, each PAGE): "Role / Captain and chief engineer", "Team / Union
  College Rocket Team", "Event / Battle of the Rockets 2026", "Result / First place, Deployable
  Sensor Payload event". Accessible name: "CHARGER in brief, from the case study".
- The technical sentence follows, kept, with "centre" changed to "center": "A rigid-body flight
  model computes the pitch motion with Barrowman's stability method, and a lattice Boltzmann
  section through the pitch plane shows the air meeting the fins at an angle of attack. A gust or
  a crosswind tips the nose; the fins, aft of the center of gravity, push it back."
- Cut from the old lede paragraph (the new paragraph carries the same facts): "CHARGER won the
  Deployable Sensor Payload event at Battle of the Rockets 2026 PAGE. This page launches it again
  in slow motion."
- Section index: "01 Runs", "02 How it was computed", "03 Words used here" (was "01 Method",
  "02 Configuration", "03 Runs").
- Skip link: "Skip to the runs and the method" (was "Skip to the method and runs").
- No-script note: "The replay runs in the browser and needs JavaScript. The runs, the method and
  the configuration below read without it." (order changed).
- Runs: eyebrow "01 / Runs" (was "03 / Runs"). Intro opens with "Five runs: three fin sizes in the
  same breeze, then two kinds of air with full fins." The plan's draft was "Five runs, one change
  each."; I did not use it because Run 05 changes two things against Run 01 (the 5 mph breeze
  goes and the gust comes). The rest of the intro is unchanged.
- Run cards: the plain sentence now leads each card (before the setup and the numbers); wording
  unchanged except Run 02, whose new lead is: "Watch too little fin at first, then enough: the
  burn moves the balance point forward, and by T+0.87 s SIM the fins win." The old Run 02
  sentence stays on the card, under its numbers, as the detail: "Negative margin at small angles. Above about 3.5° at
  liftoff SIM the body lift behind the CG turns the nose back, and the margin turns positive at
  T+0.87 s SIM as the CG moves forward."
- Appendix opener: eyebrow "02 / Appendix", heading "How it was computed", the three limits
  (headings and sentences):
  - "A 2D slice, not 3D": "In the slice the air can only pass over and under the body, not around
    it, so the slice overstates the body's share of the lift."
  - "Slow motion, not a film of the flow": "The lattice shows a steady picture of the air at the
    current angle of attack. Its timing does not follow the replay."
  - "A Reynolds number over 100 times too low": "The lattice runs at 900 to 2,800 SIM; the real
    rocket flies near 3 × 10⁵ at 70 m/s EST. So the lattice is a cross-check, and the flight model
    flies the rocket." (3 × 10⁵ tagged EST: computed here from the CAD diameter and the ISA
    viscosity, Method 03.)
  - Sub-index: "A Method", "B Configuration". Accessible name of the list: "Three limits of this
    study".
- Eyebrows: "Appendix A / Method" (was "01 / Method"), "Appendix B / Configuration" (was "02 /
  Configuration").
- Disclosure summaries (native details; the paragraphs inside are unchanged apart from US
  spelling): Method 02 "How the solver stays stable"; Method 03 "What the section's numbers
  mean"; Method 07 "The flight model's tests" (the tests paragraph now follows the lattice gate
  paragraph); Configuration "The lattice and the page's live state" (the Lattice rows, the Live
  row and the CAD measurement row, as a second table).
- Words used here (new section, eyebrow "03 / Words used here", the story lens's glossary in US
  spelling, the plan's ten terms):
  - "Angle of attack (AOA, α)": "The angle between where the nose points and where the air comes
    from. At 0° the rocket flies straight into the air."
  - "Center of gravity (CG)": "The balance point. CHARGER balances 22 in from the nose at liftoff
    PAGE. The point moves forward as the motor burns SIM."
  - "Center of pressure (CP)": "Where the air's sideways push on the whole rocket adds up. Fins
    far back pull it toward the tail."
  - "Static margin, calibers": "How far the CP sits behind the CG, counted in body diameters (1 cal
    = 2.68 in here CAD). A positive margin means the air turns the nose back; a negative one means
    it tips it further over."
  - "Normal force": "The sideways push of the air on the rocket."
  - "Rail exit": "The moment the forward rail button leaves the guide rail. Until the rocket clears
    the rail, the rail steers; after that, the fins do." (Reworded from the story lens's "the
    moment the rocket leaves the guide rail. Before it the rail steers; after it the fins do.",
    because the page's rail exit is the forward button and the aft button stays on the rail 13 in
    longer.)
  - "Weathercocking": "A finned rocket turns into a crosswind, like a weathervane, and climbs
    upwind."
  - "Barrowman's method": "The standard hand calculation of a model rocket's CP and stability
    (Barrowman 1967)."
  - "Lattice Boltzmann section": "Airflow computed on a grid of cells, each holding how much air
    moves in each of nine directions. Here it is a flat 2D slice through the rocket, shown for the
    picture and as a cross-check, not used to fly it. A flat slice exaggerates some forces (Method
    03)."
  - "Source tags": "PAGE published on merttureli.com; CAD measured from the 3D model; EST chosen
    here; FIT tuned to match a published number; SIM worked out live in your browser; STD a
    textbook value."
  - Then the keyboard list, moved unchanged from the lede, under a heading "Keyboard" (hidden on
    touch screens).
- US spelling in existing paragraphs: "centres" to "centers" (Method 01), "centre" to "center"
  (the lede, Method 02, and three times in Method 03's folded paragraph: six with Method 01's),
  "regularised" to "regularized" (Method 02), "linearised" to "linearized" (Configuration,
  natural frequency note). In vx/README.md: "centres", "Forced colours", "honours".

### Open owner questions, as flags (python3 tools/check-flags.py lists them)

- `vx-length`, Method 05: "Which length is current: 37 in (the case study) or 46.49 in (the CAD
  assembly)?"
- `vx-authorship`, footer, shows "[TBD]": "In your own words: what did you build, direct and check
  on this page (the flight model, the lattice engine, the page)?"
- `vx-mass`, Configuration, Mass at liftoff note, flag text "the case study no longer states this
  figure": "The case study stated a 2.2 lb rocket until the copy cut of 2026-10-22 and no longer
  does. Is 2.2 lb with the motor still the liftoff mass, and may this page keep quoting it?" The
  page still tags 2.2 lb PAGE in Method 05 and the Configuration table, and flight.js flies
  0.998 kg from it; found while checking every PAGE value against the live case study.

## Wave 1, scene (items 4, 8 and 12): vx/js/scene/markers.js, vx/js/scene/scene.js, vx/lab/scene.html

Where: the labels drawn on the 3D stage (canvas sprites, mono caps, ink plate). The words match the
panel's CP/CG bar key exactly, so the page has one label set. No new sentences; these are label words.

Stage plates (markers.js `PLATE_WORDS` and the plate text in `update()`):
- CG plate: `CG / BALANCE POINT` (was `CG 22.0 IN SIM`; the station stays in the panel's ALL
  READOUTS as CG LIVE).
- CP plate: `CP / AIR'S PUSH` (was `CP 33.1 IN SIM` / `MARGIN +4.15 CAL SIM` / `N +0.00 LBF SIM`).
  A second line `N +0.56 LBF SIM` shows only while |N| is above 0.05 lbf. MARGIN left the plate; the
  panel's STATIC MARGIN readout carries it.
- Wind arrow plate: `AIR` (was `REL WIND 197 FT/S SIM` / `ALPHA +7.2 DEG SIM`), shown while the
  airspeed is above 1 m/s (in still air on the pad the arrow stays, dimmed, with no word). A second
  line `ALPHA +7.2° SIM` shows while |alpha| is 0.5 deg or more. The unit changed from `DEG` to `°`,
  as the plan writes it. The relative wind speed is in the panel's ALL READOUTS (AIRSPEED).
- Ladder: the `0 FT AGL` label is gone (the ALT cursor's `ALT 0 FT SIM` sits at the same spot). The
  other ladder labels read `100 FT` and up, unchanged.

Unchanged on purpose, listed for the owner:
- The thrust plate still reads `T 20.7 LBF SIM`. The plan's "every other number lives in the panel"
  would move it, but the panel has no thrust row, so moving it would remove the number. Proposal for
  the owner: `THRUST 20.7 LBF SIM`, or a THRUST row in the panel's ALL READOUTS and then a word-only
  plate. Not changed (rule 2).
- The lab-only lattice ring plate `CP 2D SECTION` / `18.4 IN SIM` (shown with ?lab) keeps its number.

Scene lab only (vx/lab/scene.html, a noindex bench page):
- Camera button `Hero`; controls `Framing k`, `Framing aim aft`, `Framing elevation`, `Preset
  elevation`, buttons `Push in`, `Ease out`, `Reset framing`; `Slice dissolved`; `Plume clock` with
  the options "Flight time (wall here: no t)", "1, real time", "1/8", "1/20", "0, paused".
- Note under the framing buttons: "Push in: k 0.8, aim 0.15 m aft, 6 s linear. Ease out: k 1.6 at 8
  deg, 2.4 s. Framing acts on side, quarter and hero."
- Meta description now ends "...the exhaust on its own clock, camera presets and framing, the slice
  dissolve and the flick interaction."

## Wave 2, panel (items 6 and 8, the lattice rows): vx/js/panel/panel.js, vx/js/panel/controls.js, vx/lab/panel.html

Where: the flight panel (desktop right rail; phone bottom sheet and its collapsed row). Mono caps
unless noted. No new sentences on the page; these are labels, states and accessible names.

Phone sheet, collapsed row (panel.js `PEEK`, controls.js `peekFins`):
- Cell labels `PHASE`, `TIME`, `AOA`, `MARGIN` (were `PHASE`, `TIME`, `AOA DEG`, `SM CAL`). The
  units moved onto the values: the angle reads `+2.44°`, the margin `+4.15 CAL` (at 320 px wide
  the `CAL` is read by screen readers but not drawn, for room).
- The FINS toggle beside play: the word `FINS` over the state `WITH` or `WITHOUT` (`HALF` after
  run 02, `×0.75` for any other slider scale). Accessible name "Fins", a toggle button: pressed
  means with fins, mixed for half or any other scale.
- Peek play's accessible name at the end card is "Launch" (it starts a new flight there, as
  LAUNCH and L do); elsewhere "Launch", "Pause" or "Resume" as before.
- While the page narrates, the beat caption (the page's own caption text, item 7) shows in place
  of the four cells. Nothing new is worded here.

VIEW fold (controls.js):
- Button `AUTO` at the head of the view group, once the page offers it. Accessible name "Auto,
  the page picks the view by the phase of the flight".
- Note under the group while AUTO is on: `AUTO / SHOWING SMOKE` (or `PRESSURE`, `VORTICITY`,
  `SPEED`).

PLAYBACK (controls.js, panel.js):
- The rate head reads `RATE / AUTO` while the page sets the rate (was `RATE` always); its value
  is the true rate (`1/20` from the page's ramp, `HOLD` while the replay is frozen).
- The time readout's rate line reads `HOLD` during the freeze (was a dash at rate 0).

ALL READOUTS, lattice group (panel.js `latticeWords`, `writeLatticeLine`), the header's fields
moved here with the header's own words:
- Rows `ENGINE`, `GRID`, `TIER` (labels were the header's), then `INFLOW` and `INFLOW ANGLE`.
- ENGINE: `BARROWMAN 3-DOF / LBM D2Q9`, or `/ LBM PENDING`, `/ LBM PAUSED`, `/ LBM OFF`,
  `/ LBM NOT ATTACHED`, `/ 3D VIEW LOST`, `/ 2D VIEW`.
- GRID: `512×160 / 1440 STEPS/S / T1 / RGBA32F` while the lattice runs (unchanged), else
  `LATTICE PENDING`, `PAUSED, SLOW FRAMES`, `OFF AT TIER 0`, `CONTEXT LOST`, `OFF / NO WEBGL2`,
  `OFF / NO 3D VIEW`, `NOT ATTACHED` (were `OFF / LATTICE PENDING`, `OFF / OFF AT TIER 0` and
  so on, which doubled the OFF).
- TIER: `T1`, or `T1 PINNED` when the visitor or ?tier pinned it.

Panel lab only (vx/lab/panel.html, a noindex bench page):
- Group `Phone peek caption` with buttons `Off`, `Caption`, `Caption, read out`; the sample caption
  "Lab sample: the beat caption sits here, in place of the four cells, while the page narrates"
  (no numbers: nothing on the bench computes a beat).
- Checkbox `View AUTO stand-in: pressure from rail exit to burnout, smoke otherwise`.
- Readout lines `PEEK` and the AUTO state on the `VIEW` line (bench internals).

## Wave 2, page (items 3, 7 and 8, plus item 4's caption line and hint): vx/index.html, vx/js/main.js, vx/js/story.js

Where: vx/index.html unless noted. Text set in caps by CSS is quoted in sentence case where the
source has it so. Every number keeps its tag. Old wording is quoted where a line was replaced.

### Item 3, the front door

- `<title>`: "CHARGER field study · Mert Tureli" (was "CHARGER field study · Mert Tureli VX").
- Header, left: the wordmark "Mert Tureli" (shown in caps, links to `/`), then "/ CHARGER field
  study 01" (hidden below 1040 px). It replaces the old h1 strip "CHARGER / FIELD STUDY 01 / PITCH
  PLANE"; the header line is now a paragraph.
- Header, right: the time code and the true rate, "T+00.436 / 1/20 AUTO" (or "SET" after a rate
  button). New words in that slot: "HOLD" (the replay's 1.5 s hold, and a ?hold) and "PAUSED"
  (paused by the visitor or at the end card). Phones drop the AUTO or SET word and keep the rate.
  Accessible names: "Flight time", "Playback rate". The old fields ENGINE, GRID, TIER and the
  labels FLIGHT TIME and RATE are gone from the header (GRID, TIER and ENGINE are in the panel's
  lattice line).
- Header nav: "Case study" (to ../projects/charger.html), "Runs", "Site" (was "Runs", "Lab",
  "Site"; the labs stay in the footer).
- Title plate on the stage (new; the page's one h1), lower left before the first launch:
  - Eyebrow: "Field study 01 / CHARGER / Union College Rocket Team / 2026" (the lede's existing
    eyebrow, unchanged).
  - h1: "What the fins do" (moved from the lede's display h2).
  - Sentence (the plan's draft, unchanged): "A gust tips the nose. The fins, behind the balance
    point, push it back. Watch it with fins, then without."
  - Byline: "Mert Tureli / Captain and chief engineer / First place, Battle of the Rockets 2026"
    with the PAGE tag (all three on projects/charger.html).
  - Pills: "Watch with fins" (the default launch) and "Without fins" (the same gust, no fins).
- Lede: its heading is now the eyebrow line as an h2 (same text); the display "What the fins do"
  moved up to the plate.
- Footer link row, the main site's wording: "Resume (PDF)", "LinkedIn", "Email" (new, owner
  question 5), then the existing "The CHARGER case study", "merttureli.com", "The labs" (order
  changed). No "hire", "available" or "open to roles" anywhere.

### Item 4's page part, done here: the stage caption and the hint

- The caption's second line: "A FLAT 2D SLICE OF THE AIR / NOT TIME-ACCURATE" (the plan's draft;
  was "2D SECTION / INFLOW 0.030 LU AT 0.0° SIM / NOT TIME-ACCURATE", on phones "NOT
  TIME-ACCURATE / 0.030 LU / 0.0° SIM", and before the lattice "2D PITCH-PLANE SECTION / NOT
  TIME-ACCURATE"). The inflow in lattice units is in the panel's ALL READOUTS and in Method 03.
  The held-inflow warning ("INFLOW HELD AT +35° EST / THE FLIGHT IS PAST IT") is unchanged.
- The caption's first line gains "AUTO" while the view switches by itself: "FLOW / PRESSURE AUTO /
  SECTION THROUGH THE FINS".
- The hint line ("DRAG THE ROCKET TO FLICK IT / DRAG SPACE TO ORBIT / L LAUNCH") now shows only on
  the idle pad, and not under the title plate. Wording unchanged.

### Item 7, the narrated replay

- Captions (main.js through story.js `CAPTION_TEXT`; one line in the stage's caption slot, in the
  phone sheet's peek row too; shown in caps). Each appears only when its condition holds:
  - "On the rail"
  - "Off the rail at 46.6 ft/s SIM" (the rail exit speed, as the panel's EVENTS row)
  - "A gust from the side, 11.2 mph EST: the air meets the nose at 7.2° SIM" (the peak, at the
    moment |alpha| peaks)
  - "The fins, 22.1 in SIM behind the balance point, push it back". Changed from the plan's draft
    in two ways: the SIM tag sits right after its number, and the distance is the fins' own center
    of pressure behind the live CG (22.1 in), so the sentence is literally true. The plan's
    example 11.1 in is the whole rocket's CP behind the CG. If the owner prefers the whole
    rocket's CP, the line should name it: "The air's push, 11.1 in SIM behind the balance point,
    turns the nose back".
  - "Each swing smaller"
  - "Straight again, 0.72 s SIM after the gust", or "... after rail exit" with no gust (new
    variant; the tag moved next to its number as above)
  - "Coasting up"
  - "Apogee" (defined, but at apogee the end card takes the stage)
  - Finless: "Nothing pushes back: it turns sideways", then "Past 60° at T+1.56 s SIM"
- Slate (top right of the view; loud for 1.2 s at a launch, then quiet): the launch's conditions,
  the end card's wording: "Full fins / still air / gust 11.2 mph EST at rail exit"; other forms
  "Half fins", "No fins", "Fin scale 0.75", "wind 5.0 mph EST", and only when changed from the
  defaults "CG 24.0 in", "rail 60 in", "launch angle +5.0°". During a flight it replaces the GUST /
  DISARM pill, which now shows only on the pad.
- Reduced motion only: buttons "Previous beat" and "Next beat", group name "Step the replay beat by
  beat".
- Method 04, first sentence replaced. New: "The replay changes speed with the flight. It runs at
  1/8 of real time on the rail EST. From just before rail exit it slows to a rate chosen so that
  the wobble, from rail exit until the angle of attack stays under 2°, takes about 12 s on screen,
  held between 1/32 and 1/8 EST: 1/20 for the default launch SIM. At the first swing of the nose
  it stops for 1.5 s, marked HOLD, and it is back at real time by about T+1.6 s EST. For a rocket
  that turns over, the slow part runs until the pitch passes 60° EST. The replay pauses at apogee.
  The header shows the true rate at every moment, and the rate buttons in the panel override it."
  (The 1/20 is filled from the page's own pre-flight.) Old: "The replay runs at 1/8 of real time
  until 3 s after burnout, then at real time; the rate buttons in the panel override it EST." The
  rest of Method 04 is unchanged.

### Item 8, the pressure view's legend

- Legend line under the flow line (swatches plus words):
  - pressure: "Orange / air pressing harder", "Gray / pressing less" (the plan wrote GREY; US
    spelling). The suction side of the lattice's ramp runs from ink to a light gray, so "gray" is
    the honest color word.
  - smoke: "White lines / smoke carried by the air".
  - The plan's "2D SLICE" is carried by the caveat line right under it ("A flat 2D slice of the
    air"), so it is not repeated in the legend.
- The HOLD badge's border is paper now (orange is the legend's color); its text is unchanged.

### No new owner flags

The open questions stay as wave 1 left them: `vx-length`, `vx-mass`, `vx-authorship` (python3
tools/check-flags.py lists them).

2D view without WebGL (vx/js/panel/fallback.js), the scene area's wave 1 request for one label set:
- The 2D view's labels now use the stage plates' words (listed under "Wave 1, scene"): `CG /
  BALANCE POINT` (was `CG 22.00 IN`), `CP / AIR'S PUSH` (was `CP 33.10 IN`) with `N +0.56 LBF
  SIM` under it while |N| is above 0.05 lbf, and `AIR` on the wind arrow while the airspeed is
  above 1 m/s with `ALPHA +7.2° SIM` from 0.5 deg (was `REL WIND 197.0 FT/S` over `AOA +7.25 DEG`,
  which carried no tag). The numbers stay in the panel. Unchanged: `PAD / RAIL 72 IN`, the lab-only
  `CP 2D SECTION` ring label, the drag hint `FLICK n DEG/S`.

## Wave 2, scene (items 10 and 12): vx/js/scene/trail.js, markers.js, scene.js, director.js, vx/lab/scene.html

Where: the labels drawn on the 3D stage (canvas sprites, mono caps, ink plate), the stage canvas's
accessible name, and the scene bench page. No sentences on the page itself; label words, one
accessible description, and bench strings. Every number keeps its tag. No owner flags: canvas text
cannot carry `<mark>`, and nothing here is an open owner question.

End plate ticks (trail.js `TICK_WORDS`, shown only on the plate at apogee, beside a `+` tick on each
path):
- `RAIL EXIT` and `BURNOUT` (words only, on the flight's own path).
- `APOGEE 1027 FT SIM` with the fin words on a second line: `FULL FINS`, `NO FINS`, `HALF FINS`, or
  `FIN SCALE 0.75` for any other scale (the page's slate and end card words, in caps). The ghost path
  (the other fin choice, flown silently in this tab) carries its own `APOGEE 295 FT SIM` / `NO FINS`.
  The plan's tick list reads only `APOGEE n FT SIM`; the fin words are added so the two paths read
  apart without relying on color (paper against livery orange). The numbers are today's model (SIM).

The gust beat (markers.js):
- AIR plate, a second line while the gust pulse acts (0.5 s of flight from rail exit):
  `GUST 11.2 MPH EST` (the plan's wording; the value is the armed gust's peak).
- The angle-of-attack arc at the nose carries `ALPHA +7.5° SIM`. The wording is the AIR plate's
  existing ALPHA line; it moves from the plate to the arc while the arc shows, so the figure shows once.
  The arc shows from the gust until just past the peak, and only face on (the side camera).

Stage canvas accessible name (scene.js, updated at most once a second; read by screen readers):
- On the end plate, new: "CHARGER field scene, end plate, side view at equal scale: the path flown in
  this tab from the pad to apogee, full fins, apogee 1027 ft SIM, beside the same conditions with no
  fins, apogee 295 ft SIM." (the fin words and the apogees come from the ticks).
- Camera words in the existing description: "low three-quarter camera" for the empty-stage view (it
  would have read "hero camera", an internal name) and "free camera" after an orbit. The other camera
  names are unchanged.

Unchanged on purpose: `+X DOWNRANGE` (moves to the right end of the ground line on the plate), the
ladder's `100 FT` labels (on a small plate they thin to every 200 or 500 ft).

Scene bench only (vx/lab/scene.html, noindex):
- Section `Paths, plate and director`; buttons `Fly with the director`, `End plate`; rows `Fly with
  fins`, `Gust at rail exit, 11.2 mph`, `Fly rate` (options `1/8`, `1/20`, `1, real time`),
  `Angle-of-attack arc asked`, `Gust line on the AIR plate`, `Emphasis` (options `None, all at full
  strength`, `Air and alpha`, `CP and N`, `CG`, `ALT cursor`, `Thrust`).
- Note: "Fly runs the page's flight model (vx/js/flight) on this bench, no lattice, with the scene's
  director (vx/js/scene/director.js): the hero view on the pad, side from ignition, the push-in from
  rail exit, the ease-out from burnout and the end plate at apogee with the other fin choice flown
  silently as the ghost. Its figures are SIM. The arc shows only face on (the side camera, settled);
  the bench's hand-set alpha is EST."
- Readout lines `paths`, `plate`, `arc`, `director`.
- Meta description now ends "...the slice dissolve, the flick interaction, the flight paths and end
  plate, the angle-of-attack arc and the camera director on the real flight model."

For the page area (not written here; the plan's caption is page copy): the plate caption "FULL FINS
AND NO FINS / THE SAME GUST, 11.2 MPH EST / BOTH FLOWN IN THIS TAB / SIM" can be built from
`director.plate` ({main, ghost: {finScale, apogeeFt}, gustMph, windMps}).

## Wave 3, page (items 9, 10 and 11, page parts; the shipping fixes): vx/index.html, vx/js/main.js, vx/js/story.js, vx/README.md, vx/tools/

Every entry below is new owner-facing copy. Visible text on the stage is set in mono caps by CSS;
the strings are given in the case the source holds. Every number keeps its tag.

### Item 9, the lede figure (index.html `figure[data-fig="lede"]`, story.js `ledeFigure`, `pathFigure`)
- Figure caption (figcaption under the figure, mono caps): "Still air, the same 11.2 mph gust at rail
  exit EST / both flown with this page's model SIM". The plan's draft was "THE SAME 11.2 MPH GUST EST /
  BOTH FLOWN WITH THIS PAGE'S MODEL / SIM"; "still air" and "at rail exit" were added so the caption
  names the full conditions (the do-not list: no path without its conditions).
- Words inside the figure (mono caps): axis titles "Altitude, ft" and "Downrange, ft, equal scale";
  axis numbers (−200 to 800 ft, 200 to 1200 ft); series names "Full fins" and "No fins" (the renderer
  also has "Half fins" and "Fin scale n.nn" for other fin scales); each apogee in display type with
  "ft" and a SIM tag (today 1027 and 295).
- Screen-reader title and description of the svg: title "Flight paths to apogee, with fins and
  without"; description "Full fins: up to 1027 ft, 92 ft upwind at apogee. No fins: it turns over and
  reaches 295 ft, 236 ft downrange. Still air and the same 11.2 mph gust at rail exit (EST), both flown
  with this page's model (SIM). Downrange and altitude at equal scale." (the numbers are filled from
  the flight).

### Item 9, the run card sketches (index.html `figure[data-fig="<run>"]`, story.js `runSketch`)
- Captions (mono caps, under each sketch): Runs 01 to 03 "Path to apogee, 5 mph crosswind EST"; Run 04
  "Path to apogee, 10 mph crosswind EST"; Run 05 "Path to apogee, still air, 11.2 mph gust at rail exit
  EST".
- Inside each sketch: axis numbers 500 and 1000, the axis note "ft, equal scale", the apogee label
  "1028 ft SIM" (one per card).
- Screen-reader title "Run path to apogee: full fins, 5 mph crosswind" (fin words and conditions per
  run) and description "Up to 1028 ft, 84 ft upwind at apogee (SIM). Downrange and altitude at equal
  scale, the same axes on every run."

### Item 9, the share preview (index.html head)
- og:description: "CHARGER won the Deployable Sensor Payload event at Battle of the Rockets 2026. Here it
  flies again from the CAD, in slow motion, with and without its four fins." (the recruiter lens's draft,
  word for word).
- og:image:alt: "The CHARGER field study's stage: the title plate WHAT THE FINS DO beside the rocket on
  its launch rail." (the shipped vx/og-field.png is a real capture of the title plate).
- The page meta description (not the og one) is unchanged and still technical; the owner may want it to
  match the og:description.

### Item 9, refreshed static numbers (values, not wording; listed so nothing changes unseen)
The bake writes the current model's run card values into the HTML (the page refilled them live
already): Run 01 margin +4.09 cal, AOA at rail exit +9.6°, settle 0.23 s, apogee 1028 ft; Run 02 margin
−0.48 / +0.02 cal, settle 0.45 s, apogee 1033 ft, the fins win at T+1.16 s; Run 03 margin −6.85 cal,
peak AOA 31.5°, pitch past 60° at T+1.25 s, apogee 306 ft; Run 04 AOA at rail exit +18.7°, pitch at
T+1 s −8.7°, apogee 1014 ft, 167 ft upwind; Run 05 peak AOA 7.61°, settle 0.73 s, 0.92 Hz, apogee
1027 ft; Method 06 apogee near 310 ft; Method 04 slow rate 1/20. All SIM.
Wording that the current model no longer quite matches, outside this wave's copy (for the owner and the
flight track, not changed here): Run 03's lead "the rocket pitches over and loops" and Method 06's
"flies a loop" (to apogee the finless path arcs over to 306 ft and 250 ft downrange; it does not come
back over itself before apogee); Run 02's "Above about 3.5° at liftoff" (written for the earlier model).

### Item 10, the end plate's caption (the end card's last line, `[data-end-plate]`, main.js `plateCaption`)
- "Full fins and no fins / the same gust, 11.2 mph EST / both flown in this tab / SIM" (the plan's draft,
  word for word, for the default launch).
- Its forms for the other flights: the first part names this flight's fins first ("No fins and full
  fins" after a finless flight; "Half fins and no fins" for Run 02); the conditions read "the same 5.0
  mph crosswind EST", "the same 10.0 mph crosswind EST", "the same still air", or "the same gust, 11.2 mph
  EST, in a 5.0 mph crosswind EST"; without a ghost (a visitor's gust or flick), "Full fins / gust,
  11.2 mph EST / flown in this tab / SIM".

### Shipping fixes
- C1-4, the lattice failing to load (stage caption, panel GRID line, Configuration Live row):
  "FLOW / LATTICE UNAVAILABLE" with "THE FLIGHT MODEL RUNS WITHOUT IT"; the panel reads "OFF / LATTICE
  UNAVAILABLE"; the Configuration row "lattice unavailable". Was LATTICE PENDING, which suggested it was
  still on its way. LATTICE PENDING stays for the time it really is on its way.
- C1-3, the CAD download (stage status line): "LOADING THE CAD ASSEMBLY / 1.2 OF 2.5 MB" (the MB figures
  are the bytes received and the assembly's size, at most once a second).
- C2-01, the idle pause: the existing badge "FLOW PAUSED / Resume flow"; the caption "FLOW / PAUSED" with
  "NO INPUT FOR 90 S / CLICK THE STAGE TO RESUME" (phones: "NO INPUT FOR 90 S / TAP TO RESUME"); the
  Configuration Live row "paused after 90 s without input"; the panel's lattice line reads the reason
  "flow paused".
- The ?bench=1 section (shown only with ?bench; main.js `mountBench`, `benchText`): eyebrow and h2
  "Benchmark"; status lines "Benchmark / waiting for the page", "Benchmark / 4 of 7 / ENGINE T2 / 6 s
  left", "Benchmark done / result below" (the same in caps on the stage's status line); buttons "Copy
  result" and "Run again"; notes "Copied" and "Press Command or Control and C to copy"; the details
  summary "The result as JSON"; the result block's fixed words follow C2's template (section 9.5),
  plus "NOTE REDUCED MOTION IS ON: THE PAGE NORMALLY RUNS THE LATTICE AT TIER 0", "(RAF CAPPED NEAR 30 HZ:
  LOW POWER MODE OR ENERGY SAVER)", "(FRAMES SLOWER THAN 25 HZ WITH THE PAGE IDLE)" and "LATTICE: <reason>".
- vx/README.md is rewritten for the new page (developer documentation, not page copy): what a visitor
  sees, the files, the modules, the page's mechanics, the URL parameters, the benchmark (with C2's
  instruction for the owner: "Open https://merttureli.com/vx/?bench=1 on each machine and browser,
  plugged in, with the tab in front and other tabs closed. Wait about 75 seconds without touching the
  page, press Copy result and paste it."), the tools and the tests.

### Owner flags
No new flags. The three open ones stand: `vx-length` (Method 05), `vx-mass` (Configuration) and
`vx-authorship` (footer, still "[TBD]").

## Wave 3, panel (item 11, the 2D part of item 10, the bench hook): vx/js/panel/chart.js, fallback.js, panel.js, vx/lab/panel.html

Where: the strip chart in the dock under the stage (canvas, mono caps; chart.js `CHART_WORDS`), the 2D
view used without WebGL2 (canvas, mono caps; fallback.js), the panel body, the panel lab. Every number
on the chart keeps the chart's SIM tag at the band's right, as before; the numbers are the run cards'.

### The strip chart (item 11)
- Legend: `ANGLE OF ATTACK` (narrow docks: `AOA`), then `SIM`. Was `AOA` and `PITCH` with `8 S / SIM`.
  Design decision for the owner: the pitch trace is no longer drawn on the page (about 33° of pitch at
  apogee set the range and shrank the 7.6° wobble to a few pixels); it stays under `?lab` and in the lab,
  and the PITCH readout stays in ALL READOUTS.
- On the pad (the flight LAUNCH would fly, dimmed): legend `PREVIEW, FLOWN IN THIS TAB` (narrow:
  `PREVIEW`), then `SIM`.
- With a ghost (after the end card's fin toggle): the legend names both, `NO FINS` and `FULL FINS` (the
  flight's own fin words first), then `BOTH FLOWN IN THIS TAB / SIM` (narrow: `SIM`); the ghost's own
  label on its trace: `FULL FINS` (the page's label in caps).
- Word ticks: `ON THE RAIL` (the dim dashed trace before rail exit), `GUST`, `PEAK 7.61°`, `SETTLED
  0.73 S`, `BURNOUT`, and from apogee on `APOGEE` over `DESCENT NOT PLOTTED` (two lines; `APOGEE` alone on
  the pad preview). A rocket that turns over gets `PITCH PAST 60°` (the end card's second figure) and no
  SETTLED. PEAK and SETTLED carry two decimals, as the Run 05 card.
- Fin words: `FULL FINS`, `NO FINS`, `HALF FINS`, `FIN SCALE 0.75` (the stage plate's words).
- The y axis: `+10°`, `0°`, `−10°` (the unit on the labels; the separate `DEG` over the axis is gone, so
  the band above the plot holds word ticks from the left edge).
- Time axis labels `T+0.5`, `T+1` ... `T+8`, with a break drawn at T+2 (the first 2 s get 60 percent of the
  width). Not copy, but a visible change: the axis no longer scrolls; it runs from T+0 to apogee.
- Unlabeled on the canvas, explained in the screen-reader sentence: below 50 ft/s near apogee the trace is
  dim and dashed (it rises off the chart as the airspeed goes to zero). If the owner wants words there, a
  candidate is `UNDER 50 FT/S EST`.
- Screen-reader sentence (visually hidden, at most once a second), its forms:
  - pad: "Strip chart, a preview of the flight LAUNCH flies with these settings, flown in this tab (SIM);
    the angle of attack peaks at 7.61 degrees at T plus 0.43 s; it is back under 2 degrees 0.73 s after
    the gust; apogee at T plus 8.05 s."
  - in flight: "Strip chart of the angle of attack, T plus 0.5 s: +5.1 degrees. The angle of attack peaks
    at 7.61 degrees at T plus 0.43 s. Before rail exit, and below 50 feet per second near apogee, the trace
    is dashed. Computed in this tab (SIM)." (the settle sentence joins once the flight has passed it)
  - from apogee: "Strip chart of the angle of attack from T plus 0 to apogee at T plus 8.04 s; the descent
    is not plotted." followed by the same beat sentences.
  - a rocket that turns over: "The pitch passes 60 degrees at T plus 1.20 s."
  - with a ghost: "The dim trace is the same conditions with full fins, flown in this tab."

### The 2D view's end plate (item 10, no WebGL2)
- Tick labels: `RAIL EXIT`, `BURNOUT`, `APOGEE 1027 FT SIM` over the fin words (`FULL FINS`, `NO FINS`):
  the stage plate's words (vx/js/scene/trail.js), copied.
- Caption lines at the top left, under `2D VIEW / NO WEBGL2 IN THIS BROWSER` and in place of `TRUE ANGLES /
  SIM / RAIL EST` while the plate shows: `FULL FINS AND NO FINS`, `THE SAME GUST, 11.2 MPH EST`, `BOTH
  FLOWN IN THIS TAB / SIM` (the page's plate caption, word for word, in caps on three lines). Other forms:
  `NO FINS AND FULL FINS`; `THE SAME 10.0 MPH CROSSWIND EST`; `THE SAME STILL AIR`; `THE SAME GUST, 11.2
  MPH EST, IN A 5.0 MPH CROSSWIND EST`; without a ghost (a visitor's gust or flick) `FULL FINS` / `GUST,
  11.2 MPH EST` / `FLOWN IN THIS TAB / SIM`.
- Scale bar on the plate: a round number of feet, `100 FT` (the `6 IN` bar beside the rocket otherwise).
- The canvas's accessible name on the plate: "End plate: the path from the pad to apogee, 1027 ft, full
  fins; the other path is the same conditions with no fins, 295 ft; both flown in this tab (SIM)."
  (without a ghost: "..., full fins, flown in this tab (SIM).")

### The page's benchmark (C2 section 9.6, shown only with ?bench)
- A note at the top of the panel body: `BENCHMARK RUNNING`; the GRID line gets ` / ` and the page's label
  (`BENCHMARK RUNNING`) appended.

### The panel lab (vx/lab/panel.html, bench strings)
- Button "Seek to apogee"; group "Strip chart and end plate" with "Pad preview: the bench flight flown
  ahead", "Ghost: the other fin choice, flown ahead", "2D end plate at apogee"; readout line PLATE ("up",
  "down", "at the apogee stop: Seek to apogee", "(no room)") and the CHART line's "labels" and "dropped".

No owner flags were needed in the panel (the authorship sentence and the length question live in the
page's copy).

## Wave 3, scene (regression pass, item 12 checks, the scene's shipping fixes): vx/js/scene/*, vx/css/scene.css, vx/lab/scene.html

No new owner-facing sentence on the page. The stage shows the same words as after wave 2 (plates, ticks,
the GUST line, the arc label, the canvas description). No owner flags were needed.

### The scene lab (vx/lab/scene.html, bench strings)
- New readout line, LADDER: `on` or `off (no room for the ALT label)`, then `−0.62 m from the rocket`
  (signed, two decimals), then, while it moves to or stands at the end plate, `100 percent to the plate`.

### Visible changes without new words (for the owner to see, not to approve as copy)
- The altitude ladder now keeps its place beside the rocket across the range (0.62 m upwind of it, further
  upwind when the rocket is pitched over), so the ALT cursor stays in the side view through the coast. Its zero
  is now the rocket's reference station on the pad, so `100 FT` on the ladder means 100 ft above the pad, the
  same measure as the ALT cursor and the panel's ALTITUDE; a faint line runs from that zero to the ground.
- On a phone, where the ladder has no room, the coast beat no longer dims every plate (its subject, ALT, is not
  on screen there).
- The camera holds its lean toward the nose while the angle-of-attack arc shows, then moves aft to the fins for
  the push caption (it used to start moving aft at the angle's peak, under the gust caption).
- At apogee, a camera the visitor took before apogee keeps its view: no plate, no ghost path, and the end card
  leaves out the plate line (it used to name two paths the stage did not show).
- On mid-size desktop windows (about 930 to 1100 px wide) the end plate keeps the ladder's labels clear of the
  end card: the plate gets smaller there instead of sliding under the card.

## Fix phase, panel (the result frame, the chart's colors and tags): vx/js/panel/panel.js, chart.js, controls.js, format.js, vx/css/panel.css

Where: the flight panel (desktop rail, phone sheet and its peek row), the strip chart in the dock (canvas, mono
caps; chart.js `CHART_WORDS`), the CP/CG bar (canvas). Every item is new or reworded and needs the owner.

### The panel at the apogee stop
- Phase chip in the TIME row and the phone peek's PHASE cell: `APOGEE` while the end card is up (it read
  `DESCENT`: the page stops one 5 ms step after the apogee event). After CONTINUE PAST APOGEE it reads
  `DESCENT` again. format.js `PHASES.apogee`.
- ANGLE OF ATTACK row (panel.js `AOA_SLOW_SUB`): while the airspeed is under 50 ft/s near apogee (the run
  cards' and the chart's rule), the value steps back to a dimmer white and the sub-label "Nose off the
  oncoming air" becomes: "Too slow near apogee to mean much" (the first-timer lens's wording). The value
  and its DEG SIM stay on screen.
- Phone peek AOA cell, same condition: the value dims; screen-reader text after it: ", too slow near
  apogee to mean much".
- Live region: no new sentence. "Phase descent." is no longer read at the apogee stop (it is read after
  CONTINUE PAST APOGEE), and a phase or event line queued just before the narration starts is dropped
  instead of being read under the caption.

### Source tags
- Phone peek row: a visible `SIM` beside the `AOA` label (the one cell with room for it down to 320 px;
  every number in the row is SIM), and screen-reader text " SIM" after the TIME, AOA and MARGIN values.
- Strip chart word ticks: `PEAK 7.61° SIM`, `SETTLED 0.73 S SIM` (the tag drawn a step quieter than the
  words).
- Strip chart live value beside the plot (in flight): `SIM` under the value.
- CP/CG bar dimension label: `+4.58 CAL SIM` (was `+4.58 CAL`).

### The strip chart's words
- Pad legend (cold first screen) now names the quantity: `ANGLE OF ATTACK / PREVIEW, FLOWN IN THIS TAB`
  (narrower docks: `AOA / PREVIEW, FLOWN IN THIS TAB`, then `AOA / PREVIEW`), then `SIM`.
- In-flight legend with one trace: `ANGLE OF ATTACK / FULL FINS` (the flight's fin words: `NO FINS`,
  `HALF FINS`, `FIN SCALE 0.75`; narrower docks: `ANGLE OF ATTACK`, then `AOA`), then `SIM`. The legend with a
  ghost is unchanged.
- New word tick on the dim dashed climb near apogee: `UNDER 50 FT/S EST` (the candidate wave 3 listed). It is
  placed beside where the dashed part starts and left out when the dock has no room for it.

### The panel's KEYS list (controls.js)
- `1 to 4` VIEW (was 1 and 4 joined by an en dash, U+2013, against rule 3; the page's own Keyboard list says "1 to 4").

### Visible changes without new words (for the owner to see)
- The chart colors each trace by its fin choice, as the end plate, the lede figure and the run sketches do:
  finned paper (white), finless livery orange. The cold pad preview of the default launch is now a dim
  white trace, the finned flight's trace is white, and after WITHOUT FINS the finless trace is orange with
  the full-fins ghost in dim white. The PEAK ring takes the trace's color. Under ?lab the pitch trace is
  dashed light grey, so it stays apart from a white AOA trace.
- LAUNCH in the rail is an outline pill while the title plate is up (WATCH WITH FINS is the one filled
  pill then); it is filled again once the plate fades. Forced colors are unchanged.
- The rate head's `OF REAL TIME` hides while the head reads `HOLD` (it read `HOLD OF REAL TIME`).
- The chart's live value turns dimmer white where its trace is dim (on the rail, under 50 ft/s).

## Fix phase, page (review findings): vx/index.html, vx/js/story.js, vx/js/main.js, vx/lab/index.html

Every entry below is new or reworded owner-facing copy, or a visible change listed so nothing changes
unseen. Stage text is set in mono caps by CSS; strings are given in the case the source holds. Every
number keeps its tag.

### The narrated replay and the end card (story.js, main.js)
- The gust caption (story.js `CAPTION_TEXT.gust`): "A gust from the side, 11.2 mph EST: the nose tips up to
  7.6° SIM" (was "... the air meets the nose at 7.6° SIM"). It now shows while the nose tips (as the angle
  first reaches 2° after the gust, the flight repeating its pre-flight), so the number is the pre-flight's
  peak and the words say so ("up to").
- The end card's second figure label (story.js `showEnd`, and the static copy in index.html): "Straight again
  after the gust (under 2°)", or "Straight again after rail exit (under 2°)" without a gust (were "Under 2°
  AOA, after the gust" and "Under 2° AOA, after rail exit"). The narration's words, no undefined AOA.
- When the angle rose past 2° again late in the climb (today only Run 04, 10 mph crosswind), the same figure
  (the run cards' definition, 6.56 s) is labeled "Last over 2° after rail exit" ("Last over 2° after the
  gust" with a gust), so it no longer reads as the time the narration calls straight again (0.52 s). Owner
  decision still open from waves 2 and 3: keep the cards' definition with this label, or show the wobble's
  end. The chart gets `beats.settleLate` for the same label (a request to the panel area).
- The end card's spoken status (sr-only): "Paused at apogee, 1027 feet, SIM, computed in this tab. Replay,
  without fins, the case study and continue past apogee are on the stage." (the number now carries its tag;
  "height unknown" when there is no apogee).
- The end plate's caption (the card's last line, main.js `plateCaption`): both apogees are named, "Full fins
  1027 ft and no fins 295 ft / the same gust, 11.2 mph EST / both flown in this tab / SIM" (was "Full fins
  and no fins / ..."), so a short screen whose card covers the plate still gives the comparison.
- The end card's conditions line and the plate caption gain one segment when a setting changed during the
  flight: "settings changed at T+1.20 s" (the number filled from the flight).
- The header's rate: between the ramp's fractions it now prints the multiplier, "0.69×" (with AUTO or SET),
  never "1/1"; 1/n only where n is within 3 percent of the true rate.

### The runs (index.html)
- Run 03's lead, flagged vx-loop: "The nose falls away from the wind, and the rocket pitches over and arcs away
  downwind." (was "The nose falls away from the wind, the rocket pitches over and loops."; the card's own
  sketch shows an arc to 306 ft, 250 ft downrange).
- The five sketch captions now say the path was flown here, with its tag: "Path to apogee, 5 mph crosswind EST
  / flown in this tab SIM" (Runs 01 to 03), "Path to apogee, 10 mph crosswind EST / flown in this tab SIM"
  (Run 04), "Path to apogee, still air, 11.2 mph gust at rail exit EST / flown in this tab SIM" (Run 05).
- Run 02, a value, not wording: "Above about 5.1° at liftoff SIM the body lift behind the CG turns the nose
  back" (was a hard-coded 3.5° from the earlier model). It is now computed from the flight model's own terms
  (story.js `liftTurnDeg`, the static moment's sign change at the liftoff CG) and baked.
- Run 04's title keeps "10 mph" on one line (a non-breaking space; no new words).

### The appendix (index.html)
- Limit 3: "The lattice runs at 900 to 1,500 SIM; the real rocket flies near 3 × 10⁵ at 70 m/s EST. So the
  lattice is a cross-check, and the flight model flies the rocket." (was 900 to 2,800).
- Method 02: "The rocket's section through the pitch plane is the solid, and its walls use halfway bounce-back.
  The flow is computed in the body's own frame: the walls stay at rest, the free stream at the edges turns
  with the body, and the body's pitch rate reaches the air as the Coriolis, centrifugal and Euler forces of a
  turning frame, added by Guo forcing (Guo, Zheng and Shi 2002) STD." (was the moving-wall term, Ladd 1994,
  which the page no longer uses).
- Method 02, folded: "(0.504 at tier 3, set for a lattice Reynolds number of 1,500 at an inflow of 0.05 lattice
  units, the fastest the engine runs) EST" and "The outflow edges hold the density at 1, take the velocity of
  the cell inside and keep only the regularized part of its non-equilibrium (Latt, Chopard, Malaspinas,
  Deville and Michler 2008) STD." (was "hold the density at 1 and extrapolate the rest (Guo, Zheng and Shi
  2002)").
- Method 03: "The lattice viscosity is set for a Reynolds number of 1,500 at an inflow u_in of 0.05 lattice units
  EST. Since Re = u_in D / ν, the Reynolds number follows the inflow: 900 on the pad, rising to 1,500 at 0.05
  lattice units, the fastest inflow the engine runs, which the flight reaches at 28 m/s SIM."
- Method 03, folded, now in the past tense and marked as pre-fix measurements: "In runs made before the engine's
  fix of 2026-10-23, at an inflow of 0.10 lattice units, the section's C_n at 5° was 17 to 32 SIM, where an
  unconfined flat plate of the same length gives 2π sin α L / D = 9.5 STD. Nor did the held flow settle. Held
  at 5° on the 512 × 160 grid in those runs, once developed (after about 2,300 steps), the section's center of
  pressure swung between about 9 and 21 in from the nose ..., with C_m +6 to +79 about it, where Barrowman
  gives 32.94 in and a restoring moment SIM." (Barrowman's CP is now the live value, [data-k="xcpIn"]; was a
  stale 33.1 in.) Re-measuring on the current engine needs a GPU run; the owner may prefer that.
- Method 03, the inflow paragraph: "The page asks for an inflow in lattice units of u_in = 0.03 + 0.05 V / (70
  m/s), held between 0.03 and 0.10 EST. The engine runs the flow at 0.05 at most and, when the page asks for
  more, scales the body's pitch rate down in the same ratio, so the reduced pitch rate q D / V is kept EST."
  In its last sentence, flagged vx-loop: "as the finless rocket pitches over" (was "through the finless loop").
- Method 05: the repeat "(2.2 lb) PAGE" is now inside the vx-mass flag too (no new words).
- Method 06, flagged vx-loop: "The rocket does not tumble end over end: it pitches over and arcs away downwind.
  Body lift acts at the planform centroid, 24.22 in from the nose, behind the 22 in CG SIM, so the finless
  airframe settles at a high angle of attack, 20 to 30°, and arcs over, its nose below the horizon, to an apogee
  near 310 ft SIM." (was "pitches over and loops" and "flies a loop to an apogee near 310 ft"; to apogee the
  pitch reaches 113°, angle of attack 20 to 32°).
- Method 07, rewritten from validation track L2-07: "The lattice's gate is a cylinder 24 cells across at a
  Reynolds number of 100, in a 768 × 192 grid with the cylinder 16 diameters behind the inflow edge, run for
  60,000 steps and averaged over whole cycles once the shedding has saturated. The references are an unconfined
  cylinder in 2D at that Reynolds number: a drag coefficient of 1.320, a Strouhal number of 0.165 and a lift
  amplitude of 0.318 (Parvar et al. 2023, arXiv:2303.09262, Table 1, from Kravchenko et al. 1999, Qu et al. 2013
  and Posdziech and Grundmann 2007) STD, with tolerances of 5, 5 and 15 percent set before the runs. Measured: a
  drag coefficient of 1.369, a Strouhal number of 0.164 and a lift amplitude of 0.323, over 10 saturated cycles
  SIM, all three inside. The run was on a CPU transcription of the engine, which matched the engine on the
  graphics card to within 5.3 × 10⁻⁵ over 12,000 steps of this case; the same gate runs in the lattice lab.
  Frame and step rates measured under software rendering are not representative of a graphics card." (the old
  paragraph's blockage ranges, 1.450 / 0.169 and 99 steps per second are gone; L2-07 marks the printed 1.450 /
  0.169 as measured before saturation).
- Configuration, Lattice group: "Reynolds number | 900 to 1,500 | SIM | u_in D / ν, from the pad to the 0.05 cap,
  reached at 28 m/s; set for 1,500 at u_in 0.05 EST; the real rocket is near 3 × 10⁵ at 70 m/s" and "Inflow
  speed | 0.03 to 0.05 | EST | lattice units: the page asks for 0.03 + 0.05 V / (70 m/s), up to 0.10; the engine
  runs at most 0.05 and scales the body's pitch rate with it".

### Refreshed static numbers (values, not wording)
The bake now writes every computed configuration value into the HTML (story.js `configValues`), so a reader
without JavaScript sees the current model: margin at liftoff 4.09 cal (was 4.15; also Method 05), at burnout
4.58 (4.64), half fins −0.48 / +0.02 (−0.35 / +0.14), no fins −6.85 (−6.63), planform centroid 24.22 in
(24.42; also Method 06), nose CP 3.67 in (4.26), CP 32.94 in (33.10), damping ratio 0.138 (0.094), rail exit
speed 43.3 ft/s (46.6). The end card's static second figure is 0.73 (was 0.72). All SIM.

### Owner flags
- New flag `vx-loop`, on Run 03's lead, Method 06 (two places) and Method 03 (one phrase): "The page said the
  finless rocket loops. The current flight model has it pitch over and arc away downwind, to about 306 ft (the
  path sketch on Run 03). Approve this wording or reword it."
- `vx-mass` now also covers Method 05's "(2.2 lb)". `vx-length` and `vx-authorship` stand.

### Visible changes without new words (for the owner to see)
- The title plate is sized by the view's height as well as its width and keeps to the left half of the view
  (1280 x 720: below the header; 1040 x 800: clear of the rocket); its eyebrow goes on desktops under 780 px
  tall. On the desktop front door the flow lines and the gust pill step aside while the plate is up, as on
  phones (DISARM stays in the panel's CONFIGURE).
- Phones: the slice fades out under the title plate and the rocket is framed farther out and higher (the
  scene's aim limit keeps its fins at the eyebrow's line); the plate's shade is solid from above the eyebrow.
  The header's two links have a visible gap (CASE STUDY, SITE).
- Line breaks fall between the eyebrow's, the byline's and the footer's segments, never inside a name, an
  award or a number and its unit; separators stay with the segment before them.
- The end card is compact from 1200 px down (was from 860 px), its two figures share a bottom line, and on
  screens 420 px tall or less it drops its eyebrow.
- The lede figure sits in the right column beside the technical sentence from 860 px up; its caption is as
  wide as the drawing.
- Method and Configuration headings are one size down (display 3), so the appendix reads as one part.
- Short screens (500 px tall or less) keep the plate's sentence, one size down.
- The lab index no longer lists 06 Validation (vx/lab/index.html), so no public link reaches the bench pages
  before they wear the lab chrome (plan, do-not list); an HTML comment in the list says when it returns.
- vx/og-field.png is recaptured with the plate as it is now.

## Fix phase, scene (review findings): vx/js/scene/markers.js, vx/js/scene/scene.js, vx/lab/scene.html

Where: the 3D stage's plates (canvas sprites, mono caps) and the stage canvas's accessible name. One new phrase
and one new tag clause; everything else is moved, not reworded. No owner flags were needed.

### The CP plate while the push is drawn elsewhere (markers.js `CP_APART_WORDS`)
- New second line on the CP dot's plate, at paper-a70: `AT SMALL ANGLES`, so the plate reads
  `CP / AIR'S PUSH` over `AT SMALL ANGLES`. It shows only while the normal force arrow lands 28 px or more from
  the CP dot on screen. On the page that is the finless runs (WITHOUT FINS, Run 03), from about T+0.36 s; the
  finned default never shows it (the two stations stay within 20 px at 1440 x 900 and 18 px at 390 x 844).
  Why: the dot is the static Barrowman CP, where the air's push acts at small angles; at large angles the push
  acts further aft (the arrow), and the plate used to point at the dot while the push was drawn near the CG.
- Moved, not reworded: in that case `N +21.20 LBF SIM` (the live figure) leaves the CP plate and sits on its own
  plate at the arrow's tail, with a 1 px leader to the arrow when the plate has to stand off. When the two
  stations are close it rides on the CP plate as before.

### The stage canvas's accessible name (scene.js, read by screen readers, at most once a second)
- In flight it now ends its figures with the tag: "CHARGER field scene, side camera. Phase boost, altitude 153
  ft, pitch 55.8 deg, angle of attack 31.4 deg, all SIM. Drag the rocket, or focus here and press the left or
  right arrow key, to flick it." New: ", all SIM". A pitch or angle that rounds to zero now reads 0.0, not -0.0.
  The end plate's name is unchanged (it already said ft SIM).

### The scene lab (vx/lab/scene.html, bench strings)
- New readout line, `n figure`: `on the CP plate`, `at the arrow's tail` or `off`, then `stations 91 px apart`
  (or `n/a` while no arrow is drawn).

### Visible changes without new words (for the owner to see)
- In the finless runs the N figure now stands at the tail of the orange arrow instead of under the CP words at
  the nose.

## Final integration (validation outcome, CG decision, gate fixes): vx/index.html, vx/js/story.js, vx/js/main.js, vx/js/panel/panel.js, vx/js/panel/controls.js, vx/js/scene/markers.js, vx/README.md, vx/lab/index.html, vx/lab/validation/*.html, vx/lab/lattice.html, vx/lab/geom.html, vx/js/lattice/lattice-lab.js

Every entry below is new or rewritten owner-facing copy, or a visible change listed so nothing changes unseen.
Every number keeps its tag. The CG decision is the orchestrator's; the owner question is flag `vx-cg`.

### The CG (orchestrator decision; flag vx-cg, two marks)
- Visible change: the page now flies the CAD estimate of the CG, 27.17 in from the nose (EST, flight.js
  CG_ESTIMATE_CAD), not the case study's 22 in. Every dependent number follows: margin 2.16 cal (was 4.09),
  burnout 2.53, frequency at 98 ft/s 0.69 Hz (0.92), damping ratio 0.165 (0.138), burnout CG 26.17 in,
  inertia 0.119 kg m², default launch 1030 ft and 0.59 s straight again (1027 ft, 0.73 s), peak 8.01° (7.61°),
  no fins 212 ft (295 ft), half fins margin −2.41 / −2.03 cal (−0.48 / +0.02), no fins −8.78 cal (−6.85).
  The panel's CG slider starts at 27.2 and its tag reads EST 27.2 (was PAGE 22.0).
- Runs intro (index.html, #runs): "CG 27.17 in, the CAD estimate (Method 05) EST, rail 72 in EST, ..." (was
  "CG 22 in PAGE").
- Method 05 opening: "The case study and the CAD assembly agree on four trapezoidal fins, a body 2.68 in
  across, the fin root chord (2.76 in) and sweep (2.17 in) PAGE; ... Shape and dimensions here come from the
  CAD and the mass from the page (2.2 lb) PAGE. Four differences remain." (the CG left the agreement list;
  was "Three differences remain").
- Method 05, new bullet: "CG. The case study gives 22 in from the nose for its 37 in design PAGE. Every
  part-wise estimate of the CAD airframe at the page mass puts it at 27.09 to 27.24 in EST, and this page
  flies 27.17 in EST. The shape here is the CAD's, and the 22 in CG belongs to the 37 in design, so the CG is
  the CAD's estimate too. [flag vx-cg] Until CHARGER's CG is measured, this page flies the estimate; the
  panel's CG slider moves it."
- Method 05, Stability margin bullet: "At the CG estimate the margin is 2.16 cal SIM, 2.01 to 2.47 cal over
  the estimate's density scenarios SIM; at the case study's 22 in it would be 4.09 cal SIM. The case study
  gives 1.80 cal at 22 in for its 37 in airframe PAGE; that is the case study's figure, not a result of this
  study."
- Configuration, case study group, new row: "CG from the nose | 22 in | PAGE | for the 37 in design; this
  page flies the CAD estimate (Mass and motor)".
- Configuration, Mass and motor: "CG from the nose at liftoff | 27.17 in | EST | part-wise estimate of the
  CAD airframe at the page mass, 27.09 to 27.24 in; the panel's CG slider starts here. [flag vx-cg] The case
  study's 22 in belongs to its 37 in design." (was "22.00 in | PAGE | the panel's CG slider starts here").
- Configuration, Static margin at liftoff note: "at the CG estimate; 2.01 to 2.47 over its spread SIM, 4.09
  at the case study's 22 in" (was "at the page CG").
- Glossary, Center of gravity: "The balance point. This page puts CHARGER's 27.2 in from the nose at liftoff,
  an estimate from the CAD EST; the case study gives 22 in for its 37 in design PAGE. The point moves forward
  as the motor burns SIM." (was "CHARGER balances 22 in from the nose at liftoff PAGE").

### What the runs now show at that CG (the model's behavior changed; owner to approve)
- Run 02 lead: "Watch too little fin: at this CG the margin stays negative through the burn, and the rocket
  tumbles." (was "Watch too little fin at first, then enough: the burn moves the balance point forward, and
  by T+1.16 s SIM the fins win." At 27.17 in the half-fin rocket is unstable at liftoff and at burnout and
  tumbles, apogee 265 ft SIM.)
- Run 02 card: the row "Under 2° AOA, after rail exit" became "Pitch past 60° T+1.09 s SIM" (a tumbling
  rocket has no settle time); the note: "Negative margin at liftoff and at burnout. The body lift acts ahead
  of this CG as well (Method 06), so nothing turns the nose back." (was the 5.1° lift-turn and the T+1.16 s
  margin crossing, both gone at this CG).
- Run 03 lead (flag vx-loop, note rewritten): "The nose falls away from the wind, and the rocket tumbles end
  over end." (was "... pitches over and arcs away downwind"). The vx-loop note now says: at the CAD CG the
  model has it tumble, to about 220 ft; at the case study's 22 in it pitched over and arced away.
- Method 03, last paragraph (flag vx-loop): "as the finless rocket tumbles" (was "pitches over").
- Method 06, half fins: "...; the CG moves forward as the propellant burns, but the margin is still −2.03 cal
  at burnout, and the rocket tumbles SIM." (was "...and the margin is +0.02 cal at burnout").
- Method 06, no fins: "Without fins the margin is −8.78 cal SIM. Body lift acts at the planform centroid,
  24.22 in from the nose SIM, ahead of the 27.17 in CG as well, so nothing turns the nose back: [flag vx-loop]
  the rocket tumbles end over end, to an apogee near 220 ft SIM. At the case study's 22 in CG the centroid
  sat behind the CG, and the finless airframe settled at 20 to 30° and arced over instead SIM, so which of
  the two CHARGER would do depends on its CG (Method 05)." (was "The rocket does not tumble end over end: it
  pitches over and arcs away downwind. Body lift ... behind the 22 in CG ...").
- Narration (story.js): after a rocket turned over, the caption keeps "Past 60° at T+n s SIM" to apogee; it
  no longer changes to "Coasting up" when a tumbling rocket passes under 2° on a turn.

### The lattice is no longer called a cross-check
- Appendix, limit 3, last sentence: "So the lattice shows the air; it does not check the flight model, which
  flies the rocket." (was "So the lattice is a cross-check, and the flight model flies the rocket.").
- Method intro: "Two models, two jobs. The flight model flies the rocket. The lattice shows the air; its
  forces belong to a 2D section and are not comparable with the rocket's (Method 03). Every number carries
  its source." (was "... measures the force on the section as a cross-check.").
- Method 02, last paragraph: "Force and moment on the section come from momentum exchange at the wall links.
  They describe a 2D section, not the rocket (Method 03), so the panel shows them only on the lab view of this
  page (?lab), as means over one pass of the air along the body, labeled 2D SECTION ONLY / NOT COMPARABLE.
  The flight model flies the rocket. A lab toggle hands the pitching moment to the lattice instead; it shows
  what a 2D section would do and is not quantitative." (was "The panel prints the lattice's center of
  pressure and moment coefficient next to Barrowman's. They are a cross-check, not an input: ...").
- Method 02, How the solver stays stable, last sentence replaced: "The section's forces count as developed
  once those steps are over, the inflow has reached the flight's angle and the air has traveled 1.5 body
  lengths since the last reset, about 10,100 steps at tier 1 at 0.05 lattice units SIM; until then the lab's
  lattice readouts show a dash. At the 0.05 cap the cells along the walls run at 10 to 25 percent more than
  the set viscosity, an effective Reynolds number of 1,200 to 1,360 SIM." (was "Until those first steps are
  over and the inflow has reached the flight's angle, the panel's lattice readouts show a dash.").
- Method 03, What the section's numbers mean, rewritten from the validation (L1, L2, L3): "So the lattice's
  center of pressure and moment coefficient are 2D section values. In 2D the long body lifts like a wing ...
  STD. Measured on both page grids at 2 to 15°, the section's center of pressure sat 15 to 18 in from the
  nose, ahead of the CG, where Barrowman puts it at 29 to 33 in (32.94 in at small angles) SIM. A finer grid
  or a taller domain did not move it, and neither a slender-body nor a finite-wing correction closed the gap
  SIM. Taken as a 3D coefficient, the section's normal force was 16 to 35 times Barrowman's, and the page's
  domain, 0.47 rocket lengths tall, raised it about 1.7 times against a domain 3.2 times taller SIM. The
  section's pitch damping has the right sign, but at 1,380 to 2,010 against Barrowman's 445 it is not the
  rocket's; a pitching flat plate in the same body frame got 0.38 of its lift slope per unit of pitch rate,
  where theory gives 0.5 SIM. One cell inside the inflow edge the air arrives at 97.9 and 96.3 percent of the
  inflow speed at 5 and 10°, so the section's coefficients read about 4 and 8 percent low SIM. Single
  readings scatter by about 22 percent in C_n and 66 percent in C_m, so the lab rows show means over one pass
  of the air along the body SIM. The lab's lattice C_m is taken about the live CG ... The lattice CP shows a
  dash below 1° ... The lab toggle that lets the lattice moment fly the rocket therefore makes it diverge; it
  shows what a 2D section would do, not what CHARGER does." (the pre-fix 0.10 measurements, C_n 17 to 32, the
  CP swinging 9 to 21 in and "21.6 in at that instant" are gone).
- Glossary, Lattice Boltzmann section: "... Here it is a flat 2D slice through the rocket, shown for the
  picture, not used to fly it. Its forces are a 2D section's and do not check the flight model (Method 03)."
  (was "shown for the picture and as a cross-check, not used to fly it. A flat slice exaggerates some
  forces").
- Panel (?lab only now): rows "CP / 2D SECTION ONLY / NOT COMPARABLE" and "CM / 2D SECTION ONLY / NOT
  COMPARABLE" (were "CP / LATTICE 2D", "CM / LATTICE 2D", shown to everyone), reading the engine's developed
  chord-pass mean; the bar's key "CP / 2D SECTION ONLY" (was "CP / LATTICE 2D"). The LATTICE FLIES IT note
  while off: "NOT QUANTITATIVE / A 2D SECTION'S MOMENT, NOT CHARGER'S"; its accessible name "Lattice flies it
  (lab, not quantitative): the 2D section's moment replaces Barrowman's".
- Stage, ?lab only (markers.js): the lattice CP ring's plate reads "CP / 2D SECTION ONLY" over "NOT
  COMPARABLE" over the value (was "CP 2D SECTION").

### Method 07, Checks (the page-ready paragraph from the validation, adjusted to the CG decision)
- Replaces the gate paragraph: "Both models were checked against published references, closed forms and an
  independent code (lab: Validation). The flight model's Barrowman terms matched the 1966 equations to 1e-6
  SIM and Centuri's JAVELIN worked example to 0.12 percent SIM. RocketPy 1.13.0, a six-degree-of-freedom code
  flown with the same inputs at the case study's 22 in CG, landed within 0.006 percent of the apogee SIM and
  within 0.02° of the weathercock angle in a crosswind of 10 mph EST SIM. That checks the arithmetic, not the
  inputs: the CG this page flies is a part-wise estimate of the CAD airframe, 27.17 in EST, not a
  measurement, and the drag coefficient is fitted to a simulated apogee, not to flight data. The lattice
  reproduced channel flow at second order in the grid spacing SIM. With domain and grid effects removed, a
  cylinder at a Reynolds number of 100 STD gave a drag coefficient of 1.318 and a Strouhal number of 0.161
  SIM, against 1.320 and 0.165 in published 2D results (Parvar et al. 2023, Table 1) STD. The gate, a cylinder
  24 cells across placed 16 diameters behind the inflow edge of a 768 × 192 grid EST, read 1.369 and 0.164
  once its shedding had saturated SIM; in the original 512 × 192 layout, 5.3 diameters behind the edge, it
  read 1.473 and 0.172, 11.6 and 4.2 percent high SIM. The side edges are open, so blockage corrections do
  not apply, and the staircase walls leave a grid error of several percent on a body 16 to 39 cells across
  SIM. The rocket's section did not agree with Barrowman: its center of pressure sat 15 to 18 in from the nose
  SIM, ahead of the CG, where Barrowman puts it at 29 to 33 in SIM, and no standard 3D correction closed the
  gap. So the section shows the air, and its forces are not a check on the flight model. The runs used
  software rendering (SwiftShader) and float32 CPU copies of the lattice step, so their speeds say nothing
  about a graphics card." (The validation's draft said "the 22 in CG comes from the 37 in design PAGE ...
  would cut the margin from 4.09 cal to about 2.2 cal"; with the CG decision the page flies the estimate, so
  the sentence names what the page flies instead.)
- New paragraph: "Validation. The validation lab lists all 351 cases, each with its reference and source,
  the error, the tolerance set before the run and the result: 230 passed, 91 failed and 30 were
  informational. The 105 cases measured again after the fixes count at their new result; the rest are from
  before the fixes. Most of the fails are in the lattice tracks: the cylinder at the page's own grid and
  domain, and the rocket's 2D section against the 3D rocket." Links: lab/validation.html (twice).

### Method 01 and the Configuration limits (from the validation's list of limits the page must state)
- Method 01: "Pitch damping sums C_Nα (x − x_cg)² over the nose and the fins (Mandell, Caporaso and Bengen,
  Topics in Advanced Model Rocketry) and adds jet damping from the motor's mass flow with the variable-mass
  term (Thomson 1961) STD. The fin slope is incompressible; at the peak Mach number of 0.26 the compressible
  form gives 1.3 percent more SIM." and, after the drag fit: "That apogee was simulated for the 37 in design,
  and there is no flight data, so the absolute apogee is not known; a component drag estimate for the CAD
  airframe gives 0.44 to 0.66 and 1,027 to 1,159 ft SIM. Apogee moves about 4.2 percent for 3 percent of motor
  impulse, 5.6 percent for 5 percent of mass and 3.2 percent for 10 percent of the drag coefficient SIM."
- Configuration notes: Pitch inertia "...; a part-wise CAD estimate at the same mass and CG is 17 to 26
  percent lower, so the pitch frequency may read 7 to 11 percent low"; Drag coefficient "...; a component
  estimate for the CAD airframe gives 0.44 to 0.66 SIM; there is no flight data"; Pitch natural frequency
  "two-degree-of-freedom short period (pitch with the turning of the flight path), liftoff mass" (was
  "linearized pitch equation, liftoff mass"); Damping ratio "two-degree-of-freedom short period, within 0.1
  percent of the simulated decay at constant speed in the validation; the one-degree-of-freedom form
  (Mandell) leaves out the path's turning and reads lower" (was empty); Rail exit speed "forward button at the
  rail top, with the CAD's rail buttons, 24.59 and 41.94 in from the nose CAD; the case study's stations
  would give 46.4 ft/s" (46.4 computed, SIM row); Air density "...; the ISA's fall with height would add 0.38
  percent, 3.9 ft, to the apogee SIM".
- Static fallbacks refreshed by the bake (values, JS off): run cards, lede figure (1030 / 212 ft), sketches,
  configuration values and, new in the bake, the end card's two figures (1030, 0.59).

### Gate fixes (wording-neutral unless quoted)
- Narration honesty (story.js): a caption leaves as soon as its condition stops holding, and the 1.5 s dwell
  runs at the narrated 1/8 (shorter in proportion at a faster picked rate). No new words.
- Reduced motion on a phone: the PREVIOUS BEAT / NEXT BEAT row waits until the title plate has gone (visible
  change; the row comes with the first launch).
- The caption note "NOT TIME-ACCURATE" no longer breaks at its hyphen on a phone (no new words).
- Flight lab: the CP(ALPHA) label stays inside the canvas at 390 px (no new words).
- US spelling and dashes (lab UI strings): lattice lab "Regularized collision", "regularized outflow edge",
  "Inflow at neighbor density", "pressurize", "pressurizes", "1 to 4" (was "1 – 4"); readout lines
  "REGULARIZED", "STABILIZE", "NEIGHBOR"; no-value placeholders "--" (were en dashes); geometry lab "cell
  centers" (twice).

### Labs
- The three validation bench pages wear the lab chrome: header "LAB / 06 / VALIDATION / L1" (L2, L3) with
  Validation, All labs, Field study; display titles "Analytic checks", "Cylinder", "Lift and moving walls";
  summaries: L1 "This bench checks the lattice against flows with exact answers: flow in a straight channel,
  the viscosity the relaxation time sets, the error that grows with speed and the force on a square. One case
  runs from the address bar, and its result prints below." L2 "This bench checks the lattice against flow
  past a circular cylinder: published drag, lift, shedding frequency and the length of the wake bubble. One
  case runs from the address bar, and its result prints below." L3 "This bench checks moving walls and
  lifting surfaces: the lift of a spinning cylinder, a flat plate at an angle and the CHARGER section. One
  schedule runs from the address bar, and its force trace prints below." Skip link "Skip to the bench". L1's
  separate "All labs" line went into the header.
- Lab index, 06 Validation re-listed (the do-not list's condition, the lab chrome on the bench pages, now
  holds): "Both models checked against published references, closed forms and an independent code: every case
  with its reference and source, the error, the tolerance set before the run and the result, the measured
  limits and the open defects. The three lattice bench pages it links run one case each."

### README (vx/README.md)
- New sections "The CG" and "Validation" (what was checked, the counts, what the fixes changed, the limits in
  short, how to run the lab and the tests); the Flight and Lattice bullets, the appendix line, the source-tags
  paragraph, the lattice slot and the `?lab` row rewritten to match the page. No "cross-check" remains.
- Flag notes (owner questions, not public copy): vx-cg "Which CG should this page fly? It now flies the CAD
  estimate, 27.17 in from the nose (27.09 to 27.24 in at 2.2 lb), because the case study's 22 in belongs to
  the 37 in design. A CG measured on the built rocket, motor loaded, would replace it." vx-loop (rewritten)
  "The page said the finless rocket loops. At the CAD CG estimate (27.17 in) the current flight model has it
  tumble end over end, to about 220 ft (the path sketch on Run 03); at the case study's 22 in CG it pitched
  over and arced away downwind. Approve this wording or reword it."
