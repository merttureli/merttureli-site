# Content: where project facts live

Case study pages are built from data in `content/`. Every other place that names a project (home card, Studio, sitemap, prototypes) is hand-written HTML. This page says which file to edit for each fact.

## Quick answers

| I want to | Edit | Then run |
|---|---|---|
| Change a case title, lede, brief row, stat, paragraph, image, caption | `content/projects/<slug>.json` | `python3 tools/build.py` |
| Reorder the case studies (Previous / Next chain) | `"order"` in `content/projects.json` | `python3 tools/build.py` |
| Rename a case on its neighbors' Previous / Next buttons | `"nav_title"` in `content/projects/<slug>.json` | `python3 tools/build.py` |
| Change the case page layout or markup (all cases) | the helpers in `build-case.py` | `python3 tools/build.py` |
| Add a new case study | `python3 tools/new.py project <slug> --title "Title"` | see [add-project.md](add-project.md) |
| Change the home page card for a project | `src/index.html` (table below) | `python3 tools/build.py` |
| Change the Studio work list or drift words | `next/index.html` (table below) | nothing to build |
| Find every place a project is named | `python3 tools/new.py project <slug> --where` | |
| Remove a case study | `python3 tools/new.py project <slug> --remove --dry-run` | see [add-project.md](add-project.md) |
| Prove nothing else changed | | `python3 tools/build.py --check`, then `git diff --stat` lists only the JSON and its two generated pages (`src/projects/<slug>.html`, `projects/<slug>.html`) |

Never edit `projects/*.html`, `src/projects/*.html` or the root `index.html`: they are generated.

## What the owner's words mean

The owner names things by what they see. Each row is the exact field or file, and every surface where that thing shows.
The three surfaces are separate copy: changing one never changes the others. Ask which one when the request does not say;
if it says "everywhere", change each surface listed.

| The owner says | Case page (`projects/<slug>.html`) | Home card (`src/index.html`, `<section id="work">`) | Studio card (`next/index.html`, `<li class="project">`) |
|---|---|---|---|
| title, name | `title` (h1, also `<title>`); short name on other cases' Previous / Next: `nav_title` | `DisplayHeading` in the project's `<article>` | `.project__title` and `data-name` (the big ghost word) on the `<li>` |
| summary, one-line summary, tagline, intro | `lede` (the paragraph under the title) | the `<p>` in the `<article>` (Robo-Catcher has two: summary, then result) | `.project__body` |
| search or share blurb, description | `description` (meta and `og:description`, never visible on the page) | (home page has its own `<meta name="description">` in `src/index.html` head) | none |
| label above the title, eyebrow, role line | `eyebrow` | the two `Meta` lines (discipline, then year / team) | `.label` above `.project__title` (`02 / Mechanism + firmware / Senior capstone, 2025`) |
| numbers, metrics, results, stats | `stats` section (`"kind": "stats"`) and `brief` rows | inside the card's `<p>` text; CHARGER: `chargerSpecs` rows | `<dl class="specs">` (three rows) |
| hero image, hero video, top image | `clip` (video set in `assets/motion/`) or `hero_image` (still); all five cases use `clip` today | the `<video>` in the card (`data-poster` is its still) | none (the Studio hero is the 3D showreel) |
| card image, thumbnail, cover image | none (the case page has no card) | the card's `<video>` and its `data-poster` still; Robo-Catcher also has two `MediaFrame` photos under it | `.project__media` `<img>` in the `<li>` AND the stage `<img data-key="...">` near the top of the work list (same file twice: change both) |
| photos, gallery, frames | `frames` in a text section; full-width image: `"kind": "bleed"` | the `MediaFrame` photos (Robo-Catcher only) | none |
| caption | `caption` on a frame, `hero_caption` | `caption` on a `MediaFrame`, `Caption` under the video | `data-tag` on the `<li>` (stage caption) |
| share image, link preview picture | `assets/og/case-<slug>-v1.png` (see [images-swap.md](images-swap.md) route D) | `cover` share image in `src/index.html` head | none |
| order | `"order"` in `content/projects.json` (Previous / Next chain) | order of the `<article>`s and each `Meta index="0N"` | order of the `<li>`s and the `NN /` in each `.label` |
| link, button | `walkthrough`; links inside rich text | the `Button` `href` at the end of the `<article>` | `.project__links` |

Studio card image rule: the stage `<img data-key="robo">` must keep the same `data-key` as the `<li data-project="robo">`.

## How the build reads content

```
content/projects.json            {"order": ["robo-catcher", "charger", ...]}
content/projects/<slug>.json     one case; the file name is the slug and the URL
        |  build-case.py (load_cases, then build)
        v
src/projects/<slug>.html         runtime template (generated)
        |  tools/build.py (headless prerender)
        v
projects/<slug>.html             the served page (generated)
```

- `python3 build-case.py --check` diffs the templates only (fast, no browser). `python3 tools/build.py --check` diffs everything.
- Previous / Next come from `"order"`: the first case has no Previous button, the last case's Next loops back to the first.
- A content error (bad JSON, unknown or missing field, a file not listed in `"order"`) stops the build with exit 2 and names the file and field. A missing asset or a leftover `TBD` in a plain text field prints a warning.
- `python3 tools/new.py project --format` rewrites `content/*.json` in the house layout (2-space indent, short objects on one line). The data does not change.

## Case fields (`content/projects/<slug>.json`)

| Field | Required | Type | What it renders |
|---|---|---|---|
| `nav_title` | yes | text | the name on other cases' Previous / Next buttons ("CHARGER", "The bend fixture") |
| `title` | yes | text | the h1; also `<title>` and `og:title` unless `seo_title` is set. A word of 10+ letters drops it one display size |
| `seo_title` | no | text | `<title>` and `og:title` when they should differ from the h1 |
| `eyebrow` | yes | text | the small caps line above the title ("Case study / Senior capstone") |
| `description` | yes | text | `<meta name="description">` and `og:description` (escaped, no HTML) |
| `og_alt` | yes | text | `og:image:alt`. The image itself is always `assets/og/case-<slug>-v1.png` |
| `lede` | yes | rich | the paragraph under the title |
| `clip` | no | text | hero video base name: `assets/motion/<clip>-poster.webp`, `<clip>-alpha.webm` |
| `clip_ratio` | no | text | hero media aspect ratio, default `"4 / 3"` |
| `clip_aria` | no | text | `aria-label` on the hero video |
| `clip_note` | no | text | pill over the hero media ("IP protected") |
| `clip_sizes` | no | [md, sm] | smaller encodes `<clip>-<md>-alpha.webm` and `<clip>-<sm>-alpha.webm` exist, e.g. `[1280, 960]` |
| `clip_opaque` | no | true | also ship `<clip>.mp4` (only for opaque renders, like the blurred IP clips) |
| `hero_image` | no | path | hero still image when there is no `clip` (path from the repo root) |
| `hero_caption` | no | text | caption for `hero_image` |
| `walkthrough` | no | object | `{"id", "label", "project"}`: a `<project-walkthrough>` band after the hero, data in `assets/portfolio-foundation/project-stories.json` |
| `brief_label` | no | text or null | label of the first section, default `"Brief"`; `null` drops the label and numbering starts at 01 on the next section |
| `brief` | yes | list | spec rows: `{"label": "Role", "value": "...", "aside": "..."}`; `value` may be one flag object |
| `brief_note` | no | list of rich | paragraphs beside the brief rows |
| `sections` | yes | list | the body, in order (next table) |
| `colophon` | no | rich | the footer credit line. Missing: the home page's credit is reused |

Keys that start with `_` are ignored, so `"_note": "..."` works as a comment.

## Sections

A section without `kind` is a text section. Light text sections in a row share one `<section>`; `"dark": true` gives a dark plate.

| Field | Used by | What it does |
|---|---|---|
| `kind` | | absent (text), `"stats"`, `"bleed"` or `"clip_band"` |
| `label` | text | section rule label, numbered 01, 02... Missing: the part continues the one above |
| `anchor` | text | `id` for deep links (`#project-result`) |
| `track` | text | analytics name when there is no label (`js/track.js`) |
| `dark` | text | `true`: dark plate |
| `strong` | text | `true`: paragraphs in the display color |
| `paras` | text | list of rich paragraphs |
| `cards` | text | list of rich items shown as numbered panels |
| `list` | text | list of rich items shown as a numbered ruled list |
| `frames` | text | images: `{"src": "assets/...", "alt": "...", "caption": "...", "index": "01"}` (`index` optional) |
| `ratio` | text | crop for the frames. Default: `"16 / 9"` for one frame beside text, else `"3 / 2"` |
| `flip` | text | `true`: images on the left |
| `cols` | text | grid columns for text + images, default `"minmax(0, 1.05fr) minmax(0, 1fr)"` |
| `min_col` | text | minimum gallery column when images have no text beside them, default `"220px"` |
| `stats` | stats | `[{"value": "1st", "label": "Deployable Sensor Payload event"}, ...]` dark band of big figures |
| `src`, `alt`, `caption` | bleed | one full width 21:9 image |
| `base`, `caption`, `ratio` | clip_band | a framed autoplay video: `assets/motion/<base>.webm`, `-1280.webm`, `-960.webm`, `.mp4`, `-poster.webp` |

## Rich text and flags

"rich" means a string (HTML allowed, entities like `&deg;` kept as written) or a list of strings and flag objects. A flag is an open question for the owner, shown with a dotted underline and listed by `python3 tools/check-flags.py`:

```json
"paras": [
  ["37 inches, single stage, ",
   {"flag": "charger-029", "note": "Diameter: CAD measures 2.68 in. Confirm 2.63 or correct it.", "text": "2.63"},
   " inches across."]
]
```

- `text` defaults to `[TBD]`. Write the note as plain text; the build escapes it.
- To resolve a flag, replace the object with plain text (and merge the strings).
- In a `brief` row, `value` can be a single flag object (it renders as a React element, not markup).
- `title`, `eyebrow`, `description` and `og_alt` are plain text: no flags there.

## Every place a project's facts appear

Line numbers are as of commit 4c19af5; search for the anchor text if they moved. `python3 tools/new.py project <slug> --where` prints the live list.

| Surface | Fact | File:line | Generated | How to edit |
|---|---|---|---|---|
| Case page | everything on the page | `content/projects/<slug>.json` | source | edit JSON, `python3 tools/build.py` |
| Case page | page order, Previous / Next | `content/projects.json` | source | edit `"order"`, build |
| Case page | head, nav, footer, layout | `build-case.py` (`build()`, `NAV`, helpers) | source | edit, build |
| Case page | share image | `assets/og/case-<slug>-v1.png` (1200x630) | no | replace as `-v2.png` and update the name in `build-case.py` (see images-swap.md) |
| Home | CHARGER feature: name, role line, spec rows, case link | `src/index.html:108` (`<section id="charger"`), spec rows `chargerSpecs` at `src/index.html:481` | no | edit, build |
| Home | HOTBOX card (no case page) | `src/index.html:161` (first `<article>` in `<section id="work">`) | no | edit, build |
| Home | Robo-Catcher card: eyebrow, title, meta line, two paragraphs, clip, photos, link to `#mechanism-tour` | `src/index.html:178` | no | edit, build |
| Home | Bend fixture card | `src/index.html:201` | no | edit, build |
| Home | Rudder pedals card | `src/index.html:219` | no | edit, build |
| Home | Therma-Shift card | `src/index.html:236` | no | edit, build |
| Home | card order and numbers | the order of the `<article>`s and each `Meta index="0N"` | no | move the block, renumber, build |
| Home | hero caption, share image alt naming CHARGER | `src/index.html:104`, `:21` | no | edit, build |
| Studio | drift words (CHARGER, Robo-Catcher, Rudder pedals, Bend fixture, Therma-Shift) | `next/index.html:58` (`data-drift`), lines 61, 64, 79 | no | edit the `<i>` words |
| Studio | proof stats naming CHARGER and Robo-Catcher | `next/index.html:106` (`<dl class="stats"`) | no | edit |
| Studio | work stage images (one per project) | `next/index.html:154`-`159` (`data-key="..."`) | no | the `data-key` must match the list item's `data-project` |
| Studio | work list item: label, title, body, 3 specs, links | `next/index.html:165` CHARGER, `:182` Robo-Catcher, `:195` HOTBOX, `:207` Therma-Shift, `:220` Rudder pedals, `:233` Bend fixture | no | edit the `<li class="project">`. `data-name` is the big ghost word and `data-tag` the stage caption (`next/js/studio.js` swaps them on scroll); the counter is computed, but its first value `01 / 06` at `:153` and the first ghost word at `:152` are static |
| Studio | showreel actors (words must match the drift words) | `next/js/showreel/index.js:39` (`HOME`), `:278` (`registerProject`) | no | see docs/recipes/showreel-actor.md |
| Walkthrough | Robo-Catcher, CHARGER, Rudder pedals, Therma-Shift stories | `assets/portfolio-foundation/project-stories.json:6`, `:73`, `:90`, `:116` | no | edit JSON |
| Sitemap | one URL per case | `sitemap.xml:5`-`9` | no | `tools/new.py project` adds the line; bump `lastmod` by hand |
| 404 | project links (all five, name only) | `404.html`, `nav.nf__go` | no | edit |
| Websites | CHARGER explorer proof item | `websites.html:80` | no | edit |
| Prototypes | each project in four design studies | `studies/{hangar,launch,studio}/index.html`, `studies/specimen/assets/js/main.js` | no | only when the prototypes should match; they are shown on websites.html |
| Resume | role, results | `assets/Mert-Tureli-Resume.pdf` | no | replace the PDF |

The home and Studio cards are separate copy, not a duplicate of the case page (shorter summaries, different metrics), so they stay hand-written. When a fact changes (a result, a cost, a date), run `--where` and update each hit.
