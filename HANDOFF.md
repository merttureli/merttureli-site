# HANDOFF - Batch 6: sharing and search metadata

Branch: `opt/b6-meta`. Findings: seo-4, qa-v1, seo-7, seo-8, seo-9, seo-11, qa-15.
Not pushed. `index.html` and `build-case.py` are untouched; their snippets are below.

## What changed

New files
- `assets/og/` (all 1200x630 PNG, Space Grotesk + IBM Plex Mono from `assets/charger-explorer/fonts/`, versioned `-v1`):
  - `cover-v1.png` - site cover. Ground #0A0A0A, `MERT / TURELI` with a regular U, `MECHANICAL ENGINEER / AUSTIN, TEXAS` (set in the site's mono caps, like the hero eyebrow), the CHARGER render from `charger-painted-wide-poster.png`.
  - `case-robo-catcher-v1.png`, `case-charger-v1.png`, `case-bend-fixture-v1.png`, `case-rudder-pedals-v1.png`, `case-therma-shift-v1.png` - each uses the hero clip poster that `build-case.py` references (`robo-catcher-360`, `charger-square`, `bend-fixture-blurred`, `rudder-pedals-working`, `therma-shift-airflow`). The therma-shift poster has baked-in caption text, so it is cropped to the object. The bend fixture keeps its existing blurred hero (no new detail added). The CHARGER card is titled `CHARGER` with `Deployable sensor payload` beneath.
  - `websites-v1.png` - headline from the page plus a browser mock with the CHARGER render, as on websites.html.
  - `hi-v1.png` - matches the hi/ page (green ground, solid MERT, outlined TURELI).
  - The old `assets/og-cover.png` ('TURELI', white serif) is still in place; delete it once index.html uses `cover-v1.png`.
- `assets/icons/`: `favicon.svg` (Space Grotesk 700 'MT' outlined to paths with fontTools, same 64 box and rx 12 as the old data-URI), `favicon.ico` (32 and 16 PNG entries), `apple-touch-icon.png` (180, opaque square, no rounded corners so iOS can mask it), `icon-512.png` (512, rounded like the SVG).

Edited
- `websites.html` head: data-URI favicon replaced by the 3 icon links; added og:site_name, og:image (+width/height/alt), twitter:card.
- `404.html` head: icon links (it already has noindex).
- `hi/index.html` head: `noindex` (card landing page, decision made as instructed), icon links, og:title/description/type/url/site_name/image(+w/h/alt), twitter:card. Title separator changed from `|` to `·` (`Mert Tureli · Contact`) per seo-11.
- `hi/mert-tureli.vcf`: CRLF line endings, LinkedIn moved out of NOTE into `item1.URL` + `item1.X-ABLabel:LinkedIn` and `X-SOCIALPROFILE;TYPE=linkedin`; NOTE removed. No employer or ORG added.
- `robots.txt`, `sitemap.xml` (lastmod 2026-10-21 on all 7 URLs; hi/ is not added since it is noindex).

## Deviations from the brief, and why
1. `/_ds/` is NOT disallowed wholesale. Every page renders from `/_ds/.../_ds_bundle.js` and its token CSS, and seo-9 says not to block it while anything renders client-side. Blocking it would let Googlebot fetch pages it cannot style or run. robots.txt instead disallows only `/_ds/*.md$` and `/_ds/*.json$` (readme, manifest, lint config). If you want the full block after the static pre-render lands, it is a one-line change.
2. `photography-gallery.html` has no noindex meta. It is a bare fragment (no html/head) that `js/photography-loader.js` fetches and injects with `innerHTML` into a shadow root on the homepage. A `<meta name="robots" content="noindex">` in it would be injected into the homepage DOM, and a JS-rendered noindex can de-index the homepage. I disallowed `/photography-gallery.html` in robots.txt instead (nothing links to it). Side effect: Googlebot's render of the homepage will not show the gallery corridor (decorative, image-only). Rename the file or serve it as .txt/.json if you would rather not block it.
3. `/tools/` does not exist in the repo; the Disallow is harmless and future-proof.

## Verification
- Every OG image and icon viewed at full size. Contact sheet and icon sheet (SVG, PNG, ICO at 256/32/16 side by side) under `/tmp/claude-0/-home-user-merttureli-site/fe356c8b-023d-52dd-b7f6-84e925c9294d/scratchpad/opt/b6/` (`icons.png`, `ws-*`/`hi-*`/`home-*` before shots, `after-ws-*`, `after-hi-*`, `after-404-*` at 1440 and 390).
- Playwright (analytics/form hosts blocked), port 8947: websites.html, hi/, 404.html load at 1440 and 390 with no failed requests; the icon links and og/twitter/robots tags resolve as expected; all og and icon files return 200.
- vCard checked with `vobject` (parses and validates as 3.0), CRLF on every line including the last (`cat -A` shows `^M$`), max line 68 chars.
- sitemap.xml parses as XML. `check-writing.py` clean on hi/index.html, websites.html and the proposed strings.
- Generator scripts (Pillow/fontTools) are in the scratchpad: `opt/b6/make_og.py <worktree>` and `opt/b6/make_icons.py <worktree>` (fontTools installed to `scratchpad/pylib`). They are not in the repo because the batch scope was limited to assets/og and assets/icons.

## Snippets to apply: index.html

Replace the data-URI `<link rel="icon" ...>` (line 9) and the og block (lines 12-16) with:

```html
<link rel="icon" href="/assets/icons/favicon.ico" sizes="32x32">
<link rel="icon" href="/assets/icons/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/assets/icons/apple-touch-icon.png">
<link rel="canonical" href="https://merttureli.com/">
<meta property="og:title" content="Mert Tureli · Mechanical Engineer">
<meta property="og:description" content="Design, build, test: hardware end to end. CAD, electronics, firmware, and the test rigs that prove it works.">
<meta property="og:type" content="website">
<meta property="og:url" content="https://merttureli.com/">
<meta property="og:site_name" content="Mert Tureli">
<meta property="og:image" content="https://merttureli.com/assets/og/cover-v1.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Mert Tureli, mechanical engineer in Austin, Texas, beside a render of the CHARGER rocket.">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"ProfilePage","mainEntity":{"@type":"Person","name":"Mert Tureli","alternateName":"Mert Türeli","jobTitle":"Mechanical Engineer","url":"https://merttureli.com/","address":{"@type":"PostalAddress","addressLocality":"Austin","addressRegion":"TX","addressCountry":"US"},"alumniOf":{"@type":"CollegeOrUniversity","name":"Union College"},"sameAs":["https://www.linkedin.com/in/merttureli"]}}
</script>
```

No employer, no `worksFor`, no image property (add the portrait later if wanted). The JSON parses (checked with `json.loads`). The `<title>` and meta description (164 chars) stay as is; see the proposed 159-char description below.

## Snippets to apply: build-case.py

1. Delete the `FAVICON = (...)` constant (lines 29-32). Nothing else uses it.

2. In `build()`, replace the head portion of the `html = (...)` template and its argument tuple:

Before:
```python
        '<title>%s · Mert Tureli</title>\n'
        '<meta name="description" content="%s">\n'
        '<link rel="icon" href="%s">\n'
        '<link rel="canonical" href="https://merttureli.com/projects/%s.html">\n'
        '<meta property="og:title" content="%s · Mert Tureli">\n'
        '<meta property="og:description" content="%s">\n'
        '<meta property="og:type" content="article">\n'
        '<meta property="og:url" content="https://merttureli.com/projects/%s.html">\n'
        '<meta property="og:image" content="https://merttureli.com/assets/og-cover.png">\n'
...
        % (case["title"], case["description"], FAVICON, case["slug"], case["title"],
           case["description"], case["slug"], helmet_block(index), ...
```
After:
```python
        '<title>%s · Mert Tureli</title>\n'
        '<meta name="description" content="%s">\n'
        '<link rel="icon" href="/assets/icons/favicon.ico" sizes="32x32">\n'
        '<link rel="icon" href="/assets/icons/favicon.svg" type="image/svg+xml">\n'
        '<link rel="apple-touch-icon" href="/assets/icons/apple-touch-icon.png">\n'
        '<link rel="canonical" href="https://merttureli.com/projects/%s.html">\n'
        '<meta property="og:title" content="%s · Mert Tureli">\n'
        '<meta property="og:description" content="%s">\n'
        '<meta property="og:type" content="article">\n'
        '<meta property="og:url" content="https://merttureli.com/projects/%s.html">\n'
        '<meta property="og:site_name" content="Mert Tureli">\n'
        '<meta property="og:image" content="https://merttureli.com/assets/og/case-%s-v1.png">\n'
        '<meta property="og:image:width" content="1200">\n'
        '<meta property="og:image:height" content="630">\n'
        '<meta property="og:image:alt" content="%s">\n'
        '<meta name="twitter:card" content="summary_large_image">\n'
...
        % (page_title, case["description"], case["slug"], page_title,
           case["description"], case["slug"], case["slug"], escape(case["og_alt"], quote=True),
           helmet_block(index), ...
```
with, near the top of `build()`:
```python
    from html import escape
    page_title = case.get("seo_title", case["title"])
```
(`escape` is already imported locally further down in `build()`; keep one import.) Add `"og_alt"` to each case dict:

| slug | og_alt |
|---|---|
| robo-catcher | Render of the Robo-Catcher softball catch and return machine. |
| charger | Render of the CHARGER rocket. |
| bend-fixture | Blurred render of the three-point bend fixture. |
| rudder-pedals | Render of the flight sim rudder pedal mechanism. |
| therma-shift | Airflow illustration of the Therma-Shift coaster heat sink. |

3. Also write the sitemap from `build-case.py` with real `lastmod` (seo-9): same 7 URLs as `sitemap.xml` now; `hi/` stays out (noindex). And `../index.html#x` to `../#x` in the 8 places (seo-9) is still open for you.

## Proposed title and description strings (copy is on hold: proposals only)

Charger `<title>`: add `"seo_title": "CHARGER · Deployable sensor payload"` so the page title becomes `CHARGER · Deployable sensor payload · Mert Tureli` (49 chars). The on-page `title` (h1 and card) stays `Deployable sensor payload`. Other cases keep their titles (all already use ` · ` before the site name).

Descriptions (all <=160, US spelling, no dashes, facts only from the existing descriptions; `check-writing.py` clean). Current length in brackets:

| slug | proposed | chars |
|---|---|---|
| home (index.html) | Mechanical engineer in Austin, TX. I design, build, and test hardware end to end: CAD and drawings, electronics and firmware, and the rigs that prove it works. | 159 [164] |
| robo-catcher | A softball machine that catches an incoming throw and returns it, built by a 12 person capstone team for under $700. I owned the electronics and firmware. | 154 [194] |
| charger | CHARGER won the Deployable Sensor Payload event at Battle of the Rockets 2026, with custom payload electronics and five live telemetry channels. | 144 [204] |
| bend-fixture | A 3D printable 12 part three-point bend fixture, designed in SolidWorks 2025 for specimens too delicate for commercial fixtures, with rebuilds automated in VBA. | 160 [173] |
| rudder-pedals | Three-axis flight sim rudder pedals with fighter style geometry, Hall effect sensing and C++ USB HID firmware. Designed, printed, wired and programmed solo. | 156 [168] |
| therma-shift | A dual mode thermoelectric coaster that heats or cools any mug or glass. Bench validated to 11 C on the cold face at 12 V, with thermal runaway protection. | 155 [177] |

Dropped to fit: the "team that did not exist three years earlier" clause (charger), "I co-led the feeding subsystem" (robo-catcher), "contactless" (rudder-pedals), "Peltier stack" and "layered" (therma-shift), "fully" (bend-fixture). Pick different cuts if any of those matter. The on-page `lede` and body copy are not touched.

## Left for you or for the owner
- Root `/favicon.ico`: browsers and crawlers request it by default, and it 404s. I was limited to `assets/`, so copy `assets/icons/favicon.ico` to the repo root (the `<link>` tags already cover browsers).
- Add `.gitattributes` with `*.vcf -text` so a Windows checkout or autocrlf does not turn the vCard's CRLF back into LF.
- `privacy.html` still has the Georgia data-URI favicon; `cards/*.html` has no noindex meta (robots.txt now disallows `/cards/`, which is enough to keep it out of crawls but the meta is the stronger signal); `photography-lab.html` and `assets/charger-explorer/index.html` titles still use `/` and `|` separators (seo-11 remainder). All outside this batch's file list.
- After deploy: re-scrape `/`, `/websites.html` and one case with LinkedIn Post Inspector, because platforms cache the old og-cover. Filenames are versioned (`-v1`), so bump to `-v2` for any later change.
- Optional: a web app manifest using `icon-512.png`. Not added (no manifest exists and it was not requested).
