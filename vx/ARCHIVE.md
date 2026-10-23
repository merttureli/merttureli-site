# CHARGER field study (vx): archive and hand-off

Archived 2026-10-23. This branch, `claude/charming-pascal-wgx7a3`, holds the final state of the
experimental page at `/vx/`. It was never merged into `main` in this form; the owner closed the
project out at this point. Start here if you come back.

## Where things are

| What | Where |
|---|---|
| Final code (page, modules, labs) | this branch, `vx/`. Commit `f5549df` holds the final code; the commit on top of it adds this archive. The git proxy of the session that made this could not push tags, so the branch head is the pointer. |
| The page as it was live | `main` still serves the first field study at https://merttureli.com/vx/ (merged in PR #3). Removing or replacing it is a change to `main`, which this track was not allowed to make. |
| Design and contracts | `vx/docs/BRIEF.md` (who Mert is, design system, assets), `vx/docs/FIELD.md` (the binding contract: sign conventions, module APIs, tiers, honesty rule), `vx/docs/ARCHITECTURE-vx-pad-one.md` (the earlier vx site this page replaced) |
| Validation campaign | `vx/docs/VALIDATION.md` (brief), `vx/docs/reports/validation/` (tracks L1 to L3 and F1, F2, the lattice fix report, `SUMMARY.md` with limits and contradicted statements), `vx/lab/validation.html` and `vx/js/data/validation.js` (all 351 cases), bench pages under `vx/lab/validation/` |
| Presentation work | `vx/docs/PRESENTATION.md` (brief), `vx/docs/PRESENTATION-PLAN.md` (the approved twelve-item plan with the do-not list), `vx/docs/reports/present/` (five lens reviews and `COPY-REVIEW.md`, every new sentence with its location) |
| Shipping confidence | `vx/docs/SHIPPING.md`, `vx/docs/reports/ship/` (75-cell runtime matrix, static Safari, iOS and Firefox review, the `?bench=1` spec) |
| Module APIs and build reports | `vx/docs/reports/modules-api-and-build-reports.md`, `vx/docs/reports/probes-notes.md` |
| Harness and probes | `vx/tools/harness/check.cjs` (Playwright page harness), `vx/tools/harness/field/*.cjs` (links, a11y, tier sweep, launch video, hold pressure, lattice validation), the workflow scripts that drove the agent swarms (`field-*.js`). They expect Playwright at `/opt/node22/lib/node_modules/playwright` and a scratch directory in `VX_SCRATCH`. |
| Captures | `vx/docs/media/` (cold desktop and phone, the end plate, the held 15 degree pressure field, a 24 s launch recording from the first version) |
| Pull requests | #1 the first vx site (merged), #3 the first field study (merged, live), #4 this branch (draft, closed on archive, full write-up in its description) |
| Preview of this branch | https://claude.ai/artifact/LspSLJat3JnN2cz16iP9bS (private artifact; the CAD binary is served under a .wasm name there) |

## How to resume

```
git fetch origin claude/charming-pascal-wgx7a3
git switch claude/charming-pascal-wgx7a3          # or: git switch -c vx-resume origin/claude/charming-pascal-wgx7a3
cd /path/to/repo && python3 -m http.server 8000   # open http://localhost:8000/vx/
node vx/js/flight/flight.test.mjs                 # 26 tests
node vx/tools/bake-figure.mjs --check             # the baked lede figure is current
VX_SCRATCH=/tmp/vx-scratch node vx/tools/harness/check.cjs vx/index.html --out /tmp/vx-scratch/page --steps 4 --viewports 1440x900,390x844
```

Rules that bound this track and still apply: nothing outside `vx/` changes; no analytics; no emoji or
exclamation marks; every number carries a source tag (PAGE, CAD, EST, FIT, SIM, STD); copy is first
person, past tense, US spelling, no dashes; open owner questions are `<mark class="flag" data-flag="vx-...">`
and `python3 tools/check-flags.py` lists them. The repo's `CLAUDE.md` tells other sessions not to touch
`vx/` or this branch; a session that is asked to resume this project is the exception.

## What it is

A field study of CHARGER's stability. A three.js scene with the CAD assembly flies a slow-motion
launch replay driven by a 3-DOF Barrowman flight model (RK4 at 1 ms, G77R thrust curve, rail, wind,
gusts). A D2Q9 lattice Boltzmann section through the pitch plane shows the flow and the pressure on
the fins. The default launch adds an 11.2 mph gust at rail exit, narrates the beats, pauses at apogee
on an end card, and draws the path next to the ghost of the other fin choice. Instruments fold behind
disclosures; the story and runs come before the method appendix; labs per module plus a validation lab.

## State at archive

Verified clean at the final gate: 40 JS files pass `node --check`; flight tests 26 of 26; harness clean at
1440x900 and 390x844 in default, reduced motion, no WebGL and `?tier=3`; all 10 lab pages clean; links
210 references, 0 missing; keyboard 50 of 50 and 33 of 33 stops named with visible focus; live regions at
1 Hz or slower; 0 contrast failures; tier sweep, launch video, held-pressure and end-plate probes pass;
`check-writing.py` clean. All timings were measured under software GL and are not representative.

Open owner questions (flags in `vx/index.html`):
- `vx-cg`: the page flies a CG estimated from the CAD parts (27.17 in from the nose, EST, margin 2.16 cal,
  range 2.01 to 2.47). The case study's 22 in belongs to the 37 in design. A measured CG with the motor
  loaded would replace it.
- `vx-length`: 37 in (case study) or 46.49 in (CAD).
- `vx-mass`: the liftoff mass source for the CAD airframe (the page uses 2.2 lb from the case study).
- `vx-loop`: wording for the half-fin and finless behavior now that both tumble at the estimated CG.
- `vx-authorship`: one footer sentence in the owner's words about what he built, directed and checked.
- Not flagged: approve the new copy (`docs/reports/present/COPY-REVIEW.md`); fonts (the live site moved to
  Archivo and Martian Mono, vx stayed on Space Grotesk and IBM Plex Mono); whether a resume and contact row
  belongs on a noindex page.

Open defects and limits (full lists in `docs/reports/validation/SUMMARY.md` and the validation lab):
- The 2D lattice section is a flow and fin-pressure picture, not a stability number: its CP sits 15 to 18 in
  from the nose against Barrowman's 29 to 33 in, and as a 3D coefficient its C_N is 16 to 35 times too large.
  The page says so and keeps the lattice rows lab-only.
- Lattice Re 900 to 1,500 against about 3e5 for the real rocket; inflow capped at 0.05 lattice units;
  body-frame pitch-rate lift reaches about 0.38 of the thin-airfoil value (cause not found); the inflow edge
  is a pressure anchor so coefficients read 4 to 8 percent low; staircase walls; the domain is 0.47 rocket
  lengths tall.
- Flight: the drag coefficient 0.634 is fitted to the case study's simulated apogee and there is no flight
  data; the slender-rod inertia reads 17 to 26 percent high; constant density (ISA would add 0.4 percent).

## Decision log

- 2026-10-22: the first vx site (PAD ONE, eight scroll stations) shipped and was then retired; the owner
  kept only the fluid simulation idea and asked for a standalone field study of the rocket.
- Engine: lattice Boltzmann chosen over extending the stable-fluids solver, gated on a cylinder benchmark.
- Four fins: the CAD assembly is the final configuration (the case study page later changed to four fins too).
- Barrowman flies the rocket; the lattice shows the flow. The "lattice flies it" toggle is lab-only.
- 2026-10-23: validation found the 22 in CG inconsistent with the CAD airframe; the page default moved to the
  CAD estimate, flagged for the owner. Half fins and no fins tumble at that CG.
- The lattice is no longer described as a cross-check of Barrowman anywhere on the page.
- Default launch carries the 11.2 mph EST gust so the first press shows the effect; T+ is always flight time,
  every hold is labeled, captions are state-conditioned, never timed.
- Fonts kept as the brief required pending the owner's answer.

## Session log

| Phase | Agents | Tokens |
|---|---|---|
| First vx site (concepts, judges, 11 modules, finishing, integration), PR #1 | about 60 | 14.1 M |
| Field study v1 (five modules, two integrations, probes), PR #3, live | about 35 | 11.8 M |
| Validation campaign (five tracks, fixes, lab page) | 8 | 4.4 M |
| Presentation review and synthesis | 6 | 1.0 M |
| Presentation implementation (three waves, four lenses, fixes, gate) | 17 | 8.3 M |
| Shipping confidence sweep | 2 | 0.6 M |
| Final integration and fixes | 3 | 1.1 M |
| Measured total (plus about 2 M lost to a container restart and 1 to 1.5 M orchestration) | | 41.4 M |

Orchestration ran on Claude Fable 5.1; every builder, reviewer, fixer and benchmark agent ran on Opus.
