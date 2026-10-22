"""new.py actor <name>: a showreel project actor + its lab page.

Writes
  next/js/showreel/<name>.js   model (placeholder parts) + accent + reel actor
  next/lab/<name>.html         plays the actor like the hero does, checks the interface
and prints the registration checklist. With --register it also adds the one
registerProject(...) line to next/js/showreel/index.js, just above the marker
comment there (an actor that already exists on disk is kept, only registered).
"""
import os
import argparse
import html
import re

from common import ScaffoldError, check_key, render, resolve_root, write_files, read_repo_file, title_from_key

DESCRIPTION = 'showreel project actor: next/js/showreel/<name>.js + next/lab/<name>.html'
RESERVED = {'engine', 'index', 'coaster', 'props', 'fx'}  # existing showreel modules


def drift_words(root):
    """[(word, slot class, x, y)] from the .drift markup of next/index.html."""
    src = read_repo_file(root, 'next/index.html')
    out = []
    for m in re.finditer(r'<span class="slot ([^"]*)" style="([^"]*)">(.*?)</span>', src, re.S):
        classes, style, inner = m.groups()
        size = next((c for c in classes.split() if c.startswith('s-')), 's-l')
        x = re.search(r'--x:\s*([\d.]+%)', style)
        y = re.search(r'--y:\s*([\d.]+%)', style)
        for i in re.findall(r'<i>(.*?)</i>', inner, re.S):
            word = html.unescape(re.sub(r'<sup>.*?</sup>', '', i)).strip()
            out.append((word, size, x.group(1) if x else '60%', y.group(1) if y else '40%'))
    return out


def norm(s):
    return re.sub(r'[\s_-]+', ' ', s.strip().lower())


def registered_keys(root):
    src = read_repo_file(root, 'next/js/showreel/index.js')
    return set(re.findall(r"registerProject\(\{\s*key:\s*'([^']+)'", src))


MARKER = '// More guests: `python3 tools/new.py actor'


def add_registration(root, line, dry_run):
    """Insert `line` just above the marker comment in next/js/showreel/index.js."""
    path = os.path.join(root, 'next', 'js', 'showreel', 'index.js')
    src = read_repo_file(root, 'next/js/showreel/index.js')
    at = src.find(MARKER)
    if at < 0:
        raise ScaffoldError('no "More guests" marker in next/js/showreel/index.js: paste the line from step 4 '
                            'under the last registerProject(...) call by hand')
    print(f'  {"would register" if dry_run else "register":<16} next/js/showreel/index.js')
    if not dry_run:
        with open(path, 'w', encoding='utf-8', newline='\n') as f:
            f.write(src[:at] + line + '\n' + src[at:])


def add_arguments(p):
    p.add_argument('name', help='kebab-case key, e.g. robo-catcher (file names and registerProject key)')
    p.add_argument('--register', action='store_true',
                   help='also register it in next/js/showreel/index.js (it joins the hero rotation). '
                        'Run it again once the actor is ready: existing files are kept')
    p.add_argument('--word', help='drift word that represents it in the hero (default: the drift word in '
                                  'next/index.html that matches the name, e.g. "Robo-Catcher")')


def run(args):
    key = check_key(args.name)
    if key in RESERVED:
        raise ScaffoldError(f'"{key}" is an existing showreel module name, pick another')
    root = resolve_root(args.root)
    if getattr(args, 'register', False) and key in registered_keys(root):
        print(f'"{key}" is already registered in next/js/showreel/index.js: nothing to do')
        return 0
    if key in registered_keys(root) and not args.force:
        raise ScaffoldError(f'"{key}" is already registered in next/js/showreel/index.js (use --force to scaffold anyway)')

    words = drift_words(root)
    match = None
    if args.word:
        match = next((w for w in words if w[0] == args.word), None)
        word = args.word
    else:
        match = next((w for w in words if norm(w[0]) == norm(key)), None)
        word = match[0] if match else '-'.join(p.capitalize() for p in key.split('-'))
    if '\'' in word or '\\' in word:
        raise ScaffoldError('the word cannot contain quotes or backslashes')
    slot = match or (word, 's-l', '60%', '40%')

    values = {
        'KEY': key,
        'WORD': word,
        'WORD_HTML': html.escape(word),
        'PREFIX': key.upper().replace('-', '_'),
        'SLOT_CLASS': slot[1],
        'SLOT_X': slot[2],
        'SLOT_Y': slot[3],
    }
    files = [
        (f'next/js/showreel/{key}.js', render('actor/actor.js.tmpl', values)),
        (f'next/lab/{key}.html', render('actor/lab.html.tmpl', values)),
    ]
    print(f'actor {key} (word "{word}") in {root}')
    register = getattr(args, 'register', False)
    if register:
        if not match and not args.force:
            raise ScaffoldError(f'"{word}" is not a .drift word in next/index.html: add it there first, '
                                'pass --word, or --force')
        kept = [f for f in files if os.path.exists(os.path.join(root, f[0]))]
        for rel, _ in kept:
            print(f'  {"keep":<16} {rel}  (exists; only registering)')
        files = [f for f in files if f not in kept]
    if files:
        write_files(root, files, force=args.force, dry_run=args.dry_run)
    line = (f"registerProject({{ key: '{key}', word: '{word}', "
            f"actor: ctx => import('./{key}.js').then(m => m.createActor(ctx)) }});")
    if register:
        add_registration(root, line, args.dry_run)

    word_line = (f'found in next/index.html (slot {slot[1]} at {slot[2]}, {slot[3]})' if match else
                 'NOT in next/index.html: add <i>' + html.escape(word) + '</i> to a .drift slot, or pass --word')
    print(f'''
Next steps (docs/recipes/showreel-actor.md):
  1. Preview: python3 -m http.server 8000 --bind 127.0.0.1, open http://127.0.0.1:8000/next/lab/{key}.html
     Every line in the panel must read "ok". #t=6.5 seeks, #fast plays 3x, #q=low checks low quality.
  2. Make it real in next/js/showreel/{key}.js: PARTS (or the CAD import, docs/design/3d.md),
     ACCENT, SEQUENCE timings, the motion in sample(). Keep the lab green while you go.
  3. Drift word "{word}": {word_line}.
  4. Register{" (done)" if register else ""}: python3 tools/new.py actor {key} --register
     adds this line to next/js/showreel/index.js, above the "More guests" comment:
       {line}
     Projects take turns, one per reel: open /next/#reel-fast and press c after each reel to reach it.
  5. Prove nothing broke: python3 tools/check.py''')
    return 0
