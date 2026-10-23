---
name: edit-copy
description: Use when asked to change any words on merttureli.com (a sentence, heading, caption, date, number, label, page title or description) on the live site (built from next/) or the old-design pages. Routes the edit to the right source file so generated pages are never hand edited.
---

# Edit copy

Detail: `docs/recipes/copy.md` (titles and descriptions: `docs/recipes/meta.md`).

1. Find the words: `grep -rn --include=*.html --include=*.py --include=*.js "exact words" . | grep -v -e '^./vx/' -e node_modules`
2. Not sure which field the owner means ("summary", "title", "card image")? The table "What the owner's words mean" in `docs/recipes/content.md` maps each word to the field on the case page and the home tile. Route each hit:
   - `index.html` -> edit `next/index.html`. `websites.html` -> edit `next/websites.html`.
   - `projects/<slug>.html` or `next/projects/` -> edit `content/projects/<slug>.json` (fields: `docs/recipes/content.md`); the giant name, tile line, menus and footer are in `tools/build-studio-cases.py`.
   - A live `<title>`, share card or JSON-LD -> `LIVE` in `tools/build.py` (`docs/recipes/meta.md`).
   - `privacy.html`, `404.html`, `hi/`, `photography-*.html` -> edit the file itself.
   - `studies/`, `cards/` -> leave unless the owner named them.
3. Change only the text. House voice: first person "I", past tense, specific, no hype, US spelling, no em or en dashes. No new facts, no figures about IP-protected work (HOTBOX, bend fixture), nothing that reads as job hunting. A fact you cannot confirm goes in a flag (`resolve-flags` skill, "Add a flag").
4. If you edited anything in `next/`, `content/` or `tools/build*.py`: `python3 tools/build.py` (`--help` only prints usage).
5. `python3 check-writing.py <each page you changed>` prints no hits.
6. `git diff --stat` lists only the files you meant (for a case study: the JSON and its two generated pages), and `python3 tools/check.py` passes.
7. Same fact elsewhere (home tile, case page, websites page)? `python3 tools/new.py project <slug> --where` lists the places; change every one in the same commit.
8. Commit source and built page together: `git add <files> && git commit -m "Copy: <what changed>"`.
