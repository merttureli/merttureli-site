---
name: contact-details
description: Use when the owner's email, phone, LinkedIn or location changes on merttureli.com. (The site has no resume PDF since October 2026.)
---

# Contact details

Detail: `docs/recipes/contact.md`.

1. Search every copy of the old value (try each phone format: `+18382519707`, `+1 (838) 251-9707`, `838 251 9707`):
   `grep -rn --include=*.html --include=*.py --include=*.js --include=*.vcf --include=*.json -F "OLD" . | grep -v -e '^./vx/' -e node_modules -e '^./_ds/' -e vendor -e '^./index.html' -e '^./websites.html' -e 'projects/'`
2. Edit each source file. Skip `studies/` and `cards/` unless the owner asks.
3. `hi/mert-tureli.vcf` keeps CRLF endings: replace with the Python one-liner in the recipe, then `file hi/mert-tureli.vcf`.
4. `python3 tools/build.py` (the live home, websites and case pages are built from `next/`, `tools/build-studio-cases.py` and `tools/build.py`).
5. Search again: only `studies/`, `cards/` remain.
6. The owner removed the resume PDF: do not add a resume link or file back unless he asks.
7. `python3 tools/check.py`, then commit.
