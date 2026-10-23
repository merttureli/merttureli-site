---
name: resolve-flags
description: Use when the owner answers an open copy question, asks what is still flagged, asks to add a question for the owner, or before the site goes public. Covers <mark class="flag"> placeholders listed by tools/check-flags.py.
---

# Resolve or add flags

Detail: `docs/recipes/flags.md`.

List:
1. `python3 tools/check-flags.py` (exit 1 while any flag is open; that is expected). Show the owner each `[id] "text"` and question.

Resolve (only with the owner's own answer, never a guess):
1. `grep -rn '<id>' next/index.html next/websites.html content *.html hi` to find the source (a generated page means its source).
2. Confirmed: remove the `<mark ...>`/`</mark>` and keep the text. Corrected: same with the new text. Cut: remove text and mark, reread the sentence.
3. `python3 tools/build.py` if the source was in `next/` or `content/`.
4. `python3 tools/check-flags.py` no longer lists the id; `python3 check-writing.py <page>` is clean.
5. Commit source and built page: `git commit -m "Resolve flag <id>: <answer>"`.

Add:
1. Next free id: `python3 tools/check-flags.py --next-id <slug or page>` (e.g. `--next-id rudder-pedals` prints `rudder-pedals-036`).
2. `<mark class="flag" data-flag="home-NNN" data-note="Question?">text</mark>`, in HTML or inside a case JSON string (escape the quotes as `\"`; the Studio build does not read `{"flag": ...}` objects).
   No text on the topic yet? Use `[TBD]` as the text at the end of the closest paragraph; see flags.md "Add a flag". Keep the owner's own wording for the note.
3. Build if needed, then `python3 tools/check-flags.py` lists it.
