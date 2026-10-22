#!/bin/sh
# Rebuild the hero rocket's assets. Run from the repo root.
#   ESBUILD=/path/to/esbuild sh tools/rocket-hero/build.sh
# 1. model:  python3 -I tools/rocket-hero/cut_model.py   (from the explorer's assembly)
# 2. bundle: three.js comes from the explorer's vendored copy, so both draw with the same build.
# 3. bake:   serve the repo, then node tools/rocket-hero/bake-run.js --port PORT and convert the
#            PNGs to webp (livery lossless; still q88 and line q90 with full alpha).
set -e
"${ESBUILD:-esbuild}" tools/rocket-hero/src/live.js --bundle --format=esm --minify --target=es2020 \
  --alias:three=./assets/charger-explorer/vendor/three.module.js \
  --legal-comments=none --outfile=assets/rocket/rocket-live.js
