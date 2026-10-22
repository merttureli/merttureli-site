---
name: preview-site
description: Use when the owner wants to see work in progress on merttureli.com or Studio, asks for a preview, an artifact, or a link to review, or after finishing a visible change. Builds the artifact-ready copy with tools/preview.py and publishes it with the Artifact tool.
---

# Publish a preview for the owner

Detail: `docs/recipes/preview.md`.

1. Build the copy into the scratchpad and smoke it: `python3 tools/preview.py site --out <scratchpad>/site-pub --smoke --port <your port>` (or `studio --out <scratchpad>/studio-pub ...`). Plan only: `--dry-run`.
2. Read the report. Exit 2 means a reference is unresolved or a host rule is broken: fix the source, rerun. Exit 1 means the smoke found console errors or failed requests.
3. Optional look: `--serve <your port>` instead of `--smoke`; open it at 390 and 1440 (Studio also with `#reel-coaster`). Stop the server when done.
4. Open `<out>/.preview-plan.json`. Its `publish` list holds the exact Artifact calls: `file_path` (the copy's `index.html`) and the `files` map per batch.
5. Make each call with the Artifact tool, in order. Batch 1 creates the artifact; later batches go to the same `url` (files left out are kept). Do not restyle or edit the copy.
6. Give the owner the link (Studio: append `#reel-coaster` to start the showreel).

To update a preview you already published, rebuild into the same `--out` and publish batch 1 again with the artifact's `url`.
