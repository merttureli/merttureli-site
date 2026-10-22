---
name: new-actor
description: Use when adding a new project to the Studio hero showreel (a "project actor" such as a rocket, coaster or pedal set) in next/js/showreel/.
---

# New showreel actor

Detail: `docs/recipes/showreel-actor.md`. Interface: header of `next/js/showreel/index.js` ("project actor interface"). 3D look: `docs/design/3d.md`.

1. `python3 tools/new.py actor <name>` writes `next/js/showreel/<name>.js` and a lab page `next/lab/<name>.html`, and prints a registration checklist.
2. Build the model in the stub (or load CAD output from the `import-cad` skill). Keep to the 3d.md material palette and triangle budget.
3. Tune it alone in `next/lab/<name>.html` (serve the repo on your port).
4. Register it in the sequencer only as the checklist says. While the showreel branch is open, do not edit existing files in `next/js/showreel/`: hand the registration snippet to the owner.
5. `python3 tools/check.py --fast`; preview Studio with `#reel-coaster` (`preview-site` skill).
