---
description: The page-downscale family (17 documents, 816×1073) — the residual is two-dimensional and carries a phase-keyed rate confirmed on raw pixels; pin the rate with a pre-declared null, then ask for a mechanism
---

The `page-downscale-816x1073` family — **17 documents, 100 % □, no pool**. Not
a face hunt: the pages are a high-resolution render put through a downscale, so
no `(face, em64, pen, law)` can reproduce them and every roster sweep fails by
construction. Reading them at tolerance 0 requires reproducing the PIPELINE.

Full record, with every number and every refutation:
[lab/families.mjs](../../lab/families.mjs) → the `page-downscale-816x1073`
entry. **Read that entry first** — this brief is the work order, that entry is
the evidence, and it now compresses sixteen dated blocks (08-02 … 08-04e). Do
not re-open anything the entry marks refuted; the list is long and every item
on it cost a session.

## WHERE THIS STANDS — read before anything else

The mechanism hunt is **over as a hunt**. Both named shift-interpolation
candidates are refuted (08-03u), representation error is closed (08-04b), and
what replaced them is a positive structural result plus one live rate:

- **The residual is TWO-DIMENSIONAL.** 1.50 of its 1.65 bytes lie in a plane
  that three different model classes recover to **0.3–2.6°** (random 2-planes in
  R¹⁸⁰ sit at ~84°). It is the page's geometry, not the solve's coordinates.
- **The plane's trajectory is ordered natively in line index**, and its
  autocorrelation *shape* (damped oscillation, zero crossing ~lag 4–5, trough at
  lag 9) distinguishes it from the solve's own artifact (monotone decay).
- **A phase-keyed rate near 0.06–0.076 is CONFIRMED on raw pixels.** The θ scan
  cleared a drift null's maximum on the loading pairs; the map-level check then
  cleared a Mantel null's maximum on the **raw maps** at r = 0.0622, with every
  control scoring null. Confirming instrument shares nothing with the discovering
  one — that was the design.

**That is evidence for a third accumulator. It is NOT a stored constant yet**,
because the rate is unpinned: the confirmation's maximum sat at **0.0756, the
upper edge of its pre-stated window**. A boundary optimum means the true rate may
lie outside. Nothing about mechanism or arithmetic may be claimed until it is
pinned.

### THE NEXT JOB, with its null declared here so the run cannot choose it

**Refine the rate on the raw maps, scanning the FULL clean band — no window.**
Windowing is what produced the boundary optimum, and re-windowing after seeing it
is the post-hoc move the whole chain exists to forbid.

- **Statistic** (unchanged, no knob): −corr(map-distance, circular phase-distance
  min(d, 1−d)) over all 1596 pairs of raw pinned maps.
- **Range:** the full clean band ∩ the ≥3-wrap guard — [0.0508, 0.1731] ∪
  [0.2409, 0.7591] ∪ [0.8269, 0.9492]. Remember θ and 1−θ are the *same*
  hypothesis.
- **Null:** Mantel label permutation, ≥300 draws, each taking the **global max
  over the same full band**. Clearing that is the only thing that pins a rate.
- **Then and only then:** ask for a mechanism. Rate → mechanism → arithmetic.
  No rational near-miss hunting; the ledger already holds 0.20692-vs-φ and the
  m = 44 rung.

Also unsurveyed and not to be described as empty: **θ ≳ 0.5**, where the scan
recovers 1/12 even at full amplitude. The licensed sentence is "structure found
at ~0.06", never "the only structure is at ~0.06".

Reference document: `lab/base64/courir-strech/EFTA02154109.pdf` (83 pp; p2 is
the prose cover, p3+ are base64 body pages — body pages are byte-identical in
the marker column, so more pages buy no more markers). Native control for
every measurement: `lab/base64/corpus-cour832/EFTA00434905.pdf` (reads at
tol 0, and detectably carries mupdf's ¼-px pen lattice — which the suspect
detectably does not).

## The producer, as measured (banked — the certificate needs this regardless of outcome)

```
Courier New outlines, PATH-FILLED   mupdf fills an FT font above size 256 device
  at a CONTINUOUS pen (08-03l)      px as an outline at the UNQUANTISED matrix
                                    (fz_render_glyph returns NULL; predicate read
                                    from source, LAWS.md §1b). Confirmed from
                                    pixels on BOTH axes: y lattice scan 0.90×
                                    (continuous control 0.91×, lattice control
                                    0.30×); x pen flat at its alias period
                                    (≤0.012 px where the control shows mupdf's
                                    ¼-px snap at 0.24). Render ≳1900 dpi.
  source width W = odd·51 px        q = 16 is the UNIQUE output period: q | gcd
  (08-03m/p, exact arithmetic)      (368,816) = 16 and Δ24 exactness is forbidden
                                    by parity (16 | 368 = 48A, 16 ∤ 184 = 24A).
                                    2550 (= 51·50, the old "300 dpi") is EVEN and
                                    refuted. W itself is NOT measured.
  advance A = 23/4 pt EXACTLY       decided by the 21 byte-identical Δ48 pairs
                                    themselves (a 0.071 px slip would forbid all
                                    of them). 1150/48 src px was always this
                                    number in a dead unit.
  layout grid u = 0.205665 pt       ± 0.000027 (= 0.274220 output px). Hold it in
                                    pt — the 350.08 dpi gloss ships nowhere, and
                                    no clean rational lands within 3σ (d ≤ 400
                                    scanned). TWO CARRY-DROP ACCUMULATORS run on
                                    it: y rate φ = 0.207037 ± 1.23e-4 per line
                                    (stored constant, both layouts agree 0.94σ);
                                    x sawtooth period 23.89 cols, amplitude
                                    0.2759 ± 0.0027 output px = u, confirmed
                                    model-free by 3 rare gaps in 61 advances.
  ↓ fz composite                    e = cov+(cov>>7); dst = (dst·(256−e))>>8
  ↓ NAIVE BYTE-SPACE averaging      byte-127 rate 0.500 % on the page; the tents
                                    land 0.47–0.52 %. No open 127 discrepancy.
  ↓ downscale, TENT pair            x ≈ 1.00 / y ≈ 0.93 OUTPUT px — identified
                                    under total freedom (free source AND free
                                    kernel), resolution-free statements. Row
                                    pitch 14.33868 ± 0.00073 output px. Glyph
                                    aspect 1.0669× Courier's natural (invariant
                                    to fx; still needs a producer story).
96 dpi page, 816×1073
```

**The renderer null still holds and still gates everything**: FTClone +
`cour.ttf` em64 832 reproduces `corpus-cour832`'s leading `>` byte-exactly,
65/65. `resample-fit.mjs --null` re-runs it through the whole path; run it
before reading any fit.

## The quarry: 1.647 bytes RMS, cornered

With source, kernels, and per-marker phases all free (`--solve-joint
--solve-phase`, certified to 0.011 src px), the page floors at **1.647**
against **0.281** for the equivalent control. Its signature (08-03f/i):
96.5 % marker-varying, pairwise correlation 0.017, interior and
gradient-following, exactly zero on paper, the same 1.65 on every line, NOT a
function of the sub-pixel phase (0.7 % vs an 8.7 % null), not neighbours, not
commutation (0.22), not a per-line x offset or vertical scale, not fixed-point
arithmetic, not tonal.

**08-03r–t cornered the mechanism to one class.** The x skew transfer curve —
per-column ink skewness vs the u-grid residue — is deterministic (split-half
r 0.770) and 51.1 % explained by the residue against a 5.5 % permuted null,
with a generated control at 4.5 %. The coherence argument then eliminates
per-point mechanisms WHOLESALE: a curve coherent across characters survives
only if keyed to the pen residue directly (outline points spread over 21.9
grid cells wash out; u = 43.95 font units closes the commensurate loophole).
Pen snapping is dead by the flat first moment (1.3 %). What survives:

> **applied once per glyph, as a function of the pen's grid residue,
> deforming the glyph without translating it — centroid-neutral, odd.**

**08-03u RAN THE SIX ROWS AND THE ANSWER IS THE BLANK LINE.** Both (b) linear
and (b′) Catmull-Rom shift-interpolation are refuted, on four independent
statistics at the `g` the page's own wobble pins. Do not re-open either; the
harness (`--synth-shift`, `--shift-algebra`, `--tent-sweep`) is committed and
its controls are certified both ways.

The case in one line: **`g` is not free.** Under this mechanism the per-line
wobble *is* the shift, so amplitude and deformation are one parameter, and the
measured phase sd of 0.267 src px forces `g = 0.925`. There the joint RMS is
0.345 against 1.647 — eight times short. The `g` that reaches 1.647 is 2, and
there the pitch scan reads **0.413918**, twice the page's rate, because a
wobble spanning two source px wraps twice. ~2× apart in `g`, ~8× in RMS: the
08-03h pincer again.

| statistic | page | CR g=0.925 | LIN g=0.925 |
|---|---|---|---|
| μ₂ ψ-keyed R² (permuted null ≈ 6 %) | **0.2 %** | **28.2 %** | 25.6 % |
| shared tent width, generated at 1.000 | 0.925 | **1.000** | — |
| residual amplitude vs ψ | **1.7 %** | **33.9 %** | — |
| `--solve-y` shared kernel sd | (1.064) | 1.036 | — |

Only the last row confirms the story — 08-03t's prediction that a shared-kernel
solve must return tent-like rather than lobed **holds**. Everything else says no.

**Three readings from earlier sessions are withdrawn, and they matter:**

- **`--moments` had the discriminating term regressed out.** It removes two
  harmonics of ψ from the width series — right for the 08-03g scale question,
  wrong here, since (b)'s width modulation δ(1−δ)g² *is* a function of ψ. So
  "0.258 % below floor = Catmull-Rom's signature exactly" was never evidence.
- **Clamping manufactures the discriminator rather than renormalising it.**
  μ₂ ≡ 0 is exact and `--synth-shift-noclamp` confirms it (4.2 %). Rounded to
  bytes — which the producer does; paper is exactly 255, zero variance — the
  same data reads 28.2 %. That kills *both* families instead of separating them.
- **g/σ = 0.606 is dead as a shared constant.** The y axis measures `g`
  directly as the wobble amplitude and gets **g/σ = 0.165**, 3.7× smaller, 51×
  in μ₃. A carry-drop grid can only ever displace by ≤ u, so the x skew cannot
  be an interpolated shift on it. The 1.37 % width prediction, the "factor
  2–5 tension" and the 0.0245–0.0265 kurtosis figure all belong to that dead g.

**And the y twin is a clean negative where it has power.** A ψ-keyed skew at
the x axis's own amplitude (0.0154) would show at R² ≈ 69 %; the page reads
0.4 %. **The x and y anomalies are not one mechanism measured twice.** Against
the much smaller effect a shift at g = 0.925 would make (3.1e-4 vs a 5.2e-3
floor) the channel is blind, and that is measured — controls fire at g = 2
(μ₃ 27.5 %, μ₄ 70.7 %) and not at 0.925.

## The partition — read this before picking anything up

The y-twin negative sorts every open anomaly by **pipeline generation**, and the
sort is forced by measurement:

**Everything keyed to u is first-generation layout archaeology.** The x skew
(51.1 % on the u residue), the x staircase (period 23.89, amplitude u), the
exact advance 23/4 pt, u = 0.205665 pt, and the y accumulator's 0.320110 — all
of it is *shared* structure, identical line to line at a given column, so all of
it lives in the **3.5 % mean map** and none of it can be in the 96.5 %
marker-varying budget where the 1.647 sits.

**The 1.647 is keyed to nothing measured.** An x-sized ψ-keyed modulation would
have read R² ≈ 69 % on the marker column; it read 0.4 %. So the u-grid world and
the residual are not one mechanism, and 08-03r's "a named commonality rather
than a resemblance" is withdrawn. Define the quarry by what it is *not* keyed
to: not φ at any tested moment, not the u grid, not neighbour ink, not the
resample, not the source or kernel or any freedom given to either. Per-line,
interior, gradient-following, mutually uncorrelated, blind to every producer
constant this family has measured.

**Two hypotheses left, one experiment between them:** representation error (a
fine-lattice truth on a coarse grid — the 08-03m pre-registration, whose stated
condition is now met) or genuinely aperiodic per-line state (not a mechanism to
generate but a sequence to find). Nothing else survives.

The u-keyed skew is **parked as a class statement with three measured moments** —
per glyph, residue-keyed, centroid-neutral, odd — not as a live candidate. One
narrative note for the certificate and *not* for this hunt: u is one device
pixel at 350.08 dpi by construction (96/350.08), so a gen-1 engine rasterizing
on its own device grid, with the rerender carrying those positions through as
continuous path coordinates, leaves exactly this fossil. That is prose for the
certificate. It must not re-enter the 1.647's candidate list, which the y twin
just cleaned.

**What does NOT discriminate, measured**: the curve's functional form.
Sawtooth 50.3 % / interp form 47.3 % / sinusoid 41.9 % at equal dof with free
phase — 3 points is nothing on 62 columns. Also uncalibrated: the residue
ORIGIN (the wrap at ~0.535 carries no floor-vs-round policy bit).

## The job as it was specified, and what each row returned

All six were built into `resample-fit.mjs` and run with both arms certified.
Recorded here so no row is re-run expecting a different answer.

1. **Shared-kernel tent recovery on CR-walked data** — *the story survives, as
   pre-registered.* `--solve-y` on tent(1.074)⊗CR(δ walk) returns **sd 1.036**
   against 1.070 with no shift: tent-like, **no lobes**. The joint solve agrees
   (y 1.067 / x 1.278 against the page's 1.064 / 1.274). This row is the one
   piece of evidence *for* the mechanism, and it is not enough.
2. **Width modulation** — *refutes both.* The specified test could not be run
   as written: `--moments` regresses two harmonics of ψ out of the width
   series, which removes exactly the (b) signature. Re-read with no detrend and
   a permuted-ψ null: page **0.2 %**, CR 28.2 %, LIN 25.6 %. The "1.37 %
   violation on (b)-generated data" never materialises because it was computed
   at the dead g; what does appear is a large ψ-keyed modulation from **both**
   families, and the page has none.
3. **The 0.93** — *refutes; the estimator moves the wrong way.* Generated at
   tent(1.000)⊗CR(δ_k) it reads back **1.000** (no-shift control 1.000), and at
   g = 2 it reads **1.100** — wider. So the walk does not bias a nonnegative
   tent narrow, 08-03r's original "a shift must widen" objection is reinstated,
   and the 10 % x/y asymmetry stays a separate unexplained fact.
4. **Clamped-μ₃ → g** — *measured, and it inverts the argument.* Unclamped CR
   at g = 0.925 reads μ₂ 4.2 % (not keyed): the exact algebra holds. Clamped
   and rounded to bytes, 28.2 %. Clamping does not renormalise g, it
   **manufactures** the width modulation that was meant to separate (b) from
   (b′) — for both. The byte arm is the physical one (paper is exactly 255).
5. **The μ₄ channel** — *uninformative, and it says so.* Page 1.3 % against a
   null of 5.8 %, sitting on its own floor. Certified from both sides: nothing
   fires at g = 0.925 (CR 3.9 %), everything fires at g = 2 (CR 70.7 %). At the
   permitted g the prediction is 16× under the floor.
6. **The y twin** — *a clean negative where it has power.* Page μ₃ 0.4 %
   against a 5.2 % null. An x-sized keyed modulation (0.0154) would show at
   R² ≈ 69 %, so this refutes "one mechanism measured twice". The second half
   is free and is the fourth refutation: residual amplitude vs ψ reads
   **1.7 %** on the page against **33.9 %** for CR — the residual does not know
   where the pen sits on its grid, which is what "the same 1.65 on every line"
   had been saying since 08-03f without being read that way.

Rows 1–3 decide (b) vs (b′) vs the blank line; rows 4–6 turn a verdict into a
measured mechanism. **Measure the σ ratio and the skew sd inside the run** —
the paper pincer's 2–5× turned on estimates of both.

## CLOSED (08-04b): the fine-lattice joint solve — representation error is dead

*Kept for its scorecard discipline and its numbers, not as work. The phase pin
collapsed the apparent 27 % fall; the page's decline exponent is 0.026 against
the control's, and the requirement was 60× larger. Do not re-run this as a job.*

The generator is **not** the next step — the six rows took the third exit, so
there is no winning kernel to build one around. Do not build one for (b) or
(b′). **The lead is the fine-lattice joint solve (2×/4×)**, pre-registered in
08-03m, whose stated condition was exactly this verdict.

Write the scorecard before the code. The geometry is finally stable enough to
hold one, and this is the first experiment since the generator was conceived
that can pay off on **several open numbers at once** — three of these four rows
touch standing anomalies the solve is not primarily aimed at. That
over-determination is the standard.

### Why the solve is overfit-proof in the direction the verdict needs

Someone will object at 4× that *of course* the RMS fell with 16× the source
parameters. The answer is structural, and it is the reason this experiment can
decide anything at all: **refinement adds SHARED degrees of freedom only** — one
fine source and one kernel, across all 57 markers. Shared parameters cannot fit
mutually uncorrelated per-line variation; they can only capture structure common
up to the phase walk.

But representation error is *exactly that*: a shared fine-lattice truth, sampled
by each line at its own phase, presenting as marker-varying through the
sawtooth. That is why it survived every wall in this entry — it lives in the
varying 96.5 % while being, at the fine scale, shared.

So **the decisive readout is not the total RMS, it is the mean/varying split at
each refinement**:

- under **representation error** the *varying* residual falls as the lattice
  refines, because the "variation" was always phase-sampling of shared structure;
- under **aperiodic per-line state** the varying residual cannot fall at any
  refinement, because no amount of shared DOF represents uncorrelated per-line
  content.

The per-marker offset blocks stay what they are — three scalars per line — so
they do not reopen the hole.

### Refine Y ONLY — x is unidentifiable at any factor

Measured before the build, and it is a design constraint rather than a
preference. The folded source is NR × NC = **55 rows × 43 columns = 2365 px
against 10260 equations**, but the two axes are not symmetric:

| axis | unknowns | constrained by | verdict |
|---|---|---|---|
| **y** | 55 rows | 15 output rows × **57 distinct phases** = 855 samples per column | **15.5× over**determined; still 3.9× at 4× |
| **x** | 43 columns | 12 output columns at **one** phase (x pen sd 0.013 src px) | **3.6× under**determined already at 1× |

Refining both axes gives 9460 params at 2× and **37840 at 4×** against 10260
equations — the RMS would fall to zero trivially and the row would be vacuous.
Refining y alone gives 4730 / 9460 total, and the y *direction* stays
overdetermined throughout. x refinement buys nothing physically either: with one
phase there is no sampling diversity for a finer x lattice to resolve.

**THE FLOOR IS CERTIFIED (2026-08-04) AND IT PASSES.** Matched control, truth on
the coarse lattice, same instrument at every refinement:

| R | source rows | free RMS | clamped RMS | y sd | Σ (predicted) | split |
|---|---|---|---|---|---|---|
| 1 | 55 | 0.281 | 1.30 | 1.065 | 4.010 (4.000) | 0.3 / 99.7 |
| 2 | 109 | 0.273 | 10.40 | 1.080 | 2.005 (2.000) | 0.3 / 99.7 |
| 4 | 218 | 0.271 | 28.15 | 1.084 | 1.003 (1.000) | 0.2 / 99.8 |

**Doubling and quadrupling the shared DOF buys 3 % of the floor** — so shared
parameters demonstrably do not absorb marker-varying residual, and a fall on the
page is real. That is the structural argument measured rather than argued.

**But the clamped RMS explodes, and it bounds what may be read.** Free RMS flat
*and* clamped RMS 1.30 → 10.40 → 28.15 means the solver is wandering in the
low-pass **null space** — directions that do not change the fit. That is
ill-conditioning, not overfitting. Consequences, stated exactly:

- rows 1–3 (RMS trajectory, mean/varying split, differential width) **are
  readable** — the control ran the identical instrument and came out flat;
- row 6 (recovered-source inspection) is **void**: `S` is not an image, so there
  is no edge ramp to measure;
- any resolution claim read off `S` *directly* is void with it. Row 4's
  break-point argument survives only because it reads the RMS **curve**, not the
  source.
- Fixing this needs a box constraint on `S` (project onto [0,255] inside the ALS
  S-step, not merely measured after it). Until then do not quote a fine source.

**Row 3's control arm, measured:** the fitted width walks 0.891 → 0.903 → 0.906
output px across refinement against a truth of 0.898. That **+1.7 % drift is the
control curve**; the page must diverge from it by materially more than that
before the width walk means anything.

`--fine-y R` implements exactly this, and prints its own identifiability
(rows, samples-per-column, unknowns/equations) before the solve, with a loud
warning if unknowns ever exceed equations. Units are chosen so the row is
readable across refinements: a fine row's centre is expressed in **coarse**
source px, so the kernel node grid, the per-marker phases and every reported
width keep their original units. Only `S` gains rows — and since each fine row
then carries 1/R of the mass, the recovered taps come back scaled by 1/R (Σ near
1/(BW·R)) while the reported **sd is scale-free and directly comparable**.
Certified inert at R = 1: RMS 1.647, kernels 1.064 / 1.274, scan 0.206929 /
0.0212, amplitude 0.9379 — every digit unchanged.

### The six rows, each with a pre-registered direction

1. **RMS trajectory at 1× / 2× / 4×, floors certified PER REFINEMENT.** Matched
   *and* mismatched synth controls at each lattice. The conditioning trap is
   worst here — the ALS blocks are not in the regime they were certified in.
   Read the clamped RMS beside the free one at every refinement; a source that
   leaves [0,255] is not a source, and near the identifiability edge that is
   the first thing to go.
2. **Mean/varying split trajectory — the structural discriminator.** Varying
   residual falls ⇒ representation error. Varying residual flat ⇒ aperiodic
   per-line state. This row, not row 1, carries the verdict.
3. **Differential width walk, page against matched control, same estimator at
   every refinement.** Under representation error the control (truth on the
   coarse lattice) holds its width flat while the page walks toward 1.00; under
   a solver artifact both curves move together. **The discriminator is the
   divergence between the two curves** — since they share the estimator,
   conditioning failures cancel to first order. Cheaper than certifying the
   width readout in isolation, and harder to fool.
4. **Break-point resolution estimate.** Representation error of a smooth truth
   falls roughly *quadratically* in lattice spacing until the lattice reaches
   the truth's own scale, then flattens — so where the curve breaks is where
   the source lives. A break at 2× and still-falling at 4× are different
   answers with different admissible-width consequences. Check against the
   path-fill predicate's ≳1900 dpi and the ladder (odd multiples of 51). The
   m = 44 rung is a **tiebreaker only**: ~5 % by chance alone, so it may confirm
   an independent estimate and may never generate one.
5. **Byte-127 rate of the fine-resolution generator.** Edge statistics at ~20×
   decimation are the one change that fingerprint has been waiting for through
   every 300-unit synth ever run here. Target 0.500 %.
6. **Recovered-source inspection — qualitative, and it costs nothing.** At the
   right refinement the solved source should sharpen into a crisp
   high-resolution glyph whose edge-ramp width, in fine units, measures the
   gen-2 render's own antialiasing. A solver pathology that the numbers miss
   shows up here as ringing or as a source that never sharpens.

**READ ONCE, 2026-08-04, AND IT DOES NOT SETTLE.** Page against the certified
floor:

| R | page RMS | page varying | control RMS | control varying | page y width |
|---|---|---|---|---|---|
| 1 | 1.647 | 100 % | 0.281 | 100 % | 0.890 |
| 2 | 1.623 | 97 % | 0.273 | 94 % | 0.889 |
| 4 | 1.409 | **73 %** | 0.271 | 93 % | 0.886 |

The page falls further than the control — 27 % of its varying energy against
7 % — and all of it arrives between 2× and 4×. **Two measured reasons that is
not yet a verdict:**

1. **The shape is wrong.** Representation error of a smooth truth falls as h²,
   with edges h¹. Fitted as RMS ~ h^p over 1×…4× the page gives **p = 0.113**
   (control 0.026). An exponent of 0.11 where the hypothesis needs 1–2 is not a
   shallow version of representation error, it is a different thing.
2. **The fall coincides with instrument degradation**, all at that same 4×:
   clamped RMS 35, scan residual 0.0212 → 0.0480 → **0.0822**, and the recovered
   rate drifting to 0.205855 against 0.206929 ± 1.7e-4 — **6σ**, where the phase
   block had been stable to a part in a thousand everywhere else.

### Run the phase pin FIRST — it can void the 27 % before anything is built

The two degradations are one trade, not two symptoms: the scan residual
quadrupled and the rate drifted 6σ **at exactly the refinement where the RMS
fell**. At 4× the source lattice spacing approaches the scale of the phase walk,
so a shared fine source gains the freedom to encode phase-*like* structure —
ridges in `S` that mimic per-line displacement when sampled at different φ_k.
The solver can then **spend phase fidelity to buy RMS**: move the offsets off the
true sawtooth and let the source absorb the difference. On that reading the 27 %
fall and the phase degradation are the same event — a degeneracy between the
phase blocks and the source, not the model finding fine-lattice truth. The
exponent agrees: a null space opening at a threshold refinement gives a **step**
(1.647 / 1.623 / 1.409), not a power law.

**RUN 2026-08-04 — IT COLLAPSES. The 27 % was the degeneracy.**

The pin certifies at 1× first, its own control condition: RMS 1.652 against
1.647 free, so removing 55 of 57 phase DOF costs **0.3 %**, and the amplitude
returns 0.9383 against the independently fitted 0.9379. At the coarse lattice the
phases really are two parameters.

The pin has its own positive control: `--synth-phi` injects an amplitude of
**exactly 1.0** src px by construction, and the pin recovers 1.0007 / 1.0015 /
1.0014 at R = 1 / 2 / 4 — 0.15 % at every refinement.

**Read the pin's cost in absolute BYTES, never in percent.** In percent it looks
free on the page (0.3 %) and expensive on the control (10.3 %), which reads as
the pin being invalid on the control arm. It isn't — and the cost is now
**measured directly** rather than inferred by quadrature, since quadrature
assumes the pin-induced delta is orthogonal to the residual it is subtracted
from, and both are per-marker and interior. `--resid-out` dumps per-equation
residuals so two runs can be differenced cell by cell.

| | direct pin cost | quadrature | corr(delta, free) | cross / delta-energy |
|---|---|---|---|---|
| page | **0.1532** | 0.1336 | −0.011 | −0.239 |
| control | **0.1550** | 0.1312 | −0.078 | −0.284 |

The same pin cost on both arms **to 1.2 %**, where the percentages read 0.3 % and
10.3 % only because the baselines differ six-fold. **The quadrature figures
understate it by 14 % and are withdrawn:** the correlations are small, but
2⟨d,f⟩ is −24 % and −28 % of the delta's own energy — what a small correlation
against a residual 6–10× larger buys. The identity
pinned² = free² + delta² + 2⟨d,f⟩ reproduces to four decimals, so the
decomposition is exact and it is *orthogonality* that fails, mildly. **Quote the
direct numbers; cite quadrature as consistency, never as the measurement.**

**The commutation term now has three measurements; recorded together so the
spread is not later read as a new anomaly.** (i) 08-03f, wobble side:
√(0.281²−0.174²) = **0.22** bytes. (ii) The null case: when the injection *is* a
sampling shift, the pin costs **nothing** (0.170 → 0.163, departure 0.0016 src
px). (iii) Direct, this session: **0.1532 / 0.1550**. The 0.22 and the 0.154 are
**not obligated to agree** and their difference is not a finding — same class of
error at different operating points: 0.22 is the full free-vs-sampled floor gap
with phases free to absorb, 0.154 is what a pinned sawtooth cannot absorb at 1×.

That 0.1532-vs-0.1550 across two documents whose quarry differs **six-fold** is
also a stronger statement than the quadrature match was: the misfit is a property
of the **pin/solve pair alone** — an instrument constant, insensitive to what it
is pinning over.

What that ~0.15 *is* was measured too: on `--synth-phi-sample`, which injects the
sawtooth as a **sampling shift** (the solve's own model, exact by construction),
the pin costs **nothing** — 0.170 free against 0.163 pinned, departure 0.0016 src
px. So the pin law is right in form, and the cost is the **commutation** term:
`--synth-phi` injects a real pen move, the solve models a sampling shift, and
free phases absorb the difference by sitting off the true sawtooth where pinned
phases cannot.

| pinned | R=1 | R=2 | R=4 | fall (%) | fall (**bytes**) |
|---|---|---|---|---|---|
| **page** | 1.652 | 1.639 | 1.593 | 3.6 % | **0.059** |
| **control** | 0.310 | 0.294 | 0.262 | 15.5 % | **0.048** |
| *(page, free)* | *1.647* | *1.623* | *1.409* | *14.5 %* | *0.238* |

**The "inversion" is withdrawn.** In absolute bytes both arms fall by the same
trivial amount (1×→2×: page 0.013, control 0.016). The 3.6 %-vs-15.5 % contrast
was a baseline artifact of dividing by 1.65 in one arm and 0.28 in the other.
Worse, part of the control's fall is the fine source buying back the pin's own
commutation misfit — pinned control at 4× (0.262) sits *below* free control at 1×
(0.281) — so the coarse-truth benchmark is contaminated and must not be used as
the comparison. Neither arm shows a representation signal; that is all the
control arm supports.

Measured the other way, on the page: the phase block's contribution grows from
√(1.652²−1.647²) = 0.128 bytes at 1× to √(1.593²−1.409²) = **0.743** at 4×, a
factor of 5.8 — the source buying RMS through the phase block, exactly as
suspected.

**So representation error is dead by its own pre-registered condition — and the
closure rests on the PAGE arm alone, which is where the condition was
registered.** State it on the **1×→2× segment only**, where the instrument is
certified sound and the clamped RMS has not yet exploded:

> Representation error, if it were the quarry, is the ~1.62-byte **excess over
> the ~0.31 floor** — the floor (composite noise, commutation) does not refine
> away. So p = 1 predicts the *excess* halves: total 1.652 → √(0.811²+0.310²) =
> **0.869**, a required fall of **0.783** bytes (p = 2: **1.141**). Observed:
> **0.013**. **60× short at p = 1, 88× at p = 2**, on the segment where nothing
> is in doubt — and 60× is the **floor** of the shortfall, since both buy-back
> channels push the observed number *up*. Every unresolved effect widens it.
> The closure is monotone in the direction of safety.

The 4× points in **both** arms are instrument-degraded (clamped RMS 37.9 page,
39.5 control, even pinned) and nothing quoted should depend on them — note the
page's residual fall concentrates there again (0.8 % to 2×, then 2.8 %), the same
location as the artifact just struck. The 08-03m hypothesis is **closed rather
than blocked**, and the free-phase 4× point (1.409, 27 %) is **struck and must
not be quoted**. The permuted-map mismatched
arm is no longer needed to decide the branch — it was specified to calibrate a
fall that does not exist — though it stays sound if anyone wants the trajectory
readout characterized for its own sake.

**Seventh instance of the instrument-DOF lesson, and the first caught before it
was read as physics.** The general form is now sharp enough to reuse:

> When a solve gains accuracy at the same moment one of its certified outputs
> degrades, suspect a **trade between two blocks** before believing the accuracy
> — and test it by pinning the degraded block to the law it is certified to
> obey. One run, no new instrument.
>
> **A pin is only a valid test where its cost at the sound operating point is
> certified small FOR THAT ARM, in absolute units.** Certify per arm and in
> bytes, never percent: the same 0.13-byte pin reads as 0.3 % on one arm and
> 10.3 % on another purely from their baselines, and the percentages invite
> exactly the wrong conclusion about where the instrument is valid.

**Carry into the aperiodic branch:** the clamped RMS still explodes with
refinement (2.25 / 11.5 / 37.9 pinned), so anything that reads `S` *itself* —
source inspection, edge ramp, a resolution read off the source — needs the box
constraint inside the ALS step first. The sequence search does not need
refinement at all; it lives at 1×.

### Then the mismatched arm — design pinned before it is built

"Structured marker-varying residual" is underdetermined, so do **not** synthesize
a model of it. Bootstrap from the 57 residual maps themselves: **permute the maps
across markers**, which preserves the page's own spatial statistics exactly —
same interior gradient-following profile, same per-line energy — while
guaranteeing zero cross-line correlation and no representational content.

That arm measures how much fall refinement buys on structure *known* to be
non-representational. **The page's fall minus that number is the honest evidence
for the representation branch.** If the permuted-map control also falls 27 %, the
trajectory readout is uninformative at any exponent and the branch decision rests
on the aperiodic search directly.

**Row 3 is a clean negative, and it needed the differential form to read at
all.** y width in output px: page 0.890 / 0.889 / 0.886, control 0.891 / 0.903 /
0.906 against a truth of 0.898. The page does not walk toward bilinear — if
anything it narrows — while the *control* walks +1.7 %. The divergence runs the
wrong way, so **0.93 is not the coarse grid's compromise with a fine truth.**
Read in isolation the page's flat width would have scored "no movement,
inconclusive"; only against the control's own drift is it a result. The 10 %
asymmetry survives its sixth instrument.

### The aperiodic branch — now the only one, and pre-registered

No more mechanism-first generators. A blind search for a second deterministic
sequence in the 57 maps, ensemble-nulled per the standing rule, u-keyed fossils
projected out first so the space is the 96.5 %. It lives at 1× and needs neither
refinement nor the box constraint. Three things fence it before it runs:

1. **A constraint this family already owns and had not applied here.** The
   marker column is byte-identical across body pages that differ over **31 %** of
   the page elsewhere (p3 vs p4: 274,779 of 875,568 bytes differ, 0 of 15,022 in
   x = 94..107). So the per-line state **does not depend on page content outside
   the column** — it is seeded by line index alone, or by something inside the
   column. **No content-coupled state can be the quarry**: not accumulated ink,
   not previous-glyph carry from body text, nothing that reads the line it sets.
2. **A second stored constant θ ≠ φ** driving a second dropped-carry accumulator
   — the most producer-shaped member of (B), being the same machinery as the y
   wobble and the x staircase, third instance, different grid. The harmonic test
   closed keying to φ and did **not** close this. A 1-D scan over θ under the
   standing discipline: ≥3 wraps over the span, the degenerate-rate guard, an
   ensemble null **per configuration**, and a positive control injecting a known
   frac(k·θ)-keyed deformation at the page's own 1.6-byte amplitude. The one
   hypothesis where a hit converts directly into a generator.

### The θ scan — RUN 08-04d, cleared; spec kept because the refinement reuses it

Input is the **57 loading pairs**, not the maps — ~40× compression onto where
82 % of the energy lives.

**~0.056 is NOT a pre-registered candidate.** It was read off the page's own
loading ACF and the scan runs on the page's own loading pairs, so a hit there
would be *the same structure measured twice*. This is the tautology guard one
level up — not algebraically identical, but the **evidence** is. Handling:

- Scan the **whole clean band**; score every θ against a **GLOBAL null — the max
  statistic over the band per null draw, never pointwise.** Clearing globally
  retroactively upgrades the ACF reading to a prediction; clearing only pointwise
  is the selection effect wearing a hit's clothes. Naming 0.056 in advance is
  useful for legibility, but **the threshold must not know it was named.**
- **The control's shape predicts where false hits land — the candidate's own
  neighbourhood.** Monotone decay is slow drift; drift projects onto frac(k·θ) at
  *small* θ, exactly where 0.056 sits (3.3 wraps, only just past the guard). So
  read the control arm's hit profile **as a function of θ**, not as a scalar
  rate, and **add a drift term to the null family** — AR(1) or monotone-trend
  surrogate at matched amplitude — so "periodic at 0.056" is tested against
  "drifting, no period" and not merely "unstructured".
- The page's zero crossing and trough are what a drift null **cannot** produce,
  so if the drift null tracks the page on amplitude, **switch to sign structure
  at specific lags** as the discriminating statistic — and say so before reading.
- Do not quote the −0.64 trough as a standalone magnitude: at N = 57 the sample
  ACF at lag 9 carries mean-removal bias and heavy variance. It is legitimate
  inside the ensemble comparison and nowhere else.

**The payoff chain, written before any hit exists**, so the session that gets one
does not design its own confirmation while under the influence of having found
something:

> scan → **global** clearance over the clean band → per-line phase sequence
> frac(k·θ) → **map-level prediction scored against a fresh null**

Only the last link converts a statistic into a producer mechanism — it predicts
*which lines are alike*, checkable on the raw pinned maps outside the loading
compression, outside the two unowned solve constants, outside the instrument that
produced the hit. Clear it and the family has a third accumulator, a third stored
constant, and a generator candidate. Come back empty at certified sensitivity
across the clean band — drift null in place, control θ-profile read — and that
negative **plus** the standing two-dimensionality sentence *is* the certificate's
core, and the 17 documents close honestly.
### STEP 2 RAN — the projection is INERT, and the chain loses a step

The δ≈0 certificate held first: per-marker template minimum **exactly 0.000000**
at k = 55 (δ = 0.381), where a pen move and a sampling shift coincide by
construction. Then the projection was **measured rather than applied**:

| | value |
|---|---|
| corr(template, page pinned) | **0.0003** |
| optimal regression gain | **0.0015** (plan assumed 0.9485) |
| energy removed at best gain | **0.000 %** |
| per-marker gains | 34 positive / 23 negative, median 0.07 |

Applying gain 0.9485 does not clean the maps — it **adds** orthogonal energy,
1.6520 → 1.6836, exactly √(1.652² + 0.325²).

**Read it precisely:** the page does not carry the misfit *in the synth
template's spatial form*. It does not say the page carries no commutation misfit
— the producer moved a real pen, so the mechanism is present upstream; what fails
to transfer is its **realisation**, likely because the free source lands
elsewhere when fitting a 1.65-byte quarry rather than a 0.31-byte misfit alone.
The 4.32 % was always a synth-derived *upper bound* on what the projection might
remove; measured, it removes 0.000 %.

**"All simplifications" is WITHDRAWN — the contamination question is not
answered, its instrument died.** The projection failing to transfer measures the
synth template as the *wrong shape*, not the page's contamination as small. The
page-side misfit is now **unbounded from above by any page-side measurement**;
4.32 % reverts from "removed" to "possible, in unknown form"; and the θ scan's
hazard is exactly as alive as before the template was built.

**The proposed replacement — bound by phase, not shape — fails its own positive
control.** Cell-by-cell harmonic regression on the **pinned** maps:

| | explained | permuted-φ null (med / max) |
|---|---|---|
| page | 0.7 % | 8.9 % / 15.2 % |
| **`--synth-phi` pinned (residual ≈ all misfit)** | **6.2 %** | **7.1 %** / 11.6 % |

The control is 0.310 bytes of essentially nothing but misfit and the test reads
it **at its own null**. The misfit is keyed to δ_k but is not a smooth
two-harmonic *function* of it — commutation error is second-order in coverage
curvature and structured per cell. So the page's 0.7 % bounds smooth phase-keyed
mechanisms (as 08-03i always said) and bounds **nothing** about the misfit.
Fifth time a positive control saved a verdict here.

**What survives is a label on the scan's parameter space, not a bound on its
input** — and it is worth more than the chain it replaces. The misfit is keyed to
**φ by construction**, so a hit at θ ≈ φ or a harmonic is **suspect**; a hit
clearly distinct from φ **cannot be the misfit**, whatever its realisation.

**Sized, because "clearly distinct" adjudicated after a hit lands is the post-hoc
judgment the gates exist to prevent.** Over k = 6…65, frac(kθ) and frac(kφ)
diverge by k·|Δθ|, so one wrap needs |Δθ| = 1/59 = 0.01695; two wraps — the
conservative choice — gives **half-width 0.0339 ≈ 1/30**. Centres are φ and its
mirror 1−φ (construction + resolution) plus harmonics, since a nonlinear function
of a φ-keyed quantity carries power at multiples:

| | φ | 2φ | 3φ | 1−φ | 1−2φ | 1−3φ |
|---|---|---|---|---|---|---|
| centre | 0.207037 | 0.414074 | 0.621111 | 0.792963 | 0.585926 | 0.378889 |

**The depth is decided by measurement, not a round number** — conservatism here
is not free, it spends readable space, and an unreadable band is where a real θ
hides forever. The misfit's own δ-spectrum, from the certified template
(each cell's 57-marker series regressed on harmonics of δ_k):

| h | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| % varying energy | 3.03 | 2.76 | 2.31 | 1.56 | 3.44 | 2.19 | 5.51 | 2.81 | 2.13 | 2.74 |

All ten explain **28.1 %** against a permuted-δ chance of **35.7 %** — the whole
decomposition is *below* chance, flat, nothing standing out (per-harmonic chance
3.6 %). **The misfit's δ-energy spreads broadly; it does not concentrate at low
multiples**, so the harmonic bands quarantine nothing and buy no protection for
the space they cost.

**So the suspect set is φ and 1−φ only:** [0.1731, 0.2409] and [0.7591, 0.8269]
— **13.6 % of [0,1)**, not 34.2 %, leaving clean
[0, 0.1731] ∪ [0.2409, 0.7591] ∪ [0.8269, 1].

**Why the φ band survives the measurement that killed the harmonics:** it never
rested on the spectrum. A scan at θ = φ fits frac(kφ), which *is* the δ_k
sequence the misfit varies along, so any δ-dependence projects onto it — harmonic
or not. *Caveat:* the spectrum is the **synth** realisation's and the page's
differs in shape (corr 0.0003), so it **guides** the depth choice rather than
certifying it — and that caveat bites only on the harmonics, which are dropped
anyway.

**The spectrum also hands the in-band discrimination its first measurable axis.**
Flat at 28.1 % against 35.7 % chance means the misfit's δ-dependence is
**broadband in phase**. So a hit *at* φ that shows a **narrow, coherent harmonic
signature is thereby unlike the misfit** — measured, not argued. Same caveat
travels (synth realisation, guide not certificate), but this is the adjudication
criterion, written now rather than improvised when a hit lands in the band.

**The bands are SUSPECT, not EXCLUDED — flag-on-hit, not exclude-from-scan.** A
hit inside a band is not discarded; it triggers the independent discrimination —
**broadband-vs-narrowband first**, then whether its per-marker shape correlates
with the template class or is producer-novel. A hit in a clean band skips that
step. Excluding instead would
make a producer constant sitting near φ or 2φ **unfindable by construction** —
not idle, since both accumulators live in the same producer code and nothing
requires their constants to be far apart. Flag-on-hit also makes the depth choice
far less consequential: a hit at 2φ still gets checked, it simply isn't
pre-flagged.

**Why the mirrors merge rather than double-count:** frac(k(1−θ)) = 1 − frac(kθ),
so the two sawtooths are *reflections*, and a fit with free amplitude sign and
free origin cannot separate them even in absolute value. The mirror band is the
same hypothesis written twice, not a conservative widening.

**Consequences:**
1. **Drop the template subtraction** — inert, and would inject 0.33 bytes of
   orthogonal noise. The 0.23 % shape bound, the 0.9485 gain and the
   operating-point caveats stay correct *as measurements* but apply only at the
   synth operating point.
2. **The u-fossil fence stays** and reduces to removing the marker-**mean** map:
   all 57 markers share one x residue, so every u-keyed x structure is a
   per-marker constant living in the 3.5 % mean. Measured: 1.6520 → 1.6540,
   split 0.0/100.0 by construction, pairwise corr −0.0143.
3. **The quarry's statistics do not move** — RMS 1.647 free / 1.652 pinned,
   96.5 % varying, corr 0.017 free / 0.019 pinned. **No supersession needed**;
   the versioned-supersession bookkeeping is moot.

**Step 3 inherits an ensemble-null mismatch that must be stated before it runs.**
The recorded requirement was that the null's synth controls run the FULL solve,
so the deterministic 0.105 divergence is captured. But those controls carry **no
quarry**, and corr between the misfit's synth realisation and whatever the page
carries measures **0.0003** — determinism guarantees the divergence is
*reproducible*, not that it is *matched* across operating points. A null built on
quarry-free synth targets realises the misfit in the synth form while the page
realises it in the page form, and so fails to contain the very structure the
requirement existed to capture. **The decision is FORCED, not open — both obvious exits are wrong.**

1. *"The divergence enters the spectrum identically"* is dead on this session's
   numbers: it argues that two objects measured at corr 0.0003 have matched
   second-order statistics — arguable only *by* measurement, and the measurement
   **is** the injection arm.
2. **Deranged-map injection is BARRED for this statistic**, and its machinery
   already exists and is tested, which is exactly when a later session reaches
   for it. **The eigenvalue read is permutation-invariant**: relabeling markers
   sends D to P·D·Pᵀ, a similarity transform — verified to **2.8e-14** on the
   page's own maps. The derangement's license was *phase-decoherence*, which is
   statistic-specific; the spectrum does not care which marker carries which map,
   so deranged copies carry the page's low-rank structure **intact** into the
   null, and a real low-rank verdict would read as null-consistent. This is
   correct-but-inapplicable mirrored: a construction certified for one instrument,
   carried to another its certificate does not reach.

**So the null is PHASE-RANDOMIZED SURROGATES.** Per map, independently: keep the
spatial power spectrum, randomize the Fourier phases. Each surrogate is interior,
gradient-scale-matched, ~1.65 bytes — the solve meets the contested-DOF regime at
the page's operating point — while the ensemble is high-dimensional **by
construction**, so the spectrum meets noise. **Self-check, one run:** the
surrogate ensemble's own distance-matrix spectrum must be null-typical; if phase
randomization leaves rank structure, the marginal-matching leaked and the design
iterates *before* the null hardens.

### Contamination: this session's own instrument leaks into the branch

The commutation misfit is a deterministic per-marker structure in whichever
residuals the search consumes — instrument-side, not producer-side, and **the
search cannot tell the difference**. Free-phase maps are cleaner but their phase
offsets are contaminated; pinned maps carry it directly. The earlier harmonic
test (0.7 % vs 8.7 % null) does **not** cover this — it ran on free-phase
residuals, where absorption had already happened.

**The first prescription was a tautology and is withdrawn.** "Pinned maps minus
the pinned-free delta" is algebraically *the free maps*: pinned − (pinned −
free) = free, contaminated offsets and all. The two horns were renamed, not
resolved. The same error invalidates the delta as a *description*: free phases
minimize total RMS, so they trade a little quarry for a little misfit, and the
traded quarry re-appears in the delta. Its statistics (RMS 0.1532, split
3.0/97.0, corr 0.0231) are **mixture properties** — their agreement with the
quarry's 3.5/96.5 and 0.017 is partly because the delta *contains re-exposed
quarry*. Only the psi negative survives (1.7 % vs 6.2 % null), and that is an
amplitude projection: shape-keying would not show there.

**The clean handle is a template from the synth pair, built in the DATA domain**
— `target(--synth-phi) − target(--synth-phi-sample)` (`--target-out`), the
pen-move-vs-sampling-shift difference by construction, from an instrument with no
quarry. Differencing *residuals* would reproduce the tautology. Measured, it
untangles three quantities the entry had conflated:

| quantity | value | what it is |
|---|---|---|
| raw commutation, data domain | 0.4404 | the template itself |
| **survives free source+kernel, pinned** | **0.3429** | **the contaminant in pinned maps** |
| pin cost | 0.1532 | what free *phases* additionally absorb |

**Built at page geometry and page phases, from synth — there is no second
document in this construction.** `--synth` replaces only `.target` and leaves
`used[]` alone, so the pair runs on the **page's own markers**: page em, page pen
line, the page's certified sawtooth, and no page *pixels*. The 57 markers sample
**57 distinct δ** spanning 0.001–0.967, largest gap 0.034 — dense uniform
coverage of the sawtooth the page walks. A δ-parameterized family would be the
fix if the template were built on a document whose phases differ; it is not, and
building it elsewhere would *introduce* that mismatch. Non-circularity comes from
the synth generator having no quarry, not from a detour through a control.

**"0.153 bytes sitting in the maps" was wrong by 2.2x.** The solve absorbs 39 %
of the template's energy, so unit-gain subtraction of the *raw* template
over-subtracts by 1.3x. Subtract quantity (2) instead — by construction what the
solve leaves behind, so unit gain is then correct (a fitted per-marker gain would
eat quarry through the same trade). Build it on the **control**, apply to the
**page**: non-circular, since the control has no quarry to re-expose. Same
preprocessing on both arms, and re-quote the quarry's defining statistics on the
cleaned maps.

**The one genuinely uncertified step is the transfer of the 39 % absorption.**
Quantity (2) is defined through a solve whose free source and kernel adapt to
everything in the target. On synth there is *no quarry* competing for those DOF;
on the page there is, at ~5x the template's amplitude. The 0.1532/0.1550
pin-cost identity is good **precedent** for this class of number being
operating-point-insensitive, but precedent for a different number is not
certification of this one. **Test:** inject quarry-like structure into the synth
target — the permuted real residual maps from the mismatched-control design,
which preserve interior/gradient/per-line statistics with no true key — re-run,
re-measure absorption. Stable at 39 % ⇒ it transfers; drifts ⇒ **the drift is the
bound on projection error**, recorded beside the u-fossil fence.

**RUN 2026-08-04 — IT DRIFTS, and the drift is carried as a bound.** Four
**derangements** (not shuffles: a shuffle leaves ~1 map on its own δ, which is
coherent reinforcement of the template at exactly the phase the permutation
exists to decohere) injected into **both** arms, so the data-domain template — a
difference of two targets that each gained the same map — is preserved by
construction.

| | template | surviving | absorption |
|---|---|---|---|
| baseline, no quarry | 0.4404 | 0.3429 | **39.4 %** |
| perm0–3 | 0.4352–0.4373 | | 36.1 / 37.2 / 34.0 / 34.1 % |
| **across derangements** | | **0.3507 ± 0.0042** | **35.3 % ± 1.4** |

**THE DRIFT WAS WITHDRAWN THE SAME SESSION — it was leakage measured as drift**,
caught by the shape check inserted before the subtraction. Each permutation's
surviving map is *coherent misfit + independent injection leakage*; averaging
four derangements attenuates the leakage in energy and separates them:

| | value |
|---|---|
| mean of individual RMS (reported as "surviving") | 0.3507 |
| RMS of the **averaged** map | 0.3388 |
| ⇒ coherent misfit remnant | **0.3347** |
| ⇒ injection leakage per permutation | 0.1049 |

Absorption on the coherent part alone is **41.1 % vs the 39.4 % baseline — +1.7
points, not −4.1**, reversing sign as well as shrinking. **"Use 0.351" is
withdrawn**; 0.3429 is right to within ~2 %. The error was the standing one in a
new coat: a per-run RMS taken as one quantity when it was a mixture of two.

**What the shape check certifies — the bound that matters.** Contested-DOF
*rescales* the misfit rather than replacing it: corr(averaged, baseline) =
**0.9601** at optimal gain **0.9485**. Minimum remnant 0.0947 bytes, of which
0.0524 is residual leakage, leaving **shape mismatch 0.079 bytes = 0.228 % of
page variance** against the 4.32 % removed. **That 0.23 % is the honest
projection residual**, superseding the 0.005 % computed from the wrong quantity.
Step 2 subtracts the **baseline** surviving maps — the only clean shape
measurement, since the permutation runs are leakage-contaminated — at gain ~0.95.

**The direct check relabels the decomposition without moving its arithmetic.**
Run before the indirect number hardened: (a) the injection **cancels exactly** in
the difference map — the same `P` goes into both targets, and corr(surviving, P)
measures −0.006 / −0.012 / +0.000 / −0.006. So the 0.1049 is **not** injection
leakage but *divergence in how the two arms' solves converged*. It is still real,
still independent across derangements, still averages down as 1/4 in energy — so
0.3347, 41.1 % and the 0.079 shape bound all stand; only the label was wrong.
(b) Regressing `d_p = resid(injected) − resid(baseline)` on `-P` (the sign note's
first live use — `+P` would have read anti-correlation and inverted the answer)
gives slope **0.844–0.873** at corr 0.92–0.93: **the solve absorbs only ~14 % of
injected per-marker structure.** That refutes the idea that the free source can
soak up arbitrary structure at a foreign phase, and **inverts the consequence
favourably** — statistics computed *through* the solve retain ~86 % of per-marker
structure rather than being nearly blind to it.

**The 0.105 is an owned instrument constant now: solver divergence under a common
perturbation, and it is DETERMINISTIC.** Re-running one derangement through both
arms returns **bit-identical** residuals (max |diff| 0.0e+0; surviving 0.347908
both times), so it is a fixed function of the target, not CG or ALS path noise.
It sits at (0.105/1.65)² = **0.4 % of quarry variance**, and since every map the
search consumes comes through this solve, that is a **sensitivity floor on the
search's inputs**. Being deterministic it is captured automatically by any
ensemble null whose synth controls run the **full** solve — and lost by anything
that shortcuts the solve to save time. That is a requirement on the null, not an
optimization.

**The 86 % survival is a transfer function, and it recalibrates two things.**
*Amplitude:* the quarry's 1.647 is what **survived** the solve, so producer-side
structure upstream is ~**1.16×** larger. Quote the residual as measured and note
the transfer, or a generator-builder will wonder why their mechanism comes out
14 % small. **Scope it honestly** — measured on one structure class (the page's
own deranged maps), and the slope may be structure-dependent, so this holds *for
structure of the quarry's class*, not as a universal constant. *θ-scan positive
control:* "~1.6-byte amplitude" is now ambiguous between domains. **Inject at
1.6/0.86 ≈ 1.9 data-domain, or calibrate through the measured slope — but name
which**, because a control injected at 1.6 data-domain and recovered at ~1.4
reads as a sensitivity shortfall when it is the transfer function behaving
exactly as measured. Self-resolving in the end (the control measures its own
end-to-end recovery) but only if the domain is stated before the number is read.

**Two conventions named so the pair cannot be mis-combined.** *Denominator:*
every absorption figure is "fraction of **its own** template absorbed" — baseline
against 0.4404, permutations against their own ~0.4361, since those solves never
saw the baseline template. Against the baseline template the coherent remnant
reads 42.2 % rather than 41.1 %. *Gain:* 0.9485 is a **regression coefficient**,
unbiased under a component independent of the baseline map — noise in the
dependent variable attenuates *corr* to 0.96 but not the slope. A reader seeing
corr 0.96 must **not** "correct" the gain downward by it.

**Operating-point-specific; never average or swap with the baseline.** The
permuted maps carry ~1.65 bytes because they are real page residuals, matching
the page by construction — but this is a point estimate with no measured slope.
Preprocessing the **control** arm, where quarry is ~0.28, uses the 39.4 %
baseline, not these. Same units, different configurations: a ledger entry waiting
if a later session averages them.

**The clamping gate passed clean, reported before the result it gates.** Max
per-marker template deviation 0.0342 against the pre-stated max(0.05,
0.10·T₀) — **no marker excluded in any derangement**, coverage 57/57, no δ band
lost. The deviation *is* mildly phase-structured (corr 0.285 with |δ−½|, 0.460
with template size; by δ quintile 0.0046/0.0027/0.0029/0.0048/0.0054), so
clamping does bite preferentially where the template is largest — just far too
small to matter. A permutation-level rule was also pre-stated and went
unexercised: a derangement must retain ≥50 of 57 markers or be flagged; all four
retained 57.

**Sign note — trivia here, a fabricated negative one construction away.**
Injecting `+r` puts a *reflection* of the quarry into the target (residual =
model − target). Every statistic here is sign-blind. It matters the moment anyone
correlates the solve output against the injected structure **with sign** — that
test must use `-r`, or it reads anti-correlation and concludes the solve
*rejected* an injection it absorbed perfectly.

**Two clauses that test needs or it measures itself.** (a) *The permutation is
what makes the injection admissible.* The injected maps are **free-phase**
residuals, so each carries its own share of the re-exposed-misfit mixture at the
~0.3-byte level; dropped into a synth target that already contains the misfit,
that could double-count or correlate with the template. What saves it: the misfit
is keyed to δ_k and the permutation moves each map to a marker with a *different*
δ, so the contamination arrives **phase-decohered** and presents as generic
per-marker structure rather than coherent reinforcement. That property, not the
permutation as such, licenses the test — an unpermuted variant would silently
lose it. (b) *One permutation is one draw.* Run several; the **spread of measured
absorption across permutations is part of the drift bound**, not noise to average
away.

**The adequacy check as specified is tautological — third instance in two
sessions.** "Subtract the template, verify the pinned synth arm reaches 0.163"
cannot work, because quantity (2) *is* pinned(phi) − pinned(phi-sample) by
definition, so subtracting it returns the second exactly. It cannot be repaired
in place: the real adequacy question is whether the page's contamination equals
the synth's, which is the transfer question above. **There is no separate
adequacy row**, and the honest bound on residual contamination is the absorption
drift.

**Detection floor, corrected:** (0.3429/1.65)^2 = **4.32 %** of variance, not the
0.86 % computed from the wrong quantity — 5x larger, and **no longer comfortably
under** the ensemble null's spectral noise at N = 57. So the contaminant can
plausibly reach the *dimensionality* verdict too; the projection is needed for the
eigenvalue read, not just the theta scan. Unresolved until the null's spectrum is
measured with and without the template. **With the adequacy row gone this comparison is LOAD-BEARING, not
corroborative:** it is now the *only* empirical read on whether the projection
behaved on real data. The drift bound says how much contamination might remain in
principle; the spectral comparison is where an unexpected projection failure
would actually show.

3. **Spend this first — a model-free statistic that discriminates before any θ is
   named.** If the maps are keyed to *any* hidden 1-D variable walking with k,
   map-to-map distance must correlate with distance in that variable. So ask
   whether the 57 maps lie near a one-dimensional manifold at all: an
   eigenvalue/MDS read on the 57×57 distance matrix against the ensemble null.
   The chance-level mean pairwise correlation already on record (**0.017**) hints
   they do not sit on a smooth low-dimensional curve in byte space — which would
   push toward a high-frequency key or genuinely per-line state with no walk.
   Knowing which costs one matrix.

Either branch ends somewhere definite: a resolution measured and a read within
reach, or 17 documents certified □ with the most thoroughly characterized
obstruction this project has written down. After thirty-odd refuted mechanisms
both of those are results.

If a later mechanism does earn a generator, these are still the readouts it
must hit without being tuned to them:

| readout | target |
|---|---|
| joint RMS | 1.647 (control 0.281) |
| phase-scan residual | 0.0212 against the 0.0146 floor |
| energy split | 3.5 / 96.5 |
| byte-127 rate | 0.500 % |
| x staircase | period 23.89 cols, amp 0.2759, drops at cols 13/37 |
| skew curves | slope 0.0494 in x; y twin per row 6 |
| Δ48 exact pairs | ~21 of ~149 same-character pairs |

## Standing side items

- **DONE 08-03u — y accumulator amplitude.** Fitted free with the sawtooth
  ORIGIN scanned (an OLS assuming origin 0 returns a *negative* amplitude at
  12× the residual): **0.32018 ± 0.00189 output px**, certified unbiased to
  0.3 % against `--synth-phi`, whose true amplitude is exactly 1.0 src px.
  **u_y ≠ u_x** — 24σ from the x grid's 0.274220, so *one grid for both axes is
  refuted* and that producer statement is not available. It does land 0.04σ
  from the rung `pitch/(m + 1 − φ)` at m = 44 — the branch nobody had scored —
  but rungs are 1.5σ apart across two branches, so a random amplitude lands
  that close ~5 % of the time. Suggestive, not decisive.
- **The aspect 1.0669** — untouched by all of this. One provenance-guided
  candidate was never enumerated: driver-distributed Courier replacements
  (HP Dark Courier — taller, same advance). One targeted fetch, not a roster.
- **PARKED: the profile estimator's +0.071 px/48 cols.** Real, cause unknown
  (FM-sideband refuted by certification: −0.009 where +0.071 was needed; not
  first-moment shape, 1.3 % vs null). Do not use the profile fundamental for
  this document's advance; the control's calibration does not transfer.
- **Fine-lattice joint solve (2×/4×)** — pre-registered representation-error
  test, superseded as the lead by the mechanism work but still sound; only
  worth running if the six-row verdict lands on the blank line.

## Traps this family has already sprung (the ones still live)

- **A PREDICTION FOR BYTE DATA MUST BE GENERATED THROUGH THE BYTE
  QUANTIZATION, never taken from continuous algebra.** Sixth instance of the
  instrument-DOF lesson and the first where the instrument fabricated a
  *positive* rather than a floor — the dangerous direction, because it makes a
  candidate look confirmed. Catmull-Rom's μ₂ ≡ 0 is exact to 4.4e-16; compared
  against that analytic zero the page reads "consistent with (b′)". Generated
  through the clamp and the round, (b′) predicts **28.2 %** of ψ-keyed width
  modulation, and the page refutes it. Every moment channel here is read on
  bytes, so every analytic prediction against one is suspect until it has been
  through `--synth`.
- **CORRECT-BUT-INAPPLICABLE.** Type specimen, this session: the commutation
  template holds its δ≈0 certificate to six zeros (exactly 0.000000 at the marker
  where a pen move and a sampling shift coincide) *and* reads corr **0.0003**
  against the page. Correct, certified against its own construction, and
  inapplicable. **Every certificate a synth-built object carries is a certificate
  about the synth operating point**, and none transfers a millimetre past it. A
  certificate licenses use *at the point where it was earned*; applying the
  object elsewhere needs a fresh measurement **at the destination**. That
  measurement is the only reason 0.33 bytes of orthogonal noise did not enter the
  search's inputs wearing the quarry's label.
- **A CHAIN IS NOT A GATE. `gates && commit` checks only the LAST exit code.**
  Shipped a non-parsing `families.mjs` in `4be93ab`: `lab:selftest` crashed in
  that very run, `mono:selftest` passed after it, and the `&&` let the commit
  through. **Invariant: a commit command never shares an invocation with the
  gates that license it.** Read the gate output, then commit — two acts.
- **THE INTERPRETING LAYER IS ITSELF AN INSTRUMENT, AND IT HAS NO SELF-TEST.**
  Shell quoting, chain semantics, string parsing — each sits between intention
  and record, each transforms silently, and none reports failure in its own
  terms. Three instances in one session (backtick substitution ate `+r`/`-r`; a
  closed string left prose outside a literal; `&&` licensed a commit past a
  failed gate). **The readback is its positive control** — there is no other.
  This supersedes growing the list one instance at a time. Writing the
  sign note via a bash string let backtick interpolation eat `` `+r` `` and
  `` `-r` ``, landing "test must use , or it reads anti-correlation" — a sentence
  about a fabricated negative, itself corrupted into nonsense by an unchecked
  construction. Caught only on readback. Costs seconds; the failure mode is **a
  record that lies while looking well-formed**, which is the most expensive kind.
  Use the Edit tool for anything containing markup.
- **THE TAUTOLOGY GUARD: before subtracting B from A, name how B was
  constructed. If A appears in B's derivation, the subtraction is an IDENTITY**
  and whatever it appears to measure is being measured nowhere. Different shape
  from the forbidden-arithmetic ledger — that one catches illegal *combinations*
  across configurations, this catches *identities*. Three instances in two
  sessions, all of which looked like measurements: pinned maps minus the
  pinned-free delta (returns the free maps exactly); a template built by
  differencing the residuals it was to be certified against; quantity (2)
  subtracted from its own minuend (returns 0.163 by construction). **Two produced
  plausible numbers — 0.1532 and 0.163 — that each survived a full session**
  before anyone inspected the construction.
- **Null medians are detection thresholds, not effect sizes.** The
  permuted-ψ null was suspected of being conservative — six page readings have
  landed below their own median. Tested on pure noise at n = 57: observed-ψ R²
  7.31 % against a permuted median of 6.18 %, below its own median in **48.8 %**
  of trials, and the detrend changes nothing. **The null is unbiased**, so the
  negatives are genuine non-detections rather than conservative ones, and the
  bottom-tail run is four correlated moments of the same 57 profiles plus
  chance. Never quote a null median as an amplitude.
- **`--solve-joint --solve-phase` with no geometry pinned is an UNREAD
  INSTRUMENT.** The default sweep grid (`--fy 2.88,3.00,0.02`) does not contain
  2.92916, so the solve starts from the wrong geometry and diverges: RMS
  8.4–12.9 free against **42–45 clamped**, phase sd 0.453 instead of 0.267, and
  the pitch scan reporting **FLAT**. Read at face value that says the wobble is
  not deterministic and all of 08-03d is wrong. Always
  `--em 2530 --fy 2.92916`. Cost: 9.5 minutes and one false alarm.
- **Magnitude agreement is worth nothing.** The row-mapping ramp hit 1.662 vs
  1.647 with zero of four fingerprints; outline-quantum 1/2 hit 1.584 the same
  way. Judge mechanisms on signatures.
- **A solve with no positive control is an unread instrument** — SIX verdicts
  in this family were read against unmeasured zeros and withdrawn, two of them
  this session (the free-kernel floor, the first skew control). Certify per
  CONFIGURATION, not once: the instrument's failure modes are part of the
  experiment's degrees of freedom.
- **Anchor on continuous lines, never on rounded ones.** Detected-ink-top cut
  (08-03b) and `round(x0 + c·pitch)` window cut (08-03m — frac(pitch) = 0.667
  aliases at period 3 and manufactured a 0.7 px staircase at r = 0.989) are
  the same trap on two axes. Use fractional-overlap windows.
- **Sweeping a scale factor without holding the physics fixed** produced three
  withdrawn "sharp minima" (kernels ride in source px; co-vary aspect and k
  or the sweep measures itself).
- **The pen-line stage needs ≥8 markers** with 2σ rejection and (x0,y0,pitch)
  refinement; 6 markers scored 817 where 8+ scored 205 on identical physics.
- **Degenerate rates in wrapped-ramp scans**: demand ≥2–3 wraps over the span
  or the scan fits the estimator's own drift (|r| 0.805 on data with no
  sawtooth at all).
- **Read the CLAMPED RMS beside the free one on every joint run** — a source
  that leaves [0,255] is not a source (freeing x alone "scored" 1.666 with
  pixels at −255).
- **Do not decode the base64 payload as ground truth for anything** — reading
  it IS the open problem; the prose diagnostic carries wrong cells and no
  certificate. The pair-distance histogram is the non-circular substitute.
- **Do not re-derive the source dpi from fits** — the sweep saturates above
  300 (203–205 flat), and the amplitude of the x sawtooth is a LAYOUT-grid
  length, not a render pixel (the 348-dpi reading died on its own period
  prediction: 4.9 columns vs the observed 23.89).

## Where it goes when it closes

A working reproducer is a **pageLaw** entry, not a glyph pool — the family
entry says `renderable: false` and why. Only after a document reads clean does
a pool get added (`tools/fontgen.mjs` → `tools/glyph-registry.mjs` →
`npm run gate`). **A pool is a proven recipe.**

Gates that must stay green: `npm test`, `npm run lab:selftest`,
`npm run mono:selftest`. Triage any new document with
`node lab/resample.mjs <pdf>` first, and `node monospace-lab/payoff.mjs <pdf>`
before anyone considers hand-labelling (this family: 1.00× reuse, 1.3 %
cross-page transfer — there is no template job here).
