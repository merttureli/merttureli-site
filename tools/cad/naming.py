"""CAD part name -> showreel part name (camelCase) and label, and map-file rules.

Stdlib only, so `cad.py` can use it outside the CAD venv.
"""
import fnmatch
import re

PREFIX = re.compile(r'^\s*\d+\s*[-_.\s]\s*')   # '07-fin-1' -> 'fin-1'


def tokens(cad_name):
    s = PREFIX.sub('', cad_name) or cad_name
    out = []
    for chunk in re.split(r'[^A-Za-z0-9]+', s):
        if not chunk:
            continue
        if chunk.isupper() or chunk.islower() or chunk.isdigit():
            out.append(chunk)
        else:
            out += [t for t in re.split(r'(?<=[a-z0-9])(?=[A-Z])', chunk) if t]
    return out or ['part']


def reel_name(cad_name):
    """'07-fin-1' -> 'fin1', 'BodyTube_Upper' -> 'bodyTubeUpper', 'MAIN BODY' -> 'mainBody'."""
    t = [x.lower() for x in tokens(cad_name)]
    name = t[0] + ''.join(x[:1].upper() + x[1:] for x in t[1:])
    return name if name[:1].isalpha() else 'part' + name[:1].upper() + name[1:]


def label(cad_name):
    """'07-fin-1' -> 'Fin 1', 'bodytube-upper' -> 'Bodytube upper'."""
    t = tokens(cad_name)
    words = [x if (x.isupper() and len(x) > 1 and len(t) > 1) else x.lower() for x in t]
    s = ' '.join(words)
    return s[:1].upper() + s[1:]


VALID = re.compile(r'^[a-z][A-Za-z0-9]*$')


def match(rule, leaf):
    pats = rule.get('match', [])
    pats = [pats] if isinstance(pats, str) else pats
    keys = [leaf.name, leaf.product or '', leaf.path]
    return any(fnmatch.fnmatchcase(k.lower(), p.lower()) for p in pats for k in keys)


RULE_KEYS = {'match', 'name', 'label', 'material', 'color', 'exterior', 'referenceOnly', 'explode_mm', 'skip',
             'deflection', 'angle', 'note', 'id', 'sub'}
MAP_KEYS = {'_doc', 'name', 'source', 'out', 'formats', 'files', 'up', 'origin', 'quality', 'deflection', 'angle',
            'explode', 'unmatched', 'normals', 'parts', 'order'}


def check_map(m, where):
    errs = []
    for k in m:
        if k not in MAP_KEYS:
            errs.append(f'{where}: unknown key "{k}" (known: {", ".join(sorted(MAP_KEYS))})')
    for i, r in enumerate(m.get('parts', [])):
        for k in r:
            if k not in RULE_KEYS:
                errs.append(f'{where}: parts[{i}] unknown key "{k}" (known: {", ".join(sorted(RULE_KEYS))})')
        if 'match' not in r:
            errs.append(f'{where}: parts[{i}] needs "match" (a CAD name or glob like "*screw*")')
        if 'sub' in r and not VALID.match(r['sub']):
            errs.append(f'{where}: parts[{i}] sub "{r["sub"]}" must be camelCase like "rotor"')
        if 'name' in r and not VALID.match(r['name']):
            errs.append(f'{where}: parts[{i}] name "{r["name"]}" must be camelCase like "topPlate"')
    return errs
