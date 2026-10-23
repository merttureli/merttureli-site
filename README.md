# merttureli.com

Served by GitHub Pages from the root of `main`.

## Editing the home page, the websites page and case studies

`index.html`, `websites.html` and `projects/*.html` are generated from the Studio
sources in `next/`. Do not edit them by hand.

1. Edit the source:
   - the home page: `next/index.html`
   - the websites page: `next/websites.html`
   - a case study: its words in `content/projects/<slug>.json`, its presentation in
     `tools/build-studio-cases.py`
2. Build: `python3 tools/build.py` (stdlib only, no browser)
3. Commit the source and the regenerated pages together (`next/projects/*.html`,
   `index.html`, `websites.html`, `projects/*.html`).

`python3 tools/build.py --check` builds in memory and fails if a committed page
does not match its source.

Other pages (`privacy.html`, `404.html`, `hi/`, the photography pages, the CHARGER
explorer) are still in the old design and are edited directly. `docs/transition.md`
lists what still has to move to the Studio design.

Before committing copy changes, run `python3 check-writing.py`.

Every other job (checks, previews, images, scaffolds, 3D, design system): start at
`CLAUDE.md` and `docs/README.md`.
