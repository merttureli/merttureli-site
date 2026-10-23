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
python3 tools/new.py section talks --label Talks                 # studio (default), next free number
python3 tools/new.py section talks --site page --out /tmp/talks.html
python3 tools/new.py section talks --site home --number 02       # home numbers are not a sequence: say it
```

| `--site` | Paste into | Markup |
|---|---|---|
| `studio` (default) | `next/index.html`, between two sections. The CSS stub it also prints goes in `next/css/studio.css` | `.rule` label, `.display` heading with one `<em class="serif">` accent, `data-reveal` body |
| `page` | `<main>` of `websites.html` or a page made with `new.py page` | `.section-head` + `.proof-list` |
| `home` | `src/index.html` (the source; never edit root `index.html`), then `python3 tools/build.py` | design-system `Rule` + `DisplayHeading` |

Every placeholder is a `<mark class="flag">`; replace them, then `python3 tools/check.py`.

### Where it goes and its number (Studio)

| Studio today (`next/index.html`) | Label shown |
|---|---|
| hero (`<!-- 00 HERO -->`) | none |
| proof + doors | `01 / Proof, measured` |
| work, then the explorer band (unnumbered) | `02 / Selected work` |
| experience | `03 / Experience` |
| beyond | `04 / Beyond engineering` |
| websites (dark) | `05 / Websites` |
| contact (`<!-- 06 CONTACT -->`) | none |

- `--number` defaults to the next free number (today `06`). Paste the section after `05 WEBSITES` and before the contact comment, then change that comment to the next number (`<!-- 07 CONTACT -->`); contact shows no number, so nothing visible moves.
- Going between two sections instead: give it that slot's number and add one to every later `NN /` label and `<!-- NN -->` comment.
- A body from an existing component (chips, stats, steps, doors): copy its snippet from [components.md](../design/components.md) (Studio T01 to T19, or the catalog's Copy button) into the `<div class="NAME__body" data-reveal>` the scaffold printed, replacing the `<p>`. Find the component by task in "Find by what you want to change" at the top of [catalog.html](../design/catalog.html).
- The CSS stub uses tokens only (`--space-70-140`, `--text-l`, `--ink-soft`); a dark section adds `background: var(--ink); color: var(--paper);` and `.rule--dark` (see [studio.md](../design/studio.md)).
- Nav: nothing links to the new section by itself. Add `<a href="#NAME">Label</a>` to the phone menu (`.menu`) if the owner wants it there; the top bar (`.top__nav`) holds only four links.

Site pages (`--site page`) number from the `NN / Label` meta in `websites.html`; renumber the later ones the same way.

## Where the templates live

| Kind | Templates | Code |
|---|---|---|
| page | `templates/page/site.html.tmpl`, `plain.html.tmpl` | `tools/scaffold/page.py` |
| section | `templates/section/*.tmpl` | `tools/scaffold/section.py` |
| actor | `templates/actor/*.tmpl` | `tools/scaffold/actor.py` |

Placeholders are `{{NAME}}`; the tool refuses to write if one is left unfilled. Change a template when the house pattern changes, then regenerate into a copy to test: `python3 tools/new.py page test --root /tmp/copy`.
