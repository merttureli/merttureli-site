---
name: new-page
description: Use when asked to add a new page or a new section to merttureli.com, so it starts in the Studio design's head, nav, footer and conventions and gets published by tools/build.py.
---

# New page or section

Detail: `docs/recipes/new-page.md`. Components to reuse: `docs/design/components.md` and `docs/design/catalog.html`.

Page (Studio):
1. Copy `next/websites.html` to `next/<name>.html`; keep `noindex` and set `<link rel="canonical" href="https://merttureli.com/<name>.html">`.
2. Add one line to `PAGES` in `tools/build.py`: `("next/<name>.html", "<name>.html"),` (optional `LIVE` entry for its title and share card). `python3 tools/build.py` publishes `<name>.html` without `noindex`.
3. Public: add a `<url>` to `sitemap.xml`. Old-design pages (`python3 tools/new.py page`) only if the owner asks: they are on `docs/transition.md`.

Section:
1. `python3 tools/new.py section <name> --label "Label"` (`--site page` for an old-design page; `--number` defaults to the next free one). It prints the snippet; paste it into `next/index.html` after the last numbered section and before contact (placement and numbering: new-page.md "Where it goes and its number"), then `python3 tools/build.py`. A component body: paste its snippet from components.md into `NAME__body`.
2. Studio CSS stub: paste it at the end of `next/css/studio.css`, using tokens from `next/css/tokens.css` (no new literals).

Then:
1. Fill the copy (`edit-copy` rules) and media (`images` skill). Reuse existing classes and tokens; no new colors or sizes.
2. Link it from where the owner wants it.
3. `python3 tools/check-flags.py` shows the placeholders you still owe; `python3 check-writing.py <page>`; `python3 tools/check.py`; preview for the owner.
