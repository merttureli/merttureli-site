#!/usr/bin/env python3
"""Explorer layout (assets/charger-explorer/assembly.json/.bin) -> cadmesh, for the in-place CHARGER explorer.

  CAD_VENV=<scratchpad>/cadvenv
  $CAD_VENV/bin/python tools/cad/explorer_to_cadmesh.py --map tools/cad/maps/charger-explorer.json [--out DIR] [--dry-run]

The explorer layout is Float32 positions in metres (bounds in mm) and Uint32 indices per part (tools/cad/writers.write_explorer).
This welds each part, decimates the heavy ones to the map's `tris`, splits normals along creases and writes the
cadmesh format that next/js/cad/cadmesh.js loads (via writers.write_cadmesh, Int16 positions, Int8 normals,
Uint16 indices), adding each part's explorer `id` so part-stories.js still finds its text.

Parts listed in the map's `shared.ids` are left out on purpose: the explorer takes them from the hero rocket file
(`shared.file`, same tessellation), so the page never downloads the exterior twice and the rocket looks exactly
like the hero. Needs numpy and fast-simplification (the CAD venv has both).
"""
import argparse
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
import writers  # noqa: E402
from npz_to_cadmesh import weld, decimate, crease_normals  # noqa: E402


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--map', required=True)
    ap.add_argument('--out')
    ap.add_argument('--dry-run', action='store_true')
    a = ap.parse_args()
    cfg = json.load(open(a.map))
    src = os.path.join(ROOT, cfg['source'])
    meta = json.load(open(src))
    buf = open(os.path.splitext(src)[0] + '.bin', 'rb').read()
    if len(buf) != meta['bytes']:
        raise SystemExit(f'explorer: {src} says {meta["bytes"]} bytes, the .bin has {len(buf)}')
    palette = json.load(open(os.path.join(HERE, 'palette.json')))
    by_id = {p['id']: p for p in meta['parts']}
    shared = set(cfg.get('shared', {}).get('ids', []))
    skip = set(cfg.get('skip', []))
    rules = {r['id']: r for r in cfg['parts']}
    for p in meta['parts']:
        if p['id'] not in shared and p['id'] not in skip and p['id'] not in rules:
            raise SystemExit(f'explorer: part {p["id"]} "{p["label"]}" has no rule (add it to parts, shared or skip)')

    parts, empty, report = [], [], []
    for r in cfg['parts']:
        p = by_id[r['id']]
        m = palette[r['material']]
        mat = {'key': r['material'], 'color': m['color'], 'roughness': m['roughness'], 'metalness': m['metalness']}
        b0, b1 = np.array(p['bounds'][0], float) / 1000, np.array(p['bounds'][1], float) / 1000
        if not p.get('mesh'):
            empty.append({'id': r['id'], 'name': r['name'], 'label': r['label'], 'cad': [p['label']], 'material': mat,
                          'exterior': p['exterior'], 'referenceOnly': p['referenceOnly'], 'pivot': writers._r((b0 + b1) / 2),
                          'explode': [0, 0, 0], 'triangles': 0, 'subs': {}, 'prims': []})
            report.append((r['id'], r['name'], 0, 0))
            continue
        mm = p['mesh']
        # positions are metres in the .bin (bounds in the .json are mm); work in mm like the other importers
        V0 = np.frombuffer(buf, np.float32, mm['vertexCount'], mm['vertexOffset']).reshape(-1, 3).astype(np.float64) * 1000
        F0 = np.frombuffer(buf, np.uint32, mm['indexCount'], mm['indexOffset']).reshape(-1, 3).astype(np.int64)
        V, F = weld(V0, F0, cfg.get('weld_mm', 0.002))
        V, F = decimate(V, F, r.get('tris'))
        Vn, N, I = crease_normals(V, F, cfg.get('crease_deg', 34))
        Vm = Vn / 1000
        lo, hi = Vm.min(0), Vm.max(0)
        parts.append({'id': r['id'], 'name': r['name'], 'label': r['label'], 'cad': [p['label']], 'material': mat,
                      'exterior': p['exterior'], 'referenceOnly': p['referenceOnly'], 'V': Vm,
                      'prims': [{'sub': None, 'material': mat, 'V': Vm, 'N': N, 'I': I}],
                      'pivot': (lo + hi) / 2, 'explode': np.zeros(3), 'subs': {}})
        report.append((r['id'], r['name'], len(F0), len(I)))

    print(f'{"id":>3} {"part":<22} {"src tris":>8} {"out tris":>8}')
    for i, n, s, o in report:
        print(f'{i:>3} {n:<22} {s:>8} {o:>8}')
    tris = sum(len(p['I']) for P in parts for p in P['prims'])
    print(f'\n{len(parts)} meshes + {len(empty)} empty, {tris} triangles; shared from {cfg["shared"]["file"]}: {sorted(shared)}')
    if a.dry_run:
        return
    out = a.out or os.path.join(ROOT, cfg['out'])
    os.makedirs(out, exist_ok=True)
    model = {'name': cfg['name'], 'parts': parts,
             'source': {'file': cfg['source'], 'unit': 'mm', 'up': 'y', 'origin': 'keep',
                        'generator': 'tools/cad/explorer_to_cadmesh.py', 'map': os.path.relpath(os.path.abspath(a.map), ROOT)}}
    meta_out = writers.write_cadmesh(model, out, cfg['name'])
    for P, J in zip(parts, meta_out['parts']):
        J['id'] = P['id']
    meta_out['parts'].extend(empty)
    meta_out['shared'] = cfg['shared']
    path = os.path.join(out, cfg['name'] + '.json')
    with open(path + '.tmp', 'w') as fh:
        fh.write(json.dumps(meta_out, indent=1) + '\n')
    os.replace(path + '.tmp', path)
    print(f'wrote {path} and .bin ({meta_out["bytes"]} bytes)')


if __name__ == '__main__':
    main()
