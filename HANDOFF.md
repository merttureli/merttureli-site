# opt/copy: copy council decisions applied

Branch `opt/copy`, cut from `claude/funny-sagan-acgved`. All 416 council decisions in
`scratchpad/council/decisions.json` are applied across the 7 pages. Sources edited:
`src/index.html`, `build-case.py`, `websites.html`, `js/site-palette.js`,
`css/site-palette.css`, `css/website-entry.css`. New: `tools/check-flags.py`. Generated
files (`index.html`, `src/projects/*.html`, `projects/*.html`) were rebuilt, not hand edited.
`python3 build-case.py --check`, `python3 tools/build.py --check` and `python3 check-writing.py`
(0 flagged across 9 files) all pass.

## Words before / after

| page | council metric (inventory extractor) | all of `<main>` innerText |
| --- | --- | --- |
| home | 1532 -> 389 | 1785 -> 530 |
| charger | 934 -> 353 | 1242 -> 472 |
| robo-catcher | 477 -> 151 | 576 -> 192 |
| rudder-pedals | 472 -> 156 | 548 -> 159 |
| therma-shift | 406 -> 178 | 503 -> 293 |
| bend-fixture | 411 -> 137 | 465 -> 133 |
| websites | 541 -> 242 | 545 -> 246 |
| **total** | **4773 -> 1606** | **5664 -> 2025** |

The council metric is the same extractor as `inventory.json` (`scratchpad/opt/copy/extract.js`,
output in `before.json` / `after.json`). The right column counts every word in `<main>`, including
the stats bands, constraint cards and ruled lists that the inventory never captured (see below).

## What changed

**Home** (`src/index.html`)
- Hero line is now "I design and build hardware." (the design/build verb underlines kept). The hero Resume
  link is gone. The launch cue reads "Explore in 3D". The hero caption reads "01 CHARGER".
- CHARGER: both paragraphs, the Scope row and the in-card "Explore this rocket" link are gone. The button reads
  "Case study". The Expand button and the inline 3D seat are unchanged.
- About: one line, Title and Based rows only.
- Work cards: shortened text, all links read "Case study" (Robo-Catcher: "See the mechanism"). The HOTBOX
  "Measurement" panel and the bend fixture "Build" panel (label plus spec list) are removed whole, along with
  their `rigSpecs` / `jigSpecs` data.
- The **Experience** section is removed, including its KAAN/HURJET clips. Its nav item is removed from the home
  header, the case page header (`build-case.py` NAV) and both websites.html navs. The mobile menu builds from
  the header, so it follows.
- Skills belt: 23 chips and the whole Languages group are removed from both belt copies. 3 chips are renamed.
  The rule count reads 006 (was 007).
- Beyond: 3 lines shortened. The Photography entry's only text was cut, which would have left an orphan
  "03 PHOTOGRAPHY" label, so I removed that entry. Cooking and Travelling are renumbered 03/04, and the
  "Beyond engineering / 005" label reads 004. The Explore photography corridor is unchanged.
- The **Recognition** section is removed.
- Website entry: the heading and paragraph are gone. The label and the "A website for you" button sit in one
  row. `aria-labelledby` now points at the label. I removed the dead h2/p CSS and the label's bottom margin
  from `css/website-entry.css`.
- Contact: the paragraph is cut and the LinkedIn button is kept (override). The Elsewhere rows read
  "Resume / PDF", "LinkedIn" and "Email". The LinkedIn row has no value now, so its label uses the value color
  (not the muted label color) so it does not read as an orphan label.
- Footer: the CAD animation sentence is cut and a Resume (PDF) link is added (override).
- The palette note reads "...Your choice is saved on this device." (`js/site-palette.js`, see Decisions).

**Case pages** (`build-case.py`)
- New generator support, used only where the decisions needed it:
  - `brief_label: None` drops the Brief rule and renumbers the sections from 01.
  - A section can have `label: None`. It then joins the part above it and keeps its `anchor` and a `track`
    name, so `data-track` ids and `#project-result` stay stable.
  - An empty walkthrough fallback emits no `<p>`.
  - A per-case `colophon` sets the footer credit line.
  - `flag()` and `FlagValue` produce the flag marks. `FlagValue` is a React element for SpecList values,
    which render as text.
  - Case footers drop the home-only Resume link.
- When a section's label and all of its inventoried text were cut, I removed the whole section, including
  its uninventoried cards or list. The sections removed this way:
  - CHARGER: Constraints, Where the points are, The paperwork, Where the margin was, What I learned
  - Robo-Catcher: The problem, Constraints
  - Bend fixture: The problem, Constraints, What I learned
  - Rudder pedals: The problem, Constraints, What I learned
- Robo-Catcher: Electronics/firmware, The result and What I learned lost only their labels. Their text, frames
  and list stay as unlabelled parts.
- Robo-Catcher figure captions have no index numbers now, per final_text.

**Websites**: the copy decisions are applied. The process paragraphs, the Proof and Process leads, and the whole
Start spec list are removed. The study caption's default line matches the new Hangar line.

## Orchestrator overrides applied
- **LinkedIn kept** in the home contact area (home-166) with the label "LinkedIn".
- **Footer Resume (PDF)** link added to the home footer, styled like the Privacy link. It is not on case pages.
- **SparkLabs**: therma-shift Built for reads "SparkLabs seed competition, March 2026". home-158 (the only other
  SparkLabs) was cut with Recognition.
- **CHARGER 2.63**: flagged in both places on the case page, the airframe paragraph (charger-029) and the
  Numbers list (charger-035), with the note "CAD measures 2.68 in".

## Flags (11, listed by `python3 tools/check-flags.py`, which exits 1 while any remain)
`<mark class="flag" data-flag data-note>` renders as a dotted underline in the current text color
(`css/site-palette.css`).
- home-022 "2024"
- home-078 "Built for a seed competition."
- home-163 the website entry label
- websites-051 the Portfolio / Privacy colophon
- charger-029 and charger-035 "2.63"
- therma-shift-007 the SparkLabs value
- therma-shift-021 the runaway cutoff sentence
- therma-shift-028 the CAD footer credit
- bend-fixture-030 and rudder-pedals-035 the footer credits

Flags not turned into marks:
- home-019: a layout check, not text. I verified it: the "Explore in 3D" cue shows on the hero at 390.
- home-167: moot, because the LinkedIn button now sits between Get in touch and Elsewhere.
- charger-040: refers to text that is no longer on the page. Its inputs question is still open for the owner.

## Decisions not applied exactly (and why)
- **Palette note** (home-172 vs the "keep" on the six other pages): `js/site-palette.js` builds one shared note,
  so I applied home's "is saved" wording everywhere. A per-page note would need page sniffing in that shared JS.
- **home-171** gets the Resume (PDF) link inserted before Privacy (override). Otherwise it matches final_text.
- **Case footers**: the decisions differ per page (charger and rudder-pedals keep the full credit, robo-catcher
  matches home, therma-shift keeps CAD only, bend-fixture is shortened). They are implemented with the new
  `colophon` key, because footers used to be one shared copy of home's.
- Everything else matches final_text exactly. `scratchpad/opt/copy/verify.py` re-checks every keep, shorten,
  rewrite and merge text against the re-extracted page, and every cut against its absence. The only misses
  are the two items above.

## Not reviewed by the council (left unchanged; owner may want a look)
The inventory extractor skipped unclassed `<span>`s and shadow DOM, so these were never voted on and are untouched:
- Meta lines, e.g. "Mechanical engineer / Austin, Texas", "Union College Rocket Team, 2026 / Captain and chief
  engineer / First place" (this repeats the CHARGER rows the council kept to state the win once), "SunThru, 2026 /
  Design, electronics, firmware, safety systems", and the footer "Austin, Texas / B.S. Mechanical Engineering...".
- Case page stats bands, constraint cards (therma-shift keeps them), ruled lists (CHARGER Numbers and Result,
  Robo-Catcher result, Therma-Shift Where it stands), clip and bleed captions, and the Robo-Catcher walkthrough
  (shadow DOM chapter copy).
- **Stale after the cuts**: the home footer still says "Aircraft models are third-party, illustration only" (per
  final_text), but the only aircraft clips were in the removed Experience section. "Travelling" (a Meta label)
  uses UK spelling. The CHARGER Numbers list still says "centre of gravity". The `languages` data array in
  `src/index.html` was already unused and is left as it was.

## Verification
- Screenshots of all 7 pages at 390 and 1440, before and after:
  `/tmp/claude-0/-home-user-merttureli-site/fe356c8b-023d-52dd-b7f6-84e925c9294d/scratchpad/opt/copy/before/`
  and `.../opt/copy/after/` (`<page>-<width>.png`, plus `.tNN.png` tiles). I looked at every page: no orphan
  labels, empty panels or broken grids. The Beyond grid now wraps 3+1 at 1440.
- No console errors and no horizontal scroll on any page at either width. No in-page `#` link points at a
  missing id.
- Home: the rocket flies into the CHARGER seat on scroll (`after/home-1440-charger-seat.png`). Expand opens the
  explorer dialog with its iframe and Escape closes it (`after/home-1440-explorer-expanded.png`). The mobile
  menu shows Work, Beyond, Websites, Contact (`after/home-390-menu.png`).
- Websites: the inquiry dialog runs end to end (day, details, review, send) against a mocked Formspree. One POST
  was captured and the completion panel showed (`after/websites-inquiry-*.png`).
