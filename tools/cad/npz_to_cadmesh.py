#!/usr/bin/env python3
"""Render mesh (.npz) -> cadmesh, for models that arrive as a triangle mesh instead of a STEP file.

  CAD_VENV=<scratchpad>/cadvenv
  $CAD_VENV/bin/python tools/cad/npz_to_cadmesh.py --map tools/cad/maps/robo-catcher.npz.json --npz SRC.npz [--out DIR]

The npz holds `names` (one per part) and arrays V{i} (n,3 float, CAD units) and F{i} (m,3 int), the
layout the owner's turntable scripts use (catcher_mesh.npz). The map groups the source parts into
showreel parts by motion (one part per thing that moves on its own, a "sub" per axle inside a part)
and by material (one mesh per material in a part), decimates each source part to a triangle target,
turns wire grids (nets, mesh panels) into line segments, and writes the cadmesh format that
tools/cad/cadmesh.js loads (via writers.write_cadmesh, so the loader needs no change).

Needs numpy and fast-simplification in the venv (pip install fast-simplification).

Map keys (see tools/cad/maps/robo-catcher.npz.json):
  name, out, unit_mm (CAD unit in mm), origin ("bottom": footprint center on the ground), weld_mm,
  crease_deg (normals split above this angle), materials {key: {color, roughness, metalness}},
  skip [names], parts [rule], lines [rule], order [part names]
  meta.source.shift_mm is what was added to CAD mm before dividing by 1000: model = (cad + shift) / 1000.
Part rule: name, label, match (name glob or list) and/or ids (source indices), material, sub,
  tris (target triangles per source part; omit to keep), drop_inner (leave out closed pieces boxed inside
  another piece: bearing balls, set screws), explode_mm, pivot_mm (replaces the
  bounds-center pivot, CAD coordinates), sub_pivot_mm.
Line rule: name, part, match/ids, material, gap_mm (strip clustering gap). A grid of thin strips in
  one plane becomes one segment per strip center line; written to meta.lines[name].
"""
import argparse
import fnmatch
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
import writers  # noqa: E402


def match(rule, i, name):
    if 'ids' in rule and i in rule['ids']:
        return True
    pats = rule.get('match')
    if pats is None:
        return False
    pats = [pats] if isinstance(pats, str) else pats
    return any(fnmatch.fnmatch(name.lower(), p.lower()) for p in pats)


def weld(V, F, tol):
    q = np.round(V / tol).astype(np.int64)
    _, first, inv = np.unique(q, axis=0, return_index=True, return_inverse=True)
    inv = inv.reshape(-1)
    F2 = inv[F]
    keep = (F2[:, 0] != F2[:, 1]) & (F2[:, 1] != F2[:, 2]) & (F2[:, 0] != F2[:, 2])
    return V[first], F2[keep]


def components(F, n):
    """Connected component id per face (union-find over shared vertices)."""
    p = np.arange(n)

    def find(x):
        while p[x] != x:
            p[x] = p[p[x]]
            x = p[x]
        return x
    for a, b, c in F:
        ra = find(a)
        p[find(b)] = ra
        p[find(c)] = ra
    root = np.array([find(i) for i in range(n)])
    return root[F[:, 0]]


def drop_inner(V, F, tol=0.05):
    """Leave out closed pieces whose bounds sit inside another piece's bounds (bearing balls and races,
    set screws): nobody sees them and they stop the decimator."""
    fc = components(F, len(V))
    ids = np.unique(fc)
    if len(ids) < 2:
        return V, F
    box = {}
    for c in ids:
        vv = V[np.unique(F[fc == c])]
        box[c] = (vv.min(0), vv.max(0))
    keep = []
    for c in ids:
        lo, hi = box[c]
        inside = any(o != c and np.all(lo >= box[o][0] - tol) and np.all(hi <= box[o][1] + tol)
                     and np.prod(box[o][1] - box[o][0]) > np.prod(hi - lo) for o in ids)
        if not inside:
            keep.append(c)
    return V, F[np.isin(fc, keep)]


def cluster(V, F, target):
    """Vertex clustering: snap to a grid sized so the face count lands near target (always converges)."""
    lo = V.min(0)
    size = float((V.max(0) - lo).max())
    best = (V, F)
    a, b = size / 400, size / 4
    for _ in range(18):
        s = (a * b) ** .5
        q = np.floor((V - lo) / s).astype(np.int64)
        _, inv = np.unique(q, axis=0, return_inverse=True)
        inv = inv.reshape(-1)
        cnt = np.bincount(inv)
        Vc = np.zeros((inv.max() + 1, 3))
        np.add.at(Vc, inv, V)
        Vc /= cnt[:, None]
        F2 = inv[F]
        F2 = F2[(F2[:, 0] != F2[:, 1]) & (F2[:, 1] != F2[:, 2]) & (F2[:, 0] != F2[:, 2])]
        F2 = F2[np.sort(np.unique(np.sort(F2, axis=1), axis=0, return_index=True)[1])]
        if len(F2) > target:
            a = s
        else:
            b = s
            best = (Vc, F2)
        if abs(len(F2) - target) < target * .08:
            break
    return best


def decimate(V, F, target, inner=False):
    if inner:
        V, F = drop_inner(V, F)
    if target is None or len(F) <= target:
        return V, F
    import fast_simplification
    V2, F2 = V.astype(np.float32), F.astype(np.int32)
    for _ in range(3):   # quadric decimation, a few passes
        if len(F2) <= target * 1.1:
            break
        V2, F2 = fast_simplification.simplify(V2, F2, target_reduction=1 - target / len(F2), agg=7)
    if len(F2) > target * 1.5:   # stuck (open or non-manifold surfaces): fall back to clustering
        V2, F2 = cluster(V, F, target)
    if len(F2) < 4:
        return V, F
    return np.asarray(V2, np.float64), np.asarray(F2, np.int64)


def crease_normals(V, F, deg):
    """Per-corner normals averaged over adjacent faces within `deg` degrees; returns unindexed-then-reindexed
    (V, N, I) with vertices split along creases, so CAD edges stay crisp."""
    a, b, c = V[F[:, 0]], V[F[:, 1]], V[F[:, 2]]
    fn = np.cross(b - a, c - a)
    area = np.linalg.norm(fn, axis=1, keepdims=True)
    fu = fn / np.maximum(area, 1e-20)
    cos = np.cos(np.radians(deg))
    nv = len(V)
    # vertex -> incident faces (CSR)
    corner_v = F.reshape(-1)
    corner_f = np.repeat(np.arange(len(F)), 3)
    order = np.argsort(corner_v, kind='stable')
    cv, cf = corner_v[order], corner_f[order]
    starts = np.searchsorted(cv, np.arange(nv + 1))
    N = np.zeros((len(F) * 3, 3))
    for v in range(nv):
        fs = cf[starts[v]:starts[v + 1]]
        if not len(fs):
            continue
        u = fu[fs]
        w = fn[fs]                        # area weighted
        d = u @ u.T                       # (k,k)
        s = (d >= cos).astype(float) @ w  # per incident face: sum of the faces within the crease angle
        s /= np.maximum(np.linalg.norm(s, axis=1, keepdims=True), 1e-20)
        # write to the corners of v in those faces
        for j, f in enumerate(fs):
            k = np.nonzero(F[f] == v)[0]
            for kk in k:
                N[f * 3 + kk] = s[j]
    P = V[F.reshape(-1)]
    key = np.concatenate([np.round(P / 1e-4), np.round(N * 60)], axis=1).astype(np.int64)
    _, first, inv = np.unique(key, axis=0, return_index=True, return_inverse=True)
    return P[first], N[first].astype(np.float32), inv.reshape(-1, 3).astype(np.int64)


def grid_lines(V, gap):
    """A flat grid of thin strips -> segments (k,2,3) along each strip center line."""
    span = V.max(0) - V.min(0)
    flat = int(np.argmin(span))
    ax = [i for i in range(3) if i != flat]
    lo, hi = V.min(0), V.max(0)
    plane = (lo[flat] + hi[flat]) / 2
    segs = []
    for k, along in ((ax[0], ax[1]), (ax[1], ax[0])):
        u = np.unique(np.round(V[:, k], 2))
        clusters, cur = [], [u[0]]
        for x in u[1:]:
            if x - cur[-1] > gap:
                clusters.append(cur)
                cur = [x]
            else:
                cur.append(x)
        clusters.append(cur)
        for cl in clusters:
            c = (cl[0] + cl[-1]) / 2
            p0, p1 = np.zeros(3), np.zeros(3)
            p0[flat] = p1[flat] = plane
            p0[k] = p1[k] = c
            p0[along], p1[along] = lo[along], hi[along]
            segs.append([p0, p1])
    return np.array(segs)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--map', required=True)
    ap.add_argument('--npz', required=True)
    ap.add_argument('--out')
    ap.add_argument('--dry-run', action='store_true')
    a = ap.parse_args()
    cfg = json.load(open(a.map))
    d = np.load(a.npz)
    names = [str(x) for x in d['names']]
    unit = float(cfg.get('unit_mm', 1.0))
    mats = cfg['materials']
    skip = set(cfg.get('skip', []))

    # bounds of everything kept, CAD units
    allv = np.concatenate([d[f'V{i}'] for i, n in enumerate(names) if n not in skip]).astype(np.float64) * unit
    lo, hi = allv.min(0), allv.max(0)
    c = (lo + hi) / 2
    shift = np.array([-c[0], -lo[1], -c[2]]) if cfg.get('origin', 'bottom') == 'bottom' else -c

    used = {}
    groups = {}          # part name -> {rule, prims{(sub, mat): [V, N, I lists]}, cad[], src_tris, tris}
    order = []
    lines = {}
    report = []
    for i, n in enumerate(names):
        if n in skip:
            continue
        V0 = d[f'V{i}'].astype(np.float64) * unit
        F0 = d[f'F{i}'].astype(np.int64)
        lr = next((r for r in cfg.get('lines', []) if match(r, i, n)), None)
        if lr:
            segs = grid_lines(V0, lr.get('gap_mm', 10))
            L = lines.setdefault(lr['name'], {'part': lr['part'], 'material': lr['material'], 'cad': [], 'segs': []})
            L['cad'].append(n)
            L['segs'].append(segs)
            used[i] = lr['name']
            report.append((i, n, len(F0), 0, f"lines:{lr['name']} ({len(segs)} segments)"))
            continue
        rule = next((r for r in cfg['parts'] if match(r, i, n)), None)
        if rule is None:
            raise SystemExit(f'npz: part {i} "{n}" matches no rule (add it to parts, lines or skip)')
        V, F = weld(V0, F0, cfg.get('weld_mm', 0.01))
        V, F = decimate(V, F, rule.get('tris'), rule.get('drop_inner', False))
        Vn, N, I = crease_normals(V, F, cfg.get('crease_deg', 34))
        g = groups.get(rule['name'])
        if g is None:
            g = groups[rule['name']] = {'rule': rule, 'prims': {}, 'cad': []}
            order.append(rule['name'])
        sub = rule.get('sub')
        key = (sub, rule['material'])
        pr = g['prims'].setdefault(key, {'V': [], 'N': [], 'I': [], 'n': 0})
        pr['V'].append((Vn + shift) / 1000)
        pr['N'].append(N)
        pr['I'].append(I + pr['n'])
        pr['n'] += len(Vn)
        g['cad'].append(n)
        if sub and rule.get('sub_pivot_mm'):
            g.setdefault('subpiv', {})[sub] = (np.array(rule['sub_pivot_mm'], float) * unit + shift) / 1000
        used[i] = rule['name']
        report.append((i, n, len(F0), len(I), f"{rule['name']}{'/' + sub if sub else ''} {rule['material']}"))

    if cfg.get('order'):
        order = [x for x in cfg['order'] if x in groups] + [x for x in order if x not in cfg['order']]
    parts = []
    for name in order:
        g = groups[name]
        r = g['rule']
        plist = []
        for (sub, mk), pr in g['prims'].items():
            m = mats[mk]
            plist.append({'sub': sub, 'material': {'key': cfg.get('key_prefix', '') + mk,
                                                     'color': m['color'], 'roughness': m['roughness'], 'metalness': m['metalness']},
                          'V': np.concatenate(pr['V']), 'N': np.concatenate(pr['N']), 'I': np.concatenate(pr['I'])})
        V = np.concatenate([p['V'] for p in plist])
        b0, b1 = V.min(0), V.max(0)
        pivot = (b0 + b1) / 2
        if r.get('pivot_mm'):
            pivot = (np.array(r['pivot_mm'], float) * unit + shift) / 1000
        subs = {}
        for p in plist:
            if p['sub'] and p['sub'] not in subs:
                sv = np.concatenate([q['V'] for q in plist if q['sub'] == p['sub']])
                subs[p['sub']] = g.get('subpiv', {}).get(p['sub'], (sv.min(0) + sv.max(0)) / 2)
        em = r.get('explode_mm') or [0, 0, 0]
        parts.append({'name': name, 'label': r.get('label', name), 'cad': g['cad'], 'material': plist[0]['material'],
                      'exterior': False, 'referenceOnly': False, 'V': V, 'prims': plist, 'pivot': pivot,
                      'explode': np.array(em, float) / 1000, 'subs': subs})

    tris = sum(len(p['I']) for P in parts for p in P['prims'])
    draws = sum(len(P['prims']) for P in parts) + len(lines)
    print(f'{"id":>3} {"source part":<58} {"src":>6} {"out":>5}  -> part / material')
    for i, n, s, o, t in report:
        print(f'{i:>3} {n[:58]:<58} {s:>6} {o:>5}  {t}')
    print(f'\n{len(parts)} parts, {len(lines)} line sets, {tris} triangles, {draws} draw calls (meshes + line sets)')
    for P in parts:
        t = sum(len(p['I']) for p in P['prims'])
        print(f'  {P["name"]:<16} {t:>6} tris  {len(P["prims"])} meshes  pivot {np.round(P["pivot"], 4).tolist()}  subs {list(P["subs"])}')
    if a.dry_run:
        return
    out = a.out or os.path.join(ROOT, cfg['out'])
    os.makedirs(out, exist_ok=True)
    model = {'name': cfg['name'], 'parts': parts,
             'source': {'file': os.path.basename(a.npz), 'unit': 'mm', 'up': 'y', 'origin': cfg.get('origin', 'bottom'),
                        'generator': 'tools/cad/npz_to_cadmesh.py', 'map': os.path.relpath(os.path.abspath(a.map), ROOT),
                        'shift_mm': [round(float(x), 4) for x in shift]}}
    meta = writers.write_cadmesh(model, out, cfg['name'])
    # line sets: plain float arrays (meters, model space) in the json; cadmesh.js ignores them
    meta['lines'] = {}
    for k, L in lines.items():
        S = (np.concatenate(L['segs']).reshape(-1, 3) + shift) / 1000
        m = mats[L['material']]
        meta['lines'][k] = {'part': L['part'], 'cad': L['cad'], 'color': m['color'], 'count': len(S) // 2,
                            'positions': [round(float(x), 5) for x in S.reshape(-1)]}
    meta['draws'] = draws
    path = os.path.join(out, cfg['name'] + '.json')
    with open(path + '.tmp', 'w') as fh:
        fh.write(json.dumps(meta, indent=1) + '\n')
    os.replace(path + '.tmp', path)
    print(f'wrote {path} and .bin ({meta["bytes"]} bytes)')


if __name__ == '__main__':
    main()
