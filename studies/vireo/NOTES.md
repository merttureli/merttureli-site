# Vireo: a product page in the Apple manner

Sample 1 of 8. The brief the page was built to, then what was built.

## Client and job

- **Client type:** a hardware startup launching one product.
- **Invented brand:** Vireo (a small company that makes flight kits). The product is real: CHARGER, the rocket
  from `content/projects/charger.json`.
- **The one job:** explain one product well enough that a visitor reserves a kit. "Reserve" is on the first
  screen and stays in reach the whole way down. The reserve flow is completed in the page: pick a kit, enter an
  email, get a confirmation that says this is a sample and nothing was sent.

## References and what is taken from each

| Reference | What is taken |
|---|---|
| apple.com/iphone-18-pro | The black product stage; the frosted local bar with the product name left and a pill action right; the price and action pill at the bottom of the first screen; the highlights gallery with a dot pill and a pause button; the "closer look" list of plus pills |
| apple.com/airpods-pro | The switch to a light section mid-page; headings at 96px, weight 600, tracking -0.015em |
| apple.com/apple-vision-pro | Large centered statements; the exploded product that comes apart as the page scrolls |
| apple.com/macbook-pro | The compare columns with one big number per row; the gray footnotes |
| analogue.co | Stills rendered on a studio gray that fades to white |
| A launch webcast telemetry strip | The flight section: altitude curve, T+ clock, big live numerals |

Taken: structure, pacing, restraint, motion quality. Not taken: any Apple logo, name, icon, photo, product or
sentence, the San Francisco typeface, the blue action color.

**What is its own:** Apple makes exploded views from video. Here the exploded view is the real CAD model
(28 parts), rendered live, driven by the scroll, and it can be turned by hand at the end. The same rocket
stays on stage from the first screen into the exploded scene instead of being cut between clips. The color
is the rocket's own signal orange, not blue.

## Look

- **Color.** Stage black `#000`, raised black `#161617`, ink on dark `#f5f5f7`, quiet text on dark `#a1a1a6`,
  light section `#f5f5f7`, card on light `#fff`, ink on light `#1d1d1f`, quiet text on light `#6e6e73`,
  hairline `rgba(255,255,255,.12)` and `rgba(0,0,0,.1)`. One accent, sampled from the rocket's paint:
  signal orange `#ff5b1f` (on dark: text and fills; as a button fill it carries ink `#1d1d1f`, never white).
  Why: a neutral stage makes the one saturated object, the rocket, the only color on the page until the
  action button repeats it. No gradients on surfaces. Gradient text only on the big numerals (white to
  `#a1a1a6`, top to bottom).
- **Type.** Inter Variable with its optical size axis (self-hosted woff2, Latin subset), the closest open
  face to San Francisco. Display: weight 600, `font-optical-sizing: auto`, tracking -0.015em at 96px easing
  to -0.01em at 40px, line height 1.05. Body 17px/1.47, weight 400, tracking -0.01em. Eyebrow labels 21px
  weight 600 in orange, or 12px weight 600 uppercase is NOT used (no uppercase labels anywhere).
  Numerals: `font-variant-numeric: tabular-nums` where they change. Sentence case everywhere; headlines
  end with a period.
- **Shape.** Cards 28px radius. Pills fully round. Bars and pills are glass:
  `backdrop-filter: saturate(180%) blur(20px)` over `rgba(22,22,23,.72)` (dark) or `rgba(250,250,252,.72)`
  (light), with a 1px inner hairline. Content column 980px; galleries bleed to the screen edge.
- **Motion.** Slow in the scenes, quick in the controls. Easing `cubic-bezier(.28,.11,.32,1)`; controls
  .3s; reveals .8s with a 24px rise; scroll scenes follow the scroll through a short lerp so they never
  jitter. Nothing bounces. Nothing loops in the first screen except the rocket's slow roll.

## Sections, top to bottom

1. **Local bar** (sticky, 48px, clear over the hero then glass). Left: `vireo` wordmark, then "CHARGER".
   Right: Overview, Inside, Flight, Specs (in-page links), and an orange "Reserve" pill. On a phone: wordmark,
   product name and the pill only.
2. **Hero** (black, one full screen). The rocket on stage, lit low key with a rim light, nose up and to the
   right, rolling slowly about its long axis. On load a key light sweeps along the body once and the copy
   rises. Bottom left: "CHARGER" (21px, orange), headline "Flies up. Reports back." (96px desktop, 48px
   phone), one sentence under it. Bottom right: a glass pill, "From $465" and an orange "Reserve" button.
   A poster still (rendered from the same scene and camera) paints first; the live canvas fades in over it
   when three.js and the model are ready.
3. **Statement** (black). One centered paragraph at 40 to 56px, weight 600, whose words go from
   `#48484a` to `#f5f5f7` as the scroll passes them. The rocket leaves the hero pose and settles upright
   at the side.
4. **Inside** (black, pinned for about four screens). The same rocket comes apart along its axis as the
   scroll advances (`setProgress`), camera easing from the whole airframe to the payload, to the motor mount,
   then back out while it reassembles. Three captions fade through, one at a time. At the end the model can be
   dragged to turn it, and a small glass chip says so.
5. **The short version** (light). A gallery of five large cards (rendered stills, 16:10, 28px radius) that
   snaps, advances by itself every 5 seconds while in view, and has a glass dot pill plus a pause button.
   Arrow keys and swipe work. Captions are the five highlights below.
6. **Look closer** (light). Left: a column of plus pills (Nose cone, Payload, Camera, Motor mount, Fins,
   Recovery). Opening one turns it into a card with two sentences and closes the others. Right: a second live
   view of the model that turns and moves in on that part while the rest goes to a ghost. On a phone the view
   sits above the pills.
7. **Flight** (black). An altitude curve that draws with the scroll: liftoff, burnout at 1.25 s, apogee,
   nose cone release at 75 percent of peak altitude, landing. Four big numerals count up as they enter:
   1,033 ft, 8.17, 1.25 s, 13.8 ft/s, each with a one-line label. Five thin live traces labeled 01 to 05
   stand for the five telemetry channels (the channels are not named anywhere in the source, so they are not
   named here).
8. **Proof** (black, short). "First place." at 96px, then "Deployable Sensor Payload event, Battle of the
   Rockets 2026. Culpeper, Virginia."
9. **Specs** (light). Two-column rows with hairlines: the facts from the case study's "The numbers".
10. **Reserve** (light, then the footer). Three kit cards in compare columns: Airframe $465, Payload $251,
    Flight set $716. Picking one marks it; an email field and "Reserve" complete the job; the confirmation
    replaces the form and says plainly that this is a sample and nothing was sent.
11. **Footnotes and footer** (light, 12px gray). Numbered footnotes for every claim that needs one
    (simulated apogee; prices), then the sample line.

## Words

Brand voice: present tense, short declarative sentences, no exclamation marks, no superlatives the facts do
not carry, US spelling, no em or en dashes. Every fact comes from `content/projects/charger.json` or
`assets/charger-explorer/part-stories.js`; nothing else about the rocket is invented.

- Hero: "Flies up. Reports back." / "A 37 inch rocket that drops a sensor payload at apogee and streams
  five channels of telemetry to a handheld ground station."
- Statement: "A G motor carries it to about 1,000 feet. On the way down it lets go of its nose cone, and a
  camera films the ground until it lands. From the pad on, five channels of telemetry reach a handheld ground
  station."
- Highlights: "First place. Deployable Sensor Payload event, Battle of the Rockets 2026." / "Cardboard on
  purpose. Carbon fiber would put a conductive shell around the 2.4 GHz antenna." / "A motor mount you can
  replace. Eight screws and it slides out the back." / "Its own board fires every charge. No commercial
  flight computer in the payload." / "Down at 13.8 feet per second under a 48 inch ripstop nylon canopy."
- Section headings: "See all 28 parts." / "The short version." / "Look closer." / "One flight, start to
  finish." / "The numbers." / "Reserve yours."

## Invented

The brand Vireo, the kits and that anything is for sale. The three prices are the real hardware costs of the
first CHARGER ($465.42 rocket, $250.53 payload, $716 total), rounded. Footer line: "A sample site by Mert
Tureli. Vireo is an invented brand and nothing here is for sale. CHARGER is real: I built it with the Union
College Rocket Team."

## Budget

First view (before three.js) under 400 KB. Whole page under 2.5 MB. At most two WebGL views, each paused
when off screen. With reduced motion: no scroll scenes, the rocket assembled and still, the exploded view
shown as one rendered still, every word readable.

## What was built

Files: `index.html`, `css/vireo.css`, `js/vireo.js` (the page: bar, reveals, statement, gallery, pills, chart,
counters, traces, form), `js/stage.js` (scroll and pills to poses), `js/rig.js` (the one renderer and the rocket),
`js/poses.js` (every pose and the pinned scene's timing), `fonts/` (Inter Variable, Latin, with the optical size
axis, 73 KB, and its license), `assets/` (18 stills, 330 KB together).

The rocket is not copied: `rig.js` imports `next/js/viewer/products/charger.js` (the 11 exterior meshes of
`charger-hero` plus the interior parts of `charger-explorer`, with its slide along the body per part) and its
`charger-finish.js` dress on `showreel/look.js`. This page adds a black studio description for the look
(`STAGE_STUDIO`), two grades of it (`GRADES`: dark stage, gray studio) and a key that is re-aimed per pose.

### Where it leaves the brief, and why

- **Hero to statement.** The brief has the rocket swing from the hero pose to upright at the side. At 1440 and
  at 390 that swing crossed the headline and the buy pill. Built instead: as the scroll starts the rocket flies
  out along its own axis, then comes back standing at the side, rising under the hero's last line. It is on
  stage again as the statement's first words light up.
- **One WebGL view, not two.** The budget allows two. The same canvas is moved between the stage and "Look
  closer" while neither is on screen, so the model, the look and the programs are built once.
- **The light sweep is CSS.** three.js is not loaded when the page first paints, so the sweep is a mask that
  uncovers the poster from tail to nose with a brighter band on its edge. The live canvas fades in over the
  finished poster and only then starts to roll.
- **Phone.** A fixed glass bar at the bottom carries the price and Reserve (the hero's own pill is dropped
  there). The statement is set at 32px, left aligned, beside the standing rocket, not centered at 40px. The
  whole exploded rocket stands upright at the side and is small (about 20px across); the two close-ups carry
  the scene.
- **Flight has no running T+ clock.** Only T+0 and burnout at T+1.25 s are in the source. The curve is a
  sketch, says so under it, and its markers carry only source facts.
- **"28 parts" is the headline only.** The model on screen has 26 drawn pieces (11 exterior, 15 interior: the
  model's old battery placeholder is left out, as on the live explorer, and the camera holder has no
  geometry). Nothing on the page counts or labels the pieces on screen.
- **Fins.** `charger.json` says balsa; the live explorer's notes say plywood. The page names no fin material.
- **Gray on the stills.** The second sentence of a gallery caption is `#636366`, a step darker than the
  brief's `#6e6e73`, because the still's studio gray is darker than the page and `#6e6e73` fell to 4.0 to 1.
- **No orange text on light sections** (2.8 to 1 on `#f5f5f7`): orange there is fills only (the selected kit,
  the open pill's icon, buttons). The focus ring is orange on dark sections and ink on light ones.
- **The way back** is docked in the local bar as a quiet glass chip after the product name, with the same link
  and text, and takes the bar's dark or light theme. Under 480px only its arrow shows (the text stays for
  assistive tech; the target is 48px tall). Checked at 15 widths from 360 to 1920 down the whole page: it stays
  inside the bar, 16px after the product name, and is never over a headline, a control, a field, the price pill
  or the phone's bottom bar.
- **No reveal on the "Look closer" panel**: it holds the live view, so it is never hidden.
- **A second font file is fetched with the 3D**: the shared Archivo (90 KB), only so the rocket's own livery
  lettering is drawn as on the live site (`hero3d.js` paints it on a canvas). No page text uses it.

### How the stills were made

A lab page kept in the scratchpad imports this folder's `rig.js` and `poses.js`, so a still and the live view
come from the same code. Playwright (headless Chromium, software GL) opened it at the target size, at 2x (3x for
the phone hero), set a pose and a grade, and read the canvas back as a PNG with alpha. Pillow did the rest:
black for the dark stills; for the light cards a studio gray that fades to white (`#e6e6eb`, `#f2f2f5`, `#fff`)
with two soft shadows cut from the alpha; the two "Look closer" posters keep their alpha. Saved as WebP at
quality 80 to 86.

| Still | Pose |
|---|---|
| `hero-land-*`, `hero-port-*` | `FILM.land[0]`, `FILM.port[0]`, dark grade, frame 16:10 and 0.62 |
| `inside-land`, `inside-port` | apart at 0.62: tilt 90 degrees, dist 2.05, frame 1440 x 560; upright, dist 4.9 |
| `closer-land`, `closer-port` | `CLOSER.nose`, light grade, the rest ghosted, frames 980 x 685 and 390 x 420 |
| `card-1` | whole rocket, dark: tilt 0.74, lean 0.25, dist 2.42 (phone: tilt 0.9, dist 2.9) |
| `card-2` | upper tube's open aft end and the coupler, light: tilt 1.15, lean -0.5, station -0.15, dist 0.78, apart 0.62 |
| `card-3` | motor mount out the back, light: tilt 1.15, lean -0.4, station -0.93, dist 0.95, apart 0.62 |
| `card-4` | payload board, dark: tilt 1.42, lean 0.3, roll 0.62, station 0.385, dist 0.74, apart 0.62 |
| `card-5` | nose cone lifted alone, light: tilt 0.7, lean 0.4, station 0.46, dist 1.15, `slideIds: [0]`, apart 0.36 |

If the hero pose (`FILM.*[0]`), `STAGE_STUDIO` or `GRADES.dark` change, the hero stills must be rendered again
or the poster and the live canvas no longer line up.

### Checked

`node tools/study-shots.js vireo`: 2,045 KB on the desktop pass (173 KB before three.js is asked for), no console
errors, failed or outside requests, no sideways overflow at 1440 or 390, no unnamed controls, no image without
`alt`, one `h1`. The reserve flow by pointer and by keyboard alone (pick, bad email, good email, confirmation,
start over): no request other than GET, no navigation. Frames stop when the stage or the view is off screen,
when nothing moves, and in a hidden tab. Without three.js, without WebGL, with reduced motion and without
script the page falls back to the stills and every word is readable.

### Known weak spots

- With the nose up and to the right, the livery's stacked lettering reads from the nose down, so it looks
  turned over in the hero and in the wide exploded view.
- Between the hero and the statement the stage is empty for about a third of a screen while the rocket is away.
- The wide exploded view on a phone is small, as noted above.
- All looking was done in headless Chromium with software GL, where a frame takes about half a second. Frame
  pacing, the pixel ratio governor and `backdrop-filter` on real phones are not verified on hardware.
- The gallery's auto advance pauses on focus and pointer hold but has no swipe velocity handling of its own; it
  relies on native scroll snap.
