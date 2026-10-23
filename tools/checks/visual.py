"""visual: pixel diff of the working tree against a git ref (tools/visual-regress), --full only.

Baseline is `git archive <base>` (default HEAD) unpacked into a temp dir; the
candidate is the working tree. Two runs of visual-regress --strict at 390 and
1440 (or only the groups --pages names):
  site    its default page list (home, websites, privacy, 404, hi, every case
          study) in both palettes, masking the live 3D corridor and study iframe
  studio  next/index.html in one palette (palettes do nothing there), masking
          the live hero canvas and the clock
FAILs on any differing screen or gate change (h1 count, console errors,
external hosts) on a page not named in --expect-change; the differing screens
are listed first, with their diff images. The contact sheets are
<out>/visual/{site,studio}/index.html.

Deps (pixelmatch, pngjs): tools/visual-regress/node_modules, else the main
checkout's copy (worktrees), else NODE_PATH, else `npm ci` once. If none of
that works the check WARNs "NOT RUN" with the exact fix: pixels are not proven.
"""
import json
import os
import shutil
import socket
import subprocess
import tempfile

from . import Result, PASS, WARN, FAIL, SKIP, git, sh, tail

NAME = "visual"
TITLE = "visual-regress vs base ref (pixels + gates)"
MODES = {"full"}

WIDTHS = "390,1440"
GROUPS = [
    # name, default pages (None: visual-regress default list), palettes, masks
    ("site", None, "original,slate", "photo-corridor,.study-screen"),
    ("studio", "next/index.html", "original", ".hero__canvas,[data-clock]"),
]
FIX = "cd tools/visual-regress && npm install, then python3 tools/check.py --only visual"


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


def has_deps(folder):
    return bool(folder) and all(os.path.isdir(os.path.join(folder, m)) for m in ("pixelmatch", "pngjs"))


def find_deps(ctx):
    """(node_modules folder, how it was found) or (None, why not)."""
    vr = ctx.path("tools/visual-regress")
    local = os.path.join(vr, "node_modules")
    if has_deps(local):
        return local, "local"
    common = (git(ctx.root, "rev-parse", "--path-format=absolute", "--git-common-dir") or "").strip()
    if common:
        main = os.path.join(os.path.dirname(common), "tools", "visual-regress", "node_modules")
        if has_deps(main):
            return main, "main checkout"
    for d in (os.environ.get("NODE_PATH") or "").split(os.pathsep):
        if has_deps(d):
            return d, "NODE_PATH"
    if shutil.which("npm"):
        code, out = sh(["npm", "ci", "--no-audit", "--no-fund"], cwd=vr, timeout=240)
        if code == 0 and has_deps(local):
            return local, "npm ci"
        return None, "npm ci failed: " + (tail(out, 1) or ["?"])[0]
    return None, "npm not on PATH"


def norm(page):
    page = page.split("#")[0]
    return page + "index.html" if page.endswith("/") or page == "" else page


def groups_for(ctx):
    """[(group, pages or None, palettes, masks)] for this run."""
    if not ctx.pages:
        return list(GROUPS)
    pages = list(dict.fromkeys(norm(p) for p in ctx.pages))
    studio = [p for p in pages if p.startswith("next/")]
    site = [p for p in pages if not p.startswith("next/")]
    out = []
    for name, _, pal, mask in GROUPS:
        chosen = studio if name == "studio" else site
        if chosen:
            out.append((name, ",".join(chosen), pal, mask))
    return out


def run(ctx):
    vr = ctx.path("tools/visual-regress")
    deps, how = find_deps(ctx)
    if not deps:
        return Result(WARN, "NOT RUN, pixels not proven (%s). Fix: %s" % (how, FIX),
                      ["visual-regress needs pixelmatch and pngjs: " + FIX,
                       "or run without pixels on purpose: python3 tools/check.py --full --skip visual"])
    changed = ctx.changed()
    if not changed:
        return Result(SKIP, "nothing differs from %s; pass --base REF to compare with an older commit" % ctx.base)
    env = dict(os.environ)
    if how != "local":
        env["NODE_PATH"] = deps + (os.pathsep + env["NODE_PATH"] if env.get("NODE_PATH") else "")
    expect = [norm(p) for p in (ctx.expect or [])]
    base = tempfile.mkdtemp(prefix="check-visual-base-")
    root_out = os.path.join(ctx.out, "visual") if ctx.out else tempfile.mkdtemp(prefix="check-visual-")
    reports, crashes = [], []
    try:
        archive = subprocess.Popen(["git", "-C", ctx.root, "archive", ctx.base], stdout=subprocess.PIPE)
        untar = subprocess.run(["tar", "-x", "-C", base], stdin=archive.stdout)
        archive.stdout.close()
        if archive.wait() or untar.returncode:
            return Result(FAIL, "git archive %s failed" % ctx.base)
        for name, pages, palettes, mask in groups_for(ctx):
            out = os.path.join(root_out, name)
            cmd = ["node", os.path.join(vr, "visual-regress.js"), "--baseline", base, "--candidate", ctx.root,
                   "--out", out, "--ports", "%d,%d" % tuple(free_ports(2)), "--widths", WIDTHS,
                   "--palettes", palettes, "--mask", mask, "--strict"]
            if pages:
                cmd += ["--pages", pages]
            code, text = sh(cmd, cwd=ctx.root, timeout=1800, env=env)
            rep = os.path.join(out, "report.json")
            if not os.path.exists(rep):
                crashes += ["%s: visual-regress exited %d without a report" % (name, code)] + tail(text, 15)
                continue
            with open(rep, encoding="utf-8") as fh:
                reports.append((name, out, json.load(fh)))
    finally:
        shutil.rmtree(base, ignore_errors=True)
    if crashes:
        return Result(FAIL, "visual-regress crashed", crashes)

    shots = differ = 0
    unexpected, expected, gate_lines = [], [], []
    differing_pages, bad_pages = set(), set()
    for name, out, rep in reports:
        shots += rep["summary"]["shots"]
        for r in rep["results"]:
            if not r["diff"]["pixels"]:
                continue
            differ += 1
            differing_pages.add(r["page"])
            ok = r["page"] in expect
            line = "%s %s @%d %s: %d px (%.3f%%)%s  %s" % (
                "CHANGED (expected)" if ok else "DIFFERS", r["page"], r["width"], r["palette"], r["diff"]["pixels"],
                r["diff"]["ratio"] * 100, ", size changed" if r["diff"].get("sizeChanged") else "",
                os.path.join(out, r["images"]["diff"] or r["images"]["candidate"]))
            (expected if ok else unexpected).append(line)
            if not ok:
                bad_pages.add(r["page"])
        for page, g in sorted(rep["gates"].items()):
            for change in g["changes"]:
                ok = page in expect
                gate_lines.append(("GATE (expected) " if ok else "GATE ") + "%s: %s" % (page, change))
                if not ok:
                    unexpected.append(gate_lines[-1])
                    bad_pages.add(page)
    sheets = ["report: " + os.path.join(out, "index.html") for _, out, _ in reports]
    missing = [p for p in expect if p not in differing_pages]
    notes = ["expected a change on %s but it renders the same" % p for p in missing]
    head = "%d/%d screens differ" % (differ, shots)
    if unexpected:
        return Result(FAIL, "%s; not expected on: %s" % (head, ", ".join(sorted(bad_pages))),
            unexpected + expected + [g for g in gate_lines if g not in unexpected] + notes + sheets +
            ["intended? rerun with --expect-change " + ",".join(sorted(differing_pages)) +
             " after looking at the diff images"])
    if expected:
        return Result(WARN if notes else PASS, "%s, all on --expect-change pages (%s)" % (
            head, ", ".join(sorted(differing_pages))),
                      expected + gate_lines + notes + sheets)
    if notes:
        return Result(WARN, "no differences, but %s" % notes[0], notes + sheets)
    return Result(PASS, "no differences (%d screens)" % shots, sheets)
