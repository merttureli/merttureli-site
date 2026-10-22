# Add a page or a section

## A new page

```sh
python3 tools/new.py page speaking --title "Speaking" --dry-run
python3 tools/new.py page speaking --title "Speaking"
```

| Option | Meaning |
|---|---|
| `<name>` | kebab-case; writes `<name>.html` at the repo root |
| `--title` | `<title>` and the h1 (default: from the name) |
| `--description` | meta description (default: a placeholder to replace) |
| `--style site` | default. The `websites.html` chrome: header, phone menu, sections, dark footer with the display control, analytics |
| `--style plain` | the `privacy.html` layout: one readable column, no chrome |
| `--dir notes` | writes `notes/<name>.html` and fixes the relative links. Refuses `next/`, `studies/`, `projects/`, `src/` |
| `--index` | leave out `robots noindex` (default pages start hidden from search) |
| `--dry-run`, `--force`, `--root DIR` | print only, overwrite, write into a copy |

Then:

1. Replace every `<mark class="flag">` placeholder with real copy and remove the mark. `python3 check-writing.py speaking.html`
2. Look at it at 390 and 1440 wide: `python3 -m http.server 8000 --bind 127.0.0.1`, open `http://127.0.0.1:8000/speaking.html`.
3. Link to it from where it belongs. Nothing links to a new page by itself.
4. Ready to be found: delete the `robots noindex` line and add `<url><loc>https://merttureli.com/speaking.html</loc><lastmod>YYYY-MM-DD</lastmod></url>` to `sitemap.xml`.
5. `python3 tools/check.py`

Not this command: a case study is `python3 tools/new.py project` ([add-project.md](add-project.md)). Studio pages live in `next/` and are edited by hand ([studio-edit.md](studio-edit.md)).

## A new section

Prints a snippet to paste. It never edits a page.

```sh
python3 tools/new.py section talks --site studio --number 07 --label Talks
python3 tools/new.py section talks --site page --out /tmp/talks.html
```

| `--site` | Paste into | Markup |
|---|---|---|
| `studio` (default) | `next/index.html`, between two sections. The CSS stub it also prints goes in `next/css/studio.css` | `.rule` label, `.display` heading with one `<em class="serif">` accent, `data-reveal` body |
| `page` | `<main>` of `websites.html` or a page made with `new.py page` | `.section-head` + `.proof-list` |
| `home` | `src/index.html` (the source; never edit root `index.html`), then `python3 tools/build.py` | design-system `Rule` + `DisplayHeading` |

Every placeholder is a `<mark class="flag">`; replace them, renumber the sections after it if the numbers are visible, then `python3 tools/check.py`.

## Where the templates live

| Kind | Templates | Code |
|---|---|---|
| page | `templates/page/site.html.tmpl`, `plain.html.tmpl` | `tools/scaffold/page.py` |
| section | `templates/section/*.tmpl` | `tools/scaffold/section.py` |
| actor | `templates/actor/*.tmpl` | `tools/scaffold/actor.py` |

Placeholders are `{{NAME}}`; the tool refuses to write if one is left unfilled. Change a template when the house pattern changes, then regenerate into a copy to test: `python3 tools/new.py page test --root /tmp/copy`.
