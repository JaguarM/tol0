# monospace-lab

A standalone lab for reading **monospaced** document pages — base64 walls,
printed MIME dumps, Courier email bodies — with a human in the loop. It finds
the text rows and the character lattice from the page's own pixels, matches
every cell against templates **byte for byte**, and leaves an honest `□`
wherever nothing matches. The human's job is only the part a machine cannot do:
saying what a shape is. Every shape they name is cut once and then answers for
every identical cell in the corpus.

It replaces `monospace-old/`, which had the same idea and hardcoded the answers
(`xStart = 60`, `charPitch = (653-60)/76`, a literal `rowBands` array) and
decided cells by best-correlation. On the document those constants came from,
the lattice fitted here measures **7.8015 px** — the same number, this time
derived rather than remembered.

```bash
node monospace-lab/payoff.mjs <pdf>     # ALWAYS FIRST — is this document worth labelling?
node monospace-lab/server.mjs           # http://127.0.0.1:8770
node monospace-lab/server.mjs --port 9000 --corpus F:/scans
node monospace-lab/selftest.mjs         # 14 checks, ~5 s
node monospace-lab/uitest.mjs           # 7 checks in headless Chrome, ~15 s
```

**Run `payoff.mjs` before you cut anything.** Hand-labelling only pays when a
cut answers for many cells, and whether it does is a property of the producer
that is invisible by eye. Measured 2026-07-31:

| document | cuts | cells | reuse | transfer to the next page |
|---|---|---|---|---|
| `corpus-cour832/EFTA00434905` p2 | 240 | 5,005 | **20.9×** | **99.9 %** |
| `courir-strech/EFTA02154109` p2 | 3,759 | 3,762 | **1.00×** | **1.3 %** |

The second one is not a labelling job at all — see *When the lattice isn't
there* below.

The server lists every PDF under `lab/base64/`, `fixtures/corpus/` and any
`--corpus` directory you add.

---

## The loop

1. **Pick a document and page.** The page is decoded, not rendered — see
   *Where the pixels come from*.
2. **Look at the fit line.** `column fit R=0.948 … row fit R=1.000` means this
   page really is on a lattice. `R` under 0.85 means it is not monospaced and
   the lab says so in red instead of drawing a grid over a Times page.
3. **Press `read`.** Everything with a template goes green; everything else is
   a red `□`.
4. **Press `n`** (or *next □*). The view jumps to the first unread cell and
   opens the crop.
5. **Type the character, press Enter.** The template is cut, saved, and the
   page is re-read — usually a few dozen more cells go green on that one
   keystroke. Auto-advance jumps straight to the next `□`.
6. **Repeat until the page reads.** On the canonical courier page that is
   **240 keystrokes for 5,005 cells** — the whole page, byte-exact.
7. **`export`** writes the transcript to `monospace-lab/out/`.

Other keys: `r` re-read, `0` fit page, scroll zoom, drag pan, `Del` in the crop
dialog deletes the template that matched (a wrong template is deleted, never
outvoted).

---

## What the lab decides, and how

### Where the pixels come from

`src/raster-node.mjs` decodes the largest embedded image XObject with mupdf and
sends the raw gray bytes to the browser in a 16-byte envelope. No PNG, no
canvas round trip, no colour management. This mirrors `lab/ingest.mjs` and
`tools/rasterize-mupdf.mjs`, and it is the reason a byte comparison downstream
means anything. A page with no embedded image carries vector text; the lab says
so and refuses, because rendering it would invent the pixels it is about to
certify. (pdf.js is not an option here and the reason is measured, not
aesthetic — see the note at the top of `tools/rasterize-mupdf.mjs`.)

### Rows

`src/lines.mjs` reuses the reader's own detection — `detectObjects` and
`findBands` from `engine/ocr-engine.js` — rather than reimplementing it. That
buys the rules, redaction boxes and whitened graphic dust being masked out
before anything looks for text, which is what the old lab's hand-tuned
`rowBands` existed to work around.

The ink bands are then **observations**, not answers: a row lattice is fitted to
their top edges and rows come from the lattice. Two lines whose bands fused
still land on separate rows, and a row's window is the same height everywhere on
the page whatever its tallest glyph happens to be. Bands that do not sit on the
lattice — a heading at another size, a signature — are counted and reported,
never quietly absorbed.

### Columns

The same fit, applied to ink-run starts: for a candidate pitch, project every
observation onto the unit circle at angle 2πx/p and take the resultant length.
The origin falls out of the resultant's argument, so no origin search is needed,
and `R` is an honest quality score. Sub-harmonics (p/2, p/3) score identically
by construction, so the estimator takes the largest pitch that scores as well as
the best — see `src/lattice.mjs`.

### The four buckets

Pens snap to the ¼-px lattice, so each character has exactly **four**
rasterizations and which one a cell carries is fixed by the fractional part of
its origin. A template only ever matches cells of its own bucket. The
**coverage** panel counts char × bucket for exactly that reason: it is the list
of what is left to cut.

### The match

A cell reads when some template reproduces its pixels **byte for byte**. Not
best-correlation: NCC survives only as a *suggestion* in the crop dialog, is
labelled "not evidence", and does not prefill the input — its top answer for a
`3` on this corpus is `P` at 0.47, and a wrong letter one Enter away from being
saved is how a dictionary poisons itself.

Because a human's crop is not reliably placed to the pixel (nor is a fitted cell
origin, which rounds either way at a 7.8 px pitch), every template is tried at
its nominal position **and at each of the eight neighbouring pixel offsets** —
three across, three down. A template cut one pixel off still reads, and the
offset that hit is recorded, so a systematic mis-cut shows up as a fact rather
than a mystery. **This is a tolerance on position, never on value.** There is no
knob here that can be turned to make a stubborn page read.

Nine offsets × every template × every cell would take minutes a page, so each
template is hashed once and each cell hashes the nine windows under it and looks
them up; every hit is then verified byte by byte, so a collision costs a compare
and can never produce a false read.

---

## The one-pixel crop, and what it costs

Templates are cut **one pixel in from each side of the cell**, because at a
7.8 px pitch a glyph's antialiasing reaches its neighbour's cell edge and a
template cut to the full cell carries a sliver of whatever letter followed it.

Measured on `lab/base64/corpus-cour832/EFTA00434905` page 2 (pitch 7.8015,
8-px cells, 5,005 inked cells):

| template width | distinct rasterizations | gutter ink | of which stroke (<160) |
|---|---|---|---|
| 6 — a pixel off each side | **240** | 17,753 px | 3,277 px |
| 7 | 271 | 4,543 px | 90 px |
| 8 — the whole cell | 867 | none | none |

The full cell is not an option: 867 classes *is* the neighbour bleeding in, and
every one of them would be a separate thing for a human to label. Cropping is
what makes the job finite.

But the crop is a **deliberate hole in the certificate** — the gutter columns
are never compared — and at width 6 this face loses 3,277 pixels of *stroke*,
not just fringe. So the certificate panel shows both numbers, `tmpl w` is a
knob in the toolbar, and the choice is the human's per document. Widen it by
one and watch the dictionary grow and the unverified ink shrink.

**Re-measure this table before trusting it.** It is a property of one face at
one pitch, not a constant — the table is here as a worked example of the
trade-off, not as a number to inherit.

---

## When the lattice isn't there

`courir-strech/EFTA02154109` (83 pages, 816×1073) looks like an ordinary
Courier base64 wall and is not one. What the pixels say:

- **240 cuts read 5,005 cells** on the cour832 control; **3,759 cuts read
  3,762 cells** here. Of those 3,759 rasterizations, **3** are ever used twice,
  and **not one of them spans two rows**.
- Cells from one row appear byte-identically on **no** other row — tested at
  every offset within ±2 px across and ±4 px down, so this is a different
  rasterization, not a misplaced window.
- Page 2's whole dictionary reads **1.3 %** of page 3, which is
  coincidence level, plus one deterministic column: the `>` quote marker, which
  matches on 57 of 61 rows. That column is real evidence — the layout **is**
  rigid from page to page, so a pen lattice solved once would hold for all 83
  pages.
- So there are **no ¼-px buckets on this document**. If there were four, a
  76-cell row would repeat a (character, bucket) pair by chance a few hundred
  times per page; it happens three times in 3,762 cells. Both axes are
  unsnapped: every (row, column) is its own sub-pixel position.

Row pitch is 14.3260 and column pitch 7.6715, against the control's 15.0000 and
7.8015 — down 4.5 % and 1.7 %, *different* factors, so this is not the control's
layout rescaled. The ink is measurably smeared: on the control the darkest row
of every line sits at offset 8 with peak darkness 8.0 % ± 1.2; here the peak
wanders across offsets 0–11 and averages 3.8 % ± 9.3. There are **no duplicated
scanlines**, so whatever happened was not a nearest-neighbour stretch.

That is as far as the raster can be pushed. A resample and a renderer that
places pens at unrounded sub-pixel offsets produce the same evidence, and
nothing in the page distinguishes them — the production path stays unproven.
What *is* proven is the consequence: **hand-cut templates cannot read this
document**, and the way in is to identify the face and generate rasters at the
measured offsets ([lab/README.md](../lab/README.md)), not to cut more.

## `resample-fit.mjs` — fitting the producer instead of labelling around it

For the `816×1073` family the answer is not templates and not a face hunt: the
page was resampled after rendering, so the only route is a forward model —
rasterize at the source resolution, apply the producer's resample, compare.

The trick is what you compare against. Fitting one isolated glyph leaves a
shallow valley: em64 and blur width trade against each other and 110 bytes
cannot separate them. But **every line of these documents starts with `>`**, so
a page carries ~60 instances of a known character in a known column. They share
an x sub-pixel phase (same column) and differ in y (the row pitch is
incommensurate with the resample period), so one configuration has to explain
sixty different y phases with a single pen origin.

```bash
node monospace-lab/resample-fit.mjs --null                   # certify the harness first
node monospace-lab/resample-fit.mjs --em 2500,2600,10 --fy 2.88,3.00,0.02
node monospace-lab/resample-fit.mjs --aspect 1.00,1.09,0.015 --fy 3.125 --ky tri:3.125
node monospace-lab/resample-fit.mjs --solve-y --dump          # the structural tests
node monospace-lab/resample-fit.mjs --synth --solve-joint     # ALWAYS beside a real run
```

**Every structural verdict here is a comparison against `--synth`, never
against zero.** The solves below are floored by their own approximations and by
the shared-raster premise; two of them were misread for two sessions because
nobody had measured the floor.

**Run `--null` before reading any fit.** At scale 1 with `box:1` kernels the
resample is the identity, so the whole path — render, fz composite, resample,
pen line, scoring — must reproduce a *native* courier page byte-exactly. It
does: 57/57 leading `>` on `corpus-cour832` p2, and it recovers that page's
15.0000 row pitch without being told it. That null is what makes a non-zero
score on the suspect mean something.

Three stages, deliberately separate. **FIT** lets each pen float inside a small
box, so a wrong (em64, factor, kernel) cannot hide behind one lucky alignment.
**LINE** then requires the fitted pens to collapse onto one line — robustly, 2σ
rejection then a refinement over (X0, Y0, pitch) — because the producer has one
pen origin and one pitch, not sixty free choices. **SCORE** re-fits with pens
*predicted* from that line. That last number is the objective; stage A's is not.

Measured on `courir-strech/EFTA02154109` p2, 2026-08-02:

```
BEST  em64 2540  fy 2.92  tri:3.125 / tri:2.63   186.7 Σ|Δ| per glyph, 0/57 exact
      pen x sd 0.122 src px          (all markers share a column ✓)
      pitch 14.3386 output px        vs 14.3260 measured independently ✓
```

The physics check passing is the substantive result: **one pen origin and one
pitch place every marker**, and the fitted row pitch matches the page's own to
0.01 px without being told it. The recipe is right in its geometry and wrong in
its greys.

### The two structural tests, which is what this tool is now for

Fitting has plateaued near 185 per glyph and no parameter search has moved it,
so the useful questions are no longer "which kernel" but "is it the kernel at
all". Both of these answer a whole hypothesis family at once:

- **`--synth`** — the positive control, and **run it beside every solve below**.
  The null certifies the forward path at *scale 1*, where the resample is the
  identity, so it never touched the solves that live inside the resample. This
  replaces every target with the forward model's own output at a known
  configuration, so each solve has a known answer and must find it;
  `--synth-jitter` scatters the pen off the line by a stated sd, which is how
  you find out what a floor is *made of*. Two of the verdicts on this page were
  wrong until it existed. Generation checks itself: regenerate and re-fit with
  the same config and the harness returns 0.0 per glyph, 57/57 byte-exact.
- **`--solve-y` / `--solve-x`** — the downscale is *linear* in its kernel taps,
  so an arbitrary non-parametric kernel can be solved exactly by least squares,
  and the 57 markers supply the 57 y phases that identify one. Neither axis
  collapses: free kernels score 186.5 (y) and 169.2 (x) against **measured
  floors of 6.0 and 1.2**. Freeing the vertical filter entirely moves 186.8 to
  186.5 — nothing. This is the same refutation the file used to state as "a
  free kernel cannot even beat the tent's 186.7", which was an artifact: the
  tent was scored through `axisW`'s exact continuous weights and the free
  kernel through binned taps, two different objectives. Assigning a source
  pixel to its *nearest* tap node also quantises a continuous offset, flooring
  the solve at 53.7 / 23.2 per glyph on data a tent explains exactly;
  **linear interpolation between nodes** is what makes the verdict readable
  (`--tap-nearest` reproduces the old numbers).
- **`--solve-src`** — the same idea aimed at the SOURCE instead of the filter:
  the downscale is linear in the source pixels too, so solve for the source
  raster itself. Its floor of 3.851 bytes is **not structural and says nothing
  about the resample**: on a control it is 0.133 with a perfect shared raster
  and 3.904 once a per-line sub-pixel phase scatter of one source pixel is
  injected and nothing else is wrong. That also explains why it is the same at
  every geometry — a phase scatter does not care about `fy`.
- **`--solve-joint` (`--k2d`)** — free source *and* free kernel together, which
  is bilinear, so alternating least squares. With `--k2d` the kernel is
  non-separable too, and the model becomes the most general linear downscale
  there is: any source image whatsoever through any fixed 2D filter whatsoever.
  It does not refute the downscale — real page 3.836 / 3.641 against 3.854 for
  the jittered control, i.e. the floor of the shared-raster premise. The
  positive result is the one worth having: **with the source free to be any
  image at all, the solved kernels come back at the tent pair** (y sd 1.069 vs
  tri:2.63's 1.074, x 1.258 vs tri:3.125's 1.276). It was once quoted as the
  sharpest instrument for `fy` in this repo (5.096 / 4.160 / **3.837** / 3.842 /
  3.900 / 4.679 over 2.9280…2.9304). **That is withdrawn** — it was measured
  before `--solve-phase` existed. Swept coherently with the phases free it is
  flat: 1.647 / 1.644 / 1.641 / 1.637 / 1.637 at P = 42 / 43 / 44 / 44.8084 /
  45. With the source free, `fy` is not identifiable at all, because a free
  source simply rescales with it — the solved kernel comes back at sd ~1.06 in
  the solve's own units at *every* `fy`.
- **`--solve-phase`** — frees each marker's sub-pixel offset as a third ALS
  block, which is what every other solve here holds fixed and what floors them
  all. Certified both ways before use: sd 0.002 src px on a perfect page, and an
  injected jitter recovered at residual sd **0.011 src px**, r 0.9993. It takes
  the real page from RMS 3.836 to **1.647**, so the phase was ~80 % of the
  floor. The phases are **deterministic, not jitter**: one wrapped sawtooth
  `frac(k·0.206929)` fits all 57 to 0.021 src px, where the same scan returns
  0.227 on randomly jittered data. Source line gaps are therefore 42.207 or
  41.207 src px — one source pixel apart — averaging 42.0002. *What produces
  that wobble is not identified* — but it is now known to be a **per-line**
  quantity, see `--phase-halves`, and its rate is a **stored constant** of the
  producer. The scan reports the rate's own error bar (`rms/√Σ(k−k̄)²`, since a
  rate error δ tilts marker k's phase by k·δ), and the two layouts agree inside
  it: prose cover p2 gives 0.206928 ± 1.69e-4, base64 body p10 0.207159 ±
  1.79e-4 — a 2.31e-4 gap against a combined σ of 2.46e-4, **0.94σ**. Combined:
  **φ = 0.207037 ± 1.23e-4**. Quote φ with its error bar or not at all; the
  precision on the *rate* is ±1.7e-4, not the ±2e-5 the scan's own
  reproducibility suggests.
- **`--phase-halves`, with `--synth-ramp`** — which of two mechanisms makes the
  wobble. Sampled once per line, `frac(k·0.206929)` is indistinguishable from a
  resampler whose *row mapping* carries a wrapping error `frac(β·y)` at
  β = 0.206929/42 src px per source row. They differ **inside** a window: a
  mapping error is a function of y and ramps across the glyph, a pen offset is
  constant. So fit each marker's offset separately on the window's top and
  bottom halves — sub-line resolution from the markers already in hand, which
  matters because more pages buy no more markers. `--synth-ramp` generates the
  ramp mechanism (pen on an exact integer-pitch line, wobble in the row mapping)
  so the test has a positive control. Read Δ = d(bottom) − d(top) by its
  **median**, not its mean: a wrapping ramp must put a whole-pixel discontinuity
  inside about one window in five, and those outliers wreck a mean.

  | | RMS | pitch scan | Δ median | Δ sd | wraps |
  |---|---|---|---|---|---|
  | no wobble (floor) | 0.167 | — | −0.0008 | 0.0060 | 0/57 |
  | per-**line** constant | 0.281 | sharp 0.206930 (0.0146) | −0.0102 | 0.0237 | 0/57 |
  | per-**row** ramp | 1.662 | **flat** 0.792762 (0.0950) | −0.0383 | 0.1962 | **9/57** |
  | **the page** | **1.647** | sharp 0.206929 (0.0212) | **+0.0039** | 0.0208 | **0/57** |

  The page is the per-line constant on all four statistics, 15σ from the ramp's
  median. **The ramp is refuted.** Note the near-miss worth remembering: the
  ramp reproduces the residual's *magnitude* almost exactly (1.662 vs 1.647) and
  none of its fingerprints. Magnitude agreement is not evidence.
- **`--joint-dump`** — *where* the joint residual lives, which is what separates
  a missing term from an instrument floor after the single number has stopped
  moving. Two views on the free source: per **cell** of the window, mean signed
  beside mean `|r|`; and per **marker**, so a residual carried by a few lines
  can never be mistaken for one spread over all 57. On the page the signed mean
  is ~0 everywhere while `|r|` reaches 5.7 — the residual **cancels across
  markers**, so it is marker-to-marker inconsistency and not a wrong shared
  image, which is precisely the thing a free source and a free kernel cannot
  reach. It is exactly zero on paper, rises with the ink gradient, and every
  marker carries the same 1.65 (min 1.38, median 1.65, max 1.86).
- **`--synth-phi-sample`** — the commutation control. Every solve here models a
  per-marker offset as a phase shift of the *resample* over one shared raster,
  `Σⱼ w(j−c−φₖ)·S(j)`; a layout wobble is a fresh *rasterization*,
  `Σⱼ w(j−c)·C(j−φₖ)`. Sampling and a tent do not commute. `--synth-phi`
  already generates the second (it moves `py64` and re-renders), so this
  generates the **first** — the solve's own model, exact by construction — and
  the difference between the two floors is the commutation term: **0.174**
  against **0.281**, i.e. 0.22 bytes RMS, where the page's 1.647 needs 1.63.
- **`--solve-phase-x`, with `--synth-jitter-x`** — a fourth ALS block freeing
  each marker's offset in **x**. All 57 markers are the leading `>` of their
  line in one column, so a shared x pen is the layout, not a convenience; a
  non-zero sd here is that claim failing. Certified both ways: 0.003 src px on
  a perfect page, an injected 0.2887 read back as 0.190 at r 0.9935, an
  injected 0.05 as 0.022. Note the **shrinkage** — `>` is nothing but
  diagonals, so an x shift trades against a y shift on every edge. The page
  returns **0.013**, so x is shared to ~1/75 of a source pixel.
- **`--moments`** — the model-free second moment, and the one thing here that
  touches no renderer, no kernel and no pen line. A per-line **offset** moves a
  marker's ink profile bodily: it changes the first moment and leaves the second
  *central* moment alone. A per-line **scale** changes that moment and nothing
  else to first order. So `V_k = Σp(y)(y−ȳ)²/Σp(y)` over each marker's vertical
  ink profile separates the two before any solve is allowed an opinion, and a
  scale of `(1+s)` gives `s ≈ ½·ΔV/V`. It self-checks on the *first* moment,
  returning the pitch **14.33868** and scatter 0.0912 px without being told
  either. Page **0.258%** against a floor of **0.277%** (`--synth`) and
  **0.288%** (`--synth-phi`, the measured offset and no scale) — *below* the
  instrument's own floor, where injecting 0.513% reads 0.562% at r 0.856. The
  estimator has a phase bias of its own, so two harmonics of `frac(k·φ)` are
  regressed out first; on this page they account for 0.3% of the variance.
- **`--synth-vscale` / `--synth-vscale-saw`, and `--solve-scale`** — per-line
  vertical **scale**: the generator, and the fourth ALS block that measures it.
  Offsets fix the first moment and a scale is the second, so no per-marker
  offset can absorb one — which is why this was the last class the `--joint-dump`
  signature admitted. The block is the phase block with the constant 1 replaced
  by a per-term lever arm and a Jacobian on the weight (a taller glyph really
  does carry more ink). Certified three ways: **0.211%** on a page with no scale
  (its floor — 57 free parameters absorb noise, so this is not zero), an
  injected random 0.513% recovered at slope 0.934 / r 0.913, and an injected
  *deterministic* sawtooth recovered with the scan finding **0.206898** at
  |r| 0.859. **The page: RMS 1.647 → 1.641, scale sd 0.293% against the 0.211%
  floor, |r| 0.135 against the offsets' own rate.** Calibration: injected
  0/0.267/0.513/1.026% gives RMS 0.281/0.347/0.491/0.837, ≈0.77 bytes per 1% of
  scale, so carrying the residual would take **~2.1%**. Refuted by ten times.
  `--solve-scale` refuses to run without `--solve-phase`: a scale about an
  anchor carries an offset, and alone it would quietly fit the first moment.
- **The energy split, printed by `--joint-dump`** — free, and it decides a whole
  class before any generator is written. Split `r` over cells and markers into
  the marker-**mean** map and what varies about it. A *shared* systematic (wrong
  outline, wrong filter, anything identical line to line) must put its energy in
  the mean; anything keyed to the sub-pixel **phase** cannot, because the 57
  phases are equidistributed and its sign cancels across markers. Page: **3.5%
  mean / 96.5% varying**, pairwise correlation 0.017, where chance alone is
  1/57 = 1.75%. The 0.281 control reads 0.3% / 99.7%.
- **`--synth-peny-lattice <a>`, and the LATTICE SCAN it certifies** — the
  producer asks for a continuous pen y and the renderer **snaps** it to a
  lattice of `a` source px, which is what mupdf's glyph cache does to upright
  text (`fz_subpixel_adjust` puts the vertical axis on `qmin = 0`, whole *device*
  pixels, at any size ≥ 8). It exists to give the lattice scan in the
  `--solve-phase` block a positive control.

  The scan asks whether the 57 fitted phases lie on **any** lattice the cache
  could emit, and the bound that makes it worth running needs no dpi at all: the
  cache's y quantum is one device px, `size` is the em in device px, and the
  cache ends at `size > 256` — so the finest lattice it can produce is
  **em / 256**, in the em's own units. Raising the resolution to shrink the
  device pixel drives `size` through the same ceiling. Above 256 an FT font is
  **path-filled at a continuous pen** (see [LAWS §1b](../docs/LAWS.md)).

  | page | best spacing | rms distance | ×uniform |
  |---|---|---|---|
  | `--synth-phi` (continuous) | 0.1599 | 0.0421 | 0.91 |
  | `--synth-phi --synth-peny-lattice 0.1875` | **0.1874** | 0.0162 | **0.30** |
  | **the real page** | 0.2644 | 0.0691 | **0.90** |

  The page is the continuous control. **Two traps, both caught by that control
  before any verdict was read.** The uniform null `a/√12` is only valid while
  the cell is smaller than the phases' own spread — above it, 57 samples in one
  source px cannot fill a cell, every coarse spacing "fits", and a page with no
  lattice reported one at 1.4999 / 0.66×; the scan is now capped at half the
  phase range, and coarser spacings are excluded by the phase sd (0.267) instead,
  since one lattice point would take every marker. And the verdict is on the
  **ratio**, never the rms: the rms falls with the spacing, so the smallest
  admissible cell always looks tightest.
- **`--synth-outq <denom>`** — the producer carries the transformed outline at
  `1/denom` **source** px instead of FreeType's 1/64, rounded *after* the pen
  translate, so each line's sub-pixel position rounds its points differently and
  every line is a different **shape**. (Not `--penq`, which moved the pen — the
  first moment, absorbed entirely by the phase block; not `--gridfit`, which
  snapped extrema to whole rows.) It needs `FTClone.outQ64`, which is 0 by
  default and certified inert. **Refuted, by its own second statistic**: a
  phase-keyed shape perturbation must show up as RMS *and* as extra scatter in
  the fitted phases, and the two do not meet.

  | quantum | joint RMS | sawtooth-scan residual |
  |---|---|---|
  | none | 0.281 | 0.0146 |
  | 1/32 | 0.285 | 0.0160 |
  | 1/16 | 0.297 | 0.0230 |
  | 1/8 | 0.521 | 0.0231 |
  | 1/4 | 0.991 | 0.0277 |
  | 1/2 | **1.584** | 0.0570 |
  | **the page** | **1.647** | **0.0212** |

  A factor of ~8 apart in the quantum. Note the near-miss ran the same way it
  always does here: 1/2 src px matches the magnitude *better* than the
  row-mapping ramp did (1.584 vs 1.647, where the ramp was 1.662) and fails the
  fingerprint outright. **The general bound is the reusable part**: the page's
  phases fit one sawtooth to 0.0212 against a 0.0146 floor, leaving
  √(0.0212²−0.0146²) = 0.0154 src px for any phase-keyed mechanism to hide in;
  the 1/2 run prices phase scatter at ~29 bytes RMS per src px, so the whole
  budget buys ~0.45 RMS — a quarter of what is needed. **Quote that bound only
  for what it bounds**: it prices mechanisms that move the fitted *centroid*. A
  phase-keyed mechanism that is centroid-neutral spends none of it — which is
  what the next test is for.
- **The phase-smoothness test, printed by `--joint-dump`** — the direct version
  of that question, with no mechanism in it. Regress the 57 markers' residuals
  *cell by cell* on two harmonics of φ and measure the explained fraction of the
  marker-varying energy. (This is the PCA question with the arbitrariness
  removed: rather than extract components and test each one's coefficients for
  smoothness, project every cell's marker-series onto the basis at once.) **The
  null is not zero** — 5 basis functions over 57 markers explain 5/57 = 8.8% of
  anything — so the control is φ **permuted**, which destroys the pairing and
  keeps everything else. Page: **0.7%** against a permuted null of median 8.7%,
  max-of-40 16.4% — *below* its own null. Positive control, `--synth-outq 2`
  (genuinely phase-keyed, generated at the page's own 1.584 RMS): **21.4%**
  against 7.3 / 12.2. The instrument sees the thing at the scale in question and
  the page has none of it, so the phase-keyed class is closed *including* its
  centroid-neutral members.
- **The Δk lattice test, from `--joint-dump` — AN UNREAD INSTRUMENT. Do not
  quote anything from it except the page-vs-control comparison at matched Δk.**
  The idea is sound: a source-side block lattice of `B` px at pitch `P` makes
  line `k`'s block phase `P·k mod B`, periodic in `k` (B = 8, P = 42 → period
  4), so markers sharing a block phase should carry correlated residual maps.
  Grouped by Δk mod 4 the page gives z = −1.87 / +0.95 / +0.48 / +0.35 against a
  permuted-label null and the control gives −2.26 / +0.29 / +0.86 / +1.02 — no
  excess, so **the JPEG-8 prediction fails**. But the page also lights up at
  M = 5 (z +4.5 / −7.1 / +4.7) where the control is flat, and that must *not* be
  read: plotted against Δk itself, the **control** — no per-line defect, floored
  at 0.281 — shows strong structure of its own, decaying +0.33 → −0.14 with
  z up to 9.7. Some of that is a component linear in `k`, which gives
  `<rₐ,r_c> ∝ (kₐ−k̄)(k_c−k̄)`: positive for pairs on the same side of the mean,
  negative for opposite sides, a decay owing nothing to any lattice. Projecting
  it out per cell halves the effect and does not remove it (control still z 9.0
  at Δk = 3). The permutation null is therefore invalid for this statistic.
- **The row profile, also from `--joint-dump`** — the window is 15 output rows
  against a 14.34 pitch, so it is *taller than the line pitch*, and the model
  renders one glyph on blank surround. Unmodelled neighbouring-line ink would
  fit every measured fact (marker-varying through the neighbours' phases,
  pairwise uncorrelated, centroid-neutral, unabsorbable by any block here). It
  is not there: the six edge rows carry **0.2%** of the varying energy and hold
  **zero** bytes below 255, darkest exactly 255 over 684 bytes per row, while
  99.8% sits in the glyph interior. The ink is ~8.5 of the 14.34-row pitch, so
  ~5.8 rows of paper separate consecutive glyphs and a window anchored 3 rows
  above the ink top ends inside that gap.
- **The sawtooth scan over scales must exclude rate ≈ 0 and 1**, and this reads
  as a strong result if you let it. Over `k = 6..65` a rate below ~1/60 never
  wraps, so `frac(k·φ)` is a straight line in `k` and the scan reports the
  estimator's own linear drift — **|r| 0.805 on a control with no sawtooth in it
  at all**. Demanding two wraps removes it. The offsets' pitch scan was never
  exposed to this, because it fits a wrapped residual rather than a correlation.
- **`--synth-qy` / `--synth-qx` / `--synth-tapq`** — a fixed-point scaler, whose
  error is *zero on flat source and proportional to local contrast*, which is
  the page's signature. `--synth-q*` quantises the sampling centre to a lattice
  of `1/q` src px (a filter table indexed by the top accumulator bits);
  `--synth-tapq` holds the taps as integers summing to exactly `tq`
  (largest-remainder, so the filter stays unit-gain — which is *why* its error
  vanishes on paper). Both refuted: q = 8/16/32/64 → 0.564/0.378/0.306/0.294 and
  tq = 32/64/128/256 → 0.569/0.384/0.315/0.293, against 1.647. Caveat: a free
  kernel absorbs part of any phase-dependent error, so these bound the two as
  *carriers* — they do not prove the producer used floating point.
- **Read the clamped RMS beside the free one.** Freeing x alone (y frozen)
  reports 1.666 against 3.836 and it is *not* a result: the clamped RMS goes to
  41 and the free raster to mean |Δ| 28 with pixels at −255. A source that
  leaves [0,255] is not a source, it is the solver in the null space.
- **`--nudgey`** — widens the per-marker Y nudge alone. The default ±¼ px was
  set when the pen was believed to lie on one line to that precision; the
  measured wobble has a **full source pixel** of range, so ±¼ px structurally
  cannot absorb it and every score taken with it charges the wobble to whatever
  model is under test. That matters most when two models are being compared and
  neither predicts it. `--nudgey 32` moves the baseline 186.8 → **177.3** on its
  own. X stays narrow: all 57 markers share one column.
- **`--pitch`, with `--synth-pitch` / `--synth-phi`** — a sub-pixel wobble about
  an integer pitch and a genuine non-integer pitch are different physics (the
  second drifts `(P−42)·k`, 12 px over this page), and these generate each so
  they can be told apart: a true 42.2069 folded at 42 blows up to RMS 11 with
  the kernels collapsing, while a wrapped sawtooth about 42 reproduces the page.
  So the line positions are bounded within ±0.5 src px of 42·k, and a genuine
  non-integer pitch is excluded. **But this does not measure the pitch.**
  Sweeping the fold looks like a sharp minimum at 42 (15.615 / 7.866 / 1.803 /
  1.648 / 1.759 / 6.134 over 41.9…42.05) only if you hold `fy` while moving `P`
  — and those are not independent, since the *output* pitch is a page property
  and a coherent sweep must co-vary `fy = P/14.33868`. Done coherently it is
  **flat**: 1.648 / 1.648 / 1.652 / 1.652 / 1.647 / 1.650 over 42.0…43.0.
  Freeing the phase destroys the pitch information, because a fold error of δ
  per row is exactly what a per-marker offset absorbs. The integer-pitch law
  therefore rested entirely on the *constrained* `n = 40..45` sweep — **and that
  sweep is now withdrawn too**, see the trap below.

### The trap that cost three verdicts: sweeping a scale without holding the physics

Kernel widths are carried in **source** px and glyph size in em64, so moving
`--fx` or `--fy` silently moves the *physical* filter footprint (`k/f` output
px) and the *physical* glyph size (`em·aspect/f`). A sweep of a scale factor is
therefore a sweep of three things at once, and every "sharp interior minimum"
in a scale factor this lab has reported was the other two.

Hold the physics and move only the source lattice — leave the x geometry
untouched, co-vary `--aspect f/f0` and `--ky` ∝ `f` — and the objective goes
flat:

| sweep | as originally run | like-for-like |
|---|---|---|
| `fy`, n = 40…45 (+ uniform 44.8084) | 224.5 / 195.1 / **186.9** / 197.9 / 229.8 / 275.6 | 177.2 / 176.3 / 177.0 / 175.4 / 177.1 / **177.5** / 176.9 |
| `fx`, 23/8…27/8 | 298 / 215 / **187** / 222 / 287 | 173.5 / 180.1 / 173.5 / **171.8** / 175.6 |

So neither scale factor is identified by a shape fit, and **anisotropic-42 and
uniform-25/8-with-a-stretched-outline are the same model in different vertical
units** — at the matched kernel (tri:2.63 × 1.06687 = tri:2.806) they score
177.3 against 177.4. A shape fit cannot see a source *lattice*; only a repeat
can, which is why the Δcol=48 byte-identity still pins fx's **denominator** to
8 and why the y axis — where 61 rows never realign — has nothing at all.

What survives is stated in **output** px, where it is invariant: the glyph is
1.0669× taller than Courier New's natural aspect, the x filter is a tent of
1.00–1.05 output px (bilinear at this scale) and the y filter a tent of 0.93.

**The y filter is not secretly bilinear**, and the obvious way it could have
been is measured and refuted (2026-08-03g). The proposal: 0.93 is an artifact
of charging a per-line effect to the kernel, so absorbing the wobble should
walk y toward 1.00 and collapse the pipeline to plain bilinear on both axes.
Four instruments, all on the page:

| instrument | source | wobble | y tent, output px |
|---|---|---|---|
| tent sweep, em free at each width | cour.ttf | absorbed (`--nudgey 32`) | **0.929** (interior min) |
| `--solve-y` free kernel | cour.ttf | default nudge | 0.937 |
| `--solve-y` free kernel | cour.ttf | absorbed | 0.947 |
| `--solve-joint --solve-phase` | **free** | free per marker | **0.890** |

The swept scores are 191.5 / 177.3 / **174.6** / 178.1 / 186.7 / 208.1 / 239.8
at 0.850 / 0.898 / 0.929 / 0.960 / 1.000 / 1.050 / 1.100 — the same clean
interior minimum the narrow nudge found, with bilinear still 12 per glyph
worse. The free kernel moves 0.937 → 0.947 when the wobble is absorbed, a
tenth of what was needed; the joint solve moves *away* (0.894 → 0.890) when the
phases are freed. x is 0.993 in the same run. Read the joint number with its
units caveat: with the source free `fy` is unidentifiable, so 0.890 rescales
with whatever `fy` you assume — the pinned-source readings carry the absolute
scale, and both sit 6–7% under bilinear.

A fifth route was added 2026-08-03u and it fails the same way, from the other
side: if 0.93 were a shared *nonnegative* tent's honest compromise across a
**per-line kernel walk**, then data generated at tent(1.000) ⊗ CR(δ_k) would
read back narrow. It reads back 1.000, and at a walk large enough to move the
estimator at all it goes to 1.100 — **wider**. See `--synth-shift` below. The
asymmetry is still unexplained, and it is now unexplained against five
instruments rather than four.
- **`--phase`** — that premise, tested model-free off page pixels alone, plus
  the sharpest pitch this repo has. It measures the row pitch from ink
  centroids (**14.33868 ± 0.00073 px**, which excludes the row detector's
  14.3260 by 17σ), then asks whether markers at equal phase carry equal
  windows. They do, to within the precision of the phase itself: the
  zero-phase intercept is 1.095 bytes/px against 1.117 predicted by centroid
  scatter alone. **Do not read that as "no per-line variation"** — it infers
  phase from the ink centroid, whose scatter is partly its own bias, while
  `--solve-joint` reads the pixels directly and does see marker-to-marker
  inconsistency worth ~0.29 source px.
  **Anchor on the continuous centroid line, never on detected
  ink** — an ink-top anchor is an integer row that jumps ±1 with phase, and
  that whole-pixel shift swamps the sub-pixel effect being measured (it moved
  the intercept 3.256 → 1.095 and flipped the verdict).
- **`--penq` / `--gridfit` / `--super` / `--law` / `--lut`** — the source-render
  axes, all refuted 2026-08-03. `--lut` is the one worth knowing about: it
  bounds *every* levels/gamma/tone-curve hypothesis at once by asking whether
  the page byte is a function of the model's continuous value. It is not.
- **`--dump`** — the residual averaged over all 57 y phases. Mean *signed* next
  to mean *absolute*: where they agree the error is systematic, where the
  signed map is ~0 under a large absolute one it is only phase noise. Here they
  agree cell for cell, and the map is exactly zero on paper — the glyph's
  extent is right and its greys are wrong.

- **`--ofat`** — one factor at a time around a baseline, every factor on the
  same objective. What matters is each variable's *shape*, not its best value:
  a sharp interior minimum means the page identifies it, flat means the page
  does not constrain it and any fitted value is noise. Spans in Σ|Δ|/glyph:
  aspect 162, ky width 139, ky type 131, fx 111, fy 99, kx type 74, kx width
  56, **em64 42**. `fx` has a sharp minimum at exactly **25/8** — which closes
  the ambiguity the Δcol=48 identity left open, since that identity pins only
  the *denominator* to 8. Both kernels are tents decisively. And em64 is the
  flattest thing here, so **do not read a font size off this fit**; that is why
  five sessions each reported a different one. The optima also do not combine —
  taking every factor's best together scores *worse* than the baseline.

### `--synth-shift` — the interpolated-shift discriminator, and why it lands on the blank line

The `08-03s` squeeze left exactly one mechanism class standing: *applied once
per glyph, as a function of the pen's grid residue, deforming the glyph without
translating it.* Its named candidate was a glyph rasterised on a lattice of
spacing `g` and composited at the exact position by an interpolated shift —
linear `(b)` or Catmull-Rom `(b′)`.

```bash
node monospace-lab/resample-fit.mjs --shift-algebra           # verify the six closed forms first
node monospace-lab/resample-fit.mjs --em 2530 --fy 2.92916 \
  --synth --synth-shift cr --synth-shift-g 0.925 --solve-joint --solve-phase
```

The shift is generated **exactly**: the two- or four-tap convolution is computed
by *rendering the glyph at each tap position and blending*, never by resampling
a raster, so the moments are the kernel's own closed forms. `--shift-algebra`
checks all six to 4.4e-16 before anything leans on them.

**`g` is not a free knob — the wobble pins it.** Under this mechanism the
per-line wobble *is* the shift (the centroid lands at `line + δ_k·g`), so
amplitude and deformation are one parameter, and the measured phase sd of 0.267
src px forces `g = 0.925`. That closes the question by itself:

| g (src px) | joint RMS | phase sd | pitch scan |
|---|---|---|---|
| 0.925 — *what the wobble permits* | 0.345 | 0.281 | sharp 0.206860 |
| 2 — *what the RMS needs* | 1.652 | 0.642 | sharp **0.413918** |
| **the page** | **1.647** | **0.267** | **sharp 0.206929** |

The two statistics miss each other by ~2× in `g` and ~8× in RMS — the same
pincer that killed outline quantization, and the fourth mechanism here to match
a magnitude and fail its fingerprints. At `g = 2` the scan rate *doubles*,
because a wobble spanning two source px wraps twice per fold.

Four independent statistics at the permitted `g`, each with both arms certified:

| row | statistic | page | CR g=0.925 | LIN g=0.925 | verdict |
|---|---|---|---|---|---|
| 1 | `--solve-y` shared kernel sd | (1.064) | 1.036 | — | story **survives** — no lobes |
| 2 | μ₂ ψ-keyed R² | **0.2 %** | **28.2 %** | 25.6 % | refutes both |
| 3 | shared tent width, gen at 1.000 | 0.925 | **1.000** | — | refutes |
| 6 | residual amplitude vs ψ | **1.7 %** | **33.9 %** | — | refutes |

Nulls are ψ **permuted**, never zero — five basis functions over 57 markers
explain 5/57 = 8.8 % of anything.

Three instrument facts came out of building it, and each one changes a reading:

- **`--moments` regresses two harmonics of ψ out of the width series**, which is
  right for the per-line-scale question it was built for (`08-03g`) and wrong
  here: a linear-interpolation width modulation `δ(1−δ)g²` *is* a function of ψ,
  so the de-biasing removes the term being voted on. The μ₂ channel is now
  reported both ways. This withdraws the `08-03s` selection of (b′) over (b).
- **Clamping manufactures the discriminator.** `μ₂ ≡ 0` is exact for
  Catmull-Rom and `--synth-shift-noclamp` confirms it (4.2 %, not keyed) — but
  clamped and rounded to bytes the same data reads 28.2 %. The producer emits
  bytes (paper is exactly 255, zero variance), so the byte arm is the physical
  one, and it kills *both* families rather than separating them.
- **The tent estimator moves the wrong way.** A CR walk biases the fitted width
  **wider** (1.000 → 1.100 at g = 2), not narrower, so the 0.93 does not rejoin.
  `08-03r`'s original objection was right and `08-03s`'s withdrawal of it is
  refuted. The 10 % x/y filter asymmetry stays a separate unexplained fact.

**`--amp` (inside `--solve-phase`): the y accumulator's amplitude, fitted for
the first time.** The pitch scan fits `frac(k·φ)`, whose range is 1 *by
convention*, so the amplitude had been inherited as "one model source px" — a
unit that is not identifiable. Fitted free with the sawtooth **origin scanned**
(an OLS assuming origin 0 returns a *negative* amplitude at 12× the residual):
**0.32018 ± 0.00189 output px**, certified unbiased to 0.3 % against
`--synth-phi`, whose true amplitude is exactly 1.0 src px. Two consequences: it
is 24σ from the x layout grid `u = 0.274220`, so **one grid does not run both
axes**; and it sits 0.04σ from the carry-drop rung `pitch/(m + 1 − φ)` at
m = 44, on the branch nobody had scored — but rungs are only 1.5σ apart across
two branches, so quote that as suggestive, never as decisive.

> **Trap: `--solve-joint --solve-phase` with no geometry pinned is an unread
> instrument.** The default sweep grid (`--fy 2.88,3.00,0.02`) does not contain
> 2.92916, so the solve starts from the wrong geometry and diverges — RMS
> 8.4–12.9 free against 42–45 *clamped*, phase sd 0.453 instead of 0.267, and
> the pitch scan reporting **flat**. Taken at face value that says the wobble is
> not deterministic and the whole `08-03d` result is wrong. Every
> `--solve-joint` number recorded for this family needs `--em 2530 --fy
> 2.92916`.

### `--synth-cover` — the coverage-nonlinear rasterizer, and `--score-bands` reading it

The last mechanism class standing for the third accumulator was a gen-1
rasterizer whose **coverage is a nonlinear function of the sub-pixel y phase**.
Everything whose render is `M(y + δ)` to first order is pre-refuted, so this
generator does not move a pen: it rasterizes on an internal y lattice of spacing
`a` source px and decides each cell's ink by a named zero-parameter rule.

```bash
node monospace-lab/resample-fit.mjs --em 2530 --fy 2.92916 --synth \
  --synth-cover thresh --synth-cover-n 512 \
  --solve-joint --solve-phase --pin-phase --resid-out r.bin --model-out m.bin
node monospace-lab/resample-fit.mjs --score-bands r.bin,m.bin \
  --score-page pg_res.bin --score-k pg_k.bin
```

| rule | V per cell | |
|---|---|---|
| `area` | `C` | the identity — **a control**, linear in coverage |
| `thresh` | `[C ≥ ½]` | bitonal supersampling |
| `scan` | coverage on the centre scanline | exact in x, *sampled* in y |
| `any` | `[C > 0]` | conservative fill |
| `full` | `[C = 1]` | the pessimistic rule |

Cell coverage is **exact, not supersampled**: the render runs on sub-rows `a/32`
tall and `C` is their mean, which *is* the cell's area coverage — the
subdivision buys resolution for `scan` and nothing else. Cells are resampled onto
the 1-src-px grid by exact area overlap, so the solve sees the piecewise-constant
image gen-1 would have emitted.

**Two things about it that are measured, not chosen.** The lattice phase comes
from the **nominal** y, so the lattice rides with any wobble — that configuration
is what the sideband bound `β ≤ 0.184` cycles forces. And `a = pitch/(n + θ)`
holds `frac(pitch/a) = θ` for every integer `n`, so **the rate is not a free
parameter** and `n` moves only the coarseness.

> **Trap: a raw target cannot be read.** At `--synth-cover-theta 0` — no per-line
> phase walk at all — the generated targets still carry **35.5 % marker-varying
> energy**. That is not a bug: it is one *shared* source difference sampled at the
> 57 distinct `δ_k` of the resample. Only the solve, whose free shared source
> absorbs it, separates a per-line mechanism from a shared source change.

`--score-bands` is the forward build's scorer: five pass-bands declared in
`families.mjs` before any render, printed above every score and appearing nowhere
else in the verdict logic. **Pass requires all five simultaneously.** The page
reads 94.4 % / 0.807 / 2.8 % / 0.015 out px / 0.000°; the no-quarry static arm
reads 13.2 / 0.768 / 13.6 / 0.001 / 89.87. The page reference is a *derived*
file — regenerate with the same solve plus `--k-out`, and check it announces
itself (rms 1.6520, k = 6..65 with gaps 6→9 and 10→12).

**The grid was read once (5 rules × 4 rungs) and no cell landed the
conjunction.** What it did show: this class reproduces the page's *form* —
first-harmonic 86–97 %, axis ratio 0.68–0.88, reachability 4–8 % — where every
displacement mechanism reads 66–75 %, 0.008–0.042 and 49–63 %. It does not
reproduce the plane's identity at any named member. Full table in the family
entry, 08-05h.

### The geometry is pinned by a law, not a fit

`--aspect` exists because the ~6 % vertical excess has two possible homes, and
they are different physics: an anisotropic **resample** (`--fy` below `--fx`)
squeezes a uniform render afterwards, while an anisotropic **text matrix**
(`--aspect` above 1) stretches the outline *before* rasterization. They score
186.7 and 195.1 and leave the same residual, so scoring cannot separate them.

What separates them is the **producer's own layout law**, measured on the
courier documents that already read: across all four `corpus-cour832`
documents the row pitch is *exactly* 15.0000 device px and the pen origin is on
the ¼-px lattice, while the column pitch is not integral — each line's text
operator goes on an integer grid, advances run fractional. Requiring the same
of the suspect's *source* render admits only `fy = n/14.3386`, and `n = 40..45`
scores 224.5 / 195.1 / **186.9** / 197.9 / 229.8 / 275.6: a sharp winner at
`n = 42`, `fy = 2.92916`, refining to **177.3 per glyph at em64 2530** with the
pen origin landing on the ¼-px lattice unprompted. The text-matrix reading is
refuted outright — it needs a source pitch of 44.81, and the nearest integer is
3.7 px adrift over 61 rows.

## Files

| | |
|---|---|
| `server.mjs` | the only server: UI, page decode, template store, export |
| `src/raster-node.mjs` | producer bytes out of a PDF (mupdf, decode not render) |
| `src/lattice.mjs` | the lattice fit — pitch, origin, quality score, ¼-px buckets |
| `src/lines.mjs` | rows, columns, and where the template rect sits in a cell |
| `src/match.mjs` | the byte-exact matcher, the ±1 search, the page read |
| `src/templates.mjs` | what a template is and how it is named |
| `index.html` `app.js` `style.css` | the human's half |
| `payoff.mjs` | is this document worth labelling by hand — run it first |
| `resample-fit.mjs` | fit the producer's downscale against every known glyph on a page |
| `selftest.mjs` | the gate — measurement, matching, and the crop rule, headless |
| `uitest.mjs` | the same loop driven through headless Chrome |
| `templates/<pool>/` | saved templates, one JSON per cut, raw gray bytes |
| `out/` | exported transcripts |

Templates are grouped into **pools** by corpus folder, so Courier templates are
never offered to a Times document. `window.LAB` exposes the whole app state and
its verbs in the browser console (`LAB.S.grid`, `LAB.read()`); that is also how
`uitest.mjs` plays a human loop without a mouse.

### What the selftest does and does not prove

It gates measurement and matching: the lattices fit, the page reads completely
from a finite dictionary, one template answers for many cells, a template cut
one pixel off still reads, a blank template never explains ink, and the crop
rule pays for itself. It **cannot** check that the characters are *right* — the
lab ships no truth file, and identity is the human's half of the loop. On a page
that is not monospaced the lattice checks **skip loudly** rather than pass.
