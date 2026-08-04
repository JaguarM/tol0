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

### 1a. …and it is SIZE-DEPENDENT, which the table above hides

That measurement was taken at **16 px**, and it holds only for `8 ≤ size < 24`.
The lattice coarsens as the glyph grows. Measured the same way — sweeping one
pixel of pen travel in 1/64 steps through `fillText` and counting distinct
rasters, Carlito `m`, mupdf 1.28, 2026-08-03 (rasters = phases + 1, the extra
image being phase 0 one pixel over):

| size (px) | x rasters | y rasters | x lattice | y lattice |
|---:|---:|---:|---|---|
| < 4 | 5 | 5 | ¼ px | **¼ px** |
| 4 – 8 | 5 | 3 | ¼ px | **½ px** |
| 8 – 24 | 5 | 2 | ¼ px | whole px |
| 24 – 48 | **3** | 2 | **½ px** | whole px |
| ≥ 48 | **2** | 2 | **whole px** | whole px |

Thresholds are exact and inclusive at the bottom: 23.984 gives 5, **24.0 gives
3**. `size` is `fz_matrix_expansion(ctm)`, i.e. √|ad−bc| — the em in device px
for an unrotated matrix.

The mechanism is `fz_subpixel_adjust` in mupdf's
`source/fitz/draw-glyph.c`, and the constants are a **bitmask**, not a divisor:
`q = 0 / 128 / 192` at `size ≥ 48 / ≥ 24 / else`, applied as
`*qe = (int)(subpix->e * 256) & q`, so `&192` keeps two bits (4 phases), `&128`
one (2 phases), `&0` none (1). A second, much lower ladder `qmin = 0 / 128 / 192`
at `size ≥ 8 / ≥ 4 / else` replaces `q` **on whichever axis the matrix is
axis-aligned on** — for ordinary upright text `b == c == 0`, so the *vertical*
axis takes `qmin` and that is why y snaps to whole pixels far earlier than x.
The function then writes the quantised value back into the caller's matrix
(`ctm->e = subpix_ctm->e + pix_e`), and `fz_draw_fill_text` blits at
`floorf(trm.f)` of that modified matrix — so **the discarded remainder is lost
from the glyph's position, not merely from its cached shape.** There is no
"continuous baseline, quantised cache" split to exploit.

Load-bearing consequence, and the one live case: `nimbussansbdlin1536`
(NimbusSans-Bold, em64 1536) is **exactly size 24.0**, where x has 2 phases and
not 4. Every other shipped set is 10–19 px and sits safely inside the 8–24 band.
Any future pool at em64 ≥ 1536 must not be generated on a ¼-px x lattice, and
any at em64 < 512 (size < 8) has a **½-px y lattice** — where
`fontgen --phases-y 0` and the cert's "`y-phase 32/64` is expected to differ"
both stop being true.

**Re-measure:** sweep `fillText` at sizes straddling 4, 8, 24 and 48 and count
distinct rasters per axis, exactly as the table above was made.

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

### 1b. …and above size 256 there is NO lattice at all

The ladder in 1a is the *glyph cache's*. Above a ceiling the glyph leaves the
cache entirely and is placed continuously. Read from source
(`fz_render_glyph`, `draw-glyph.c`, mupdf 1.28):

```c
size = fz_subpixel_adjust(ctx, ctm, &subpix_ctm, &key.e, &key.f);
if (size <= MAX_GLYPH_SIZE)   /* 256 */   do_cache = 1;
else { if (is_ft_font) return NULL; ... }
```

and `fz_draw_fill_text` treats that NULL as *fill the outline instead*:

```c
glyph = fz_render_glyph(ctx, span->font, gid, &trm, ...);
if (glyph) { ...blit at floorf(trm.e), floorf(trm.f)... }
else { fz_path *path = fz_outline_glyph(ctx, span->font, gid, tm);
       fz_draw_fill_path_aux(ctx, devp, path, 0, in_ctm, ...); }
```

The path branch uses **`tm` and `in_ctm`** — the unmodified text matrix — so the
quantisation `fz_subpixel_adjust` already wrote into `trm` is discarded with it.
So for a **FreeType-backed font** (any embedded TrueType/Type1, i.e. everything
but Type 3) there are exactly two regimes:

| `size` = √\|ad−bc\| | placement |
|---|---|
| ≤ 256 device px | glyph cache, pen on the 1a lattice |
| > 256 device px | **path fill, pen exactly continuous** |

Type 3 fonts never reach the second regime: `is_ft_font` is false, so they stay
quantised and merely go uncached.

**The consequence that is resolution-free**, and it is what makes this testable
on a page whose render resolution is unknown: the cache's y quantum is one
device pixel, and `size` is the em in device px, so

> the finest y lattice the cache can emit is **em / 256**, in whatever units the
> em is measured.

Raising the resolution to shrink the device pixel drives `size` toward the same
ceiling. Measuring a glyph's placement in units of its own em therefore tests
*both* regimes at once, with no dpi assumption — which is how
`page-downscale-816x1073` was shown to be path-filled
([../lab/families.mjs](../lab/families.mjs), 2026-08-03l).

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

…and one it can be *tested* with:

- **The law is not onto. Over white paper it emits 255 of the 256 bytes, and
  the one it cannot emit is 127** — `cov = 127` gives 128, `cov = 128` gives
  126, and nothing in between. So **byte 127 in glyph ink is proof that a page
  is not one pass of this law over paper.** Composites can reach it, so it only
  counts in bulk; in a monospace wall glyphs do not overlap and it counts
  immediately.

  This is the cheapest producer test in the repo — one byte, no roster, no
  render, no font. Measured over the 40 documents of `lab/base64/` on
  2026-07-31: every **816×1056** page (36 documents, 7 families) carries
  **0.000 %**, and every **816×1073** page (14 documents) carries
  **0.19–0.50 %** — against the ~1/255 = 0.39 % you would expect if *every* ink
  pixel were an average of two rendered values. The rate is not a hint, it is
  the post-processing itself, measured. (`jitter1-times1024` sits at 0.018 %,
  which is the registered `jpeg-jitter` law and not this one.)

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

**Page resample — the one post-law that is NOT modelled, and the reason 14
documents do not read at all.** The `816×1073` family (`lab/families.mjs`
`page-downscale-816x1073`) is a page RESAMPLED after rendering. Byte 127 is
present at 0.19–0.50 % of ink, so this is settled fact, not a theory. What is
measured about the geometry:

- A letter page at 300 dpi is 2550 × 3300, and **8/25 of that is exactly
  816 × 1056** — the size of every native document in the corpus. This family
  is 816 × 1073, i.e. the same downscale with **y stretched by
  1073/1056 = 1.0161**.
- So **x scale = 8/25 exactly** (period 8 output px — sub-pixel phase repeats,
  which is why a template cut on one row matches the same row on every page)
  and **y scale = 1073/3300** (1073 and 3300 are coprime — the phase never
  repeats, which is why no two text rows ever share a rasterization).

That asymmetry is the entire behaviour of the family, and it is why it is not a
face hunt: there is no (face, em64, pen, law) that reproduces the page, because
the page is not a per-pixel function of any 1× coverage map. **The reader must
refuse these documents rather than read them at a widened tolerance**
([METHOD](METHOD.md) rule 5); there is deliberately no pool.

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
