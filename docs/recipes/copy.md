# Change words on the site

Use this for any text edit: a sentence, a heading, a caption, a date, a number, a button label.

## 1. Find where the words live

```sh
grep -rn --include=*.html --include=*.py --include=*.js "exact words" . | grep -v -e '^./vx/' -e node_modules
```

A hit in a generated file means you edit its source instead:

| Hit in | Generated? | Edit this | Then run |
|---|---|---|---|
| `index.html` | yes | `src/index.html` | `python3 tools/build.py` |
| `projects/<slug>.html` or `src/projects/<slug>.html` | yes | `content/projects/<slug>.json` (fields: [content.md](content.md)) | `python3 tools/build.py` |
| `websites.html`, `privacy.html`, `404.html`, `hi/index.html`, `photography-*.html` | no | the file itself | nothing |
| `next/index.html` (Studio, incl. the hero drift words in `data-drift`) | no | the file itself | nothing |
| `next/js/studio.js` (Studio clock text "in Austin") | no | plain JS string in `next/js/studio.js`; edit in place | |
| `studies/<name>/` | no | the study files. They are frozen prototypes: change only on request | |
| `js/mobile-nav.js` (phone menu Email and Resume links) | no | the file itself | nothing |
| `cards/` | no | print business cards, not served to visitors | |

The home page footer is copied into every case page by `build-case.py`, so a footer edit in `src/index.html` changes all six pages after the build.

## 2. Edit

- Keep the surrounding markup. In `src/index.html` the text sits inside `<x-import ...>` runtime tags: change only the text between the tags.
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

Never run `python3 tools/build.py --help`: build.py has no help flag, so it runs a full build.

## 4. Commit

Commit the source and the regenerated page together:

```sh
git add src/index.html index.html          # home
git add content/ src/projects/ projects/        # case study
git commit -m "Copy: <what changed>"
```

## Same fact in many places

A project's title, summary or numbers can appear on the home card, its case page, `websites.html` and Studio. See the field map in [content.md](content.md) and change every place in one commit. For contact details and the resume see [contact.md](contact.md). For page titles, descriptions and share images see [meta.md](meta.md).
