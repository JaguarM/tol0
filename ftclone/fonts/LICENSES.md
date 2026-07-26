# The only font binaries in this repo

Everything here exists so that `npm run certify:ftclone` runs on a clean clone
with no system fonts and no corpus. Both files are redistributable; nothing else
may be added to this directory without recording its licence below.

| file | face | licence |
|---|---|---|
| `Carlito-Regular.ttf` | Carlito (Łukasz Dziedzic) | SIL Open Font License 1.1 |
| `NimbusMonoPS-Regular.cff` | URW Nimbus Mono PS | URW++ base-35 release, GPL with the font exception (the same font Ghostscript and mupdf embed as builtin `Courier`) |

`.gitignore` blanket-ignores `*.ttf` / `*.otf` / `*.cff` and excepts only this
directory. That is deliberate: the previous repo committed 431 MB of Microsoft
CJK fonts before the ignore rule was added, and ignoring a path does not untrack
what is already in the index.

**Everything else is referenced, never shipped.** Hunts and `fontgen` read the
user's own installed fonts from system paths. This also keeps the repo honest
about reproducibility: byte-exact results depend on the exact font *build*, and
this project has hit that wall twice — Calibri 1.02 vs the installed 6.2x, and a
DejaVu Serif build differing in `t` and `D` alone.

Exact licence texts are not vendored yet — see open question 3 in the plan
(`docs/` once the plan moves over).
