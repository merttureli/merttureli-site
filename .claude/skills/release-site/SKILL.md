---
name: release-site
description: Use when starting a batch of work on a branch, writing a HANDOFF.md, merging an approved branch into the preview branch, or when the owner asks to put merttureli.com live (merge to main).
---

# Branch, hand off, merge, release

Detail: `docs/recipes/release.md`.

Start: `git switch -c opt/<topic> claude/funny-sagan-acgved`. Commit only the files you changed, with a plain sentence subject.

Hand off (batch for later review):
1. Write `HANDOFF.md` at the repo root: title `# opt/<topic>: <one line>`, base branch, what changed (file: one line), verification (commands + results + screenshot paths), open items.
2. Publish a preview (`preview-site` skill) and give the link.

Merge (after the owner says yes):
1. `git switch claude/funny-sagan-acgved && git merge --no-ff opt/<topic> -m "Merge <topic>: <one line>"`
2. `python3 tools/check.py`
3. `git rm HANDOFF.md && git commit -m "Remove <topic> handoff note from the repo"`

Release (only when the owner asks to go live):
1. On the preview branch: `python3 tools/check.py --full --public` (visual regress, 0 open flags).
2. Bump `<lastmod>` in `sitemap.xml` for changed public pages.
3. `git switch main && git merge --no-ff claude/funny-sagan-acgved -m "Release: <one line>"`. Never reset main: it has commits the preview lacks (vx/). Main deleted most of `next/` before the Studio went live: after the merge run `git checkout claude/funny-sagan-acgved -- next` so every file the live pages load is there, then `python3 tools/check.py`.
4. Push only on the owner's word: `git push origin main`. Then check the live pages at phone and desktop width.
