# UI kit — merttureli.com

A four-surface click-through of the personal site. Open `index.html`.

| File | Surface |
| --- | --- |
| `HomeScreen.jsx` | Full-bleed photographic hero with a three-slide rotator, statement block, selected work |
| `WorkScreen.jsx` | The mixed index — every project in one numbered list, discipline as a note; hovering a row floats its image at the right edge |
| `ProjectScreen.jsx` | Project detail: photographic hero, lead + body, spec sidebar, image pair, dark pull-quote plate, next project |
| `AboutScreen.jsx` | About and Contact (same screen, `contact` prop swaps the heading) |
| `Plate.jsx` | `Plate` — the photographic stand-in, and `Reveal` — the scroll-in wrapper |
| `data.js` | All copy and project metadata |

## Photography

Every image in the kit is a **grey gradient plate with grain**, not a real photograph — no photography was supplied. Drop real files into `assets/photography/` and pass `src` to `Plate`:

```jsx
<Plate src="../../assets/photography/wing-rib.jpg" scrim="var(--scrim-hero)" />
```

The plates are deliberately neutral so that swapping in warm or cool imagery does not break the page.

## What is faked

Navigation is React state, not routing. The hero rotator advances on click only (no autoplay — that is a decision, not an omission). Forms, filtering and the menu button are inert.
