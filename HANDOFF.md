# HANDOFF: opt/studies2

Branch `opt/studies2`, from `claude/funny-sagan-acgved`. Not pushed. Replaces the poster + Explore flow of `opt/studies`.

## What changed
- `websites.html` (#studies only): still images, Explore button and loading text removed. The frame is now a bar plus an empty
  screen; `js/website-studies.js` puts the live iframe in it. "Open full page" is unchanged. The bar's state label reads
  Loading / Live (was Preview / Loading / Live).
- Text: one sentence changed, because it described the removed behavior. Lead was "...Pick one to see its first screen, then
  explore it live here or open the full page." Now "...Pick one to see it live here, or open the full page." Revert if you
  want it untouched.
- `assets/studies/` deleted (24 files, 0.96 MB). No other file referenced it.
- `css/website-studies.css`: poster/loading-pill/explore rules removed. The screen takes each study's first-paint background
  (Hangar #e5e4e0, Launch #0a0b0d, Studio #e7e8ea, Specimen #efefec, from each page's `--ground`/`--paper`/`--space`),
  eased on switch. Loading indicator is a 56 px hairline bar, no text. Reduced motion: all transitions and the bar animation off.
- `js/website-studies.js` rewritten:
  - IntersectionObserver, rootMargin 60% vertical (about 540 px desktop). A margin of a full screen put the section inside it
    at 1440x900 on page load (section top is 1677 px), so 60% keeps it off page load; load also waits for `window.load`.
  - One iframe, `loading="lazy"`, titled "<Name> direction, live page". Renders at 1200 px wide (390 px on phones: the real
    responsive page) and scales to the frame; fixed aspect ratio so nothing jumps.
  - Fade-in 450 ms after the iframe `load` event (0 under reduced motion). Switching fades the old page out (240 ms) over the
    background easing to the new color, removes it, then loads the new one: never two iframes, no white or black flash.
  - Second observer (150% margin) removes the iframe when the section is far away; it reloads on return. In practice this
    only triggers on the longer phone page (verified at 390).
  - Focus is never moved. Picker buttons keep `aria-pressed`; a polite live region announces loading and live.

## Network cost of opening the section (local server, no compression, so text is larger than on Pages)
- Nothing from `/studies/` on page load (0 requests; page itself 277 KB).
- Hangar (default): about 3.1 MB at 1440, 3.0 MB at 390 (GLB and three.js dominate). Launch 3.3 MB, Studio 1.5 MB,
  Specimen 1.1-1.3 MB per switch.

## Verification (screenshots and flow.js, flash.js in /tmp/claude-0/-home-user-merttureli-site/fe356c8b-023d-52dd-b7f6-84e925c9294d/scratchpad/opt/studies2/)
- 1440 and 390: no iframe before approach, loading then live, `n=1` iframe throughout, rapid switching ends on the last pick,
  focus stays on the picker button, unload and reload at 390. No page errors, no 4xx. Reduced motion: transition 0s,
  instant swap. Screenshots: `s1.png`, `s2.png`, `s3.png`, `1440-section.png`, `*-swap-*`, `*-live.png`.
- `check-writing.py websites.html`: clean. Inquiry dialog end to end with Formspree mocked at 390 and 1440: opens, completes.

## Notes
- Keyboard users can tab into the embedded page (many stops before "Open full page"). Left as is.
- On touch, scrolling that starts inside the phone frame scrolls the embedded page; margins beside the frame scroll the site.
- The "Live" dot in the frame bar renders dark (pre-existing `var(--accent)` fallback); not touched.
