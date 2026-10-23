# Shipping confidence findings (C1 runtime matrix, C2 static review)

## C2: static compatibility and performance review, plus the ?bench=1 spec

Report: /tmp/claude-0/-home-user-merttureli-site/89c47636-e713-59a0-ab78-6864669d7dfa/scratchpad/reports/ship/c2/c2-static-review.md

### Defects

1. [major] vx/js/main.js:662, 701-712 (latticeFrame / tick re-arm)
   - The lattice never idles. While the stage is on screen and the tab is visible, the flow runs at full tier forever, even after the flight ends and nobody touches the page. At tier 3 that is 1,440 steps/s on 327,680 cells (472 MLUPS), about 47 GB/s of state traffic. A page left open means fan noise, heat and battery drain.
   - Fix: Add an idle pause. Track lastActivity (pointerdown or keydown on the stage or panel, panel.onControl, launch, run buttons, resume). When !playback.running && !hold && !governor.stats.pinned && now - lastActivity > 90 s, set lat.idle and return false from latticeFrame. Show the existing FLOW PAUSED badge with Resume flow. Pinned tiers and ?hold are exempt, so the probes are unaffected.
2. [major] vx/js/main.js:328-342 (5 s ctxTimer), 353-367 (contextGone)
   - The 5 s context-restore wait runs on wall time, including while the tab is hidden. iOS can drop WebGL contexts when the app goes to the background and restore them on return. The overdue timer and the restore event then race, which can leave the visitor on the 2D view until a reload. This follows from the code; I did not reproduce it, and Chromium emulation cannot.
   - Fix: Count only visible time. Start ctxTimer in onContextLost only when !document.hidden. In a visibilitychange handler, clear the timer on hide, and on show start a fresh CONTEXT_WAIT_MS if the context is still lost. Keep the restore listener until the fallback actually runs.
3. [minor] vx/index.html:23; vx/lab/scene.html:12, lattice.html:68, geom.html:11, panel.html:11; vx/lab/validation/l1.html:20, l2-cylinder.html:18
   - The import maps load the unminified three.module.js plus three.core.js: 2.12 MB of source, 428 KB gzipped, and one extra request hop. The vendored three.module.min.js is the same r186 in one file: 742 KB, 191 KB on the wire. The main site's explorer already loads it, so visitors from the home page have it cached.
   - Fix: Point every vx import map at ../assets/charger-explorer/vendor/three.module.min.js. OrbitControls imports 'three' through the map, so it follows. Re-run the harness on the page and the labs.
4. [minor] vx/js/main.js:1002-1004, 1075-1079; 257-292; vx/js/stage/loader.js:27-30
   - The boot path is serial in four places. fillConfig rasterises a 1024 x 320 section (34 ms warm, up to 255 ms cold in node) before initView starts the scene import. The lattice import waits for the CAD build. The loader fetches assembly.json and only then assembly.bin.
   - Fix: Compute cellMm and dCells in closed form (geom.js:283: cellM = refs.length / (SPAN_FRACTION * 1024)). Call initView before fillConfig. Start import('./lattice/lattice.js') beside the scene import when governor.tier > 0. Fetch the json and the bin with Promise.all and check the length afterwards.
5. [minor] vx/js/main.js:79 (idle fallback setTimeout 60), 901-954 (flyRun, computeRuns), 1006-1011 (run(12))
   - Five run previews and the still-air apogee run as unsliced callbacks of 25 to 42 ms each in node (EST 100 to 200 ms each on a phone). Without requestIdleCallback (stable Safari) they land 60 ms apart during boot, competing with the CAD build and shader compiles.
   - Fix: Start computeRuns when #runs comes within one viewport (IntersectionObserver, rootMargin 100% 0px) or after the lattice is attached. Slice each flight into chunks of about 200 steps with a deadline check (timeRemaining > 4 ms, or an 8 ms setTimeout budget).
6. [minor] vx/js/main.js:257-285; vx/js/scene/scene.js:657 (loadGeometry without onProgress); vx/index.html:74
   - Until three.js and the CAD arrive (about 1.4 MB on the wire, 30 s or more on a slow mobile link), the first screen is a black stage reading LOADING THE CAD ASSEMBLY. The 2D view is already in the static graph, and the loader supports onProgress, but nothing passes it.
   - Fix: Mount createFallbackView while viewKind === 'loading' and cross-fade to the scene on scene.ready (no fade under reduced motion). Pass onProgress through createScene and write the MB received to the status line at most once a second. The loader already uses json.bytes, the decoded size, so the gzip encoding does not skew it.
7. [minor] vx/js/core/governor.js:114-116, 152-157, 184; vx/js/main.js:146, 712
   - On the default page the governor's own rAF runs at the display rate whenever the tab is visible, even when nothing draws. Idle frames tell it nothing about load.
   - Fix: Call governor.stop() where tick goes idle (the else lastNow = 0 branch) and governor.start() in kick(). Long term, feed it governor.sample(intervalMs) from tick and drop its own rAF.
8. [minor] vx/js/core/governor.js:56-66 (heuristicTier), 80 (ceiling = tier)
   - Every phone starts at tier 2: 28.4 MB of lattice textures and about 18 GB/s at 60 Hz, more bandwidth than mid-range phone GPUs have. A 2 GB phone gets the same tier as a flagship. The ceiling equals the start tier. Software renderers (SwiftShader, llvmpipe, Basic Render Driver) are not detected, so they start at tier 3 and take tens of seconds of multi-second frames to shed.
   - Fix: Separate the start tier from the ceiling. Phones (coarse pointer, short side under 500 px): start at 1 with a ceiling of 2. deviceMemory <= 2: ceiling 1. A renderer string matching /swiftshader|llvmpipe|softpipe|software|basic render/i: start and ceiling 1. Tune these with ?bench data.
9. [minor] vx/js/core/governor.js:46 (DOWN_P95_MS 34), 48 (UP_P50_MS 17.5), 131-146
   - Under a 30 Hz rAF cap (iOS Low Power Mode, Chrome Energy Saver), the base interval of 33.3 ms sits on the step-down threshold, and the step-up rule (p50 < 17.5 ms) can never pass. One transient drop becomes permanent for the page.
   - Fix: At start, measure the base interval as the median of the first 30 frames. Step down when p95 > max(34, 1.9 x base); step up when p50 < 1.05 x base.
10. [minor] vx/js/scene/scene.js:607-616 (resize); vx/js/core/governor.js:96-99 (dprFor)
   - The backing store has no pixel cap. A 2560 x 1440 screen at DPR 2 renders 11.1 Mpx at tier 3, an 85 MB drawing buffer filled every frame.
   - Fix: Use ratio = min(dprFor(tier), sqrt(MAX_PX[tier] / (w*h))), with MAX_PX = {3: 6e6, 2: 3e6, 1: 1.5e6}, in scene.resize (and in the panel canvases if they grow).
11. [minor] vx/js/scene/camera.js:125-127, 361; assets/charger-explorer/vendor/OrbitControls.js:443, 503
   - OrbitControls always registers a wheel listener with passive: false. The page disables zoom, but every wheel or trackpad scroll that starts over the 100svh stage still waits for the busy main thread.
   - Fix: In createCameraRig: if (!zoom) canvas.removeEventListener('wheel', controls._onMouseWheel). In setZoom(true), add it back with { passive: false }.
12. [minor] vx/css/field.css:56 (.fd-cap), 62 (.fd-badges); vx/css/scene.css:17 (.sc-ticks), 24 (.sc-hint); vx/css/panel.css:34-41 (.pn rail), 153 (.pn-dock); phone layout field.css:209, 212
   - The stage overlays and the desktop rail ignore env(safe-area-inset-left/right). In landscape on a notched or Dynamic Island iPhone, the captions, the Resume flow and Disarm buttons and the rail text sit under the sensor housing.
   - Fix: Use left: calc(max(var(--space-3), env(safe-area-inset-left, 0px)) + 22px) and its mirror on the right. For the rail, set padding-right: max(var(--pn-gutter), env(safe-area-inset-right, 0px)) and widen --pn-rail-w by the inset. Check on a real iPhone in both landscape orientations.
13. [minor] vx/css/field.css:44 (min-height 600px), 207 (min-height 540px, phone layout); breakpoints main.js:60, panel.js:37
   - Short landscape viewports overflow. C1 measured 844 x 390 at 44 + 540 = 584 px against 390 px; 932 x 430 gets a 600 px stage. The dock and the bottom of the canvas fall below the fold.
   - Fix: Add @media (max-height: 500px) { .fd-stage { min-height: 0 } } and hide the dock or shrink it to a strip there. Consider the sheet layout for (pointer: coarse) and (max-height: 500px), changing the CSS and both JS media queries together.
14. [minor] vx/js/lattice/lattice.js:624-629 (readTarget on HalfFloat); assets/charger-explorer/vendor/three.module.js:2366-2371 (textureTypeReadable)
   - On the float16 path, the readback uses RGBA/HALF_FLOAT. WebGL 2 guarantees only RGBA/FLOAT plus the implementation's own read pair, and desktop-GL Firefox likely reports FLOAT, so the read would fail. The self-test would then report 'no-float' and the force would read zero. This is the fallback path only, and it is unverified here (no Firefox binary).
   - Fix: Read float targets with a small raw-GL readback (a PBO, readPixels RGBA/FLOAT into a Float32Array, fenceSync, clientWaitSync polling, getBufferSubData), or query IMPLEMENTATION_COLOR_READ_TYPE and fall back to FLOAT. Verify with precision: 'half' in the lattice lab on Firefox.
15. [minor] vx/js/lattice/lattice.js:513-529 (begin sets autoClear false; pass renders without clearing)
   - Every lattice pass overwrites its whole target, but the driver is never told. Tile-based mobile GPUs therefore load the old contents into tile memory for each pass: 8.5 GB/s at tier 2 and 22.6 GB/s at tier 3 that nothing uses.
   - Fix: In pass(), after setRenderTarget(rt), call gl.invalidateFramebuffer(gl.DRAW_FRAMEBUFFER, [COLOR_ATTACHMENT0..n-1]). The cylinder gate (C_D 1.4504, St 0.1694) must come out bit-identical.
16. [minor] vx/js/core/governor.js:63; vx/js/main.js:257-264
   - A Save-Data or 2g visitor still downloads three.js and the CAD, about 1.4 MB on the wire.
   - Fix: With connection.saveData or a 2g effective type, start in the 2D view with a 'Load the 3D view (about 1.4 MB)' button that runs initView().
17. [minor] vx/index.html:21-22; vx/css/tokens.css:4-5
   - The two fonts are TTF: 272 KB raw, 121 KB on the wire. The main site moved to WOFF2, so nothing is shared with its cache.
   - Fix: Owner decision: WOFF2 copies under vx/ with an @font-face override in field.css (tokens.css is do-not-edit), or adopt the main site's families.
18. [info] vx/js/core/governor.js:68-75 (webglAvailable)
   - The probe accepts WebGL1 although the page needs WebGL2, and never releases the probe context.
   - Fix: Probe webgl2 only, then getExtension('WEBGL_lose_context')?.loseContext().
19. [info] vx/css/field.css:44; vx/css/panel.css:24
   - 100svh has no 100vh fallback (Chrome < 108, Safari < 15.4, Firefox < 101 fall back to the 600 px min-height). In --pn-sheet-h the svh sits in a custom property, where a second declaration cannot act as a fallback.
   - Fix: Put height: calc(100vh - var(--fd-head-h)) before the svh line, and set the custom property inside @supports (height: 100svh).
20. [info] vx/js/lattice/lattice.js:749-763 (self-test), 316-339 (materials)
   - The engine's programs compile synchronously at first draw, so boot stalls on the large step shader.
   - Fix: Before the self-test, await renderer.compileAsync on the quad scene for each material. That helps where KHR_parallel_shader_compile exists (?bench records it).
21. [info] vx/js/lattice/lattice.js:717-722; vx/js/main.js:552-554
   - At boot, configure() runs applySection on an empty section, then main.js sets the real one: two cell passes and two uploads, about 20 ms at tier 3.
   - Fix: Accept options.section (the builder) in createLattice, so the first configure builds the real section.
22. [info] assets/charger-explorer/assembly.bin (outside vx)
   - GitHub Pages gzips the bin (2,482,932 B raw, 968,234 B on the wire, re-measured live). C1's local server sends it uncompressed, so local first-paint timings overstate the CAD transfer about 2.6 times.
   - Fix: Nothing to change in vx. Quantising the mesh is a main-site decision.
23. [info] GitHub Pages headers (live)
   - Pages serves every file with cache-control max-age=600, and ETag and Last-Modified follow the deploy time. Every deploy, including main-site-only ones (seen live after the 04:03:44 UTC deploy of 4cac0c5), invalidates every vx file. Modules can be out of step for up to 10 minutes after a deploy.
   - Fix: Keep module exports backward compatible across a deploy. Do not add a service worker for this release.
24. [info] vx/js/panel/format.js:233-238; panel.js:540; fallback.js:356
   - The idle loops of the panel and the 2D view poll on a 250 ms setInterval forever, a small but constant wake-up.
   - Fix: Wake them from bus events and drop the poll.
25. [info] vx/js/scene/scene.js:163
   - powerPreference 'high-performance' keeps the discrete GPU on for the life of the tab on dual-GPU laptops.
   - Fix: Acceptable given the lattice. With C2-01 in place, the page at least stops loading that GPU.
26. [info] vx/js/core/governor.js:117
   - resistFingerprinting and Tor quantise the timers, so the interval percentiles mean nothing and the governor can walk down to tier 0.
   - Fix: If the measured timer resolution is coarser than 5 ms, keep the heuristic tier and do not adapt. ?bench reports the resolution.
27. [info] vx/js/scene/scene.js:162
   - antialias follows the raw devicePixelRatio (on only at 1.5 or below), not the ratio the tier renders at, so phones get no MSAA, although it is nearly free on tile GPUs. This matches the FIELD 6 contract as written.
   - Fix: Owner decision: base it on dprFor(governor.ceiling) <= 1.5.
28. [info] vx/js/core/governor.js:133 and vx/js/panel/chart.js:91 (||=), governor.js:182 and main.js:839 (MediaQueryList.addEventListener); vx/index.html:2, 20, 72-77
   - New in this pass. The static module graph needs Safari 14 / Chrome 85 / Firefox 79 (acorn scan). An older engine with JavaScript on (for example iOS 13) cannot parse it: the js class is already set, the noscript poster never shows, the panel never mounts, and the stage stays on LOADING THE CAD ASSEMBLY for good.
   - Fix: In the inline classic script at index.html:20, feature-test first: try { Function('let a; a ||= 1'); if (!matchMedia('all').addEventListener) throw 0; swap the class } catch { keep no-js and insert the poster from a <template> }. It is deterministic and needs no timer; the page has no CSP. nomodule does not help, because these engines do run modules.

### Notes

I picked up from the interrupted run instead of starting over. That run had already left a nearly complete report, measurements and scripts. In this pass I checked them and filled the gaps:

- **Line numbers:** every line number in the report still holds. HEAD is now b138408 and origin/main (the live site, deployed 04:03:44 UTC) is 4cac0c5. Neither changes anything under vx/ or assets/charger-explorer/ since f05d73b, except the new validation pages.
- **Live headers:** I read them again with curl. They confirm the gzip sizes and max-age=600. They also show that a main-site-only deploy gave every vx file a new ETag.
- **Compat lint:** I re-ran it and got the same result: 0 FAIL, 11 WARN, 9 INFO.
- **New scan and finding:** I added an acorn scan that finds the oldest engine able to run each group of modules. Script: /tmp/claude-0/-home-user-merttureli-site/89c47636-e713-59a0-ab78-6864669d7dfa/scratchpad/ship/c2-syntax-baseline.mjs; output: /tmp/claude-0/-home-user-merttureli-site/89c47636-e713-59a0-ab78-6864669d7dfa/scratchpad/reports/ship/c2/syntax-baseline.txt. It produced one new finding, C2-28, and one decision:
  - The static graph needs Safari 14, Chrome 85 or Firefox 79.
  - three.js r186 needs Safari 16.4, because of class static blocks. Safari 16.4 is also the first version with import maps, so an import-map shim would not bring back the 3D view on Safari 15.0 to 16.3. Do not add one.
- **Claims softened:** where I had no browser to check, I marked findings as unverified: C2-02 (iOS losing the graphics context in the background), C2-14 (Firefox reading float16 back), requestIdleCallback in Safari and KHR_parallel_shader_compile.
- **Cross-check with C1:** section 11 lines the report up with C1's results. C1 measured the 844 x 390 overflow (C2-13). C1 also measured the landscape canvas at 356 px, where I computed 335 px; the difference is the 21 px safe-area inset, which emulation sets to 0.

The ?bench=1 spec is in section 9 of the report. It needs about 200 lines in main.js, 12 in panel.js and 12 in field.css, with no new module and nothing outside vx/. This pass tightened it in four places:
- the stage must stay on screen during the run, and a phase that loses it is repeated;
- progress also goes to the stage's own status line, so a viewer can see it while the run is going;
- the playback rate and the armed gust are restored afterwards;
- pin() already re-applies the tier through the existing subscriber, so the spec no longer needs a separate call.

**Repo state:** I made no changes to the repo. Everything I wrote is under the scratchpad's reports/ship/c2 and ship folders. Another track has an uncommitted edit to vx/js/validation/l1-lattice.js; that is not mine.

The report passes `python3 check-writing.py` and has no em or en dashes and no exclamation marks.

## C1

Report: /tmp/claude-0/-home-user-merttureli-site/89c47636-e713-59a0-ab78-6864669d7dfa/scratchpad/reports/ship/c1/c1-runtime-matrix.md

### Defects

1. [Medium] vx/js/main.js:328 (CONTEXT_WAIT_MS 5000), :341, :353-358 (contextGone removes the webglcontextrestored listener)
   - If a lost WebGL context comes back after 5 s, the page ignores it. By then it has already switched to the 2D view and removed the restore listener, so the 3D view and the lattice only return after a reload. The 5 s timer also keeps running while the tab is hidden, which is when mobile browsers tend to drop and later restore contexts. laterestore.cjs reproduces this every time: the restore comes 8 s after the loss, isContextLost() is false, and 10 s later the header still reads OFF / NO 3D VIEW. The context cell hit the same path on the landscape phone and at 2560x1440.
   - Fix: Keep a webglcontextrestored listener after contextGone and rebuild the 3D view when it fires (createScene, then attachLattice, as initView does). Do not count the 5 s while document.hidden: start the countdown on visibilitychange to visible.
2. [Medium] vx/css/field.css:207 (.fd-stage { min-height: 540px } inside @media (max-width: 859.98px))
   - Landscape phones (844x390, and 839 to 852 px wide by 375 to 412 px tall) match the phone query by width, so the stage keeps its 540 px minimum. Header 44 + stage 540 = 584 px, which is 172 to 209 px more than the screen height. The chart dock (y 400 to 512) ends up below the fold, the flow caption (y 344 to 380) sits under the collapsed sheet (top 319), and the 3D view gets 275 px. The iPad rotated to 1180x820 is fine.
   - Fix: Add @media (max-width: 859.98px) and (max-height: 500px) { .fd-stage { min-height: 0; } } (or min-height: min(540px, calc(100svh - var(--fd-head-h)))). In the same query, drop the dock chart or shrink --pn-dock-h-phone so the view, the captions and the sheet fit on one screen.
3. [Low] vx/js/scene/scene.js:657 (loadGeometry({ signal }) is called without onProgress)
   - The stage shows only 'LOADING THE CAD ASSEMBLY' for the whole 2.5 MB assembly.bin download, which took 50 to 53 s on Slow 3G on all seven devices. stage/loader.js already supports onProgress; nothing passes it.
   - Fix: Pass an onProgress option through createScene to loadGeometry. Have main.js write 'LOADING THE CAD ASSEMBLY / x.x OF 2.5 MB' into [data-status], at most once a second.
4. [Low] vx/js/main.js:631 and :640 (latticePending('lattice pending') in the import and createLattice catch blocks)
   - If the lattice module fails to load, the header reads LATTICE PENDING and LBM PENDING indefinitely, which suggests it is still on its way. This happened on all seven devices with lattice.js blocked. The flight and the 3D view work, and the caption note says the flight model runs without it.
   - Fix: Use a distinct reason such as 'lattice unavailable' in those two catch blocks so the header reads LATTICE UNAVAILABLE. The wording is a copy change, so the owner needs to approve it.
5. [Low] vx/index.html:21-41 (2 font preloads and 14 modulepreloads come before the 4 stylesheets)
   - On Slow 3G, all 20 requests start at 2.22 s. The render-blocking stylesheets finish at 5.7 to 9.6 s, so FCP is 9.9 s even though the HTML arrived at 2.98 s. FCP was 9.4 to 10.1 s on every device. This was measured over HTTP/1.1 without compression; HTTP/2 priorities on GitHub Pages should reduce the effect.
   - Fix: Move the four <link rel=stylesheet> lines above the preloads. Consider fetchpriority=low on the modulepreloads that first paint does not need.
6. [Low] vx/js/main.js:260 (import('./scene/scene.js') only after main.js runs); index.html has no preload for scene.js, three.module.js or three.core.js
   - The CAD waits on six fetches in sequence: the main.js graph, scene.js (18.5 to 21.6 s), three.module.js (to 40 s), three.core.js (to 71 s), assembly.json (to 74.5 s), then assembly.bin (74.5 to 127 s). On Slow 3G the 5.56 MB total sets a floor near 111 s, so fixing this saves about 15 s there. On a fast link with high latency, the six round trips are most of the wait.
   - Fix: Add modulepreload for js/scene/scene.js, three.module.js and three.core.js (and the scene's static imports). Alternatively, start loadManifest and the bin fetch from main.js as soon as WebGL2 is confirmed and pass the result to createScene({ cad }); scene.js:656 already accepts it.
7. [Low] vx/js/main.js:597 (cost guard warm-up is measured in wall-clock time from cost.since) and :714 (visibilitychange handler)
   - The cost guard's 12 s warm-up cap keeps counting while the tab is hidden, so after a long hide it judges the very first frames back. On iPad and the landscape phone, after 60 s hidden, the guard capped the lattice (768x240 to 512x160) within 5 s of showing. On a real GPU this needs 2.5 s of frames over 120 ms, so the risk is small.
   - Fix: Call costRestart() in the visibilitychange handler when the page becomes visible.

### Notes

The matrix is complete: 75 cells, 11 cell types across 7 devices; orientation change is n/a on the two desktops. After re-judging, 54 PASS, 19 WARN, 2 FAIL. Both FAILs are D1 (the context restore landed after 5 s on the landscape phone and on 2560x1440). Every WARN is D2, D3 or D4. Each re-judged check is listed in the report with its reason, and the raw JSON keeps the original verdict. There were no unexpected console errors, page errors or failed requests anywhere. The guard (CLAUDE.md rule 7) blocked zero requests; the page calls none of those hosts.

Soak: 30 min at ?autolaunch=1&speed=1&tier=1, 1440x900, with 29 runs restarted every 60 s. The heap grew +0.15 MB per 10 min after a 5 min warm-up (+0.14 after 10 min; range 18.64 to 18.95 MB). Lattice render targets stayed at 15 throughout (lattice.resources() via window.__field). GL framebuffers (18) and textures (48), renderer.info, DOM nodes and listeners were flat, with 0 errors. Tier 1 was pinned because the unpinned page pauses the lattice under SwiftShader. The heap-snapshot diff puts the remaining growth in V8 compiled code (+505 of 599 KB) and in Chromium's capped performance-entry buffers. Page objects did not grow, so there is no page-level leak.

Caveats:
- The machine was heavily loaded the whole time (4 cores shared with other sessions, load average 14 to 37). Software-GL frames reached p95 of 0.5 to 9 s, with single frames up to 61 s. Absolute times are for this machine only.
- Some first runs failed because the renderer was starved. The keyboard cells on iPhone SE, 2560x1440 and the landscape phone were rerun with longer waits and all passed. The two storm runs that came from the previous runner were rerun with the two-storm version.
- The load, orient and storm-1080 results from before the container restart were reused. The page is byte-identical, but those runs had no request guard.
- Devices are Chromium device emulation only (no WebKit or Firefox). The local server is HTTP/1.1 without gzip, so D5 and the Slow 3G byte totals are upper bounds.

The repository was not touched. Runners are in /tmp/claude-0/-home-user-merttureli-site/89c47636-e713-59a0-ab78-6864669d7dfa/scratchpad/ship/c1/; rebuild the report with python3 -I build-report.py. Results, screenshots, soak and heapdiff data are under /tmp/claude-0/-home-user-merttureli-site/89c47636-e713-59a0-ab78-6864669d7dfa/scratchpad/reports/ship/c1/.

Not defects:
- Context loss with a restore inside 5 s, the no-restore 2D fallback, a blocked assembly.bin, offline after load, and tab hidden 60 s all behave correctly on every device.
- Canvas backing stores match governor.dpr() everywhere.
- Load CLS is 0.026.
- At tier 1 and below the 2D chart canvases render at 1x on DPR 3 phones; that is the governor's design and is passed to C2.

D4's wording is copy, so the owner decides it.

