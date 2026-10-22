# Swap an image, poster or clip

Use this to replace a picture or video that is already on the site. To add new media in a new place, make the derivatives with [media.md](media.md) and paste its snippet.

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
     --widths 1400 --aspect 4:5 --format jpg --no-suffix --dry-run   # drop --dry-run to write
   ```
   `--gravity top|bottom|left|right` picks what the crop keeps. Keep the name exactly.
4. Check the page (step "Verify" below). Nothing to build: generated pages point at the file by path.

## B. New name, update references

1. Make the new file with `python3 tools/media.py image <source> --out <folder> --name <base> --preset <set> --page <page you will paste into> --alt "..."` (`python3 tools/media.py presets` lists the sets). It prints the `<img>` to paste. Name it `<subject>-<detail>.<ext>`, lowercase, hyphens, in the folder its neighbors use (`assets/photos/<project>-photography/`, `assets/renders/<project>/`, `assets/portrait/`).
2. Find every reference to the old file:
   ```sh
   grep -rn --include=*.html --include=*.py --include=*.js --include=*.css --include=*.json "old-name" . | grep -v -e '^./vx/' -e node_modules
   ```
3. Change each reference in its source (a hit in `index.html` or `projects/` means edit `src/index.html` or `content/projects/<slug>.json`, see [copy.md](copy.md)). In `content/projects/<slug>.json` a frame is `{"src": "assets/photos/...jpg", "alt": "...", "caption": "..."}` (also `hero_image`, bleed `src`): change only `src` unless the owner gave new alt text or caption.
4. If the old file has no references left, delete it with `git rm`.
5. `python3 tools/build.py` if you edited a source of a generated page.

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
python3 tools/media.py video <source.mov> --name <base> --out assets/motion --widths <full>,<md>,<sm> --dry-run
```

Alpha is detected; `--alpha` makes it required, `--mp4-bg white` adds the opaque mp4 for an alpha clip, `--poster-at <s>` picks the poster frame. A new poster alone: `python3 tools/media.py poster <clip> --out assets/motion --name <base>`.

## D. Share images

Crawlers cache share images by URL. Write the new file as the next version, 1200 x 630 PNG: `python3 tools/media.py image <source> --preset og --name case-<slug>-v2 --out assets/og`. Then change `-v1` to `-v2` where the page names it (`src/index.html` for `cover`, the page head for `websites` and `hi`). Case pages share one pattern, `case-%s-v1.png` in the head template in `build-case.py`, so a version bump there needs a `-v2` file for all five cases (or copy the four unchanged ones to `-v2`). See [meta.md](meta.md).

## Verify

```sh
python3 tools/media.py audit        # no missing or oversized derivatives
python3 tools/check.py              # asset references resolve, pages load clean
```

Look at the page at 390 and 1440 wide (`python3 -m http.server 8000 --bind 127.0.0.1` from the repo root, or [preview.md](preview.md)). Commit the media and any reference changes together.
