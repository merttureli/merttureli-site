# Edit the live design (`next/`)

The Studio design is the live site. `next/index.html` and `next/websites.html` are hand written and
`tools/build.py` publishes them as the root `index.html` and `websites.html` (case pages: [content.md](content.md)).
The `next/` copies stay `noindex`; after any edit run `python3 tools/build.py` and commit both.

## Where things are

| Change | File | Notes |
|---|---|---|
| Any text, a section, the tiles | `next/index.html` | sections in order: hero `#top`, `#work` (bento tiles), `#experience`, `#beyond`, `#websites`, `#contact` |
| Hero drift words | `next/index.html`, `data-drift` block | each `.slot` sets `--x`, `--y` (percent of the stage) and `--d` (parallax depth) |
| Experience line | `next/index.html`, `.roles__line` | one `<li>` per role; only the current employer (Base Power) carries a logo, `next/assets/img/logos/` |
| Styles | `next/css/studio.css`, `next/css/showcase.css` (tiles, roles, album, case pages), `next/css/websites.css` | tokens: `next/css/tokens.css`, system: [../design/studio.md](../design/studio.md) |
| Behavior (Lenis, reveals, work stage, clock) | `next/js/studio.js` | motion rules: [../design/motion.md](../design/motion.md) |
| Hero 3D rocket | `next/js/hero3d.js`, `next/assets/3d/` | 3D system: [../design/3d.md](../design/3d.md) |
| Hero showreel (project actors) | `next/js/showreel/` | add one: [showreel-actor.md](showreel-actor.md) |
| Images | `next/assets/img/<name>-<width>.webp` | make them with [media.md](media.md) |
| Fonts | `studies/shared/fonts/` (linked as `../studies/shared/fonts/`) | |

The showreel round 2 is merged, so every Studio file is editable. If another session is working on the showreel, leave `next/js/showreel/*` and `next/js/hero3d.js` to it. Colors, sizes and timings come from `next/css/tokens.css` ([studio.md](../design/studio.md)).

## Check and show

```sh
python3 tools/build.py                                                                    # publish to the root
python3 tools/check.py --only build,links,js,robots,smoke --pages index.html,next/#reel-coaster   # smoke at 390 and 1440
python3 tools/preview.py studio --serve 8000    # local look at the artifact copy
```

Publish the copy for the owner with [preview.md](preview.md). Add `#reel-coaster` to the URL to start the showreel at once, or `#reel-<key>` for one project (`-fast` suffix or `#reel-fast` for 3x; all flags in [showreel-actor.md](showreel-actor.md)).

## Keep in step

The home tiles repeat project facts from the case pages (titles, results, numbers). When a fact changes, change both: the field map is in [content.md](content.md).

Live pages render from `next/css`, `next/js` and `next/assets`, so a URL a script builds at runtime must resolve from the module (`new URL('../assets/x', import.meta.url)`), not from the page: the page may be `index.html` at the root or `next/index.html`.
