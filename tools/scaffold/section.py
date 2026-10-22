"""new.py section <name>: a section snippet to paste into a page.

Sites
  studio (default) next/index.html: .rule label + .display heading + data-reveal body, plus a CSS stub
  page   pages on the websites.html chrome: .section-head + .proof-list
  home   src/index.html (the current home page SOURCE): design-system Rule + DisplayHeading
Prints the snippet; --out writes it to a file instead. Never edits a page.
"""
import os

from common import ScaffoldError, check_key, render, resolve_root, write_files

DESCRIPTION = 'section snippet for next/index.html (studio), websites-style pages (page) or src/index.html (home)'


def add_arguments(p):
    p.add_argument('name', help='kebab-case id and class, e.g. talks')
    p.add_argument('--site', choices=['studio', 'page', 'home'], default='studio', help='where it goes (default: studio)')
    p.add_argument('--number', default='07', help='section number shown in the label, e.g. 07')
    p.add_argument('--label', help='section label, e.g. "Talks" (default: from the name)')
    p.add_argument('--out', help='write the snippet(s) to this file (relative to --root) instead of printing')


def run(args):
    key = check_key(args.name)
    if not args.number.isdigit():
        raise ScaffoldError('--number must be digits, e.g. 07')
    label = args.label or key.replace('-', ' ').capitalize()
    if '"' in label or '<' in label:
        raise ScaffoldError('--label cannot contain quotes or <')
    values = {'KEY': key, 'NUM': args.number, 'LABEL': label, 'LABEL_UPPER': label.upper(),
              'DASHES': '-' * max(4, 66 - len(label) - len(args.number))}
    parts = [render(f'section/{args.site}.html.tmpl', values)]
    if args.site == 'studio':
        parts.append(render('section/studio.css.tmpl', values))
    if args.out:
        root = resolve_root(args.root)
        rel = os.path.relpath(os.path.abspath(os.path.join(root, args.out)), root)
        if rel.startswith('..'):
            raise ScaffoldError('--out must stay inside the root folder')
        print(f'section {key} ({args.site})')
        write_files(root, [(rel, '\n'.join(parts))], force=args.force, dry_run=args.dry_run)
    else:
        for i, part in enumerate(parts):
            if i:
                print('\n' + '-' * 72 + '\n')
            print(part.rstrip('\n'))
    where = {'studio': 'next/index.html (and the CSS into next/css/studio.css)',
             'page': 'the page\'s <main>', 'home': 'src/index.html, then python3 tools/build.py'}[args.site]
    print(f'\n# Paste into {where}. Replace each <mark class="flag"> placeholder, then python3 tools/check.py',
          file=__import__('sys').stderr)
    return 0
