"""tokens: is a CSS diff a pure token rename? (role 1's round-trip proof, generalized)

For every stylesheet in css/ or next/css/ that differs from --base, expand each
var(--token) back to its :root value on both sides (site: _ds/*/tokens/*.css +
css/tokens.css; Studio: next/css/tokens.css; plus the file's own :root), drop
comments, :root blocks and the tokens @import, normalize units and spacing, and
compare. If a tokens file changed, every stylesheet of that family is compared.

PASS  no CSS changed, or every change is a pure rename (no computed value moves)
WARN  a file changes values (fine for a real style change: prove it with
      --only visual), or a newly used token is redefined in a scope (.on-dark,
      a palette, @media), so expanding it blindly can hide a change
"""
import glob
import os
import re

from . import Result, PASS, WARN, git

NAME = "tokens"
TITLE = "CSS diff vs --base is a pure token rename (else WARN)"
MODES = {"fast", "default", "full"}

FAMILIES = {
    "site": {"dir": "css/", "tokens": ["_ds/*/tokens/*.css", "css/tokens.css"]},
    "studio": {"dir": "next/css/", "tokens": ["next/css/tokens.css"]},
}
VAR = re.compile(r"var\(\s*(--[\w-]+)\s*\)")
IMPORT_TOKENS = re.compile(r"""@import\s+(?:url\()?\s*["']?tokens\.css["']?\s*\)?\s*;""")


def read(ctx, rev, rel):
    if rev is None:
        p = ctx.path(rel)
        return open(p, encoding="utf-8").read() if os.path.isfile(p) else None
    return git(ctx.root, "show", "%s:%s" % (rev, rel))


def listed(ctx, rev, pattern):
    if rev is None:
        return sorted(os.path.relpath(p, ctx.root).replace(os.sep, "/") for p in glob.glob(ctx.path(pattern)))
    out = git(ctx.root, "ls-tree", "-r", "--name-only", rev) or ""
    rx = re.compile("^" + re.escape(pattern).replace(r"\*", "[^/]*") + "$")
    return sorted(f for f in out.splitlines() if rx.match(f))


def blocks(css):
    """Yield (selector, body, depth) for every innermost rule, with its brace depth."""
    css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
    depth, start, sel_start = 0, 0, 0
    stack = []
    for i, ch in enumerate(css):
        if ch == "{":
            stack.append((css[sel_start:i].strip(), i + 1))
            depth += 1
            sel_start = i + 1
        elif ch == "}":
            if stack:
                sel, start = stack.pop()
                body = css[start:i]
                if "{" not in body:
                    yield sel, body, depth
            depth = max(0, depth - 1)
            sel_start = i + 1
        elif ch == ";" and depth == 0:
            sel_start = i + 1


def root_vars(css):
    vals = {}
    for sel, body, depth in blocks(css):
        if depth == 1 and sel.split(",")[-1].strip() == ":root":
            for name, val in re.findall(r"(--[\w-]+)\s*:\s*([^;]+)", body):
                vals[name] = val.strip()
    return vals


def scoped_names(css):
    out = set()
    for sel, body, depth in blocks(css):
        if depth > 1 or sel.split(",")[-1].strip() != ":root":
            out.update(re.findall(r"(--[\w-]+)\s*:", body))
    return out


def strip_root(css):
    """Drop top-level :root { ... } rules (their values are expanded already)."""
    css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
    depth, stmt, i = 0, 0, 0
    while i < len(css):
        ch = css[i]
        if ch == "{":
            if depth == 0 and css[stmt:i].strip() == ":root":
                end = css.find("}", i)
                css = css[:stmt] + css[end + 1:]
                i = stmt
                continue
            depth += 1
        elif ch == "}":
            depth = max(0, depth - 1)
            if depth == 0:
                stmt = i + 1
        elif ch == ";" and depth == 0:
            stmt = i + 1
        i += 1
    return css


def norm(css):
    css = IMPORT_TOKENS.sub("", css)
    css = re.sub(r"(?<![\w.#-])(\d*\.?\d+)s\b", lambda m: "%gms" % (float(m.group(1)) * 1000), css)
    css = re.sub(r"(?<![\w.#-])(\d*\.?\d+)ms\b", lambda m: "%gms" % float(m.group(1)), css)
    css = re.sub(r"(?<![\w.])0\.(\d)", r".\1", css)
    css = re.sub(r"\s+", " ", css)
    css = re.sub(r"\s*([{};:,>()])\s*", r"\1", css)
    return css.replace(";}", "}").strip()


def expand(css, tokens):
    for _ in range(6):
        new = VAR.sub(lambda m: tokens.get(m.group(1), m.group(0)), css)
        if new == css:
            break
        css = new
    return css


def side(ctx, rev, fam, rel):
    text = read(ctx, rev, rel)
    if text is None:
        return None
    tokens = {}
    for pat in fam["tokens"]:
        for t in listed(ctx, rev, pat):
            tokens.update(root_vars(read(ctx, rev, t) or ""))
    tokens.update(root_vars(text))
    return norm(strip_root(expand(re.sub(r"/\*.*?\*/", "", text, flags=re.S), tokens)))


def run(ctx):
    base = ctx.base
    diff = (git(ctx.root, "diff", "--name-only", base, "--", "css/", "next/css/") or "").split()
    diff += (git(ctx.root, "ls-files", "--others", "--exclude-standard", "--", "css/", "next/css/") or "").split()
    diff = sorted(set(f for f in diff if f.endswith(".css")))
    if not diff:
        return Result(PASS, "no CSS changed vs %s" % base)
    compare, pure, moved, unsafe = set(), [], [], []
    for key, fam in FAMILIES.items():
        mine = [f for f in diff if f.startswith(fam["dir"]) and "/" not in f[len(fam["dir"]):]]
        tok_files = set()
        for pat in fam["tokens"]:
            tok_files.update(listed(ctx, None, pat))
        if any(f in tok_files for f in diff):
            mine += [f for f in listed(ctx, None, fam["dir"] + "*.css") if f not in tok_files]
        for f in sorted(set(mine) - tok_files):
            compare.add(f)
            old, new = side(ctx, base, fam, f), side(ctx, None, fam, f)
            if old is None or new is None:
                moved.append("%s: %s" % (f, "new file" if old is None else "deleted"))
                continue
            (pure if old == new else moved).append(f if old == new else
                                                   "%s: computed values change vs %s" % (f, base))
            raw_old, raw_new = read(ctx, base, f) or "", read(ctx, None, f) or ""
            scoped = set()
            for g in listed(ctx, None, fam["dir"] + "*.css"):
                scoped |= scoped_names(read(ctx, None, g) or "")
            for name in sorted(set(VAR.findall(raw_new))):
                if raw_new.count("var(%s)" % name) > raw_old.count("var(%s)" % name) and name in scoped:
                    unsafe.append("%s: newly uses %s, which is also set in a scope (palette, @media, .on-dark)"
                                  % (f, name))
    if not compare:
        return Result(PASS, "only token files changed, no stylesheet uses differ")
    if moved or unsafe:
        details = moved + unsafe + ["A real style change is fine: prove the pages with python3 tools/check.py --only visual"]
        return Result(WARN, "%d of %d changed stylesheets move values%s" % (
            len(moved), len(compare), ", %d scoped token uses" % len(unsafe) if unsafe else ""), details)
    return Result(PASS, "%d changed stylesheets are pure token renames vs %s" % (len(pure), base), pure)
