# Low Light: an event site set as a moving poster

Sample 6 of 8. The brief the page was built to, then what was built.

## Client and job

- **Client type:** an event (a festival, a launch, a conference, a wedding weekend, a club night).
- **Invented brand:** Low Light, a star party: three nights on a dark field for the Perseid meteor shower,
  Thursday 12 to Saturday 14 August 2027. The photographs are real: Mert Tureli's
  (`next/assets/img/beyond/`: `stargazers`, `moon-pines`, `alcazar-moon`, `burner-glow`, `balloons-dusk`).
- **The one job:** RSVP. "RSVP" is on the first screen and in the bar. It is completed in the page: pick the
  nights, the number of people, whether a telescope is coming, a name and an email; the confirmation is a
  pass with a small constellation drawn from the letters of the name, and it says this is a sample and
  nothing was sent.

## References and what is taken from each

| Reference | What is taken |
|---|---|
| commercialtype.com | Type as the image: one word per band, very large, its variable axes animating |
| abcdinamo.com | Full-bleed flat color sections, uppercase centered headlines, tiny interface text, pill chips |
| studiodumbar.com | One flat field of color per screen and a shape that moves; nothing else |
| config.figma.com | 80px headlines at weight 400 beside 16px mono capitals; square corners; a schedule you can read at a glance |
| A festival wristband and a gig poster | The pass; the rotating circular line of rules |

**What is its own:** the sky answers the scroll. Behind the type is a field of stars turning slowly about
a pole; scroll, and the stars draw out into trails the way they do in a long exposure, then settle back to
points when the page rests. Now and then a meteor crosses, and a small counter keeps the tally. And the
page has what every astronomer's tool has: a red light switch. One press turns the whole site to deep red on
black, to keep night vision. The headline type is one variable face whose width follows the scroll: the
words squeeze and stretch as the page moves.

## Look

- **Color.** Night `#060814`, indigo `#12163a`, moon cream `#f2e9d0` (type), lilac `#b6a6ff` (the one
  accent: chips, links, the RSVP button with night ink), star white `#ffffff` for stars only. Red light
  mode replaces every color with reds on black: `#ff3b2f` type, `#5a0e0a` quiet, `#000` ground, and the
  photographs go to a red duotone. Photographs otherwise carry an indigo and cream duotone so five
  different nights read as one set.
- **Type.** Display: Anybody, variable (width 50 to 150, weight 100 to 900), uppercase. The hero words run
  from width 50 to width 150 with the scroll; rows sit at width 75, weight 800. Details: Azeret Mono,
  12 to 14px, uppercase with +0.05em tracking. Two families, no more.
- **Shape.** Bands, pill chips with a 1px cream outline, circles (the rotating badge, the night clock).
- **Motion.** Constant but slow in the sky, exact in the type. Marquees run in opposite directions on
  alternate rows and pause on hover and focus. The badge turns once every 30 seconds. Everything in the sky
  stops with reduced motion: the stars are still points, no meteors, type sits at one width.

## Sections, top to bottom

1. **Bar** (fixed, transparent). "LOW LIGHT" small, the dates in mono, then at right the red light switch
   (a labeled toggle) and "RSVP" (lilac pill).
2. **Hero** (night, one screen, the starfield live). "LOW" and "LIGHT" on two lines as wide as the screen;
   the `stargazers` photograph inside the letters of one line or behind them at low strength; mono line:
   "A star party. Three nights for the Perseids. 12 to 14 August 2027." The rotating badge at lower right:
   "RED TORCHES ONLY, NO HEADLIGHTS, BRING A CHAIR".
3. **Marquee band** (lilac, night ink). Two rows running opposite ways: "NO MOONLIGHT REQUIRED", "LOOK UP",
   "BRING A BLANKET", "IT GETS COLD".
4. **Program** (indigo). Not rows: a night clock. One large dial from dusk to dawn (20:00 at the left,
   midnight at the top, 05:00 at the right) with the night's four items placed on its arc (gates, a talk on
   finding the radiant, scopes open, the watch); night tabs THU, FRI, SAT swing the hand and swap the items.
   Under it the same program as a plain mono list, for reading and for screen readers.
5. **The field** (night). The four other photographs in duotone as a row of tall panels that widen on
   hover and focus, each with a one-line mono caption that says only what is in the picture.
6. **House rules** (cream ground, night ink: the one light section). Five rules as a numbered list in
   display type: red light only, no headlights after dusk, dress for cold, bring a chair, leave no trace.
7. **RSVP** (night). Night chips (THU 12, FRI 13, SAT 14, any number), people stepper, telescope toggle,
   name, email, "COUNT ME IN". Then the pass.
8. **Footer** (night). The meteor tally for this visit, the sample line.

## Words

Brand voice: a poster. Capitals, few words, dry humor allowed once or twice. US spelling. No em or en
dashes. The only astronomy stated is that the Perseid meteor shower peaks in mid August and that red light
protects night vision. Do not state moon phase, rates per hour, coordinates or a real place: the field's
location is "sent with your RSVP".

## Invented

The event, its program, its rules and its dates. The photographs are real but are not of this event. Footer
line: "A sample site by Mert Tureli. Low Light is an invented event and no places are held. The photographs
are mine."

## Budget

First view under 400 KB. Whole page under 2 MB. The sky is one 2D canvas (not WebGL), capped at a number of
stars that holds 60 frames a second on a laptop and fewer on a phone, paused when the tab is hidden.

## What was built

Built in November 2026 to the brief above. Files: `index.html`, `css/lowlight.css`, five ES modules in `js/`
(`lowlight.js` start-up and the one loop, `sky.js`, `type.js`, `clock.js`, `rsvp.js`), two font files with their
licenses in `fonts/`, one icon in `assets/`. No build step, no outside request.

### How the two signature pieces work

- **The sky.** One opaque 2D canvas, fixed behind the page. The stars turn about a pole (one turn in 25 minutes
  at rest). The scroll position is geared to the same turn (0.00028 radians a pixel), and each star is drawn as
  the arc between where it is and where a slower "tail" angle has reached, so a scroll draws trails and a rest
  closes them to points. Arcs are capped at 0.46 radians. Meteors run away from one fixed radiant; the tally is
  kept in `sessionStorage`. The canvas is not drawn while no night section is in view or while the tab is hidden,
  draws every other frame at rest, caps device pixel ratio at 2 (lower on very large screens) and thins the
  faint stars if a device cannot keep up.
- **The type.** Anybody's advances are linear along the width axis, so each capital is measured once at 50 and
  at 150 (advance and side bearings) and everything after is arithmetic. A line is laid out by its ink, not its
  advance box, so every big word starts and ends exactly on the margin.

### Where it differs from the brief, and why

1. **Hero width.** The brief has the hero words run from width 50 to 150 with the scroll. A whole word doing
   that at one size cannot also stay as wide as the screen. Built instead: a swell of width travels through the
   letters with the scroll, and the other letters give way by exactly as much, so the line always fills the
   measure and its height never changes. The mean width is set by the screen (about 112 at 1440 by 900, 57 at
   390 wide), so single letters reach 150 on a laptop but only about 90 on a phone.
2. **Section words.** Each section opens with one word set the same way (PROGRAM, THE FIELD, RULES, RSVP),
   after the "one word per band" reference. The brief did not list them.
3. **Rows at width 75.** The marquee rows sit at 75. The five house rules are one size and each is set at the
   width that fills the measure: the longest at 75 (60 on a phone, where "No headlights after dusk" takes two
   lines), the shortest near 138.
4. **The night clock.** Midnight sits at the top as the brief asks, so the scale is in two even parts: the four
   hours before midnight share the left quarter and the five after it the right quarter (an hour is 22.5 degrees
   before midnight and 18 after). The hand points at the start of the watch; the watch is the thick arc.
   Pointing at a line of the list lights its mark.
5. **The program list** sets its times in the display face at weight 400 (the config.figma idea) with mono
   text beside them, not as a plain mono list. With scripting off all three nights are listed.
6. **The stargazers photograph** is used twice from the same file: behind the type as a low dome of glow, and
   again in front of the letters, where an SVG filter turns everything dark in the frame into solid night. The
   two people sit in front of the word. The brief asked for inside the letters or behind them.
7. **Duotone.** A ramp of night, indigo, a violet between, and cream, so the middle tones do not go gray. The
   castle frame is read through a red filter so its daytime sky falls dark. Two near-dark frames have their
   shadows opened. All in SVG filters; no file was edited.
8. **Red light mode.** `#5a0e0a` on black is 1.5 to 1, so "quiet" is used for lines and for the marquee band
   only (the big letters on it are 3.9 to 1; its one small line gets a black strip). The cream section goes
   black. A confirmed pass is black with a red border, not a filled block. In normal light the switch's knob is
   the one red thing on the page.
9. **The bar** is transparent, but each item is a solid pill, so it reads over every section.
10. **The way back** is docked in the bar as its first chip, in the bar's colors, and follows red light mode.
    On a wide screen it stays with the bar, so the page scrolls under it as it does under the bar's own chips.
    A phone's bar has no room for it, so there it has a row of its own under the bar at the top of the page
    and scrolls away with the first screen: further down it is never over a button or a form field. Checked
    at 85 widths from 360 to 1920: at the top of the page it touches no headline, control, field or the badge.
11. **House rules** carry one moving shape that the brief did not list: a disc that crosses the list with the
    scroll and inverts what it covers.
12. **The pass** is live: it fills in beside the form as it is answered, then turns solid on a valid submit.
    The constellation is a small round chart with the alphabet on its rim; each letter of the name is a star
    on its own letter's bearing, joined in spelling order within a word.
13. **Extras for access.** A Pause button on the marquee (it also pauses on hover and on focus). Photograph
    panels are buttons: they open on hover and focus and stay open when pressed, so they work by touch. Small
    text over the sky always has its own solid ground.
14. **Images.** Panels ask for a small file at rest and a larger one the first time they open.

### Measured (headless Chromium, software rendering, on a shared 4 core machine under load)

- Weight: 312 KB for the whole page at both widths, all of it in the first view when the browser loads the
  lazy images early. Fonts are 83 KB of that.
- `report.json`: no console errors, no failed or outside requests, no sideways overflow, no unnamed controls,
  no image without `alt`, one `h1`.
- Frame times while scrolling the whole page in 9 seconds (best of three runs, machine load average 16 on 4
  cores): at 1440 by 900, median 16.7 ms, mean 25 ms, 95th percentile 50 ms; at 390 by 844, median 16.7 ms,
  mean 19 ms, 95th percentile 33 ms. With the sky not drawn and the type frozen the desktop mean falls only to
  20 ms, so most of the rest is this machine's load. Script and layout together cost under 2 ms a frame; the
  rest is painting, which this machine does without a graphics card.
- Text contrast checked by script in both modes at both widths, with errors showing and with the pass
  confirmed: nothing under 4.5 to 1 (3 to 1 for large type). Red on black is 5.9 to 1.
- The RSVP was run end to end by pointer and by keyboard alone at both widths; no request leaves the page,
  with or without scripting.

### Known weak spots

- On a laptop the hero letters cover most of the sky, so trails and meteors show only in the gaps there. They
  read best in The field, RSVP and the footer.
- On a phone the swell in the hero is small, because the letters are already near the narrow end of the axis.
- Only Chromium was tested. The silhouette and duotone filters, `overflow: clip`, and reading side bearings
  from a canvas are the parts most likely to behave differently in Safari or Firefox. If the canvas reading
  fails the lines fall back to their advance boxes and sit a few pixels off the margin.
- At device pixel ratio 2 on a laptop the frame times here were worse (software painting of a large canvas and
  very large glyphs). It should be checked on a real screen with a graphics card.
- With scripting off the big words keep fixed sizes and do not fill the measure, and the dial is hidden.
- The stars inside the photograph's glow are the photograph's own and do not turn with the canvas.
- On screens much wider than 1920 the right-hand figure covers the end of the T's bar.

