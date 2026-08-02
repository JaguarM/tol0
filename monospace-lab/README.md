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
  tri:2.63's 1.074, x 1.258 vs tri:3.125's 1.276). It is also the sharpest
  instrument for `fy` in this repo — 5.096 / 4.160 / **3.837** / 3.842 / 3.900
  / 4.679 over 2.9280…2.9304, good to ±0.0005 against `--ofat`'s ±0.04.
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
