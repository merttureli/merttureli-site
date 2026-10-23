---
name: verify-site
description: Use before every commit to merttureli-site, after any edit to a page, CSS, JS, generator, content or asset, and whenever asked "did anything break?". Runs the one command that proves the site still builds, links resolve and pages load clean.
---

# Verify the site

Detail: `docs/recipes/checks.md`.

1. If you edited `src/index.html` or `content/`: `python3 tools/build.py` first.
2. `python3 tools/check.py` (about a minute: build, writing, flags, links, JS, JSON, robots, browser smoke). Read the summary table; fix every FAIL. WARN for open flags is expected. `--fast` (seconds) skips build and smoke: use it only while iterating.
3. Changed something visible on purpose? Look at it at 390 and 1440 wide.
4. Changed CSS, JS or a generator and the page must look the same? `python3 tools/check.py --full` (every case page in the smoke plus visual regress against HEAD; slow, run it once). Keep its report with `--out <scratchpad>/check`.
5. Going public? `python3 tools/check.py --public` (open flags become fatal).
6. Run one check alone with `--only NAME` (names in `python3 tools/check.py --help`).
