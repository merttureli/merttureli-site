"""visual: pixel diff of the working tree against a git ref (tools/visual-regress), --full only.

Baseline is `git archive <base>` (default HEAD) unpacked into a temp dir; the
candidate is the working tree. Runs visual-regress --strict at widths 390 and
1440 with both palettes on its default page list (or --pages), masking the
live 3D corridor and the live study iframe (MASK below). FAILs on any
differing screen or any gate change (h1 count, console errors, external hosts).
The contact sheet is <out>/visual/index.html.
"""
import os
import shutil
import socket
import subprocess
import tempfile

from . import Result, PASS, FAIL, SKIP, sh, tail

NAME = "visual"
TITLE = "visual-regress vs base ref (pixels + gates)"
MODES = {"full"}

WIDTHS = "390,1440"
# painted over in both shots: live scenes whose state depends on load timing.
# photo-corridor is the photography 3D scene (visual-regress default); .study-screen
# is the live study iframe on websites.html, which flakes under CPU load.
MASK = "photo-corridor,.study-screen"


def free_ports(n):
    socks, ports = [], []
    for _ in range(n):
        s = socket.socket()
        s.bind(("127.0.0.1", 0))
        socks.append(s)
        ports.append(s.getsockname()[1])
    for s in socks:
        s.close()
    return ports


def run(ctx):
    vr = ctx.path("tools/visual-regress")
    if not os.path.isdir(os.path.join(vr, "node_modules", "pixelmatch")):
        return Result(SKIP, "needs its deps: cd tools/visual-regress && npm install")
    changed = ctx.changed()
    if not changed:
        return Result(SKIP, "nothing differs from %s; pass --base REF to compare with an older commit" % ctx.base)
    base = tempfile.mkdtemp(prefix="check-visual-base-")
    out = os.path.join(ctx.out, "visual") if ctx.out else tempfile.mkdtemp(prefix="check-visual-")
    try:
        archive = subprocess.Popen(["git", "-C", ctx.root, "archive", ctx.base], stdout=subprocess.PIPE)
        untar = subprocess.run(["tar", "-x", "-C", base], stdin=archive.stdout)
        archive.stdout.close()
        if archive.wait() or untar.returncode:
            return Result(FAIL, "git archive %s failed" % ctx.base)
        cmd = ["node", os.path.join(vr, "visual-regress.js"), "--baseline", base, "--candidate", ctx.root,
               "--out", out, "--ports", "%d,%d" % tuple(free_ports(2)), "--widths", WIDTHS, "--mask", MASK, "--strict"]
        if ctx.pages:
            cmd += ["--pages", ",".join(p.split("#")[0] for p in ctx.pages)]
        code, text = sh(cmd, cwd=ctx.root, timeout=1800)
    finally:
        shutil.rmtree(base, ignore_errors=True)
    summary = next((l for l in reversed(text.splitlines()) if "screens differ" in l), "")
    if code == 0:
        return Result(PASS, summary.split(" Report:")[0] or "no differences", ["report: " + os.path.join(out, "index.html")])
    return Result(FAIL, summary.split(" Report:")[0] or "visual-regress exited %d" % code,
                  tail(text, 30) + ["report: " + os.path.join(out, "index.html")])
