#!/usr/bin/env python3
"""Build the Studio case pages (product pages) from the case-study content.

    python3 tools/build-studio-cases.py              write next/projects/<slug>.html for every case
    python3 tools/build-studio-cases.py --check      exit 1 if a written page is out of date
    python3 tools/build-studio-cases.py --preview PUB
        after `python3 tools/preview.py studio --out PUB`: copy the case pages into PUB/projects/
        with their links rewritten for the standalone copy, and pull in the root assets they use.

Content stays single source: every word and number comes from content/projects/<slug>.json.
This script only decides presentation (which clip is the hero, which list becomes the spec
sheet, the order of the "next project" loop). Those choices live in PRESENT below.
Stdlib only, rerunnable, writes nothing outside next/projects/ (or PUB with --preview).

Page skeleton (Studio v5, "product showcase"):
  local nav  sticky bar: name, Overview / Highlights / How it works / Specs, Next pill
  hero       eyebrow, giant name, lede, a big stage (turntable clip on a clean ground), facts
  highlights the "stats" section as a feature strip of four tiles
  how        every other section as feature cards (media + text, text pairs, dark cards,
             statements, clip bands, photo bands)
  specs      brief + key figures + the list PRESENT names as "Details"
  next       closing CTA to the next project in ORDER, then the footer
"""
import argparse
import html
import json
import os
import re
import shutil
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONTENT = os.path.join(ROOT, "content", "projects")
OUT = os.path.join(ROOT, "next", "projects")

ORDER = ["charger", "robo-catcher", "therma-shift", "rudder-pedals", "bend-fixture"]

M = "../../assets/motion/"
IMG = "../assets/img/"

# Presentation only. Strings here are existing site copy (tags and one-liners from next/index.html).
PRESENT = {
    "charger": {
        "name": "CHARGER", "meta": "Airframe + payload / 2026",
        "line": "The competition rocket that won its event at Battle of the Rockets 2026.",
        "img": IMG + "charger-work.webp",
        "hero": {"clip": "charger-painted-wide", "md": None, "sm": None,
                 "cap": "Rendered from the flight model"},
        "specs_list": "The numbers", "rank": "The result",
        "ctas": [("../../assets/charger-explorer/index.html", "Take it apart in 3D")],
    },
    "robo-catcher": {
        "name": "Robo-Catcher", "meta": "Mechanism + firmware / 2025",
        "line": "A machine that catches the ball and returns it.",
        "img": IMG + "robo-catcher-1400.webp",
        "hero": {"clip": "robo-catcher-360", "md": 960, "sm": 960, "cap": "84 part CAD assembly"},
    },
    "therma-shift": {
        "name": "Therma-Shift", "meta": "Thermal + control electronics / 2026",
        "line": "A solid state coaster that heats or cools any mug or glass.",
        "img": IMG + "therma-shift-1400.webp",
        "hero": {"clip": "therma-shift-360-noflow", "md": 1280, "sm": 960, "cap": "Peltier stack, closed loop"},
        # the case JSON's own clip (the airflow illustration) explains the design section
        "attach": {"The design": "json-clip"},
        "specs_list": "Where it stands",
    },
    "rudder-pedals": {
        "name": "Rudder pedals", "meta": "Mechanism + firmware / 2026",
        "line": "Fighter style rudder and toe brake pedals for flight sims.",
        "img": IMG + "rudder-pedals-1400.webp",
        "hero": {"clip": "rudder-pedals-working", "md": 1280, "sm": 960, "cap": "Contactless Hall sensing"},
    },
    "bend-fixture": {
        # IP limited: a still only, never animated, nothing added beyond the case JSON
        "name": "Bend fixture", "meta": "Design for manufacture / 2026",
        "line": "A 3D printable 12 part three-point bend fixture.",
        "img": IMG + "bend-fixture-1280.webp",
        "hero": {"still": IMG + "bend-fixture-1280.webp", "cap": "Blurred, SunThru IP",
                 "alt": "Three-point bend fixture render, deliberately blurred because it is SunThru hardware"},
    },
}

FIELDS_USED = ("nav_title", "eyebrow", "description", "lede", "clip", "clip_ratio", "clip_aria",
               "clip_sizes", "brief", "brief_note", "sections", "colophon")


def esc(s):
    return html.escape(s, quote=True)


def fix(s):
    """Case JSON HTML is written for projects/<slug>.html: re-root it for next/projects/."""
    s = re.sub(r'\s+style="[^"]*"', "", s)
    s = s.replace('href="../', 'href="../../')
    s = re.sub(r'(src|href)="assets/', r'\1="../../assets/', s)
    return s


def text(v):
    """A paragraph is a string or a list of string parts."""
    return fix("".join(v) if isinstance(v, list) else v)


def strip_tags(s):
    return html.unescape(re.sub(r"<[^>]+>", "", s))


def heading_of(sec):
    if sec.get("label"):
        return sec["label"]
    if sec.get("anchor") == "project-result":
        return "The result"
    if sec.get("track"):
        t = sec["track"].replace("-", " ")
        return t[:1].upper() + t[1:]
    return ""


def video(vid, base, md, sm, poster, label=None, mode="view", alpha=True, ratio=None):
    suf = "-alpha" if alpha else ""
    a = ('aria-label="%s"' % esc(label)) if label else 'aria-hidden="true"'
    style = (' style="--ratio: %s"' % ratio) if ratio else ""
    name = lambda n: "%s%s%s%s.webm" % (M, base, ("-%d" % n) if n else "", suf)
    return ('<video id="%s" class="clip" data-clip="%s" muted loop playsinline preload="none" poster="%s" %s%s>'
            '<source data-src="%s" data-src-sm="%s" type="video/webm"></video>'
            % (vid, mode, poster, a, style, name(md), name(sm)))


def toggle(vid):
    return ('<button class="clip-toggle" type="button" data-clip-toggle aria-controls="%s" aria-pressed="false" hidden>'
            '<i aria-hidden="true"></i><span>Pause</span></button>' % vid)


def stage(case, p):
    h = p["hero"]
    idx = "%02d / %02d" % (ORDER.index(case["_slug"]) + 1, len(ORDER))
    if "still" in h:
        media = '<img src="%s" alt="%s" decoding="async" fetchpriority="high">' % (h["still"], esc(h["alt"]))
        tog = ""
    else:
        label = case.get("clip_aria") if h["clip"] == case.get("clip") else None
        label = label or "%s, turntable render from the CAD assembly" % p["name"]
        media = video("hero-clip", h["clip"], h["md"], h["sm"], M + h["clip"] + "-poster.webp", label=label)
        tog = toggle("hero-clip")
    cls = "stage__card" + (" stage__card--square" if h.get("square") else " stage__card--wide")
    return ('<div class="stage wrap"><div class="%s">\n'
            '  <span class="stage__idx label">%s</span>\n'
            '  <div class="stage__media">%s</div>\n'
            '  <span class="stage__cap label">%s</span>\n  %s\n</div></div>'
            % (cls, idx, media, esc(h["cap"]), tog))


def frames_html(frames):
    out = []
    for f in frames:
        cap = '<figcaption class="label">%s</figcaption>' % esc(f["caption"]) if f.get("caption") else ""
        out.append('<figure><img src="../../%s" alt="%s" loading="lazy" decoding="async">%s</figure>'
                   % (f["src"], esc(f.get("alt", "")), cap))
    return '<div class="feat__media" style="--n: %d">%s</div>' % (min(len(frames), 2), "".join(out))


def body_html(sec, rank=False, skip_list=False):
    parts = []
    for para in sec.get("paras", []):
        parts.append("<p>%s</p>" % text(para))
    if sec.get("cards"):
        parts.append('<ul class="chips2">%s</ul>' % "".join("<li>%s</li>" % fix(c) for c in sec["cards"]))
    if sec.get("list") and not skip_list:
        cls = "feat__list feat__list--rank" if rank else "feat__list"
        tag = "ol" if rank else "ul"
        parts.append('<%s class="%s">%s</%s>' % (tag, cls, "".join("<li>%s</li>" % text(i) for i in sec["list"]), tag))
    return "".join(parts)


def how(case, p):
    blocks, buf = [], []
    n = 0
    attach = p.get("attach", {})

    def flush():
        while buf:
            pair = buf[:2] if len(buf) >= 2 else buf[:1]
            del buf[:len(pair)]
            if len(pair) == 2:
                blocks.append('<div class="feat-pair">%s</div>' % "".join(pair))
            else:
                blocks.append(pair[0].replace('class="feat"', 'class="feat feat--text"', 1))

    for sec in case["sections"]:
        kind = sec.get("kind")
        if kind == "stats":
            continue
        title = heading_of(sec)
        is_specs = title and title == p.get("specs_list")
        if kind == "clip_band":
            flush()
            b = sec["base"]
            blocks.append('<figure class="band" data-reveal>%s%s<figcaption class="label">%s</figcaption></figure>'
                          % (video("band-" + b, b, 1280, 960, M + b + "-poster.webp", label=sec.get("caption"), alpha=False),
                             toggle("band-" + b), esc(sec.get("caption", ""))))
            continue
        if kind == "bleed":
            flush()
            blocks.append('<figure class="band band--photo" data-reveal><img src="../../%s" alt="%s" loading="lazy" decoding="async">'
                          '<figcaption class="label">%s</figcaption></figure>'
                          % (sec["src"], esc(sec.get("alt", "")), esc(sec.get("caption", ""))))
            continue
        body = body_html(sec, rank=(title == p.get("rank")), skip_list=is_specs)
        media = ""
        if title in attach and attach[title] == "json-clip":
            ratio = case.get("clip_ratio", "16 / 9")
            sizes = case.get("clip_sizes", [1200, 800])
            media = ('<div class="feat__media feat__media--clip">%s</div>'
                     % video("feat-clip", case["clip"], sizes[0], sizes[-1], M + case["clip"] + "-poster.webp",
                             label=case.get("clip_aria"), ratio=ratio))
        elif sec.get("frames"):
            media = frames_html(sec["frames"])
        if not body and not media:
            continue
        n += 1
        head = ('<div class="feat__head"><span class="label">%02d</span><h3 class="feat__title">%s</h3></div>' % (n, esc(strip_tags(title)))) if title else ""
        if sec.get("strong") and not media:
            flush()
            paras = "".join("<p>%s</p>" % text(x) for x in sec.get("paras", []))
            blocks.append('<div class="statement" data-reveal><span class="label">%02d / %s</span>%s</div>'
                          % (n, esc(strip_tags(title)), paras))
            continue
        cls = "feat"
        if sec.get("dark"):
            cls += " feat--dark"
        if media and sec.get("flip"):
            cls += " feat--flip"
        card = ('<div class="%s" data-reveal><div class="feat__text">%s<div class="feat__body">%s</div></div>%s</div>'
                % (cls, head, body, media))
        if media or sec.get("dark"):
            flush()
            blocks.append(card)
        else:
            buf.append(card)
    flush()
    return "\n".join(blocks)


def specs(case, p):
    rows = []
    for b in case.get("brief", []):
        rows.append((b["label"], fix(b["value"])))
    stats = next((s for s in case["sections"] if s.get("kind") == "stats"), None)
    if stats:
        rows.append(("Key figures", "<ul>%s</ul>" % "".join(
            "<li><b>%s</b> %s</li>" % (s["value"], fix(s["label"])) for s in stats["stats"])))
    if p.get("specs_list"):
        sec = next((s for s in case["sections"] if heading_of(s) == p["specs_list"]), None)
        if sec and sec.get("list"):
            rows.append(("Details", "<ul>%s</ul>" % "".join("<li>%s</li>" % text(i) for i in sec["list"])))
    dl = "".join('<div><dt>%s</dt><dd>%s</dd></div>' % (esc(k), v) for k, v in rows)
    col = case.get("colophon") or ""
    col = "".join(col) if isinstance(col, list) else col
    col = ('<p class="specsheet__colophon">%s</p>' % fix(col.strip())) if col.strip() else ""
    return ('<div class="specsheet" data-reveal>\n  <div class="specsheet__head"><span class="label">Tech specs</span>'
            '<p class="specsheet__name">%s</p><img class="specsheet__img" src="%s" alt="" decoding="async" fetchpriority="low"></div>\n'
            '  <div><dl>%s</dl>%s</div>\n</div>' % (esc(p["name"]), p["img"], dl, col))


def facts(case):
    items = "".join('<div><dt class="label">%s</dt><dd>%s</dd></div>' % (esc(b["label"]), fix(b["value"]))
                    for b in case.get("brief", []))
    notes = "".join('<p class="facts__note">%s</p>' % fix(n) for n in case.get("brief_note") or [])
    return '<div class="wrap"><dl class="facts">%s</dl>%s</div>' % (items, notes)


def stat_value(v):
    """'13.8 ft/s' -> '13.8<small>ft/s</small>' when the first word holds the number."""
    m = re.match(r"^(\S*\d\S*)\s+(.+)$", v)
    return "%s<small>%s</small>" % (m.group(1), m.group(2)) if m else v


def highlights(case):
    stats = next((s for s in case["sections"] if s.get("kind") == "stats"), None)
    if not stats:
        return ""
    items = "".join('<div class="hl__item"><dt>%s</dt><dd>%s</dd></div>' % (stat_value(s["value"]), fix(s["label"]))
                    for s in stats["stats"])
    return items


TOP_LINKS = [("Work", "../index.html#work"), ("Experience", "../index.html#experience"),
             ("Websites", "../index.html#websites"), ("Contact", "../index.html#contact")]
MENU_LINKS = [("Work", "../index.html#work"), ("Experience", "../index.html#experience"),
              ("Beyond", "../index.html#beyond"), ("Websites", "../index.html#websites"), ("Contact", "../index.html#contact")]


def page(case):
    slug = case["_slug"]
    p = PRESENT[slug]
    i = ORDER.index(slug)
    nxt = ORDER[(i + 1) % len(ORDER)]
    np_ = PRESENT[nxt]
    name = p["name"]
    long_cls = " phero__name--long" if len(name) > 10 else ""
    ctas = "".join('<a class="pillbtn" href="%s">%s</a>' % (h, esc(t)) for h, t in p.get("ctas", []))
    ctas = ('<div class="phero__ctas"><a class="pillbtn pillbtn--solid" href="#specs">Tech specs</a>%s</div>' % ctas) if ctas else ""
    top_nav = "\n    ".join('<a href="%s" data-magnetic>%s</a>' % (h, t) for t, h in TOP_LINKS)
    menu_nav = "\n      ".join('<a href="%s">%s</a>' % (h, t) for t, h in MENU_LINKS)
    hl = highlights(case)
    hl_sec = ('''
<section class="csec" id="highlights" aria-labelledby="hl-title">
  <div class="wrap">
    <div class="rule"><span class="label">Highlights</span><span class="label hide-s">%s</span></div>
    <h2 id="hl-title" class="sr-only">Highlights</h2>
    <dl class="hl" data-reveal>%s</dl>
  </div>
</section>''' % (esc(name), hl)) if hl else ""
    lnav_links = [("Overview", "#overview")] + ([("Highlights", "#highlights")] if hl else []) + \
                 [("How it works", "#how"), ("Specs", "#specs")]
    lnav = "".join('<a href="%s">%s</a>' % (h, t) for t, h in lnav_links)
    title = "%s, Mert Tureli" % name

    return f'''<!doctype html>
<!-- Generated by tools/build-studio-cases.py from content/projects/{slug}.json. Do not edit by hand. -->
<html lang="en" class="no-js">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<script src="../../studies/shared/study.js"></script>
<title>{esc(title)}</title>
<meta name="description" content="{esc(strip_tags(case["description"]))}">
<meta name="theme-color" content="#e7e8ea">
<link rel="preload" href="../../studies/shared/fonts/archivo-var.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="../../studies/shared/fonts/martian-mono-var.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="../css/tokens.css">
<link rel="stylesheet" href="../css/studio.css">
<link rel="stylesheet" href="../css/showcase.css">
</head>
<body class="case">
<a class="skip" href="#main">Skip to content</a>

<header class="top" data-top>
  <a class="wordmark" href="../index.html" aria-label="Mert Tureli, Studio home"><span class="wordmark__c">&copy;</span> Mert Tureli</a>
  <nav class="top__nav" aria-label="Main">
    {top_nav}
  </nav>
  <button class="menu-btn" type="button" aria-expanded="false" aria-controls="menu" data-menu-btn data-magnetic>
    <span class="menu-btn__lines" aria-hidden="true"></span><span class="sr-only">Menu</span>
  </button>
</header>

<div class="menu" id="menu" data-menu hidden>
  <div class="menu__panel">
    <p class="label">Navigation</p>
    <nav aria-label="Menu">
      {menu_nav}
    </nav>
    <div class="menu__foot">
      <a href="../../assets/Mert-Tureli-Resume.pdf">Resume (PDF)</a>
      <a href="https://linkedin.com/in/merttureli" rel="noopener">LinkedIn</a>
      <a href="mailto:merttureli0@gmail.com">merttureli0@gmail.com</a>
    </div>
  </div>
</div>

<nav class="lnav" aria-label="{esc(name)} sections" data-lnav>
  <div class="lnav__in wrap">
    <a class="lnav__name" href="#overview">{esc(name)}</a>
    <div class="lnav__links">{lnav}</div>
    <a class="pillbtn pillbtn--sm pillbtn--solid" href="{nxt}.html"><span class="hide-s">Next:&nbsp;</span>{esc(np_["name"])} <span class="arrow" aria-hidden="true"></span></a>
  </div>
</nav>

<main id="main">

<section class="phero" id="overview" aria-labelledby="case-title">
  <div class="wrap">
    <span class="phero__eyebrow label">{esc(strip_tags(case.get("eyebrow", "")))}</span>
    <h1 id="case-title" class="phero__name{long_cls}">{esc(name)}</h1>
    <p class="phero__lede">{fix(case["lede"])}</p>
    {ctas}
  </div>
  {stage(case, p)}
  {facts(case)}
</section>
{hl_sec}

<section class="csec" id="how" aria-labelledby="how-title">
  <div class="wrap">
    <div class="rule"><span class="label">How it works</span><span class="label hide-s">{esc(p["meta"])}</span></div>
    <div class="csec__head"><h2 id="how-title" class="display csec__title">How it <em class="serif">works</em></h2></div>
    <div class="how">
{how(case, p)}
    </div>
  </div>
</section>

<section class="csec" id="specs" aria-labelledby="specs-title">
  <div class="wrap">
    <div class="rule"><span class="label">Specs</span><span class="label hide-s">{esc(name)}</span></div>
    <h2 id="specs-title" class="sr-only">Tech specs</h2>
    {specs(case, p)}
  </div>
</section>

<section class="nextp" id="next" aria-labelledby="next-title">
  <div class="wrap">
    <div class="rule"><span class="label">Next project</span><span class="label">{i + 2 if i + 1 < len(ORDER) else 1:02d} / {len(ORDER):02d}</span></div>
    <a class="nextp__card" href="{nxt}.html" data-reveal>
      <span class="nextp__text">
        <span class="label">{esc(np_["meta"])}</span>
        <span id="next-title" class="nextp__name">{esc(np_["name"])}</span>
        <span class="nextp__line">{esc(np_["line"])}</span>
        <span class="pillbtn pillbtn--solid">See {esc(np_["name"])} <span class="arrow" aria-hidden="true"></span></span>
      </span>
      <span class="nextp__media"><img src="{np_["img"]}" alt="" decoding="async" fetchpriority="low"></span>
    </a>
    <p class="nextp__more"><a class="link" href="../index.html#work">All work</a><a class="link" href="mailto:merttureli0@gmail.com">Get in touch</a><a class="link link--quiet" href="../index.html">Studio home</a></p>
  </div>
</section>

<footer class="foot wrap">
  <div><p class="label">Version</p><p>2026 Studio</p></div>
  <div><p class="label">Local time</p><p data-clock>Austin</p></div>
  <div><p class="label">Socials</p><p><a class="link" href="https://linkedin.com/in/merttureli" rel="noopener">LinkedIn</a> <a class="link" href="mailto:merttureli0@gmail.com">Email</a></p></div>
  <p class="foot__credit">CAD renders from the source assemblies. Hand built, no framework.</p>
</footer>

</main>

<script src="../js/case.js" defer></script>
<script src="../js/clips.js" defer></script>
</body>
</html>
'''


def load(slug):
    with open(os.path.join(CONTENT, slug + ".json"), encoding="utf-8") as f:
        case = json.load(f)
    case["_slug"] = slug
    return case


def build():
    pages = {}
    for slug in ORDER:
        pages[os.path.join(OUT, slug + ".html")] = page(load(slug))
    return pages


def preview(pub):
    """Copy the case pages into a tools/preview.py studio copy and re-root their links."""
    if not os.path.isfile(os.path.join(pub, "index.html")):
        sys.exit("build-studio-cases: %s has no index.html; run tools/preview.py studio --out %s first" % (pub, pub))
    dst = os.path.join(pub, "projects")
    os.makedirs(dst, exist_ok=True)
    pulled = set()
    for path, src in build().items():
        out = src.replace("../../studies/shared/", "../shared/")

        def site(m):
            ref = m.group(2)
            rel = ref[len("../../assets/"):]
            pulled.add(rel)
            return m.group(1) + "../site/" + rel
        out = re.sub(r'((?:src|href|poster|data-src|data-src-sm)=")(\.\./\.\./assets/[^"#]+)', site, out)
        with open(os.path.join(dst, os.path.basename(path)), "w", encoding="utf-8") as f:
            f.write(out)
    for rel in sorted(pulled):
        s = os.path.join(ROOT, "assets", rel)
        d = os.path.join(pub, "site", rel)
        if rel.endswith("/") or rel.endswith(".html"):
            continue  # pages (the CHARGER explorer) are already in the copy when the home links them
        if not os.path.isfile(s):
            sys.exit("build-studio-cases: missing asset %s" % s)
        os.makedirs(os.path.dirname(d), exist_ok=True)
        if not os.path.isfile(d):
            shutil.copy2(s, d)
    # the artifact host refuses .step files: drop them (and the explorer's download link to them)
    steps = []
    for dirpath, _, names in os.walk(pub):
        for nm in names:
            if nm.lower().endswith(".step"):
                fp = os.path.join(dirpath, nm)
                steps.append(os.path.relpath(fp, pub).replace(os.sep, "/"))
                os.remove(fp)
    for dirpath, _, names in os.walk(pub):
        for nm in names:
            if nm.endswith(".html"):
                fp = os.path.join(dirpath, nm)
                src = open(fp, encoding="utf-8").read()
                new = re.sub(r'<a href="[^"]*\.step"[^>]*>.*?</a>', "", src)
                if new != src:
                    open(fp, "w", encoding="utf-8").write(new)
    # add the pages and pulled files to preview.py's publish plan, so the publish carries them
    plan_path = os.path.join(pub, ".preview-plan.json")
    if os.path.isfile(plan_path):
        with open(plan_path, encoding="utf-8") as f:
            plan = json.load(f)
        known = set()
        for call in plan.get("publish", []):
            for st in steps:
                if call.get("files", {}).pop(st, None) is not None:
                    plan["files"] = plan.get("files", 0) - 1
            known.update(call.get("files", {}))
        if steps:
            plan["uncommon_ext"] = [x for x in plan.get("uncommon_ext", []) if x != ".step"]
        extra = ["projects/%s.html" % s for s in ORDER]
        extra += ["site/" + r for r in sorted(pulled) if not r.endswith((".html", "/"))]
        extra = [e for e in extra if e not in known]
        if (extra or steps) and plan.get("publish"):
            call = plan["publish"][-1]
            for e in extra:
                call["files"][e] = e
            added = sum(os.path.getsize(os.path.join(pub, e)) for e in extra)
            plan["files"] = plan.get("files", 0) + len(extra)
            plan["bytes"] = plan.get("bytes", 0) + added
            if plan.get("batches"):
                plan["batches"][-1]["files"] += len(extra)
                plan["batches"][-1]["bytes"] += added
            if plan["batches"][-1]["files"] > 250 or plan["batches"][-1]["bytes"] > 60_000_000:
                print("build-studio-cases: warning: the last publish batch is now over the per-call limit")
            with open(plan_path, "w", encoding="utf-8") as f:
                json.dump(plan, f, indent=2)
        print("build-studio-cases: added %d files to %s, dropped %d .step" % (len(extra), plan_path, len(steps)))
    print("build-studio-cases: %d case pages and %d assets into %s" % (len(ORDER), len(pulled), pub))


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--check", action="store_true", help="exit 1 if a page is out of date")
    ap.add_argument("--preview", metavar="PUB", help="copy the pages into a preview.py studio copy")
    a = ap.parse_args()
    if a.preview:
        preview(os.path.abspath(a.preview))
        return
    pages = build()
    stale = []
    for path, src in pages.items():
        old = open(path, encoding="utf-8").read() if os.path.isfile(path) else None
        if old != src:
            stale.append(path)
            if not a.check:
                os.makedirs(OUT, exist_ok=True)
                with open(path, "w", encoding="utf-8") as f:
                    f.write(src)
    rel = [os.path.relpath(p, ROOT) for p in stale]
    if a.check:
        if stale:
            print("build-studio-cases: out of date: " + ", ".join(rel))
            sys.exit(1)
        print("build-studio-cases: %d pages up to date" % len(pages))
    else:
        print("build-studio-cases: wrote %d of %d pages%s" % (len(stale), len(pages), (": " + ", ".join(rel)) if rel else ""))


if __name__ == "__main__":
    main()
