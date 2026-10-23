# Publish a preview (claude.ai artifact)

The owner reviews work as a private claude.ai artifact: a copy of the site with the artifact host's rules applied. `tools/preview.py` builds that copy and the exact publish calls. It never edits the repo.

## Commands

| Task | Command |
|---|---|
| Whole site copy | `python3 tools/preview.py site --out <scratchpad>/site-pub` |
| Studio copy (next/) | `python3 tools/preview.py studio --out <scratchpad>/studio-pub` |
| Build and smoke test (Chromium, 390 + 1440) | add `--smoke --port <your port>` |
| Smoke other pages | add `--pages index.html,websites.html --shots <dir>` |
| Look at it in a browser | add `--serve <your port>` (Ctrl-C stops it) |
| Plan only, write nothing | add `--dry-run` |
| Fail on any unresolved reference | add `--strict` |
| Print the publish calls | add `--json` (also saved in `<out>/.preview-plan.json`) |
| List every rewritten file | add `-v` |

`--out` must be outside the repo. Put it under the Claude scratchpad: the publish tool only reads files from the working directory or the scratchpad. Re-running into the same `--out` replaces the old copy. A folder that is not a previous copy is refused.

Exit codes: 0 ok, 1 smoke found console errors or failed requests, 2 bad input or a host rule broken.

## Publish

1. Build with `--smoke`. Read the report: unresolved references and `?query` links are listed.
2. Open `<out>/.preview-plan.json`. `publish` is a list of Artifact tool calls. Each has `file_path` (the copy's `index.html`), `root` (the copy folder) and `files` (published path to source path, relative to `root`).
3. Call 1: `Artifact` with `file_path`, `root`, `files` and an `icon`. It returns the artifact `url`.
4. Calls 2 and later: the same, plus `url` from call 1. Files already published are kept.
5. Give the owner the link. Studio: append `#reel-coaster` to open on the showreel.

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
| `site` | every tracked or new (not ignored) file except `tools/`, `src/`, `templates/`, `content/`, dot folders, `*.py`, `*.sh`, `*.md` (except `docs/**/*.md`, so the catalog's doc links work), `CNAME`, `_headers`. Markup inside `<script type="text/html">` / `text/plain` (catalog demos) is not scanned for refs; `_ds/` strings in it are still rewritten |
| `studio` | `next/index.html` as `index.html`, `next/css/` as `css/`, `next/js/` as `js/`, `next/assets/` as `assets/`, `studies/shared/` as `shared/`; root `assets/` files the Studio references go under `site/` (a linked page brings its whole folder, for example `site/charger-explorer/`) |

`next/lab/` is not in the Studio copy. It is in the site copy under `next/lab/`.

To add a mode or a copy root, edit `MODES` at the top of `tools/preview.py`.

## Known limits

- The copy is a snapshot of the working tree, including uncommitted and untracked files.
- The local server is not the artifact host: a request that works locally can still be refused there if the host adds a rule. Rules live in the constants at the top of `tools/preview.py`.
- The home page embeds the CHARGER explorer with `?embed=1&modal=1&inline=1`. The host drops the query, so in a preview that iframe opens in its standalone layout.
- `.step` and `.vcf` are not common web types. If a publish refuses one, pass it as `{"from": "<path>", "contentType": "application/octet-stream"}` or leave it out.
