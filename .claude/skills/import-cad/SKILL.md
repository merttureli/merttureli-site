---
name: import-cad
description: Use when the owner sends a STEP or other CAD file (Therma-Shift, rudder pedals, Robo-Catcher or a new part) to show in 3D on the site, the CHARGER explorer or the Studio showreel.
---

# Import CAD into the site

Detail: `docs/recipes/cad-import.md`. Look system and budgets: `docs/design/3d.md`.

1. Keep the STEP file outside the repo (scratchpad). Confirm with the owner: units (mm), part names, which parts are IP sensitive.
2. One time per machine: `CAD_VENV=<scratchpad>/cadvenv python3 tools/cad.py setup`, then `... tools/cad.py doctor`. Pass the same `CAD_VENV` on every later call.
3. `python3 tools/cad.py inspect PART.step --map-out tools/cad/maps/<name>.json` lists parts, sizes and colors and writes a part map. Edit the map (names, groups, materials) as the recipe says.
4. `python3 tools/cad.py import PART.step --map tools/cad/maps/<name>.json --out <scratchpad>/cad-<name> --dry-run`, then without `--dry-run`.
5. Look: `python3 tools/cad.py view <out> --serve <your port>` or `python3 tools/cad.py shot <out> --port <your port>` (assembled + exploded PNG). Check the triangle and draw-call budget in 3d.md and that part names match what the explorer or showreel `getParts()` expects.
6. Copy the outputs to the asset folder the recipe names (`python3 tools/cad.py loader` copies the runtime loader for actors). Never commit the raw STEP unless the owner asks.
7. `python3 tools/check.py`; preview for the owner (`preview-site` skill).
