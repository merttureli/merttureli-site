# Content: where project facts live

Case study pages are built from data. The words and numbers are in `content/projects/<slug>.json`;
the presentation (page name, tile line, hero clip, order) is in `PRESENT` and `ORDER` at the top of
`tools/build-studio-cases.py`. Every other place that names a project (the home tiles, the showreel,
the sitemap, the design studies) is hand-written HTML.

## Quick answers

| I want to | Edit | Then run |
|---|---|---|
| Change a case lede, brief row, stat, paragraph, image, caption | `content/projects/<slug>.json` | `python3 tools/build.py` |
| Change a case page's big name, meta line, hero clip or still | `PRESENT["<slug>"]` in `tools/build-studio-cases.py` | `python3 tools/build.py` |
| Reorder the case studies (the "Next project" loop) | `ORDER` in `tools/build-studio-cases.py` | `python3 tools/build.py` |
| Change the case page layout or markup (all cases) | `page()` and the helpers in `tools/build-studio-cases.py` | `python3 tools/build.py` |
| Change a case page's `<title>`, description or share card | `seo_title` / `title`, `description`, `og_alt` in the JSON ([meta.md](meta.md)) | `python3 tools/build.py` |
| Add a new case study | `python3 tools/new.py project <slug> --title "Title"` | see [add-project.md](add-project.md) |
| Change a project's tile on the home page | `next/index.html`, its `<li class="tile">` in `<ul class="bento">` | `python3 tools/build.py` |
| Find every place a project is named | `python3 tools/new.py project <slug> --where` | |
| Prove nothing else changed | | `python3 tools/build.py --check`, then `git diff --stat` lists the JSON and its two generated pages (`next/projects/<slug>.html`, `projects/<slug>.html`) |

Never edit `projects/*.html`, `next/projects/*.html`, `index.html` or `websites.html`: they are generated.

## What the owner's words mean

The owner names things by what they see. The case page and the home tile are separate copy:
changing one never changes the other. Ask which one when the request does not say; if it says
"everywhere", change both.

| The owner says | Case page (`projects/<slug>.html`) | Home tile (`next/index.html`, `<li class="tile tile--...">`) |
|---|---|---|
| title, name | `PRESENT[slug]["name"]` (the giant h1, the local nav, the "Next project" card) | `.tile__name` |
| page title in the browser tab | `seo_title`, else `title`, plus " · Mert Tureli" (`tools/build.py`) | home: `LIVE` in `tools/build.py` |
| summary, tagline, intro | `lede` (under the h1); the one-liner on the previous case's "Next project" card is `PRESENT[slug]["line"]` | `.tile__line` |
| search or share blurb, description | `description` (meta and `og:description`, never visible) | home: the `<meta name="description">` in `next/index.html` |
| label above the title, eyebrow | `eyebrow`; the meta line on the "How it works" rule is `PRESENT[slug]["meta"]` | the `.label` in `.tile__text` (`01 / Airframe + payload / 2026`) |
| numbers, metrics, results, stats | the `"kind": "stats"` section (Highlights strip and Key figures) and `brief` rows (facts under the hero, spec sheet) | `.tile__stat` (one figure) |
| hero image, hero video | `PRESENT[slug]["hero"]`: a turntable `clip` from `assets/motion/` or a `still` | the tile's `<img>` or hover `<video>` in `.tile__media` |
| card image, thumbnail | `PRESENT[slug]["img"]` (spec sheet and the "Next project" card) | the tile's `.tile__media` |
| photos, gallery, frames | `frames` in a text section; full-width photo: `"kind": "bleed"`; video band: `"kind": "clip_band"` | none |
| caption | `caption` on a frame, band or bleed; hero: `PRESENT[slug]["hero"]["cap"]` | none |
| share image, link preview picture | `assets/og/case-<slug>-v1.png` (see [images-swap.md](images-swap.md) route D) | home: `LIVE["index.html"]["image"]` in `tools/build.py` |
| order | `ORDER` in `tools/build-studio-cases.py` | the order of the `<li class="tile">`s and the `NN /` in each label |

## How the build reads content

```
content/projects/<slug>.json + PRESENT/ORDER in tools/build-studio-cases.py
        |  tools/build-studio-cases.py (run by tools/build.py)
        v
next/projects/<slug>.html        Studio copy, noindex (generated)
        |  tools/build.py (rebase URLs to the root, live head)
        v
projects/<slug>.html             the live page (generated)
```

- `python3 tools/build.py --check` diffs every generated page without writing.
- `content/projects.json` (`"order"`) is only read by `tools/new.py project`; the page order is `ORDER`.

## Case fields (`content/projects/<slug>.json`)

| Field | What it renders on the Studio case page |
|---|---|
| `title`, `seo_title` | the live `<title>` and `og:title` (`seo_title` wins) |
| `nav_title` | the short name `tools/new.py project --where` searches for |
| `eyebrow` | the small label above the giant name |
| `description` | `<meta name="description">` and `og:description` (plain text) |
| `og_alt` | `og:image:alt`; the image is always `assets/og/case-<slug>-v1.png` |
| `lede` | the paragraph under the name (HTML allowed) |
| `clip`, `clip_ratio`, `clip_sizes`, `clip_aria` | the case's own clip: its label on the hero when it is the hero clip, or a feature clip where `PRESENT[slug]["attach"]` asks for it |
| `brief` | `{"label", "value"}` rows: the facts under the hero and the first spec sheet rows |
| `brief_note` | paragraphs under the facts |
| `sections` | the body, in order (next table) |
| `colophon` | the line under the spec sheet |

Still in the JSON from the old pages, ignored by the Studio build: `clip_note`, `clip_opaque`,
`hero_image`, `hero_caption`, `walkthrough`, `brief_label`, and the section keys `ratio`, `cols`,
`min_col`. Keys that start with `_` are comments.

## Sections

| Field | What it does |
|---|---|
| `kind` | absent (text), `"stats"` (Highlights strip and Key figures), `"bleed"` (full-width photo) or `"clip_band"` (framed video) |
| `label` | the feature card heading; a section whose label equals `PRESENT[slug]["specs_list"]` also feeds the spec sheet's Details |
| `anchor`, `track` | headings for unlabeled sections (`project-result` is "The result") |
| `paras` | paragraphs (HTML allowed) |
| `cards` | chips under the paragraphs |
| `list` | a ruled list (numbered when the label equals `PRESENT[slug]["rank"]`) |
| `frames` | images beside the text: `{"src": "assets/...", "alt", "caption"}` |
| `strong` | `true`: a statement block instead of a card |
| `dark`, `flip` | dark card; media on the left |
| `stats` | `[{"value": "1st", "label": "..."}]` |
| `src`, `alt`, `caption` | bleed photo |
| `base`, `caption` | clip band: `assets/motion/<base>-1280.webm`, `-960.webm`, `-poster.webp` |

Open questions in copy are `<mark class="flag" data-flag="<id>" data-note="...">text</mark>` written
inside the HTML string ([flags.md](flags.md)); `title`, `eyebrow`, `description` and `og_alt` are plain text.

## Every other place a project appears

`python3 tools/new.py project <slug> --where` prints the live list. The usual places:

| Surface | File | How to edit |
|---|---|---|
| Home tile | `next/index.html`, `<ul class="bento">` | edit, `python3 tools/build.py` |
| Hero drift words | `next/index.html`, `.drift` slots | edit the `<i>` words, build |
| Showreel actors | `next/js/showreel/` | [showreel-actor.md](showreel-actor.md) |
| Sitemap | `sitemap.xml` | `tools/new.py project` adds the line; bump `lastmod` by hand |
| 404 | `404.html` | edit (old design, [../transition.md](../transition.md)) |
| Design studies | `studies/{hangar,launch,studio,specimen}/` | only when asked; they are shown framed on the websites page |

The home tiles are separate copy, not a duplicate of the case page, so they stay hand-written.
When a fact changes (a result, a cost, a date), run `--where` and update each hit.
