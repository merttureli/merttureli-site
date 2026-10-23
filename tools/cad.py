#!/usr/bin/env python3
"""CAD import: STEP assembly -> the 3D formats the site loads, keeping CAD part names.

  python3 tools/cad.py setup                       one time: venv with OpenCascade (OCP) + numpy
  python3 tools/cad.py doctor                      is the venv ready?
  python3 tools/cad.py selftest                    end-to-end check on a generated Z-up assembly
  python3 tools/cad.py inspect PART.step [--map-out tools/cad/maps/NAME.json]
  python3 tools/cad.py import PART.step --map tools/cad/maps/NAME.json [--out DIR] [--dry-run]
  python3 tools/cad.py import PART.step --name NAME [--format cadmesh,glb] [--up z] [--quality low]
  python3 tools/cad.py view DIR [--name NAME] [--serve PORT]     write DIR/view.html (lit by the showreel rig)
  python3 tools/cad.py shot DIR --port PORT [--name NAME]        PNG of view.html (assembled + exploded)
  python3 tools/cad.py loader [--out next/js/cad/]                copy the runtime loader cadmesh.js

The venv lives at $CAD_VENV, else <tmp>/merttureli-cad-venv. In a Claude session put it in the
scratchpad:  CAD_VENV=<scratchpad>/cadvenv python3 tools/cad.py setup
Docs: docs/recipes/cad-import.md (how to) and docs/design/3d.md (the 3D look system).
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CAD = os.path.join(ROOT, 'tools', 'cad')
sys.path.insert(0, CAD)
REQS = os.path.join(CAD, 'requirements.txt')
FORMATS = ('cadmesh', 'glb', 'explorer', 'hero')


def venv_dir(arg=None):
    return os.path.abspath(arg or os.environ.get('CAD_VENV') or os.path.join(tempfile.gettempdir(), 'merttureli-cad-venv'))


def venv_python(vdir):
    return os.path.join(vdir, 'bin', 'python')


def have_ocp():
    try:
        import OCP  # noqa: F401
        import numpy  # noqa: F401
        return True
    except ImportError:
        return False


def ensure_ocp(args):
    """Re-run this command inside the venv when OCP is not importable here."""
    if have_ocp():
        return
    py = venv_python(venv_dir(args.venv))
    if os.environ.get('CAD_REEXEC'):
        sys.exit(f'cad: OCP still not importable inside {py}. Re-run: python3 tools/cad.py setup')
    if not os.path.exists(py):
        sys.exit(f'cad: no CAD venv at {venv_dir(args.venv)}.\n'
                 f'Run once (about 30 s, 1.3 GB):  python3 tools/cad.py setup'
                 + ('' if args.venv or os.environ.get('CAD_VENV') else '\n(or set CAD_VENV to an existing venv)'))
    env = dict(os.environ, CAD_REEXEC='1')
    argv = [py, os.path.abspath(__file__)] + sys.argv[1:]
    sys.exit(subprocess.call(argv, env=env))


def rel(p):
    return p if os.path.isabs(p) else os.path.abspath(p)


# ------------------------------------------------------------------ commands
def cmd_setup(args):
    vdir = venv_dir(args.venv)
    py = venv_python(vdir)
    if not os.path.exists(py):
        print(f'creating venv {vdir}')
        subprocess.check_call([sys.executable, '-m', 'venv', vdir])
    cmd = [py, '-m', 'pip', 'install', '-q', '-r', REQS]
    print('installing', ' '.join(open(REQS).read().split()), '(pypi through the session proxy)')
    if subprocess.call(cmd) != 0:
        sys.exit('cad: pip install failed. Behind a TLS proxy: export PIP_CERT=/root/.ccr/ca-bundle.crt and retry.')
    os.environ['CAD_VENV'] = vdir
    cmd_doctor(args)


def cmd_doctor(args):
    vdir = venv_dir(args.venv)
    py = venv_python(vdir)
    if not os.path.exists(py):
        sys.exit(f'cad: no venv at {vdir}. Run: python3 tools/cad.py setup')
    code = ('import importlib.metadata as m, numpy; from OCP.STEPCAFControl import STEPCAFControl_Reader; '
            'print("cadquery-ocp", m.version("cadquery-ocp"), "numpy", numpy.__version__)')
    r = subprocess.run([py, '-c', code], capture_output=True, text=True)
    if r.returncode:
        sys.exit(f'cad: venv {vdir} is broken:\n{r.stderr.strip()}\nRun: python3 tools/cad.py setup')
    print(f'ready: {vdir}\n  {r.stdout.strip()}')


def load_map(path):
    if not path:
        return {}
    path = rel(path)
    if not os.path.isfile(path):
        sys.exit(f'cad: no such map file: {path} (make one with: python3 tools/cad.py inspect PART.step --map-out {path})')
    try:
        with open(path) as fh:
            m = json.load(fh)
    except json.JSONDecodeError as e:
        sys.exit(f'cad: {path} is not valid JSON: {e}')
    import naming
    errs = naming.check_map(m, os.path.relpath(path, ROOT))
    if errs:
        sys.exit('cad: map errors:\n  ' + '\n  '.join(errs))
    return m


def cmd_inspect(args):
    ensure_ocp(args)
    import pipeline
    pipeline.inspect(rel(args.step), args.json, rel(args.map_out) if args.map_out else None)


def cmd_import(args):
    m = load_map(args.map)
    step = args.step or (os.path.join(ROOT, m['source']) if m.get('source') else None)
    if not step:
        sys.exit('cad: give a STEP file (or a "source" in the map)')
    step = rel(step)
    if not os.path.isfile(step):
        sys.exit(f'cad: no such STEP file: {step}')
    cfg = dict(m)
    for k in ('up', 'origin', 'quality', 'deflection', 'angle', 'explode'):
        v = getattr(args, k)
        if v is not None:
            cfg[k] = v
    if args.no_normals:
        cfg['normals'] = False
    cfg['name'] = args.name or m.get('name') or os.path.splitext(os.path.basename(step))[0].lower()
    fmts = args.format.split(',') if args.format else m.get('formats', ['cadmesh'])
    if fmts == ['all']:
        fmts = list(FORMATS)
    bad = [f for f in fmts if f not in FORMATS]
    if bad:
        sys.exit(f'cad: unknown format {", ".join(bad)}; choose from {", ".join(FORMATS)} or all')
    cfg['formats'] = fmts
    if args.out:
        out = rel(args.out)
    elif m.get('out'):
        out = os.path.join(ROOT, m['out'])
    elif args.dry_run:
        out = '(a new temp dir)'
    else:
        out = tempfile.mkdtemp(prefix=f'cad-{cfg["name"]}-')
    ensure_ocp(args)
    import pipeline
    pipeline.run_import(step, cfg, out, args.dry_run)
    if not args.dry_run:
        shown = os.path.relpath(out, ROOT) if out.startswith(ROOT + os.sep) else out
        if 'cadmesh' in fmts:
            print(f'\nlook at it:  python3 tools/cad.py view {shown} --name {cfg["name"]} --serve PORT')


def cmd_selftest(args):
    ensure_ocp(args)
    import selftest
    sys.exit(selftest.run())


def cmd_loader(args):
    out = rel(args.out) if args.out else os.path.join(ROOT, 'next', 'js', 'cad')
    src = os.path.join(CAD, 'cadmesh.js')
    dst = os.path.join(out, 'cadmesh.js')
    if os.path.exists(dst) and open(dst, 'rb').read() == open(src, 'rb').read():
        print(f'up to date: {dst}')
        return
    if args.dry_run:
        print(f'would copy {src} -> {dst}')
        return
    os.makedirs(out, exist_ok=True)
    shutil.copyfile(src, dst)
    print(f'copied {os.path.relpath(src, ROOT)} -> {dst}')


def find_models(d):
    names = []
    for f in sorted(os.listdir(d)):
        if f.endswith('.json'):
            try:
                with open(os.path.join(d, f)) as fh:
                    if json.load(fh).get('format') == 'cadmesh':
                        names.append(f[:-5])
            except (OSError, ValueError, AttributeError):
                pass
    return names


def cmd_view(args):
    d = rel(args.dir)
    if not os.path.isdir(d):
        sys.exit(f'cad: no such directory: {d}')
    models = find_models(d)
    name = args.name or (models[0] if len(models) == 1 else None)
    if not name:
        sys.exit(f'cad: {"no cadmesh model in " + d if not models else "several models, pick one with --name: " + ", ".join(models)}')
    if name not in models:
        sys.exit(f'cad: {d}/{name}.json is not a cadmesh model (have: {", ".join(models) or "none"})')
    vd = os.path.join(d, 'view')
    os.makedirs(os.path.join(vd, 'showreel'), exist_ok=True)
    copies = {
        os.path.join(ROOT, 'next', 'js', 'three.module.min.js'): os.path.join(vd, 'three.module.min.js'),
        os.path.join(ROOT, 'next', 'js', 'showreel', 'engine.js'): os.path.join(vd, 'showreel', 'engine.js'),
        os.path.join(CAD, 'cadmesh.js'): os.path.join(vd, 'cadmesh.js'),
    }
    for s, t in copies.items():
        shutil.copyfile(s, t)
    html = open(os.path.join(CAD, 'view.html')).read().replace('__MODEL__', name)
    page = os.path.join(d, 'view.html') if len(models) == 1 else os.path.join(d, f'view-{name}.html')
    with open(page, 'w') as fh:
        fh.write(html)
    print(f'wrote {page} (+ view/ with three.js, the showreel engine and cadmesh.js)')
    if args.serve:
        url = f'http://127.0.0.1:{args.serve}/{os.path.basename(page)}'
        print(f'serving {d} at {url}  (Ctrl+C stops)')
        os.chdir(d)
        os.execvp(sys.executable, [sys.executable, '-m', 'http.server', str(args.serve), '--bind', '127.0.0.1'])


def cmd_shot(args):
    d = rel(args.dir)
    models = find_models(d)
    name = args.name or (models[0] if len(models) == 1 else None)
    if not name:
        sys.exit('cad: pick a model with --name: ' + ', '.join(models))
    page = 'view.html' if len(models) == 1 else f'view-{name}.html'
    if not os.path.exists(os.path.join(d, page)):
        sys.exit(f'cad: run first: python3 tools/cad.py view {args.dir} --name {name}')
    out = rel(args.out) if args.out else os.path.join(d, f'{name}-shot.png')
    srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(args.port), '--bind', '127.0.0.1'], cwd=d,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        r = subprocess.call(['node', os.path.join(CAD, 'shot.js'), f'http://127.0.0.1:{args.port}/{page}', out,
                             str(args.width), str(args.height)])
    finally:
        srv.terminate()
        srv.wait()
    sys.exit(r)


def main():
    ap = argparse.ArgumentParser(prog='tools/cad.py', description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--venv', help='CAD venv directory (default $CAD_VENV or <tmp>/merttureli-cad-venv)')
    sub = ap.add_subparsers(dest='cmd', required=True)

    s = sub.add_parser('setup', help='create the venv and install OCP + numpy (one time per machine)')
    s.set_defaults(fn=cmd_setup)
    s = sub.add_parser('doctor', help='check the venv')
    s.set_defaults(fn=cmd_doctor)

    s = sub.add_parser('selftest', help='build a Z-up test assembly (instances, colors), import it, check names and axes')
    s.set_defaults(fn=cmd_selftest)

    s = sub.add_parser('inspect', help='list the parts, names, sizes and colors in a STEP file')
    s.add_argument('step')
    s.add_argument('--json', action='store_true', help='machine-readable output')
    s.add_argument('--map-out', help='write a starter map (one rule per part) to this path')
    s.set_defaults(fn=cmd_inspect)

    s = sub.add_parser('import', help='STEP -> cadmesh / glb / explorer / hero files')
    s.add_argument('step', nargs='?', help='STEP file (default: the map\'s "source")')
    s.add_argument('--map', help='tools/cad/maps/NAME.json: names, materials, flags, defaults')
    s.add_argument('--name', help='output name (default: map "name", else the file stem)')
    s.add_argument('--out', help='output directory (default: map "out", else a new temp dir)')
    s.add_argument('--format', help='comma list of ' + ', '.join(FORMATS) + ', or all (default: map "formats", else cadmesh)')
    s.add_argument('--up', choices=['y', 'z', '-z', 'x', '-x', '-y'], help='source up axis, turned to +Y (default y)')
    s.add_argument('--origin', choices=['keep', 'center', 'bottom', 'top'], help='where 0,0,0 goes (default center)')
    s.add_argument('--quality', choices=['low', 'medium', 'high'], help='tessellation preset (default medium)')
    s.add_argument('--deflection', type=float, help='chordal deflection in mm (overrides --quality)')
    s.add_argument('--angle', type=float, help='angular deflection in radians')
    s.add_argument('--explode', type=float, help='auto explode distance factor (default 1.0)')
    s.add_argument('--no-normals', action='store_true', help='leave normals out (the loader computes them)')
    s.add_argument('--dry-run', action='store_true', help='read and mesh, print the table, write nothing')
    s.set_defaults(fn=cmd_import)

    s = sub.add_parser('view', help='write a viewer page next to a cadmesh model')
    s.add_argument('dir')
    s.add_argument('--name')
    s.add_argument('--serve', type=int, metavar='PORT', help='serve the directory on 127.0.0.1:PORT')
    s.set_defaults(fn=cmd_view)

    s = sub.add_parser('shot', help='screenshot the viewer (Playwright): assembled left, exploded right')
    s.add_argument('dir')
    s.add_argument('--name')
    s.add_argument('--port', type=int, required=True)
    s.add_argument('--out', help='PNG path (default DIR/NAME-shot.png)')
    s.add_argument('--width', type=int, default=1440)
    s.add_argument('--height', type=int, default=900)
    s.set_defaults(fn=cmd_shot)

    s = sub.add_parser('loader', help='copy tools/cad/cadmesh.js to where actors import it')
    s.add_argument('--out', help='directory (default next/js/cad/)')
    s.add_argument('--dry-run', action='store_true')
    s.set_defaults(fn=cmd_loader)

    args = ap.parse_args()
    args.fn(args)


if __name__ == '__main__':
    main()
