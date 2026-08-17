# Mert Türeli — Design System

A personal-portfolio design system for **Mert Türeli**: aerospace engineer, private pilot, photographer. One site, one mixed body of work; the disciplines are noted, not separated. Later additions (travel, cooking) belong in the same index rather than in new sections.

The system is deliberately narrow: a white canvas, two typefaces, no colour, very large spacing steps, film grain, and photography carrying all the visual weight.

---

## Sources

No codebase, Figma file, live site or brand book existed at the time of writing. The system was derived from **four reference boards the client supplied as directional inspiration** — they are *not* his existing work:

| File | What it is | What was taken |
| --- | --- | --- |
| `uploads/…sw5q.jpg` | "LUX / Liminal Unbounded X" brand board | Grain gradients, large panel radii, mono spec rows (`W : 292 mm : 827 px`), `+` tick marks, grey board field |
| `uploads/…pcr5.jpg` | "Salamandra Infraimmaculata" concept site | Near-white canvas, subject cut-out, giant caps, `01 02 03` step counter, underlined caps nav, page numeral |
| `uploads/…bbc3.jpg` | Star Wars concept landing page | Extreme whitespace, hairline rules, tiny type against huge type, square scroll-cue in the bottom-right |
| `uploads/…moqf.png` | Full-bleed photographic hero (Amway concept) | **The chosen hero direction**: photo bleeding to all four edges, dark scrim, knockout display type, `01 / 03` fraction, fixed social rail |

Decisions the client made directly: full-bleed photographic hero; **monochrome, accent `#111111`** (no chromatic accent); one mixed portfolio; wordmark set as the full name in letter-spaced caps; "good smooth and natural animations and transitions".

### Not supplied
- **No logo or mark.** None was invented. The wordmark *is* the name set in type (`Wordmark`).
- **No photography.** Every image in this system is a grey gradient plate with grain. The client intends to generate imagery with AI tools; the plates are neutral so warm or cool photography will drop in without a redesign.
- **No brand fonts.** See *Substitutions* below.

---

## Index

| Path | What is there |
| --- | --- |
| `styles.css` | The single entry point — `@import` list only |
| `tokens/` | `fonts` · `colors` · `typography` · `spacing` · `layout` · `effects` · `motion` · `base` |
| `guidelines/` | 20 specimen cards (Colors, Type, Spacing, Brand) |
| `components/core/` | `Wordmark` · `Button` · `Meta` · `Rule` · `Icon` |
| `components/navigation/` | `SiteHeader` · `NavLink` · `SlideCounter` · `ScrollCue` · `SocialRail` |
| `components/media/` | `MediaFrame` · `Grain` · `Caption` |
| `components/content/` | `DisplayHeading` · `SpecList` · `WorkCard` · `PullQuote` |
| `ui_kits/website/` | Four-screen click-through of merttureli.com |
| `assets/grain.svg` | The grain tile referenced by `--grain-url` |
| `SKILL.md` | Agent-skill wrapper |

Every component ships `<Name>.jsx`, `<Name>.d.ts` and `<Name>.prompt.md`; read the `.prompt.md` first.

**Intentional additions** (no source defined a component inventory, so this set was authored from the references):
- `Icon` — a thin wrapper over the Lucide CDN, so the glyph set is one decision in one file rather than scattered `<img>` tags.
- `Grain` — the LUX texture appears on three different kinds of surface; it earns a component.
- `SpecList` — the mono key/value row is the single most repeated device across the boards.

---

## Content fundamentals

**Voice.** First person, past tense, specific. He states what was done and what it measured; he does not sell. The register is a logbook entry, not a pitch.

> "Six iterations, each one printed at quarter scale before committing to the aluminium. The photographs below are of the fifth, which failed in the way the model said it would, at the load the model said it would."

**I, not we.** One person. "We" would be a lie, and "Mert designs…" third-person is worse. Direct address to the reader ("you") is used sparingly and only for instructions.

**Casing.**
- Display headings, nav, buttons, all metadata: **UPPERCASE**.
- Body copy and lead paragraphs: **sentence case**. Never title case, anywhere.
- The wordmark is always uppercase and always tracked.

**Length.** Headlines are two to four words on two lines. Leads are one or two sentences. Body paragraphs run two to four sentences and stop. Nothing on the site needs a "read more".

**Numbers are content.** Indices are zero-padded (`01`, `012`), figures carry units, coordinates and dates appear as metadata (`N 64°08′ W 21°56′`, `EGKB → EGHI / 2025`). A number without a unit or a source does not go on the page.

**Discipline labels** are the three words *Engineering*, *Aviation*, *Photography* — used as notes on a piece of work, never as navigation.

**Banned.** Emoji, anywhere, ever. Exclamation marks. "Passionate", "journey", "crafted", "elevate". Rhetorical questions as headings. Testimonial slabs. Any sentence that could appear on any other portfolio.

**Punctuation.** En dashes with spaces for ranges and asides. `/` as the separator inside metadata (`Reykjavík / 2025`). No terminal full stop on labels, captions or single-line metadata; full stops in body copy as normal.

---

## Visual foundations

### Colour
Monochrome by decision, not by omission. A ten-step ink ramp from `--ink-900` `#0A0A0A` to `--ink-050` `#EFEFEE`, plus `--paper` `#FFFFFF` and `--board` `#D9D9D9` (the LUX panel grey). The accent token `--accent` resolves to `#111111` — achromatic on purpose, so the only colour on any page comes from the photography. Alpha ramps (`--ink-a80` … `--paper-a08`) exist for type and chrome over images. `.on-dark` is a scope class, not a theme: it flips the semantic aliases for dark plates and photographic sections.

**Do not introduce a hue.** If something needs to stand out, make it bigger, give it more space, or put a photograph next to it.

### Type
**Space Grotesk** for everything read, **IBM Plex Mono** for everything measured. Display sizes are clamped from 64px to 184px, set in caps at `0.92` line-height and `-0.03em` tracking — tight enough that two lines lock into a block. Body is 16px at `1.62`, capped at 62 characters. Metadata is 10–12px mono caps at `0.18em`; eyebrows and the wordmark open to `0.32em`. The contrast between 184px and 10px on the same screen is the system's main typographic effect; mid-sizes are used sparingly.

### Spacing
Steps widen as they grow: 4, 8, 12, 16, 24, 32, 48, 64, 96, 128, 192, 256. Page margin is `clamp(24px, 5vw, 88px)`; section rhythm is `clamp(96px, 14vh, 192px)`. Component padding is small, section spacing is enormous, and there is very little in between — that gap is what makes the layout feel bold rather than merely airy. Empty area is composition; do not fill it.

### Backgrounds and imagery
Three background treatments only:
1. **Paper** — flat white, the default for every content section.
2. **Photography, full-bleed** — edge to edge, with `--scrim-hero` (42% at the top, clearing by the bottom) whenever type sits on it.
3. **Ink plate** — `--ink-900` with grain at 22%, for quotes and interludes.

No patterns, no illustrations, no gradient washes as decoration. Gradients exist only as photographic stand-ins and inside the grain plates.

**Grain** is the signature: `assets/grain.svg` tiled at 220px, `mix-blend-mode: overlay` on imagery, `multiply` on light fields, 14 / 28 / 50% strengths. It goes on photography, plates and gradients — **never on plain white paper**.

**Colour vibe of imagery.** Cool, desaturated, high-contrast; deep shadows, clean whites. Warm images should be graded down before use. Black-and-white is always acceptable.

### Motion
One easing curve — `cubic-bezier(0.22, 1, 0.36, 1)` — used for everything. Decelerating, no bounce, no elastic, no spring.

| Token | Duration | Used for |
| --- | --- | --- |
| `--dur-1` | 120ms | Opacity flickers, cursor states |
| `--dur-2` | 240ms | Hover colour, background, border |
| `--dur-3` | 480ms | Nav underline sweep, screen cross-fade, arrow nudge |
| `--dur-4` | 780ms | Section reveal: 26px up + fade |
| `--dur-5` | 1200ms | Hero media, 4% image zoom |
| `--dur-6` | 2400ms | Ken-burns settle on hero load |

Reveals stagger at 90ms. Movement is always small (≤26px) and always along one axis. Nothing rotates. Nothing scales past 1.06. `prefers-reduced-motion` collapses every duration above 240ms to 1ms.

### States
- **Hover, dark elements:** lighten `--ink-900` → `--ink-700`. **Hover, outline elements:** invert to solid ink. **Hover, links:** the hairline underline goes to full ink and sweeps in from the left over 480ms. **Hover, images:** `scale(1.04)` over 1200ms. **Hover, list rows:** siblings drop to 42% opacity and the hovered title slides 10px right.
- **Press:** nothing. No shrink, no depress, no ripple. The hover state simply holds.
- **Focus:** `1px solid` ink outline at 3px offset. Never removed.
- **Disabled:** 32% opacity, `not-allowed`. No grey fill.

### Borders, radii, shadow
Hairlines at 12% ink do nearly all the structural work — rules divide sections, captioned rules title them. Radii: 2 / 4 / 8 / 20 / 40 / 64 / pill. Images and panels take 8px; the LUX-style large panel takes 40–64px; buttons and icon chips are pills. **The scroll cue is the only hard-cornered element in the system** — that contrast is deliberate.

Shadows lift a whole panel off the page and nothing else: `--shadow-panel` and `--shadow-float` are for device mock-ups and floating sheets. **Buttons, cards and inputs are flat, always.** A card is an image with a caption under it; it has no border, no fill and no shadow — the image edge is the card edge.

### Transparency and blur
Glass (`--blur-glass`, `saturate(120%) blur(14px)`) appears **only over photography** — the hero button, the social rail chips, the inverse scroll cue. Never over paper, never over an ink plate. Scrims are gradients, not flat fills, except the 28% flat wash used behind dense metadata.

### Layout rules
12-column thinking, 1680px max width, 88px header. Fixed elements: the social rail (vertically centred, right edge, over the hero only) and the hover-preview image on the work index. The header floats transparent over photographic heroes and sits on a hairline everywhere else. Content columns are asymmetric — 1.4 : 1 or 1.5 : 1 — never a 50/50 split.

---

## Iconography

**Lucide**, loaded per-glyph from CDN (`https://unpkg.com/lucide-static@0.544.0/icons/<name>.svg`) through the `Icon` component. **This is a substitution and should be reviewed** — no icon set was supplied. Lucide's 1.5px stroke, square caps and 24px grid are the closest freely available match to the hairline chevrons and arrows in the reference boards.

The vocabulary is intentionally about a dozen glyphs, all navigational: `menu`, `x`, `search`, `arrow-down`, `arrow-up-right`, `chevron-left`, `chevron-right`, `plus`, `minus`, `instagram`, `linkedin`, `mail`.

Rules:
- 14–22px. Never larger; a big icon is a picture, and pictures here are photographs.
- Monochrome. Because glyphs load as `<img>`, colour comes from `Icon`'s `inverse` prop (an invert filter), not `currentColor`.
- An icon never carries meaning alone unless the target is unambiguous (menu, close, chevron). Everything else gets a caps label beside it.
- **No emoji, ever.** No unicode pictographs. The only non-alphabetic characters that appear as UI are the arrow `→` used inline in buttons and the `/` separator in metadata.
- No icon font, no sprite sheet. If Lucide is replaced with a licensed set, swap the CDN constant in `components/core/Icon.jsx` and nothing else changes.

---

## Substitutions to review

1. **Typefaces.** No brand fonts were supplied. **Space Grotesk** (display/body) and **IBM Plex Mono** (metadata) are Google Fonts substitutes chosen to match the grotesque and technical-mono pairing in the boards, and they load from the Google CDN rather than from local files. If real licensed fonts exist, drop the files into `assets/fonts/` and replace the `@import` in `tokens/fonts.css` with `@font-face` rules.
2. **Icons.** Lucide, as described above.
3. **Photography.** All grey plates. Real imagery goes in `assets/photography/`.
4. **Copy.** Project titles, specs and body copy in the UI kit are plausible placeholders written in the brand voice, not real projects.
