# Hand-off: hero realism

Local work, never pushed and never merged. The owner decides when it is pushed.

| Branch | What | Base |
|---|---|---|
| `opt/hero-realism` | The realistic hero showreel, the four 3D viewers in the same look, the random opening, the lag pass | `main` `750185f` |

## Recovery (2026-11-20)

The cloud machine that held the branch was replaced. The six original commits were lost; the branch was rebuilt
from the published preview (https://claude.ai/artifact/TGX9UKk1m536maxKAUsn9y). Proof: `python3 tools/preview.py studio`
run on the rebuilt tree gives the published preview byte for byte (368 files).

Lost, because they were never published: the earlier hand-off notes, the edits to `docs/design/3d.md`,
`docs/design/motion.md` and `docs/recipes/showreel-actor.md` (they still describe the fixed reel order), the scratch
capture tools and pixel fences, and the measurements. The one tool change that was known is restored
(`tools/render-loops/stage.html`, below).

**Backup.** The preview artifact carries `backup/branches.bundle.wasm`: a git bundle of the branch (the `.wasm`
name is only so the host accepts a binary file). Restore: read that path with the Artifact tool, then
`git fetch <saved file> 'refs/heads/*:refs/heads/*'`. After every commit: `git bundle create <file>
main..opt/hero-realism` and publish it to the same path (content type `application/wasm`).

**Rebuilding from the preview again, if it is ever needed.** Published paths are `next/`-relative. Undo the preview's
rewrites in text files: `.bin.wasm` to `.bin`, `site/` to the root `assets/`, `shared/` to `studies/shared/`. The
published `index.html` carries the host's wrapper (its first line and last two lines); `next/index.html` itself is
unchanged from `main`.

## What the branch changes over `main`

| Where | What |
|---|---|
| `next/js/showreel/look.js` (new) | The studio look: materials, micro textures, environment, ground shadow, `ROCKET_LOOK`, `RUDDER_PRESETS`, `dressRocket`, `dressRudderPedals`, `dressRoboCatcher`, `dressThermaShift` |
| `next/js/showreel/coaster-geo.js`, `coaster-shade.js`, `coaster-tex.js` (new), `coaster.js`, `cable.js`, `props.js`, `fx.js` | Therma-Shift from the measured design: real parts, frost and steam, mug and can |
| `next/js/showreel/rudder-pedals.js` | Pedal travel from the CAD (levers 17 degrees, sensor lever 30, toe brake 21) |
| `next/js/showreel/robo-catcher.js` | The owner's materials, a rope net that takes the hit, two balls at real speeds |
| `next/js/hero3d.js`, `next/js/showreel/flame.js` | The painted rocket and its plume on the fly-in |
| `next/js/showreel/index.js`, `engine.js` | The reel's state machine: random opening, the lag pass, the phone fit of Therma-Shift |
| `next/js/viewer/viewer.js`, `products/*.js`, `products/charger-finish.js` (new) | The four viewers in their reel's look, material rows on the part cards, CHARGER's insides |
| `next/js/case-stage.js`, `next/lab/*.html`, `next/lab/look.html` (new) | Case stages and lab pages on the same look |
| `next/assets/loops/*`, `next/assets/img/stills/*`, `next/assets/img/hero-land.webp`, `hero-port.webp` | Card loops, stills and hero posters rendered in the look |
| `tools/render-loops/stage.html` | Therma-Shift tile: `objects()` takes the coaster and its siblings one level up (not `lookGround`), `FIT` is `fill: [.5, .5], at: [.55, .6]` |

## Values the owner asked for

- CHARGER paint is satin: `ROCKET_LOOK.paint` roughness .55, clearcoat .55, clearcoatRoughness .3, coat 1.25.
- Pedal layer lines nearly invisible: `RUDDER_PRESETS.plastic` micro normal .045, micro roughness .015.
- Therma-Shift on the phone hero only: `frameInfo` sets `hero: true`; `createThermaShift` `layout` uses `tight`
  (.44 of the height, .62 of the width). Case stages and stills keep the larger fit.
- Random opening (`chooseOrder`): CHARGER and the three guests shuffled per load; the opener is never the last
  load's (`localStorage` `reel:opener`). Fixed order under `navigator.webdriver`, with `#reel-` or `?reel=`, or on a
  viewer address. `window.__reelOrder` (`'fixed'`, `'random'`, or an array of keys) overrides; `__reel.order` reports.
  A guest opener waits up to 6 s (`OPEN_WAIT`) for its build, then the rocket flies in instead.
- Lag: no guest build during the fly-in or within 4 s of an input; build steps and the shared studio run as
  separate tasks (`nextTask`); `createGovernor` steps the pixel ratio down (2, 1.5, 1.25, 1) when the median of 60
  frames is over 22 ms, restores it if the floor bought nothing, and is off under automation.
- Owner's facts used: Robo-Catcher has PVC poles and a rope net, wood panels with a rubbery finish, a metal wire
  feeder cage, a 3D printed rotating chamber, a metal thrower enclosure with metal gears, plastic rims with rubber
  on top, a real softball. CHARGER has a cardboard body tube, plywood fins, 3D printed internals, placeholder
  boards, plastic rail buttons and three 9 V batteries behind the PCB holder (two side by side the long way, one
  across the top). The old Battery card is removed.

## Re-rendering

- Card loops: `node tools/render-loops.js [key ...]` (about 20 minutes for all four without a GPU).
- Stills: `python3 tools/stills.py [--only TEXT]`.
- Hero posters: capture the resting rocket at 2400 x 1350 and 1200 x 1600, then `python3 tools/media.py image
  <png> --preset hero|hero-portrait --name hero-land|hero-port --out next/assets/img --force`. The capture script
  was a scratch tool and is gone.

## Open for the owner

1. Push the branch as a draft pull request (no merge). Until then the only copies are this machine and the backup.
2. The viewer card wording (rule 2: no copy without the owner). In the code now, waiting for his yes line by line:
   pedals levers 17 degrees (was 11), sensor lever 30 (new line), toe brake 21 (was 16), pedals "3D printed";
   Robo-Catcher material rows (poles and net, panels, ground ball ramps, feeder cage, chamber, flywheels, thrower
   base, idler gears and plates); CHARGER material rows (body tubes cardboard, fins plywood, rail buttons plastic,
   printed internals), the middle PCB holder's new description and role, "The board shown is a placeholder" on the
   altimeter. The pedal review lab page still says 11, 20 and 16 degrees.
3. Fly-in: keep the camera pull-back or not; smoke crosses the name for about 2 s.
4. Is the 6 s wait for a guest opener right; should the Therma-Shift card be framed tighter; was the oversized
   coaster seen on a phone.
5. Older: Robo-Catcher throw speed, toe brake real travel, frost or dew on Therma-Shift, og images in the old look.

## The look pass on the remaining flat images

The owner asked for a quick look at the site's images, then approved the result with two notes (below). It sits on
top of the hero work as its own commits.

| Page | Before | After |
|---|---|---|
| Robo-Catcher, "The feeder" and "Electronics and firmware" | Three small CAD screenshots | `assets/renders/robo-catcher/chamber.webp`, `feeder.webp`, `flywheel.webp`: the same parts rendered from the viewer's model (parts isolated, soft floor shadow, transparent ground) |
| CHARGER spec sheet, "next project" card | `next/assets/img/charger-work.webp`, the older flat rocket | The same file, made from the current satin poster at the same size and place |

Only image sources changed (`content/projects/robo-catcher.json`); no words.

- The owner found the first renders warped: they used the viewer's tilted home view. They now stand on the model's
  own up axis, turned and tipped .3 rad toward the camera, under a 12 degree lens (the viewer's `pivot` is turned
  for one frame, its camera and lights stay). The flywheel is seen from the front in the viewer's narrow layout
  (700 px wide): its idler gear meshes are low in detail and look crumpled from the side.
- The owner asked that his photography stay exactly as on the live site. The home page's "Beyond engineering"
  section, `beyond.html`, `photography-gallery.html` and the Websites page (its browser mock holds one of his
  photos) are byte for byte `main`. A first version of this pass had changed the rocket in that mock; it is back.
- For the owner: the first image's description still says "Indexer cross-section" and the render shows the chamber
  whole; the old feeder screenshot showed a laser cut box and the render shows the wire cage he described.
