#!/usr/bin/env python3
"""Scaffold new things for merttureli.com from templates/.

    python3 tools/new.py <kind> <name> [options]
    python3 tools/new.py list

Kinds
    actor     showreel project actor: next/js/showreel/<name>.js + next/lab/<name>.html
    page      plain HTML page: <name>.html in the websites.html or privacy.html layout
    section   section snippet for next/index.html, websites-style pages or src/index.html
    project   a new project's content (tools/scaffold/project.py, owned by the content system)

Common options (every kind)
    --dry-run     print what would be written, write nothing
    --force       overwrite files that already exist
    --root DIR    write into DIR instead of the repo (for a throwaway copy)

Examples
    python3 tools/new.py actor robo-catcher
    python3 tools/new.py page speaking --title "Speaking" --dry-run
    python3 tools/new.py section talks --site studio --number 07 --label Talks
    python3 tools/new.py <kind> --help

Recipes: docs/recipes/showreel-actor.md, docs/recipes/new-page.md, docs/recipes/add-project.md
"""
import argparse
import importlib.util
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SCAFFOLD = os.path.join(HERE, 'scaffold')
sys.path.insert(0, SCAFFOLD)

from common import ScaffoldError, fail  # noqa: E402

KINDS = ['actor', 'page', 'section', 'project']


def load(kind):
    """Import tools/scaffold/<kind>.py, or None if it does not exist yet."""
    path = os.path.join(SCAFFOLD, f'{kind}.py')
    if not os.path.isfile(path):
        return None
    spec = importlib.util.spec_from_file_location(f'scaffold_{kind}', path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def common_args(p):
    p.add_argument('--dry-run', action='store_true', help='print what would be written, write nothing')
    p.add_argument('--force', action='store_true', help='overwrite files that already exist')
    p.add_argument('--root', help='write into this folder instead of the repo (for a throwaway copy)')


def run_project(argv):
    """The project kind lives in tools/scaffold/project.py (content system).

    Contract (see its docstring): HELP, add_arguments(parser) and
    run(args) -> exit code; project.py adds its own --dry-run and --root.
    main(argv) is accepted as a fallback."""
    mod = load('project')
    if mod is None:
        print('error: the project scaffold is not installed yet: tools/scaffold/project.py is missing.\n'
              'It belongs to the content system (content/, docs/recipes/add-project.md). Until it lands,\n'
              'follow docs/recipes/add-project.md by hand.', file=sys.stderr)
        return 2
    if hasattr(mod, 'add_arguments') and hasattr(mod, 'run'):
        p = argparse.ArgumentParser(prog='new.py project', description=getattr(mod, 'HELP', None),
                                    epilog='See docs/recipes/add-project.md.')
        mod.add_arguments(p)  # project.py adds its own --dry-run and --root
        return mod.run(p.parse_args(argv)) or 0
    if hasattr(mod, 'main'):
        return mod.main(argv) or 0
    print('error: tools/scaffold/project.py has neither main(argv) nor add_arguments()+run(args)', file=sys.stderr)
    return 2


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    if not argv or argv[0] in ('-h', '--help', 'help'):
        print(__doc__.strip())
        return 0 if argv else 2
    kind, rest = argv[0], argv[1:]
    if kind == 'list':
        for k in KINDS:
            mod = load(k)
            desc = (getattr(mod, 'DESCRIPTION', '') or getattr(mod, 'HELP', '')) if mod else '(not installed: tools/scaffold/%s.py missing)' % k
            print(f'  {k:<9} {desc}')
        return 0
    if kind not in KINDS:
        return fail(f'unknown kind "{kind}". Kinds: {", ".join(KINDS)} (python3 tools/new.py --help)')
    try:
        if kind == 'project':
            return run_project(rest)
        mod = load(kind)
        p = argparse.ArgumentParser(prog=f'new.py {kind}', description=mod.__doc__,
                                    formatter_class=argparse.RawDescriptionHelpFormatter)
        mod.add_arguments(p)
        common_args(p)
        return mod.run(p.parse_args(rest)) or 0
    except ScaffoldError as e:
        return fail(str(e))


if __name__ == '__main__':
    try:
        sys.exit(main())
    except BrokenPipeError:  # output piped into head
        sys.exit(0)
