"""transition: what is still in the old design (docs/transition.md). Soft: WARN only, never FAIL.

Reads the "- " lines under "## Open" in docs/transition.md. Each line is one item; the
backticked paths before "Done when" are what it covers. WARNs with every open item, and
separately when a live page (index.html, websites.html, projects/*.html) has a link
(<a href>) to a page an item covers, so the old page stays visible. Done with an item:
delete its line. No list or an empty list: PASS.
"""
import os
import posixpath
import re

from . import Result, PASS, WARN

NAME = "transition"
TITLE = "old-design items still to move to the Studio (soft)"
MODES = {"fast", "default", "full"}

LIST = "docs/transition.md"
LIVE = re.compile(r"^(?:index\.html|websites\.html|projects/[^/]+\.html)$")
HREF = re.compile(r"""<a\b[^>]*?\shref=["']([^"'#?]+)""", re.I)


def items(text):
    """[(line, paths, summary)] for every '- ' line under '## Open'."""
    out, on = [], False
    for n, line in enumerate(text.splitlines(), 1):
        if line.startswith("## "):
            on = line.strip().lower() == "## open"
            continue
        if on and line.startswith("- "):
            head = line.split("Done when", 1)[0]
            out.append((n, re.findall(r"`([^`]+)`", head), re.sub(r"`", "", line[2:]).strip()))
    return out


def run(ctx):
    path = ctx.path(LIST)
    if not os.path.isfile(path):
        return Result(PASS, "%s not found: nothing tracked" % LIST)
    found = items(open(path, encoding="utf-8").read())
    if not found:
        return Result(PASS, "nothing left in the old design")
    files = set(ctx.files())
    covered = {}   # repo path or folder prefix -> item line
    for n, paths, _ in found:
        for p in paths:
            p = p.strip()
            if p in files or (p.endswith("/") and any(f.startswith(p) for f in files)):
                covered[p] = n
    details = ["%s:%d  %s" % (LIST, n, summary) for n, _, summary in found]
    links = []
    for page in sorted(f for f in files if LIVE.match(f)):
        text = open(ctx.path(page), encoding="utf-8", errors="replace").read()
        for href in sorted(set(HREF.findall(text))):
            if re.match(r"^[a-z][a-z0-9+.-]*:|^//", href, re.I):
                continue
            target = posixpath.normpath(href.lstrip("/") if href.startswith("/")
                                        else posixpath.join(posixpath.dirname(page), href))
            if href.endswith("/") or target == ".":
                target = "index.html" if target == "." else posixpath.join(target, "index.html")
            if not target.endswith((".html", ".htm")):
                continue
            hit = next((p for p in covered if target == p or (p.endswith("/") and target.startswith(p))), None)
            if hit:
                links.append("live page %s links to %s (still old design, %s:%d)" % (page, target, LIST, covered[hit]))
    summary = "%d open item%s" % (len(found), "" if len(found) == 1 else "s")
    if links:
        summary += ", %d live link%s to old pages" % (len(links), "" if len(links) == 1 else "s")
    return Result(WARN, summary + " (soft, see %s)" % LIST, links + details)
