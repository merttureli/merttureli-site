---
name: verify-site
description: Use before every commit to merttureli-site, after any edit to a page, CSS, JS, generator, content or asset, and whenever asked "did anything break?". Runs the one command that proves the site still builds, links resolve and pages load clean.
---

# Verify the site

Detail: `docs/recipes/checks.md`.

1. If you edited `src/index.html` or `content/`: `python3 tools/build.py` first.
2. `python3 tools/check.py` (about a minute: build, writing, flags, links, JS, JSON, robots, browser smoke). Read the summary table; fix every FAIL. WARN for open flags is expected. `--fast` (seconds) skips build and smoke: use it only while iterating.
3. Changed something visible on purpose (an image swap, a new section)? Look at it at 390 and 1440 wide: `python3 tools/check.py --only smoke --pages <page> --out <scratchpad>/check` writes PNGs to `<scratchpad>/check/smoke/`.
4. Changed CSS, JS or a generator? `python3 tools/check.py --full --out <scratchpad>/check` (every case page and lab page in the smoke, plus visual regress against HEAD on the site and `next/index.html`; slow, run it once). If the change is meant to show on a page, add `--expect-change <page>`; any other differing screen still FAILs and is listed with its diff PNG. A `visual` row reading NOT RUN means the pixels were not checked: do what it says before calling the change proven.
5. Going public? `python3 tools/check.py --public` (open flags become fatal).
6. Run one check alone with `--only NAME` (names in `python3 tools/check.py --help`).
