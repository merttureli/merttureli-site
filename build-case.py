#!/usr/bin/env python3
"""
Build a case study page in the site's own theme.

The point of generating rather than hand writing these is theme parity. The
head, the helmet block (design tokens, the design-system bundle, the mobile
stylesheet, the keyframes), the reveal/clip runtime and the footer colophon are
all lifted straight out of src/index.html at build time, so a case page cannot
drift from the home page when the home page changes. The content is data in
content/: content/projects.json sets the order (and so the Previous / Next
buttons), content/projects/<slug>.json holds one case. Field reference and
recipes: docs/recipes/content.md and docs/recipes/add-project.md.

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

Content errors (bad JSON, an unknown or missing field, a file not listed in
the order) stop the build with exit 2 and name the file and field. Asset paths
that do not exist are printed as warnings.

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
# at phone widths; the full size <base>-alpha.webm stays as data-src. Filled
# from each case's "clip_sizes": [md, sm] in content/projects/<slug>.json.
MOTION_VARIANTS = {}
# Clips whose opaque .mp4 is the intended look (the blurred IP renders are white
# tiles by design): "clip_opaque": true. Every other turntable is a transparent
# cutout whose mp4 has a baked background that clashes with the palettes, so it
# ships webm only: a browser without VP9 alpha keeps the WebP poster, which has
# alpha.
OPAQUE_CLIPS = set()


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

# The case content lives in content/: content/projects.json holds the order,
# content/projects/<slug>.json holds one case each. docs/recipes/content.md has
# the field reference. load_cases() turns the JSON into the shapes build()
# expects and rejects unknown fields, so a typo fails loudly instead of
# silently dropping copy.

CONTENT = os.path.join(ROOT, "content")

# Fields a case file may carry. Required ones must be present.
CASE_REQUIRED = {"nav_title", "title", "eyebrow", "description", "og_alt", "lede", "brief",
                 "sections"}
CASE_OPTIONAL = {"seo_title", "clip", "clip_ratio", "clip_aria", "clip_note", "clip_sizes",
                 "clip_opaque", "hero_image", "hero_caption", "walkthrough", "brief_label",
                 "brief_note", "colophon"}
SECTION_FIELDS = {"kind", "label", "anchor", "track", "dark", "strong", "paras", "cards", "list",
                  "stats", "frames", "ratio", "flip", "cols", "min_col", "src", "alt", "caption",
                  "base"}
SECTION_KINDS = {None, "stats", "bleed", "clip_band"}


class ContentError(Exception):
    pass


def _rich(value, where):
    """
    Rich text: a string (HTML allowed), or a list of strings and flag objects
    {"flag": id, "note": question, "text": shown text (default [TBD])}.
    """
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        value = [value]
    if not isinstance(value, list):
        raise ContentError("%s: expected text or a list of text and flags" % where)
    out = []
    for part in value:
        if isinstance(part, str):
            out.append(part)
        elif isinstance(part, dict) and set(part) <= {"flag", "note", "text"} and "flag" in part:
            out.append(flag(part["flag"], part.get("note", ""), part.get("text", "[TBD]")))
        else:
            raise ContentError("%s: a list item must be text or {\"flag\", \"note\", \"text\"}" % where)
    return "".join(out)


def _case(slug, data, where):
    if not isinstance(data, dict):
        raise ContentError("%s: expected a JSON object" % where)
    missing = sorted(CASE_REQUIRED - set(data))
    unknown = sorted(k for k in set(data) - CASE_REQUIRED - CASE_OPTIONAL if not k.startswith("_"))
    if missing:
        raise ContentError("%s: missing field(s): %s" % (where, ", ".join(missing)))
    if unknown:
        raise ContentError("%s: unknown field(s): %s (allowed: %s)" % (
            where, ", ".join(unknown), ", ".join(sorted(CASE_REQUIRED | CASE_OPTIONAL))))
    case = {"slug": slug}
    for key, value in data.items():
        if key.startswith("_") or key in ("clip_sizes", "clip_opaque"):
            continue
        case[key] = value
    for key in ("lede", "colophon"):
        if case.get(key) is not None:
            case[key] = _rich(case[key], "%s: %s" % (where, key))
    if "brief_note" in case:
        case["brief_note"] = [_rich(p, "%s: brief_note[%d]" % (where, i))
                              for i, p in enumerate(case["brief_note"])]
    rows = []
    for i, row in enumerate(data["brief"]):
        w = "%s: brief[%d]" % (where, i)
        if not isinstance(row, dict) or set(row) - {"label", "value", "aside"} or "label" not in row:
            raise ContentError('%s: expected {"label", "value", "aside"}' % w)
        value = row.get("value", "")
        if isinstance(value, dict):
            # a flagged value renders as a React element, not as markup
            if "flag" not in value or set(value) - {"flag", "note", "text"}:
                raise ContentError('%s: value must be text or {"flag", "note", "text"}' % w)
            value = FlagValue(value["flag"], value.get("note", ""), value.get("text", "[TBD]"))
        elif not isinstance(value, str):
            raise ContentError("%s: value must be text or a single flag object" % w)
        rows.append((row["label"], value, row.get("aside", "")))
    case["brief"] = rows
    sections = []
    for i, sec in enumerate(data["sections"]):
        w = "%s: sections[%d]" % (where, i)
        if not isinstance(sec, dict):
            raise ContentError("%s: expected an object" % w)
        unknown = sorted(k for k in set(sec) - SECTION_FIELDS if not k.startswith("_"))
        if unknown:
            raise ContentError("%s: unknown field(s): %s (allowed: %s)" % (
                w, ", ".join(unknown), ", ".join(sorted(SECTION_FIELDS))))
        if sec.get("kind") not in SECTION_KINDS:
            raise ContentError("%s: kind must be one of stats, bleed, clip_band (or absent)" % w)
        s = {k: v for k, v in sec.items() if not k.startswith("_")}
        for key in ("paras", "cards", "list"):
            if key in s:
                s[key] = [_rich(p, "%s: %s[%d]" % (w, key, j)) for j, p in enumerate(s[key])]
        if "stats" in s:
            s["stats"] = [(st["value"], st["label"]) for st in s["stats"]]
        if "frames" in s:
            frames = []
            for j, fr in enumerate(s["frames"]):
                if set(fr) - {"src", "alt", "caption", "index"} or not {"src", "alt", "caption"} <= set(fr):
                    raise ContentError('%s: frames[%d]: expected {"src", "alt", "caption", "index"}' % (w, j))
                frames.append(("F", fr["src"], fr["alt"], fr["caption"], fr.get("index")))
            s["frames"] = frames
        sections.append(s)
    case["sections"] = sections
    return case


def _missing_assets(case):
    """Asset paths a case names that are not on disk (reported, not fatal)."""
    paths = ["assets/og/case-%s-v1.png" % case["slug"]]
    if case.get("clip"):
        paths.append("assets/motion/%s-poster.webp" % case["clip"])
    if case.get("hero_image"):
        paths.append(case["hero_image"])
    for sec in case["sections"]:
        paths += [fr[1] for fr in sec.get("frames") or [] if isinstance(fr, tuple)]
        if sec.get("kind") == "bleed":
            paths.append(sec["src"])
        if sec.get("kind") == "clip_band":
            paths.append("assets/motion/%s-poster.webp" % sec["base"])
    return [p for p in paths if not os.path.exists(os.path.join(ROOT, p))]


def load_cases(content=CONTENT):
    """
    Read content/ into an ordered {slug: case} dict. Fills MOTION_VARIANTS and
    OPAQUE_CLIPS from each case's clip_sizes / clip_opaque, and derives the
    Previous / Next buttons from the order: the first case has no Previous, the
    last case's Next loops back to the first.
    """
    index_path = os.path.join(content, "projects.json")
    try:
        order = json.load(io.open(index_path, encoding="utf-8"))["order"]
    except (IOError, OSError, ValueError, KeyError) as e:
        raise ContentError("%s: %s" % (os.path.relpath(index_path, ROOT), e))
    folder = os.path.join(content, "projects")
    on_disk = sorted(f[:-5] for f in os.listdir(folder) if f.endswith(".json"))
    stray = [s for s in on_disk if s not in order]
    if stray:
        raise ContentError("content/projects/%s.json is not listed in content/projects.json "
                           "\"order\"" % stray[0])
    if len(set(order)) != len(order):
        raise ContentError("content/projects.json: a slug is listed twice in \"order\"")
    cases = {}
    for slug in order:
        where = "content/projects/%s.json" % slug
        if not re.match(r"^[a-z0-9]+(-[a-z0-9]+)*$", slug):
            raise ContentError("content/projects.json: bad slug %r (use lower-case-words)" % slug)
        try:
            data = json.load(io.open(os.path.join(folder, slug + ".json"), encoding="utf-8"))
        except (IOError, OSError) as e:
            raise ContentError("%s: listed in content/projects.json but %s" % (where, e.strerror))
        except ValueError as e:
            raise ContentError("%s: invalid JSON: %s" % (where, e))
        cases[slug] = _case(slug, data, where)
        clip = data.get("clip")
        if clip and data.get("clip_sizes"):
            MOTION_VARIANTS[clip] = tuple(data["clip_sizes"])
        if clip and data.get("clip_opaque"):
            OPAQUE_CLIPS.add(clip)
    for i, slug in enumerate(order):
        if i > 0:
            prev = cases[order[i - 1]]
            cases[slug]["prev"] = (prev["nav_title"], prev["slug"] + ".html")
        if len(order) > 1:
            nxt = cases[order[(i + 1) % len(order)]]
            cases[slug]["next"] = (nxt["nav_title"], nxt["slug"] + ".html")
    for slug, case in cases.items():
        for path in _missing_assets(case):
            sys.stderr.write("warning: content/projects/%s.json names %s, which does not exist\n"
                             % (slug, path))
        # plain text fields cannot hold a flag, so a scaffold leaves "TBD" there
        for key in ("nav_title", "title", "seo_title", "eyebrow", "description", "og_alt"):
            if "TBD" in (case.get(key) or ""):
                sys.stderr.write("warning: content/projects/%s.json: %s is still a placeholder\n"
                                 % (slug, key))
    return cases


# Filled by main() from content/.
CASES = {}


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
              "hand edit into content/ or build-case.py.")
    return dirty


def main():
    args = sys.argv[1:]
    if "-h" in args or "--help" in args:
        print(__doc__.strip())
        return
    checking = "--check" in args
    args = [a for a in args if a != "--check"]
    try:
        CASES.update(load_cases())
    except ContentError as e:
        sys.stderr.write("content error: %s\n" % e)
        sys.exit(2)
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
