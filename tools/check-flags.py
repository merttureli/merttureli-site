#!/usr/bin/env python3
"""
List the open copy questions left in the built pages.

A question for the owner is marked in place as
    <mark class="flag" data-flag="<block id>" data-note="<question>">text</mark>
and shows as a dotted underline (css/site-palette.css). Run this before the
site goes public: it prints every flag and exits 1 while any remain.

    python3 tools/check-flags.py

It is deliberately not part of tools/build.py --check: flags are allowed while
the copy is being reviewed.
"""
import html
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Every served page is scanned. Skipped: templates and sources (src/ holds the
# un-built copies of the same flags), tooling, docs (the catalog shows flag demos).
SKIP = ("src/", "tools/", "templates/", "docs/", "_ds/", "cards/", ".claude/", ".git/")


def pages():
    """Every .html git would commit (tracked + untracked, not ignored), minus SKIP."""
    try:
        out = subprocess.check_output(["git", "-C", ROOT, "ls-files", "-z", "--cached", "--others",
                                       "--exclude-standard", "--", "*.html"], stderr=subprocess.DEVNULL)
        found = out.decode("utf-8").split("\0")
    except (OSError, subprocess.CalledProcessError):
        found = []
        for d, dirs, names in os.walk(ROOT):
            dirs[:] = [x for x in dirs if x not in (".git", "node_modules")]
            found += [os.path.relpath(os.path.join(d, n), ROOT).replace(os.sep, "/")
                      for n in names if n.endswith(".html")]
    return sorted(set(f for f in found if f and not f.startswith(SKIP) and "node_modules/" not in f))

MARK = re.compile(r'<mark\b(?=[^>]*\bclass="[^"]*\bflag\b)([^>]*)>(.*?)</mark>', re.S)
ATTR = re.compile(r'([\w-]+)="([^"]*)"')


def text(fragment):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", fragment))).strip()


def main():
    if sys.argv[1:2] in (["-h"], ["--help"]):
        print(__doc__.strip())
        return 0
    total = 0
    for page in pages():
        path = os.path.join(ROOT, page)
        if not os.path.exists(path):
            continue
        with open(path, encoding="utf-8") as fh:
            src = fh.read()
        for m in MARK.finditer(src):
            attrs = dict(ATTR.findall(m.group(1)))
            line = src.count("\n", 0, m.start()) + 1
            total += 1
            print('%s:%d [%s] "%s"\n    %s' % (page, line, attrs.get("data-flag", "?"),
                                              text(m.group(2)), html.unescape(attrs.get("data-note", ""))))
    if total:
        print("\n%d open flag%s. Resolve each one and remove its <mark> before going public."
              % (total, "" if total == 1 else "s"))
        return 1
    print("No flags.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
