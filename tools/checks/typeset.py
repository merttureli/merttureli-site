"""typeset: one sentence, heading, label or line gets one font, one style and one color.

FAILs when an inline style switch sits inside running text on a live or next/ page:
an <em> or <i>, a <span> with a font or color class (a class whose CSS sets
font-family, font-style, font or color, plus .serif), or any element with an inline
style="color|font-family|font-style|font" whose nearest text element (h1-h6, p, li,
dt, dd, figcaption, a) has words of its own around it. "The <em class="serif">lineup</em>"
fails; a card link made only of separate label, name and line spans does not.

Allowed:
  class="co"      a company name in italic serif, the owner's one approved exception
  data-type-ok    on the element or an ancestor: a deliberate, reviewed exception
Not scanned: elements outside any text element (the hero's floating words).

ALLOW below is temporary: areas other passes own report as WARN instead of FAIL.
Rule and reasons: docs/design/studio.md ("One sentence, one voice").
"""
import fnmatch
import glob
import os
import re
from html.parser import HTMLParser

from . import Result, PASS, WARN, FAIL

NAME = "typeset"
TITLE = "no font, style or color switch inside a sentence (live + next/ pages)"
MODES = {"fast", "default", "full"}

PAGES = ("index.html", "websites.html", "beyond.html", "privacy.html", "404.html", "hi/index.html",
         "photography-gallery.html", "photography-lab.html", "next/index.html", "next/websites.html",
         "next/beyond.html",
         "projects/*.html", "next/projects/*.html")
CSS = ("next/css/*.css", "css/*.css")
TEXT = {"h1", "h2", "h3", "h4", "h5", "h6", "p", "li", "dt", "dd", "figcaption", "a"}
VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param",
        "source", "track", "wbr"}
ALWAYS_FONT = {"serif"}
EXEMPT_CLASS = {"co"}
STYLE = re.compile(r"(?:^|;)\s*(?:color|font-family|font-style|font)\s*:", re.I)

# Temporary: (page glob, ancestor class or None for the whole page, note). Hits there WARN.
ALLOW = []


class Node(object):
    __slots__ = ("tag", "attrs", "parent", "kids", "line", "classes")

    def __init__(self, tag, attrs, parent, line):
        self.tag, self.attrs, self.parent, self.line = tag, dict(attrs), parent, line
        self.kids = []   # Node or str, in order
        self.classes = set((self.attrs.get("class") or "").split())

    def text(self):
        return "".join(k if isinstance(k, str) else k.text() for k in self.kids)

    def own_words(self):
        return any(isinstance(k, str) and k.strip() for k in self.kids)


class Tree(HTMLParser):
    def __init__(self):
        HTMLParser.__init__(self, convert_charrefs=True)
        self.root = Node("#root", [], None, 0)
        self.cur = self.root
        self.raw = 0   # inside <script>/<style>

    def handle_starttag(self, tag, attrs):
        node = Node(tag, attrs, self.cur, self.getpos()[0])
        self.cur.kids.append(node)
        if tag in ("script", "style"):
            self.raw += 1
        if tag not in VOID:
            self.cur = node

    def handle_startendtag(self, tag, attrs):
        self.cur.kids.append(Node(tag, attrs, self.cur, self.getpos()[0]))

    def handle_endtag(self, tag):
        if tag in ("script", "style") and self.raw:
            self.raw -= 1
        n = self.cur
        while n is not None and n.tag != tag:
            n = n.parent
        if n is not None and n.parent is not None:
            self.cur = n.parent

    def handle_data(self, data):
        if not self.raw:
            self.cur.kids.append(data)


def font_classes(ctx):
    """Classes whose rules set a face, a style or a color."""
    out = set(ALWAYS_FONT)
    for pattern in CSS:
        for path in glob.glob(ctx.path(pattern)):
            css = re.sub(r"/\*.*?\*/", "", open(path, encoding="utf-8", errors="replace").read(), flags=re.S)
            for sel, body in re.findall(r"([^{}]+)\{([^{}]*)\}", css):
                if not re.search(r"(?:^|;)\s*(?:color|font-family|font-style|font)\s*:", body):
                    continue
                for one in sel.split(","):
                    last = re.split(r"[\s>+~]+", one.strip())[-1] if one.strip() else ""
                    out.update(re.findall(r"\.([A-Za-z0-9_-]+)", re.sub(r":[a-z-]+\([^)]*\)", "", last)))
    return out - EXEMPT_CLASS


def walk(node):
    for k in node.kids:
        if not isinstance(k, str):
            yield k
            for d in walk(k):
                yield d


def switch(node, fonts):
    """Why node switches type inline, or None."""
    if node.tag in ("em", "i"):
        return "<%s%s>" % (node.tag, ' class="%s"' % node.attrs["class"] if node.attrs.get("class") else "")
    if node.tag == "span" and node.classes & fonts:
        return '<span class="%s">' % " ".join(sorted(node.classes & fonts))
    if STYLE.search(node.attrs.get("style") or ""):
        return '<%s style="%s">' % (node.tag, node.attrs.get("style"))
    return None


def mid_text(node):
    """The nearest text element if node sits among other words in it, else None."""
    n, mixed = node.parent, False
    while n is not None and n.tag != "#root":
        mixed = mixed or n.own_words()
        if n.tag in TEXT:
            return n if mixed else None
        n = n.parent
    return None


def exempt(node):
    n = node
    while n is not None:
        if "data-type-ok" in n.attrs or n.classes & EXEMPT_CLASS:
            return True
        n = n.parent
    return False


def allowed(page, node):
    for pat, cls, note in ALLOW:
        if not fnmatch.fnmatch(page, pat):
            continue
        if cls is None:
            return note
        n = node
        while n is not None:
            if cls in n.classes:
                return note
            n = n.parent
    return None


def pages(ctx):
    files = set(ctx.files())
    out = []
    for p in PAGES:
        out += [f for f in sorted(files) if fnmatch.fnmatch(f, p)]
    return list(dict.fromkeys(out))


def run(ctx):
    fonts = font_classes(ctx)
    hard, soft, scanned = [], [], pages(ctx)
    for page in scanned:
        t = Tree()
        t.feed(open(ctx.path(page), encoding="utf-8", errors="replace").read())
        for node in walk(t.root):
            why = switch(node, fonts)
            if not why or not node.text().strip() or exempt(node):
                continue
            host = mid_text(node)
            if host is None:
                continue
            words = re.sub(r"\s+", " ", host.text()).strip()
            line = "%s:%d  %s in <%s>: %s" % (page, node.line, why, host.tag, words[:90])
            note = allowed(page, node)
            (soft if note else hard).append(line + ("  [allowlisted: %s]" % note if note else ""))
    if hard:
        return Result(FAIL, "%d inline style switch%s inside a sentence" % (len(hard), "" if len(hard) == 1 else "es"),
                      hard + soft + ["One sentence, one font, style and color: docs/design/studio.md. "
                                     "A reviewed exception takes data-type-ok."])
    if soft:
        return Result(WARN, "%d page%s clean; %d switch%s in allowlisted areas (temporary, see ALLOW in tools/checks/typeset.py)"
                      % (len(scanned), "" if len(scanned) == 1 else "s", len(soft), "" if len(soft) == 1 else "es"), soft)
    return Result(PASS, "%d pages: one font, style and color per sentence" % len(scanned))
