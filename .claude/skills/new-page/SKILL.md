---
name: new-page
description: Use when asked to add a new page or a new section to merttureli.com or Studio, so it starts in the site's head, nav, footer and design conventions.
---

# New page or section

Detail: `docs/recipes/new-page.md`. Components to reuse: `docs/design/components.md` and `docs/design/catalog.html`.

1. Page: `python3 tools/new.py page <name>` (see `--help` for public or private). Section: `python3 tools/new.py section <name>`.
2. Fill the copy (`edit-copy` rules) and media (`images` skill). Reuse existing classes and tokens; no new colors or sizes.
3. Public page: add it to `sitemap.xml`, give it an `og:image`, canonical, no `noindex`. Private page: `noindex`, not in the sitemap (`docs/recipes/meta.md`).
4. Link it from where the owner wants it.
5. `python3 check-writing.py <page>`, `python3 tools/check.py`, preview for the owner.
