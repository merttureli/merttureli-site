# Media: images, clips, posters

One tool makes every web derivative and prints the HTML to paste: `python3 tools/media.py`. It needs ffmpeg (libwebp, libvpx-vp9, libx264), which the container has. To replace a file that is already on a page, see [images-swap.md](images-swap.md).

## Do this

| Task | Command (add `--dry-run` to see the ffmpeg calls first) |
|---|---|
| Studio photo strip (4:5, 420 + 720) | `python3 tools/media.py image SRC --preset gallery --name dunes --out next/assets/img --page next/index.html --alt "Dunes at dusk"` |
| Studio image (600 + 1000) | `python3 tools/media.py image SRC --preset card --name balloon --out next/assets/img --page next/index.html --alt "..."` |
| Photography gallery (thumb 512 + view 1280) | `python3 tools/media.py image SRC --preset lightbox --name dunes --out assets/photos/beyond/gallery`, then add `{file:'dunes', title:'...', alt:'...'}` to the list in `js/photography-gallery.js` |
| Hero poster, landscape + portrait | `... image SRC --preset hero --name hero-land --out next/assets/img` and `... image SRC2 --preset hero-portrait --name hero-port --out next/assets/img`, then `python3 tools/media.py snippet next/assets/img/hero-land.webp --portrait next/assets/img/hero-port.webp --eager --page next/index.html` |
| Product stills from the live 3D (home tiles, spec sheets, case-page posters) | `python3 tools/stills.py` (`--list`, `--only case`): transparent WebP drawn by `next/js/case-stage.js` into `next/assets/img/stills/`; re-run after an actor or the case-stage framing changes |
| Share image (1200 x 630 PNG) | `python3 tools/media.py image SRC --preset og --name case-<slug>-v2 --out assets/og` (bump `-vN`, see [images-swap.md](images-swap.md) D) |
| Any other size set | `python3 tools/media.py image SRC --widths 640,1280 --aspect 3:2 --gravity top --name x --out DIR` |
| Transparent turntable (VP9 alpha) | `python3 tools/media.py video render.mov --name hotbox-360 --out assets/motion --page index.html --alt "..."` |
| Opaque clip (webm + mp4) | `python3 tools/media.py video clip.mp4 --name balloon-segovia --out assets/motion --cover --page index.html` |
| Rendered PNG frames | `python3 tools/media.py video 'frames/%04d.png' --fps 30 --name kaan-360 --out assets/motion` |
| Trim a clip | add `--start 2 --duration 8` |
| New poster frame only | `python3 tools/media.py poster assets/motion/kaan-360-alpha.webm --at 4 --out assets/motion --name kaan-360 --force` |
| `<img>` for files that already exist | `python3 tools/media.py snippet next/assets/img/x-420.webp next/assets/img/x-720.webp --page next/index.html --sizes "50vw"` |
| Pixels, alpha, codec, weight | `python3 tools/media.py info FILE...` |
| Find oversized, mislabeled or missing media | `python3 tools/media.py audit` (`-v` adds info items, `--json`, `--strict` exits 1 on warnings) |
| List the presets | `python3 tools/media.py presets` |

The snippet goes to stdout, the log to stderr. `--page` makes the snippet paths relative to the page you paste into; without it they are relative to the repo root.

After a case-study clip with size variants, set `"clip_sizes": [1280, 960]` in `content/projects/<slug>.json` and run `python3 tools/build.py` (the tool prints this line for you). Home and Studio pages take the pasted snippet as is.

## What the tool writes

| Kind | Files | Notes |
|---|---|---|
| Image set | `<name>-<width>.webp` | The suffix is the real pixel width. Never upscales: widths wider than the source are skipped. `--labels thumb,view` replaces the widths in the name. `--no-suffix` for a single file. |
| Alpha clip | `<name>-alpha.webm`, `<name>-1280-alpha.webm`, `<name>-960-alpha.webm`, `<name>-poster.webp` | No mp4: browsers without VP9 alpha keep the poster, which keeps its alpha. `--mp4-bg white` adds a flattened mp4 if a page needs one. |
| Opaque clip | `<name>.webm`, `<name>-1280.webm`, `<name>-960.webm`, `<name>.mp4`, `<name>-poster.webp` | `--no-mp4` skips the H.264 file. |
| Poster | `<name>-poster.webp` | Frame at `--poster-at` (default the first frame), max 1280 wide, alpha kept. |

`--widths` for video: the largest is the full file (capped at the source width), the next two are the md and sm variants. One smaller width means phones get it and wider screens get the full file.

## House settings

| Setting | Value | Why |
|---|---|---|
| WebP quality | 75, `-compression_level 6`, `-preset photo` | Rebuilds `next/assets/img/lighthouse-420/-720.webp` at the same size, SSIM 0.98 |
| Poster quality | 80 | Posters show before play and whenever motion is off |
| VP9 | `-crf 33 -b:v 0 -deadline good -cpu-used 2 -row-mt 1`, keyframe every 8 s, no audio | Matches the committed turntable bitrates (kaan 1920: 1.27 Mbps) |
| VP9 alpha | adds `-pix_fmt yuva420p -auto-alt-ref 0`, `alpha_mode=1` tag | libvpx cannot use alt-ref frames with alpha |
| H.264 | `-crf 23 -preset slow -profile:v high -movflags +faststart`, no audio | Starts playing before it is fully downloaded |
| Video sizes | full (max 1920), 1280, 960 | `js/media-playback.js` serves `data-src-sm` at 720 px and below, `data-src-md` above |
| Image metadata | stripped, EXIF orientation applied | No GPS in published files; phone photos come out upright |

Override per run with `--quality`, `--crf`, `--mp4-crf`, `--fps`, `--speed` (libvpx `-cpu-used`, higher is faster), `--threads`.

## Audit checks

| Check | Level | Meaning |
|---|---|---|
| `oversized` | warn | Image over 300 KB, poster over 120 KB, full video over 4 MB, video variant over 2.5 MB |
| `suffix-mismatch` | warn | The `-NNN` in the name is not the real width (suffixes under 400, like `-360`, are names) |
| `no-webp` | warn | A page loads a JPG or PNG over 150 KB with no WebP next to it |
| `no-poster` | warn | A video family has no `<family>-poster.webp` |
| `no-variants` | warn | A webm wider than 1280 has no smaller sizes |
| `missing-file` | warn | An html/css media reference points at nothing |
| `srcset-width` | warn | A `srcset` `NNNw` descriptor is not the file's width |
| `never-served` | info | A full-size clip that every page declares next to `data-src-md`, so no browser fetches it |
| `unreferenced`, `mp4-only`, `huge-pixels` | info | No page names it; mp4 with no webm; wider than 2560 |

Findings under `studies/` (frozen prototypes) and files no page loads are reported as info. Scan other folders with `--path DIR` (repeatable).

## Gotchas

- ffmpeg's built-in VP9 decoder drops the alpha plane and reports alpha webms as opaque. The tool decodes them with `-c:v libvpx-vp9`. If you run ffmpeg by hand, put `-c:v libvpx-vp9` before `-i`.
- Outputs newer than the source are skipped. After changing options (crop, widths, trim, quality), add `--force`.
- A source smaller than the preset makes fewer files, named by their real width. Read the log line `not upscaling to ...`.
- The tool never edits pages, `content/` or `tools/build-studio-cases.py`. Paste the snippet, then run `python3 tools/check.py`.
- Pages load only the derivatives; sources (PSD, ProRes, PNG frames) do not need to be committed.
