"""Read a STEP assembly with OCP (OpenCascade) and tessellate its leaf parts.

Runs inside the CAD venv (see `python3 tools/cad.py setup`). Pure data out:
read_step() returns the flattened leaf parts with names, paths, colors and
world placement; tessellate() returns numpy arrays in millimeters, source axes.
"""
import os
import re
from collections import Counter

import numpy as np
from OCP.BRep import BRep_Tool
from OCP.BRepAdaptor import BRepAdaptor_Curve
from OCP.BRepBndLib import BRepBndLib
from OCP.BRepLib import BRepLib_ToolTriangulatedShape
from OCP.BRepMesh import BRepMesh_IncrementalMesh
from OCP.Bnd import Bnd_Box
from OCP.GCPnts import GCPnts_TangentialDeflection
from OCP.IFSelect import IFSelect_RetDone
from OCP.Interface import Interface_Static
from OCP.Quantity import Quantity_Color, Quantity_TOC_sRGB
from OCP.STEPCAFControl import STEPCAFControl_Reader
from OCP.TCollection import TCollection_ExtendedString
from OCP.TDF import TDF_Label, TDF_LabelSequence
from OCP.TDataStd import TDataStd_Name
from OCP.TDocStd import TDocStd_Document
from OCP.TopAbs import TopAbs_EDGE, TopAbs_FACE, TopAbs_REVERSED
from OCP.TopExp import TopExp, TopExp_Explorer
from OCP.TopLoc import TopLoc_Location
from OCP.TopTools import TopTools_IndexedMapOfShape
from OCP.TopoDS import TopoDS
from OCP.XCAFDoc import XCAFDoc_ColorGen, XCAFDoc_ColorSurf, XCAFDoc_ColorTool, XCAFDoc_DocumentTool


class Leaf:
    """One placed part instance (a leaf of the assembly tree)."""

    def __init__(self, name, product, path, shape, color, index):
        self.name = name          # instance-aware CAD name (unique within the file)
        self.product = product    # STEP PRODUCT name
        self.path = path          # 'Root/Sub/Part' using instance names
        self.shape = shape        # TopoDS_Shape placed in world (source) coordinates
        self.color = color        # '#rrggbb' from the STEP file, or None
        self.index = index        # order in the file

    def bbox(self):
        return bbox(self.shape)


def bbox(shape):
    b = Bnd_Box()
    BRepBndLib.Add_s(shape, b, True)
    if b.IsVoid():
        return None
    x0, y0, z0, x1, y1, z1 = b.Get()
    return [x0, y0, z0], [x1, y1, z1]


def file_length_unit(path):
    """Best-effort length unit named in the STEP header ('mm', 'm', 'inch', ...)."""
    try:
        with open(path, 'r', errors='ignore') as fh:
            text = fh.read(4_000_000)
    except OSError:
        return 'unknown'
    m = re.search(r"CONVERSION_BASED_UNIT\s*\(\s*'([^']+)'", text)
    if m and re.search(r'LENGTH_UNIT', text):
        return m.group(1).lower()
    for line in re.findall(r'LENGTH_UNIT\s*\(\s*\)[^;]*;', text) + re.findall(r'SI_UNIT\s*\([^;]*METRE[^;]*;', text):
        if '.MILLI.' in line:
            return 'mm'
        if '.CENTI.' in line:
            return 'cm'
        if 'METRE' in line:
            return 'm'
    return 'unknown'


# instance names CAD tools write when the user never named the instance
AUTO_NAME = re.compile(r'^(=>\[[0-9:]+\]|NAUO\d*|SOLID\d*|)$')


def _name(label):
    attr = TDataStd_Name()
    if label.FindAttribute(TDataStd_Name.GetID_s(), attr):
        return attr.Get().ToExtString().strip()
    return ''


def _hex(col):
    # OpenCascade keeps colors linear; STEP files and CAD UIs use sRGB
    r, g, b = col.Values(Quantity_TOC_sRGB)
    return '#%02x%02x%02x' % tuple(max(0, min(255, round(v * 255))) for v in (r, g, b))


def read_step(path):
    """Return (leaves, info). Shapes are in millimeters, source axes."""
    if not os.path.isfile(path):
        raise SystemExit(f'cad: no such STEP file: {path}')
    Interface_Static.SetCVal_s('xstep.cascade.unit', 'MM')
    doc = TDocStd_Document(TCollection_ExtendedString('cad'))
    reader = STEPCAFControl_Reader()
    reader.SetNameMode(True)
    reader.SetColorMode(True)
    reader.SetLayerMode(False)
    if reader.ReadFile(path) != IFSelect_RetDone:
        raise SystemExit(f'cad: OpenCascade could not read {path} (not a STEP file, or damaged)')
    if not reader.Transfer(doc):
        raise SystemExit(f'cad: OpenCascade read {path} but could not transfer its shapes')
    st = XCAFDoc_DocumentTool.ShapeTool_s(doc.Main())
    ct = XCAFDoc_DocumentTool.ColorTool_s(doc.Main())

    def color_of(*labels_or_shapes):
        col = Quantity_Color()
        for x in labels_or_shapes:
            get = XCAFDoc_ColorTool.GetColor_s if isinstance(x, TDF_Label) else ct.GetColor
            for kind in (XCAFDoc_ColorSurf, XCAFDoc_ColorGen):
                if get(x, kind, col):
                    return _hex(col)
        return None

    def face_color(shape):
        counts = Counter()
        exp = TopExp_Explorer(shape, TopAbs_FACE)
        n = 0
        while exp.More() and n < 400:
            c = color_of(exp.Current())
            if c:
                counts[c] += 1
            exp.Next()
            n += 1
        return counts.most_common(1)[0][0] if counts else None

    raw = []  # (instance name, product name, path list, shape, color)

    def walk(label, loc, path, inherited):
        ref = label
        if st.IsReference_s(label):
            ref = TDF_Label()
            st.GetReferredShape_s(label, ref)
            loc = loc.Multiplied(st.GetLocation_s(label))
        inst, prod = _name(label), _name(ref)
        if AUTO_NAME.match(inst):
            inst = ''
        here = inst or prod or 'part'
        col = color_of(label, ref) or inherited
        if st.IsAssembly_s(ref):
            kids = TDF_LabelSequence()
            st.GetComponents_s(ref, kids)
            for i in range(1, kids.Length() + 1):
                walk(kids.Value(i), loc, path + [here], col)
            return
        shape = st.GetShape_s(ref)
        if shape.IsNull():
            return
        placed = shape.Moved(loc)
        raw.append((inst, prod, path + [here], placed, col or color_of(shape) or face_color(shape)))

    roots = TDF_LabelSequence()
    st.GetFreeShapes(roots)
    stem = os.path.splitext(os.path.basename(path))[0]
    for i in range(1, roots.Length() + 1):
        walk(roots.Value(i), TopLoc_Location(), [], None)
    if not raw:
        raise SystemExit(f'cad: {path} has no shapes')

    # Unique, instance-aware names: the product name when it is used once,
    # else the instance name when those differ, else product-2, product-3 ...
    by_prod = Counter(p or i for i, p, *_ in raw)
    seen = Counter()
    leaves = []
    for k, (inst, prod, pth, shape, col) in enumerate(raw):
        base = prod or inst or stem
        if by_prod[base] > 1:
            seen[base] += 1
            name = inst if inst and inst != prod else f'{base}-{seen[base]}'
        else:
            name = base
        if len(raw) == 1 and not (prod or inst):
            name = stem
        leaves.append(Leaf(name, prod, '/'.join(pth[:-1] + [name]), shape, col, k))
    # names must be unique even when instance names repeat
    dup = Counter(l.name for l in leaves)
    seen.clear()
    for l in leaves:
        if dup[l.name] > 1:
            seen[l.name] += 1
            l.name = f'{l.name}-{seen[l.name]}'
            l.path = l.path.rsplit('/', 1)[0] + '/' + l.name if '/' in l.path else l.name
    info = {'file': os.path.basename(path), 'unit': file_length_unit(path), 'roots': roots.Length(), 'leaves': len(leaves)}
    return leaves, info


def tessellate(shape, deflection, angle, want_normals=True):
    """Mesh one placed shape. Returns (V float64 Nx3 mm, N float32 Nx3 or None, I int64 Mx3).

    Vertices are kept per BRep face, so face borders stay crisp and smooth
    faces get analytic normals."""
    BRepMesh_IncrementalMesh(shape, deflection, False, angle, True)
    verts, norms, tris = [], [], []
    base = 0
    exp = TopExp_Explorer(shape, TopAbs_FACE)
    while exp.More():
        face = TopoDS.Face_s(exp.Current())
        exp.Next()
        loc = TopLoc_Location()
        tri = BRep_Tool.Triangulation_s(face, loc)
        if tri is None:
            continue
        n = tri.NbNodes()
        if n == 0:
            continue
        trsf = loc.Transformation()
        rev = face.Orientation() == TopAbs_REVERSED
        pts = np.empty((n, 3))
        for i in range(1, n + 1):
            p = tri.Node(i).Transformed(trsf)
            pts[i - 1] = (p.X(), p.Y(), p.Z())
        if want_normals:
            if not tri.HasNormals():
                BRepLib_ToolTriangulatedShape.ComputeNormals_s(face, tri)
            nr = np.empty((n, 3), np.float32)
            for i in range(1, n + 1):
                d = tri.Normal(i).Transformed(trsf)
                nr[i - 1] = (d.X(), d.Y(), d.Z())
            if rev:
                nr = -nr
            norms.append(nr)
        m = tri.NbTriangles()
        t = np.empty((m, 3), np.int64)
        for i in range(1, m + 1):
            a, b, c = tri.Triangle(i).Get()
            t[i - 1] = (a, c, b) if rev else (a, b, c)
        verts.append(pts)
        tris.append(t - 1 + base)
        base += n
    if not verts:
        return np.zeros((0, 3)), None, np.zeros((0, 3), np.int64)
    return np.concatenate(verts), (np.concatenate(norms) if want_normals else None), np.concatenate(tris)


def edges(shape, deflection, angle):
    """BRep edges as line segments (Kx2x3, mm), for the explorer's wire view."""
    emap = TopTools_IndexedMapOfShape()
    TopExp.MapShapes_s(shape, TopAbs_EDGE, emap)
    segs = []
    for i in range(1, emap.Extent() + 1):
        e = TopoDS.Edge_s(emap.FindKey(i))
        if BRep_Tool.Degenerated_s(e):
            continue
        try:
            curve = BRepAdaptor_Curve(e)
            d = GCPnts_TangentialDeflection(curve, angle, deflection)
        except Exception:
            continue
        pts = [d.Value(j) for j in range(1, d.NbPoints() + 1)]
        pts = np.array([(p.X(), p.Y(), p.Z()) for p in pts])
        if len(pts) > 1:
            segs.append(np.stack([pts[:-1], pts[1:]], axis=1))
    return np.concatenate(segs) if segs else np.zeros((0, 2, 3))
