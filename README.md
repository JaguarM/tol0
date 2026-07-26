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
- [ ] 2. engine — the reader (bands, matcher, certificate)
- [ ] 3. glyph pipeline — registry · bundle · fontgen
- [ ] 4. the reader CLI + the byte-identical gate
- [ ] 5. `sync:recto`
- [ ] 6. docs — the thesis, the pen/blend laws, the methodology
- [ ] 7. `lab/` — the hunt half (identify · sweep · m-bank)
- [ ] 8. `lab/rust/` — the fast sweep engine

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
`ftclone/fonts/` is the same font mupdf embeds.

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

## Fonts

Two redistributable faces ship here, solely so the cert runs on a clean clone —
see [ftclone/fonts/LICENSES.md](ftclone/fonts/LICENSES.md). Everything else is
**referenced, never shipped**: hunts and `fontgen` read your own installed fonts
from system paths.

This keeps the project honest about reproducibility. Byte-exact results depend on
the exact font *build*, and this work has hit that wall twice — Calibri 1.02 vs
the installed 6.2x, and a DejaVu Serif build differing in `t` and `D` alone.
