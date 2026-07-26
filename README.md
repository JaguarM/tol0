# tol0

**Read government documents at tolerance 0 — every line certified, never sampled.**

This is not fuzzy OCR. It **re-renders** candidate glyphs with a byte-exact clone
of the producer's rasterizer and demands the pixels match *exactly*. When they
do, the read comes with a **certificate**: every non-object ink pixel of the line
was explained by the proven blend law, so the transcript is not a guess. Unread
ink becomes an honest `□` with coordinates — errors cannot pass silently.

The honest limit is the same sentence: a document that will not read at
tolerance 0 is one this toolkit says **no** to, loudly, rather than guessing at.

To read a document this way you must first know its **(face, size, pen lattice,
blend law)** — so the other half of the toolkit is machinery for identifying that
tuple from pixels alone.

## Where to read next

| | |
|---|---|
| [docs/LAWS.md](docs/LAWS.md) | the measured physics every claim rests on — pen lattice, blend, producer post-laws, colour |
| [docs/METHOD.md](docs/METHOD.md) | how this kind of problem is worked: eight rules that cost real time |
| [docs/FONTS.md](docs/FONTS.md) | what ships, what you regenerate, and why a fresh clone has 13 of 75 glyph sets |
| [fixtures/gate-ref/README.md](fixtures/gate-ref/README.md) | the gate's expected numbers, and all 40 □ looked at one by one |

## What runs with nothing installed

```bash
npm install
npm run certify:ftclone   # the rasterizer clone vs the real mupdf
npm test                  # engine primitives on synthetic pages (~40 ms)
```

```
pen lattice, measured now: x 5 distinct rasters per px (4 phases of 1/4 px + the 1-px shift), y 2 (integer rounding — no subpixel y)

CERTIFIED TTF y-phase  0/64 — 0 diffs over 1128 renders
CERTIFIED CFF y-phase  0/64 — 0 diffs over 1128 renders
```

Neither needs a PDF, a corpus document, or a system font — a deliberate
constraint, not a convenience. `ftclone/` is a JS port of the glyph pipeline
inside **mupdf 1.28 wasm** (FreeType 2.13 smooth rasterizer, integer 26.6
throughout); everything else depends on it, so it certifies itself against the
real thing, in two pipelines that share almost no code below the outline.

## A read, end to end

```bash
node tools/rasterize-mupdf.mjs --pdf fixtures/corpus/nimbus791/EFTA00751637.pdf
node tools/blind-read.mjs --pdf fixtures/corpus/nimbus791/EFTA00751637.pdf \
     --page 1 --pool nimbus791 --truth fixtures/corpus/nimbus791/EFTA00751637.txt \
     --json p1.json
```

```
  page 1: 76 bands

76 lines, 4612 glyphs, 0 unreadable clusters (□), 0.4s
vs truth: 76 rows letter-exact (76 also space-exact), 0 rows differ
```

`--pool` names a **certified family read command** — the glyph sets, tolerance
and blend flags that family was actually proven with, taken from
`tools/glyph-registry.mjs` so it cannot drift. `--truth` is a check, not an
input: the reader never sees it.

One line of `p1.json`, which is where the certificate lives:

```json
{ "baseline": 101, "phy": 0, "font": "nimbus791", "fails": 0,
  "text": "Received: by 10.229.235.4 with SMTP id ke4mr6853629qcb.201.1291165934346;",
  "glyphs": [["R", 37.25], ["e", 44.5], ["c", 52], ["e", 59.5], ["i", 66.75], … ] }
```

`"fails": 0` is the claim: every ink pixel of that band was reproduced exactly.
Note the pens — 37.25, 44.5, 66.75. Nobody told the reader that this producer
places pens on a ¼-px lattice; it fell out of the search, and it is
[law §1](docs/LAWS.md#1-the-pen-lattice) turning up in a real document. Word
spacing is measured the same way: the space advance here is **7.4077 px**,
self-calibrated from the gap histogram rather than assumed, which is how narrow
styled spaces become measurements instead of errors.

Reading is not rendering: the rasterizer decodes the producer's own embedded
page image, because rendering would invent pixels and leave nothing to certify
against ([law §7](docs/LAWS.md#7-the-page-is-decoded-never-rendered)).

## The gate

The gate is what makes this repo trustworthy. It re-reads a fixed set of
documents and byte-compares whole transcripts against committed references:
**the expected numbers are the files in `fixtures/gate-ref/`, not prose**, so
any change in any number is the signal.

```bash
npm run gate
```

```
gate: 18/18 ok, 55s total
```

18 documents · **33,736 lines · 2,436,238 glyphs · 40 □**. The 11 `nimbus791`
documents also carry truth transcripts and match **5,028 of 5,028 rows, spacing
included**. All 40 □ have been looked at rather than assumed away — **24 are
ordinary black text**, i.e. a face missing from a pool, which is a hunt and a
winnable one; the rest is colour and graphics the reader is right to refuse.
Census, and what the reference has already caught:
[fixtures/gate-ref/README.md](fixtures/gate-ref/README.md).

The documents are real government PDFs and are not distributed (gitignored
`fixtures/corpus/`), and most pools need glyph sets whose faces are not
redistributable either — so a fresh clone runs 0 of 18, and says so per document,
naming the missing fixture or set. **Skipping is loud, and it is not a pass.**
The `nimbus791` block is the cheap way in: its pool is entirely free.

## Recto — the same bytes, in a browser

[Recto](../Recto) is a Django PDF editor whose `ocr_tool` plugin runs this
engine client-side. It has no copy of the engine; it has *these* files:

```bash
npm run sync:recto           # -> ../Recto/ocr_tool (default; --recto <path>)
npm run sync:recto:check     # report stale, write nothing, exit 1 if stale
npm run recto-test           # end-to-end: Django + headless Chrome + a real upload
```

The direction is the whole point: the engine is developed **only here**, where
the gate can certify it, so a read in the browser is the read the gate proved.
`--check` makes that auditable instead of assumed — it byte-compares and exits
non-zero. Two things the sync refuses to do quietly:

- **push an incomplete `glyphs.bin`.** The bundle holds whatever `.npz` you have
  locally, so a fresh clone would push 13 of 75 sets and swap Recto's dictionary
  for a smaller one with no error and no crash. The gate cannot catch it either
  — it reads through *named pools*, never the whole bundle. So the sync names
  the missing sets and stops (`--allow-partial` if you mean it).
- **let a UI bug hide.** `recto-test` uploads a gate document through the real
  file input and clicks the real buttons; a programmatic call would mask dead
  wiring, and that bug has happened. It is the only thing here that needs a
  browser, which is why `puppeteer-core` is a **devDependency**.

## Layout

```
ftclone/    the rasterizer clone + font parsers — the certified core, self-certifying
engine/     the DOM-free matcher: ink bands, baseline pin, the composite-aware
            scan, object/redaction detection, the per-line certificate
tools/      fontgen · glyph registry/bundle · rasterizer · reader CLI · gate · sync
fixtures/   gate documents (gitignored) + the reference transcripts
fonts/      the source faces this repo may legally ship
docs/       the laws, the method, the font/licence story
```

`engine/` is shared verbatim by the CLI and the browser app, so the scanning
physics has exactly one implementation; `test/engine.test.js` covers it on
**synthetic** pages only — 27 tests, ~40 ms, no assets, which is why they run
before the slow document gate.

## Status

Ported from a larger private working repo, one certified layer at a time.

- [x] **1. ftclone** — the rasterizer clone + font parsers, self-certifying
- [x] **2. engine** — the reader core + unit suite
- [x] **3. glyph pipeline** — registry · bundle · fontgen, with the licence split
- [x] **4. reader CLI + the byte-identical gate** — 18 documents, 2.44 M glyphs;
      Chrome dropped
- [x] **5. `sync:recto`** — this repo is now the source of the engine Recto runs
- [x] **6. docs** — the laws, the method, one worked example
- [ ] 7. `lab/` — the hunt half: identify · sweep · m-bank · families
- [ ] 8. `lab/rust/` — the fast sweep engine, with its own certify gate

Open, and known: a **synthetic gate** (a page whose transcript is known, built
with no corpus pixels) is the one thing that would let a stranger run anything —
`fixtures/gate-ref` proves the reader, but only against documents that cannot be
shipped. Also unsettled: the licence, and whether `ftclone` still certifies
against a *different* mupdf build — i.e. what exactly the compatibility claim is.
