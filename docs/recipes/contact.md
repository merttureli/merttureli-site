# Contact details

Email, phone, LinkedIn and location appear on many pages. Change all of them in one commit.
The site has no resume PDF any more (the owner removed it in October 2026); do not add one back without the owner.

## Find every copy

```sh
OLD='old value'   # e.g. merttureli0@gmail.com, 838 251 9707, Austin
grep -rn --include=*.html --include=*.py --include=*.js --include=*.vcf --include=*.json -F "$OLD" . \
  | grep -v -e '^./vx/' -e node_modules -e '^./_ds/' -e vendor -e '^./index.html' -e '^./websites.html' -e 'projects/'
```

The filter hides generated pages (`index.html`, `websites.html`, `projects/`, `next/projects/`): they update when you rebuild. Phone numbers are written three ways (`+18382519707`, `+1 (838) 251-9707`, `838 251 9707`): search each.

## Where each detail lives today

| Detail | Source files |
|---|---|
| Email | `next/index.html`, `next/websites.html`, `tools/build-studio-cases.py` (case menu and footer), `404.html`, `privacy.html`, `hi/index.html`, `hi/*.vcf` (the contact card; its name is deliberately unguessable), `js/website-inquiry.js` |
| Phone | `hi/*.vcf` only. The owner's number is never shown on any page: it reaches people only through the Save contact download on `/hi/`, the page behind his business card QR code. No page links to `/hi/` or the file. |
| LinkedIn | `next/index.html`, `next/websites.html`, `tools/build-studio-cases.py`, `tools/build.py` (JSON-LD `sameAs`), `hi/index.html`, `hi/*.vcf` (the contact card; its name is deliberately unguessable) |
| Location (Austin) | `next/index.html`, `next/js/studio.js` and `next/js/case.js` (clock), `tools/build.py` (JSON-LD), `404.html`, `hi/index.html`, `hi/*.vcf` (the contact card; its name is deliberately unguessable) |

`studies/*/` are frozen design prototypes with their own copies; change them only if the owner asks. `cards/` is print artwork, not served to visitors.

## Change a detail

1. Edit every source file the search lists. Keep each file's own format (`mailto:`, `tel:+1...`, display text).
2. `hi/*.vcf` (the contact card; its name is deliberately unguessable) must keep CRLF line endings (`.gitattributes` marks it `-text`). Edit it with Python, not a text editor that may convert endings:
   ```sh
   python3 -c "import sys,glob;p=glob.glob('hi/*.vcf')[0];s=open(p,'rb').read();open(p,'wb').write(s.replace(sys.argv[1].encode(),sys.argv[2].encode()))" 'OLD' 'NEW'
   file hi/*.vcf   # still a vCard
   ```
3. `python3 tools/build.py` (the live pages are built from `next/` and `tools/build-studio-cases.py`).
4. Search again: the only hits left should be `studies/`, `cards/` and anything you chose to leave.
5. `python3 tools/check.py`, then commit.
