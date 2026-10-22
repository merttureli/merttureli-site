#!/usr/bin/env python3
"""Convert the bake PNGs (tools/rocket-hero/png) to the served webp files.

    python3 -I tools/rocket-hero/towebp.py [png dir]

Writes assets/rocket/{livery,still,line}.webp and prints the 800 px inline posters
as data URIs into tools/rocket-hero/png/inline.json for src/index.html.
"""
import base64, io, json, os, sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PNG = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'tools', 'rocket-hero', 'png')
OUT = os.path.join(ROOT, 'assets', 'rocket')

Image.open(os.path.join(PNG, 'livery.png')).convert('RGB').save(os.path.join(OUT, 'livery.webp'), lossless=True, quality=100, method=6)
Image.open(os.path.join(PNG, 'still.png')).save(os.path.join(OUT, 'still.webp'), quality=88, alpha_quality=100, method=6)
Image.open(os.path.join(PNG, 'line.png')).save(os.path.join(OUT, 'line.webp'), quality=90, alpha_quality=100, method=6)
inline = {}
for name, q in (('still', 72), ('line', 80)):
    b = io.BytesIO()
    Image.open(os.path.join(PNG, name + '-800.png')).save(b, 'webp', quality=q, alpha_quality=80, method=6)
    inline[name] = 'data:image/webp;base64,' + base64.b64encode(b.getvalue()).decode()
    print(name, len(b.getvalue()), 'bytes inline')
json.dump(inline, open(os.path.join(PNG, 'inline.json'), 'w'))
for f in ('livery.webp', 'still.webp', 'line.webp'):
    print(f, os.path.getsize(os.path.join(OUT, f)))
