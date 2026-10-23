"""build: the committed live pages (index.html, websites.html, projects/*.html) and next/projects/*.html
match their Studio sources (tools/build.py --check)."""
import sys

from . import Result, PASS, FAIL, sh, tail

NAME = "build"
TITLE = "generated pages match their next/ and content/ sources"
MODES = {"default", "full"}


def run(ctx):
    code, out = sh([sys.executable, ctx.path("tools/build.py"), "--check"], cwd=ctx.root)
    differs = [l[len("DIFFERS: "):] for l in out.splitlines() if l.startswith("DIFFERS: ")]
    oks = sum(1 for l in out.splitlines() if l.startswith("ok: "))
    if code == 0:
        return Result(PASS, "%d generated files identical" % oks)
    if differs:
        return Result(FAIL, "differs: " + ", ".join(differs),
                      ["Fix: edit next/, content/projects/ or tools/build-studio-cases.py (never the output), "
                       "then run python3 tools/build.py and commit source and output together."]
                      + tail(out, 40))
    return Result(FAIL, "tools/build.py --check exited %d" % code, tail(out, 40))


