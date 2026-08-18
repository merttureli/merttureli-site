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
            '          <video data-clip="1" poster="../assets/motion/%s-poster.%s" autoplay loop muted '
            'playsinline preload="metadata" style="width: 100%%; height: 100%%; object-fit: contain; display: block">'
            '<source src="../assets/motion/%s-alpha.webm" type="video/webm">'
            '<source src="../assets/motion/%s.mp4" type="video/mp4"></video>\n        </div>'
            % (case.get("clip_ratio", "4 / 3"), hero_clip, case.get("poster_ext", "png"),
               hero_clip, hero_clip))
    elif case.get("hero_image"):
        clip_markup = ('<div data-reveal="1">%s</div>'
                       % frame(case["hero_image"], case["title"], case.get("hero_caption", ""),
                               ratio=case.get("clip_ratio", "4 / 3"), zoom=False, size="100%,420px"))

    if case.get("clip_note") and clip_markup:
        clip_markup = clip_markup.replace(
            '        </div>',
            '          <div style="position: absolute; inset: auto 0 0 0; display: flex; '
            'justify-content: center">\n'
            '            <span style="font-family: var(--font-mono); font-size: var(--fs-meta); '
            'letter-spacing: var(--ls-caps); text-transform: uppercase; color: var(--paper); '
            'border: 1px solid var(--paper-a45); border-radius: var(--radius-pill); '
            'padding: 5px 12px">' + case["clip_note"] + '</span>\n'
            '          </div>\n        </div>')

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
    "next": ("CHARGER", "charger.html"),
}


CASES["charger"] = {
    "slug": "charger",
    "eyebrow": "Case study / Union College Rocket Team",
    "title": "Deployable sensor payload",
    "description": ("CHARGER, the rocket that won the Deployable Sensor Payload event at Battle "
                    "of the Rockets 2026. Custom payload electronics, five live telemetry "
                    "channels, and a team that did not exist three years earlier."),
    "lede": ("The event asks for a rocket that puts a custom built sensor payload into a five "
             "hundred foot window, drops it at apogee, sheds its nose cone partway down, and "
             "streams five channels of telemetry to a handheld ground station the whole way to "
             "the ground. We built CHARGER, and it won."),
    "clip": "charger-square",
    "clip_ratio": "1 / 1",
    "brief": [
        ("Role", "Captain and chief engineer", ""),
        ("Team", "Union College Rocket Team, twelve competing", ""),
        ("Event", "Battle of the Rockets 2026", "Deployable Sensor Payload"),
        ("Where", "Culpeper, Virginia, April 2026", ""),
        ("Result", "First place", ""),
        ("Advisers", "Scott Suriano, Ashok Ramasubramanian", ""),
    ],
    "brief_note": [
        "There was no rocket team at Union College when I started. I founded it, ran it as captain "
        "and chief engineer, trained new members through build labs, owned NAR and Tripoli "
        "safety compliance for high power launches, and grew the budget by seven hundred percent "
        "by writing funding proposals. The team was chartered as an official section of the "
        "National Association of Rocketry.",
        "The win is published by " + '<a href="https://www.union.edu/news/stories/202604/rocket-club-soars-new-heights-first-place-finish-national-competition" target="_blank" rel="noopener" style="color: inherit; text-decoration: underline; text-underline-offset: 3px; text-decoration-color: var(--line-hairline)">Union College</a>' + " and by " + '<a href="https://www.rocketbattle.org/winners.html" target="_blank" rel="noopener" style="color: inherit; text-decoration: underline; text-underline-offset: 3px; text-decoration-color: var(--line-hairline)">the competition organizer</a>' + ", so it does not "
        "need taking on trust.",
    ],
    "sections": [
        {"kind": "stats", "stats": [
            ("1st", "Deployable Sensor Payload event"),
            ("500 ft", "The whole apogee window"),
            ("5", "Live telemetry channels"),
            ("700%", "Budget growth, written into proposals"),
        ]},
        {"label": "The event", "paras": [
            "Deployable Sensor Payload is not an altitude race. It is a systems problem with a "
            "narrow flight envelope around it. The rocket flies a commercial G motor to between "
            "seven hundred and twelve hundred feet, drops the payload at apogee, and at seventy "
            "five percent of peak altitude the payload lets go of the nose cone, which then has "
            "to reach the ground gently on its own.",
            "With the nose cone gone the payload exposes a camera and films the ground until it "
            "lands. Throughout, from the moment it goes on the pad, it transmits air pressure, "
            "altitude, acceleration, temperature and rotation rate to a ground station that has "
            "to plot all of it live and derive the descent rate as it happens.",
        ], "ratio": "3 / 4", "cols": "minmax(0, 1fr) minmax(0, 1fr)", "frames": [
            ("F", "assets/photos/charger-rocket-photography/charger-pad-tall.jpg",
             "CHARGER on the launch rail before a flight", "On the rail", "01"),
            ("F", "assets/photos/charger-rocket-photography/charger-pad-close.jpg",
             "CHARGER standing on pad one", "Pad one", "02"),
        ]},
        {"label": "Constraints", "cards": [
            "Commercial G motor. Apogee at least seven hundred feet and no more than twelve hundred",
            "Payload separates at apogee and descends at under fifteen feet per second",
            "Nose cone released at seventy five percent of peak, and it must land gently on its own",
            "Payload electronics must be custom designed. Commercial flight computers are not allowed",
            "Five sensor channels transmitted at two hertz or better, from the pad until landing",
            "Ground station portable, handheld antenna, two hours on battery, everything plotted live",
        ]},
        {"label": "Where the points are", "paras": [
            "The rubric tells you what the event actually cares about. The flight is worth two "
            "hundred and fifteen points plus a tenth of a point per foot above seven hundred, and "
            "almost all of it is the data path rather than the rocket.",
        ], "list": [
            "Camera captures the ground from nose cone release until landing. 50 points",
            "Ground station receives and displays telemetry live, at least ten packets after "
            "liftoff. 30 points",
            "Altitude, acceleration, rotation rate and temperature each plotted in real time. "
            "20 points each",
            "Descent rate calculated and displayed in real time. 20 points",
            "Nose cone released at seventy five percent of peak altitude. 20 points",
            "Apogee inside the window. 10 points, plus a tenth of a point per foot above seven "
            "hundred",
            "Payload deploys from the rocket at apogee. 5 points",
        ]},
        {"label": "The paperwork is scored too", "dark": True, "paras": [
            "Flight points are added to the design review scores rather than compared against "
            "them. A preliminary review is due in December and a critical review in March, both "
            "presented live to judges and both scored. You can fly a perfect mission in April "
            "and still lose to a team that wrote better documents in December.",
            "That reframes the whole year. Radio and antenna trades, a power budget, a software "
            "state list, flight simulations, mass with the motor installed: all of it is work the "
            "judges expect to see written down months before anything flies, and all of it is "
            "scored by the same people twice before launch day. The review deck is not a report "
            "on the engineering. It is part of the engineering.",
        ]},
        {"label": "CHARGER", "paras": [
            "Just under four feet tall, single stage, four fins, flying a commercial G motor on a "
            "proper retainer because the rules do not accept a friction fit. A commercial "
            "altimeter rides along purely so a judge can read the peak altitude off it after "
            "recovery, and it has to still be switched on when the rocket reaches the judges' "
            "table.",
            "The payload occupies the upper body and the nose cone counts as part of it, which is "
            "the detail that shapes the whole airframe: the nose is not structure you design "
            "around, it is a component the payload has to let go of in flight and then be scored "
            "on separately.",
        ]},
        {"kind": "bleed", "src": "assets/photos/charger-rocket-photography/charger-pad-band.jpg",
         "alt": "CHARGER vertical on pad one at Battle of the Rockets, Culpeper, Virginia",
         "caption": "Pad one, Culpeper, Virginia, April 2026"},
        {"label": "Launch day", "paras": [
            "Three attempts per team, and the range closes at four in the afternoon. Nobody "
            "manages your time for you. Weather can take the whole weekend, and if it does, the "
            "awards are decided on the December and March review scores alone.",
            "We got two clean flights away on the first day while the weather held, then put up "
            "the qualifying flight before noon on the second. One team member stands at the "
            "launch control officer's position as mission control and nothing leaves the pad "
            "until they say it does.",
        ], "strong": True},
        {"label": "The result", "dark": True, "paras": [
            "The event finished in this order, published by "
            + '<a href="https://www.union.edu/news/stories/202604/rocket-club-soars-new-heights-first-place-finish-national-competition" target="_blank" rel="noopener" style="color: inherit; text-decoration: underline; text-underline-offset: 3px; text-decoration-color: var(--paper-a45)">Union College on 23 April 2026</a>' + " and listed by " + '<a href="https://www.rocketbattle.org/winners.html" target="_blank" rel="noopener" style="color: inherit; text-decoration: underline; text-underline-offset: 3px; text-decoration-color: var(--paper-a45)">the competition organizer</a>' + ", so nobody has to take it on trust.",
        ], "list": [
            "Union College Rocket Club",
            "Chantilly Aerospace Club Team 3",
            "Thomas Jefferson High School",
            "Spring Grove Area High School Team 2",
            "George Mason University",
        ]},
        {"label": "What I learned", "strong": True, "paras": [
            "One rule shapes this competition more than any technical requirement: only team "
            "members may work on any part of it. Not the design, not the simulation, not the "
            "build, not the repairs, not the launch. Advisers can guide and mentors can review, "
            "but no adult, company or outsider can touch the rocket. There is no route to a win "
            "that goes around building the team.",
            "So the engineering problem and the organizational problem were the same problem. "
            "The budget proposals were what made a competitive airframe affordable. The build "
            "labs were what made twelve people able to fly it. And the two design reviews were "
            "what turned a group of volunteers into a team that could say, in writing and on "
            "record, exactly how its rocket was going to work.",
        ]},
    ],
    "prev": ("Robo-Catcher", "robo-catcher.html"),
    "next": ("The bend fixture", "bend-fixture.html"),
}


CASES["bend-fixture"] = {
    "slug": "bend-fixture",
    "eyebrow": "Case study / SunThru",
    "title": "Custom three-point bend fixture",
    "description": ("A fully 3D printable 12 part three-point bend fixture, designed in SolidWorks "
                    "2025 around specimens too delicate for commercial fixtures, with the rebuilds "
                    "automated in VBA."),
    "lede": ("Commercial bend fixtures are built for metals and plastics and will damage a fragile "
             "specimen before the test begins. SunThru needed one matched to its own samples, so I "
             "designed a fully printable 12 part fixture built around gentle handling."),
    "clip": "bend-fixture-blurred",
    "poster_ext": "jpg",
    "clip_ratio": "16 / 9",
    "clip_note": "IP protected",
    "brief": [
        ("Role", "Design engineer, solo", ""),
        ("For", "SunThru, early stage hardware R&amp;D", ""),
        ("Tools", "SolidWorks 2025, VBA macro automation, FDM printing", ""),
        ("Timeline", "2026", ""),
        ("Status", "Base plate and gauge plate printed and in lab use", ""),
    ],
    "brief_note": [
        "Renders are blurred here because the fixture is SunThru hardware. The engineering worth "
        "describing is the parametric structure and the design for printing, neither of which needs "
        "the geometry shown.",
    ],
    "sections": [
        {"kind": "stats", "stats": [
            ("12", "Interlocking parts"),
            ("100%", "FDM printable, no machining"),
            ("M3", "One hardware size throughout"),
            ("VBA", "Automated rebuilds"),
        ]},
        {"label": "The problem", "paras": [
            "Three-point bend testing is a standard way to measure flexural strength, but commercial "
            "fixtures assume a specimen that can take being clamped. When the sample cannot, the "
            "fixture itself becomes the thing that breaks it.",
            "SunThru needed a fixture sized to its own samples, gentle enough not to pre-damage "
            "them, and cheap enough to iterate on, which meant printing it in house.",
        ]},
        {"label": "Constraints", "cards": [
            "Every part printable on the lab's FDM printer, no machined components",
            "12 interlocking parts on one coordinate system, so dimension changes ripple predictably",
            "Standard M3 hardware throughout, with printable cross-hole channels",
            "Compliant contact geometry at the load nose and both supports",
            "Cheap enough to reprint a part rather than rework it",
            "Sized to the lab's own specimens rather than a standard",
        ]},
        {"label": "Parametric part design", "paras": [
            "A 12 part fixture with interlocked dimensions is a maintenance problem: change one "
            "dimension by hand and eleven other parts silently stop fitting. Every part sits on a "
            "shared coordinate system, and I automated the rebuilds with SolidWorks VBA so a "
            "dimension change regenerates the affected parts consistently.",
            "Each part's geometry is checked against its expected volume before it is accepted, which "
            "catches a rebuild that succeeded but produced the wrong solid.",
        ]},
        {"label": "Designed for the printer, not around it", "paras": [
            "The parts are shaped the way the machine builds them: additive layer friendly geometry "
            "throughout, and horizontal M3 cross-holes drawn as printable channels so nothing needs "
            "support material or post-drilling.",
            "One hardware size across the whole fixture means one driver, one drill, and no chance of "
            "an assembly step needing something that is not on the bench.",
        ], "strong": True},
        {"label": "What I learned", "strong": True, "paras": [
            "The decisions that held up were the ones that thought like the manufacturing process. "
            "Geometry built up in layers the way the printer builds it, holes shaped for printability "
            "instead of for drills, hardware chosen from one standard size.",
            "Designing for the process beat designing around it.",
        ]},
    ],
    "prev": ("CHARGER", "charger.html"),
    "next": ("Rudder pedals", "rudder-pedals.html"),
}


CASES["rudder-pedals"] = {
    "slug": "rudder-pedals",
    "eyebrow": "Case study / Personal project",
    "title": "Flight sim rudder pedals",
    "description": ("Three-axis flight sim rudder pedals with fighter style geometry, contactless "
                    "Hall effect sensing and C++ USB HID firmware. Designed, printed, wired and "
                    "programmed solo."),
    "lede": ("I fly ultralights, and consumer sim pedals never felt right: short throw, toy-like "
             "centring, and potentiometers that get jittery as they wear. So I built my own, with "
             "fighter style geometry, three axes, and sensing that cannot wear out."),
    "clip": "rudder-pedals-working",
    "clip_ratio": "16 / 9",
    "brief": [
        ("Role", "Design, print, wiring and firmware, solo", ""),
        ("Type", "Personal project", ""),
        ("Tools", "SolidWorks, FDM printing, Teensy 2.0, A1301 Hall sensors, C++", ""),
        ("Timeline", "2026", ""),
        ("Status", "In daily use at my sim", ""),
    ],
    "brief_note": [
        "Rudder pedals do three jobs at once: yaw through the sliding pedal motion, plus independent "
        "left and right toe brakes. Consumer hardware compresses all of that into short springy "
        "travel measured by potentiometers.",
    ],
    "sections": [
        {"kind": "stats", "stats": [
            ("3", "Independent axes"),
            ("0", "Potentiometers in the signal path"),
            ("USB HID", "No drivers, any simulator"),
            ("A1301", "Contactless Hall sensing"),
        ]},
        {"label": "The problem", "paras": [
            "Potentiometers drift, jitter and eventually wear out, because the measurement depends on "
            "a wiper physically touching a track. On a control you stand on, that wear is not "
            "hypothetical.",
            "I wanted fighter style pedal geometry with sensing that reads the same on day one and "
            "day one thousand.",
        ], "frames": [("F", "assets/photos/rudder-pedal-photography/pedals-hero.jpg",
                       "The finished rudder pedals", "The finished pedals", "01")]},
        {"label": "Constraints", "cards": [
            "Three independent axes, yaw plus left and right toe brakes, in one mechanism",
            "Every structural part printable on a hobby FDM printer",
            "No contact based sensing anywhere in the signal path",
            "Recognised as a standard game controller by any PC, no drivers",
            "Pedal geometry close to an F-15 or F-18 layout",
            "Serviceable: a worn part can be reprinted, not replaced as an assembly",
        ]},
        {"label": "Mechanism first", "paras": [
            "I designed the three-axis assembly in SolidWorks around fighter style pedal geometry and "
            "printed it, iterating on pivot placement and return feel.",
            "Rapid prototyping earns its name here. Pedal feel is subjective, and the fastest way to "
            "evaluate a linkage is to stand on it.",
        ], "frames": [("F", "assets/photos/rudder-pedal-photography/pedals-profile.jpg",
                       "Pedal mechanism in profile", "The footplate rides its pivot arm between the printed side walls", "02")],
         "flip": True},
        {"label": "Sensing without touching", "paras": [
            "Each axis is measured by an A1301 Hall effect sensor reading a magnet on the moving part. "
            "No wiper, no contact, nothing to wear. The output is smooth and continuous, and it is "
            "identical after a thousand hours.",
            "That single component choice removes the entire failure mode that ruins potentiometer "
            "based controls.",
        ], "frames": [("F", "assets/photos/rudder-pedal-photography/pedals-sensor.jpg",
                       "The sensor lever and magnet holder", "The magnet sweeps past the fixed A1301 as the axis moves", "03")]},
        {"label": "Firmware that gets out of the way", "paras": [
            "A Teensy 2.0 reads the three sensors and presents itself as a standard USB HID game "
            "controller, so every simulator sees it the moment it is plugged in.",
            "The C++ firmware learns each axis's real minimum, centre and maximum, and applies "
            "configurable deadzone logic, so mechanical imperfection never reaches the sim.",
        ], "strong": True},
        {"label": "What I learned", "strong": True, "paras": [
            "This is where mechanical design and embedded software stopped being separate skills. The "
            "pedal feel comes from the linkage, but whether it is usable comes from the firmware, and "
            "neither one could be finished without the other.",
        ]},
    ],
    "prev": ("The bend fixture", "bend-fixture.html"),
    "next": ("Therma-Shift", "therma-shift.html"),
}


CASES["therma-shift"] = {
    "slug": "therma-shift",
    "eyebrow": "Case study / Personal project",
    "title": "Therma-Shift coaster",
    "description": ("A dual mode thermoelectric coaster that heats or cools any mug or glass. "
                    "Peltier stack bench validated to 11 C on the cold face at 12 V, with layered "
                    "thermal runaway protection."),
    "lede": ("A solid state desktop coaster that actively heats or cools any standard mug, glass or "
             "can, with no proprietary drinkware. One Peltier module, closed loop control, and a "
             "safety architecture designed for unattended desk use."),
    "clip": "therma-shift-360",
    "clip_ratio": "4 / 3",
    "brief": [
        ("Role", "Design, thermal validation, firmware, solo", ""),
        ("Built for", "SparkLab seed competition, March 2026", ""),
        ("Tools", "TEC1-12703 Peltier, Arduino C++, NTC thermistors, DRV8871", ""),
        ("Power", "USB-C Power Delivery", ""),
        ("Status", "Thermal stack validated, closed loop electronics in progress", ""),
    ],
    "brief_note": [
        "Existing options split into two bad camps: proprietary heated mugs that lock you into their "
        "drinkware, and cheap USB warmers with no temperature regulation at all. The interesting "
        "problem sits in between.",
    ],
    "sections": [
        {"kind": "stats", "stats": [
            ("11 &deg;C", "Cold face at 12 V, steady state"),
            ("~5 min", "To thermal equilibrium"),
            ("2", "Modes from one stack, by polarity"),
            ("&plusmn;2 &deg;F", "Closed loop target"),
        ]},
        {"label": "The problem", "paras": [
            "One compact device that both heats and cools, works with whatever cup is already on the "
            "desk, and can be trusted to run unattended. The last of those is the hard one: a heater "
            "left alone on a desk is a fire risk if nothing independent is watching it.",
        ]},
        {"label": "Constraints", "cards": [
            "Universal: any mug, glass or can, the device adapts to the drinkware",
            "Dual mode, heating and cooling from the same hardware",
            "Powered over USB-C Power Delivery, within a desk power budget",
            "Thermal runaway prevention independent of the control loop",
            "Low profile and quiet enough for an office desk",
            "No proprietary cup, ever",
        ]},
        {"label": "The design", "paras": [
            "A thermoelectric module does both jobs: drive current one way and the top plate cools, "
            "reverse it and the plate heats. The TEC1-12703 sits between an aluminium top plate and a "
            "finned heatsink with a blower carrying away waste heat.",
            "An NTC thermistor at the plate closes the loop, targeting about 2 degrees Fahrenheit "
            "around setpoint, with the module driven through a DRV8871 H-bridge so firmware controls "
            "both power and polarity.",
            "Safety is layered the way my lab test rig is: the control loop regulates, and separate "
            "firmware cutoffs watch for thermal runaway independently of it, so an unattended fault "
            "shuts the device down.",
        ]},
        {"label": "Validate the physics before the electronics", "paras": [
            "Before integrating any control loop I bench tested the bare thermal stack against a lab "
            "supply with K-type thermocouples on both faces. At 12 V the cold face held 10.7 to 12 "
            "degrees C with the heatsink at 53 to 56, reaching equilibrium in about five minutes.",
            "A voltage sweep mapped cold face temperature against input power to find the efficient "
            "operating window. Swapping the heatsink's stock adhesive pad for proper thermal paste "
            "measurably improved performance: the interfaces matter as much as the module.",
        ], "strong": True},
        {"label": "Where it stands", "list": [
            "10.7 to 12 degrees C cold face at 12 V, steady state",
            "About 5 minutes to thermal equilibrium",
            "Dual mode verified: the same stack heats and cools by polarity",
            "Staged firmware test suite written; closed loop integration in progress",
        ]},
    ],
    "prev": ("Rudder pedals", "rudder-pedals.html"),
    "next": ("Robo-Catcher", "robo-catcher.html"),
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
                # tower over a short paragraph; pairs and galleries keep 3:2.
                # A section can override both, which portrait sources need: a
                # 16:9 crop of a vertical rocket keeps the middle of the tube
                # and throws away the nose and the fins.
                beside_text = bool(sec.get("paras") or sec.get("list")) and not sec.get("cards")
                ratio = sec.get("ratio") or (
                    "16 / 9" if (beside_text and len(sec["frames"]) == 1) else "3 / 2")
                sec["frames"] = [frame(src, alt, cap, ratio=ratio, idx=i)
                                 for (_tag, src, alt, cap, i) in sec["frames"]]
        out, size = build(case, index)
        print("built %s (%.1f KB)" % (os.path.relpath(out, ROOT), size / 1024))


if __name__ == "__main__":
    main()
