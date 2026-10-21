# HANDOFF: Batch 2a, phone menu (branch opt/b2a-nav)

Files changed: `js/mobile-nav.js` (rewritten), `css/mobile.css`. No edits to index.html, build-case.py or projects/*.html.

## What changed
- Menu builds from every `header nav > a` (resolved absolute hrefs), not only `#` hrefs. The list re-syncs when the header links change, so any number of links works (a Websites item added by build-case.py needs no change here).
- Same-page links (origin and path match, `/` equals `/index.html`) close the menu and smooth-scroll in place (honors reduced motion). Any other link (other page, mailto, PDF) closes the menu and lets the browser navigate.
- 2s polling replaced by a MutationObserver on `document.body` (childList, subtree) with no deadline. It also re-applies `aria-controls`, `aria-haspopup` and `aria-expanded` after the runtime re-renders the header. The click handler stays delegated on `document`.
- Focus management: focus moves to the Close button on open; Tab and Shift+Tab are trapped; Escape closes; focus returns to the trigger (re-queried if the runtime replaced it). The rest of the body is set `inert` while open. Closed menu is `hidden` plus `inert` (and `#mt-menu[hidden]{display:none}`), so no invisible tab stops.
- Open menu also lists Email (`mailto:merttureli0@gmail.com`) and Resume (PDF). The Resume URL is derived from the script's own URL (`new URL("../assets/Mert-Tureli-Resume.pdf", script.src)`), so it works from root and projects/ (fetched 200 application/pdf).
- css/mobile.css: social rail (`div[style*="--z-rail"]`) hidden at <=860px; desktop rail unchanged. Menu button `display:none` at >=861px. Overlay now scrolls (`overflow-y:auto`, close button `position:fixed`) so many links or landscape phones are not clipped. Focus-visible outlines and a reduced-motion rule were added.

## Verification (scripts and screenshots in /tmp/claude-0/-home-user-merttureli-site/fe356c8b-023d-52dd-b7f6-84e925c9294d/scratchpad/opt/b2a-nav/)
test.js (keyboard at 390, touch at 390, mouse-free desktop check at 1440) on index.html and all 5 projects/*.html; full log in run2.log; extra.js for edge cases.
- Keyboard at 390: Enter on Menu opens it, focus lands on Close, 12 Tabs and 8 Shift+Tabs stay in the menu, Escape closes and focus returns to Menu, menu is hidden and inert when closed, no page children left inert.
- Touch at 390: every link tapped on every page; on index, in-page scroll lands the target at top 64px; on case pages the links navigate to index.html#section. Close by x works. Resume fetch OK.
- 1440: Menu button `display:none`, rail still shown, overlay `display:none`.
- 860 vs 861: button and rail shown/hidden correctly; header links hidden at 860 and shown at 861.
- axe-core 4.10.2 (cdnjs) on the open menu: 0 violations on all 5 case pages; index.html reports only `html-has-lang` (index.html has no lang attribute on `<html>`, not mine to fix).
- Hero Resume link at 390: every sampled point hit-tests to the Resume link (was covered by the Mail chip). Case-page lede no longer covered (`projects_charger_html-390-hero.png`).
- Extra: 5 injected links (including a different-page one) appear in the menu; replaced Menu button regains aria attributes, opens, and gets focus back; resize 390 to 1440 while open closes the menu and releases the scroll lock.
- Screenshots: `index_html-390-menu.png`, `projects_charger_html-390-menu.png`, `projects_charger_html-390-hero.png`, `landscape-menu.png`, `many-links-390.png`, `index_html-1440.png`.

## Needs the orchestrator / other batches (not done here)
- Case-page header wordmark has `href="#"` (ux-v1, a11y-1): should be `../index.html`. Needs a build-case.py or SiteHeader change.
- Arriving at `index.html#work` from a case page lands at the top (y=0), because sections are client-rendered after the browser's hash jump. This is pre-existing (direct load of `index.html#work` behaves the same at 390 and 1440) and the static pre-render batch should fix it. The menu links are correct.
- index.html lacks `<html lang>` (axe `html-has-lang`).
- The "Colors" pill still sits over the hero caption at 390 (ux-6, second half). Not in this batch's brief, left alone.
- The in-menu Email and Resume labels are "Email" and "Resume (PDF)". No other copy touched; check-writing.py not needed.
- The late-React case was not independently proven: the test route delay did not defer header rendering (menu existed at 1s). The MutationObserver has no deadline by construction.
