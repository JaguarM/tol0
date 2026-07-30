---
description: Identify the producer of a document nobody has read yet — the lab runbook
---

Argument: a PDF path (or a document already ingested under `lab/pages/`).

Read [lab/README.md](../../lab/README.md) first — it is the runbook and it is
current. This command is the order to try things in, and the discipline about
what each answer is worth.

## The search space, and which variables cost what

Enumerated 2026-07-30 for the 4-buckets-per-glyph class (digitally rendered,
FreeType-class, ¼-px x pens). Two kinds of variable, and the distinction is the
whole speed budget: **[bytes]** variables change the raster and multiply the
template space a sweep must cover; **[layout]** variables only move placement
and cost nothing at sweep time, everything at segmentation time.

Per glyph (read-time, cheap because coupled):
- **identity** — the GID, not "ASCII": ligatures `ﬁ ﬂ`, smart quotes, `§ ® •`;
  the PDF text layer is the producer's own OCR, labels only. The silent-error
  channel is the **ambiguity class**: two characters whose rasters are
  byte-identical at this size (`l`/`I` in some sans cuts) — exactness cannot
  misread a distinct picture but cannot split identical ones.
- **x phase** [bytes] — which of the 4 ¼-px buckets. NOT free per glyph: phase
  = (line start + Σ advances) mod 1, so one line is one unknown, not N.
- **x position** [layout]; **baseline y** [layout] + the **y snap law** [bytes]
  — mupdf rounds pen y to nearest INTEGER (×1 bucket); some producers snap ½ px
  (×2; the `phasesY '0,0.5'` legacy sets).

Per producer (hunt-time — the five axes, pinned once):
- **face** [bytes] — glyf GEOMETRY, not name or version (26 DejaVu versions,
  byte-identical partition). Cuts are separate files; fake bold = double-draw.
  An embedded FontFile beats every roster; absent one, METHOD rule 3 applies.
- **size** [bytes] — em64 = trunc(px·64); watch off-lattice sizes (8 pt @ 96
  dpi = 10.667 px) and anisotropic em64x ≠ em64y (`hunt probe`).
- **blend law** [bytes] — cov→byte map; its byte HOLES fingerprint it
  independent of face.
- **transport law** [bytes] — outline transform before rasterization
  (quad→cubic→quad grid round trip, stale hmtx; `lab/transform.mjs`).
- **pen-lattice law** [bytes] — the bucket count itself: 4×1 mupdf, ×2 half-px
  y, 1 integer, continuous = resampled page = OUT of this class.

Per page: geometry ("a few px taller" is either a MediaBox declaration —
harmless — or a real resample — fatal; tell them apart by whether sub-pixel
phase tracks `x mod N`), post-laws (palette, linear, jitter), and non-text ink
(rules, inline images, stamps), which a reader must refuse — every refusal
needs a disposition or it hides in the □ count.

Mostly irrelevant for this corpus: font version strings, hinting bytecode
(measured: does not partition), the `kern` TABLE (vs kerning applied),
self-consistent hmtx, ClearType, gamma/ICC, rotation, variable fonts.

**Every [bytes] axis has a fingerprint readable off the page before any
sweep**: bucket count → lattice; byte holes → blend law; cap-height → em64
window; straight-vs-curved exactness split → transport law; phase-vs-x → not
this class. A hunt that measures all five first should almost never need the
exhaustive net. The silent errors live in ambiguity classes and merged
components (kerning decides which neighbours touch; cut windows as page
RECTANGLES, not components — 16.5% vs 35.1% exact on the same components).

## The order, cheapest first. Stop as soon as something answers.

```bash
node lab/mbank.mjs scan <pdf>              # 1. ~100 ms — face and size, cold
node lab/ingest.mjs <pdf>                  # 2. the producer's own page rasters
node lab/harvest.mjs --doc <DOC> --out h1  #    monospace: fitted cell lattice
./lab/rust/target/release/hunt.exe harvest --doc <DOC> --out h1   # proportional
node lab/identify.mjs --targets h1         # 3. every answer we already have
node lab/identify.mjs --targets h1 --scan <face.ttf>   # 4. right face, unknown size
node lab/sweep.mjs --targets h1 --fonts all            # 5. the exhaustive net
./lab/rust/target/release/hunt.exe sweep --targets h1 --fonts all   # 5. at 40-45×
```

**Pick the right harvester.** `lab/harvest.mjs` fits a monospace cell lattice;
on a proportional face it emits byte-identical *fragments* cut at a pitch
nothing uses, and matching against them proves nothing. `hunt harvest` cuts
connected ink and needs no lattice — that is the general one.

## What each answer is worth

- **`mbank scan` names a FACE, not a producer.** It matches 4 px of one `m`. A
  named face whose document then refuses to read is normal and is information:
  the producer applies a post-law, or it is a different producer using the same
  face (see the `tahoma704-descenders` entry in `lab/families.mjs`).
- **Ties are often the answer, not an ambiguity** (METHOD rule 6). Two faces at
  the same size usually means the page really carries both — or that the faces
  are the same pixels. Check the second possibility first, it costs one render
  loop: Verdana ≡ MS Reference Sans Serif, 376/376 rasters identical.
- **`sweep` ranks; `identify` decides.** Sweep compares the tight ink crop,
  identify compares the whole window including white margins and the border.
  Confirm a sweep winner with identify before believing it.
- **"No face matches" is a statement about your ROSTER** (METHOD rule 3). Say
  what you enumerated. Both font directories, always — `C:/Windows/Fonts` is
  half the machine.
- **Tolerance is part of the proof, never a knob** (METHOD rule 5). If a page
  needs slack, name the documented producer law that grants it (`jpeg-jitter`,
  `palette-quant` in `lab/families.mjs`) or do not claim the read.

## When it closes

The answer leaves the lab: add the entry to `lab/families.mjs` **citing the
document and the number that proves it**, never a prose file. Then build the
set with `tools/fontgen.mjs`, add a pool to `tools/glyph-registry.mjs`, and let
`npm run gate` hold it still.

**A pool is a proven recipe.** If the document does not read clean, record the
finding as a `renderable: false` entry saying exactly what is open, and do not
add a pool yet.
