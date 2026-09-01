#!/usr/bin/env python3
"""
Lift the real 2026 competition fin profile out of its DXF and emit an SVG path.

Not a redrawing. This reads `2026 COMP FIN.DXF`, the file that was sent to the
laser cutter for the flight hardware, and traces the same six lines. A card
carrying a shape that is merely fin-like is decoration. A card carrying the
outline that was actually cut is an artifact, and the difference matters to the
one audience that can tell.

    python make-fin.py

The profile is 90 x 68 mm and includes the root tab that slots into the
airframe, which is the part that makes it read as a real part rather than a
silhouette.
"""
import io
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
DXF = r"C:\Users\mrttr\Desktop\Solid drawings\CLASS AND CLUB\2026 COMP FIN.DXF"
OUT = os.path.join(HERE, "art", "fin-2026.svg")


def lines(path):
    """Every LINE entity as ((x1,y1),(x2,y2)). DXF group codes 10/20 and 11/21."""
    text = io.open(path, encoding="utf-8", errors="replace").read().replace("\r", "")
    out = []
    for chunk in text.split("\n  0\n"):
        if not chunk.startswith("LINE"):
            continue
        rows = chunk.split("\n")
        g = {}
        for i in range(len(rows) - 1):
            code = rows[i].strip()
            if code in ("10", "20", "11", "21"):
                try:
                    g[code] = float(rows[i + 1])
                except ValueError:
                    pass
        if len(g) == 4:
            out.append(((g["10"], g["20"]), (g["11"], g["21"])))
    return out


def chain(segs):
    """
    Walk the segments into one closed loop.

    A DXF stores lines in whatever order the exporter felt like, so the raw
    list draws the right shape but as six disconnected strokes. Chaining them
    lets the SVG be a single closed path, which is what a print RIP wants and
    what makes a stroke join cleanly at the corners instead of showing six
    butt ends.
    """
    segs = list(segs)
    loop = list(segs.pop(0))
    while segs:
        for i, (a, b) in enumerate(segs):
            if _near(a, loop[-1]):
                loop.append(b); segs.pop(i); break
            if _near(b, loop[-1]):
                loop.append(a); segs.pop(i); break
        else:
            break                       # open profile, emit what we have
    return loop


def _near(p, q, tol=1e-6):
    return abs(p[0] - q[0]) < tol and abs(p[1] - q[1]) < tol


def main():
    pts = chain(lines(DXF))
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    w, h = max(xs) - min(xs), max(ys) - min(ys)

    # Flip Y. DXF counts up from the origin, SVG counts down from the top.
    d = "M" + " L".join("%.3f,%.3f" % (p[0] - min(xs), max(ys) - p[1]) for p in pts) + " Z"

    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %.3f %.3f" '
        'width="%.3fmm" height="%.3fmm">\n'
        '  <!-- 2026 Battle of the Rockets competition fin, traced from the DXF\n'
        '       that cut the flight hardware. %.0f x %.0f mm. -->\n'
        '  <path d="%s" fill="none" stroke="currentColor" stroke-width="0.9"\n'
        '        stroke-linejoin="miter" vector-effect="non-scaling-stroke"/>\n'
        "</svg>\n" % (w, h, w, h, w, h, d)
    )

    if not os.path.isdir(os.path.dirname(OUT)):
        os.makedirs(os.path.dirname(OUT))
    io.open(OUT, "w", encoding="utf-8", newline="\n").write(svg)
    print("  %d vertices, %.0f x %.0f mm  ->  %s"
          % (len(pts), w, h, os.path.relpath(OUT, HERE)))
    print("  closed loop:", "yes" if _near(pts[0], pts[-1]) else "no, open profile")


if __name__ == "__main__":
    main()
