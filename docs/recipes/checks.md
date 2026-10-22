# Prove nothing broke

One command, run before every commit:

```sh
python3 tools/check.py
```

It prints one line per check as it finishes, a summary table, then the details of
every WARN and FAIL. Exit 0 means no FAIL. WARN and SKIP do not fail the run.

## Which mode

| Command | Runs | Time | Use when |
|---|---|---|---|
| `python3 tools/check.py --fast` | static checks only, no browser | ~5 s | while editing, after every small change |
| `python3 tools/check.py` | static + build + browser smoke | ~50 s | before every commit |
| `python3 tools/check.py --full` | default + every case study in the smoke + visual-regress vs HEAD | 3 to 6 min | before merging a CSS, JS or generator change |
| `python3 tools/check.py --public` | default, and open flags FAIL | ~50 s | before the site goes public |
| `python3 tools/check.py --only links,js` | just those checks, in any mode (`visual` too) | varies | re-checking one thing |
| `python3 tools/check.py --skip smoke` | default minus one check | varies | browser not available |
| `python3 tools/check.py --list` | prints the checks | instant | |

Works from any directory. Python 3 stdlib, plus Node 22 and the preinstalled
Playwright at `/opt/node22/lib/node_modules/playwright` for `build`, `smoke` and
`visual` (set `PLAYWRIGHT=path` to use another).

## The checks

| Name | Mode | FAILs when | Fix |
|---|---|---|---|
| `build` | default | `index.html` or `projects/*.html` differ from `src/` + `build-case.py` | edit the source, run `python3 tools/build.py`, commit both |
| `writing` | fast | `check-writing.py` flags a tic on a public page or any changed `.html` | rewrite the sentence; rules are at the top of `check-writing.py` |
| `flags` | fast | only with `--public`: any `<mark class="flag">` left (else WARN) | [flags.md](flags.md) |
| `links` | fast | a local `href`, `src`, `srcset`, `poster`, `data-*` path, CSS `url()`, JS `import`, sitemap `<loc>` or `https://merttureli.com/...` URL points at a missing file, escapes the repo, or at a file git ignores | fix the path, or `git add` the file |
| `js` | fast | `node --check` fails on a `.js` file or an inline `<script>` | the line is in the message |
| `json` | fast | a `.json` file or inline `ld+json` / `importmap` does not parse | |
| `robots` | fast | a page under `next/`, `studies/`, `docs/` lacks `<meta name="robots" content="noindex">`; robots.txt does not `Disallow` those folders; a sitemap URL is disallowed or noindex | add the meta tag / robots.txt line |
| `smoke` | default | console error, uncaught error, failed or 4xx local request, or a page that does not load in 30 s, at 390 and 1440 | the page, width and URL are in the message |
| `visual` | full | any screen differs from `--base` (default HEAD) or a gate changes (h1 count, console errors, external hosts) | open the contact sheet it prints |

WARNs: open flags; a JS string that looks like an asset path but resolves nowhere
(it may be built at runtime); robots.txt allowing non-page folders (`templates/`,
`content/`, `cards/`, `src/`, `tools/`); external request failures in the smoke.

## Common jobs

| Task | Command |
|---|---|
| Check one Studio change | `python3 tools/check.py --only links,js,robots,smoke --pages next/,next/#reel-coaster` |
| Smoke a new page | `python3 tools/check.py --only smoke --pages mypage.html` |
| Keep the smoke screenshots | `python3 tools/check.py --only smoke --out /tmp/check-out` (PNGs in `smoke/`) |
| Pixel-check CSS edits on two pages | `python3 tools/check.py --only visual --pages index.html,websites.html` |
| Pixel-check against an older commit | `python3 tools/check.py --only visual --base 4c19af5` |
| Writing check against a branch point | `python3 tools/check.py --only writing --base main` |
| Machine-readable result | `python3 tools/check.py --json /tmp/check.json` |
| Pin the smoke server port | `python3 tools/check.py --port 8987` (default: any free port) |
| List every open flag | `python3 tools/check-flags.py` |

`visual` needs its two npm deps once: `cd tools/visual-regress && npm install`
(otherwise it SKIPs and says so). It masks the live photography corridor and the
live study iframe on websites.html, which differ run to run.

## Silence a false positive

| Case | Do |
|---|---|
| JS string flagged by `links` that is not a path | add `path/to/file.js: the-literal.webp` to `tools/checks/links-allow.txt` |
| Template placeholders | values with `${`, `{{`, `<%` or `{name}` are skipped; `templates/` and `tools/` are not scanned |

## Add a check

1. Create `tools/checks/<name>.py` with `NAME`, `TITLE`, `MODES` (a set of
   `"fast"`, `"default"`, `"full"`) and `run(ctx)` returning
   `Result(PASS|WARN|FAIL|SKIP, "one line", ["detail", ...])`.
2. Import it in `tools/check.py` and add it to `CHECKS`.
3. Useful `ctx` members: `ctx.root`, `ctx.path(rel)`, `ctx.files()` (tracked +
   untracked, not ignored), `ctx.site_files((".html",))`, `ctx.changed()`,
   `ctx.public`, `ctx.pages`, `ctx.out`. Run commands with `checks.sh(cmd)`.
