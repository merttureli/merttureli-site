---
name: images
description: Use when asked to replace, add, crop or resize a photo, render, poster, turntable clip, video or share image on merttureli.com or Studio, or when an image looks too heavy or is missing a size.
---

# Add or swap images and clips

Detail: `docs/recipes/images-swap.md` (swap) and `docs/recipes/media.md` (make derivatives).

1. Which image? "Card image" and "hero image" differ per surface (case page, home tile): "What the owner's words mean" in `docs/recipes/content.md`. Read the file being replaced and the source: `python3 tools/media.py info <file>`. A source narrower than the preset gives fewer files, named by their real width (a 520 px photo with `--preset card` gives one `<base>-520.webp`).
2. Make derivatives (add `--dry-run` first):
   - image: `python3 tools/media.py image <src> --out <folder> --name <base> --preset <set> --page <page> --alt "..."` (`presets` lists sets; exact size instead: `--widths W --aspect W:H --format jpg --no-suffix`).
   - clip: `python3 tools/media.py video <src> --name <base> --out assets/motion` (webm sizes, mp4, poster).
   - poster only: `python3 tools/media.py poster <clip> --out <folder> --name <base>`.
   Paste the snippet it prints when adding new media.
3. Same framing and aspect ratio: overwrite the old path, keep the name. Done, no code change.
4. New name or ratio (a case card image is also named in `PRESENT` of `tools/build-studio-cases.py`): `grep -rn "old-name" --include=*.html --include=*.py --include=*.js --include=*.css --include=*.json . | grep -v -e '^./vx/' -e node_modules`, update each reference in its source (`next/index.html`, `next/websites.html`, `content/projects/<slug>.json` or `tools/build-studio-cases.py`, not the generated page), `git rm` the old file only if grep finds no reference (studies/ and docs/ hits count), `python3 tools/build.py` if a source changed.
5. A turntable in `assets/motion/` is a set (`-alpha.webm`, size variants, `.mp4`, `-poster.webp`): replace all with the same base name.
6. Share images: write `assets/og/<page>-v<N+1>.png` (1200 x 630) and bump the reference; never overwrite a published og URL.
7. `python3 tools/media.py audit` and `python3 tools/check.py` pass. Look at the page at 390 and 1440: `python3 tools/check.py --only smoke --pages <page> --out <scratchpad>/swap` writes PNGs to `<scratchpad>/swap/smoke/`.
8. Commit media and references together.
