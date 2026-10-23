# Edit the Studio page (`next/`)

Studio is the owner's next design, served at `/next/`, `noindex` and `Disallow`ed. Every file is hand written: no build step.

## Where things are

| Change | File | Notes |
|---|---|---|
| Any text, a section, the work list, specs | `next/index.html` | sections in order: hero `#top`, proof, `#work`, explorer, `#experience`, `#beyond`, `#websites`, `#contact` |
| Hero drift words | `next/index.html`, `data-drift` block | each `.slot` sets `--x`, `--y` (percent of the stage) and `--d` (parallax depth) |
| Work list stage images | `next/index.html`, `img[data-key]` in `.work__stage` and the matching `li.project[data-project]` | the key ties a list item to its stage image |
| Styles | `next/css/studio.css` | tokens: `next/css/tokens.css`, system: [../design/studio.md](../design/studio.md) |
| Behavior (Lenis, reveals, work stage, clock) | `next/js/studio.js` | motion rules: [../design/motion.md](../design/motion.md) |
| Hero 3D rocket | `next/js/hero3d.js`, `next/assets/3d/` | 3D system: [../design/3d.md](../design/3d.md) |
| Hero showreel (project actors) | `next/js/showreel/` | add one: [showreel-actor.md](showreel-actor.md) |
| Images | `next/assets/img/<name>-<width>.webp` | make them with [media.md](media.md) |
| Fonts | `studies/shared/fonts/` (linked as `../studies/shared/fonts/`) | |

The showreel round 2 is merged, so every Studio file is editable. If another session is working on the showreel, leave `next/js/showreel/*` and `next/js/hero3d.js` to it. Colors, sizes and timings come from `next/css/tokens.css` ([studio.md](../design/studio.md)).

## Check and show

```sh
python3 tools/check.py --only links,js,robots,smoke --pages next/,next/#reel-coaster   # links, JS syntax, noindex, smoke at 390 and 1440
python3 tools/preview.py studio --serve 8000    # local look at the artifact copy
```

Publish the copy for the owner with [preview.md](preview.md). Add `#reel-coaster` to the URL to start the showreel at once, or `#reel-<key>` for one project (`-fast` suffix or `#reel-fast` for 3x; all flags in [showreel-actor.md](showreel-actor.md)).

## Keep in step

Studio repeats project facts from the current site (titles, results, numbers). When a fact changes, change it here as well: the field map is in [content.md](content.md).
