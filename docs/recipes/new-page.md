# Add a page or a section

## A new page

New public pages are Studio pages: the source is `next/<name>.html` and `tools/build.py`
publishes it at the root as `<name>.html`.

1. Copy the closest Studio page (`next/websites.html` for a content page) to `next/<name>.html`.
   Keep its head: `<meta name="robots" content="noindex">` and add
   `<link rel="canonical" href="https://merttureli.com/<name>.html">` right after it.
2. Add one line to `PAGES` in `tools/build.py`: `("next/<name>.html", "<name>.html"),`.
   Optional: a `LIVE["<name>.html"]` entry for its own `<title>` and share image; without one
   it keeps its own title and description and gets the home share card.
3. Write the copy (every unknown is a `<mark class="flag">`), `python3 check-writing.py next/<name>.html`.
4. `python3 tools/build.py`, then look at `<name>.html` at 390 and 1440 wide
   (`python3 -m http.server 8000 --bind 127.0.0.1`).
5. Link to it from where it belongs (the menu in `next/index.html` and the case-page `MENU_LINKS`
   in `tools/build-studio-cases.py` link `../<name>.html` from `next/`; the build re-points them).
6. Ready to be found: add `<url><loc>https://merttureli.com/<name>.html</loc><lastmod>YYYY-MM-DD</lastmod></url>` to `sitemap.xml`.
7. `python3 tools/check.py`, commit the `next/` source and the root page together.

`next/beyond.html` is already listed in `PAGES`: it becomes `beyond.html` as soon as the file exists.

### Old-design pages

`python3 tools/new.py page <name> [--style site|plain] [--title T] [--dir D] [--index] [--dry-run]`
still writes a page in the old design (the old websites chrome or the `privacy.html` column).
Use it only when the owner asks for an old-style page; it is on [../transition.md](../transition.md).

Not this command: a case study is `python3 tools/new.py project` ([add-project.md](add-project.md)).

## A new section

Prints a snippet to paste. It never edits a page.

```sh
python3 tools/new.py section talks --label Talks                 # studio (default), next free number
python3 tools/new.py section talks --site page --out /tmp/talks.html
```

| `--site` | Paste into | Markup |
|---|---|---|
| `studio` (default) | `next/index.html`, between two sections, then `python3 tools/build.py`. The CSS stub it also prints goes in `next/css/studio.css` | `.rule` label, `.display` heading with one `<em class="serif">` accent, `data-reveal` body |
| `page` | `<main>` of an old-design page made with `new.py page` | `.section-head` + `.proof-list` |

Every placeholder is a `<mark class="flag">`; replace them, then `python3 tools/check.py`.

### Where it goes and its number (Studio)

| Studio today (`next/index.html`) | Label shown |
|---|---|
| hero (`<!-- 00 HERO -->`) | none |
| the lineup (bento tiles) | `01 / Selected work` |
| experience (one line) | `02 / Experience` |
| beyond | `03 / Beyond engineering` |
| websites (dark) | `04 / Websites` |
| contact (`<!-- 05 CONTACT -->`) | none |

- `--number` defaults to the next free number (today `05`). Paste the section after `04 WEBSITES` and before the contact comment, then change that comment to the next number (`<!-- 06 CONTACT -->`); contact shows no number, so nothing visible moves.
- Going between two sections instead: give it that slot's number and add one to every later `NN /` label and `<!-- NN -->` comment.
- A body from an existing component (chips, stats, steps, doors): copy its snippet from [components.md](../design/components.md) (Studio T01 to T19, or the catalog's Copy button) into the `<div class="NAME__body" data-reveal>` the scaffold printed, replacing the `<p>`. Find the component by task in "Find by what you want to change" at the top of [catalog.html](../design/catalog.html).
- The CSS stub uses tokens only (`--space-70-140`, `--text-l`, `--ink-soft`); a dark section adds `background: var(--ink); color: var(--paper);` and `.rule--dark` (see [studio.md](../design/studio.md)).
- Nav: nothing links to the new section by itself. Add `<a href="#NAME">Label</a>` to the phone menu (`.menu`) if the owner wants it there; the top bar (`.top__nav`) holds only four links.

Old-design pages (`--site page`) number from their `NN / Label` meta; renumber the later ones the same way.

## Where the templates live

| Kind | Templates | Code |
|---|---|---|
| page | `templates/page/site.html.tmpl`, `plain.html.tmpl` | `tools/scaffold/page.py` |
| section | `templates/section/*.tmpl` | `tools/scaffold/section.py` |
| actor | `templates/actor/*.tmpl` | `tools/scaffold/actor.py` |

Placeholders are `{{NAME}}`; the tool refuses to write if one is left unfilled. Change a template when the house pattern changes, then regenerate into a copy to test: `python3 tools/new.py page test --root /tmp/copy`.
