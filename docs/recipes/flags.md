# Flags: open questions for the owner

A flag marks a fact or a line the owner still has to confirm. It renders in place with a dotted underline (`mark.flag` in `css/site-palette.css`) and the question shows on hover.

```html
<mark class="flag" data-flag="<block id>" data-note="<question>">text</mark>
```

## List open flags

```sh
python3 tools/check-flags.py      # prints page:line [id] "text" + the question; exit 1 while any remain
python3 tools/check.py --fast     # reports flags, not fatal
python3 tools/check.py --public   # flags are fatal: use before going public
```

Exit 1 from `check-flags.py` is expected while flags are open. It scans the built pages: `index.html`, `websites.html`, `privacy.html`, `404.html`, `hi/index.html`, `photography-*.html`, `projects/*.html`. It does not scan Studio (`next/`).

## Add a flag

| Page | Where | Snippet |
|---|---|---|
| Home | `src/index.html`, around the text | `<mark class="flag" data-flag="home-NNN" data-note="Question?">text</mark>` then `python3 tools/build.py` |
| Case study, in prose | case data in `build-case.py` | `flag("<slug>-NNN", "Question?", "text")` |
| Case study, a SpecList value | case data in `build-case.py` | `FlagValue("<slug>-NNN", "Question?", "text")` |
| Plain pages | the page file | the `<mark>` snippet above, no build |

Id: `<page or slug>-<3 digits>`, unique. Pick the next free number:

```sh
grep -rhoE '(data-flag="|(flag|FlagValue)\(")[a-z-]+-[0-9]+' src/index.html build-case.py *.html hi | sed -E 's/.*["(]//' | sort -u
```

Write `data-note` as one question the owner can answer with a word or a number. Quote marks inside it: `&quot;` in HTML, plain in Python (the helper escapes).

## Resolve a flag

1. Run `python3 tools/check-flags.py` and copy the id.
2. Find its source: `grep -rn '<id>' src build-case.py *.html hi`.
3. Apply the owner's answer:
   - Confirmed as is: remove the `<mark ...>` and `</mark>`, keep the text. In Python replace `flag("id", "note", "text")` with `"text"` (or the plain string it sat in).
   - Corrected: same, with the new text.
   - Cut: remove the text and the mark. Check the sentence still reads.
4. `python3 tools/build.py` if the source was `src/` or `build-case.py`.
5. `python3 tools/check-flags.py` shows the id gone; `python3 check-writing.py <page>` is clean.
6. Commit source and built page together: `git commit -m "Resolve flag <id>: <answer>"`.

Only resolve a flag with the owner's own answer. Never guess a fact.
