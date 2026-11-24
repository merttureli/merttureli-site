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
