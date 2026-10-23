# Bring a STEP file into 3D

`tools/cad.py` turns a STEP assembly (AP214 or AP203, any unit, named parts) into the files the site loads, keeping every CAD part name. Reading and meshing take seconds. Look rules and budgets: [3d.md](../design/3d.md).

## One time per machine

```sh
CAD_VENV=<scratchpad>/cadvenv python3 tools/cad.py setup     # about 30 s: venv + cadquery-ocp 7.9.3.1.1 + numpy (1.3 GB)
```

Pass the same `CAD_VENV=...` on every later `tools/cad.py` call (or `export` it). Without it the venv goes to `<tmp>/merttureli-cad-venv`. Never put the venv in the repo. `python3 tools/cad.py doctor` says whether it is ready; `python3 tools/cad.py selftest` builds a Z-up test assembly (sub-assembly, 4 screw instances, a color) and checks names, axes, units, merging and the glb.

## The five-minute path

Which format for which target: showreel actor = `cadmesh` (the default); the charger-style explorer = `explorer`;
the rocket hero = `hero`; a download or another tool = `glb`. Details in "Where the files go" below.

Keep the owner's STEP outside the repo (scratchpad) unless they ask for it to be published. IP rule: before you mesh,
read the part list `inspect` prints; no part of HOTBOX or the bend fixture is ever imported or animated (CLAUDE.md rule 4).

```sh
export CAD_VENV=<scratchpad>/cadvenv
python3 tools/cad.py inspect OWNER.step                                   # parts, sizes, colors, unit
python3 tools/cad.py inspect OWNER.step --map-out <scratchpad>/NAME.json    # first look: starter map outside the repo
python3 tools/cad.py inspect OWNER.step --map-out tools/cad/maps/NAME.json  # once the model is going on the site: commit this map
# edit the map (table below). Therma-Shift already has one: tools/cad/maps/therma-shift.json
python3 tools/cad.py import OWNER.step --map tools/cad/maps/NAME.json --out <scratchpad>/cad-NAME --dry-run
python3 tools/cad.py import OWNER.step --map tools/cad/maps/NAME.json --out <scratchpad>/cad-NAME
python3 tools/cad.py view <scratchpad>/cad-NAME --serve PORT                # orbit, explode slider, part list, hover to find a part
python3 tools/cad.py shot <scratchpad>/cad-NAME --port PORT                 # NAME-shot.png + NAME-shot-exploded.png, fails on console errors
```

Then drop `--out` so the files go to the map's `out` (usually `next/assets/3d/`), and wire them in (next sections).

What `inspect` tells you and what to do about it:

| You see | Do |
|---|---|
| `unit inch` (or m) | nothing: OpenCascade converts to mm on read |
| longest side is z and the model lies flat in the viewer | add `"up": "z"` to the map (or `--up z`) |
| names like `Part1`, `Body`, `NAUO12` | ask the owner for named parts, or match by path and size in the map |
| `M3x6 Screw-1 ... -4` | repeated instances: merge them with one rule (`"match": "M3x6 Screw*", "name": "screws"`) |

## Map file (`tools/cad/maps/<name>.json`)

The map makes a re-import one command: `python3 tools/cad.py import NEW.step --map tools/cad/maps/NAME.json`. Command-line flags override map values.

| Key | Meaning | Default |
|---|---|---|
| `name` | output file stem | file stem |
| `source` | STEP path relative to the repo (lets you omit the STEP argument) | |
| `out` | output folder relative to the repo | new temp dir |
| `formats` | any of `cadmesh`, `glb`, `explorer`, `hero` | `["cadmesh"]` |
| `files` | rename outputs, e.g. `{"explorer": "assembly"}` | `NAME`, `NAME-assembly`, `NAME-hero` |
| `up` | source up axis: `y z -z x -x -y` | `y` |
| `origin` | `center`, `bottom`, `top` (highest point at y = 0), `keep` (CAD origin) | `center` |
| `quality` | `low`, `medium`, `high` (chordal deflection .0008, .0003, .00012 of the assembly diagonal) | `medium` |
| `deflection`, `angle` | override, in mm and radians | |
| `explode` | automatic explode offset = (part center - assembly center) x this | `1.0` |
| `unmatched` | parts no rule matches: `keep` (auto names) or `skip` | `keep` |
| `order` | build order of part names (getParts order) when it differs from rule order | first rule per name |
| `normals` | `false` leaves normals out (loader computes them) | `true` |
| `parts` | rules, tried top to bottom, first match wins | |

Rule keys:

| Key | Meaning |
|---|---|
| `match` | CAD name or glob, or a list; case-insensitive; tested on the CAD name, product name and `Assembly/Sub/Part` path |
| `name` | showreel part name, camelCase. Same name on several rules merges them into one part |
| `sub` | named child Group inside the part with its own pivot (a rotor, an arm, an LED) |
| `label` | human label (explorer list, viewer) |
| `material` | palette key from `tools/cad/palette.json` (table in 3d.md). No key: the STEP color, else `default` |
| `color` | override just the color (`"#c0c5cd"`) |
| `explode_mm` | explode offset in output axes, mm (copy a procedural actor's values x 1000) |
| `exterior`, `referenceOnly` | explorer flags (cutaway, part list) |
| `id` | fixed part id for the explorer and hero formats |
| `deflection`, `angle` | coarser or finer mesh for this part |
| `skip` | leave the part out |
| `note` | free text |

Put specific patterns above generic ones (`*blower*rotor*` above `*blower*`, `*blower*` above `*housing*`). The import prints which parts matched no rule.

## Where the files go

| Target | Format | Put files in | Load with |
|---|---|---|---|
| Studio showreel guest | `cadmesh` | `next/assets/3d/NAME.json/.bin` | `next/js/cad/cadmesh.js` (`python3 tools/cad.py loader` copies it there) |
| Studio hero rocket (new rocket CAD) | `hero` | `next/assets/3d/charger-hero.json/.bin` (`"files": {"hero": "charger-hero"}`) | `hero3d.js` as is; materials follow `id` (0 nose, 1-2 tubes with livery, 6-9 fins, 10-11 rail buttons, 19 screw cap) |
| An explorer like CHARGER's | `explorer` | the explorer folder as `assembly.json/.bin` (`"files": {"explorer": "assembly"}`) | `app.js` (CHARGER-specific: stories by `id` in `part-stories.js`, hotspots at ids 0, 14, 18) |
| Download, other tools, studies | `glb` | next to the page | any glTF viewer; nodes named by showreel name, `extras` hold label and CAD names |

All are meters, +Y up. Artifact previews rename `.bin` to `.bin.wasm` and `.glb` to `.glb.wasm`; `cadmesh.js` tries `.bin.wasm` by itself when `.bin` is missing.

## Swap the procedural Therma-Shift coaster for the real CAD

The showreel round 2 is merged, so this is open. It changes the live Studio hero: get the owner's go first.

```sh
python3 tools/cad.py inspect THERMA.step                     # fix the "match" patterns in tools/cad/maps/therma-shift.json
python3 tools/cad.py import THERMA.step --map tools/cad/maps/therma-shift.json --dry-run
python3 tools/cad.py import THERMA.step --map tools/cad/maps/therma-shift.json     # -> next/assets/3d/therma-shift.*
python3 tools/cad.py loader                                  # -> next/js/cad/cadmesh.js
cp next/js/showreel/coaster.js <scratchpad>/coaster-procedural.js   # keep the old one to compare
cp tools/cad/actor-adapter.js next/js/showreel/coaster.js
# look: http://127.0.0.1:PORT/next/#reel-coaster ; console: __reel.seek(6)
python3 tools/check.py
```

`actor-adapter.js` keeps the coaster API that `index.js` uses: the same 8 part names, arrival windows, lateral-first board and thermistor, plate temperature tint, blower `rotor` spin, Peltier and thermistor hidden when assembled, plate top at y = 0. It loads the model at module top level, so a missing file makes `import('./coaster.js')` fail and the hero falls back to its placeholder. Rehearsed end to end on a synthetic Z-up coaster STEP: 0 console errors in the real reel.

## Robo-Catcher, rudder pedals (scaffolded actors)

1. `python3 tools/new.py actor robo-catcher` ([showreel-actor.md](showreel-actor.md)). Its `PARTS` rows name the parts.
2. `python3 tools/cad.py inspect ROBO.step --map-out tools/cad/maps/robo-catcher.json`; set each rule's `name` to a `PARTS` row name; use `"origin": "keep"` if a part turns about a hinge.
3. Import (`--out next/assets/3d/`) and `python3 tools/cad.py loader`.
4. Replace the body of `createModel()` in the actor, keeping its returned API:

```js
import { fetchCadMesh, buildCadMesh } from '../cad/cadmesh.js';
const CAD = await fetchCadMesh(new URL('../../assets/3d/robo-catcher.json', import.meta.url));

export function createModel({ THREE: T = THREE, quality = 'high' } = {}) {
  const m = buildCadMesh(T, CAD.meta, CAD.buf);
  m.group.name = KEY;
  // hinge: CAD point in mm, origin "keep", --up z turns (x, y, z) into (x, z, -y)
  // m.setPivot('arm', [0.012, 0.085, 0]);
  const size = new T.Box3().setFromObject(m.group).getSize(new T.Vector3());
  const dirs = Object.fromEntries(PARTS.map(r => [r.name, r.dir]));
  return {
    group: m.group, height: size.y, footprint: Math.max(size.x, size.z), triangles: m.triangles,
    getParts: () => m.getParts().map(p => ({ ...p, dir: dirs[p.name] })),
    setProgress: m.setProgress,
    setDrive(x) { if (m.parts.arm) m.parts.arm.rotation.z = Math.max(-1, Math.min(1, x)) * 0.6; },
    update() {}, dispose: m.dispose,
  };
}
```

## Loader API (`tools/cad/cadmesh.js`)

| Call | Returns |
|---|---|
| `await loadCadMesh(THREE, url, opts)` | fetch + build |
| `await fetchCadMesh(url)` then `buildCadMesh(THREE, meta, buf, opts)` | fetch once at module top, build per factory call |
| `.group` | Group named after the model; one child Group per part at its pivot |
| `.getParts()` | `[{ name, mesh, explode }]` in build order (same shape as `coaster.js`) |
| `.parts.NAME` | the part Group; subs are named children |
| `.setProgress(p)` | 0 exploded, 1 assembled (smootherstep, no stagger) |
| `.setPivot(name, [x, y, z])` | move a pivot (parent space, meters) without moving the part; keeps explode working |
| `.materials` | shared `MeshStandardMaterial` per palette key; `opts.materials = { topPlate: {} }` gives a part its own |
| `.triangles`, `.meta`, `.dispose()` | |

## When something goes wrong

| Message | Fix |
|---|---|
| `no CAD venv at ...` | `CAD_VENV=... python3 tools/cad.py setup`, or pass the `CAD_VENV` you used before |
| `pip install failed` | `export PIP_CERT=/root/.ccr/ca-bundle.crt` and rerun setup (see `/root/.ccr/README.md`) |
| `OpenCascade could not read` | not a STEP file, or damaged: ask for an AP214 export |
| `over the showreel budget` with `parts ... OVER` | merge parts in the map (several CAD names -> one `name`) or skip hidden ones; the line says how many to lose |
| `over the showreel budget` with `triangles ... OVER` | coarser `deflection`/`angle` on the heavy parts it names, or `--quality low` |
| part flies the wrong way or sits off center | set `explode_mm` on its rule; check `up` and `origin` |
| `unknown material` | pick a key from `tools/cad/palette.json`, or add one (3d.md) |
| model lies on its side | `--up z` (or `-z`, `x`) |
| explorer stops at load (`storyFor` error) | its hotspot ids 0, 14, 18 must exist: set `id` in the map |

## Proof on the CHARGER STEP

```sh
python3 tools/cad.py import --map tools/cad/maps/charger.json --out <scratchpad>/cad-charger    # about 2 s, all four formats
```

Results (Oct 2026): 25 parts, 17,320 triangles. Part bounds match the shipped `assembly.json` within 0.09 mm. The `explorer` output dropped into a copy of `assets/charger-explorer/` renders with livery, stories and part list and 0 console errors (after changing its hotspot id 18, a part this STEP does not have, to 16). The `hero` output loads in `hero3d.js` and matches the shipped rocket. The glb loads in trimesh with all 25 named nodes.
