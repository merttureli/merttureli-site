#!/usr/bin/env python3
"""
Build the live pages from the Studio sources in next/.

    python3 tools/build.py            # rebuild everything
    python3 tools/build.py --check    # build in memory, diff against the committed files,
                                      # exit 1 on any difference (writes nothing)
    python3 tools/build.py --serve [PORT]  # serve the repo on 127.0.0.1:PORT (default 8000)
    python3 tools/build.py --help     # this text

Sources (edit these):
    next/index.html, next/websites.html   the Studio home and websites page
    content/projects/<slug>.json          case study words and numbers
    tools/build-studio-cases.py           case page presentation (PRESENT, ORDER)
    LIVE below                            the live-only head: titles, share cards, JSON-LD

Output (commit these with their sources, never edit them by hand):
    next/projects/<slug>.html   written by tools/build-studio-cases.py (noindex Studio copy)
    index.html                  <- next/index.html
    websites.html               <- next/websites.html
    beyond.html                 <- next/beyond.html (once that file exists)
    projects/<slug>.html        <- next/projects/<slug>.html
The list is PAGES below: publishing another Studio page is one line there.

Each live page is its next/ source, rebased to its place at the root: every relative
URL (href, src, srcset, poster, data-src, data-sm-src, url()) is re-pointed so it
reaches the same file from the new folder, and a link to another Studio page goes to
that page's live twin. Assets stay where they are (next/css, next/js, next/assets,
assets/, studies/shared/). Then the head gets the live tags: no noindex, the live
title and description, share card, icons, JSON-LD on the home page, and the same
analytics includes as before (privacy.html describes them). A live page that would
link to a next/ page without a twin is a build error.

Stdlib only, no browser. docs/recipes/release.md has the release steps.
"""

import difflib
import functools
import html
import http.server
import importlib.util
import io
import json
import os
import posixpath
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = "https://merttureli.com/"


def studio_cases():
    """tools/build-studio-cases.py as a module (the dash keeps it out of a plain import)."""
    path = os.path.join(ROOT, "tools", "build-studio-cases.py")
    spec = importlib.util.spec_from_file_location("build_studio_cases", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# ------------------------------------------------------------------ live head

# Titles, descriptions and share images are the copy the live site already used.
HOME_LD = {
    "@context": "https://schema.org", "@type": "ProfilePage",
    "mainEntity": {
        "@type": "Person", "name": "Mert Tureli", "alternateName": "Mert Türeli",
        "jobTitle": "Deployment Engineer",
        "worksFor": {"@type": "Organization", "name": "Base Power Company"},
        "url": SITE,
        "address": {"@type": "PostalAddress", "addressLocality": "Austin", "addressRegion": "TX",
                    "addressCountry": "US"},
        "alumniOf": {"@type": "CollegeOrUniversity", "name": "Union College"},
        "sameAs": ["https://www.linkedin.com/in/merttureli"],
    },
}

TRACK = ["js/analytics-config.js", "js/track.js"]
CLARITY = TRACK + ["js/clarity.js"]   # privacy.html: Clarity on the home and project pages only

# Old home addresses with no section of the same name on the Studio home.
LEGACY_HASHES = {"#charger-explorer": "#charger"}

# next/ page -> live page at the root. One line per page: add a line to publish another
# Studio page (docs/recipes/new-page.md). A line whose next/ file does not exist yet is
# skipped. The case pages are added after these, one per slug in ORDER of
# tools/build-studio-cases.py: next/projects/<slug>.html -> projects/<slug>.html.
PAGES = [
    ("next/index.html", "index.html"),
    ("next/websites.html", "websites.html"),
    ("next/beyond.html", "beyond.html"),
]

# Live head per page. A page without an entry keeps its own title and description and
# gets the home share card and the analytics include without Clarity.
DEFAULT_LIVE = {
    "og_type": "website", "image": "assets/og/cover-v1.png",
    "image_alt": "Mert Tureli, mechanical engineer in Austin, Texas, beside a render of the CHARGER rocket.",
    "scripts": TRACK,
}

LIVE = {
    "index.html": {
        "title": "Mert Tureli · Mechanical Engineer",
        "og_type": "website", "image": "assets/og/cover-v1.png",
        "image_alt": "Mert Tureli, mechanical engineer in Austin, Texas, beside a render of the CHARGER rocket.",
        "ld": HOME_LD, "scripts": CLARITY, "legacy": LEGACY_HASHES,
    },
    "websites.html": {
        "title": "Website design and build · Mert Tureli",
        "og_type": "website", "image": "assets/og/websites-v1.png",
        "image_alt": "Websites, designed and built by Mert Tureli. A browser window showing the Mert Tureli "
                     "site with the CHARGER rocket.",
        "scripts": TRACK,
    },
}


def case_live(slug):
    """Live head for projects/<slug>.html, from content/projects/<slug>.json."""
    with io.open(os.path.join(ROOT, "content", "projects", slug + ".json"), encoding="utf-8") as f:
        case = json.load(f)
    return {"title": "%s · Mert Tureli" % case.get("seo_title", case["title"]),
            "description": case["description"], "og_type": "article",
            "image": "assets/og/case-%s-v1.png" % slug, "image_alt": case["og_alt"], "scripts": CLARITY}


# ------------------------------------------------------------------ rebasing

SKIP = re.compile(r"^(?:#|[a-z][a-z0-9+.-]*:|//|/)", re.I)
ATTR = re.compile(r"""(\s(?:href|src|poster|data-src|data-sm-src|action)=)(["'])([^"']*)\2""", re.I)
SRCSET = re.compile(r"""(\ssrcset=)(["'])([^"']*)\2""", re.I)
CSSURL = re.compile(r"""url\((["']?)([^"')]+)\1\)""")


class BuildError(Exception):
    pass


def rebase_url(url, src, dst, twins):
    """url as written in repo file src -> the same target, written from dst."""
    if not url or SKIP.match(url):
        return url
    m = re.match(r"^([^?#]*)(.*)$", url)
    path, tail = m.group(1), m.group(2)
    if not path:
        return url
    target = posixpath.normpath(posixpath.join(posixpath.dirname(src), path))
    if target.startswith("../"):
        raise BuildError("%s: %s points outside the repo" % (src, url))
    target = twins.get(target, target)
    if target.startswith("next/") and target.endswith((".html", ".htm")):
        raise BuildError("%s: %s is a Studio page with no live twin; a live page must not link into next/"
                         % (src, url))
    if path.endswith("/") and not target.endswith("/"):
        target += "/"
    rel = posixpath.relpath(target, posixpath.dirname(dst) or ".")
    if path.endswith("/") and not rel.endswith("/"):
        rel += "/"
    return rel + tail


def rebase(text, src, dst, twins):
    fix = lambda u: rebase_url(u, src, dst, twins)

    def srcset(m):
        items = []
        for part in m.group(3).split(","):
            bits = part.strip().split(None, 1)
            if bits:
                items.append(" ".join([fix(bits[0])] + bits[1:]))
        return "%s%s%s%s" % (m.group(1), m.group(2), ", ".join(items), m.group(2))

    text = ATTR.sub(lambda m: "%s%s%s%s" % (m.group(1), m.group(2), fix(m.group(3)), m.group(2)), text)
    text = SRCSET.sub(srcset, text)
    return CSSURL.sub(lambda m: "url(%s%s%s)" % (m.group(1), fix(m.group(2)), m.group(1)), text)


# ------------------------------------------------------------------ live head

def esc(s):
    return html.escape(s, quote=True)


def live_head(text, src, dst, live):
    url = SITE + ("" if dst == "index.html" else dst)
    text = re.sub(r'<meta name="robots" content="noindex">\n', "", text, count=1)
    if live.get("title"):
        text, n = re.subn(r"<title>[^<]*</title>", "<title>%s</title>" % esc(live["title"]), text, count=1)
        if not n:
            raise BuildError("%s: no <title>" % src)
    if live.get("description"):
        text = re.sub(r'<meta name="description" content="[^"]*">',
                      '<meta name="description" content="%s">' % esc(live["description"]), text, count=1)
    m = re.search(r'<meta name="description" content="([^"]*)">', text)
    if not m:
        raise BuildError("%s: no <meta name=\"description\">" % src)
    desc = html.unescape(m.group(1))
    title = html.unescape(re.search(r"<title>([^<]*)</title>", text).group(1))
    canon = re.search(r'<link rel="canonical" href="([^"]*)">', text)
    if not canon or canon.group(1) != url:
        raise BuildError('%s: add <link rel="canonical" href="%s"> after its noindex meta' % (src, url))
    tags = [
        '<link rel="icon" href="/assets/icons/favicon.ico" sizes="32x32">',
        '<link rel="icon" href="/assets/icons/favicon.svg" type="image/svg+xml">',
        '<link rel="apple-touch-icon" href="/assets/icons/apple-touch-icon.png">',
        '<meta property="og:title" content="%s">' % esc(title),
        '<meta property="og:description" content="%s">' % esc(desc),
        '<meta property="og:type" content="%s">' % live["og_type"],
        '<meta property="og:url" content="%s">' % url,
        '<meta property="og:site_name" content="Mert Tureli">',
        '<meta property="og:image" content="%s%s">' % (SITE, live["image"]),
        '<meta property="og:image:width" content="1200">',
        '<meta property="og:image:height" content="630">',
        '<meta property="og:image:alt" content="%s">' % esc(live["image_alt"]),
        '<meta name="twitter:card" content="summary_large_image">',
    ]
    if live.get("ld"):
        tags.append('<script type="application/ld+json">\n%s\n</script>'
                    % json.dumps(live["ld"], ensure_ascii=False, separators=(",", ":")))
    if live.get("legacy"):
        tags.append("<script>\n// Addresses from the old home page that have no section of that name here.\n"
                    "(function (to) { if (to) location.replace(to); })(%s[location.hash]);\n</script>"
                    % json.dumps(live["legacy"], separators=(",", ":")))
    text = text.replace(canon.group(0), canon.group(0) + "\n" + "\n".join(tags), 1)
    up = posixpath.relpath(".", posixpath.dirname(dst) or ".")
    up = "" if up == "." else up + "/"
    scripts = "".join('<script src="%s%s"></script>\n' % (up, s) for s in live["scripts"])
    if text.count("</body>") != 1:
        raise BuildError("%s: expected one </body>" % src)
    return text.replace("</body>", scripts + "</body>")


def stamp(text, src):
    text = re.sub(r"<!-- Generated by [^\n]*-->\n", "", text, count=1)
    line = "<!-- Generated by tools/build.py from %s. Do not edit by hand. -->\n" % src
    return re.sub(r"^(<!doctype html>\n)", lambda m: m.group(1) + line, text, count=1, flags=re.I)


# ------------------------------------------------------------------ build

def build():
    """{repo path: content} for every generated file, in memory."""
    cases = studio_cases()
    out = {}
    for path, text in cases.build().items():
        out[os.path.relpath(path, ROOT).replace(os.sep, "/")] = text
    pairs = [(src, dst) for src, dst in PAGES if os.path.isfile(os.path.join(ROOT, src))]
    pairs += [("next/projects/%s.html" % s, "projects/%s.html" % s) for s in cases.ORDER]
    twins = dict(pairs)
    for src, dst in pairs:
        text = out.get(src)
        if text is None:
            with io.open(os.path.join(ROOT, src), encoding="utf-8") as f:
                text = f.read()
        slug = dst[len("projects/"):-len(".html")] if dst.startswith("projects/") else None
        live = case_live(slug) if slug else LIVE.get(dst, DEFAULT_LIVE)
        out[dst] = stamp(live_head(rebase(text, src, dst, twins), src, dst, live), src)
    return out


def check():
    status = 0
    for rel, new in sorted(build().items()):
        path = os.path.join(ROOT, rel)
        old = io.open(path, encoding="utf-8").read() if os.path.exists(path) else ""
        if old == new:
            print("ok: " + rel)
            continue
        status = 1
        diff = difflib.unified_diff(old.splitlines(True), new.splitlines(True), rel, "built " + rel)
        sys.stdout.writelines(list(diff)[:120])
        print("DIFFERS: " + rel)
    if status:
        print("The committed pages do not match their sources. Run python3 tools/build.py and commit.")
    return status


def write():
    wrote = []
    for rel, new in sorted(build().items()):
        path = os.path.join(ROOT, rel)
        old = io.open(path, encoding="utf-8").read() if os.path.exists(path) else None
        if old != new:
            os.makedirs(os.path.dirname(path), exist_ok=True)
            io.open(path, "w", encoding="utf-8", newline="\n").write(new)
            wrote.append(rel)
    print("build: wrote %d file(s)%s" % (len(wrote), (": " + ", ".join(wrote)) if wrote else ", all up to date"))
    return 0


def serve(port=8000):
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
    print("serving the repo on http://127.0.0.1:%d/" % port)
    http.server.ThreadingHTTPServer(("127.0.0.1", port), handler).serve_forever()


def main():
    args = sys.argv[1:]
    if "-h" in args or "--help" in args:
        print(__doc__.strip())
        return 0
    known = {"--check", "--serve"}
    unknown = [a for i, a in enumerate(args)
               if a not in known and not (i and args[i - 1] == "--serve" and a.isdigit())]
    if unknown:
        sys.stderr.write("tools/build.py: unknown argument %s (see --help)\n" % " ".join(unknown))
        return 2
    try:
        if "--check" in args:
            return check()
        if "--serve" in args:
            i = args.index("--serve")
            return serve(int(args[i + 1]) if len(args) > i + 1 else 8000)
        return write()
    except BuildError as e:
        sys.stderr.write("build error: %s\n" % e)
        return 2


if __name__ == "__main__":
    sys.exit(main())
