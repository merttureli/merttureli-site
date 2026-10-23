# Docs

Start here after [../CLAUDE.md](../CLAUDE.md). Every page answers "how do I do X" with the exact command.

## Design system

| Doc | Covers |
|---|---|
| [design/site-tokens.md](design/site-tokens.md) | current site tokens: `css/tokens.css` on top of the `_ds/` export; colors, type, space, radius, z, breakpoints, palettes |
| [design/studio.md](design/studio.md) | Studio (`next/`) tokens in `next/css/tokens.css`, section skeleton, markup contracts |
| [design/motion.md](design/motion.md) | easings and durations for both sites, reduced motion, offscreen pausing, Lenis, every timer |
| [design/components.md](design/components.md) | every repeated UI pattern on both sites: snippet, variants, do and don't |
| [design/catalog.html](design/catalog.html) | the same components rendered live with the real CSS (serve the repo, open `/docs/design/catalog.html`) |
| [design/3d.md](design/3d.md) | 3D look: units, axes, materials, lighting rig, budgets, CAD part names -> showreel `getParts()` |
| [design/studio-tokens-migration.md](design/studio-tokens-migration.md) | record of the Studio literal -> token move (applied) |

## Recipes

Full list with skills: [recipes/README.md](recipes/README.md).

| Job | Recipe |
|---|---|
| Change words | [copy.md](recipes/copy.md) |
| Open owner questions (flags) | [flags.md](recipes/flags.md) |
| Case study facts, where a project appears | [content.md](recipes/content.md) |
| Add a project | [add-project.md](recipes/add-project.md) |
| Image and video sizes | [media.md](recipes/media.md) |
| Replace an image | [images-swap.md](recipes/images-swap.md) |
| Palettes | [palette.md](recipes/palette.md) |
| Contact details, resume | [contact.md](recipes/contact.md) |
| Titles, share images, sitemap, robots | [meta.md](recipes/meta.md) |
| Analytics events, privacy page | [tracking.md](recipes/tracking.md) |
| Edit the Studio | [studio-edit.md](recipes/studio-edit.md) |
| Add a showreel project | [showreel-actor.md](recipes/showreel-actor.md) |
| New page or section | [new-page.md](recipes/new-page.md) |
| STEP to 3D | [cad-import.md](recipes/cad-import.md) |
| Prove nothing broke | [checks.md](recipes/checks.md) |
| Preview for the owner | [preview.md](recipes/preview.md) |
| Branch, hand off, release | [release.md](recipes/release.md) |

## Tools

Every Python tool takes `--help` and works from any folder.

| Command | Does |
|---|---|
| `python3 tools/check.py [--fast\|--full\|--public] [--only NAME]` | one command that proves nothing broke: build, writing, flags, links, js, json, robots, tokens, smoke, visual |
| `python3 tools/build.py [--check\|--serve PORT]` | rebuild `index.html` and `projects/*.html` from `src/` and `content/`; `--check` diffs without writing |
| `python3 build-case.py --check` | fast content check of `content/projects/*.json` (no browser) |
| `python3 check-writing.py [file.html ...]` | house writing rules on copy (default: the public pages) |
| `python3 tools/check-flags.py` | list open `<mark class="flag">` owner questions on every served page; exit 1 while any remain |
| `python3 tools/new.py actor\|page\|section\|project <name> [--dry-run]` | scaffolds from `templates/`; `project --where` finds a project's hand-written mentions |
| `python3 tools/media.py image\|video\|poster\|snippet\|info\|audit` | web derivatives (webp sets, webm/mp4, posters) and the markup to paste; `audit` lists oversized or missing files |
| `python3 tools/preview.py site\|studio --out DIR [--smoke]` | artifact-ready copy for owner review, with the publish plan |
| `python3 tools/cad.py setup\|inspect\|import\|view\|shot\|loader` | STEP assembly -> cadmesh, glb, explorer and hero files, keeping part names |
| `node tools/visual-regress/visual-regress.js --baseline A --candidate B` | pixel diff of two copies (check.py `--full` runs it for you) |
