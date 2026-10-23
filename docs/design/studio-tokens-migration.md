# Studio tokens migration (studio.css -> tokens.css)

Moves every literal in `next/css/studio.css` onto the tokens in `next/css/tokens.css`, with zero visible change.
**Applied** on opt/systems after the showreel round 2 merge (0 pixel diff at 390 and 1440, `#reel-coaster` clean). Kept as the record; rerunning it is a no-op.

## Apply (one command, run from the repo root)

```sh
# 1. dry run: per-pair counts + the resolve-back proof, writes nothing
awk '/^```python migrate$/{f=1;next} /^```$/{f=0} f' docs/design/studio-tokens-migration.md | python3 -
# 2. apply
awk '/^```python migrate$/{f=1;next} /^```$/{f=0} f' docs/design/studio-tokens-migration.md | python3 - --write
# options: --diff (show the diff), --strict (fail on any count change), --root DIR, --help
```

What it does, in order:

| Step | Change | Guard |
|---|---|---|
| 1 | Removes the `:root { ... }` block from `studio.css` (leaves a one-line comment) | Fails if that block holds any `--name: value` that `tokens.css` lacks or has with another value. Add new ones to `tokens.css` first. |
| 2 | Applies the pairs below to `studio.css` (`css`) and `studio.js` (`js`), every match | Prints found/expected per pair. A different count is a warning (the merge added or removed rules); `--strict` makes it an error. |
| 3 | Proof: resolves every `var(--token)` back to its value in old and new files and compares | Fails unless both are identical. This is the zero-diff guarantee for values. |
| 4 | Lists color literals still in `studio.css` | Expected: none. |
| 5 | Adds `<link rel="stylesheet" href="css/tokens.css">` right before the `studio.css` link in `next/index.html` | Skipped if already there. |

It is idempotent: a second run finds 0 matches, says `already applied?` per pair and changes nothing.

## After applying: verify

```sh
python3 tools/check.py --fast                 # once role 7's tool exists
# pixel check of the Studio page, baseline = the commit before the migration:
git archive HEAD | tar -x -C /tmp/studio-base
node tools/visual-regress/visual-regress.js --baseline /tmp/studio-base --candidate . \
  --pages next/index.html --widths 390,1440 --palettes original --out /tmp/studio-regress --strict
```

From then on, any new color, size or duration in `studio.css` uses a token from
`tokens.css` (add one there if none fits). See `docs/design/studio.md`.

## The pairs

Each find is matched literally, every occurrence. A find that starts with a space keeps the space (it stops `.5s`
matching inside `1.5s`). Order does not matter: no replacement creates another find, and the `:root` block is gone
before any pair runs, so token definitions are never rewritten. To add a pair, add a row (next number, `css` or `js`,
backticked find and replace, expected count); the script reads this table.

<!-- pairs:start -->
| # | file | find | replace | count |
|---|---|---|---|---|
| 1 | css | `rgba(231, 232, 234, .75)` | `var(--paper-soft-hi)` | 1 |
| 2 | css | `rgba(231, 232, 234, .7)` | `var(--paper-soft)` | 2 |
| 3 | css | `rgba(231, 232, 234, .55)` | `var(--paper-muted)` | 3 |
| 4 | css | `rgba(231, 232, 234, .5)` | `var(--paper-muted-lo)` | 2 |
| 5 | css | `rgba(231, 232, 234, .22)` | `var(--paper-ring)` | 1 |
| 6 | css | `rgba(231, 232, 234, .14)` | `var(--paper-ghost)` | 1 |
| 7 | css | `rgba(255, 255, 255, .35)` | `var(--pill-fill)` | 1 |
| 8 | css | `rgba(18, 19, 21, .3)` | `var(--scrim)` | 1 |
| 9 | css | `rgba(18, 19, 21, .13)` | `var(--shadow-soft)` | 1 |
| 10 | css | `rgba(18, 19, 21, 0)` | `var(--shadow-clear)` | 1 |
| 11 | css | `font-stretch: 87.5%` | `font-stretch: var(--mono-stretch)` | 9 |
| 12 | css | `font-stretch: 112%` | `font-stretch: var(--display-stretch)` | 6 |
| 13 | css | `letter-spacing: .02em` | `letter-spacing: var(--mono-tracking)` | 3 |
| 14 | css | `font-weight: 760` | `font-weight: var(--display-weight)` | 3 |
| 15 | css | `font-size: 17px` | `font-size: var(--text-l)` | 3 |
| 16 | css | `font-size: 16px` | `font-size: var(--text-m)` | 3 |
| 17 | css | `font-size: 15px` | `font-size: var(--text-s)` | 10 |
| 18 | css | `font-size: 14px` | `font-size: var(--text-xs)` | 3 |
| 19 | css | `font-size: 13px` | `font-size: var(--text-2xs)` | 5 |
| 20 | css | `font-size: 12px` | `font-size: var(--text-mono-l)` | 3 |
| 21 | css | `font-size: 11px` | `font-size: var(--text-mono-m)` | 3 |
| 22 | css | `font-size: 10.5px` | `font-size: var(--text-mono-s)` | 2 |
| 23 | css | `font-size: 10px` | `font-size: var(--text-mono-xs)` | 2 |
| 24 | css | `clamp(14px, 2vw, 28px)` | `var(--space-14-28)` | 2 |
| 25 | css | `clamp(20px, 3vw, 40px)` | `var(--space-20-40)` | 2 |
| 26 | css | `clamp(40px, 5vw, 70px)` | `var(--space-40-70)` | 3 |
| 27 | css | `clamp(40px, 6vw, 90px)` | `var(--space-40-90)` | 2 |
| 28 | css | `clamp(50px, 6vw, 90px)` | `var(--space-50-90)` | 2 |
| 29 | css | `clamp(70px, 9vw, 140px)` | `var(--space-70-140)` | 2 |
| 30 | css | `clamp(80px, 10vw, 160px)` | `var(--space-80-160)` | 2 |
| 31 | css | `max-width: 1680px` | `max-width: var(--wrap-max)` | 2 |
| 32 | css | `z-index: 100` | `z-index: var(--z-skip)` | 1 |
| 33 | css | `z-index: 40` | `z-index: var(--z-menu-btn)` | 1 |
| 34 | css | `z-index: 30` | `z-index: var(--z-menu)` | 1 |
| 35 | css | `z-index: 20` | `z-index: var(--z-top)` | 1 |
| 36 | css | `border-radius: 999px` | `border-radius: var(--radius-pill)` | 2 |
| 37 | css | `border-radius: 2px` | `border-radius: var(--radius-focus)` | 1 |
| 38 | css | `1px solid var(--line-dark)` | `var(--hairline-dark)` | 5 |
| 39 | css | `1px solid var(--line)` | `var(--hairline)` | 10 |
| 40 | css | ` .25s linear` | ` var(--dur-250) linear` | 1 |
| 41 | css | ` .3s;` | ` var(--dur-300);` | 3 |
| 42 | css | ` .4s,` | ` var(--dur-400),` | 1 |
| 43 | css | ` .4s;` | ` var(--dur-400);` | 3 |
| 44 | css | ` .45s var(` | ` var(--dur-450) var(` | 1 |
| 45 | css | ` .5s var(` | ` var(--dur-500) var(` | 7 |
| 46 | css | ` .5s;` | ` var(--dur-500);` | 1 |
| 47 | css | ` .6s var(` | ` var(--dur-600) var(` | 5 |
| 48 | css | ` .6s linear` | ` var(--dur-600) linear` | 1 |
| 49 | css | ` .7s var(` | ` var(--dur-700) var(` | 3 |
| 50 | css | ` .8s var(` | ` var(--dur-800) var(` | 1 |
| 51 | css | ` .8s linear` | ` var(--dur-800) linear` | 1 |
| 52 | css | ` .9s var(` | ` var(--dur-900) var(` | 2 |
| 53 | css | ` 1s var(` | ` var(--dur-1000) var(` | 1 |
| 54 | css | ` 1.1s var(` | ` var(--dur-1100) var(` | 3 |
| 55 | css | ` 1.2s var(` | ` var(--dur-1200) var(` | 2 |
| 56 | css | ` 1.4s var(` | ` var(--dur-1400) var(` | 1 |
| 57 | css | ` 1.6s var(` | ` var(--dur-1600) var(` | 1 |
| 58 | css | ` 2.4s var(` | ` var(--dur-2400) var(` | 1 |
| 59 | js | `'transform .25s cubic-bezier(.16,1,.3,1)'` | `'transform var(--dur-250) var(--ease)'` | 2 |
| 60 | js | `'transform .9s cubic-bezier(.34,1.56,.64,1)'` | `'transform var(--dur-900) var(--ease-back)'` | 1 |
<!-- pairs:end -->

`css` = `next/css/studio.css`, `js` = `next/js/studio.js`. Pairs 59 and 60 make the magnetic buttons' inline
`style.transition` read the same tokens; they need `tokens.css` linked (step 5).

## Left as literals on purpose

| What | Where | Why |
|---|---|---|
| Fluid heading sizes, e.g. `clamp(42px, 7vw, 120px)` | `.display`, `.marquee`, `.stat__n`, titles | One use each; the component owns its size. |
| Odd text sizes 13.5, 14.5, 15.5, 16.5, 18, 20, 21, 28, 46 px | `.stat dd`, `.row__more p`, `.project__body`, phone overrides | One or two uses; snapping them to the scale is a visible change. Owner call. |
| Near-twin dark text alphas `.5`/`.55` and `.7`/`.75` | `--paper-muted-lo`/`--paper-muted`, `--paper-soft`/`--paper-soft-hi` | Kept exact. Merging each pair is a visible change. Owner call. |
| Component sizes (`--size: 132px`, `64px` door button, `58px` menu button) | `.round`, `.door__go`, `.menu-btn` | Geometry of one component. |
| Hero layer z-index 1 to 4 and `-1` | `.hero*`, `.drift`, `.slot`, fills | Local stacking inside one section. |
| Drift float cycle `--t: 9s` to `14s` and delays | `.slot:nth-child(n)` | Per-slot data, not a scale. |
| `.01ms` and `animation: none` | reduced-motion block | Part of the kill switch pattern (motion.md). |
| `@font-face` blocks | top of `studio.css` | Paths are relative to `css/`; moving them is safe but not needed. |
| `@media (max-width: 760px)`, `(max-width: 1100px)` | media queries | `var()` does not work in media queries. Numbers are listed in `tokens.css`. |
| `<meta name="theme-color" content="#e7e8ea">` | `next/index.html` | HTML attribute; must stay a literal. It equals `--paper`: change both together. |
| `transparent`, `currentColor`, `none` | various | Keywords. |

## JS constants (not migrated; a proposal)

These numbers live in JS files and cannot be CSS tokens without a runtime read. If they need to change often, a
later step can move them into one module (for example `next/js/motion.js` exporting `MOTION = {...}`) imported by
`studio.js` and `showreel/index.js`. Until then, `docs/design/motion.md` lists every one with its file and line.

## The script

```python migrate
"""Studio tokens migration. Reads the pairs table in docs/design/studio-tokens-migration.md.

usage: python3 - [--write] [--strict] [--root DIR] [--diff]
  default   dry run: report every pair, prove the result resolves back to the old CSS, write nothing
  --write   apply: rewrite next/css/studio.css and next/js/studio.js, link css/tokens.css in next/index.html
  --strict  exit 1 if any pair count differs from the table (default: warn and replace all matches)
  --diff    print a unified diff of every file that would change
  --root    repo root (default: git top level of the current directory)
"""
import difflib, os, re, subprocess, sys

args = sys.argv[1:]
if '-h' in args or '--help' in args:
    print(__doc__); sys.exit(0)
known = {'--write', '--strict', '--diff', '--root'}
for a in args:
    if a.startswith('--') and a not in known:
        sys.exit(f'unknown option {a} (see --help)')
root = None
if '--root' in args:
    i = args.index('--root')
    if i + 1 >= len(args): sys.exit('--root needs a directory')
    root = args[i + 1]
if not root:
    try: root = subprocess.check_output(['git', 'rev-parse', '--show-toplevel'], text=True, stderr=subprocess.DEVNULL).strip()
    except Exception: root = os.getcwd()
root = os.path.abspath(root)
P = lambda *p: os.path.join(root, *p)
DOC, TOK = P('docs/design/studio-tokens-migration.md'), P('next/css/tokens.css')
FILES = {'css': P('next/css/studio.css'), 'js': P('next/js/studio.js')}
HTML = P('next/index.html')
for f in (DOC, TOK, HTML, *FILES.values()):
    if not os.path.isfile(f): sys.exit(f'missing {f} (run from the repo, or pass --root)')
read = lambda f: open(f, encoding='utf-8').read()

# ---- pairs: rows of | n | file | `find` | `replace` | count | between the markers
doc = read(DOC)
block = doc.split('<!-- pairs:start -->')[1].split('<!-- pairs:end -->')[0]
pairs = []
for line in block.splitlines():
    m = re.match(r'^\|\s*(\d+)\s*\|\s*(css|js)\s*\|\s*`([^`]*)`\s*\|\s*`([^`]*)`\s*\|\s*(\d+)\s*\|', line)
    if m: pairs.append((int(m[1]), m[2], m[3], m[4], int(m[5])))
if not pairs: sys.exit('no pairs found between the markers in ' + DOC)

# ---- tokens
def decls(text):
    out = {}
    for m in re.finditer(r'(--[\w-]+)\s*:\s*([^;]+);', re.sub(r'/\*.*?\*/', '', text, flags=re.S)):
        out[m[1]] = m[2].strip()
    return out
tok_text = read(TOK)
tokens = decls(tok_text)

def resolve(text):
    # replace var(--token) by its value (recursively) for tokens.css names only
    pat = re.compile(r'var\((--[\w-]+)\)')
    for _ in range(5):
        new = pat.sub(lambda m: tokens.get(m[1], m[0]), text)
        if new == text: break
        text = new
    return text

problems, warnings, changed = [], [], {}
src = {k: read(f) for k, f in FILES.items()}
out = dict(src)

COMMENT = '/* Tokens live in tokens.css, linked before this file. */\n\n'
# ---- 1. the :root block in studio.css moves to tokens.css
ROOT = re.compile(r':root\s*\{[^}]*\}\n*')
m = ROOT.search(out['css'])
if m:
    old_root = decls(m[0])
    missing = {k: v for k, v in old_root.items() if tokens.get(k) != v}
    if missing:
        problems.append('studio.css :root has values tokens.css lacks; add them to tokens.css first: ' + ', '.join(f'{k}: {v}' for k, v in missing.items()))
    if 'color-scheme: light' in m[0] and 'color-scheme: light' not in tok_text:
        problems.append('tokens.css lacks color-scheme: light')
    out['css'] = out['css'][:m.start()] + COMMENT + out['css'][m.end():]
    print('step 1  :root block moved to tokens.css')
else:
    print('step 1  no :root block in studio.css (already moved)')

# ---- 2. pairs
print('step 2  find/replace')
for n, kind, find, rep, want in pairs:
    got = out[kind].count(find)
    out[kind] = out[kind].replace(find, rep)
    flag = 'ok' if got == want else ('already applied?' if got == 0 else 'COUNT DIFFERS')
    if got != want:
        (problems if '--strict' in args else warnings).append(f'pair {n}: expected {want}, found {got} ({find!r})')
    print(f'  {n:>3} {kind:<3} {got:>2}/{want:<2} {flag:<16} {find.strip()}')

# ---- 3. proof: with every token resolved, the new files equal the old ones
def norm(t, kind):
    t = resolve(t)
    if kind == 'js': t = re.sub(r'\s*,\s*', ',', t)
    return t
base_css = ROOT.sub(COMMENT, src['css'], count=1)
same_css = norm(base_css, 'css') == norm(out['css'], 'css')
same_js = norm(src['js'], 'js') == norm(out['js'], 'js')
print(f'step 3  resolved back to the old values: css {"identical" if same_css else "DIFFERENT"}, js {"identical" if same_js else "DIFFERENT"}')
if not same_css or not same_js:
    problems.append('resolve-back check failed: a replacement changed a value')

# ---- 4. what literals are left (info)
left = sorted(set(re.findall(r'#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)', out['css'])))
print('step 4  color literals left in studio.css:', ', '.join(left) if left else 'none')

# ---- 5. link tokens.css before studio.css
html = read(HTML)
link = '<link rel="stylesheet" href="css/tokens.css">'
if link in html:
    new_html = html; print('step 5  next/index.html already links css/tokens.css')
else:
    anchor = '<link rel="stylesheet" href="css/studio.css">'
    if anchor not in html: problems.append('next/index.html: studio.css <link> not found')
    new_html = html.replace(anchor, link + '\n' + anchor, 1)
    print('step 5  link css/tokens.css before css/studio.css in next/index.html')

writes = {FILES['css']: (src['css'], out['css']), FILES['js']: (src['js'], out['js']), HTML: (html, new_html)}
if '--diff' in args:
    for f, (a, b) in writes.items():
        if a != b: sys.stdout.writelines(difflib.unified_diff(a.splitlines(True), b.splitlines(True), os.path.relpath(f, root), os.path.relpath(f, root) + ' (new)'))
for w in warnings: print('warn   ', w)
for p in problems: print('ERROR  ', p)
if problems: sys.exit(1)
if '--write' in args:
    for f, (a, b) in writes.items():
        if a != b:
            open(f, 'w', encoding='utf-8').write(b); print('wrote  ', os.path.relpath(f, root))
else:
    print('dry run: nothing written (add --write to apply)')
```
