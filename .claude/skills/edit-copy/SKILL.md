---
name: edit-copy
description: Use when asked to change any words on merttureli.com (a sentence, heading, caption, date, number, label, page title or description) on the current site or on Studio (next/). Routes the edit to the right source file so generated pages are never hand edited.
---

# Edit copy

Detail: `docs/recipes/copy.md` (titles and descriptions: `docs/recipes/meta.md`).

1. Find the words: `grep -rn --include=*.html --include=*.py --include=*.js "exact words" . | grep -v -e '^./vx/' -e node_modules`
2. Route each hit:
   - `index.html` -> edit `src/index.html`.
   - `projects/<slug>.html` or `src/projects/` -> edit `content/projects/<slug>.json` (fields: `docs/recipes/content.md`).
   - `websites.html`, `privacy.html`, `404.html`, `hi/`, `photography-*.html`, `next/index.html` -> edit the file itself.
   - `studies/`, `cards/` -> leave unless the owner named them.
3. Change only the text. House voice: first person "I", past tense, specific, no hype, US spelling, no em or en dashes. No new facts, no figures about IP-protected work (HOTBOX, bend fixture), nothing that reads as job hunting. A fact you cannot confirm goes in a flag (`resolve-flags` skill, "Add a flag").
4. If you edited `src/index.html` or `content/`: `python3 tools/build.py`. Never pass `--help` to build.py (it runs a full build).
5. `python3 check-writing.py <each page you changed>` prints no hits.
6. `python3 tools/check.py` passes.
7. Same fact elsewhere (home card, case page, websites.html, Studio)? Change every place in the same commit.
8. Commit source and built page together: `git add <files> && git commit -m "Copy: <what changed>"`.
