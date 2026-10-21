# Batch 5: websites service page (branch opt/b5-websites)

Findings: copy-7, ux-11, visual-v1, visual-10, seo-6, qa-13.
Files edited: websites.html, css/websites.css, css/website-studies.css, css/website-entry.css, js/website-inquiry.js.
index.html, build-case.py and js/inquiry-delivery.js are untouched. Their changes are proposed below.

## Final headline (for assets/og/websites-v1.png and its og:image:alt)

The page h1 is now:

    WEBSITES
    DESIGNED AND BUILT

The source text is `Websites<br><span>designed and built</span>`. CSS sets it in caps, with the second line in ink-400.
The page `<title>` and `og:title` are `Website design and build · Mert Tureli`.
Suggested alt text for the regenerated image: `WEBSITES / DESIGNED AND BUILT. Website design and build by Mert Tureli`.
The old headline, "Like what you see? Let's build yours.", no longer appears anywhere on websites.html.

This branch adds `og:image` = `https://merttureli.com/assets/og-cover.png` because the merged og asset is not in this worktree.
When merging, keep the merged batch's `og:image` (assets/og/websites-v1.png) plus its `og:image:alt`, update the alt as above, and drop this branch's og-cover line.

## What changed

**Copy (house voice).** The hero is now a statement instead of a rhetorical question. Every "we" and "our" is gone ("our saved design studies" became "Saved design studies for this portfolio"; "We'll talk through the idea" became "I reply by email to set a time and talk it through").
- Headings have no question marks and no full stops: "Already live", "Same work / four directions", "How I work", "Start with an idea".
- Study style buttons are sentence case in the source and caps in CSS, which ends the Title Case problem.
- Drawer headings: "Pick a day", "Your idea", "Review", "Request sent". The old "What do you have in mind?" is gone. The done button now says "Close".
- The design-study specimen inside `.design-excerpt` ("Mert Tureli.", "Beyond engineering.") is left as it was. It is a mock of an alternative design, not page copy.

**SERP and preview (seo-6).**
- title / og:title: `Website design and build · Mert Tureli`.
- description: "I design and build websites for individuals and small businesses. See what is live on this site, how I work, and pick a day for a first call. Austin, Texas."
- og:description: a shorter version of the same sentence. Neither depends on "here".

**Chrome (visual-10).** The page now loads the typography, effects, motion and base tokens.
- Header: static equivalents of SiteHeader, NavLink and Wordmark on a hairline. Nav is the homepage list: Work / Experience / Beyond / Websites / Contact. "Back to portfolio" is removed because the wordmark already goes home.
- Phones (860px and below): a sticky ink bar plus a menu overlay, the same pattern as the homepage. It is a native `<dialog>`, so focus is trapped and Escape closes it. Without JS the nav wraps instead.
- Buttons are system pills (mono caps, `--ls-caps`, `--radius-pill`; outline inverts on hover). Labels use Meta, headings use DisplayHeading sizes, the invitation uses SpecList.
- Footer is the homepage colophon on an ink plate.
- Raw greys and `#111` are replaced by tokens, so the palette switcher now recolors this page too.
- The tilted brief card (shadowed, rotating on hover) is gone. Specimen hover is now translate-only and keeps the resting tilt ("nothing rotates").
- The drawer is on tokens as well: no grid pattern, no blur over paper, disabled state is 32% opacity, inputs are flat.
- css/website-entry.css (homepage block, CSS only, no copy change): the button is now a system pill in caps, the label uses `--fs-meta`, and the heading uses the display tokens.

**Proof and process (ux-11).**
- "01 / Proof: Already live" lists four things that run today: this site (static on GitHub Pages, case studies generated from one template script), the CHARGER explorer (three.js, from the flight model, thirty components at true stations; wording taken from the homepage), the design studies, and the /hi business-card page.
- "03 / Process: How I work" has four steps.
- The invitation adds an engagement SpecList: Start / Reply / Built as / Based.
- No clients, testimonials, prices or invented numbers.

**Inquiry (qa-13).**
- `.panel-footer` is sticky at the bottom of the drawer at every width, so Continue, Review and Send stay on screen at 375x667.
- Both email links (drawer foot and invitation) carry the typed name, email, company, preferred day, time and timezone, and the message. Each one gets a URL-encoded mailto body. The href refreshes on input and again at click time.
- Bodies are capped at 1900 URL characters. The cut is made on code points (no broken surrogate pairs) at a word boundary, and the email says it was shortened.
- On any send error, an "Email these details instead" link carrying the details appears directly under the error message.
- All existing error handling is unchanged: delivery, validation, double-send guard, past-date reset and the busy state.

## Verification

Screenshots are in /tmp/claude-0/-home-user-merttureli-site/fe356c8b-023d-52dd-b7f6-84e925c9294d/scratchpad/opt/b5/.
- `before/websites_html-{375,390,768,1440}-{fold,full}.png`: the page before.
- `after/websites_html-{375,390,768,1440}-{fold,full}.png`, plus `after/seg-{375,390,768}-*.png` (2x segments with lazy images loaded): the page after.
- `after/menu-375.png`: the phone menu.
- `after/dialog-{390,768,1440}.png`: the drawer with a date picked.
- `after/inquiry-375-{open,date,date-bottom,details,review,error-500,error-429,error-timeout,success}.png`: each inquiry state.
- `after/home-entry-{390,1440}.png`: the homepage block after the CSS change.

I looked at all of them. There is no horizontal scroll at any width and no console errors.

The mocked Formspree run is `opt/b5/inquiry-test.js` (route-mocked, so nothing was really submitted). All 30+ checks pass:
- Continue stays in view at 375x667 on open, after picking the last day of the month, and with the drawer scrolled to the bottom.
- 500, 429 and a real 21s hang (hitting the 20s client timeout) each show their error, keep the details, re-enable Send, and show the details-carrying email link. Send and Back are disabled while a request is pending.
- Success shows the complete panel. There is exactly one POST per send and the payload is intact.
- The mailto body survives `&`, `?`, `#`, `%` and newlines.
- A 3000-character message with emoji and Turkish characters is cut to 1892 characters with the shortened note, and no characters are corrupted.
- The menu opens, closes on Escape, and returns focus to its button.

`python3 check-writing.py websites.html` reports clean. A manual grep of the rendered text finds no we, our, us, dashes, exclamation marks or UK spellings, and no headings ending in "?" or "." (apart from the study specimen).

## For the orchestrator to apply (not applied here)

1. **js/inquiry-delivery.js voice (qa-13).** Two user-facing strings say "We":
   - line 23: `'We could not confirm your request was sent. Your details are still here. Please use the email link below if this continues.'`
     becomes `'I could not confirm your request was sent. Your details are still here. Please use the email link below if this continues.'`
   - line 28: `'We could not confirm delivery. Check your connection before trying again. Your details are still here.'`
     becomes `'I could not confirm delivery. Check your connection before trying again. Your details are still here.'`
2. **build-case.py nav (visual-10, one nav list everywhere).** In the `vals` nav list (around line 437), add this after the beyond entry:
   `'        { id: "websites", label: "Websites", href: "../websites.html" },',`
   Then rebuild projects/*.html. Note: js/mobile-nav.js only copies `#` links into the phone menu, so case pages' `../index.html#...` links may not show there. That is worth checking separately.
3. **check-writing.py (ux-11, visual-v1).** Add `websites.html`, `hi/index.html` and `404.html` to the default targets. Add rules for `<h1>` to `<h3>` text ending in `?`, and for `\b(we|our|us)\b` in prose. Today the checker cannot see either break.

## Homepage #websites block: proposal only (homepage copy is on hold)

index.html lines 472-473. Current text: label "Websites / Design & development", h2 "Like what you see? / Let's build yours.", paragraph "Your work, your business, your next idea. Let's give it a website people want to explore.", button "A website for you". Proposed, matching the service page:

```html
<div><span class="website-entry-label">Websites / Design and build</span><h2 id="website-entry-title">Websites<br><span>designed and built</span></h2></div>
<div><p>I design and build websites for individuals and small businesses. This site is the working example.</p><a href="websites.html" class="website-entry-link" data-depth-button="outline">See how I work <span aria-hidden="true">→</span></a></div>
```

## Owner review / left undone

- **Process steps 03 "Working pages" and 04 "Build and launch"** describe how I understand the work is done (design in the browser, static build, put live on the client's domain). The owner should confirm both match how he works, or edit them. Steps 01 and 02 restate what the form and the drawer already promise.
- **Authorship.** copy-7 suggests the owner write any "I built this site" claim himself. The page now says "This site is the working example" and lists the site as proof, which follows the existing "I build websites" framing. He should confirm the wording.
- **Inquiry order.** ux-11 suggested idea first and an optional date. That was not in this batch's goals, so it is not done.
- **Meta labels** use `--text-muted` (ink-500, 5.3:1) instead of the component default `--text-meta` (ink-400, 3.4:1), so 12px labels pass AA.
- **Error text** keeps the existing dark red (#842a25). It is the one deliberate hue on the page and is functional, not decorative.
- **visual-10 parts outside this page** (Robo-Catcher walkthrough, photography-lab) are not touched.
