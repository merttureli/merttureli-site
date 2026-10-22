---
name: contact-details
description: Use when the owner's email, phone, LinkedIn, location or resume PDF changes, or when asked to update the resume on merttureli.com.
---

# Contact details and resume

Detail: `docs/recipes/contact.md`.

1. Search every copy of the old value (try each phone format: `+18382519707`, `+1 (838) 251-9707`, `838 251 9707`):
   `grep -rn --include=*.html --include=*.py --include=*.js --include=*.vcf --include=*.json -F "OLD" . | grep -v -e '^./vx/' -e node_modules -e '^./_ds/' -e vendor -e '^./index.html' -e 'projects/'`
2. Edit each source file. Skip `studies/` and `cards/` unless the owner asks.
3. `hi/mert-tureli.vcf` keeps CRLF endings: replace with the Python one-liner in the recipe, then `file hi/mert-tureli.vcf`.
4. `python3 tools/build.py` (home and case pages carry LinkedIn and location; home carries email).
5. Search again: only `studies/`, `cards/` remain.
6. Resume: overwrite `assets/Mert-Tureli-Resume.pdf`, same name. Compare its dates, titles and numbers with the site; ask the owner about any mismatch and fix the site with the `edit-copy` skill in the same commit.
7. `python3 tools/check.py --fast`, then commit.
