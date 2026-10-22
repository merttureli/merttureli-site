# Analytics: what is counted and how to add an event

`js/track.js` is first-party and cookie free. It reports only on `merttureli.com`, only when `js/analytics-config.js` has an endpoint, and never when the browser sends Global Privacy Control or Do Not Track. Previews and localhost send nothing.

## What it counts

| Signal | How it is named |
|---|---|
| Section read (3 s on screen) | the element's `id` on any `section[id]`, or its `data-track` value |
| Link clicks | built in by href: `resume-download`, `vcf-download`, `email-click`, `linkedin-click`, `github-click`, `phone-click`, `project-open:<slug>`, `outbound:<host>` |
| Custom events | `window.mtTrack('<fixed-name>')` |

Case pages name their sections from `anchor`, `track` or the label slug (`track_id()` in `build-case.py`).

## Add a tracked section or event

| Want | Do |
|---|---|
| Time on a block that is not a `section[id]` | add `data-track="<name>"` to it |
| A button click | `data-track="<name>"` on the button, and in its script `window.mtTrack && window.mtTrack(el.dataset.track)` (pattern: `js/home-websites.js`) |
| A step in a flow | `window.mtTrack('<flow>-<step>')` (pattern: `js/website-inquiry.js`) |

Names: lowercase, hyphens, at most 64 characters, fixed strings. Never pass anything a visitor typed.

## Keep it true

- If you start collecting something new (a new field, not a new event name), update `privacy.html` in the same commit. The privacy page must describe exactly what is sent.
- Renaming `assets/Mert-Tureli-Resume.pdf` or changing `mailto:`/`tel:` hrefs changes what the built-in rules match: keep them.
- Keys live in `js/analytics-config.js` only.

## Test without sending

Tracking is off on localhost, so local tests cannot send data. In Playwright, block `*clarity.ms*`, `*bing.com*` and `*workers.dev*` in every context anyway, and never point a test at the live domain with tracking on.
