"""flags: open copy questions (<mark class="flag">) left in the built pages (tools/check-flags.py).

Open flags are expected while the copy is in review, so they are a WARN.
With --public they FAIL: nothing goes public with a flag in it.
"""
import re
import sys

from . import Result, PASS, WARN, FAIL, sh, tail

NAME = "flags"
TITLE = "open copy flags (fatal only with --public)"
MODES = {"fast", "default", "full"}


def run(ctx):
    code, out = sh([sys.executable, ctx.path("tools/check-flags.py")], cwd=ctx.root)
    if code == 0:
        return Result(PASS, "no open flags")
    m = re.search(r"^(\d+) open flags?\.", out, re.M)
    if not m:
        return Result(FAIL, "tools/check-flags.py exited %d" % code, tail(out, 40))
    n = int(m.group(1))
    where = {}
    for line in out.splitlines():
        hit = re.match(r"^(\S+?):\d+ \[", line)
        if hit:
            where[hit.group(1)] = where.get(hit.group(1), 0) + 1
    summary = "%d open (%s)" % (n, ", ".join("%s %d" % kv for kv in sorted(where.items())))
    details = out.rstrip().splitlines() if ctx.verbose or ctx.public else [
        "List them: python3 tools/check-flags.py   (recipe: docs/recipes/flags.md)"]
    return Result(FAIL if ctx.public else WARN, summary, details)


