# C1 runtime matrix: CHARGER field study (vx/index.html)

Track C1 of SHIPPING.md. Measured on 2026-10-23 between 04:21 and 05:25 UTC. Nothing in the repository was changed; every runner, result and screenshot lives under the scratchpad (paths at the end).

## Setup

- Page: `vx/index.html` on branch `claude/charming-pascal-wgx7a3` (HEAD `b138408`). It was served from `scratchpad/ship/snapshot`, a copy taken at 03:43 UTC. `diff -rq` of the snapshot against `vx/` and `assets/charger-explorer/` shows only the untracked `vx/js/validation/` and `vx/lab/validation/` folders another track added since; the page does not load them, so the measured page is the current one.
- Browser: Playwright 1.56.1, Chromium 141.0.7390.37 headless shell, WebGL2 through SwiftShader (software GL), the flags of `harness/check.cjs`. The hidden-tab cell uses the full Chromium build in new headless mode so that minimising the window stops rAF.
- Server: node `http` on 127.0.0.1, HTTP/1.1, no compression, `Cache-Control: no-store`. GitHub Pages serves HTTP/2 with gzip for JS and CSS, so byte counts and request queueing below are a worst case for those files.
- Guard (CLAUDE.md rule 7): every context aborts requests to clarity.ms, bing.com, workers.dev and formspree.io and any POST; zero requests matched the guard in every queue log. The `load`, `orient` and first `storm` results come from the run before the container restart, which had no guard; their logs show no request off 127.0.0.1, and the page source references none of those hosts.
- CPU: 4 cores shared with other sessions; the load average stayed between 14 and 37 for the whole run. Software-GL frames were therefore slow and irregular: the keyboard reruns recorded rAF intervals with a median of 17 ms but a p95 of 0.55 to 9.4 s and single frames of up to 61 s. Absolute times in this report are for this machine and are far above what a phone GPU will show; orderings and state transitions are what carry over.
- Devices (Playwright descriptors where they exist, so UA, touch and isMobile are set): iPhone SE 375x667 DPR 2; iPhone 14 Pro 393x852 DPR 3; Pixel 7 412x839 DPR 2.625; iPad 820x1180 DPR 2; landscape phone 844x390 DPR 3; desktop 1920x1080 DPR 1; desktop 2560x1440 DPR 2. This is Chromium wearing device metrics: WebKit and Firefox engines are not exercised (only Chromium is installed; C2 covers them statically).

## Verdict

75 cells ran: 54 PASS, 19 WARN, 2 FAIL after re-judging the checks whose first verdict was a harness artefact (each one is listed under Re-judged checks with its reason; the raw JSON keeps the first verdict). The FAILs are the context cell on the landscape phone and on 2560x1440: both are D1 below. Every WARN is D2, D3, D4 or a 100svh overflow on a rotated phone (D2 again).

- No console errors, page errors or failed requests in any cell other than the requests the blocking cells aborted on purpose.
- Memory: the 30 minute soak with the lattice running grew the JS heap by 0.15 MB per 10 minutes after warm-up, with three.js render targets, GL framebuffers, GL textures, DOM nodes and listeners flat. A heap-snapshot diff puts the residual growth in V8 compiled code and in Chromium's capped performance-entry buffers, not in page objects. This meets the near-zero bar.
- Two Medium defects: a WebGL context restore that arrives after 5 s is never taken up (the page stays in the 2D view for good), and on landscape phones the stage is taller than the screen, so the chart dock and the flow caption sit behind the collapsed sheet.
- Five Low items: no download progress during the 2.5 MB `assembly.bin`, a blocked lattice import reads as LATTICE PENDING forever, the stylesheets queue behind 16 preloads, the CAD waits on a six-hop import chain, and the cost guard's warm-up clock runs while the tab is hidden.
- Not applicable: orientation change on the two desktops (no orientation). Every other cell ran on all seven devices.

## Defects

| ID | Severity | File and line | What | Evidence | Fix |
|---|---|---|---|---|---|
| D1 | Medium | `vx/js/main.js:328` (CONTEXT_WAIT_MS 5000), `:341`, `:353` to `:358` (`contextGone` removes the `webglcontextrestored` listener) | A lost WebGL context that comes back after 5 s is ignored: the page has already swapped to the 2D view, the listener is gone, and the 3D view and the lattice never return without a reload. The timer also keeps running while the tab is hidden, which is exactly when mobile browsers drop and later restore contexts. | `laterestore.cjs` on desktop 1920x1080: loseContext, restoreContext 8 s later; 10 s after the restore `isContextLost()` is false, the view is still 2D and the header reads OFF / NO 3D VIEW, with the console line "[field] the graphics context did not come back; using the 2D view". The context cell hit the same path on the landscape phone and on 2560x1440: its 1.5 s wait plus the screenshot of the lost state ran past 5 s under load, so the restore landed after the fallback and both pages stayed 2D (`shots/context__phone-landscape__restored.png`). | Keep a `webglcontextrestored` listener after `contextGone` and rebuild the 3D view on it (the `initView` path: `createScene`, then `attachLattice`); and pause the 5 s countdown while `document.hidden` (start it on `visibilitychange` to visible). |
| D2 | Medium | `vx/css/field.css:207` (`.fd-stage { min-height: 540px }` inside `@media (max-width: 859.98px)`) | Landscape phones match the phone query by width, so the stage keeps a 540 px minimum on a 390 px tall screen. Header 44 + stage 540 = 584 px: the chart dock (y 400 to 512) is below the fold and the flow caption (y 344 to 380) sits under the collapsed sheet (top 319). The 3D view gets 275 px between the header and the sheet. | `load` on 844x390 and `orient` on iPhone SE, iPhone 14 Pro and Pixel 7 rotated (839 to 852 px wide, 375 to 412 px tall): header + stage over 100svh by 172 to 209 px; screenshot `shots/load__phone-landscape__settled.png`. iPad rotated (1180x820) is fine. | Add `@media (max-width: 859.98px) and (max-height: 500px) { .fd-stage { min-height: 0; } }` (or `min-height: min(540px, calc(100svh - var(--fd-head-h)))`), and in that query either drop the dock chart or shrink `--pn-dock-h-phone`, so the view, captions and sheet fit one screen. |
| D3 | Low | `vx/js/scene/scene.js:657` (`loadGeometry({ signal })` without `onProgress`); the status line is written in `vx/js/main.js` | During the 2.5 MB `assembly.bin` the stage shows "LOADING THE CAD ASSEMBLY" with no progress for the whole download: 50 to 53 s on Slow 3G on every device. `stage/loader.js` already streams with `onProgress`. | `slow3g` on all seven devices (check "loading state shows progress" WARN); screenshot `shots/slow3g__*__c-bin-downloading.png`. | Pass an `onProgress` option through `createScene` to `loadGeometry` and write `LOADING THE CAD ASSEMBLY / 1.2 OF 2.5 MB` into `[data-status]` at most once a second. |
| D4 | Low | `vx/js/main.js:631` and `:640` (`latticePending('lattice pending')` on a failed import or `createLattice`) | When the lattice module cannot load, the header reads LATTICE PENDING and the engine LBM PENDING indefinitely, which says it is still coming. The caption note does say THE FLIGHT MODEL RUNS WITHOUT IT. | `latblock` on all seven devices: 15 s after the CAD built the header still read LATTICE PENDING; the flight launched and the 3D view worked. | Use a distinct reason such as `'lattice unavailable'` in those two catch blocks so the header reads LATTICE UNAVAILABLE. Copy change: the owner approves the words. |
| D5 | Low | `vx/index.html:21` to `:41` (2 font preloads and 14 modulepreloads ahead of the 4 stylesheets) | On a slow link the render-blocking stylesheets share the first round of bandwidth with 20 other requests, so first paint waits for the last stylesheet. | Slow 3G waterfall on 1920x1080: all 20 requests start at 2.22 s; the stylesheets finish at 5.69, 8.1, 8.06, 9.63 s; FCP 9.9 s although the HTML was in at 2.98 s. FCP on Slow 3G was 9.5 to 10.1 s on every device. HTTP/2 priorities on GitHub Pages will soften this. | Move the four `<link rel="stylesheet">` lines above the preloads, and consider `fetchpriority="low"` on the modulepreloads that first paint does not need. |
| D6 | Low | `vx/js/main.js:260` (dynamic `import('./scene/scene.js')` after main.js runs); `index.html` has no preload for `scene.js`, `three.module.js` or `three.core.js` | The CAD waits on a chain of sequential fetches: main.js graph, then scene.js, then three.module.js, then three.core.js (found only after three.module.js parses), then assembly.json, then assembly.bin. | Slow 3G, every device: scene.js 18.5 to 21.6 s, three.module.js to 40 s, three.core.js to 71 s, assembly.json to 74.5 s, assembly.bin 74.5 to 127 s. On Slow 3G the total bytes (5.56 MB uncompressed) set a floor near 111 s, so the gain there is about 15 s; on a high-latency fast link the six round trips dominate. | Add `<link rel="modulepreload">` for `js/scene/scene.js`, `../assets/charger-explorer/vendor/three.module.js` and `three.core.js` (and the scene's static imports), or start `loadManifest()` and the bin fetch from main.js as soon as WebGL2 is known to exist, handing the buffer to `createScene({ cad })` (the option already exists at scene.js:656). |
| D7 | Low | `vx/js/main.js:597` (warm-up measured from `cost.since` in wall-clock time) and `:714` (visibilitychange handler) | The cost guard's 12 s warm-up cap keeps counting while the tab is hidden, so after a long hide the very first frames back are judged. | `hidden` on iPad and the landscape phone: hidden 10 s after load for 60 s; within 5 s of showing, the guard capped the lattice (768x240 -> 512x160) on software-GL frame times. On a GPU this would need 2.5 s of frames over 120 ms, so the risk is small. | Call `costRestart()` when the page becomes visible again (in the `visibilitychange` handler at main.js:714). |

Observations that are not defects:

- Context loss and restore inside 5 s works on the five devices where the restore landed inside the window: the stage says CONTEXT LOST / 3D VIEW LOST, the flight keeps running, and the restore brings back the 3D view, the lattice (stepping again from 0) and a drawn frame. Objects created after the restore equal the first build (18 framebuffers; 33 to 46 textures depending on the device).
- Without a restore the page falls back to the 2D view after 5 s on every device, and L launches the flight there.
- `assembly.bin` blocked: the 2D view with OFF / NO 3D VIEW on every device; the flight launches. The only console errors are Chromium's own line for the aborted request and scene.js's `[scene] CAD model failed to load`.
- Offline after load: no request was attempted while offline (launch, view switch, run card, scrolling through Configuration and Runs, reset), and the 3D view and the lattice stayed live, on every device.
- Tab hidden 60 s: flight time and lattice steps froze while hidden and resumed without a jump (flight time advanced 0.004 to 0.096 s in the first 1.2 s back at 1/8 speed); no governor step-down came from the gap.
- Resize storm (2 x 40 resizes across the 860 px breakpoint): GL objects and heap flat from storm 1 to storm 2 on every device; on the phones the first storm adds 12 textures once (the wide layout allocates them lazily; the desktops start with them), then nothing; layout and canvas return to the right size; the rail body is never left inert.
- Scene canvas backing store equals CSS size times `governor.dpr()` in every load, rotation, storm and DPR cell (x1.5 at tier 2 on the DPR 2 to 3 devices, x1 at tier 1, x2 at ?tier=3 on DPR 2 and 3). At tier 1 and below the 2D canvases (chart, CP/CG bar, 2D fallback) also render at x1, so their 10 px mono labels are soft on DPR 3 phones; that is the governor's design, noted for C2.
- Layout shift during load (no input) on 1920x1080: CLS 0.0259, from the hint, caption and status appearing in the first 1.7 s. Run cards shift nothing measurable.
- The expanded phone sheet scrolls a focused control into view when frames are flowing (`sheetprobe2.cjs` on iPhone SE at ?tier=0: every stop in view). The first keyboard run on iPhone SE recorded sheet controls below the screen because the starved renderer had not yet run the sheet's transform transition; the rerun passed.

## Verdict grid

| Cell | iphone-se | iphone-14-pro | pixel-7 | ipad | phone-landscape | desktop-1080 | desktop-1440-2x |
|---|---|---|---|---|---|---|---|
| load | PASS | PASS | PASS | PASS | WARN | PASS | PASS |
| slow3g | WARN | WARN | WARN | WARN | WARN | WARN | WARN |
| binblock | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| latblock | WARN | WARN | WARN | WARN | WARN | WARN | WARN |
| offline | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| hidden | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| storm | PASS | PASS | PASS | PASS | WARN | PASS | PASS |
| orient | WARN | WARN | WARN | PASS | PASS | n/a | n/a |
| context | PASS | PASS | PASS | PASS | FAIL | PASS | FAIL |
| dpr | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| keyboard | PASS | PASS | PASS | PASS | PASS | PASS | PASS |

## Load: first paint and time to first lattice frame

Default URL, no throttling (previous run, before the container restart; SwiftShader).

| Device | FCP | LCP | main.js ran | 3D scene | CAD built | first lattice frame | tier / grid | scene canvas css -> backing |
|---|---|---|---|---|---|---|---|---|
| iPhone SE 375x667 DPR 2 | 0.4 s | 0.4 s | 0.6 s | 1.9 s | 3.0 s | 7.3 s | T2 768×240 | 375x439 -> 562x658 |
| iPhone 14 Pro 393x852 DPR 3 | 0.1 s | 0.1 s | 0.4 s | 0.8 s | 1.3 s | 2.7 s | T2 768×240 | 393x624 -> 589x936 |
| Pixel 7 412x839 DPR 2.625 | 0.3 s | 0.3 s | 0.5 s | 1.4 s | 1.8 s | 3.9 s | T2 768×240 | 412x611 -> 618x916 |
| iPad 820x1180 DPR 2 | 0.8 s | 0.8 s | 1.3 s | 2.7 s | 4.1 s | 7.5 s | T2 768×240 | 820x952 -> 1230x1428 |
| Landscape phone 844x390 DPR 3 | 1.5 s | 1.5 s | 0.8 s | 1.6 s | 7.7 s | 11.2 s | T2 768×240 | 844x356 -> 1266x534 |
| Desktop 1920x1080 DPR 1 | 0.5 s | 0.5 s | 1.2 s | 1.7 s | 3.4 s | 10.2 s | T2 768×240 | 1600x880 -> 1600x880 |
| Desktop 2560x1440 DPR 2 | 0.2 s | 0.8 s | 0.7 s | 2.3 s | 3.1 s | 16.7 s | T2 768×240 | 2240x1240 -> 3360x1860 |

## Slow 3G (2000 ms RTT, 50 kB/s, cache off)

First paint, the panel and a working launch all come well before `assembly.bin` arrives on every device; the 3D view and the lattice follow. Contact sheet for 1920x1080: `slow3g-desktop-contact.png` (first paint with an empty stage, panel mounted with the loading status, scene built with markers but no rocket while the bin streams, CAD built mid-flight).

| Device | FCP | panel mounted (main.js ran) | L pressed, flight t after 3 s | 3D scene (three.js parsed) | assembly.bin start to end | CAD built | first lattice frame | requests / bytes |
|---|---|---|---|---|---|---|---|---|
| iPhone SE 375x667 DPR 2 | 9.5 s | 18.6 s | 0.239 s (bin done: False) | 72.5 s | 75 to 126.75 s | 127.7 s | 134.9 s | 38 / 5.56 MB |
| iPhone 14 Pro 393x852 DPR 3 | 9.6 s | 19.6 s | 0.193 s (bin done: False) | 72.4 s | 74.91 to 127.13 s | 128.6 s | 139.4 s | 38 / 5.56 MB |
| Pixel 7 412x839 DPR 2.625 | 9.7 s | 18.7 s | 0.21 s (bin done: False) | 71.8 s | 74.41 to 126.29 s | 127.7 s | 138.7 s | 38 / 5.56 MB |
| iPad 820x1180 DPR 2 | 9.8 s | 20.4 s | 0.106 s (bin done: False) | 74.4 s | 76.74 to 116.82 s | 125.2 s | 137.2 s | 38 / 5.56 MB |
| Landscape phone 844x390 DPR 3 | 9.4 s | 19.0 s | 0.152 s (bin done: False) | 71.8 s | 74.46 to 126.57 s | 127.1 s | 136.6 s | 38 / 5.56 MB |
| Desktop 1920x1080 DPR 1 | 10.1 s | 18.6 s | 0.17 s (bin done: False) | 71.8 s | 74.56 to 126.78 s | 127.8 s | 144.2 s | 38 / 5.56 MB |
| Desktop 2560x1440 DPR 2 | 9.6 s | 18.4 s | 0.099 s (bin done: False) | 71.5 s | 73.96 to 122.18 s | 123.4 s | 148.8 s | 38 / 5.56 MB |

Under SwiftShader the governor had dropped to tier 0 by the time the lattice started, so the final header reads OFF AT TIER 0; the first lattice frame mark is the engine's first steps before that.

## Soak: 30 minutes at ?autolaunch=1&speed=1&tier=1

1440x900, DPR 1. A run card was clicked every 60 s (full, half, none, wind, gust in turn); every 20 s the sampler forced a GC through CDP and read `performance.memory`, CDP Performance metrics, `window.__field.lattice.resources()` (render targets and materials), `renderer.info`, and live GL objects counted by wrapping create/delete on the WebGL2 prototype. `tier=1` is pinned because under SwiftShader the unpinned page pauses the lattice within a minute (soak A below), which would leave the render targets idle.

| Quantity | Value |
|---|---|
| Samples, runs restarted | 90 over 29.8 min, 29 runs |
| JS heap after GC, slope after 5 min warm-up | +0.152 MB per 10 min (CDP JSHeapUsedSize +0.185) |
| JS heap after GC, slope after 10 min warm-up | +0.138 MB per 10 min; range 18.64 to 18.95 MB |
| JS heap, first and last warm sample | 18.33 MB, 18.92 MB |
| Lattice render targets (`lattice.resources().targets`) | 15 to 15 |
| Lattice materials | 9 to 9 |
| GL framebuffers / textures (after warm-up) | 18 to 18 / 48 to 48 |
| GL buffers (after warm-up) | 103 to 105 |
| three.js renderer.info textures / geometries | 44 to 44 / 33 to 33 |
| DOM nodes / JS event listeners | 2377 to 2380 / 87 to 87 |
| Lattice steps over the soak | 6256 at 1 to 5 steps/s (software GL under load) |
| Errors | 0 console or page errors, 0 failed requests |

Earlier partial soaks, cut at 19.4 minutes by the container restart (same runner, 59 samples each, no summary written): A at the default URL, where the cost guard paused the lattice after about 45 s and the tier fell to 0, grew +0.36 MB per 10 min; B at tier 1 grew +0.25 MB per 10 min. Render targets (15), framebuffers and textures were flat in both.

Heap diff (`heapdiff.cjs`, `heapcmp.py`): ?tier=0&autolaunch=1&speed=1, a run every 15 s, heap snapshots after two forced GCs at 186 s and 666 s (31 runs apart).

```
total self size: 16.06 MB -> 16.65 MB (delta 598.7 KB)
largest growth by self size:
  code         (code)                                                       count   30376 ->   30906  size    3414.1 ->    3919.1 KB
  hidden       system / WeakArrayList                                       count     849 ->    1214  size      58.5 ->      86.2 KB
  native       DOMRectReadOnly                                              count     382 ->     836  size      20.9 ->      45.7 KB
  native       LayoutShift                                                  count      71 ->     150  size      11.1 ->      23.4 KB
  native       LayoutShiftAttribution                                       count     191 ->     418  size       7.5 ->      16.3 KB
  native       PerformanceLongAnimationFrameTiming                          count     149 ->     200  size      21.0 ->      28.1 KB
  native       TaskAttributionTiming                                        count      34 ->      62  size       4.2 ->       7.8 KB
  native       PerformanceScriptTiming                                      count      94 ->     124  size      10.3 ->      13.6 KB
  native       PerformanceLongTaskTiming                                    count      34 ->      62  size       3.7 ->       6.8 KB
  hidden       system / ProtectedFixedArray                                 count     254 ->     351  size       3.5 ->       5.2 KB
```

Of the 599 KB, 505 KB is V8 compiled code (tier-up of hot functions; V8 flushes and caps it). Most of the rest is Chromium's buffered performance timeline: layout-shift entries reached 150 and long-animation-frame entries 200, which match Chromium's buffer limits for those types, plus their attribution rects. Page objects did not grow (plain Objects +2, object elements +2, no new detached DOM). There is no page-level leak to fix.

## Matrix, one row per cell

Screenshots are linked for every non-PASS row and for the slow3g, context, binblock and latblock cells; every cell's JSON (all checks with details, logs, snapshots) is `results/<cell>__<device>.json`.

| # | Cell | Device | Verdict | Measured | Checks not passed | Screenshots |
|---|---|---|---|---|---|---|
| 1 | load | iPhone SE 375x667 DPR 2 | PASS | FCP 0.4 s, LCP 0.4 s, CAD built 3.0 s, first lattice frame 7.3 s; sheet layout; header 44 + stage 623 px in a 667 px viewport; tier 2, grid 768×240; canvas 375x439 css, 562x658 backing | none |  |
| 2 | load | iPhone 14 Pro 393x852 DPR 3 | PASS | FCP 0.1 s, LCP 0.1 s, CAD built 1.3 s, first lattice frame 2.7 s; sheet layout; header 44 + stage 808 px in a 852 px viewport; tier 2, grid 768×240; canvas 393x624 css, 589x936 backing | none |  |
| 3 | load | Pixel 7 412x839 DPR 2.625 | PASS | FCP 0.3 s, LCP 0.3 s, CAD built 1.8 s, first lattice frame 3.9 s; sheet layout; header 44 + stage 795 px in a 839 px viewport; tier 2, grid 768×240; canvas 412x611 css, 618x916 backing | none |  |
| 4 | load | iPad 820x1180 DPR 2 | PASS | FCP 0.8 s, LCP 0.8 s, CAD built 4.1 s, first lattice frame 7.5 s; sheet layout; header 44 + stage 1136 px in a 1180 px viewport; tier 2, grid 768×240; canvas 820x952 css, 1230x1428 backing | none |  |
| 5 | load | Landscape phone 844x390 DPR 3 | WARN | FCP 1.5 s, LCP 1.5 s, CAD built 7.7 s, first lattice frame 11.2 s; sheet layout; header 44 + stage 540 px in a 390 px viewport; tier 2, grid 768×240; canvas 844x356 css, 1266x534 backing | WARN: header + stage fit 100svh ("header 44 + stage 540 = 584 px against a 390 px viewport (over by 194 px; field.css:207 min-height 540px)"); WARN: stage captions clear of the collapsed sheet ("caption bottom 380, sheet top 319") | [first](shots/load__phone-landscape__first.png), [settled](shots/load__phone-landscape__settled.png) |
| 6 | load | Desktop 1920x1080 DPR 1 | PASS | FCP 0.5 s, LCP 0.5 s, CAD built 3.4 s, first lattice frame 10.2 s; rail layout; header 48 + stage 1032 px in a 1080 px viewport; tier 2, grid 768×240; canvas 1600x880 css, 1600x880 backing | none |  |
| 7 | load | Desktop 2560x1440 DPR 2 | PASS | FCP 0.2 s, LCP 0.8 s, CAD built 3.1 s, first lattice frame 16.7 s; rail layout; header 48 + stage 1392 px in a 1440 px viewport; tier 2, grid 768×240; canvas 2240x1240 css, 3360x1860 backing | none |  |
| 8 | slow3g | iPhone SE 375x667 DPR 2 | WARN | FCP 9.5 s; assembly.bin 75 to 126.75 s (2.48 MB); launch before bin: t 0.239 s; CAD built 127.7 s, first lattice frame 134.9 s; 38 requests, 5.56 MB | WARN: loading state shows progress during the 2.5 MB download ("status during the download: \"LOADING THE CAD ASSEMBLY\"") | [a-first-paint](shots/slow3g__iphone-se__a-first-paint.png), [b-panel-mounted](shots/slow3g__iphone-se__b-panel-mounted.png), [c-bin-downloading](shots/slow3g__iphone-se__c-bin-downloading.png), [d-launched-before-bin](shots/slow3g__iphone-se__d-launched-before-bin.png), [e-cad-ready](shots/slow3g__iphone-se__e-cad-ready.png), [f-lattice](shots/slow3g__iphone-se__f-lattice.png) |
| 9 | slow3g | iPhone 14 Pro 393x852 DPR 3 | WARN | FCP 9.6 s; assembly.bin 74.91 to 127.13 s (2.48 MB); launch before bin: t 0.193 s; CAD built 128.6 s, first lattice frame 139.4 s; 38 requests, 5.56 MB | WARN: loading state shows progress during the 2.5 MB download ("status during the download: \"LOADING THE CAD ASSEMBLY\"") | [a-first-paint](shots/slow3g__iphone-14-pro__a-first-paint.png), [b-panel-mounted](shots/slow3g__iphone-14-pro__b-panel-mounted.png), [c-bin-downloading](shots/slow3g__iphone-14-pro__c-bin-downloading.png), [d-launched-before-bin](shots/slow3g__iphone-14-pro__d-launched-before-bin.png), [e-cad-ready](shots/slow3g__iphone-14-pro__e-cad-ready.png), [f-lattice](shots/slow3g__iphone-14-pro__f-lattice.png) |
| 10 | slow3g | Pixel 7 412x839 DPR 2.625 | WARN | FCP 9.7 s; assembly.bin 74.41 to 126.29 s (2.48 MB); launch before bin: t 0.21 s; CAD built 127.7 s, first lattice frame 138.7 s; 38 requests, 5.56 MB | WARN: loading state shows progress during the 2.5 MB download ("status during the download: \"LOADING THE CAD ASSEMBLY\"") | [a-first-paint](shots/slow3g__pixel-7__a-first-paint.png), [b-panel-mounted](shots/slow3g__pixel-7__b-panel-mounted.png), [c-bin-downloading](shots/slow3g__pixel-7__c-bin-downloading.png), [d-launched-before-bin](shots/slow3g__pixel-7__d-launched-before-bin.png), [e-cad-ready](shots/slow3g__pixel-7__e-cad-ready.png), [f-lattice](shots/slow3g__pixel-7__f-lattice.png) |
| 11 | slow3g | iPad 820x1180 DPR 2 | WARN | FCP 9.8 s; assembly.bin 76.74 to 116.82 s (2.48 MB); launch before bin: t 0.106 s; CAD built 125.2 s, first lattice frame 137.2 s; 38 requests, 5.56 MB | WARN: loading state shows progress during the 2.5 MB download ("status during the download: \"LOADING THE CAD ASSEMBLY\"") | [a-first-paint](shots/slow3g__ipad__a-first-paint.png), [b-panel-mounted](shots/slow3g__ipad__b-panel-mounted.png), [c-bin-downloading](shots/slow3g__ipad__c-bin-downloading.png), [d-launched-before-bin](shots/slow3g__ipad__d-launched-before-bin.png), [e-cad-ready](shots/slow3g__ipad__e-cad-ready.png), [f-lattice](shots/slow3g__ipad__f-lattice.png) |
| 12 | slow3g | Landscape phone 844x390 DPR 3 | WARN | FCP 9.4 s; assembly.bin 74.46 to 126.57 s (2.48 MB); launch before bin: t 0.152 s; CAD built 127.1 s, first lattice frame 136.6 s; 38 requests, 5.56 MB | WARN: loading state shows progress during the 2.5 MB download ("status during the download: \"LOADING THE CAD ASSEMBLY\"") | [a-first-paint](shots/slow3g__phone-landscape__a-first-paint.png), [b-panel-mounted](shots/slow3g__phone-landscape__b-panel-mounted.png), [c-bin-downloading](shots/slow3g__phone-landscape__c-bin-downloading.png), [d-launched-before-bin](shots/slow3g__phone-landscape__d-launched-before-bin.png), [e-cad-ready](shots/slow3g__phone-landscape__e-cad-ready.png), [f-lattice](shots/slow3g__phone-landscape__f-lattice.png) |
| 13 | slow3g | Desktop 1920x1080 DPR 1 | WARN | FCP 10.1 s; assembly.bin 74.56 to 126.78 s (2.48 MB); launch before bin: t 0.17 s; CAD built 127.8 s, first lattice frame 144.2 s; 38 requests, 5.56 MB | WARN: loading state shows progress during the 2.5 MB download ("status during the download: \"LOADING THE CAD ASSEMBLY\"") | [a-first-paint](shots/slow3g__desktop-1080__a-first-paint.png), [b-panel-mounted](shots/slow3g__desktop-1080__b-panel-mounted.png), [c-bin-downloading](shots/slow3g__desktop-1080__c-bin-downloading.png), [d-launched-before-bin](shots/slow3g__desktop-1080__d-launched-before-bin.png), [e-cad-ready](shots/slow3g__desktop-1080__e-cad-ready.png), [f-lattice](shots/slow3g__desktop-1080__f-lattice.png) |
| 14 | slow3g | Desktop 2560x1440 DPR 2 | WARN | FCP 9.6 s; assembly.bin 73.96 to 122.18 s (2.48 MB); launch before bin: t 0.099 s; CAD built 123.4 s, first lattice frame 148.8 s; 38 requests, 5.56 MB | WARN: loading state shows progress during the 2.5 MB download ("status during the download: \"LOADING THE CAD ASSEMBLY\"") | [a-first-paint](shots/slow3g__desktop-1440-2x__a-first-paint.png), [b-panel-mounted](shots/slow3g__desktop-1440-2x__b-panel-mounted.png), [c-bin-downloading](shots/slow3g__desktop-1440-2x__c-bin-downloading.png), [d-launched-before-bin](shots/slow3g__desktop-1440-2x__d-launched-before-bin.png), [e-cad-ready](shots/slow3g__desktop-1440-2x__e-cad-ready.png), [f-lattice](shots/slow3g__desktop-1440-2x__f-lattice.png) |
| 15 | binblock | iPhone SE 375x667 DPR 2 | PASS | view 2d, grid "OFF / NO 3D VIEW", caption "2D SIDE VIEW / NO 3D VIEW / NO FLOW SECTION"; flight t 0.162 s after L | none | [bin-blocked](shots/binblock__iphone-se__bin-blocked.png) |
| 16 | binblock | iPhone 14 Pro 393x852 DPR 3 | PASS | view 2d, grid "OFF / NO 3D VIEW", caption "2D SIDE VIEW / NO 3D VIEW / NO FLOW SECTION"; flight t 0.129 s after L | none | [bin-blocked](shots/binblock__iphone-14-pro__bin-blocked.png) |
| 17 | binblock | Pixel 7 412x839 DPR 2.625 | PASS | view 2d, grid "OFF / NO 3D VIEW", caption "2D SIDE VIEW / NO 3D VIEW / NO FLOW SECTION"; flight t 0.097 s after L | none | [bin-blocked](shots/binblock__pixel-7__bin-blocked.png) |
| 18 | binblock | iPad 820x1180 DPR 2 | PASS | view 2d, grid "OFF / NO 3D VIEW", caption "2D SIDE VIEW / NO 3D VIEW / NO FLOW SECTION"; flight t 0.131 s after L | none | [bin-blocked](shots/binblock__ipad__bin-blocked.png) |
| 19 | binblock | Landscape phone 844x390 DPR 3 | PASS | view 2d, grid "OFF / NO 3D VIEW", caption "2D SIDE VIEW / NO 3D VIEW / NO FLOW SECTION"; flight t 0.139 s after L | none | [bin-blocked](shots/binblock__phone-landscape__bin-blocked.png) |
| 20 | binblock | Desktop 1920x1080 DPR 1 | PASS | view 2d, grid "OFF / NO 3D VIEW", caption "2D SIDE VIEW / NO 3D VIEW / NO FLOW SECTION"; flight t 0.239 s after L | none | [bin-blocked](shots/binblock__desktop-1080__bin-blocked.png) |
| 21 | binblock | Desktop 2560x1440 DPR 2 | PASS | view 2d, grid "OFF / NO 3D VIEW", caption "2D SIDE VIEW / NO 3D VIEW / NO FLOW SECTION"; flight t 0.127 s after L | none | [bin-blocked](shots/binblock__desktop-1440-2x__bin-blocked.png) |
| 22 | latblock | iPhone SE 375x667 DPR 2 | WARN | view 3d, grid "LATTICE PENDING", caption "FLOW / LATTICE PENDING" / "THE FLIGHT MODEL RUNS WITHOUT IT"; flight t 0.166 s after L | WARN: stage states the lattice is unavailable (not "pending" forever) ("15 s after the CAD built: grid \"LATTICE PENDING\", engine \"BARROWMAN 3-DOF / LBM PENDING\", caption \"FLOW / LATTICE PENDING\" / \"THE FLIGHT MODEL RUNS WITHOUT IT\"") | [lattice-blocked](shots/latblock__iphone-se__lattice-blocked.png) |
| 23 | latblock | iPhone 14 Pro 393x852 DPR 3 | WARN | view 3d, grid "LATTICE PENDING", caption "FLOW / LATTICE PENDING" / "THE FLIGHT MODEL RUNS WITHOUT IT"; flight t 0.122 s after L | WARN: stage states the lattice is unavailable (not "pending" forever) ("15 s after the CAD built: grid \"LATTICE PENDING\", engine \"BARROWMAN 3-DOF / LBM PENDING\", caption \"FLOW / LATTICE PENDING\" / \"THE FLIGHT MODEL RUNS WITHOUT IT\"") | [lattice-blocked](shots/latblock__iphone-14-pro__lattice-blocked.png) |
| 24 | latblock | Pixel 7 412x839 DPR 2.625 | WARN | view 3d, grid "LATTICE PENDING", caption "FLOW / LATTICE PENDING" / "THE FLIGHT MODEL RUNS WITHOUT IT"; flight t 0.102 s after L | WARN: stage states the lattice is unavailable (not "pending" forever) ("15 s after the CAD built: grid \"LATTICE PENDING\", engine \"BARROWMAN 3-DOF / LBM PENDING\", caption \"FLOW / LATTICE PENDING\" / \"THE FLIGHT MODEL RUNS WITHOUT IT\"") | [lattice-blocked](shots/latblock__pixel-7__lattice-blocked.png) |
| 25 | latblock | iPad 820x1180 DPR 2 | WARN | view 3d, grid "LATTICE PENDING", caption "FLOW / LATTICE PENDING" / "THE FLIGHT MODEL RUNS WITHOUT IT"; flight t 0.156 s after L | WARN: stage states the lattice is unavailable (not "pending" forever) ("15 s after the CAD built: grid \"LATTICE PENDING\", engine \"BARROWMAN 3-DOF / LBM PENDING\", caption \"FLOW / LATTICE PENDING\" / \"THE FLIGHT MODEL RUNS WITHOUT IT\"") | [lattice-blocked](shots/latblock__ipad__lattice-blocked.png) |
| 26 | latblock | Landscape phone 844x390 DPR 3 | WARN | view 3d, grid "LATTICE PENDING", caption "FLOW / LATTICE PENDING" / "THE FLIGHT MODEL RUNS WITHOUT IT"; flight t 0.11 s after L | WARN: stage states the lattice is unavailable (not "pending" forever) ("15 s after the CAD built: grid \"LATTICE PENDING\", engine \"BARROWMAN 3-DOF / LBM PENDING\", caption \"FLOW / LATTICE PENDING\" / \"THE FLIGHT MODEL RUNS WITHOUT IT\"") | [lattice-blocked](shots/latblock__phone-landscape__lattice-blocked.png) |
| 27 | latblock | Desktop 1920x1080 DPR 1 | WARN | view 3d, grid "LATTICE PENDING", caption "FLOW / LATTICE PENDING" / "THE FLIGHT MODEL RUNS WITHOUT IT"; flight t 0.114 s after L | WARN: stage states the lattice is unavailable (not "pending" forever) ("15 s after the CAD built: grid \"LATTICE PENDING\", engine \"BARROWMAN 3-DOF / LBM PENDING\", caption \"FLOW / LATTICE PENDING\" / \"THE FLIGHT MODEL RUNS WITHOUT IT\"") | [lattice-blocked](shots/latblock__desktop-1080__lattice-blocked.png) |
| 28 | latblock | Desktop 2560x1440 DPR 2 | WARN | view 3d, grid "LATTICE PENDING", caption "FLOW / LATTICE PENDING" / "THE FLIGHT MODEL RUNS WITHOUT IT"; flight t 0.145 s after L | WARN: stage states the lattice is unavailable (not "pending" forever) ("15 s after the CAD built: grid \"LATTICE PENDING\", engine \"BARROWMAN 3-DOF / LBM PENDING\", caption \"FLOW / LATTICE PENDING\" / \"THE FLIGHT MODEL RUNS WITHOUT IT\"") | [lattice-blocked](shots/latblock__desktop-1440-2x__lattice-blocked.png) |
| 29 | offline | iPhone SE 375x667 DPR 2 | PASS | requests while offline: 0; view 3d, live True, grid 512×160 | none |  |
| 30 | offline | iPhone 14 Pro 393x852 DPR 3 | PASS | requests while offline: 0; view 3d, live True, grid 512×160 | none |  |
| 31 | offline | Pixel 7 412x839 DPR 2.625 | PASS | requests while offline: 0; view 3d, live True, grid 512×160 | none |  |
| 32 | offline | iPad 820x1180 DPR 2 | PASS | requests while offline: 0; view 3d, live True, grid 512×160 | none |  |
| 33 | offline | Landscape phone 844x390 DPR 3 | PASS | requests while offline: 0; view 3d, live True, grid 512×160 | none |  |
| 34 | offline | Desktop 1920x1080 DPR 1 | PASS | requests while offline: 0; view 3d, live True, grid 512×160 | none |  |
| 35 | offline | Desktop 2560x1440 DPR 2 | PASS | requests while offline: 0; view 3d, live True, grid 512×160 | none |  |
| 36 | hidden | iPhone SE 375x667 DPR 2 | PASS | t 0.187 -> hidden 0.187 -> +1.2 s 0.195 -> +5.2 s 0.254; steps 48 -> 48 -> 59; tier changes 1 | none |  |
| 37 | hidden | iPhone 14 Pro 393x852 DPR 3 | PASS | t 0.189 -> hidden 0.189 -> +1.2 s 0.225 -> +5.2 s 0.256; steps 0 -> 0 -> 6; tier changes 1 | none |  |
| 38 | hidden | Pixel 7 412x839 DPR 2.625 | PASS | t 0.379 -> hidden 0.379 -> +1.2 s 0.387 -> +5.2 s 0.568; steps 3 -> 3 -> 10; tier changes 1 | none |  |
| 39 | hidden | iPad 820x1180 DPR 2 | PASS | t 0.222 -> hidden 0.222 -> +1.2 s 0.318 -> +5.2 s 0.349; steps 36 -> 36 -> 0; tier changes 1 | none |  |
| 40 | hidden | Landscape phone 844x390 DPR 3 | PASS | t 0.302 -> hidden 0.302 -> +1.2 s 0.318 -> +5.2 s 0.387; steps 48 -> 48 -> 0; tier changes 1 | none |  |
| 41 | hidden | Desktop 1920x1080 DPR 1 | PASS | t 0.197 -> hidden 0.197 -> +1.2 s 0.262 -> +5.2 s 0.293; steps 37 -> 37 -> 55; tier changes 1 | none |  |
| 42 | hidden | Desktop 2560x1440 DPR 2 | PASS | t 0.131 -> hidden 0.131 -> +1.2 s 0.135 -> +5.2 s 0.166; steps 0 -> 0 -> 5; tier changes 1 | none |  |
| 43 | storm | iPhone SE 375x667 DPR 2 | PASS | GL fb 18 -> 18 -> 18, textures 33 -> 45 -> 45, buffers 78 -> 79 -> 80; heap 21.26 -> 17.63 -> 17.72 MB; steps 45 -> 111 (two storms) | none |  |
| 44 | storm | iPhone 14 Pro 393x852 DPR 3 | PASS | GL fb 18 -> 18 -> 18, textures 33 -> 45 -> 45, buffers 77 -> 80 -> 81; heap 20.84 -> 17.19 -> 17.81 MB; steps 146 -> 238 (two storms) | none |  |
| 45 | storm | Pixel 7 412x839 DPR 2.625 | PASS | GL fb 18 -> 18 -> 18, textures 33 -> 45 -> 45, buffers 78 -> 80 -> 81; heap 22.78 -> 17.76 -> 17.3 MB; steps 141 -> 195 (two storms) | none |  |
| 46 | storm | iPad 820x1180 DPR 2 | PASS | GL fb 18 -> 18 -> 18, textures 44 -> 45 -> 45, buffers 81 -> 81 -> 80; heap 18.97 -> 17.46 -> 17.28 MB; steps 51 -> 150 (two storms) | none |  |
| 47 | storm | Landscape phone 844x390 DPR 3 | WARN | GL fb 18 -> 18 -> 18, textures 46 -> 46 -> 46, buffers 81 -> 81 -> 81; heap 22.26 -> 17.75 -> 17.62 MB; steps 152 -> 269 (two storms) | WARN: header + stage fit 100svh ("header 44 + stage 540 = 584 px against a 390 px viewport (over by 194 px; field.css:207 min-height 540px)") | [after](shots/storm__phone-landscape__after.png) |
| 48 | storm | Desktop 1920x1080 DPR 1 | PASS | GL fb 18 -> 18 -> 18, textures 45 -> 45 -> 45, buffers 79 -> 81 -> 81; heap 21.21 -> 16.97 -> 17.03 MB; steps 30 -> 96 (two storms) | none |  |
| 49 | storm | Desktop 2560x1440 DPR 2 | PASS | GL fb 18 -> 18 -> 18, textures 45 -> 45 -> 45, buffers 81 -> 79 -> 80; heap 22.54 -> 16.95 -> 17.73 MB; steps 80 -> 131 (two storms) | none |  |
| 50 | orient | iPhone SE 375x667 DPR 2 | WARN | rotated: sheet, header 44 + stage 540 px in 375 px, canvas backing [667, 356]; steps 127 -> 141; back: sheet, backing [375, 439] | WARN: header + stage fit 100svh ("header 44 + stage 540 = 584 px against a 375 px viewport (over by 209 px; field.css:207 min-height 540px)") | [rotated](shots/orient__iphone-se__rotated.png), [back](shots/orient__iphone-se__back.png) |
| 51 | orient | iPhone 14 Pro 393x852 DPR 3 | WARN | rotated: sheet, header 44 + stage 540 px in 393 px, canvas backing [852, 356]; steps 36 -> 38; back: sheet, backing [393, 624] | WARN: header + stage fit 100svh ("header 44 + stage 540 = 584 px against a 393 px viewport (over by 191 px; field.css:207 min-height 540px)") | [rotated](shots/orient__iphone-14-pro__rotated.png), [back](shots/orient__iphone-14-pro__back.png) |
| 52 | orient | Pixel 7 412x839 DPR 2.625 | WARN | rotated: sheet, header 44 + stage 540 px in 412 px, canvas backing [839, 356]; steps 111 -> 133; back: sheet, backing [412, 611] | WARN: header + stage fit 100svh ("header 44 + stage 540 = 584 px against a 412 px viewport (over by 172 px; field.css:207 min-height 540px)") | [rotated](shots/orient__pixel-7__rotated.png), [back](shots/orient__pixel-7__back.png) |
| 53 | orient | iPad 820x1180 DPR 2 | PASS | rotated: rail, header 48 + stage 772 px in 820 px, canvas backing [860, 620]; steps 80 -> 100; back: sheet, backing [820, 952] | none |  |
| 54 | orient | Landscape phone 844x390 DPR 3 | PASS | rotated: sheet, header 44 + stage 800 px in 844 px, canvas backing [390, 616]; steps 80 -> 92; back: sheet, backing [844, 356] | none |  |
| 55 | context | iPhone SE 375x667 DPR 2 | PASS | lost: "CONTEXT LOST", status "3D VIEW LOST / WAITING FOR THE GRAPHICS CONTEXT"; restored: view 3d, live True, steps 69, bright px 0.1157 -> 0.1143; no restore: view 2d, "OFF / NO 3D VIEW" | none | [before](shots/context__iphone-se__before.png), [lost](shots/context__iphone-se__lost.png), [restored](shots/context__iphone-se__restored.png), [no-restore-2d](shots/context__iphone-se__no-restore-2d.png) |
| 56 | context | iPhone 14 Pro 393x852 DPR 3 | PASS | lost: "CONTEXT LOST", status "3D VIEW LOST / WAITING FOR THE GRAPHICS CONTEXT"; restored: view 3d, live True, steps 75, bright px 0.0312 -> 0.03; no restore: view 2d, "OFF / NO 3D VIEW" | none | [before](shots/context__iphone-14-pro__before.png), [lost](shots/context__iphone-14-pro__lost.png), [restored](shots/context__iphone-14-pro__restored.png), [no-restore-2d](shots/context__iphone-14-pro__no-restore-2d.png) |
| 57 | context | Pixel 7 412x839 DPR 2.625 | PASS | lost: "CONTEXT LOST", status "3D VIEW LOST / WAITING FOR THE GRAPHICS CONTEXT"; restored: view 3d, live True, steps 53, bright px 0.0417 -> 0.0384; no restore: view 2d, "OFF / NO 3D VIEW" | none | [before](shots/context__pixel-7__before.png), [lost](shots/context__pixel-7__lost.png), [restored](shots/context__pixel-7__restored.png), [no-restore-2d](shots/context__pixel-7__no-restore-2d.png) |
| 58 | context | iPad 820x1180 DPR 2 | PASS | lost: "CONTEXT LOST", status "3D VIEW LOST / WAITING FOR THE GRAPHICS CONTEXT"; restored: view 3d, live True, steps 53, bright px 0.1062 -> 0.0873; no restore: view 2d, "OFF / NO 3D VIEW" | none | [before](shots/context__ipad__before.png), [lost](shots/context__ipad__lost.png), [restored](shots/context__ipad__restored.png), [no-restore-2d](shots/context__ipad__no-restore-2d.png) |
| 59 | context | Landscape phone 844x390 DPR 3 | FAIL | lost: "CONTEXT LOST", status "3D VIEW LOST / WAITING FOR THE GRAPHICS CONTEXT"; restored: view 2d, live False, steps None, bright px 0.0502 -> 0.0756; no restore: view 2d, "OFF / NO 3D VIEW" | FAIL: restore brings back the 3D view and the lattice ("status \"null\", grid \"OFF / NO 3D VIEW\", steps null, live false") | [before](shots/context__phone-landscape__before.png), [lost](shots/context__phone-landscape__lost.png), [restored](shots/context__phone-landscape__restored.png), [no-restore-2d](shots/context__phone-landscape__no-restore-2d.png) |
| 60 | context | Desktop 1920x1080 DPR 1 | PASS | lost: "CONTEXT LOST", status "3D VIEW LOST / WAITING FOR THE GRAPHICS CONTEXT"; restored: view 3d, live True, steps 46, bright px 0.0495 -> 0.0485; no restore: view 2d, "OFF / NO 3D VIEW" | none | [before](shots/context__desktop-1080__before.png), [lost](shots/context__desktop-1080__lost.png), [restored](shots/context__desktop-1080__restored.png), [no-restore-2d](shots/context__desktop-1080__no-restore-2d.png) |
| 61 | context | Desktop 2560x1440 DPR 2 | FAIL | lost: "CONTEXT LOST", status "3D VIEW LOST / WAITING FOR THE GRAPHICS CONTEXT"; restored: view 2d, live False, steps None, bright px 0.0535 -> 0.0079; no restore: view 2d, "OFF / NO 3D VIEW" | FAIL: restore brings back the 3D view and the lattice ("status \"null\", grid \"OFF / NO 3D VIEW\", steps null, live false"); FAIL: restored frame is drawn (not blank) ("bright fraction before 0.0535, restored 0.0079; orange 0.0038 -> 0") | [before](shots/context__desktop-1440-2x__before.png), [lost](shots/context__desktop-1440-2x__lost.png), [restored](shots/context__desktop-1440-2x__restored.png), [no-restore-2d](shots/context__desktop-1440-2x__no-restore-2d.png) |
| 62 | dpr | iPhone SE 375x667 DPR 2 | PASS | device DPR 2; default T2 [562, 658]; ?tier=3 T3 [750, 878]; canvas pixels 514802 / 915552 | none |  |
| 63 | dpr | iPhone 14 Pro 393x852 DPR 3 | PASS | device DPR 3; default T2 [589, 936]; ?tier=3 T3 [786, 1248]; canvas pixels 703492 / 1250724 | none |  |
| 64 | dpr | Pixel 7 412x839 DPR 2.625 | PASS | device DPR 2.625; default T2 [618, 916]; ?tier=3 T3 [824, 1222]; canvas pixels 725724 / 1290176 | none |  |
| 65 | dpr | iPad 820x1180 DPR 2 | PASS | device DPR 2; default T2 [1230, 1428]; ?tier=3 T3 [1640, 1904]; canvas pixels 2078868 / 3694672 | none |  |
| 66 | dpr | Landscape phone 844x390 DPR 3 | PASS | device DPR 3; default T2 [1266, 534]; ?tier=3 T3 [1688, 712]; canvas pixels 1008048 / 1790960 | none |  |
| 67 | dpr | Desktop 1920x1080 DPR 1 | PASS | device DPR 1; default T2 [1600, 880]; ?tier=3 T3 [1600, 880]; canvas pixels 1668014 / 1668014 | none |  |
| 68 | dpr | Desktop 2560x1440 DPR 2 | PASS | device DPR 2; default T2 [3360, 1860]; ?tier=3 T3 [4480, 2480]; canvas pixels 7053801 / 12537016 | none |  |
| 69 | keyboard | iPhone SE 375x667 DPR 2 | PASS | 41 distinct tab stops | none |  |
| 70 | keyboard | iPhone 14 Pro 393x852 DPR 3 | PASS | 41 distinct tab stops | none |  |
| 71 | keyboard | Pixel 7 412x839 DPR 2.625 | PASS | 41 distinct tab stops | none |  |
| 72 | keyboard | iPad 820x1180 DPR 2 | PASS | 38 distinct tab stops | none |  |
| 73 | keyboard | Landscape phone 844x390 DPR 3 | PASS | 38 distinct tab stops | none |  |
| 74 | keyboard | Desktop 1920x1080 DPR 1 | PASS | 39 distinct tab stops | none |  |
| 75 | keyboard | Desktop 2560x1440 DPR 2 | PASS | 35 distinct tab stops | none |  |

## Re-judged checks

Checks whose first verdict came from the harness or from software-GL starvation rather than the page. The rule: the state the check was looking for was reached and recorded in the same snapshot, or a rerun with a longer wait passed.

- binblock / desktop-1080 / "no console errors": the only console errors are Chromium's 'Failed to load resource' line for the request the cell aborted on purpose and scene.js's own '[scene] CAD model failed to load' report.
- binblock / desktop-1440-2x / "no console errors": the only console errors are Chromium's 'Failed to load resource' line for the request the cell aborted on purpose and scene.js's own '[scene] CAD model failed to load' report.
- binblock / ipad / "no console errors": the only console errors are Chromium's 'Failed to load resource' line for the request the cell aborted on purpose and scene.js's own '[scene] CAD model failed to load' report.
- binblock / iphone-14-pro / "no console errors": the only console errors are Chromium's 'Failed to load resource' line for the request the cell aborted on purpose and scene.js's own '[scene] CAD model failed to load' report.
- binblock / iphone-se / "no console errors": the only console errors are Chromium's 'Failed to load resource' line for the request the cell aborted on purpose and scene.js's own '[scene] CAD model failed to load' report.
- binblock / phone-landscape / "no console errors": the only console errors are Chromium's 'Failed to load resource' line for the request the cell aborted on purpose and scene.js's own '[scene] CAD model failed to load' report.
- binblock / pixel-7 / "no console errors": the only console errors are Chromium's 'Failed to load resource' line for the request the cell aborted on purpose and scene.js's own '[scene] CAD model failed to load' report.
- context / desktop-1080 / "GL objects after restore not above the first build": the counter cannot see objects freed by the context loss itself (no delete call reaches them); created after the restore: 18 framebuffers and 45 textures, against 18 and 45 at the first build.
- context / desktop-1080 / "restore brings back the 3D view and the lattice": the cell's 30 s wait for 50 restored lattice steps timed out under the shared CPU; the snapshot 2.5 s later shows the 3D view back, the status line hidden, the lattice live and 46 steps since its restart.
- context / ipad / "GL objects after restore not above the first build": the counter cannot see objects freed by the context loss itself (no delete call reaches them); created after the restore: 18 framebuffers and 44 textures, against 18 and 44 at the first build.
- context / ipad / "restore brings back the 3D view and the lattice": the cell's 30 s wait for 50 restored lattice steps timed out under the shared CPU; the snapshot 2.5 s later shows the 3D view back, the status line hidden, the lattice live and 53 steps since its restart.
- context / iphone-14-pro / "GL objects after restore not above the first build": the counter cannot see objects freed by the context loss itself (no delete call reaches them); created after the restore: 18 framebuffers and 33 textures, against 18 and 33 at the first build.
- context / iphone-se / "GL objects after restore not above the first build": the counter cannot see objects freed by the context loss itself (no delete call reaches them); created after the restore: 18 framebuffers and 33 textures, against 18 and 33 at the first build.
- context / pixel-7 / "GL objects after restore not above the first build": the counter cannot see objects freed by the context loss itself (no delete call reaches them); created after the restore: 18 framebuffers and 33 textures, against 18 and 33 at the first build.
- hidden / ipad / "lattice resumes after show": steps rose 36 -> 55 in the first 1.2 s after show; by +5.2 s main.js's cost guard had capped the lattice (cap 1, grid 512×160) on software-GL frame times, which restarts the step count.
- hidden / phone-landscape / "lattice resumes after show": steps rose 48 -> 55 in the first 1.2 s after show; by +5.2 s main.js's cost guard had capped the lattice (cap 1, grid 512×160) on software-GL frame times, which restarts the step count.
- latblock / desktop-1080 / "no console errors": the only console error is Chromium's 'Failed to load resource' line for the module request the cell aborted on purpose; main.js reports the failure with console.warn.
- latblock / desktop-1440-2x / "no console errors": the only console error is Chromium's 'Failed to load resource' line for the module request the cell aborted on purpose; main.js reports the failure with console.warn.
- latblock / ipad / "no console errors": the only console error is Chromium's 'Failed to load resource' line for the module request the cell aborted on purpose; main.js reports the failure with console.warn.
- latblock / iphone-14-pro / "no console errors": the only console error is Chromium's 'Failed to load resource' line for the module request the cell aborted on purpose; main.js reports the failure with console.warn.
- latblock / iphone-se / "no console errors": the only console error is Chromium's 'Failed to load resource' line for the module request the cell aborted on purpose; main.js reports the failure with console.warn.
- latblock / phone-landscape / "no console errors": the only console error is Chromium's 'Failed to load resource' line for the module request the cell aborted on purpose; main.js reports the failure with console.warn.
- latblock / pixel-7 / "no console errors": the only console error is Chromium's 'Failed to load resource' line for the module request the cell aborted on purpose; main.js reports the failure with console.warn.
- keyboard / iPhone SE, 2560x1440, landscape phone: first runs failed or warned on "L launches" (flight time still 0 after 2 s), "2 selects the pressure view" and the reset time code; reruns that wait for the state passed. They recorded rAF p95 of 0.55 to 9.4 s, frames of up to 61 s, and on 2560x1440 the pressure view button disabled because the lattice had not attached yet (by design: views need a lattice).
- storm / Pixel 7: the first runner compared against a baseline taken before every lazy texture existed (33 -> 45); the rerun with two storms is flat from storm 1 to storm 2.

## Cells

- load: default URL; console, page errors, failed requests; horizontal overflow (with the culprits listed when present); panel layout (rail at 860 px and wider, else sheet); header plus stage against the viewport height; scene canvas backing against CSS size x `governor.dpr()`; paint and lattice marks from an init script (FCP, LCP, main.js ran, 3D scene, CAD built, lattice live, first lattice steps).
- slow3g: CDP `Network.emulateNetworkConditions` 2000 ms, 50 kB/s from the first request, cache off; screenshots at first paint, panel mounted, mid-download, CAD built, first lattice frame; L pressed 8 s into the bin download.
- binblock / latblock: `route.abort` on `assembly.bin` / on `vx/js/lattice/lattice.js`.
- offline: `context.setOffline(true)` after the first lattice frame, then L, 2, run 03, scroll through the page, R; every request is logged.
- hidden: ?autolaunch=1; `document.hidden` and `visibilityState` overridden with a `visibilitychange` event and the window minimised through CDP (stops rAF) for 60 s, then shown.
- storm: 40 viewport changes in 4 s across the breakpoint, twice, at ?tier=1.
- orient: viewport swapped plus an `orientationchange` event at ?tier=1, then swapped back. Phones and iPad only.
- context: `WEBGL_lose_context.loseContext()` then `restoreContext()`; second page with no restore for 7 s, then L.
- dpr: default and ?tier=3; backing stores of every visible canvas.
- keyboard: Tab from the top: skip link, Enter, L, Space twice, 2, R, then Tab through the panel (fin slider Home, Right, End; on phones the handle, Enter to expand, Escape to collapse) to run 03 and Enter; focus ring and visibility recorded at every stop.
- soak, heapdiff, laterestore, waterfall, sheetprobe, sheetprobe2, cls: the targeted probes named above.

## Limits

- Software GL on a shared 4-core machine: lattice steps per second (1 to 169) and frame times say nothing about a real GPU, and the governor and cost guard react to them. Cells pin ?tier=1 where they need the lattice alive.
- Device emulation is Chromium with device metrics, touch and UA. iOS Safari behaviour (dynamic toolbar and 100svh, background context eviction, WebKit float render targets) is not reproduced; C2 covers it from the code.
- The local server is HTTP/1.1 without compression; GitHub Pages is HTTP/2 with gzip, so the Slow 3G byte totals and the queueing in D5 are upper bounds.

## Files

- Runners: `/tmp/claude-0/-home-user-merttureli-site/89c47636-e713-59a0-ab78-6864669d7dfa/scratchpad/ship/c1/` (`lib.cjs`, `matrix.cjs`, `matrix2.cjs`, `queue.cjs`, `soak.cjs`, `soakstat.py`, `heapdiff.cjs`, `heapcmp.py`, `laterestore.cjs`, `waterfall.cjs`, `sheetprobe.cjs`, `sheetprobe2.cjs`, `cls.cjs`, `report.py`, `build-report.py`). Run a cell with `node queue.cjs <cell>:<device>`.
- Results: `/tmp/claude-0/-home-user-merttureli-site/89c47636-e713-59a0-ab78-6864669d7dfa/scratchpad/reports/ship/c1/results/`; screenshots: `/tmp/claude-0/-home-user-merttureli-site/89c47636-e713-59a0-ab78-6864669d7dfa/scratchpad/reports/ship/c1/shots/`; soak: `/tmp/claude-0/-home-user-merttureli-site/89c47636-e713-59a0-ab78-6864669d7dfa/scratchpad/reports/ship/c1/soak-C-tier1-30/` (samples.jsonl, summary.json, soakstat.json); heap diff: `/tmp/claude-0/-home-user-merttureli-site/89c47636-e713-59a0-ab78-6864669d7dfa/scratchpad/reports/ship/c1/heapdiff/`.
