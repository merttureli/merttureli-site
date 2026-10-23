# Flags: open questions for the owner

A flag marks a fact or a line the owner still has to confirm. It renders in place with a dotted underline (`mark.flag` in `css/site-palette.css`) and the question shows on hover.

```html
<mark class="flag" data-flag="<block id>" data-note="<question>">text</mark>
```

## List open flags

```sh
python3 tools/check-flags.py      # prints page:line [id] "text" + the question; exit 1 while any remain
python3 tools/check.py --only flags   # same list as a WARN row, not fatal
python3 tools/check.py --public       # flags FAIL: use before going public
```

Exit 1 from `check-flags.py` is expected while flags are open. It scans the built pages: `index.html`, `websites.html`, `privacy.html`, `404.html`, `hi/index.html`, `photography-*.html`, `projects/*.html`. It does not scan Studio (`next/`).

## Add a flag

| Page | Where | Snippet |
|---|---|---|
| Home | `src/index.html`, around the text | `<mark class="flag" data-flag="home-NNN" data-note="Question?">text</mark>` then `python3 tools/build.py` |
| Case study, rich text | `content/projects/<slug>.json`, turn the string into a list | `["before ", {"flag": "<slug>-NNN", "note": "Question?", "text": "text"}, " after"]` then build |
| Case study, a brief row value | `content/projects/<slug>.json`, `brief[].value` | `{"flag": "<slug>-NNN", "note": "Question?", "text": "text"}` then build |
| Plain pages | the page file | the `<mark>` snippet above, no build |

Id: `<page or slug>-<3 digits>`, unique. Pick the next free number:

```sh
grep -rhoE '(data-flag="|"flag": ")[a-z-]+-[0-9]+' src/index.html content *.html hi | sed -E 's/.*"//' | sort -u
```

Write `data-note` as one question the owner can answer with a word or a number. Quote marks inside it: `&quot;` in HTML, `\"` in JSON (the build escapes the note). Flags are not allowed in `title`, `eyebrow`, `description`, `og_alt`.

## Resolve a flag

1. Run `python3 tools/check-flags.py` and copy the id.
2. Find its source: `grep -rn '<id>' src/index.html content *.html hi`.
3. Apply the owner's answer:
   - Confirmed as is: remove the `<mark ...>` and `</mark>`, keep the text. In JSON replace the `{"flag": ...}` object with its text and merge it into the neighboring strings (a one-string list can become a plain string).
   - Corrected: same, with the new text.
   - Cut: remove the text and the mark. Check the sentence still reads.
4. `python3 tools/build.py` if the source was `src/index.html` or `content/`.
5. `python3 tools/check-flags.py` shows the id gone; `python3 check-writing.py <page>` is clean.
6. Commit source and built page together: `git commit -m "Resolve flag <id>: <answer>"`.

Only resolve a flag with the owner's own answer. Never guess a fact.
