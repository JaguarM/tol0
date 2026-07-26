# gate-ref — the expected numbers

These files **are** the expected output. `npm run gate` re-reads every gate
document and byte-compares its whole transcript (`<name>.txt`) and its counts
(`<name>.summary`) against the file next to this one. There is no assertion to
tune and no threshold to argue about: any change in any number is the signal.

Recorded 2026-07-26 (step 4 of the port), 18 documents:

| | lines | glyphs | □ |
|---|---:|---:|---:|
| v3 | 1,785 | 122,883 | 0 |
| big | 18,307 | 1,338,832 | 0 |
| email | 1,908 | 113,600 | 0 |
| report | 34 | 2,033 | 2 |
| courier_1 | 1,552 | 114,817 | 0 |
| courier_2 | 4,899 | 374,462 | 0 |
| nimbusrom | 223 | 13,034 | 38 |
| nimbus791 block (11 docs) | 5,028 | 356,577 | 0 |
| **total** | **33,736** | **2,436,238** | **40** |

56 s. All 40 □ are accounted for: 2 in `report` and 38 in `nimbusrom` (its red
footer legend and the P1 seal graphic — non-text ink the reader correctly
refuses to guess at).

The 11 `nimbus791` documents also carry truth transcripts, and every one of
them matches **every row, including spacing** — 5,028 of 5,028 rows
letter-exact and space-exact, 0 rows differing.

## Re-recording

Only after an **intended** output change, and say what changed:

```bash
node tools/gate.mjs --out fixtures/gate-ref --ref none
```

## What this reference has already caught

**Dropping the headless-Chrome rasterizer was not free** (2026-07-26). The
predecessor repo rastered pages with Chrome + pdf.js; this repo has only
`tools/rasterize-mupdf.mjs`, which decodes the producer's embedded page image
instead of rendering it. That path was certified on `courier_1`'s 25 pages
only, and the plan of record insisted it be measured on all of them before the
Chrome path was deleted. It was, and it moved two documents:

- **`nimbusrom` broke outright** — 223 lines / 13,034 glyphs / 38 □ became
  203 / 4,957 / **472 □**. Cause: mupdf emitted a mode-2 raster (R+G+B sums
  only) where Chrome had emitted mode 3 (sums **plus** a per-pixel channel
  spread plane). Without the spread plane the reader falls back to the legacy
  "sum ≡ 0 (mod 3)" colour test, which floods whole letters white. Fixed by
  teaching the mupdf writer to emit mode 3; the document then reproduced
  exactly.
- **`email` gained one glyph** — 113,599 → 113,600, still 0 □. The mode-3
  raster recovers a comma on P36 (`…by e-mail to <redacted>,`) that the legacy
  colour flood had erased. This is the one place the reference was
  deliberately re-recorded: a strictly better raster reading one more real
  character, at tolerance 0.

The other five documents were byte-identical through the change, and
`report` is unaffected — it has no PDF at all, only a surviving page raster.

Net: Chrome is gone, no transcript was lost, and the repo has one rasterizer.
