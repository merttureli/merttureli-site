# merttureli.com

Mert Tureli's portfolio. Static site on GitHub Pages (custom domain, `.nojekyll`), served from the root of `main`.
Python 3 stdlib + Node/Playwright tooling, no framework. All docs and tools: [docs/README.md](docs/README.md).

## Two tracks

| Track | Where | Status |
|---|---|---|
| Current site | repo root: `index.html` (built from `src/index.html`), `projects/*.html` (built from `content/projects/*.json`), plain pages (`websites.html`, `privacy.html`, `404.html`, `hi/`, `photography-*.html`), `css/`, `js/`, `assets/` | live |
| Studio | `next/` (served at `/next/`, noindex, robots Disallow): `index.html`, `css/tokens.css` + `css/studio.css`, `js/studio.js`, `js/hero3d.js`, `js/showreel/` | the owner's preferred future design |

## Golden rules

1. Never hand edit generated files: `index.html`, `projects/*.html`, `src/projects/*.html`. Edit `src/index.html` or `content/projects/<slug>.json`, then `python3 tools/build.py`, and commit source and output together.
2. No copy changes without the owner. Do not "fix" wording you were not asked to touch; list it for the owner instead.
3. Voice for any new or rewritten copy: first person ("I", not "we"), past tense, specific, no hype, no editorializing, US spelling, no em or en dashes. Never read as job hunting (no "open to roles"). Run `python3 check-writing.py <file>`.
4. IP limits: never add figures or details about HOTBOX or the bend fixture. They are never animated in the showreel.
5. Open questions for the owner are `<mark class="flag">` flags. Nothing goes public with a flag: `python3 tools/check.py --public`.
6. Zero visible change unless asked: prove CSS/JS/generator edits with `python3 tools/check.py --full` (visual-regress).
7. Playwright: `require('/opt/node22/lib/node_modules/playwright')`, never `playwright install`. Block `clarity.ms`, `bing.com`, `workers.dev`, `formspree.io` in every context. Never POST forms or send analytics.
8. Never touch `vx/` or branch `claude/charming-pascal-wgx7a3`. Never push unless the owner says so.
9. New pages under `next/`, `studies/`, `docs/` need `<meta name="robots" content="noindex">`.

## Task -> command

| I want to | Command | Recipe |
|---|---|---|
| Prove nothing broke (before every commit) | `python3 tools/check.py` (`--fast` static only, `--full` + pixels) | [checks](docs/recipes/checks.md) |
| Change words | edit the source, `python3 tools/build.py` if generated | [copy](docs/recipes/copy.md) |
| Change a case study | `content/projects/<slug>.json`, then `python3 tools/build.py` | [content](docs/recipes/content.md) |
| Add a project | `python3 tools/new.py project <slug> --title "T" --dry-run` | [add-project](docs/recipes/add-project.md) |
| List or resolve owner flags | `python3 tools/check-flags.py` | [flags](docs/recipes/flags.md) |
| Make image or video sizes | `python3 tools/media.py image\|video\|poster SRC --out DIR` | [media](docs/recipes/media.md) |
| Swap an image | `python3 tools/media.py image SRC --out <folder> --name <base> --preset <set> --force` | [images-swap](docs/recipes/images-swap.md) |
| Show the owner a preview | `python3 tools/preview.py site\|studio --out <scratchpad dir>` | [preview](docs/recipes/preview.md) |
| Add a page or section | `python3 tools/new.py page\|section <name>` | [new-page](docs/recipes/new-page.md) |
| Edit the Studio | tokens in `next/css/tokens.css` | [studio-edit](docs/recipes/studio-edit.md) |
| Add a showreel project | `python3 tools/new.py actor <key>`, later `--register` | [showreel-actor](docs/recipes/showreel-actor.md) |
| Bring in a STEP file | `python3 tools/cad.py inspect\|import X.step` | [cad-import](docs/recipes/cad-import.md) |
| Palette, contact, meta, tracking, release | see the recipe | [recipes index](docs/recipes/README.md) |

Skills in `.claude/skills/` wrap the common jobs (edit-copy, resolve-flags, images, palette, contact-details,
verify-site, preview-site, release-site, add-project, import-cad, new-actor, new-page).
