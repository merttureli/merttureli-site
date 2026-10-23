"""new.py page <name>: a plain HTML page in the current site's conventions.

Styles
  site   (default) the websites.html chrome: header + phone menu, sections, dark footer, analytics
  plain  the privacy.html layout: one readable column, no chrome
Pages start noindex with flagged placeholder copy; --index drops noindex.
"""
import glob
import html
import os

from common import REPO, ScaffoldError, check_key, render, resolve_root, write_files, title_from_key

DESCRIPTION = 'plain HTML page: <name>.html in the websites.html (site) or privacy.html (plain) layout'


def ds_dir():
    hits = sorted(glob.glob(os.path.join(REPO, '_ds', '*', 'tokens', 'colors.css')))
    if not hits:
        raise ScaffoldError('could not find the design-system tokens (_ds/*/tokens/colors.css)')
    return os.path.relpath(os.path.dirname(os.path.dirname(hits[0])), REPO).replace(os.sep, '/')


def add_arguments(p):
    p.add_argument('name', help='kebab-case file name without .html, e.g. speaking')
    p.add_argument('--title', help='page title and h1 (default: from the name)')
    p.add_argument('--description', default='', help='meta description (default: a flagged placeholder)')
    p.add_argument('--style', choices=['site', 'plain'], default='site', help='layout (default: site)')
    p.add_argument('--dir', default='', help='folder under the repo, e.g. "notes" -> notes/<name>.html '
                                             '(relative links are adjusted)')
    p.add_argument('--index', action='store_true', help='indexable: no robots noindex (add it to sitemap.xml)')


def run(args):
    key = check_key(args.name)
    root = resolve_root(args.root)
    sub = args.dir.strip('/').replace('\\', '/')
    if sub:
        for part in sub.split('/'):
            check_key(part, 'folder')
        if sub.split('/')[0] in {'next', 'studies', 'projects', 'src', 'tools', 'templates', 'docs'}:
            raise ScaffoldError(f'--dir {sub}: pages there are generated or belong to another system; '
                                'see docs/recipes/new-page.md')
    rel = f'{sub}/{key}.html' if sub else f'{key}.html'
    if not sub and key in {'index', '404', 'privacy', 'websites'}:
        raise ScaffoldError(f'{rel} is an existing page')
    title = args.title or title_from_key(key)
    up = '../' * (sub.count('/') + 1) if sub else ''
    values = {
        'KEY': key,
        'TITLE': html.escape(title),
        'HEADING': html.escape(title),
        'EYEBROW': 'Eyebrow',
        'DESCRIPTION': html.escape(args.description or f'{title}. Replace this description before publishing.'),
        'ROBOTS': '' if args.index else ('  <meta name="robots" content="noindex">\n' if args.style == 'site'
                                         else '<meta name="robots" content="noindex">\n'),
        'URLPATH': rel,
        'UP': up,
        'DS': ds_dir(),
    }
    text = render(f'page/{args.style}.html.tmpl', values)
    print(f'page {rel} ({args.style}) in {root}')
    write_files(root, [(rel, text)], force=args.force, dry_run=args.dry_run)
    print(f'''
Next steps (docs/recipes/new-page.md):
  1. Replace every <mark class="flag"> placeholder with real copy and remove the mark.
     python3 check-writing.py {rel}
  2. Look at it: python3 -m http.server 8000 --bind 127.0.0.1, open http://127.0.0.1:8000/{rel} at 390 and 1440 wide.
  3. Link to it from wherever it belongs (nothing links to a new page by itself).''' + ('' if args.index else f'''
  4. When it is ready to be found: delete the robots noindex line and add
       <url><loc>https://merttureli.com/{rel}</loc><lastmod>YYYY-MM-DD</lastmod></url> to sitemap.xml''') + '''
  5. Prove nothing broke: python3 tools/check.py''')
    return 0
