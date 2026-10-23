# Presentation review: brand lens

Reviewer: design director who knows merttureli.com. Page: /home/user/merttureli-site/vx/index.html
(HEAD b138408, read-only). Looked at in Playwright (SwiftShader, `?tier=1`), with clarity.ms, bing.com,
workers.dev and formspree.io blocked and every POST aborted. 1440x900 and 390x844. States: cold load,
autolaunch at speed 1, Run 01 from its card, `?hold=15&view=pressure` plus smoke and vorticity at the
same hold, quarter camera, no WebGL, reduced motion, phone sheet open and closed, every reading section,
the lab index and four labs, and for comparison the live home page and projects/charger.html.
Screenshots sit in `reports/present/brand/` next to this file (names below). Scripts:
`scratchpad/brand-scripts/`.

## Verdict in one paragraph

The page is honest, careful and well built, and below the stage it already looks like his site at its
best: `WHAT THE FINS DO` at 166 px over 10 px mono eyebrows, the hairline method list, the source tags
in hairline boxes, the run cards. The first screen does not. Measured at 1440x900 it holds 110 visible
text nodes, every one IBM Plex Mono, 86 at 10 px, 23 at 11 px, one at 36 px (the time code); no Space
Grotesk at all, so the site's signature contrast (184 px against 10 px) is missing exactly where a
visitor decides. It also carries 18 `SIM` tags in the DOM plus 7 more on the stage labels, about 25 in
one screen, and an empty chart grid. Next to the live home page (`cmp-site-vs-vx.png`: display name,
one sentence, the rocket in a soft radial light) it reads as an instrument dump by nobody. The fix is
not more engineering. It is hierarchy. Put the display type on the stage before launch and after it,
let the stage name things and the panel measure them, give the numbers the case study's big-figure
treatment, and make the single orange accent mean one thing.

## What already works (keep)

- The reading sections. `d10-study.png`, `d11-method.png`, `d15-runs.png`: display headings, mono
  eyebrows `01 / METHOD`, hairlines at 12 percent ink, 62ch measure, the tag legend. This is his
  design system, executed well.
- The source tags as hairline boxes (`.tag`). They read as an engineer's annotation, not decoration.
- The no-WebGL 2D view (`d7-nogl.png`). A drawing plate with two marks, `CG 22.00 IN` and
  `CP 33.10 IN`, an altitude tape and a hatched ground. It is calmer and clearer than the 3D stage's
  labels, and a good model for them.
- The vorticity view at a hold (`d4-hold15-vorticity.png`, middle of `cmp-views-hold15.png`): black
  field, orange only along the windward walls of the nose and fins. That is the colour rule working:
  the accent sits exactly where the physics is.
- The phone sheet mechanics and its four-cell peek row (`p-sheet.png`).

## What does not (by the lens's questions)

1. Hierarchy, display against 10 px mono. Absent on the first screen at both widths (`d02-cold-12s.png`,
   `p01-cold.png`). The h1 is the 11 px header strip `CHARGER / FIELD STUDY 01 / PITCH PLANE`. The best
   heading on the page, `What the fins do`, is a viewport and a half down.
2. The header strip. Its most prominent slots carry engine state: `GRID 512x160`, `TIER T1 PINNED`,
   `RATE 1/8 AUTO`. The live site's header is the `MERT TURELI` wordmark and four links. Nothing in the
   strip says whose page this is; the name appears only in the footer.
3. Panel density. The desktop rail scrolls 2,254 px (2.6 screens) in a 320 px column
   (`d09-rail-sheet.png`): 19 readout rows, 36 controls, 7 sections. The five named runs, the best
   choices on the page, are not in it; they sit 6,000 px below. The `SRC` column prints `SIM` on 17 of
   19 rows, so the tag stops carrying information.
4. Stage labels repeat the panel. `ALT 0 FT SIM`, `CG 22.0 IN SIM`, `CP 33.1 IN SIM / MARGIN +4.15 CAL
   SIM / N 0.00 LBF SIM`, `REL WIND 0 FT/S SIM / ALPHA 0.0 DEG SIM`, plus `0 FT AGL` on the ladder:
   five boxed labels, seven tags, all duplicated in the rail.
5. Colour discipline. One hue, too many meanings. The livery orange paints the rocket, the Barrowman CP
   dot, the normal-force arrow, the altitude cursor line, the AOA trace, the CP dot in the CP/CG bar,
   the BOOST phase pill, the HOLD badge border, the unstable-margin square, the caption warning square,
   the positive side of the pressure ramp, the vorticity ramp, the wall dye and the plume. In the
   pressure view at 15 degrees (`d4-hold15-pressure-35s.png`) the field floods orange and the orange
   rocket disappears into it. In smoke view the paper rake lines are brighter than the rocket and read
   as a cage around it (`d5-run1-sheet.png`, right of `cmp-views-hold15.png`).
6. Surface. The stage is flat #0A0A0A with a wire grid. The site's hero sits the rocket in
   `radial-gradient(ellipse at 77% 42%, #34383b, #1b1d1f 28%, #0a0a0a 65%)` (css/depth.css:18) with
   grain on plates. vx uses no grain anywhere (`--grain-url` is defined in tokens.css and never used).
7. The chart. On the pad the 152 px dock is an empty grid. After apogee in the default launch the AOA
   trace drops to -180 degrees on a +-2 degree axis (`d2-launch-08.png`), a vertical orange cliff that
   reads as a bug. In still air (the default autolaunch) every frame looks the same: AOA 0.00, pitch
   0.00, the trace a flat line, the rocket centred by the camera (`d2-launch-01..05.png`).
8. The end state. After apogee the stage freezes on `INFLOW HELD AT -35 DEG EST / THE FLIGHT IS PAST
   IT`. No result, no next step.
9. Method as an editorial read. Strong structure, but item 03 `What the section is not` is a 330-word
   block of lattice caveats with numbers in every clause. The caveats must stay; they need a one-line
   plain summary above the detail.
10. The runs. Text-only cards with four mono result rows each. The page flies all five when it loads, so
    the histories exist, but nothing shows the one comparison that matters at a glance (fins: a short
    wobble that settles; no fins: a loop).
11. The lede's right column is a keyboard shortcut table (`L LAUNCH`, `SPACE PAUSE` ...), also on
    phones where it means nothing (`p10-study.png`). That column is where the case study puts its brief:
    Role, Team, Event, Result.
12. The labs. Four header treatments across five pages (`s-labs-sheet.png`): the index and Geometry
    have display headings, Flight and Lattice only a mono line; the labs use orange slider fills where
    the page's panel uses paper. The validation bench pages (`vx/lab/validation/l1.html`,
    `l2-cylinder.html`) are raw: a 12 px h1, `waiting`, no navigation. They are not linked from the lab
    index, which is right until they get the chrome.
13. Does it make him look like a designer and an engineer at once? Below the fold, yes. Above it,
    engineer only.

## Owner question (outside the rules, not a proposal)

The live site no longer uses the faces in the brief. Commit 92af1f3 "Set the site in Archivo and
Martian Mono" moved merttureli.com to Archivo (body, Display at wdth 110, Name at wdth 116) and Martian
Mono; the Studio (`next/css/tokens.css`) uses the same pair and `--signal: #ff4f00` as the rocket's
orange. vx is set in Space Grotesk and IBM Plex Mono with livery #D63B08, as BRIEF.md and
PRESENTATION.md require. Side by side (`cmp-site-vs-vx.png`) vx now looks like the previous version
of his site. Whether vx should follow is the owner's call. If yes, it is mostly vx/css/tokens.css
(font-face and the two family tokens; FIELD.md says not to edit that file, so that rule would need
lifting too) plus the livery lettering wait in vx/js/scene/scene.js:659. Nothing below depends on it.

## Copy notes for the owner (not changed; CLAUDE.md rule 2)

- UK spellings in visible copy, where CLAUDE.md asks for US: `centre` six times in vx/index.html (lede,
  Method 01, 02, 03), `regularised` once (Method 02). `check-writing.py vx/index.html` reports clean, so
  the checker does not catch these.
- No first person anywhere on the page. The site's voice is "I design and build hardware"; the case
  study says "I founded it". The lede says "This page launches it again". If the owner wants one line of
  his own, the published facts are Role: Captain and chief engineer (projects/charger.html).

## Proposals, ranked by impact per effort

1. Title plate on the stage before launch, result plate after it (M).
   What: before launch, `WHAT THE FINS DO` at `--fs-display-1` sits bottom left over the stage with the
   existing eyebrow `FIELD STUDY 01 / CHARGER / UNION COLLEGE ROCKET TEAM / 2026` above it and the
   LAUNCH pill under it, as the home page sets `MERT TURELI` beside the rocket. It fades on LAUNCH, a run
   button or the first drag (480 ms, the site easing). At apogee plus 2 s a result plate takes its place:
   two figures from the flight's own events in display size with their tags (for example `1028 FT` SIM
   apogee and `0.22 S` SIM back under 2 degrees, labels reused from the run cards), and two pills, REPLAY
   and NEXT RUN. Make this the page's h1 and turn the header line into a paragraph. The plate frame,
   captured once, becomes the share image (vx/og-field.png in place of the generic og-cover.png).
   Why: restores the 184 px against 10 px contrast on the first screen, says in three words what the
   page is about, and gives the run an ending.
   Where: vx/index.html (stage markup, h1), vx/css/field.css (.fd-plate), vx/js/main.js (show and hide
   on flight:event and flight:reset).
   Risk: honesty none (existing copy, SIM figures with tags). Perf none. Reduced motion: no fade, the
   plate shows and hides. No WebGL: the plate overlays the 2D view the same way. Phone: 64 px fits
   `WHAT THE / FINS DO` in 358 px (it already does in the lede).
   Verify: harness at both viewports, reduced and --no-gl; screenshots cold and at apogee; the audit
   script (`brand-scripts/s10-audit.cjs`) shows at least one Space Grotesk node of 64 px or more on the
   first screen; one h1 on the page.

2. The stage names things, the panel measures them; source tags per group (S to M).
   What: stage labels keep the marks and a word (`CG`, `CP`, the wind arrow with `AIR` and alpha);
   numbers live in the rail, as the 2D view already does. In the rail, each section header carries its
   tag (`FLIGHT / SIM`) and a row prints its own tag only when it differs (PAGE, CAD, EST, FIT, STD);
   the full per-row tag stays in the accessible name. The bottom-left caption keeps the view and the
   NOT TIME-ACCURATE caveat and drops the instruction line after the first interaction.
   Why: about 25 `SIM` tags on the first screen become about 5; the eye finds the rocket and the one
   number that moves. This is the difference between an instrument and an instrument dump.
   Where: vx/js/scene/markers.js (label builders at lines 450 to 458), vx/js/panel/panel.js (row
   template), vx/css/panel.css (.pn-r grid drops to three columns when the tag is inherited).
   Risk: honesty low but real: every number still has a tag, inherited from its group header. Needs the
   owner's nod (and the content lens) that an inherited tag satisfies the rule. Perf none.
   Verify: audit script counts `SIM` in the first viewport (target 6 or fewer); the axe or a11y pass
   reads each row with its tag; screenshot at T+1 s of Run 01.

3. Lede in the case study's language: the brief and a band of big figures (S).
   What: replace the keyboard table in the lede's right column with the case study's brief rows in the
   same mono spec style: Role / Captain and chief engineer PAGE, Team, Event, Result / First place PAGE,
   and a link to the CHARGER case study. Under the lede, a black band with three or four display figures
   and mono captions, exactly the band on projects/charger.html (`1st / 1.80 cal / 13.8 ft/s / $716`):
   for example `1st` PAGE (Deployable Sensor Payload event), `+4.15 cal` SIM (static margin at liftoff,
   CAD airframe at the page CG), `0.22 s` SIM (back under 2 degrees after rail exit, full fins, 5 mph),
   `342 ft` SIM (apogee without fins, against 1028 ft with them). The keys stay in the panel's Keys
   section and are hidden on touch devices.
   Why: puts Mert on his own page in his site's established form, and shows the study's result in the
   one typographic gesture his site uses for numbers.
   Where: vx/index.html (.fd-lede-grid aside, new .fd-figs band), vx/css/field.css; values come from
   the run results main.js already computes at load.
   Risk: honesty: figures keep their tags and captions; never set 4.15 next to 1.80 as a comparison
   (Method 05 says why). Copy: the brief rows are verbatim published facts, but per CLAUDE.md rule 2 the
   owner approves them. Perf none.
   Verify: `python3 check-writing.py vx/index.html`; screenshots at both widths; numbers match the run
   cards after load.

4. The header strip becomes his header (S).
   What: left, the `MERT TURELI` wordmark linking to / (the site's header treatment) then
   `/ CHARGER FIELD STUDY 01`; right, the time code and RUNS, LAB, SITE. GRID, TIER and RATE move out:
   the panel's lattice line and rate control already show them.
   Why: whose page this is, answered in the first line; the top bar stops reporting engine state.
   Where: vx/index.html (.fd-head), vx/css/field.css, vx/js/main.js (head writer: drop grid, tier, rate
   keys or point them at the panel).
   Risk: none. Verify: screenshots at 1440, 1040, 390 and 320; the harness overflow check.

5. The site's light and grain on the stage (S).
   What: behind the rocket at the pad, the home hero's radial light (css/depth.css:18 values) as a
   pseudo-element under the canvas (renderer cleared transparent) or as a soft additive quad; grain
   (`assets/grain.svg`) at the 14 percent strength over the stage only, never over the rail or the
   reading sections.
   Why: the stage reads as his hero, not a void, and the rocket gains depth without a single new mark.
   Where: vx/css/field.css (.fd-viewport::before and ::after), vx/js/scene/scene.js:167 and :210
   (clear alpha) if the gradient sits under the canvas.
   Risk: perf: a blended overlay over a WebGL canvas costs compositing; use a static tile without
   mix-blend at tiers 0 and 1. Contrast: 10 px labels keep their ink plates.
   Verify: harness frame times at tier 3 and tier 1 before and after; screenshots cold and in flight.

6. One meaning for orange: the force that turns the rocket (M).
   What: orange stays on the rocket's paint and on what turns it: the CP dot, the normal-force arrow, the
   AOA trace, the unstable-margin square. Remove it from the altitude cursor line, the BOOST pill and the
   HOLD badge (paper instead). Re-ramp pressure as a paper and ink diverging ramp with orange reserved for
   the strongest positive pressure, so it lands on the windward fin faces and the nose and nowhere else
   (the vorticity view already behaves this way). Smoke rake lines at paper-a45 and thinner, so the flow
   reads as air.
   Why: the one accent becomes legible: where orange appears, something is pushing. In the pressure view
   the rocket stops drowning.
   Where: vx/js/lattice/shaders.js (composite pass, ramps at lines 372 to 381), vx/js/scene/scene.js:285
   (cursorMat), vx/css/panel.css (.pn[data-phase="boost"] .pn-phase), vx/css/field.css
   (.fd-badge[data-badge-hold]).
   Risk: honesty: the ramp must be stated in the caption or legend (ramp and range). Perf none.
   Verify: `?hold=15&view=pressure&tier=1` and smoke and vorticity at the same hold, before and after;
   forced-colors pass unchanged.

7. Runs as small multiples (M).
   What: each run card gets a small whole-flight plot of angle of attack (and pitch) against time, the
   flight lab's whole-flight chart style (`s06-lab-flight.png`), on shared axes across the five cards:
   full fins a damped wobble, half fins a longer one, no fins the loop, crosswind the weathercock, gust a
   single damped swing. Event ticks for rail exit, burnout and apogee. Optional second line: altitude
   against range.
   Why: one glance carries the page's claim, and it is the object that shows the designer and the
   engineer at once. It is also what a visitor would screenshot and forward.
   Where: vx/js/main.js (the run histories it already flies at load), vx/index.html (.fd-run figure
   slot), vx/css/field.css; draw with the panel's chart primitives or inline SVG.
   Risk: honesty none (SIM, labelled axes with units, same model as the stage). Perf small: five paths
   drawn once. Reduced motion and no WebGL: static, unaffected. Phone: full width per card.
   Verify: screenshots of the Runs section at 1440, 1280 (three across) and 390; plotted peaks match
   the cards' `Peak AOA` values.

8. The panel in two levels (M).
   What: top of the rail: playback, the five runs as a segmented row (`01 FULL / 02 HALF / 03 NONE /
   04 WIND / 05 GUST`), and four readouts set large (time code, altitude, angle of attack, static
   margin). Below, collapsed by default: All readouts (the 19 rows), Configure (sliders, gust, flick
   steps), View (field, section, camera, markers), Keys. The phone sheet follows the same order.
   Why: the rail fits one screen instead of 2.6; the first choices have names instead of sliders.
   Where: vx/js/panel/panel.js, vx/js/panel/controls.js, vx/css/panel.css; main.js exposes the run
   presets it already has.
   Risk: none to honesty; keyboard trail and the 1 Hz live-region rule unchanged. Perf none.
   Verify: rail scrollHeight at 1440x900 under 900 px collapsed; keyboard reaches every control; phone
   sheet screenshots open and closed.

9. The chart: a ghost on the pad, an end at apogee (S).
   What: on the pad, the dock shows the last run's trace dimmed (or Run 01's precomputed trace), so the
   first screen has no empty grid. Stop the AOA trace at apogee (recovery is out of scope, FIELD.md 3),
   marked `APOGEE / DESCENT NOT PLOTTED`.
   Why: removes the dead 152 px band and the -180 degree cliff that reads as a bug.
   Where: vx/js/panel/chart.js.
   Risk: honesty: say on the chart that descent is not plotted. Perf none.
   Verify: cold screenshot; `?autolaunch=1&speed=1` screenshot at T+10 s.

10. One appendix chrome for the labs (M).
    What: every lab page gets the lab index's header (`LAB / 0N / NAME`, FIELD STUDY, SITE), a display
    h1 like the Geometry lab's, and the panel's paper slider fills instead of orange. The validation
    bench pages stay unlinked until they wear the same chrome and a two-line plain summary of what they
    check.
    Why: the labs are the proof behind the page; they should read as a credible appendix, not five
    separate tools.
    Where: vx/lab/*.html, a shared vx/css/lab.css (helper file under the lab prefix).
    Risk: none. Verify: harness on each lab at both viewports and --no-gl.

## Cut or hide

- The keyboard shortcut table in the lede (the panel's Keys section has it); never on touch devices.
- GRID, TIER and RATE in the header strip (the panel already shows them).
- The repeated SIM on every panel row and stage label inside an all-SIM group.
- Numbers on the stage labels that repeat the rail: ALT box, MARGIN, N, REL WIND speed.
- The ALT box and the `0 FT AGL` ladder label saying the same thing twice.
- The empty strip-chart grid on the pad.
- The angle-of-attack trace after apogee (the -180 degree cliff).
- Orange on the altitude cursor line, the BOOST pill and the HOLD badge border.
- The instruction line in the stage caption after the first interaction (the caveat line stays).
- The `Live / pending` and `CAD measurement / baked copy` rows in the Configuration table: page state,
  not configuration.
- Flick step, FLICK - and FLICK + from the default rail: move them under Configure (they remain the
  keyboard alternative to dragging).
- Any public link to the validation bench pages until they have the lab chrome.

## Rejected here (brand reasons)

- A second accent colour (an instrument green or amber) for the chart or the readouts: it would split
  the one-accent rule the page and the site depend on.
- Display type inside the rail (for example the time code in Space Grotesk): the rail is the measured
  voice; mono stays.
- Grain over the panel or the reading sections: the system puts grain on photography, plates and
  gradients, never on plain paper or text.
- Rounder, glassier panels: glass blur is for photography only in his system.

## Screenshot index (reports/present/brand/)

- First screen: d01-cold-2s.png, d02-cold-12s.png, d8-reduced.png, d7-nogl.png, cmp-site-vs-vx.png
- Launch, still air at speed 1: d2-launch-00..15.png (08 shows the -180 degree cliff)
- Run 01 at the default rate: d5-run1-00..13.png, d5-run1-sheet.png
- Hold at 15 degrees: d4-hold15-pressure-8s/20s/35s.png, d4-hold15-smoke.png, d4-hold15-vorticity.png,
  cmp-views-hold15.png; quarter camera d6-quarter-vort.png, d6-quarter-smoke.png
- Rail: d09-rail-sheet.png
- Reading sections, desktop: d10-study.png to d17-footer.png; phone: p10 to p17, p-sections-sheet.png
- Phone stage and sheet: p01-cold.png, p02-sheet-open.png, p03-sheet-open-scrolled.png,
  p05-run1-b.png, p06-hold15-pressure.png, p-sheet.png
- Site for comparison: s01-site-home.png, s01-site-home-b.png, s02-charger-case.png,
  s02-charger-case-b.png (the big-figures band)
- Labs: s03-lab-index.png, s06-lab-flight.png, s04-lab-lattice.png, s08-lab-geom.png,
  s07-lab-val-cyl.png, s-labs-sheet.png
- d03-full.png and d03-part*.png are a full-page capture that the 100svh stage distorts; use the
  per-section shots instead.
