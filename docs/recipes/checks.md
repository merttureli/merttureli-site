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
| `python3 tools/check.py` | static + build + browser smoke (site pages and Studio at rest and with the reel) | ~40 s | before every commit |
| `python3 tools/check.py --full` | default + every case study and every `next/lab/*.html` in the smoke + visual-regress vs HEAD (site pages in both palettes, and `next/index.html`) | 3 to 6 min | before merging a CSS, JS or generator change |
| `python3 tools/check.py --full --expect-change next/index.html` | same, but diffs on the named pages are intended: listed as `CHANGED (expected)`, not FAIL | 3 to 6 min | the task is a visible change on that page |
| `python3 tools/check.py --public` | default, and open flags FAIL | ~50 s | before the site goes public |
| `python3 tools/check.py --only links,js` | just those checks, in any mode (`visual` too) | varies | re-checking one thing |
| `python3 tools/check.py --skip smoke` | default minus one check | varies | browser not available |
| `python3 tools/check.py --list` | prints the checks | instant | |

Works from any directory. Python 3 stdlib, plus Node 22 and the preinstalled
Playwright at `/opt/node22/lib/node_modules/playwright` for `build`, `smoke` and
`visual` (set `PLAYWRIGHT=path` to use another).

`visual` also needs two npm packages (pixelmatch, pngjs). It finds them in
`tools/visual-regress/node_modules`, else in the main checkout's copy (for a git
worktree), else on `NODE_PATH`, else runs `npm ci` there once. If all of that
fails, the row reads `WARN visual NOT RUN, pixels not proven` with the fix
(`cd tools/visual-regress && npm install`) and the run ends with a NOTE. A WARN
there means the pixels were NOT checked: never report such a run as proof.

## The checks

| Name | Mode | FAILs when | Fix |
|---|---|---|---|
| `build` | default | `index.html`, `websites.html`, `projects/*.html` or `next/projects/*.html` differ from what `tools/build.py` makes of `next/`, `content/` and `tools/build-studio-cases.py` | edit the source, run `python3 tools/build.py`, commit both |
| `writing` | fast | `check-writing.py` flags a tic on a public page or any changed `.html` | rewrite the sentence; rules are at the top of `check-writing.py` |
| `flags` | fast | only with `--public`: any `<mark class="flag">` left (else WARN) | [flags.md](flags.md) |
| `links` | fast | a local `href`, `src`, `srcset`, `poster`, `data-*` path, CSS `url()`, JS `import`, sitemap `<loc>` or `https://merttureli.com/...` URL points at a missing file, escapes the repo, or at a file git ignores | fix the path, or `git add` the file |
| `js` | fast | `node --check` fails on a `.js` file or an inline `<script>` | the line is in the message |
| `json` | fast | a `.json` file or inline `ld+json` / `importmap` does not parse | |
| `robots` | fast | a page under `next/`, `studies/`, `docs/` lacks `<meta name="robots" content="noindex">` or robots.txt lets crawlers fetch it (or `/.claude/` while `.nojekyll` exists); robots.txt blocks a CSS, JS, font or image a sitemap page loads; a sitemap URL is disallowed or noindex | add the meta tag / robots.txt line |
| `tokens` | fast | never (WARN only): a stylesheet in `css/` or `next/css/` changed vs `--base` and its values move once every `var(--token)` is expanded, or it newly uses a token that a palette, `@media` or `.on-dark` also sets | expected for a real style change: prove it with `--only visual`; for a token rename, fix the token |
| `transition` | fast | never (WARN only): lists the open items in `docs/transition.md` and every live page link to an old-design page on it | do the item, then delete its line |
| `smoke` | default | console error, uncaught error, failed or 4xx local request, or a page that does not load in 30 s, at 390 and 1440; a `next/lab/` page whose `window.labReport.ok` is false (the actor lab's interface checks) | the page, width and URL are in the message |
| `visual` | full | a screen differs from `--base` (default HEAD) or a gate changes (h1 count, console errors, external hosts) on a page not named in `--expect-change` | the differing screens are listed first with their diff PNG; open them, then fix or rerun with `--expect-change PAGE` |

WARNs: open flags; a CSS diff that is not a pure token rename; a JS string that looks like an asset path but resolves nowhere
(it may be built at runtime); robots.txt allowing non-page folders (`templates/`,
`content/`, `cards/`, `tools/`); external request failures in the smoke; the old-design items in `docs/transition.md`.

## Common jobs

| Task | Command |
|---|---|
| Check one Studio change | `python3 tools/check.py --only links,js,robots,smoke --pages next/,next/#reel-coaster` |
| Pixel-check the Studio | `python3 tools/check.py --only visual --pages next/index.html` (one palette; masks the hero canvas and the clock) |
| Mark a visible change as intended | `python3 tools/check.py --full --expect-change index.html,next/index.html` |
| Run a showreel lab's interface checks | `python3 tools/check.py --only smoke --pages next/lab/<key>.html` (FAILs unless `labReport.ok`) |
| Smoke one showreel project in the hero | `python3 tools/check.py --only smoke --pages next/#reel-<key>` (flags in [showreel-actor.md](showreel-actor.md)) |
| See which pages the smoke loaded | add `-v` (prints the page list and the external hosts) |
| Smoke a new page | `python3 tools/check.py --only smoke --pages mypage.html` |
| Keep the smoke screenshots | `python3 tools/check.py --only smoke --out /tmp/check-out` (PNGs in `smoke/`) |
| Pixel-check CSS edits on two pages | `python3 tools/check.py --only visual --pages index.html,websites.html` |
| Prove a token rename changed no value | `python3 tools/check.py --only tokens --base <commit before the rename> -v` |
| Pixel-check against an older commit | `python3 tools/check.py --only visual --base 4c19af5` |
| Writing check against a branch point | `python3 tools/check.py --only writing --base main` |
| Machine-readable result | `python3 tools/check.py --json /tmp/check.json` |
| Pin the smoke server port | `python3 tools/check.py --port 8987` (default: any free port) |
| List every open flag | `python3 tools/check-flags.py` |

`visual` masks the live photography corridor and the live study iframe on
websites.html, and on Studio the hero canvas and the clock, which differ run to
run. The report is `<out>/visual/site/index.html` and `<out>/visual/studio/index.html`
(pass `--out DIR` to keep them). pixelmatch ignores very small color shifts
(threshold 0.1): a hue nudge such as `#ff4f00` to `#ff6200` can render "same".
The `tokens` row still names the token value that moved, so read both.

## Playwright by hand

Every script must block the four hosts. Headless WebGL (the Studio hero, showreel
labs) needs the swiftshader flags:

```js
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
await ctx.route(/clarity\.ms|bing\.com|workers\.dev|formspree\.io/, r => r.abort());
```

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
