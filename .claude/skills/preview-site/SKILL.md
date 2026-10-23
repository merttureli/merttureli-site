---
name: preview-site
description: Use when the owner wants to see work in progress on merttureli.com or Studio, asks for a preview, an artifact, or a link to review, or after finishing a visible change. Builds the artifact-ready copy with tools/preview.py and publishes it with the Artifact tool.
---

# Publish a preview for the owner

Detail: `docs/recipes/preview.md`.

1. Build the copy into the scratchpad (never inside the repo) and smoke it: `python3 tools/preview.py site --out <scratchpad>/site-pub --smoke --port <your port>` (or `studio --out <scratchpad>/studio-pub ...`). Plan only: `--dry-run`.
2. Read the report. Unresolved references and `?query` links are listed: fix the source and rerun (`--strict` makes unresolved references exit 2). Exit 1: the smoke found console errors or failed requests. Exit 2: bad input or a host rule broke.
3. Optional look: `--serve <your port>` instead of `--smoke`; open it at 390 and 1440 (Studio also with `#reel-coaster`). Stop the server when done.
4. Open `<out>/.preview-plan.json` (or rerun with `--json`). Its `publish` list holds the exact Artifact calls, each with `file_path`, `root` and `files`.
5. Call 1: the Artifact tool with `file_path`, `root`, `files` and an `icon`; it returns the `url`. Calls 2 and later: the same plus that `url`. Do not restyle or edit the copy.
6. Give the owner the link (Studio: append `#reel-coaster` to start the showreel).

Update an existing preview: rebuild into the same `--out`, then repeat every call in the plan with the artifact's `url`.
