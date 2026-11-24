# Publish a preview (claude.ai artifact)

The owner reviews work as a private claude.ai artifact: a copy of the site with the artifact host's rules applied. `tools/preview.py` builds that copy and the exact publish calls. It never edits the repo.

## Commands

| Task | Command |
|---|---|
| Whole site copy | `python3 tools/preview.py site --out <scratchpad>/site-pub` |
| Studio copy (next/) | `python3 tools/preview.py studio --out <scratchpad>/studio-pub` |
| Catalog of sample sites copy (the Websites page and the twelve pages it opens) | `python3 tools/preview.py samples --out <scratchpad>/samples-pub` |
| Build and smoke test (Chromium, 390 + 1440) | add `--smoke --port <your port>`. The port must be free: stop your own `http.server` on it first (`kill $(lsof -ti :PORT)`). If it is taken, the copy is still written and only the smoke is skipped (exit 2) |
| Smoke other pages | add `--pages index.html,websites.html --shots <dir>` (`samples` smokes the Websites page, the page with the viewer open on `#vireo`, and every sample it links to by default; one sample: `--pages studies/vireo/index.html`) |
| Look at it in a browser | add `--serve <your port>` (Ctrl-C stops it) |
| Plan only, write nothing | add `--dry-run` |
| Fail on any unresolved reference | add `--strict` |
| Print the publish calls | add `--json` (also saved in `<out>/.preview-plan.json`) |
| List every rewritten file | add `-v` |

`--out` must be outside the repo. Put it under the Claude scratchpad: the publish tool only reads files from the working directory or the scratchpad. Re-running into the same `--out` replaces the old copy. A folder that is not a previous copy is refused.

Exit codes: 0 ok, 1 smoke found console errors or failed requests, 2 bad input, a host rule broken or the port taken.
The report also counts open owner flags in the copy: the owner sees them as dotted underlines, which is fine for a private review.

## Publish

1. Build with `--smoke`. Read the report: unresolved references and `?query` links are listed.
2. Open `<out>/.preview-plan.json`. `publish` is a list of Artifact tool calls. Each has `file_path` (the copy's `index.html`), `root` (the copy folder) and `files` (published path to source path, relative to `root`).
3. Call 1: `Artifact` with `file_path`, `root`, `files` and `icon` (the plan carries `"icon": "portfolio"`). It returns the artifact `url`.
4. Calls 2 and later: the same, plus `url` from call 1. Files already published are kept.
5. Give the owner the link. Studio: append `#reel-coaster` to open on the showreel, or `#reel-<key>` to open on one project (flags: [showreel-actor.md](showreel-actor.md)).

To update a preview, rebuild into the same `--out` and repeat every call with the artifact's `url`.

## What the copy changes

| Host rule | What preview.py does |
|---|---|
| Top-level paths starting with `_` are rejected | `_ds/` becomes `ds/`; every reference is rewritten |
| `.bin` and `.glb` are rejected | renamed to `.bin.wasm` / `.glb.wasm`; paths and bare file names (`fetch(base + 'x.bin')`) rewritten |
| Only `#hash` survives in URLs | internal links with `?query` are reported, not changed |
| Page entry is `index.html` at the copy root | root-absolute refs (`/css/x.css`) become relative; folder links (`hi/`) become `hi/index.html` |
| 255 files and 64 MB per publish | files are split into the fewest batches of at most 250 files and 60 MB |
| 16 MB per text file, 15 MB per binary file, 511 files and 256 MB per version | checked; exit 2 if broken |

References are found in HTML attributes (`href`, `src`, `srcset`, `poster`, `data-*src`), inline and file CSS (`url()`, `@import`), JS imports, `new URL(x, import.meta.url)`, `new URL(x, document.baseURI)` and quoted path-like strings. A reference is rewritten only when its target moved. Bare import-map names (`three`) and root-absolute paths inside scripts are left alone.

## What goes in each copy

| Mode | Contents |
|---|---|
| `site` | the live site: every tracked or new (not ignored) file except `tools/`, `templates/`, `content/`, dot folders, `*.py`, `*.sh`, `*.md` (except `docs/**/*.md`, so the catalog's doc links work), `CNAME`, `_headers`. Markup inside `<script type="text/html">` / `text/plain` (catalog demos) is not scanned for refs; `_ds/` strings in it are still rewritten |
| `studio` | `next/index.html` as `index.html`, `next/css/` as `css/`, `next/js/` as `js/`, `next/assets/` as `assets/`, `studies/shared/` as `shared/`; root `assets/` files the Studio references go under `site/` (a linked page brings its whole folder, for example `site/charger-explorer/`), the catalog's posters as `studies/catalog/`. The twelve pages the websites page's catalog opens are left out on purpose (reported as info, not as unresolved): with them the copy is over the per-version file limit, so the catalog's viewer is empty in this copy. Use `samples` for it |
| `samples` | the built `websites.html` as `index.html` (its `#studies` section is the catalog of sample sites), and every file it and the twelve pages it opens reference, at their repo paths beside it: `studies/<key>/`, `studies/shared/`, `studies/catalog/assets/` (posters), `next/`, root `assets/` and root `js/`. Run `python3 tools/build.py` first if `next/websites.html` changed |

`next/lab/` is not in the Studio copy. It is in the site copy under `next/lab/`.

The `samples` copy also:

- reads `data-srcset`, any `data-*` attribute that holds a file path (`data-video`), the `.bin` a model `.json` names, and the fixed folder of a template path (`` `../x/${name}.json` ``). A relative folder string in a script (`base: '../../assets/charger-explorer/'`) is a reference too, and it brings every file under that folder except its pages.
- points each study's back pill (`/websites.html#studies`) to the entry (`../../index.html#studies`), as any root-absolute link to a file in the copy. Links to the home page (`index.html#work` and the like), and to the old explorer page (also in markup a script writes), become `https://merttureli.com/...` links that open in a new tab (`external` in `MODES`).
- fails the smoke on any request that leaves the copy, and waits 7 s per page for 3D (a full smoke takes about 8 minutes).
- if it is over the per-version limit, leaves out unreferenced files, heaviest first, starting with the four portfolio redesigns (catalog label "Redesign"); the report and the plan's `left_out` list them. A referenced file is never left out.

The `site` copy is over the host's per-version limit (about 850 files against 511): the whole repository is in it. It still builds a complete working copy for `--serve` (the report ends with `host rule broken` and exit 2, and `--smoke` does not run), but it cannot be published as one artifact. Publish `samples` for the catalog and `studio` for the Studio pages.

To add a mode or a copy root, edit `MODES` at the top of `tools/preview.py`.

## Known limits

- The copy is a snapshot of the working tree, including uncommitted and untracked files.
- The local server is not the artifact host: a request that works locally can still be refused there if the host adds a rule. Rules live in the constants at the top of `tools/preview.py`.
- The CHARGER explorer opens in place on the home page (`index.html#charger`). If the host's sandbox refuses `history.pushState`, the URL keeps no `#charger` entry: Esc and the close button still close it, Back does not.
- `.step` and `.vcf` are not common web types. If a publish refuses one, pass it as `{"from": "<path>", "contentType": "application/octet-stream"}` or leave it out.
