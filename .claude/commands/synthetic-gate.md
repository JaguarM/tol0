---
description: The open design task — a page whose transcript is known, built with no corpus pixels
---

This is the repo's one substantial open piece of design, and the only thing
stopping a stranger from running the reader at all.

## The state of it

Three gates already run on a fresh clone with no corpus and no system font,
because their inputs are **drawn** rather than harvested:

- `npm run certify:ftclone` — renders through mupdf and through `ftclone/`, and
  compares; the codepoint list is a literal and the faces are in `fonts/`.
- `npm test` — synthetic pages built in the test file itself.
- `npm run rust:certify` — control targets and a whole harvest page drawn by
  `ftclone/`, then read back. **Look at `lab/rust/certify.mjs` first**: it is
  the nearest thing to a worked example, and its harvest page (a real PGM with
  a real `words.json` overlay, laid out at a fixed advance) is roughly a third
  of what this task needs.

`npm run gate` is the one that cannot: all 18 documents are real government
PDFs, `fixtures/corpus/` is gitignored, and most pools need glyph sets whose
faces are not redistributable. A fresh clone runs **0 of 18** and says so per
document.

## What has to be built

A page whose transcript is known by construction, exercising what the reader
actually does — not just glyph rendering:

1. **ink bands** — several lines with realistic leading, including two that
   nearly touch, since band splitting on blank rows is the first thing that can
   go wrong;
2. **baseline pin** — at least one line on a ½-px baseline, because the reader
   tries integer *and* ½-px y-phase and the wrong pin is a silent whole-line
   failure;
3. **word spacing** — gaps the reader must self-calibrate from the histogram
   rather than be told (`docs/LAWS.md`, and the 7.4077 px example in README);
4. **a non-text object** — a rule or a filled box, so object detection is
   exercised and the □ accounting means something;
5. **the certificate** — `"fails": 0` on every band, and a truth file the read
   is diffed against, letter- and space-exact.

Then it becomes a `npm run gate`-shaped check that needs no fixtures.

## The rules that constrain it

- **Draw with `ftclone/` and the faces in `fonts/`.** Anything else
  reintroduces the corpus or a system-font dependency, which is the regression
  this whole task exists to remove.
- **The reader must not be told anything the real reader is not told.** No
  layout constants, no baseline hints, no advance table. If the synthetic page
  is easier than a real one, it proves less than the gate it is standing in for
  — say so plainly rather than claiming parity.
- **It does not replace the corpus gate.** Both run; the corpus gate stays the
  authority on real producers. Keep `fixtures/gate-ref/` exactly as it is.

Finish with the gates green and a commit.
