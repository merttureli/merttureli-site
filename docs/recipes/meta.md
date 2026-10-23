# Page titles, descriptions, share images, indexing

## Where each page's head lives

| Page | Edit | Has |
|---|---|---|
| Home | description and canonical: `next/index.html` head. Title, share card, JSON-LD (Person: Deployment Engineer at Base Power Company): `LIVE["index.html"]` in `tools/build.py`. Then `python3 tools/build.py` | title, description, canonical, icons, Open Graph, Twitter card, JSON-LD, analytics + Clarity |
| Case studies | `content/projects/<slug>.json` (`title`, optional `seo_title`, `description`, `og_alt`); the live head is `case_live()` and `live_head()` in `tools/build.py`. Then `python3 tools/build.py` | same, `og:type` article, image `assets/og/case-<slug>-v1.png` |
| Websites | description and canonical: `next/websites.html` head; title and share card: `LIVE["websites.html"]` in `tools/build.py` | same as home without JSON-LD and Clarity |
| Another Studio page | its `next/` head; optional `LIVE` entry in `tools/build.py` | same as websites |
| `hi/index.html` | the file head | same, plus `noindex` |
| `privacy.html`, `404.html`, `photography-lab.html` | the file head | title, `noindex` |
| `next/*.html` (the sources) | the file head | `noindex` and a canonical to the live twin; the build drops the `noindex` on the live copy |

A case page's `<title>` is `seo_title` if set, else `title`, plus ` · Mert Tureli`. The same `description` feeds `<meta name="description">` and `og:description`.

## Change a title or description

1. Edit it in the place above. Keep `og:title`/`og:description` in step with `<title>`/`description` on plain pages (they are written twice).
2. Description: one or two plain sentences, facts only, under about 160 characters for search results.
3. `python3 tools/build.py` for a page built from `next/`, then `python3 check-writing.py <page>`.

## Share images (`assets/og/`)

1200 x 630 PNG, named `<page>-v<N>.png` (`cover-v1.png` is home). To replace one, write the next version and change the reference: crawlers cache by URL. Details in [images-swap.md](images-swap.md) route D. Test a card after release with the platform's debugger (LinkedIn Post Inspector, for example).

## Indexing

| What | File | Rule |
|---|---|---|
| Public page list | `sitemap.xml` | One `<url>` per indexable page. Bump `<lastmod>` when a page's content changes, at release ([release.md](release.md)). |
| Crawl rules | `robots.txt` | `next/` pages (`/next/*.html`) and `/next/lab/`, `studies/` (except `studies/shared/`), `tools/`, `cards/` stay `Disallow`ed. `next/css`, `next/js`, `next/assets` and `studies/shared/` stay crawlable: the live pages render from them (the robots check FAILs if a sitemap page loads a blocked file). |
| Per page | `<meta name="robots" content="noindex">` | Every page not in the sitemap: `privacy`, `404`, `hi/`, `photography-lab`, `next/` sources, studies. |
| Preview hosts | `_headers` | `noindex` for Cloudflare `*.pages.dev` previews. GitHub Pages ignores it. |

A new public page needs: a `<url>` in `sitemap.xml`, a canonical link, an `og:image`, and no `noindex`. A new private page needs `noindex` and no sitemap entry. A new Studio page gets its live head from `tools/build.py` ([new-page.md](new-page.md)).

## Icons

`assets/icons/`: `favicon.ico`, `favicon.svg`, `apple-touch-icon.png`, `icon-512.png`, plus `/favicon.ico` at the repo root for browsers that ask for it there. Replace files in place with the same size and name.

## Verify

```sh
python3 tools/check.py           # includes robots/noindex/sitemap sanity and link checks
```
