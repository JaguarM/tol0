---
description: The lab/base64 corpus — what reads, and why the 17 unidentified documents cannot
---

`lab/base64/` holds 40 e-discovery documents, already grouped by what the
pixels said. Read [lab/base64/README.md](../../lab/base64/README.md) first: it
is the state of play, and it is current as of 2026-07-27.

**22 of them read at tolerance 0 today** — 2,622,517 glyphs, 2 □, and 28 of 28
base64 payloads decode clean (a 999 KB M4A and an 80 KB PDF among them). That
half is done. Do not re-litigate it; if you touch it, the only acceptable
outcome is the same numbers.

## The job — CHANGED 2026-07-27, read this before planning anything

This brief used to say the job was to turn `lab/base64/unidentified/` into an
11th `POOLS` entry. **That job does not exist.** Those 17 documents are not a
face hunt and never were: the pages are a **300 dpi bitonal source
area-averaged 8/25 down to 96 dpi**, so a page pixel is not a function of any
1× coverage map and no `(face, em64, pen, law)` can reproduce one. The family
is `page-downscale-816x1073` in [lab/families.mjs](../../lab/families.mjs),
which carries the three measurements; the crux is that a glyph's sub-pixel
phase tracks its **absolute page x, mod 8**, which a pen lattice cannot do.

Two things this supersedes, both of which were premises of the old brief:

- ~~"lossless FlateDecode … so byte-exactness is reachable in principle"~~.
  FlateDecode describes the last encoding step and says nothing about the
  resample before it. The observation was right, the inference was wrong.
- ~~"a full 256-level gray ramp is what a producer post-law looks like"~~. It
  is what an area-average looks like. There is no post-law to fit — and note
  the tol-0-readable control `EFTA00751637` has a *lighter* median core (54)
  than these pages (20), so gray statistics never pointed anywhere.

**So the open goal here is now the secondary below.** If you want the 17
documents at tolerance 0, the only honest route is to reproduce the producer —
rasterize bilevel at 3.125× and apply the same 8/25 box resample — which is a
real project, not a sweep. Do not widen a roster and do not touch a tolerance.

## Do not pay for these twice

Enumerated 2026-07-27, all returning **zero**. The first four are the old
brief's; the rest were bought closing it out.

- All 10 `POOLS`, on p2 of `EFTA02237690`, `EFTA01804740`, `EFTA02154109`,
  `EFTA02715081`. Every one: 0 glyphs, 100 % □.
- `mbank scan --tol1`, 419 faces × 23 sizes × 4 phases. No `m` at tol 0 or 1.
- `identify --scan` of `segoeui`, `calibri`, `arial` over em64 448–1280.
- `hunt sweep` over 6 faces × em64 700–1100 × 4096 pens × 4 laws.
- **The roster is no longer the limit.** It was widened to **1,253 faces** —
  Office CloudFonts under `AppData/Local/Microsoft/FontCache/*/CloudFonts`, plus
  every app-bundled face on C: and the dataset drive — staged via the new
  `TOL0_FONT_DIRS` env var (`FONT_DIRS` in `families.mjs`, mirrored in
  `lab/rust/hunt/src/io.rs`). m-bank rebuilt to 110,244 templates: still no `m`
  at tol 0 or tol 1, and the nimbus791 control still names its face 13/13 with
  **no stray hit from the 780 new faces**.
- **Any monotone law, not just the four in `LAW_NAMES`.** 1,253 faces × em64
  700–1100 × 4 x-phases, asking whether *there exists* a monotone cov→byte map
  reproducing a target exactly: zero. The same test on the dims shortlist
  (Calibri @ 938–942 leads at 22/26 characters) over the full 64×64 pen
  lattice: zero. Calibri also refuted by `hunt sweep` at 4096 pens × 4 laws.
  The method was validated first on the solved `courier` targets, where it
  recovers `NimbusMonoPS-Regular @ 791` on 11/11 characters with every decoy
  face at flat zero.

## The open goal: `dejavuserif786/EFTA01150379`

2,427 pages of pure base64, the biggest payload in the corpus. The face is
*right* (DejaVu Serif @ em64 786); only the build is wrong, so 9/391 targets
are exact and 0 bytes decode. DejaVu 2.34 ≡ 2.35 is eliminated. This is now the
primary, because it is the one still capable of becoming a pool.

## Non-negotiable

- **Tolerance is part of the proof, never a knob.** If a page needs slack,
  justify it with a documented producer law or do not claim the family.
- **Every family other than the right one must score flat zero.** A single
  stray hit means the exact test has a hole and every verdict is suspect.
- **A miss is a statement about your roster.** Say what you enumerated. Never
  report "not this face" when you mean "not on this machine".
- Closing the hunt means the full recipe: entry in `lab/families.mjs`, set via
  `tools/fontgen.mjs --set`, `SETS` + `POOLS` + `BATCH_LADDER` in the registry,
  then `npm run gate` green. Half of that is not a pool.
