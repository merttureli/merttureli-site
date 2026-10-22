"""robots: private areas stay out of search, public pages stay in.

FAIL
  - an HTML page under next/, studies/ or docs/ without <meta name="robots" content="noindex">
  - robots.txt does not Disallow /next/, /studies/ or /docs/ (when the folder exists)
  - a sitemap.xml URL that robots.txt disallows or whose page says noindex
WARN
  - other non-page folders that exist but robots.txt allows (cards/, src/, tools/,
    templates/, content/)
  - a sitemap page whose <link rel="canonical"> is not its sitemap URL
"""
import re
from urllib.parse import urlsplit

from . import Result, PASS, WARN, FAIL, SITE_HOST

NAME = "robots"
TITLE = "robots.txt / noindex / sitemap sanity"
MODES = {"fast", "default", "full"}

STRICT = ("next/", "studies/", "docs/")
SOFT = ("cards/", "src/", "tools/", "templates/", "content/")
NOINDEX = re.compile(r"<meta\b(?=[^>]*\bname\s*=\s*[\"']?robots)(?=[^>]*\bcontent\s*=\s*[\"'][^\"']*noindex)[^>]*>",
                     re.I)
CANONICAL = re.compile(r"<link\b(?=[^>]*\brel\s*=\s*[\"']?canonical)[^>]*\bhref\s*=\s*[\"']([^\"']+)", re.I)


def rules(text):
    """Allow/Disallow rules that apply to every crawler (User-agent: *)."""
    out, applies, in_group = [], False, False
    for raw in text.splitlines():
        line = raw.split("#", 1)[0].strip()
        if ":" not in line:
            continue
        key, val = [x.strip() for x in line.split(":", 1)]
        key = key.lower()
        if key == "user-agent":
            if not in_group:
                applies = False
            in_group = True
            applies = applies or val == "*"
            continue
        in_group = False
        if applies and key in ("allow", "disallow") and val:
            out.append((key == "allow", val))
    return out


def pattern(val):
    rx = "".join(".*" if ch == "*" else re.escape(ch) for ch in val.rstrip("$"))
    return re.compile(rx + ("$" if val.endswith("$") else ""))


def allowed(rule_list, path):
    """Google semantics: the longest matching rule wins, Allow wins a tie."""
    best = (-1, True)
    for allow, val in rule_list:
        if pattern(val).match(path):
            key = (len(val), allow)
            if key > best:
                best = key
    return best[1]


def run(ctx):
    files = set(ctx.files())
    errors, warnings = [], []
    if "robots.txt" not in files:
        return Result(FAIL, "robots.txt missing")
    rl = rules(open(ctx.path("robots.txt"), encoding="utf-8").read())

    checked = 0
    for folder in STRICT:
        present = [f for f in files if f.startswith(folder)]
        if not present:
            continue
        if allowed(rl, "/" + folder):
            errors.append("robots.txt: add 'Disallow: /%s' (%d files under %s are crawlable)" % (folder, len(present), folder))
        for f in sorted(present):
            if f.endswith((".html", ".htm")) and "/node_modules/" not in f:
                checked += 1
                head = open(ctx.path(f), encoding="utf-8", errors="replace").read()
                if not NOINDEX.search(head):
                    errors.append('%s: add <meta name="robots" content="noindex"> to <head>' % f)
    for folder in SOFT:
        if any(f.startswith(folder) for f in files) and allowed(rl, "/" + folder):
            warnings.append("robots.txt allows /%s (not site pages; consider 'Disallow: /%s')" % (folder, folder))

    sitemap = 0
    if "sitemap.xml" in files:
        text = open(ctx.path("sitemap.xml"), encoding="utf-8").read()
        for loc in re.findall(r"<loc>\s*([^<\s]+)\s*</loc>", text):
            sitemap += 1
            parts = urlsplit(loc)
            if parts.netloc not in (SITE_HOST, "www." + SITE_HOST):
                warnings.append("sitemap.xml: %s is not on %s" % (loc, SITE_HOST))
                continue
            path = parts.path or "/"
            if not allowed(rl, path):
                errors.append("sitemap.xml lists %s but robots.txt disallows it" % loc)
            rel = path.lstrip("/")
            rel = rel + "index.html" if rel == "" or rel.endswith("/") else rel
            if rel not in files:
                continue  # the links check reports missing targets
            page = open(ctx.path(rel), encoding="utf-8", errors="replace").read()
            if NOINDEX.search(page):
                errors.append("sitemap.xml lists %s but %s says noindex" % (loc, rel))
            m = CANONICAL.search(page)
            if m and m.group(1) != loc:
                warnings.append("%s: canonical %s differs from its sitemap URL %s" % (rel, m.group(1), loc))
    else:
        warnings.append("sitemap.xml missing")

    summary = "%d private pages noindex, %d sitemap URLs indexable" % (checked, sitemap)
    if errors:
        return Result(FAIL, errors[0] + (" (+%d more)" % (len(errors) - 1) if len(errors) > 1 else ""),
                      errors + warnings)
    if warnings:
        return Result(WARN, "%s; %d notes" % (summary, len(warnings)), warnings)
    return Result(PASS, summary)
