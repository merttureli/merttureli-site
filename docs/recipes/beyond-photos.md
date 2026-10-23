# Beyond page: add, reorder or remove a photo

The Studio Beyond page (`next/beyond.html`) shows photography, film and piloting. Its photo grid and the
full-screen viewer read one JSON list in that file: `<script type="application/json" id="beyond-photos">`.
One line per photo, in page order. Nothing else to edit: `next/js/beyond.js` builds the grid, the viewer,
the count and the sizes.

## Add a photo (one line)

```sh
python3 tools/media.py image ~/Drive/dunes.jpg --preset beyond --name dunes --out next/assets/img/beyond \
  --alt "Dunes at dusk"
```

It writes `next/assets/img/beyond/dunes-480/-960/-1280/-1920.webp` (never upscaled, source aspect kept, EXIF
stripped) and prints the line to paste into the list:

```json
{"name": "dunes", "w": 1920, "h": 1280, "alt": "Dunes at dusk", "caption": ""},
```

| Field | Meaning |
|---|---|
| `name` | file base name in `next/assets/img/beyond/`; also the link `beyond.html#photo-dunes` |
| `w`, `h` | the largest file's pixels (the tool prints them; do not guess) |
| `alt` | what is in the photo, for screen readers and the viewer's line. Owner's words only |
| `caption` | optional short label, `Place / Kind` (`Segovia / Aerial`); empty shows only the number |

The last entry has no trailing comma. Then check it: `python3 tools/check.py --fast` (the `json` row parses the
list) and open `next/beyond.html` at 390 and 1440 wide.

## Layout rules (automatic)

- Columns: 4 on desktop, 3 under 1101px, 2 under 761px. A tile is one 4:5 cell; a landscape photo
  (wider than 1.2:1) takes two cells. Tiles crop to fill; the viewer always shows the whole photo.
- Rows always fill: a landscape that does not fit the rest of a row widens the photo before it; the last row
  widens its photos up to twice their width and centers what is left. Order never changes.
- Reorder: move lines. Remove: delete the line (and the four files).

## The viewer

Click or Enter on a photo: it grows out of its tile with no page load. Arrow keys, Home/End, the arrow
buttons or a swipe move; Esc, Close, the back button, a click beside the photo or a swipe down close it, and
focus goes back to the photo. Reduced motion skips the growing and sliding. Motion uses `--dur-700`,
`--dur-500`, `--dur-250`, `--dur-400` and `--ease` from `next/css/tokens.css`.

## Retired pages

`photography-lab.html` and `photography-gallery.html` are redirect stubs (noindex, canonical, meta refresh) to
`next/beyond.html#photography`. When the next/ pages get their root twins, change `next/beyond.html` to
`beyond.html` in both stubs. The live home corridor (`js/photography-loader.js`) no longer fetches
`photography-gallery.html`; its markup is inlined in the loader.
