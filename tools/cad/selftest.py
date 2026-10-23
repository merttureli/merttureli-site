"""Self-test: build a small Z-up STEP assembly the way SolidWorks/Fusion write them
(nested sub-assembly, one screw product placed 4 times, colors), import it, check the result.

    python3 tools/cad.py selftest          (runs in the CAD venv, writes only to a temp dir)
"""
import json
import os
import sys
import tempfile

import numpy as np
from OCP.BRepAlgoAPI import BRepAlgoAPI_Cut
from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox, BRepPrimAPI_MakeCylinder
from OCP.gp import gp_Ax2, gp_Dir, gp_Pnt, gp_Trsf, gp_Vec
from OCP.IFSelect import IFSelect_RetDone
from OCP.Quantity import Quantity_Color, Quantity_TOC_sRGB
from OCP.STEPCAFControl import STEPCAFControl_Writer
from OCP.STEPControl import STEPControl_AsIs
from OCP.TCollection import TCollection_ExtendedString
from OCP.TDataStd import TDataStd_Name
from OCP.TDocStd import TDocStd_Document
from OCP.TopLoc import TopLoc_Location
from OCP.XCAFDoc import XCAFDoc_ColorSurf, XCAFDoc_DocumentTool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import pipeline  # noqa: E402


def make_step(path):
    doc = TDocStd_Document(TCollection_ExtendedString('selftest'))
    st = XCAFDoc_DocumentTool.ShapeTool_s(doc.Main())
    ct = XCAFDoc_DocumentTool.ColorTool_s(doc.Main())

    def name(label, s):
        TDataStd_Name.Set_s(label, TCollection_ExtendedString(s))

    def at(x, y, z):
        t = gp_Trsf()
        t.SetTranslation(gp_Vec(x, y, z))
        return TopLoc_Location(t)

    # Z-up coaster-like stack, mm: 100 x 90 base 30 tall, plate on top, 4 screws into the plate
    base = BRepAlgoAPI_Cut(BRepPrimAPI_MakeBox(gp_Pnt(-50, -45, 0), 100, 90, 30).Shape(),
                           BRepPrimAPI_MakeBox(gp_Pnt(-47, -42, 3), 94, 84, 30).Shape()).Shape()
    plate = BRepPrimAPI_MakeBox(gp_Pnt(-48, -43, 30), 96, 86, 3).Shape()
    screw = BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(0, 0, 0), gp_Dir(0, 0, 1)), 1.5, 8).Shape()
    top = st.NewShape()
    name(top, 'Selftest_Asm')
    lid = st.NewShape()
    name(lid, 'Lid-Assembly')
    pb = st.AddShape(base, False)
    name(pb, '01-Base Shell')
    pp = st.AddShape(plate, False)
    name(pp, 'TopPlate')
    ps = st.AddShape(screw, False)
    name(ps, 'M3x8 Screw')
    ct.SetColor(pb, Quantity_Color(0.2, 0.4, 0.8, Quantity_TOC_sRGB), XCAFDoc_ColorSurf)
    st.AddComponent(top, pb, TopLoc_Location())
    st.AddComponent(lid, pp, TopLoc_Location())
    for x, y in ((-40, -35), (40, -35), (40, 35), (-40, 35)):
        st.AddComponent(lid, ps, at(x, y, 28))
    st.AddComponent(top, lid, at(0, 0, 0))
    st.UpdateAssemblies()
    w = STEPCAFControl_Writer()
    w.SetNameMode(True)
    w.SetColorMode(True)
    sys.stdout.flush()
    keep = os.dup(1)
    os.dup2(os.open(os.devnull, os.O_WRONLY), 1)   # OpenCascade prints transfer statistics to fd 1
    try:
        w.Transfer(doc, STEPControl_AsIs)
        ok = w.Write(path) == IFSelect_RetDone
    finally:
        os.dup2(keep, 1)
    assert ok, 'could not write the test STEP'


def run():
    tmp = tempfile.mkdtemp(prefix='cad-selftest-')
    step = os.path.join(tmp, 'selftest.step')
    make_step(step)
    cfg = {'name': 'selftest', 'up': 'z', 'origin': 'bottom', 'formats': list(pipeline.writers.FORMATS),
           'parts': [{'match': '*base shell*', 'name': 'shell', 'material': 'matteShell'},
                     {'match': 'TopPlate', 'name': 'lid', 'material': 'satinAluminum'},
                     {'match': 'm3x8 screw*', 'name': 'lid', 'sub': 'screws', 'material': 'steel'}]}
    pipeline.run_import(step, cfg, tmp)
    meta = json.load(open(os.path.join(tmp, 'selftest.json')))
    names = [p['name'] for p in meta['parts']]
    fails = []

    def check(ok, msg):
        print(('ok   ' if ok else 'FAIL ') + msg)
        if not ok:
            fails.append(msg)

    check(names == ['shell', 'lid'], f'map order and names kept: {names}')
    lid = meta['parts'][1]
    check(len(lid['cad']) == 5, f'plate + 4 screw instances merged into "lid": {lid["cad"]}')
    check([p['material']['key'] for p in lid['prims']] == ['satinAluminum', 'steel'], 'a part keeps one primitive per material')
    sp = lid['subs'].get('screws')
    check(sp is not None and abs(sp[1] - 0.032) < 1e-4 and abs(sp[0]) < 1e-6, f'"sub" makes a named child with its own pivot: {sp}')
    lo, hi = np.array(meta['bounds'])
    check(abs(lo[1]) < 1e-5 and abs(hi[1] - 0.036) < 1e-4,
          f'Z-up turned to +Y, origin "bottom" puts the base on y=0 (y {lo[1]:.4f}..{hi[1]:.4f}, screw tops at 36 mm)')
    check(abs((hi[0] - lo[0]) - 0.100) < 1e-4 and abs((hi[2] - lo[2]) - 0.090) < 1e-4, 'mm became meters (0.100 x 0.090 footprint)')
    piv = np.array(lid['pivot'])
    check(abs(piv[0]) < 1e-6 and abs(piv[2]) < 1e-6 and abs(piv[1] - 0.032) < 1e-4, f'part pivot at its bounds center: {piv}')
    glb = open(os.path.join(tmp, 'selftest.glb'), 'rb').read()
    gj = json.loads(glb[20:20 + int.from_bytes(glb[12:16], 'little')])
    check(sorted(n['name'] for n in gj['nodes']) == ['lid', 'screws', 'selftest', 'shell'], 'glb nodes carry the showreel names')
    check(meta['parts'][0]['material']['key'] == 'matteShell', 'palette material applied')
    leaves, _ = pipeline.step_reader.read_step(step)
    cols = {l.name: l.color for l in leaves}
    check(cols.get('01-Base Shell') == '#3366cc', f'STEP color read: {cols.get("01-Base Shell")}')
    scr_names = sorted(l.name for l in leaves if 'Screw' in l.name)
    check(scr_names == [f'M3x8 Screw-{i}' for i in range(1, 5)], f'unnamed repeated instances become product-N: {scr_names}')
    check([l.path for l in leaves][-1].startswith('Selftest_Asm/Lid-Assembly/'), f'paths keep the sub-assembly: {leaves[-1].path}')
    print(f'\n{"PASS" if not fails else "FAIL"}: {tmp}')
    return 1 if fails else 0


if __name__ == '__main__':
    sys.exit(run())
