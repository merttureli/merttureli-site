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

1. Read the current size: `ffprobe -v error -show_entries stream=width,height -of csv=p=0 <file>` (prints `width,height`).
2. Make the new file at the same width and height, same format: `python3 tools/media.py image <source> ...` (see `--help`).
3. Copy it over the old path. Keep the name exactly.
4. Check the page (step "Verify" below). Nothing to build: generated pages point at the file by path.

## B. New name, update references

1. Make the new file with `python3 tools/media.py image <source> ...`. Name it `<subject>-<detail>.<ext>`, lowercase, hyphens, in the folder its neighbors use (`assets/photos/<project>-photography/`, `assets/renders/<project>/`, `assets/portrait/`).
2. Find every reference to the old file:
   ```sh
   grep -rn --include=*.html --include=*.py --include=*.js --include=*.css --include=*.json "old-name" . | grep -v -e '^./vx/' -e node_modules
   ```
3. Change each reference in its source (a hit in `index.html` or `projects/` means edit `src/index.html` or the case data, see [copy.md](copy.md)). In case data a frame is a tuple `("F", "assets/photos/...jpg", "alt text", "caption", None)`: change only the path unless the owner gave new alt text or caption.
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

The sizes per clip are in `MOTION_VARIANTS` in `build-case.py`. Make the set with `python3 tools/media.py video <source> ...` and keep the same `<base>` so no reference changes.

## D. Share images

Crawlers cache share images by URL. Write the new file as the next version (`assets/og/case-<slug>-v2.png`, 1200 x 630 PNG), then change `-v1` to `-v2` where the page names it (`src/index.html` for `cover`, the page head for `websites` and `hi`). Case pages share one pattern, `case-%s-v1.png` in the head template in `build-case.py`, so a version bump there needs a `-v2` file for all five cases (or copy the four unchanged ones to `-v2`). See [meta.md](meta.md).

## Verify

```sh
python3 tools/media.py audit        # no missing or oversized derivatives
python3 tools/check.py --fast       # asset references resolve, pages load clean
```

Look at the page at 390 and 1440 wide (`python3 -m http.server 8000 --bind 127.0.0.1` from the repo root, or [preview.md](preview.md)). Commit the media and any reference changes together.
