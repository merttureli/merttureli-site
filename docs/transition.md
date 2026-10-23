# Still in the old design

The Studio design (`next/`) is the live merttureli.com: `tools/build.py` publishes
`next/index.html`, `next/websites.html` and `next/projects/*.html` as `index.html`,
`websites.html` and `projects/*.html`. Everything below is still in the old design and
has to move over eventually. None of it blocks a commit or a release.

`python3 tools/check.py` reads this list (the `transition` check) and WARNs with every
open item, and again when a live page links to a page named here. When an item is done,
delete its line. Keep one item per line: the paths it covers in backticks, then
"Done when" and the condition.

## Open

- `photography-gallery.html` `photography-lab.html` The photography pages are old design. Done when they are Studio pages (or folded into the home's Beyond section) and nothing links the old files.
- `assets/charger-explorer/index.html` The CHARGER explorer is a separate old-design page that the home tile and the CHARGER case page link to. Done when the in-page Studio replacement ships and no live page links this file (vx/ on main still loads its model files: keep those).
- `assets/motion/` `assets/photos/` Case pages still show the old turntable videos and old stills from the old site. Done when every case page's hero and feature media is a Studio render or photo chosen for the Studio pages.
- `docs/design/site-tokens.md` `docs/design/components.md` `docs/design/catalog.html` `docs/design/motion.md` Design docs still describe the old site next to the Studio. Done when they describe only the Studio, or the old parts are deleted with the last old page.
- `docs/recipes/palette.md` `.claude/skills/palette/` `js/site-palette.js` Palettes only apply to the old-design pages. Done when the last old page is gone and the palette recipe, skill and scripts are deleted.
- `templates/page/` `templates/section/page.html.tmpl` `tools/new.py page` and `tools/new.py section --site page` still scaffold old-design pages. Done when they scaffold a Studio page under `next/` that `tools/build.py` publishes.
- `css/` `js/` `_ds/` Old-design stylesheets and scripts are still served for the pages above and the design studies (the analytics scripts in `js/` stay). Done when the last old page moves and the unused files are deleted, keeping what vx/ on main needs.
