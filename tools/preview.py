#!/usr/bin/env python3
"""Build an artifact-ready copy of the site (or the Studio) for a claude.ai preview.

    python3 tools/preview.py site   [--out DIR] [--serve PORT | --smoke] [--dry-run]
    python3 tools/preview.py studio [--out DIR] [--serve PORT | --smoke] [--dry-run]
    python3 tools/preview.py samples [--out DIR] [--serve PORT | --smoke] [--dry-run]

site    the live site, exactly what GitHub Pages serves (the Studio home, websites and case
        pages built from next/, plus the old-design pages in docs/transition.md), entry
        index.html. Run python3 tools/build.py first if next/ changed.
studio  next/ as a standalone copy (the Studio sources, noindex, before build.py publishes them): every file under next/ at the copy root (index.html,
        websites.html, projects/*.html, css/, js/, assets/ ...), shared/ (studies/shared),
        and, pulled in by reference (whole folder when the target is an .html page):
        site/ (root assets/), site/js/ (root js/), studies/ (the four design studies).
        STEP files are left out (the host refuses them).
samples the catalog of sample sites: studies/ at the copy root (studies/index.html, the catalog, is
        the entry; every study folder, shared/, catalog/ beside it), and, pulled in by reference
        (HTML, CSS, JS, the .bin a model .json names, every file under a folder a script uses as a
        base URL): next/ as next/, root assets/ as assets/, root js/ as js/. So "../../next/x" from
        a study becomes "../next/x". Links that would leave the copy: a study's "/websites.html"
        (the back pill) points to the catalog; the catalog's "/" and "/websites.html", and any link
        to the old explorer page, become https://merttureli.com/... in a new tab.

The artifact host rules this applies to every copy:
  * top-level paths starting with "_" are rejected  -> "_ds/" becomes "ds/"
  * .bin and .glb files are rejected                 -> renamed to *.bin.wasm / *.glb.wasm
  * only "#hash" survives in URLs                    -> internal refs with "?query" are reported
  * the page is index.html at the copy root; root-absolute refs ("/css/x.css") and
    folder refs ("hi/") are rewritten to relative, explicit file paths
  * max 255 files and 64 MB per publish              -> a batch plan is printed
References are found in HTML attributes (href, src, srcset, poster, ...), CSS url() and
@import, JS import specifiers and quoted path-like strings, then every reference whose
target moved is rewritten. Unresolved references are reported, never guessed.

Output: the copy in --out (default: a new temp dir; pass a dir under the Claude scratchpad
when the copy is going to the publish tool), plus <out>/.preview-plan.json with the exact
publish calls (file_path, files map per batch). Re-running into the same --out replaces it.

Exit codes: 0 ok, 1 smoke test found problems, 2 bad input, a copy that breaks a host rule,
or (with --strict) an unresolved reference.
"""
import argparse
import functools
import http.server
import json
import os
import posixpath
import re
import shutil
import subprocess
import sys
import tempfile
import threading
from urllib.parse import unquote

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLAN_NAME = ".preview-plan.json"

# Host limits (claude.ai artifacts). Batches keep a margin under the hard caps.
BATCH_MAX_FILES = 250          # hard cap 255 per publish
BATCH_MAX_BYTES = 60_000_000   # hard cap 64 MB per publish
VERSION_MAX_FILES = 511
VERSION_MAX_BYTES = 256_000_000
TEXT_MAX_BYTES = 16_000_000
BINARY_MAX_BYTES = 15_000_000
RENAME_EXT = (".bin", ".glb")  # rejected by the host, published as <name>.wasm

TEXT_EXT = {".html", ".htm", ".css", ".js", ".mjs", ".json", ".svg", ".xml", ".webmanifest"}
# Extensions the publish tool infers a type for. Anything else is still copied but flagged.
COMMON_EXT = TEXT_EXT | {".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".ico", ".woff",
                         ".woff2", ".ttf", ".otf", ".mp4", ".webm", ".mp3", ".pdf", ".txt",
                         ".wasm", ".csv"}
ASSET_EXT = ("webp|png|jpe?g|gif|svg|avif|ico|mp4|webm|mp3|json|bin|glb|woff2?|ttf|otf|css|m?js|"
             "html?|pdf|wasm|txt|vcf|step|xml|webmanifest")

# Never part of a copy (repo plumbing, sources of generated files, docs in Markdown).
EXCLUDE_DIRS = ("tools/", "src/", "templates/", "content/", ".claude/", ".github/", ".git/")
EXCLUDE_NAMES = {"CNAME", "_headers", ".nojekyll", ".gitignore", ".gitattributes", ".DS_Store"}
EXCLUDE_EXT = {".py", ".sh", ".md", ".pyc", ".log"}

MODES = {
    "site": {
        "roots": [("", "")],
        "pull": [],
        "exclude_ext": {".step"},   # the artifact host refuses STEP files
        "entry": "index.html",
        "doc_dir": "",
        "smoke": ["index.html", "index.html#reel-coaster", "websites.html", "projects/charger.html",
                  "projects/therma-shift.html", "privacy.html", "hi/index.html",
                  "index.html#charger"],
    },
    "studio": {
        # every page under next/ (index.html, websites.html, projects/*.html, lab/...) at the copy root
        "roots": [("next/", ""), ("studies/shared/", "shared/")],
        # outside files the Studio links: root assets, the four design studies, root scripts
        # (the websites page reuses the live inquiry form wiring in js/)
        "pull": [("assets/", "site/"), ("studies/", "studies/"), ("js/", "site/js/")],
        "exclude_ext": {".step"},   # the artifact host refuses STEP files
        "entry": "next/index.html",
        "doc_dir": "next/",
        "smoke": ["index.html#reel-coaster", "websites.html", "projects/charger.html",
                  "index.html#charger"],
    },
    "samples": {
        # the catalog and every study beside it: "../../next/x" from a study becomes "../next/x"
        "roots": [("studies/", "")],
        "pull": [("next/", "next/"), ("assets/", "assets/"), ("js/", "js/")],
        "exclude_ext": {".step"},
        "entry": "studies/index.html",
        "doc_dir": "studies/",
        # a folder a script uses as a base URL ('../x/', or the fixed part of `../x/${name}.json`)
        # brings every file under it (not its pages)
        "pull_folders": True,
        # also read data-srcset, data-video and the like, the .bin a model .json names beside it,
        # and the folder of `../x/${name}.json`
        "wide_scan": True,
        "folder_templates": True, # `${key}/` in a script (the catalog's viewer) -> `${key}/index.html`
        "local_only": True,       # the smoke fails on any request that leaves the copy
        "smoke_wait": 7000,       # 3D pages load their models after the first view
        # repo page -> page in the copy, for links from every page but the entry (the back pill)
        "redirect": {"websites.html": "studies/index.html"},
        # repo page -> live URL (opens in a new tab); the entry's links, and the old explorer page
        "external": {"index.html": "https://merttureli.com/",
                     "websites.html": "https://merttureli.com/websites.html",
                     "assets/charger-explorer/index.html": "https://merttureli.com/#charger"},
        # if the version limit is passed: drop unreferenced root files, heaviest first, from these
        # an entry whose catalog label matches this (the four portfolio redesigns) goes first
        "trim_first": r"entry__idx[^>]*>[^<]*\bRedesign\b",
        "smoke": "entry_links",   # the entry plus every page it links to
    },
}

BLOCKED_HOSTS = ["clarity.ms", "bing.com", "workers.dev", "formspree.io"]


def die(msg, code=2):
    print(f"preview: error: {msg}", file=sys.stderr)
    sys.exit(code)


# ---------------------------------------------------------------- file universe

def excluded(p):
    if p.startswith(EXCLUDE_DIRS):
        return True
    parts = p.split("/")
    if "node_modules" in parts or any(x.startswith(".") for x in parts):
        return True
    if parts[-1] in EXCLUDE_NAMES:
        return True
    if p.startswith("docs/") and p.endswith(".md"):
        return False   # the design docs the catalog links to
    return os.path.splitext(p)[1].lower() in EXCLUDE_EXT


def list_repo_files():
    """Tracked plus untracked-but-not-ignored files that exist on disk (repo-relative)."""
    try:
        out = subprocess.run(["git", "-C", ROOT, "ls-files", "-z", "--cached", "--others",
                              "--exclude-standard"], capture_output=True, check=True).stdout
        files = {f for f in out.decode("utf-8").split("\0") if f}
    except (OSError, subprocess.CalledProcessError):
        files = set()
        for d, dirs, names in os.walk(ROOT):
            dirs[:] = [x for x in dirs if not x.startswith(".") and x != "node_modules"]
            for n in names:
                files.add(os.path.relpath(os.path.join(d, n), ROOT).replace(os.sep, "/"))
    return {f for f in files if os.path.isfile(os.path.join(ROOT, f)) and not excluded(f)}


def host_name(dst):
    """Apply the host's naming rules to a destination path."""
    top, sep, rest = dst.partition("/")
    if top.startswith("_"):
        dst = top.lstrip("_") + sep + rest
    if dst.lower().endswith(RENAME_EXT):
        dst += ".wasm"
    return dst


# ---------------------------------------------------------------- reference scanning

ATTR_RE = re.compile(
    r"""(?<=[\s"'])(href|src|poster|action|data|xlink:href|data-[\w-]*?(?:src|href|poster|url))"""
    r"""\s*=\s*(["'])(.*?)\2""", re.I | re.S)
SRCSET_RE = re.compile(r"""(?<=[\s"'])(srcset|imagesrcset)\s*=\s*(["'])(.*?)\2""", re.I | re.S)
CSS_URL_RE = re.compile(r"""url\(\s*(["']?)([^"')]+?)\1\s*\)""", re.I)
CSS_IMPORT_RE = re.compile(r"""@import\s+(["'])([^"']+)\1""", re.I)
JS_IMPORT_RE = re.compile(r"""(\bfrom\s*|\bimport\s*\(?\s*)(["'`])([^"'`\s]+)\2""")
# new URL('x', import.meta.url) is relative to the script; new URL('x', document.baseURI) to the page
NEW_URL_RE = re.compile(r"""new\s+URL\(\s*(["'`])([^"'`\s]+)\1\s*(,[^)]*)?\)""")
JS_STR_RE = re.compile(r"""(["'`])((?:(?:\.{1,2}/)+|/)?[\w@%~+-][\w@%~+./-]*\.(?:""" + ASSET_EXT +
                       r"""))((?:[?#][^"'`\s]*)?)\1""", re.I)
# wide scan (samples): lazy-load attributes the pages' scripts read (data-srcset, data-video ...)
WIDE_SRCSET_RE = re.compile(r"""(?<=[\s"'])(data-[\w-]*srcset)\s*=\s*(["'])(.*?)\2""", re.I | re.S)
WIDE_ATTR_RE = re.compile(r"""(?<=[\s"'])(data-[\w-]+)\s*=\s*(["'])((?:(?:\.{1,2}/)+|/)?[\w@%~+-][\w@%~+./-]*\.(?:"""
                          + ASSET_EXT + r""")(?:#[^"'\s]*)?)\2""", re.I)
JS_DIR_RE = re.compile(r"""(["'`])((?:\.{1,2}/)+(?:[\w@%~+-][\w@%~+.-]*/)+)\1""")
SCRIPT_RE = re.compile(r"<script\b[^>]*>(.*?)</script>", re.I | re.S)
STYLE_RE = re.compile(r"<style\b[^>]*>(.*?)</style>|\sstyle\s*=\s*([\"'])(.*?)\2", re.I | re.S)



def is_path_spec(m):
    """True for a real path. import/from need './', '../' or '/' (anything else is a bare
    import-map name like 'three' or 'three/addons/x.js')."""
    return bool(re.match(r"\.{1,2}/|/(?!/)", m.group(3)))


def js_refs(text, add, off=0, loose="loose", templates=False):
    def spec(start, ref, kind):
        # `../3d/${name}.json` with templates on: its fixed folder is the reference
        if templates and "${" in ref:
            ref = ref[:ref.index("${")]
            ref = ref[:ref.rfind("/") + 1]
            if not ref:
                return
        add(start, ref, kind)
    for m in NEW_URL_RE.finditer(text):
        base = m.group(3) or ""
        if "import.meta.url" in base:
            spec(off + m.start(2), m.group(2), "file")
        elif re.search(r"document\.baseURI|location", base):
            spec(off + m.start(2), m.group(2), "doc")
    for m in JS_IMPORT_RE.finditer(text):
        if is_path_spec(m):
            spec(off + m.start(3), m.group(3), "file")
    for m in JS_STR_RE.finditer(text):
        add(off + m.start(2), m.group(2) + m.group(3), loose)
    if templates:   # a relative folder used as a base URL: base: '../../assets/charger-explorer/'
        for m in JS_DIR_RE.finditer(text):
            add(off + m.start(2), m.group(2), loose)


INERT_RE = re.compile(r"<script\b[^>]*\btype\s*=\s*[\"']?text/(?:html|plain|template)[^>]*>(.*?)</script>", re.I | re.S)
SKIP_SCHEMES = re.compile(r"^(?:[a-z][a-z0-9+.-]*:|//|#|\{|\$|<)", re.I)


def find_refs(path, text, wide=False):
    """Return [(start, end, ref, kind)] for one file. kind: 'nav' (an HTML attribute; a folder
    means its index.html), 'file' (relative to the file; a folder stays a folder), 'doc'
    (relative to the page that loads the script), 'loose' (a quoted path-like JS string:
    try the file's folder, then the page's), 'sibling' (a string in a .json file: its folder only).
    `wide` (the samples copy) also reads data-*srcset and any data-* attribute holding a file path,
    the .json files' strings, and the fixed folder of a `../x/${name}.json` template."""
    templates = wide
    ext = os.path.splitext(path)[1].lower()
    spans = []

    def add(start, ref, kind):
        spans.append((start, start + len(ref), ref, kind))

    if ext in (".html", ".htm", ".svg", ".xml"):
        # Markup held as text (the catalog's <script type="text/html"> demos and
        # "text/plain" snippets) renders later against its own <base>: not refs of this file.
        inert = [(m.start(1), m.end(1)) for m in INERT_RE.finditer(text)]
        if inert:
            plain = add

            def add(start, ref, kind):
                if not any(a <= start < b for a, b in inert):
                    plain(start, ref, kind)
        for m in ATTR_RE.finditer(text):
            add(m.start(3), m.group(3), "nav")
        for m in [*SRCSET_RE.finditer(text), *(WIDE_SRCSET_RE.finditer(text) if wide else ())]:
            base = m.start(3)
            for cm in re.finditer(r"[^,\s][^,]*", m.group(3)):
                url = cm.group(0).strip().split()[0]
                add(base + cm.start(), url, "nav")
        if wide:
            for m in WIDE_ATTR_RE.finditer(text):
                add(m.start(3), m.group(3), "nav")
        for m in STYLE_RE.finditer(text):
            body, off = (m.group(1), m.start(1)) if m.group(1) is not None else (m.group(3), m.start(3))
            for um in CSS_URL_RE.finditer(body):
                add(off + um.start(2), um.group(2), "nav")
        for m in SCRIPT_RE.finditer(text):
            js_refs(m.group(1), add, m.start(1), templates=templates)
    elif ext == ".css":
        for m in CSS_URL_RE.finditer(text):
            add(m.start(2), m.group(2), "file")
        for m in CSS_IMPORT_RE.finditer(text):
            add(m.start(2), m.group(2), "file")
    elif ext in (".js", ".mjs"):
        js_refs(text, add, templates=templates)
    elif ext == ".json" and wide:
        # a model .json names its .bin by bare file name, beside it
        for m in JS_STR_RE.finditer(text):
            add(m.start(2), m.group(2) + m.group(3), "sibling")
    # first match wins on overlapping spans
    spans.sort(key=lambda s: (s[0], -s[1]))
    out, last = [], -1
    for s in spans:
        if s[0] >= last:
            out.append(s)
            last = s[1]
    return out


def split_ref(ref):
    m = re.match(r"([^?#]*)(\?[^#]*)?(#.*)?$", ref, re.S)
    return m.group(1), m.group(2) or "", m.group(3) or ""


def resolve(base_dir, path, universe, nav=True):
    """Repo-relative target of `path` seen from repo dir `base_dir`, or (None, reason).
    A folder resolves to its index.html when `nav`, else to "<folder>/" ("/" for the root)."""
    raw = unquote(path)
    if raw.startswith("/"):
        target = posixpath.normpath(raw.lstrip("/") or ".")
    else:
        target = posixpath.normpath(posixpath.join(base_dir, raw) if base_dir else raw)
    if target == ".." or target.startswith("../"):
        return None, "outside repo"
    if target == ".":
        target = ""
    full = os.path.join(ROOT, target)
    if raw.endswith("/") or target == "" or os.path.isdir(full):
        if not nav:   # a folder used as a base URL, e.g. new URL('../model/', import.meta.url)
            pre = target + "/" if target else ""
            if any(f.startswith(pre) for f in universe):
                return pre or "/", None
            return None, "missing"
        target = posixpath.join(target, "index.html") if target else "index.html"
    if target in universe:
        return target, None
    if os.path.isfile(os.path.join(ROOT, target)):
        return None, "excluded from copy"
    return None, "missing"


# ---------------------------------------------------------------- build

class Build:
    def __init__(self, mode, out, dry_run=False):
        self.mode, self.cfg, self.out, self.dry = mode, MODES[mode], out, dry_run
        self.universe = list_repo_files()
        self.dst = {}            # repo path -> copy path
        self.issues = []         # (level, file, message)
        self.rewrites = {}       # copy path -> count
        self.queries = []
        self.loaders = {}        # script -> folders of the pages that load it (directly or by import)
        self.referenced = set()  # repo files some reference in the copy resolves to
        self.left_out = []       # (copy path, bytes) dropped to fit the version limit
        self.entry_links = []    # copy pages the entry links to (the samples smoke list)

    def skip(self, f):
        return os.path.splitext(f)[1].lower() in self.cfg.get("exclude_ext", ())

    def map_roots(self):
        for src_pre, dst_pre in self.cfg["roots"]:
            for f in sorted(self.universe):
                if self.skip(f):
                    continue
                if f == src_pre or (src_pre.endswith("/") or src_pre == "") and f.startswith(src_pre):
                    self.dst[f] = host_name(dst_pre + f[len(src_pre):])

    def pull_target(self, target):
        for src_pre, dst_pre in self.cfg["pull"]:
            if target.startswith(src_pre):
                return dst_pre + target[len(src_pre):]
        return None

    def pull(self, target):
        """Add an outside file (and its whole folder if it is a page). Returns new files."""
        new = []
        if target.endswith((".html", ".htm")):
            folder = posixpath.dirname(target) + "/"
            group = [f for f in self.universe if f.startswith(folder)]
        else:
            group = [target]
        for f in sorted(group):
            if f not in self.dst and not self.skip(f):
                d = self.pull_target(f)
                if d:
                    self.dst[f] = host_name(d)
                    new.append(f)
        return new

    def pull_folder(self, folder):
        """A folder used as a base URL: bring every file under it except its pages."""
        new = []
        for f in sorted(self.universe):
            if (f.startswith(folder) and f not in self.dst and not self.skip(f)
                    and not f.endswith((".html", ".htm"))):
                d = self.pull_target(f)
                if d:
                    self.dst[f] = host_name(d)
                    new.append(f)
        return new

    def link_rule(self, f, kind, path):
        """('redirect', repo page) or ('external', url) for a link that would leave the copy: an
        HTML attribute, or a page path in a script (markup a script writes, e.g. specimen's cards)."""
        redirect, external = self.cfg.get("redirect", {}), self.cfg.get("external", {})
        if not (redirect or external):
            return None
        if kind == "nav" and f.endswith((".html", ".htm")):
            bases = [posixpath.dirname(f)]
        elif kind == "loose" and f.endswith((".js", ".mjs")) and split_ref(path)[0].endswith((".html", ".htm")):
            bases = self.bases(f, kind)
        else:
            return None
        for base in bases:
            target, _ = resolve(base, path, self.universe, nav=True)
            if target and (target in redirect or target in external):
                break
        else:
            return None
        if target in self.dst:
            return None
        if target in redirect and f != self.cfg["entry"] and redirect[target] in self.dst:
            return "redirect", redirect[target]
        if target in external:
            return "external", external[target]
        return None

    def lookup(self, base_dir, path, kind="nav"):
        target, why = resolve(base_dir, path, self.universe, nav=(kind == "nav"))
        if target and target.endswith("/"):
            pre = "" if target == "/" else target
            inside = any(s.startswith(pre) for s in self.dst)
            if self.cfg.get("pull_folders") and pre and self.pull_target(pre) and any(
                    f.startswith(pre) and f not in self.dst and not self.skip(f)
                    and not f.endswith((".html", ".htm")) for f in self.universe):
                return target, "pull"   # the rest of a base-URL folder
            return (target, None) if inside else (None, "not in this copy")
        if target and self.skip(target):
            return None, "excluded from copy"
        if target and target not in self.dst and self.pull_target(target):
            return target, "pull"
        if target and target not in self.dst:
            return None, "not in this copy"
        return target, why

    def collect(self):
        """Pull in outside files referenced by the copy, until nothing new appears."""
        queue = [f for f in self.dst if f.lower().endswith(tuple(TEXT_EXT))]
        seen = set()
        while queue:
            f = queue.pop()
            if f in seen:
                continue
            seen.add(f)
            text = self.read(f)
            if text is None:
                continue
            for _, _, ref, kind in find_refs(f, text, self.cfg.get("wide_scan", False)):
                path, _, _ = split_ref(ref)
                if not path or SKIP_SCHEMES.match(ref):
                    continue
                if self.link_rule(f, kind, path):
                    continue
                for base in self.bases(f, kind):
                    target, why = self.lookup(base, path, kind)
                    if why == "pull" and not target.endswith("/"):
                        queue += [n for n in self.pull(target) if n.lower().endswith(tuple(TEXT_EXT))]
                    elif why == "pull":
                        queue += [n for n in self.pull_folder(target) if n.lower().endswith(tuple(TEXT_EXT))]
                    if target:
                        self.referenced.add(target)
                        # remember which pages load which scripts: a script's loose and
                        # document-relative paths resolve against those pages' folders
                        if target.endswith((".js", ".mjs")) and kind in ("nav", "file"):
                            dirs = ({posixpath.dirname(f)} if f.endswith((".html", ".htm"))
                                    else self.loaders.get(f, set()))
                            known = self.loaders.setdefault(target, set())
                            if not dirs <= known:
                                known |= dirs
                                if target in seen:   # rescan it with the new bases
                                    seen.discard(target)
                                    queue.append(target)
                        break

    def bases(self, f, kind):
        here = posixpath.dirname(f)
        doc = self.cfg["doc_dir"].rstrip("/")
        if kind in ("nav", "file", "sibling") or f.endswith((".html", ".htm")):
            return [here]
        pages = sorted(self.loaders.get(f, ()))
        if kind == "doc":
            return pages + [d for d in [doc] if d not in pages]
        out = [here] + [d for d in pages if d != here]
        return out if doc in out else out + [doc]

    def read(self, f):
        try:
            with open(os.path.join(ROOT, f), encoding="utf-8") as fh:
                return fh.read()
        except UnicodeDecodeError:
            self.issues.append(("warn", f, "not UTF-8, copied without rewriting"))
            return None

    def rewrite(self, f, text):
        here_src = posixpath.dirname(f)
        here_dst = posixpath.dirname(self.dst[f])
        ext = os.path.splitext(f)[1].lower()
        pieces, pos, count = [], 0, 0
        external = False
        for start, end, ref, kind in find_refs(f, text, self.cfg.get("wide_scan", False)):
            path, query, frag = split_ref(ref)
            if not path or SKIP_SCHEMES.match(ref):
                continue
            rule = self.link_rule(f, kind, path)
            if rule:
                if rule[0] == "redirect":   # the page it stood for is not in the copy: drop the #hash too
                    new = posixpath.relpath(self.dst[rule[1]], here_dst or ".")
                else:
                    url = rule[1] + ("" if "#" in rule[1] else frag)
                    new, external = url + "\0", True   # marks the tag for target="_blank"
                if f == self.cfg["entry"] and rule[0] == "redirect":
                    self.entry_links.append(self.dst[rule[1]])
                pieces.append(text[pos:start])
                pieces.append(new)
                pos = end
                count += 1
                continue
            if path.startswith("/") and kind in ("doc", "loose") and ext in (".js", ".mjs"):
                # root-absolute in a script: what it means depends on code we cannot read
                self.issues.append(("info", self.dst[f], f"{ref!r}: root-absolute path in a script, left as is"))
                continue
            target, why, base_src = None, None, None
            for base in self.bases(f, kind):
                target, why = self.lookup(base, path, kind)
                if target:
                    base_src = base
                    break
            if not target:
                if kind not in ("loose", "sibling") and why != "outside repo":
                    level = "warn" if why in ("missing", "not in this copy", "excluded from copy") else "info"
                    self.issues.append((level, self.dst[f], f"{ref!r}: {why}"))
                continue
            if query:
                self.queries.append((self.dst[f], ref))
            if f == self.cfg["entry"] and kind == "nav" and target.endswith((".html", ".htm")):
                self.entry_links.append(self.dst[target])
            # destination dir the browser resolves this ref against
            base_dst = here_dst if base_src == here_src else self.dst_dir(base_src)
            raw = unquote(path)
            if target.endswith("/"):
                new_target = self.dst_dir("" if target == "/" else target[:-1]) or "."
                keeps = (not raw.startswith("/")
                         and posixpath.normpath(posixpath.join(base_dst, raw)) == new_target)
                rel = posixpath.relpath(new_target, base_dst or ".") + "/"
            else:
                new_target = self.dst[target]
                keeps = (not raw.startswith("/") and not raw.endswith("/")
                         and not os.path.isdir(os.path.join(ROOT, posixpath.normpath(posixpath.join(base_src, raw))))
                         and posixpath.normpath(posixpath.join(base_dst, raw)) == new_target)
                rel = posixpath.relpath(new_target, base_dst or ".")
            if keeps:
                continue
            pieces.append(text[pos:start])
            pieces.append(rel + query + frag)
            pos = end
            count += 1
        pieces.append(text[pos:])
        text = "".join(pieces)
        if external:
            # a link to the live site opens in a new tab (the copy is framed by the preview host)
            def blank(m):
                tag = m.group(1) + m.group(2)
                if re.search(r"\starget\s*=", tag):
                    return tag
                return tag[:-1].rstrip("/").rstrip() + ' target="_blank" rel="noopener">'
            text = re.sub(r"(<a\b[^>]*?)\0([^>]*>)", blank, text, flags=re.I)
            text = text.replace("\0", "")
        if self.cfg.get("folder_templates") and ext in (".js", ".mjs"):
            # `${key}/` names a folder page: the host serves explicit files only
            text, n = re.subn(r"(`(?:[\w./-]|\$\{[\w.]+\})*\$\{[\w.]+\}/)`", r"\1index.html`", text)
            count += n
        # bare filenames of renamed files (e.g. fetch(base + 'charger-hero.bin'))
        if self.renamed_re:
            text, n = self.renamed_re.subn(r"\1.wasm", text)
            count += n
        # dynamic refs to renamed top-level folders ("_ds/" -> "ds/")
        for old, new in self.renamed_tops:
            text, n = re.subn(r"(?<![\w.-])" + re.escape(old) + "/", new + "/", text)
            count += n
        if count:
            self.rewrites[self.dst[f]] = count
        return text

    def dst_dir(self, src_dir):
        """Copy dir that corresponds to repo dir `src_dir` (the doc dir for scripts)."""
        probe = posixpath.join(src_dir, "index.html") if src_dir else "index.html"
        if probe in self.dst:
            return posixpath.dirname(self.dst[probe])
        for s, d in self.dst.items():
            if posixpath.dirname(s) == src_dir:
                return posixpath.dirname(d)
        pre = src_dir + "/" if src_dir else ""
        for s, d in sorted(self.dst.items()):
            if s.startswith(pre):
                depth = s[len(pre):].count("/")
                return "/".join(d.split("/")[:-1 - depth])
        return src_dir

    def run(self):
        self.map_roots()
        if self.cfg["entry"] not in self.dst:
            die(f"entry {self.cfg['entry']} not found under {ROOT}")
        self.collect()
        self.trim()
        names = sorted({posixpath.basename(s) for s, d in self.dst.items() if d.endswith(".wasm")
                        and not s.endswith(".wasm")}, key=len, reverse=True)
        self.renamed_re = (re.compile(r"(?<![\w.-])(" + "|".join(map(re.escape, names)) +
                                      r")(?!\.wasm)(?![\w])") if names else None)
        tops = {}
        for s, d in self.dst.items():
            st, dt = s.split("/")[0], d.split("/")[0]
            if st.startswith("_") and "/" in s and dt != st:
                tops[st] = dt
        self.renamed_tops = sorted(tops.items())
        # collisions
        seen = {}
        for s, d in self.dst.items():
            if d in seen:
                die(f"two files map to {d}: {seen[d]} and {s}")
            seen[d] = s
        if not self.dry:
            self.prepare_out()
        for s in sorted(self.dst):
            d = self.dst[s]
            ext = os.path.splitext(s)[1].lower()
            text = self.read(s) if ext in TEXT_EXT else None
            data = self.rewrite(s, text) if text is not None else None
            if self.dry:
                continue
            path = os.path.join(self.out, d)
            os.makedirs(os.path.dirname(path), exist_ok=True)
            if data is not None:
                with open(path, "w", encoding="utf-8", newline="") as fh:
                    fh.write(data)
            else:
                shutil.copy2(os.path.join(ROOT, s), path)

    def trim(self):
        """Over the per-version limit: drop root files nothing references, heaviest first, those
        of the entries matching trim_first before the rest. Never a referenced file."""
        if "trim_first" not in self.cfg:   # only the samples copy may leave files out
            return
        size = lambda s: os.path.getsize(os.path.join(ROOT, s))
        total = sum(size(s) for s in self.dst)
        if len(self.dst) <= VERSION_MAX_FILES and total <= VERSION_MAX_BYTES:
            return
        first = set()
        pat, entry = self.cfg.get("trim_first"), self.cfg["entry"]
        if pat:
            text = self.read(entry) or ""
            for m in re.finditer(r"<article\b[^>]*\bdata-key=\"([\w-]+)\"(.*?)(?=<article\b|$)", text, re.S):
                if re.search(pat, m.group(2)):
                    first.add(m.group(1))
        roots = [p for p, _ in self.cfg["roots"]]
        def group(s):
            rest = next((s[len(p):] for p in roots if s.startswith(p)), s)
            return 0 if rest.split("/")[0] in first else 1
        folders = [t for t in self.referenced if t.endswith("/")]
        spare = sorted((s for s in self.dst if s not in self.referenced and s != entry
                        and not any(s.startswith(t) for t in folders)
                        and not s.endswith((".html", ".htm")) and any(s.startswith(p) for p in roots)),
                       key=lambda s: (group(s), -size(s)))
        for s in spare:
            if len(self.dst) <= VERSION_MAX_FILES and total <= VERSION_MAX_BYTES:
                break
            total -= size(s)
            self.left_out.append((self.dst.pop(s), size(s)))

    def prepare_out(self):
        if os.path.exists(self.out):
            entries = os.listdir(self.out)
            if entries and PLAN_NAME not in entries:
                die(f"--out {self.out} is not empty and is not a previous preview copy; "
                    "pick an empty or new folder")
            for e in entries:
                p = os.path.join(self.out, e)
                shutil.rmtree(p) if os.path.isdir(p) and not os.path.islink(p) else os.remove(p)
        os.makedirs(self.out, exist_ok=True)
        with open(os.path.join(self.out, PLAN_NAME), "w") as fh:   # marks the folder as ours
            fh.write("{}")

    # ------------------------------------------------------------ plan + checks

    def sizes(self):
        out = {}
        for s, d in self.dst.items():
            p = os.path.join(self.out, d)
            out[d] = os.path.getsize(p) if not self.dry and os.path.exists(p) else os.path.getsize(os.path.join(ROOT, s))
        return out

    def plan(self):
        sizes = self.sizes()
        page = "index.html"
        errors = []
        for d, sz in sizes.items():
            ext = os.path.splitext(d)[1].lower()
            limit = TEXT_MAX_BYTES if ext in TEXT_EXT or ext == ".txt" else BINARY_MAX_BYTES
            if sz > limit:
                errors.append(f"{d} is {sz/1e6:.1f} MB, over the {limit/1e6:.0f} MB per-file limit")
            if d.split("/")[0].startswith("_"):
                errors.append(f"{d}: top-level path starts with '_'")
            if d.lower().endswith(RENAME_EXT):
                errors.append(f"{d}: .bin/.glb is rejected by the host")
        if page not in sizes:
            errors.append("no index.html at the copy root")
        total = sum(sizes.values())
        if len(sizes) > VERSION_MAX_FILES or total > VERSION_MAX_BYTES:
            errors.append(f"{len(sizes)} files / {total/1e6:.1f} MB is over the per-version limit "
                          f"({VERSION_MAX_FILES} files / {VERSION_MAX_BYTES/1e6:.0f} MB)")
        # fewest batches: largest file first into the lightest batch that has room;
        # batch 1 also carries the page itself
        items = sorted(((sz, d) for d, sz in sizes.items() if d != page), reverse=True)
        n = max(1, -(-total // BATCH_MAX_BYTES), -(-len(sizes) // BATCH_MAX_FILES))
        while True:
            bins = [[[], 0, 0] for _ in range(n)]      # [paths, bytes, file count]
            bins[0][1], bins[0][2] = sizes.get(page, 0), 1
            for sz, d in items:
                room = [bn for bn in bins if bn[2] < BATCH_MAX_FILES and bn[1] + sz <= BATCH_MAX_BYTES]
                if not room:
                    break
                bn = min(room, key=lambda x: (x[1], x[2]))
                bn[0].append(d)
                bn[1] += sz
                bn[2] += 1
            else:
                break
            n += 1
        batches = [sorted(bn[0]) for bn in bins]
        out_abs = os.path.abspath(self.out)
        calls = []
        for i, b in enumerate(batches):
            call = {"file_path": os.path.join(out_abs, page), "root": out_abs,
                    "files": {d: d for d in b}}
            if i:
                call["url"] = "<url returned by publish 1>"
            else:
                call["icon"] = "portfolio"  # the publish tool wants one generic word on a first publish
            calls.append(call)
        odd = sorted({os.path.splitext(d)[1].lower() for d in sizes} - COMMON_EXT - {""})
        return {"mode": self.mode, "out": out_abs, "files": len(sizes), "bytes": total,
                "batches": [{"files": len(b) + (1 if i == 0 else 0),
                             "bytes": sum(sizes[d] for d in b) + (sizes.get(page, 0) if i == 0 else 0)}
                            for i, b in enumerate(batches)],
                "uncommon_ext": odd, "errors": errors, "publish": calls,
                **({"left_out": [d for d, _ in self.left_out]} if self.left_out else {})}


# ---------------------------------------------------------------- serve + smoke

class QuietHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      ".wasm": "application/wasm", ".js": "text/javascript", ".mjs": "text/javascript"}

    def log_message(self, *a):
        pass


class QuietServer(http.server.ThreadingHTTPServer):
    daemon_threads = True

    def handle_error(self, request, client_address):
        pass  # the browser drops media connections mid-transfer; that is not an error


def start_server(directory, port):
    handler = functools.partial(QuietHandler, directory=directory)
    try:
        srv = QuietServer(("127.0.0.1", port), handler)
    except OSError as e:
        die(f"cannot serve on 127.0.0.1:{port}: {e}\n"
            f"  The copy is complete in {directory}; only the smoke/serve step did not run.\n"
            f"  Use a free --port (stop your own http.server on {port} first, e.g. kill $(lsof -ti :{port})).")
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


SMOKE_JS = r"""
const pw = require(process.env.PW_PATH);
const [base, pagesJson, shots, blockedJson, waitMs, localOnly] = process.argv.slice(2);
const pages = JSON.parse(pagesJson), blocked = JSON.parse(blockedJson), wait = +waitMs || 2500;
const origin = new URL(base).origin;
(async () => {
  const browser = await pw.chromium.launch();
  const results = [];
  for (const width of [390, 1440]) {
    const ctx = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 } });
    await ctx.route('**/*', r => blocked.some(h => new URL(r.request().url()).hostname.endsWith(h)) ? r.abort() : r.continue());
    for (const p of pages) {
      const page = await ctx.newPage();
      const errs = [];
      page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
      page.on('pageerror', e => errs.push('pageerror: ' + e.message));
      page.on('requestfailed', r => {
        const u = r.url();
        if (blocked.some(h => { try { return new URL(u).hostname.endsWith(h); } catch (e) { return false; } })) return;
        const why = (r.failure() || {}).errorText || '';
        // the browser cancels media downloads it no longer needs; a 404 still shows as 'http 404'
        if (why.includes('ERR_ABORTED') && r.resourceType() === 'media') return;
        errs.push('failed: ' + u + ' ' + why);
      });
      page.on('response', r => { if (r.status() >= 400) errs.push('http ' + r.status() + ': ' + r.url()); });
      // a copy that must be self-contained: any request that leaves it is a failure
      if (localOnly === '1') page.on('request', r => {
        const u = r.url();
        if (/^(data|blob|about):/.test(u)) return;
        try { if (new URL(u).origin !== origin) errs.push('outside the copy: ' + u); } catch (e) {}
      });
      try {
        await page.goto(base + p, { waitUntil: 'load', timeout: 30000 });
        await page.waitForTimeout(wait);
        if (shots) await page.screenshot({ path: `${shots}/${p.replace(/[^\w.-]+/g, '_')}-${width}.png` });
        // scroll through once so lazy media and in-view code also load
        for (const f of [0.33, 0.66, 1]) {
          await page.evaluate(f => window.scrollTo(0, document.documentElement.scrollHeight * f), f);
          await page.waitForTimeout(500);
        }
      } catch (e) { errs.push('goto: ' + e.message); }
      results.push({ page: p, width, errors: errs });
      await page.close();
    }
    await ctx.close();
  }
  await browser.close();
  console.log(JSON.stringify(results));
})().catch(e => { console.error(e); process.exit(3); });
"""


def smoke(out, pages, port, shots, wait=2500, local_only=False):
    pw = os.environ.get("PW_PATH", "/opt/node22/lib/node_modules/playwright")
    node = shutil.which("node") or "/opt/node22/bin/node"
    if not os.path.exists(pw):
        die(f"Playwright not found at {pw} (set PW_PATH)")
    srv = start_server(out, port)
    base = f"http://127.0.0.1:{srv.server_address[1]}/"
    with tempfile.TemporaryDirectory() as td:
        js = os.path.join(td, "smoke.js")
        with open(js, "w") as fh:
            fh.write(SMOKE_JS)
        if shots:
            os.makedirs(shots, exist_ok=True)
        r = subprocess.run([node, js, base, json.dumps(pages), shots or "", json.dumps(BLOCKED_HOSTS),
                            str(wait), "1" if local_only else ""],
                           capture_output=True, text=True, env={**os.environ, "PW_PATH": pw}, cwd=td)
    srv.shutdown()
    if r.returncode != 0:
        die(f"smoke run failed:\n{r.stderr[-2000:]}")
    results = json.loads(r.stdout.strip().splitlines()[-1])
    bad = 0
    print("\nsmoke (0 console errors, 0 failed requests expected):")
    for res in results:
        n = len(res["errors"])
        bad += n
        print(f"  {'ok  ' if not n else 'FAIL'} {res['width']:>4}  {res['page']}" + (f"  ({n})" if n else ""))
        for e in res["errors"][:8]:
            print(f"         {e}")
    return bad


# ---------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser(
        description="Build an artifact-ready copy of the site or the Studio (see the module docstring).",
        epilog="examples:\n"
               "  python3 tools/preview.py studio --out $SCRATCH/studio-pub\n"
               "  python3 tools/preview.py site --out $SCRATCH/site-pub --smoke --port 8986\n"
               "  python3 tools/preview.py studio --serve 8986   # look at it in a browser\n"
               "  python3 tools/preview.py samples --out $SCRATCH/samples-pub --smoke\n"
               "  python3 tools/preview.py site --dry-run          # plan only, writes nothing",
        formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("mode", choices=sorted(MODES),
                    help="site: the whole site; studio: next/ standalone; samples: the catalog of sample sites")
    ap.add_argument("--out", help="output folder (default: a new temp dir); replaced on re-run")
    ap.add_argument("--dry-run", action="store_true", help="scan and plan only, write nothing")
    ap.add_argument("--serve", type=int, metavar="PORT", help="after building, serve the copy on 127.0.0.1:PORT")
    ap.add_argument("--smoke", action="store_true",
                    help="after building, load key pages in Chromium at 390 and 1440 and fail on any "
                         "console error or failed request")
    ap.add_argument("--port", type=int, default=0, help="port for --smoke (default: any free port)")
    ap.add_argument("--pages", help="comma list of copy paths for --smoke (default: the mode's key pages)")
    ap.add_argument("--shots", help="folder for --smoke screenshots")
    ap.add_argument("--strict", action="store_true",
                    help="exit 2 when any reference is unresolved (default: report only)")
    ap.add_argument("--json", action="store_true", help="print the full plan as JSON (publish calls included)")
    ap.add_argument("-v", "--verbose", action="store_true", help="list every rewritten file and info notes")
    a = ap.parse_args()

    if a.dry_run and (a.serve or a.smoke):
        die("--dry-run cannot be combined with --serve or --smoke")
    if a.out:
        out = os.path.abspath(a.out)
        if out == ROOT or out.startswith(ROOT + os.sep):
            die("--out must be outside the repo (a copy inside it would be copied into the next one)")
    elif a.dry_run:
        out = os.path.join(tempfile.gettempdir(), f"preview-{a.mode}-DRYRUN")
    else:
        out = tempfile.mkdtemp(prefix=f"preview-{a.mode}-")
    b = Build(a.mode, out, a.dry_run)
    b.run()
    plan = b.plan()
    if not a.dry_run:
        with open(os.path.join(out, PLAN_NAME), "w") as fh:
            json.dump(plan, fh, indent=1)

    if a.json:
        print(json.dumps(plan, indent=1))
    else:
        print(f"preview {a.mode}: {plan['files']} files, {plan['bytes']/1e6:.1f} MB"
              f"{' (dry run, nothing written)' if a.dry_run else ' -> ' + out}")
        renamed = sorted(d for s, d in b.dst.items() if d != s and (d.endswith(".wasm") or s.split('/')[0].startswith('_')))
        moved = sum(1 for s, d in b.dst.items() if s != d)
        print(f"  {moved} files moved or renamed, {sum(b.rewrites.values())} references rewritten in {len(b.rewrites)} files")
        for d in renamed if a.mode == "studio" or a.verbose else [d for d in renamed if d.endswith(".wasm")]:
            print(f"    renamed: {d}")
        if a.verbose:
            for d, n in sorted(b.rewrites.items()):
                print(f"    rewrote {n:>3}  {d}")
        if len(plan["batches"]) == 1:
            print("  fits in one publish (<= 250 files, <= 60 MB)")
        else:
            print(f"  over one publish: {len(plan['batches'])} batches")
        for i, bt in enumerate(plan["batches"]):
            print(f"    batch {i + 1}: {bt['files']} files, {bt['bytes']/1e6:.1f} MB")
        if b.left_out:
            print(f"  left out to fit the version limit ({len(b.left_out)} unreferenced files, "
                  f"{sum(n for _, n in b.left_out)/1e6:.1f} MB):")
            for d, n in b.left_out:
                print(f"    {d}  {n/1e6:.1f} MB")
        if plan["uncommon_ext"]:
            print(f"  uncommon types (check the publish accepts them): {', '.join(plan['uncommon_ext'])}")
        warns = [i for i in b.issues if i[0] == "warn"]
        infos = [i for i in b.issues if i[0] == "info"]
        if warns:
            print(f"  unresolved references ({len(warns)}, left as they are):")
            for _, f, m in warns:
                print(f"    {f}: {m}")
        if b.queries:
            print(f"  query strings (the host keeps only #hash) ({len(b.queries)}):")
            for f, r in b.queries:
                print(f"    {f}: {r}")
        if a.verbose:
            for _, f, m in infos:
                print(f"    info {f}: {m}")
        if not a.dry_run:
            nflags = 0
            for d in b.dst.values():
                if d.endswith(".html") and os.path.isfile(os.path.join(out, d)):
                    with open(os.path.join(out, d), encoding="utf-8", errors="replace") as fh:
                        nflags += len(re.findall(r'<mark\b[^>]*\bclass="[^"]*\bflag\b', fh.read()))
            if nflags:
                print(f"  {nflags} open owner flag(s) in this copy: they show as dotted underlines with a question "
                      "(python3 tools/check-flags.py lists them)")
            print(f"  publish plan: {os.path.join(out, PLAN_NAME)} (or rerun with --json)")
            print(f"  publish: {len(plan['publish'])} Artifact publish call(s), file_path {out}/index.html, "
                  "icon \"portfolio\" on call 1; calls 2+ add url= from call 1")
    if a.strict and any(i[0] == "warn" for i in b.issues):
        plan["errors"].append("unresolved references (--strict)")
    if plan["errors"]:
        for e in plan["errors"]:
            print(f"preview: host rule broken: {e}", file=sys.stderr)
        sys.exit(2)

    if a.smoke:
        cfg = MODES[a.mode]
        pages = cfg["smoke"]
        if pages == "entry_links":   # the entry and every page it links to, in the order it lists them
            pages = list(dict.fromkeys(["index.html"] + b.entry_links))
        pages = a.pages.split(",") if a.pages else pages
        pages = [p for p in pages if p.split("#")[0] in b.dst.values()] or die("no smoke pages exist in the copy")
        bad = smoke(out, pages, a.port, a.shots, cfg.get("smoke_wait", 2500), cfg.get("local_only", False))
        if bad:
            sys.exit(1)
    if a.serve:
        srv = start_server(out, a.serve)
        print(f"serving {out} at http://127.0.0.1:{a.serve}/  (Ctrl-C to stop)")
        try:
            threading.Event().wait()
        except KeyboardInterrupt:
            srv.shutdown()


if __name__ == "__main__":
    main()
