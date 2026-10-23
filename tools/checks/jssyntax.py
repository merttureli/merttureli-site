"""js: every .js/.mjs file and every inline <script> passes `node --check`."""
import concurrent.futures
import os
import re
import shutil
import tempfile

from . import Result, PASS, FAIL, SKIP, sh

NAME = "js"
TITLE = "JavaScript syntax (node --check), files + inline"
MODES = {"fast", "default", "full"}

SCRIPT = re.compile(r"<script\b([^>]*)>(.*?)</script>", re.S | re.I)
TYPE = re.compile(r'\btype\s*=\s*["\']?([^"\'\s>]+)', re.I)
ESM = re.compile(r"^\s*(import\s*[\w{*'\"]|export\s)", re.M)
CLASSIC = ("", "text/javascript", "application/javascript")


def node_check(path):
    return sh(["node", "--check", path], timeout=60)


def run(ctx):
    if not shutil.which("node"):
        return Result(SKIP, "node not on PATH")
    files = ctx.site_files((".js", ".mjs")) + [
        f for f in ctx.files() if f.startswith("tools/") and f.endswith((".js", ".mjs"))
        and "node_modules/" not in f]
    jobs = [(f, ctx.path(f), 0) for f in sorted(set(files))]
    tmp = tempfile.mkdtemp(prefix="check-js-")
    inline = 0
    try:
        # node --check exits 0 on a .js module with a syntax error (module detection
        # swallows it), so ES modules are checked as .mjs copies
        for k, (label, path, line) in enumerate(jobs):
            if path.endswith(".js"):
                src = open(path, encoding="utf-8", errors="replace").read()
                if ESM.search(src):
                    name = os.path.join(tmp, label.replace("/", "__") + ".mjs")
                    with open(name, "w", encoding="utf-8") as fh:
                        fh.write(src)
                    jobs[k] = (label, name, line)
        for f in ctx.site_files((".html",)):
            src = open(ctx.path(f), encoding="utf-8", errors="replace").read()
            for i, m in enumerate(SCRIPT.finditer(src)):
                attrs, body = m.group(1), m.group(2)
                t = TYPE.search(attrs)
                kind = t.group(1).lower() if t else ""
                if re.search(r"\bsrc\s*=", attrs, re.I) or not body.strip():
                    continue
                if kind != "module" and kind not in CLASSIC:
                    continue
                inline += 1
                line = src.count("\n", 0, m.start(2))
                ext = ".mjs" if kind == "module" else ".cjs"
                name = os.path.join(tmp, f.replace("/", "__") + ".%d%s" % (i, ext))
                with open(name, "w", encoding="utf-8") as fh:
                    # pad with blank lines so node's line numbers match the page
                    fh.write("\n" * line + body)
                jobs.append(("%s (<script> #%d)" % (f, i + 1), name, line))
        bad = []
        with concurrent.futures.ThreadPoolExecutor(4) as pool:
            for (label, path, _), (code, out) in zip(jobs, pool.map(lambda j: node_check(j[1]), jobs)):
                if code:
                    lines = [l for l in out.splitlines() if l.strip()]
                    where = next((l for l in lines if l.startswith(path)), "")
                    lineno = where.rsplit(":", 1)[-1] if where else "?"
                    err = next((l for l in lines if re.match(r"^\w*Error\b", l)), lines[-1] if lines else "?")
                    bad.append("%s:%s %s" % (label, lineno, err))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    summary = "%d files, %d inline scripts" % (len(jobs) - inline, inline)
    if bad:
        return Result(FAIL, "%d with syntax errors (%s)" % (len(bad), summary), bad)
    return Result(PASS, summary)
