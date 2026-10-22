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
import glob
import html
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGES = ["index.html", "websites.html", "privacy.html", "404.html", "hi/index.html",
         "photography-gallery.html", "photography-lab.html"] + sorted(
    os.path.relpath(p, ROOT) for p in glob.glob(os.path.join(ROOT, "projects", "*.html")))

MARK = re.compile(r'<mark\b(?=[^>]*\bclass="[^"]*\bflag\b)([^>]*)>(.*?)</mark>', re.S)
ATTR = re.compile(r'([\w-]+)="([^"]*)"')


def text(fragment):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", fragment))).strip()


def main():
    total = 0
    for page in PAGES:
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
