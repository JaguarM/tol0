---
description: Identify the producer of a document nobody has read yet — the lab runbook
---

Argument: a PDF path (or a document already ingested under `lab/pages/`).

Read [lab/README.md](../../lab/README.md) first — it is the runbook and it is
current. This command is the order to try things in, and the discipline about
what each answer is worth.

## The order, cheapest first. Stop as soon as something answers.

```bash
node lab/mbank.mjs scan <pdf>              # 1. ~100 ms — face and size, cold
node lab/ingest.mjs <pdf>                  # 2. the producer's own page rasters
node lab/harvest.mjs --doc <DOC> --out h1  #    monospace: fitted cell lattice
./lab/rust/target/release/hunt.exe harvest --doc <DOC> --out h1   # proportional
node lab/identify.mjs --targets h1         # 3. every answer we already have
node lab/identify.mjs --targets h1 --scan <face.ttf>   # 4. right face, unknown size
node lab/sweep.mjs --targets h1 --fonts all            # 5. the exhaustive net
./lab/rust/target/release/hunt.exe sweep --targets h1 --fonts all   # 5. at 40-45×
```

**Pick the right harvester.** `lab/harvest.mjs` fits a monospace cell lattice;
on a proportional face it emits byte-identical *fragments* cut at a pitch
nothing uses, and matching against them proves nothing. `hunt harvest` cuts
connected ink and needs no lattice — that is the general one.

## What each answer is worth

- **`mbank scan` names a FACE, not a producer.** It matches 4 px of one `m`. A
  named face whose document then refuses to read is normal and is information:
  the producer applies a post-law, or it is a different producer using the same
  face (see the `tahoma704-descenders` entry in `lab/families.mjs`).
- **Ties are often the answer, not an ambiguity** (METHOD rule 6). Two faces at
  the same size usually means the page really carries both — or that the faces
  are the same pixels. Check the second possibility first, it costs one render
  loop: Verdana ≡ MS Reference Sans Serif, 376/376 rasters identical.
- **`sweep` ranks; `identify` decides.** Sweep compares the tight ink crop,
  identify compares the whole window including white margins and the border.
  Confirm a sweep winner with identify before believing it.
- **"No face matches" is a statement about your ROSTER** (METHOD rule 3). Say
  what you enumerated. Both font directories, always — `C:/Windows/Fonts` is
  half the machine.
- **Tolerance is part of the proof, never a knob** (METHOD rule 5). If a page
  needs slack, name the documented producer law that grants it (`jpeg-jitter`,
  `palette-quant` in `lab/families.mjs`) or do not claim the read.

## When it closes

The answer leaves the lab: add the entry to `lab/families.mjs` **citing the
document and the number that proves it**, never a prose file. Then build the
set with `tools/fontgen.mjs`, add a pool to `tools/glyph-registry.mjs`, and let
`npm run gate` hold it still.

**A pool is a proven recipe.** If the document does not read clean, record the
finding as a `renderable: false` entry saying exactly what is open, and do not
add a pool yet.
