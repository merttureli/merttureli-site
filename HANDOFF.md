# opt/websell: the websites section on home

Branch `opt/websell`, from `claude/funny-sagan-acgved`. Not pushed.

## What changed

The small websites teaser on home (`#websites`, council blocks home-160 to home-163) is replaced in place by a full section. Nothing else on home changed: the rocket flight, the CHARGER section, the 3D handoff and the skills belt are untouched.

- `src/index.html`: new `#websites` markup, plus one deferred script tag in the head. `index.html` was regenerated with `python3 tools/build.py` (the task allows this; it was not hand-edited). `build.py --check` passes.
- `css/website-entry.css`: rewritten for the section. The file name and the head link stay the same, so there is no new request.
- `js/home-websites.js` (new, about 4 KB, deferred): the picker, the lazy iframe and the "Try it" logic.

### The section

- **Background.** Ink (`--ink-900`), the same color as the photo corridor above it and the contact plate below. The page now stays dark from Beyond to the footer, where it used to cut to a white band and back. Pixel check: corridor 9/10/10, section 10/10/10, so there is no seam. A hairline rule opens the section, the same way the old teaser did.
- **Head.** The meta label is kept ("Websites / Design & development"), with the big display heading "I build websites" and one line: "This site is one of them. Here are four redesigns of it, each a working page." Both facts come from websites.html.
- **Live frame.** A large browser frame shows one of the four studies, live. It works the same way as `js/website-studies.js`:
  - only one iframe exists at a time;
  - it is created after window `load` and only once the section is within 60% of a screen;
  - it is removed beyond 150%;
  - the screen shows each study's first-paint color while it loads, and the page fades in after 450 ms, so nothing flashes. Swapping studies fades the old page out first.
  - On phones the frame becomes a phone shape and the study renders at 390 px, live (no stills).
- **Picker.** Four real buttons (A Hangar, B Launch, C Studio, D Specimen) with `aria-pressed`. They form a numbered list beside the frame on wide screens and a row of four pills at 1000 px and below.
- **"Try it".** The iframe ignores the pointer until someone asks to use it, so scrolling the home page never gets stuck inside a long study.
  - At 701 px and up: clicking the screen or its "Try it" pill engages the page. Moving the pointer out of the frame, or tapping outside it, releases it.
  - On phones: a "Try it here" toggle button under the frame does the same thing (`aria-pressed`), and the overlay leaves the tab order.
  - The iframe has `tabindex=-1` until it is engaged, so keyboard users are not dropped into a study's links.
- **Calls to action.**
  - Primary: "Find a day to talk" goes to `websites.html#inquiry`, which opens the existing inquiry dialog (website-inquiry.js already opens it from that hash).
  - Secondary: "A website for you" goes to `websites.html` (council kept this label).
  - "Open the Hangar page" follows the current pick.
- **"More web work".** "CHARGER explorer" uses `href="#charger-explorer"`, which opens the existing 3D explorer dialog in place through integration.js. "Business card page" links to `hi/`.
- **Tracking.** New `data-track` ids: `websell-inquiry`, `websell-websites`, `websell-study-open`, `websell-try`, `websell-charger-3d`, `websell-hi`. Clicks inside the section call `window.mtTrack(id)`, which does nothing off the live domain.
- **Performance.** Before the section is near, the page makes no study requests (tested). Nothing runs while idle: two IntersectionObservers and one ResizeObserver only, and the loading bar's animation is paused unless something is loading. Layout shift from the section is 0.0000 (tested).
- **Reduced motion.** No transitions and no loading animation (tested). Studies swap without the fade.

## Verification

Server on :8885. Playwright blocked clarity, bing and workers.dev, and mocked Formspree. No real submissions were sent.

`scratchpad/opt/websell/test.js` passed every check:
- no iframe and no study requests at the top of the page;
- Hangar goes live;
- the wheel over the idle frame scrolls the page;
- once engaged, the wheel scrolls the study and not the page;
- the pointer leaving the frame releases it;
- each of Launch, Studio and Specimen goes live with exactly one iframe;
- the iframe has a title;
- the open link follows the pick;
- CLS delta is 0;
- the iframe is removed when the section is far away;
- the CHARGER explorer link opens the explorer dialog;
- "Find a day to talk" lands on websites.html with the inquiry dialog open;
- phone: 390 px render, Try toggle on and off, a tap outside releases;
- reduced motion holds;
- no console errors anywhere.

`shot.js` reported no horizontal scroll at 390, 860, 1440 or 1920. `check-writing.py` is clean on `src/index.html` and `index.html`.

Screenshots, all in /tmp/claude-0/-home-user-merttureli-site/fe356c8b-023d-52dd-b7f6-84e925c9294d/scratchpad/opt/websell/:
- before: `before-390.png`, `before-1440.png`
- after: `v2-{390,860,1440,1920}.png`, with full-section versions `v2-*-full.png` and `v2-390-lower.png`
- Launch picked: `launch-1440.png`
- phone, engaged: `phone-engaged-390.png` (taken before the tap-highlight fix)
- inquiry opened from the CTA: `inquiry-1440.png`

(The "Skip to content" pill in the `-full` shots comes from Playwright's full-page capture of a fixed element. It does not show in normal screenshots.)

## For the owner / orchestrator

- **Flag removed.** The `home-163` flag ("do you want the website entry on home at all?") is gone, because the owner answered it by asking for this section. `tools/check-flags.py` now lists 10 open flags instead of 11.
- **New copy to approve.** No new flags were needed; every claim comes from websites.html. The new on-screen copy is:
  - "I build websites"
  - "This site is one of them. Here are four redesigns of it, each a working page."
  - "Try it" and "Try it here"
  - "Open the [name] page"
  - "More web work"
  - "3D model, three.js"
  - "merttureli.com/hi"
  - "Find a day to talk" and "A website for you" are reused as they are.
- **Duplicated code.** `js/home-websites.js` repeats about 40 lines of `js/website-studies.js`, and the study background colors are repeated in `css/website-entry.css`. I kept them separate so websites.html carries no risk. If the studies' first-paint colors change, update both CSS files.
- **build-case.py.** No edits needed.
