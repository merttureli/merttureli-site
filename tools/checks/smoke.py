"""smoke: load key pages in headless Chromium at 390 and 1440 and look for breakage.

FAIL  console errors, uncaught page errors, failed or 4xx/5xx requests to the
      local server, pages that do not load in 30 s
WARN  failed requests to other hosts (offline fonts, CDNs)
INFO  external hosts contacted, attempts to reach the blocked analytics hosts

The repo is served from a thread in this process on --port (default: a free
port). Pages: SMOKE_PAGES below (one of each kind of page, Studio at rest and
with #reel-coaster); --full adds every case study and every next/lab/*.html.
--pages overrides. A lab page that sets window.labReport (the actor lab
template) FAILs unless labReport.ok. The page list prints with -v.
"""
import functools
import glob
import http.server
import json
import os
import shutil
import threading

from . import Result, PASS, WARN, FAIL, SKIP, sh

NAME = "smoke"
TITLE = "Playwright smoke at 390 + 1440 (console, requests)"
MODES = {"default", "full"}

# default run: one of each kind of page, Studio at rest and with the reel. --full adds
# every case study and every showreel lab page.
SMOKE_PAGES = ["index.html", "websites.html", "projects/charger.html", "privacy.html", "404.html", "hi/",
               "next/", "next/#reel-coaster"]
# --full also loads the pages still in the old design (docs/transition.md)
FULL_EXTRA = ["photography-gallery.html", "photography-lab.html", "assets/charger-explorer/index.html"]
WIDTHS = "390,1440"


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        http.server.SimpleHTTPRequestHandler.end_headers(self)


class Server(http.server.ThreadingHTTPServer):
    daemon_threads = True

    def handle_error(self, request, client_address):
        pass  # the browser drops media connections mid-transfer by design


def serve(root, port):
    handler = functools.partial(Quiet, directory=root)
    httpd = Server(("127.0.0.1", port), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def pages(ctx):
    if ctx.pages:
        return ctx.pages
    if ctx.mode != "full":
        return SMOKE_PAGES
    rel = lambda pattern: sorted(os.path.relpath(p, ctx.root).replace(os.sep, "/") for p in glob.glob(ctx.path(pattern)))
    return list(dict.fromkeys(SMOKE_PAGES[:2] + rel("projects/*.html") + SMOKE_PAGES[3:] + FULL_EXTRA
                              + rel("next/lab/*.html")))


def run(ctx):
    if not shutil.which("node"):
        return Result(SKIP, "node not on PATH")
    try:
        httpd = serve(ctx.root, ctx.port)
    except OSError as e:
        return Result(FAIL, "cannot serve on port %s: %s (pass --port N)" % (ctx.port, e))
    base = "http://127.0.0.1:%d/" % httpd.server_address[1]
    plist = pages(ctx)
    cmd = ["node", os.path.join(os.path.dirname(os.path.abspath(__file__)), "smoke.js"),
           "--base", base, "--pages", ",".join(plist), "--widths", WIDTHS]
    if ctx.out:
        cmd += ["--shots", os.path.join(ctx.out, "smoke")]
    try:
        code, out = sh(cmd, cwd=ctx.root, timeout=300)
    finally:
        httpd.shutdown()
        httpd.server_close()
    line = next((l for l in reversed(out.splitlines()) if l.startswith("{")), None)
    if not line:
        return Result(FAIL, "smoke.js exited %d without a report" % code, out.splitlines()[-20:])
    data = json.loads(line)
    if "error" in data:
        if code == 3:
            return Result(SKIP, data["error"])
        return Result(FAIL, "smoke.js: " + data["error"].splitlines()[0], data["error"].splitlines()[:15])

    errors, warns, external, blocked = {}, {}, {}, {}

    def add(bucket, page, width, text):
        bucket.setdefault((page, text), []).append(str(width))

    for r in data["results"]:
        page, w = r["page"], r["width"]
        for e in r["pageErrors"]:
            add(errors, page, w, "page error: " + e)
        if r.get("lab") and not r["lab"].get("ok"):
            add(errors, page, w, "labReport not ok: " + (r["lab"].get("why") or "see the lab page"))
        for e in r["consoleErrors"]:
            add(errors, page, w, "console: " + e)
        for f in r["failed"]:
            add(errors if f["local"] else warns, page, w, "request failed: %s (%s, %s)" % (f["url"], f["err"], f["type"]))
        for f in r["httpErrors"]:
            add(errors if f["local"] else warns, page, w, "HTTP %d: %s" % (f["status"], f["url"]))
        for h in r["external"]:
            external.setdefault(h, set()).add(page)
        for h in r["blocked"]:
            blocked.setdefault(h, set()).add(page)
    # one line per problem, with the widths it showed at
    errors = ["%s @%s %s" % (p, ",".join(ws), t) for (p, t), ws in errors.items()]
    warns = ["%s @%s %s" % (p, ",".join(ws), t) for (p, t), ws in warns.items()]
    info = ["pages (%d, at %s): %s" % (len(plist), WIDTHS, ", ".join(plist))]
    labs = [r for r in data["results"] if r.get("lab")]
    good = sorted(set(r["page"] for r in labs if r["lab"].get("ok")))
    if good:
        info.append("lab reports ok: " + ", ".join(good))
    if external:
        info.append("external hosts: " + "; ".join("%s (%s)" % (h, ", ".join(sorted(p))) for h, p in sorted(external.items())))
    if blocked:
        info.append("blocked analytics attempts: " + "; ".join("%s (%s)" % (h, ", ".join(sorted(p))) for h, p in sorted(blocked.items())))
    slow = max(data["results"], key=lambda r: r["ms"]) if data["results"] else None
    summary = "%d pages x 2 widths = %d loads" % (len(plist), len(data["results"])) + (", slowest %s @%d %.1fs" % (slow["page"], slow["width"], slow["ms"] / 1000.0) if slow else "")
    if errors:
        return Result(FAIL, "%d problems (%s)" % (len(errors), summary), errors + warns + info)
    if warns:
        return Result(WARN, "%d external failures (%s)" % (len(warns), summary), warns + info)
    return Result(PASS, summary, info if ctx.verbose else [])
