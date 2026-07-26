# Fonts and glyph sets — what ships, what doesn't, and why

Short version: **this repo ships every font and glyph set it is allowed to ship,
and tells you exactly how to rebuild the rest from your own machine.** On a
fresh clone you get 13 of 75 glyph sets. That is not an oversight.

## Why a glyph set is not just data

The reader works by re-rendering candidate glyphs and demanding the pixels match
the page exactly. Those candidates live in `assets/fonts/*.npz` — one file per
(face, size, pen-phase, blend-law) config, holding the rasterized bitmaps of
every character.

A `.npz` is therefore **a set of rasterized bitmaps of a typeface**. It inherits
that typeface's licence. Shipping the rendered bitmaps of Arial is not
meaningfully different from shipping `arial.ttf`, so this repo does neither.

The previous incarnation of this project learned that the expensive way: 431 MB
of Microsoft CJK font binaries were committed before the ignore rule was
written, and *gitignoring a path does not untrack it*. This repo starts clean and
guards the boundary with a blanket ignore on `*.ttf` / `*.otf` / `*.cff` /
`*.npz`, plus two narrow exceptions.

## The four classes

Every set's origin is recorded in `PROVENANCE` in
[../tools/glyph-registry.mjs](../tools/glyph-registry.mjs), extracted from each
`.npz`'s own metadata — so it records what was actually generated, not what
someone claimed.

| class | n | ships? | how you get it |
|---|---|---|---|
| `free` | 13 | **yes** | already here; face is in `fonts/` |
| `system` | 47 | no | regenerate from your own stock system font |
| `build` | 9 | no | needs one *specific* font build, not the current install |
| `corpus` | 6 | **never** | cut from document pixels — no reproduction path |

```bash
node tools/glyph-sets.mjs            # what you have and what you don't
node tools/glyph-sets.mjs --plan     # the exact command for each missing set
node tools/glyph-sets.mjs --verify   # prove the shipped 13 rebuild byte-exactly
```

### free — and provably so

The 13 shipped sets derive from URW Nimbus (Roman, Sans, Mono — the base-35
faces Ghostscript and mupdf embed) and DejaVu Serif. Both are redistributable,
and both source faces are in [`fonts/`](../fonts), so these sets are reproducible
from scratch rather than taken on trust:

```
$ node tools/glyph-sets.mjs --verify
ok     nimbus791              79655 bytes
...
13 shipped set(s) reproduce byte-identically from fonts/.
```

That command re-renders each set through `fontgen` and byte-compares the bundle
payload — the bytes the engine actually reads. It is the same recipe `--plan`
prints, so what is verified is the documented path, not a private one.

Two certified family read commands (`nimbus791`, `nimbusromCourt`) consist
entirely of free sets, so they work on a fresh clone.

### system — regenerate from your own fonts

47 sets come from stock fonts you already have if you are on Windows: Arial,
Times New Roman, Courier New, Tahoma, Segoe UI, Calibri, Cambria, Georgia,
Verdana, Century Schoolbook.

```bash
node tools/fontgen.mjs --set cour13 --font C:/Windows/Fonts/cour.ttf
```

Pass `--set` and everything else — em64, pen phases, the blend law, and the
exact character list — comes from the registry. That matters more than it
looks: **26 sets were generated with a non-default character list**, and a set
built with the wrong one silently produces different bundle bytes rather than
failing. (One of those lists contains an apostrophe, which is also why `--plan`
does not try to spell them out on a command line.)

#### …and a regenerated legacy set will not match the original bytes

Measured 2026-07-26, and `--plan` now says so on each affected line. Every set
recorded with `phasesY: '0'` regenerates byte-identically. **No set recorded
with `phasesY: '0,0.5'` does** — 7 of 7 tried differ, and the difference is
confined to the ½-phase half: all 684 y-phase-0 rasters of `times16` and all
428 of `cour13` match bit for bit, and every single ½-phase raster does not.

That is not fontgen misbehaving. Those ½-phase rasters are artifacts of the
older pipeline, which **rounded pen y to an integer and shifted the result** —
which is what mupdf itself does (`fillText` at y=28.5 is byte-identical to
y=29). `fontgen` places a true 1/64 pen, so it renders what a ½-px pen would
actually look like, and the two disagree by construction.

What it costs was measured on the gate rather than reasoned about. With all 7
regenerated sets swapped in, **all 18 gate transcripts stay byte-identical
across 2.44 M glyphs**; the only change is that lines pinned at a ½ phase
report their baseline 1 px lower, moving 13 coordinate labels in two summaries.
So: a regenerated set reads the same text, and you should regenerate. What you
do not get back is the `.npz` bytes — which is why the gate ships its reference
transcripts rather than trusting anyone's set to be identical.

One thing is measured but *not* explained: `timesilin16` also differs in 82 of
its 428 y-phase-0 rasters (`timesbdlin16` in 11, `timeslin16` in 6), bounding
boxes off by a pixel at particular x-phases. No y-rounding story accounts for
that, and no gate document exercises those glyphs. It is open, not cleared.

### build — a specific font build, not just a font

9 sets need a *particular* build of a font, and substituting the version you
have installed will not reproduce them:

- **Calibri 1.02** (`calibri-jondot.ttf`) — the installed 6.2x has different
  drawings. This is not pedantry; it was the difference between a family reading
  and not reading.
- **Cambria (Win11 build)**, **`TimesNewRoman8.ttf`**.

`TimesNewRoman8` is worth singling out, for a reason that is really about
searching rather than about fonts. It was first written off as lost — "no copy
on this machine" — because the search was `C:/Windows/Fonts`. Windows also
installs fonts **per user**, and it was sitting in
`%LOCALAPPDATA%/Microsoft/Windows/Fonts/TimesNewRoman8_Clean.ttf` the whole
time. *"No font matches" is a statement about your roster, not about the
world*; this project has now paid for that lesson twice.

Finding it turned up two errors in the recipe, which is the other half of the
point — an unreproducible set hides its own bugs:

- `tnr8lin10`'s em64 is **682, not the 683** on record. At 683, 404 of 428
  y-phase-0 rasters differ from the original; at 682, 30 do.
- Its advances need the **unquantized** size. `report.pdf`'s body is 8 pt at
  96 dpi, so the raster matrix truncates to em64 682 while every advance is a
  multiple of ~10.6666. `fontgen` derived `SIZE_PX = EM64/64` and so could not
  express that pair at all — every one of the 107 advances came out wrong by up
  to 0.011 px. `--size` now keeps the size it is given and truncates only the
  matrix.

With both fixed, all three `tnr8` sets regenerate and `report` reads
byte-identically from them.

A footnote that says something about `build` as a class: compared against stock
`C:/Windows/Fonts/times.ttf`, these sets differ in **16 of 856 rasters — the
characters `<` and `~`, nothing else**, with identical advances. `report`
contains neither character, so it reads byte-identically from stock Times as
well. The build genuinely matters; it just happens not to matter *here*, and
the only way to know which is true is to render both.

The build is part of the proof. This project has hit the same wall from the
other side with DejaVu Serif: `dejavuserif786` is the right face in a build
whose `t` and `D` differ, which is exactly why that set reads at tol 4 rather
than tol 0 and carries no certified pool.

### corpus — no reproduction path

6 sets (`bullet16`, `bullet16b`, `bulleto16`, `fedline_page`, `ftrfouo_page`,
`hdrles_page`) were not rendered from a font at all. They were cut from the
pixels of two source documents. They cannot be shipped and cannot be
regenerated without those documents. `fontgen --set` refuses them with that
explanation rather than producing something wrong.

They are only needed by the `calibri` pool.

## Consequences you should expect

- `glyphs.bin` is built from whatever sets you have, so it is a **per-machine
  artifact** and is gitignored. Build it with `node tools/export-glyphs.mjs`.
  `--check` compares it against your own `.npz`, not a committed reference.
- Most certified family pools need `system`-class sets, so on a fresh clone most
  of them cannot run until you regenerate. `node tools/glyph-sets.mjs --plan`
  is the todo list. The gate says the same thing document by document: it
  **skips loudly**, naming the missing set or fixture, and never prints a green
  line for something it did not read. The 11-document `nimbus791` block is the
  exception worth knowing about — its pool is entirely free, so it runs on a
  fresh clone with no system font at all (given the documents).
- `npm test` asserts every `free` set is present and makes **no** assertion
  about the others — a fresh clone is expected to be missing 62 sets, and that
  must not read as a failure.

## The honest caveat

Byte-exact results depend on the exact font build on your machine. Two people
running `--set cour13` against different Courier New revisions can legitimately
get different bytes, and the toolkit will tell you so by refusing to read at
tolerance 0 rather than quietly approximating. That is the design working, but
it does mean "regenerate it yourself" is a weaker guarantee than "it ships
here" — which is why the free 13 are verified byte-for-byte and the rest are
not.
