# Sideslip: a small hardware maker's site, drawn as an instrument panel

Sample 7 of 8. The brief the page was built to, then what was built.

## Client and job

- **Client type:** a one-person or small-batch maker of enthusiast hardware (sim gear, audio, keyboards,
  bike parts, cameras).
- **Invented brand:** Sideslip Instruments, product RP-3. A sideslip is flown with the rudder. The product is
  real: the three-axis flight sim rudder pedals from `content/projects/rudder-pedals.json`.
- **The one job:** try the pedals in the browser, then reserve a set from the next batch. "Try it" and
  "Reserve" are both on the first screen. The reserve flow is completed in the page (quantity, email,
  confirmation that says this is a sample and nothing was sent).

## References and what is taken from each

| Reference | What is taken |
|---|---|
| teenage.engineering | Outlined pictograms with tiny lowercase labels as navigation; thin light type at large sizes; red seven-segment readouts; product on flat gray; prices and actions set like panel legends |
| nothing.tech | Light gray `#f4f4f4` and near black with one signal color; everything labeled as if printed on the device |
| analogue.co | Black pill buttons; the product floating on a white to gray studio ground |
| A USB game controller test panel | The axes shown as raw numbers and bars, the way the operating system shows them |
| An aircraft panel placard | Engraved legends: small capitals in a box with rounded corners, a screw in each corner |

**What is its own:** the pedals work on the page. The CAD model moves through its real linkage: hold A or D
(or drag, or tilt a phone) for rudder left and right, W and E for the left and right toe brakes, and the
model answers while three seven-segment readouts show the axis values a simulator would see, 0 to 1023.
A second small instrument shows why there is nothing to wear out: a magnet sweeps past a Hall sensor and the
output trace follows it, with no contact.

## Look

- **Color.** Panel gray `#e7e8e6` (ground), plate `#f4f4f2` (raised panels), ink `#0c0c0c`, legend gray
  `#5b5d5a`, display black `#0a0a0a` (readout windows only), segment red `#ff2a1f` lit and `#3a0d0a` unlit,
  one indicator green `#19c15a` used only for "connected" lamps. No other color. No gradients except the
  ground shadow under the product.
- **Type.** Small, on purpose: this is the one sample with no large type. Albert Sans, variable. Nothing on
  the page is set larger than 28px (teenage.engineering's home page tops out at 26px); the product name is
  28px at weight 300, lowercase, tracking -0.02em. Legends are 10 to 11px, weight 500, lowercase, tracking
  +0.1em; body 15px. Hierarchy comes from the panels, the pictograms, the readouts and the model, not from
  size. Readouts are not a font: seven-segment digits are drawn in SVG or CSS so unlit segments show.
- **Shape.** Panels with a 1px ink outline and 6px corners, a screw head (a slotted circle) in each corner of
  the main panels, pill buttons in ink with plate text, pictograms on a 24px grid with a 1.5px stroke.
  Everything sits on a visible 8px module.
- **Motion.** Mechanical: readouts change at once, lamps blink on, toggles click over in 120ms, the model
  follows the input with a short spring. Nothing fades slowly. On load the readouts run a lamp test (all
  segments on, then count up to rest).

## Sections, top to bottom

1. **Legend bar** (top, not fixed on a phone). Left: the Sideslip mark (a small ball offset in a tube, as in
   a slip indicator) and "sideslip instruments". Then four pictogram links with tiny labels: product (pedals),
   try it (axes), inside (magnet), reserve (box). Right: "batch 02" with a green lamp and "reserve" pill.
2. **Hero** (panel gray). The pedals in live 3D fill most of the screen on a soft ground shadow (a rendered
   still first): the object is the headline. Top left, a small placard: "rp-3" at 28px and the legend
   "rudder pedals, three axes, no potentiometers". Below, the readout strip: X RUDDER, Y LEFT BRAKE, Z RIGHT BRAKE as three seven-segment
   windows with bar meters, and the key legends ("a", "d", "w", "e"). The strip is live from the first
   second.
3. **Try it** (plate). The full test panel: the 3D model large, the three axes, a differential braking
   lamp, on-screen pads for touch, a "sweep" switch that runs the model through yaw both ways, each toe
   brake, then differential braking (the sequence the source describes).
4. **Inside** (panel gray). Three instruments in a row, each a panel with screws: (a) Hall sensing: the
   magnet and sensor animation with its trace, "A1301 Hall effect sensor, a magnet on the moving part, no
   contact, nothing to wear"; (b) USB HID: a plug pictogram, a connected lamp, "shows up as a standard USB
   gamepad, no driver, any simulator"; (c) Geometry: a side view line drawing from the model, "fighter
   style geometry".
5. **Spec placard** (ink panel, plate text). A placard table: axes 3, sensors A1301 Hall effect x3,
   potentiometers 0, interface USB HID, controller Pro Micro, firmware C++, structure 3D printed.
6. **Reserve** (plate). Batch card: "batch 02", sets left as a seven-segment count, price, quantity stepper,
   email, "reserve" pill; then the confirmation.
7. **Footer** (panel gray). Pictogram row again, the sample line set as a placard.

## Words

Brand voice: a label maker's. Lowercase, a few words at a time, exact. US spelling. No em or en dashes.
Every fact about the pedals comes from `content/projects/rudder-pedals.json`; nothing else is claimed (no
travel, force, weight, dimensions, resolution or compatibility list beyond "any simulator").

## Invented

The brand, the name RP-3, the batch, the count of sets, the price ($240) and that the pedals are sold. The
pedals and how they work are real. Footer line: "A sample site by Mert Tureli. Sideslip Instruments is an
invented brand and nothing here is for sale. The pedals are real: I designed, printed, wired and programmed
them, and they are in daily use at my sim."

## Budget

First view (before three.js) under 350 KB. Whole page under 2.5 MB. One WebGL view, shared by the hero and
the test panel if both can be on screen, paused when off screen. With reduced motion: no lamp test, no
sweep by itself, the model moves only in direct answer to input.

## What was built

- **Files.** `index.html`, `css/sideslip.css`, `js/sideslip.js` (input, springs, readouts, the one loop),
  `js/seg.js` (seven-segment digits and LED bars in SVG and CSS, unlit segments visible), `js/hall.js`,
  `js/reserve.js`, `js/stage3d.js` (the WebGL view), `fonts/` (Albert Sans variable, Latin, with its license),
  `assets/` (two sizes of the hero still and the side view line drawing).
- **Linkage.** Not redone: `stage3d.js` imports `createModel` from the showreel actor
  (`next/js/showreel/rudder-pedals.js`), whose `setDrive(x)` and `setToe(l, r)` solve the lever arms, link rods,
  sensor lever and toe hinges from the CAD joints. Lights, environment, finish and ground shadow are the shared
  studio rig (`engine.js`, `look.js`). Three numbers pose it. The sweep program in `sideslip.js` follows the
  sequence the project describes (yaw both ways, each toe brake, then differential braking).
- **One WebGL view.** A single canvas moves to the slot (hero or test panel) that shows the larger share of the
  model's framed box below the bar, checked on scroll and resize, and draws nothing when neither shows it (or the
  tab is hidden). It fills the slot's inner box (inside its border). While a slot's top is under the sticky bar,
  the canvas starts at the bar (in 32px steps) and the camera draws only that lower window of the frame
  (`setViewOffset`), so the picture does not move and no part of the canvas sits above the window. three.js loads
  on idle after `load`.
- **Stills.** Rendered from the same stage in a one-off Playwright script (scratch folder, `tools/still.js`):
  the hero shot at 800 x 640 CSS pixels at 2x on a transparent background (re-rendered in the review round for the
  new framing), saved as webp with alpha at 1600
  and 800 wide, so the still and the live canvas line up in any box. The side view line drawing swaps every
  material for plate white and draws `EdgesGeometry` lines in ink, then is cropped.

### Deviations and why

- Pedals are red (`#d62a1f`) and the signal wires plate white on the model: the brief's palette has no product
  colors, and red is the page's one signal color. The levers and walls keep the studio grays.
- Added a "keyboard, as your feet" key map under the hero placard (desktop at 860px tall or more) to fill the column with an
  instrument rather than whitespace, and a small render of the set in the reserve card at 1280 and wider.
- The hero runs the sweep by itself after the lamp test until the first input (never with reduced motion).
- The Hall instrument plots output against magnet position (the transfer curve, lit near the magnet), not
  against time, so it reads the same with reduced motion. The field is a small bar magnet's, an illustration
  without claimed numbers.
- The phone and tablet heroes leave out the status lamps; touch screens show touch wording and no key caps.

### Review round (fixes to the critic's punch list)

- **First screen.** The hero grid is the window less the bar (no 680px floor, at most 960px) and the stage sits
  above the readout strip instead of behind it; the hero shot's lift went from .1 to -.02, so the model is centered
  in its frame with headroom. Checked by reading the WebGL buffer at full left and full right rudder: the model is
  whole inside its stage and the three readouts are on the first screen at 1920 x 1080, 1440 x 900, 1280 x 640,
  1040 x 600, 1024 x 768, 800 x 600, 768 x 1024, 390 x 844 and 360 x 640. Short wide screens drop the key map
  (under 860px) and the fact row (under 700px). 761 to 1039px: one bar row, a 280px copy column beside the stage
  (copy above a full width stage when the screen is upright). Phones: the stage takes the height left over.
- **Phone test panel.** Under 760px a compact row of the three readouts (24px digits) sits between the stage and
  the pads, so a held pad, the model and the numbers are in view together at 390 x 844 and 360 x 640. The view,
  sweep, center and tilt controls are one row; sweep, center and tilt are icon buttons (their names stay for
  screen readers).
- **Hall instrument.** The magnet's travel is kept to the span where the field only rises (plus or minus 0.22 of the
  drawing's unit, the peak is at 0.24) and that span is scaled to 0 to 1023, so the output runs one way from end to
  end of the slider (0, 150, 512, 873, 1023 at the five marks). The scope plots that span.
- **Inside.** The HID bars fill their panel and show the raw count beside each bar. The geometry drawing marks the
  pivot bolt and the arc of the pedal in red; the pivot was found by projecting the lever's fixed point and the
  pedal's path from the CAD linkage in the side shot.
- **Words.** Statements not in the project file are gone (lever arms that pivot at the top, the centering spring,
  "the springs center it"). Geometry is "fighter style geometry"; the hint says "let go and it returns to center".
- **Behavior.** A slider value holds while the slider is held and springs back on release, like a key. The
  differential braking lamp lights only with both brakes above 0.3 and 0.4 apart (the sweep's differential step
  now uses 1 and 0.4). Reserve: the stepper uses `aria-disabled`, so focus stays and repeated Enter on plus stays
  at the limit; at 0 sets left the form cannot be sent and both batch lamps read "batch 02 full"; start over
  resets the live text.
- **Small things.** Panels numbered 01 to 05 (the hero placard and the spec placard got theirs). One reserve
  control in the bar (the pill; the footer keeps the pictogram link). Skip link first in the tab order. Rudder
  scale label "512". Email placeholder `#5b5d5a`. The brand mark is now a straight tube with the ball centered
  between two reference lines.
- **The way back** is the outlined pill at the right of the bar. Since November 2026 it reads "sample site" (the
  owner's call), so nobody takes the reservation for a real one, and it stays on screen at every width: below
  1040, where the bar scrolls away, it is pinned at the top right and a 64px band of plate (`.dock::before`) runs
  behind it once the bar has gone. Its name for readers is "Sample site by Mert Tureli. Back to websites".
- **The cut-off render.** In headless Chromium the test panel's render looked cut along a horizontal line when its
  top was under the sticky bar, while the WebGL buffer itself was whole (read back after a render). The cut
  followed the canvas's offset above the window (visible height about H less twice the part above) and went away
  when nothing overlapped the canvas, so it is the headless compositor, not the renderer's size, viewport or
  scissor (scissor off, viewport the full buffer). Keeping the canvas below the bar (above) avoids it either way.
  One real sizing fault was fixed on the way: the buffer was sized from the slot's border box while the canvas
  showed in its padding box, so the picture was scaled by 2px.

### Known weak spots

- In headless Chromium (SwiftShader) a frame of the large canvas takes a second or more; the input is
  integrated in real time with substeps, so it stays right, but the motion there is not smooth.
- The geometry drawing is the CAD side view as is; at its size the springs still read as dense hatching.
- On a 768px wide tablet the readout bars are short (7 cells).
