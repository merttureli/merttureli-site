---
name: preview-site
description: Use when the owner wants to see work in progress on merttureli.com or Studio, asks for a preview, an artifact, or a link to review, or after finishing a visible change. Builds the artifact-ready copy with tools/preview.py and publishes it with the Artifact tool.
---

# Publish a preview for the owner

Detail: `docs/recipes/preview.md`.

1. Build the copy into the scratchpad: `python3 tools/preview.py site --out <scratchpad>/preview-site` (or `studio --out <scratchpad>/preview-studio`).
2. Read its report. Fix anything listed as unresolved before publishing. Note the file count, size and batch plan.
3. Optional local look: add `--serve <your port>`; open it at 390 and 1440 (Studio also with `#reel-coaster`). Kill the server when done.
4. Publish with the Artifact tool: `file_path` = `<out>/index.html`, `files` = every other file in the copy as `{"<relative path>": "<out>/<relative path>"}`. Do not restyle the copy.
5. Over 255 files or 64 MB: publish the first batch, then publish each next batch to the same `url` (files left out are kept).
6. Give the owner the link (Studio: append `#reel-coaster` to start the showreel).

Artifact rules the copy already obeys (re-check if you hand edit it): only `#hash` survives in URLs, no top-level path starting with `_`, no `.bin`/`.glb` (renamed `.wasm`), page entry `index.html` at the copy root.
