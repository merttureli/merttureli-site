---
name: add-project
description: Use when the owner wants a new project or case study on merttureli.com, or wants to change a project's title, summary, metrics, images or order everywhere it appears.
---

# Add or change a project

Detail: `docs/recipes/add-project.md` and the field map in `docs/recipes/content.md`.

Change an existing project:
1. `python3 tools/new.py project <slug> --where` lists every hand-written place that names it.
2. Case page: edit `content/projects/<slug>.json`; order: `"order"` in `content/projects.json`. Then `python3 tools/build.py`.
3. Edit each place from step 1 (home card in `src/index.html`, `websites.html`, Studio `next/index.html`) in the same commit.

Add a new project:
1. Gather from the owner: title, slug, summary, metrics, images or clips, position. Never invent facts.
2. `python3 tools/new.py project <slug> --title "Title" --after <slug> --dry-run`, then again without `--dry-run`. It writes `content/projects/<slug>.json` (every copy field a `[TBD]` flag), adds the slug to `order` and a `sitemap.xml` line.
3. Fill the JSON (copy section shapes from existing cases). Unknown facts stay flags (`resolve-flags` skill).
4. Media: `images` skill. Share image: `python3 tools/media.py image <src> --preset og --name case-<slug>-v1 --out assets/og`.
5. `python3 tools/build.py`, then the hand-written places listed in add-project.md (home card, Studio work list).
6. `python3 check-writing.py projects/<slug>.html`, `python3 tools/check.py`.
7. Preview for the owner (`preview-site` skill), then commit `content/`, `src/projects/`, `projects/`, `sitemap.xml` and media together.
