#!/usr/bin/env python3
"""
Build a case study page in the site's own theme.

The point of generating rather than hand writing these is theme parity. The
head, the helmet block (design tokens, the design-system bundle, the mobile
stylesheet, the keyframes), the reveal/clip runtime and the footer colophon are
all lifted straight out of index.html at build time, so a case page cannot drift
from the home page when the home page changes. Only the content is authored
here, as data.

Paths are rewritten for one directory down, since the pages live in projects/.

    python build-case.py            # rebuild every case page
    python build-case.py robo-catcher
"""

import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
INDEX = os.path.join(ROOT, "index.html")
OUT_DIR = os.path.join(ROOT, "projects")
DS = "mert-t-reli-design-system-56763c60-2006-4913-8e27-d9c1c8053e6d"
NS = "MertTReliDesignSystem_56763c"

FAVICON = ("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E"
           "%3Crect width='64' height='64' rx='12' fill='%230A0A0A'/%3E"
           "%3Ctext x='32' y='43' text-anchor='middle' font-family='Georgia,serif' font-size='26' "
           "font-weight='600' fill='%23FFFFFF'%3EMT%3C/text%3E%3C/svg%3E")


# --------------------------------------------------------------- theme lifting

def read_index():
    return io.open(INDEX, encoding="utf-8").read()


def helmet_block(index):
    """The <helmet> contents, with paths pointed one level up."""
    start = index.index("<helmet>") + len("<helmet>")
    end = index.index("</helmet>")
    block = index[start:end]
    block = block.replace('href="_ds/', 'href="../_ds/')
    block = block.replace('src="_ds/', 'src="../_ds/')
    block = block.replace('href="css/', 'href="../css/')
    return block.strip()


def runtime_script(index, vals_js):
    """
    index.html's page-logic script with its data swapped for this page's.

    The class carries the scroll reveal and the video autoplay handling, which is
    what makes data-reveal and the clips behave the same as on the home page.
    """
    start = index.index('<script type="text/x-dc"')
    end = index.index("</script>", index.index("renderVals", start)) + len("</script>")
    block = index[start:end]
    vs = block.index("return {")
    ve = block.index("\n    };", vs) + len("\n    };")
    return block[:vs] + "return {\n" + vals_js + "\n    };" + block[ve:]


def footer_block(index):
    """The colophon, so every page ends the same way."""
    start = index.index("<footer")
    end = index.index("</footer>") + len("</footer>")
    foot = index[start:end]
    # the home page's footer links are in-page anchors; on a case page they must
    # point back at the home page
    foot = foot.replace('href="#contact"', 'href="../index.html#contact"')
    foot = foot.replace('href="privacy.html"', 'href="../privacy.html"')
    foot = foot.replace('href="assets/', 'href="../assets/')
    return foot


# ----------------------------------------------------------------- components

def meta(text, index_no=None, tone=None, wide=False, size="240px,16px"):
    a = ''
    if index_no: a += ' index="%s"' % index_no
    if tone: a += ' tone="%s"' % tone
    if wide: a += ' wide="true"'
    return ('<x-import component-from-global-scope="%s.Meta"%s hint-size="%s">%s</x-import>'
            % (NS, a, size, text))


def rule(label, right=None):
    r = ' right="%s"' % right if right else ''
    return ('<x-import component-from-global-scope="%s.Rule" label="%s"%s hint-size="100%%,14px"></x-import>'
            % (NS, label, r))


def heading(text, level=2, treatment=None, size="100%,90px"):
    t = ' treatment="%s"' % treatment if treatment else ''
    return ('<x-import component-from-global-scope="%s.DisplayHeading" level="%d"%s hint-size="%s">%s</x-import>'
            % (NS, level, t, size, text))


def para(text, big=False, strong=False):
    fs = "var(--fs-body-lg)" if big else "var(--fs-body)"
    col = "var(--text-display)" if strong else "var(--text-body)"
    return ('<p style="font-size: %s; line-height: var(--lh-body); color: %s; '
            'max-width: var(--measure)">%s</p>' % (fs, col, text))


def para_dark(text, big=False):
    fs = "var(--fs-body-lg)" if big else "var(--fs-body)"
    return ('<p style="font-size: %s; line-height: var(--lh-body); color: var(--paper-a90); '
            'max-width: var(--measure)">%s</p>' % (fs, text))


def frame(src, alt, caption, ratio="3 / 2", idx=None, zoom=True, size="100%,300px"):
    a = ' index="%s"' % idx if idx else ''
    z = ' hover-zoom="true"' if zoom else ''
    return ('<x-import component-from-global-scope="%s.MediaFrame" src="../%s" alt="%s" '
            'ratio="%s" caption="%s"%s%s hint-size="%s"></x-import>'
            % (NS, src, alt, ratio, caption, a, z, size))


def button(text, href, variant="outline", dark=False, size="220px,44px"):
    dp = ' dc-props="{{ linkOnDark }}"' if dark else ''
    return ('<x-import component-from-global-scope="%s.Button" variant="%s" trailing="→" '
            'href="%s"%s hint-size="%s">%s</x-import>' % (NS, variant, href, dp, size, text))


def spec_list(name, cols="minmax(64px,110px) minmax(0,1fr)", size="100%,220px"):
    return ('<x-import component-from-global-scope="%s.SpecList" items="{{ %s }}" '
            'columns="%s" hint-size="%s"></x-import>' % (NS, name, cols, size))


def grain(blend="overlay", strength="normal"):
    return ('<x-import component-from-global-scope="%s.Grain" blend="%s" strength="%s" '
            'hint-size="100%%,100%%"></x-import>' % (NS, blend, strength))


def bullets(items):
    """A ruled list in the site's mono/meta register."""
    rows = []
    for i, t in enumerate(items, 1):
        rows.append(
            '<div style="display: grid; grid-template-columns: minmax(28px,36px) minmax(0,1fr); '
            'gap: var(--space-5); align-items: baseline; padding: var(--space-4) 0; '
            'border-bottom: 1px solid var(--line-hairline)">'
            '<span style="font-family: var(--font-mono); font-size: var(--fs-meta); '
            'letter-spacing: var(--ls-caps); color: var(--text-meta)">%02d</span>'
            '<span style="font-size: var(--fs-body); line-height: var(--lh-body); '
            'color: var(--text-body)">%s</span></div>' % (i, t))
    return ('<div style="display: flex; flex-direction: column; max-width: var(--measure)">%s</div>'
            % "".join(rows))


def stats_band(items):
    """
    Big figures, straight after the hero.

    The page's failure mode was a wall of measure-width prose on white. Leading
    with the numbers at display size gives the reader the result in one glance
    and gives the layout something with weight in it.
    """
    cells = []
    for value, label in items:
        cells.append(
            '<div style="display: flex; flex-direction: column; gap: var(--space-3)">'
            '<span style="font-family: var(--font-display); font-size: clamp(2.2rem, 4.4vw, 3.6rem); '
            'font-weight: 500; line-height: 0.95; letter-spacing: -0.02em; color: var(--paper)">%s</span>'
            '<span style="font-family: var(--font-mono); font-size: var(--fs-meta); '
            'letter-spacing: var(--ls-caps); text-transform: uppercase; color: var(--paper-a70)">%s</span>'
            '</div>' % (value, label))
    return ('      <div data-reveal="1" style="display: grid; grid-template-columns: '
            'repeat(auto-fit, minmax(min(190px, 100%%), 1fr)); gap: var(--space-7) var(--space-6)">\n'
            '        %s\n      </div>' % "\n        ".join(cells))


def cards(items):
    """Constraints as panels rather than a long ruled list."""
    out = []
    for i, t in enumerate(items, 1):
        out.append(
            '<div style="display: flex; flex-direction: column; gap: var(--space-4); '
            'padding: var(--space-6); border-radius: var(--radius-lg, 14px); '
            'background: var(--surface-sunken); min-height: 150px">'
            '<span style="font-family: var(--font-mono); font-size: var(--fs-meta); '
            'letter-spacing: var(--ls-caps); color: var(--text-meta)">%02d</span>'
            '<span style="font-size: var(--fs-body); line-height: var(--lh-body); '
            'color: var(--text-display)">%s</span></div>' % (i, t))
    return ('      <div data-reveal="1" style="display: grid; grid-template-columns: '
            'repeat(3, minmax(0, 1fr)); gap: var(--space-5)">\n'
            '        %s\n      </div>' % "\n        ".join(out))


def bleed(src, alt, caption):
    """A full width image band, to break the column rhythm once per page."""
    return ('  <section data-reveal="1" style="position: relative; padding: 0 0 var(--section-y)">\n'
            '    <div style="position: relative; width: 100%%; aspect-ratio: 21 / 9; overflow: hidden; '
            'background: var(--ink-900)">\n'
            '      <img src="../%s" alt="%s" style="position: absolute; inset: 0; width: 100%%; '
            'height: 100%%; object-fit: cover; display: block">\n'
            '    </div>\n'
            '    <div style="max-width: var(--max-width); margin: 0 auto; padding: var(--space-4) '
            'var(--page-margin) 0">\n'
            '      <span style="font-family: var(--font-mono); font-size: var(--fs-meta); '
            'letter-spacing: var(--ls-caps); text-transform: uppercase; color: var(--text-meta)">%s</span>\n'
            '    </div>\n  </section>\n' % (src, alt, caption))


def media_col(frames):
    """
    Frames laid out across, not down.

    Stacking two 3:2 frames in a half width column produced 880px of pictures
    against 180px of prose, so the text column sat empty for 700px. Side by side
    inside the same column halves their height and the block balances.
    """
    if len(frames) == 1:
        return frames[0]
    return ('<div style="display: grid; grid-template-columns: '
            'repeat(auto-fit, minmax(min(170px, 100%), 1fr)); gap: var(--space-4)">'
            + "".join(frames) + '</div>')


def section(inner, dark=False, pad="var(--section-y) var(--page-margin)", extra="",
            gap="var(--space-7)"):
    cls = ' class="on-dark"' if dark else ''
    bg = ' background: var(--ink-900);' if dark else ''
    return ('  <section%s style="position: relative;%s padding: %s;%s">\n'
            '    <div style="position: relative; max-width: var(--max-width); margin: 0 auto; '
            'display: flex; flex-direction: column; gap: %s">\n%s\n    </div>\n'
            '  </section>\n' % (cls, bg, pad, extra, gap, inner))


def block(*parts, **kw):
    """A reveal-on-scroll stack."""
    gap = kw.get("gap", "var(--space-5)")
    return ('      <div data-reveal="1" style="display: flex; flex-direction: column; gap: %s">\n'
            '        %s\n      </div>' % (gap, "\n        ".join(parts)))


def two_col(left, right, cols="minmax(0, 1.35fr) minmax(0, 1fr)"):
    tpl = (
        '      <div data-reveal="1" style="display: grid; grid-template-columns: {cols}; '
        'gap: var(--space-8); align-items: start">\n'
        '        <div style="min-width: 0; display: flex; flex-direction: column; '
        'gap: var(--space-6)">{left}</div>\n'
        '        <div style="min-width: 0; display: flex; flex-direction: column; '
        'gap: var(--space-5)">{right}</div>\n'
        '      </div>')
    return tpl.format(cols=cols, left=left, right=right)


def gallery(frames, min_col="220px"):
    return ('      <div data-reveal="1" style="display: grid; grid-template-columns: '
            'repeat(auto-fit, minmax(min(%s, 100%%), 1fr)); gap: var(--space-5)">\n        %s\n      </div>'
            % (min_col, "\n        ".join(frames)))


# ---------------------------------------------------------------- page builder

def build(case, index):
    hero_clip = case.get("clip")
    clip_markup = ""
    if hero_clip:
        clip_markup = (
            '<div data-reveal="1" style="position: relative; width: 100%%; aspect-ratio: %s">\n'
            '          <video data-clip="1" poster="../assets/motion/%s-poster.png" autoplay loop muted '
            'playsinline preload="metadata" style="width: 100%%; height: 100%%; object-fit: contain; display: block">'
            '<source src="../assets/motion/%s-alpha.webm" type="video/webm">'
            '<source src="../assets/motion/%s.mp4" type="video/mp4"></video>\n        </div>'
            % (case.get("clip_ratio", "4 / 3"), hero_clip, hero_clip, hero_clip))
    elif case.get("hero_image"):
        clip_markup = ('<div data-reveal="1">%s</div>'
                       % frame(case["hero_image"], case["title"], case.get("hero_caption", ""),
                               ratio=case.get("clip_ratio", "4 / 3"), zoom=False, size="100%,420px"))

    hero = (
        '  <section class="on-dark" style="position: relative; min-height: min(720px, 88vh); '
        'background: var(--ink-900); overflow: hidden; display: flex; flex-direction: column">\n'
        '    %s\n'
        '    <x-import component-from-global-scope="%s.SiteHeader" items="{{ nav }}" active="work" '
        'inverse="true" floating="true" hint-size="100%%,88px"></x-import>\n'
        '    <x-import component-from-global-scope="%s.SocialRail" items="{{ social }}" inverse="true" '
        'fixed="true" hint-size="36px,120px"></x-import>\n'
        '    <div style="position: relative; flex: 1; display: grid; grid-template-columns: '
        'minmax(0, 1fr) minmax(0, 1.15fr); align-items: center; gap: var(--space-8); '
        'padding: calc(var(--header-h) + var(--space-8)) var(--page-margin) var(--space-8); '
        'max-width: var(--max-width); margin: 0 auto; width: 100%%">\n'
        '      <div style="display: flex; flex-direction: column; gap: var(--space-5)">\n'
        '        %s\n        %s\n        %s\n'
        '        <div style="display: flex; gap: var(--space-4); flex-wrap: wrap; margin-top: var(--space-2)">\n'
        '          %s\n          %s\n        </div>\n'
        '      </div>\n'
        '      %s\n'
        '    </div>\n'
        '  </section>\n'
        % (grain(), NS, NS,
           meta(case["eyebrow"], wide=True, size="300px,16px"),
           heading(case["title"], level=1, treatment="inverse", size="100%,140px"),
           para_dark(case["lede"], big=True),
           button("All work", "../index.html#work", variant="glass", dark=True, size="150px,44px"),
           button("Full portfolio", "https://merttureli.github.io", variant="link", dark=True, size="180px,24px"),
           clip_markup))

    body = [hero]

    # brief
    body.append(section(
        block(rule("Brief", right="01")) + "\n" +
        two_col(spec_list("brief", size="100%%,260px"),
                block(*[para(p) for p in case["brief_note"]]) if case.get("brief_note") else "",
                cols="minmax(0, 1fr) minmax(0, 1fr)"),
        pad="var(--section-y) var(--page-margin) var(--space-9)"))

    # Consecutive light sections share one <section> so the article reads as
    # continuous prose. Text and media sit side by side rather than stacking,
    # which both fills the empty half the measure width leaves behind and cuts
    # the page length roughly in half.
    n = 2
    run = []

    def flush():
        if run:
            body.append(section("\n".join(run),
                                pad="0 var(--page-margin) var(--section-y)",
                                gap="var(--space-9)"))
            del run[:]

    for sec in case["sections"]:
        kind = sec.get("kind")

        if kind == "stats":
            flush()
            body.append(section(stats_band(sec["stats"]), dark=True,
                                pad="var(--space-9) var(--page-margin)"))
            continue

        if kind == "bleed":
            flush()
            body.append(bleed(sec["src"], sec["alt"], sec["caption"]))
            continue

        head = block(rule(sec["label"], right="%02d" % n))
        n += 1

        text = []
        if sec.get("paras"):
            text.append(block(*[para(p, strong=sec.get("strong", False)) for p in sec["paras"]]))
        if sec.get("cards"):
            text.append(cards(sec["cards"]))
        if sec.get("list"):
            text.append('      <div data-reveal="1">%s</div>' % bullets(sec["list"]))

        media = sec.get("frames") or []
        if media and text and not sec.get("cards"):
            # prose on one side, the pictures on the other, laid out across
            left = "\n".join(text)
            right = media_col(media)
            if sec.get("flip"):
                left, right = right, left
            piece = head + "\n" + two_col(left, right,
                                        cols=sec.get("cols", "minmax(0, 1.05fr) minmax(0, 1fr)"))
        elif media:
            # nothing to sit beside, so the pictures take the full width. A half
            # width column here stacked four plates into 1781px of dead page.
            piece = "\n".join([head] + text + [gallery(media, min_col=sec.get("min_col", "220px"))])
        else:
            piece = "\n".join([head] + text)

        if sec.get("dark"):
            flush()
            body.append(section(piece, dark=True))
        else:
            run.append(piece)
    flush()

    # next / prev
    nav_btns = []
    if case.get("prev"):
        nav_btns.append(button("Previous: " + case["prev"][0], case["prev"][1], variant="link", size="240px,24px"))
    if case.get("next"):
        nav_btns.append(button("Next: " + case["next"][0], case["next"][1], variant="outline", size="260px,44px"))
    body.append(section(
        '      <div data-reveal="1" style="display: flex; align-items: center; justify-content: '
        'space-between; gap: var(--space-6); flex-wrap: wrap">\n        %s\n      </div>'
        % "\n        ".join(nav_btns or [button("All work", "../index.html#work")]),
        pad="var(--space-8) var(--page-margin) var(--space-9)"))

    vals = ["      nav: [",
            '        { id: "work", label: "Work", href: "../index.html#work" },',
            '        { id: "experience", label: "Experience", href: "../index.html#experience" },',
            '        { id: "beyond", label: "Beyond", href: "../index.html#beyond" },',
            '        { id: "contact", label: "Contact", href: "../index.html#contact" },',
            "      ],",
            "      social: [",
            '        { name: "LinkedIn", icon: "linkedin", href: "https://linkedin.com/in/merttureli" },',
            '        { name: "Mail", icon: "mail", href: "../index.html#contact" },',
            "      ],",
            '      linkOnDark: { tone: "inverse" },',
            "      brief: ["]
    for label, value, aside in case["brief"]:
        row = '        { label: "%s", value: "%s"' % (label, value)
        if aside:
            row += ', aside: "%s"' % aside
        vals.append(row + " },")
    vals.append("      ],")

    html = (
        '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
        '<title>%s · Mert Türeli</title>\n'
        '<meta name="description" content="%s">\n'
        '<link rel="icon" href="%s">\n'
        '<link rel="canonical" href="https://merttureli.com/projects/%s.html">\n'
        '<meta property="og:title" content="%s · Mert Türeli">\n'
        '<meta property="og:description" content="%s">\n'
        '<meta property="og:type" content="article">\n'
        '<meta property="og:url" content="https://merttureli.com/projects/%s.html">\n'
        '<meta property="og:image" content="https://merttureli.com/assets/og-cover.png">\n'
        '<script src="../support.js"></script>\n</head>\n<body>\n<x-dc>\n<helmet>\n%s\n</helmet>\n\n'
        '<div style="background: var(--paper); overflow-x: hidden">\n\n%s\n%s\n</div>\n</x-dc>\n%s\n'
        '<script src="../js/mobile-nav.js"></script>\n'
        '<script src="../js/analytics-config.js"></script>\n'
        '<script src="../js/track.js"></script>\n'
        '<script src="../js/clarity.js"></script>\n</body>\n</html>\n'
        % (case["title"], case["description"], FAVICON, case["slug"], case["title"],
           case["description"], case["slug"], helmet_block(index), "\n".join(body),
           footer_block(index), runtime_script(index, "\n".join(vals))))

    out = os.path.join(OUT_DIR, case["slug"] + ".html")
    io.open(out, "w", encoding="utf-8", newline="\n").write(html)
    return out, len(html)


# ------------------------------------------------------------------- the cases

CASES = {}

CASES["robo-catcher"] = {
    "slug": "robo-catcher",
    "eyebrow": "Case study / Senior capstone",
    "title": "Robo-Catcher",
    "description": ("A softball machine that catches an incoming throw and returns it, built by a "
                    "12 person capstone team for under $700. I co-led the feeding subsystem and owned "
                    "all of the electronics and firmware."),
    "lede": ("Pitching machines are everywhere. Machines that catch the ball and return it do not "
             "exist at any price, so our capstone team built one for under $700. I co-led the feeding "
             "subsystem and owned all of the machine's electronics and firmware."),
    "clip": "robo-catcher-360",
    "clip_ratio": "4 / 3",
    "brief": [
        ("Role", "Feeding subsystem co-lead, all electronics and firmware", ""),
        ("Team", "12 across capture, feeding and return", ""),
        ("Tools", "ESP32, C++, MATLAB, NEMA 17 with TB6600, SolidWorks", ""),
        ("Build", "Laser cut HDF and 3D printed parts", ""),
        ("Timeline", "2025, two academic terms", ""),
    ],
    "brief_note": [
        "Twelve of us split across three subsystems: capture, feeding and return. I co-led the "
        "4 person feeding group and owned the machine's entire electrical and software system: "
        "motor drive, control firmware, wireless interface and safety logic.",
    ],
    "sections": [
        # results up front, at display size, so the page opens with weight
        {"kind": "stats", "stats": [
            ("100%", "Feed indexing, competition day"),
            ("&lt;$700", "Total build cost"),
            ("55 lb", "One person portable"),
            ("1.5 hr", "Runtime, one 12 V 20 Ah battery"),
        ]},
        {"label": "The problem", "paras": [
            "A solo player can buy a machine that pitches, but someone still has to walk every ball "
            "back. We set out to close the loop: a machine that catches an incoming throw, feeds it "
            "internally and returns it, with nobody in the middle.",
            "Nothing off the shelf does this at any price, and ours had to come in under a $700 cap.",
        ]},
        {"label": "Constraints", "cards": [
            "Under $700 all in, with every actuator and driver chosen against that cap",
            "Portable by one person: 55 lb finished, fits in a car trunk",
            "Assembles at the field with no tools",
            "Battery powered, a full practice session on one 12 V 20 Ah SLA battery",
            "Safe around players: wireless emergency stop plus hardware cut-offs",
            "Catch, index and return without a human touching the ball",
        ]},
        {"label": "Sizing the feeder before cutting anything", "paras": [
            "The feeder is a rotating dual chamber indexer: catch a ball in one chamber, rotate 180 "
            "degrees, present it to the return flywheel. The failure mode that kills machines like "
            "this is a stall mid rotation.",
            "So before any parts were made I modelled the load case in MATLAB, a 0.19 kg ball lifted "
            "through 180 degrees of rotation, and sized the NEMA 17 stepper and TB6600 driver to a "
            "1.8x torque safety factor.",
        ], "frames": [("F", "assets/photos/robo-catcher-photography/indexer-cross-section.jpg",
                       "Indexer cross-section", "Chamber geometry self-centres the ball", "02"),
                      ("F", "assets/photos/robo-catcher-photography/full-feeder.jpg",
                       "The assembled feeder", "The assembled feeder", "03")],
         "flip": True, "cols": "minmax(0, 1fr) minmax(0, 1.05fr)"},
        {"label": "Electronics and firmware", "paras": [
            "Everything runs on one ESP32. The firmware handles PWM speed control for the 120 W DC "
            "return flywheel through a MOSFET stage, stepper indexing for the feeder, and limit "
            "switch logic so the machine always knows where the chambers are.",
            "A wireless remote gives start and stop from across the field, and the emergency "
            "cut-offs kill motor power independently of the microcontroller.",
        ], "frames": [("F", "assets/photos/robo-catcher-photography/working-on-electronics.jpg",
                       "The team running the machine on the field", "Running it on the field", "03"),
                      ("F", "assets/photos/robo-catcher-photography/flywheel-full.jpg",
                       "Return flywheel assembly", "Return flywheel, 120 W DC motor", "04")]},
        {"label": "The result", "list": [
            "100% feed indexing on competition day: every ball delivered, no misses",
            "Under $700 total build cost against a $700 cap",
            "55 lb, one person portable, assembles with no tools",
            "1.5 hours continuous runtime on a single 12 V 20 Ah SLA battery",
        ], "frames": [("F", "assets/photos/shop-and-machine-photography/machine-field.jpg",
                       "The finished machine on the field", "The finished machine, on the field", "05")]},
        {"label": "What I learned", "strong": True, "paras": [
            "The MATLAB torque study felt slow while teammates were already printing parts, and then "
            "the feeder ran a full competition day without a single missed index. Analysis before "
            "fabrication is cheaper than iteration after it.",
            "If I built it again I would close the loop on flywheel RPM, so return speed holds "
            "steady as the battery sags.",
        ]},
    ],
    "next": ("The bend fixture", "bend-fixture.html"),
}


def main():
    index = read_index()
    if not os.path.isdir(OUT_DIR):
        os.makedirs(OUT_DIR)
    wanted = sys.argv[1:] or list(CASES)
    for slug in wanted:
        if slug not in CASES:
            print("no such case:", slug)
            continue
        case = CASES[slug]
        # expand the frame tuples now that the helpers exist
        for sec in case["sections"]:
            if sec.get("frames") and isinstance(sec["frames"][0], tuple):
                # a single frame beside prose gets a wide crop so it does not
                # tower over a short paragraph; pairs and galleries keep 3:2
                beside_text = bool(sec.get("paras") or sec.get("list")) and not sec.get("cards")
                ratio = "16 / 9" if (beside_text and len(sec["frames"]) == 1) else "3 / 2"
                sec["frames"] = [frame(src, alt, cap, ratio=ratio, idx=i)
                                 for (_tag, src, alt, cap, i) in sec["frames"]]
        out, size = build(case, index)
        print("built %s (%.1f KB)" % (os.path.relpath(out, ROOT), size / 1024))


if __name__ == "__main__":
    main()
