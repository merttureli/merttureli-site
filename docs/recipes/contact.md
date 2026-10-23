# Contact details and the resume

Email, phone, LinkedIn, location and the resume PDF appear on many pages. Change all of them in one commit.

## Find every copy

```sh
OLD='old value'   # e.g. merttureli0@gmail.com, 838 251 9707, Austin
grep -rn --include=*.html --include=*.py --include=*.js --include=*.vcf --include=*.json -F "$OLD" . \
  | grep -v -e '^./vx/' -e node_modules -e '^./_ds/' -e vendor -e '^./index.html' -e 'projects/'
```

The filter hides generated pages (`index.html`, `projects/`, `src/projects/`): they update when you rebuild. Phone numbers are written three ways (`+18382519707`, `+1 (838) 251-9707`, `838 251 9707`): search each.

## Where each detail lives today

| Detail | Source files |
|---|---|
| Email | `src/index.html`, `404.html`, `privacy.html`, `websites.html`, `hi/index.html`, `hi/mert-tureli.vcf`, `js/mobile-nav.js`, `js/website-inquiry.js`, `next/index.html` |
| Phone | `hi/index.html`, `hi/mert-tureli.vcf` (and print cards in `cards/cards.html`) |
| LinkedIn | `src/index.html`, `build-case.py` (case footer), `hi/index.html`, `hi/mert-tureli.vcf`, `next/index.html` |
| Location (Austin) | `src/index.html`, `404.html` (foot), `websites.html`, `hi/index.html`, `hi/mert-tureli.vcf`, `next/index.html`, `next/js/studio.js` (clock text) |
| Resume link | `src/index.html`, `js/mobile-nav.js`, `next/index.html` |

`studies/*/` are frozen design prototypes with their own copies; change them only if the owner asks. `cards/` is print artwork, not served to visitors.

## Change a detail

1. Edit every source file the search lists. Keep each file's own format (`mailto:`, `tel:+1...`, display text).
2. `hi/mert-tureli.vcf` must keep CRLF line endings (`.gitattributes` marks it `-text`). Edit it with Python, not a text editor that may convert endings:
   ```sh
   python3 -c "import sys;p='hi/mert-tureli.vcf';s=open(p,'rb').read();open(p,'wb').write(s.replace(sys.argv[1].encode(),sys.argv[2].encode()))" 'OLD' 'NEW'
   file hi/mert-tureli.vcf   # still a vCard
   ```
3. `python3 tools/build.py` (the home page carries email, LinkedIn and location; the case pages carry LinkedIn and location).
4. Search again: the only hits left should be `studies/`, `cards/` and anything you chose to leave.
5. `python3 tools/check.py`, then commit.

## Swap the resume

1. Overwrite `assets/Mert-Tureli-Resume.pdf` with the new PDF. Keep the name: every link points at it and `js/track.js` counts downloads by it.
2. Check facts the site also states (dates, team sizes, titles) match the new PDF. If they differ, ask the owner which is right, then update the site with [copy.md](copy.md) in the same commit.
3. `git add assets/Mert-Tureli-Resume.pdf && git commit -m "Update the resume"`.

Browsers and GitHub Pages may serve the old PDF for about ten minutes after release.
