# tol0

**Read government documents at tolerance 0 — every line certified, never sampled.**

This is not fuzzy OCR. It **re-renders** candidate glyphs with a byte-exact clone
of the producer's rasterizer and demands the pixels match *exactly*. When they
do, the read comes with a **certificate**: every non-object ink pixel of the line
was explained by the proven blend law, so the transcript is not a guess. Unread
ink becomes an honest `□` with coordinates — errors cannot pass silently.

The honest limit is the same sentence: a document that will not read at
tolerance 0 is one this toolkit says **no** to, loudly, rather than guessing at.

To read a document this way you must first know its **(face, size, pen lattice,
blend law)** — so the other half of the toolkit is machinery for identifying that
tuple from pixels alone.

## Status: under construction

Ported from a larger private working repo, one certified layer at a time.
The plan of record and roadmap live in `docs/PLAN.md` (arriving with step 6).

- [x] **1. ftclone** — the rasterizer clone + font parsers, self-certifying
- [x] **2. engine** — the reader (bands, matcher, certificate) + unit suite
- [x] **3. glyph pipeline** — registry · bundle · fontgen, with the licence split
- [x] **4. the reader CLI + the byte-identical gate** — 18 documents, 2.44 M
      glyphs, byte-identical; Chrome dropped
- [ ] 5. `sync:recto`
- [ ] 6. docs — the thesis, the pen/blend laws, the methodology
- [ ] 7. `lab/` — the hunt half (identify · sweep · m-bank)
- [ ] 8. `lab/rust/` — the fast sweep engine

## Running what exists

```bash
npm install
npm run certify:ftclone   # the rasterizer clone vs the real mupdf
npm test                  # engine primitives on synthetic pages (~40 ms)
```

Neither needs a PDF, a corpus document, or a system font.

## Reading a document

```bash
node tools/rasterize-mupdf.mjs --pdf yours.pdf         # fill the raster cache
node tools/blind-read.mjs --pdf yours.pdf --all --pool nimbus791 --out read.txt
```

`--pool` names a **certified family read command** — the glyph sets, tolerance
and blend flags that family was actually proven with, taken from
`tools/glyph-registry.mjs` so it cannot drift. Reading is not rendering: the
rasterizer decodes the producer's own embedded page image, because rendering
the page would invent pixels and there would be nothing left to certify
against.

Ink the reader cannot explain comes back as `□` with coordinates rather than as
a guess, which is why a `□` count is a headline number below and not a defect
to be tuned away.

## The gate

The gate is what makes this repo trustworthy. It re-reads a fixed set of
documents and byte-compares whole transcripts against committed references:
**the expected numbers are the files in `fixtures/gate-ref/`, not prose**, so
any change in any number is the signal.

```bash
npm run gate
```

```
gate: 18/18 ok, 56s total
```

18 documents · **33,736 lines · 2,436,238 glyphs · 40 □** · 56 s. All 40 □ are
accounted for and none of them is text: 38 are `nimbusrom`'s red footer legend
and P1 seal graphic, 2 are in `report`. The 11 `nimbus791` documents also carry
truth transcripts and match **5,028 of 5,028 rows, spacing included**.

The documents themselves are real government PDFs and are not distributed: they
live in a gitignored `fixtures/corpus/`, and most pools need glyph sets whose
faces are not redistributable either. So a fresh clone runs 0 of 18 — and says
so, per document, naming the missing fixture or set. **Skipping is loud, and it
is not a pass.** The `nimbus791` block is the cheap way in: its pool is entirely
free, so those 11 run with no system font at all.

Details, including what the reference has already caught:
[fixtures/gate-ref/README.md](fixtures/gate-ref/README.md).

## engine

`engine/` is the DOM-free matcher core — ink bands, baseline pinning, the
left→right composite-aware scan, object/redaction detection, and the per-line
certificate. It is shared verbatim by the Node CLI and the browser app, so the
scanning physics has exactly one implementation.

`test/engine.test.js` covers that physics on **synthetic** pages only: band
finding, object detection (rules, redaction boxes, stacked boxes), `scanLine`
(byte-exact read, the honest `□` on unknown ink, blend-law overlap, tolerance,
palette quantization), space calibration, and `readPage` end-to-end. 27 tests,
~40 ms, no assets — which is why they run before the slow document gate.

## ftclone

`ftclone/` is a JS port of the exact glyph pipeline inside **mupdf 1.28 wasm**
(FreeType 2.13 smooth rasterizer, integer 26.6 throughout). Everything else
depends on it, so it certifies itself against the real thing:

```bash
npm install
npm run certify:ftclone
```

```
CERTIFIED TTF y-phase  0/64 — 0 diffs over 1128 renders
CERTIFIED CFF y-phase  0/64 — 0 diffs over 1128 renders
```

Two pipelines, because they share almost no code below the outline: a TrueType
face against itself through mupdf, and a CFF face against mupdf's *builtin*
`Courier` — which is URW Nimbus Mono PS, so that run also proves the file in
`fonts/` is the same font mupdf embeds.

The cert depends on **no corpus pixels and no system font** — it runs on a clean
clone. That is a deliberate constraint, not a convenience.

### Why a clone at all, when mupdf is right there

`fillText` cannot place a pen anywhere. mupdf's glyph cache quantizes the pen
x to ¼ px, and rounds pen y to the nearest **integer** — measured, not assumed:
`fillText` at y=28.5 is byte-identical to y=29 (SAD 0) and differs from y=28,
while x=10.25 renders distinctly from x=10. FTClone places pens on any 1/64,
which is what makes a real search over pen lattices possible.

Those 4 x-phases are the certified set. The `y-phase 32/64` row in the cert
output is *expected* to differ and is excluded from the pass criterion — the day
it stops differing, something changed in mupdf.

## Glyph sets and fonts

The reader matches against `assets/fonts/*.npz` — rasterized glyph bitmaps, one
file per (face, size, pen-phase, blend-law) config, generated by `fontgen`.

A `.npz` is a set of rasterized bitmaps **of a typeface**, so it inherits that
typeface's licence. This repo ships every set it may legally ship — 13 of 75 —
and tells you how to rebuild the rest from your own machine:

```bash
node tools/glyph-sets.mjs            # what you have, what you don't, and why
node tools/glyph-sets.mjs --plan     # the exact command for each missing set
node tools/glyph-sets.mjs --verify   # 13 shipped sets rebuild byte-identically
```

The 13 come from URW Nimbus and DejaVu; their source faces are in
[`fonts/`](fonts) (licences: [fonts/LICENSES.md](fonts/LICENSES.md)), so
`--verify` re-renders each one and byte-compares rather than asking you to take
it on trust. 47 more regenerate from stock system fonts — `--set` supplies the
exact recipe, which matters because 26 sets use a non-default character list and
the wrong one silently changes the bytes. 9 need a specific font *build*, and 6
were cut from document pixels and have no reproduction path at all.

Full explanation, including why a fresh clone is *expected* to be missing 62
sets: **[docs/FONTS.md](docs/FONTS.md)**.

Byte-exact results depend on the exact font build. This work has hit that wall
twice — Calibri 1.02 vs the installed 6.2x, and a DejaVu Serif build differing in
`t` and `D` alone — which is why the build is treated as part of the proof.
