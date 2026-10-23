# Add a project (new case study)

One command makes a case page that builds. You then fill in the copy and media, and add the hand-written cards.

## 1. Scaffold

```sh
python3 tools/new.py project new-thing --title "New thing" --after therma-shift --dry-run
python3 tools/new.py project new-thing --title "New thing" --after therma-shift
```

`tools/scaffold/project.py` takes the same arguments if `tools/new.py` is not there.

| Option | Meaning |
|---|---|
| `<slug>` | lower-case words with hyphens; it becomes `projects/<slug>.html` |
| `--title` | the h1 (default: the slug in words) |
| `--nav-title` | the name on the neighbors' Previous / Next buttons (default: the title) |
| `--after SLUG` | position in `content/projects.json` (default: last) |
| `--dry-run` | print every file it would write, write nothing |
| `--build` | run `python3 tools/build.py` afterwards |

It writes:

| File | Change |
|---|---|
| `content/projects/<slug>.json` | a minimal case. Every piece of copy is a flag (`[TBD]`), so `tools/check-flags.py` lists it until it is written |
| `content/projects.json` | the slug in `"order"` |
| `sitemap.xml` | `<url>` for `https://merttureli.com/projects/<slug>.html`, after the previous case |

Running it again for the same slug changes nothing. It never writes `src/projects/` or `projects/`.

## 2. Write the case

Edit `content/projects/<slug>.json`. Field reference: [content.md](content.md). Copy a section shape from an existing case, for example:

| Want | Copy from |
|---|---|
| big figures band after the hero | `content/projects/charger.json`, first section (`"kind": "stats"`) |
| text beside two photos | `content/projects/robo-catcher.json`, "The feeder" |
| numbered panels | `content/projects/therma-shift.json`, "Constraints" (`cards`) |
| full width photo | `content/projects/charger.json`, `"kind": "bleed"` |
| framed video band | `content/projects/rudder-pedals.json`, `"kind": "clip_band"` |
| hero video with smaller encodes | `"clip"` + `"clip_sizes"` in `content/projects/charger.json` |

Also replace the plain `TBD` in `eyebrow`, `description` and `og_alt` (the build warns while they remain), and the `colophon` flag (without a colophon the page reuses the home page's photo credit).

## 3. Media

| Asset | Path | How |
|---|---|---|
| hero video | `assets/motion/<clip>-alpha.webm`, `<clip>-poster.webp`, optional `<clip>-1280-alpha.webm`, `<clip>-960-alpha.webm` | `python3 tools/media.py video ...` (docs/recipes/media.md) |
| photos | `assets/photos/<project>-photography/*.jpg` or `assets/renders/<project>/*.jpg` | `python3 tools/media.py image ...` |
| share image | `assets/og/case-<slug>-v1.png`, 1200x630 PNG | by hand; the build warns until it exists |

## 4. Build and check

```sh
python3 build-case.py --check        # fast: content loads, templates match
python3 tools/build.py               # writes src/projects/ and projects/, and rebuilds the neighbors (Previous / Next):
                                     # git status then also shows the two neighbors' pages as changed, that is expected
python3 tools/build.py --check       # must print ok for every page
python3 tools/check-flags.py         # lists what is still [TBD]
python3 check-writing.py projects/<slug>.html
```

## 5. Hand-written places

These are not generated. Do the ones the project should appear in ([content.md](content.md) has the line numbers):

- [ ] Home card: copy an `<article>` inside `<section id="work">` in `src/index.html`, renumber the `Meta index="0N"` labels, `python3 tools/build.py`.
- [ ] Studio: a `<li class="project" data-project="KEY">` in `next/index.html` work list, a matching `<img data-key="KEY">` in the stage, update the static `01 / 0N` counter. Optional drift word in `data-drift`.
- [ ] Walkthrough: an entry in `assets/portfolio-foundation/project-stories.json` and `"walkthrough"` in the case JSON (only if it gets one).
- [ ] 404.html, websites.html, the resume PDF: only if they should mention it.

## 6. Commit

```sh
git add content/ sitemap.xml src/projects/ projects/ assets/...   # plus src/index.html, index.html, next/index.html if you added cards
```

## Remove or rename a project

- Remove: `python3 tools/new.py project <slug> --remove --dry-run`, then without `--dry-run`. It takes the slug out of `content/projects.json`, deletes the sitemap line, `content/projects/<slug>.json`, `src/projects/<slug>.html` and `projects/<slug>.html`, rebuilds (the neighbors' Previous / Next change), and prints the hand-written places that still name the project: clear each one by hand. It leaves `assets/og/case-<slug>-v1.png` in place. A scaffold run followed by `--remove` leaves git exactly as it was.
- Rename the slug (URL change): rename the JSON file and the entry in `"order"`, rename the share image, run the build, delete the old generated pages, update the sitemap and every `--where` hit. Old links break; GitHub Pages has no redirects.
