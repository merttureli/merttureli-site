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
