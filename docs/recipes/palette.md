# Palettes: tweak one, add one, change the default

The current site has four palettes (Original, Card green, Slate, Warm) plus Daily, which picks one per day. Visitors choose in the Display control in the footer and the phone menu. Studio (`next/`) has no palettes.

## Where a palette lives

| Part | File | What |
|---|---|---|
| Color ramp | `css/site-palette.css`, block `html[data-card-theme="<name>"] { ... }` | `--ink-900` to `--ink-050`, `--paper`, `--board`, alpha steps `--ink-a*` and `--paper-a*`, `--accent`, `--accent-contrast` |
| Depth backdrop | same block | `--depth-stage-hi/mid/lo`, `--depth-panel-a/b` |
| Smoke shader | same block | `--smoke-0` to `--smoke-3` (6 digit hex only; `js/shader-bg.js` reads them, Original uses its built-in blue) |
| Photo corridor | same block | `--corridor-bg`, `--corridor-paper`, `--corridor-muted` |
| Component fixes | rules right after the block, `html[data-card-theme="<name>"] .depth-hero` etc. | hero gradient, `.on-dark` accent, CHARGER launch cue |
| Name, label, swatch | `js/site-palette.js`: `names`, `labels`, `swatches` | the button in the Display control |
| Original overrides | top of `css/site-palette.css` | `--text-meta` contrast fix for Original |

Token names and their meaning: [../design/site-tokens.md](../design/site-tokens.md).

## Look at a palette

Serve the repo (`python3 -m http.server 8000 --bind 127.0.0.1`), open a page and run in the browser console:

```js
localStorage.setItem('mert-portfolio-palette-v1', 'green'); location.reload();
```

Or click it in the footer Display control. Values: `original`, `green`, `slate`, `warm`, `daily`.

## Tweak a color

1. Edit the value in the palette's block in `css/site-palette.css`. Change the matching `rgba(...)` alpha steps if you change `--ink-900` or `--paper` (they are the same color at set alphas).
2. If you change `--paper` or `--ink-900`, update that palette's swatch in `js/site-palette.js` (`split(paper, ink)`) and the `daily` conic gradient if it uses it.
3. Check contrast (below).

## Add a palette

1. Copy the whole `html[data-card-theme="warm"] { ... }` block and its follow-up rules in `css/site-palette.css`; rename to the new name and set every value.
2. In `js/site-palette.js` add the name to `names`, a label to `labels`, a swatch to `swatches`.
3. Adding to `names` changes which palette Daily shows on a given day (it is `day % names.length`). Tell the owner.
4. Check contrast, then run visual regress with the new name (below).

## Change the default

The default is `'original'` in `js/site-palette.js` (`let palette = ... : 'original'`). Changing it changes what every new visitor sees: owner decision only. The Original overrides at the top of `css/site-palette.css` apply when no palette is set.

## Contrast rule

Meta text (`--ink-400`) must hold at least 4.75:1 on `--paper`, `--ink-050` and `--depth-panel-b`. Body text and on-dark text at least 4.5:1. Check a pair:

```sh
python3 -c "
import sys
def L(h):
    c=[int(h[i:i+2],16)/255 for i in (1,3,5)]
    c=[x/12.92 if x<=0.04045 else ((x+0.055)/1.055)**2.4 for x in c]
    return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2]
a,b=sorted((L(sys.argv[1]),L(sys.argv[2])),reverse=True);print(round((a+0.05)/(b+0.05),2))
" '#4e5d51' '#e4e8dc'
```

## Verify

```sh
python3 tools/check.py --fast
git archive HEAD | tar -x -C /tmp/site-head      # baseline once
node tools/visual-regress/visual-regress.js --baseline /tmp/site-head --candidate . \
  --out /tmp/regress-palette --pages index.html,websites.html --palettes <name>
```

Open `/tmp/regress-palette/index.html`. A tweak should differ only where the color is used. A new palette has no baseline: look at the candidate shots.
