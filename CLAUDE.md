# Working in this repo

A toolkit for reading government documents at **tolerance 0**: it re-renders
candidate glyphs with a byte-exact clone of the producer's rasterizer and
demands the pixels match *exactly*. A successful read carries a certificate;
unread ink becomes an honest `□` with coordinates. Half the code is the reader,
half is machinery for identifying a document's **(face, size, pen lattice,
blend law)** from pixels alone.

Start at [README.md](README.md). Then open whichever file owns the *kind* of
fact you need:

| | |
|---|---|
| [docs/LAWS.md](docs/LAWS.md) | measured physics — pen lattice, blend, producer post-laws, colour |
| [docs/METHOD.md](docs/METHOD.md) | how this kind of problem is worked: eight rules |
| [docs/FONTS.md](docs/FONTS.md) | what ships, what you regenerate, and why |
| [fixtures/gate-ref/README.md](fixtures/gate-ref/README.md) | the gate's expected numbers, and all 32 □ one by one |
| [lab/README.md](lab/README.md) | the hunt half — finding a producer nobody has identified |
| [lab/rust/README.md](lab/rust/README.md) | the lab's fast engine and its certification chain |

**The documentation is deliberately these files and no more.** A new fact goes
in the one whose kind it is, or in the code comment that owns it — not in a new
document. `docs/PLAN.md` is cancelled, not deferred. `lab/` is ten files plus
`rust/` and stays that shape: a new tool needs to justify itself against the
one already there. (The ninth, `transform.mjs`, earned it — a producer's
TRANSPORT law is a fifth identity axis the other eight had nowhere to put, and
it is the reproducer for the `dejavuserif786law` pool's font. The tenth,
`resample.mjs`, is the pre-hunt triage: it tells a resampled page from a 1×
render, per axis and with built-in positive controls, before a sweep burns
hours proving no face can match one.)

## Two rules that override everything else

1. **Page pixels are the only ground truth.** Every written constant — in a
   doc, a comment, this file — is a *copy*. Re-measure before building on it.
2. **When a measurement refutes something written anywhere, fix that file in
   the same session and say what it supersedes.**

These are [METHOD.md](docs/METHOD.md) rule 1 applied to the repo itself, and
they are the reason `ftclone/certify.mjs` re-measures the pen lattice on every
run instead of asserting the number someone wrote down.

## The gates

All of these must be green when you finish. The first four need nothing
installed but Node (`rust:certify` also wants cargo); the rest need documents or
fonts this repo cannot ship, and they **skip loudly** rather than passing.

```bash
npm run certify:ftclone   # CERTIFIED TTF + CFF, 0 diffs over 1128 renders each
npm test                  # 6 pass + 27 pass, ~45 ms
npm run gate:synth        # SYNTHETIC GATE CERTIFIED, 19 assertions, ~1.2 s
npm run rust:certify      # 13 assertions, ~2.4 s   (after: npm run rust:build)

npm run glyph-sets:verify # 13 shipped sets reproduce byte-identically
npm run glyphs-check      # glyphs.bin ⇔ 77 npz sets
npm run gate              # 18/18 BYTE-IDENTICAL, 2,436,253 glyphs, 32 □, ~55 s
npm run lab:selftest      # a whole hunt on a known answer, 11 assertions, ~60 s
npm run sync:recto:check  # "Recto is in sync", exit 0
```

**A byte-identical regression gate beats a suite of assertions.** The expected
numbers *are* the files in `fixtures/gate-ref/`, not prose — any change in any
number is the signal. Skipping is not a pass.

## Traps, each of which cost real time

- **Pen y is rounded to the nearest INTEGER, not snapped to ½ px.** The
  "8 snap phases" is really 4. `certify.mjs` re-measures this every run and
  prints `x 5 … y 2`; the `y-phase 32/64` row is *expected* to differ.
- **Never "fix" a gate diff by regenerating a glyph set.** Every
  `phasesY: '0,0.5'` set differs from its committed bytes — 7 of 7 measured —
  because those legacy rasters came from a pipeline that rounded pen y and
  shifted. The diff is not the bug you are looking for.
- **26 sets use a non-default `--chars` list** (one contains an apostrophe) and
  a wrong list silently changes bundle bytes rather than failing. Always
  regenerate through `fontgen --set <name>`, never by hand-writing flags.
- **6 sets can never be reproduced** — they are cut from document pixels
  (`PROVENANCE` src `page-cut`). Only the `calibri` pool needs them.
- **Fonts install PER USER as well as globally.** `C:/Windows/Fonts` is half
  the machine; the rest is `%LOCALAPPDATA%/Microsoft/Windows/Fonts`. This gap
  has cost two hunts. Both directories, always — and treat every elimination as
  provisional until you can name what it enumerated ([METHOD](docs/METHOD.md)
  rule 3).
- **`rasterize-mupdf.mjs` emits raster mode 3** (sums + channel-spread plane)
  for any multi-component image, and that is load-bearing: mode 2 collapses one
  gate document from 38 □ to 472. Chrome/pdf.js is gone and stays gone.
- **`sync:recto` refuses an incomplete `glyphs.bin`.** That guard is
  load-bearing — the gate reads through *named pools* and can never catch a
  bundle that silently shrank the app's dictionary.
- **Six blend-law names, four distinct maps**: `fzLin` ≡ `fzLin254` ≡ `mid` on
  all 256 coverages. Searches iterate `families.mjs` `LAW_NAMES`; `identify`
  still keys `LAWS` by name so a family can cite the law it was proven under.
- **Harvest drops cells whose ink RUN CROSSES a boundary**, not cells whose ink
  *touches* the border — 61 of 126 windows touch without being clipped.
- **The working tree is LF** (`.gitattributes`). This repo's premise is
  byte-comparison; git must never rewrite a byte it was not asked to.

## The assertion to never weaken

`lab:selftest`'s third check and `rust:certify`'s decoy check are the same
rule: every family — every face — *other* than the right one must score **flat
zero**. Exactness cannot false-positive, so a single stray hit means the exact
test has a hole in it and every verdict the lab has ever given is suspect.

Relatedly: **tolerance is part of the proof, never a knob.** Loosening it to
make a new document read invalidates the family. If a page needs more slack,
justify it with a documented producer law or do not claim it.
