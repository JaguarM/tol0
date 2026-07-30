# gate-ref — the expected numbers

These files **are** the expected output. `npm run gate` re-reads every gate
document and byte-compares its whole transcript (`<name>.txt`) and its counts
(`<name>.summary`) against the file next to this one. There is no assertion to
tune and no threshold to argue about: any change in any number is the signal.

Recorded 2026-07-26 (step 4 of the port); `nimbusrom` re-recorded 2026-07-30
after the `tnrbdlin1024` set closed its P5 heading tail (+15 glyphs, −8 □; the
other 17 documents stayed byte-identical through the change). 18 documents:

| | lines | glyphs | □ |
|---|---:|---:|---:|
| v3 | 1,785 | 122,883 | 0 |
| big | 18,307 | 1,338,832 | 0 |
| email | 1,908 | 113,600 | 0 |
| report | 34 | 2,033 | 2 |
| courier_1 | 1,552 | 114,817 | 0 |
| courier_2 | 4,899 | 374,462 | 0 |
| nimbusrom | 223 | 13,049 | 30 |
| nimbus791 block (11 docs) | 5,028 | 356,577 | 0 |
| **total** | **33,736** | **2,436,253** | **32** |

~55 s — the one number here that is *not* compared, because it is the machine's,
not the reader's. The 11 `nimbus791` documents also carry truth transcripts, and every one
of them matches **every row, including spacing** — 5,028 of 5,028 rows
letter-exact and space-exact, 0 rows differing.

## The 32 □, one by one

A □ is ink the reader refused to guess at, so the count is only meaningful if
someone has looked at what is under it. Censused from page pixels 2026-07-26;
re-censused 2026-07-30 after the P5 heading closed. **16 of the 32 are ordinary
black text** — this is unfinished reading, not inherently unreadable ink, and
the older record said otherwise (below).

`report` — **2**

- **1 glyph: a `b`** at baseline y313, column 229 (`…1843kb4f‸e4d30c69…`). It
  reads at `--tol 1` and at no cost elsewhere, so it misses by a single byte.
  It sits where the preceding `f`'s top hook overhangs the `b`'s stem — the
  reader accepted that `f` with 3 pixels still pending — so this is the known
  AA-overlap ±1 at a composite junction, not an unknown glyph.
- **1 band** at y≈996: an 18-glyph footer of digits in a face the `linear` pool
  does not contain. Raising tolerance does **not** find it — at `--tol 16` it
  decays into `"......   . ..'  ..'....."`, which is what a *wrong face* looks
  like, as opposed to a close one. It needs an identification, not slack.

`nimbusrom` — **30** (38 until 2026-07-30)

| where | □ | what the pixels say |
|---|---:|---|
| P1 y131, y152 | 10 | letterhead clusters beside the DOJ seal — genuinely **coloured**: 111–180 of each cluster's ~200 ink px have channel spread up to 117 |
| P1 bands y158/179/188/948 | 4 | bands containing the seal graphic and the P1 footer. Charged per band, and the band really does contain a graphic — but each also carries ~1,100 px of *neutral* ink surviving colour-whitening (x86–350), i.e. real text rides along |
| P2–P12 band y982 | 11 | **the correction.** The red legend is there (1,345 coloured px) and is whitened away exactly as designed. What blocks the read is a *separate* **1,276 px of neutral black text**, x96–719, in an unidentified face |
| ~~P5 y745~~ | ~~8~~ | **CLOSED 2026-07-30**: the heading *tail* `("DRY CELL" STATUS)` was the REAL Times New Roman **Bold** embedded subset — `timesbd.ttf` em64 1024, fzLin254 + palette, now pool set `tnrbdlin1024` (`lab/families.mjs` `tnrbdlin1024`). The left half had always read via `nimbusrombdlin1024`; two faces on one line, METHOD rule 6 |
| P10 y830 · P12 y301, y343, y407 | 5 | in-text clusters on ordinary body lines — neutral, spread 0. Diagnosed 2026-07-30: **4 are single-pixel ±1 misses** (the `0` of `10.3`, two `0`s of `4-ALDF-…` codes, one on P10 — glyph raw alpha one level off the producer's at one pixel; each reads at `--tol 1`, sign opposite the documented junction ambiguity, suspect legacy-era rasterizer conic) and **1 is the superscript `th`** of `4ih Edition` (~0.6× size, face/size not yet pinned) |

**What this supersedes.** `char_training`'s `ocr/FINDINGS-nimbusrom.md` says
"every remaining □ being the red footer legend or the P1 seal graphic". That
holds for the 10 coloured letterhead clusters and is defensible for the 4 P1
bands, but it was wrong for the other 24: 11 footer bands whose blocking ink is
neutral rather than red, and 13 in-text clusters the census never mentioned at
all. Those 24 were unread *text*. 8 of them (the P5 heading tail) closed
2026-07-30 as `tnrbdlin1024`; the honest remaining targets are the 11 footer
bands (face still unidentified — `tnrbdlin1024` in the pool did NOT read them)
and the 5 diagnosed in-text clusters above.

The distinction matters because it changes what to do. Colour and graphics are
correctly refused and always will be. Neutral unread text means a face is
missing from the pool — which is a hunt, and a winnable one.

## Re-recording

Only after an **intended** output change, and say what changed:

```bash
node tools/gate.mjs --out fixtures/gate-ref --ref none
```

## What this reference has already caught

**Dropping the headless-Chrome rasterizer was not free** (2026-07-26). Swapping
in `rasterize-mupdf.mjs` — certified on `courier_1`'s 25 pages, and measured on
all 18 documents before Chrome was deleted — moved exactly two:

- **`nimbusrom` broke outright**, 223 lines / 13,034 glyphs / 38 □ becoming
  203 / 4,957 / **472 □**, because mupdf wrote a mode-2 raster where Chrome
  wrote mode 3 ([../../docs/LAWS.md §5](../../docs/LAWS.md#5-colour-and-why-the-raster-mode-is-not-a-detail)).
  Fixed in the writer; the document then reproduced exactly.
- **`email` gained one glyph** — 113,599 → 113,600, still 0 □: a comma on P36
  (`…by e-mail to <redacted>,`) that the legacy colour flood had erased. This is
  the one place the reference was deliberately re-recorded — a strictly better
  raster reading one more real character, at tolerance 0.

The other five of those seven were byte-identical through the change — `report`
trivially so, since it has no PDF at all, only a surviving page raster. (The 11
`nimbus791` documents were rastered by mupdf from the start.) Net: Chrome is
gone, no transcript was lost, and the repo has one rasterizer.
