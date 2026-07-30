---
description: Fix the subset-glyph displacement defect (259 silent L→I in EFTA01150379) and re-close the LM Federal payload
---

The reader's one measured **silent-misread channel** (open-work item 0b,
measured 2026-07-30). Full record: `tools/glyph-registry.mjs`, the
`dejavuserif786law` block; corpus state: [lab/base64/README.md](../../lab/base64/README.md).
This brief is the work order for fixing it.

## The defect, in one paragraph

`EFTA01150379` reads at tolerance 0 with 61 honest □ — and **259 silent L→I
substitutions** (no □, no fail, all on pure-base64 body lines). `I`'s ink is a
strict subset of `L`'s; where L's bottom arm approaches a following tall
letter (next-char histogram: z 38, m 36, h 28, Z 23, n 20, k 20, l 14…), the
arm pixels land in the PENDING class and the acceptance score demotes the true
glyph below its subset. The leftover arm ink is absorbed with no fail. This is
an **engine acceptance-rule defect** — the face, size, law and lattice are all
correct, and the set has no byte-identical cross-char rasters (measured):
isolation can't misread, the composite scan can.

Three independent proofs, all reproducible on this machine:

1. **XMP majority vote** — the payload's 232 clean-length metadata streams
   disagree in exactly 34 bytes, all `/`→`#` at position 262 = base64 `L`→`I`.
2. **Pixels** — p40 y54 pen 285.5: the page ink is the L (arm + right
   fringe), the reader accepted `I` (`exact 14 pend 0`); L produced zero
   failing bytes and lost on score.
3. **Pen-gap census** — after a fake I the next glyph sits
   adv(L)−adv(I) = 3.30 px late. Every gap in [2.8, 3.6] px across 12.73 M
   glyph pairs is an 'I': 259, zero coinciding with a fail.

## Reproducers (all machine-local in `lab/base64/`, gitignored)

```bash
node lab/base64/gap-census.mjs             # ~9 min; pre-fix baseline in .gap-census.json
node lab/base64/verify-silent.mjs          # ~2.5 min; 259 silent / 0 with-fail / 259 body
node lab/base64/reconstruct-pdf.mjs        # rebuild payload from .reclines.tsv (--reread to re-read, ~30 min)
node lab/base64/audit-reconstruction.mjs   # xref drift + /Length + XMP vote
node lab/base64/verify-pdf.mjs lab/base64/LM-Federal-groundtruth.pdf
```

Pre-fix baselines the fix must beat: census 259 in-band; XMP vote 34; audit
drift `0:93 57:353 114:858 171:1274`, 7 /Length mismatches; verify-pdf
"cannot find startxref … repairing".

## Job 1 — the acceptance rule (`engine/ocr-engine.js`, scanLine)

Anchors to read first (cite by text, the line numbers drift):
- the score: `score: exact - pending * 0.25` and the rejection
  `exact < considered * 0.5 || pending > considered * 0.35` — the two rules
  that demote the true superset;
- the pending definitions (`pv < q(minPred) - t` linear path, `pv < d - TOL`
  plain path) — pending exists for kern overlap and must keep existing:
  "a glyph hiding inside solid ink shows up as mostly-pending and must not be
  accepted";
- the anchor-distance slots (`slot[0] ?? slot[1] ?? slot[2]`) and the
  tie-break on `_i` ("acceptance must not depend on group iteration order");
- the composite 1-ambiguous junction allowance
  (`cv !== 255 && q(minPred) - pv === 1`).

Candidate designs, cheapest measurement first — pick by gates, not by taste:

1. **Subset-aware preference**: when two same-anchor candidates both return
   valid results and one's ink mask ⊆ the other's, prefer the superset iff
   its exact count ≥ the subset's exact count (its extra pixels being only
   pending, never failing). Narrow, targets exactly the measured defect.
2. **Re-weight pending**: score pending at 0 instead of −0.25 (keep the 35%
   rejection). Broader; measure what it does to every gate before believing.
3. **Lookahead arbitration**: accept tentatively, prefer the candidate whose
   acceptance leaves the least unexplained ink before the next anchor.
   Most general, most expensive, only if 1–2 fail.

Traps: the pending share rejection protects against glyphs hiding inside
solid ink — do not weaken it globally to fix a pairwise preference. The
subset relation should be computed from the set's rasters (per phase), not
hardcoded I/L: the fix must catch whatever other subset pairs exist.

## Job 2 — the reconstruction placement bug (`lab/base64/reconstruct-pdf.mjs`)

Unread bands come back as `{top, unread: true}` — **no `baseline`** — and the
cache pass sorts `lines.sort((a,b) => a.baseline - b.baseline)`, which puts
them at arbitrary positions (NaN comparator). Result: 3 phantom erasure lines
inserted at wrong offsets + 2 displaced (the ±57 change-points at pages
50/51, 101, 426, 598/599, 1221). Fix: sort unread bands by `top` (+~11 px to
approximate a baseline), and re-derive `.reclines.tsv` (`--reread`).

## The ladder — in this order, every rung green

1. `npm test` · `npm run gate:synth` · `npm run rust:certify` — fast sanity.
2. `npm run gate` — 18/18. If any transcript changes, the change must be
   *only* improvements, arbitrated by the truth transcripts (nimbus791 block
   is letter-exact 5,028/5,028 — it must stay so) — then re-record with the
   census updated (`fixtures/gate-ref/README.md` documents how).
3. `npm run lab:selftest` — decoys stay flat zero.
4. `node lab/base64/gap-census.mjs` → **0 gaps in [2.8, 3.6]** and the 259
   positions read as L.
5. `node lab/base64/audit-reconstruction.mjs` after re-reading + rebuilding →
   XMP vote 0; with Job 2 also drift {0}, 0 /Length mismatches, and
   `verify-pdf` opens without repair.
6. The 22 other base64 documents re-read with the SAME numbers
   (2,622,517 glyphs, 2 □) — the fix must not disturb a solved read.

## Job 3 (after 1–2 land) — subset-pair audit of the other pools

For every set at its size: compute per-phase ink-mask subset pairs (I⊂L
proved; suspects: l/1/I class, r/n-fragments, P/R, F/E). Any pool with a
subset pair + tight kerning contexts has this exposure. Gate documents with
truth transcripts are provably clean; the rest were never truth-checked —
quantify before claiming.

## Non-negotiable

Tolerance stays 0 everywhere; the fix changes WHICH exact candidate wins,
never what counts as exact. Every family other than the right one still
scores flat zero. If a rung goes red, the fix is wrong — do not re-record a
reference to make it pass.
