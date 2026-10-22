# Add a project to the Studio showreel

The Studio hero (`next/`) plays one guest project per reel between the rocket leaving and coming back. A guest is an "actor": one JS module that follows the project actor interface at the top of `next/js/showreel/index.js`. One command writes a working actor and a lab page to build it in.

## 1. Scaffold

```sh
python3 tools/new.py actor robo-catcher --dry-run
python3 tools/new.py actor robo-catcher
```

| Writes | What it is |
|---|---|
| `next/js/showreel/<name>.js` | the model (placeholder parts), the accent object and the reel actor. Runs as is |
| `next/lab/<name>.html` | plays the actor exactly as the hero does and checks the interface |

| Option | Meaning |
|---|---|
| `<name>` | kebab-case key: file names and the `registerProject` key |
| `--word "Rudder pedals"` | the drift word that stands for it. Default: the word in `next/index.html` that matches the name (`robo-catcher` finds `Robo-Catcher`, `rudder-pedals` finds `Rudder pedals`) |
| `--dry-run`, `--force`, `--root DIR` | print only, overwrite, write into a copy |

It refuses existing module names (`engine`, `index`, `coaster`, `props`, `fx`) and keys already registered.

## 2. Build it in the lab

```sh
python3 -m http.server 8000 --bind 127.0.0.1
# open http://127.0.0.1:8000/next/lab/robo-catcher.html
```

| Lab control | Does |
|---|---|
| slider, play, 3x | scrub or play the whole reel, rocket windows included (the actor is hidden there) |
| abort | leave from the current frame, as when a visitor scrolls |
| word | toggle the drift word the actor must stay clear of (red box). Dashed box: the hero's free area |
| `#t=6.5` `#fast` `#q=low` `#shot` `#noword` | seek and pause, 3x, low quality, hide the panel, no word |
| panel line | must read "all 18 interface checks ok". `window.labReport` has the same for scripts |

The checks: required members exist, state names are unique and not `ROCKET_*`, hidden at rest and while the rocket flies, visible in its own states, `sample(T)` is a pure function of T, abort leaves fully, the word exists in `next/index.html`.

## 3. Make it real (edit `next/js/showreel/<name>.js`)

| Block | Change it to |
|---|---|
| `SEQUENCE` | state lengths in seconds. Keep the order or update `sample()`. Guest part 10 to 20 s |
| `MATERIALS` | matte and satin values (see `docs/design/3d.md`) |
| `PARTS` | one row per part in build order: shape, size, assembled position, explode offset, fly-in direction. `drive` marks the part `setDrive()` turns |
| `ACCENT` | the second object: Robo-Catcher's ball (color, radius), or swap `createAccent()` for the plane |
| `sample()` | the motion as a pure function of reel time. `v.drive` (-1..1) moves the mechanism, `v.acc` (0..1) brings the accent in |
| `createModel()` | later: replace the body with the CAD import (`docs/recipes/cad-import.md`). Keep the part names and the returned API |

Examples for the next two projects:

| Project | Model | drive | Accent |
|---|---|---|---|
| Robo-Catcher | the catcher's CAD parts | the catching arm | yellow-green ball arcing in |
| Rudder pedals | the pedal assembly | pedal travel (left -1, right +1) | small plane; yaw it from `v.drive` |

Rules: units meters, +Y up, origin at the footprint center. Never add lights, fog or an environment (the engine's rig lights everything). No `dt` or accumulated state in `sample()`. Watch triangles and draw calls in the lab status line.

## 4. Register it

When the lab is green, one command adds the actor to the hero rotation (it keeps your edited files and only registers):

```sh
python3 tools/new.py actor robo-catcher --register --dry-run   # shows what it would do
python3 tools/new.py actor robo-catcher --register
```

It inserts this line just above the "More guests" comment in `next/js/showreel/index.js` (by hand works too):

```js
registerProject({ key: 'robo-catcher', word: 'Robo-Catcher', actor: ctx => import('./robo-catcher.js').then(m => m.createActor(ctx)) });
```

Running it again is a no-op. It refuses a word that is not in the `.drift` markup (pass `--word` or `--force`). To take an actor out of the rotation, delete its line.

It loads lazily, so a broken actor logs a warning and the hero keeps working. The `word` must match a `.drift` `<i>` in `next/index.html`; add one there if it is missing.

## 5. See it in the hero and prove nothing broke

```sh
# http://127.0.0.1:8000/next/#reel-fast   (reel starts at once, 3x)
# projects take turns, one per reel: press c after each reel to reach yours
# console: __reel.seek(9) draws reel time 9 s; __reel.guest is the current actor
python3 tools/check.py
```

## Interface reference

`createActor(ctx)` where `ctx = { engine, quality }` resolves to:

| Member | Called by the hero |
|---|---|
| `group` | added to the shared scene once |
| `sequence` | `[[STATE, seconds], ...]`, placed between `ROCKET_EXIT` (2.1 s) and `ROCKET_RETURN` (2.6 s) |
| `layout(frame)` | on every resize: `{ halfW, halfH, camera, w, h, free: {l,t,r,b}, avoid: [rects] }` in canvas px |
| `sample(T, states)` | every reel frame; `states[NAME] = { t0, t1 }` in reel seconds |
| `beginAbort()`, `sampleAbort(u)` | visitor input mid-reel; u goes 0 to 1 over 1.5 s |
| `reset()` | back to rest, hidden |
| `update(dt, time)` | every frame while `visible` (fans, particles) |
| `prewarm(renderer, camera, scene)` | once before the first reel: compile shaders, upload textures |
| `visible` | getter; false when nothing is on screen |
