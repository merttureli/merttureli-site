# VX ARCHITECTURE — "PAD ONE" (spine) with grafts

Read BRIEF.md first. This document is the contract every builder codes against. Where this document and a concept document disagree, this document wins.

## 0. The concept in one paragraph

merttureli.com rebuilt as the launch control console for CHARGER. The page boots with a measured T-minus sequence while a pen-plotter draws the real rocket from its wire geometry as the bytes arrive. The hero shows CHARGER standing on the pad, rendered live with three.js from the real assembly, inside a GPU wind-tunnel simulation (smoke splits around the rocket, the pointer disturbs it; labelled as a page simulation, not flight data). Scrolling flies the camera down through the rocket station by station while the stack separates and leader lines reach out of the 3D scene into part callouts written from his explorer stories. A fixed instrument rail reads the page honestly (altimeter = scroll depth with the sections as station marks, vertical-speed indicator = scroll velocity, an engine-style gauge = frame time and quality tier). A telemetry wall and a visible adaptive governor instrument the page in the open. A console (/ or Ctrl+K) answers real commands. The other five projects are manifest rows (the rudder-pedals row reads a real HID device through the Gamepad API); the rocket's launch weekend is a timeline instrument and an event ladder; experience is a crew log on a month scale; photography is a contact sheet with a loupe that shows the files' real pixels; a `dim` command draws live dimension lines in px and mm on the layout itself. Every engine also runs alone on a lab page with its parameters exposed.

## 1. Files and ownership (nobody edits another owner's files)

Already written (shared, read-only for builders; you may only propose changes to the orchestrator):
- `vx/css/tokens.css` — tokens, @font-face (local TTFs), base element styles, `.meta`, `.meta-sm`, `.eyebrow`, `.display-1/2/3`, `.title-1`, `.sr-only`, `.on-dark`.
- `vx/css/lab.css` — layout for lab pages (`.lab`, `.lab-stage`, `.lab-panel`, `.lab-row`, `.lab-readout`).
- `vx/js/core/bus.js` — `bus.on(type, fn, {replay})`, `bus.once`, `bus.off`, `bus.emit(type, detail)`, `bus.state[type]` (last detail).
- `vx/js/core/governor.js` — `governor.tier` (0..3), `governor.ceiling`, `governor.stats` ({fps, meanMs, p50Ms, p95Ms, maxMs, budget, longFrames, frames, tier, ceiling, pinned, uptimeMs, memoryMB, dpr}), `governor.allows(minTier)`, `governor.dpr(tier?)`, `governor.pin(tier|null)`, `governor.subscribe(fn)` (replays current), `webglAvailable()`. Events: `governor:tier` {tier, reason, stats}, `governor:stats` (about 4 Hz). Sets `<html data-tier="N">`.
- `vx/js/core/scroll.js` — `scroll.state` ({t, y, vy px/s, vyPeak, max, progress, vh, dh, direction, moving}), `scroll.track(el, id)` registers a section (returns untrack), `scroll.sections`, `scroll.current`, `scroll.next()`, `scroll.progressOf(el)` (0..1 for a pinned section: 0 when its top hits the viewport top, 1 when its bottom hits the viewport bottom), `scroll.to(target, {offset})`, `scroll.refresh()`. Events: `scroll:frame` (every animation frame while moving, once more when it stops), `scroll:section` {id, el, index, top, height, progress}, `scroll:idle`.
- `vx/js/core/media.js` — `media.scan(root)` registers every `video[data-stream]` whose `<source data-src>` is attached within 1.5 viewports and detached beyond 3; concurrency by tier (0/1/2/4); posters only at tier 0 or reduced motion. `media.state` {attached, playing, bytes, count}. Event `media:state`.

Builders (module id → files they own → lab page they own):
- `stage` → `vx/js/stage/stage.js`, `vx/js/stage/loader.js`, `vx/js/stage/path.js`, `vx/js/stage/explode.js`, `vx/js/data/stations.js`, `vx/css/stage.css` → `vx/lab/stage.html`
- `callouts` → `vx/js/callouts.js`, `vx/css/callouts.css` → `vx/lab/callouts.html` (uses synthetic anchors AND, if the stage module exists when you build, the real stage)
- `tunnel` → `vx/js/tunnel/tunnel.js`, `vx/js/tunnel/shaders.js`, `vx/js/tunnel/gl.js`, `vx/css/tunnel.css` → `vx/lab/tunnel.html`
- `boot` → `vx/js/boot.js`, `vx/js/plotter.js`, `vx/css/boot.css` → `vx/lab/boot.html`
- `instruments` → `vx/js/instruments.js`, `vx/css/instruments.css` → `vx/lab/instruments.html`
- `telemetry` → `vx/js/telemetry.js`, `vx/css/telemetry.css` → `vx/lab/telemetry.html`
- `console` → `vx/js/console.js`, `vx/js/data/vfs.js`, `vx/css/console.css` → `vx/lab/console.html`
- `hid` → `vx/js/hid.js`, `vx/css/hid.css` → `vx/lab/hid.html`
- `contact-sheet` → `vx/js/contact-sheet.js`, `vx/js/data/frames.js`, `vx/css/contact-sheet.css` → `vx/lab/contact-sheet.html`
- `dimension` → `vx/js/dimension.js`, `vx/css/dimension.css` → `vx/lab/dimension.html`
- `timeline` → `vx/js/timeline.js`, `vx/js/ladder.js`, `vx/js/data/mission.js`, `vx/css/timeline.css` → `vx/lab/timeline.html`
- `page` (integrator, runs last) → `vx/index.html`, `vx/css/vx.css`, `vx/css/mobile.css`, `vx/js/main.js`, `vx/lab/index.html`, `vx/README.md`

## 2. Conventions that apply to every module

- ES modules, no bundler, no TypeScript, no globals except what you attach for the lab page. Export named functions. Every mount/create function returns an object with `destroy()` that cancels rAF, disconnects observers, removes listeners and releases GL resources.
- Resolve asset URLs relative to the module file, never relative to the page: `new URL('../../assets/charger-explorer/assembly.json', import.meta.url)` from `vx/js/x.js`; from `vx/js/stage/loader.js` it is `'../../../assets/...'`. The page and the lab pages live at different depths.
- three.js: import the bare specifier `three` (and `'../../../assets/charger-explorer/vendor/OrbitControls.js'` only in a lab page). Every page that loads the stage declares an import map: `{"imports":{"three":"<relative path to>/assets/charger-explorer/vendor/three.module.js"}}` (from `vx/index.html`: `../assets/...`; from `vx/lab/*.html`: `../../assets/...`). `livery.js` and `part-stories.js` are imported from their original location: `../../../assets/charger-explorer/livery.js` (it imports `three` itself, so the import map is required).
- Scene units: the explorer scales model units by 0.001 (metres). Nose tip y = +0.5707, screw-cap bottom y = −0.6102, body radius 0.034. The explode displacement must be the explorer's: centre c = (bounds min + bounds max) × 0.0005; angle = id × 2.39996; position = ((|c.x| > .005 ? c.x × 2 : cos(angle) × .12) × e, c.y × .75 × e, (|c.z| > .005 ? c.z × 2 : sin(angle) × .12) × e). Parts 3 and 4 (reference envelopes) are never drawn; part 5 is the motor and is drawn.
- Quality tiers (from `governor.tier`), the same meaning everywhere:
  - 3 full: all effects, DPR up to 2 (use `governor.dpr()`), tunnel full grid, strip charts 60 Hz.
  - 2 reduced: DPR up to 1.5, tunnel half grid and fewer Jacobi iterations, strip charts 30 Hz, grain on.
  - 1 minimal: DPR 1, tunnel frozen (one static frame, no loop), stage renders on scroll-end only (120 ms debounce) plus during pointer drags, strip charts 10 Hz, grain off, at most one video playing.
  - 0 static: no decorative motion; canvases draw once and stay; instruments update on `scroll:idle` only; posters instead of video. prefers-reduced-motion forces tier 0 and the governor already handles it. Read the tier with `governor.subscribe(({tier}) => ...)`; never read `matchMedia` for motion yourself except to skip CSS transitions.
- rAF discipline: no free-running loop that draws nothing new. Draw on demand (scroll, pointer, tier change, resize, data arrival). The governor owns the only always-on loop.
- Honesty rule: every live number on the page is page instrumentation. Each instrument shows its source in 10 px mono: `SRC: SCROLL`, `SRC: RAF`, `SRC: GAMEPAD`, `SRC: RESOURCE TIMING`, `PAGE SIMULATION`. No instrument ever shows invented flight data.
- Copy rules: UPPERCASE for display headings, labels and metadata (use CSS `text-transform`, keep source text in sentence case where it is a sentence); sentence case for body; zero-padded indices (01, 02); units on every number; en dash with spaces for ranges; `/` as separator in metadata; no emoji, no exclamation marks, never "passionate", "journey", "crafted", "elevate".
- CSS: one file per module, class prefix per module (`.st-` stage, `.co-` callouts, `.tn-` tunnel, `.bt-` boot, `.in-` instruments, `.tel-` telemetry, `.con-` console, `.hid-` hid, `.cs-` contact sheet, `.dim-` dimension, `.tl-` timeline, `.ld-` ladder). Use the tokens (`var(--ink-900)`, `var(--font-mono)`, `var(--ease-out)`, `var(--dur-3)`, and so on). Hairlines are `1px solid var(--line-hairline)`. The one accent is `var(--livery)` (#D63B08) for commanded/active values and `var(--livery-deep)` (#890919) for warnings. No other hue.
- Keyboard: every interactive thing is a real `<button>` or `<a>` with a visible focus ring (tokens.css provides it). Canvases that are only decorative get `aria-hidden="true"`; instruments get an `aria-label` and a visually hidden text readout updated at most once per second.
- Lab page contract: `vx/lab/<module>.html` loads `../css/tokens.css`, `../css/lab.css`, `../css/<module>.css`, declares the import map if it needs three, mounts the module into `.lab-stage`, exposes its parameters as labelled controls in `.lab-panel` (`<label class="lab-row">name <input type="range"> <output></label>`), prints internal state into `.lab-readout` (mono), and has a `<h1>` of the form `LAB / 04 / TUNNEL`. The lab page must look finished: it is part of the deliverable and the orchestrator will screenshot it.
- Verification: `node --check` every file; run the harness on the lab page at both viewports, with `--no-gl`; look at the PNGs with the Read tool; fix until CLEAN.

## 3. Shared bus events (emit exactly these names and shapes)

| event | emitted by | detail |
| --- | --- | --- |
| `governor:tier` | core | {tier, reason, stats} |
| `governor:stats` | core | stats object (4 Hz) |
| `scroll:frame` | core | scroll.state |
| `scroll:section` | core | {id, el, index, top, height, progress} |
| `scroll:idle` | core | scroll.state |
| `media:state` | core | {attached, playing, bytes, count} |
| `boot:line` | boot | {index, label, result, ms} |
| `boot:progress` | boot | {received, total} (geometry bytes) |
| `boot:done` | boot | {timings: [{label, ms}], skipped: boolean} |
| `assets:geometry` | boot (or stage if it fetched itself) | {json, buffer} the parsed assembly.json and the ArrayBuffer |
| `stage:ready` | stage | {parts, stations} |
| `stage:render` | stage | {progress, station, explode, mode, info: {calls, triangles, ms}} after every render |
| `stage:station` | stage | {index, station} when the current station changes |
| `pointer:move` | page (main.js) | {x, y, nx, ny, vx, vy, t} CSS px and normalised −1..1, every pointermove coalesced to rAF |
| `console:open` / `console:close` | console | {} |
| `console:run` | console | {name, args, output} |
| `dim:state` | dimension | {enabled, count} |
| `hid:state` | hid | {connected, id, axes: [r, l, b], pollHz} |
| `sheet:open` / `sheet:close` | contact-sheet | {index} |
| `tunnel:stats` | tunnel | {grid: [w, h], jacobi, steps, stepMs, tier, field} (1 Hz) |

## 4. Module APIs

### stage (`vx/js/stage/stage.js`)
```js
export async function createStage({ canvas, geometry /* {json, buffer} or undefined: then fetch yourself and emit assets:geometry */, tier })
// returns stage:
stage.ready            // Promise resolved when geometry is built
stage.parts            // [{id, label, category, subtitle, description, role, material, center:[x,y,z] (metres), bounds, exterior, referenceOnly}] from assembly.json + part-stories.js
stage.stations         // from data/stations.js: [{index, id, label, partIds:[], y (metre centre), azimuth (deg)}] eight stops, nose to tail, grouped by station centre (see BRIEF mission-control section S02 for the grouping)
stage.setProgress(p)   // 0..1 over the whole range section. 0..0.10 pad view (camera at 1.9 m, 8° elevation, slow 0.2°/s yaw while idle, pointer parallax ±4°); 0.10..0.88 descent through the 8 stations on a Catmull-Rom path with azimuth stepping 35° per stop, explode ramping 0→1 over 0.12..0.85; 0.88..1 pull-out to 2.6 m facing the exploded stack
stage.setPointer(nx, ny) // −1..1, parallax in pad view only
stage.setExplode(e)    // manual override (console); null returns to the schedule
stage.goto(partId, {duration}) // animate camera to a part; resolves when done
stage.setMode('solid'|'edges'|'wire')
stage.setTier(t)       // DPR and render policy per section 2
stage.project(partId)  // {x, y, visible, depth} in canvas CSS px after the last render (centre of bounds + explode offset)
stage.silhouette()     // in pad view: array of {kind:'capsule', x1,y1,x2,y2,r} | {kind:'box', x,y,w,h, angle} in canvas CSS px covering the exterior parts, for the tunnel obstacle
stage.render()         // render now (on demand)
stage.resize()
stage.info             // {calls, triangles, ms} of the last render
stage.setVisible(bool) // page tells it when the range section is on screen
stage.destroy()
```
Rendering: one `WebGLRenderer({antialias:true, alpha:true, powerPreference:'low-power'})`, clear colour transparent, `outputColorSpace = SRGBColorSpace`, hemisphere light (0xffffff, 0x777777, 2.6) plus two directional lights as in app.js, near plane recomputed per frame as app.js does. Parts outside ±0.08 m of the current station render at 0.12 opacity as edges; exterior tubes at 0.18 so the interior reads; the current station's parts at 1.0. Livery via `createLivery()` from `../../../assets/charger-explorer/livery.js` (await `document.fonts.load('700 32px "Space Grotesk"')` first, as the explorer does). No WebGL: `createStage` resolves with `stage.fallback = true`, draws nothing, and the page shows the poster.

### callouts (`vx/js/callouts.js`)
```js
export function mountCallouts({ stage, svg /* <svg> overlay same size as the canvas */, labels /* container for DOM labels */, sheet /* mobile bottom sheet root or null */ })
// draws for the current station: anchor dot r=3 at stage.project(id), 24 px 45° elbow, horizontal run to the label rail; labels are focusable <button class="co-label"> with eyebrow "14 / PAYLOAD", name, one-line subtitle from part stories; right side for anchors with x ≥ canvas centre, left otherwise; one downward sweep at 28 px min spacing then one upward relaxation; positions quantised to 0.5 px with 2 px hysteresis; re-solve only on stage:render. lock(partId) pins one callout open with the full description. Coarse pointers: labels go into the sheet, one station at a time with an 8-dot progress strip. Returns {lock, unlock, refresh, destroy}.
```

### tunnel (`vx/js/tunnel/tunnel.js`)
```js
export function createTunnel(canvas, { tier })
// WebGL2 stable fluids on ping-pong framebuffers: velocity RG16F, pressure R16F, divergence/curl R16F, dye RGBA16F at 2x velocity grid. Tier 3 grid 384 wide (height by aspect), tier 2 256, tier 1 frozen (render one settled frame after 240 off-screen steps and stop), tier 0 nothing. Per step: inflow and obstacle write, advection (MacCormack at tier 3, bilinear at 2), curl, vorticity confinement ε = 0.18, pointer splats, divergence, Jacobi pressure (32 / 20), gradient subtraction, dye advection, rake injection (7 Gaussian ports, σ = 1.5 cells) and composite. Flow left to right, U∞ ramps from 0 over 1200 ms on var(--ease-out). Boundaries: inflow left, outflow right copies neighbour, free-slip top and bottom, obstacle cells zeroed after projection with Neumann in the Jacobi kernel. Dissipation 0.995 velocity, 0.985 dye. Falls back to RGBA8 packed targets without EXT_color_buffer_float.
tunnel.setObstacle(shapes)      // from stage.silhouette(); ≤ 12 shapes as uniforms; converted to grid units
tunnel.setPointer(x, y, vx, vy) // CSS px; splat radius 0.028, impulse scaled by speed, clamped
tunnel.setFreestream(u)         // 0..2, default 1
tunnel.setField('smoke'|'velocity'|'pressure'|'vorticity')
tunnel.setTier(t)               // reallocates grids and blits the old velocity so nothing resets
tunnel.setVisible(bool)         // page tells it; no stepping while off screen
tunnel.params                   // live object {uInf, eps, jacobi, rake, dyeDecay, field, grid:[w,h]}
tunnel.stats                    // {steps, stepMs, frames}
tunnel.resize(); tunnel.destroy()
```
Composite: smoke in paper at ≤ 60% over transparent so the page's ink-900 shows through; the rocket is drawn by the stage canvas above it. Label somewhere visible on the page (the page integrator places it): "PAGE SIMULATION / NOT FLIGHT DATA".

### boot (`vx/js/boot.js`, `vx/js/plotter.js`)
```js
export function runBoot({ overlay /* #boot element, already in the HTML */, minMs = 1200, maxMs = 2600 })
// Prints one line per real awaited step with its measured ms: 00 FONTS, 01 MANIFEST (assembly.json, parts count), 02 GEOMETRY (assembly.bin streamed with fetch().body.getReader(), byte-accurate bar against json.bytes = 2,482,932), 03 RENDERER (WebGL2 yes/no, renderer string via WEBGL_debug_renderer_info where allowed), 04 GOVERNOR (20 frames, p50), 05 INSTRUMENTS armed, then RANGE IS GREEN. While the bin streams, the plotter draws CHARGER's front view from the exterior parts' wire segments (ids 0, 1, 2, 6–11, 18, 19), projected orthographically (model y → screen y, model x → screen x), as SVG paths with stroke-dashoffset at constant pen speed, parts appearing as their byte ranges arrive. Any key, click or tap skips the visual (loads continue). sessionStorage flag: repeat visits print one line and unmask in 400 ms. Reduced motion: one READY line, 400 ms.
// returns Promise<{ geometry: {json, buffer}, timings, skipped }>; also emits boot:line, boot:progress, boot:done, assets:geometry.
export function createPlotter(svg, { json, order }) // used by boot and reusable in the lab: plotter.feed(buffer, byteRange) draws what has arrived; plotter.setSpeed(unitsPerSecond); plotter.stats {segments, travel}
```

### instruments (`vx/js/instruments.js`)
```js
export function mountInstruments(rail, { layout: 'rail' | 'strip' })
// Three canvas instruments in a fixed rail (desktop, right edge, 64 px wide) or a bottom strip (mobile, 56 px tall):
// ALTIMETER: vertical tape, ticks every 100 px of scroll depth, labels every 500, each registered section (scroll.sections) drawn as a station mark with its index and label, an orange bug on the next section; a five-digit drum counter whose last two digits roll continuously and higher digits carry like an odometer. Label SRC: SCROLL.
// VSI: 170° dial, non-linear (0–500 px/s half the arc, 500–1000 a quarter, 1000–3000 the rest), 1.5 s peak-hold mark from scroll.state.vyPeak. Label SRC: SCROLL.
// ENGINE: arc gauge of governor p50 frame ms with a p95 tick and four tier annunciators T0–T3; the active tier lit; a 240 ms flash on a tier change. Label SRC: RAF.
// Draw on scroll:frame and governor:stats, and once on mount; at tier 0 draw on scroll:idle only. DPR capped by governor.dpr(). Each instrument has an aria-label and a .sr-only readout updated ≤ 1 Hz.
// returns {setLayout, refresh, destroy}
```

### telemetry (`vx/js/telemetry.js`)
```js
export function mountTelemetry(root, { layout: 'wall' | 'ticker' })
// Ten cells, each "LABEL / value / unit" in mono with the footer "LIVE / THIS PAGE / NO ROCKET DATA": FRAME p50 and p95 ms with a 16.7 ms budget bar; LONG TASKS (PerformanceObserver longtask, count and last ms); SCROLL V px/s (scroll.state.vy); VIEWPORT w × h, DPR, visualViewport.scale; NET bytes and requests (PerformanceObserver resource, transferSize); T+ mm:ss.t since performance.timeOrigin; GL calls and triangles (bus.state['stage:render'].info); GOV tier and reason; INPUT coarse/fine and last pointer; MEM JS heap MB where performance.memory exists, else a dash. Two strip charts (frame ms, scroll velocity) on one canvas at the tier's rate. Text cells update at 4 Hz with one textContent write each.
// telemetry.snapshot() returns the wall as plain text (the console's `status` command prints it). Ticker layout: one line, tap expands to the wall. returns {snapshot, setLayout, destroy}
```

### console (`vx/js/console.js`, `vx/js/data/vfs.js`)
```js
export function mountConsole({ commands: [{ name, args: 'string describing args', help, run(args, io) }] })
// Native <dialog> opened by "/" (when no input is focused) or Ctrl/Cmd+K or the header "> _" button; a prompt line, a scrolling output log (mono), history (ArrowUp/Down, sessionStorage), Tab completion, a 40-line subsequence fuzzy matcher with prefix and word-start bonus, Escape closes. io = {print(text), table(rows), clear()}. Built-in commands: help, clear, history, ls [path], cd, pwd, cat <file> (prints a short description and offers the link), open <path|project|part>, cal <year> (month grids with + on the days inside the role ranges supplied in data/vfs.js, legend beneath). data/vfs.js is a manifest of REAL files with REAL byte sizes generated from the repo (run `find`/`stat` once and paste the result as data): ~/projects/01-hotbox … 06-therma-shift with their media, ~/photos/..., ~/cad/charger/{assembly.json, assembly.bin, charger-hybrid.step}, ~/docs/resume.pdf, plus the four roles with their month ranges for cal. The page's main.js registers the rest (goto, explode, mode, gov, telemetry, status, manifest, export, reader, dim, boot, palette, field).
// returns {open, close, run(line), register(cmd), destroy}
```

### hid (`vx/js/hid.js`)
```js
export function mountHid(root)
// Gamepad API bench: polls navigator.getGamepads() on rAF only while root is on screen and a device is connected; three canvas gauges labelled RUDDER, L BRAKE, R BRAKE for axes 0..2 (−1..1), measured poll interval in Hz, the device id string; flag NO HID DEVICE / CONNECT A CONTROLLER otherwise; "SRC: GAMEPAD API / YOUR DEVICE". Emits hid:state. returns {destroy}
```

### contact-sheet (`vx/js/contact-sheet.js`, `vx/js/data/frames.js`)
```js
export function mountContactSheet(root, { frames })
// frames from data/frames.js: [{src (relative to vx/js/data), w, h, roll:'ACADIA'|'BEYOND'|'PAD', title}] with REAL dimensions (read them with ImageMagick identify once and paste). A 36-cell sheet (cell 00 is a leader cell): roll labels "ROLL 01 / ACADIA ROAD TRIP / 26 FRAMES", frame numbers, + ticks. Hover (or press-and-hold on touch) shows a 160 px loupe drawn with canvas 2D, imageSmoothingEnabled=false, sampling the decoded image at native resolution and printing the truth: "NATIVE 520 × 346 PX / 4.0 ×". Click opens a viewer (native dialog) with arrows, keyboard, swipe, and a mono caption "02 / 26 / SUMMIT SUNSET / 520 × 346 PX". I and O keys mark a range; EXPORT composes the marked frames into a PNG with roll labels via OffscreenCanvas (or a hidden canvas) and downloads it. Decode via createImageBitmap, LRU of 12. Works without WebGL. Emits sheet:open/close. returns {open(i), close, destroy}
```

### dimension (`vx/js/dimension.js`)
```js
export function mountDimensions(svg /* fixed full-viewport <svg> overlay, pointer-events none */)
// Draws live dimension lines on elements carrying data-dim (value = label, e.g. data-dim="DISPLAY HEADING"): extension lines 8 px off the feature and 6 px past, filled arrowheads 9 × 3 px, text above the line in 11 px mono "827 PX / 218.8 MM" (mm = px × 25.4 / 96, labelled CSS PX @ 96 DPI), width and height per element, boxed basic dimensions for elements with data-dim-basic="88px" showing nominal, measured and deviation. One rAF read phase (getBoundingClientRect) then one write phase; ≤ 40 live dimensions; recompute on scroll:frame and ResizeObserver; hidden until enabled. Touch: long-press any data-dim element dimensions just that one for 3 s. Emits dim:state. returns {enable, disable, toggle, refresh, destroy}
```

### timeline (`vx/js/timeline.js`, `vx/js/ladder.js`, `vx/js/data/mission.js`)
```js
export function mountTimeline(root)  // SVG with a real month axis Aug 2023 → Sep 2026 at 14 px/month (two rows under 600 px) for the roles and the rocket milestones, plus an hour track for the launch weekend (08:00–16:00 both days, qualifying flight before noon); scroll scrubs a hairline cursor; each event is a <button> that expands its sentence. Rendered from data/mission.js (dates and sentences copied from index.html and projects/charger.html with a `source` field each), no hand-placed coordinate. returns {destroy}
export function mountLadder(root)    // SVG event ladder: 700 ft floor, 1,033 ft simulated apogee, 1,200 ft ceiling, ticks every 100 ft, labels every 500 ft; marks: payload deploy at apogee, nose cone release at 75% of peak (≈ 775 ft, labelled DERIVED), descent 13.8 ft/s vs 15 ft/s limit on a 48 in parachute, Aerotech G77R-7 at thrust-to-weight 8.17, 1.25 s burn; beside it the points ladder from the case study. A hairline indicator rises with scroll progress through the section. Published marks solid, derived marks dashed. No curve is drawn (no flight data is published). returns {destroy}
```
All numbers in mission.js and the ladder must be present in `projects/charger.html` or `index.html`; include the `source` string for each.

### page (integrator)
Builds `vx/index.html`, `vx/css/vx.css`, `vx/css/mobile.css`, `vx/js/main.js`, `vx/lab/index.html`, `vx/README.md` using the modules above (read each module's lab page and public API first). Sections in order with these ids: `#boot` (overlay in HTML, no flash), `header.vx-header`, `#range` (hero + stack walk: a track of height calc(100svh + 700vh) on desktop and calc(100svh + 500vh) on mobile with a `position: sticky; top: 0; height: 100svh` stage holding `#tunnel` canvas, `#stage` canvas, `#leaders` svg, `#callouts`, and the hero copy `#pad-copy` that fades out over progress 0.06..0.12), `#ladder`, `#decisions`, `#weekend`, `#manifest` (five rows with `data-manifest-row` and the HID bench in the rudder-pedals row), `#crew`, `#skills`, `#offrange` (balloon plate, five Beyond paragraphs, the portrait cut-out, `#contact-sheet`), `#recognition`, `#websites`, `#comms` (contact + `#build-manifest`: every vx module with transfer size and parse time from Resource Timing, labelled "this page, measured now"), `footer`. Fixed: `#rail` (instruments), `#telemetry` (wall on the left of the hero; becomes a collapsible drawer after the hero), `#console` (dialog), `#dimensions` (svg overlay), `#sheet` (mobile bottom sheet). `<noscript>` and no-WebGL: the content is complete HTML and the poster `charger-painted-wide-poster.png` sits in the stage. OpenGraph tags, title "Mert Tureli · VX", canonical https://merttureli.com/vx/, robots noindex (experimental), favicon as the main site. Copy is verbatim from `index.html` and `projects/charger.html` (quote, do not paraphrase); a "THE PRODUCTION SITE" link in the header and footer points to `/`; "LAB" links to `lab/`.

## 5. Station grouping for the descent (data/stations.js)

Eight stops, nose to tail, by centre y in metres (bounds from assembly.json × 0.001):
1. NOSE CONE — [0] (0.4547)
2. CAMERA — [17 camera holder, 15 camera, 14 payload] (≈0.33)
3. PCB STACK — [23, 24, 25] with upper body tube 1 (≈0.20)
4. BATTERY — [13, 10 rail button 1] (≈ −0.04)
5. COUPLER — [21, 27, 28, 29 wooden rods, 16 internal coupler, 20 antenna, 22 antenna holder] (≈ −0.08)
6. ALTIMETER — [26 lower shock-cord mount, 12 altimeter] with lower body tube 2 (≈ −0.40)
7. MOTOR — [11 rail button 2, 5 motor, 18 revised motor mount, 6–9 fins] (≈ −0.53)
8. SCREW CAP — [19] (−0.5912)
Azimuth: 35° × index. Reference envelopes 3 and 4 never drawn.

## 6. Content sources (no other facts allowed)
- `index.html`: hero line, about paragraphs, the six project blocks with their spec lists, four experience entries, skills, Beyond paragraphs, recognition rows, contact rows, footer credit line.
- `projects/charger.html`: airframe figures, motor, apogee, descent, points ladder, launch weekend narrative, standings, the two decisions (screw-on cap after the preliminary review; the altimeter carried but not used for recovery).
- `assets/charger-explorer/part-stories.js`: every part's label, category, subtitle, description, role, material.
- `assets/portfolio-foundation/project-stories.json`: chapter questions/decisions if useful.
Anything derived (e.g. 75% of 1,033 ft) is labelled DERIVED.

## 7. Panel amendments (binding; added after the judge panel and the completeness critic)

These override anything above that conflicts.

### 7.1 Recruiter path and first paint
- The facts must be readable at t = 0 without JavaScript and while the boot overlay is up: the `#boot` overlay contains, as static HTML at its top, a fact strip in 11 px mono: `MERT TURELI / MECHANICAL ENGINEER / AUSTIN, TEXAS / B.S. MECHANICAL ENGINEERING, UNION COLLEGE, 2026` and three links `RESUME (PDF)` → `../assets/Mert-Tureli-Resume.pdf`, `EMAIL` → `mailto:merttureli0@gmail.com`, `LINKEDIN` → `https://linkedin.com/in/merttureli`, plus `SAVE CONTACT (VCF)` → `../hi/mert-tureli.vcf`. The first focusable element on the page is a visible `SKIP` button inside the overlay. Any key, click, tap, or the first scroll also skips.
- Boot caps: minMs 900 / maxMs 2200 on fine pointers; maxMs 1200 on coarse pointers. Entry URLs `?card`, `#card` and `?noboot` skip the boot entirely (the hero is shown immediately, fact strip stays as the header strip). The repeat-visit flag is a versioned `localStorage` key `vx-boot-v1` (not sessionStorage); the console command `boot` replays it.
- While the overlay is open the rest of the document is `inert`; the overlay has `role="dialog"` and `aria-label="Loading"`; only its last line is `aria-live="polite"`.
- The hero's LCP element is `<img>` `../assets/motion/charger-painted-wide-poster.png` with `fetchpriority="high"`, `width/height` set, preloaded in `<head>`, sitting in the stage behind the canvases; the stage fades it out when its first frame has rendered. three.js is imported dynamically (`import('three')` after boot step 01 starts), never on the critical path; the 2.48 MB bin never blocks the unmask (maxMs rules). Under `navigator.connection.saveData` or `effectiveType` 2g/3g the bin waits for a tap on the stage (`LOAD 3D / 2.5 MB`).
- Fonts: `<link rel="preload" as="font" crossorigin>` for both TTFs; `font-display: swap`; every `<img>` has `width` and `height`.
- vx is NOT tracked: no analytics scripts. The page may say truthfully that nothing it measures leaves the browser.

### 7.2 Structure, headings, routes
- Headings are the real section names; the console vocabulary goes in the eyebrow. Order and ids (stable, used as hash routes; an unknown hash prints `NO SECTION AT #foo` in the console log and scrolls to top):
  `#pad` (hero, inside `#range`), `#03-charger` (anchor at the start of the descent, inside `#range`), `#ladder` ("Flight events"), `#decisions` ("Two decisions"), `#weekend` ("Launch weekend"), `#01-hotbox`, `#02-robo-catcher`, `#04-bend-fixture`, `#05-rudder-pedals`, `#06-therma-shift` (each a full "sheet" section, see 7.3), `#experience` ("Experience", eyebrow CREW LOG / REV A–D), `#skills` ("What I work with"), `#beyond` ("Beyond engineering", eyebrow OFF RANGE), `#recognition`, `#websites`, `#contact` ("Get in touch", eyebrow COMMS), `footer`.
- `<main>` wraps everything after the header; a skip link `Skip to content` is the first element after the boot overlay; exactly one `<h1>` (MERT TURELI in the hero).
- The descent track is `calc(100svh + 500vh)` on desktop and `calc(100svh + 400vh)` under 860 px (shortened from 700vh on the panel's advice).
- Focusing a callout label sets the stage progress to its station (keyboard users never get trapped off-screen); every scroll-driven value (progress, explode) also has a keyboard-settable range input in the stage's bottom bar.
- A visible `READING MODE` toggle in the header (also the `reader` console command, persisted in localStorage) unpins the stage, shows the eight stations as static frames with their callouts as a list, freezes instruments, and sets the governor to tier 0. It is the screen-reader and keyboard path and is independent of prefers-reduced-motion.
- Single-key shortcuts (`/`, `?`, J, K, 1–4, F) are suspended whenever focus is in an input, textarea, select or contenteditable. `?` opens a shortcut sheet (a small dialog listing every key). Ctrl/Cmd+K and the header `>_` button always open the console.

### 7.3 Project sheets (replaces the "manifest rows")
HOTBOX gets a full section directly after the launch weekend, then Robo-Catcher, bend fixture, rudder pedals, Therma-Shift, each as a drawing sheet: a title block strip (TITLE, SHEET n OF 5, ORG / YEAR, ROLE, REV), zone ticks along the top edge (`+` marks), his paragraphs from index.html verbatim as numbered NOTES, the spec list as a parts-list table, the media cell, and `READ THE CASE STUDY →` for the five pages that exist (`../projects/robo-catcher.html`, `../projects/bend-fixture.html`, `../projects/rudder-pedals.html`, `../projects/therma-shift.html`; CHARGER links `../projects/charger.html` from the descent; HOTBOX has no page and gets no invented link). Media per sheet: HOTBOX `hotbox-blurred-alpha.webm` (+mp4, poster) with the IP PROTECTED pill and accessible name "Blurred render, SunThru proprietary hardware, intentionally blurred"; Robo-Catcher `robo-catcher-360-alpha.webm` (desktop only; on coarse pointers the poster with a PLAY button) plus `../assets/photos/robo-catcher-photography/indexer-cross-section.jpg` and `working-on-electronics.jpg` (the proof of the two things he owned) and `../assets/photos/shop-and-machine-photography/machine-field.jpg` with the Paul Buckowski / Union College credit; bend fixture `bend-fixture-blurred-alpha.webm` with the IP pill; rudder pedals `rudder-pedals-working-alpha.webm`, `../assets/photos/rudder-pedal-photography/pedals-hero.jpg` (the only photograph of the built pedals), the two renders, and the HID bench; Therma-Shift `therma-shift-360-noflow-alpha.webm`.

### 7.4 Content additions
- Two decisions keeps `../assets/photos/3d-model-renders/shockcord-beauty-render.jpg` and `shockcord-shot-sheet.jpg`; the ladder uses `../assets/photos/video/nose-cone-ejection-test.jpg`; the launch weekend uses `../assets/photos/video/rocket-launch.jpg`, `charger-pad-tall.jpg`, `charger-pad-close.jpg`; the crew log uses `../assets/photos/shop-and-machine-photography/uc-team.jpg` (the twelve-person team, Buckowski credit) beside the Rocket Team entry.
- Beyond ("OFF RANGE"): the balloon plate with `Licensed ultralight pilot` first, then filmmaking with three mono slates for the shorts (facts only: ROBERT COLLEGE FILM FESTIVAL / 2022 / SCREENED, and NOMINATED / CINEMATOGRAPHY / EDITING / SOUND DESIGN for the solo short; a mono note that the shorts are not published on this site), then the contact sheet, then cooking and travelling; a link `THE CORRIDOR →` to `../photography-gallery.html`... use `../photography-lab.html` (the published page).
- Downloads block inside the descent's bottom bar and in the console (`cat charger`): `DOWNLOAD STEP (3.1 MB)` → `../assets/charger-explorer/cad/charger-hybrid.step`, `DOWNLOAD GLB (2.0 MB)` → `../assets/charger-explorer/assembly.glb`, `OPEN THE EXPLORER →` → `../assets/charger-explorer/index.html`.
- Websites entry keeps the live site's block verbatim ("Like what you see? Let's build yours.") and adds one line: "This page is the demonstration." linking `../websites.html#inquiry`. Console commands `websites` and `inquire` go there.
- The footer repeats the fact strip, the credit line verbatim, `THE PRODUCTION SITE →` to `/`, `LAB →` to `lab/`, `PRIVACY` to `../privacy.html`, and the line: "Every number on this page is measured from this page in your browser. Nothing is sent anywhere."
- Do not show the `sample-assembly` renders or `shock-cord-protector-turntable.jpg` (IP uncertain). Aircraft models stay captioned "Third-party aircraft models, illustration only" in the accessible name too.
- OpenGraph: `og:image` `https://merttureli.com/assets/og-cover.png`, `og:title` "Mert Tureli · VX", `og:url` `https://merttureli.com/vx/`, `twitter:card summary_large_image`, `meta name="robots" content="noindex"`, `theme-color #0A0A0A`, the inline SVG `MT` favicon from index.html.

### 7.5 Screen readers and canvases
- Telemetry cells, instrument canvases, the boot log and the T-minus clock are `aria-hidden="true"`; each canvas instrument has `role="img"` and an `aria-label` refreshed at most once per second; one visually hidden `aria-live="polite"` region (owned by main.js, `#announce`) receives exactly: the boot-complete line, each governor tier change ("Quality tier 2: p95 frame time over budget"), and console command results.
- Every photograph has real alt text (the harness fails on empty alt). Mono spec rows carry `aria-label` expansions with unit words where the visual uses symbols.
- `forced-colors: active`: hairlines become `1px solid CanvasText`; canvas instruments show their text readouts.

### 7.6 Mobile
- `100svh` everywhere; `env(safe-area-inset-bottom)` on the instrument strip and the console; `touch-action: pan-y`, `-webkit-touch-callout: none`, `user-select: none` on the stage and tunnel canvases; primary CTAs (SEE THE WORK, RESUME) in the lower half of the first 390 × 844 viewport; posters get a visible PLAY when autoplay is refused (listen for the play() rejection in media.js consumers; the page shows a `.play` button overlay).
- The telemetry wall is a one-line ticker under the header on phones; the instruments are a 56 px bottom strip; callouts use the bottom sheet.

### 7.7 Tunnel budget (hero only)
Tier 3: grid 320 wide, 24 Jacobi, MacCormack; tier 2: 192 wide, 16 Jacobi, bilinear; tier 1: frozen frame; tier 0: off. The tunnel runs only while `#range` is on screen and progress < 0.12 (pad view); it fades out as the descent begins. `?tier=N` on the page URL pins the governor (for verification screenshots); `?field=pressure` selects the composite view.

### 7.8 Second visit
`localStorage`: `vx-boot-v1` (boot seen), `vx-tier` (last stable tier, used as the starting tier next visit, never above the heuristic ceiling), `vx-reader` (reading mode). All labelled locally stored; the privacy link stays in the footer.

### 7.9 Cut outright
Momentum/lag scroll, fluttering per-glyph type, iris cursor, Houdini worklets, audio, phase names as headings, any hue outside the tokens and the livery, analytics, service worker.
