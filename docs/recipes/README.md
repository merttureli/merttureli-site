# Recipes

One page per job. Each gives the exact commands. Claude sessions can run the matching skill in `.claude/skills/`.

## Most common jobs first

From the repo history (136 commits to Oct 2026, by subject): handoff and merge commits 43, 3D, rocket and showreel 29, media 20, copy and fact fixes 18, case study generator 10, meta and indexing 10, palette and contrast 9, contact and resume 7, analytics and privacy 7. 28 commits touched a case study.

| I want to | Recipe | Skill |
|---|---|---|
| Change words, a date, a number | [copy.md](copy.md) | `edit-copy` |
| Answer, list or add an open question for the owner | [flags.md](flags.md) | `resolve-flags` |
| Replace a photo, render, poster, clip or share image | [images-swap.md](images-swap.md) | `images` |
| Make web sizes of a new image or video | [media.md](media.md) | `images` |
| Change a project's facts everywhere | [content.md](content.md) | `add-project` |
| Add or remove a project or case study | [add-project.md](add-project.md) | `add-project` |
| Find which field "summary", "card image", "title" means | [content.md](content.md#what-the-owners-words-mean) | |
| Change email, phone, LinkedIn, location | [contact.md](contact.md) | `contact-details` |
| Change a page title, description, share image, sitemap | [meta.md](meta.md) | `edit-copy` |
| Prove nothing broke | [checks.md](checks.md) | `verify-site` |
| Show the owner a preview link | [preview.md](preview.md) | `preview-site` |
| Branch, hand off, merge, release to main | [release.md](release.md) | `release-site` |
| Tweak or add a color palette (old-design pages only) | [palette.md](palette.md) | `palette` |
| Edit the live design (`next/`) | [studio-edit.md](studio-edit.md) | `edit-copy` |
| Add a project to the home showreel | [showreel-actor.md](showreel-actor.md) | `new-actor` |
| Add a page or section | [new-page.md](new-page.md) | `new-page` |
| Bring a STEP file into 3D | [cad-import.md](cad-import.md) | `import-cad` |
| Add a tracked event, keep the privacy page true | [tracking.md](tracking.md) | |

## The commands behind them

| Command | Does |
|---|---|
| `python3 tools/build.py` | publish `next/` to the root: `index.html`, `websites.html`, `projects/*.html` (and `next/projects/*.html` from `content/`) |
| `python3 tools/build.py --check` | fail if generated pages do not match their sources |
| `python3 tools/check.py` | the one check before every commit (build, links, JS, smoke; about a minute). `--fast` skips build and browser |
| `python3 check-writing.py <page>` | house-style lint for copy |
| `python3 tools/check-flags.py` | list open owner questions (exit 1 while any remain); `--next-id SLUG` for a new one |
| `python3 tools/media.py ...` | image and video derivatives, `audit` |
| `python3 tools/preview.py site\|studio` | artifact-ready copy for owner review |
| `python3 tools/new.py <kind> <name>` | scaffolds: project, actor, page, section; `project <slug> --where` / `--remove` |
| `python3 tools/cad.py ...` | STEP to the site's 3D formats |

Never hand edit `index.html`, `websites.html`, `projects/*.html` or `next/projects/*.html`. Still old design: [../transition.md](../transition.md).

Design systems behind the pages: [../design/](../design/). All docs and tools: [../README.md](../README.md).
