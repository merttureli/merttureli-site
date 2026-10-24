# Add or change a product's 3D viewer

Every project with a 3D model gets the same in-place viewer as the CHARGER explorer: click its tile's
"3D" button on the home page (or its live stage on the case page) and the tile grows to the full screen
while the model flies to the centre. One shell does everything that is the same for every product; a
product is one config module plus one registry line.

| File | What it is |
|---|---|
| `next/js/viewer/viewer.js` | the shell: dialog, grow transition, orbit / zoom / pan / reset, panel and phone sheet, numbered labels, group toggles, explode, section cut with caps, part cards, tour, custom-controls slot, focus trap, Esc, reduced motion, keep-warm and dispose |
| `next/js/viewer/launch.js` | the only part loaded with a page: triggers, URL hash, Back, deep links, prefetch near the viewport, pausing the hero and case stages |
| `next/js/viewer/products/index.js` | the registry: `slug: { load: () => import('./<slug>.js') }` |
| `next/js/viewer/products/<slug>.js` | a product config (default export) |
| `next/js/viewer/cad-product.js` | `cadProduct()`: a config from one cadmesh file in `next/assets/3d/` (the stubs use it) |
| `next/css/viewer.css` | the viewer's look (`.cx*`), loaded on demand |
| `next/css/showcase.css` | the page-side buttons: `.tile__3d` (home tile), `.stage__3d` (case stage) |

HOTBOX and the bend fixture never get a viewer (IP-limited, golden rule 4).

## Add a viewer in one module and one line

1. `next/js/viewer/products/my-thing.js`:

   ```js
   import { cadProduct } from '../cad-product.js';
   export default cadProduct({
     slug: 'my-thing',                 // = content/projects/<slug>.json, = the registry key
     file: 'my-thing.json',            // next/assets/3d/<file> (cadmesh, tools/cad.py import)
     name: 'My thing 3D model',        // the canvas's accessible name starts with this
     title: 'My thing',                // the big heading in the viewer
     eyebrow: 'Interactive / The CAD model',
   });
   ```

2. `next/js/viewer/products/index.js`: `'my-thing': { load: () => import('./my-thing.js') },`
3. The trigger. Home: a `<button class="tile__3d" type="button" data-viewer="my-thing" aria-label="Open My thing in 3D" hidden>3D</button>` as the last child of the tile's `<li>` (a sibling of `.tile__link`, never inside it) in `next/index.html`. Case page: add the slug to `VIEWER` in `tools/build-studio-cases.py` (the opening live stage gets the button and the page loads the launcher).
4. `python3 tools/build-studio-cases.py && python3 tools/build.py`, then `python3 tools/check.py --full --expect-change index.html,next/index.html,...`.

The stubs for Therma-Shift, Robo-Catcher and the rudder pedals are exactly step 1: every part of the file,
its label and its explode vector from the file, basic orbit. Fill them in from there.

## The config

Everything but `slug`, `title` and `build` is optional. `cadProduct({ file, materials, parts, ...config })`
supplies `prefetch` and `build`; any other field passes through.

| Field | Type | Default | What it does |
|---|---|---|---|
| `slug` | string | | ids, the `#3d-<slug>` hash, `data-viewer-slug` on the dialog |
| `title`, `eyebrow`, `name` | string | | heading, the mono label above it, the canvas's accessible name |
| `ghostWord` | string | none | the outlined word behind the model (CHARGER: `CHARGER`) |
| `text` | `{ key: string }` | see `TEXT` in viewer.js | any UI word: `close`, `panel`, `hint`, `explode`, `section`, `labels`, `tour`, `reset`, `skip`, `show`, `parts`, `whole` (said when the card closes) ... |
| `prefetch()` | `() => Promise` | | fetch the model data only (no decode); called near the viewport or on hover; must be safe to call many times |
| `build(ctx)` | `async ctx => ({ model, parts, ...hooks })` | | decode and return the scene (below); called on idle after prefetch, before the first open, CPU only |
| `fov` | degrees | `24` | the hero's lens; keep it so every product reads alike |
| `base(portrait)` | `bool => [x, y, z]` | `[.42, -.62, 0]` | home orientation, Euler XYZ in radians (a three-quarter view from a little above) |
| `roll0` | radians | `0` | home turn about the model's +Y axis (picking a part turns it about +Y to face you) |
| `fit` | 0..1 | `.9` | share of the frame the whole model fills at home |
| `center` | bool | `true` | move the model so its box centre sits on the orbit pivot |
| `uniqueMaterials` | bool | `true` | clone a material shared by two parts, so one part can ghost alone (a mesh shared by parts keeps its material) |
| `env` | bool | `true` | the studio environment (`createStudioEnvironment`, one PMREM per renderer) on every `MeshStandardMaterial` of the model that has no `envMap` yet, at `envMapIntensity x .55`, exactly as `engine.adopt()` gives the showreel's guests. CHARGER: `false` (the rocket is never adopted) |
| `clearHead` | bool | `true` | the model's frame starts below the title block at every width (CHARGER: `false`, its rocket runs under the title as it always has) |
| `tightBoxes` | bool | `false` | compute each part's box vertex by vertex (exact for turned parts); per part: `tight: true`. Or pass `box` yourself |
| `controlsSheet` | `'always'` or `'more'` | `'always'` | phones: your controls stay in the short sheet, or (`'more'`) show only when the sheet is open under More controls. One element can opt in alone with `class="cx__more"` |
| `groups` | `[{ key, label }]` | none | toggle chips under "Show" (shown with two or more); a part's `group` names one |
| `defaultGroup` | key or `null` | none | the group of a part without one. Without it such a part is in no group: it always shows and no chip hides it (the shell warns once; `null` says that is meant) |
| `sortParts(a, b)` | compare | config order | numbering order (CHARGER: nose to tail, `b.center.y - a.center.y`) |
| `ghost` | `{ exterior, interior }` | `.07, .16` | opacity of the other parts while one is picked |
| `cut` | `false` or `{ point, far, cap, keepAxis }` | off | the Section button: a plane through `point` (model space, default the box centre), normal toward the viewer, kept upright (`keepAxis`, holds +Y) and swept in from `far` (default .6 x box diagonal); caps in `cap` (default `0xd2cdc4`) |
| `tour` | `{ stops: [id], ms }` | none | the Tour button: picks each part in turn (`ms` each, default 3300); the line under each stop is its card `lede`. Never offered with reduced motion |
| `controls(ctx)` | `ctx => Element[]` | none | your own sliders and toggles, placed under the buttons in the panel (`.cx__row`, `.cx__btn`, `.cx__btns` give the house look) |
| `update(t, state, ctx, dt)` | `=> bool` | none | runs every frame while open (`t` seconds since open); return `true` while something of yours moves, so frames keep coming; call `ctx.invalidate()` after a control changes |
| `pose(state, ctx)` | | none | runs on every draw after the shell has placed the parts (base + explode): the place to add product motion to positions |
| `reset(state, ctx)` | | none | on open and on Reset view: put your motion back to rest |
| `ready(ctx)` | | none | once, after the scene graph is built (no renderer yet) |
| `gpu(ctx)` | | none | once per scene graph, when the renderer exists (`ctx.renderer`, `ctx.env`), before the shaders compile: GPU work such as your own render targets |
| `tourStop(i, id, ctx)`, `tourEnd(byUser, ctx)` | | none | at each tour stop and when the tour ends (the dialog also fires `viewer:tourstop` and `viewer:tourend` events) |
| `poses` | `{ tile(el, ctx), stage(el, ctx), hero(ctx) }` | fit into the media box | where the model starts when it flies in (and returns to): `{ q, p, target, dist, camRoll, R }` (pivot quaternion and position, camera target and distance, camera roll, screen rect). The default fits the home view into the clicked element's `.tile__media` / `.stage__live` box; CHARGER matches its tile poster and the hero exactly. On a case page the stage shows the showreel actor (`window.__caseStages[slug].actor`), posed differently from the viewer's home view: a `stage` pose read from it makes the hand-over seamless (today the model starts in the home view fitted into the stage) |

`update`, `pose`, `reset`, `ready`, `gpu`, `tourStop` and `tourEnd` may also be returned from `build()` (handy when they need the
objects `build` made); the build result wins.

### What `build` returns

```js
{
  model,                 // THREE.Object3D: the whole product (the shell parents it to its orbit pivot)
  parts: [{
    id,                  // any key, unique (cadProduct: the cadmesh part name)
    obj,                 // the Object3D the shell moves for explode (its position is base + explode * k)
    label,               // list, label tip and card title
    kind,                // the grey line under the label in the list, and the card's "NN / kind"
    group,               // a groups[].key
    explode,             // [x, y, z] metres (model space) at 100 %, or a number = along +Y
    exterior,            // false: an inside part (ghosts less when another part is picked)
    anchor,              // its numbered label: [x, y, z] offset from the box centre, or (out, P, ctx) => out, a model-space point read every frame
    follow,              // an Object3D whose motion (beyond explode) the label and the focus follow, e.g. a lever that swings
    tag,                 // false: no numbered label for this part
    list,                // false: not numbered, no row in the list and no label (a prop: a mug, a can); still framed, picked and ghosted
    shown,               // false: starts hidden; ctx.setShown(id, true) fades it in (props, options)
    frame,               // false: left out of the home framing
    card: { title, lede, desc, rows: [['Role', '...'], ['Material', '...']] },   // rows with an empty value are left out
    meshes, box,         // optional: the shell finds the meshes under obj, and the model-space box. A mesh may sit outside obj
                         // (the shell then shows and hides it with the part) and may be listed by several parts: it then
                         // follows the most opaque of them, and a pick on it goes to the picked one
  }],
  dispose,               // optional: free what the shell cannot see (cadmesh: cad.dispose())
}
```

The shell owns each part `obj`'s position. Move a child of it (a rotor, a pedal arm), its rotation, or add
offsets in `pose()`. Products never add lights or environments: the viewer uses `addStudioLights` from
`showreel/engine.js`, like the hero. Materials follow [3d.md](../design/3d.md#materials).

### `ctx` (what hooks receive)

`THREE`, `Y` (the +Y unit vector), `scene`, `pivot`, `model`, `camera`, `renderer` and `env` (from the first
open on; null before), `parts` (the shell's part records: `id, n, label, obj, meshes, box, center, dir,
opacity, ghost, visible, shown, data`), `part(id)`, `state` (`explode` 0..1, `explodeGoal`, `cutOn`, `cutT`,
`selected`, `tour`, `groups`, `t`, `phase`), `invalidate()`, `live(text)` (screen reader announcement),
`rect` (the frame the model is drawn in), `size`, `reduced`, `roll0`, `fov`, and:

| Call | Does |
|---|---|
| `ctx.setExplode(v, { instant })` | sets the explode amount (0..1) from your code: the slider follows; no input event, so the tour and your own slider listeners do not react |
| `ctx.setShown(id, on)` | shows or hides one part (fades like a group chip) |
| `ctx.view.set({ yaw, pitch, roll, zoom, pan, focus, rate })` | drives the camera for your motion: yaw and pitch (radians, from home, the drag's axes) or `orbit` (a quaternion), roll about +Y, zoom (1 = fit, smaller is closer), pan (world metres), focus (a part id to frame, or null), rate (how fast it eases, 1/s, default 7). The view eases there as it does for the user; any drag, wheel or Reset view takes over and puts the rate back |
| `ctx.view.home()`, `ctx.view.get()` | back to the home view; the current goals |

The viewer's own handle (`__viewer.api(slug)`) has the same `setView`, `setShown` and `ctx`.

### Minimal example with motion

```js
import { cadProduct } from '../cad-product.js';
let spin = false, rotor = null;
export default cadProduct({
  slug: 'my-thing', file: 'my-thing.json', title: 'My thing',
  groups: [{ key: 'shell', label: 'Shell' }, { key: 'inside', label: 'Inside' }],
  cut: {},
  tour: { stops: ['blower', 'board'] },
  parts: (list, cad) => {
    rotor = cad.parts.blower.getObjectByName('rotor');
    return list.map(p => ({ ...p, group: p.id === 'shell' ? 'shell' : 'inside', exterior: p.id === 'shell',
      card: { title: p.label, lede: 'One short line.', rows: [['Role', '...']] } }));
  },
  controls: ctx => {
    const b = document.createElement('button');
    b.className = 'cx__btn'; b.type = 'button'; b.textContent = 'Spin'; b.setAttribute('aria-pressed', 'false');
    b.onclick = () => { spin = !spin; b.setAttribute('aria-pressed', String(spin)); ctx.invalidate(); };
    return [b];
  },
  update: (t, state, ctx, dt) => { if (!spin || ctx.reduced) return false; rotor.rotation.y += dt * 6; return true; },
  reset: () => { spin = false; if (rotor) rotor.rotation.y = 0; },
});
```

Copy rules still hold in a config: labels and card text are copy (golden rules 2, 3, 10). Use the words the
owner already approved (the case JSON, the cadmesh labels, `part-stories.js`); list anything new as a flag.

## Entry points (all products feel the same)

| Where | Trigger | Grows from | Address |
|---|---|---|---|
| Home, CHARGER | the explorer tile (`[data-explorer-link]`) and the hero rocket at rest | the tile / the hero canvas | `#charger` |
| Home, other products | the "3D" button on the work tile (the rest of the tile opens the case page) | the tile | `#3d-<slug>` |
| Case page | a click on the opening live stage, or its "Explore in 3D" button | the stage card | `#explore` |

Loading an address opens the viewer directly. Back, Esc or the close button closes it, focus returns to the
trigger and the page is where it was. While open, the hero showreel (`window.__reel.pause()`) and every case
stage (`window.__caseStages[key].hold(true)`, which keeps the visitor's own Pause) stop drawing.

The shell code and config load when a trigger nears the viewport (600 px); the model data when it is
hovered, focused or touched (an `eager: true` registry entry, CHARGER, fetches it near the viewport); the
scene graph is decoded on idle. The renderer is made on the first open, shrunk to 1 x 1 px on close and
disposed 3 minutes later.

## Test and debug

| Want | Do |
|---|---|
| Open one from the console | `__viewer.open('therma-shift')`, `__viewer.close()`, `__viewer.api('therma-shift')` (`.parts`, `.view`, `.select(id)`, `.setExplode(.6)`, `.setCut(true)`, `.startTour()`, `.stats`, `.info()`) |
| CHARGER's own handle | `__explorer.open()`, `__explorer.api` (kept for its tests) |
| Hold the grow halfway (for a still) | `window.__cxFlyU = .5` before the click, `delete window.__cxFlyU` after |
| Shader errors | add `?debug` to the address |
| Headless | `window.__reelNoSlowGuard = true` in an init script; swiftshader works (`--use-angle=swiftshader`) |

Check at 390 x 844 and 1440 x 900: open, explode, cut, card, tour; 0 console errors, 0 failed requests.
