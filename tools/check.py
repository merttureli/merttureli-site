#!/usr/bin/env python3
"""
One command that proves nothing broke. Run it before every commit.

    python3 tools/check.py              # default: static checks + build + browser smoke (about a minute)
    python3 tools/check.py --fast       # static checks only, no browser (a few seconds)
    python3 tools/check.py --full       # default + every case study and lab page in the smoke + visual-regress vs HEAD
    python3 tools/check.py --full --expect-change next/index.html   # that page is meant to look different
    python3 tools/check.py --only links,js       # just these (any mode, visual included)
    python3 tools/check.py --skip smoke
    python3 tools/check.py --public     # open copy flags become fatal: use before going public
    python3 tools/check.py --list       # what each check does

Checks (modes in brackets):
    build    [default full]       tools/build.py --check: generated pages match their sources
    writing  [fast default full]  check-writing.py on public pages + changed HTML
    flags    [fast default full]  tools/check-flags.py; WARN (FAIL with --public)
    links    [fast default full]  internal links and asset references resolve and will deploy
    js       [fast default full]  node --check on every JS file and inline script
    json     [fast default full]  JSON files and inline JSON scripts parse
    robots   [fast default full]  noindex on next/ studies/ docs/, robots.txt, sitemap
    tokens   [fast default full]  CSS changed vs --base is a pure token rename (WARN if values move)
    smoke    [default full]       headless Chromium at 390+1440: console errors, failed requests
                                  (and window.labReport on next/lab pages that set it)
    visual   [full]               tools/visual-regress vs --base (pixels + gates), site pages in
                                  both palettes and next/index.html; lists the screens that differ

Exit status: 0 when nothing FAILs (WARN and SKIP are fine; read them), 1 when a check
FAILs, 2 on a usage error. Details for each WARN/FAIL print under the table.
The helpers live in tools/checks/; the recipe is docs/recipes/checks.md.
"""
import argparse
import concurrent.futures
import json
import os
import sys
import time
import traceback

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from checks import Context, Result, ROOT, PASS, WARN, FAIL, SKIP  # noqa: E402
from checks import build, writing, flags, links, jssyntax, jsonfiles, robots, tokens, smoke, visual  # noqa: E402

CHECKS = [build, writing, flags, links, jssyntax, jsonfiles, robots, tokens, smoke, visual]
HEAVY = {"build", "smoke", "visual"}
COLOR = {PASS: "32", WARN: "33", FAIL: "31", SKIP: "90"}


def names(values):
    out = []
    for v in values or []:
        out += [x.strip() for x in v.split(",") if x.strip()]
    return out


def parse(argv):
    p = argparse.ArgumentParser(
        prog="python3 tools/check.py", description=__doc__.strip(),
        formatter_class=argparse.RawDescriptionHelpFormatter)
    mode = p.add_mutually_exclusive_group()
    mode.add_argument("--fast", action="store_true", help="static checks only, no browser")
    mode.add_argument("--full", action="store_true", help="add all case studies to the smoke and visual-regress")
    p.add_argument("--only", action="append", metavar="NAME[,NAME]", help="run only these checks (ignores the mode)")
    p.add_argument("--skip", action="append", metavar="NAME[,NAME]", help="leave these checks out")
    p.add_argument("--public", action="store_true", help="open copy flags FAIL instead of WARN")
    p.add_argument("--base", default="HEAD", metavar="REF",
                   help="git ref for 'changed' files and the visual baseline (default HEAD)")
    p.add_argument("--pages", metavar="LIST", help="comma list of pages for smoke/visual, e.g. index.html,next/#reel-coaster")
    p.add_argument("--expect-change", action="append", metavar="PAGE[,PAGE]",
                   help="visual: diffs on these pages are intended (listed as CHANGED, not FAIL), e.g. next/index.html")
    p.add_argument("--port", type=int, default=0, help="port for the smoke server (default: any free port)")
    p.add_argument("--out", metavar="DIR", help="keep smoke screenshots and the visual report here")
    p.add_argument("--json", metavar="FILE", help="also write the results as JSON")
    p.add_argument("-v", "--verbose", action="store_true", help="print details for passing checks too, untrimmed")
    p.add_argument("--list", action="store_true", help="list the checks and exit")
    p.add_argument("--no-color", action="store_true", help="plain output")
    return p.parse_args(argv)


def paint(text, status, on):
    return "\033[%sm%s\033[0m" % (COLOR[status], text) if on else text


def main(argv=None):
    a = parse(sys.argv[1:] if argv is None else argv)
    by_name = dict((c.NAME, c) for c in CHECKS)
    if a.list:
        for c in CHECKS:
            print("%-8s %-22s %s" % (c.NAME, "[" + " ".join(m for m in ("fast", "default", "full") if m in c.MODES) + "]",
                                     c.TITLE))
        return 0
    mode = "fast" if a.fast else "full" if a.full else "default"
    only, skip = names(a.only), names(a.skip)
    unknown = [n for n in only + skip if n not in by_name]
    if unknown:
        print("unknown check: %s (known: %s)" % (", ".join(unknown), ", ".join(by_name)), file=sys.stderr)
        return 2
    selected = [c for c in CHECKS if (c.NAME in only if only else mode in c.MODES) and c.NAME not in skip]
    if a.out:
        a.out = os.path.abspath(a.out)
        os.makedirs(a.out, exist_ok=True)
    ctx = Context(root=ROOT, mode=mode, public=a.public, base=a.base, port=a.port, verbose=a.verbose,
                  out=a.out, pages=names([a.pages]) if a.pages else None, expect=names(a.expect_change))
    color = sys.stdout.isatty() and not a.no_color and os.environ.get("NO_COLOR") is None

    print("tools/check.py: %s mode, %d checks: %s" % (mode if not only else "--only", len(selected),
                                                       " ".join(c.NAME for c in selected)), flush=True)
    results = {}

    def go(c):
        t0 = time.time()
        try:
            r = c.run(ctx)
        except Exception:
            r = Result(FAIL, "check crashed (bug in tools/checks/%s.py)" % c.__name__.split(".")[-1],
                       traceback.format_exc().splitlines())
        r.seconds = time.time() - t0
        print("  %s %-8s %5.1fs  %s" % (paint("%-4s" % r.status, r.status, color), c.NAME, r.seconds, r.summary), flush=True)
        return c.NAME, r

    started = time.time()
    light = [c for c in selected if c.NAME not in HEAVY]
    heavy = [c for c in selected if c.NAME in HEAVY]
    # heavy checks (browsers) start first and run side by side with the quick ones
    with concurrent.futures.ThreadPoolExecutor(max(1, min(len(selected), 3))) as pool:
        for name, r in pool.map(go, heavy + light):
            results[name] = r
    total = time.time() - started

    print("\n%-8s  %-4s  %6s  %s" % ("check", "", "time", "result"))
    print("-" * 78)
    for c in selected:
        r = results[c.NAME]
        print("%-8s  %s  %5.1fs  %s" % (c.NAME, paint("%-4s" % r.status, r.status, color), r.seconds, r.summary))
    print("-" * 78)
    counts = dict((s, sum(1 for r in results.values() if r.status == s)) for s in (PASS, WARN, FAIL, SKIP))
    print("%d pass, %d warn, %d fail, %d skip in %.0fs" % (counts[PASS], counts[WARN], counts[FAIL], counts[SKIP], total))

    for c in selected:
        r = results[c.NAME]
        if not r.details or (r.status == PASS and not a.verbose):
            continue
        print("\n== %s: %s" % (c.NAME, paint(r.status, r.status, color)))
        lines = r.details if a.verbose else r.details[:40]
        for line in lines:
            print("   " + line)
        if len(r.details) > len(lines):
            print("   ... %d more (run with -v, or --only %s -v)" % (len(r.details) - len(lines), c.NAME))

    if a.json:
        with open(a.json, "w", encoding="utf-8") as fh:
            json.dump({"mode": mode, "seconds": round(total, 1), "checks": [
                {"name": c.NAME, "status": results[c.NAME].status, "summary": results[c.NAME].summary,
                 "seconds": round(results[c.NAME].seconds, 1), "details": results[c.NAME].details}
                for c in selected]}, fh, indent=2)
    vis = results.get("visual")
    if vis and vis.status in (WARN, SKIP) and vis.summary.startswith("NOT RUN"):
        print("\nNOTE: visual did not run, so this run does NOT prove the pages look the same. "
              "Fix: cd tools/visual-regress && npm install")
    if counts[FAIL]:
        if vis and vis.status == FAIL and not any(results[n].status == FAIL for n in results if n != "visual"):
            print("\nFAIL: screens differ (listed under == visual). Open the diff images; if every change is "
                  "intended, rerun with --expect-change PAGE[,PAGE].")
        else:
            print("\nFAIL: fix the items above, then run python3 tools/check.py again.")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
