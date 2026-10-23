# merttureli.com

Served by GitHub Pages from the root of `main`.

## Editing the home page and case studies

`index.html` and `projects/*.html` are generated. Do not edit them by hand.

1. Edit the source:
   - the home page: `src/index.html`
   - a case study: its data in `content/projects/<slug>.json` (order in `content/projects.json`; `build-case.py` turns it into HTML)
2. Build: `python3 tools/build.py`
3. Commit the source and the regenerated `index.html` and `projects/*.html` together.

`python3 tools/build.py --check` rebuilds into a temporary folder and fails if
the committed pages do not match their sources. `python3 tools/build.py --serve`
previews the source templates at http://127.0.0.1:8000/ before you build.

The build renders each page in headless Chromium, so it needs Node and
Playwright with Chromium installed once:

```sh
cd tools/prerender
npm install
npx playwright install chromium
```

The pages in `src/` are templates for the design-system runtime (`support.js`).
The build loads them, lets the runtime render them, and writes the result as
plain HTML with the runtime removed, so visitors get the page without waiting
for React or any third-party server. The scripts that make the page interactive
(colour palettes, mobile menu, videos, photo corridor, CHARGER explorer,
analytics) are kept and run on the built page as before. See the comments at the
top of `tools/build.py` and `tools/prerender/prerender.js` for details.

Other pages (`websites.html`, `privacy.html`, `404.html`, `hi/`, ...) are
plain HTML and are edited directly.

Before committing copy changes, run `python3 check-writing.py`.

Every other job (checks, previews, images, scaffolds, 3D, design system): start at
`CLAUDE.md` and `docs/README.md`.
