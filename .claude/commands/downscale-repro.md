---
description: The page-downscale family (17 documents, 816×1073) — CLOSED on the certified-□ outcome 2026-08-05h; the obstruction, what must not be reopened, and what would license reopening it
---

The `page-downscale-816x1073` family — **17 documents, 100 % □, no pool**, and
as of **2026-08-05h it is CLOSED on the certified-□ terminal outcome**. Both
branches declared in advance were findings; this is the one that happened. Not a
face hunt: the pages are a high-resolution render put through a downscale, so no
`(face, em64, pen, law)` can reproduce them and every roster sweep fails by
construction.

Full record, every number and every refutation:
[lab/families.mjs](../../lab/families.mjs) → the `page-downscale-816x1073`
entry, twenty-five dated blocks (08-02 … 08-05h). **Read it before touching
anything here.** The refuted-or-unsupported candidate list is **twelve entries
long** and every item on it cost a session.

## THE CLOSURE, IN ONE PAGE

The last class standing was **coverage-nonlinear rasterization** — thresholding,
or supersampling on a coarse internal lattice — configured **upstream of the
wobble** (measured, not assumed: sideband bound β ≤ 0.184 cycles, 08-05d). The
forward build was pre-registered (08-05e), its arms read green (08-05f/g), the
generator was written and the grid read once (08-05h).

**Result: no cell lands the conjunction; the class is UNSUPPORTED.** But the
grid returned the family's first positive result, and it is the reason the
closure is worth handing on:

| | page | this class | every displacement mechanism |
|---|---|---|---|
| first-harmonic fraction | 94.4 % | **86–97 %** | 66–75 % |
| ellipse axis ratio | 0.807 | **0.68–0.88** | 0.008–0.042 |
| four-field reachability | 2.8 % | **4–8 %** | 49–63 % |
| principal angle to the page plane | 0.000° | **46–90°** | 84–85° |

So the 08-04h specification — *smooth in the phase, elliptical in the plane,
orthogonal to all four first-order image deformations* — **is satisfiable**, and
by this class specifically. What no named member reproduces is the plane's
**identity**. A class that makes the page's *kind* of structure and not the
page's structure is a sharper obstruction than "one class remains untested".

**The obstruction, characterised:** plane real and two-dimensional (1.50 of 1.65
bytes); rate pinned (θ = 0.05850, s = −0.5813 against a Mantel null minimum of
−0.1710 in 400 draws); share measured (59.8 %, ~1.155 bytes); transfer curve a
near-pure sinusoid (94 % first harmonic, axis ratio 0.807); configuration
measured (upstream of the wobble); patterns unreadable (seven spatial statistics
ensemble-owned).

## DO NOT REOPEN

- **The grid.** 5 rules × 4 rungs, read once, no tuning after scores. A second
  round with adjusted spacings is **a new enumeration with its own declared
  look-elsewhere**, never a refinement of this one — the 95 %-coverage lesson
  (08-05c) applies to filter families exactly as it applied to grid densities.
- **Anything on the refuted list**, and in particular: shift interpolation in
  both forms (08-03u), representation error (08-04b), final-downscale aliasing,
  block-transform quantization, additive banding, illumination ramps, pointwise
  tone response, a traveling wave in y, a second smaller pen wobble, pen-position
  quantization (the four-rung ladder), outline grid-fitting (closed with hinting).
- **Arithmetic on 0.05850.** 1/17.1 is the bait the ledger's 0.20692-vs-φ and
  m = 44 entries exist to refuse. **2.61545 src px is not a producer constant** —
  it was reverse-engineered from θ to build the sensitivity arm.
- **The n = 16 sub-null angles** (46.17, 47.46, 50.69° — the first things not the
  page to sit under the 56.69° null minimum). The **linear control rule reads
  50.69° in the same batch**, so they belong to a box average sliding at θ, which
  all five rules inherit. Eighth instance of ensemble ownership; a lead for
  nothing.

## What is still genuinely open, and it is small

- **θ ≳ 0.5 is unsurveyed** — the scan recovers 1/12 even at full amplitude
  there. The licensed sentence stays "structure found at 0.0585", never "the only
  structure is at 0.0585".
- **The aspect 1.0669** — untouched by all of this. One provenance-guided
  candidate was never enumerated: driver-distributed Courier replacements
  (HP Dark Courier — taller, same advance), and it is **not on this machine**
  (both font dirs and `lab/.fontstage` checked, 08-05e). One targeted fetch, not
  a roster. If it arrives: score the aspect and check the outline against the
  page's certified metrics **with the tolerance stated in advance**, or the font
  check becomes a knob consulted after a miss.
- **PARKED: the profile estimator's +0.071 px/48 cols.** Real, cause unknown.
  Do not use the profile fundamental for this document's advance.

**What would license reopening the family:** a genuinely new mechanism class with
a named member and a pre-registered signature, or an instrument that reads the
two basis patterns as images — which seven statistics have now failed to do, all
of them ensemble-owned at this operating point.

## The instruments, all committed and gated (checked against git, 08-05h)

```bash
node monospace-lab/resample-fit.mjs --null          # the renderer null, run it FIRST
node monospace-lab/resample-fit.mjs --em 2530 --fy 2.92916 --synth \
  --synth-cover thresh --synth-cover-n 512 \       # the nonlinear-coverage generator
  --solve-joint --solve-phase --pin-phase \        # THE certified arm invocation
  --resid-out r.bin --model-out m.bin
node monospace-lab/resample-fit.mjs --score-bands r.bin,m.bin \
  --score-page pg_res.bin --score-k pg_k.bin       # the five pass-bands
```

The page reference is a **derived** file, not a constant — regenerate it with the
same solve plus `--k-out pg_k.bin` and check it announces itself: **rms 1.6520,
k = 6..65 with gaps 6→9 and 10→12**. `Buffer.buffer` is the pooled ArrayBuffer;
slice by `byteOffset` and assert on a known first value.

**The solve is deterministic** — two runs of one command are bit-identical — so a
dump that fails to reproduce means **a flag differs**, and finding which is
cheaper than reading numbers from two instruments.

## The producer, as measured (banked — the certificate needs this regardless)

```
Courier New outlines, PATH-FILLED   mupdf fills an FT font above size 256 device
  at a CONTINUOUS pen (08-03l)      px as an outline at the UNQUANTISED matrix.
                                    Confirmed from pixels on BOTH axes. ≳1900 dpi.
  source width W = odd·51 px        q = 16 is the UNIQUE output period. 2550 is
  (08-03m/p, exact arithmetic)      EVEN and refuted. W itself is NOT measured.
  advance A = 23/4 pt EXACTLY       decided by the 21 byte-identical Δ48 pairs.
  layout grid u = 0.205665 pt       ± 0.000027 (= 0.274220 output px). Hold it in
                                    pt. TWO CARRY-DROP ACCUMULATORS run on it:
                                    y rate φ = 0.207037 ± 1.23e-4 per line;
                                    x sawtooth period 23.89 cols, amplitude
                                    0.2759 ± 0.0027 output px = u.
  ↓ fz composite                    e = cov+(cov>>7); dst = (dst·(256−e))>>8
  ↓ NAIVE BYTE-SPACE averaging      byte-127 rate 0.500 % on the page
  ↓ downscale, TENT pair            x ≈ 1.00 / y ≈ 0.93 OUTPUT px. Row pitch
                                    14.33868 ± 0.00073. Glyph aspect 1.0669×
                                    Courier's natural — still no producer story.
96 dpi page, 816×1073
```

Reference document: `lab/base64/courir-strech/EFTA02154109.pdf` (83 pp; p2 is the
prose cover, p3+ are base64 body pages — byte-identical in the marker column, so
more pages buy no more markers). Native control for every measurement:
`lab/base64/corpus-cour832/EFTA00434905.pdf` (reads at tol 0, and detectably
carries mupdf's ¼-px pen lattice — which the suspect detectably does not).

The readouts any future mechanism must hit **without being tuned to them**:

| readout | target |
|---|---|
| joint RMS | 1.647 (control 0.281) |
| phase-scan residual | 0.0212 against the 0.0146 floor |
| energy split | 3.5 / 96.5 |
| byte-127 rate | 0.500 % |
| x staircase | period 23.89 cols, amp 0.2759, drops at cols 13/37 |
| skew curves | slope 0.0494 in x; y twin flat (0.4 % against a 5.2 % null) |
| Δ48 exact pairs | ~21 of ~149 same-character pairs |
| the five bands | 94.4 % / 0.807 / 2.8 % / 0.0152 px / ≤ 5.0° |

## Traps this family sprang, still live

- **A PREDICTION FOR BYTE DATA MUST BE GENERATED THROUGH THE BYTE
  QUANTIZATION**, never taken from continuous algebra.
- **RAW TARGETS CANNOT BE READ.** A generated target carries 35.5 % marker-varying
  energy with *no* per-line mechanism at all — one shared source difference
  sampled at 57 distinct δ_k. Only the solve separates the two. (08-05h, and the
  first time the reason was demonstrated rather than assumed.)
- **CORRECT-BUT-INAPPLICABLE.** Every certificate a synth-built object carries is
  a certificate about the synth operating point. Applying it elsewhere needs a
  fresh measurement at the destination.
- **AN ENSEMBLE CAN OWN A STATISTIC'S VALUE.** Every spectral or locking statistic
  on these residuals is presumed ensemble-owned until its no-quarry arm says
  otherwise, and **the specificity arm runs FIRST**.
- **AN INSTRUMENT IN A SCRATCH DIRECTORY IS NOT COMMITTED**, whatever an entry
  says. Check claims of that shape against git; it is one command.
- **A CHAIN IS NOT A GATE.** `gates && commit` checks only the last exit code.
  Read the gate output, then commit — two acts.
- **THE INTERPRETING LAYER IS ITSELF AN INSTRUMENT WITH NO SELF-TEST.** Shell
  quoting, chain semantics, string parsing. The readback is its only positive
  control. Use the Edit tool for anything containing markup.
- **THE TAUTOLOGY GUARD.** Before subtracting B from A, name how B was
  constructed; if A appears in B's derivation the subtraction is an identity.
- **Null medians are detection thresholds, not effect sizes.**
- **`--solve-joint --solve-phase` with no geometry pinned is an UNREAD
  INSTRUMENT.** Always `--em 2530 --fy 2.92916`.
- **Magnitude agreement is worth nothing** — judge mechanisms on conjunctions.
  The **n = 512 rung** of the displacement ladder is the pre-answered form of
  "but the displacement matches!": page rate, page amplitude, band 4 hit by
  construction, and it fails three voices.
- **Do not decode the base64 payload as ground truth** — reading it IS the open
  problem.

## Where it would go if it ever closes for real

A working reproducer is a **pageLaw** entry, not a glyph pool — the family entry
says `renderable: false` and why. Only after a document reads clean does a pool
get added (`tools/fontgen.mjs` → `tools/glyph-registry.mjs` → `npm run gate`).
**A pool is a proven recipe.**

Gates that must stay green: `npm test`, `npm run lab:selftest`,
`npm run mono:selftest`. Triage any new document with
`node lab/resample.mjs <pdf>` first, and `node monospace-lab/payoff.mjs <pdf>`
before anyone considers hand-labelling (this family: 1.00× reuse, 1.3 %
cross-page transfer — there is no template job here).
