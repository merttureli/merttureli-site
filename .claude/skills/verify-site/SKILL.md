---
name: verify-site
description: Use before every commit to merttureli-site, after any edit to a page, CSS, JS, generator, content or asset, and whenever asked "did anything break?". Runs the one command that proves the site still builds, links resolve and pages load clean.
---

# Verify the site

Detail: `docs/recipes/checks.md`.

1. If you edited `src/index.html`, case data or `content/`: `python3 tools/build.py` first. Never `python3 tools/build.py --help` (no help flag; it runs a full build).
2. `python3 tools/check.py --fast` (about a minute). Read the summary table; fix every FAIL.
3. Changed something visible on purpose? Look at it at 390 and 1440 wide.
4. Changed CSS, JS or a generator and the page must look the same? `python3 tools/check.py --full` (adds visual regress against HEAD; slow, run it once).
5. Going public? `python3 tools/check.py --public` (open flags become fatal).
6. Run one check alone with `--only NAME` (names in `python3 tools/check.py --help`).
