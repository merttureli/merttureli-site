# Page titles, descriptions, share images, indexing

## Where each page's head lives

| Page | Edit | Has |
|---|---|---|
| Home | `src/index.html` head, then `python3 tools/build.py` | title, description, canonical, Open Graph, Twitter card |
| Case studies | `content/projects/<slug>.json` (`title`, optional `seo_title`, `description`, `og_alt`); the head template is in `build-case.py`. Then `python3 tools/build.py` | same, `og:type` article, image `assets/og/case-<slug>-v1.png` |
| `websites.html` | the file head | same as home |
| `hi/index.html` | the file head | same, plus `noindex` |
| `privacy.html`, `404.html` | the file head | title, `noindex` |
| `photography-lab.html`, `photography-gallery.html` | redirect stubs to the Studio Beyond page (`next/beyond.html`) | `noindex`, canonical, meta refresh |
| Studio `next/index.html` | the file head | title, description, `noindex` |

A case page's `<title>` is `seo_title` if set, else `title`, plus ` · Mert Tureli`. The same `description` feeds `<meta name="description">` and `og:description`.

## Change a title or description

1. Edit it in the place above. Keep `og:title`/`og:description` in step with `<title>`/`description` on plain pages (they are written twice).
2. Description: one or two plain sentences, facts only, under about 160 characters for search results.
3. `python3 tools/build.py` for home or a case page, then `python3 check-writing.py <page>`.

## Share images (`assets/og/`)

1200 x 630 PNG, named `<page>-v<N>.png` (`cover-v1.png` is home). To replace one, write the next version and change the reference: crawlers cache by URL. Details in [images-swap.md](images-swap.md) route D. Test a card after release with the platform's debugger (LinkedIn Post Inspector, for example).

## Indexing

| What | File | Rule |
|---|---|---|
| Public page list | `sitemap.xml` | One `<url>` per indexable page. Bump `<lastmod>` when a page's content changes, at release ([release.md](release.md)). |
| Crawl rules | `robots.txt` | `next/`, `studies/`, `src/`, `tools/`, `cards/` stay `Disallow`ed. |
| Per page | `<meta name="robots" content="noindex">` | Every page not in the sitemap: `privacy`, `404`, `hi/`, the photography redirect stubs, Studio, studies. |
| Preview hosts | `_headers` | `noindex` for Cloudflare `*.pages.dev` previews. GitHub Pages ignores it. |

A new public page needs: a `<url>` in `sitemap.xml`, a canonical link, an `og:image`, and no `noindex`. A new private page needs `noindex` and no sitemap entry. `python3 tools/new.py page <name>` writes the head for you, `noindex` by default; add `--index` for a public page ([new-page.md](new-page.md)).

## Icons

`assets/icons/`: `favicon.ico`, `favicon.svg`, `apple-touch-icon.png`, `icon-512.png`, plus `/favicon.ico` at the repo root for browsers that ask for it there. Replace files in place with the same size and name.

## Verify

```sh
python3 tools/check.py           # includes robots/noindex/sitemap sanity and link checks
```
