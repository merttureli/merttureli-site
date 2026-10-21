# HANDOFF: Batch 2c, media diet (branch opt/b2c-media)

Findings covered: perf-2, perf-3, perf-4, perf-8 (video side only, see "Not done"), perf-10, gap G5.
I edited only `assets/` (new files, no originals deleted) and `js/media-playback.js`. `index.html`, `build-case.py` and `websites.html` are untouched; their exact changes are below.

## 1. What changed

### New assets (all in `assets/motion/`)

WebP posters, alpha preserved (PIL, q82, method 6, alpha_quality 100). Width is capped at 2x the largest displayed width, counting object-fit:cover scaling, and never upscaled.

| Poster | Source bytes | WebP bytes | Size |
|---|---|---|---|
| charger-painted-wide-poster (hero, websites.html) | 349,513 | 15,438 | 1280x720 |
| robo-catcher-360-poster | 93,972 | 72,788 | 1280x720 (was 1920) |
| rudder-pedals-working-poster | 97,866 | 21,346 | 1280x720 (was 1920) |
| therma-shift-360-noflow-poster | 30,368 | 11,020 | 1280x720 (was 1920) |
| kaan-360-poster | 124,992 | 12,506 | 800x450 (was 1920) |
| hurjet-360-poster | 211,565 | 14,864 | 800x450 (was 1920) |
| charger-square-poster | 32,322 | 5,468 | 1080x1080 |
| therma-shift-airflow-poster | 504,941 | 64,556 | 1200x900 |
| hotbox-blurred-poster | 11,853 | 4,180 | 1000x562 |
| bend-fixture-blurred-poster | 10,738 | 4,900 | 1280x720 |
| rudder-pedals-mechanism-poster | 61,697 | 23,034 | 1920x1080 |
| balloon-segovia-poster | 263,251 | 167,466 | 1920x1080 |
| **Total** | **1,793,078** | **417,566** | -77% |

Fidelity: the WebP was compared with the same-size source composited on #0A0A0A, #1c2520, #202a34 and #302820. Mean abs diff is 0.04 to 0.26 of 255 for the cutouts (balloon photo 1.98, blurred jpgs about 0.7). The 99.9th percentile of the per-pixel difference is at most 17 of 255 for every poster (hero 17, the rest 13 or less). Alpha is semi-transparent only on edges, so the numbers barely change per background. Sheet: `.../opt/b2c-media/poster-compare.png` (original | webp | diff x10, on #0A0A0A and #302820). Metrics: `.../opt/b2c-media/poster-metrics-q82.json`.

Unreferenced posters (`charger-wide-poster.png`, `therma-shift-360-poster.png`) were not converted.

VP9 alpha turntable variants (libvpx-vp9, yuva420p, `-b:v 0`, `-auto-alt-ref 0`, lanczos scale, crf 38; robo crf 40). Alpha verified: `alpha_mode` is present, ffmpeg full-decode is clean, and in headless Chromium all variants composite over magenta with a clean cutout.

| Clip | Original | Desktop variant | Phone variant |
|---|---|---|---|
| robo-catcher-360 | 10,888,733 | `-1280-alpha` 6,162,338 (-43%) | `-960-alpha` 3,653,209 (-66%) |
| charger-wide (orphan) | 4,233,913 | 1,061,595 (-75%) | 562,091 (-87%) |
| rudder-pedals-working | 3,334,465 | 1,289,714 (-61%) | 884,832 (-73%) |
| therma-shift-360-noflow | 2,268,435 | 889,927 (-61%) | 615,473 (-73%) |
| therma-shift-360 (orphan) | 2,022,575 | 902,176 (-55%) | 612,571 (-70%) |
| hurjet-360 | 2,809,637 | 864,916 (-69%) | 605,805 (-78%) |
| kaan-360 | 1,911,662 | 657,380 (-66%) | 474,401 (-75%) |
| charger-square (1080 sq) | 1,605,971 | `-1080-alpha` 1,192,711 (-26%) | `-720-alpha` 474,612 (-70%) |
| therma-shift-airflow (1200x900, extra) | 5,474,563 | `-1200-alpha` 3,368,710 (-38%) | `-800-alpha` 1,997,512 (-64%) |
| rudder-pedals-mechanism (opaque, extra) | 886,845 | `-1280.webm` 441,328 (-50%) | `-960.webm` 332,987 (-62%) |

File names are `<clip>-1280-alpha.webm` and `<clip>-960-alpha.webm` (square: 1080 and 720, airflow: 1200 and 800, mechanism: `rudder-pedals-mechanism-1280.webm` and `-960.webm`, opaque so no `-alpha`). New video added: 27.0 MB across 20 files, posters 0.4 MB. Per page this is a large net saving (below), but the repo grows until the originals are removed (see "Housekeeping").

Why robo is only -43% at 1280: ffmpeg's own default decoder hides this, but about 60% of the robo stream is the alpha plane (the net mesh is a field of semi-transparent anti-aliased wires). Color alone is 2.46 MB at crf 40, the alpha plane the other 3.7 MB. The finding's -45% came from a 4 s cut. Tested: crf 34/36/38/40 give 9.4/8.2/7.1/6.2 MB. The 960 variant is what phones get (3.65 MB, -66%). If the owner wants the desktop robo clip smaller, the options are crf 44 or softening the alpha plane, both of which trade away mesh detail; I did not do either. Do check the robo contact sheet first.

Frame-comparison contact sheets for the owner (original vs 1280/960, same frames at t=3 s and t=8 s, cropped detail on fine areas such as the robo net mesh and actuator, charger lattice, jet gear, airflow label text), all composited on #202a34 at equal on-screen size, with bytes, mean abs diff, PSNR and alpha diff on each:

`/tmp/claude-0/-home-user-merttureli-site/fe356c8b-023d-52dd-b7f6-84e925c9294d/scratchpad/opt/b2c-media/contact/<clip>.png`

Clips: robo-catcher-360, charger-wide, rudder-pedals-working, therma-shift-360-noflow, therma-shift-360, hurjet-360, kaan-360, charger-square, therma-shift-airflow. Numbers for all of them are in `.../opt/b2c-media/video-metrics.json` (PSNR vs original is 36.7 to 48 dB for the 1280-class variants; the lowest is robo 960 at 36.7 and airflow 800 at 34.2).

Reproduction scripts (scratchpad, not committed): `.../opt/b2c-media/tools/` (`posters.py`, `enc.py`, `compare.py`, `g5.py`, `verify.py`).

### `js/media-playback.js`

- `data-poster` on a `<video>`: applied as `video.poster` by the existing 300px `loadObserver` (and in `refresh()` for videos already near). It is applied even when motion is blocked (reduced motion, hidden tab, open dialog), so reduced-motion visitors still see the poster. It does not wait for `load()`.
- Variant selection: on a `<source data-src=...>` you may also declare `data-src-md` and `data-src-sm`. At load time: phone (`max-width: 720px`) uses `data-src-sm` if declared, otherwise `data-src-md` if declared, otherwise `data-src`. Non-phone uses `data-src-md` if declared, otherwise `data-src`. No variant declared means the original, as before. The selection is made once, when the video loads. The `data-src*` attributes are removed after use.
- Header comment documents the markup contract.

Test (`.../opt/b2c-media/jstest.html`, `tools/jstest.js`, Chromium, 1440 and 390 and 1440 with reduced motion):
- 1440: robo gets the 1280 file, `hurjet` (md only) gets 1280, `kaan` (no variants) gets the original.
- 390: robo gets 960, `hurjet` falls back to md, `kaan` the original.
- A video 3000px below the fold has no poster and no source request until scrolled near, then gets poster and the correct variant.
- Reduced motion: posters load for near videos (including the far one after scrolling), no webm is requested, nothing plays.
- Screenshot: `.../opt/b2c-media/jstest-390-top.png` and `jstest-1440-top.png` (alpha clips playing over the page background).

## 2. Exact markup changes for the orchestrator

### index.html

**Head**, next to the other preloads or stylesheets (about line 18):

```html
<link rel="preload" as="image" href="assets/motion/charger-painted-wide-poster.webp" type="image/webp" fetchpriority="high">
```

**Hero, line 72.** Eager poster, now WebP; `preload="auto"` becomes `metadata` (perf-2). `fetchpriority` has no effect on a video poster attribute, which is why the preload link is the carrier.

```html
<!-- before -->
<video data-hero-clip="charger" poster="assets/motion/charger-painted-wide-poster.png" loop muted playsinline preload="auto" style="...">
<!-- after -->
<video data-hero-clip="charger" poster="assets/motion/charger-painted-wide-poster.webp" loop muted playsinline preload="metadata" style="...">
```

Line 73 (the hero webm) stays as it is: it is already 1280 wide and 484 KB. Line 74 is the opaque #0A0A0A mp4: per section 4 (G5) I recommend deleting that `<source>` line (posters-only); keep it only if the owner chooses otherwise.

**Hero swap code (about lines 594-598)** still points at the old PNGs and 1920 originals. Replace:

```js
// before
heroEl.poster = "assets/motion/" + slug + "-poster.png";
const src = heroEl.querySelectorAll("source");
if (src[0]) src[0].src = "assets/motion/" + slug + "-alpha.webm";
if (src[1]) src[1].src = "assets/motion/" + slug + ".mp4";
// after
const w = slug === "charger-painted-wide" ? "" : (matchMedia("(max-width: 720px)").matches ? "-960" : "-1280");
heroEl.poster = "assets/motion/" + slug + "-poster.webp";
const src = heroEl.querySelectorAll("source");
if (src[0]) src[0].src = "assets/motion/" + slug + w + "-alpha.webm";
if (src[1]) src[1].remove();   // drop the opaque mp4 fallback, see G5
```

Both swap targets (`therma-shift-360-noflow`, `robo-catcher-360`) have 1280 and 960 variants. If the mp4 `<source>` is kept per the G5 decision below, keep the `src[1]` line from before instead.

**Cards.** For each video, rename `poster=` to `data-poster=`, change the extension to `.webp`, and add `data-src-md` / `data-src-sm` to the webm `<source>` where variants exist. Everything else on the element is unchanged.

| Line | Change |
|---|---|
| 122 hotbox | `poster="assets/motion/hotbox-blurred-poster.jpg"` becomes `data-poster="assets/motion/hotbox-blurred-poster.webp"`. Sources unchanged (no variants). |
| 140-141 robo | `data-poster="assets/motion/robo-catcher-360-poster.webp"` and `<source data-src="assets/motion/robo-catcher-360-alpha.webm" data-src-md="assets/motion/robo-catcher-360-1280-alpha.webm" data-src-sm="assets/motion/robo-catcher-360-960-alpha.webm" type="video/webm">` |
| 186 bend fixture | `data-poster="assets/motion/bend-fixture-blurred-poster.webp"`. Sources unchanged. |
| 204-205 rudder | `data-poster="assets/motion/rudder-pedals-working-poster.webp"`, source gets `data-src-md="assets/motion/rudder-pedals-working-1280-alpha.webm" data-src-sm="assets/motion/rudder-pedals-working-960-alpha.webm"` |
| 230-231 therma | `data-poster="assets/motion/therma-shift-360-noflow-poster.webp"`, source gets `data-src-md="assets/motion/therma-shift-360-noflow-1280-alpha.webm" data-src-sm="assets/motion/therma-shift-360-noflow-960-alpha.webm"` |
| 291-292 kaan | `data-poster="assets/motion/kaan-360-poster.webp"`, source gets `data-src-md="assets/motion/kaan-360-1280-alpha.webm" data-src-sm="assets/motion/kaan-360-960-alpha.webm"` |
| 296-297 hurjet | `data-poster="assets/motion/hurjet-360-poster.webp"`, source gets `data-src-md="assets/motion/hurjet-360-1280-alpha.webm" data-src-sm="assets/motion/hurjet-360-960-alpha.webm"` |
| 406 balloon | `data-poster="assets/motion/balloon-segovia-poster.webp"`. Sources unchanged. |

Example (robo, lines 140-142):

```html
<video data-clip="1" data-poster="assets/motion/robo-catcher-360-poster.webp" loop muted playsinline preload="none" style="position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain">
  <source data-src="assets/motion/robo-catcher-360-alpha.webm" data-src-md="assets/motion/robo-catcher-360-1280-alpha.webm" data-src-sm="assets/motion/robo-catcher-360-960-alpha.webm" type="video/webm">
</video>
```

Static pre-render note: if the pre-render emits these videos into static HTML, the `data-poster` attribute is what keeps the 8 card posters from downloading at t=0 (a `poster=` on a `preload="none"` video still fetches immediately). Keep `data-poster`, not `poster`, for everything except the hero. Without JS the cards show no poster; they are decorative and sit below the fold, which I judged acceptable. If not, add `<noscript>` posters.

### websites.html (not in my file list, apply with the same batch)

Lines 47 and 66: `assets/motion/charger-painted-wide-poster.png` to `assets/motion/charger-painted-wide-poster.webp`. Optional, cosmetic: `width="1920" height="1080"` should be `width="1280" height="720"` (same ratio, matches the real file). Saves 334 KB on that page.

### build-case.py

Add near the top (helpers and a table of clips that have variants):

```python
MOTION_VARIANTS = {            # clip base -> (md width, sm width); files are <base>-<w>-alpha.webm
    "robo-catcher-360": (1280, 960),
    "rudder-pedals-working": (1280, 960),
    "charger-square": (1080, 720),
    "therma-shift-airflow": (1200, 800),
}
OPAQUE_CLIPS = {"bend-fixture-blurred"}   # baked white tile is intended, keep its mp4 (see G5)

def webm_source(base, alpha=True):
    suffix = "-alpha" if alpha else ""
    attrs = 'data-src="../assets/motion/%s%s.webm"' % (base, suffix)
    if base in MOTION_VARIANTS:
        md, sm = MOTION_VARIANTS[base]
        attrs += ' data-src-md="../assets/motion/%s-%d-alpha.webm" data-src-sm="../assets/motion/%s-%d-alpha.webm"' % (base, md, base, sm)
    return '<source %s type="video/webm">' % attrs
```

**Hero clip template (~line 295).** Above the fold, so the poster stays eager (WebP). Autoplay goes away and the source moves to `data-src`, so media-playback.js owns loading and playing (perf-3). `poster_ext` is no longer needed (all posters are `.webp`).

```python
# before
'          <video data-clip="1" poster="../assets/motion/%s-poster.%s" autoplay loop muted '
'playsinline preload="metadata" style="width: 100%%; height: 100%%; object-fit: contain; display: block">'
'<source src="../assets/motion/%s-alpha.webm" type="video/webm">'
'<source src="../assets/motion/%s.mp4" type="video/mp4"></video>\n        </div>'
% (case.get("clip_ratio", "4 / 3"), hero_clip, case.get("poster_ext", "png"), hero_clip, hero_clip))

# after
'          <video data-clip="1" poster="../assets/motion/%s-poster.webp" loop muted '
'playsinline preload="none" style="width: 100%%; height: 100%%; object-fit: contain; display: block">'
'%s%s</video>\n        </div>'
% (case.get("clip_ratio", "4 / 3"), hero_clip, webm_source(hero_clip),
   ('<source data-src="../assets/motion/%s.mp4" type="video/mp4">' % hero_clip) if hero_clip in OPAQUE_CLIPS else ""))
```

Optionally add to each project page head: `<link rel="preload" as="image" href="../assets/motion/<hero_clip>-poster.webp" type="image/webp" fetchpriority="high">`.

**Band template, `clip_band` (~line 223).** Below the fold (rudder-pedals mechanism, opaque). Poster becomes `data-poster`, no autoplay, `preload="none"`, `data-src` sources. This also fixes the 866 KB below-fold download that fired on page load (perf-3). The band's mp4 is an intended-look opaque scene, so it stays.

```python
# before
'        <video data-clip="1" poster="../assets/motion/%s-poster.jpg" autoplay loop muted '
'playsinline preload="metadata" style="position: absolute; inset: 0; width: 100%%; '
'height: 100%%; object-fit: cover; display: block">'
'<source src="../assets/motion/%s.webm" type="video/webm">'
'<source src="../assets/motion/%s.mp4" type="video/mp4"></video>\n'
# after
'        <video data-clip="1" data-poster="../assets/motion/%s-poster.webp" loop muted '
'playsinline preload="none" style="position: absolute; inset: 0; width: 100%%; '
'height: 100%%; object-fit: cover; display: block">'
'<source data-src="../assets/motion/%s.webm" data-src-md="../assets/motion/%s-1280.webm" data-src-sm="../assets/motion/%s-960.webm" type="video/webm">'
'<source data-src="../assets/motion/%s.mp4" type="video/mp4"></video>\n'
```

The format-args tuple gains two extra `base` entries (poster, webm, md, sm, mp4 = five uses of `base`). This band only exists for `rudder-pedals-mechanism`, which has the 1280 and 960 files. If another band base is ever added without variants, drop the `data-src-md` and `data-src-sm` attributes for it.

Regenerate `projects/*.html` after applying; do not hand edit them.

## 3. How verified

- Headless Chromium (Playwright, analytics hosts blocked), 390 and 1440, plus reduced motion at 1440: see the media-playback test results above. Evidence: `.../opt/b2c-media/jstest-390-top.png`, `jstest-1440-top.png`, `alphatest.png` (original 1920 vs the 1280 and 960 re-encodes over magenta, alpha intact).
- Displayed sizes that drove the poster caps were measured on index.html, five project pages and websites.html at 390 and 1440 (`tools/measure.js`).
- Every new webm: `ffmpeg -f null` full decode with no errors, duration and packet counts equal to the originals.
- I did not run `index.html` or the project pages against the new markup because I may not edit them. The snippets above are straight attribute substitutions that the harness exercises (same attribute names, same JS path).
- Server on port 8942 was started only for tests and has been stopped.

## 4. G5: the .mp4 fallbacks have baked backgrounds

Checked on the 1 s frame of every mp4 (border color, `.../opt/b2c-media/g5-mp4-backgrounds.png`). Browsers only use these if they skip the webm, so this is the Safari/iOS-without-WebM-alpha case.

| mp4 | Baked background | Where used as `<source>` | Verdict |
|---|---|---|---|
| charger-painted-wide.mp4 (hero) | flat #0A0A0A | index.html:74 | Matches only the default palette. On green/slate/warm it is a visibly darker box (off by 26/41/37 of 255). Mismatch. |
| robo-catcher-360.mp4 | grey-blue vignette, border (51,54,61) | projects/robo-catcher.html, hero swap | Mismatch on every palette including default (off by 50 from #0A0A0A, 19 from slate). |
| rudder-pedals-working.mp4 | same grey-blue vignette | projects/rudder-pedals.html | Mismatch. |
| charger-square.mp4 | grey-blue vignette (51,55,61) | projects/charger.html | Mismatch. |
| therma-shift-airflow.mp4 | flat #0A0A0A with baked label text | projects/therma-shift.html | Matches default only; mismatch on the other palettes. |
| therma-shift-360-noflow.mp4 | same grey-blue vignette | hero swap only | Mismatch. |
| kaan-360.mp4, hurjet-360.mp4 | dark blue-grey (37,39,45) | not referenced (index cards list webm only) | Would mismatch if added. |
| therma-shift-360.mp4, charger-wide.mp4 | grey-blue vignette | unreferenced orphans | n/a |
| bend-fixture-blurred.mp4, hotbox-blurred.mp4 | white (253,251,253) | index.html:122, :186, projects/bend-fixture.html | Intended: the blurred IP renders are white tiles by design, their posters are white too. Keep. |
| rudder-pedals-mechanism.mp4 | own lit scene, band framed with its own background | projects/rudder-pedals.html band | Intended, keep. |
| balloon-segovia.mp4 | photo | index.html:406 | Intended, keep. |

**Recommendation: posters-only.** For the alpha turntables, remove the opaque mp4 `<source>` (hero, project hero clips, hero swap code). A browser that cannot decode VP9 alpha WebM then has no playable source and keeps showing the WebP poster, which has alpha and sits correctly on every palette. That is a still instead of a coloured rectangle, and it is the only option that cannot clash with a palette. Keep the mp4 only where the baked look is the design (bend-fixture, hotbox, mechanism band, balloon). My snippets above already do this (`OPAQUE_CLIPS`, and `src[1].remove()` in the hero swap).

Why not HEVC with alpha: ffmpeg here (6.1.1) has `libx265` without any alpha pixel format, and no VideoToolbox, so HEVC-with-alpha (`hvc1`) cannot be produced on this machine; I did not attempt it. It would need macOS tooling (`avconvert` or `hevc_videotoolbox`), a second full set of files per clip (roughly the size of the webm set again), and a `<source type='video/mp4; codecs="hvc1"'>` listed first. Worth revisiting only if the owner checks a real iPhone or Mac and sees the poster-only look is a problem. I could not test Safari at all here (no WebKit), so that check is still open before launch, as perf-10 noted.

## 5. Not done / for the orchestrator

- **perf-8** (photos srcset, retina softness) is not in this batch's file scope (`_ds` bundle, photos): untouched.
- **Housekeeping (perf-10 orphans).** After the markup above is applied, these are safe to delete or move out of the published tree (I did not delete anything): `charger-wide.mp4`, `charger-wide-alpha.webm`, `charger-wide-poster.png`, `charger-wide-1280/960-alpha.webm`, `therma-shift-360*` (mp4, alpha webm, poster png, 1280/960 variants), `kaan-360.mp4`, `hurjet-360.mp4`, `therma-shift-360-noflow.mp4` and, once the PNG/JPG posters are replaced, the old `*-poster.png/.jpg` files. The `charger-wide` and `therma-shift-360` variants are 3.1 MB of encodes for clips nothing references; I made them because the brief listed them. Drop them if the originals are being removed. Check `assets/charger-explorer/` and `beyond/*` paths before removing anything from the old poster list (I grepped html/js/css/py outside `projects/` and found only index.html, build-case.py and websites.html referencing these files).
- Once the 1920 originals of the referenced clips are no longer needed as the fallback, they remain as the `data-src` default (used by any browser where `data-src-md` is missing). They could be dropped from the published tree only if every `<source>` declares `data-src-md`.
- Hero poster: `fetchpriority` cannot be put on a `<video poster>`, hence the preload link.
- Copy wording: nothing touched, nothing to list.
- Robo desktop variant is 6.2 MB; owner to judge the contact sheet and decide whether a smaller (softer) version is acceptable.
