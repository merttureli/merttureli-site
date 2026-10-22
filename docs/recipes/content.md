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
| Find every place a project is named | `python3 tools/scaffold/project.py <slug> --where` | |
| Prove nothing else changed | | `python3 tools/build.py --check` |

Never edit `projects/*.html`, `src/projects/*.html` or the root `index.html`: they are generated.

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
- `python3 tools/scaffold/project.py --format` rewrites `content/*.json` in the house layout (2-space indent, short objects on one line). The data does not change.

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

Line numbers are as of commit 4c19af5; search for the anchor text if they moved. `python3 tools/scaffold/project.py <slug> --where` prints the live list.

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
| 404 | CHARGER link | `404.html:103` | no | edit |
| Websites | CHARGER explorer proof item | `websites.html:80` | no | edit |
| Prototypes | each project in four design studies | `studies/{hangar,launch,studio}/index.html`, `studies/specimen/assets/js/main.js` | no | only when the prototypes should match; they are shown on websites.html |
| Resume | role, results | `assets/Mert-Tureli-Resume.pdf` | no | replace the PDF |

The home and Studio cards are separate copy, not a duplicate of the case page (shorter summaries, different metrics), so they stay hand-written. When a fact changes (a result, a cost, a date), run `--where` and update each hit.
