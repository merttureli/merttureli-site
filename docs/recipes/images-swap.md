# Swap an image, poster or clip

Use this to replace a picture or video that is already on the site. To add new media in a new place, make the derivatives with [media.md](media.md) and paste its snippet.

Which image is "the card image" or "the hero image"? The case page and the home tile each have their own: see
"What the owner's words mean" in [content.md](content.md#what-the-owners-words-mean). Ask which surface when the request does not say.

## Pick the route

| Situation | Route |
|---|---|
| New file, same framing and aspect ratio | A. Overwrite in place. No code change. |
| Different aspect ratio, crop or format | B. New file name, update the references. |
| Turntable or clip (`assets/motion/`) | C. Regenerate the whole set. |
| Share image (`assets/og/`) | D. Bump the version in the name. |

## A. Overwrite in place

1. Read the current size: `python3 tools/media.py info <old file>` (prints width x height and weight).
2. Write the new file over the old one, same width, aspect and format. Example for a 1400 x 1750 JPEG:
   ```sh
   python3 tools/media.py image <source> --out assets/portrait --name mert-bridge \
     --widths 1400 --aspect 4:5 --format jpg --no-suffix --force --dry-run   # drop --dry-run to write
   ```
   `--gravity top|bottom|left|right` picks what the crop keeps. Keep the name exactly.
3. Check the page (step "Verify" below). Nothing to build: generated pages point at the file by path.

## B. New name, update references

1. Read the source width first: `python3 tools/media.py info <source>`. The tool never upscales: a source narrower than the preset makes fewer files, each named by its real width. Example: many photos in `assets/photos/` are 520 px wide (`machine-field.jpg` is 520x650), so `--preset card` (600, 1000) writes ONE file, `<base>-520.webp`, and the log says `not upscaling to ...`. Use the name it printed, not the preset widths.
2. Make the new file with `python3 tools/media.py image <source> --out <folder> --name <base> --preset <set> --page <page you will paste into> --alt "..." --dry-run`, then without `--dry-run` (`python3 tools/media.py presets` lists the sets). It prints the `<img>` to paste. Name it `<subject>-<detail>.<ext>`, lowercase, hyphens, in the folder its neighbors use (`assets/photos/<project>-photography/`, `assets/renders/<project>/`, `assets/portrait/`, Studio: `next/assets/img/`).
3. Find every reference to the old file:
   ```sh
   grep -rn --include=*.html --include=*.py --include=*.js --include=*.css --include=*.json "old-name" . | grep -v -e '^./vx/' -e node_modules
   ```
4. Change each reference in its source (a hit in `index.html`, `websites.html` or `projects/` means edit `next/index.html`, `next/websites.html`, `content/projects/<slug>.json` or `PRESENT` in `tools/build-studio-cases.py`, see [copy.md](copy.md), then `python3 tools/build.py`). In `content/projects/<slug>.json` a frame is `{"src": "assets/photos/...jpg", "alt": "...", "caption": "..."}` (also `hero_image`, bleed `src`): change only `src` unless the owner gave new alt text or caption.
   A home tile image is in `next/index.html` (update its `width`/`height` to the new file's size); the same file may also be a case page's `img` in `PRESENT`.
5. Delete the old file with `git rm` only when the grep finds no reference at all. Hits in `studies/` (frozen design prototypes) and `docs/` (the catalog, doc examples) count too: the `links` check covers them and FAILs if the file goes. If only those remain, keep the file. (`vx/` is never touched and does not count.)
6. `python3 tools/build.py` if you edited a source of a generated page.

Known naming debt: a few files in `next/assets/img/` have a `-NNN` suffix that is not their real width (`robo-catcher-1400.webp` is 945 px wide). `python3 tools/media.py audit` warns `suffix-mismatch` on them. Leave them unless you are swapping that image anyway.

## C. Turntables and clips

A clip in `assets/motion/` is a set. Replace all members together:

| File | Used for |
|---|---|
| `<base>-alpha.webm` | full size, transparent (VP9 alpha) |
| `<base>-<md>-alpha.webm`, `<base>-<sm>-alpha.webm` | wide and phone variants picked by `js/media-playback.js` |
| `<base>.mp4` | opaque fallback (blurred renders, wide bands) |
| `<base>-poster.webp` | first frame, shown before play and with motion off |

The case page sizes are `"clip_sizes": [md, sm]` in `content/projects/<slug>.json`. Make the set with the same `<base>` so no reference changes:

```sh
python3 tools/media.py video <source.mov> --name <base> --out assets/motion --widths <full>,<md>,<sm> --force --dry-run
```

Alpha is detected; `--alpha` makes it required, `--mp4-bg white` adds the opaque mp4 for an alpha clip, `--poster-at <s>` picks the poster frame. A new poster alone: `python3 tools/media.py poster <clip> --at <s> --out assets/motion --name <base> --force`. `--force` lets it overwrite the files already there.

## D. Share images

Crawlers cache share images by URL. Write the new file as the next version, 1200 x 630 PNG: `python3 tools/media.py image <source> --preset og --name case-<slug>-v2 --out assets/og`. Then change `-v1` to `-v2` where the page names it (`LIVE` in `tools/build.py` for `cover` and `websites`, the page head for `hi`). Case pages share one pattern, `case-%s-v1.png` in `case_live()` in `tools/build.py`, so a version bump there needs a `-v2` file for all five cases (or copy the four unchanged ones to `-v2`). See [meta.md](meta.md).

## Verify

```sh
python3 tools/media.py audit        # no missing or oversized derivatives
python3 tools/check.py              # asset references resolve, pages load clean
```

Look at it at 390 and 1440 wide: screenshots of the page you changed, written to a folder you choose:

```sh
python3 tools/check.py --only smoke --pages next/ --out <scratchpad>/swap       # PNGs in <scratchpad>/swap/smoke/
python3 tools/check.py --only visual --pages next/index.html --expect-change next/index.html --out <scratchpad>/swap
                                     # pixel diff vs HEAD: diff images listed, the contact sheet is visual/studio/index.html
```

Use `--pages index.html` or `--pages projects/<slug>.html` for the current site (`visual` puts those under `visual/site/`).
Commit the media and any reference changes together.
