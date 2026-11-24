# Albada: a booking site that is one morning long

Sample 2 of 8. The brief the page was built to, then what was built.

## Client and job

- **Client type:** a small experience operator (hospitality, tours, anything booked by date).
- **Invented brand:** Albada, hot-air balloon flights at dawn over Segovia, Spain. "Albada" is a song sung at
  dawn. The photographs are real: Mert Tureli's, from a balloon morning over Segovia
  (`next/assets/img/beyond/`).
- **The one job:** book a flight. "Book a flight" is on the first screen and in the bar the whole way down.
  The booking is completed in the page: pick a morning on a calendar, the basket (shared or private), the
  number of passengers, see the total, give a name and an email, and get a confirmation styled as a boarding
  card that says this is a sample and nothing was sent.

## References and what is taken from each

| Reference | What is taken |
|---|---|
| casamomo.at | A dark first screen with cream type; a very large serif wordmark; a small square "Book" tag instead of a loud button; the arch-topped image |
| kinfolk.com | Centered small capitals, generous white, a hairline and a quiet link |
| deltacafes.com/en | Photographs scattered at slight angles as a loose collage, one section only |
| monocle.com | Small-caps labels with a time or a place before every block, set like a timetable |
| The aqueduct of Segovia | The arch. Every framed photograph on the page is seen through an arch, and one section is a two-tier arcade of them |

**What is its own:** the page is the morning. The background color is driven by the scroll and moves through
the real colors of that morning, sampled from the photographs: night field, burner glow, dawn peach, gold on
the stone, pale sky above the cloud, breakfast cream. A thin flight strip on the left edge carries a small
balloon that climbs and comes back down as the page is read, with the clock time beside it. The wordmark's
letters lift off one by one, each at its own rate, like the balloons do.

## Look

- **Color (a dawn sequence, top to bottom).** Night field `#0c1220`; burner `#f4a23a` (accent on dark only);
  first light `#2b3558`; dawn peach `#f1c6a4`; stone gold `#ecd9b4`; above the cloud `#dfe7ee`; breakfast
  cream `#f7f0e3`. Ink on light `#1c2019` (a green-black, from the fields); ink on dark `#f7ecd6`.
  One action color, terracotta `#b4532a` (the roofs), used only for the Book tag, the chosen day and links.
  Check every text and background pair along the sequence for 4.5 to 1: where the background is mid-tone
  (first light to dawn peach), switch the ink at the right point rather than letting it fade through gray.
- **Type.** Display: Ibarra Real Nova (the Spanish Royal Academy's 1780 type, revived; self-hosted woff2):
  wordmark and headlines in capitals with +0.02em tracking and in italic for times and asides. Text and
  labels: Hanken Grotesk, 16 to 18px, labels 12px in small capitals with +0.12em tracking. Numerals in the
  timetable and prices: Ibarra Real Nova italic, old style.
- **Shape.** Arches (a full round top, square foot) and hairlines. No rounded cards, no drop shadows, no
  pills. Buttons are small square tags with a 1px border and an arrow.
- **Motion.** Slow and weightless: 1.2s ease-out rises, photographs that drift a few percent slower than the
  page, the balloon glyph on the strip, the wordmark lift-off on load. Nothing snaps, nothing spins. The
  background color follows the scroll continuously.

## Sections, top to bottom

1. **Bar** (fixed, transparent, ink follows the background). Left: "Albada". Center: the clock time of the
   section in view, in italic. Right: "The morning", "The basket", "Questions", and the Book tag.
2. **06:40, the field** (night). Full-bleed `burner-glow`: the burner lighting the field before dawn. The
   wordmark "ALBADA" very large across the bottom, letters rising into place. Under it, one line: "Balloon
   flights at dawn over Segovia." Bottom right: next open morning and the Book tag.
3. **The morning, hour by hour** (the color journey). Five timed chapters, each a label (time and place), a
   two-line headline, three sentences and one or two arch-framed photographs:
   06:40 the field (`envelope-inflation`), 07:15 lift-off (`cathedral-dawn`, `balloons-dusk`), 07:40 over the
   city (`alcazar-aerial`, `segovia-dawn`, `sunburst-plain`), 08:10 above the cloud (`balloon-glory`: the
   balloon's own shadow ringed by a halo on the cloud; say what it is), 08:40 down in the fields
   (`cathedral-fields`, `balloon`).
4. **The arcade** (stone gold). A two-tier row of arches, as in the aqueduct, each arch a window on one
   photograph; it scrolls sideways with the page on desktop and by touch on a phone. Captions under the piers.
5. **The basket** (above the cloud). Two columns: Shared basket and Private basket, each with a price, what
   is included, and who it suits. Then a short timetable of the morning set in small capitals.
6. **Questions** (cream). Six plain questions that open in place (weather, what to wear, children, how
   long, where to meet, refunds).
7. **Book** (cream). Left: a month calendar (flight mornings marked, some full, past days off), basket
   choice, passenger stepper (1 to 8, private fixed at 2), live total. Right: name, email, "Request this
   flight". Then the boarding card confirmation in place of the form.
8. **Footer** (night again, the day closes). Wordmark, the sample line.

## Words

Brand voice: calm, plain, second person, present tense. No exclamation marks. US spelling. No em or en
dashes. Short Spanish is fine where it is certain ("Buenos días"). Name only what the photographs show
(the Alcázar, the cathedral, the fields, the cloud). Do not state history, heights, distances or records
about Segovia.

- Hero line: "Balloon flights at dawn over Segovia."
- Chapter headlines: "It starts in the dark." / "Then the ground lets go." / "The city, before it wakes." /
  "Above the cloud, a halo." / "Down in the wheat, breakfast."
- Booking heading: "Choose your morning."

## Invented

The brand, the flights, the prices (Shared basket 175 euros a person, Private basket 750 euros for two), the
timetable, the calendar and every answer under Questions. The photographs and the morning are real. If a
real balloon company's name or logo can be read on an envelope in a photograph, crop or choose another
photograph. Footer line: "A sample site by Mert Tureli. Albada is an invented brand and no flights are sold
here. The photographs are mine, from a balloon morning over Segovia."

## Budget

First view under 500 KB (one hero photograph, sized for the screen, plus fonts). Photographs lazy, with
`srcset` from the 480, 960, 1280 and 1920 files that exist. Whole page under 3.5 MB. With reduced motion:
no drift, no lift-off, no balloon travel; the background still changes by section, in steps.

## What was built

One page, no build step: `index.html`, `css/albada.css`, `js/albada.js` (scroll, rises, menu),
`js/journey.js` (the color math) and `js/booking.js` (calendar, total, boarding card). Fonts are the Latin
variable files from Fontsource (Ibarra Real Nova roman and italic, Hanken Grotesk). Photographs are read in
place from `next/assets/img/beyond/`; all thirteen Segovia photographs are used, the film is not.

**How the color journey works.** Each section carries its ground as `--sec-bg` in the CSS. The script reads
them, mixes in OKLab against the scroll and writes one `--bg`, `--ink`, `--accent` and `--action` on the
root. The ink is picked from the luminance of the ground: cream on dark, green-black on light, and in the
narrow band where neither reaches 4.5 to 1 it goes to pure white or pure black and flips once
(`inkFor` in `journey.js`). Measured every 24 px of scroll: lowest ink contrast 5.2 at 1440 wide, 4.7 at
390 wide. Without the script, or with reduced motion, the same CSS values paint the sections in steps.

**Deviations from the brief, and why**

- **Display size.** Headlines are 6.8vw (98px at 1440, capped at 140px), line height 1.0. Text grows with
  the screen (`clamp(1rem, .72rem + .5vw, 1.375rem)`: 16px on a phone, 19px at 1440, 21px at 1920); labels
  are 12px, 13px from 1440; notes and captions are one 14px size. Nothing else in the sans. Tracking stays at the
  brief's +0.02em because the headlines are capitals.
- **Three colors a screen.** The Book tag is burner amber on the dark grounds and terracotta on the light
  ones, so a screen never shows more than ground, ink and one action color. Terracotta as small text only
  reaches 4.4 to 1 on cream, so links are ink with a terracotta rule, and the tag is white on terracotta
  (4.99 to 1).
- **Colors between the stops.** First light to dawn peach passes through plum `#8a5470` and apricot
  `#e69a6a` (a straight mix is gray). The pale stops pass through a lighter tint (`data-via` on the
  section) so the mix never looks dirty.
- **Order of the pale stops.** 08:10 is on "above the cloud" and 08:40 on stone gold, which then carries into
  the arcade; the basket returns to the pale sky, then cream, as in the brief's section list.
- **The arcade.** Six bays, two arches each, twelve different photographs (all but the hero). The hero
  photograph is not repeated. `balloon-below` is the arch beside Questions. The arcade's title walks past
  with the arches when it is pinned (900px and wider, 560px and taller); otherwise the title sits above a
  strip that scrolls sideways by touch, trackpad or arrow keys.
- **The flight strip** shows from 1100px wide, only while the flight lasts (it fades in after the first
  screen and leaves when the arcade starts). Narrower screens get the running clock in the bar instead.
- **07:15 photographs.** Both balloons in `balloons-dusk` and the one in `cathedral-dawn` sit at the top
  edge of the frame, where a round arch cuts in. Those two arches are anchored to the top of the photograph
  and drift as whole frames instead of drifting inside the frame. `cathedral-dawn` is cropped to the dome
  and the balloon; the tall tower is outside the arch.
- **Confirmation.** The boarding card replaces the form and the section headline becomes
  "Buenos días, (first name)." so there is one large statement on screen, not two.
- **Bar.** Transparent only at rest on the first screen. From scrollY 8 it carries a veil of the current
  ground color with a soft lower edge, so text passing under it does not collide with the bar's labels.
  The hero's top shade is .75 night under the bar, so the labels read at 10 to 1 or better at rest.
- **Phone menu.** The three bar links move into a full-screen sheet ("Menu"), with the arcade, the
  booking and "Back to websites" added. On short screens it starts under the bar and scrolls.

**Review round (critic's punch list)**

- **The way back** is no longer the shared pill. From 900 wide it is a 44px circle with an arrow in the left
  gutter at the bottom, hairline, in the ink of the ground under it; the words show on hover and focus. Under
  900 it is the same arrow docked in the bar before the wordmark. Checked over the whole scroll at 360, 390,
  768, 1024, 1440 and 1920: it never sits on a headline, a control or a field (the calendar, the FAQ, the
  hero line). The bar's clock now centers in the room between the name and the menu, and hides under 380.
- **Long jumps** (more than two screens) cut inside a view transition instead of racing through every
  ground; with reduced motion or without view transitions they jump. The booking's scroll margin is set by
  the script so the calendar head and its rows land in view (checked at 1440 x 900 and 1280 x 640).
- **The arcade** holds still for 40vh of the pin, the title fades over 300px and never slides under an
  edge, and the six bays end whole with the same margin on both sides. Not pinned, the strip shows a thin
  scrollbar.
- **Footer wordmark** uses the hero's letters at the hero's width; centered at 1920 and 2560.
- **Photographs:** `sizes` now follows the cover crop and zoom (audited at 1440, 1920 and 390 at 2x);
  a 7 percent SVG grain lies over the hero.
- **Air and alignment:** timetable numerals 64px with the note on the heading row; on a phone the numerals
  have their own column. Under 900 every text block starts at the page margin; arches are capped at 70svh;
  two fare columns from 600.
- **Words:** "calm air", "about an hour and a half in the air" (both places), "nobody else in the basket",
  "pick you up".
- **States:** `:active` on every control, hover on FAQ rows and basket options, an arch outline on open
  mornings at rest, and a visible line under the calendar when a full or closed day is clicked ("That
  morning is full."), scrolled into sight if the tap was near the foot of the screen.

**Known weak spots**

- The hero photograph only exists 1280px wide (portrait), so it is enlarged on wide screens. The grain
  hides most of that, but above about 1600px it is still softer than the rest.
- The collage captions are rotated with their photographs; rotated 12px capitals are slightly soft on
  low-density screens.
- The right balloon in `balloons-dusk` clears the arch by a few pixels. It is whole, but close.
- "Which mornings are full" is a fixed function of the date (`createSchedule` in `booking.js`), and the
  calendar is built from today's date, so screenshots differ from day to day.
- Inside the Websites page's preview frame the pinned arcade depends on the frame being at least 900 by
  560; smaller frames get the sideways strip.

**Checked.** `node tools/study-shots.js albada` (no errors, no failed or outside requests, no overflow, no
unnamed controls, no missing alt), the booking by mouse and by keyboard only, and `python3 tools/check.py
--fast` (nothing under `studies/albada/` fails).
