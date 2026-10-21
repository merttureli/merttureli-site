#!/usr/bin/env python3
"""
Build the served pages from their sources.

    python3 tools/build.py            # rebuild everything
    python3 tools/build.py --check    # rebuild into a temp dir, diff against the
                                      # committed pages, exit 1 on any difference
    python3 tools/build.py --serve    # preview the runtime templates on :8000

Sources (edit these):
    src/index.html       the home page, an <x-dc> runtime template
    build-case.py        the case studies, as data; writes src/projects/*.html

Output (commit these, never edit them by hand):
    index.html, projects/*.html   static HTML rendered from src/ in Chromium by
                                  tools/prerender/prerender.js

Step 1 runs build-case.py. Step 2 loads each template in headless Chromium,
lets the design-system runtime render it, and writes the rendered page with
the runtime removed. Needs Node and Playwright with Chromium:

    cd tools/prerender && npm install && npx playwright install chromium

The committed output was rendered with the Playwright version pinned in
tools/prerender/package.json. A different Chromium can serialise inline styles
slightly differently, which --check reports as a difference.
"""

import difflib
import functools
import http.server
import io
import os
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "src")
PRERENDER = os.path.join(ROOT, "tools", "prerender", "prerender.js")


def pages():
    cases = sorted(f for f in os.listdir(os.path.join(SRC, "projects")) if f.endswith(".html"))
    return ["index.html"] + ["projects/" + f for f in cases]


def run(cmd):
    print("$ " + " ".join(cmd), flush=True)
    return subprocess.call(cmd, cwd=ROOT)


def prerender(out_dir):
    return run(["node", PRERENDER, "--root", ROOT, "--out", out_dir])


def check():
    status = run([sys.executable, os.path.join(ROOT, "build-case.py"), "--check"])
    tmp = tempfile.mkdtemp(prefix="build-check-")
    try:
        if prerender(tmp):
            return 1
        for page in pages():
            new = io.open(os.path.join(tmp, page), encoding="utf-8").read().splitlines(True)
            committed = os.path.join(ROOT, page)
            old = io.open(committed, encoding="utf-8").read().splitlines(True) if os.path.exists(committed) else []
            diff = list(difflib.unified_diff(old, new, page, "rendered " + page))
            if diff:
                status = 1
                sys.stdout.writelines(diff[:200])
                print("DIFFERS: " + page)
            else:
                print("ok: " + page)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    if status:
        print("The committed pages do not match their sources. Run python3 tools/build.py and commit.")
    return status


class Preview(http.server.SimpleHTTPRequestHandler):
    """Serves the repo, with /index.html and /projects/*.html taken from src/."""

    def translate_path(self, path):
        clean = path.split("?", 1)[0].split("#", 1)[0]
        if clean in ("/", "/index.html"):
            return os.path.join(SRC, "index.html")
        if clean.startswith("/projects/") and os.path.exists(os.path.join(SRC, clean.lstrip("/"))):
            return os.path.join(SRC, clean.lstrip("/"))
        return super().translate_path(path)


def serve(port=8000):
    handler = functools.partial(Preview, directory=ROOT)
    print("previewing the runtime templates on http://127.0.0.1:%d/" % port)
    http.server.ThreadingHTTPServer(("127.0.0.1", port), handler).serve_forever()


def main():
    args = sys.argv[1:]
    if "--check" in args:
        return check()
    if "--serve" in args:
        port = args[args.index("--serve") + 1] if len(args) > args.index("--serve") + 1 else "8000"
        return serve(int(port))
    if run([sys.executable, os.path.join(ROOT, "build-case.py")]):
        return 1
    return prerender(ROOT)


if __name__ == "__main__":
    sys.exit(main())
