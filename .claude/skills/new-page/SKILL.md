---
name: new-page
description: Use when asked to add a new page or a new section to merttureli.com or Studio, so it starts in the site's head, nav, footer and design conventions.
---

# New page or section

Detail: `docs/recipes/new-page.md`. Components to reuse: `docs/design/components.md` and `docs/design/catalog.html`.

Page:
1. `python3 tools/new.py page <name> --title "Title" --dry-run`, then without `--dry-run`. `--style site` (default, websites.html chrome) or `--style plain` (privacy.html column); `--dir <folder>` for a subfolder.
2. It starts `noindex` with flagged placeholder copy. Public page: pass `--index` at creation or later delete the `robots noindex` line, add a `<url>` to `sitemap.xml`, give it an `og:image` (`docs/recipes/meta.md`).

Section:
1. `python3 tools/new.py section <name> --site studio|page|home --number 07 --label "Label"`. It prints the snippet; paste it into `next/index.html`, a websites-style page, or `src/index.html` (then `python3 tools/build.py`).
2. Studio CSS stub: paste it at the end of `next/css/studio.css`, using tokens from `next/css/tokens.css` (no new literals).

Then:
1. Fill the copy (`edit-copy` rules) and media (`images` skill). Reuse existing classes and tokens; no new colors or sizes.
2. Link it from where the owner wants it.
3. `python3 tools/check-flags.py` shows the placeholders you still owe; `python3 check-writing.py <page>`; `python3 tools/check.py`; preview for the owner.
