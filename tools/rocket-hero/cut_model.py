#!/usr/bin/env python3
"""Cut the hero rocket model from the explorer's own geometry.

    python3 -I tools/rocket-hero/cut_model.py

Reads assets/charger-explorer/assembly.json/.bin and writes
assets/rocket/charger-live.json/.bin: the parts you can see from outside
(nose, tubes, fins, rail buttons, and the tail ends of the motor mount and
screw cap), with the same triangles the explorer draws, so the hero rocket and
the explorer shade identically at the handoff. Positions are Int16 on a fine
grid in the explorer's units (metres), indices Uint16.
"""
import json, os
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, 'assets', 'charger-explorer')
OUT = os.path.join(ROOT, 'assets', 'rocket')
meta = json.load(open(os.path.join(SRC, 'assembly.json')))
raw = open(os.path.join(SRC, 'assembly.bin'), 'rb').read()

KEEP = {0, 1, 2, 6, 7, 8, 9, 10, 11}   # whole parts
TAIL = {18: .0025, 19: .0025}           # tail end only, vertex-clustered (cell, m)
TAIL_Y = -.566                           # the tube ends at -.5707; keep what shows below it


def cluster(v, idx, cell):
    key = np.floor(v / cell).astype(np.int64)
    _, inv, cnt = np.unique(key, axis=0, return_inverse=True, return_counts=True)
    inv = inv.ravel()
    nv = np.zeros((cnt.size, 3))
    np.add.at(nv, inv, v)
    nv /= cnt[:, None]
    t = inv[idx.reshape(-1, 3)]
    ok = (t[:, 0] != t[:, 1]) & (t[:, 1] != t[:, 2]) & (t[:, 0] != t[:, 2])
    t = t[ok]
    _, first = np.unique(np.sort(t, axis=1), axis=0, return_index=True)
    t = t[np.sort(first)]
    used = np.unique(t)
    remap = -np.ones(cnt.size, int)
    remap[used] = np.arange(used.size)
    return nv[used], remap[t].ravel()


allv, parts_in = [], []
for p in meta['parts']:
    m = p.get('mesh')
    if not m or (p['id'] not in KEEP and p['id'] not in TAIL):
        continue
    v = np.frombuffer(raw, np.float32, m['vertexCount'], m['vertexOffset']).reshape(-1, 3).astype(np.float64)
    idx = np.frombuffer(raw, np.uint32, m['indexCount'], m['indexOffset']).astype(np.int64)
    if p['id'] in TAIL:
        tri = idx.reshape(-1, 3)
        idx = tri[v[tri][:, :, 1].min(axis=1) < TAIL_Y].ravel()
        v, idx = cluster(v, idx, TAIL[p['id']])
    parts_in.append((p, v, idx))
    allv.append(v)

allv = np.concatenate(allv)
center = (allv.min(0) + allv.max(0)) / 2
step = float(np.abs(allv - center).max() / 32000)
buf = bytearray()
parts = []


def put(a):
    global buf
    while len(buf) % 4:
        buf += b'\0'
    o = len(buf)
    buf += a.tobytes()
    return o


for p, v, idx in parts_in:
    assert len(v) < 65536
    q = np.round((v - center) / step).astype(np.int16)
    parts.append(dict(id=p['id'], label=p['label'], verts=[put(q), len(q)], index=[put(idx.astype(np.uint16)), len(idx)]))
    print(p['id'], p['label'], len(q), 'verts', len(idx) // 3, 'tris')
os.makedirs(OUT, exist_ok=True)
open(os.path.join(OUT, 'charger-live.bin'), 'wb').write(buf)
json.dump(dict(units='m', center=[round(c, 7) for c in center], step=step, bytes=len(buf), parts=parts),
          open(os.path.join(OUT, 'charger-live.json'), 'w'), separators=(',', ':'))
print(len(buf) // 1024, 'KB', 'step', step)
