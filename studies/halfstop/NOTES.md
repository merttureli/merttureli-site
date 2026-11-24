# Halfstop: a print shop set like a museum program

Sample 3 of 8. The brief the page was built to, then what was built.

## Client and job

- **Client type:** a small shop with a catalog (a photographer selling prints; the same shape fits a
  ceramicist, a bookshop, a furniture maker).
- **Invented brand:** Halfstop Editions, limited prints. A half stop is a small step of exposure. The
  photographs are real: Mert Tureli's (`next/assets/img/beyond/`).
- **The one job:** buy a print. From the first screen a visitor can open a print, choose size, paper and
  frame, see it to scale on a wall, add it to the bag, and check out. Checkout ends on a notice that this is a
  sample and nothing was ordered.

## References and what is taken from each

| Reference | What is taken |
|---|---|
| stedelijk.nl/en | The index as very large uppercase rows between thick black rules, with a small image set inside the line of type and an arrow; one loud sticker; the wordmark that shrinks into the bar |
| museum-gestaltung.ch/en | A strict three-column grid for everything that is not a row; bold section heads; hairline header |
| grillitype.com | Section rules with a label at the left and a link at the right |
| commercialtype.com | Full-width bands, one item per band, type as the image |
| A gallery wall label | The print's caption block: title, year, process, edition, set small and left |

**What is its own:** the wall. Any print can be seen at true scale on a wall beside a standing figure and a
sofa, drawn in line; change the size or the frame and it redraws. The row index is the whole shop: a row
opens in place into the print, its options and the wall, so nobody leaves the list to buy. The accent is
cyanotype blue, a print process, used for one thing only: what is in the bag.

## Look

- **Color.** Paper `#ffffff`, ink `#0a0a0a`, rule ink `#0a0a0a` at 3px, quiet text `#5c5c5c`, wall
  `#efefec`, cyanotype blue `#1034c6` (bag count, "Add to bag", the chosen option). One sticker in safety
  yellow `#ffe500` with ink text, rotated 8 degrees, on the first screen only. Photographs are the only
  other color. No gradients, no shadows, no rounded corners except the sticker.
- **Type.** One family, a tight neo-grotesk: Schibsted Grotesk (self-hosted woff2, variable). Rows:
  uppercase, weight 500, `clamp(44px, 8.2vw, 124px)`, line height .92, tracking -0.02em. Small text 13 to
  15px, weight 400 to 500, tabular numerals. Size alone makes the hierarchy: there are three sizes on the
  page (row, head, small) and no others.
- **Shape.** Rules and rectangles. Thick rule (3px) between rows, hairline (1px) inside panels. Everything
  aligns to a 12-column grid with 16px gutters; the row text bleeds off the right edge when it is long,
  as a museum program does.
- **Motion.** Almost none, and exact: a row inverts to ink on hover and focus in 120ms; a panel opens with a
  clip from its rule in 450ms `cubic-bezier(.2,.7,.1,1)`; the wall redraws with a 300ms scale; the wordmark
  shrinks into the bar over the first 300px of scroll. A large preview of the photograph follows the pointer
  over the rows (desktop pointers only).

## Sections, top to bottom

1. **Bar** (fixed, white, hairline under). Left: Index, Sizes and paper, About. Right: "Bag (0)". The
   wordmark docks into the center of the bar as the page scrolls.
2. **Masthead.** "HALFSTOP" as wide as the screen, the yellow sticker over its last letters ("12 new
   prints"), and under a thick rule one line: "Limited prints of light, weather and stone."
3. **Index** (the shop). Twelve rows. Each row: a number, the title in row type, the photograph as a small
   image inside the line, then edition and "from" price small, and an arrow. A row opens in place:
   left, the photograph large; right, the label block (title, where, process, edition), size (four),
   paper (two), frame (none, black, oak, white), the live price, "Add to bag"; under both, the wall view.
   Only one row is open at a time. Rows are buttons: Enter opens, Escape closes, arrows move between rows.
4. **Sizes and paper.** A three-column block: the four sizes drawn to scale against each other, the two
   papers described in two lines each, how a print is packed and sent.
5. **About.** Three short paragraphs in the first column, a portrait-format photograph in the second,
   the edition rules in the third.
6. **Newsletter row and footer.** One more full-width row ("NEW PRINTS, FIRST" with an email field in the
   line), then a black footer with the sample line.
7. **Bag** (a panel from the right). Items with thumbnail, options, quantity, remove; subtotal; "Check out"
   leads to the sample notice. The bag traps focus while open and returns it on close.

## The prints

Twelve, chosen for range: `alcazar-moon`, `alcazar-aerial`, `balloon-below`, `balloon-glory`, `burner-glow`,
`cathedral-dawn`, `lake-framed`, `lighthouse`, `moon-pines`, `newport-pier`, `rosa-rugosa`,
`shenandoah-tree` (swap one for `stargazers` or `sunburst-plain` if it reads better). Titles are plain
descriptions of what is in the frame, in uppercase ("MOON OVER THE ALCAZAR", "BALLOON, FROM BELOW",
"CRESCENT AND PINES"). For where and when, use only what the live site says about each photograph
(`next/index.html`, the `beyond` section, and `photography-*.html`); where it says nothing, leave the
place out rather than guess.

## Words

Brand voice: dry, exact, short. No exclamation marks. US spelling. No em or en dashes.

## Invented

The brand, the editions (each "Edition of 50"), the sizes and prices (8 x 10 in $60, 12 x 16 in $110,
18 x 24 in $190, 24 x 32 in $320; frame adds $90 to $240 by size; cotton rag is the base paper, baryta adds
$15), shipping and everything under About. The photographs are real. Footer line: "A sample site by Mert
Tureli. Halfstop Editions is an invented shop and nothing here is for sale. The photographs are mine."

## Budget

First view under 350 KB. Row thumbnails from the 480 files; the large image in an open row from the 1280
file, loaded when the row opens. Whole page under 2.5 MB before any row is opened. With reduced motion:
panels open at once, no pointer preview, no wordmark animation (it sits in the bar from the start).

## What was built

Files: `index.html`, `css/halfstop.css`, `js/halfstop.js` (entry: the docking wordmark, the newsletter row, section
links), `js/shop.js` (rows, open panel, wall, pointer preview), `js/bag.js` (the bag and its panel), `js/catalog.js`
(sizes, prices, wall geometry), `assets/figure.svg` and `assets/sofa.svg` (drawn for this page, 10 units to the inch),
`fonts/` (Schibsted Grotesk variable, Latin subset, with its license). The photographs are used in place from
`next/assets/img/beyond/`.

**The twelve titles.** "Moon over the Alcázar", "Alcázar from above", "Balloon from below", "Shadow in a glory",
"Burner at blue hour", "Cathedral at dawn", "Lake through pines", "Lighthouse behind branches", "Crescent and pines",
"Pier shack, still water", "Wild roses, a lake", "Dead tree, blue ridges". Places come from the photo list in
`next/beyond.html`: Segovia for the first six, Newport, Shenandoah. The lake, the lighthouse, the crescent and the
roses have no place there, so their label has no "Where" line.

**The wall.** A scale drawing in CSS inches: one custom property is the pixel size of an inch (container width over
232 in on a desktop, 160 on a tablet, 132 on a phone). The figure is 69 in, the sofa 84 by 32 in, the print hangs
with its center at 58 in. A size is the sheet: the photograph keeps its own ratio inside a white border of 0.5 to
2 in, and a frame adds 0.75 in a side. A Playwright check measures the drawing: 17.5 by 13.5 in for a framed
12 x 16, to within 0.15 in.

### Changed from the brief, and why

- **Row layout.** The number, the format, the edition, the "from" price and the arrow sit on a small line above the
  title, on the 12-column grid, not after it. A long title can then run off the right edge without taking the price
  and the arrow with it. The format (landscape or portrait, with its ratio) is an addition.
- **Titles tuned to the row.** Row type is sized from the page's inner width (without the scrollbar), capped at 158px.
  Titles were worded so that each one either fits or is cut by a full letter or more (four are cut: 01, 08, 10, 12),
  and no cut reads as a different word. "Balloon from below" lost its comma to end flush with the margin.
- **Portrait photographs open differently.** Photograph on four columns, the label beside it on three like a wall
  label, options on five. Landscape is as the brief: photograph on seven, label and options on five.
- **No year on the label.** The live site gives no dates. The label has title, where (if known), process, edition
  and format.
- **The image inside the sheet.** The four sizes are sheet sizes. The largest was 24 x 36 in in the brief, a 2:3 sheet
  that left very uneven borders around these 4:3 and 4:5 photographs; it is now 24 x 32 in at the same $320. The page
  says the image size under the options.
- **Docking distance.** The wordmark docks over the height of the masthead (253px of scroll at 1440, 60px at 390),
  not a fixed 300px, so it never crosses the rule under it.
- **Phone bar.** Two rows below 1100: the three links and the bag, then a 44px row the wordmark docks into, with the way back at its right. One row
  cannot hold all five.
- **Newsletter row is two lines.** "NEW PRINTS," then "FIRST" with the field in that line. On one line the type alone
  fills the row. On a phone the field goes under the type.
- **Masthead sticker** sits low on the P and over the rule, so the name stays readable.
- **Tabular numerals** only where figures stack (row numbers, row prices, option prices, quantity). In this face
  the tabular feature also widens commas and periods, which opened gaps in sentences and in "$1,150".
- **Weights.** Rows 500, wordmark 800, heads 700, small text 400 and 500. The About lede is set at head size.
- **Thumbnails below the first screen** are loaded by `js/shop.js`, not by `loading="lazy"` (Chrome fetched all
  twelve at once, 434 KB). They all load at the first scroll, key or touch. A `<noscript>` copy covers no JavaScript.
- **Additions.** "In the bag: n" on a row and the bag heading in blue; a "Close" control at the end of the wall;
  the large photograph has a 960 and a 1280 source; the pointer preview sits above or below the hovered row and
  shrinks if neither side has room, so it never covers that row or an open panel.

### Review round (fixes from a design critic)

- **The way back** is a cell of the bar: beside the bag from 1100 up, at the right of the wordmark row below that.
  Square, hairline sides, the page's small type. Measured inside the bar at 16 widths from 360 to 1920.
  It reads "Sample site" (November 2026, the owner's call) so nobody takes the prints for a real shop; its name
  for readers is "Sample site by Mert Tureli. Back to websites". It sits under the bag while the bag is open.
- **Sticker** hangs from the rule (it crosses it by 15% of its height at every width) and its text is sized from the
  circle: small type below 1600, head type from 1600, where the circle is large enough to hold it.
- **Section links** land exactly under the bar (one `scroll-padding-top`, no `scroll-margin`).
- **Bag announcements** go to a second live region inside the dialog while it is open.
- **Open panel from 1100 up:** photograph, label list and wall on columns 1 to 7; title and options on 8 to 12, sticky
  under the bar, so a change of size or frame redraws the wall in view and Add to bag is on screen at 1440 x 900 and
  1280 x 640, landscape and portrait.
- **Phone titles wrap:** the first word and the photograph, then the rest of the title.
- **Rows:** the same space, `max(18px, .36em)`, above the capitals and below the baseline in every row.
- **Figure redrawn:** weight on one leg, head turned toward the print, neck and hands; 2px outline, 1px inner lines.
  A dimension line runs under the sofa.
- **Dimensions:** sheets are written short by long side, what hangs is written width by height, both rounded to
  quarter inches from the stated ratio.
- **Reduced motion:** the bar's wordmark shows only once the masthead has passed.
- **Small things:** one print line stops at 5 and says "5 per order"; a double click on Add to bag cannot close the
  bag it opened; Remove has a 44px target; focus rings sit inside the bar's cells and on the bag's Close.

### Known weak spots

- **Small prints on a phone wall.** An inch is about 3px there, so an 8 x 10 in print is about 24px wide. True, but
  small.
- **The sticker's text** is small type in a 76 to 147px circle up to 1600 wide; it reads, but is quieter than the
  head type it has on large screens.
- **Browsers.** Checked in Chromium only (no Firefox or WebKit build on this machine). The wall uses container
  query units and the options use `:has()`; both have a script or CSS fallback that was not run in a real old
  browser.
