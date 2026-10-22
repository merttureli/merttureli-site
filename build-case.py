#!/usr/bin/env python3
"""
Build a case study page in the site's own theme.

The point of generating rather than hand writing these is theme parity. The
head, the helmet block (design tokens, the design-system bundle, the mobile
stylesheet, the keyframes), the reveal/clip runtime and the footer colophon are
all lifted straight out of src/index.html at build time, so a case page cannot
drift from the home page when the home page changes. Only the content is
authored here, as data.

This writes the runtime templates, src/projects/*.html. They are not served:
tools/build.py renders them in a browser and writes the static pages that are
served, /index.html and /projects/*.html. src/ mirrors the served tree, so a
template is written for its served location: src/index.html links "_ds/...",
src/projects/x.html links "../_ds/...", exactly as the static pages do. Paths
are rewritten for one directory down, since the case pages live in projects/.

    python build-case.py            # rebuild every case template
    python build-case.py robo-catcher
    python build-case.py --check    # build to a temp dir, diff against
                                    # src/projects/, exit 1 on any difference

Normally run python3 tools/build.py instead, which runs this and then the
static render.

Depth hooks (depth-hero, depth-stage, data-depth-*) are emitted by the helpers
below so css/depth.css sees the same markup as on the home
page. Do not hand edit src/projects/*.html or projects/*.html: run
tools/build.py --check after any change here.
"""

import difflib
from html import escape
import io
import json
import os
import re
import shutil
import sys
import tempfile

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, "src")
INDEX = os.path.join(SRC, "index.html")
OUT_DIR = os.path.join(SRC, "projects")
DS = "mert-t-reli-design-system-56763c60-2006-4913-8e27-d9c1c8053e6d"
NS = "MertTReliDesignSystem_56763c"

# Smaller VP9-alpha encodes of the turntable clips. js/media-playback.js picks
# <base>-<md>-alpha.webm above the phone breakpoint and <base>-<sm>-alpha.webm
# at phone widths; the full size <base>-alpha.webm stays as data-src.
MOTION_VARIANTS = {
    "robo-catcher-360": (1280, 960),
    "rudder-pedals-working": (1280, 960),
    "charger-square": (1080, 720),
    "therma-shift-airflow": (1200, 800),
}
# Clips whose opaque .mp4 is the intended look (the blurred IP renders are white
# tiles by design). Every other turntable is a transparent cutout whose mp4 has
# a baked background that clashes with the palettes, so it ships webm only: a
# browser without VP9 alpha keeps the WebP poster, which has alpha.
OPAQUE_CLIPS = {"bend-fixture-blurred"}


def webm_source(base, alpha=True):
    """A lazy <source> for js/media-playback.js, with the size variants when they exist."""
    suffix = "-alpha" if alpha else ""
    attrs = 'data-src="../assets/motion/%s%s.webm"' % (base, suffix)
    if base in MOTION_VARIANTS:
        md, sm = MOTION_VARIANTS[base]
        attrs += (' data-src-md="../assets/motion/%s-%d-alpha.webm" '
                  'data-src-sm="../assets/motion/%s-%d-alpha.webm"' % (base, md, base, sm))
    return '<source %s type="video/webm">' % attrs


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


def flag(block_id, note, text="[TBD]"):
    """
    An open question for the owner, shown in place as <mark class="flag">.
    tools/check-flags.py lists every one left in the built pages.
    """
    return ('<mark class="flag" data-flag="%s" data-note="%s">%s</mark>'
            % (block_id, escape(note, quote=True), text))


class FlagValue(object):
    """A flagged SpecList value. SpecList renders values as React children, so
    the mark goes in as an element rather than as markup in a string."""

    def __init__(self, block_id, note, text):
        self.block_id, self.note, self.text = block_id, note, text

    def js(self):
        return ('React.createElement("mark", { className: "flag", "data-flag": %s, "data-note": %s }, %s)'
                % (json.dumps(self.block_id), json.dumps(self.note), json.dumps(self.text)))


def footer_block(index, colophon=None):
    """
    The colophon, so every page ends the same way. `colophon` replaces the
    home page's credit line where a case page needs its own.
    """
    start = index.index("<footer")
    end = index.index("</footer>") + len("</footer>")
    foot = index[start:end]
    # the home page's footer links are in-page anchors; on a case page they must
    # point back at the home page
    foot = foot.replace('href="#contact"', 'href="../index.html#contact"')
    # the resume link belongs to the home page's footer only
    foot = re.sub(r'<a href="assets/Mert-Tureli-Resume\.pdf"[^>]*>Resume \(PDF\)</a> / ', '', foot)
    if colophon is not None:
        foot = re.sub(r'(<p [^>]*>)[^<]*(?= / <a href="privacy\.html")',
                      lambda m: m.group(1) + colophon, foot, count=1)
    foot = foot.replace('href="privacy.html"', 'href="../privacy.html"')
    foot = foot.replace('href="assets/', 'href="../assets/')
    return foot


# ----------------------------------------------------------------- components

def meta(text, index_no=None, tone=None, wide=False, size="240px,16px"):
    a = ''
    if index_no: a += ' index="%s"' % index_no
    if tone: a += ' tone="%s"' % tone
    if wide: a += ' wide="true"'
    return ('<x-import data-depth-label="true" component-from-global-scope="%s.Meta"%s hint-size="%s">%s</x-import>'
            % (NS, a, size, text))


def rule(label, right=None, anchor=None):
    """
    A section rule whose label is the section's h2 (data-heading: the static
    render turns the label into the heading). `anchor` adds a scroll target just
    above it for deep links.
    """
    r = ' right="%s"' % right if right else ''
    a = ('<span id="%s" style="scroll-margin-top:30px"></span>' % anchor) if anchor else ''
    return ('%s<x-import data-depth-rule="true" data-heading="2" component-from-global-scope="%s.Rule" '
            'label="%s"%s hint-size="100%%,14px"></x-import>' % (a, NS, label, r))


def heading(text, level=2, treatment=None, size="100%,90px", tag=None):
    """DisplayHeading. `level` sets the size only; `tag` is the element (h2 by default)."""
    t = ' treatment="%s"' % treatment if treatment else ''
    t += ' as="%s"' % tag if tag else ''
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


def button(text, href, variant="outline", dark=False, size="220px,44px", trailing="→"):
    dp = ' dc-props="{{ linkOnDark }}"' if dark else ''
    tr = ' trailing="%s"' % trailing if trailing else ''
    return ('<x-import component-from-global-scope="%s.Button" data-depth-button="%s" variant="%s"'
            '%s href="%s"%s hint-size="%s">%s</x-import>'
            % (NS, variant, variant, tr, href, dp, size, text))


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


# below-the-fold <img> tags never block first paint
LAZY_IMG = 'loading="lazy" decoding="async" '


def bleed(src, alt, caption):
    """A full width image band, to break the column rhythm once per page."""
    return ('  <section data-reveal="1" style="position: relative; padding: 0 0 var(--section-y)">\n'
            '    <div style="position: relative; width: 100%%; aspect-ratio: 21 / 9; overflow: hidden; '
            'background: var(--ink-900)">\n'
            '      <img %ssrc="../%s" alt="%s" style="position: absolute; inset: 0; width: 100%%; '
            'height: 100%%; object-fit: cover; display: block">\n'
            '    </div>\n'
            '    <div style="max-width: var(--max-width); margin: 0 auto; padding: var(--space-4) '
            'var(--page-margin) 0">\n'
            '      <span style="font-family: var(--font-mono); font-size: var(--fs-meta); '
            'letter-spacing: var(--ls-caps); text-transform: uppercase; color: var(--text-meta)">%s</span>\n'
            '    </div>\n  </section>\n' % (LAZY_IMG, src, alt, caption))


def clip_band(base, caption, ratio="16 / 9"):
    """
    A wide autoplaying render, centred at page width.

    Unlike the hero clip, these carry their own lighting and floor, so they sit
    in a framed band rather than floating transparent over the panel, and keep
    their opaque mp4. Below the fold, so the poster waits for data-poster.
    """
    return ('  <section data-reveal="1" style="position: relative; padding: 0 var(--page-margin) '
            'var(--section-y)">\n'
            '    <div style="position: relative; max-width: var(--max-width); margin: 0 auto">\n'
            '      <div style="position: relative; width: 100%%; aspect-ratio: %s; overflow: hidden; '
            'border-radius: var(--radius-lg, 14px); background: var(--ink-900)">\n'
            '        <video data-clip="1" data-poster="../assets/motion/%s-poster.webp" loop muted '
            'playsinline preload="none" style="position: absolute; inset: 0; width: 100%%; '
            'height: 100%%; object-fit: cover; display: block">'
            '<source data-src="../assets/motion/%s.webm" data-src-md="../assets/motion/%s-1280.webm" '
            'data-src-sm="../assets/motion/%s-960.webm" type="video/webm">'
            '<source data-src="../assets/motion/%s.mp4" type="video/mp4"></video>\n'
            '      </div>\n'
            '      <div style="padding: var(--space-4) 0 0">\n'
            '        <span style="font-family: var(--font-mono); font-size: var(--fs-meta); '
            'letter-spacing: var(--ls-caps); text-transform: uppercase; color: var(--text-meta)">%s'
            '</span>\n'
            '      </div>\n'
            '    </div>\n  </section>\n' % (ratio, base, base, base, base, base, caption))


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
            gap="var(--space-7)", track=None):
    cls = ' class="on-dark"' if dark else ''
    cls += ' data-track="%s"' % track if track else ''
    bg = ' background: var(--ink-900);' if dark else ''
    return ('  <section%s style="position: relative;%s padding: %s;%s">\n'
            '    <div style="position: relative; max-width: var(--max-width); margin: 0 auto; '
            'display: flex; flex-direction: column; gap: %s">\n%s\n    </div>\n'
            '  </section>\n' % (cls, bg, pad, extra, gap, inner))


def track_id(sec):
    """
    The name js/track.js reports for a section: its anchor, its "track" name
    (kept for sections whose label was dropped), or its label as a slug.
    """
    return (sec.get("anchor") or sec.get("track")
            or re.sub(r"[^a-z0-9]+", "-", sec["label"].lower()).strip("-"))


# A labelled part inside a run of light sections. The wrapper repeats the run's
# own column and gap, so the layout is the same as without it; it exists so
# js/track.js can time each part (data-track) separately.
RUN_GAP = "var(--space-9)"


def tracked_part(name, piece):
    return ('      <div data-track="%s" style="display: flex; flex-direction: column; gap: %s">\n'
            '%s\n      </div>' % (name, RUN_GAP, piece))


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


def walkthrough(w):
    """
    An interactive <project-walkthrough> band straight after the hero. The
    custom element is defined by WALKTHROUGH_JS, which build() adds to <head>
    whenever a case declares one.
    """
    fallback = ("<p>%s</p>" % w["fallback"]) if w.get("fallback") else ""
    return ('  <section id="%s" aria-label="%s" style="padding:var(--space-8) var(--page-margin);'
            'scroll-margin-top:28px">\n'
            '    <div style="max-width:var(--max-width);margin:0 auto">\n'
            '      <project-walkthrough project="%s">%s</project-walkthrough>\n'
            '    </div>\n  </section>\n' % (w["id"], w["label"], w["project"], fallback))


# ---------------------------------------------------------------- page builder

# Everything a case page loads beyond the lifted helmet. site-palette.js runs
# first, before any paint, so the chosen palette applies without a flash.
PALETTE_JS = "../js/site-palette.js"
WALKTHROUGH_JS = "../assets/portfolio-foundation/project-walkthrough.js"

# The header nav, in the home page's order. Case pages link back to the home
# page's sections, except Websites, which has its own page.
NAV = [
    ("work", "Work", "../index.html#work"),
    ("beyond", "Beyond", "../index.html#beyond"),
    ("websites", "Websites", "../websites.html"),
    ("contact", "Contact", "../index.html#contact"),
]


def title_level(title):
    """
    Display size for a case title. At --fs-display-1 the copy column holds about
    nine capitals, so a longer word ran under the clip (CHARGER's DEPLOYABLE at
    1440 reached 360px past its column). Such titles use --fs-display-2.
    Hyphenated words can break at the hyphen, so they count by their parts.
    """
    longest = max(len(w) for w in re.split(r"[\s-]+", title) if w)
    return 2 if longest >= 10 else 1


def build(case, index, out_dir=OUT_DIR):
    hero_clip = case.get("clip")
    clip_markup = ""
    # The hero clip carries no autoplay attribute and lazy sources:
    # js/media-playback.js loads and starts it when it is on screen and leaves it
    # paused under reduced motion. Its poster is eager because it is the first
    # thing on the page. It is not preloaded: the case LCP is the lede, and a
    # high-priority poster preload measured 60 ms slower FCP/LCP on throttled
    # mobile by competing with the stylesheets.
    aria = (' aria-label="%s"' % escape(case["clip_aria"], quote=True)) if case.get("clip_aria") else ''
    if hero_clip:
        clip_markup = (
            '<div class="depth-stage" data-reveal="1" style="position: relative; width: 100%%; aspect-ratio: %s">\n'
            '          <video data-clip="1"%s poster="../assets/motion/%s-poster.webp" loop muted '
            'playsinline preload="none" style="width: 100%%; height: 100%%; object-fit: contain; display: block">'
            '%s%s</video>\n        </div>'
            % (case.get("clip_ratio", "4 / 3"), aria, hero_clip, webm_source(hero_clip),
               ('<source data-src="../assets/motion/%s.mp4" type="video/mp4">' % hero_clip)
               if hero_clip in OPAQUE_CLIPS else ""))
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
        '  <section class="on-dark depth-hero" style="position: relative; min-height: min(720px, 88vh); '
        'background: var(--ink-900); overflow: hidden; display: flex; flex-direction: column">\n'
        '    %s\n'
        '    <x-import component-from-global-scope="%s.SocialRail" items="{{ social }}" inverse="true" '
        'fixed="true" hint-size="36px,120px"></x-import>\n'
        '    <div style="position: relative; flex: 1; display: grid; grid-template-columns: '
        'minmax(0, 1fr) minmax(0, 1.15fr); align-items: center; gap: var(--space-8); '
        'padding: calc(var(--header-h) + var(--space-8)) var(--page-margin) var(--space-8); '
        'max-width: calc(var(--max-width) + 2 * var(--page-margin)); margin: 0 auto; width: 100%%">\n'
        '      <div style="display: flex; flex-direction: column; gap: var(--space-5)">\n'
        '        %s\n        %s\n        %s\n'
        '        <div style="display: flex; gap: var(--space-4); flex-wrap: wrap; margin-top: var(--space-2)">\n'
        '          %s\n        </div>\n'
        '      </div>\n'
        '      %s\n'
        '    </div>\n'
        '  </section>\n'
        % (grain(), NS,
           meta(case["eyebrow"], wide=True, size="300px,16px"),
           heading(case["title"], level=title_level(case["title"]), treatment="inverse",
                   size="100%,140px", tag="h1"),
           para_dark(case["lede"], big=True),
           button("All work", "../index.html#work", variant="glass", dark=True, size="150px,44px"),
           clip_markup))

    # The banner sits outside <main>, before the hero it floats over, as on the
    # home page.
    site_header = ('  <x-import component-from-global-scope="%s.SiteHeader" items="{{ nav }}" active="work" '
                   'inverse="true" floating="true" dc-props="{{ headerRow }}" hint-size="100%%,88px">'
                   '</x-import>\n' % NS)
    body = [hero]
    if case.get("walkthrough"):
        body.append(walkthrough(case["walkthrough"]))

    # brief. A case can drop the Brief label ("brief_label": None); the
    # section numbers then start at 01 on the first labelled section.
    brief_label = case.get("brief_label", "Brief")
    body.append(section(
        (block(rule(brief_label, right="01")) + "\n" if brief_label else "") +
        two_col(spec_list("brief", size="100%%,260px"),
                block(*[para(p) for p in case["brief_note"]]) if case.get("brief_note") else "",
                cols="minmax(0, 1fr) minmax(0, 1fr)"),
        pad="var(--section-y) var(--page-margin) var(--space-9)", track="brief"))

    # Consecutive light sections share one <section> so the article reads as
    # continuous prose. Text and media sit side by side rather than stacking,
    # which both fills the empty half the measure width leaves behind and cuts
    # the page length roughly in half.
    n = 2 if brief_label else 1
    run = []
    # A light run normally continues the light section above it, so it has no
    # top padding. After a dark plate or a stats band it starts a new light
    # section and needs the full section spacing, or its Rule sits on the plate.
    after_dark = [False]

    def flush():
        if run:
            top = "var(--section-y)" if after_dark[0] else "0"
            body.append(section("\n".join(run),
                                pad="%s var(--page-margin) var(--section-y)" % top,
                                gap=RUN_GAP))
            del run[:]
            after_dark[0] = False

    for sec in case["sections"]:
        kind = sec.get("kind")

        if kind == "stats":
            flush()
            body.append(section(stats_band(sec["stats"]), dark=True,
                                pad="var(--space-9) var(--page-margin)", track="results"))
            after_dark[0] = True
            continue

        if kind == "bleed":
            flush()
            body.append(bleed(sec["src"], sec["alt"], sec["caption"]))
            after_dark[0] = False
            continue

        if kind == "clip_band":
            flush()
            body.append(clip_band(sec["base"], sec["caption"],
                                  sec.get("ratio", "16 / 9")))
            after_dark[0] = False
            continue

        if sec.get("label"):
            head = block(rule(sec["label"], right="%02d" % n, anchor=sec.get("anchor")))
            n += 1
        else:
            # no label: the part continues the one above it, keeping only its
            # deep-link anchor
            head = ('<span id="%s" style="scroll-margin-top:30px"></span>' % sec["anchor"]
                    if sec.get("anchor") else "")

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
            piece = (head + "\n" if head else "") + two_col(left, right,
                                        cols=sec.get("cols", "minmax(0, 1.05fr) minmax(0, 1fr)"))
        elif media:
            # nothing to sit beside, so the pictures take the full width. A half
            # width column here stacked four plates into 1781px of dead page.
            piece = "\n".join(([head] if head else []) + text
                              + [gallery(media, min_col=sec.get("min_col", "220px"))])
        else:
            piece = "\n".join(([head] if head else []) + text)

        if sec.get("dark"):
            flush()
            body.append(section(piece, dark=True, track=track_id(sec)))
            after_dark[0] = True
        else:
            run.append(tracked_part(track_id(sec), piece))
    flush()

    # next / prev
    nav_btns = []
    if case.get("prev"):
        nav_btns.append(button("← Previous: " + case["prev"][0], case["prev"][1], variant="outline",
                               size="260px,44px", trailing=""))
    if case.get("next"):
        nav_btns.append(button("Next: " + case["next"][0], case["next"][1], variant="outline", size="260px,44px"))
    body.append(section(
        '      <div data-reveal="1" style="display: flex; align-items: center; justify-content: '
        'space-between; gap: var(--space-6); flex-wrap: wrap">\n        %s\n      </div>'
        % "\n        ".join(nav_btns or [button("All work", "../index.html#work")]),
        pad="var(--space-8) var(--page-margin) var(--space-9)"))

    vals = ["      nav: ["]
    vals += ['        { id: "%s", label: "%s", href: "%s" },' % item for item in NAV]
    vals += ["      ],",
            "      social: [",
            '        { name: "LinkedIn", icon: "linkedin", href: "https://linkedin.com/in/merttureli" },',
            '        { name: "Mail", icon: "mail", href: "../index.html#contact" },',
            "      ],",
            '      linkOnDark: { tone: "inverse" },',
            '      headerRow: { style: { padding: "0 max(var(--page-margin), calc((100% - var(--max-width)) / 2))" } },',
            "      brief: ["]
    for label, value, aside in case["brief"]:
        row = '        { label: "%s", value: %s' % (
            label, value.js() if isinstance(value, FlagValue) else '"%s"' % value)
        if aside:
            row += ', aside: "%s"' % aside
        vals.append(row + " },")
    vals.append("      ],")

    # The case title is the page's h1; CHARGER's <title> also names the rocket.
    page_title = case.get("seo_title", case["title"])
    head_modules = "".join('<script type="module" src="%s"></script>\n' % m
                           for m in ([WALKTHROUGH_JS] if case.get("walkthrough") else []))
    html = (
        '<!DOCTYPE html>\n<html lang="en">\n<head>\n'
        '<script src="%s"></script>\n'
        '<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
        '<title>%s · Mert Tureli</title>\n'
        '<meta name="description" content="%s">\n'
        '<link rel="icon" href="/assets/icons/favicon.ico" sizes="32x32">\n'
        '<link rel="icon" href="/assets/icons/favicon.svg" type="image/svg+xml">\n'
        '<link rel="apple-touch-icon" href="/assets/icons/apple-touch-icon.png">\n'
        '<link rel="canonical" href="https://merttureli.com/projects/%s.html">\n'
        '<meta property="og:title" content="%s · Mert Tureli">\n'
        '<meta property="og:description" content="%s">\n'
        '<meta property="og:type" content="article">\n'
        '<meta property="og:url" content="https://merttureli.com/projects/%s.html">\n'
        '<meta property="og:site_name" content="Mert Tureli">\n'
        '<meta property="og:image" content="https://merttureli.com/assets/og/case-%s-v1.png">\n'
        '<meta property="og:image:width" content="1200">\n'
        '<meta property="og:image:height" content="630">\n'
        '<meta property="og:image:alt" content="%s">\n'
        '<meta name="twitter:card" content="summary_large_image">\n'
        '<script src="../support.js"></script>\n'
        '%s'
        '<script src="../js/media-playback.js" defer></script>\n'
        '<link rel="stylesheet" href="../css/interaction-polish.css">\n'
        '<script src="../js/interaction-polish.js" defer></script>\n'
        '</head>\n<body class="depth-design">\n'
        '<a class="skip-link" href="#main">Skip to content</a>\n<x-dc>\n<helmet>\n%s\n</helmet>\n\n'
        '<div style="background: var(--paper); overflow-x: hidden">\n\n%s\n  <main id="main">\n%s  </main>\n%s\n'
        '</div>\n</x-dc>\n%s\n'
        '<script src="../js/mobile-nav.js"></script>\n'
        '<script src="../js/analytics-config.js"></script>\n'
        '<script src="../js/track.js"></script>\n'
        '<script src="../js/clarity.js"></script>\n</body>\n</html>\n'
        % (PALETTE_JS, page_title, escape(case["description"], quote=True), case["slug"], page_title,
           escape(case["description"], quote=True), case["slug"], case["slug"],
           escape(case["og_alt"], quote=True), head_modules, helmet_block(index),
           site_header, "\n".join(body),
           footer_block(index, case.get("colophon")), runtime_script(index, "\n".join(vals))))

    out = os.path.join(out_dir, case["slug"] + ".html")
    io.open(out, "w", encoding="utf-8", newline="\n").write(html)
    return out, len(html)


# ------------------------------------------------------------------- the cases

# The full colophon credit line, for case pages whose footer keeps all of it
FULL_CREDIT = ("Photographs of the machine and the team by Paul Buckowski / Union College. "
               "CAD animations rendered from the source assemblies. Aircraft models are third-party, "
               "illustration only.")

CASES = {}

CASES["robo-catcher"] = {
    "slug": "robo-catcher",
    "eyebrow": "Case study / Senior capstone",
    "title": "Robo-Catcher",
    "description": ("A softball machine that catches an incoming throw and returns it, built by a 12 "
                    "person capstone team for under $700. I owned the electronics and firmware."),
    "og_alt": "Render of the Robo-Catcher softball catch and return machine.",
    "lede": "A machine that catches the ball and returns it. Our capstone team built it for under $700.",
    "clip": "robo-catcher-360",
    "clip_ratio": "4 / 3",
    # index.html's Robo-Catcher card deep-links to #mechanism-tour
    "walkthrough": {
        "id": "mechanism-tour",
        "label": "Robo-Catcher mechanism walkthrough",
        "project": "robo-catcher",
    },
    "brief_label": None,
    "brief": [
        ("Role", "Feeding subsystem co-lead, all electronics and firmware", ""),
        ("Team", "12", ""),
        ("Build", "Laser cut HDF and 3D printed parts", ""),
        ("Timeline", "2025", ""),
    ],
    "sections": [
        # results up front, at display size, so the page opens with weight
        {"kind": "stats", "stats": [
            ("100%", "Feed indexing, competition day"),
            ("&lt;$700", "Total build cost"),
            ("55 lb", "One person portable"),
            ("1.5 hr", "Runtime, one 12 V 20 Ah battery"),
        ]},
        {"label": "The feeder", "paras": [
            "The feeder is a rotating dual chamber: catch a ball, rotate 180 degrees, hand it to the "
            "return flywheel.",
        ], "frames": [("F", "assets/photos/robo-catcher-photography/indexer-cross-section.jpg",
                       "Indexer cross-section", "Chamber geometry", None),
                      ("F", "assets/photos/robo-catcher-photography/full-feeder.jpg",
                       "The assembled feeder", "The assembled feeder", None)],
         "flip": True, "cols": "minmax(0, 1fr) minmax(0, 1.05fr)"},
        {"label": None, "track": "electronics-and-firmware", "paras": [
            "One ESP32 runs everything. A wireless remote starts and stops it.",
        ], "frames": [("F", "assets/photos/robo-catcher-photography/working-on-electronics.jpg",
                       "The team running the machine on the field", "On the field", None),
                      ("F", "assets/photos/robo-catcher-photography/flywheel-full.jpg",
                       "Return flywheel assembly", "Return flywheel, 120 W DC motor", None)]},
        # the walkthrough's last stage links to #project-result
        {"label": None, "anchor": "project-result", "list": [
            "100% feed indexing on competition day: every ball delivered, no misses",
            "Under $700 total build cost against a $700 cap",
            "55 lb, one person portable, assembles with no tools",
            "1.5 hours continuous runtime on a single 12 V 20 Ah SLA battery",
        ], "frames": [("F", "assets/photos/shop-and-machine-photography/machine-field.jpg",
                       "The finished machine on the field", "The finished machine", None)]},
        {"label": None, "track": "what-i-learned", "strong": True, "paras": [
            "The MATLAB torque study felt slow while teammates were already printing parts. Then "
            "the feeder ran a full competition day without a missed index.",
        ]},
    ],
    "next": ("CHARGER", "charger.html"),
}


CASES["charger"] = {
    "slug": "charger",
    "eyebrow": "Case study / Union College Rocket Team",
    "title": "Deployable sensor payload",
    "seo_title": "CHARGER · Deployable sensor payload",
    "description": ("CHARGER won the Deployable Sensor Payload event at Battle of the Rockets 2026, with "
                    "custom payload electronics and five live telemetry channels."),
    "og_alt": "Render of the CHARGER rocket.",
    "lede": ("A rocket that drops a sensor payload at apogee and streams five channels of "
             "telemetry to a handheld ground station. We built CHARGER and it won."),
    "clip": "charger-square",
    "clip_ratio": "1 / 1",
    "brief": [
        ("Role", "Captain and chief engineer", ""),
        ("Team", "Union College Rocket Team", ""),
        ("Event", "Battle of the Rockets 2026", ""),
        ("Where", "Culpeper, Virginia, April 2026", ""),
        ("Result", "First place", ""),
        ("Advisers", "Scott Suriano, Ashok Ramasubramanian", ""),
    ],
    "brief_note": [
        "There was no rocket team at Union College when I started. I founded it.",
        "Published by " + '<a href="https://www.union.edu/news/stories/202604/rocket-club-soars-new-heights-first-place-finish-national-competition" target="_blank" rel="noopener" style="color: inherit; text-decoration: underline; text-underline-offset: 3px; text-decoration-color: var(--line-hairline)">Union College</a>' + " and by " + '<a href="https://www.rocketbattle.org/winners.html" target="_blank" rel="noopener" style="color: inherit; text-decoration: underline; text-underline-offset: 3px; text-decoration-color: var(--line-hairline)">the competition organizer</a>' + ".",
    ],
    "sections": [
        {"kind": "stats", "stats": [
            ("1st", "Deployable Sensor Payload event"),
            ("1.80 cal", "Stability margin, 37 inch airframe"),
            ("13.8 ft/s", "Descent, against a 15 ft/s limit"),
            ("$716", "Total hardware cost"),
        ]},
        {"label": "The event", "paras": [
            "A G motor flies the rocket to 700-1,200 feet. On the way down the payload releases "
            "the nose cone at 75 percent of peak altitude, and the nose cone has to land under 15 "
            "feet per second on its own.",
            "With the nose cone gone, a camera on the payload films the ground until it lands.",
        ]},
        {"label": "The airframe", "paras": [
            "37 inches, single stage, "
            + flag("charger-029", "Diameter: CAD measures 2.68 in. Confirm 2.63 or correct it.", "2.63")
            + " inches across, four trapezoidal balsa fins on a cardboard body tube. Center of "
            "gravity at 22 inches, stability margin 1.80 calibers.",
            "Cardboard because the payload transmits from the pad on, and carbon fiber would put a "
            "conductive shell around the 2.4 GHz antenna.",
            '<a href="../assets/charger-explorer/index.html" style="color: inherit; '
            'text-decoration: underline; text-underline-offset: 3px; '
            'text-decoration-color: var(--line-hairline)">Explore all 28 components in 3D</a>.',
        ], "ratio": "3 / 4", "cols": "minmax(0, 1fr) minmax(0, 1fr)", "frames": [
            ("F", "assets/photos/charger-rocket-photography/charger-pad-tall.jpg",
             "CHARGER on the launch rail before a flight", "On the rail", "01"),
            ("F", "assets/photos/charger-rocket-photography/charger-pad-close.jpg",
             "CHARGER standing on pad one", "Pad one", "02"),
        ]},
        {"label": "The numbers", "paras": [
            "Aerotech G77R-7, thrust to weight 8.17. Simulated apogee 1,033 feet. Descent 13.8 feet "
            "per second under a 48 inch ripstop nylon canopy.",
        ], "list": [
            "Length 37 in, maximum diameter "
            + flag("charger-035", "Diameter: CAD measures 2.68 in. Confirm 2.63 or correct it.", "2.63")
            + " in, single stage",
            "Four trapezoidal fins, root chord 2.76 in, height 2.36 in, sweep 2.17 in",
            "Stability margin 1.80 cal, centre of gravity at 22 in",
            "Aerotech G77R-7, thrust to weight 8.17, burn 1.25 s",
            "Simulated apogee 1,033 ft, descent 13.8 ft/s on a 48 in parachute",
            "Rail buttons at 2 in from the aft end and 22 in from the nose, near the CG",
            "Rocket $465.42, payload $250.53, ground station $0.00 from existing kit",
        ]},
        {"label": "What the rules forced", "dark": True, "paras": [
            "The event bans commercial flight computers in the payload, so every ejection charge "
            "fires off our own board and barometric sensor. The commercial altimeter is only there "
            "so a judge can read peak altitude after recovery.",
        ]},
        {"kind": "bleed", "src": "assets/photos/charger-rocket-photography/charger-pad-band.jpg",
         "alt": "CHARGER vertical on pad one at Battle of the Rockets, Culpeper, Virginia",
         "caption": "Pad one, Culpeper, Virginia, April 2026"},
        {"label": "Launch day", "paras": [
            "We got two clean flights away on the first day, then put up the qualifying flight "
            "before noon on the second.",
        ], "strong": True},
        {"label": "The result", "dark": True, "paras": [
            "Final standings, published by "
            + '<a href="https://www.union.edu/news/stories/202604/rocket-club-soars-new-heights-first-place-finish-national-competition" target="_blank" rel="noopener" style="color: inherit; text-decoration: underline; text-underline-offset: 3px; text-decoration-color: var(--paper-a45)">Union College</a>' + ", April 23, 2026.",
        ], "list": [
            "Union College Rocket Club",
            "Chantilly Aerospace Club Team 3",
            "Thomas Jefferson High School",
            "Spring Grove Area High School Team 2",
            "George Mason University",
        ]},
    ],
    "prev": ("Robo-Catcher", "robo-catcher.html"),
    "next": ("The bend fixture", "bend-fixture.html"),
    "colophon": FULL_CREDIT,
}


CASES["bend-fixture"] = {
    "slug": "bend-fixture",
    "eyebrow": "Case study / SunThru",
    "title": "Custom three-point bend fixture",
    "description": ("A 3D printable 12 part three-point bend fixture, designed in SolidWorks 2025 for "
                    "specimens too delicate for commercial fixtures, with rebuilds automated in VBA."),
    "og_alt": "Blurred render of the three-point bend fixture.",
    "lede": ("Commercial bend fixtures will damage a fragile specimen before the test begins. I "
             "designed a fully printable 12 part one for SunThru's samples."),
    "clip": "bend-fixture-blurred",
    "clip_ratio": "16 / 9",
    "clip_note": "IP protected",
    "brief_label": None,
    "brief": [
        ("Status", "Base plate and gauge plate printed and in lab use", ""),
    ],
    "brief_note": [
        "Renders are blurred because the fixture is SunThru hardware.",
    ],
    "sections": [
        {"kind": "stats", "stats": [
            ("12", "Interlocking parts"),
            ("100%", "FDM printable, no machining"),
            ("M3", "One hardware size throughout"),
            ("VBA", "Automated rebuilds"),
        ]},
        {"label": "Parametric part design", "paras": [
            "All 12 parts sit on one shared coordinate system. I automated the rebuilds with "
            "SolidWorks VBA, so a dimension change regenerates the affected parts.",
        ]},
        {"label": "Designed for printing", "paras": [
            "Horizontal M3 cross-holes are drawn as printable channels, so nothing needs support "
            "material or post-drilling. One hardware size across the whole fixture.",
        ], "strong": True},
    ],
    "prev": ("CHARGER", "charger.html"),
    "next": ("Rudder pedals", "rudder-pedals.html"),
    "colophon": (flag("bend-fixture-030",
                      "The shortened credit just says 'Photographs by Paul Buckowski / Union College'. "
                      "Does it still cover only the machine and team photos, and does the site-wide "
                      "footer still need the CAD animation note?",
                      "Photographs by Paul Buckowski / Union College.")
                 + " Aircraft models are third-party, illustration only."),
}


CASES["rudder-pedals"] = {
    "slug": "rudder-pedals",
    "eyebrow": "Case study / Personal project",
    "title": "Flight sim rudder pedals",
    "description": ("Three-axis flight sim rudder pedals with fighter style geometry, Hall effect sensing "
                    "and C++ USB HID firmware. Designed, printed, wired and programmed solo."),
    "og_alt": "Render of the flight sim rudder pedal mechanism.",
    "lede": ("I fly ultralights and consumer sim pedals never felt right, so I built my own. "
             "Fighter style geometry, three axes, Hall sensors instead of potentiometers."),
    "clip": "rudder-pedals-working",
    "clip_ratio": "16 / 9",
    "brief_label": None,
    "brief": [
        ("Timeline", "2026", ""),
        ("Status", "In daily use at my sim", ""),
    ],
    "sections": [
        {"kind": "stats", "stats": [
            ("3", "Independent axes"),
            ("0", "Potentiometers in the signal path"),
            ("USB HID", "No drivers, any simulator"),
            ("A1301", "Contactless Hall sensing"),
        ]},
        {"label": "Mechanism", "paras": [
            "I designed it in SolidWorks and printed it, iterating on pivot placement and return feel.",
        ]},
        {"kind": "clip_band", "base": "rudder-pedals-mechanism",
         "caption": "The CAD assembly driven through its real linkage: yaw both ways, each toe brake, "
                    "then differential braking"},
        {"label": "Sensing", "paras": [
            "Each axis uses an A1301 Hall effect sensor reading a magnet on the moving part. No "
            "contact, nothing to wear.",
        ], "frames": [("F", "assets/renders/rudder-pedals/a1301-hall-sensor.jpg",
                       "An A1301 Hall effect sensor in a TO-92 package",
                       "A1301 Hall sensor and magnet", "01")]},
        {"label": "Firmware", "paras": [
            "The Pro Micro shows up as a standard USB gamepad. No driver needed.",
        ], "strong": True,
         "frames": [("F", "assets/renders/rudder-pedals/pro-micro.jpg",
                     "An Arduino Pro Micro board",
                     "The Pro Micro that replaced the counterfeit Teensy", "02")],
         "flip": True},
    ],
    "prev": ("The bend fixture", "bend-fixture.html"),
    "next": ("Therma-Shift", "therma-shift.html"),
    "colophon": (flag("rudder-pedals-035",
                      "The footer credits 'photographs of the machine and the team' to Paul Buckowski / "
                      "Union College, which looks copied from another case page. Does that credit apply "
                      "to the rudder pedals page, or should it come out?",
                      "Photographs of the machine and the team by Paul Buckowski / Union College.")
                 + " CAD animations rendered from the source assemblies. Aircraft models are "
                 "third-party, illustration only."),
}


CASES["therma-shift"] = {
    "slug": "therma-shift",
    "eyebrow": "Case study / Personal project",
    "title": "Therma-Shift coaster",
    "description": ("A dual mode thermoelectric coaster that heats or cools any mug or glass. Bench "
                    "validated to 11 C on the cold face at 12 V, with thermal runaway protection."),
    "og_alt": "Airflow illustration of the Therma-Shift coaster heat sink.",
    "lede": "A solid state desktop coaster that heats or cools any mug, glass or can.",
    "clip": "therma-shift-airflow",
    "clip_aria": "Airflow illustration: air enters all bottom grille slots, passes through the heatsink fins, descends into the blower and exits the oval side vent. Heating and cooling use the same flow direction.",
    "clip_ratio": "4 / 3",
    "brief_label": None,
    "brief": [
        ("Built for", FlagValue("therma-shift-007",
                                "Confirm the competition name and date (SparkLabs Seed Competition, "
                                "March 2026) in the factual pass.",
                                "SparkLabs seed competition, March 2026"), ""),
        ("Status", "Thermal stack validated, electronics in progress", ""),
    ],
    "brief_note": [
        "Heated mugs lock you into their cup. Cheap USB warmers have no temperature control.",
    ],
    "sections": [
        {"kind": "stats", "stats": [
            ("11 &deg;C", "Cold face at 12 V, steady state"),
            ("~5 min", "To thermal equilibrium"),
            ("2", "Modes from one stack, by polarity"),
            ("&plusmn;2 &deg;F", "Closed loop target"),
        ]},
        {"label": "The problem", "paras": [
            "The coaster has to run unattended on a desk.",
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
            "A thermoelectric module heats or cools depending on current direction. The TEC1-12703 "
            "sits between an aluminum top plate and a finned heatsink with a blower.",
            "An NTC thermistor at the plate closes the loop, targeting about 2 degrees F around "
            "setpoint.",
            flag("therma-shift-021",
                 "Are the independent firmware thermal-runaway cutoffs built and running yet, or still "
                 "planned? The Where It Stands list says closed loop integration is in progress. If "
                 "they are planned, reword in future tense or cut.",
                 "Separate firmware cutoffs watch for thermal runaway independently of the control "
                 "loop and shut the device down on a fault."),
        ]},
        {"label": "Bench test", "paras": [
            "Before adding any control loop, I bench tested the bare thermal stack on a lab supply "
            "with K-type thermocouples on both faces.",
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
    "colophon": flag("therma-shift-028",
                     "The footer is now per-page (CAD credit only). Confirm the other project pages get "
                     "credits that match their own content in the factual pass.",
                     "CAD animations rendered from the source assemblies."),
}


def expand_frames(case):
    """Expand the frame tuples now that the helpers exist. Idempotent."""
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


def check(index, wanted):
    """Build into a temp dir and diff against the committed pages. Returns 0 or 1."""
    tmp = tempfile.mkdtemp(prefix="build-case-check-")
    dirty = 0
    try:
        for slug in wanted:
            expand_frames(CASES[slug])
            out, _ = build(CASES[slug], index, out_dir=tmp)
            committed = os.path.join(OUT_DIR, slug + ".html")
            new = io.open(out, encoding="utf-8").read().splitlines(True)
            old = (io.open(committed, encoding="utf-8").read().splitlines(True)
                   if os.path.exists(committed) else [])
            diff = list(difflib.unified_diff(old, new, "src/projects/%s.html" % slug,
                                             "build-case.py → %s.html" % slug))
            if diff:
                dirty = 1
                sys.stdout.writelines(diff)
                print("DIFFERS: src/projects/%s.html" % slug)
            else:
                print("ok: src/projects/%s.html" % slug)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    if dirty:
        print("build-case.py output does not match src/projects/. Regenerate, or port the "
              "hand edit into build-case.py.")
    return dirty


def main():
    args = sys.argv[1:]
    checking = "--check" in args
    args = [a for a in args if a != "--check"]
    index = read_index()
    wanted = args or list(CASES)
    unknown = [slug for slug in wanted if slug not in CASES]
    for slug in unknown:
        print("no such case:", slug)
    wanted = [slug for slug in wanted if slug in CASES]
    if checking:
        sys.exit(check(index, wanted) or (1 if unknown else 0))
    if not os.path.isdir(OUT_DIR):
        os.makedirs(OUT_DIR)
    for slug in wanted:
        case = CASES[slug]
        expand_frames(case)
        out, size = build(case, index)
        print("built %s (%.1f KB)" % (os.path.relpath(out, ROOT), size / 1024))


if __name__ == "__main__":
    main()
