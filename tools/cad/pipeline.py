"""inspect / import, run inside the CAD venv by tools/cad.py."""
import hashlib
import json
import os
import sys
import time

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import naming  # noqa: E402
import step_reader  # noqa: E402
import writers  # noqa: E402

# deflection as a fraction of the assembly diagonal, angular deflection in radians
QUALITY = {'low': (0.0008, 0.6), 'medium': (0.0003, 0.4), 'high': (0.00012, 0.25)}
BUDGET_TRIS, BUDGET_PARTS = 50000, 24
PART_KEYS = ('label', 'exterior', 'referenceOnly', 'explode_mm', 'id', 'deflection', 'angle')   # showreel actor budget, see docs/design/3d.md

# source up axis -> output +Y (right-handed rotations)
UP = {
    'y': np.eye(3),
    'z': np.array([[1, 0, 0], [0, 0, 1], [0, -1, 0]], float),
    '-z': np.array([[1, 0, 0], [0, 0, -1], [0, 1, 0]], float),
    'x': np.array([[0, -1, 0], [1, 0, 0], [0, 0, 1]], float),
    '-x': np.array([[0, 1, 0], [-1, 0, 0], [0, 0, 1]], float),
    '-y': np.array([[1, 0, 0], [0, -1, 0], [0, 0, -1]], float),
}


def load_palette():
    with open(os.path.join(HERE, 'palette.json')) as fh:
        return {k: v for k, v in json.load(fh).items() if not k.startswith('_')}


def sha1(path):
    h = hashlib.sha1()
    with open(path, 'rb') as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()[:12]


def union_box(leaves):
    lo, hi = np.full(3, np.inf), np.full(3, -np.inf)
    for l in leaves:
        b = l.bbox()
        if b:
            lo, hi = np.minimum(lo, b[0]), np.maximum(hi, b[1])
    return lo, hi


def fmt_box(b):
    return ' x '.join(f'{(b[1][i] - b[0][i]):.1f}' for i in range(3))


# ------------------------------------------------------------------ inspect
def inspect(step, as_json=False, map_out=None):
    t0 = time.time()
    leaves, info = step_reader.read_step(step)
    lo, hi = union_box(leaves)
    rows = []
    for l in leaves:
        b = l.bbox()
        rows.append({'cad': l.name, 'product': l.product, 'path': l.path, 'color': l.color,
                     'size_mm': fmt_box(b) if b else '-', 'center_mm': [round((b[0][i] + b[1][i]) / 2, 2) for i in range(3)] if b else None,
                     'suggested': naming.reel_name(l.name), 'label': naming.label(l.name)})
    ext = hi - lo
    guess = 'y'
    if info['unit'] not in ('mm', 'unknown'):
        note = f'file unit is {info["unit"]}; OpenCascade converts to mm on read'
    else:
        note = ''
    summary = {'file': info['file'], 'unit': info['unit'], 'parts': len(leaves), 'size_mm': [round(float(x), 2) for x in ext],
               'bbox_mm': [[round(float(x), 2) for x in lo], [round(float(x), 2) for x in hi]], 'seconds': round(time.time() - t0, 2)}
    if as_json:
        print(json.dumps({'summary': summary, 'parts': rows}, indent=1))
    else:
        print(f'{info["file"]}: {len(leaves)} parts, unit {info["unit"]}, size {ext[0]:.1f} x {ext[1]:.1f} x {ext[2]:.1f} mm '
              f'(x y z), read in {summary["seconds"]} s')
        if note:
            print('note:', note)
        print('The longest side is ' + 'xyz'[int(np.argmax(ext))] + '. Output is +Y up: pass --up z if the model is Z-up.')
        w = max(12, *(len(r['cad']) for r in rows))
        print(f'\n  {"CAD name":<{w}}  {"suggested name":<22} {"size mm":<24} color')
        for r in rows:
            print(f'  {r["cad"]:<{w}}  {r["suggested"]:<22} {r["size_mm"]:<24} {r["color"] or "-"}')
    if map_out:
        if os.path.exists(map_out):
            raise SystemExit(f'cad: {map_out} exists; not overwriting (delete it or pick another path)')
        stem = os.path.splitext(os.path.basename(step))[0].lower()
        m = {
            '_doc': 'CAD import map. Edit names to match the actor\'s getParts() names, set materials from tools/cad/palette.json. '
                    'Re-run: python3 tools/cad.py import <step> --map <this file>. See docs/recipes/cad-import.md.',
            'name': '-'.join(t for t in __import__('re').split(r'[^a-z0-9]+', stem) if t) or 'model',
            'out': 'next/assets/3d/', 'formats': ['cadmesh'], 'up': guess, 'origin': 'center', 'quality': 'medium',
            'explode': 1.0, 'unmatched': 'keep',
            'parts': [{'match': r['cad'], 'name': r['suggested'], 'label': r['label'], 'material': 'default'} for r in rows],
        }
        with open(map_out, 'w') as fh:
            json.dump(m, fh, indent=2)
            fh.write('\n')
        print(f'\nwrote starter map {map_out}')


# ------------------------------------------------------------------ import
def resolve_material(rule, leaf_color, palette):
    if rule and rule.get('material'):
        key = rule['material']
        if key not in palette:
            raise SystemExit(f'cad: unknown material "{key}"; pick one of: {", ".join(palette)} (tools/cad/palette.json)')
        m = dict(palette[key], key=key)
    elif leaf_color:
        m = dict(palette['default'], key=None, color=leaf_color)
    else:
        m = dict(palette['default'], key='default')
    if rule and rule.get('color'):
        m['color'] = rule['color']
    m.pop('from', None)
    return {'key': m['key'], 'color': m['color'], 'roughness': m['roughness'], 'metalness': m['metalness']}


def build(step, cfg):
    """cfg: dict with map keys plus formats. Returns (model, report rows)."""
    palette = load_palette()
    leaves, info = step_reader.read_step(step)
    rules = cfg.get('parts', [])
    lo, hi = union_box(leaves)
    diag = float(np.linalg.norm(hi - lo)) or 1.0
    q = cfg.get('quality', 'medium')
    if q not in QUALITY:
        raise SystemExit(f'cad: quality must be one of {", ".join(QUALITY)}')
    k, ang = QUALITY[q]
    defl = float(cfg.get('deflection') or max(0.005, diag * k))
    ang = float(cfg.get('angle') or ang)
    R = UP.get(cfg.get('up', 'y'))
    if R is None:
        raise SystemExit(f'cad: --up must be one of {", ".join(UP)}')
    need_edges = 'explorer' in cfg['formats']
    want_n = cfg.get('normals', True)

    groups, skipped, unmatched = {}, [], []
    for leaf in leaves:
        ri = next((i for i, r in enumerate(rules) if naming.match(r, leaf)), None)
        rule = rules[ri] if ri is not None else None
        if rule is None:
            unmatched.append(leaf.name)
            if cfg.get('unmatched', 'keep') == 'skip':
                continue
        if rule and rule.get('skip'):
            skipped.append(leaf.name)
            continue
        name = (rule or {}).get('name') or naming.reel_name(leaf.name)
        if name not in groups:
            # part-level keys come from every rule with this name, in map order (first one that sets a key wins)
            same = [r for r in rules if r.get('name') == name] or ([rule] if rule else [])
            first = {}
            for r in same:
                for k in PART_KEYS:
                    if k in r and k not in first:
                        first[k] = r[k]
            ri = min((i for i, r in enumerate(rules) if r.get('name') == name), default=ri)
            groups[name] = {'rule': first, 'ri': ri if ri is not None else len(rules) + leaf.index, 'items': []}
        groups[name]['items'].append((leaf, rule))
    if not groups:
        raise SystemExit('cad: every part was skipped; check "skip" rules and "unmatched"')
    names = sorted(groups, key=lambda n: (groups[n]['ri'], groups[n]['items'][0][0].index))
    if cfg.get('order'):   # build order (getParts order) when it differs from rule priority
        missing = [n for n in cfg['order'] if n not in groups]
        if missing:
            print(f'warning: "order" names with no CAD part: {", ".join(missing)}', file=sys.stderr)
        names = [n for n in cfg['order'] if n in groups] + [n for n in names if n not in cfg['order']]

    # A part holds primitives keyed by (sub, material): several CAD parts can share one showreel
    # name, keep their own materials, and form named sub-objects (a rotor that spins, an LED).
    parts = []
    for name in names:
        g = groups[name]
        first = g['rule'] or {}
        prims, Es = {}, []
        for leaf, rule in g['items']:
            rule = rule or {}
            d = float(rule.get('deflection') or first.get('deflection') or defl)
            a = float(rule.get('angle') or first.get('angle') or ang)
            V, N, I = step_reader.tessellate(leaf.shape, d, a, want_n)
            if not len(V):
                print(f'warning: {leaf.name} has no faces to mesh; left out', file=sys.stderr)
                continue
            mat = resolve_material(rule, leaf.color, palette)
            key = (rule.get('sub'), mat['key'], mat['color'], mat['roughness'], mat['metalness'])
            pr = prims.setdefault(key, {'sub': rule.get('sub'), 'material': mat, 'V': [], 'N': [], 'I': [], 'n': 0})
            pr['V'].append(V @ R.T)
            if want_n and N is not None:
                pr['N'].append((N @ R.T).astype(np.float32))
            pr['I'].append(I + pr['n'])
            pr['n'] += len(V)
            if need_edges:
                Es.append(step_reader.edges(leaf.shape, d, a).reshape(-1, 3) @ R.T)
        if not prims:
            continue
        plist = []
        for pr in prims.values():
            plist.append({'sub': pr['sub'], 'material': pr['material'], 'V': np.concatenate(pr['V']),
                          'N': np.concatenate(pr['N']) if want_n and pr['N'] else None, 'I': np.concatenate(pr['I'])})
        leaf0 = g['items'][0][0]
        parts.append({
            'name': name, 'label': first.get('label') or naming.label(leaf0.product or leaf0.name),
            'cad': [l.name for l, _ in g['items']], 'prims': plist, 'material': plist[0]['material'],
            'exterior': bool(first.get('exterior', False)), 'referenceOnly': bool(first.get('referenceOnly', False)),
            'E': np.concatenate(Es).reshape(-1, 2, 3) if need_edges and Es else None,
            'explode_mm': first.get('explode_mm'), 'id': first.get('id'),
        })
    if not parts:
        raise SystemExit('cad: nothing to mesh')
    ids = [p['id'] for p in parts if p['id'] is not None]
    if len(ids) != len(set(ids)):
        raise SystemExit('cad: duplicate "id" values in the map')

    # origin (mm, output axes)
    allv = np.concatenate([pr['V'] for p in parts for pr in p['prims']])
    lo, hi = allv.min(0), allv.max(0)
    c = (lo + hi) / 2
    origin = cfg.get('origin', 'center')
    shift = {'keep': np.zeros(3), 'center': -c, 'bottom': np.array([-c[0], -lo[1], -c[2]]),
             'top': np.array([-c[0], -hi[1], -c[2]])}.get(origin)
    if shift is None:
        raise SystemExit('cad: --origin must be keep, center, bottom or top')
    asm_c = (c + shift) / 1000
    xs = float(cfg.get('explode', 1.0))
    for p in parts:
        for pr in p['prims']:
            pr['V'] = (pr['V'] + shift) / 1000
        p['V'], p['N'], p['I'] = merge(p['prims'])
        b0, b1 = p['V'].min(0), p['V'].max(0)
        p['bounds_mm'] = (b0 * 1000, b1 * 1000)
        p['pivot'] = (b0 + b1) / 2
        p['subs'] = {}
        for pr in p['prims']:
            if pr['sub']:
                sv = np.concatenate([q['V'] for q in p['prims'] if q['sub'] == pr['sub']])
                p['subs'][pr['sub']] = (sv.min(0) + sv.max(0)) / 2
        if p['E'] is not None:
            p['E'] = (p['E'] + shift) / 1000
        em = p.pop('explode_mm')
        p['explode'] = np.array(em, float) / 1000 if em else (p['pivot'] - asm_c) * xs
    model = {'name': cfg['name'], 'parts': parts,
             'source': {'file': info['file'], 'unit': info['unit'], 'sha1': sha1(step), 'up': cfg.get('up', 'y'),
                        'origin': origin, 'quality': q, 'deflection_mm': round(defl, 4), 'angle_rad': round(ang, 3)}}
    return model, {'skipped': skipped, 'unmatched': unmatched, 'deflection': defl, 'angle': ang}


def merge(prims):
    Vs, Ns, Is, n = [], [], [], 0
    for pr in prims:
        Vs.append(pr['V'])
        Ns.append(pr['N'])
        Is.append(pr['I'] + n)
        n += len(pr['V'])
    N = np.concatenate(Ns) if all(x is not None for x in Ns) else None
    return np.concatenate(Vs), N, np.concatenate(Is)


def run_import(step, cfg, out, dry_run=False):
    t0 = time.time()
    model, rep = build(step, cfg)
    tris = sum(len(p['I']) for p in model['parts'])
    w = max(10, *(len(p['name']) for p in model['parts']))
    print(f'{os.path.basename(step)} -> {model["name"]}: {len(model["parts"])} parts, {tris} triangles '
          f'(deflection {rep["deflection"]:.3f} mm, angle {rep["angle"]:.2f} rad, up {cfg.get("up", "y")}, '
          f'origin {cfg.get("origin", "center")}) in {time.time() - t0:.1f} s')
    print(f'\n  {"name":<{w}}  {"tris":>7}  {"material":<15} cad')
    for p in model['parts']:
        mats = '+'.join(dict.fromkeys(pr['material']['key'] or pr['material']['color'] for pr in p['prims']))
        subs = (' (subs: ' + ', '.join(p['subs']) + ')') if p['subs'] else ''
        print(f'  {p["name"]:<{w}}  {len(p["I"]):>7}  {mats:<15} {", ".join(p["cad"])}{subs}')
    if rep['skipped']:
        print('\nskipped by a rule:', ', '.join(rep['skipped']))
    if cfg.get('parts') and rep['unmatched']:
        print('\nnot in the map (kept with auto names):' if cfg.get('unmatched', 'keep') == 'keep' else '\nnot in the map (skipped):',
              ', '.join(rep['unmatched']))
    if 'cadmesh' in cfg['formats'] and (tris > BUDGET_TRIS or len(model['parts']) > BUDGET_PARTS):
        heavy = sorted(model['parts'], key=lambda p: -len(p['I']))[:3]
        print(f'\nover the showreel budget ({BUDGET_TRIS} triangles, {BUDGET_PARTS} parts): use --quality low, merge parts in the map, '
              'skip hidden ones, or give heavy parts a coarser "deflection"/"angle" rule (docs/design/3d.md). Heaviest: '
              + ', '.join(f'{p["name"]} {len(p["I"])}' for p in heavy))
    files = writers.outputs(model, cfg['formats'], cfg.get('files'))
    if dry_run:
        print(f'\ndry run: would write to {out}:', ', '.join(files))
        return
    os.makedirs(out, exist_ok=True)
    st = writers.stems(model, cfg.get('files'))
    for f in cfg['formats']:
        writers.WRITERS[f](model, out, st[f])
    print(f'\nwrote {out}')
    for f in files:
        print(f'  {f:<32} {os.path.getsize(os.path.join(out, f)) / 1024:8.1f} KB')
