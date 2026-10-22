---
name: add-project
description: Use when the owner wants a new project or case study on merttureli.com, or wants to change a project's title, summary, metrics, images or order everywhere it appears.
---

# Add or change a project

Detail: `docs/recipes/add-project.md` and the field map in `docs/recipes/content.md`.

1. Gather from the owner: title, slug, one line summary, metrics, images or clips, order. Never invent facts; flag gaps (`resolve-flags` skill).
2. New project: `python3 tools/new.py project <slug>` (see `--help`); fill the content file it creates in `content/`.
3. Media: `images` skill (derivatives via `python3 tools/media.py`).
4. `python3 tools/build.py` writes the case page.
5. Places not generated (home card, `websites.html`, Studio `next/index.html`, `sitemap.xml`, `assets/og/case-<slug>-v1.png`): follow the content.md table.
6. `python3 check-writing.py projects/<slug>.html`, `python3 tools/check.py --fast`.
7. Preview for the owner (`preview-site` skill), then commit content, generated pages and media together.
