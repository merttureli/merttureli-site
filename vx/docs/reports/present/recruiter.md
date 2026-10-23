# Presentation review: recruiter lens

Page: /home/user/merttureli-site/vx/index.html (CHARGER field study), served from the repo root and opened in
Playwright (SwiftShader, machine load average about 34 on 4 cores during the runs, so frames were slow; I judged
the design, not the frame rate). Read only: nothing in the repo was edited. Third-party hosts blocked in every
context, no POSTs. Zero console errors and zero page errors in every run.

Screenshots: /tmp/claude-0/-home-user-merttureli-site/89c47636-e713-59a0-ab78-6864669d7dfa/scratchpad/reports/present/recruiter/
Scripts: /tmp/claude-0/-home-user-merttureli-site/89c47636-e713-59a0-ab78-6864669d7dfa/scratchpad/recruiter-scripts/

The reader I simulated: a hiring manager or recruiter at a hardware company who got the link from someone else,
decides within 90 seconds whether to call, and will not press more than one button.

## Verdict

The page proves a lot about the engineer and almost nothing about the person. In 90 seconds a recruiter learns
that someone built a careful rocket simulator. They do not learn whose page it is. They do not learn what he did
on the real rocket, and they cannot find a way to contact him. His name appears once, in 10 px mono caps in the
footer: about 10,000 px down at 1440 wide, and on screen 21 of 21 on the phone. His role (captain and chief
engineer) and his founding the team are nowhere. The resume, LinkedIn and email are not linked at all. The one
outbound link that is there (the CHARGER case study) contradicts the study: the study tags "three fins" and
"2.63 in" as PAGE facts, and the case study now says four fins and 2.68 in.

The material for a strong recruiter page is all here. The five runs work as controlled experiments, one variable
each. The no-fins frame (r15-run03-nofins-01-T1.73.png) is the screenshot a hiring manager would forward. The
Method section states its own limits plainly and the Configuration table traces every number to its source; at a
hardware company that habit is the hiring signal. Today it is all in the wrong order, behind the wrong first
impression, with no exit.

## The 90 seconds, measured

| Time | What the recruiter sees (1440 x 900) | What it proves about Mert |
|---|---|---|
| 0 to 3 s | `LOADING THE CAD ASSEMBLY` over an empty rail, wire grid, a 30-row panel of zeros, `GRID LATTICE PENDING / TIER T2 / RATE 1/8 AUTO` in the header (r01-desk-cold-1.5s.png) | Nothing. Not even whose site it is. |
| 3 to 10 s | The orange rocket, small in the frame, with CG, CP, MARGIN and REL WIND plates, every value tagged SIM (r01-desk-cold-4s.png, r01-desk-cold-10s.png) | "Someone built a simulator." |
| 10 to 30 s | They press LAUNCH, the only obvious button. Still air: the rocket goes straight up, angle of attack 0.00 for the whole flight, the chart line stays flat, and after apogee it reads -180.00 deg (r07-launch-00 to -05) | Nothing about fins. The -180 looks like a bug. |
| 30 to 60 s | They scroll. `WHAT THE FINS DO` at display size, then the lede: "CHARGER won the Deployable Sensor Payload event". This is the first achievement on the page, and it gives no role (r02-desk-lede.png). The right column is a keyboard-shortcut table. | The rocket won. Who he was on the team is not said. |
| 60 to 90 s | Method: 1,580 words of Barrowman, D2Q9, Smagorinsky, Latt and Chopard, Guo, Zheng and Shi (r03-desk-method.png). Most recruiters stop here. | Depth, but unreadable to them. |
| never reached | Runs (the best part) start about 7,000 px down; on the phone at screen 17 of 21. The footer with the name and the case study link is the last thing on the page (r05, r06, r13, r14). | |

Page proportions: desktop 10,357 px, of which Method is 3,644 and Configuration 3,323 (67 percent). Phone 17,596
px (20.8 screens). Word counts: lede 119, Method 1,580, Configuration 728, Runs 339.

## Path to the case study, the resume and contact

- Every link on the page: two skip links, `Runs`, `Lab`, `Site` (header), the three section index links, `lattice
  lab`, and in the footer `merttureli.com`, `The CHARGER case study`, `The labs`.
- Resume: none. LinkedIn: none. Email: none. The main site's footer links `Resume (PDF)`. Its contact section
  links Resume, LinkedIn and email, so matching that footer is the site's own convention, not job hunting.
- The header nav gives `Lab` (developer test benches) second place, ahead of the site. To a recruiter that
  reads as internal tooling. There is no case study link in the header.
- Nothing on the main site links to /vx/, so a recruiter only arrives through a shared link, cold. The page has to
  stand alone.

## A credibility defect a careful reader will find

The case study was corrected on 2026-10-21 (commit 9d4b5a7 "CHARGER has four fins, not three"). It now reads "37
inches, single stage, 2.68 inches across, four trapezoidal balsa fins" and lists "maximum diameter 2.68 in"
(content/projects/charger.json lines 46 to 47 and 77 to 80). The field study still says otherwise and tags it
PAGE:

- vx/index.html:156 (Method 05): "The case study describes a 37 in design with three fins".
- vx/index.html:202: the row group "Case study figures, three-fin design review".
- vx/index.html:204: "Maximum diameter 2.63 in PAGE".
- vx/index.html:205: "Fins 3 PAGE".
- vx/index.html:206: "the three-fin figure, not this study's result".
- vx/js/geom/geom.js:59 to 61: PAGE_FIGURES `diameterIn: 2.63, finCount: 3`. The geometry lab prints it
  (vx/lab/geom.html:565, "for the three-fin design").
- vx/README.md:25.

A hiring manager who clicks the page's only outbound project link sees the study misquote his own case study.
The fix also simplifies the story: CAD 2.677 in and page 2.68 in now agree. The fin count agrees too. What is
left to explain is the length (CAD 46.49 in against the page's 37 in), the margin (4.15 cal SIM against
1.80 cal PAGE) and the fin height (CAD span 2.17 in against the page's 2.36 in).

## What a hiring manager would screenshot and forward

- Today, if they find it: the no-fins run pitched over at 65 degrees with `STATIC MARGIN -6.13 CAL` flagged
  (r15-run03-nofins-01-T1.73.png), next to the full-fins run holding straight (r16-run01-full-00-T0.38.png). That
  pair is the page's thesis in one glance. It takes four screens of scrolling and a button to reach.
- The Configuration table, for the habit it shows: every number with PAGE, CAD, EST, FIT, SIM or STD and a
  source. That is design-review discipline, and hardware managers notice it.
- What they would not forward: the cold stage (an instrument with no subject) or the default launch (nothing
  happens).
- The link preview they would forward is generic: og:image is the site's og-cover.png. The og:description says
  "a Barrowman rigid-body flight model and a lattice Boltzmann section". The tab title ends in "VX".

## Showing off against mastery

| Reads as showing off | Reads as mastery |
|---|---|
| Engine state in the header: `BARROWMAN 3-DOF / LBM D2Q9`, `GRID 768x240`, `TIER T2`, `RATE 1/8 AUTO` | Method 03, "What the section is not": the model's limits, stated before anyone asks |
| About 30 readouts, each with its own SIM chip, on the first screen | Method 05 reconciles the CAD against the published figures and refuses to print 1.80 cal as the result |
| `LATTICE PENDING`, `RGBA32F`, `CN ALPHA`, `T1 PINNED` in places a visitor reads | The drag coefficient fitted to the published apogee, with the date of the fit |
| A keyboard-shortcut table in the lede, also on the phone | The cylinder validation against Williamson and Sahin and Owens, with pass ranges, and the result printed |
| Seven references in one Method 02 paragraph about stabilizing the solver | Five runs, one variable changed per run, results printed before anyone launches |
| `Lab` as a primary nav item | "Every SIM number is computed in this tab; nothing leaves it" |

Mastery here means editing. The right column is already on the page. Lead with it and fold the left column away.

## What is missing: one plain paragraph

The page never says, in his voice, what he built and why it matters. A draft built only from published facts
(projects/charger.html: role, founding, payload, telemetry, result, four fins). It passed
`python3 check-writing.py` (scratch copy at recruiter-scripts/copy/draft.html) and needs the owner's approval
under CLAUDE.md rule 2:

> I founded the Union College Rocket Team and led it as captain and chief engineer. CHARGER, the team's 2026
> rocket, dropped a sensor payload at apogee, streamed five channels of telemetry to a handheld ground station,
> and won the Deployable Sensor Payload event at Battle of the Rockets 2026. This page flies it again from the
> CAD, in slow motion, with and without its four fins.

Byline for the header or the stage plate (all PAGE): `MERT TURELI / CAPTAIN AND CHIEF ENGINEER / UNION COLLEGE
ROCKET TEAM / FIRST PLACE, BATTLE OF THE ROCKETS 2026`.

## Owner questions (not proposals; the owner decides)

1. Authorship. The page never says who wrote the flight model and the lattice engine. A recruiter will assume
   Mert did, and an interviewer will ask him to walk through the Smagorinsky term or the momentum-exchange force.
   The page should claim only what he can defend in that conversation. A credit line in his own words would
   settle it: what he built, what he directed, what he checked.
2. Which length is current? The case study says 37 in, the CAD 46.49 in, both with four fins. Until he answers,
   Method 05 should state the length and margin difference without guessing which one is right.
3. Type. The live site moved to Archivo and Martian Mono (commit 92af1f3). The study is still in Space Grotesk
   and IBM Plex Mono, as PRESENTATION.md requires, so the case study link switches typefaces. The brand lens
   raised the same point.

## Proposals, ranked by impact per effort

Overlap with the other lenses is noted. Where they already propose a move, I add the recruiter's acceptance
test rather than a second design.

1. **Correct the stale case-study facts (S).** Update every PAGE claim about the case study to its current text:
   four fins, 2.68 in, the 37 in length and 1.80 cal at 22 in. Rewrite Method 05 around the differences that
   remain (length, margin, fin height). Rename the row group to "Case study figures". Fix
   geom.js PAGE_FIGURES, the geometry lab sentence and README:25. Why: the only outbound project link currently
   exposes a misquote, and the honesty rule is broken today. Where: vx/index.html:156, 202 to 206;
   vx/js/geom/geom.js:59 to 61; vx/lab/geom.html:565; vx/README.md:25. Risk: none to performance. It restores
   honesty; Method 05 must not guess which length is current. Verify: a script that pulls every PAGE-tagged value
   in vx/index.html and finds it verbatim in the visible text of projects/charger.html or index.html (0 misses);
   `grep -n -i "three-fin\|three fins\|2\.63" vx -r` returns nothing; geom lab screenshot; harness clean.

2. **His name, role and result in the first viewport (S; overlaps brand 4 and first-timer 2).** Header left
   becomes the byline above (`MERT TURELI` linking to /, then `/ CHARGER FIELD STUDY 01`). The role and result
   go in the stage's title plate (brand 1) or under the h1. Header right: time code, then `CASE STUDY`, `RUNS`,
   `SITE`. Move `GRID`, `TIER`, `RATE` and `ENGINE` out of the header; the panel's lattice row and rate control
   already show them. Why: the first question a recruiter has is whose page this is, and today it goes
   unanswered for the whole visit. Where: vx/index.html .fd-head, vx/css/field.css, vx/js/main.js updateHeader.
   Risk: none; the role and result are PAGE facts. Verify: a first-viewport text dump (r1-desktop.cjs prints it)
   at 1440x900 and 390x844 contains "MERT TURELI", "CAPTAIN AND CHIEF ENGINEER" and "FIRST PLACE" within 3 s of
   load; overflow check at 320, 390, 1040 and 1440 wide.

3. **One first-person paragraph of what he built (S, copy; overlaps brand 3).** Replace the keyboard table in the
   lede's right column with the paragraph above, set as the lede's first paragraph. Move the existing technical
   sentence after it. Keep the keys in the panel's Keys section and hide them on `(pointer: coarse)`. Why: this
   is the "one-paragraph plain summary" PRESENTATION.md asks the recruiter lens to find. Without it the page
   never says what he did. Where: vx/index.html .fd-lede, vx/css/field.css. Risk: copy needs the owner's approval
   (CLAUDE.md rules 2 and 3). Every fact is published on projects/charger.html. US spelling: the lede's "centre"
   becomes "center". Verify: `python3 check-writing.py vx/index.html` clean; every fact in the paragraph found in
   projects/charger.html; phone screenshot shows no key table.

4. **The three exits wherever a visit can end (S).** In the footer, one mono row, in the main site's own
   wording: `Resume (PDF)` (../assets/Mert-Tureli-Resume.pdf), `LinkedIn`, `Email` (mailto), `The CHARGER case
   study`, `merttureli.com`. Put a case study link in the header and in the end-of-run plate. Demote `Lab` to the
   footer only. Why: today a convinced recruiter has to leave the page and search for him. Where: vx/index.html
   footer and .fd-nav; the plate in vx/js/main.js once brand 1 or first-timer 6 lands. Risk: none to honesty. It
   must stay a quiet link row as on the main site, never a pitch: no "hire", no "available", no "open to roles".
   Verify: links.cjs passes with the new targets (the resume PDF exists); a11y.cjs tab walk reaches them;
   screenshots of the footer at both widths.

5. **The first launch shows the point, and ends on the result (S to M; overlaps first-timer 3 and 6, cinematic,
   brand 9).** LAUNCH and L fly the run 01 setup (full fins, 5 mph crosswind EST) on first press. Stop the
   replay at apogee and show a result plate built from the flight just flown (apogee, time back under 2
   degrees), with REPLAY, the no-fins run and the case study link. Why: a recruiter presses one button. Today it
   proves nothing (angle of attack 0.00 throughout) and ends on -180.00 deg. Where: vx/js/main.js (default
   config, playback stop, plate), vx/index.html. Configuration's Wind row and the panel's EST chip must match
   what LAUNCH flies. Risk: honesty low (the wind is an EST input, already a slider). The Configuration table
   must change with it. Verify: ?autolaunch=1 shows non-zero alpha after rail exit, and the last frame is the
   plate with the chart inside its scale; harness with reduced motion (no autoplay, plate shows) and --no-gl.

6. **A forwardable figure: with fins and without, and a share preview to match (M; overlaps first-timer 4 and
   brand 1).** Under the lede, two flight paths from the SIM runs on one set of axes (ft downrange, ft altitude):
   full fins climbs to 1,028 ft, no fins loops over at 342 ft. Each path carries its two result numbers and SIM
   tags. Bake the paths in node from vx/js/flight/flight.js (deterministic) as inline SVG, so the figure reads
   with JS off. The live flyRun result replaces it and must match. Capture a real frame of the page with this
   figure, or the stage plate, as vx/og-field.png. Rewrite og:description in plain words, for example: "CHARGER
   won the Deployable Sensor Payload event at Battle of the Rockets 2026. Here it flies again from the CAD, in
   slow motion, with and without its four fins." Drop "VX" from the title. Why: the image a hiring manager
   forwards, and the preview it travels with, should both carry the thesis and his name. Where: vx/index.html
   (lede figure, head tags), vx/js/main.js (flyRun keeps a decimated path), vx/css/field.css, vx/og-field.png.
   Risk: the og image must be a real capture of the page, not a mock-up. The paths must equal the run cards'
   numbers. Verify: a script compares the SVG endpoints and apogees to the run cards; screenshots at both widths
   with JS on and off; an OG validator or meta check reads the 1200 x 630 image.

7. **Runs first, appendix after, opened by three plain limits (M; overlaps first-timer 7).** Order below the
   stage: lede and figure, Runs (with a one-line intro, "Five runs, one change each."), then Method and
   Configuration under one "Appendix" heading. Method items collapse to their first paragraph inside native
   details elements. Open the appendix with three lines a non-engineer can read: "A 2D slice, not 3D: in the
   slice the air can only pass over and under the body, so it overstates the body's share of the lift." "Slow
   motion, not a film: the flow is a steady picture at the current angle of attack." "Over 100 times below the
   real flight's Reynolds number: the lattice forces are a cross-check, and the flight model flies the rocket."
   Why: the limits are the strongest mastery signal on the page, and today they sit inside a 330-word paragraph
   3,000 px down. The runs are the experiment and should come before its appendix. Where: vx/index.html section
   order and .fd-index, field.css, main.js anchors and the run buttons. Risk: no content removed. Every number
   keeps its tag. "Over 100 times" follows from figures already on the page: real near 3 x 10^5 at 70 m/s
   against 2,400 to 2,800 in the lattice. Verify: links.cjs and skip links; a11y.cjs heading order and details
   keyboard behavior; JS-off screenshot reads the whole appendix; phone Runs start before screen 6 (today 17).

8. **Quiet the instrument by default (M; overlaps brand 2 and 8, first-timer 9).** Show four readouts on first
   load (altitude, airspeed, angle of attack, static margin) and the fin choice (none, half, full). Put the rest
   behind an `All readouts` disclosure. Section headers carry the SIM tag, and rows print a tag only when it
   differs. Why: for a hiring manager, choosing what to show is the mastery signal, and 30 equal rows read as a
   dump. Where: vx/js/panel/panel.js, vx/css/panel.css, vx/js/scene/markers.js labels. Risk: the inherited tag
   needs the owner's and the content lens's nod. No number loses its source. Verify: first-viewport text dump
   counts SIM chips (target 6 or fewer); a11y names still include each row's tag; phone sheet screenshots open
   and closed.

9. **A credit line in the owner's words (S, owner decides).** One footer sentence saying what he built, directed
   and checked on this page, next to "No analytics." Why: it protects him in the interview this page is meant to
   start. Where: vx/index.html footer. Risk: honesty is the reason for it. The wording must come from the owner.
   Verify: the owner approves the text; check-writing.py clean.

## Cut or hide

- GRID, TIER, RATE and ENGINE in the header strip (the panel and the lab already show them).
- `Lab` in the header nav on desktop and phone (keep "The labs" in the footer).
- The keyboard-shortcut table in the lede, on every device (it stays in the panel's Keys section).
- "VX" in the page title and the tab.
- The two seconds after apogee in the default replay (angle of attack -180.00 deg, "INFLOW HELD AT -35°").
- The `LATTICE PENDING` and "THE FLIGHT MODEL RUNS WITHOUT IT" captions on the first screen (show the flow
  caption only once the flow is live).
- Per-row SIM chips where the section is all SIM (the tag moves to the section header).
- Method 02's solver-stabilizer paragraph (regularized collision, positivity limiter, absorbing layers) behind a
  disclosure, not on the first read.
- The Configuration table's Lattice group behind a disclosure.
- The generic og-cover.png as this page's share image.

## Screenshot index (reports/present/recruiter/)

- r01-desk-cold-1.5s.png, r01-desk-cold-4s.png, r01-desk-cold-10s.png: the cold first viewport at 1440x900.
- r02-desk-lede.png, r03-desk-method.png, r04-desk-config.png, r05-desk-runs.png, r06-desk-footer.png: the
  sections. The name appears only in r06.
- r07-launch-00-T0.52.png to r07-launch-05-T9.68.png, r07-launch-end.png: the default launch at ?autolaunch=1&speed=1&tier=1
  (angle of attack 0.00 throughout, -180.00 after apogee).
- r08-hold15-pressure.png: ?hold=15&tier=1&view=pressure.
- r10-phone-cold.png, r11-phone-sheet-open.png, r12-phone-lede.png, r13-phone-runs.png, r14-phone-footer.png:
  390x844.
- r15-run03-nofins-00..02, r16-run01-full-00..01: the pair a hiring manager would forward.
