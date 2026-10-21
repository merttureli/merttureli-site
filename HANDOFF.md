# HANDOFF: Batch 2d, CHARGER explorer polish

Branch: `opt/b2d-explorer`. Files touched: `assets/charger-explorer/{index.html,app.js,integration.js,launcher.css}` only.
Findings: motion-1, qa-12, code-10, motion-v1, perf-9, qa-8, seo-v1, visual-3 (hairline only), a11y-11c, copy-v1 (snippet).

## What changed

1. **No more `cache:'no-store'`** (qa-12, code-10, motion-v1). Both geometry fetches use `cache:'no-cache'`: the browser revalidates by ETag and gets a 304 when unchanged, so a model update still shows immediately and the json/bin pair stays consistent (the byte-count guard in app.js is kept). I did not add `?v=` URLs: they need a hash written by a build step, and 304 revalidation costs about 300 bytes each.
2. **Serial chain collapsed** (motion-1). `assets/charger-explorer/index.html` now has `modulepreload` for app.js, three.module.js, three.core.js, OrbitControls.js, part-stories.js, focus-motion.js, livery.js, and a tiny inline classic script that starts the two geometry fetches immediately (`window.__chargerGeometry`); app.js awaits those promises (with the old fetch as fallback). The iframe `src` is still set only on click, so nothing explorer-related is requested before the click (verified: 0 requests). I did not add hover or touchstart prefetch, to keep it zero-cost for the many visitors who never open it.
3. **Back button** (qa-8), `integration.js`. A UI open now does `pushState({chargerExplorer:true}, '', '#charger-explorer')` (before the body is pinned, so the entry under it keeps the real scroll position). Closing from the UI (button, Escape, backdrop, message from the iframe) calls `history.back()` only when that entry is current, so history ends up exactly as it started. Back while open closes the dialog; Forward reopens it. Deep links (`index.html#charger-explorer`) still open on load and close with `replaceState` (only strips the hash; there is no earlier entry to pop). `popstate` and `hashchange` share one idempotent handler, so the two never double-fire. Two races fixed on the way: cleanup now runs synchronously in `finishClose` (the async `close` event can arrive after a quick reopen and used to tear down the reopened dialog), and a reopen during the pending `history.back()` waits for it (1.5 s safety timeout). `?part=N` on the standalone page is untouched and still selects the part.
4. **Standalone page head** (seo-v1). Added `rel=canonical` to `https://merttureli.com/assets/charger-explorer/`, og:title/description/type/url/image (existing 1280x720 `assets/motion/charger-painted-wide-poster.png`, with width/height/alt) and `twitter:card=summary_large_image`. The same static canonical is served on `?embed=1&modal=1`, which therefore canonicalizes to the standalone page (I chose canonical rather than noindex so the two signals do not conflict).
5. **#stage a11y** (a11y-11c). `controls.listenToKeyEvents(stage)` in app.js, so the focusable stage now responds: arrows pan, Shift/Ctrl/Cmd + arrows rotate. The stage `aria-label` says so.
6. **Hairline** (visual-3). `border-bottom:0` on `.charger-launch` in `launcher.css` (computed border-bottom is now 0px at 1440 and 390). I did NOT move the "Explore this rocket" cue off the fins; that is a layout decision left for the owner or another batch.

## Not done, with reason

- **Minified three.js** (perf-9): skipped. three r186 ships no official `.min.js` (npm `build/` has only three.cjs, .core.js, .module.js, tsl, webgpu; the vendored files match npm 0.186.0 byte for byte). The only "minified" copies available here are other agents' locally Terser-built files, which are not an official build. If wanted later, terser on `three.module.js` and `three.core.js` (same filenames) saves about 223 KB gzipped; it needs no importmap change.
- Sitemap entry for the explorer (seo-9) is outside my files.
- Not touched: woff2 conversion of the TTFs (motion-1 item 3), hero cue position.

## Snippets for the orchestrator

### 1. index.html line 81, hero caption (copy-v1)
The explorer counter shows 28 (30 parts minus 2 reference-only envelopes); 9 of the 28 are exterior, so 19 are internal.

Before:
```
CHARGER / rendered from the flight model, thirty internal components at their true stations
```
After (matches the counter exactly, no internal/exterior claim to contradict):
```
CHARGER / rendered from the flight model, 28 components at their true stations
```
Alternative if "internal" should stay: `CHARGER / rendered from the flight model, 19 internal components at their true stations`.

### 2. build-case.py, 'Explore in 3D' link on the CHARGER case page (qa-8)
In `CASES["charger"]`, section `"The airframe"` (the `"paras"` list, currently two strings, ends with `"material."`), add a third paragraph. Links in `paras` are plain inline HTML (same pattern as the Union College link in `brief_note`), and generated pages live in `projects/`, so the path is `../assets/...`:

```python
            "transparent at that frequency, so the radio set the airframe "
            "material.",
            '<a href="../assets/charger-explorer/index.html" style="color: inherit; '
            'text-decoration: underline; text-underline-offset: 3px; '
            'text-decoration-color: var(--line-hairline)">Explore in 3D</a>'
            " to see all 28 components at their true stations.",
        ], "ratio": "3 / 4", ...
```
It is a plain link with no dialog wiring, and the explorer header already links back to `projects/charger.html`. Run `python3 check-writing.py projects/charger.html` after regenerating.

## Verification

Server: `opt/b2d/server.py` (ETag + 304 + `Cache-Control: max-age=600`, mimicking GitHub Pages) on port 8943, stopped when done. Playwright with Chromium/SwiftShader; third-party hosts blocked with `context.route` (and with `--host-resolver-rules` in the cache test, because Playwright request interception disables the HTTP cache). All in `/tmp/claude-0/-home-user-merttureli-site/fe356c8b-023d-52dd-b7f6-84e925c9294d/scratchpad/opt/b2d/`: `test-nav.js`, `test-race.js`, `test-cache.js`.

- Open and close at 1440 and 390: pass. Close button, Escape (focus on the close button and inside the iframe), backdrop path unchanged. Scroll position restored after close and after Back (300 -> 300 in `test-race.js`).
- History: websites -> index -> open -> history.length 3 -> 4; Back while open closes and stays on index.html; Forward reopens; after close, Back goes to websites.html (the entry before the page), not to an open dialog. Close then immediate reopen (with and without reduced motion) ends open with correct body state. Deep link opens on load and closes cleanly. Standalone `?part=18` selects "Motor mount".
- Before the click: 0 explorer requests (modules, geometry).
- Cache (standalone, reload): app.js, three.module.js, three.core.js, OrbitControls.js `transferSize` 0 B; assembly.json and assembly.bin 300 B each (304 revalidation) versus 2,483,232 B before. Modal after a warm cache shows the same.
- First-load chain: all modules and both geometry requests start within about 50 ms of the document (before: index -> app -> three.module -> three.core -> geometry).
- Arrow keys pan the stage and Shift+arrows rotate it (screenshots differ).
- Console: no errors or page errors at either width (aborted third-party requests excluded).
- Screenshots: `open-1440.png`, `open-390.png`, `home-1440-after.png` (no hairline under the rocket), `standalone-keys.png`.
- `python3 check-writing.py assets/charger-explorer/index.html`: clean.
