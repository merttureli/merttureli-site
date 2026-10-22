"""writing: house writing rules (check-writing.py) on every public page plus any changed HTML."""
import re
import sys

from . import Result, PASS, FAIL, sh

NAME = "writing"
TITLE = "check-writing.py on public pages + changed HTML"
MODES = {"fast", "default", "full"}

# Pages whose prose is the site's copy. Always checked: it takes under a second.
PUBLIC = ("index.html", "websites.html", "privacy.html", "404.html", "hi/index.html",
          "photography-gallery.html", "photography-lab.html", "next/index.html")
SKIP_PREFIX = ("tools/", "templates/", "src/", "node_modules/", "_ds/")


def targets(ctx):
    files = set(ctx.files())
    pages = [p for p in PUBLIC if p in files]
    pages += [f for f in files if re.match(r"projects/[^/]+\.html$", f)]
    pages += [f for f in ctx.changed() if f.endswith(".html") and not f.startswith(SKIP_PREFIX)]
    return sorted(set(pages))


def run(ctx):
    pages = targets(ctx)
    code, out = sh([sys.executable, ctx.path("check-writing.py")] + pages, cwd=ctx.root)
    m = re.search(r"^(\d+) flagged across (\d+) file", out, re.M)
    if code == 0 and m and m.group(1) == "0":
        return Result(PASS, "%s pages clean" % m.group(2))
    if not m:
        return Result(FAIL, "check-writing.py exited %d" % code, out.splitlines()[-30:])
    hits = [l for l in out.splitlines() if l.strip() and not l.rstrip().endswith(" clean")]
    dirty = [l.split()[0] for l in hits if re.match(r"^\S+\s+\d+$", l)]
    return Result(FAIL, "%s hits in %s" % (m.group(1), ", ".join(dirty)),
                  hits[:60] + ["Rules and reasons: the TICS list at the top of check-writing.py."])
