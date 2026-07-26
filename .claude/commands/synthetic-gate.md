---
description: The reader's corpus-free gate — how it is built, and what it still does not prove
---

**This one is built.** `npm run gate:synth` runs the reader end to end on a page
this repo draws for itself, in ~1.2 s, with no corpus, no PDF and no system
font. It closed the hole that a stranger could certify the rasterizer, the
engine primitives and the lab's fast engine but could not run the **reader** at
all.

Everything about it lives in one place: the header comment of
[tools/synth-gate.mjs](../../tools/synth-gate.mjs). Read that before changing
anything here.

## What it does, in one paragraph

It lays a page out at **fractional** pens by accumulating each face's own
advances, then places every glyph through the measured lattice law
(`docs/LAWS.md` §1 — x snapped to ¼ px, y rounded to an integer) and composites
left→right through the blend law (§2), so overlapping pairs are real composites.
Faces are the free ones in `fonts/`, drawn with `ftclone/`, read back with the
five committed sets those faces produce. The reader is then handed the page and
the pool and nothing else, through the real CLI. Nineteen assertions; the
load-bearing ones are:

- **every recovered pen equals the drawn pen**, to a quarter pixel (397 of them,
  all four phases) — a transcript can be right for the wrong reason, a pen list
  cannot;
- the whole transcript letter- *and* space-exact against a truth file that is
  the layout itself;
- every baseline, including a line laid on a **½-px baseline** that §1 rounds one
  row down;
- **the certificate in the other direction**: one solid 8×11 mark that is not
  text and not an object must come back as exactly one `□` with coordinates, and
  must not cost a single text line;
- **the decoy**: read again with a pool that cannot explain the 16-px body, and
  not one row of it may come back — the reader half of the rule
  `lab:selftest` and `rust:certify` lean on.

The committed reference is `fixtures/synth-ref/` — transcript, summary, and the
**sha256 of the drawn page**, so a change in the drawing is as loud as a change
in the read. Re-record with `--regen`, deliberately.

## What it still does not prove — do not let this drift

The page is drawn by the same rasterizer clone the reader matches with. That
makes it evidence about the reader's *machinery* (banding, the baseline pin, the
composite-aware scan, object detection, space calibration, the certificate, the
□ accounting) and **no evidence at all about a real producer**. `npm run gate`
remains the authority there, and neither substitutes for the other.

Deliberately out of scope, because inventing a producer for them would prove
nothing: the **linear post-law** and **palette quantization** (§4), both
corpus-only. The page is also cleaner than any real one — no JPEG jitter, no
whitened colour, no redaction spill, and its word gaps are one width for the
whole page (see the note in the file: `spaceCalib` returns ONE space advance per
page, so mixed-family spacing is a known limit, not a target).

If you extend the page, extend it toward something a real document does that the
gate cannot currently see — and keep `fixtures/gate-ref/` untouched.
