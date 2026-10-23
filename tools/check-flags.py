#!/usr/bin/env python3
"""
List the open copy questions left in the built pages.

A question for the owner is marked in place as
    <mark class="flag" data-flag="<block id>" data-note="<question>">text</mark>
and shows as a dotted underline (css/site-palette.css). Run this before the
site goes public: it prints every flag and exits 1 while any remain.

    python3 tools/check-flags.py                       # list them, exit 1 while any remain
    python3 tools/check-flags.py --next-id rudder-pedals  # next free id, e.g. rudder-pedals-036

It is deliberately not part of tools/build.py --check: flags are allowed while
the copy is being reviewed.
"""
import os
import re
import subprocess
import sys
from html.parser import HTMLParser

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

class Flags(HTMLParser):
    """Collect <mark class="flag"> elements with a real HTML parser, so a note
    that contains < or > (or markup nested inside the mark) parses correctly."""

    def __init__(self):
        HTMLParser.__init__(self, convert_charrefs=True)
        self.found = []    # (line, id, text, note)
        self.open = None   # [line, attrs, text parts, depth of nested marks]

    def handle_starttag(self, tag, attrs):
        if tag != "mark":
            return
        if self.open:
            self.open[3] += 1
            return
        a = dict((k, v or "") for k, v in attrs)
        if "flag" in a.get("class", "").split():
            self.open = [self.getpos()[0], a, [], 0]

    def handle_endtag(self, tag):
        if tag != "mark" or not self.open:
            return
        if self.open[3]:
            self.open[3] -= 1
            return
        line, a, parts, _ = self.open
        self.found.append((line, a.get("data-flag", "?"), re.sub(r"\s+", " ", "".join(parts)).strip(),
                           a.get("data-note", "")))
        self.open = None

    def handle_data(self, data):
        if self.open:
            self.open[2].append(data)


def flags_in(src):
    parser = Flags()
    parser.feed(src)
    parser.close()
    return parser.found


def next_id(prefix):
    """The next free <prefix>-NNN flag id across sources and built pages."""
    rx = re.compile(r'(?:data-flag="|"flag":\s*")%s-(\d+)"' % re.escape(prefix))
    files = [os.path.join(ROOT, p) for p in pages()] + [os.path.join(ROOT, "src", "index.html")]
    for d, _, names in os.walk(os.path.join(ROOT, "content")):
        files += [os.path.join(d, n) for n in names if n.endswith(".json")]
    used = []
    for path in files:
        if os.path.exists(path):
            with open(path, encoding="utf-8") as fh:
                used += [int(n) for n in rx.findall(fh.read())]
    return "%s-%03d" % (prefix, max(used) + 1 if used else 1), sorted(set(used))


def main():
    args = sys.argv[1:]
    if args[:1] in (["-h"], ["--help"]):
        print(__doc__.strip())
        return 0
    if args[:1] == ["--next-id"]:
        if len(args) != 2 or not re.match(r"^[a-z0-9]+(-[a-z0-9]+)*$", args[1]):
            print("usage: python3 tools/check-flags.py --next-id <page or slug>, e.g. --next-id rudder-pedals",
                  file=sys.stderr)
            return 2
        nid, used = next_id(args[1])
        print(nid)
        print("(in use: %s)" % (", ".join("%03d" % n for n in used) or "none"), file=sys.stderr)
        return 0
    if args:
        print("unknown argument %s (see --help)" % args[0], file=sys.stderr)
        return 2
    total = 0
    for page in pages():
        path = os.path.join(ROOT, page)
        if not os.path.exists(path):
            continue
        with open(path, encoding="utf-8") as fh:
            src = fh.read()
        for line, fid, text, note in flags_in(src):
            total += 1
            print('%s:%d [%s] "%s"\n    %s' % (page, line, fid, text, note))
    if total:
        print("\n%d open flag%s. Resolve each one and remove its <mark> before going public."
              % (total, "" if total == 1 else "s"))
        return 1
    print("No flags.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
