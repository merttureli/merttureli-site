# Business cards

```
python make-qr.py     # QR codes, run once
python make-fin.py    # traces the 2026 fin out of its DXF, for concept B
```

Then open `cards.html`. Four concepts at true size with trim and safe guides.

---

## The finding that outranks every design decision here

**Stock and finish are most of what makes a card feel expensive. The artwork is
not.** Two people can print the same file and one card feels like a business and
the other feels like a coupon.

| weight | how it reads |
|---|---|
| 300 to 350 gsm | the default at cheap online printers. Thin in the hand, and people notice without knowing why |
| **400 gsm** | **the professional floor.** Solid, confident, holds a finish, and still cheap |
| 450 to 600 gsm | double thick. A statement, and it will not fit some cardholders |

Uncoated or cotton stock feels warmer, takes a pen, and suits this monochrome
work better than a gloss coating. **Order 400 gsm uncoated and any of the four
designs below will land. Order 300 gsm gloss and none of them will.**

## The rule the first attempt broke

**8 pt is the floor for anything a person has to read.** The first set had
metadata at 6.5 pt and title block labels at 4.6 pt, which is not a small design
choice, it is unreadable for anyone over about forty and that includes most
people doing the hiring.

The scale used here, straight from the print guidance: names 11 to 14 pt, titles
9 to 11 pt, body 8 to 9 pt. **Verified in the browser: nothing on any of the
eight faces is set below 8 pt, and nothing crosses the safe area.** Where a card
needs something to recede it uses grey, not a smaller size.

Two typefaces, never more. Three is risky, four reads as amateur.

---

## The four

Being straight about this: for a monochrome card with two typefaces and no logo,
there are not ten concepts. There are about four, and they differ by what does
the work.

**A. Specimen** — *scale does the work.* The name at 31 pt filling the width,
one quiet line at the foot, two thirds of the card left empty. The nerve to
leave it empty is the design.

**B. Section** — *your own geometry does the work.* The 2026 competition fin,
traced by `make-fin.py` out of the DXF that cut the flight hardware, running off
the right edge at 1:2. Root tab included. Not a shape that resembles a fin, the
outline that was actually laser cut. An engineer will notice the tab.

**C. Plate** — *a photograph does the work.* CHARGER on pad one, full bleed,
type reversed out of a scrim. The research is blunt that black cards with white
type and very few elements read as the most premium thing in a stack, and you
own the photograph.

**D. Datum** — *one gesture does the work.* A single heavy rule crossing the
card and bleeding off both edges. Name above, contact below. The hardest of the
four for a printer to get wrong.

**Pick two.** One default and one for events. Five designs was the mistake in the
first pass, and it reads as indecision rather than range.

---

## Print specification

| | |
|---|---|
| Trim | 3.5 × 2 in |
| Document | 3.75 × 2.25 in, verified exact on all eight faces |
| Bleed | 0.125 in all round |
| Safe area | 0.125 in inside trim, verified clear |
| QR | 0.95 in, 37 modules, 0.0249 in per module, error correction H |

**A browser exports RGB, not CMYK.** For monochrome that conversion is nearly
lossless and Moo or Vistaprint will handle it. Concept C's back is a full black
field, so ask for **rich black around C60 M40 Y40 K100** on that face only.
Small type stays 100% K, or the plates misregister and the letters fringe.

**Concept C needs one check.** The source photograph is 1920 × 823 px against a
1125 × 675 px requirement at 300 DPI, so it has the pixels, but a full bleed
photo is the one thing on these cards that can look cheap if the printer's
profile crushes the shadows. Ask for a proof.

---

## The QR codes

Your old card had no URL on it at all. Each back here carries a QR to
`merttureli.com/?r=CODE` so a scan lands in your own dashboard with engaged time
and scroll depth.

| code | on | means |
|---|---|---|
| `card-fair` | B, C | career fairs and conferences |
| `card-desk` | D | left with a recruiter |
| `card-general` | A | everything else |

Register them first or the scans arrive unattributed:

```
cd "C:\Users\mrttr\Desktop\Claude Work\Job Search"
python portfolio-link.py
```

A printed QR is permanent, so keep the domain alive while the cards circulate.

---

## What to skip

A headshot reads as real estate agent. A skills list looks anxious and does not
fit. Digital card services solve a problem you do not have, since you already
own both the destination and the analytics. Foil, emboss and spot UV are real
upgrades but they cost setup fees, and on a monochrome card at 400 gsm they buy
less than the stock already did.

## Note on the design skills

You have `high-end-visual-design`, `impeccable` and nine other design skills
installed, and **both of the ones worth using here are disabled for me to
invoke**. If you want a further pass on these, run one yourself:

```
/high-end-visual-design
```
