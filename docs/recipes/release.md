# Branch, hand off, merge, release

How a change travels from a work branch to merttureli.com. GitHub Pages serves the root of `main` at merttureli.com.

## Branches

| Branch | Role |
|---|---|
| `main` | live site. Has commits the preview branch lacks (for example `vx/`): always merge into it, never reset it. |
| `claude/funny-sagan-acgved` | preview branch: the next version of the site. Work branches start here and merge back here. |
| `opt/<topic>` | one batch of work, cut from the preview branch. |

## 1. Work on a branch

```sh
git switch -c opt/<topic> claude/funny-sagan-acgved
# edit, then:
python3 tools/build.py               # if next/, content/ or tools/build-studio-cases.py changed
python3 tools/check.py              # must show no FAIL
git add <the files you changed>      # never git add -A blindly
git commit -m "<Area>: <what changed>"
```

Commit subjects in this repo are plain sentences that say what changed: "Hero rocket: keep the LCP on the first paint", "CHARGER has four fins, not three".

## 2. Hand off

For a batch the owner will review later, write `HANDOFF.md` at the repo root on the branch and commit it. Keep it to:

- `# opt/<topic>: <one line>` and the base branch
- What changed: files, with one line each
- Verification: commands run and their result, screenshot paths
- Open items and anything the owner must decide

Publish a preview for the owner ([preview.md](preview.md)) and give the link.

## 3. Merge into the preview branch

After the owner says yes:

```sh
git switch claude/funny-sagan-acgved
git merge --no-ff opt/<topic> -m "Merge <topic>: <one line>"
python3 tools/check.py
git rm HANDOFF.md && git commit -m "Remove <topic> handoff note from the repo"
```

`HANDOFF.md` never stays on the preview branch or `main`.

## 4. Release to main

Only when the owner asks to go live.

```sh
git switch claude/funny-sagan-acgved
python3 tools/check.py --full --public   # every case page in the smoke, visual regress vs HEAD, 0 open flags
```

Then:

1. Update `<lastmod>` in `sitemap.xml` to today for every public page that changed.
2. `git switch main && git merge --no-ff claude/funny-sagan-acgved -m "Release: <one line>"`
3. Push only when the owner says so: `git push origin main`.
4. After GitHub Pages deploys (a minute or two), open https://merttureli.com/ and each changed page at phone and desktop width. Check the share card with the page's `og:image` URL.

## Rules

- The Studio is live: `index.html`, `websites.html` and `projects/*.html` are built from `next/`. The `next/` pages and `studies/` stay `noindex` and `Disallow`ed; `next/css`, `next/js`, `next/assets` and `studies/shared/` must stay crawlable.
- Merging into `main`: main deleted most of `next/` in October 2026 ("keep the Studio redesign off the live site"). Git keeps those deletions for files the preview branch did not change since, so after the merge restore the whole folder from the preview branch (`git checkout claude/funny-sagan-acgved -- next`) and check that `git diff claude/funny-sagan-acgved -- next` is empty before committing. Keep main's `vx/`, `assets/og-cover.png`, `assets/motion/charger-painted-wide-poster.png` and `assets/charger-explorer/fonts/`.
- Generated files (`index.html`, `websites.html`, `projects/*.html`, `next/projects/*.html`) change only through `python3 tools/build.py`. `python3 tools/build.py --check` must pass on every branch.
- No secrets, tokens or local paths in commits.
