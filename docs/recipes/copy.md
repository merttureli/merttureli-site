# Change words on the site

Use this for any text edit: a sentence, a heading, a caption, a date, a number, a button label.

## 1. Find where the words live

```sh
grep -rn --include=*.html --include=*.py --include=*.js "exact words" . | grep -v -e '^./vx/' -e node_modules
```

A hit in a generated file means you edit its source instead:

| Hit in | Generated? | Edit this | Then run |
|---|---|---|---|
| `index.html` | yes | `next/index.html` (incl. the hero drift words in `data-drift`) | `python3 tools/build.py` |
| `websites.html` | yes | `next/websites.html` | `python3 tools/build.py` |
| `projects/<slug>.html` or `next/projects/<slug>.html` | yes | `content/projects/<slug>.json` (fields: [content.md](content.md)); the giant name, tile line and menus: `tools/build-studio-cases.py` | `python3 tools/build.py` |
| a `<title>`, share card or JSON-LD on a live page | yes | `LIVE` in `tools/build.py`, case pages from their JSON ([meta.md](meta.md)) | `python3 tools/build.py` |
| `privacy.html`, `404.html`, `hi/index.html`, `photography-*.html` | no | the file itself | nothing |
| `next/js/studio.js` (Studio clock text "in Austin") | no | plain JS string in `next/js/studio.js`; edit in place | |
| `studies/<name>/` | no | the study files. They are frozen prototypes: change only on request | |
| `cards/` | no | print business cards, not served to visitors | |

The home footer and menu are written twice: in `next/index.html` and in `page()` of `tools/build-studio-cases.py` (all five case pages). Change both.

## 2. Edit

- Keep the surrounding markup.
- In `content/projects/<slug>.json` keep valid JSON (straight double quotes, escape `\"` inside strings). Rich fields allow HTML and entities; `title`, `eyebrow`, `description`, `og_alt` are plain text. A fact you cannot confirm becomes a flag object ([flags.md](flags.md)).
- House voice: first person ("I", not "we"), past tense for work done, specific, no hype, no editorializing, US spelling, no em or en dashes (use a hyphen or a period). The rule in `check-writing.py`: state what was done and what resulted.
- No new facts. The owner approves every fact. Never add figures or details about IP-protected work (HOTBOX, the bend fixture).
- The site must not read as job hunting: no "open to roles" or availability lines. Offering web projects is fine where `websites.html` already does.

## 3. Check

```sh
python3 tools/build.py              # only if you edited a source of a generated page
python3 check-writing.py index.html # or the page you changed; no argument checks every page
python3 tools/check.py              # one command that proves nothing broke
```

`check-writing.py` must print no hits for the page you touched. `tools/check.py` must show no FAIL (WARN for open flags is fine).
`git diff --stat` must list only what you meant to touch: for a case study, `content/projects/<slug>.json` and its two
generated pages (`next/projects/<slug>.html`, `projects/<slug>.html`); for the home page, `next/index.html` and `index.html`.

`python3 tools/build.py --help` prints the usage without building.

## 4. Commit

Commit the source and the regenerated page together:

```sh
git add next/index.html index.html                 # home
git add content/ next/projects/ projects/          # case study
git commit -m "Copy: <what changed>"
```

## Same fact in many places

A project's title, summary or numbers can appear on the home tile, its case page and the websites page. "What the owner's words mean" in [content.md](content.md) says which field each word is on every surface; `python3 tools/new.py project <slug> --where` lists the lines. Change every place in one commit. For contact details see [contact.md](contact.md). For page titles, descriptions and share images see [meta.md](meta.md).
