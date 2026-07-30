---
description: Run the full verification ladder and report pass/fail plainly
---

Run the ladder in this order — cheapest first, so a break is found in seconds
rather than after a minute of gate:

```bash
npm run certify:ftclone   # CERTIFIED TTF + CFF, 0 diffs over 1128 renders each
npm test                  # 6 pass + 27 pass, ~45 ms
npm run gate:synth        # SYNTHETIC GATE CERTIFIED, 19 assertions, ~1.2 s
npm run rust:certify      # 13 assertions, ~2.4 s   (needs: npm run rust:build)
npm run glyph-sets:verify # 13 shipped sets reproduce byte-identically
npm run glyphs-check      # glyphs.bin ⇔ 77 npz sets
npm run lab:selftest      # a whole hunt on a known answer, 11 assertions, ~60 s
npm run gate              # 18/18 BYTE-IDENTICAL, 2,436,253 glyphs, 32 □, ~55 s
npm run sync:recto:check  # "Recto is in sync", exit 0
```

Report each line as PASS or FAIL with the number it produced. Rules for the
report:

- **A skip is not a pass.** Several of these skip loudly when a document or a
  font is absent. Say "skipped, N of M documents" — never fold it into a pass.
- **Quote the numbers, do not summarise them.** "18/18, 2,436,253 glyphs, 32 □"
  is the result; "the gate passed" is not. A changed number is the entire point
  of a byte-identical gate.
- If something fails, show the first differing line and stop — do not run the
  rest hoping it recovers, and do not "fix" a glyph-set diff by regenerating
  the set (see CLAUDE.md).
