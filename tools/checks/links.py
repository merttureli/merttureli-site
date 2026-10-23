"""links: every internal link and asset reference resolves to a file that will be deployed.

Scans all site HTML, CSS and JS (root, projects, hi, next, studies, cards,
docs, _ds, assets) plus sitemap.xml and robots.txt. A reference is checked when
it is local: relative, root-relative, or an absolute https://merttureli.com/ URL.

    HTML  href, src, srcset, poster, action, any data-* attribute whose value is a
          path with a file extension, <meta content> holding a site URL, url()
          and @import in <style> and style="", import specifiers in inline modules
    CSS   url(...) and @import, relative to the CSS file
    JS    import/export ... from "x" and import("x"), relative to the module (FAIL)
          string literals that look like asset paths ("assets/x.webp"); they are
          tried against the script, each page that loads it, and the root; a
          bare name ("x.json") or a tail ("css/x.css") passes if some deployed
          file ends with it, since the base is often joined at runtime. These
          are only a WARN.
    XML   sitemap.xml <loc>, robots.txt Sitemap:

A target FAILs when it is missing, escapes the repo, or exists but git ignores
it (it would 404 once deployed). src/ templates are checked from the place they
are served (src/index.html as /index.html). templates/ and tools/ are skipped.

To silence a JS literal that is not a path, add "file.js: literal" to
tools/checks/links-allow.txt.
"""
import html.parser
import os
import posixpath
import re
from urllib.parse import unquote, urlsplit

from . import Result, PASS, WARN, FAIL, SITE_HOST

NAME = "links"
TITLE = "internal links + asset references resolve"
MODES = {"fast", "default", "full"}

ASSET_EXT = ("webp", "png", "jpg", "jpeg", "gif", "svg", "avif", "ico", "webm", "mp4", "mov", "m4v",
             "glb", "gltf", "bin", "json", "js", "mjs", "css", "woff", "woff2", "ttf", "otf", "pdf",
             "hdr", "exr", "ktx2", "wasm", "txt", "vcf", "html", "xml", "step", "stl", "obj", "mp3", "wav")
EXT_RE = r"\.(?:%s)" % "|".join(ASSET_EXT)
PATHISH = re.compile(r"^[\w@~.%+-][\w@~./%+-]*" + EXT_RE + r"(?:[?#][^\s\"']*)?$", re.I)
URL_ATTRS = {"href", "src", "poster", "action", "xlink:href", "data", "background", "manifest"}
SKIP_SCHEMES = ("mailto:", "tel:", "sms:", "data:", "blob:", "javascript:", "about:", "chrome:")
TEMPLATE_MARK = re.compile(r"\$\{|\{\{|<%|\{[a-z_]+\}")

CSS_URL = re.compile(r"""url\(\s*(['"]?)([^'")]+?)\1\s*\)""", re.I)
CSS_IMPORT = re.compile(r"""@import\s+(['"])([^'"]+)\1""", re.I)
JS_IMPORT = re.compile(
    r"""(?:\bimport\s*(?:[\w*{}\s,$]+\s*from\s*)?|\bexport\s+[\w*{}\s,$]+\s+from\s*|\bimport\s*\(\s*)(['"])([^'"\n]+)\1""")
JS_LITERAL = re.compile(r"""(['"`])([\w@~.%+/-]*?[\w-]""" + EXT_RE + r""")\1""", re.I)
VENDOR = re.compile(r"(?:\.min\.js$|/vendor/|_ds_bundle\.js$|lenis|three\.(?:module|core))", re.I)
CSS_COMMENT = re.compile(r"/\*.*?\*/", re.S)
JS_COMMENT = re.compile(r"/\*.*?\*/|(?<![:\"'\\])//[^\n]*", re.S)


def served_as(rel):
    """Where a file is served from. src/ templates are rendered at the root."""
    if rel.startswith("src/"):
        return rel[len("src/"):]
    return rel


class Page(html.parser.HTMLParser):
    def __init__(self):
        html.parser.HTMLParser.__init__(self, convert_charrefs=True)
        self.refs = []          # (line, kind, value)
        self.ids = set()
        self._style = None
        self._script = None

    def handle_starttag(self, tag, attrs):
        line = self.getpos()[0]
        a = dict((k.lower(), v) for k, v in attrs if v is not None)
        if "id" in a:
            self.ids.add(a["id"])
        for k, v in a.items():
            v = v.strip()
            if not v:
                continue
            if k in ("srcset", "imagesrcset", "data-srcset"):
                for part in v.split(","):
                    url = part.strip().split(" ")[0]
                    if url:
                        self.refs.append((line, k, url))
            elif k == "style":
                for m in CSS_URL.finditer(v):
                    self.refs.append((line, "style url()", m.group(2)))
            elif k in URL_ATTRS:
                if tag == "link" and a.get("rel", "").lower() in ("preconnect", "dns-prefetch"):
                    continue
                self.refs.append((line, k, v))
            elif k == "content" and tag == "meta":
                if re.match(r"https?://(www\.)?%s/" % re.escape(SITE_HOST), v):
                    self.refs.append((line, "meta content", v))
            elif PATHISH.match(v) and not k.startswith("aria-") and k not in ("alt", "title", "class", "id", "download"):
                self.refs.append((line, k, v))
        if tag == "style":
            self._style = (line, [])
        if tag == "script":
            t = a.get("type", "").lower()
            self._script = (line, t, []) if "src" not in a else None

    def handle_data(self, data):
        if self._style is not None:
            self._style[1].append(data)
        if self._script is not None:
            self._script[2].append(data)

    def handle_endtag(self, tag):
        if tag == "style" and self._style is not None:
            line, parts = self._style
            css = CSS_COMMENT.sub(lambda m: "\n" * m.group(0).count("\n"), "".join(parts))
            for m in list(CSS_URL.finditer(css)) + list(CSS_IMPORT.finditer(css)):
                self.refs.append((line + css.count("\n", 0, m.start()), "<style>", m.group(2)))
            self._style = None
        if tag == "script" and self._script is not None:
            line, t, parts = self._script
            if t == "module":
                js = "".join(parts)
                for m in JS_IMPORT.finditer(js):
                    self.refs.append((line + js.count("\n", 0, m.start()), "inline import", m.group(2)))
            self._script = None


class Checker(object):
    def __init__(self, ctx):
        self.ctx = ctx
        self.files = set(ctx.files())
        self.errors = []
        self.warnings = []
        self.count = 0
        self.allow = self._allow()
        self.basenames = set(posixpath.basename(f) for f in self.files)

    def _allow(self):
        allow = set()
        path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "links-allow.txt")
        if os.path.exists(path):
            for line in open(path, encoding="utf-8"):
                line = line.split("#", 1)[0].strip()
                if ":" in line:
                    f, lit = line.split(":", 1)
                    allow.add((f.strip(), lit.strip()))
        return allow

    def suffix(self, lit):
        tail = "/" + posixpath.normpath(lit).lstrip("./")
        return any(f.endswith(tail) for f in self.files)

    def target(self, base_dir, ref):
        """Return (repo-relative path or None, problem or None). None, None means not local."""
        ref = ref.strip()
        if not ref or ref.startswith("#") or ref.lower().startswith(SKIP_SCHEMES) or TEMPLATE_MARK.search(ref):
            return None, None
        parts = urlsplit(ref)
        if parts.scheme or ref.startswith("//"):
            host = (parts.netloc or "").lower()
            if parts.scheme in ("http", "https", "") and host in (SITE_HOST, "www." + SITE_HOST):
                path = parts.path or "/"
            else:
                return None, None
        else:
            path = parts.path
            if not path:
                return None, None
        path = unquote(path)
        if path.startswith("/"):
            joined = posixpath.normpath(path.lstrip("/") or ".")
        else:
            joined = posixpath.normpath(posixpath.join(base_dir, path))
        if joined == ".." or joined.startswith("../"):
            return None, "escapes the site root"
        if joined == ".":
            joined = ""
        return joined, None

    def resolve(self, joined, ref):
        """Find the deployed file for a target path, like GitHub Pages would."""
        cands = []
        p = self.ctx.path(joined) if joined else self.ctx.root
        if joined == "" or ref.split("?")[0].split("#")[0].endswith("/") or os.path.isdir(p):
            cands.append(posixpath.join(joined, "index.html") if joined else "index.html")
        else:
            cands += [joined, joined + ".html"]
        for c in cands:
            if c in self.files:
                return c, None
        for c in cands:
            if os.path.isfile(self.ctx.path(c)):
                return c, "exists but git ignores it, so it will not deploy"
        return cands[0], "missing"

    def check(self, src, line, kind, ref, base_dir, warn_only=False):
        joined, problem = self.target(base_dir, ref)
        found = None
        if joined is None and problem is None:
            return True
        if not warn_only:
            self.count += 1
        if problem is None:
            found, problem = self.resolve(joined, ref)
            if found and problem is None:
                return True
        if warn_only:
            return False
        self.errors.append("%s:%d %s %r -> %s" % (src, line, kind, ref, problem if joined is None
                                                     else "%s (%s)" % (found or joined or "/", problem)))
        return False

    # -- per file type -------------------------------------------------

    def html(self, rel):
        text = open(self.ctx.path(rel), encoding="utf-8", errors="replace").read()
        p = Page()
        try:
            p.feed(text)
            p.close()
        except Exception as e:  # html.parser is lenient; this is a real breakage
            self.errors.append("%s: could not parse HTML: %s" % (rel, e))
            return
        base_dir = posixpath.dirname(served_as(rel))
        m = re.search(r"<base\s+href=[\"']([^\"']+)", text, re.I)
        if m:
            base_dir = posixpath.normpath(posixpath.join(base_dir, m.group(1))).rstrip("/")
            base_dir = "" if base_dir == "." else base_dir
        for line, kind, ref in p.refs:
            self.check(rel, line, kind, ref, base_dir)

    def css(self, rel):
        text = CSS_COMMENT.sub(lambda m: "\n" * m.group(0).count("\n"),
                               open(self.ctx.path(rel), encoding="utf-8", errors="replace").read())
        base_dir = posixpath.dirname(rel)
        for rx in (CSS_URL, CSS_IMPORT):
            for m in rx.finditer(text):
                self.check(rel, text.count("\n", 0, m.start()) + 1, "url()", m.group(2), base_dir)

    def js(self, rel, loaders):
        raw = open(self.ctx.path(rel), encoding="utf-8", errors="replace").read()
        base_dir = posixpath.dirname(rel)
        specs = set()
        for m in JS_IMPORT.finditer(raw):
            spec = m.group(2)
            specs.add(spec)
            if spec.startswith((".", "/")) or spec.startswith("https://" + SITE_HOST):
                self.check(rel, raw.count("\n", 0, m.start()) + 1, "import", spec, base_dir)
        if VENDOR.search(rel):
            return
        text = JS_COMMENT.sub(lambda m: "\n" * m.group(0).count("\n"), raw)
        for m in JS_LITERAL.finditer(text):
            lit = m.group(2)
            self.count += 1
            if lit in specs or (rel, lit) in self.allow or lit.startswith(".") and not lit.startswith(("./", "../")):
                continue
            if "/" not in lit:
                # a bare file name is joined to a base path at runtime: it only has to exist somewhere
                if lit in self.basenames:
                    continue
            elif self.suffix(lit):
                # "css/x.css" joined to a base path at runtime: some deployed file must end with it
                continue
            line = text.count("\n", 0, m.start()) + 1
            if self.check(rel, line, "literal", lit, base_dir, warn_only=True):
                continue
            ok = any(self.check(rel, line, "literal", lit, posixpath.dirname(served_as(page)), warn_only=True)
                     for page in loaders.get(rel, ())) or self.check(rel, line, "literal", lit, "", warn_only=True)
            if not ok:
                self.warnings.append("%s:%d string %r resolves from neither the script, the pages that load it (%s), "
                                     "nor the root" % (rel, line, lit, ", ".join(sorted(loaders.get(rel, ()))) or "none"))

    def xml(self, rel):
        text = open(self.ctx.path(rel), encoding="utf-8", errors="replace").read()
        for m in re.finditer(r"<loc>\s*([^<\s]+)\s*</loc>", text):
            self.check(rel, text.count("\n", 0, m.start()) + 1, "<loc>", m.group(1), "")

    def robots(self, rel):
        text = open(self.ctx.path(rel), encoding="utf-8", errors="replace").read()
        for m in re.finditer(r"^\s*Sitemap:\s*(\S+)", text, re.M | re.I):
            self.check(rel, text.count("\n", 0, m.start()) + 1, "Sitemap:", m.group(1), "")


SCRIPT_SRC = re.compile(r"<script\b[^>]*\bsrc\s*=\s*[\"']([^\"']+)", re.I)


def loaders_of(ctx, pages):
    """Map each JS file to the HTML pages that load it directly or through module imports."""
    direct = {}
    for page in pages:
        text = open(ctx.path(page), encoding="utf-8", errors="replace").read()
        base = posixpath.dirname(served_as(page))
        for m in SCRIPT_SRC.finditer(text):
            ref = m.group(1).split("?")[0].split("#")[0]
            if "://" in ref:
                continue
            js = posixpath.normpath(ref.lstrip("/") if ref.startswith("/") else posixpath.join(base, ref))
            direct.setdefault(js, set()).add(page)
    # follow relative module imports one level at a time
    changed = True
    while changed:
        changed = False
        for js, pages_ in list(direct.items()):
            if not os.path.isfile(ctx.path(js)):
                continue
            text = open(ctx.path(js), encoding="utf-8", errors="replace").read()
            for m in JS_IMPORT.finditer(text):
                spec = m.group(2)
                if not spec.startswith("."):
                    continue
                dep = posixpath.normpath(posixpath.join(posixpath.dirname(js), spec))
                before = len(direct.get(dep, ()))
                direct.setdefault(dep, set()).update(pages_)
                if len(direct[dep]) != before:
                    changed = True
    return direct


def run(ctx):
    c = Checker(ctx)
    pages = ctx.site_files((".html", ".htm"))
    for rel in pages:
        c.html(rel)
    for rel in ctx.site_files((".css",)):
        c.css(rel)
    loaders = loaders_of(ctx, pages)
    for rel in ctx.site_files((".js", ".mjs")):
        c.js(rel, loaders)
    for rel in ctx.site_files((".xml",)):
        if posixpath.basename(rel) == "sitemap.xml":
            c.xml(rel)
    if "robots.txt" in c.files:
        c.robots("robots.txt")
    summary = "%d references in %d HTML, %d CSS, %d JS files" % (
        c.count, len(pages), len(ctx.site_files((".css",))), len(ctx.site_files((".js", ".mjs"))))
    if c.errors:
        return Result(FAIL, "%d broken (%s)" % (len(c.errors), summary), c.errors + (
            ["", "warnings:"] + c.warnings if c.warnings else []))
    if c.warnings:
        return Result(WARN, "%d unresolved JS string paths (%s)" % (len(c.warnings), summary), c.warnings)
    return Result(PASS, summary)
