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
node monospace-lab/resample-fit.mjs --em 2560,2660,4 --sigma 0.32,0.40,0.48
node monospace-lab/resample-fit.mjs --doc <other.pdf> --em 3100,3300,4   # a 12 pt source
```

Two stages, deliberately separate. **FIT** lets each pen float, so a wrong
(em64, kernel) cannot hide behind one lucky alignment. **PHYSICS** then checks
that the fitted pens lie on one line — a config that scores well only by
scattering its pens has not found the producer.

Measured on `courir-strech/EFTA02154109` p2, 2026-07-31:

```
BEST em64 2604  σx 0.40  σy 0.40          = 40.69 source px = 9.77 pt at 300 dpi
PHYSICS  pen x sd 0.000 source px         (all markers share a column ✓)
         pen y pitch 14.3359 output px    vs 14.3260 measured independently ✓
         residual sd 0.290 source px
VERIFY   40 markers, pens PREDICTED from that line: 2.67 per byte
```

The physics check passing is the substantive result: **one pen origin and one
pitch place every marker**, and the fitted row pitch matches the page's own to
0.01 px without being told it. The recipe is therefore right in its geometry
and still wrong in its greys — `2.67 per byte over 4,000 bytes` is the number a
correct recipe drives to 0, and it is the honest objective. The old
single-glyph score is not; it was small because it was easy.

**em64 lands on 2600, not 3200.** 2600 = 832 × 25/8 exactly — i.e. the source
is `cour13` (the readable courier family's own size, 13 px at 96 dpi) rendered
at 300 dpi. If other documents in the corpus are Courier **12 pt**, that is
em64 3200 at 300 dpi and a different sub-family; point this tool at them with
`--em 3100,3300,4` and let the physics check say so.

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
