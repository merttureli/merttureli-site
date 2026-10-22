---
name: images
description: Use when asked to replace, add, crop or resize a photo, render, poster, turntable clip, video or share image on merttureli.com or Studio, or when an image looks too heavy or is missing a size.
---

# Add or swap images and clips

Detail: `docs/recipes/images-swap.md` (swap) and `docs/recipes/media.md` (make derivatives).

1. Read the size of the file being replaced: `ffprobe -v error -show_entries stream=width,height -of csv=p=0 <file>`.
2. Make derivatives with the media tool (run `python3 tools/media.py --help` first): `image` for photos and renders, `video` for clips (webm/mp4 + poster), `poster` for a poster alone.
3. Same framing and aspect ratio: overwrite the old path, keep the name. Done, no code change.
4. New name or ratio: `grep -rn "old-name" --include=*.html --include=*.py --include=*.js --include=*.css --include=*.json . | grep -v -e '^./vx/' -e node_modules`, update each reference in its source (`src/index.html` or case data, not the generated page), `git rm` the old file if unused, `python3 tools/build.py` if a source changed.
5. A turntable in `assets/motion/` is a set (`-alpha.webm`, size variants, `.mp4`, `-poster.webp`): replace all with the same base name.
6. Share images: write `assets/og/<page>-v<N+1>.png` (1200 x 630) and bump the reference; never overwrite a published og URL.
7. `python3 tools/media.py audit` and `python3 tools/check.py --fast` pass. Look at the page at 390 and 1440.
8. Commit media and references together.
