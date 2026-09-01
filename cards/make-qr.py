#!/usr/bin/env python3
"""
Generate the QR codes for the business cards, as SVG.

SVG rather than PNG because a card is printed at 300 DPI or better and a raster
QR at card scale will show its pixels along the module edges. Vector modules
stay crisp at any size and at any printer.

Each card variant gets its own tracking code, so the dashboard can tell a career
fair handout apart from a card left on a desk. The codes register through the
tracker's /codes endpoint the same way an application code does.

    python make-qr.py

Error correction is set to H (30% recoverable). That is higher than a plain URL
needs, and the reason is physical: a card lives in a wallet, gets bent, and
picks up ink scuff. H survives that. It costs a slightly denser symbol, which at
the sizes here is still comfortably scannable.
"""
import io
import os

import qrcode
import qrcode.image.svg

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = "https://merttureli.com/"

# One code per print run, so the dashboard can separate them. Register these
# against the tracker with portfolio-link.py before handing any card out.
CODES = {
    "card-fair":    "Career fairs and conferences",
    "card-desk":    "Left with a recruiter or on a desk",
    "card-general": "Everything else",
}


def make(code, path):
    qr = qrcode.QRCode(
        version=None,                                    # smallest that fits
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=10,
        border=0,          # the card supplies its own quiet zone, see README
    )
    qr.add_data(BASE + "?r=" + code)
    qr.make(fit=True)
    img = qr.make_image(image_factory=qrcode.image.svg.SvgPathImage)
    img.save(path)
    return qr.modules_count


def main():
    out = os.path.join(HERE, "qr")
    if not os.path.isdir(out):
        os.makedirs(out)
    for code, note in CODES.items():
        p = os.path.join(out, code + ".svg")
        n = make(code, p)
        print("  %-14s %2dx%-2d modules  %-34s %s"
              % (code, n, n, note, os.path.relpath(p, HERE)))
    print("\nRegister the codes before printing, or a scan lands as an unknown visit:")
    for code, note in CODES.items():
        print('  %s  ->  "%s"' % (code, note))


if __name__ == "__main__":
    main()
