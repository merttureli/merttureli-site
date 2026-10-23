"""json: every .json/.webmanifest file and every inline JSON <script> (ld+json, importmap) parses."""
import json
import re

from . import Result, PASS, FAIL

NAME = "json"
TITLE = "JSON files and inline JSON scripts parse"
MODES = {"fast", "default", "full"}

INLINE = re.compile(r'<script\b[^>]*\btype\s*=\s*["\']?(application/(?:ld\+)?json|importmap)["\']?[^>]*>(.*?)</script>',
                    re.S | re.I)


def run(ctx):
    bad = []
    files = ctx.site_files((".json", ".webmanifest")) + [
        f for f in ctx.files() if f.startswith("tools/") and f.endswith(".json") and "node_modules/" not in f]
    n = 0
    for f in sorted(set(files)):
        n += 1
        try:
            with open(ctx.path(f), "rb") as fh:
                json.loads(fh.read().decode("utf-8-sig"))
        except (ValueError, UnicodeDecodeError) as e:
            bad.append("%s: %s" % (f, e))
    blocks = 0
    for f in ctx.site_files((".html",)):
        src = open(ctx.path(f), encoding="utf-8", errors="replace").read()
        for m in INLINE.finditer(src):
            blocks += 1
            body = m.group(2).strip()
            if not body:
                continue
            try:
                json.loads(body)
            except ValueError as e:
                line = src.count("\n", 0, m.start(2)) + 1
                bad.append("%s:%d inline %s: %s" % (f, line, m.group(1), e))
    summary = "%d files, %d inline blocks" % (n, blocks)
    if bad:
        return Result(FAIL, "%d invalid (%s)" % (len(bad), summary), bad)
    return Result(PASS, summary)
