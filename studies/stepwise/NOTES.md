# Stepwise: a developer tool's site, rendered in dither

Sample 5 of 8. The brief the page was built to, then what was built.

## Client and job

- **Client type:** a developer tool or small software product (a library, an API, a command line tool).
- **Invented brand:** Stepwise, "STEP in, web out". The tool is real: it is the CAD pipeline behind this
  site's 3D (`tools/cad.py` and the loader `next/js/cad/cadmesh.js`; read `docs/recipes/cad-import.md` and
  `docs/design/3d.md`). It turns a STEP assembly into a small file a web page can load, keeping every CAD
  part name. Stepwise is only a product name put on it for the sample.
- **The one job:** get a developer from landing to first use. The install line with a copy button is on the
  first screen; a three-step quickstart (inspect, import, load) with real commands and real code follows;
  a short "request team access" email form closes the page. Copying and submitting both work in the page
  and both end on a note that this is a sample.

## References and what is taken from each

| Reference | What is taken |
|---|---|
| linear.app | Near-black ground, hairline borders at 5 to 8 percent white, small mono figure captions ("FIG 0.2"), medium-weight sans headlines set tight |
| vercel.com and the Geist pixel fonts | A visible column grid drawn in hairlines the full height of the page; pixel-stepped details |
| modal.com and neon.com | The product shown as a dot-matrix or dithered 3D object in one phosphor color instead of a screenshot |
| railway.com | A rail down the left edge that tracks progress through the page |
| warp.dev | All-caps mono labels in the bar; figures framed with a dot grid |

**What is its own:** the pictures are the product. Every 3D view on the page is one of the site's real CAD
models, loaded through the real loader and drawn in ordered dither in a single green. A "resolve" control
(and the scroll, in the hero) takes it from 1-bit dither to the fully shaded model, so the page shows what
the tool does: geometry in, pixels out. Hovering a part shows its real CAD name. The three quickstart steps
act on that same model: inspect lists its parts, import explodes it by its stored vectors, load turns it.

## Look

- **Color.** Ground `#090c10`, raised `#0f141a`, hairline `rgba(255,255,255,.08)`, ink `#e7edf3`, quiet
  `#8c98a6`, phosphor green `#4dff9a` (dither, links, the copy confirmation; never large fills), code
  comment `#5d6b7a`. Syntax colors are tints of the ink and the green only.
- **Type.** Headlines: Mona Sans, variable, expanded width (`font-stretch` about 120 percent), weight 500,
  tracking -0.02em, 40 to 76px. Text: Mona Sans normal width 16px. Labels, code and numerals: a monospace
  from Fontsource that is not Martian Mono, Space Mono or IBM Plex Mono (first choice Commit Mono, then
  JetBrains Mono), 12 to 13px, labels in capitals with +0.06em tracking.
- **Shape.** A 12-column grid whose column lines are drawn. Panels are rectangles with a 1px hairline and
  4px corners. Figures carry a caption bar: "FIG 01 / ROBO-CATCHER / 21,069 TRIANGLES / 348 KB".
- **Motion.** Precise and brief: 160 to 240ms ease-out for interface, the dither threshold animating as a
  model resolves, a typed terminal that prints real output line by line when it scrolls into view. No
  parallax, no floating blobs, no glow.

## Sections, top to bottom

1. **Bar** (fixed, hairline under). "stepwise" in mono, then DOCS, QUICKSTART, MODELS, and at right the
   version tag and a "GET STARTED" button.
2. **Hero.** Left six columns: label "STEP TO WEB", headline "STEP in. Web out.", two sentences, the install
   line in a code field with a copy button, and a second quiet link "Read the quickstart". Right six
   columns: FIG 01, the live model in dither with a resolve slider, an explode slider, and model tabs
   (Robo-Catcher, Rudder pedals, CHARGER). The part under the pointer shows its name.
3. **Quickstart** (three steps, each a row: text left, terminal or code right, the figure reacting).
   01 INSPECT: the part list a STEP file gives (use the real part names from the model's JSON). 02 IMPORT:
   the map file and the command, with the real options (up axis, origin, quality, explode). 03 LOAD: the
   real loader call and `setProgress`. Tabs where there are two files. Copy buttons on every block.
4. **What you get** (a bento of six panels on the grid). Keeps every part name. An explode vector per part.
   One small binary (give the real sizes). Any unit, Y or Z up. Repeated instances merged by one rule.
   A screenshot command that fails on console errors.
5. **Models** (a table). The three models with real numbers read from `next/assets/3d/*.json` and the file
   sizes: parts, triangles, bytes. Each row has a small dithered still.
6. **Team access.** One line, an email field, a button; then the sample note.
7. **Footer.** Mono, three columns, the sample line.

## Words

Brand voice: a good README. Short, exact, second person, present tense, no adjectives that are not
measurements. US spelling. No em or en dashes. Every capability claimed is one the real tool has (check the
two docs and `python3 tools/cad.py --help`); every number is read from the real files. Do not show the
Therma-Shift model.

## Invented

The name Stepwise, the install line (`npm i stepwise`), the command name in the examples (`stepwise inspect`
stands for `python3 tools/cad.py inspect`), the version tag and team access. The pipeline, its options, the
loader API and the numbers are real. Footer line: "A sample site by Mert Tureli. Stepwise is an invented
name and there is nothing to install. The pipeline is real: it is how the 3D on merttureli.com is made."

## Budget

First view (before three.js) under 350 KB, with a pre-rendered dithered still as the poster. Whole page
under 2.5 MB. One WebGL view on screen at a time, paused when off screen. With reduced motion: the model
is shown resolved and still, terminals show their full output at once.

## What was built

All seven sections are in the page in the order above. Every number comes from `next/assets/3d/*.json` and
the `.bin` sizes on disk. The terminals print what `tools/cad/pipeline.py` prints, built from each model's own
JSON header, and the rudder pedals map is the real `tools/cad/maps/rudder-pedals.json`.

**How the dither works** (`js/figure.js`). One WebGL renderer serves all four figures and draws only the one
on screen. Its frame is copied into that figure's 2D canvas, so the others keep their last frame as a still.
Each frame takes three passes. The first draws part ids and depth at cell resolution, for outlines and seams.
The second draws the CAD materials under the showreel's studio lights (`addStudioLights`,
`createStudioEnvironment`). The third is a full-screen pass that decides each cell. A cell is a whole number of
device pixels counted from the canvas corner, so the 8x8 Bayer pattern is locked to the screen: it does not
swim when the model turns, and the cells stay square and sharp. The 1-bit tone is a hard key light from the
upper left, scaled by how light each part's material is, because a 1-bit picture needs faces that differ a
lot. Resolve walks from 1-bit to 64 tone levels while the cells shrink to one pixel, then cross-fades to the
shaded render. Hovering raycasts against the part meshes: the part under the pointer is drawn solid, the rest
thin out, and a tooltip gives the part name, its label and its CAD names.

**Deviations.**
- The brief's code comment color `#5d6b7a` is 3.4 to 1 on the raised panel. The page uses `#74828f`
  (4.7 to 1). Quiet text stays `#8c98a6`.
- The rudder pedals open FIG 01, not the Robo-Catcher. They are the one model that came straight from a STEP
  file through `import`, so the quickstart shows a real map file and real output from the start.
- The inspect terminal leaves out the per-part size and color columns, and the import terminal leaves out the
  read and mesh times. The shipped files cannot tell them.
- The railway rail is a left rail on wide screens. Below 1020 px there is no room for it, so the bar grows a
  32 px strip with the way back on the left, the section in view on the right and a progress line along it.
- "Back to websites" is docked in the bar as a mono label between hairlines. A script checked every width from
  360 to 1920 at several scroll positions: it sits on no headline, control, copy button or field.

**Known weak spots.**
- The CHARGER model is the interior of a rocket, almost a meter long and 67 mm wide, with gaps where the body
  tube would be. Even laid on the diagonal it reads as five small pieces, and its 1-bit view is the thinnest
  on the page.
- The inspect terminal's suggested names sit right of very long CAD screw names, so on most screens you
  scroll the block sideways to see them. That is what the real tool prints.
- The figures render through SwiftShader in headless checks, so smoothness on a slow laptop GPU was not
  measured.
