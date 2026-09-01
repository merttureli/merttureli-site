# Business cards

Five templates on the site's own tokens: `#0A0A0A` on `#FFFFFF`, Space Grotesk
over IBM Plex Mono, 0.18em caps tracking. Open `cards.html` and they render at
true size with trim and safe guides.

```
python make-qr.py     # regenerate the QR codes, run this first
```

Then open `cards.html`, review, and use **Print to PDF**.

---

## The templates

| | name | what it is | when |
|---|---|---|---|
| 01 | **Rule** | The site's signature rule with the index number. Label, hairline, name, contact. | The safe default. Looks exactly like your site. |
| 02 | **Spec sheet** | Label and value rows in mono. Reads as a datasheet. | Engineer to engineer. A hiring manager gets it instantly. |
| 03 | **Ink** | Reversed, full black field, white type. Your `.on-dark` scope. | Career fairs. It is the one that gets picked up off a table of white cards. |
| 04 | **Index** | The oversized numeral from the case study pages. | If you want one distinctive element without going far from 01. |
| 05 | **Title block** | The card is a drawing sheet. Border, title block with DISCIPLINE / SCALE / DRAWING, and a dimension line measuring the card itself. | The creative one. |

**On 05.** The research on creative cards mostly returns gimmicks: PCB cards,
metal cards, cut-outs. Those signal "I paid for a novelty." A drawing title
block signals "I am a mechanical engineer," because it is a form only your
profession uses and every engineer who picks it up recognises it in under a
second. It is also the cheapest kind of creative, because it is still one ink on
one stock.

**Recommendation:** print **01** as the main run, and **03** or **05** as a small
second run for events. Two designs is normal. Five is a personality problem.

---

## Print specification

Everything below is set correctly in the file already.

| | |
|---|---|
| Trim | 3.5 × 2 in, the US standard |
| Document | 3.75 × 2.25 in, trim plus 0.125 in bleed on all four sides |
| Safe area | 0.125 in inside the trim. Verified: **zero elements cross it on any of the ten faces** |
| Minimum type | 8 pt is the usual floor. The mono metadata here sits at 6.5 pt, which is fine for a secondary line but check a proof before committing |
| QR | 0.92 in square, 37 modules, 0.0249 in per module, error correction H |

**Error correction H (30% recoverable) is deliberate.** A card lives in a
wallet, gets bent and picks up scuff. H survives that at the cost of a slightly
denser symbol, which at 0.92 in is still comfortable.

### The one thing that is not print ready

**A browser exports RGB, not CMYK.** Print to PDF from `cards.html` and you get
an RGB PDF. Three ways to deal with it:

1. **Use a printer that accepts RGB.** Moo, Vistaprint and most online
   consumer printers convert for you. For a monochrome card the conversion is
   nearly lossless, because there is no colour to shift. This is the right
   answer for you.
2. **Convert it.** Open the PDF in Acrobat or Affinity and convert to CMYK,
   or hand it to the printer and ask them to.
3. **Rebuild in a print tool** if a shop demands PDF/X-1a with embedded
   profiles. Only worth it for a large run.

### Rich black, for template 03 only

Template 03 is a full black field. On screen it is `#0A0A0A`. In print, 100% K
alone lays down as a slightly washed dark grey over a large area. Ask for
**rich black, around C60 M40 Y40 K100**, on that template only.

Small text and thin rules should stay **100% K**. Rich black under 8 pt type
shows registration fringing where the plates do not align perfectly.

---

## The QR codes, and why they matter here

Your old card was name, title, phone, email. **No URL at all.** You built a
tracked portfolio and your card did not point at it.

Each back carries a QR to `merttureli.com/?r=CODE`, so a scan arrives in your
own dashboard, classified, with engaged time and scroll depth. Three codes so
you can tell handout contexts apart:

| code | on template | means |
|---|---|---|
| `card-fair` | 03, 05 | career fairs and conferences |
| `card-desk` | 04 | left with a recruiter or on a desk |
| `card-general` | 01, 02 | everything else |

**Register them before printing**, or scans arrive as unattributed visits:

```
cd "C:\Users\mrttr\Desktop\Claude Work\Job Search"
python portfolio-link.py
```

One caution worth knowing. A printed QR is permanent. If you ever change domain
these cards are dead paper, so keep `merttureli.com` pointed somewhere useful
for as long as the cards are in circulation.

---

## What the research actually said

**Professional, in 2026, for an engineer.** Minimal and typographic. Name, one
role line, one contact route, one link. The thing recruiters say they need is
not a beautiful card, it is a memory aid: a hiring manager at a fair speaks to
fifty to a hundred people in a day and cannot reconstruct a conversation from a
name alone. A card that gets them to your work in one scan does that job. A
card that only carries a phone number does not.

**QR on the back, not the front.** Keeps the front clean and gives the scan a
reason to exist. All five templates do this.

**What to skip.** A headshot on a paper card reads as real-estate agent. Skills
lists do not fit and look anxious. Digital-only card services (Blinq, V1CE,
Wave) solve a problem you do not have, since you already own the destination and
the analytics.
