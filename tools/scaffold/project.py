#!/usr/bin/env python3
"""
Scaffold a new case study, or find every place a project is written down.

    python3 tools/new.py project <slug> --title "Title"    # via the dispatcher
    python3 tools/scaffold/project.py <slug> --title "Title" [options]

    --title T        the case title, the h1 (default: the slug in words)
    --nav-title T    the short name on other cases' Previous / Next buttons
                     (default: the title)
    --after SLUG     place it after SLUG in content/projects.json (default: last)
    --dry-run        print what would be written, write nothing
    --build          run python3 tools/build.py afterwards
    --root DIR       work on a copy of the repo instead of this one (tests)

    python3 tools/new.py project <slug> --where    # list the hand-written
                     places that name the project (home card, Studio, sitemap...)
    python3 tools/new.py project <slug> --remove [--dry-run]   # undo the
                     scaffold: order entry, sitemap line, case JSON, both
                     generated pages, then rebuild the neighbors
    python3 tools/scaffold/project.py --format         # rewrite content/*.json
                     in the house layout (same data, tidy diff)

What it writes:
    content/projects/<slug>.json   a minimal valid case; every bit of copy is a
                                   flag ([TBD]) so tools/check-flags.py lists it
    content/projects.json          the slug added to "order"
    sitemap.xml                    a <url> line for /projects/<slug>.html

It never writes src/projects/ or projects/ itself: run python3 tools/build.py
(or pass --build). It prints the checklist of hand-written places (home card,
Studio work list, share image) that a new project also needs. Running it again
for the same slug changes nothing that is already there.

Interface for tools/new.py (role 8):
    from scaffold import project       # with tools/ on sys.path
    project.HELP                       # one line for the kind list
    project.add_arguments(parser)      # an argparse parser or subparser
    sys.exit(project.run(args))        # returns an exit code
"""

import argparse
import datetime
import io
import json
import os
import re
import subprocess
import sys

HELP = "a case study page: content/projects/<slug>.json + order + sitemap line"

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SLUG_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
WIDTH = 100


# ------------------------------------------------------------- house JSON

def dump_json(obj):
    """
    JSON in the layout content/ uses: two-space indent, and any object or list
    that fits in WIDTH columns kept on one line. Same data as json.dumps.
    """
    return _fmt(obj, 0, 0) + "\n"


def _fmt(o, indent, used):
    one = json.dumps(o, ensure_ascii=False)
    if not isinstance(o, (dict, list)) or not o or indent + used + len(one) <= WIDTH:
        return one
    pad, pad0 = " " * (indent + 2), " " * indent
    if isinstance(o, list):
        items = [pad + _fmt(v, indent + 2, 0) for v in o]
        return "[\n" + ",\n".join(items) + "\n" + pad0 + "]"
    items = []
    for k, v in o.items():
        key = json.dumps(k, ensure_ascii=False) + ": "
        items.append(pad + key + _fmt(v, indent + 2, len(key)))
    return "{\n" + ",\n".join(items) + "\n" + pad0 + "}"


def _read(path):
    with io.open(path, encoding="utf-8") as f:
        return f.read()


def _write(path, text, dry, root=REPO):
    rel = os.path.relpath(path, root)
    if dry:
        print("--- would write %s ---\n%s" % (rel, text.rstrip("\n")))
        return
    d = os.path.dirname(path)
    if not os.path.isdir(d):
        os.makedirs(d)
    with io.open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)
    print("wrote " + rel)


# --------------------------------------------------------------- template

def template(slug, title, nav_title):
    """A minimal case that builds. All copy is flagged for the owner."""
    def f(key, note):
        return {"flag": "%s-%s" % (slug, key), "note": note, "text": "[TBD]"}
    return {
        "nav_title": nav_title,
        "title": title,
        "eyebrow": "Case study / TBD",
        "description": "TBD: one or two sentences for search results and link previews.",
        "og_alt": "TBD: describe assets/og/case-%s-v1.png." % slug,
        "lede": [f("lede", "Write the lede: one or two sentences under the title.")],
        "brief_label": None,
        "brief": [
            {"label": "Role", "value": f("role", "Your role on the project.")},
            {"label": "Timeline", "value": f("timeline", "Year or date range.")},
        ],
        "sections": [
            {"label": "The problem", "paras": [[f("problem", "What problem the project solves.")]]},
        ],
        # without a colophon the page reuses the home page's photo credit
        "colophon": [f("credits", "Footer credit line: who took the photos, what the renders are.")],
    }


# ------------------------------------------------------------------ steps

def _content_paths(root):
    return os.path.join(root, "content", "projects.json"), os.path.join(root, "content", "projects")


def add_to_order(root, slug, after, dry):
    index_path, _ = _content_paths(root)
    data = json.loads(_read(index_path))
    order = data["order"]
    if slug in order:
        print("content/projects.json already lists %s" % slug)
        return order
    if after:
        if after not in order:
            raise SystemExit("error: --after %s: not in content/projects.json order (%s)"
                             % (after, ", ".join(order)))
        order.insert(order.index(after) + 1, slug)
    else:
        order.append(slug)
    _write(index_path, dump_json(data), dry, root)
    return order


def add_to_sitemap(root, slug, order, dry):
    path = os.path.join(root, "sitemap.xml")
    if not os.path.exists(path):
        print("no sitemap.xml, skipped")
        return
    text = _read(path)
    loc = "https://merttureli.com/projects/%s.html" % slug
    if loc in text:
        print("sitemap.xml already lists %s" % loc)
        return
    lines = text.split("\n")
    line = "  <url><loc>%s</loc><lastmod>%s</lastmod></url>" % (loc, datetime.date.today().isoformat())
    # after the previous project in the order, else after the last project url
    at = None
    i = order.index(slug)
    for prev in reversed(order[:i]):
        hits = [n for n, l in enumerate(lines) if "/projects/%s.html<" % prev in l]
        if hits:
            at = hits[-1] + 1
            break
    if at is None:
        hits = [n for n, l in enumerate(lines) if "/projects/" in l]
        at = hits[-1] + 1 if hits else next(n for n, l in enumerate(lines) if "</urlset>" in l)
    lines.insert(at, line)
    _write(path, "\n".join(lines), dry, root)


CHECKLIST = """
Next steps for {slug}:
  1. Write the copy in content/projects/{slug}.json (docs/recipes/content.md has
     every field). Replace each {{"flag": ...}} with text as you answer it.
  2. Add media: "clip" (assets/motion/<base>-poster.webp + webm, see
     docs/recipes/media.md) or "hero_image", and "frames" in sections.
  3. Share image: assets/og/case-{slug}-v1.png, 1200x630 (the build warns
     until it exists).
  4. python3 tools/build.py, then python3 tools/build.py --check.
  5. Hand-written places that are NOT generated (python3 tools/new.py project
     {slug} --where lists them for an existing project):
       - home card: src/index.html, an <article> in <section id="work">
       - Studio: next/index.html work list <li class="project">, stage <img>,
         and the drift words (optional)
       - assets/portfolio-foundation/project-stories.json (only if it gets a
         walkthrough)
       - 404.html, websites.html, resume PDF: only if they should mention it
  6. Previous / Next on the neighboring cases changed: {neighbors}.
     tools/build.py rebuilds them too.
"""


def scaffold(root, slug, title=None, nav_title=None, after=None, dry=False, build=False):
    if not SLUG_RE.match(slug or ""):
        raise SystemExit("error: slug %r: use lower-case words joined by hyphens, e.g. "
                         "robo-catcher" % slug)
    index_path, folder = _content_paths(root)
    if not os.path.exists(index_path):
        raise SystemExit("error: %s not found. Is --root a copy of the site repo?" % index_path)
    order = json.loads(_read(index_path))["order"]
    if after and after not in order:
        raise SystemExit("error: --after %s: not in content/projects.json order (%s)"
                         % (after, ", ".join(order)))
    title = title or slug.replace("-", " ").capitalize()
    nav_title = nav_title or title
    case_path = os.path.join(folder, slug + ".json")
    if os.path.exists(case_path):
        print("content/projects/%s.json already exists, left unchanged" % slug)
    else:
        _write(case_path, dump_json(template(slug, title, nav_title)), dry, root)
    order = add_to_order(root, slug, after, dry)
    add_to_sitemap(root, slug, order, dry)
    i = order.index(slug)
    neighbors = sorted({order[i - 1] if i > 0 else None,
                         order[(i + 1) % len(order)] if len(order) > 1 else None} - {None, slug})
    print(CHECKLIST.format(slug=slug, neighbors=", ".join(neighbors) or "none"))
    print("Undo all of this: python3 tools/new.py project %s --remove --dry-run" % slug)
    if build and not dry:
        sys.stdout.flush()  # keep this text above the build output when piped
        return subprocess.call([sys.executable, os.path.join(root, "tools", "build.py")], cwd=root)
    return 0


# ------------------------------------------------------------------ where

# Generated files (never edit) and folders that only document or build things.
SKIP_DIRS = {".git", "node_modules", "docs", "tools", ".claude", "_ds", "vx"}
GENERATED = {"index.html", "projects"}
SCAN_EXT = (".html", ".js", ".json", ".xml", ".txt", ".webmanifest")


def _terms(root, slug):
    terms = ["projects/%s.html" % slug, "case-%s" % slug]
    case_path = os.path.join(root, "content", "projects", slug + ".json")
    if os.path.exists(case_path):
        data = json.loads(_read(case_path))
        for name in (data.get("nav_title"), data.get("title")):
            if not name:
                continue
            name = re.sub(r"^The ", "", name)
            terms.append(name)
            if name[1:2].islower():  # "Rudder pedals" also finds "flight sim rudder pedals"
                terms.append(name[:1].swapcase() + name[1:])
    else:
        words = slug.replace("-", " ")
        terms += [words, words.capitalize()]
    return sorted(set(terms), key=len, reverse=True)


def where(root, slug, per_file=6, terms=None, footer=True):
    """Print file:line for every hand-written mention of a project."""
    terms = terms or _terms(root, slug)
    rx = re.compile("|".join(r"(?<![\w-])%s(?![\w-])" % re.escape(t) for t in terms))
    print("Searching for: " + ", ".join(terms))
    if footer:
        print("Source of truth for the case page: content/projects/%s.json (+ content/projects.json order)"
              % slug)
        print("Generated, never edit: index.html, projects/, src/projects/")
    print("")
    results = []
    for dirpath, dirnames, filenames in os.walk(root):
        rel_dir = os.path.relpath(dirpath, root)
        dirnames[:] = sorted(d for d in dirnames if d not in SKIP_DIRS
                             and not (rel_dir == "." and d in GENERATED | {"content"})
                             and not (rel_dir == "src" and d == "projects"))
        for name in sorted(filenames):
            if not name.endswith(SCAN_EXT) or (rel_dir == "." and name in GENERATED):
                continue
            path = os.path.join(dirpath, name)
            try:
                lines = _read(path).split("\n")
            except (UnicodeDecodeError, OSError):
                continue
            hits = [(n, l) for n, l in enumerate(lines, 1) if rx.search(l)]
            if hits:
                results.append((os.path.relpath(path, root), hits))
    # pages first, then Studio, then assets and scripts, then the prototypes
    groups = [("Pages (hand-written)", lambda r: os.sep not in r or r.startswith("src" + os.sep)),
              ("Studio (next/)", lambda r: r.startswith("next" + os.sep)),
              ("Design prototypes (studies/)", lambda r: r.startswith("studies" + os.sep)),
              ("Assets, scripts, other", lambda r: True)]
    done = set()
    for title, test in groups:
        rows = [(r, h) for r, h in results if r not in done and test(r)]
        if not rows:
            continue
        print("== " + title)
        for rel, hits in rows:
            done.add(rel)
            print("%s  %d line(s)" % (rel, len(hits)))
            for n, l in hits[:per_file]:
                m = rx.search(l)
                a = max(0, m.start() - 50)
                print("  %5d: %s" % (n, l[a:m.end() + 70].strip()))
            if len(hits) > per_file:
                print("         (+%d more)" % (len(hits) - per_file))
        print("")
    found = len(results)
    if not found:
        print("(no hits)")
    og = os.path.join(root, "assets", "og", "case-%s-v1.png" % slug)
    if footer:
        print("Share image: assets/og/case-%s-v1.png %s" % (slug, "exists" if os.path.exists(og) else "MISSING"))
    print("Resume: assets/Mert-Tureli-Resume.pdf is a PDF, check it by hand.")
    if footer:
        owned = [p for p in _owned(root, slug) if os.path.exists(os.path.join(root, p))]
        if owned:
            print("Files the case owns (generated or scaffolded): %s" % ", ".join(owned))
            print("Remove the case and its sitemap line: python3 tools/new.py project %s --remove --dry-run" % slug)
    return 0 if found else 1


# ----------------------------------------------------------------- remove

def _owned(root, slug):
    return ["content/projects/%s.json" % slug, "src/projects/%s.html" % slug, "projects/%s.html" % slug]


def remove(root, slug, dry=False, build=True):
    """Undo scaffold(): order entry, sitemap line, case JSON, generated pages; rebuild neighbors."""
    if not SLUG_RE.match(slug or ""):
        raise SystemExit("error: slug %r: use lower-case words joined by hyphens" % slug)
    index_path, _ = _content_paths(root)
    if not os.path.exists(index_path):
        raise SystemExit("error: %s not found. Is --root a copy of the site repo?" % index_path)
    data = json.loads(_read(index_path))
    owned = [p for p in _owned(root, slug) if os.path.exists(os.path.join(root, p))]
    if slug not in data["order"] and not owned:
        raise SystemExit("error: %s is not a project: not in content/projects.json order and no case files"
                         % slug)
    terms = _terms(root, slug)  # before the JSON goes, so the title is searched too
    changed = 0
    if slug in data["order"]:
        data["order"].remove(slug)
        _write(index_path, dump_json(data), dry, root)
        changed += 1
    sm = os.path.join(root, "sitemap.xml")
    if os.path.exists(sm):
        text = _read(sm)
        lines = text.split("\n")
        keep = [l for l in lines if "/projects/%s.html<" % slug not in l]
        if len(keep) != len(lines):
            if dry:
                print("--- would remove from sitemap.xml ---\n" +
                      "\n".join(l for l in lines if l not in keep))
            else:
                with io.open(sm, "w", encoding="utf-8", newline="\n") as f:
                    f.write("\n".join(keep))
                print("wrote sitemap.xml")
            changed += 1
    for rel in owned:
        if dry:
            print("would delete " + rel)
        else:
            os.remove(os.path.join(root, rel))
            print("deleted " + rel)
        changed += 1
    og = "assets/og/case-%s-v1.png" % slug
    if os.path.exists(os.path.join(root, og)):
        print("left in place: %s (the scaffold never makes it; git rm it if nothing else uses it)" % og)
    print("\n%s (clear these by hand; none is generated):" % (
        "Named in hand-written places today (the sitemap line goes with --remove)" if dry
        else "Still named in hand-written places"))
    where(root, slug, terms=terms, footer=False)
    if dry:
        print("\nDry run: nothing changed. Drop --dry-run to remove; the neighbors are then rebuilt.")
        return 0
    if build and changed:
        sys.stdout.flush()
        return subprocess.call([sys.executable, os.path.join(root, "tools", "build.py")], cwd=root)
    return 0


# ----------------------------------------------------------------- format

def format_content(root, dry=False):
    index_path, folder = _content_paths(root)
    paths = [index_path] + sorted(os.path.join(folder, f) for f in os.listdir(folder)
                                  if f.endswith(".json"))
    changed = 0
    for path in paths:
        text = _read(path)
        try:
            data = json.loads(text)
        except ValueError as e:
            raise SystemExit("error: %s: invalid JSON: %s" % (os.path.relpath(path, root), e))
        tidy = dump_json(data)
        if tidy != text:
            changed += 1
            _write(path, tidy, dry, root)
    print("%d file(s) %s" % (changed, "to reformat" if dry else "reformatted") if changed
          else "content/ is already in the house layout")
    return 0


# -------------------------------------------------------------------- cli

def add_arguments(p):
    p.add_argument("name", nargs="?", help="project slug, lower-case-words (e.g. therma-shift)")
    p.add_argument("--title", help="case title, the h1 (default: the slug in words)")
    p.add_argument("--nav-title", help="short name on Previous / Next buttons (default: title)")
    p.add_argument("--after", metavar="SLUG", help="insert after SLUG in the order (default: last)")
    p.add_argument("--dry-run", action="store_true", help="print what would change, write nothing")
    p.add_argument("--build", action="store_true", help="run tools/build.py afterwards")
    p.add_argument("--where", action="store_true",
                   help="list the hand-written places that name the project, write nothing")
    p.add_argument("--remove", action="store_true",
                   help="undo the scaffold for this slug (order, sitemap line, case JSON, generated pages),"
                        " then rebuild; use --dry-run first")
    p.add_argument("--no-build", action="store_true", help="with --remove: skip the rebuild")
    p.add_argument("--format", action="store_true",
                   help="rewrite content/*.json in the house layout")
    p.add_argument("--root", default=REPO, help=argparse.SUPPRESS)
    return p


def run(args):
    root = os.path.abspath(args.root)
    if args.format:
        return format_content(root, args.dry_run)
    if not args.name:
        print("error: give a project slug, e.g. tools/new.py project my-project --title \"My project\"",
              file=sys.stderr)
        return 2
    if args.where:
        return where(root, args.name)
    if args.remove:
        return remove(root, args.name, args.dry_run, not args.no_build)
    return scaffold(root, args.name, args.title, args.nav_title, args.after, args.dry_run, args.build)


def main(argv=None):
    p = argparse.ArgumentParser(prog="tools/scaffold/project.py",
                                description=__doc__.split("\n\n")[0].strip(),
                                epilog="See docs/recipes/add-project.md.",
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    add_arguments(p)
    return run(p.parse_args(argv))


if __name__ == "__main__":
    try:
        sys.exit(main())
    except BrokenPipeError:  # output piped into head
        sys.exit(0)
