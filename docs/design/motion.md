# Motion system (both sites)

House rules for anything that moves on merttureli.com (current site) and `next/` (Studio). Tokens: Studio in
`next/css/tokens.css`, current site in `_ds/.../tokens/motion.css` (see `docs/design/site-tokens.md`).

## Rules

1. Decelerate. Things arrive fast and settle slowly. No bounce or elastic, except the magnetic button return.
2. Move only `transform`, `opacity`, `filter` (and `translate`/`scale`). Never animate layout (width, top, margin).
   The one exception is the Studio experience row `padding` on hover.
3. Content is visible at rest. A reveal starts from a visible state (`opacity: .35`), so screenshots, print and
   no-JS show everything.
4. Hover lives in `@media (hover: hover)`, and the same look is applied on `:focus-visible`.
5. Reduced motion means a still, finished frame, never a blank one: posters stay, reveals are skipped, loops stop.
6. One `requestAnimationFrame` loop per page owns scroll-linked motion. Anything that draws (canvas, WebGL)
   stops when it is off screen or the tab is hidden, and draws nothing while nothing changes.
7. Use a token for every duration and easing. A new one-off value needs a reason in a comment.

## Easing

| Token | Curve | Use |
|---|---|---|
| Studio `--ease` | `cubic-bezier(.16, 1, .3, 1)` | everything by default: hovers, fills, panels, reveals |
| Studio `--ease-io` | `cubic-bezier(.65, 0, .35, 1)` | back-and-forth loops (drift word float) |
| Studio `--ease-back` | `cubic-bezier(.34, 1.56, .64, 1)` | magnetic button springing back (JS only) |
| Studio `linear` | | opacity crossfades of media (poster to canvas, hero shadow) |
| Site `--ease-out` | `cubic-bezier(0.22, 1, 0.36, 1)` | everything on the current site |
| Site `--ease-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` | same curve as Studio `--ease-io` |
| Site `--ease-linear` | `linear` | |

JS easing (3D, scroll): `next/js/showreel/engine.js` exports `ease.*`, `win(t, a, b)` (0..1 window), `lerp`,
`clamp01`. Pick by job:

| Function | Job |
|---|---|
| `ease.outCubic`, `outQuart`, `outQuint` | arrive and settle (parts flying in, rocket gliding back) |
| `ease.inCubic`, `inQuad` | leave and accelerate (parts flying out) |
| `ease.inOutSine`, `inOutCubic` | change of state in place (assemble, warm, chill) |
| `ease.land` | something set down (mug, can) |
| `t * t * (3 - 2 * t)` (smoothstep) | current site JS (`rocket-flight.js`, photography dissolve) |

## Durations

Studio (`next/css/tokens.css`). Pick the row by role, not by feel:

| Token | Value | Role (where it is used now) |
|---|---|---|
| `--dur-250` | .25s | quick fade (hero shadow); magnetic follow (JS) |
| `--dur-300` | .3s | color/background tint (menu button, menu link, row) |
| `--dur-400` | .4s | color change on cards and buttons (project title, door button, `.btn`) |
| `--dur-450` | .45s | menu icon lines morph |
| `--dur-500` | .5s | small UI state (nav dot, menu button pop, menu link slide, ghost word swap, row padding, plus icon) |
| `--dur-600` | .6s | hover fills and underlines (`.link`, `.round`, `.btn`, door arrow); poster fade |
| `--dur-700` | .7s | panels and image swaps (menu slide-in, door fill, work image fade) |
| `--dur-800` | .8s | wordmark spin; live canvas fade-in |
| `--dur-900` | .9s | drift word fade and blur; magnetic return (JS) |
| `--dur-1000` | 1s | active drift word superscript color |
| `--dur-1100` | 1.1s | rises: `[data-reveal]`, drift word move, work image settle |
| `--dur-1200` | 1.2s | showreel focus: other words recede and blur |
| `--dur-1400` | 1.4s | large image hover (explorer); Lenis anchor scroll (JS, `duration: 1.4`) |
| `--dur-1600` | 1.6s | showreel focus scale |
| `--dur-2400` | 2.4s | live dot ping loop |

Current site (`_ds/.../tokens/motion.css`):

| Token | Value | Role |
|---|---|---|
| `--dur-1` | 120ms | opacity flickers, cursor states |
| `--dur-2` | 240ms | hover color, background, border |
| `--dur-3` | 480ms | nav underline sweep, cross-fade, arrow nudge |
| `--dur-4` | 780ms | section reveal (26px up + fade) |
| `--dur-5` | 1200ms | hero media, image zoom |
| `--dur-6` | 2400ms | slow settle on load |
| `--stagger` | 90ms | reveal stagger |
| `--t-hover` / `--t-enter` / `--t-media` | `--dur-2` / `--dur-4` / `--dur-5` + `--ease-out` | shorthands: `transition: color var(--t-hover);` |

Current site exceptions (kept on purpose): photography corridor drift 42 s linear and its 1050 ms dissolve
(`js/photography-gallery.js`), rocket build curve `cubic-bezier(.5, .05, .25, 1)` (`css/rocket.css`).

## Reduced motion

The two sites differ. Follow the pattern of the site you are on.

**Studio** (`next/`): the system setting only.

```css
/* already at the end of studio.css: kills every CSS animation and transition */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition-duration: .01ms !important; }
}
/* add a line here only for a resting pose that differs, e.g. */
@media (prefers-reduced-motion: reduce) { .my-thing { transform: none; } }
```

```js
// studio.js reads it once at start; JS motion checks it before starting
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
if (!reduced) startMyLoop();
```

`studies/shared/study.js` (loaded in the `<head>`) reloads the page when the setting changes, so reading it once is
enough. The showreel also listens live (`reducedQ` in `showreel/index.js`): reduced motion keeps the poster
`<img>`, or the last still frame if the canvas was already live.

**Current site**: the system setting OR the visitor's Display switch (footer), so never read the media query alone.

```js
const motionOn = () => window.PortfolioDisplay ? window.PortfolioDisplay.motion()
  : !matchMedia('(prefers-reduced-motion: reduce)').matches;
document.addEventListener('portfolio:motion', e => (e.detail.on ? start() : stop()));
```

```css
@media (prefers-reduced-motion: reduce) { .my-thing { animation: none; transition: none; } }
html[data-motion="off"] .my-thing { animation: none !important; transition: none !important; }
```

`js/site-palette.js` sets `html[data-motion]` before first paint and fires `portfolio:motion`. Durations
`--dur-3` and up collapse to 1ms under the system setting (`_ds` motion tokens). Examples: `js/media-playback.js`,
`js/rocket-flight.js`, `js/shader-bg.js`, `css/depth.css`.

## Pause when off screen or hidden

Every loop that draws follows this shape:

```js
let onScreen = false, raf = 0;
const running = () => onScreen && !document.hidden && motionOn();
function frame(now) {
  raf = 0;
  if (!running()) return;          // stop: no rAF scheduled while off screen or hidden
  draw(now);
  raf = requestAnimationFrame(frame);
}
const kick = () => { if (!raf && running()) raf = requestAnimationFrame(frame); };
new IntersectionObserver(e => { onScreen = e[0].isIntersecting; kick(); }, { rootMargin: '200px' }).observe(el);
document.addEventListener('visibilitychange', kick);
```

| Where | What it does |
|---|---|
| `next/js/showreel/index.js` `frame()` | stops when the hero box is off screen or the tab is hidden; restarts on `kick()` |
| `next/js/showreel/index.js` slow guard | median of 60 frames above 38 ms (after 2.5 s) gives up the loop at rest and draws single frames on scroll |
| `js/shader-bg.js` | IntersectionObserver (200px margin) + `visibilitychange`; one still frame when motion is off |
| `js/media-playback.js` | videos play only when visible, motion is on, tab is visible and no dialog is open |
| `js/photography-gallery.js` | corridor pauses on hover, focus, drag, off screen, hidden tab, open viewer |
| `js/rocket-flight.js` | no loop: one rAF per scroll event, redraws only when the roll or size changes |

Timers that must fire in a background tab use `setTimeout`, not rAF (rAF does not run there).

## Lenis (Studio only)

`next/js/lenis.min.js` smooths wheel scrolling on the Studio page. The current site uses native scroll only.

| Rule | How it is done now (`next/js/studio.js`) |
|---|---|
| Off under reduced motion and in capture mode | `if (!reduced && window.Lenis && !/[?&]shot/.test(location.search))` |
| Wheel only; touch keeps native momentum | `new Lenis({ lerp: 0.11, wheelMultiplier: 1, smoothWheel: true })` |
| No second rAF loop | the page loop calls `lenis.raf(now)` first, then reads `lenis.animatedScroll` |
| Anchor links | `lenis.scrollTo(el, { offset: 0, duration: 1.4 })`, else `scrollIntoView` |
| Freeze while a modal is open | `lenis.stop()` on menu open, `lenis.start()` on close |
| CSS it needs | `html.lenis, html.lenis body { height: auto; }` and `.lenis.lenis-smooth { scroll-behavior: auto !important; }` |
| Read scroll position | from the page loop (or the `studio:scroll` event, detail = hero progress 0..1), never `scrollY` in your own loop |

Do not add Lenis to the current site: `rocket-flight.js` and the explorer hand-off depend on native scroll.

## Timers and idle behavior (Studio)

| What | File: name | Now |
|---|---|---|
| Drift words change on scroll | `studio.js`: `Math.floor(p * 6) % 3` | every 1/6 of the hero height |
| Drift words change at rest | `studio.js`: `now - lastSwap > 3800 && now - lastScrollAt > 1500` | every 3.8 s, after 1.5 s without scroll |
| Word stagger between slots | `studio.js`: `si * 70` | 70 ms |
| Work ghost word swap | `studio.js`: `setTimeout(..., 260)` | 260 ms (fade is `--dur-500`) |
| Marquee drift + scroll boost | `studio.js`: `boost`, `x += dir * ...` | `.045` px/ms (`.03` on phone), boost up to 24 px, eased `.08` per frame |
| Magnetic follow / return | `studio.js` (pairs 59, 60 in the migration) | `--dur-250 --ease` / `--dur-900 --ease-back` |
| Live 3D start | `studio.js`: `requestIdleCallback(start, { timeout: 2500 })` | after load + idle (1.2 s fallback); never with `?still`, Save-Data or no WebGL |
| Showreel idle wait | `showreel/index.js`: `idleSeconds = 8` | 8 s on the hero untouched; later reels wait 12 s (`* 1.5`) |
| Guest preparation | `showreel/index.js`: `idle > wait * .5` | at half the wait, plus once on idle after load (4 s timeout) |
| Rocket exit / return | `showreel/index.js`: `[EXIT, 2.1]`, `[RETURN, 2.6]`, `SPIN = 1.7` | 2.1 s out, 2.6 s back, 1.7 rad extra roll |
| Abort to rest | `showreel/index.js`: `ABORT = 2.2` | any scroll, wheel, touch, pointer or key; guest leaves over 1.5 s |
| Therma-Shift reel | `showreel/index.js`: `ST.sequence` | enter 2.4, assemble 2 to 3.2, mug 1.8, warm 4.4, swap 2.8, chill 4.8, explode 2.0 s |
| Rocket idle sway | `hero3d.js`: `pose()` | sway `sin(t * .00032) * .32` rad, bob `.012`, pointer smoothing `.06` |
| Debug | URL hash | `#reel-<key>` plays that project now (`#reel-coaster` = Therma-Shift), `#reel-<key>-fast` at 3x, `#reel-fast` the next one in the rotation at 3x; key `c` plays the next; `window.__reel` (`seek(t, key)`, `project`, `use(key)`); see docs/recipes/showreel-actor.md |

## Page transitions

`next/css/nav.css` + `next/js/nav.js`, on every page built from next/ (home, websites, beyond, the case pages
from `tools/build-studio-cases.py`) and on 404, privacy and hi. `nav.js` loads in the `<head>` (not deferred).

| What | How |
|---|---|
| Opt-in | `<style>@view-transition{navigation:auto}html{background:#e7e8ea}</style>` first in each `<head>`: Chrome decides at the new page's first render, which can come before a linked stylesheet (the transition was skipped about half the time), and the inline background matches the first screen so nothing flashes |
| Page crossfade | `::view-transition-old/new(root)`, `--dur-400` linear; the grey paper eases instead of snapping |
| Shared photo | `nav.js` names the clicked album photo (home) and `.bhero__photo img` (beyond) `nav-photo`, with the caption pill as `nav-cap`; the group moves over `--dur-700 --ease` |
| Shared case media | the clicked `.tile__media` or `.nextp__media` and the case `.stage__media` are `nav-media` |
| Back / Forward | only the link we left from, and only when its image has loaded; else the plain crossfade |
| Entrance | `html.nav-enter` on a fresh navigation: the first block of `<main>` rises (`--dur-1100`); dropped when a picture is shared; also the whole effect where view transitions are missing |
| Land at the top | a fresh navigation (Navigation Timing `navigate`) goes to the top, or to the `#hash` target; `back_forward` and `reload` keep the browser's restore. Inside a frame whose host page scrolls (a preview can size its frame to the page, and the host keeps its own scroll across our navigations) `scrollIntoView` brings the frame's top into view |
| Reduced motion | no rise, no shared pictures, every view transition `--dur-250` |

## How do I

| Task | Do this |
|---|---|
| Add a hover fill (Studio) | `::before` fill with `transform: translateY(101%)`, `transition: transform var(--dur-600) var(--ease)`, set `transform: none` in `@media (hover: hover) { .x:hover::before {...} }` and on `.x:focus-visible::before` (copy `.round`) |
| Add a scroll reveal (Studio) | add `data-reveal` to the block; nothing else |
| Add a scroll reveal (current site) | there is none today: `data-reveal="1"` in `src/index.html` is read by no CSS or JS. Adding one is a visible change (owner call); if approved, use `--t-enter` and `--stagger` and turn it off under `html[data-motion="off"]` |
| Add a looping canvas | the pause pattern above + the reduced-motion pattern of that site; draw one still frame when motion is off |
| Make all Studio hover fills slower | change `--dur-600` in `next/css/tokens.css` (it also times the poster fade; check the hero) |
| Change how long the hero waits before the showreel | `idleSeconds` default in `mountShowreel` (`next/js/showreel/index.js`) |
| Change a reel step length | the `[STATE, seconds]` pair in the actor's `sequence` |
| Test reduced motion | DevTools > Rendering > Emulate `prefers-reduced-motion: reduce`; on the current site also try Display > Motion off |

## Known gaps

- `studio.js`'s page loop schedules a frame every frame even when nothing moves (its writes are skipped off screen).
  Lenis needs the loop while it is active; without Lenis (reduced motion) the loop could stop when the hero is off
  screen. Not changed here: `studio.js` is being edited on another branch.
- `study.js` reloads the Studio page when the reduced-motion setting changes, so the showreel's live listener only
  matters on pages without `study.js` (the lab pages).
- Studio durations are a fine 15-step ladder because the migration keeps every value exact. Merging close steps
  (.25/.3, .4/.45, .9/1, 1.1/1.2) is a visible change for the owner to approve.
