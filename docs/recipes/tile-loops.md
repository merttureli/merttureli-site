# Tile loops: the Studio home's product clips

The CHARGER, Robo-Catcher, rudder pedals and Therma-Shift tiles on `next/index.html` show each product in the hero's look: a grey window onto the hero stage with a poster, and a short seamless loop rendered from the hero showreel's own actors (same engine, rig, environment, materials and soft shadow). HOTBOX and the bend fixture are IP-limited: they keep their blurred stills and are never animated, so the tool has no key for them.

## Re-render after a showreel change

```
node tools/render-loops.js                       # all four, about 20 minutes on the container's software WebGL
node tools/render-loops.js therma-shift          # one
node tools/render-loops.js robo-catcher --keep   # keep the PNG frames (path printed) to inspect them
python3 tools/check.py --full --expect-change next/index.html
```

Re-render whenever an actor in `next/js/showreel/` changes look or motion, or a model in `next/assets/3d/` changes. The markup does not change: the file names stay the same. The tool serves the repo itself on `127.0.0.1:9152` (`--port` to change it), blocks analytics and form hosts and never POSTs.

## What it writes (`next/assets/loops/`)

| File | What | Budget |
|---|---|---|
| `<key>-loop.webm` | VP9 clip at tile size (CHARGER 960x540, Robo-Catcher and pedals 720x480, Therma-Shift 900x450), 30 fps | under 560 KB (`--max-kb`): the tool raises the crf until it fits |
| `<key>-loop.mp4` | H.264 fallback for browsers without VP9 | same cap |
| `<key>-loop-<w>.webp` | posters: frame 0 of the loop at the clip width (1x) and twice it (2x) | |

Frames are rendered at twice the clip size and scaled down (supersampling). Frame 0 is the poster, so play starts on the frame already showing.

## How it works

| Piece | Job |
|---|---|
| `tools/render-loops.js` | the driver: Playwright (from `/opt/node22`), one page per key, a screenshot per frame, then ffmpeg |
| `tools/render-loops/stage.html` | mounts the real showreel (`mountShowreel`), pauses it, builds the actor with the hero's own factory (`__reel.projects`), lays it out in the frame, then poses it per frame. `LOOPS` holds each loop as a pure function of loop time; `FIT` how much of the frame the product fills |
| `next/js/clips.js` | plays the clip on hover (fine pointer) or while most of it is on screen (touch), pauses otherwise, adds `.is-live` once a frame plays. Reduced motion or Save-Data: nothing loads and the poster stays |
| `next/css/showcase.css` "product stages" | the grey window per tile (`--ar` is the clip aspect); the clip keeps its aspect inside and its edges feather into the window's grey, so the window can take any shape at any width |

The loops (each closes on itself: `pose(seconds)` equals `pose(0)`):

| Key | Loop | Seconds |
|---|---|---|
| `charger` | the hero rocket (its own look, never adopted) in the hero's land framing, one full roll with the hero's bob and its CSS shadow | 8 |
| `robo-catcher` | the reel's catch cycle, PITCH to the end of THROW; flywheels at a constant whole number of turns; starts with the ball in the net | 7.9 |
| `rudder-pedals` | assembled with springs and wiring: right, left, center, then each toe brake; a small sway; no aircraft | 6.4 |
| `therma-shift` | mug lands and steams on the hot plate, swap, can chills and beads, can leaves and the plate returns to neutral; holds shortened; starts with the mug steaming | 11.4 |

Preview a loop live in the browser: serve the repo (`python3 tools/build.py --serve 9152`) and open `/tools/render-loops/stage.html#therma-shift`.

## Change a loop

- Different poster moment: change `start` in that loop (loop time 0 is the poster).
- Bigger or smaller product: `FIT[key].fill` (share of the frame width and height) and `at` (its center).
- Longer or shorter: the segment lengths (Therma-Shift) or the keyed programs (pedals). Keep each loop under about 12 s so it fits the budget.
- New tile clip for a new showreel actor: add a `LOOPS` entry and a `JOBS` row (render size, clip size, poster widths), then copy a stage tile's media markup in `next/index.html` and set its `--ar`.
