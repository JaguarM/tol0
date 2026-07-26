# The laws

Every read this toolkit certifies is a claim that a re-rendered glyph equals the
page's pixels. That claim rests entirely on the handful of laws below. They were
measured, not read off a specification, and each one names how to measure it
again — because a written constant is a copy, and copies go stale.

## 1. The pen lattice

mupdf's `fillText` cannot place a pen anywhere. Sweeping one whole pixel of pen
travel in 1/64 steps and counting **distinct rasters** (Carlito `m` at 16 px,
mupdf 1.28, 2026-07-26):

| axis | distinct rasters over 1 px | means |
|---|---:|---|
| x | 5 | snaps to the nearest **¼ px** — 4 phases, and the 5th image is phase 0 one pixel over |
| y | 2 | rounds to the nearest **whole pixel** — no subpixel y at all |

SAD against the on-integer render, same glyph:

| offset | +⅛ | +¼ | +½ | +¾ | +1 |
|---|---:|---:|---:|---:|---:|
| x | 2856 | 2856 | 5774 | 8239 | 9978 |
| y | — | **0** | 4538 | 4538 | 4538 |

y = 28.5 is byte-identical to y = 29 (SAD 0) and differs from y = 28. The
asymmetry is real, and it **supersedes the "8 snap phases" this project worked
from for months: it is 4.**

Consequences that are load-bearing elsewhere: `fontgen --phases-y 0` is the
producer-certified setting (see [FONTS.md](FONTS.md) for what a legacy
`0,0.5` set is, and why it will not regenerate); the `y-phase 32/64` row of the
cert is *expected* to differ, and the day it stops, mupdf changed.

FTClone has no such limit — it places pens on any 1/64, which is the whole
reason it exists: a real search over pen lattices is impossible through
`fillText`.

**Re-measure:** `npm run certify:ftclone` prints the lattice on every run
(`probeLattice` in [../ftclone/certify.mjs](../ftclone/certify.mjs)) and names
any pair other than 5 / 2 as UNEXPECTED.

## 2. Coverage → alpha → page byte

The FreeType smooth rasterizer produces 8-bit coverage per pixel; mupdf
composites black over the canvas in integer math:

```
e   = cov + (cov >> 7)         // 0..256 — the >>7 is what makes cov=255 opaque
dst = (dst * (256 - e)) >> 8
```

That is the whole blend law. It is certified rather than believed:
`npm run certify:ftclone` renders **1,128 glyphs per pipeline** — TTF against
mupdf and CFF against mupdf's builtin Courier — with **0 differing bytes**.

Two properties the reader depends on:

- **Repeated draws just apply it again.** Measured 12/12 exact over 4 glyphs × 1,
  2, 3 draws. This is what lets the scanner blend an accepted glyph into its
  canvas and keep matching against real composites.
- **It is monotone in `dst`.** A pixel that stays under the dark threshold for
  every possible canvas state can be settled without knowing what comes next.

## 3. The law, read backwards

Reading is that law inverted, one glyph at a time, left to right:

> at the leftmost unexplained ink column, try every (glyph, ¼-px x-phase) whose
> first ink column lands there; `predicted = blend(explained canvas, coverage)`;
> accept only if `predicted == page byte` **exactly**, on every ink pixel of the
> glyph. Pixels a later glyph may darken are held *pending* and settled when it
> is blended in. Accept whichever candidate explains the most ink.

The pen positions come out on the ¼-px lattice for free — nobody tells the
reader §1; it falls out of the search. A line is **CLEAN** when every non-object
ink pixel in its band was explained this way: `fails.length === 0` and
`residual === 0`. That is the certificate, and it is the only thing this project
sells.

`TOL` relaxes the compare to `|Δ| ≤ TOL`, and to `2 × TOL` on composite pixels,
where two curves' rasterizer deviations compound. It defaults to 0. It is part
of the proof and not a knob — see [METHOD.md](METHOD.md) rule 5.

## 4. Producer post-laws

The blend law is the producer's rasterizer. Some producers then do one more
thing to the page, and the reader has to model it or nothing matches.

**Linear (the eDiscovery producer).** Glyph raw alpha bytes composite
multiplicatively in 255-space with floor, and the page byte carries **+1 per
contributing light pixel** — light iff the raw byte ∈ [128, 254]. Sets that need
it are tagged `linear` in the registry and baked at generation time
(`fontgen --linear`); the scanner keeps a per-pixel shift count so raw space
stays recoverable from page space.

**Palette quantization.** Some pages (v4, `email` P1) are palettized at the end:
the page byte is the **nearest available gray** to the ideal render, ties toward
darker. The available set is read off the page itself — every actual page byte
is in it by construction, so palette grays are fixpoints. Scan canvases stay in
original space, because the producer quantized *once, at the end*, and every
prediction-vs-page compare goes through the map.

## 5. Colour, and why the raster mode is not a detail

The certificate only means something over ink the producer drew in neutral
black, so colour is whitened away before band-finding. How well that works is
decided by the raster the cache holds:

| mode | payload | colour test |
|---|---|---|
| 1 | u8 gray | none needed |
| 3 | u16 R+G+B sums **+ u8 per-pixel channel spread** | real colour = spread ≥ 4; the whitening flood then spreads only through spread ≥ 1 pixels (coloured AA fringes); spread 1–3 is channel jitter and rounds back to neutral |
| 2 | u16 sums only | forces the legacy test *neutral iff sum ≡ 0 (mod 3)* |

Mode 2 is not merely coarser. On the `nimbusrom` gate document it floods whole
letters white: **38 □ became 472 □**, and 13,034 glyphs became 4,957. That is
why `rasterize-mupdf.mjs` emits **mode 3 for any multi-component image**, and
why this is written down instead of left as a constant in the writer.

## 6. Size, em64, and advances are two numbers

The raster matrix is 26.6 fixed point: `em64 = trunc(size × 64)`. The advances
are **not** bound to that truncation, and collapsing them was a real bug.

`report.pdf`'s body is 8 pt at 96 dpi = 10.6666… px. The matrix truncates to
em64 **682**; every advance is a multiple of 10.6666…. Deriving `SIZE_PX =
EM64/64` made all 107 advances wrong by up to 0.011 px — small, and fatal by the
end of a line. `fontgen --size` keeps the size it is given and truncates only
the matrix.

## 7. The page is decoded, never rendered

`tools/rasterize-mupdf.mjs` decodes the producer's **own embedded page image**.
Rendering the PDF would invent pixels with a rasterizer that is not the
producer's, and there would be nothing left to certify against. This is why a
`--pdf` must be in the raster cache before it can be read, and why the reader
has no rendering path at all.
