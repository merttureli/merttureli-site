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

Exit 1 from `check-flags.py` is expected while flags are open. It scans every served `.html` git would commit, the `next/` sources included; it skips `tools/`, `templates/`, `docs/`, `_ds/`, `cards/` and `.claude/`. It parses the HTML properly, so a note may contain `<`, `>` or markup.

## Add a flag

| Page | Where | Snippet |
|---|---|---|
| Home, websites | `next/index.html`, `next/websites.html`, around the text | `<mark class="flag" data-flag="home-NNN" data-note="Question?">text</mark>` then `python3 tools/build.py` |
| Case study | `content/projects/<slug>.json`, inside the string (lede, paragraph, list item, brief value) | the same `<mark>` HTML, `\"` for the quotes, then build. The Studio build does not read `{"flag": ...}` objects |
| Old-design pages | the page file | the `<mark>` snippet above, no build |

Id: `<page or slug>-<3 digits>`, unique. Get the next free one (scans sources and built pages):

```sh
python3 tools/check-flags.py --next-id rudder-pedals    # prints rudder-pedals-036
python3 tools/check-flags.py --next-id home
```

No related text on the page yet (the owner asks about something the page never mentions)? Put the flag at the end of
the closest paragraph, with no `text`: it shows `[TBD]` in place until the owner answers.

| Source | Snippet |
|---|---|
| Case JSON paragraph `"Text."` | `"Text. <mark class=\"flag\" data-flag=\"<slug>-NNN\" data-note=\"Confirm the pedal travel angle\">[TBD]</mark>"` |
| HTML | `Text. <mark class="flag" data-flag="home-NNN" data-note="...">[TBD]</mark>` |

Write `data-note` as one question the owner can answer with a word or a number. If the owner gave the wording, keep it verbatim. Quote marks inside it: `&quot;` in HTML, `\"` in JSON (the build escapes the note). Flags are not allowed in `title`, `eyebrow`, `description`, `og_alt`.

## Resolve a flag

1. Run `python3 tools/check-flags.py` and copy the id.
2. Find its source: `grep -rn '<id>' next/index.html next/websites.html content *.html hi` (a hit in a generated page means its source).
3. Apply the owner's answer:
   - Confirmed as is: remove the `<mark ...>` and `</mark>`, keep the text.
   - Corrected: same, with the new text.
   - Cut: remove the text and the mark. Check the sentence still reads.
4. `python3 tools/build.py` if the source was in `next/` or `content/`.
5. `python3 tools/check-flags.py` shows the id gone; `python3 check-writing.py <page>` is clean.
6. Commit source and built page together: `git commit -m "Resolve flag <id>: <answer>"`.

Only resolve a flag with the owner's own answer. Never guess a fact.
