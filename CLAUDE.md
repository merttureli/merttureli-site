# merttureli.com

Mert Tureli's portfolio. Static site on GitHub Pages (custom domain, `.nojekyll`), served from the root of `main`.
Python 3 stdlib build + Node/Playwright checks, no framework. All docs and tools: [docs/README.md](docs/README.md).

## What is live

The Studio design is the live site. Its sources are in `next/`; `tools/build.py` publishes them at the root.

| Page | Source (edit this) | Live output (generated) |
|---|---|---|
| Home | `next/index.html` | `index.html` |
| Websites | `next/websites.html` | `websites.html` |
| Case studies | `content/projects/<slug>.json` (words) + `PRESENT`/`ORDER` in `tools/build-studio-cases.py` | `next/projects/<slug>.html` (noindex Studio copy) and `projects/<slug>.html` |
| Another Studio page | `next/<name>.html` + one line in `PAGES` in `tools/build.py` | `<name>.html` |
| Still old design | `privacy.html`, `photography-*.html`, `hi/`, `404.html`, `assets/charger-explorer/` (edited directly) | the same files |

Shared Studio code: `next/css/tokens.css` + `studio.css` + `showcase.css`, `next/js/studio.js`, `next/js/hero3d.js`, `next/js/showreel/`.
What still has to move to the Studio design: [docs/transition.md](docs/transition.md) (the `transition` check WARNs, never blocks).

## Golden rules

1. Never hand edit generated files: `index.html`, `websites.html`, `projects/*.html`, `next/projects/*.html`. Edit the source in the table above, then `python3 tools/build.py`, and commit source and output together.
2. No copy changes without the owner. Do not "fix" wording you were not asked to touch; list it for the owner instead.
3. Voice for any new or rewritten copy: first person ("I", not "we"), past tense, specific, no hype, no editorializing, US spelling, no em or en dashes. Never read as job hunting (no "open to roles"). Run `python3 check-writing.py <file>`.
4. IP limits: never add figures or details about HOTBOX or the bend fixture. They are never animated in the showreel.
5. Open questions for the owner are `<mark class="flag">` flags. Nothing goes public with a flag: `python3 tools/check.py --public`.
6. Zero visible change unless asked: prove CSS/JS/generator edits with `python3 tools/check.py --full` (visual-regress on the site and `next/index.html`). When the visible change is the task, name the pages: `--full --expect-change index.html,next/index.html`. A `visual` row that says NOT RUN proves nothing: do what it says.
7. Playwright: `require('/opt/node22/lib/node_modules/playwright')`, never `playwright install`. Block `clarity.ms`, `bing.com`, `workers.dev`, `formspree.io` in every context. Never POST forms or send analytics. In headless, set `window.__reelNoSlowGuard = true` in an init script to see the hero showreel run.
8. Never touch `vx/` or branch `claude/charming-pascal-wgx7a3`. Never push unless the owner says so.
9. Pages under `next/`, `studies/`, `docs/` carry `<meta name="robots" content="noindex">`; a `next/` page that has a live twin also carries `<link rel="canonical">` to the live URL. Live pages never link to a `next/` page (the build refuses); they load `next/` CSS, JS and assets, which `robots.txt` keeps crawlable.

## Task -> command

| I want to | Command | Recipe |
|---|---|---|
| Prove nothing broke (before every commit) | `python3 tools/check.py` (`--fast` static only, `--full` + pixels and lab pages) | [checks](docs/recipes/checks.md) |
| Change words | edit the source (`next/...` for live pages), then `python3 tools/build.py` | [copy](docs/recipes/copy.md) |
| Change a case study | `content/projects/<slug>.json` (presentation: `tools/build-studio-cases.py`), then `python3 tools/build.py` | [content](docs/recipes/content.md) |
| Know what "summary", "card image", "title", "hero image" mean | one table: field and every surface it shows on | [content: what the owner's words mean](docs/recipes/content.md#what-the-owners-words-mean) |
| Add a project | `python3 tools/new.py project <slug> --title "T" --dry-run` | [add-project](docs/recipes/add-project.md) |
| Find or remove a project everywhere | `python3 tools/new.py project <slug> --where`, `--remove --dry-run` | [add-project](docs/recipes/add-project.md) |
| List, add or resolve owner flags | `python3 tools/check-flags.py` (`--next-id <slug>` for a new id) | [flags](docs/recipes/flags.md) |
| Make image or video sizes | `python3 tools/media.py image\|video\|poster SRC --out DIR` | [media](docs/recipes/media.md) |
| Swap an image | `python3 tools/media.py image SRC --out <folder> --name <base> --preset <set> --force` | [images-swap](docs/recipes/images-swap.md) |
| Show the owner a preview | `python3 tools/preview.py site --out <scratchpad dir>` (the live site; `studio` = next/ alone) | [preview](docs/recipes/preview.md) |
| Add a page | `next/<name>.html` + one line in `PAGES` in `tools/build.py` | [new-page](docs/recipes/new-page.md) |
| Add a section | `python3 tools/new.py section <name>` | [new-page](docs/recipes/new-page.md) |
| Edit the design | tokens in `next/css/tokens.css` | [studio-edit](docs/recipes/studio-edit.md) |
| See what is still old design | `docs/transition.md` (delete a line when its item is done) | [transition](docs/transition.md) |
| Add a showreel project | `python3 tools/new.py actor <key>`, later `--register` (only with the owner's go: it goes live in the home hero); see it at `next/#reel-<key>` | [showreel-actor](docs/recipes/showreel-actor.md) |
| Bring in a STEP file | `python3 tools/cad.py inspect\|import X.step` | [cad-import](docs/recipes/cad-import.md) |
| Palette, contact, meta, tracking, release | see the recipe | [recipes index](docs/recipes/README.md) |

Skills in `.claude/skills/` wrap the common jobs (edit-copy, resolve-flags, images, palette, contact-details,
verify-site, preview-site, release-site, add-project, import-cad, new-actor, new-page).
