# lab — what produced these pixels?

The reader can only certify a document whose **(face, size, pen lattice, blend
law)** it already knows. This half of the repo finds that tuple, from pixels
alone, and hands it back as an entry in [families.mjs](families.mjs).

Ten files, and every one of them is on the critical path of a hunt. Eight
survived from the previous repo's thirty-one — the twenty-three that are gone
were either one-off probes for hunts that are closed, or second implementations
of something already listed below. The two that are new each earned the seat:
`transform.mjs` is a producer law's reproducer, `resample.mjs` the triage that
stops a resampled page from burning a sweep. What was learned from the
twenty-three is in [../docs/LAWS.md](../docs/LAWS.md) and
[../docs/METHOD.md](../docs/METHOD.md), which is where a fact belongs once it
has stopped being code.

## A hunt, in the order you should actually try things

```bash
node lab/resample.mjs mystery.pdf            # 0. ~40 s — a 1× render at all? routes the hunt
node lab/mbank.mjs scan mystery.pdf          # 1. ~100 ms — face and size, cold
node lab/ingest.mjs mystery.pdf              # 2. the producer's own page rasters
node lab/harvest.mjs --doc mystery --out h1  #    ground-truth glyph windows
node lab/identify.mjs --targets h1           # 3. try every answer we already have
node lab/identify.mjs --targets h1 --scan tahoma.ttf     # 4. right face, unknown size
node lab/sweep.mjs --targets h1 --fonts all              # 5. the exhaustive net
```

**Stop as soon as something answers.** Step 1 alone has closed hunts — the
Tahoma family, the largest tol-0 population in the corpus, was found by the m
bank and proven the same day. Steps 2–5 cost progressively more, and step 5
costs hours. Step 0 exists because the answer can be "no face will ever
match": a resampled page (the 816×1073 family) fails every sweep by
construction, and the triage says which way the pixels went — per axis, with
its own positive controls — before those hours are spent.

Two of those steps have a fast twin in **[rust/](rust/)**, which is the same
search certified against this JavaScript: `hunt sweep` is step 5 at 40–45×, and
`hunt harvest` is the **connected-component** harvester, which needs no
lattice and so works where `harvest.mjs` cannot. One `npm run rust:build` and
step 5 stops being an afternoon.

Once you have an answer, it leaves the lab: add the entry to `families.mjs`,
build the glyph set with `tools/fontgen.mjs`, add a pool to
`tools/glyph-registry.mjs`, and let `npm run gate` hold it still. **The lab
does not read documents; the reader does.**

## The ten, and the engine

| | |
|---|---|
| [resample.mjs](resample.mjs) | upscaled, downscaled, or native — per axis, self-checked; run before a sweep |
| [mbank.mjs](mbank.mjs) | 4 px of one `m` names a face — the prefilter that starts a hunt |
| [ingest.mjs](ingest.mjs) | PDF → the producer's own page raster + its OCR overlay |
| [harvest.mjs](harvest.mjs) | pages → byte-identical glyph windows you can call ground truth |
| [identify.mjs](identify.mjs) | targets → every proven family, then an em64 scan of one face |
| [sweep.mjs](sweep.mjs) | targets → every (face, em64, pen, law), when nothing known fits |
| [families.mjs](families.mjs) | the answers so far, as data — and the blend laws (six names, four distinct maps) |
| [transform.mjs](transform.mjs) | the dejavuserif786 producer's transport law, recreated — the reproducer its families.mjs entry cites |
| [pgm.mjs](pgm.mjs) | the pixel container, and one definition of ink |
| [selftest.mjs](selftest.mjs) | `npm run lab:selftest` — the whole loop, on a known answer |
| [rust/](rust/) | optional: the sweep at 40–45×, the anisotropic probe, the component harvester — with its own gate |

## What holds it honest

`npm run lab:selftest` runs a complete hunt on `EFTA00751637` — a gate document
whose family the reader already proved — and checks that the lab rediscovers it
without being told:

```
PASS  harvest advance fitted from ink alone — 7.418 px (expected 7.418)
PASS  identify verdict — 93/107          PASS  identify hit rate — 87%
PASS  no other family scores at all — 29 families, all 0
PASS  sweep winner — NimbusMonoPS-Regular.cff em64 791 fz
PASS  m-bank: EFTA00751637 — lab:NimbusMonoPS-Regular@791
PASS  m-bank refuses the post-law family at tol 0
```

The third line is the one that matters. Exactness cannot false-positive, so
every *other* family must score flat zero — a single stray hit would mean the
exact test has a hole in it and every verdict this lab has ever given is
suspect. The last line is its mirror: `nimbusrom`'s producer applies a post-law,
so the bank must **refuse** it at tolerance 0 rather than guess.

The corpus is not distributed, so on a fresh clone the selftest skips. It says
so, and **skipping is not a pass**.

## Five things that are easy to get wrong here

**The overlay is evidence, not truth.** `words.json` is the producer's own OCR.
It misreads, and its per-character advances are stretched to fit the ink, so
only word *starts* mean anything. Every geometric number downstream is fitted
from pixels — the band advance above was measured at 7.418 px on a document
whose own manifest claimed 6.001.

**Harvest is monospace-only, and it clips.** The cell lattice assumes abutting
equal-width cells; on a proportional face it emits byte-identical *fragments*
that prove nothing. And a glyph whose ink runs past its cell loses columns
silently — those windows are detected and dropped (13,210 of 24,502 cells on
the selftest document), because a clipped window has the wrong dimensions and
fails a dims-gated sweep for a reason that has nothing to do with the face.
For a proportional face, use route 1: mbank → `fontgen` → read.

**A miss is a statement about your roster.** `sweep.mjs` prints what it
enumerated when it finds nothing, and `identify.mjs` counts the families it
could not even try, because a face that is not installed is not a face that is
refuted ([METHOD rule 3](../docs/METHOD.md)).

**Scope every "all pages / every document" claim to the family you measured, at
the time you write it.** A fact measured on one family gets compressed into a
corpus-wide one the moment it is summarised, and the summary is what the next
session believes. It has cost twice: "lossless FlateDecode, so byte-exactness
is reachable" (true of the container, said of the pipeline), and "every page
carries two Bates numbers on two layers" (true of the 17, false of the readable
family — which carries no burned band at all, and a whole test was planned on
the compressed version). Write the family into the sentence, not into the
paragraph above it.

**An effect size is never comparable across documents — quote it ×its own
null.** Anything measured per-document (a phase ramp, a mid-tone share, an
observations-per-raster ratio) scales with that document's own spread and *n*,
so two raw numbers side by side compare nothing. It has now cost twice: the
mid-tone lead was one page against one page unnormalised, and a lattice-drawn
control scored ramp amplitude 0.105 against a suspect document's 0.119 while
being **flat** (p = 0.16) — its splits were 2.4× more spread, putting its null
at 0.081 instead of 0.041. `ubuntu-kit/phaseramp.py` prints `split sd`, `null
amplitude` and `×null` for exactly this reason. A statistic with no null is a
statistic with no verdict.

## Deliberately not here

- **A GPU matcher.** A CUDA template matcher existed and was fast — 5 ms/page,
  75–98% of characters, **no certificate**. It is the wrong trade for this
  repo: what it accelerates is approximate matching, and the product here is
  exactness. Where speed genuinely is the wall — the exhaustive sweep, which is
  hours in JavaScript — the answer is [rust/](rust/), which is 40–45× on the CPU
  *and* certified against this JS as its oracle. Measured against the prefilter
  it is not even clearly ahead: `mbank scan --profile` over these 17 fixtures
  spends 20% reading and inflating, 32% finding components and 48% matching, so
  a GPU could attack under half the work, and only after a CPU-side inflate had
  already fed it. `--jobs=8` is the cheap version of that win and it is one flag.
- **A second harvester *here*.** The old repo had four (monospace,
  connected-component, model-guided, hand-transcribed) writing two different
  target formats. There is one format now — PGM + `index.json` — and
  everything reads it, including `hunt harvest`, which is the
  connected-component one and lives in [rust/](rust/) because that is where its
  speed is. Two harvesters, one format, and neither is a second implementation
  of the other: `harvest.mjs` cuts a fitted monospace lattice, `hunt harvest`
  cuts connected ink and needs no lattice at all.
- **A hunt ledger.** Atomic claim directories and resumable multi-session
  briefs are real machinery, and they exist to make *long* runs survivable. The
  only long run here is the exhaustive sweep, and what actually earned its keep
  is `hunt sweep --ckpt`: one fsynced line per finished config, so a killed
  sweep loses at most one.
- **Findings documents.** Seven of them, and they went stale. A proven family
  is now a row in `families.mjs` citing the *document* that proves it, because
  the document does not go stale and re-reading it is one command.
