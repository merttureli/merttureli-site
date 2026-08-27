#!/usr/bin/env python3
"""
Flag the writing tics that make a page read as machine written.

There is no reliable detector for this. The commercial "AI content detectors"
are guessy, gameable, and fail on plain factual prose, which is exactly what a
portfolio should be, so running one would fail this site for being correct.

What is reliable is a named list of habits. Every pattern below is one I
actually put on this site and had to take back out, so the list is evidence
rather than theory. The rule underneath all of them:

    State what was done and what resulted. Delete any sentence whose only job
    is to tell the reader how to feel about the previous sentence.

    python check-writing.py                 check every built page
    python check-writing.py projects/x.html check one
"""
import io
import os
import re
import sys
import glob

# (label, regex, why it is a tic)
TICS = [
    ("inversion",
     r"\b(?:is|was|are|were)\s+not\s+(?:an?|the)\s+[^.,;]{3,40}[.,]\s*(?:It|They)\s+(?:is|are)\b",
     "'not an X. It is a Y.' Rhetoric doing a fact's job"),

    ("explainer",
     r",\s*which\s+is\s+(?:the|what|why|how)\b",
     "explaining your own noun to the reader"),

    ("signpost",
     r"\b(?:The (?:first|second|third|last|other) one is|That reframes|Here is the|"
     r"What (?:this|that) means is|The (?:real|actual|whole) (?:point|question|answer))\b",
     "narrating the structure instead of writing it"),

    ("trust plea",
     r"\b(?:take (?:it|this|that) on trust|nobody has to|does not need taking|"
     r"so you do not have to (?:believe|trust))\b",
     "anticipating disbelief invites the doubt it tries to close"),

    ("aphorism",
     r"\b(?:There is no (?:route|way|path) to|Nobody \w+s? (?:it |them )?for you|"
     r"beats \w+ing|is what \w+ing looks like)\b",
     "closing flourish, not a fact"),

    ("hedge-emphasis",
     r"\b(?:actually|genuinely|truly|simply|essentially|fundamentally|"
     r"quite frankly|to be clear)\b",
     "emphasis words that add nothing"),

    ("editorial aside",
     r"\b(?:It is worth (?:noting|knowing|saying)|Worth (?:noting|knowing)|"
     r"The (?:interesting|important|clever) (?:bit|part|thing) is)\b",
     "the page telling you what to care about"),

    ("not-just",
     r"\bnot (?:just|only) [^.,;]{3,50}(?:,| but)\b",
     "'not just X but Y' escalation"),

    ("stopped being",
     r"\b(?:stopped being|is no longer just|goes beyond) \b",
     "false-profound transition"),

    ("first person opinion",
     r"\bI (?:would|will) (?:defend|argue|say|maintain)\b",
     "an opinion invented on the author's behalf"),

    ("dash",
     r"[–—]",
     "em or en dash, house rule is plain hyphens"),
]

# Sentences that are quoted competition rules or hardware names trip a couple of
# these legitimately. Anything inside these stays exempt.
EXEMPT = re.compile(r"(?:G7\dR|G8\d|XBee|MPL3115|ESP32)", re.I)


def prose(path):
    """Rendered paragraph and list text only. Markup and code are not writing."""
    h = io.open(path, encoding="utf-8").read()
    chunks = re.findall(r"<p[^>]*>(.*?)</p>", h, re.S)
    chunks += re.findall(r'<span style="font-size: var\(--fs-body\)[^"]*">(.*?)</span>',
                         h, re.S)
    out = []
    for c in chunks:
        t = re.sub(r"<[^>]+>", "", c)
        t = re.sub(r"\s+", " ", t).strip()
        if len(t) > 30:
            out.append(t)
    return out


def check(path):
    hits = []
    for para in prose(path):
        for label, pattern, why in TICS:
            for m in re.finditer(pattern, para, re.I):
                frag = para[max(0, m.start() - 45):m.end() + 45]
                if EXEMPT.search(frag):
                    continue
                hits.append((label, why, frag.strip()))
    return hits


def main():
    targets = sys.argv[1:] or sorted(glob.glob("projects/*.html")) + ["index.html"]
    total = 0
    for path in targets:
        if not os.path.exists(path):
            print("no such file:", path)
            continue
        hits = check(path)
        total += len(hits)
        mark = "%d" % len(hits) if hits else "clean"
        print("\n%-34s %s" % (path, mark))
        for label, why, frag in hits:
            print("   %-18s ...%s..." % (label, frag))
            print("   %-18s %s" % ("", why))
    print("\n%d flagged across %d file(s)" % (total, len(targets)))
    return 1 if total else 0


if __name__ == "__main__":
    sys.exit(main())
