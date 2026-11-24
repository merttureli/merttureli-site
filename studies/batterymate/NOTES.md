# Batterymate: a sports hardware site that plays catch

Sample 4 of 8. The brief the page was built to, then what was built.

## Client and job

- **Client type:** a sports or fitness hardware startup selling to teams and coaches.
- **Invented brand:** Batterymate. In softball the pitcher and the catcher are battery mates. The machine is
  real: the Robo-Catcher from `content/projects/robo-catcher.json`, a machine that catches an incoming throw
  and returns it.
- **The one job:** book a demo for a team. "Book a demo" is on the first screen and in the bar. The booking
  is completed in the page: pick a slot from a week of practice times, team name, level, number of players,
  an email, and get a confirmation styled as a lineup card that says this is a sample and nothing was sent.

## References and what is taken from each

| Reference | What is taken |
|---|---|
| landonorris.com | Off-white with one fluorescent color and a dark band; thin contour lines drifting behind everything; very large capitals that mix a heavy face and an outlined one; a marquee of boxed letters |
| A stadium scoreboard | The spec table as a line score (innings across the top), numerals that flip, amber-free: white lamps on navy |
| nike.com and on.com product stories | One verb per screen, a product that is always moving, short commands as headlines |
| drinkghia.com | The ticker of short claims separated by a mark, run edge to edge |
| A softball | Optic yellow, and the red stitch: the seam curve is the page's one ornament and its scroll path |

**What is its own:** the page plays catch. The machine stands in the hero in live 3D; click, tap or press
Space and a ball leaves the pointer, arcs into the machine, the chamber turns 180 degrees and the flywheel
throws it back to where it came from. A scoreboard counts balls returned. The three-step explanation further
down is the same machine, driven by the scroll: catch, turn, return. Behind everything, where another site
would put a gradient, are the chalk lines of a softball field, drawn as the page is read.

## Look

- **Color.** Chalk `#f3f2ea` (ground), night navy `#0a1126` (dark bands and all ink), optic yellow `#dcff1f`
  (the ball, the action button, the highlight band; always with navy ink on it, never white), stitch red
  `#e03a2f` (the seam line and nothing else), line gray `#c9c8bd` (field lines on chalk), `#26304f` (field
  lines on navy). Photography is not used: every image is the machine in 3D or a line drawing.
- **Type.** Display: Sofia Sans Extra Condensed, variable, italic, weight 800 to 900, uppercase, line height
  .86, tracking -0.01em, sizes up to 22vw. An outlined version of the same face (`-webkit-text-stroke`, no
  fill) is used for the second line of a two-line headline. Text: Sofia Sans, 16 to 18px, weight 400 to 600.
  Scoreboard numerals: Sofia Sans Extra Condensed 800 upright, tabular.
- **Shape.** Hard edges, a 6 degree forward slant on buttons and tags (a parallelogram, the text stays
  upright), thick 2px navy outlines, the seam curve. No rounded cards, no soft shadows.
- **Motion.** Athletic: fast in, a small overshoot, quick settle (`cubic-bezier(.2,1.3,.3,1)`, 250 to 450ms).
  Headlines slam in from the left by line. The marquee leans with scroll speed. Numerals flip. The ball has
  real flight: gravity, a little spin, a shadow on the ground. With reduced motion none of that runs: the
  machine is still, a throw is shown as a dotted arc drawn at once, numerals just change.

## Sections, top to bottom

1. **Bar** (fixed). Left: "BATTERYMATE" wordmark. Right: How it works, The numbers, Book a demo (yellow
   parallelogram).
2. **Hero** (chalk, one screen). Headline in two lines, about 20vw: "IT THROWS" (filled navy) and "BACK."
   (outlined). The machine in 3D at the right, three quarters view, on a ground shadow. One sentence: "A
   machine that catches the ball and returns it." A prompt chip: "Click anywhere to throw". A small scoreboard
   in a corner: THROWN, RETURNED. Field lines behind (the arc of the outfield, a base path).
3. **Ticker** (navy band, yellow type). "100% FEED INDEXING ON COMPETITION DAY", "55 LB", "1.5 HOURS ON ONE
   BATTERY", "ASSEMBLES WITH NO TOOLS", "ONE PERSON PORTABLE", each separated by a small yellow ball.
4. **How it works** (chalk, pinned for about three screens). Left: a huge numeral and one verb per step:
   01 CATCH, 02 TURN, 03 RETURN, each with one sentence from the source (the rotating dual chamber, the 180
   degree turn, the 120 W return flywheel). Right: the same 3D machine, opened up enough to see the feeder,
   with a ball that follows the scroll through the three steps.
5. **The numbers** (navy). The line score: a scoreboard table with one stat per column (FEED 100%, WEIGHT
   55 LB, RUNTIME 1.5 HR, BATTERY 12 V 20 AH, TOOLS 0, CONTROL ESP32 + WIRELESS REMOTE), lamps that light
   left to right as it scrolls into view.
6. **Built for practice** (chalk). Three short blocks in a row, each a line drawing made from the 3D model
   and two sentences: carry it (55 lb, one person), set it up (no tools), run it (a wireless remote starts
   and stops it).
7. **Book a demo** (yellow band, navy ink). A week of slots as a fixtures list (day, time, open or taken),
   then the form. Then the lineup card confirmation.
8. **Footer** (navy). Wordmark very large, outlined, cut off by the bottom edge. The sample line.

## Words

Brand voice: a coach's. Short commands and plain facts, present tense. No exclamation marks. US spelling.
No em or en dashes. Every fact about the machine comes from `content/projects/robo-catcher.json`; do not add
speeds, distances, ball counts or anything else the source does not state. The cost of the build is not
used as a price: there are no prices on this page.

## Invented

The brand, the demo slots, and that the machine is offered to teams. The machine and its numbers are real.
Footer line: "A sample site by Mert Tureli. Batterymate is an invented brand and no demos are booked here.
The machine is real: the Robo-Catcher, built by a 12 person capstone team. I did its electronics and
firmware."

## Budget

First view (before three.js) under 350 KB, with a rendered still of the machine as the poster. Whole page
under 2.5 MB. One WebGL view at a time on screen, paused when off screen. The hero must stay responsive
while balls are in flight (cap balls in the air at 5).

## What was built

All eight sections as briefed, with the brief's words. The machine is the live Robo-Catcher model with the
showreel's look (`dressRoboCatcher`) and actor (`createModel`, `createAccent` imported, not copied); three.js loads
at idle after `load`. The throw is a small simulation (`js/sim.js`): flight with gravity and spin into the net, the
net gives, the ball drops, rolls down the bed into the chamber, the chamber turns 180 degrees, the flywheels throw it
back to the point it came from. At most five balls fly at once. The pinned "How it works" replays one recorded catch
from a pose table keyed by scroll (`js/poses.js`).

Deviations and why:
- The back pill is docked in the bar as a small slanted tag (beside the wordmark; on the bar's second row on a
  phone). Checked at every 10 px from 360 to 1920: inside the bar, clear of the wordmark, links and button. It is
  outside the hero, so a tap on it never throws.
- One WebGL canvas. On screen the live machine is always shown, in the hero or in the pinned window, whichever shows
  more of itself; the other, by then mostly scrolled away, keeps its rendered still. The hero draws only while
  something moves. The stills are otherwise only the poster before three.js is in and the picture for reduced motion
  and short screens. (A "machine cut short" seen in earlier reviews was never the page: an unclipped headless
  screenshot cuts a WebGL canvas that starts above the window. Captures are clipped to the viewport now.)
- The fixed field drawing is clipped by a `clip-path` on a layer of each band, not on the band itself.
- Taken slots stay focusable so a click or tap on one can say it is taken.

Stills: rendered from the page's own code with Playwright at 2x (scratch `tools/stills.js`), webp with alpha. Line
drawings: a solid pass and a line pass of the same model, composed with Pillow into navy line art (`tools/draw.js`,
`tools/ink.py`). Sofia Sans Extra Condensed italic holds up at 22vw; no other face was needed.

Review fix round (the critic's 13 items):
- Keys: Space throws only at the very top of the page (scroll under 40px, focus nowhere in particular); anywhere else
  it scrolls. Inside the pinned scene Space, Shift+Space, Page Down and Page Up step the page by 0.9 of a screen (the
  browser's own step there was about 60px). A field, a link or a button keeps its own keys.
- Hero: a grid, headline on top and copy at the foot, so they never overlap at any height; the headline size leaves
  the copy 250px (288px at 1440 x 900 as before, smaller only on short screens). The machine's box starts at 40% and
  at half the headline's size, so it is larger and its net rises behind "THROWS" (the type sits over the canvas).
- Short screens (under 561px tall: a phone on its side, 1280 at 200% zoom): no pinned scene, the steps stand one
  under another with their stills; on a narrow landscape screen the bar is one row and the machine sits beside
  the headline.
- The throw: balls in flight drawn 1.3x, easing to true size at the net; a shadow never fainter than 0.26 and
  tighter at height; a short navy speed streak under each ball in flight (2D canvas under the 3D one); an 80px
  yellow release ring with navy edges held about 450ms. A click with five balls in the air shows a crossed ring at
  the pointer with "Five in the air" and says so to screen readers.
- Pinned scene: the pitch starts inside the frame, so the ball is there from the first moment of CATCH and comes
  back to that spot in RETURN. The cage and the thrower's plates lift straight out of the frame and are hidden; in
  TURN the bed slides back and the view is nearly face on to the dual chamber, with an arc, an arrowhead and a
  degree count (0 to 180) drawn over the window as it turns. The step stills were re-rendered from the new poses
  with that overlay (scratch `fix/stills2.js`).
- Drawings: one set from one camera, one scale (all framed on the exploded machine's extent) and one line weight:
  the whole machine, a true exploded view (each part's explode vector times 1.7), and the whole machine at work
  with the ball leaving the wheels on a dotted arc (scratch `draw2.html`, `fix/draw2.js`).
- Lineup card: a headline built from the slot beside it ("SEE YOU THURSDAY."), the email in its own case, and it
  scrolls fully into view under the bar.
- Numbers: "EVERY BALL DELIVERED." filled, "NO MISSES." outlined; numerals at clamp(80px, 9vw, 160px) with the team
  column dropped to give them room; a lamp row of bulbs across the top lights one by one with the innings. Unlit
  numerals are #7d86a3 (4.9 to 1), readable even if the board is never seen lighting.
- Access: the skip link is the first tab stop, before the back tag. A failed submit speaks through one summary
  alert above the button; the notes under each field are plain text; a taken slot is announced in a polite status.

Known weak spots: SwiftShader renders the hero at a few frames a second, so headless timing of a throw is not the
real feel. A high throw from the top left starts with its shadow under the ticker for its first tenth of a second.
In TURN the drum floats once the bed slides back (a diagram view, not the assembled machine).
