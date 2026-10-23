#!/usr/bin/env python3
"""Render the product stills from the live 3D actors (same model, rig and look as the hero showreel).

    python3 tools/stills.py                 render every still in STILLS into next/assets/img/stills/
    python3 tools/stills.py --only case     only the names containing "case"
    python3 tools/stills.py --list          print the table and exit

Each still is a transparent WebP drawn by next/js/case-stage.js on next/lab/stills.html (a canvas of
the given size, at t seconds into that stage's case-page sequence; t = 0 is the pose the live stage
starts from, so the case-page poster hands over to the canvas without a jump). Re-run it after an
actor, the case-stage framing or the CSS stage size changes. Needs node + Playwright
(/opt/node22/lib/node_modules/playwright) and ffmpeg with libwebp. Serves the repo on --port
(default 9123) while it runs; nothing leaves 127.0.0.1.
"""
import argparse
import functools
import http.server
import json
import os
import subprocess
import sys
import tempfile
import threading

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "next", "assets", "img", "stills")

# name, stage key (case-stage.js ADAPTERS), canvas w x h (CSS px), device pixel ratio, t (s), width to save (0 = as drawn)
STILLS = [
    # home tiles and spec sheets: one moment that shows what the product does
    ("therma-shift-16x9", "therma-shift", 1600, 900, 1.5, 18.5, 0),
    ("therma-shift-4x5", "therma-shift", 800, 1000, 1.5, 18.5, 0),
    ("robo-catcher-16x9", "robo-catcher", 1600, 900, 1.5, 6.1, 0),
    ("robo-catcher-4x5", "robo-catcher", 800, 1000, 1.5, 6.1, 0),
    ("rudder-pedals-16x9", "rudder-pedals", 1600, 900, 1.5, 14.8, 0),
    ("rudder-pedals-4x5", "rudder-pedals", 800, 1000, 1.5, 14.8, 0),
    ("therma-shift-16x9-1200", "therma-shift", 1600, 900, 1.5, 18.5, 1200),
    ("therma-shift-4x5-600", "therma-shift", 800, 1000, 1.5, 18.5, 600),
    ("robo-catcher-16x9-1200", "robo-catcher", 1600, 900, 1.5, 6.1, 1200),
    ("robo-catcher-4x5-600", "robo-catcher", 800, 1000, 1.5, 6.1, 600),
    ("rudder-pedals-16x9-1200", "rudder-pedals", 1600, 900, 1.5, 14.8, 1200),
    ("rudder-pedals-4x5-600", "rudder-pedals", 800, 1000, 1.5, 14.8, 600),
    # case-page posters: the stage card at 1440 (1348 x 708) and at 390 (358 x 394), the start pose
    ("therma-shift-case-land", "therma-shift", 1348, 708, 1.5, 0, 0),
    ("therma-shift-case-port", "therma-shift", 358, 394, 2.5, 0, 0),
    ("robo-catcher-case-land", "robo-catcher", 1348, 708, 1.5, 0, 0),
    ("robo-catcher-case-port", "robo-catcher", 358, 394, 2.5, 0, 0),
    ("rudder-pedals-case-land", "rudder-pedals", 1348, 708, 1.5, 0, 0),
    ("rudder-pedals-case-port", "rudder-pedals", 358, 394, 2.5, 0, 0),
    # the rudder pedals mechanism moment (band, 16:9 on desktop, 4:3 on phones)
    ("rudder-pedals-side-case-land", "rudder-pedals:side", 1348, 758, 1.5, 0, 0),
    ("rudder-pedals-side-case-port", "rudder-pedals:side", 358, 268, 2.5, 0, 0),
    # the Therma-Shift stack moment ("The design" card media, 4:3, at 1440 and at 390): the open stack
    ("therma-shift-stack-case-land", "therma-shift:stack", 644, 483, 2, 0, 0),
    ("therma-shift-stack-case-port", "therma-shift:stack", 322, 242, 2.5, 0, 0),
]

NODE = r"""
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const [base, jobsFile] = process.argv.slice(2);
const jobs = JSON.parse(fs.readFileSync(jobsFile, 'utf8'));
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const j of jobs) {
    const c = await b.newContext({ viewport: { width: j.w + 40, height: j.h + 40 } });
    await c.route('**/*', r => (/^https?:\/\/127\.0\.0\.1/.test(r.request().url()) && r.request().method() === 'GET' ? r.continue() : r.abort()));
    const p = await c.newPage();
    p.on('console', m => { if (m.type() === 'error') console.error('  console:', m.text()); });
    await p.goto(`${base}/next/lab/stills.html?key=${encodeURIComponent(j.key)}&w=${j.w}&h=${j.h}&stage-capture=${j.dpr}&t=${j.t}`);
    await p.waitForFunction(() => window.__caseStage && window.__caseStage.ready, null, { timeout: 120000 });
    const url = await p.evaluate(() => document.querySelector('canvas').toDataURL('image/png'));
    fs.writeFileSync(j.png, Buffer.from(url.split(',')[1], 'base64'));
    console.log('  drew', j.name);
    await c.close();
  }
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
"""


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--only", help="render only names containing this text")
    ap.add_argument("--list", action="store_true", help="print the table and exit")
    ap.add_argument("--port", type=int, default=9123)
    a = ap.parse_args()
    rows = [r for r in STILLS if not a.only or a.only in r[0]]
    if a.list:
        for r in rows:
            print("%-30s %-20s %4dx%-4d dpr %.1f  t %5.2f  %s" % (r[0], r[1], r[2], r[3], r[4], r[5], ("width %d" % r[6]) if r[6] else ""))
        return
    os.makedirs(OUT, exist_ok=True)
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *args):
            pass
    handler = functools.partial(Quiet, directory=ROOT)
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", a.port), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        with tempfile.TemporaryDirectory() as tmp:
            jobs = [{"name": n, "key": k, "w": w, "h": h, "dpr": d, "t": t, "png": os.path.join(tmp, n + ".png")}
                    for n, k, w, h, d, t, _ in rows]
            jf = os.path.join(tmp, "jobs.json")
            with open(jf, "w") as f:
                json.dump(jobs, f)
            js = os.path.join(tmp, "draw.js")
            with open(js, "w") as f:
                f.write(NODE)
            if subprocess.call(["node", js, "http://127.0.0.1:%d" % a.port, jf]):
                sys.exit("stills: drawing failed")
            for (n, k, w, h, d, t, width), j in zip(rows, jobs):
                out = os.path.join(OUT, n + ".webp")
                scale = ["-vf", "scale=%d:-1:flags=lanczos" % width] if width else []
                subprocess.check_call(["ffmpeg", "-loglevel", "error", "-y", "-i", j["png"], *scale, "-c:v", "libwebp",
                                       "-quality", "82", "-compression_level", "6", "-pix_fmt", "yuva420p", out])
                print("  wrote", os.path.relpath(out, ROOT), "%d KB" % (os.path.getsize(out) // 1024))
    finally:
        srv.shutdown()


if __name__ == "__main__":
    main()
