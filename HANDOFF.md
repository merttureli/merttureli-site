# HANDOFF: batch 2e, analytics you can trust (branch opt/b2e-analytics)

Findings: qa-4, qa-6, qa-7, code-3, plus critic gap G2 (analytics fired on every host).

## What changed
- js/track.js: host gate (merttureli.com / www.merttureli.com only); honors navigator.globalPrivacyControl and DNT
  (navigator, window, msDoNotTrack) before any visitor id is created or read; `sec` fix (see below);
  `.vcf` links report `vcf-download`; new `window.mtTrack(name)` for non-click events (fixed names only).
- Section tracking: elements matching `section[id], [data-track]` are observed as they appear (initial scan, a
  load re-scan, and a debounced MutationObserver), so nodes the runtime replaces are picked up. Per-element
  clocks, so a replaced node does not lose or double count time. Time is added before every beacon (hb and end)
  and not counted while the tab is hidden. Sections taller than the viewport count once they fill 35% of it.
  Works unchanged on static pre-rendered HTML (the MutationObserver just never fires).
- js/clarity.js: same host gate and GPC/DNT check; skipped when localStorage mt_self=1 (or ?self=1 in the URL).
- hi/index.html: restored analytics-config.js and track.js (../js paths). QR codes carry ?r=card-*; track.js banks
  it, so the Visit website link needs no ?r= forwarding (banked code is reused for 30 days).
- websites.html: analytics-config.js + track.js only (no Clarity). js/website-inquiry.js hooks:
  `inquiry-open`, `inquiry-step:details`, `inquiry-step:review` (once per visit), `inquiry-submitted`,
  `inquiry-error`. No field values are ever passed. No data attributes were needed.
- privacy.html: rewritten to match what loads (visitor id in localStorage, session id, 30-day link code,
  Cloudflare Worker collector, Clarity and its cookies, Formspree, funnel events, GPC/DNT). Dropped the
  "Here is the whole of it" signpost line (check-writing flagged it). check-writing.py: clean on privacy.html and
  websites.html. privacy.html itself still loads no analytics.

## Verified (Playwright, port 8944, workers.dev/clarity/formspree routed and mocked)
Live host faked with `--host-resolver-rules=MAP merttureli.com 127.0.0.1` (http://merttureli.com:8944).
- localhost: /, /hi/, /websites.html, a case page: 0 requests, nothing in localStorage.
- merttureli.com home, 1440 and 390: pv, Clarity tag, hb/end with sec = work, experience, beyond, websites
  (+ contact at 390). Before: sec was always [].
- Static page (no runtime) with a 2400px section and a replaced node: sec = [a, b, c].
- GPC forced true, DNT forced "1": 0 requests, no mt_vid. ?self=1 device: pv sent (me flag), no Clarity request.
- hi/?r=card-fair: pv, vcf-download, email-click, all with ref=card-fair.
- websites.html full flow: inquiry-open, step:details, step:review, formspree, inquiry-submitted; a 500 from
  formspree gives inquiry-error; typed name/email/message never appear in tracker bodies. No page errors.
- Screenshots: /tmp/claude-0/-home-user-merttureli-site/fe356c8b-023d-52dd-b7f6-84e925c9294d/scratchpad/opt/b2e/
  (privacy-390.png, privacy-1440.png, websites-complete.png). Test scripts t.js, t2.js are there too.
  Note: the unload beacon body is unreadable in Playwright, so the end beacon was checked by firing
  visibilitychange to hidden instead.

## Owner decisions and notes
- Clarity: kept, but the owner is unsure it is actively used. Decision needed: if kept, EEA/UK visitors arguably
  need consent before Clarity sets cookies (it currently loads for everyone not sending GPC/DNT). Options:
  remove clarity.js from index and the 5 case pages, or gate it on a consent banner. privacy.html says Clarity runs
  on the home and project pages, so update it if that changes.
- Historical `sec` data is empty, so new rows are not comparable with old ones.
- The Cloudflare Worker must accept the new `ev` names (inquiry-*, vcf-download). I could not check the worker;
  if it whitelists ev names, add them. `ev` already carried free-form names like `project-open:x`, so it
  probably does not.
- Case pages have no section ids, so their `sec` stays empty until build-case.py adds `data-track` ids
  (code-3 recommendation; build-case.py was out of scope for me).
- Hosts other than merttureli.com (including github.io previews) now report nothing, by design.
- Noticed, not touched: privacy.html paragraphs have no vertical spacing (inline-styled page, base.css resets
  p margin). Copy hold applies.
- Nothing needed in index.html or build-case.py. When fonts/React are self-hosted, privacy.html needs no change.
