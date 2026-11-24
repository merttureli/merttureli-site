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
| stedelijk.nl | A program set as large rows with a time at the left and an arrow at the right |
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
- **Shape.** Bands, rows, pill chips with a 1px cream outline, one circle (the rotating badge). Thick cream
  rules between program rows.
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
4. **Program** (indigo). Three nights as blocks of large rows: time in mono at left, the item in display
   type, an arrow. About four rows a night (gates, a talk on finding the radiant, scopes open, the watch).
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
