# Slow Roads: a travel journal made like a scrapbook

Sample 8 of 8. The brief the page was built to, then what was built.

## Client and job

- **Client type:** a person with a story and a list: a travel writer, a newsletter, a photographer's
  journal, a family or wedding trip page.
- **Invented brand:** Slow Roads, a journal of road trips, one trip per issue. This issue is real: a road
  trip up the Maine coast to Acadia, in Mert Tureli's photographs
  (`assets/photos/acadia-road-trip-photography/`, 26 files, 520 pixels wide).
- **The one job:** read the trip, then get the next one by email. "Get the next trip" is on the first
  screen and at the end. Subscribing is completed in the page and ends on a postcard that says this is a
  sample and nothing was sent.

## References and what is taken from each

| Reference | What is taken |
|---|---|
| deltacafes.com/en | Photographs as prints scattered at slight angles over a dark ground, overlapping, each with a white border |
| flamingoestate.com | Hand-drawn sticker badges tilted over photographs; cream and deep green |
| graza.co | A typewriter face for body text beside a large friendly display face; drawn doodles; buttons with a hard offset shadow |
| two26.studio | Text set on a curved path; small tilted labels pinned onto a headline |
| A national park passport book and a trailhead sign | Round cancellation stamps with a place and a date; routed capitals on brown |

**What is its own:** the photographs are small (520 pixels), so the page is built for small pictures:
prints on a desk. Each print can be picked up and moved, and comes forward when it is. A hand-drawn route
runs down the page and draws itself with the scroll, from the first road to the last sunset; as each stop
is reached a round stamp lands on the page, a little crooked, the way a real one does. Prints "develop":
they arrive white and the picture comes up over a second.

## Look

- **Color.** Desk `#22382c` (pine green, the ground of the first screen and the route sections), paper
  `#f3ead8` (the journal pages), kraft `#c9ab7c` (labels, the envelope), sign brown `#4f3422`, ink
  `#1d1a16`, sea blue `#2b6c93` (the route line), rose `#d6457f` (the one bright accent, from the wild
  roses in the photographs: stamps and the subscribe button), tape `rgba(240,214,120,.75)`.
- **Type.** Headings: National Park (the open face drawn from the routed park signs; from Fontsource if it
  is there, else Barlow Semi Condensed 700), capitals, tracking +0.04em. Body: Courier Prime 16px, line
  height 1.6. Handwritten notes on prints and margins: Mynerve (or Reenie Beanie), 22 to 28px. Three faces,
  each with one role.
- **Shape.** Prints with a white border (thicker at the foot), 1 to 4 degrees of tilt, a soft contact
  shadow, strips of tape. Stamps are circles of text on a path with a date across the middle, printed
  unevenly (an SVG filter gives the broken ink). Paper has a faint grain (an SVG noise filter, not an image
  file). The route is one SVG path with a dashed, slightly wobbly stroke.
- **Motion.** Physical: prints drop and settle with a small rotation, stamps land with a quick press and a
  lighter second impression, the route draws. Dragging a print has a little inertia. With reduced motion:
  everything is already in place, nothing drops, the route is fully drawn.

## Sections, top to bottom

1. **Cover** (desk green, one screen). A pile of five prints fanned at the right, a kraft label at the
   left: "SLOW ROADS", issue number, "Up the coast to Acadia", a handwritten "three days, one lighthouse,
   a lot of granite" (adjust to what the photographs show), and the subscribe button with a hard shadow.
   A note in handwriting with an arrow: "pick them up".
2. **The route** (paper). The whole trip as a hand-drawn strip map, not to scale and marked so: six stops
   named for what the photographs show (the road north, the lighthouse, the coast, the pond, the overlook,
   the summit at sunset). The line draws with the scroll.
3. **Six stops** (paper, alternating sides of the route). Each: a routed heading, a stamp, two to four
   prints taped down with handwritten captions, and three or four typewritten sentences that describe only
   what is in the pictures.
4. **The contact sheet** (desk green). Every photograph used, small, in rows like a film contact sheet with
   frame numbers; a chosen frame gets a grease-pencil circle; click to see it larger in place.
5. **Get the next trip** (kraft, an envelope). Email field on the envelope's address lines, the button a
   stamp. Then the postcard confirmation.
6. **Footer** (desk green). The sample line, handwritten.

## Words and pictures

Brand voice: a friend's notebook. First person plural, past tense, plain. US spelling. No em or en dashes.
Describe only what a photograph shows. The file names are the only source for places (`jordan-*` is
Jordan Pond with the Bubbles behind it; `lighthouse*` is a lighthouse; the rest are roads, coast, forest,
an overlook and a summit): do not name the lighthouse, give distances, times, road numbers or dates, and do
not invent events. Do not use the three photographs that show faces clearly (`summit-crew`, `self-mirror`,
`overlook-laugh`); people seen from behind are fine.

## Invented

The journal Slow Roads, its issue number and that it can be subscribed to. The trip and the photographs
are real. Footer line: "A sample site by Mert Tureli. Slow Roads is an invented journal and no emails are
collected. The photographs are mine, from a road trip to Acadia."

## Budget

First view under 400 KB. Whole page under 2 MB (the photographs are small). Dragging must work with a
mouse, with touch, and with the keyboard (a focused print moves with the arrow keys).

## What was built

Six sections as briefed, in `index.html`, `css/slowroads.css` and four small modules loaded by
`js/slowroads.js`: `prints.js` (pick up, move, let go), `road.js` (the route and the stamps), `sheet.js`
(the contact sheet), `post.js` (the envelope and the postcard).

**How the pieces are made**

- **Prints.** Each keeps its place in the layout and only gets `--dx`, `--dy` and `--tilt` when moved. Mouse:
  press and move. Touch: press and hold for a quarter second, then move (a quick swipe still scrolls the
  page; `touch-action: pan-y`). Keyboard: focus lifts a print, arrow keys move it 16px (48px with Shift),
  Escape puts it back. A print's middle stays inside its own section, and it lands a little crooked in the
  direction it was thrown.
- **The route.** Not a path file. `road.js` draws it at run time through invisible anchors that the
  stylesheet places (`[data-road]`), so one line follows the layout at any width: down the gutter between
  prints and text on a desk, down the left margin on a phone. Every leg gets one off-center bend, then the
  line is pushed sideways by smooth noise and dashed with dashes of different lengths.
- **Stamps.** Inline SVG, six different ones: four round (one with a double heavy ring, one beaded, one
  with three thin rings and the word OVERLOOK across the middle) and one rectangular, with the place on the
  rim and a drawn icon in the middle. Ink strength runs from .75 to .95, and three ink filters (`#ink-a`,
  `#ink-b`, `#ink-c`: fine grain plus large dry patches) wear neighbors differently. The coast stamp ran off
  the edge of the paper: on a desk a third of it is cut at the page edge (`.stamp-cut`, placed by
  `road.js`). A stamp lands as soon as its board's top passes 70% of the window, without waiting for the
  pen. A second, faint, offset copy is the lighter second impression.
- **Textures.** Paper grain, kraft fibers and desk felt are small SVG noise tiles used as repeating
  backgrounds, so no filter runs while the page scrolls. Live filters sit only on the six stamps, the
  postmark, the rubber stamp and the grease-pencil circle.
- **Doodles.** `assets/doodles.svg` is one sprite of 17 pen marks (arrows, map icons, waves, pines, the
  postmark bars), drawn from a few points each and shaken with noise. Tape is CSS.
- **The way back.** "Back to websites" is a kraft luggage tag tied to the top left corner of the page, not
  the fixed pill. It is placed in this sample's CSS, sits on bare desk above the label, and scrolls away
  with the cover: on a phone there is no margin where a fixed link could stay without covering prints,
  contact frames or the email field as they pass. Checked at 16 sizes from 360 to 1920 wide, at every scroll
  position: it is never over a headline, a print, a control or text. It is first in the tab order, and
  "Back to the top of the pile" in the footer leads back to it.

**Deviations from the brief, and why**

- The cover note reads "one lighthouse, one pond, a lot of granite". The photographs do not say how many
  days the trip took, so "three days" is out.
- Stamps carry an icon (or, once, the place) where a passport stamp has a date. The brief allows no dates.
- The button and the postage stamp use `#cf3b76`, a shade deeper than the rose `#d6457f` of the stamps.
  White type on the brief's rose is 4.2 to 1; on the deeper one it is 4.6 to 1.
- Six photographs are left out: the three named, and `overlook-sit`, `overlook-look` and `stand-cliff`,
  which each show part of a face. That leaves 20. No photograph is a print twice: the cover pile is
  `sky-wisps`, `sunset-poles`, `road-yellow`, `ridge-rock` and `jordan-shore`, the six stops hold the other
  15, and the contact sheet shows all 20. With the overlook photographs gone, stop 5 shows the trail and
  the snag only, and its text no longer mentions the view from the ledge.
- The postcard's postage stamp is a drawn sun on rose, not the lighthouse photograph.
- The kraft label lies on top of the loose prints, so a thrown print can never cover the subscribe button.
- Fonts are National Park (variable), Courier Prime 400 and 700, and Mynerve, from Fontsource, cut down to
  Basic Latin with fonttools (138 KB to 94 KB). None declares a reserved font name; licenses are in `fonts/`.
- Photographs are used in place as the 520px jpg files (no webp copies). No print is shown wider than 520px.
- The texture tiles are base64 in the stylesheet (their sources are in the comment above them) because the
  site's link check reads a nested `url(#id)` inside a data URI as a missing file.

**Measured** (headless Chromium, `tools/study-shots.js` and my own scripts, November 2026)

- After the review round (`tools/study-shots.js`): whole page 808 KB at both widths, no errors, failed or
  outside requests, overflow 0 at 1440 and 390, every caption on every print fully visible at 360 to 1920
  (checked point by point with `elementFromPoint`). At 1440 every print in view is in full color one second
  after it enters the window; at 1440, 768 and 390 every stamp has landed by the time its board is 66% down.
- Before the review round: whole page 874 KB at both widths. The first screen needs 383 KB (document, styles, scripts, four fonts,
  the doodles, five photographs). The browser's lazy-loading look-ahead fetches four to six more photographs
  before any scroll, which makes 470 KB on a phone and 548 KB on a desk arrive up front.
- Scrolling the whole page: median frame 16.7 ms, 95th percentile 16.8 ms at 1440 and at 390.
- Dragging a print: median 16.7 ms at both widths; 95th percentile 33 ms at 1440 and 16.8 ms at 390. The
  main thread uses about a quarter of each frame; the rest is painting.
- No console errors, failed requests, outside requests, sideways overflow (320 to 1920), unnamed controls or
  images without `alt`. 58 tab stops, all with a visible ring. Lowest text contrast 4.6 to 1.

**Known weak spots**

- Dragging at 1440 drops to 30 frames a second in bursts in the headless test (software painting, on a
  machine shared with other test runs), because the lifted print and its shadow repaint the prints under
  it. Promoting the print to its own layer did not help there; registering its offsets as non-inherited
  properties halved the style work. It needs a look on a real laptop and a real phone before this is called
  smooth.
- On a phone the route is still a margin line, and the prints, now about 220px wide so they can overlap,
  are smaller than before.
- The handwriting is one font, so the same letter is always the same shape, and the stamp wear is the same
  on every visit (three filters shared by six stamps). A second handwriting cut or per-visit filter seeds
  would make both less regular.
- The source photographs are small and heavily compressed; `road-yellow` and `bridge-rail` look soft even at
  print size.

**Review round (punch list of 13)**

- Prints develop from a light sepia (opacity .9) in 0.8s, start when they are 15% of a window below the
  fold, and are staggered by at most 80ms, so none is ever a blank hole on screen.
- 600 to 860 wide: prints sit two up, 58% and 46% wide, overlapping by 12%, the second set lower. Under 600:
  each print 67% wide, a third over its neighbor, tilted -4 and +3 degrees in turn, one per stop over the
  margin. In both, prints lie in the page flow (no fixed heights) and the stamp is pinned beside its board.
- The cover pile was re-seated so every caption is clear at every width (upper prints lie on lower ones).
- Typewriter text is `clamp(16px, 1.25vw, 19px)` in a column of up to 440px; stops are two columns of 1.25
  to 1, so desk prints are 400 to 430px wide at 1440.
- Captions and alt text were checked against each picture: the cove has a blue sky, the summit figure is
  lit, "looking out" replaces "looking back", and the sentences that guessed at what someone meant to do are
  gone. The pond note now reads "pink roses, gray stones"; the overlook note "blue paint on the bark".
- The strip map places the stops unevenly (heights 58, 41, 66, 30, 47, 22), the line makes one loop after
  the coast (desk only), and the pond's label sits across the line.
- A print keeps at least 60% of its width on screen whether it is dragged, thrown or moved by keys.
- The contact sheet shows upright frames upright, and the enlargement lies beside the sheet on a desk and
  below it under 861px, never over it.

