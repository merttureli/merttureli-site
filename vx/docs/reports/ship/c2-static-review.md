# C2: static compatibility and performance review, and the ?bench=1 spec

Track C2 of SHIPPING.md. Page `vx/index.html` on branch `claude/charming-pascal-wgx7a3`. Read-only review of the code; no browser. The first pass read commit f05d73b. This pass (after the container restart, 2026-10-23 04:20 UTC) re-read the branch at b138408 and origin/main at 4cac0c5, which the live https://merttureli.com/vx/ serves (deployed 04:03:44 UTC). Between f05d73b and either commit, `git diff` shows no change under `vx/` or `assets/charger-explorer/` apart from the new validation pages (`vx/js/validation/`, `vx/lab/validation/`). Every line number below was checked again against b138408.

## 1. Verdict

No blocker. The page degrades well on every browser path I traced: no WebGL2, no import maps (Safari before 16.4), no float32 render targets, and a failed engine all end in the 2D view or "lattice pending" without throwing. The float pipeline does not depend on any extension iOS lacks (no float32 filtering, no float blending), and every shader declares highp.

Two major defects, both about real devices that Chromium emulation cannot reproduce:

1. **The lattice never idles (C2-01).** While the stage is on screen and the tab is visible, the flow runs at full tier forever, even with the flight finished and nobody touching the page. At tier 3 that is about 470 million lattice updates per second and about 47 GB/s of GPU memory traffic, around the clock. A laptop left on the page spins its fans and a phone heats up and drains.
2. **A lost graphics context goes to 2D for good after time in the background (C2-02).** The 5 s wait for a restore also runs while the tab is hidden. iOS Safari can drop WebGL contexts when the app goes to the background or the phone locks. On return the overdue timer can fire before the restore arrives, so the visitor finds the flat 2D view and no 3D until they reload.

Fifteen minor findings and eleven informational ones follow. The best value for effort:

- Switch the import maps to the minified three.js that is already vendored (C2-03). This is a one-line change per page. It saves 237 KB on the wire and 1.38 MB of JavaScript to parse, and it shares the browser cache with the main site's CHARGER explorer.
- Take the 1024 x 320 section rasterisation off the boot path (C2-04), and slice the run previews (C2-05).
- Fill the black loading stage with the 2D view (C2-06). This matters most for the non-engineer first impression on a slow phone.
- Stop the governor's idle 60 Hz loop (C2-07).
- Make the phone heuristics start lower (C2-08).

## 2. Method and limits

- Read every page module and the import graph from `vx/index.html`, the four stylesheets, the vendored three.js r186 paths the engine relies on (`readRenderTargetPixelsAsync`, `probeAsync`, `textureTypeReadable`) and the vendored OrbitControls.
- Measured in node (not a browser) the main-thread CPU work main.js does at load: `ship/c2-cpu-bench.mjs` and `ship/c2-section-bench.mjs`.
  - The machine was heavily contended by other tracks (load average 20 to 23 on 4 cores), so I report the minimum of 5 to 9 runs. Treat these figures as lower bounds on a desktop Xeon core. A mid-range phone core is roughly 3 to 5 times slower (EST, rule of thumb).
- Computed GPU bytes and memory traffic per tier from `allocate()` in lattice.js, and drawing-buffer sizes from the CSS layout: `ship/c2-gpu-bytes.mjs`.
- Read live response headers from GitHub Pages with `curl -I` for the HTML, main.js, three.js, the fonts and assembly.bin (first pass, and again at about 04:22 UTC on 2026-10-23, after the 04:03 deploy).
- Parsed every module of the static graph, the scene graph, the engine and the vendored three.js with acorn to find the oldest engine that can run each group: `ship/c2-syntax-baseline.mjs`, output in `reports/ship/c2/syntax-baseline.txt` (section 4).
- Wrote a rerunnable static compatibility lint: `ship/c2-compat-scan.mjs`. Today it reports 0 FAIL, 11 WARN and 9 INFO; the output is in `reports/ship/c2/compat-scan.txt`.
- **What C1's Chromium emulation cannot show, and so lives here only:**
  - safe-area insets (`env()` is 0 in device emulation)
  - WebKit and Gecko code paths: import-map absence, the HALF_FLOAT readback, Metal's per-pixel render-target limit
  - 30 Hz animation-frame caps (Low Power Mode, Energy Saver)
  - iOS background context loss
  - real GPU bandwidth

## 3. Findings

Severity: major = a real visitor on a real device is likely to hit it; minor = a measurable cost or a narrow failure with a clear fix; info = worth knowing, owner decision or no action.

| ID | Sev | Where | What | Fix |
|---|---|---|---|---|
| C2-01 | major | vx/js/main.js:662, 701-712 | `latticeFrame` returns true whenever the lattice is live, the stage is on screen and the tab is visible, so `tick` stays busy and re-arms rAF forever. Nothing pauses the flow when the flight is over and the visitor is idle. Tier 3 at 60 Hz is 1,440 steps/s on 327,680 cells: 472 MLUPS and about 47 GB/s of state traffic (section 5). The cost is continuous fan noise, heat and battery drain on a page left open. | Add an idle pause. Track `lastActivity` (pointerdown or keydown on the stage or panel, `panel.onControl`, launch, run buttons, resume). When `!playback.running && !hold && !governor.stats.pinned && now - lastActivity > 90 s`, set `lat.idle = true` and return false from `latticeFrame`. Show the existing FLOW PAUSED badge with "Resume flow", whose text could read "PAUSED TO SAVE POWER". Any activity clears it. Pinned tiers (verification) and ?hold are exempt, so the probes are unaffected. |
| C2-02 | major | vx/js/main.js:328-342 (5 s `ctxTimer`), 353-367 (`contextGone` removes the restore listener and destroys scene and lattice) | The 5 s restore wait runs on wall time, including time the tab is hidden. iOS Safari can lose WebGL contexts when the app is backgrounded or the phone locks, and restores them on return. On resume the overdue timer and the restore event race, so a visitor coming back can be left on the 2D view until a reload. C1 cannot reproduce this in Chromium, and I did not reproduce it: it follows from the code (the timer is wall time; iOS suspends a backgrounded page and runs overdue timers on return) and from widely reported iOS context losses. | Count only visible time. In `onContextLost`, start the timer only if `!document.hidden`. Add a visibilitychange handler: when hidden, `clearTimeout(ctxTimer)`; when visible and still `ctxLost`, start a fresh `CONTEXT_WAIT_MS`. Keep the restore listener until the fallback actually runs. |
| C2-03 | minor | vx/index.html:23; vx/lab/scene.html:12, lattice.html:68, geom.html:11, panel.html:11 (and the new vx/lab/validation pages) | The import map loads three.module.js plus three.core.js: 2.12 MB of source and 428 KB gzipped on the wire. It also adds one more request hop, because three.module.js imports three.core.js. `assets/charger-explorer/vendor/three.module.min.js` is the same r186 as one self-contained file: 742 KB of source, 191 KB on the wire. The main site's explorer already loads it, so a visitor arriving from the home page has it cached. | Point every vx import map at `.../vendor/three.module.min.js`. OrbitControls imports `three` through the map, so it follows. Re-run the harness on the page and the labs. No file outside vx changes. |
| C2-04 | minor | vx/js/main.js:1002-1004 and 1075-1079; 257-292; vx/js/stage/loader.js:27-30 | The boot path is serial in four places:<br>1. `fillConfig()` runs before `initView()` and rasterises a 1024 x 320 section only to print the cell size and dCells. That is 34 ms warm and 88 to 255 ms cold in node, before the scene import is requested.<br>2. `import('./scene/scene.js')` therefore starts late.<br>3. `import('./lattice/lattice.js')` waits until the CAD is built (after `await s.ready`).<br>4. The loader fetches assembly.json, then assembly.bin. | 1. Compute the two numbers in closed form, as geom.js:283 does: `cellM = refs.length / (SPAN_FRACTION * 1024)` and `dCells = refs.diameter / cellM` give 1.747 mm and 38.9.<br>2. Call `initView()` before `fillConfig()`, and run the rest of `fillConfig` in idle time.<br>3. Start `import('./lattice/lattice.js')` alongside the scene import whenever `governor.tier > 0`. It is fetch and evaluate only, with no GPU work.<br>4. In the loader, use `Promise.all([fetch(JSON_URL), fetch(BIN_URL)])` and check the length afterwards. |
| C2-05 | minor | vx/js/main.js:79 (`idle`: requestIdleCallback, else `setTimeout(fn, 60)`), 901-954 (`flyRun`, `computeRuns`), 1006-1011 (`run(12)`) | The five run previews and the still-air apogee run as single unsliced callbacks: 25 to 42 ms each in node, so about 100 to 200 ms each on a phone (EST). Stable Safari has not shipped requestIdleCallback (it sits behind a feature flag as of Safari 18; ?bench records whether it exists), so all six land at 60 ms spacing during boot, competing with the CAD build and shader compiles. In Chrome the 1,500 ms timeout forces them into the boot window anyway. The run cards are several screens below the fold. | Start `computeRuns` when `#runs` comes within one viewport (an IntersectionObserver with rootMargin `100% 0px`), or after the lattice is attached. Slice each flight into chunks of about 200 steps. In each chunk, check `deadline.timeRemaining() > 4` where rIC exists, or use an 8 ms budget per setTimeout slice. |
| C2-06 | minor | vx/js/main.js:257-285; vx/js/scene/scene.js:657 (`loadGeometry` without `onProgress`); vx/index.html:74 | Until three.js and the CAD arrive, the whole first screen is a black stage with "LOADING THE CAD ASSEMBLY". That is about 1.4 MB on the wire, and roughly 30 s or more on a slow mobile link. The 2D view is already loaded (fallback.js is in the static graph) and draws the rocket, CG, CP and forces from the baked geometry. The loader supports `onProgress`, but nothing passes it. | Mount `createFallbackView` in the viewport while `viewKind === 'loading'`, and drop it on `scene.ready`; a 200 ms opacity cross-fade is enough, and none under reduced motion. Pass `onProgress` through `createScene(..., { onProgress })`, and write "LOADING THE CAD ASSEMBLY / 0.4 OF 1.0 MB" to the status at most once a second. The status is not a live region, so the 1 Hz rule holds. |
| C2-07 | minor | vx/js/core/governor.js:114-116, 152-157, 184; vx/js/main.js:146, 712 | On the default page the governor runs its own requestAnimationFrame at the display rate (60 or 120 Hz) for as long as the tab is visible, even when nothing draws. Idle frames carry no information about load, and the loop keeps the main thread waking every frame. | Call `governor.stop()` where tick goes idle (`else lastNow = 0`), and `governor.start()` in `kick()`. start() already clears its window. A better long-term design is `governor.sample(intervalMs)` from tick, with no rAF of its own. |
| C2-08 | minor | vx/js/core/governor.js:56-66 (heuristicTier), 80 (`ceiling = tier`) | Every phone starts at tier 2 (768 x 240, 16 steps). That is 28.4 MB of lattice textures and about 18 GB/s of state traffic at 60 Hz, plus up to 8.5 GB/s of tile loads (C2-15), which mid-range phone GPUs cannot sustain.<br>• A 2 GB Android phone (deviceMemory 2) gets the same tier as an 8 GB flagship.<br>• The ceiling equals the start tier, so a conservative start would forbid ever reaching tier 2.<br>• There is no software-renderer check (llvmpipe, SwiftShader, "Basic Render Driver"). The r1 perf lens measured close to a minute of 2.5 s frames before shedding there. The guard is time-bounded now, but each shed restarts its warm-up (up to WARM_MAX_MS 12 s plus SLOW_HOLD_MS 2.5 s), so walking from tier 3 to 0 still takes tens of seconds when each frame takes seconds.<br>• Safari and Firefox expose neither deviceMemory nor connection.<br>• At tier 2 the slice's dye grid (1536 x 480) is about twice the device pixels the slice covers on a 390 px phone, so tier 1 looks close to tier 2 on a phone. | Separate the start tier from the ceiling:<br>• phones (coarse pointer and short side under 500 px): start 1, ceiling 2<br>• `deviceMemory <= 2`: ceiling 1<br>• renderer string matching `/swiftshader\|llvmpipe\|softpipe\|software\|basic render/i` (UNMASKED_RENDERER where exposed, else RENDERER): start and ceiling 1<br>The existing quiet rule (p50 under 17.5 ms for 12 s on frames that ran the work) then lifts a capable phone to tier 2. The ?bench data (section 9) will show whether the phone default is right. |
| C2-09 | minor | vx/js/core/governor.js:46 (`DOWN_P95_MS = 34`), 48 (`UP_P50_MS = 17.5`), 131-146 | iOS Low Power Mode and Chrome's Energy Saver cap requestAnimationFrame at 30 Hz. Then the base interval is 33.3 ms, right at the step-down threshold: five dropped vsyncs in 90 frames trip it, and a 1 ms timestamp rounding (34 ms) sits on the edge. The step-up rule (p50 under 17.5 ms) can never pass again, so one transient drop is permanent for the page. | Measure the base interval at start, as the median of the first 30 frames while nothing heavy runs. Express both rules relative to it: step down when `p95 > max(34, 1.9 x base)`; step up when `p50 < 1.05 x base`. |
| C2-10 | minor | vx/js/scene/scene.js:607-616 (`resize`), vx/js/core/governor.js:96-99 (`dprFor`) | There is no cap on the backing store. On a 2560 x 1440 screen at DPR 2, tier 3 renders 4480 x 2480 = 11.1 Mpx: an 85 MB drawing buffer before the compositor's copies, filled every frame (section 5). | Cap pixels per tier: `const r = Math.min(dprFor(tier), Math.sqrt(MAX_PX[tier] / (w * h)))` with `MAX_PX = {3: 6e6, 2: 3e6, 1: 1.5e6}`. Apply it in scene.resize, and in the panel canvases' `governor.dpr()` if they grow. |
| C2-11 | minor | vx/js/scene/camera.js:125-127, 361; vendored OrbitControls.js:503 | OrbitControls always adds a `wheel` listener with `{ passive: false }`. The page disables zoom, but the listener stays, so every wheel or trackpad scroll that starts over the 100svh stage waits for the main thread, which can be up to 48 ms of lattice issue time plus the scene render per frame. | In createCameraRig: `if (!zoom) canvas.removeEventListener('wheel', controls._onMouseWheel);`. In `setZoom(true)`, add it back with `{ passive: false }`. `_onMouseWheel` is the bound handler OrbitControls r186 keeps (OrbitControls.js:443). |
| C2-12 | minor | vx/css/field.css:56 (`.fd-cap`), 62 (`.fd-badges`, which holds the Resume flow and Disarm buttons); vx/css/scene.css:17 (`.sc-ticks`), 24 (`.sc-hint`); vx/css/panel.css:34-41 (`.pn` rail, `right: 0`), 153 (`.pn-dock`) | The header and the phone sheet honour `env(safe-area-inset-*)`, but the stage overlays and the desktop-layout rail do not. In landscape on a notched or Dynamic Island iPhone (insets of about 47 to 59 px against offsets of 24 to 34 px), the captions, the badge buttons and the rail text sit under the sensor housing. Phones 860 px or more wide in landscape (Plus and Pro Max) get the rail layout. | Add the insets to the offsets: `left: calc(max(var(--space-3), env(safe-area-inset-left, 0px)) + 22px)` and the mirror for right. For the rail, use `padding-right: max(var(--pn-gutter), env(safe-area-inset-right, 0px))` and widen `--pn-rail-w` by the inset. Check on a real iPhone in both landscape orientations. |
| C2-13 | minor | vx/css/field.css:44 (`min-height: 600px`), 207 (`min-height: 540px` in the phone layout) | Short landscape viewports overflow:<br>• 844 x 390 (phone layout): a 540 px stage.<br>• 932 x 430 (rail layout): a 600 px stage.<br>The stage is taller than the screen, so the chart dock and the bottom of the canvas sit below the fold. C1 measured the 844 x 390 case (load__phone-landscape: 44 + 540 = 584 px against 390 px). The panel breakpoint is width-only in CSS and in JS (main.js:60, panel.js:37). | Add `@media (max-height: 500px) { .fd-stage { min-height: 0; } }` and hide the dock or shrink it to a 64 px strip there. Consider using the sheet layout for `(pointer: coarse) and (max-height: 500px)`, in CSS and both JS media queries together. |
| C2-14 | minor | vx/js/lattice/lattice.js:624-629 (`readTarget` on a HalfFloat target reads RGBA/HALF_FLOAT via three); three.module.js:2366-2371 assumes HALF_FLOAT is readable whenever either color-buffer extension exists | For float buffers, WebGL 2 guarantees only RGBA/FLOAT reads, plus the implementation's own read pair. Firefox on desktop GL (macOS and Linux) reports RGBA/FLOAT as that pair, so a HALF_FLOAT read there is an INVALID_OPERATION and the pixel buffer stays zero. The page normally takes the float32 path. Only when float32 targets fail does it take the float16 path, and then on those Firefoxes:<br>• the float16 self-test reads 0 and the engine reports 'no-float';<br>• without float32 the reduction chain is float16 too, so the force reads as zero. | Read float targets with a small raw-GL readback (PBO, `readPixels(..., RGBA, FLOAT)` into a Float32Array, fenceSync, clientWaitSync polling, getBufferSubData), or query `IMPLEMENTATION_COLOR_READ_TYPE` with the target bound and fall back to FLOAT. About 25 lines in lattice.js. Verify with `createLattice(..., { precision: 'half' })` in the lattice lab on Firefox. Not reproduced here (no Firefox binary); the defect follows from the WebGL 2 readPixels rules and three's check, so treat it as likely rather than proven. |
| C2-15 | minor | vx/js/lattice/lattice.js:513-529 (`begin` sets autoClear false; `pass` renders without clearing) | Every lattice pass overwrites its whole target, but the driver is never told so. On tile-based mobile GPUs (all iPhones and most Android phones), each pass then loads the old contents into tile memory first. That is 48 bytes per cell per step of reads the result never uses: 8.5 GB/s at tier 2 and 22.6 GB/s at tier 3 at 60 Hz. | In `pass()`, after `renderer.setRenderTarget(rt)`, call `gl.invalidateFramebuffer(gl.DRAW_FRAMEBUFFER, [gl.COLOR_ATTACHMENT0, ...])`, one entry per texture of `rt`. It costs nothing on desktop GPUs. The cylinder gate (C_D 1.4504, St 0.1694) must come out bit-identical, since every texel is overwritten. |
| C2-16 | minor | vx/js/core/governor.js:63 (Save-Data or 2g caps the tier at 1); vx/js/main.js:257-264 | A visitor who asked for reduced data (Save-Data, or effectiveType 2g or slow-2g) still downloads three.js and the CAD, about 1.4 MB on the wire. | When `navigator.connection.saveData` is set or the effective type matches 2g, start in the 2D view with a "Load the 3D view (about 1.4 MB)" button that runs `initView()`. |
| C2-17 | minor | vx/index.html:21-22; vx/css/tokens.css:4-5 | The two fonts are TTF: 272 KB raw, 121 KB gzipped on the wire. The main site has moved to WOFF2 (Archivo and Martian Mono), so nothing is shared with its cache. tokens.css is marked do-not-edit. | Owner decision. Either convert to WOFF2 copies under vx/ (about 40 percent smaller again) and override the @font-face in field.css, or adopt the main site's families. |
| C2-18 | info | vx/js/core/governor.js:68-75 | `webglAvailable()` creates a context on a detached canvas and never releases it. It also accepts WebGL1, though the page needs WebGL2, so a WebGL1-only browser gets tier 3 and then the 2D view. | Probe `webgl2` only, then `getExtension('WEBGL_lose_context')?.loseContext()`. |
| C2-19 | info | vx/css/field.css:44; vx/css/panel.css:24 | `100svh` has no `100vh` fallback, so Chrome before 108, Safari before 15.4 and Firefox before 101 fall back to the 600 px min-height. `--pn-sheet-h` puts svh in a custom property, where a second declaration cannot act as a fallback. | Put `height: calc(100vh - var(--fd-head-h));` before the svh line, and set the custom property inside `@supports (height: 100svh)`. |
| C2-20 | info | vx/js/lattice/lattice.js:749-763 (self-test), 316-339 (materials) | The engine's programs compile synchronously at their first draw. Safari has no KHR_parallel_shader_compile, so boot stalls on the large step shader. The scene already uses `compileAsync` (scene.js:685). | Before the self-test, assign each material to the quad and `await renderer.compileAsync(scene, camera)`. That helps wherever KHR_parallel_shader_compile is exposed (Chrome; ?bench records it for Safari and Firefox); elsewhere it still compiles inline, but once, up front. |
| C2-21 | info | vx/js/lattice/lattice.js:717-722; vx/js/main.js:552-554 | At boot `configure()` runs `applySection()` on an empty section, then main.js sets the real one: two cell passes and two uploads, about 20 ms at tier 3. | Accept `options.section` (the builder) in createLattice so the first configure builds the real one. |
| C2-22 | info | assets/charger-explorer/assembly.bin (outside vx) | Served as application/octet-stream, but GitHub Pages does gzip it: 2,482,932 B raw, 968,234 B on the wire (measured live). C1's local server sends 2.5 MB uncompressed, so local first-paint timings overstate the CAD transfer about 2.6 times. | None for vx. Quantising the mesh is a main-site decision. |
| C2-23 | info | GitHub Pages headers (measured live) | Every file is served with `cache-control: max-age=600`. ETags are `W/"<deploy time hex>-<size hex>"` and Last-Modified is the deploy time, so every deploy invalidates every file. A returning visitor re-downloads all of it after each deploy (about 1.7 MB on the wire), and revalidates with 304s otherwise. Immutable caching is not possible on Pages. Version skew between modules is possible for up to 10 minutes after a deploy: dynamic imports are guarded by try/catch, but a changed static export is not. | Keep module exports backward compatible across a deploy. Do not add a service worker for this release, because stale caches the owner cannot easily clear are a worse failure. Seen live during this review: the main-site release c958c31 and its revert 4cac0c5 were deployed the same night, and after the 04:03:44 UTC deploy every vx file carried a new ETag (`W/"6adadca0-..."`) and Last-Modified although nothing under vx/ changed, so each main-site deploy costs a returning vx visitor a full re-download. |
| C2-24 | info | vx/js/panel/format.js:233-238; panel.js:540; fallback.js:356 | The idle loops of the panel and the 2D view poll every 250 ms forever. This is cheap, but it is a wake-up. | Wake from bus events (main.js already emits flight events) and drop the poll. |
| C2-25 | info | vx/js/scene/scene.js:163 | `powerPreference: 'high-performance'` keeps the discrete GPU on for the life of the tab on dual-GPU laptops (Intel-era MacBook Pro, Windows Optimus), even when idle. | Acceptable given the lattice. With C2-01 in place, the page at least stops loading the GPU. |
| C2-26 | info | vx/js/core/governor.js:117 | Firefox's resistFingerprinting and the Tor Browser quantise rAF and performance.now to 16.7 or 100 ms. Interval percentiles are then meaningless, and the governor can walk down to tier 0. | If the measured timer resolution is coarser than 5 ms, keep the heuristic tier and do not adapt. ?bench reports the resolution. |
| C2-27 | info | vx/js/scene/scene.js:162 | `antialias` follows the raw devicePixelRatio (on only at 1.5 or below), not the ratio the tier renders at. Phones render at 1.5x or 1x with no MSAA, although MSAA is nearly free on tile GPUs. This is the FIELD 6 contract as written. | Owner decision: base it on `dprFor(governor.ceiling) <= 1.5`. |
| C2-28 | info | vx/js/core/governor.js:133 (`overSince \|\|= now`), vx/js/panel/chart.js:91 (`\|\|=`), governor.js:182 and main.js:839 (`MediaQueryList.addEventListener`); vx/index.html:2 and 20 (`no-js` swapped to `js` by a classic script), 72-77 (the poster only in `<noscript>`) | The static module graph needs logical assignment and `MediaQueryList.addEventListener`: Safari 14, Chrome 85, Firefox 79 (section 4). An older engine with JavaScript on (iOS 13 and earlier, which still load module scripts) fails to parse the graph, so nothing runs: the `js` class is already set, the noscript poster does not show, the panel never mounts and the stage stays black on "LOADING THE CAD ASSEMBLY" for good. The share of such browsers in 2026 is tiny. | Feature-test in the inline classic script that already swaps the class (index.html:20): `try { Function('let a; a ||= 1'); if (!matchMedia('all').addEventListener) throw 0; swap no-js to js } catch { leave no-js and insert the poster and its sentence from a <template> holding the noscript markup }`. It is deterministic, needs no timer and cannot misfire on a slow connection. The page has no CSP, so `Function` is allowed. `nomodule` does not help, since these engines do run modules. |

## 4. Safari and iOS WebKit

| Item | Status | Evidence |
|---|---|---|
| EXT_color_buffer_float | Used when present, never required. Missing: the float16 deviation path; both missing: 'no-float' and the 2D view. | lattice.js:278-280, 295, 759-783 |
| RGBA32F targets, MRT | 3 x RGBA32F MRT for the state; reduction chain RGBA32F. Apple A9/A10 GPUs (the oldest WebGL2 iPhones, iOS 15 only) allow 256 bits per pixel across render targets per Apple's Metal feature tables; 3 x RGBA32F is 384, so that target is incomplete. The self-test reads a known equilibrium value back, sees the failure and drops to RGBA16F (192 bits). Handled by design. | lattice.js:742-783 |
| RGBA16F deviation fallback | Correct in WebKit, where ANGLE reports HALF_FLOAT as the implementation read type. Broken in desktop Firefox (C2-14). | lattice.js:624-629 |
| Float32 filtering (OES_texture_float_linear, absent on iOS) | Not needed. State and chain use NearestFilter and texelFetch; the linearly filtered targets are RGBA16F and RG16F, which WebGL2 filters natively. | lattice.js:344-385; shaders.js |
| Float blending (EXT_float_blend) | Not needed: RawShaderMaterial non-transparent, three sets NoBlending. | lattice.js:306-312 |
| Shader precision | Every program starts with `precision highp float; precision highp int; precision highp sampler2D;`, so a mobile driver cannot hand back lowp texture results. | shaders.js:30-32 |
| readRenderTargetPixelsAsync and fences | PBO plus fenceSync, polled with clientWaitSync(…, 0) every 4 ms on setTimeout; the sync and the buffer are deleted after (r186). At most 4 readbacks in flight, 10 Hz. No synchronous readPixels or getImageData in page code (the lint checks this). | three.module.js:19253-19330; three.core.js:2126; lattice.js:634-663 |
| 100svh, safe-area | svh with a min-height (C2-19 for old engines); `viewport-fit=cover`; insets on the header and the sheet, missing on the stage overlays and the rail (C2-12). | field.css:10, 23, 44; panel.css:159-187 |
| touch-action | The canvas gets `pan-y pinch-zoom` inline after OrbitControls has set `none` (scene.js:330-333), so vertical swipes scroll the page and sideways drags flick or orbit. The sheet handle and peek row use `none`; the 2D view uses `pan-y pinch-zoom`. | scene.js:333; panel.css:30, 175-177; field.css:46 |
| Passive listeners | No touch, wheel or mouse listeners in vx code, which uses pointer events only. One non-passive wheel listener from the vendored OrbitControls (C2-11). | grep over vx/js |
| Pointer events, capture | `setPointerCapture` and `lostpointercapture` in scene, panel and fallback; Safari 13 and later. | scene.js:517, 595-602 |
| backdrop-filter | Not used anywhere (the plates are rgba), so no cost. | CSS grep |
| OffscreenCanvas, workers | Not used. | grep |
| Import maps | Safari 16.4 and later. The static graph from main.js has no bare `three`. Without import maps the `scene.js` import rejects and main.js shows the 2D view with "THE 3D VIEW DID NOT LOAD" (main.js:260-261). modulepreload is ignored before Safari 17, which is harmless. | main.js:35-40, 257-264 |
| Top-level await, dynamic import | No top-level await; the three `await import` calls are inside async functions with try/catch. | main.js:260, 630; geom.js:541 |
| structuredClone, Intl, newer syntax | None. Numbers use toFixed, so output does not depend on the locale. No regex lookbehind, static blocks, findLast or Object.hasOwn. `.at()` in panel.js is the flight ring buffer's own method, not Array.prototype.at. | lint; panel.js:214-221 |
| requestIdleCallback | Absent in Safari; guarded with a setTimeout fallback, whose cost is C2-05. | main.js:79 |
| Newer DOM features | `inert` (Safari 15.5), `overflow-wrap: anywhere` (15.4), `resolution` media query (16), the `inset` shorthand (14.1); all degrade silently except `inset`, whose absence in Safari 14.0 alone leaves the 2D view's canvas unsized. Canvas 2D `letterSpacing` is feature-tested (markers.js:85); no roundRect, ctx.filter or conic gradients. | panel.js:491-492; field.css:48, 211; scene.css:11 |
| Engine baseline (acorn parse of every module) | Static graph: Safari 14 / Chrome 85 / Firefox 79, set by `\|\|=` (governor.js:133, chart.js:91) and `MediaQueryList.addEventListener` (governor.js:182, main.js:839); below that nothing runs (C2-28). Scene graph and engine: Safari 14 / Chrome 80 / Firefox 74. three.js r186 (both builds): Safari 16.4 / Chrome 94 / Firefox 93, set by class static blocks (three.core.js:3054). The scan's `.at()` hit in panel.js:214 is the flight ring buffer's own method (flight.js:819), not Array.prototype.at. | reports/ship/c2/syntax-baseline.txt |
| What a Safari 15.0 to 16.3 visitor sees | WebGL2 is there but import maps are not, so `import('./scene/scene.js')` rejects and the page shows the 2D view (main.js:260-261). An import-map shim (es-module-shims) would not rescue the 3D view: three.js r186 itself needs class static blocks, which arrived in the same Safari 16.4. Do not add one. | main.js:257-264 |

## 5. Firefox, memory and bandwidth

**Firefox.** No float32 texture filtering is needed (see above). MRT uses three's `drawBuffers` with 3 attachments, within WebGL2's guaranteed 4. Every fragment writes all three outputs on every path (edges, solids, interior). Edge cells return before the neighbour gather, so texelFetch never reads out of range, which native GL on macOS and Linux leaves undefined (shaders.js:205-232). GLSL ES 3.00 features in use: const array constructors, dynamic indexing of const arrays, integer bit operations, `textureSize`. All are core. No program samples a texture that is also its render target (no feedback loop). The only Gecko-specific defect is the HALF_FLOAT readback (C2-14).

**GPU memory per lattice tier** (from `allocate()`):

| Tier | Grid | Dye (view) | State, f32 / f16 | Other (macro, dye x2, view, chain, cells) | Total, f32 / f16 | Steps/s at 60 Hz | MLUPS | State traffic at 60 Hz | Tile loads at 60 Hz (C2-15) |
|---|---|---|---|---|---|---|---|---|---|
| 3 | 1024 x 320 | 2048 x 640 | 30.0 / 15.0 MB | 20.4 MB | 50.4 / 35.4 MB | 1,440 | 472 | 47.2 GB/s | 22.6 GB/s |
| 2 | 768 x 240 | 1536 x 480 | 16.9 / 8.4 MB | 11.5 MB | 28.4 / 19.9 MB | 960 | 177 | 17.7 GB/s | 8.5 GB/s |
| 1 | 512 x 160 | 512 x 160 | 7.5 / 3.75 MB | 2.3 MB | 9.8 / 6.0 MB | 480 | 39 | 3.9 GB/s | 1.9 GB/s |

The traffic column is a lower bound: per step it counts reading the cell texel and the three state texels and writing three, assuming a perfect texture cache. Dye at 2x is 10.5 MB of the tier 3 "other" and 5.9 MB of the tier 2 one. Add the scene: the livery texture is 512 x 2048 with mipmaps (about 5.6 MB), and the CAD buffers about 2.5 MB. The CAD ArrayBuffer stays alive for the live re-measurement.

**A 2 GB phone.** Chrome reports deviceMemory 2, which today gives tier 2. That is about 28 MB of lattice, a 3 to 5 MB drawing buffer and about 8 MB for the scene: under 45 MB of GPU memory, which is not a memory problem. Bandwidth is the constraint: 18 to 26 GB/s at 60 Hz is more than a mid-range phone's memory system delivers. The engine sheds steps (smoke slows), then the governor sheds a tier after about 8 to 10 s (6 s grace, a 90-frame window, a 2.2 s hold). Tier 1 at 1/9 of the work is the honest start (C2-08).

**Scene drawing buffer** (CSS layout: header 48 or 44 px, rail 320 px, dock 152 or 112 px, peek 72 px):

| Device | Tier | Canvas (CSS) | Render ratio | MSAA | Backing Mpx | Drawing buffer |
|---|---|---|---|---|---|---|
| iPhone SE 375 x 667 at DPR 2 | 2 | 375 x 439 | 1.5 | off | 0.37 | 2.8 MB |
| iPhone 14 Pro 393 x 852 at DPR 3 | 2 | 393 x 590 | 1.5 | off | 0.52 | 4.0 MB |
| Pixel 7 412 x 915 at DPR 2.625 | 2 | 412 x 687 | 1.5 | off | 0.64 | 4.9 MB |
| iPad 820 x 1180 at DPR 2 (reports 8 cores) | 3 | 820 x 932 | 2 | off | 3.06 | 23.3 MB |
| Landscape phone 844 x 390 at DPR 3 | 2 | 844 x 335 on an iPhone with its 21 px home-indicator inset; 844 x 356 in C1's emulation, where env() is 0 (stage 540 px, taller than the screen) | 1.5 | off | 0.64 (0.68 in C1) | 4.9 MB (5.2 in C1) |
| Desktop 1920 x 1080 at DPR 1 | 3 | 1600 x 880 | 1 | 4x | 1.41 | 48.3 MB |
| Desktop 2560 x 1440 at DPR 2 | 3 | 2240 x 1240 | 2 | off | 11.11 | 84.8 MB |

## 6. Battery: what runs while nothing happens

| Loop | Runs when idle | Note |
|---|---|---|
| main.js tick | Yes, while the stage is on screen with the lattice live, at full tier (C2-01). Stops when the stage is off screen or the tab is hidden. | main.js:662, 701-716 |
| governor rAF | Yes, always while the tab is visible, except when the tier is pinned, the ceiling is 0 or reduced motion is set (C2-07). | governor.js:151-157 |
| scene tick | No: it stops when nothing animates; main.js drives it while busy. | scene.js:438-452 |
| panel and 2D-view loops | rAF stops after 20 and 12 idle frames, then a 250 ms poll forever (C2-24). | format.js:219-249 |
| lattice | Owns no rAF; it advances only inside main.js frames and runs no timers of its own. | lattice.js:122-126 |

Rate scaling is right: the engine scales steps per frame by `dt / (1/60)` (lattice.js:876), so 120 and 144 Hz displays run the same steps per second as 60 Hz. At a 30 Hz cap the clamp at 1 halves the steps per second; that is acceptable, since the smoke just moves slower.

## 7. Governor heuristics on phones

| Device | Signals | Start and ceiling today |
|---|---|---|
| iPhone (Safari) | Coarse pointer with the short side under 500 px. WebKit clamps hardwareConcurrency as a fingerprinting defence, so the value says little about the chip; no deviceMemory, no connection. | 2 |
| iPad (Safari) | Coarse pointer, short side 768 px or more; hardwareConcurrency clamped as above. | 3 if it reports more than 4, else 2 |
| Android phone (Chrome) | Real core count; deviceMemory rounded and capped at 8; connection present. | 2 (1 with Save-Data or 2g) |
| 2 GB Android | deviceMemory 2 | 2 |
| Desktop on software GL | 8 or more cores | 3 (C2-08) |
| Any device at a 30 Hz rAF cap | n/a | Borderline step-downs, never back up (C2-09) |

Proposed rules are in C2-08 and C2-09. The data to settle them comes from ?bench (section 9). Each pasted result carries the heuristic tier, the recommended tier and the GPU string, so the rule can be tuned on measurements rather than guesses.

## 8. Network: import graph, first paint and the critical path

The sizes below are measured live from GitHub Pages; Pages gzips every one of these types, including .bin and .ttf.

| Group | Files | Raw | On the wire |
|---|---|---|---|
| HTML | index.html | 37.5 KB | 10.3 KB |
| CSS (render-blocking) | tokens, panel, scene, field | 50.6 KB | about 14 KB |
| Fonts (preloaded, swap) | SpaceGrotesk-var.ttf, IBMPlexMono-Regular.ttf | 272 KB | 121 KB |
| Static module graph (14 modulepreloads) | main.js, bus, governor, flight, barrowman, motor, geom, geom-cad, geom-measure, panel, controls, chart, format, fallback | 298 KB | about 97 KB |
| Scene graph (dynamic) | scene, slice, markers, camera, exhaust, loader, explode, stations, livery, part-stories, OrbitControls | 189 KB | about 50 KB |
| three.js today | three.module.js + three.core.js | 2,121 KB | 428 KB |
| three.js minified (C2-03) | three.module.min.js | 742 KB | 191 KB |
| CAD | assembly.json + assembly.bin | 2,498 KB | 970 KB |
| Engine (dynamic) | lattice.js, shaders.js | 84 KB | about 25 KB |
| **Total first load** | | **about 5.5 MB** | **about 1.72 MB (1.49 MB with C2-03)** |

**First paint** needs the HTML and the four stylesheets: about 24 KB on the wire. The module script is deferred, the fonts swap and the stage is CSS. The panel, the chart and the captions are built by the static graph. three.js and the CAD are not on the first-paint path.

**Time to the first lattice frame** is a chain of dependent steps today:

```
HTML -> main.js graph (modulepreloaded, parallel)
  -> eval: geometry (8 to 29 ms), panel, fillConfig with the 1024 x 320 rasterisation (34 ms warm, up to 255 ms cold)   C2-04
  -> import scene.js -> three.module.js -> three.core.js (hop removed by C2-03)
  -> createScene -> assembly.json -> assembly.bin (serial; parallel with C2-04)
  -> font wait (up to 2.5 s) -> buildScene -> compileAsync (up to 3 s)
  -> import lattice.js -> shaders.js (starts only now; early with C2-04)
  -> createLattice: configure, empty section pass (C2-21), self-test compile (sync, C2-20), readback
  -> setSection (second pass) -> first frame
```

With C2-03 and C2-04 the chain becomes: HTML, then the graph, then (scene and three, the CAD json and bin, the lattice engine) all in flight together, then build, then the first frame.

## 9. Spec: `?bench=1`, a self-benchmark the owner runs on his own machines

**Goal.** One URL the owner opens on each machine and browser (Mac, PC, iPhone, Android; Safari, Chrome, Firefox). It runs about 75 s unattended and prints a plain-text block he pastes back. The block answers four questions:

- how many lattice steps per second the engine sustains per tier;
- how smooth the page is per tier (frame-time percentiles);
- what the governor does on its own (tier changes);
- what the GPU and browser are (vendor strings, extensions, precision path).

It doubles as a cross-device correctness check:

- the flight's apogee and a history hash per JS engine;
- the lattice's NaN and range check and its force at a fixed state per GPU.

It lives in `main.js`, with about 12 lines in `panel.js` and about 12 in `field.css`. There is no new module and nothing outside vx/.

### 9.1 URL forms

- `?bench=1`: the full run, about 75 s on a GPU. Tiers run from the heuristic ceiling down to 1.
- `?bench=quick`: about 25 s. Environment, CPU, engine and pacing at the heuristic tier only, no auto phase.
- `&tier=N` limits the engine and pacing phases to tier N. `&precision=both` adds float16 engine rows.
- While `bench` is present, `autolaunch`, `hold` and `speed` are ignored, and URL write-back is suspended: `scheduleUrl()` returns early.
- The bench scrolls to the top before it starts. The stage must stay on screen, because `latticeFrame` returns false when it is not (main.js:662); a timed phase during which `stageOnScreen` goes false is marked "interrupted (stage off screen)" and repeated once, like a hidden tab.

### 9.2 Start conditions

- Pin before the governor starts. At main.js:145, `if (URL0.bench) governor.pin(benchTiers[0])`, with `benchTiers` computed from `governor.ceiling`. `ceiling` is the heuristic tier and is not changed by pin(), so the report can print it.
- Pinning keeps the governor's adaptation and the slow-frame guard out of the measurement (main.js:594 already skips pinned tiers).
- Begin after all of these:
  - `viewReady` has resolved;
  - `attachLattice` has settled, so `lat.lattice` is set or `lat.reason` is final;
  - the run previews and the still-air apogee are done (expose a `previewsDone` promise from `computeRuns()` and `fillConfig()`);
  - `document.fonts.ready` has resolved;
  - the tab is visible.
- Under reduced motion the heuristic tier is 0. The bench then runs `[1]`, or `&tier=N`, and prints "REDUCED MOTION IS ON: THE PAGE NORMALLY RUNS THE LATTICE AT TIER 0".
- With a lattice fallback, the bench prints the environment, the CPU section and "LATTICE: <reason>", then stops.

### 9.3 Phases

1. **ENV** (instant). Collect:
   - Browser: `navigator.userAgent`, `navigator.userAgentData` brands, platform and mobile (where present), hardwareConcurrency, deviceMemory, devicePixelRatio, the screen and viewport sizes, the coarse-pointer and reduced-motion media queries, Save-Data and effectiveType.
   - Battery: `navigator.getBattery()` charging and level (Chrome only; omit elsewhere).
   - Governor: heuristic tier (`governor.ceiling`) and pinned state.
   - GL strings, from the scene renderer's context: VERSION, SHADING_LANGUAGE_VERSION, VENDOR and RENDERER. Also UNMASKED_VENDOR_WEBGL and UNMASKED_RENDERER_WEBGL via WEBGL_debug_renderer_info: Chrome gives the real GPU, Safari gives "Apple GPU", and Firefox gives a sanitised RENDERER and prints a deprecation warning, so call it only in bench mode.
   - GL limits: MAX_TEXTURE_SIZE, MAX_DRAW_BUFFERS, MAX_COLOR_ATTACHMENTS, MAX_SAMPLES and `getContextAttributes().antialias`.
   - Extensions present: EXT_color_buffer_float, EXT_color_buffer_half_float, OES_texture_float_linear, EXT_float_blend, KHR_parallel_shader_compile, EXT_disjoint_timer_query_webgl2.
   - Engine and renderer: `lattice.stats.precision`, `renderer.getPixelRatio()`, `renderer.getDrawingBufferSize()`.
   - Page version: `document.lastModified`, which is the GitHub Pages deploy time.
   - API presence that the governor or the boot path depends on: `typeof requestIdleCallback`, `HTMLScriptElement.supports?.('importmap')`, `navigator.connection` and `navigator.deviceMemory` present or not.
   - Timer resolution: the smallest nonzero difference between successive `performance.now()` calls.
2. **REFRESH** (1 s). With the main loop idle, a bench-owned rAF records 60 intervals.
   - Median gives the display rate in Hz.
   - A median of 30 ms or more prints "RAF CAPPED NEAR 30 HZ (LOW POWER MODE OR ENERGY SAVER)".
3. **CPU** (well under 1 s on a desktop).
   - `createFlight({ fins: geometry.finDefaults }, { bus: null }).run(12)`: record the wall-clock ms, the apogee in ft to 3 decimals, and an FNV-1a 32-bit hash over each history sample's `Math.round(x * 1e6)`, `Math.round(y * 1e6)` and `Math.round(theta * 1e9)`.
   - `geometry.buildSection({ cols: 512, rows: 160, finScale: 0.99991 })`: the odd fin scale misses the cache; record the ms.
   - The apogee and hash expose JS-engine differences in Math.sin, Math.exp and similar. The flight is deterministic per engine; the bench shows whether it is also identical across engines.
4. **ENGINE** (per tier, about 3 to 10 s each).
   - Set `bench.hold = true`, so `latticeFrame` returns false and the page stops driving the inflow. Then `governor.pin(t)`, `applyLatticeTier()`, and wait one frame.
   - `l.setInflow(0.10, 15 * RAD)`, `l.setBodyRate(0)`, `l.reset()`.
   - Warm-up: loop `l.step(64); await l.sync();` until `l.stats.steps >= 2000` or 8 s have passed. Record `l.stats.developed`.
   - Measure: start at N = 64 and double N until `t0 = now; l.step(N); await l.sync()` takes at least 400 ms (cap N at 8192). Then take 3 repetitions at that N.
   - Report the median steps/s, MLUPS = steps/s x cols x rows / 1e6, and ms per step. `sync()` resolves behind a fence, so this is completed GPU work, not issue rate.
   - Snapshot: `await l.sampleForce()` (cn, cm, xcpCells, developed) and `await l.check()` (bad cells, maxSpeed, maxDrho).
   - With `&precision=both`, repeat the measurement on a temporary second engine, `mod.createLattice(scene3d.renderer, { ...TIERS[t], tier: t, fixedGrid: true, precision: 'half' })` with `setSection(sectionBuilder)`, then `destroy()`.
5. **PACING** (per tier, 11 s each).
   - Set `bench.hold = false` and `governor.pin(t)`. pin() publishes `governor:tier`, and the existing subscriber (main.js:740-746) already calls `scene3d.setTier` and `applyLatticeTier()`, so the scene's render ratio follows the tier as it does on the real page; an explicit `applyLatticeTier()` is harmless (it returns early on an unchanged tier) but not needed.
   - Configure the full-fins run at a fixed rate of 1/8 (`playback.setRate(1 / 8)`), so the stage shows the real thing: rocket, slice, plume and lattice through the boost. Give `startRun(key, { quiet: true })` an option that skips `scrollTo`, `stage.focus` and `markRun`.
   - Discard 3 s, then record 8 s from a hook in `tick` (main.js:691-713):
     - the rAF interval;
     - the tick CPU ms (`performance.now()` at entry and exit);
     - `flowing`.
   - Sample once a second: `l.stats.stepsPerSecond` with `rateSource`, `stepScale`, `shed`, `issueMs`, `msPerFrame`; `scene3d.stats.ms`, `calls` and `triangles`; `performance.memory.usedJSHeapSize` at start and end (Chrome).
   - Where supported, count long animation frames with a guarded `PerformanceObserver({ type: 'long-animation-frame' })` and record their maximum duration.
   - Report:
     - interval p50, p90, p95, p99 and max;
     - fps;
     - the share of intervals over 1.5 times the refresh interval (dropped frames);
     - tick CPU p50 and p95;
     - steps/s completed;
     - the minimum stepScale;
     - the backing-store Mpx.
   - Finish with `playback.reset()`.
6. **AUTO** (full mode only, 25 s).
   - `governor.pin(null)` and `resumeLattice()` (cap 3), then the gust run at rate 1.
   - Record every `governor:tier` event as `{ t_ms, tier, reason }` (bus.on) and every slow-frame guard cap. For the guard, add one line in `watchLatticeCost`, main.js:606-609: `bench?.event('guard', { cap: lat.cap, medianMs: median })`.
   - Record the final tier and stats.
7. **RESTORE AND REPORT.**
   - Restore `governor.pin(URL0.tier ?? null)`, `lat.cap = 3`, `rateOverride = URL0.speed`, `armedGust`, `playback.reset()`, and the panel values snapshotted at the start (`panel.set` for each).
   - Build the text block and the JSON; `console.log` both once.
   - Set `document.documentElement.dataset.bench = 'done'`, and expose the result as a getter `bench` on `window.__field` (main.js:1093), so a harness can run `?bench=quick` under SwiftShader as a smoke test.
   - Errors: an exception in a phase is recorded in that phase as `error: <message>`, and the run continues.
   - If the tab is hidden during a timed phase, that phase is marked "interrupted (tab hidden)" and repeated once when the tab is visible again.

### 9.4 Verdict rules (printed, so the owner and the governor can use them)

- **Engine OK at tier t:** completed steps/s is at least 1.1 x `TIERS[t].steps` x 60.
- **Pacing OK at tier t:** p95 is at most 34 ms, at most 5 percent of frames are dropped, and the minimum stepScale is at least 0.75.
- **Recommended start tier:** the highest t where both hold.
  - Printed next to the heuristic tier as "HEURISTIC T3 / RECOMMENDED T2 / HEURISTIC TOO HIGH", or "... MATCHES" or "... TOO LOW".
- **Cross-device check:**
  - A NaN, a nonzero bad-cell count, cn of 0, or a sign different from other machines at the same tier means a precision or driver fault.
  - cn and cm should agree across GPUs to within about 10 percent at the fixed step count. The flow at Re 3,000 is unsteady, so exact agreement is not expected.

### 9.5 Output (format template; values in angle brackets are placeholders)

```
CHARGER FIELD BENCH v1 / <ISO time> / page deployed <document.lastModified>
MODE      full / tiers 3 2 1 / <total s> s
BROWSER   <userAgent>
DEVICE    cores <n> / memory <GB or n/a> / dpr <x> / screen <WxH> / viewport <WxH> / coarse <yes|no> / reduced <yes|no> / battery <charging, %, or n/a>
GL        <VERSION> / <SHADING_LANGUAGE_VERSION>
GPU       vendor <VENDOR> / renderer <RENDERER> / unmasked <UNMASKED_VENDOR> <UNMASKED_RENDERER or n/a>
LIMITS    max texture <n> / draw buffers <n> / samples <n> / antialias <yes|no>
EXT       color_buffer_float <y|n> / color_buffer_half_float <y|n> / texture_float_linear <y|n> / float_blend <y|n> / parallel_compile <y|n> / timer_query <y|n>
TIMER     resolution <ms> / display <Hz> <(30 HZ CAP?)>
GOVERNOR  heuristic T<n> / precision <rgba32f|rgba16f-dev>
CPU       flight run(12) <ms> ms / apogee <ft.3> ft / history <hash8> / section 512x160 <ms> ms
ENGINE    tier  steps/s  MLUPS  ms/step  precision  developed  bad  maxU   maxDrho  cn     cm
          3     <n>      <n>    <n>      <p>        <y|n>      <n>  <n>    <n>      <n>    <n>
          2     ...
          1     ...
PACING    tier  fps   p50   p90   p95   p99   max   dropped  tick p50/p95  steps/s  stepScale  scene ms  backing Mpx
          3     <n>   <n>   <n>   <n>   <n>   <n>   <%>      <n>/<n>        <n>      <n>        <n>       <n>
          2     ...
          1     ...
AUTO      start T<n> / <t s> T<a> -> T<b> (<reason>) / guard <none | t s cap <n> (median <ms>)> / end T<n>
VERDICT   heuristic T<n> / recommended T<n> / <MATCHES | HEURISTIC TOO HIGH | HEURISTIC TOO LOW>
```

Below the text, a JSON block holds every number the text prints plus the raw percentile inputs (interval histograms in 1 ms bins, not raw arrays). It stays under about 8 KB.

### 9.6 Where it shows, and the panel change

- **main.js** inserts the bench section only when `?bench` is present, directly after `#stage`: `<section class="fd-sec fd-bench" id="bench" aria-labelledby="bench-h">`. It contains:
  - an h2 "Benchmark";
  - a status line, `<p aria-live="polite">`, written at most once a second: "BENCHMARK / 4 OF 7 / ENGINE T2 / 6 S LEFT". The same text goes to the stage's own status line (`[data-status]`, main.js:86), because the bench section sits below the stage and is off screen while the bench runs; at the end the status line reads "BENCHMARK DONE / RESULT BELOW" and the page moves focus to the `<pre>` with `preventScroll: false`;
  - a `<pre tabindex="0">` with the text block;
  - a `<details>` with the JSON;
  - buttons "Copy result" and "Run again".
  - Copy uses `navigator.clipboard.writeText`. If that fails, it selects the `<pre>` with a Range and says "Press Command or Control and C to copy".
  - No emoji and no exclamation marks. Any new visible copy (the h2, the status lines, the button labels, the README paragraph) follows CLAUDE.md: first person where a person speaks, US spelling, no em or en dashes, and `python3 check-writing.py` on the page before it ships.
- **panel.js** gains `attach({ bench })`, where `bench` is `null` or `{ label }`, in `attach` (panel.js:630-638):
  - `writeLatticeLine` (panel.js:365-374) appends ` / ${bench.label}`.
  - `syncEnabled` (panel.js:445-458) disables every control with the reason "BENCHMARK RUNNING".
  - `keysActive` (panel.js:567) returns false, so a stray key cannot launch or reset mid-measurement.
- **field.css** gets a `.fd-bench` block: mono, paper on ink, `max-width: var(--measure)`, and `white-space: pre; overflow-x: auto` on the pre. It needs no new tokens.

### 9.7 What the owner does

From the README: "Open https://merttureli.com/vx/?bench=1 on each machine and browser, plugged in, with the tab in front and other tabs closed. Wait about 75 seconds without touching the page, press Copy result and paste it." For the engine alone on a real GPU, the existing `lab/lattice.html?validate=cylinder` gate also runs in seconds there instead of 7 minutes under SwiftShader. Paste its C_D and St beside the bench block. That gives the method section real-GPU validation numbers next to the software-GL ones.

### 9.8 Effort and risk

- About 200 lines in main.js, 12 in panel.js and 12 in field.css.
- No change when `?bench` is absent, apart from three one-line hooks that test a null `bench` (tick, latticeFrame, watchLatticeCost) and the `scheduleUrl` guard.
- The harness gates are unaffected. Add `node check.cjs 'vx/index.html?bench=quick'` to the gate list as a smoke test.

## 10. Files

All under the scratchpad `/tmp/claude-0/-home-user-merttureli-site/89c47636-e713-59a0-ab78-6864669d7dfa/scratchpad`:

- Report: `/tmp/claude-0/-home-user-merttureli-site/89c47636-e713-59a0-ab78-6864669d7dfa/scratchpad/reports/ship/c2/c2-static-review.md` (this file)
- Measurements:
  - `/tmp/claude-0/-home-user-merttureli-site/89c47636-e713-59a0-ab78-6864669d7dfa/scratchpad/reports/ship/c2/cpu-bench.txt`
  - `/tmp/claude-0/-home-user-merttureli-site/89c47636-e713-59a0-ab78-6864669d7dfa/scratchpad/reports/ship/c2/gpu-bytes.txt`
  - `/tmp/claude-0/-home-user-merttureli-site/89c47636-e713-59a0-ab78-6864669d7dfa/scratchpad/reports/ship/c2/compat-scan.txt`
  - `/tmp/claude-0/-home-user-merttureli-site/89c47636-e713-59a0-ab78-6864669d7dfa/scratchpad/reports/ship/c2/syntax-baseline.txt`
- Scripts, all rerunnable and read-only for the repo:
  - `/tmp/claude-0/-home-user-merttureli-site/89c47636-e713-59a0-ab78-6864669d7dfa/scratchpad/ship/c2-compat-scan.mjs` (static lint; exits 1 on FAIL)
  - `/tmp/claude-0/-home-user-merttureli-site/89c47636-e713-59a0-ab78-6864669d7dfa/scratchpad/ship/c2-syntax-baseline.mjs` (oldest engine per module group, acorn)
  - `/tmp/claude-0/-home-user-merttureli-site/89c47636-e713-59a0-ab78-6864669d7dfa/scratchpad/ship/c2-cpu-bench.mjs` (main-thread boot work in node)
  - `/tmp/claude-0/-home-user-merttureli-site/89c47636-e713-59a0-ab78-6864669d7dfa/scratchpad/ship/c2-section-bench.mjs` (buildSection cold and warm)
  - `/tmp/claude-0/-home-user-merttureli-site/89c47636-e713-59a0-ab78-6864669d7dfa/scratchpad/ship/c2-gpu-bytes.mjs` (texture bytes, traffic, drawing buffers)

## 11. Cross-check with C1

- C1's `load__phone-landscape` cell measured the overflow C2-13 predicts: header 44 px plus stage 540 px against a 390 px viewport.
- C1's backing-store checks (canvas CSS size times the governor's ratio) match section 5 for the iPhone SE (375 x 439 at 1.5) and the landscape phone (844 x 356 at 1.5 in emulation).
- Items that only a real device can settle, and which ?bench or a manual check on the owner's phone should cover: C2-02 (background context loss on iOS), C2-09 (30 Hz caps), C2-12 (safe-area overlays in landscape), C2-14 (Firefox HALF_FLOAT read), C2-15 (tile loads), and the phone start tier in C2-08.
