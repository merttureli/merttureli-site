---
name: resolve-flags
description: Use when the owner answers an open copy question, asks what is still flagged, asks to add a question for the owner, or before the site goes public. Covers <mark class="flag"> placeholders listed by tools/check-flags.py.
---

# Resolve or add flags

Detail: `docs/recipes/flags.md`.

List:
1. `python3 tools/check-flags.py` (exit 1 while any flag is open; that is expected). Show the owner each `[id] "text"` and question.

Resolve (only with the owner's own answer, never a guess):
1. `grep -rn '<id>' src/index.html build-case.py content *.html hi 2>/dev/null` to find the source.
2. Confirmed: remove the `<mark ...>`/`</mark>` and keep the text. In Python replace `flag("id", "note", "text")` or `FlagValue("id", "note", "text")` with `"text"`. Corrected: same with the new text. Cut: remove text and mark, reread the sentence.
3. `python3 tools/build.py` if the source was `src/` or case data.
4. `python3 tools/check-flags.py` no longer lists the id; `python3 check-writing.py <page>` is clean.
5. Commit source and built page: `git commit -m "Resolve flag <id>: <answer>"`.

Add:
1. Next free id: `grep -rhoE '(data-flag="|(flag|FlagValue)\(")[a-z-]+-[0-9]+' src/index.html build-case.py *.html hi | sed -E 's/.*["(]//' | sort -u`
2. HTML: `<mark class="flag" data-flag="home-NNN" data-note="Question?">text</mark>`. Case data: `flag("<slug>-NNN", "Question?", "text")`.
3. Build if needed, then `python3 tools/check-flags.py` lists it.
