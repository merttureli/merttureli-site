"""Shared helpers for tools/new.py scaffolds (stdlib only).

Every scaffold renders a template from templates/ by replacing {{NAME}}
placeholders, then writes the result under a root folder (the repo by
default, or --root DIR for a throwaway copy). Writes are refused when the
target exists unless --force, and --dry-run prints the plan without writing.
"""
import os
import re
import sys

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TEMPLATES = os.path.join(REPO, 'templates')

KEY_RE = re.compile(r'^[a-z][a-z0-9]*(-[a-z0-9]+)*$')


class ScaffoldError(Exception):
    """A user-facing error: printed without a traceback, exit code 2."""


def check_key(name, what='name'):
    """Names are lowercase kebab-case: robo-catcher, rudder-pedals, about."""
    if not KEY_RE.match(name or ''):
        raise ScaffoldError(
            f'{what} "{name}" must be lowercase kebab-case, for example robo-catcher '
            '(letters, digits and single hyphens, starting with a letter)')
    return name


def camel(key):
    """robo-catcher -> RoboCatcher."""
    return ''.join(p[:1].upper() + p[1:] for p in key.split('-'))


def title_from_key(key):
    """robo-catcher -> Robo catcher (sentence case, used as a fallback title)."""
    words = key.split('-')
    return ' '.join([words[0].capitalize()] + words[1:])


def render(template_rel, values):
    """Fill templates/<template_rel>. Every {{KEY}} must have a value."""
    path = os.path.join(TEMPLATES, template_rel)
    if not os.path.isfile(path):
        raise ScaffoldError(f'missing template {os.path.relpath(path, REPO)}')
    with open(path, encoding='utf-8') as f:
        text = f.read()
    for k, v in values.items():
        text = text.replace('{{' + k + '}}', str(v))
    left = sorted(set(re.findall(r'\{\{([A-Z0-9_]+)\}\}', text)))
    if left:
        raise ScaffoldError(f'template {template_rel} has unfilled placeholders: {", ".join(left)}')
    return text


def resolve_root(root):
    root = os.path.abspath(root or REPO)
    if not os.path.isdir(root):
        raise ScaffoldError(f'--root {root} is not a folder')
    return root


def write_files(root, files, force=False, dry_run=False):
    """files: list of (relative path, text). Checks every target first, so
    a refusal never leaves half a scaffold behind."""
    plan = []
    for rel, text in files:
        dest = os.path.join(root, rel)
        exists = os.path.exists(dest)
        if exists:
            with open(dest, encoding='utf-8') as f:
                same = f.read() == text
            if same:
                plan.append((rel, 'unchanged', dest, text))
                continue
        if exists and not force:
            raise ScaffoldError(f'{rel} already exists (use --force to overwrite, or pick another name)')
        plan.append((rel, 'overwrite' if exists else 'create', dest, text))
    for rel, action, dest, text in plan:
        lines = text.count('\n')
        print(f'  {"would " + action if dry_run else action:<16} {rel}  ({lines} lines)')
        if dry_run or action == 'unchanged':
            continue
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        with open(dest, 'w', encoding='utf-8', newline='\n') as f:
            f.write(text)
    return plan


def read_repo_file(root, rel):
    """Read a file from --root if present there, else from the repo."""
    for base in (root, REPO):
        p = os.path.join(base, rel)
        if os.path.isfile(p):
            with open(p, encoding='utf-8') as f:
                return f.read()
    return ''


def fail(msg):
    print(f'error: {msg}', file=sys.stderr)
    return 2
