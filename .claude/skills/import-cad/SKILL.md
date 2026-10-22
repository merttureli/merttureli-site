---
name: import-cad
description: Use when the owner sends a STEP or other CAD file (Therma-Shift, rudder pedals, Robo-Catcher or a new part) to show in 3D on the site, the CHARGER explorer or the Studio showreel.
---

# Import CAD into the site

Detail: `docs/recipes/cad-import.md`. Look system and budgets: `docs/design/3d.md`.

1. Put the STEP file outside the repo first (scratchpad). Confirm with the owner: units (mm), part names, which parts are IP sensitive.
2. Set up the CAD environment once as the recipe says (venv under the scratchpad).
3. Run the import to a temp dir first: `python3 tools/cad.py --help`, then the convert command from the recipe with `--out <scratchpad>/cad-<name>`.
4. Check the report: triangle count and draw calls within the 3d.md budget, part names match what the viewer or showreel `getParts()` expects.
5. Copy the outputs into the asset folder the recipe names; never commit the raw STEP unless the owner asks.
6. `python3 tools/check.py --fast`; preview for the owner (`preview-site` skill).
