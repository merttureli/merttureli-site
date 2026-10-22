"""Write an imported CAD model to the formats the site loads.

A model is a dict: {name, source, parts: [part]} where each part has
  name, label, cad [CAD names], material {key, color, roughness, metalness},
  exterior, referenceOnly, V (n,3) float meters, N (n,3) float32 or None,
  I (m,3) int, E (k,2,3) meters or None, pivot (3,), explode (3,), bounds_mm.
All coordinates are output axes: meters, +Y up.

Formats (file names are <stem>.<ext>, stem from the map's "files" or defaults):
  cadmesh   <name>.json + <name>.bin   Studio/showreel actors via tools/cad/cadmesh.js (Int16 positions,
                                       Int8 normals, Uint16/32 indices). Default.
  glb       <name>.glb                 standard glTF 2.0, one node per part named by its showreel name.
  explorer  <name>-assembly.json/.bin  the CHARGER explorer layout (assets/charger-explorer/app.js).
  hero      <name>-hero.json/.bin      the hero rocket layout (next/js/hero3d.js loadModel).
"""
import json
import os
import struct

import numpy as np

FORMATS = ('cadmesh', 'glb', 'explorer', 'hero')
DEFAULT_STEM = {'cadmesh': '{name}', 'glb': '{name}', 'explorer': '{name}-assembly', 'hero': '{name}-hero'}


def stems(model, files):
    out = {}
    for f in FORMATS:
        out[f] = (files or {}).get(f, DEFAULT_STEM[f]).format(name=model['name'])
    return out


def outputs(model, formats, files):
    s = stems(model, files)
    ext = {'cadmesh': ['.json', '.bin'], 'glb': ['.glb'], 'explorer': ['.json', '.bin'], 'hero': ['.json', '.bin']}
    return [s[f] + e for f in formats for e in ext[f]]


class Buf:
    def __init__(self):
        self.b = bytearray()

    def put(self, arr, align=4):
        while len(self.b) % align:
            self.b += b'\0'
        off = len(self.b)
        self.b += np.ascontiguousarray(arr).tobytes()
        return off


def _r(v, n=6):
    return [round(float(x), n) for x in v]


def _id(p, i):
    return p['id'] if p.get('id') is not None else i


def _all_v(model):
    return np.concatenate([p['V'] for p in model['parts']]) if model['parts'] else np.zeros((1, 3))


def _write(path, data, mode='wb'):
    tmp = path + '.tmp'
    with open(tmp, mode) as fh:
        fh.write(data)
    os.replace(tmp, path)


def write_cadmesh(model, out, stem):
    allv = _all_v(model)
    lo, hi = allv.min(0), allv.max(0)
    center = (lo + hi) / 2
    scale = float(np.abs(allv - center).max()) or 1.0
    buf, parts, tris = Buf(), [], 0
    for p in model['parts']:
        prims = []
        for pr in p['prims']:
            q = np.round((pr['V'] - center) / scale * 32767).astype(np.int16)
            pos = buf.put(q)
            nrm = None
            if pr['N'] is not None:
                nrm = buf.put(np.round(np.clip(pr['N'], -1, 1) * 127).astype(np.int8))
            big = len(q) > 65535
            t = len(pr['I'])
            idx = buf.put(pr['I'].astype(np.uint32 if big else np.uint16))
            prims.append({'sub': pr['sub'], 'material': pr['material'], 'triangles': t,
                          'pos': [pos, len(q)], 'nrm': nrm, 'idx': [idx, t * 3, 32 if big else 16]})
        t = sum(x['triangles'] for x in prims)
        tris += t
        parts.append({
            'name': p['name'], 'label': p['label'], 'cad': p['cad'], 'material': p['material'],
            'exterior': p['exterior'], 'referenceOnly': p['referenceOnly'],
            'pivot': _r(p['pivot']), 'explode': _r(p['explode']), 'triangles': t,
            'subs': {k: _r(v) for k, v in p['subs'].items()}, 'prims': prims,
        })
    meta = {
        'format': 'cadmesh', 'version': 1, 'name': model['name'], 'bin': stem + '.bin',
        'units': 'm', 'up': '+y', 'generator': 'tools/cad.py', 'source': model['source'],
        'center': _r(center), 'scale': round(scale, 7), 'bounds': [_r(lo), _r(hi)],
        'triangles': tris, 'bytes': len(buf.b), 'parts': parts,
    }
    _write(os.path.join(out, stem + '.bin'), bytes(buf.b))
    _write(os.path.join(out, stem + '.json'), json.dumps(meta, indent=1) + '\n', 'w')
    return meta


def write_explorer(model, out, stem):
    buf, parts = Buf(), []
    for i, p in enumerate(model['parts']):
        e = p['E'] if p['E'] is not None else np.zeros((0, 2, 3))
        w = e.reshape(-1, 3).astype(np.float32)
        woff = buf.put(w)
        v = p['V'].astype(np.float32)
        voff = buf.put(v)
        ioff = buf.put(p['I'].astype(np.uint32))
        parts.append({
            'id': _id(p, i), 'label': p['label'], 'name': p['name'],
            'bounds': [_r(p['bounds_mm'][0], 3), _r(p['bounds_mm'][1], 3)],
            'exterior': p['exterior'], 'referenceOnly': p['referenceOnly'],
            'wire': {'offset': woff, 'count': int(w.size)},
            'mesh': {'vertexOffset': voff, 'vertexCount': int(v.size), 'indexOffset': ioff, 'indexCount': int(p['I'].size)},
        })
    meta = {'bytes': len(buf.b), 'parts': parts}
    _write(os.path.join(out, stem + '.bin'), bytes(buf.b))
    _write(os.path.join(out, stem + '.json'), json.dumps(meta, indent=2) + '\n', 'w')
    return meta


def write_hero(model, out, stem):
    for p in model['parts']:
        if len(p['V']) > 65535:
            raise SystemExit(f'cad: hero format needs < 65536 vertices per part; "{p["name"]}" has {len(p["V"])}. '
                             'Use a coarser --quality or the cadmesh format.')
    allv = _all_v(model)
    center = (allv.min(0) + allv.max(0)) / 2
    scale = float(np.abs(allv - center).max()) or 1.0
    qs, ix, parts, voff, ioff = [], [], [], 0, 0
    for i, p in enumerate(model['parts']):
        q = np.round((p['V'] - center) / scale * 32767).astype(np.int16).ravel()
        qs.append(q)
        ix.append(p['I'].astype(np.uint16).ravel())
        parts.append({'id': _id(p, i), 'label': p['label'], 'name': p['name'], 'vOff': voff, 'vCount': int(q.size),
                      'iOff': ioff, 'iCount': int(p['I'].size)})
        voff += q.size
        ioff += p['I'].size
    pos = np.concatenate(qs).tobytes() if qs else b''
    pad = (-len(pos)) % 4
    meta = {'center': _r(center), 'scale': round(scale, 7), 'parts': parts, 'indexByteOffset': len(pos) + pad}
    _write(os.path.join(out, stem + '.bin'), pos + b'\0' * pad + (np.concatenate(ix).tobytes() if ix else b''))
    _write(os.path.join(out, stem + '.json'), json.dumps(meta) + '\n', 'w')
    return meta


def _lin(c):
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def write_glb(model, out, stem):
    buf, views, acc, meshes, nodes, mats, matix = Buf(), [], [], [], [], [], {}

    def view(arr, target):
        off = buf.put(arr)
        views.append({'buffer': 0, 'byteOffset': off, 'byteLength': arr.nbytes, 'target': target})
        return len(views) - 1

    def material(m):
        key = (m['color'], m['roughness'], m['metalness'])
        if key not in matix:
            rgb = [_lin(int(m['color'][i:i + 2], 16)) for i in (1, 3, 5)]
            mats.append({'name': m.get('key') or m['color'], 'doubleSided': True,
                         'pbrMetallicRoughness': {'baseColorFactor': [round(x, 5) for x in rgb] + [1],
                                                  'metallicFactor': m['metalness'], 'roughnessFactor': m['roughness']}})
            matix[key] = len(mats) - 1
        return matix[key]

    def primitive(pr, origin):
        v = (pr['V'] - origin).astype(np.float32)
        attrs = {}
        acc.append({'bufferView': view(v, 34962), 'componentType': 5126, 'count': len(v), 'type': 'VEC3',
                    'min': v.min(0).tolist(), 'max': v.max(0).tolist()})
        attrs['POSITION'] = len(acc) - 1
        if pr['N'] is not None:
            n = pr['N'].astype(np.float32)
            n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-9)
            acc.append({'bufferView': view(n, 34962), 'componentType': 5126, 'count': len(n), 'type': 'VEC3'})
            attrs['NORMAL'] = len(acc) - 1
        big = len(v) > 65535
        ind = pr['I'].astype(np.uint32 if big else np.uint16).ravel()
        acc.append({'bufferView': view(ind, 34963), 'componentType': 5125 if big else 5123, 'count': int(ind.size), 'type': 'SCALAR'})
        return {'attributes': attrs, 'indices': len(acc) - 1, 'material': material(pr['material']), 'mode': 4}

    top = []
    for p in model['parts']:
        own = [pr for pr in p['prims'] if not pr['sub']]
        node = {'name': p['name'], 'translation': _r(p['pivot']),
                'extras': {'label': p['label'], 'cad': p['cad'], 'exterior': p['exterior'],
                           'referenceOnly': p['referenceOnly'], 'explode': _r(p['explode'])}}
        if own:
            meshes.append({'name': p['name'], 'primitives': [primitive(pr, p['pivot']) for pr in own]})
            node['mesh'] = len(meshes) - 1
        kids = []
        for sub, piv in p['subs'].items():
            meshes.append({'name': sub, 'primitives': [primitive(pr, piv) for pr in p['prims'] if pr['sub'] == sub]})
            nodes.append({'name': sub, 'mesh': len(meshes) - 1, 'translation': _r(piv - p['pivot'])})
            kids.append(len(nodes) - 1)
        if kids:
            node['children'] = kids
        nodes.append(node)
        top.append(len(nodes) - 1)
    root = {'name': model['name'], 'children': top, 'extras': {'source': model['source'], 'units': 'm'}}
    nodes.append(root)
    while len(buf.b) % 4:
        buf.b += b'\0'
    gltf = {'asset': {'version': '2.0', 'generator': 'merttureli-site tools/cad.py'}, 'scene': 0,
            'scenes': [{'nodes': [len(nodes) - 1]}], 'nodes': nodes, 'meshes': meshes, 'materials': mats,
            'accessors': acc, 'bufferViews': views, 'buffers': [{'byteLength': len(buf.b)}]}
    js = json.dumps(gltf, separators=(',', ':')).encode()
    js += b' ' * ((-len(js)) % 4)
    total = 12 + 8 + len(js) + 8 + len(buf.b)
    data = struct.pack('<III', 0x46546C67, 2, total) + struct.pack('<II', len(js), 0x4E4F534A) + js + \
        struct.pack('<II', len(buf.b), 0x004E4942) + bytes(buf.b)
    _write(os.path.join(out, stem + '.glb'), data)
    return gltf


WRITERS = {'cadmesh': write_cadmesh, 'glb': write_glb, 'explorer': write_explorer, 'hero': write_hero}
