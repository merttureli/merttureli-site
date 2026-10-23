# visual-regress

Screenshot diff harness for the site. It serves two copies of the site, a
baseline and a candidate, on two local ports. It screenshots every page at
every width and palette in both copies and diffs each pair with pixelmatch.

## Setup

```sh
cd tools/visual-regress
npm install            # pixelmatch@5 and pngjs@7, nothing else
```

Playwright is not installed here. The script loads it from
`/opt/node22/lib/node_modules/playwright` by default. Pass
`--playwright <path>` to use another install. Chromium must be available to
that Playwright.

## Run

```sh
# baseline = a clean export of HEAD, candidate = the working tree
git archive HEAD | tar -x -C /tmp/site-head
node tools/visual-regress/visual-regress.js \
  --baseline /tmp/site-head --candidate . --out /tmp/regress-out
```

Open `<out>/index.html` for the contact sheet. `<out>/report.json` holds the
same data in machine-readable form.

| option | default | meaning |
| --- | --- | --- |
| `--baseline DIR` | required | site root served as the reference |
| `--candidate DIR` | required | site root under test |
| `--out DIR` | `./out` | report, screenshots and diff images. The directory is wiped first. |
| `--ports A,B` | `8930,8931` | ports for baseline and candidate, on 127.0.0.1 |
| `--pages LIST` | `index.html,websites.html,privacy.html,404.html,hi/index.html,projects/*.html` | `*` globs within one directory, taken from both roots |
| `--widths LIST` | `390,860,1440,1920` | viewport widths. Heights are 844, 1180, 900 and 1080. |
| `--palettes LIST` | `original,slate` | written to `localStorage['mert-portfolio-palette-v1']` by an init script |
| `--date ISO` | `2026-10-21T12:00:00Z` | the frozen clock (`context.clock.setFixedTime`). The daily palette reads it. |
| `--mask LIST` | `photo-corridor` | CSS selectors painted magenta in every screenshot. The photography corridor is a live 3D scene whose resting pose depends on frame timing. Pass `--mask ""` to include it. |
| `--threshold N` | `0.1` | pixelmatch per-pixel colour threshold |
| `--concurrency N` | `4` | page/width/palette jobs run in parallel |
| `--no-retry` | off | by default a differing pair is shot again and the second result is kept, which removes most timing flakes |
| `--strict` | off | exit 1 if any screen differs or any gate changes |

## What a capture does

1. It opens a fresh browser context with `reducedMotion: 'reduce'` and
   blocks `clarity.ms`, `bing.com`, `workers.dev` and `formspree.io`. It
   freezes `Date` and seeds the palette.
2. It loads the page with `waitUntil: 'networkidle'` and waits for
   `document.fonts.ready`. It scrolls through the page once so that
   scroll-triggered reveals and lazy images resolve, then returns to the
   top.
3. It waits for network idle again. Every `<img>`, including those in open
   shadow roots, is switched to eager loading and awaited (8 s cap). Every
   `<video>` is paused, loses `autoplay` and is reset with `load()`, so it
   shows its poster and not whatever frame it reached. A lazy poster
   (`data-poster`) is applied first and awaited, like a lazy image. Then it takes a
   full-page screenshot with CSS animations disabled and the `--mask`
   selectors painted over.

## Gates

These are reported per page. Values are aggregated across all widths and
palettes, and baseline is compared with candidate.

- **External requests**: any request whose origin is not the local server,
  grouped by host. Blocked hosts still appear, flagged `blocked: true`, so a
  page that tries to reach analytics shows up even though nothing leaves the
  machine.
- **h1 count**: the number of `<h1>` elements, including those inside open
  shadow roots.
- **Console errors**: `console.error` messages and uncaught page errors.
  Failed loads of the deliberately blocked hosts are counted separately as
  `blockedNoise`, not as errors.

## Reading a diff

A pair whose page heights differ is padded with magenta, so every pixel past
the shorter page counts as changed. `bbox` is the bounding box of the
changed pixels in page coordinates. It shows whether a change sits in the
header, the hero or further down the page.

Because every video is reset to its poster, adding or removing `autoplay`
cannot show up as a pixel difference. Check that in the HTML diff instead.
Under reduced motion, `js/media-playback.js` plays nothing and the Display
control sets `html[data-motion="off"]`, which stops CSS transitions and
animations. Changes that only add motion hooks therefore do not show up here.
CSS-only effects keyed on those hooks, such as `.depth-hero::before`, still
show.
